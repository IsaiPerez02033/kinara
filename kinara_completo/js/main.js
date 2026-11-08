/**
 * main.js — Comportamientos globales del sitio Kinara:
 * header, menú móvil, sección activa y animaciones de entrada.
 * El hero (la P2S imprimiendo) vive en hero-secuencia.js.
 */

'use strict';

const ModuloHeader = (() => {
  const iniciar = () => {
    const header = document.getElementById('header');
    if (!header) return;
    const actualizar = () => header.classList.toggle('solido', window.scrollY > 40);
    window.addEventListener('scroll', actualizar, { passive: true });
    actualizar();
  };
  return { iniciar };
})();

/* Safari en iPhone pinta sus barras (arriba y abajo) con theme-color:
   lo cambio al color de la sección que queda bajo la barra superior */
const ModuloColorBarra = (() => {
  const iniciar = () => {
    const meta = document.querySelector('meta[name="theme-color"]');
    const bloques = document.querySelectorAll('#hero, .cinta, .seccion, #footer');
    if (!meta || !bloques.length || !('IntersectionObserver' in window)) return;
    const color = new Map();
    bloques.forEach((el) => {
      const c = getComputedStyle(el).getPropertyValue('--fondo').trim() || getComputedStyle(el).backgroundColor;
      color.set(el, c);
    });
    const obs = new IntersectionObserver((entradas) => {
      entradas.forEach((e) => {
        if (e.isIntersecting && color.get(e.target)) meta.setAttribute('content', color.get(e.target));
      });
    }, { rootMargin: '0px 0px -99% 0px' });
    bloques.forEach((el) => obs.observe(el));
  };
  return { iniciar };
})();

const ModuloMenu = (() => {
  const iniciar = () => {
    const menu = document.getElementById('menu-movil');
    const abrir = document.getElementById('menu-movil-abrir');
    const cerrar = document.getElementById('menu-movil-cerrar');
    if (!menu || !abrir || !cerrar) return;

    // El foco solo se mueve si se usa teclado: con el dedo dejaba el anillo pintado en Safari
    let conTeclado = false;
    addEventListener('keydown', () => { conTeclado = true; }, { passive: true });
    addEventListener('pointerdown', () => { conTeclado = false; }, { passive: true });

    const fijar = (abierto) => {
      menu.classList.toggle('abierto', abierto);
      abrir.setAttribute('aria-expanded', String(abierto));
      document.body.style.overflow = abierto ? 'hidden' : '';
      if (conTeclado) (abierto ? cerrar : abrir).focus({ preventScroll: true });
      else if (!abierto) document.activeElement?.blur();
    };

    abrir.addEventListener('click', () => fijar(true));
    cerrar.addEventListener('click', () => fijar(false));
    menu.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => fijar(false)));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && menu.classList.contains('abierto')) fijar(false);
    });
  };
  return { iniciar };
})();

/* Marco en el menú la sección que se está viendo */
const ModuloSeccionActiva = (() => {
  const iniciar = () => {
    const enlaces = [...document.querySelectorAll('.nav-link')];
    if (!enlaces.length || !('IntersectionObserver' in window)) return;

    const observer = new IntersectionObserver((entradas) => {
      entradas.forEach((e) => {
        if (!e.isIntersecting) return;
        enlaces.forEach((a) => a.classList.toggle('activo', a.getAttribute('href') === `#${e.target.id}`));
      });
    }, { rootMargin: '-45% 0px -50% 0px' });

    document.querySelectorAll('main section[id]').forEach((s) => observer.observe(s));
  };
  return { iniciar };
})();

const ModuloAnimaciones = (() => {
  const iniciar = () => {
    const elementos = document.querySelectorAll('.reveal');
    if (!('IntersectionObserver' in window)) {
      elementos.forEach((el) => el.classList.add('visible'));
      return;
    }
    const observer = new IntersectionObserver((entradas) => {
      entradas.forEach((e) => {
        if (!e.isIntersecting) return;
        e.target.classList.add('visible');
        observer.unobserve(e.target);
      });
    }, { threshold: 0, rootMargin: '0px 0px -40px 0px' });
    elementos.forEach((el) => observer.observe(el));
  };
  return { iniciar };
})();

/* Los enlaces de categoría filtran el catálogo antes de bajar a él */
const ModuloEnlaces = (() => {
  const iniciar = () => {
    document.querySelectorAll('[data-filtro]').forEach((el) => {
      el.addEventListener('click', () => ModuloCatalogo.activarFiltro(el.dataset.filtro));
    });
    document.querySelectorAll('[data-consulta]').forEach((el) => {
      el.addEventListener('click', () => ModuloContacto.preparar(el.dataset.consulta));
    });
    const anio = document.getElementById('anio');
    if (anio) anio.textContent = new Date().getFullYear();
  };
  return { iniciar };
})();

document.addEventListener('DOMContentLoaded', () => {
  ModuloHeader.iniciar();
  ModuloMenu.iniciar();
  ModuloColorBarra.iniciar();
  ModuloSeccionActiva.iniciar();
  ModuloAnimaciones.iniciar();
  ModuloEnlaces.iniciar();
});
