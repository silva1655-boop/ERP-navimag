// Migración histórica: Registro_Detenciones_Tractos.xlsx (hojas "Faena" y
// "Detenciones") -> mantek_faena / mantek_detenciones en Firestore.
//
// Uso:
//   node scripts/migrate-faena-detenciones.mjs <ruta.xlsx>              (dry-run: solo valida e imprime el reporte)
//   node scripts/migrate-faena-detenciones.mjs <ruta.xlsx> --write      (además escribe en Firestore)
//
// Para --write hacen falta las mismas env vars que usan las funciones
// serverless de este repo (api/_lib/firebase.js):
//   FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
//
// Los campos derivados de cada Faena se calculan acá con la MISMA fórmula
// que calcularFaenaDerivados() en App.jsx (bloque 2, corregida y validada
// contra este mismo Excel) — no se copian las columnas ya calculadas del
// Excel, salvo Disponibilidad_Tecnica/Utilizacion (columnas N/P), que se
// usan solo como referencia para el reporte de validación (bloque 5).
//
// El script es re-ejecutable: cada fila migrada queda marcada con
// origen:"migracion_excel"; si se corre de nuevo, reemplaza solo esas filas
// y conserva cualquier Faena/Detención cargada a mano desde la app.

import XLSX from "xlsx";

const args = process.argv.slice(2);
const xlsxPath = args.find(a => !a.startsWith("--"));
const doWrite = args.includes("--write");

if (!xlsxPath) {
  console.error("Uso: node scripts/migrate-faena-detenciones.mjs <ruta.xlsx> [--write]");
  process.exit(1);
}

// Mismos 4 targets sembrados en el bloque 1 (mantek_config_targets). Si ya
// los editaste en la app, --write los vuelve a leer de Firestore antes de
// calcular; en dry-run se usan estos valores por defecto para el reporte.
const TARGETS_DEFAULT = [
  { buque: "ESPERANZA", terminal: "PMC", target: 8 },
  { buque: "ESPERANZA", terminal: "NAT", target: 6 },
  { buque: "DALKA", terminal: "PMC", target: 6 },
  { buque: "DALKA", terminal: "UCO", target: 3 },
];

function getISOWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  return 1 + Math.round((d - firstThursday) / (7 * 24 * 3600 * 1000));
}

// Idéntica a calcularFaenaDerivados() en App.jsx.
function calcularFaenaDerivados({ buque, terminal, inicioOp, terminoOp, tractosOp, capacidadOperadores }, targets, indisponibilidadHH = 0) {
  const targetRow = targets.find(t => t.buque === buque && t.terminal === terminal);
  if (!targetRow) return null;
  const target = targetRow.target;
  const ini = new Date(inicioOp), fin = new Date(terminoOp);
  if (isNaN(ini.getTime()) || isNaN(fin.getTime()) || fin <= ini) return null;
  const tOp = parseFloat(tractosOp) || 0;
  const horasOperacionBruta = (fin - ini) / 3600000;
  const utilizacionEsperada = target * horasOperacionBruta;
  const horasOperacion = tOp * horasOperacionBruta;
  const horasDescontables = Math.max(0, (target - (parseFloat(capacidadOperadores) || 0)) * horasOperacionBruta);
  const disponibilidadTecnica = utilizacionEsperada > 0 ? Math.max(0, Math.min(1, (horasOperacion - indisponibilidadHH) / utilizacionEsperada)) : 0;
  const cumplimiento = target > 0 ? Math.min(1, tOp / target) : 0;
  const utilizacion = horasOperacion > 0 ? Math.max(0, Math.min(1, (horasOperacion - indisponibilidadHH - horasDescontables) / horasOperacion)) : 0;
  return {
    target, horasOperacionBruta, horasDescontables, horasOperacion, utilizacionEsperada,
    indisponibilidadHH, disponibilidadTecnica, cumplimiento, utilizacion,
    semana: getISOWeek(fin), mes: fin.getMonth() + 1, anio: fin.getFullYear(),
  };
}

