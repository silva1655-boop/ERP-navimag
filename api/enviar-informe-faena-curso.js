// Envío manual del informe de una faena de Faena en Curso por correo, con
// el PDF adjunto. El destinatario se escribe a mano en la app al momento de
// enviar — no hay lista de configuración fija (a diferencia del informe
// semanal de checklist, ver api/cron/reporte-semanal.js).
import { COLL_TALLER, COLL_FAENA, COLL_DETENCIONES, readDocData } from "./_lib/firebase.js";
import { loadEquipMap } from "./_lib/checklists.js";
import { generarPDFFaenaCurso } from "./_lib/pdf.js";
import { enviarInformeFaenaCurso } from "./_lib/email.js";

function isValidEmail(s) {
  return typeof s === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  let body = {};
  try { body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {}); } catch { /* ignore */ }

  const { faenaId, email } = body;
  if (!faenaId || typeof faenaId !== "string") {
    return res.status(400).json({ error: "Falta el parámetro faenaId" });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: "Correo inválido" });
  }

  try {
    const [faenas, detenciones, equipMap] = await Promise.all([
      readDocData(COLL_FAENA, "faenas"),
      readDocData(COLL_DETENCIONES, "detenciones"),
      loadEquipMap(COLL_TALLER),
    ]);

    const faena = faenas.find(f => f.id === faenaId);
    if (!faena) {
      return res.status(404).json({ error: "Faena no encontrada" });
    }

    const pdfBuffer = await generarPDFFaenaCurso(faena, detenciones, equipMap);
    await enviarInformeFaenaCurso(email.trim(), faena, pdfBuffer);

    return res.status(200).json({ ok: true, email: email.trim(), faenaId, numeroFaena: faena.numeroFaena });
  } catch (err) {
    console.error("Error enviar-informe-faena-curso:", err);
    return res.status(500).json({ error: err.message });
  }
}
