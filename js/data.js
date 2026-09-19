/* =========================================================
   شركة زهى الاعمال للمقاولات - طبقة البيانات (localStorage)
   ========================================================= */

const DB_PREFIX = "zac_"; // Zaha Al-Amal Contracting

function uid(prefix = "id") {
  return prefix + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/* ---------- أيقونات صغيرة لأزرار الجداول (فتح/عرض، تعديل، حذف) ---------- */
const ICON_VIEW = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
const ICON_EDIT = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>`;
const ICON_DELETE = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>`;
const ICON_LIST = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>`;
const ICON_GRID = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>`;

/* ---------- مكتبة أيقونات مفرغة (Outline) بنفس ستايل أيقونة الحذف — تُستخدم بدل الإيموجي في كل الموقع ---------- */
const SVG_ICON_PATHS = {
  "home": '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
  "building": '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01M12 6h.01M16 6h.01M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01"/>',
  "file-text": '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>',
  "file": '<path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/>',
  "users": '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  "user": '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  "dollar": '<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
  "settings": '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  "menu": '<line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/>',
  "bell": '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
  "save": '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>',
  "printer": '<polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
  "copy": '<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  "pin": '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
  "plus": '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  "id-card": '<rect x="2" y="5" width="20" height="14" rx="2"/><circle cx="8" cy="12" r="2"/><path d="M14 10h4M14 14h4"/>',
  "paperclip": '<path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>',
  "alert": '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  "clock": '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  "bulb": '<line x1="9" y1="18" x2="15" y2="18"/><line x1="10" y1="22" x2="14" y2="22"/><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14"/>',
  "grip": '<circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/>',
  "close": '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  "check-circle": '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
  "chevron-left": '<polyline points="15 18 9 12 15 6"/>',
  "chevron-down": '<polyline points="6 9 12 15 18 9"/>',
  "chevron-up": '<polyline points="18 15 12 9 6 15"/>',
  "ban": '<circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>',
  "folder": '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
  "clipboard": '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>',
  "box": '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>',
  "briefcase": '<rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
  "truck": '<rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>',
  "layers": '<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>',
};
function svgIcon(name, size = 16) {
  return `<svg class="ico" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${SVG_ICON_PATHS[name] || ""}</svg>`;
}

/* ---------- التخزين المركزي (Vercel Postgres عبر /api/data) ----------
   DB_CACHE نسخة في الذاكرة من كامل بيانات الخادم، تُحمَّل دفعة واحدة عبر
   loadRemoteData() عند بدء التشغيل/بعد تسجيل الدخول. dbGet/dbSet تبقيان
   متزامنتين (نفس الاستخدام في كل ملفات النظام دون أي تعديل) وتقرآن/تكتبان
   من/إلى هذه النسخة مباشرة؛ dbSet ترسل أيضاً نسخة الخادم في الخلفية. */
let DB_CACHE = {};
let DB_READY = false;

function dbGet(key, fallback) {
  if (!DB_READY) return fallback;
  return Object.prototype.hasOwnProperty.call(DB_CACHE, key) ? DB_CACHE[key] : fallback;
}

function dbSet(key, value) {
  DB_CACHE[key] = value;
  fetch("/api/data", {
    method: "POST",
    headers: Object.assign({ "Content-Type": "application/json" }, authHeader()),
    body: JSON.stringify({ key, value }),
  }).then(res => {
    if (!res.ok) throw new Error("http " + res.status);
  }).catch(e => {
    console.error("dbSet sync error", key, e);
    toast("تعذّر حفظ آخر تعديل على الخادم — تحقق من الاتصال بالإنترنت");
  });
}

function getAuthToken() {
  return localStorage.getItem(DB_PREFIX + "authToken");
}
function setAuthToken(token) {
  if (token) localStorage.setItem(DB_PREFIX + "authToken", token);
  else localStorage.removeItem(DB_PREFIX + "authToken");
}
function authHeader() {
  const t = getAuthToken();
  return t ? { Authorization: "Bearer " + t } : {};
}

// يجلب كامل البيانات من الخادم ويملأ DB_CACHE بها — يُستدعى عند بدء التشغيل (إن وُجد توكن) وبعد كل تسجيل دخول ناجح
async function loadRemoteData() {
  const res = await fetch("/api/data", { headers: authHeader() });
  if (res.status === 401) { setAuthToken(null); throw new Error("unauthorized"); }
  if (!res.ok) throw new Error("http " + res.status);
  DB_CACHE = await res.json();
  DB_READY = true;
}

// يجمع كل بيانات localStorage القديمة (من قبل الانتقال للخادم) — تُستخدم مرة واحدة فقط في شاشة "الإعداد الأول"
function collectLegacyLocalData() {
  const out = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || k.indexOf(DB_PREFIX) !== 0 || k === DB_PREFIX + "authToken") continue;
    try { out[k.slice(DB_PREFIX.length)] = JSON.parse(localStorage.getItem(k)); } catch (e) { /* تجاهل مفتاح تالف */ }
  }
  return out;
}

