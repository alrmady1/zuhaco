/* =========================================================
   المحاسبة: محاسبة المشاريع / المحاسبة العامة / ضريبة القيمة المضافة
   ========================================================= */

const VAT_RATE = 0.15;
let ACC_SELECTED_PROJECT = null;
let GEN_EXP_SORT = { key: "date", dir: "desc" };

const ACC_TYPES = ["إيراد مشروع", "دفعة مشتريات", "مصروف مواد", "مصروف عمال", "مصروف نثرية"];
const ACC_TYPE_BADGE = {
  "إيراد مشروع": "green", "فاتورة ضريبية": "green",
  "دفعة مشتريات": "blue", "مصروف مواد": "orange", "مصروف عمال": "orange", "مصروف نثرية": "gray",
};
const PAYMENT_METHODS = ["تحويل بنكي", "كاش", "شبكة", "سداد حكومي"];
/* ---------- قائمة المصاريف والعهد (تصنيفات المصاريف الإدارية وبنودها الفرعية) ---------- */
function defaultExpenseCatalog() {
  const mk = (name, itemNames) => ({ id: uid("ecat"), name, items: (itemNames || []).map(n => ({ id: uid("eit"), name: n })) });
  return [
    mk("مواد", ["إسمنت", "بلوك", "حديد", "رمل", "كهربائيات", "صبغة", "أخرى"]),
    mk("رواتب", []),
    mk("سلفية", []),
    mk("مركبات", []),
    mk("المرافق", []),
    mk("مواد التشغيل والنظافة", []),
    mk("إقامات", ["أجور طبي", "رسوم تجديد", "رسوم نقل كفالة", "رسوم مكتب عمل", "تحويل مهنة"]),
    mk("إيجار", []),
    mk("كهرباء", []),
    mk("غاز", []),
    mk("مشتريات متفرقة", []),
  ];
}
function getExpenseCatalog() {
  let cat = dbGet("expenseCatalog", null);
  if (!cat) { cat = defaultExpenseCatalog(); dbSet("expenseCatalog", cat); }
  // العهد لها صفحتها المستقلة (تبويب "العهد") — لا يجوز إضافتها كتصنيف ضمن المصاريف الإدارية
  const filtered = cat.filter(c => c.name !== "مصاريف عهدة");
  if (filtered.length !== cat.length) { cat = filtered; dbSet("expenseCatalog", cat); }
  // ترحيل: إضافة تصنيفات "سلفية"/"مركبات"/"المرافق" تلقائياً للأنظمة القائمة التي أُنشئ كتالوجها قبل إضافتها
  const requiredCats = ["سلفية", "مركبات", "المرافق"];
  let addedMissing = false;
  requiredCats.forEach(name => {
    if (!cat.some(c => c.name === name)) { cat.push({ id: uid("ecat"), name, items: [] }); addedMissing = true; }
  });
  if (addedMissing) dbSet("expenseCatalog", cat);
  return cat;
}
function getExpenseCategoryNames() {
  return getExpenseCatalog().map(c => c.name);
}
const GENERAL_CATS = ["رواتب", "إقامات", "إيجار المكتب", "كهرباء", "مركبات"]; // احتياطي (Deprecated) — القائمة الفعلية الآن من getExpenseCategoryNames()

// القيمة الإجمالية للمشروع كما وردت في العقد أو عرض السعر المعتمد المرتبط به (إن وُجد)
function projectTotalValue(project) {
  if (!project) return null;
  if (project.contractId) {
    const contract = dbGet("contracts", []).find(c => c.id === project.contractId);
    if (contract) return contractAmounts(contract).grand;
  }
  if (project.approvedQuoteId) {
    const quote = dbGet("quotes", []).find(q => q.id === project.approvedQuoteId);
    if (quote) return quoteTotal(quote);
  }
  return null;
}

