// Firebase Admin SDK para funciones serverless
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

export const COLL_MARITIMO = "mantek_maritimo_v1";
export const COLL_DALKA    = "mantek_dalka_v1";
export const COLL_TALLER   = "mantek_v2";

// Init lazy — no crashea el módulo si faltan env vars;
// el error se propaga como excepción capturada en el handler → JSON 500.
let _db = null;

function getDb() {
  if (_db) return _db;

  const projectId   = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;

  // Vercel puede almacenar la clave con \n literales, saltos reales o comillas externas
  let privateKey = process.env.FIREBASE_PRIVATE_KEY || "";
  if (privateKey.startsWith('"')) privateKey = privateKey.slice(1);
  if (privateKey.endsWith('"'))   privateKey = privateKey.slice(0, -1);
  privateKey = privateKey.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      `Variables de entorno incompletas: ` +
      `FIREBASE_PROJECT_ID=${!!projectId}, ` +
      `FIREBASE_CLIENT_EMAIL=${!!clientEmail}, ` +
      `FIREBASE_PRIVATE_KEY=${!!privateKey}`
    );
  }

  if (!getApps().length) {
    initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  }

  _db = getFirestore();
  return _db;
}

// ── Helpers genéricos ─────────────────────────────────────────────────────────

/** Lee el array .data de un documento clave/valor */
export async function readDocData(coll, key) {
  const snap = await getDb().collection(coll).doc(key).get();
  return snap.exists ? (snap.data().data || []) : [];
}

/** Escribe el array .data en un documento clave/valor */
export async function writeDocData(coll, key, data) {
  await getDb().collection(coll).doc(key).set({ data });
}

/**
 * Lee el array .data de un doc; devuelve null si el doc no existe.
 * Útil para distinguir "doc vacío" de "doc inexistente".
 */
export async function readArrayDoc(coll, key) {
  const snap = await getDb().collection(coll).doc(key).get();
  if (!snap.exists) return null;
  return snap.data().data || [];
}

/** Añade entradas a un log circular (máx maxEntries) */
export async function appendToLog(coll, key, entries, maxEntries = 100) {
  const ref = getDb().collection(coll).doc(key);
  const snap = await ref.get();
  const prev = snap.exists ? (snap.data().data || []) : [];
  await ref.set({ data: [...prev, ...entries].slice(-maxEntries) });
}

// ── Helpers de checklists ─────────────────────────────────────────────────────

/** Lee un checklist individual (doc: cl_{id}) */
export async function readChecklistDoc(coll, id) {
  try {
    const snap = await getDb().collection(coll).doc(`cl_${id}`).get();
    return snap.exists ? snap.data().data : null;
  } catch {
    return null;
  }
}

/** Lee los índices mensuales de checklists y devuelve { allIds, allMeta } */
export async function readMonthlyIndexes(coll, months) {
  const allIds = [];
  const allMeta = {};
  for (const mk of months) {
    try {
      const snap = await getDb().collection(coll).doc(`cl_index_${mk}`).get();
      if (snap.exists) {
        allIds.push(...(snap.data().ids || []));
        Object.assign(allMeta, snap.data().meta || {});
      }
    } catch { /* mes sin índice — OK */ }
  }
  return { allIds, allMeta };
}
