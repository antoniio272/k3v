    // =====================================================
    // CONFIGURACIÓN
    // =====================================================
    // ESTADO GLOBAL (faltaban estas declaraciones)
    let currentUser = null;
    let empleados = [];
    let movimientos = [];
    let sueldosPagadosDB = []; // [{semana, empleado}]
    let realtimeChannel = null;
    let sueldosPagadosCargados = false;
    let usuarios = [];
    let isLocked = false;
    let inactivityTimer = null;
    let semanaOffset = 0;
    let tipoSeleccionado = "";
    let modoMonto = "individual";
    let editModoMonto = "total"; // en edición de grupales: "individual" | "total"
    let editandoMovId = null;
    let isSaving = false;
    let editandoEmpleado = null;
    let pendingPayload = null;
    // Utilidad anti-XSS
    const esc = (s) => String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
    /** Serializa un valor para pasarlo como argumento JS dentro de un onclick='...' (con comillas simples).
     * Evita que un nombre con apóstrofe (ej. "O'Brien") rompa el atributo HTML. */
    const jsArg = (v) => JSON.stringify(v).replace(/'/g, "\\u0027");
    const escAttr = (s) => String(s ?? '').replace(/["'\\]/g, '\\$&');
    const INACTIVITY_MS = 10 * 60 * 1000;

    // =====================================================
    // SUPABASE
    // =====================================================
    const SUPABASE_URL = "https://fzhijgbbfdzblizbfkmu.supabase.co";
    // Preferible: key "anon" "public" tipo eyJ... en Settings → API
    // También funciona sb_publishable_... en clientes recientes
    const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6aGlqZ2JiZmR6YmxpemJma211Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcyNTk2OTksImV4cCI6MjEwMjgzNTY5OX0.MKHKxseXDTUuqDllNN909tOKr9PMuta_L9ltw1B01FE";

    let sb = null;
    let auditSb = null;
    try {
      const lib = window.supabase;
      if (!lib || !lib.createClient) {
        console.error("No cargó la librería Supabase (CDN).");
        uiAlert("No se pudo cargar Supabase. Revisa tu conexión o desactiva bloqueadores.");
      } else {
        sb = lib.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        // AUDITORIA - Segundo proyecto inmutable
        try {
          auditSb = lib.createClient("https://dzsuhcvltgcipoiyallj.supabase.co", "sb_publishable_hrZS3RQkUd7vzcpIPek35w_vlVrmJWB");
          console.log("🔒 Cliente auditoria conectado a https://dzsuhcvltgcipoiyallj.supabase.co");
        } catch(ae) {
          console.error("Error cliente auditoria", ae);
        }
      }
    } catch (e) {
      console.error(e);
      uiAlert("Error iniciando Supabase: " + (e.message || e));
    }

    // FUNCIONES AUDITORIA
    async function logAuditoria(operacion, movData) {
      try {
        if (!auditSb) { console.warn("auditSb no inicializado"); return { ok: false, error: "no client" }; }
        const payload = {
          operacion: String(operacion || "INSERT"),
          movimiento_id_original: movData.id != null ? Number(movData.id) : null,
          fecha_movimiento: movData.fecha || null,
          tipo: movData.tipo || null,
          monto: movData.monto != null ? Number(movData.monto) : (movData.montoTotal != null ? Number(movData.montoTotal) : null),
          empleado: movData.empleado || (Array.isArray(movData.empleados) ? movData.empleados.join(", ") : null),
          notas: movData.notas || null,
          responsable_original: movData.responsable || null,
          hecho_por: (typeof currentUser !== 'undefined' && currentUser) ? (currentUser.usuario || currentUser.email || "desconocido") : "desconocido",
          datos_original: movData
        };
        // Quitar nulls problemáticos de id si no es número válido
        if (payload.movimiento_id_original != null && !Number.isFinite(payload.movimiento_id_original)) {
          payload.movimiento_id_original = null;
        }
        const { data, error } = await auditSb.from("movimientos_auditoria").insert(payload).select("id");
        if (error) {
          console.error("Auditoria error:", error);
          return { ok: false, error: error.message || String(error) };
        }
        console.log("🔒 Auditoria guardada:", operacion, payload.empleado, data);
        return { ok: true, data };
      } catch (e) {
        console.error("Error logAuditoria", e);
        return { ok: false, error: e.message || String(e) };
      }
    }


    async function logAuditoriaEmpleado(operacion, empData) {
      try {
        if (!auditSb) return;
        const payload = {
          operacion: operacion, // INSERT/UPDATE/DELETE_EMPLEADO
          movimiento_id_original: null,
          tipo: 'EMPLEADO_' + operacion,
          empleado: empData.nombre || empData.nombre_original || 'desconocido',
          monto: empData.sueldo_base || empData.sueldo || 0,
          notas: `Operacion empleado: ${operacion} - ${JSON.stringify(empData).slice(0,200)}`,
          hecho_por: (typeof currentUser !== 'undefined' && currentUser) ? currentUser.usuario : "desconocido",
          datos_original: empData
        };
        const { error } = await auditSb.from("movimientos_auditoria").insert(payload);
        if (error) console.warn("Auditoria empleado fallo:", error.message);
        // Respaldo en tabla empleados_auditoria si existe (no borra nunca)
        try { await auditSb.from("empleados_auditoria").insert({ nombre: empData.nombre, sueldo_base: empData.sueldo_base, operacion, hecho_por: payload.hecho_por, datos: empData }); } catch(e){}
      } catch (e) { console.warn("logAuditoriaEmpleado error", e.message); }
    }

    async function testAuditoria() {
      try {
        if (!auditSb) {
          showToast("Cliente auditoria no inicializado", "error");
          return;
        }
        showToast("Probando conexion auditoria...", "info");
        console.log("Probando auditoria...");
        const payload = {
          operacion: "TEST_CONEXION",
          movimiento_id_original: 999,
          fecha_movimiento: localDateStr(new Date()),
          tipo: "Bono",
          monto: 1,
          empleado: "TEST",
          notas: "Prueba de conexion desde app principal - " + new Date().toLocaleString("es-MX", { timeZone: APP_TZ }),
          responsable_original: "test",
          hecho_por: (typeof currentUser !== 'undefined' && currentUser) ? currentUser.usuario : "admin-test",
          datos_original: { test: true, timestamp: new Date().toISOString() }
        };
        const { data, error } = await auditSb.from("movimientos_auditoria").insert(payload).select();
        if (error) {
          console.error("AUDITORIA ERROR:", error);
          showToast(`❌ Error auditoria: ${error.message}`, "error");
          uiAlert(`Error auditoria: ${error.message}\n\nVerifica que creaste la tabla con el SQL`);
        } else {
          console.log("Auditoria OK:", data);
          showToast("✅ Auditoria CONECTADA! Registro TEST guardado", "success");
          uiAlert("✅ AUDITORIA CONECTADA\n\nSe guardo un registro TEST en el 2do proyecto\nRevisa tu visor de auditoria para verlo");
        }
      } catch (e) {
        console.error("Excepcion testAuditoria", e);
        showToast(`Excepcion: ${e.message}`, "error");
        uiAlert(`Excepcion: ${e.message}`);
      }
    }


