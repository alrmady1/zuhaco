/* =========================================================
   مقاولو الباطن: بيانات المقاول + اتفاقه على كل مشروع (بالمتر أو مقطوعية) + حسابه (المستحق / المدفوع / المتبقي)
   المخزّن:
   - contractors:           [{id, name, trade, phone, notes}]
   - contractorAgreements:  [{id, contractorId, projectId, projectName, type: "unit"|"lumpsum", lumpSumAmount,
                              items:[{id, boqKey, name, unit, qty, unitPrice, finalQty}],
                              adjustments:[{id, kind, label, amount (موجب = إضافة، سالب = خصم), date, note}]}]
   - الدفعات: مصاريف إدارية (accGeneral) بتصنيف "دفعة أعمال" وفيها contractorId + projectId
   ========================================================= */

let CONTRACTORS_VIEW = "list"; // list | account
let CONTRACTOR_VIEW_ID = null;
let CONTRACTOR_ACC_PROJECT = null;

const CONTRACTOR_TRADES = ["كهربائي", "سباك", "بنّاء", "نجار", "حداد", "دهان", "أسقف وجبس", "ألمنيوم", "بلاط وأرضيات", "تكييف", "عزل", "مقاول عام"];
const AGREEMENT_TYPE_LABELS = { unit: "بالمتر", lumpsum: "مقطوعية" };
const CONTRACTOR_PAYMENT_CATEGORY = "دفعة أعمال";
const CONTRACTOR_ADJ_KINDS = [
  { key: "delay", label: "خصم تأخير", sign: -1 },
  { key: "qty", label: "تغيير بالكميات (حسب التمتير النهائي)", sign: 0 },
  { key: "deduction", label: "خصم آخر", sign: -1 },
  { key: "addition", label: "إضافة / زيادة", sign: 1 },
];

/* ---------- حسابات ---------- */
function getContractors() { return dbGet("contractors", []); }
function contractorAgreementsOf(contractorId) { return dbGet("contractorAgreements", []).filter(a => a.contractorId === contractorId); }
function findContractorAgreement(contractorId, projectId) {
  return dbGet("contractorAgreements", []).find(a => a.contractorId === contractorId && a.projectId === projectId) || null;
}
function contractorItemFinalQty(it) {
  return (it.finalQty !== undefined && it.finalQty !== null && it.finalQty !== "") ? (Number(it.finalQty) || 0) : (Number(it.qty) || 0);
}
function contractorAgreementTotals(ag) {
  const items = ag.items || [];
  const agreed = ag.type === "unit"
    ? items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.unitPrice) || 0), 0)
    : (Number(ag.lumpSumAmount) || 0);
  const measured = ag.type === "unit"
    ? items.reduce((s, it) => s + contractorItemFinalQty(it) * (Number(it.unitPrice) || 0), 0)
    : agreed;
  const adjustments = (ag.adjustments || []).reduce((s, a) => s + (Number(a.amount) || 0), 0);
  const extras = (ag.extras || []).reduce((s, x) => s + contractorExtraAmount(x), 0);
  return { agreed, measuredDiff: measured - agreed, measured, adjustments, extras, entitlement: measured + adjustments + extras };
}

/* أعمال إضافية نفّذها المقاول تُضاف لصالحه في حسابه: أمتار/كميات إضافية، بند جديد، فاتورة مشتريات اشتراها، أو دفعة/مصروف سدّده */
const CONTRACTOR_EXTRA_KINDS = [
  { key: "qty", label: "أمتار / كميات إضافية على بند من الاتفاق" },
  { key: "item", label: "بند إضافي جديد" },
  { key: "purchase", label: "فاتورة مشتريات اشتراها المقاول" },
  { key: "payment", label: "دفعة / مصروف سدّده المقاول" },
];
function contractorExtraAmount(x) {
  return (x.kind === "qty" || x.kind === "item") ? (Number(x.qty) || 0) * (Number(x.unitPrice) || 0) : (Number(x.amount) || 0);
}
function contractorPaymentsOf(contractorId, projectId, excludeId) {
  return dbGet("accGeneral", []).filter(e => e.category === CONTRACTOR_PAYMENT_CATEGORY && e.contractorId === contractorId
    && (!projectId || e.projectId === projectId) && e.id !== excludeId);
}
/* ---------- دفعات المقاول من مشتريات سبق تسجيلها (فواتير مسددة من قبلنا على المشروع) ----------
   contractorPurchasePayments: [{id, contractorId, projectId, entryId (حركة accProjects), amount, date, note, label}]
   لا تُنشئ مصروفاً جديداً (المشتريات مسجّلة أصلاً في محاسبة المشروع) — فقط تُحتسب كدفعة للمقاول من نفس الفاتورة */
const PURCHASE_ENTRY_TYPES = ["دفعة مشتريات", "مصروف مواد"];
function contractorPurchasePaymentsOf(contractorId, projectId) {
  return dbGet("contractorPurchasePayments", []).filter(p => p.contractorId === contractorId && (!projectId || p.projectId === projectId));
}
/* المُسنَد من الفاتورة = دفعات مشتريات للمقاولين + أعمال إضافية مربوطة بها (حتى لا تُحتسب الفاتورة مرتين) */
function purchaseAllocatedAmount(entryId, excludeExtraId) {
  const payments = dbGet("contractorPurchasePayments", []).filter(p => p.entryId === entryId).reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const linkedExtras = dbGet("contractorAgreements", []).reduce((sum, ag) =>
    sum + (ag.extras || []).filter(x => x.kind === "purchase" && x.entryId === entryId && x.id !== excludeExtraId).reduce((s, x) => s + (Number(x.amount) || 0), 0), 0);
  return payments + linkedExtras;
}
function projectPurchaseInvoices(projectId, excludeExtraId) {
  return dbGet("accProjects", []).filter(e => e.projectId === projectId && PURCHASE_ENTRY_TYPES.includes(e.type))
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
    .map(e => { const allocated = purchaseAllocatedAmount(e.id, excludeExtraId); return { entry: e, allocated, available: Math.max((Number(e.amount) || 0) - allocated, 0) }; });
}
function purchaseInvoiceLabel(e) {
  return [e.vendorName, e.invoiceRefNumber ? "فاتورة " + e.invoiceRefNumber : "", e.note].filter(Boolean).join(" — ") || e.type;
}
function contractorPaidTotal(contractorId, projectId, excludeGeneralId) {
  return contractorPaymentsOf(contractorId, projectId, excludeGeneralId).reduce((s, e) => s + (Number(e.amount) || 0), 0)
    + contractorPurchasePaymentsOf(contractorId, projectId).reduce((s, p) => s + (Number(p.amount) || 0), 0);
}
function contractorHasPayments(contractorId, projectId) {
  return contractorPaymentsOf(contractorId, projectId).length > 0 || contractorPurchasePaymentsOf(contractorId, projectId).length > 0;
}

function contractorFigures(contractorId, projectId, excludePaymentId) {
  const ag = findContractorAgreement(contractorId, projectId);
  if (!ag) return null;
  const t = contractorAgreementTotals(ag);
  const paid = contractorPaidTotal(contractorId, projectId, excludePaymentId);
  return Object.assign({ ag, paid, remaining: t.entitlement - paid }, t);
}
function mutateContractorAgreement(agId, fn) {
  const list = dbGet("contractorAgreements", []);
  const ag = list.find(a => a.id === agId);
  if (!ag) return null;
  fn(ag);
  dbSet("contractorAgreements", list);
  return ag;
}
function signedMoneyHtml(n) {
  n = Number(n) || 0;
  if (n === 0) return `<span class="text-muted">${fmtMoney(0)}</span>`;
  return `<strong style="color:${n > 0 ? "var(--success)" : "var(--danger)"}">${n > 0 ? "+" : "−"} ${fmtMoney(Math.abs(n))}</strong>`;
}

/* ---------- الصفحة الرئيسية ---------- */
function renderContractors(el) {
  if (CONTRACTORS_VIEW === "account") return renderContractorAccount(el);
  if (CONTRACTORS_VIEW === "subBuilder") return renderSubcontractBuilder(el);
  if (CONTRACTORS_VIEW === "subView") return renderSubcontractView(el);
  renderContractorsList(el);
}

