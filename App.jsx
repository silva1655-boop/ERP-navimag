import { useState, useEffect, useRef } from "react";
import {
  AlertTriangle, CheckCircle, Clock, Wrench, BarChart2, Users, FileText,
  Bell, LogOut, Plus, X, Calendar, Shield, Search, ClipboardList,
  AlertCircle, Check, Edit2, Trash2, TrendingUp, Wifi, WifiOff, Gauge,
  Key, Printer, Filter, Eye, FileDown, Ship, Anchor, Award, MapPin,
  ChevronRight, ChevronDown, Package, Zap, Activity
} from "lucide-react";
import { db, auth } from "./firebase.js";
import { signInWithEmailAndPassword, signOut, onAuthStateChanged, updatePassword, reauthenticateWithCredential, EmailAuthProvider } from "firebase/auth";
import { doc, setDoc, onSnapshot, getDoc, collection } from "firebase/firestore";

// ─── COLECCIÓN ────────────────────────────────────────────────────────────────
const COLL = "mantek_maritime_v1";

// ─── SEED DATA ────────────────────────────────────────────────────────────────
const SEED_VESSELS = [
  { id:"v1", imo:"9042345", name:"MV Puerto Eden",    flag:"CL", type:"Ferry / RoRo",  class_soc:"Bureau Veritas", gt:8765, dwt:2400, built:1995, status:"at_sea",  lastPort:"Puerto Montt",   nextPort:"Puerto Natales", mainEngine:"MAN B&W 8L28/32A", engineHours:42500 },
  { id:"v2", imo:"8711234", name:"MV Evangelistas",   flag:"CL", type:"RoRo Cargo",    class_soc:"Bureau Veritas", gt:6234, dwt:4100, built:1990, status:"in_port", lastPort:"Puerto Montt",   nextPort:"—",              mainEngine:"Wärtsilä 9L32",    engineHours:67800 },
  { id:"v3", imo:"9185421", name:"MV Patagonia",      flag:"CL", type:"Ferry / Pasaje", class_soc:"DNV GL",        gt:4120, dwt:850,  built:2001, status:"in_port", lastPort:"Natales",        nextPort:"Puerto Montt",   mainEngine:"Caterpillar 3612", engineHours:31200 },
];

const SEED_EQUIPMENT = [
  { id:"eq1",  vesselId:"v1", code:"PE-ME-01",  name:"Motor Principal",           category:"Motor Principal",         maker:"MAN B&W",    model:"8L28/32A", serialNo:"MAN-12345", year:1995, status:"operativo",     hours:42500, criticality:"A" },
  { id:"eq2",  vesselId:"v1", code:"PE-DG1-01", name:"Generador Diesel #1",       category:"Motor Auxiliar / Generador", maker:"Wärtsilä", model:"6R22",     serialNo:"WAR-67890", year:1995, status:"operativo",     hours:38200, criticality:"A" },
  { id:"eq3",  vesselId:"v1", code:"PE-DG2-01", name:"Generador Diesel #2",       category:"Motor Auxiliar / Generador", maker:"Wärtsilä", model:"6R22",     serialNo:"WAR-67891", year:1995, status:"mantenimiento", hours:35600, criticality:"A" },
  { id:"eq4",  vesselId:"v1", code:"PE-SG-01",  name:"Sistema de Dirección",      category:"Sistema de Dirección",    maker:"Rolls-Royce",model:"R5/800",   serialNo:"RR-11111",  year:1995, status:"operativo",     hours:42500, criticality:"A" },
  { id:"eq5",  vesselId:"v1", code:"PE-SEP-01", name:"Separador de Sentinas",     category:"Separadores / MARPOL",    maker:"Facet",      model:"MAS-20",   serialNo:"FCT-88888", year:2010, status:"operativo",     hours:18000, criticality:"A" },
  { id:"eq6",  vesselId:"v2", code:"EV-ME-01",  name:"Motor Principal",           category:"Motor Principal",         maker:"Wärtsilä",   model:"9L32",     serialNo:"WAR-99999", year:1990, status:"operativo",     hours:67800, criticality:"A" },
  { id:"eq7",  vesselId:"v2", code:"EV-DG1-01", name:"Generador Diesel #1",       category:"Motor Auxiliar / Generador", maker:"MAN",      model:"D2842LE",  serialNo:"MAN-22222", year:1990, status:"operativo",     hours:58000, criticality:"A" },
  { id:"eq8",  vesselId:"v2", code:"EV-HE-01",  name:"Hélice de Proa (Bow Thr.)", category:"Propulsión / Hélice",     maker:"Rolls-Royce",model:"TT2100",   serialNo:"RR-33333",  year:1990, status:"operativo",     hours:22000, criticality:"B" },
  { id:"eq9",  vesselId:"v3", code:"PT-ME-01",  name:"Motor Principal Patagonia", category:"Motor Principal",         maker:"Caterpillar",model:"3612",     serialNo:"CAT-55555", year:2001, status:"operativo",     hours:31200, criticality:"A" },
  { id:"eq10", vesselId:"v3", code:"PT-DG1-01", name:"Generador Diesel #1",       category:"Motor Auxiliar / Generador", maker:"Caterpillar",model:"C18",   serialNo:"CAT-66666", year:2001, status:"falla",         hours:29800, criticality:"A" },
];

const SEED_CERTIFICATES = [
  { id:"cert1",  vesselId:"v1", type:"Safety Equipment Certificate",         number:"CL-SEC-2024-001",  issueDate:"2024-01-15", expiryDate:"2027-01-14", issuedBy:"Bureau Veritas",  notes:"" },
  { id:"cert2",  vesselId:"v1", type:"IOPP Certificate (MARPOL Annex I)",    number:"CL-IOPP-2024-001", issueDate:"2024-03-10", expiryDate:"2026-06-25", issuedBy:"Armada de Chile", notes:"Renewal survey due Q2 2026" },
  { id:"cert3",  vesselId:"v1", type:"ISM SMC",                              number:"ISM-SMC-2023-001", issueDate:"2023-07-01", expiryDate:"2028-06-30", issuedBy:"Bureau Veritas",  notes:"" },
  { id:"cert4",  vesselId:"v1", type:"Safety Construction Certificate",      number:"CL-SCC-2023-001",  issueDate:"2023-09-01", expiryDate:"2028-08-31", issuedBy:"Bureau Veritas",  notes:"" },
  { id:"cert5",  vesselId:"v1", type:"Load Line Certificate",                number:"CL-LL-2023-001",   issueDate:"2023-09-01", expiryDate:"2028-08-31", issuedBy:"Bureau Veritas",  notes:"" },
  { id:"cert6",  vesselId:"v1", type:"ISPS Ship Security Certificate",       number:"ISPS-2023-001",    issueDate:"2023-07-01", expiryDate:"2028-06-30", issuedBy:"Armada de Chile", notes:"" },
  { id:"cert7",  vesselId:"v2", type:"Class Certificate - Machinery",        number:"BV-MCH-2022-015",  issueDate:"2022-09-01", expiryDate:"2027-08-31", issuedBy:"Bureau Veritas",  notes:"" },
  { id:"cert8",  vesselId:"v2", type:"Safety Construction Certificate",      number:"CL-SCC-2023-002",  issueDate:"2023-01-20", expiryDate:"2026-06-10", issuedBy:"Bureau Veritas",  notes:"Intermediate survey required" },
  { id:"cert9",  vesselId:"v2", type:"IOPP Certificate (MARPOL Annex I)",    number:"CL-IOPP-2023-002", issueDate:"2023-05-01", expiryDate:"2028-04-30", issuedBy:"Armada de Chile", notes:"" },
  { id:"cert10", vesselId:"v2", type:"ISM SMC",                              number:"ISM-SMC-2022-002", issueDate:"2022-09-01", expiryDate:"2027-08-31", issuedBy:"Bureau Veritas",  notes:"" },
  { id:"cert11", vesselId:"v3", type:"Safety Equipment Certificate",         number:"CL-SEC-2025-003",  issueDate:"2025-02-01", expiryDate:"2026-05-20", issuedBy:"DNV GL",          notes:"Annual survey overdue" },
  { id:"cert12", vesselId:"v3", type:"Class Certificate - Hull",             number:"DNV-HLL-2022-003", issueDate:"2022-06-01", expiryDate:"2027-05-31", issuedBy:"DNV GL",          notes:"" },
];

const SEED_WORK_ORDERS = [];
const SEED_PLANS = [];
const SEED_USERS_PROFILE = [
  { uid:"placeholder", name:"Fleet Manager", role:"fleet_manager",  email:"admin@navimag.cl",  avatar:"FM" },
];

// ─── FIREBASE HELPERS ─────────────────────────────────────────────────────────
async function saveData(key, arr) {
  try { await setDoc(doc(db,COLL,key),{data:arr}); } catch(e){ console.error("Save:",e); }
}
async function initIfEmpty(key, seed) {
  try { const s=await getDoc(doc(db,COLL,key)); if(!s.exists()) await setDoc(doc(db,COLL,key),{data:seed}); } catch(e){ console.error("Init:",e); }
}

// ─── UTILS ────────────────────────────────────────────────────────────────────
const fmt    = d => d ? new Date(d).toLocaleDateString("es-CL",{day:"2-digit",month:"2-digit",year:"numeric"}) : "—";
const fmtDT  = d => d ? new Date(d).toLocaleString("es-CL",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}) : "—";
const uid    = () => Math.random().toString(36).slice(2,10);
const nextOTCode = wos => `OT-${new Date().getFullYear()}-${String(wos.length+1).padStart(3,"0")}`;

const certStatus = (expiryDate) => {
  if (!expiryDate) return { s:"unknown", label:"Sin fecha", cls:"text-gray-500 bg-gray-50 border-gray-200", days: null };
  const d = Math.floor((new Date(expiryDate) - new Date()) / 86400000);
  if (d < 0)   return { s:"expired",  label:"Vencido",        cls:"text-red-700   bg-red-50    border-red-200",    days:d };
  if (d <= 30) return { s:"critical", label:`${d}d restantes`, cls:"text-red-700   bg-red-50    border-red-200",    days:d };
  if (d <= 90) return { s:"expiring", label:`${d}d restantes`, cls:"text-amber-700 bg-amber-50  border-amber-200",  days:d };
  const months = Math.floor(d/30); const rem = d%30;
  return { s:"valid", label:`${months>0?months+"m ":""}${rem}d`, cls:"text-emerald-700 bg-emerald-50 border-emerald-200", days:d };
};

const VESSEL_STATUS = {
  at_sea:  { label:"En ruta",   cls:"text-blue-700   bg-blue-50   border-blue-200"   },
  in_port: { label:"En puerto", cls:"text-emerald-700 bg-emerald-50 border-emerald-200" },
  drydock: { label:"Dique seco",cls:"text-amber-700   bg-amber-50  border-amber-200"  },
  laid_up: { label:"Fondeado",  cls:"text-gray-600   bg-gray-100  border-gray-300"   },
};
const EQUIP_STATUS = {
  operativo:     { label:"Operativo",     cls:"text-emerald-700 bg-emerald-50 border-emerald-200" },
  mantenimiento: { label:"Mantenimiento", cls:"text-amber-700   bg-amber-50  border-amber-200"  },
  falla:         { label:"Falla",         cls:"text-red-700     bg-red-50    border-red-200"    },
};
const CRIT_CLS={A:"text-red-700 bg-red-50 border-red-200",B:"text-amber-700 bg-amber-50 border-amber-200",C:"text-emerald-700 bg-emerald-50 border-emerald-200"};
const WO_STATUS = {
  pendiente:  { label:"Pendiente",  cls:"text-gray-600    bg-gray-100   border-gray-300"   },
  asignada:   { label:"Asignada",   cls:"text-blue-700    bg-blue-50    border-blue-200"   },
  en_proceso: { label:"En Proceso", cls:"text-amber-700   bg-amber-50   border-amber-200"  },
  completada: { label:"Completada", cls:"text-emerald-700 bg-emerald-50 border-emerald-200"},
};

