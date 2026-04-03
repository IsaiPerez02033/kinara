/**
 * carrito.js — Sistema de carrito de compras y checkout Kinara (Fase 3)
 * Gestiono el flujo completo: carrito persistente en localStorage,
 * verificación de stock en Supabase, formulario de datos,
 * creación de preferencia en Mercado Pago y redirección al pago.
 */
'use strict';

/* =====================================================
   MÓDULO: CARRITO
   ===================================================== */
const ModuloCarrito = (() => {

  const STORAGE_KEY = 'kinara_carrito_v1';
  let items = cargarDesdeStorage();

  function cargarDesdeStorage() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
    catch { return []; }
  }

  const guardarEnStorage = () => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); }
    catch (e) { console.warn('No se pudo guardar el carrito:', e); }
  };

  /* --- Agregar producto (verifica stock en Supabase) --- */
  const agregar = async (productoId, datosProducto = null) => {
    const { data: stockData } = await SupabaseDB.obtenerStock(productoId);
    if (!stockData || stockData.stock_actual === 0) {
      mostrarMensaje('Esta pieza ya no está disponible', 'error');
      return;
    }

    const existente = items.find(i => i.id === productoId);
    const cantidadActual = existente ? existente.cantidad : 0;

    if (cantidadActual >= stockData.stock_actual) {
      mostrarMensaje(`Solo hay ${stockData.stock_actual} piezas disponibles`, 'error');
      return;
    }

    if (existente) {
      existente.cantidad++;
    } else {
      const producto = datosProducto || ModuloCatalogo.obtenerProducto(productoId);
      if (!producto) return;
      items.push({
        id:         productoId,
        nombre:     producto.nombre,
        coleccion:  producto.coleccion_nombre || producto.coleccion,
        precio:     parseFloat(producto.precio),
        imagen_url: producto.imagen_url || null,
        cantidad:   1
      });
    }

    guardarEnStorage();
    actualizarUI();
    mostrarMensaje(`"${items.find(i=>i.id===productoId)?.nombre}" agregado`);
    animarIcono();
  };

  /* --- Cambiar cantidad --- */
  const cambiarCantidad = async (id, delta) => {
    const item = items.find(i => i.id === id);
    if (!item) return;
    const nueva = item.cantidad + delta;
    if (nueva <= 0) { eliminar(id); return; }
    if (delta > 0) {
      const { data } = await SupabaseDB.obtenerStock(id);
      if (data && nueva > data.stock_actual) {
        mostrarMensaje(`Máximo ${data.stock_actual} piezas`, 'error'); return;
      }
    }
    item.cantidad = nueva;
    guardarEnStorage();
    actualizarUI();
  };

  /* --- Eliminar producto --- */
  const eliminar = (id) => {
    items = items.filter(i => i.id !== id);
    guardarEnStorage();
    actualizarUI();
  };

  /* --- Vaciar todo --- */
  const vaciar = () => { items = []; guardarEnStorage(); actualizarUI(); };

  /* --- Cálculos --- */
  const calcularTotal    = () => items.reduce((s, i) => s + i.precio * i.cantidad, 0);
  const contarUnidades   = () => items.reduce((s, i) => s + i.cantidad, 0);
  const formatearPrecio  = (p) => parseFloat(p).toLocaleString('es-MX', {minimumFractionDigits:0});

  /* --- UI: abrir / cerrar drawer --- */
  const abrirDrawer = () => {
    document.getElementById('carrito-drawer')?.classList.add('abierto');
    document.getElementById('carrito-overlay')?.classList.add('visible');
    document.body.style.overflow = 'hidden';
    renderizarItems();
  };

  const cerrarDrawer = () => {
    document.getElementById('carrito-drawer')?.classList.remove('abierto');
    document.getElementById('carrito-overlay')?.classList.remove('visible');
    document.body.style.overflow = '';
  };

  /* --- Actualizar toda la UI --- */
  const actualizarUI = () => {
    const total = contarUnidades();
    const el = document.getElementById('carrito-contador');
    if (el) { el.textContent = total; el.style.display = total > 0 ? 'flex' : 'none'; }
    if (document.getElementById('carrito-drawer')?.classList.contains('abierto')) renderizarItems();
  };

  /* --- Renderizar items en el drawer --- */
  const renderizarItems = () => {
    const c = document.getElementById('carrito-items-contenedor');
    if (!c) return;

    const tc = document.getElementById('carrito-titulo-contador');
    if (tc) { const n=contarUnidades(); tc.textContent = n>0?`(${n} ${n===1?'pieza':'piezas'})`:''; }

    if (!items.length) {
      c.innerHTML = `
        <div class="carrito-vacio">
          <svg class="carrito-vacio-icono" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round">
            <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/>
          </svg>
          <p class="carrito-vacio-texto">Tu carrito está vacío</p>
          <p class="carrito-vacio-subtexto">Agrega una luminaria para comenzar</p>
        </div>`;
      const btn = document.getElementById('btn-checkout');
      if (btn) btn.disabled = true;
    } else {
      c.innerHTML = items.map(item => `
        <div class="carrito-item" data-id="${item.id}">
          <div class="carrito-item-imagen">
            ${item.imagen_url
              ? `<img src="${item.imagen_url}" alt="${escHTML(item.nombre)}" loading="lazy">`
              : `<div class="carrito-item-imagen-placeholder">${escHTML(item.nombre)}</div>`}
          </div>
          <div class="carrito-item-info">
            <span class="carrito-item-coleccion">${item.coleccion}</span>
            <span class="carrito-item-nombre">${escHTML(item.nombre)}</span>
            <span class="carrito-item-precio">$${formatearPrecio(item.precio)} MXN</span>
          </div>
          <div class="carrito-item-controles">
            <div class="cantidad-control">
              <button class="cantidad-btn" onclick="ModuloCarrito.cambiarCantidad('${item.id}',-1)">−</button>
              <span class="cantidad-numero">${item.cantidad}</span>
              <button class="cantidad-btn" onclick="ModuloCarrito.cambiarCantidad('${item.id}',1)">+</button>
            </div>
            <span style="font-size:.8rem;color:var(--color-dorado);">$${formatearPrecio(item.precio*item.cantidad)}</span>
            <button class="carrito-item-eliminar" onclick="ModuloCarrito.eliminar('${item.id}')">Eliminar</button>
          </div>
        </div>`).join('');
      const btn = document.getElementById('btn-checkout');
      if (btn) btn.disabled = false;
    }

    const tv = document.getElementById('carrito-total-valor');
    if (tv) tv.textContent = `$${formatearPrecio(calcularTotal())} MXN`;
  };

  /* --- Feedback visual --- */
  const animarIcono = () => {
    const btn = document.getElementById('btn-carrito');
    if (btn) { btn.classList.add('carrito-btn-pulso'); setTimeout(()=>btn.classList.remove('carrito-btn-pulso'),400); }
  };

  const mostrarMensaje = (msg, tipo='exito') => {
    const t = document.getElementById('agregar-toast');
    if (!t) return;
    t.textContent = msg;
    t.style.borderLeftColor = tipo==='error' ? '#C07070' : 'var(--color-dorado)';
    t.classList.add('visible');
    clearTimeout(t._to);
    t._to = setTimeout(()=>t.classList.remove('visible'), 2500);
  };

  /* --- Inicialización --- */
  const iniciar = () => {
    actualizarUI();
    document.getElementById('btn-carrito')?.addEventListener('click', abrirDrawer);
    document.getElementById('carrito-overlay')?.addEventListener('click', cerrarDrawer);
    document.getElementById('carrito-cerrar-btn')?.addEventListener('click', cerrarDrawer);
    document.getElementById('btn-checkout')?.addEventListener('click', ModuloCheckout.abrir);
    document.addEventListener('keydown', e => { if (e.key==='Escape') { cerrarDrawer(); ModuloCheckout.cerrar(); } });
  };

  return { iniciar, agregar, cambiarCantidad, eliminar, vaciar, abrirDrawer, cerrarDrawer,
           calcularTotal, contarUnidades, obtenerItems:()=>items, formatearPrecio };
})();


