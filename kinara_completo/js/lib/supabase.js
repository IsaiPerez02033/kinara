/**
 * ============================================================
 * supabase.js — Cliente y funciones de base de datos Kinara
 * Aquí configuro la conexión con Supabase y defino todas
 * las funciones que el sitio web usa para leer y escribir
 * datos en la base de datos.
 *
 * CONFIGURACIÓN INICIAL:
 * 1. Ve a tu proyecto en supabase.com
 * 2. Settings → API
 * 3. Copia "Project URL" y "anon public key"
 * 4. Pégalos en las variables de abajo
 * ============================================================
 */

'use strict';


/* -------------------------------------------------------
   UTILIDAD DE SEGURIDAD — Escapado de HTML
   Uso esta función antes de insertar cualquier dato
   proveniente de la base de datos en innerHTML.
   Previene ataques XSS en caso de que un dato en la BD
   contenga etiquetas HTML o scripts maliciosos.
   ------------------------------------------------------- */
const escHTML = (str) => {
  if (str == null) return '';
  return String(str)
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#39;');
};


/* -------------------------------------------------------
   CONFIGURACIÓN DE SUPABASE
   ¡IMPORTANTE! Reemplaza estos valores con los de tu proyecto.
   El anon key es seguro para usarlo en el frontend porque
   las políticas RLS protegen los datos.
   ------------------------------------------------------- */
const SUPABASE_URL  = 'https://vnnhnnflnirfjzqpfvmt.supabase.co';   // Ej: https://xyzxyz.supabase.co
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZubmhubmZsbmlyZmp6cXBmdm10Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxNzc2NTksImV4cCI6MjA5MDc1MzY1OX0.YFAs8T5pX14-1w9CbXq0vXEuYPt8C0FZRiuNYOlqHFU';       // Ej: eyJhbGci...

/* -------------------------------------------------------
   CLIENTE DE SUPABASE
   Cargo el SDK de Supabase desde CDN y creo el cliente
   que usaré en todas las consultas.
   ------------------------------------------------------- */
// Importo el SDK de Supabase (UMD build desde CDN)
// Este script debe cargarse antes que supabase.js en el HTML
const { createClient } = window.supabase;

// Creo el cliente global de Supabase con la configuración del proyecto
const db = createClient(SUPABASE_URL, SUPABASE_ANON, {
  // Configuro el comportamiento de autenticación
  auth: {
    // No persisto la sesión en el sitio público (solo en el admin)
    persistSession: false,
    // No detecto automáticamente sesiones de la URL
    detectSessionInUrl: false
  }
});

/* -------------------------------------------------------
   MÓDULO: SUPABASE CLIENT
   Agrupa todas las funciones de acceso a la base de datos.
   Sigo el patrón de retornar { data, error } en cada función
   para un manejo consistente de errores en toda la app.
   ------------------------------------------------------- */
