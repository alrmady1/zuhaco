/* =========================================================
   صفحة العقود
   ========================================================= */

let CONTRACTS_VIEW = "list"; // list | builder | view
let CONTRACT_VIEW_ID = null;
let DRAFT_CONTRACT = null;

// تنسيق الأرقام في صفحة العقود بالأرقام الإنجليزية (لاتينية) بدل الأرقام العربية
function fmtMoneyEN(n) {
  n = Number(n) || 0;
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ر.س";
}

const CONTRACT_TYPES = [
  { key: "construction", label: "عقد أعمال إنشائية" },
  { key: "renovation", label: "عقد أعمال ترميم" },
  { key: "finishing", label: "عقد أعمال تشطيبات" },
];

// يحسب المبلغ الأساسي (قبل الضريبة) والضريبة والإجمالي شامل الضريبة، حسب ما إذا كان
// المبلغ المُدخل (d.totalAmount) شاملاً للضريبة أصلاً أم لا (d.amountIncludesVat)
function contractAmounts(d) {
  const entered = Number(d.totalAmount) || 0;
  if (d.amountIncludesVat) {
    const base = entered / (1 + VAT_RATE);
    return { base, vat: entered - base, grand: entered };
  }
  return { base: entered, vat: entered * VAT_RATE, grand: entered * (1 + VAT_RATE) };
}

function contractTemplateText(typeKey, d) {
  const typeLabel = (CONTRACT_TYPES.find(t => t.key === typeKey) || {}).label || "عقد مقاولة";
  return `${typeLabel}

أبرم هذا العقد بتاريخ ${fmtDate(d.date)} بين كل من:
الطرف الأول: شركة زهى الاعمال للمقاولات (ويشار إليها فيما يلي بـ "المقاول")
الطرف الثاني: ${d.clientName || "..............."} ، الرقم الضريبي: ${d.taxNumber || "..............."}
(ويشار إليه فيما يلي بـ "المالك")
${d.ownerContactName ? `الشخص المسؤول بالتواصل عن المالك: ${d.ownerContactName} (${d.ownerContactRole || "غير محدد"})${d.ownerContactPhone ? " ، جوال: " + d.ownerContactPhone : ""}${d.ownerContactEmail ? " ، بريد إلكتروني: " + d.ownerContactEmail : ""}` : ""}
${d.projectDescription ? `
وصف المشروع:
${d.projectDescription}
` : ""}
وقد اتفق الطرفان على ما يلي:

المادة الأولى - موضوع العقد
يلتزم المقاول بتنفيذ أعمال ${typeLabel.replace("عقد ", "")} للمشروع الخاص بالمالك وفقاً للمواصفات والمخططات المعتمدة من الطرفين.

المادة الثانية - القيمة الإجمالية
${d.amountIncludesVat
    ? `تبلغ قيمة العقد مبلغ ${fmtMoneyEN(contractAmounts(d).grand)} شاملاً ضريبة القيمة المضافة بنسبة 15% (قيمة الضريبة ${fmtMoneyEN(contractAmounts(d).vat)} من أصل مبلغ ${fmtMoneyEN(contractAmounts(d).base)} قبل الضريبة)، تُسدد على دفعات وفق الجدول التالي:`
    : `تبلغ قيمة العقد مبلغ ${fmtMoneyEN(contractAmounts(d).base)} غير شامل ضريبة القيمة المضافة، ويضاف إليها ضريبة القيمة المضافة بنسبة 15% وقدرها ${fmtMoneyEN(contractAmounts(d).vat)}، ليصبح الإجمالي شامل الضريبة مبلغ ${fmtMoneyEN(contractAmounts(d).grand)}، تُسدد على دفعات وفق الجدول التالي:`}
${d.paymentsText || ""}

المادة الثالثة - مدة التنفيذ
${(!d.hideDuration && contractEndDate(d)) ? `تبدأ أعمال التنفيذ بتاريخ ${fmtDate(d.startDate)} وتستمر لمدة ${d.durationDays} يوماً، لتنتهي بتاريخ ${fmtDate(contractEndDate(d))} تقديرياً. ` : ""}يتم تنفيذ الأعمال المذكورة خلال المدة المتفق عليها بين الطرفين، ويجوز تمديدها بموافقة خطية من الطرفين في حال وجود أعمال إضافية أو ظروف قاهرة.

المادة الرابعة - التزامات المقاول
1. تنفيذ الأعمال وفق الأصول الفنية والمواصفات المتفق عليها.
2. توفير العمالة والمواد اللازمة للتنفيذ ما لم يُتفق على خلاف ذلك.
3. الالتزام بجدول الدفعات المرتبط بمراحل الإنجاز.

المادة الخامسة - التزامات المالك
1. سداد الدفعات في مواعيدها المتفق عليها.
2. تمكين المقاول من الوصول إلى موقع العمل.

المادة السادسة - الضمان
يلتزم المقاول بضمان جودة الأعمال المنفذة لمدة سنة من تاريخ التسليم النهائي ضد عيوب التنفيذ.

المادة السابعة - فض النزاعات
في حال نشوء أي خلاف يتعذر حله ودياً، يُحال النزاع إلى الجهات القضائية المختصة في المملكة العربية السعودية.

توقيع الطرف الأول (المقاول)                توقيع الطرف الثاني (المالك)
.......................................                .......................................`;
}

