/**
 * productos.js — Catálogo conectado a Supabase (Fase 2)
 * Reemplazo el array local de la fase 1 por consultas reales
 * a Supabase. La misma API pública del módulo para que el
 * HTML no necesite cambios: mismos métodos, datos reales.
 */
'use strict';

/* Dibujo de la categoría, definido como <symbol> en index.html */
const SIMBOLOS_CATEGORIA = {
  'Lámparas': 'pieza-lampara', Herramientas: 'pieza-herramienta', Moldes: 'pieza-molde',
  Juguetes: 'pieza-juguete', Figuras: 'pieza-figura'
};
const piezaSVG = (categoria) =>
  `<svg class="pieza-svg" viewBox="0 0 120 120" aria-hidden="true"><use href="#${SIMBOLOS_CATEGORIA[categoria] || 'pieza-medida'}"/></svg>`;

const ModuloCatalogo = (() => {
  let todosLosProductos = [];
  let filtroActivo = 'Todos';
  let ordenActivo  = 'destacado';
  let canalTiempoReal = null;

  /* --- Carga inicial desde Supabase --- */
  const cargarProductos = async () => {
    mostrarCargando();
    const { data, error } = await SupabaseDB.obtenerProductos();
    if (error) { mostrarErrorConexion(); return; }
    if (data)  { todosLosProductos = data; renderizarCatalogo(); }
  };

  /* --- Suscripción tiempo real al inventario --- */
  const iniciarTiempoReal = () => {
    canalTiempoReal = SupabaseDB.suscribirseAlInventario((cambio) => {
      const p = todosLosProductos.find(x => x.id === cambio.producto_id);
      if (!p) return;
      p.stock_actual  = cambio.stock_actual;
      p.estado_stock  = calcularEstadoStock(cambio.stock_actual, cambio.stock_minimo ?? p.stock_minimo);
      actualizarBadgeEnDOM(cambio.producto_id, p.estado_stock, cambio.stock_actual);
    });
  };

  /* --- Lógica de estado de stock --- */
  const calcularEstadoStock = (actual, minimo = 3) => {
    if (actual === 0)       return 'agotado';
    if (actual <= minimo)   return 'pocas';
    return 'disponible';
  };

  const obtenerInfoBadge = (estadoStock, stockActual) => {
    if (estadoStock === 'agotado')    return { clase: 'badge-agotado', texto: 'Agotado',                     disponible: false };
    if (estadoStock === 'pocas')      return { clase: 'badge-pocas',   texto: `Últimas ${stockActual} piezas`, disponible: true  };
    return                                   { clase: 'badge-disponible', texto: 'Disponible',               disponible: true  };
  };

  const obtenerEstadoStock = (stock) => obtenerInfoBadge(calcularEstadoStock(stock), stock);

  /* --- Filtrado y ordenamiento en memoria --- */
  const obtenerProductosFiltrados = () => {
    let filtrados = filtroActivo === 'Todos'
      ? [...todosLosProductos]
      : todosLosProductos.filter(p => p.coleccion_nombre?.toLowerCase().includes(filtroActivo.toLowerCase()));

    switch (ordenActivo) {
      case 'precio-asc':  filtrados.sort((a,b) => parseFloat(a.precio) - parseFloat(b.precio)); break;
      case 'precio-desc': filtrados.sort((a,b) => parseFloat(b.precio) - parseFloat(a.precio)); break;
      case 'nuevo':       filtrados.sort((a,b) => (b.nuevo?1:0) - (a.nuevo?1:0));               break;
      default:            filtrados.sort((a,b) => (b.destacado?1:0) - (a.destacado?1:0));
    }
    return filtrados;
  };

  /* --- Formateo de precio --- */
  const formatearPrecio = (precio) =>
    parseFloat(precio).toLocaleString('es-MX', { minimumFractionDigits: 0 });

  /* --- Genera HTML de una tarjeta --- */
  const generarTarjeta = (p) => {
    const badge    = obtenerInfoBadge(p.estado_stock, p.stock_actual);
    const categoria = p.coleccion_nombre?.replace('Kinara ', '') || '';

    return `
      <article class="tarjeta-producto reveal"
               data-id="${p.id}" data-coleccion="${escHTML(categoria)}" data-estado="${p.estado_stock}"
               role="listitem">
        <button type="button" class="tarjeta-imagen cama" data-categoria="${escHTML(categoria)}"
                onclick="ModuloProducto.abrirDetalle('${p.id}')" aria-label="Ver detalle de ${escHTML(p.nombre)}">
          ${piezaSVG(categoria)}
          ${p.imagen_url ? `<img src="${escHTML(p.imagen_url)}" alt="${escHTML(p.nombre)}" loading="lazy" decoding="async" onerror="this.remove()">` : ''}
          <span class="tarjeta-badge" id="badge-${p.id}">
            <span class="badge-stock ${badge.clase}"><span class="punto"></span>${badge.texto}</span>
          </span>
          ${p.nuevo ? '<span class="tarjeta-nuevo">Nuevo</span>' : ''}
        </button>
        <div class="tarjeta-cuerpo">
          <span class="tarjeta-coleccion">${escHTML(p.coleccion_nombre)}</span>
          <h3 class="tarjeta-nombre">${escHTML(p.nombre)}</h3>
          <p class="tarjeta-descripcion">${escHTML(p.descripcion)}</p>
          ${Array.isArray(p.materiales) && p.materiales.length ? `
            <div class="tarjeta-materiales">
              ${p.materiales.map(m=>`<span class="chip-material">${escHTML(m)}</span>`).join('')}
            </div>` : ''}
        </div>
        <div class="tarjeta-pie">
          <div class="tarjeta-precio">$${formatearPrecio(p.precio)}<small>MXN</small></div>
          ${badge.disponible
            ? `<button type="button" class="btn-primario btn-chico" onclick="ModuloCarrito.agregar('${p.id}')"
                       aria-label="Agregar ${escHTML(p.nombre)} al carrito">Agregar</button>`
            : '<span class="tarjeta-agotado">Agotado</span>'}
        </div>
      </article>`;
  };

  /* --- Actualiza badge en DOM sin re-renderizar --- */
  const actualizarBadgeEnDOM = (id, estado, stock) => {
    const el = document.getElementById(`badge-${id}`);
    if (!el) return;
    const b = obtenerInfoBadge(estado, stock);
    el.style.opacity = '0';
    setTimeout(() => {
      el.innerHTML = `<span class="badge-stock ${b.clase}"><span class="punto"></span>${b.texto}</span>`;
      el.style.transition = 'opacity .3s ease';
      el.style.opacity = '1';
    }, 200);
  };

  /* --- Estados de carga y error --- */
  const mostrarCargando = () => {
    const grid = document.getElementById('catalogo-grid');
    if (grid) grid.innerHTML = '<div class="tarjeta-esqueleto"></div>'.repeat(6);
  };

  const mostrarErrorConexion = () => {
    const grid = document.getElementById('catalogo-grid');
    if (!grid) return;
    grid.innerHTML = `
      <div class="catalogo-mensaje">
        <h3>No pudimos cargar el catálogo</h3>
        <p>Revisa tu conexión e inténtalo otra vez.</p>
        <button type="button" onclick="ModuloCatalogo.reintentar()" class="btn-secundario">Reintentar</button>
      </div>`;
  };

  /* --- Renderizado principal --- */
  const renderizarCatalogo = () => {
    const grid = document.getElementById('catalogo-grid');
    if (!grid) return;
    const productos = obtenerProductosFiltrados();
    const contador  = document.getElementById('catalogo-contador');
    if (contador) contador.textContent = `${productos.length} producto${productos.length!==1?'s':''}`;
    if (!productos.length) {
      grid.innerHTML = `<div class="catalogo-mensaje">
        <h3>Aún no hay piezas en esta categoría</h3>
        <p>Si ya sabes lo que necesitas, te lo cotizamos a la medida.</p>
        <a href="#contacto" class="btn-primario" onclick="ModuloContacto.preparar('a_medida')">Cotizar una pieza</a>
      </div>`;
      return;
    }
    grid.innerHTML = productos.map(generarTarjeta).join('');
    setTimeout(() => grid.querySelectorAll('.reveal').forEach(el=>el.classList.add('visible')), 50);
  };

  const activarFiltro = (col) => {
    filtroActivo = col;
    document.querySelectorAll('.filtro-btn').forEach(b => {
      const activo = b.dataset.coleccion===col;
      b.classList.toggle('activo', activo);
      b.setAttribute('aria-pressed', String(activo));
    });
    renderizarCatalogo();
  };

  const cambiarOrden = (orden) => { ordenActivo = orden; renderizarCatalogo(); };
  const reintentar  = () => cargarProductos();

  const configurarEventos = () => {
    document.querySelectorAll('.filtro-btn').forEach(b => b.addEventListener('click', ()=>activarFiltro(b.dataset.coleccion)));
    const sel = document.getElementById('selector-orden');
    if (sel) sel.addEventListener('change', e => cambiarOrden(e.target.value));
  };

  const iniciar = async () => {
    configurarEventos();
    await cargarProductos();
    iniciarTiempoReal();
  };

  return { iniciar, activarFiltro, cambiarOrden, reintentar,
           obtenerProducto: (id) => todosLosProductos.find(p=>p.id===id), obtenerEstadoStock };
})();

