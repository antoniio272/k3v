    // =====================================================
    // CAPA PREMIUM · comportamiento de interfaz
    // Solo envuelve funciones existentes (showTab, showToast, iniciarApp…);
    // la lógica de negocio queda intacta.
    // =====================================================
    (function () {
      const DEMO = !!window.__demoBackend; // true solo en demo.html (datos locales)
      const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const TAB_ORDER = ["dashboard", "nuevo", "historial", "individual", "ahorros", "ahorroespecial", "gastosnegocio", "ingresosnegocio", "prestamos", "empleados", "usuarios"];
      const $ = (id) => document.getElementById(id);
      const wait = (ms) => new Promise(r => setTimeout(r, ms));

      // ---------- Diálogos propios (reemplazan confirm / prompt / alert) ----------
      let dlg = null;
      function ensureDialog() {
        if (dlg) return dlg;
        dlg = document.createElement("div");
        dlg.id = "ui-dialog";
        dlg.className = "hidden";
        dlg.setAttribute("role", "dialog");
        dlg.setAttribute("aria-modal", "true");
        dlg.innerHTML = `
          <div class="ui-dialog-card">
            <div class="flex items-start gap-3">
              <div class="ui-dialog-icon" id="ui-dialog-icon"></div>
              <div class="min-w-0 flex-1 pt-0.5">
                <div class="ui-dialog-title" id="ui-dialog-title"></div>
                <div class="ui-dialog-msg mt-1.5" id="ui-dialog-msg"></div>
              </div>
            </div>
            <div id="ui-dialog-field"></div>
            <div class="ui-dialog-actions" id="ui-dialog-actions"></div>
          </div>`;
        document.body.appendChild(dlg);
        dlg.addEventListener("click", (e) => { if (e.target === dlg && dlg._cancel) dlg._cancel(); });
        return dlg;
      }
      const ICONS = {
        ask: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14"/><path d="M12 17h.01"/></svg>',
        danger: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M6 6l1 14h10l1-14"/></svg>',
        info: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/></svg>',
        copy: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>'
      };
      function splitMsg(msg) {
        const txt = String(msg ?? "").trim();
        const lines = txt.split("\n");
        const first = lines.shift() || "";
        return { title: first, body: lines.join("\n").replace(/^\n+/, "") };
      }
      let dialogChain = Promise.resolve();
      function openDialog(kind, msg, def) {
        const run = () => new Promise((resolve) => {
          const d = ensureDialog();
          const { title, body } = splitMsg(msg);
          const danger = kind === "confirm" && /eliminar|borrar|cancelar el cobro|no se puede deshacer/i.test(String(msg));
          const isCopy = kind === "prompt" && (String(def ?? "").length > 60 || String(def ?? "").includes("\n"));
          const icon = $("ui-dialog-icon");
          icon.className = "ui-dialog-icon" + (danger ? " danger" : "");
          icon.innerHTML = danger ? ICONS.danger : (kind === "alert" ? ICONS.info : (isCopy ? ICONS.copy : ICONS.ask));
          $("ui-dialog-title").textContent = title;
          const msgEl = $("ui-dialog-msg");
          msgEl.textContent = body;
          msgEl.style.display = body ? "" : "none";
          const field = $("ui-dialog-field");
          field.innerHTML = "";
          let input = null;
          if (kind === "prompt") {
            input = document.createElement(isCopy ? "textarea" : "input");
            input.className = "ui-dialog-input rounded-lg";
            input.id = "ui-dialog-input";
            if (!isCopy) input.type = "text";
            input.value = def ?? "";
            if (isCopy) input.readOnly = true;
            field.appendChild(input);
          }
          const actions = $("ui-dialog-actions");
          actions.innerHTML = "";
          const mk = (label, cls) => { const b = document.createElement("button"); b.type = "button"; b.className = cls; b.textContent = label; actions.appendChild(b); return b; };
          let cancelBtn = null;
          if (kind !== "alert") cancelBtn = mk(isCopy ? "Cerrar" : "Cancelar", "btn-ghost");
          const okBtn = mk(kind === "alert" ? "Entendido" : (isCopy ? "Copiar" : (danger ? "Sí, continuar" : "Aceptar")), danger ? "btn-danger" : "btn-yellow");

          const prevFocus = document.activeElement;
          const finish = (val) => {
            document.removeEventListener("keydown", onKey, true);
            d._cancel = null;
            ghostOut(d);
            d.classList.add("hidden");
            try { prevFocus && prevFocus.focus && prevFocus.focus({ preventScroll: true }); } catch (_) {}
            resolve(val);
          };
          const ok = async () => {
            if (kind === "confirm") return finish(true);
            if (kind === "alert") return finish(undefined);
            if (isCopy) {
              try { await navigator.clipboard.writeText(input.value); okBtn.textContent = "¡Copiado!"; await wait(450); }
              catch (_) { input.focus(); input.select(); okBtn.textContent = "Selecciona y copia"; return; }
            }
            finish(input.value);
          };
          const cancel = () => finish(kind === "confirm" ? false : (kind === "alert" ? undefined : null));
          d._cancel = cancel;
          okBtn.onclick = ok;
          if (cancelBtn) cancelBtn.onclick = cancel;
          const onKey = (e) => {
            if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); cancel(); }
            else if (e.key === "Enter" && !(input && input.tagName === "TEXTAREA")) { e.preventDefault(); e.stopPropagation(); ok(); }
          };
          document.addEventListener("keydown", onKey, true);
          d.classList.remove("hidden");
          setTimeout(() => {
            if (input) { input.focus(); input.select(); } else okBtn.focus();
          }, 60);
        });
        const p = dialogChain.then(run, run);
        dialogChain = p.catch(() => {});
        return p;
      }
      window.uiConfirm = (msg) => openDialog("confirm", msg);
      window.uiPrompt = (msg, def) => openDialog("prompt", msg, def);
      window.uiAlert = (msg) => openDialog("alert", msg);

      // ---------- Salida animada de modales (copia "fantasma" que se desvanece) ----------
      function ghostOut(overlay) {
        if (reduceMotion || !overlay || overlay.classList.contains("hidden")) return;
        const g = overlay.cloneNode(true);
        const srcFields = overlay.querySelectorAll("input, textarea, select");
        const dstFields = g.querySelectorAll("input, textarea, select");
        srcFields.forEach((f, i) => { try { dstFields[i].value = f.value; } catch (_) {} });
        g.removeAttribute("id");
        g.querySelectorAll("[id]").forEach(n => n.removeAttribute("id"));
        g.removeAttribute("onclick");
        g.classList.remove("hidden");
        g.classList.add("modal-ghost");
        g.style.background = "rgba(3,3,4,0.62)";
        g.style.backdropFilter = "blur(14px)";
        g.style.webkitBackdropFilter = "blur(14px)";
        g.setAttribute("aria-hidden", "true");
        document.body.appendChild(g);
        setTimeout(() => g.remove(), 300);
      }
      const OVERLAYS = ["confirm-overlay", "edit-mov-overlay", "sueldo-modal-overlay", "mov-detail-overlay", "lock-overlay"];
      function watchOverlays() {
        OVERLAYS.forEach(id => {
          const el = $(id);
          if (!el) return;
          let wasHidden = el.classList.contains("hidden");
          let lastSnapshot = null;
          // Guardamos una copia mientras está visible para poder animar su salida
          const snap = () => { if (!el.classList.contains("hidden")) lastSnapshot = el.cloneNode(true); };
          new MutationObserver(() => {
            const nowHidden = el.classList.contains("hidden");
            if (!wasHidden && nowHidden && lastSnapshot && !reduceMotion) {
              const holder = lastSnapshot;
              holder.classList.remove("hidden");
              const srcFields = el.querySelectorAll("input, textarea, select");
              const dstFields = holder.querySelectorAll("input, textarea, select");
              srcFields.forEach((f, i) => { try { dstFields[i].value = f.value; } catch (_) {} });
              holder.removeAttribute("id");
              holder.querySelectorAll("[id]").forEach(n => n.removeAttribute("id"));
              holder.removeAttribute("onclick");
              holder.classList.add("modal-ghost");
              holder.style.background = "rgba(3,3,4,0.62)";
              holder.style.backdropFilter = "blur(14px)";
              holder.style.webkitBackdropFilter = "blur(14px)";
              holder.setAttribute("aria-hidden", "true");
              document.body.appendChild(holder);
              setTimeout(() => holder.remove(), 300);
            }
            wasHidden = nowHidden;
            snap();
          }).observe(el, { attributes: true, attributeFilter: ["class"], childList: true, subtree: true, characterData: true });
        });
      }

      // ---------- Toast ----------
      const toastIcons = { ok: "✓", error: "!", info: "i" };
      window.showToast = function (msg, type = "ok") {
        const t = $("toast");
        if (!t) return;
        if (t._hideTimer) clearTimeout(t._hideTimer);
        if (t._outTimer) clearTimeout(t._outTimer);
        const kind = type === "error" ? "error" : (type === "info" ? "info" : "ok");
        const dur = Math.min(6500, Math.max(2800, String(msg).length * 45));
        t.className = "t-" + kind;
        t.setAttribute("role", kind === "error" ? "alert" : "status");
        t.innerHTML = `<span class="t-icon">${toastIcons[kind]}</span><span class="t-msg"></span><span class="t-bar" style="animation-duration:${dur}ms"></span>`;
        t.querySelector(".t-msg").textContent = msg;
        void t.offsetWidth;
        t.classList.add("toast-in");
        t._hideTimer = setTimeout(() => {
          t.classList.remove("toast-in");
          t.classList.add("toast-out");
          t._outTimer = setTimeout(() => t.classList.add("hidden"), 300);
        }, dur);
      };

      // ---------- Animación escalonada ("armar" la vista) ----------
      let armTimer = null;
      function arm(ms = 1200) {
        if (reduceMotion) return;
        document.body.classList.add("anim-armed");
        clearTimeout(armTimer);
        armTimer = setTimeout(() => document.body.classList.remove("anim-armed"), ms);
      }

      // ---------- Números que cuentan ----------
      const lastValues = new Map();
      const moneyRe = /^-?\$[\d,]+(\.\d+)?$/;
      function parseMoney(s) { return Number(String(s).replace(/[$,\s]/g, "")) || 0; }
      function countUp(root) {
        const nodes = (root || document).querySelectorAll(".summary-pill > div:last-child, .summary-pill .value, #dashboard-cards .font-bold.text-xl");
        const groups = new Map();
        nodes.forEach(el => {
          const txt = (el.textContent || "").trim();
          if (!moneyRe.test(txt)) return;
          const host = el.closest("[id]");
          const hid = host ? host.id : "doc";
          const idx = (groups.get(hid) || 0);
          groups.set(hid, idx + 1);
          const key = hid + ":" + idx;
          const to = parseMoney(txt);
          const from = lastValues.has(key) ? lastValues.get(key) : 0;
          lastValues.set(key, to);
          if (reduceMotion || from === to || el.offsetParent === null) return;
          const t0 = performance.now();
          const dur = 900;
          const step = (now) => {
            const k = Math.min(1, (now - t0) / dur);
            const e = 1 - Math.pow(2, -10 * k);
            const v = from + (to - from) * (k >= 1 ? 1 : e);
            el.textContent = formatMoney(Math.round(v * 100) / 100);
            if (k < 1 && el.isConnected) requestAnimationFrame(step);
            else el.textContent = txt;
          };
          requestAnimationFrame(step);
        });
      }

      // ---------- Indicador deslizante de pestañas ----------
      let ink = null;
      function moveInk(name, instant) {
        const row = document.querySelector("nav.top-nav-desktop > div");
        if (!row) return;
        if (!ink) {
          ink = document.createElement("span");
          ink.className = "tab-ink";
          row.prepend(ink);
          row.parentElement.classList.add("has-ink");
        }
        const tab = $("tab-" + name);
        if (!tab || tab.offsetParent === null) { ink.style.opacity = "0"; return; }
        if (instant) ink.style.transition = "none";
        ink.style.width = tab.offsetWidth + "px";
        ink.style.transform = `translateX(${tab.offsetLeft}px)`;
        ink.style.opacity = "1";
        if (instant) { void ink.offsetWidth; ink.style.transition = ""; }
        const target = tab.offsetLeft - (row.clientWidth - tab.offsetWidth) / 2;
        try { row.scrollTo({ left: Math.max(0, target), behavior: reduceMotion ? "auto" : "smooth" }); } catch (_) { row.scrollLeft = target; }
      }

      // ---------- Envolturas de navegación ----------
      let currentTab = null;
      const _showTab = window.showTab;
      window.showTab = function (name) {
        const prev = currentTab;
        const r = _showTab.apply(this, arguments);
        // showTab puede redirigir (empleado → "nuevo"); leemos la vista realmente visible
        const visible = TAB_ORDER.find(t => { const v = $("view-" + t); return v && !v.classList.contains("hidden"); }) || name;
        currentTab = visible;
        moveInk(visible, prev === null);
        if (prev !== visible) {
          const view = $("view-" + visible);
          if (view && !reduceMotion) {
            view.classList.remove("view-enter", "from-left");
            void view.offsetWidth;
            if (prev && TAB_ORDER.indexOf(visible) < TAB_ORDER.indexOf(prev)) view.classList.add("from-left");
            view.classList.add("view-enter");
          }
          arm();
          countUp(view);
          const header = document.querySelector("header");
          const limit = header ? header.offsetHeight : 0;
          if (window.scrollY > limit + 40) window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
        }
        return r;
      };

      const _aplicar = window.aplicarDatosEnPantalla;
      let firstPaint = true;
      window.aplicarDatosEnPantalla = function () {
        if (firstPaint) { arm(1400); firstPaint = false; }
        const r = _aplicar.apply(this, arguments);
        countUp(document);
        return r;
      };
      const _renderDashboard = window.renderDashboard;
      window.renderDashboard = function () {
        const r = _renderDashboard.apply(this, arguments);
        countUp($("view-dashboard"));
        return r;
      };
      ["renderGastosNegocio", "renderIngresosNegocio", "renderAhorros", "renderAhorroEspecial", "renderPrestamos"].forEach(fn => {
        const orig = window[fn];
        if (typeof orig !== "function") return;
        window[fn] = function () { const r = orig.apply(this, arguments); countUp(document); return r; };
      });
      function swapWeek(dir) {
        const wr = document.querySelector(".week-picker .week-range");
        if (!wr || reduceMotion) return;
        wr.classList.remove("swap-next", "swap-prev");
        void wr.offsetWidth;
        wr.classList.add(dir < 0 ? "swap-prev" : "swap-next");
      }
      const _cambiarSemana = window.cambiarSemana;
      window.cambiarSemana = function (delta) { arm(); const r = _cambiarSemana.apply(this, arguments); swapWeek(delta); return r; };
      const _irSemanaActual = window.irSemanaActual;
      window.irSemanaActual = function () { const before = semanaOffset; arm(); const r = _irSemanaActual.apply(this, arguments); swapWeek(before > 0 ? -1 : 1); return r; };

      // Entrada a la app: el login se desvanece y la app aparece
      const _iniciarApp = window.iniciarApp;
      window.iniciarApp = async function () {
        const login = $("login-screen");
        const visible = login && !login.classList.contains("hidden");
        if (visible && !reduceMotion) {
          document.body.classList.add("leaving-login");
          await wait(430);
        }
        document.body.classList.remove("leaving-login");
        currentTab = null;
        document.body.classList.add("app-entering");
        setTimeout(() => document.body.classList.remove("app-entering"), 1100);
        arm(1500);
        return _iniciarApp.apply(this, arguments);
      };
      const _cerrarSesion = window.cerrarSesion;
      window.cerrarSesion = function () { const r = _cerrarSesion.apply(this, arguments); currentTab = null; fillLogin(); return r; };

      // ---------- Menú lateral: gesto para cerrar ----------
      function drawerGestures() {
        const d = $("app-drawer");
        if (!d) return;
        let x0 = null, y0 = 0, dx = 0, horizontal = null;
        d.addEventListener("touchstart", (e) => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; dx = 0; horizontal = null; }, { passive: true });
        d.addEventListener("touchmove", (e) => {
          if (x0 === null) return;
          const mx = e.touches[0].clientX - x0, my = e.touches[0].clientY - y0;
          if (horizontal === null && (Math.abs(mx) > 8 || Math.abs(my) > 8)) horizontal = Math.abs(mx) > Math.abs(my);
          if (!horizontal) return;
          dx = Math.min(0, mx);
          d.classList.add("is-dragging");
          d.style.transform = `translateX(${dx}px)`;
        }, { passive: true });
        d.addEventListener("touchend", () => {
          d.classList.remove("is-dragging");
          d.style.transform = "";
          if (horizontal && dx < -70) cerrarDrawer();
          x0 = null;
        });
      }

      // ---------- Teclado ----------
      document.addEventListener("keydown", (e) => {
        if (e.key !== "Escape" || (dlg && !dlg.classList.contains("hidden"))) return;
        const d = $("app-drawer");
        if (d && d.classList.contains("open")) return cerrarDrawer();
        const open = (id) => { const el = $(id); return el && !el.classList.contains("hidden"); };
        if (open("edit-mov-overlay")) return cerrarEditarMovimiento();
        if (open("mov-detail-overlay")) return cerrarDetalleMovimiento();
        if (open("sueldo-modal-overlay")) return cerrarSueldoModal();
        if (open("confirm-overlay")) return cerrarConfirmacion();
      });

      // ---------- Onda al tocar ----------
      const RIPPLE_SEL = ".btn-yellow,.btn-outline,.btn-ghost,.btn-danger,.btn-unlock,.tipo-btn,.modo-btn,.chip-monto,.week-nav-btn,.drawer-item,.menu-btn-trigger,.role-switch button";
      document.addEventListener("pointerdown", (e) => {
        if (reduceMotion) return;
        const el = e.target.closest(RIPPLE_SEL);
        if (!el || el.disabled) return;
        const r = el.getBoundingClientRect();
        el.style.setProperty("--rx", (e.clientX - r.left) + "px");
        el.style.setProperty("--ry", (e.clientY - r.top) + "px");
        el.style.setProperty("--rs", String(Math.ceil(Math.hypot(r.width, r.height) / 4) + 2));
        el.dataset.rp = el.dataset.rp === "a" ? "b" : "a";
      }, { passive: true });

      // ---------- Luz que sigue al cursor en tarjetas ----------
      let spotRaf = 0, spotEv = null;
      document.addEventListener("pointermove", (e) => {
        if (e.pointerType !== "mouse") return;
        spotEv = e;
        if (spotRaf) return;
        spotRaf = requestAnimationFrame(() => {
          spotRaf = 0;
          const c = spotEv.target.closest && spotEv.target.closest(".card");
          if (!c) return;
          const r = c.getBoundingClientRect();
          c.style.setProperty("--mx", (spotEv.clientX - r.left) + "px");
          c.style.setProperty("--my", (spotEv.clientY - r.top) + "px");
        });
      }, { passive: true });

      // ---------- Scroll: cabecera, barra de progreso, volver arriba ----------
      let scrollRaf = 0;
      function onScroll() {
        if (scrollRaf) return;
        scrollRaf = requestAnimationFrame(() => {
          scrollRaf = 0;
          const y = window.scrollY;
          const h = document.documentElement.scrollHeight - window.innerHeight;
          const header = document.querySelector("header");
          if (header) header.classList.toggle("is-scrolled", y > 8);
          const bar = $("scroll-progress");
          if (bar) bar.style.transform = `scaleX(${h > 0 ? Math.min(1, y / h) : 0})`;
          const top = $("to-top");
          if (top) top.classList.toggle("show", y > 600);
        });
      }
      window.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("resize", () => { if (currentTab) moveInk(currentTab, true); });

      // ---------- Login demo ----------
      window.__demoRole = "admin";
      function fillLogin() {
        if (!DEMO) return;
        const u = $("login-usuario"), p = $("login-password");
        if (u) u.value = window.__demoRole === "empleado" ? "empleado@demo.com" : "admin@demo.com";
        if (p) p.value = "demo1234";
      }
      window.setDemoRole = function (role) {
        window.__demoRole = role === "empleado" ? "empleado" : "admin";
        const sw = $("role-switch");
        if (sw) {
          sw.dataset.role = window.__demoRole;
          sw.querySelectorAll("button").forEach(b => b.classList.toggle("on", b.dataset.role === window.__demoRole));
        }
        fillLogin();
      };
      window.resetDemoData = async function () {
        const ok = await uiConfirm("¿Restablecer los datos de ejemplo?\nSe borran los cambios que hiciste en esta prueba y se cargan de nuevo los empleados y movimientos de ejemplo. No afecta la base real.");
        if (!ok) return;
        if (window.__demoBackend) window.__demoBackend.reset();
        lastValues.clear();
        if (typeof cerrarDrawer === "function") cerrarDrawer();
        if (currentUser) { arm(1500); await cargarTodo(true, false); }
        else showToast("Datos de ejemplo restablecidos");
      };

      // Estado de conexión: en el demo no hay servidor, lo decimos claro
      const _setStatus = window.setStatus;
      if (DEMO) window.setStatus = function (txt) {
        return _setStatus.call(this, String(txt ?? "").replace("Conectado · tiempo real", "Demo · datos locales").replace(" · sync ON", " · demo"));
      };

      // ---------- Arranque ----------
      document.addEventListener("DOMContentLoaded", () => {
        watchOverlays();
        drawerGestures();
        fillLogin();
        const t = $("toast");
        if (t) { t.className = "hidden"; }
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (currentTab) moveInk(currentTab, true); });
        const dl = $("drawer-logo"); const hl = document.querySelector("header .logo-img");
        if (dl && hl) dl.src = hl.src;
        const splash = $("splash");
        if (splash) setTimeout(() => { splash.classList.add("gone"); setTimeout(() => splash.remove(), 700); }, reduceMotion ? 0 : 900);
        onScroll();
      });
    })();
