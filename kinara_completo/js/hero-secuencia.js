/**
 * hero-secuencia.js — La P2S imprimiendo, controlada por el scroll.
 *
 * Son 96 cuadros renderizados en Blender (assets/hero/). El avance del scroll
 * (0 → 1) elige el cuadro y se funde con el siguiente para que se vea continuo.
 *
 *  0.00 – 0.26  Imprime una lámpara
 *  0.36 – 0.58  Imprime un organizador
 *  0.67 – 0.88  Imprime un lote de llaveros
 *  0.92 – 1.00  El cabezal se estaciona
 *
 * Carga primero el cuadro inicial y después los demás, empezando por los más
 * cercanos a donde va el scroll. Si no hay imágenes, queda la ilustración.
 */
(() => {
  const seccion = document.getElementById('hero');
  const canvas = document.getElementById('hero-canvas');
  if (!seccion || !canvas) return;

  const capitulos = [...document.querySelectorAll('.hero-capitulo')];
  const lecturaPieza = document.getElementById('hero-pieza');
  const lecturaCapa = document.getElementById('hero-capa');
  const lecturaAvance = document.getElementById('hero-avance');
  const reducido = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const consultaMovil = matchMedia('(max-width: 860px) and (orientation: portrait)');
  const ctx = canvas.getContext('2d');

  const clamp01 = (v) => Math.min(1, Math.max(0, v));

  // Mismo guion que el render: [trabajo, cuadros, avance inicial, final, p inicial, p final]
  const TRAMOS = [
    [0, 32, 0.08, 1, 0, 0.26], [0, 2, 1, 1, 0.28, 0.34],
    [1, 30, 0.05, 1, 0.36, 0.58], [1, 2, 1, 1, 0.6, 0.66],
    [2, 28, 0.12, 1, 0.67, 0.88], [2, 2, 1, 1, 0.92, 1],
  ];
  const TRABAJOS = [
    { nombre: 'Lámpara', capas: 870 },
    { nombre: 'Organizador', capas: 809 },
    { nombre: 'Llaveros', capas: 50 },
  ];
  const CUADROS = [];
  TRAMOS.forEach(([t, n, a0, a1, p0, p1]) => {
    for (let i = 0; i < n; i++) {
      const f = i / Math.max(1, n - 1);
      CUADROS.push({ t, h: a0 + (a1 - a0) * f, p: p0 + (p1 - p0) * f });
    }
  });
  const TOTAL = CUADROS.length;

  // Capítulos de texto: [aparece, desaparece]
  const CAPITULOS = [[-1, 0.27], [0.36, 0.61], [0.67, 0.87], [0.9, 2]];
  const FUNDIDO = 0.03;
  const aplicarCapitulos = (p) => {
    capitulos.forEach((el, i) => {
      const [a, b] = CAPITULOS[i];
      const o = Math.min(1, Math.max(0, (p - a) / FUNDIDO), Math.max(0, (b - p) / FUNDIDO));
      el.style.opacity = o;
      el.style.transform = `translate3d(0, ${(1 - o) * (p < a + FUNDIDO ? 22 : -22)}px, 0)`;
      el.style.visibility = o < 0.01 ? 'hidden' : 'visible';
    });
  };

  // Cuadro (fraccional) para un avance p
  const cuadroPara = (p) => {
    if (p <= CUADROS[0].p) return 0;
    for (let i = 1; i < TOTAL; i++) {
      if (p <= CUADROS[i].p) {
        const a = CUADROS[i - 1].p;
        const b = CUADROS[i].p;
        return i - 1 + (b > a ? (p - a) / (b - a) : 1);
      }
    }
    return TOTAL - 1;
  };

  // ---------- Imágenes ----------
  // Igual que el preload del <head>: celular en vertical usa el juego chico
  const juego = () => (consultaMovil.matches ? 'm' : 'd');
  let carpeta = juego();
  const imagenes = new Array(TOTAL);
  const listas = new Array(TOTAL).fill(false);
  let pedidas = 0;

  const cargar = (i) => new Promise((resolver) => {
    if (imagenes[i]) { resolver(); return; }
    const img = new Image();
    img.decoding = 'async';
    img.src = `assets/hero/${carpeta}/p2s_${String(i).padStart(3, '0')}.webp`;
    imagenes[i] = img;
    pedidas += 1;
    const fin = () => {
      listas[i] = img.naturalWidth > 0;
      if (listas[i] && Math.abs(i - cuadroActual) < 2) dibujar();
      resolver();
    };
    (img.decode ? img.decode() : Promise.reject()).then(fin, () => { if (img.complete) fin(); else img.onload = img.onerror = fin; });
  });

  // Con ahorro de datos o red lenta bajo un cuadro sí y uno no (el fundido cubre el hueco)
  const red = navigator.connection;
  const salto = red && (red.saveData || /(^|-)2g|3g/.test(red.effectiveType || '')) ? 2 : 1;

  // El resto, de lo más cercano al scroll hacia afuera, con pocas descargas a la vez
  let colaIniciada = false;
  const cargarResto = () => {
    if (colaIniciada) return;
    colaIniciada = true;
    const siguiente = () => {
      const centro = Math.round(cuadroActual);
      let mejor = -1;
      for (let d = 0; d < TOTAL && mejor < 0; d++) {
        if (centro + d < TOTAL && !imagenes[centro + d] && (centro + d) % salto === 0) mejor = centro + d;
        else if (centro - d >= 0 && !imagenes[centro - d] && (centro - d) % salto === 0) mejor = centro - d;
      }
      if (mejor < 0) return;
      cargar(mejor).then(siguiente);
    };
    for (let k = 0; k < 4; k++) siguiente();
  };

  // Cuadro listo más cercano, por si el que toca aún no llega
  const cercano = (i) => {
    if (listas[i]) return i;
    for (let d = 1; d < TOTAL; d++) {
      if (i - d >= 0 && listas[i - d]) return i - d;
      if (i + d < TOTAL && listas[i + d]) return i + d;
    }
    return -1;
  };

  // ---------- Dibujo ----------
  let ancho = 0;
  let alto = 0;
  let caja = { x: 0, y: 0, w: 0, h: 0 };
  let cuadroActual = 0;

  const medirCaja = () => {
    const ref = imagenes.find((im, i) => listas[i]);
    const proporcion = ref ? ref.naturalWidth / ref.naturalHeight : 0.9;
    const dpr = ancho / Math.max(1, canvas.clientWidth);
    if (consultaMovil.matches) {
      // Debajo del capítulo de texto más largo
      const textoFin = Math.max(...capitulos.map((el) => {
        const u = el.lastElementChild;
        return u.offsetTop + u.offsetHeight;
      }));
      const reserva = 56;
      const libreAlto = Math.max(canvas.clientHeight * 0.32, canvas.clientHeight - textoFin - reserva - 8);
      let h = libreAlto;
      let w = h * proporcion;
      if (w > canvas.clientWidth * 0.96) { w = canvas.clientWidth * 0.96; h = w / proporcion; }
      caja = { x: (canvas.clientWidth - w) / 2, y: canvas.clientHeight - reserva - h, w, h };
    } else {
      let h = canvas.clientHeight * 0.86;
      let w = h * proporcion;
      const maxW = canvas.clientWidth * 0.56;
      if (w > maxW) { w = maxW; h = w / proporcion; }
      const cx = canvas.clientWidth * 0.71;
      caja = { x: cx - w / 2, y: canvas.clientHeight - h - canvas.clientHeight * 0.05, w, h };
    }
    caja = { x: caja.x * dpr, y: caja.y * dpr, w: caja.w * dpr, h: caja.h * dpr };
  };

  const ajustar = () => {
    const dpr = Math.min(devicePixelRatio, 2);
    const w = Math.round(canvas.clientWidth * dpr);
    const h = Math.round(canvas.clientHeight * dpr);
    if (!w || !h) return;
    if (w !== ancho || h !== alto) {
      ancho = canvas.width = w;
      alto = canvas.height = h;
    }
    const nueva = juego();
    if (nueva !== carpeta && !pedidas) carpeta = nueva;
    medirCaja();
    dibujar();
  };

  const lectura = { pieza: '', capa: '', avance: '' };
  const dibujar = () => {
    if (!ancho) return;
    const base = Math.floor(cuadroActual);
    const mezcla = cuadroActual - base;
    const a = cercano(base);
    if (a < 0) return;
    ctx.clearRect(0, 0, ancho, alto);
    ctx.imageSmoothingQuality = 'high';
    ctx.globalAlpha = 1;
    ctx.drawImage(imagenes[a], caja.x, caja.y, caja.w, caja.h);
    const b = base + 1;
    // Fundido con el siguiente solo dentro del mismo trabajo (al cambiar de pieza, corte limpio)
    if (mezcla > 0.02 && b < TOTAL && listas[b] && a === base && CUADROS[b].t === CUADROS[base].t) {
      ctx.globalAlpha = mezcla;
      ctx.drawImage(imagenes[b], caja.x, caja.y, caja.w, caja.h);
      ctx.globalAlpha = 1;
    }
    canvas.classList.add('listo');

    const c = CUADROS[Math.round(cuadroActual)];
    const t = TRABAJOS[c.t];
    if (lecturaPieza) {
      const capa = `capa ${String(Math.round(c.h * t.capas)).padStart(3, '0')}/${t.capas}`;
      const barra = `scaleX(${c.h.toFixed(3)})`;
      if (lectura.pieza !== t.nombre) lecturaPieza.textContent = lectura.pieza = t.nombre;
      if (lectura.capa !== capa) lecturaCapa.textContent = lectura.capa = capa;
      if (lectura.avance !== barra) lecturaAvance.style.transform = lectura.avance = barra;
    }
  };

  const fijarAvance = (p) => {
    cuadroActual = cuadroPara(p);
    aplicarCapitulos(p);
    dibujar();
  };

  // ---------- Inicio ----------
  const iniciar = () => {
    if (reducido) {
      // Sin movimiento: una sola pantalla con la lámpara terminada
      seccion.classList.add('hero--quieto');
      cuadroActual = 32;
      cargar(32).then(() => { ajustar(); aplicarCapitulos(0); });
      addEventListener('resize', ajustar, { passive: true });
      return;
    }

    const fijo = seccion.querySelector('.hero-fijo');
    let recorrido = 1;
    let actual = 0;
    let meta = 0;
    let anterior = 0;
    let rafId = 0;
    const medir = () => { recorrido = Math.max(1, seccion.offsetHeight - fijo.offsetHeight); };
    const suavizar = (ahora) => {
      actual += (meta - actual) * (1 - Math.exp(-(ahora - anterior) * 0.009));
      anterior = ahora;
      if (Math.abs(meta - actual) < 0.0002) actual = meta;
      fijarAvance(actual);
      rafId = actual === meta ? 0 : requestAnimationFrame(suavizar);
    };
    const leerScroll = () => {
      meta = clamp01(-seccion.getBoundingClientRect().top / recorrido);
      if (meta === actual || rafId) return;
      anterior = performance.now();
      rafId = requestAnimationFrame(suavizar);
    };

    addEventListener('scroll', leerScroll, { passive: true });
    addEventListener('resize', () => { medir(); ajustar(); leerScroll(); }, { passive: true });
    new ResizeObserver(() => { medir(); ajustar(); }).observe(canvas);
    if (document.fonts) document.fonts.ready.then(() => { medirCaja(); dibujar(); });

    medir();
    meta = actual = clamp01(-seccion.getBoundingClientRect().top / recorrido);
    cuadroActual = cuadroPara(actual);
    aplicarCapitulos(actual);
    const primero = Math.round(cuadroActual);
    cargar(primero).then(() => {
      if (!listas[primero]) { seccion.classList.add('hero--sin3d'); return; }
      ajustar();
      fijarAvance(actual);
      // El resto, cuando la página ya cargó lo importante
      if (document.readyState === 'complete') cargarResto();
      else addEventListener('load', cargarResto, { once: true });
    });
  };

  iniciar();
})();
