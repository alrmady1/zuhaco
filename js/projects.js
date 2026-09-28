/* =========================================================
   المشاريع
   ========================================================= */

let PROJECTS_VIEW = "list"; // list | builder | detail
let DRAFT_PROJECT = null;
let PROJECT_VIEW_ID = null;
let PROJECT_CLIENT_SEARCH = "";
let PROJECT_SHOW_ADD_CLIENT = false;

const PROJECT_STATUSES = ["قيد التنفيذ", "مكتمل", "متوقف"];

function newDraftProject() {
  return {
    id: null,
    name: "",
    clientId: "", client: "",
    location: "",
    district: "",
    projectType: "construction",
    startDate: "", endDate: "",
    status: "قيد التنفيذ",
    completion: 0,
    contractId: "",
    externalContractFile: null,
    approvedQuoteId: "",
    externalBoqFile: null,
    teamUserIds: [],
    planFiles: [],
    notes: "",
  };
}

function projectTypeLabel(key) {
  const label = (CONTRACT_TYPES.find(t => t.key === key) || {}).label || key || "-";
  return label.replace("عقد ", "");
}

/* ---------- الأعمال الإضافية (خارج العقد) ---------- */
const EXTRA_KINDS = [
  { key: "extra_qty", label: "كمية إضافية لبند بالعقد", section: "كميات إضافية لبنود العقد" },
  { key: "new_item", label: "بند جديد", section: "بنود جديدة غير واردة في العقد" },
  { key: "invoice", label: "فاتورة إضافية", section: "فواتير إضافية" },
  { key: "deduction", label: "بند غير منفذ (خصم)", section: "بنود غير منفذة (مخصومة من العقد)" },
];

function extraKindInfo(key) {
  return EXTRA_KINDS.find(k => k.key === key) || EXTRA_KINDS[1];
}

// القيمة المطلقة للبند (الكمية × السعر)
function extraWorkTotal(w) {
  return (Number(w.qty) || 0) * (Number(w.unitPrice) || 0);
}

// القيمة بالإشارة: البنود غير المنفذة تُخصم من قيمة المشروع
function extraWorkSigned(w) {
  return w.kind === "deduction" ? -extraWorkTotal(w) : extraWorkTotal(w);
}

function signedMoney(w) {
  return (w.kind === "deduction" ? "- " : "") + fmtMoney(extraWorkTotal(w));
}

function projectExtrasTotals(p) {
  const works = p.extraWorks || [];
  const additions = works.filter(w => w.kind !== "deduction").reduce((s, w) => s + extraWorkTotal(w), 0);
  const deductions = works.filter(w => w.kind === "deduction").reduce((s, w) => s + extraWorkTotal(w), 0);
  const net = additions - deductions;
  const vat = net * VAT_RATE;
  return { additions, deductions, subtotal: net, vat, total: net + vat };
}

// بنود العقد (من عرض السعر المعتمد) لاقتراحها عند إضافة كمية إضافية
function projectContractItems(p) {
  const quote = p.approvedQuoteId ? dbGet("quotes", []).find(q => q.id === p.approvedQuoteId) : null;
  if (!quote) return [];
  return quote.categories.flatMap(c => c.items.map(it => ({ name: it.name, unit: it.unit || "", price: itemUnitPrice(it) })));
}

function openProjectExtraModal(p, existing, onSaved) {
  const isEdit = !!existing;
  const w = existing || { kind: "extra_qty", name: "", unit: "", qty: 1, unitPrice: "", date: todayISO(), invoiceNumber: "", notes: "" };
  const contractItems = projectContractItems(p);
  let kind = w.kind;

  const html = `
    <div class="modal-head"><h3>${isEdit ? "تعديل عمل إضافي" : "إضافة عمل إضافي"}</h3><button class="modal-close" id="mClose">×</button></div>
    <div class="field"><label>نوع البند</label>
      <div class="pill-group" id="ew_kinds">${EXTRA_KINDS.map(k => `<div class="pill ${kind === k.key ? "active" : ""}" data-ekind="${k.key}">${k.label}</div>`).join("")}</div>
    </div>
    <div class="field"><label id="ew_nameLabel">البند</label>
      <input id="ew_name" list="ew_contractItems" value="${escHtml(w.name)}" autocomplete="off">
      <datalist id="ew_contractItems">${contractItems.map(i => `<option value="${escHtml(i.name)}"></option>`).join("")}</datalist>
      <div class="hint" id="ew_hint"></div>
    </div>
    <div class="field" id="ew_invoiceWrap"><label>رقم الفاتورة / المرجع (اختياري)</label><input id="ew_invoiceNumber" value="${escHtml(w.invoiceNumber || "")}"></div>
    <div class="grid cols-3" id="ew_qtyRow">
      <div class="field"><label>الكمية</label><input type="number" min="0" step="0.01" id="ew_qty" value="${w.qty}"></div>
      <div class="field"><label>الوحدة</label><input id="ew_unit" value="${escHtml(w.unit || "")}" placeholder="م² / عدد / مقطوعية"></div>
      <div class="field"><label>سعر الوحدة (ر.س)</label><input type="number" min="0" step="0.01" id="ew_price" value="${w.unitPrice}"></div>
    </div>
    <div class="field" id="ew_amountWrap"><label>مبلغ الفاتورة (ر.س) — غير شامل الضريبة</label><input type="number" min="0" step="0.01" id="ew_amount" value="${w.kind === "invoice" ? w.unitPrice : ""}"></div>
    <div class="grid cols-2">
      <div class="field"><label>التاريخ</label><input type="date" id="ew_date" value="${w.date || todayISO()}"></div>
      <div class="field"><label>الإجمالي</label><div id="ew_total" style="padding:10px 0;font-weight:800"></div></div>
    </div>
    <div class="field"><label>ملاحظات (اختياري)</label><textarea id="ew_notes">${escHtml(w.notes || "")}</textarea></div>
    <div class="flex gap"><button class="btn primary" id="ew_save">حفظ</button><button class="btn" id="ew_cancel">إلغاء</button></div>
  `;
  const ov = openModalShell(html);
  const $ = (id) => ov.querySelector("#" + id);
  $("mClose").onclick = closeModal;
  $("ew_cancel").onclick = closeModal;

  function currentPrice() { return kind === "invoice" ? Number($("ew_amount").value) || 0 : Number($("ew_price").value) || 0; }
  function currentQty() { return kind === "invoice" ? 1 : Number($("ew_qty").value) || 0; }
  function refreshTotal() { $("ew_total").textContent = fmtMoney(currentQty() * currentPrice()); }

  function applyKind() {
    ov.querySelectorAll("[data-ekind]").forEach(p => p.classList.toggle("active", p.dataset.ekind === kind));
    const isInvoice = kind === "invoice";
    const fromContract = kind === "extra_qty" || kind === "deduction";
    $("ew_nameLabel").textContent = isInvoice ? "وصف الفاتورة" : kind === "extra_qty" ? "البند من العقد (اختر من القائمة أو اكتب اسمه)" : kind === "deduction" ? "البند غير المنفذ من العقد (اختر من القائمة أو اكتب اسمه)" : "اسم البند الجديد";
    $("ew_hint").textContent = fromContract ? (contractItems.length ? "تظهر بنود العرض المعتمد للمشروع كاقتراحات، ويُملأ السعر والوحدة تلقائياً عند اختيار بند." + (kind === "deduction" ? " الكمية هنا هي الكمية التي لم تُنفَّذ، وتُخصم من قيمة المشروع." : "") : "لا يوجد عرض سعر معتمد للمشروع — اكتب اسم البند يدوياً.") : "";
    $("ew_invoiceWrap").style.display = isInvoice ? "block" : "none";
    $("ew_qtyRow").style.display = isInvoice ? "none" : "grid";
    $("ew_amountWrap").style.display = isInvoice ? "block" : "none";
    refreshTotal();
  }
  applyKind();
  ov.querySelectorAll("[data-ekind]").forEach(p => p.onclick = () => { kind = p.dataset.ekind; applyKind(); });
  ["ew_qty", "ew_price", "ew_amount"].forEach(id => $(id).oninput = refreshTotal);

  $("ew_name").onchange = () => {
    if (kind !== "extra_qty" && kind !== "deduction") return;
    const item = contractItems.find(i => i.name === $("ew_name").value.trim());
    if (item) { $("ew_unit").value = item.unit; $("ew_price").value = item.price; refreshTotal(); }
  };

  $("ew_save").onclick = () => {
    const name = $("ew_name").value.trim();
    const price = currentPrice();
    if (!name) { toast("يرجى إدخال اسم البند"); return; }
    if (price <= 0) { toast("يرجى إدخال سعر أو مبلغ صحيح"); return; }
    if (kind !== "invoice" && currentQty() <= 0) { toast("يرجى إدخال كمية صحيحة"); return; }
    const data = {
      kind, name, qty: currentQty(), unitPrice: price,
      unit: kind === "invoice" ? "فاتورة" : $("ew_unit").value.trim(),
      invoiceNumber: kind === "invoice" ? $("ew_invoiceNumber").value.trim() : "",
      date: $("ew_date").value || todayISO(), notes: $("ew_notes").value.trim(),
    };
    closeModal();
    onSaved(data);
  };
}

