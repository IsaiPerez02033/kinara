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
//    RESEND_API_KEY = llave de Resend para el correo de pago recibido
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

/* ---------- Plantilla de correo de pedido (igual en aviso-envio.ts y aviso-cotizacion.ts) ---------- */
const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const dinero = (n: unknown) => {
  const v = Number(n ?? 0);
  const dec = Number.isInteger(Math.round(v * 100) / 100) ? 0 : 2;
  return "$" + v.toLocaleString("es-MX", { minimumFractionDigits: dec, maximumFractionDigits: 2 });
};

function plantillaPedido(d: { asunto: string; titulo: string; texto: string; bloque: string; boton: string; url: string; nota: string }) {
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(d.asunto)}</title></head>
<body style="margin:0;padding:0;background-color:#f3f2ee;background-image:linear-gradient(180deg,#f3f2ee 0%,#e9e4dc 100%);">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f2ee;background-image:linear-gradient(180deg,#f3f2ee 0%,#e9e4dc 100%);">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #e3e0d8;border-radius:24px;">
<tr><td style="background-color:#2f5c58;background-image:linear-gradient(120deg,#2f5c58 0%,#3a6c67 55%,#6f8f7f 100%);border-radius:24px 24px 0 0;padding:22px 28px;">
<span style="font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:700;letter-spacing:4px;color:#f3f2ee;">KINARA</span>
<span style="font-family:'Courier New',monospace;font-size:11px;color:#f3f2ee;opacity:.8;padding-left:10px;">IMPRESIÓN 3D</span>
</td></tr>
<tr><td style="padding:32px 28px 8px;font-family:Arial,Helvetica,sans-serif;color:#1f2b2a;">
<h1 style="margin:0 0 14px;font-size:24px;line-height:1.25;">${d.titulo}</h1>
<p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#3b4746;">${d.texto}</p>
${d.bloque}
<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:24px;"><tr><td style="background-color:#8d5f4a;background-image:linear-gradient(120deg,#8d5f4a 0%,#b88b74 100%);border-radius:999px;">
<a href="${esc(d.url)}" style="display:inline-block;padding:14px 28px;border-radius:999px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;">${d.boton}</a>
</td></tr></table>
<p style="margin:24px 0 28px;font-size:13px;line-height:1.6;color:#5a605d;">${d.nota}</p>
</td></tr>
</table>
<p style="margin:16px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#5a605d;">Kinara · Impresión 3D · México · <a href="https://kinaramx.com" style="color:#5a605d;">kinaramx.com</a></p>
</td></tr></table>
</body></html>`;
}

async function enviarCorreo(para: string, asunto: string, html: string) {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) throw new Error("Falta el secret RESEND_API_KEY");
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "Kinara <no-responder@kinaramx.com>",
      to: [para],
      reply_to: "hola@kinaramx.com",
      subject: asunto,
      html,
    }),
  });
  if (!r.ok) throw new Error(`Resend respondió ${r.status}: ${await r.text()}`);
}
/* ---------- Fin de la plantilla ---------- */

/* -------------------------------------------------------
   CORREO "RECIBIMOS TU PAGO"
   Se manda una sola vez por pedido (correo_pago_at). Si falla,
   el pago ya quedó registrado: solo se anota en los logs.
   ------------------------------------------------------- */
async function correoPago(supabase: any, pedidoId: string) {
  const { data: p, error } = await supabase
    .from("pedidos")
    .select("id, total, costo_envio, descuento_monedero, iva_incluido, iva_tasa, cotizacion_id, contacto_nombre, direccion_envio, correo_pago_at, clientes (nombre, email, user_id), pedido_items (cantidad, precio_unitario, concepto, productos (nombre)), cotizaciones (dias_produccion)")
    .eq("id", pedidoId)
    .single();
  if (error || !p || p.correo_pago_at || !p.clientes?.email) return;

  const siteUrl = (Deno.env.get("SITE_URL") ?? "https://kinaramx.com").replace(/\/+$/, "");
  const numero = p.id.slice(0, 8).toUpperCase();
  const nombre = String(p.contacto_nombre || p.clientes?.nombre || "").split(/\s+/)[0];
  const asunto = `Recibimos tu pago · Pedido #${numero}`;

  const renglon = (izq: string, der: string, fuerte = false) =>
    `<tr><td style="padding:7px 0;font-size:14px;color:${fuerte ? "#1f2b2a" : "#3b4746"};${fuerte ? "font-weight:700;" : ""}border-top:1px solid #e0ddd5;">${izq}</td><td align="right" style="padding:7px 0;font-size:14px;color:#1f2b2a;${fuerte ? "font-weight:700;" : ""}border-top:1px solid #e0ddd5;white-space:nowrap;">${der}</td></tr>`;
  const piezas = (p.pedido_items ?? []).map((i: any) =>
    renglon(`${esc(i.productos?.nombre ?? i.concepto ?? "Pieza")} × ${i.cantidad}`, dinero(i.precio_unitario * i.cantidad))).join("");
  const envio = Number(p.costo_envio ?? 0);
  const descuento = Number(p.descuento_monedero ?? 0);

  // IVA incluido (se apaga en ajustes_tienda.iva_desglosar) y monedero ganado
  const [{ data: ajustes }, { data: ganado }] = await Promise.all([
    supabase.from("ajustes_tienda").select("iva_desglosar").maybeSingle(),
    supabase.from("monedero_movimientos").select("monto").eq("pedido_id", p.id).eq("tipo", "ganado").maybeSingle(),
  ]);
  const iva = ajustes?.iva_desglosar && Number(p.iva_incluido) > 0
    ? `<p style="margin:8px 0 0;font-size:12px;color:#5a605d;text-align:right;">Incluye IVA (${Math.round(Number(p.iva_tasa) * 100)}%): ${dinero(p.iva_incluido)}</p>`
    : "";
  const conCuenta = !!p.clientes?.user_id;
  const monedero = Number(ganado?.monto ?? 0) > 0 ? `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;background-color:#e6eadf;background-image:linear-gradient(120deg,#e6eadf 0%,#f1ebe4 100%);border-radius:16px;">
<tr><td style="padding:14px 16px;font-size:14px;line-height:1.5;color:#1f2b2a;">
<strong>Ganaste ${dinero(ganado.monto)} en tu Monedero Kinara.</strong><br>
<span style="color:#3b4746;font-size:13px;">${conCuenta
  ? "Lo puedes usar en tu siguiente compra."
  : `Crea tu cuenta con este correo en <a href="${siteUrl}/pages/acceso.html" style="color:#2f5c58;">kinaramx.com</a> para usarlo en tu siguiente compra.`}</span>
</td></tr></table>` : "";

  const bloque = `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
${piezas}
${renglon("Envío", envio > 0 ? dinero(envio) : "Gratis")}
${descuento > 0 ? renglon("Monedero Kinara", `−${dinero(descuento)}`) : ""}
${renglon("Total pagado", `${dinero(p.total)} MXN`, true)}
</table>
${iva}
${monedero}
<p style="margin:16px 0 0;font-size:13px;line-height:1.6;color:#5a605d;"><strong style="color:#1f2b2a;">Se enviará a:</strong> ${esc(p.direccion_envio)}</p>`;
  const dias = p.cotizaciones?.dias_produccion;
  const tiempo = dias ? `en unos ${dias} días hábiles` : "en 3 a 5 días hábiles";

  const html = plantillaPedido({
    asunto,
    titulo: "Recibimos tu pago",
    texto: `${nombre ? `Hola, ${esc(nombre)}. ` : ""}Tu pedido <strong>#${numero}</strong> ya está confirmado. Lo imprimimos y revisamos en nuestro taller, y sale ${tiempo}. Te avisamos con el número de guía cuando lo enviemos.`,
    bloque,
    boton: "Ver mi pedido",
    url: `${siteUrl}/pages/confirmacion.html?status=success&pedido=${p.id}`,
    nota: `¿Dudas? Responde a este correo o escribe a hola@kinaramx.com con tu número de pedido. <a href="${siteUrl}/pages/envios.html" style="color:#2f5c58;">Envíos y devoluciones</a>`,
  });

  await enviarCorreo(p.clientes.email, asunto, html);
  await supabase.from("pedidos").update({ correo_pago_at: new Date().toISOString() }).eq("id", p.id);
}

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

    // Pago inexistente para este token (p. ej. la simulación del panel):
    // respondo 200 para que MP no reintente sin fin
    if (respuestaPago.status === 404) {
      console.warn(`Pago ${pagoId} no encontrado en MP`);
      return new Response(JSON.stringify({ ok: true, mensaje: "Pago no encontrado" }), { status: 200, headers: HEADERS });
    }
    if (!respuestaPago.ok) {
      throw new Error(`No se pudo consultar el pago ${pagoId} en Mercado Pago (${respuestaPago.status})`);
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

      if (resultado === "procesado") {
        try { await correoPago(supabase, pedidoId); }
        catch (e) { console.error(`No se pudo mandar el correo de pago del pedido ${pedidoId}:`, e); }
      }

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
