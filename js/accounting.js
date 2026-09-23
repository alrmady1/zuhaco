/* =========================================================
   المحاسبة: محاسبة المشاريع / المحاسبة العامة / ضريبة القيمة المضافة
   ========================================================= */

const VAT_RATE = 0.15;
let ACC_SELECTED_PROJECT = null;
let GEN_EXP_SORT = { key: "date", dir: "desc" };

const ACC_TYPES = ["إيراد مشروع", "دفعة مشتريات", "دفعة مقاول باطن", "مصروف مواد", "مصروف عمال", "مصروف نثرية"];
const ACC_EXPENSE_TYPES = ["دفعة مشتريات", "دفعة مقاول باطن", "مصروف مواد", "مصروف عمال", "مصروف نثرية"];
const ACC_TYPE_BADGE = {
  "إيراد مشروع": "green", "فاتورة ضريبية": "green",
  "دفعة مشتريات": "blue", "دفعة مقاول باطن": "orange", "مصروف مواد": "orange", "مصروف عمال": "orange", "مصروف نثرية": "gray",
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
  const requiredCats = ["سلفية", "مركبات", "المرافق", "دفعة أعمال"];
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

  const EXPENSE_TYPES = ACC_EXPENSE_TYPES;
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
                  ${e.contractorName ? `<br><span style="font-size:11px">مقاول الباطن: ${e.contractorName}</span>` : ""}
                  ${e.vendorName ? `<br><span style="font-size:11px">التاجر: ${e.vendorName}${e.invoiceRefNumber ? " — فاتورة رقم " + e.invoiceRefNumber : ""}</span>` : ""}
                  ${e.paymentMethod ? `<br><span class="badge gray" style="font-size:10.5px">${e.paymentMethod}</span>` : ""}
                </td>
                <td>${e.attachment ? `<a href="${e.attachment.url}" target="_blank" rel="noopener" class="badge blue" style="text-decoration:none">${svgIcon("paperclip", 14)} عرض المرفق</a>` : "-"}</td>
                <td>
                  ${e.type === "فاتورة ضريبية" ? `<button class="btn sm" data-printinv="${e.id}">طباعة</button>` : `<button class="btn-icon" data-viewentry="${e.id}" title="عرض">${ICON_VIEW}</button><button class="btn-icon" data-editentry="${e.id}" title="تعديل">${ICON_EDIT}</button>`}
                  <button class="btn-icon danger" data-delentry="${e.id}" title="حذف">${ICON_DELETE}</button>
                </td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>` : `<div class="empty-state"><div class="ic">${svgIcon("dollar", 40)}</div>لا توجد حركات مالية لهذا المشروع بعد</div>`}
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
    ${e.contractorName ? `<div class="kv-row"><span class="k">مقاول الباطن</span><span class="v">${e.contractorName}</span></div>` : ""}
    ${e.vendorName ? `<div class="kv-row"><span class="k">التاجر / المورّد</span><span class="v">${e.vendorName}</span></div>` : ""}
    ${e.invoiceRefNumber ? `<div class="kv-row"><span class="k">رقم الفاتورة</span><span class="v">${e.invoiceRefNumber}</span></div>` : ""}
    ${e.paymentMethod ? `<div class="kv-row"><span class="k">طريقة السداد/الاستلام</span><span class="v">${e.paymentMethod}</span></div>` : ""}
    ${e.note ? `<div class="kv-row"><span class="k">ملاحظات</span><span class="v">${e.note}</span></div>` : ""}
    ${e.attachment ? `<div class="kv-row"><span class="k">المرفق</span><span class="v"><a href="${e.attachment.url}" target="_blank" rel="noopener">${svgIcon("paperclip", 14)} ${e.attachment.name || "عرض المرفق"}</a></span></div>` : ""}
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
    ov.querySelector("#e_amount").oninput = null;
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
          <div id="e_attachmentPreview" class="flex wrap" style="margin-top:8px">${attachment ? `<span class="file-chip">${svgIcon("paperclip", 14)} ${attachment.name || "المرفق الحالي"}</span>` : ""}</div>
        </div>
      `;
      wireAttachment();
    } else if (type === "دفعة مقاول باطن") {
      const contractors = dbGet("contractors", []).filter(c => findContractorAgreement(c.id, ACC_SELECTED_PROJECT));
      extraBox.innerHTML = `
        <div class="field"><label>مقاول الباطن (من المقاولين المسجلين)</label>
          <select id="e_contractor">
            <option value="">— اختر المقاول —</option>
            ${contractors.map(c => `<option value="${c.id}" ${isEdit && existingEntry.contractorId === c.id ? "selected" : ""}>${c.name}${c.trade ? " — " + c.trade : ""}</option>`).join("")}
          </select>
          ${!contractors.length ? `<div class="hint">لا يوجد مقاول باطن له اتفاق على هذا المشروع — أنشئ الاتفاق من صفحة مقاولي الباطن أولاً</div>` : ""}
        </div>
        <div id="e_conInfo" style="margin-bottom:14px"></div>
        <div class="field"><label>طريقة الدفع</label><select id="e_paymentMethod">${PAYMENT_METHODS.map(m => `<option value="${m}" ${isEdit && existingEntry.paymentMethod === m ? "selected" : ""}>${m}</option>`).join("")}</select></div>
        <div class="field">
          <label>إيصال التحويل أو الفاتورة (اختياري)</label>
          <input type="file" id="e_attachment" accept=".pdf,image/*">
          <div id="e_attachmentPreview" class="flex wrap" style="margin-top:8px">${attachment ? `<span class="file-chip">${svgIcon("paperclip", 14)} ${attachment.name || "المرفق الحالي"}</span>` : ""}</div>
        </div>
      `;
      wireAttachment();
      const conSel = extraBox.querySelector("#e_contractor");
      const infoBox = extraBox.querySelector("#e_conInfo");
      const amountInput = ov.querySelector("#e_amount");
      const refreshInfo = () => {
        const f = conSel.value ? contractorFigures(conSel.value, ACC_SELECTED_PROJECT, isEdit ? existingEntry.id : null) : null;
        if (!f) { infoBox.innerHTML = ""; return; }
        const after = f.remaining - (Number(amountInput.value) || 0);
        infoBox.innerHTML = `
          <div class="card" style="background:#f6f9fd;padding:14px 18px;margin:0">
            <div class="kv-row"><span class="k">نوع الاتفاق</span><span class="v">${AGREEMENT_TYPE_LABELS[f.ag.type]}</span></div>
            <div class="kv-row"><span class="k">المستحق النهائي (بعد التمتير والخصومات والأعمال الإضافية)</span><span class="v">${fmtMoney(f.entitlement)}</span></div>
            <div class="kv-row"><span class="k">المدفوع سابقاً</span><span class="v">${fmtMoney(f.paid)}</span></div>
            <div class="kv-row"><span class="k">المتبقي قبل هذه الدفعة</span><span class="v">${fmtMoney(f.remaining)}</span></div>
            <div class="kv-row"><span class="k">المتبقي بعد هذه الدفعة</span><span class="v" style="color:${after < 0 ? "var(--danger)" : "var(--success)"}">${fmtMoney(after)}${after < 0 ? " (تجاوز المستحق)" : ""}</span></div>
          </div>`;
      };
      conSel.onchange = refreshInfo;
      amountInput.oninput = refreshInfo;
      refreshInfo();
    } else if (type === "إيراد مشروع") {
      extraBox.innerHTML = `
        <div class="field"><label>طريقة الاستلام</label><select id="e_paymentMethod">${PAYMENT_METHODS.map(m => `<option value="${m}" ${isEdit && existingEntry.paymentMethod === m ? "selected" : ""}>${m}</option>`).join("")}</select></div>
        <div class="field">
          <label>إيصال التحويل أو الاستلام (اختياري)</label>
          <input type="file" id="e_attachment" accept=".pdf,image/*">
          <div id="e_attachmentPreview" class="flex wrap" style="margin-top:8px">${attachment ? `<span class="file-chip">${svgIcon("paperclip", 14)} ${attachment.name || "المرفق الحالي"}</span>` : ""}</div>
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
      ov.querySelector("#e_attachmentPreview").innerHTML = `<span class="file-chip">${svgIcon("paperclip", 14)} ${file.name}</span>`;
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
    } else if (type === "دفعة مقاول باطن") {
      const conId = (ov.querySelector("#e_contractor") || {}).value;
      const con = dbGet("contractors", []).find(x => x.id === conId);
      if (!con) { toast("يرجى اختيار مقاول الباطن"); return; }
      entry.contractorId = con.id;
      entry.contractorName = con.name;
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
    <div class="flex gap no-print" style="margin-top:16px"><button class="btn primary" id="printBtn">${svgIcon("printer")} طباعة</button><button class="btn" id="i_close">إغلاق</button></div>
  `;
  const ov = openModalShell(html);
  ov.querySelector("#mClose").onclick = closeModal;
  ov.querySelector("#i_close").onclick = closeModal;
  ov.querySelector("#printBtn").onclick = () => window.print();
}

/* ================= المحاسبة العامة (العهد والمصروفات) ================= */
let ACC_GENERAL_TAB = "expenses"; // expenses | custody | employees | assets | projects | vat
let EMPLOYEES_VIEW = "list"; // list | detail
let EMPLOYEE_VIEW_ID = null;
let EMPLOYEES_LIST_MODE = "grid"; // grid | rows

