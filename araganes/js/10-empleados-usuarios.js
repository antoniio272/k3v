    // =====================================================
    // EMPLEADOS
    // =====================================================
        function renderEmpleados() {
      const cont = document.getElementById("empleados-lista");
      if (!cont) return;
      const totalBadge = document.getElementById("contador-total-empleados");
      if (totalBadge) {
        totalBadge.textContent = `${empleados.length} en total`;
      }
      if (empleados.length === 0) {
        cont.innerHTML = `<p class="text-gray-500 text-center py-8">Sin empleados.</p>`;
        return;
      }
      cont.innerHTML = empleados.map(e => `
        <div class="card rounded-xl p-4 flex items-center justify-between gap-3 fade-up">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-full bg-[rgba(212,175,55,0.12)] text-aragan-yellow flex items-center justify-center font-bold">${(e.empleado||"?").charAt(0)}</div>
            <div>
              <div class="font-medium text-white">${esc(e.empleado)}</div>
              <div class="text-sm text-gray-400">Sueldo base: ${formatMoney(e.sueldoBase)}</div>
            </div>
          </div>
          <div class="flex gap-1">
            <button type="button" onclick='editarEmpleado(${jsArg(e.empleado)}, ${e.sueldoBase})' class="text-aragan-yellow text-sm px-3 py-1.5 rounded-lg hover:bg-aragan-yellow/10 transition">Editar</button>
            <button type="button" onclick='borrarEmpleado(${jsArg(e.empleado)})' class="text-[#e08888] text-sm px-3 py-1.5 rounded-lg hover:bg-[rgba(196,84,84,0.12)] transition">Eliminar</button>
          </div>
        </div>
      `).join("");
    }

    function mostrarFormEmpleado() {
      editandoEmpleado = null;
      document.getElementById("form-empleado-titulo").textContent = "Nuevo empleado";
      document.getElementById("emp-original").value = "";
      document.getElementById("emp-nombre").value = "";
      document.getElementById("emp-sueldo").value = "";
      document.getElementById("form-empleado").classList.remove("hidden");
    }

    function ocultarFormEmpleado() {
      document.getElementById("form-empleado").classList.add("hidden");
    }

    function editarEmpleado(nombre, sueldo) {
      editandoEmpleado = nombre;
      document.getElementById("form-empleado-titulo").textContent = "Editar empleado";
      document.getElementById("emp-original").value = nombre;
      document.getElementById("emp-nombre").value = nombre;
      document.getElementById("emp-sueldo").value = sueldo;
      document.getElementById("form-empleado").classList.remove("hidden");
    }

    /** Al renombrar un empleado, reasigna su historial (movimientos individuales, grupales y sueldos pagados)
     * al nombre nuevo. Sin esto, todo lo registrado antes del cambio queda huérfano (no aparece en desgloses,
     * préstamos, ahorros ni filtros, porque todo se relaciona por el nombre exacto). */
    async function renombrarEmpleadoEnHistorial(nombreAnterior, nombreNuevo) {
      const { error: e1 } = await sb.from("movimientos").update({ empleado: nombreNuevo }).eq("empleado", nombreAnterior);
      if (e1) throw e1;

      const grupales = (movimientos || []).filter(m =>
        parseGrupoFromNotas(m.notas).length > 1 && miembrosMovimiento(m).includes(nombreAnterior)
      );
      for (const m of grupales) {
        const miembrosNuevos = parseGrupoFromNotas(m.notas).map(n => n === nombreAnterior ? nombreNuevo : n);
        const notasNuevas = notasConGrupo(m.notas, miembrosNuevos);
        const id = m.id != null ? m.id : m.row;
        const { error } = await sb.from("movimientos").update({ notas: notasNuevas }).eq("id", id);
        if (error) console.warn("No se pudo reasignar grupo en movimiento", id, error);
      }

      try {
        await sb.from("sueldos_pagados").update({ empleado: nombreNuevo }).eq("empleado", nombreAnterior);
      } catch (e) { console.warn("No se pudo reasignar sueldos_pagados", e); }
    }

    async function guardarEmpleado() {
      if (isSaving) return;
      const nombre = document.getElementById("emp-nombre").value.trim();
      const sueldo = parseFloat(document.getElementById("emp-sueldo").value) || 0;
      const original = document.getElementById("emp-original").value;

      if (!nombre) return showToast("Escribe el nombre", "error");

      const renombrando = !!original && original !== nombre;
      if (empleados.some(e => e.empleado === nombre && e.empleado !== original)) {
        return showToast(`Ya existe un empleado llamado "${nombre}". Usa otro nombre para no mezclar su historial.`, "error");
      }
      if (renombrando && !await uiConfirm(
        `Vas a renombrar "${original}" a "${nombre}".\n\n` +
        `Todo su historial (movimientos, préstamos, ahorros y sueldos pagados) se reasignará automáticamente al nuevo nombre.\n\n¿Continuar?`
      )) return;

      isSaving = true;
      const btn = document.getElementById("btn-guardar-emp");
      setButtonLoading(btn, true, "Guardar");

      try {
        if (original) {
          const { error } = await sb.from("empleados")
            .update({ nombre, sueldo_base: sueldo })
            .eq("nombre", original);
          if (error) throw error;
          if (renombrando) {
            await renombrarEmpleadoEnHistorial(original, nombre);
          }
          await logAuditoriaEmpleado('UPDATE', { nombre_original: original, nombre: nombre, sueldo_base: sueldo });
          showToast(renombrando ? "Empleado renombrado: historial actualizado" : "Empleado actualizado");
        } else {
          const { error } = await sb.from("empleados")
            .insert({ nombre, sueldo_base: sueldo });
          if (error) throw error;
          await logAuditoriaEmpleado('INSERT', { nombre, sueldo_base: sueldo });
          showToast("Empleado agregado");
        }
        ocultarFormEmpleado();
        await cargarTodo();
      } catch (err) {
        console.error(err);
        showToast(err.message || "Error al guardar empleado", "error");
      } finally {
        isSaving = false;
        setButtonLoading(btn, false, "Guardar");
      }
    }

    async function borrarEmpleado(nombre) {
      if (!await uiConfirm(`¿Eliminar a ${nombre}?`)) return;
      try {
        const found = empleados.find(e=>e.empleado===nombre);
        const empRespaldo = found ? { nombre: found.empleado, sueldo_base: found.sueldoBase } : { nombre };
        const { error } = await sb.from("empleados").delete().eq("nombre", nombre);
        if (error) throw error;
        await logAuditoriaEmpleado('DELETE', { ...empRespaldo, _borrado_en: new Date().toISOString() });
        showToast("Empleado eliminado (respaldado en auditoría)");
        await cargarTodo();
      } catch (err) {
        showToast("Error de conexión", "error");
      }
    }

    // =====================================================
    // USUARIOS
    // =====================================================
    async function cargarUsuarios() {
      try {
        const { data, error } = await sb.from("profiles").select("id, usuario, rol");
        if (error) throw error;
        usuarios = (data || []).map(u => ({
          usuario: u.usuario,
          rol: u.rol,
          row: u.id
        }));
        renderUsuarios();
      } catch (err) {
        console.error(err);
        showToast(err.message || "No se pudieron cargar usuarios", "error");
      }
    }

    function renderUsuarios() {
      const cont = document.getElementById("usuarios-lista");
      if (!cont) return;
      if (usuarios.length === 0) {
        cont.innerHTML = `<p class="text-gray-500 text-center py-8">No hay usuarios.</p>`;
        return;
      }
      cont.innerHTML = usuarios.map(u => `
        <div class="card rounded-xl p-4 flex items-center justify-between gap-3">
          <div>
            <div class="font-medium text-white">${esc(u.usuario)}</div>
            <div class="text-sm text-gray-400">Rol: ${esc(u.rol)}</div>
          </div>
          ${u.usuario.toLowerCase() !== "admin" ? `
            <button type="button" onclick="borrarUsuario('${escAttr(u.usuario)}')" class="text-[#e08888] text-sm px-2 py-1">Eliminar</button>
          ` : `<span class="text-xs text-gray-500">Principal</span>`}
        </div>
      `).join("");
    }

    function mostrarFormUsuario() {
      document.getElementById("usr-nombre").value = "";
      document.getElementById("usr-password").value = "";
      document.getElementById("usr-rol").value = "empleado";
      document.getElementById("form-usuario").classList.remove("hidden");
    }

    function ocultarFormUsuario() {
      document.getElementById("form-usuario").classList.add("hidden");
    }

    async function guardarUsuario() {
      if (isSaving) return;
      const usuario = document.getElementById("usr-nombre").value.trim();
      const password = document.getElementById("usr-password").value;
      const rolUsuario = document.getElementById("usr-rol").value;

      if (!usuario || !password) return showToast("Usuario y contraseña obligatorios", "error");

      isSaving = true;
      const btn = document.getElementById("btn-guardar-usr");
      setButtonLoading(btn, true, "Guardar");

      try {
        showToast("Por seguridad, crea usuarios en Supabase → Authentication → Users, luego agrega su fila en profiles (rol admin/empleado).", "error");
        // No se pueden crear usuarios Auth desde el navegador sin service_role.
      } catch (err) {
        showToast("Error de conexión", "error");
      } finally {
        isSaving = false;
        setButtonLoading(btn, false, "Guardar");
      }
    }

    async function borrarUsuario(usuario) {
      if (!await uiConfirm(`¿Eliminar usuario ${usuario}?`)) return;
      try {
        const { error } = await sb.from("profiles").delete().eq("usuario", usuario);
        if (error) throw error;
        showToast("Perfil eliminado (borra también el user en Authentication si ya no lo usas)");
        await cargarUsuarios();
      } catch (err) {
        showToast("Error de conexión", "error");
      }
    }