function bindProjectExtras(el, p, persist, rerender) {
  const addBtn = document.getElementById("addExtraWork");
  if (addBtn) addBtn.onclick = () => openProjectExtraModal(p, null, (data) => {
    p.extraWorks = p.extraWorks || [];
    p.extraWorks.push(Object.assign({ id: uid("ew") }, data));
    persist();
    logActivity(`تم إضافة عمل إضافي "${data.name}" بقيمة ${fmtMoney(data.qty * data.unitPrice)} على المشروع "${p.name}"`);
    toast("تمت إضافة العمل الإضافي");
    rerender();
  });
  el.querySelectorAll("[data-editextra]").forEach(b => b.onclick = () => {
    const w = (p.extraWorks || []).find(x => x.id === b.dataset.editextra);
    if (!w) return;
    openProjectExtraModal(p, w, (data) => {
      Object.assign(w, data);
      persist();
      logActivity(`تم تعديل عمل إضافي "${w.name}" على المشروع "${p.name}"`);
      toast("تم حفظ التعديل");
      rerender();
    });
  });
  el.querySelectorAll("[data-delextra]").forEach(b => b.onclick = () => {
    const w = (p.extraWorks || []).find(x => x.id === b.dataset.delextra);
    if (!w || !confirm(`حذف العمل الإضافي "${w.name}"؟`)) return;
    p.extraWorks = p.extraWorks.filter(x => x.id !== w.id);
    persist();
    logActivity(`تم حذف عمل إضافي "${w.name}" من المشروع "${p.name}"`);
    rerender();
  });
  const printBtn = document.getElementById("openExtrasPrint");
  if (printBtn) printBtn.onclick = () => { PROJECTS_VIEW = "extras"; router(); };
}