/* ================= محاسبة المشاريع ================= */
function renderAccProjects(el) {
  const projects = dbGet("projects", []);
  if (!ACC_SELECTED_PROJECT && projects.length) ACC_SELECTED_PROJECT = projects[0].id;
  const project = projects.find(p => p.id === ACC_SELECTED_PROJECT);
  const entries = dbGet("accProjects", []).filter(e => e.projectId === ACC_SELECTED_PROJECT).sort((a, b) => (b.date > a.date ? 1 : -1));

  const EXPENSE_TYPES = ["دفعة مشتريات", "مصروف مواد", "مصروف عمال", "مصروف نثرية"];
  const revenue = entries.filter(e => e.type === "إيراد مشروع" || e.type === "فاتورة ضريبية").reduce((s, e) => s + Number(e.amount || 0), 0);
  const expenses = entries.filter(e => EXPENSE_TYPES.includes(e.type)).reduce((s, e) => s + Number(e.amount || 0), 0);
  const net = revenue - expenses;
  const expenseByType = {};
  EXPENSE_TYPES.forEach(t => expenseByType[t] = entries.filter(e => e.type === t).reduce((s, e) => s + Number(e.amount || 0), 0));
  const totalValue = projectTotalValue(project);
  const remaining = totalValue !== null ? totalValue - revenue : null;

  el.innerHTML = `
    <div class="section-title-row">
      <div><h2>محاسبة المشاريع</h2><p>الإيرادات والمصاريف الخاصة بكل مشروع على حدة</p></div>
      <select id="accProjectSelect" style="padding:9px 14px;border:1px solid var(--border);border-radius:8px;font-weight:700">
        ${projects.map(p => `<option value="${p.id}" ${p.id === ACC_SELECTED_PROJECT ? "selected" : ""}>${p.name}</option>`).join("")}
      </select>
    </div>

    <div class="grid cols-3" style="margin-bottom:18px">
      <div class="stat-card"><div class="label">إجمالي الإيرادات</div><div class="value success">${fmtMoney(revenue)}</div></div>
      <div class="stat-card"><div class="label">إجمالي المصاريف</div><div class="value danger">${fmtMoney(expenses)}</div></div>
      <div class="stat-card"><div class="label">صافي الربح</div><div class="value ${net >= 0 ? "success" : "danger"}">${fmtMoney(net)}</div></div>
    </div>

    <div class="grid cols-2" style="margin-bottom:18px">
      <div class="stat-card">
        <div class="label">قيمة المشروع الإجمالية (حسب العقد/عرض السعر المعتمد)</div>
        <div class="value">${totalValue !== null ? fmtMoney(totalValue) : "غير مرتبط بعقد أو عرض سعر معتمد"}</div>
      </div>
      <div class="stat-card">
        <div class="label">المتبقي حتى نهاية المشروع</div>
        <div class="value ${remaining === null ? "" : remaining > 0 ? "warning" : "success"}">${remaining !== null ? fmtMoney(remaining) : "-"}</div>
      </div>
    </div>

    <div class="grid cols-4" style="margin-bottom:18px">
      ${EXPENSE_TYPES.map(t => `<div class="stat-card"><div class="label">${t}</div><div class="value danger">${fmtMoney(expenseByType[t])}</div></div>`).join("")}
    </div>

    <div class="card">
      <div class="flex between wrap" style="margin-bottom:10px">
        <h3 class="mt-0">حركة الحساب — ${project ? project.name : ""}</h3>
        <div class="flex gap">
          <button class="btn sm" id="addEntryBtn">+ إضافة حركة</button>
          <button class="btn sm primary" id="addInvoiceBtn">+ إصدار فاتورة ضريبية</button>
        </div>
      </div>
      ${entries.length ? `
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>النوع</th><th>المبلغ</th><th>ضريبة القيمة المضافة</th><th>التاريخ</th><th>ملاحظات</th><th>المرفق</th><th></th></tr></thead>
          <tbody>
            ${entries.map(e => `
              <tr>
                <td><span class="badge ${ACC_TYPE_BADGE[e.type] || "gray"}">${e.type}</span></td>
                <td><strong>${fmtMoney(e.amount)}</strong></td>
                <td>${e.vatApplicable ? `<span class="badge blue">خاضع (${fmtMoney(e.vatAmount || Number(e.amount) * VAT_RATE)})</span>` : `<span class="badge gray">غير خاضع</span>`}</td>
                <td>${fmtDate(e.date)}</td>
                <td class="text-muted">
                  ${e.note || (e.invoiceNumber ? "فاتورة رقم " + e.invoiceNumber : "-")}
                  ${e.vendorName ? `<br><span style="font-size:11px">التاجر: ${e.vendorName}${e.invoiceRefNumber ? " — فاتورة رقم " + e.invoiceRefNumber : ""}</span>` : ""}
                  ${e.paymentMethod ? `<br><span class="badge gray" style="font-size:10.5px">${e.paymentMethod}</span>` : ""}
                </td>
                <td>${e.attachment ? `<a href="${e.attachment.url}" target="_blank" rel="noopener" class="badge blue" style="text-decoration:none">📎 عرض المرفق</a>` : "-"}</td>
                <td>
                  ${e.type === "فاتورة ضريبية" ? `<button class="btn sm" data-printinv="${e.id}">طباعة</button>` : `<button class="btn-icon" data-viewentry="${e.id}" title="عرض">${ICON_VIEW}</button><button class="btn-icon" data-editentry="${e.id}" title="تعديل">${ICON_EDIT}</button>`}
                  <button class="btn-icon danger" data-delentry="${e.id}" title="حذف">${ICON_DELETE}</button>
                </td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>` : `<div class="empty-state"><div class="ic">💵</div>لا توجد حركات مالية لهذا المشروع بعد</div>`}
    </div>
  `;

  document.getElementById("accProjectSelect").onchange = (e) => { ACC_SELECTED_PROJECT = e.target.value; renderAccProjects(el); };
  document.getElementById("addEntryBtn").onclick = () => openAccEntryModal(el);
  document.getElementById("addInvoiceBtn").onclick = () => openInvoiceModal(el);
  el.querySelectorAll("[data-delentry]").forEach(b => b.onclick = () => {
    if (!confirm("حذف هذه الحركة؟")) return;
    const target = dbGet("accProjects", []).find(x => x.id === b.dataset.delentry);
    dbSet("accProjects", dbGet("accProjects", []).filter(x => x.id !== b.dataset.delentry));
    if (target) logActivity(`تم حذف حركة مالية "${target.type}" بقيمة ${fmtMoney(target.amount)}`);
    renderAccProjects(el);
  });
  el.querySelectorAll("[data-printinv]").forEach(b => b.onclick = () => printInvoice(b.dataset.printinv));
  el.querySelectorAll("[data-editentry]").forEach(b => b.onclick = () => {
    const target = dbGet("accProjects", []).find(x => x.id === b.dataset.editentry);
    if (target) openAccEntryModal(el, target);
  });
  el.querySelectorAll("[data-viewentry]").forEach(b => b.onclick = () => {
    const target = dbGet("accProjects", []).find(x => x.id === b.dataset.viewentry);
    if (target) openAccEntryViewModal(target);
  });
}

/* عرض تفصيلي للحركة المالية (بدون تعديل) — يوضّح كل بياناتها بما فيها التاجر ورقم الفاتورة وطريقة السداد والمرفق */
function openAccEntryViewModal(e) {
  const html = `
    <div class="modal-head"><h3>تفاصيل الحركة المالية</h3><button class="modal-close" id="mClose">×</button></div>
    <div class="kv-row"><span class="k">النوع</span><span class="v">${e.type}</span></div>
    <div class="kv-row"><span class="k">المبلغ</span><span class="v">${fmtMoney(e.amount)}</span></div>
    <div class="kv-row"><span class="k">التاريخ</span><span class="v">${fmtDate(e.date)}</span></div>
    <div class="kv-row"><span class="k">ضريبة القيمة المضافة</span><span class="v">${e.vatApplicable ? `خاضع (${fmtMoney(e.vatAmount || Number(e.amount) * VAT_RATE)})` : "غير خاضع"}</span></div>
    ${e.vendorName ? `<div class="kv-row"><span class="k">التاجر / المورّد</span><span class="v">${e.vendorName}</span></div>` : ""}
    ${e.invoiceRefNumber ? `<div class="kv-row"><span class="k">رقم الفاتورة</span><span class="v">${e.invoiceRefNumber}</span></div>` : ""}
    ${e.paymentMethod ? `<div class="kv-row"><span class="k">طريقة السداد/الاستلام</span><span class="v">${e.paymentMethod}</span></div>` : ""}
    ${e.note ? `<div class="kv-row"><span class="k">ملاحظات</span><span class="v">${e.note}</span></div>` : ""}
    ${e.attachment ? `<div class="kv-row"><span class="k">المرفق</span><span class="v"><a href="${e.attachment.url}" target="_blank" rel="noopener">📎 ${e.attachment.name || "عرض المرفق"}</a></span></div>` : ""}
    <div class="flex gap" style="margin-top:14px"><button class="btn" id="v_close">إغلاق</button></div>
  `;
  const ov = openModalShell(html);
  ov.querySelector("#mClose").onclick = closeModal;
  ov.querySelector("#v_close").onclick = closeModal;
}

function openAccEntryModal(el, existingEntry) {
  const isEdit = !!existingEntry;
  const html = `
    <div class="modal-head"><h3>${isEdit ? "تعديل حركة مالية" : "إضافة حركة مالية للمشروع"}</h3><button class="modal-close" id="mClose">×</button></div>
    <div class="field"><label>نوع الحركة</label>
      <select id="e_type">${ACC_TYPES.map(t => `<option value="${t}" ${isEdit && existingEntry.type === t ? "selected" : ""}>${t}</option>`).join("")}</select>
    </div>
    <div class="grid cols-2">
      <div class="field"><label>المبلغ (ر.س)</label><input type="number" min="0" step="0.01" id="e_amount" value="${isEdit ? existingEntry.amount : ""}"></div>
      <div class="field"><label>التاريخ</label><input type="date" id="e_date" value="${isEdit ? existingEntry.date : todayISO()}"></div>
    </div>
    <div id="e_extra"></div>
    <div class="field"><label><input type="checkbox" id="e_vat" ${isEdit && existingEntry.vatApplicable ? "checked" : ""} style="width:auto;display:inline-block"> خاضع لضريبة القيمة المضافة (15%)</label></div>
    <div class="field"><label>ملاحظات</label><textarea id="e_note">${isEdit ? (existingEntry.note || "") : ""}</textarea></div>
    <div class="flex gap"><button class="btn primary" id="e_save">حفظ</button><button class="btn" id="e_cancel">إلغاء</button></div>
  `;
  const ov = openModalShell(html);
  ov.querySelector("#mClose").onclick = closeModal;
  ov.querySelector("#e_cancel").onclick = closeModal;

  const typeSelect = ov.querySelector("#e_type");
  const extraBox = ov.querySelector("#e_extra");
  let attachment = isEdit ? (existingEntry.attachment || null) : null;

  function renderExtra() {
    const type = typeSelect.value;
    if (type === "دفعة مشتريات") {
      extraBox.innerHTML = `
        <div class="grid cols-2">
          <div class="field"><label>رقم الفاتورة</label><input id="e_invoiceRef" value="${isEdit ? (existingEntry.invoiceRefNumber || "") : ""}"></div>
          <div class="field"><label>طريقة السداد</label><select id="e_paymentMethod">${PAYMENT_METHODS.map(m => `<option value="${m}" ${isEdit && existingEntry.paymentMethod === m ? "selected" : ""}>${m}</option>`).join("")}</select></div>
        </div>
        <div class="field"><label>اسم التاجر / المورّد</label><input id="e_vendor" value="${isEdit ? (existingEntry.vendorName || "") : ""}"></div>
        <div class="field">
          <label>صورة الفاتورة أو إيصال التحويل (اختياري)</label>
          <input type="file" id="e_attachment" accept=".pdf,image/*">
          <div id="e_attachmentPreview" class="flex wrap" style="margin-top:8px">${attachment ? `<span class="file-chip">📎 ${attachment.name || "المرفق الحالي"}</span>` : ""}</div>
        </div>
      `;
      wireAttachment();
    } else if (type === "إيراد مشروع") {
      extraBox.innerHTML = `
        <div class="field"><label>طريقة الاستلام</label><select id="e_paymentMethod">${PAYMENT_METHODS.map(m => `<option value="${m}" ${isEdit && existingEntry.paymentMethod === m ? "selected" : ""}>${m}</option>`).join("")}</select></div>
        <div class="field">
          <label>إيصال التحويل أو الاستلام (اختياري)</label>
          <input type="file" id="e_attachment" accept=".pdf,image/*">
          <div id="e_attachmentPreview" class="flex wrap" style="margin-top:8px">${attachment ? `<span class="file-chip">📎 ${attachment.name || "المرفق الحالي"}</span>` : ""}</div>
        </div>
      `;
      wireAttachment();
    } else {
      extraBox.innerHTML = "";
    }
  }

  function wireAttachment() {
    const input = ov.querySelector("#e_attachment");
    if (!input) return;
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) { attachment = null; ov.querySelector("#e_attachmentPreview").innerHTML = ""; return; }
      const url = await fileToDataURL(file);
      attachment = { name: file.name, type: file.type, url };
      ov.querySelector("#e_attachmentPreview").innerHTML = `<span class="file-chip">📎 ${file.name}</span>`;
    };
  }

  typeSelect.onchange = renderExtra;
  renderExtra();

  ov.querySelector("#e_save").onclick = () => {
    const amount = Number(ov.querySelector("#e_amount").value) || 0;
    if (amount <= 0) { toast("يرجى إدخال مبلغ صحيح"); return; }
    const vatApplicable = ov.querySelector("#e_vat").checked;
    const type = typeSelect.value;
    const entry = {
      id: isEdit ? existingEntry.id : uid("ae"), projectId: ACC_SELECTED_PROJECT, type,
      amount, vatApplicable, vatAmount: vatApplicable ? amount * VAT_RATE : 0,
      date: ov.querySelector("#e_date").value || todayISO(), note: ov.querySelector("#e_note").value.trim(),
    };
    const paymentSelect = ov.querySelector("#e_paymentMethod");
    if (paymentSelect) entry.paymentMethod = paymentSelect.value;
    if (type === "دفعة مشتريات") {
      entry.invoiceRefNumber = ov.querySelector("#e_invoiceRef").value.trim();
      entry.vendorName = ov.querySelector("#e_vendor").value.trim();
      entry.attachment = attachment;
    } else if (type === "إيراد مشروع") {
      entry.attachment = attachment;
    }
    const entries = dbGet("accProjects", []);
    if (isEdit) {
      const idx = entries.findIndex(x => x.id === existingEntry.id);
      if (idx >= 0) entries[idx] = entry; else entries.push(entry);
    } else {
      entries.push(entry);
    }
    dbSet("accProjects", entries);
    const projectName = (dbGet("projects", []).find(p => p.id === ACC_SELECTED_PROJECT) || {}).name || "";
    logActivity(`تم ${isEdit ? "تعديل" : "تسجيل"} حركة "${type}" بقيمة ${fmtMoney(amount)} لمشروع "${projectName}"`);
    toast(isEdit ? "تم حفظ التعديلات على الحركة" : "تم إضافة الحركة المالية");
    closeModal();
    renderAccProjects(el);
  };
}

function openInvoiceModal(el) {
  const projects = dbGet("projects", []);
  const project = projects.find(p => p.id === ACC_SELECTED_PROJECT);
  const html = `
    <div class="modal-head"><h3>إصدار فاتورة ضريبية</h3><button class="modal-close" id="mClose">×</button></div>
    <div class="field"><label>اسم العميل</label><input id="i_client" value="${project ? project.client : ""}"></div>
    <div class="field"><label>الرقم الضريبي للعميل (اختياري)</label><input id="i_tax"></div>
    <div class="field"><label>وصف الفاتورة</label><input id="i_desc" placeholder="مثال: دفعة أعمال تشطيبات"></div>
    <div class="grid cols-2">
      <div class="field"><label>المبلغ قبل الضريبة (ر.س)</label><input type="number" min="0" step="0.01" id="i_amount"></div>
      <div class="field"><label>التاريخ</label><input type="date" id="i_date" value="${todayISO()}"></div>
    </div>
    <div class="flex gap"><button class="btn primary" id="i_save">إصدار الفاتورة</button><button class="btn" id="i_cancel">إلغاء</button></div>
  `;
  const ov = openModalShell(html);
  ov.querySelector("#mClose").onclick = closeModal;
  ov.querySelector("#i_cancel").onclick = closeModal;
  ov.querySelector("#i_save").onclick = () => {
    const amount = Number(ov.querySelector("#i_amount").value) || 0;
    if (amount <= 0) { toast("يرجى إدخال مبلغ صحيح"); return; }
    const vat = amount * VAT_RATE;
    const entries = dbGet("accProjects", []);
    const invoiceNumber = "INV-" + (2000 + entries.filter(x => x.type === "فاتورة ضريبية").length + 1);
    entries.push({
      id: uid("inv"), projectId: ACC_SELECTED_PROJECT, projectName: project ? project.name : "",
      type: "فاتورة ضريبية", client: ov.querySelector("#i_client").value.trim(),
      taxNumber: ov.querySelector("#i_tax").value.trim(), description: ov.querySelector("#i_desc").value.trim(),
      amountBeforeTax: amount, vatAmount: vat, amount: amount + vat, vatApplicable: true,
      invoiceNumber, date: ov.querySelector("#i_date").value || todayISO(),
    });
    dbSet("accProjects", entries);
    logActivity(`تم إصدار فاتورة "${invoiceNumber}" للعميل "${ov.querySelector("#i_client").value.trim()}" بقيمة ${fmtMoney(amount + vat)}`);
    toast("تم إصدار الفاتورة الضريبية");
    closeModal();
    renderAccProjects(el);
    printInvoice(entries[entries.length - 1].id);
  };
}