function renderContractorsList(el) {
  const contractors = getContractors().slice().sort((a, b) => (a.name || "").localeCompare(b.name || "", "ar"));
  const role = (getCurrentUser() || {}).role;
  const canAdd = hasPermission(role, "contractors_add");
  const canDelete = hasPermission(role, "contractors_delete");

  const rows = contractors.map(c => {
    const ags = contractorAgreementsOf(c.id);
    const totals = ags.reduce((s, ag) => {
      const f = contractorFigures(c.id, ag.projectId);
      s.entitlement += f.entitlement; s.paid += f.paid; s.remaining += f.remaining; return s;
    }, { entitlement: 0, paid: 0, remaining: 0 });
    return { c, projectsCount: ags.length, ...totals };
  });
  const grand = rows.reduce((s, r) => ({ entitlement: s.entitlement + r.entitlement, paid: s.paid + r.paid, remaining: s.remaining + r.remaining }), { entitlement: 0, paid: 0, remaining: 0 });

  el.innerHTML = `
    <div class="section-title-row">
      <div><h2>مقاولو الباطن</h2><p>بيانات مقاولي الباطن واتفاقاتهم وعقودهم على المشاريع (بالمتر أو مقطوعية) وحساب كل مقاول</p></div>
      ${canAdd ? `<button class="btn primary" id="newContractorBtn">${svgIcon("plus")} مقاول باطن جديد</button>` : ""}
    </div>

    <div class="grid cols-4" style="margin-bottom:20px">
      <div class="stat-card"><div class="label">عدد مقاولي الباطن</div><div class="value">${contractors.length}</div></div>
      <div class="stat-card"><div class="label">إجمالي المستحق لمقاولي الباطن</div><div class="value">${fmtMoney(grand.entitlement)}</div></div>
      <div class="stat-card"><div class="label">إجمالي المدفوع</div><div class="value success">${fmtMoney(grand.paid)}</div></div>
      <div class="stat-card"><div class="label">إجمالي المتبقي</div><div class="value ${grand.remaining > 0 ? "warning" : "success"}">${fmtMoney(grand.remaining)}</div></div>
    </div>

    <div class="card">
      ${contractors.length ? `
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>المقاول</th><th>العمل</th><th>الجوال</th><th>المشاريع</th><th>عقود الباطن</th><th>المستحق</th><th>المدفوع</th><th>المتبقي</th><th></th></tr></thead>
          <tbody>
            ${rows.map(r => `
              <tr data-opencon="${r.c.id}" style="cursor:pointer">
                <td><strong>${r.c.name}</strong></td>
                <td>${r.c.trade ? `<span class="badge blue">${r.c.trade}</span>` : `<span class="text-muted">-</span>`}</td>
                <td>${r.c.phone || `<span class="text-muted">-</span>`}</td>
                <td>${r.projectsCount}</td>
                <td>${subcontractsOf(r.c.id).length}</td>
                <td>${fmtMoney(r.entitlement)}</td>
                <td>${fmtMoney(r.paid)}</td>
                <td><strong style="color:${r.remaining > 0 ? "var(--warning)" : "var(--success)"}">${fmtMoney(r.remaining)}</strong></td>
                <td style="white-space:nowrap">
                  <button class="btn-icon" data-openconbtn="${r.c.id}" title="حساب المقاول">${ICON_VIEW}</button>
                  ${canAdd ? `<button class="btn-icon" data-editcon="${r.c.id}" title="تعديل بيانات المقاول">${ICON_EDIT}</button>` : ""}
                  ${canDelete ? `<button class="btn-icon danger" data-delcon="${r.c.id}" title="حذف">${ICON_DELETE}</button>` : ""}
                </td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>` : `<div class="empty-state"><div class="ic">${svgIcon("briefcase", 40)}</div>لا يوجد مقاولو باطن بعد${canAdd ? " — أضف أول مقاول من الزر أعلاه" : ""}</div>`}
    </div>
  `;

  const openAccount = (id) => { CONTRACTOR_VIEW_ID = id; CONTRACTOR_ACC_PROJECT = null; CONTRACTORS_VIEW = "account"; renderContractors(el); };
  el.querySelectorAll("tr[data-opencon]").forEach(tr => tr.onclick = () => openAccount(tr.dataset.opencon));
  el.querySelectorAll("[data-openconbtn]").forEach(b => b.onclick = (e) => { e.stopPropagation(); openAccount(b.dataset.openconbtn); });
  const newBtn = document.getElementById("newContractorBtn");
  if (newBtn) newBtn.onclick = () => openContractorModal(null, () => renderContractors(el));
  el.querySelectorAll("[data-editcon]").forEach(b => b.onclick = (e) => {
    e.stopPropagation();
    openContractorModal(getContractors().find(c => c.id === b.dataset.editcon), () => renderContractors(el));
  });
  el.querySelectorAll("[data-delcon]").forEach(b => b.onclick = (e) => {
    e.stopPropagation();
    const c = getContractors().find(x => x.id === b.dataset.delcon);
    if (!c) return;
    if (contractorHasPayments(c.id)) { toast("لا يمكن حذف مقاول لديه دفعات مسجلة (مصاريف أو مشتريات)"); return; }
    if (!confirm(`حذف المقاول "${c.name}" وجميع اتفاقاته؟`)) return;
    dbSet("contractors", getContractors().filter(x => x.id !== c.id));
    dbSet("contractorAgreements", dbGet("contractorAgreements", []).filter(a => a.contractorId !== c.id));
    logActivity(`تم حذف المقاول "${c.name}"`);
    renderContractors(el);
  });
}

function openContractorModal(existing, onSaved) {
  const isEdit = !!existing;
  const html = `
    <div class="modal-head"><h3>${isEdit ? "تعديل بيانات المقاول" : "مقاول باطن جديد"}</h3><button class="modal-close" id="mClose">×</button></div>
    <div class="field"><label>اسم المقاول</label><input id="con_name" value="${isEdit ? existing.name : ""}" placeholder="مثال: ساجد الأعمال"></div>
    <div class="grid cols-2">
      <div class="field"><label>العمل / التخصص</label><input id="con_trade" list="con_tradeList" value="${isEdit ? (existing.trade || "") : ""}" placeholder="مثال: كهربائي">
        <datalist id="con_tradeList">${CONTRACTOR_TRADES.map(t => `<option value="${t}">`).join("")}</datalist></div>
      <div class="field"><label>رقم الجوال</label><input id="con_phone" value="${isEdit ? (existing.phone || "") : ""}"></div>
    </div>
    <div class="field"><label>ملاحظات</label><textarea id="con_notes">${isEdit ? (existing.notes || "") : ""}</textarea></div>
    <div class="flex gap"><button class="btn primary" id="con_save">حفظ</button><button class="btn" id="con_cancel">إلغاء</button></div>
  `;
  const ov = openModalShell(html);
  ov.querySelector("#mClose").onclick = closeModal;
  ov.querySelector("#con_cancel").onclick = closeModal;
  ov.querySelector("#con_save").onclick = () => {
    const name = ov.querySelector("#con_name").value.trim();
    if (!name) { toast("يرجى إدخال اسم المقاول"); return; }
    const data = { name, trade: ov.querySelector("#con_trade").value.trim(), phone: ov.querySelector("#con_phone").value.trim(), notes: ov.querySelector("#con_notes").value.trim() };
    const list = getContractors();
    if (isEdit) {
      const idx = list.findIndex(c => c.id === existing.id);
      list[idx] = Object.assign({}, list[idx], data);
      logActivity(`تم تعديل بيانات المقاول "${name}"`);
    } else {
      list.push(Object.assign({ id: uid("con"), createdAt: new Date().toISOString() }, data));
      logActivity(`تم إضافة المقاول "${name}"${data.trade ? " (" + data.trade + ")" : ""}`);
    }
    dbSet("contractors", list);
    toast(isEdit ? "تم حفظ بيانات المقاول" : "تم إضافة المقاول");
    closeModal();
    onSaved();
  };
}

/* ---------- حساب المقاول (لكل مشروع على حدة مع التنقل بين المشاريع) ---------- */
function renderContractorAccount(el) {
  const c = getContractors().find(x => x.id === CONTRACTOR_VIEW_ID);
  if (!c) { CONTRACTORS_VIEW = "list"; renderContractors(el); return; }
  const role = (getCurrentUser() || {}).role;
  const canEdit = hasPermission(role, "contractors_add");
  const canPay = hasPermission(role, "acc_general");
  const projects = dbGet("projects", []);
  const agreements = contractorAgreementsOf(c.id);

  if (!CONTRACTOR_ACC_PROJECT || !projects.some(p => p.id === CONTRACTOR_ACC_PROJECT)) {
    const withAg = projects.find(p => agreements.some(a => a.projectId === p.id));
    CONTRACTOR_ACC_PROJECT = (withAg || projects[0] || {}).id || null;
  }
  const project = projects.find(p => p.id === CONTRACTOR_ACC_PROJECT) || null;
  const figs = project ? contractorFigures(c.id, project.id) : null;

  const summaryRows = agreements.map(ag => ({ ag, f: contractorFigures(c.id, ag.projectId) }));

  el.innerHTML = `
    <div class="breadcrumb"><a id="bcContractors">مقاولو الباطن</a>${svgIcon("chevron-left")}<span>${c.name}</span></div>
    <div class="section-title-row">
      <div>
        <h2>${c.name} ${c.trade ? `<span class="badge blue" style="font-size:13px;vertical-align:middle">${c.trade}</span>` : ""}</h2>
        <p>${c.phone ? "الجوال: " + c.phone + " — " : ""}حساب المقاول لكل مشروع على حدة${c.notes ? " — " + c.notes : ""}</p>
      </div>
      <button class="btn" id="conBack">${svgIcon("chevron-left")} رجوع لمقاولي الباطن</button>
    </div>

    ${summaryRows.length ? `
    <div class="card">
      <h3>${svgIcon("layers", 22)} ملخص المقاول على كل المشاريع</h3>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>المشروع</th><th>الاتفاق</th><th>المستحق النهائي</th><th>المدفوع</th><th>المتبقي</th><th></th></tr></thead>
          <tbody>
            ${summaryRows.map(({ ag, f }) => `
              <tr>
                <td><strong>${(projects.find(p => p.id === ag.projectId) || {}).name || ag.projectName || "مشروع محذوف"}</strong></td>
                <td><span class="badge gray">${AGREEMENT_TYPE_LABELS[ag.type] || ""}</span></td>
                <td>${fmtMoney(f.entitlement)}</td>
                <td>${fmtMoney(f.paid)}</td>
                <td><strong style="color:${f.remaining > 0 ? "var(--warning)" : "var(--success)"}">${fmtMoney(f.remaining)}</strong></td>
                <td><button class="btn sm" data-switchproj="${ag.projectId}">فتح</button></td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>
    </div>` : ""}

    <div class="card">
      <h3>${svgIcon("folder", 22)} المشروع</h3>
      ${projects.length ? `
      <div class="field" style="margin-bottom:0">
        <label>اختر المشروع للانتقال إلى حساب المقاول فيه</label>
        <select id="ca_project">
          ${projects.map(p => `<option value="${p.id}" ${p.id === CONTRACTOR_ACC_PROJECT ? "selected" : ""}>${p.name}${agreements.some(a => a.projectId === p.id) ? " — (يوجد اتفاق)" : ""}</option>`).join("")}
        </select>
      </div>` : `<div class="text-muted">لا توجد مشاريع — أضف مشروعاً من صفحة المشاريع أولاً.</div>`}
    </div>

    ${project ? (figs ? accountBodyHtml(c, project, figs, canEdit, canPay) : `
    <div class="card">
      <div class="empty-state">
        <div class="ic">${svgIcon("file-text", 40)}</div>
        <div>لا يوجد اتفاق مسجّل للمقاول "${c.name}" على مشروع "${project.name}"</div>
        ${canEdit ? `<button class="btn primary" id="createAgreementBtn" style="margin-top:14px">${svgIcon("plus")} إنشاء اتفاق لهذا المشروع</button>` : ""}
      </div>
    </div>`) : ""}

    ${subcontractsCardHtml(c, canEdit, hasPermission(role, "contractors_delete"))}
  `;

  document.getElementById("bcContractors").onclick = () => { CONTRACTORS_VIEW = "list"; renderContractors(el); };
  document.getElementById("conBack").onclick = () => { CONTRACTORS_VIEW = "list"; renderContractors(el); };
  const projSel = document.getElementById("ca_project");
  if (projSel) projSel.onchange = () => { CONTRACTOR_ACC_PROJECT = projSel.value; renderContractorAccount(el); };
  el.querySelectorAll("[data-switchproj]").forEach(b => b.onclick = () => { CONTRACTOR_ACC_PROJECT = b.dataset.switchproj; renderContractorAccount(el); window.scrollTo(0, 0); });

  const createBtn = document.getElementById("createAgreementBtn");
  if (createBtn) createBtn.onclick = () => openCreateAgreementModal(c, project, () => renderContractorAccount(el));
  bindSubcontractsCard(el, c, project ? project.id : "");
  if (figs) bindAccountEvents(el, c, project, figs, canEdit, canPay);
}

function accountBodyHtml(c, project, f, canEdit, canPay) {
  const ag = f.ag;
  const isUnit = ag.type === "unit";
  const invoicesById = {};
  dbGet("accProjects", []).forEach(x => { invoicesById[x.id] = x; });
  const payments = [
    ...contractorPaymentsOf(c.id, project.id).map(e => ({ kind: "cash", id: e.id, date: e.date, amount: e.amount, method: e.paymentMethod, note: e.note })),
    ...contractorPurchasePaymentsOf(c.id, project.id).map(p => ({ kind: "purchase", id: p.id, date: p.date, amount: p.amount, label: p.label, note: p.note, entry: invoicesById[p.entryId] })),
  ].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const adjustments = (ag.adjustments || []).slice().sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const extras = (ag.extras || []).slice().sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const items = ag.items || [];

  return `
    <div class="grid cols-4">
      <div class="stat-card"><div class="label">قيمة الاتفاق الأصلية (${AGREEMENT_TYPE_LABELS[ag.type]})</div><div class="value">${fmtMoney(f.agreed)}</div></div>
      <div class="stat-card"><div class="label">فرق التمتير النهائي</div><div class="value">${signedMoneyHtml(f.measuredDiff)}</div></div>
      <div class="stat-card"><div class="label">الأعمال الإضافية (لصالحه)</div><div class="value">${signedMoneyHtml(f.extras)}</div></div>
      <div class="stat-card"><div class="label">الخصومات والتعديلات</div><div class="value">${signedMoneyHtml(f.adjustments)}</div></div>
      <div class="stat-card"><div class="label">المستحق النهائي للمقاول</div><div class="value">${fmtMoney(f.entitlement)}</div></div>
      <div class="stat-card"><div class="label">إجمالي المدفوع</div><div class="value success">${fmtMoney(f.paid)}</div></div>
      <div class="stat-card"><div class="label">المبلغ المتبقي له</div><div class="value ${f.remaining > 0 ? "warning" : f.remaining < 0 ? "danger" : "success"}">${fmtMoney(f.remaining)}</div>
        ${f.remaining < 0 ? `<div class="text-muted" style="font-size:11.5px;margin-top:4px">المدفوع أكبر من المستحق</div>` : ""}</div>
    </div>

    <div class="card" style="margin-top:20px">
      <div class="flex between" style="align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:14px">
        <h3 class="mt-0" style="margin:0">${svgIcon("file-text", 22)} الاتفاق وبنود جدول الكميات</h3>
        ${canEdit ? `<div class="flex gap wrap">
          <button class="btn sm" id="addBoqItemsBtn">${svgIcon("plus")} بنود من جدول الكميات</button>
          <button class="btn sm" id="addManualItemBtn">${svgIcon("plus")} بند يدوي</button>
          <button class="btn sm danger" id="delAgreementBtn">${svgIcon("close")} حذف الاتفاق</button>
        </div>` : ""}
      </div>

      <div class="field" style="max-width:520px">
        <label>نوع الاتفاق</label>
        <div class="pill-group">
          ${Object.keys(AGREEMENT_TYPE_LABELS).map(k => `<div class="pill ${ag.type === k ? "active" : ""}" ${canEdit ? `data-agtype="${k}"` : ""}>${AGREEMENT_TYPE_LABELS[k]}</div>`).join("")}
        </div>
        <div class="hint">${isUnit ? "بالمتر: يُحسب المستحق من (الكمية × سعر الوحدة المتفق عليه) لكل بند، وتُعدَّل الكمية النهائية بعد التمتير." : "مقطوعية: مبلغ إجمالي ثابت للبنود المسندة للمقاول، وتُضاف أو تُخصم التعديلات من الأسفل."}</div>
      </div>

      ${isUnit ? "" : `
      <div class="field" style="max-width:320px">
        <label>مبلغ المقطوعية المتفق عليه (ر.س)</label>
        <input type="number" min="0" step="0.01" id="ca_lump" value="${Number(ag.lumpSumAmount) || 0}" ${canEdit ? "" : "disabled"}>
      </div>`}

      ${items.length ? `
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr>
            <th>#</th><th>البند</th><th>الوحدة</th>
            <th>${isUnit ? "الكمية المتفق عليها" : "الكمية (جدول الكميات)"}</th>
            ${isUnit ? `<th>سعر الوحدة المتفق عليه</th><th>الكمية النهائية (التمتير)</th><th>الإجمالي</th>` : ""}
            <th></th>
          </tr></thead>
          <tbody>
            ${items.map((it, i) => `
              <tr>
                <td>${i + 1}</td>
                <td>${it.name}${it.boqKey ? "" : ` <span class="badge gray">يدوي</span>`}</td>
                <td>${it.unit || "-"}</td>
                <td><input type="number" min="0" step="0.01" value="${Number(it.qty) || 0}" data-itemqty="${it.id}" style="width:100px" ${canEdit ? "" : "disabled"}></td>
                ${isUnit ? `
                <td><input type="number" min="0" step="0.01" value="${Number(it.unitPrice) || 0}" data-itemprice="${it.id}" style="width:110px" ${canEdit ? "" : "disabled"}></td>
                <td><input type="number" min="0" step="0.01" value="${it.finalQty !== undefined && it.finalQty !== null && it.finalQty !== "" ? it.finalQty : ""}" placeholder="${Number(it.qty) || 0}" data-itemfinal="${it.id}" style="width:110px" ${canEdit ? "" : "disabled"}></td>
                <td><strong>${fmtMoney(contractorItemFinalQty(it) * (Number(it.unitPrice) || 0))}</strong></td>` : ""}
                <td>${canEdit ? `<button class="btn-icon danger" data-rmitem="${it.id}" title="حذف البند">${ICON_DELETE}</button>` : ""}</td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>` : `<div class="text-muted" style="font-size:13px">لم تُسند بنود لهذا المقاول بعد — اختر بنوداً من جدول الكميات المعتمد للمشروع أو أضف بنداً يدوياً.</div>`}
    </div>

    <div class="card">
      <div class="flex between" style="align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:14px">
        <h3 class="mt-0" style="margin:0">${svgIcon("plus", 22)} الأعمال الإضافية للمقاول (تُحتسب لصالحه)</h3>
        ${canEdit ? `<button class="btn sm" id="addExtraBtn">${svgIcon("plus")} إضافة عمل إضافي</button>` : ""}
      </div>
      ${extras.length ? `
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>التاريخ</th><th>النوع</th><th>البيان</th><th>الكمية</th><th>سعر الوحدة</th><th>المبلغ</th><th></th></tr></thead>
          <tbody>
            ${extras.map(x => `
              <tr>
                <td>${fmtDate(x.date)}</td>
                <td><span class="badge blue">${(CONTRACTOR_EXTRA_KINDS.find(k => k.key === x.kind) || {}).label || ""}</span></td>
                <td>${x.title || "-"}${x.vendor ? `<div class="text-muted" style="font-size:11.5px">التاجر: ${x.vendor}${x.invoiceRef ? " — فاتورة " + x.invoiceRef : ""}</div>` : ""}${x.note ? `<div class="text-muted" style="font-size:11.5px">${x.note}</div>` : ""}${x.entryId ? ` <span class="badge green">مربوطة بفاتورة المشروع</span>` : ""}${(x.attachment || (x.entryId && invoicesById[x.entryId] && invoicesById[x.entryId].attachment)) ? ` <a href="${(x.attachment || invoicesById[x.entryId].attachment).url}" target="_blank" rel="noopener" class="badge blue" style="text-decoration:none">${svgIcon("paperclip", 14)} المرفق</a>` : ""}</td>
                <td>${(x.kind === "qty" || x.kind === "item") ? `${Number(x.qty) || 0} ${x.unit || ""}` : `<span class="text-muted">-</span>`}</td>
                <td>${(x.kind === "qty" || x.kind === "item") ? fmtMoney(x.unitPrice) : `<span class="text-muted">-</span>`}</td>
                <td><strong style="color:var(--success)">+ ${fmtMoney(contractorExtraAmount(x))}</strong></td>
                <td style="white-space:nowrap">${canEdit ? `<button class="btn-icon" data-editextra="${x.id}" title="تعديل">${ICON_EDIT}</button><button class="btn-icon danger" data-rmextra="${x.id}" title="حذف">${ICON_DELETE}</button>` : ""}</td>
              </tr>`).join("")}
            <tr><td><strong>الإجمالي</strong></td><td colspan="4"></td><td colspan="2"><strong>${fmtMoney(f.extras)}</strong></td></tr>
          </tbody>
        </table>
      </div>` : `<div class="text-muted" style="font-size:13px">لا توجد أعمال إضافية — أضف أمتاراً أو بنوداً إضافية أو فواتير مشتريات أو مدفوعات سدّدها المقاول ليُحتسب مبلغها لصالحه.</div>`}
    </div>

    <div class="card">
      <div class="flex between" style="align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:14px">
        <h3 class="mt-0" style="margin:0">${svgIcon("alert", 22)} خصم التأخير والتعديلات (التمتير النهائي)</h3>
        ${canEdit ? `<button class="btn sm" id="addAdjBtn">${svgIcon("plus")} إضافة خصم / تعديل</button>` : ""}
      </div>
      ${adjustments.length ? `
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>التاريخ</th><th>النوع</th><th>ملاحظة</th><th>المبلغ</th><th></th></tr></thead>
          <tbody>
            ${adjustments.map(a => `
              <tr>
                <td>${fmtDate(a.date)}</td>
                <td><span class="badge ${a.amount < 0 ? "red" : "green"}">${a.label}</span></td>
                <td>${a.note || `<span class="text-muted">-</span>`}</td>
                <td>${signedMoneyHtml(a.amount)}</td>
                <td>${canEdit ? `<button class="btn-icon danger" data-rmadj="${a.id}" title="حذف">${ICON_DELETE}</button>` : ""}</td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>` : `<div class="text-muted" style="font-size:13px">لا توجد خصومات أو تعديلات مسجّلة.</div>`}
    </div>

    <div class="card">
      <div class="flex between" style="align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:14px">
        <h3 class="mt-0" style="margin:0">${svgIcon("dollar", 22)} الدفعات المسلّمة للمقاول (${payments.length})</h3>
        ${canPay ? `<div class="flex gap wrap">
          <button class="btn sm primary" id="addPaymentBtn">${svgIcon("plus")} تسجيل دفعة أعمال</button>
          <button class="btn sm" id="addPurchasePaymentBtn">${svgIcon("plus")} دفعة من مشتريات مسددة</button>
        </div>` : ""}
      </div>
      ${payments.length ? `
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>التاريخ</th><th>النوع</th><th>المبلغ</th><th>طريقة الدفع / الفاتورة</th><th>ملاحظات</th><th></th></tr></thead>
          <tbody>
            ${payments.map(p => `
              <tr>
                <td>${fmtDate(p.date)}</td>
                <td>${p.kind === "purchase" ? `<span class="badge orange">مشتريات</span>` : `<span class="badge green">دفعة مالية</span>`}</td>
                <td><strong>${fmtMoney(p.amount)}</strong></td>
                <td>${p.kind === "purchase"
                  ? `${p.label || "فاتورة مشتريات"}${p.entry && p.entry.attachment ? ` <a href="${p.entry.attachment.url}" target="_blank" rel="noopener" class="badge blue" style="text-decoration:none">${svgIcon("paperclip", 14)} الفاتورة</a>` : ""}`
                  : (p.method || `<span class="text-muted">-</span>`)}</td>
                <td>${p.note || `<span class="text-muted">-</span>`}</td>
                <td>${p.kind === "purchase" && canEdit ? `<button class="btn-icon danger" data-rmpurchasepay="${p.id}" title="إلغاء هذه الدفعة (الفاتورة تبقى في المصاريف)">${ICON_DELETE}</button>` : ""}</td>
              </tr>`).join("")}
            <tr><td><strong>الإجمالي</strong></td><td></td><td colspan="4"><strong>${fmtMoney(f.paid)}</strong></td></tr>
          </tbody>
        </table>
      </div>
      <div class="text-muted" style="font-size:12px;margin-top:8px">الدفعات المالية تُعدَّل أو تُحذف من المحاسبة العامة ← المصاريف الإدارية (تصنيف "دفعة أعمال")، ودفعات المشتريات تُلغى من هنا وتبقى فواتيرها في محاسبة المشروع.</div>` : `<div class="text-muted" style="font-size:13px">لا توجد دفعات مسجلة لهذا المقاول على هذا المشروع.</div>`}
    </div>
  `;
}

function bindAccountEvents(el, c, project, f, canEdit, canPay) {
  const ag = f.ag;
  const rerender = () => renderContractorAccount(el);
  const projLabel = project.name;

  const payBtn = document.getElementById("addPaymentBtn");
  if (payBtn) payBtn.onclick = () => openGeneralExpenseModal(el, null, { category: CONTRACTOR_PAYMENT_CATEGORY, contractorId: c.id, projectId: project.id, onSaved: rerender });
  const purchaseBtn = document.getElementById("addPurchasePaymentBtn");
  if (purchaseBtn) purchaseBtn.onclick = () => openPurchasePaymentModal(c, project, rerender);

  el.querySelectorAll("[data-rmpurchasepay]").forEach(b => b.onclick = () => {
    if (!canEdit) return;
    const pay = dbGet("contractorPurchasePayments", []).find(x => x.id === b.dataset.rmpurchasepay);
    if (!pay || !confirm("إلغاء دفعة المشتريات هذه؟ (تبقى الفاتورة مسجلة في محاسبة المشروع)")) return;
    dbSet("contractorPurchasePayments", dbGet("contractorPurchasePayments", []).filter(x => x.id !== pay.id));
    logActivity(`تم إلغاء دفعة مشتريات (${fmtMoney(pay.amount)}) للمقاول "${c.name}" على مشروع "${projLabel}"`);
    rerender();
  });

  if (!canEdit) return;

  el.querySelectorAll("[data-agtype]").forEach(p => p.onclick = () => {
    if (p.dataset.agtype === ag.type) return;
    if (!confirm("تغيير نوع الاتفاق يغيّر طريقة احتساب المستحق. هل تريد المتابعة؟")) return;
    mutateContractorAgreement(ag.id, a => { a.type = p.dataset.agtype; if (a.type === "lumpsum" && a.lumpSumAmount === undefined) a.lumpSumAmount = 0; });
    logActivity(`تم تغيير نوع اتفاق المقاول "${c.name}" في مشروع "${projLabel}" إلى ${AGREEMENT_TYPE_LABELS[p.dataset.agtype]}`);
    rerender();
  });

  const lump = document.getElementById("ca_lump");
  if (lump) lump.onchange = () => {
    mutateContractorAgreement(ag.id, a => { a.lumpSumAmount = Number(lump.value) || 0; });
    logActivity(`تم تعديل مبلغ مقطوعية المقاول "${c.name}" في مشروع "${projLabel}" إلى ${fmtMoney(Number(lump.value) || 0)}`);
    toast("تم حفظ مبلغ المقطوعية");
    rerender();
  };

  const bindItemField = (attr, field, logLabel) => el.querySelectorAll(`[${attr}]`).forEach(inp => inp.onchange = () => {
    const id = inp.dataset[attr.replace("data-", "")];
    const raw = inp.value;
    mutateContractorAgreement(ag.id, a => {
      const it = (a.items || []).find(x => x.id === id);
      if (!it) return;
      it[field] = (field === "finalQty" && raw === "") ? "" : (Number(raw) || 0);
    });
    if (logLabel) logActivity(`تم تعديل ${logLabel} لأحد بنود المقاول "${c.name}" في مشروع "${projLabel}"`);
    toast("تم الحفظ");
    rerender();
  });
  bindItemField("data-itemqty", "qty", "الكمية المتفق عليها");
  bindItemField("data-itemprice", "unitPrice", "السعر المتفق عليه");
  bindItemField("data-itemfinal", "finalQty", "الكمية النهائية (التمتير)");

  el.querySelectorAll("[data-rmitem]").forEach(b => b.onclick = () => {
    if (!confirm("حذف هذا البند من اتفاق المقاول؟")) return;
    mutateContractorAgreement(ag.id, a => { a.items = (a.items || []).filter(x => x.id !== b.dataset.rmitem); });
    rerender();
  });

  el.querySelectorAll("[data-rmadj]").forEach(b => b.onclick = () => {
    if (!confirm("حذف هذا التعديل؟")) return;
    mutateContractorAgreement(ag.id, a => { a.adjustments = (a.adjustments || []).filter(x => x.id !== b.dataset.rmadj); });
    rerender();
  });

  document.getElementById("addBoqItemsBtn").onclick = () => openBoqPickerModal(c, project, ag, rerender);
  document.getElementById("addManualItemBtn").onclick = () => openManualItemModal(ag, rerender);
  document.getElementById("addAdjBtn").onclick = () => openAdjustmentModal(c, project, ag, rerender);
  document.getElementById("addExtraBtn").onclick = () => openExtraWorkModal(c, project, ag, null, rerender);
  el.querySelectorAll("[data-editextra]").forEach(b => b.onclick = () => openExtraWorkModal(c, project, ag, (ag.extras || []).find(x => x.id === b.dataset.editextra), rerender));
  el.querySelectorAll("[data-rmextra]").forEach(b => b.onclick = () => {
    if (!confirm("حذف هذا العمل الإضافي من حساب المقاول؟")) return;
    mutateContractorAgreement(ag.id, a => { a.extras = (a.extras || []).filter(x => x.id !== b.dataset.rmextra); });
    logActivity(`تم حذف عمل إضافي من حساب المقاول "${c.name}" في مشروع "${projLabel}"`);
    rerender();
  });

  document.getElementById("delAgreementBtn").onclick = () => {
    if (contractorHasPayments(c.id, project.id)) { toast("لا يمكن حذف اتفاق عليه دفعات مسجلة"); return; }
    if (!confirm(`حذف اتفاق المقاول "${c.name}" على مشروع "${projLabel}"؟`)) return;
    dbSet("contractorAgreements", dbGet("contractorAgreements", []).filter(a => a.id !== ag.id));
    logActivity(`تم حذف اتفاق المقاول "${c.name}" على مشروع "${projLabel}"`);
    rerender();
  };
}

/* ---------- إنشاء اتفاق ---------- */
function openCreateAgreementModal(c, project, onSaved) {
  const html = `
    <div class="modal-head"><h3>اتفاق جديد — ${c.name}</h3><button class="modal-close" id="mClose">×</button></div>
    <p class="text-muted" style="margin-top:0">المشروع: <strong>${project.name}</strong></p>
    <div class="field"><label>نوع الاتفاق</label>
      <select id="ag_type"><option value="unit">بالمتر (سعر لكل وحدة حسب جدول الكميات)</option><option value="lumpsum">مقطوعية (مبلغ إجمالي ثابت)</option></select>
    </div>
    <div class="field" id="ag_lumpBox" style="display:none"><label>مبلغ المقطوعية (ر.س)</label><input type="number" min="0" step="0.01" id="ag_lump" value="0"></div>
    <div class="flex gap"><button class="btn primary" id="ag_save">إنشاء الاتفاق</button><button class="btn" id="ag_cancel">إلغاء</button></div>
  `;
  const ov = openModalShell(html);
  ov.querySelector("#mClose").onclick = closeModal;
  ov.querySelector("#ag_cancel").onclick = closeModal;
  ov.querySelector("#ag_type").onchange = (e) => { ov.querySelector("#ag_lumpBox").style.display = e.target.value === "lumpsum" ? "block" : "none"; };
  ov.querySelector("#ag_save").onclick = () => {
    const type = ov.querySelector("#ag_type").value;
    const list = dbGet("contractorAgreements", []);
    list.push({
      id: uid("ag"), contractorId: c.id, projectId: project.id, projectName: project.name, type,
      lumpSumAmount: type === "lumpsum" ? (Number(ov.querySelector("#ag_lump").value) || 0) : 0,
      items: [], adjustments: [], createdAt: new Date().toISOString(),
    });
    dbSet("contractorAgreements", list);
    logActivity(`تم إنشاء اتفاق (${AGREEMENT_TYPE_LABELS[type]}) للمقاول "${c.name}" على مشروع "${project.name}"`);
    toast("تم إنشاء الاتفاق — أضف البنود المسندة للمقاول");
    closeModal();
    onSaved();
  };
}

/* ---------- اختيار بنود من جدول الكميات المعتمد للمشروع (وربطها بالمقاول) ---------- */
function openBoqPickerModal(c, project, ag, onSaved) {
  const quote = project.approvedQuoteId ? dbGet("quotes", []).find(q => q.id === project.approvedQuoteId) : null;
  if (!quote) { toast("لا يوجد جدول كميات معتمد لهذا المشروع — اربط عرض سعر معتمد من صفحة المشروع، أو أضف بنداً يدوياً"); return; }

  const assigned = {};
  dbGet("contractorAgreements", []).filter(a => a.projectId === project.id && a.id !== ag.id).forEach(a => {
    const owner = (getContractors().find(x => x.id === a.contractorId) || {}).name || "مقاول آخر";
    (a.items || []).forEach(it => { if (it.boqKey) assigned[it.boqKey] = owner; });
  });
  const mine = new Set((ag.items || []).map(i => i.boqKey).filter(Boolean));

  const html = `
    <div class="modal-head"><h3>بنود جدول الكميات — ${project.name}</h3><button class="modal-close" id="mClose">×</button></div>
    <p class="text-muted" style="margin-top:0;font-size:12.5px">جدول الكميات المعتمد: عرض السعر ${quote.number}. اختر البنود التي سينفذها المقاول "${c.name}" — البنود المسندة لمقاول آخر لا يمكن اختيارها.</p>
    ${quote.categories.map((qc, ci) => `
      <div class="cat-block">
        <div class="cat-head"><strong>${ci + 1}. ${qc.catName}</strong></div>
        ${qc.items.map((it, ii) => {
          const key = qc.catId + "|" + it.name;
          const owner = assigned[key];
          const isMine = mine.has(key);
          return `<label class="chk" style="display:flex;align-items:center;gap:10px;padding:7px 4px;border-bottom:1px solid #eef2f8;${owner || isMine ? "opacity:.55" : ""}">
            <input type="checkbox" data-boqpick="${ci}:${ii}" ${owner || isMine ? "disabled" : ""}>
            <span style="flex:1">${it.name}</span>
            <span class="text-muted" style="font-size:12px">${it.qty} ${it.unit || ""}</span>
            ${owner ? `<span class="badge orange">مسند إلى ${owner}</span>` : isMine ? `<span class="badge green">مضاف</span>` : ""}
          </label>`;
        }).join("") || `<div class="text-muted" style="font-size:12px">لا توجد بنود</div>`}
      </div>`).join("")}
    <div class="flex gap" style="margin-top:14px"><button class="btn primary" id="boq_save">إضافة البنود المحددة</button><button class="btn" id="boq_cancel">إلغاء</button></div>
  `;
  const ov = openModalShell(html, true);
  ov.querySelector("#mClose").onclick = closeModal;
  ov.querySelector("#boq_cancel").onclick = closeModal;
  ov.querySelector("#boq_save").onclick = () => {
    const picked = [...ov.querySelectorAll("[data-boqpick]:checked")].map(chk => {
      const [ci, ii] = chk.dataset.boqpick.split(":").map(Number);
      const qc = quote.categories[ci]; const it = qc.items[ii];
      return { id: uid("ai"), boqKey: qc.catId + "|" + it.name, name: it.name, unit: it.unit, qty: Number(it.qty) || 0, unitPrice: 0, finalQty: "" };
    });
    if (!picked.length) { toast("لم يتم اختيار أي بند"); return; }
    mutateContractorAgreement(ag.id, a => { a.items = (a.items || []).concat(picked); });
    logActivity(`تم إسناد ${picked.length} بند من جدول الكميات إلى المقاول "${c.name}" في مشروع "${project.name}"`);
    toast("تمت إضافة البنود — أدخل سعر الوحدة المتفق عليه");
    closeModal();
    onSaved();
  };
}

function openManualItemModal(ag, onSaved) {
  const html = `
    <div class="modal-head"><h3>بند يدوي</h3><button class="modal-close" id="mClose">×</button></div>
    <div class="field"><label>اسم البند</label><input id="mi_name"></div>
    <div class="grid cols-3">
      <div class="field"><label>الوحدة</label><input id="mi_unit" value="م²"></div>
      <div class="field"><label>الكمية</label><input type="number" min="0" step="0.01" id="mi_qty" value="1"></div>
      <div class="field"><label>سعر الوحدة (ر.س)</label><input type="number" min="0" step="0.01" id="mi_price" value="0"></div>
    </div>
    <div class="flex gap"><button class="btn primary" id="mi_save">إضافة</button><button class="btn" id="mi_cancel">إلغاء</button></div>
  `;
  const ov = openModalShell(html);
  ov.querySelector("#mClose").onclick = closeModal;
  ov.querySelector("#mi_cancel").onclick = closeModal;
  ov.querySelector("#mi_save").onclick = () => {
    const name = ov.querySelector("#mi_name").value.trim();
    if (!name) { toast("يرجى إدخال اسم البند"); return; }
    const item = { id: uid("ai"), boqKey: "", name, unit: ov.querySelector("#mi_unit").value.trim() || "م²", qty: Number(ov.querySelector("#mi_qty").value) || 0, unitPrice: Number(ov.querySelector("#mi_price").value) || 0, finalQty: "" };
    mutateContractorAgreement(ag.id, a => { a.items = (a.items || []).concat([item]); });
    closeModal();
    onSaved();
  };
}

/* ---------- خصم تأخير / تعديل كميات / إضافة ---------- */
function openAdjustmentModal(c, project, ag, onSaved) {
  const html = `
    <div class="modal-head"><h3>خصم / تعديل على مستحق المقاول</h3><button class="modal-close" id="mClose">×</button></div>
    <div class="grid cols-2">
      <div class="field"><label>النوع</label>
        <select id="adj_kind">${CONTRACTOR_ADJ_KINDS.map(k => `<option value="${k.key}">${k.label}</option>`).join("")}</select>
      </div>
      <div class="field" id="adj_dirBox" style="display:none"><label>الأثر على المستحق</label>
        <select id="adj_dir"><option value="1">زيادة (تُضاف للمقاول)</option><option value="-1">نقصان (تُخصم من المقاول)</option></select>
      </div>
      <div class="field"><label>المبلغ (ر.س)</label><input type="number" min="0" step="0.01" id="adj_amount" value="0"></div>
      <div class="field"><label>التاريخ</label><input type="date" id="adj_date" value="${todayISO()}"></div>
    </div>
    <div class="field"><label>ملاحظة (اختياري)</label><textarea id="adj_note" placeholder="مثال: تأخير 10 أيام عن الموعد المتفق عليه"></textarea></div>
    <div class="flex gap"><button class="btn primary" id="adj_save">إضافة</button><button class="btn" id="adj_cancel">إلغاء</button></div>
  `;
  const ov = openModalShell(html);
  ov.querySelector("#mClose").onclick = closeModal;
  ov.querySelector("#adj_cancel").onclick = closeModal;
  const kindSel = ov.querySelector("#adj_kind");
  const syncDir = () => { ov.querySelector("#adj_dirBox").style.display = kindSel.value === "qty" ? "block" : "none"; };
  kindSel.onchange = syncDir;
  syncDir();
  ov.querySelector("#adj_save").onclick = () => {
    const kind = CONTRACTOR_ADJ_KINDS.find(k => k.key === kindSel.value);
    const amount = Number(ov.querySelector("#adj_amount").value) || 0;
    if (amount <= 0) { toast("يرجى إدخال مبلغ صحيح"); return; }
    const sign = kind.sign !== 0 ? kind.sign : Number(ov.querySelector("#adj_dir").value);
    const adj = { id: uid("adj"), kind: kind.key, label: kind.label, amount: sign * amount, date: ov.querySelector("#adj_date").value || todayISO(), note: ov.querySelector("#adj_note").value.trim() };
    mutateContractorAgreement(ag.id, a => { a.adjustments = (a.adjustments || []).concat([adj]); });
    logActivity(`تم تسجيل "${kind.label}" بمبلغ ${fmtMoney(amount)} على المقاول "${c.name}" في مشروع "${project.name}"`);
    toast("تم تسجيل التعديل");
    closeModal();
    onSaved();
  };
}

/* =========================================================
   عقود الباطن (مستقلة تماماً عن صفحة العقود الخاصة بالمشاريع/العملاء)
   subcontracts: [{id, number, contractorId, contractorName, projectId, projectName, date, title, amount, agreementType,
                   paymentMethod, paymentNotes, schedule:[{id, title, percent, when, dueDate}],
                   startDate, durationDays, delayPenaltyPerDay, warrantyMonths, notes, text}]
   ========================================================= */
let SUBCONTRACT_DRAFT = null;
let SUBCONTRACT_VIEW_ID = null;
const SUBCONTRACT_PAYMENT_METHODS = ["تحويل بنكي", "شيك", "كاش", "شبكة"];

function getSubcontracts() { return dbGet("subcontracts", []); }
function subcontractsOf(contractorId) { return getSubcontracts().filter(s => s.contractorId === contractorId); }

function newSubcontractDraft(c, projectId) {
  const project = dbGet("projects", []).find(p => p.id === projectId) || null;
  const ag = project ? findContractorAgreement(c.id, project.id) : null;
  const t = ag ? contractorAgreementTotals(ag) : null;
  const row = (title, percent, when) => ({ id: uid("sr"), title, percent, when, dueDate: "" });
  return {
    id: null, contractorId: c.id, contractorName: c.name,
    projectId: project ? project.id : "", projectName: project ? project.name : "",
    date: todayISO(), title: "",
    amount: t ? Math.round(t.agreed * 100) / 100 : 0, agreementType: ag ? ag.type : "lumpsum",
    paymentMethod: SUBCONTRACT_PAYMENT_METHODS[0], paymentNotes: "",
    schedule: [row("دفعة مقدمة", 30, "عند توقيع العقد"), row("دفعة ثانية", 40, "عند إنجاز 50% من الأعمال"), row("الدفعة الأخيرة", 30, "عند التسليم النهائي والتمتير")],
    startDate: "", durationDays: "", delayPenaltyPerDay: "", warrantyMonths: 12, notes: "", text: "",
  };
}

function subcontractTemplateText(d) {
  const company = (getCompanyProfile().name) || "المؤسسة";
  const c = getContractors().find(x => x.id === d.contractorId) || {};
  const ag = d.projectId ? findContractorAgreement(d.contractorId, d.projectId) : null;
  const amount = Number(d.amount) || 0;
  const isUnit = d.agreementType === "unit";
  const scheduleLines = (d.schedule || []).map((r, i) =>
    `${i + 1}. ${r.title || "دفعة"}: ${Number(r.percent) || 0}% (${fmtMoneyEN(amount * (Number(r.percent) || 0) / 100)})${r.when ? " — " + r.when : ""}${r.dueDate ? " — بتاريخ " + fmtDate(r.dueDate) : ""}`).join("\n");
  const itemsLines = ag && (ag.items || []).length
    ? "\nالبنود المسندة إلى مقاول الباطن حسب جدول الكميات:\n" + ag.items.map((it, i) => `${i + 1}. ${it.name} — ${Number(it.qty) || 0} ${it.unit || ""}`).join("\n") + "\n"
    : "";
  return `عقد مقاولة من الباطن

أبرم هذا العقد بتاريخ ${fmtDate(d.date)} بين كل من:
الطرف الأول: ${company} (ويشار إليها فيما يلي بـ "المقاول الرئيسي")
الطرف الثاني: ${d.contractorName || c.name || "..............."}${c.trade ? " — " + c.trade : ""}${c.phone ? " ، جوال: " + c.phone : ""} (ويشار إليه فيما يلي بـ "مقاول الباطن")

المادة الأولى - موضوع العقد
يلتزم مقاول الباطن بتنفيذ الأعمال التالية في مشروع "${d.projectName || "..............."}": ${d.title || "الأعمال المسندة إليه وفق جدول الكميات المعتمد"}.
${itemsLines}
المادة الثانية - قيمة العقد وأسلوب الاحتساب
اتفق الطرفان على أن يكون احتساب مستحقات مقاول الباطن ${isUnit ? "بالمتر (حسب الكميات المنفذة فعلياً بعد التمتير النهائي)" : "مقطوعية"}، وبقيمة ${fmtMoneyEN(amount)} ريال سعودي${isUnit ? " حسب الكميات المتفق عليها، وتُعدَّل القيمة النهائية وفق الكميات المنفذة فعلياً بعد التمتير النهائي" : "، وتُعدَّل القيمة عند أي تغيير في نطاق الأعمال باتفاق كتابي بين الطرفين"}، ويُضاف أو يُخصم أي تعديل أو غرامة تأخير متفق عليها من المستحق النهائي.

المادة الثالثة - طريقة الدفع ومواعيده
تُسدَّد مستحقات مقاول الباطن عن طريق: ${d.paymentMethod || "..............."}، وفق الجدول التالي:
${scheduleLines || "..............."}
${d.paymentNotes ? d.paymentNotes + "\n" : ""}
المادة الرابعة - مدة التنفيذ
${d.startDate ? `تبدأ الأعمال بتاريخ ${fmtDate(d.startDate)}` : "تبدأ الأعمال من تاريخ استلام الموقع"}${d.durationDays ? ` ولمدة ${d.durationDays} يوماً` : ""}، ويلتزم مقاول الباطن بإنجازها خلال المدة المتفق عليها.

المادة الخامسة - غرامة التأخير
${Number(d.delayPenaltyPerDay) > 0 ? `في حال التأخر عن مدة التنفيذ يُخصم من مستحقات مقاول الباطن مبلغ ${fmtMoneyEN(Number(d.delayPenaltyPerDay))} ريال عن كل يوم تأخير.` : "تُخصم غرامة التأخير — إن وُجدت — وفق ما يتفق عليه الطرفان كتابةً."}

المادة السادسة - التزامات مقاول الباطن
1. تنفيذ الأعمال وفق الأصول الفنية والمواصفات والمخططات المعتمدة.
2. توفير العمالة والأدوات اللازمة ما لم يُتفق على خلاف ذلك.
3. الالتزام بتعليمات المهندس المشرف وقواعد السلامة في الموقع.

المادة السابعة - الضمان
يلتزم مقاول الباطن بضمان جودة الأعمال المنفذة لمدة ${Number(d.warrantyMonths) || 12} شهراً من تاريخ التسليم النهائي ضد عيوب التنفيذ.

المادة الثامنة - فض النزاعات
في حال نشوء أي خلاف يتعذر حله ودياً، يُحال النزاع إلى الجهات القضائية المختصة في المملكة العربية السعودية.
${d.notes ? "\nشروط إضافية:\n" + d.notes + "\n" : ""}
توقيع الطرف الأول (المقاول الرئيسي)                توقيع الطرف الثاني (مقاول الباطن)
.......................................                .......................................`;
}

/* توزيع إجمالي المدفوع على دفعات الجدول بالترتيب لمعرفة حالة كل دفعة */
function subcontractScheduleRows(s) {
  const amount = Number(s.amount) || 0;
  let paidLeft = s.contractorId && s.projectId ? contractorPaidTotal(s.contractorId, s.projectId) : 0;
  return (s.schedule || []).map(r => {
    const due = amount * (Number(r.percent) || 0) / 100;
    const paid = Math.min(due, Math.max(paidLeft, 0));
    paidLeft -= paid;
    const status = due <= 0 ? "-" : paid >= due - 0.005 ? "مسددة" : paid > 0 ? "مسددة جزئياً" : "غير مسددة";
    return Object.assign({}, r, { due, paid, status });
  });
}

function subcontractsCardHtml(c, canEdit, canDelete) {
  const list = subcontractsOf(c.id).slice().sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  return `
    <div class="card">
      <div class="flex between" style="align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:14px">
        <h3 class="mt-0" style="margin:0">${svgIcon("file", 22)} عقود الباطن (${list.length})</h3>
        ${canEdit ? `<button class="btn sm primary" id="newSubcontractBtn">${svgIcon("plus")} عقد باطن جديد</button>` : ""}
      </div>
      ${list.length ? `
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>رقم العقد</th><th>المشروع</th><th>التاريخ</th><th>قيمة العقد</th><th>طريقة الدفع</th><th>الدفعات</th><th></th></tr></thead>
          <tbody>
            ${list.map(s => `
              <tr>
                <td><strong>${s.number}</strong></td>
                <td>${s.projectName || `<span class="text-muted">-</span>`}</td>
                <td>${fmtDate(s.date)}</td>
                <td>${fmtMoney(s.amount)} <span class="badge gray">${AGREEMENT_TYPE_LABELS[s.agreementType] || ""}</span></td>
                <td>${s.paymentMethod || `<span class="text-muted">-</span>`}</td>
                <td>${(s.schedule || []).length} دفعات</td>
                <td style="white-space:nowrap">
                  <button class="btn-icon" data-viewsub="${s.id}" title="عرض / طباعة">${ICON_VIEW}</button>
                  ${canEdit ? `<button class="btn-icon" data-editsub="${s.id}" title="تعديل">${ICON_EDIT}</button>` : ""}
                  ${canDelete ? `<button class="btn-icon danger" data-delsub="${s.id}" title="حذف">${ICON_DELETE}</button>` : ""}
                </td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>` : `<div class="text-muted" style="font-size:13px">لا توجد عقود باطن مسجّلة لهذا المقاول${canEdit ? " — أنشئ عقداً وحدّد المشروع وطريقة الدفع ومواعيدها" : ""}.</div>`}
    </div>`;
}

function bindSubcontractsCard(el, c, projectId) {
  const goto = (view) => { CONTRACTORS_VIEW = view; renderContractors(el); window.scrollTo(0, 0); };
  const newBtn = document.getElementById("newSubcontractBtn");
  if (newBtn) newBtn.onclick = () => { SUBCONTRACT_DRAFT = newSubcontractDraft(c, projectId); SUBCONTRACT_DRAFT.text = subcontractTemplateText(SUBCONTRACT_DRAFT); goto("subBuilder"); };
  el.querySelectorAll("[data-viewsub]").forEach(b => b.onclick = () => { SUBCONTRACT_VIEW_ID = b.dataset.viewsub; goto("subView"); });
  el.querySelectorAll("[data-editsub]").forEach(b => b.onclick = () => {
    const s = getSubcontracts().find(x => x.id === b.dataset.editsub);
    if (!s) return;
    SUBCONTRACT_DRAFT = JSON.parse(JSON.stringify(s));
    goto("subBuilder");
  });
  el.querySelectorAll("[data-delsub]").forEach(b => b.onclick = () => {
    const s = getSubcontracts().find(x => x.id === b.dataset.delsub);
    if (!s || !confirm(`حذف عقد الباطن ${s.number}؟`)) return;
    dbSet("subcontracts", getSubcontracts().filter(x => x.id !== s.id));
    logActivity(`تم حذف عقد الباطن "${s.number}" للمقاول "${s.contractorName}"`);
    renderContractorAccount(el);
  });
}

function renderSubcontractBuilder(el) {
  const d = SUBCONTRACT_DRAFT;
  if (!d) { CONTRACTORS_VIEW = "list"; renderContractors(el); return; }
  const c = getContractors().find(x => x.id === d.contractorId);
  if (!c) { CONTRACTORS_VIEW = "list"; renderContractors(el); return; }
  const projects = dbGet("projects", []);
  const isEdit = !!d.id;
  const back = () => { CONTRACTOR_VIEW_ID = c.id; CONTRACTORS_VIEW = (isEdit && d._fromView) ? "subView" : "account"; renderContractors(el); window.scrollTo(0, 0); };

  el.innerHTML = `
    <div class="breadcrumb"><a id="bcCons">مقاولو الباطن</a>${svgIcon("chevron-left")}<a id="bcCon">${c.name}</a>${svgIcon("chevron-left")}<span>${isEdit ? "تعديل عقد باطن " + d.number : "عقد باطن جديد"}</span></div>
    <div class="section-title-row">
      <div><h2>${isEdit ? "تعديل عقد باطن " + d.number : "عقد باطن جديد"}</h2><p>عقد مستقل عن عقود العملاء — اربطه بالمشروع وحدّد طريقة الدفع ومواعيدها</p></div>
      <button class="btn" id="sc_cancel">إلغاء والرجوع</button>
    </div>

    <div class="card">
      <h3>${svgIcon("file-text", 22)} بيانات العقد</h3>
      <div class="grid cols-2">
        <div class="field"><label>مقاول الباطن</label><input value="${c.name}${c.trade ? " — " + c.trade : ""}" disabled></div>
        <div class="field"><label>المشروع المرتبط</label>
          <select id="sc_project"><option value="">— اختر المشروع —</option>${projects.map(p => `<option value="${p.id}" ${d.projectId === p.id ? "selected" : ""}>${p.name}</option>`).join("")}</select>
        </div>
        <div class="field"><label>تاريخ العقد</label><input type="date" id="sc_date" value="${d.date || ""}"></div>
        <div class="field"><label>أسلوب الاحتساب</label>
          <select id="sc_type">${Object.keys(AGREEMENT_TYPE_LABELS).map(k => `<option value="${k}" ${d.agreementType === k ? "selected" : ""}>${AGREEMENT_TYPE_LABELS[k]}</option>`).join("")}</select>
        </div>
        <div class="field"><label>قيمة العقد (ر.س)</label><input type="number" min="0" step="0.01" id="sc_amount" value="${Number(d.amount) || 0}">
          <div class="hint" id="sc_agHint"></div>
        </div>
        <div class="field" style="grid-column:span 2"><label>نطاق الأعمال / وصف موجز</label><textarea id="sc_title" placeholder="مثال: أعمال التأسيسات الكهربائية للدور الأول والثاني">${d.title || ""}</textarea></div>
      </div>
    </div>

    <div class="card">
      <h3>${svgIcon("dollar", 22)} طريقة الدفع ومواعيدها</h3>
      <div class="grid cols-2">
        <div class="field"><label>طريقة الدفع</label>
          <select id="sc_method">${SUBCONTRACT_PAYMENT_METHODS.map(m => `<option ${d.paymentMethod === m ? "selected" : ""}>${m}</option>`).join("")}</select>
        </div>
        <div class="field"><label>ملاحظات على الدفع (اختياري)</label><input id="sc_payNotes" value="${d.paymentNotes || ""}" placeholder="مثال: تُسلَّم الدفعة بعد اعتماد المهندس المشرف"></div>
      </div>
      <div id="sc_scheduleBox"></div>
      <div class="flex between" style="align-items:center;margin-top:8px;flex-wrap:wrap;gap:8px">
        <button class="btn sm" id="sc_addRow">${svgIcon("plus")} إضافة دفعة</button>
        <div id="sc_pctTotal" style="font-size:13px;font-weight:700"></div>
      </div>
    </div>

    <div class="card">
      <h3>${svgIcon("clock", 22)} المدة والشروط</h3>
      <div class="grid cols-2">
        <div class="field"><label>تاريخ بدء الأعمال</label><input type="date" id="sc_start" value="${d.startDate || ""}"></div>
        <div class="field"><label>مدة التنفيذ (بالأيام)</label><input type="number" min="0" id="sc_duration" value="${d.durationDays || ""}"></div>
        <div class="field"><label>غرامة التأخير عن كل يوم (ر.س)</label><input type="number" min="0" step="0.01" id="sc_penalty" value="${d.delayPenaltyPerDay || ""}"></div>
        <div class="field"><label>مدة الضمان (بالأشهر)</label><input type="number" min="0" id="sc_warranty" value="${d.warrantyMonths || ""}"></div>
        <div class="field" style="grid-column:span 2"><label>شروط إضافية (اختياري)</label><textarea id="sc_notes">${d.notes || ""}</textarea></div>
      </div>
    </div>

    <div class="card">
      <div class="flex between" style="align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:12px">
        <h3 class="mt-0" style="margin:0">${svgIcon("file", 22)} نص العقد</h3>
        <button class="btn sm" id="sc_regen">إعادة توليد النص من البيانات أعلاه</button>
      </div>
      <textarea id="sc_text" style="width:100%;min-height:340px;border:1px solid #d6deec;border-radius:10px;padding:14px;font-size:13.5px;line-height:1.9;font-family:inherit">${d.text || ""}</textarea>
      <div class="text-muted" style="font-size:12px;margin-top:6px">النص يُولَّد تلقائياً من بيانات العقد ويمكن تعديله يدوياً؛ زر "إعادة التوليد" يستبدله بنص جديد.</div>
    </div>

    <div class="flex gap"><button class="btn primary" id="sc_save">${svgIcon("save")} ${isEdit ? "حفظ التعديلات" : "حفظ العقد"}</button><button class="btn" id="sc_cancel2">إلغاء</button></div>
  `;

  document.getElementById("bcCons").onclick = () => { CONTRACTORS_VIEW = "list"; renderContractors(el); };
  document.getElementById("bcCon").onclick = back;
  document.getElementById("sc_cancel").onclick = back;
  document.getElementById("sc_cancel2").onclick = back;

  const bind = (id, field) => { const inp = document.getElementById(id); inp.oninput = () => { d[field] = inp.value; }; };
  bind("sc_date", "date"); bind("sc_title", "title"); bind("sc_payNotes", "paymentNotes");
  bind("sc_start", "startDate"); bind("sc_duration", "durationDays"); bind("sc_penalty", "delayPenaltyPerDay"); bind("sc_warranty", "warrantyMonths"); bind("sc_notes", "notes");
  document.getElementById("sc_method").onchange = (e) => { d.paymentMethod = e.target.value; };
  document.getElementById("sc_type").onchange = (e) => { d.agreementType = e.target.value; };
  document.getElementById("sc_text").oninput = (e) => { d.text = e.target.value; };

  function agreementHint() {
    const hint = document.getElementById("sc_agHint");
    const f = d.projectId ? contractorFigures(c.id, d.projectId) : null;
    hint.innerHTML = f ? `قيمة الاتفاق المسجّل على هذا المشروع: <strong>${fmtMoney(f.agreed)}</strong> (${AGREEMENT_TYPE_LABELS[f.ag.type]}) — <a id="sc_useAg" style="color:var(--primary);cursor:pointer;font-weight:700">استخدام هذه القيمة</a>` : (d.projectId ? "لا يوجد اتفاق مسجّل لهذا المقاول على المشروع المختار." : "");
    const use = document.getElementById("sc_useAg");
    if (use) use.onclick = () => { d.amount = Math.round(f.agreed * 100) / 100; d.agreementType = f.ag.type; document.getElementById("sc_amount").value = d.amount; document.getElementById("sc_type").value = d.agreementType; refreshTotals(); };
  }
  document.getElementById("sc_project").onchange = (e) => {
    d.projectId = e.target.value;
    d.projectName = (projects.find(p => p.id === d.projectId) || {}).name || "";
    agreementHint();
  };
  document.getElementById("sc_amount").oninput = (e) => { d.amount = Number(e.target.value) || 0; refreshTotals(); };
  agreementHint();

  function refreshTotals() {
    const amount = Number(d.amount) || 0;
    const sum = (d.schedule || []).reduce((s, r) => s + (Number(r.percent) || 0), 0);
    document.getElementById("sc_pctTotal").innerHTML = `مجموع النسب: <span style="color:${Math.round(sum) === 100 ? "var(--success)" : "var(--danger)"}">${sum}%</span>${Math.round(sum) === 100 ? "" : ` ${svgIcon("alert", 14)} يجب أن يساوي 100%`}`;
    document.querySelectorAll("[data-scamt]").forEach(td => {
      const r = d.schedule.find(x => x.id === td.dataset.scamt);
      td.textContent = fmtMoney(amount * (Number(r ? r.percent : 0) || 0) / 100);
    });
  }
  function drawSchedule() {
    document.getElementById("sc_scheduleBox").innerHTML = `
      <div class="table-wrap"><table class="data-table">
        <thead><tr><th>الدفعة</th><th>النسبة %</th><th>المبلغ</th><th>متى تُدفع (شرط الاستحقاق)</th><th>تاريخ محدد (اختياري)</th><th></th></tr></thead>
        <tbody>
          ${(d.schedule || []).map(r => `
            <tr>
              <td><input value="${r.title || ""}" data-sctitle="${r.id}" style="width:150px"></td>
              <td><input type="number" min="0" max="100" step="0.1" value="${Number(r.percent) || 0}" data-scpct="${r.id}" style="width:90px"></td>
              <td data-scamt="${r.id}"></td>
              <td><input value="${r.when || ""}" data-scwhen="${r.id}" style="width:100%;min-width:200px" placeholder="مثال: عند إنجاز 50% من الأعمال"></td>
              <td><input type="date" value="${r.dueDate || ""}" data-scdue="${r.id}"></td>
              <td><button class="btn-icon danger" data-scrm="${r.id}" title="حذف">${ICON_DELETE}</button></td>
            </tr>`).join("")}
        </tbody>
      </table></div>`;
    const rowOf = (id) => d.schedule.find(r => r.id === id);
    document.querySelectorAll("[data-sctitle]").forEach(i => i.oninput = () => { rowOf(i.dataset.sctitle).title = i.value; });
    document.querySelectorAll("[data-scpct]").forEach(i => i.oninput = () => { rowOf(i.dataset.scpct).percent = Number(i.value) || 0; refreshTotals(); });
    document.querySelectorAll("[data-scwhen]").forEach(i => i.oninput = () => { rowOf(i.dataset.scwhen).when = i.value; });
    document.querySelectorAll("[data-scdue]").forEach(i => i.oninput = () => { rowOf(i.dataset.scdue).dueDate = i.value; });
    document.querySelectorAll("[data-scrm]").forEach(b => b.onclick = () => { d.schedule = d.schedule.filter(r => r.id !== b.dataset.scrm); drawSchedule(); });
    refreshTotals();
  }
  drawSchedule();
  document.getElementById("sc_addRow").onclick = () => { d.schedule.push({ id: uid("sr"), title: "", percent: 0, when: "", dueDate: "" }); drawSchedule(); };

  document.getElementById("sc_regen").onclick = () => {
    if (d.text && !confirm("سيتم استبدال نص العقد الحالي بنص جديد مولَّد من البيانات. المتابعة؟")) return;
    d.text = subcontractTemplateText(d);
    document.getElementById("sc_text").value = d.text;
  };

  document.getElementById("sc_save").onclick = () => {
    if (!d.projectId) { toast("يرجى اختيار المشروع المرتبط بالعقد"); return; }
    if (!(Number(d.amount) > 0)) { toast("يرجى إدخال قيمة العقد"); return; }
    if (!d.schedule.length) { toast("أضف دفعة واحدة على الأقل في جدول الدفعات"); return; }
    if (!d.text || !d.text.trim()) d.text = subcontractTemplateText(d);
    const list = getSubcontracts();
    const saved = JSON.parse(JSON.stringify(d));
    delete saved._fromView;
    if (isEdit) {
      const idx = list.findIndex(x => x.id === d.id);
      list[idx] = saved;
      logActivity(`تم تعديل عقد الباطن "${saved.number}" للمقاول "${c.name}"`);
    } else {
      saved.id = uid("sc");
      saved.number = "SC-" + (1000 + list.length + 1);
      saved.createdAt = new Date().toISOString();
      list.push(saved);
      logActivity(`تم إنشاء عقد باطن "${saved.number}" للمقاول "${c.name}" على مشروع "${saved.projectName}" بقيمة ${fmtMoney(saved.amount)}`);
    }
    dbSet("subcontracts", list);
    toast("تم حفظ عقد الباطن");
    CONTRACTOR_VIEW_ID = c.id;
    CONTRACTOR_ACC_PROJECT = saved.projectId;
    SUBCONTRACT_VIEW_ID = saved.id;
    CONTRACTORS_VIEW = "subView";
    renderContractors(el);
    window.scrollTo(0, 0);
  };
}

function renderSubcontractView(el) {
  const s = getSubcontracts().find(x => x.id === SUBCONTRACT_VIEW_ID);
  if (!s) { CONTRACTORS_VIEW = "list"; renderContractors(el); return; }
  const role = (getCurrentUser() || {}).role;
  const canEdit = hasPermission(role, "contractors_add");
  const rows = subcontractScheduleRows(s);
  const company = getCompanyProfile();

  el.innerHTML = `
    <div class="breadcrumb no-print"><a id="bcCons">مقاولو الباطن</a>${svgIcon("chevron-left")}<a id="bcCon">${s.contractorName}</a>${svgIcon("chevron-left")}<span>عقد باطن ${s.number}</span></div>
    <div class="section-title-row no-print">
      <div><h2>عقد باطن رقم ${s.number}</h2><p>${fmtDate(s.date)} — ${s.contractorName} — ${s.projectName || ""}</p></div>
      <div class="flex gap">
        <button class="btn" id="scv_back">رجوع</button>
        ${canEdit ? `<button class="btn" id="scv_edit">${ICON_EDIT} تعديل العقد</button>` : ""}
        <button class="btn primary" id="scv_print">${svgIcon("printer")} طباعة</button>
      </div>
    </div>

    ${company.logo || company.name ? `<div class="card quote-header-card"><div class="quote-logo-box">${company.logo ? `<img src="${company.logo}">` : "الشعار"}</div><div><h2>${company.name || ""}</h2>${company.address ? `<div class="cline">${company.address}</div>` : ""}${company.phone ? `<div class="cline">${company.phone}</div>` : ""}</div></div>` : ""}

    <div class="grid cols-3">
      <div class="stat-card"><div class="label">قيمة العقد (${AGREEMENT_TYPE_LABELS[s.agreementType] || ""})</div><div class="value">${fmtMoney(s.amount)}</div></div>
      <div class="stat-card"><div class="label">طريقة الدفع</div><div class="value" style="font-size:18px">${s.paymentMethod || "-"}</div></div>
      <div class="stat-card"><div class="label">المشروع المرتبط</div><div class="value" style="font-size:18px">${s.projectName || "-"}</div></div>
    </div>

    <div class="card" style="margin-top:20px">
      <h3>${svgIcon("dollar", 22)} جدول الدفعات ومواعيدها</h3>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>#</th><th>الدفعة</th><th>النسبة</th><th>المبلغ</th><th>متى تُدفع</th><th>التاريخ</th><th class="no-print">حالة السداد</th></tr></thead>
          <tbody>
            ${rows.map((r, i) => `
              <tr>
                <td>${i + 1}</td><td><strong>${r.title || "-"}</strong></td><td>${Number(r.percent) || 0}%</td>
                <td>${fmtMoney(r.due)}</td><td>${r.when || "-"}</td><td>${r.dueDate ? fmtDate(r.dueDate) : "-"}</td>
                <td class="no-print"><span class="badge ${r.status === "مسددة" ? "green" : r.status === "مسددة جزئياً" ? "orange" : "gray"}">${r.status}</span></td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>
      <div class="text-muted no-print" style="font-size:12px;margin-top:8px">حالة السداد تُحسب من إجمالي "دفعات الأعمال" المسجلة لهذا المقاول على المشروع في المصاريف الإدارية، موزّعة على الدفعات بالترتيب.</div>
    </div>

    <div class="card">
      <h3>${svgIcon("file", 22)} نص العقد</h3>
      <div style="white-space:pre-wrap;line-height:2;font-size:14px">${(s.text || "").replace(/</g, "&lt;")}</div>
    </div>
  `;

  const toAccount = () => { CONTRACTOR_VIEW_ID = s.contractorId; CONTRACTOR_ACC_PROJECT = s.projectId || null; CONTRACTORS_VIEW = "account"; renderContractors(el); window.scrollTo(0, 0); };
  document.getElementById("bcCons").onclick = () => { CONTRACTORS_VIEW = "list"; renderContractors(el); };
  document.getElementById("bcCon").onclick = toAccount;
  document.getElementById("scv_back").onclick = toAccount;
  document.getElementById("scv_print").onclick = () => window.print();
  const editBtn = document.getElementById("scv_edit");
  if (editBtn) editBtn.onclick = () => {
    SUBCONTRACT_DRAFT = JSON.parse(JSON.stringify(s));
    SUBCONTRACT_DRAFT._fromView = true;
    CONTRACTORS_VIEW = "subBuilder";
    renderContractors(el);
    window.scrollTo(0, 0);
  };
}

/* =========================================================
   دفعة للمقاول من مشتريات مسددة (فواتير مسجّلة أصلاً على المشروع في محاسبة المشاريع)
   ========================================================= */
function createContractorPurchasePayments(c, project, picks, date, note) {
  const list = dbGet("contractorPurchasePayments", []);
  picks.forEach(({ entry, amount }) => list.push({
    id: uid("cpp"), contractorId: c.id, projectId: project.id, entryId: entry.id, amount,
    date: date || todayISO(), note: note || "", label: purchaseInvoiceLabel(entry), createdAt: new Date().toISOString(),
  }));
  dbSet("contractorPurchasePayments", list);
  const total = picks.reduce((s, p) => s + p.amount, 0);
  logActivity(`تم احتساب مشتريات (${picks.length} فاتورة) بقيمة ${fmtMoney(total)} كدفعة للمقاول "${c.name}" على مشروع "${project.name || ""}"`);
}

function openPurchasePaymentModal(c, project, onSaved) {
  const invoices = projectPurchaseInvoices(project.id);
  const contractorsById = {};
  getContractors().forEach(x => { contractorsById[x.id] = x.name; });
  const allocOwners = (entryId) => [...new Set([
    ...dbGet("contractorPurchasePayments", []).filter(p => p.entryId === entryId).map(p => contractorsById[p.contractorId] || "مقاول"),
    ...dbGet("contractorAgreements", []).filter(ag => (ag.extras || []).some(x => x.kind === "purchase" && x.entryId === entryId)).map(ag => (contractorsById[ag.contractorId] || "مقاول") + " (أعمال إضافية)"),
  ])].join("، ");

  const html = `
    <div class="modal-head"><h3>دفعة من مشتريات مسددة — ${c.name}</h3><button class="modal-close" id="mClose">×</button></div>
    <p class="text-muted" style="margin-top:0;font-size:12.5px">اختر فاتورة (أو أكثر) من مشتريات مشروع <strong>${project.name}</strong> المسجّلة في محاسبة المشاريع والمسددة من قبلنا، لتُحتسب كدفعة للمقاول دون تسجيل مصروف جديد.</p>
    ${invoices.length ? `
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th></th><th>التاريخ</th><th>الفاتورة / المشتريات</th><th>المبلغ</th><th>المُسنَد سابقاً</th><th>المتاح</th><th>المبلغ المحتسب</th></tr></thead>
        <tbody>
          ${invoices.map(({ entry, allocated, available }) => `
            <tr style="${available <= 0 ? "opacity:.55" : ""}">
              <td><input type="checkbox" data-pinv="${entry.id}" ${available <= 0 ? "disabled" : ""}></td>
              <td>${fmtDate(entry.date)}</td>
              <td><span class="badge gray">${entry.type}</span> ${purchaseInvoiceLabel(entry)}${entry.attachment ? ` <a href="${entry.attachment.url}" target="_blank" rel="noopener" class="badge blue" style="text-decoration:none">${svgIcon("paperclip", 14)}</a>` : ""}</td>
              <td>${fmtMoney(entry.amount)}</td>
              <td>${allocated > 0 ? `${fmtMoney(allocated)} <span class="text-muted" style="font-size:11px">(${allocOwners(entry.id)})</span>` : `<span class="text-muted">-</span>`}</td>
              <td><strong>${fmtMoney(available)}</strong></td>
              <td><input type="number" min="0" max="${available}" step="0.01" value="${available}" data-pamt="${entry.id}" style="width:110px" disabled></td>
            </tr>`).join("")}
        </tbody>
      </table>
    </div>
    <div class="grid cols-2" style="margin-top:12px">
      <div class="field"><label>تاريخ الدفعة</label><input type="date" id="pp_date" value="${todayISO()}"></div>
      <div class="field"><label>ملاحظات (اختياري)</label><input id="pp_note"></div>
    </div>
    <div class="flex between" style="align-items:center;flex-wrap:wrap;gap:10px">
      <div style="font-size:14px">إجمالي المحتسب للمقاول: <strong id="pp_total">${fmtMoney(0)}</strong></div>
      <div class="flex gap"><button class="btn primary" id="pp_save">احتساب كدفعة للمقاول</button><button class="btn" id="pp_cancel">إلغاء</button></div>
    </div>` : `
    <div class="empty-state" style="padding:24px"><div class="ic">${svgIcon("file-text", 40)}</div>لا توجد فواتير مشتريات مسجّلة على هذا المشروع — سجّلها من محاسبة المشاريع (نوع الحركة: دفعة مشتريات).</div>
    <div class="flex gap"><button class="btn" id="pp_cancel">إغلاق</button></div>`}
  `;
  const ov = openModalShell(html, true);
  ov.querySelector("#mClose").onclick = closeModal;
  ov.querySelector("#pp_cancel").onclick = closeModal;
  if (!invoices.length) return;

  const refreshTotal = () => {
    let total = 0;
    ov.querySelectorAll("[data-pinv]").forEach(chk => {
      const amt = ov.querySelector(`[data-pamt="${chk.dataset.pinv}"]`);
      amt.disabled = !chk.checked;
      if (chk.checked) total += Number(amt.value) || 0;
    });
    ov.querySelector("#pp_total").textContent = fmtMoney(total);
  };
  ov.querySelectorAll("[data-pinv]").forEach(chk => chk.onchange = refreshTotal);
  ov.querySelectorAll("[data-pamt]").forEach(inp => inp.oninput = refreshTotal);

  ov.querySelector("#pp_save").onclick = () => {
    const picks = [];
    for (const chk of ov.querySelectorAll("[data-pinv]:checked")) {
      const inv = invoices.find(i => i.entry.id === chk.dataset.pinv);
      const amount = Number(ov.querySelector(`[data-pamt="${chk.dataset.pinv}"]`).value) || 0;
      if (amount <= 0) { toast("يرجى إدخال مبلغ صحيح لكل فاتورة محددة"); return; }
      if (amount > inv.available + 0.005) { toast(`المبلغ أكبر من المتاح على الفاتورة (${fmtMoney(inv.available)})`); return; }
      picks.push({ entry: inv.entry, amount });
    }
    if (!picks.length) { toast("اختر فاتورة واحدة على الأقل"); return; }
    createContractorPurchasePayments(c, project, picks, ov.querySelector("#pp_date").value, ov.querySelector("#pp_note").value.trim());
    toast("تم احتساب المشتريات كدفعة للمقاول");
    closeModal();
    onSaved();
  };
}

/* =========================================================
   أعمال إضافية نفّذها المقاول (تُحتسب لصالحه في حسابه النهائي)
   ========================================================= */
function openExtraWorkModal(c, project, ag, existing, onSaved) {
  const isEdit = !!existing;
  const x0 = existing || {};
  const items = ag.items || [];
  let attachment = x0.attachment || null;

  const html = `
    <div class="modal-head"><h3>${isEdit ? "تعديل عمل إضافي" : "عمل إضافي للمقاول"} — ${c.name}</h3><button class="modal-close" id="mClose">×</button></div>
    <div class="field"><label>نوع العمل الإضافي</label>
      <select id="ex_kind">${CONTRACTOR_EXTRA_KINDS.map(k => `<option value="${k.key}" ${x0.kind === k.key ? "selected" : ""}>${k.label}</option>`).join("")}</select>
    </div>
    <div id="ex_fields"></div>
    <div class="grid cols-2">
      <div class="field"><label>التاريخ</label><input type="date" id="ex_date" value="${x0.date || todayISO()}"></div>
      <div class="field"><label>ملاحظات (اختياري)</label><input id="ex_note" value="${x0.note || ""}"></div>
    </div>
    <div style="font-size:14px;margin-bottom:12px">المبلغ الذي يُضاف لصالح المقاول: <strong id="ex_total" style="color:var(--success)">${fmtMoney(0)}</strong></div>
    <div class="flex gap"><button class="btn primary" id="ex_save">${isEdit ? "حفظ التعديل" : "إضافة"}</button><button class="btn" id="ex_cancel">إلغاء</button></div>
  `;
  const ov = openModalShell(html);
  ov.querySelector("#mClose").onclick = closeModal;
  ov.querySelector("#ex_cancel").onclick = closeModal;
  const kindSel = ov.querySelector("#ex_kind");
  const box = ov.querySelector("#ex_fields");
  const val = (id) => { const el = ov.querySelector(id); return el ? el.value : ""; };

  function computeAmount() {
    const kind = kindSel.value;
    const amount = (kind === "qty" || kind === "item")
      ? (Number(val("#ex_qty")) || 0) * (Number(val("#ex_price")) || 0)
      : (Number(val("#ex_amount")) || 0);
    ov.querySelector("#ex_total").textContent = fmtMoney(amount);
    return amount;
  }

  function drawFields() {
    const kind = kindSel.value;
    if (kind === "qty") {
      box.innerHTML = items.length ? `
        <div class="field"><label>البند من اتفاق المقاول</label>
          <select id="ex_item">${items.map(it => `<option value="${it.id}" ${x0.itemId === it.id ? "selected" : ""}>${it.name} (${it.unit || ""})</option>`).join("")}</select>
        </div>
        <div class="grid cols-2">
          <div class="field"><label>الكمية الإضافية</label><input type="number" min="0" step="0.01" id="ex_qty" value="${x0.qty || 0}"></div>
          <div class="field"><label>سعر الوحدة (ر.س)</label><input type="number" min="0" step="0.01" id="ex_price" value="${x0.unitPrice !== undefined ? x0.unitPrice : ((items.find(i => i.id === (x0.itemId || items[0].id)) || {}).unitPrice || 0)}"></div>
        </div>` : `<div class="text-muted" style="font-size:13px;margin-bottom:12px">لا توجد بنود في اتفاق المقاول لاختيار كميات إضافية عليها — أضف بنوداً للاتفاق أولاً، أو استخدم "بند إضافي جديد".</div>`;
      const itemSel = box.querySelector("#ex_item");
      if (itemSel && !isEdit) itemSel.onchange = () => { const it = items.find(i => i.id === itemSel.value); if (it) { box.querySelector("#ex_price").value = Number(it.unitPrice) || 0; computeAmount(); } };
    } else if (kind === "item") {
      box.innerHTML = `
        <div class="field"><label>اسم البند الإضافي</label><input id="ex_title" value="${x0.kind === "item" ? (x0.title || "") : ""}"></div>
        <div class="grid cols-3">
          <div class="field"><label>الوحدة</label><input id="ex_unit" value="${x0.kind === "item" ? (x0.unit || "م²") : "م²"}"></div>
          <div class="field"><label>الكمية</label><input type="number" min="0" step="0.01" id="ex_qty" value="${x0.kind === "item" ? (x0.qty || 1) : 1}"></div>
          <div class="field"><label>سعر الوحدة (ر.س)</label><input type="number" min="0" step="0.01" id="ex_price" value="${x0.kind === "item" ? (x0.unitPrice || 0) : 0}"></div>
        </div>`;
    } else if (kind === "purchase") {
      const invoices = projectPurchaseInvoices(project.id, isEdit ? existing.id : null).filter(i => i.available > 0 || i.entry.id === x0.entryId);
      const wasKind = x0.kind === "purchase";
      const src = purchaseSrc || (wasKind ? (x0.entryId ? "link" : "manual") : (invoices.length ? "link" : "manual"));
      purchaseSrc = src;
      box.innerHTML = `
        <div class="field"><label>مصدر الفاتورة</label>
          <select id="ex_src">
            <option value="link" ${src === "link" ? "selected" : ""}>ربط فاتورة مسجّلة على المشروع (من محاسبة المشاريع)</option>
            <option value="manual" ${src === "manual" ? "selected" : ""}>إدخال الفاتورة يدوياً</option>
          </select>
        </div>
        <div id="ex_purchaseBody"></div>`;
      const body = box.querySelector("#ex_purchaseBody");
      box.querySelector("#ex_src").onchange = (e) => { purchaseSrc = e.target.value; drawFields(); };

      if (src === "link") {
        body.innerHTML = invoices.length ? `
          <div class="field"><label>فاتورة المشتريات المسجّلة على المشروع</label>
            <select id="ex_entry">
              <option value="">— اختر الفاتورة —</option>
              ${invoices.map(i => `<option value="${i.entry.id}" ${x0.entryId === i.entry.id ? "selected" : ""}>${fmtDate(i.entry.date)} — ${purchaseInvoiceLabel(i.entry)} — المتاح ${fmtMoney(i.available)}</option>`).join("")}
            </select>
            <div class="hint" id="ex_entryInfo"></div>
          </div>
          <div class="field"><label>المبلغ المحتسب لصالح المقاول (ر.س)</label><input type="number" min="0" step="0.01" id="ex_amount" value="${wasKind && x0.entryId ? (x0.amount || 0) : 0}"></div>`
          : `<div class="text-muted" style="font-size:13px;margin-bottom:12px">لا توجد فواتير مشتريات متاحة على هذا المشروع — سجّلها من محاسبة المشاريع (نوع الحركة: دفعة مشتريات) أو اختر "إدخال الفاتورة يدوياً".</div>`;
        const entrySel = body.querySelector("#ex_entry");
        if (entrySel) {
          const showInfo = () => {
            const inv = invoices.find(i => i.entry.id === entrySel.value);
            body.querySelector("#ex_entryInfo").innerHTML = inv
              ? `المبلغ الأصلي ${fmtMoney(inv.entry.amount)} — المتاح للاحتساب ${fmtMoney(inv.available)}${inv.entry.attachment ? ` — <a href="${inv.entry.attachment.url}" target="_blank" rel="noopener" style="color:var(--primary);font-weight:700">عرض الفاتورة</a>` : ""}`
              : "";
          };
          entrySel.onchange = () => {
            const inv = invoices.find(i => i.entry.id === entrySel.value);
            if (inv) body.querySelector("#ex_amount").value = inv.available;
            showInfo();
            computeAmount();
          };
          showInfo();
        }
      } else {
        body.innerHTML = `
          <div class="grid cols-2">
            <div class="field"><label>التاجر / المورّد</label><input id="ex_vendor" value="${wasKind ? (x0.vendor || "") : ""}"></div>
            <div class="field"><label>رقم الفاتورة</label><input id="ex_invoice" value="${wasKind ? (x0.invoiceRef || "") : ""}"></div>
          </div>
          <div class="field"><label>وصف المشتريات</label><input id="ex_title" value="${wasKind ? (x0.title || "") : ""}" placeholder="مثال: أسلاك ولوازم كهربائية اشتراها المقاول"></div>
          <div class="field"><label>مبلغ الفاتورة (ر.س)</label><input type="number" min="0" step="0.01" id="ex_amount" value="${wasKind && !x0.entryId ? (x0.amount || 0) : 0}"></div>
          <div class="field"><label>صورة الفاتورة (اختياري)</label><input type="file" id="ex_attachment" accept=".pdf,image/*">
            <div id="ex_attPreview" class="flex wrap" style="margin-top:8px">${attachment ? `<span class="file-chip">${svgIcon("paperclip", 14)} ${attachment.name || "المرفق الحالي"}</span>` : ""}</div></div>`;
        const att = body.querySelector("#ex_attachment");
        att.onchange = async (e) => {
          const file = e.target.files[0];
          if (!file) { attachment = null; body.querySelector("#ex_attPreview").innerHTML = ""; return; }
          attachment = { name: file.name, type: file.type, url: await fileToDataURL(file) };
          body.querySelector("#ex_attPreview").innerHTML = `<span class="file-chip">${svgIcon("paperclip", 14)} ${file.name}</span>`;
        };
      }
    } else {
      box.innerHTML = `
        <div class="field"><label>وصف الدفعة / المصروف الذي سدّده المقاول</label><input id="ex_title" value="${x0.kind === "payment" ? (x0.title || "") : ""}" placeholder="مثال: أجور عمالة إضافية سدّدها المقاول"></div>
        <div class="field"><label>المبلغ (ر.س)</label><input type="number" min="0" step="0.01" id="ex_amount" value="${x0.kind === "payment" ? (x0.amount || 0) : 0}"></div>`;
    }
    box.querySelectorAll("input, select").forEach(inp => { inp.oninput = computeAmount; if (inp.tagName === "SELECT") inp.addEventListener("change", computeAmount); });
    computeAmount();
  }
  let purchaseSrc = null; // link | manual
  kindSel.onchange = () => { purchaseSrc = null; drawFields(); };
  drawFields();

  ov.querySelector("#ex_save").onclick = () => {
    const kind = kindSel.value;
    const rec = { id: isEdit ? existing.id : uid("ex"), kind, date: val("#ex_date") || todayISO(), note: val("#ex_note").trim() };
    if (kind === "qty") {
      const it = items.find(i => i.id === val("#ex_item"));
      if (!it) { toast("لا يوجد بند في اتفاق المقاول لاختياره"); return; }
      rec.itemId = it.id; rec.title = it.name + " (كمية إضافية)"; rec.unit = it.unit; rec.qty = Number(val("#ex_qty")) || 0; rec.unitPrice = Number(val("#ex_price")) || 0;
      if (rec.qty <= 0) { toast("يرجى إدخال الكمية الإضافية"); return; }
    } else if (kind === "item") {
      rec.title = val("#ex_title").trim(); rec.unit = val("#ex_unit").trim() || "م²"; rec.qty = Number(val("#ex_qty")) || 0; rec.unitPrice = Number(val("#ex_price")) || 0;
      if (!rec.title) { toast("يرجى إدخال اسم البند الإضافي"); return; }
      if (rec.qty <= 0) { toast("يرجى إدخال الكمية"); return; }
    } else if (kind === "purchase") {
      rec.amount = Number(val("#ex_amount")) || 0;
      if (purchaseSrc === "link") {
        const inv = projectPurchaseInvoices(project.id, isEdit ? existing.id : null).find(i => i.entry.id === val("#ex_entry"));
        if (!inv) { toast("يرجى اختيار الفاتورة المسجّلة على المشروع"); return; }
        if (rec.amount <= 0) { toast("يرجى إدخال المبلغ المحتسب لصالح المقاول"); return; }
        if (rec.amount > inv.available + 0.005) { toast("المبلغ أكبر من المتاح على الفاتورة (" + fmtMoney(inv.available) + ")"); return; }
        rec.entryId = inv.entry.id; rec.vendor = inv.entry.vendorName || ""; rec.invoiceRef = inv.entry.invoiceRefNumber || ""; rec.title = purchaseInvoiceLabel(inv.entry);
      } else {
        rec.vendor = val("#ex_vendor").trim(); rec.invoiceRef = val("#ex_invoice").trim(); rec.title = val("#ex_title").trim() || "مشتريات"; rec.attachment = attachment;
        if (rec.amount <= 0) { toast("يرجى إدخال مبلغ الفاتورة"); return; }
      }
    } else {
      rec.title = val("#ex_title").trim(); rec.amount = Number(val("#ex_amount")) || 0;
      if (!rec.title) { toast("يرجى إدخال وصف الدفعة / المصروف"); return; }
      if (rec.amount <= 0) { toast("يرجى إدخال المبلغ"); return; }
    }
    mutateContractorAgreement(ag.id, a => {
      a.extras = a.extras || [];
      const idx = a.extras.findIndex(x => x.id === rec.id);
      if (idx >= 0) a.extras[idx] = rec; else a.extras.push(rec);
    });
    logActivity(`تم ${isEdit ? "تعديل" : "إضافة"} عمل إضافي (${(CONTRACTOR_EXTRA_KINDS.find(k => k.key === kind) || {}).label}) بقيمة ${fmtMoney(contractorExtraAmount(rec))} لصالح المقاول "${c.name}" في مشروع "${project.name}"`);
    toast(isEdit ? "تم حفظ التعديل" : "تمت إضافة العمل الإضافي لحساب المقاول");
    closeModal();
    onSaved();
  };
}
