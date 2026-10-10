    const CACHE_KEY = "sueldos_cache_v3";
    const CACHE_MAX_AGE_MS = 5 * 60 * 1000;
    const USER_KEY = "sueldos_user";
    const ACTIVITY_KEY = "sueldos_lastActivity";

    function mapEmpleado(row) {
      return {
        empleado: row.nombre || row.empleado || "",
        sueldoBase: Number(row.sueldo_base != null ? row.sueldo_base : row.sueldoBase) || 0,
        row: row.id
      };
    }

    function mapMovimiento(row) {
      let fecha = row.fecha || "";
      let semana = row.semana || "";
      // Solo el día calendario YYYY-MM-DD (sin parsear como UTC)
      if (fecha) {
        const fm = String(fecha).trim().match(/^(\d{4}-\d{2}-\d{2})/);
        fecha = fm ? fm[1] : String(fecha).slice(0, 10);
      }
      if (semana) {
        const sm = String(semana).trim().match(/^(\d{4}-\d{2}-\d{2})/);
        semana = sm ? sm[1] : String(semana).slice(0, 10);
      }
      // Conservar id original como string (evita perder precisión con bigint)
      const idStr = row.id != null ? String(row.id) : "";
      return {
        fecha,
        empleado: row.empleado || "",
        tipo: row.tipo || "",
        monto: Number(row.monto) || 0,
        notas: row.notas || "",
        semana,
        responsable: row.responsable || "",
        row: idStr,
        id: idStr,
        created_at: row.created_at || row.creado || row.inserted_at || ""
      };
    }

    /** Fecha base del movimiento para reglas de edición (día de negocio o created_at) */
    function fechaBaseMovimiento(m) {
      if (!m) return "";
      const f = soloDia(m.fecha) || (m.created_at ? String(m.created_at).slice(0, 10) : "");
      return f || "";
    }

    /** Admin siempre; empleado: hasta el día siguiente al del movimiento (máx. 1 día después) */
    function puedeEditarMovimiento(m) {
      // Editar: permitido para todos (empleados y admins), sin límite de tiempo
      if (!currentUser || !m) return false;
      return true;
    }

    function puedeBorrarMovimiento(m) {
      // Por ahora solo admin borra directo (empleados: flujo de solicitud pendiente de diseño)
      if (!currentUser || !m) return false;
      return currentUser.rol === "admin";
    }

    function semanaDesdeFecha(fechaStr) {
      const d = new Date((fechaStr || localDateStr(new Date())) + "T12:00:00");
      const daysToAdd = (3 - d.getDay() + 7) % 7;
      d.setDate(d.getDate() + daysToAdd);
      return localDateStr(d);
    }

    async function getAuthHeaders() {
      let token = SUPABASE_ANON_KEY;
      try {
        const { data } = await sb.auth.getSession();
        if (data && data.session && data.session.access_token) {
          token = data.session.access_token;
        }
      } catch (_) {}
      return {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": "Bearer " + token,
        "Content-Type": "application/json",
        "Prefer": "return=representation"
      };
    }

    /** Orden fijo del historial: siempre lo más reciente registrado primero (id / created_at), sin importar fecha de negocio, monto o nombre. */
    function sortMovimientosRecientesPrimero(list) {
      return [...list].sort((a, b) => {
        const idA = Number(a.id ?? a.row) || 0;
        const idB = Number(b.id ?? b.row) || 0;
        if (idA !== idB) return idB - idA;
        const ca = a.created_at || "";
        const cb = b.created_at || "";
        if (ca && cb && ca !== cb) return cb.localeCompare(ca);
        const fa = a.fecha || "";
        const fb = b.fecha || "";
        return fb.localeCompare(fa);
      });
    }

    function guardarCache() {
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({
          empleados,
          movimientos,
          sueldosPagadosDB,
          ts: Date.now()
        }));
      } catch (e) {}
    }

    function cargarCache() {
      try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (!raw) return false;
        const data = JSON.parse(raw);
        if (!data || !data.ts) return false;
        empleados = data.empleados || [];
        movimientos = data.movimientos || [];
        if (data.sueldosPagadosDB) {
          sueldosPagadosDB = data.sueldosPagadosDB;
          sueldosPagadosCargados = true;
        }
        return true;
      } catch (e) {
        return false;
      }
    }

    function aplicarDatosEnPantalla() {
      movimientos = sortMovimientosRecientesPrimero(movimientos);
      renderDashboard();
      renderAhorros();
      if (typeof renderAhorroEspecial === "function") renderAhorroEspecial();
      if (typeof renderCheckboxes === "function") renderCheckboxes();
      renderHistorial();
      renderEmpleados();
      if (typeof llenarFiltros === "function") llenarFiltros();
      if (typeof llenarSelectIndividual === "function") llenarSelectIndividual();
      if (typeof renderPrestamos === "function") renderPrestamos();
      if (typeof renderGastosNegocio === "function") renderGastosNegocio();
      if (typeof renderIngresosNegocio === "function") renderIngresosNegocio();
    }

    async function cargarPerfil(userId) {
      const { data, error } = await sb
        .from("profiles")
        .select("usuario, rol")
        .eq("id", userId)
        .maybeSingle();
      if (error) throw error;
      return data;
    }

    /**
     * Trae TODAS las filas de una tabla, paginando en bloques (Supabase/PostgREST
     * limita cada respuesta, típicamente a 1000 filas). Sin esto, conforme la
     * tabla crece, las consultas sin límite empiezan a recortar filas viejas en
     * silencio y los cálculos (préstamos, sueldos, ahorros) quedarían incompletos.
     */
    async function fetchAllRows(tableName, selectCols, orderCol, ascending) {
      const PAGE = 1000;
      let from = 0;
      let all = [];
      while (true) {
        let q = sb.from(tableName).select(selectCols);
        if (orderCol) q = q.order(orderCol, { ascending: !!ascending });
        const { data, error } = await q.range(from, from + PAGE - 1);
        if (error) return { data: null, error };
        const rows = data || [];
        all = all.concat(rows);
        if (rows.length < PAGE) break;
        from += PAGE;
      }
      return { data: all, error: null };
    }

    async function cargarTodo(showMsg = false, fromCacheFirst = true) {
      if (fromCacheFirst && cargarCache()) {
        aplicarDatosEnPantalla();
        setStatus("Caché local · sincronizando...");
      }
      try {
        setStatus("Cargando...");
        const [empRes, movRes, sueldosRes] = await Promise.all([
          fetchAllRows("empleados", "*", "nombre", true),
          fetchAllRows("movimientos", "*", "id", false),
          fetchAllRows("sueldos_pagados", "semana,empleado")
        ]);
        if (empRes.error) throw empRes.error;
        if (movRes.error) throw movRes.error;
        // sueldos_pagados puede no existir aun -> fallback
        if (sueldosRes.error) {
          console.warn("Tabla sueldos_pagados no existe o sin permiso", sueldosRes.error);
          await cargarSueldosPagados();
        } else {
          sueldosPagadosDB = sueldosRes.data || [];
          sueldosPagadosCargados = true;
        }

        empleados = (empRes.data || []).map(mapEmpleado);
        movimientos = (movRes.data || []).map(mapMovimiento);
        guardarCache();
        aplicarDatosEnPantalla();
        setStatus("Actualizado " + new Date().toLocaleTimeString("es-MX", { timeZone: APP_TZ, hour: "2-digit", minute: "2-digit" }) + " · sync ON");
        if (showMsg) showToast("Datos actualizados");
      } catch (err) {
        console.error(err);
        setStatus("Error al cargar");
        showToast(err.message || "Error al cargar datos", "error");
      }
    }

    async function cargarTodoOptimizado() {
      // versión ligera usada por realtime, sin cache
      try {
        const [empRes, movRes, sueldosRes] = await Promise.all([
          fetchAllRows("empleados", "*", "nombre", true),
          fetchAllRows("movimientos", "*", "id", false),
          fetchAllRows("sueldos_pagados", "semana,empleado")
        ]);
        if (!empRes.error) empleados = (empRes.data||[]).map(mapEmpleado);
        if (!movRes.error) movimientos = (movRes.data||[]).map(mapMovimiento);
        if (!sueldosRes.error) { sueldosPagadosDB = sueldosRes.data||[]; sueldosPagadosCargados=true; }
        guardarCache();
        aplicarDatosEnPantalla();
        setStatus("Sync " + new Date().toLocaleTimeString("es-MX",{timeZone:APP_TZ,hour:"2-digit",minute:"2-digit"}));
      } catch(e){ console.warn("cargarTodoOptimizado", e); }
    }

    // Varias filas cambiando casi a la vez (ej. cuotas masivas, ahorro semanal a 8 personas) disparan
    // un evento de Realtime por fila. Sin agrupar, cada una repetiría el fetch completo de las 3 tablas.
    let _cargarTodoDebounceTimer = null;
    function cargarTodoOptimizadoDebounced() {
      if (_cargarTodoDebounceTimer) clearTimeout(_cargarTodoDebounceTimer);
      _cargarTodoDebounceTimer = setTimeout(() => {
        _cargarTodoDebounceTimer = null;
        cargarTodoOptimizado();
      }, 400);
    }

    function iniciarRealtime() {
      if (realtimeChannel) {
        try { sb.removeChannel(realtimeChannel); } catch(_){}
      }
      console.log("📡 Iniciando Realtime...");
      realtimeChannel = sb.channel('araganes-sync-v2')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'movimientos' }, (payload) => {
          console.log('Realtime movimientos', payload.eventType);
          cargarTodoOptimizadoDebounced();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'empleados' }, (payload) => {
          console.log('Realtime empleados', payload.eventType);
          cargarTodoOptimizadoDebounced();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'sueldos_pagados' }, (payload) => {
          console.log('Realtime sueldos_pagados', payload.eventType);
          if (payload.eventType === 'INSERT') {
            const rec = payload.new;
            if (!sueldosPagadosDB.some(r=>r.semana===rec.semana && r.empleado===rec.empleado)) {
              sueldosPagadosDB.push({ semana: rec.semana, empleado: rec.empleado });
            }
          } else if (payload.eventType === 'DELETE') {
            const rec = payload.old;
            sueldosPagadosDB = sueldosPagadosDB.filter(r=>!(r.semana===rec.semana && r.empleado===rec.empleado));
          } else {
            cargarSueldosPagados();
          }
          renderDashboard();
        })
        .subscribe((status) => {
          console.log('Realtime status', status);
          if (status === 'SUBSCRIBED') setStatus("Conectado · tiempo real");
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            setStatus("Reconectando...");
            setTimeout(()=>iniciarRealtime(), 3000);
          }
        });
    }


    async function hacerLogin() {
      if (!ensureSupabase()) return;
      const email = document.getElementById("login-usuario").value.trim();
      const password = document.getElementById("login-password").value;
      if (!email || !password) return showToast("Escribe email y contraseña", "error");
      console.log("Login attempt", email);

      const btn = document.getElementById("btn-login");
      setButtonLoading(btn, true, "Entrar");

      try {
        const { data, error } = await sb.auth.signInWithPassword({ email, password });
        console.log("Login response", { error, user: data && data.user });
        if (error) {
          showToast(error.message || "Email o contraseña incorrectos", "error");
          return;
        }
        if (!data || !data.user) {
          showToast("No se recibió sesión. Revisa Auth en Supabase.", "error");
          return;
        }
        const profile = await cargarPerfil(data.user.id);
        if (!profile) {
          showToast("Usuario sin perfil. Contacta al admin.", "error");
          await sb.auth.signOut();
          return;
        }
        currentUser = {
          id: data.user.id,
          email: data.user.email,
          usuario: profile.usuario || email,
          rol: (profile.rol || "empleado").toLowerCase()
        };
        // No guardar rol en localStorage (autorización siempre desde DB/sesión)
        localStorage.setItem(USER_KEY, JSON.stringify({
          id: currentUser.id,
          email: currentUser.email,
          usuario: currentUser.usuario
        }));
        touchActivity();
        iniciarApp();
      } catch (err) {
        console.error(err);
        showToast(err.message || "Error de conexión", "error");
      } finally {
        setButtonLoading(btn, false, "Entrar");
      }
    }

    document.getElementById("login-password")?.addEventListener("keydown", e => {
      if (e.key === "Enter") hacerLogin();
    });

    function cerrarSesion() {
      if (realtimeChannel) { try { sb.removeChannel(realtimeChannel); } catch(_){} realtimeChannel=null; }
      stopInactivityWatcher();
      isLocked = false;
      currentUser = null;
      try { sb.auth.signOut(); } catch (e) {}
      localStorage.removeItem(USER_KEY);
      localStorage.removeItem(ACTIVITY_KEY);
      try { localStorage.removeItem(CACHE_KEY); } catch (e) {}
      document.getElementById("lock-overlay").classList.add("hidden");
      document.getElementById("app-screen").classList.add("hidden");
      document.getElementById("login-screen").classList.remove("hidden");
      const bn = document.getElementById("bottom-nav");
      if (bn) bn.classList.remove("is-visible");
      cerrarConfirmacion();
      document.getElementById("login-password").value = "";
      const lockPwd = document.getElementById("lock-password");
      if (lockPwd) lockPwd.value = "";
      const lockErr = document.getElementById("lock-error");
      if (lockErr) { lockErr.classList.add("hidden"); lockErr.textContent = ""; }
    }

    function touchActivity() {
      try {
        localStorage.setItem(ACTIVITY_KEY, String(Date.now()));
      } catch (e) {}
      if (!isLocked) {
        resetInactivityTimer();
      }
    }

    function resetInactivityTimer() {
      if (inactivityTimer) clearTimeout(inactivityTimer);
      if (!currentUser || isLocked) return;
      inactivityTimer = setTimeout(() => {
        bloquearSesion();
      }, INACTIVITY_MS);
    }

    function stopInactivityWatcher() {
      if (inactivityTimer) {
        clearTimeout(inactivityTimer);
        inactivityTimer = null;
      }
    }

    function startInactivityWatcher() {
      stopInactivityWatcher();
      const events = ["click", "keydown", "mousemove", "touchstart", "scroll"];
      events.forEach(ev => {
        document.addEventListener(ev, touchActivity, { passive: true });
      });
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible" && currentUser && !isLocked) {
          // Si al volver la pestaña ya pasó el tiempo, bloquear
          try {
            const last = Number(localStorage.getItem(ACTIVITY_KEY) || 0);
            if (last && Date.now() - last > INACTIVITY_MS) {
              bloquearSesion();
              return;
            }
          } catch (e) {}
          touchActivity();
        }
      });
      touchActivity();
    }

    function bloquearSesion() {
      if (!currentUser || isLocked) return;
      isLocked = true;
      stopInactivityWatcher();
      const sub = document.getElementById("lock-subtitle");
      if (sub) sub.textContent = `Perfil ${currentUser.usuario} · introduce tu contraseña para continuar`;
      const lockPwd = document.getElementById("lock-password");
      if (lockPwd) lockPwd.value = "";
      const lockErr = document.getElementById("lock-error");
      if (lockErr) { lockErr.classList.add("hidden"); lockErr.textContent = ""; }
      document.getElementById("lock-overlay").classList.remove("hidden");
      setTimeout(() => lockPwd && lockPwd.focus(), 100);
    }

    async function desbloquearSesion() {
      if (!currentUser) {
        cambiarPerfil();
        return;
      }
      const password = document.getElementById("lock-password").value;
      if (!password) {
        const err = document.getElementById("lock-error");
        err.textContent = "Escribe la contraseña";
        err.classList.remove("hidden");
        return;
      }
      const btn = document.getElementById("btn-unlock");
      setButtonLoading(btn, true, "Desbloquear");
      const errEl = document.getElementById("lock-error");
      errEl.classList.add("hidden");

      try {
        const email = currentUser.email || currentUser.usuario;
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) {
          errEl.textContent = error.message || "Contraseña incorrecta";
          errEl.classList.remove("hidden");
        } else {
          isLocked = false;
          document.getElementById("lock-overlay").classList.add("hidden");
          document.getElementById("lock-password").value = "";
          startInactivityWatcher();
          showToast("Sesión desbloqueada");
        }
      } catch (err) {
        errEl.textContent = "Error de conexión";
        errEl.classList.remove("hidden");
      } finally {
        setButtonLoading(btn, false, "Desbloquear");
      }
    }

    function cambiarPerfil() {
      cerrarSesion();
    }

    document.getElementById("lock-password")?.addEventListener("keydown", e => {
      if (e.key === "Enter") desbloquearSesion();
    });

    function aplicarPermisos() {
      const isAdmin = currentUser && currentUser.rol === "admin";
      document.querySelectorAll(".admin-only").forEach(el => {
        el.style.display = isAdmin ? "" : "none";
      });

      // Badge chip
      const badge = document.getElementById("user-badge");
      if (badge && currentUser) {
        const inicial = (currentUser.usuario || "?").charAt(0).toUpperCase();
        const rolLabel = currentUser.rol === "admin" ? "Admin" : "Empleado";
        badge.innerHTML = `
          <div class="user-chip-avatar">${inicial}</div>
          <div class="leading-tight text-left">
            <div class="text-white font-medium">${currentUser.usuario}</div>
            <div class="text-gray-500 text-[10px] uppercase tracking-wide">${rolLabel}</div>
          </div>
        `;
      }

      // Tipo por defecto y grid de botones
      if (!isAdmin) {
        setTipo("Adelanto");
      } else {
        setTipo("Bono");
      }

      // Historial: empleado filtra Adelanto / Fiado / Gasto / Ingreso
      const selTipo = document.getElementById("filtro-tipo");
      if (selTipo) {
        if (!isAdmin) {
          selTipo.innerHTML = `
            <option value="">Todos (adelantos, fiados, gastos e ingresos)</option>
            <option value="Adelanto">Adelanto</option>
            <option value="Fiado">Fiado 🍔</option>
            <option value="Gasto">Gasto</option>
            <option value="Ingreso">Ingreso</option>
          `;
        } else if (!selTipo.querySelector('option[value="Bono"]')) {
          selTipo.innerHTML = `
            <option value="">Todos los tipos</option>
            <option value="Bono">Bono</option>
            <option value="Extra">Extra</option>
            <option value="Adelanto">Adelanto</option>
            <option value="Gasto">Gasto</option>
            <option value="Ingreso">Ingreso</option>
            <option value="Prestamo">Préstamo</option>
            <option value="CuotaPrestamo">Cuota préstamo</option>
            <option value="Descuento">Descuento (antiguo)</option>
            <option value="Penalizacion">Penalización</option>
            <option value="Ahorro">Ahorro</option>
            <option value="AhorroEspecial">Ahorro especial</option>
            <option value="Fiado">Fiado 🍔</option>
          `;
        }
      }
    }

