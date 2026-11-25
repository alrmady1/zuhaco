/* =========================================================
   الإعدادات ← صفحة العرض LAND CODE
   التحكم الكامل بصفحة العرض العامة (/landcode/):
   - الطلبات الواردة من نموذج "اترك بياناتك" (جدول landing_leads عبر /api/landing-leads)
   - الهوية وبيانات التواصل والألوان والشعار
   - محتوى الأقسام وإظهارها/إخفاؤها
   يُحفظ المحتوى في المفتاح "landingSettings" (نفس آلية dbSet في بقية النظام)
   وتقرؤه الصفحة العامة عبر /api/landing بلا مصادقة.
   ========================================================= */

let LANDING_SUBTAB = "leads"; // leads | brand | content
let LANDING_DRAFT = null;
let LANDING_DIRTY = false;
let LANDING_LEADS = null;      // null = لم تُحمَّل بعد
let LANDING_LEADS_ERROR = "";
let LANDING_LEADS_FILTER = "";

const LANDING_PUBLIC_PATH = "/landcode/";

function landingEsc(v) {
  return String(v == null ? "" : v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function landingGet(obj, path) {
  return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
}
function landingSet(obj, path, val) {
  const keys = path.split(".");
  let o = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (o[keys[i]] == null || typeof o[keys[i]] !== "object") o[keys[i]] = {};
    o = o[keys[i]];
  }
  o[keys[keys.length - 1]] = val;
}
function landingSaWhatsapp(phone) {
  let d = String(phone || "").replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("05")) d = "966" + d.slice(1);
  else if (d.length === 9 && d.startsWith("5")) d = "966" + d;
  return d;
}

/* تصغير الصور قبل حفظها داخل الإعدادات حتى لا تتضخم البيانات */
function landingCompressImage(file, maxW, quality, keepPng) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const scale = Math.min(1, maxW / img.width);
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        const ctx = c.getContext("2d");
        if (!keepPng) { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height); }
        ctx.drawImage(img, 0, 0, c.width, c.height);
        resolve(keepPng ? c.toDataURL("image/png") : c.toDataURL("image/jpeg", quality || 0.8));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function landingEnsureDraft() {
  if (!LANDING_DRAFT) {
    LANDING_DRAFT = mergeLandingSettings(dbGet("landingSettings", null));
    LANDING_DIRTY = false;
  }
  return LANDING_DRAFT;
}

/* ---------- عناصر النموذج ---------- */
function lsField(label, path, opts) {
  opts = opts || {};
  const v = landingGet(LANDING_DRAFT, path);
  const span = opts.span2 ? ' style="grid-column:1/-1"' : "";
  const hint = opts.hint ? `<div class="hint">${opts.hint}</div>` : "";
  const dir = opts.ltr ? ' dir="ltr" style="text-align:left"' : "";
  let input;
  if (opts.type === "textarea") input = `<textarea data-path="${path}" rows="${opts.rows || 3}">${landingEsc(v)}</textarea>`;
  else if (opts.type === "lines") input = `<textarea data-path="${path}" data-lines="1" rows="${opts.rows || 4}">${landingEsc((v || []).join("\n"))}</textarea>`;
  else if (opts.type === "color") input = `<div style="display:flex;gap:8px;align-items:center"><input type="color" data-path="${path}" value="${landingEsc(v)}" style="width:52px;height:38px;padding:2px"><input data-path="${path}" value="${landingEsc(v)}" dir="ltr" style="flex:1"></div>`;
  else input = `<input data-path="${path}" value="${landingEsc(v)}"${dir}${opts.placeholder ? ` placeholder="${landingEsc(opts.placeholder)}"` : ""}>`;
  return `<div class="field"${span}><label>${label}</label>${input}${hint}</div>`;
}

