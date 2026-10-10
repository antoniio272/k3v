    // =====================================================
    // INIT
    // =====================================================
    document.addEventListener("DOMContentLoaded", async () => {
      document.getElementById("lock-overlay").classList.add("hidden");
      try {
        const { data: { session } } = await sb.auth.getSession();
        if (session && session.user) {
          const last = Number(localStorage.getItem(ACTIVITY_KEY) || 0);
          if (last && Date.now() - last > INACTIVITY_MS) {
            await sb.auth.signOut();
            localStorage.removeItem(USER_KEY);
            localStorage.removeItem(ACTIVITY_KEY);
          } else {
            const profile = await cargarPerfil(session.user.id);
            if (profile) {
              currentUser = {
                id: session.user.id,
                email: session.user.email,
                usuario: profile.usuario || session.user.email,
                rol: (profile.rol || "empleado").toLowerCase()
              };
              // No guardar rol en localStorage (autorización siempre desde DB/sesión)
              localStorage.setItem(USER_KEY, JSON.stringify({
                id: currentUser.id,
                email: currentUser.email,
                usuario: currentUser.usuario
              }));
              iniciarApp();
              return;
            }
          }
        }
      } catch (e) {
        console.error(e);
      }

      document.getElementById("login-screen").classList.remove("hidden");
      document.getElementById("app-screen").classList.add("hidden");
    });
