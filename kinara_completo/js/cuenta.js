/**
 * cuenta.js — Mi cuenta (pages/cuenta.html)
 * Pedidos, direcciones guardadas y datos de contacto.
 * Todo lo que se lee o escribe pasa por RLS o por funciones
 * que solo regresan los datos de la cuenta con sesión.
 */
'use strict';

(() => {
  const db = SupabaseDB.cliente;
  const $ = (id) => document.getElementById(id);

  const ESTADOS_MX = ['Aguascalientes', 'Baja California', 'Baja California Sur', 'Campeche', 'Chiapas',
    'Chihuahua', 'Ciudad de México', 'Coahuila', 'Colima', 'Durango', 'Estado de México', 'Guanajuato',
    'Guerrero', 'Hidalgo', 'Jalisco', 'Michoacán', 'Morelos', 'Nayarit', 'Nuevo León', 'Oaxaca', 'Puebla',
    'Querétaro', 'Quintana Roo', 'San Luis Potosí', 'Sinaloa', 'Sonora', 'Tabasco', 'Tamaulipas',
    'Tlaxcala', 'Veracruz', 'Yucatán', 'Zacatecas'];

  // Orden del recorrido de un pedido pagado
  const PASOS = [
    { estado: 'pagado',        texto: 'Pagado' },
    { estado: 'en_produccion', texto: 'En producción' },
    { estado: 'enviado',       texto: 'Enviado' },
    { estado: 'entregado',     texto: 'Entregado' },
  ];

  const ETIQUETAS = {
    pendiente: 'Pago pendiente',
    pagado: 'Pagado',
    en_produccion: 'En producción',
    enviado: 'Enviado',
    entregado: 'Entregado',
    cancelado: 'Cancelado',
  };

  const fmtPrecio = (n) => Number(n).toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  const fmtFecha = (f) => new Date(f).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });

  const toast = (msg, tipo = 'exito') => {
    const t = $('agregar-toast');
    if (!t) return;
    t.textContent = msg;
    t.style.borderLeftColor = tipo === 'error' ? 'var(--color-error)' : 'var(--color-acento)';
    t.classList.add('visible');
    clearTimeout(t._to);
    t._to = setTimeout(() => t.classList.remove('visible'), 3000);
  };

  const mensaje = (id, texto, tipo = 'error') => {
    const el = $(id);
    el.textContent = texto;
    el.dataset.tipo = tipo;
    el.hidden = !texto;
  };

  /* =====================================================
     PESTAÑAS
     ===================================================== */
  const pestanas = [...document.querySelectorAll('.cuenta-pestana')];

  const abrirPanel = (nombre, enfocar = false) => {
    pestanas.forEach((b) => {
      const activa = b.dataset.panel === nombre;
      b.classList.toggle('activa', activa);
      b.setAttribute('aria-selected', String(activa));
      b.tabIndex = activa ? 0 : -1;
      $(`panel-${b.dataset.panel}`).hidden = !activa;
      if (activa && enfocar) b.focus();
    });
    history.replaceState(null, '', `#${nombre}`);
  };

  pestanas.forEach((b, i) => {
    b.addEventListener('click', () => abrirPanel(b.dataset.panel));
    b.addEventListener('keydown', (e) => {
      const paso = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!paso) return;
      const sig = pestanas[(i + paso + pestanas.length) % pestanas.length];
      abrirPanel(sig.dataset.panel, true);
    });
  });

  /* =====================================================
     PEDIDOS
     ===================================================== */
  let pedidos = [];

  const pintarRecorrido = (estado) => {
    const idx = PASOS.findIndex((p) => p.estado === estado);
    if (idx < 0) return '';
    return `
      <ol class="pedido-recorrido" aria-label="Avance del pedido: ${ETIQUETAS[estado]}">
        ${PASOS.map((p, i) => `
          <li class="${i < idx ? 'hecho' : i === idx ? 'actual' : ''}" ${i === idx ? 'aria-current="step"' : ''}>
            <span class="pedido-recorrido-punto" aria-hidden="true"></span>
            <span class="pedido-recorrido-texto">${p.texto}</span>
          </li>`).join('')}
      </ol>`;
  };

  const pintarPedidos = () => {
    const c = $('lista-pedidos');
    if (!pedidos.length) {
      c.innerHTML = `
        <div class="cuenta-vacio">
          <svg class="pieza-svg" viewBox="0 0 120 120" aria-hidden="true" width="72" height="72">
            <rect x="22" y="38" width="76" height="60" rx="3" fill="none" stroke="currentColor" stroke-width="3"/>
            <path d="M22 54h76M50 38V24h20v14" fill="none" stroke="currentColor" stroke-width="3"/>
          </svg>
          <p class="cuenta-vacio-titulo">Todavía no tienes pedidos</p>
          <p class="cuenta-vacio-texto">Cuando compres algo lo vas a poder seguir aquí, desde el taller hasta tu puerta.</p>
          <a href="../index.html#catalogo" class="btn-primario">Ver catálogo</a>
        </div>`;
      return;
    }

    c.innerHTML = pedidos.map((p) => {
      const items = p.items || [];
      const piezas = items.reduce((s, i) => s + i.cantidad, 0);
      return `
        <article class="pedido-tarjeta" data-estado="${escHTML(p.estado)}">
          <header class="pedido-tarjeta-cabeza">
            <div>
              <p class="pedido-tarjeta-id">Pedido #${escHTML(String(p.id).slice(0, 8).toUpperCase())}</p>
              <p class="pedido-tarjeta-fecha">${fmtFecha(p.creado)} · ${piezas} ${piezas === 1 ? 'pieza' : 'piezas'}</p>
            </div>
            <span class="pedido-estado pedido-estado--${escHTML(p.estado)}">${escHTML(ETIQUETAS[p.estado] || p.estado)}</span>
          </header>

          ${pintarRecorrido(p.estado)}
          ${p.estado === 'pendiente' ? '<p class="pedido-tarjeta-nota">Aún no recibimos la confirmación del pago. Si pagaste en OXXO o por transferencia, puede tardar unas horas.</p>' : ''}

          <ul class="pedido-piezas">
            ${items.map((i) => `
              <li>
                <span class="pedido-pieza-img">${i.imagen_url ? `<img src="${escHTML(i.imagen_url)}" alt="" loading="lazy">` : ''}</span>
                <span class="pedido-pieza-nombre">${escHTML(i.nombre)} <span class="pedido-pieza-cant">× ${i.cantidad}</span></span>
                <span class="pedido-pieza-precio">$${fmtPrecio(i.precio * i.cantidad)}</span>
              </li>`).join('')}
          </ul>

          <footer class="pedido-tarjeta-pie">
            <div class="pedido-tarjeta-total">Total <strong>$${fmtPrecio(p.total)} MXN</strong></div>
            <button type="button" class="btn-secundario btn-chico" data-repetir="${escHTML(p.id)}">Volver a pedir</button>
          </footer>
          ${p.direccion ? `<p class="pedido-tarjeta-envio">Envío a ${escHTML(p.direccion)}</p>` : ''}
        </article>`;
    }).join('');
  };

  // Pone las piezas del pedido en el carrito con precio y stock de hoy
  const repetirPedido = async (pedidoId, boton) => {
    const pedido = pedidos.find((p) => p.id === pedidoId);
    if (!pedido) return;
    boton.disabled = true;

    const ids = pedido.items.map((i) => i.producto_id);
    const { data, error } = await db.from('productos_con_stock')
      .select('id, nombre, precio, imagen_url, coleccion_nombre, stock_actual')
      .in('id', ids);

    if (error) { toast('No se pudo cargar el catálogo. Intenta de nuevo.', 'error'); boton.disabled = false; return; }

    let carrito = [];
    try { carrito = JSON.parse(localStorage.getItem('kinara_carrito_v1') || '[]'); } catch { carrito = []; }

    let agregadas = 0;
    let faltantes = 0;
    pedido.items.forEach((item) => {
      const prod = (data || []).find((d) => d.id === item.producto_id);
      if (!prod || prod.stock_actual <= 0) { faltantes++; return; }
      const enCarrito = carrito.find((c) => c.id === prod.id);
      const yaTiene = enCarrito ? enCarrito.cantidad : 0;
      const cantidad = Math.min(item.cantidad, prod.stock_actual - yaTiene);
      if (cantidad <= 0) { faltantes++; return; }
      if (cantidad < item.cantidad) faltantes++;
      if (enCarrito) {
        enCarrito.cantidad += cantidad;
        enCarrito.precio = Number(prod.precio);
      } else {
        carrito.push({
          id: prod.id,
          nombre: prod.nombre,
          coleccion: prod.coleccion_nombre,
          precio: Number(prod.precio),
          imagen_url: prod.imagen_url || null,
          cantidad,
        });
      }
      agregadas++;
    });

    if (!agregadas) {
      toast('Esas piezas ya no están disponibles.', 'error');
      boton.disabled = false;
      return;
    }

    localStorage.setItem('kinara_carrito_v1', JSON.stringify(carrito));
    const aviso = faltantes ? '&aviso=incompleto' : '';
    location.href = `../index.html?carrito=abierto${aviso}`;
  };

  $('lista-pedidos').addEventListener('click', (e) => {
    const b = e.target.closest('[data-repetir]');
    if (b) repetirPedido(b.dataset.repetir, b);
  });

  /* =====================================================
     DIRECCIONES
     ===================================================== */
  let direcciones = [];

  const pintarDirecciones = () => {
    const c = $('lista-direcciones');
    if (!direcciones.length) {
      c.innerHTML = '<p class="cuenta-vacio-texto">No tienes direcciones guardadas. Agrega una y la llenamos por ti al comprar.</p>';
      return;
    }
    c.innerHTML = direcciones.map((d) => `
      <article class="direccion-tarjeta${d.predeterminada ? ' predeterminada' : ''}">
        <div>
          <p class="direccion-etiqueta">
            ${escHTML(d.etiqueta || 'Dirección')}
            ${d.predeterminada ? '<span class="direccion-badge">Predeterminada</span>' : ''}
          </p>
          <p class="direccion-texto">${escHTML(d.calle)}<br>${escHTML(d.ciudad)}, ${escHTML(d.estado)} CP ${escHTML(d.cp)}</p>
        </div>
        <div class="direccion-acciones">
          ${d.predeterminada ? '' : `<button type="button" class="acceso-link" data-predeterminar="${escHTML(d.id)}">Usar por defecto</button>`}
          <button type="button" class="acceso-link acceso-link--peligro" data-borrar="${escHTML(d.id)}">Eliminar</button>
        </div>
      </article>`).join('');
  };

  const cargarDirecciones = async () => {
    const { data, error } = await db.from('direcciones')
      .select('*')
      .order('predeterminada', { ascending: false })
      .order('created_at', { ascending: true });
    if (error) throw error;
    direcciones = data || [];
    pintarDirecciones();
  };

  // Solo puede haber una predeterminada: primero quito la anterior
  const predeterminar = async (id) => {
    const uid = ModuloSesion.usuario()?.id;
    let { error } = await db.from('direcciones').update({ predeterminada: false })
      .eq('user_id', uid).eq('predeterminada', true);
    if (!error) ({ error } = await db.from('direcciones').update({ predeterminada: true }).eq('id', id));
    if (error) { toast('No se pudo actualizar la dirección.', 'error'); return; }
    await cargarDirecciones();
    toast('Dirección predeterminada actualizada');
  };

  const borrarDireccion = async (id) => {
    const d = direcciones.find((x) => x.id === id);
    if (!d || !confirm(`¿Eliminar la dirección "${d.etiqueta || d.calle}"?`)) return;
    const { error } = await db.from('direcciones').delete().eq('id', id);
    if (error) { toast('No se pudo eliminar la dirección.', 'error'); return; }
    await cargarDirecciones();
    toast('Dirección eliminada');
  };

  $('lista-direcciones').addEventListener('click', (e) => {
    const p = e.target.closest('[data-predeterminar]');
    const b = e.target.closest('[data-borrar]');
    if (p) predeterminar(p.dataset.predeterminar);
    if (b) borrarDireccion(b.dataset.borrar);
  });

  const selectEstado = $('dir-estado');
  selectEstado.innerHTML = '<option value="">Selecciona tu estado</option>' +
    ESTADOS_MX.map((e) => `<option>${e}</option>`).join('');

  const mostrarFormDireccion = (visible) => {
    $('form-direccion').hidden = !visible;
    $('btn-nueva-direccion').hidden = visible;
    mensaje('dir-mensaje', '');
    if (visible) {
      $('form-direccion').reset();
      $('dir-predeterminada').checked = !direcciones.length;
      $('dir-calle').focus();
    }
  };

  $('btn-nueva-direccion').addEventListener('click', () => mostrarFormDireccion(true));
  $('dir-cancelar').addEventListener('click', () => mostrarFormDireccion(false));

  $('form-direccion').addEventListener('submit', async (e) => {
    e.preventDefault();
    const datos = {
      etiqueta: $('dir-etiqueta').value.trim() || null,
      calle: $('dir-calle').value.trim(),
      ciudad: $('dir-ciudad').value.trim(),
      estado: selectEstado.value,
      cp: $('dir-cp').value.trim(),
    };
    const reglas = [
      ['dir-calle', datos.calle.length >= 10, 'Escribe calle, número y colonia.'],
      ['dir-ciudad', datos.ciudad.length >= 2, 'Escribe la ciudad.'],
      ['dir-cp', /^\d{5}$/.test(datos.cp), 'El código postal lleva 5 dígitos.'],
      ['dir-estado', !!datos.estado, 'Selecciona el estado.'],
    ];
    document.querySelectorAll('#form-direccion .checkout-input').forEach((i) => i.classList.remove('error'));
    const falla = reglas.find(([, ok]) => !ok);
    if (falla) {
      $(falla[0]).classList.add('error');
      $(falla[0]).focus();
      mensaje('dir-mensaje', falla[2]);
      return;
    }

    const boton = $('dir-guardar');
    boton.disabled = true;
    const predeterminada = $('dir-predeterminada').checked;
    if (predeterminada && direcciones.some((d) => d.predeterminada)) {
      await db.from('direcciones').update({ predeterminada: false })
        .eq('user_id', ModuloSesion.usuario()?.id).eq('predeterminada', true);
    }
    const { error } = await db.from('direcciones').insert({ ...datos, predeterminada });
    boton.disabled = false;

    if (error) {
      mensaje('dir-mensaje', /10 direcciones/.test(error.message)
        ? 'Puedes guardar hasta 10 direcciones. Elimina alguna para agregar otra.'
        : 'No se pudo guardar la dirección. Intenta de nuevo.');
      return;
    }
    mostrarFormDireccion(false);
    await cargarDirecciones();
    toast('Dirección guardada');
  });

  /* =====================================================
     DATOS Y CONTRASEÑA
     ===================================================== */
  // Foto de Google si la hay; si no, la inicial del nombre
  const pintarAvatar = (nombre) => {
    const caja = $('cuenta-avatar');
    const url = ModuloSesion.foto(160);
    caja.textContent = (nombre.trim()[0] || 'K').toUpperCase();
    if (url) {
      const img = new Image(80, 80);
      img.alt = '';
      img.referrerPolicy = 'no-referrer';
      img.onload = () => { caja.textContent = ''; caja.append(img); };
      img.src = url;
    }
  };

  const pintarPerfil = (perfil, usuario) => {
    const nombre = perfil?.nombre || ModuloSesion.nombre();
    const primerNombre = nombre.split(/\s+/)[0];
    $('cuenta-saludo').textContent = primerNombre ? `Hola, ${primerNombre}` : 'Hola';
    pintarAvatar(nombre || usuario.email);
    $('cuenta-email').textContent = usuario.email;
    $('cuenta-desde').textContent = perfil?.cliente_desde
      ? `Cliente desde ${new Date(perfil.cliente_desde).toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })}`
      : 'Tu cuenta Kinara';
    $('dat-nombre').value = nombre;
    $('dat-telefono').value = perfil?.telefono || '';
    $('dat-email').value = usuario.email;
  };

  $('form-datos').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nombre = $('dat-nombre').value.trim();
    const telefono = $('dat-telefono').value.trim();
    if (nombre.length < 3) { mensaje('dat-mensaje', 'Escribe tu nombre completo.'); $('dat-nombre').focus(); return; }
    if (telefono && telefono.replace(/\D/g, '').length < 10) {
      mensaje('dat-mensaje', 'El teléfono debe tener al menos 10 dígitos.'); $('dat-telefono').focus(); return;
    }
    const boton = $('dat-guardar');
    boton.disabled = true;
    const { error } = await db.rpc('actualizar_mi_perfil', { p_nombre: nombre, p_telefono: telefono });
    boton.disabled = false;
    if (error) { mensaje('dat-mensaje', error.message || 'No se pudo guardar.'); return; }
    mensaje('dat-mensaje', 'Datos guardados.', 'exito');
    $('cuenta-saludo').textContent = `Hola, ${nombre.split(/\s+/)[0]}`;
  });

  $('form-password').addEventListener('submit', async (e) => {
    e.preventDefault();
    const pass = $('pw-nueva').value;
    if (pass.length < 8) { mensaje('pw-mensaje', 'La contraseña necesita al menos 8 caracteres.'); $('pw-nueva').focus(); return; }
    const boton = $('pw-guardar');
    boton.disabled = true;
    const { error } = await db.auth.updateUser({ password: pass });
    boton.disabled = false;
    if (error) {
      mensaje('pw-mensaje', error.code === 'same_password'
        ? 'La contraseña nueva debe ser distinta a la anterior.'
        : error.code === 'weak_password'
          ? 'Esa contraseña es fácil de adivinar. Mezcla letras y números.'
          : 'No se pudo cambiar la contraseña. Intenta de nuevo.');
      return;
    }
    $('pw-nueva').value = '';
    mensaje('pw-mensaje', 'Contraseña actualizada.', 'exito');
  });

  $('btn-salir').addEventListener('click', async () => {
    await ModuloSesion.cerrarSesion();
    location.replace('../index.html');
  });

  /* =====================================================
     INICIO
     ===================================================== */
  const iniciar = async () => {
    const usuario = await ModuloSesion.listo;
    if (!usuario) {
      location.replace(`acceso.html?volver=${encodeURIComponent(location.pathname + location.hash)}`);
      return;
    }

    const aviso = $('cuenta-aviso');
    const params = new URLSearchParams(location.search);
    if (params.get('aviso') === 'contrasena') {
      toast('Tu contraseña se actualizó');
      history.replaceState(null, '', location.pathname + location.hash);
    }

    if (!ModuloSesion.confirmado()) {
      aviso.textContent = 'Confirma tu correo con el enlace que te mandamos para ver tus pedidos.';
      aviso.hidden = false;
    }

    try {
      await ModuloSesion.asegurarVinculo();
      const [perfil, lista] = await Promise.all([
        db.rpc('mi_perfil'),
        db.rpc('mis_pedidos'),
        cargarDirecciones(),
      ]);
      if (perfil.error) throw perfil.error;
      if (lista.error) throw lista.error;
      pedidos = lista.data || [];
      pintarPerfil(perfil.data, usuario);
      pintarPedidos();
    } catch (error) {
      console.error('Error cargando la cuenta:', error);
      pintarPerfil(null, usuario);
      aviso.textContent = 'No pudimos cargar todo tu historial. Recarga la página en un momento.';
      aviso.hidden = false;
      pintarPedidos();
    }

    const panel = location.hash.slice(1);
    abrirPanel(['pedidos', 'direcciones', 'datos'].includes(panel) ? panel : 'pedidos');

    $('cuenta-cargando').hidden = true;
    $('cuenta-contenido').hidden = false;
    $('cuenta-page').setAttribute('aria-busy', 'false');
  };

  // Si cierra sesión en otra pestaña, salgo también aquí
  document.addEventListener('kinara:sesion', (e) => {
    if (!e.detail) location.replace('acceso.html');
  });

  iniciar();
})();
