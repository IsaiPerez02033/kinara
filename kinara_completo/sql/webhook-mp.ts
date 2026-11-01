// ============================================================
// webhook-mp.ts — Edge Function: Webhook de Mercado Pago
//
// Mercado Pago llama a esta URL automáticamente cada vez
// que ocurre un evento de pago (aprobado, rechazado, etc.).
//
// INSTALACIÓN:
// 1. Supabase → Edge Functions → New Function
// 2. Nombre exacto: "webhook-mp"
// 3. Pega este archivo completo
// 4. En Settings → Secrets agrega:
//    MERCADOPAGO_ACCESS_TOKEN = TEST-... (o productivo)
//    MERCADOPAGO_WEBHOOK_SECRET = tu-secret-de-webhook (ver paso 5)
// 5. En el panel de MP → Developers → Webhooks → tu webhook → copiar "Secret"
// 6. Desactiva "Verify JWT" en esta función (Mercado Pago no manda JWT;
//    la autenticación es la firma HMAC). Con CLI: --no-verify-jwt
// 7. Deploy
//
// URL resultante:
// https://TU-PROYECTO.supabase.co/functions/v1/webhook-mp
//
// Esa URL la pegas en Mercado Pago →
// Developers → Webhooks → Agregar → Evento: payment
// ============================================================

import { serve }        from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Cabeceras CORS básicas
const HEADERS = { "Content-Type": "application/json" };

/* -------------------------------------------------------
   VERIFICACIÓN DE FIRMA HMAC (Mercado Pago)
   MP firma cada webhook con HMAC-SHA256 usando un secret
   que se configura en su panel de desarrollador.
   Sin esta verificación, cualquiera podría POST a esta
   URL y falsificar un pago aprobado.
   ------------------------------------------------------- */
async function verificarFirmaMP(req: Request, rawBody: string): Promise<boolean> {
  const secret = Deno.env.get("MERCADOPAGO_WEBHOOK_SECRET");

  // Sin secret no puedo verificar nada: rechazo el aviso
  if (!secret) {
    console.error("MERCADOPAGO_WEBHOOK_SECRET no configurado — webhook rechazado");
    return false;
  }

  // MP envía la firma en el header x-signature con formato:
  // ts=1704361200,v1=abc123...
  const signatureHeader = req.headers.get("x-signature");
  const requestId       = req.headers.get("x-request-id");

  if (!signatureHeader || !requestId) {
    console.error("Faltan headers de firma MP (x-signature o x-request-id)");
    return false;
  }

  // Extraigo el timestamp y la firma v1
  const parts: Record<string, string> = {};
  for (const part of signatureHeader.split(",")) {
    const [k, v] = part.split("=");
    if (k && v) parts[k.trim()] = v.trim();
  }

  const ts = parts["ts"];
  const v1 = parts["v1"];
  if (!ts || !v1) {
    console.error("Formato de x-signature inválido");
    return false;
  }

  // Construyo el mensaje a firmar según la documentación de MP:
  // "id:[data.id];request-id:[x-request-id];ts:[ts];"
  // MP firma el data.id de la URL; si no viene, uso el del body
  let dataId = new URL(req.url).searchParams.get("data.id") ?? "";
  if (!dataId) {
    try {
      const parsed = JSON.parse(rawBody);
      dataId = String(parsed?.data?.id ?? "");
    } catch (_) {}
  }
  dataId = dataId.toLowerCase();

  const mensaje = `id:${dataId};request-id:${requestId};ts:${ts};`;

  // Calculo HMAC-SHA256
  const encoder   = new TextEncoder();
  const keyData   = encoder.encode(secret);
  const msgData   = encoder.encode(mensaje);
  const cryptoKey = await crypto.subtle.importKey(
    "raw", keyData,
    { name: "HMAC", hash: "SHA-256" },
    false, ["sign"]
  );
  const signatureBuffer = await crypto.subtle.sign("HMAC", cryptoKey, msgData);
  const signatureHex    = Array.from(new Uint8Array(signatureBuffer))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");

  // Comparo en tiempo constante y nunca escribo la firma en los logs
  let diferencia = signatureHex.length ^ v1.length;
  for (let i = 0; i < signatureHex.length; i++) {
    diferencia |= signatureHex.charCodeAt(i) ^ v1.charCodeAt(i);
  }
  if (diferencia !== 0) console.error("Firma MP inválida");
  return diferencia === 0;
}

