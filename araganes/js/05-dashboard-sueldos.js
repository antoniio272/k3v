    // =====================================================
    // DASHBOARD
    // =====================================================
    function getSemanaSeleccionada() {
      const d = getWeekEndingWednesday();
      d.setDate(d.getDate() + (semanaOffset * 7));
      return d;
    }

    function cambiarSemana(delta) {
      semanaOffset += delta;
      // no permitir ir más de ~12 semanas al futuro
      if (semanaOffset > 2) semanaOffset = 2;
      renderDashboard();
    }

    function irSemanaActual() {
      semanaOffset = 0;
      renderDashboard();
    }

// === SUELDOS PAGADOS SINCRONIZADOS (DB) ===
    // Antes esto era solo localStorage -> por eso no se veia en otros dispositivos
    function _spKey() { return "araganes_sueldos_pagados_v1"; } // solo para migración / fallback
    function getSueldosPagados(semanaStr) {
      // ahora lee del array sincronizado desde Supabase
      if (sueldosPagadosCargados) {
        return sueldosPagadosDB.filter(r => r.semana === semanaStr).map(r => r.empleado);
      }
      // fallback mientras carga
      try {
        const all = JSON.parse(localStorage.getItem(_spKey()) || "{}");
        return all[semanaStr] || [];
      } catch(_) { return []; }
    }
    function esSueldoPagado(semanaStr, empName) {
      if (sueldosPagadosCargados) {
        return sueldosPagadosDB.some(r => r.semana === semanaStr && r.empleado === empName);
      }
      return getSueldosPagados(semanaStr).includes(empName);
    }
    async function cargarSueldosPagados() {
      try {
        const { data, error } = await fetchAllRows("sueldos_pagados", "semana,empleado");
        if (error) throw error;
        sueldosPagadosDB = data || [];
        sueldosPagadosCargados = true;
        // guardar copia local para arranque rápido
        try { localStorage.setItem(_spKey() + "_cache", JSON.stringify(sueldosPagadosDB)); } catch(_){}
      } catch (err) {
        console.warn("No se pudo cargar sueldos_pagados, usando localStorage fallback", err);
        // intentar cache local
        try {
          const cache = JSON.parse(localStorage.getItem(_spKey() + "_cache") || "[]");
          if (cache.length) { sueldosPagadosDB = cache; sueldosPagadosCargados = true; return; }
        } catch(_){}
        sueldosPagadosCargados = false;
      }
    }
    async function marcarSueldoPagado(semanaStr, empName) {
      // Optimista local
      if (!sueldosPagadosDB.some(r => r.semana===semanaStr && r.empleado===empName)) {
        sueldosPagadosDB.push({ semana: semanaStr, empleado: empName });
      }
      renderDashboard();
      // Persistir en DB para que todos los dispositivos lo vean
      try {
        const { error } = await sb.from("sueldos_pagados").upsert({
          semana: semanaStr,
          empleado: empName,
          pagado_por: currentUser ? currentUser.usuario : ""
        }, { onConflict: "semana,empleado" });
        if (error) throw error;
        // local backup
        try {
          const all = JSON.parse(localStorage.getItem(_spKey()) || "{}");
          const arr = all[semanaStr] || [];
          if (!arr.includes(empName)) arr.push(empName);
          all[semanaStr]=arr;
          localStorage.setItem(_spKey(), JSON.stringify(all));
        } catch(_){}
      } catch (err) {
        console.error("Error marcando sueldo pagado en DB", err);
        showToast("Error sync sueldos: " + (err.message||""), "error");
        await cargarSueldosPagados();
      }
    }
    async function desmarcarSueldoPagado(semanaStr, empName) {
      sueldosPagadosDB = sueldosPagadosDB.filter(r => !(r.semana===semanaStr && r.empleado===empName));
      renderDashboard();
      try {
        const { error } = await sb.from("sueldos_pagados").delete().eq("semana", semanaStr).eq("empleado", empName);
        if (error) throw error;
        try {
          const all = JSON.parse(localStorage.getItem(_spKey()) || "{}");
          all[semanaStr] = (all[semanaStr] || []).filter(x=>x!==empName);
          localStorage.setItem(_spKey(), JSON.stringify(all));
        } catch(_){}
      } catch (err) {
        console.error("Error desmarcando sueldo", err);
        showToast("Error sync", "error");
        await cargarSueldosPagados();
      }
    }
    function desgloseSueldo(emp, movSemana) {
      const g = (tipo) => movSemana.filter(m => m.tipo === tipo).reduce((s, m) => s + montoParaEmpleado(m, emp.empleado), 0);
      const bonos = g("Bono");
      const extras = g("Extra");
      const adelantos = g("Adelanto");
      const descuentos = movSemana.filter(m => esDescuentoEmpleado(m.tipo)).reduce((s, m) => s + montoParaEmpleado(m, emp.empleado), 0);
      const cuotasPrest = g("CuotaPrestamo");
      const prestamosNuevos = g("Prestamo");
      const ahorros = g("Ahorro");
      const ahorroEsp = g("AhorroEspecial");
      const retirosAhorro = g("RetiroAhorro");
      const retirosAhorroEsp = g("RetiroAhorroEspecial");
      const fiados = g("Fiado");
      // Ahorro se resta (retenido); retiro de ahorro se suma (se entrega en el pago de la semana)
      // Nuevo préstamo se suma al sueldo de la semana (dinero entregado al empleado)
      const total = emp.sueldoBase + bonos + extras + prestamosNuevos + retirosAhorro + retirosAhorroEsp
        - adelantos - descuentos - cuotasPrest - ahorros - ahorroEsp - fiados;
      return {
        bonos, extras, adelantos, descuentos, cuotasPrest, prestamosNuevos,
        ahorros, ahorroEsp, retirosAhorro, retirosAhorroEsp, fiados, total
      };
    }
    let _sueldoModalEmp = null;
    function _semanaStrActual() {
      try { return localDateStr(getSemanaSeleccionada()); } catch(_) { return ""; }
    }
    function abrirPreviewSueldo(empName) {
      _sueldoModalEmp = empName;
      const sem = _semanaStrActual();
      const emp = (empleados || []).find(e => e.empleado === empName);
      if (!emp) return;
      const movSemana = movimientosDeSemana(sem);
      const d = desgloseSueldo(emp, movSemana);
      const pagado = esSueldoPagado(sem, empName);
      document.getElementById("sueldo-modal-title").textContent = "Sueldo · " + empName;
      const row = (label, val, cls) => `<div class="flex justify-between gap-3 py-1.5 border-b border-[var(--border-subtle)] last:border-0">
          <span class="text-[var(--text-muted)] text-xs shrink-0 pt-0.5">${label}</span>
          <span class="text-right text-[13px] font-medium ${cls||"text-[var(--text)]"}">${val}</span>
        </div>`;
      let html = "";
      try {
        const ini = new Date(getSemanaSeleccionada()); ini.setDate(ini.getDate() - 6);
        html += `<p class="text-xs text-[var(--text-dim)]">Semana ${formatDateDisplay(localDateStr(ini))} → ${formatDateDisplay(sem)}</p>`;
      } catch(_) {}
      if (pagado) html += `<div class="rounded-lg px-3 py-2 text-xs font-semibold text-center" style="background:rgba(94,207,143,0.12);color:#5ecf8f;border:1px solid rgba(94,207,143,0.3)">Sueldo pagado</div>`;
      html += row("Sueldo base", formatMoney(emp.sueldoBase));
      html += row("+ Bonos", formatMoney(d.bonos), "text-[#5ecf8f]");
      html += row("+ Extras", formatMoney(d.extras), "text-[#e0b83a]");
      if (d.prestamosNuevos) html += row("+ Nuevo préstamo 💳", formatMoney(d.prestamosNuevos), "text-[#5ecf8f]");
      html += row("− Adelantos", formatMoney(d.adelantos), "text-[#e8b04a]");
      html += row("− Penalizaciones", formatMoney(d.descuentos), "text-[#e08888]");
      html += row("− Abono préstamo 💳", formatMoney(d.cuotasPrest), "text-[#e8b04a]");
      html += row("− Ahorros", formatMoney(d.ahorros), "text-[#6eb8d8]");
      html += row("− Ahorro esp.", formatMoney(d.ahorroEsp), "text-[#b8a0d0]");
      if (d.retirosAhorro) html += row("+ Entrega ahorro", formatMoney(d.retirosAhorro), "text-[#6eb8d8]");
      if (d.retirosAhorroEsp) html += row("+ Entrega ahorro esp.", formatMoney(d.retirosAhorroEsp), "text-[#b8a0d0]");
      html += row("− Fiados 🍔", formatMoney(d.fiados || 0), "text-[#e8a04a]");
      html += row("<strong>Total a pagar</strong>", `<strong>${formatMoney(d.total)}</strong>`, "text-aragan-yellow");
      document.getElementById("sueldo-modal-body").innerHTML = html;
      const f = document.getElementById("sueldo-modal-footer");
      const safeName = escAttr(empName);
      f.innerHTML = pagado
        ? `<button type="button" onclick="cerrarSueldoModal()" class="btn-ghost flex-1 py-2.5 rounded-lg text-[13px]">Cerrar</button>
           <button type="button" onclick="copiarDesgloseIndividualWhatsApp('${safeName}')" class="btn-outline flex-1 py-2.5 rounded-lg text-[13px]">📋 Copiar</button>
           <button type="button" onclick="reabrirSueldo()" class="btn-ghost flex-1 py-2.5 rounded-lg text-[13px]">Reabrir</button>`
        : `<div class="flex gap-2 w-full">
            <button type="button" onclick="cerrarSueldoModal()" class="btn-ghost flex-1 py-2.5 rounded-lg text-[13px]">Cerrar</button>
            <button type="button" onclick="copiarDesgloseIndividualWhatsApp('${safeName}')" class="btn-outline flex-1 py-2.5 rounded-lg text-[13px]">📋 Copiar</button>
           </div>
           <button type="button" onclick="confirmarSueldoPagado()" class="btn-yellow w-full py-2.5 rounded-lg mt-2">Sueldo pagado</button>`;
      document.getElementById("sueldo-modal-overlay").classList.remove("hidden");
    }
    function abrirPagarSueldos() {
      _sueldoModalEmp = null;
      const sem = _semanaStrActual();
      const movSemana = movimientosDeSemana(sem);
      document.getElementById("sueldo-modal-title").textContent = "Pagar sueldos";
      let iniTxt = "", finTxt = "";
      try {
        const ini = new Date(getSemanaSeleccionada()); ini.setDate(ini.getDate() - 6);
        iniTxt = formatDateDisplay(localDateStr(ini)); finTxt = formatDateDisplay(sem);
      } catch(_) {}
      let html = `<p class="text-xs text-[var(--text-dim)]">Semana ${iniTxt} → ${finTxt}</p><div class="space-y-2">`;
      (empleados || []).forEach(emp => {
        const d = desgloseSueldo(emp, movSemana);
        const pagado = esSueldoPagado(sem, emp.empleado);
        html += `<div class="flex items-center justify-between gap-2 rounded-lg px-3 py-2.5 border border-[var(--border)] bg-[var(--bg-elevated)]">
          <div class="min-w-0 cursor-pointer" onclick='abrirPreviewSueldo("${escAttr(emp.empleado)}")'>
            <div class="font-semibold text-white text-[13px] truncate">${esc(emp.empleado)}</div>
            <div class="text-[11px] ${pagado ? "text-[#5ecf8f]" : "text-aragan-yellow"} font-bold">${pagado ? "Pagado" : formatMoney(d.total)}</div>
          </div>
          ${pagado
            ? `<button type="button" onclick='reabrirSueldoDirecto("${escAttr(emp.empleado)}")' class="btn-ghost px-3 py-1.5 rounded-lg text-xs">Reabrir</button>`
            : `<button type="button" onclick='pagarSueldoDirecto("${escAttr(emp.empleado)}")' class="btn-yellow px-3 py-1.5 rounded-lg text-xs font-semibold">Pagar</button>`}
        </div>`;
      });
      html += `</div>`;
      document.getElementById("sueldo-modal-body").innerHTML = html;
      const pendientes = (empleados || []).filter(e => !esSueldoPagado(sem, e.empleado)).length;
      document.getElementById("sueldo-modal-footer").innerHTML =
        `<button type="button" onclick="cerrarSueldoModal()" class="btn-ghost flex-1 py-2.5 rounded-lg">Cerrar</button>` +
        (pendientes > 0 ? `<button type="button" onclick="pagarTodosSueldos()" class="btn-yellow flex-1 py-2.5 rounded-lg text-[13px]">Pagar todos (${pendientes})</button>` : ``);
      document.getElementById("sueldo-modal-overlay").classList.remove("hidden");
    }
    function cerrarSueldoModal() {
      _sueldoModalEmp = null;
      document.getElementById("sueldo-modal-overlay").classList.add("hidden");
    }
    async function confirmarSueldoPagado() {
      if (!_sueldoModalEmp) return;
      const sem = _semanaStrActual();
      if (!await uiConfirm("¿Marcar como pagado el sueldo de " + _sueldoModalEmp + "?\nSus montos quedarán en cero para esta semana.")) return;
      const empName = _sueldoModalEmp;
      cerrarSueldoModal();
      await marcarSueldoPagado(sem, empName);
      showToast("Sueldo de " + empName + " marcado como pagado");
    }
    async function pagarSueldoDirecto(empName) {
      const sem = _semanaStrActual();
      await marcarSueldoPagado(sem, empName);
      abrirPagarSueldos();
    }
    async function reabrirSueldoDirecto(empName) {
      const sem = _semanaStrActual();
      await desmarcarSueldoPagado(sem, empName);
      abrirPagarSueldos();
    }
    async function reabrirSueldo() {
      if (!_sueldoModalEmp) return;
      const empName = _sueldoModalEmp;
      cerrarSueldoModal();
      await desmarcarSueldoPagado(_semanaStrActual(), empName);
    }
    async function pagarTodosSueldos() {
      const sem = _semanaStrActual();
      const pendientes = (empleados || []).filter(e => !esSueldoPagado(sem, e.empleado));
      if (!pendientes.length) return;
      if (!await uiConfirm("¿Marcar como pagados los " + pendientes.length + " sueldos pendientes de esta semana?")) return;
      cerrarSueldoModal();
      showToast("Pagando " + pendientes.length + " sueldos...");
      for (const e of pendientes) {
        await marcarSueldoPagado(sem, e.empleado);
      }
      showToast("Sueldos de la semana pagados");
    }

    function renderDashboard() {
      const semanaActual = getSemanaSeleccionada();
      const semanaStr = localDateStr(semanaActual);
      const esActual = semanaOffset === 0;
      // Rango: jueves anterior → miércoles de cierre
      const fin = new Date(semanaActual);
      const ini = new Date(semanaActual);
      ini.setDate(ini.getDate() - 6);
      const iniStr = localDateStr(ini);
      const badge = document.getElementById("semana-badge");
      const hint = document.getElementById("semana-hint");
      if (badge) badge.textContent = esActual ? "Semana actual" : (semanaOffset < 0 ? `Hace ${-semanaOffset} semana(s)` : `En ${semanaOffset} semana(s)`);
      document.getElementById("semana-label").textContent =
        `${formatDateDisplay(iniStr)} → ${formatDateDisplay(semanaStr)}`;
      if (hint) hint.textContent = esActual
        ? `Cierra el miércoles ${formatDateDisplay(semanaStr)}`
        : `Cierre: miércoles ${formatDateDisplay(semanaStr)}`;

      const container = document.getElementById("dashboard-cards");
      const empty = document.getElementById("dashboard-empty");
      const summary = document.getElementById("dashboard-summary");

      if (empleados.length === 0) {
        container.innerHTML = "";
        if (summary) summary.innerHTML = "";
        empty.classList.remove("hidden");
        return;
      }
      empty.classList.add("hidden");

      const movSemana = movimientosDeSemana(semanaStr);

      let sumBase = 0, sumBonos = 0, sumExtras = 0, sumAdel = 0, sumDesc = 0, sumPrestamos = 0, sumAhorro = 0, sumAhorroEsp = 0, sumFiados = 0, sumTotal = 0;

      const pagadosSem = getSueldosPagados(semanaStr);
      container.innerHTML = empleados.map((emp, idx) => {
        const d = desgloseSueldo(emp, movSemana);
        const bonos = d.bonos, extras = d.extras, adelantos = d.adelantos, descuentos = d.descuentos;
        const cuotasPrest = d.cuotasPrest, ahorros = d.ahorros, ahorroEsp = d.ahorroEsp;
        const total = d.total;
        const pagado = pagadosSem.includes(emp.empleado);

        if (!pagado) {
          sumBase += emp.sueldoBase;
          sumBonos += bonos;
          sumExtras += extras;
          sumAdel += adelantos;
          sumDesc += descuentos;
          sumPrestamos += cuotasPrest;
          sumAhorro += ahorros;
          sumAhorroEsp += ahorroEsp;
          sumFiados += (d.fiados || 0);
          sumTotal += total;
        }

        const delay = idx < 3 ? `fade-up-delay-${idx + 1}` : "";
        return `
          <div class="card rounded-xl p-5 fade-up ${delay} cursor-pointer ${pagado ? "opacity-60" : ""}" onclick='abrirPreviewSueldo("${escAttr(emp.empleado)}")' title="Ver desglose">
            <div class="flex items-center justify-between mb-3">
              <div class="flex items-center gap-2">
                <div class="w-9 h-9 rounded-full bg-[rgba(212,175,55,0.12)] text-aragan-yellow flex items-center justify-center font-bold text-sm">${esc((emp.empleado||"?").charAt(0))}</div>
                <h3 class="font-semibold text-base text-white">${esc(emp.empleado)}</h3>
              </div>
              <div class="flex items-center gap-2">
                ${pagado ? `<span class="text-[10px] font-bold px-2 py-1 rounded-md" style="background:rgba(94,207,143,0.15);color:#5ecf8f">PAGADO</span>` : ``}
                <span class="${pagado ? "text-gray-500" : "text-aragan-yellow"} font-bold text-xl">${pagado ? formatMoney(0) : formatMoney(total)}</span>
              </div>
            </div>
            <div class="space-y-1.5 text-sm text-gray-400">
              <div class="flex justify-between"><span>Sueldo base</span><span class="text-gray-300">${formatMoney(emp.sueldoBase)}</span></div>
              <div class="flex justify-between text-[#5ecf8f]"><span>+ Bonos</span><span>${formatMoney(bonos)}</span></div>
              <div class="flex justify-between text-[#e0b83a]"><span>+ Extras</span><span>${formatMoney(extras)}</span></div>
              ${(d.prestamosNuevos) ? `<div class="flex justify-between text-[#5ecf8f]"><span>+ Nuevo préstamo 💳</span><span>${formatMoney(d.prestamosNuevos)}</span></div>` : ""}
              <div class="flex justify-between text-[#e8b04a]"><span>- Adelantos</span><span>${formatMoney(adelantos)}</span></div>
              <div class="flex justify-between text-[#e08888]"><span>- Penalizaciones</span><span>${formatMoney(descuentos)}</span></div>
              <div class="flex justify-between text-[#e8b04a]"><span>- Abono préstamo 💳</span><span>${formatMoney(cuotasPrest)}</span></div>
              <div class="flex justify-between text-[#6eb8d8]"><span>- Ahorros</span><span>${formatMoney(ahorros)}</span></div>
              <div class="flex justify-between text-[#b8a0d0]"><span>- Ahorro esp.</span><span>${formatMoney(ahorroEsp)}</span></div>
              ${(d.retirosAhorro) ? `<div class="flex justify-between text-[#6eb8d8]"><span>+ Entrega ahorro</span><span>${formatMoney(d.retirosAhorro)}</span></div>` : ""}
              ${(d.retirosAhorroEsp) ? `<div class="flex justify-between text-[#b8a0d0]"><span>+ Entrega ahorro esp.</span><span>${formatMoney(d.retirosAhorroEsp)}</span></div>` : ""}
              <div class="flex justify-between text-[#e8a04a]"><span>- Fiados 🍔</span><span>${formatMoney(d.fiados || 0)}</span></div>
            </div>
          </div>
        `;
      }).join("");

      const sumGastosNegocio = movSemana
        .filter(esMovimientoGastoNegocio)
        .reduce((s, m) => s + (Number(m.monto) || 0), 0);
      const sumIngresosNegocio = movSemana
        .filter(esMovimientoIngresoNegocio)
        .reduce((s, m) => s + (Number(m.monto) || 0), 0);

      const weekTotals = document.getElementById("dashboard-week-totals");
      if (weekTotals) {
        weekTotals.innerHTML = `
          <div class="summary-pill">
            <div class="text-[11px] text-gray-500 uppercase tracking-wide">Gastos de la semana</div>
            <div class="text-lg font-bold text-[#e08888]">${formatMoney(sumGastosNegocio)}</div>
          </div>
          <div class="summary-pill">
            <div class="text-[11px] text-gray-500 uppercase tracking-wide">Ingresos de la semana</div>
            <div class="text-lg font-bold text-[#5ecf8f]">${formatMoney(sumIngresosNegocio)}</div>
          </div>
          <div class="summary-pill">
            <div class="text-[11px] text-gray-500 uppercase tracking-wide">Cuotas préstamo</div>
            <div class="text-lg font-bold text-[#e8b04a]">${formatMoney(sumPrestamos)}</div>
          </div>
          <div class="summary-pill">
            <div class="text-[11px] text-gray-500 uppercase tracking-wide">Neto negocio</div>
            <div class="text-lg font-bold text-white">${formatMoney(sumIngresosNegocio - sumGastosNegocio)}</div>
          </div>
        `;
      }

      if (summary) {
        summary.innerHTML = `
          <div class="summary-pill fade-up">
            <div class="text-[11px] text-gray-500 uppercase tracking-wide">A pagar</div>
            <div class="text-lg font-bold text-aragan-yellow">${formatMoney(sumTotal)}</div>
          </div>
          <div class="summary-pill fade-up fade-up-delay-1">
            <div class="text-[11px] text-gray-500 uppercase tracking-wide">Bonos</div>
            <div class="text-lg font-bold text-[#5ecf8f]">${formatMoney(sumBonos)}</div>
          </div>
          <div class="summary-pill fade-up fade-up-delay-1">
            <div class="text-[11px] text-gray-500 uppercase tracking-wide">Extras</div>
            <div class="text-lg font-bold text-[#e0b83a]">${formatMoney(sumExtras)}</div>
          </div>
          <div class="summary-pill fade-up fade-up-delay-2">
            <div class="text-[11px] text-gray-500 uppercase tracking-wide">Adelantos</div>
            <div class="text-lg font-bold text-[#e8b04a]">${formatMoney(sumAdel)}</div>
          </div>
          <div class="summary-pill fade-up fade-up-delay-2">
            <div class="text-[11px] text-gray-500 uppercase tracking-wide">Préstamos (cuotas)</div>
            <div class="text-lg font-bold text-[#e8b04a]">${formatMoney(sumPrestamos)}</div>
          </div>
          <div class="summary-pill fade-up fade-up-delay-3">
            <div class="text-[11px] text-gray-500 uppercase tracking-wide">Ahorros</div>
            <div class="text-lg font-bold text-[#6eb8d8]">${formatMoney(sumAhorro + sumAhorroEsp)}</div>
          </div>
          <div class="summary-pill fade-up fade-up-delay-3">
            <div class="text-[11px] text-gray-500 uppercase tracking-wide">Fiados 🍔</div>
            <div class="text-lg font-bold text-[#e8a04a]">${formatMoney(sumFiados)}</div>
          </div>
        `;
      }
    }


    function generarDesgloseWhatsApp() {
      const semanaFin = getSemanaSeleccionada();
      const semanaStr = localDateStr(semanaFin);
      const ini = new Date(semanaFin);
      ini.setDate(ini.getDate() - 6);
      const iniStr = localDateStr(ini);
      const movSemana = movimientosDeSemana(semanaStr);

      let lineas = [];
      lineas.push("*Desglose semanal — Los Araganes*");
      lineas.push(`Semana: ${formatDateDisplay(iniStr)} → ${formatDateDisplay(semanaStr)}`);
      lineas.push("");

      if (empleados.length === 0) {
        lineas.push("No hay empleados registrados.");
        return lineas.join("\n");
      }

      empleados.forEach((emp, i) => {
        const d = desgloseSueldo(emp, movSemana);
        lineas.push(`*${emp.empleado}*`);
        lineas.push(`Sueldo base: ${formatMoney(emp.sueldoBase)}`);
        if (d.bonos) lineas.push(`+ Bonos: ${formatMoney(d.bonos)}`);
        if (d.extras) lineas.push(`+ Extras: ${formatMoney(d.extras)}`);
        if (d.prestamosNuevos) lineas.push(`+ Nuevo préstamo: ${formatMoney(d.prestamosNuevos)}`);
        if (d.adelantos) lineas.push(`− Adelantos: ${formatMoney(d.adelantos)}`);
        if (d.descuentos) lineas.push(`− Penalizaciones: ${formatMoney(d.descuentos)}`);
        if (d.cuotasPrest) lineas.push(`− Abono Préstamo: ${formatMoney(d.cuotasPrest)}`);
        if (d.ahorros) lineas.push(`− Ahorros: ${formatMoney(d.ahorros)}`);
        if (d.ahorroEsp) lineas.push(`− Ahorro especial: ${formatMoney(d.ahorroEsp)}`);
        if (d.retirosAhorro) lineas.push(`+ Entrega ahorro: ${formatMoney(d.retirosAhorro)}`);
        if (d.retirosAhorroEsp) lineas.push(`+ Entrega ahorro esp.: ${formatMoney(d.retirosAhorroEsp)}`);
        if (d.fiados) lineas.push(`− Fiados 🍔: ${formatMoney(d.fiados)}`);
        lineas.push(`➡️ *Total a pagar: ${formatMoney(d.total)}*`);
        if (i < empleados.length - 1) {
          lineas.push("——————————");
          lineas.push("");
        }
      });

      return lineas.join("\n");
    }

    async function copiarDesgloseWhatsApp() {
      const texto = generarDesgloseWhatsApp();
      try {
        await navigator.clipboard.writeText(texto);
        showToast("Desglose copiado — pégalo en WhatsApp");
      } catch (e) {
        // Fallback: prompt para copiar manual
        const ok = await uiPrompt("Copia el texto (Ctrl+C / Cmd+C):", texto);
        if (ok !== null) showToast("Listo para pegar en WhatsApp");
      }
    }

    // NUEVO: Desglose individual para copiar solo de un empleado (desde la tarjeta)
    function generarDesgloseIndividualWhatsApp(empName) {
      const semanaFin = getSemanaSeleccionada();
      const semanaStr = localDateStr(semanaFin);
      const ini = new Date(semanaFin);
      ini.setDate(ini.getDate() - 6);
      const iniStr = localDateStr(ini);
      const movSemana = movimientosDeSemana(semanaStr);
      const emp = (empleados || []).find(e => e.empleado === empName);
      if (!emp) return "";
      const d = desgloseSueldo(emp, movSemana);
      const lista = movSemana.filter(m => movimientoAplicaAEmpleado(m, empName)).sort((a,b)=>(a.fecha||"").localeCompare(b.fecha||""));
      let lineas = [];
      lineas.push(`*${emp.empleado}*`);
      lineas.push(`Semana: ${formatDateDisplay(iniStr)} → ${formatDateDisplay(semanaStr)}`);
      lineas.push(`Sueldo base: ${formatMoney(emp.sueldoBase)}`);
      if (d.bonos) lineas.push(`+ Bonos: ${formatMoney(d.bonos)}`);
      if (d.extras) lineas.push(`+ Extras: ${formatMoney(d.extras)}`);
      if (d.adelantos) lineas.push(`− Adelantos: ${formatMoney(d.adelantos)}`);
      if (d.descuentos) lineas.push(`− Penalizaciones: ${formatMoney(d.descuentos)}`);
      if (d.cuotasPrest) lineas.push(`− Abono Préstamo: ${formatMoney(d.cuotasPrest)}`);
      if (d.ahorros) lineas.push(`− Ahorros: ${formatMoney(d.ahorros)}`);
      if (d.ahorroEsp) lineas.push(`− Ahorro esp.: ${formatMoney(d.ahorroEsp)}`);
      if (d.retirosAhorro) lineas.push(`+ Entrega ahorro: ${formatMoney(d.retirosAhorro)}`);
      if (d.retirosAhorroEsp) lineas.push(`+ Entrega ahorro esp.: ${formatMoney(d.retirosAhorroEsp)}`);
      if (d.fiados) lineas.push(`− Fiados: ${formatMoney(d.fiados)}`);
      if (d.prestamosNuevos) lineas.push(`+ Nuevo préstamo: ${formatMoney(d.prestamosNuevos)}`);
      lineas.push(`*Total: ${formatMoney(d.total)}*`);
      if (lista.length) {
        lineas.push("");
        lineas.push(`*Movimientos:*`);
        // Orden cronológico (como siempre)
        const ordenada = lista.slice().sort((a, b) => (a.fecha || "").localeCompare(b.fecha || ""));
        const notasPrestamo = [];
        ordenada.forEach(m => {
          const fecha = formatDateDisplay(m.fecha) || "";
          const nota = notasVisibles(m.notas) || "";
          const montoNum = montoParaEmpleado(m, empName);
          const monto = formatMoney(montoNum);
          const tLow = String(m.tipo || "").trim().toLowerCase();
          // Prestamo: no listar aquí (sale una sola vez al final resaltado)
          if (tLow === "prestamo") {
            if (nota) notasPrestamo.push(nota);
            return;
          }
          if (tLow === "cuotaprestamo") {
            let linea = `• ${fecha} - ${monto}`;
            if (nota) linea += ` - ${nota}`;
            else linea += ` - Abono préstamo`;
            lineas.push(linea);
          } else if (tLow === "penalizacion" || tLow === "descuento") {
            lineas.push(`• ${fecha} - ${monto} - ⚠️ Penalización${nota ? ` · ${nota}` : ""}`);
          } else {
            let linea = `• ${fecha} - ${monto}`;
            if (nota) linea += ` - ${nota}`;
            lineas.push(linea);
          }
        });
        // Una sola línea resaltada para préstamo(s) nuevo(s)
        if (d.prestamosNuevos) {
          const extra = notasPrestamo.length ? ` (${notasPrestamo.join(", ")})` : "";
          lineas.push(`*+ ${formatMoney(d.prestamosNuevos)} - Nuevo préstamo*${extra}`);
        }
      } else if (d.prestamosNuevos) {
        lineas.push("");
        lineas.push(`*+ ${formatMoney(d.prestamosNuevos)} - Nuevo préstamo*`);
      }
      return lineas.join("\n");
    }

    async function copiarDesgloseIndividualWhatsApp(empName) {
      const texto = generarDesgloseIndividualWhatsApp(empName);
      if (!texto) return showToast("No se pudo generar desglose", "error");
      try {
        await navigator.clipboard.writeText(texto);
        showToast(`Desglose de ${empName} copiado`);
      } catch (e) {
        const ok = await uiPrompt(`Desglose de ${empName} — copia manual:`, texto);
        if (ok !== null) showToast("Listo para pegar");
      }
    }