let CONTRACT_CLIENT_SEARCH = "";

function newDraftContract() {
  return {
    id: null, type: "construction", linkedClientId: "", clientName: "", taxNumber: "",
    ownerContactName: "", ownerContactRole: "", ownerContactPhone: "", ownerContactEmail: "",
    projectDescription: "",
    totalAmount: 0, amountIncludesVat: false, paymentsCount: 2, payments: [{ percent: 50 }, { percent: 50 }],
    startDate: "", durationDays: "", endDate: "", hideDuration: false,
    contractText: "", date: todayISO(),
  };
}

/* ---------- منتقي العميل (نسخة خاصة بالعقود) ---------- */
function contractClientPickerHtml(d) {
  if (d.linkedClientId) {
    return `
      <div class="flex between" style="align-items:center;background:#f8f9fb;border:1px solid var(--border);border-radius:8px;padding:12px 14px">
        <div><strong>${d.clientName}</strong></div>
        <button class="btn sm" id="ccp_change" type="button">تغيير العميل</button>
      </div>`;
  }
  return `
    <div class="field" style="margin-bottom:10px">
      <label>البحث عن عميل (بالاسم أو رقم الجوال)</label>
      <input id="ccp_search" placeholder="اكتب للبحث في سجل العملاء..." autocomplete="off" value="${CONTRACT_CLIENT_SEARCH}">
      <div id="ccp_results" class="client-suggest-box"></div>
    </div>
    <button class="btn sm" id="ccp_toggleAdd" type="button">+ إضافة عميل جديد</button>
  `;
}

function renderContractClientResults(container, query, d, onChange) {
  if (!container) return;
  const q = (query || "").trim().toLowerCase();
  if (!q) { container.innerHTML = ""; return; }
  const clients = dbGet("clients", []).filter(c => (c.name || "").toLowerCase().includes(q) || (c.phone || "").includes(q));
  container.innerHTML = clients.length ? clients.slice(0, 8).map(c => `
    <div class="client-suggest" data-pick="${c.id}"><strong>${c.name}</strong> <span class="text-muted" style="font-size:11.5px">${c.phone || ""}</span></div>
  `).join("") : `<div class="text-muted" style="font-size:12px;padding:8px 4px">لا يوجد عملاء مطابقون</div>`;
  container.querySelectorAll("[data-pick]").forEach(row => row.onclick = () => {
    const client = dbGet("clients", []).find(x => x.id === row.dataset.pick);
    d.linkedClientId = client.id; d.clientName = client.name; d.taxNumber = client.taxNumber || d.taxNumber;
    CONTRACT_CLIENT_SEARCH = "";
    onChange();
  });
}

