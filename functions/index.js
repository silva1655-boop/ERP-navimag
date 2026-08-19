const functions = require("firebase-functions");
const admin = require("firebase-admin");
const webpush = require("web-push");

admin.initializeApp();
const db = admin.firestore();

// ── VAPID keys ──────────────────────────────────────────────────────────
// Generar con: npx web-push generate-vapid-keys
// Configurar (1st-gen config, funciona con firebase-functions v5):
//   firebase functions:config:set vapid.public="..." vapid.private="..." vapid.email="mailto:admin@navimag.cl" push.secret="..."
// O vía functions/.env (Firebase CLI lo carga solo a process.env, no se commitea):
//   VAPID_PUBLIC=...
//   VAPID_PRIVATE=...
//   VAPID_EMAIL=mailto:admin@navimag.cl
//   PUSH_SECRET=...
const VAPID_PUBLIC  = functions.config().vapid?.public  || process.env.VAPID_PUBLIC;
const VAPID_PRIVATE = functions.config().vapid?.private || process.env.VAPID_PRIVATE;
const VAPID_EMAIL   = functions.config().vapid?.email   || process.env.VAPID_EMAIL || "mailto:admin@navimag.cl";
const PUSH_SECRET   = functions.config().push?.secret   || process.env.PUSH_SECRET;

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC, VAPID_PRIVATE);
} else {
  // No aborta el deploy — pero cualquier intento de sendPush fallará con un
  // error claro en los logs en vez de un crash silencioso al cargar el módulo.
  console.warn("⚠️ VAPID_PUBLIC/VAPID_PRIVATE no configurados — el envío de push va a fallar hasta que se configuren.");
}

// ── Helper: obtener todos los tokens push registrados ──────────────────
// Por ahora los tokens viven todos en la colección de Taller (mantek_v2),
// sin importar desde qué módulo se registraron — ver nota en el README de
// esta carpeta. Los triggers de este archivo solo cubren eventos de Taller;
// Marítimo/Dalka/SGN no disparan push todavía.
async function getAllTokens(coll, roles = null) {
  const snap = await db.collection(coll).doc("pushTokens").get();
  const tokens = snap.exists ? (snap.data().tokens || []) : [];
  if (!roles) return tokens;
  return tokens.filter(t => roles.includes(t.role));
}

// ── Helper: enviar push a una lista de tokens y limpiar los muertos ────
async function sendPush(coll, tokens, payload) {
  if (tokens.length === 0) return;
  const dead = [];
  await Promise.allSettled(
    tokens.map(async t => {
      try {
        await webpush.sendNotification(t.subscription, JSON.stringify(payload));
      } catch (e) {
        // Suscripción vencida/inválida — se limpia abajo.
        if (e.statusCode === 410 || e.statusCode === 404) {
          dead.push(t.id);
        } else {
          console.warn(`sendPush: fallo no fatal para token ${t.id}:`, e.message || e);
        }
      }
    })
  );
  if (dead.length > 0) {
    console.log(`Limpiando ${dead.length} token(s) muerto(s) en ${coll}/pushTokens`);
    try {
      const ref = db.collection(coll).doc("pushTokens");
      await db.runTransaction(async tx => {
        const snap = await tx.get(ref);
        if (!snap.exists) return;
        const current = snap.data().tokens || [];
        const kept = current.filter(t => !dead.includes(t.id));
        if (kept.length !== current.length) {
          tx.set(ref, { tokens: kept, updatedAt: new Date().toISOString() });
        }
      });
    } catch (e) {
      console.error("Error limpiando tokens muertos:", e);
    }
  }
}