function todayISO() {
  const d = new Date();
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fmtMoney(n) {
  n = Number(n) || 0;
  return n.toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ر.س";
}

function fmtDate(d) {
  if (!d) return "-";
  try {
    // تفادي انزياح يوم بسبب فروق التوقيت عند تفسير تواريخ بصيغة YYYY-MM-DD كـ UTC
    let date;
    if (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
      const [y, m, day] = d.split("-").map(Number);
      date = new Date(y, m - 1, day);
    } else {
      date = new Date(d);
    }
    return date.toLocaleDateString("ar-SA-u-nu-latn", { year: "numeric", month: "2-digit", day: "2-digit" });
  } catch (e) {
    return d;
  }
}

function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* ---------- الأدوار والصلاحيات ---------- */
const ROLES = ["مدير عام", "مدير النظام", "محاسب", "مهندس", "مراقب موقع", "مسؤول مشتريات"];

/* ---------- أنواع الهوية ---------- */
const ID_TYPES = ["هوية وطنية", "إقامة", "جواز سفر", "فيزا"];

/* ---------- حساب العمر من تاريخ الميلاد ---------- */
function calcAge(dob) {
  if (!dob) return null;
  const [y, m, d] = dob.split("-").map(Number);
  if (!y || !m || !d) return null;
  const birth = new Date(y, m - 1, d);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const hadBirthdayThisYear = (today.getMonth() > birth.getMonth()) || (today.getMonth() === birth.getMonth() && today.getDate() >= birth.getDate());
  if (!hadBirthdayThisYear) age--;
  return age >= 0 ? age : null;
}

const PERMISSIONS = {
  "مدير عام": ["dashboard", "projects", "clients", "quotes", "visits", "reports", "acc_projects", "acc_general", "acc_vat", "contracts", "settings"],
  "مدير النظام": ["dashboard", "projects", "clients", "quotes", "visits", "reports", "acc_projects", "acc_general", "acc_vat", "contracts", "settings"],
  "محاسب": ["dashboard", "projects", "clients", "acc_projects", "acc_general", "acc_vat", "contracts"],
  "مهندس": ["dashboard", "projects", "clients", "quotes", "visits", "reports", "contracts"],
  "مراقب موقع": ["dashboard", "visits", "reports"],
  "مسؤول مشتريات": ["dashboard", "projects", "clients", "quotes", "acc_projects"],
};

/* ---------- مصفوفة الصلاحيات التفصيلية (تبويب "الصلاحيات" في الإعدادات) ---------- */
const PERMISSION_GROUPS = [
  { group: "لوحة التحكم", perms: [
    { key: "dashboard", label: "الوصول للوحة التحكم" },
  ]},
  { group: "المشاريع", perms: [
    { key: "projects", label: "عرض قائمة المشاريع" },
    { key: "projects_add", label: "إضافة مشروع جديد", parent: "projects" },
    { key: "projects_delete", label: "حذف مشروع", parent: "projects" },
  ]},
  { group: "العملاء", perms: [
    { key: "clients", label: "عرض قائمة العملاء" },
    { key: "clients_add", label: "إضافة عميل جديد", parent: "clients" },
    { key: "clients_delete", label: "حذف عميل", parent: "clients" },
  ]},
  { group: "عروض الأسعار", perms: [
    { key: "quotes", label: "عرض عروض الأسعار" },
    { key: "quotes_add", label: "إنشاء عرض سعر جديد", parent: "quotes" },
    { key: "quotes_delete", label: "حذف عرض سعر", parent: "quotes" },
  ]},
  { group: "زيارة الموقع", perms: [
    { key: "visits", label: "عرض زيارات الموقع" },
    { key: "visits_add", label: "طلب زيارة موقع جديدة", parent: "visits" },
  ]},
  { group: "التقارير", perms: [
    { key: "reports", label: "عرض التقارير" },
  ]},
  { group: "العقود", perms: [
    { key: "contracts", label: "عرض العقود" },
    { key: "contracts_add", label: "إنشاء عقد جديد", parent: "contracts" },
    { key: "contracts_delete", label: "حذف عقد", parent: "contracts" },
  ]},
  { group: "المحاسبة", perms: [
    { key: "acc_projects", label: "محاسبة المشاريع" },
    { key: "acc_general", label: "المحاسبة العامة والعُهد" },
    { key: "acc_vat", label: "ضريبة القيمة المضافة" },
  ]},
  { group: "الإعدادات", perms: [
    { key: "settings", label: "الوصول لإعدادات النظام" },
    { key: "activity_log_delete", label: "حذف سطور من سجل العمليات", defaultRoles: ["مدير عام"] },
  ]},
];
const ALL_PERMISSION_DEFS = PERMISSION_GROUPS.flatMap(g => g.perms);

function defaultPermMatrix() {
  const matrix = {};
  ALL_PERMISSION_DEFS.forEach(p => {
    matrix[p.key] = {};
    ROLES.forEach(role => {
      if (p.defaultRoles) { matrix[p.key][role] = p.defaultRoles.includes(role); return; }
      const baseKey = p.parent || p.key;
      matrix[p.key][role] = (PERMISSIONS[role] || []).includes(baseKey);
    });
  });
  return matrix;
}

function getPermMatrix() {
  return dbGet("permMatrix", null) || defaultPermMatrix();
}
function setPermMatrix(matrix) {
  dbSet("permMatrix", matrix);
}

function hasPermission(role, key) {
  const matrix = getPermMatrix();
  if (matrix[key] && Object.prototype.hasOwnProperty.call(matrix[key], role)) return !!matrix[key][role];
  return (PERMISSIONS[role] || []).includes(key);
}

function canAccess(role, routeKey) {
  return hasPermission(role, routeKey);
}

/* ---------- بيانات أولية (Seed) ---------- */
function seedIfEmpty() {
  if (!dbGet("seeded", false)) {
    dbSet("users", [
      { id: uid("u"), name: "عبدالعزيز الحربي", username: "aziz", role: "مدير عام" },
      { id: uid("u"), name: "سلطان القحطاني", username: "sultan", role: "مدير النظام" },
      { id: uid("u"), name: "فهد الدوسري", username: "fahad", role: "محاسب" },
      { id: uid("u"), name: "خالد العتيبي", username: "khaled", role: "مهندس" },
      { id: uid("u"), name: "ناصر الشهري", username: "nasser", role: "مراقب موقع" },
      { id: uid("u"), name: "تركي المطيري", username: "turki", role: "مسؤول مشتريات" },
    ]);

    dbSet("projects", [
      { id: uid("p"), name: "فيلا العليا", client: "أ. محمد السبيعي", location: "حي العليا، الرياض", completion: 65, status: "قيد التنفيذ" },
      { id: uid("p"), name: "مجمع تجاري - النرجس", client: "شركة الأفق العقارية", location: "حي النرجس، الرياض", completion: 30, status: "قيد التنفيذ" },
      { id: uid("p"), name: "ترميم مبنى - السليمانية", client: "أ. سعود العنزي", location: "حي السليمانية، الرياض", completion: 90, status: "قيد التنفيذ" },
    ]);

    function mkItem(name, unit, supplyPrice, installPrice) {
      return {
        id: uid("it"), name, unit,
        supply: { enabled: supplyPrice > 0, price: supplyPrice },
        install: { enabled: installPrice > 0, price: installPrice },
        profitMargin: 30, // نسبة ربح افتراضية 30% (سعر التكلفة لا يظهر للعميل)
      };
    }

    dbSet("priceCatalog", [
      {
        id: uid("cat"), name: "القواطع",
        items: [
          mkItem("قاطع جبسبورد عادي", "م²", 25, 20),
          mkItem("قاطع زجاجي", "م²", 80, 40),
        ],
      },
      {
        id: uid("cat"), name: "الدهانات",
        items: [
          mkItem("دهان جدران (وجهين) شامل معجون وصنفرة وأساس", "م²", 10, 15),
          mkItem("دهان أسقف (وجهين) شامل معجون وصنفرة وأساس", "م²", 9, 13),
        ],
      },
      {
        id: uid("cat"), name: "الأرضيات",
        items: [
          mkItem("بورسلان 60×60", "م²", 45, 20),
          mkItem("رخام", "م²", 140, 40),
        ],
      },
      {
        id: uid("cat"), name: "الأسقف",
        items: [
          mkItem("سقف جبسبورد عادي", "م²", 30, 25),
          mkItem("سقف مشبك (T-Bar)", "م²", 25, 15),
        ],
      },
      {
        id: uid("cat"), name: "السباكة",
        items: [
          mkItem("تمديد نقطة صرف صحي", "نقطة", 60, 90),
          mkItem("تركيب طقم أدوات صحية", "طقم", 600, 200),
        ],
      },
      {
        id: uid("cat"), name: "الكهرباء",
        items: [
          mkItem("تمديد نقطة إنارة", "نقطة", 30, 60),
          mkItem("تركيب لوحة توزيع", "لوحة", 450, 150),
        ],
      },
    ]);

    dbSet("clients", [
      { id: uid("cl"), name: "أ. محمد السبيعي", clientType: "فرد", phone: "0501234567", email: "", taxNumber: "", address: "حي العليا، الرياض", notes: "", createdAt: new Date().toISOString() },
      { id: uid("cl"), name: "شركة الأفق العقارية", clientType: "شركة", phone: "0112223344", email: "info@alofoq.example", taxNumber: "300123456700003", address: "حي النرجس، الرياض", notes: "عميل مطور عقاري", createdAt: new Date().toISOString() },
      { id: uid("cl"), name: "أ. سعود العنزي", clientType: "فرد", phone: "0559876543", email: "", taxNumber: "", address: "حي السليمانية، الرياض", notes: "", createdAt: new Date().toISOString() },
    ]);

    dbSet("quotes", []);
    dbSet("visits", []);
    dbSet("reports", []);
    dbSet("accProjects", []);
    dbSet("accGeneral", []);
    dbSet("contracts", []);
    dbSet("seeded", true);
  }
}

/* ترحيل بسيط: يضمن وجود مجموعة العملاء حتى لو كانت البيانات مزروعة مسبقاً */
function migrateClients() {
  if (dbGet("clients", null) === null) {
    // استخلاص عملاء مبدئيين من المشاريع الحالية إن وجدت
    const projects = dbGet("projects", []);
    const names = new Set();
    const clients = [];
    projects.forEach(p => {
      if (p.client && !names.has(p.client)) {
        names.add(p.client);
        clients.push({ id: uid("cl"), name: p.client, phone: "", email: "", taxNumber: "", address: p.location || "", notes: "", createdAt: new Date().toISOString() });
      }
    });
    dbSet("clients", clients);
  }
}

/* ترحيل بسيط: يحوّل بنود الكتالوج القديمة (سعر واحد) إلى بنية توريد/تركيب */
function migratePriceCatalog() {
  const cats = dbGet("priceCatalog", []);
  let changed = false;
  cats.forEach(cat => {
    (cat.items || []).forEach(it => {
      if (it.supply === undefined || it.install === undefined) {
        const legacyPrice = Number(it.price) || 0;
        it.supply = { enabled: false, price: 0 };
        it.install = { enabled: true, price: legacyPrice };
        changed = true;
      }
    });
  });
  if (changed) dbSet("priceCatalog", cats);
}

/* ترحيل بسيط: يضيف نسبة ربح افتراضية 30% لبنود الكتالوج التي لا تملكها بعد
   (لا يمس عروض الأسعار المحفوظة سابقاً؛ هذه فقط بنود القائمة المرجعية) */
function migrateProfitMargin() {
  const cats = dbGet("priceCatalog", []);
  let changed = false;
  cats.forEach(cat => {
    (cat.items || []).forEach(it => {
      if (it.profitMargin === undefined || it.profitMargin === null) {
        it.profitMargin = 30;
        changed = true;
      }
    });
  });
  if (changed) dbSet("priceCatalog", cats);
}

/* ترحيل بسيط: يضيف تصنيف (فرد/شركة/جهة حكومية) للعملاء الحاليين حسب تخمين من الاسم */
function migrateClientTypes() {
  const clients = dbGet("clients", []);
  let changed = false;
  clients.forEach(c => {
    if (c.clientType === undefined) {
      const name = c.name || "";
      if (/وزارة|هيئة|بلدية|أمانة|جهة حكومية/.test(name)) c.clientType = "جهة حكومية";
      else if (/شركة|مؤسسة|مجموعة/.test(name)) c.clientType = "شركة";
      else c.clientType = "فرد";
      changed = true;
    }
  });
  if (changed) dbSet("clients", clients);
}

// "من مسجّل دخول على هذا الجهاز تحديداً" يبقى محلياً عمداً (لا يُزامَن كباقي البيانات)
function getCurrentUser() {
  try {
    const raw = localStorage.getItem(DB_PREFIX + "currentUser");
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}
function setCurrentUser(u) {
  if (u) localStorage.setItem(DB_PREFIX + "currentUser", JSON.stringify(u));
  else localStorage.removeItem(DB_PREFIX + "currentUser");
}

/* ---------- الإجازات (أنواعها وأحكامها حسب نظام العمل السعودي) ---------- */
const WEEKDAYS = [
  { key: "sat", label: "السبت" }, { key: "sun", label: "الأحد" }, { key: "mon", label: "الاثنين" },
  { key: "tue", label: "الثلاثاء" }, { key: "wed", label: "الأربعاء" }, { key: "thu", label: "الخميس" }, { key: "fri", label: "الجمعة" },
];

const LEAVE_TYPE_LABELS_AR = {
  paid: "الإجازة السنوية",
  sick: "إجازة مرضية",
  emergency: "اضطرارية",
  marriage: "إجازة زواج",
  bereavement: "إجازة وفاة",
  paternity: "إجازة مولود جديد (للأب)",
  iddah: "عدة الوفاة (للمرأة المسلمة)",
  hajj: "إجازة الحج",
  official_holiday: "عطلة رسمية",
  absence: "غياب",
  unpaid: "بدون راتب",
  other: "أخرى",
};

const ANNUAL_LEAVE_BALANCE_DAYS = 21;
const ANNUAL_LEAVE_BALANCE_DAYS_AFTER_5_YEARS = 30;

// مدة افتراضية ثابتة بالأيام لأنواع إجازات محددة المدة قانوناً — تُقترح تلقائياً كتاريخ نهاية، وتبقى قابلة للتعديل اليدوي
const LEAVE_TYPE_FIXED_DAYS = { marriage: 5, bereavement: 5, paternity: 3, iddah: 130 };

// أنواع إجازات "مرة واحدة طوال فترة الخدمة" — تنبيه استرشادي غير مانع فقط
const LEAVE_TYPE_ONCE_PER_SERVICE = ["hajj"];

const OFFICIAL_HOLIDAYS = {
  eid_fitr: { label: "عيد الفطر", days: 4 },
  eid_adha: { label: "عيد الأضحى", days: 4 },
  national_day: { label: "اليوم الوطني", days: 1 },
  founding_day: { label: "يوم التأسيس", days: 1 },
};

function leaveTypeDisplay(leave) {
  if (leave.leaveType === "other" && leave.otherTypeLabel) return leave.otherTypeLabel;
  return LEAVE_TYPE_LABELS_AR[leave.leaveType] || leave.leaveType;
}

// استحقاق الإجازة السنوية بالأيام حسب مدة الخدمة — ٢١ يوماً أساساً، ٣٠ يوماً بعد إتمام ٥ سنوات خدمة متصلة (المادة ١٠٩)
function annualLeaveEntitlementDays(hireDate, asOfDate) {
  asOfDate = asOfDate || new Date();
  if (!hireDate) return ANNUAL_LEAVE_BALANCE_DAYS;
  const fiveYearsAfterHire = new Date(hireDate);
  fiveYearsAfterHire.setFullYear(fiveYearsAfterHire.getFullYear() + 5);
  return asOfDate >= fiveYearsAfterHire ? ANNUAL_LEAVE_BALANCE_DAYS_AFTER_5_YEARS : ANNUAL_LEAVE_BALANCE_DAYS;
}

// توزيع أجر الإجازة المرضية على شرائح المادة ١١٧: أول ٣٠ يوماً بأجر كامل، الـ٦٠ التالية بثلاثة أرباع الأجر، الـ٣٠ الأخيرة بلا أجر (سقف ١٢٠ يوماً) — استرشادي فقط
function sickLeavePayBreakdown(daysUsedBeforeThisLeave, thisLeaveDays) {
  const start = Math.max(0, daysUsedBeforeThisLeave);
  const end = start + Math.max(0, thisLeaveDays);
  const overlap = (rangeStart, rangeEnd) => Math.max(0, Math.min(end, rangeEnd) - Math.max(start, rangeStart));
  return { fullPayDays: overlap(0, 30), threeQuarterPayDays: overlap(30, 90), unpaidDays: overlap(90, Infinity) };
}

function daysBetweenInclusive(startStr, endStr) {
  return Math.round((new Date(endStr).getTime() - new Date(startStr).getTime()) / 86400000) + 1;
}

/* ---------- رصيد إجازات الموظف (مشتركة بين تبويب الإجازات وتبويب الموظفين في المحاسبة) ---------- */
function employeeLeaveEntitlement(userId) {
  const u = dbGet("users", []).find(x => x.id === userId);
  return annualLeaveEntitlementDays(u ? u.hireDate : null);
}
function employeeUsedAnnualLeave(userId, year) {
  year = year || new Date().getFullYear();
  return dbGet("leaves", []).filter(l => l.employeeId === userId && l.deductFromBalance && (l.startDate || "").slice(0, 4) === String(year))
    .reduce((s, l) => s + Number(l.daysCount || 0), 0);
}
function employeeRemainingLeaveBalance(userId, year) {
  return employeeLeaveEntitlement(userId) - employeeUsedAnnualLeave(userId, year);
}
function employeeUsedSickDays(userId, year) {
  year = year || new Date().getFullYear();
  return dbGet("leaves", []).filter(l => l.employeeId === userId && l.leaveType === "sick" && (l.startDate || "").slice(0, 4) === String(year))
    .reduce((s, l) => s + Number(l.daysCount || 0), 0);
}

// يضيف عدد أيام (شاملاً تاريخ البدء كيوم أول) إلى تاريخ YYYY-MM-DD
function addInclusiveDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + Math.max(1, days) - 1);
  return d.toISOString().slice(0, 10);
}