function renderAccGeneral(el) {
  const role = (getCurrentUser() || {}).role;
  const canViewDocuments = hasPermission(role, "acc_documents");
  const canViewHolding = hasPermission(role, "acc_holding");
  const isGM = role === "مدير عام";
  if (ACC_GENERAL_TAB === "documents" && !canViewDocuments) ACC_GENERAL_TAB = "expenses";
  if (ACC_GENERAL_TAB === "personal" && !isGM) ACC_GENERAL_TAB = "expenses";
  if (ACC_GENERAL_TAB === "holding" && !canViewHolding) ACC_GENERAL_TAB = "expenses";
  el.innerHTML = `
    <div class="section-title-row"><div><h2>المحاسبة العامة</h2><p>المصاريف الإدارية العامة للمؤسسة وعُهد الموظفين</p></div></div>
    <div class="tabs">
      <div class="tab-btn ${ACC_GENERAL_TAB === "expenses" ? "active" : ""}" data-gtab="expenses">المصاريف الإدارية</div>
      <div class="tab-btn ${ACC_GENERAL_TAB === "custody" ? "active" : ""}" data-gtab="custody">العهد</div>
      <div class="tab-btn ${ACC_GENERAL_TAB === "employees" ? "active" : ""}" data-gtab="employees">الموظفون</div>
      <div class="tab-btn ${ACC_GENERAL_TAB === "assets" ? "active" : ""}" data-gtab="assets">الأصول</div>
      ${canViewDocuments ? `<div class="tab-btn ${ACC_GENERAL_TAB === "documents" ? "active" : ""}" data-gtab="documents">تواريخ الانتهاء</div>` : ""}
      ${isGM ? `<div class="tab-btn ${ACC_GENERAL_TAB === "personal" ? "active" : ""}" data-gtab="personal">تواريخ شخصية</div>` : ""}
      ${canViewHolding ? `<div class="tab-btn ${ACC_GENERAL_TAB === "holding" ? "active" : ""}" data-gtab="holding">الشركة القابضة</div>` : ""}
      <div class="tab-btn ${ACC_GENERAL_TAB === "projects" ? "active" : ""}" data-gtab="projects">المشاريع</div>
      <div class="tab-btn ${ACC_GENERAL_TAB === "vat" ? "active" : ""}" data-gtab="vat">الضريبة</div>
    </div>
    <div id="accGeneralBody"></div>
  `;
  el.querySelectorAll("[data-gtab]").forEach(t => t.onclick = () => { ACC_GENERAL_TAB = t.dataset.gtab; renderAccGeneral(el); });

  const body = document.getElementById("accGeneralBody");
  if (ACC_GENERAL_TAB === "custody") renderCustodyTab(body);
  else if (ACC_GENERAL_TAB === "employees") renderEmployeesTab(body);
  else if (ACC_GENERAL_TAB === "assets") renderAssetsTab(body);
  else if (ACC_GENERAL_TAB === "documents" && canViewDocuments) renderDocumentsTab(body);
  else if (ACC_GENERAL_TAB === "personal" && isGM) renderPersonalDatesTab(body);
  else if (ACC_GENERAL_TAB === "holding" && canViewHolding) renderHoldingTab(body);
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
    const expenses = list.filter(e => ACC_EXPENSE_TYPES.includes(e.type)).reduce((s, e) => s + Number(e.amount || 0), 0);
    return { revenue, expenses, net: revenue - expenses };
  }

  function tableFor(list, emptyMsg) {
    if (!list.length) return `<div class="empty-state"><div class="ic">${svgIcon("folder", 40)}</div>${emptyMsg}</div>`;
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
    ...projEntries.filter(e => ACC_EXPENSE_TYPES.includes(e.type)),
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
        <button class="btn primary" id="tvatPrint" style="margin-inline-start:auto">${svgIcon("printer")} طباعة التقرير</button>
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
      </div>` : `<div class="empty-state"><div class="ic">${svgIcon("dollar", 40)}</div>لا توجد إيرادات خاضعة للضريبة في هذا الربع</div>`}
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
      </div>` : `<div class="empty-state"><div class="ic">${svgIcon("file-text", 40)}</div>لا توجد مشتريات خاضعة للضريبة في هذا الربع</div>`}
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
  if (e.category === "دفعة أعمال" && e.contractorName) {
    return `المقاول: ${e.contractorName}${e.projectName ? " — المشروع: " + e.projectName : ""}`;
  }
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
  const arrow = active ? (GEN_EXP_SORT.dir === "asc" ? ` ${svgIcon("chevron-up", 12)}` : ` ${svgIcon("chevron-down", 12)}`) : "";
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
                <td>${e.attachment ? `<a href="${e.attachment.url}" target="_blank" rel="noopener" class="badge blue" style="text-decoration:none">${svgIcon("paperclip", 14)} عرض المرفق</a>` : "-"}</td>
                <td>
                  <button class="btn-icon" data-viewgen="${e.id}" title="عرض">${ICON_VIEW}</button>
                  <button class="btn-icon" data-editgen="${e.id}" title="تعديل">${ICON_EDIT}</button>
                  <button class="btn-icon danger" data-delgen="${e.id}" title="حذف">${ICON_DELETE}</button>
                </td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>` : `<div class="empty-state"><div class="ic">${svgIcon("building", 40)}</div>لا توجد مصاريف إدارية مسجلة بعد</div>`}
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
        <div class="contract-row-icon">${svgIcon("briefcase", 20)}</div>
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
    }).join("") : `<div class="card empty-state"><div class="ic">${svgIcon("briefcase", 40)}</div>لا توجد عُهد مسجلة بعد</div>`}
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

/* ================= تبويب الموظفين (بيانات شخصية، إجازات، عهد، سلفيات، رواتب، مخالفات) ================= */
function renderEmployeesTab(el) {
  if (EMPLOYEES_VIEW === "detail" && EMPLOYEE_VIEW_ID) renderEmployeeDetail(el);
  else renderEmployeesList(el);
}

/* ملخص مالي سريع للموظف: يُستخدم في بطاقات/أسطر قائمة الموظفين */
function employeeFinancialSummary(u) {
  const pendingAdvancesTotal = dbGet("accGeneral", [])
    .filter(e => e.category === "سلفية" && e.advanceEmployeeId === u.id && e.advanceStatus === "deduct" && !e.settled)
    .reduce((s, a) => s + Number(a.amount || 0), 0);
  const pendingViolationsTotal = dbGet("employeeIncidents", [])
    .filter(i => i.employeeId === u.id && i.type === "مخالفة" && Number(i.deductionAmount) > 0 && !i.settled)
    .reduce((s, i) => s + Number(i.deductionAmount || 0), 0);
  const custodyTotal = dbGet("custodies", [])
    .filter(c => c.employeeId === u.id && c.status === "مفتوحة")
    .reduce((s, c) => s + custodyBalance(c), 0);
  const baseSalary = Number(u.baseSalary || 0);
  const netSalary = baseSalary - pendingAdvancesTotal - pendingViolationsTotal;
  return { baseSalary, pendingAdvancesTotal, pendingViolationsTotal, custodyTotal, netSalary };
}

function renderEmployeesList(el) {
  const users = dbGet("users", []).slice().sort((a, b) => (a.name || "").localeCompare(b.name || "", "ar"));

  const header = `
    <div class="section-title-row">
      <div><h2 class="mt-0" style="font-size:16px">الموظفون</h2>
      <p>الراتب الشهري وصافيه بعد الخصميات والسلفيات والعهدة المفتوحة لكل موظف — اضغط على أي موظف للاطلاع على التفاصيل</p></div>
      <div class="flex gap center">
        <div class="view-toggle">
          <button data-listmode="rows" title="عرض أسطر" class="${EMPLOYEES_LIST_MODE === "rows" ? "active" : ""}">${ICON_LIST}</button>
          <button data-listmode="grid" title="عرض بطاقات" class="${EMPLOYEES_LIST_MODE === "grid" ? "active" : ""}">${ICON_GRID}</button>
        </div>
      </div>
    </div>
  `;

  if (!users.length) {
    el.innerHTML = header + `<div class="card"><div class="empty-state"><div class="ic">${svgIcon("user", 40)}</div>لا يوجد موظفون بعد — أضفهم من الإعدادات ← التحكم بالمستخدمين</div></div>`;
    wireListModeToggle();
    return;
  }

  if (EMPLOYEES_LIST_MODE === "rows") {
    el.innerHTML = header + `
      <div class="card">
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>الاسم</th><th>المسمى الوظيفي</th><th>الراتب الشهري</th><th>رصيد الإجازة</th><th>سلفيات معلّقة</th><th>خصميات هذا الشهر</th><th>العهدة المفتوحة</th><th>صافي الراتب المتوقع</th></tr></thead>
            <tbody>
              ${users.map(u => {
                const s = employeeFinancialSummary(u);
                return `
                <tr data-openemp="${u.id}" style="cursor:pointer">
                  <td><strong>${u.name}</strong>${u.status === "منتهي الخدمة" ? ` <span class="badge red">منتهي الخدمة</span>` : ""}</td>
                  <td>${u.role}</td>
                  <td>${fmtMoney(s.baseSalary)}</td>
                  <td>${employeeRemainingLeaveBalance(u.id)} يوم</td>
                  <td>${fmtMoney(s.pendingAdvancesTotal)}</td>
                  <td>${fmtMoney(s.pendingViolationsTotal)}</td>
                  <td>${fmtMoney(s.custodyTotal)}</td>
                  <td><strong>${fmtMoney(s.netSalary)}</strong></td>
                </tr>`;
              }).join("")}
            </tbody>
          </table>
        </div>
      </div>
    `;
  } else {
    el.innerHTML = header + `
      <div class="employees-grid">
        ${users.map(u => {
          const s = employeeFinancialSummary(u);
          return `
          <div class="emp-card" data-openemp="${u.id}">
            <div class="emp-card-head">
              <div class="emp-avatar">${initials(u.name)}</div>
              <div class="emp-card-name">${u.name}${u.status === "منتهي الخدمة" ? ` <span class="badge red">منتهي الخدمة</span>` : ""}</div>
            </div>
            <div class="emp-tiles">
              <div class="emp-tile success"><div class="t-label">رصيد الإجازة</div><div class="t-value">${employeeRemainingLeaveBalance(u.id)} يوم</div></div>
              <div class="emp-tile"><div class="t-label">سلفيات معلّقة</div><div class="t-value">${fmtMoney(s.pendingAdvancesTotal)}</div></div>
              <div class="emp-tile"><div class="t-label">الراتب الشهري</div><div class="t-value">${fmtMoney(s.baseSalary)}</div></div>
              <div class="emp-tile danger"><div class="t-label">خصميات هذا الشهر</div><div class="t-value">${fmtMoney(s.pendingViolationsTotal)}</div></div>
              <div class="emp-tile"><div class="t-label">العهدة المفتوحة</div><div class="t-value">${fmtMoney(s.custodyTotal)}</div></div>
            </div>
            <div class="emp-net"><span>صافي الراتب المتوقع</span><strong>${fmtMoney(s.netSalary)}</strong></div>
          </div>`;
        }).join("")}
      </div>
    `;
  }

  el.querySelectorAll("[data-openemp]").forEach(node => node.onclick = () => {
    EMPLOYEE_VIEW_ID = node.dataset.openemp;
    EMPLOYEES_VIEW = "detail";
    renderEmployeesTab(el);
  });
  wireListModeToggle();

  function wireListModeToggle() {
    el.querySelectorAll("[data-listmode]").forEach(b => b.onclick = () => {
      EMPLOYEES_LIST_MODE = b.dataset.listmode;
      renderEmployeesList(el);
    });
  }
}

function renderEmployeeDetail(el) {
  const users = dbGet("users", []);
  const u = users.find(x => x.id === EMPLOYEE_VIEW_ID);
  if (!u) { EMPLOYEES_VIEW = "list"; renderEmployeesTab(el); return; }

  const isGM = (getCurrentUser() || {}).role === "مدير عام";
  const vehicles = dbGet("vehicles", []).filter(v => v.employeeId === u.id);
  const custodies = dbGet("custodies", []).filter(c => c.employeeId === u.id).sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  const advances = dbGet("accGeneral", []).filter(e => e.category === "سلفية" && e.advanceEmployeeId === u.id).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const incidents = dbGet("employeeIncidents", []).filter(i => i.employeeId === u.id).sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  const pendingAdvances = advances.filter(a => a.advanceStatus === "deduct" && !a.settled);
  const pendingAdvancesTotal = pendingAdvances.reduce((s, a) => s + Number(a.amount || 0), 0);
  const pendingViolations = incidents.filter(i => i.type === "مخالفة" && Number(i.deductionAmount) > 0 && !i.settled);
  const pendingViolationsTotal = pendingViolations.reduce((s, i) => s + Number(i.deductionAmount || 0), 0);
  const baseSalary = Number(u.baseSalary || 0);
  const netSalary = baseSalary - pendingAdvancesTotal - pendingViolationsTotal;

  const entitlement = employeeLeaveEntitlement(u.id);
  const usedLeave = employeeUsedAnnualLeave(u.id);
  const remainingLeave = employeeRemainingLeaveBalance(u.id);
  const tenureYears = u.hireDate ? ((Date.now() - new Date(u.hireDate).getTime()) / (365.25 * 86400000)).toFixed(1) : null;

  el.innerHTML = `
    <div class="flex between" style="margin-bottom:14px">
      <button class="btn" id="empBack">رجوع لقائمة الموظفين</button>
    </div>

    <div class="section-title-row">
      <div><h2>${u.name}</h2><p>${u.role}${u.status === "منتهي الخدمة" ? ` — <span style="color:var(--danger)">منتهي الخدمة بتاريخ ${fmtDate(u.terminationDate)}</span>` : ""}</p></div>
    </div>

    <div class="grid cols-2">
      <div class="card">
        <h3>البيانات الشخصية</h3>
        <div class="kv-row"><span class="k">اسم المستخدم</span><span class="v">${u.username || "-"}</span></div>
        <div class="kv-row"><span class="k">المسمى الوظيفي</span><span class="v">${u.role}</span></div>
        <div class="kv-row"><span class="k">تاريخ التعيين</span><span class="v">${u.hireDate ? fmtDate(u.hireDate) : "-"}</span></div>
        <div class="kv-row"><span class="k">سنوات الخدمة</span><span class="v">${tenureYears !== null ? tenureYears + " سنة" : "-"}</span></div>
        <div class="kv-row"><span class="k">نوع الهوية</span><span class="v">${u.idType || "-"}</span></div>
        <div class="kv-row"><span class="k">رقم الهوية</span><span class="v">${u.idNumber || "-"}</span></div>
        <div class="kv-row"><span class="k">الجنسية</span><span class="v">${u.nationality || "-"}</span></div>
        <div class="kv-row"><span class="k">تاريخ الميلاد</span><span class="v">${u.dob ? fmtDate(u.dob) + (calcAge(u.dob) !== null ? ` (${calcAge(u.dob)} سنة)` : "") : "-"}</span></div>
        <div class="kv-row"><span class="k">تاريخ انتهاء الهوية</span><span class="v">${u.idExpiry ? fmtDate(u.idExpiry) : "-"}</span></div>
        <div class="kv-row"><span class="k">صور الهوية</span><span class="v">${(u.idPhotos || []).length ? u.idPhotos.map(p => `<a href="${p}" target="_blank" class="veh-doc-thumb" style="margin-inline-start:4px"><img src="${p}"></a>`).join("") : "-"}</span></div>
        <button class="btn sm" id="empEditPersonal" style="margin-top:8px">تعديل البيانات الشخصية</button>
        <div class="field" style="margin-top:10px"><label>الراتب الأساسي (ر.س)${isGM ? "" : " — يعدّله المدير العام فقط"}</label>
          <input type="number" min="0" step="0.01" id="emp_baseSalary" value="${baseSalary}" ${isGM ? "" : "disabled"}>
        </div>
      </div>

      <div class="card">
        <h3>رصيد الإجازة السنوية</h3>
        <div class="kv-row"><span class="k">الاستحقاق السنوي</span><span class="v">${entitlement} يوم</span></div>
        <div class="kv-row"><span class="k">المستخدم هذا العام</span><span class="v">${usedLeave} يوم</span></div>
        <div class="kv-row"><span class="k">المتبقي</span><span class="v" style="color:${remainingLeave < 0 ? "var(--danger)" : "var(--success)"}">${remainingLeave} يوم</span></div>
      </div>
    </div>

    <div class="grid cols-2">
      <div class="card">
        <h3>المركبات المسندة له (${vehicles.length})</h3>
        ${vehicles.length ? vehicles.map(v => `
          <div class="kv-row"><span class="k">${[v.brand, v.modelTrim].filter(Boolean).join(" ") || v.category || "مركبة"}</span><span class="v">${v.regNumber ? "استمارة " + v.regNumber : "-"}</span></div>
        `).join("") : `<p class="text-muted" style="font-size:12.5px">لا توجد مركبات مسندة له</p>`}
      </div>

      <div class="card">
        <h3>حركة العهدة (${custodies.length})</h3>
        ${custodies.length ? custodies.map(c => `
          <div class="flex between" style="padding:7px 0;border-bottom:1px solid var(--border)">
            <span style="font-size:12.5px">${c.scopeType === "project" ? "مشروع: " + (c.projectName || "-") : "مصاريف عامة"} — <span class="badge ${c.status === "مفتوحة" ? "orange" : "gray"}">${c.status}</span></span>
            <span class="flex gap center">
              <strong style="font-size:12.5px;color:${custodyBalance(c) >= 0 ? "var(--success)" : "var(--danger)"}">${fmtMoney(custodyBalance(c))}</strong>
              <button class="btn-icon" data-opencus="${c.id}" title="فتح">${ICON_VIEW}</button>
            </span>
          </div>
        `).join("") : `<p class="text-muted" style="font-size:12.5px">لا توجد عهد مسجلة له</p>`}
      </div>
    </div>

    <div class="card">
      <h3>السلفيات (${advances.length})</h3>
      ${advances.length ? `
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>المبلغ</th><th>التاريخ</th><th>الحالة</th><th>الخصم</th></tr></thead>
          <tbody>
            ${advances.map(a => `
              <tr>
                <td><strong>${fmtMoney(a.amount)}</strong></td>
                <td>${fmtDate(a.date)}</td>
                <td>${a.advanceStatus === "exempt" ? `<span class="badge gray">معفية</span>` : `<span class="badge orange">تُخصم من الراتب</span>`}</td>
                <td>${a.advanceStatus === "deduct" ? (a.settled ? `<span class="badge green">خُصمت</span>` : `<span class="badge red">معلّقة</span>`) : "-"}</td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>` : `<p class="text-muted" style="font-size:12.5px">لا توجد سلفيات مسجلة له</p>`}
    </div>

    <div class="card">
      <h3 class="mt-0">ملخص الراتب</h3>
      <div class="grid cols-4">
        <div class="stat-card"><div class="label">الراتب الأساسي</div><div class="value">${fmtMoney(baseSalary)}</div></div>
        <div class="stat-card"><div class="label">خصم سلفيات معلّقة</div><div class="value danger">${fmtMoney(pendingAdvancesTotal)}</div></div>
        <div class="stat-card"><div class="label">خصم مخالفات معلّقة</div><div class="value danger">${fmtMoney(pendingViolationsTotal)}</div></div>
        <div class="stat-card"><div class="label">صافي الراتب المستحق</div><div class="value success">${fmtMoney(netSalary)}</div></div>
      </div>
      <button class="btn primary" id="empPaySalary" style="margin-top:14px" ${baseSalary <= 0 ? "disabled" : ""}>${svgIcon("save")} تسجيل صرف الراتب</button>
      <p class="text-muted" style="font-size:11.5px;margin-top:6px">يُنشئ حركة "رواتب" في المصاريف الإدارية بالصافي، ويعتبر السلفيات والمخالفات المعلّقة أعلاه "مخصومة".</p>
    </div>

    <div class="card">
      <div class="flex between" style="align-items:center;margin-bottom:10px">
        <h3 class="mt-0">المخالفات والإنذارات (${incidents.length})</h3>
        <button class="btn sm primary" id="empAddIncident">+ تسجيل مخالفة/إنذار</button>
      </div>
      ${incidents.length ? incidents.map(i => `
        <div class="flex between wrap" style="gap:8px;border:1px solid var(--border);border-radius:8px;padding:9px 12px;margin-bottom:8px">
          <div>
            <span class="badge ${i.type === "مخالفة" ? "red" : "orange"}">${i.type}</span>
            <span style="font-size:12.5px;margin-inline-start:6px">${i.description || ""}</span>
            <div class="text-muted" style="font-size:11.5px;margin-top:3px">${fmtDate(i.date)}${i.deductionAmount ? " — خصم " + fmtMoney(i.deductionAmount) + (i.settled ? " (خُصم)" : " (معلّق)") : ""}</div>
          </div>
          <button class="btn-icon danger" data-delincident="${i.id}" title="حذف">${ICON_DELETE}</button>
        </div>
      `).join("") : `<p class="text-muted" style="font-size:12.5px">لا توجد مخالفات أو إنذارات مسجلة</p>`}
    </div>

    ${isGM ? `
    <div class="card">
      <h3 class="mt-0">إنهاء الخدمة</h3>
      ${u.status === "منتهي الخدمة" ? `
        <p class="text-muted" style="font-size:12.5px">أُنهيت خدمة هذا الموظف بتاريخ ${fmtDate(u.terminationDate)}${u.terminationReason ? " — السبب: " + u.terminationReason : ""}</p>
        <button class="btn" id="empReactivate">إعادة تفعيل الموظف</button>
      ` : `
        <p class="text-muted" style="font-size:12.5px">إنهاء عقد الموظف يوقف حالته في هذه الصفحة مع الاحتفاظ الكامل بسجلاته (العهد، السلفيات، الإجازات). هذا الإجراء لا يمنعه تلقائياً من تسجيل الدخول — إن أردت إلغاء وصوله للنظام فأوقف ذلك يدوياً من الإعدادات ← التحكم بالمستخدمين.</p>
        <div class="grid cols-2">
          <div class="field"><label>تاريخ انتهاء الخدمة</label><input type="date" id="emp_termDate" value="${todayISO()}"></div>
          <div class="field"><label>السبب (اختياري)</label><input id="emp_termReason"></div>
        </div>
        <button class="btn danger" id="empTerminate">إنهاء عقد الموظف</button>
      `}
    </div>` : ""}
  `;

  document.getElementById("empBack").onclick = () => { EMPLOYEES_VIEW = "list"; EMPLOYEE_VIEW_ID = null; renderEmployeesTab(el); };

  document.getElementById("empEditPersonal").onclick = () => openEmployeePersonalModal(u.id, () => renderEmployeesTab(el));

  const salaryInput = document.getElementById("emp_baseSalary");
  if (salaryInput && isGM) salaryInput.onchange = () => {
    const list = dbGet("users", []);
    const target = list.find(x => x.id === u.id);
    target.baseSalary = Number(salaryInput.value) || 0;
    dbSet("users", list);
    logActivity(`تم تحديث الراتب الأساسي للموظف "${u.name}" إلى ${fmtMoney(target.baseSalary)}`);
    toast("تم حفظ الراتب الأساسي");
  };

  el.querySelectorAll("[data-opencus]").forEach(b => b.onclick = () => openCustodyDetailModal(b.dataset.opencus, el));

  document.getElementById("empAddIncident").onclick = () => openIncidentModal(u, el);

  el.querySelectorAll("[data-delincident]").forEach(b => b.onclick = () => {
    const list = dbGet("employeeIncidents", []);
    const inc = list.find(x => x.id === b.dataset.delincident);
    if (!inc) return;
    if (!confirm(`حذف هذا السجل (${inc.type})؟`)) return;
    dbSet("employeeIncidents", list.filter(x => x.id !== inc.id));
    logActivity(`تم حذف ${inc.type} مسجّلة على الموظف "${u.name}"`);
    renderEmployeesTab(el);
  });

  const payBtn = document.getElementById("empPaySalary");
  if (payBtn) payBtn.onclick = () => {
    if (!confirm(`تسجيل صرف راتب بقيمة ${fmtMoney(netSalary)} للموظف "${u.name}"؟ سيتم اعتبار السلفيات والمخالفات المعلّقة أعلاه "مخصومة".`)) return;
    const genList = dbGet("accGeneral", []);
    genList.push({
      id: uid("ge"), category: "رواتب", amount: netSalary,
      vatApplicable: false, vatAmount: 0,
      date: todayISO(), note: `صافي بعد خصم سلفيات (${fmtMoney(pendingAdvancesTotal)}) ومخالفات (${fmtMoney(pendingViolationsTotal)})`,
      paymentMethod: "",
      attachment: null,
      employeeId: u.id, employeeName: u.name, salaryMonth: todayISO().slice(0, 7),
    });
    dbSet("accGeneral", genList);

    if (pendingAdvances.length) {
      const advList = dbGet("accGeneral", []);
      pendingAdvances.forEach(a => { const t = advList.find(x => x.id === a.id); if (t) t.settled = true; });
      dbSet("accGeneral", advList);
    }
    if (pendingViolations.length) {
      const incList = dbGet("employeeIncidents", []);
      pendingViolations.forEach(i => { const t = incList.find(x => x.id === i.id); if (t) t.settled = true; });
      dbSet("employeeIncidents", incList);
    }

    logActivity(`تم تسجيل صرف راتب للموظف "${u.name}" بقيمة ${fmtMoney(netSalary)}`);
    toast("تم تسجيل الراتب");
    renderEmployeesTab(el);
  };

  const termBtn = document.getElementById("empTerminate");
  if (termBtn) termBtn.onclick = () => {
    if (!confirm(`هل أنت متأكد من إنهاء عقد الموظف "${u.name}"؟`)) return;
    const list = dbGet("users", []);
    const target = list.find(x => x.id === u.id);
    target.status = "منتهي الخدمة";
    target.terminationDate = document.getElementById("emp_termDate").value || todayISO();
    target.terminationReason = document.getElementById("emp_termReason").value.trim();
    dbSet("users", list);
    logActivity(`تم إنهاء عقد الموظف "${u.name}"`);
    toast("تم إنهاء عقد الموظف");
    renderEmployeesTab(el);
  };

  const reactivateBtn = document.getElementById("empReactivate");
  if (reactivateBtn) reactivateBtn.onclick = () => {
    if (!confirm(`إعادة تفعيل الموظف "${u.name}"؟`)) return;
    const list = dbGet("users", []);
    const target = list.find(x => x.id === u.id);
    target.status = "نشط";
    target.terminationDate = "";
    target.terminationReason = "";
    dbSet("users", list);
    logActivity(`تمت إعادة تفعيل الموظف "${u.name}"`);
    toast("تمت إعادة التفعيل");
    renderEmployeesTab(el);
  };
}

