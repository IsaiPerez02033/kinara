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

  const fmtPrecio = (n) => {
    const v = Number(n);
    const dec = Number.isInteger(Math.round(v * 100) / 100) ? 0 : 2;
    return v.toLocaleString('es-MX', { minimumFractionDigits: dec, maximumFractionDigits: 2 });
  };
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
      const resenable = ['enviado', 'entregado'].includes(p.estado);
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
          ${p.numero_guia ? `
          <p class="pedido-guia">
            <span>Va por <strong>${escHTML(p.paqueteria || 'paquetería')}</strong> · guía <span class="pedido-guia-num">${escHTML(p.numero_guia)}</span></span>
            ${/^https:\/\//.test(p.url_rastreo || '') ? `<a href="${escHTML(p.url_rastreo)}" target="_blank" rel="noopener" class="btn-secundario btn-chico">Rastrear paquete</a>` : ''}
          </p>` : ''}
          ${p.estado === 'pendiente' ? '<p class="pedido-tarjeta-nota">Aún no recibimos la confirmación del pago. Si pagaste en OXXO o por transferencia, puede tardar unas horas.</p>' : ''}

          <ul class="pedido-piezas">
            ${items.map((i) => `
              <li>
                <span class="pedido-pieza-img">${i.imagen_url ? `<img src="${escHTML(i.imagen_url)}" alt="" loading="lazy">` : ''}</span>
                <span class="pedido-pieza-nombre">${escHTML(i.nombre)} <span class="pedido-pieza-cant">× ${i.cantidad}</span></span>
                <span class="pedido-pieza-precio">$${fmtPrecio(i.precio * i.cantidad)}</span>
                ${resenable && i.producto_id ? botonResena(i) : ''}
              </li>`).join('')}
            ${(() => {
              const descuento = Number(p.descuento || 0);
              const envio = p.envio != null
                ? Number(p.envio)
                : Number(p.total) + descuento - items.reduce((s, i) => s + i.precio * i.cantidad, 0);
              const fila = (clase, texto, valor) => `
              <li class="${clase}">
                <span class="pedido-pieza-img" aria-hidden="true"></span>
                <span class="pedido-pieza-nombre">${texto}</span>
                <span class="pedido-pieza-precio">${valor}</span>
              </li>`;
              return (envio > 0.009 ? fila('pedido-pieza-envio', 'Envío a domicilio', `$${fmtPrecio(envio)}`) : '')
                + (descuento > 0 ? fila('pedido-pieza-envio pedido-pieza-monedero', 'Monedero Kinara', `−$${fmtPrecio(descuento)}`) : '');
            })()}
          </ul>

          <footer class="pedido-tarjeta-pie">
            <div class="pedido-tarjeta-total">Total <strong>$${fmtPrecio(p.total)} MXN</strong>
              ${Number(p.iva) > 0 ? `<span class="pedido-tarjeta-iva">Incluye IVA (${Math.round(Number(p.iva_tasa) * 100)}%): $${fmtPrecio(p.iva)}</span>` : ''}
            </div>
            ${p.cotizacion ? '' : `<button type="button" class="btn-secundario btn-chico" data-repetir="${escHTML(p.id)}">Volver a pedir</button>`}
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
    const r = e.target.closest('[data-resenar]');
    if (r) abrirResena(r);
    if (e.target.closest('[data-cancelar-resena]')) e.target.closest('.resena-form')?.remove();
  });

  /* =====================================================
     RESEÑAS (solo piezas enviadas o entregadas)
     ===================================================== */
  let misResenas = new Map();   // producto_id → reseña

  const estrellas = (n) => `<span class="estrellas" style="--valor:${(n / 5) * 100}%" aria-hidden="true">★★★★★</span>`;

  const botonResena = (item) => {
    const r = misResenas.get(item.producto_id);
    return `
      <span class="pedido-pieza-resena">
        ${r ? `${estrellas(r.calificacion)}${r.visible ? '' : ' <small>Oculta por Kinara</small>'}` : ''}
        <button type="button" class="acceso-link" data-resenar="${escHTML(item.producto_id)}" data-nombre="${escHTML(item.nombre)}">
          ${r ? 'Editar reseña' : 'Dejar reseña'}
        </button>
      </span>`;
  };

  const abrirResena = (boton) => {
    const li = boton.closest('li');
    if (li.nextElementSibling?.classList.contains('resena-form')) { li.nextElementSibling.querySelector('input')?.focus(); return; }
    const id = boton.dataset.resenar;
    const r = misResenas.get(id) || {};
    const form = document.createElement('li');
    form.className = 'resena-form';
    form.innerHTML = `
      <form novalidate data-producto="${escHTML(id)}">
        <fieldset class="resena-calificar">
          <legend>¿Qué tal tu ${escHTML(boton.dataset.nombre)}?</legend>
          <div class="resena-estrellas">
            ${[5, 4, 3, 2, 1].map((n) => `
              <input type="radio" name="calificacion" id="cal-${escHTML(id)}-${n}" value="${n}" ${r.calificacion === n ? 'checked' : ''}>
              <label for="cal-${escHTML(id)}-${n}" title="${n} de 5">★<span class="sr-only">${n} de 5</span></label>`).join('')}
          </div>
        </fieldset>
        <input class="checkout-input" name="titulo" maxlength="80" placeholder="Título (opcional)" value="${escHTML(r.titulo || '')}">
        <textarea class="checkout-input" name="texto" rows="3" maxlength="1500" placeholder="Cómo quedó, cómo llegó, para qué la usas…">${escHTML(r.texto || '')}</textarea>
        <p class="acceso-mensaje" role="alert" hidden></p>
        <div class="cuenta-form-acciones">
          <button type="submit" class="btn-primario btn-chico">Publicar reseña</button>
          <button type="button" class="btn-secundario btn-chico" data-cancelar-resena>Cancelar</button>
        </div>
        <p class="acceso-ayuda">Se publica con tu nombre y la inicial de tu apellido.</p>
      </form>`;
    li.after(form);
    form.querySelector('input[type=radio]:checked, input[type=radio]')?.focus();
  };

  $('lista-pedidos').addEventListener('submit', async (e) => {
    const form = e.target.closest('form[data-producto]');
    if (!form) return;
    e.preventDefault();
    const aviso = form.querySelector('.acceso-mensaje');
    const calificacion = Number(form.calificacion.value);
    const texto = form.texto.value.trim();
    const error = !calificacion ? 'Elige de 1 a 5 estrellas.'
      : texto.length < 10 ? 'Cuéntanos un poco más (mínimo 10 letras).' : '';
    if (error) { aviso.textContent = error; aviso.hidden = false; return; }
    const boton = form.querySelector('[type=submit]');
    boton.disabled = true;
    const { error: err } = await db.rpc('guardar_mi_resena', {
      p_producto_id: form.dataset.producto, p_calificacion: calificacion,
      p_titulo: form.titulo.value.trim(), p_texto: texto,
    });
    boton.disabled = false;
    if (err) { aviso.textContent = err.message || 'No se pudo guardar. Intenta de nuevo.'; aviso.hidden = false; return; }
    await cargarResenas();
    pintarPedidos();
    toast('Gracias por tu reseña');
  });

  const cargarResenas = async () => {
    const { data } = await db.rpc('mis_resenas');
    misResenas = new Map((data || []).map((r) => [r.producto_id, r]));
  };

  /* =====================================================
     COTIZACIONES
     ===================================================== */
  const ESTADOS_COT = {
    nueva: 'En revisión', cotizada: 'Lista para pagar', pagada: 'Pagada', rechazada: 'No disponible', cancelada: 'Cancelada',
  };
  let cotizaciones = [];

  const pintarCotizaciones = () => {
    const c = $('lista-cotizaciones');
    if (!cotizaciones.length) {
      c.innerHTML = `
        <div class="cuenta-vacio">
          <p class="cuenta-vacio-titulo">Aún no pides cotizaciones</p>
          <p class="cuenta-vacio-texto">¿Necesitas una refacción, un molde o una figura? Sube tu archivo o fotos y te decimos cuánto cuesta.</p>
        </div>`;
      return;
    }
    const ahora = new Date();
    c.innerHTML = cotizaciones.map((q) => {
      const vencida = q.estado === 'cotizada' && q.vence_at && new Date(q.vence_at) < ahora;
      const piezas = Number(q.precio_unitario) * q.cantidad;
      const total = piezas + Number(q.costo_envio || 0);
      return `
        <article class="pedido-tarjeta cotizacion-tarjeta" data-estado="${escHTML(q.estado)}">
          <header class="pedido-tarjeta-cabeza">
            <div>
              <p class="pedido-tarjeta-id">${escHTML(q.titulo)}</p>
              <p class="pedido-tarjeta-fecha">#${escHTML(q.id.slice(0, 8).toUpperCase())} · ${fmtFecha(q.created_at)} · ${q.cantidad} ${q.cantidad === 1 ? 'pieza' : 'piezas'}</p>
            </div>
            <span class="pedido-estado cotizacion-estado--${escHTML(vencida ? 'vencida' : q.estado)}">${vencida ? 'Vencida' : ESTADOS_COT[q.estado]}</span>
          </header>
          <p class="cotizacion-descripcion">${escHTML(q.descripcion)}</p>
          ${q.archivos?.length ? `<p class="cotizacion-archivos">${q.archivos.length} ${q.archivos.length === 1 ? 'archivo' : 'archivos'}: ${q.archivos.map((a) => escHTML(a.split('/').pop().replace(/^\d+-[a-z0-9]+-/, ''))).join(', ')}</p>` : ''}
          ${q.estado === 'nueva' ? '<p class="pedido-tarjeta-nota">La estamos revisando. Te escribimos en 24 a 48 horas.</p>' : ''}
          ${['cotizada', 'pagada'].includes(q.estado) ? `
            <ul class="pedido-piezas cotizacion-precio">
              <li><span class="pedido-pieza-nombre">Piezas <span class="pedido-pieza-cant">${q.cantidad} × $${fmtPrecio(q.precio_unitario)}</span></span><span class="pedido-pieza-precio">$${fmtPrecio(piezas)}</span></li>
              <li><span class="pedido-pieza-nombre">Envío</span><span class="pedido-pieza-precio">${Number(q.costo_envio) > 0 ? '$' + fmtPrecio(q.costo_envio) : 'Gratis'}</span></li>
              <li><span class="pedido-pieza-nombre">Producción</span><span class="pedido-pieza-precio">${q.dias_produccion} días hábiles</span></li>
            </ul>` : ''}
          ${q.respuesta ? `<p class="cotizacion-respuesta"><strong>Kinara:</strong> ${escHTML(q.respuesta)}</p>` : ''}
          <footer class="pedido-tarjeta-pie">
            ${['cotizada', 'pagada'].includes(q.estado) ? `<div class="pedido-tarjeta-total">Total <strong>$${fmtPrecio(total)} MXN</strong>
              ${q.estado === 'cotizada' && q.vence_at && !vencida ? `<span class="pedido-tarjeta-iva">Válida hasta el ${new Date(q.vence_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'long' })}</span>` : ''}</div>` : '<span></span>'}
            <div class="cotizacion-acciones">
              ${['nueva', 'cotizada'].includes(q.estado) ? `<button type="button" class="acceso-link acceso-link--peligro" data-cancelar-cot="${escHTML(q.id)}">Cancelar</button>` : ''}
              ${q.estado === 'cotizada' && !vencida ? `<a class="btn-primario btn-chico" href="../index.html?cotizacion=${escHTML(q.id)}">Pagar cotización</a>` : ''}
              ${vencida ? '<a class="btn-secundario btn-chico" href="mailto:hola@kinaramx.com">Pedir que la actualicen</a>' : ''}
              ${q.estado === 'pagada' ? '<a class="btn-secundario btn-chico" href="#pedidos" data-ir-pedidos>Ver el pedido</a>' : ''}
            </div>
          </footer>
        </article>`;
    }).join('');
  };

  const cargarCotizaciones = async () => {
    const { data, error } = await db.from('cotizaciones')
      .select('id, tipo, titulo, descripcion, cantidad, archivos, estado, precio_unitario, costo_envio, dias_produccion, respuesta, vence_at, created_at')
      .order('created_at', { ascending: false });
    if (error) throw error;
    cotizaciones = data || [];
    pintarCotizaciones();
  };

  $('lista-cotizaciones').addEventListener('click', async (e) => {
    if (e.target.closest('[data-ir-pedidos]')) { e.preventDefault(); abrirPanel('pedidos'); return; }
    const b = e.target.closest('[data-cancelar-cot]');
    if (!b || !confirm('¿Cancelar esta cotización?')) return;
    b.disabled = true;
    const { data, error } = await db.rpc('cancelar_mi_cotizacion', { p_id: b.dataset.cancelarCot });
    if (error || !data) { toast('No se pudo cancelar.', 'error'); b.disabled = false; return; }
    await cargarCotizaciones();
    toast('Cotización cancelada');
  });

  /* =====================================================
     MONEDERO
     ===================================================== */
  const TIPOS_MOV = { ganado: 'Ganado por tu compra', usado: 'Usado en tu compra', ajuste: 'Ajuste de Kinara' };

  const cargarMonedero = async () => {
    const { data, error } = await db.rpc('mi_monedero');
    if (error) throw error;
    const m = data || {};
    $('monedero-saldo').textContent = `$${fmtPrecio(m.saldo || 0)}`;
    $('monedero-vence').textContent = Number(m.saldo) > 0 && m.vence
      ? `Vence el ${fmtFecha(m.vence)} si no vuelves a comprar.`
      : 'Empieza a juntar con tu siguiente compra.';
    $('monedero-reglas').innerHTML = `
      <li>Cada compra pagada te regresa el <strong>${Number(m.pct)}%</strong> de lo que pagas en piezas.</li>
      <li>Lo usas en tu siguiente compra con sesión iniciada, hasta el <strong>${Number(m.uso_max_pct)}%</strong> de las piezas.</li>
      <li>Tu saldo dura <strong>${m.vigencia_meses} meses</strong> desde tu último movimiento. Cada compra lo renueva.</li>
      <li>No se cambia por dinero. Si cancelamos o reembolsamos un pedido, su saldo se ajusta solo.</li>`;
    const movs = m.movimientos || [];
    $('monedero-movimientos').innerHTML = movs.length ? movs.map((v) => `
      <li>
        <span>
          <strong>${escHTML(TIPOS_MOV[v.tipo] || v.tipo)}</strong>
          <small>${fmtFecha(v.fecha)}${v.pedido ? ` · Pedido #${escHTML(v.pedido)}` : ''}${v.nota && v.tipo === 'ajuste' ? ` · ${escHTML(v.nota)}` : ''}</small>
        </span>
        <span class="monedero-monto ${Number(v.monto) < 0 ? 'negativo' : ''}">${Number(v.monto) < 0 ? '−' : '+'}$${fmtPrecio(Math.abs(v.monto))}</span>
      </li>`).join('') : '<li class="monedero-sin-movs">Todavía no hay movimientos.</li>';
  };

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
        cargarResenas(),
        cargarCotizaciones(),
        cargarMonedero(),
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
    abrirPanel(['pedidos', 'cotizaciones', 'monedero', 'direcciones', 'datos'].includes(panel) ? panel : 'pedidos');

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
