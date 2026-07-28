// Cron handler: genera y envía informes semanales por faena
import {
  COLL_MARITIMO, COLL_TALLER,
  readDocData, appendToLog,
} from "../_lib/firebase.js";
import { loadChecklistsForPeriod, loadEquipMap } from "../_lib/checklists.js";
import { buildFaenasConDatos } from "../_lib/faenas.js";
import { generarPDFFaena } from "../_lib/pdf.js";
import { enviarReporteFaena } from "../_lib/email.js";

const CRON_SECRET = process.env.CRON_SECRET;

// ── Helpers de fecha ──────────────────────────────────────────────────────────

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

function getLastWeekRange() {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const dayOfWeek = today.getUTCDay(); // 0=dom
  const daysToLastMonday = dayOfWeek === 0 ? 13 : dayOfWeek + 6;
  const desde = new Date(today);
  desde.setUTCDate(today.getUTCDate() - daysToLastMonday);
  const hasta = new Date(desde);
  hasta.setUTCDate(desde.getUTCDate() + 6);
  return { desde: isoDate(desde), hasta: isoDate(hasta) };
}

function isValidDate(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));
}

// ── Lógica de envío compartida ────────────────────────────────────────────────

async function runEnvio(periodoDesde, periodoHasta) {
  const logEntries = [];
  const errors = [];
  let totalFaenas = 0;
  let faenasSinDestinatario = 0;

  const supervisores = await readDocData(COLL_MARITIMO, "supervisoresConfig");

  if (supervisores.length === 0) {
    return { sinSupervisores: true, logEntries, errors, totalFaenas, faenasSinDestinatario };
  }

  // Los checklists pre-operacionales por faena se registran en el módulo Taller (mantek_v2).
  // La nave (Esperanza/Dalka) viene poblada en el campo `nave` de cada checklist.
  {
    const [checklists, equipMap] = await Promise.all([
      loadChecklistsForPeriod(COLL_TALLER, periodoDesde, periodoHasta),
      loadEquipMap(COLL_TALLER),
    ]);

    const faenas = checklists.length === 0
      ? []
      : buildFaenasConDatos(checklists, equipMap, periodoDesde, periodoHasta);
    totalFaenas += faenas.length;

    for (const faena of faenas) {
      const destinatarios = supervisores
        .filter(s => {
          if (!s.activo) return false;
          // Config por puerto. Compat: supervisores antiguos con `naves` y sin
          // `puertos` reciben todos los puertos (puertos vacío = todos).
          const puertos = s.puertos || [];
          if (puertos.length === 0) return true;
          return puertos.includes(faena.puerto);
        })
        .map(s => s.email)
        .filter(Boolean);

      if (destinatarios.length === 0) { faenasSinDestinatario++; continue; }

      try {
        const pdfBuffer = await generarPDFFaena(faena, periodoDesde, periodoHasta);
        await enviarReporteFaena(destinatarios, faena, pdfBuffer, periodoDesde, periodoHasta);

        logEntries.push({
          ts: new Date().toISOString(),
          nave: faena.nave,
          puerto: faena.puerto,
          periodoDesde,
          periodoHasta,
          destinatarios,
          pct: faena.pct,
          ok: true,
        });
      } catch (err) {
        console.error(`Error faena ${faena.nave}/${faena.puerto}:`, err);
        errors.push({ nave: faena.nave, puerto: faena.puerto, error: err.message });
        logEntries.push({
          ts: new Date().toISOString(),
          nave: faena.nave,
          puerto: faena.puerto,
          periodoDesde,
          periodoHasta,
          destinatarios,
          ok: false,
          error: err.message,
        });
      }
    }
  }

  if (logEntries.length > 0) {
    await appendToLog(COLL_MARITIMO, "reportesEnviadosLog", logEntries, 100);
  }

  return { sinSupervisores: false, logEntries, errors, totalFaenas, faenasSinDestinatario };
}

// ── Handler principal ─────────────────────────────────────────────────────────

export default async function handler(req, res) {
  // POST: envío manual desde la UI del ERP
  if (req.method === "POST") {
    let body = {};
    try { body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {}); } catch { /* ignore */ }

    const { desde, hasta } = body;
    if (!isValidDate(desde) || !isValidDate(hasta) || desde > hasta) {
      return res.status(400).json({ error: "Parámetros desde/hasta inválidos (YYYY-MM-DD)" });
    }

    try {
      const { sinSupervisores, logEntries, errors, totalFaenas, faenasSinDestinatario } = await runEnvio(desde, hasta);
      if (sinSupervisores) {
        return res.status(200).json({ ok: true, message: "Sin supervisores activos configurados", periodo: { desde, hasta }, enviados: 0, errores: 0, totalFaenas: totalFaenas ?? 0 });
      }
      return res.status(200).json({
        ok: true,
        periodo: { desde, hasta },
        enviados: logEntries.filter(e => e.ok).length,
        errores: errors.length,
        totalFaenas,
        faenasSinDestinatario,
        errors: errors.length ? errors : undefined,
      });
    } catch (err) {
      console.error("Error envío manual:", err);
      return res.status(500).json({ error: err.message });
    }
  }

  // GET: cron de Vercel
  const authHeader = req.headers["authorization"];
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { desde: periodoDesde, hasta: periodoHasta } = getLastWeekRange();

  try {
    const { sinSupervisores, logEntries, errors } = await runEnvio(periodoDesde, periodoHasta);
    if (sinSupervisores) {
      return res.status(200).json({ message: "Sin supervisores configurados", periodo: { periodoDesde, periodoHasta } });
    }
    return res.status(200).json({
      ok: true,
      periodo: { periodoDesde, periodoHasta },
      enviados: logEntries.filter(e => e.ok).length,
      errores: errors.length,
      errors: errors.length ? errors : undefined,
    });
  } catch (err) {
    console.error("Error cron:", err);
    return res.status(500).json({ error: err.message });
  }
}