// ══════════════════════════════════════════════════════════════════════
// TRIGGER 1 — Checklist con falla crítica
// Se dispara cuando se crea (no al editar) un doc "cl_*" con al menos un
// ítem en estado crítico/malo.
// ══════════════════════════════════════════════════════════════════════
exports.onChecklistCritico = functions
  .region("us-central1")
  .firestore.document("mantek_v2/{docId}")
  .onWrite(async (change, context) => {
    const docId = context.params.docId;
    if (!docId.startsWith("cl_")) return null;
    if (change.before.exists) return null; // solo checklists nuevos

    const data = change.after.exists ? change.after.data()?.data : null;
    if (!data) return null;

    const items = data.items || data.checkItems || [];
    const criticos = items.filter(i =>
      i.estado === "critico" || i.estado === "malo" ||
      i.status === "critico" || i.status === "malo"
    );
    if (criticos.length === 0) return null;

    const payload = {
      title: "🔴 Falla Crítica Detectada",
      body: `${data.equipCode || data.equipId} — ${criticos.length} falla${criticos.length > 1 ? "s" : ""} crítica${criticos.length > 1 ? "s" : ""} · ${data.operatorName || "Operador"}`,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: `checklist-critico-${docId}`,
      requireInteraction: true,
      data: { url: "/", page: "requests", type: "checklist_critico", checklistId: docId },
      actions: [
        { action: "ver", title: "Ver solicitud" },
        { action: "cerrar", title: "Cerrar" },
      ],
    };

    const tokens = await getAllTokens("mantek_v2",
      ["supervisor", "admin", "operaciones", "jefe_operaciones", "sup_operaciones"]);
    console.log(`Checklist crítico ${docId}: notificando a ${tokens.length} token(s)`);
    await sendPush("mantek_v2", tokens, payload);
    return null;
  });

// ══════════════════════════════════════════════════════════════════════
// TRIGGER 2 — Equipo marcado fuera de servicio
// ══════════════════════════════════════════════════════════════════════
exports.onEquipoFueraServicio = functions
  .region("us-central1")
  .firestore.document("mantek_v2/equipment")
  .onWrite(async (change) => {
    if (!change.after.exists) return null;

    const before = change.before.exists ? (change.before.data()?.data || []) : [];
    const after = change.after.data()?.data || [];

    const nuevasFallas = after.filter(eq => {
      const prev = before.find(b => b.id === eq.id);
      return eq.status === "falla" && (!prev || prev.status !== "falla");
    });
    if (nuevasFallas.length === 0) return null;

    const tokens = await getAllTokens("mantek_v2");
    for (const eq of nuevasFallas) {
      const payload = {
        title: "🚨 Equipo Fuera de Servicio",
        body: `${eq.code} — ${eq.name || ""} está fuera de servicio`,
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        tag: `equipo-falla-${eq.id}`,
        requireInteraction: true,
        data: { url: "/", page: "equipment", type: "equipo_falla", equipId: eq.id },
        actions: [
          { action: "ver", title: "Ver equipo" },
          { action: "cerrar", title: "Cerrar" },
        ],
      };
      console.log(`Equipo falla ${eq.code}: notificando a ${tokens.length} token(s)`);
      await sendPush("mantek_v2", tokens, payload);
    }
    return null;
  });

// ══════════════════════════════════════════════════════════════════════
// TRIGGER 3 — Nueva solicitud de reparación
// ══════════════════════════════════════════════════════════════════════
exports.onNuevaSolicitud = functions
  .region("us-central1")
  .firestore.document("mantek_v2/{docId}")
  .onWrite(async (change, context) => {
    const docId = context.params.docId;
    if (!docId.startsWith("req_")) return null;
    if (change.before.exists) return null; // solo nuevas

    const data = change.after.data()?.data;
    if (!data) return null;
    if (data.type === "fuera_de_programa") return null;

    const payload = {
      title: "📋 Nueva Solicitud de Reparación",
      body: `${data.equipCode || data.equipId} — ${(data.description || data.title || "").slice(0, 60)}`,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: `solicitud-${docId}`,
      requireInteraction: false,
      data: { url: "/", page: "requests", type: "nueva_solicitud", reqId: docId },
    };

    const tokens = await getAllTokens("mantek_v2", ["supervisor", "admin"]);
    await sendPush("mantek_v2", tokens, payload);
    return null;
  });

