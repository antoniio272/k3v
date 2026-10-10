    // =====================================================
    // LIMPIEZA AUTOMÁTICA DE MOVIMIENTOS ANTIGUOS
    // =====================================================
    // La tabla `movimientos` crece cada semana para siempre; sin límite, cada carga y cada
    // evento de Realtime tiene que traer y procesar más y más filas, y la app se vuelve más
    // lenta con los años. Para mantenerla ágil sin perder ni un dato:
    //   1) Antes de borrar cualquier fila de `movimientos`, se respalda en el proyecto de
    //      auditoría (movimientos_auditoria), que nunca se borra y queda consultable siempre.
    //   2) Solo se tocan tipos que se liquidan semana a semana (Bono, Extra, Adelanto, Gasto,
    //      Ingreso, Descuento, Penalizacion, Fiado, CuotaOmitida) y, en préstamos, solo cuotas
    //      de préstamos YA liquidados. Nunca se tocan Ahorro/AhorroEspecial/RetiroAhorro/
    //      RetiroAhorroEspecial ni cuotas de préstamos en curso, porque esas vistas suman TODO
    //      el historial para mostrar el capital/saldo acumulado — borrarlas cambiaría esos
    //      totales silenciosamente.
    //   3) Solo revisa una vez al mes como máximo (no en cada carga de página).
    const RETENCION_MOVIMIENTOS_MESES = 6;
    const TIPOS_NO_PURGABLES = new Set(["Ahorro", "AhorroEspecial", "RetiroAhorro", "RetiroAhorroEspecial"]);
    const PURGA_CHECK_KEY = "araganes_ultima_revision_purga";
    const PURGA_INTERVALO_MS = 30 * 24 * 60 * 60 * 1000;

    async function purgarMovimientosAntiguos() {
      if (!currentUser || currentUser.rol !== "admin") return;
      try {
        const last = Number(localStorage.getItem(PURGA_CHECK_KEY) || 0);
        if (last && (Date.now() - last) < PURGA_INTERVALO_MS) return;

        const cutoff = nowEnAppTZ();
        cutoff.setMonth(cutoff.getMonth() - RETENCION_MOVIMIENTOS_MESES);
        const cutoffStr = localDateStr(cutoff);

        const prestamosActivos = new Set(
          resumenPrestamos().filter(r => r.enCurso).map(r => String(r.prestamoId))
        );

        const candidatos = (movimientos || []).filter(m => {
          if (TIPOS_NO_PURGABLES.has(m.tipo)) return false;
          const f = soloDia(m.fecha);
          if (!f || f >= cutoffStr) return false;
          if (m.tipo === "CuotaPrestamo") {
            const pid = parsePrestamoIdFromNotas(m.notas);
            if (pid && prestamosActivos.has(pid)) return false;
          }
          if (m.tipo === "Prestamo") {
            const pid = String(m.id != null ? m.id : m.row);
            if (prestamosActivos.has(pid)) return false;
          }
          return true;
        });

        if (!candidatos.length) {
          localStorage.setItem(PURGA_CHECK_KEY, String(Date.now()));
          return;
        }

        // Respaldo inmutable ANTES de borrar. Si algún respaldo falla, no se borra nada esta vez.
        let respaldadosOk = 0;
        for (const m of candidatos) {
          const res = await logAuditoria("PURGA_AUTOMATICA", {
            id: m.id, fecha: m.fecha, tipo: m.tipo, monto: m.monto,
            empleado: m.empleado, notas: m.notas, responsable: m.responsable, semana: m.semana
          });
          if (res && res.ok) respaldadosOk++;
        }
        if (respaldadosOk < candidatos.length) {
          console.warn(`Purga automática cancelada: solo ${respaldadosOk}/${candidatos.length} respaldos de auditoría confirmados`);
          return;
        }

        const ids = candidatos.map(m => m.id != null ? m.id : m.row).filter(id => id != null);
        const { error } = await sb.from("movimientos").delete().in("id", ids);
        if (error) { console.error("Error en purga automática", error); return; }

        localStorage.setItem(PURGA_CHECK_KEY, String(Date.now()));
        showToast(
          `Limpieza automática: ${ids.length} movimiento(s) de más de ${RETENCION_MOVIMIENTOS_MESES} meses se archivaron (siguen disponibles en auditoría)`,
          "info"
        );
        await cargarTodoOptimizado();
      } catch (e) {
        console.warn("purgarMovimientosAntiguos error", e);
      }
    }

    function iniciarApp() {
      document.getElementById("login-screen").classList.add("hidden");
      document.getElementById("app-screen").classList.remove("hidden");
      document.getElementById("lock-overlay").classList.add("hidden");
      const bn = document.getElementById("bottom-nav");
      if (bn) bn.classList.add("is-visible");
      isLocked = false;
      aplicarPermisos();
      document.getElementById("mov-fecha").value = localDateStr(new Date());
      cargarTodo(false, true).then(() => {
        if (currentUser && currentUser.rol === "admin") purgarMovimientosAntiguos();
      });
      iniciarRealtime();
      startInactivityWatcher();
      if (currentUser.rol === "admin") {
        cargarUsuarios();
        showTab("dashboard");
      } else {
        // Empleado: solo ve Movimiento e Historial → abrir en Movimiento
        showTab("nuevo");
      }
    }


    // --- Menús ··· (anclados al botón, siempre dentro de la pantalla) ---
    function toggleMenu(id, ev){
      const el = document.getElementById(id);
      if(!el) return;
      const isHidden = el.classList.contains("hidden");
      document.querySelectorAll("[id$='-menu']").forEach(m => {
        if (m !== el) m.classList.add("hidden");
      });
      if (!isHidden) {
        el.classList.add("hidden");
        return;
      }
      el.classList.remove("hidden");
      // Posicionar respecto al botón que abrió el menú
      let btn = null;
      if (ev && ev.currentTarget) btn = ev.currentTarget;
      else if (typeof event !== "undefined" && event && event.target) {
        btn = event.target.closest("button");
      }
      if (!btn) {
        // fallback: botón hermano anterior
        const parent = el.parentElement;
        if (parent) btn = parent.querySelector("button");
      }
      requestAnimationFrame(() => {
        const pad = 8;
        const mw = el.offsetWidth || 224;
        const mh = el.offsetHeight || 120;
        let top = pad, left = pad;
        if (btn) {
          const r = btn.getBoundingClientRect();
          top = r.bottom + 6;
          left = r.right - mw;
          // Si se sale por la derecha, pegar al borde
          if (left + mw > window.innerWidth - pad) left = window.innerWidth - mw - pad;
          if (left < pad) left = pad;
          // Si se sale por abajo, abrir hacia arriba
          if (top + mh > window.innerHeight - pad) {
            top = Math.max(pad, r.top - mh - 6);
          }
        }
        el.style.top = top + "px";
        el.style.left = left + "px";
        el.style.right = "auto";
      });
    }
    document.addEventListener("click", function(e){
      const isMenuBtn = e.target.closest("[onclick*='toggleMenu']");
      const isInsideMenu = e.target.closest("[id$='-menu']");
      if (!isMenuBtn && !isInsideMenu) {
        document.querySelectorAll("[id$='-menu']").forEach(m => m.classList.add("hidden"));
      }
    });
    window.addEventListener("resize", () => {
      document.querySelectorAll("[id$='-menu']").forEach(m => m.classList.add("hidden"));
    });

    function abrirDrawer() {
      const d = document.getElementById("app-drawer");
      const b = document.getElementById("app-drawer-backdrop");
      if (d) d.classList.add("open");
      if (b) b.classList.add("open");
      document.querySelectorAll("[id$='-menu']").forEach(m => m.classList.add("hidden"));
    }
    function cerrarDrawer() {
      const d = document.getElementById("app-drawer");
      const b = document.getElementById("app-drawer-backdrop");
      if (d) d.classList.remove("open");
      if (b) b.classList.remove("open");
    }
    function navegarDrawer(name) {
      showTab(name);
      cerrarDrawer();
    }

    // =====================================================
    // TABS
    // =====================================================
    function showTab(name) {
      // Empleado no puede entrar a pestañas de admin
      const adminTabs = ["dashboard", "individual", "ahorros", "ahorroespecial", "gastosnegocio", "ingresosnegocio", "prestamos", "empleados", "usuarios"];
      if (currentUser && currentUser.rol !== "admin" && adminTabs.includes(name)) {
        name = "nuevo";
      }

      const tabs = ["dashboard", "nuevo", "historial", "individual", "ahorros", "ahorroespecial", "gastosnegocio", "ingresosnegocio", "prestamos", "empleados", "usuarios"];
      if (name === "individual") {
        llenarSelectIndividual();
      }
      if (name === "gastosnegocio" && typeof renderGastosNegocio === "function") {
        renderGastosNegocio();
      }
      if (name === "ingresosnegocio" && typeof renderIngresosNegocio === "function") {
        renderIngresosNegocio();
      }
      if (name === "prestamos" && typeof renderPrestamos === "function") {
        renderPrestamos();
      }
      if (name === "ahorros" && typeof renderAhorros === "function") {
        renderAhorros();
      }
      tabs.forEach(t => {
        const view = document.getElementById(`view-${t}`);
        const tab = document.getElementById(`tab-${t}`);
        if (view) view.classList.add("hidden");
        if (tab) {
          tab.classList.remove("tab-active");
          tab.classList.add("text-gray-400");
        }
      });
      const view = document.getElementById(`view-${name}`);
      const tab = document.getElementById(`tab-${name}`);
      if (view) view.classList.remove("hidden");
      if (tab) {
        tab.classList.add("tab-active");
        tab.classList.remove("text-gray-400");
      }
      // Bottom nav active (legacy)
      document.querySelectorAll(".bottom-nav-btn").forEach(b => {
        b.classList.toggle("active", b.dataset.tab === name);
      });
      // Drawer active
      document.querySelectorAll("#app-drawer .drawer-item").forEach(b => {
        b.classList.toggle("active", b.dataset.tab === name);
      });
    }

