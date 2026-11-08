"""Genera las plantillas de correo de Supabase Auth (español, marca Kinara).
Se pegan a mano en Supabase → Authentication → Emails → Templates."""
import pathlib

BASE = """<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{asunto}</title></head>
<body style="margin:0;padding:0;background-color:#f3f2ee;background-image:linear-gradient(180deg,#f3f2ee 0%,#e9e4dc 100%);">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f2ee;background-image:linear-gradient(180deg,#f3f2ee 0%,#e9e4dc 100%);">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #e3e0d8;border-radius:24px;">
<tr><td style="background-color:#2f5c58;background-image:linear-gradient(120deg,#2f5c58 0%,#3a6c67 55%,#6f8f7f 100%);border-radius:24px 24px 0 0;padding:22px 28px;">
<span style="font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:700;letter-spacing:4px;color:#f3f2ee;">KINARA</span>
<span style="font-family:'Courier New',monospace;font-size:11px;color:#f3f2ee;opacity:.8;padding-left:10px;">IMPRESIÓN 3D</span>
</td></tr>
<tr><td style="padding:32px 28px 8px;font-family:Arial,Helvetica,sans-serif;color:#1f2b2a;">
<h1 style="margin:0 0 14px;font-size:24px;line-height:1.25;">{titulo}</h1>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#3b4746;">{texto}</p>
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background-color:#8d5f4a;background-image:linear-gradient(120deg,#8d5f4a 0%,#b88b74 100%);border-radius:999px;">
<a href="{{{{ .ConfirmationURL }}}}" style="display:inline-block;padding:14px 28px;border-radius:999px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;">{boton}</a>
</td></tr></table>
<p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#5a605d;">{nota}</p>
</td></tr>
<tr><td style="padding:20px 28px 28px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:#5a605d;">
<div style="background:#f1efe9;border-radius:16px;padding:14px 16px;">
Si el botón no funciona, copia este enlace en tu navegador:<br>
<a href="{{{{ .ConfirmationURL }}}}" style="color:#2f5c58;word-break:break-all;">{{{{ .ConfirmationURL }}}}</a>
</div>
</td></tr>
</table>
<p style="margin:16px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#5a605d;">Kinara · Impresión 3D · México · <a href="https://kinaramx.com" style="color:#5a605d;">kinaramx.com</a></p>
</td></tr></table>
</body></html>
"""

PLANTILLAS = {
    "confirmacion": dict(
        asunto="Confirma tu cuenta Kinara",
        titulo="Activa tu cuenta",
        texto="Gracias por crear tu cuenta en Kinara. Confirma tu correo para ver tus pedidos, guardar tus direcciones y comprar más rápido.",
        boton="Confirmar mi correo",
        nota="Si tú no creaste esta cuenta, ignora este correo y no pasará nada.",
    ),
    "enlace_magico": dict(
        asunto="Tu enlace para entrar a Kinara",
        titulo="Entra a tu cuenta",
        texto="Pediste entrar sin contraseña. Da clic en el botón desde este mismo dispositivo. El enlace solo sirve una vez y vence en una hora.",
        boton="Entrar a Kinara",
        nota="Si no lo pediste tú, ignora este correo. Nadie puede entrar sin abrir este enlace.",
    ),
    "recuperar": dict(
        asunto="Cambia tu contraseña de Kinara",
        titulo="Cambia tu contraseña",
        texto="Recibimos una solicitud para cambiar la contraseña de tu cuenta. Da clic en el botón para elegir una nueva. El enlace vence en una hora.",
        boton="Elegir contraseña nueva",
        nota="Si no lo pediste tú, ignora este correo. Tu contraseña actual sigue funcionando.",
    ),
    "cambio_correo": dict(
        asunto="Confirma tu nuevo correo en Kinara",
        titulo="Confirma tu nuevo correo",
        texto="Pediste cambiar el correo de tu cuenta Kinara a {{ .NewEmail }}. Confírmalo para que el cambio quede hecho.",
        boton="Confirmar cambio",
        nota="Si no lo pediste tú, escríbenos a hola@kinaramx.com.",
    ),
}

aqui = pathlib.Path(__file__).parent
for nombre, d in PLANTILLAS.items():
    (aqui / f"{nombre}.html").write_text(BASE.format(**d), encoding="utf-8")
    print(nombre, "→", d["asunto"])
