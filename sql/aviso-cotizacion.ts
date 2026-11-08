// ============================================================
// aviso-cotizacion.ts — Edge Function: correos de cotizaciones
//
// La llaman dos personas con su sesión:
// - El cliente, justo después de mandar su solicitud: avisa a
//   hola@kinaramx.com que hay una cotización nueva (una sola vez).
// - El admin, después de cotizar o rechazar: le manda al cliente
//   el precio y el botón para pagar, o el motivo.
//
// INSTALACIÓN:
// 1. Supabase → Edge Functions → New Function, nombre exacto "aviso-cotizacion"
// 2. Pega este archivo completo y despliega
// 3. Apaga "Verify JWT with legacy secret" (las sesiones se firman con
//    ES256; esta función revisa la sesión por su cuenta)
// 4. Usa los secrets RESEND_API_KEY y SITE_URL que ya existen
// ============================================================

import { serve }        from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CORREO_TIENDA = "hola@kinaramx.com";

const TIPOS: Record<string, string> = {
  a_medida: "Pieza a medida", figura: "Figura personalizada", volumen: "Producción por volumen", otro: "Otro",
};

/* ---------- Plantilla de correo de pedido (igual en webhook-mp.ts y aviso-envio.ts) ---------- */
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
<body style="margin:0;padding:0;background-color:#f2f0ea;background-image:linear-gradient(180deg,#f2f0ea 0%,#f6e4dc 100%);">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f2f0ea;background-image:linear-gradient(180deg,#f2f0ea 0%,#f6e4dc 100%);">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #e6e1d6;border-radius:24px;">
<tr><td style="background-color:#1f36b5;background-image:linear-gradient(120deg,#1f36b5 0%,#3047c4 55%,#5a6fe0 100%);border-radius:24px 24px 0 0;padding:22px 28px;">
<span style="font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:700;letter-spacing:4px;color:#f2f0ea;">KINARA</span>
<span style="font-family:'Courier New',monospace;font-size:11px;color:#f2f0ea;opacity:.8;padding-left:10px;">IMPRESIÓN 3D</span>
</td></tr>
<tr><td style="padding:32px 28px 8px;font-family:Arial,Helvetica,sans-serif;color:#14161a;">
<h1 style="margin:0 0 14px;font-size:24px;line-height:1.25;">${d.titulo}</h1>
<p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#3a3d44;">${d.texto}</p>
${d.bloque}
<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:24px;"><tr><td style="background-color:#c93814;background-image:linear-gradient(120deg,#c93814 0%,#e05a2e 100%);border-radius:999px;">
<a href="${esc(d.url)}" style="display:inline-block;padding:14px 28px;border-radius:999px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;">${d.boton}</a>
</td></tr></table>
<p style="margin:24px 0 28px;font-size:13px;line-height:1.6;color:#54575d;">${d.nota}</p>
</td></tr>
</table>
<p style="margin:16px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#54575d;">Kinara · Impresión 3D · México · <a href="https://kinaramx.com" style="color:#54575d;">kinaramx.com</a></p>
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

const respuesta = (status: number, body: object) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const fila = (k: string, v: string) =>
  `<tr><td style="padding:6px 0;color:#54575d;font-size:13px;width:120px;vertical-align:top;">${k}</td><td style="padding:6px 0;font-size:14px;color:#14161a;">${v}</td></tr>`;
const caja = (filas: string) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f3ec;border-radius:16px;padding:12px 16px;">${filas}</table>`;

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return respuesta(405, { error: "Método no permitido" });

  try {
    const { cotizacion_id } = await req.json().catch(() => ({}));
    if (!UUID_RE.test(String(cotizacion_id))) return respuesta(400, { error: "Cotización inválida" });

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const siteUrl  = (Deno.env.get("SITE_URL") ?? "https://kinaramx.com").replace(/\/+$/, "");

    const jwt = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    const { data: auth } = await supabase.auth.getUser(jwt);
    if (!auth?.user) return respuesta(401, { error: "Sin sesión" });

    const { data: c, error } = await supabase.from("cotizaciones").select("*").eq("id", cotizacion_id).single();
    if (error || !c) return respuesta(404, { error: "Cotización no encontrada" });

    const { data: admin } = await supabase.from("admins").select("user_id").eq("user_id", auth.user.id).maybeSingle();
    const numero = c.id.slice(0, 8).toUpperCase();

    /* ---------- El cliente avisa a la tienda ---------- */
    if (!admin) {
      if (c.user_id !== auth.user.id) return respuesta(403, { error: "No es tu cotización" });
      if (c.estado !== "nueva" || c.aviso_admin_at) return respuesta(200, { ok: true, ya: true });

      const asunto = `Nueva cotización #${numero}: ${c.titulo}`;
      const html = plantillaPedido({
        asunto,
        titulo: "Llegó una cotización nueva",
        texto: `<strong>${esc(auth.user.email)}</strong> pidió una cotización. Revísala en el panel y responde con precio, envío y tiempo.`,
        bloque: caja([
          fila("Tipo", esc(TIPOS[c.tipo] ?? c.tipo)),
          fila("Qué es", esc(c.titulo)),
          fila("Cantidad", String(c.cantidad)),
          c.medidas ? fila("Medidas", esc(c.medidas)) : "",
          c.material ? fila("Material", esc(c.material)) : "",
          c.color ? fila("Color", esc(c.color)) : "",
          fila("Archivos", String(c.archivos?.length ?? 0)),
          fila("Detalles", esc(c.descripcion).replace(/\n/g, "<br>")),
        ].join("")),
        boton: "Abrir en el panel",
        url: `${siteUrl}/pages/admin.html#cotizaciones`,
        nota: "Este aviso solo te llega a ti.",
      });
      await enviarCorreo(CORREO_TIENDA, asunto, html);
      await supabase.from("cotizaciones").update({ aviso_admin_at: new Date().toISOString() }).eq("id", c.id);
      return respuesta(200, { ok: true, para: CORREO_TIENDA });
    }

    /* ---------- El admin responde al cliente ---------- */
    if (!["cotizada", "rechazada"].includes(c.estado)) return respuesta(409, { error: "La cotización aún no tiene respuesta" });

    const { data: duenio } = await supabase.auth.admin.getUserById(c.user_id);
    const para = duenio?.user?.email;
    if (!para) return respuesta(409, { error: "La cuenta del cliente no tiene correo" });

    const { data: cliente } = await supabase.from("clientes").select("nombre").eq("user_id", c.user_id).maybeSingle();
    const nombre = String(cliente?.nombre ?? duenio.user.user_metadata?.nombre ?? duenio.user.user_metadata?.full_name ?? "").split(/\s+/)[0];
    const hola = nombre ? `Hola, ${esc(nombre)}. ` : "";
    const respuestaAdmin = c.respuesta ? `<p style="margin:16px 0 0;font-size:14px;line-height:1.6;color:#3a3d44;"><strong style="color:#14161a;">Nota del taller:</strong> ${esc(c.respuesta).replace(/\n/g, "<br>")}</p>` : "";

    let asunto: string, html: string;
    if (c.estado === "cotizada") {
      const piezas = Number(c.precio_unitario) * c.cantidad;
      const total = piezas + Number(c.costo_envio);
      const { data: ajustes } = await supabase.from("ajustes_tienda").select("iva_tasa, iva_desglosar").maybeSingle();
      const tasa = Number(ajustes?.iva_tasa ?? 0);
      const iva = ajustes?.iva_desglosar && tasa > 0
        ? fila("IVA incluido", `${dinero(Math.round((total - total / (1 + tasa)) * 100) / 100)} (${Math.round(tasa * 100)}%)`)
        : "";
      const vence = c.vence_at
        ? new Date(c.vence_at).toLocaleDateString("es-MX", { day: "numeric", month: "long", timeZone: "America/Mexico_City" })
        : null;

      asunto = `Tu cotización #${numero} está lista`;
      html = plantillaPedido({
        asunto,
        titulo: "Tu cotización está lista",
        texto: `${hola}Revisamos tu pieza <strong>${esc(c.titulo)}</strong>. Si te late, págala desde tu cuenta y la empezamos a imprimir.`,
        bloque: caja([
          fila("Piezas", `${c.cantidad} × ${dinero(c.precio_unitario)} = ${dinero(piezas)}`),
          fila("Envío", Number(c.costo_envio) > 0 ? dinero(c.costo_envio) : "Gratis"),
          fila("<strong>Total</strong>", `<strong>${dinero(total)} MXN</strong>`),
          iva,
          fila("Producción", `${c.dias_produccion} días hábiles después del pago`),
          vence ? fila("Válida hasta", vence) : "",
        ].join("")) + respuestaAdmin,
        boton: "Ver y pagar mi cotización",
        url: `${siteUrl}/pages/cuenta.html#cotizaciones`,
        nota: `Si tienes saldo en tu Monedero Kinara, lo puedes usar al pagar. ¿Quieres cambiar algo? Responde a este correo.`,
      });
    } else {
      asunto = `Sobre tu cotización #${numero}`;
      html = plantillaPedido({
        asunto,
        titulo: "No pudimos cotizar tu pieza",
        texto: `${hola}Revisamos tu solicitud <strong>${esc(c.titulo)}</strong> y por ahora no la podemos hacer.`,
        bloque: respuestaAdmin || caja(fila("Motivo", "Responde a este correo y te contamos los detalles.")),
        boton: "Ver mis cotizaciones",
        url: `${siteUrl}/pages/cuenta.html#cotizaciones`,
        nota: "Si cambias medidas, material o archivo, mándanos una solicitud nueva y la revisamos otra vez.",
      });
    }

    await enviarCorreo(para, asunto, html);
    await supabase.from("cotizaciones").update({ aviso_cliente_at: new Date().toISOString() }).eq("id", c.id);
    return respuesta(200, { ok: true, para });
  } catch (e) {
    console.error("Error en aviso-cotizacion:", e);
    return respuesta(500, { error: "No se pudo mandar el correo" });
  }
});
