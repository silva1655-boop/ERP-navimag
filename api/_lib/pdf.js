// Generador de PDF por faena usando pdfkit (server-side, sin DOM)
import PDFDocument from "pdfkit";

const ROJO  = "#8B0000";
const AZUL  = "#0055A4";
const GRIS  = "#6b7280";
const VERDE = "#16a34a";
const AMBER = "#d97706";

const cumplColor = p => p >= 90 ? VERDE : p >= 70 ? AMBER : ROJO;

function hdrRow(doc, y, cols, headers, W) {
  doc.rect(40, y, W, 17).fill("#fef2f2");
  let cx = 40;
  headers.forEach((h, i) => {
    doc.fillColor(ROJO).fontSize(8).font("Helvetica-Bold")
      .text(h, cx + 3, y + 5, { width: cols[i] - 3, lineBreak: false });
    cx += cols[i];
  });
  return y + 17;
}

function dataRow(doc, y, cols, cells, colorFns, striped) {
  if (striped) doc.rect(40, y, cols.reduce((a, c) => a + c, 0), 15).fill("#f8fafc").stroke();
  let cx = 40;
  cells.forEach((v, i) => {
    const color = colorFns?.[i] ? colorFns[i](v) : "#1a1a1a";
    doc.fillColor(color).fontSize(8).font("Helvetica")
      .text(String(v), cx + 3, y + 4, { width: cols[i] - 3, lineBreak: false });
    cx += cols[i];
  });
  return y + 15;
}

