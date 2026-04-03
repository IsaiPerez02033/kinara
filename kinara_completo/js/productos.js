/**
 * productos.js — Catálogo conectado a Supabase (Fase 2)
 * Reemplazo el array local de la fase 1 por consultas reales
 * a Supabase. La misma API pública del módulo para que el
 * HTML no necesite cambios: mismos métodos, datos reales.
 */
'use strict';

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
    const colCorto = p.coleccion_nombre?.replace('Kinara ', '') || '';
    const fondos   = { Zen:'#1A1A16', Min:'#12151A', Nova:'#101218', Aura:'#1A1612', 'Raíz':'#1A1210' };
    const fondo    = fondos[colCorto] || '#1A1A1A';

    return `
      <article class="tarjeta-producto reveal"
               data-id="${p.id}" data-coleccion="${colCorto}" data-estado="${p.estado_stock}"
               role="listitem">
        <div class="tarjeta-imagen" style="background-color:${fondo};">
          ${p.imagen_url ? `<img src="${p.imagen_url}" alt="${escHTML(p.nombre)}" loading="lazy" onerror="this.style.display='none'">` : ''}
          <div class="imagen-placeholder" style="display:flex;align-items:center;justify-content:center;
               width:100%;height:100%;position:absolute;inset:0;${p.imagen_url?'display:none;':''}">
            <span style="font-family:'Cormorant Garamond',serif;font-size:1.1rem;font-style:italic;
                         color:rgba(212,163,115,0.25);letter-spacing:0.1em;">${escHTML(p.nombre)}</span>
          </div>
          <div class="tarjeta-imagen-overlay"></div>
          <div class="tarjeta-badge" id="badge-${p.id}">
            <span class="badge-stock ${badge.clase}"><span class="punto"></span>${badge.texto}</span>
          </div>
          ${p.nuevo ? `<div style="position:absolute;top:.75rem;right:.75rem;z-index:2;">
            <span style="padding:3px 10px;background:rgba(212,163,115,.15);border:1px solid rgba(212,163,115,.35);
                         color:var(--color-dorado);font-size:.7rem;letter-spacing:.15em;text-transform:uppercase;">Nuevo</span>
          </div>` : ''}
          ${badge.disponible ? `<div class="tarjeta-accion">
            <button class="btn-agregar" onclick="ModuloCarrito.agregar('${p.id}')"
                    title="Agregar al carrito" aria-label="Agregar ${p.nombre}">+</button>
          </div>` : ''}
        </div>
        <div class="tarjeta-cuerpo">
          <span class="tarjeta-coleccion">${escHTML(p.coleccion_nombre)}</span>
          <h3 class="tarjeta-nombre">${escHTML(p.nombre)}</h3>
          <p class="tarjeta-descripcion">${p.descripcion || ''}</p>
          ${Array.isArray(p.materiales) && p.materiales.length ? `
            <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px;">
              ${p.materiales.map(m=>`<span style="font-size:.7rem;padding:2px 8px;border:1px solid var(--color-borde);border-radius:999px;color:var(--color-blanco-dim);opacity:.6;">${m}</span>`).join('')}
            </div>` : ''}
        </div>
        <div class="tarjeta-pie">
          <div class="tarjeta-precio">
            <span class="moneda">$</span>${formatearPrecio(p.precio)}
            <span style="font-size:.75rem;color:var(--color-blanco-dim);margin-left:4px;">MXN</span>
          </div>
          ${badge.disponible
            ? `<button class="btn-secundario" style="padding:.5rem 1rem;font-size:.75rem;"
                       onclick="ModuloProducto.abrirDetalle('${p.id}')">Ver detalle</button>`
            : `<span style="font-size:.75rem;color:#C07070;">Agotado</span>`}
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
    if (!grid) return;
    grid.innerHTML = Array(6).fill(0).map(()=>`
      <div style="background:var(--color-grafito);border:1px solid var(--color-borde);
                  height:420px;animation:skeleton-pulso 1.5s ease infinite;"></div>`).join('');
    if (!document.getElementById('skeleton-style')) {
      const s = document.createElement('style');
      s.id = 'skeleton-style';
      s.textContent = '@keyframes skeleton-pulso{0%,100%{opacity:.4}50%{opacity:.7}}';
      document.head.appendChild(s);
    }
  };

  const mostrarErrorConexion = () => {
    const grid = document.getElementById('catalogo-grid');
    if (!grid) return;
    grid.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:4rem;border:1px solid var(--color-borde);">
        <p style="font-family:'Cormorant Garamond',serif;font-size:1.4rem;font-style:italic;
                  color:var(--color-blanco-dim);margin-bottom:1rem;">
          No se pudo conectar con la base de datos
        </p>
        <p style="font-size:.875rem;color:var(--color-blanco-dim);opacity:.6;">
          Verifica la configuración en js/lib/supabase.js
        </p>
        <button onclick="ModuloCatalogo.reintentar()" class="btn-secundario" style="margin-top:1.5rem;">
          Reintentar conexión
        </button>
      </div>`;
  };

  /* --- Renderizado principal --- */
  const renderizarCatalogo = () => {
    const grid = document.getElementById('catalogo-grid');
    if (!grid) return;
    const productos = obtenerProductosFiltrados();
    const contador  = document.getElementById('catalogo-contador');
    if (contador) contador.textContent = `${productos.length} luminaria${productos.length!==1?'s':''}`;
    if (!productos.length) {
      grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:4rem;color:var(--color-blanco-dim);">
        <p style="font-family:'Cormorant Garamond',serif;font-size:1.4rem;font-style:italic;">
          No hay luminarias en esta colección</p></div>`;
      return;
    }
    grid.innerHTML = productos.map(generarTarjeta).join('');
    setTimeout(() => grid.querySelectorAll('.reveal').forEach(el=>el.classList.add('visible')), 50);
  };

  const activarFiltro = (col) => {
    filtroActivo = col;
    document.querySelectorAll('.filtro-btn').forEach(b => b.classList.toggle('activo', b.dataset.coleccion===col));
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

/* --- Módulo detalle de producto (drawer lateral) --- */
const ModuloProducto = (() => {
  const abrirDetalle = async (id) => {
    const { data, error } = await SupabaseDB.obtenerProductoPorId(id);
    if (error || !data) return;
    mostrarDrawer(data);
  };

  const mostrarDrawer = (p) => {
    document.getElementById('producto-drawer')?.remove();
    document.getElementById('drawer-overlay')?.remove();
    const badge = ModuloCatalogo.obtenerEstadoStock(p.stock_actual);
    const drawer = document.createElement('div');
    drawer.id = 'producto-drawer';
    drawer.style.cssText = `position:fixed;top:0;right:0;bottom:0;width:min(480px,100vw);
      background:var(--color-grafito);border-left:1px solid var(--color-borde);
      z-index:2000;overflow-y:auto;transform:translateX(100%);
      transition:transform .4s cubic-bezier(.16,1,.3,1);padding:2rem;`;
    drawer.innerHTML = `
      <button onclick="document.getElementById('producto-drawer')?.remove();document.getElementById('drawer-overlay')?.remove();"
        style="position:absolute;top:1rem;right:1rem;color:var(--color-blanco-dim);font-size:1.5rem;">×</button>
      <p style="font-size:.7rem;letter-spacing:.2em;text-transform:uppercase;color:var(--color-dorado);margin-bottom:.5rem;">${escHTML(p.coleccion_nombre)}</p>
      <h2 style="font-family:'Cormorant Garamond',serif;font-size:2.5rem;font-weight:300;margin-bottom:1rem;">${escHTML(p.nombre)}</h2>
      <div style="margin-bottom:1.5rem;"><span class="badge-stock ${badge.clase}"><span class="punto"></span>${badge.texto}</span></div>
      <div style="width:100%;aspect-ratio:1;background:rgba(15,15,15,.5);border:1px solid var(--color-borde);
                  display:flex;align-items:center;justify-content:center;margin-bottom:1.5rem;">
        ${p.imagen_url
          ? `<img src="${p.imagen_url}" style="width:100%;height:100%;object-fit:cover;">`
          : `<span style="font-family:'Cormorant Garamond',serif;font-style:italic;color:rgba(212,163,115,.2);">${escHTML(p.nombre)}</span>`}
      </div>
      <p style="color:var(--color-blanco-dim);line-height:1.8;margin-bottom:1.5rem;">${escHTML(p.descripcion)}</p>
      <div style="border-top:1px solid var(--color-borde);padding-top:1.5rem;margin-bottom:1.5rem;">
        ${p.dimensiones?`<div style="display:flex;justify-content:space-between;padding:.75rem 0;border-bottom:1px solid rgba(255,255,255,.05);">
          <span style="font-size:.75rem;letter-spacing:.1em;text-transform:uppercase;color:var(--color-blanco-dim);">Dimensiones</span>
          <span style="font-size:.875rem;">${p.dimensiones}</span></div>`:''}
        ${p.acabado?`<div style="display:flex;justify-content:space-between;padding:.75rem 0;border-bottom:1px solid rgba(255,255,255,.05);">
          <span style="font-size:.75rem;letter-spacing:.1em;text-transform:uppercase;color:var(--color-blanco-dim);">Acabado</span>
          <span style="font-size:.875rem;">${p.acabado}</span></div>`:''}
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;padding-top:1.5rem;border-top:1px solid var(--color-borde);">
        <div>
          <div style="font-size:.7rem;letter-spacing:.1em;text-transform:uppercase;color:var(--color-blanco-dim);margin-bottom:4px;">Precio</div>
          <div style="font-family:'Cormorant Garamond',serif;font-size:2rem;font-weight:300;">
            <span style="font-size:.875rem;color:var(--color-blanco-dim);">$</span>
            ${parseFloat(p.precio).toLocaleString('es-MX')}
            <span style="font-size:.75rem;color:var(--color-blanco-dim);">MXN</span>
          </div>
        </div>
        ${badge.disponible
          ? `<button class="btn-primario" onclick="ModuloCarrito.agregar('${p.id}')">Agregar al carrito</button>`
          : `<span style="color:#C07070;font-size:.875rem;">No disponible</span>`}
      </div>`;

    const overlay = document.createElement('div');
    overlay.id = 'drawer-overlay';
    overlay.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:1999;
      opacity:0;transition:opacity .3s ease;`;
    overlay.onclick = () => { drawer.remove(); overlay.remove(); };
    document.body.appendChild(overlay);
    document.body.appendChild(drawer);
    requestAnimationFrame(() => { overlay.style.opacity='1'; drawer.style.transform='translateX(0)'; });
  };

  return { abrirDetalle };
})();

/* --- Carrito (placeholder fase 3) --- */
const ModuloCarrito = (() => {
  let items = [];
  const agregar = async (id) => {
    const { data } = await SupabaseDB.obtenerStock(id);
    if (!data || data.stock_actual === 0) return;
    const p = ModuloCatalogo.obtenerProducto(id);
    if (!p) return;
    const ex = items.find(i=>i.id===id);
    ex ? ex.cantidad++ : items.push({id, cantidad:1, producto:p});
    actualizarContador();
    console.log(`✦ "${p.nombre}" agregado al carrito`);
  };
  const actualizarContador = () => {
    const total = items.reduce((s,i)=>s+i.cantidad,0);
    const el = document.getElementById('carrito-contador');
    if (el) { el.textContent=total; el.style.display=total>0?'flex':'none'; }
  };
  return { agregar, items };
})();

/* --- Formulario de contacto --- */
const ModuloContacto = (() => {
  const enviar = async () => {
    const datos = {
      nombre:        document.getElementById('nombre')?.value?.trim(),
      email:         document.getElementById('email')?.value?.trim(),
      tipo_consulta: document.getElementById('tipo')?.value,
      mensaje:       document.getElementById('mensaje')?.value?.trim()
    };
    const btn = document.getElementById('btn-enviar-contacto');
    if (btn) { btn.textContent='Enviando...'; btn.disabled=true; }
    const { error } = await SupabaseDB.guardarContacto(datos);
    if (error) {
      alert(`Error: ${error.message}`);
      if (btn) { btn.textContent='Reintentar'; btn.disabled=false; }
      return;
    }
    if (btn) { btn.textContent='✦ Mensaje enviado'; btn.style.background='rgba(100,180,120,.15)'; }
    ['nombre','email','tipo','mensaje'].forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
  };
  return { enviar };
})();

/* --- Inicialización --- */
document.addEventListener('DOMContentLoaded', async () => {
  if (document.getElementById('catalogo-grid')) await ModuloCatalogo.iniciar();
  const btn = document.getElementById('btn-enviar-contacto');
  if (btn) btn.addEventListener('click', ModuloContacto.enviar);
});
