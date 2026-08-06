// Previsualización del informe de una faena de Faena en Curso: devuelve el
// PDF directo, sin enviar correo. Mismo patrón que preview-reporte.js.
import { COLL_TALLER, COLL_FAENA, COLL_DETENCIONES, readDocData } from "./_lib/firebase.js";
import { loadEquipMap } from "./_lib/checklists.js";
import { generarPDFFaenaCurso } from "./_lib/pdf.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { faenaId } = req.query;
  if (!faenaId || typeof faenaId !== "string") {
    return res.status(400).json({ error: "Falta el parámetro faenaId" });
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
    const filename = `Informe_Faena_${faena.numeroFaena}_${faena.buque}.pdf`.replace(/\s+/g, "_");

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
    res.setHeader("Content-Length", pdfBuffer.length);
    return res.status(200).send(pdfBuffer);
  } catch (err) {
    console.error("Error preview-faena-curso:", err);
    return res.status(500).json({ error: err.message });
  }
}