const EQUIP_CATEGORIES = [
  "Motor Principal","Motor Auxiliar / Generador","Sistema de Dirección",
  "Bombas / Sistema de Lastre","Equipos de Navegación","Equipos de Seguridad",
  "Maquinaria de Cubierta","HVAC / Climatización","Sistema Eléctrico",
  "Casco / Estructura","Propulsión / Hélice","Separadores / MARPOL",
  "Equipos de Carga","Sistemas de Fondeo","Otro",
];

const CERT_TYPES = [
  "Safety Equipment Certificate","Safety Radio Certificate",
  "Safety Construction Certificate","Load Line Certificate",
  "Tonnage Certificate","IOPP Certificate (MARPOL Annex I)",
  "IAPP Certificate (MARPOL Annex VI)","ISM SMC",
  "ISM DOC (compañía)","ISPS Ship Security Certificate",
  "Class Certificate - Hull","Class Certificate - Machinery",
  "Class Certificate - Electrical","Anti-fouling System Certificate",
  "CLC Certificate","CSR (Continuous Synopsis Record)","Otro",
];

const FLAG_NAMES = { CL:"Chile",PA:"Panamá",BS:"Bahamas",MH:"Islas Marshall",LR:"Liberia",MT:"Malta",CY:"Chipre",NL:"Países Bajos" };

// ─── COLORS ───────────────────────────────────────────────────────────────────
const NV = { navy:"#0A2342", blue:"#1565C0", teal:"#00695C", cyan:"#0288D1", navyMid:"#1A3A5C", light:"#E3F2FD" };

// ─── CSS CLASSES ─────────────────────────────────────────────────────────────
const card  = "bg-white border border-gray-200 rounded-xl shadow-sm";
const iCls  = "w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 text-sm focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100";
const sCls  = "w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 text-sm focus:outline-none focus:border-blue-400";
const btnPrimary    = "flex items-center gap-2 text-white font-semibold px-4 py-2 rounded-lg text-sm transition shadow-sm hover:opacity-90";
const btnSecondary  = "flex items-center gap-2 font-semibold px-4 py-2 rounded-lg text-sm transition shadow-sm hover:opacity-90 border";

// ─── UI PRIMITIVES ────────────────────────────────────────────────────────────
const Badge = ({s, label, cfg}) => {
  const c = cfg?.[s] || {label:s, cls:"text-gray-600 bg-gray-100 border-gray-300"};
  return <span className={`inline-flex px-2 py-0.5 rounded-full border text-xs font-semibold ${c.cls}`}>{label||c.label}</span>;
};

