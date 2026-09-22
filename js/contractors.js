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
/* دفعات مقاول الباطن المسجّلة من محاسبة المشاريع (حركة نوعها "دفعة مقاول باطن" — تُحتسب مصروفاً على المشروع ودفعة في حساب المقاول) */
const PROJECT_CONTRACTOR_PAYMENT_TYPE = "دفعة مقاول باطن";
function contractorProjectPaymentsOf(contractorId, projectId, excludeId) {
  return dbGet("accProjects", []).filter(e => e.type === PROJECT_CONTRACTOR_PAYMENT_TYPE && e.contractorId === contractorId
    && (!projectId || e.projectId === projectId) && e.id !== excludeId);
}
function contractorPaidTotal(contractorId, projectId, excludePaymentId) {
  return contractorPaymentsOf(contractorId, projectId, excludePaymentId).reduce((s, e) => s + (Number(e.amount) || 0), 0)
    + contractorProjectPaymentsOf(contractorId, projectId, excludePaymentId).reduce((s, e) => s + (Number(e.amount) || 0), 0)
    + contractorPurchasePaymentsOf(contractorId, projectId).reduce((s, p) => s + (Number(p.amount) || 0), 0);
}
function contractorHasPayments(contractorId, projectId) {
  return contractorPaymentsOf(contractorId, projectId).length > 0 || contractorProjectPaymentsOf(contractorId, projectId).length > 0
    || contractorPurchasePaymentsOf(contractorId, projectId).length > 0;
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
  if (CONTRACTORS_VIEW === "statement") return renderContractorStatement(el);
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
                  <button class="btn-icon" data-stmtcon="${r.c.id}" title="كشف حساب للطباعة">${svgIcon("printer", 16)}</button>
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
  el.querySelectorAll("[data-stmtcon]").forEach(b => b.onclick = (e) => { e.stopPropagation(); openContractorStatement(el, b.dataset.stmtcon, "all"); });
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
      <div class="flex gap">
        <button class="btn" id="conBack">${svgIcon("chevron-left")} رجوع لمقاولي الباطن</button>
        <button class="btn primary" id="conStmtBtn">${svgIcon("printer")} كشف حساب</button>
      </div>
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
  document.getElementById("conStmtBtn").onclick = () => openContractorStatement(el, c.id, project && agreements.some(a => a.projectId === project.id) ? project.id : "all");
  const projSel = document.getElementById("ca_project");
  if (projSel) projSel.onchange = () => { CONTRACTOR_ACC_PROJECT = projSel.value; renderContractorAccount(el); };
  el.querySelectorAll("[data-switchproj]").forEach(b => b.onclick = () => { CONTRACTOR_ACC_PROJECT = b.dataset.switchproj; renderContractorAccount(el); window.scrollTo(0, 0); });

  const createBtn = document.getElementById("createAgreementBtn");
  if (createBtn) createBtn.onclick = () => openCreateAgreementModal(c, project, () => renderContractorAccount(el));
  bindSubcontractsCard(el, c, project ? project.id : "");
  if (figs) bindAccountEvents(el, c, project, figs, canEdit, canPay);
}

/* كل دفعات المقاول على المشروع (نقدية + مشتريات + محاسبة المشروع) مرتبة من الأحدث */
function contractorAllPayments(contractorId, projectId) {
  const invoicesById = {};
  dbGet("accProjects", []).forEach(x => { invoicesById[x.id] = x; });
  return [
    ...contractorPaymentsOf(contractorId, projectId).map(e => ({ kind: "cash", id: e.id, date: e.date, amount: e.amount, method: e.paymentMethod, note: e.note })),
    ...contractorPurchasePaymentsOf(contractorId, projectId).map(p => ({ kind: "purchase", id: p.id, date: p.date, amount: p.amount, label: p.label, note: p.note, entry: invoicesById[p.entryId] })),
    ...contractorProjectPaymentsOf(contractorId, projectId).map(e => ({ kind: "projectpay", id: e.id, date: e.date, amount: e.amount, method: e.paymentMethod, note: e.note, entry: e })),
  ].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
}

