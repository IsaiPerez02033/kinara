/**
 * ============================================================
 * main.js — Controlador principal del sitio Kinara
 * Gestiono aquí todos los comportamientos globales:
 * cursor personalizado, header en scroll, animaciones
 * de entrada y el sistema de partículas del hero.
 * Organizo el código en módulos con funciones claras
 * y comentadas para facilitar el mantenimiento.
 * ============================================================
 */

'use strict'; // Activo el modo estricto para un código más seguro

/* -------------------------------------------------------
   MÓDULO: CURSOR PERSONALIZADO
   Controlo el cursor dorado que sigue al mouse con
   un punto central y un anillo exterior con retraso.
   ------------------------------------------------------- */
const ModuloCursor = (() => {

  // Obtengo los elementos del DOM del cursor
  const punto = document.getElementById('cursor-punto');
  const anillo = document.getElementById('cursor-anillo');

  // Posición actual del mouse (la actualizo en cada movimiento)
  let mouseX = 0;
  let mouseY = 0;

  // Posición del anillo (la animo con retraso para el efecto suave)
  let anilloX = 0;
  let anilloY = 0;

  /**
   * Muevo el punto del cursor a la posición exacta del mouse.
   * Uso requestAnimationFrame para sincronizar con el render
   * del navegador y lograr la animación más suave posible.
   */
  const moverCursor = (e) => {
    // Actualizo las coordenadas del mouse
    mouseX = e.clientX;
    mouseY = e.clientY;

    // El punto sigue el cursor exactamente, sin retraso
    if (punto) {
      punto.style.left = mouseX + 'px';
      punto.style.top  = mouseY + 'px';
    }
  };

  /**
   * Animo el anillo con un efecto de interpolación (lerp) para
   * que siga al cursor con un leve retraso suave y orgánico.
   * Este loop se ejecuta cada frame mientras la página está activa.
   */
  const animarAnillo = () => {
    // Interpolación lineal: muevo el anillo hacia el mouse en cada frame
    // Factor 0.12: más bajo = más retraso; más alto = más directo
    anilloX += (mouseX - anilloX) * 0.12;
    anilloY += (mouseY - anilloY) * 0.12;

    // Aplico la posición interpolada al anillo
    if (anillo) {
      anillo.style.left = anilloX + 'px';
      anillo.style.top  = anilloY + 'px';
    }

    // Solicito el siguiente frame de animación (loop continuo)
    requestAnimationFrame(animarAnillo);
  };

  /**
   * Gestiono los efectos del cursor al entrar y salir de
   * elementos interactivos (links, botones, tarjetas).
   */
  const configurarHovers = () => {
    // Selecciono todos los elementos que deben activar el efecto hover
    const elementosInteractivos = document.querySelectorAll(
      'a, button, .tarjeta-producto, .coleccion-card, .filtro-btn, [role="button"]'
    );

    // Al entrar en un elemento interactivo: agrando el anillo
    elementosInteractivos.forEach(el => {
      el.addEventListener('mouseenter', () => {
        document.body.classList.add('cursor-hover');
      });

      // Al salir: vuelvo al tamaño normal
      el.addEventListener('mouseleave', () => {
        document.body.classList.remove('cursor-hover');
      });
    });
  };

  /**
   * Inicializo el módulo del cursor.
   * Solo lo activo en dispositivos no táctiles.
   */
  const iniciar = () => {
    // Verifico que no sea un dispositivo táctil
    const esTactil = window.matchMedia('(pointer: coarse)').matches;
    if (esTactil) return;

    // Escucho el movimiento del mouse en toda la página
    document.addEventListener('mousemove', moverCursor);

    // Inicio el loop de animación del anillo
    animarAnillo();

    // Configuro los efectos de hover en elementos interactivos
    configurarHovers();
  };

  // Expongo solo el método de inicialización
  return { iniciar };
})();


/* -------------------------------------------------------
   MÓDULO: HEADER EN SCROLL
   El header cambia de transparente a sólido cuando
   el usuario hace scroll más allá de la sección hero.
   ------------------------------------------------------- */
