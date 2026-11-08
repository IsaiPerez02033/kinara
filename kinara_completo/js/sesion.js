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

  // Con correo el nombre llega como "nombre"; Google lo manda como "full_name" o "name"
  const nombreDe = (u) => {
    const m = u?.user_metadata || {};
    return String(m.nombre || m.full_name || m.name || '').trim();
  };

  // Foto de la cuenta de Google (solo https, por si acaso)
  const fotoDe = (u, tam = 96) => {
    const m = u?.user_metadata || {};
    const url = String(m.avatar_url || m.picture || '');
    if (!/^https:\/\//.test(url)) return '';
    // Las fotos de Google aceptan el tamaño al final: "=s96-c"
    return url.replace(/=s\d+-c$/, `=s${tam}-c`);
  };

  const pintarFoto = (btn) => {
    const url = fotoDe(usuario);
    let img = btn.querySelector('.cuenta-foto');
    if (!url) {
      img?.remove();
      btn.classList.remove('con-foto');
      return;
    }
    if (!img) {
      img = document.createElement('img');
      img.className = 'cuenta-foto';
      img.alt = '';
      img.width = 30;
      img.height = 30;
      img.decoding = 'async';
      // Google a veces niega la foto si recibe el sitio de origen
      img.referrerPolicy = 'no-referrer';
      img.addEventListener('error', () => { img.remove(); btn.classList.remove('con-foto'); });
      btn.prepend(img);
    }
    if (img.getAttribute('src') !== url) img.src = url;
    btn.classList.add('con-foto');
  };

  // "¡Hola, nombre!" junto a la foto o el ícono de cuenta
  const pintarHola = (btn) => {
    const primerNombre = usuario ? nombreDe(usuario).split(/\s+/)[0] : '';
    let hola = btn.querySelector('.cuenta-hola');
    if (!primerNombre) {
      hola?.remove();
      btn.classList.remove('con-nombre');
      return;
    }
    if (!hola) {
      hola = document.createElement('span');
      hola.className = 'cuenta-hola';
      btn.append(hola);
    }
    hola.textContent = `¡Hola, ${primerNombre}!`;
    btn.classList.add('con-nombre');
  };

  // acceso.js deja la marca al entrar; aquí se saluda una sola vez
  const darBienvenida = () => {
    let marca = null;
    try { marca = sessionStorage.getItem('kinara:bienvenida'); sessionStorage.removeItem('kinara:bienvenida'); } catch (_) {}
    if (!marca || !usuario) return;
    const primerNombre = nombreDe(usuario).split(/\s+/)[0];
    const t = document.getElementById('agregar-toast');
    if (!t) return;
    t.textContent = primerNombre ? `¡Hola, ${primerNombre}!` : '¡Hola!';
    t.style.borderLeftColor = 'var(--color-acento)';
    t.classList.add('visible');
    clearTimeout(t._to);
    t._to = setTimeout(() => t.classList.remove('visible'), 3500);
  };

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
      pintarFoto(btn);
      pintarHola(btn);
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
    darBienvenida();
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
    nombre: () => nombreDe(usuario),
    foto: (tam) => fotoDe(usuario, tam),
    asegurarVinculo,
    cerrarSesion,
    ruta,
  };
})();

window.ModuloSesion = ModuloSesion;