function printInvoice(id) {
  const inv = dbGet("accProjects", []).find(x => x.id === id);
  if (!inv) return;
  const html = `
    <div class="modal-head no-print"><h3>فاتورة ضريبية</h3><button class="modal-close" id="mClose">×</button></div>
    <div style="text-align:center;margin-bottom:18px">
      <h2 style="margin:0">شركة زهى الاعمال للمقاولات</h2>
      <p class="text-muted">فاتورة ضريبية رقم ${inv.invoiceNumber}</p>
    </div>
    <div class="kv-row"><span class="k">المشروع</span><span class="v">${inv.projectName}</span></div>
    <div class="kv-row"><span class="k">العميل</span><span class="v">${inv.client}</span></div>
    <div class="kv-row"><span class="k">الرقم الضريبي للعميل</span><span class="v">${inv.taxNumber || "-"}</span></div>
    <div class="kv-row"><span class="k">التاريخ</span><span class="v">${fmtDate(inv.date)}</span></div>
    <div class="kv-row"><span class="k">الوصف</span><span class="v">${inv.description || "-"}</span></div>
    <hr style="margin:14px 0;border:none;border-top:1px solid var(--border)">
    <div class="kv-row"><span class="k">المبلغ قبل الضريبة</span><span class="v">${fmtMoney(inv.amountBeforeTax)}</span></div>
    <div class="kv-row"><span class="k">ضريبة القيمة المضافة (15%)</span><span class="v">${fmtMoney(inv.vatAmount)}</span></div>
    <div class="grand-total-box" style="margin-top:10px"><div>الإجمالي المستحق</div><div class="num">${fmtMoney(inv.amount)}</div></div>
    <div class="flex gap no-print" style="margin-top:16px"><button class="btn primary" id="printBtn">🖨️ طباعة</button><button class="btn" id="i_close">إغلاق</button></div>
  `;
  const ov = openModalShell(html);
  ov.querySelector("#mClose").onclick = closeModal;
  ov.querySelector("#i_close").onclick = closeModal;
  ov.querySelector("#printBtn").onclick = () => window.print();
}

/* ================= المحاسبة العامة (العهد والمصروفات) ================= */
let ACC_GENERAL_TAB = "expenses"; // expenses | custody | projects | vat

function renderAccGeneral(el) {
  el.innerHTML = `
    <div class="section-title-row"><div><h2>المحاسبة العامة</h2><p>المصاريف الإدارية العامة للمؤسسة وعُهد الموظفين</p></div></div>
    <div class="tabs">
      <div class="tab-btn ${ACC_GENERAL_TAB === "expenses" ? "active" : ""}" data-gtab="expenses">المصاريف الإدارية</div>
      <div class="tab-btn ${ACC_GENERAL_TAB === "custody" ? "active" : ""}" data-gtab="custody">العهد</div>
      <div class="tab-btn ${ACC_GENERAL_TAB === "projects" ? "active" : ""}" data-gtab="projects">المشاريع</div>
      <div class="tab-btn ${ACC_GENERAL_TAB === "vat" ? "active" : ""}" data-gtab="vat">الضريبة</div>
    </div>
    <div id="accGeneralBody"></div>
  `;
  el.querySelectorAll("[data-gtab]").forEach(t => t.onclick = () => { ACC_GENERAL_TAB = t.dataset.gtab; renderAccGeneral(el); });

  const body = document.getElementById("accGeneralBody");
  if (ACC_GENERAL_TAB === "custody") renderCustodyTab(body);
  else if (ACC_GENERAL_TAB === "projects") renderAccGeneralProjectsTab(body);
  else if (ACC_GENERAL_TAB === "vat") renderAccGeneralVatTab(body);
  else renderGeneralExpensesTab(body);
}

