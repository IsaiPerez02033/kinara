/**
 * cotizar.js — Cotización a medida (pages/cotizar)
 * Sube los archivos al bucket privado "cotizaciones" dentro de la
 * carpeta de la cuenta, guarda la solicitud y avisa a Kinara.
 * RLS solo deja crear solicitudes propias, sin precio y con
 * archivos de la propia carpeta.
 */
'use strict';

(() => {
  const db = SupabaseDB.cliente;
  const $ = (id) => document.getElementById(id);

  const MAX_ARCHIVOS = 6;
  const MAX_MB = 25;
  const EXTENSIONES = ['stl', 'obj', '3mf', 'step', 'stp', 'jpg', 'jpeg', 'png', 'webp', 'heic', 'pdf'];
  let archivos = [];

  const extension = (nombre) => (nombre.split('.').pop() || '').toLowerCase();
  const tamano = (bytes) => bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

  const mensaje = (texto, tipo = 'error') => {
    const el = $('cot-mensaje');
    el.textContent = texto;
    el.dataset.tipo = tipo;
    el.hidden = !texto;
  };

  /* ---------- Archivos ---------- */
  const pintarArchivos = () => {
    $('cot-lista').innerHTML = archivos.map((f, i) => `
      <li>
        <span class="cotizar-archivo-ext">${escHTML(extension(f.name).toUpperCase())}</span>
        <span class="cotizar-archivo-nombre">${escHTML(f.name)}</span>
        <span class="cotizar-archivo-peso">${tamano(f.size)}</span>
        <button type="button" class="acceso-link acceso-link--peligro" data-quitar="${i}" aria-label="Quitar ${escHTML(f.name)}">Quitar</button>
      </li>`).join('');
  };

  const agregarArchivos = (lista) => {
    const rechazados = [];
    for (const f of lista) {
      if (!EXTENSIONES.includes(extension(f.name))) { rechazados.push(`${f.name}: formato no permitido`); continue; }
      if (f.size > MAX_MB * 1048576) { rechazados.push(`${f.name}: pesa más de ${MAX_MB} MB`); continue; }
      if (archivos.length >= MAX_ARCHIVOS) { rechazados.push(`Máximo ${MAX_ARCHIVOS} archivos`); break; }
      if (!archivos.some((a) => a.name === f.name && a.size === f.size)) archivos.push(f);
    }
    pintarArchivos();
    mensaje(rechazados.length ? rechazados.join('. ') + '.' : '');
  };

  $('cot-archivos').addEventListener('change', (e) => {
    agregarArchivos([...e.target.files]);
    e.target.value = '';
  });
  $('cot-lista').addEventListener('click', (e) => {
    const b = e.target.closest('[data-quitar]');
    if (!b) return;
    archivos.splice(Number(b.dataset.quitar), 1);
    pintarArchivos();
  });
  const zona = $('cot-zona');
  zona.addEventListener('dragover', (e) => { e.preventDefault(); zona.classList.add('arrastrando'); });
  zona.addEventListener('dragleave', () => zona.classList.remove('arrastrando'));
  zona.addEventListener('drop', (e) => {
    e.preventDefault();
    zona.classList.remove('arrastrando');
    agregarArchivos([...(e.dataTransfer?.files || [])]);
  });

  // Nombre seguro para Storage: sin acentos, espacios ni símbolos
  const nombreSeguro = (nombre) => {
    const ext = extension(nombre);
    const base = nombre.slice(0, -(ext.length + 1)).normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'archivo';
    return `${base}.${ext}`;
  };

  /* ---------- Enviar ---------- */
  const leer = () => ({
    tipo: $('cot-tipo').value,
    titulo: $('cot-titulo').value.trim(),
    descripcion: $('cot-descripcion').value.trim(),
    cantidad: parseInt($('cot-cantidad').value, 10),
    medidas: $('cot-medidas').value.trim() || null,
    material: $('cot-material').value || null,
    color: $('cot-color').value.trim() || null,
  });

  const validar = (d) => {
    const reglas = [
      ['cot-titulo', d.titulo.length >= 3, 'Ponle un nombre corto a tu pieza.'],
      ['cot-descripcion', d.descripcion.length >= 10, 'Cuéntanos un poco más de la pieza (mínimo 10 letras).'],
      ['cot-cantidad', Number.isInteger(d.cantidad) && d.cantidad >= 1 && d.cantidad <= 1000, 'La cantidad va de 1 a 1000.'],
    ];
    document.querySelectorAll('#form-cotizar .checkout-input').forEach((i) => i.classList.remove('error'));
    const falla = reglas.find(([, ok]) => !ok);
    if (!falla) return true;
    $(falla[0]).classList.add('error');
    $(falla[0]).focus();
    mensaje(falla[2]);
    return false;
  };

  const enviar = async (e) => {
    e.preventDefault();
    const datos = leer();
    if (!validar(datos)) return;

    const usuario = ModuloSesion.usuario();
    const boton = $('cot-enviar');
    boton.disabled = true;
    mensaje('');

    const subidos = [];
    try {
      for (const [i, f] of archivos.entries()) {
        boton.textContent = `Subiendo ${i + 1} de ${archivos.length}…`;
        const ruta = `${usuario.id}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${nombreSeguro(f.name)}`;
        const { error } = await db.storage.from('cotizaciones')
          .upload(ruta, f, { contentType: f.type || 'application/octet-stream', upsert: false });
        if (error) throw new Error(`No se pudo subir ${f.name}. Intenta de nuevo.`);
        subidos.push(ruta);
      }

      boton.textContent = 'Enviando…';
      const { data, error } = await db.from('cotizaciones')
        .insert({ ...datos, archivos: subidos })
        .select('id')
        .single();
      if (error) throw new Error(/5 cotizaciones/.test(error.message) ? error.message : 'No se pudo guardar tu solicitud. Intenta de nuevo.');

      // El aviso a Kinara no detiene al cliente si falla
      db.functions.invoke('aviso-cotizacion', { body: { cotizacion_id: data.id } })
        .catch((err) => console.warn('Aviso de cotización:', err));

      $('form-cotizar').hidden = true;
      $('cotizar-listo').hidden = false;
      $('cotizar-listo').focus();
    } catch (err) {
      if (subidos.length) await db.storage.from('cotizaciones').remove(subidos).catch(() => {});
      mensaje(err.message);
    } finally {
      boton.disabled = false;
      boton.textContent = 'Pedir cotización';
    }
  };

  $('form-cotizar').addEventListener('submit', enviar);

  /* ---------- Inicio ---------- */
  (async () => {
    const tipo = new URLSearchParams(location.search).get('tipo');
    if (['a_medida', 'figura', 'volumen', 'otro'].includes(tipo)) $('cot-tipo').value = tipo;

    const usuario = await ModuloSesion.listo;
    $('cotizar-cargando').hidden = true;

    if (!usuario) {
      const volver = encodeURIComponent(location.pathname + location.search);
      $('cotizar-entrar').href = `acceso?volver=${volver}`;
      $('cotizar-registro').href = `acceso?modo=registro&volver=${volver}`;
      $('cotizar-sin-sesion').hidden = false;
      return;
    }

    $('form-cotizar').hidden = false;
    if (!ModuloSesion.confirmado()) {
      $('cotizar-aviso').textContent = 'Confirma tu correo con el enlace que te mandamos para poder pedir cotizaciones.';
      $('cotizar-aviso').hidden = false;
      $('cot-enviar').disabled = true;
    }
  })();
})();
