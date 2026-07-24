// Previsualización de informe: devuelve PDF directo sin enviar emails
import { COLL_TALLER } from "./_lib/firebase.js";
import { loadChecklistsForPeriod, loadEquipMap } from "./_lib/checklists.js";
import { buildFaenasConDatos } from "./_lib/faenas.js";
import { generarPDFResumen } from "./_lib/pdf.js";

function isValidDate(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { desde, hasta } = req.query;

  if (!isValidDate(desde) || !isValidDate(hasta) || desde > hasta) {
    return res.status(400).json({ error: "Parámetros desde/hasta inválidos (YYYY-MM-DD)" });
  }

  try {
    const allFaenas = [];

    // Los checklists pre-operacionales por faena viven en el módulo Taller (mantek_v2).
    const [checklists, equipMap] = await Promise.all([
      loadChecklistsForPeriod(COLL_TALLER, desde, hasta),
      loadEquipMap(COLL_TALLER),
    ]);

    if (checklists.length > 0) {
      const faenas = buildFaenasConDatos(checklists, equipMap, desde, hasta);
      allFaenas.push(...faenas);
    }

    if (allFaenas.length === 0) {
      return res.status(404).json({ error: "No se encontraron faenas en el período seleccionado" });
    }

    const pdfBuffer = await generarPDFResumen(allFaenas, desde, hasta);
    const filename = `Preview_${desde}_${hasta}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
    res.setHeader("Content-Length", pdfBuffer.length);
    return res.status(200).send(pdfBuffer);
  } catch (err) {
    console.error("Error preview:", err);
    return res.status(500).json({ error: err.message });
  }
}
