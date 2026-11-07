// ============================================================
// crear-preferencia-mp.ts — Edge Function: checkout en servidor
//
// El navegador solo manda qué quiere comprar y a dónde enviarlo.
// Aquí creo cliente, pedido e items con precios de la base de datos,
// y genero la preferencia de pago. El navegador no elige el precio,
// el pedido al que se aplica el pago ni las URLs de retorno.
//
// Secrets: MERCADOPAGO_ACCESS_TOKEN y SITE_URL
// (SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY ya los provee Supabase)
// ============================================================

import { serve }        from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const UUID_RE  = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const texto = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);

// Regreso null si los datos no son válidos
function validar(body: any) {
  const cliente = body?.cliente ?? {};
  const envio   = body?.envio ?? {};
  const items   = body?.items;

  const nombre    = texto(cliente.nombre, 120);
  const email     = texto(cliente.email, 200);
  const telefono  = texto(cliente.telefono, 30);
  const direccion = texto(envio.direccion, 300);
  const ciudad    = texto(envio.ciudad, 100);
  const estado    = texto(envio.estado, 60);
  const cp        = texto(envio.cp, 5);

  if (
    nombre.length < 3 || !EMAIL_RE.test(email) ||
    telefono.replace(/\D/g, "").length < 10 ||
    direccion.length < 10 || ciudad.length < 2 || !estado || !/^\d{5}$/.test(cp)
  ) return null;

  if (!Array.isArray(items) || items.length === 0 || items.length > 50) return null;

  const itemsValidos = items.every((i: any) =>
    UUID_RE.test(String(i?.id)) &&
    Number.isInteger(i?.cantidad) && i.cantidad >= 1 && i.cantidad <= 100
  );
  if (!itemsValidos) return null;

  return {
    nombre, email, telefono,
    direccionCompleta: `${direccion}, ${ciudad}, ${estado} CP ${cp}`,
    items: items.map((i: any) => ({ id: i.id, cantidad: i.cantidad })),
  };
}

serve(async (req: Request) => {

  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return respuesta(405, { error: "Método no permitido" });

  let supabase: any = null;
  let pedidoId: string | null = null;

  try {
    const datos = validar(await req.json().catch(() => null));
    if (!datos) return respuesta(400, { error: "Revisa los datos del pedido" });

    const accessToken = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const siteUrl     = Deno.env.get("SITE_URL")?.replace(/\/+$/, "");

    if (!accessToken || !supabaseUrl || !serviceKey || !siteUrl) {
      throw new Error("Variables de entorno incompletas");
    }

    supabase = createClient(supabaseUrl, serviceKey);

    const { data: pedido, error: errorPedido } = await supabase.rpc("crear_pedido_checkout", {
      p_nombre:    datos.nombre,
      p_email:     datos.email,
      p_telefono:  datos.telefono,
      p_direccion: datos.direccionCompleta,
      p_items:     datos.items,
    });

    if (errorPedido) {
      // Los errores CHECKOUT: son mensajes para el cliente (stock, producto retirado)
      if (errorPedido.message?.startsWith("CHECKOUT: ")) {
        return respuesta(409, { error: errorPedido.message.replace("CHECKOUT: ", "") });
      }
      throw new Error("Error creando pedido: " + errorPedido.message);
    }

    pedidoId = pedido.pedido_id;
    const retorno = (status: string) =>
      `${siteUrl}/pages/confirmacion.html?status=${status}&pedido=${pedidoId}`;

    const [primerNombre, ...apellidos] = datos.nombre.split(/\s+/);

    const preferencia = {
      items: pedido.items.map((i: any) => ({
        id:          i.id,
        title:       i.titulo,
        unit_price:  Number(i.precio),
        quantity:    i.cantidad,
        currency_id: "MXN",
        category_id: "others",
      })),
      payer: {
        name:    primerNombre,
        surname: apellidos.join(" "),
        email:   datos.email,
        phone:   { area_code: "52", number: datos.telefono.replace(/\D/g, "") },
      },
      back_urls: {
        success: retorno("success"),
        failure: retorno("failure"),
        pending: retorno("pending"),
      },
      auto_return:        "approved",
      external_reference: pedidoId,
      // Cada pago avisa directo a nuestra función, sin depender del webhook
      // configurado en el panel de MP (modo prueba/productivo, otra app)
      notification_url:   `${supabaseUrl}/functions/v1/webhook-mp?source_news=webhooks`,
      statement_descriptor: "KINARA 3D",
      expires:            true,
      expiration_date_to: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      payment_methods:    { installments: 12 },
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
      throw new Error(`Mercado Pago respondió ${mpRes.status}: ${await mpRes.text()}`);
    }

    const pref = await mpRes.json();

    await supabase.from("pedidos").update({ mp_preference_id: pref.id }).eq("id", pedidoId);

    // El sandbox solo se usa con credenciales de prueba
    const urlPago = accessToken.startsWith("TEST-")
      ? (pref.sandbox_init_point ?? pref.init_point)
      : pref.init_point;

    return respuesta(200, { pedido_id: pedidoId, url_pago: urlPago, total: pedido.total });

  } catch (e) {
    console.error("Error en crear-preferencia-mp:", e);
    // No dejo pendiente un pedido que nunca podrá pagarse
    if (supabase && pedidoId) {
      await supabase.from("pedidos").update({ estado: "cancelado" }).eq("id", pedidoId);
    }
    return respuesta(500, { error: "No se pudo iniciar el pago. Intenta de nuevo." });
  }
});

// Helper para construir respuestas con los headers CORS
const respuesta = (status: number, body: object) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
