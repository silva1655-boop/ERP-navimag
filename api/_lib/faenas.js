// Lógica de negocio de faenas — réplica exacta de las funciones en App.jsx
// Usable en Node.js sin dependencias de DOM/React

export const TARGET_CHECKLISTS_POR_NAVE_PUERTO = {
  "Esperanza_PMC": 10,
  "Esperanza_NAT": 7,
  "Esperanza_UCO": 7,
  "Dalka_UCO":     4,
  "Dalka_PMC":     8,
  "Dalka_NAT":     7,
};

const UMBRAL_TURNO_HORAS = 12;

export function getTargetFaena(nave, puerto) {
  return TARGET_CHECKLISTS_POR_NAVE_PUERTO[`${nave}_${puerto}`] || 0;
}

export function agruparPorTurno(checklistsDeUnGrupo) {
  const ordenados = [...checklistsDeUnGrupo].sort(
    (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
  );
  const turnos = [];
  let actual = null;
  ordenados.forEach(c => {
    const fecha = new Date(c.createdAt);
    if (!actual) {
      actual = { inicio: fecha, fin: fecha, checklists: [c] };
    } else {
      const diffH = (fecha - actual.fin) / (1000 * 60 * 60);
      if (diffH > UMBRAL_TURNO_HORAS) {
        turnos.push(actual);
        actual = { inicio: fecha, fin: fecha, checklists: [c] };
      } else {
        actual.fin = fecha;
        actual.checklists.push(c);
      }
    }
  });
  if (actual) turnos.push(actual);
  return turnos.map(t => ({
    ...t,
    equiposUnicos: new Set(t.checklists.map(c => c.equipId).filter(Boolean)).size,
    fechaRepresentativa: t.inicio.toISOString().slice(0, 10),
  }));
}

export function detectarFaenas(checklistsNave) {
  const ordenados = [...checklistsNave].sort(
    (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
  );
  const faenas = [];
  let actual = null;
  ordenados.forEach(c => {
    const dia = c.createdAt?.slice(0, 10);
    if (!dia || !c.puerto) return;
    if (!actual || actual.puerto !== c.puerto) {
      if (actual) faenas.push(actual);
      actual = { puerto: c.puerto, nave: c.nave, fechaInicio: dia, fechaFin: dia, checklists: [c] };
    } else {
      const diffDias = Math.round(
        (new Date(dia) - new Date(actual.fechaFin)) / (1000 * 60 * 60 * 24)
      );
      if (diffDias > 1) {
        faenas.push(actual);
        actual = { puerto: c.puerto, nave: c.nave, fechaInicio: dia, fechaFin: dia, checklists: [c] };
      } else {
        actual.fechaFin = dia;
        actual.checklists.push(c);
      }
    }
  });
  if (actual) faenas.push(actual);
  return faenas;
}

export function calcCumplimientoFaena(faena) {
  const target    = getTargetFaena(faena.nave, faena.puerto);
  const turnos    = agruparPorTurno(faena.checklists);
  const diasFaena = Math.max(1, turnos.length);
  const targetTotal = target * diasFaena;
  const realizados  = turnos.reduce((sum, t) => sum + t.equiposUnicos, 0);
  const pct = targetTotal > 0 ? Math.round((realizados / targetTotal) * 100) : 0;
  return { ...faena, diasFaena, target, targetTotal, realizados, pct, turnos };
}

// Devuelve faenas con datos enriquecidos (operadores + equipos) para el período dado
export function buildFaenasConDatos(checklists, equipMap, desde, hasta) {
  const enPeriodo = checklists.filter(c => {
    if (!c?.createdAt || !c.nave || !c.puerto) return false;
    const d = c.createdAt.slice(0, 10);
    return d >= desde && d <= hasta;
  });

  // Agrupar por nave
  const porNave = {};
  enPeriodo.forEach(c => {
    if (!porNave[c.nave]) porNave[c.nave] = [];
    porNave[c.nave].push(c);
  });

  const todasFaenas = [];
  for (const cls of Object.values(porNave)) {
    const faenas = detectarFaenas(cls).map(calcCumplimientoFaena);
    todasFaenas.push(...faenas);
  }

  return todasFaenas
    .filter(f => f.fechaFin >= desde && f.fechaInicio <= hasta)
    .map(f => {
      // Operadores
      const opMap = {};
      f.checklists.forEach(c => {
        const key = c.operatorName || c.operatorId || "Desconocido";
        if (!opMap[key]) opMap[key] = { nombre: key, checklists: 0, equiposSet: new Set() };
        opMap[key].checklists++;
        if (c.equipId) opMap[key].equiposSet.add(c.equipId);
      });
      const operadores = Object.values(opMap)
        .map(o => ({ nombre: o.nombre, checklists: o.checklists, equipos: o.equiposSet.size }))
        .sort((a, b) => b.checklists - a.checklists);

      // Equipos
      const eqMap = {};
      f.checklists.forEach(c => {
        if (!c.equipId) return;
        if (!eqMap[c.equipId]) {
          const eq = equipMap[c.equipId];
          eqMap[c.equipId] = { id: c.equipId, code: eq?.code || c.equipId, name: eq?.name || "", count: 0 };
        }
        eqMap[c.equipId].count++;
      });
      const equipos = Object.values(eqMap).sort((a, b) => b.count - a.count);

      return { ...f, operadores, equipos };
    });
}
