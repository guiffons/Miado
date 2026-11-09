import fs from "node:fs";
import path from "node:path";

export interface PasswordResetEmailParams {
  email: string;
  userName: string;
  userHandle: string;
  code: string;
  originUrl: string;
  resetLink?: string;
}

const FALLBACK_HTML_TEMPLATE = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Recuperação de Senha • Miado Streaming</title>
</head>
<body style="margin:0;padding:32px 14px;background-color:#06020c;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#f8fafc;-webkit-font-smoothing:antialiased;">
  <div style="max-width:580px;margin:0 auto;background:linear-gradient(155deg,#190b33 0%,#0e051c 100%);border:1px solid rgba(192,132,252,0.42);border-radius:28px;overflow:hidden;box-shadow:0 30px 80px rgba(0,0,0,0.75), inset 0 1px 0 rgba(255,255,255,0.12);">
    <div style="height:6px;background:linear-gradient(90deg,#a855f7 0%,#ec4899 50%,#8b5cf6 100%);"></div>
    <div style="padding:36px 30px 24px;text-align:center;border-bottom:1px solid rgba(255,255,255,0.08);background:radial-gradient(circle at 50% 0%,rgba(168,85,247,0.28) 0%,rgba(236,72,153,0.08) 50%,transparent 80%);">
      <div style="width:84px;height:84px;margin:0 auto 16px;border-radius:24px;background:linear-gradient(135deg,rgba(168,85,247,0.25),rgba(236,72,153,0.15));border:1.5px solid rgba(192,132,252,0.55);display:flex;align-items:center;justify-content:center;overflow:hidden;box-shadow:0 12px 32px rgba(168,85,247,0.38), inset 0 1px 0 rgba(255,255,255,0.3);">
        <img src="{{LOGO_URL}}" alt="Miado Logo" style="width:100%;height:100%;object-fit:cover;display:block;" />
      </div>
      <div style="display:inline-block;padding:5px 14px;border-radius:999px;background:rgba(168,85,247,0.18);border:1px solid rgba(192,132,252,0.45);color:#e9d5ff;font-size:11.5px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:12px;box-shadow:0 4px 16px rgba(168,85,247,0.2);">
        MIADO STREAMING • RECUPERAÇÃO DE ACESSO
      </div>
      <h1 style="margin:0;font-size:24px;font-weight:900;color:#ffffff;letter-spacing:-0.4px;line-height:1.25;">
        Perdeu a chave do castelo felino? 🐾
      </h1>
    </div>
    <div style="padding:32px 30px;">
      <p style="margin:0 0 14px;font-size:16px;line-height:1.6;color:#f3e8ff;">
        Miauuu, <strong style="color:#ffffff;">{{USER_NAME}}</strong> <span style="color:#c084fc;font-weight:600;">({{USER_HANDLE}})</span>!
      </p>
      <p style="margin:0 0 18px;font-size:14.5px;line-height:1.65;color:#cbd5e1;">
        Até os gatos mais lendários às vezes esquecem onde enterraram suas chaves secretas... Relaxa! O Miado já preparou tudo pra você não perder um segundo das suas músicas favoritas. <strong>Uarrrr!</strong>
      </p>
      <p style="margin:0 0 24px;font-size:14px;line-height:1.65;color:#94a3b8;">
        Recebemos uma solicitação de redefinição para a conta associada ao e-mail <strong style="color:#f8fafc;">{{USER_EMAIL}}</strong>.
      </p>
      <div style="padding:24px 16px;margin:0 0 26px;border-radius:20px;background:linear-gradient(135deg,rgba(25,14,46,0.85) 0%,rgba(14,8,28,0.92) 100%);border:1px solid rgba(192,132,252,0.45);text-align:center;box-shadow:0 12px 35px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1);">
        <div style="font-size:11.5px;font-weight:800;text-transform:uppercase;letter-spacing:1.8px;color:#c084fc;margin-bottom:14px;">
          Seu Código Secreto de 6 Patinhas
        </div>
        <div style="margin:0 auto;text-align:center;white-space:nowrap;">
          {{CODE_DIGITS}}
        </div>
        <div style="margin-top:14px;font-size:12.5px;color:#cbd5e1;">
          Digite este código no painel de recuperação ou utilize o link rápido abaixo.
        </div>
      </div>
      <div style="text-align:center;margin:0 0 26px;">
        <a href="{{RESET_LINK}}" target="_blank" style="display:inline-block;padding:16px 36px;border-radius:16px;background:linear-gradient(135deg,#a855f7 0%,#ec4899 100%);color:#ffffff;font-size:15.5px;font-weight:800;text-decoration:none;letter-spacing:0.3px;box-shadow:0 10px 30px rgba(168,85,247,0.45), inset 0 1px 0 rgba(255,255,255,0.3);transition:all 0.2s ease;">
          Redefinir Minha Senha no Miado 🐾
        </a>
      </div>
      <div style="padding:12px 16px;margin:0 0 22px;border-radius:14px;background:rgba(0,0,0,0.35);border:1px solid rgba(255,255,255,0.06);font-size:12px;line-height:1.5;color:#94a3b8;word-break:break-all;">
        <span style="color:#cbd5e1;font-weight:600;">Link direto com código preenchido:</span><br />
        <a href="{{RESET_LINK}}" target="_blank" style="color:#c084fc;text-decoration:none;">{{RESET_LINK}}</a>
      </div>
      <div style="padding:15px 18px;margin:0 0 16px;border-radius:16px;background:rgba(168,85,247,0.1);border:1px solid rgba(192,132,252,0.3);font-size:13px;line-height:1.55;color:#e9d5ff;">
        ⏱️ <strong>Validade estendida de 24 horas:</strong> este código e link de recuperação são válidos por <strong>24 horas no servidor</strong>. Pode respirar fundo e trocar sua senha com calma, sem correria de gato assustado!
      </div>
      <div style="padding:14px 18px;border-radius:16px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);font-size:12.5px;line-height:1.55;color:#94a3b8;">
        🔒 <strong style="color:#e2e8f0;">Dica para a nova senha:</strong> deve conter no mínimo <strong>6 caracteres</strong>, incluindo <strong>1 letra maiúscula (A-Z)</strong> e <strong>1 caractere especial</strong> (ex: <code style="color:#d8b4fe;">!@#$%&*</code>).
      </div>
    </div>
    <div style="padding:20px 30px;background:rgba(0,0,0,0.45);border-top:1px solid rgba(255,255,255,0.07);text-align:center;font-size:12px;line-height:1.6;color:#64748b;">
      Se você não solicitou esta redefinição, fique tranquilo: nenhuma alteração foi feita e sua conta segue segura.<br />
      <span style="color:#a855f7;font-weight:700;">Miado Streaming</span> • O som mais ronronante da internet • <em>Uarrrr!</em>
    </div>
  </div>
</body>
</html>`;

export function renderPasswordResetEmailHtml(params: PasswordResetEmailParams): string {
  const cleanOrigin = params.originUrl.replace(/\/$/, "");
  const logoUrl = `${cleanOrigin}/assets/aistudio/thumbnail_7fd222f18747391112b3e415abb27c67a303376a_alpha_45d028e7.jpg`;
  const cleanCode = String(params.code || "000000").trim();
  const resetLink =
    params.resetLink ||
    `${cleanOrigin}/?action=reset-password&email=${encodeURIComponent(params.email)}&code=${encodeURIComponent(cleanCode)}`;

  const codeDigitsHtml = cleanCode
    .split("")
    .map(
      (d) =>
        `<span style="display:inline-block;width:44px;height:56px;line-height:56px;margin:0 4px;border-radius:14px;background:rgba(168,85,247,0.22);border:1.5px solid rgba(192,132,252,0.65);color:#ffffff;font-size:28px;font-weight:900;text-align:center;box-shadow:0 6px 20px rgba(168,85,247,0.3), inset 0 1px 0 rgba(255,255,255,0.25);">${d}</span>`
    )
    .join("");

  let template = FALLBACK_HTML_TEMPLATE;
  try {
    const templatePath = path.join(process.cwd(), "src", "templates", "passwordResetEmail.html");
    if (fs.existsSync(templatePath)) {
      template = fs.readFileSync(templatePath, "utf8");
    }
  } catch {}

  return template
    .replace(/\{\{LOGO_URL\}\}/g, logoUrl)
    .replace(/\{\{USER_NAME\}\}/g, params.userName || "Ouvinte Miado")
    .replace(/\{\{USER_HANDLE\}\}/g, params.userHandle || "@ouvinte")
    .replace(/\{\{USER_EMAIL\}\}/g, params.email)
    .replace(/\{\{CODE_DIGITS\}\}/g, codeDigitsHtml)
    .replace(/\{\{RESET_CODE\}\}/g, cleanCode)
    .replace(/\{\{RESET_LINK\}\}/g, resetLink);
}