function openIncidentModal(u, el) {
  const html = `
    <div class="modal-head"><h3>تسجيل مخالفة / إنذار — ${u.name}</h3><button class="modal-close" id="mClose">×</button></div>
    <div class="field"><label>النوع</label>
      <select id="inc_type">
        <option value="مخالفة">مخالفة</option>
        <option value="إنذار">إنذار</option>
      </select>
    </div>
    <div class="grid cols-2">
      <div class="field"><label>التاريخ</label><input type="date" id="inc_date" value="${todayISO()}"></div>
      <div class="field" id="inc_deductionWrap"><label>مبلغ الخصم من الراتب (اختياري)</label><input type="number" min="0" step="0.01" id="inc_deduction"></div>
    </div>
    <div class="field"><label>الوصف / السبب</label><textarea id="inc_desc"></textarea></div>
    <div class="flex gap"><button class="btn primary" id="inc_save">حفظ</button><button class="btn" id="inc_cancel">إلغاء</button></div>
  `;
  const ov = openModalShell(html);
  ov.querySelector("#mClose").onclick = closeModal;
  ov.querySelector("#inc_cancel").onclick = closeModal;

  const typeSelect = ov.querySelector("#inc_type");
  const deductionWrap = ov.querySelector("#inc_deductionWrap");
  function syncDeductionVisibility() { deductionWrap.style.display = typeSelect.value === "مخالفة" ? "" : "none"; }
  syncDeductionVisibility();
  typeSelect.onchange = syncDeductionVisibility;

  ov.querySelector("#inc_save").onclick = () => {
    const type = typeSelect.value;
    const description = ov.querySelector("#inc_desc").value.trim();
    if (!description) { toast("يرجى إدخال الوصف / السبب"); return; }
    const deductionAmount = type === "مخالفة" ? (Number(ov.querySelector("#inc_deduction").value) || 0) : 0;
    const list = dbGet("employeeIncidents", []);
    list.push({
      id: uid("inc"), employeeId: u.id, employeeName: u.name,
      type, date: ov.querySelector("#inc_date").value || todayISO(),
      description, deductionAmount, settled: false,
      createdAt: new Date().toISOString(),
    });
    dbSet("employeeIncidents", list);
    logActivity(`تم تسجيل ${type} على الموظف "${u.name}"${deductionAmount ? " بخصم " + fmtMoney(deductionAmount) : ""}`);
    toast(`تم تسجيل ${type}`);
    closeModal();
    renderEmployeesTab(el);
  };
}

