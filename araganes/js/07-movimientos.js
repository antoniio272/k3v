    function setTipo(tipo) {
      tipoSeleccionado = tipo;
      const activeMap = {
        Bono: "tipo-active-bono",
        Extra: "tipo-active-extra",
        Adelanto: "tipo-active-adelanto",
        Gasto: "tipo-active-descuento",
        Ingreso: "tipo-active-bono",
        Descuento: "tipo-active-descuento",
        Penalizacion: "tipo-active-descuento",
        Ahorro: "tipo-active-ahorro",
        AhorroEspecial: "tipo-active-ahorroespecial",
        Fiado: "tipo-active-fiado"
      };
      document.querySelectorAll(".tipo-btn").forEach(b => {
        b.classList.remove(
          "tipo-active-bono", "tipo-active-extra", "tipo-active-adelanto",
          "tipo-active-descuento", "tipo-active-ahorro", "tipo-active-ahorroespecial", "tipo-active-fiado",
          "border-aragan-yellow", "bg-aragan-yellow", "text-aragan-black"
        );
        b.classList.add("border-gray-600");
      });
      const btn = document.getElementById(`tipo-${tipo}`);
      if (btn) {
        btn.classList.add(activeMap[tipo] || "tipo-active-bono");
        btn.classList.remove("border-gray-600");
      }

      const esGastoNegocio = tipo === "Gasto" || tipo === "Ingreso";
      const esFiado = tipo === "Fiado";
      const modoBox = document.getElementById("modo-monto-box");
      const empSection = document.getElementById("emp-section");
      const gastoBox = document.getElementById("gasto-negocio-box");
      const labelMonto = document.getElementById("label-monto");
      const lockOverlay = document.getElementById("emp-lock-overlay");

      if (esGastoNegocio) {
        if (modoBox) modoBox.classList.add("hidden");
        if (gastoBox) {
          gastoBox.classList.remove("hidden");
          const title = gastoBox.querySelector(".font-semibold");
          const sub = gastoBox.querySelector(".text-\\[13px\\], .block.mt-1");
          if (title) {
            title.textContent = tipo === "Ingreso" ? "Ingreso del negocio" : "Gasto del negocio";
            title.className = tipo === "Ingreso"
              ? "font-semibold text-[#5ecf8f]"
              : "font-semibold text-[#e08888]";
          }
          const subEl = gastoBox.querySelector("span.block");
          if (subEl) {
            subEl.textContent = tipo === "Ingreso"
              ? "No afecta sueldos."
              : "No descuenta sueldos.";
          }
        }
        if (labelMonto) labelMonto.textContent = tipo === "Ingreso" ? "Monto del ingreso" : "Monto del gasto";
        if (empSection) {
          empSection.classList.remove("hidden");
          empSection.classList.add("is-locked");
        }
        if (lockOverlay) lockOverlay.classList.remove("hidden");
        document.querySelectorAll(".emp-check").forEach(c => {
          c.checked = false;
          c.disabled = true;
          const card = c.closest(".emp-card");
          if (card) card.classList.remove("is-selected");
        });
      } else if (esFiado) {
        if (modoBox) modoBox.classList.add("hidden"); // Fiado siempre es individual
        if (gastoBox) {
          gastoBox.classList.remove("hidden");
          const title = gastoBox.querySelector(".font-semibold");
          if (title) {
            title.textContent = "Fiado 🍔 · 1 empleado";
            title.className = "font-semibold text-[#e8a04a]";
          }
          const subEl = gastoBox.querySelector("span.block");
          if (subEl) {
            subEl.textContent = "Se descuenta del sueldo al cierre. No mueve caja.";
          }
        }
        if (labelMonto) labelMonto.textContent = "Monto del fiado";
        if (empSection) {
          empSection.classList.remove("hidden");
          empSection.classList.remove("is-locked");
        }
        if (lockOverlay) lockOverlay.classList.add("hidden");
        document.querySelectorAll(".emp-check").forEach(c => { c.disabled = false; });
        // Forzar selección única: si hay más de 1 seleccionado, dejar solo el primero
        const checks = document.querySelectorAll(".emp-check:checked");
        if (checks.length > 1) {
          checks.forEach((c, i) => { if (i>0) { c.checked=false; const card=c.closest(".emp-card"); if(card) card.classList.remove("is-selected"); } });
        }
      } else {
        if (modoBox) {
          modoBox.classList.remove("hidden");
          setModoMonto(modoMonto || "individual");
        }
        if (gastoBox) gastoBox.classList.add("hidden");
        if (empSection) {
          empSection.classList.remove("hidden");
          empSection.classList.remove("is-locked");
        }
        if (lockOverlay) lockOverlay.classList.add("hidden");
        document.querySelectorAll(".emp-check").forEach(c => { c.disabled = false; });
      }
      const metodoBox = document.getElementById("metodo-pago-box");
      if (metodoBox) {
        if (tipoRequiereMetodo(tipo)) {
          metodoBox.classList.remove("hidden");
          if (!metodoPagoSeleccionado) setMetodoPago("Caja");
          else setMetodoPago(metodoPagoSeleccionado);
        } else {
          metodoBox.classList.add("hidden");
        }
      }
      actualizarMontoDividido();
    }

    function avisarEmpleadosBloqueados() {
      const t = tipoSeleccionado === "Ingreso" ? "Ingreso" : "Gasto";
      showToast(`${t}: no se asigna a empleados`, "error");
    }

    function setMontoRapido(n) {
      document.getElementById("mov-monto").value = n;
      actualizarMontoDividido();
    }

    function seleccionarEmpleados(todos) {
      if (tipoSeleccionado === "Gasto" || tipoSeleccionado === "Ingreso") {
        avisarEmpleadosBloqueados();
        return;
      }
      document.querySelectorAll(".emp-check").forEach(c => {
        if (c.disabled) return;
        c.checked = !!todos;
        const card = c.closest(".emp-card");
        if (card) card.classList.toggle("is-selected", !!todos);
      });
      actualizarMontoDividido();
    }

    // Todos los tipos usan selector individual ($X c/u) vs grupal ($X total ÷ n)
    const TIPOS_CON_MODO = ["Ahorro", "AhorroEspecial", "Bono", "Extra", "Adelanto", "Descuento", "Penalizacion"]; // Fiado es siempre individual
    function tipoUsaModo(t) { return TIPOS_CON_MODO.includes(t); }

    // Adelanto con 2 o más personas siempre se divide entre todos (modo Grupal), sin importar el modo
    // que estuviera activo antes. Evita el error de dar, por ejemplo, $50 a cada una de 5 personas
    // cuando en realidad eran $50 a repartir entre las 5. Los botones Individual/Grupal siguen
    // visibles igual que para los demás tipos; con 1 sola persona seleccionada no aplica esta regla.
    const TIPOS_SIEMPRE_GRUPAL_CON_VARIOS = ["Adelanto"];
    function tipoSiempreGrupalConVarios(t) { return TIPOS_SIEMPRE_GRUPAL_CON_VARIOS.includes(t); }

    function _aplicarModoVisual(modo) {
      document.querySelectorAll(".modo-btn").forEach(b => {
        b.classList.remove("modo-active", "bg-aragan-yellow", "text-aragan-black", "border-aragan-yellow");
        b.classList.add("border-gray-600");
      });
      const btn = document.getElementById(`modo-${modo}`);
      if (btn) {
        btn.classList.add("modo-active");
        btn.classList.remove("border-gray-600");
      }
      const label = document.getElementById("label-monto");
      if (label) {
        label.textContent = modo === "individual" ? "Monto por persona" : "Monto total";
      }
    }

    function setModoMonto(modo) {
      modoMonto = modo;
      _aplicarModoVisual(modo);
      actualizarMontoDividido();
    }

    function renderCheckboxes() {
      const cont = document.getElementById("empleados-checkboxes");
      if (!cont) return;
      if (empleados.length === 0) {
        cont.innerHTML = `<div class="emp-empty">No hay empleados. Un administrador debe agregarlos primero.</div>`;
        actualizarResumenSeleccion();
        return;
      }
      const isAdmin = currentUser && currentUser.rol === "admin";
      let lista = empleados;
      const q = (document.getElementById("emp-search")?.value || "").trim().toLowerCase();
      if (q) lista = lista.filter(e => (e.empleado || "").toLowerCase().includes(q));

      if (lista.length === 0) {
        cont.innerHTML = `<div class="emp-empty">Ningún empleado coincide con la búsqueda.</div>`;
        actualizarResumenSeleccion();
        return;
      }

      // Preserve checked state across re-render
      const prevChecked = new Set(
        [...document.querySelectorAll(".emp-check:checked")].map(c => c.value)
      );

      cont.innerHTML = lista.map(e => {
        const name = e.empleado || "?";
        const checked = prevChecked.has(name);
        const inicial = name.charAt(0).toUpperCase();
        return `
        <label class="emp-card${checked ? " is-selected" : ""}" data-emp="${esc(name)}">
          <input type="checkbox" value="${esc(name)}" class="emp-check" ${checked ? "checked" : ""} onchange="onEmpToggle(this)" />
          <span class="emp-check-mark" aria-hidden="true">
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2 6.5L4.5 9L10 3" stroke="#0a0a0a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </span>
          <span class="emp-avatar">${esc(inicial)}</span>
          <span class="emp-name" title="${esc(name)}">${esc(name)}</span>
        </label>`;
      }).join("");
      actualizarMontoDividido();
    }

    function onEmpToggle(el) {
      if (tipoSeleccionado === "Gasto" || tipoSeleccionado === "Ingreso") {
        el.checked = false;
        avisarEmpleadosBloqueados();
        return;
      }
      const card = el.closest(".emp-card");
      if (card) card.classList.toggle("is-selected", el.checked);
      actualizarMontoDividido();
    }

    function filtrarEmpleados(q) {
      renderCheckboxes();
    }

    function actualizarResumenSeleccion() {
      const checks = [...document.querySelectorAll(".emp-check:checked")];
      const summary = document.getElementById("selection-summary");
      const countEl = document.getElementById("sel-count");
      const previewEl = document.getElementById("sel-preview");
      if (!summary) return;
      if (checks.length === 0) {
        summary.classList.add("hidden");
        return;
      }
      summary.classList.remove("hidden");
      if (countEl) countEl.textContent = String(checks.length);
      if (previewEl) {
        const names = checks.map(c => c.value);
        previewEl.textContent = names.length <= 3
          ? names.join(", ")
          : names.slice(0, 2).join(", ") + ` +${names.length - 2} más`;
      }
    }

    function actualizarMontoDividido() {
      const checks = document.querySelectorAll(".emp-check:checked");

      // Adelanto con 2+ personas: forzar modo Grupal (ver TIPOS_SIEMPRE_GRUPAL_CON_VARIOS arriba)
      if (tipoSiempreGrupalConVarios(tipoSeleccionado) && checks.length >= 2 && modoMonto !== "grupal") {
        modoMonto = "grupal";
        _aplicarModoVisual("grupal");
        showToast(`Monto dividido entre ${checks.length} (Grupal)`, "info");
      }

      const totalEmpleados = empleados.length;
      const contador = document.getElementById("contador-seleccionados");
      if (contador) {
        contador.textContent = `${checks.length} de ${totalEmpleados}`;
      }
      if (typeof actualizarResumenSeleccion === "function") actualizarResumenSeleccion();
      const monto = parseFloat(document.getElementById("mov-monto").value) || 0;
      const label = document.getElementById("monto-dividido");
      if (!label) return;

      const labelMonto = document.getElementById("label-monto");
      if (tipoSeleccionado === "Gasto" || tipoSeleccionado === "Ingreso") {
        if (labelMonto) labelMonto.textContent = tipoSeleccionado === "Ingreso" ? "Monto del ingreso" : "Monto del gasto";
        label.textContent = "";
        return;
      }
      if (labelMonto && tipoUsaModo(tipoSeleccionado) && modoMonto === "individual") {
        labelMonto.textContent = "Monto por persona";
      } else if (labelMonto) {
        labelMonto.textContent = "Monto total";
      }

      if (tipoUsaModo(tipoSeleccionado)) {
        if (checks.length >= 1 && monto > 0) {
          if (modoMonto === "individual") {
            const total = (monto * checks.length).toFixed(2);
            label.textContent = checks.length === 1
              ? `Se aplicará $${monto.toFixed(2)} a 1 persona`
              : `$${monto.toFixed(2)} × ${checks.length} = $${total} en total`;
          } else {
            const cadaUno = (monto / checks.length).toFixed(2);
            label.textContent = `Se dividirá en ${checks.length} → $${cadaUno} cada uno`;
          }
        } else {
          label.textContent = "";
        }
      } else {
        // Comportamiento clásico (siempre divide)
        if (checks.length > 1 && monto > 0) {
          const cadaUno = (monto / checks.length).toFixed(2);
          label.textContent = `Se dividirá en ${checks.length} → $${cadaUno} cada uno`;
        } else {
          label.textContent = "";
        }
      }
    }

    document.getElementById("mov-monto")?.addEventListener("input", actualizarMontoDividido);

    function guardarMovimiento() {
      if (isSaving) return;
      const fecha = document.getElementById("mov-fecha").value;
      const monto = parseFloat(document.getElementById("mov-monto").value);
      const notas = document.getElementById("mov-notas").value.trim();
      const esGastoNegocio = tipoSeleccionado === "Gasto" || tipoSeleccionado === "Ingreso";
      let checks = [...document.querySelectorAll(".emp-check:checked")].map(c => c.value);

      if (!fecha) return showToast("Elige una fecha", "error");
      if (!tipoSeleccionado) return showToast("Elige un tipo", "error");
      if (!monto || monto <= 0) return showToast("Ingresa un monto válido", "error");
      if (!notas) return showToast("Escribe el motivo / nota (obligatorio)", "error");
      if (tipoRequiereMetodo(tipoSeleccionado) && !metodoPagoSeleccionado) {
        return showToast("Elige método de pago: Caja, Tarjeta o Transferencia", "error");
      }

      if (esGastoNegocio) {
        // Gasto del negocio: no va ligado a empleados
        checks = ["Negocio"];
      } else if (checks.length === 0) {
        return showToast("Selecciona al menos un empleado", "error");
      } else if (tipoSeleccionado === "Fiado" && checks.length > 1) {
        return showToast("Fiado es individual: selecciona solo 1 empleado", "error");
      }

      if (currentUser.rol === "empleado" && tipoSeleccionado !== "Adelanto" && tipoSeleccionado !== "Gasto" && tipoSeleccionado !== "Ingreso" && tipoSeleccionado !== "Fiado") {
        return showToast("No tienes permiso para este tipo de movimiento", "error");
      }
      if (currentUser.rol !== "admin" && (tipoSeleccionado === "Prestamo" || tipoSeleccionado === "CuotaPrestamo")) {
        return showToast("Solo admin puede registrar préstamos", "error");
      }

      const notasFinal = tipoRequiereMetodo(tipoSeleccionado)
        ? notasConMetodo(notas, metodoPagoSeleccionado)
        : notas;

      const payload = {
        action: "addMovimientos",
        fecha,
        tipo: tipoSeleccionado,
        montoTotal: monto,
        notas: notasFinal,
        metodoPago: tipoRequiereMetodo(tipoSeleccionado) ? metodoPagoSeleccionado : "",
        empleados: checks,
        responsable: currentUser ? currentUser.usuario : ""
      };
      if (tipoUsaModo(tipoSeleccionado)) {
        payload.modoMonto = modoMonto;
      }

      // Texto de confirmación
      let detalleMonto = formatMoney(monto);
      let destino;
      if (esGastoNegocio) {
        destino = tipoSeleccionado === "Ingreso" ? "ingreso del negocio" : "gasto del negocio";
      } else {
        if (tipoUsaModo(tipoSeleccionado) && modoMonto === "individual") {
          detalleMonto = `${formatMoney(monto)} a cada uno (total ${formatMoney(monto * checks.length)})`;
        } else if (checks.length > 1) {
          const cada = Math.round((monto / checks.length) * 100) / 100;
          detalleMonto = `${formatMoney(monto)} total → ${formatMoney(cada)} c/u`;
        }
        destino = checks.length <= 3 ? checks.join(", ") : `${checks.slice(0, 2).join(", ")} y ${checks.length - 2} más`;
      }
      const metodoTxt = payload.metodoPago ? ` · <strong class="text-white">${payload.metodoPago}</strong>` : "";
      document.getElementById("confirm-text").innerHTML =
        `Vas a registrar <strong class="text-white">${tipoIcon(tipoSeleccionado)} ${tipoSeleccionado}</strong> de <strong class="text-aragan-yellow">${detalleMonto}</strong>${esGastoNegocio ? " como" : " para"} <strong class="text-white">${destino}</strong>${metodoTxt}.`;
      pendingPayload = payload;
      document.getElementById("confirm-overlay").classList.remove("hidden");
    }

    function cerrarConfirmacion() {
      pendingPayload = null;
      document.getElementById("confirm-overlay").classList.add("hidden");
    }

    async function confirmarYGuardar() {
      if (!pendingPayload || isSaving) return;
      const payload = pendingPayload;
      const tipo = payload.tipo;
      cerrarConfirmacion();

      isSaving = true;
      const btn = document.getElementById("btn-guardar-mov");
      setButtonLoading(btn, true, "Guardar Movimiento");

      try {
        const emps = payload.empleados || [];
        const tipoMov = payload.tipo;
        const modo = (payload.modoMonto || "individual").toLowerCase();
        const esAhorro = tipoUsaModo(tipoMov);
        let montoCada = Number(payload.montoTotal) || 0;
        if (!(esAhorro && modo === "individual")) {
          montoCada = Math.round((montoCada / emps.length) * 100) / 100;
        } else {
          montoCada = Math.round(montoCada * 100) / 100;
        }

        const fecha = payload.fecha;
        // semana = miércoles de cierre (fecha local, sin UTC shift)
        const d = new Date(fecha + "T12:00:00");
        const day = d.getDay();
        const daysToAdd = (3 - day + 7) % 7;
        d.setDate(d.getDate() + daysToAdd);
        const semana = localDateStr(d);

        let rows;
        const resp = payload.responsable || (currentUser && currentUser.usuario) || "";
        if (tipoMov === "Gasto" || tipoMov === "Ingreso") {
          rows = [{
            fecha,
            empleado: "Negocio",
            tipo: tipoMov,
            monto: Math.round((Number(payload.montoTotal) || 0) * 100) / 100,
            notas: payload.notas || "",
            semana,
            responsable: resp
          }];
        } else if (emps.length > 1) {
          // Un solo movimiento grupal (monto = por persona)
          rows = [{
            fecha,
            empleado: "Grupo",
            tipo: tipoMov,
            monto: montoCada,
            notas: notasConGrupo(payload.notas || "", emps),
            semana,
            responsable: resp
          }];
        } else {
          rows = [{
            fecha,
            empleado: emps[0],
            tipo: tipoMov,
            monto: montoCada,
            notas: stripGrupoMeta(payload.notas || ""),
            semana,
            responsable: resp
          }];
        }

        const { data: insertedRows, error } = await sb.from("movimientos").insert(rows).select("*");
        if (error) throw error;

        // AUDITORIA - esperar cada insert (si falla, avisar; el movimiento principal ya quedó)
        try {
          const toAudit = (insertedRows && insertedRows.length) ? insertedRows : rows;
          let auditOk = 0, auditFail = 0, lastErr = "";
          for (const r of toAudit) {
            const res = await logAuditoria("INSERT", r);
            if (res && res.ok) auditOk++;
            else { auditFail++; lastErr = (res && res.error) || "error"; }
          }
          console.log("🔒 Auditoria:", auditOk, "ok,", auditFail, "fallos");
          if (auditFail > 0) {
            showToast("Movimiento guardado, pero auditoría falló: " + lastErr, "error");
          }
        } catch (ae) {
          console.error("Error auditoria rows", ae);
          showToast("Movimiento guardado; auditoría no respondió", "error");
        }

        const msg = (emps.length > 1 && tipoMov !== "Gasto" && tipoMov !== "Ingreso")
          ? `¡Listo! 1 movimiento grupal · ${emps.length} personas · ${formatMoney(montoCada)} c/u`
          : (esAhorro && modo === "individual"
            ? `¡Listo! ${formatMoney(montoCada)} registrado`
            : `¡Listo! Movimiento guardado`);
        showToast(msg);
        if (tipoMov === "Bono") lanzarConfetti();
        document.getElementById("mov-monto").value = "";
        document.getElementById("mov-notas").value = "";
        document.querySelectorAll(".emp-check").forEach(c => c.checked = false);
        actualizarMontoDividido();
        await cargarTodo();
        if (currentUser.rol === "admin") {
          if (tipoMov === "Ahorro") showTab("ahorros");
          else if (tipoMov === "AhorroEspecial") showTab("ahorroespecial");
          else if (tipoMov === "Gasto") showTab("gastosnegocio");
          else if (tipoMov === "Ingreso") showTab("ingresosnegocio");
          else if (tipoMov === "Prestamo" || tipoMov === "CuotaPrestamo") showTab("prestamos");
          else showTab("dashboard");
        } else {
          showTab("historial");
        }
      } catch (err) {
        console.error(err);
        showToast(err.message || "Error al guardar", "error");
      } finally {
        isSaving = false;
        setButtonLoading(btn, false, "Guardar Movimiento");
      }
    }

    // Confetti simple (sin librerías)
    function lanzarConfetti() {
      const canvas = document.getElementById("confetti-canvas");
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      const colors = ["#c9a227", "#e0b83a", "#f0d675", "#a8841c", "#8a7018", "#fff8e0"];
      const pieces = Array.from({ length: 80 }, () => ({
        x: Math.random() * canvas.width,
        y: -20 - Math.random() * 80,
        w: 6 + Math.random() * 6,
        h: 8 + Math.random() * 8,
        color: colors[Math.floor(Math.random() * colors.length)],
        vy: 2 + Math.random() * 4,
        vx: -2 + Math.random() * 4,
        rot: Math.random() * Math.PI,
        vr: -0.2 + Math.random() * 0.4
      }));
      let frames = 0;
      function frame() {
        frames++;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        pieces.forEach(p => {
          p.x += p.vx;
          p.y += p.vy;
          p.vy += 0.08;
          p.rot += p.vr;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
          ctx.restore();
        });
        if (frames < 90) requestAnimationFrame(frame);
        else ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
      requestAnimationFrame(frame);
    }

