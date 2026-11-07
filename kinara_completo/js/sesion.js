/**
 * sesion.js — Sesión de cliente en todo el sitio
 * Lee la sesión guardada de Supabase Auth, cambia el ícono de cuenta
 * del header y avisa a las demás partes con el evento "kinara:sesion".
 * Requiere js/lib/supabase.js antes que este archivo.
 */
'use strict';

const ModuloSesion = (() => {
  const auth = SupabaseDB.cliente.auth;
  const enPages = location.pathname.includes('/pages/');
  const ruta = (archivo) => (enPages ? '' : 'pages/') + archivo;

  let usuario = null;
  let vinculo = null;

  const confirmado = (u) => !!(u && u.email_confirmed_at);

  // Liga la fila de clientes (y sus pedidos de invitado) una vez por carga
  const asegurarVinculo = () => {
    if (!confirmado(usuario)) return Promise.resolve(false);
    if (!vinculo) {
      vinculo = SupabaseDB.cliente.rpc('vincular_mi_cuenta')
        .then(({ error }) => {
          if (error) { console.warn('No se pudo vincular la cuenta:', error.message); vinculo = null; }
          return !error;
        });
    }
    return vinculo;
  };

  const pintarHeader = () => {
    const conSesion = !!usuario;
    const btn = document.getElementById('btn-cuenta');
    if (btn) {
      btn.href = ruta(conSesion ? 'cuenta.html' : 'acceso.html');
      btn.setAttribute('aria-label', conSesion ? 'Mi cuenta' : 'Iniciar sesión');
      btn.classList.toggle('con-sesion', conSesion);
    }
    document.querySelectorAll('[data-enlace-cuenta]').forEach((a) => {
      a.href = ruta(conSesion ? 'cuenta.html' : 'acceso.html');
      a.textContent = conSesion ? 'Mi cuenta' : 'Iniciar sesión';
    });
  };

  const actualizar = (nuevo) => {
    const cambio = (nuevo?.id ?? null) !== (usuario?.id ?? null);
    usuario = nuevo;
    if (cambio) vinculo = null;
    pintarHeader();
    asegurarVinculo();
    document.dispatchEvent(new CustomEvent('kinara:sesion', { detail: usuario }));
  };

  // getSession lee del navegador sin pedir nada a la red
  const listo = auth.getSession().then(({ data }) => {
    actualizar(data?.session?.user ?? null);
    auth.onAuthStateChange((_evento, session) => {
      const nuevo = session?.user ?? null;
      if ((nuevo?.id ?? null) !== (usuario?.id ?? null) ||
          nuevo?.email_confirmed_at !== usuario?.email_confirmed_at) {
        actualizar(nuevo);
      }
    });
    return usuario;
  });

  const cerrarSesion = async () => {
    await auth.signOut();
    usuario = null;
    vinculo = null;
    pintarHeader();
  };

  return {
    listo,
    usuario: () => usuario,
    confirmado: () => confirmado(usuario),
    asegurarVinculo,
    cerrarSesion,
    ruta,
  };
})();

window.ModuloSesion = ModuloSesion;