const ModuloHeader = (() => {

  // Obtengo el elemento del header
  const header = document.getElementById('header');

  /**
   * Actualizo el estado del header según la posición del scroll.
   * Uso un umbral de 80px (la altura del header) para activar
   * el estado sólido.
   */
  const actualizarHeader = () => {
    if (!header) return;

    // Si el scroll es mayor al umbral, aplico el estado sólido
    if (window.scrollY > 80) {
      header.classList.remove('transparente');
      header.classList.add('solido');
    } else {
      header.classList.remove('solido');
      header.classList.add('transparente');
    }
  };

  /**
   * Inicializo el módulo del header.
   */
  const iniciar = () => {
    if (!header) return;

    // Establezco el estado inicial (transparente)
    header.classList.add('transparente');

    // Escucho el evento de scroll con la opción passive para mejor rendimiento
    window.addEventListener('scroll', actualizarHeader, { passive: true });

    // Ejecuto una vez al inicio por si la página ya está scrolleada
    actualizarHeader();
  };

  return { iniciar };
})();


/* -------------------------------------------------------
   MÓDULO: ANIMACIONES DE ENTRADA (SCROLL REVEAL)
   Animo los elementos con la clase .reveal cuando
   entran al viewport usando Intersection Observer.
   ------------------------------------------------------- */
const ModuloAnimaciones = (() => {

  /**
   * Configuro el Intersection Observer que detecta cuándo
   * cada elemento .reveal entra en la vista del usuario.
   */
  const configurarObserver = () => {
    // Opciones del observer: activo cuando el 15% del elemento es visible
    const opciones = {
      threshold: 0.15,
      // Activo 100px antes de que el elemento entre en pantalla
      rootMargin: '0px 0px -100px 0px'
    };

    // Creo el observer con el callback de activación
    const observer = new IntersectionObserver((entradas) => {
      entradas.forEach(entrada => {
        // Si el elemento está intersectando el viewport
        if (entrada.isIntersecting) {
          // Agrego la clase .visible para activar la animación CSS
          entrada.target.classList.add('visible');
          // Dejo de observar este elemento (la animación solo ocurre una vez)
          observer.unobserve(entrada.target);
        }
      });
    }, opciones);

    // Observo todos los elementos con la clase .reveal en la página
    document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
  };

  const iniciar = () => {
    // Verifico que el navegador soporte Intersection Observer
    if (!('IntersectionObserver' in window)) {
      // Fallback: muestro todos los elementos directamente
      document.querySelectorAll('.reveal').forEach(el => el.classList.add('visible'));
      return;
    }

    configurarObserver();
  };

  return { iniciar };
})();


/* -------------------------------------------------------
   MÓDULO: PARTÍCULAS DEL HERO
   Creo un campo de partículas doradas que flotan en el
   canvas del hero, simulando polvo de luz.
   ------------------------------------------------------- */