/* ================= تبويب الأصول (المركبات المملوكة وإهلاكها) ================= */
// إهلاك بطريقة القسط الثابت — نفس المعادلة المستخدمة في قسم التنظيف بالضبط
// (src/shared/depreciation.ts) حتى تتطابق الأرقام عند تجميعها لاحقاً في
// موقع "قوائم الشركة الرئيسية".
function computeAssetDepreciation(purchasePrice, purchaseDate, usefulLifeYears, salvageValue, asOfDate) {
  asOfDate = asOfDate || new Date();
  const depreciableBase = Math.max((Number(purchasePrice) || 0) - (Number(salvageValue) || 0), 0);
  const totalMonths = Math.max(Math.round((Number(usefulLifeYears) || 0) * 12), 1);
  const annual = usefulLifeYears > 0 ? depreciableBase / usefulLifeYears : 0;
  const monthly = annual / 12;

  const purchase = new Date(purchaseDate);
  let monthsElapsed = 0;
  if (!isNaN(purchase.getTime())) {
    monthsElapsed = (asOfDate.getFullYear() - purchase.getFullYear()) * 12 + (asOfDate.getMonth() - purchase.getMonth());
    if (asOfDate.getDate() < purchase.getDate()) monthsElapsed -= 1;
    monthsElapsed = Math.min(Math.max(monthsElapsed, 0), totalMonths);
  }

  const accumulated = Math.round(monthly * monthsElapsed * 100) / 100;
  const bookValue = Math.max(Math.round(((Number(purchasePrice) || 0) - accumulated) * 100) / 100, Number(salvageValue) || 0);

  return {
    annualDepreciation: Math.round(annual * 100) / 100,
    monthlyDepreciation: Math.round(monthly * 100) / 100,
    monthsElapsed,
    accumulatedDepreciation: accumulated,
    bookValue,
  };
}