function uid() {
  return "m" + Math.random().toString(36).slice(2, 10);
}

// Normaliza espacios/mayúsculas antes de comparar números de faena — el Excel
// mezcla épocas con distinto criterio de captura ("191 S", "6150", "236 N").
function normEspacios(s) {
  return String(s || "").trim().toUpperCase().replace(/\s+/g, " ");
}

// Fallback cuando no hay match exacto: separa "NUMERO" + sufijo opcional
// (una letra). El Excel usa el sufijo "N" consistentemente para el terminal
// NAT/UCO, mientras que "S" y la ausencia de sufijo son intercambiables y
// siempre significan PMC (confirmado: en la hoja Faena, toda fila sin
// sufijo es PMC, nunca NAT/UCO). Por eso "S" y "" comparten bucket, y "N"
// va aparte — nunca se cruzan (una detención "235 S" jamás se asigna a la
// faena "235 N", aunque compartan el mismo número base).
function claveBucket(buque, numeroFaenaNorm) {
  const m = numeroFaenaNorm.match(/^(\d+)\s*([A-Z])?$/);
  if (!m) return null;
  const base = m[1];
  const bucket = m[2] === "N" ? "N" : "S";
  return `${buque}|${base}|${bucket}`;
}

// ── Leer el Excel ────────────────────────────────────────────────────────────
console.log(`Leyendo ${xlsxPath} ...`);
const wb = XLSX.readFile(xlsxPath, { cellDates: true });

const wsFaena = wb.Sheets["Faena"];
const wsDet = wb.Sheets["Detenciones"];
if (!wsFaena) throw new Error('No se encontró la hoja "Faena" en el Excel.');
if (!wsDet) throw new Error('No se encontró la hoja "Detenciones" en el Excel.');

const faenaRows = XLSX.utils.sheet_to_json(wsFaena, { header: 1, defval: "", raw: true }).slice(1)
  .filter(r => r[1] !== "" && r[1] != null);
const detRows = XLSX.utils.sheet_to_json(wsDet, { header: 1, defval: "", raw: true }).slice(1)
  .filter(r => r[3] !== "" && r[3] != null); // Nave (buque) no vacío

console.log(`Faena: ${faenaRows.length} filas con datos. Detenciones: ${detRows.length} filas con datos.`);

// ── Parsear Faena (columnas A..U, ver hoja "Faena" del Excel) ───────────────
// A Buque, B Faena, C Terminal, D Inicio OP, E Termino Op, ...
// I Capacidad_Operadores, J Tractos OP, K Tractos Utilizados,
// N Disponibilidad_Tecnica (ref.), P Utilizacion (ref.), U horas_descontables
const faenasRaw = faenaRows.map((r, idx) => ({
  filaExcel: idx + 2,
  buque: normEspacios(r[0]),
  numeroFaena: normEspacios(r[1]),
  terminal: normEspacios(r[2]),
  inicioOp: r[3] instanceof Date ? r[3] : new Date(r[3]),
  terminoOp: r[4] instanceof Date ? r[4] : new Date(r[4]),
  capacidadOperadores: parseFloat(r[8]) || 0,
  tractosOp: parseFloat(r[9]) || 0,
  tractosUtilizados: parseFloat(r[10]) || 0,
  refDispTec: parseFloat(r[13]) || 0,
  refUtilizacion: parseFloat(r[15]) || 0,
  horasDescU: parseFloat(r[20]) || 0, // ajuste histórico de horas_descontables (col U), casi siempre 0
}));

// Detectar (buque,numeroFaena) duplicados en el Excel — dato real del archivo,
// no algo que este script deba "arreglar" solo.
const clavesVistas = new Map();
faenasRaw.forEach(f => {
  const k = f.buque + "|" + f.numeroFaena;
  if (!clavesVistas.has(k)) clavesVistas.set(k, []);
  clavesVistas.get(k).push(f);
});
const duplicados = [...clavesVistas.entries()].filter(([, v]) => v.length > 1);

