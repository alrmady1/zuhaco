/* =========================================================
   عروض الأسعار
   ========================================================= */

let QUOTES_VIEW = "list"; // list | builder | view
let DRAFT_QUOTE = null;
let VIEW_QUOTE_ID = null;
let QUOTE_CLIENT_SEARCH = "";
let QUOTE_SHOW_ADD_CLIENT = false;
let DRAG_ITEM_SRC = null; // {ci, ii} أثناء سحب بند
let DRAG_CAT_SRC = null; // ci أثناء سحب تصنيف كامل
let QUOTE_EDIT_RETURN = "list"; // الوجهة بعد حفظ/إلغاء تعديل عرض سعر محفوظ: list | view

const DEFAULT_NOTE_VALIDITY = "هذا العرض صالح لمدة أسبوعين من تاريخه";
const DEFAULT_NOTE_PAYMENT = "يتم تحويل الدفعة الأولى على حساب الشركة - شركة زهى الاعمال - البنك الأهلي - SA42 1000 0023 1000 0089 8800";

function newDraftQuote() {
  return {
    id: null,
    client: null, // { id?, name, phone, email, taxNumber }
    projectName: "",
    location: "",
    showCompanyHeader: true,
    noteValidity: DEFAULT_NOTE_VALIDITY,
    notePayment: DEFAULT_NOTE_PAYMENT,
    categories: [], // {catId, catName, items:[{itemId,name,unit,qty,supply:{included,price},install:{included,price}}]}
  };
}

function itemCostUnit(it) {
  // سعر التكلفة للوحدة (توريد + تركيب المفعّلين) — لا يظهر للعميل أبداً
  const s = it.supply && it.supply.included ? Number(it.supply.price) || 0 : 0;
  const i = it.install && it.install.included ? Number(it.install.price) || 0 : 0;
  return s + i;
}

function itemMargin(it) {
  // العروض المحفوظة قبل إضافة ميزة الربح لا تملك هذا الحقل إطلاقاً — تُعامل كنسبة 0%
  // حتى لا يتغيّر إجمالي عرض سعر صادر مسبقاً بأثر رجعي. أي بند جديد يُضاف بعد هذا التحديث
  // يحمل القيمة صراحة (افتراضياً 30%).
  if (it.profitMargin === undefined || it.profitMargin === null || it.profitMargin === "") return 0;
  const m = Number(it.profitMargin);
  return isNaN(m) ? 0 : m;
}

function itemSellUnit(it) {
  // سعر البيع النهائي للوحدة = سعر التكلفة + نسبة الربح
  return itemCostUnit(it) * (1 + itemMargin(it) / 100);
}

function itemUnitPrice(it) {
  // السعر النهائي للوحدة كما يظهر للعميل. التعديل اليدوي (priceOverride) — إن وُجد — له
  // الأولوية دائماً (يُستخدم عند تعديل السعر مباشرة من صفحة إصدار العرض)، ثم بنية
  // التوريد/تركيب + الربح، ثم البنية القديمة (سعر واحد) للتوافق مع بيانات سابقة.
  if (it.priceOverride !== undefined && it.priceOverride !== null && it.priceOverride !== "") {
    return Number(it.priceOverride) || 0;
  }
  if (it.supply || it.install) return itemSellUnit(it);
  return Number(it.price) || 0;
}

function itemTotal(it) {
  return (Number(it.qty) || 0) * itemUnitPrice(it);
}

/* بند بسعر نهائي ثابت (مقطوعية، أو بند عُدّل سعره يدوياً، أو بند قديم بسعر واحد) — لا يُحسب من تكلفة التوريد/التركيب والربح */
function isFixedPriceItem(it) {
  if (it.lumpSum) return true;
  if (it.priceOverride !== undefined && it.priceOverride !== null && it.priceOverride !== "") return true;
  return !(it.supply || it.install);
}

function supplyInstallLabel(it) {
  const s = it.supply && it.supply.included;
  const i = it.install && it.install.included;
  if (s && i) return "توريد وتركيب";
  if (s) return "توريد فقط";
  if (i) return "تركيب فقط";
  return "";
}

function quoteTotal(q) {
  return q.categories.reduce((s, c) => s + c.items.reduce((si, it) => si + itemTotal(it), 0), 0);
}

function renderQuotes(el) {
  if (QUOTES_VIEW === "builder") return renderQuoteBuilder(el);
  if (QUOTES_VIEW === "view") return renderQuoteView(el);
  renderQuotesList(el);
}