function projectExtrasCardHtml(p, contract) {
  const works = p.extraWorks || [];
  const t = projectExtrasTotals(p);
  return `
    <div class="card">
      <div class="flex between" style="align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px">
        <h3 class="mt-0">الأعمال الإضافية والبنود غير المنفذة (التمرير النهائي) <span class="badge gray">${works.length}</span></h3>
        <div class="flex gap">
          ${works.length ? `<button class="btn sm" id="openExtrasPrint">${svgIcon("printer")} صفحة الطباعة</button>` : ""}
          <button class="btn sm primary" id="addExtraWork">+ إضافة بند</button>
        </div>
      </div>
      <p class="text-muted" style="font-size:12px;margin-top:-4px">كل ما لم يُحسب في العقد (كميات إضافية لبنود العقد، بنود جديدة، فواتير إضافية)، وكذلك البنود التي لم تُنفَّذ وتُخصم من قيمة المشروع — لتكون الصفحة الكشف الختامي للمشروع.</p>
      ${works.length ? `
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>#</th><th>النوع</th><th>البند</th><th>الكمية</th><th>الوحدة</th><th>سعر الوحدة</th><th>الإجمالي</th><th>التاريخ</th><th></th></tr></thead>
          <tbody>
            ${works.map((w, i) => `
              <tr>
                <td>${i + 1}</td>
                <td><span class="badge ${w.kind === "invoice" ? "orange" : w.kind === "extra_qty" ? "blue" : w.kind === "deduction" ? "red" : "gray"}">${extraKindInfo(w.kind).label}</span></td>
                <td>${escHtml(w.name)}${w.invoiceNumber ? ` <span class="text-muted" style="font-size:11px">(${escHtml(w.invoiceNumber)})</span>` : ""}</td>
                <td>${w.kind === "invoice" ? "-" : w.qty}</td>
                <td>${escHtml(w.unit || "-")}</td>
                <td>${fmtMoney(w.unitPrice)}</td>
                <td><strong style="${w.kind === "deduction" ? "color:var(--danger)" : ""}">${signedMoney(w)}</strong></td>
                <td>${fmtDate(w.date)}</td>
                <td style="white-space:nowrap">
                  <button class="btn-icon" data-editextra="${w.id}" title="تعديل">${ICON_EDIT}</button>
                  <button class="btn-icon danger" data-delextra="${w.id}" title="حذف">${ICON_DELETE}</button>
                </td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>
      <div class="grid cols-4" style="margin-top:14px">
        <div class="stat-card"><div class="label">إجمالي الأعمال الإضافية</div><div class="value">${fmtMoney(t.additions)}</div></div>
        <div class="stat-card"><div class="label">إجمالي البنود غير المنفذة (خصم)</div><div class="value danger">- ${fmtMoney(t.deductions)}</div></div>
        <div class="stat-card"><div class="label">صافي التغيير (قبل الضريبة)</div><div class="value ${t.subtotal >= 0 ? "" : "danger"}">${fmtMoney(t.subtotal)}</div></div>
        <div class="stat-card"><div class="label">الصافي شامل الضريبة (15%)</div><div class="value warning">${fmtMoney(t.total)}</div></div>
      </div>
      <div class="stat-card" style="margin-top:12px;max-width:380px"><div class="label">${contract ? "القيمة النهائية للمشروع (العقد ± التغيير) — قبل الضريبة" : "قيمة العقد"}</div><div class="value success">${contract ? fmtMoney(Number(contract.totalAmount || 0) + t.subtotal) : "-"}</div><div class="text-muted" style="font-size:11px;margin-top:4px">${contract ? "شاملة الضريبة: " + fmtMoney((Number(contract.totalAmount || 0) + t.subtotal) * (1 + VAT_RATE)) : "لا يوجد عقد مرتبط"}</div></div>` : `<p class="text-muted" style="font-size:13px">لا توجد أعمال إضافية أو بنود غير منفذة مسجلة على هذا المشروع</p>`}
    </div>
  `;
}

/* صفحة مستقلة للأعمال الإضافية قابلة للطباعة */
function renderProjectExtras(el) {
  const p = dbGet("projects", []).find(x => x.id === PROJECT_VIEW_ID);
  if (!p) { PROJECTS_VIEW = "list"; router(); return; }
  const client = p.clientId ? dbGet("clients", []).find(c => c.id === p.clientId) : null;
  const contract = p.contractId ? dbGet("contracts", []).find(c => c.id === p.contractId) : null;
  const works = p.extraWorks || [];
  const t = projectExtrasTotals(p);
  let n = 0;

  const sectionsHtml = EXTRA_KINDS.map(k => {
    const rows = works.filter(w => w.kind === k.key);
    if (!rows.length) return "";
    const sectionTotal = rows.reduce((s, w) => s + extraWorkSigned(w), 0);
    return `
      <tr class="cat-header-row"><td colspan="7"><strong>${k.section}</strong></td></tr>
      ${rows.map(w => `
        <tr>
          <td>${++n}</td>
          <td>${escHtml(w.name)}${w.invoiceNumber ? `<div class="text-muted" style="font-size:11px">فاتورة/مرجع: ${escHtml(w.invoiceNumber)}</div>` : ""}${w.notes ? `<div class="text-muted" style="font-size:11px">${escHtml(w.notes)}</div>` : ""}</td>
          <td>${w.kind === "invoice" ? "-" : w.qty}</td>
          <td>${escHtml(w.unit || "-")}</td>
          <td>${fmtMoney(w.unitPrice)}</td>
          <td><strong style="${w.kind === "deduction" ? "color:var(--danger)" : ""}">${signedMoney(w)}</strong></td>
          <td>${fmtDate(w.date)}</td>
        </tr>`).join("")}
      <tr><td colspan="5" style="text-align:left;font-weight:700">إجمالي ${k.section}</td><td colspan="2"><strong style="${sectionTotal < 0 ? "color:var(--danger)" : ""}">${sectionTotal < 0 ? "- " : ""}${fmtMoney(Math.abs(sectionTotal))}</strong></td></tr>
    `;
  }).join("");

  el.innerHTML = `
    <div class="breadcrumb no-print"><a id="bcProjects">المشاريع</a>${svgIcon("chevron-left")}<a id="bcProject">${escHtml(p.name)}</a>${svgIcon("chevron-left")}<span>الأعمال الإضافية</span></div>
    <div class="section-title-row no-print">
      <div><h2>الكشف الختامي — ${escHtml(p.name)}</h2><p>الأعمال الإضافية والبنود غير المنفذة، جاهز للطباعة</p></div>
      <div class="flex gap">
        <button class="btn" id="extrasBack">رجوع للمشروع</button>
        <button class="btn primary" id="extrasPrint">${svgIcon("printer")} طباعة</button>
      </div>
    </div>

    ${companyHeaderHtml()}

    <div class="card">
      <h2 style="text-align:center;margin:0 0 12px">الكشف الختامي للمشروع — الأعمال الإضافية والبنود غير المنفذة</h2>
      <div class="grid cols-2">
        <div>
          <div class="kv-row"><span class="k">المشروع</span><span class="v">${escHtml(p.name)}</span></div>
          <div class="kv-row"><span class="k">العميل</span><span class="v">${escHtml(client ? client.name : (p.client || "-"))}</span></div>
          <div class="kv-row"><span class="k">الموقع</span><span class="v">${p.location ? (/^https?:\/\//i.test(p.location) ? "رابط خرائط جوجل" : escHtml(p.location)) : "-"}</span></div>
        </div>
        <div>
          <div class="kv-row"><span class="k">تاريخ الكشف</span><span class="v">${fmtDate(todayISO())}</span></div>
          <div class="kv-row"><span class="k">قيمة العقد الأصلي (قبل الضريبة)</span><span class="v">${contract ? fmtMoney(contract.totalAmount) : "-"}</span></div>
          <div class="kv-row"><span class="k">عدد البنود الإضافية</span><span class="v">${works.length}</span></div>
        </div>
      </div>
    </div>

    <div class="card">
      ${works.length ? `
      <div class="table-wrap">
        <table class="data-table quote-final-table">
          <thead><tr><th>#</th><th>البند</th><th>الكمية</th><th>الوحدة</th><th>سعر الوحدة</th><th>الإجمالي</th><th>التاريخ</th></tr></thead>
          <tbody>${sectionsHtml}</tbody>
        </table>
      </div>
      <div class="grand-total-box" style="margin-top:14px;flex-direction:column;align-items:stretch;gap:6px">
        <div class="flex between"><span>إجمالي الأعمال الإضافية</span><strong>${fmtMoney(t.additions)}</strong></div>
        <div class="flex between"><span>إجمالي البنود غير المنفذة (مخصومة)</span><strong style="color:var(--danger)">- ${fmtMoney(t.deductions)}</strong></div>
        <div class="flex between"><span>صافي التغيير على العقد (قبل الضريبة)</span><strong>${t.subtotal < 0 ? "- " : ""}${fmtMoney(Math.abs(t.subtotal))}</strong></div>
        <div class="flex between"><span>ضريبة القيمة المضافة (15%)</span><strong>${t.vat < 0 ? "- " : ""}${fmtMoney(Math.abs(t.vat))}</strong></div>
        <div class="flex between" style="border-top:1px solid rgba(0,0,0,.12);padding-top:8px"><span>صافي التغيير شامل الضريبة</span><div class="num">${t.total < 0 ? "- " : ""}${fmtMoney(Math.abs(t.total))}</div></div>
      </div>
      ${contract ? `
      <div class="grand-total-box" style="margin-top:12px;flex-direction:column;align-items:stretch;gap:6px">
        <div class="flex between"><span>قيمة العقد الأصلي (قبل الضريبة)</span><strong>${fmtMoney(contract.totalAmount)}</strong></div>
        <div class="flex between"><span>± صافي التغيير</span><strong>${t.subtotal < 0 ? "- " : "+ "}${fmtMoney(Math.abs(t.subtotal))}</strong></div>
        <div class="flex between" style="border-top:1px solid rgba(0,0,0,.12);padding-top:8px"><span>القيمة النهائية للمشروع (قبل الضريبة)</span><div class="num">${fmtMoney(Number(contract.totalAmount || 0) + t.subtotal)}</div></div>
        <div class="flex between"><span>القيمة النهائية شاملة الضريبة (15%)</span><strong>${fmtMoney((Number(contract.totalAmount || 0) + t.subtotal) * (1 + VAT_RATE))}</strong></div>
      </div>` : ""}
      <div style="display:flex;justify-content:space-between;margin-top:46px;color:var(--text-muted);font-size:13px"><div>توقيع الطرف الأول (المقاول): ......................</div><div>توقيع الطرف الثاني (المالك): ......................</div></div>` : `<div class="empty-state">لا توجد أعمال إضافية مسجلة</div>`}
    </div>
  `;
  document.getElementById("bcProjects").onclick = () => { PROJECTS_VIEW = "list"; router(); };
  const backToProject = () => { PROJECTS_VIEW = "detail"; router(); };
  document.getElementById("bcProject").onclick = backToProject;
  document.getElementById("extrasBack").onclick = backToProject;
  document.getElementById("extrasPrint").onclick = () => window.print();
}

function renderProjects(el) {
  if (PROJECTS_VIEW === "builder") return renderProjectBuilder(el);
  if (PROJECTS_VIEW === "extras") return renderProjectExtras(el);
  if (PROJECTS_VIEW === "detail") return renderProjectDetail(el);
  renderProjectsList(el);
}

function renderProjectsList(el) {
  const projects = dbGet("projects", []).slice().sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  const role = (getCurrentUser() || {}).role;
  const canAddProject = hasPermission(role, "projects_add");
  const canDeleteProject = hasPermission(role, "projects_delete");
  el.innerHTML = `
    <div class="section-title-row">
      <div><h2>المشاريع</h2><p>إدارة مشاريع المؤسسة وربطها بالعملاء والعقود وجداول الكميات المعتمدة</p></div>
      ${canAddProject ? `<button class="btn primary" id="newProjectBtn">${svgIcon("plus")} إضافة مشروع</button>` : ""}
    </div>
    ${projects.length ? projects.map(p => `
      <div class="contract-row" data-openproj="${p.id}">
        <div class="contract-row-icon">${svgIcon("building", 20)}</div>
        <div class="contract-row-info">
          <div class="contract-row-title">${p.name}</div>
          <div class="contract-row-sub">${p.client || "بدون عميل"} · ${projectTypeLabel(p.projectType)} · ${locationDisplay(p.location)} · ${statusBadge2(p.status)} ${delayedBadgeHtml(p)}</div>
        </div>
        <div style="min-width:110px">
          <div class="progress-track"><div class="progress-fill ${p.completion >= 80 ? "success" : p.completion < 40 ? "warning" : ""}" style="width:${p.completion || 0}%"></div></div>
          <div class="text-muted" style="font-size:11px;margin-top:3px">${p.completion || 0}% مكتمل</div>
        </div>
        <div class="contract-row-actions no-print">
          <button class="btn-icon" data-openproj="${p.id}" title="فتح">${ICON_VIEW}</button>
          ${canDeleteProject ? `<button class="btn-icon danger" data-delproj="${p.id}" title="حذف">${ICON_DELETE}</button>` : ""}
        </div>
      </div>`).join("") : `<div class="card empty-state"><div class="ic">${svgIcon("building", 40)}</div>لا توجد مشاريع بعد</div>`}
  `;

  const newProjectBtn = document.getElementById("newProjectBtn");
  if (newProjectBtn) newProjectBtn.onclick = () => {
    DRAFT_PROJECT = newDraftProject();
    PROJECT_CLIENT_SEARCH = ""; PROJECT_SHOW_ADD_CLIENT = false;
    PROJECTS_VIEW = "builder"; router();
  };
  el.querySelectorAll("[data-openproj]").forEach(x => x.onclick = () => { PROJECT_VIEW_ID = x.dataset.openproj; PROJECTS_VIEW = "detail"; router(); });
  el.querySelectorAll("[data-delproj]").forEach(x => x.onclick = (e) => {
    e.stopPropagation();
    if (!confirm("حذف هذا المشروع؟")) return;
    const target = projects.find(p => p.id === x.dataset.delproj);
    dbSet("projects", dbGet("projects", []).filter(p => p.id !== x.dataset.delproj));
    logActivity(`تم حذف المشروع "${target ? target.name : ""}"`);
    router();
  });
}

function computeContractPaymentsProgress(contract, received) {
  if (!contract || !contract.payments || !contract.payments.length) return null;
  const total = Number(contract.totalAmount) || 0;
  let cumulative = 0;
  let remainingCount = 0;
  contract.payments.forEach(pmt => {
    cumulative += total * (Number(pmt.percent) || 0) / 100;
    if (cumulative > received + 0.01) remainingCount++;
  });
  return {
    remainingAmount: Math.max(0, total - received),
    remainingCount,
    totalPayments: contract.payments.length,
  };
}

function statusBadge2(status) {
  const map = { "قيد التنفيذ": "orange", "مكتمل": "green", "متوقف": "red" };
  return `<span class="badge ${map[status] || "gray"}">${status || "قيد التنفيذ"}</span>`;
}

const DEADLINE_WARNING_RATIO = 0.20; // يُنبَّه عندما تقل المدة المتبقية عن 20% من إجمالي مدة المشروع

// تاريخ الانتهاء الفعلي للمشروع: يُفضَّل تاريخ انتهاء العقد المرتبط (بداية العقد + مدة التنفيذ
// بالأيام) إن وُجد، وإلا يُستخدم تاريخ الانتهاء المُدخل يدوياً في المشروع نفسه.
function projectEffectiveEndDate(p) {
  if (p && p.contractId) {
    const contract = dbGet("contracts", []).find(c => c.id === p.contractId);
    if (contract) {
      const end = contract.endDate || (typeof contractEndDate === "function" ? contractEndDate(contract) : "");
      if (end) return end;
    }
  }
  return (p && p.endDate) || "";
}

// تاريخ بداية المشروع الفعلي (يُفضَّل تاريخ بداية العقد المرتبط إن وُجد)
function projectEffectiveStartDate(p) {
  if (p && p.contractId) {
    const contract = dbGet("contracts", []).find(c => c.id === p.contractId);
    if (contract && contract.startDate) return contract.startDate;
  }
  return (p && p.startDate) || "";
}

// إجمالي مدة المشروع بالأيام (من تاريخ البداية الفعلي إلى تاريخ النهاية الفعلي)
function projectTotalDurationDays(p) {
  const start = projectEffectiveStartDate(p);
  const end = projectEffectiveEndDate(p);
  if (!start || !end) return null;
  const diff = Math.round((new Date(end) - new Date(start)) / 86400000);
  return diff > 0 ? diff : null;
}

function projectDaysRemaining(p) {
  const end = projectEffectiveEndDate(p);
  if (!end) return null;
  if (p.status === "مكتمل" || (p.completion || 0) >= 100) return null;
  return Math.round((new Date(end) - new Date(todayISO())) / 86400000);
}

// حالة موعد المشروع: 'delayed' (تجاوز الموعد) | 'warning' (المدة المتبقية أقل من 20% من الإجمالي) | 'ok' | null
function projectDeadlineStatus(p) {
  const daysRemaining = projectDaysRemaining(p);
  if (daysRemaining === null) return null;
  if (daysRemaining < 0) return { state: "delayed", daysRemaining };
  const totalDays = projectTotalDurationDays(p);
  if (totalDays && daysRemaining / totalDays < DEADLINE_WARNING_RATIO) {
    return { state: "warning", daysRemaining, totalDays };
  }
  return { state: "ok", daysRemaining };
}

function isProjectDelayed(p) {
  const s = projectDeadlineStatus(p);
  return !!s && s.state === "delayed";
}

function delayedBadgeHtml(p) {
  const s = projectDeadlineStatus(p);
  if (!s) return "";
  if (s.state === "delayed") return `<span class="badge red">${svgIcon("alert", 15)} متأخر عن الموعد المحدد (${Math.abs(s.daysRemaining)} يوم)</span>`;
  if (s.state === "warning") return `<span class="badge orange">${svgIcon("clock", 15)} تبقى ${s.daysRemaining} يوم على الموعد المحدد</span>`;
  return "";
}

// شريط توضيحي أوسع (لصفحة تفاصيل/إنجاز المشروع) يوضح عدد الأيام المتبقية ونسبتها من إجمالي المدة
function deadlineBannerHtml(p) {
  const s = projectDeadlineStatus(p);
  if (!s || s.state === "ok") return "";
  if (s.state === "delayed") {
    return `<div style="margin-top:10px;background:#fbe6e2;border-radius:8px;padding:10px 12px;font-size:12.5px;color:var(--danger);font-weight:700">${svgIcon("alert", 15)} المشروع متأخر عن الموعد المحدد لانتهائه بمقدار ${Math.abs(s.daysRemaining)} يوم</div>`;
  }
  const pct = s.totalDays ? Math.round((s.daysRemaining / s.totalDays) * 100) : null;
  return `<div style="margin-top:10px;background:#fdecd6;border-radius:8px;padding:10px 12px;font-size:12.5px;color:var(--warning);font-weight:700">${svgIcon("clock", 15)} متبقٍ على الموعد المحدد لانتهاء المشروع ${s.daysRemaining} يوم${pct !== null ? ` (أقل من ${pct}% من إجمالي مدة المشروع)` : ""}</div>`;
}

/* ---------- منتقي العميل (نسخة خاصة بالمشاريع) ---------- */
function projectClientPickerHtml(d) {
  if (d.clientId) {
    return `
      <div class="flex between" style="align-items:center;background:#f8f9fb;border:1px solid var(--border);border-radius:8px;padding:12px 14px">
        <div><strong>${d.client}</strong></div>
        <button class="btn sm" id="pc_change" type="button">تغيير العميل</button>
      </div>`;
  }
  return `
    <div class="field" style="margin-bottom:10px">
      <label>البحث عن عميل (بالاسم أو رقم الجوال)</label>
      <input id="pc_search" placeholder="اكتب للبحث..." autocomplete="off" value="${PROJECT_CLIENT_SEARCH}">
      <div id="pc_results" class="client-suggest-box"></div>
    </div>
    <button class="btn sm" id="pc_toggleAdd" type="button">+ إضافة عميل جديد</button>
    <div id="pc_addInline">${PROJECT_SHOW_ADD_CLIENT ? `
      <div class="card" style="margin-top:12px;background:#fafbfc">
        <div class="grid cols-2">
          <div class="field" style="grid-column:span 2"><label>اسم العميل</label><input id="pc_name"></div>
          <div class="field"><label>رقم الجوال</label><input id="pc_phone"></div>
          <div class="field"><label>البريد الإلكتروني</label><input id="pc_email"></div>
        </div>
        <div class="flex gap"><button class="btn sm primary" id="pc_add" type="button">إضافة العميل واختياره</button><button class="btn sm" id="pc_cancel" type="button">إلغاء</button></div>
      </div>` : ""}</div>
  `;
}

function renderProjectClientResults(container, query, d, onChange) {
  if (!container) return;
  const q = (query || "").trim().toLowerCase();
  if (!q) { container.innerHTML = ""; return; }
  const clients = dbGet("clients", []).filter(c => (c.name || "").toLowerCase().includes(q) || (c.phone || "").includes(q));
  container.innerHTML = clients.length ? clients.slice(0, 8).map(c => `
    <div class="client-suggest" data-pick="${c.id}"><strong>${c.name}</strong> <span class="text-muted" style="font-size:11.5px">${c.phone || ""}</span></div>
  `).join("") : `<div class="text-muted" style="font-size:12px;padding:8px 4px">لا يوجد عملاء مطابقون</div>`;
  container.querySelectorAll("[data-pick]").forEach(row => row.onclick = () => {
    const client = dbGet("clients", []).find(x => x.id === row.dataset.pick);
    d.clientId = client.id; d.client = client.name;
    PROJECT_CLIENT_SEARCH = "";
    onChange();
  });
}

function bindProjectClientPicker(el, d, onChange) {
  const changeBtn = document.getElementById("pc_change");
  if (changeBtn) { changeBtn.onclick = () => { d.clientId = ""; d.client = ""; onChange(); }; return; }

  const search = document.getElementById("pc_search");
  if (search) {
    renderProjectClientResults(document.getElementById("pc_results"), PROJECT_CLIENT_SEARCH, d, onChange);
    search.oninput = () => { PROJECT_CLIENT_SEARCH = search.value; renderProjectClientResults(document.getElementById("pc_results"), PROJECT_CLIENT_SEARCH, d, onChange); };
  }
  const toggleBtn = document.getElementById("pc_toggleAdd");
  if (toggleBtn) toggleBtn.onclick = () => { PROJECT_SHOW_ADD_CLIENT = !PROJECT_SHOW_ADD_CLIENT; onChange(); };

  if (PROJECT_SHOW_ADD_CLIENT) {
    document.getElementById("pc_add").onclick = () => {
      const name = document.getElementById("pc_name").value.trim();
      if (!name) { toast("يرجى إدخال اسم العميل"); return; }
      const clients = dbGet("clients", []);
      const newClient = { id: uid("cl"), name, phone: document.getElementById("pc_phone").value.trim(), email: document.getElementById("pc_email").value.trim(), taxNumber: "", address: "", notes: "", createdAt: new Date().toISOString() };
      clients.push(newClient);
      dbSet("clients", clients);
      d.clientId = newClient.id; d.client = newClient.name;
      PROJECT_SHOW_ADD_CLIENT = false; PROJECT_CLIENT_SEARCH = "";
      toast("تمت إضافة العميل");
      onChange();
    };
    document.getElementById("pc_cancel").onclick = () => { PROJECT_SHOW_ADD_CLIENT = false; onChange(); };
  }
}

/* ---------- منشئ/محرر المشروع ---------- */
function renderProjectBuilder(el) {
  const d = DRAFT_PROJECT;
  const contracts = dbGet("contracts", []);
  const quotes = dbGet("quotes", []);
  const users = dbGet("users", []);

  el.innerHTML = `
    <div class="section-title-row">
      <div><h2>${d.id ? "تعديل مشروع" : "إضافة مشروع جديد"}</h2><p>اربط المشروع بالعميل والعقد وجدول الكميات المعتمد وأضف كافة التفاصيل</p></div>
      <button class="btn" id="backList">إلغاء والرجوع</button>
    </div>

    <div class="card">
      <h3>بيانات أساسية</h3>
      <div class="grid cols-2">
        <div class="field"><label>اسم المشروع</label><input id="p_name" value="${d.name}"></div>
      </div>
      <div class="field">
        <label>موقع المشروع (رابط خرائط جوجل)</label>
        <div class="flex gap">
          <input id="p_location" placeholder="https://maps.app.goo.gl/... أو عنوان نصي" value="${d.location}" style="flex:1">
          <button class="btn sm" id="p_useMyLocation" type="button" title="استخدام موقعي الحالي">${svgIcon("pin")} موقعي الحالي</button>
        </div>
        <div class="hint">افتح الموقع في خرائط جوجل، اضغط "مشاركة"، ثم انسخ الرابط والصقه هنا — أو اكتب العنوان نصاً</div>
      </div>
      <div class="field"><label>الحي</label><select id="p_district">${districtOptionsHtml(d.district)}</select></div>
      <div class="field"><label>نوع المشروع</label>
        <div class="pill-group">${CONTRACT_TYPES.map(t => `<div class="pill ${d.projectType === t.key ? "active" : ""}" data-ptype="${t.key}">${projectTypeLabel(t.key)}</div>`).join("")}</div>
      </div>
      <div class="grid cols-2">
        <div class="field"><label>تاريخ البدء</label><input type="date" id="p_start" value="${d.startDate}"></div>
        <div class="field"><label>تاريخ الانتهاء المتوقع</label><input type="date" id="p_end" value="${d.endDate}"></div>
        <div class="field"><label>الحالة</label>
          <select id="p_status">${PROJECT_STATUSES.map(s => `<option ${d.status === s ? "selected" : ""}>${s}</option>`).join("")}</select>
        </div>
        <div class="field"><label>نسبة الإنجاز (%)</label><input type="number" min="0" max="100" id="p_completion" value="${d.completion}"></div>
      </div>
    </div>

    <div class="card">
      <h3>العميل</h3>
      ${projectClientPickerHtml(d)}
    </div>

    <div class="card">
      <h3>الربط بالعقد وجدول الكميات المعتمد</h3>
      <div class="grid cols-2">
        <div class="field"><label>العقد المرتبط</label>
          <select id="p_contract">
            <option value="">— بدون —</option>
            ${contracts.map(c => `<option value="${c.id}" ${d.contractId === c.id ? "selected" : ""}>${c.clientName} — ${projectTypeLabel(c.type)} — ${fmtMoney(c.totalAmount)}</option>`).join("")}
          </select>
        </div>
        <div class="field"><label>جدول الكميات المعتمد (عرض السعر)</label>
          <select id="p_quote">
            <option value="">— بدون —</option>
            ${quotes.map(q => `<option value="${q.id}" ${d.approvedQuoteId === q.id ? "selected" : ""}>${q.number} — ${q.client.name} — ${fmtMoney(quoteTotal(q))}</option>`).join("")}
          </select>
        </div>
      </div>
    </div>

    <div class="card">
      <h3>الفنيون والمهندسون المتابعون للمشروع</h3>
      <div class="pill-group">
        ${users.map(u => `<label class="chk" style="border:1px solid var(--border);border-radius:20px;padding:7px 14px"><input type="checkbox" data-team="${u.id}" ${d.teamUserIds.includes(u.id) ? "checked" : ""}> ${u.name} <span class="text-muted" style="font-size:11px">(${u.role})</span></label>`).join("")}
      </div>
    </div>

    <div class="card">
      <h3>المخططات</h3>
      <input type="file" id="p_plans" multiple accept=".dwg,.dxf,.pdf,application/pdf">
      <div id="p_plansList" class="flex wrap" style="margin-top:8px">${d.planFiles.map(f => `<span class="file-chip">${svgIcon("paperclip", 14)} ${f.name}</span>`).join("")}</div>
    </div>

    <div class="card">
      <h3>ملاحظات وتفاصيل إضافية</h3>
      <textarea id="p_notes" placeholder="أي تفاصيل أخرى متعلقة بالمشروع...">${d.notes}</textarea>
    </div>

    <div class="flex gap"><button class="btn primary" id="saveProjectBtn">${svgIcon("save")} حفظ المشروع</button><button class="btn" id="cancelProjectBtn">إلغاء</button></div>
  `;

  bindProjectClientPicker(el, d, () => renderProjectBuilder(el));

  document.getElementById("backList").onclick = () => { PROJECTS_VIEW = "list"; router(); };
  document.getElementById("cancelProjectBtn").onclick = () => { PROJECTS_VIEW = "list"; router(); };

  el.querySelectorAll("[data-ptype]").forEach(p => p.onclick = () => { d.projectType = p.dataset.ptype; renderProjectBuilder(el); });

  document.getElementById("p_name").oninput = (e) => d.name = e.target.value;
  document.getElementById("p_location").oninput = (e) => d.location = e.target.value;
  document.getElementById("p_district").onchange = (e) => d.district = e.target.value;
  document.getElementById("p_useMyLocation").onclick = () => {
    if (!navigator.geolocation) { toast("المتصفح لا يدعم تحديد الموقع"); return; }
    toast("جارٍ تحديد الموقع...");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const link = `https://www.google.com/maps?q=${pos.coords.latitude},${pos.coords.longitude}`;
        d.location = link;
        document.getElementById("p_location").value = link;
        toast("تم تحديد الموقع الحالي");
      },
      () => toast("تعذّر تحديد الموقع — تأكد من السماح بالوصول للموقع الجغرافي"),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };
  document.getElementById("p_start").oninput = (e) => d.startDate = e.target.value;
  document.getElementById("p_end").oninput = (e) => d.endDate = e.target.value;
  document.getElementById("p_status").onchange = (e) => d.status = e.target.value;
  document.getElementById("p_completion").oninput = (e) => d.completion = Math.max(0, Math.min(100, Number(e.target.value) || 0));
  document.getElementById("p_contract").onchange = (e) => d.contractId = e.target.value;
  document.getElementById("p_quote").onchange = (e) => d.approvedQuoteId = e.target.value;
  document.getElementById("p_notes").oninput = (e) => d.notes = e.target.value;

  el.querySelectorAll("[data-team]").forEach(chk => chk.onchange = () => {
    const id = chk.dataset.team;
    if (chk.checked) { if (!d.teamUserIds.includes(id)) d.teamUserIds.push(id); }
    else { d.teamUserIds = d.teamUserIds.filter(x => x !== id); }
  });

  document.getElementById("p_plans").onchange = (e) => {
    for (const f of e.target.files) d.planFiles.push({ name: f.name, type: f.type, size: f.size });
    document.getElementById("p_plansList").innerHTML = d.planFiles.map(f => `<span class="file-chip">${svgIcon("paperclip", 14)} ${f.name}</span>`).join("");
  };

  document.getElementById("saveProjectBtn").onclick = () => {
    if (!d.name.trim()) { toast("يرجى إدخال اسم المشروع"); return; }
    if (!d.clientId) { toast("يرجى اختيار العميل"); return; }

    const projects = dbGet("projects", []);
    const isNew = !d.id;
    if (d.id) {
      const idx = projects.findIndex(p => p.id === d.id);
      if (idx > -1) projects[idx] = d;
    } else {
      d.id = uid("p");
      d.createdAt = new Date().toISOString();
      projects.push(d);
    }
    dbSet("projects", projects);
    logActivity(isNew ? `تم إضافة مشروع جديد "${d.name}"` : `تم تعديل بيانات المشروع "${d.name}"`);
    toast("تم حفظ المشروع بنجاح");
    PROJECT_VIEW_ID = d.id;
    PROJECTS_VIEW = "detail";
    router();
  };
}

/* ---------- تفاصيل المشروع ---------- */
function renderProjectDetail(el) {
  const projects = dbGet("projects", []);
  const p = projects.find(x => x.id === PROJECT_VIEW_ID);
  if (!p) { PROJECTS_VIEW = "list"; router(); return; }
  function persist() { dbSet("projects", projects); }

  const client = p.clientId ? dbGet("clients", []).find(c => c.id === p.clientId) : null;
  const contracts = dbGet("contracts", []);
  const quotes = dbGet("quotes", []);
  const users = dbGet("users", []);
  const contract = p.contractId ? contracts.find(c => c.id === p.contractId) : null;
  const quote = p.approvedQuoteId ? quotes.find(q => q.id === p.approvedQuoteId) : null;

  const accEntries = dbGet("accProjects", []).filter(e => e.projectId === p.id);
  const revenue = accEntries.filter(e => e.type === "إيراد مشروع" || e.type === "فاتورة ضريبية").reduce((s, e) => s + Number(e.amount || 0), 0);
  const expenses = accEntries.filter(e => ACC_EXPENSE_TYPES.includes(e.type)).reduce((s, e) => s + Number(e.amount || 0), 0);
  const paymentsProgress = computeContractPaymentsProgress(contract, revenue);
  const projectCustodies = dbGet("custodies", []).filter(c => c.scopeType === "project" && c.projectId === p.id);

  el.innerHTML = `
    <div class="section-title-row">
      <div>
        <input id="pd_name" value="${p.name}" style="font-size:19px;font-weight:800;border:1px solid transparent;background:transparent;padding:2px 4px;border-radius:6px;width:100%;max-width:420px;font-family:inherit">
        <div class="flex gap center" style="margin-top:6px;flex-wrap:wrap">
          <div class="pill-group" id="pd_typePills">${CONTRACT_TYPES.map(t => `<div class="pill ${p.projectType === t.key ? "active" : ""}" data-ptype="${t.key}" style="padding:4px 12px;font-size:11px">${projectTypeLabel(t.key)}</div>`).join("")}</div>
          <select id="pd_status" style="width:auto;padding:5px 10px;font-size:12px;border-radius:20px;border:1px solid var(--border)">
            ${PROJECT_STATUSES.map(s => `<option ${p.status === s ? "selected" : ""}>${s}</option>`).join("")}
          </select>
          ${delayedBadgeHtml(p)}
        </div>
      </div>
      <button class="btn" id="backList2">رجوع لقائمة المشاريع</button>
    </div>

    <div class="grid cols-2">
      <div class="card">
        <h3>بيانات العميل</h3>
        <div id="pd_clientCard">${client ? `
          <div class="kv-row"><span class="k">الاسم</span><span class="v">${client.name}</span></div>
          <div class="kv-row"><span class="k">الجوال</span><span class="v">${client.phone || "-"}</span></div>
          <div class="kv-row"><span class="k">البريد</span><span class="v">${client.email || "-"}</span></div>
          <div class="kv-row"><span class="k">الرقم الضريبي</span><span class="v">${client.taxNumber || "-"}</span></div>
          <button class="btn sm" id="pc_change" type="button" style="margin-top:10px">تغيير العميل</button>
        ` : projectClientPickerHtml(p)}</div>
      </div>

      <div class="card">
        <h3>تفاصيل المشروع</h3>
        <div class="field">
          <label>الموقع (رابط خرائط جوجل)</label>
          <div class="flex gap">
            <input id="pd_location" placeholder="https://maps.app.goo.gl/... أو عنوان نصي" value="${p.location || ""}" style="flex:1">
            <button class="btn sm" id="pd_useMyLocation" type="button" title="استخدام موقعي الحالي">${svgIcon("pin")} موقعي الحالي</button>
          </div>
          <div id="pd_locationLink" style="margin-top:6px">${p.location ? locationDisplay(p.location) : ""}</div>
        </div>
        <div class="field"><label>الحي</label><select id="pd_district">${districtOptionsHtml(p.district || "")}</select></div>
        <div class="grid cols-2">
          <div class="field"><label>تاريخ البدء</label><input type="date" id="pd_start" value="${p.startDate || ""}"></div>
          <div class="field"><label>تاريخ الانتهاء المتوقع</label><input type="date" id="pd_end" value="${p.endDate || ""}"></div>
        </div>
        <div class="field" style="margin-bottom:0">
          <div class="flex between" style="margin-bottom:6px"><label style="margin-bottom:0">نسبة الإنجاز</label><strong style="font-size:12.5px" id="pd_completionLabel">${p.completion || 0}%</strong></div>
          <input type="number" min="0" max="100" id="pd_completion" value="${p.completion || 0}" style="margin-bottom:8px">
          <div class="progress-track"><div class="progress-fill ${p.completion >= 80 ? "success" : p.completion < 40 ? "warning" : ""}" id="pd_progressFill" style="width:${p.completion || 0}%"></div></div>
          ${deadlineBannerHtml(p)}
        </div>
      </div>
    </div>

    <div class="grid cols-2">
      <div class="card">
        <h3>العقد المرتبط</h3>
        <div class="field"><label>اختيار عقد من النظام</label>
          <select id="pd_contract">
            <option value="">— بدون —</option>
            ${contracts.map(c => `<option value="${c.id}" ${p.contractId === c.id ? "selected" : ""}>${c.clientName} — ${projectTypeLabel(c.type)} — ${fmtMoney(c.totalAmount)}</option>`).join("")}
          </select>
        </div>
        ${contract ? `<button class="btn sm" id="openContractBtn">فتح العقد</button>` : ""}
        <hr style="border:none;border-top:1px dashed var(--border);margin:14px 0">
        <label style="font-size:12.5px;font-weight:700;display:block;margin-bottom:6px">أو رفع صيغة عقد خارجي (ملف)</label>
        <input type="file" id="pd_contractFile" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png">
        <div style="margin-top:8px">${p.externalContractFile ? `<span class="file-chip">${svgIcon("paperclip", 14)} ${p.externalContractFile.name} <span data-rmcontractfile style="cursor:pointer;color:var(--danger);margin-inline-start:6px">${svgIcon("close", 12)}</span></span>` : ""}</div>
      </div>
      <div class="card">
        <h3>جدول الكميات المعتمد</h3>
        <div class="field"><label>اختيار عرض سعر معتمد من النظام</label>
          <select id="pd_quote">
            <option value="">— بدون —</option>
            ${quotes.map(q => `<option value="${q.id}" ${p.approvedQuoteId === q.id ? "selected" : ""}>${q.number} — ${q.client.name} — ${fmtMoney(quoteTotal(q))}</option>`).join("")}
          </select>
        </div>
        ${quote ? `<button class="btn sm" id="openQuoteBtn">فتح عرض السعر</button>` : ""}
        <hr style="border:none;border-top:1px dashed var(--border);margin:14px 0">
        <label style="font-size:12.5px;font-weight:700;display:block;margin-bottom:6px">أو رفع ملف كميات خارجي</label>
        <input type="file" id="pd_boqFile" accept=".pdf,.xls,.xlsx,.csv">
        <div style="margin-top:8px">${p.externalBoqFile ? `<span class="file-chip">${svgIcon("paperclip", 14)} ${p.externalBoqFile.name} <span data-rmboqfile style="cursor:pointer;color:var(--danger);margin-inline-start:6px">${svgIcon("close", 12)}</span></span>` : ""}</div>
      </div>
    </div>

    ${projectExtrasCardHtml(p, contract)}

    <div class="card">
      <h3>الفنيون والمهندسون المتابعون</h3>
      <div class="pill-group">
        ${users.map(u => `<label class="chk" style="border:1px solid var(--border);border-radius:20px;padding:7px 14px"><input type="checkbox" data-team="${u.id}" ${(p.teamUserIds || []).includes(u.id) ? "checked" : ""}> ${u.name} <span class="text-muted" style="font-size:11px">(${u.role})</span></label>`).join("")}
      </div>
    </div>

    <div class="card">
      <h3>المخططات</h3>
      <input type="file" id="pd_plans" multiple accept=".dwg,.dxf,.pdf,application/pdf">
      <div id="pd_plansList" class="flex wrap" style="margin-top:8px">${(p.planFiles || []).map((f, i) => `<span class="file-chip">${svgIcon("paperclip", 14)} ${f.name} <span data-rmplan="${i}" style="cursor:pointer;color:var(--danger);margin-inline-start:6px">${svgIcon("close", 12)}</span></span>`).join("")}</div>
    </div>

    <div class="card">
      <div class="flex between" style="align-items:center;margin-bottom:10px">
        <h3 class="mt-0">محاسبة المشروع</h3>
        <button class="btn sm primary" id="openProjectAcc">فتح محاسبة المشروع (إضافة فواتير ومصاريف)</button>
      </div>
      <div class="grid cols-4">
        <div class="stat-card"><div class="label">إجمالي الدفعات الواصلة</div><div class="value success">${fmtMoney(revenue)}</div></div>
        <div class="stat-card">
          <div class="label">المبالغ المتبقية حتى نهاية المشروع</div>
          <div class="value warning">${paymentsProgress ? fmtMoney(paymentsProgress.remainingAmount) : "-"}</div>
          <div class="text-muted" style="font-size:11px;margin-top:4px">${paymentsProgress ? `(${paymentsProgress.remainingCount} من ${paymentsProgress.totalPayments} دفعات متبقية)` : "لا يوجد عقد مرتبط لحساب الدفعات"}</div>
        </div>
        <div class="stat-card"><div class="label">إجمالي المصاريف</div><div class="value danger">${fmtMoney(expenses)}</div></div>
        <div class="stat-card"><div class="label">صافي الربح</div><div class="value ${revenue - expenses >= 0 ? "success" : "danger"}">${fmtMoney(revenue - expenses)}</div></div>
      </div>
    </div>

    <div class="card">
      <div class="flex between" style="align-items:center;margin-bottom:10px">
        <h3 class="mt-0">عُهد المشروع</h3>
        <button class="btn sm" id="openProjectCustody">فتح صفحة العهد</button>
      </div>
      ${projectCustodies.length ? projectCustodies.map(c => `
        <div class="timeline-item">
          <div class="dot"></div>
          <div class="body">
            <div class="flex between">
              <span style="font-size:13px"><strong>${c.employeeName}</strong> — ${c.purpose || "بدون غرض محدد"}</span>
              <strong style="font-size:13px;color:${custodyBalance(c) >= 0 ? "var(--success)" : "var(--danger)"}">${fmtMoney(custodyBalance(c))}</strong>
            </div>
            <div class="meta"><span class="badge ${c.status === "مفتوحة" ? "orange" : "gray"}">${c.status}</span></div>
          </div>
        </div>`).join("") : `<p class="text-muted" style="font-size:13px">لا توجد عُهد مسجلة على هذا المشروع</p>`}
    </div>

    <div class="card">
      <h3>ملاحظات</h3>
      <textarea id="pd_notes" placeholder="أي تفاصيل أخرى متعلقة بالمشروع...">${p.notes || ""}</textarea>
    </div>
  `;

  document.getElementById("backList2").onclick = () => { PROJECTS_VIEW = "list"; router(); };
  bindProjectExtras(el, p, persist, () => renderProjectDetail(el));

  // ---- بيانات أساسية (حفظ تلقائي) ----
  document.getElementById("pd_name").onchange = (e) => { p.name = e.target.value.trim() || p.name; persist(); };
  el.querySelectorAll("[data-ptype]").forEach(pill => pill.onclick = () => { p.projectType = pill.dataset.ptype; persist(); renderProjectDetail(el); });
  document.getElementById("pd_status").onchange = (e) => { p.status = e.target.value; persist(); logActivity(`تم تحديث حالة المشروع "${p.name}" إلى: ${p.status}`); };
  document.getElementById("pd_location").onchange = (e) => {
    p.location = e.target.value.trim();
    persist();
    document.getElementById("pd_locationLink").innerHTML = p.location ? locationDisplay(p.location) : "";
  };
  document.getElementById("pd_district").onchange = (e) => { p.district = e.target.value; persist(); };
  document.getElementById("pd_useMyLocation").onclick = () => {
    if (!navigator.geolocation) { toast("المتصفح لا يدعم تحديد الموقع"); return; }
    toast("جارٍ تحديد الموقع...");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const link = `https://www.google.com/maps?q=${pos.coords.latitude},${pos.coords.longitude}`;
        p.location = link;
        document.getElementById("pd_location").value = link;
        document.getElementById("pd_locationLink").innerHTML = locationDisplay(link);
        persist();
        toast("تم تحديد الموقع الحالي");
      },
      () => toast("تعذّر تحديد الموقع — تأكد من السماح بالوصول للموقع الجغرافي"),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };
  document.getElementById("pd_start").onchange = (e) => { p.startDate = e.target.value; persist(); };
  document.getElementById("pd_end").onchange = (e) => { p.endDate = e.target.value; persist(); };
  document.getElementById("pd_completion").oninput = (e) => {
    const v = Math.max(0, Math.min(100, Number(e.target.value) || 0));
    p.completion = v;
    document.getElementById("pd_completionLabel").textContent = v + "%";
    const fill = document.getElementById("pd_progressFill");
    fill.style.width = v + "%";
    fill.className = "progress-fill " + (v >= 80 ? "success" : v < 40 ? "warning" : "");
    persist();
  };
  document.getElementById("pd_notes").onchange = (e) => { p.notes = e.target.value.trim(); persist(); };

  // ---- العميل ----
  if (client) {
    document.getElementById("pc_change").onclick = () => { p.clientId = ""; p.client = ""; persist(); renderProjectDetail(el); };
  } else {
    bindProjectClientPicker(el, p, () => { persist(); renderProjectDetail(el); });
  }

  // ---- العقد المرتبط ----
  document.getElementById("pd_contract").onchange = (e) => { p.contractId = e.target.value; persist(); renderProjectDetail(el); };
  const openContractBtn = document.getElementById("openContractBtn");
  if (openContractBtn) openContractBtn.onclick = () => { CONTRACT_VIEW_ID = contract.id; CONTRACTS_VIEW = "view"; location.hash = "#/contracts"; };
  document.getElementById("pd_contractFile").onchange = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    p.externalContractFile = { name: f.name, type: f.type, size: f.size };
    persist();
    toast("تم إرفاق ملف العقد الخارجي");
    renderProjectDetail(el);
  };
  const rmContractFile = el.querySelector("[data-rmcontractfile]");
  if (rmContractFile) rmContractFile.onclick = () => { p.externalContractFile = null; persist(); renderProjectDetail(el); };

  // ---- جدول الكميات المعتمد ----
  document.getElementById("pd_quote").onchange = (e) => { p.approvedQuoteId = e.target.value; persist(); renderProjectDetail(el); };
  const openQuoteBtn = document.getElementById("openQuoteBtn");
  if (openQuoteBtn) openQuoteBtn.onclick = () => { VIEW_QUOTE_ID = quote.id; QUOTES_VIEW = "view"; location.hash = "#/quotes"; };
  document.getElementById("pd_boqFile").onchange = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    p.externalBoqFile = { name: f.name, type: f.type, size: f.size };
    persist();
    toast("تم إرفاق ملف الكميات الخارجي");
    renderProjectDetail(el);
  };
  const rmBoqFile = el.querySelector("[data-rmboqfile]");
  if (rmBoqFile) rmBoqFile.onclick = () => { p.externalBoqFile = null; persist(); renderProjectDetail(el); };

  // ---- الفريق المتابع ----
  el.querySelectorAll("[data-team]").forEach(chk => chk.onchange = () => {
    const id = chk.dataset.team;
    p.teamUserIds = p.teamUserIds || [];
    if (chk.checked) { if (!p.teamUserIds.includes(id)) p.teamUserIds.push(id); }
    else { p.teamUserIds = p.teamUserIds.filter(x => x !== id); }
    persist();
  });

  // ---- المخططات ----
  document.getElementById("pd_plans").onchange = (e) => {
    p.planFiles = p.planFiles || [];
    for (const f of e.target.files) p.planFiles.push({ name: f.name, type: f.type, size: f.size });
    persist();
    renderProjectDetail(el);
  };
  el.querySelectorAll("[data-rmplan]").forEach(x => x.onclick = () => {
    p.planFiles.splice(Number(x.dataset.rmplan), 1);
    persist();
    renderProjectDetail(el);
  });

  document.getElementById("openProjectAcc").onclick = () => { ACC_SELECTED_PROJECT = p.id; location.hash = "#/acc_projects"; };
  document.getElementById("openProjectCustody").onclick = () => { ACC_GENERAL_TAB = "custody"; location.hash = "#/acc_general"; };
}

