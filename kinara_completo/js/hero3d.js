/**
 * hero3d.js — Impresora 3D del hero (Three.js), controlada por el scroll.
 *
 *  0.00 – 0.26  Imprime una lámpara, que se enciende al terminar
 *  0.30 – 0.36  La lámpara sale de la cama
 *  0.36 – 0.58  Imprime dos engranes, que giran al terminar
 *  0.62 – 0.67  Los engranes salen de la cama
 *  0.67 – 0.88  Imprime un ajolote
 *  0.88 – 1.00  El cabezal se estaciona
 *
 * Todo es geometría procedural: no hay modelos que descargar. Si WebGL o la
 * librería fallan, el hero queda en una pantalla con una ilustración.
 */

const URL_THREE = 'https://cdn.jsdelivr.net/npm/three@0.186.1/build/three.module.min.js';

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const rango = (p, a, b) => clamp01((p - a) / (b - a));
const suave = (t) => t * t * (3 - 2 * t);

const seccion = document.getElementById('hero');
const canvas = document.getElementById('hero-canvas');
const capitulos = [...document.querySelectorAll('.hero-capitulo')];
const lecturaPieza = document.getElementById('hero-pieza');
const lecturaCapa = document.getElementById('hero-capa');
const lecturaAvance = document.getElementById('hero-avance');
const animacionReducida = matchMedia('(prefers-reduced-motion: reduce)').matches;