serve(async (req: Request) => {

  // Solo acepto POST — MP siempre envía POST
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Método no permitido" }), { status: 405, headers: HEADERS });
  }

  try {
    // Leo el cuerpo RAW antes de hacer json() — necesito el texto para
    // verificar la firma HMAC antes de procesar cualquier dato
    const rawBody = await req.text();

    // Verifico la firma de Mercado Pago ANTES de procesar nada
    const firmaValida = await verificarFirmaMP(req, rawBody);
    if (!firmaValida) {
      return new Response(JSON.stringify({ error: "Firma inválida" }), { status: 401, headers: HEADERS });
    }

    // Ahora sí parseo el body (ya verificado)
    const body = JSON.parse(rawBody);

    // Solo proceso notificaciones de tipo "payment"
    // MP también envía otros tipos (merchant_order, etc.) que ignoro
    if (body.type !== "payment") {
      return new Response(JSON.stringify({ ok: true, mensaje: "Evento ignorado" }), { status: 200, headers: HEADERS });
    }

    // Obtengo el ID del pago desde el cuerpo del webhook
    const pagoId = body.data?.id;
    if (!/^\d+$/.test(String(pagoId ?? ""))) {
      return new Response(JSON.stringify({ error: "ID de pago no válido" }), { status: 400, headers: HEADERS });
    }

    // Consulto los detalles completos del pago directamente a la API de MP
    // No confío en los datos del webhook — siempre verifico con la API oficial
    // Esto es una práctica de seguridad estándar
    const accessToken = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN");
    if (!accessToken) throw new Error("MERCADOPAGO_ACCESS_TOKEN no configurado");

    const respuestaPago = await fetch(
      `https://api.mercadopago.com/v1/payments/${pagoId}`,
      { headers: { "Authorization": `Bearer ${accessToken}` } }
    );

    if (!respuestaPago.ok) {
      throw new Error(`No se pudo consultar el pago ${pagoId} en Mercado Pago`);
    }

    const pago = await respuestaPago.json();

    // El campo external_reference es el ID del pedido en Supabase
    // Lo puse cuando creé la preferencia en crear-preferencia-mp.ts
    const pedidoId = pago.external_reference;

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(pedidoId ?? ""))) {
      return new Response(JSON.stringify({ ok: true, mensaje: "Sin external_reference, ignorado" }), { status: 200, headers: HEADERS });
    }

    // Creo el cliente de Supabase con el service_role para poder
    // ejecutar la función procesar_pago_confirmado (que tiene SECURITY DEFINER)
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Proceso el pago según su estado
    if (pago.status === "approved") {
      // Solo acepto pesos; el monto lo valida procesar_pago_confirmado
      const monto = pago.currency_id === "MXN" ? pago.transaction_amount : null;

      const { data: resultado, error } = await supabase.rpc("procesar_pago_confirmado", {
        p_pedido_id:     pedidoId,
        p_mp_payment_id: String(pagoId),
        p_monto:         monto
      });

      if (error) throw new Error("Error en procesar_pago_confirmado: " + error.message);

      console.log(`Pedido ${pedidoId}, pago ${pagoId}: ${resultado}`);

    } else if (pago.status === "refunded" || pago.status === "charged_back") {
      const { data: resultado, error } = await supabase.rpc("revertir_pago_confirmado", {
        p_pedido_id:     pedidoId,
        p_mp_payment_id: String(pagoId),
        p_estado_mp:     pago.status
      });

      if (error) throw new Error("Error en revertir_pago_confirmado: " + error.message);

      console.log(`Pedido ${pedidoId}, pago ${pagoId} ${pago.status}: ${resultado}`);

    } else if (pago.status === "cancelled") {
      // Pago cancelado (p. ej. ficha de OXXO vencida)
      const { error } = await supabase
        .from("pedidos")
        .update({ estado: "cancelado" })
        .eq("id", pedidoId)
        .eq("estado", "pendiente"); // Solo si aún estaba pendiente

      if (error) throw new Error("Error cancelando pedido: " + error.message);

      console.log(`Pedido ${pedidoId} cancelado. Estado MP: ${pago.status}`);

    } else {
      // Un pago rechazado no cancela el pedido: el cliente puede reintentar
      // con otra tarjeta sobre la misma preferencia. OXXO y transferencia
      // también llegan aquí mientras esperan el pago.
      console.log(`Pago ${pagoId} en estado "${pago.status}", sin acción por ahora`);
    }

    // Respondo 200 a MP para que no reintente el webhook
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: HEADERS });

  } catch (error) {
    console.error("Error en webhook-mp:", error);
    // Respondo 500 para que MP reintente más tarde
    return new Response(JSON.stringify({ error: "Error interno" }), { status: 500, headers: HEADERS });
  }
});
