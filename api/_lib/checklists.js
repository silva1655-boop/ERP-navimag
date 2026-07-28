// Carga de checklists y equipos del período — compartido por todos los endpoints
// de reportes. Fuente única: evita divergencias de colección/doc entre endpoints.
import {
  readDocData, readArrayDoc,
  readMonthlyIndexes, readChecklistDoc,
} from "./firebase.js";

export function monthKeysForRange(desde, hasta) {
  const keys = new Set();
  let cur = desde.slice(0, 7); // "YYYY-MM"
  const end = hasta.slice(0, 7);
  while (cur <= end) {
    keys.add(cur.replace("-", "_")); // "YYYY_MM"
    const [y, m] = cur.split("-").map(Number);
    cur = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  }
  return [...keys];
}

export async function loadChecklistsForPeriod(coll, desde, hasta) {
  const months = monthKeysForRange(desde, hasta);
  const checklists = [];

  // Índices modernos cl_index_YYYY_MM → docs individuales cl_{id}
  const { allIds, allMeta } = await readMonthlyIndexes(coll, months);

  const candidateIds = allIds.filter(id => {
    const m = allMeta[id];
    if (!m?.date) return true;
    return m.date >= desde && m.date <= hasta;
  });

  await Promise.all(
    candidateIds.map(async id => {
      const clData = await readChecklistDoc(coll, id);
      if (clData?.createdAt) {
        const d = clData.createdAt.slice(0, 10);
        if (d >= desde && d <= hasta) checklists.push(clData);
      }
    })
  );

  // Docs mensuales legacy: checklists_YYYY_MM
  for (const mk of months) {
    try {
      const arr = await readArrayDoc(coll, `checklists_${mk}`);
      if (arr) {
        arr.forEach(c => {
          if (c?.createdAt) {
            const d = c.createdAt.slice(0, 10);
            if (d >= desde && d <= hasta && !checklists.find(x => x.id === c.id)) {
              checklists.push(c);
            }
          }
        });
      }
    } catch { /* mes sin doc legacy — OK */ }
  }

  return checklists;
}

export async function loadEquipMap(coll) {
  // Los equipos se guardan en el doc "equipment" (ver keys[] en App.jsx)
  const equipos = await readDocData(coll, "equipment");
  const map = {};
  equipos.forEach(e => { if (e?.id) map[e.id] = e; });
  return map;
}