const SupabaseDB = (() => {

  /* =====================================================
     FUNCIONES DE PRODUCTOS
     ===================================================== */

  /**
   * Obtengo todos los productos con su stock y colección.
   * Uso la vista `productos_con_stock` que ya hace el JOIN.
   *
   * @param {Object} opciones - Filtros opcionales
   * @param {string} opciones.coleccion - Nombre de la colección a filtrar
   * @param {boolean} opciones.soloDisponibles - Si true, excluyo los agotados
   * @returns {Promise<{data: Array, error: Object}>}
   */
  const obtenerProductos = async ({ coleccion = null, soloDisponibles = false } = {}) => {
    try {
      // Inicio la consulta sobre la vista que ya tiene todo unido
      let consulta = db
        .from('productos_con_stock')
        .select('*');

      // Si me piden filtrar por colección, aplico el filtro
      if (coleccion && coleccion !== 'Todos') {
        // Uso ilike para que sea case-insensitive
        consulta = consulta.ilike('coleccion_nombre', `%${coleccion}%`);
      }

      // Si me piden solo los disponibles, excluyo los agotados
      if (soloDisponibles) {
        consulta = consulta.neq('estado_stock', 'agotado');
      }

      // Ordeno: destacados primero, luego por nombre
      consulta = consulta.order('destacado', { ascending: false });

      // Ejecuto la consulta y retorno el resultado
      const { data, error } = await consulta;

      return { data, error };

    } catch (err) {
      // Capturo errores de red o de configuración
      console.error('Error al obtener productos:', err);
      return { data: null, error: err };
    }
  };

  /**
   * Obtengo un producto específico por su ID.
   * Incluyo toda la información del producto y su stock.
   *
   * @param {string} id - UUID del producto
   * @returns {Promise<{data: Object, error: Object}>}
   */
  const obtenerProductoPorId = async (id) => {
    try {
      const { data, error } = await db
        .from('productos_con_stock')
        .select('*')
        .eq('id', id)   // Filtro por el UUID exacto
        .single();      // Espero exactamente un resultado

      return { data, error };

    } catch (err) {
      console.error('Error al obtener producto:', err);
      return { data: null, error: err };
    }
  };

  /**
   * Busco productos por texto en nombre, descripción o tags.
   * Útil para la búsqueda del catálogo (fase futura).
   *
   * @param {string} texto - Texto a buscar
   * @returns {Promise<{data: Array, error: Object}>}
   */
  const buscarProductos = async (texto) => {
    try {
      const { data, error } = await db
        .from('productos_con_stock')
        .select('*')
        // Supabase soporta búsqueda full-text con textSearch
        // Busco en nombre y descripción simultáneamente
        .or(`nombre.ilike.%${texto}%, descripcion.ilike.%${texto}%`);

      return { data, error };

    } catch (err) {
      console.error('Error en búsqueda:', err);
      return { data: null, error: err };
    }
  };

  /* =====================================================
     FUNCIONES DE INVENTARIO
     ===================================================== */

  /**
   * Obtengo el stock actual de un producto específico.
   * Esta función la llamo justo antes de agregar al carrito
   * para verificar disponibilidad en tiempo real.
   *
   * @param {string} productoId - UUID del producto
   * @returns {Promise<{data: Object, error: Object}>}
   */
  const obtenerStock = async (productoId) => {
    try {
      const { data, error } = await db
        .from('inventario')
        .select('stock_actual, stock_minimo')
        .eq('producto_id', productoId)
        .single();

      return { data, error };

    } catch (err) {
      console.error('Error al obtener stock:', err);
      return { data: null, error: err };
    }
  };

  /**
   * Actualizo el stock de un producto desde el panel admin.
   * Esta función requiere el service_role key (solo admin).
   *
   * @param {string} productoId - UUID del producto
   * @param {number} nuevoStock - Nuevo valor del stock
   * @returns {Promise<{data: Object, error: Object}>}
   */
  const actualizarStock = async (productoId, nuevoStock) => {
    try {
      const { data, error } = await db
        .from('inventario')
        .update({
          stock_actual: nuevoStock
          // updated_at se actualiza automáticamente con el trigger
        })
        .eq('producto_id', productoId)
        .select();   // Retorno el registro actualizado

      return { data, error };

    } catch (err) {
      console.error('Error al actualizar stock:', err);
      return { data: null, error: err };
    }
  };

  /* =====================================================
     FUNCIONES DE COLECCIONES
     ===================================================== */

  /**
   * Obtengo todas las colecciones activas.
   * Las uso para renderizar la sección de colecciones
   * y los filtros del catálogo.
   *
   * @returns {Promise<{data: Array, error: Object}>}
   */
  const obtenerColecciones = async () => {
    try {
      const { data, error } = await db
        .from('colecciones')
        .select('*')
        .eq('activa', TRUE)      // Solo las colecciones activas
        .order('nombre');         // Ordenadas alfabéticamente

      return { data, error };

    } catch (err) {
      console.error('Error al obtener colecciones:', err);
      return { data: null, error: err };
    }
  };

  /* =====================================================
     FUNCIONES DE CONTACTO
     ===================================================== */

  /**
   * Guardo un mensaje del formulario de contacto.
   * Esta función la llama el sitio público cuando alguien
   * envía el formulario de contacto.
   *
   * @param {Object} contacto - Datos del formulario
   * @param {string} contacto.nombre - Nombre del remitente
   * @param {string} contacto.email - Email de contacto
   * @param {string} contacto.tipo_consulta - Tipo de consulta
   * @param {string} contacto.mensaje - Mensaje completo
   * @returns {Promise<{data: Object, error: Object}>}
   */
  const guardarContacto = async ({ nombre, email, tipo_consulta, mensaje }) => {
    try {
      // Valido que los campos obligatorios estén presentes
      if (!nombre || !email || !mensaje) {
        return {
          data: null,
          error: { message: 'Nombre, email y mensaje son obligatorios.' }
        };
      }

      // Valido el formato del email con una expresión regular básica
      const emailValido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      if (!emailValido) {
        return {
          data: null,
          error: { message: 'El formato del email no es válido.' }
        };
      }

      // Inserto el registro en la tabla de contactos
      const { data, error } = await db
        .from('contactos')
        .insert([{ nombre, email, tipo_consulta, mensaje }])
        .select();   // Retorno el registro insertado (con el ID asignado)

      return { data, error };

    } catch (err) {
      console.error('Error al guardar contacto:', err);
      return { data: null, error: err };
    }
  };

  /* =====================================================
     FUNCIONES DEL PANEL ADMIN
     Estas funciones usan el service_role key para
     operaciones que RLS restringe a administradores.
     Las llamo solo desde admin.html.
     ===================================================== */

  /**
   * Obtengo todos los contactos sin responder para el admin.
   * Los ordeno de más reciente a más antiguo.
   *
   * @returns {Promise<{data: Array, error: Object}>}
   */
  const obtenerContactosPendientes = async () => {
    try {
      const { data, error } = await db
        .from('contactos')
        .select('*')
        .eq('respondido', false)
        .order('created_at', { ascending: false });

      return { data, error };

    } catch (err) {
      console.error('Error al obtener contactos:', err);
      return { data: null, error: err };
    }
  };

  /**
   * Marco un contacto como respondido desde el panel admin.
   *
   * @param {string} id - UUID del contacto
   * @param {string} notas - Notas internas del admin (opcional)
   * @returns {Promise<{data: Object, error: Object}>}
   */
  const marcarContactoRespondido = async (id, notas = '') => {
    try {
      const { data, error } = await db
        .from('contactos')
        .update({ respondido: true, notas_admin: notas })
        .eq('id', id)
        .select();

      return { data, error };

    } catch (err) {
      console.error('Error al marcar contacto:', err);
      return { data: null, error: err };
    }
  };

  /**
   * Actualizo los datos de un producto desde el panel admin.
   *
   * @param {string} id - UUID del producto
   * @param {Object} campos - Campos a actualizar
   * @returns {Promise<{data: Object, error: Object}>}
   */
  const actualizarProducto = async (id, campos) => {
    try {
      const { data, error } = await db
        .from('productos')
        .update(campos)
        .eq('id', id)
        .select();

      return { data, error };

    } catch (err) {
      console.error('Error al actualizar producto:', err);
      return { data: null, error: err };
    }
  };

  /**
   * Obtengo todos los pedidos para el panel admin.
   * Incluyo los datos del cliente y los items del pedido.
   *
   * @param {string} estado - Filtrar por estado (opcional)
   * @returns {Promise<{data: Array, error: Object}>}
   */
  const obtenerPedidos = async (estado = null) => {
    try {
      let consulta = db
        .from('pedidos')
        .select(`
          *,
          clientes (nombre, email, telefono),
          pedido_items (
            cantidad,
            precio_unitario,
            productos (nombre, imagen_url)
          )
        `)
        .order('created_at', { ascending: false });

      // Aplico filtro de estado si me lo piden
      if (estado) {
        consulta = consulta.eq('estado', estado);
      }

      const { data, error } = await consulta;
      return { data, error };

    } catch (err) {
      console.error('Error al obtener pedidos:', err);
      return { data: null, error: err };
    }
  };

  /**
   * Actualizo el estado de un pedido desde el panel admin.
   *
   * @param {string} id - UUID del pedido
   * @param {string} nuevoEstado - Nuevo estado del pedido
   * @param {string} notas - Notas opcionales para el admin
   * @returns {Promise<{data: Object, error: Object}>}
   */
  const actualizarEstadoPedido = async (id, nuevoEstado, notas = '') => {
    try {
      const { data, error } = await db
        .from('pedidos')
        .update({
          estado: nuevoEstado,
          notas: notas
          // updated_at se actualiza automáticamente con el trigger
        })
        .eq('id', id)
        .select();

      return { data, error };

    } catch (err) {
      console.error('Error al actualizar pedido:', err);
      return { data: null, error: err };
    }
  };

  /* =====================================================
     TIEMPO REAL (REALTIME)
     Supabase soporta suscripciones en tiempo real.
     Cuando alguien compra una pieza, el inventario
     se actualiza automáticamente en todos los navegadores.
     ===================================================== */

  /**
   * Me suscribo a cambios de inventario en tiempo real.
   * Cuando el stock de cualquier producto cambia, ejecuto
   * el callback con los nuevos datos.
   *
   * @param {Function} callback - Función a ejecutar cuando hay cambios
   * @returns {Object} - Referencia al canal (para desuscribirse después)
   */
  const suscribirseAlInventario = (callback) => {
    // Creo un canal de tiempo real para la tabla inventario
    const canal = db
      .channel('inventario-tiempo-real')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',        // Solo me interesan las actualizaciones
          schema: 'public',       // Esquema público de la base de datos
          table: 'inventario'     // Tabla a observar
        },
        (payload) => {
          // Cuando hay un cambio, llamo al callback con los nuevos datos
          console.log('Stock actualizado en tiempo real:', payload);
          callback(payload.new);  // payload.new tiene los datos actualizados
        }
      )
      .subscribe();

    // Retorno el canal para que el llamador pueda desuscribirse
    return canal;
  };

  /**
   * Me desuscribo de un canal de tiempo real.
   *
   * @param {Object} canal - Canal retornado por suscribirseAlInventario
   */
  const desuscribirse = (canal) => {
    if (canal) {
      db.removeChannel(canal);
    }
  };

  /* =====================================================
     UTILIDADES
     ===================================================== */

  /**
   * Verifico si hay conexión con Supabase.
   * Útil para mostrar un mensaje de error si el sitio
   * no puede conectarse a la base de datos.
   *
   * @returns {Promise<boolean>}
   */
  const verificarConexion = async () => {
    try {
      // Hago una consulta mínima para verificar la conexión
      const { error } = await db
        .from('colecciones')
        .select('id')
        .limit(1);

      return !error;

    } catch {
      return false;
    }
  };

  // Expongo todas las funciones del módulo
  return {
    // Productos
    obtenerProductos,
    obtenerProductoPorId,
    buscarProductos,

    // Inventario
    obtenerStock,
    actualizarStock,

    // Colecciones
    obtenerColecciones,

    // Contacto
    guardarContacto,

    // Admin
    obtenerContactosPendientes,
    marcarContactoRespondido,
    actualizarProducto,
    obtenerPedidos,
    actualizarEstadoPedido,

    // Tiempo real
    suscribirseAlInventario,
    desuscribirse,

    // Utilidades
    verificarConexion,

    // Expongo el cliente raw para casos especiales
    cliente: db
  };
})();

// Expongo el módulo globalmente para acceder desde otros scripts
window.SupabaseDB = SupabaseDB;
