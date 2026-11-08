// ============================================================
// aviso-envio.ts — Edge Function: correo "Tu pedido va en camino"
//
// La llama el panel admin después de guardar la paquetería y la
// guía de un pedido. Solo responde a un admin con sesión iniciada.
//
// INSTALACIÓN:
// 1. Supabase → Edge Functions → New Function, nombre exacto "aviso-envio"
// 2. Pega este archivo completo y despliega (deja "Verify JWT" encendido)
// 3. Secrets: RESEND_API_KEY y SITE_URL (SITE_URL ya existe)
//
// La plantilla de correo es la misma que usa webhook-mp.ts para
// "Recibimos tu pago": si cambias una, cambia la otra.
// ============================================================

import { serve }        from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* ---------- Plantilla de correo de pedido (igual en webhook-mp.ts) ---------- */
const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const dinero = (n: unknown) =>
  "$" + Number(n ?? 0).toLocaleString("es-MX", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

function plantillaPedido(d: { asunto: string; titulo: string; texto: string; bloque: string; boton: string; url: string; nota: string }) {
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(d.asunto)}</title></head>
<body style="margin:0;padding:0;background:#f2f0ea;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f0ea;">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:2px solid #14161a;">
<tr><td style="background:#1f36b5;padding:20px 28px;">
<span style="font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:700;letter-spacing:4px;color:#f2f0ea;">KINARA</span>
<span style="font-family:'Courier New',monospace;font-size:11px;color:#f2f0ea;opacity:.8;padding-left:10px;">IMPRESIÓN 3D</span>
</td></tr>
<tr><td style="padding:32px 28px 8px;font-family:Arial,Helvetica,sans-serif;color:#14161a;">
<h1 style="margin:0 0 14px;font-size:24px;line-height:1.25;">${d.titulo}</h1>
<p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#3a3d44;">${d.texto}</p>
${d.bloque}
<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:24px;"><tr><td style="background:#c93814;">
<a href="${esc(d.url)}" style="display:inline-block;padding:14px 26px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;">${d.boton}</a>
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

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return respuesta(405, { error: "Método no permitido" });

  try {
    const { pedido_id } = await req.json().catch(() => ({}));
    if (!UUID_RE.test(String(pedido_id))) return respuesta(400, { error: "Pedido inválido" });

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const siteUrl  = (Deno.env.get("SITE_URL") ?? "https://kinaramx.com").replace(/\/+$/, "");

    // Solo un admin con sesión puede mandar este correo
    const jwt = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    const { data: auth } = await supabase.auth.getUser(jwt);
    if (!auth?.user) return respuesta(401, { error: "Sin sesión" });
    const { data: admin } = await supabase.from("admins").select("user_id").eq("user_id", auth.user.id).maybeSingle();
    if (!admin) return respuesta(403, { error: "Solo administradores" });

    const { data: p, error } = await supabase
      .from("pedidos")
      .select("id, contacto_nombre, direccion_envio, paqueteria, numero_guia, url_rastreo, clientes (nombre, email)")
      .eq("id", pedido_id)
      .single();
    if (error || !p) return respuesta(404, { error: "Pedido no encontrado" });
    if (!p.numero_guia) return respuesta(409, { error: "El pedido no tiene número de guía" });

    const para = (p as any).clientes?.email;
    if (!para) return respuesta(409, { error: "El pedido no tiene correo" });

    const numero = p.id.slice(0, 8).toUpperCase();
    const nombre = String(p.contacto_nombre || (p as any).clientes?.nombre || "").split(/\s+/)[0];
    const rastreo = /^https:\/\//.test(p.url_rastreo ?? "") ? p.url_rastreo : null;
    const asunto = `Tu pedido #${numero} va en camino`;

    const fila = (k: string, v: string) =>
      `<tr><td style="padding:6px 0;color:#54575d;font-size:13px;width:110px;vertical-align:top;">${k}</td><td style="padding:6px 0;font-size:14px;color:#14161a;">${v}</td></tr>`;
    const bloque = `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f0ea;padding:12px 16px;">
${fila("Paquetería", esc(p.paqueteria || "Paquetería"))}
${fila("Guía", `<span style="font-family:'Courier New',monospace;font-weight:700;">${esc(p.numero_guia)}</span>`)}
${fila("Dirección", esc(p.direccion_envio))}
</table>`;

    const html = plantillaPedido({
      asunto,
      titulo: "Tu pedido va en camino",
      texto: `${nombre ? `Hola, ${esc(nombre)}. ` : ""}Ya entregamos tu pedido <strong>#${numero}</strong> a la paquetería. Normalmente llega en 2 a 5 días hábiles, según tu código postal.`,
      bloque,
      boton: rastreo ? "Rastrear mi paquete" : "Ver mi pedido",
      url: rastreo ?? `${siteUrl}/pages/cuenta.html#pedidos`,
      nota: `Si la guía aún no muestra movimientos, espera unas horas: la paquetería la actualiza al recoger el paquete. ¿Dudas? Responde a este correo o escribe a hola@kinaramx.com. <a href="${siteUrl}/pages/envios.html" style="color:#1f36b5;">Envíos y devoluciones</a>`,
    });

    await enviarCorreo(para, asunto, html);
    await supabase.from("pedidos").update({ correo_envio_at: new Date().toISOString() }).eq("id", p.id);

    return respuesta(200, { ok: true, para });
  } catch (e) {
    console.error("Error en aviso-envio:", e);
    return respuesta(500, { error: "No se pudo mandar el correo" });
  }
});
