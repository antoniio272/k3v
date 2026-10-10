    function fechaMovimientoLocal(m) {
      // ÚNICAMENTE la fecha de negocio del movimiento (campo fecha).
      // No usar created_at: la hora de registro en UTC/local puede ser otro día calendario.
      if (!m) return "";
      const dia = soloDia(m.fecha);
      if (dia) return dia;
      return "";
    }

    function movimientosDelDia(fechaStr) {
      const dia = (fechaStr || "").slice(0, 10);
      if (!dia) return [];
      let lista = sortMovimientosRecientesPrimero(movimientos || []);
      if (!(currentUser && currentUser.rol === "admin")) {
        lista = lista.filter(m => {
          const t = String(m.tipo || "").trim();
          return t === "Adelanto" || t === "Fiado" || esMovimientoGastoNegocio(m) || esMovimientoIngresoNegocio(m);
        });
      }
      return lista.filter(m => fechaMovimientoLocal(m) === dia);
    }

    function formatFechaHeaderCorto(fechaStr) {
      const dia = (fechaStr || "").slice(0, 10);
      if (!dia) return "";
      const d = new Date(dia + "T12:00:00");
      if (isNaN(d.getTime())) return dia;
      const s = d.toLocaleDateString("es-MX", {
        timeZone: APP_TZ,
        day: "2-digit",
        month: "short",
        year: "numeric"
      });
      // "30 ago 2026" → "30 AGO 2026"
      return s.replace(/\./g, "").toUpperCase();
    }

    function formatHoraMovimiento(m) {
      if (!m || !m.created_at) return "";
      const d = new Date(m.created_at);
      if (isNaN(d.getTime())) return "";
      return d.toLocaleTimeString("es-MX", {
        timeZone: APP_TZ,
        hour: "2-digit",
        minute: "2-digit",
        hour12: true
      });
    }

    /** Monto total del movimiento (grupales: por persona × n) */
    function montoTotalMovimiento(m) {
      const unit = Number(m && m.monto) || 0;
      const miembros = miembrosMovimiento(m);
      if (miembros.length > 1 || (m && m.empleado === "Grupo")) {
        const n = Math.max(miembros.length, 1);
        return Math.round(unit * n * 100) / 100;
      }
      return unit;
    }

    /** Solo egresos / ingresos / diferencia del día (por método de pago) */
    /** Tipos que SÍ son movimiento real de caja (entra o sale efectivo/tarjeta/transferencia ese día).
     * Bono, Extra, Ahorro, AhorroEspecial, Prestamo, CuotaPrestamo, Descuento, Penalizacion, etc. se
     * liquidan hasta el cierre de semana vía nómina — no deben contarse como egreso/ingreso de caja
     * del día, aunque se registren normalmente con su tipo y aparezcan en el detalle del día. */
    function esMovimientoDeCaja(tipo) {
      const t = String(tipo || "").trim();
      return t === "Fiado" || t === "Adelanto" || t === "Gasto" || t === "Ingreso";
    }

    function generarResumenTotalesDia(fechaStr) {
      const dia = (fechaStr || "").slice(0, 10);
      const lista = movimientosDelDia(dia);
      if (!lista.length) return "";

      const egresosMet = { Caja: 0, Tarjeta: 0, Transferencia: 0 };
      const ingresosMet = { Caja: 0, Tarjeta: 0, Transferencia: 0 };
      let totalEgresos = 0;
      let totalIngresos = 0;
      let totalOtros = 0;

      lista.forEach(m => {
        const total = montoTotalMovimiento(m);
        const tipo = String(m.tipo || "").trim();
        if (!esMovimientoDeCaja(tipo)) {
          // No mueve caja hoy (se liquida en nómina): no entra al egreso/ingreso del día.
          totalOtros += total;
          return;
        }
        const metodo = parseMetodoFromNotas(m.notas) || "Caja";
        const key = (metodo === "Tarjeta" || metodo === "Transferencia") ? metodo : "Caja";
        if (tipo === "Ingreso") {
          ingresosMet[key] += total;
          totalIngresos += total;
        } else {
          // Fiado, Adelanto, Gasto
          egresosMet[key] += total;
          totalEgresos += total;
        }
      });

      const lineas = [];
      lineas.push(`*EGRESOS DE CAJA (fiados, adelantos, gastos):*`);
      lineas.push(`- Caja: ${formatMoney(egresosMet.Caja)}`);
      lineas.push(`- Tarjeta: ${formatMoney(egresosMet.Tarjeta)}`);
      lineas.push(`- Transferencia: ${formatMoney(egresosMet.Transferencia)}`);
      lineas.push(`- Total egresos: ${formatMoney(totalEgresos)}`);
      lineas.push("");
      lineas.push(`*INGRESOS DE CAJA:*`);
      lineas.push(`- Caja: ${formatMoney(ingresosMet.Caja)}`);
      lineas.push(`- Tarjeta: ${formatMoney(ingresosMet.Tarjeta)}`);
      lineas.push(`- Transferencia: ${formatMoney(ingresosMet.Transferencia)}`);
      lineas.push(`- Total ingresos: ${formatMoney(totalIngresos)}`);
      lineas.push("");
      const diff = Math.round((totalIngresos - totalEgresos) * 100) / 100;
      lineas.push(`*DIFERENCIA (ingresos - egresos de caja): ${formatMoney(diff)}*`);
      if (totalOtros > 0.009) {
        lineas.push("");
        lineas.push(`*OTROS MOVIMIENTOS (no afectan caja, se liquidan en nómina): ${formatMoney(totalOtros)}*`);
      }
      return lineas.join("\n");
    }

    function generarTextoMovimientosDia(fechaStr) {
      const dia = (fechaStr || "").slice(0, 10);
      const lista = movimientosDelDia(dia);
      if (!lista.length) return "";

      const grupales = [];
      const individuales = [];
      const negocio = [];

      lista.forEach(m => {
        if (esMovimientoGastoNegocio(m) || esMovimientoIngresoNegocio(m)) {
          negocio.push(m);
        } else if (esMovimientoGrupo(m) || (m.empleado === "Grupo" && miembrosMovimiento(m).length > 1)) {
          grupales.push(m);
        } else {
          individuales.push(m);
        }
      });

      const totalGeneral = lista.reduce((s, m) => s + montoTotalMovimiento(m), 0);
      const lineas = [];
      lineas.push(`*LOS ARAGANES - ${formatFechaHeaderCorto(dia)}*`);
      lineas.push(`${lista.length} movimiento${lista.length === 1 ? "" : "s"} | Total: ${formatMoney(totalGeneral)}`);
      lineas.push("----------------------------------------");
      lineas.push("");

      const lineaMov = (m, modo) => {
        const metodo = parseMetodoFromNotas(m.notas);
        const nota = notasVisibles(m.notas);
        const hora = formatHoraMovimiento(m);
        const resp = m.responsable ? `por ${m.responsable}` : "";
        const unit = Number(m.monto) || 0;
        const miembros = miembrosMovimiento(m);
        const parts = [];

        if (modo === "grupo") {
          const n = Math.max(miembros.length, 1);
          const total = Math.round(unit * n * 100) / 100;
          parts.push(m.tipo || "—");
          parts.push(`Total ${formatMoney(total)} (${formatMoney(unit)} c/u)`);
        } else if (modo === "negocio") {
          parts.push(m.tipo || "—");
          parts.push(formatMoney(unit));
        } else {
          parts.push(etiquetaEmpleadosMov(m));
          parts.push(m.tipo || "—");
          parts.push(formatMoney(unit));
        }
        if (metodo) parts.push(metodo);
        if (hora) parts.push(hora);
        if (nota) parts.push(nota);
        if (resp) parts.push(resp);
        const main = `- ${parts.join(" | ")}`;
        if (modo === "grupo" && miembros.length) {
          return main + "\n  " + miembros.join(", ");
        }
        return main;
      };

      if (grupales.length) {
        lineas.push(`*GRUPALES (${grupales.length})*`);
        grupales.forEach(m => lineas.push(lineaMov(m, "grupo")));
        lineas.push("");
      }
      if (individuales.length) {
        lineas.push(`*INDIVIDUALES (${individuales.length})*`);
        individuales.forEach(m => lineas.push(lineaMov(m, "indiv")));
        lineas.push("");
      }
      if (negocio.length) {
        lineas.push(`*NEGOCIO (${negocio.length})*`);
        negocio.forEach(m => lineas.push(lineaMov(m, "negocio")));
        lineas.push("");
      }

      const resumen = generarResumenTotalesDia(dia);
      if (resumen) lineas.push(resumen);
      return lineas.join("\n");
    }

    async function copiarMovimientosDelDia() {
      if (!currentUser || currentUser.rol !== "admin") {
        return showToast("Solo admin puede copiar el historial", "error");
      }
      const input = document.getElementById("filtro-dia-copiar");
      const dia = (input && input.value) ? input.value.slice(0, 10) : "";
      if (!dia) {
        showToast("Elige un día para copiar", "error");
        return;
      }
      const texto = generarTextoMovimientosDia(dia);
      if (!texto) {
        showToast("No hay movimientos en ese día", "error");
        return;
      }
      try {
        await navigator.clipboard.writeText(texto);
        showToast("Movimientos del día copiados");
      } catch (e) {
        await uiPrompt("Copia el texto (Ctrl+C):", texto);
      }
    }

    async function copiarResumenTotalesDelDia() {
      if (!currentUser || currentUser.rol !== "admin") {
        return showToast("Solo admin puede copiar totales", "error");
      }
      const input = document.getElementById("filtro-dia-copiar");
      const dia = (input && input.value) ? input.value.slice(0, 10) : "";
      if (!dia) {
        showToast("Elige un día para copiar", "error");
        return;
      }
      const texto = generarResumenTotalesDia(dia);
      if (!texto) {
        showToast("No hay movimientos en ese día", "error");
        return;
      }
      try {
        await navigator.clipboard.writeText(texto);
        showToast("Totales del día copiados");
      } catch (e) {
        await uiPrompt("Copia el texto (Ctrl+C):", texto);
      }
    }

    function limpiarFiltroDia() {
      const input = document.getElementById("filtro-dia-copiar");
      if (input) input.value = "";
      const hint = document.getElementById("filtro-dia-hint");
      if (hint) hint.textContent = "Elige una fecha para ver y copiar solo los movimientos de ese día (todos los tipos).";
      renderHistorial();
    }

    function renderHistorial() {
      const filtroEmp = document.getElementById("filtro-empleado")?.value || "";
      const filtroTipo = document.getElementById("filtro-tipo")?.value || "";
      const filtroBuscar = (document.getElementById("filtro-buscar")?.value || "").trim().toLowerCase();
      const filtroDia = (document.getElementById("filtro-dia-copiar")?.value || "").slice(0, 10);
      // Siempre: último registrado primero (por id), sin importar fecha/monto/nombre
      let lista = sortMovimientosRecientesPrimero(movimientos);

      // Empleado: ve todos los Adelantos, Fiados, Gastos e Ingresos (compartido).
      // No ve bonos, extras, ahorros, préstamos, etc. (solo admin).
      if (!(currentUser && currentUser.rol === "admin")) {
        lista = lista.filter(m => {
          const t = String(m.tipo || "").trim();
          return t === "Adelanto" || t === "Fiado" || esMovimientoGastoNegocio(m) || esMovimientoIngresoNegocio(m);
        });
      }

      if (filtroDia) {
        lista = lista.filter(m => fechaMovimientoLocal(m) === filtroDia);
        const hint = document.getElementById("filtro-dia-hint");
        if (hint) {
          hint.textContent = lista.length
            ? `${lista.length} movimiento(s) el ${formatDateDisplay(filtroDia)}`
            : `Sin movimientos el ${formatDateDisplay(filtroDia)}.`;
        }
      }

      if (filtroEmp) lista = lista.filter(m => movimientoAplicaAEmpleado(m, filtroEmp));
      if (filtroTipo) lista = lista.filter(m => m.tipo === filtroTipo);
      if (filtroBuscar) {
        lista = lista.filter(m => {
          const blob = `${m.empleado} ${m.tipo} ${m.notas} ${m.responsable} ${m.monto}`.toLowerCase();
          return blob.includes(filtroBuscar);
        });
      }

      const cont = document.getElementById("historial-lista");
      const empty = document.getElementById("historial-empty");

      if (lista.length === 0) {
        cont.innerHTML = "";
        empty.classList.remove("hidden");
        return;
      }
      empty.classList.add("hidden");

      const isAdmin = currentUser && currentUser.rol === "admin";

      cont.innerHTML = lista.map(m => {
        let colorTipo = "text-gray-300";
        if (m.tipo === "Bono") colorTipo = "text-[#5ecf8f]";
        else if (m.tipo === "Extra") colorTipo = "text-[#e0b83a]";
        else if (m.tipo === "Adelanto") colorTipo = "text-[#e8b04a]";
        else if (esGasto(m.tipo) || m.tipo === "Penalizacion") colorTipo = "text-[#e08888]";
        else if (m.tipo === "Ingreso") colorTipo = "text-[#5ecf8f]";
        else if (m.tipo === "Prestamo") colorTipo = "text-[#5ecf8f]";
        else if (m.tipo === "CuotaPrestamo" || m.tipo === "CuotaOmitida") colorTipo = "text-[#e8b04a]";
        else if (m.tipo === "RetiroAhorro" || m.tipo === "RetiroAhorroEspecial") colorTipo = "text-[#e08888]";
        else if (m.tipo === "Ahorro") colorTipo = "text-[#6eb8d8]";
        else if (m.tipo === "AhorroEspecial") colorTipo = "text-[#b8a0d0]";
        else if (m.tipo === "Fiado") colorTipo = "text-[#e8a04a]";

        const barColor =
          m.tipo === "Bono" ? "#34a86a" :
          m.tipo === "Extra" ? "#c9a227" :
          m.tipo === "Adelanto" ? "#d4920a" :
          (esGasto(m.tipo) || m.tipo === "Penalizacion") ? "#c45454" :
          m.tipo === "Ahorro" ? "#4a9bbf" :
          m.tipo === "AhorroEspecial" ? "#9a7ab8" :
          m.tipo === "Fiado" ? "#e8a04a" : "#52525b";

        const mid = String(m.id != null ? m.id : m.row);
        const miembros = miembrosMovimiento(m);
        const esGrupo = miembros.length > 1 || m.empleado === "Grupo";
        const unit = Number(m.monto) || 0;
        const totalG = esGrupo ? Math.round(unit * Math.max(miembros.length, 1) * 100) / 100 : unit;
        const montoHtml = esGrupo
          ? `<span class="tabular-nums font-semibold text-[var(--text)]">${formatMoney(totalG)}</span><span class="text-[11px] text-[var(--text-muted)]">(${formatMoney(unit)} c/u)</span>`
          : `<span class="tabular-nums font-semibold text-[var(--text)]">${formatMoney(unit)}</span>`;

        return `
          <div class="hist-card card rounded-xl p-4 flex items-start justify-between gap-3 cursor-pointer" onclick='abrirDetalleMovimiento("${escAttr(mid)}")' title="Ver detalle">
            <div class="hist-bar" style="background:${barColor}"></div>
            <div class="flex-1 min-w-0 pl-1">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="font-semibold text-white text-[14px]" title="${esc(etiquetaEmpleadosMov(m))}">${esc(etiquetaEmpleadosMov(m))}</span>
                <span class="text-[11px] px-2 py-0.5 rounded-md bg-[var(--bg-elevated)] border border-[var(--border)] ${colorTipo} font-medium">${esc(m.tipo)}</span>
              </div>
              <div class="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1.5 text-[13px] text-[var(--text-muted)]">
                ${montoHtml}
                <span title="Fecha del movimiento${m.created_at ? " · Registrado: " + formatDateTimeDisplay(m.created_at) : ""}">${formatMovimientoCuando(m)}</span>
                ${(() => { const met = parseMetodoFromNotas(m.notas); const nv = notasVisibles(m.notas); return (met ? `<span class="text-[11px] px-1.5 py-0.5 rounded bg-[var(--bg-elevated)] border border-[var(--border)] text-gray-300">${esc(met)}</span>` : "") + (nv ? `<span class="text-[var(--text-dim)] truncate max-w-[240px]" title="${esc(nv)}">${esc(nv)}</span>` : ""); })()}
              </div>
              ${m.responsable ? `<div class="text-[11px] text-[var(--text-dim)] mt-1">Por ${esc(m.responsable)}</div>` : ""}
            </div>
            <div class="flex flex-col gap-1 shrink-0" onclick="event.stopPropagation()">
              ${puedeEditarMovimiento(m) ? `<button type="button" onclick='abrirEditarMovimiento("${escAttr(mid)}")' class="text-aragan-yellow text-xs px-2 py-1.5 rounded-md hover:bg-[rgba(201,162,39,0.1)] transition">Editar</button>` : ""}
              ${puedeBorrarMovimiento(m) ? `<button type="button" onclick='borrarMovimiento("${escAttr(mid)}")' class="text-[var(--text-dim)] hover:text-[#e08888] text-xs px-2 py-1.5 rounded-md hover:bg-[rgba(196,84,84,0.1)] transition">Eliminar</button>` : ""}
            </div>
          </div>
        `;
      }).join("");
    }

    let _detalleMovId = null;

    function cerrarDetalleMovimiento() {
      _detalleMovId = null;
      const ov = document.getElementById("mov-detail-overlay");
      if (ov) ov.classList.add("hidden");
    }

    function abrirDetalleMovimiento(rowId) {
      const mov = (movimientos || []).find(m =>
        String(m.id) === String(rowId) || String(m.row) === String(rowId)
      );
      if (!mov) return showToast("No se encontró el movimiento", "error");
      _detalleMovId = String(mov.id != null ? mov.id : mov.row);

      const miembros = miembrosMovimiento(mov);
      const esGrupo = miembros.length > 1 || mov.empleado === "Grupo";
      const unit = Number(mov.monto) || 0;
      const total = esGrupo ? Math.round(unit * Math.max(miembros.length, 1) * 100) / 100 : unit;
      const metodo = parseMetodoFromNotas(mov.notas);
      const nota = notasVisibles(mov.notas);
      const isNegocio = esMovimientoGastoNegocio(mov) || esMovimientoIngresoNegocio(mov);

      document.getElementById("mov-detail-title").textContent =
        (isNegocio ? (mov.tipo || "Negocio") : (esGrupo ? "Movimiento grupal" : "Movimiento")) +
        " · " + (mov.tipo || "");

      const row = (label, val, cls) => `<div class="flex justify-between gap-3 py-1.5 border-b border-[var(--border-subtle)] last:border-0">
          <span class="text-[var(--text-muted)] text-xs shrink-0 pt-0.5">${label}</span>
          <span class="text-right text-[13px] font-medium ${cls || "text-[var(--text)]"}">${val}</span>
        </div>`;

      let html = "";
      if (isNegocio) {
        html += row("Monto", formatMoney(unit), "text-aragan-yellow");
      } else if (esGrupo) {
        html += row("Personas", String(miembros.length));
        html += row("Monto total", formatMoney(total), "text-aragan-yellow");
        html += row("Por cada uno", formatMoney(unit), "text-[var(--text-secondary)]");
        html += `<div class="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-3 mt-2">
          <div class="text-[10px] uppercase tracking-wide text-[var(--text-dim)] font-semibold mb-1.5">Integrantes</div>
          <div class="text-[13px] text-[var(--text-secondary)] leading-relaxed">${miembros.map(n => esc(n)).join(", ")}</div>
        </div>`;
      } else {
        html += row("Empleado", esc(etiquetaEmpleadosMov(mov)));
        html += row("Monto", formatMoney(unit), "text-aragan-yellow");
      }
      if (metodo) html += row("Método de pago", esc(metodo));
      html += row("Fecha", formatMovimientoCuando(mov) || formatDateDisplay(mov.fecha));
      if (mov.created_at) html += row("Registrado", formatDateTimeDisplay(mov.created_at), "text-[var(--text-muted)]");
      if (mov.responsable) html += row("Registró", esc(mov.responsable));
      if (nota) {
        html += `<div class="pt-2">
          <div class="text-[10px] uppercase tracking-wide text-[var(--text-dim)] font-semibold mb-1">Motivo / nota</div>
          <div class="text-[13px] text-[var(--text-secondary)] whitespace-pre-wrap break-words">${esc(nota)}</div>
        </div>`;
      }
      if (mov.semana) html += row("Semana (cierre)", formatDateDisplay(mov.semana), "text-[var(--text-muted)]");

      document.getElementById("mov-detail-body").innerHTML = html;

      const mid = _detalleMovId;
      let footer = `<button type="button" onclick="cerrarDetalleMovimiento()" class="btn-ghost flex-1 py-2.5 rounded-lg">Cerrar</button>`;
      if (puedeEditarMovimiento(mov)) {
        footer += `<button type="button" onclick="cerrarDetalleMovimiento(); abrirEditarMovimiento('${String(mid).replace(/'/g, "\\'")}')" class="btn-yellow flex-1 py-2.5 rounded-lg">Editar</button>`;
      }
      if (puedeBorrarMovimiento(mov)) {
        footer += `<button type="button" onclick="cerrarDetalleMovimiento(); borrarMovimiento('${String(mid).replace(/'/g, "\\'")}')" class="btn-ghost py-2.5 px-3 rounded-lg text-[#e08888]">Eliminar</button>`;
      }
      document.getElementById("mov-detail-footer").innerHTML = footer;
      document.getElementById("mov-detail-overlay").classList.remove("hidden");
    }

    async function borrarMovimiento(rowId) {
      if (!currentUser) return showToast("Inicia sesión", "error");
      const mov = (movimientos || []).find(m =>
        String(m.id) === String(rowId) || String(m.row) === String(rowId)
      );
      if (!mov) return showToast("No se encontró el movimiento", "error");
      if (!puedeBorrarMovimiento(mov)) {
        return showToast("No tienes permiso para eliminar este movimiento", "error");
      }
      if (!await uiConfirm("¿Eliminar este movimiento?\n\n" +
        (mov.empleado || "") + " · " + (mov.tipo || "") + " · " + formatMoney(mov.monto) + "\n" +
        formatDateDisplay(mov.fecha) + (mov.notas ? "\n" + notasVisibles(mov.notas) : "")
      )) return;

      const id = mov.id || mov.row || rowId;
      // Optimista: quitar de UI al instante para que se sienta rápido
      movimientos = movimientos.filter(m => String(m.id||m.row) !== String(id));
      aplicarDatosEnPantalla();
      try {
        try {
          await logAuditoria("DELETE", {
            id: mov.id || mov.row,
            fecha: mov.fecha,
            tipo: mov.tipo,
            monto: mov.monto,
            empleado: mov.empleado,
            notas: mov.notas,
            responsable: mov.responsable,
            semana: mov.semana
          });
        } catch (ae) { console.warn("audit", ae); }

        const { error } = await sb.from("movimientos").delete().eq("id", id);
        if (error) throw error;

        showToast("Movimiento eliminado · sincronizado");
        // Realtime actualizará a los demás, pero refrescamos nosotros también
        // No llamamos a cargarTodo completo para no parpadear
      } catch (err) {
        console.error(err);
        showToast(err.message || "Error al borrar, restaurando", "error");
        // revertir optimista
        await cargarTodoOptimizado();
      }
    }
    function abrirEditarMovimiento(rowId) {
      const mov = (movimientos || []).find(m =>
        String(m.id) === String(rowId) || String(m.row) === String(rowId)
      );
      if (!mov) return showToast("No se encontró el movimiento", "error");
      if (!puedeEditarMovimiento(mov)) {
        return showToast("No se puede editar", "error");
      }
      editandoMovId = String(mov.id || mov.row);
      document.getElementById("edit-mov-id").value = editandoMovId;
      document.getElementById("edit-mov-fecha").value = mov.fecha || "";
      document.getElementById("edit-mov-notas").value = notasVisibles(mov.notas) || "";
      document.getElementById("edit-mov-tipo").value = mov.tipo || "Adelanto";

      const selEmp = document.getElementById("edit-mov-empleado");
      const isNegocio = mov.tipo === "Gasto" || mov.tipo === "Ingreso" || (mov.empleado || "").toLowerCase() === "negocio";
      let opts = (empleados || []).map(e =>
        `<option value="${esc(e.empleado)}">${esc(e.empleado)}</option>`
      ).join("");
      opts = `<option value="Negocio">Negocio</option><option value="Grupo">Grupo</option>` + opts;
      selEmp.innerHTML = opts || `<option value="">Sin empleados</option>`;
      const miembros = miembrosMovimiento(mov);
      const esGrupo = miembros.length > 1 || mov.empleado === "Grupo";
      if (isNegocio) {
        selEmp.value = "Negocio";
      } else if (esGrupo) {
        selEmp.value = "Grupo";
      } else {
        selEmp.value = miembros[0] || mov.empleado || "";
      }

      const unit = Number(mov.monto) || 0;
      // En grupales, por defecto mostrar el TOTAL original (lo que se dividió)
      if (esGrupo && miembros.length > 1) {
        editModoMonto = "total";
        const total = Math.round(unit * miembros.length * 100) / 100;
        document.getElementById("edit-mov-monto").value = total > 0 ? total : "";
      } else {
        editModoMonto = "individual";
        document.getElementById("edit-mov-monto").value = mov.monto != null ? mov.monto : "";
      }

      const metodo = parseMetodoFromNotas(mov.notas);
      document.getElementById("edit-mov-metodo").value = metodo || "";
      onEditTipoChange();
      renderEditGrupoLista(miembros.length ? miembros : (mov.empleado && mov.empleado !== "Grupo" ? [mov.empleado] : []));
      setEditModoMonto(editModoMonto, false);

      const hint = document.getElementById("edit-mov-hint");
      if (hint) {
        if (currentUser.rol === "admin") {
          hint.textContent = "";
        } else {
          hint.textContent = "";
        }
      }
      // Empleado: limitar tipos en el select
      const tipoSel = document.getElementById("edit-mov-tipo");
      if (currentUser.rol !== "admin") {
        [...tipoSel.options].forEach(o => {
          o.hidden = !(o.value === "Adelanto" || o.value === "Gasto" || o.value === "Ingreso" || o.value === "Fiado");
        });
      } else {
        [...tipoSel.options].forEach(o => { o.hidden = false; });
      }
      document.getElementById("edit-mov-overlay").classList.remove("hidden");
      actualizarEditMontoHint();
    }

    function onEditTipoChange() {
      const tipo = document.getElementById("edit-mov-tipo")?.value;
      const box = document.getElementById("edit-mov-metodo-box");
      if (box) box.classList.toggle("hidden", !tipoRequiereMetodo(tipo));
      const selEmp = document.getElementById("edit-mov-empleado");
      const grupoBox = document.getElementById("edit-mov-grupo-box");
      const modoBox = document.getElementById("edit-mov-modo-box");
      if (tipo === "Gasto" || tipo === "Ingreso") {
        if (selEmp) {
          selEmp.value = "Negocio";
          selEmp.classList.remove("hidden");
        }
        if (grupoBox) grupoBox.classList.add("hidden");
        if (modoBox) modoBox.classList.add("hidden");
      } else {
        if (selEmp) selEmp.classList.add("hidden");
        if (grupoBox) grupoBox.classList.remove("hidden");
        // si lista vacía, rellenar con todos sin marcar
        const cont = document.getElementById("edit-mov-grupo-lista");
        if (cont && !cont.children.length) renderEditGrupoLista([]);
        // Fiado siempre es individual (igual que al crear): si venía de un tipo grupal,
        // deja marcado solo el primero para no crear un "Fiado grupal" por accidente.
        if (tipo === "Fiado") {
          const checks = [...document.querySelectorAll(".edit-grupo-check:checked")];
          checks.slice(1).forEach(c => { c.checked = false; });
        }
      }
      actualizarEditMontoHint();
    }

    function setEditModoMonto(modo, preserveValue) {
      const prev = editModoMonto;
      editModoMonto = modo === "individual" ? "individual" : "total";
      const btnTotal = document.getElementById("edit-modo-total");
      const btnInd = document.getElementById("edit-modo-individual");
      [btnTotal, btnInd].forEach(b => {
        if (!b) return;
        b.classList.remove("modo-active");
      });
      const active = editModoMonto === "individual" ? btnInd : btnTotal;
      if (active) active.classList.add("modo-active");

      // Al cambiar de modo, convertir el valor del input para que no se "pierda" el total
      if (preserveValue !== false) {
        const input = document.getElementById("edit-mov-monto");
        const n = document.querySelectorAll(".edit-grupo-check:checked").length;
        const val = parseFloat(input?.value) || 0;
        if (input && n > 1 && val > 0 && prev !== editModoMonto) {
          if (editModoMonto === "total" && prev === "individual") {
            // por persona → total
            input.value = String(Math.round(val * n * 100) / 100);
          } else if (editModoMonto === "individual" && prev === "total") {
            // total → por persona
            input.value = String(Math.round((val / n) * 100) / 100);
          }
        }
      }
      actualizarEditMontoHint();
    }

    function actualizarEditMontoHint() {
      const hint = document.getElementById("edit-mov-monto-hint");
      const label = document.getElementById("edit-mov-monto-label");
      const modoBox = document.getElementById("edit-mov-modo-box");
      if (!hint) return;
      const tipo = document.getElementById("edit-mov-tipo")?.value;
      const monto = parseFloat(document.getElementById("edit-mov-monto")?.value) || 0;
      if (tipo === "Gasto" || tipo === "Ingreso") {
        if (modoBox) modoBox.classList.add("hidden");
        if (label) label.textContent = "Monto";
        hint.textContent = monto > 0 ? `${tipo} del negocio: ${formatMoney(monto)}` : "";
        return;
      }
      const checks = [...document.querySelectorAll(".edit-grupo-check:checked")];
      const n = checks.length;
      if (n > 1) {
        if (modoBox) modoBox.classList.remove("hidden");
        // sincronizar estilo de botones
        const btnTotal = document.getElementById("edit-modo-total");
        const btnInd = document.getElementById("edit-modo-individual");
        if (btnTotal && btnInd) {
          btnTotal.classList.toggle("modo-active", editModoMonto === "total");
          btnInd.classList.toggle("modo-active", editModoMonto === "individual");
        }
        if (editModoMonto === "total") {
          if (label) label.textContent = "Monto total (a dividir)";
          if (monto > 0) {
            const cada = Math.round((monto / n) * 100) / 100;
            hint.textContent = `Total ${formatMoney(monto)} ÷ ${n} = ${formatMoney(cada)} por persona`;
          } else {
            hint.textContent = `${n} personas · escribe el total que se dividirá entre todos`;
          }
        } else {
          if (label) label.textContent = "Monto por persona";
          if (monto > 0) {
            const total = Math.round(monto * n * 100) / 100;
            hint.textContent = `${formatMoney(monto)} c/u × ${n} = Total ${formatMoney(total)}`;
          } else {
            hint.textContent = `${n} personas · indica el monto por cada uno`;
          }
        }
      } else if (n === 1) {
        if (modoBox) modoBox.classList.add("hidden");
        if (label) label.textContent = "Monto";
        hint.textContent = monto > 0 ? `Se aplicará ${formatMoney(monto)} a ${checks[0].value}` : "";
      } else {
        if (modoBox) modoBox.classList.add("hidden");
        if (label) label.textContent = "Monto";
        hint.textContent = "";
      }
    }

    function renderEditGrupoLista(selectedNames) {
      const cont = document.getElementById("edit-mov-grupo-lista");
      const grupoBox = document.getElementById("edit-mov-grupo-box");
      const selEmp = document.getElementById("edit-mov-empleado");
      if (!cont) return;
      const selected = new Set(selectedNames || []);
      cont.innerHTML = (empleados || []).map(e => {
        const name = e.empleado || "";
        const checked = selected.has(name);
        return `<label class="flex items-center gap-2 px-2 py-1.5 rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] cursor-pointer text-[12px]">
          <input type="checkbox" class="edit-grupo-check accent-[#c9a227]" value="${esc(name)}" ${checked ? "checked" : ""} onchange="onEditGrupoToggle(this)" />
          <span class="truncate text-gray-200">${esc(name)}</span>
        </label>`;
      }).join("") || `<p class="text-xs text-gray-500">Sin empleados</p>`;
      if (grupoBox) grupoBox.classList.remove("hidden");
      if (selEmp) selEmp.classList.add("hidden");
    }

    function seleccionarEditGrupo(todos) {
      const tipo = document.getElementById("edit-mov-tipo")?.value;
      if (todos && tipo === "Fiado") {
        return showToast("Fiado es individual: selecciona solo 1 empleado", "error");
      }
      document.querySelectorAll(".edit-grupo-check").forEach(c => { c.checked = !!todos; });
      actualizarEditMontoHint();
    }

    /** Como en creación: Fiado no admite varios empleados a la vez (selección tipo radio). */
    function onEditGrupoToggle(el) {
      const tipo = document.getElementById("edit-mov-tipo")?.value;
      if (tipo === "Fiado" && el.checked) {
        document.querySelectorAll(".edit-grupo-check").forEach(c => {
          if (c !== el) c.checked = false;
        });
      }
      actualizarEditMontoHint();
    }

    function obtenerEmpleadosEdit() {
      const tipo = document.getElementById("edit-mov-tipo")?.value;
      if (tipo === "Gasto" || tipo === "Ingreso") return ["Negocio"];
      const checks = [...document.querySelectorAll(".edit-grupo-check:checked")].map(c => c.value);
      if (checks.length) return checks;
      const sel = document.getElementById("edit-mov-empleado")?.value;
      return sel && sel !== "Grupo" ? [sel] : [];
    }

    function cerrarEditarMovimiento() {
      editandoMovId = null;
      document.getElementById("edit-mov-overlay").classList.add("hidden");
    }

    async function guardarEdicionMovimiento() {
      if (!editandoMovId || isSaving) return;
      const mov = (movimientos || []).find(m =>
        String(m.id) === String(editandoMovId) || String(m.row) === String(editandoMovId)
      );
      if (!mov) return showToast("Movimiento no encontrado", "error");
      if (!puedeEditarMovimiento(mov)) {
        return showToast("Ya no puedes editar este movimiento", "error");
      }

      const fecha = document.getElementById("edit-mov-fecha").value;
      const tipo = document.getElementById("edit-mov-tipo").value;
      let montoRaw = parseFloat(document.getElementById("edit-mov-monto").value);
      let notas = (document.getElementById("edit-mov-notas").value || "").trim();
      const metodo = document.getElementById("edit-mov-metodo")?.value || "";
      const empsSel = obtenerEmpleadosEdit();

      if (!fecha) return showToast("Elige una fecha", "error");
      if (!tipo) return showToast("Elige un tipo", "error");
      if (!empsSel.length) return showToast("Elige al menos un empleado", "error");
      if (tipo === "Fiado" && empsSel.length > 1) {
        return showToast("Fiado es individual: selecciona solo 1 empleado", "error");
      }
      if (!montoRaw || montoRaw <= 0) return showToast("Monto inválido", "error");
      if (!notas) return showToast("La nota es obligatoria", "error");
      if (tipoRequiereMetodo(tipo) && !metodo) {
        return showToast("Elige método de pago", "error");
      }
      // Editar permitido para todos los roles y tipos

      // Siempre guardar monto POR PERSONA (igual que al crear)
      let monto = montoRaw;
      if (tipo !== "Gasto" && tipo !== "Ingreso" && empsSel.length > 1) {
        if (editModoMonto === "total") {
          monto = Math.round((montoRaw / empsSel.length) * 100) / 100;
        } else {
          monto = Math.round(montoRaw * 100) / 100;
        }
      } else {
        monto = Math.round(montoRaw * 100) / 100;
      }

      if (tipoRequiereMetodo(tipo)) {
        notas = notasConMetodo(notas, metodo);
      } else {
        notas = stripMetodoMeta(notas);
      }
      const cuotaOld = parseCuotaFromNotas(mov.notas);
      if ((tipo === "Prestamo") && cuotaOld > 0 && !/\[cuota:/i.test(notas)) {
        notas = (notas + " [cuota:" + cuotaOld + "]").trim();
      }
      const pidOld = parsePrestamoIdFromNotas(mov.notas);
      if ((tipo === "CuotaPrestamo") && pidOld && !/\[pid:/i.test(notas)) {
        notas = notasConPrestamoId(notas, pidOld);
      }

      let empleadoField = empsSel[0];
      if (tipo === "Gasto" || tipo === "Ingreso") {
        empleadoField = "Negocio";
        notas = stripGrupoMeta(notas);
      } else if (empsSel.length > 1) {
        empleadoField = "Grupo";
        notas = notasConGrupo(notas, empsSel);
      } else {
        empleadoField = empsSel[0];
        notas = stripGrupoMeta(notas);
      }

      const semana = semanaDesdeFecha(fecha);
      const patch = {
        fecha,
        empleado: empleadoField,
        tipo,
        monto,
        notas,
        semana
      };

      isSaving = true;
      const btn = document.getElementById("btn-guardar-edit-mov");
      setButtonLoading(btn, true, "Guardar cambios");
      try {
        const id = String(editandoMovId);
        let updated = null;
        let lastErr = null;
        const candidates = [id];
        if (/^\d+$/.test(id)) {
          const n = Number(id);
          if (Number.isFinite(n) && String(n) === id) candidates.push(n);
        }
        for (const tryId of candidates) {
          const { data, error } = await sb
            .from("movimientos")
            .update(patch)
            .eq("id", tryId)
            .select("*");
          if (error) {
            lastErr = error;
            continue;
          }
          if (data && data.length) {
            updated = data[0];
            break;
          }
        }
        if (!updated) {
          // REST fallback
          const headers = await getAuthHeaders();
          for (const tryId of candidates) {
            const res = await fetch(
              SUPABASE_URL + "/rest/v1/movimientos?id=eq." + encodeURIComponent(tryId),
              { method: "PATCH", headers, body: JSON.stringify(patch) }
            );
            const bodyText = await res.text();
            if (res.ok) {
              try {
                const arr = JSON.parse(bodyText);
                if (Array.isArray(arr) && arr[0]) { updated = arr[0]; break; }
              } catch (_) {}
              if (res.status === 200 || res.status === 204) { updated = patch; break; }
            } else {
              lastErr = { message: bodyText };
            }
          }
        }
        if (!updated) {
          throw new Error((lastErr && lastErr.message) || "No se actualizó ninguna fila (revisa políticas UPDATE en Supabase)");
        }
        try {
          await logAuditoria("UPDATE", {
            id: mov.id,
            antes: { fecha: mov.fecha, tipo: mov.tipo, monto: mov.monto, empleado: mov.empleado, notas: mov.notas },
            despues: patch,
            responsable: currentUser.usuario || ""
          });
        } catch (_) {}
        showToast("Movimiento actualizado");
        cerrarEditarMovimiento();
        await cargarTodo();
      } catch (err) {
        console.error(err);
        showToast(err.message || "Error al guardar", "error");
      } finally {
        isSaving = false;
        setButtonLoading(btn, false, "Guardar cambios");
      }
    }

    async function confirmarBorrarTodo() {
      if (!currentUser || currentUser.rol !== "admin") {
        return showToast("Solo admin puede borrar el historial", "error");
      }
      if (!await uiConfirm("¿Estás seguro de borrar TODO el historial? Esta acción no se puede deshacer.")) return;
      if (!await uiConfirm("Última confirmación: se borrarán todos los movimientos.")) return;
      try {
        const { error } = await sb.from("movimientos").delete().not("fecha", "is", null);
        if (error) throw error;
        showToast("Historial borrado");
        await cargarTodo();
      } catch (err) {
        showToast("Error de conexión", "error");
      }
    }

    async function confirmarBorrarSemana() {
      if (!currentUser || currentUser.rol !== "admin") {
        return showToast("Solo admin puede borrar la semana", "error");
      }
      try { document.querySelectorAll("[id$='-menu']").forEach(m => m.classList.add("hidden")); } catch (e) {}
      const semana = getSemanaSeleccionada();
      const semanaStr = localDateStr(semana);
      const deSemana = movimientosDeSemana(semanaStr);
      const count = deSemana.length;
      if (count === 0) {
        showToast("No hay movimientos en la semana del " + formatDateDisplay(semanaStr) + " (revisa las flechas de semana)", "error");
        console.warn("Borrar semana: 0 mov. semanaStr=", semanaStr, "total mov=", movimientos.length, "muestras semana=", movimientos.slice(0,5).map(m => m.semana));
        return;
      }
      if (!await uiConfirm(`¿Borrar los ${count} movimiento(s) de la semana que cierra el ${formatDateDisplay(semanaStr)}?`)) return;
      if (!await uiConfirm("Última confirmación: solo se borra esta semana, no todo el historial.")) return;
      try {
        for (const mov of deSemana) {
          try {
            await logAuditoria("DELETE_SEMANA", {
              id: mov.id || mov.row,
              fecha: mov.fecha,
              tipo: mov.tipo,
              monto: mov.monto,
              empleado: mov.empleado,
              notas: mov.notas,
              responsable: mov.responsable,
              semana: mov.semana || semanaStr
            });
          } catch (ae) { console.warn("audit DELETE_SEMANA", ae); }
        }
        const ids = deSemana.map(m => m.row || m.id).filter(id => id != null);
        if (!ids.length) throw new Error("No se obtuvieron IDs de movimientos");
        // Borrar por ID (más fiable que .eq('semana') si hay desfase de fechas)
        const { error, count: c } = await sb.from("movimientos").delete({ count: "exact" }).in("id", ids);
        if (error) throw error;
        showToast(`Semana borrada (${c != null ? c : ids.length} mov.)`);
        await cargarTodo();
      } catch (err) {
        console.error(err);
        showToast(err.message || "Error al borrar semana", "error");
      }
    }

