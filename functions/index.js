"use strict";
const {onDocumentCreated, onDocumentWritten} = require("firebase-functions/v2/firestore");
const {onRequest} = require("firebase-functions/v2/https");
const admin   = require("firebase-admin");
const webpush = require("web-push");

admin.initializeApp();
const db = admin.firestore();

const COLL = "mantek_v2";

// VAPID desde .env
const VAPID_PUBLIC  = process.env.VAPID_PUBLIC;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE;
const VAPID_EMAIL   = process.env.VAPID_EMAIL || "mailto:csilva@navimag.cl";
const PUSH_SECRET   = process.env.PUSH_SECRET;

async function getTokens(roles=null){
  const snap=await db.collection(COLL).doc("pushTokens").get();
  const tokens=snap.exists?(snap.data().tokens||[]):[];
  if(!roles) return tokens;
  return tokens.filter(t=>roles.includes(t.role));
}

async function sendPush(tokens,payload){
  webpush.setVapidDetails(
    process.env.VAPID_EMAIL||'mailto:csilva@navimag.cl',
    process.env.VAPID_PUBLIC,
    process.env.VAPID_PRIVATE
  );
  if(!tokens.length) return;
  const dead=[];
  await Promise.allSettled(tokens.map(async t=>{
    try{ await webpush.sendNotification(t.subscription,JSON.stringify(payload)); }
    catch(e){ if(e.statusCode===410||e.statusCode===404) dead.push(t.id); }
  }));
  if(dead.length){
    const snap=await db.collection(COLL).doc("pushTokens").get();
    if(snap.exists){
      const alive=(snap.data().tokens||[]).filter(t=>!dead.includes(t.id));
      await db.collection(COLL).doc("pushTokens").set({tokens:alive,updatedAt:new Date().toISOString()});
    }
  }
}

// TRIGGER 1 — Checklist crítico
exports.onChecklistCritico = onDocumentCreated(
  {document:`${COLL}/{docId}`, region:"southamerica-west1"},
  async event => {
    if(!event.params.docId.startsWith("cl_")) return;
    const data = event.data?.data()?.data;
    if(!data) return;
    const criticos=(data.items||[]).filter(i=>i.status==="malo"&&i.critical===true);
    if(!criticos.length) return;
    const payload={
      title:"🔴 Falla Crítica Detectada",
      body:`${data.equipCode||data.equipId} — ${criticos.length} falla${criticos.length>1?"s":""} crítica${criticos.length>1?"s":""} · ${data.operatorName||"Operador"}`,
      icon:"/icon-192.png",badge:"/icon-192.png",
      tag:`checklist-critico-${event.params.docId}`,
      requireInteraction:true,
      data:{url:"/",page:"requests",type:"checklist_critico"},
      actions:[{action:"ver",title:"Ver solicitud"},{action:"cerrar",title:"Cerrar"}],
    };
    const tokens=await getTokens(["supervisor","admin","operaciones","jefe_operaciones","sup_operaciones"]);
    await sendPush(tokens,payload);
  }
);

// TRIGGER 2 — Equipo fuera de servicio
exports.onEquipoFueraServicio = onDocumentWritten(
  {document:`${COLL}/equipment`, region:"southamerica-west1"},
  async event => {
    if(!event.data?.after.exists) return;
    const before=event.data.before.exists?(event.data.before.data()?.data||[]):[];
    const after=event.data.after.data()?.data||[];
    const nuevasFallas=after.filter(eq=>{
      const prev=before.find(b=>b.id===eq.id);
      return eq.status==="falla"&&(!prev||prev.status!=="falla");
    });
    if(!nuevasFallas.length) return;
    for(const eq of nuevasFallas){
      const payload={
        title:"🚨 Equipo Fuera de Servicio",
        body:`${eq.code} — ${eq.name||""} está fuera de servicio`,
        icon:"/icon-192.png",badge:"/icon-192.png",
        tag:`equipo-falla-${eq.id}`,requireInteraction:true,
        data:{url:"/",page:"equipment",type:"equipo_falla",equipId:eq.id},
        actions:[{action:"ver",title:"Ver equipo"},{action:"cerrar",title:"Cerrar"}],
      };
      await sendPush(await getTokens(),payload);
    }
  }
);

// TRIGGER 3 — Nueva solicitud
exports.onNuevaSolicitud = onDocumentCreated(
  {document:`${COLL}/{docId}`, region:"southamerica-west1"},
  async event => {
    if(!event.params.docId.startsWith("req_")) return;
    const data=event.data?.data()?.data;
    if(!data||data.type==="fuera_de_programa") return;
    const payload={
      title:"📋 Nueva Solicitud de Reparación",
      body:`${data.equipCode||data.equipId} — ${(data.description||data.title||"").slice(0,60)}`,
      icon:"/icon-192.png",badge:"/icon-192.png",
      tag:`solicitud-${event.params.docId}`,requireInteraction:false,
      data:{url:"/",page:"requests",type:"nueva_solicitud"},
    };
    await sendPush(await getTokens(["supervisor","admin"]),payload);
  }
);