function lsImageField(label, path, opts) {
  opts = opts || {};
  const v = landingGet(LANDING_DRAFT, path) || "";
  const isData = v.startsWith("data:");
  return `
    <div class="field" ${opts.span2 ? 'style="grid-column:1/-1"' : ""}>
      <label>${label}</label>
      <div style="display:flex;gap:12px;align-items:flex-start;flex-wrap:wrap">
        <div style="width:${opts.square ? 72 : 120}px;height:72px;border:1px dashed var(--border);border-radius:8px;overflow:hidden;background:${opts.darkBg ? "#121212" : "#f6f3ee"};display:grid;place-items:center;flex:none">
          ${v ? `<img src="${landingEsc(v)}" style="width:100%;height:100%;object-fit:${opts.square ? "contain" : "cover"}">` : `<span class="text-muted" style="font-size:11px">${opts.emptyText || "لا توجد صورة"}</span>`}
        </div>
        <div style="flex:1;min-width:200px;display:grid;gap:6px">
          <input type="file" accept="image/*" data-img="${path}" data-maxw="${opts.maxW || 1600}" ${opts.png ? 'data-png="1"' : ""}>
          <input data-path="${path}" value="${isData ? "" : landingEsc(v)}" placeholder="${isData ? "صورة مرفوعة ✓ — أو الصق رابط صورة بدلاً منها" : "أو الصق رابط صورة (https://...)"}" dir="ltr" style="font-size:12px">
          ${v ? `<button type="button" class="btn sm danger" data-act="clearImg" data-path="${path}" style="justify-self:start">إزالة الصورة</button>` : ""}
        </div>
      </div>
      ${opts.hint ? `<div class="hint">${opts.hint}</div>` : ""}
    </div>`;
}

function lsListEditor(key, title, fields, newItem, opts) {
  opts = opts || {};
  const list = landingGet(LANDING_DRAFT, key) || [];
  return `
    <div class="ls-list">
      ${list.map((item, i) => `
        <div class="ls-item">
          <div class="ls-item-head">
            <b>${String(i + 1).padStart(2, "0")} ${landingEsc(item[fields[0].k] || "")}</b>
            <span style="display:flex;gap:4px">
              <button type="button" class="btn-icon" title="أعلى" data-act="up" data-list="${key}" data-i="${i}" ${i === 0 ? "disabled" : ""}>${svgIcon("chevron-up")}</button>
              <button type="button" class="btn-icon" title="أسفل" data-act="down" data-list="${key}" data-i="${i}" ${i === list.length - 1 ? "disabled" : ""}>${svgIcon("chevron-down")}</button>
              <button type="button" class="btn-icon danger" title="حذف" data-act="del" data-list="${key}" data-i="${i}">${ICON_DELETE}</button>
            </span>
          </div>
          <div class="grid cols-${opts.cols || 3}">
            ${fields.map(f => f.image
              ? lsImageField(f.label, `${key}.${i}.${f.k}`, { span2: true, maxW: f.maxW || 1400, square: f.square, png: f.png })
              : lsField(f.label, `${key}.${i}.${f.k}`, { type: f.type, span2: f.span2, ltr: f.ltr, rows: 2 })).join("")}
          </div>
        </div>`).join("")}
      <button type="button" class="btn sm" data-act="add" data-list="${key}" data-new='${landingEsc(JSON.stringify(newItem))}'>${svgIcon("plus")} إضافة ${title}</button>
    </div>`;
}

function lsSectionCard(id, title, desc, inner) {
  const on = id ? !!LANDING_DRAFT.sections[id] : null;
  return `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:10px">
        <div><h3 style="margin:0">${title}</h3>${desc ? `<div class="text-muted" style="font-size:12.5px">${desc}</div>` : ""}</div>
        ${id ? `<label class="ls-switch"><input type="checkbox" data-path="sections.${id}" ${on ? "checked" : ""}><span></span><em>${on ? "ظاهر" : "مخفي"}</em></label>` : ""}
      </div>
      ${inner}
    </div>`;
}