// ── Parsear Detenciones (columnas A..S, ver hoja "Detenciones") ─────────────
// D Nave(buque), E Viaje(numeroFaena), F Inicio, G Fin, I Equipo, J Componente,
// K Modo de Falla, L Tipo, N Novedades, P Clasificación, Q Familia Equipo
const detencionesRaw = detRows.map((r, idx) => ({
  filaExcel: idx + 2,
  buque: normEspacios(r[3]),
  numeroFaena: r[4] === "" || r[4] == null ? "" : normEspacios(r[4]),
  inicio: r[5] instanceof Date ? r[5] : new Date(r[5]),
  fin: r[6] instanceof Date ? r[6] : new Date(r[6]),
  equipo: String(r[8] || "").trim(),
  componente: String(r[9] || "").trim(),
  modoFalla: String(r[10] || "").trim(),
  tipo: String(r[11] || "").trim(),
  novedades: String(r[13] || "").trim(),
  clasificacion: String(r[15] || "").trim(),
  familiaEquipo: String(r[16] || "").trim(),
}));

// ── Asignar ids + emparejar Detención -> Faena por (buque,numeroFaena) exacto,
// con fallback por bucket de sufijo S/N cuando no hay match exacto ─────────
const faenas = faenasRaw.map(f => ({ ...f, id: uid() }));
const indiceFaenas = new Map();
faenas.forEach(f => {
  const k = f.buque + "|" + f.numeroFaena;
  if (!indiceFaenas.has(k)) indiceFaenas.set(k, f); // duplicados: se asigna a la primera ocurrencia
});
const indiceBucket = new Map();
faenas.forEach(f => {
  const k = claveBucket(f.buque, f.numeroFaena);
  if (!k) return;
  if (!indiceBucket.has(k)) indiceBucket.set(k, []);
  indiceBucket.get(k).push(f);
});

const sinMatch = [];
const autoResueltos = [];
const detenciones = detencionesRaw.map(d => {
  let faenaId = null;
  if (!d.numeroFaena) {
    sinMatch.push({ ...d, motivo: "sin N° de faena/viaje" });
  } else {
    const exacto = indiceFaenas.get(d.buque + "|" + d.numeroFaena);
    if (exacto) {
      faenaId = exacto.id;
    } else {
      const k = claveBucket(d.buque, d.numeroFaena);
      const candidatos = k ? (indiceBucket.get(k) || []) : [];
      if (candidatos.length === 1) {
        faenaId = candidatos[0].id;
        autoResueltos.push({ ...d, resuelto: candidatos[0].numeroFaena });
      } else if (candidatos.length > 1) {
        sinMatch.push({ ...d, motivo: `ambiguo: ${candidatos.length} faenas candidatas (${candidatos.map(x => x.numeroFaena).join(", ")})` });
      } else {
        sinMatch.push({ ...d, motivo: "no hay Faena con ese buque+N° (ni exacta ni por sufijo S/N)" });
      }
    }
  }
  const horasReparacion = (d.fin - d.inicio) / 3600000;
  return {
    id: uid(),
    fecha: d.inicio.toISOString(),
    buque: d.buque,
    faenaId,
    numeroFaena: d.numeroFaena,
    inicio: d.inicio.toISOString(),
    fin: d.fin.toISOString(),
    horasReparacion,
    equipo: d.equipo,
    componente: d.componente,
    modoFalla: d.modoFalla,
    tipo: d.tipo,
    novedades: d.novedades,
    familiaEquipo: d.familiaEquipo,
    clasificacion: d.clasificacion,
    origen: "migracion_excel",
    _filaExcel: d.filaExcel,
  };
});

