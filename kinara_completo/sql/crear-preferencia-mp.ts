// ============================================================
// crear-preferencia-mp.ts — Edge Function SEGURA (versión 2)
//
// CAMBIO CLAVE vs la versión anterior:
// Ignoro completamente los precios que manda el frontend.
// Solo uso los IDs de productos y cantidades del carrito.
// Los precios los leo directamente de la base de datos.
// Así, ningún usuario puede manipular el precio desde el navegador.
//
// Flujo:
//   Frontend → manda { producto_id, cantidad }[]
//   Edge Function → consulta precio real en Supabase
//   Edge Function → crea preferencia en MP con el precio real
// ============================================================

import { serve }        from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {

  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const body = await req.json();
    const { pedido_id, items, payer, back_urls, auto_return, external_reference } = body;

    // Valido que me lleguen IDs y cantidades (no precios — esos los ignoro)
    if (!pedido_id || !items?.length) {
      return respuesta(400, { error: "Datos incompletos" });
    }

    const accessToken  = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN");
    const supabaseUrl  = Deno.env.get("SUPABASE_URL");
    const serviceKey   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!accessToken || !supabaseUrl || !serviceKey) {
      throw new Error("Variables de entorno incompletas");
    }

    // Conecto a Supabase con el service_role para leer precios reales
    const supabase = createClient(supabaseUrl, serviceKey);

    // Extraigo solo los IDs de productos que viene del frontend
    const productoIds = items.map((i: any) => i.id);

    // Consulto los precios y nombres REALES desde la base de datos
    // El frontend nunca puede alterar estos valores
    const { data: productosDB, error: errorDB } = await supabase
      .from("productos")
      .select("id, nombre, precio, colecciones(nombre)")
      .in("id", productoIds);

    if (errorDB || !productosDB?.length) {
      throw new Error("No se pudieron verificar los precios: " + errorDB?.message);
    }

    // Construyo los items con precios reales de la BD, no del frontend
    const itemsVerificados = items.map((itemFrontend: any) => {
      const productoDB = productosDB.find((p: any) => p.id === itemFrontend.id);

      if (!productoDB) {
        throw new Error(`Producto ${itemFrontend.id} no encontrado en la base de datos`);
      }

      // Uso el precio de Supabase — el precio del frontend se descarta
      const precioReal = Number(productoDB.precio);
      const cantidad   = Number(itemFrontend.quantity ?? itemFrontend.cantidad ?? 1);

      // Registro en el log si alguien intentó manipular el precio
      const precioFrontend = Number(itemFrontend.unit_price ?? itemFrontend.precio ?? 0);
      if (precioFrontend !== precioReal) {
        console.warn(
          `INTENTO DE MANIPULACIÓN DE PRECIO detectado. ` +
          `Producto: ${productoDB.nombre} | ` +
          `Precio enviado por frontend: ${precioFrontend} | ` +
          `Precio real en BD: ${precioReal}`
        );
      }

      return {
        id:          productoDB.id,
        title:       `${(productoDB.colecciones as any)?.nombre ?? "Kinara"} — ${productoDB.nombre}`,
        unit_price:  precioReal,     // Precio real de la BD
        quantity:    cantidad,
        currency_id: "MXN",
        category_id: "art",
      };
    });

    // Calculo el total real para verificar que coincide con el pedido guardado
    const totalReal = itemsVerificados.reduce(
      (s: number, i: any) => s + i.unit_price * i.quantity, 0
    );

    // Actualizo el total del pedido en Supabase con el precio real
    // por si alguien también intentó manipular el total del pedido
    await supabase
      .from("pedidos")
      .update({ total: totalReal })
      .eq("id", pedido_id);

    // Creo la preferencia en Mercado Pago con los precios verificados
    const preferencia = {
      items:              itemsVerificados,
      payer:              payer ?? {},
      back_urls:          back_urls ?? {},
      auto_return:        auto_return ?? "approved",
      external_reference: external_reference ?? pedido_id,
      statement_descriptor: "KINARA LUMINARIAS",
      expires:            true,
      expiration_date_to: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      payment_methods: { installments: 12 },
    };

    const mpRes = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${accessToken}`,
      },
      body: JSON.stringify(preferencia),
    });

    if (!mpRes.ok) {
      const err = await mpRes.json();
      throw new Error("Error de Mercado Pago: " + (err.message ?? JSON.stringify(err)));
    }

    const datos = await mpRes.json();

    return respuesta(200, {
      id:                 datos.id,
      init_point:         datos.init_point,
      sandbox_init_point: datos.sandbox_init_point,
      total_verificado:   totalReal,   // Devuelvo el total real para que el frontend lo muestre
    });

  } catch (e) {
    console.error("Error en crear-preferencia-mp:", e);
    return respuesta(500, { error: String(e) });
  }
});

// Helper para construir respuestas con los headers CORS
const respuesta = (status: number, body: object) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
