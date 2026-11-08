/**
 * admin.js — Panel de administración (pages/admin.html)
 * Resumen, productos (crear, editar, fotos, stock, ocultar, borrar),
 * pedidos y mensajes. Todo pasa por Supabase con la sesión del
 * admin; RLS y es_admin() deciden qué se puede leer y escribir.
 */
'use strict';

(() => {
  const db = SupabaseDB.cliente;
  const $ = (sel, raiz = document) => raiz.querySelector(sel);
  const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];

  const BUCKET = 'productos';
  const LADO_MAX_FOTO = 1600;
  const ESTADOS = {
    pendiente: 'Sin pagar', pagado: 'Pagado', en_produccion: 'En producción',
    enviado: 'Enviado', entregado: 'Entregado', cancelado: 'Cancelado'
  };
  const COLOR_ESTADO = {
    pendiente: 'var(--a-linea-2)', pagado: 'var(--pino)', en_produccion: 'var(--cobalto)',
    enviado: 'var(--ocre)', entregado: 'var(--pino)', cancelado: 'var(--bermellon)'
  };
  const TIPOS_CONSULTA = {
    producto: 'Producto', figura: 'Figura personalizada', a_medida: 'Pieza a medida',
    volumen: 'Volumen', personalizado: 'Personalizado', arquitecto: 'Arquitecto', otro: 'Otro'
  };

  const estado = {
    productos: [],
    categorias: [],
    filtroVis: 'todos',
    filtroPedidos: '',
    filtroRespondidos: false,
    filtroCot: 'nueva',
    ajustes: null,
    editor: null
  };

  /* ---------- Utilidades ---------- */
  const dinero = (n) => { const v = Number(n || 0); return '$' + v.toLocaleString('es-MX', { minimumFractionDigits: Number.isInteger(Math.round(v * 100) / 100) ? 0 : 2, maximumFractionDigits: 2 }); };
  const fecha = (f, conHora = true) => f
    ? new Date(f).toLocaleString('es-MX', { day: 'numeric', month: 'short', ...(conHora ? { hour: '2-digit', minute: '2-digit' } : { year: 'numeric' }) })
    : '—';

  const toast = (texto, tipo = 'ok') => {
    const el = document.createElement('div');
    el.className = `a-toast ${tipo === 'error' ? 'error' : ''}`;
    el.textContent = texto;
    $('#toasts').append(el);
    // Con el dedo se puede descartar antes de tiempo
    window.Movimiento?.deslizable(el, { umbral: 60, alCerrar: () => el.remove() });
    setTimeout(() => { el.style.transition = 'opacity .3s'; el.style.opacity = '0'; }, 3200);
    setTimeout(() => el.remove(), 3600);
  };

  const vacio = (titulo, texto = '') => `<div class="a-vacio"><strong>${escHTML(titulo)}</strong>${escHTML(texto)}</div>`;
  const cargando = (n = 4) => '<div class="a-cargando"></div>'.repeat(n);
  const inventarioDe = (p) => (Array.isArray(p.inventario) ? p.inventario[0] : p.inventario) || {};
  const stockDe = (p) => inventarioDe(p).stock_actual ?? 0;
  const estadoStock = (p) => {
    const { stock_actual: s = 0, stock_minimo: m = 3 } = inventarioDe(p);
    return s === 0 ? 'agotado' : s <= m ? 'pocas' : 'disponible';
  };

  /* ---------- Navegación ---------- */
  const PANELES = ['resumen', 'productos', 'pedidos', 'cotizaciones', 'mensajes', 'resenas', 'ajustes'];
  const CARGAR = {
    resumen: () => cargarResumen(),
    productos: () => cargarProductos(),
    pedidos: () => cargarPedidos(),
    cotizaciones: () => cargarCotizaciones(),
    mensajes: () => cargarMensajes(),
    resenas: () => cargarResenas(),
    ajustes: () => cargarAjustes()
  };

  const mostrarPanel = (nombre, { empujar = true } = {}) => {
    if (!PANELES.includes(nombre)) nombre = 'resumen';
    PANELES.forEach((p) => { $(`#panel-${p}`).hidden = p !== nombre; });
    $$('.a-nav-item').forEach((b) => {
      if (b.dataset.panel === nombre) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });
    // En el celular el menú es una fila que se desliza: centro la sección activa
    const nav = $('.a-nav');
    const activo = $('.a-nav-item[aria-current]');
    if (nav.scrollWidth > nav.clientWidth && activo) {
      nav.scrollTo({ left: activo.offsetLeft - nav.offsetLeft - (nav.clientWidth - activo.offsetWidth) / 2, behavior: empujar ? 'smooth' : 'auto' });
    }
    if (empujar && location.hash !== `#${nombre}`) history.replaceState(null, '', `#${nombre}`);
    CARGAR[nombre]();
    window.scrollTo({ top: 0 });
  };

  const panelActual = () => PANELES.find((p) => !$(`#panel-${p}`).hidden) || 'resumen';

  /* ---------- Contadores del menú ---------- */
  const pintarContador = (id, n) => {
    const el = $(id);
    el.textContent = n;
    el.hidden = !n;
  };

  /* ---------- Resumen ---------- */
  const cargarResumen = async () => {
    $('#resumen-fecha').textContent = new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    $('#resumen-pedidos').innerHTML = cargando(3);
    $('#resumen-mensajes').innerHTML = cargando(3);

    const [pedidosR, productosR, mensajesR] = await Promise.all([
      db.from('pedidos').select('id, estado, total, created_at, contacto_nombre, clientes (nombre, email)').order('created_at', { ascending: false }).limit(300),
      db.from('productos').select('id, activo, colecciones (activa), inventario (stock_actual, stock_minimo)'),
      db.from('contactos').select('id, nombre, email, mensaje, created_at').eq('respondido', false).order('created_at', { ascending: false })
    ]);

    if (pedidosR.error || productosR.error || mensajesR.error) {
      $('#resumen-cifras').innerHTML = vacio('No pude cargar el resumen.', ' Revisa tu conexión y dale Actualizar.');
      return;
    }

    const pedidos = pedidosR.data;
    const inicioMes = new Date(); inicioMes.setDate(1); inicioMes.setHours(0, 0, 0, 0);
    const cobrados = pedidos.filter((p) => ['pagado', 'en_produccion', 'enviado', 'entregado'].includes(p.estado));
    const delMes = cobrados.filter((p) => new Date(p.created_at) >= inicioMes);
    const porPreparar = pedidos.filter((p) => ['pagado', 'en_produccion'].includes(p.estado)).length;
    const enTienda = productosR.data.filter((p) => p.activo && p.colecciones?.activa);
    const agotados = enTienda.filter((p) => stockDe(p) === 0).length;
    const mensajes = mensajesR.data;

    pintarContador('#contador-pedidos', porPreparar);
    pintarContador('#contador-mensajes', mensajes.length);

    $('#resumen-cifras').innerHTML = `
      <button type="button" class="a-cifra" data-ir="pedidos" data-filtro="pagado" style="--color-bloque: var(--ocre); --color-bloque-texto: var(--tinta)">
        <span class="a-cifra-etiqueta">Por preparar</span>
        <span class="a-cifra-valor">${porPreparar}</span>
        <span class="a-cifra-nota">Pagados o en producción</span>
      </button>
      <div class="a-cifra a-cifra--oscura">
        <span class="a-cifra-etiqueta">Ventas del mes</span>
        <span class="a-cifra-valor">${dinero(delMes.reduce((s, p) => s + Number(p.total), 0))}</span>
        <span class="a-cifra-nota">${delMes.length} ${delMes.length === 1 ? 'pedido cobrado' : 'pedidos cobrados'}</span>
      </div>
      <button type="button" class="a-cifra" data-ir="productos" style="--color-bloque: var(--bermellon)">
        <span class="a-cifra-etiqueta">Agotados</span>
        <span class="a-cifra-valor">${agotados}</span>
        <span class="a-cifra-nota">de ${enTienda.length} en la tienda</span>
      </button>
      <button type="button" class="a-cifra" data-ir="mensajes" style="--color-bloque: var(--pino)">
        <span class="a-cifra-etiqueta">Mensajes</span>
        <span class="a-cifra-valor">${mensajes.length}</span>
        <span class="a-cifra-nota">Sin responder</span>
      </button>`;

    $('#resumen-pedidos').innerHTML = pedidos.length
      ? pedidos.slice(0, 6).map((p) => `
          <div class="a-fila">
            <div class="a-fila-principal">
              <strong>${escHTML(p.contacto_nombre || p.clientes?.nombre || 'Invitado')}</strong>
              <span class="mono">#${escHTML(p.id.slice(0, 8).toUpperCase())} · ${fecha(p.created_at)}</span>
            </div>
            <span class="mono">${dinero(p.total)}</span>
            <span class="a-estado" data-estado="${escHTML(p.estado)}">${escHTML(ESTADOS[p.estado] || p.estado)}</span>
          </div>`).join('')
      : vacio('Todavía no hay pedidos.', ' Aquí vas a ver los últimos en cuanto alguien compre.');

    $('#resumen-mensajes').innerHTML = mensajes.length
      ? mensajes.slice(0, 5).map((m) => `
          <div class="a-fila">
            <div class="a-fila-principal">
              <strong>${escHTML(m.nombre)}</strong>
              <span>${escHTML(m.mensaje)}</span>
            </div>
            <span class="mono a-tenue">${fecha(m.created_at, false)}</span>
          </div>`).join('')
      : vacio('Nada pendiente.', ' Todos los mensajes están respondidos.');
  };

  /* ---------- Productos ---------- */
  const cargarCategorias = async () => {
    if (estado.categorias.length) return;
    const { data, error } = await db.from('colecciones').select('id, nombre').eq('activa', true).order('nombre');
    if (error) { toast('No pude cargar las categorías', 'error'); return; }
    estado.categorias = data;
    const opciones = data.map((c) => `<option value="${escHTML(c.id)}">${escHTML(c.nombre)}</option>`).join('');
    $('#productos-categoria').insertAdjacentHTML('beforeend', opciones);
    $('#ed-categoria').innerHTML = '<option value="">Elige una</option>' + opciones;
  };

  const cargarProductos = async () => {
    $('#productos-lista').innerHTML = cargando(5);
    await cargarCategorias();
    const { data, error } = await db
      .from('productos')
      .select('id, nombre, descripcion, precio, imagen_url, imagenes, materiales, dimensiones, acabado, destacado, nuevo, activo, coleccion_id, created_at, colecciones (nombre, activa), inventario (stock_actual, stock_minimo)')
      .order('created_at', { ascending: false });

    if (error) {
      $('#productos-lista').innerHTML = vacio('No pude cargar los productos.', ' ¿Ya corriste sql/07_admin_productos.sql en Supabase?');
      return;
    }
    // Los productos de categorías apagadas (el catálogo viejo) no se muestran
    estado.productos = data.filter((p) => p.colecciones?.activa);
    pintarProductos();
  };

  const productosFiltrados = () => {
    const texto = $('#productos-buscar').value.trim().toLowerCase();
    const cat = $('#productos-categoria').value;
    return estado.productos.filter((p) =>
      (!texto || p.nombre.toLowerCase().includes(texto)) &&
      (!cat || p.coleccion_id === cat) &&
      (estado.filtroVis === 'todos' || (estado.filtroVis === 'visibles') === p.activo));
  };

  const miniatura = (p) => {
    const foto = p.imagenes?.[0] || p.imagen_url;
    const cat = p.colecciones?.nombre || '';
    return `<div class="a-miniatura" data-cat="${escHTML(cat)}">${foto
      ? `<img src="${escHTML(foto)}" alt="" loading="lazy" />`
      : escHTML(p.nombre.charAt(0).toUpperCase())}</div>`;
  };

  const pintarProductos = () => {
    const lista = productosFiltrados();
    const visibles = estado.productos.filter((p) => p.activo).length;
    $('#productos-conteo').textContent = `${estado.productos.length} productos · ${visibles} en la tienda`;

    if (!estado.productos.length) {
      $('#productos-lista').innerHTML = vacio('Aún no hay productos.', ' Crea el primero con “Nuevo producto”.');
      return;
    }
    if (!lista.length) {
      $('#productos-lista').innerHTML = vacio('Nada coincide con el filtro.', '');
      return;
    }

    $('#productos-lista').innerHTML = lista.map((p) => {
      const est = estadoStock(p);
      return `
        <div class="a-producto ${p.activo ? '' : 'oculto'}" data-id="${escHTML(p.id)}">
          ${miniatura(p)}
          <div class="a-producto-nombre">
            <button type="button" data-editar="${escHTML(p.id)}">${escHTML(p.nombre)}</button>
            <span>${escHTML(p.dimensiones || 'Sin medidas')}</span>
            ${!p.activo ? '<span class="a-estado" data-estado="oculto">Oculto</span>'
              : est !== 'disponible' ? `<span class="a-estado" data-estado="${est}">${est === 'agotado' ? 'Agotado' : 'Pocas piezas'}</span>` : ''}
          </div>
          <div><span class="a-cat" data-cat="${escHTML(p.colecciones?.nombre || '')}">${escHTML(p.colecciones?.nombre || '—')}</span></div>
          <div><span class="a-celda-etiqueta">Precio</span><span class="a-precio">${dinero(p.precio)}</span></div>
          <div>
            <span class="a-celda-etiqueta">Stock</span>
            <div class="a-stock" data-stock="${escHTML(p.id)}">
              <button type="button" data-delta="-1" aria-label="Quitar una pieza de ${escHTML(p.nombre)}">−</button>
              <input type="number" min="0" step="1" inputmode="numeric" value="${stockDe(p)}" aria-label="Stock de ${escHTML(p.nombre)}" />
              <button type="button" data-delta="1" aria-label="Agregar una pieza a ${escHTML(p.nombre)}">+</button>
            </div>
          </div>
          <label class="a-switch" title="${p.activo ? 'Visible en la tienda' : 'Oculto'}">
            <input type="checkbox" data-visible="${escHTML(p.id)}" ${p.activo ? 'checked' : ''} aria-label="Mostrar ${escHTML(p.nombre)} en la tienda" />
          </label>
          <button type="button" class="a-btn a-btn-chico" data-editar="${escHTML(p.id)}" aria-label="Editar ${escHTML(p.nombre)}">Editar</button>
        </div>`;
    }).join('');
  };

  // Guardo el stock un momento después del último clic para no mandar una petición por clic
  const temporizadoresStock = new Map();
  const programarStock = (id, caja) => {
    clearTimeout(temporizadoresStock.get(id));
    temporizadoresStock.set(id, setTimeout(() => guardarStock(id, caja), 600));
  };

  const guardarStock = async (id, caja) => {
    const input = $('input', caja);
    const valor = parseInt(input.value, 10);
    if (Number.isNaN(valor) || valor < 0) { toast('El stock debe ser 0 o más', 'error'); return; }
    caja.classList.add('guardando');
    const { error } = await SupabaseDB.actualizarStock(id, valor);
    caja.classList.remove('guardando');
    const p = estado.productos.find((x) => x.id === id);
    if (error) {
      toast('No se guardó el stock', 'error');
      if (p) input.value = stockDe(p);
      return;
    }
    if (p) {
      const inv = inventarioDe(p);
      inv.stock_actual = valor;
      if (!p.inventario || Array.isArray(p.inventario)) p.inventario = inv;
    }
    toast(`Stock de ${p?.nombre || 'producto'}: ${valor}`);
  };

  const cambiarVisible = async (id, visible, check) => {
    const { error } = await SupabaseDB.actualizarProducto(id, { activo: visible });
    const p = estado.productos.find((x) => x.id === id);
    if (error) { check.checked = !visible; toast('No se pudo cambiar', 'error'); return; }
    if (p) p.activo = visible;
    pintarProductos();
    toast(visible ? `${p?.nombre} ya se ve en la tienda` : `${p?.nombre} quedó oculto`);
  };

  /* ---------- Editor de producto ---------- */
  const abrirEditor = async (id = null) => {
    await cargarCategorias();
    const p = id ? estado.productos.find((x) => x.id === id) : null;
    if (id && !p) return;

    estado.editor = {
      id: p?.id || crypto.randomUUID(),
      nuevo: !p,
      fotos: [...(p?.imagenes?.length ? p.imagenes : p?.imagen_url ? [p.imagen_url] : [])],
      originales: [...(p?.imagenes || [])],
      subidas: [],   // fotos subidas en esta edición (se borran si cancelo)
      subiendo: 0,
      origenFoco: document.activeElement
    };

    $('#editor-titulo').textContent = p ? 'Editar producto' : 'Nuevo producto';
    $('#ed-nombre').value = p?.nombre || '';
    $('#ed-categoria').value = p?.coleccion_id || $('#productos-categoria').value || '';
    $('#ed-precio').value = p ? Number(p.precio) : '';
    $('#ed-descripcion').value = p?.descripcion || '';
    $('#ed-dimensiones').value = p?.dimensiones || '';
    $('#ed-acabado').value = p?.acabado || '';
    $('#ed-materiales').value = (p?.materiales || []).join(', ');
    $('#ed-stock').value = p ? stockDe(p) : 0;
    $('#ed-activo').checked = p ? p.activo : true;
    $('#ed-destacado').checked = !!p?.destacado;
    $('#ed-nuevo').checked = p ? !!p.nuevo : true;
    $('#ed-eliminar').hidden = !p;
    $$('#editor [aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'));
    mostrarErrorEditor('');
    pintarFotos();

    const editor = $('#editor');
    const velo = $('#editor-velo');
    editor.hidden = false;
    velo.hidden = false;
    document.body.style.overflow = 'hidden';
    $('.a-editor-cuerpo').scrollTop = 0;
    requestAnimationFrame(() => {
      editor.classList.add('abierto');
      velo.classList.add('visible');
      $('#ed-nombre').focus({ preventScroll: true });
    });
  };

  const cerrarEditor = async ({ guardado = false } = {}) => {
    const ed = estado.editor;
    if (!ed) return;
    if (!guardado && ed.subiendo) { toast('Espera a que terminen de subir las fotos', 'error'); return; }
    // Fotos que subí pero no quedaron guardadas: las borro del almacenamiento
    if (!guardado && ed.subidas.length) borrarArchivos(ed.subidas);
    estado.editor = null;
    $('#editor').classList.remove('abierto');
    $('#editor-velo').classList.remove('visible');
    document.body.style.overflow = '';
    setTimeout(() => { $('#editor').hidden = true; $('#editor-velo').hidden = true; }, 350);
    ed.origenFoco?.focus?.({ preventScroll: true });
  };

  const mostrarErrorEditor = (texto) => {
    const el = $('#editor-error');
    el.textContent = texto;
    el.hidden = !texto;
  };

  const pintarFotos = () => {
    const ed = estado.editor;
    const total = ed.fotos.length;
    $('#editor-fotos').innerHTML = ed.fotos.map((url, i) => `
      <div class="a-foto">
        <img src="${escHTML(url)}" alt="Foto ${i + 1}" />
        ${i === 0 ? '<span class="a-foto-principal">Principal</span>' : ''}
        <div class="a-foto-acciones">
          <button type="button" data-mover="${i}" data-dir="-1" ${i === 0 ? 'disabled' : ''} aria-label="Mover foto ${i + 1} a la izquierda">←</button>
          <button type="button" data-mover="${i}" data-dir="1" ${i === total - 1 ? 'disabled' : ''} aria-label="Mover foto ${i + 1} a la derecha">→</button>
          <button type="button" class="quitar" data-quitar="${i}" aria-label="Quitar foto ${i + 1}">✕</button>
        </div>
      </div>`).join('') +
      '<div class="a-foto subiendo"></div>'.repeat(ed.subiendo) + `
      <label class="a-subir" id="zona-subir">
        <strong>+</strong>
        Agregar fotos
        <input type="file" id="ed-archivos" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" multiple />
      </label>`;
  };

  // Reduzco la foto en el navegador: sube rápido y la tienda carga ligera
  const prepararFoto = async (archivo) => {
    let bitmap;
    try {
      bitmap = await createImageBitmap(archivo);
    } catch {
      throw new Error(`No pude leer “${archivo.name}”. Usa JPG, PNG o WebP.`);
    }
    const escala = Math.min(1, LADO_MAX_FOTO / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * escala);
    canvas.height = Math.round(bitmap.height * escala);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const aBlob = (tipo, q) => new Promise((ok) => canvas.toBlob(ok, tipo, q));
    let blob = await aBlob('image/webp', 0.85);
    if (!blob || blob.type !== 'image/webp') blob = await aBlob('image/jpeg', 0.86);
    if (!blob) throw new Error(`No pude procesar “${archivo.name}”.`);
    return blob;
  };

  const subirFotos = async (archivos) => {
    const ed = estado.editor;
    if (!ed || !archivos.length) return;
    mostrarErrorEditor('');
    ed.subiendo += archivos.length;
    pintarFotos();

    for (const archivo of archivos) {
      try {
        const blob = await prepararFoto(archivo);
        const ext = blob.type === 'image/webp' ? 'webp' : 'jpg';
        const ruta = `${ed.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error } = await db.storage.from(BUCKET).upload(ruta, blob, { contentType: blob.type, cacheControl: '31536000', upsert: false });
        if (error) throw new Error('No se pudo subir la foto. ' + (error.message || ''));
        if (estado.editor !== ed) { borrarArchivos([ruta]); return; }
        const { data } = db.storage.from(BUCKET).getPublicUrl(ruta);
        ed.fotos.push(data.publicUrl);
        ed.subidas.push(ruta);
      } catch (err) {
        if (estado.editor === ed) mostrarErrorEditor(err.message);
      } finally {
        if (estado.editor === ed) { ed.subiendo -= 1; pintarFotos(); }
      }
    }
  };

  // De una URL pública saco la ruta dentro del bucket (solo si es nuestra)
  const rutaDeUrl = (url) => {
    const marca = `/storage/v1/object/public/${BUCKET}/`;
    const i = url.indexOf(marca);
    return i === -1 ? null : decodeURIComponent(url.slice(i + marca.length));
  };

  const borrarArchivos = async (rutas) => {
    const limpias = rutas.filter(Boolean);
    if (!limpias.length) return;
    const { error } = await db.storage.from(BUCKET).remove(limpias);
    if (error) console.warn('No se borraron fotos viejas:', error.message);
  };

  const leerFormulario = () => {
    const campos = {
      nombre: $('#ed-nombre').value.trim(),
      coleccion_id: $('#ed-categoria').value,
      precio: parseFloat($('#ed-precio').value),
      descripcion: $('#ed-descripcion').value.trim() || null,
      dimensiones: $('#ed-dimensiones').value.trim() || null,
      acabado: $('#ed-acabado').value.trim() || null,
      materiales: $('#ed-materiales').value.split(',').map((s) => s.trim()).filter(Boolean),
      activo: $('#ed-activo').checked,
      destacado: $('#ed-destacado').checked,
      nuevo: $('#ed-nuevo').checked
    };
    const stock = parseInt($('#ed-stock').value || '0', 10);

    const errores = [];
    const marcar = (sel, mal) => { if (mal) $(sel).setAttribute('aria-invalid', 'true'); else $(sel).removeAttribute('aria-invalid'); };
    marcar('#ed-nombre', !campos.nombre);
    marcar('#ed-categoria', !campos.coleccion_id);
    marcar('#ed-precio', !(campos.precio >= 0));
    marcar('#ed-stock', !(stock >= 0));
    if (!campos.nombre) errores.push('el nombre');
    if (!campos.coleccion_id) errores.push('la categoría');
    if (!(campos.precio >= 0)) errores.push('el precio');
    if (!(stock >= 0)) errores.push('el stock (0 o más)');

    return { campos, stock, errores };
  };

  const guardarProducto = async (e) => {
    e.preventDefault();
    const ed = estado.editor;
    if (!ed) return;
    if (ed.subiendo) { mostrarErrorEditor('Espera a que terminen de subir las fotos.'); return; }

    const { campos, stock, errores } = leerFormulario();
    if (errores.length) {
      mostrarErrorEditor(`Falta ${errores.join(', ')}.`);
      $('#editor [aria-invalid="true"]')?.focus();
      return;
    }
    if (campos.activo && campos.precio === 0) {
      mostrarErrorEditor('Un producto visible no puede costar $0. Ponle precio u ocúltalo.');
      $('#ed-precio').focus();
      return;
    }

    campos.imagenes = ed.fotos;
    campos.imagen_url = ed.fotos[0] || null;

    const btn = $('#ed-guardar');
    btn.disabled = true;
    btn.textContent = 'Guardando…';
    mostrarErrorEditor('');

    const res = ed.nuevo
      ? await db.from('productos').insert({ id: ed.id, ...campos }).select('id')
      : await SupabaseDB.actualizarProducto(ed.id, campos);

    let errorStock = null;
    if (!res.error) {
      const previo = estado.productos.find((x) => x.id === ed.id);
      if (ed.nuevo || stockDe(previo) !== stock) {
        ({ error: errorStock } = await SupabaseDB.actualizarStock(ed.id, stock));
      }
    }

    btn.disabled = false;
    btn.textContent = 'Guardar';

    if (res.error) {
      mostrarErrorEditor('No se pudo guardar. ' + (res.error.message || 'Inténtalo otra vez.'));
      return;
    }

    // Fotos que quité y ya estaban guardadas: ya no las usa nadie
    const quitadas = ed.originales.filter((u) => !ed.fotos.includes(u)).map(rutaDeUrl);
    borrarArchivos(quitadas);

    toast(errorStock
      ? 'Producto guardado, pero el stock no. Ajústalo en la lista.'
      : ed.nuevo ? `${campos.nombre} creado` : 'Cambios guardados', errorStock ? 'error' : 'ok');
    await cerrarEditor({ guardado: true });
    cargarProductos();
  };

  const eliminarProducto = async () => {
    const ed = estado.editor;
    const p = ed && estado.productos.find((x) => x.id === ed.id);
    if (!p) return;
    if (!confirm(`¿Borrar “${p.nombre}” para siempre? Esto no se puede deshacer.\n\nSi solo quieres quitarlo de la tienda, mejor apaga “Visible en la tienda”.`)) return;

    const { error } = await db.from('productos').delete().eq('id', p.id);
    if (error) {
      mostrarErrorEditor(error.code === '23503'
        ? 'Este producto ya tiene pedidos, así que no se puede borrar. Apaga “Visible en la tienda” para quitarlo.'
        : 'No se pudo borrar. ' + (error.message || ''));
      return;
    }
    borrarArchivos([...new Set([...ed.originales, ...ed.fotos])].map(rutaDeUrl));
    toast(`${p.nombre} borrado`);
    await cerrarEditor({ guardado: true });
    cargarProductos();
  };

  /* ---------- Pedidos ---------- */
  const cargarPedidos = async () => {
    const lista = $('#pedidos-lista');
    lista.innerHTML = cargando(3);
    const { data, error } = await SupabaseDB.obtenerPedidos(estado.filtroPedidos || null);
    if (error) { lista.innerHTML = vacio('No pude cargar los pedidos.', ' Inténtalo otra vez.'); return; }

    $('#pedidos-conteo').textContent = `${data.length} ${data.length === 1 ? 'pedido' : 'pedidos'}${estado.filtroPedidos ? ' · ' + ESTADOS[estado.filtroPedidos].toLowerCase() : ''}`;
    if (!data.length) { lista.innerHTML = vacio('No hay pedidos aquí.', ''); return; }

    lista.innerHTML = data.map((p) => {
      const nombre = p.contacto_nombre || p.clientes?.nombre || 'Invitado';
      const items = (p.pedido_items || []).map((it) => `
        <li><span>${it.cantidad} × ${escHTML(it.productos?.nombre || it.concepto || 'Producto')}</span><span class="mono">${dinero(it.precio_unitario * it.cantidad)}</span></li>`).join('');
      return `
        <article class="a-tarjeta" style="--color-tarjeta: ${COLOR_ESTADO[p.estado] || 'var(--a-linea-2)'}">
          <div class="a-tarjeta-cabeza">
            <h3>${escHTML(nombre)}</h3>
            <span class="mono">#${escHTML(p.id.slice(0, 8).toUpperCase())} · ${fecha(p.created_at)}</span>
            <label class="a-pedido-estado a-empuja">
              <select class="a-input" data-pedido="${escHTML(p.id)}" aria-label="Estado del pedido de ${escHTML(nombre)}">
                ${Object.entries(ESTADOS).map(([v, t]) => `<option value="${v}" ${p.estado === v ? 'selected' : ''}>${t}</option>`).join('')}
              </select>
            </label>
          </div>
          <div class="a-pedido-cuerpo">
            <div>
              <p>${escHTML(p.clientes?.email || '')}</p>
              <p>${escHTML(p.contacto_telefono || p.clientes?.telefono || '')}</p>
              <p class="a-tenue">${escHTML(p.direccion_envio || 'Sin dirección')}</p>
            </div>
            <div>
              <ul class="a-items">${items || '<li class="a-tenue">Sin productos</li>'}</ul>
              ${Number(p.costo_envio) > 0 ? `<div class="a-pedido-envio"><span>Envío</span><span class="mono">${dinero(p.costo_envio)}</span></div>` : ''}
              ${Number(p.descuento_monedero) > 0 ? `<div class="a-pedido-envio"><span>Monedero</span><span class="mono">−${dinero(p.descuento_monedero)}</span></div>` : ''}
              <div class="a-pedido-total"><span>Total</span><span class="mono">${dinero(p.total)}</span></div>
              ${Number(p.iva_incluido) > 0 ? `<div class="a-pedido-envio a-tenue"><span>IVA incluido</span><span class="mono">${dinero(p.iva_incluido)}</span></div>` : ''}
              ${p.cotizacion_id ? '<div class="a-pedido-envio a-tenue"><span>Cotización a medida</span><span></span></div>' : ''}
            </div>
            ${p.notas ? `<p class="a-nota">${escHTML(p.notas)}</p>` : ''}
            ${formularioGuia(p)}
          </div>
        </article>`;
    }).join('');
  };

  /* ---------- Guía de envío ---------- */
  const PAQUETERIAS = ['Estafeta', 'FedEx', 'DHL', 'Paquetexpress', 'J&T Express', '99minutos', 'Redpack', 'Otra'];

  // Rastreo directo para las paqueterías con enlace estable; las demás se pegan a mano
  const rastreoDe = (paqueteria, guia) => {
    const g = encodeURIComponent(guia);
    if (paqueteria === 'DHL') return `https://www.dhl.com/mx-es/home/rastreo.html?tracking-id=${g}&submit=1`;
    if (paqueteria === 'FedEx') return `https://www.fedex.com/fedextrack/?trknbr=${g}`;
    return '';
  };

  const formularioGuia = (p) => {
    if (!['pagado', 'en_produccion', 'enviado', 'entregado'].includes(p.estado)) return '';
    const yaEnviado = ['enviado', 'entregado'].includes(p.estado) && p.numero_guia;
    const avisos = [
      p.correo_pago_at ? `Correo de pago: ${fecha(p.correo_pago_at)}` : 'Correo de pago: no enviado',
      p.correo_envio_at ? `Correo de envío: ${fecha(p.correo_envio_at)}` : 'Correo de envío: no enviado',
    ].join(' · ');
    return `
      <form class="a-guia" data-guia="${escHTML(p.id)}" novalidate>
        <label class="a-campo">
          <span class="a-label">Paquetería</span>
          <select class="a-input" name="paqueteria">
            ${PAQUETERIAS.map((n) => `<option ${p.paqueteria === n ? 'selected' : ''}>${n}</option>`).join('')}
          </select>
        </label>
        <label class="a-campo">
          <span class="a-label">Número de guía</span>
          <input class="a-input mono" name="guia" maxlength="60" autocomplete="off" value="${escHTML(p.numero_guia || '')}">
        </label>
        <label class="a-campo a-guia-url">
          <span class="a-label">Enlace de rastreo</span>
          <input class="a-input" name="url" type="url" maxlength="500" placeholder="https://  (DHL y FedEx se llenan solos)" value="${escHTML(p.url_rastreo || '')}">
        </label>
        <button type="submit" class="a-btn a-btn-primario a-btn-chico">${yaEnviado ? 'Guardar y reenviar correo' : 'Marcar enviado y avisar'}</button>
        <p class="a-ayuda a-guia-avisos">${avisos}</p>
      </form>`;
  };

  const guardarGuia = async (form) => {
    const id = form.dataset.guia;
    const paqueteria = form.paqueteria.value;
    const guia = form.guia.value.trim();
    let url = form.url.value.trim();

    form.guia.setAttribute('aria-invalid', String(!guia));
    if (!guia) { form.guia.focus(); toast('Escribe el número de guía', 'error'); return; }
    if (!url) url = rastreoDe(paqueteria, guia);
    const urlValida = !url || /^https:\/\/\S+$/.test(url);
    form.url.setAttribute('aria-invalid', String(!urlValida));
    if (!urlValida) { form.url.focus(); toast('El enlace debe empezar con https://', 'error'); return; }

    const boton = form.querySelector('button');
    boton.disabled = true;

    // Lo entregado se queda entregado; lo demás pasa a enviado
    const { data: actual } = await db.from('pedidos').select('estado, enviado_at').eq('id', id).single();
    const cambios = { paqueteria, numero_guia: guia, url_rastreo: url || null };
    if (actual?.estado !== 'entregado') cambios.estado = 'enviado';
    if (!actual?.enviado_at) cambios.enviado_at = new Date().toISOString();

    const { error } = await db.from('pedidos').update(cambios).eq('id', id);
    if (error) { boton.disabled = false; toast('No se pudo guardar la guía', 'error'); return; }

    const { data: aviso, error: errorCorreo } = await db.functions.invoke('aviso-envio', { body: { pedido_id: id } });
    boton.disabled = false;
    if (errorCorreo || !aviso?.ok) {
      toast('Guía guardada, pero no se pudo mandar el correo', 'error');
    } else {
      toast(`Guía guardada y correo enviado a ${aviso.para}`);
    }
    cargarPedidos();
  };

  const cambiarEstadoPedido = async (select) => {
    const nuevo = select.value;
    if (nuevo === 'cancelado' && !confirm('¿Marcar este pedido como cancelado?\n\nOjo: esto no devuelve el dinero. El reembolso se hace en Mercado Pago, y al hacerlo el pedido se cancela solo y el stock regresa.')) {
      cargarPedidos();
      return;
    }
    select.disabled = true;
    const { error } = await SupabaseDB.actualizarEstadoPedido(select.dataset.pedido, nuevo);
    select.disabled = false;
    if (error) { toast('No se pudo cambiar el estado', 'error'); cargarPedidos(); return; }
    select.closest('.a-tarjeta').style.setProperty('--color-tarjeta', COLOR_ESTADO[nuevo]);
    toast(`Pedido: ${ESTADOS[nuevo]}`);
  };

  /* ---------- Mensajes ---------- */
  const cargarMensajes = async () => {
    const lista = $('#mensajes-lista');
    lista.innerHTML = cargando(3);
    const { data, error } = await db.from('contactos').select('*')
      .eq('respondido', estado.filtroRespondidos)
      .order('created_at', { ascending: false });
    if (error) { lista.innerHTML = vacio('No pude cargar los mensajes.', ''); return; }
    if (!estado.filtroRespondidos) pintarContador('#contador-mensajes', data.length);
    if (!data.length) {
      lista.innerHTML = vacio(estado.filtroRespondidos ? 'Aún no hay mensajes respondidos.' : 'Nada pendiente.', '');
      return;
    }

    lista.innerHTML = data.map((m) => `
      <article class="a-tarjeta" id="mensaje-${escHTML(m.id)}" style="--color-tarjeta: ${m.respondido ? 'var(--a-linea-2)' : 'var(--pino)'}">
        <div class="a-tarjeta-cabeza">
          <h3>${escHTML(m.nombre)}</h3>
          <a class="mono" href="mailto:${escHTML(m.email)}">${escHTML(m.email)}</a>
          <span class="a-estado a-empuja">${escHTML(TIPOS_CONSULTA[m.tipo_consulta] || m.tipo_consulta || 'Otro')}</span>
          <span class="mono">${fecha(m.created_at)}</span>
        </div>
        <p class="a-mensaje">${escHTML(m.mensaje)}</p>
        ${m.notas_admin ? `<p class="a-ayuda">Nota: ${escHTML(m.notas_admin)}</p>` : ''}
        ${m.respondido ? '' : `
          <div class="a-mensaje-acciones">
            <a class="a-btn a-btn-chico" href="mailto:${escHTML(m.email)}?subject=${encodeURIComponent('Re: tu mensaje a Kinara')}">Responder por correo</a>
            <input class="a-input" id="nota-${escHTML(m.id)}" placeholder="Nota interna (opcional)" aria-label="Nota interna" />
            <button type="button" class="a-btn a-btn-chico a-btn-primario" data-respondido="${escHTML(m.id)}">Marcar respondido</button>
          </div>`}
      </article>`).join('');
  };

  const marcarRespondido = async (id, btn) => {
    btn.disabled = true;
    const nota = $(`#nota-${CSS.escape(id)}`)?.value.trim() || '';
    const { error } = await SupabaseDB.marcarContactoRespondido(id, nota);
    if (error) { btn.disabled = false; toast('No se pudo marcar', 'error'); return; }
    $(`#mensaje-${CSS.escape(id)}`)?.remove();
    const c = $('#contador-mensajes');
    pintarContador('#contador-mensajes', Math.max(0, (parseInt(c.textContent, 10) || 1) - 1));
    if (!$('#mensajes-lista .a-tarjeta')) $('#mensajes-lista').innerHTML = vacio('Nada pendiente.', '');
    toast('Mensaje marcado como respondido');
  };

  /* ---------- Cotizaciones ---------- */
  const ESTADOS_COT = { nueva: 'Por responder', cotizada: 'Enviada', pagada: 'Pagada', rechazada: 'Rechazada', cancelada: 'Cancelada' };
  const COLOR_COT = { nueva: 'var(--ocre)', cotizada: 'var(--cobalto)', pagada: 'var(--pino)', rechazada: 'var(--bermellon)', cancelada: 'var(--a-linea-2)' };
  const TIPOS_COT = { a_medida: 'Pieza a medida', figura: 'Figura personalizada', volumen: 'Volumen', otro: 'Otro' };

  const leerAjustes = async () => {
    if (estado.ajustes) return estado.ajustes;
    const { data } = await db.from('ajustes_tienda').select('*').maybeSingle();
    estado.ajustes = data || null;
    return estado.ajustes;
  };

  // Envío sugerido con las reglas de la tienda; el admin lo puede cambiar
  const envioSugerido = (piezas) => {
    const a = estado.ajustes;
    if (!a) return 0;
    return piezas >= Number(a.envio_gratis_desde) ? 0 : Number(a.envio_costo);
  };

  const formularioCotizacion = (q) => {
    if (!['nueva', 'cotizada'].includes(q.estado)) return '';
    const diasVigencia = q.vence_at ? Math.max(1, Math.round((new Date(q.vence_at) - Date.now()) / 86400000)) : 15;
    return `
      <form class="a-cotizar" data-cotizar="${escHTML(q.id)}" novalidate>
        <label class="a-campo"><span class="a-label">Cantidad</span>
          <input class="a-input mono" name="cantidad" type="number" min="1" max="1000" step="1" value="${q.cantidad}"></label>
        <label class="a-campo"><span class="a-label">Precio por pieza</span>
          <input class="a-input mono" name="precio" type="number" min="1" step="1" inputmode="decimal" value="${q.precio_unitario ?? ''}" placeholder="0"></label>
        <label class="a-campo"><span class="a-label">Envío</span>
          <input class="a-input mono" name="envio" type="number" min="0" step="1" inputmode="decimal" value="${q.costo_envio ?? ''}" placeholder="Según reglas"></label>
        <label class="a-campo"><span class="a-label">Días de producción</span>
          <input class="a-input mono" name="dias" type="number" min="1" max="120" step="1" value="${q.dias_produccion ?? 5}"></label>
        <label class="a-campo"><span class="a-label">Válida por (días)</span>
          <input class="a-input mono" name="vigencia" type="number" min="1" max="90" step="1" value="${diasVigencia}"></label>
        <label class="a-campo a-cotizar-nota"><span class="a-label">Nota para el cliente <em>(obligatoria si la rechazas)</em></span>
          <textarea class="a-input" name="respuesta" rows="2" maxlength="2000" placeholder="Material, color, acabado, cambios que sugieres…">${escHTML(q.respuesta || '')}</textarea></label>
        <p class="a-ayuda a-cotizar-total" data-total></p>
        <div class="a-cotizar-acciones">
          <button type="button" class="a-btn a-btn-peligro a-btn-chico" data-rechazar>Rechazar</button>
          <button type="submit" class="a-btn a-btn-primario a-btn-chico">${q.estado === 'cotizada' ? 'Actualizar y reenviar' : 'Enviar cotización'}</button>
        </div>
      </form>`;
  };

  const cargarCotizaciones = async () => {
    const lista = $('#cotizaciones-lista');
    lista.innerHTML = cargando(3);
    await leerAjustes();
    let consulta = db.from('cotizaciones').select('*').order('created_at', { ascending: false }).limit(200);
    if (estado.filtroCot) consulta = consulta.eq('estado', estado.filtroCot);
    const { data, error } = await consulta;
    if (error) { lista.innerHTML = vacio('No pude cargar las cotizaciones.', ''); return; }
    if (estado.filtroCot === 'nueva') pintarContador('#contador-cotizaciones', data.length);
    if (!data.length) { lista.innerHTML = vacio(estado.filtroCot === 'nueva' ? 'No hay cotizaciones por responder.' : 'No hay cotizaciones aquí.', ''); return; }

    // Nombre y correo del cliente
    const ids = [...new Set(data.map((q) => q.user_id))];
    const { data: clientes } = await db.from('clientes').select('user_id, nombre, email, telefono').in('user_id', ids);
    const cliente = new Map((clientes || []).map((c) => [c.user_id, c]));

    lista.innerHTML = data.map((q) => {
      const c = cliente.get(q.user_id) || {};
      const vencida = q.estado === 'cotizada' && q.vence_at && new Date(q.vence_at) < new Date();
      const detalles = [
        ['Tipo', TIPOS_COT[q.tipo] || q.tipo], ['Cantidad', q.cantidad], ['Medidas', q.medidas],
        ['Material', q.material || 'Que lo recomendemos'], ['Color', q.color],
      ].filter(([, v]) => v);
      return `
        <article class="a-tarjeta" style="--color-tarjeta: ${COLOR_COT[q.estado]}">
          <div class="a-tarjeta-cabeza">
            <h3>${escHTML(q.titulo)}</h3>
            <span class="mono">#${escHTML(q.id.slice(0, 8).toUpperCase())} · ${fecha(q.created_at)}</span>
            <span class="a-estado a-empuja">${vencida ? 'Vencida' : ESTADOS_COT[q.estado]}</span>
          </div>
          <div class="a-pedido-cuerpo">
            <div>
              <p><strong>${escHTML(c.nombre || 'Cliente')}</strong></p>
              <p><a href="mailto:${escHTML(c.email || '')}">${escHTML(c.email || '')}</a></p>
              <p>${escHTML(c.telefono || '')}</p>
              <dl class="a-detalles">${detalles.map(([k, v]) => `<div><dt>${k}</dt><dd>${escHTML(String(v))}</dd></div>`).join('')}</dl>
            </div>
            <div>
              <p class="a-mensaje">${escHTML(q.descripcion)}</p>
              ${q.archivos?.length ? `<div class="a-archivos">${q.archivos.map((a) => `
                <button type="button" class="a-btn a-btn-chico" data-archivo="${escHTML(a)}">↓ ${escHTML(a.split('/').pop().replace(/^\d+-[a-z0-9]+-/, ''))}</button>`).join('')}</div>`
                : '<p class="a-tenue">Sin archivos</p>'}
              ${q.estado === 'pagada' ? `<p class="a-ayuda">Pagada: ${q.cantidad} × ${dinero(q.precio_unitario)} + envío ${dinero(q.costo_envio)}. Revisa el pedido en Pedidos.</p>` : ''}
              ${q.aviso_cliente_at ? `<p class="a-ayuda">Correo al cliente: ${fecha(q.aviso_cliente_at)}${q.vence_at ? ` · vence ${fecha(q.vence_at, false)}` : ''}</p>` : ''}
              ${q.estado === 'rechazada' && q.respuesta ? `<p class="a-nota">${escHTML(q.respuesta)}</p>` : ''}
            </div>
            ${formularioCotizacion(q)}
          </div>
        </article>`;
    }).join('');
    $$('#cotizaciones-lista [data-cotizar]').forEach(actualizarTotalCotizacion);
  };

  const actualizarTotalCotizacion = (form) => {
    const cantidad = parseInt(form.cantidad.value, 10) || 0;
    const precio = Number(form.precio.value) || 0;
    const piezas = cantidad * precio;
    const envio = form.envio.value === '' ? envioSugerido(piezas) : Number(form.envio.value);
    form.envio.placeholder = String(envioSugerido(piezas));
    $('[data-total]', form).textContent = precio > 0
      ? `Total para el cliente: ${dinero(piezas + envio)} (${cantidad} × ${dinero(precio)} + envío ${envio > 0 ? dinero(envio) : 'gratis'})`
      : 'Escribe el precio por pieza.';
  };

  const responderCotizacion = async (form, rechazar = false) => {
    const id = form.dataset.cotizar;
    const cantidad = parseInt(form.cantidad.value, 10);
    const precio = Number(form.precio.value);
    const dias = parseInt(form.dias.value, 10);
    const vigencia = parseInt(form.vigencia.value, 10);
    const respuesta = form.respuesta.value.trim();
    const piezas = cantidad * precio;
    const envio = form.envio.value === '' ? envioSugerido(piezas) : Number(form.envio.value);

    let cambios;
    if (rechazar) {
      if (!respuesta) { form.respuesta.focus(); toast('Escribe el motivo para el cliente', 'error'); return; }
      if (!confirm('¿Rechazar esta cotización y avisarle al cliente?')) return;
      cambios = { estado: 'rechazada', respuesta };
    } else {
      const errores = [
        [form.cantidad, Number.isInteger(cantidad) && cantidad >= 1 && cantidad <= 1000],
        [form.precio, precio > 0],
        [form.envio, envio >= 0],
        [form.dias, Number.isInteger(dias) && dias >= 1 && dias <= 120],
        [form.vigencia, Number.isInteger(vigencia) && vigencia >= 1 && vigencia <= 90],
      ];
      errores.forEach(([el, ok]) => el.setAttribute('aria-invalid', String(!ok)));
      const malo = errores.find(([, ok]) => !ok);
      if (malo) { malo[0].focus(); toast('Revisa los datos de la cotización', 'error'); return; }
      cambios = {
        estado: 'cotizada', cantidad, precio_unitario: precio, costo_envio: envio, dias_produccion: dias,
        respuesta: respuesta || null, cotizada_at: new Date().toISOString(),
        vence_at: new Date(Date.now() + vigencia * 86400000).toISOString(),
      };
    }

    const botones = $$('button', form);
    botones.forEach((b) => { b.disabled = true; });
    const { error } = await db.from('cotizaciones').update(cambios).eq('id', id).in('estado', ['nueva', 'cotizada']);
    if (error) { botones.forEach((b) => { b.disabled = false; }); toast('No se pudo guardar la cotización', 'error'); return; }

    const { data: aviso, error: errorCorreo } = await db.functions.invoke('aviso-cotizacion', { body: { cotizacion_id: id } });
    if (errorCorreo || !aviso?.ok) toast('Guardada, pero no se pudo mandar el correo', 'error');
    else toast(rechazar ? `Rechazo enviado a ${aviso.para}` : `Cotización enviada a ${aviso.para}`);
    cargarCotizaciones();
  };

  const abrirArchivo = async (boton) => {
    boton.disabled = true;
    const { data, error } = await db.storage.from('cotizaciones').createSignedUrl(boton.dataset.archivo, 600, { download: true });
    boton.disabled = false;
    if (error || !data?.signedUrl) { toast('No se pudo abrir el archivo', 'error'); return; }
    window.open(data.signedUrl, '_blank', 'noopener');
  };

  /* ---------- Reseñas ---------- */
  const estrellas = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);

  const cargarResenas = async () => {
    const lista = $('#resenas-lista');
    lista.innerHTML = cargando(3);
    const { data, error } = await db.from('resenas')
      .select('id, autor, calificacion, titulo, texto, visible, respuesta, created_at, productos (nombre)')
      .order('created_at', { ascending: false }).limit(300);
    if (error) { lista.innerHTML = vacio('No pude cargar las reseñas.', ''); return; }
    if (!data.length) { lista.innerHTML = vacio('Aún no hay reseñas.', ' Los clientes las dejan desde Mis pedidos cuando su pieza ya se envió.'); return; }
    lista.innerHTML = data.map((r) => `
      <article class="a-tarjeta" style="--color-tarjeta: ${r.visible ? 'var(--ocre)' : 'var(--a-linea-2)'}">
        <div class="a-tarjeta-cabeza">
          <h3>${escHTML(r.productos?.nombre || 'Producto')}</h3>
          <span class="a-estrellas" aria-label="${r.calificacion} de 5">${estrellas(r.calificacion)}</span>
          <span class="mono a-empuja">${escHTML(r.autor)} · ${fecha(r.created_at)}</span>
        </div>
        ${r.titulo ? `<p><strong>${escHTML(r.titulo)}</strong></p>` : ''}
        <p class="a-mensaje">${escHTML(r.texto)}</p>
        <div class="a-mensaje-acciones">
          <label class="a-switch a-switch-chico"><input type="checkbox" data-resena-visible="${escHTML(r.id)}" ${r.visible ? 'checked' : ''}>
            <span>Visible en la tienda</span></label>
          <input class="a-input" id="resp-${escHTML(r.id)}" maxlength="1000" placeholder="Respuesta pública (opcional)" value="${escHTML(r.respuesta || '')}" aria-label="Respuesta pública">
          <button type="button" class="a-btn a-btn-chico" data-resena-responder="${escHTML(r.id)}">Guardar respuesta</button>
        </div>
      </article>`).join('');
  };

  const cambiarResena = async (id, cambios, exito) => {
    const { error } = await db.from('resenas').update(cambios).eq('id', id);
    if (error) { toast('No se pudo guardar la reseña', 'error'); cargarResenas(); return; }
    toast(exito);
  };

  /* ---------- Ajustes ---------- */
  const cargarAjustes = async () => {
    estado.ajustes = null;
    const a = await leerAjustes();
    const f = $('#form-ajustes');
    if (!a) { $('#ajustes-error').textContent = 'No pude leer los ajustes.'; $('#ajustes-error').hidden = false; return; }
    f.envio_costo.value = Number(a.envio_costo);
    f.envio_gratis_desde.value = Number(a.envio_gratis_desde);
    f.pedido_minimo.value = Number(a.pedido_minimo);
    f.iva_pct.value = Math.round(Number(a.iva_tasa) * 100);
    f.iva_desglosar.checked = !!a.iva_desglosar;
    f.monedero_pct.value = Number(a.monedero_pct);
    f.monedero_uso_max_pct.value = Number(a.monedero_uso_max_pct);
    f.monedero_vigencia_meses.value = a.monedero_vigencia_meses;
  };

  const guardarAjustes = async (e) => {
    e.preventDefault();
    const f = e.target;
    const num = (n) => Number(f[n].value);
    const cambios = {
      envio_costo: num('envio_costo'), envio_gratis_desde: num('envio_gratis_desde'), pedido_minimo: num('pedido_minimo'),
      iva_tasa: num('iva_pct') / 100, iva_desglosar: f.iva_desglosar.checked,
      monedero_pct: num('monedero_pct'), monedero_uso_max_pct: num('monedero_uso_max_pct'),
      monedero_vigencia_meses: num('monedero_vigencia_meses'), updated_at: new Date().toISOString(),
    };
    const invalido = [...f.querySelectorAll('input[type=number]')].find((i) => i.value === '' || !i.checkValidity());
    $$('input[type=number]', f).forEach((i) => i.setAttribute('aria-invalid', String(i === invalido)));
    const err = $('#ajustes-error');
    if (invalido) { invalido.focus(); err.textContent = 'Revisa el campo marcado.'; err.hidden = false; return; }
    err.hidden = true;
    const boton = $('#ajustes-guardar');
    boton.disabled = true;
    const { error } = await SupabaseDB.cliente.from('ajustes_tienda').update(cambios).eq('id', true).select('id');
    boton.disabled = false;
    if (error) { err.textContent = 'No se pudo guardar. ' + error.message; err.hidden = false; return; }
    estado.ajustes = null;
    toast('Ajustes guardados');
  };

  /* ---------- Eventos ---------- */
  const marcarSegmento = (grupo, boton) => $$('button', grupo).forEach((b) => b.setAttribute('aria-pressed', String(b === boton)));

  const conectarEventos = () => {
    $$('.a-nav-item').forEach((b) => b.addEventListener('click', () => mostrarPanel(b.dataset.panel)));

    document.addEventListener('click', (e) => {
      const ir = e.target.closest('[data-ir]');
      if (ir) {
        if (ir.dataset.filtro !== undefined && ir.dataset.ir === 'pedidos') {
          estado.filtroPedidos = ir.dataset.filtro;
          marcarSegmento($('#pedidos-filtro'), $(`#pedidos-filtro [data-estado="${ir.dataset.filtro}"]`));
        }
        mostrarPanel(ir.dataset.ir);
        return;
      }
      if (e.target.closest('[data-recargar]')) { CARGAR[panelActual()](); return; }

      const editar = e.target.closest('[data-editar]');
      if (editar) { abrirEditor(editar.dataset.editar); return; }

      const delta = e.target.closest('[data-delta]');
      if (delta) {
        const caja = delta.closest('[data-stock]');
        const input = $('input', caja);
        input.value = Math.max(0, (parseInt(input.value, 10) || 0) + Number(delta.dataset.delta));
        programarStock(caja.dataset.stock, caja);
        return;
      }

      const archivo = e.target.closest('[data-archivo]');
      if (archivo) { abrirArchivo(archivo); return; }
      const rechazar = e.target.closest('[data-rechazar]');
      if (rechazar) { responderCotizacion(rechazar.closest('form'), true); return; }
      const responder = e.target.closest('[data-resena-responder]');
      if (responder) {
        const id = responder.dataset.resenaResponder;
        cambiarResena(id, { respuesta: $(`#resp-${CSS.escape(id)}`).value.trim() || null }, 'Respuesta guardada');
        return;
      }

      const respondido = e.target.closest('[data-respondido]');
      if (respondido && respondido.closest('#mensajes-lista')) { marcarRespondido(respondido.dataset.respondido, respondido); return; }

      if (e.target.closest('[data-cerrar-editor]')) { cerrarEditor(); return; }

      const mover = e.target.closest('[data-mover]');
      if (mover && estado.editor) {
        const i = Number(mover.dataset.mover);
        const j = i + Number(mover.dataset.dir);
        const f = estado.editor.fotos;
        if (j >= 0 && j < f.length) { [f[i], f[j]] = [f[j], f[i]]; pintarFotos(); }
        return;
      }
      const quitar = e.target.closest('[data-quitar]');
      if (quitar && estado.editor) {
        estado.editor.fotos.splice(Number(quitar.dataset.quitar), 1);
        pintarFotos();
      }
    });

    document.addEventListener('submit', (e) => {
      const cot = e.target.closest('[data-cotizar]');
      if (cot) { e.preventDefault(); responderCotizacion(cot); return; }
      const form = e.target.closest('[data-guia]');
      if (!form) return;
      e.preventDefault();
      guardarGuia(form);
    });
    document.addEventListener('input', (e) => {
      const cot = e.target.closest('[data-cotizar]');
      if (cot) actualizarTotalCotizacion(cot);
    });
    $('#form-ajustes').addEventListener('submit', guardarAjustes);
    $$('#cotizaciones-filtro button').forEach((b) => b.addEventListener('click', () => {
      estado.filtroCot = b.dataset.cot;
      marcarSegmento(b.parentElement, b);
      cargarCotizaciones();
    }));

    document.addEventListener('change', (e) => {
      if (e.target.matches('[data-stock] input')) {
        const caja = e.target.closest('[data-stock]');
        programarStock(caja.dataset.stock, caja);
      } else if (e.target.matches('[data-visible]')) {
        cambiarVisible(e.target.dataset.visible, e.target.checked, e.target);
      } else if (e.target.matches('[data-resena-visible]')) {
        const v = e.target.checked;
        e.target.closest('.a-tarjeta').style.setProperty('--color-tarjeta', v ? 'var(--ocre)' : 'var(--a-linea-2)');
        cambiarResena(e.target.dataset.resenaVisible, { visible: v }, v ? 'Reseña visible' : 'Reseña oculta');
      } else if (e.target.matches('[data-pedido]')) {
        cambiarEstadoPedido(e.target);
      } else if (e.target.id === 'ed-archivos') {
        subirFotos([...e.target.files]);
        e.target.value = '';
      }
    });

    // Arrastrar fotos sobre el editor
    const editor = $('#editor');
    editor.addEventListener('dragover', (e) => {
      if (!e.dataTransfer?.types.includes('Files')) return;
      e.preventDefault();
      $('#zona-subir')?.classList.add('arrastrando');
    });
    editor.addEventListener('dragleave', (e) => {
      if (!editor.contains(e.relatedTarget)) $('#zona-subir')?.classList.remove('arrastrando');
    });
    editor.addEventListener('drop', (e) => {
      if (!e.dataTransfer?.files.length) return;
      e.preventDefault();
      $('#zona-subir')?.classList.remove('arrastrando');
      subirFotos([...e.dataTransfer.files].filter((f) => f.type.startsWith('image/') || /\.(heic|heif)$/i.test(f.name)));
    });

    editor.addEventListener('submit', guardarProducto);
    $('#ed-eliminar').addEventListener('click', eliminarProducto);
    $('#editor-velo').addEventListener('click', () => cerrarEditor());
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && estado.editor) cerrarEditor(); });

    $('#btn-nuevo').addEventListener('click', () => abrirEditor());
    $('#productos-buscar').addEventListener('input', pintarProductos);
    $('#productos-categoria').addEventListener('change', pintarProductos);
    $$('[data-vis]').forEach((b) => b.addEventListener('click', () => {
      estado.filtroVis = b.dataset.vis;
      marcarSegmento(b.parentElement, b);
      pintarProductos();
    }));

    $$('#pedidos-filtro button').forEach((b) => b.addEventListener('click', () => {
      estado.filtroPedidos = b.dataset.estado;
      marcarSegmento(b.parentElement, b);
      cargarPedidos();
    }));

    $$('#mensajes-filtro button').forEach((b) => b.addEventListener('click', () => {
      estado.filtroRespondidos = b.dataset.respondido === 'true';
      marcarSegmento(b.parentElement, b);
      cargarMensajes();
    }));

    $('#btn-salir').addEventListener('click', async () => {
      await db.auth.signOut();
      location.reload();
    });

    window.addEventListener('hashchange', () => {
      if (!$('#app').hidden && location.hash.slice(1) !== panelActual()) mostrarPanel(location.hash.slice(1), { empujar: false });
    });

    window.addEventListener('beforeunload', (e) => {
      if (estado.editor?.subiendo) e.preventDefault();
    });
  };

  /* ---------- Acceso ---------- */
  const errorAcceso = (t) => { $('#acceso-error').textContent = t; };

  // automatico = revisión al cargar: una sesión de cliente de la tienda
  // no se cierra, solo se pide entrar con la cuenta de admin
  const entrarSiEsAdmin = async (automatico = false) => {
    const { data: esAdmin, error } = await db.rpc('es_admin');
    if (error || esAdmin !== true) {
      if (!automatico) {
        await db.auth.signOut();
        errorAcceso('Esta cuenta no tiene acceso al panel.');
      }
      $('#acceso-email').focus();
      return;
    }
    const { data: { user } } = await db.auth.getUser();
    $('#usuario-email').textContent = user?.email || '';
    $('#acceso').hidden = true;
    $('#app').hidden = false;
    errorAcceso('');
    mostrarPanel(location.hash.slice(1), { empujar: false });
    if (panelActual() !== 'resumen') cargarResumenSilencioso();
  };

  // Los contadores del menú se llenan aunque entre directo a otra sección
  const cargarResumenSilencioso = async () => {
    const [pedidos, mensajes, cotizaciones] = await Promise.all([
      db.from('pedidos').select('id', { count: 'exact', head: true }).in('estado', ['pagado', 'en_produccion']),
      db.from('contactos').select('id', { count: 'exact', head: true }).eq('respondido', false),
      db.from('cotizaciones').select('id', { count: 'exact', head: true }).eq('estado', 'nueva')
    ]);
    pintarContador('#contador-pedidos', pedidos.count || 0);
    pintarContador('#contador-mensajes', mensajes.count || 0);
    pintarContador('#contador-cotizaciones', cotizaciones.count || 0);
  };

  $('#acceso-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = $('#acceso-email').value.trim();
    const password = $('#acceso-password').value;
    if (!email || !password) { errorAcceso('Escribe tu correo y contraseña.'); return; }
    const btn = $('#acceso-btn');
    btn.disabled = true;
    btn.textContent = 'Entrando…';
    errorAcceso('');
    const { error } = await db.auth.signInWithPassword({ email, password });
    if (error) {
      errorAcceso(/confirm/i.test(error.message) ? 'Confirma tu correo antes de entrar.' : 'Correo o contraseña incorrectos.');
    } else {
      $('#acceso-password').value = '';
      await entrarSiEsAdmin();
    }
    btn.disabled = false;
    btn.textContent = 'Entrar';
  });

  conectarEventos();

  (async () => {
    const { data: { session } } = await db.auth.getSession();
    if (session) await entrarSiEsAdmin(true);
    else $('#acceso-email').focus();
  })();
})();