// ── Calcular campos derivados de cada Faena (indisponibilidadHH = suma real
// de horasReparacion de sus Detenciones ya emparejadas) ─────────────────────
async function cargarTargets() {
  if (!doWrite) return TARGETS_DEFAULT;
  const { readArrayDoc } = await import("../api/_lib/firebase.js");
  const targets = await readArrayDoc("mantek_config_targets", "config");
  if (!targets || targets.length === 0) {
    console.warn("⚠ mantek_config_targets está vacío en Firestore — usando los 4 valores por defecto del spec.");
    return TARGETS_DEFAULT;
  }
  return targets;
}

const targets = await cargarTargets();

const faenasFinal = faenas.map(f => {
  const hh = detenciones.filter(d => d.faenaId === f.id).reduce((s, d) => s + d.horasReparacion, 0);
  // horasOperacionBruta se ajusta acá restando horas_descontables (col U) solo
  // para reproducir fielmente el histórico del Excel (4 de 180 filas la traían
  // distinta de 0); una Faena nueva cargada desde la app siempre parte de 0.
  const inicioAjustado = f.inicioOp;
  const terminoAjustado = new Date(f.terminoOp.getTime() - f.horasDescU * 3600000);
  const derivados = calcularFaenaDerivados(
    { buque: f.buque, terminal: f.terminal, inicioOp: inicioAjustado, terminoOp: terminoAjustado, tractosOp: f.tractosOp, capacidadOperadores: f.capacidadOperadores },
    targets, hh
  );
  if (!derivados) {
    console.warn(`⚠ Faena ${f.buque} ${f.numeroFaena} (fila ${f.filaExcel}) no se pudo calcular (target no configurado o fechas inválidas) — se omite.`);
    return null;
  }
  return {
    id: f.id,
    buque: f.buque, terminal: f.terminal, numeroFaena: f.numeroFaena,
    inicioOp: f.inicioOp.toISOString(), terminoOp: f.terminoOp.toISOString(),
    tractosOp: f.tractosOp, tractosUtilizados: f.tractosUtilizados, capacidadOperadores: f.capacidadOperadores,
    ...derivados,
    origen: "migracion_excel",
    creadoPor: "migración", creadoEn: new Date().toISOString(), recalculadoEn: new Date().toISOString(),
    _filaExcel: f.filaExcel, _refDispTec: f.refDispTec, _refUtilizacion: f.refUtilizacion,
  };
}).filter(Boolean);

// ── Reporte de validación (bloque 5): comparar contra columnas N/P del Excel
console.log("\n=== Validación contra columnas N (Disponibilidad_Tecnica) y P (Utilizacion) del Excel ===");
let coincideDisp = 0, coincideUtil = 0, difsGrandes = [];
const TOLERANCIA = 0.01; // 1 punto porcentual
faenasFinal.forEach(f => {
  const errDisp = Math.abs(f.disponibilidadTecnica - f._refDispTec);
  const errUtil = Math.abs(f.utilizacion - f._refUtilizacion);
  if (errDisp <= TOLERANCIA) coincideDisp++;
  if (errUtil <= TOLERANCIA) coincideUtil++;
  if (errDisp > TOLERANCIA || errUtil > TOLERANCIA) {
    difsGrandes.push({ buque: f.buque, numeroFaena: f.numeroFaena, filaExcel: f._filaExcel, errDisp, errUtil, calcDisp: f.disponibilidadTecnica, refDisp: f._refDispTec, calcUtil: f.utilizacion, refUtil: f._refUtilizacion });
  }
});
console.log(`Disponibilidad Técnica: ${coincideDisp}/${faenasFinal.length} coinciden dentro de ±1pp`);
console.log(`Utilización:            ${coincideUtil}/${faenasFinal.length} coinciden dentro de ±1pp`);

console.log("\n--- Muestra de 15 faenas (calculado vs. Excel) ---");
const muestra = faenasFinal.filter((_, i) => i % Math.ceil(faenasFinal.length / 15) === 0).slice(0, 15);
muestra.forEach(f => {
  console.log(`${f.buque.padEnd(10)} ${String(f.numeroFaena).padEnd(8)} DispTec calc=${(f.disponibilidadTecnica * 100).toFixed(1)}% excel=${(f._refDispTec * 100).toFixed(1)}%  |  Util calc=${(f.utilizacion * 100).toFixed(1)}% excel=${(f._refUtilizacion * 100).toFixed(1)}%`);
});

