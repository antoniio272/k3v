    // =====================================================
    // HISTORIAL
    // =====================================================
    function llenarFiltros() {
      const sel = document.getElementById("filtro-empleado");
      const actual = sel.value;
      sel.innerHTML = `<option value="">Todos los empleados</option>` +
        empleados.map(e => `<option value="${esc(e.empleado)}">${esc(e.empleado)}</option>`).join("");
      sel.value = actual;
    }



    function renderIngresosNegocio() {
      const cont = document.getElementById("ingresos-negocio-lista");
      const empty = document.getElementById("ingresos-negocio-empty");
      const summary = document.getElementById("ingresos-negocio-summary");
      if (!cont) return;
      const lista = sortMovimientosRecientesPrimero(
        (movimientos || []).filter(esMovimientoIngresoNegocio)
      );
      if (summary) {
        const total = lista.reduce((s, m) => s + (Number(m.monto) || 0), 0);
        const semanaStr = localDateStr(getSemanaSeleccionada());
        const deSemana = lista.filter(m => (m.semana || "").slice(0, 10) === semanaStr);
        const totalSemana = deSemana.reduce((s, m) => s + (Number(m.monto) || 0), 0);
        summary.innerHTML = `
          <div class="summary-pill"><div class="text-[11px] text-gray-500 uppercase tracking-wide">Total histórico</div><div class="text-lg font-bold text-[#5ecf8f]">${formatMoney(total)}</div></div>
          <div class="summary-pill"><div class="text-[11px] text-gray-500 uppercase tracking-wide">Esta semana</div><div class="text-lg font-bold text-white">${formatMoney(totalSemana)}</div></div>
          <div class="summary-pill"><div class="text-[11px] text-gray-500 uppercase tracking-wide">Registros</div><div class="text-lg font-bold text-gray-300">${lista.length}</div></div>
        `;
      }
      if (!lista.length) {
        cont.innerHTML = "";
        if (empty) empty.classList.remove("hidden");
        return;
      }
      if (empty) empty.classList.add("hidden");
      const isAdmin = currentUser && currentUser.rol === "admin";
      cont.innerHTML = lista.map(m => `
        <div class="card rounded-xl p-4 flex items-start justify-between gap-3">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="tabular-nums font-semibold text-white">${formatMoney(m.monto)}</span>
            </div>
            <div class="text-sm text-gray-400 mt-1.5">${formatMovimientoCuando(m)}${notasVisibles(m.notas) ? ` · ${esc(notasVisibles(m.notas))}` : ""}</div>
            ${m.responsable ? `<div class="text-[11px] text-gray-500 mt-1">Registró: <span class="text-gray-300">${esc(m.responsable)}</span></div>` : ""}
          </div>
          <div class="flex flex-col gap-1 shrink-0">
            ${puedeEditarMovimiento(m) ? `<button type="button" onclick='abrirEditarMovimiento("${escAttr(String(m.id != null ? m.id : m.row))}")' class="text-aragan-yellow text-xs px-2 py-1.5 rounded-md">Editar</button>` : ""}
            ${puedeBorrarMovimiento(m) ? `<button type="button" onclick='borrarMovimiento("${escAttr(String(m.id != null ? m.id : m.row))}")' class="text-gray-500 hover:text-[#e08888] text-xs px-2 py-1.5 rounded-md">Eliminar</button>` : ""}
          </div>
        </div>
      `).join("");
    }

    function llenarSelectPrestamo() {
      const sel = document.getElementById("prestamo-empleado");
      if (!sel) return;
      const prev = sel.value;
      sel.innerHTML = (empleados || []).map(e =>
        `<option value="${esc(e.empleado)}">${esc(e.empleado)}</option>`
      ).join("") || `<option value="">Sin empleados</option>`;
      if (prev && [...sel.options].some(o => o.value === prev)) sel.value = prev;
      const f = document.getElementById("prestamo-fecha");
      if (f && !f.value) f.value = localDateStr(new Date());
    }

    function renderPrestamos() {
      llenarSelectPrestamo();
      const cont = document.getElementById("prestamos-lista");
      const empty = document.getElementById("prestamos-empty");
      const bulkHint = document.getElementById("prestamos-bulk-hint");
      if (!cont) return;
      const todos = resumenPrestamos();
      const visibles = todos.filter(r => r.enCurso || r.liquidadoReciente);
      if (!visibles.length) {
        cont.innerHTML = "";
        if (empty) empty.classList.remove("hidden");
        if (bulkHint) bulkHint.textContent = "No hay préstamos en curso.";
        return;
      }
      if (empty) empty.classList.add("hidden");

      const sem = localDateStr(getSemanaSeleccionada());
      const prevExcluded = new Set(
        [...document.querySelectorAll(".prestamo-excluir:checked")].map(c => c.value)
      );

      // en curso primero; dentro del mismo estado, por empleado y fecha
      const ordenados = visibles.slice().sort((a, b) => {
        if (a.enCurso !== b.enCurso) return a.enCurso ? -1 : 1;
        const ea = String(a.empleado || "").localeCompare(String(b.empleado || ""));
        if (ea) return ea;
        return String(a.fecha || "").localeCompare(String(b.fecha || ""));
      });

      cont.innerHTML = ordenados.map(r => {
        const pid = String(r.prestamoId || "");
        const cuotasHtml = (r.cuotas || []).slice().sort((a,b) => (b.fecha||"").localeCompare(a.fecha||"")).slice(0, 8).map(c =>
          `<div class="flex justify-between text-xs text-gray-400 py-1 border-b border-gray-800"><span>${formatDateDisplay(c.fecha)}${c._fifoLegacy ? ' <span class="text-[10px] text-gray-600">(hist.)</span>' : ""}</span><span class="text-[#e8b04a]">-${formatMoney(c.monto)}</span></div>`
        ).join("") || `<p class="text-xs text-gray-500">Sin cuotas</p>`;
        const notaCorta = notasVisibles(r.notas || "").slice(0, 40);

        if (!r.enCurso) {
          const diasRestantes = Math.max(0, DIAS_GRACIA_PRESTAMO_LIQUIDADO - (r.diasLiquidado || 0));
          return `
            <div class="card rounded-xl p-5 space-y-3 opacity-70" data-prestamo-id="${esc(pid)}" data-emp-prestamo="${esc(r.empleado)}">
              <div class="flex flex-wrap items-start justify-between gap-2">
                <div class="min-w-0">
                  <h4 class="font-semibold text-white text-base">${esc(r.empleado)}</h4>
                  <p class="text-xs text-[#5ecf8f] mt-0.5">✅ Liquidado</p>
                  <p class="text-[11px] text-gray-500 mt-0.5">Préstamo del ${formatDateDisplay(r.fecha)}${notaCorta ? " · " + esc(notaCorta) : ""}</p>
                </div>
                <div class="text-right">
                  <div class="text-[11px] text-gray-500 uppercase">Saldo pendiente</div>
                  <div class="text-xl font-bold text-[#5ecf8f]">${formatMoney(0)}</div>
                </div>
              </div>
              <div class="grid grid-cols-3 gap-2">
                <div class="summary-pill"><div class="text-[10px] text-gray-500 uppercase">Prestado</div><div class="font-semibold text-white">${formatMoney(r.prestado)}</div></div>
                <div class="summary-pill"><div class="text-[10px] text-gray-500 uppercase">Pagado</div><div class="font-semibold text-[#5ecf8f]">${formatMoney(r.pagado)}</div></div>
                <div class="summary-pill"><div class="text-[10px] text-gray-500 uppercase">Cuota</div><div class="font-semibold text-gray-300">${formatMoney(r.cuota)}</div></div>
              </div>
            </div>
          `;
        }

        const excl = prevExcluded.has(pid);
        const aplicada = cuotaAplicadaEnSemanaPrestamo(pid, sem);
        const montoCuota = Math.min(Number(r.cuota) || 500, Number(r.saldo) || 0);
        return `
          <div class="card rounded-xl p-5 space-y-3" data-prestamo-id="${esc(pid)}" data-emp-prestamo="${esc(r.empleado)}">
            <div class="flex flex-wrap items-start justify-between gap-2">
              <div class="flex items-start gap-3 min-w-0">
                <label class="flex items-center gap-2 shrink-0 cursor-pointer select-none mt-0.5" title="Excluir de cobro masivo">
                  <input type="checkbox" class="prestamo-excluir accent-[#c9a227]" value="${esc(pid)}" ${excl ? "checked" : ""} onchange="actualizarBulkHintPrestamos()" />
                  <span class="text-[11px] text-gray-500 leading-tight">Excluir</span>
                </label>
                <div class="min-w-0">
                  <h4 class="font-semibold text-white text-base">${esc(r.empleado)}</h4>
                  <p class="text-xs text-gray-500 mt-0.5">Cuota: <span class="text-aragan-yellow font-medium">${formatMoney(r.cuota || 500)}</span>
                    · del ${formatDateDisplay(r.fecha)}
                    ${notaCorta ? " · " + esc(notaCorta) : ""}
                  </p>
                </div>
              </div>
              <div class="text-right">
                <div class="text-[11px] text-gray-500 uppercase">Saldo pendiente</div>
                <div class="text-xl font-bold text-[#e8b04a]">${formatMoney(r.saldo)}</div>
              </div>
            </div>
            <div class="grid grid-cols-3 gap-2">
              <div class="summary-pill"><div class="text-[10px] text-gray-500 uppercase">Prestado</div><div class="font-semibold text-white">${formatMoney(r.prestado)}</div></div>
              <div class="summary-pill"><div class="text-[10px] text-gray-500 uppercase">Pagado</div><div class="font-semibold text-[#5ecf8f]">${formatMoney(r.pagado)}</div></div>
              <div class="summary-pill"><div class="text-[10px] text-gray-500 uppercase">Cuotas pend.</div><div class="font-semibold text-gray-300">~${r.pendientes}</div></div>
            </div>
            <div>
              <div class="text-[11px] text-gray-500 uppercase mb-1">Últimas cuotas</div>
              ${cuotasHtml}
            </div>
            <div class="flex flex-wrap gap-2 pt-1 items-center">
              ${aplicada
                ? `<span class="text-xs text-[#5ecf8f]">Cuota aplicada esta semana</span>`
                : `<span class="text-xs text-gray-500">Pendiente esta semana: ${formatMoney(montoCuota)}</span>`
              }
              <button type="button" class="btn-outline px-3 py-2 rounded-lg text-xs" onclick='aplicarCuotaPrestamo(${jsArg(r.empleado)}, ${Number(r.cuota) || 500}, ${Number(r.saldo) || 0}, ${jsArg(pid)})'>Aplicar solo a este</button>
            </div>
          </div>
        `;
      }).join("");
      actualizarBulkHintPrestamos();
    }

    function actualizarBulkHintPrestamos() {
      const bulkHint = document.getElementById("prestamos-bulk-hint");
      if (!bulkHint) return;
      const enCurso = resumenPrestamos().filter(r => r.enCurso);
      if (!enCurso.length) {
        bulkHint.textContent = "No hay préstamos en curso.";
        return;
      }
      const excluded = new Set([...document.querySelectorAll(".prestamo-excluir:checked")].map(c => c.value));
      const sem = localDateStr(getSemanaSeleccionada());
      const aCobrar = enCurso.filter(r =>
        !excluded.has(String(r.prestamoId)) &&
        !cuotaAplicadaEnSemanaPrestamo(r.prestamoId, sem)
      );
      const excluidos = enCurso.filter(r => excluded.has(String(r.prestamoId))).length;
      const ya = enCurso.filter(r => cuotaAplicadaEnSemanaPrestamo(r.prestamoId, sem)).length;
      const totalMonto = aCobrar.reduce((s, r) => s + Math.min(Number(r.cuota) || 500, Number(r.saldo) || 0), 0);
      bulkHint.textContent = aCobrar.length
        ? `Se descontará a ${aCobrar.length} préstamo(s) · total aprox. ${formatMoney(totalMonto)}` +
          (excluidos ? ` · ${excluidos} excluido(s)` : "") +
          (ya ? ` · ${ya} ya cobrado(s) esta semana` : "")
        : ("Nadie pendiente de cobro esta semana" +
          (excluidos ? ` (${excluidos} excluido(s))` : "") +
          (ya ? ` · ${ya} ya cobrado(s)` : ""));
    }

    async function aplicarCuotasMasivas() {
      if (!currentUser || currentUser.rol !== "admin") {
        return showToast("Solo admin", "error");
      }
      if (isSaving) return;
      const enCurso = resumenPrestamos().filter(r => r.enCurso && r.saldo > 0);
      if (!enCurso.length) return showToast("No hay préstamos en curso", "error");

      const excluded = new Set([...document.querySelectorAll(".prestamo-excluir:checked")].map(c => c.value));
      const semana = localDateStr(getSemanaSeleccionada());
      const fecha = localDateStr(new Date());
      const pendientes = [];
      for (const r of enCurso) {
        if (excluded.has(String(r.prestamoId))) continue;
        if (cuotaAplicadaEnSemanaPrestamo(r.prestamoId, semana)) continue;
        const monto = Math.min(Number(r.cuota) || 500, Number(r.saldo) || 0);
        if (monto <= 0) continue;
        pendientes.push({
          empleado: r.empleado,
          monto,
          prestamoId: r.prestamoId,
          cuota: r.cuota
        });
      }
      if (!pendientes.length) {
        return showToast("Nadie para cobrar: todos excluidos o ya tienen cuota esta semana", "error");
      }
      const total = pendientes.reduce((s, p) => s + p.monto, 0);
      const nombres = pendientes.map(p => p.empleado + " (" + formatMoney(p.monto) + ")");
      const listaNombres = nombres.length <= 5
        ? nombres.join(", ")
        : nombres.slice(0, 4).join(", ") + ` y ${nombres.length - 4} más`;
      if (!await uiConfirm(
        `¿Descontar cuota a ${pendientes.length} préstamo(s) en la semana que cierra ${formatDateDisplay(semana)}?\n\n` +
        `Total aprox.: ${formatMoney(total)}\n` +
        `Detalle: ${listaNombres}\n\n` +
        `Se restará del sueldo de esa semana.`
      )) return;

      isSaving = true;
      const btn = document.getElementById("btn-bulk-cuotas");
      setButtonLoading(btn, true, "Descontar a todos");
      try {
        const rows = pendientes.map(p => ({
          fecha,
          empleado: p.empleado,
          tipo: "CuotaPrestamo",
          monto: Math.round(p.monto * 100) / 100,
          notas: notasConPrestamoId(`Cuota préstamo semana ${semana}`, p.prestamoId),
          semana,
          responsable: currentUser.usuario || ""
        }));
        const { data, error } = await sb.from("movimientos").insert(rows).select("*");
        if (error) throw error;
        try {
          const toAudit = (data && data.length) ? data : rows;
          for (const row of toAudit) {
            await logAuditoria("INSERT", {
              id: row.id,
              fecha: row.fecha,
              tipo: row.tipo,
              monto: row.monto,
              empleado: row.empleado,
              notas: row.notas,
              responsable: row.responsable,
              semana: row.semana
            });
          }
        } catch (_) {}
        showToast(`Listo: ${rows.length} cuota(s) aplicadas · ${formatMoney(total)}`);
        await cargarTodo();
        showTab("prestamos");
      } catch (err) {
        console.error(err);
        showToast(err.message || "Error al aplicar cuotas", "error");
      } finally {
        isSaving = false;
        setButtonLoading(btn, false, "Descontar a todos");
      }
    }

    async function guardarPrestamo() {
      if (!currentUser || currentUser.rol !== "admin") {
        return showToast("Solo admin puede registrar préstamos", "error");
      }
      if (isSaving) return;
      const emp = document.getElementById("prestamo-empleado")?.value;
      const monto = parseFloat(document.getElementById("prestamo-monto")?.value);
      const cuota = parseFloat(document.getElementById("prestamo-cuota")?.value) || 500;
      const fecha = document.getElementById("prestamo-fecha")?.value || localDateStr(new Date());
      let notas = (document.getElementById("prestamo-notas")?.value || "").trim();
      if (!emp) return showToast("Elige empleado", "error");
      if (!monto || monto <= 0) return showToast("Monto inválido", "error");
      if (cuota <= 0) return showToast("Cuota inválida", "error");
      if (!notas) notas = "Préstamo";
      notas = `${notas} [cuota:${cuota}]`;

      if (!await uiConfirm(`¿Registrar préstamo de ${formatMoney(monto)} a ${emp} con cuota semanal ${formatMoney(cuota)}?`)) return;

      isSaving = true;
      const btn = document.getElementById("btn-guardar-prestamo");
      setButtonLoading(btn, true, "Registrar préstamo");
      try {
        const d = new Date(fecha + "T12:00:00");
        const daysToAdd = (3 - d.getDay() + 7) % 7;
        d.setDate(d.getDate() + daysToAdd);
        const semana = localDateStr(d);
        const row = {
          fecha,
          empleado: emp,
          tipo: "Prestamo",
          monto: Math.round(monto * 100) / 100,
          notas,
          semana,
          responsable: currentUser.usuario || ""
        };
        const { data, error } = await sb.from("movimientos").insert([row]).select("*");
        if (error) throw error;
        try {
          const inserted = (data && data[0]) || row;
          await logAuditoria("INSERT", {
            id: inserted.id,
            fecha: row.fecha,
            tipo: row.tipo,
            monto: row.monto,
            empleado: row.empleado,
            notas: row.notas,
            responsable: row.responsable,
            semana: row.semana
          });
        } catch (_) {}
        showToast("Préstamo registrado");
        document.getElementById("prestamo-monto").value = "";
        document.getElementById("prestamo-notas").value = "";
        await cargarTodo();
        showTab("prestamos");
      } catch (err) {
        console.error(err);
        showToast(err.message || "Error al guardar préstamo", "error");
      } finally {
        isSaving = false;
        setButtonLoading(btn, false, "Registrar préstamo");
      }
    }

    async function aplicarCuotaPrestamo(empleado, cuota, saldo, prestamoId) {
      if (!currentUser || currentUser.rol !== "admin") {
        return showToast("Solo admin", "error");
      }
      if (isSaving) return;
      const pid = prestamoId != null && String(prestamoId).trim() !== ""
        ? String(prestamoId).trim()
        : "";
      // Si no viene pid, intentar localizar el préstamo en curso del empleado (el de mayor saldo)
      let saldoReal = Number(saldo) || 0;
      let cuotaReal = Number(cuota) || 500;
      let pidFinal = pid;
      if (!pidFinal) {
        const candidatos = resumenPrestamos().filter(r => r.empleado === empleado && r.enCurso);
        if (!candidatos.length) return showToast("Sin préstamo en curso para este empleado", "error");
        candidatos.sort((a, b) => (b.saldo || 0) - (a.saldo || 0));
        pidFinal = String(candidatos[0].prestamoId);
        saldoReal = Number(candidatos[0].saldo) || 0;
        cuotaReal = Number(candidatos[0].cuota) || 500;
      } else {
        const loan = resumenPrestamos().find(r => String(r.prestamoId) === pidFinal);
        if (loan) {
          saldoReal = Number(loan.saldo) || 0;
          cuotaReal = Number(loan.cuota) || cuotaReal;
        }
      }
      const monto = Math.min(cuotaReal, saldoReal);
      if (monto <= 0) return showToast("Sin saldo pendiente en este préstamo", "error");
      const fecha = localDateStr(new Date());
      const semanaFin = getSemanaSeleccionada();
      const semana = localDateStr(semanaFin);
      if (!await uiConfirm(
        `¿Descontar cuota de ${formatMoney(monto)} a ${empleado}?\n` +
        `Semana que cierra: ${formatDateDisplay(semana)}\n` +
        `Se restará del sueldo y bajará el saldo del préstamo.`
      )) return;

      isSaving = true;
      try {
        if (cuotaAplicadaEnSemanaPrestamo(pidFinal, semana)) {
          if (!await uiConfirm("Ya hay una cuota de este mismo préstamo en esta semana. ¿Registrar otra igual?")) {
            isSaving = false;
            return;
          }
        }
        const row = {
          fecha,
          empleado,
          tipo: "CuotaPrestamo",
          monto: Math.round(monto * 100) / 100,
          notas: notasConPrestamoId(`Cuota préstamo semana ${semana}`, pidFinal),
          semana,
          responsable: currentUser.usuario || ""
        };
        const { data, error } = await sb.from("movimientos").insert([row]).select("*");
        if (error) throw error;
        try {
          const inserted = (data && data[0]) || row;
          await logAuditoria("INSERT", {
            id: inserted.id,
            fecha: row.fecha,
            tipo: row.tipo,
            monto: row.monto,
            empleado: row.empleado,
            notas: row.notas,
            responsable: row.responsable,
            semana: row.semana
          });
        } catch (_) {}
        showToast(`Cuota ${formatMoney(monto)} aplicada a ${empleado} (préstamo ${pidFinal})`);
        await cargarTodo();
        showTab("prestamos");
      } catch (err) {
        showToast(err.message || "Error", "error");
      } finally {
        isSaving = false;
      }
    }

    function renderGastosNegocio() {
      const cont = document.getElementById("gastos-negocio-lista");
      const empty = document.getElementById("gastos-negocio-empty");
      const summary = document.getElementById("gastos-negocio-summary");
      if (!cont) {
        console.warn("renderGastosNegocio: no existe #gastos-negocio-lista");
        return;
      }

      let lista = [];
      try {
        lista = sortMovimientosRecientesPrimero(
          (movimientos || []).filter(esMovimientoGastoNegocio)
        );
      } catch (e) {
        console.error("renderGastosNegocio filter", e);
        lista = (movimientos || []).filter(esMovimientoGastoNegocio);
      }

      if (summary) {
        const total = lista.reduce((s, m) => s + (Number(m.monto) || 0), 0);
        const semanaStr = localDateStr(getSemanaSeleccionada());
        const deSemana = lista.filter(m => (m.semana || "").slice(0, 10) === semanaStr
          || (movimientosDeSemana(semanaStr).some(x => (x.row || x.id) === (m.row || m.id))));
        const totalSemana = deSemana.reduce((s, m) => s + (Number(m.monto) || 0), 0);
        summary.innerHTML = `
          <div class="summary-pill">
            <div class="text-[11px] text-gray-500 uppercase tracking-wide">Total histórico</div>
            <div class="text-lg font-bold text-[#e08888]">${formatMoney(total)}</div>
          </div>
          <div class="summary-pill">
            <div class="text-[11px] text-gray-500 uppercase tracking-wide">Esta semana</div>
            <div class="text-lg font-bold text-white">${formatMoney(totalSemana)}</div>
          </div>
          <div class="summary-pill">
            <div class="text-[11px] text-gray-500 uppercase tracking-wide">Registros</div>
            <div class="text-lg font-bold text-gray-300">${lista.length}</div>
          </div>
        `;
      }

      if (lista.length === 0) {
        cont.innerHTML = "";
        if (empty) empty.classList.remove("hidden");
        return;
      }
      if (empty) empty.classList.add("hidden");

      const isAdmin = currentUser && currentUser.rol === "admin";
      cont.innerHTML = lista.map(m => `
        <div class="card rounded-xl p-4 flex items-start justify-between gap-3">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="tabular-nums font-semibold text-white">${formatMoney(m.monto)}</span>
            </div>
            <div class="text-sm text-gray-400 mt-1.5">
              ${formatMovimientoCuando(m)}${notasVisibles(m.notas) ? ` · ${esc(notasVisibles(m.notas))}` : ""}
            </div>
            ${m.responsable ? `<div class="text-[11px] text-gray-500 mt-1">Registró: <span class="text-gray-300">${esc(m.responsable)}</span></div>` : ""}
          </div>
          <div class="flex flex-col gap-1 shrink-0">
            ${puedeEditarMovimiento(m) ? `<button type="button" onclick='abrirEditarMovimiento("${escAttr(String(m.id != null ? m.id : m.row))}")' class="text-aragan-yellow text-xs px-2 py-1.5 rounded-md">Editar</button>` : ""}
            ${puedeBorrarMovimiento(m) ? `<button type="button" onclick='borrarMovimiento("${escAttr(String(m.id != null ? m.id : m.row))}")' class="text-gray-500 hover:text-[#e08888] text-xs px-2 py-1.5 rounded-md">Eliminar</button>` : ""}
          </div>
        </div>
      `).join("");
    }

