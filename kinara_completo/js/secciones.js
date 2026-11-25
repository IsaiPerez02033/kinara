/**
 * secciones.js — Secciones del catálogo que se crean desde el admin
 * Las cinco de arranque vienen escritas en index.html (con su foto).
 * Las que se agregan después se leen de la tabla colecciones y se
 * acomodan en el mosaico, en los filtros del catálogo y en el pie.
 * Una sección solo aparece cuando tiene al menos un producto visible.
 */
'use strict';

const ModuloSecciones = (() => {
  const COLORES = ['terracota', 'cobalto', 'salvia', 'bermellon', 'rubor', 'ocre', 'pino'];
  // Sobre estos colores el texto del bloque va claro
  const OSCUROS = ['cobalto', 'bermellon', 'pino'];

  const yaEnPagina = (nombre) =>
    [...document.querySelectorAll('.filtro-btn')].some((b) => b.dataset.coleccion === nombre);

  // Color y tono de texto de cada sección nueva, para tarjetas, detalle y carrito
  const pintarEstilos = (secciones) => {
    const reglas = secciones.map((s) => {
      const sel = `[data-categoria="${CSS.escape(s.nombre)}"]`;
      return `${sel} { --filamento: var(--${s.color}); }` +
        (OSCUROS.includes(s.color) ? `\n.categoria${sel} { --tinta-bloque: var(--hueso); }` : '');
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
    return a;
  };

  const filtrar = (nombre) => { if (typeof ModuloCatalogo !== 'undefined') ModuloCatalogo.activarFiltro(nombre); };

  const agregar = (secciones) => {
    pintarEstilos(secciones);

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

  const iniciar = async () => {
    if (!window.SupabaseDB || !document.querySelector('.filtros-coleccion')) return;
    const db = SupabaseDB.cliente;
    const [secR, prodR] = await Promise.all([
      db.from('colecciones').select('nombre, descripcion, color, orden').eq('activa', true).order('orden').order('nombre'),
      db.from('productos_con_stock').select('coleccion_nombre'),
    ]);
    if (secR.error || prodR.error) return;   // Si falla, se queda lo que trae el HTML

    const conProductos = new Set((prodR.data || []).map((p) => p.coleccion_nombre));
    const nuevas = (secR.data || [])
      .filter((s) => conProductos.has(s.nombre) && !yaEnPagina(s.nombre))
      .map((s, i) => ({ ...s, color: COLORES.includes(s.color) ? s.color : COLORES[i % COLORES.length] }));
    if (nuevas.length) agregar(nuevas);
  };

  return { iniciar };
})();

document.addEventListener('DOMContentLoaded', () => { ModuloSecciones.iniciar(); });