function bindContractClientPicker(el, d, onChange) {
  const changeBtn = document.getElementById("ccp_change");
  if (changeBtn) { changeBtn.onclick = () => { d.linkedClientId = ""; d.clientName = ""; onChange(); }; return; }

  const search = document.getElementById("ccp_search");
  if (search) {
    renderContractClientResults(document.getElementById("ccp_results"), CONTRACT_CLIENT_SEARCH, d, onChange);
    search.oninput = () => { CONTRACT_CLIENT_SEARCH = search.value; renderContractClientResults(document.getElementById("ccp_results"), CONTRACT_CLIENT_SEARCH, d, onChange); };
  }
  const toggleBtn = document.getElementById("ccp_toggleAdd");
  if (toggleBtn) toggleBtn.onclick = () => {
    openNewClientModal((newClient) => {
      d.linkedClientId = newClient.id;
      d.clientName = newClient.name;
      d.taxNumber = newClient.taxNumber || d.taxNumber;
      CONTRACT_CLIENT_SEARCH = "";
      onChange();
    });
  };
}

function addDaysISO(dateStr, days) {
  if (!dateStr || !days) return "";
  const d = new Date(dateStr);
  d.setDate(d.getDate() + Number(days));
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function contractEndDate(d) {
  return addDaysISO(d.startDate, d.durationDays);
}

function durationLabelText(d) {
  const end = contractEndDate(d);
  if (!end) return "أدخل تاريخ البداية ومدة التنفيذ لاحتساب تاريخ الانتهاء المتوقع";
  return `تاريخ الانتهاء المتوقع: ${fmtDate(end)}`;
}

function renderContracts(el) {
  if (CONTRACTS_VIEW === "builder") return renderContractBuilder(el);
  if (CONTRACTS_VIEW === "view") return renderContractView(el);
  renderContractsList(el);
}

function renderContractsList(el) {
  const contracts = dbGet("contracts", []).slice().sort((a, b) => (b.date > a.date ? 1 : -1));
  const role = (getCurrentUser() || {}).role;
  const canAddContract = hasPermission(role, "contracts_add");
  const canDeleteContract = hasPermission(role, "contracts_delete");
  el.innerHTML = `
    <div class="section-title-row">
      <div><h2>العقود</h2><p>نماذج عقود جاهزة لمشاريع إنشائية أو ترميم أو تشطيبات</p></div>
      ${canAddContract ? `<button class="btn primary" id="newContractBtn"><span style="font-size:15px">➕</span> إضافة عقد</button>` : ""}
    </div>
    ${contracts.length ? contracts.map(c => {
      const typeInfo = CONTRACT_TYPES.find(t => t.key === c.type) || {};
      return `
      <div class="contract-row" data-viewc="${c.id}">
        <div class="contract-row-icon">📄</div>
        <div class="contract-row-info">
          <div class="contract-row-title">${c.clientName}</div>
          <div class="contract-row-sub">${typeInfo.label || c.type} · ${fmtDate(c.date)} · ${c.paymentsCount} دفعات</div>
        </div>
        <div class="contract-row-amount">${fmtMoneyEN(c.totalAmount)}</div>
        <div class="contract-row-actions no-print">
          <button class="btn sm" data-viewc="${c.id}">فتح</button>
          ${canDeleteContract ? `<button class="btn sm danger" data-delc="${c.id}">حذف</button>` : ""}
        </div>
      </div>`;
    }).join("") : `<div class="card empty-state"><div class="ic">📄</div>لا توجد عقود محفوظة بعد</div>`}
  `;
  const newContractBtn = document.getElementById("newContractBtn");
  if (newContractBtn) newContractBtn.onclick = () => { DRAFT_CONTRACT = newDraftContract(); CONTRACTS_VIEW = "builder"; router(); };
  el.querySelectorAll("[data-viewc]").forEach(b => b.onclick = () => { CONTRACT_VIEW_ID = b.dataset.viewc; CONTRACTS_VIEW = "view"; router(); });
  el.querySelectorAll("[data-delc]").forEach(b => b.onclick = (e) => {
    e.stopPropagation();
    if (!confirm("حذف هذا العقد؟")) return;
    const target = contracts.find(c => c.id === b.dataset.delc);
    dbSet("contracts", dbGet("contracts", []).filter(c => c.id !== b.dataset.delc));
    logActivity(`تم حذف عقد العميل "${target ? target.clientName : ""}"`);
    router();
  });
}

function paymentsSummaryText(d) {
  const base = contractAmounts(d).base;
  return d.payments.map((p, i) => `الدفعة ${i + 1}: ${p.percent}% = ${fmtMoneyEN(base * p.percent / 100)}${p.milestone ? " — " + p.milestone : ""}`).join("\n");
}

function renderContractBuilder(el) {
  const d = DRAFT_CONTRACT;
  const percentSum = d.payments.reduce((s, p) => s + Number(p.percent || 0), 0);

  el.innerHTML = `
    <div class="section-title-row">
      <div><h2>إنشاء عقد جديد</h2><p>اختر نموذج العقد وأدخل بيانات العميل والدفعات</p></div>
      <button class="btn" id="backList">إلغاء والرجوع</button>
    </div>

    <div class="card">
      <h3>نوع العقد</h3>
      <div class="pill-group">
        ${CONTRACT_TYPES.map(t => `<div class="pill ${d.type === t.key ? "active" : ""}" data-type="${t.key}">${t.label}</div>`).join("")}
      </div>
    </div>

    <div class="card">
      <h3>بيانات العميل</h3>
      ${contractClientPickerHtml(d)}
    </div>

    <div class="card">
      <h3>بيانات الشخص المسؤول من طرف المالك</h3>
      <p class="text-muted" style="font-size:12px;margin-top:-6px">الشخص الذي سيتم التواصل معه ميدانياً (قد يكون المالك نفسه أو من ينوب عنه)</p>
      <div class="grid cols-2">
        <div class="field"><label>الاسم</label><input id="c_ownerName" value="${d.ownerContactName}"></div>
        <div class="field"><label>الصفة / الوظيفة</label><input id="c_ownerRole" value="${d.ownerContactRole}" placeholder="مثال: مالك، مهندس، مشرف، وكيل..."></div>
        <div class="field"><label>رقم الجوال</label><input id="c_ownerPhone" value="${d.ownerContactPhone}"></div>
        <div class="field"><label>البريد الإلكتروني</label><input id="c_ownerEmail" value="${d.ownerContactEmail}"></div>
      </div>
    </div>

    <div class="card">
      <h3>وصف المشروع</h3>
      <p class="text-muted" style="font-size:12px;margin-top:-6px">شرح مبسط عن المشروع، يُضاف تلقائياً إلى نص العقد كمقدمة</p>
      <div class="field"><textarea id="c_projectDesc" placeholder="مثال: يتضمن المشروع بناء فيلا سكنية من دورين على مساحة ٤٠٠ م٢..." style="min-height:90px">${d.projectDescription}</textarea></div>
    </div>

    <div class="card">
      <div class="flex between" style="align-items:center;margin-bottom:10px">
        <h3 class="mt-0">مدة المشروع</h3>
        <label class="chk"><input type="checkbox" id="c_hideDuration" ${d.hideDuration ? "checked" : ""}> إخفاء مدة المشروع من نص العقد</label>
      </div>
      <div class="grid cols-2">
        <div class="field"><label>تاريخ بداية المشروع</label><input type="date" id="c_startDate" value="${d.startDate}"></div>
        <div class="field"><label>مدة التنفيذ (بالأيام)</label><input type="number" min="1" id="c_durationDays" value="${d.durationDays}"></div>
      </div>
      <div class="text-muted" style="font-size:12.5px;font-weight:700" id="c_durationLabel">${durationLabelText(d)}</div>
    </div>

    <div class="card">
      <h3>القيمة الإجمالية والدفعات</h3>
      <div class="grid cols-2">
        <div class="field"><label>قيمة المشروع (ر.س)</label><input type="number" min="0" id="c_total" value="${d.totalAmount}"></div>
        <div class="field"><label>عدد الدفعات</label><input type="number" min="1" max="12" id="c_count" value="${d.paymentsCount}"></div>
      </div>
      <label class="chk" style="margin-bottom:14px"><input type="checkbox" id="c_includesVat" ${d.amountIncludesVat ? "checked" : ""}> المبلغ أعلاه شامل ضريبة القيمة المضافة (15%)</label>
      <div class="grid cols-2" style="margin-bottom:14px">
        <div class="kv-row"><span class="k">ضريبة القيمة المضافة (15%)</span><span class="v" id="c_vatAmount">${fmtMoneyEN(contractAmounts(d).vat)}</span></div>
        <div class="kv-row"><span class="k">الإجمالي شامل الضريبة</span><span class="v" id="c_grandTotal">${fmtMoneyEN(contractAmounts(d).grand)}</span></div>
      </div>
      <div id="paymentsRows"></div>
      <div class="text-muted" style="font-size:12.5px;margin-top:6px" id="percentSumLabel">مجموع النسب: ${percentSum}% ${percentSum !== 100 ? "⚠️ يجب أن يساوي المجموع 100%" : "✅"}</div>
    </div>

    <div class="card">
      <div class="flex between">
        <h3 class="mt-0">نص العقد</h3>
        <button class="btn sm" id="regenBtn">تحديث نص العقد تلقائياً</button>
      </div>
      <div class="field"><textarea id="c_text" style="min-height:340px;font-family:'Cairo',sans-serif;white-space:pre-wrap;line-height:1.9">${d.contractText || contractTemplateText(d.type, { ...d, paymentsText: paymentsSummaryText(d) })}</textarea></div>
    </div>

    <div class="flex gap"><button class="btn primary" id="saveContractBtn">💾 حفظ العقد</button><button class="btn" id="cancelContractBtn">إلغاء</button></div>
  `;

  renderPaymentsRows();

  document.getElementById("backList").onclick = () => { CONTRACTS_VIEW = "list"; router(); };
  document.getElementById("cancelContractBtn").onclick = () => { CONTRACTS_VIEW = "list"; router(); };

  el.querySelectorAll("[data-type]").forEach(p => p.onclick = () => { d.type = p.dataset.type; renderContractBuilder(el); });

  bindContractClientPicker(el, d, () => renderContractBuilder(el));
  document.getElementById("c_ownerName").oninput = (e) => d.ownerContactName = e.target.value;
  document.getElementById("c_ownerRole").oninput = (e) => d.ownerContactRole = e.target.value;
  document.getElementById("c_ownerPhone").oninput = (e) => d.ownerContactPhone = e.target.value;
  document.getElementById("c_ownerEmail").oninput = (e) => d.ownerContactEmail = e.target.value;
  document.getElementById("c_projectDesc").oninput = (e) => d.projectDescription = e.target.value;
  document.getElementById("c_hideDuration").onchange = (e) => d.hideDuration = e.target.checked;
  const updateDurationLabel = () => { document.getElementById("c_durationLabel").textContent = durationLabelText(d); };
  document.getElementById("c_startDate").oninput = (e) => { d.startDate = e.target.value; updateDurationLabel(); };
  document.getElementById("c_durationDays").oninput = (e) => { d.durationDays = Number(e.target.value) || 0; updateDurationLabel(); };
  function updateVatDisplay() {
    const amounts = contractAmounts(d);
    document.getElementById("c_vatAmount").textContent = fmtMoneyEN(amounts.vat);
    document.getElementById("c_grandTotal").textContent = fmtMoneyEN(amounts.grand);
  }
  document.getElementById("c_total").oninput = (e) => {
    d.totalAmount = Number(e.target.value) || 0;
    updateVatDisplay();
    renderPaymentsRows();
  };
  document.getElementById("c_includesVat").onchange = (e) => {
    d.amountIncludesVat = e.target.checked;
    updateVatDisplay();
    renderPaymentsRows();
  };
  document.getElementById("c_count").onchange = (e) => {
    let n = Math.max(1, Math.min(12, Number(e.target.value) || 1));
    const even = Math.floor((100 / n) * 100) / 100;
    d.paymentsCount = n;
    d.payments = Array.from({ length: n }, (_, i) => ({ percent: i === n - 1 ? Math.round((100 - even * (n - 1)) * 100) / 100 : even }));
    renderPaymentsRows();
  };
  document.getElementById("c_text").oninput = (e) => d.contractText = e.target.value;

  document.getElementById("regenBtn").onclick = () => {
    d.contractText = contractTemplateText(d.type, { ...d, paymentsText: paymentsSummaryText(d) });
    document.getElementById("c_text").value = d.contractText;
  };

  function renderPaymentsRows() {
    const wrap = document.getElementById("paymentsRows");
    wrap.innerHTML = d.payments.map((p, i) => `
      <div style="border:1px solid var(--border);border-radius:8px;padding:10px 12px;margin-bottom:8px;background:#fafbfc">
        <div class="item-row" style="grid-template-columns: 1fr 1fr 1fr;margin-bottom:0">
          <div style="font-size:12.5px;font-weight:700">الدفعة ${i + 1}</div>
          <div class="flex" style="align-items:center;gap:6px">
            <input type="number" min="0" max="100" step="0.01" value="${p.percent}" data-pct="${i}" placeholder="النسبة" style="width:65px;flex:none">
            <span class="text-muted" style="font-size:12.5px;font-weight:700">% (نسبة مئوية)</span>
          </div>
          <div style="font-size:12.5px" data-pctamt="${i}">${fmtMoneyEN(contractAmounts(d).base * p.percent / 100)}</div>
        </div>
        <input data-milestone="${i}" value="${p.milestone || ""}" placeholder="تفصيلة الدفعة — مثال: عند توقيع العقد / عند الانتهاء من الصبة" style="width:100%;margin-top:8px;padding:8px 10px;border:1px solid var(--border);border-radius:7px;font-size:12.5px">
      </div>
    `).join("");
    wrap.querySelectorAll("[data-pct]").forEach(inp => inp.oninput = () => {
      const i = Number(inp.dataset.pct);
      d.payments[i].percent = Number(inp.value) || 0;
      document.querySelector(`[data-pctamt="${i}"]`).textContent = fmtMoneyEN(contractAmounts(d).base * d.payments[i].percent / 100);
      const sum = d.payments.reduce((s, p) => s + Number(p.percent || 0), 0);
      document.getElementById("percentSumLabel").textContent = `مجموع النسب: ${sum}% ${sum !== 100 ? "⚠️ يجب أن يساوي المجموع 100%" : "✅"}`;
    });
    wrap.querySelectorAll("[data-milestone]").forEach(inp => inp.oninput = () => {
      d.payments[Number(inp.dataset.milestone)].milestone = inp.value;
    });
  }

  document.getElementById("saveContractBtn").onclick = () => {
    if (!d.clientName.trim()) { toast("يرجى إدخال اسم العميل"); return; }
    if (!d.totalAmount) { toast("يرجى إدخال قيمة المشروع"); return; }
    const sum = d.payments.reduce((s, p) => s + Number(p.percent || 0), 0);
    if (Math.round(sum) !== 100) { toast("مجموع نسب الدفعات يجب أن يساوي 100%"); return; }

    const contracts = dbGet("contracts", []);
    d.id = uid("c");
    d.endDate = contractEndDate(d);
    d.contractText = document.getElementById("c_text").value;
    contracts.push(d);
    dbSet("contracts", contracts);
    logActivity(`تم إنشاء عقد "${(CONTRACT_TYPES.find(t => t.key === d.type) || {}).label || d.type}" للعميل "${d.clientName}" بقيمة ${fmtMoneyEN(d.totalAmount)}`);
    toast("تم حفظ العقد بنجاح");
    CONTRACTS_VIEW = "list";
    router();
  };
}

function renderContractView(el) {
  const c = dbGet("contracts", []).find(x => x.id === CONTRACT_VIEW_ID);
  if (!c) { CONTRACTS_VIEW = "list"; router(); return; }
  el.innerHTML = `
    <div class="section-title-row no-print">
      <div><h2>${(CONTRACT_TYPES.find(t => t.key === c.type) || {}).label}</h2><p>${c.clientName}</p></div>
      <div class="flex gap"><button class="btn" id="backList2">رجوع</button><button class="btn primary" id="printContract">🖨️ طباعة</button></div>
    </div>
    <div class="card">
      <pre style="white-space:pre-wrap;font-family:'Cairo',sans-serif;line-height:1.9;font-size:13.5px;margin:0">${c.contractText}</pre>
    </div>
  `;
  document.getElementById("backList2").onclick = () => { CONTRACTS_VIEW = "list"; router(); };
  document.getElementById("printContract").onclick = () => window.print();
}
