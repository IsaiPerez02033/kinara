/**
 * main.js — Comportamientos globales del sitio Kinara:
 * header, menú móvil, sección activa y animaciones de entrada.
 * La escena 3D del hero vive en hero3d.js.
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

const ModuloMenu = (() => {
  const iniciar = () => {
    const menu = document.getElementById('menu-movil');
    const abrir = document.getElementById('menu-movil-abrir');
    const cerrar = document.getElementById('menu-movil-cerrar');
    if (!menu || !abrir || !cerrar) return;

    const fijar = (abierto) => {
      menu.classList.toggle('abierto', abierto);
      abrir.setAttribute('aria-expanded', String(abierto));
      document.body.style.overflow = abierto ? 'hidden' : '';
      (abierto ? cerrar : abrir).focus({ preventScroll: true });
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
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
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
  ModuloSeccionActiva.iniciar();
  ModuloAnimaciones.iniciar();
  ModuloEnlaces.iniciar();
});
