    // =====================================================
    // DÍA FERIADO
    // =====================================================
    // Paga el extra de un feriado trabajado. Sueldo diario = sueldo semanal ÷ 7.
    // El multiplicador es el pago TOTAL del día. Como ese día ya va dentro del sueldo base,
    // solo se registra la diferencia: extra = diario × (multiplicador − 1).
    //   Ej. $700/semana → $100/día. x2 → +$100 (semana de $800). x3 → +$200 (semana de $900).
    // Se guarda una fila "Feriado" por empleado con el monto ya calculado, para que un cambio
    // posterior del sueldo base no mueva feriados pasados.
    const FERIADO_MULT_MIN = 1.5;
    const FERIADO_MULT_MAX = 5;
    let multiplicadorFeriado = 2;

    function _redondear2(n) { return Math.round((Number(n) || 0) * 100) / 100; }
    function extraFeriado(sueldoSemanal, mult) {
      return _redondear2((Number(sueldoSemanal) || 0) / 7 * (Number(mult) - 1));
    }
    function _multiplicadorValido(m) { return m >= FERIADO_MULT_MIN && m <= FERIADO_MULT_MAX; }
    function _multTexto(m) { return "x" + String(_redondear2(m)); }

    function aplicarVistaFeriado(tipo) {
      const es = tipo === "Feriado";
      document.getElementById("feriado-box")?.classList.toggle("hidden", !es);
      document.getElementById("monto-box")?.classList.toggle("hidden", es);
      if (es) document.getElementById("modo-monto-box")?.classList.add("hidden");
      const notas = document.getElementById("mov-notas");
      if (notas) notas.placeholder = es ? "Opcional. Ej. 16 de septiembre" : "Motivo";
      if (es) setMultiplicadorFeriado(multiplicadorFeriado, false);
    }

    function setMultiplicadorFeriado(valor, desdeCampo) {
      const n = Number(String(valor ?? "").replace(",", "."));
      const otro = document.getElementById("feriado-otro");
      if (desdeCampo) {
        multiplicadorFeriado = String(valor ?? "").trim() === "" ? 2 : n;
      } else {
        multiplicadorFeriado = n;
        if (otro && n !== 2 && n !== 3) otro.value = String(n);
        else if (otro) otro.value = "";
      }
      document.getElementById("feriado-x2")?.classList.toggle("modo-active", multiplicadorFeriado === 2 && !(otro && otro.value));
      document.getElementById("feriado-x3")?.classList.toggle("modo-active", multiplicadorFeriado === 3 && !(otro && otro.value));
      renderFeriadoPreview();
    }

    function _filasFeriado(mult) {
      return [...document.querySelectorAll(".emp-check:checked")].map(c => {
        const e = empleados.find(x => x.empleado === c.value);
        const base = e ? Number(e.sueldoBase) || 0 : 0;
        return { nombre: c.value, base, diario: base / 7, monto: extraFeriado(base, mult) };
      });
    }

    function renderFeriadoPreview() {
      const cont = document.getElementById("feriado-preview");
      if (!cont || tipoSeleccionado !== "Feriado") return;
      const mult = multiplicadorFeriado;
      if (!_multiplicadorValido(mult)) {
        cont.innerHTML = `<p class="feriado-aviso">Escribe un multiplicador entre ${FERIADO_MULT_MIN} y ${FERIADO_MULT_MAX}.</p>`;
        return;
      }
      const filas = _filasFeriado(mult);
      if (!filas.length) {
        cont.innerHTML = `<p class="feriado-vacio">Elige a quién se le paga el feriado.</p>`;
        return;
      }
      const total = filas.reduce((s, f) => s + f.monto, 0);
      cont.innerHTML = filas.map(f => `
        <div class="feriado-fila">
          <span class="min-w-0 truncate text-[var(--text)]">${esc(f.nombre)}</span>
          ${f.base > 0
            ? `<span class="text-[var(--text-muted)] tabular-nums">${formatMoney(f.diario)}/día</span>
               <span class="text-[#e0b83a] font-semibold tabular-nums">+${formatMoney(f.monto)}</span>`
            : `<span class="text-[#e08888] col-span-2 text-right">Sin sueldo base</span>`}
        </div>`).join("") + `
        <div class="feriado-fila feriado-total">
          <span>Total extra · pago ${_multTexto(mult)}</span><span></span>
          <span class="text-[#e0b83a] font-semibold tabular-nums">+${formatMoney(total)}</span>
        </div>`;
    }

    async function guardarFeriado() {
      if (!currentUser || currentUser.rol !== "admin") return showToast("Solo admin puede registrar feriados", "error");
      if (isSaving) return;
      const fecha = document.getElementById("mov-fecha").value;
      if (!fecha) return showToast("Elige la fecha del feriado", "error");
      const mult = multiplicadorFeriado;
      if (!_multiplicadorValido(mult)) return showToast(`Elige x2, x3 u otro multiplicador entre ${FERIADO_MULT_MIN} y ${FERIADO_MULT_MAX}`, "error");
      const filas = _filasFeriado(mult);
      if (!filas.length) return showToast("Selecciona al menos un empleado", "error");
      const sinSueldo = filas.filter(f => f.monto <= 0);
      if (sinSueldo.length) return showToast(`Sin sueldo base: ${sinSueldo.map(f => f.nombre).join(", ")}. Agrégalo en Empleados.`, "error");

      const nota = (document.getElementById("mov-notas").value || "").trim();
      const multTxt = _multTexto(mult);
      const notas = `${nota || "Día feriado"} · pago ${multTxt}`;
      const total = _redondear2(filas.reduce((s, f) => s + f.monto, 0));
      const detalle = (filas.length <= 6 ? filas : filas.slice(0, 5))
        .map(f => `${f.nombre}: +${formatMoney(f.monto)}`).join("\n") +
        (filas.length > 6 ? `\ny ${filas.length - 5} más` : "");
      const ok = await uiConfirm(`¿Registrar día feriado ${multTxt}?\n${formatDateDisplay(fecha)} · pago total del día ${multTxt}\n\n${detalle}\n\nTotal extra: ${formatMoney(total)}`);
      if (!ok) return;

      isSaving = true;
      const btn = document.getElementById("btn-guardar-mov");
      setButtonLoading(btn, true, "Registrar movimiento");
      try {
        const semana = semanaDesdeFecha(fecha);
        const rows = filas.map(f => ({
          fecha,
          empleado: f.nombre,
          tipo: "Feriado",
          monto: f.monto,
          notas,
          semana,
          responsable: currentUser.usuario || ""
        }));
        const { data, error } = await sb.from("movimientos").insert(rows).select("*");
        if (error) throw error;
        for (const r of (data && data.length ? data : rows)) {
          try { await logAuditoria("INSERT", r); } catch (_) {}
        }
        showToast(`Feriado ${multTxt} registrado · ${filas.length} persona(s) · +${formatMoney(total)}`);
        document.getElementById("mov-notas").value = "";
        document.querySelectorAll(".emp-check").forEach(c => { c.checked = false; });
        actualizarMontoDividido();
        await cargarTodo();
        showTab("dashboard");
      } catch (err) {
        console.error(err);
        showToast(err.message || "Error al guardar el feriado", "error");
      } finally {
        isSaving = false;
        setButtonLoading(btn, false, "Registrar movimiento");
      }
    }

    // =====================================================
    // PRÉSTAMOS: AMPLIAR, LIQUIDAR, BORRAR
    // =====================================================
    // Ampliar: fila "Prestamo" con [pid:X]. Suma al saldo del préstamo X (resumenPrestamos) y,
    //   como cualquier préstamo, se entrega con el sueldo de la semana en que se registra.
    // Liquidar (cuando ya tiene cuotas): paga el saldo completo de una vez.
    //   - Descontar del sueldo: fila "CuotaPrestamo" por el saldo, en la semana del Dashboard.
    //   - Pago por fuera (efectivo/transferencia): fila "PagoPrestamo"; baja el saldo sin tocar el sueldo.
    // Borrar (sin cuotas ni pagos): quita el préstamo y sus ampliaciones (registro equivocado).
    //   Con cuotas no se borra: esas cuotas ya salieron de sueldos pagados.
    let _prestAccion = null;

    function _prestBuscar(pid) {
      return resumenPrestamos().find(r => String(r.prestamoId) === String(pid)) || null;
    }

    function _prestAbrir({ titulo, sub, cuerpo, boton, peligro }) {
      document.getElementById("prest-titulo").textContent = titulo;
      document.getElementById("prest-sub").textContent = sub || "";
      document.getElementById("prest-cuerpo").innerHTML = cuerpo;
      const err = document.getElementById("prest-error");
      err.classList.add("hidden");
      err.textContent = "";
      const ok = document.getElementById("btn-prest-ok");
      ok.textContent = boton;
      ok.className = (peligro ? "btn-danger" : "btn-yellow") + " flex-1 py-2.5 rounded-lg text-sm";
      document.getElementById("prest-overlay").classList.remove("hidden");
    }

    function cerrarPrestamoAccion() {
      _prestAccion = null;
      document.getElementById("prest-overlay")?.classList.add("hidden");
    }

    function _prestError(texto) {
      const err = document.getElementById("prest-error");
      err.textContent = texto;
      err.classList.remove("hidden");
    }

    function _prestResumenHtml(r) {
      return `
        <div class="prest-resumen">
          <div><span>Saldo pendiente</span><strong class="text-[#e8b04a]">${formatMoney(r.saldo)}</strong></div>
          <div><span>Prestado</span><strong>${formatMoney(r.prestado)}</strong></div>
          <div><span>Pagado</span><strong class="text-[#5ecf8f]">${formatMoney(r.pagado)}</strong></div>
          <div><span>Cuota semanal</span><strong>${formatMoney(r.cuota)}</strong></div>
        </div>`;
    }

    function abrirAmpliarPrestamo(pid) {
      if (!currentUser || currentUser.rol !== "admin") return showToast("Solo admin", "error");
      const r = _prestBuscar(pid);
      if (!r || !r.enCurso) return showToast("El préstamo ya no está en curso", "error");
      _prestAccion = { tipo: "ampliar", pid: String(pid) };
      const cierre = formatDateDisplay(semanaDesdeFecha(localDateStr(new Date())));
      _prestAbrir({
        titulo: `Ampliar préstamo · ${r.empleado}`,
        sub: `Se suma a este mismo préstamo. Se entrega con su sueldo de la semana que cierra ${cierre}.`,
        cuerpo: `
          ${_prestResumenHtml(r)}
          <div>
            <label class="block text-xs text-gray-500 mb-1" for="prest-monto">¿Cuánto más le das?</label>
            <div class="amount-wrap">
              <span class="currency">$</span>
              <input type="number" id="prest-monto" step="0.01" min="0" inputmode="decimal" placeholder="0.00" class="w-full rounded-lg py-3" oninput="actualizarPrevistaAmpliar()" />
            </div>
            <p id="prest-prevista" class="text-[12.5px] text-[var(--text-muted)] mt-2 min-h-[18px]"></p>
          </div>
          <div>
            <label class="block text-xs text-gray-500 mb-1" for="prest-nota">Nota</label>
            <input type="text" id="prest-nota" maxlength="80" placeholder="Opcional" class="w-full rounded-lg px-3 py-2.5 text-sm" />
          </div>`,
        boton: "Ampliar"
      });
      setTimeout(() => document.getElementById("prest-monto")?.focus(), 80);
    }

    function actualizarPrevistaAmpliar() {
      if (!_prestAccion || _prestAccion.tipo !== "ampliar") return;
      const r = _prestBuscar(_prestAccion.pid);
      const el = document.getElementById("prest-prevista");
      const monto = _redondear2(parseFloat(document.getElementById("prest-monto")?.value));
      if (!r || !el) return;
      el.innerHTML = monto > 0
        ? `Nuevo saldo: <strong class="text-white">${formatMoney(r.saldo + monto)}</strong> · la cuota sigue en ${formatMoney(r.cuota)}`
        : "";
    }

    function abrirLiquidarPrestamo(pid) {
      if (!currentUser || currentUser.rol !== "admin") return showToast("Solo admin", "error");
      const r = _prestBuscar(pid);
      if (!r || !r.enCurso) return showToast("El préstamo ya está liquidado", "info");
      _prestAccion = { tipo: "liquidar", pid: String(pid) };
      const semanaStr = localDateStr(getSemanaSeleccionada());
      const semana = formatDateDisplay(semanaStr);
      let quedaria = "";
      const emp = empleados.find(e => e.empleado === r.empleado);
      if (emp) {
        const neto = _redondear2(desgloseSueldo(emp, movimientosDeSemana(semanaStr)).total - r.saldo);
        quedaria = neto < 0
          ? ` · <span class="text-[#e08888]">su sueldo quedaría en ${formatMoney(neto)}</span>`
          : ` · su sueldo quedaría en ${formatMoney(neto)}`;
      }
      _prestAbrir({
        titulo: `Liquidar préstamo · ${r.empleado}`,
        sub: "Se paga todo el saldo de una vez y el préstamo queda cerrado.",
        cuerpo: `
          ${_prestResumenHtml(r)}
          <div class="prest-opciones" role="radiogroup" aria-label="Cómo se paga">
            <label class="prest-opcion">
              <input type="radio" name="prest-forma" value="sueldo" checked />
              <span><strong>Descontar de su sueldo</strong><small>Semana que cierra ${semana}${quedaria}</small></span>
            </label>
            <label class="prest-opcion">
              <input type="radio" name="prest-forma" value="fuera" />
              <span><strong>Pagó por fuera</strong><small>Efectivo o transferencia · no toca su sueldo</small></span>
            </label>
          </div>`,
        boton: `Liquidar ${formatMoney(r.saldo)}`
      });
    }

    async function _prestGuardar(row) {
      const { data, error } = await sb.from("movimientos").insert([row]).select("*");
      if (error) throw error;
      try { await logAuditoria("INSERT", (data && data[0]) || row); } catch (_) {}
    }

    async function confirmarPrestamoAccion() {
      const acc = _prestAccion;
      if (!acc || isSaving) return;
      const r = _prestBuscar(acc.pid);
      if (!r || !r.enCurso) { cerrarPrestamoAccion(); return showToast("El préstamo ya no está en curso", "error"); }
      const hoy = localDateStr(new Date());
      let row, pregunta, aviso;

      if (acc.tipo === "ampliar") {
        const monto = _redondear2(parseFloat(document.getElementById("prest-monto")?.value));
        if (!(monto > 0)) return _prestError("Escribe cuánto más le das.");
        const nota = (document.getElementById("prest-nota")?.value || "").trim();
        const semana = semanaDesdeFecha(hoy);
        row = {
          fecha: hoy, empleado: r.empleado, tipo: "Prestamo", monto,
          notas: notasConPrestamoId(nota ? `Ampliación · ${nota}` : "Ampliación", r.prestamoId),
          semana, responsable: currentUser.usuario || ""
        };
        pregunta = `¿Ampliar el préstamo de ${r.empleado}?\n+${formatMoney(monto)} · nuevo saldo ${formatMoney(r.saldo + monto)}\n\nSe entrega con su sueldo de la semana que cierra ${formatDateDisplay(semana)}. La cuota sigue en ${formatMoney(r.cuota)}.`;
        aviso = `Préstamo ampliado · nuevo saldo ${formatMoney(r.saldo + monto)}`;
      } else {
        const forma = document.querySelector('input[name="prest-forma"]:checked')?.value || "sueldo";
        const saldo = _redondear2(r.saldo);
        if (forma === "sueldo") {
          const semana = localDateStr(getSemanaSeleccionada());
          row = {
            fecha: hoy, empleado: r.empleado, tipo: "CuotaPrestamo", monto: saldo,
            notas: notasConPrestamoId(`Liquidación préstamo semana ${semana}`, r.prestamoId),
            semana, responsable: currentUser.usuario || ""
          };
          pregunta = `¿Liquidar el préstamo de ${r.empleado}?\n${formatMoney(saldo)} se descuentan de su sueldo de la semana que cierra ${formatDateDisplay(semana)}.`;
        } else {
          row = {
            fecha: hoy, empleado: r.empleado, tipo: "PagoPrestamo", monto: saldo,
            notas: notasConPrestamoId("Liquidación · pago por fuera", r.prestamoId),
            semana: semanaDesdeFecha(hoy), responsable: currentUser.usuario || ""
          };
          pregunta = `¿Liquidar el préstamo de ${r.empleado}?\nPagó ${formatMoney(saldo)} por fuera (efectivo o transferencia). Su sueldo no cambia.`;
        }
        aviso = `Préstamo de ${r.empleado} liquidado`;
      }

      const ok = await uiConfirm(pregunta);
      if (!ok) return;
      isSaving = true;
      const btn = document.getElementById("btn-prest-ok");
      const texto = btn.textContent;
      setButtonLoading(btn, true, texto);
      try {
        await _prestGuardar(row);
        cerrarPrestamoAccion();
        showToast(aviso);
        await cargarTodo();
        showTab("prestamos");
      } catch (err) {
        console.error(err);
        _prestError(err.message || "No se pudo guardar");
      } finally {
        isSaving = false;
        setButtonLoading(btn, false, texto);
      }
    }

    async function borrarPrestamo(pid) {
      if (!currentUser || currentUser.rol !== "admin") return showToast("Solo admin", "error");
      if (isSaving) return;
      const r = _prestBuscar(pid);
      if (!r) return showToast("No se encontró el préstamo", "error");
      if ((r.cuotas || []).length) return showToast("Ya tiene cuotas cobradas: usa Liquidar", "error");
      const ampl = r.ampliaciones || [];
      const ok = await uiConfirm(
        `¿Borrar el préstamo de ${r.empleado}?\n${formatMoney(r.prestado)} del ${formatDateDisplay(r.fecha)}` +
        (ampl.length ? ` (incluye ${ampl.length} ampliación/es)` : "") +
        `\n\nTambién se quita del sueldo de la semana en que se entregó. No se puede deshacer.`
      );
      if (!ok) return;
      isSaving = true;
      try {
        const filas = [r.prestamo].concat(ampl);
        for (const m of filas) {
          try {
            await logAuditoria("DELETE", {
              id: m.id, fecha: m.fecha, tipo: m.tipo, monto: m.monto, empleado: m.empleado,
              notas: m.notas, responsable: m.responsable, semana: m.semana
            });
          } catch (_) {}
        }
        const ids = filas.map(m => Number(m.id) || m.id);
        const { error } = await sb.from("movimientos").delete().in("id", ids);
        if (error) throw error;
        const quitar = new Set(filas.map(m => String(m.id)));
        movimientos = movimientos.filter(m => !quitar.has(String(m.id)));
        guardarCache();
        aplicarDatosEnPantalla();
        showToast("Préstamo borrado");
      } catch (err) {
        console.error(err);
        showToast(err.message || "No se pudo borrar el préstamo", "error");
        await cargarTodoOptimizado();
      } finally {
        isSaving = false;
      }
    }