const crearEscena = (THREE) => {
  // En horizontal hay ancho de sobra: la impresora va al lado del texto
  const consultaMovil = matchMedia('(max-width: 860px) and (orientation: portrait)');
  const movil = () => consultaMovil.matches;
  const tactil = matchMedia('(pointer: coarse)').matches;
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.localClippingEnabled = true;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = !tactil;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const escena = new THREE.Scene();
  const camara = new THREE.PerspectiveCamera(30, 1, 0.1, 60);

  escena.add(new THREE.HemisphereLight(0xffffff, 0x2f5c58, 1.5));
  const sol = new THREE.DirectionalLight(0xffffff, 2.6);
  sol.position.set(4, 8, 5);
  sol.castShadow = true;
  sol.shadow.mapSize.set(1024, 1024);
  Object.assign(sol.shadow.camera, { left: -4, right: 4, top: 5, bottom: -2, near: 1, far: 20 });
  sol.shadow.bias = -0.0006;
  escena.add(sol);
  const contra = new THREE.DirectionalLight(0xc8dbd6, 1.4);
  contra.position.set(-6, 3, -4);
  escena.add(contra);

  // ---------- Impresión: corte por altura, líneas de capa y borde caliente ----------
  const corte = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
  const uAltura = { value: 0 };
  const uCalor = { value: 1 };

  const materialImpreso = (color, extra = {}) => {
    const m = new THREE.MeshStandardMaterial({
      color, roughness: 0.55, metalness: 0.02, side: THREE.DoubleSide,
      clippingPlanes: [corte], clipShadows: true, ...extra,
    });
    m.onBeforeCompile = (s) => {
      s.uniforms.uAltura = uAltura;
      s.uniforms.uCalor = uCalor;
      s.vertexShader = s.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vMundo;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMundo = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      s.fragmentShader = s.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vMundo;\nuniform float uAltura;\nuniform float uCalor;')
        .replace('#include <color_fragment>', `#include <color_fragment>
          float capa = smoothstep(0.32, 0.5, abs(fract(vMundo.y / 0.032) - 0.5));
          diffuseColor.rgb *= 1.0 - 0.24 * capa;
          if (!gl_FrontFacing) diffuseColor.rgb *= 0.3;`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          totalEmissiveRadiance += vec3(1.0, 0.36, 0.08) * smoothstep(0.075, 0.0, uAltura - vMundo.y) * 2.4 * uCalor;`);
    };
    return m;
  };

  const sombra = (mesh) => { mesh.castShadow = true; mesh.receiveShadow = true; return mesh; };
  const malla = (geo, mat, x = 0, y = 0, z = 0) => {
    const m = sombra(new THREE.Mesh(geo, mat));
    m.position.set(x, y, z);
    return m;
  };

  // ---------- Pieza 1: lámpara facetada ----------
  const crearLampara = () => {
    const g = new THREE.Group();
    const perfil = [
      [0.72, 0], [0.74, 0.1], [0.46, 0.22], [0.5, 0.42], [0.82, 0.8], [0.9, 1.05],
      [0.72, 1.42], [0.76, 1.62], [0.46, 1.86], [0.4, 1.96],
    ].map(([x, y]) => new THREE.Vector2(x, y));
    const material = materialImpreso(0xd2ab94, { flatShading: true, emissive: 0xc99a80, emissiveIntensity: 0 });
    g.add(malla(new THREE.LatheGeometry(perfil, 14), material));
    g.add(malla(new THREE.CylinderGeometry(0.74, 0.74, 0.08, 14), material, 0, 0.04, 0));
    const foco = new THREE.PointLight(0xe0c2ad, 0, 7);
    foco.position.y = 1.05;
    g.add(foco);
    g.userData = { material, foco };
    return { grupo: g, alto: 1.96, radio: 0.84, nombre: 'Lámpara', capas: 245, color: 0xd2ab94 };
  };

  // ---------- Pieza 2: engranes ----------
  const formaEngrane = (radio, dientes) => {
    const interior = radio * 0.83;
    const s = new THREE.Shape();
    const paso = (Math.PI * 2) / dientes;
    for (let i = 0; i < dientes; i++) {
      const a = i * paso;
      [[interior, 0], [interior, 0.2], [radio, 0.31], [radio, 0.69], [interior, 0.8]].forEach(([r, f], k) => {
        const ang = a + f * paso;
        const x = Math.cos(ang) * r;
        const y = Math.sin(ang) * r;
        if (i === 0 && k === 0) s.moveTo(x, y); else s.lineTo(x, y);
      });
    }
    s.closePath();
    const hueco = new THREE.Path();
    hueco.absarc(0, 0, radio * 0.28, 0, Math.PI * 2, true);
    s.holes.push(hueco);
    return s;
  };

  const crearEngranes = () => {
    const g = new THREE.Group();
    const azul = materialImpreso(0xf3f2ee);
    const verde = materialImpreso(0x8d5f4a);
    const engrane = (radio, dientes, alto, material) => {
      const geo = new THREE.ExtrudeGeometry(formaEngrane(radio, dientes), {
        depth: alto, bevelEnabled: false, curveSegments: 24,
      });
      geo.rotateX(-Math.PI / 2);
      return malla(geo, material);
    };
    const grande = engrane(0.92, 16, 0.95, azul);
    const chico = engrane(0.56, 10, 1.45, verde);
    grande.position.x = -0.48;
    chico.position.x = 0.92;
    g.add(grande, chico);
    g.userData = { grande, chico };
    return { grupo: g, alto: 1.45, radio: 1.2, nombre: 'Engranes', capas: 181, color: 0x8d5f4a };
  };

  // ---------- Pieza 3: ajolote de escritorio ----------
  const crearAjolote = () => {
    const g = new THREE.Group();
    const piel = materialImpreso(0xdcd9d1);
    const branquia = materialImpreso(0x8d5f4a);
    const ojo = materialImpreso(0x1b1714, { roughness: 0.25 });
    const esfera = new THREE.SphereGeometry(1, 32, 24);

    const parte = (mat, [x, y, z], [sx, sy, sz], rot = [0, 0, 0]) => {
      const m = malla(esfera, mat, x, y, z);
      m.scale.set(sx, sy, sz);
      m.rotation.set(...rot);
      g.add(m);
      return m;
    };

    parte(piel, [0.25, 0.46, 0], [0.88, 0.44, 0.48]);          // Cuerpo
    parte(piel, [-0.62, 0.72, 0], [0.56, 0.47, 0.62]);         // Cabeza
    parte(piel, [1.22, 0.5, 0], [0.62, 0.2, 0.11], [0, 0, 0.26]); // Cola
    [[-0.1, 0.42], [-0.1, -0.42], [0.72, 0.38], [0.72, -0.38]].forEach(([x, z]) => {
      parte(piel, [x, 0.14, z], [0.14, 0.14, 0.21]);           // Patas
    });
    [-1, 1].forEach((lado) => {
      [0, 1, 2].forEach((i) => {
        // Tres branquias en abanico, como plumas a cada lado de la cabeza
        parte(branquia, [-0.46, 0.66 + i * 0.27, lado * (0.74 - i * 0.13)],
          [0.055, 0.3, 0.065], [lado * (1.25 - i * 0.48), 0, 0]);
      });
      parte(ojo, [-1.03, 0.82, lado * 0.27], [0.07, 0.07, 0.07]);
    });
    parte(branquia, [-1.1, 0.59, 0], [0.025, 0.025, 0.2]);      // Sonrisa
    // Lo giro para que mire a la cámara al terminar de imprimirse
    g.rotation.y = 2.25;
    return { grupo: g, alto: 1.62, radio: 1.15, nombre: 'Ajolote', capas: 202, color: 0xdcd9d1 };
  };

  const piezas = [
    { ...crearLampara(), inicio: 0, fin: 0.26, salida: [0.3, 0.36], desde: 0.2 },
    { ...crearEngranes(), inicio: 0.36, fin: 0.58, salida: [0.62, 0.67], desde: 0 },
    { ...crearAjolote(), inicio: 0.67, fin: 0.88, salida: [2, 3], desde: 0 },
  ];
  piezas.forEach((p) => escena.add(p.grupo));

  // ---------- Impresora ----------
  const metal = new THREE.MeshStandardMaterial({ color: 0x2a3433, roughness: 0.5, metalness: 0.35 });
  const metalClaro = new THREE.MeshStandardMaterial({ color: 0xc4c6cb, roughness: 0.32, metalness: 0.6 });
  const naranja = new THREE.MeshStandardMaterial({ color: 0xb88b74, roughness: 0.42 });

  const lienzo = document.createElement('canvas');
  lienzo.width = lienzo.height = 512;
  const c = lienzo.getContext('2d');
  c.fillStyle = '#1f2b2a';
  c.fillRect(0, 0, 512, 512);
  c.strokeStyle = 'rgba(243,242,238,.2)';
  c.lineWidth = 1.5;
  for (let i = 0; i <= 512; i += 42.66) {
    c.beginPath(); c.moveTo(i, 0); c.lineTo(i, 512); c.stroke();
    c.beginPath(); c.moveTo(0, i); c.lineTo(512, i); c.stroke();
  }
  c.strokeStyle = '#f3f2ee';
  c.lineWidth = 5;
  c.strokeRect(10, 10, 492, 492);
  const texturaCama = new THREE.CanvasTexture(lienzo);
  texturaCama.colorSpace = THREE.SRGBColorSpace;
  texturaCama.anisotropy = 4;

  const caja = (x, y, z, mat, px, py, pz) => malla(new THREE.BoxGeometry(x, y, z), mat, px, py, pz);
  const materialCama = new THREE.MeshStandardMaterial({ map: texturaCama, roughness: 0.6 });
  escena.add(malla(new THREE.BoxGeometry(3.5, 0.1, 3.3), [metal, metal, materialCama, metal, metal, metal], 0, -0.05, 0));
  escena.add(caja(4.7, 0.3, 3.7, metal, 0, -0.4, 0));
  [-2.15, 2.15].forEach((x) => escena.add(caja(0.2, 3.8, 0.28, metal, x, 1.35, -0.25)));
  escena.add(caja(4.5, 0.2, 0.28, metal, 0, 3.3, -0.25));

  const portal = new THREE.Group();
  const barra = new THREE.CylinderGeometry(0.04, 0.04, 4.15, 12);
  barra.rotateZ(Math.PI / 2);
  portal.add(malla(barra, metalClaro, 0, 0.1, -0.25), malla(barra, metalClaro, 0, -0.1, -0.25));
  const cabezal = new THREE.Group();
  cabezal.add(caja(0.48, 0.5, 0.38, naranja, 0, 0, -0.15));
  cabezal.add(caja(0.34, 0.28, 0.34, metal, 0, -0.35, 0));
  const boquilla = new THREE.CylinderGeometry(0.1, 0.02, 0.17, 16);
  cabezal.add(malla(boquilla, metalClaro, 0, -0.57, 0));
  portal.add(cabezal);
  escena.add(portal);

  // Punto de plástico fundido y su luz
  const gota = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), new THREE.MeshBasicMaterial({ color: 0xd9b8a3 }));
  const luzGota = new THREE.PointLight(0xc99a80, 2.5, 2.5);
  gota.add(luzGota);
  escena.add(gota);

  // Carrete y filamento
  const carrete = new THREE.Group();
  const eje = new THREE.CylinderGeometry(0.27, 0.27, 0.46, 24);
  eje.rotateX(Math.PI / 2);
  const tapa = new THREE.CylinderGeometry(0.46, 0.46, 0.04, 32);
  tapa.rotateX(Math.PI / 2);
  carrete.add(malla(eje, naranja), malla(tapa, metal, 0, 0, 0.24), malla(tapa, metal, 0, 0, -0.24));
  carrete.position.set(1.15, 3.88, -0.25);
  escena.add(carrete, caja(0.08, 0.28, 0.08, metal, 1.15, 3.52, -0.25));

  const filamentoPuntos = new Float32Array(24 * 3);
  const filamentoGeo = new THREE.BufferGeometry();
  filamentoGeo.setAttribute('position', new THREE.BufferAttribute(filamentoPuntos, 3));
  const filamento = new THREE.Line(filamentoGeo, new THREE.LineBasicMaterial({ color: 0xb88b74 }));
  filamento.frustumCulled = false;
  escena.add(filamento);
  const curva = new THREE.QuadraticBezierCurve3(new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3());

  // ---------- Estado ----------
  let avance = 0;
  let activa = true;
  let raf = 0;
  let mouseX = 0;
  let mouseSuave = 0;
  let anchoPrevio = 0;
  let altoPrevio = 0;
  let distanciaMovil = 16;
  // Medidas aparentes de la impresora y altura visible por unidad de distancia (fov 30°)
  const ALTO_IMPRESORA = 5.6;
  const ANCHO_IMPRESORA = 6;
  const TAN_VISTA = 2 * Math.tan(Math.PI / 12);
  let tope = Math.min(devicePixelRatio, tactil ? 1.5 : 2);
  let cuadros = 0;
  let marcaCuadros = 0;
  let ultimoCuadro = 0;
  let listo = false;
  // Último estado dibujado: si nada cambió, no vuelvo a dibujar
  const previo = { avance: -1, y: 0, x: 0, z: 0, mouse: 0, ancho: 0 };
  const lectura = { pieza: '', capa: '', avance: '' };
  const reloj = new THREE.Clock();
  const objetivo = new THREE.Vector3();

  const ajustar = () => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    // Cambiar el tamaño borra el lienzo: solo lo hago si de verdad cambió
    if (w === anchoPrevio && h === altoPrevio) return;
    anchoPrevio = w;
    altoPrevio = h;
    renderer.setPixelRatio(tope);
    renderer.setSize(w, h, false);
    camara.aspect = w / h;
    // Desplazo la escena para dejar libre el texto: a la derecha o hacia abajo
    if (movil()) {
      // La impresora ocupa lo que deje libre el capítulo de texto más largo
      const textoFin = Math.max(...capitulos.map((el) => {
        const ultimo = el.lastElementChild;
        return ultimo.offsetTop + ultimo.offsetHeight;
      }));
      const reserva = 64;
      const libre = Math.max(h * 0.3, h - textoFin - reserva);
      distanciaMovil = Math.max(ALTO_IMPRESORA * h / (TAN_VISTA * libre), ANCHO_IMPRESORA / (TAN_VISTA * camara.aspect));
      camara.setViewOffset(w, h, 0, h / 2 - (h - reserva - libre / 2), w, h);
    } else {
      camara.setViewOffset(w, h, -w * 0.2, 0, w, h);
    }
    camara.updateProjectionMatrix();
  };

  const dibujar = (forzar = true) => {
    const t = reloj.getElapsedTime();
    const p = avance;

    // Busco la pieza activa: es la última que ya empezó
    let activaIdx = 0;
    piezas.forEach((pz, i) => { if (p >= pz.inicio) activaIdx = i; });
    const actual = piezas[activaIdx];
    const hecho = actual.desde + (1 - actual.desde) * rango(p, actual.inicio, actual.fin);
    const imprimiendo = hecho < 1;

    piezas.forEach((pz, i) => {
      const fuera = suave(rango(p, pz.salida[0], pz.salida[1]));
      pz.grupo.visible = i === activaIdx && fuera < 1;
      pz.grupo.position.x = fuera * 5.5;
    });

    const altura = actual.alto * hecho;
    // Solo corto mientras imprime: al salir de la cama la pieza va completa
    corte.constant = imprimiendo ? altura : 50;
    uAltura.value = altura;
    uCalor.value = imprimiendo ? 1 : 0;

    // La lámpara se enciende y los engranes giran al terminar
    const encendido = activaIdx === 0 ? suave(rango(hecho, 0.97, 1)) * (1 - rango(p, 0.3, 0.34)) : 0;
    const lampara = piezas[0].grupo.userData;
    lampara.foco.intensity = encendido * 9;
    lampara.material.emissiveIntensity = encendido * 0.42;
    const giro = rango(p, 0.58, 0.62) * 4;
    piezas[1].grupo.userData.grande.rotation.y = giro;
    piezas[1].grupo.userData.chico.rotation.y = -giro * (16 / 10) + 0.2;

    // Cabezal: recorre la capa mientras imprime y sube cuando termina
    const velocidad = animacionReducida ? 0 : t;
    const trama = imprimiendo ? 1 : 0;
    const r = actual.radio * 0.9;
    const cabezalX = Math.sin(velocidad * 3.1 + p * 90) * r * trama;
    const cabezalZ = Math.cos(velocidad * 2.3 + p * 70) * r * 0.65 * trama;
    const estacionado = imprimiendo ? 0 : 1;
    const alturaCabezal = imprimiendo ? altura + 0.65 : Math.max(altura + 0.72, 2.75);
    portal.position.y += (alturaCabezal - portal.position.y) * (animacionReducida ? 1 : 0.14);
    cabezal.position.x += (cabezalX - cabezal.position.x) * (animacionReducida ? 1 : 0.2);
    cabezal.position.z += (cabezalZ - cabezal.position.z) * (animacionReducida ? 1 : 0.2);

    gota.visible = !estacionado;
    gota.position.set(cabezal.position.x, portal.position.y - 0.66, cabezal.position.z);

    carrete.rotation.z = -p * 40;
    curva.v0.set(1.15, 3.88, -0.02);
    curva.v2.set(cabezal.position.x, portal.position.y + 0.25, cabezal.position.z - 0.15);
    curva.v1.set((curva.v0.x + curva.v2.x) / 2 + 0.25, Math.max(curva.v0.y, curva.v2.y) + 0.35, -0.1);
    for (let i = 0; i < 24; i++) curva.getPoint(i / 23, objetivo).toArray(filamentoPuntos, i * 3);
    filamentoGeo.attributes.position.needsUpdate = true;

    // Cámara
    mouseSuave += (mouseX - mouseSuave) * 0.05;
    const angulo = -0.62 + p * 1.15 + mouseSuave * 0.1;
    // En pantallas angostas alejo la cámara para que quepa toda la impresora
    const distancia = movil() ? distanciaMovil : Math.max(12.5, Math.min(21, 9.8 / camara.aspect));
    camara.position.set(Math.sin(angulo) * distancia, 3.5 + mouseSuave * 0.05, Math.cos(angulo) * distancia);
    camara.lookAt(0, 1.45, 0);

    // Con la pieza terminada y la cámara quieta la imagen no cambia: no la vuelvo a dibujar
    const quieto = !imprimiendo
      && p === previo.avance
      && anchoPrevio === previo.ancho
      && Math.abs(portal.position.y - previo.y) < 1e-4
      && Math.abs(cabezal.position.x - previo.x) < 1e-4
      && Math.abs(cabezal.position.z - previo.z) < 1e-4
      && Math.abs(mouseSuave - previo.mouse) < 1e-4;
    if (quieto && !forzar) return;
    Object.assign(previo, {
      avance: p, y: portal.position.y, x: cabezal.position.x, z: cabezal.position.z,
      mouse: mouseSuave, ancho: anchoPrevio,
    });

    // El carrete y el filamento cambian al color de la pieza
    filamento.material.color.setHex(actual.color);
    naranja.color.setHex(actual.color);

    renderer.render(escena, camara);

    // Lectura de la impresora: solo toco el DOM cuando cambia el texto
    if (lecturaPieza) {
      const capa = `capa ${String(Math.round(hecho * actual.capas)).padStart(3, '0')}/${actual.capas}`;
      const barra = `scaleX(${hecho.toFixed(3)})`;
      if (lectura.pieza !== actual.nombre) lecturaPieza.textContent = lectura.pieza = actual.nombre;
      if (lectura.capa !== capa) lecturaCapa.textContent = lectura.capa = capa;
      if (lectura.avance !== barra) lecturaAvance.style.transform = lectura.avance = barra;
    }
  };

  const ciclo = (ahora) => {
    raf = 0;
    if (!activa) return;
    if (!animacionReducida) raf = requestAnimationFrame(ciclo);
    // En pantallas de 120 Hz dibujo a 60: el movimiento se ve igual con la mitad de trabajo
    if (ahora && ahora - ultimoCuadro < 15) return;
    ultimoCuadro = ahora || performance.now();
    dibujar(false);
    vigilarRendimiento(ultimoCuadro);
  };

  // Si el equipo no sostiene ~45 cuadros por segundo, bajo la resolución por pasos (2 → 1.5 → 1)
  const vigilarRendimiento = (ahora) => {
    if (tope <= 1) return;
    if (!marcaCuadros) marcaCuadros = ahora;
    cuadros += 1;
    if (cuadros < 45) return;
    const lento = (ahora - marcaCuadros) / cuadros > 22;
    cuadros = 0;
    marcaCuadros = ahora;
    if (!lento || document.hidden) return;
    tope = tope > 1.5 ? 1.5 : 1;
    anchoPrevio = 0;
    ajustar();
  };

  // Compilo todos los materiales al inicio, fuera del hilo principal cuando se puede,
  // para que no haya un tirón cuando aparece cada pieza a media bajada
  const precompilar = async () => {
    const visibles = piezas.map((pz) => pz.grupo.visible);
    piezas.forEach((pz) => { pz.grupo.visible = true; });
    try {
      if (renderer.compileAsync) await renderer.compileAsync(escena, camara);
      else renderer.compile(escena, camara);
    } catch (e) { /* si falla, se compila al dibujar como antes */ }
    piezas.forEach((pz, i) => { pz.grupo.visible = visibles[i]; });
  };

  if (!tactil) {
    addEventListener('pointermove', (e) => { mouseX = (e.clientX / innerWidth - 0.5) * 2; }, { passive: true });
  }

  return {
    ajustar,
    fijarAvance: (p) => { avance = p; if (animacionReducida) dibujar(); },
    fijarActiva: (v) => {
      activa = v;
      cuadros = 0;
      marcaCuadros = 0;
      if (v && listo && !raf && !animacionReducida) raf = requestAnimationFrame(ciclo);
    },
    dibujar,
    remedir: () => { anchoPrevio = 0; ajustar(); if (listo) dibujar(); },
    iniciar: async () => {
      ajustar();
      await precompilar();
      listo = true;
      dibujar();
      if (activa && !raf) ciclo();
      canvas.classList.add('listo');
    },
  };
};

// Capítulos de texto: [aparece, desaparece] en avance 0 → 1
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

const iniciarHero = async () => {
  if (!seccion || !canvas) return;

  // Con ahorro de datos no descargo la librería 3D: queda la ilustración
  if (navigator.connection && navigator.connection.saveData) {
    seccion.classList.add('hero--sin3d');
    return;
  }

  let escena;
  try {
    const THREE = await import(URL_THREE);
    escena = crearEscena(THREE);
  } catch (e) {
    console.warn('El hero 3D no está disponible:', e);
    seccion.classList.add('hero--sin3d');
    return;
  }

  if (animacionReducida) {
    // Sin movimiento: una sola pantalla con la lámpara terminada
    seccion.classList.add('hero--quieto');
    escena.ajustar();
    escena.fijarAvance(0.28);
    canvas.classList.add('listo');
    addEventListener('resize', () => { escena.ajustar(); escena.dibujar(); }, { passive: true });
    return;
  }

  let actual = 0;
  let meta = 0;
  let anterior = 0;
  let cuadro = 0;
  let recorrido = 1;
  const fijo = seccion.querySelector('.hero-fijo');
  const medir = () => {
    // Uso la altura de la escena y no innerHeight, que cambia con la barra de Safari
    recorrido = Math.max(1, seccion.offsetHeight - fijo.offsetHeight);
  };
  const suavizar = (ahora) => {
    // Suavizado por tiempo: se siente igual aunque la pantalla vaya a pocos cuadros
    actual += (meta - actual) * (1 - Math.exp(-(ahora - anterior) * 0.009));
    anterior = ahora;
    if (Math.abs(meta - actual) < 0.0002) actual = meta;
    escena.fijarAvance(actual);
    aplicarCapitulos(actual);
    // Al llegar al destino me detengo hasta el siguiente scroll
    cuadro = actual === meta ? 0 : requestAnimationFrame(suavizar);
  };
  const leerScroll = () => {
    meta = clamp01(-seccion.getBoundingClientRect().top / recorrido);
    if (meta === actual || cuadro) return;
    anterior = performance.now();
    cuadro = requestAnimationFrame(suavizar);
  };

  addEventListener('scroll', leerScroll, { passive: true });
  addEventListener('resize', () => { medir(); leerScroll(); }, { passive: true });
  // Al girar el celular, Safari avisa del resize antes de acomodar la página:
  // observo el lienzo para medir ya con el tamaño final
  new ResizeObserver(() => { medir(); leerScroll(); escena.remedir(); }).observe(canvas);
  new IntersectionObserver(([e]) => escena.fijarActiva(e.isIntersecting)).observe(seccion);

  // Al llegar las fuentes cambia la altura del texto
  if (document.fonts) document.fonts.ready.then(() => escena.remedir());

  medir();
  meta = clamp01(-seccion.getBoundingClientRect().top / recorrido);
  actual = meta;
  aplicarCapitulos(actual);
  escena.fijarAvance(actual);
  escena.iniciar();
};

iniciarHero();