function renderQuotesList(el) {
  const quotes = dbGet("quotes", []).slice().sort((a, b) => (b.date > a.date ? 1 : -1));
  const role = (getCurrentUser() || {}).role;
  const canAddQuote = hasPermission(role, "quotes_add");
  const canDeleteQuote = hasPermission(role, "quotes_delete");
  el.innerHTML = `
    <div class="section-title-row">
      <div><h2>عروض الأسعار</h2><p>إدارة عروض الأسعار المرسلة للعملاء</p></div>
      ${canAddQuote ? `<button class="btn primary" id="newQuoteBtn">+ عرض سعر جديد</button>` : ""}
    </div>
    <div class="card">
      ${quotes.length ? `
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>رقم العرض</th><th>العميل</th><th>المشروع</th><th>الموقع</th><th>الإجمالي</th><th>التاريخ</th><th></th></tr></thead>
          <tbody>
            ${quotes.map(q => `
              <tr>
                <td>${q.number}</td>
                <td>${q.client.name}</td>
                <td>${q.projectName}</td>
                <td>${locationDisplay(q.location)}</td>
                <td><strong>${fmtMoney(quoteTotal(q))}</strong></td>
                <td>${fmtDate(q.date)}</td>
                <td>
                  <button class="btn-icon" data-view="${q.id}" title="عرض">${ICON_VIEW}</button>
                  ${canAddQuote ? `<button class="btn-icon" data-editq="${q.id}" title="تعديل العرض (إضافة/حذف/تعديل البنود)">${ICON_EDIT}</button>` : ""}
                  ${canDeleteQuote ? `<button class="btn-icon danger" data-del="${q.id}" title="حذف">${ICON_DELETE}</button>` : ""}
                </td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>` : `<div class="empty-state"><div class="ic">${svgIcon("file-text", 40)}</div>لا توجد عروض أسعار محفوظة بعد</div>`}
    </div>
  `;

  const newQuoteBtn = document.getElementById("newQuoteBtn");
  if (newQuoteBtn) newQuoteBtn.onclick = () => {
    DRAFT_QUOTE = newDraftQuote();
    QUOTE_CLIENT_SEARCH = "";
    QUOTE_SHOW_ADD_CLIENT = false;
    QUOTES_VIEW = "builder";
    router();
  };
  el.querySelectorAll("[data-view]").forEach(b => b.onclick = () => {
    VIEW_QUOTE_ID = b.dataset.view; QUOTES_VIEW = "view"; router();
  });
  el.querySelectorAll("[data-editq]").forEach(b => b.onclick = () => startEditQuote(b.dataset.editq, "list"));
  el.querySelectorAll("[data-del]").forEach(b => b.onclick = () => {
    if (!confirm("هل تريد حذف عرض السعر؟")) return;
    const target = quotes.find(q => q.id === b.dataset.del);
    dbSet("quotes", dbGet("quotes", []).filter(q => q.id !== b.dataset.del));
    logActivity(`تم حذف عرض السعر "${target ? target.number : ""}"`);
    router();
  });
}

/* فتح عرض سعر محفوظ في المنشئ لتعديله (إضافة/حذف/تعديل البنود والتصنيفات وبيانات المشروع) */
function startEditQuote(id, returnTo) {
  const saved = dbGet("quotes", []).find(x => x.id === id);
  if (!saved) return;
  DRAFT_QUOTE = JSON.parse(JSON.stringify(saved));
  DRAFT_QUOTE.editingId = id;
  QUOTE_EDIT_RETURN = returnTo || "list";
  QUOTE_CLIENT_SEARCH = "";
  QUOTE_SHOW_ADD_CLIENT = false;
  QUOTES_VIEW = "builder";
  router();
}

/* ---------- منتقي العميل داخل عرض السعر ---------- */
function clientPickerHtml(q) {
  if (q.client) {
    return `
      <div class="flex between" style="align-items:center;background:#f8f9fb;border:1px solid var(--border);border-radius:8px;padding:12px 14px">
        <div>
          <strong>${q.client.name}</strong>
          <div class="text-muted" style="font-size:12px">${q.client.phone || "بدون رقم جوال"}${q.client.email ? " — " + q.client.email : ""}</div>
        </div>
        <button class="btn sm" id="changeClientBtn" type="button">تغيير العميل</button>
      </div>`;
  }
  return `
    <div class="field" style="margin-bottom:10px;position:relative">
      <label>البحث عن عميل (بالاسم أو رقم الجوال)</label>
      <input id="clientSearchInput" placeholder="اكتب للبحث في العملاء المسجلين..." autocomplete="off" value="${QUOTE_CLIENT_SEARCH}">
      <div id="clientSearchResults" class="client-suggest-box"></div>
    </div>
    <button class="btn sm" id="toggleAddClientBtn" type="button">+ إضافة عميل جديد</button>
    <div id="addClientInline">${QUOTE_SHOW_ADD_CLIENT ? addClientInlineHtml() : ""}</div>
  `;
}

function addClientInlineHtml() {
  return `
    <div class="card" style="margin-top:12px;background:#fafbfc">
      <div class="grid cols-2">
        <div class="field" style="grid-column:span 2"><label>اسم العميل</label><input id="nqc_name"></div>
        <div class="field"><label>رقم الجوال</label><input id="nqc_phone"></div>
        <div class="field"><label>البريد الإلكتروني</label><input id="nqc_email"></div>
        <div class="field"><label>الرقم الضريبي</label><input id="nqc_tax"></div>
        <div class="field"><label>العنوان</label><input id="nqc_address"></div>
      </div>
      <div class="flex gap"><button class="btn sm primary" id="nqc_add" type="button">إضافة العميل واختياره</button><button class="btn sm" id="nqc_cancel" type="button">إلغاء</button></div>
    </div>
  `;
}

function renderClientSearchResults(container, query) {
  if (!container) return;
  const q = (query || "").trim().toLowerCase();
  if (!q) { container.innerHTML = ""; return; }
  const clients = dbGet("clients", []).filter(c => (c.name || "").toLowerCase().includes(q) || (c.phone || "").includes(q));
  if (!clients.length) {
    container.innerHTML = `<div class="text-muted" style="font-size:12px;padding:8px 4px">لا يوجد عملاء مطابقون — يمكنك إضافة عميل جديد</div>`;
    return;
  }
  container.innerHTML = clients.slice(0, 8).map(c => `
    <div class="client-suggest" data-pickclient="${c.id}">
      <strong>${c.name}</strong> <span class="text-muted" style="font-size:11.5px">${c.phone || ""}</span>
    </div>`).join("");
  container.querySelectorAll("[data-pickclient]").forEach(row => row.onclick = () => {
    const client = dbGet("clients", []).find(x => x.id === row.dataset.pickclient);
    DRAFT_QUOTE.client = { id: client.id, name: client.name, phone: client.phone, email: client.email, taxNumber: client.taxNumber };
    QUOTE_CLIENT_SEARCH = "";
    renderQuoteBuilder(document.getElementById("content"));
  });
}

function bindClientPickerEvents(el, q) {
  const changeBtn = document.getElementById("changeClientBtn");
  if (changeBtn) { changeBtn.onclick = () => { q.client = null; renderQuoteBuilder(el); }; return; }

  const searchInput = document.getElementById("clientSearchInput");
  if (searchInput) {
    renderClientSearchResults(document.getElementById("clientSearchResults"), QUOTE_CLIENT_SEARCH);
    searchInput.oninput = () => {
      QUOTE_CLIENT_SEARCH = searchInput.value;
      renderClientSearchResults(document.getElementById("clientSearchResults"), QUOTE_CLIENT_SEARCH);
    };
  }

  const toggleBtn = document.getElementById("toggleAddClientBtn");
  if (toggleBtn) toggleBtn.onclick = () => { QUOTE_SHOW_ADD_CLIENT = !QUOTE_SHOW_ADD_CLIENT; renderQuoteBuilder(el); };

  if (QUOTE_SHOW_ADD_CLIENT) {
    document.getElementById("nqc_add").onclick = () => {
      const name = document.getElementById("nqc_name").value.trim();
      if (!name) { toast("يرجى إدخال اسم العميل"); return; }
      const clients = dbGet("clients", []);
      const newClient = {
        id: uid("cl"), name,
        phone: document.getElementById("nqc_phone").value.trim(),
        email: document.getElementById("nqc_email").value.trim(),
        taxNumber: document.getElementById("nqc_tax").value.trim(),
        address: document.getElementById("nqc_address").value.trim(),
        notes: "", createdAt: new Date().toISOString(),
      };
      clients.push(newClient);
      dbSet("clients", clients);
      q.client = { id: newClient.id, name: newClient.name, phone: newClient.phone, email: newClient.email, taxNumber: newClient.taxNumber };
      QUOTE_SHOW_ADD_CLIENT = false;
      QUOTE_CLIENT_SEARCH = "";
      toast("تمت إضافة العميل");
      renderQuoteBuilder(el);
    };
    document.getElementById("nqc_cancel").onclick = () => { QUOTE_SHOW_ADD_CLIENT = false; renderQuoteBuilder(el); };
  }
}

/* ---------- تصنيف جديد (مشترك مع صفحة الإعدادات) ---------- */
function openNewCategoryModal(onSaved) {
  const html = `
    <div class="modal-head"><h3>تصنيف جديد</h3><button class="modal-close" id="mClose">×</button></div>
    <div class="field"><label>اسم التصنيف</label><input id="nc_catname" placeholder="مثال: الأعمال الخرسانية"></div>
    <div class="flex gap"><button class="btn primary" id="nc_catsave">إضافة</button><button class="btn" id="nc_catcancel">إلغاء</button></div>
  `;
  const ov = openModalShell(html);
  ov.querySelector("#mClose").onclick = closeModal;
  ov.querySelector("#nc_catcancel").onclick = closeModal;
  ov.querySelector("#nc_catsave").onclick = () => {
    const name = ov.querySelector("#nc_catname").value.trim();
    if (!name) { toast("يرجى إدخال اسم التصنيف"); return; }
    closeModal();
    onSaved(name);
  };
}

/* ---------- بند جديد داخل عرض السعر (يُضاف أيضاً للكتالوج) ---------- */
function openNewQuoteItemModal(onSaved) {
  const html = `
    <div class="modal-head"><h3>بند جديد</h3><button class="modal-close" id="mClose">×</button></div>
    <div class="field"><label>اسم البند</label><input id="ni_name" placeholder="مثال: دهان جدران وجهين شامل معجون وصنفرة وأساس"></div>
    <div class="field"><label>وحدة القياس</label><input id="ni_unit" value="م²"></div>
    <div class="grid cols-2">
      <div class="field">
        <label><input type="checkbox" id="ni_supchk" style="width:auto;display:inline-block"> توريد</label>
        <input type="number" min="0" step="0.01" id="ni_supprice" placeholder="سعر التوريد للوحدة" disabled>
      </div>
      <div class="field">
        <label><input type="checkbox" id="ni_inschk" style="width:auto;display:inline-block"> تركيب</label>
        <input type="number" min="0" step="0.01" id="ni_insprice" placeholder="سعر التركيب للوحدة" disabled>
      </div>
    </div>
    <div class="field"><label>نسبة الربح % (على سعر التكلفة أعلاه، لا تظهر للعميل)</label><input type="number" min="0" step="0.1" id="ni_margin" value="30"></div>
    <div class="flex gap"><button class="btn primary" id="ni_save">إضافة البند</button><button class="btn" id="ni_cancel">إلغاء</button></div>
  `;
  const ov = openModalShell(html);
  ov.querySelector("#mClose").onclick = closeModal;
  ov.querySelector("#ni_cancel").onclick = closeModal;
  ov.querySelector("#ni_supchk").onchange = (e) => { ov.querySelector("#ni_supprice").disabled = !e.target.checked; };
  ov.querySelector("#ni_inschk").onchange = (e) => { ov.querySelector("#ni_insprice").disabled = !e.target.checked; };
  ov.querySelector("#ni_save").onclick = () => {
    const name = ov.querySelector("#ni_name").value.trim();
    const unit = ov.querySelector("#ni_unit").value.trim() || "م²";
    const supEnabled = ov.querySelector("#ni_supchk").checked;
    const supPrice = Number(ov.querySelector("#ni_supprice").value) || 0;
    const insEnabled = ov.querySelector("#ni_inschk").checked;
    const insPrice = Number(ov.querySelector("#ni_insprice").value) || 0;
    const marginVal = Number(ov.querySelector("#ni_margin").value);
    const margin = isNaN(marginVal) ? 30 : marginVal;
    if (!name) { toast("يرجى إدخال اسم البند"); return; }
    if (!supEnabled && !insEnabled) { toast("يرجى اختيار توريد أو تركيب على الأقل"); return; }
    closeModal();
    onSaved({ name, unit, supEnabled, supPrice, insEnabled, insPrice, margin });
  };
}

/* ---------- بند مقطوعية: سعر ثابت يظهر للعميل بدون توضيح توريد أو تركيب ---------- */
function openLumpSumItemModal(onSaved) {
  const html = `
    <div class="modal-head"><h3>بند مقطوعية</h3><button class="modal-close" id="mClose">×</button></div>
    <div class="field"><label>اسم / وصف البند</label><input id="ls_name" placeholder="مثال: أعمال التشطيبات العامة للمدخل"></div>
    <div class="grid cols-3">
      <div class="field"><label>الوحدة</label><input id="ls_unit" value="مقطوعية"></div>
      <div class="field"><label>الكمية</label><input type="number" min="0" step="0.01" id="ls_qty" value="1"></div>
      <div class="field"><label>السعر (للوحدة)</label><input type="number" min="0" step="0.01" id="ls_price" value="0"></div>
    </div>
    <p class="text-muted" style="font-size:12px;margin-top:-6px">يظهر البند في عرض السعر بهذا السعر مباشرة، بدون أي توضيح أنه توريد أو تركيب.</p>
    <div class="flex gap"><button class="btn primary" id="ls_save">إضافة البند</button><button class="btn" id="ls_cancel">إلغاء</button></div>
  `;
  const ov = openModalShell(html);
  ov.querySelector("#mClose").onclick = closeModal;
  ov.querySelector("#ls_cancel").onclick = closeModal;
  ov.querySelector("#ls_save").onclick = () => {
    const name = ov.querySelector("#ls_name").value.trim();
    const unit = ov.querySelector("#ls_unit").value.trim() || "مقطوعية";
    const qty = Number(ov.querySelector("#ls_qty").value) || 0;
    const price = Number(ov.querySelector("#ls_price").value) || 0;
    if (!name) { toast("يرجى إدخال اسم البند"); return; }
    closeModal();
    onSaved({ itemId: null, name, unit, qty, priceOverride: price, lumpSum: true });
  };
}

/* ---------- منشئ عرض السعر ---------- */
function renderQuoteBuilder(el) {
  const catalog = dbGet("priceCatalog", []);
  const q = DRAFT_QUOTE;
  const total = quoteTotal(q);

  const isEdit = !!q.editingId;
  el.innerHTML = `
    <div class="section-title-row">
      <div><h2>${isEdit ? "تعديل عرض سعر رقم " + q.number : "عرض سعر جديد"}</h2><p>${isEdit ? "أضف بنوداً أو احذفها أو عدّلها، ثم احفظ التعديلات" : "اختر العميل ثم أدخل بيانات المشروع واختر البنود"}</p></div>
      <button class="btn" id="backList">إلغاء والرجوع</button>
    </div>

    <div class="card">
      <h3>العميل</h3>
      ${clientPickerHtml(q)}
    </div>

    <div class="card">
      <h3>بيانات المشروع</h3>
      <div class="grid cols-2">
        <div class="field"><label>اسم المشروع</label><input id="f_projectName" value="${q.projectName}"></div>
        <div class="field">
          <label>موقع المشروع (رابط خرائط جوجل)</label>
          <div class="flex gap">
            <input id="f_location" placeholder="https://maps.app.goo.gl/... أو عنوان نصي" value="${q.location}" style="flex:1">
            <button class="btn sm" id="f_useMyLocation" type="button" title="استخدام موقعي الحالي">${svgIcon("pin")} موقعي الحالي</button>
          </div>
          <div class="hint">افتح الموقع في خرائط جوجل، اضغط "مشاركة"، ثم انسخ الرابط والصقه هنا — أو اكتب العنوان نصاً</div>
        </div>
      </div>
      <label class="chk" style="font-weight:700">
        <input type="checkbox" id="f_showHeader" ${q.showCompanyHeader !== false ? "checked" : ""}>
        إظهار بيانات المؤسسة والشعار في ترويسة عرض السعر النهائي
      </label>
    </div>

    <div class="card">
      <h3>تصنيفات البنود</h3>
      <div class="pill-group" id="catPills">
        ${catalog.map(c => `<div class="pill ${q.categories.find(qc => qc.catId === c.id) ? "active" : ""}" data-catpill="${c.id}">${c.name}</div>`).join("")}
        <div class="pill" id="addCatPill" style="border-style:dashed">+ تصنيف جديد</div>
      </div>
    </div>

    <div id="catBlocks">
      ${q.categories.map(qc => renderCatBlock(qc, catalog)).join("") || `<div class="card empty-state"><div class="ic">${svgIcon("box", 40)}</div>اختر تصنيفاً أعلاه للبدء بإضافة البنود</div>`}
    </div>

    <div class="grand-total-box">
      <div>الإجمالي الكلي لعرض السعر</div>
      <div class="num" id="grandTotal">${fmtMoney(total)}</div>
    </div>

    <div class="card">
      <h3>ملاحظات عرض السعر (تظهر أسفل العرض النهائي)</h3>
      <div class="field"><label>ملاحظة الصلاحية</label><textarea id="f_noteValidity">${q.noteValidity}</textarea></div>
      <div class="field"><label>ملاحظة الدفع / التحويل البنكي</label><textarea id="f_notePayment">${q.notePayment}</textarea></div>
    </div>

    <div class="flex gap" style="margin-top:16px">
      <button class="btn primary" id="saveQuoteBtn">${svgIcon("save")} ${isEdit ? "حفظ التعديلات" : "حفظ عرض السعر"}</button>
      <button class="btn" id="cancelQuoteBtn">إلغاء</button>
    </div>
  `;

  bindClientPickerEvents(el, q);
  bindQuoteBuilderEvents(el);
}

function renderCatBlock(qc, catalog) {
  const cat = catalog.find(c => c.id === qc.catId);
  const catItems = cat ? cat.items : [];
  const alreadyIds = qc.items.map(i => i.itemId).filter(Boolean);
  const availableToPick = catItems.filter(it => !alreadyIds.includes(it.id));
  const blockTotal = qc.items.reduce((s, it) => s + itemTotal(it), 0);

  return `
    <div class="cat-block" data-block="${qc.catId}">
      <div class="cat-head">
        <strong>${qc.catName}</strong>
        <span class="cat-total">إجمالي التصنيف: ${fmtMoney(blockTotal)}</span>
      </div>

      ${qc.items.map((it, idx) => renderQuoteItemRow(qc, it, idx)).join("")}

      <div class="flex gap wrap" style="margin-top:10px">
        ${availableToPick.length ? `
          <select data-pickitem="${qc.catId}" style="padding:8px 10px;border:1px solid var(--border);border-radius:7px;font-size:12.5px">
            <option value="">اختر بنداً من القائمة المسجلة…</option>
            ${availableToPick.map(it => `<option value="${it.id}">${it.name} (${it.unit}${it.supply && it.supply.enabled ? " — توريد " + fmtMoney(it.supply.price) : ""}${it.install && it.install.enabled ? " — تركيب " + fmtMoney(it.install.price) : ""})</option>`).join("")}
          </select>
          <button class="btn sm" data-addpicked="${qc.catId}">إضافة البند</button>` : `<span class="text-muted" style="font-size:12px">تمت إضافة جميع بنود هذا التصنيف</span>`}
        <button class="btn sm" data-newitem="${qc.catId}">+ بند جديد</button>
        <button class="btn sm" data-newlump="${qc.catId}" title="بند بسعر ثابت بدون توضيح توريد أو تركيب">+ بند مقطوعية</button>
        <button class="btn sm danger" data-rmcat="${qc.catId}" style="margin-inline-start:auto">حذف التصنيف من العرض</button>
      </div>
    </div>
  `;
}

function renderQuoteItemRow(qc, it, idx) {
  const key = qc.catId + ":" + idx;
  const supIncluded = !!(it.supply && it.supply.included);
  const insIncluded = !!(it.install && it.install.included);

  if (isFixedPriceItem(it)) {
    const hasSI = !!(it.supply || it.install);
    return `
    <div class="qitem-row" data-item-row="${key}">
      <div class="qitem-name">
        <input value="${it.name}" data-itemname="${key}" style="font-weight:700;border:1px solid var(--border);border-radius:6px;padding:5px 8px;width:100%;margin-bottom:5px">
        <div class="flex" style="align-items:center;gap:6px">
          <span class="text-muted" style="font-size:11.5px">الوحدة:</span>
          <input value="${it.unit}" data-itemunit="${key}" style="border:1px solid var(--border);border-radius:6px;padding:3px 7px;width:80px;font-size:11.5px">
          ${it.lumpSum ? `<span class="badge orange">مقطوعية</span>` : ""}
        </div>
      </div>
      <div class="qitem-controls">
        ${hasSI ? `
        <label class="chk"><input type="checkbox" ${supIncluded ? "checked" : ""} data-fsupchk="${key}"> توريد</label>
        <label class="chk"><input type="checkbox" ${insIncluded ? "checked" : ""} data-finschk="${key}"> تركيب</label>` : ""}
        <input type="number" min="0" step="0.01" value="${itemUnitPrice(it).toFixed(2)}" data-fprice="${key}" placeholder="السعر" title="السعر النهائي للوحدة كما يظهر للعميل">
        <input type="number" min="0" step="0.01" value="${it.qty}" data-qty="${key}" placeholder="الكمية" title="الكمية">
        <div class="total-cell" data-total="${key}" title="الإجمالي">${fmtMoney(itemTotal(it))}</div>
        <button class="btn sm" data-dupqitem="${key}" title="عمل نسخة من هذا البند">${svgIcon("copy")} نسخ</button>
        <button class="btn-icon danger" data-rmitem="${key}" title="حذف">${ICON_DELETE}</button>
      </div>
    </div>`;
  }

  return `
    <div class="qitem-row" data-item-row="${key}">
      <div class="qitem-name">
        <input value="${it.name}" data-itemname="${key}" style="font-weight:700;border:1px solid var(--border);border-radius:6px;padding:5px 8px;width:100%;margin-bottom:5px">
        <div class="flex" style="align-items:center;gap:6px">
          <span class="text-muted" style="font-size:11.5px">الوحدة:</span>
          <input value="${it.unit}" data-itemunit="${key}" style="border:1px solid var(--border);border-radius:6px;padding:3px 7px;width:80px;font-size:11.5px">
        </div>
      </div>
      <div class="qitem-controls">
        <label class="chk"><input type="checkbox" ${supIncluded ? "checked" : ""} data-supchk="${key}"> توريد</label>
        <input type="number" min="0" step="0.01" value="${it.supply ? it.supply.price : 0}" data-supprice="${key}" ${supIncluded ? "" : "disabled"} placeholder="تكلفة التوريد" title="سعر تكلفة التوريد للوحدة (لا يظهر للعميل)">
        <label class="chk"><input type="checkbox" ${insIncluded ? "checked" : ""} data-inschk="${key}"> تركيب</label>
        <input type="number" min="0" step="0.01" value="${it.install ? it.install.price : 0}" data-insprice="${key}" ${insIncluded ? "" : "disabled"} placeholder="تكلفة التركيب" title="سعر تكلفة التركيب للوحدة (لا يظهر للعميل)">
        <label class="chk" title="نسبة الربح — تُضاف على سعر التكلفة لتكوين السعر النهائي للعميل">ربح% <input type="number" min="0" step="0.1" value="${it.profitMargin !== undefined ? it.profitMargin : 30}" data-margin="${key}" style="width:60px"></label>
        <input type="number" min="0" step="0.01" value="${it.qty}" data-qty="${key}" placeholder="الكمية" title="الكمية">
        <div class="total-cell" data-total="${key}" title="السعر النهائي شامل الربح">${fmtMoney(itemTotal(it))}</div>
        <button class="btn sm" data-dupqitem="${key}" title="عمل نسخة من هذا البند">${svgIcon("copy")} نسخ</button>
        <button class="btn-icon danger" data-rmitem="${key}" title="حذف">${ICON_DELETE}</button>
      </div>
    </div>
  `;
}

function bindQuoteBuilderEvents(el) {
  const q = DRAFT_QUOTE;
  const catalog = dbGet("priceCatalog", []);

  const leaveBuilder = () => { QUOTES_VIEW = (q.editingId && QUOTE_EDIT_RETURN === "view") ? "view" : "list"; router(); };
  document.getElementById("backList").onclick = leaveBuilder;
  document.getElementById("cancelQuoteBtn").onclick = leaveBuilder;

  ["f_projectName", "f_location"].forEach(id => {
    const input = document.getElementById(id);
    input.oninput = () => {
      if (id === "f_projectName") q.projectName = input.value;
      else if (id === "f_location") q.location = input.value;
    };
  });
  document.getElementById("f_useMyLocation").onclick = () => {
    if (!navigator.geolocation) { toast("المتصفح لا يدعم تحديد الموقع"); return; }
    toast("جارٍ تحديد الموقع...");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const link = `https://www.google.com/maps?q=${pos.coords.latitude},${pos.coords.longitude}`;
        q.location = link;
        document.getElementById("f_location").value = link;
        toast("تم تحديد الموقع الحالي");
      },
      () => toast("تعذّر تحديد الموقع — تأكد من السماح بالوصول للموقع الجغرافي"),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };
  document.getElementById("f_showHeader").onchange = (e) => { q.showCompanyHeader = e.target.checked; };
  document.getElementById("f_noteValidity").oninput = (e) => { q.noteValidity = e.target.value; };
  document.getElementById("f_notePayment").oninput = (e) => { q.notePayment = e.target.value; };

  el.querySelectorAll("[data-catpill]").forEach(p => {
    p.onclick = () => {
      const catId = p.dataset.catpill;
      const cat = catalog.find(c => c.id === catId);
      const exists = q.categories.find(qc => qc.catId === catId);
      if (exists) {
        q.categories = q.categories.filter(qc => qc.catId !== catId);
      } else {
        q.categories.push({ catId, catName: cat.name, items: [] });
      }
      renderQuoteBuilder(el);
    };
  });

  document.getElementById("addCatPill").onclick = () => {
    openNewCategoryModal((name) => {
      const newCat = { id: uid("cat"), name, items: [] };
      const cats = dbGet("priceCatalog", []);
      cats.push(newCat);
      dbSet("priceCatalog", cats);
      q.categories.push({ catId: newCat.id, catName: newCat.name, items: [] });
      renderQuoteBuilder(el);
    });
  };

  el.querySelectorAll("[data-rmcat]").forEach(b => b.onclick = () => {
    q.categories = q.categories.filter(qc => qc.catId !== b.dataset.rmcat);
    renderQuoteBuilder(el);
  });

  el.querySelectorAll("[data-addpicked]").forEach(b => b.onclick = () => {
    const catId = b.dataset.addpicked;
    const select = el.querySelector(`select[data-pickitem="${catId}"]`);
    const itemId = select.value;
    if (!itemId) return;
    const cat = catalog.find(c => c.id === catId);
    const item = cat.items.find(i => i.id === itemId);
    const qc = q.categories.find(c => c.catId === catId);
    const hasSup = !!(item.supply && item.supply.enabled);
    const hasIns = !!(item.install && item.install.enabled);
    qc.items.push({
      itemId: item.id, name: item.name, unit: item.unit, qty: 1,
      supply: { included: hasSup, price: item.supply ? item.supply.price : 0 },
      install: { included: hasIns || (!hasSup && !hasIns), price: item.install ? item.install.price : (item.price || 0) },
      profitMargin: item.profitMargin !== undefined ? item.profitMargin : 30,
    });
    renderQuoteBuilder(el);
  });

  el.querySelectorAll("[data-newitem]").forEach(b => b.onclick = () => {
    const catId = b.dataset.newitem;
    openNewQuoteItemModal((data) => {
      // أضف البند إلى القائمة المسجلة مسبقاً (الكتالوج) ليكون متاحاً لاحقاً
      const cats = dbGet("priceCatalog", []);
      const cat = cats.find(c => c.id === catId);
      const newItem = {
        id: uid("it"), name: data.name, unit: data.unit,
        supply: { enabled: data.supEnabled, price: data.supPrice },
        install: { enabled: data.insEnabled, price: data.insPrice },
        profitMargin: data.margin,
      };
      cat.items.push(newItem);
      dbSet("priceCatalog", cats);

      const qc = q.categories.find(c => c.catId === catId);
      qc.items.push({
        itemId: newItem.id, name: newItem.name, unit: newItem.unit, qty: 1,
        supply: { included: data.supEnabled, price: data.supPrice },
        install: { included: data.insEnabled, price: data.insPrice },
        profitMargin: data.margin,
      });
      renderQuoteBuilder(el);
    });
  });

  el.querySelectorAll("[data-newlump]").forEach(b => b.onclick = () => {
    const catId = b.dataset.newlump;
    openLumpSumItemModal((item) => {
      const qc = q.categories.find(c => c.catId === catId);
      qc.items.push(item);
      renderQuoteBuilder(el);
    });
  });

  el.querySelectorAll("[data-rmitem]").forEach(b => b.onclick = () => {
    const [catId, idx] = b.dataset.rmitem.split(":");
    const qc = q.categories.find(c => c.catId === catId);
    qc.items.splice(Number(idx), 1);
    renderQuoteBuilder(el);
  });

  el.querySelectorAll("[data-dupqitem]").forEach(b => b.onclick = () => {
    const [catId, idx] = b.dataset.dupqitem.split(":");
    const qc = q.categories.find(c => c.catId === catId);
    const copy = JSON.parse(JSON.stringify(qc.items[Number(idx)]));
    copy.name = copy.name + " (نسخة)";
    qc.items.splice(Number(idx) + 1, 0, copy);
    toast("تم نسخ البند — يمكنك الآن تعديله");
    renderQuoteBuilder(el);
  });

  function getItemRef(key) {
    const [catId, idx] = key.split(":");
    const qc = q.categories.find(c => c.catId === catId);
    return { catId, idx: Number(idx), it: qc.items[Number(idx)] };
  }

  el.querySelectorAll("[data-itemname]").forEach(inp => inp.oninput = () => {
    const { it } = getItemRef(inp.dataset.itemname);
    it.name = inp.value;
  });
  el.querySelectorAll("[data-itemunit]").forEach(inp => inp.oninput = () => {
    const { it } = getItemRef(inp.dataset.itemunit);
    it.unit = inp.value;
  });

  el.querySelectorAll("[data-qty]").forEach(inp => inp.oninput = () => {
    const { catId, idx, it } = getItemRef(inp.dataset.qty);
    it.qty = Number(inp.value) || 0;
    updateRowAndTotals(el, catId, idx);
  });
  el.querySelectorAll("[data-supprice]").forEach(inp => inp.oninput = () => {
    const { catId, idx, it } = getItemRef(inp.dataset.supprice);
    it.supply.price = Number(inp.value) || 0;
    updateRowAndTotals(el, catId, idx);
  });
  el.querySelectorAll("[data-insprice]").forEach(inp => inp.oninput = () => {
    const { catId, idx, it } = getItemRef(inp.dataset.insprice);
    it.install.price = Number(inp.value) || 0;
    updateRowAndTotals(el, catId, idx);
  });
  el.querySelectorAll("[data-margin]").forEach(inp => inp.oninput = () => {
    const { catId, idx, it } = getItemRef(inp.dataset.margin);
    it.profitMargin = Number(inp.value) || 0;
    updateRowAndTotals(el, catId, idx);
  });
  el.querySelectorAll("[data-fprice]").forEach(inp => inp.oninput = () => {
    const { catId, idx, it } = getItemRef(inp.dataset.fprice);
    it.priceOverride = Number(inp.value) || 0;
    updateRowAndTotals(el, catId, idx);
  });
  el.querySelectorAll("[data-fsupchk]").forEach(chk => chk.onchange = () => {
    const { it } = getItemRef(chk.dataset.fsupchk);
    if (!it.supply) it.supply = { included: false, price: 0 };
    it.supply.included = chk.checked;
  });
  el.querySelectorAll("[data-finschk]").forEach(chk => chk.onchange = () => {
    const { it } = getItemRef(chk.dataset.finschk);
    if (!it.install) it.install = { included: false, price: 0 };
    it.install.included = chk.checked;
  });

  el.querySelectorAll("[data-supchk]").forEach(chk => chk.onchange = () => {
    const { catId, idx, it } = getItemRef(chk.dataset.supchk);
    it.supply.included = chk.checked;
    const priceInput = el.querySelector(`[data-supprice="${chk.dataset.supchk}"]`);
    if (priceInput) priceInput.disabled = !chk.checked;
    updateRowAndTotals(el, catId, idx);
  });
  el.querySelectorAll("[data-inschk]").forEach(chk => chk.onchange = () => {
    const { catId, idx, it } = getItemRef(chk.dataset.inschk);
    it.install.included = chk.checked;
    const priceInput = el.querySelector(`[data-insprice="${chk.dataset.inschk}"]`);
    if (priceInput) priceInput.disabled = !chk.checked;
    updateRowAndTotals(el, catId, idx);
  });

  document.getElementById("saveQuoteBtn").onclick = () => {
    if (!q.client) { toast("يرجى اختيار العميل"); return; }
    if (!q.projectName.trim()) { toast("يرجى إدخال اسم المشروع"); return; }
    if (!q.categories.length || q.categories.every(c => !c.items.length)) { toast("يرجى إضافة بند واحد على الأقل"); return; }

    const quotes = dbGet("quotes", []);

    if (q.editingId) {
      const idx = quotes.findIndex(x => x.id === q.editingId);
      if (idx === -1) { toast("تعذّر العثور على عرض السعر المراد تعديله"); return; }
      const updated = JSON.parse(JSON.stringify(q));
      delete updated.editingId;
      updated.updatedAt = new Date().toISOString();
      quotes[idx] = updated;
      dbSet("quotes", quotes);
      logActivity(`تم تعديل عرض السعر "${updated.number}" للعميل "${updated.client.name}" — الإجمالي بعد التعديل ${fmtMoney(quoteTotal(updated))}`);
      toast("تم حفظ تعديلات عرض السعر");
      VIEW_QUOTE_ID = updated.id;
      QUOTES_VIEW = QUOTE_EDIT_RETURN === "view" ? "view" : "list";
      router();
      return;
    }

    q.id = uid("q");
    q.number = "Q-" + (1000 + quotes.length + 1);
    q.date = todayISO();
    quotes.push(q);
    dbSet("quotes", quotes);
    logActivity(`تم إنشاء عرض سعر "${q.number}" للعميل "${q.client.name}" بقيمة ${fmtMoney(quoteTotal(q))}`);
    toast("تم حفظ عرض السعر بنجاح");
    QUOTES_VIEW = "list";
    router();
  };
}