/* ---------- إعدادات المظهر (الألوان والأيقونات والخط) ---------- */
/* الافتراضي الجديد (تصميم v2): أزرق + كحلي + خط IBM Plex Sans Arabic */
const THEME_DEFAULTS = { primaryColor: "#1a6cf0", sidebarColor: "#0f2747", fontFamily: "IBM Plex Sans Arabic", fontSize: "medium", showMenuIcons: true };
const LEGACY_THEME_DEFAULTS = { primaryColor: "#b5651d", sidebarColor: "#16233a", fontFamily: "Cairo" };
function getThemeSettings() {
  const saved = dbGet("themeSettings", null);
  if (!saved) return Object.assign({}, THEME_DEFAULTS);
  // مظهر محفوظ لم يُخصَّص فعلياً (ما زال على ألوان التصميم القديم الافتراضية) → يُرقّى تلقائياً للتصميم الجديد؛ أي تخصيص فعلي للألوان يبقى كما هو
  if (saved.primaryColor === LEGACY_THEME_DEFAULTS.primaryColor && saved.sidebarColor === LEGACY_THEME_DEFAULTS.sidebarColor) {
    return Object.assign({}, saved, {
      primaryColor: THEME_DEFAULTS.primaryColor,
      sidebarColor: THEME_DEFAULTS.sidebarColor,
      fontFamily: saved.fontFamily === LEGACY_THEME_DEFAULTS.fontFamily ? THEME_DEFAULTS.fontFamily : saved.fontFamily,
    });
  }
  return saved;
}
function setThemeSettings(t) {
  dbSet("themeSettings", t);
}