// ══════════════════════════════════════════════════════════════════════
// TRIGGER 4 — OT asignada a mecánico
// ══════════════════════════════════════════════════════════════════════
exports.onOTAsignada = functions
  .region("us-central1")
  .firestore.document("mantek_v2/workOrders")
  .onWrite(async (change) => {
    if (!change.after.exists) return null;

    const before = change.before.exists ? (change.before.data()?.data || []) : [];
    const after = change.after.data()?.data || [];

    const recienAsignadas = after.filter(ot => {
      const prev = before.find(b => b.id === ot.id);
      return ot.assignedTo && ot.status !== "completada" && (!prev || prev.assignedTo !== ot.assignedTo);
    });
    if (recienAsignadas.length === 0) return null;

    const allTokens = await getAllTokens("mantek_v2");
    for (const ot of recienAsignadas) {
      const tokenMecanico = allTokens.filter(t => t.userId === ot.assignedTo);
      if (tokenMecanico.length === 0) continue;

      const payload = {
        title: "🔧 OT Asignada",
        body: `${ot.code} — ${(ot.title || ot.description || "").slice(0, 60)}`,
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        tag: `ot-asignada-${ot.id}`,
        data: { url: "/", page: "workorders", type: "ot_asignada", otId: ot.id },
      };
      await sendPush("mantek_v2", tokenMecanico, payload);
    }
    return null;
  });

// ══════════════════════════════════════════════════════════════════════
// ENDPOINT HTTP — Registrar token push
// Lo llama el ERP (registerPushSubscription en App.jsx) cuando el usuario
// acepta notificaciones.
// ══════════════════════════════════════════════════════════════════════
exports.registerPushToken = functions
  .region("us-central1")
  .https.onRequest(async (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }
    if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }

    const { subscription, userId, username, role, device } = req.body || {};
    if (!subscription || !userId) {
      res.status(400).json({ error: "subscription y userId requeridos" });
      return;
    }

    try {
      const ref = db.collection("mantek_v2").doc("pushTokens");
      const snap = await ref.get();
      const tokens = snap.exists ? (snap.data().tokens || []) : [];

      // Un mismo usuario puede tener token de mobile y de PC a la vez —
      // el índice se hace por userId+device, no solo userId, para no
      // pisar la suscripción del otro dispositivo en cada login.
      const dev = device || "unknown";
      const idx = tokens.findIndex(t => t.userId === userId && t.device === dev);
      const tokenData = {
        id: userId + "_" + dev + "_" + Date.now(),
        userId, username, role, device: dev,
        subscription,
        registeredAt: new Date().toISOString(),
      };

      if (idx >= 0) tokens[idx] = tokenData;
      else tokens.push(tokenData);

      await ref.set({ tokens, updatedAt: new Date().toISOString() });
      console.log(`Token registrado: ${username} (${role}) [${dev}]`);
      res.status(200).json({ ok: true });
    } catch (e) {
      console.error("Error registrando token:", e);
      res.status(500).json({ error: e.message });
    }
  });

// ══════════════════════════════════════════════════════════════════════
// ENDPOINT HTTP — Enviar push manual (admin)
// Para testear o mandar alertas manuales. Requiere "secret" == PUSH_SECRET.
// ══════════════════════════════════════════════════════════════════════
exports.sendManualPush = functions
  .region("us-central1")
  .https.onRequest(async (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }
    if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }

    const { title, body, roles, secret } = req.body || {};
    if (!PUSH_SECRET || secret !== PUSH_SECRET) {
      res.status(401).json({ error: "No autorizado" });
      return;
    }

    const tokens = await getAllTokens("mantek_v2", roles || null);
    const payload = {
      title: title || "MANTEK ERP",
      body: body || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: "manual-" + Date.now(),
    };

    await sendPush("mantek_v2", tokens, payload);
    res.status(200).json({ ok: true, sent: tokens.length });
  });
