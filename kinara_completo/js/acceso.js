/**
 * acceso.js — Entrar (correo o Google), crear cuenta y recuperar contraseña (pages/acceso.html)
 * Toda la seguridad la pone Supabase Auth: contraseñas cifradas,
 * confirmación de correo y límites de intentos. Aquí solo armo la pantalla.
 */
'use strict';

(() => {
  const auth = SupabaseDB.cliente.auth;
  const $ = (id) => document.getElementById(id);
  const params = new URLSearchParams(location.search);

  /* --- A dónde regresar después de entrar ---
     Solo rutas de este sitio: nada de "//otro.com" ni "javascript:" */
  const destino = (() => {
    const v = params.get('volver') || '';
    if (/^[a-z0-9_\-./#?=&]+$/i.test(v) && !v.startsWith('//') && !v.includes('..')) {
      return v.startsWith('/') ? v : `${location.pathname.replace(/[^/]*$/, '')}${v}`;
    }
    return 'cuenta.html';
  })();

  const urlDe = (archivo) => new URL(archivo, location.href).href;

  const MODOS = {
    entrar: {
      titulo: 'Entra a tu cuenta',
      subtitulo: 'Sigue tus pedidos y compra más rápido con tus datos guardados.',
      boton: 'Entrar',
      campos: ['email', 'password'],
      pestanas: true,
    },
    registro: {
      titulo: 'Crea tu cuenta',
      subtitulo: 'Tus pedidos, direcciones y datos en un solo lugar. Toma un minuto.',
      boton: 'Crear cuenta',
      campos: ['nombre', 'email', 'password', 'aviso'],
      pestanas: true,
    },
    enlace: {
      titulo: 'Entra sin contraseña',
      subtitulo: 'Te mandamos un enlace a tu correo. Ábrelo en este dispositivo y listo.',
      boton: 'Mandar enlace',
      campos: ['email'],
    },
    recuperar: {
      titulo: 'Recupera tu contraseña',
      subtitulo: 'Escribe el correo de tu cuenta y te mandamos un enlace para cambiarla.',
      boton: 'Mandar enlace',
      campos: ['email'],
    },
    nueva: {
      titulo: 'Pon tu contraseña nueva',
      subtitulo: 'La usarás la próxima vez que entres.',
      boton: 'Guardar contraseña',
      campos: ['password'],
    },
  };

  let modo = MODOS[params.get('modo')] ? params.get('modo') : 'entrar';
  // El botón de Google solo aparece si Google está activado en Supabase
  let googleActivo = false;

  /* --- Mensajes --- */
  const mostrarMensaje = (texto, tipo = 'error') => {
    const m = $('acceso-mensaje');
    m.textContent = texto;
    m.dataset.tipo = tipo;
    m.hidden = !texto;
  };

  const traducirError = (error) => {
    const code = error?.code || '';
    const msg = (error?.message || '').toLowerCase();
    if (code === 'invalid_credentials' || msg.includes('invalid login credentials')) {
      return 'Correo o contraseña incorrectos.';
    }
    if (code === 'email_not_confirmed' || msg.includes('email not confirmed')) {
      return 'Todavía no confirmas tu correo. Abre el enlace que te mandamos al registrarte.';
    }
    if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit' || error?.status === 429) {
      return 'Hicimos varios intentos seguidos. Espera unos minutos y vuelve a intentarlo.';
    }
    if (code === 'weak_password' || msg.includes('password')) {
      if (code === 'same_password') return 'La contraseña nueva debe ser distinta a la anterior.';
      return 'Esa contraseña es fácil de adivinar. Usa al menos 8 caracteres, mezclando letras y números.';
    }
    if (code === 'signup_disabled') return 'Por ahora no estamos abriendo cuentas nuevas.';
    if (msg.includes('fetch') || msg.includes('network')) {
      return 'No hay conexión. Revisa tu internet e intenta de nuevo.';
    }
    return 'No se pudo completar. Intenta de nuevo en un momento.';
  };

  /* --- Pintar el modo actual --- */
  const pintar = () => {
    const cfg = MODOS[modo];
    $('acceso-titulo').textContent = cfg.titulo;
    $('acceso-subtitulo').textContent = cfg.subtitulo;
    $('acceso-enviar').textContent = cfg.boton;
    $('acceso-pestanas').hidden = !cfg.pestanas;

    document.querySelectorAll('.acceso-pestana').forEach((b) => {
      const activa = b.dataset.modo === modo;
      b.classList.toggle('activa', activa);
      b.setAttribute('aria-selected', String(activa));
      b.tabIndex = activa ? 0 : -1;
    });

    document.querySelectorAll('[data-campo]').forEach((el) => {
      el.hidden = !cfg.campos.includes(el.dataset.campo);
    });
    document.querySelectorAll('[data-solo]').forEach((el) => {
      el.hidden = !el.dataset.solo.split(' ').includes(modo);
    });
    if (!googleActivo) $('acceso-google').hidden = true;

    const pass = $('ac-password');
    pass.autocomplete = modo === 'entrar' ? 'current-password' : 'new-password';
    $('ac-password-label').textContent = modo === 'nueva' ? 'Contraseña nueva' : 'Contraseña';

    $('acceso-form').hidden = false;
    $('acceso-listo').hidden = true;
    mostrarMensaje('');
  };

  const cambiarModo = (nuevo) => {
    modo = nuevo;
    const url = new URL(location.href);
    url.searchParams.set('modo', nuevo);
    history.replaceState(null, '', url);
    pintar();
    const primero = MODOS[nuevo].campos[0] === 'nombre' ? 'ac-nombre'
      : MODOS[nuevo].campos[0] === 'password' ? 'ac-password' : 'ac-email';
    $(primero).focus();
  };

  const mostrarListo = (titulo, texto) => {
    $('acceso-form').hidden = true;
    $('acceso-pestanas').hidden = true;
    $('acceso-google').hidden = true;
    $('acceso-alternativas').querySelectorAll('button').forEach((b) => { b.hidden = true; });
    $('acceso-titulo').parentElement.querySelectorAll('#acceso-etiqueta, #acceso-titulo, #acceso-subtitulo')
      .forEach((el) => { el.hidden = true; });
    $('listo-titulo').textContent = titulo;
    $('listo-texto').textContent = texto;
    $('acceso-listo').hidden = false;
    $('listo-volver').focus();
  };

  const ocultarListo = () => {
    ['acceso-etiqueta', 'acceso-titulo', 'acceso-subtitulo'].forEach((id) => { $(id).hidden = false; });
    pintar();
  };

  /* --- Validación ligera; la validación real es la de Supabase --- */
  const validar = () => {
    const cfg = MODOS[modo];
    const email = $('ac-email').value.trim();
    const pass = $('ac-password').value;
    const nombre = $('ac-nombre').value.trim();
    let campo = null;
    let texto = '';

    if (cfg.campos.includes('nombre') && nombre.length < 3) {
      campo = 'ac-nombre'; texto = 'Escribe tu nombre completo.';
    } else if (cfg.campos.includes('email') && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      campo = 'ac-email'; texto = 'Escribe un correo válido.';
    } else if (cfg.campos.includes('password') && modo !== 'entrar' && pass.length < 8) {
      campo = 'ac-password'; texto = 'La contraseña necesita al menos 8 caracteres.';
    } else if (cfg.campos.includes('password') && !pass) {
      campo = 'ac-password'; texto = 'Escribe tu contraseña.';
    } else if (cfg.campos.includes('aviso') && !$('ac-aviso').checked) {
      campo = 'ac-aviso'; texto = 'Para crear tu cuenta necesitamos tu autorización para usar tus datos.';
    }

    document.querySelectorAll('.checkout-input').forEach((i) => i.classList.remove('error'));
    if (campo) {
      if (campo !== 'ac-aviso') $(campo).classList.add('error');
      $(campo).focus();
      mostrarMensaje(texto);
      return null;
    }
    return { email, pass, nombre };
  };

  /* --- Enviar --- */
  const enviar = async (e) => {
    e.preventDefault();
    const datos = validar();
    if (!datos) return;

    const boton = $('acceso-enviar');
    boton.disabled = true;
    mostrarMensaje('');

    try {
      if (modo === 'entrar') {
        const { error } = await auth.signInWithPassword({ email: datos.email, password: datos.pass });
        if (error) throw error;
        location.replace(destino);
        return;
      }

      if (modo === 'registro') {
        const { data, error } = await auth.signUp({
          email: datos.email,
          password: datos.pass,
          options: { data: { nombre: datos.nombre }, emailRedirectTo: urlDe(destino) },
        });
        if (error) throw error;
        if (data.session) { location.replace(destino); return; }
        // Supabase no dice si el correo ya existía, para no revelar quién tiene cuenta
        mostrarListo('Confirma tu correo',
          `Te mandamos un enlace a ${datos.email}. Ábrelo para activar tu cuenta. ` +
          'Si ya tenías cuenta con ese correo, mejor entra o recupera tu contraseña.');
        return;
      }

      if (modo === 'enlace') {
        const { error } = await auth.signInWithOtp({
          email: datos.email,
          options: { shouldCreateUser: false, emailRedirectTo: urlDe(destino) },
        });
        // Si el correo no tiene cuenta no lo decimos: misma respuesta para todos
        if (error && error.code !== 'otp_disabled' && !/signups not allowed/i.test(error.message)) throw error;
        mostrarListo('Revisa tu correo',
          `Si ${datos.email} tiene una cuenta Kinara, te llegará un enlace para entrar.`);
        return;
      }

      if (modo === 'recuperar') {
        const { error } = await auth.resetPasswordForEmail(datos.email, {
          redirectTo: urlDe('acceso.html?modo=nueva'),
        });
        if (error) throw error;
        mostrarListo('Revisa tu correo',
          `Si ${datos.email} tiene una cuenta Kinara, te llegará un enlace para cambiar tu contraseña.`);
        return;
      }

      if (modo === 'nueva') {
        const { error } = await auth.updateUser({ password: datos.pass });
        if (error) throw error;
        location.replace('cuenta.html?aviso=contrasena');
      }
    } catch (error) {
      mostrarMensaje(traducirError(error));
      boton.disabled = false;
    } finally {
      if (!$('acceso-form').hidden) boton.disabled = false;
    }
  };

  /* --- Entrar con Google ---
     Google regresa a esta misma página con la sesión en la URL;
     al detectarla, el arranque de abajo manda al cliente a su destino. */
  const entrarConGoogle = async () => {
    const boton = $('acceso-google-btn');
    boton.disabled = true;
    mostrarMensaje('');
    const vuelta = new URL(location.pathname, location.origin);
    if (params.get('volver')) vuelta.searchParams.set('volver', params.get('volver'));
    const { error } = await auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: vuelta.href, queryParams: { prompt: 'select_account' } },
    });
    if (error) {
      mostrarMensaje(traducirError(error));
      boton.disabled = false;
    }
  };

  // Si Google o el cliente cancelan, Supabase regresa con el error en la URL
  const errorDeVuelta = new URLSearchParams(location.hash.slice(1)).get('error_description')
    || params.get('error_description');

  /* --- Eventos --- */
  $('acceso-form').addEventListener('submit', enviar);
  $('acceso-google-btn').addEventListener('click', entrarConGoogle);

  document.querySelectorAll('.acceso-pestana').forEach((b) => {
    b.addEventListener('click', () => cambiarModo(b.dataset.modo));
    b.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const otro = b.dataset.modo === 'entrar' ? 'registro' : 'entrar';
      cambiarModo(otro);
      document.querySelector(`.acceso-pestana[data-modo="${otro}"]`).focus();
    });
  });

  document.querySelectorAll('[data-ir]').forEach((b) => {
    b.addEventListener('click', () => cambiarModo(b.dataset.ir));
  });

  $('ac-ver').addEventListener('click', () => {
    const input = $('ac-password');
    const visible = input.type === 'text';
    input.type = visible ? 'password' : 'text';
    $('ac-ver').textContent = visible ? 'Ver' : 'Ocultar';
    $('ac-ver').setAttribute('aria-pressed', String(!visible));
    $('ac-ver').setAttribute('aria-label', visible ? 'Mostrar contraseña' : 'Ocultar contraseña');
  });

  $('listo-volver').addEventListener('click', ocultarListo);

  // El correo de recuperación abre esta página con una sesión temporal
  auth.onAuthStateChange((evento) => {
    if (evento === 'PASSWORD_RECOVERY' && modo !== 'nueva') cambiarModo('nueva');
  });

  /* --- Inicio --- */
  pintar();
  fetch(`${SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: SUPABASE_ANON } })
    .then((r) => (r.ok ? r.json() : null))
    .then((ajustes) => {
      if (!ajustes?.external?.google) return;
      googleActivo = true;
      if (!$('acceso-form').hidden) {
        const g = $('acceso-google');
        g.hidden = !g.dataset.solo.split(' ').includes(modo);
      }
    })
    .catch(() => {});
  if (errorDeVuelta) {
    mostrarMensaje(/cancel|denied/i.test(errorDeVuelta)
      ? 'Cancelaste la entrada con Google. Puedes intentarlo otra vez o usar tu correo.'
      : 'No pudimos entrar con Google. Intenta de nuevo o usa tu correo.');
  }
  auth.getSession().then(({ data }) => {
    const session = data?.session;
    if (modo === 'nueva') {
      if (!session) {
        mostrarMensaje('El enlace para cambiar tu contraseña ya venció o ya se usó. Pide uno nuevo.');
        $('acceso-enviar').disabled = true;
        setTimeout(() => { $('acceso-enviar').disabled = false; cambiarModo('recuperar'); }, 2500);
      }
      return;
    }
    // Si ya hay sesión no tiene caso mostrar el formulario
    if (session) location.replace(destino);
  });
})();