const ModuloParticulas = (() => {

  // Obtengo el canvas del hero
  const canvas = document.getElementById('canvas-particulas');

  // Solo continúo si el canvas existe en la página
  if (!canvas) return { iniciar: () => {} };

  // Contexto 2D del canvas para dibujar
  const ctx = canvas.getContext('2d');

  // Array que almacena todas las partículas activas
  let particulas = [];

  // Número de partículas según el tamaño de la pantalla
  let numParticulas = 60;

  /**
   * Ajusto el tamaño del canvas al tamaño de la ventana.
   * Lo llamo al iniciar y al redimensionar la ventana.
   */
  const ajustarCanvas = () => {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
  };

  /**
   * Clase que representa una partícula individual.
   * Cada partícula tiene posición, velocidad, tamaño y opacidad propios.
   */
  class Particula {
    constructor() {
      // Inicializo la partícula en una posición aleatoria
      this.reiniciar();
    }

    /**
     * Reinicio la partícula con valores aleatorios.
     * Lo llamo al crear la partícula y cuando sale del canvas.
     */
    reiniciar() {
      // Posición aleatoria en todo el canvas
      this.x = Math.random() * canvas.width;
      this.y = Math.random() * canvas.height;

      // Tamaño muy pequeño: entre 0.5 y 2 píxeles
      this.radio = Math.random() * 1.5 + 0.5;

      // Velocidad de movimiento lenta y suave
      this.vx = (Math.random() - 0.5) * 0.3; // Movimiento horizontal leve
      this.vy = -Math.random() * 0.4 - 0.1;  // Siempre sube suavemente

      // Opacidad: entre 0.1 y 0.5 para sutileza
      this.opacidad = Math.random() * 0.4 + 0.1;

      // Velocidad de parpadeo de la opacidad
      this.parpadeo = Math.random() * 0.01 + 0.005;

      // Dirección del parpadeo (aumenta o disminuye opacidad)
      this.dirParpadeo = Math.random() > 0.5 ? 1 : -1;
    }

    /**
     * Actualizo la posición y el estado de la partícula en cada frame.
     */
    actualizar() {
      // Muevo la partícula según su velocidad
      this.x += this.vx;
      this.y += this.vy;

      // Animo el parpadeo de la opacidad
      this.opacidad += this.parpadeo * this.dirParpadeo;

      // Invierto la dirección del parpadeo en los límites
      if (this.opacidad >= 0.5 || this.opacidad <= 0.05) {
        this.dirParpadeo *= -1;
      }

      // Si la partícula sale del canvas por arriba, la reinicio abajo
      if (this.y < -10) {
        this.y = canvas.height + 10;
        this.x = Math.random() * canvas.width;
      }

      // Si sale por los lados, la reinicio en el lado contrario
      if (this.x < -10) this.x = canvas.width + 10;
      if (this.x > canvas.width + 10) this.x = -10;
    }

    /**
     * Dibujo la partícula en el canvas como un círculo dorado.
     */
    dibujar() {
      ctx.save(); // Guardo el estado del contexto

      // Configuro el estilo de la partícula
      ctx.globalAlpha = this.opacidad;
      ctx.fillStyle = '#D4A373'; // Color dorado de la marca

      // Dibujo el círculo
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radio, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore(); // Restauro el estado del contexto
    }
  }

  /**
   * Creo el conjunto inicial de partículas.
   */
  const crearParticulas = () => {
    // Ajusto el número de partículas según el ancho de la pantalla
    numParticulas = window.innerWidth < 768 ? 30 : 60;

    // Limpio el array y creo las nuevas partículas
    particulas = [];
    for (let i = 0; i < numParticulas; i++) {
      particulas.push(new Particula());
    }
  };

  /**
   * Loop de animación: actualizo y dibujo todas las partículas
   * en cada frame del navegador (aprox. 60fps).
   */
  const animar = () => {
    // Limpio el canvas completo antes de cada frame
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Actualizo y dibujo cada partícula
    particulas.forEach(p => {
      p.actualizar();
      p.dibujar();
    });

    // Solicito el siguiente frame (loop continuo)
    requestAnimationFrame(animar);
  };

  /**
   * Inicializo el módulo de partículas.
   */
  const iniciar = () => {
    ajustarCanvas();
    crearParticulas();
    animar();

    // Ajusto el canvas si el usuario redimensiona la ventana
    window.addEventListener('resize', () => {
      ajustarCanvas();
      crearParticulas();
    }, { passive: true });
  };

  return { iniciar };
})();


/* -------------------------------------------------------
   MÓDULO: NAVEGACIÓN SUAVE
   Gestiono el scroll suave al hacer clic en los
   links del menú de navegación.
   ------------------------------------------------------- */
const ModuloNavegacion = (() => {

  /**
   * Configuro el scroll suave para todos los links ancla
   * que empiezan con "#" (links internos de la página).
   */
  const configurarScrollSuave = () => {
    // Selecciono todos los links del menú de navegación
    document.querySelectorAll('a[href^="#"]').forEach(link => {
      link.addEventListener('click', (e) => {
        // Prevengo el comportamiento por defecto (salto instantáneo)
        e.preventDefault();

        // Obtengo el elemento destino del scroll
        const destino = document.querySelector(link.getAttribute('href'));

        if (destino) {
          // Calculo la posición considerando la altura del header fijo
          const posicion = destino.getBoundingClientRect().top + window.scrollY - 80;

          // Animo el scroll hasta la posición calculada
          window.scrollTo({
            top: posicion,
            behavior: 'smooth'
          });
        }
      });
    });
  };

  const iniciar = () => {
    configurarScrollSuave();
  };

  return { iniciar };
})();


/* -------------------------------------------------------
   PUNTO DE ENTRADA
   Inicializo todos los módulos cuando el DOM está listo.
   ------------------------------------------------------- */
document.addEventListener('DOMContentLoaded', () => {
  // Inicio cada módulo en el orden adecuado
  ModuloCursor.iniciar();
  ModuloHeader.iniciar();
  ModuloAnimaciones.iniciar();
  ModuloParticulas.iniciar();
  ModuloNavegacion.iniciar();

  // Log de confirmación en desarrollo (lo removería en producción)
  console.log('✦ Kinara — Sistema iniciado correctamente');
});
