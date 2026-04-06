function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

interface EmailContent {
  title: string;
  body: string;
  ctaText?: string;
  ctaUrl?: string;
}

interface EmailResult {
  subject: string;
  html: string;
}

export function buildEmailHtml(content: EmailContent): string {
  const ctaBlock =
    content.ctaText && content.ctaUrl
      ? `<!--cta--><div style="text-align:center;margin:24px 0">
        <a href="${content.ctaUrl}" style="display:inline-block;padding:12px 32px;background:#3B82F6;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;font-size:16px">${content.ctaText}</a>
      </div>`
      : "";

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#F0F7FF;font-family:Arial,Helvetica,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F0F7FF;padding:32px 0">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">
        <tr><td style="background:#3B82F6;padding:24px 32px;border-radius:12px 12px 0 0">
          <span style="color:#ffffff;font-size:24px;font-weight:700">CluPay</span>
        </td></tr>
        <tr><td style="background:#ffffff;padding:32px;border-radius:0 0 12px 12px">
          <h1 style="margin:0 0 16px;color:#1e293b;font-size:20px;font-weight:600">${content.title}</h1>
          <div style="color:#1e293b;font-size:16px;line-height:1.6">${content.body}</div>
          ${ctaBlock}
        </td></tr>
        <tr><td style="padding:24px 32px;text-align:center">
          <span style="color:#64748B;font-size:13px">CluPay — Plataforma de pagos para clubes deportivos</span>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function invitationEmail(
  clubName: string,
  token: string,
  appUrl: string
): EmailResult {
  const safe = escapeHtml(clubName);
  return {
    subject: `${clubName} te invita a CluPay`,
    html: buildEmailHtml({
      title: `${safe} te invita a CluPay`,
      body: `<p>Has sido invitado/a a unirte a <strong>${safe}</strong> en CluPay.</p>
             <p>Haz clic en el botón para aceptar la invitación e inscribir a tus hijos.</p>`,
      ctaText: "Aceptar invitación",
      ctaUrl: `${appUrl}/invite/${encodeURIComponent(token)}`,
    }),
  };
}

export function invoiceReadyEmail(
  clubName: string,
  total: string,
  dueDate: string,
  appUrl: string
): EmailResult {
  const safe = escapeHtml(clubName);
  return {
    subject: `Nueva factura de ${clubName}`,
    html: buildEmailHtml({
      title: `Nueva factura de ${safe}`,
      body: `<p>Tienes una nueva factura por <strong>${escapeHtml(total)}</strong> con vencimiento el <strong>${escapeHtml(dueDate)}</strong>.</p>`,
      ctaText: "Ver factura",
      ctaUrl: `${appUrl}/app`,
    }),
  };
}

export function paymentConfirmationEmail(
  clubName: string,
  total: string,
  periodLabel: string
): EmailResult {
  const safe = escapeHtml(clubName);
  return {
    subject: `Pago confirmado — ${clubName}`,
    html: buildEmailHtml({
      title: `Pago confirmado — ${safe}`,
      body: `<p>Tu pago de <strong>${escapeHtml(total)}</strong> para <strong>${escapeHtml(periodLabel)}</strong> ha sido registrado exitosamente.</p>
             <p>Gracias por tu pago.</p>`,
    }),
  };
}

export function paymentReminderEmail(
  clubName: string,
  total: string,
  dueDate: string,
  appUrl: string
): EmailResult {
  const safe = escapeHtml(clubName);
  return {
    subject: `Recordatorio: factura por vencer — ${clubName}`,
    html: buildEmailHtml({
      title: `Recordatorio de pago — ${safe}`,
      body: `<p>Tu factura de <strong>${escapeHtml(total)}</strong> vence el <strong>${escapeHtml(dueDate)}</strong>.</p>
             <p>Realiza tu pago antes de la fecha de vencimiento para evitar recargos.</p>`,
      ctaText: "Pagar ahora",
      ctaUrl: `${appUrl}/app`,
    }),
  };
}

export function overdueAlertEmail(
  clubName: string,
  total: string,
  daysOverdue: number,
  appUrl: string
): EmailResult {
  const safe = escapeHtml(clubName);
  return {
    subject: `Factura vencida — ${clubName}`,
    html: buildEmailHtml({
      title: `Factura vencida — ${safe}`,
      body: `<p>Tu factura de <strong>${escapeHtml(total)}</strong> está vencida hace <strong>${daysOverdue} día(s)</strong>.</p>
             <p>Por favor, regulariza tu pago lo antes posible.</p>`,
      ctaText: "Pagar ahora",
      ctaUrl: `${appUrl}/app`,
    }),
  };
}