function renderAssetsTab(el) {
  const vehicles = dbGet("vehicles", []).filter(v => v.ownership === "ملكية الشركة");
  const trackedVehicles = vehicles.filter(v => Number(v.purchasePrice) > 0 && v.purchaseDate);
  const untrackedCount = vehicles.length - trackedVehicles.length;

  const rows = trackedVehicles.map(v => {
    const dep = computeAssetDepreciation(v.purchasePrice, v.purchaseDate, v.usefulLifeYears, v.salvageValue);
    return { v, dep };
  });

  const totalPurchase = rows.reduce((s, r) => s + Number(r.v.purchasePrice || 0), 0);
  const totalAccumulated = rows.reduce((s, r) => s + r.dep.accumulatedDepreciation, 0);
  const totalBookValue = rows.reduce((s, r) => s + r.dep.bookValue, 0);

  el.innerHTML = `
    <div class="card">
      <h3 class="mt-0">الأصول الثابتة</h3>
      <p class="text-muted" style="font-size:12.5px;margin-top:-6px">المركبات المملوكة للشركة (الإعدادات ← المركبات ← "ملكية الشركة") مع بيانات شراء مكتملة — تُحتسب إهلاكاً بطريقة القسط الثابت</p>
    </div>

    <div class="grid cols-3" style="margin-bottom:18px">
      <div class="stat-card"><div class="label">إجمالي سعر الشراء</div><div class="value">${fmtMoney(totalPurchase)}</div></div>
      <div class="stat-card"><div class="label">إجمالي الإهلاك المتراكم</div><div class="value danger">${fmtMoney(totalAccumulated)}</div></div>
      <div class="stat-card"><div class="label">إجمالي القيمة الدفترية الحالية</div><div class="value success">${fmtMoney(totalBookValue)}</div></div>
    </div>

    <div class="card">
      <h3>سجل الأصول</h3>
      ${rows.length ? `
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>المركبة</th><th>تاريخ الشراء</th><th>سعر الشراء</th><th>العمر الافتراضي</th><th>الإهلاك السنوي</th><th>الإهلاك المتراكم</th><th>القيمة الدفترية الحالية</th></tr></thead>
          <tbody>
            ${rows.map(({ v, dep }) => `
              <tr>
                <td><strong>${[v.brand, v.modelTrim].filter(Boolean).join(" ") || "مركبة"}</strong>${v.regNumber ? `<div class="text-muted" style="font-size:11px">استمارة ${v.regNumber}</div>` : ""}</td>
                <td>${fmtDate(v.purchaseDate)}</td>
                <td>${fmtMoney(v.purchasePrice)}</td>
                <td>${v.usefulLifeYears || 0} سنة</td>
                <td>${fmtMoney(dep.annualDepreciation)}</td>
                <td>${fmtMoney(dep.accumulatedDepreciation)}</td>
                <td><strong>${fmtMoney(dep.bookValue)}</strong></td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>` : `<div class="empty-state"><div class="ic">${svgIcon("building", 40)}</div>لا توجد أصول مسجلة بعد</div>`}
      ${untrackedCount > 0 ? `<p class="text-muted" style="font-size:12px;margin-top:12px">${untrackedCount} مركبة مملوكة بلا بيانات شراء كاملة (سعر/تاريخ الشراء) — أكملها من الإعدادات ← المركبات لتظهر هنا.</p>` : ""}
    </div>
  `;
}

/* ================= تواريخ انتهاء الأوراق الرسمية (سجلات المنشأة، إقامات الموظفين، أوراق المركبات...) ================= */
const DOC_EXPIRY_NEAR_DAYS = 60; // تنبيه "يقترب من الانتهاء" خلال شهرين
const DOC_CATEGORY_PRESETS = ["سجلات المنشأة", "إقامات الموظفين", "أوراق المركبات"];

function docDaysRemaining(dateStr) {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return null;
  const exp = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((exp - today) / 86400000);
}
function docMonthsRemaining(days) {
  return days === null ? null : Math.round((days / 30.44) * 10) / 10;
}
function docStatus(days) {
  if (days === null) return { key: "unknown", label: "بدون تاريخ", rowClass: "", badge: "gray" };
  if (days < 0) return { key: "expired", label: "منتهية", rowClass: "row-expired", badge: "red" };
  if (days <= DOC_EXPIRY_NEAR_DAYS) return { key: "near", label: "تقترب من الانتهاء", rowClass: "row-near", badge: "orange" };
  return { key: "ok", label: "سارية", rowClass: "", badge: "green" };
}
function vehicleLabel(v) {
  return (v.brand || v.modelTrim) ? [v.brand, v.modelTrim].filter(Boolean).join(" ") : (v.category || v.type || "مركبة");
}
function docAttachmentCell(att) {
  if (!att) return "-";
  if ((att.type || "").indexOf("image/") === 0) {
    return `<a href="${att.url}" target="_blank" rel="noopener" class="veh-doc-thumb" title="${att.name || "عرض المرفق"}"><img src="${att.url}"></a>`;
  }
  return `<a href="${att.url}" target="_blank" rel="noopener" class="badge blue" style="text-decoration:none">${svgIcon("paperclip", 14)} عرض المرفق</a>`;
}

/* تُستدعى عند بدء التشغيل وكل 5 دقائق (app.js) — تنبيه عبر جرس التنبيهات عند الاقتراب من الشهرين أو الانتهاء فعلياً */
function checkDocumentExpiryNotifications() {
  const docs = dbGet("docExpiries", []);
  let changed = false;
  docs.forEach(d => {
    const days = docDaysRemaining(d.expiryDate);
    if (days === null) return;
    if (days < 0) {
      if (!d.expiredNotified) {
        addNotification({
          type: "doc_expired", title: "انتهت صلاحية مستند",
          message: `انتهت صلاحية "${d.name}"${d.category ? " (" + d.category + ")" : ""} بتاريخ ${fmtDate(d.expiryDate)}.`,
          targetRoles: ["مدير عام", "مدير النظام"], targetUserIds: [], relatedRoute: "acc_general",
        });
        d.expiredNotified = true; d.nearNotified = true; changed = true;
      }
    } else if (days <= DOC_EXPIRY_NEAR_DAYS) {
      if (!d.nearNotified) {
        addNotification({
          type: "doc_near_expiry", title: "اقتراب انتهاء مستند",
          message: `سينتهي "${d.name}"${d.category ? " (" + d.category + ")" : ""} خلال ${days} يوم (بتاريخ ${fmtDate(d.expiryDate)}).`,
          targetRoles: ["مدير عام", "مدير النظام"], targetUserIds: [], relatedRoute: "acc_general",
        });
        d.nearNotified = true; changed = true;
      }
    } else if (d.nearNotified || d.expiredNotified) {
      // تاريخ الانتهاء تغيّر ليصبح بعيداً مجدداً (تجديد المستند) — إعادة ضبط ليصلح للتنبيه لاحقاً عند الاقتراب مجدداً
      d.nearNotified = false; d.expiredNotified = false; changed = true;
    }
  });
  if (changed) dbSet("docExpiries", docs);
}

/* تُستدعى عند بدء التشغيل وكل 5 دقائق (app.js) — نسخة خاصة بالتواريخ الشخصية لحساب المدير العام فقط، تستهدفه هو حصرياً بالتنبيه */
function checkPersonalDocumentExpiryNotifications() {
  const docs = dbGet("personalDocExpiries", []);
  let changed = false;
  docs.forEach(d => {
    const days = docDaysRemaining(d.expiryDate);
    if (days === null) return;
    if (days < 0) {
      if (!d.expiredNotified) {
        addNotification({
          type: "personal_doc_expired", title: "انتهت صلاحية مستند شخصي",
          message: `انتهت صلاحية "${d.name}"${d.category ? " (" + d.category + ")" : ""} بتاريخ ${fmtDate(d.expiryDate)}.`,
          targetRoles: ["مدير عام"], targetUserIds: [], relatedRoute: "acc_general",
        });
        d.expiredNotified = true; d.nearNotified = true; changed = true;
      }
    } else if (days <= DOC_EXPIRY_NEAR_DAYS) {
      if (!d.nearNotified) {
        addNotification({
          type: "personal_doc_near_expiry", title: "اقتراب انتهاء مستند شخصي",
          message: `سينتهي "${d.name}"${d.category ? " (" + d.category + ")" : ""} خلال ${days} يوم (بتاريخ ${fmtDate(d.expiryDate)}).`,
          targetRoles: ["مدير عام"], targetUserIds: [], relatedRoute: "acc_general",
        });
        d.nearNotified = true; changed = true;
      }
    } else if (d.nearNotified || d.expiredNotified) {
      d.nearNotified = false; d.expiredNotified = false; changed = true;
    }
  });
  if (changed) dbSet("personalDocExpiries", docs);
}

const PERSONAL_DOC_PERSON_PRESETS = ["أنا", "الزوجة", "الأبناء"];
const PERSONAL_DOC_ITEM_PRESETS = ["الإقامة", "جواز السفر", "رخصة القيادة", "استمارة السيارة", "الفحص الدوري", "التأمين الطبي", "تأمين السيارة", "إيجار المنزل"];

function renderPersonalDatesTab(el) {
  const docs = dbGet("personalDocExpiries", []).slice().sort((a, b) => (a.expiryDate || "9999").localeCompare(b.expiryDate || "9999"));
  const persons = [...new Set(dbGet("personalDocExpiries", []).map(d => d.category).filter(Boolean))];
  const counts = docs.reduce((s, d) => { const st = docStatus(docDaysRemaining(d.expiryDate)); s[st.key] = (s[st.key] || 0) + 1; return s; }, {});

  el.innerHTML = `
    <div class="card">
      <h3 class="mt-0">تواريخ شخصية</h3>
      <p class="text-muted" style="font-size:12.5px;margin-top:-6px">سجل خاص بحسابك فقط — إقامتك وإقامات العائلة، السيارة، التأمين الطبي، إيجار المنزل، وأي أوراق شخصية أخرى</p>
    </div>

    <div class="grid cols-4" style="margin-bottom:18px">
      <div class="stat-card"><div class="label">إجمالي المستندات</div><div class="value">${docs.length}</div></div>
      <div class="stat-card"><div class="label">منتهية</div><div class="value danger">${counts.expired || 0}</div></div>
      <div class="stat-card"><div class="label">تقترب من الانتهاء (خلال شهرين)</div><div class="value warning">${counts.near || 0}</div></div>
      <div class="stat-card"><div class="label">سارية</div><div class="value success">${counts.ok || 0}</div></div>
    </div>

    <div class="card">
      <div class="flex between" style="align-items:center;margin-bottom:14px">
        <h3 class="mt-0" style="margin:0">السجل</h3>
        <button class="btn sm primary" id="addPersonalDocBtn">${svgIcon("plus")} إضافة مستند</button>
      </div>
      ${docs.length ? `
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>الشخص</th><th>البند</th><th>رقم الهوية/المرجع</th><th>تاريخ الانتهاء</th><th>المتبقي</th><th>التكلفة</th><th>الحالة</th><th>ملاحظات</th><th>المرفق</th><th></th></tr></thead>
          <tbody>
            ${docs.map(d => {
              const days = docDaysRemaining(d.expiryDate);
              const months = docMonthsRemaining(days);
              const st = docStatus(days);
              return `
              <tr class="${st.rowClass}">
                <td>${d.category || "-"}</td>
                <td><strong>${d.name}</strong></td>
                <td>${d.idNumber || "-"}</td>
                <td>${d.expiryDate ? fmtDate(d.expiryDate) : "-"}</td>
                <td>${days === null ? "-" : `${days} يوم${months !== null ? ` <span class="text-muted" style="font-size:11px">(${months} شهر)</span>` : ""}`}</td>
                <td>${d.cost ? fmtMoney(d.cost) : "-"}</td>
                <td><span class="badge ${st.badge}">${st.label}</span></td>
                <td class="text-muted">${d.notes || "-"}</td>
                <td>${docAttachmentCell(d.attachment)}</td>
                <td style="white-space:nowrap"><button class="btn-icon" data-editpdoc="${d.id}" title="تعديل">${ICON_EDIT}</button><button class="btn-icon danger" data-delpdoc="${d.id}" title="حذف">${ICON_DELETE}</button></td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>` : `<div class="empty-state"><div class="ic">${svgIcon("file-text", 40)}</div>لا توجد مستندات مسجلة بعد — أضف أول مستند من الزر أعلاه</div>`}
    </div>
  `;

  document.getElementById("addPersonalDocBtn").onclick = () => openPersonalDocModal(el, null, persons);
  el.querySelectorAll("[data-editpdoc]").forEach(b => b.onclick = () => {
    const target = dbGet("personalDocExpiries", []).find(x => x.id === b.dataset.editpdoc);
    if (target) openPersonalDocModal(el, target, persons);
  });
  el.querySelectorAll("[data-delpdoc]").forEach(b => b.onclick = () => {
    const target = dbGet("personalDocExpiries", []).find(x => x.id === b.dataset.delpdoc);
    if (!target || !confirm(`حذف "${target.name}" من سجل التواريخ الشخصية؟`)) return;
    dbSet("personalDocExpiries", dbGet("personalDocExpiries", []).filter(x => x.id !== target.id));
    logActivity(`تم حذف مستند شخصي "${target.name}" من سجل التواريخ الشخصية`);
    renderPersonalDatesTab(el);
  });
}

function openPersonalDocModal(el, existing, persons) {
  const isEdit = !!existing;
  const html = `
    <div class="modal-head"><h3>${isEdit ? "تعديل مستند شخصي" : "إضافة مستند شخصي"}</h3><button class="modal-close" id="mClose">×</button></div>
    <div class="field"><label>الشخص</label><input id="pd_person" list="pd_personList" value="${isEdit ? (existing.category || "") : ""}" placeholder="مثال: أنا، الزوجة، اسم الابن">
      <datalist id="pd_personList">${[...new Set([...PERSONAL_DOC_PERSON_PRESETS, ...persons])].map(c => `<option value="${c}">`).join("")}</datalist></div>
    <div class="field"><label>البند</label><input id="pd_name" list="pd_nameList" value="${isEdit ? existing.name : ""}" placeholder="مثال: الإقامة، استمارة السيارة">
      <datalist id="pd_nameList">${PERSONAL_DOC_ITEM_PRESETS.map(c => `<option value="${c}">`).join("")}</datalist></div>
    <div class="field"><label>رقم الهوية/المرجع (اختياري)</label><input id="pd_idnum" value="${isEdit ? (existing.idNumber || "") : ""}" placeholder="رقم الهوية، رقم اللوحة، رقم بوليصة التأمين..."></div>
    <div class="grid cols-2">
      <div class="field"><label>تاريخ الانتهاء</label><input type="date" id="pd_expiry" value="${isEdit ? (existing.expiryDate || "") : ""}"></div>
      <div class="field"><label>التكلفة (اختياري)</label><input type="number" min="0" step="0.01" id="pd_cost" value="${isEdit ? (existing.cost || "") : ""}"></div>
    </div>
    <div class="field"><label>ملاحظات (اختياري)</label><textarea id="pd_notes">${isEdit ? (existing.notes || "") : ""}</textarea></div>
    <div class="field"><label>صورة أو ملف المستند (اختياري)</label>
      <input type="file" id="pd_attachment" accept=".pdf,image/*">
      <div id="pd_attachmentPreview" class="flex wrap" style="margin-top:8px">${isEdit && existing.attachment ? `<span class="file-chip">${svgIcon("paperclip", 14)} ${existing.attachment.name || "المرفق الحالي"}</span>` : ""}</div>
    </div>
    <div class="flex gap"><button class="btn primary" id="pd_save">حفظ</button><button class="btn" id="pd_cancel">إلغاء</button></div>
  `;
  const ov = openModalShell(html);
  ov.querySelector("#mClose").onclick = closeModal;
  ov.querySelector("#pd_cancel").onclick = closeModal;
  let attachment = isEdit ? (existing.attachment || null) : null;
  ov.querySelector("#pd_attachment").onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) { attachment = null; ov.querySelector("#pd_attachmentPreview").innerHTML = ""; return; }
    const url = await fileToDataURL(file);
    attachment = { name: file.name, type: file.type, url };
    ov.querySelector("#pd_attachmentPreview").innerHTML = `<span class="file-chip">${svgIcon("paperclip", 14)} ${file.name}</span>`;
  };
  ov.querySelector("#pd_save").onclick = () => {
    const name = ov.querySelector("#pd_name").value.trim();
    const expiryDate = ov.querySelector("#pd_expiry").value;
    if (!name) { toast("يرجى إدخال اسم البند"); return; }
    if (!expiryDate) { toast("يرجى إدخال تاريخ الانتهاء"); return; }
    const list = dbGet("personalDocExpiries", []);
    const data = {
      category: ov.querySelector("#pd_person").value.trim(), name,
      idNumber: ov.querySelector("#pd_idnum").value.trim(), expiryDate,
      cost: Number(ov.querySelector("#pd_cost").value) || 0, notes: ov.querySelector("#pd_notes").value.trim(),
      attachment,
    };
    if (isEdit) {
      const idx = list.findIndex(x => x.id === existing.id);
      list[idx] = Object.assign({}, list[idx], data, existing.expiryDate !== expiryDate ? { nearNotified: false, expiredNotified: false } : {});
      logActivity(`تم تعديل مستند شخصي "${name}" في سجل التواريخ الشخصية`);
    } else {
      list.push(Object.assign({ id: uid("pdoc"), createdAt: new Date().toISOString(), nearNotified: false, expiredNotified: false }, data));
      logActivity(`تم إضافة مستند شخصي "${name}" (ينتهي ${fmtDate(expiryDate)}) إلى سجل التواريخ الشخصية`);
    }
    dbSet("personalDocExpiries", list);
    toast(isEdit ? "تم حفظ التعديلات" : "تمت إضافة المستند");
    closeModal();
    checkPersonalDocumentExpiryNotifications();
    renderPersonalDatesTab(el);
  };
}

