    // Zona horaria: Ciudad Victoria, Tamaulipas / Monterrey (Centro de México, UTC-6)
    const APP_TZ = "America/Monterrey";

    function zonedParts(date) {
      const d = date instanceof Date ? date : new Date(date);
      if (isNaN(d.getTime())) return null;
      const fmt = new Intl.DateTimeFormat("en-CA", {
        timeZone: APP_TZ,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
        weekday: "short"
      });
      const parts = {};
      fmt.formatToParts(d).forEach(p => {
        if (p.type !== "literal") parts[p.type] = p.value;
      });
      return parts;
    }

    /** Fecha "hoy" en Monterrey / Cd. Victoria como Date a mediodía local aproximado */
    function nowEnAppTZ() {
      const p = zonedParts(new Date());
      if (!p) return new Date();
      // Construir mediodía del día actual en la zona (evita saltos UTC)
      return new Date(`${p.year}-${p.month}-${p.day}T12:00:00`);
    }

    // Miércoles de cierre de la semana en curso (zona Monterrey / Cd. Victoria)
    function getWeekEndingWednesday(base) {
      let d;
      if (base) {
        d = base instanceof Date ? new Date(base.getTime()) : new Date(base);
        if (typeof base === "string" && /^\d{4}-\d{2}-\d{2}/.test(base)) {
          d = new Date(base.slice(0, 10) + "T12:00:00");
        }
      } else {
        d = nowEnAppTZ();
      }
      d.setHours(12, 0, 0, 0);
      const diff = (3 - d.getDay() + 7) % 7; // 3 = miércoles
      d.setDate(d.getDate() + diff);
      return d;
    }

    /** YYYY-MM-DD en zona America/Monterrey (Cd. Victoria / Monterrey) */
    function localDateStr(d) {
      if (!d) return "";
      if (typeof d === "string") {
        const m = String(d).trim().match(/^(\d{4}-\d{2}-\d{2})/);
        if (m) return m[1]; // fecha de calendario pura, sin convertir
      }
      const p = zonedParts(d instanceof Date ? d : new Date(d));
      if (!p) return "";
      return `${p.year}-${p.month}-${p.day}`;
    }

    function movimientosDeSemana(semanaStr) {
      const s = (semanaStr || "").slice(0, 10);
      if (!s) return [];
      // 1) por campo semana
      let list = movimientos.filter(m => (m.semana || "").slice(0, 10) === s);
      if (list.length) return list;
      // 2) fallback: por rango de fechas (jueves→miércoles de cierre)
      const fin = new Date(s + "T12:00:00");
      const ini = new Date(fin);
      ini.setDate(ini.getDate() - 6);
      const iniS = localDateStr(ini);
      const finS = localDateStr(fin);
      return movimientos.filter(m => {
        const f = (m.fecha || "").slice(0, 10);
        return f >= iniS && f <= finS;
      });
    }

    function formatDateDisplay(value) {
      if (!value) return "";
      // Solo fecha YYYY-MM-DD: mostrar como calendario (sin TZ shift)
      if (typeof value === "string") {
        const pure = value.trim().match(/^(\d{4}-\d{2}-\d{2})$/);
        if (pure || (value.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(value) && value.length <= 10)) {
          const d = new Date(value.slice(0, 10) + "T12:00:00");
          if (isNaN(d.getTime())) return value.slice(0, 10);
          return d.toLocaleDateString("es-MX", {
            timeZone: APP_TZ,
            day: "2-digit",
            month: "short",
            year: "numeric"
          });
        }
        if (/^\d{4}-\d{2}-\d{2}/.test(value.trim())) {
          const d = new Date(value.slice(0, 10) + "T12:00:00");
          if (!isNaN(d.getTime())) {
            return d.toLocaleDateString("es-MX", {
              timeZone: APP_TZ,
              day: "2-digit",
              month: "short",
              year: "numeric"
            });
          }
        }
      }
      const d = new Date(value);
      if (isNaN(d.getTime())) return String(value);
      return d.toLocaleDateString("es-MX", {
        timeZone: APP_TZ,
        day: "2-digit",
        month: "short",
        year: "numeric"
      });
    }

    /** Fecha + hora en zona Monterrey / Cd. Victoria */
    function formatDateTimeDisplay(value) {
      if (!value) return "";
      const d = new Date(value);
      if (isNaN(d.getTime())) return formatDateDisplay(value);
      return d.toLocaleString("es-MX", {
        timeZone: APP_TZ,
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true
      });
    }

    /** Fecha de negocio (calendario) + hora de registro en Monterrey / Cd. Victoria */
    function formatMovimientoCuando(m) {
      if (!m) return "";
      const fechaNegocio = formatDateDisplay(m.fecha);
      if (m.created_at) {
        const d = new Date(m.created_at);
        if (!isNaN(d.getTime())) {
          const hora = d.toLocaleTimeString("es-MX", {
            timeZone: APP_TZ,
            hour: "2-digit",
            minute: "2-digit",
            hour12: true
          });
          return fechaNegocio ? `${fechaNegocio} · ${hora}` : formatDateTimeDisplay(m.created_at);
        }
      }
      return fechaNegocio;
    }

    /** Solo YYYY-MM-DD de la fecha del movimiento (nunca UTC que mueva el día) */
    function soloDia(value) {
      if (value == null || value === "") return "";
      const s = String(value).trim();
      const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
      if (m) return m[1];
      return "";
    }

    function tipoIcon(tipo) {
      const icons = {
        Bono: "🎁",
        Extra: "➕",
        Adelanto: "💸",
        Gasto: "📉",
        Ingreso: "📈",
        Descuento: "📉",
        Penalizacion: "⚠️",
        Prestamo: "💳",
        CuotaPrestamo: "📉💳",
        Ahorro: "🐷",
        AhorroEspecial: "⭐",
        RetiroAhorro: "🐷💸",
        RetiroAhorroEspecial: "⭐💸",
        Fiado: "🍔"
      };
      return icons[tipo] || "•";
    }
    function esGasto(tipo) {
      return tipo === "Gasto" || tipo === "Descuento";
    }
    /** Descuento a empleado (sí baja sueldo). Gasto = egreso del negocio (no baja sueldo). */
    function esDescuentoEmpleado(tipo) {
      return tipo === "Descuento" || tipo === "Penalizacion";
    }
    function esGastoNegocio(tipo) {
      return tipo === "Gasto";
    }
    /** Fila de movimiento = gasto del negocio (varias formas de identificarlo) */
    function esMovimientoGastoNegocio(m) {
      if (!m) return false;
      // Solo por tipo. Gasto e Ingreso usan empleado "Negocio";
      // no se debe clasificar por empleado o aparecerían en ambos apartados.
      return String(m.tipo || "").trim() === "Gasto";
    }

    function esMovimientoIngresoNegocio(m) {
      if (!m) return false;
      return String(m.tipo || "").trim() === "Ingreso";
    }

    function esCuotaPrestamo(tipo) {
      return tipo === "CuotaPrestamo";
    }

    /** Meta de cuota en notas: [cuota:500] */
    function parseCuotaFromNotas(notas) {
      const m = String(notas || "").match(/\[cuota:([0-9]+(?:\.[0-9]+)?)\]/i);
      return m ? Number(m[1]) : 0;
    }

    function stripCuotaMeta(notas) {
      return String(notas || "").replace(/\s*\[cuota:[0-9.]+\]\s*/gi, " ").trim();
    }

    /** ID de préstamo en notas: [pid:123] — vincula CuotaPrestamo a un Prestamo concreto */
    function parsePrestamoIdFromNotas(notas) {
      const m = String(notas || "").match(/\[pid:([^\]]+)\]/i);
      return m ? String(m[1]).trim() : "";
    }

    function stripPrestamoIdMeta(notas) {
      return String(notas || "").replace(/\s*\[pid:[^\]]*\]\s*/gi, " ").trim();
    }

    function notasConPrestamoId(notas, pid) {
      let base = stripPrestamoIdMeta(notas || "");
      if (pid != null && String(pid).trim() !== "") {
        base = (base ? base + " " : "") + "[pid:" + String(pid).trim() + "]";
      }
      return base.trim();
    }

    /** Método de pago en notas: [metodo:Caja|Tarjeta|Transferencia] */
    function parseMetodoFromNotas(notas) {
      const m = String(notas || "").match(/\[metodo:(Caja|Tarjeta|Transferencia)\]/i);
      if (!m) return "";
      const v = m[1];
      if (/^caja$/i.test(v)) return "Caja";
      if (/^tarjeta$/i.test(v)) return "Tarjeta";
      if (/^transferencia$/i.test(v)) return "Transferencia";
      return v;
    }

    function stripMetodoMeta(notas) {
      return String(notas || "").replace(/\s*\[metodo:(Caja|Tarjeta|Transferencia)\]\s*/gi, " ").trim();
    }

    function notasConMetodo(notas, metodo) {
      let base = stripMetodoMeta(notas || "");
      if (metodo) base = (base ? base + " " : "") + "[metodo:" + metodo + "]";
      return base.trim();
    }

    function notasVisibles(notas) {
      return stripMetodoMeta(stripCuotaMeta(stripPrestamoIdMeta(stripGrupoMeta(notas || "")))).trim();
    }

    /** Grupo de empleados en notas: [grupo:Ana|Luis|Pedro] — monto guardado es por persona */
    function parseGrupoFromNotas(notas) {
      const m = String(notas || "").match(/\[grupo:([^\]]+)\]/i);
      if (!m) return [];
      return m[1].split("|").map(s => s.trim()).filter(Boolean);
    }

    function stripGrupoMeta(notas) {
      return String(notas || "").replace(/\s*\[grupo:[^\]]*\]\s*/gi, " ").trim();
    }

    function notasConGrupo(notas, emps) {
      let base = stripGrupoMeta(notas || "");
      const list = (emps || []).map(e => String(e).trim()).filter(Boolean);
      if (list.length > 1) {
        base = (base ? base + " " : "") + "[grupo:" + list.join("|") + "]";
      }
      return base.trim();
    }

    function esMovimientoGrupo(m) {
      return parseGrupoFromNotas(m && m.notas).length > 1;
    }

    function miembrosMovimiento(m) {
      if (!m) return [];
      const g = parseGrupoFromNotas(m.notas);
      if (g.length) return g;
      const emp = String(m.empleado || "").trim();
      if (emp && emp !== "Grupo" && emp.toLowerCase() !== "negocio") return [emp];
      return [];
    }

    function movimientoAplicaAEmpleado(m, empName) {
      if (!m || !empName) return false;
      const g = parseGrupoFromNotas(m.notas);
      if (g.length) return g.includes(empName);
      return String(m.empleado || "") === empName;
    }

    function montoParaEmpleado(m, empName) {
      if (!movimientoAplicaAEmpleado(m, empName)) return 0;
      return Number(m.monto) || 0;
    }

    function etiquetaEmpleadosMov(m) {
      const g = parseGrupoFromNotas(m && m.notas);
      if (g.length > 1) {
        if (g.length <= 3) return "Grupo: " + g.join(", ");
        return "Grupo (" + g.length + "): " + g.slice(0, 2).join(", ") + " +" + (g.length - 2);
      }
      if (g.length === 1) return g[0];
      return (m && m.empleado) || "—";
    }


    let metodoPagoSeleccionado = "";
    function setMetodoPago(m) {
      metodoPagoSeleccionado = m || "";
      ["Caja", "Tarjeta", "Transferencia"].forEach(x => {
        const btn = document.getElementById("metodo-" + x);
        if (!btn) return;
        if (x === metodoPagoSeleccionado) {
          btn.classList.add("modo-active");
          btn.classList.remove("border-gray-600");
        } else {
          btn.classList.remove("modo-active");
          btn.classList.add("border-gray-600");
        }
      });
    }

    function tipoRequiereMetodo(t) {
      return t === "Adelanto" || t === "Gasto" || t === "Ingreso";
    }


    /** Cuántos días se sigue mostrando un préstamo ya liquidado en la pestaña Préstamos */
    const DIAS_GRACIA_PRESTAMO_LIQUIDADO = 7;

    /**
     * Resumen de préstamos: UN registro por cada movimiento tipo Prestamo.
     * Las cuotas con [pid:ID] se imputan a ese préstamo.
     * Las cuotas antiguas sin pid se asignan FIFO (más viejo primero) al mismo empleado.
     */
    function resumenPrestamos() {
      const prestamosMov = [];
      const cuotasMov = [];
      (movimientos || []).forEach(m => {
        const t = String(m.tipo || "").trim();
        const emp = String(m.empleado || "").trim();
        if (!emp || emp === "Negocio" || emp === "Grupo") return;
        if (t === "Prestamo") prestamosMov.push(m);
        else if (t === "CuotaPrestamo") cuotasMov.push(m);
      });

      prestamosMov.sort((a, b) => {
        const fa = String(a.fecha || "").slice(0, 10);
        const fb = String(b.fecha || "").slice(0, 10);
        if (fa !== fb) return fa.localeCompare(fb);
        return String(a.id != null ? a.id : a.row).localeCompare(String(b.id != null ? b.id : b.row));
      });

      const loans = prestamosMov.map(p => {
        const pid = String(p.id != null ? p.id : p.row);
        const c = parseCuotaFromNotas(p.notas);
        return {
          prestamoId: pid,
          empleado: String(p.empleado || "").trim(),
          prestado: Number(p.monto) || 0,
          pagado: 0,
          cuota: c > 0 ? c : 500,
          cuotas: [],
          prestamo: p,
          fecha: String(p.fecha || "").slice(0, 10),
          notas: p.notas || "",
          ultimaFecha: String(p.fecha || "").slice(0, 10)
        };
      });
      const byId = {};
      loans.forEach(l => { byId[l.prestamoId] = l; });

      const unlinked = [];
      cuotasMov.forEach(c => {
        const pid = parsePrestamoIdFromNotas(c.notas);
        const mon = Number(c.monto) || 0;
        if (pid && byId[pid]) {
          byId[pid].pagado += mon;
          byId[pid].cuotas.push(c);
          const f = String(c.fecha || "").slice(0, 10);
          if (f && f > byId[pid].ultimaFecha) byId[pid].ultimaFecha = f;
        } else {
          unlinked.push(c);
        }
      });

      // Cuotas legacy sin [pid]: FIFO por empleado (no mezclan préstamos distintos a futuro)
      unlinked.sort((a, b) => {
        const fa = String(a.fecha || "").slice(0, 10);
        const fb = String(b.fecha || "").slice(0, 10);
        if (fa !== fb) return fa.localeCompare(fb);
        return String(a.id != null ? a.id : "").localeCompare(String(b.id != null ? b.id : ""));
      });
      unlinked.forEach(c => {
        const emp = String(c.empleado || "").trim();
        let restante = Number(c.monto) || 0;
        if (restante <= 0) return;
        const empLoans = loans.filter(l => l.empleado === emp);
        for (const l of empLoans) {
          if (restante <= 0.009) break;
          const saldo = Math.max(0, l.prestado - l.pagado);
          if (saldo <= 0.009) continue;
          const apply = Math.min(saldo, restante);
          l.pagado += apply;
          l.cuotas.push(Object.assign({}, c, { monto: apply, _fifoLegacy: true }));
          restante = Math.round((restante - apply) * 100) / 100;
          const f = String(c.fecha || "").slice(0, 10);
          if (f && f > l.ultimaFecha) l.ultimaFecha = f;
        }
      });

      const hoy = localDateStr(new Date());
      return loans.map(r => {
        const saldo = Math.max(0, Math.round((r.prestado - r.pagado) * 100) / 100);
        const cuota = r.cuota > 0 ? r.cuota : 500;
        const pendientes = cuota > 0 ? Math.ceil(saldo / cuota - 1e-9) : 0;
        const enCurso = saldo > 0.009;
        let diasLiquidado = null;
        if (!enCurso && r.ultimaFecha) {
          const d1 = new Date(r.ultimaFecha + "T12:00:00");
          const d2 = new Date(hoy + "T12:00:00");
          diasLiquidado = Math.round((d2 - d1) / 86400000);
        }
        const liquidadoReciente = !enCurso && diasLiquidado !== null && diasLiquidado <= DIAS_GRACIA_PRESTAMO_LIQUIDADO;
        return Object.assign({}, r, { saldo, cuota, pendientes, enCurso, diasLiquidado, liquidadoReciente });
      }).filter(r => r.enCurso || r.liquidadoReciente || r.prestado > 0);
    }

    /** Suma saldos en curso de todos los préstamos de un empleado */
    function saldoPrestamosEmpleado(empleado) {
      return (resumenPrestamos() || [])
        .filter(r => r.empleado === empleado && r.enCurso)
        .reduce((s, r) => s + (Number(r.saldo) || 0), 0);
    }

    /** ¿Ya hay cuota de ESTE préstamo en la semana? (preciso por id) */
    function cuotaAplicadaEnSemanaPrestamo(prestamoId, semanaStr) {
      const s = (semanaStr || "").slice(0, 10);
      const pid = String(prestamoId || "");
      return (movimientos || []).some(m => {
        if (m.tipo !== "CuotaPrestamo") return false;
        if ((m.semana || "").slice(0, 10) !== s) return false;
        return parsePrestamoIdFromNotas(m.notas) === pid;
      });
    }

    /** Compat: ¿hay alguna cuota del empleado en la semana? (legacy / UI semanal) */
    function cuotaAplicadaEnSemana(empleado, semanaStr) {
      const s = (semanaStr || "").slice(0, 10);
      return (movimientos || []).some(m =>
        m.tipo === "CuotaPrestamo" && m.empleado === empleado && (m.semana || "").slice(0, 10) === s
      );
    }

    function cuotaOmitidaEnSemana(empleado, semanaStr) {
      const s = (semanaStr || "").slice(0, 10);
      return (movimientos || []).some(m =>
        m.tipo === "CuotaOmitida" && m.empleado === empleado && (m.semana || "").slice(0, 10) === s
      );
    }

    /**
     * Desactivado: las cuotas ya no se cobran solas.
     * Usa «Descontar a todos» o «Aplicar solo a este» en la vista Préstamos.
     */
    async function asegurarCuotasAutomaticas() {
      return;
    }

    async function cancelarCobroCuotaSemana(empleado) {
      if (!currentUser || currentUser.rol !== "admin") {
        return showToast("Solo admin", "error");
      }
      const semana = localDateStr(getSemanaSeleccionada());
      if (!await uiConfirm(`¿Cancelar el cobro de la cuota de ${empleado} en la semana que cierra ${formatDateDisplay(semana)}?\n\nNo se descontará del sueldo y la deuda NO bajará esta semana.`)) return;
      try {
        // 1) Borrar cuota ya aplicada esta semana (si existe)
        const cuotas = (movimientos || []).filter(m =>
          m.tipo === "CuotaPrestamo" && m.empleado === empleado && (m.semana || "").slice(0, 10) === semana
        );
        for (const c of cuotas) {
          const id = c.row != null ? c.row : c.id;
          try {
            await logAuditoria("DELETE", {
              id, fecha: c.fecha, tipo: c.tipo, monto: c.monto,
              empleado: c.empleado, notas: c.notas, responsable: c.responsable, semana: c.semana
            });
          } catch (_) {}
          const ids = [Number(id) || id];
          await sb.from("movimientos").delete().in("id", ids);
        }
        // 2) Marcar omisión para que el auto-cobro no la vuelva a crear
        if (!cuotaOmitidaEnSemana(empleado, semana)) {
          const row = {
            fecha: localDateStr(new Date()),
            empleado,
            tipo: "CuotaOmitida",
            monto: 0,
            notas: `Cobro de cuota cancelado semana ${semana}`,
            semana,
            responsable: currentUser.usuario || ""
          };
          const { error } = await sb.from("movimientos").insert([row]);
          if (error) throw error;
        }
        showToast(`Cobro cancelado para ${empleado} esta semana`);
        window.__cuotasAutoDone = null;
        await cargarTodo(true);
        showTab("prestamos");
      } catch (err) {
        console.error(err);
        showToast(err.message || "Error al cancelar cobro", "error");
      }
    }

    async function reactivarCobroCuotaSemana(empleado) {
      if (!currentUser || currentUser.rol !== "admin") return showToast("Solo admin", "error");
      const semana = localDateStr(getSemanaSeleccionada());
      if (!await uiConfirm(`¿Volver a activar el cobro de cuota de ${empleado} esta semana?`)) return;
      try {
        const omits = (movimientos || []).filter(m =>
          m.tipo === "CuotaOmitida" && m.empleado === empleado && (m.semana || "").slice(0, 10) === semana
        );
        for (const o of omits) {
          const id = o.row != null ? o.row : o.id;
          await sb.from("movimientos").delete().in("id", [Number(id) || id]);
        }
        window.__cuotasAutoDone = null;
        showToast("Cobro reactivado: se aplicará la cuota al actualizar");
        await cargarTodo(true);
        showTab("prestamos");
      } catch (err) {
        showToast(err.message || "Error", "error");
      }
    }



    function formatMoney(n) {
      return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n || 0);
    }

    function showToast(msg, type = "ok") {
      const t = document.getElementById("toast");
      if (t._hideTimer) clearTimeout(t._hideTimer);
      t.textContent = msg;
      t.className = "fixed bottom-6 left-1/2 -translate-x-1/2 px-5 py-2.5 rounded-lg text-sm font-medium shadow-xl z-50 toast-show ";
      if (type === "error") t.className += "bg-[#1f1414] text-[#e8a0a0] border border-[#4a2828]";
      else if (type === "info") t.className += "bg-[#141c22] text-[#9ec8dc] border border-[#243840]";
      else t.className += "bg-[#c9a227] text-[#0a0a0a]";
      t.classList.remove("hidden");
      t._hideTimer = setTimeout(() => t.classList.add("hidden"), 2800);
    }

    function setStatus(txt) {
      const el = document.getElementById("status");
      if (el) el.textContent = txt;
    }

    function setButtonLoading(btn, loading, normalText) {
      if (!btn) return;
      if (loading) {
        btn.disabled = true;
        btn.dataset.original = btn.innerHTML;
        btn.innerHTML = `<span class="spinner"></span> Guardando...`;
      } else {
        btn.disabled = false;
        btn.innerHTML = normalText || btn.dataset.original || "Guardar";
      }
    }

    function ensureSupabase() {
      if (!sb) {
        showToast("Supabase no está listo. Recarga la página.", "error");
        return false;
      }
      return true;
    }

