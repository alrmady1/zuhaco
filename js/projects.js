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

function renderProjects(el) {
  if (PROJECTS_VIEW === "builder") return renderProjectBuilder(el);
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
      ${canAddProject ? `<button class="btn primary" id="newProjectBtn"><span style="font-size:15px">➕</span> إضافة مشروع</button>` : ""}
    </div>
    ${projects.length ? projects.map(p => `
      <div class="contract-row" data-openproj="${p.id}">
        <div class="contract-row-icon">🏗️</div>
        <div class="contract-row-info">
          <div class="contract-row-title">${p.name}</div>
          <div class="contract-row-sub">${p.client || "بدون عميل"} · ${projectTypeLabel(p.projectType)} · ${locationDisplay(p.location)} · ${statusBadge2(p.status)} ${delayedBadgeHtml(p)}</div>
        </div>
        <div style="min-width:110px">
          <div class="progress-track"><div class="progress-fill ${p.completion >= 80 ? "success" : p.completion < 40 ? "warning" : ""}" style="width:${p.completion || 0}%"></div></div>
          <div class="text-muted" style="font-size:11px;margin-top:3px">${p.completion || 0}% مكتمل</div>
        </div>
        <div class="contract-row-actions no-print">
          <button class="btn sm" data-openproj="${p.id}">فتح</button>
          ${canDeleteProject ? `<button class="btn sm danger" data-delproj="${p.id}">حذف</button>` : ""}
        </div>
      </div>`).join("") : `<div class="card empty-state"><div class="ic">🏗️</div>لا توجد مشاريع بعد</div>`}
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
  if (s.state === "delayed") return `<span class="badge red">⚠️ متأخر عن الموعد المحدد (${Math.abs(s.daysRemaining)} يوم)</span>`;
  if (s.state === "warning") return `<span class="badge orange">⏰ تبقى ${s.daysRemaining} يوم على الموعد المحدد</span>`;
  return "";
}

// شريط توضيحي أوسع (لصفحة تفاصيل/إنجاز المشروع) يوضح عدد الأيام المتبقية ونسبتها من إجمالي المدة
function deadlineBannerHtml(p) {
  const s = projectDeadlineStatus(p);
  if (!s || s.state === "ok") return "";
  if (s.state === "delayed") {
    return `<div style="margin-top:10px;background:#fbe6e2;border-radius:8px;padding:10px 12px;font-size:12.5px;color:var(--danger);font-weight:700">⚠️ المشروع متأخر عن الموعد المحدد لانتهائه بمقدار ${Math.abs(s.daysRemaining)} يوم</div>`;
  }
  const pct = s.totalDays ? Math.round((s.daysRemaining / s.totalDays) * 100) : null;
  return `<div style="margin-top:10px;background:#fdecd6;border-radius:8px;padding:10px 12px;font-size:12.5px;color:var(--warning);font-weight:700">⏰ متبقٍ على الموعد المحدد لانتهاء المشروع ${s.daysRemaining} يوم${pct !== null ? ` (أقل من ${pct}% من إجمالي مدة المشروع)` : ""}</div>`;
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
          <button class="btn sm" id="p_useMyLocation" type="button" title="استخدام موقعي الحالي">📍 موقعي الحالي</button>
        </div>
        <div class="hint">افتح الموقع في خرائط جوجل، اضغط "مشاركة"، ثم انسخ الرابط والصقه هنا — أو اكتب العنوان نصاً</div>
      </div>
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
      <div id="p_plansList" class="flex wrap" style="margin-top:8px">${d.planFiles.map(f => `<span class="file-chip">📎 ${f.name}</span>`).join("")}</div>
    </div>

    <div class="card">
      <h3>ملاحظات وتفاصيل إضافية</h3>
      <textarea id="p_notes" placeholder="أي تفاصيل أخرى متعلقة بالمشروع...">${d.notes}</textarea>
    </div>

    <div class="flex gap"><button class="btn primary" id="saveProjectBtn">💾 حفظ المشروع</button><button class="btn" id="cancelProjectBtn">إلغاء</button></div>
  `;

  bindProjectClientPicker(el, d, () => renderProjectBuilder(el));

  document.getElementById("backList").onclick = () => { PROJECTS_VIEW = "list"; router(); };
  document.getElementById("cancelProjectBtn").onclick = () => { PROJECTS_VIEW = "list"; router(); };

  el.querySelectorAll("[data-ptype]").forEach(p => p.onclick = () => { d.projectType = p.dataset.ptype; renderProjectBuilder(el); });

  document.getElementById("p_name").oninput = (e) => d.name = e.target.value;
  document.getElementById("p_location").oninput = (e) => d.location = e.target.value;
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
    document.getElementById("p_plansList").innerHTML = d.planFiles.map(f => `<span class="file-chip">📎 ${f.name}</span>`).join("");
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
  const expenses = accEntries.filter(e => ["دفعة مشتريات", "مصروف مواد", "مصروف عمال", "مصروف نثرية"].includes(e.type)).reduce((s, e) => s + Number(e.amount || 0), 0);
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
            <button class="btn sm" id="pd_useMyLocation" type="button" title="استخدام موقعي الحالي">📍 موقعي الحالي</button>
          </div>
          <div id="pd_locationLink" style="margin-top:6px">${p.location ? locationDisplay(p.location) : ""}</div>
        </div>
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
        <div style="margin-top:8px">${p.externalContractFile ? `<span class="file-chip">📎 ${p.externalContractFile.name} <span data-rmcontractfile style="cursor:pointer;color:var(--danger);margin-inline-start:6px">✕</span></span>` : ""}</div>
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
        <div style="margin-top:8px">${p.externalBoqFile ? `<span class="file-chip">📎 ${p.externalBoqFile.name} <span data-rmboqfile style="cursor:pointer;color:var(--danger);margin-inline-start:6px">✕</span></span>` : ""}</div>
      </div>
    </div>

    <div class="card">
      <h3>الفنيون والمهندسون المتابعون</h3>
      <div class="pill-group">
        ${users.map(u => `<label class="chk" style="border:1px solid var(--border);border-radius:20px;padding:7px 14px"><input type="checkbox" data-team="${u.id}" ${(p.teamUserIds || []).includes(u.id) ? "checked" : ""}> ${u.name} <span class="text-muted" style="font-size:11px">(${u.role})</span></label>`).join("")}
      </div>
    </div>

    <div class="card">
      <h3>المخططات</h3>
      <input type="file" id="pd_plans" multiple accept=".dwg,.dxf,.pdf,application/pdf">
      <div id="pd_plansList" class="flex wrap" style="margin-top:8px">${(p.planFiles || []).map((f, i) => `<span class="file-chip">📎 ${f.name} <span data-rmplan="${i}" style="cursor:pointer;color:var(--danger);margin-inline-start:6px">✕</span></span>`).join("")}</div>
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

  // ---- بيانات أساسية (حفظ تلقائي) ----
  document.getElementById("pd_name").onchange = (e) => { p.name = e.target.value.trim() || p.name; persist(); };
  el.querySelectorAll("[data-ptype]").forEach(pill => pill.onclick = () => { p.projectType = pill.dataset.ptype; persist(); renderProjectDetail(el); });
  document.getElementById("pd_status").onchange = (e) => { p.status = e.target.value; persist(); logActivity(`تم تحديث حالة المشروع "${p.name}" إلى: ${p.status}`); };
  document.getElementById("pd_location").onchange = (e) => {
    p.location = e.target.value.trim();
    persist();
    document.getElementById("pd_locationLink").innerHTML = p.location ? locationDisplay(p.location) : "";
  };
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
