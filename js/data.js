/* =========================================================
   شركة زهى الاعمال للمقاولات - طبقة البيانات (localStorage)
   ========================================================= */

const DB_PREFIX = "zac_"; // Zaha Al-Amal Contracting

function uid(prefix = "id") {
  return prefix + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function dbGet(key, fallback) {
  try {
    const raw = localStorage.getItem(DB_PREFIX + key);
    if (raw === null) return fallback;
    return JSON.parse(raw);
  } catch (e) {
    console.error("dbGet error", key, e);
    return fallback;
  }
}

function dbSet(key, value) {
  try {
    localStorage.setItem(DB_PREFIX + key, JSON.stringify(value));
  } catch (e) {
    console.error("dbSet error", key, e);
    alert("تعذر حفظ البيانات محلياً (قد تكون المساحة ممتلئة بسبب حجم الصور المرفوعة).");
  }
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

function getCurrentUser() {
  return dbGet("currentUser", null);
}
function setCurrentUser(u) {
  dbSet("currentUser", u);
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