function updateRowAndTotals(el, catId, idx) {
  const q = DRAFT_QUOTE;
  const qc = q.categories.find(c => c.catId === catId);
  const it = qc.items[idx];
  const rowTotal = itemTotal(it);
  const totalCell = el.querySelector(`[data-total="${catId}:${idx}"]`);
  if (totalCell) totalCell.textContent = fmtMoney(rowTotal);

  const blockTotal = qc.items.reduce((s, x) => s + itemTotal(x), 0);
  const block = el.querySelector(`[data-block="${catId}"] .cat-total`);
  if (block) block.textContent = "إجمالي التصنيف: " + fmtMoney(blockTotal);

  const grand = el.querySelector("#grandTotal");
  if (grand) grand.textContent = fmtMoney(quoteTotal(q));
}

/* ---------- عرض/طباعة عرض السعر ---------- */
function companyHeaderHtml() {
  const c = getCompanyProfile();
  const contactUser = c.contactUserId ? dbGet("users", []).find(u => u.id === c.contactUserId) : null;
  return `
    <div class="card quote-header-card">
      <div class="quote-logo-box">${c.logo ? `<img src="${c.logo}">` : "الشعار"}</div>
      <div>
        <h2>${c.name || "شركة زهى الاعمال للمقاولات"}${c.taxNumber ? ` <span class="tax-inline">— الرقم الضريبي: ${c.taxNumber}</span>` : ""}</h2>
        ${c.address ? `<div class="cline">${c.address}</div>` : ""}
        ${(c.phone || c.email) ? `<div class="cline">${[c.phone, c.email].filter(Boolean).join(" — ")}</div>` : ""}
        ${c.crNumber ? `<div class="cline">س.ت: ${c.crNumber}</div>` : ""}
        ${contactUser ? `<div class="cline">المسؤول: ${contactUser.name}</div>` : ""}
      </div>
    </div>
  `;
}

