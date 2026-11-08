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

  /* --- Envío y pedido mínimo ---
     Las reglas vienen de ajustes_tienda (09_envio_y_minimo.sql). Aquí solo
     se muestran: el servidor vuelve a calcular el envío al crear el pago. */
  let reglas = null;
  const cargarReglas = async () => {
    try {
      const tabla = () => SupabaseDB.cliente.from('ajustes_tienda');
      let { data, error } = await tabla()
        .select('envio_costo, envio_gratis_desde, pedido_minimo, iva_tasa, iva_desglosar, monedero_pct, monedero_uso_max_pct')
        .maybeSingle();
      // Sin las columnas de IVA y monedero (antes de 11_*.sql) sigue con el envío
      if (error) ({ data, error } = await tabla().select('envio_costo, envio_gratis_desde, pedido_minimo').maybeSingle());
      if (error || !data) return;
      reglas = {
        costo:  Number(data.envio_costo),
        gratis: Number(data.envio_gratis_desde),
        minimo: Number(data.pedido_minimo),
        iva:    data.iva_desglosar ? Number(data.iva_tasa) : 0,
        monederoPct: Number(data.monedero_pct ?? 0),
        usoMaxPct:   Number(data.monedero_uso_max_pct ?? 0),
      };
      document.dispatchEvent(new CustomEvent('kinara:reglas', { detail: reglas }));
      pintarEnvio();
    } catch (_) { /* sin reglas, el carrito se ve como antes */ }
  };
  const calcularEnvio = (sub = calcularTotal()) =>
    (!reglas || sub <= 0 || sub >= reglas.gratis) ? 0 : reglas.costo;
  const faltaMinimo = (sub = calcularTotal()) =>
    reglas ? Math.max(0, reglas.minimo - sub) : 0;
  // Los precios ya incluyen IVA: esto es cuánto de un total es IVA
  const ivaDe = (total) => (!reglas?.iva ? 0 : Math.round((total - total / (1 + reglas.iva)) * 100) / 100);
  const textoIva = (total) => {
    const iva = ivaDe(total);
    return iva > 0 ? `Incluye IVA (${Math.round(reglas.iva * 100)}%): $${formatearPrecio(iva)}` : '';
  };
  // Lo que gana en el monedero: % de lo pagado en piezas
  const monederoGanado = (piezas) => (!reglas?.monederoPct ? 0 : Math.round(piezas * reglas.monederoPct) / 100);
  const contarUnidades   = () => items.reduce((s, i) => s + i.cantidad, 0);
  const formatearPrecio  = (p) => {
    const v = parseFloat(p);
    return v.toLocaleString('es-MX', { minimumFractionDigits: Number.isInteger(Math.round(v * 100) / 100) ? 0 : 2, maximumFractionDigits: 2 });
  };

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
    if (el) { el.textContent = total; el.style.display = total > 0 ? 'inline-flex' : 'none'; }
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
          <svg class="pieza-svg carrito-vacio-icono" viewBox="0 0 120 120" aria-hidden="true"><use href="#pieza-medida"/></svg>
          <p class="carrito-vacio-texto">Todavía no hay piezas aquí</p>
          <p class="carrito-vacio-subtexto">Agrega algo del catálogo o cotiza una pieza a tu medida.</p>
          <a href="#catalogo" class="btn-secundario btn-chico" onclick="ModuloCarrito.cerrarDrawer()">Ver catálogo</a>
        </div>`;
      const btn = document.getElementById('btn-checkout');
      if (btn) btn.disabled = true;
    } else {
      c.innerHTML = items.map(item => {
        const categoria = (item.coleccion || '').replace('Kinara ', '');
        return `
        <div class="carrito-item" data-id="${item.id}">
          <div class="carrito-item-imagen cama" data-categoria="${escHTML(categoria)}">
            ${item.imagen_url
              ? `<img src="${escHTML(item.imagen_url)}" alt="${escHTML(item.nombre)}" loading="lazy">`
              : piezaSVG(categoria)}
          </div>
          <div class="carrito-item-info">
            <span class="carrito-item-coleccion">${escHTML(item.coleccion)}</span>
            <span class="carrito-item-nombre">${escHTML(item.nombre)}</span>
            <span class="carrito-item-precio">$${formatearPrecio(item.precio)} MXN c/u</span>
            <div class="carrito-item-controles">
              <div class="cantidad-control">
                <button type="button" class="cantidad-btn" aria-label="Quitar una pieza de ${escHTML(item.nombre)}" onclick="ModuloCarrito.cambiarCantidad('${item.id}',-1)">−</button>
                <span class="cantidad-numero">${item.cantidad}</span>
                <button type="button" class="cantidad-btn" aria-label="Agregar una pieza de ${escHTML(item.nombre)}" onclick="ModuloCarrito.cambiarCantidad('${item.id}',1)">+</button>
              </div>
              <span class="carrito-item-subtotal">$${formatearPrecio(item.precio*item.cantidad)}</span>
            </div>
            <button type="button" class="carrito-item-eliminar" onclick="ModuloCarrito.eliminar('${item.id}')">Eliminar</button>
          </div>
        </div>`;
      }).join('');
    }

    pintarEnvio();
  };

  /* --- Desglose, barra de envío gratis y pedido mínimo --- */
  const pintarEnvio = () => {
    const sub = calcularTotal();
    const envio = calcularEnvio(sub);
    const falta = faltaMinimo(sub);
    const $ = (id) => document.getElementById(id);

    const tv = $('carrito-total-valor');
    if (tv) tv.textContent = `$${formatearPrecio(sub + envio)} MXN`;

    const ivaEl = $('carrito-iva');
    if (ivaEl) {
      ivaEl.textContent = items.length ? textoIva(sub + envio) : '';
      ivaEl.hidden = !ivaEl.textContent;
    }
    const monEl = $('carrito-monedero');
    if (monEl) {
      const gana = items.length ? monederoGanado(sub) : 0;
      monEl.innerHTML = gana > 0
        ? `Con esta compra ganas <strong>$${formatearPrecio(gana)}</strong> en tu <a href="pages/cuenta.html#monedero">Monedero Kinara</a>.`
        : '';
      monEl.hidden = !gana;
    }

    const btn = $('btn-checkout');
    if (btn) btn.disabled = !items.length || falta > 0;

    const caja = $('carrito-envio');
    const desglose = $('carrito-desglose');
    if (!caja || !desglose) return;
    const conReglas = !!reglas && items.length > 0;
    caja.hidden = !conReglas;
    desglose.hidden = !conReglas;
    if (!conReglas) return;

    $('carrito-piezas-valor').textContent = `$${formatearPrecio(sub)}`;
    $('carrito-envio-valor').textContent = envio > 0 ? `$${formatearPrecio(envio)}` : 'Gratis';

    let texto, avance;
    if (falta > 0) {
      texto = `El pedido mínimo es de <strong>$${formatearPrecio(reglas.minimo)}</strong> en piezas. Te faltan $${formatearPrecio(falta)}.`;
      avance = sub / reglas.minimo;
    } else if (envio > 0) {
      texto = `Te faltan <strong>$${formatearPrecio(reglas.gratis - sub)}</strong> para el envío gratis.`;
      avance = sub / reglas.gratis;
    } else {
      texto = '<strong>Tu envío es gratis.</strong>';
      avance = 1;
    }
    $('carrito-envio-texto').innerHTML = texto;
    caja.classList.toggle('carrito-envio--minimo', falta > 0);
    caja.classList.toggle('carrito-envio--gratis', falta === 0 && envio === 0);
    $('carrito-envio-progreso').style.transform = `scaleX(${Math.min(1, Math.max(0.03, avance))})`;
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
    t.style.borderLeftColor = tipo==='error' ? 'var(--color-error)' : 'var(--color-acento)';
    t.classList.add('visible');
    clearTimeout(t._to);
    t._to = setTimeout(()=>t.classList.remove('visible'), 2500);
  };

  /* --- Inicialización --- */
  const iniciar = () => {
    actualizarUI();
    cargarReglas();
    document.getElementById('btn-carrito')?.addEventListener('click', abrirDrawer);
    document.getElementById('carrito-overlay')?.addEventListener('click', cerrarDrawer);
    document.getElementById('carrito-cerrar-btn')?.addEventListener('click', cerrarDrawer);
    document.getElementById('btn-checkout')?.addEventListener('click', ModuloCheckout.abrir);
    document.addEventListener('keydown', e => { if (e.key==='Escape') { cerrarDrawer(); ModuloCheckout.cerrar(); } });

    // "Volver a pedir" y el regreso del login llegan con ?carrito=abierto
    const params = new URLSearchParams(location.search);
    if (params.get('carrito') === 'abierto') {
      const incompleto = params.get('aviso') === 'incompleto';
      history.replaceState(null, '', location.pathname + location.hash);
      abrirDrawer();
      if (incompleto) mostrarMensaje('Algunas piezas ya no tienen stock suficiente', 'error');
    }
  };

  return { iniciar, agregar, cambiarCantidad, eliminar, vaciar, abrirDrawer, cerrarDrawer,
           calcularTotal, calcularEnvio, faltaMinimo, hayReglas: () => !!reglas, reglas: () => reglas,
           ivaDe, textoIva, monederoGanado,
           contarUnidades, obtenerItems:()=>items, formatearPrecio, mostrarMensaje };
})();


/* =====================================================
   MÓDULO: CHECKOUT + MERCADO PAGO
   ===================================================== */
const ModuloCheckout = (() => {

  /* --- Datos de la cuenta ---
     Con sesión lleno lo que esté vacío con su perfil y su dirección
     predeterminada. El correo queda fijo: el servidor usa el de la cuenta. */
  let datosCuenta = null;   // { perfil, direcciones } de la sesión actual

  // Qué se paga: el carrito o una cotización aceptada (?cotizacion=<id>)
  let cotizacion = null;
  let monedero = null;      // { saldo, uso_max_pct } con sesión confirmada

  const cargarDatosCuenta = async (usuario) => {
    if (datosCuenta?.uid === usuario.id) return datosCuenta;
    await ModuloSesion.asegurarVinculo();
    const [perfil, dirs] = await Promise.all([
      SupabaseDB.cliente.rpc('mi_perfil'),
      SupabaseDB.cliente.from('direcciones').select('*').order('predeterminada', { ascending: false }),
    ]);
    datosCuenta = { uid: usuario.id, perfil: perfil.data || null, direcciones: dirs.data || [] };
    return datosCuenta;
  };

  const llenarSiVacio = (id, valor) => {
    const el = document.getElementById(id);
    if (el && !el.value.trim() && valor) el.value = valor;
  };

  const prepararCuenta = async () => {
    const aviso = document.getElementById('checkout-cuenta');
    const email = document.getElementById('co-email');
    const guardarCampo = document.getElementById('co-guardar-dir-campo');
    const usuario = window.ModuloSesion?.usuario();

    if (!usuario) {
      const volver = encodeURIComponent('/index.html?carrito=abierto');
      aviso.innerHTML = `¿Ya tienes cuenta? <a href="pages/acceso.html?volver=${volver}">Entra</a> para usar tus datos guardados y seguir tu pedido.`;
      email.readOnly = false;
      guardarCampo.hidden = true;
      monedero = null;
      renderizarResumen();
      return;
    }

    aviso.textContent = `Comprando como ${usuario.email}. Este pedido quedará en tu cuenta.`;
    email.value = usuario.email;
    email.readOnly = ModuloSesion.confirmado();

    try {
      const { perfil, direcciones } = await cargarDatosCuenta(usuario);
      llenarSiVacio('co-nombre', perfil?.nombre || usuario.user_metadata?.nombre);
      llenarSiVacio('co-telefono', perfil?.telefono);
      const dir = direcciones[0];
      if (dir) {
        llenarSiVacio('co-direccion', dir.calle);
        llenarSiVacio('co-ciudad', dir.ciudad);
        llenarSiVacio('co-cp', dir.cp);
        const estado = document.getElementById('co-estado');
        if (estado && !estado.value) estado.value = dir.estado;
      }
      guardarCampo.hidden = !ModuloSesion.confirmado();
      document.getElementById('co-guardar-dir').checked = !direcciones.length;
    } catch (e) {
      console.warn('No se pudieron cargar los datos de la cuenta:', e);
    }
    await cargarMonedero();
  };

  /* --- Monedero Kinara ---
     Solo se usa con correo confirmado; el servidor vuelve a calcular el
     saldo y el tope antes de cobrar. */
  const cargarMonedero = async () => {
    monedero = null;
    if (ModuloSesion.confirmado()) {
      const { data } = await SupabaseDB.cliente.rpc('mi_monedero');
      if (Number(data?.saldo) > 0) monedero = { saldo: Number(data.saldo), usoMax: Number(data.uso_max_pct) };
    }
    renderizarResumen();
  };

  const descuentoMonedero = (piezas) => {
    const usar = document.getElementById('co-usar-monedero');
    if (!monedero || !usar?.checked) return 0;
    return Math.min(monedero.saldo, Math.round(piezas * monedero.usoMax) / 100);
  };

  // Guarda la dirección del checkout si el cliente lo pidió y no la tenía
  const guardarDireccionSiAplica = async (datos) => {
    const usuario = window.ModuloSesion?.usuario();
    const marcado = document.getElementById('co-guardar-dir')?.checked;
    if (!usuario || !marcado || !ModuloSesion.confirmado()) return;
    const existentes = datosCuenta?.direcciones || [];
    const igual = existentes.some((d) =>
      d.calle.trim().toLowerCase() === datos.direccion.toLowerCase() && d.cp === datos.cp);
    if (igual) return;
    const { error } = await SupabaseDB.cliente.from('direcciones').insert({
      calle: datos.direccion, ciudad: datos.ciudad, estado: datos.estado, cp: datos.cp,
      predeterminada: !existentes.length,
    });
    if (error) console.warn('No se pudo guardar la dirección:', error.message);
    datosCuenta = null;
  };

  /* --- Abrir / cerrar modal --- */
  const abrir = () => {
    if (!ModuloCarrito.contarUnidades() || ModuloCarrito.faltaMinimo() > 0) return;
    cotizacion = null;
    mostrarModal();
  };

  // Paga una cotización ya aceptada: mismo formulario, otras piezas
  const abrirCotizacion = async (id) => {
    const usuario = await ModuloSesion.listo;
    if (!usuario) {
      location.href = `pages/acceso.html?volver=${encodeURIComponent('/index.html?cotizacion=' + id)}`;
      return;
    }
    const { data, error } = await SupabaseDB.cliente.from('cotizaciones')
      .select('id, titulo, cantidad, precio_unitario, costo_envio, estado, vence_at')
      .eq('id', id).maybeSingle();
    if (error || !data) { ModuloCarrito.mostrarMensaje('No encontramos esa cotización', 'error'); return; }
    if (data.estado !== 'cotizada') { ModuloCarrito.mostrarMensaje('Esta cotización ya no se puede pagar', 'error'); return; }
    if (data.vence_at && new Date(data.vence_at) < new Date()) {
      ModuloCarrito.mostrarMensaje('Esta cotización venció. Escríbenos y la actualizamos.', 'error');
      return;
    }
    cotizacion = data;
    mostrarModal();
  };

  const mostrarModal = () => {
    ModuloCarrito.cerrarDrawer();
    const titulo = document.getElementById('checkout-titulo');
    if (titulo) titulo.textContent = cotizacion ? 'Pagar mi cotización' : 'Datos de envío';
    restaurarFormulario();
    renderizarResumen();
    prepararCuenta();
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
    const fmt = ModuloCarrito.formatearPrecio;
    const lineas = cotizacion
      ? [{ nombre: `Pieza a medida: ${cotizacion.titulo}`, cantidad: cotizacion.cantidad, precio: Number(cotizacion.precio_unitario) }]
      : ModuloCarrito.obtenerItems();
    c.innerHTML = lineas.map(i =>
      `<div class="checkout-resumen-fila">
        <span>${escHTML(i.nombre)} × ${i.cantidad}</span>
        <span>$${fmt(i.precio*i.cantidad)}</span>
      </div>`).join('');
    const sub = lineas.reduce((s, i) => s + i.precio * i.cantidad, 0);
    const envio = cotizacion ? Number(cotizacion.costo_envio) : ModuloCarrito.calcularEnvio(sub);
    const fila = document.getElementById('checkout-envio-fila');
    if (fila) {
      fila.hidden = !cotizacion && !ModuloCarrito.hayReglas();
      document.getElementById('checkout-envio').textContent = envio > 0 ? `$${fmt(envio)}` : 'Gratis';
    }

    const campo = document.getElementById('co-monedero-campo');
    if (campo) {
      campo.hidden = !monedero;
      if (monedero) {
        const tope = Math.round(sub * monedero.usoMax) / 100;
        document.getElementById('co-monedero-titulo').textContent =
          `Usar $${fmt(Math.min(monedero.saldo, tope))} de mi Monedero Kinara`;
        document.getElementById('co-monedero-texto').textContent = monedero.saldo > tope
          ? `Tienes $${fmt(monedero.saldo)}. En cada compra puedes usar hasta el ${monedero.usoMax}% de las piezas.`
          : `Tienes $${fmt(monedero.saldo)} de saldo.`;
      }
    }
    const descuento = descuentoMonedero(sub);
    const filaDesc = document.getElementById('checkout-descuento-fila');
    if (filaDesc) {
      filaDesc.hidden = !descuento;
      document.getElementById('checkout-descuento').textContent = `−$${fmt(descuento)}`;
    }

    const total = sub + envio - descuento;
    if (t) t.textContent = `$${fmt(total)} MXN`;
    const iva = document.getElementById('checkout-iva');
    if (iva) {
      iva.textContent = ModuloCarrito.textoIva(total);
      iva.hidden = !iva.textContent;
    }
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
      {id:'co-estado',    err:'err-estado',    msg:'Selecciona tu estado',            fn:v=>v.length>0},
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
      await guardarDireccionSiAplica(datos);
      const pago = await crearPago(datos);
      if (cotizacion) {
        try { sessionStorage.setItem('kinara:pago_cotizacion', pago.pedido_id); } catch (_) {}
      } else {
        localStorage.setItem('kinara_pedido_actual', pago.pedido_id);
      }

      // Redirigir a Mercado Pago
      window.location.href = pago.url_pago;

    } catch (e) {
      mostrarError(e.message);
    }
  };

  /**
   * Creo el pedido y el pago vía la Edge Function "crear-preferencia-mp".
   * SEGURIDAD: solo mando IDs, cantidades y datos de envío. Precios,
   * pedido y URLs de retorno se deciden en el servidor.
   */
  const crearPago = async (datos) => {
    const usarMonedero = !!monedero && document.getElementById('co-usar-monedero')?.checked;
    const { data, error } = await SupabaseDB.cliente.functions.invoke('crear-preferencia-mp', {
      body: {
        ...(cotizacion
          ? { cotizacion_id: cotizacion.id }
          : { items: ModuloCarrito.obtenerItems().map(i=>({ id:i.id, cantidad:i.cantidad })) }),
        usar_monedero: usarMonedero,
        cliente: { nombre:datos.nombre, email:datos.email, telefono:datos.telefono },
        envio: { direccion:datos.direccion, ciudad:datos.ciudad, estado:datos.estado, cp:datos.cp }
      }
    });

    if (error) {
      // En errores 4xx/5xx el mensaje para el cliente viene en la respuesta
      const detalle = await error.context?.json?.().catch(()=>null);
      throw new Error(detalle?.error || 'No se pudo iniciar el pago. Intenta de nuevo.');
    }
    return data;
  };

  /* --- Estados visuales --- */
  // Oculto el formulario en lugar de borrarlo para poder reintentar
  const mostrarEstado = (html) => {
    const c = document.getElementById('checkout-modal-cuerpo');
    if (!c) return;
    Array.from(c.children).forEach(el => { if (el.id !== 'checkout-estado') el.hidden = true; });
    let estado = document.getElementById('checkout-estado');
    if (!estado) {
      estado = document.createElement('div');
      estado.id = 'checkout-estado';
      c.appendChild(estado);
    }
    estado.innerHTML = html;
  };

  const restaurarFormulario = () => {
    document.getElementById('checkout-estado')?.remove();
    const c = document.getElementById('checkout-modal-cuerpo');
    if (c) Array.from(c.children).forEach(el => { el.hidden = false; });
    const btn = document.getElementById('btn-pagar');
    if (btn) btn.disabled = false;
  };

  const mostrarCargando = () => {
    // Evito crear dos pedidos con doble clic
    const btn = document.getElementById('btn-pagar');
    if (btn) btn.disabled = true;
    mostrarEstado(`
      <div class="pago-estado">
        <div class="pago-spinner"></div>
        <p class="pago-estado-titulo">Preparando tu pedido</p>
        <p class="pago-estado-subtitulo">Verificando disponibilidad y creando tu orden de pago…</p>
      </div>`);
  };

  const mostrarError = (msg) => {
    mostrarEstado(`
      <div class="pago-estado">
        <div class="pago-error-icono">✕</div>
        <p class="pago-estado-titulo">No se pudo iniciar el pago</p>
        <p class="pago-estado-subtitulo">${escHTML(msg || 'No se pudo procesar el pago. Intenta de nuevo.')}</p>
        <button class="btn-primario" onclick="ModuloCheckout.restaurarFormulario()">
          Volver a mis datos
        </button>
      </div>`);
  };

  /* --- Inicialización --- */
  const iniciar = () => {
    document.getElementById('checkout-cerrar-btn')?.addEventListener('click', cerrar);
    document.getElementById('btn-pagar')?.addEventListener('click', procesarPago);
    document.getElementById('checkout-overlay')?.addEventListener('click', e => { if(e.target===e.currentTarget) cerrar(); });
    document.getElementById('co-usar-monedero')?.addEventListener('change', renderizarResumen);
    document.addEventListener('kinara:reglas', renderizarResumen);

    // "Ver y pagar" desde Mi cuenta o el correo de la cotización
    const id = new URLSearchParams(location.search).get('cotizacion');
    if (/^[0-9a-f-]{36}$/i.test(id || '')) {
      history.replaceState(null, '', location.pathname + location.hash);
      abrirCotizacion(id);
    }
  };

  return { abrir, abrirCotizacion, cerrar, iniciar, restaurarFormulario };
})();


/* --- Inicializar al cargar el DOM --- */
document.addEventListener('DOMContentLoaded', () => {
  ModuloCarrito.iniciar();
  ModuloCheckout.iniciar();
});