/* ---------- تبويب المشاريع (إيرادات وتفاصيل مالية للمشاريع النشطة والمنتهية) ---------- */
function renderAccGeneralProjectsTab(el) {
  const projects = dbGet("projects", []);
  const entries = dbGet("accProjects", []);

  function statsFor(projectId) {
    const list = entries.filter(e => e.projectId === projectId);
    const revenue = list.filter(e => e.type === "إيراد مشروع" || e.type === "فاتورة ضريبية").reduce((s, e) => s + Number(e.amount || 0), 0);
    const expenses = list.filter(e => ["دفعة مشتريات", "مصروف مواد", "مصروف عمال", "مصروف نثرية"].includes(e.type)).reduce((s, e) => s + Number(e.amount || 0), 0);
    return { revenue, expenses, net: revenue - expenses };
  }

  function tableFor(list, emptyMsg) {
    if (!list.length) return `<div class="empty-state"><div class="ic">📁</div>${emptyMsg}</div>`;
    let totalRev = 0, totalExp = 0;
    const rows = list.map(p => {
      const s = statsFor(p.id); totalRev += s.revenue; totalExp += s.expenses;
      return `<tr>
        <td>${p.name}</td>
        <td>${statusBadge2(p.status)}</td>
        <td class="text-muted">${p.client || "-"}</td>
        <td><strong class="success">${fmtMoney(s.revenue)}</strong></td>
        <td><strong class="danger">${fmtMoney(s.expenses)}</strong></td>
        <td><strong class="${s.net >= 0 ? "success" : "danger"}">${fmtMoney(s.net)}</strong></td>
      </tr>`;
    }).join("");
    return `<div class="table-wrap"><table class="data-table">
      <thead><tr><th>المشروع</th><th>الحالة</th><th>العميل</th><th>الإيرادات</th><th>المصاريف</th><th>صافي الربح</th></tr></thead>
      <tbody>${rows}
      <tr style="font-weight:800"><td colspan="3">الإجمالي</td><td class="success">${fmtMoney(totalRev)}</td><td class="danger">${fmtMoney(totalExp)}</td><td class="${totalRev - totalExp >= 0 ? "success" : "danger"}">${fmtMoney(totalRev - totalExp)}</td></tr>
      </tbody></table></div>`;
  }

  const active = projects.filter(p => p.status !== "مكتمل");
  const finished = projects.filter(p => p.status === "مكتمل");

  el.innerHTML = `
    <div class="card"><h3 class="mt-0">المشاريع النشطة (${active.length})</h3>${tableFor(active, "لا توجد مشاريع نشطة")}</div>
    <div class="card"><h3 class="mt-0">المشاريع المنتهية (${finished.length})</h3>${tableFor(finished, "لا توجد مشاريع منتهية بعد")}</div>
  `;
}