function renderDocumentsTab(el) {
  const docs = dbGet("docExpiries", []).slice().sort((a, b) => (a.expiryDate || "9999").localeCompare(b.expiryDate || "9999"));
  const role = (getCurrentUser() || {}).role;
  const canEdit = hasPermission(role, "acc_documents");
  const categories = [...new Set(dbGet("docExpiries", []).map(d => d.category).filter(Boolean))];
  const counts = docs.reduce((s, d) => { const st = docStatus(docDaysRemaining(d.expiryDate)); s[st.key] = (s[st.key] || 0) + 1; return s; }, {});

  el.innerHTML = `
    <div class="card">
      <h3 class="mt-0">تواريخ انتهاء الأوراق الرسمية</h3>
      <p class="text-muted" style="font-size:12.5px;margin-top:-6px">سجلات المنشأة (السجل التجاري، القوى العاملة، شهادة الاستثمار...)، إقامات الموظفين، وأوراق المركبات (الاستمارة، الفحص، التأمين) — مرتبة حسب الأقرب انتهاءً</p>
    </div>

    <div class="grid cols-4" style="margin-bottom:18px">
      <div class="stat-card"><div class="label">إجمالي المستندات</div><div class="value">${docs.length}</div></div>
      <div class="stat-card"><div class="label">منتهية</div><div class="value danger">${counts.expired || 0}</div></div>
      <div class="stat-card"><div class="label">تقترب من الانتهاء (خلال شهرين)</div><div class="value warning">${counts.near || 0}</div></div>
      <div class="stat-card"><div class="label">سارية</div><div class="value success">${counts.ok || 0}</div></div>
    </div>

    <div class="card">
      <div class="flex between" style="align-items:center;margin-bottom:14px">
        <h3 class="mt-0" style="margin:0">السجل</h3>
        ${canEdit ? `<button class="btn sm primary" id="addDocExpiryBtn">${svgIcon("plus")} إضافة مستند</button>` : ""}
      </div>
      ${docs.length ? `
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>التصنيف</th><th>البند</th><th>تاريخ الانتهاء</th><th>المتبقي</th><th>التكلفة</th><th>الحالة</th><th>ملاحظات</th><th>المرفق</th><th></th></tr></thead>
          <tbody>
            ${docs.map(d => {
              const days = docDaysRemaining(d.expiryDate);
              const months = docMonthsRemaining(days);
              const st = docStatus(days);
              return `
              <tr class="${st.rowClass}">
                <td>${d.category || "-"}</td>
                <td><strong>${d.name}</strong>${d.vehicleId ? (() => { const veh = dbGet("vehicles", []).find(v => v.id === d.vehicleId); return veh ? `<div class="text-muted" style="font-size:11px">${svgIcon("truck", 12)} ${vehicleLabel(veh)}${veh.regNumber ? " — استمارة " + veh.regNumber : ""}</div>` : ""; })() : ""}${d.employeeId ? (() => { const emp = dbGet("users", []).find(u => u.id === d.employeeId); return emp ? `<div class="text-muted" style="font-size:11px">${svgIcon("user", 12)} ${emp.name} — ${emp.role}</div>` : ""; })() : ""}</td>
                <td>${d.expiryDate ? fmtDate(d.expiryDate) : "-"}</td>
                <td>${days === null ? "-" : `${days} يوم${months !== null ? ` <span class="text-muted" style="font-size:11px">(${months} شهر)</span>` : ""}`}</td>
                <td>${d.cost ? fmtMoney(d.cost) : "-"}</td>
                <td><span class="badge ${st.badge}">${st.label}</span></td>
                <td class="text-muted">${d.notes || "-"}</td>
                <td>${docAttachmentCell(d.attachment)}</td>
                <td style="white-space:nowrap">${canEdit ? `<button class="btn-icon" data-editdoc="${d.id}" title="تعديل">${ICON_EDIT}</button><button class="btn-icon danger" data-deldoc="${d.id}" title="حذف">${ICON_DELETE}</button>` : ""}</td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>` : `<div class="empty-state"><div class="ic">${svgIcon("file-text", 40)}</div>لا توجد مستندات مسجلة بعد${canEdit ? " — أضف أول مستند من الزر أعلاه" : ""}</div>`}
    </div>
  `;

  const addBtn = document.getElementById("addDocExpiryBtn");
  if (addBtn) addBtn.onclick = () => openDocExpiryModal(el, null, categories);
  el.querySelectorAll("[data-editdoc]").forEach(b => b.onclick = () => {
    const target = dbGet("docExpiries", []).find(x => x.id === b.dataset.editdoc);
    if (target) openDocExpiryModal(el, target, categories);
  });
  el.querySelectorAll("[data-deldoc]").forEach(b => b.onclick = () => {
    const target = dbGet("docExpiries", []).find(x => x.id === b.dataset.deldoc);
    if (!target || !confirm(`حذف "${target.name}" من سجل تواريخ الانتهاء؟`)) return;
    dbSet("docExpiries", dbGet("docExpiries", []).filter(x => x.id !== target.id));
    logActivity(`تم حذف مستند "${target.name}" من سجل تواريخ الانتهاء`);
    renderDocumentsTab(el);
  });
}

const DOC_EMPLOYEE_CATEGORY = "إقامات الموظفين";
function openDocExpiryModal(el, existing, categories) {
  const isEdit = !!existing;
  const vehicles = dbGet("vehicles", []);
  const users = dbGet("users", []);
  const html = `
    <div class="modal-head"><h3>${isEdit ? "تعديل مستند" : "إضافة مستند"}</h3><button class="modal-close" id="mClose">×</button></div>
    ${vehicles.length ? `
    <div class="field"><label>ربط بمركبة مسجلة (اختياري)</label>
      <select id="d_vehicle">
        <option value="">— بدون ربط —</option>
        ${vehicles.map(v => `<option value="${v.id}" ${isEdit && existing.vehicleId === v.id ? "selected" : ""}>${vehicleLabel(v)}${v.regNumber ? " — استمارة " + v.regNumber : ""}</option>`).join("")}
      </select>
      <div class="hint">عند اختيار مركبة يُملأ التصنيف تلقائياً باسمها ويمكنك اختيار نوع الورقة أدناه</div>
    </div>` : ""}
    <div class="field"><label>التصنيف</label><input id="d_category" list="d_catList" value="${isEdit ? (existing.category || "") : ""}" placeholder="مثال: سجلات المنشأة">
      <datalist id="d_catList">${[...new Set([...DOC_CATEGORY_PRESETS, ...categories])].map(c => `<option value="${c}">`).join("")}</datalist></div>
    ${users.length ? `
    <div class="field" id="d_empField" style="display:none">
      <label>ربط بموظف مسجل (اختياري)</label>
      <select id="d_employee">
        <option value="">— بدون ربط —</option>
        ${users.map(u => `<option value="${u.id}" ${isEdit && existing.employeeId === u.id ? "selected" : ""}>${u.name} — ${u.role}</option>`).join("")}
      </select>
      <div class="hint">عند اختيار موظف يُملأ البند تلقائياً باسمه</div>
    </div>` : ""}
    <div class="field"><label>البند</label><input id="d_name" list="d_nameList" value="${isEdit ? existing.name : ""}" placeholder="مثال: سجل تجاري، إقامة - محمد علي، الاستمارة">
      <datalist id="d_nameList"><option value="الاستمارة"><option value="الفحص الدوري"><option value="التأمين"><option value="رخصة السير"></datalist></div>
    <div class="grid cols-2">
      <div class="field"><label>تاريخ الانتهاء</label><input type="date" id="d_expiry" value="${isEdit ? (existing.expiryDate || "") : ""}"></div>
      <div class="field"><label>التكلفة (اختياري)</label><input type="number" min="0" step="0.01" id="d_cost" value="${isEdit ? (existing.cost || "") : ""}"></div>
    </div>
    <div class="field"><label>ملاحظات (اختياري)</label><textarea id="d_notes">${isEdit ? (existing.notes || "") : ""}</textarea></div>
    <div class="field"><label>صورة أو ملف المستند (اختياري)</label>
      <input type="file" id="d_attachment" accept=".pdf,image/*">
      <div id="d_attachmentPreview" class="flex wrap" style="margin-top:8px">${isEdit && existing.attachment ? `<span class="file-chip">${svgIcon("paperclip", 14)} ${existing.attachment.name || "المرفق الحالي"}</span>` : ""}</div>
    </div>
    <div class="flex gap"><button class="btn primary" id="d_save">حفظ</button><button class="btn" id="d_cancel">إلغاء</button></div>
  `;
  const ov = openModalShell(html);
  ov.querySelector("#mClose").onclick = closeModal;
  ov.querySelector("#d_cancel").onclick = closeModal;
  let attachment = isEdit ? (existing.attachment || null) : null;
  ov.querySelector("#d_attachment").onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) { attachment = null; ov.querySelector("#d_attachmentPreview").innerHTML = ""; return; }
    const url = await fileToDataURL(file);
    attachment = { name: file.name, type: file.type, url };
    ov.querySelector("#d_attachmentPreview").innerHTML = `<span class="file-chip">${svgIcon("paperclip", 14)} ${file.name}</span>`;
  };
  const vehicleSelect = ov.querySelector("#d_vehicle");
  if (vehicleSelect) vehicleSelect.onchange = () => {
    const veh = vehicles.find(v => v.id === vehicleSelect.value);
    if (veh) ov.querySelector("#d_category").value = vehicleLabel(veh);
  };
  const categoryInput = ov.querySelector("#d_category");
  const empField = ov.querySelector("#d_empField");
  const empSelect = ov.querySelector("#d_employee");
  const syncEmpField = () => { if (empField) empField.style.display = categoryInput.value.trim() === DOC_EMPLOYEE_CATEGORY ? "block" : "none"; };
  categoryInput.addEventListener("input", syncEmpField);
  categoryInput.addEventListener("change", syncEmpField);
  syncEmpField();
  if (empSelect) empSelect.onchange = () => {
    const emp = users.find(u => u.id === empSelect.value);
    if (emp) ov.querySelector("#d_name").value = "إقامة - " + emp.name;
  };
  ov.querySelector("#d_save").onclick = () => {
    const name = ov.querySelector("#d_name").value.trim();
    const expiryDate = ov.querySelector("#d_expiry").value;
    if (!name) { toast("يرجى إدخال اسم البند"); return; }
    if (!expiryDate) { toast("يرجى إدخال تاريخ الانتهاء"); return; }
    const list = dbGet("docExpiries", []);
    const data = {
      category: ov.querySelector("#d_category").value.trim(), name, expiryDate,
      cost: Number(ov.querySelector("#d_cost").value) || 0, notes: ov.querySelector("#d_notes").value.trim(),
      vehicleId: vehicleSelect ? (vehicleSelect.value || "") : "",
      employeeId: (empSelect && empField && empField.style.display !== "none") ? (empSelect.value || "") : "",
      attachment,
    };
    if (isEdit) {
      const idx = list.findIndex(x => x.id === existing.id);
      // تاريخ انتهاء جديد → إعادة ضبط أعلام التنبيه ليُعاد تقييمها بالتاريخ الجديد
      list[idx] = Object.assign({}, list[idx], data, existing.expiryDate !== expiryDate ? { nearNotified: false, expiredNotified: false } : {});
      logActivity(`تم تعديل مستند "${name}" في سجل تواريخ الانتهاء`);
    } else {
      list.push(Object.assign({ id: uid("doc"), createdAt: new Date().toISOString(), nearNotified: false, expiredNotified: false }, data));
      logActivity(`تم إضافة مستند "${name}" (ينتهي ${fmtDate(expiryDate)}) إلى سجل تواريخ الانتهاء`);
    }
    dbSet("docExpiries", list);
    toast(isEdit ? "تم حفظ التعديلات" : "تمت إضافة المستند");
    closeModal();
    checkDocumentExpiryNotifications();
    renderDocumentsTab(el);
  };
}

/* ---------- الشركة القابضة (حسابات وتواريخ انتهاء مشتركة بين زهى الاعمال للمقاولات وزهى كلين) ----------
   جدول التواريخ هنا للعرض فقط — يُجمَع حيّاً من مصدرين حقيقيين بدل إدخال يدوي مكرر:
   دفتر تواريخ الانتهاء المحلي لهذا التطبيق (docExpiries، بدون التواريخ الشخصية)، وسجل
   تواريخ الانتهاء العلني في تطبيق zuhaclean عبر GET /api/expiry-documents (بلا مصادقة،
   مفتوح CORS للجميع — نفس نمط lib/zuhaclean.js في zuha-group-finance). التعديل يبقى من
   صفحة كل شركة الأصلية (تواريخ الانتهاء هنا، أو داخل تطبيق zuhaclean نفسه). */
const HOLDING_GROUP_FINANCE_URL = "https://zuha-group-finance.vercel.app/";
const ZUHACLEAN_EXPIRY_API = "https://zuhaclean.vercel.app/api/expiry-documents";
const HOLDING_MAIN_COMPANY_LABEL = "زهى الاعمال للمقاولات";
const HOLDING_SUB_COMPANY_LABEL = "زهى كلين";

function holdingAttachmentCell(url) {
  if (!url) return "-";
  const pathPart = url.split("?")[0].toLowerCase();
  if (/\.(png|jpe?g|gif|webp|bmp)$/.test(pathPart)) {
    return `<a href="${url}" target="_blank" rel="noopener" class="veh-doc-thumb" title="عرض المرفق"><img src="${url}"></a>`;
  }
  return `<a href="${url}" target="_blank" rel="noopener" class="badge blue" style="text-decoration:none">${svgIcon("paperclip", 14)} عرض المرفق</a>`;
}

function localHoldingExpiryRows() {
  return dbGet("docExpiries", []).map(d => ({
    company: HOLDING_MAIN_COMPANY_LABEL,
    category: d.category || "-",
    name: d.name,
    expiryDate: d.expiryDate || "",
    cost: d.cost || 0,
    attachmentUrl: d.attachment ? d.attachment.url : null,
  }));
}

async function fetchZuhacleanExpiryRows() {
  const res = await fetch(ZUHACLEAN_EXPIRY_API);
  if (!res.ok) throw new Error("http " + res.status);
  const rows = await res.json();
  return rows.map(r => ({
    company: HOLDING_SUB_COMPANY_LABEL,
    category: r.category || "-",
    name: r.name,
    expiryDate: r.expiry_date || "",
    cost: r.cost || 0,
    attachmentUrl: r.attachment_url || null,
  }));
}

function renderHoldingTab(el) {
  el.innerHTML = `
    <div class="card">
      <h3 class="mt-0">الشركة القابضة</h3>
      <p class="text-muted" style="font-size:12.5px;margin-top:-6px">الحسابات والتواريخ المشتركة بين شركة زهى الاعمال للمقاولات (الشركة الرئيسية) وزهى كلين (الشركة الفرعية)</p>
    </div>

    <div class="card">
      <div class="flex between" style="align-items:center;margin-bottom:10px">
        <h3 class="mt-0" style="margin:0">الحسابات المشتركة بين الشركتين</h3>
        <a class="btn sm" href="${HOLDING_GROUP_FINANCE_URL}" target="_blank" rel="noopener">${svgIcon("file-text", 14)} فتح في نافذة جديدة</a>
      </div>
      <div style="border:1px solid var(--border);border-radius:10px;overflow:hidden">
        <iframe src="${HOLDING_GROUP_FINANCE_URL}" style="width:100%;height:520px;border:none;display:block" title="قوائم الشركة القابضة المالية" loading="lazy"></iframe>
      </div>
      <p class="text-muted" style="font-size:11.5px;margin:8px 0 0">إذا لم تظهر الصفحة أعلاه، استخدم زر "فتح في نافذة جديدة".</p>
    </div>

    <div id="holdingExpiryBody">
      <div class="card"><div class="empty-state"><div class="ic">${svgIcon("clock", 40)}</div>جارٍ تحميل تواريخ الانتهاء من الشركتين...</div></div>
    </div>
  `;

  const body = document.getElementById("holdingExpiryBody");
  const localRows = localHoldingExpiryRows();
  fetchZuhacleanExpiryRows()
    .then(cleanRows => renderHoldingExpiryTable(body, localRows.concat(cleanRows), null))
    .catch(err => {
      console.error("holding expiry fetch error", err);
      renderHoldingExpiryTable(body, localRows, "تعذّر جلب تواريخ الانتهاء من زهى كلين (تحقق من الاتصال) — المعروض أدناه لشركة زهى الاعمال للمقاولات فقط.");
    });
}

function renderHoldingExpiryTable(body, rows, errorMsg) {
  const docs = rows.slice().sort((a, b) => (a.expiryDate || "9999").localeCompare(b.expiryDate || "9999"));
  const counts = docs.reduce((s, d) => { const st = docStatus(docDaysRemaining(d.expiryDate)); s[st.key] = (s[st.key] || 0) + 1; return s; }, {});

  body.innerHTML = `
    ${errorMsg ? `<div class="card" style="background:#fdf6ec;border-color:#f2dfb8"><span style="font-size:12.5px;color:var(--warning)">${svgIcon("alert", 15)} ${errorMsg}</span></div>` : ""}
    <div class="grid cols-4" style="margin-bottom:18px">
      <div class="stat-card"><div class="label">إجمالي البنود</div><div class="value">${docs.length}</div></div>
      <div class="stat-card"><div class="label">منتهية</div><div class="value danger">${counts.expired || 0}</div></div>
      <div class="stat-card"><div class="label">تقترب من الانتهاء (خلال شهرين)</div><div class="value warning">${counts.near || 0}</div></div>
      <div class="stat-card"><div class="label">سارية</div><div class="value success">${counts.ok || 0}</div></div>
    </div>
    <div class="card">
      <h3 class="mt-0">جدول التواريخ المشترك (إقامات، مركبات، إيجار سكن، سجلات...)</h3>
      ${docs.length ? `
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>الشركة</th><th>التصنيف</th><th>البند</th><th>تاريخ الانتهاء</th><th>المتبقي</th><th>التكلفة</th><th>الحالة</th><th>المرفق</th></tr></thead>
          <tbody>
            ${docs.map(d => {
              const days = docDaysRemaining(d.expiryDate);
              const months = docMonthsRemaining(days);
              const st = docStatus(days);
              return `
              <tr class="${st.rowClass}">
                <td>${d.company}</td>
                <td>${d.category || "-"}</td>
                <td><strong>${d.name}</strong></td>
                <td>${d.expiryDate ? fmtDate(d.expiryDate) : "-"}</td>
                <td>${days === null ? "-" : `${days} يوم${months !== null ? ` <span class="text-muted" style="font-size:11px">(${months} شهر)</span>` : ""}`}</td>
                <td>${d.cost ? fmtMoney(d.cost) : "-"}</td>
                <td><span class="badge ${st.badge}">${st.label}</span></td>
                <td>${holdingAttachmentCell(d.attachmentUrl)}</td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>` : `<div class="empty-state"><div class="ic">${svgIcon("file-text", 40)}</div>لا توجد تواريخ انتهاء مسجلة حالياً في الشركتين</div>`}
    </div>
  `;
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
    ${e.attachment ? `<div class="kv-row"><span class="k">المرفق</span><span class="v"><a href="${e.attachment.url}" target="_blank" rel="noopener">${svgIcon("paperclip", 14)} ${e.attachment.name || "عرض المرفق"}</a></span></div>` : ""}
    <div class="flex gap" style="margin-top:14px"><button class="btn" id="v_close">إغلاق</button></div>
  `;
  const ov = openModalShell(html);
  ov.querySelector("#mClose").onclick = closeModal;
  ov.querySelector("#v_close").onclick = closeModal;
}

function openGeneralExpenseModal(el, existingEntry, preset) {
  const isEdit = !!existingEntry;
  const catalog = getExpenseCatalog();
  const catNames = catalog.map(c => c.name);
  const users = dbGet("users", []);
  const html = `
    <div class="modal-head"><h3>${isEdit ? "تعديل مصروف إداري" : "إضافة مصروف إداري"}</h3><button class="modal-close" id="mClose">×</button></div>
    <div class="field"><label>التصنيف</label><select id="g_cat">${catNames.map(c => `<option value="${c}" ${(isEdit ? existingEntry.category : (preset && preset.category)) === c ? "selected" : ""}>${c}</option>`).join("")}</select></div>
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
      <div id="g_attachmentPreview" class="flex wrap" style="margin-top:8px">${isEdit && existingEntry.attachment ? `<span class="file-chip">${svgIcon("paperclip", 14)} ${existingEntry.attachment.name || "المرفق الحالي"}</span>` : ""}</div>
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
    ov.querySelector("#g_attachmentPreview").innerHTML = `<span class="file-chip">${svgIcon("paperclip", 14)} ${file.name}</span>`;
  };

  const catSelect = ov.querySelector("#g_cat");
  const extraBox = ov.querySelector("#g_extraFields");
  const dateLabel = ov.querySelector("#g_dateLabel");

  function renderExtraFields() {
    const catName = catSelect.value;
    ov.querySelector("#g_amount").oninput = null;
    ["#g_vat", "#g_paymentMethod", "#g_attachment"].forEach(id => { const inp = ov.querySelector(id); const f = inp && inp.closest(".field"); if (f) f.style.display = ""; });
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
    } else if (catName === "دفعة أعمال") {
      dateLabel.textContent = "تاريخ الدفعة";
      const contractors = dbGet("contractors", []);
      const pre = isEdit ? existingEntry : (preset || {});
      extraBox.innerHTML = `
        ${isEdit ? "" : `<div class="field"><label>نوع الدفعة</label>
          <select id="g_payKind">
            <option value="cash">دفعة مالية (تحويل / كاش / شبكة)</option>
            <option value="purchase">مشتريات مسددة من قبلنا (فاتورة مسجلة على المشروع)</option>
          </select></div>`}
        <div class="grid cols-2">
          <div class="field"><label>المقاول</label>
            <select id="g_contractor">
              <option value="">— اختر المقاول —</option>
              ${contractors.map(c => `<option value="${c.id}" ${pre.contractorId === c.id ? "selected" : ""}>${c.name}${c.trade ? " — " + c.trade : ""}</option>`).join("")}
            </select>
            ${!contractors.length ? `<div class="hint">لا يوجد مقاولو باطن — أضفهم من صفحة مقاولي الباطن</div>` : ""}
          </div>
          <div class="field"><label>المشروع</label><select id="g_conProject"></select></div>
        </div>
        <div id="g_conInfo" style="margin-bottom:14px"></div>
        <div id="g_purchaseBox" style="display:none;margin-bottom:14px"></div>
      `;
      const conSel = extraBox.querySelector("#g_contractor");
      const projSel = extraBox.querySelector("#g_conProject");
      const infoBox = extraBox.querySelector("#g_conInfo");
      const amountInput = ov.querySelector("#g_amount");
      const refreshProjects = (keepId) => {
        const ags = conSel.value ? dbGet("contractorAgreements", []).filter(a => a.contractorId === conSel.value) : [];
        const projs = dbGet("projects", []);
        projSel.innerHTML = conSel.value && !ags.length
          ? `<option value="">— لا توجد اتفاقات لهذا المقاول —</option>`
          : `<option value="">— اختر المشروع —</option>` + ags.map(a => { const p = projs.find(x => x.id === a.projectId); return `<option value="${a.projectId}" ${keepId === a.projectId ? "selected" : ""}>${p ? p.name : (a.projectName || "مشروع")}</option>`; }).join("");
      };
      const refreshInfo = () => {
        const f = conSel.value && projSel.value ? contractorFigures(conSel.value, projSel.value, isEdit ? existingEntry.id : null) : null;
        if (!f) { infoBox.innerHTML = conSel.value ? `<div class="text-muted" style="font-size:12.5px">اختر مشروعاً للمقاول لعرض الاتفاق والمبلغ المتبقي — تُنشأ الاتفاقات من صفحة مقاولي الباطن.</div>` : ""; return; }
        const amt = Number(amountInput.value) || 0;
        const after = f.remaining - amt;
        infoBox.innerHTML = `
          <div class="card" style="background:#f6f9fd;padding:14px 18px;margin:0">
            <div class="kv-row"><span class="k">نوع الاتفاق</span><span class="v">${AGREEMENT_TYPE_LABELS[f.ag.type]}</span></div>
            <div class="kv-row"><span class="k">المستحق النهائي (بعد التمتير والخصومات والأعمال الإضافية)</span><span class="v">${fmtMoney(f.entitlement)}</span></div>
            <div class="kv-row"><span class="k">المدفوع سابقاً</span><span class="v">${fmtMoney(f.paid)}</span></div>
            <div class="kv-row"><span class="k">المتبقي قبل هذه الدفعة</span><span class="v">${fmtMoney(f.remaining)}</span></div>
            <div class="kv-row"><span class="k">المتبقي بعد هذه الدفعة</span><span class="v" style="color:${after < 0 ? "var(--danger)" : "var(--success)"}">${fmtMoney(after)}${after < 0 ? " (تجاوز المستحق)" : ""}</span></div>
          </div>`;
      };
      refreshProjects(pre.projectId);
      refreshInfo();
      const kindSel = extraBox.querySelector("#g_payKind");
      const purchaseBox = extraBox.querySelector("#g_purchaseBox");
      const refreshPurchase = () => {
        const purchase = !!kindSel && kindSel.value === "purchase";
        ["#g_vat", "#g_paymentMethod", "#g_attachment"].forEach(id => { const inp = ov.querySelector(id); const f = inp && inp.closest(".field"); if (f) f.style.display = purchase ? "none" : ""; });
        purchaseBox.style.display = purchase ? "block" : "none";
        if (!purchase) return;
        if (!projSel.value) { purchaseBox.innerHTML = `<div class="text-muted" style="font-size:12.5px">اختر المقاول والمشروع لعرض فواتير المشتريات المسجلة على المشروع.</div>`; return; }
        const invs = projectPurchaseInvoices(projSel.value).filter(i => i.available > 0);
        purchaseBox.innerHTML = invs.length ? `
          <div class="field" style="margin-bottom:0"><label>فاتورة المشتريات المسجلة على المشروع</label>
            <select id="g_purchaseEntry">
              <option value="">— اختر الفاتورة —</option>
              ${invs.map(i => `<option value="${i.entry.id}">${fmtDate(i.entry.date)} — ${purchaseInvoiceLabel(i.entry)} — المتاح ${fmtMoney(i.available)}</option>`).join("")}
            </select>
            <div class="hint">يُحتسب المبلغ كدفعة للمقاول من نفس الفاتورة دون تسجيل مصروف جديد (المشتريات مسجّلة أصلاً في محاسبة المشروع).</div>
          </div>` : `<div class="text-muted" style="font-size:12.5px">لا توجد فواتير مشتريات متاحة على هذا المشروع — سجّلها من محاسبة المشاريع (نوع الحركة: دفعة مشتريات).</div>`;
        const entrySel = purchaseBox.querySelector("#g_purchaseEntry");
        if (entrySel) entrySel.onchange = () => {
          const inv = invs.find(i => i.entry.id === entrySel.value);
          if (inv) { amountInput.value = inv.available; refreshInfo(); }
        };
      };
      if (kindSel) kindSel.onchange = refreshPurchase;
      conSel.onchange = () => { refreshProjects(""); refreshInfo(); refreshPurchase(); };
      projSel.onchange = () => { refreshInfo(); refreshPurchase(); };
      amountInput.oninput = refreshInfo;
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
    } else if (category === "دفعة أعمال") {
      const conId = (ov.querySelector("#g_contractor") || {}).value;
      const projId = (ov.querySelector("#g_conProject") || {}).value;
      const con = dbGet("contractors", []).find(x => x.id === conId);
      const proj = dbGet("projects", []).find(x => x.id === projId);
      if (!con) { toast("يرجى اختيار المقاول"); return; }
      if (!projId || !findContractorAgreement(conId, projId)) { toast("يرجى اختيار مشروع للمقاول عليه اتفاق مسجّل"); return; }
      const kindEl = ov.querySelector("#g_payKind");
      if (kindEl && kindEl.value === "purchase") {
        const inv = projectPurchaseInvoices(projId).find(i => i.entry.id === (ov.querySelector("#g_purchaseEntry") || {}).value);
        if (!inv) { toast("يرجى اختيار فاتورة المشتريات"); return; }
        if (amount > inv.available + 0.005) { toast("المبلغ أكبر من المتاح على الفاتورة (" + fmtMoney(inv.available) + ")"); return; }
        createContractorPurchasePayments(con, proj || { id: projId, name: "" }, [{ entry: inv.entry, amount }], ov.querySelector("#g_date").value || todayISO(), ov.querySelector("#g_note").value.trim());
        toast("تم احتساب الفاتورة كدفعة للمقاول");
        closeModal();
        if (preset && preset.onSaved) preset.onSaved(); else renderGeneralExpensesTab(el);
        return;
      }
      entry.contractorId = con.id;
      entry.contractorName = con.name;
      entry.projectId = projId;
      entry.projectName = proj ? proj.name : "";
      logSuffix = ` للمقاول "${con.name}" — المشروع: ${entry.projectName}`;
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
    if (preset && preset.onSaved) preset.onSaved(); else renderGeneralExpensesTab(el);
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

  const inputPurchases = projEntries.filter(e => ACC_EXPENSE_TYPES.includes(e.type)).reduce((s, e) => s + Number(e.amount), 0)
    + genEntries.reduce((s, e) => s + Number(e.amount), 0);
  const inputVat = projEntries.filter(e => ACC_EXPENSE_TYPES.includes(e.type)).reduce((s, e) => s + Number(e.vatAmount || 0), 0)
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