// Renderiza una faena en un documento ya existente.
// Si addPage=true agrega una página nueva antes de renderizar.
function renderFaenaEnDoc(doc, faena, periodoDesde, periodoHasta, addPage) {
  if (addPage) doc.addPage();

  const W = doc.page.width - 80;

  // ── PORTADA ───────────────────────────────────────────────────────────────
  doc.rect(0, 0, doc.page.width, 128).fill(ROJO);
  doc.fillColor("#fff")
    .fontSize(8).font("Helvetica")
    .text("🚢  NAVIMAG FERRIES  ·  INFORME SEMANAL CHECKLIST PRE-OPERACIONAL", 40, 24, { width: W })
    .fontSize(20).font("Helvetica-Bold")
    .text(`${faena.nave}  —  ${faena.puerto}`, 40, 42, { width: W })
    .fontSize(10).font("Helvetica")
    .text(`Período del informe: ${periodoDesde}  →  ${periodoHasta}`, 40, 74)
    .text(`Faena detectada: ${faena.fechaInicio}  →  ${faena.fechaFin}  ·  ${faena.diasFaena} turno(s)`, 40, 89)
    .text(`Generado: ${new Date().toLocaleString("es-CL")}`, 40, 104);
  doc.fillColor("#1a1a1a");

  // ── MÉTRICAS ──────────────────────────────────────────────────────────────
  const mY = 148;
  doc.fontSize(10).font("Helvetica-Bold").fillColor(ROJO).text("RESUMEN DE CUMPLIMIENTO", 40, mY);
  const mBoxY = mY + 16;
  const mW = (W - 18) / 4;
  const metrics = [
    { l: "Realizados",  v: String(faena.realizados),  color: AZUL },
    { l: "Target total",v: String(faena.targetTotal), color: AZUL },
    { l: "Target/turno",v: String(faena.target),      color: AZUL },
    { l: "Cumplimiento",v: `${faena.pct}%`,           color: cumplColor(faena.pct) },
  ];
  metrics.forEach((m, i) => {
    const x = 40 + i * (mW + 6);
    doc.rect(x, mBoxY, mW, 50).stroke("#e2e8f0");
    doc.fontSize(18).font("Helvetica-Bold").fillColor(m.color)
      .text(m.v, x + 4, mBoxY + 8, { width: mW - 8, align: "center" });
    doc.fontSize(8).font("Helvetica").fillColor(GRIS)
      .text(m.l, x + 4, mBoxY + 32, { width: mW - 8, align: "center" });
  });
  doc.fillColor("#1a1a1a");

  // ── TABLA TURNOS ──────────────────────────────────────────────────────────
  let y = mBoxY + 62;
  doc.fontSize(10).font("Helvetica-Bold").fillColor(ROJO).text("DETALLE POR TURNO", 40, y);
  y += 14;
  const tCols = [155, 65, 65, 65, 90];
  y = hdrRow(doc, y, tCols, ["Inicio turno", "Fin", "Equipos", "Target", "Cumpl."], W);

  faena.turnos.forEach((t, idx) => {
    if (y > 720) { doc.addPage(); y = 40; }
    const tp = faena.target > 0 ? Math.min(100, Math.round((t.equiposUnicos / faena.target) * 100)) : 0;
    const fmtDt = dt => dt.toLocaleString("es-CL", { day:"2-digit", month:"2-digit", year:"2-digit", hour:"2-digit", minute:"2-digit" });
    const fmtTm = dt => dt.toLocaleString("es-CL", { hour:"2-digit", minute:"2-digit" });
    y = dataRow(doc, y, tCols,
      [fmtDt(t.inicio), fmtTm(t.fin), t.equiposUnicos, faena.target, `${tp}%`],
      [null, null, null, null, v => cumplColor(parseInt(v))],
      idx % 2 === 1
    );
  });

  // ── TABLA OPERADORES ──────────────────────────────────────────────────────
  y += 14;
  if (y > 680) { doc.addPage(); y = 40; }
  doc.fontSize(10).font("Helvetica-Bold").fillColor(ROJO).text("OPERADORES", 40, y);
  y += 14;
  const oCols = [230, 100, 110];
  y = hdrRow(doc, y, oCols, ["Operador", "Checklists", "Equipos únicos"], W);

  (faena.operadores || []).forEach((op, idx) => {
    if (y > 720) { doc.addPage(); y = 40; }
    y = dataRow(doc, y, oCols,
      [op.nombre, op.checklists, op.equipos],
      null, idx % 2 === 1
    );
  });

  // ── EQUIPOS REVISADOS ─────────────────────────────────────────────────────
  y += 14;
  if (y > 680) { doc.addPage(); y = 40; }
  doc.fontSize(10).font("Helvetica-Bold").fillColor(ROJO).text("EQUIPOS REVISADOS", 40, y);
  y += 14;
  const equipos = faena.equipos || [];
  const colW = (W - 8) / 3;
  equipos.forEach((eq, idx) => {
    const col = idx % 3;
    if (col === 0 && idx > 0) y += 14;
    if (y > 730) { doc.addPage(); y = 40; }
    const x = 40 + col * (colW + 4);
    doc.fillColor("#1a1a1a").fontSize(8).font("Helvetica-Bold")
      .text(`${eq.code}`, x, y, { continued: true, width: colW - 30 });
    doc.font("Helvetica").fillColor(GRIS)
      .text(` (${eq.count}x)`, { width: 28 });
  });

  // ── FOOTER ────────────────────────────────────────────────────────────────
  const footY = doc.page.height - 32;
  doc.fontSize(7).fillColor(GRIS)
    .text(
      `MANTEK ERP v2.0  ·  Informe generado automáticamente  ·  ${new Date().toLocaleDateString("es-CL")}`,
      40, footY, { align: "center", width: W }
    );
}

// PDF para una sola faena (usado en el envío por email)
export function generarPDFFaena(faena, periodoDesde, periodoHasta) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({ margin: 40, size: "A4" });
    doc.on("data", chunk => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    renderFaenaEnDoc(doc, faena, periodoDesde, periodoHasta, false);
    doc.end();
  });
}

// PDF combinado con todas las faenas del período (usado en la previsualización)
export function generarPDFResumen(faenas, periodoDesde, periodoHasta) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({ margin: 40, size: "A4" });
    doc.on("data", chunk => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    faenas.forEach((faena, i) => renderFaenaEnDoc(doc, faena, periodoDesde, periodoHasta, i > 0));
    doc.end();
  });
}