/* ---------- تبويب الضريبة (تفصيل ربع سنوي جاهز لإقرار هيئة الزكاة والضريبة والجمارك) ---------- */
function renderAccGeneralVatTab(el) {
  const now = new Date();
  if (!renderAccGeneralVatTab.year) renderAccGeneralVatTab.year = now.getFullYear();
  if (!renderAccGeneralVatTab.quarter) renderAccGeneralVatTab.quarter = Math.ceil((now.getMonth() + 1) / 3);
  const year = renderAccGeneralVatTab.year, quarter = renderAccGeneralVatTab.quarter;

  const inRange = (dateStr) => new Date(dateStr).getFullYear() === year && quarterOf(dateStr) === quarter;
  const projEntries = dbGet("accProjects", []).filter(e => e.vatApplicable && inRange(e.date));
  const genEntries = dbGet("accGeneral", []).filter(e => e.vatApplicable && inRange(e.date));

  const revenueEntries = projEntries.filter(e => e.type === "إيراد مشروع" || e.type === "فاتورة ضريبية")
    .slice().sort((a, b) => (a.date > b.date ? 1 : -1));
  const purchaseEntries = [
    ...projEntries.filter(e => ["دفعة مشتريات", "مصروف مواد", "مصروف عمال", "مصروف نثرية"].includes(e.type)),
    ...genEntries,
  ].slice().sort((a, b) => (a.date > b.date ? 1 : -1));

  const outputSales = revenueEntries.reduce((s, e) => s + Number(e.amountBeforeTax ?? e.amount), 0);
  const outputVat = revenueEntries.reduce((s, e) => s + Number(e.vatAmount || 0), 0);
  const inputPurchases = purchaseEntries.reduce((s, e) => s + Number(e.amount), 0);
  const inputVat = purchaseEntries.reduce((s, e) => s + Number(e.vatAmount || 0), 0);
  const net = outputVat - inputVat;

  function projectNameOf(e) { return (dbGet("projects", []).find(p => p.id === e.projectId) || {}).name || "-"; }

  el.innerHTML = `
    <div class="card no-print">
      <div class="flex gap wrap" style="align-items:flex-end">
        <div class="field" style="margin-bottom:0"><label>السنة</label><input type="number" id="tvatYear" value="${year}" style="width:110px"></div>
        <div class="field" style="margin-bottom:0"><label>الربع</label>
          <select id="tvatQuarter" style="width:150px">
            ${[1, 2, 3, 4].map(q => `<option value="${q}" ${q === quarter ? "selected" : ""}>الربع ${q} (${["يناير-مارس", "أبريل-يونيو", "يوليو-سبتمبر", "أكتوبر-ديسمبر"][q - 1]})</option>`).join("")}
          </select>
        </div>
        <button class="btn" id="tvatGo">عرض</button>
        <button class="btn primary" id="tvatPrint" style="margin-inline-start:auto">🖨️ طباعة التقرير</button>
      </div>
      <p class="text-muted" style="font-size:12px;margin:10px 0 0">تفصيل جاهز لتعبئة إقرار ضريبة القيمة المضافة الربع سنوي في بوابة هيئة الزكاة والضريبة والجمارك (ZATCA) — التقديم الفعلي يتم يدوياً عبر بوابة الهيئة.</p>
    </div>

    <div class="card">
      <h3 class="mt-0">الإيرادات الخاضعة للضريبة (${revenueEntries.length})</h3>
      ${revenueEntries.length ? `
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>التاريخ</th><th>المشروع</th><th>البيان</th><th>المبلغ قبل الضريبة</th><th>الضريبة (15%)</th><th>الإجمالي</th></tr></thead>
          <tbody>
            ${revenueEntries.map(e => `
              <tr>
                <td>${fmtDate(e.date)}</td>
                <td>${projectNameOf(e)}</td>
                <td class="text-muted">${e.type === "فاتورة ضريبية" ? "فاتورة رقم " + e.invoiceNumber + (e.client ? " — " + e.client : "") : (e.note || e.type)}</td>
                <td>${fmtMoney(e.amountBeforeTax ?? e.amount)}</td>
                <td>${fmtMoney(e.vatAmount || 0)}</td>
                <td><strong>${fmtMoney((e.amountBeforeTax ?? e.amount) + Number(e.vatAmount || 0))}</strong></td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>` : `<div class="empty-state"><div class="ic">💰</div>لا توجد إيرادات خاضعة للضريبة في هذا الربع</div>`}
    </div>

    <div class="card">
      <h3 class="mt-0">المشتريات والمصاريف الخاضعة للضريبة (${purchaseEntries.length})</h3>
      ${purchaseEntries.length ? `
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>التاريخ</th><th>البيان</th><th>المبلغ قبل الضريبة</th><th>الضريبة (15%)</th><th>الإجمالي</th></tr></thead>
          <tbody>
            ${purchaseEntries.map(e => `
              <tr>
                <td>${fmtDate(e.date)}</td>
                <td class="text-muted">${e.projectId ? projectNameOf(e) + " — " + e.type : e.category + (generalExpenseSubtitle(e) ? " — " + generalExpenseSubtitle(e) : "")}</td>
                <td>${fmtMoney(e.amount)}</td>
                <td>${fmtMoney(e.vatAmount || 0)}</td>
                <td><strong>${fmtMoney(Number(e.amount) + Number(e.vatAmount || 0))}</strong></td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>` : `<div class="empty-state"><div class="ic">🧾</div>لا توجد مشتريات خاضعة للضريبة في هذا الربع</div>`}
    </div>

    <div class="grid cols-2" style="margin-bottom:18px">
      <div class="card">
        <h3>ضريبة المخرجات (المبيعات)</h3>
        <div class="kv-row"><span class="k">إجمالي المبيعات الخاضعة للضريبة</span><span class="v">${fmtMoney(outputSales)}</span></div>
        <div class="kv-row"><span class="k">ضريبة المخرجات (15%)</span><span class="v">${fmtMoney(outputVat)}</span></div>
      </div>
      <div class="card">
        <h3>ضريبة المدخلات (المشتريات والمصاريف)</h3>
        <div class="kv-row"><span class="k">إجمالي المشتريات الخاضعة للضريبة</span><span class="v">${fmtMoney(inputPurchases)}</span></div>
        <div class="kv-row"><span class="k">ضريبة المدخلات (15%)</span><span class="v">${fmtMoney(inputVat)}</span></div>
      </div>
    </div>

    <div class="grand-total-box">
      <div>${net >= 0 ? "صافي الضريبة المستحقة للهيئة" : "صافي الضريبة القابلة للاسترداد"}</div>
      <div class="num">${fmtMoney(Math.abs(net))}</div>
    </div>
  `;

  document.getElementById("tvatGo").onclick = () => {
    renderAccGeneralVatTab.year = Number(document.getElementById("tvatYear").value) || year;
    renderAccGeneralVatTab.quarter = Number(document.getElementById("tvatQuarter").value) || quarter;
    renderAccGeneralVatTab(el);
  };
  document.getElementById("tvatPrint").onclick = () => window.print();
}

function generalExpenseSubtitle(e) {
  if (e.category === "رواتب" && e.employeeName) {
    return `${e.employeeName}${e.salaryMonth ? " — راتب شهر " + salaryMonthLabel(e.salaryMonth) : ""}`;
  }
  if (e.category === "سلفية" && e.advanceEmployeeName) {
    return `${e.advanceEmployeeName} — ${e.advanceStatus === "exempt" ? "معفية" : "تُخصم من الراتب القادم"}`;
  }
  const parts = [];
  if (e.subItem) parts.push(e.subItem);
  if (e.facilityName) parts.push("المرفق: " + e.facilityName);
  if (e.vehicleLabel) parts.push("المركبة: " + e.vehicleLabel);
  if (e.vehicleExpenseType) parts.push(e.vehicleExpenseType);
  return parts.join(" — ");
}

function salaryMonthLabel(ym) {
  if (!ym) return "";
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString("ar-SA-u-ca-gregory", { year: "numeric", month: "long" });
}

function generalExpenseSortTh(label, key) {
  const active = GEN_EXP_SORT.key === key;
  const arrow = active ? (GEN_EXP_SORT.dir === "asc" ? " ▲" : " ▼") : "";
  return `<th class="sortable-th" data-sortkey="${key}">${label}${arrow}</th>`;
}

function renderGeneralExpensesTab(el) {
  const list = dbGet("accGeneral", []).slice();
  const { key, dir } = GEN_EXP_SORT;
  const mul = dir === "asc" ? 1 : -1;
  list.sort((a, b) => {
    let av, bv;
    if (key === "amount") { av = Number(a.amount) || 0; bv = Number(b.amount) || 0; }
    else if (key === "category") { av = a.category || ""; bv = b.category || ""; }
    else { av = a.date || ""; bv = b.date || ""; }
    if (av < bv) return -1 * mul;
    if (av > bv) return 1 * mul;
    return 0;
  });
  const total = list.reduce((s, e) => s + Number(e.amount || 0), 0);
  const catNames = getExpenseCategoryNames();
  const byCat = {};
  catNames.forEach(c => byCat[c] = 0);
  list.forEach(e => byCat[e.category] = (byCat[e.category] || 0) + Number(e.amount || 0));

  el.innerHTML = `
    <div class="flex between" style="margin-bottom:14px"><div></div><button class="btn primary" id="addGeneralBtn">+ إضافة مصروف</button></div>

    <div class="grid cols-4" style="margin-bottom:18px">
      ${catNames.map(c => `<div class="stat-card"><div class="label">${c}</div><div class="value">${fmtMoney(byCat[c])}</div></div>`).join("")}
    </div>
    <div class="stat-card" style="margin-bottom:18px;max-width:320px"><div class="label">إجمالي المصاريف الإدارية</div><div class="value danger">${fmtMoney(total)}</div></div>

    <div class="card">
      <h3>سجل المصاريف الإدارية</h3>
      ${list.length ? `
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr>${generalExpenseSortTh("التصنيف", "category")}<th>التفاصيل</th>${generalExpenseSortTh("المبلغ", "amount")}<th>طريقة الدفع</th>${generalExpenseSortTh("التاريخ", "date")}<th>ملاحظات</th><th>المرفق</th><th></th></tr></thead>
          <tbody>
            ${list.map(e => `
              <tr>
                <td><span class="badge gray">${e.category}</span></td>
                <td class="text-muted">${generalExpenseSubtitle(e) || "-"}</td>
                <td><strong>${fmtMoney(e.amount)}</strong></td>
                <td>${e.paymentMethod ? `<span class="badge blue">${e.paymentMethod}</span>` : "-"}</td>
                <td>${fmtDate(e.date)}</td>
                <td class="text-muted">${e.note || "-"}</td>
                <td>${e.attachment ? `<a href="${e.attachment.url}" target="_blank" rel="noopener" class="badge blue" style="text-decoration:none">📎 عرض المرفق</a>` : "-"}</td>
                <td>
                  <button class="btn-icon" data-viewgen="${e.id}" title="عرض">${ICON_VIEW}</button>
                  <button class="btn-icon" data-editgen="${e.id}" title="تعديل">${ICON_EDIT}</button>
                  <button class="btn-icon danger" data-delgen="${e.id}" title="حذف">${ICON_DELETE}</button>
                </td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>` : `<div class="empty-state"><div class="ic">🏢</div>لا توجد مصاريف إدارية مسجلة بعد</div>`}
    </div>
  `;

  document.getElementById("addGeneralBtn").onclick = () => openGeneralExpenseModal(el);
  el.querySelectorAll("[data-sortkey]").forEach(th => th.onclick = () => {
    const k = th.dataset.sortkey;
    if (GEN_EXP_SORT.key === k) GEN_EXP_SORT.dir = GEN_EXP_SORT.dir === "asc" ? "desc" : "asc";
    else GEN_EXP_SORT = { key: k, dir: k === "date" ? "desc" : "asc" };
    renderGeneralExpensesTab(el);
  });
  el.querySelectorAll("[data-viewgen]").forEach(b => b.onclick = () => {
    const target = dbGet("accGeneral", []).find(x => x.id === b.dataset.viewgen);
    if (target) openGeneralExpenseViewModal(target);
  });
  el.querySelectorAll("[data-editgen]").forEach(b => b.onclick = () => {
    const target = dbGet("accGeneral", []).find(x => x.id === b.dataset.editgen);
    if (target) openGeneralExpenseModal(el, target);
  });
  el.querySelectorAll("[data-delgen]").forEach(b => b.onclick = () => {
    if (!confirm("حذف هذا المصروف؟")) return;
    const target = dbGet("accGeneral", []).find(x => x.id === b.dataset.delgen);
    dbSet("accGeneral", dbGet("accGeneral", []).filter(x => x.id !== b.dataset.delgen));
    if (target) logActivity(`تم حذف مصروف إداري "${target.category}" بقيمة ${fmtMoney(target.amount)}`);
    renderGeneralExpensesTab(el);
  });
}

/* ================= العهد ================= */
function custodyBalance(c) {
  return (c.transactions || []).reduce((s, t) => s + (t.type === "إيداع" ? Number(t.amount) || 0 : -(Number(t.amount) || 0)), 0);
}

function renderCustodyTab(el) {
  const custodies = dbGet("custodies", []).slice().sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  el.innerHTML = `
    <div class="flex between" style="margin-bottom:14px"><div></div><button class="btn primary" id="addCustodyBtn">+ عهدة جديدة</button></div>
    ${custodies.length ? custodies.map(c => {
      const balance = custodyBalance(c);
      return `
      <div class="contract-row" data-opencustody="${c.id}">
        <div class="contract-row-icon">💼</div>
        <div class="contract-row-info">
          <div class="contract-row-title">${c.employeeName}</div>
          <div class="contract-row-sub">${c.scopeType === "project" ? "مشروع: " + (c.projectName || "-") : "مصاريف عامة"} · ${c.purpose || ""} · <span class="badge ${c.status === "مفتوحة" ? "orange" : "gray"}">${c.status}</span></div>
        </div>
        <div class="contract-row-amount" style="color:${balance >= 0 ? "var(--success)" : "var(--danger)"}">الرصيد: ${fmtMoney(balance)}</div>
        <div class="contract-row-actions no-print">
          <button class="btn-icon" data-opencustody="${c.id}" title="فتح">${ICON_VIEW}</button>
          <button class="btn-icon danger" data-delcustody="${c.id}" title="حذف">${ICON_DELETE}</button>
        </div>
      </div>`;
    }).join("") : `<div class="card empty-state"><div class="ic">💼</div>لا توجد عُهد مسجلة بعد</div>`}
  `;

  document.getElementById("addCustodyBtn").onclick = () => openNewCustodyModal(el);
  el.querySelectorAll("[data-opencustody]").forEach(x => x.onclick = () => openCustodyDetailModal(x.dataset.opencustody, el));
  el.querySelectorAll("[data-delcustody]").forEach(x => x.onclick = (e) => {
    e.stopPropagation();
    if (!confirm("حذف هذه العهدة وكل حركاتها؟")) return;
    const target = custodies.find(c => c.id === x.dataset.delcustody);
    dbSet("custodies", dbGet("custodies", []).filter(c => c.id !== x.dataset.delcustody));
    if (target) logActivity(`تم حذف عهدة الموظف "${target.employeeName}"`);
    renderCustodyTab(el);
  });
}

function openNewCustodyModal(el) {
  const users = dbGet("users", []);
  const projects = dbGet("projects", []);
  const html = `
    <div class="modal-head"><h3>عهدة جديدة</h3><button class="modal-close" id="mClose">×</button></div>
    <div class="field"><label>الموظف</label>
      <select id="cu_emp">${users.map(u => `<option value="${u.id}">${u.name} — ${u.role}</option>`).join("")}</select>
    </div>
    <div class="field"><label>نوع العهدة</label>
      <div class="pill-group">
        <div class="pill active" data-scope="general">مصاريف عامة</div>
        <div class="pill" data-scope="project">مشروع محدد</div>
      </div>
    </div>
    <div class="field" id="cu_projectField" style="display:none"><label>المشروع</label>
      <select id="cu_project">${projects.map(p => `<option value="${p.id}">${p.name}</option>`).join("")}</select>
    </div>
    <div class="field"><label>الغرض من العهدة</label><input id="cu_purpose" placeholder="مثال: مصاريف نثرية ميدانية"></div>
    <div class="grid cols-2">
      <div class="field"><label>المبلغ الابتدائي (ر.س)</label><input type="number" min="0" step="0.01" id="cu_amount"></div>
      <div class="field"><label>التاريخ</label><input type="date" id="cu_date" value="${todayISO()}"></div>
    </div>
    <div class="flex gap"><button class="btn primary" id="cu_save">حفظ العهدة</button><button class="btn" id="cu_cancel">إلغاء</button></div>
  `;
  const ov = openModalShell(html);
  ov.querySelector("#mClose").onclick = closeModal;
  ov.querySelector("#cu_cancel").onclick = closeModal;

  let scopeType = "general";
  ov.querySelectorAll("[data-scope]").forEach(pill => pill.onclick = () => {
    scopeType = pill.dataset.scope;
    ov.querySelectorAll("[data-scope]").forEach(p => p.classList.toggle("active", p === pill));
    ov.querySelector("#cu_projectField").style.display = scopeType === "project" ? "block" : "none";
  });

  ov.querySelector("#cu_save").onclick = () => {
    const empId = ov.querySelector("#cu_emp").value;
    const emp = users.find(u => u.id === empId);
    const amount = Number(ov.querySelector("#cu_amount").value) || 0;
    if (!emp) { toast("يرجى اختيار الموظف"); return; }
    if (amount <= 0) { toast("يرجى إدخال مبلغ ابتدائي صحيح"); return; }
    const project = scopeType === "project" ? projects.find(p => p.id === ov.querySelector("#cu_project").value) : null;
    if (scopeType === "project" && !project) { toast("يرجى اختيار المشروع"); return; }

    const custodies = dbGet("custodies", []);
    const date = ov.querySelector("#cu_date").value || todayISO();
    custodies.push({
      id: uid("cu"), employeeId: emp.id, employeeName: emp.name,
      scopeType, projectId: project ? project.id : "", projectName: project ? project.name : "",
      purpose: ov.querySelector("#cu_purpose").value.trim(),
      status: "مفتوحة", createdAt: new Date().toISOString(),
      transactions: [{ id: uid("cutx"), type: "إيداع", amount, date, note: "المبلغ الابتدائي للعهدة" }],
    });
    dbSet("custodies", custodies);
    logActivity(`تم إنشاء عهدة للموظف "${emp.name}" بمبلغ ابتدائي ${fmtMoney(amount)}`);
    toast("تم إنشاء العهدة بنجاح");
    closeModal();
    renderCustodyTab(el);
  };
}

function openCustodyDetailModal(custodyId, el) {
  const custodies = dbGet("custodies", []);
  const c = custodies.find(x => x.id === custodyId);
  if (!c) return;
  const balance = custodyBalance(c);
  const txns = (c.transactions || []).slice().sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  const html = `
    <div class="modal-head"><h3>عهدة — ${c.employeeName}</h3><button class="modal-close" id="mClose">×</button></div>
    <div class="kv-row"><span class="k">نوع العهدة</span><span class="v">${c.scopeType === "project" ? "مشروع: " + (c.projectName || "-") : "مصاريف عامة"}</span></div>
    <div class="kv-row"><span class="k">الغرض</span><span class="v">${c.purpose || "-"}</span></div>
    <div class="kv-row"><span class="k">الحالة</span><span class="v"><span class="badge ${c.status === "مفتوحة" ? "orange" : "gray"}">${c.status}</span></span></div>
    <div class="grand-total-box" style="margin:14px 0">
      <div>الرصيد الحالي</div>
      <div class="num" style="color:${balance >= 0 ? "var(--success)" : "var(--danger)"}">${fmtMoney(balance)}</div>
    </div>
    <div class="flex gap no-print" style="margin-bottom:14px">
      <button class="btn sm primary" id="cu_addDeposit">+ إضافة رصيد</button>
      <button class="btn sm danger" id="cu_addExpense">+ تسجيل مصروف / فاتورة</button>
      <button class="btn sm" id="cu_toggleStatus" style="margin-inline-start:auto">${c.status === "مفتوحة" ? "إغلاق العهدة" : "إعادة فتح العهدة"}</button>
    </div>
    <h3 style="font-size:14px">حركات العهدة</h3>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>النوع</th><th>المبلغ</th><th>التاريخ</th><th>ملاحظات</th></tr></thead>
        <tbody>
          ${txns.length ? txns.map(t => `
            <tr>
              <td><span class="badge ${t.type === "إيداع" ? "green" : "red"}">${t.type}</span></td>
              <td><strong>${t.type === "إيداع" ? "+" : "-"} ${fmtMoney(t.amount)}</strong></td>
              <td>${fmtDate(t.date)}</td>
              <td class="text-muted">${t.note || "-"}</td>
            </tr>`).join("") : `<tr><td colspan="4" class="text-muted" style="text-align:center;padding:14px">لا توجد حركات بعد</td></tr>`}
        </tbody>
      </table>
    </div>
    <div class="flex gap" style="margin-top:16px"><button class="btn" id="cu_close">إغلاق</button></div>
  `;
  const ov = openModalShell(html, true);
  ov.querySelector("#mClose").onclick = closeModal;
  ov.querySelector("#cu_close").onclick = closeModal;
  ov.querySelector("#cu_addDeposit").onclick = () => openAddCustodyTxnModal(c.id, "إيداع", el);
  ov.querySelector("#cu_addExpense").onclick = () => openAddCustodyTxnModal(c.id, "مصروف", el);
  ov.querySelector("#cu_toggleStatus").onclick = () => {
    c.status = c.status === "مفتوحة" ? "مغلقة" : "مفتوحة";
    dbSet("custodies", custodies);
    logActivity(`تم تحديث حالة عهدة "${c.employeeName}" إلى: ${c.status}`);
    toast("تم تحديث حالة العهدة");
    openCustodyDetailModal(c.id, el);
  };
}

function openAddCustodyTxnModal(custodyId, type, el) {
  const html = `
    <div class="modal-head"><h3>${type === "إيداع" ? "إضافة رصيد للعهدة" : "تسجيل مصروف / فاتورة على العهدة"}</h3><button class="modal-close" id="mClose">×</button></div>
    <div class="grid cols-2">
      <div class="field"><label>المبلغ (ر.س)</label><input type="number" min="0" step="0.01" id="ct_amount"></div>
      <div class="field"><label>التاريخ</label><input type="date" id="ct_date" value="${todayISO()}"></div>
    </div>
    <div class="field"><label>ملاحظات ${type === "مصروف" ? "(وصف المصروف / رقم الفاتورة)" : ""}</label><textarea id="ct_note"></textarea></div>
    <div class="flex gap"><button class="btn primary" id="ct_save">حفظ</button><button class="btn" id="ct_cancel">إلغاء</button></div>
  `;
  const ov = openModalShell(html);
  ov.querySelector("#mClose").onclick = closeModal;
  ov.querySelector("#ct_cancel").onclick = closeModal;
  ov.querySelector("#ct_save").onclick = () => {
    const amount = Number(ov.querySelector("#ct_amount").value) || 0;
    if (amount <= 0) { toast("يرجى إدخال مبلغ صحيح"); return; }
    const custodies = dbGet("custodies", []);
    const c = custodies.find(x => x.id === custodyId);
    c.transactions = c.transactions || [];
    c.transactions.push({
      id: uid("cutx"), type,
      amount, date: ov.querySelector("#ct_date").value || todayISO(),
      note: ov.querySelector("#ct_note").value.trim(),
    });
    dbSet("custodies", custodies);
    logActivity(type === "إيداع" ? `تم إضافة رصيد ${fmtMoney(amount)} لعهدة "${c.employeeName}"` : `تم تسجيل مصروف ${fmtMoney(amount)} على عهدة "${c.employeeName}"`);
    toast(type === "إيداع" ? "تم إضافة الرصيد" : "تم تسجيل المصروف");
    closeModal();
    openCustodyDetailModal(custodyId, el);
  };
}

function openGeneralExpenseViewModal(e) {
  const html = `
    <div class="modal-head"><h3>تفاصيل المصروف الإداري</h3><button class="modal-close" id="mClose">×</button></div>
    <div class="kv-row"><span class="k">التصنيف</span><span class="v">${e.category}</span></div>
    ${generalExpenseSubtitle(e) ? `<div class="kv-row"><span class="k">التفاصيل</span><span class="v">${generalExpenseSubtitle(e)}</span></div>` : ""}
    <div class="kv-row"><span class="k">المبلغ</span><span class="v">${fmtMoney(e.amount)}</span></div>
    <div class="kv-row"><span class="k">التاريخ</span><span class="v">${fmtDate(e.date)}</span></div>
    <div class="kv-row"><span class="k">ضريبة القيمة المضافة</span><span class="v">${e.vatApplicable ? `خاضع (${fmtMoney(e.vatAmount || Number(e.amount) * VAT_RATE)})` : "غير خاضع"}</span></div>
    ${e.paymentMethod ? `<div class="kv-row"><span class="k">طريقة الدفع</span><span class="v">${e.paymentMethod}</span></div>` : ""}
    ${e.note ? `<div class="kv-row"><span class="k">ملاحظات</span><span class="v">${e.note}</span></div>` : ""}
    ${e.attachment ? `<div class="kv-row"><span class="k">المرفق</span><span class="v"><a href="${e.attachment.url}" target="_blank" rel="noopener">📎 ${e.attachment.name || "عرض المرفق"}</a></span></div>` : ""}
    <div class="flex gap" style="margin-top:14px"><button class="btn" id="v_close">إغلاق</button></div>
  `;
  const ov = openModalShell(html);
  ov.querySelector("#mClose").onclick = closeModal;
  ov.querySelector("#v_close").onclick = closeModal;
}

function openGeneralExpenseModal(el, existingEntry) {
  const isEdit = !!existingEntry;
  const catalog = getExpenseCatalog();
  const catNames = catalog.map(c => c.name);
  const users = dbGet("users", []);
  const html = `
    <div class="modal-head"><h3>${isEdit ? "تعديل مصروف إداري" : "إضافة مصروف إداري"}</h3><button class="modal-close" id="mClose">×</button></div>
    <div class="field"><label>التصنيف</label><select id="g_cat">${catNames.map(c => `<option value="${c}" ${isEdit && existingEntry.category === c ? "selected" : ""}>${c}</option>`).join("")}</select></div>
    <div id="g_extraFields"></div>
    <div class="grid cols-2">
      <div class="field"><label>المبلغ (ر.س)</label><input type="number" min="0" step="0.01" id="g_amount" value="${isEdit ? existingEntry.amount : ""}"></div>
      <div class="field"><label id="g_dateLabel">التاريخ</label><input type="date" id="g_date" value="${isEdit ? existingEntry.date : todayISO()}"></div>
    </div>
    <div class="field"><label><input type="checkbox" id="g_vat" ${isEdit && existingEntry.vatApplicable ? "checked" : ""} style="width:auto;display:inline-block"> يشمل فاتورة ضريبية (ضريبة قيمة مضافة قابلة للخصم)</label></div>
    <div class="field"><label>طريقة الدفع</label>
      <select id="g_paymentMethod">
        <option value="">— اختر طريقة الدفع —</option>
        ${PAYMENT_METHODS.map(m => `<option value="${m}" ${isEdit && existingEntry.paymentMethod === m ? "selected" : ""}>${m}</option>`).join("")}
      </select>
    </div>
    <div class="field"><label>ملاحظات</label><textarea id="g_note">${isEdit ? (existingEntry.note || "") : ""}</textarea></div>
    <div class="field">
      <label>إرفاق ملف الفاتورة أو المستند (اختياري)</label>
      <input type="file" id="g_attachment" accept=".pdf,image/*">
      <div id="g_attachmentPreview" class="flex wrap" style="margin-top:8px">${isEdit && existingEntry.attachment ? `<span class="file-chip">📎 ${existingEntry.attachment.name || "المرفق الحالي"}</span>` : ""}</div>
    </div>
    <div class="flex gap"><button class="btn primary" id="g_save">حفظ</button><button class="btn" id="g_cancel">إلغاء</button></div>
  `;
  const ov = openModalShell(html);
  ov.querySelector("#mClose").onclick = closeModal;
  ov.querySelector("#g_cancel").onclick = closeModal;

  let attachment = isEdit ? (existingEntry.attachment || null) : null;
  ov.querySelector("#g_attachment").onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) { attachment = null; ov.querySelector("#g_attachmentPreview").innerHTML = ""; return; }
    const url = await fileToDataURL(file);
    attachment = { name: file.name, type: file.type, url };
    ov.querySelector("#g_attachmentPreview").innerHTML = `<span class="file-chip">📎 ${file.name}</span>`;
  };

  const catSelect = ov.querySelector("#g_cat");
  const extraBox = ov.querySelector("#g_extraFields");
  const dateLabel = ov.querySelector("#g_dateLabel");

  function renderExtraFields() {
    const catName = catSelect.value;
    if (catName === "رواتب") {
      dateLabel.textContent = "تاريخ تسليم الراتب";
      extraBox.innerHTML = `
        <div class="grid cols-2">
          <div class="field"><label>الموظف</label>
            <select id="g_employee">
              <option value="">— اختر الموظف —</option>
              ${users.map(u => `<option value="${u.id}" ${isEdit && existingEntry.employeeId === u.id ? "selected" : ""}>${u.name} — ${u.role}</option>`).join("")}
            </select>
          </div>
          <div class="field"><label>الشهر المستحق عنه الراتب</label><input type="month" id="g_salaryMonth" value="${isEdit && existingEntry.salaryMonth ? existingEntry.salaryMonth : todayISO().slice(0, 7)}"></div>
        </div>
      `;
    } else if (catName === "مركبات") {
      dateLabel.textContent = "التاريخ";
      const vehicles = dbGet("vehicles", []);
      const vehCat = catalog.find(c => c.name === "مركبات");
      const vehItems = vehCat ? vehCat.items : [];
      extraBox.innerHTML = `
        <div class="grid cols-2">
          <div class="field"><label>المركبة</label>
            <select id="g_vehicle">
              <option value="">— اختر المركبة —</option>
              ${vehicles.map(v => `<option value="${v.id}" ${isEdit && existingEntry.vehicleId === v.id ? "selected" : ""}>${[v.brand, v.modelTrim].filter(Boolean).join(" ") || v.type || "مركبة"}${v.regNumber ? " — استمارة " + v.regNumber : ""}</option>`).join("")}
            </select>
            ${!vehicles.length ? `<div class="hint">لا توجد مركبات مسجلة — أضفها من الإعدادات ← المركبات</div>` : ""}
          </div>
          <div class="field"><label>نوع المصروف</label>
            <select id="g_subItem">
              <option value="">— اختر نوع المصروف —</option>
              ${vehItems.map(it => `<option value="${it.name}" ${isEdit && existingEntry.subItem === it.name ? "selected" : ""}>${it.name}</option>`).join("")}
            </select>
            ${!vehItems.length ? `<div class="hint">لا توجد أنواع مصروفات مسجلة — أضفها من الإعدادات ← العهد والمصروفات ← مركبات</div>` : ""}
          </div>
        </div>
      `;
    } else if (catName === "المرافق") {
      dateLabel.textContent = "التاريخ";
      const facilities = dbGet("facilities", []);
      extraBox.innerHTML = `
        <div class="field"><label>المرفق</label>
          <select id="g_facility">
            <option value="">— اختر المرفق —</option>
            ${facilities.map(f => `<option value="${f.id}" ${isEdit && existingEntry.facilityId === f.id ? "selected" : ""}>${f.name}${f.type ? " — " + f.type : ""}</option>`).join("")}
          </select>
          ${!facilities.length ? `<div class="hint">لا توجد مرافق مسجلة — أضفها من الإعدادات ← المرافق</div>` : ""}
        </div>
      `;
    } else if (catName === "سلفية") {
      dateLabel.textContent = "تاريخ السلفية";
      extraBox.innerHTML = `
        <div class="grid cols-2">
          <div class="field"><label>الموظف</label>
            <select id="g_advanceEmployee">
              <option value="">— اختر الموظف —</option>
              ${users.map(u => `<option value="${u.id}" ${isEdit && existingEntry.advanceEmployeeId === u.id ? "selected" : ""}>${u.name} — ${u.role}</option>`).join("")}
            </select>
          </div>
          <div class="field"><label>حالة السلفية</label>
            <select id="g_advanceStatus">
              <option value="deduct" ${isEdit && existingEntry.advanceStatus === "deduct" ? "selected" : ""}>تُخصم من الراتب القادم</option>
              <option value="exempt" ${isEdit && existingEntry.advanceStatus === "exempt" ? "selected" : ""}>معفية (لا تُخصم)</option>
            </select>
          </div>
        </div>
      `;
    } else {
      dateLabel.textContent = "التاريخ";
      const cat = catalog.find(c => c.name === catName);
      const items = cat ? cat.items : [];
      extraBox.innerHTML = items.length ? `
        <div class="field"><label>البند الفرعي (اختياري)</label>
          <select id="g_subItem">
            <option value="">— بدون تحديد —</option>
            ${items.map(it => `<option value="${it.name}" ${isEdit && existingEntry.subItem === it.name ? "selected" : ""}>${it.name}</option>`).join("")}
          </select>
        </div>
      ` : "";
    }
  }
  renderExtraFields();
  catSelect.onchange = renderExtraFields;

  ov.querySelector("#g_save").onclick = () => {
    const amount = Number(ov.querySelector("#g_amount").value) || 0;
    if (amount <= 0) { toast("يرجى إدخال مبلغ صحيح"); return; }
    const vatApplicable = ov.querySelector("#g_vat").checked;
    const category = catSelect.value;
    const paymentMethod = ov.querySelector("#g_paymentMethod").value;
    const list = dbGet("accGeneral", []);
    const entry = {
      id: isEdit ? existingEntry.id : uid("ge"), category, amount,
      vatApplicable, vatAmount: vatApplicable ? amount * VAT_RATE : 0,
      date: ov.querySelector("#g_date").value || todayISO(), note: ov.querySelector("#g_note").value.trim(),
      paymentMethod,
      attachment,
    };
    let logSuffix = "";
    if (category === "رواتب") {
      const empSelect = ov.querySelector("#g_employee");
      const emp = users.find(u => u.id === (empSelect ? empSelect.value : ""));
      if (!emp) { toast("يرجى اختيار الموظف"); return; }
      entry.employeeId = emp.id;
      entry.employeeName = emp.name;
      entry.salaryMonth = ov.querySelector("#g_salaryMonth").value;
      logSuffix = ` للموظف "${emp.name}"${entry.salaryMonth ? " عن شهر " + salaryMonthLabel(entry.salaryMonth) : ""}`;
    } else if (category === "مركبات") {
      const vehSelect = ov.querySelector("#g_vehicle");
      const subSelect = ov.querySelector("#g_subItem");
      if (subSelect && subSelect.value) entry.subItem = subSelect.value;
      if (vehSelect && vehSelect.value) {
        const veh = dbGet("vehicles", []).find(v => v.id === vehSelect.value);
        if (veh) {
          const label = [veh.brand, veh.modelTrim].filter(Boolean).join(" ") || veh.type || "مركبة";
          entry.vehicleId = veh.id;
          entry.vehicleLabel = label;
          logSuffix = ` — المركبة: ${label}${entry.subItem ? " (" + entry.subItem + ")" : ""}`;
        }
      } else if (entry.subItem) {
        logSuffix = ` — ${entry.subItem}`;
      }
    } else if (category === "المرافق") {
      const facilitySelect = ov.querySelector("#g_facility");
      if (facilitySelect && facilitySelect.value) {
        const facility = dbGet("facilities", []).find(f => f.id === facilitySelect.value);
        if (facility) { entry.facilityId = facility.id; entry.facilityName = facility.name; logSuffix = ` — المرفق: ${facility.name}`; }
      }
    } else if (category === "سلفية") {
      const empSelect = ov.querySelector("#g_advanceEmployee");
      const emp = users.find(u => u.id === (empSelect ? empSelect.value : ""));
      if (!emp) { toast("يرجى اختيار الموظف"); return; }
      const status = ov.querySelector("#g_advanceStatus").value;
      entry.advanceEmployeeId = emp.id;
      entry.advanceEmployeeName = emp.name;
      entry.advanceStatus = status;
      logSuffix = ` للموظف "${emp.name}" — ${status === "exempt" ? "معفية" : "تُخصم من الراتب القادم"}`;
    } else {
      const subSelect = ov.querySelector("#g_subItem");
      if (subSelect && subSelect.value) { entry.subItem = subSelect.value; logSuffix = ` (${subSelect.value})`; }
    }
    if (isEdit) {
      const idx = list.findIndex(x => x.id === existingEntry.id);
      if (idx >= 0) list[idx] = entry; else list.push(entry);
    } else {
      list.push(entry);
    }
    dbSet("accGeneral", list);
    logActivity(`تم ${isEdit ? "تعديل" : "تسجيل"} مصروف إداري "${category}"${logSuffix} بقيمة ${fmtMoney(amount)}${paymentMethod ? " — دفع عبر " + paymentMethod : ""}`);
    toast(isEdit ? "تم حفظ التعديلات على المصروف" : "تم إضافة المصروف الإداري");
    closeModal();
    renderGeneralExpensesTab(el);
  };
}

/* ================= ضريبة القيمة المضافة ================= */
function quarterOf(dateStr) {
  const m = new Date(dateStr).getMonth() + 1;
  return Math.ceil(m / 3);
}

function renderAccVat(el) {
  const now = new Date();
  if (!renderAccVat.year) renderAccVat.year = now.getFullYear();
  if (!renderAccVat.quarter) renderAccVat.quarter = Math.ceil((now.getMonth() + 1) / 3);
  const year = renderAccVat.year, quarter = renderAccVat.quarter;

  const projEntries = dbGet("accProjects", []).filter(e => e.vatApplicable && new Date(e.date).getFullYear() === year && quarterOf(e.date) === quarter);
  const genEntries = dbGet("accGeneral", []).filter(e => e.vatApplicable && new Date(e.date).getFullYear() === year && quarterOf(e.date) === quarter);

  const outputSales = projEntries.filter(e => e.type === "إيراد مشروع" || e.type === "فاتورة ضريبية").reduce((s, e) => s + Number(e.amountBeforeTax ?? e.amount), 0);
  const outputVat = projEntries.filter(e => e.type === "إيراد مشروع" || e.type === "فاتورة ضريبية").reduce((s, e) => s + Number(e.vatAmount || 0), 0);

  const inputPurchases = projEntries.filter(e => ["دفعة مشتريات", "مصروف مواد", "مصروف عمال", "مصروف نثرية"].includes(e.type)).reduce((s, e) => s + Number(e.amount), 0)
    + genEntries.reduce((s, e) => s + Number(e.amount), 0);
  const inputVat = projEntries.filter(e => ["دفعة مشتريات", "مصروف مواد", "مصروف عمال", "مصروف نثرية"].includes(e.type)).reduce((s, e) => s + Number(e.vatAmount || 0), 0)
    + genEntries.reduce((s, e) => s + Number(e.vatAmount || 0), 0);

  const net = outputVat - inputVat;

  el.innerHTML = `
    <div class="section-title-row">
      <div><h2>ضريبة القيمة المضافة</h2><p>احتساب ربع سنوي للمبيعات والمشتريات الخاضعة للضريبة</p></div>
    </div>

    <div class="card">
      <div class="flex gap wrap" style="align-items:flex-end">
        <div class="field" style="margin-bottom:0"><label>السنة</label><input type="number" id="vatYear" value="${year}" style="width:110px"></div>
        <div class="field" style="margin-bottom:0"><label>الربع</label>
          <select id="vatQuarter" style="width:150px">
            ${[1, 2, 3, 4].map(q => `<option value="${q}" ${q === quarter ? "selected" : ""}>الربع ${q} (${["يناير-مارس", "أبريل-يونيو", "يوليو-سبتمبر", "أكتوبر-ديسمبر"][q - 1]})</option>`).join("")}
          </select>
        </div>
        <button class="btn" id="vatGo">عرض</button>
      </div>
    </div>

    <div class="grid cols-2" style="margin-bottom:18px">
      <div class="card">
        <h3>ضريبة المخرجات (المبيعات)</h3>
        <div class="kv-row"><span class="k">إجمالي المبيعات الخاضعة للضريبة</span><span class="v">${fmtMoney(outputSales)}</span></div>
        <div class="kv-row"><span class="k">ضريبة المخرجات (15%)</span><span class="v">${fmtMoney(outputVat)}</span></div>
      </div>
      <div class="card">
        <h3>ضريبة المدخلات (المشتريات والمصاريف)</h3>
        <div class="kv-row"><span class="k">إجمالي المشتريات الخاضعة للضريبة</span><span class="v">${fmtMoney(inputPurchases)}</span></div>
        <div class="kv-row"><span class="k">ضريبة المدخلات (15%)</span><span class="v">${fmtMoney(inputVat)}</span></div>
      </div>
    </div>

    <div class="grand-total-box">
      <div>${net >= 0 ? "صافي الضريبة المستحقة للهيئة" : "صافي الضريبة القابلة للاسترداد"}</div>
      <div class="num">${fmtMoney(Math.abs(net))}</div>
    </div>
  `;

  document.getElementById("vatGo").onclick = () => {
    renderAccVat.year = Number(document.getElementById("vatYear").value) || year;
    renderAccVat.quarter = Number(document.getElementById("vatQuarter").value) || quarter;
    renderAccVat(el);
  };
}