/* =====================================================
   MÓDULO: CHECKOUT + MERCADO PAGO
   ===================================================== */
const ModuloCheckout = (() => {

  /* --- Abrir / cerrar modal --- */
  const abrir = () => {
    if (!ModuloCarrito.contarUnidades()) return;
    ModuloCarrito.cerrarDrawer();
    renderizarResumen();
    const o = document.getElementById('checkout-overlay');
    if (o) { o.style.display='flex'; requestAnimationFrame(()=>o.classList.add('visible')); }
    document.body.style.overflow = 'hidden';
  };

  const cerrar = () => {
    const o = document.getElementById('checkout-overlay');
    if (o) {
      o.classList.remove('visible');
      setTimeout(()=>{ if (!o.classList.contains('visible')) o.style.display='none'; }, 300);
    }
    document.body.style.overflow = '';
  };

  /* --- Resumen en el modal --- */
  const renderizarResumen = () => {
    const c = document.getElementById('checkout-resumen-items');
    const t = document.getElementById('checkout-total');
    if (!c) return;
    c.innerHTML = ModuloCarrito.obtenerItems().map(i =>
      `<div class="checkout-resumen-fila">
        <span>${i.nombre} × ${i.cantidad}</span>
        <span>$${ModuloCarrito.formatearPrecio(i.precio*i.cantidad)}</span>
      </div>`).join('');
    if (t) t.textContent = `$${ModuloCarrito.formatearPrecio(ModuloCarrito.calcularTotal())} MXN`;
  };

  /* --- Validar formulario --- */
  const validar = () => {
    let ok = true;
    const reglas = [
      {id:'co-nombre',    err:'err-nombre',    msg:'Nombre completo obligatorio',     fn:v=>v.length>=3},
      {id:'co-email',     err:'err-email',     msg:'Email válido obligatorio',        fn:v=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)},
      {id:'co-telefono',  err:'err-telefono',  msg:'Teléfono con al menos 10 dígitos',fn:v=>v.replace(/\D/g,'').length>=10},
      {id:'co-direccion', err:'err-direccion', msg:'Dirección de envío obligatoria',  fn:v=>v.length>=10},
      {id:'co-ciudad',    err:'err-ciudad',    msg:'Ciudad obligatoria',              fn:v=>v.length>=2},
      {id:'co-cp',        err:'err-cp',        msg:'Código postal de 5 dígitos',      fn:v=>/^\d{5}$/.test(v)},
    ];
    reglas.forEach(({id,err,msg,fn})=>{
      const inp = document.getElementById(id);
      const errEl = document.getElementById(err);
      if (!inp) return;
      const valido = fn(inp.value.trim());
      inp.classList.toggle('error', !valido);
      if (errEl) { errEl.textContent=msg; errEl.classList.toggle('visible',!valido); }
      if (!valido) ok = false;
    });
    return ok;
  };

  /* --- Procesar pago --- */
  const procesarPago = async () => {
    if (!validar()) return;

    const datos = {
      nombre:    document.getElementById('co-nombre').value.trim(),
      email:     document.getElementById('co-email').value.trim(),
      telefono:  document.getElementById('co-telefono').value.trim(),
      direccion: document.getElementById('co-direccion').value.trim(),
      ciudad:    document.getElementById('co-ciudad').value.trim(),
      estado:    document.getElementById('co-estado').value.trim(),
      cp:        document.getElementById('co-cp').value.trim()
    };

    mostrarCargando();

    try {
      const cliente = await guardarCliente(datos);
      const pedido  = await crearPedido(cliente.id, datos);
      const pref    = await crearPreferencia(pedido, datos);

      await SupabaseDB.cliente.from('pedidos').update({mp_preference_id:pref.id}).eq('id',pedido.id);
      localStorage.setItem('kinara_pedido_actual', pedido.id);

      // Redirigir a Mercado Pago
      window.location.href = pref.sandbox_init_point || pref.init_point;

    } catch (e) {
      mostrarError(e.message);
    }
  };

  /* --- Guardar cliente en Supabase --- */
  const guardarCliente = async (d) => {
    const dir = `${d.direccion}, ${d.ciudad}, ${d.estado} CP ${d.cp}`;
    const { data: ex } = await SupabaseDB.cliente.from('clientes').select('*').eq('email',d.email).maybeSingle();
    if (ex) {
      const { data } = await SupabaseDB.cliente.from('clientes').update({nombre:d.nombre,telefono:d.telefono,direccion:dir}).eq('id',ex.id).select().single();
      return data;
    }
    const { data, error } = await SupabaseDB.cliente.from('clientes').insert([{nombre:d.nombre,email:d.email,telefono:d.telefono,direccion:dir}]).select().single();
    if (error) throw new Error('Error guardando cliente: '+error.message);
    return data;
  };

  /* --- Crear pedido en Supabase --- */
  const crearPedido = async (clienteId, datos) => {
    const items = ModuloCarrito.obtenerItems();
    const dir   = `${datos.direccion}, ${datos.ciudad}, ${datos.estado} CP ${datos.cp}`;

    const { data: pedido, error: ep } = await SupabaseDB.cliente
      .from('pedidos')
      .insert([{cliente_id:clienteId, estado:'pendiente', total:ModuloCarrito.calcularTotal(), direccion_envio:dir}])
      .select().single();
    if (ep) throw new Error('Error creando pedido: '+ep.message);

    const { error: ei } = await SupabaseDB.cliente.from('pedido_items').insert(
      items.map(i=>({pedido_id:pedido.id, producto_id:i.id, cantidad:i.cantidad, precio_unitario:i.precio}))
    );
    if (ei) throw new Error('Error guardando items: '+ei.message);

    return pedido;
  };

  /**
   * Crear preferencia en Mercado Pago via Supabase Edge Function.
   *
   * CONFIGURACIÓN DE LA EDGE FUNCTION en Supabase:
   * 1. Ve a supabase.com → tu proyecto → Edge Functions
   * 2. Crea una función llamada "crear-preferencia-mp"
   * 3. Pega el código del archivo sql/edge-function-mp.ts
   * 4. Agrega el secret MERCADOPAGO_ACCESS_TOKEN en Settings → Secrets
   *
   * El Access Token de Mercado Pago NUNCA va en el frontend.
   */
  const crearPreferencia = async (pedido, datos) => {
    const items = ModuloCarrito.obtenerItems();
    const origen = window.location.origin;

    // SEGURIDAD: solo mando IDs y cantidades al servidor.
    // El precio real lo lee la Edge Function directamente desde Supabase.
    // Así nadie puede manipular el precio desde las DevTools del navegador.
    const { data, error } = await SupabaseDB.cliente.functions.invoke('crear-preferencia-mp', {
      body: {
        pedido_id: pedido.id,
        items: items.map(i=>({
          id:       i.id,      // Solo el ID del producto
          cantidad: i.cantidad // Solo la cantidad — SIN precio
        })),
        payer: {
          name:  datos.nombre.split(' ')[0],
          surname: datos.nombre.split(' ').slice(1).join(' '),
          email: datos.email,
          phone: { area_code:'52', number: datos.telefono.replace(/\D/g,'') }
        },
        back_urls: {
          success: `${origen}/pages/confirmacion.html?status=success&pedido=${pedido.id}`,
          failure: `${origen}/pages/confirmacion.html?status=failure&pedido=${pedido.id}`,
          pending: `${origen}/pages/confirmacion.html?status=pending&pedido=${pedido.id}`
        },
        auto_return:        'approved',
        external_reference: pedido.id
      }
    });

    if (error) throw new Error('Error creando preferencia MP: ' + error.message);
    return data;
  };

  /* --- Estados visuales --- */
  const mostrarCargando = () => {
    const c = document.getElementById('checkout-modal-cuerpo');
    if (!c) return;
    c.innerHTML = `
      <div class="pago-estado">
        <div class="pago-spinner"></div>
        <p class="pago-estado-titulo">Preparando tu pedido</p>
        <p class="pago-estado-subtitulo">Verificando disponibilidad y creando tu orden de pago…</p>
      </div>`;
  };

  const mostrarError = (msg) => {
    const c = document.getElementById('checkout-modal-cuerpo');
    if (!c) return;
    c.innerHTML = `
      <div class="pago-estado">
        <div class="pago-error-icono">✕</div>
        <p class="pago-estado-titulo">Algo salió mal</p>
        <p class="pago-estado-subtitulo">${msg || 'No se pudo procesar el pago. Intenta de nuevo.'}</p>
        <button class="btn-primario" onclick="ModuloCheckout.cerrar()" style="margin-top:1rem;">
          Volver al carrito
        </button>
      </div>`;
  };

  /* --- Inicialización --- */
  const iniciar = () => {
    document.getElementById('checkout-cerrar-btn')?.addEventListener('click', cerrar);
    document.getElementById('btn-pagar')?.addEventListener('click', procesarPago);
    document.getElementById('checkout-overlay')?.addEventListener('click', e => { if(e.target===e.currentTarget) cerrar(); });
  };

  return { abrir, cerrar, iniciar };
})();


/* --- Inicializar al cargar el DOM --- */
document.addEventListener('DOMContentLoaded', () => {
  ModuloCarrito.iniciar();
  ModuloCheckout.iniciar();
});