function renderQuoteView(el) {
  const quotes = dbGet("quotes", []);
  const q = quotes.find(x => x.id === VIEW_QUOTE_ID);
  if (!q) { QUOTES_VIEW = "list"; router(); return; }
  const total = quoteTotal(q);
  const catalog = dbGet("priceCatalog", []);
  const missingCats = catalog.filter(c => !q.categories.find(qc => qc.catId === c.id));

  el.innerHTML = `
    <div class="section-title-row no-print">
      <div><h2>عرض سعر رقم ${q.number}</h2><p>${fmtDate(q.date)} — يمكنك تعديل الكميات والأسعار وإضافة بنود مباشرة قبل الطباعة</p></div>
      <div class="flex gap">
        <button class="btn" id="backList2">رجوع</button>
        ${hasPermission((getCurrentUser() || {}).role, "quotes_add") ? `<button class="btn" id="editQuoteBtn">${ICON_EDIT} تعديل العرض</button>` : ""}
        <button class="btn primary" id="printQuote">${svgIcon("printer")} طباعة</button>
      </div>
    </div>

    ${q.showCompanyHeader !== false ? companyHeaderHtml() : ""}

    <div class="card">
      <div class="grid cols-2" style="margin-bottom:6px">
        <div>
          <h3 class="mt-0">بيانات العميل <span class="text-muted no-print" style="font-size:11px;font-weight:400">(قابلة للتعديل)</span></h3>
          <div class="kv-row"><span class="k">الاسم</span><input class="kv-input" id="vc_name" value="${q.client.name}"></div>
          <div class="kv-row"><span class="k">الجوال</span><input class="kv-input" id="vc_phone" value="${q.client.phone || ""}"></div>
          <div class="kv-row"><span class="k">البريد</span><input class="kv-input" id="vc_email" value="${q.client.email || ""}"></div>
          <div class="kv-row"><span class="k">الرقم الضريبي للعميل</span><input class="kv-input" id="vc_tax" value="${q.client.taxNumber || ""}"></div>
        </div>
        <div>
          <h3 class="mt-0">بيانات المشروع</h3>
          <div class="kv-row"><span class="k">اسم المشروع</span><span class="v">${q.projectName}</span></div>
          <div class="kv-row"><span class="k">الموقع</span><span class="v">${locationDisplay(q.location)}</span></div>
        </div>
      </div>
    </div>

    <div class="pill-group no-print" style="margin-bottom:14px">
      ${missingCats.map(c => `<div class="pill" data-vaddcat="${c.id}">+ ${c.name}</div>`).join("")}
      <div class="pill" id="vAddCatPill" style="border-style:dashed">+ تصنيف جديد</div>
    </div>

    <div id="vCatBlocks">
      ${q.categories.length ? renderViewItemsTable(q.categories) : `<div class="card empty-state"><div class="ic">${svgIcon("box", 40)}</div>لا توجد بنود بعد — أضف تصنيفاً من الأعلى</div>`}
    </div>

    <div class="grand-total-box">
      <div>الإجمالي الكلي لعرض السعر</div>
      <div class="num" id="vGrandTotal">${fmtMoney(total)}</div>
    </div>

    <div class="card">
      <p style="font-size:12.5px;margin:0 0 8px">${(q.noteValidity !== undefined ? q.noteValidity : DEFAULT_NOTE_VALIDITY) || ""}</p>
      <p style="font-size:12.5px;margin:0">${(q.notePayment !== undefined ? q.notePayment : DEFAULT_NOTE_PAYMENT) || ""}</p>
    </div>
  `;

  document.getElementById("backList2").onclick = () => { QUOTES_VIEW = "list"; router(); };
  document.getElementById("printQuote").onclick = () => window.print();
  const editQuoteBtn = document.getElementById("editQuoteBtn");
  if (editQuoteBtn) editQuoteBtn.onclick = () => startEditQuote(q.id, "view");

  bindQuoteViewEvents(el, q, quotes, catalog);
}