function accountBodyHtml(c, project, f, canEdit, canPay) {
  const ag = f.ag;
  const isUnit = ag.type === "unit";
  const invoicesById = {};
  dbGet("accProjects", []).forEach(x => { invoicesById[x.id] = x; });
  const payments = contractorAllPayments(c.id, project.id);
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
        <div class="flex gap wrap">
          <button class="btn sm" id="printStatementBtn">${svgIcon("printer")} طباعة كشف حساب</button>
          ${canPay ? `<button class="btn sm primary" id="addPaymentBtn">${svgIcon("plus")} تسجيل دفعة أعمال</button>
          <button class="btn sm" id="addPurchasePaymentBtn">${svgIcon("plus")} دفعة من مشتريات مسددة</button>` : ""}
        </div>
      </div>
      ${payments.length ? `
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>التاريخ</th><th>النوع</th><th>المبلغ</th><th>طريقة الدفع / الفاتورة</th><th>ملاحظات</th><th></th></tr></thead>
          <tbody>
            ${payments.map(p => `
              <tr>
                <td>${fmtDate(p.date)}</td>
                <td>${p.kind === "purchase" ? `<span class="badge orange">مشتريات</span>` : p.kind === "projectpay" ? `<span class="badge blue">محاسبة المشروع</span>` : `<span class="badge green">دفعة مالية</span>`}</td>
                <td><strong>${fmtMoney(p.amount)}</strong></td>
                <td>${p.kind === "purchase"
                  ? `${p.label || "فاتورة مشتريات"}${p.entry && p.entry.attachment ? ` <a href="${p.entry.attachment.url}" target="_blank" rel="noopener" class="badge blue" style="text-decoration:none">${svgIcon("paperclip", 14)} الفاتورة</a>` : ""}`
                  : `${p.method || `<span class="text-muted">-</span>`}${p.kind === "projectpay" && p.entry && p.entry.attachment ? ` <a href="${p.entry.attachment.url}" target="_blank" rel="noopener" class="badge blue" style="text-decoration:none">${svgIcon("paperclip", 14)} المرفق</a>` : ""}`}</td>
                <td>${p.note || `<span class="text-muted">-</span>`}</td>
                <td>${p.kind === "purchase" && canEdit ? `<button class="btn-icon danger" data-rmpurchasepay="${p.id}" title="إلغاء هذه الدفعة (الفاتورة تبقى في المصاريف)">${ICON_DELETE}</button>` : ""}</td>
              </tr>`).join("")}
            <tr><td><strong>الإجمالي</strong></td><td></td><td colspan="4"><strong>${fmtMoney(f.paid)}</strong></td></tr>
          </tbody>
        </table>
      </div>
      <div class="text-muted" style="font-size:12px;margin-top:8px">الدفعات المالية تُعدَّل أو تُحذف من المحاسبة العامة ← المصاريف الإدارية (تصنيف "دفعة أعمال")، ودفعات "محاسبة المشروع" من محاسبة المشاريع (نوع الحركة "دفعة مقاول باطن")، ودفعات المشتريات تُلغى من هنا وتبقى فواتيرها في محاسبة المشروع.</div>` : `<div class="text-muted" style="font-size:13px">لا توجد دفعات مسجلة لهذا المقاول على هذا المشروع.</div>`}
    </div>
  `;
}

function bindAccountEvents(el, c, project, f, canEdit, canPay) {
  const ag = f.ag;
  const rerender = () => renderContractorAccount(el);
  const projLabel = project.name;

  document.getElementById("printStatementBtn").onclick = () => printContractorStatement(c, project, f);
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

/* ---------- طباعة كشف حساب المقاول (نافذة مستقلة جاهزة للطباعة A4) ---------- */
function printContractorStatement(c, project, f) {
  const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const ag = f.ag;
  const isUnit = ag.type === "unit";
  const company = getCompanyProfile();
  const asc = (a, b) => (a.date || "").localeCompare(b.date || "");
  const items = ag.items || [];
  const extras = (ag.extras || []).slice().sort(asc);
  const adjustments = (ag.adjustments || []).slice().sort(asc);
  const payments = contractorAllPayments(c.id, project.id).reverse();
  const signed = (n) => { n = Number(n) || 0; return n === 0 ? fmtMoney(0) : (n > 0 ? "+ " : "− ") + fmtMoney(Math.abs(n)); };
  const kindLabel = (p) => p.kind === "purchase" ? "مشتريات" : p.kind === "projectpay" ? "محاسبة المشروع" : "دفعة مالية";

  let cumulative = 0;
  const paymentRows = payments.map((p, i) => {
    cumulative += Number(p.amount) || 0;
    const desc = p.kind === "purchase" ? (p.label || "فاتورة مشتريات") : (p.method || "-");
    return `<tr><td>${i + 1}</td><td>${fmtDate(p.date)}</td><td>${kindLabel(p)}</td><td class="r">${esc(desc)}${p.note ? `<div class="sub">${esc(p.note)}</div>` : ""}</td><td class="n">${fmtMoney(p.amount)}</td><td class="n">${fmtMoney(f.entitlement - cumulative)}</td></tr>`;
  }).join("");

  const body = `
    <div class="head">
      ${company.logo ? `<img class="logo" src="${company.logo}">` : ""}
      <div class="co">
        <h1>${esc(company.name)}</h1>
        ${company.address ? `<div>${esc(company.address)}</div>` : ""}
        ${company.phone ? `<div>${esc(company.phone)}</div>` : ""}
        ${company.taxNumber ? `<div>الرقم الضريبي: ${esc(company.taxNumber)}</div>` : ""}
      </div>
      <div class="ttl"><h2>كشف حساب مقاول</h2><div>تاريخ الطباعة: ${fmtDate(todayISO())}</div></div>
    </div>

    <table class="info"><tr>
      <td><span>المقاول</span><strong>${esc(c.name)}</strong></td>
      <td><span>التخصص</span><strong>${esc(c.trade || "-")}</strong></td>
      <td><span>الجوال</span><strong>${esc(c.phone || "-")}</strong></td>
    </tr><tr>
      <td colspan="2"><span>المشروع</span><strong>${esc(project.name)}</strong></td>
      <td><span>نوع الاتفاق</span><strong>${AGREEMENT_TYPE_LABELS[ag.type] || ""}</strong></td>
    </tr></table>

    <h3>ملخص الحساب</h3>
    <table class="grid sum">
      <tr><td>قيمة الاتفاق الأصلية</td><td class="n">${fmtMoney(f.agreed)}</td></tr>
      <tr><td>فرق التمتير النهائي</td><td class="n">${signed(f.measuredDiff)}</td></tr>
      <tr><td>الأعمال الإضافية (لصالحه)</td><td class="n">${signed(f.extras)}</td></tr>
      <tr><td>الخصومات والتعديلات</td><td class="n">${signed(f.adjustments)}</td></tr>
      <tr class="tot"><td>المستحق النهائي للمقاول</td><td class="n">${fmtMoney(f.entitlement)}</td></tr>
      <tr><td>إجمالي المدفوع</td><td class="n">${fmtMoney(f.paid)}</td></tr>
      <tr class="tot"><td>${f.remaining < 0 ? "المدفوع أكثر من المستحق بمبلغ" : "المبلغ المتبقي للمقاول"}</td><td class="n">${fmtMoney(Math.abs(f.remaining))}</td></tr>
    </table>

    ${isUnit && items.length ? `
    <h3>بنود الاتفاق</h3>
    <table class="grid"><thead><tr><th>#</th><th>البند</th><th>الوحدة</th><th>الكمية المتفق عليها</th><th>سعر الوحدة</th><th>الكمية النهائية</th><th>الإجمالي</th></tr></thead><tbody>
      ${items.map((it, i) => `<tr><td>${i + 1}</td><td class="r">${esc(it.name)}</td><td>${esc(it.unit || "-")}</td><td>${Number(it.qty) || 0}</td><td class="n">${fmtMoney(it.unitPrice)}</td><td>${contractorItemFinalQty(it)}</td><td class="n">${fmtMoney(contractorItemFinalQty(it) * (Number(it.unitPrice) || 0))}</td></tr>`).join("")}
    </tbody></table>` : ""}

    ${extras.length ? `
    <h3>الأعمال الإضافية</h3>
    <table class="grid"><thead><tr><th>التاريخ</th><th>النوع</th><th>البيان</th><th>المبلغ</th></tr></thead><tbody>
      ${extras.map(x => `<tr><td>${fmtDate(x.date)}</td><td>${esc((CONTRACTOR_EXTRA_KINDS.find(k => k.key === x.kind) || {}).label || "")}</td><td class="r">${esc(x.title || "-")}${x.vendor ? `<div class="sub">التاجر: ${esc(x.vendor)}${x.invoiceRef ? " — فاتورة " + esc(x.invoiceRef) : ""}</div>` : ""}${x.note ? `<div class="sub">${esc(x.note)}</div>` : ""}</td><td class="n">${fmtMoney(contractorExtraAmount(x))}</td></tr>`).join("")}
      <tr class="tot"><td colspan="3">الإجمالي</td><td class="n">${fmtMoney(f.extras)}</td></tr>
    </tbody></table>` : ""}

    ${adjustments.length ? `
    <h3>الخصومات والتعديلات</h3>
    <table class="grid"><thead><tr><th>التاريخ</th><th>النوع</th><th>ملاحظة</th><th>المبلغ</th></tr></thead><tbody>
      ${adjustments.map(a => `<tr><td>${fmtDate(a.date)}</td><td>${esc(a.label)}</td><td class="r">${esc(a.note || "-")}</td><td class="n">${signed(a.amount)}</td></tr>`).join("")}
      <tr class="tot"><td colspan="3">الإجمالي</td><td class="n">${signed(f.adjustments)}</td></tr>
    </tbody></table>` : ""}

    <h3>الدفعات المسلّمة للمقاول (${payments.length})</h3>
    ${payments.length ? `
    <table class="grid"><thead><tr><th>#</th><th>التاريخ</th><th>النوع</th><th>البيان / طريقة الدفع</th><th>المبلغ</th><th>المتبقي بعد الدفعة</th></tr></thead><tbody>
      ${paymentRows}
      <tr class="tot"><td colspan="4">إجمالي المدفوع</td><td class="n">${fmtMoney(f.paid)}</td><td class="n">${fmtMoney(f.remaining)}</td></tr>
    </tbody></table>` : `<p class="empty">لا توجد دفعات مسجلة.</p>`}

    <div class="sign"><div>المقاول<br><br>الاسم / التوقيع: ..............................</div><div>المحاسب<br><br>الاسم / التوقيع: ..............................</div><div>المدير<br><br>الاسم / التوقيع: ..............................</div></div>
  `;

  const css = `
    @page { size: A4; margin: 12mm; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { font-family: 'Cairo', 'Segoe UI', Tahoma, sans-serif; color: #1f2430; font-size: 12.5px; margin: 0; padding: 16px; direction: rtl; }
    .head { display: flex; align-items: center; gap: 16px; border-bottom: 3px solid #1d6fe8; padding-bottom: 12px; margin-bottom: 14px; }
    .logo { height: 64px; max-width: 120px; object-fit: contain; }
    .co { flex: 1; } .co h1 { margin: 0 0 4px; font-size: 20px; } .co div { color: #555; font-size: 12px; }
    .ttl { text-align: left; } .ttl h2 { margin: 0 0 4px; font-size: 20px; color: #1d6fe8; } .ttl div { color: #555; font-size: 12px; }
    h3 { margin: 18px 0 6px; font-size: 14px; border-right: 4px solid #1d6fe8; padding-right: 8px; }
    table { width: 100%; border-collapse: collapse; }
    .info td { border: 1px solid #d5d9e2; padding: 8px 10px; background: #f7f9fc; }
    .info span { display: block; color: #666; font-size: 11px; } .info strong { font-size: 13.5px; }
    .grid th { background: #eef2f9; font-size: 12px; }
    .grid th, .grid td { border: 1px solid #d5d9e2; padding: 6px 8px; text-align: center; }
    .grid td.r { text-align: right; } .grid td.n { white-space: nowrap; font-weight: 700; }
    .sub { color: #666; font-size: 11px; font-weight: 400; }
    .sum td:first-child { text-align: right; width: 60%; } .sum td.n { text-align: left; }
    .grid tr.tot td { background: #eef2f9; font-weight: 800; }
    thead { display: table-header-group; } tr { break-inside: avoid; page-break-inside: avoid; }
    .empty { color: #777; }
    .sign { display: flex; gap: 20px; margin-top: 36px; break-inside: avoid; }
    .sign div { flex: 1; text-align: center; line-height: 1.9; }
  `;

  const w = window.open("", "_blank");
  if (!w) { toast("تعذّر فتح نافذة الطباعة — اسمح بالنوافذ المنبثقة لهذا الموقع ثم أعد المحاولة"); return; }
  w.document.open();
  w.document.write(`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>كشف حساب — ${esc(c.name)} — ${esc(project.name)}</title><style>${css}</style></head><body>${body}</body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => { try { w.print(); } catch (e) {} }, 400);
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

/* =========================================================
   كشف حساب المقاول (قابل للطباعة): دفتر حركة بالرصيد الجاري لكل مشروع أو لكل المشاريع
   ========================================================= */
let CONTRACTOR_STMT = { projectId: "all", from: "", to: "", lang: "ar" };

/* ---------- ترجمة كشف الحساب (عربي افتراضي، إنجليزي، أردو، بنغالي) — للطباعة فقط؛ الأسماء والملاحظات الحرة تبقى كما أُدخلت ---------- */
const STMT_LANGS = [
  { key: "ar", label: "العربية (افتراضي)", dir: "rtl" },
  { key: "en", label: "English", dir: "ltr" },
  { key: "ur", label: "اردو", dir: "rtl" },
  { key: "bn", label: "বাংলা", dir: "ltr" },
];
const STMT_I18N = {
  ar: {
    breadcrumbContractors: "مقاولو الباطن", breadcrumbStatement: "كشف حساب",
    pageTitle: "كشف حساب المقاول", pageSubtitle: "اختر المشروع والفترة واللغة ثم اطبع الكشف",
    back: "رجوع", print: "طباعة الكشف",
    filterProject: "المشروع", allProjects: "كل المشاريع", fromDate: "من تاريخ (اختياري)", toDate: "إلى تاريخ (اختياري)", language: "لغة الكشف",
    statementTitle: "كشف حساب مقاول باطن", issueDate: "تاريخ الإصدار:",
    contractor: "المقاول", tradeSpec: "العمل / التخصص", mobile: "الجوال", project: "المشروع", agreementType: "نوع الاتفاق", period: "الفترة",
    periodSince: "منذ بداية التعامل حتى تاريخه", periodFrom: "من", periodTo: "إلى",
    allProjectsCount: (n) => `كل المشاريع (${n})`,
    colDate: "التاريخ", colDesc: "البيان", colDue: "المستحق", colPaidDeduct: "المدفوع / الخصم", colBalance: "الرصيد المتبقي له",
    openingBalance: (d) => `رصيد سابق (قبل ${d})`, noTransactions: "لا توجد حركات في الفترة المحددة", total: "الإجمالي",
    projectLabel: (n) => `المشروع: ${n}`,
    totalDue: "إجمالي المستحق", totalPaidDeduct: "إجمالي المدفوع والخصومات", remainingBalance: "الرصيد المتبقي للمقاول",
    remainingBalanceProject: "الرصيد المتبقي للمقاول على المشروع", noAgreements: "لا توجد اتفاقات لهذا المقاول",
    itemsTitle: "بنود الاتفاق حسب جدول الكميات", colNum: "#", colItem: "البند", colUnit: "الوحدة",
    colAgreedQty: "الكمية المتفق عليها", colUnitPrice: "سعر الوحدة", colFinalQty: "الكمية النهائية", colTotal: "الإجمالي",
    accountantSign: "المحاسب:", signDate: "التوقيع والتاريخ", contractorSign: "مقاول الباطن (اطلعتُ ووافقتُ على الرصيد):",
    logo: "الشعار", taxNumber: "— الرقم الضريبي:", crNumber: "س.ت:",
    agreementValue: (type) => `قيمة الاتفاق (${type})`, finalMeasureDiff: "فرق التمتير النهائي",
    extraWork: "عمل إضافي", invoice: "فاتورة", workPayment: "دفعة أعمال",
    projectAccountingPayment: "دفعة من محاسبة المشروع", settledPurchase: "مشتريات مسددة",
  },
  en: {
    breadcrumbContractors: "Subcontractors", breadcrumbStatement: "Account Statement",
    pageTitle: "Contractor Account Statement", pageSubtitle: "Choose the project, period and language, then print",
    back: "Back", print: "Print Statement",
    filterProject: "Project", allProjects: "All Projects", fromDate: "From date (optional)", toDate: "To date (optional)", language: "Statement Language",
    statementTitle: "Subcontractor Account Statement", issueDate: "Issue date:",
    contractor: "Contractor", tradeSpec: "Trade / Specialty", mobile: "Mobile", project: "Project", agreementType: "Agreement Type", period: "Period",
    periodSince: "Since the start of dealings to date", periodFrom: "From", periodTo: "To",
    allProjectsCount: (n) => `All projects (${n})`,
    colDate: "Date", colDesc: "Description", colDue: "Due", colPaidDeduct: "Paid / Deducted", colBalance: "Remaining Balance",
    openingBalance: (d) => `Opening balance (before ${d})`, noTransactions: "No transactions in the selected period", total: "Total",
    projectLabel: (n) => `Project: ${n}`,
    totalDue: "Total Due", totalPaidDeduct: "Total Paid & Deductions", remainingBalance: "Contractor's Remaining Balance",
    remainingBalanceProject: "Contractor's remaining balance on the project", noAgreements: "This contractor has no agreements",
    itemsTitle: "Agreement Items (per Bill of Quantities)", colNum: "#", colItem: "Item", colUnit: "Unit",
    colAgreedQty: "Agreed Quantity", colUnitPrice: "Unit Price", colFinalQty: "Final Quantity", colTotal: "Total",
    accountantSign: "Accountant:", signDate: "Signature & Date", contractorSign: "Subcontractor (reviewed and approved the balance):",
    logo: "Logo", taxNumber: "— Tax No:", crNumber: "CR:",
    agreementValue: (type) => `Agreement value (${type})`, finalMeasureDiff: "Final measurement difference",
    extraWork: "Extra work", invoice: "invoice", workPayment: "Work payment",
    projectAccountingPayment: "Payment via project accounting", settledPurchase: "Settled purchase",
  },
  ur: {
    breadcrumbContractors: "ذیلی ٹھیکیدار", breadcrumbStatement: "کھاتہ اسٹیٹمنٹ",
    pageTitle: "ٹھیکیدار کھاتہ اسٹیٹمنٹ", pageSubtitle: "منصوبہ، مدت اور زبان منتخب کریں پھر پرنٹ کریں",
    back: "واپس", print: "اسٹیٹمنٹ پرنٹ کریں",
    filterProject: "منصوبہ", allProjects: "تمام منصوبے", fromDate: "تاریخ سے (اختیاری)", toDate: "تاریخ تک (اختیاری)", language: "اسٹیٹمنٹ کی زبان",
    statementTitle: "ذیلی ٹھیکیدار کھاتہ اسٹیٹمنٹ", issueDate: "اجراء کی تاریخ:",
    contractor: "ٹھیکیدار", tradeSpec: "پیشہ / مہارت", mobile: "موبائل", project: "منصوبہ", agreementType: "معاہدے کی قسم", period: "مدت",
    periodSince: "تعامل کے آغاز سے تاحال", periodFrom: "سے", periodTo: "تک",
    allProjectsCount: (n) => `تمام منصوبے (${n})`,
    colDate: "تاریخ", colDesc: "تفصیل", colDue: "واجب الادا", colPaidDeduct: "ادا شدہ / کٹوتی", colBalance: "باقی رقم",
    openingBalance: (d) => `سابقہ بیلنس (${d} سے پہلے)`, noTransactions: "منتخب مدت میں کوئی لین دین نہیں", total: "مجموعہ",
    projectLabel: (n) => `منصوبہ: ${n}`,
    totalDue: "کل واجب الادا", totalPaidDeduct: "کل ادائیگی اور کٹوتیاں", remainingBalance: "ٹھیکیدار کا باقی بیلنس",
    remainingBalanceProject: "منصوبے پر ٹھیکیدار کا باقی بیلنس", noAgreements: "اس ٹھیکیدار کا کوئی معاہدہ نہیں",
    itemsTitle: "معاہدے کی مدات (مقدار کے جدول کے مطابق)", colNum: "#", colItem: "مد", colUnit: "اکائی",
    colAgreedQty: "طے شدہ مقدار", colUnitPrice: "فی یونٹ قیمت", colFinalQty: "حتمی مقدار", colTotal: "کل",
    accountantSign: "اکاؤنٹنٹ:", signDate: "دستخط اور تاریخ", contractorSign: "ذیلی ٹھیکیدار (بیلنس ملاحظہ اور منظور کیا):",
    logo: "لوگو", taxNumber: "— ٹیکس نمبر:", crNumber: "سی آر:",
    agreementValue: (type) => `معاہدے کی قیمت (${type})`, finalMeasureDiff: "حتمی پیمائش کا فرق",
    extraWork: "اضافی کام", invoice: "انوائس", workPayment: "کام کی ادائیگی",
    projectAccountingPayment: "منصوبے کے حسابات سے ادائیگی", settledPurchase: "ادا شدہ خریداری",
  },
  bn: {
    breadcrumbContractors: "উপ-ঠিকাদার", breadcrumbStatement: "হিসাব বিবরণী",
    pageTitle: "ঠিকাদার হিসাব বিবরণী", pageSubtitle: "প্রকল্প, সময়কাল ও ভাষা নির্বাচন করে প্রিন্ট করুন",
    back: "ফিরে যান", print: "বিবরণী প্রিন্ট করুন",
    filterProject: "প্রকল্প", allProjects: "সকল প্রকল্প", fromDate: "তারিখ থেকে (ঐচ্ছিক)", toDate: "তারিখ পর্যন্ত (ঐচ্ছিক)", language: "বিবরণীর ভাষা",
    statementTitle: "উপ-ঠিকাদার হিসাব বিবরণী", issueDate: "প্রকাশের তারিখ:",
    contractor: "ঠিকাদার", tradeSpec: "পেশা / বিশেষত্ব", mobile: "মোবাইল", project: "প্রকল্প", agreementType: "চুক্তির ধরন", period: "সময়কাল",
    periodSince: "লেনদেন শুরু থেকে আজ পর্যন্ত", periodFrom: "থেকে", periodTo: "পর্যন্ত",
    allProjectsCount: (n) => `সকল প্রকল্প (${n})`,
    colDate: "তারিখ", colDesc: "বিবরণ", colDue: "পাওনা", colPaidDeduct: "পরিশোধিত / কর্তন", colBalance: "অবশিষ্ট ব্যালেন্স",
    openingBalance: (d) => `পূর্ববর্তী ব্যালেন্স (${d} এর আগে)`, noTransactions: "নির্বাচিত সময়কালে কোনো লেনদেন নেই", total: "মোট",
    projectLabel: (n) => `প্রকল্প: ${n}`,
    totalDue: "মোট পাওনা", totalPaidDeduct: "মোট পরিশোধ ও কর্তন", remainingBalance: "ঠিকাদারের অবশিষ্ট ব্যালেন্স",
    remainingBalanceProject: "প্রকল্পে ঠিকাদারের অবশিষ্ট ব্যালেন্স", noAgreements: "এই ঠিকাদারের কোনো চুক্তি নেই",
    itemsTitle: "পরিমাণ তালিকা অনুযায়ী চুক্তির আইটেম", colNum: "#", colItem: "আইটেম", colUnit: "একক",
    colAgreedQty: "সম্মত পরিমাণ", colUnitPrice: "একক মূল্য", colFinalQty: "চূড়ান্ত পরিমাণ", colTotal: "মোট",
    accountantSign: "হিসাবরক্ষক:", signDate: "স্বাক্ষর ও তারিখ", contractorSign: "উপ-ঠিকাদার (ব্যালেন্স দেখেছি ও অনুমোদন করেছি):",
    logo: "লোগো", taxNumber: "— ট্যাক্স নম্বর:", crNumber: "সিআর:",
    agreementValue: (type) => `চুক্তির মূল্য (${type})`, finalMeasureDiff: "চূড়ান্ত পরিমাপের পার্থক্য",
    extraWork: "অতিরিক্ত কাজ", invoice: "চালান", workPayment: "কাজের পেমেন্ট",
    projectAccountingPayment: "প্রকল্প হিসাব থেকে পেমেন্ট", settledPurchase: "পরিশোধিত ক্রয়",
  },
};
const STMT_ADJ_I18N = {
  ar: { delay: "خصم تأخير", qty: "تغيير بالكميات (حسب التمتير النهائي)", deduction: "خصم آخر", addition: "إضافة / زيادة" },
  en: { delay: "Delay deduction", qty: "Quantity change (per final measurement)", deduction: "Other deduction", addition: "Addition / increase" },
  ur: { delay: "تاخیر کٹوتی", qty: "مقدار میں تبدیلی (حتمی پیمائش کے مطابق)", deduction: "دیگر کٹوتی", addition: "اضافہ / زیادتی" },
  bn: { delay: "বিলম্ব কর্তন", qty: "পরিমাণ পরিবর্তন (চূড়ান্ত পরিমাপ অনুযায়ী)", deduction: "অন্যান্য কর্তন", addition: "সংযোজন / বৃদ্ধি" },
};
const STMT_AGTYPE_I18N = {
  ar: { unit: "بالمتر", lumpsum: "مقطوعية" }, en: { unit: "Unit rate", lumpsum: "Lump sum" },
  ur: { unit: "میٹر کے حساب سے", lumpsum: "ٹھیکہ (مقطوعیت)" }, bn: { unit: "মিটার অনুযায়ী", lumpsum: "লাম্পসাম (একমুঠো)" },
};
const STMT_PAYMETHOD_I18N = {
  en: { "تحويل بنكي": "Bank transfer", "كاش": "Cash", "شبكة": "Card (POS)", "سداد حكومي": "Government payment" },
  ur: { "تحويل بنكي": "بینک ٹرانسفر", "كاش": "نقد", "شبكة": "کارڈ (پی او ایس)", "سداد حكومي": "سرکاری ادائیگی" },
  bn: { "تحويل بنكي": "ব্যাংক ট্রান্সফার", "كاش": "নগদ", "شبكة": "কার্ড (পিওএস)", "سداد حكومي": "সরকারি পেমেন্ট" },
};
function stmtT(lang, key, ...args) {
  const entry = (STMT_I18N[lang] || STMT_I18N.ar)[key];
  return typeof entry === "function" ? entry(...args) : entry;
}
function stmtAdjLabel(lang, kind, fallback) { return (STMT_ADJ_I18N[lang] || {})[kind] || fallback || kind; }
function stmtAgreementType(lang, type) { return (STMT_AGTYPE_I18N[lang] || STMT_AGTYPE_I18N.ar)[type] || AGREEMENT_TYPE_LABELS[type] || type; }
function stmtPayMethod(lang, method) { return (STMT_PAYMETHOD_I18N[lang] || {})[method] || method; }
function stmtMoney(lang, n) {
  if (lang === "ar" || !lang) return fmtMoney(n);
  n = Number(n) || 0;
  const hasHalalas = Math.round(n * 100) % 100 !== 0;
  return n.toLocaleString("en-US", { minimumFractionDigits: hasHalalas ? 2 : 0, maximumFractionDigits: 2 }) + " SAR";
}
/* fmtDate العادية تُدرج علامات اتجاه عربية (RLM) بين أجزاء التاريخ فتظهر مقلوبة داخل حاوية LTR — نسخة بأرقام لاتينية بلا علامات اتجاه للغات غير العربية */
function stmtDate(lang, d) {
  if (lang === "ar" || !lang) return fmtDate(d);
  if (!d) return "-";
  try {
    let date;
    if (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
      const [y, m, day] = d.split("-").map(Number);
      date = new Date(y, m - 1, day);
    } else {
      date = new Date(d);
    }
    return date.toLocaleDateString("en-GB", { year: "numeric", month: "2-digit", day: "2-digit" });
  } catch (e) { return d; }
}

function contractorLedger(c, projectId, lang) {
  lang = lang || "ar";
  const ag = findContractorAgreement(c.id, projectId);
  if (!ag) return null;
  const t = contractorAgreementTotals(ag);
  const baseDate = (ag.createdAt || "").slice(0, 10);
  const rows = [];
  const add = (date, desc, credit, debit) => rows.push({ date: date || "", desc, credit: credit || 0, debit: debit || 0 });

  add(baseDate, stmtT(lang, "agreementValue", stmtAgreementType(lang, ag.type)), t.agreed, 0);
  if (Math.abs(t.measuredDiff) > 0.005) add(baseDate, stmtT(lang, "finalMeasureDiff"), t.measuredDiff > 0 ? t.measuredDiff : 0, t.measuredDiff < 0 ? -t.measuredDiff : 0);
  (ag.extras || []).forEach(x => add(x.date, `${stmtT(lang, "extraWork")}: ${x.title || ""}${x.vendor ? " — " + x.vendor : ""}${x.invoiceRef ? " (" + stmtT(lang, "invoice") + " " + x.invoiceRef + ")" : ""}`, contractorExtraAmount(x), 0));
  (ag.adjustments || []).forEach(a => add(a.date, `${stmtAdjLabel(lang, a.kind, a.label)}${a.note ? " — " + a.note : ""}`, a.amount > 0 ? a.amount : 0, a.amount < 0 ? -a.amount : 0));
  contractorPaymentsOf(c.id, projectId).forEach(e => add(e.date, `${stmtT(lang, "workPayment")}${e.paymentMethod ? " — " + stmtPayMethod(lang, e.paymentMethod) : ""}${e.note ? " — " + e.note : ""}`, 0, Number(e.amount) || 0));
  contractorProjectPaymentsOf(c.id, projectId).forEach(e => add(e.date, `${stmtT(lang, "projectAccountingPayment")}${e.paymentMethod ? " — " + stmtPayMethod(lang, e.paymentMethod) : ""}${e.note ? " — " + e.note : ""}`, 0, Number(e.amount) || 0));
  contractorPurchasePaymentsOf(c.id, projectId).forEach(p => add(p.date, `${stmtT(lang, "settledPurchase")}: ${p.label || ""}${p.note ? " — " + p.note : ""}`, 0, Number(p.amount) || 0));

  rows.forEach((r, i) => { r._i = i; });
  rows.sort((a, b) => (a.date || "").localeCompare(b.date || "") || a._i - b._i);
  return { ag, rows };
}

function contractorStatement(c, filter) {
  const lang = filter.lang || "ar";
  const projects = dbGet("projects", []);
  const sections = contractorAgreementsOf(c.id)
    .filter(a => filter.projectId === "all" || a.projectId === filter.projectId)
    .map(a => {
      const led = contractorLedger(c, a.projectId, lang);
      const before = led.rows.filter(r => filter.from && (r.date || "") < filter.from);
      const shown = led.rows.filter(r => (!filter.from || (r.date || "") >= filter.from) && (!filter.to || (r.date || "") <= filter.to));
      const opening = before.reduce((s, r) => s + r.credit - r.debit, 0);
      let bal = opening;
      const rows = shown.map(r => { bal += r.credit - r.debit; return Object.assign({}, r, { balance: bal }); });
      return {
        ag: a, project: projects.find(p => p.id === a.projectId) || { name: a.projectName || "مشروع محذوف" },
        opening, rows, credit: rows.reduce((s, r) => s + r.credit, 0), debit: rows.reduce((s, r) => s + r.debit, 0), closing: bal,
      };
    });
  const sum = (k) => sections.reduce((s, x) => s + x[k], 0);
  return { sections, opening: sum("opening"), credit: sum("credit"), debit: sum("debit"), closing: sum("closing") };
}

function renderContractorStatement(el) {
  const c = getContractors().find(x => x.id === CONTRACTOR_VIEW_ID);
  if (!c) { CONTRACTORS_VIEW = "list"; renderContractors(el); return; }
  const lang = CONTRACTOR_STMT.lang || "ar";
  const dir = (STMT_LANGS.find(l => l.key === lang) || STMT_LANGS[0]).dir;
  const T = (key, ...args) => stmtT(lang, key, ...args);
  const company = getCompanyProfile();
  const agreements = contractorAgreementsOf(c.id);
  const projects = dbGet("projects", []);
  if (CONTRACTOR_STMT.projectId !== "all" && !agreements.some(a => a.projectId === CONTRACTOR_STMT.projectId)) CONTRACTOR_STMT.projectId = "all";
  const st = contractorStatement(c, CONTRACTOR_STMT);
  const single = CONTRACTOR_STMT.projectId !== "all" && st.sections.length === 1 ? st.sections[0] : null;
  const periodLabel = CONTRACTOR_STMT.from || CONTRACTOR_STMT.to
    ? `${CONTRACTOR_STMT.from ? T("periodFrom") + " " + stmtDate(lang, CONTRACTOR_STMT.from) : ""} ${CONTRACTOR_STMT.to ? T("periodTo") + " " + stmtDate(lang, CONTRACTOR_STMT.to) : ""}`.trim()
    : T("periodSince");

  const ledgerTable = (sec) => `
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th style="width:110px">${T("colDate")}</th><th>${T("colDesc")}</th><th>${T("colDue")}</th><th>${T("colPaidDeduct")}</th><th>${T("colBalance")}</th></tr></thead>
        <tbody>
          ${(CONTRACTOR_STMT.from ? `<tr style="background:#f6f9fd"><td>-</td><td><strong>${T("openingBalance", stmtDate(lang, CONTRACTOR_STMT.from))}</strong></td><td></td><td></td><td><strong>${stmtMoney(lang, sec.opening)}</strong></td></tr>` : "")}
          ${sec.rows.length ? sec.rows.map(r => `
            <tr>
              <td>${r.date ? stmtDate(lang, r.date) : "-"}</td>
              <td>${r.desc}</td>
              <td>${r.credit ? stmtMoney(lang, r.credit) : ""}</td>
              <td>${r.debit ? stmtMoney(lang, r.debit) : ""}</td>
              <td><strong>${stmtMoney(lang, r.balance)}</strong></td>
            </tr>`).join("") : `<tr><td colspan="5" class="text-muted" style="text-align:center">${T("noTransactions")}</td></tr>`}
          <tr style="background:#f6f9fd;font-weight:800">
            <td colspan="2">${T("total")}</td><td>${stmtMoney(lang, sec.credit)}</td><td>${stmtMoney(lang, sec.debit)}</td><td>${stmtMoney(lang, sec.closing)}</td>
          </tr>
        </tbody>
      </table>
    </div>`;

  const itemsTable = (ag) => (ag.items || []).length ? `
    <h3 style="margin-top:18px">${T("itemsTitle")}</h3>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>${T("colNum")}</th><th>${T("colItem")}</th><th>${T("colUnit")}</th><th>${T("colAgreedQty")}</th>${ag.type === "unit" ? `<th>${T("colUnitPrice")}</th><th>${T("colFinalQty")}</th><th>${T("colTotal")}</th>` : ""}</tr></thead>
        <tbody>
          ${ag.items.map((it, i) => `<tr><td>${i + 1}</td><td>${it.name}</td><td>${it.unit || "-"}</td><td>${Number(it.qty) || 0}</td>
            ${ag.type === "unit" ? `<td>${stmtMoney(lang, it.unitPrice)}</td><td>${contractorItemFinalQty(it)}</td><td>${stmtMoney(lang, contractorItemFinalQty(it) * (Number(it.unitPrice) || 0))}</td>` : ""}</tr>`).join("")}
        </tbody>
      </table>
    </div>` : "";

  el.innerHTML = `
    <div class="breadcrumb no-print"><a id="bcCons">${T("breadcrumbContractors")}</a>${svgIcon("chevron-left")}<a id="bcCon">${c.name}</a>${svgIcon("chevron-left")}<span>${T("breadcrumbStatement")}</span></div>
    <div class="section-title-row no-print">
      <div><h2>${T("pageTitle")}</h2><p>${T("pageSubtitle")}</p></div>
      <div class="flex gap">
        <button class="btn" id="stBack">${T("back")}</button>
        <button class="btn primary" id="stPrint">${svgIcon("printer")} ${T("print")}</button>
      </div>
    </div>

    <div class="card no-print">
      <div class="grid cols-4">
        <div class="field" style="margin-bottom:0"><label>${T("filterProject")}</label>
          <select id="st_project">
            <option value="all" ${CONTRACTOR_STMT.projectId === "all" ? "selected" : ""}>${T("allProjects")}</option>
            ${agreements.map(a => `<option value="${a.projectId}" ${CONTRACTOR_STMT.projectId === a.projectId ? "selected" : ""}>${(projects.find(p => p.id === a.projectId) || {}).name || a.projectName || "-"}</option>`).join("")}
          </select>
        </div>
        <div class="field" style="margin-bottom:0"><label>${T("fromDate")}</label><input type="date" id="st_from" value="${CONTRACTOR_STMT.from}"></div>
        <div class="field" style="margin-bottom:0"><label>${T("toDate")}</label><input type="date" id="st_to" value="${CONTRACTOR_STMT.to}"></div>
        <div class="field" style="margin-bottom:0"><label>${T("language")}</label>
          <select id="st_lang">${STMT_LANGS.map(l => `<option value="${l.key}" ${lang === l.key ? "selected" : ""}>${l.label}</option>`).join("")}</select>
        </div>
      </div>
    </div>

    <div class="card statement-sheet" dir="${dir}">
      <div class="quote-header-card" style="margin-bottom:18px;padding-bottom:14px;border-bottom:1px solid var(--border)">
        <div class="quote-logo-box">${company.logo ? `<img src="${company.logo}">` : T("logo")}</div>
        <div style="flex:1">
          <h2>${company.name || ""}${company.taxNumber ? ` <span class="tax-inline">${T("taxNumber")} ${company.taxNumber}</span>` : ""}</h2>
          ${company.address ? `<div class="cline">${company.address}</div>` : ""}
          ${(company.phone || company.email) ? `<div class="cline">${[company.phone, company.email].filter(Boolean).join(" — ")}</div>` : ""}
          ${company.crNumber ? `<div class="cline">${T("crNumber")} ${company.crNumber}</div>` : ""}
        </div>
        <div style="text-align:${dir === "rtl" ? "left" : "right"}">
          <div style="font-size:20px;font-weight:800">${T("statementTitle")}</div>
          <div class="text-muted" style="font-size:12.5px">${T("issueDate")} ${stmtDate(lang, todayISO())}</div>
        </div>
      </div>

      <div class="grid cols-2" style="margin-bottom:14px">
        <div>
          <div class="kv-row"><span class="k">${T("contractor")}</span><span class="v">${c.name}</span></div>
          <div class="kv-row"><span class="k">${T("tradeSpec")}</span><span class="v">${c.trade || "-"}</span></div>
          <div class="kv-row"><span class="k">${T("mobile")}</span><span class="v">${c.phone || "-"}</span></div>
        </div>
        <div>
          <div class="kv-row"><span class="k">${T("project")}</span><span class="v">${single ? single.project.name : T("allProjectsCount", st.sections.length)}</span></div>
          ${single ? `<div class="kv-row"><span class="k">${T("agreementType")}</span><span class="v">${stmtAgreementType(lang, single.ag.type)}</span></div>` : ""}
          <div class="kv-row"><span class="k">${T("period")}</span><span class="v">${periodLabel}</span></div>
        </div>
      </div>

      ${st.sections.length ? st.sections.map(sec => `
        ${single ? "" : `<h3 style="margin-top:20px">${T("projectLabel", sec.project.name)} <span class="badge gray">${stmtAgreementType(lang, sec.ag.type)}</span></h3>`}
        ${ledgerTable(sec)}
      `).join("") : `<div class="empty-state">${T("noAgreements")}</div>`}

      ${st.sections.length > 1 ? `
      <div class="grid cols-3" style="margin-top:18px">
        <div class="stat-card"><div class="label">${T("totalDue")}</div><div class="value">${stmtMoney(lang, st.credit)}</div></div>
        <div class="stat-card"><div class="label">${T("totalPaidDeduct")}</div><div class="value success">${stmtMoney(lang, st.debit)}</div></div>
        <div class="stat-card"><div class="label">${T("remainingBalance")}</div><div class="value ${st.closing > 0 ? "warning" : "success"}">${stmtMoney(lang, st.closing)}</div></div>
      </div>` : (st.sections.length === 1 ? `
      <div class="grand-total-box"><div>${single ? T("remainingBalanceProject") : T("remainingBalance")}</div><div class="num">${stmtMoney(lang, st.closing)}</div></div>` : "")}

      ${single ? itemsTable(single.ag) : ""}

      <div class="grid cols-2" style="margin-top:40px;font-size:13px">
        <div>${T("accountantSign")} ...............................<div class="text-muted" style="font-size:11.5px;margin-top:4px">${T("signDate")}</div></div>
        <div>${T("contractorSign")} ...............................<div class="text-muted" style="font-size:11.5px;margin-top:4px">${T("signDate")}</div></div>
      </div>
    </div>
  `;

  const toAccount = () => { CONTRACTORS_VIEW = "account"; renderContractors(el); window.scrollTo(0, 0); };
  document.getElementById("bcCons").onclick = () => { CONTRACTORS_VIEW = "list"; renderContractors(el); };
  document.getElementById("bcCon").onclick = toAccount;
  document.getElementById("stBack").onclick = toAccount;
  document.getElementById("stPrint").onclick = () => window.print();
  document.getElementById("st_project").onchange = (e) => { CONTRACTOR_STMT.projectId = e.target.value; renderContractorStatement(el); };
  document.getElementById("st_from").onchange = (e) => { CONTRACTOR_STMT.from = e.target.value; renderContractorStatement(el); };
  document.getElementById("st_to").onchange = (e) => { CONTRACTOR_STMT.to = e.target.value; renderContractorStatement(el); };
  document.getElementById("st_lang").onchange = (e) => { CONTRACTOR_STMT.lang = e.target.value; renderContractorStatement(el); };
}

function openContractorStatement(el, contractorId, projectId) {
  CONTRACTOR_VIEW_ID = contractorId;
  CONTRACTOR_STMT = { projectId: projectId || "all", from: "", to: "", lang: "ar" };
  CONTRACTORS_VIEW = "statement";
  renderContractors(el);
  window.scrollTo(0, 0);
}