/* --- Módulo detalle de producto (panel lateral) --- */
const ModuloProducto = (() => {
  let origenFoco = null;

  const cerrar = () => {
    const drawer = document.getElementById('producto-drawer');
    const overlay = document.getElementById('drawer-overlay');
    if (!drawer) return;
    drawer.classList.remove('abierto');
    overlay?.classList.remove('visible');
    document.body.style.overflow = '';
    setTimeout(() => { drawer.remove(); overlay?.remove(); }, 350);
    origenFoco?.focus({ preventScroll: true });
  };

  const abrirDetalle = async (id) => {
    origenFoco = document.activeElement;
    const { data, error } = await SupabaseDB.obtenerProductoPorId(id);
    if (error || !data) {
      ModuloCarrito.mostrarMensaje('No pudimos abrir esta pieza. Inténtalo otra vez.', 'error');
      return;
    }
    mostrarDrawer(data);
  };

  const dato = (nombre, valor) => valor ? `<div><dt>${nombre}</dt><dd>${escHTML(valor)}</dd></div>` : '';

  const mostrarDrawer = (p) => {
    document.getElementById('producto-drawer')?.remove();
    document.getElementById('drawer-overlay')?.remove();
    const badge = ModuloCatalogo.obtenerEstadoStock(p.stock_actual);
    const categoria = p.coleccion_nombre || p.colecciones?.nombre || ModuloCatalogo.obtenerProducto(p.id)?.coleccion_nombre || '';
    const materiales = Array.isArray(p.materiales) ? p.materiales.join(', ') : '';

    const drawer = document.createElement('aside');
    drawer.id = 'producto-drawer';
    drawer.setAttribute('role', 'dialog');
    drawer.setAttribute('aria-modal', 'true');
    drawer.setAttribute('aria-label', p.nombre);
    drawer.innerHTML = `
      <button type="button" class="btn-icono detalle-cerrar" id="detalle-cerrar" aria-label="Cerrar detalle">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
      </button>
      <div class="detalle-imagen cama" data-categoria="${escHTML(categoria)}">
        ${piezaSVG(categoria)}
        ${p.imagen_url ? `<img src="${escHTML(p.imagen_url)}" alt="${escHTML(p.nombre)}" decoding="async" onerror="this.remove()">` : ''}
      </div>
      <span class="tarjeta-coleccion">${escHTML(categoria)}</span>
      <h2 class="detalle-titulo">${escHTML(p.nombre)}</h2>
      <span class="badge-stock ${badge.clase}"><span class="punto"></span>${badge.texto}</span>
      <p class="detalle-descripcion">${escHTML(p.descripcion)}</p>
      <dl class="detalle-specs">
        ${dato('Material', materiales)}
        ${dato('Medidas', p.dimensiones)}
        ${dato('Acabado', p.acabado)}
      </dl>
      <div class="detalle-compra">
        <div class="detalle-precio">$${parseFloat(p.precio).toLocaleString('es-MX')} <small>MXN</small></div>
        ${badge.disponible
          ? `<button type="button" class="btn-primario" onclick="ModuloCarrito.agregar('${p.id}')">Agregar al carrito</button>`
          : '<span class="tarjeta-agotado">No disponible</span>'}
      </div>`;

    const overlay = document.createElement('div');
    overlay.id = 'drawer-overlay';
    overlay.addEventListener('click', cerrar);
    document.body.append(overlay, drawer);
    document.body.style.overflow = 'hidden';
    drawer.querySelector('#detalle-cerrar').addEventListener('click', cerrar);
    requestAnimationFrame(() => {
      overlay.classList.add('visible');
      drawer.classList.add('abierto');
      drawer.querySelector('#detalle-cerrar').focus({ preventScroll: true });
    });
  };

  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') cerrar(); });

  return { abrirDetalle, cerrar };
})();