/* تفتيح أو تغميق لون HEX بنسبة مئوية (سالبة = تغميق، موجبة = تفتيح) */
function shadeColor(hex, percent) {
  hex = (hex || "#b5651d").replace("#", "");
  if (hex.length === 3) hex = hex.split("").map(c => c + c).join("");
  const num = parseInt(hex, 16);
  let r = (num >> 16) + Math.round(255 * percent);
  let g = ((num >> 8) & 0x00ff) + Math.round(255 * percent);
  let b = (num & 0x0000ff) + Math.round(255 * percent);
  r = Math.min(255, Math.max(0, r));
  g = Math.min(255, Math.max(0, g));
  b = Math.min(255, Math.max(0, b));
  return "#" + (0x1000000 + r * 0x10000 + g * 0x100 + b).toString(16).slice(1);
}

/* ---------- بيانات المؤسسة (تظهر في ترويسة عرض السعر النهائي) ---------- */
function getCompanyProfile() {
  return dbGet("companyProfile", {
    name: "شركة زهى الاعمال للمقاولات",
    phone: "",
    email: "",
    address: "",
    taxNumber: "",
    crNumber: "",
    contactUserId: "", // اسم المسؤول — يُختار من المستخدمين المسجلين
    logo: null, // data URL
  });
}
function setCompanyProfile(profile) {
  dbSet("companyProfile", profile);
}