/* تنبيه تلقائي عند اقتراب موعد انتهاء مشروع (يُرسل مرة واحدة فقط لكل مشروع حتى لا يتكرر) */
function checkProjectDeadlineNotifications() {
  const projects = dbGet("projects", []);
  let changed = false;
  projects.forEach(p => {
    const s = projectDeadlineStatus(p);
    const inWarningWindow = !!s && s.state === "warning";
    if (inWarningWindow && !p.deadlineWarningNotified) {
      addNotification({
        type: "project_deadline",
        title: "اقتراب موعد انتهاء مشروع",
        message: `متبقٍ على مشروع "${p.name}" ${s.daysRemaining} يوم فقط حتى الموعد المحدد لانتهائه (أقل من 20% من إجمالي مدة المشروع).`,
        targetRoles: ["مدير عام", "مدير النظام"],
        targetUserIds: p.teamUserIds || [], // الفنيون والمهندسون والمتابعون المسؤولون عن المشروع
        relatedRoute: "projects",
      });
      p.deadlineWarningNotified = true;
      changed = true;
    } else if (!inWarningWindow && p.deadlineWarningNotified) {
      p.deadlineWarningNotified = false; // أُعيد الضبط بعد تغيّر الموعد لاحقاً
      changed = true;
    }
  });
  if (changed) dbSet("projects", projects);
}