/* --- Formulario de contacto --- */
const ModuloContacto = (() => {
  const REGLAS = [
    { id: 'nombre',  msg: 'Escribe tu nombre.',                     ok: (v) => v.length >= 2 },
    { id: 'email',   msg: 'Escribe un correo válido.',              ok: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) },
    { id: 'mensaje', msg: 'Cuéntanos qué pieza necesitas.',         ok: (v) => v.length >= 5 }
  ];

  const validar = () => {
    let primero = null;
    REGLAS.forEach(({ id, msg, ok }) => {
      const campo = document.getElementById(id);
      const error = document.getElementById(`error-${id}`);
      const valido = ok(campo.value.trim());
      campo.setAttribute('aria-invalid', String(!valido));
      error.textContent = valido ? '' : msg;
      if (!valido && !primero) primero = campo;
    });
    primero?.focus();
    return !primero;
  };

  const enviar = async (e) => {
    e.preventDefault();
    const estado = document.getElementById('contacto-estado');
    estado.textContent = '';
    estado.classList.remove('error');
    if (!validar()) return;

    const btn = document.getElementById('btn-enviar-contacto');
    btn.textContent = 'Enviando…';
    btn.disabled = true;

    const { error } = await SupabaseDB.guardarContacto({
      nombre:        document.getElementById('nombre').value.trim(),
      email:         document.getElementById('email').value.trim(),
      tipo_consulta: document.getElementById('tipo').value,
      mensaje:       document.getElementById('mensaje').value.trim()
    });

    btn.textContent = 'Enviar consulta';
    btn.disabled = false;
    if (error) {
      estado.textContent = 'No pudimos enviar tu mensaje. Inténtalo otra vez o escríbenos a hola@kinaramx.com.';
      estado.classList.add('error');
      return;
    }
    estado.textContent = 'Recibimos tu consulta. Te respondemos por correo en 24 a 48 horas.';
    e.target.reset();
  };

  // Abro el formulario con el tipo de consulta ya elegido
  const preparar = (tipo) => {
    const sel = document.getElementById('tipo');
    if (sel) sel.value = tipo;
  };

  return { enviar, preparar };
})();

/* --- Inicialización --- */
document.addEventListener('DOMContentLoaded', async () => {
  if (document.getElementById('catalogo-grid')) await ModuloCatalogo.iniciar();
  document.getElementById('form-contacto')?.addEventListener('submit', ModuloContacto.enviar);
});