function StatCard({icon:Icon,label,value,sub,color="navy"}){
  const m={navy:"border-blue-200 bg-blue-50 text-blue-800",blue:"border-blue-200 bg-blue-50 text-blue-700",red:"border-red-200 bg-red-50 text-red-600",amber:"border-amber-200 bg-amber-50 text-amber-700",emerald:"border-emerald-200 bg-emerald-50 text-emerald-700",cyan:"border-cyan-200 bg-cyan-50 text-cyan-700"};
  return(
    <div className={`${card} p-5 flex items-center gap-4`}>
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 border ${m[color]||m.navy}`}><Icon size={20}/></div>
      <div><p className="text-gray-500 text-xs font-medium mb-0.5">{label}</p><p className="text-gray-900 font-bold text-2xl leading-none">{value}</p>{sub&&<p className="text-gray-400 text-xs mt-1">{sub}</p>}</div>
    </div>
  );
}

function Modal({title,onClose,children,wide=false}){
  return(
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className={`bg-white border border-gray-200 rounded-2xl shadow-xl p-6 w-full max-h-[90vh] overflow-y-auto ${wide?"max-w-2xl":"max-w-lg"}`}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-gray-900 font-bold text-base">{title}</h3>
          <button onClick={onClose}><X size={18} className="text-gray-400 hover:text-gray-700"/></button>
        </div>
        {children}
      </div>
    </div>
  );
}
function ModalActions({onSave,onCancel,label="Guardar"}){
  return(
    <div className="flex gap-2 mt-5">
      <button onClick={onSave} style={{background:NV.blue}} className="flex-1 text-white font-semibold py-2.5 rounded-lg text-sm transition hover:opacity-90">{label}</button>
      <button onClick={onCancel} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-2.5 rounded-lg text-sm transition">Cancelar</button>
    </div>
  );
}

// ─── CHANGE PASSWORD ─────────────────────────────────────────────────────────
function ChangePasswordModal({onClose}){
  const [old,setOld]=useState(""); const [nw,setNw]=useState(""); const [cf,setCf]=useState(""); const [err,setErr]=useState(""); const [ok,setOk]=useState(false);
  const handle=async()=>{
    if(!old||!nw||!cf){setErr("Completa todos los campos");return;}
    if(nw!==cf){setErr("Las contraseñas no coinciden");return;}
    if(nw.length<6){setErr("Mínimo 6 caracteres");return;}
    try{
      const u=auth.currentUser;
      const cred=EmailAuthProvider.credential(u.email,old);
      await reauthenticateWithCredential(u,cred);
      await updatePassword(u,nw);
      setOk(true);
    }catch(e){setErr("Contraseña actual incorrecta");}
  };
  return(
    <Modal title="Cambiar Contraseña" onClose={onClose}>
      {ok?<div className="text-emerald-600 text-center py-4 font-medium">✅ Contraseña actualizada</div>:<>
      {err&&<div className="bg-red-50 border border-red-200 text-red-700 text-xs p-3 rounded-lg mb-4">{err}</div>}
      <div className="space-y-3">
        {[["Contraseña actual",old,setOld],["Nueva contraseña",nw,setNw],["Confirmar nueva",cf,setCf]].map(([l,v,s])=>(
          <div key={l}><label className="text-gray-500 text-xs font-medium mb-1 block">{l.toUpperCase()}</label><input type="password" value={v} onChange={e=>s(e.target.value)} className={iCls}/></div>
        ))}
      </div>
      <ModalActions onSave={handle} onCancel={onClose} label="Cambiar Contraseña"/></>}
    </Modal>
  );
}

// ─── LOGIN PAGE ───────────────────────────────────────────────────────────────
function LoginPage(){
  const [email,setEmail]=useState(""); const [pass,setPass]=useState(""); const [err,setErr]=useState(""); const [show,setShow]=useState(false); const [loading,setLoading]=useState(false);
  const handle=async()=>{
    if(!email||!pass)return;
    setLoading(true); setErr("");
    try{ await signInWithEmailAndPassword(auth,email.trim(),pass); }
    catch(e){
      if(e.code==="auth/wrong-password"||e.code==="auth/invalid-credential") setErr("Contraseña incorrecta");
      else if(e.code==="auth/user-not-found") setErr("Usuario no encontrado");
      else setErr("Error al iniciar sesión");
    }
    setLoading(false);
  };
  return(
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden"
      style={{background:`linear-gradient(160deg, ${NV.navy} 0%, ${NV.navyMid} 40%, ${NV.blue} 70%, ${NV.cyan} 100%)`}}>
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <svg viewBox="0 0 1440 320" className="absolute bottom-0 w-full opacity-15" preserveAspectRatio="none">
          <path fill="white" d="M0,192L60,202.7C120,213,240,235,360,224C480,213,600,171,720,165.3C840,160,960,192,1080,197.3C1200,203,1320,181,1380,170.7L1440,160L1440,320L0,320Z"/>
        </svg>
        <svg viewBox="0 0 1440 320" className="absolute bottom-0 w-full opacity-8" preserveAspectRatio="none">
          <path fill="white" d="M0,256L80,240C160,224,320,192,480,192C640,192,800,224,960,218.7C1120,213,1280,171,1360,149.3L1440,128L1440,320L0,320Z"/>
        </svg>
        {/* Ship silhouette */}
        <svg viewBox="0 0 900 250" className="absolute bottom-6 right-0 w-[500px] opacity-10">
          <path fill="white" d="M50,190 L120,170 L120,110 L160,110 L160,70 L200,70 L200,110 L420,110 L440,110 L440,80 L490,80 L490,110 L750,140 L820,190 Z"/>
          <rect x="160" y="30" width="22" height="80" fill="white"/>
          <rect x="442" y="20" width="22" height="90" fill="white"/>
          <rect x="530" y="50" width="18" height="60" fill="white"/>
          <path fill="white" d="M182,30 L182,50 L230,50 L230,30Z"/>
          <path fill="white" d="M464,20 L464,45 L520,45 L520,20Z"/>
        </svg>
      </div>
      <div className="w-full max-w-sm relative z-10">
        <div className="text-center mb-8">
          <div className="inline-flex flex-col items-center gap-2">
            <div className="w-16 h-16 bg-white/15 backdrop-blur-sm rounded-2xl flex items-center justify-center border border-white/30 shadow-xl">
              <Ship size={32} className="text-white"/>
            </div>
            <div>
              <p className="text-white font-bold text-2xl tracking-wide">MANTEK Maritime</p>
              <p className="text-blue-200 text-xs tracking-widest font-medium">GESTIÓN DE MANTENIMIENTO NAVAL</p>
            </div>
          </div>
        </div>
        <div className="bg-white/95 backdrop-blur-sm rounded-2xl p-8 shadow-2xl border border-white/50">
          <p className="font-bold mb-6 text-sm" style={{color:NV.navy}}>Iniciar Sesión</p>
          {err&&<div className="bg-red-50 border border-red-200 text-red-700 text-xs p-3 rounded-lg mb-4">{err}</div>}
          <div className="space-y-4">
            <div>
              <label className="text-gray-500 text-xs font-medium mb-1 block">CORREO</label>
              <input value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handle()} className={iCls} placeholder="usuario@empresa.cl"/>
            </div>
            <div>
              <label className="text-gray-500 text-xs font-medium mb-1 block">CONTRASEÑA</label>
              <div className="relative">
                <input type={show?"text":"password"} value={pass} onChange={e=>setPass(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handle()} className={`${iCls} pr-16`} placeholder="••••••"/>
                <button type="button" onClick={()=>setShow(s=>!s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs font-medium">{show?"Ocultar":"Mostrar"}</button>
              </div>
            </div>
            <button onClick={handle} disabled={loading} style={{background:`linear-gradient(90deg, ${NV.navy}, ${NV.blue})`}} className="w-full text-white font-bold py-3 rounded-xl text-sm transition shadow-md hover:opacity-90 mt-2 disabled:opacity-60">
              {loading?"Iniciando...":"INGRESAR"}
            </button>
          </div>
          <div className="flex items-center gap-2 mt-6 pt-4 border-t border-gray-100">
            <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0" style={{background:NV.blue}}>
              <Anchor size={12} className="text-white"/>
            </div>
            <p className="text-gray-400 text-xs">Sistema de Gestión de Mantenimiento Naval</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── SIDEBAR ─────────────────────────────────────────────────────────────────
const ROLE_CFG = {
  fleet_manager: { label:"Fleet Manager", icon:Ship,    nav:["dashboard","fleet","equipment","workorders","certificates","plans","reports","users"] },
  vessel_chief:  { label:"Chief Engineer",icon:Wrench,  nav:["dashboard","fleet","equipment","workorders","certificates","plans","reports"] },
  mechanic:      { label:"Mecánico",      icon:Wrench,  nav:["dashboard","workorders","plans"] },
  admin:         { label:"Admin",         icon:Shield,  nav:["dashboard","fleet","equipment","workorders","certificates","plans","reports","users"] },
};
const NAV_ITEMS = {
  dashboard:    { label:"Dashboard",         icon:BarChart2 },
  fleet:        { label:"Flota / Buques",    icon:Ship },
  equipment:    { label:"Equipos",           icon:Package },
  workorders:   { label:"Órdenes de Trabajo",icon:ClipboardList },
  certificates: { label:"Certificados",      icon:Award },
  plans:        { label:"Plan Preventivo",   icon:Calendar },
  reports:      { label:"Informes KPI",      icon:TrendingUp },
  users:        { label:"Usuarios",          icon:Users },
};

function Sidebar({profile,active,onNav,onLogout,onChangePwd,certAlerts,online}){
  const cfg=ROLE_CFG[profile?.role]||ROLE_CFG.mechanic; const Icon=cfg.icon;
  return(
    <div className="w-56 flex flex-col h-screen sticky top-0 flex-shrink-0 shadow-xl" style={{background:NV.navy}}>
      <div className="p-4 border-b border-white/10">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-white/15 rounded-lg flex items-center justify-center flex-shrink-0 border border-white/20">
            <Ship size={15} className="text-white"/>
          </div>
          <div>
            <p className="text-white font-bold text-sm">MANTEK Maritime</p>
            <div className="flex items-center gap-1">
              {online?<><Wifi size={9} className="text-emerald-400"/><p className="text-emerald-400 text-xs">En línea</p></>:<><WifiOff size={9} className="text-red-400"/><p className="text-red-400 text-xs">Sin conexión</p></>}
            </div>
          </div>
        </div>
      </div>
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {cfg.nav.map(key=>{
          const item=NAV_ITEMS[key]; if(!item)return null;
          const ItemIcon=item.icon; const isActive=active===key;
          const badge=key==="certificates"&&certAlerts>0;
          return(
            <button key={key} onClick={()=>onNav(key)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all ${isActive?"text-white font-semibold":"text-blue-200 hover:text-white hover:bg-white/10"}`}
              style={isActive?{background:`${NV.blue}cc`}:{}}>
              <ItemIcon size={15}/><span className="flex-1 text-left">{item.label}</span>
              {badge&&<span className="bg-amber-400 text-black text-xs font-bold w-4 h-4 rounded-full flex items-center justify-center">{certAlerts}</span>}
            </button>
          );
        })}
      </nav>
      <div className="p-3 border-t border-white/10">
        <div className="flex items-center gap-2 px-2 py-2 mb-2">
          <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-xs font-bold text-white">{profile?.avatar||"?"}</div>
          <div className="min-w-0">
            <p className="text-white text-xs font-semibold truncate">{profile?.name||profile?.email}</p>
            <p className={`text-xs text-blue-300 flex items-center gap-1`}><Icon size={10}/>{cfg.label}</p>
          </div>
        </div>
        <button onClick={onChangePwd} className="w-full flex items-center gap-2 px-3 py-2 text-blue-300 hover:text-white text-sm rounded-lg hover:bg-white/10 transition-all">
          <Key size={14}/><span>Cambiar Contraseña</span>
        </button>
        <button onClick={onLogout} className="w-full flex items-center gap-2 px-3 py-2 text-blue-300 hover:text-red-400 text-sm rounded-lg hover:bg-red-400/10 transition-all">
          <LogOut size={14}/><span>Cerrar Sesión</span>
        </button>
      </div>
    </div>
  );
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
function Dashboard({data,onNav}){
  const {vessels,equipment,workorders,certificates} = data;
  const today = new Date();
  const certsExpiring90 = certificates.filter(c=>{ const d=certStatus(c.expiryDate); return d.s==="critical"||d.s==="expiring"; });
  const certsCritical   = certificates.filter(c=>{ const d=certStatus(c.expiryDate); return d.s==="critical"||d.s==="expired"; });
  const equipFalla      = equipment.filter(e=>e.status==="falla");
  const woActive        = workorders.filter(w=>w.status!=="completada"&&w.status!=="cancelada");
  return(
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-gray-900 font-bold text-xl">Dashboard de Flota</h1>
        <p className="text-gray-500 text-sm">{vessels.length} buque{vessels.length!==1?"s":""} registrados · {new Date().toLocaleDateString("es-CL",{weekday:"long",year:"numeric",month:"long",day:"numeric"})}</p>
      </div>

      {/* Alert banner: certificates */}
      {certsCritical.length>0&&(
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2"><AlertTriangle size={16} className="text-red-600"/><span className="text-red-700 font-semibold text-sm">{certsCritical.length} certificado{certsCritical.length!==1?"s":""} vencido{certsCritical.length!==1?"s":""} o por vencer en menos de 30 días</span></div>
          <div className="flex flex-wrap gap-2">
            {certsCritical.slice(0,4).map(c=>{
              const v=vessels.find(v=>v.id===c.vesselId);
              return <span key={c.id} className="text-xs bg-white border border-red-200 text-red-700 px-2 py-1 rounded-lg">{v?.name} — {c.type}</span>;
            })}
            {certsCritical.length>4&&<span className="text-xs text-red-500">+{certsCritical.length-4} más</span>}
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Ship}          label="Buques en Flota"     value={vessels.length}        sub={`${vessels.filter(v=>v.status==="at_sea").length} en ruta`}         color="navy"/>
        <StatCard icon={AlertTriangle} label="Equipos en Falla"    value={equipFalla.length}     sub="requieren atención"                                                  color="red"/>
        <StatCard icon={Award}         label="Certs. Por Vencer"   value={certsExpiring90.length} sub="en los próximos 90 días"                                            color="amber"/>
        <StatCard icon={ClipboardList} label="OT Activas"          value={woActive.length}       sub="órdenes de trabajo"                                                  color="blue"/>
      </div>

      {/* Fleet status cards */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-sm" style={{color:NV.navy}}>Estado de la Flota</h2>
          <button onClick={()=>onNav("fleet")} className="text-xs hover:underline flex items-center gap-1" style={{color:NV.blue}}>Ver flota<ChevronRight size={12}/></button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {vessels.map(v=>{
            const vs=VESSEL_STATUS[v.status]||VESSEL_STATUS.in_port;
            const vEquip=equipment.filter(e=>e.vesselId===v.id);
            const vCerts=certificates.filter(c=>c.vesselId===v.id);
            const critCerts=vCerts.filter(c=>{const d=certStatus(c.expiryDate);return d.s==="critical"||d.s==="expired";});
            const fallas=vEquip.filter(e=>e.status==="falla");
            return(
              <div key={v.id} className={`${card} p-4`}>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-bold text-sm text-gray-900">{v.name}</p>
                    <p className="text-gray-400 text-xs mt-0.5">IMO {v.imo} · {v.type}</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold ${vs.cls}`}>{vs.label}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-gray-50 rounded-lg p-2">
                    <p className="text-gray-400">Bandera</p>
                    <p className="font-semibold text-gray-700">{FLAG_NAMES[v.flag]||v.flag}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-2">
                    <p className="text-gray-400">Clase</p>
                    <p className="font-semibold text-gray-700 truncate">{v.class_soc}</p>
                  </div>
                  <div className={`rounded-lg p-2 ${fallas.length>0?"bg-red-50":"bg-gray-50"}`}>
                    <p className={fallas.length>0?"text-red-500":"text-gray-400"}>Equipos falla</p>
                    <p className={`font-bold ${fallas.length>0?"text-red-600":"text-gray-700"}`}>{fallas.length}</p>
                  </div>
                  <div className={`rounded-lg p-2 ${critCerts.length>0?"bg-amber-50":"bg-gray-50"}`}>
                    <p className={critCerts.length>0?"text-amber-600":"text-gray-400"}>Certs. alertas</p>
                    <p className={`font-bold ${critCerts.length>0?"text-amber-700":"text-gray-700"}`}>{critCerts.length}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Recent WO */}
      {workorders.length>0&&(
        <div className={`${card} p-5`}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-sm" style={{color:NV.navy}}>Órdenes de Trabajo Recientes</h2>
            <button onClick={()=>onNav("workorders")} className="text-xs hover:underline flex items-center gap-1" style={{color:NV.blue}}>Ver todas<ChevronRight size={12}/></button>
          </div>
          {workorders.slice(-5).reverse().map(w=>{
            const eq=equipment.find(e=>e.id===w.equipId);
            const v=vessels.find(v=>v.id===w.vesselId);
            const st=WO_STATUS[w.status]||WO_STATUS.pendiente;
            return(
              <div key={w.id} className="flex items-center gap-3 py-2 border-b border-gray-100 last:border-0">
                <span className={`inline-flex px-2 py-0.5 rounded-full border text-xs font-semibold ${st.cls}`}>{st.label}</span>
                <span className="text-gray-700 text-xs flex-1 truncate">{w.title}</span>
                <span className="text-gray-400 text-xs">{v?.name||""}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── FLEET / VESSELS ─────────────────────────────────────────────────────────
const EMPTY_VESSEL = { imo:"", name:"", flag:"CL", type:"Ferry / RoRo", class_soc:"Bureau Veritas", gt:"", dwt:"", built:"", status:"in_port", lastPort:"", nextPort:"", mainEngine:"", engineHours:"" };

function Fleet({data,setData}){
  const {vessels,equipment,certificates,workorders} = data;
  const [showForm,setShowForm]=useState(false);
  const [form,setForm]=useState(EMPTY_VESSEL);
  const [editTarget,setEditTarget]=useState(null);
  const [confirmDel,setConfirmDel]=useState(null);
  const [expanded,setExpanded]=useState(null);

  const save=()=>{
    if(!form.name||!form.imo)return;
    const obj={...form, gt:parseInt(form.gt)||0, dwt:parseInt(form.dwt)||0, built:parseInt(form.built)||0, engineHours:parseInt(form.engineHours)||0};
    const updated=editTarget?vessels.map(v=>v.id===editTarget.id?{...v,...obj}:v):[...vessels,{id:uid(),...obj}];
    setData(d=>({...d,vessels:updated})); saveData("vessels",updated); setShowForm(false);
  };
  const del=id=>{
    const updated=vessels.filter(v=>v.id!==id);
    setData(d=>({...d,vessels:updated})); saveData("vessels",updated); setConfirmDel(null);
  };
  const openEdit=v=>{setForm({...v,gt:String(v.gt),dwt:String(v.dwt),built:String(v.built),engineHours:String(v.engineHours)});setEditTarget(v);setShowForm(true);};

  return(
    <div className="p-6">
      <div className="flex items-center justify-between mb-5">
        <div><h1 className="text-gray-900 font-bold text-xl">Flota de Buques</h1><p className="text-gray-500 text-sm">{vessels.length} buques registrados</p></div>
        <button onClick={()=>{setForm(EMPTY_VESSEL);setEditTarget(null);setShowForm(true);}} style={{background:NV.blue}} className={btnPrimary}><Plus size={15}/>Nuevo Buque</button>
      </div>

      <div className="space-y-3">
        {vessels.map(v=>{
          const vs=VESSEL_STATUS[v.status]||VESSEL_STATUS.in_port;
          const vEquip=equipment.filter(e=>e.vesselId===v.id);
          const vCerts=certificates.filter(c=>c.vesselId===v.id);
          const vWO=workorders.filter(w=>w.vesselId===v.id&&w.status!=="completada");
          const critCerts=vCerts.filter(c=>{const d=certStatus(c.expiryDate);return d.s==="critical"||d.s==="expired";});
          const isExp=expanded===v.id;
          return(
            <div key={v.id} className={`${card} overflow-hidden`}>
              {/* Header row */}
              <div className="p-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-white font-bold text-xs" style={{background:NV.navy}}>
                  <Ship size={18}/>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    <p className="font-bold text-gray-900 text-sm">{v.name}</p>
                    <span className="text-gray-400 text-xs font-mono">IMO {v.imo}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold ${vs.cls}`}>{vs.label}</span>
                    {critCerts.length>0&&<span className="text-xs px-2 py-0.5 rounded-full border font-semibold text-amber-700 bg-amber-50 border-amber-200">⚠ {critCerts.length} cert.</span>}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-400 flex-wrap">
                    <span>{v.type}</span><span>·</span><span>{FLAG_NAMES[v.flag]||v.flag}</span><span>·</span><span>{v.class_soc}</span><span>·</span><span>GT {v.gt?.toLocaleString()}</span>
                    {v.status==="at_sea"&&v.nextPort&&<><span>·</span><span className="flex items-center gap-1"><MapPin size={10}/>{v.nextPort}</span></>}
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0 text-xs text-gray-500">
                  <span className="flex items-center gap-1"><Package size={11}/>{vEquip.length} equipos</span>
                  <span className="flex items-center gap-1"><Award size={11}/>{vCerts.length} certs.</span>
                  <span className="flex items-center gap-1"><ClipboardList size={11}/>{vWO.length} OT</span>
                  <div className="flex gap-1">
                    <button onClick={()=>openEdit(v)} className="p-1.5 rounded-lg hover:bg-blue-50" style={{color:NV.blue}}><Edit2 size={13}/></button>
                    <button onClick={()=>setConfirmDel(v)} className="p-1.5 rounded-lg text-red-500 hover:bg-red-50"><Trash2 size={13}/></button>
                    <button onClick={()=>setExpanded(isExp?null:v.id)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
                      <ChevronDown size={14} className={`transition-transform ${isExp?"rotate-180":""}`}/>
                    </button>
                  </div>
                </div>
              </div>

              {/* Expanded detail */}
              {isExp&&(
                <div className="border-t border-gray-100 px-4 py-3 bg-gray-50/50">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs mb-3">
                    {[["Año construcción",v.built],["Motor principal",v.mainEngine],["Horas de motor",`${(v.engineHours||0).toLocaleString()} h`],["DWT",`${(v.dwt||0).toLocaleString()} t`],["Último puerto",v.lastPort||"—"],["Próximo puerto",v.nextPort||"—"]].map(([k,val])=>(
                      <div key={k} className="bg-white rounded-lg p-2.5 border border-gray-100">
                        <p className="text-gray-400 mb-0.5">{k}</p>
                        <p className="font-semibold text-gray-700">{val||"—"}</p>
                      </div>
                    ))}
                  </div>
                  {/* Cert summary for this vessel */}
                  {vCerts.length>0&&(
                    <div>
                      <p className="text-gray-400 text-xs font-medium mb-2">Certificados con alerta:</p>
                      <div className="flex flex-wrap gap-2">
                        {vCerts.filter(c=>{const d=certStatus(c.expiryDate);return d.s!=="valid";}).map(c=>{
                          const cs=certStatus(c.expiryDate);
                          return <span key={c.id} className={`text-xs px-2 py-0.5 rounded-full border font-semibold ${cs.cls}`}>{c.type.slice(0,30)}{c.type.length>30?"...":""} — {cs.label}</span>;
                        })}
                        {vCerts.filter(c=>{const d=certStatus(c.expiryDate);return d.s!=="valid";}).length===0&&<span className="text-xs text-emerald-600">✅ Todos los certificados vigentes</span>}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {vessels.length===0&&<div className="text-center py-16 text-gray-400"><Ship size={40} className="mx-auto mb-3 text-gray-300"/><p>Sin buques registrados</p></div>}
      </div>

      {showForm&&(
        <Modal title={editTarget?"Editar Buque":"Nuevo Buque"} onClose={()=>setShowForm(false)} wide>
          <div className="grid grid-cols-2 gap-3">
            {[["name","NOMBRE"],["imo","IMO NUMBER"],["mainEngine","MOTOR PRINCIPAL"]].map(([k,l])=>(
              <div key={k} className={k==="mainEngine"?"col-span-2":""}><label className="text-gray-500 text-xs font-medium mb-1 block">{l}</label><input value={form[k]} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))} className={iCls}/></div>
            ))}
            <div><label className="text-gray-500 text-xs font-medium mb-1 block">TIPO</label>
              <select value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))} className={sCls}>
                {["Ferry / RoRo","Ferry / Pasajeros","RoRo Cargo","Bulk Carrier","Contenedor","Tanker","Offshore","Remolcador","Barcaza","Otro"].map(t=><option key={t}>{t}</option>)}
              </select></div>
            <div><label className="text-gray-500 text-xs font-medium mb-1 block">BANDERA</label>
              <select value={form.flag} onChange={e=>setForm(f=>({...f,flag:e.target.value}))} className={sCls}>
                {Object.entries(FLAG_NAMES).map(([k,v])=><option key={k} value={k}>{v} ({k})</option>)}
              </select></div>
            <div><label className="text-gray-500 text-xs font-medium mb-1 block">SOCIEDAD CLASIFICADORA</label>
              <select value={form.class_soc} onChange={e=>setForm(f=>({...f,class_soc:e.target.value}))} className={sCls}>
                {["Bureau Veritas","DNV GL","Lloyd's Register","ABS","ClassNK","RINA","Korean Register","Otra"].map(s=><option key={s}>{s}</option>)}
              </select></div>
            <div><label className="text-gray-500 text-xs font-medium mb-1 block">ESTADO</label>
              <select value={form.status} onChange={e=>setForm(f=>({...f,status:e.target.value}))} className={sCls}>
                {Object.entries(VESSEL_STATUS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
              </select></div>
            {[["gt","GT (Tonelaje Bruto)"],["dwt","DWT (Porte Bruto)"],["built","AÑO CONSTRUCCIÓN"],["engineHours","HORAS MOTOR PRINCIPAL"],["lastPort","ÚLTIMO PUERTO"],["nextPort","PRÓXIMO PUERTO"]].map(([k,l])=>(
              <div key={k}><label className="text-gray-500 text-xs font-medium mb-1 block">{l}</label><input value={form[k]} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))} className={iCls}/></div>
            ))}
          </div>
          <ModalActions onSave={save} onCancel={()=>setShowForm(false)} label={editTarget?"Guardar Cambios":"Crear Buque"}/>
        </Modal>
      )}
      {confirmDel&&(
        <div className="fixed inset-0 bg-black/25 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-gray-200 rounded-2xl shadow-xl p-6 w-full max-w-sm">
            <p className="font-bold text-gray-900 mb-2">Eliminar {confirmDel.name}</p>
            <p className="text-gray-500 text-sm mb-5">Esta acción no se puede deshacer. Los equipos y certificados del buque también serán eliminados.</p>
            <div className="flex gap-2">
              <button onClick={()=>del(confirmDel.id)} className="flex-1 bg-red-600 hover:bg-red-500 text-white font-semibold py-2.5 rounded-lg text-sm">Eliminar</button>
              <button onClick={()=>setConfirmDel(null)} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-2.5 rounded-lg text-sm">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── EQUIPMENT ───────────────────────────────────────────────────────────────
const EMPTY_EQ = { vesselId:"", code:"", name:"", category:"Motor Principal", maker:"", model:"", serialNo:"", year:"", status:"operativo", hours:"", criticality:"A" };

function Equipment({data,setData}){
  const {vessels,equipment} = data;
  const [search,setSearch]=useState(""); const [fltVessel,setFltVessel]=useState("");
  const [showForm,setShowForm]=useState(false); const [form,setForm]=useState(EMPTY_EQ); const [editTarget,setEditTarget]=useState(null);
  const [editingHours,setEditingHours]=useState(null); const [confirmDel,setConfirmDel]=useState(null);

  const visible=equipment.filter(e=>{
    if(fltVessel&&e.vesselId!==fltVessel)return false;
    if(search&&!e.name.toLowerCase().includes(search.toLowerCase())&&!e.code.toLowerCase().includes(search.toLowerCase()))return false;
    return true;
  });

  const grouped=vessels.map(v=>({vessel:v,items:visible.filter(e=>e.vesselId===v.id)})).filter(g=>g.items.length>0||(!fltVessel&&!search));

  const save=()=>{
    if(!form.vesselId||!form.name)return;
    const obj={...form,year:parseInt(form.year)||0,hours:parseInt(form.hours)||0};
    const updated=editTarget?equipment.map(e=>e.id===editTarget.id?{...e,...obj}:e):[...equipment,{id:uid(),...obj}];
    setData(d=>({...d,equipment:updated}));saveData("equipment",updated);setShowForm(false);
  };
  const saveHours=()=>{
    if(!editingHours)return;
    const updated=equipment.map(e=>e.id===editingHours.id?{...e,hours:parseInt(editingHours.val)||0}:e);
    setData(d=>({...d,equipment:updated}));saveData("equipment",updated);setEditingHours(null);
  };
  const del=id=>{const u=equipment.filter(e=>e.id!==id);setData(d=>({...d,equipment:u}));saveData("equipment",u);setConfirmDel(null);};

  return(
    <div className="p-6">
      <div className="flex items-center justify-between mb-5">
        <div><h1 className="text-gray-900 font-bold text-xl">Equipos</h1><p className="text-gray-500 text-sm">{equipment.length} equipos registrados</p></div>
        <button onClick={()=>{setForm(EMPTY_EQ);setEditTarget(null);setShowForm(true);}} style={{background:NV.blue}} className={btnPrimary}><Plus size={15}/>Nuevo Equipo</button>
      </div>

      <div className="flex gap-2 mb-5 flex-wrap">
        <div className="relative flex-1 min-w-40">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar equipo..." className={`${iCls} pl-9`}/>
        </div>
        <select value={fltVessel} onChange={e=>setFltVessel(e.target.value)} className="bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-700 text-sm focus:outline-none focus:border-blue-400">
          <option value="">Todos los buques</option>
          {vessels.map(v=><option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
        {(search||fltVessel)&&<button onClick={()=>{setSearch("");setFltVessel("");}} className="flex items-center gap-1 text-xs text-red-500 border border-red-200 bg-red-50 px-2.5 py-1.5 rounded-lg"><X size={11}/>Limpiar</button>}
      </div>

      <div className="space-y-5">
        {grouped.filter(g=>g.items.length>0).map(({vessel,items})=>(
          <div key={vessel.id}>
            <div className="flex items-center gap-2 mb-2">
              <Ship size={14} style={{color:NV.blue}}/>
              <h2 className="font-bold text-sm" style={{color:NV.navy}}>{vessel.name}</h2>
              <span className="text-gray-400 text-xs">({items.length} equipos)</span>
            </div>
            <div className={`${card} overflow-hidden`}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-white font-semibold uppercase tracking-wider" style={{background:NV.navyMid}}>
                    <th className="text-left px-4 py-2.5">Código</th>
                    <th className="text-left px-4 py-2.5">Nombre / Categoría</th>
                    <th className="text-left px-4 py-2.5 hidden md:table-cell">Fabricante / Modelo</th>
                    <th className="text-left px-4 py-2.5">Criticidad</th>
                    <th className="text-left px-4 py-2.5">Estado</th>
                    <th className="text-left px-4 py-2.5"><span className="flex items-center gap-1"><Gauge size={11}/>Horas</span></th>
                    <th className="px-4 py-2.5 text-center">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((e,i)=>{
                    const es=EQUIP_STATUS[e.status]||EQUIP_STATUS.operativo;
                    const isEditH=editingHours?.id===e.id;
                    return(
                      <tr key={e.id} className={`border-b border-gray-100 last:border-0 hover:bg-blue-50/30 transition ${i%2===0?"bg-white":"bg-gray-50/40"}`}>
                        <td className="px-4 py-2.5"><span className="font-mono font-bold text-xs" style={{color:NV.blue}}>{e.code}</span></td>
                        <td className="px-4 py-2.5">
                          <p className="font-semibold text-gray-800 text-sm">{e.name}</p>
                          <p className="text-gray-400 text-xs">{e.category}</p>
                        </td>
                        <td className="px-4 py-2.5 hidden md:table-cell">
                          <p className="text-gray-700 text-xs">{e.maker} {e.model}</p>
                          {e.serialNo&&<p className="text-gray-400 text-xs">S/N: {e.serialNo}</p>}
                        </td>
                        <td className="px-4 py-2.5"><span className={`px-2 py-0.5 rounded-full border text-xs font-bold ${CRIT_CLS[e.criticality]}`}>{e.criticality}</span></td>
                        <td className="px-4 py-2.5"><span className={`inline-flex px-2 py-0.5 rounded-full border text-xs font-semibold ${es.cls}`}>{es.label}</span></td>
                        <td className="px-4 py-2.5">
                          {isEditH?(
                            <div className="flex items-center gap-1">
                              <input type="number" value={editingHours.val} onChange={ev=>setEditingHours(h=>({...h,val:ev.target.value}))}
                                onKeyDown={ev=>{if(ev.key==="Enter")saveHours();if(ev.key==="Escape")setEditingHours(null);}}
                                className="w-24 border border-blue-400 rounded-lg px-2 py-1 text-xs focus:outline-none" autoFocus/>
                              <button onClick={saveHours} className="w-6 h-6 rounded-full flex items-center justify-center" style={{background:NV.blue}}><Check size={11} className="text-white"/></button>
                              <button onClick={()=>setEditingHours(null)} className="w-6 h-6 bg-gray-200 rounded-full flex items-center justify-center"><X size={11} className="text-gray-600"/></button>
                            </div>
                          ):(
                            <div className="flex items-center gap-1 group">
                              <span className="text-gray-700 font-mono text-sm font-semibold">{(e.hours||0).toLocaleString()}<span className="text-gray-400 text-xs ml-0.5">h</span></span>
                              <button onClick={()=>setEditingHours({id:e.id,val:String(e.hours||0)})} className="opacity-0 group-hover:opacity-100 transition p-1 rounded hover:bg-blue-50"><Edit2 size={11} style={{color:NV.blue}}/></button>
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={()=>{setForm({...e,year:String(e.year),hours:String(e.hours)});setEditTarget(e);setShowForm(true);}} className="p-1.5 rounded-lg hover:bg-blue-50" style={{color:NV.blue}}><Edit2 size={13}/></button>
                            <button onClick={()=>setConfirmDel(e)} className="p-1.5 rounded-lg text-red-500 hover:bg-red-50"><Trash2 size={13}/></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))}
        {visible.length===0&&<div className="text-center py-12 text-gray-400"><Package size={36} className="mx-auto mb-3 text-gray-300"/><p>Sin equipos encontrados</p></div>}
      </div>

      {showForm&&(
        <Modal title={editTarget?"Editar Equipo":"Nuevo Equipo"} onClose={()=>setShowForm(false)} wide>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><label className="text-gray-500 text-xs font-medium mb-1 block">BUQUE</label>
              <select value={form.vesselId} onChange={e=>setForm(f=>({...f,vesselId:e.target.value}))} className={sCls}>
                <option value="">Seleccionar buque...</option>
                {vessels.map(v=><option key={v.id} value={v.id}>{v.name}</option>)}
              </select></div>
            {[["code","CÓDIGO"],["name","NOMBRE"]].map(([k,l])=>(
              <div key={k}><label className="text-gray-500 text-xs font-medium mb-1 block">{l}</label><input value={form[k]} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))} className={iCls}/></div>
            ))}
            <div className="col-span-2"><label className="text-gray-500 text-xs font-medium mb-1 block">CATEGORÍA</label>
              <select value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))} className={sCls}>
                {EQUIP_CATEGORIES.map(c=><option key={c}>{c}</option>)}
              </select></div>
            {[["maker","FABRICANTE"],["model","MODELO"],["serialNo","N° SERIE"],["year","AÑO"],["hours","HORAS"]].map(([k,l])=>(
              <div key={k}><label className="text-gray-500 text-xs font-medium mb-1 block">{l}</label><input value={form[k]} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))} className={iCls}/></div>
            ))}
            <div><label className="text-gray-500 text-xs font-medium mb-1 block">CRITICIDAD</label>
              <select value={form.criticality} onChange={e=>setForm(f=>({...f,criticality:e.target.value}))} className={sCls}>
                <option value="A">A — Crítico</option><option value="B">B — Importante</option><option value="C">C — Rutinario</option>
              </select></div>
            <div><label className="text-gray-500 text-xs font-medium mb-1 block">ESTADO</label>
              <select value={form.status} onChange={e=>setForm(f=>({...f,status:e.target.value}))} className={sCls}>
                {Object.entries(EQUIP_STATUS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
              </select></div>
          </div>
          <ModalActions onSave={save} onCancel={()=>setShowForm(false)} label={editTarget?"Guardar Cambios":"Crear Equipo"}/>
        </Modal>
      )}
      {confirmDel&&(
        <div className="fixed inset-0 bg-black/25 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-gray-200 rounded-2xl shadow-xl p-6 w-full max-w-sm">
            <p className="font-bold text-gray-900 mb-2">Eliminar {confirmDel.name}</p>
            <p className="text-gray-500 text-sm mb-5">Esta acción no se puede deshacer.</p>
            <div className="flex gap-2">
              <button onClick={()=>del(confirmDel.id)} className="flex-1 bg-red-600 hover:bg-red-500 text-white font-semibold py-2.5 rounded-lg text-sm">Eliminar</button>
              <button onClick={()=>setConfirmDel(null)} className="flex-1 bg-gray-100 text-gray-700 py-2.5 rounded-lg text-sm">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── CERTIFICATES ─────────────────────────────────────────────────────────────
const EMPTY_CERT = { vesselId:"", type:"Safety Equipment Certificate", number:"", issueDate:"", expiryDate:"", issuedBy:"Bureau Veritas", notes:"" };

function Certificates({data,setData}){
  const {vessels,certificates} = data;
  const [fltVessel,setFltVessel]=useState(""); const [fltStatus,setFltStatus]=useState("");
  const [showForm,setShowForm]=useState(false); const [form,setForm]=useState(EMPTY_CERT); const [editTarget,setEditTarget]=useState(null);
  const [confirmDel,setConfirmDel]=useState(null);

  const visible=certificates.filter(c=>{
    if(fltVessel&&c.vesselId!==fltVessel)return false;
    if(fltStatus){const s=certStatus(c.expiryDate).s;if(s!==fltStatus)return false;}
    return true;
  }).sort((a,b)=>(certStatus(a.expiryDate).days||999)-(certStatus(b.expiryDate).days||999));

  const total=certificates.length;
  const expired  =certificates.filter(c=>certStatus(c.expiryDate).s==="expired").length;
  const critical =certificates.filter(c=>certStatus(c.expiryDate).s==="critical").length;
  const expiring =certificates.filter(c=>certStatus(c.expiryDate).s==="expiring").length;
  const valid    =certificates.filter(c=>certStatus(c.expiryDate).s==="valid").length;

  const save=()=>{
    if(!form.vesselId||!form.type||!form.expiryDate)return;
    const updated=editTarget?certificates.map(c=>c.id===editTarget.id?{...c,...form}:c):[...certificates,{id:uid(),...form}];
    setData(d=>({...d,certificates:updated}));saveData("certificates",updated);setShowForm(false);
  };
  const del=id=>{const u=certificates.filter(c=>c.id!==id);setData(d=>({...d,certificates:u}));saveData("certificates",u);setConfirmDel(null);};

  const downloadCSV=()=>{
    const rows=visible.map(c=>{
      const v=vessels.find(v=>v.id===c.vesselId);
      const cs=certStatus(c.expiryDate);
      return{"Buque":v?.name||"—","Certificado":c.type,"Número":c.number,"Emitido por":c.issuedBy,"Fecha emisión":c.issueDate,"Fecha vencimiento":c.expiryDate,"Días restantes":cs.days??""," Estado":cs.s};
    });
    if(!rows.length)return;
    const h=Object.keys(rows[0]);
    const lines=[h.join(","),...rows.map(r=>h.map(k=>`"${(r[k]??"")}"`).join(","))];
    const blob=new Blob([lines.join("\n")],{type:"text/csv;charset=utf-8;"});
    const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`certificados_${new Date().toISOString().slice(0,10)}.csv`;a.click();
  };

  return(
    <div className="p-6">
      <div className="flex items-center justify-between mb-5">
        <div><h1 className="text-gray-900 font-bold text-xl">Certificados</h1><p className="text-gray-500 text-sm">{total} certificados registrados</p></div>
        <div className="flex gap-2">
          {visible.length>0&&<button onClick={downloadCSV} className={btnSecondary} style={{borderColor:NV.blue,color:NV.blue,background:"white"}}><FileDown size={14}/>Exportar</button>}
          <button onClick={()=>{setForm(EMPTY_CERT);setEditTarget(null);setShowForm(true);}} style={{background:NV.blue}} className={btnPrimary}><Plus size={15}/>Nuevo Certificado</button>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        {[["Vencidos",expired,"text-red-700 bg-red-50 border-red-200","expired"],["Críticos (≤30d)",critical,"text-red-700 bg-red-50 border-red-200","critical"],["Por vencer (≤90d)",expiring,"text-amber-700 bg-amber-50 border-amber-200","expiring"],["Vigentes",valid,"text-emerald-700 bg-emerald-50 border-emerald-200","valid"]].map(([l,n,cls,s])=>(
          <button key={s} onClick={()=>setFltStatus(fltStatus===s?"":s)}
            className={`${card} p-4 text-center cursor-pointer hover:shadow-md transition ${fltStatus===s?"ring-2 ring-blue-400":""}`}>
            <p className={`text-2xl font-bold ${cls.split(" ")[0]}`}>{n}</p>
            <p className="text-gray-500 text-xs mt-1">{l}</p>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-4 flex-wrap items-center">
        <Filter size={14} className="text-gray-400 flex-shrink-0"/>
        <select value={fltVessel} onChange={e=>setFltVessel(e.target.value)} className="bg-white border border-gray-300 rounded-lg px-3 py-1.5 text-gray-700 text-xs focus:outline-none focus:border-blue-400">
          <option value="">Todos los buques</option>
          {vessels.map(v=><option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
        {(fltVessel||fltStatus)&&<button onClick={()=>{setFltVessel("");setFltStatus("");}} className="flex items-center gap-1 text-xs text-red-500 border border-red-200 bg-red-50 px-2.5 py-1.5 rounded-lg"><X size={11}/>Limpiar</button>}
      </div>

      {/* Certificate list */}
      <div className={`${card} overflow-hidden`}>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-white font-semibold uppercase tracking-wider" style={{background:NV.navyMid}}>
              <th className="text-left px-4 py-2.5">Buque</th>
              <th className="text-left px-4 py-2.5">Certificado</th>
              <th className="text-left px-4 py-2.5 hidden md:table-cell">Número / Emitido por</th>
              <th className="text-left px-4 py-2.5">Vencimiento</th>
              <th className="text-left px-4 py-2.5">Estado</th>
              <th className="px-4 py-2.5 text-center">Acción</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((c,i)=>{
              const v=vessels.find(v=>v.id===c.vesselId);
              const cs=certStatus(c.expiryDate);
              return(
                <tr key={c.id} className={`border-b border-gray-100 last:border-0 hover:bg-blue-50/30 transition ${i%2===0?"bg-white":"bg-gray-50/40"}`}>
                  <td className="px-4 py-3">
                    <p className="text-gray-800 font-semibold text-xs">{v?.name||"—"}</p>
                    <p className="text-gray-400 text-xs">IMO {v?.imo}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-gray-800 font-medium text-xs">{c.type}</p>
                    {c.notes&&<p className="text-gray-400 text-xs mt-0.5 truncate max-w-xs">{c.notes}</p>}
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <p className="text-gray-700 font-mono text-xs">{c.number||"—"}</p>
                    <p className="text-gray-400 text-xs">{c.issuedBy}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-gray-700 text-xs font-semibold">{fmt(c.expiryDate)}</p>
                    <p className="text-gray-400 text-xs">Emitido: {fmt(c.issueDate)}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full border text-xs font-bold ${cs.cls}`}>{cs.label}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={()=>{setForm({...c});setEditTarget(c);setShowForm(true);}} className="p-1.5 rounded-lg hover:bg-blue-50" style={{color:NV.blue}}><Edit2 size={13}/></button>
                      <button onClick={()=>setConfirmDel(c)} className="p-1.5 rounded-lg text-red-500 hover:bg-red-50"><Trash2 size={13}/></button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {visible.length===0&&<tr><td colSpan={6} className="text-center py-12 text-gray-400 text-sm">Sin certificados para los filtros seleccionados</td></tr>}
          </tbody>
        </table>
      </div>

      {showForm&&(
        <Modal title={editTarget?"Editar Certificado":"Nuevo Certificado"} onClose={()=>setShowForm(false)} wide>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><label className="text-gray-500 text-xs font-medium mb-1 block">BUQUE</label>
              <select value={form.vesselId} onChange={e=>setForm(f=>({...f,vesselId:e.target.value}))} className={sCls}>
                <option value="">Seleccionar buque...</option>
                {vessels.map(v=><option key={v.id} value={v.id}>{v.name} — IMO {v.imo}</option>)}
              </select></div>
            <div className="col-span-2"><label className="text-gray-500 text-xs font-medium mb-1 block">TIPO DE CERTIFICADO</label>
              <select value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))} className={sCls}>
                {CERT_TYPES.map(t=><option key={t}>{t}</option>)}
              </select></div>
            <div><label className="text-gray-500 text-xs font-medium mb-1 block">NÚMERO DE CERTIFICADO</label><input value={form.number} onChange={e=>setForm(f=>({...f,number:e.target.value}))} className={iCls} placeholder="ej: CL-SEC-2024-001"/></div>
            <div><label className="text-gray-500 text-xs font-medium mb-1 block">EMITIDO POR</label>
              <select value={form.issuedBy} onChange={e=>setForm(f=>({...f,issuedBy:e.target.value}))} className={sCls}>
                {["Bureau Veritas","DNV GL","Lloyd's Register","ABS","ClassNK","RINA","Armada de Chile","Flag State Administration","Otra"].map(s=><option key={s}>{s}</option>)}
              </select></div>
            <div><label className="text-gray-500 text-xs font-medium mb-1 block">FECHA DE EMISIÓN</label><input type="date" value={form.issueDate} onChange={e=>setForm(f=>({...f,issueDate:e.target.value}))} className={iCls}/></div>
            <div><label className="text-gray-500 text-xs font-medium mb-1 block">FECHA DE VENCIMIENTO *</label><input type="date" value={form.expiryDate} onChange={e=>setForm(f=>({...f,expiryDate:e.target.value}))} className={iCls}/></div>
            <div className="col-span-2"><label className="text-gray-500 text-xs font-medium mb-1 block">NOTAS / OBSERVACIONES</label><textarea value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} rows={2} className={`${iCls} resize-none`} placeholder="Surveys pendientes, condiciones especiales..."/></div>
          </div>
          <ModalActions onSave={save} onCancel={()=>setShowForm(false)} label={editTarget?"Guardar Cambios":"Registrar Certificado"}/>
        </Modal>
      )}
      {confirmDel&&(
        <div className="fixed inset-0 bg-black/25 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-gray-200 rounded-2xl shadow-xl p-6 w-full max-w-sm">
            <p className="font-bold text-gray-900 mb-2">Eliminar certificado</p>
            <p className="text-gray-500 text-sm mb-1">{confirmDel.type}</p>
            <p className="text-gray-400 text-xs mb-5">{vessels.find(v=>v.id===confirmDel.vesselId)?.name}</p>
            <div className="flex gap-2">
              <button onClick={()=>del(confirmDel.id)} className="flex-1 bg-red-600 hover:bg-red-500 text-white font-semibold py-2.5 rounded-lg text-sm">Eliminar</button>
              <button onClick={()=>setConfirmDel(null)} className="flex-1 bg-gray-100 text-gray-700 py-2.5 rounded-lg text-sm">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── WORK ORDERS ─────────────────────────────────────────────────────────────
function WorkOrders({data,setData}){
  const {vessels,equipment,workorders,users} = data;
  const [search,setSearch]=useState(""); const [fltStatus,setFltStatus]=useState(""); const [fltVessel,setFltVessel]=useState("");
  const [sel,setSel]=useState(null); const [showNew,setShowNew]=useState(false);
  const [form,setForm]=useState({vesselId:"",equipId:"",title:"",type:"correctivo",priority:"media",description:"",scheduledDate:new Date().toISOString().slice(0,10),estimatedHours:"",assignedTo:""});
  const [repForm,setRepForm]=useState({actualHours:"",observations:"",status:"completada"}); const [showRep,setShowRep]=useState(false);

  const visible=workorders.filter(w=>{
    if(fltStatus&&w.status!==fltStatus)return false;
    if(fltVessel&&w.vesselId!==fltVessel)return false;
    if(search&&!w.title.toLowerCase().includes(search.toLowerCase())&&!w.code.toLowerCase().includes(search.toLowerCase()))return false;
    return true;
  });

  const saveNew=()=>{
    if(!form.vesselId||!form.title)return;
    const wo={id:uid(),code:nextOTCode(workorders),...form,estimatedHours:parseFloat(form.estimatedHours)||0,status:"asignada",createdAt:new Date().toISOString(),actualHours:null,observations:""};
    const updated=[...workorders,wo];setData(d=>({...d,workorders:updated}));saveData("workorders",updated);setShowNew(false);setSel(wo);
  };
  const updStatus=(id,s)=>{const u=workorders.map(w=>w.id===id?{...w,status:s}:w);setData(d=>({...d,workorders:u}));saveData("workorders",u);if(sel?.id===id)setSel(w=>({...w,status:s}));};
  const submitRep=()=>{
    if(!repForm.actualHours)return;
    const u=workorders.map(w=>w.id===sel.id?{...w,...repForm,actualHours:parseFloat(repForm.actualHours)}:w);
    setData(d=>({...d,workorders:u}));saveData("workorders",u);setSel(w=>({...w,...repForm,actualHours:parseFloat(repForm.actualHours)}));setShowRep(false);
  };

  const cur=sel?workorders.find(w=>w.id===sel.id):null;
  const curEq=cur?equipment.find(e=>e.id===cur.equipId):null;
  const curV=cur?vessels.find(v=>v.id===cur.vesselId):null;

  return(
    <div className="p-6 flex gap-5 h-full">
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-5">
          <div><h1 className="text-gray-900 font-bold text-xl">Órdenes de Trabajo</h1><p className="text-gray-500 text-sm">{visible.length} registros</p></div>
          <button onClick={()=>setShowNew(true)} style={{background:NV.blue}} className={btnPrimary}><Plus size={15}/>Nueva OT</button>
        </div>
        <div className="flex gap-2 mb-4 flex-wrap">
          <div className="relative flex-1 min-w-40"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar OT..." className={`${iCls} pl-9`}/></div>
          <select value={fltStatus} onChange={e=>setFltStatus(e.target.value)} className="bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-700 text-xs focus:outline-none">
            <option value="">Estado: Todos</option>
            {Object.entries(WO_STATUS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
          </select>
          <select value={fltVessel} onChange={e=>setFltVessel(e.target.value)} className="bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-700 text-xs focus:outline-none">
            <option value="">Buque: Todos</option>
            {vessels.map(v=><option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
          {(search||fltStatus||fltVessel)&&<button onClick={()=>{setSearch("");setFltStatus("");setFltVessel("");}} className="flex items-center gap-1 text-xs text-red-500 border border-red-200 bg-red-50 px-2.5 py-1.5 rounded-lg"><X size={11}/>Limpiar</button>}
        </div>
        <div className="space-y-2">
          {visible.map(w=>{
            const v=vessels.find(v2=>v2.id===w.vesselId); const eq=equipment.find(e=>e.id===w.equipId);
            const st=WO_STATUS[w.status]||WO_STATUS.pendiente;
            return(
              <div key={w.id} onClick={()=>setSel(w)}
                className={`bg-white border rounded-xl p-4 cursor-pointer transition-all ${sel?.id===w.id?"shadow-sm":"border-gray-200 hover:border-blue-300 hover:shadow-sm"}`}
                style={sel?.id===w.id?{borderColor:NV.blue,background:"#EBF4FF"}:{}}>
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-xs font-mono font-bold" style={{color:NV.blue}}>{w.code}</span>
                      <span className={`inline-flex px-2 py-0.5 rounded-full border text-xs font-semibold ${w.type==="preventivo"?"text-blue-700 bg-blue-50 border-blue-200":"text-orange-700 bg-orange-50 border-orange-200"}`}>{w.type}</span>
                      <span className={`inline-flex px-2 py-0.5 rounded-full border text-xs font-semibold ${st.cls}`}>{st.label}</span>
                    </div>
                    <p className="text-gray-800 text-sm font-semibold truncate">{w.title}</p>
                    <div className="flex items-center gap-3 mt-1 flex-wrap text-xs text-gray-400">
                      {v&&<span className="flex items-center gap-1"><Ship size={10}/>{v.name}</span>}
                      {eq&&<span className="flex items-center gap-1"><Package size={10}/>{eq.code}</span>}
                      <span className="flex items-center gap-1"><Calendar size={10}/>{fmt(w.scheduledDate)}</span>
                    </div>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full border text-xs font-bold flex-shrink-0 ${w.priority==="alta"?"text-red-700 bg-red-50 border-red-200":w.priority==="media"?"text-amber-700 bg-amber-50 border-amber-200":"text-emerald-700 bg-emerald-50 border-emerald-200"}`}>{(w.priority||"").toUpperCase()}</span>
                </div>
              </div>
            );
          })}
          {visible.length===0&&<div className="text-center py-12 text-gray-400 text-sm">Sin órdenes de trabajo</div>}
        </div>
      </div>
      {cur&&(
        <div className={`w-72 flex-shrink-0 ${card} p-5 h-fit sticky top-6`}>
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-mono font-bold" style={{color:NV.blue}}>{cur.code}</span>
            <button onClick={()=>setSel(null)}><X size={16} className="text-gray-400 hover:text-gray-700"/></button>
          </div>
          <h3 className="text-gray-900 font-semibold text-sm mb-3">{cur.title}</h3>
          <div className="flex flex-wrap gap-1.5 mb-4">
            <span className={`inline-flex px-2 py-0.5 rounded-full border text-xs font-semibold ${(WO_STATUS[cur.status]||WO_STATUS.pendiente).cls}`}>{(WO_STATUS[cur.status]||WO_STATUS.pendiente).label}</span>
            <span className={`px-2 py-0.5 rounded-full border text-xs font-bold ${cur.priority==="alta"?"text-red-700 bg-red-50 border-red-200":cur.priority==="media"?"text-amber-700 bg-amber-50 border-amber-200":"text-emerald-700 bg-emerald-50 border-emerald-200"}`}>{(cur.priority||"").toUpperCase()}</span>
          </div>
          <div className="space-y-1.5 mb-4 text-xs">
            {[["Buque",curV?.name||"—"],["Equipo",curEq?.name||"—"],["Tipo",cur.type],["Programado",fmt(cur.scheduledDate)],["Horas Est.",`${cur.estimatedHours}h`]].map(([k,v])=>(
              <div key={k} className="flex justify-between gap-2"><span className="text-gray-400">{k}</span><span className="text-gray-700 text-right">{v}</span></div>
            ))}
            {cur.actualHours&&<div className="flex justify-between"><span className="text-gray-400">Horas Reales</span><span className="text-emerald-600 font-semibold">{cur.actualHours}h</span></div>}
          </div>
          {cur.description&&<div className="bg-gray-50 border border-gray-100 rounded-lg p-3 mb-3 text-gray-600 text-xs">{cur.description}</div>}
          {cur.observations&&<div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3 mb-3 text-xs"><span className="text-emerald-700 font-semibold">Obs: </span>{cur.observations}</div>}
          <div className="space-y-2 mt-4">
            {cur.status!=="completada"&&cur.status!=="cancelada"&&(
              <>
                {cur.status==="asignada"&&<button onClick={()=>updStatus(cur.id,"en_proceso")} className="w-full text-sm py-2 rounded-lg border font-medium transition" style={{background:NV.light,borderColor:NV.blue,color:NV.blue}}>Iniciar Trabajo</button>}
                <button onClick={()=>setShowRep(true)} className="w-full text-white text-sm py-2 rounded-lg font-medium transition hover:opacity-90" style={{background:NV.blue}}>Reportar Trabajo</button>
              </>
            )}
          </div>
        </div>
      )}
      {showNew&&(
        <Modal title="Nueva Orden de Trabajo" onClose={()=>setShowNew(false)} wide>
          <div className="space-y-3">
            <div><label className="text-gray-500 text-xs font-medium mb-1 block">BUQUE</label>
              <select value={form.vesselId} onChange={e=>setForm(f=>({...f,vesselId:e.target.value,equipId:""}))} className={sCls}>
                <option value="">Seleccionar...</option>{vessels.map(v=><option key={v.id} value={v.id}>{v.name}</option>)}
              </select></div>
            {form.vesselId&&<div><label className="text-gray-500 text-xs font-medium mb-1 block">EQUIPO</label>
              <select value={form.equipId} onChange={e=>setForm(f=>({...f,equipId:e.target.value}))} className={sCls}>
                <option value="">Seleccionar...</option>{equipment.filter(e=>e.vesselId===form.vesselId).map(e=><option key={e.id} value={e.id}>{e.code} — {e.name}</option>)}
              </select></div>}
            <div><label className="text-gray-500 text-xs font-medium mb-1 block">TÍTULO *</label><input value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} className={iCls} placeholder="Descripción breve del trabajo"/></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-gray-500 text-xs font-medium mb-1 block">TIPO</label>
                <select value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))} className={sCls}><option value="preventivo">Preventivo</option><option value="correctivo">Correctivo</option></select></div>
              <div><label className="text-gray-500 text-xs font-medium mb-1 block">PRIORIDAD</label>
                <select value={form.priority} onChange={e=>setForm(f=>({...f,priority:e.target.value}))} className={sCls}><option value="alta">Alta</option><option value="media">Media</option><option value="baja">Baja</option></select></div>
              <div><label className="text-gray-500 text-xs font-medium mb-1 block">FECHA PROGRAMADA</label><input type="date" value={form.scheduledDate} onChange={e=>setForm(f=>({...f,scheduledDate:e.target.value}))} className={iCls}/></div>
              <div><label className="text-gray-500 text-xs font-medium mb-1 block">HORAS ESTIMADAS</label><input type="number" value={form.estimatedHours} onChange={e=>setForm(f=>({...f,estimatedHours:e.target.value}))} className={iCls}/></div>
            </div>
            <div><label className="text-gray-500 text-xs font-medium mb-1 block">DESCRIPCIÓN</label><textarea value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} rows={3} className={`${iCls} resize-none`}/></div>
          </div>
          <ModalActions onSave={saveNew} onCancel={()=>setShowNew(false)} label="Crear OT"/>
        </Modal>
      )}
      {showRep&&(
        <Modal title={`Reportar — ${cur?.code}`} onClose={()=>setShowRep(false)}>
          <div className="space-y-3">
            <div><label className="text-gray-500 text-xs font-medium mb-1 block">HORAS REALES *</label><input type="number" step="0.5" value={repForm.actualHours} onChange={e=>setRepForm(r=>({...r,actualHours:e.target.value}))} className={iCls} placeholder="ej: 3.5"/></div>
            <div><label className="text-gray-500 text-xs font-medium mb-1 block">OBSERVACIONES</label><textarea value={repForm.observations} onChange={e=>setRepForm(r=>({...r,observations:e.target.value}))} rows={3} className={`${iCls} resize-none`}/></div>
            <div><label className="text-gray-500 text-xs font-medium mb-1 block">ESTADO FINAL</label>
              <select value={repForm.status} onChange={e=>setRepForm(r=>({...r,status:e.target.value}))} className={sCls}><option value="completada">Completada</option><option value="en_proceso">En Proceso (parcial)</option></select></div>
          </div>
          <ModalActions onSave={submitRep} onCancel={()=>setShowRep(false)} label="Enviar Reporte"/>
        </Modal>
      )}
    </div>
  );
}

// ─── PLANS (PMS) ─────────────────────────────────────────────────────────────
function Plans({data,setData}){
  const {vessels,equipment,plans,workorders} = data;
  const [showForm,setShowForm]=useState(false);
  const [form,setForm]=useState({vesselId:"",equipId:"",name:"",frequency:"",lastHorometro:"",estimatedHours:"",tasks:""});

  const addPlan=()=>{
    if(!form.vesselId||!form.equipId||!form.name||!form.frequency)return;
    const lastH=parseFloat(form.lastHorometro)||0;
    const freq=parseInt(form.frequency)||0;
    const np={id:uid(),...form,frequency:freq,lastHorometro:lastH,horometroTarget:lastH+freq,estimatedHours:parseFloat(form.estimatedHours)||0,tasks:form.tasks.split("\n").filter(Boolean)};
    const updated=[...plans,np];setData(d=>({...d,plans:updated}));saveData("plans",updated);setShowForm(false);
  };
  const generateOT=(plan)=>{
    const eq=equipment.find(e=>e.id===plan.equipId);
    const v=vessels.find(v=>v.id===plan.vesselId);
    if(!eq||!v)return;
    const wo={id:uid(),code:nextOTCode(workorders),type:"preventivo",vesselId:plan.vesselId,equipId:plan.equipId,planId:plan.id,title:plan.name,priority:eq.criticality==="A"?"alta":eq.criticality==="B"?"media":"baja",status:"asignada",createdAt:new Date().toISOString(),scheduledDate:new Date().toISOString().slice(0,10),estimatedHours:plan.estimatedHours||0,actualHours:null,description:`PMS: ${Array.isArray(plan.tasks)?plan.tasks.join(", "):plan.tasks}`,observations:""};
    const updated=[...workorders,wo];setData(d=>({...d,workorders:updated}));saveData("workorders",updated);
    alert(`✅ OT ${wo.code} generada para ${v.name} — ${eq.name}`);
  };
  const delPlan=(id)=>{const u=plans.filter(p=>p.id!==id);setData(d=>({...d,plans:u}));saveData("plans",u);};

  const byVessel=vessels.map(v=>({vessel:v,plans:plans.filter(p=>p.vesselId===v.id)})).filter(g=>g.plans.length>0);

  return(
    <div className="p-6">
      <div className="flex items-center justify-between mb-5">
        <div><h1 className="text-gray-900 font-bold text-xl">Plan de Mantenimiento Preventivo</h1><p className="text-gray-500 text-sm">PMS — Programación por horómetro / horas de motor</p></div>
        <button onClick={()=>setShowForm(true)} style={{background:NV.blue}} className={btnPrimary}><Plus size={15}/>Nuevo Plan</button>
      </div>
      {plans.length===0&&<div className="text-center py-16 text-gray-400"><Calendar size={40} className="mx-auto mb-3 text-gray-300"/><p className="font-medium">Sin planes de mantenimiento preventivo</p><p className="text-sm mt-1">Crea planes basados en horas de operación para cada equipo</p></div>}
      <div className="space-y-6">
        {byVessel.map(({vessel,plans:vplans})=>(
          <div key={vessel.id}>
            <div className="flex items-center gap-2 mb-3">
              <Ship size={14} style={{color:NV.blue}}/><h2 className="font-bold text-sm" style={{color:NV.navy}}>{vessel.name}</h2>
              <span className="text-gray-400 text-xs">({vplans.length} planes)</span>
            </div>
            <div className="space-y-3">
              {vplans.map(p=>{
                const eq=equipment.find(e=>e.id===p.equipId);
                const curH=eq?.hours||0;
                const hoursLeft=p.horometroTarget-curH;
                const overdue=curH>=p.horometroTarget;
                const soon=!overdue&&hoursLeft<=(p.frequency||500)*0.15;
                const range=p.horometroTarget-p.lastHorometro;
                const pct=range>0?Math.min(100,Math.max(0,((curH-p.lastHorometro)/range)*100)):100;
                return(
                  <div key={p.id} className={`${card} p-4`}>
                    <div className="flex items-start gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                          {overdue&&<span className="px-2 py-0.5 rounded-full border text-xs font-bold text-red-700 bg-red-50 border-red-200">VENCIDO</span>}
                          {soon&&!overdue&&<span className="px-2 py-0.5 rounded-full border text-xs font-bold text-amber-700 bg-amber-50 border-amber-200">PRÓXIMO</span>}
                          {!overdue&&!soon&&<span className="px-2 py-0.5 rounded-full border text-xs font-bold text-emerald-700 bg-emerald-50 border-emerald-200">En {Math.round(hoursLeft)}h</span>}
                          <span className="text-gray-500 text-xs">{eq?.code} — {eq?.name}</span>
                        </div>
                        <p className="text-gray-800 font-semibold text-sm mb-2">{p.name}</p>
                        <div className="mb-2">
                          <div className="flex justify-between text-xs text-gray-400 mb-1">
                            <span>{p.lastHorometro.toLocaleString()}h</span>
                            <span className="font-semibold" style={{color:overdue?"#b91c1c":NV.navy}}>Actual: {curH.toLocaleString()}h</span>
                            <span>Meta: {p.horometroTarget.toLocaleString()}h</span>
                          </div>
                          <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full transition-all ${overdue?"bg-red-500":soon?"bg-amber-400":"bg-emerald-500"}`} style={{width:`${pct}%`}}/>
                          </div>
                          <p className="text-xs text-gray-400 mt-1">Frecuencia: cada {p.frequency}h · {p.estimatedHours}h estimadas</p>
                        </div>
                        {Array.isArray(p.tasks)&&p.tasks.length>0&&<div className="flex flex-wrap gap-1.5 mt-2">{p.tasks.map((t,i)=><span key={i} className="text-xs border px-2 py-0.5 rounded-full" style={{background:NV.light,borderColor:"#BFD9F2",color:NV.navy}}>{t}</span>)}</div>}
                      </div>
                      <div className="flex flex-col gap-2 flex-shrink-0">
                        <button onClick={()=>generateOT(p)} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg text-white font-medium hover:opacity-90" style={{background:NV.blue}}><Zap size={12}/>Generar OT</button>
                        <button onClick={()=>delPlan(p.id)} className="text-gray-300 hover:text-red-500 text-xs text-center p-1"><Trash2 size={13}/></button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      {showForm&&(
        <Modal title="Nuevo Plan PMS" onClose={()=>setShowForm(false)} wide>
          <div className="space-y-3">
            <div><label className="text-gray-500 text-xs font-medium mb-1 block">BUQUE</label>
              <select value={form.vesselId} onChange={e=>setForm(f=>({...f,vesselId:e.target.value,equipId:""}))} className={sCls}>
                <option value="">Seleccionar...</option>{vessels.map(v=><option key={v.id} value={v.id}>{v.name}</option>)}
              </select></div>
            {form.vesselId&&<div><label className="text-gray-500 text-xs font-medium mb-1 block">EQUIPO</label>
              <select value={form.equipId} onChange={e=>setForm(f=>({...f,equipId:e.target.value}))} className={sCls}>
                <option value="">Seleccionar...</option>{equipment.filter(e=>e.vesselId===form.vesselId).map(e=><option key={e.id} value={e.id}>{e.code} — {e.name} ({(e.hours||0).toLocaleString()}h actuales)</option>)}
              </select></div>}
            <div><label className="text-gray-500 text-xs font-medium mb-1 block">NOMBRE DEL PLAN</label><input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} className={iCls} placeholder="ej: Servicio 500h Motor Principal"/></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-gray-500 text-xs font-medium mb-1 block">FRECUENCIA (horas)</label><input type="number" value={form.frequency} onChange={e=>setForm(f=>({...f,frequency:e.target.value}))} className={iCls} placeholder="500"/></div>
              <div><label className="text-gray-500 text-xs font-medium mb-1 block">ÚLTIMO HORÓMETRO (h)</label><input type="number" value={form.lastHorometro} onChange={e=>setForm(f=>({...f,lastHorometro:e.target.value}))} className={iCls}/></div>
              <div><label className="text-gray-500 text-xs font-medium mb-1 block">HORAS ESTIMADAS</label><input type="number" value={form.estimatedHours} onChange={e=>setForm(f=>({...f,estimatedHours:e.target.value}))} className={iCls}/></div>
            </div>
            {form.frequency&&form.lastHorometro&&<div className="bg-blue-50 border border-blue-100 rounded-lg p-2.5 text-xs" style={{color:NV.navy}}>Próxima intervención a: <strong>{(parseFloat(form.lastHorometro)+parseInt(form.frequency)).toLocaleString()}h</strong></div>}
            <div><label className="text-gray-500 text-xs font-medium mb-1 block">TAREAS (una por línea)</label><textarea value={form.tasks} onChange={e=>setForm(f=>({...f,tasks:e.target.value}))} rows={4} className={`${iCls} resize-none`} placeholder={"Cambio aceite motor\nFiltros hidráulicos\nAjuste válvulas\nRevisión inyectores"}/></div>
          </div>
          <ModalActions onSave={addPlan} onCancel={()=>setShowForm(false)} label="Guardar Plan"/>
        </Modal>
      )}
    </div>
  );
}

// ─── REPORTS ─────────────────────────────────────────────────────────────────
function Reports({data}){
  const {vessels,equipment,workorders,certificates} = data;
  const byVessel=vessels.map(v=>({
    ...v,
    totalWO:workorders.filter(w=>w.vesselId===v.id).length,
    completedWO:workorders.filter(w=>w.vesselId===v.id&&w.status==="completada").length,
    hrs:workorders.filter(w=>w.vesselId===v.id&&w.status==="completada").reduce((s,w)=>s+(w.actualHours||0),0),
    equipFalla:equipment.filter(e=>e.vesselId===v.id&&e.status==="falla").length,
    certAlerts:certificates.filter(c=>c.vesselId===v.id&&["expired","critical","expiring"].includes(certStatus(c.expiryDate).s)).length,
  }));

  const totalWO=workorders.length; const completedWO=workorders.filter(w=>w.status==="completada").length;
  const totalHrs=workorders.filter(w=>w.status==="completada").reduce((s,w)=>s+(w.actualHours||0),0);

  return(
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-gray-900 font-bold text-xl">Informes KPI</h1>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Ship}          label="Buques en Flota"     value={vessels.length}     color="navy"/>
        <StatCard icon={CheckCircle}   label="OT Completadas"      value={completedWO}        color="emerald"/>
        <StatCard icon={AlertTriangle} label="Equipos en Falla"    value={equipment.filter(e=>e.status==="falla").length} color="red"/>
        <StatCard icon={Clock}         label="Horas Trabajadas"    value={`${totalHrs.toFixed(1)}h`} color="amber"/>
      </div>
      <div className={`${card} overflow-hidden`}>
        <div className="px-4 py-3 text-xs text-white font-semibold uppercase tracking-wider" style={{background:NV.navyMid}}>KPIs por Buque</div>
        <table className="w-full text-sm">
          <thead><tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 font-semibold uppercase tracking-wider">
            <th className="text-left px-4 py-3">Buque</th><th className="text-left px-4 py-3">Estado</th>
            <th className="text-right px-4 py-3">OT Total</th><th className="text-right px-4 py-3">Completadas</th>
            <th className="text-right px-4 py-3">Horas</th><th className="text-center px-4 py-3">Equipos Falla</th><th className="text-center px-4 py-3">Cert. Alertas</th>
          </tr></thead>
          <tbody>{byVessel.map((v,i)=>{
            const vs=VESSEL_STATUS[v.status]||VESSEL_STATUS.in_port;
            return(
              <tr key={v.id} className={`border-b border-gray-100 last:border-0 hover:bg-blue-50/30 ${i%2===0?"bg-white":"bg-gray-50/40"}`}>
                <td className="px-4 py-2.5"><p className="text-gray-800 font-semibold text-sm">{v.name}</p><p className="font-mono text-xs text-gray-400">IMO {v.imo}</p></td>
                <td className="px-4 py-2.5"><span className={`inline-flex px-2 py-0.5 rounded-full border text-xs font-semibold ${vs.cls}`}>{vs.label}</span></td>
                <td className="px-4 py-2.5 text-right text-gray-700 font-medium">{v.totalWO}</td>
                <td className="px-4 py-2.5 text-right text-emerald-600 font-semibold">{v.completedWO}</td>
                <td className="px-4 py-2.5 text-right text-gray-600">{v.hrs.toFixed(1)}h</td>
                <td className="px-4 py-2.5 text-center"><span className={`font-bold ${v.equipFalla>0?"text-red-600":"text-gray-400"}`}>{v.equipFalla}</span></td>
                <td className="px-4 py-2.5 text-center"><span className={`font-bold ${v.certAlerts>0?"text-amber-600":"text-gray-400"}`}>{v.certAlerts}</span></td>
              </tr>
            );
          })}</tbody>
        </table>
      </div>
    </div>
  );
}

// ─── USERS ───────────────────────────────────────────────────────────────────
function UsersPage({data,setData}){
  const {users} = data;
  const [showForm,setShowForm]=useState(false);
  const [form,setForm]=useState({name:"",email:"",role:"mechanic"});
  const addUser=()=>{
    if(!form.name||!form.email)return;
    const nu={uid:uid(),...form,avatar:form.name.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase()};
    const updated=[...users,nu];setData(d=>({...d,users:updated}));saveData("users",updated);setShowForm(false);setForm({name:"",email:"",role:"mechanic"});
  };
  const ROLE_LABELS={fleet_manager:"Fleet Manager",vessel_chief:"Chief Engineer",mechanic:"Mecánico",admin:"Admin"};
  return(
    <div className="p-6">
      <div className="flex items-center justify-between mb-5">
        <div><h1 className="text-gray-900 font-bold text-xl">Usuarios</h1><p className="text-gray-500 text-sm">{users.length} usuarios · Los usuarios deben crearse también en Firebase Auth Console</p></div>
        <button onClick={()=>setShowForm(true)} style={{background:NV.blue}} className={btnPrimary}><Plus size={15}/>Nuevo Usuario</button>
      </div>
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-5 text-xs text-amber-700">
        <strong>Importante:</strong> Para que un usuario pueda iniciar sesión, debe ser creado en <strong>Firebase Console → Authentication → Users</strong> con su email y contraseña inicial. El registro aquí solo guarda el perfil (nombre, rol).
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {users.map(u=>(
          <div key={u.uid} className={`${card} p-5 flex items-center gap-4`}>
            <div className="w-12 h-12 rounded-full flex items-center justify-center font-bold text-sm text-white flex-shrink-0" style={{background:NV.navyMid}}>{u.avatar||"?"}</div>
            <div className="flex-1 min-w-0">
              <p className="text-gray-800 font-semibold text-sm">{u.name}</p>
              <p className="text-gray-400 text-xs">{u.email}</p>
              <span className="text-xs px-2 py-0.5 rounded-full font-medium text-white mt-1 inline-block" style={{background:NV.blue}}>{ROLE_LABELS[u.role]||u.role}</span>
            </div>
          </div>
        ))}
      </div>
      {showForm&&(
        <Modal title="Nuevo Usuario" onClose={()=>setShowForm(false)}>
          <div className="space-y-3">
            {[["name","NOMBRE COMPLETO"],["email","CORREO (debe existir en Firebase Auth)"]].map(([k,l])=>(
              <div key={k}><label className="text-gray-500 text-xs font-medium mb-1 block">{l}</label><input value={form[k]} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))} className={iCls}/></div>
            ))}
            <div><label className="text-gray-500 text-xs font-medium mb-1 block">ROL</label>
              <select value={form.role} onChange={e=>setForm(f=>({...f,role:e.target.value}))} className={sCls}>
                <option value="fleet_manager">Fleet Manager — Acceso completo</option>
                <option value="vessel_chief">Chief Engineer — Su buque</option>
                <option value="mechanic">Mecánico — OT y planes</option>
                <option value="admin">Admin — Acceso completo</option>
              </select></div>
          </div>
          <ModalActions onSave={addUser} onCancel={()=>setShowForm(false)} label="Crear Perfil"/>
        </Modal>
      )}
    </div>
  );
}

// ─── LOADING SCREEN ───────────────────────────────────────────────────────────
function Loading(){
  return(
    <div className="min-h-screen flex items-center justify-center" style={{background:`linear-gradient(160deg,${NV.navy},${NV.blue})`}}>
      <div className="text-center">
        <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-white/30"><Ship size={32} className="text-white animate-pulse"/></div>
        <p className="text-white font-bold text-lg">MANTEK Maritime</p>
        <p className="text-blue-200 text-sm mt-1">Conectando con la base de datos...</p>
      </div>
    </div>
  );
}

// ─── APP ROOT ─────────────────────────────────────────────────────────────────
export default function App(){
  const [authUser, setAuthUser] = useState(undefined); // undefined = loading
  const [page, setPage]         = useState("dashboard");
  const [online, setOnline]     = useState(true);
  const [dbLoading, setDbLoading] = useState(true);
  const [showChangePwd, setShowChangePwd] = useState(false);
  const [profile, setProfile]   = useState(null);

  const [data, setData] = useState({
    vessels:      SEED_VESSELS,
    equipment:    SEED_EQUIPMENT,
    certificates: SEED_CERTIFICATES,
    workorders:   SEED_WORK_ORDERS,
    plans:        SEED_PLANS,
    users:        SEED_USERS_PROFILE,
  });

  const unsubs = useRef([]);

  // Firebase Auth listener
  useEffect(()=>{
    const unsub = onAuthStateChanged(auth, user => {
      setAuthUser(user || null);
    });
    return ()=>unsub();
  },[]);

  // Load profile when auth user changes
  useEffect(()=>{
    if(!authUser){ setProfile(null); return; }
    // Try to load profile from Firestore users collection
    getDoc(doc(db,COLL,"users")).then(snap=>{
      if(snap.exists()){
        const users=snap.data().data||[];
        const p=users.find(u=>u.email===authUser.email);
        if(p) setProfile(p);
        else setProfile({uid:authUser.uid,email:authUser.email,name:authUser.email,role:"mechanic",avatar:authUser.email[0].toUpperCase()});
      } else {
        setProfile({uid:authUser.uid,email:authUser.email,name:authUser.email,role:"fleet_manager",avatar:authUser.email[0].toUpperCase()});
      }
    }).catch(()=>{
      setProfile({uid:authUser.uid,email:authUser.email,name:authUser.email,role:"fleet_manager",avatar:authUser.email[0].toUpperCase()});
    });
  },[authUser]);

  // Firestore real-time listeners
  useEffect(()=>{
    if(!authUser) return;
    const keys={vessels:"vessels",equipment:"equipment",certificates:"certificates",workorders:"workorders",plans:"plans",users:"users"};
    const seeds={vessels:SEED_VESSELS,equipment:SEED_EQUIPMENT,certificates:SEED_CERTIFICATES,workorders:SEED_WORK_ORDERS,plans:SEED_PLANS,users:SEED_USERS_PROFILE};
    (async()=>{
      for(const key of Object.keys(keys)) await initIfEmpty(key,seeds[key]);
      unsubs.current=Object.entries(keys).map(([k,v])=>onSnapshot(
        doc(db,COLL,k),
        snap=>{ setOnline(true); if(snap.exists())setData(d=>({...d,[v]:snap.data().data})); },
        ()=>setOnline(false)
      ));
      setDbLoading(false);
    })();
    return()=>{ unsubs.current.forEach(u=>u()); unsubs.current=[]; };
  },[authUser]);

  // Cert alerts count
  const certAlerts = data.certificates.filter(c=>{const s=certStatus(c.expiryDate).s;return s==="critical"||s==="expired";}).length;

  // Screens
  if(authUser===undefined) return <Loading/>;
  if(!authUser) return <LoginPage/>;
  if(dbLoading) return <Loading/>;

  const PAGES = {
    dashboard:    <Dashboard    data={data} onNav={setPage}/>,
    fleet:        <Fleet        data={data} setData={setData}/>,
    equipment:    <Equipment    data={data} setData={setData}/>,
    workorders:   <WorkOrders   data={data} setData={setData}/>,
    certificates: <Certificates data={data} setData={setData}/>,
    plans:        <Plans        data={data} setData={setData}/>,
    reports:      <Reports      data={data}/>,
    users:        <UsersPage    data={data} setData={setData}/>,
  };

  return(
    <div className="min-h-screen bg-gray-50 flex">
      <Sidebar
        profile={profile}
        active={page}
        onNav={setPage}
        onLogout={()=>signOut(auth)}
        onChangePwd={()=>setShowChangePwd(true)}
        certAlerts={certAlerts}
        online={online}
      />
      <main className="flex-1 min-h-screen overflow-y-auto">
        {PAGES[page]||PAGES.dashboard}
      </main>
      {showChangePwd&&<ChangePasswordModal onClose={()=>setShowChangePwd(false)}/>}
    </div>
  );
}
