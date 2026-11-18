    // =====================================================
    // SOLICITUDES DE BORRADO
    // =====================================================
    // Los empleados no borran movimientos: piden el borrado con un motivo y un admin
    // lo aprueba o lo rechaza. Todo queda registrado en la tabla `movimientos` como
    // filas de monto 0 con empleado "Solicitud" (igual que las marcas "CuotaOmitida"),
    // así no hace falta crear tablas nuevas y llega en tiempo real a todos:
    //   SolicitudBorrado   → la solicitud. notas = JSON { mid, motivo, mov } (mov = copia del movimiento)
    //   SolicitudCancelada → el empleado la retiró.           notas = JSON { sol, motivo }
    //   SolicitudRechazada → un admin la rechazó.              notas = JSON { sol }
    //   SolicitudAprobada  → un admin la aprobó y borró el movimiento. notas = JSON { sol }
    // Al cargar, estas filas se separan de `movimientos` (separarSolicitudes), por lo que
    // no cuentan en sueldos, totales, historial ni copias por día. Mientras una solicitud
    // está pendiente el movimiento sigue contando normal; deja de contar solo al aprobarse.
    const SOL_TIPO = {
      SOLICITUD: "SolicitudBorrado",
      CANCELADA: "SolicitudCancelada",
      RECHAZADA: "SolicitudRechazada",
      APROBADA: "SolicitudAprobada"
    };
    const SOL_TIPOS = new Set(Object.values(SOL_TIPO));
    const SOL_EMPLEADO = "Solicitud";
    const SOL_HISTORIAL_PASO = 30;
    const SOL_ETIQUETA_ESTADO = {
      pendiente: "Pendiente",
      aprobada: "Borrado aprobado",
      rechazada: "Rechazada",
      cancelada: "Cancelada",
      sin_efecto: "Movimiento ya eliminado"
    };

    let solicitudesRegistros = [];
    let _solCache = null;
    let _solPendientesVistas = null;   // ids pendientes ya vistos, para avisar a los admins de las nuevas
    let _solEntradaLista = false;      // ya cargaron los datos al entrar (antes de eso no se avisa de "nuevas")
    let _solHistorialVisibles = SOL_HISTORIAL_PASO;
    const _solHistorialAbiertas = new Set();
    const _solTituloBase = document.title;

    function esRegistroSolicitud(m) {
      return !!m && SOL_TIPOS.has(String(m.tipo || "").trim());
    }

    /** Guarda aparte las filas de solicitudes y devuelve solo los movimientos normales. */
    function separarSolicitudes(lista) {
      const normales = [];
      const registros = [];
      (lista || []).forEach(m => (esRegistroSolicitud(m) ? registros : normales).push(m));
      solicitudesRegistros = registros;
      _solCache = null;
      return normales;
    }

    function _solDatos(r) {
      try { return JSON.parse(r && r.notas ? r.notas : "{}") || {}; } catch (_) { return {}; }
    }

    function _solIdMov(m) {
      return String(m && (m.id != null ? m.id : m.row));
    }

    function _solOrden(a, b) {
      const na = Number(a.id) || 0, nb = Number(b.id) || 0;
      if (na !== nb) return na - nb;
      return String(a.created_at || "").localeCompare(String(b.created_at || ""));
    }

    /** Copia de lo que se ve de un movimiento (se guarda en la solicitud por si luego se borra). */
    function _copiaMovimiento(m) {
      const miembros = miembrosMovimiento(m);
      const esGrupo = miembros.length > 1 || m.empleado === "Grupo";
      const unit = Number(m.monto) || 0;
      return {
        tipo: m.tipo || "",
        monto: unit,
        total: esGrupo ? Math.round(unit * Math.max(miembros.length, 1) * 100) / 100 : unit,
        personas: esGrupo ? miembros.length : 1,
        empleado: etiquetaEmpleadosMov(m),
        fecha: m.fecha || "",
        semana: m.semana || "",
        responsable: m.responsable || "",
        nota: notasVisibles(m.notas),
        metodo: parseMetodoFromNotas(m.notas)
      };
    }

    /**
     * Estado de todas las solicitudes, calculado a partir de los registros.
     * Se recalcula solo cuando cambian `movimientos` o los registros.
     */
    function resumenSolicitudes() {
      if (_solCache && _solCache.movs === movimientos && _solCache.regs === solicitudesRegistros) {
        return _solCache.res;
      }
      const movPorId = new Map();
      (movimientos || []).forEach(m => movPorId.set(_solIdMov(m), m));

      const ordenados = solicitudesRegistros.slice().sort(_solOrden);
      const cierres = new Map();
      ordenados.forEach(r => {
        if (r.tipo === SOL_TIPO.SOLICITUD) return;
        const d = _solDatos(r);
        const sid = String(d.sol || "");
        if (sid && !cierres.has(sid)) cierres.set(sid, { r, d });
      });

      const lista = [];
      const porMov = new Map();
      ordenados.forEach(r => {
        if (r.tipo !== SOL_TIPO.SOLICITUD) return;
        const d = _solDatos(r);
        const id = _solIdMov(r);
        const mid = String(d.mid || "");
        const mov = movPorId.get(mid) || null;
        const cierre = cierres.get(id) || null;
        let estado = "pendiente";
        if (cierre) {
          estado = cierre.r.tipo === SOL_TIPO.APROBADA ? "aprobada"
            : cierre.r.tipo === SOL_TIPO.RECHAZADA ? "rechazada" : "cancelada";
        } else if (!mov) {
          estado = "sin_efecto";
        }
        // Solo una solicitud pendiente por movimiento (la primera); las repetidas no cuentan
        if (estado === "pendiente" && porMov.has(mid)) return;
        const s = {
          id, mid, mov, estado,
          copia: d.mov || {},
          motivo: String(d.motivo || ""),
          solicito: r.responsable || "",
          fecha: r.created_at || r.fecha || "",
          cierre: cierre ? {
            tipo: cierre.r.tipo,
            motivo: String(cierre.d.motivo || ""),
            por: cierre.r.responsable || "",
            fecha: cierre.r.created_at || cierre.r.fecha || ""
          } : null
        };
        lista.push(s);
        if (estado === "pendiente") porMov.set(mid, s);
      });
      lista.reverse(); // más reciente primero

      const res = {
        lista,
        pendientes: lista.filter(s => s.estado === "pendiente"),
        cerradas: lista.filter(s => s.estado !== "pendiente"),
        porMov
      };
      _solCache = { movs: movimientos, regs: solicitudesRegistros, res };
      return res;
    }

    function solicitudPendienteDe(m) {
      if (!m) return null;
      return resumenSolicitudes().porMov.get(_solIdMov(m)) || null;
    }

    function puedeSolicitarBorrado(m) {
      return !!(currentUser && m && currentUser.rol !== "admin" && !solicitudPendienteDe(m));
    }

    /** Clase y etiqueta para mostrar un movimiento con borrado pendiente (sigue contando). */
    function claseBorradoPendiente(m) {
      return solicitudPendienteDe(m) ? " mov-borrado-pendiente" : "";
    }
    function badgeBorradoPendiente(m) {
      return solicitudPendienteDe(m)
        ? `<span class="sol-badge-mov" title="Sigue contando hasta que un admin apruebe el borrado">Borrado pendiente</span>`
        : "";
    }

    function _solBuscarMov(rowId) {
      return (movimientos || []).find(m => String(m.id) === String(rowId) || String(m.row) === String(rowId)) || null;
    }
    function _solBuscar(solId) {
      return resumenSolicitudes().lista.find(s => s.id === String(solId)) || null;
    }

    function _solMonto(c) {
      const total = formatMoney(c.total != null ? c.total : c.monto);
      return c.personas > 1 ? `${total} <span class="text-[11px] text-[var(--text-muted)]">(${formatMoney(c.monto)} c/u)</span>` : total;
    }
    function _solMontoTexto(c) {
      return formatMoney(c.total != null ? c.total : c.monto);
    }
    function _solDatosVista(s) {
      return s.mov ? _copiaMovimiento(s.mov) : (s.copia || {});
    }

    function _solResumenMovHtml(c) {
      const linea2 = [formatDateDisplay(c.fecha), c.metodo, c.responsable ? "Registró " + c.responsable : ""].filter(Boolean).map(esc).join(" · ");
      return `
        <div class="sol-mov">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="font-semibold text-white text-[14px]">${esc(c.empleado || "—")}</span>
                <span class="sol-tipo">${esc(c.tipo || "")}</span>
              </div>
              <div class="text-[12.5px] text-[var(--text-muted)] mt-1">${linea2}</div>
              ${c.nota ? `<div class="text-[12.5px] text-[var(--text-dim)] mt-0.5 break-words">${esc(c.nota)}</div>` : ""}
            </div>
            <div class="font-semibold text-white tabular-nums text-right shrink-0">${_solMonto(c)}</div>
          </div>
        </div>`;
    }

    function _solTextoConfirmacion(c) {
      return `${c.tipo} · ${_solMontoTexto(c)} · ${c.empleado}\n${formatDateDisplay(c.fecha)}${c.nota ? "\n" + c.nota : ""}`;
    }

    // ---------- Ventana para escribir el motivo ----------
    let _motivoResolver = null;
    function pedirMotivo({ titulo, resumenHtml, boton, placeholder }) {
      if (_motivoResolver) _motivoResolver(null);
      document.getElementById("motivo-titulo").textContent = titulo;
      document.getElementById("motivo-resumen").innerHTML = resumenHtml || "";
      const txt = document.getElementById("motivo-texto");
      txt.value = "";
      txt.placeholder = placeholder || "";
      document.getElementById("motivo-error").classList.add("hidden");
      document.getElementById("btn-motivo-ok").textContent = boton || "Enviar";
      document.getElementById("motivo-overlay").classList.remove("hidden");
      setTimeout(() => { try { txt.focus(); } catch (_) {} }, 80);
      return new Promise(resolve => { _motivoResolver = resolve; });
    }
    function enviarMotivo() {
      const txt = document.getElementById("motivo-texto");
      const motivo = (txt.value || "").trim();
      if (!motivo) {
        document.getElementById("motivo-error").classList.remove("hidden");
        txt.focus();
        return;
      }
      const r = _motivoResolver;
      _motivoResolver = null;
      document.getElementById("motivo-overlay").classList.add("hidden");
      if (r) r(motivo);
    }
    function cerrarMotivo() {
      const r = _motivoResolver;
      _motivoResolver = null;
      document.getElementById("motivo-overlay").classList.add("hidden");
      if (r) r(null);
    }
    document.getElementById("motivo-texto")?.addEventListener("input", () => {
      document.getElementById("motivo-error").classList.add("hidden");
    });

    // ---------- Guardar registros ----------
    async function _solGuardarRegistro(tipo, datos, auditoria) {
      const hoy = localDateStr(new Date());
      const row = {
        fecha: hoy,
        empleado: SOL_EMPLEADO,
        tipo,
        monto: 0,
        notas: JSON.stringify(Object.assign({ v: 1 }, datos)),
        semana: semanaDesdeFecha(hoy),
        responsable: (currentUser && currentUser.usuario) || ""
      };
      const { data, error } = await sb.from("movimientos").insert([row]).select("*");
      if (error) throw error;
      const guardado = mapMovimiento((data && data[0]) || Object.assign({ id: "local-" + Date.now(), created_at: new Date().toISOString() }, row));
      solicitudesRegistros = solicitudesRegistros.concat([guardado]);
      _solCache = null;
      try {
        await logAuditoria(auditoria.operacion, {
          id: guardado.id, fecha: row.fecha, tipo, monto: 0,
          empleado: auditoria.empleado || "", notas: auditoria.notas || "", responsable: row.responsable
        });
      } catch (_) {}
      return guardado;
    }

    function _solRefrescar() {
      guardarCache();
      aplicarDatosEnPantalla();
    }

    function _solError(err, texto) {
      console.error(err);
      showToast(`${texto}: ${(err && err.message) || "error de conexión"}`, "error");
    }

    // ---------- Acciones ----------
    /** Empleado: pide borrar un movimiento. Admin: borra directo, como siempre. */
    async function solicitarBorrado(rowId) {
      if (!currentUser) return showToast("Inicia sesión", "error");
      if (currentUser.rol === "admin") return borrarMovimiento(rowId);
      const mov = _solBuscarMov(rowId);
      if (!mov) return showToast("No se encontró el movimiento", "error");
      if (solicitudPendienteDe(mov)) return showToast("Este movimiento ya tiene una solicitud pendiente", "info");
      if (isSaving) return;
      const copia = _copiaMovimiento(mov);
      const motivo = await pedirMotivo({
        titulo: "Solicitar borrado",
        resumenHtml: _solResumenMovHtml(copia) + `<p class="text-[12px] text-[var(--text-muted)] mt-2">Un admin debe aprobarlo. Mientras tanto, el movimiento sigue contando.</p>`,
        boton: "Enviar solicitud",
        placeholder: "Ej. no se realizó el adelanto, regresó el dinero…"
      });
      if (motivo == null) return;
      if (solicitudPendienteDe(mov)) return showToast("Este movimiento ya tiene una solicitud pendiente", "info");
      isSaving = true;
      try {
        await _solGuardarRegistro(SOL_TIPO.SOLICITUD, { mid: _solIdMov(mov), motivo, mov: copia }, {
          operacion: "SOLICITUD_BORRADO", empleado: copia.empleado, notas: motivo
        });
        _solRefrescar();
        showToast("Solicitud enviada. Un admin la revisará");
      } catch (err) {
        _solError(err, "No se pudo enviar la solicitud");
      } finally {
        isSaving = false;
      }
    }

    /** Quien la pidió la retira (con motivo). No necesita aprobación. */
    async function cancelarSolicitud(solId) {
      const s = _solBuscar(solId);
      if (!s || s.estado !== "pendiente") return showToast("La solicitud ya no está pendiente", "info");
      if (!currentUser || s.solicito !== currentUser.usuario) return showToast("Solo quien la pidió puede cancelarla", "error");
      if (isSaving) return;
      const motivo = await pedirMotivo({
        titulo: "Cancelar solicitud",
        resumenHtml: _solResumenMovHtml(_solDatosVista(s)) + `<p class="text-[12px] text-[var(--text-muted)] mt-2">El movimiento se queda como está.</p>`,
        boton: "Cancelar solicitud",
        placeholder: "Ej. sí se va a hacer el adelanto"
      });
      if (motivo == null) return;
      isSaving = true;
      try {
        await _solGuardarRegistro(SOL_TIPO.CANCELADA, { sol: s.id, motivo }, {
          operacion: "SOLICITUD_CANCELADA", empleado: _solDatosVista(s).empleado, notas: motivo
        });
        _solRefrescar();
        showToast("Solicitud cancelada");
      } catch (err) {
        _solError(err, "No se pudo cancelar");
      } finally {
        isSaving = false;
      }
    }

    /** Admin: aprueba, borra el movimiento y deja registro. */
    async function aprobarSolicitud(solId) {
      if (!currentUser || currentUser.rol !== "admin") return showToast("Solo admin", "error");
      const s = _solBuscar(solId);
      if (!s || s.estado !== "pendiente") return showToast("La solicitud ya no está pendiente", "info");
      if (isSaving) return;
      const mov = s.mov;
      const c = _copiaMovimiento(mov);
      const ok = await uiConfirm(`¿Aprobar y borrar este movimiento?\n${_solTextoConfirmacion(c)}\n\nMotivo: ${s.motivo}\n\nDejará de contar en sueldos y totales. No se puede deshacer.`);
      if (!ok) return;
      const actual = _solBuscar(solId);
      if (!actual || actual.estado !== "pendiente") return showToast("La solicitud ya no está pendiente", "info");
      isSaving = true;
      try {
        const id = mov.id || mov.row;
        try {
          await logAuditoria("DELETE", {
            id, fecha: mov.fecha, tipo: mov.tipo, monto: mov.monto, empleado: mov.empleado,
            notas: mov.notas, responsable: mov.responsable, semana: mov.semana
          });
        } catch (_) {}
        const { error } = await sb.from("movimientos").delete().in("id", [Number(id) || id]);
        if (error) throw error;
        movimientos = movimientos.filter(m => String(m.id || m.row) !== String(id));
        _solCache = null;
        try {
          await _solGuardarRegistro(SOL_TIPO.APROBADA, { sol: s.id }, {
            operacion: "SOLICITUD_APROBADA", empleado: c.empleado, notas: s.motivo
          });
          showToast("Movimiento borrado");
        } catch (err) {
          // El movimiento ya se borró; la solicitud quedará como "Movimiento ya eliminado"
          _solError(err, "Movimiento borrado, pero no se guardó el registro de aprobación");
        }
        _solRefrescar();
      } catch (err) {
        _solError(err, "No se pudo borrar el movimiento");
        await cargarTodoOptimizado();
      } finally {
        isSaving = false;
      }
    }

    /** Admin: rechaza; el movimiento queda igual. */
    async function rechazarSolicitud(solId) {
      if (!currentUser || currentUser.rol !== "admin") return showToast("Solo admin", "error");
      const s = _solBuscar(solId);
      if (!s || s.estado !== "pendiente") return showToast("La solicitud ya no está pendiente", "info");
      if (isSaving) return;
      const c = _solDatosVista(s);
      const ok = await uiConfirm(`¿Rechazar la solicitud?\n${_solTextoConfirmacion(c)}\n\nEl movimiento se queda como está.`);
      if (!ok) return;
      const actual = _solBuscar(solId);
      if (!actual || actual.estado !== "pendiente") return showToast("La solicitud ya no está pendiente", "info");
      isSaving = true;
      try {
        await _solGuardarRegistro(SOL_TIPO.RECHAZADA, { sol: s.id }, {
          operacion: "SOLICITUD_RECHAZADA", empleado: c.empleado, notas: s.motivo
        });
        _solRefrescar();
        showToast("Solicitud rechazada");
      } catch (err) {
        _solError(err, "No se pudo rechazar");
      } finally {
        isSaving = false;
      }
    }

    function verSolicitudDeMovimiento(rowId) {
      const mov = _solBuscarMov(rowId);
      const s = solicitudPendienteDe(mov);
      if (typeof cerrarDetalleMovimiento === "function") cerrarDetalleMovimiento();
      showTab("solicitudes");
      if (!s) return;
      setTimeout(() => {
        const el = document.querySelector(`#solicitudes-pendientes [data-sol="${CSS.escape(s.id)}"]`);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 120);
    }

    // ---------- Vista ----------
    function _solTarjeta(s) {
      const c = _solDatosVista(s);
      const isAdmin = currentUser && currentUser.rol === "admin";
      const esMia = currentUser && s.solicito === currentUser.usuario;
      const sid = jsArg(s.id);
      let acciones = "";
      if (isAdmin) {
        acciones = `
          <div class="sol-acciones">
            <button type="button" class="btn-ghost px-4 py-2 rounded-lg text-[13px]" onclick='rechazarSolicitud(${sid})'>Rechazar</button>
            <button type="button" class="btn-danger px-4 py-2 rounded-lg text-[13px]" onclick='aprobarSolicitud(${sid})'>Aprobar borrado</button>
          </div>`;
      } else if (esMia) {
        acciones = `
          <div class="sol-acciones">
            <button type="button" class="btn-ghost px-4 py-2 rounded-lg text-[13px]" onclick='cancelarSolicitud(${sid})'>Cancelar solicitud</button>
          </div>`;
      }
      return `
        <div class="sol-card card rounded-xl p-4" data-sol="${esc(s.id)}">
          <div class="flex items-center justify-between gap-2 mb-2.5">
            <span class="sol-estado sol-estado-pendiente">Pendiente</span>
            <span class="text-[11px] text-[var(--text-dim)]">${esc(formatDateTimeDisplay(s.fecha))}</span>
          </div>
          ${_solResumenMovHtml(c)}
          <div class="sol-motivo">
            <div class="sol-motivo-label">Motivo del borrado</div>
            <p>${esc(s.motivo)}</p>
            <div class="sol-meta">Solicitó ${esc(s.solicito || "—")}</div>
          </div>
          ${acciones}
        </div>`;
    }

    function _solFilaHistorial(s) {
      const c = _solDatosVista(s);
      const abierta = _solHistorialAbiertas.has(s.id);
      let detalle = "";
      if (abierta) {
        const cierre = s.cierre;
        const accion = !cierre ? "" :
          cierre.tipo === SOL_TIPO.APROBADA ? "Aprobó" :
          cierre.tipo === SOL_TIPO.RECHAZADA ? "Rechazó" : "Canceló";
        detalle = `
          <div class="sol-hist-detalle" onclick="event.stopPropagation()">
            ${_solResumenMovHtml(c)}
            <div class="sol-motivo">
              <div class="sol-motivo-label">Motivo del borrado</div>
              <p>${esc(s.motivo)}</p>
              <div class="sol-meta">Solicitó ${esc(s.solicito || "—")} · ${esc(formatDateTimeDisplay(s.fecha))}</div>
            </div>
            ${cierre ? `
              <div class="sol-motivo">
                <div class="sol-motivo-label">${cierre.tipo === SOL_TIPO.CANCELADA ? "Motivo de la cancelación" : "Resolución"}</div>
                ${cierre.motivo ? `<p>${esc(cierre.motivo)}</p>` : ""}
                <div class="sol-meta">${accion} ${esc(cierre.por || "—")} · ${esc(formatDateTimeDisplay(cierre.fecha))}</div>
              </div>` : `
              <div class="sol-meta">El movimiento se borró fuera de esta solicitud.</div>`}
          </div>`;
      }
      return `
        <div class="sol-hist sol-${s.estado}${abierta ? " is-open" : ""}" role="button" tabindex="0" aria-expanded="${abierta}"
             onclick='toggleSolicitudHistorial(${jsArg(s.id)})' onkeydown='if(event.key==="Enter"||event.key===" "){event.preventDefault();toggleSolicitudHistorial(${jsArg(s.id)})}'>
          <span class="sol-esquina">${SOL_ETIQUETA_ESTADO[s.estado] || ""}</span>
          <div class="sol-hist-linea"><span class="text-white font-medium">${esc(c.tipo || "")} · ${esc(_solMontoTexto(c))}</span> · ${esc(c.empleado || "—")}</div>
          <div class="sol-hist-sub">${esc(formatDateDisplay(String(s.fecha).slice(0, 10)))} · Solicitó ${esc(s.solicito || "—")}</div>
          ${detalle}
        </div>`;
    }

    function toggleSolicitudHistorial(id) {
      id = String(id);
      if (_solHistorialAbiertas.has(id)) _solHistorialAbiertas.delete(id);
      else _solHistorialAbiertas.add(id);
      _solRenderHistorial();
    }
    function verMasSolicitudes() {
      _solHistorialVisibles += SOL_HISTORIAL_PASO;
      _solRenderHistorial();
    }

    function _solRenderHistorial() {
      const cont = document.getElementById("solicitudes-historial");
      const empty = document.getElementById("solicitudes-historial-empty");
      if (!cont) return;
      const { cerradas } = resumenSolicitudes();
      if (!cerradas.length) {
        cont.innerHTML = "";
        if (empty) empty.classList.remove("hidden");
        return;
      }
      if (empty) empty.classList.add("hidden");
      const visibles = cerradas.slice(0, _solHistorialVisibles);
      cont.innerHTML = visibles.map(_solFilaHistorial).join("") +
        (cerradas.length > visibles.length
          ? `<button type="button" class="btn-ghost w-full py-2.5 rounded-lg text-[13px]" onclick="verMasSolicitudes()">Mostrar más (${cerradas.length - visibles.length})</button>`
          : "");
    }

    function renderSolicitudes() {
      const { pendientes } = resumenSolicitudes();
      const n = pendientes.length;
      const isAdmin = currentUser && currentUser.rol === "admin";

      // Indicadores: sobre del encabezado, menú lateral y pestaña
      const badge = document.getElementById("solic-badge");
      if (badge) {
        const antes = badge.textContent;
        badge.textContent = n > 99 ? "99+" : String(n);
        badge.classList.toggle("hidden", n === 0);
        if (n > 0 && antes !== badge.textContent) {
          badge.classList.remove("bump");
          void badge.offsetWidth;
          badge.classList.add("bump");
        }
      }
      document.getElementById("btn-solicitudes")?.classList.toggle("has-pending", n > 0);
      const btnSol = document.getElementById("btn-solicitudes");
      if (btnSol) btnSol.setAttribute("aria-label", n ? `Solicitudes de borrado: ${n} pendiente(s)` : "Solicitudes de borrado");
      const dc = document.getElementById("drawer-solic-count");
      if (dc) { dc.textContent = String(n); dc.classList.toggle("hidden", n === 0); }
      const pc = document.getElementById("sol-pend-count");
      if (pc) pc.textContent = n ? String(n) : "";
      document.title = (isAdmin && n ? `(${n}) ` : "") + _solTituloBase;

      // Aviso a admins cuando llega una solicitud nueva mientras usan la app
      const ids = new Set(pendientes.map(s => s.id));
      if (_solEntradaLista && _solPendientesVistas && isAdmin) {
        const nuevas = pendientes.filter(s => !_solPendientesVistas.has(s.id) && s.solicito !== currentUser.usuario);
        if (nuevas.length === 1) showToast(`Nueva solicitud de borrado de ${nuevas[0].solicito || "un empleado"}`, "info");
        else if (nuevas.length > 1) showToast(`${nuevas.length} solicitudes de borrado nuevas`, "info");
      }
      if (currentUser) _solPendientesVistas = ids;

      // Vista
      const cont = document.getElementById("solicitudes-pendientes");
      const empty = document.getElementById("solicitudes-pendientes-empty");
      if (cont) {
        cont.innerHTML = pendientes.map(_solTarjeta).join("");
        if (empty) empty.classList.toggle("hidden", n > 0);
      }
      _solRenderHistorial();

      // Ventana de pendientes (si está abierta)
      const ov = document.getElementById("solic-overlay");
      if (ov && !ov.classList.contains("hidden")) {
        if (!n) {
          ov.classList.add("hidden");
        } else {
          document.getElementById("solic-overlay-lista").innerHTML = pendientes.map(_solTarjeta).join("");
          document.getElementById("solic-overlay-sub").textContent = `${n} por revisar`;
        }
      }
    }

    // ---------- Ventana de pendientes al entrar (admins) ----------
    function abrirSolicitudesPendientes() {
      const { pendientes } = resumenSolicitudes();
      if (!pendientes.length) return showTab("solicitudes");
      document.getElementById("solic-overlay-lista").innerHTML = pendientes.map(_solTarjeta).join("");
      document.getElementById("solic-overlay-sub").textContent = `${pendientes.length} por revisar`;
      document.getElementById("solic-overlay").classList.remove("hidden");
    }
    function cerrarSolicitudesPendientes() {
      document.getElementById("solic-overlay")?.classList.add("hidden");
    }
    /** Se llama al entrar a la app, cuando ya cargaron los datos. */
    function mostrarSolicitudesAlEntrar() {
      const { pendientes } = resumenSolicitudes();
      _solPendientesVistas = new Set(pendientes.map(s => s.id));
      _solEntradaLista = true;
      if (!currentUser || currentUser.rol !== "admin") return;
      if (pendientes.length) abrirSolicitudesPendientes();
    }

    /** Al cerrar sesión: cerrar ventanas y olvidar lo visto. */
    function reiniciarSolicitudes() {
      cerrarSolicitudesPendientes();
      cerrarMotivo();
      _solPendientesVistas = null;
      _solEntradaLista = false;
      _solHistorialAbiertas.clear();
      _solHistorialVisibles = SOL_HISTORIAL_PASO;
      document.title = _solTituloBase;
    }
