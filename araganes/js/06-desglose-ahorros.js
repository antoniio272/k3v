    // =====================================================
    // DESGLOSE INDIVIDUAL (semana + empleado)
    // =====================================================
    function llenarSelectIndividual() {
      const sel = document.getElementById("ind-empleado");
      if (!sel) return;
      const isAdmin = currentUser && currentUser.rol === "admin";
      let lista = empleados;
      // FIX: Empleados no se ligan a usuarios, todos ven todos (para asignar gastos como admin)
      const prev = sel.value;
      sel.innerHTML = lista.map(e => `<option value="${esc(e.empleado)}">${esc(e.empleado)}</option>`).join("")
        || `<option value="">Sin empleados</option>`;
      if (prev && [...sel.options].some(o => o.value === prev)) sel.value = prev;
    }

    function verDesgloseIndividual() {
      const emp = document.getElementById("ind-empleado")?.value;
      const empty = document.getElementById("ind-empty");
      const cont = document.getElementById("ind-resultado");
      if (!emp) {
        showToast("Selecciona un empleado", "error");
        return;
      }
      const semanaFin = getSemanaSeleccionada();
      const semanaStr = localDateStr(semanaFin);
      const ini = new Date(semanaFin);
      ini.setDate(ini.getDate() - 6);
      const iniStr = localDateStr(ini);
      const movSemana = movimientosDeSemana(semanaStr);

      const lista = movSemana
        .filter(m => movimientoAplicaAEmpleado(m, emp))
        .sort((a, b) => (a.fecha || "").localeCompare(b.fecha || ""));

      const sum = (tipo) => lista.filter(m => m.tipo === tipo).reduce((s, m) => s + montoParaEmpleado(m, emp), 0);
      const gastos = lista.filter(m => esDescuentoEmpleado(m.tipo)).reduce((s, m) => s + montoParaEmpleado(m, emp), 0);
      const cuotasPrest = sum("CuotaPrestamo");
      const prestamosNuevos = sum("Prestamo");
      const adel = sum("Adelanto");
      const bono = sum("Bono");
      const extra = sum("Extra");
      const ahorro = sum("Ahorro");
      const ahorroEsp = sum("AhorroEspecial");
      const retiroAhorro = sum("RetiroAhorro");
      const retiroAhorroEsp = sum("RetiroAhorroEspecial");
      const fiado = sum("Fiado");
      const empObj = empleados.find(e => e.empleado === emp);
      const base = empObj ? empObj.sueldoBase : 0;
      const total = base + bono + extra + prestamosNuevos + retiroAhorro + retiroAhorroEsp - adel - gastos - cuotasPrest - ahorro - ahorroEsp - fiado;

      if (empty) empty.classList.add("hidden");

      const detalleHtml = lista.length
        ? lista.map(m => {
            const metodo = parseMetodoFromNotas(m.notas);
            const nota = notasVisibles(m.notas);
            const resp = m.responsable ? ` · <span class="text-[11px] text-gray-500">por ${esc(m.responsable)}</span>` : "";
            return `
            <div class="flex flex-col gap-0.5 text-sm py-2 border-b border-gray-800">
              <div class="flex justify-between gap-2">
                <span class="text-gray-300">${formatMovimientoCuando(m)} · <span class="text-white font-medium">${m.tipo}</span>${metodo ? ` · <span class="text-[#e0b83a]">${metodo}</span>` : ""}${resp}</span>
                <span class="font-bold whitespace-nowrap ${esGasto(m.tipo) || m.tipo === "Adelanto" || m.tipo === "Ahorro" || m.tipo === "AhorroEspecial" || m.tipo === "Fiado" || m.tipo === "CuotaPrestamo" || m.tipo === "Penalizacion" || m.tipo === "Descuento" ? "text-[#e08888]" : "text-[#5ecf8f]"}">${formatMoney(montoParaEmpleado(m, emp))}</span>
              </div>
              ${nota ? `<div class="text-xs text-gray-400 truncate">${esc(nota)}</div>` : ""}
            </div>`;
          }).join("")
        : `<p class="text-sm text-gray-500 py-4 text-center">Sin movimientos esta semana</p>`;

      cont.innerHTML = `
        <div class="card rounded-xl p-5 space-y-4 fade-up">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 class="text-xl font-bold text-white">${esc(emp)}</h3>
              <p class="text-sm text-gray-400">${formatDateDisplay(iniStr)} → ${formatDateDisplay(semanaStr)}</p>
            </div>
            <div class="text-right">
              <div class="text-[11px] text-gray-500 uppercase">A pagar</div>
              <div class="page-title">${formatMoney(total)}</div>
            </div>
          </div>
          <div class="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
            <div class="summary-pill"><div class="text-[11px] text-gray-500">Sueldo base</div><div class="font-bold text-gray-200">${formatMoney(base)}</div></div>
            <div class="summary-pill"><div class="text-[11px] text-gray-500">Bonos</div><div class="font-bold text-[#5ecf8f]">${formatMoney(bono)}</div></div>
            <div class="summary-pill"><div class="text-[11px] text-gray-500">Extras</div><div class="font-bold text-[#e0b83a]">${formatMoney(extra)}</div></div>
            <div class="summary-pill"><div class="text-[11px] text-gray-500">Nuevo préstamo</div><div class="font-bold text-[#5ecf8f]">${formatMoney(prestamosNuevos)}</div></div>
            <div class="summary-pill"><div class="text-[11px] text-gray-500">Adelantos</div><div class="font-bold text-[#e8b04a]">${formatMoney(adel)}</div></div>
            <div class="summary-pill"><div class="text-[11px] text-gray-500">Penalizaciones</div><div class="font-bold text-[#e08888]">${formatMoney(gastos)}</div></div>
            <div class="summary-pill"><div class="text-[11px] text-gray-500">Abono préstamo</div><div class="font-bold text-[#e8b04a]">${formatMoney(cuotasPrest)}</div></div>
            <div class="summary-pill"><div class="text-[11px] text-gray-500">Ahorros</div><div class="font-bold text-[#6eb8d8]">${formatMoney(ahorro + ahorroEsp)}</div></div>
            <div class="summary-pill"><div class="text-[11px] text-gray-500">Fiados</div><div class="font-bold text-[#e8a04a]">${formatMoney(fiado)}</div></div>
          </div>
          <div>
            <h4 class="text-sm font-medium text-gray-300 mb-2">Movimientos de la semana</h4>
            ${detalleHtml}
          </div>
        </div>`;

      // Texto para WhatsApp - ULTRA SIMPLE: solo fecha, monto y nota/concepto
      let lineas = [];
      lineas.push(`*${emp}*`);
      lineas.push(`Semana: ${formatDateDisplay(iniStr)} → ${formatDateDisplay(semanaStr)}`);
      lineas.push(`Sueldo base: ${formatMoney(base)}`);
      if (bono) lineas.push(`+ Bonos: ${formatMoney(bono)}`);
      if (extra) lineas.push(`+ Extras: ${formatMoney(extra)}`);
      if (adel) lineas.push(`− Adelantos: ${formatMoney(adel)}`);
      if (gastos) lineas.push(`− Penalizaciones: ${formatMoney(gastos)}`);
      if (cuotasPrest) lineas.push(`− Abono Préstamo: ${formatMoney(cuotasPrest)}`);
      if (ahorro) lineas.push(`− Ahorros: ${formatMoney(ahorro)}`);
      if (ahorroEsp) lineas.push(`− Ahorro esp.: ${formatMoney(ahorroEsp)}`);
      if (retiroAhorro) lineas.push(`+ Entrega ahorro: ${formatMoney(retiroAhorro)}`);
      if (retiroAhorroEsp) lineas.push(`+ Entrega ahorro esp.: ${formatMoney(retiroAhorroEsp)}`);
      if (fiado) lineas.push(`− Fiados: ${formatMoney(fiado)}`);
      if (prestamosNuevos) lineas.push(`+ Nuevo préstamo: ${formatMoney(prestamosNuevos)}`);
      lineas.push(`*Total: ${formatMoney(total)}*`);
      if (lista.length) {
        lineas.push("");
        lineas.push(`*Movimientos:*`);
        const ordenada = lista.slice().sort((a, b) => (a.fecha || "").localeCompare(b.fecha || ""));
        const notasPrestamo = [];
        ordenada.forEach(m => {
          const fecha = formatDateDisplay(m.fecha) || "";
          const nota = notasVisibles(m.notas) || "";
          const monto = formatMoney(montoParaEmpleado(m, emp));
          const tLow = String(m.tipo || "").trim().toLowerCase();
          if (tLow === "prestamo") {
            if (nota) notasPrestamo.push(nota);
            return; // no duplicar: va al final resaltado
          }
          if (tLow === "penalizacion" || tLow === "descuento") {
            lineas.push(`• ${fecha} - ${monto} - ⚠️ Penalización${nota ? ` · ${nota}` : ""}`);
          } else {
            let linea = `• ${fecha} - ${monto}`;
            if (nota) linea += ` - ${nota}`;
            lineas.push(linea);
          }
        });
        if (prestamosNuevos) {
          const extra = notasPrestamo.length ? ` (${notasPrestamo.join(", ")})` : "";
          lineas.push(`*+ ${formatMoney(prestamosNuevos)} - Nuevo préstamo*${extra}`);
        }
      } else if (prestamosNuevos) {
        lineas.push("");
        lineas.push(`*+ ${formatMoney(prestamosNuevos)} - Nuevo préstamo*`);
      }
      cont.dataset.texto = lineas.join("\n");
    }

    async function compartirWhatsAppIndividual() {
      const cont = document.getElementById("ind-resultado");
      const texto = cont && cont.dataset.texto;
      if (!texto) {
        showToast("Primero pulsa Ver desglose", "error");
        return;
      }
      try {
        await navigator.clipboard.writeText(texto);
        showToast("Desglose individual copiado — pégalo en WhatsApp");
      } catch (e) {
        window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, "_blank");
      }
    }



    function moneyPlain(n) {
      const v = Number(n) || 0;
      return v.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function padLine(left, right, width) {
      left = String(left || "");
      right = String(right || "");
      const maxL = Math.max(0, width - right.length - 1);
      if (left.length > maxL) left = left.slice(0, maxL);
      return left + " ".repeat(Math.max(1, width - left.length - right.length)) + right;
    }

    /** Texto plano para ticket térmico (sin emojis) */
    function generarTextoTicketDesglose(emp) {
      const semanaFin = getSemanaSeleccionada();
      const semanaStr = localDateStr(semanaFin);
      const ini = new Date(semanaFin);
      ini.setDate(ini.getDate() - 6);
      const iniStr = localDateStr(ini);
      const movSemana = movimientosDeSemana(semanaStr);
      const lista = movSemana
        .filter(m => movimientoAplicaAEmpleado(m, emp))
        .sort((a, b) => (a.fecha || "").localeCompare(b.fecha || ""));
      const sum = (tipo) => lista.filter(m => m.tipo === tipo).reduce((s, m) => s + montoParaEmpleado(m, emp), 0);
      const gastos = lista.filter(m => esDescuentoEmpleado(m.tipo)).reduce((s, m) => s + montoParaEmpleado(m, emp), 0);
      const cuotasPrest = sum("CuotaPrestamo");
      const prestamosNuevos = sum("Prestamo");
      const adel = sum("Adelanto");
      const bono = sum("Bono");
      const extra = sum("Extra");
      const ahorro = sum("Ahorro");
      const ahorroEsp = sum("AhorroEspecial");
      const retiroAhorro = sum("RetiroAhorro");
      const retiroAhorroEsp = sum("RetiroAhorroEspecial");
      const fiado = sum("Fiado");
      const empObj = empleados.find(e => e.empleado === emp);
      const base = empObj ? empObj.sueldoBase : 0;
      const total = base + bono + extra + prestamosNuevos + retiroAhorro + retiroAhorroEsp - adel - gastos - cuotasPrest - ahorro - ahorroEsp - fiado;
      // deuda prestamo total (suma de todos los préstamos en curso del empleado)
      let saldoPrest = 0;
      try {
        saldoPrest = saldoPrestamosEmpleado(emp);
      } catch (_) {}

      const W = 32;
      const lineas = [];
      lineas.push("LOS ARAGANES");
      lineas.push("DESGLOSE SEMANAL");
      lineas.push("-".repeat(W));
      lineas.push("Empleado: " + emp);
      lineas.push("Periodo:");
      lineas.push(formatDateDisplay(iniStr) + " - " + formatDateDisplay(semanaStr));
      lineas.push("-".repeat(W));
      lineas.push(padLine("Sueldo base", moneyPlain(base), W));
      if (bono) lineas.push(padLine("Bonos", "+" + moneyPlain(bono), W));
      if (extra) lineas.push(padLine("Extras", "+" + moneyPlain(extra), W));
      if (prestamosNuevos) lineas.push(padLine("Nuevo prestamo", "+" + moneyPlain(prestamosNuevos), W));
      if (adel) lineas.push(padLine("Adelantos", "-" + moneyPlain(adel), W));
      if (gastos) lineas.push(padLine("Penalizaciones", "-" + moneyPlain(gastos), W));
      if (cuotasPrest) lineas.push(padLine("Abono prestamo", "-" + moneyPlain(cuotasPrest), W));
      if (ahorro) lineas.push(padLine("Ahorros", "-" + moneyPlain(ahorro), W));
      if (ahorroEsp) lineas.push(padLine("Ahorro especial", "-" + moneyPlain(ahorroEsp), W));
      if (retiroAhorro) lineas.push(padLine("Entrega ahorro", "+" + moneyPlain(retiroAhorro), W));
      if (retiroAhorroEsp) lineas.push(padLine("Entrega ahor.esp", "+" + moneyPlain(retiroAhorroEsp), W));
      lineas.push("-".repeat(W));
      lineas.push(padLine("TOTAL A PAGAR", moneyPlain(total), W));
      if (saldoPrest > 0.009) {
        lineas.push(padLine("Deuda prestamo", moneyPlain(saldoPrest), W));
      }
      if (lista.length) {
        lineas.push("-".repeat(W));
        lineas.push("MOVIMIENTOS");
        lista.forEach(m => {
          const tip = String(m.tipo || "").slice(0, 12);
          const nota = stripCuotaMeta(m.notas || "");
          lineas.push(formatDateDisplay(m.fecha) + " " + tip);
          lineas.push(padLine(nota ? nota.slice(0, 18) : "", moneyPlain(m.monto), W));
        });
      }
      lineas.push("-".repeat(W));
      lineas.push("Impreso: " + formatDateTimeDisplay(new Date().toISOString()));
      lineas.push("");
      lineas.push("");
      lineas.push("");
      return lineas.join("\n");
    }

    function imprimirDesgloseIndividual() {
      const emp = document.getElementById("ind-empleado")?.value;
      if (!emp) {
        showToast("Selecciona un empleado y genera el desglose", "error");
        return;
      }
      // asegurar datos actualizados en pantalla
      try { verDesgloseIndividual(); } catch (_) {}
      const texto = generarTextoTicketDesglose(emp);
      const win = window.open("", "_blank", "width=400,height=700");
      if (!win) {
        showToast("Permite ventanas emergentes para imprimir", "error");
        return;
      }
      const safe = texto
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Desglose ${esc(emp)}</title>
<style>
  @page { margin: 4mm; size: 58mm auto; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: "Courier New", Courier, monospace;
    font-size: 12px;
    line-height: 1.35;
    color: #000;
    background: #fff;
    padding: 6px;
    width: 58mm;
  }
  pre {
    white-space: pre-wrap;
    word-break: break-word;
    font-family: inherit;
    font-size: inherit;
  }
  @media print {
    body { width: 58mm; padding: 2mm; }
  }
</style></head><body><pre>${safe}</pre>
<script>
  window.onload = function() {
    setTimeout(function() {
      window.focus();
      window.print();
    }, 250);
  };
<\/script></body></html>`);
      win.document.close();
    }

    // =====================================================
    // AHORROS (vista acumulada)
    // =====================================================
    function renderAhorros() {
      const container = document.getElementById("ahorros-cards");
      const empty = document.getElementById("ahorros-empty");
      if (!container) return;

      if (empleados.length === 0) {
        container.innerHTML = "";
        empty.classList.remove("hidden");
        return;
      }

      // FIX: totalGeneral se suma como capital real por persona (corrige bug de Grupo que solo sumaba 250 en vez de 250*N)
      let hayAhorros = false;
      let totalGeneral = 0;
      container.innerHTML = empleados.map(emp => {
        const depositos = movimientos
          .filter(m => m.tipo === "Ahorro" && movimientoAplicaAEmpleado(m, emp.empleado))
          .reduce((s, m) => s + montoParaEmpleado(m, emp.empleado), 0);
        const retiros = movimientos
          .filter(m => m.tipo === "RetiroAhorro" && movimientoAplicaAEmpleado(m, emp.empleado))
          .reduce((s, m) => s + montoParaEmpleado(m, emp.empleado), 0);
        const totalAhorro = Math.round((depositos - retiros) * 100) / 100;
        totalGeneral += totalAhorro;
        if (totalAhorro > 0) hayAhorros = true;

        const movimientosAhorro = movimientos
          .filter(m => (m.tipo === "Ahorro" || m.tipo === "RetiroAhorro") && movimientoAplicaAEmpleado(m, emp.empleado))
          .slice()
          .sort((a,b) => (b.fecha||"").localeCompare(a.fecha||"") || String(b.id||"").localeCompare(String(a.id||"")))
          .slice(0, 5);

        return `
          <div class="card rounded-xl p-5 fade-up">
            <div class="flex items-center justify-between mb-2">
              <div class="flex items-center gap-2">
                <div class="w-9 h-9 rounded-full bg-[#6eb8d8]/15 text-[#6eb8d8] flex items-center justify-center font-bold text-sm">${esc((emp.empleado||"?").charAt(0))}</div>
                <h3 class="font-semibold text-base text-white">${esc(emp.empleado)}</h3>
              </div>
              <span class="text-[#6eb8d8] font-bold text-xl">${formatMoney(totalAhorro)}</span>
            </div>
            ${movimientosAhorro.length ? `
              <div class="border-t border-gray-700 pt-2 space-y-1 text-xs text-gray-400 mb-3">
                ${movimientosAhorro.map(m => `
                  <div class="flex justify-between">
                    <span>${formatDateDisplay(m.fecha)}${m.tipo === "RetiroAhorro" ? " · retiro" : ""}</span>
                    <span class="${m.tipo === "RetiroAhorro" ? "text-[#e08888]" : "text-[#6eb8d8]"}">${m.tipo === "RetiroAhorro" ? "−" : "+"}${formatMoney(m.monto)}</span>
                  </div>
                `).join("")}
              </div>
            ` : `<p class="text-xs text-gray-600 mb-3">Sin movimientos de ahorro</p>`}
            ${totalAhorro > 0 ? `
              <button type="button" onclick='retirarAhorro(${jsArg(emp.empleado)}, "Ahorro", ${totalAhorro})' class="btn-outline w-full py-2 rounded-lg text-xs">Entregar / retirar ahorro</button>
            ` : ""}
          </div>
        `;
      }).join("");

      // Resumen total arriba
      if (totalGeneral > 0) {
        container.insertAdjacentHTML("afterbegin", `
          <div class="card rounded-xl p-5 sm:col-span-2 lg:col-span-3 bg-[rgba(74,155,191,0.08)] border-[#2a4050]">
            <div class="flex items-center justify-between">
              <span class="font-medium text-[#6eb8d8]">Total ahorrado (todos)</span>
              <span class="text-2xl font-bold text-[#6eb8d8]">${formatMoney(totalGeneral)}</span>
            </div>
          </div>
        `);
      }

      empty.classList.toggle("hidden", hayAhorros || empleados.length > 0);
      if (!hayAhorros && empleados.length > 0) {
        // ya se muestran las tarjetas en 0, no hace falta empty
        empty.classList.add("hidden");
      }
      if (typeof renderAhorroSemanalLista === "function") renderAhorroSemanalLista();
    }

    function renderAhorroSemanalLista() {
      const cont = document.getElementById("ahorro-semanal-lista");
      const hint = document.getElementById("ahorro-semanal-hint");
      if (!cont) return;
      const prev = new Set(
        [...document.querySelectorAll(".ahorro-sem-check:checked")].map(c => c.value)
      );
      const hadPrev = document.querySelectorAll(".ahorro-sem-check").length > 0;
      if (!empleados.length) {
        cont.innerHTML = `<p class="text-xs text-gray-500 col-span-full">No hay empleados registrados.</p>`;
        if (hint) hint.textContent = "";
        return;
      }
      cont.innerHTML = empleados.map(e => {
        const name = e.empleado || "";
        const checked = hadPrev ? prev.has(name) : true;
        return `
          <label class="flex items-center gap-2 px-2.5 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] cursor-pointer hover:border-[var(--border-hover)]">
            <input type="checkbox" class="ahorro-sem-check accent-[#4a9bbf]" value="${esc(name)}" ${checked ? "checked" : ""} onchange="actualizarAhorroSemanalHint()" />
            <span class="text-[13px] text-gray-200 truncate">${esc(name)}</span>
          </label>`;
      }).join("");
      actualizarAhorroSemanalHint();
    }

    function seleccionarAhorroSemanal(todos) {
      document.querySelectorAll(".ahorro-sem-check").forEach(c => { c.checked = !!todos; });
      actualizarAhorroSemanalHint();
    }

    function actualizarAhorroSemanalHint() {
      const hint = document.getElementById("ahorro-semanal-hint");
      if (!hint) return;
      const checks = [...document.querySelectorAll(".ahorro-sem-check:checked")];
      const monto = parseFloat(document.getElementById("ahorro-semanal-monto")?.value) || 0;
      const n = checks.length;
      if (!n) {
        hint.textContent = "Selecciona al menos un empleado.";
        return;
      }
      const total = Math.round(monto * n * 100) / 100;
      let sem = "";
      try { sem = formatDateDisplay(localDateStr(getSemanaSeleccionada())); } catch (_) {}
      hint.textContent = `${n} persona(s) · ${formatMoney(monto)} c/u · total ${formatMoney(total)}` +
        (sem ? ` · semana que cierra ${sem}` : "");
    }

    async function aplicarAhorroSemanal() {
      if (!currentUser || currentUser.rol !== "admin") {
        return showToast("Solo admin", "error");
      }
      if (isSaving) return;
      const monto = parseFloat(document.getElementById("ahorro-semanal-monto")?.value);
      if (!monto || monto <= 0) return showToast("Ingresa un monto válido", "error");
      const emps = [...document.querySelectorAll(".ahorro-sem-check:checked")].map(c => c.value);
      if (!emps.length) return showToast("Selecciona al menos un empleado", "error");

      const semana = localDateStr(getSemanaSeleccionada());
      const fecha = localDateStr(new Date());
      const total = Math.round(monto * emps.length * 100) / 100;
      if (!await uiConfirm(
        `¿Registrar ahorro de ${formatMoney(monto)} a ${emps.length} persona(s)?\n\n` +
        `Total: ${formatMoney(total)}\n` +
        `Semana que cierra: ${formatDateDisplay(semana)}\n\n` +
        `Se descontará del sueldo de esa semana.`
      )) return;

      isSaving = true;
      const btn = document.getElementById("btn-ahorro-semanal");
      setButtonLoading(btn, true, "Hacer ahorro");
      try {
        const montoCada = Math.round(monto * 100) / 100;
        // FIX DEFINITIVO: crear una fila por empleado, sin meta de grupo para evitar doble conteo
        // Antes se guardaba 1 fila con empleado="Grupo" y monto=250, y el total sumaba 250 en lugar de 1000
        // Ahora guardamos N filas individuales de 250 c/u, total real = N*250
        const rows = emps.map(nombre => ({
          fecha,
          empleado: nombre,
          tipo: "Ahorro",
          monto: montoCada,
          notas: "Ahorro semanal",
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
        showToast(`Ahorro listo: ${rows.length} × ${formatMoney(montoCada)}`);
        await cargarTodo();
        showTab("ahorros");
      } catch (err) {
        console.error(err);
        showToast(err.message || "Error al registrar ahorro", "error");
      } finally {
        isSaving = false;
        setButtonLoading(btn, false, "Hacer ahorro");
      }
    }

    // =====================================================
    // NUEVO MOVIMIENTO
    // =====================================================
    function renderAhorroEspecial() {
      const container = document.getElementById("ahorroespecial-cards");
      const empty = document.getElementById("ahorroespecial-empty");
      if (!container) return;

      if (empleados.length === 0) {
        container.innerHTML = "";
        if (empty) empty.classList.remove("hidden");
        return;
      }

      let hay = false;
      container.innerHTML = empleados.map(emp => {
        const depositos = movimientos
          .filter(m => m.tipo === "AhorroEspecial" && movimientoAplicaAEmpleado(m, emp.empleado))
          .reduce((s, m) => s + montoParaEmpleado(m, emp.empleado), 0);
        const retiros = movimientos
          .filter(m => m.tipo === "RetiroAhorroEspecial" && movimientoAplicaAEmpleado(m, emp.empleado))
          .reduce((s, m) => s + montoParaEmpleado(m, emp.empleado), 0);
        const total = Math.round((depositos - retiros) * 100) / 100;
        if (total > 0) hay = true;
        const ultimos = movimientos
          .filter(m => (m.tipo === "AhorroEspecial" || m.tipo === "RetiroAhorroEspecial") && movimientoAplicaAEmpleado(m, emp.empleado))
          .slice()
          .sort((a,b) => (b.fecha||"").localeCompare(a.fecha||"") || String(b.id||"").localeCompare(String(a.id||"")))
          .slice(0, 5);
        return `
          <div class="card rounded-xl p-5 fade-up">
            <div class="flex items-center justify-between mb-2">
              <div class="flex items-center gap-2">
                <div class="w-9 h-9 rounded-full bg-[#9a7ab8]/15 text-[#b8a0d0] flex items-center justify-center font-bold text-sm">${esc((emp.empleado||"?").charAt(0))}</div>
                <h3 class="font-semibold text-base text-white">${esc(emp.empleado)}</h3>
              </div>
              <span class="text-[#b8a0d0] font-bold text-xl">${formatMoney(total)}</span>
            </div>
            ${ultimos.length ? `
              <div class="border-t border-gray-700 pt-2 space-y-1 text-xs text-gray-400 mb-3">
                ${ultimos.map(m => `
                  <div class="flex justify-between">
                    <span>${formatDateDisplay(m.fecha)}${m.tipo === "RetiroAhorroEspecial" ? " · retiro" : ""}</span>
                    <span class="${m.tipo === "RetiroAhorroEspecial" ? "text-[#e08888]" : "text-[#b8a0d0]"}">${m.tipo === "RetiroAhorroEspecial" ? "−" : "+"}${formatMoney(m.monto)}</span>
                  </div>
                `).join("")}
              </div>
            ` : `<p class="text-xs text-gray-600 mb-3">Sin movimientos</p>`}
            ${total > 0 ? `
              <button type="button" onclick='retirarAhorro(${jsArg(emp.empleado)}, "AhorroEspecial", ${total})' class="btn-outline w-full py-2 rounded-lg text-xs">Entregar / retirar ahorro esp.</button>
            ` : ""}
          </div>
        `;
      }).join("");

      if (empty) {
        if (!hay) {
          empty.classList.remove("hidden");
          container.innerHTML = "";
        } else {
          empty.classList.add("hidden");
        }
      }
    }



    async function retirarAhorro(empleado, tipoAhorro, disponible) {
      if (!currentUser || currentUser.rol !== "admin") {
        return showToast("Solo admin puede entregar ahorros", "error");
      }
      if (isSaving) return;
      const disponibleN = Math.round((Number(disponible) || 0) * 100) / 100;
      if (disponibleN <= 0) return showToast("No hay saldo de ahorro", "error");
      const label = tipoAhorro === "AhorroEspecial" ? "ahorro especial" : "ahorro";
      const raw = await uiPrompt(
        `Entregar ${label} de ${empleado}\nDisponible: ${formatMoney(disponibleN)}\n\nEscribe el monto a entregar (o el total):`,
        String(disponibleN)
      );
      if (raw === null) return;
      const monto = Math.round((parseFloat(String(raw).replace(",", ".")) || 0) * 100) / 100;
      if (monto <= 0) return showToast("Monto inválido", "error");
      if (monto > disponibleN + 0.001) return showToast("No puede ser mayor al disponible", "error");
      if (!await uiConfirm(`¿Entregar ${formatMoney(monto)} de ${label} a ${empleado}?`)) return;

      const tipoMov = tipoAhorro === "AhorroEspecial" ? "RetiroAhorroEspecial" : "RetiroAhorro";
      const fecha = localDateStr(new Date());
      const semana = localDateStr(getSemanaSeleccionada());
      isSaving = true;
      try {
        const row = {
          fecha,
          empleado,
          tipo: tipoMov,
          monto,
          notas: `Entrega de ${label}`,
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
        showToast(`Entregado ${formatMoney(monto)} de ${label} a ${empleado}`);
        await cargarTodo();
        if (tipoAhorro === "AhorroEspecial") showTab("ahorroespecial");
        else showTab("ahorros");
      } catch (err) {
        console.error(err);
        showToast(err.message || "Error al registrar retiro", "error");
      } finally {
        isSaving = false;
      }
    }