// TRIGGER 4 — OT asignada
exports.onOTAsignada = onDocumentWritten(
  {document:`${COLL}/workOrders`, region:"southamerica-west1"},
  async event => {
    if(!event.data?.after.exists) return;
    const before=event.data.before.exists?(event.data.before.data()?.data||[]):[];
    const after=event.data.after.data()?.data||[];
    const recienAsignadas=after.filter(ot=>{
      const prev=before.find(b=>b.id===ot.id);
      return ot.assignedTo&&ot.status!=="completada"&&(!prev||prev.assignedTo!==ot.assignedTo);
    });
    for(const ot of recienAsignadas){
      const allSnap=await db.collection(COLL).doc("pushTokens").get();
      const tokensMec=(allSnap.exists?(allSnap.data().tokens||[]):[]).filter(t=>t.userId===ot.assignedTo);
      if(!tokensMec.length) continue;
      const payload={
        title:"🔧 OT Asignada",
        body:`${ot.code} — ${(ot.title||ot.description||"").slice(0,60)}`,
        icon:"/icon-192.png",tag:`ot-asignada-${ot.id}`,
        data:{url:"/",page:"workorders",type:"ot_asignada",otId:ot.id},
      };
      await sendPush(tokensMec,payload);
    }
  }
);

// TRIGGER 5 — OT completada (cierre real, no solo guardado)
// Llega a TODOS los tokens (sin filtro de rol) — incluye "data" con lo
// necesario para el modal de preview en App.jsx (usuarios sin acceso a
// workorders ven un preview en vez de navegar a una página vacía para
// ellos).
exports.onOTCompletada = onDocumentWritten(
  {document:`${COLL}/workOrders`, region:"southamerica-west1"},
  async event => {
    if(!event.data?.after.exists) return;
    const before=event.data.before.exists?(event.data.before.data()?.data||[]):[];
    const after=event.data.after.data()?.data||[];
    const recienCompletadas=after.filter(ot=>{
      const prev=before.find(b=>b.id===ot.id);
      return ot.status==="completada"&&(!prev||prev.status!=="completada");
    });
    if(!recienCompletadas.length) return;

    const[equipSnap,usersSnap]=await Promise.all([
      db.collection(COLL).doc("equipment").get(),
      db.collection(COLL).doc("users").get(),
    ]);
    const equipList=equipSnap.exists?(equipSnap.data().data||[]):[];
    const usersList=usersSnap.exists?(usersSnap.data().data||[]):[];
    const tokens=await getTokens();

    for(const ot of recienCompletadas){
      const eq=equipList.find(e=>e.id===ot.equipId);
      const mec=usersList.find(u=>u.id===ot.assignedTo);
      const obs=(ot.observations||"").slice(0,100);
      const payload={
        title:"✅ OT Completada — "+ot.code,
        body:(eq?.code||ot.equipId||"")+(obs?` · "${obs}"`:""),
        icon:"/icon-192.png",badge:"/icon-192.png",
        tag:`ot-completada-${ot.id}`,
        data:{
          url:"/",page:"workorders",type:"ot_completada",
          otId:ot.id,code:ot.code,
          equipCode:eq?.code||"",equipId:ot.equipId,
          observations:obs,mec:mec?.name||"",
        },
      };
      await sendPush(tokens,payload);
    }
  }
);

// HTTP — Registrar token
exports.registerPushToken = onRequest(
  {region:"southamerica-west1",cors:true},
  async(req,res)=>{
    if(req.method!=="POST"){res.status(405).json({error:"Method not allowed"});return;}
    const{subscription,userId,username,role,device}=req.body;
    if(!subscription||!userId){res.status(400).json({error:"Faltan datos"});return;}
    try{
      const ref=db.collection(COLL).doc("pushTokens");
      const snap=await ref.get();
      const tokens=snap.exists?(snap.data().tokens||[]):[];
      const tokenData={id:`${userId}_${device||"web"}`,userId,username,role,device:device||"unknown",subscription,registeredAt:new Date().toISOString()};
      const idx=tokens.findIndex(t=>t.id===tokenData.id);
      if(idx>=0) tokens[idx]=tokenData; else tokens.push(tokenData);
      await ref.set({tokens,updatedAt:new Date().toISOString()});
      res.status(200).json({ok:true});
    }catch(e){res.status(500).json({error:e.message});}
  }
);

// HTTP — Push manual
exports.sendManualPush = onRequest(
  {region:"southamerica-west1",cors:true},
  async(req,res)=>{
    if(req.method!=="POST"){res.status(405).json({error:"Method not allowed"});return;}
    const{title,body,roles,secret}=req.body;
    if(secret!==PUSH_SECRET){res.status(401).json({error:"No autorizado"});return;}
    const tokens=await getTokens(roles||null);
    await sendPush(tokens,{title:title||"MANTEK ERP",body:body||"",icon:"/icon-192.png",badge:"/icon-192.png",tag:`manual-${Date.now()}`});
    res.status(200).json({ok:true,sent:tokens.length});
  }
);
