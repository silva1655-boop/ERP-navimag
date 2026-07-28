// Nodemailer wrapper — Gmail SMTP con App Password
import nodemailer from "nodemailer";

function createTransport() {
  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false, // STARTTLS
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });
}

/**
 * Envía un informe de faena por correo con PDF adjunto.
 * @param {string[]} destinatarios - lista de emails
 * @param {object} faena - objeto faena enriquecido
 * @param {Buffer} pdfBuffer - PDF generado con pdfkit
 * @param {string} periodoDesde - "YYYY-MM-DD"
 * @param {string} periodoHasta - "YYYY-MM-DD"
 */
export async function enviarReporteFaena(destinatarios, faena, pdfBuffer, periodoDesde, periodoHasta) {
  if (!destinatarios || destinatarios.length === 0) return;

  const transport = createTransport();
  const fmtFecha = s => s.split("-").reverse().join("/");
  const subject = `[MANTEK] Informe Semanal – ${faena.nave} / ${faena.puerto} | ${fmtFecha(periodoDesde)}–${fmtFecha(periodoHasta)}`;
  const cumpColor = faena.pct >= 90 ? "#16a34a" : faena.pct >= 70 ? "#d97706" : "#8B0000";
  const filename = `Informe_${faena.nave}_${faena.puerto}_${periodoHasta}.pdf`;

  const html = `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"/></head>
<body style="font-family:Arial,sans-serif;color:#1a1a1a;margin:0;padding:0;background:#f9fafb;">
  <div style="max-width:600px;margin:24px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 6px rgba(0,0,0,.1)">
    <div style="background:#8B0000;padding:24px 32px;">
      <p style="color:#fff;margin:0;font-size:12px;opacity:.8">NAVIMAG FERRIES · INFORME SEMANAL CHECKLIST PRE-OPERACIONAL</p>
      <h1 style="color:#fff;margin:8px 0 0;font-size:22px">${faena.nave} — ${faena.puerto}</h1>
      <p style="color:#fef2f2;margin:6px 0 0;font-size:13px">Período: ${fmtFecha(periodoDesde)} → ${fmtFecha(periodoHasta)}</p>
    </div>
    <div style="padding:24px 32px;">
      <h2 style="font-size:14px;color:#8B0000;margin:0 0 12px;text-transform:uppercase">Resumen de cumplimiento</h2>
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
        <tr>
          <td style="text-align:center;padding:12px;border:1px solid #e2e8f0;border-radius:4px">
            <div style="font-size:28px;font-weight:bold;color:#0055A4">${faena.realizados}</div>
            <div style="font-size:11px;color:#6b7280">Realizados</div>
          </td>
          <td style="text-align:center;padding:12px;border:1px solid #e2e8f0">
            <div style="font-size:28px;font-weight:bold;color:#0055A4">${faena.targetTotal}</div>
            <div style="font-size:11px;color:#6b7280">Target total</div>
          </td>
          <td style="text-align:center;padding:12px;border:1px solid #e2e8f0">
            <div style="font-size:28px;font-weight:bold;color:#0055A4">${faena.target}</div>
            <div style="font-size:11px;color:#6b7280">Target/turno</div>
          </td>
          <td style="text-align:center;padding:12px;border:1px solid #e2e8f0">
            <div style="font-size:28px;font-weight:bold;color:${cumpColor}">${faena.pct}%</div>
            <div style="font-size:11px;color:#6b7280">Cumplimiento</div>
          </td>
        </tr>
      </table>
      <p style="font-size:12px;color:#6b7280;margin:0">
        Faena detectada: ${faena.fechaInicio} → ${faena.fechaFin} · ${faena.diasFaena} turno(s)<br/>
        Se adjunta el informe completo en PDF con detalle por turno, operadores y equipos revisados.
      </p>
    </div>
    <div style="background:#f1f5f9;padding:12px 32px;text-align:center">
      <p style="font-size:11px;color:#94a3b8;margin:0">MANTEK ERP v2.0 · Informe generado automáticamente</p>
    </div>
  </div>
</body>
</html>`;

  await transport.sendMail({
    from: `"MANTEK ERP" <${process.env.GMAIL_USER}>`,
    to: destinatarios.join(", "),
    subject,
    html,
    attachments: [
      {
        filename,
        content: pdfBuffer,
        contentType: "application/pdf",
      },
    ],
  });
}