/* ترحيل بسيط: يضيف الحقول الجديدة لمشاريع مزروعة مسبقاً بدون كسر أي بيانات موجودة */
function migrateProjectsSchema() {
  const projects = dbGet("projects", []);
  const clients = dbGet("clients", []);
  let changed = false;
  projects.forEach(p => {
    if (p.clientId === undefined) {
      const match = clients.find(c => sameClientName(c.name, p.client));
      p.clientId = match ? match.id : "";
      changed = true;
    }
    if (p.projectType === undefined) { p.projectType = "construction"; changed = true; }
    if (p.status === undefined) { p.status = "قيد التنفيذ"; changed = true; }
    if (p.startDate === undefined) { p.startDate = ""; changed = true; }
    if (p.endDate === undefined) { p.endDate = ""; changed = true; }
    if (p.contractId === undefined) { p.contractId = ""; changed = true; }
    if (p.externalContractFile === undefined) { p.externalContractFile = null; changed = true; }
    if (p.approvedQuoteId === undefined) { p.approvedQuoteId = ""; changed = true; }
    if (p.externalBoqFile === undefined) { p.externalBoqFile = null; changed = true; }
    if (p.teamUserIds === undefined) { p.teamUserIds = []; changed = true; }
    if (p.planFiles === undefined) { p.planFiles = []; changed = true; }
    if (p.notes === undefined) { p.notes = ""; changed = true; }
    if (p.createdAt === undefined) { p.createdAt = new Date().toISOString(); changed = true; }
  });
  if (changed) dbSet("projects", projects);
}