function renderViewItemsTable(categories) {
  return `
    <div class="card quote-items-card">
      <p class="text-muted no-print" style="font-size:11.5px;margin:-4px 0 10px">${svgIcon("bulb", 14)} اسحب صف بند أو تصنيف من مقبض السحب (${svgIcon("grip", 14)}) وأفلته في مكان آخر لإعادة الترتيب — تُعاد ترقيم البنود تلقائياً.</p>
      <div class="table-wrap">
        <table class="data-table quote-final-table">
          <thead><tr><th>#</th><th>البند</th><th>الكمية</th><th>الوحدة</th><th>السعر</th><th>الإجمالي</th><th class="no-print"></th></tr></thead>
          <tbody>
            ${categories.map((qc, ci) => `
              <tr class="cat-header-row" data-vcat="${ci}">
                <td colspan="6"><span class="drag-handle no-print" title="اسحب لإعادة ترتيب التصنيف">${svgIcon("grip", 14)}</span> <strong>${ci + 1}. ${qc.catName}</strong></td>
                <td class="no-print">
                  <button class="btn sm" data-vadditem="${ci}">+ إضافة بند</button>
                  <button class="btn sm" data-vaddlump="${ci}" title="بند بسعر ثابت بدون توضيح توريد أو تركيب">+ بند مقطوعية</button>
                  <button class="btn sm danger" data-vrmcat="${ci}">حذف التصنيف</button>
                </td>
              </tr>
              ${qc.items.map((it, ii) => {
                const label = supplyInstallLabel(it);
                const key = ci + ":" + ii;
                const hasSupplyInstall = !!(it.supply || it.install);
                const supIncluded = !!(it.supply && it.supply.included);
                const insIncluded = !!(it.install && it.install.included);
                return `<tr data-vrow="${key}">
                  <td>${ci + 1}-${ii + 1}</td>
                  <td>
                    <span class="drag-handle no-print" title="اسحب لإعادة ترتيب البند">${svgIcon("grip", 14)}</span>
                    ${hasSupplyInstall ? `
                      <span class="no-print supply-install-toggle">
                        <label class="chk"><input type="checkbox" data-vsupchk="${key}" ${supIncluded ? "checked" : ""}> توريد</label>
                        <label class="chk"><input type="checkbox" data-vinschk="${key}" ${insIncluded ? "checked" : ""}> تركيب</label>
                      </span>
                      <span class="print-only-inline">${label ? label + " - " : ""}</span>
                    ` : ""}
                    ${it.name}
                  </td>
                  <td><input type="number" min="0" step="0.01" value="${it.qty}" data-vqty="${key}" style="width:80px"></td>
                  <td>${it.unit}</td>
                  <td><input type="number" min="0" step="0.01" value="${itemUnitPrice(it).toFixed(2)}" data-vprice="${key}" style="width:100px"></td>
                  <td data-vtotal="${key}"><strong>${fmtMoney(itemTotal(it))}</strong></td>
                  <td class="no-print">
                    <button class="btn-icon danger" data-vrmitem="${key}" title="حذف">${ICON_DELETE}</button>
                  </td>
                </tr>`;
              }).join("") || `<tr><td colspan="7" class="text-muted" style="text-align:center;padding:14px">لا توجد بنود في هذا التصنيف</td></tr>`}
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function openAddFinalItemModal(catItems, onSaved) {
  const html = `
    <div class="modal-head"><h3>إضافة بند</h3><button class="modal-close" id="mClose">×</button></div>
    ${catItems.length ? `
    <div class="field">
      <label>اختيار من القائمة المسجلة (اختياري)</label>
      <select id="afi_pick">
        <option value="">— بند جديد يدوياً —</option>
        ${catItems.map(it => `<option value="${it.id}">${it.name}</option>`).join("")}
      </select>
    </div>` : ""}
    <div class="field"><label>اسم البند</label><input id="afi_name"></div>
    <div class="grid cols-3">
      <div class="field"><label>الوحدة</label><input id="afi_unit" value="م²"></div>
      <div class="field"><label>الكمية</label><input type="number" min="0" step="0.01" id="afi_qty" value="1"></div>
      <div class="field"><label>السعر النهائي للوحدة</label><input type="number" min="0" step="0.01" id="afi_price" value="0"></div>
    </div>
    <div class="flex gap"><button class="btn primary" id="afi_save">إضافة البند</button><button class="btn" id="afi_cancel">إلغاء</button></div>
  `;
  const ov = openModalShell(html);
  ov.querySelector("#mClose").onclick = closeModal;
  ov.querySelector("#afi_cancel").onclick = closeModal;

  const pickSel = ov.querySelector("#afi_pick");
  if (pickSel) pickSel.onchange = () => {
    const item = catItems.find(x => x.id === pickSel.value);
    if (!item) return;
    ov.querySelector("#afi_name").value = item.name;
    ov.querySelector("#afi_unit").value = item.unit;
    const cost = (item.supply && item.supply.enabled ? Number(item.supply.price) || 0 : 0) + (item.install && item.install.enabled ? Number(item.install.price) || 0 : 0);
    const margin = item.profitMargin !== undefined ? Number(item.profitMargin) || 0 : 30;
    ov.querySelector("#afi_price").value = (cost * (1 + margin / 100)).toFixed(2);
  };

  ov.querySelector("#afi_save").onclick = () => {
    const name = ov.querySelector("#afi_name").value.trim();
    const unit = ov.querySelector("#afi_unit").value.trim() || "م²";
    const qty = Number(ov.querySelector("#afi_qty").value) || 0;
    const price = Number(ov.querySelector("#afi_price").value) || 0;
    if (!name) { toast("يرجى إدخال اسم البند"); return; }
    closeModal();
    const pickedItem = pickSel ? catItems.find(x => x.id === pickSel.value) : null;
    onSaved({ itemId: pickedItem ? pickedItem.id : null, name, unit, qty, priceOverride: price });
  };
}

function bindQuoteViewEvents(el, q, quotes, catalog) {
  function persist() { dbSet("quotes", quotes); }

  function syncClientField(field, value) {
    q.client[field] = value;
    persist();
    // مزامنة نفس التعديل مع سجل العميل الرئيسي في صفحة العملاء (إن كان العميل مرتبطاً بسجل فعلي)
    if (q.client.id) {
      const clients = dbGet("clients", []);
      const rec = clients.find(c => c.id === q.client.id);
      if (rec) {
        rec[field] = value;
        dbSet("clients", clients);
      }
    }
  }

  const clientFieldMap = { vc_name: "name", vc_phone: "phone", vc_email: "email", vc_tax: "taxNumber" };
  Object.keys(clientFieldMap).forEach(inputId => {
    const inp = document.getElementById(inputId);
    if (!inp) return;
    inp.onchange = () => {
      const field = clientFieldMap[inputId];
      if (field === "name" && !inp.value.trim()) { toast("اسم العميل مطلوب"); inp.value = q.client.name; return; }
      syncClientField(field, inp.value.trim());
      toast("تم حفظ بيانات العميل");
    };
  });

  function updateRowTotals(ci, ii) {
    const it = q.categories[ci].items[ii];
    const priceInput = el.querySelector(`[data-vprice="${ci}:${ii}"]`);
    if (priceInput && document.activeElement !== priceInput) priceInput.value = itemUnitPrice(it).toFixed(2);
    const cell = el.querySelector(`[data-vtotal="${ci}:${ii}"]`);
    if (cell) cell.innerHTML = `<strong>${fmtMoney(itemTotal(it))}</strong>`;
    const row = el.querySelector(`tr[data-vrow="${ci}:${ii}"]`);
    const labelSpan = row ? row.querySelector(".print-only-inline") : null;
    if (labelSpan) { const lbl = supplyInstallLabel(it); labelSpan.textContent = lbl ? lbl + " - " : ""; }
    const grand = el.querySelector("#vGrandTotal");
    if (grand) grand.textContent = fmtMoney(quoteTotal(q));
  }

  el.querySelectorAll("[data-vqty]").forEach(inp => inp.oninput = () => {
    const [ci, ii] = inp.dataset.vqty.split(":").map(Number);
    q.categories[ci].items[ii].qty = Number(inp.value) || 0;
    persist();
    updateRowTotals(ci, ii);
  });

  el.querySelectorAll("[data-vprice]").forEach(inp => inp.oninput = () => {
    const [ci, ii] = inp.dataset.vprice.split(":").map(Number);
    q.categories[ci].items[ii].priceOverride = Number(inp.value) || 0;
    persist();
    updateRowTotals(ci, ii);
  });

  el.querySelectorAll("[data-vsupchk]").forEach(chk => chk.onchange = () => {
    const [ci, ii] = chk.dataset.vsupchk.split(":").map(Number);
    const it = q.categories[ci].items[ii];
    if (!it.supply) it.supply = { included: false, price: 0 };
    it.supply.included = chk.checked;
    persist();
    updateRowTotals(ci, ii);
  });
  el.querySelectorAll("[data-vinschk]").forEach(chk => chk.onchange = () => {
    const [ci, ii] = chk.dataset.vinschk.split(":").map(Number);
    const it = q.categories[ci].items[ii];
    if (!it.install) it.install = { included: false, price: 0 };
    it.install.included = chk.checked;
    persist();
    updateRowTotals(ci, ii);
  });

  el.querySelectorAll("[data-vrmitem]").forEach(btn => btn.onclick = () => {
    const [ci, ii] = btn.dataset.vrmitem.split(":").map(Number);
    q.categories[ci].items.splice(ii, 1);
    persist();
    renderQuoteView(el);
  });

  el.querySelectorAll("[data-vadditem]").forEach(btn => btn.onclick = () => {
    const ci = Number(btn.dataset.vadditem);
    const cat = catalog.find(c => c.id === q.categories[ci].catId);
    openAddFinalItemModal(cat ? cat.items : [], (newItem) => {
      q.categories[ci].items.push(newItem);
      persist();
      toast("تم إضافة البند");
      renderQuoteView(el);
    });
  });

  el.querySelectorAll("[data-vaddlump]").forEach(btn => btn.onclick = () => {
    const ci = Number(btn.dataset.vaddlump);
    openLumpSumItemModal((item) => {
      q.categories[ci].items.push(item);
      persist();
      toast("تم إضافة بند المقطوعية");
      renderQuoteView(el);
    });
  });

  el.querySelectorAll("[data-vrmcat]").forEach(btn => btn.onclick = () => {
    if (!confirm("حذف هذا التصنيف وجميع بنوده من عرض السعر؟")) return;
    const ci = Number(btn.dataset.vrmcat);
    q.categories.splice(ci, 1);
    persist();
    renderQuoteView(el);
  });

  function moveItem(ci, ii, targetIi) {
    const arr = q.categories[ci].items;
    if (targetIi < 0 || targetIi >= arr.length || targetIi === ii) return;
    const [moved] = arr.splice(ii, 1);
    arr.splice(targetIi, 0, moved);
    persist();
    renderQuoteView(el);
  }
  function moveCategory(ci, targetCi) {
    if (targetCi < 0 || targetCi >= q.categories.length || targetCi === ci) return;
    const [moved] = q.categories.splice(ci, 1);
    q.categories.splice(targetCi, 0, moved);
    persist();
    renderQuoteView(el);
  }

  el.querySelectorAll("tr[data-vrow]").forEach(row => {
    row.draggable = true;
    row.ondragstart = (e) => {
      const [ci, ii] = row.dataset.vrow.split(":").map(Number);
      DRAG_ITEM_SRC = { ci, ii };
      DRAG_CAT_SRC = null;
      e.dataTransfer.effectAllowed = "move";
      row.classList.add("dragging");
    };
    row.ondragend = () => row.classList.remove("dragging");
    row.ondragover = (e) => { if (DRAG_ITEM_SRC) e.preventDefault(); };
    row.ondrop = (e) => {
      if (!DRAG_ITEM_SRC) return;
      e.preventDefault();
      const [ci, ii] = row.dataset.vrow.split(":").map(Number);
      if (ci !== DRAG_ITEM_SRC.ci) { toast("لا يمكن نقل بند بين تصنيفات مختلفة بالسحب"); DRAG_ITEM_SRC = null; return; }
      moveItem(ci, DRAG_ITEM_SRC.ii, ii);
      DRAG_ITEM_SRC = null;
    };
  });

  el.querySelectorAll("tr.cat-header-row").forEach(row => {
    row.draggable = true;
    row.ondragstart = (e) => {
      DRAG_CAT_SRC = Number(row.dataset.vcat);
      DRAG_ITEM_SRC = null;
      e.dataTransfer.effectAllowed = "move";
      row.classList.add("dragging");
    };
    row.ondragend = () => row.classList.remove("dragging");
    row.ondragover = (e) => { if (DRAG_CAT_SRC !== null) e.preventDefault(); };
    row.ondrop = (e) => {
      if (DRAG_CAT_SRC === null) return;
      e.preventDefault();
      const targetCi = Number(row.dataset.vcat);
      moveCategory(DRAG_CAT_SRC, targetCi);
      DRAG_CAT_SRC = null;
    };
  });

  el.querySelectorAll("[data-vaddcat]").forEach(pill => pill.onclick = () => {
    const cat = catalog.find(c => c.id === pill.dataset.vaddcat);
    q.categories.push({ catId: cat.id, catName: cat.name, items: [] });
    persist();
    renderQuoteView(el);
  });

  const addCatPill = document.getElementById("vAddCatPill");
  if (addCatPill) addCatPill.onclick = () => {
    openNewCategoryModal((name) => {
      const newCat = { id: uid("cat"), name, items: [] };
      const cats = dbGet("priceCatalog", []);
      cats.push(newCat);
      dbSet("priceCatalog", cats);
      q.categories.push({ catId: newCat.id, catName: newCat.name, items: [] });
      persist();
      renderQuoteView(el);
    });
  };
}
