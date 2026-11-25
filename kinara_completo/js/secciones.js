/**
 * secciones.js — Secciones del catálogo que se crean desde el admin
 * Las cinco de arranque vienen escritas en index.html (con su foto y
 * data-seccion-id); si en el admin les cambian nombre o color, aquí se
 * actualizan.
 * Las que se agregan después se leen de la tabla colecciones y se
 * acomodan en el mosaico, en los filtros del catálogo y en el pie.
 * Una sección solo aparece cuando tiene al menos un producto visible,
 * y las que el admin oculta se quitan también de lo que trae el HTML.
 */
'use strict';

const ModuloSecciones = (() => {
  const COLORES = ['terracota', 'cobalto', 'salvia', 'bermellon', 'rubor', 'ocre', 'pino'];
  // Sobre estos colores el texto del bloque va claro
  const OSCUROS = ['cobalto', 'bermellon', 'pino', 'salvia'];

  const yaEnPagina = (s) =>
    [...document.querySelectorAll('.filtro-btn')].some((b) => b.dataset.coleccion === s.nombre || b.dataset.seccionId === s.id);

  // Color y tono de texto de cada sección, para mosaico, tarjetas, detalle y carrito
  const pintarEstilos = (secciones) => {
    const reglas = secciones.filter((s) => COLORES.includes(s.color)).map((s) => {
      const sel = `[data-categoria="${CSS.escape(s.nombre)}"]`;
      return `${sel} { --filamento: var(--${s.color}); }` +
        `\n.categoria${sel} { --tinta-bloque: var(--${OSCUROS.includes(s.color) ? 'hueso' : 'tinta'}); }`;
    });
    const estilo = document.createElement('style');
    estilo.id = 'estilo-secciones';
    estilo.textContent = reglas.join('\n');
    document.head.append(estilo);
  };

  // En escritorio van de tres en tres; si sobran, los últimos se reparten la fila
  const anchos = (n) => {
    const lista = Array(n).fill(4);
    if (n === 1) return [12];
    if (n % 3 === 2) { lista[n - 1] = 6; lista[n - 2] = 6; }
    if (n % 3 === 1) { lista.fill(6, n - 4); }
    return lista;
  };

  const bloque = (s, ancho, ultimoImpar) => {
    const a = document.createElement('a');
    a.href = '#catalogo';
    a.className = 'categoria categoria-extra cama reveal';
    a.dataset.filtro = s.nombre;
    a.dataset.categoria = s.nombre;
    a.style.setProperty('--ancho', ancho);
    if (ultimoImpar) a.classList.add('categoria-extra-completa');
    a.innerHTML = `<svg class="pieza-svg" viewBox="0 0 120 120" aria-hidden="true"><use href="#pieza-medida"/></svg>
      <h3></h3>${s.descripcion ? '<p></p>' : ''}`;
    a.querySelector('h3').textContent = s.nombre;
    if (s.descripcion) a.querySelector('p').textContent = s.descripcion;
    ponerFoto(a, s);
    return a;
  };

  /* Foto subida desde el admin. Si tiene fondo transparente (lleva "-recorte"
     en el nombre) va como las cinco originales; si no, llena el bloque. */
  const ponerFoto = (bloque, s) => {
    if (!bloque || !s.imagen_url) return;
    const recorte = /-recorte\.\w+(\?|$)/.test(s.imagen_url);
    bloque.querySelectorAll('.pieza-foto, .pieza-svg, .seccion-fondo').forEach((el) => el.remove());
    const img = document.createElement('img');
    img.className = recorte ? 'pieza-foto' : 'seccion-fondo';
    img.src = s.imagen_url;
    img.alt = s.nombre;
    img.loading = 'lazy';
    img.decoding = 'async';
    bloque.classList.toggle('categoria-con-fondo', !recorte);
    bloque.prepend(img);
  };

  const filtrar = (nombre) => { if (typeof ModuloCatalogo !== 'undefined') ModuloCatalogo.activarFiltro(nombre); };

  const agregar = (secciones) => {
    const mosaico = document.querySelector('.categorias-grid');
    const medida = mosaico?.querySelector('.categoria-medida');
    const filtros = document.querySelector('.filtros-coleccion');
    const pie = document.querySelector('.footer-links[aria-label="Categorías"]');
    const lista = anchos(secciones.length);
    const nuevos = [];

    secciones.forEach((s, i) => {
      if (mosaico) {
        const el = bloque(s, lista[i], secciones.length % 2 === 1 && i === secciones.length - 1);
        el.addEventListener('click', () => filtrar(s.nombre));
        mosaico.insertBefore(el, medida);
        nuevos.push(el);
      }
      if (filtros) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'filtro-btn';
        b.dataset.coleccion = s.nombre;
        b.setAttribute('aria-pressed', 'false');
        b.textContent = s.nombre;
        b.addEventListener('click', () => filtrar(s.nombre));
        filtros.append(b);
      }
      if (pie) {
        const l = document.createElement('a');
        l.href = '#catalogo';
        l.className = 'footer-link';
        l.dataset.filtro = s.nombre;
        l.textContent = s.nombre;
        l.addEventListener('click', () => filtrar(s.nombre));
        pie.append(l);
      }
    });

    if (window.Movimiento) Movimiento.revelar(nuevos);
    else nuevos.forEach((el) => el.classList.add('visible'));
  };

  // Las secciones que el admin ocultó salen del mosaico, los filtros y el pie
  const quitar = (ids) => {
    ids.forEach((id) => {
      document.querySelectorAll(`[data-seccion-id="${CSS.escape(id)}"]`).forEach((el) => {
        if (el.matches('[data-filtro], .filtro-btn')) el.remove();
      });
    });
  };

  // Si el admin le cambió el nombre a una de las cinco del HTML
  const renombrar = (s) => {
    document.querySelectorAll(`[data-seccion-id="${CSS.escape(s.id)}"]`).forEach((el) => {
      if (el.dataset.filtro) el.dataset.filtro = s.nombre;
      if (el.dataset.coleccion) el.dataset.coleccion = s.nombre;
      if (el.dataset.categoria) el.dataset.categoria = s.nombre;
      const titulo = el.matches('.categoria') ? el.querySelector('h3') : el.matches('.filtro-btn, .footer-link') ? el : null;
      if (titulo) titulo.textContent = s.nombre;
    });
  };

  // Si falta alguna de las cinco del HTML, el mosaico fijo deja huecos:
  // entonces todos los bloques se reparten en filas parejas
  const reacomodar = () => {
    const mosaico = document.querySelector('.categorias-grid');
    if (!mosaico) return;
    const bloques = [...mosaico.querySelectorAll('.categoria:not(.categoria-medida)')];
    const lista = anchos(bloques.length);
    mosaico.classList.add('reacomodado');
    bloques.forEach((el, i) => {
      el.style.setProperty('--ancho', lista[i]);
      el.classList.toggle('categoria-extra-completa', bloques.length % 2 === 1 && i === bloques.length - 1);
    });
  };

  // Pone filtros, pie y mosaico en el orden elegido en el admin.
  // Si el mosaico cambió de orden, sus bloques se reparten parejos.
  const ordenar = (nombres) => {
    const pos = new Map(nombres.map((n, i) => [n, i]));
    const ordenarHijos = (padre, selector, clave, antesDe = null) => {
      if (!padre) return false;
      const hijos = [...padre.querySelectorAll(selector)];
      const antes = hijos.map(clave).join('|');
      hijos.sort((a, b) => (pos.get(clave(a)) ?? 99) - (pos.get(clave(b)) ?? 99));
      if (hijos.map(clave).join('|') === antes) return false;
      hijos.forEach((h) => padre.insertBefore(h, antesDe));
      return true;
    };
    ordenarHijos(document.querySelector('.filtros-coleccion'), '.filtro-btn:not([data-coleccion="Todos"])', (b) => b.dataset.coleccion);
    ordenarHijos(document.querySelector('.footer-links[aria-label="Categorías"]'), '[data-filtro]', (a) => a.dataset.filtro);
    const mosaico = document.querySelector('.categorias-grid');
    return ordenarHijos(mosaico, '.categoria[data-filtro]', (a) => a.dataset.filtro, mosaico?.querySelector('.categoria-medida'));
  };

  const iniciar = async () => {
    if (!window.SupabaseDB || !document.querySelector('.filtros-coleccion')) return;
    const db = SupabaseDB.cliente;
    const [secR, prodR] = await Promise.all([
      db.from('colecciones').select('id, nombre, descripcion, color, orden, imagen_url').eq('activa', true).order('orden').order('nombre'),
      db.from('productos_con_stock').select('coleccion_nombre'),
    ]);
    if (secR.error || prodR.error) return;   // Si falla, se queda lo que trae el HTML
    const secciones = secR.data || [];

    const activas = new Set(secciones.map((s) => s.id));
    const ocultas = [...new Set([...document.querySelectorAll('[data-seccion-id]')].map((el) => el.dataset.seccionId))]
      .filter((id) => !activas.has(id));
    if (ocultas.length) quitar(ocultas);

    secciones.forEach((s) => {
      renombrar(s);
      ponerFoto(document.querySelector(`.categoria[data-seccion-id="${CSS.escape(s.id)}"]`), s);
    });

    const conProductos = new Set((prodR.data || []).map((p) => p.coleccion_nombre));
    const nuevas = secciones
      .filter((s) => conProductos.has(s.nombre) && !yaEnPagina(s))
      .map((s, i) => ({ ...s, color: COLORES.includes(s.color) ? s.color : COLORES[i % COLORES.length] }));
    pintarEstilos([...secciones.filter((s) => !nuevas.some((n) => n.id === s.id)), ...nuevas]);
    if (nuevas.length) agregar(nuevas);
    const cambioOrden = ordenar(secciones.map((s) => s.nombre));
    if (ocultas.length || cambioOrden) reacomodar();
  };

  return { iniciar };
})();

document.addEventListener('DOMContentLoaded', () => { ModuloSecciones.iniciar(); });