/* ---------- التنبيهات ---------- */
function getNotifications() {
  return dbGet("notifications", []);
}

// targetRoles: تصل لكل المستخدمين بهذا المسمى الوظيفي. targetUserIds: تصل لمستخدمين محددين بالاسم.
function addNotification({ type, title, message, targetRoles = [], targetUserIds = [], relatedRoute }) {
  const list = getNotifications();
  list.push({
    id: uid("ntf"), type, title, message, targetRoles, targetUserIds, relatedRoute,
    createdAt: new Date().toISOString(), readBy: [],
  });
  dbSet("notifications", list);
}

function getNotificationsForUser(user) {
  if (!user) return [];
  return getNotifications()
    .filter(n => (n.targetRoles || []).includes(user.role) || (n.targetUserIds || []).includes(user.id))
    .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
}

function markNotificationRead(id, userId) {
  const list = getNotifications();
  const n = list.find(x => x.id === id);
  if (n && !n.readBy.includes(userId)) {
    n.readBy.push(userId);
    dbSet("notifications", list);
  }
}

function markAllNotificationsRead(userId, notifIds) {
  const list = getNotifications();
  let changed = false;
  notifIds.forEach(id => {
    const n = list.find(x => x.id === id);
    if (n && !n.readBy.includes(userId)) { n.readBy.push(userId); changed = true; }
  });
  if (changed) dbSet("notifications", list);
}

/* ---------- سجل العمليات (Activity Log) ---------- */
const ACTIVITY_LOG_MAX = 1000;

function logActivity(message) {
  try {
    const user = getCurrentUser();
    const log = dbGet("activityLog", []);
    log.unshift({
      id: uid("log"),
      message,
      userName: user ? user.name : "مستخدم غير معروف",
      userId: user ? user.id : "",
      createdAt: new Date().toISOString(),
    });
    if (log.length > ACTIVITY_LOG_MAX) log.length = ACTIVITY_LOG_MAX;
    dbSet("activityLog", log);
  } catch (e) {
    console.error("logActivity error", e);
  }
}

function getActivityLog() {
  return dbGet("activityLog", []);
}

function deleteActivityLogEntries(ids) {
  const log = dbGet("activityLog", []);
  dbSet("activityLog", log.filter(x => !ids.includes(x.id)));
}