/* ---------- التبويب الرئيسي ---------- */
function renderLandingTab(el) {
  landingEnsureDraft();
  const newCount = (LANDING_LEADS || []).filter(l => l.status === "جديد").length;
  const url = location.origin + LANDING_PUBLIC_PATH;
  el.innerHTML = `
    <style>
      .ls-top{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:14px}
      .ls-sub{display:flex;gap:6px;flex-wrap:wrap}
      .ls-sub button{border:1px solid var(--border);background:var(--surface);padding:8px 14px;border-radius:30px;cursor:pointer;font-family:inherit;font-size:13px;font-weight:700;color:var(--text-muted)}
      .ls-sub button.active{background:var(--primary);border-color:var(--primary);color:#fff}
      .ls-badge{display:inline-block;min-width:18px;padding:0 6px;border-radius:10px;background:#e5484d;color:#fff;font-size:11px;margin-inline-start:6px;line-height:18px}
      .ls-savebar{position:sticky;top:0;z-index:5;display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:10px 14px;margin-bottom:16px;box-shadow:var(--shadow)}
      .ls-dirty{color:var(--warning);font-weight:700;font-size:12.5px}
      .ls-list{display:grid;gap:12px}
      .ls-item{border:1px solid var(--border);border-radius:10px;padding:12px 14px;background:rgba(0,0,0,.015)}
      .ls-item-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;font-size:13px}
      .ls-item .field{margin-bottom:8px}
      .ls-switch{display:inline-flex;align-items:center;gap:8px;cursor:pointer;user-select:none}
      .ls-switch input{display:none}
      .ls-switch span{width:40px;height:22px;border-radius:20px;background:#cfd4dc;position:relative;transition:.2s}
      .ls-switch span::after{content:"";position:absolute;top:3px;right:3px;width:16px;height:16px;border-radius:50%;background:#fff;transition:.2s}
      .ls-switch input:checked+span{background:#1fa855}
      .ls-switch input:checked+span::after{right:21px}
      .ls-switch em{font-style:normal;font-size:12px;color:var(--text-muted);min-width:34px}
      .ls-link{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:13px}
      .ls-link code{background:var(--primary-light);color:var(--primary-dark);padding:4px 10px;border-radius:6px;direction:ltr}
      .ls-leads td{vertical-align:top}
      .ls-leads select{padding:4px 6px;font-size:12px}
    </style>
    <div class="card" style="display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap">
      <div style="display:flex;align-items:center;gap:14px">
        <div style="width:46px;height:50px;color:var(--text)">${LANDCODE_LOGO_SVG}</div>
        <div>
          <h3 style="margin:0">صفحة العرض — ${landingEsc(LANDING_DRAFT.brandName)}</h3>
          <div class="ls-link"><span class="text-muted">رابط الصفحة:</span><code>${landingEsc(url)}</code>
            <button type="button" class="btn sm" id="ls_copy">${svgIcon("copy")} نسخ</button>
            <a class="btn sm" href="${LANDING_PUBLIC_PATH}" target="_blank" rel="noopener">${ICON_VIEW} فتح الصفحة</a>
          </div>
        </div>
      </div>
      <label class="ls-switch" title="إيقاف الصفحة يعرض للزوار رسالة (قيد التحديث)"><input type="checkbox" id="ls_enabled" ${LANDING_DRAFT.enabled !== false ? "checked" : ""}><span></span><em>${LANDING_DRAFT.enabled !== false ? "الصفحة منشورة" : "الصفحة متوقفة"}</em></label>
    </div>
    <div class="ls-top">
      <div class="ls-sub">
        <button type="button" data-sub="leads" class="${LANDING_SUBTAB === "leads" ? "active" : ""}">الطلبات الواردة${newCount ? `<span class="ls-badge">${newCount}</span>` : ""}</button>
        <button type="button" data-sub="brand" class="${LANDING_SUBTAB === "brand" ? "active" : ""}">الهوية والتواصل</button>
        <button type="button" data-sub="content" class="${LANDING_SUBTAB === "content" ? "active" : ""}">محتوى الأقسام</button>
      </div>
    </div>
    <div id="lsBody"></div>
  `;

  el.querySelectorAll("[data-sub]").forEach(b => b.onclick = () => { LANDING_SUBTAB = b.dataset.sub; renderLandingTab(el); });
  el.querySelector("#ls_copy").onclick = () => {
    (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(() => toast("تم نسخ الرابط"), () => toast(url));
  };
  el.querySelector("#ls_enabled").onchange = (e) => {
    LANDING_DRAFT.enabled = e.target.checked;
    landingSave(el, e.target.checked ? "تم نشر صفحة العرض" : "تم إيقاف صفحة العرض مؤقتاً");
  };

  const body = el.querySelector("#lsBody");
  if (LANDING_SUBTAB === "leads") renderLandingLeads(body, el);
  else renderLandingEditor(body, el);
}

function landingSave(rootEl, msg) {
  dbSet("landingSettings", JSON.parse(JSON.stringify(LANDING_DRAFT)));
  LANDING_DIRTY = false;
  logActivity("تم تحديث إعدادات صفحة العرض LAND CODE");
  toast(msg || "تم حفظ صفحة العرض — تظهر التعديلات للزوار خلال دقيقة تقريباً");
  renderLandingTab(rootEl);
}

/* ---------- محرر المحتوى (الهوية + الأقسام) ---------- */
function renderLandingEditor(body, rootEl) {
  const D = LANDING_DRAFT;
  const saveBar = `
    <div class="ls-savebar">
      <span>${LANDING_DIRTY ? `<span class="ls-dirty">${svgIcon("alert", 14)} توجد تعديلات غير محفوظة</span>` : `<span class="text-muted" style="font-size:12.5px">كل التعديلات محفوظة</span>`}</span>
      <span style="display:flex;gap:8px">
        <button type="button" class="btn sm" id="ls_reset">${LANDING_DIRTY ? "تجاهل التعديلات" : "استعادة المحتوى الافتراضي"}</button>
        <button type="button" class="btn primary" id="ls_save">${svgIcon("save")} حفظ ونشر</button>
      </span>
    </div>`;

  let html = saveBar;
  if (LANDING_SUBTAB === "brand") {
    html += lsSectionCard(null, "الهوية التجارية", "الاسم التجاري والشعار والألوان", `
      <div class="grid cols-3">
        ${lsField("الاسم التجاري", "brandName", { ltr: true })}
        ${lsField("الشعار النصي (تحت الاسم)", "tagline", { ltr: true })}
        ${lsField("الاسم القانوني للشركة", "legalName")}
        ${lsField("اللون المميز", "accent", { type: "color" })}
        ${lsField("لون الخلفيات الداكنة", "dark", { type: "color" })}
        ${lsField("المدينة", "city")}
        ${lsImageField("الشعار (اختياري)", "logo", { span2: true, square: true, png: true, maxW: 600, darkBg: true, emptyText: "شعار LAND CODE الافتراضي", hint: "يُفضّل شعار PNG بخلفية شفافة ولون أبيض لأنه يظهر على خلفية داكنة. إن تُرك فارغاً يُستخدم شعار المكعب المرسوم." })}
      </div>`);
    html += lsSectionCard(null, "بيانات التواصل", "تظهر في الأزرار والتذييل ونموذج الطلب", `
      <div class="grid cols-3">
        ${lsField("رقم واتساب", "whatsapp", { ltr: true, placeholder: "9665XXXXXXXX", hint: "بالصيغة الدولية بدون + أو أصفار" })}
        ${lsField("رقم الجوال للاتصال", "phone", { ltr: true, placeholder: "05XXXXXXXX" })}
        ${lsField("البريد الإلكتروني", "email", { ltr: true })}
        ${lsField("رسالة واتساب الافتراضية", "whatsappMessage", { span2: true })}
        ${lsField("الموقع الإلكتروني", "website", { ltr: true })}
        ${lsField("العنوان", "address", { span2: true })}
        ${lsField("رقم السجل التجاري", "crNumber", { ltr: true })}
        ${lsField("الرقم الضريبي", "vatNumber", { ltr: true })}
      </div>
      <button type="button" class="btn sm" id="ls_fromCompany">نسخ البيانات من (بيانات المؤسسة)</button>`);
    html += lsSectionCard(null, "حسابات التواصل الاجتماعي", "اترك الحقل فارغاً لإخفاء الأيقونة", `
      <div class="grid cols-4">
        ${lsField("Instagram", "social.instagram", { ltr: true, placeholder: "https://instagram.com/..." })}
        ${lsField("X (تويتر)", "social.x", { ltr: true, placeholder: "https://x.com/..." })}
        ${lsField("TikTok", "social.tiktok", { ltr: true, placeholder: "https://tiktok.com/@..." })}
        ${lsField("Snapchat", "social.snapchat", { ltr: true, placeholder: "https://snapchat.com/add/..." })}
      </div>`);
    html += lsSectionCard(null, "محركات البحث وسياسة الخصوصية", "", `
      <div class="grid cols-2">
        ${lsField("عنوان الصفحة (Title)", "seo.title", { span2: true })}
        ${lsField("وصف الصفحة (Description)", "seo.description", { type: "textarea", span2: true, rows: 2 })}
        ${lsField("نص سياسة الخصوصية", "privacyText", { type: "textarea", span2: true, rows: 4 })}
      </div>`);
  } else {
    html += lsSectionCard(null, "الواجهة الرئيسية (Hero)", "أول ما يراه الزائر", `
      <div class="grid cols-2">
        ${lsField("عنوان صغير بالإنجليزي", "hero.eyebrow", { ltr: true })}
        ${lsField("العنوان الرئيسي", "hero.title")}
        ${lsField("الوصف", "hero.subtitle", { type: "textarea", span2: true, rows: 2 })}
        ${lsField("الشعار الترويجي", "hero.tagline", { span2: true })}
        ${lsField("نص زر واتساب", "hero.ctaWhatsapp")}
        ${lsField("نص زر النموذج", "hero.ctaForm")}
        ${lsImageField("صورة الخلفية", "hero.image", { span2: true, maxW: 1920, hint: "صورة أفقية عالية الجودة (يتم تصغيرها تلقائياً)" })}
      </div>`);
    html += lsSectionCard("services", "الخدمات", "", `
      <div class="grid cols-2">${lsField("عنوان القسم", "servicesTitle")}${lsField("عنوان صغير بالإنجليزي", "servicesEyebrow", { ltr: true })}</div>
      ${lsListEditor("services", "خدمة", [{ k: "title", label: "اسم الخدمة" }, { k: "en", label: "الاسم بالإنجليزي", ltr: true }, { k: "desc", label: "وصف مختصر" }], { title: "", en: "", desc: "" })}`);
    html += lsSectionCard("gallery", "معرض الأعمال", "يُفضّل 6 صور (أو مضاعفاتها) لأفضل ترتيب", `
      <div class="grid cols-2">${lsField("عنوان القسم", "galleryTitle")}${lsField("عنوان صغير بالإنجليزي", "galleryEyebrow", { ltr: true })}</div>
      ${lsListEditor("gallery", "صورة", [{ k: "title", label: "العنوان" }, { k: "en", label: "بالإنجليزي", ltr: true }, { k: "image", label: "الصورة", image: true }], { title: "", en: "", image: "" }, { cols: 2 })}`);
    html += lsSectionCard("execution", "أعمالنا — قسم التنفيذ", "صور مصغرة لأعمال التنفيذ الفعلية في المواقع، يكبّرها الزائر بالضغط عليها — لا يظهر القسم إلا بعد إضافة صور", `
      <div class="grid cols-2">${lsField("عنوان القسم", "executionTitle")}${lsField("عنوان صغير بالإنجليزي", "executionEyebrow", { ltr: true })}</div>
      <div class="field" style="border:1px dashed var(--border);border-radius:10px;padding:12px 14px;margin-bottom:12px">
        <label>إضافة عدة صور دفعة واحدة</label>
        <input type="file" accept="image/*" multiple data-bulk="execution">
        <div class="hint">يمكنك اختيار عدة صور معاً — تُصغَّر تلقائياً وتُضاف إلى القائمة أدناه، ثم اكتب عنواناً لكل صورة إن رغبت.</div>
      </div>
      ${lsListEditor("execution", "صورة", [{ k: "title", label: "العنوان (اختياري)" }, { k: "image", label: "الصورة", image: true, maxW: 1200 }], { title: "", image: "" }, { cols: 2 })}`);
    html += lsSectionCard("stats", "الأرقام والإحصائيات", "اكتب أرقاماً حقيقية فقط قبل إظهار هذا القسم", `
      ${lsListEditor("stats", "رقم", [{ k: "value", label: "الرقم", ltr: true }, { k: "label", label: "الوصف" }], { value: "", label: "" }, { cols: 2 })}`);
    html += lsSectionCard("form", "نموذج الطلب (اترك بياناتك)", "الطلبات تصل إلى تبويب (الطلبات الواردة)", `
      <div class="grid cols-2">
        ${lsField("عنوان صغير بالإنجليزي", "form.eyebrow", { ltr: true })}
        ${lsField("عنوان النموذج", "form.title")}
        ${lsField("نص تعريفي", "form.intro", { span2: true })}
        ${lsField("المدن (سطر لكل مدينة)", "form.cities", { type: "lines" })}
        ${lsField("أنواع المشاريع (سطر لكل نوع)", "form.projectTypes", { type: "lines" })}
        ${lsField("خيارات المطلوب (سطر لكل خيار)", "form.needs", { type: "lines" })}
        ${lsField("نص الموافقة على التواصل", "form.consent", { type: "textarea", rows: 2 })}
        ${lsField("نص زر الإرسال", "form.submit")}
        ${lsField("رسالة نجاح الإرسال", "form.success")}
      </div>`);
    html += lsSectionCard("process", "كيف نشتغل (الخطوات)", "", `
      <div class="grid cols-2">${lsField("عنوان القسم", "processTitle")}${lsField("عنوان صغير بالإنجليزي", "processEyebrow", { ltr: true })}</div>
      ${lsListEditor("process", "خطوة", [{ k: "title", label: "العنوان" }, { k: "desc", label: "الوصف", span2: true }], { title: "", desc: "" }, { cols: 3 })}`);
    html += lsSectionCard("clients", "شعارات العملاء", "أضف شعارات العملاء بعد موافقتهم", `
      <div class="grid cols-2">${lsField("عنوان القسم", "clientsTitle")}</div>
      ${lsListEditor("clients", "عميل", [{ k: "name", label: "اسم العميل" }, { k: "logo", label: "الشعار", image: true, png: true, maxW: 500, square: true }], { name: "", logo: "" }, { cols: 2 })}`);
    html += lsSectionCard("faq", "الأسئلة الشائعة", "", `
      <div class="grid cols-2">${lsField("عنوان القسم", "faqTitle")}</div>
      ${lsListEditor("faq", "سؤال", [{ k: "q", label: "السؤال", span2: true }, { k: "a", label: "الإجابة", type: "textarea", span2: true }], { q: "", a: "" }, { cols: 2 })}`);
  }
  body.innerHTML = html;

  const markDirty = () => {
    if (!LANDING_DIRTY) {
      LANDING_DIRTY = true;
      const bar = body.querySelector(".ls-savebar span");
      if (bar) bar.innerHTML = `<span class="ls-dirty">${svgIcon("alert", 14)} توجد تعديلات غير محفوظة</span>`;
      const rb = body.querySelector("#ls_reset"); if (rb) rb.textContent = "تجاهل التعديلات";
    }
  };
  const rerender = () => { const y = window.scrollY; renderLandingEditor(body, rootEl); window.scrollTo(0, y); };

  body.oninput = (e) => {
    const t = e.target;
    if (!t.dataset.path || t.type === "file") return;
    let val = t.type === "checkbox" ? t.checked : t.value;
    if (t.dataset.lines) val = t.value.split("\n").map(s => s.trim()).filter(Boolean);
    landingSet(LANDING_DRAFT, t.dataset.path, val);
    if (t.type === "color") { const twin = t.parentElement.querySelector('input:not([type=color])'); if (twin) twin.value = val; }
    if (t.type === "checkbox") { const em = t.parentElement.querySelector("em"); if (em) em.textContent = t.checked ? "ظاهر" : "مخفي"; }
    markDirty();
  };

  body.onchange = async (e) => {
    const t = e.target;
    if (t.dataset.bulk) {
      const files = Array.from(t.files || []);
      if (!files.length) return;
      const list = landingGet(LANDING_DRAFT, t.dataset.bulk);
      let added = 0;
      for (const file of files) {
        try { list.push({ title: "", image: await landingCompressImage(file, 1200, 0.8, false) }); added++; }
        catch (err) { /* تجاهل الملف غير الصالح ومتابعة البقية */ }
      }
      if (added) { LANDING_DIRTY = true; rerender(); toast(`تمت إضافة ${added} صورة — اضغط (حفظ ونشر)`); }
      else toast("تعذّر قراءة الصور");
      return;
    }
    if (t.type === "url" || !t.dataset.img) return;
    const file = t.files && t.files[0];
    if (!file) return;
    try {
      const png = !!t.dataset.png && /png|svg/i.test(file.type);
      const data = await landingCompressImage(file, Number(t.dataset.maxw) || 1600, 0.8, png);
      landingSet(LANDING_DRAFT, t.dataset.img, data);
      LANDING_DIRTY = true;
      rerender();
    } catch (err) {
      toast("تعذّر قراءة الصورة");
    }
  };

  body.onclick = (e) => {
    const b = e.target.closest("[data-act]");
    if (!b) return;
    const act = b.dataset.act;
    if (act === "clearImg") { landingSet(LANDING_DRAFT, b.dataset.path, ""); LANDING_DIRTY = true; return rerender(); }
    const list = landingGet(LANDING_DRAFT, b.dataset.list);
    const i = Number(b.dataset.i);
    if (act === "add") list.push(JSON.parse(b.dataset.new));
    else if (act === "del") { if (!confirm("حذف هذا العنصر؟")) return; list.splice(i, 1); }
    else if (act === "up" && i > 0) [list[i - 1], list[i]] = [list[i], list[i - 1]];
    else if (act === "down" && i < list.length - 1) [list[i + 1], list[i]] = [list[i], list[i + 1]];
    LANDING_DIRTY = true;
    rerender();
  };

  body.querySelector("#ls_save").onclick = () => landingSave(rootEl);
  body.querySelector("#ls_reset").onclick = () => {
    if (LANDING_DIRTY) {
      if (!confirm("تجاهل كل التعديلات غير المحفوظة؟")) return;
      LANDING_DRAFT = null;
      landingEnsureDraft();
    } else {
      if (!confirm("استعادة المحتوى الافتراضي لصفحة العرض؟ (لن يُحفظ إلا بعد الضغط على حفظ ونشر)")) return;
      const keep = { whatsapp: D.whatsapp, phone: D.phone, email: D.email, logo: D.logo, crNumber: D.crNumber, vatNumber: D.vatNumber, address: D.address, website: D.website, social: D.social };
      LANDING_DRAFT = Object.assign(mergeLandingSettings(null), keep);
      LANDING_DIRTY = true;
    }
    renderLandingTab(rootEl);
  };
  const fromCompany = body.querySelector("#ls_fromCompany");
  if (fromCompany) fromCompany.onclick = () => {
    const p = getCompanyProfile() || {};
    if (p.phone) { D.phone = p.phone; if (!D.whatsapp) D.whatsapp = landingSaWhatsapp(p.phone); }
    if (p.email) D.email = p.email;
    if (p.address) D.address = p.address;
    if (p.crNumber) D.crNumber = p.crNumber;
    if (p.taxNumber) D.vatNumber = p.taxNumber;
    if (p.name) D.legalName = p.name;
    LANDING_DIRTY = true;
    rerender();
    toast("تم نسخ بيانات المؤسسة — اضغط حفظ ونشر");
  };
}

/* ---------- الطلبات الواردة ---------- */
async function loadLandingLeads() {
  try {
    const res = await fetch("/api/landing-leads", { headers: authHeader() });
    if (!res.ok) throw new Error("http " + res.status);
    LANDING_LEADS = await res.json();
    LANDING_LEADS_ERROR = "";
  } catch (e) {
    LANDING_LEADS = LANDING_LEADS || [];
    LANDING_LEADS_ERROR = "تعذّر تحميل الطلبات من الخادم — تأكد من الاتصال (تعمل هذه الميزة على النسخة المنشورة على Vercel).";
  }
}

async function landingLeadRequest(method, body, query) {
  const res = await fetch("/api/landing-leads" + (query || ""), {
    method,
    headers: Object.assign({ "Content-Type": "application/json" }, authHeader()),
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error("http " + res.status);
}

function renderLandingLeads(body, rootEl) {
  if (LANDING_LEADS === null) {
    body.innerHTML = `<div class="card text-muted">جارٍ تحميل الطلبات…</div>`;
    loadLandingLeads().then(() => renderLandingTab(rootEl));
    return;
  }
  const all = LANDING_LEADS;
  const list = LANDING_LEADS_FILTER ? all.filter(l => l.status === LANDING_LEADS_FILTER) : all;
  const counts = {};
  all.forEach(l => { counts[l.status] = (counts[l.status] || 0) + 1; });

  body.innerHTML = `
    ${LANDING_LEADS_ERROR ? `<div class="card" style="background:#fdf6ec;border-color:#f2dfb8;font-size:13px">${svgIcon("alert", 15)} ${LANDING_LEADS_ERROR}</div>` : ""}
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px">
        <div class="ls-sub">
          <button type="button" data-filter="" class="${!LANDING_LEADS_FILTER ? "active" : ""}">الكل (${all.length})</button>
          ${LANDING_LEAD_STATUSES.map(s => `<button type="button" data-filter="${s}" class="${LANDING_LEADS_FILTER === s ? "active" : ""}">${s} (${counts[s] || 0})</button>`).join("")}
        </div>
        <button type="button" class="btn sm" id="ls_reload">تحديث</button>
      </div>
      ${list.length ? `
      <div style="overflow-x:auto">
        <table class="data-table ls-leads">
          <thead><tr><th>التاريخ</th><th>العميل</th><th>المدينة / الموقع</th><th>المشروع</th><th>التفاصيل</th><th>الحالة</th><th>ملاحظة</th><th></th></tr></thead>
          <tbody>
            ${list.map(l => {
              const wa = landingSaWhatsapp(l.phone);
              const loc = String(l.location || "");
              const locHtml = /^https?:\/\//i.test(loc) ? `<a href="${landingEsc(loc)}" target="_blank" rel="noopener">رابط الموقع</a>` : landingEsc(loc);
              return `<tr>
                <td style="white-space:nowrap">${fmtDate(l.createdAt)}<div class="text-muted" style="font-size:11px">${new Date(l.createdAt).toLocaleTimeString("ar-SA-u-nu-latn", { hour: "2-digit", minute: "2-digit" })}</div></td>
                <td><b>${landingEsc(l.name)}</b><div style="font-size:12px;direction:ltr;text-align:right"><a href="tel:${landingEsc(l.phone)}">${landingEsc(l.phone)}</a></div>
                  ${wa ? `<a class="btn sm" style="margin-top:4px;color:#1a8f4a" href="https://wa.me/${wa}" target="_blank" rel="noopener">واتساب</a>` : ""}</td>
                <td>${landingEsc(l.city)}${loc ? `<div style="font-size:12px">${locHtml}</div>` : ""}</td>
                <td>${landingEsc(l.projectType)}<div class="text-muted" style="font-size:12px">${landingEsc(l.need)}${l.area ? " — " + landingEsc(l.area) + " م²" : ""}</div></td>
                <td style="max-width:260px;font-size:12.5px;white-space:pre-wrap">${landingEsc(l.details) || "-"}</td>
                <td><select data-status="${landingEsc(l.id)}">${LANDING_LEAD_STATUSES.map(s => `<option ${l.status === s ? "selected" : ""}>${s}</option>`).join("")}</select></td>
                <td style="max-width:180px;font-size:12px">${landingEsc(l.note) || ""} <button type="button" class="btn-icon" title="تعديل الملاحظة" data-note="${landingEsc(l.id)}">${ICON_EDIT}</button></td>
                <td style="white-space:nowrap">
                  <button type="button" class="btn sm" data-toclient="${landingEsc(l.id)}" title="إضافة إلى قائمة العملاء">${svgIcon("user")} عميل</button>
                  <button type="button" class="btn-icon danger" data-dellead="${landingEsc(l.id)}" title="حذف">${ICON_DELETE}</button>
                </td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>` : `<div class="text-muted" style="padding:30px;text-align:center">لا توجد طلبات ${LANDING_LEADS_FILTER ? `بحالة "${LANDING_LEADS_FILTER}"` : "حتى الآن"}</div>`}
    </div>`;

  const findLead = (id) => all.find(l => l.id === id);
  body.querySelectorAll("[data-filter]").forEach(b => b.onclick = () => { LANDING_LEADS_FILTER = b.dataset.filter; renderLandingLeads(body, rootEl); });
  body.querySelector("#ls_reload").onclick = () => { LANDING_LEADS = null; renderLandingTab(rootEl); };

  body.querySelectorAll("[data-status]").forEach(sel => sel.onchange = async () => {
    const lead = findLead(sel.dataset.status);
    const prev = lead.status;
    try {
      await landingLeadRequest("PATCH", { id: lead.id, status: sel.value });
      lead.status = sel.value;
      toast("تم تحديث حالة الطلب");
      renderLandingTab(rootEl);
    } catch (e) { sel.value = prev; toast("تعذّر تحديث الحالة"); }
  });

  body.querySelectorAll("[data-note]").forEach(b => b.onclick = async () => {
    const lead = findLead(b.dataset.note);
    const note = prompt("ملاحظة على الطلب:", lead.note || "");
    if (note === null) return;
    try {
      await landingLeadRequest("PATCH", { id: lead.id, note });
      lead.note = note;
      renderLandingLeads(body, rootEl);
    } catch (e) { toast("تعذّر حفظ الملاحظة"); }
  });

  body.querySelectorAll("[data-dellead]").forEach(b => b.onclick = async () => {
    const lead = findLead(b.dataset.dellead);
    if (!confirm(`حذف طلب "${lead.name}" نهائياً؟`)) return;
    try {
      await landingLeadRequest("DELETE", null, "?id=" + encodeURIComponent(lead.id));
      LANDING_LEADS = all.filter(l => l.id !== lead.id);
      logActivity(`تم حذف طلب صفحة العرض من "${lead.name}"`);
      renderLandingTab(rootEl);
    } catch (e) { toast("تعذّر حذف الطلب"); }
  });

  body.querySelectorAll("[data-toclient]").forEach(b => b.onclick = () => {
    const lead = findLead(b.dataset.toclient);
    const clients = dbGet("clients", []);
    const digits = String(lead.phone || "").replace(/\D/g, "").slice(-9);
    const dup = digits && clients.find(c => String(c.phone || "").replace(/\D/g, "").slice(-9) === digits);
    if (dup) { toast(`العميل موجود مسبقاً: ${dup.name}`); return; }
    const notes = [
      "مصدر العميل: صفحة العرض LAND CODE",
      lead.projectType && "نوع المشروع: " + lead.projectType,
      lead.need && "المطلوب: " + lead.need,
      lead.area && "المساحة: " + lead.area + " م²",
      lead.city && "المدينة: " + lead.city,
      lead.location && "الموقع: " + lead.location,
      lead.details,
    ].filter(Boolean).join("\n");
    clients.push({
      id: uid("cl"), name: lead.name, clientType: "فرد", phone: lead.phone, email: "", district: "",
      taxNumber: "", nationalAddress: "", contactPersonName: "", contactPersonTitle: "", contactPersonPhone: "",
      notes, createdAt: new Date().toISOString(),
    });
    dbSet("clients", clients);
    logActivity(`تم إضافة عميل جديد "${lead.name}" من طلبات صفحة العرض`);
    toast("تمت إضافة العميل إلى قائمة العملاء");
    if (lead.status === "جديد") {
      landingLeadRequest("PATCH", { id: lead.id, status: "تم التواصل" }).then(() => { lead.status = "تم التواصل"; renderLandingTab(rootEl); }).catch(() => {});
    }
  });
}