if (difsGrandes.length > 0) {
  console.log(`\n--- ${difsGrandes.length} fila(s) con diferencia >1pp (revisar fórmula de "Horas Operación" de esas filas en el Excel — ver commit de fix) ---`);
  difsGrandes.forEach(d => {
    console.log(`  fila ${d.filaExcel} ${d.buque} ${d.numeroFaena}: DispTec calc=${(d.calcDisp * 100).toFixed(1)}% excel=${(d.refDisp * 100).toFixed(1)}%  Util calc=${(d.calcUtil * 100).toFixed(1)}% excel=${(d.refUtil * 100).toFixed(1)}%`);
  });
}

if (autoResueltos.length > 0) {
  console.log(`\n=== ${autoResueltos.length} detención(es) resueltas por normalización de sufijo S/N (sin match exacto, pero con un único candidato inequívoco) ===`);
  autoResueltos.forEach(d => {
    console.log(`  fila ${d.filaExcel} ${d.buque} N°"${d.numeroFaena}" -> asignada a Faena "${d.resuelto}"`);
  });
}

console.log(`\n=== Detenciones sin faena coincidente (necesitan revisión manual): ${sinMatch.length}/${detenciones.length} ===`);
sinMatch.forEach(d => {
  console.log(`  fila ${d.filaExcel} ${d.buque} N°"${d.numeroFaena || "(vacío)"}" — ${d.motivo}`);
});

if (duplicados.length > 0) {
  console.log(`\n=== ${duplicados.length} clave(s) buque+N°faena duplicadas en la hoja Faena (revisar/fusionar manualmente en la app) ===`);
  duplicados.forEach(([k, filas]) => {
    console.log(`  ${k}: ${filas.length} filas -> Excel filas ${filas.map(f => f.filaExcel).join(", ")}`);
  });
}

console.log(`\nTotal a migrar: ${faenasFinal.length} faenas, ${detenciones.length} detenciones (${detenciones.length - sinMatch.length} con faena asignada, de las cuales ${autoResueltos.length} se resolvieron por normalización de sufijo S/N).`);

// ── Escritura a Firestore (solo con --write) ────────────────────────────────
if (!doWrite) {
  console.log("\n(dry-run: no se escribió nada en Firestore. Agregá --write para migrar de verdad.)");
  process.exit(0);
}

const { readArrayDoc, writeDocData } = await import("../api/_lib/firebase.js");

const faenasExistentes = (await readArrayDoc("mantek_faena", "faenas")) || [];
const detencionesExistentes = (await readArrayDoc("mantek_detenciones", "detenciones")) || [];

const faenasFinalSinMigracionPrevia = faenasExistentes.filter(f => f.origen !== "migracion_excel");
const detencionesFinalSinMigracionPrevia = detencionesExistentes.filter(d => d.origen !== "migracion_excel");

const faenasAEscribir = [...faenasFinalSinMigracionPrevia, ...faenasFinal.map(({ _filaExcel, _refDispTec, _refUtilizacion, ...f }) => f)];
const detencionesAEscribir = [...detencionesFinalSinMigracionPrevia, ...detenciones.map(({ _filaExcel, ...d }) => d)];

await writeDocData("mantek_faena", "faenas", faenasAEscribir);
await writeDocData("mantek_detenciones", "detenciones", detencionesAEscribir);

console.log(`\n✅ Escrito en Firestore: ${faenasAEscribir.length} faenas (${faenasFinalSinMigracionPrevia.length} preexistentes conservadas), ${detencionesAEscribir.length} detenciones (${detencionesFinalSinMigracionPrevia.length} preexistentes conservadas).`);
