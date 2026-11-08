/**
 * movimiento.js — Animaciones compartidas de Kinara
 * Todo respeta "reducir movimiento": si el sistema lo pide, los cambios
 * pasan al instante y nada vuela ni se desliza.
 */
'use strict';

window.Movimiento = (() => {
  const consulta = window.matchMedia('(prefers-reduced-motion: reduce)');
  const reducido = () => consulta.matches;
  const raiz = document.documentElement;
  raiz.classList.add('mov');

  /* -------------------------------------------------------
     FOTOS: aparecen con un fundido cuando terminan de cargar
     ------------------------------------------------------- */
  const FOTOS = '.tarjeta-imagen img, .detalle-imagen img, .carrito-item-imagen img, .detalle-galeria img';
  const prepararFoto = (img) => {
    if (img.complete && img.naturalWidth) { img.classList.add('cargada'); return; }
    img.addEventListener('load', () => img.classList.add('cargada'), { once: true });
  };
  const revisarFotos = (nodo) => {
    if (nodo.nodeType !== 1) return;
    if (nodo.matches(FOTOS)) prepararFoto(nodo);
    nodo.querySelectorAll?.(FOTOS).forEach(prepararFoto);
  };
  new MutationObserver((cambios) => cambios.forEach((c) => {
    c.addedNodes.forEach(revisarFotos);
    // Cambio de foto en la ficha: vuelve a hacer el fundido
    if (c.type === 'attributes' && c.target.matches(FOTOS)) {
      c.target.classList.remove('cargada');
      prepararFoto(c.target);
    }
  })).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
  document.addEventListener('DOMContentLoaded', () => revisarFotos(document.body));

  /* -------------------------------------------------------
     BOTONES "PROCESANDO": si un botón se desactiva justo después
     de tocarlo, muestro un indicador dentro de él hasta que vuelva
     ------------------------------------------------------- */
  let tocado = null;
  let tocadoEn = 0;
  const marcar = (b) => { if (b) { tocado = b; tocadoEn = performance.now(); } };
  document.addEventListener('click', (e) => marcar(e.target.closest?.('button')), true);
  document.addEventListener('submit', (e) => marcar(e.submitter), true);

  new MutationObserver((cambios) => cambios.forEach(({ target: b }) => {
    if (b.tagName !== 'BUTTON') return;
    if (b.disabled && b === tocado && performance.now() - tocadoEn < 1500) {
      b.classList.add('procesando');
      b.setAttribute('aria-busy', 'true');
    } else if (!b.disabled && b.classList.contains('procesando')) {
      b.classList.remove('procesando');
      b.removeAttribute('aria-busy');
    }
  })).observe(document.documentElement, { attributes: true, attributeFilter: ['disabled'], subtree: true });

  /* -------------------------------------------------------
     APARICIÓN EN CASCADA: las piezas que entran juntas a la
     pantalla aparecen una tras otra
     ------------------------------------------------------- */
  let observador = null;
  const revelar = (elementos) => {
    const lista = [...elementos];
    if (reducido() || !('IntersectionObserver' in window)) {
      lista.forEach((el) => el.classList.add('visible'));
      return;
    }
    observador ??= new IntersectionObserver((entradas) => {
      entradas.filter((e) => e.isIntersecting).forEach((e, i) => {
        const el = e.target;
        el.style.setProperty('--retraso', `${Math.min(i, 8) * 55}ms`);
        el.classList.add('visible');
        observador.unobserve(el);
        // Quito el retraso al terminar para que el hover responda al instante
        setTimeout(() => el.style.removeProperty('--retraso'), 900 + i * 55);
      });
    }, { rootMargin: '0px 0px -30px 0px' });
    lista.forEach((el) => observador.observe(el));
  };

  /* Transición dentro de la misma página (filtros, orden) */
  const transicion = (cambio) => {
    if (reducido() || !document.startViewTransition) { cambio(); return; }
    try {
      document.startViewTransition({ update: cambio, types: ['catalogo'] });
    } catch {
      // Safari 18.0 no acepta tipos: uso la forma simple
      document.startViewTransition(cambio);
    }
  };

  /* -------------------------------------------------------
     CIFRAS QUE CUENTAN: "$1,240 MXN" pasa a "$1,580 MXN" rodando
     ------------------------------------------------------- */
  const NUMERO = /\d[\d,]*(\.\d+)?/;
  const leer = (texto) => {
    const m = String(texto).match(NUMERO);
    return m ? parseFloat(m[0].replace(/,/g, '')) : null;
  };
  const contar = (el, texto) => {
    if (!el) return;
    const desde = leer(el.textContent);
    const hasta = leer(texto);
    cancelAnimationFrame(el._cuenta);
    if (reducido() || document.hidden || desde === null || hasta === null || desde === hasta || !el.isConnected) {
      el.textContent = texto;
      return;
    }
    const decimales = (String(texto).match(NUMERO)[1] || '').length ? 2 : 0;
    const inicio = performance.now();
    const DURACION = 450;
    const paso = (ahora) => {
      // El primer cuadro puede traer una hora un poco anterior al inicio
      const t = Math.min(1, Math.max(0, (ahora - inicio) / DURACION));
      const suave = 1 - Math.pow(1 - t, 3);
      const valor = desde + (hasta - desde) * suave;
      el.textContent = t < 1
        ? String(texto).replace(NUMERO, valor.toLocaleString('es-MX', { minimumFractionDigits: decimales, maximumFractionDigits: decimales }))
        : texto;
      if (t < 1) el._cuenta = requestAnimationFrame(paso);
    };
    el._cuenta = requestAnimationFrame(paso);
  };

  /* -------------------------------------------------------
     AGREGAR AL CARRITO: el botón confirma y la pieza vuela al carrito
     ------------------------------------------------------- */
  const confirmarBoton = (boton) => {
    if (!boton?.isConnected || boton._confirmando) return;
    boton._confirmando = true;
    const antes = boton.innerHTML;
    boton.style.minWidth = `${boton.offsetWidth}px`;
    boton.classList.add('agregado');
    boton.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path class="palomita" d="M5 12.5l4.5 4.5L19 7.5"/></svg>Agregado`;
    setTimeout(() => {
      boton.innerHTML = antes;
      boton.classList.remove('agregado');
      boton.style.removeProperty('min-width');
      boton._confirmando = false;
    }, 1400);
  };

  const volarAlCarrito = (boton, alLlegar) => {
    const destino = document.getElementById('btn-carrito');
    const caja = boton?.closest('.tarjeta-producto, #producto-drawer');
    const pieza = caja?.querySelector('.tarjeta-imagen img.cargada, .detalle-imagen img.cargada, .tarjeta-imagen .pieza-svg, .detalle-imagen .pieza-svg');
    const cama = pieza?.closest('.tarjeta-imagen, .detalle-imagen');
    const a = cama?.getBoundingClientRect();
    const b = destino?.getBoundingClientRect();
    if (reducido() || !a || !b || !b.width || a.bottom < 0 || a.top > innerHeight) { alLlegar(); return; }

    const TAM = 72;
    const ficha = document.createElement('div');
    ficha.className = 'vuelo-pieza cama';
    ficha.dataset.categoria = cama.dataset.categoria || '';
    ficha.append(pieza.cloneNode(true));
    ficha.style.cssText = `left:${a.left + a.width / 2 - TAM / 2}px;top:${a.top + a.height / 2 - TAM / 2}px;width:${TAM}px;height:${TAM}px`;
    document.body.append(ficha);

    const dx = b.left + b.width / 2 - (a.left + a.width / 2);
    const dy = b.top + b.height / 2 - (a.top + a.height / 2);
    // Dos animaciones encimadas hacen la curva: x avanza parejo, y sube y luego cae
    ficha.animate(
      [{ translate: '0 0' }, { translate: `${dx}px 0` }],
      { duration: 700, easing: 'cubic-bezier(0.45, 0, 0.55, 1)', fill: 'forwards' });
    const vuelo = ficha.animate([
      { transform: 'translateY(0) scale(1)', opacity: 1 },
      { transform: `translateY(${Math.min(dy, 0) - 60}px) scale(0.7)`, opacity: 1, offset: 0.4 },
      { transform: `translateY(${dy}px) scale(0.22)`, opacity: 0.4 },
    ], { duration: 700, easing: 'cubic-bezier(0.3, 0, 0.6, 1)', fill: 'forwards' });
    vuelo.onfinish = () => { ficha.remove(); alLlegar(); };
  };

  /* -------------------------------------------------------
     DESLIZAR PARA CERRAR (paneles y avisos, con el dedo)
     ------------------------------------------------------- */
  const deslizable = (el, { eje = 'x', umbral = 90, ignorar = null, alCerrar }) => {
    let inicio = null;
    let mov = 0;
    let decidido = null;

    el.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch' || (ignorar && e.target.closest(ignorar))) return;
      inicio = { x: e.clientX, y: e.clientY, t: performance.now() };
      mov = 0;
      decidido = null;
    });
    el.addEventListener('pointermove', (e) => {
      if (!inicio) return;
      const dx = e.clientX - inicio.x;
      const dy = e.clientY - inicio.y;
      if (decidido === null && Math.hypot(dx, dy) > 10) {
        decidido = eje === 'x' ? Math.abs(dx) > Math.abs(dy) * 1.2 : Math.abs(dy) > Math.abs(dx) * 1.2;
        if (!decidido) { inicio = null; return; }
        el.classList.add('arrastrando');
      }
      if (!decidido) return;
      // Solo hacia la salida; hacia el otro lado se resiste
      const d = eje === 'x' ? dx : dy;
      mov = d > 0 ? d : d / 4;
      el.style.translate = eje === 'x' ? `${mov}px 0` : `0 ${mov}px`;
    });
    const soltar = () => {
      if (!inicio) return;
      const rapido = mov > 40 && performance.now() - inicio.t < 250;
      inicio = null;
      el.classList.remove('arrastrando');
      if (decidido && (mov > umbral || rapido)) {
        alCerrar();
        setTimeout(() => el.style.removeProperty('translate'), 450);
      } else {
        el.style.removeProperty('translate');
      }
    };
    el.addEventListener('pointerup', soltar);
    el.addEventListener('pointercancel', soltar);
  };

  /* Pasar fotos con el dedo en la ficha del producto */
  const deslizarFotos = (el, { siguiente, anterior }) => {
    let x0 = null;
    el.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') x0 = e.clientX; });
    el.addEventListener('pointerup', (e) => {
      if (x0 === null) return;
      const dx = e.clientX - x0;
      x0 = null;
      if (Math.abs(dx) < 40) return;
      dx < 0 ? siguiente() : anterior();
    });
    el.addEventListener('pointercancel', () => { x0 = null; });
  };

  /* -------------------------------------------------------
     AVISOS: se pueden descartar deslizándolos
     ------------------------------------------------------- */
  const prepararAvisos = () => {
    const aviso = document.getElementById('agregar-toast');
    if (aviso) deslizable(aviso, { umbral: 60, alCerrar: () => { clearTimeout(aviso._to); aviso.classList.remove('visible'); } });
  };
  document.addEventListener('DOMContentLoaded', prepararAvisos);

  /* -------------------------------------------------------
     ESTRELLAS: al calificar se llenan una por una
     ------------------------------------------------------- */
  document.addEventListener('change', (e) => {
    const caja = e.target.closest?.('.resena-estrellas');
    if (!caja) return;
    caja.classList.remove('llenando');
    void caja.offsetWidth;
    caja.classList.add('llenando');
  });

  return { reducido, revelar, transicion, contar, confirmarBoton, volarAlCarrito, deslizable, deslizarFotos };
})();
