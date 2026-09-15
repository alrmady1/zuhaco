/* =========================================================
   صفحة الإعدادات
   ========================================================= */

let SETTINGS_TAB = "users"; // users | permissions | catalog | expenseCatalog | vehicles | facilities | leaves | appearance | company | activity
let ACTIVITY_LOG_SEARCH = "";
let EXPENSE_CAT_COLLAPSED = {};

function renderSettings(el) {
  el.innerHTML = `
    <div class="section-title-row"><div><h2>الإعدادات</h2><p>إدارة المستخدمين والصلاحيات وبنود عروض الأسعار وبيانات المؤسسة</p></div></div>
    <div class="tabs">
      <div class="tab-btn ${SETTINGS_TAB === "users" ? "active" : ""}" data-tab="users">١. التحكم بالمستخدمين</div>
      <div class="tab-btn ${SETTINGS_TAB === "permissions" ? "active" : ""}" data-tab="permissions">٢. الصلاحيات</div>
      <div class="tab-btn ${SETTINGS_TAB === "catalog" ? "active" : ""}" data-tab="catalog">٣. بنود عروض الأسعار</div>
      <div class="tab-btn ${SETTINGS_TAB === "expenseCatalog" ? "active" : ""}" data-tab="expenseCatalog">٤. العهد والمصروفات</div>
      <div class="tab-btn ${SETTINGS_TAB === "vehicles" ? "active" : ""}" data-tab="vehicles">٥. المركبات</div>
      <div class="tab-btn ${SETTINGS_TAB === "facilities" ? "active" : ""}" data-tab="facilities">٦. المرافق</div>
      <div class="tab-btn ${SETTINGS_TAB === "leaves" ? "active" : ""}" data-tab="leaves">٧. الإجازات</div>
      <div class="tab-btn ${SETTINGS_TAB === "appearance" ? "active" : ""}" data-tab="appearance">٨. المظهر</div>
      <div class="tab-btn ${SETTINGS_TAB === "company" ? "active" : ""}" data-tab="company">٩. بيانات المؤسسة والشعار</div>
      <div class="tab-btn ${SETTINGS_TAB === "activity" ? "active" : ""}" data-tab="activity">١٠. سجل العمليات</div>
    </div>
    <div id="settingsBody"></div>
  `;
  el.querySelectorAll("[data-tab]").forEach(t => t.onclick = () => { SETTINGS_TAB = t.dataset.tab; renderSettings(el); });

  const body = document.getElementById("settingsBody");
  if (SETTINGS_TAB === "users") renderUsersTab(body);
  else if (SETTINGS_TAB === "permissions") renderPermissionsTab(body);
  else if (SETTINGS_TAB === "catalog") renderCatalogTab(body);
  else if (SETTINGS_TAB === "expenseCatalog") renderExpenseCatalogSettingsTab(body);
  else if (SETTINGS_TAB === "vehicles") renderVehiclesTab(body);
  else if (SETTINGS_TAB === "facilities") renderFacilitiesTab(body);
  else if (SETTINGS_TAB === "leaves") renderLeavesTab(body);
  else if (SETTINGS_TAB === "appearance") renderAppearanceTab(body);
  else if (SETTINGS_TAB === "activity") renderActivityLogTab(body);
  else renderCompanyTab(body);
}

/* ---------- تبويب المظهر ---------- */
function renderAppearanceTab(el) {
  const t = getThemeSettings();
  el.innerHTML = `
    <div class="card">
      <h3 class="mt-0">ألوان الموقع</h3>
      <div class="grid cols-2">
        <div class="field"><label>اللون الرئيسي (الأزرار والعناصر النشطة)</label><input type="color" id="th_primary" value="${t.primaryColor}" style="height:42px;padding:4px"></div>
        <div class="field"><label>لون الشريط الجانبي</label><input type="color" id="th_sidebar" value="${t.sidebarColor}" style="height:42px;padding:4px"></div>
      </div>
    </div>

    <div class="card">
      <h3 class="mt-0">الخط وحجمه</h3>
      <div class="grid cols-2">
        <div class="field"><label>نوع الخط</label>
          <select id="th_font">
            ${Object.keys(FONT_OPTIONS).map(k => `<option value="${k}" ${t.fontFamily === k ? "selected" : ""}>${FONT_OPTIONS[k].label}</option>`).join("")}
          </select>
        </div>
        <div class="field"><label>حجم الخط</label>
          <select id="th_fontSize">
            ${Object.keys(FONT_SIZE_OPTIONS).map(k => `<option value="${k}" ${t.fontSize === k ? "selected" : ""}>${FONT_SIZE_OPTIONS[k].label}</option>`).join("")}
          </select>
        </div>
      </div>
    </div>

    <div class="card">
      <h3 class="mt-0">الأيقونات</h3>
      <label class="chk"><input type="checkbox" id="th_icons" ${t.showMenuIcons !== false ? "checked" : ""}> إظهار أيقونات القائمة الجانبية</label>
    </div>

    <button class="btn primary" id="th_save">💾 حفظ وتطبيق المظهر</button>
    <button class="btn" id="th_reset" type="button">إعادة الافتراضي</button>
  `;

  document.getElementById("th_save").onclick = () => {
    setThemeSettings({
      primaryColor: document.getElementById("th_primary").value,
      sidebarColor: document.getElementById("th_sidebar").value,
      fontFamily: document.getElementById("th_font").value,
      fontSize: document.getElementById("th_fontSize").value,
      showMenuIcons: document.getElementById("th_icons").checked,
    });
    applyTheme();
    toast("تم حفظ وتطبيق المظهر");
  };

  document.getElementById("th_reset").onclick = () => {
    if (!confirm("إعادة المظهر إلى الإعدادات الافتراضية؟")) return;
    setThemeSettings({ primaryColor: "#b5651d", sidebarColor: "#16233a", fontFamily: "Cairo", fontSize: "medium", showMenuIcons: true });
    applyTheme();
    renderSettings(el.parentElement);
  };
}

/* ---------- تبويب المرافق ---------- */
function renderFacilitiesTab(el) {
  const facilities = dbGet("facilities", []);

  el.innerHTML = `
    <div class="card">
      <h3 class="mt-0">إضافة مرفق جديد</h3>
      <div class="grid cols-3">
        <div class="field"><label>اسم المرفق</label><input id="f_name" placeholder="مثال: المكتب الرئيسي"></div>
        <div class="field"><label>نوع المرفق</label><input id="f_type" placeholder="مثال: مكتب إداري / مستودع / سكن عمال"></div>
        <div class="field"><label>الملكية</label>
          <select id="f_ownership">
            <option value="ملك">ملك</option>
            <option value="إيجار">إيجار</option>
          </select>
        </div>
      </div>
      <div class="grid cols-3" id="f_rentFields">
        <div class="field"><label>قيمة الإيجار (ر.س)</label><input type="number" min="0" step="0.01" id="f_rentValue"></div>
        <div class="field"><label>بداية العقد</label><input type="date" id="f_contractStart"></div>
        <div class="field"><label>نهاية العقد</label><input type="date" id="f_contractEnd"></div>
      </div>
      <button class="btn primary" id="addFacilityBtn">+ إضافة مرفق</button>
    </div>

    <div class="card">
      <h3>المرافق المسجلة (${facilities.length})</h3>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>اسم المرفق</th><th>نوع المرفق</th><th>الملكية</th><th>قيمة الإيجار</th><th>بداية العقد</th><th>نهاية العقد</th><th></th></tr></thead>
          <tbody>
            ${facilities.length ? facilities.map(f => `
              <tr>
                <td><input value="${f.name || ""}" data-editf="${f.id}:name" style="border:1px solid var(--border);border-radius:6px;padding:5px 8px;width:100%;min-width:130px"></td>
                <td><input value="${f.type || ""}" data-editf="${f.id}:type" style="border:1px solid var(--border);border-radius:6px;padding:5px 8px;width:130px"></td>
                <td>
                  <select data-fownersel="${f.id}" style="padding:6px 8px;border:1px solid var(--border);border-radius:6px;font-size:12.5px">
                    <option value="ملك" ${f.ownership === "ملك" ? "selected" : ""}>ملك</option>
                    <option value="إيجار" ${f.ownership === "إيجار" ? "selected" : ""}>إيجار</option>
                  </select>
                </td>
                <td>${f.ownership === "إيجار" ? `<input type="number" min="0" step="0.01" value="${f.rentValue || 0}" data-editf="${f.id}:rentValue" style="border:1px solid var(--border);border-radius:6px;padding:5px 8px;width:100px">` : `<span class="text-muted">-</span>`}</td>
                <td>${f.ownership === "إيجار" ? `<input type="date" value="${f.contractStart || ""}" data-editf="${f.id}:contractStart" style="border:1px solid var(--border);border-radius:6px;padding:5px 8px">` : `<span class="text-muted">-</span>`}</td>
                <td>${f.ownership === "إيجار" ? `<input type="date" value="${f.contractEnd || ""}" data-editf="${f.id}:contractEnd" style="border:1px solid var(--border);border-radius:6px;padding:5px 8px">` : `<span class="text-muted">-</span>`}</td>
                <td><button class="btn sm danger" data-delfac="${f.id}">حذف</button></td>
              </tr>`).join("") : `<tr><td colspan="7"><div class="empty-state"><div class="ic">🏢</div>لا توجد مرافق مسجلة بعد</div></td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
  `;

  const ownerSelect = document.getElementById("f_ownership");
  const rentFields = document.getElementById("f_rentFields");
  function syncRentFields() { rentFields.style.display = ownerSelect.value === "إيجار" ? "" : "none"; }
  syncRentFields();
  ownerSelect.onchange = syncRentFields;

  document.getElementById("addFacilityBtn").onclick = () => {
    const name = document.getElementById("f_name").value.trim();
    const type = document.getElementById("f_type").value.trim();
    const ownership = ownerSelect.value;
    if (!name) { toast("يرجى إدخال اسم المرفق"); return; }
    const list = dbGet("facilities", []);
    const facility = { id: uid("fac"), name, type, ownership, createdAt: new Date().toISOString() };
    if (ownership === "إيجار") {
      facility.rentValue = Number(document.getElementById("f_rentValue").value) || 0;
      facility.contractStart = document.getElementById("f_contractStart").value || "";
      facility.contractEnd = document.getElementById("f_contractEnd").value || "";
    }
    list.push(facility);
    dbSet("facilities", list);
    logActivity(`تم إضافة مرفق جديد "${name}" (${ownership})`);
    toast("تم إضافة المرفق");
    renderSettings(el.parentElement);
  };

  function getFacility(id) {
    const list = dbGet("facilities", []);
    return { list, f: list.find(x => x.id === id) };
  }

  el.querySelectorAll("[data-editf]").forEach(inp => inp.onchange = () => {
    const [id, field] = inp.dataset.editf.split(":");
    const { list, f } = getFacility(id);
    f[field] = field === "rentValue" ? (Number(inp.value) || 0) : inp.value;
    dbSet("facilities", list);
    toast("تم الحفظ");
  });

  el.querySelectorAll("[data-fownersel]").forEach(sel => sel.onchange = () => {
    const { list, f } = getFacility(sel.dataset.fownersel);
    f.ownership = sel.value;
    dbSet("facilities", list);
    renderSettings(el.parentElement);
  });

  el.querySelectorAll("[data-delfac]").forEach(b => b.onclick = () => {
    const { list, f } = getFacility(b.dataset.delfac);
    if (!confirm(`حذف المرفق "${f.name}"؟`)) return;
    dbSet("facilities", list.filter(x => x.id !== f.id));
    logActivity(`تم حذف مرفق "${f.name}"`);
    renderSettings(el.parentElement);
  });
}

/* ---------- تبويب الإجازات ---------- */
function renderLeavesTab(el) {
  const users = dbGet("users", []);
  const leaves = dbGet("leaves", []);
  const isGM = (getCurrentUser() || {}).role === "مدير عام";
  const currentYear = new Date().getFullYear();

  function usedAnnualBalance(userId) {
    return leaves.filter(l => l.employeeId === userId && l.deductFromBalance && (l.startDate || "").slice(0, 4) === String(currentYear))
      .reduce((s, l) => s + Number(l.daysCount || 0), 0);
  }
  function entitlementFor(userId) {
    return annualLeaveEntitlementDays((users.find(u => u.id === userId) || {}).hireDate);
  }
  function remainingBalance(userId) { return entitlementFor(userId) - usedAnnualBalance(userId); }
  function usedSickDaysThisYear(userId) {
    return leaves.filter(l => l.employeeId === userId && l.leaveType === "sick" && (l.startDate || "").slice(0, 4) === String(currentYear))
      .reduce((s, l) => s + Number(l.daysCount || 0), 0);
  }

  function leavesListHtml() {
    if (!users.length) return `<div class="empty-state"><div class="ic">👤</div>لا يوجد مستخدمون بعد</div>`;
    return users.map(u => {
      const personLeaves = dbGet("leaves", []).filter(l => l.employeeId === u.id).sort((a, b) => (b.startDate > a.startDate ? 1 : -1));
      const daysThisYear = personLeaves.filter(l => (l.startDate || "").slice(0, 4) === String(currentYear)).reduce((s, l) => s + Number(l.daysCount || 0), 0);
      const remaining = remainingBalance(u.id);
      return `
        <div class="card" style="margin-bottom:10px">
          <div class="flex between wrap" style="align-items:center;margin-bottom:8px">
            <strong style="font-size:13.5px">${u.name} <span class="text-muted" style="font-weight:400">(${u.role})</span></strong>
            <div class="flex gap" style="flex-wrap:wrap">
              <span class="badge orange">${daysThisYear} يوم إجازة هذا العام</span>
              <span class="badge ${remaining < 0 ? "red" : "green"}">المتبقي من الرصيد السنوي: ${remaining} من ${entitlementFor(u.id)}</span>
            </div>
          </div>
          ${personLeaves.length ? personLeaves.map(l => `
            <div class="flex between wrap" style="gap:8px;border:1px solid var(--border);border-radius:8px;padding:7px 10px;margin-bottom:6px;font-size:12.5px">
              <span style="font-weight:700">${leaveTypeDisplay(l)}</span>
              <span dir="ltr" class="text-muted">${l.startDate} → ${l.endDate} (${l.daysCount} يوم)</span>
              ${l.deductFromBalance ? `<span class="badge gray">من الرصيد السنوي</span>` : ""}
              ${l.pendingGmApproval ? (isGM ? `<button class="btn sm" data-approveleave="${l.id}">بانتظار موافقتك — اعتماد</button>` : `<span class="badge orange">بانتظار موافقة المدير العام</span>`) : ""}
              ${l.notes ? `<span class="text-muted">${l.notes}</span>` : ""}
              ${l.photo ? `<a href="${l.photo}" target="_blank" class="veh-doc-thumb"><img src="${l.photo}"></a>` : ""}
              <button class="btn sm danger" data-delleave="${l.id}">حذف</button>
            </div>
          `).join("") : `<p class="text-muted" style="font-size:12px;margin:0">لا توجد إجازات مسجّلة له بعد</p>`}
        </div>`;
    }).join("");
  }

  el.innerHTML = `
    <div class="card">
      <h3 class="mt-0">أيام الإجازة الأسبوعية الثابتة</h3>
      <p class="text-muted" style="font-size:12.5px;margin-top:-6px">حدّد يوماً أو أكثر كإجازة أسبوعية ثابتة لكل موظف — للعلم فقط، لا تمنع أي إجراء آخر في النظام.</p>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>الاسم</th><th>المسمى الوظيفي</th>${WEEKDAYS.map(d => `<th style="text-align:center">${d.label}</th>`).join("")}</tr></thead>
          <tbody>
            ${users.length ? users.map(u => `
              <tr>
                <td>${u.name}</td>
                <td class="text-muted">${u.role}</td>
                ${WEEKDAYS.map(d => `<td style="text-align:center"><input type="checkbox" data-dayoff="${u.id}:${d.key}" ${(u.weeklyDaysOff || []).includes(d.key) ? "checked" : ""} style="width:auto"></td>`).join("")}
              </tr>`).join("") : `<tr><td colspan="${2 + WEEKDAYS.length}"><div class="empty-state"><div class="ic">👤</div>لا يوجد مستخدمون بعد</div></td></tr>`}
          </tbody>
        </table>
      </div>
    </div>

    <div class="card">
      <div class="flex between wrap" style="align-items:center">
        <div><h3 class="mt-0">الإجازات المسجّلة</h3><p class="text-muted" style="font-size:12.5px;margin-top:-8px">فترة محددة بتاريخين لكل موظف حسب أنواع الإجازات في نظام العمل السعودي</p></div>
        <div class="flex gap">
          <button class="btn sm" id="holidayBulkToggle" type="button">+ إضافة عطلة رسمية لجميع الموظفين</button>
          <button class="btn sm primary" id="addLeaveToggle" type="button">+ إضافة إجازة</button>
        </div>
      </div>
      <div id="holidayBulkForm"></div>
      <div id="leaveForm"></div>
    </div>

    <div id="leavesListWrap">${leavesListHtml()}</div>
  `;

  el.querySelectorAll("[data-dayoff]").forEach(chk => chk.onchange = () => {
    const [userId, dayKey] = chk.dataset.dayoff.split(":");
    const list = dbGet("users", []);
    const u = list.find(x => x.id === userId);
    const current = u.weeklyDaysOff || [];
    u.weeklyDaysOff = chk.checked ? [...current, dayKey] : current.filter(d => d !== dayKey);
    dbSet("users", list);
    toast("تم الحفظ");
  });

  /* ---- عطلة رسمية لجميع الموظفين دفعة واحدة ---- */
  document.getElementById("holidayBulkToggle").onclick = () => {
    const box = document.getElementById("holidayBulkForm");
    if (box.innerHTML) { box.innerHTML = ""; return; }
    box.innerHTML = `
      <div class="card" style="background:#f8f5f0;margin-top:10px">
        <p class="text-muted" style="font-size:12px;margin-top:0">تُسجَّل هذه العطلة تلقائياً لكل الموظفين الحاليين (${users.length}) — لا تُخصَم من الرصيد السنوي. التواريخ الفعلية (خصوصاً عيدي الفطر والأضحى) تتغيّر كل عام حسب التقويم الهجري، فتُدخَل يدوياً.</p>
        <div class="grid cols-3">
          <div class="field"><label>العطلة</label>
            <select id="hb_key">${Object.keys(OFFICIAL_HOLIDAYS).map(k => `<option value="${k}">${OFFICIAL_HOLIDAYS[k].label} (${OFFICIAL_HOLIDAYS[k].days} أيام)</option>`).join("")}</select>
          </div>
          <div class="field"><label>تاريخ بداية العطلة</label><input type="date" id="hb_start"></div>
          <div class="field"><label>تاريخ النهاية (محتسَب)</label><input type="text" id="hb_end" disabled></div>
        </div>
        <button class="btn primary sm" id="hb_save">إضافة للجميع (${users.length} موظف)</button>
      </div>`;
    function syncEnd() {
      const key = document.getElementById("hb_key").value;
      const start = document.getElementById("hb_start").value;
      document.getElementById("hb_end").value = start ? addInclusiveDays(start, OFFICIAL_HOLIDAYS[key].days) : "";
    }
    document.getElementById("hb_key").onchange = syncEnd;
    document.getElementById("hb_start").onchange = syncEnd;
    document.getElementById("hb_save").onclick = () => {
      const key = document.getElementById("hb_key").value;
      const start = document.getElementById("hb_start").value;
      if (!start || !users.length) { toast("يرجى اختيار تاريخ البداية"); return; }
      const end = addInclusiveDays(start, OFFICIAL_HOLIDAYS[key].days);
      const list = dbGet("leaves", []);
      users.forEach(u => {
        list.push({
          id: uid("lv"), employeeId: u.id, leaveType: "official_holiday",
          startDate: start, endDate: end, daysCount: daysBetweenInclusive(start, end),
          notes: OFFICIAL_HOLIDAYS[key].label, deductFromBalance: false, createdAt: new Date().toISOString(),
        });
      });
      dbSet("leaves", list);
      logActivity(`تم إضافة عطلة رسمية "${OFFICIAL_HOLIDAYS[key].label}" لجميع الموظفين (${users.length})`);
      toast("تمت إضافة العطلة لجميع الموظفين");
      renderSettings(el.parentElement);
    };
  };

  /* ---- نموذج إضافة إجازة ---- */
  document.getElementById("addLeaveToggle").onclick = () => {
    const box = document.getElementById("leaveForm");
    if (box.innerHTML) { box.innerHTML = ""; return; }
    box.innerHTML = `
      <div class="card" style="margin-top:10px">
        <div class="grid cols-2">
          <div class="field"><label>الموظف</label>
            <select id="lv_employee">
              <option value="" disabled selected>اختر موظف</option>
              ${users.map(u => `<option value="${u.id}">${u.name} (${u.role})</option>`).join("")}
            </select>
          </div>
          <div class="field"><label>نوع الإجازة</label>
            <select id="lv_type">${Object.keys(LEAVE_TYPE_LABELS_AR).map(k => `<option value="${k}" ${k === "sick" ? "selected" : ""}>${LEAVE_TYPE_LABELS_AR[k]}</option>`).join("")}</select>
          </div>
        </div>
        <div id="lv_extra"></div>
        <div class="grid cols-2">
          <div class="field"><label>من تاريخ</label><input type="date" id="lv_start"></div>
          <div class="field"><label>إلى تاريخ</label><input type="date" id="lv_end"></div>
        </div>
        <label class="chk"><input type="checkbox" id="lv_deduct"> خصم من رصيد الإجازة السنوي</label>
        <div id="lv_balanceNote"></div>
        <div class="field"><label>ملاحظات (اختياري)</label><input id="lv_notes"></div>
        <div class="field">
          <label>صورة مرفقة بالملاحظات (اختياري، مثل تقرير طبي)</label>
          <input type="file" id="lv_photo" accept="image/*">
          <div id="lv_photoPreview" class="flex wrap" style="margin-top:8px"></div>
        </div>
        <div class="flex gap"><button class="btn primary sm" id="lv_save">حفظ</button><button class="btn sm" id="lv_cancel" type="button">إلغاء</button></div>
      </div>`;

    let leavePhoto = null;
    document.getElementById("lv_photo").onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) { leavePhoto = null; document.getElementById("lv_photoPreview").innerHTML = ""; return; }
      leavePhoto = await fileToDataURL(file);
      document.getElementById("lv_photoPreview").innerHTML = `<span class="file-chip">📎 ${file.name}</span>`;
    };

    function refreshExtra() {
      const employeeId = document.getElementById("lv_employee").value;
      const type = document.getElementById("lv_type").value;
      const start = document.getElementById("lv_start").value;
      const end = document.getElementById("lv_end").value;
      const user = users.find(u => u.id === employeeId);
      let html = "";

      if (type === "other") {
        html += `<div class="field"><label>حدِّد نوع الإجازة</label><input id="lv_otherLabel"></div>`;
      }
      if (type === "paid") {
        const entitlement = entitlementFor(employeeId || "");
        let eligible = true;
        if (user && user.hireDate) {
          const oneYearAfterHire = new Date(user.hireDate);
          oneYearAfterHire.setFullYear(oneYearAfterHire.getFullYear() + 1);
          eligible = new Date() >= oneYearAfterHire;
        }
        if (!eligible) html += `<div class="card" style="background:#fdecea;padding:10px 14px;margin-bottom:14px"><span class="danger" style="font-size:12px">لا يحق لهذا الموظف إجازة مدفوعة قبل إتمام ١٢ شهراً من تاريخ التعيين</span></div>`;
        html += `<div class="card" style="background:#f4f5f7;padding:10px 14px;margin-bottom:14px"><span class="text-muted" style="font-size:12px">استحقاق هذا الموظف السنوي: ${entitlement} يوماً${entitlement > ANNUAL_LEAVE_BALANCE_DAYS ? " (بعد إتمام ٥ سنوات خدمة)" : ""}. يُدفع أجر الإجازة السنوية مقدماً، ولا يجوز التنازل عنها بمقابل نقدي أثناء العمل.</span></div>`;
      }
      if (LEAVE_TYPE_ONCE_PER_SERVICE.includes(type)) {
        const usedBefore = employeeId && dbGet("leaves", []).some(l => l.employeeId === employeeId && l.leaveType === type);
        html += `<div class="card" style="background:#f4f5f7;padding:10px 14px;margin-bottom:14px"><span class="text-muted" style="font-size:12px">إجازة الحج مرة واحدة فقط طوال فترة الخدمة، بشرط ألا يكون قد أداها سابقاً — من ١٠ إلى ١٥ يوماً بأجر.${usedBefore ? '<br><strong style="color:var(--warning)">تنبيه: يوجد لهذا الموظف سجل إجازة حج سابق في النظام — تأكد قبل الإضافة.</strong>' : ""}</span></div>`;
      }
      const fixedDays = LEAVE_TYPE_FIXED_DAYS[type];
      if (fixedDays) {
        html += `<div class="card" style="background:#f4f5f7;padding:10px 14px;margin-bottom:14px"><span class="text-muted" style="font-size:12px">${type === "iddah" ? "المدة الشرعية: ٤ أشهر و١٠ أيام هجرية (≈ ١٣٠ يوماً) — تاريخ النهاية اقتراح تقريبي، يُنصح بمراجعته يدوياً." : `المدة القانونية: ${fixedDays} أيام بأجر كامل — تاريخ النهاية اقتُرح تلقائياً، يمكن تعديله.`}</span></div>`;
      }
      if (type === "sick" && employeeId && start && end && end >= start) {
        const bd = sickLeavePayBreakdown(usedSickDaysThisYear(employeeId), daysBetweenInclusive(start, end));
        if (bd.threeQuarterPayDays > 0 || bd.unpaidDays > 0) {
          html += `<div class="card" style="background:#fdf6ec;padding:10px 14px;margin-bottom:14px"><span style="font-size:12px;color:var(--warning)">توزيع الأجر لهذه الإجازة: ${bd.fullPayDays} يوم بأجر كامل، ${bd.threeQuarterPayDays} يوم بثلاثة أرباع الأجر، ${bd.unpaidDays} يوم بدون أجر (حسب إجمالي أيامه المرضية هذا العام).</span></div>`;
        }
      }
      document.getElementById("lv_extra").innerHTML = html;

      const otherInput = document.getElementById("lv_otherLabel");
      if (otherInput) otherInput.value = "";
    }

    function refreshBalanceNote() {
      const employeeId = document.getElementById("lv_employee").value;
      const deduct = document.getElementById("lv_deduct").checked;
      const box = document.getElementById("lv_balanceNote");
      if (!deduct || !employeeId) { box.innerHTML = ""; return; }
      const remaining = remainingBalance(employeeId);
      box.innerHTML = `<div class="card" style="background:${remaining <= 0 ? "#fdf6ec" : "#f4f5f7"};padding:8px 14px;margin-bottom:14px">
        <span style="font-size:12px;color:${remaining <= 0 ? "var(--warning)" : "var(--text-muted)"}">المتبقي من رصيده حالياً: ${remaining} يوماً${remaining <= 0 ? " — إن تجاوزت هذه الإجازة الرصيد، سيصل تنبيه للمدير العام للموافقة عليها" : ""}</span>
      </div>`;
    }

    function handleTypeChange() {
      const type = document.getElementById("lv_type").value;
      const start = document.getElementById("lv_start").value;
      const fixedDays = LEAVE_TYPE_FIXED_DAYS[type];
      if (fixedDays && start) document.getElementById("lv_end").value = addInclusiveDays(start, fixedDays);
      refreshExtra();
    }
    function handleStartChange() {
      const type = document.getElementById("lv_type").value;
      const start = document.getElementById("lv_start").value;
      const fixedDays = LEAVE_TYPE_FIXED_DAYS[type];
      if (fixedDays && start) document.getElementById("lv_end").value = addInclusiveDays(start, fixedDays);
      refreshExtra();
    }

    document.getElementById("lv_employee").onchange = () => { refreshExtra(); refreshBalanceNote(); };
    document.getElementById("lv_type").onchange = handleTypeChange;
    document.getElementById("lv_start").onchange = handleStartChange;
    document.getElementById("lv_end").onchange = refreshExtra;
    document.getElementById("lv_deduct").onchange = refreshBalanceNote;
    refreshExtra();

    document.getElementById("lv_cancel").onclick = () => { box.innerHTML = ""; };

    document.getElementById("lv_save").onclick = () => {
      const employeeId = document.getElementById("lv_employee").value;
      const leaveType = document.getElementById("lv_type").value;
      const start = document.getElementById("lv_start").value;
      const end = document.getElementById("lv_end").value;
      const deductFromBalance = document.getElementById("lv_deduct").checked;
      const notes = document.getElementById("lv_notes").value.trim();
      const user = users.find(u => u.id === employeeId);

      if (!employeeId) { toast("يرجى اختيار الموظف"); return; }
      if (!start || !end) { toast("يرجى تحديد تاريخي البداية والنهاية"); return; }
      if (end < start) { toast("تاريخ الانتهاء يجب أن يكون بعد تاريخ البدء"); return; }
      const otherInput = document.getElementById("lv_otherLabel");
      const otherTypeLabel = otherInput ? otherInput.value.trim() : "";
      if (leaveType === "other" && !otherTypeLabel) { toast('يجب كتابة نوع الإجازة عند اختيار "أخرى"'); return; }
      if (leaveType === "paid" && user && user.hireDate) {
        const oneYearAfterHire = new Date(user.hireDate);
        oneYearAfterHire.setFullYear(oneYearAfterHire.getFullYear() + 1);
        if (new Date() < oneYearAfterHire) { toast("لا يحق لهذا الموظف إجازة مدفوعة قبل إتمام ١٢ شهراً من تاريخ التعيين"); return; }
      }

      const daysCount = daysBetweenInclusive(start, end);
      let pendingGmApproval = false;
      if (deductFromBalance) {
        const usedSoFar = usedAnnualBalance(employeeId);
        pendingGmApproval = usedSoFar + daysCount > entitlementFor(employeeId);
      }

      const list = dbGet("leaves", []);
      list.push({
        id: uid("lv"), employeeId, leaveType,
        otherTypeLabel: leaveType === "other" ? otherTypeLabel : undefined,
        startDate: start, endDate: end, daysCount, notes: notes || undefined,
        deductFromBalance, pendingGmApproval, photo: leavePhoto,
        createdAt: new Date().toISOString(),
      });
      dbSet("leaves", list);
      logActivity(`تم تسجيل إجازة "${LEAVE_TYPE_LABELS_AR[leaveType]}" للموظف "${user ? user.name : ""}" (${daysCount} يوم)`);
      toast(pendingGmApproval ? "تم تسجيل الإجازة — بانتظار موافقة المدير العام (تجاوزت الرصيد السنوي)" : "تم تسجيل الإجازة");
      renderSettings(el.parentElement);
    };
  };

  el.querySelectorAll("[data-approveleave]").forEach(b => b.onclick = () => {
    const list = dbGet("leaves", []);
    const l = list.find(x => x.id === b.dataset.approveleave);
    l.pendingGmApproval = false;
    dbSet("leaves", list);
    logActivity(`تم اعتماد إجازة تجاوزت الرصيد السنوي (${leaveTypeDisplay(l)})`);
    toast("تم الاعتماد");
    renderSettings(el.parentElement);
  });

  el.querySelectorAll("[data-delleave]").forEach(b => b.onclick = () => {
    const list = dbGet("leaves", []);
    const l = list.find(x => x.id === b.dataset.delleave);
    const person = users.find(u => u.id === l.employeeId);
    if (!confirm(`حذف إجازة ${person ? person.name : ""} (${leaveTypeDisplay(l)}، ${l.startDate} - ${l.endDate})؟`)) return;
    dbSet("leaves", list.filter(x => x.id !== l.id));
    logActivity(`تم حذف إجازة "${leaveTypeDisplay(l)}" للموظف "${person ? person.name : ""}"`);
    renderSettings(el.parentElement);
  });
}

/* ---------- تبويب المركبات ---------- */
const VEHICLE_OWNERSHIP_OPTIONS = ["ملكية الشركة", "مستأجرة"];
const VEHICLE_RENTAL_PERIODS = ["شهري", "يومي"];

function renderVehiclesTab(el) {
  const vehicles = dbGet("vehicles", []);
  const users = dbGet("users", []);
  const companyName = getCompanyProfile().name || "الشركة";

  function employeeOptions(selectedId) {
    return `<option value="">— بدون تحديد —</option>` +
      users.map(u => `<option value="${u.id}" ${selectedId === u.id ? "selected" : ""}>${u.name} — ${u.role}</option>`).join("");
  }

  function ownershipDetailsCell(v) {
    if (v.ownership === "مستأجرة") {
      return `
        <div class="flex" style="flex-direction:column;gap:5px;min-width:170px">
          <input value="${v.lessorName || ""}" placeholder="اسم الشركة المؤجرة" data-editv="${v.id}:lessorName" style="border:1px solid var(--border);border-radius:6px;padding:4px 7px;font-size:11.5px">
          <input type="date" value="${v.rentalStart || ""}" data-editv="${v.id}:rentalStart" style="border:1px solid var(--border);border-radius:6px;padding:4px 7px;font-size:11.5px">
          <input value="${v.rentalDuration || ""}" placeholder="مدة العقد" data-editv="${v.id}:rentalDuration" style="border:1px solid var(--border);border-radius:6px;padding:4px 7px;font-size:11.5px">
          <div class="flex" style="gap:5px">
            <select data-editv="${v.id}:rentalPeriod" style="border:1px solid var(--border);border-radius:6px;padding:4px 5px;font-size:11.5px">
              ${VEHICLE_RENTAL_PERIODS.map(p => `<option value="${p}" ${v.rentalPeriod === p ? "selected" : ""}>${p}</option>`).join("")}
            </select>
            <input type="number" min="0" step="0.01" value="${v.rentalAmount || ""}" placeholder="المبلغ" data-editv="${v.id}:rentalAmount" style="border:1px solid var(--border);border-radius:6px;padding:4px 7px;font-size:11.5px;width:90px">
          </div>
        </div>`;
    }
    return `<span class="text-muted" style="font-size:11.5px">المالك: ${companyName}</span>`;
  }

  el.innerHTML = `
    <div class="card">
      <h3 class="mt-0">إضافة مركبة جديدة</h3>
      <div class="grid cols-3">
        <div class="field"><label>نوع السيارة</label><input id="v_type" placeholder="مثال: بيك أب تويوتا هايلكس"></div>
        <div class="field"><label>الموديل</label><input id="v_model" placeholder="مثال: 2022"></div>
        <div class="field"><label>الملكية</label>
          <select id="v_ownership">${VEHICLE_OWNERSHIP_OPTIONS.map(o => `<option value="${o}">${o}</option>`).join("")}</select>
        </div>
        <div class="field"><label>رقم الاستمارة</label><input id="v_regNumber"></div>
        <div class="field"><label>رقم الهيكل</label><input id="v_chassisNumber"></div>
        <div class="field">
          <label>الموظف المرتبط بالمركبة</label>
          <select id="v_employee">${employeeOptions("")}</select>
        </div>
      </div>
      <div id="v_ownershipNote" class="card" style="background:#f4f5f7;padding:10px 14px;margin-bottom:14px"></div>
      <div id="v_rentalFields"></div>
      <div class="field">
        <label>صورة استمارة السيارة</label>
        <input type="file" id="v_regImage" accept="image/*">
      </div>
      <button class="btn primary" id="addVehicleBtn">+ إضافة مركبة</button>
    </div>

    <div class="card">
      <h3>المركبات المسجلة (${vehicles.length})</h3>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>نوع السيارة</th><th>الموديل</th><th>الملكية</th><th>تفاصيل الملكية</th><th>رقم الاستمارة</th><th>رقم الهيكل</th><th>الموظف المرتبط</th><th>صورة الاستمارة</th><th></th></tr></thead>
          <tbody>
            ${vehicles.length ? vehicles.map(v => `
              <tr>
                <td><input value="${v.type || ""}" data-editv="${v.id}:type" style="border:1px solid var(--border);border-radius:6px;padding:5px 8px;width:100%;min-width:130px"></td>
                <td><input value="${v.model || ""}" data-editv="${v.id}:model" style="border:1px solid var(--border);border-radius:6px;padding:5px 8px;width:90px"></td>
                <td>
                  <select data-vownersel="${v.id}" style="padding:6px 8px;border:1px solid var(--border);border-radius:6px;font-size:12.5px">
                    ${VEHICLE_OWNERSHIP_OPTIONS.map(o => `<option value="${o}" ${v.ownership === o ? "selected" : ""}>${o}</option>`).join("")}
                  </select>
                </td>
                <td>${ownershipDetailsCell(v)}</td>
                <td><input value="${v.regNumber || ""}" data-editv="${v.id}:regNumber" style="border:1px solid var(--border);border-radius:6px;padding:5px 8px;width:110px"></td>
                <td><input value="${v.chassisNumber || ""}" data-editv="${v.id}:chassisNumber" style="border:1px solid var(--border);border-radius:6px;padding:5px 8px;width:130px"></td>
                <td>
                  <select data-vempsel="${v.id}" style="padding:6px 8px;border:1px solid var(--border);border-radius:6px;font-size:12.5px">
                    ${employeeOptions(v.employeeId)}
                  </select>
                </td>
                <td>
                  ${v.regImage ? `<a href="${v.regImage}" target="_blank" class="veh-doc-thumb"><img src="${v.regImage}"></a>` : `<span class="text-muted" style="font-size:11.5px">لا توجد صورة</span>`}
                  <input type="file" accept="image/*" data-vimg="${v.id}" style="display:block;margin-top:6px;font-size:11px;max-width:130px">
                </td>
                <td><button class="btn sm danger" data-delveh="${v.id}">حذف</button></td>
              </tr>`).join("") : `<tr><td colspan="9"><div class="empty-state"><div class="ic">🚙</div>لا توجد مركبات مسجلة بعد</div></td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
  `;

  const ownershipSelect = document.getElementById("v_ownership");
  const ownershipNote = document.getElementById("v_ownershipNote");
  const rentalFieldsBox = document.getElementById("v_rentalFields");

  function syncOwnershipFields() {
    if (ownershipSelect.value === "مستأجرة") {
      ownershipNote.style.display = "none";
      rentalFieldsBox.innerHTML = `
        <div class="grid cols-3">
          <div class="field"><label>اسم الشركة المؤجرة</label><input id="v_lessorName"></div>
          <div class="field"><label>بداية العقد</label><input type="date" id="v_rentalStart"></div>
          <div class="field"><label>مدة العقد</label><input id="v_rentalDuration" placeholder="مثال: 12 شهر"></div>
          <div class="field"><label>نوع المبلغ</label><select id="v_rentalPeriod">${VEHICLE_RENTAL_PERIODS.map(p => `<option value="${p}">${p}</option>`).join("")}</select></div>
          <div class="field"><label>المبلغ (ر.س)</label><input type="number" min="0" step="0.01" id="v_rentalAmount"></div>
        </div>`;
    } else {
      rentalFieldsBox.innerHTML = "";
      ownershipNote.style.display = "";
      ownershipNote.innerHTML = `<span class="text-muted" style="font-size:12.5px">المالك: ${companyName}</span>`;
    }
  }
  ownershipSelect.onchange = syncOwnershipFields;
  syncOwnershipFields();

  let pendingNewImage = null;
  document.getElementById("v_regImage").onchange = async (e) => {
    const file = e.target.files[0];
    pendingNewImage = file ? await fileToDataURL(file) : null;
  };

  document.getElementById("addVehicleBtn").onclick = () => {
    const type = document.getElementById("v_type").value.trim();
    const model = document.getElementById("v_model").value.trim();
    const ownership = ownershipSelect.value;
    const regNumber = document.getElementById("v_regNumber").value.trim();
    const chassisNumber = document.getElementById("v_chassisNumber").value.trim();
    const employeeId = document.getElementById("v_employee").value;
    if (!type) { toast("يرجى إدخال نوع السيارة"); return; }
    const vehicle = {
      id: uid("veh"), type, model, ownership, regNumber, chassisNumber, employeeId,
      regImage: pendingNewImage, createdAt: new Date().toISOString(),
    };
    if (ownership === "مستأجرة") {
      vehicle.lessorName = document.getElementById("v_lessorName").value.trim();
      vehicle.rentalStart = document.getElementById("v_rentalStart").value;
      vehicle.rentalDuration = document.getElementById("v_rentalDuration").value.trim();
      vehicle.rentalPeriod = document.getElementById("v_rentalPeriod").value;
      vehicle.rentalAmount = Number(document.getElementById("v_rentalAmount").value) || 0;
    }
    const list = dbGet("vehicles", []);
    list.push(vehicle);
    dbSet("vehicles", list);
    logActivity(`تم إضافة مركبة جديدة "${type}"${model ? " موديل " + model : ""}`);
    toast("تم إضافة المركبة");
    renderSettings(el.parentElement);
  };

  function getVehicle(id) {
    const list = dbGet("vehicles", []);
    return { list, v: list.find(x => x.id === id) };
  }

  el.querySelectorAll("[data-editv]").forEach(inp => inp.onchange = () => {
    const [id, field] = inp.dataset.editv.split(":");
    const { list, v } = getVehicle(id);
    v[field] = field === "rentalAmount" ? (Number(inp.value) || 0) : inp.value.trim ? inp.value.trim() : inp.value;
    dbSet("vehicles", list);
    toast("تم الحفظ");
  });

  el.querySelectorAll("[data-vownersel]").forEach(sel => sel.onchange = () => {
    const { list, v } = getVehicle(sel.dataset.vownersel);
    v.ownership = sel.value;
    dbSet("vehicles", list);
    renderSettings(el.parentElement);
  });

  el.querySelectorAll("[data-vempsel]").forEach(sel => sel.onchange = () => {
    const { list, v } = getVehicle(sel.dataset.vempsel);
    v.employeeId = sel.value;
    dbSet("vehicles", list);
    toast("تم الحفظ");
  });

  el.querySelectorAll("[data-vimg]").forEach(inp => inp.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const { list, v } = getVehicle(inp.dataset.vimg);
    v.regImage = await fileToDataURL(file);
    dbSet("vehicles", list);
    toast("تم تحديث صورة الاستمارة");
    renderSettings(el.parentElement);
  });

  el.querySelectorAll("[data-delveh]").forEach(b => b.onclick = () => {
    const { list, v } = getVehicle(b.dataset.delveh);
    if (!confirm(`حذف المركبة "${v.type}"؟`)) return;
    dbSet("vehicles", list.filter(x => x.id !== v.id));
    logActivity(`تم حذف مركبة "${v.type}"`);
    renderSettings(el.parentElement);
  });
}

/* ---------- تبويب العهد والمصروفات ---------- */
function renderExpenseCatalogSettingsTab(el) {
  const catalog = getExpenseCatalog();
  el.innerHTML = `
    <div class="card">
      <div class="flex between"><h3 class="mt-0">العهد والمصروفات</h3>
        <button class="btn sm primary" id="addExpCatBtn">+ إضافة بند رئيسي</button>
      </div>
      <p class="text-muted" style="font-size:12.5px;margin-top:-6px">إدارة مسميات المصاريف الإدارية الرئيسية (مثل رواتب، مواد، إيجار) وبنودها الفرعية — تُستخدم هذه القائمة تلقائياً عند تسجيل مصروف إداري جديد</p>
      ${catalog.map(cat => `
        <div class="cat-block" data-catid="${cat.id}">
          <div class="cat-head">
            <div class="flex" style="align-items:center;gap:8px">
              <button class="btn sm" data-toggleexpcat="${cat.id}" style="padding:4px 9px">${EXPENSE_CAT_COLLAPSED[cat.id] ? "▸" : "▾"}</button>
              <strong>${cat.name}</strong>
              <span class="badge gray">${cat.items.length} بند فرعي</span>
            </div>
            <div class="flex" style="align-items:center;gap:6px">
              <button class="btn sm" data-addexpitem="${cat.id}">+ إضافة بند فرعي</button>
              <button class="btn sm" data-editexpcat="${cat.id}" title="تعديل الاسم">✏️</button>
              <button class="btn sm danger" data-delexpcat="${cat.id}" title="حذف">🗑️</button>
            </div>
          </div>
          ${!EXPENSE_CAT_COLLAPSED[cat.id] ? `
            ${cat.items.length ? cat.items.map(it => `
              <div class="exp-item-row">
                <span>${it.name}</span>
                <span class="flex" style="gap:6px">
                  <button class="btn sm" data-editexpitem="${cat.id}:${it.id}" title="تعديل">✏️</button>
                  <button class="btn sm danger" data-delexpitem="${cat.id}:${it.id}" title="حذف">🗑️</button>
                </span>
              </div>`).join("") : `<div class="text-muted" style="font-size:12px;padding:6px 4px">لا توجد بنود فرعية بعد</div>`}
          ` : ""}
        </div>
      `).join("")}
    </div>
  `;

  function saveCatalog(cat) { dbSet("expenseCatalog", cat); }

  document.getElementById("addExpCatBtn").onclick = () => {
    const name = (prompt("اسم البند الرئيسي الجديد:") || "").trim();
    if (!name) return;
    const cat = getExpenseCatalog();
    cat.push({ id: uid("ecat"), name, items: [] });
    saveCatalog(cat);
    logActivity(`تم إضافة بند مصروفات رئيسي "${name}"`);
    renderExpenseCatalogSettingsTab(el);
  };

  el.querySelectorAll("[data-toggleexpcat]").forEach(b => b.onclick = () => {
    EXPENSE_CAT_COLLAPSED[b.dataset.toggleexpcat] = !EXPENSE_CAT_COLLAPSED[b.dataset.toggleexpcat];
    renderExpenseCatalogSettingsTab(el);
  });

  el.querySelectorAll("[data-editexpcat]").forEach(b => b.onclick = () => {
    const cat = getExpenseCatalog();
    const c = cat.find(x => x.id === b.dataset.editexpcat);
    const name = (prompt("تعديل اسم البند الرئيسي:", c.name) || "").trim();
    if (!name || name === c.name) return;
    const oldName = c.name;
    c.name = name;
    saveCatalog(cat);
    logActivity(`تم تعديل اسم بند المصروفات "${oldName}" إلى: "${name}"`);
    renderExpenseCatalogSettingsTab(el);
  });

  el.querySelectorAll("[data-delexpcat]").forEach(b => b.onclick = () => {
    const cat = getExpenseCatalog();
    const c = cat.find(x => x.id === b.dataset.delexpcat);
    if (!confirm(`حذف بند "${c.name}" الرئيسي وكل بنوده الفرعية؟`)) return;
    saveCatalog(cat.filter(x => x.id !== b.dataset.delexpcat));
    logActivity(`تم حذف بند مصروفات رئيسي "${c.name}"`);
    renderExpenseCatalogSettingsTab(el);
  });

  el.querySelectorAll("[data-addexpitem]").forEach(b => b.onclick = () => {
    const name = (prompt("اسم البند الفرعي الجديد:") || "").trim();
    if (!name) return;
    const cat = getExpenseCatalog();
    const c = cat.find(x => x.id === b.dataset.addexpitem);
    c.items.push({ id: uid("eit"), name });
    saveCatalog(cat);
    logActivity(`تم إضافة بند فرعي "${name}" إلى "${c.name}"`);
    renderExpenseCatalogSettingsTab(el);
  });

  el.querySelectorAll("[data-editexpitem]").forEach(b => b.onclick = () => {
    const [catId, itemId] = b.dataset.editexpitem.split(":");
    const cat = getExpenseCatalog();
    const c = cat.find(x => x.id === catId);
    const it = c.items.find(x => x.id === itemId);
    const name = (prompt("تعديل اسم البند الفرعي:", it.name) || "").trim();
    if (!name || name === it.name) return;
    it.name = name;
    saveCatalog(cat);
    logActivity(`تم تعديل بند فرعي في "${c.name}" إلى: "${name}"`);
    renderExpenseCatalogSettingsTab(el);
  });

  el.querySelectorAll("[data-delexpitem]").forEach(b => b.onclick = () => {
    const [catId, itemId] = b.dataset.delexpitem.split(":");
    const cat = getExpenseCatalog();
    const c = cat.find(x => x.id === catId);
    const it = c.items.find(x => x.id === itemId);
    if (!confirm(`حذف البند الفرعي "${it.name}"؟`)) return;
    c.items = c.items.filter(x => x.id !== itemId);
    saveCatalog(cat);
    logActivity(`تم حذف بند فرعي "${it.name}" من "${c.name}"`);
    renderExpenseCatalogSettingsTab(el);
  });
}

/* ---------- تبويب سجل العمليات ---------- */
function activityLogTimeText(iso) {
  const d = new Date(iso);
  const datePart = d.toLocaleDateString("ar-SA-u-ca-gregory", { year: "numeric", month: "long", day: "numeric" });
  const timePart = d.toLocaleTimeString("ar-SA-u-ca-gregory", { hour: "numeric", minute: "2-digit" });
  return `${datePart} — الساعة ${timePart}`;
}

function renderActivityLogTab(el) {
  let log = getActivityLog();
  if (ACTIVITY_LOG_SEARCH.trim()) {
    const q = ACTIVITY_LOG_SEARCH.trim().toLowerCase();
    log = log.filter(x => (x.message || "").toLowerCase().includes(q) || (x.userName || "").toLowerCase().includes(q));
  }
  const canDelete = hasPermission((getCurrentUser() || {}).role, "activity_log_delete");

  el.innerHTML = `
    <div class="card" style="background:#eef4fd;border-color:#cfe0f7">
      <p style="font-size:12.5px;margin:0;color:#1d4ed8">سجل كامل بكل عملية إضافة أو تعديل أو حذف مؤثرة في النظام، مع من قام بها ووقتها.${canDelete ? " يمكن للمدير العام حذف واحد أو أكثر من السطور بتحديدها." : ""}</p>
    </div>
    <div class="card">
      <div class="flex between" style="align-items:center;flex-wrap:wrap;gap:10px">
        ${canDelete ? `<button class="btn danger" id="delSelectedLogBtn">🗑️ حذف المحدد</button>` : `<span></span>`}
        <div class="field" style="max-width:340px;margin-bottom:0;flex:1">
          <input id="activityLogSearch" placeholder="ابحث بنوع العملية أو اسم المستخدم..." value="${ACTIVITY_LOG_SEARCH}">
        </div>
        ${canDelete ? `<label class="chk"><input type="checkbox" id="selectAllLogChk"> تحديد الكل</label>` : ""}
      </div>
    </div>
    <div class="card" style="padding:0">
      ${log.length ? log.map(x => `
        <div class="activity-log-row">
          ${canDelete ? `<input type="checkbox" data-logsel="${x.id}">` : ""}
          <div class="activity-log-body">
            <div class="activity-log-msg">${x.message}</div>
            <div class="activity-log-meta">بواسطة ${x.userName} — ${activityLogTimeText(x.createdAt)}</div>
          </div>
        </div>`).join("") : `<div class="empty-state"><div class="ic">🕓</div>لا توجد عمليات مسجلة بعد</div>`}
    </div>
  `;

  document.getElementById("activityLogSearch").oninput = (e) => { ACTIVITY_LOG_SEARCH = e.target.value; renderActivityLogTab(el); };

  const selectAllChk = document.getElementById("selectAllLogChk");
  if (selectAllChk) selectAllChk.onchange = (e) => {
    el.querySelectorAll("[data-logsel]").forEach(c => c.checked = e.target.checked);
  };

  const delBtn = document.getElementById("delSelectedLogBtn");
  if (delBtn) delBtn.onclick = () => {
    const ids = [...el.querySelectorAll("[data-logsel]:checked")].map(c => c.dataset.logsel);
    if (!ids.length) { toast("يرجى تحديد سطر واحد على الأقل"); return; }
    if (!confirm(`حذف ${ids.length} سطر من سجل العمليات؟`)) return;
    deleteActivityLogEntries(ids);
    toast("تم حذف السطور المحددة");
    renderActivityLogTab(el);
  };
}

/* ---------- تبويب الصلاحيات ---------- */
function renderPermissionsTab(el) {
  const matrix = getPermMatrix();
  el.innerHTML = `
    <div class="card">
      <div class="flex between" style="align-items:center">
        <div>
          <h3 class="mt-0">مصفوفة الصلاحيات</h3>
          <p class="text-muted" style="font-size:12.5px;margin-top:-8px">حدد الصلاحيات المتاحة لكل مسمى وظيفي بوضع علامة صح — يتم الحفظ تلقائياً عند كل تغيير</p>
        </div>
        <button class="btn sm" id="permResetBtn" type="button">إعادة الافتراضي</button>
      </div>
      <div class="table-wrap">
        <table class="data-table perm-matrix">
          <thead>
            <tr>
              <th>الصلاحية</th>
              ${ROLES.map(r => `<th style="text-align:center">${r}</th>`).join("")}
            </tr>
          </thead>
          <tbody>
            ${PERMISSION_GROUPS.map(g => `
              <tr class="perm-group-row"><td colspan="${ROLES.length + 1}">${g.group}</td></tr>
              ${g.perms.map(p => `
                <tr>
                  <td>${p.label}</td>
                  ${ROLES.map(r => `
                    <td style="text-align:center">
                      <input type="checkbox" data-permkey="${p.key}" data-permrole="${r}" ${matrix[p.key] && matrix[p.key][r] ? "checked" : ""} style="width:auto">
                    </td>
                  `).join("")}
                </tr>
              `).join("")}
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;

  el.querySelectorAll("[data-permkey]").forEach(chk => chk.onchange = () => {
    const m = getPermMatrix();
    const key = chk.dataset.permkey, role = chk.dataset.permrole;
    if (!m[key]) m[key] = {};
    m[key][role] = chk.checked;
    setPermMatrix(m);
    const cur = getCurrentUser();
    if (cur && cur.role === role && !chk.checked && !canAccess(role, "settings")) {
      toast("تم حفظ الصلاحيات — تنبيه: تم سحب صلاحية الوصول للإعدادات عن مسماك الوظيفي الحالي");
    } else {
      toast("تم حفظ الصلاحيات");
    }
  });

  document.getElementById("permResetBtn").onclick = () => {
    if (!confirm("إعادة جميع الصلاحيات إلى الإعدادات الافتراضية؟")) return;
    setPermMatrix(defaultPermMatrix());
    toast("تم استعادة الصلاحيات الافتراضية");
    renderSettings(el.parentElement);
  };
}

/* ---------- تبويب بيانات المؤسسة ---------- */
function renderCompanyTab(el) {
  const profile = getCompanyProfile();
  const users = dbGet("users", []);
  el.innerHTML = `
    <div class="card">
      <h3>بيانات المؤسسة وشعارها</h3>
      <p class="text-muted" style="font-size:12.5px;margin-top:-6px">تظهر هذه البيانات في ترويسة عرض السعر النهائي المرسل للعميل (يمكن إظهارها أو إخفاؤها لكل عرض سعر على حدة عند إنشائه).</p>

      <div class="company-logo-preview" id="logoPreview">${profile.logo ? `<img src="${profile.logo}">` : "الشعار"}</div>
      <div class="field" style="max-width:340px">
        <label>رفع شعار المؤسسة (صورة)</label>
        <input type="file" id="cp_logo" accept="image/*">
        ${profile.logo ? `<button type="button" class="btn sm danger" id="cp_removeLogo" style="margin-top:8px">إزالة الشعار</button>` : ""}
      </div>

      <div class="grid cols-2">
        <div class="field" style="grid-column:span 2"><label>اسم المؤسسة</label><input id="cp_name" value="${profile.name || ""}"></div>
        <div class="field"><label>رقم الجوال</label><input id="cp_phone" value="${profile.phone || ""}"></div>
        <div class="field"><label>البريد الإلكتروني</label><input id="cp_email" value="${profile.email || ""}"></div>
        <div class="field"><label>الرقم الضريبي</label><input id="cp_tax" value="${profile.taxNumber || ""}"></div>
        <div class="field"><label>رقم السجل التجاري</label><input id="cp_cr" value="${profile.crNumber || ""}"></div>
        <div class="field" style="grid-column:span 2"><label>العنوان</label><input id="cp_address" value="${profile.address || ""}"></div>
        <div class="field" style="grid-column:span 2">
          <label>اسم المسؤول</label>
          <select id="cp_contact">
            <option value="">— بدون تحديد —</option>
            ${users.map(u => `<option value="${u.id}" ${profile.contactUserId === u.id ? "selected" : ""}>${u.name} — ${u.role}</option>`).join("")}
          </select>
          <div class="hint">يُختار من المستخدمين المسجلين في صفحة الإعدادات ← التحكم بالمستخدمين</div>
        </div>
      </div>
      <button class="btn primary" id="cp_save">💾 حفظ بيانات المؤسسة</button>
    </div>
  `;

  let pendingLogo = profile.logo || null;

  document.getElementById("cp_logo").onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    pendingLogo = await fileToDataURL(file);
    document.getElementById("logoPreview").innerHTML = `<img src="${pendingLogo}">`;
  };

  const removeBtn = document.getElementById("cp_removeLogo");
  if (removeBtn) removeBtn.onclick = () => {
    pendingLogo = null;
    document.getElementById("logoPreview").innerHTML = "الشعار";
  };

  document.getElementById("cp_save").onclick = () => {
    setCompanyProfile({
      name: document.getElementById("cp_name").value.trim(),
      phone: document.getElementById("cp_phone").value.trim(),
      email: document.getElementById("cp_email").value.trim(),
      taxNumber: document.getElementById("cp_tax").value.trim(),
      crNumber: document.getElementById("cp_cr").value.trim(),
      address: document.getElementById("cp_address").value.trim(),
      contactUserId: document.getElementById("cp_contact").value,
      logo: pendingLogo,
    });
    toast("تم حفظ بيانات المؤسسة");
    renderSettings(el.parentElement);
  };
}

/* ---------- تبويب المستخدمين ---------- */
function renderUsersTab(el) {
  const users = dbGet("users", []);
  const isGM = (getCurrentUser() || {}).role === "مدير عام";
  el.innerHTML = `
    <div class="card">
      <div class="flex between"><h3 class="mt-0">إضافة مستخدم جديد</h3></div>
      <div class="grid cols-3">
        <div class="field"><label>الاسم الكامل</label><input id="u_name"></div>
        <div class="field"><label>اسم المستخدم</label><input id="u_username"></div>
        <div class="field"><label>المسمى الوظيفي</label><select id="u_role">${ROLES.map(r => `<option value="${r}">${r}</option>`).join("")}</select></div>
        <div class="field"><label>الرقم السري (اختياري)</label><input type="password" id="u_password" placeholder="اتركه فارغاً لعدم اشتراط رقم سري"></div>
        <div class="field"><label>تاريخ التعيين (اختياري)</label><input type="date" id="u_hireDate"></div>
      </div>
      <button class="btn primary" id="addUserBtn">+ إضافة مستخدم</button>
    </div>

    <div class="card">
      <h3>المستخدمون الحاليون (${users.length})</h3>
      ${isGM ? `<p class="text-muted" style="font-size:12px;margin-top:-6px">يمكنك كمدير عام تعديل اسم الموظف واسم المستخدم مباشرة من الجدول</p>` : ""}
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>الاسم</th><th>اسم المستخدم</th><th>المسمى الوظيفي</th><th>الرقم السري</th><th>تاريخ التعيين</th><th></th></tr></thead>
          <tbody>
            ${users.map(u => `
              <tr>
                <td>${isGM ? `<input data-editname="${u.id}" value="${u.name}" style="border:1px solid var(--border);border-radius:6px;padding:5px 8px;width:100%;min-width:130px">` : u.name}</td>
                <td class="text-muted">${isGM ? `<input data-editusername="${u.id}" value="${u.username}" style="border:1px solid var(--border);border-radius:6px;padding:5px 8px;width:100%;min-width:110px">` : u.username}</td>
                <td>
                  <select data-rolesel="${u.id}" style="padding:6px 8px;border:1px solid var(--border);border-radius:6px;font-size:12.5px">
                    ${ROLES.map(r => `<option value="${r}" ${u.role === r ? "selected" : ""}>${r}</option>`).join("")}
                  </select>
                </td>
                <td><input type="password" data-editpass="${u.id}" value="${u.password || ""}" placeholder="بدون رقم سري" style="border:1px solid var(--border);border-radius:6px;padding:5px 8px;width:110px"></td>
                <td><input type="date" data-edithire="${u.id}" value="${u.hireDate || ""}" style="border:1px solid var(--border);border-radius:6px;padding:5px 8px"></td>
                <td><button class="btn sm danger" data-deluser="${u.id}">حذف</button></td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;

  document.getElementById("addUserBtn").onclick = () => {
    const name = document.getElementById("u_name").value.trim();
    const username = document.getElementById("u_username").value.trim();
    const role = document.getElementById("u_role").value;
    const password = document.getElementById("u_password").value;
    const hireDate = document.getElementById("u_hireDate").value;
    if (!name || !username) { toast("يرجى إدخال الاسم واسم المستخدم"); return; }
    const list = dbGet("users", []);
    list.push({ id: uid("u"), name, username, role, password, hireDate });
    dbSet("users", list);
    logActivity(`تم إضافة مستخدم جديد "${name}" بمسمى وظيفي: ${role}`);
    toast("تم إضافة المستخدم");
    renderSettings(el.parentElement);
  };

  el.querySelectorAll("[data-rolesel]").forEach(sel => sel.onchange = () => {
    const list = dbGet("users", []);
    const u = list.find(x => x.id === sel.dataset.rolesel);
    u.role = sel.value;
    dbSet("users", list);
    logActivity(`تم تغيير المسمى الوظيفي للمستخدم "${u.name}" إلى: ${u.role}`);
    toast("تم تحديث المسمى الوظيفي");
    const cur = getCurrentUser();
    if (cur && cur.id === u.id) setCurrentUser(u);
  });

  el.querySelectorAll("[data-editpass]").forEach(inp => inp.onchange = () => {
    const list = dbGet("users", []);
    const u = list.find(x => x.id === inp.dataset.editpass);
    u.password = inp.value;
    dbSet("users", list);
    logActivity(`تم تحديث الرقم السري للمستخدم "${u.name}"`);
    toast("تم تحديث الرقم السري");
    const cur = getCurrentUser();
    if (cur && cur.id === u.id) setCurrentUser(u);
  });

  el.querySelectorAll("[data-edithire]").forEach(inp => inp.onchange = () => {
    const list = dbGet("users", []);
    const u = list.find(x => x.id === inp.dataset.edithire);
    u.hireDate = inp.value;
    dbSet("users", list);
    logActivity(`تم تحديث تاريخ تعيين الموظف "${u.name}"`);
    toast("تم تحديث تاريخ التعيين");
  });

  el.querySelectorAll("[data-editname]").forEach(inp => inp.onchange = () => {
    const list = dbGet("users", []);
    const u = list.find(x => x.id === inp.dataset.editname);
    const newName = inp.value.trim();
    if (!newName) { toast("يرجى إدخال اسم صحيح"); inp.value = u.name; return; }
    const oldName = u.name;
    u.name = newName;
    dbSet("users", list);
    logActivity(`تم تعديل اسم الموظف "${oldName}" إلى: "${newName}"`);
    toast("تم تحديث الاسم");
    const cur = getCurrentUser();
    if (cur && cur.id === u.id) setCurrentUser(u);
  });

  el.querySelectorAll("[data-editusername]").forEach(inp => inp.onchange = () => {
    const list = dbGet("users", []);
    const u = list.find(x => x.id === inp.dataset.editusername);
    const newUsername = inp.value.trim();
    if (!newUsername) { toast("يرجى إدخال اسم مستخدم صحيح"); inp.value = u.username; return; }
    u.username = newUsername;
    dbSet("users", list);
    logActivity(`تم تعديل اسم المستخدم لـ "${u.name}" إلى: "${newUsername}"`);
    toast("تم تحديث اسم المستخدم");
    const cur = getCurrentUser();
    if (cur && cur.id === u.id) setCurrentUser(u);
  });

  el.querySelectorAll("[data-deluser]").forEach(b => b.onclick = () => {
    const cur = getCurrentUser();
    if (cur && cur.id === b.dataset.deluser) { toast("لا يمكن حذف المستخدم الحالي المسجل دخوله"); return; }
    if (!confirm("هل تريد حذف هذا المستخدم؟")) return;
    const target = dbGet("users", []).find(u => u.id === b.dataset.deluser);
    dbSet("users", dbGet("users", []).filter(u => u.id !== b.dataset.deluser));
    if (target) logActivity(`تم حذف المستخدم "${target.name}"`);
    renderSettings(el.parentElement);
  });
}

/* ---------- تبويب بنود عروض الأسعار ---------- */
function renderCatalogTab(el) {
  const catalog = dbGet("priceCatalog", []);
  el.innerHTML = `
    <div class="card">
      <div class="flex between"><h3 class="mt-0">التصنيفات والبنود</h3>
        <button class="btn sm" id="addCatBtn">+ إضافة تصنيف جديد</button>
      </div>
      <p class="text-muted" style="font-size:12.5px;margin-top:-6px">لكل بند إمكانية تفعيل سعر توريد و/أو سعر تركيب بشكل مستقل — عند إنشاء عرض سعر يمكن اختيار توريد فقط، تركيب فقط، أو الاثنين معاً.</p>
      ${catalog.map(cat => `
        <div class="cat-block" data-catid="${cat.id}">
          <div class="cat-head">
            <strong>${cat.name}</strong>
            <button class="btn sm danger" data-delcat="${cat.id}">حذف التصنيف</button>
          </div>
          <div class="table-wrap">
            <table class="data-table">
              <thead><tr><th>اسم البند</th><th>الوحدة</th><th>توريد</th><th>سعر التوريد (تكلفة)</th><th>تركيب</th><th>سعر التركيب (تكلفة)</th><th>نسبة الربح %</th><th></th></tr></thead>
              <tbody>
                ${cat.items.map(it => `
                  <tr data-itemrow="${cat.id}:${it.id}">
                    <td><input value="${it.name}" data-editname="${cat.id}:${it.id}" style="border:1px solid var(--border);border-radius:6px;padding:5px 8px;width:100%;min-width:180px"></td>
                    <td><input value="${it.unit}" data-editunit="${cat.id}:${it.id}" style="border:1px solid var(--border);border-radius:6px;padding:5px 8px;width:70px"></td>
                    <td style="text-align:center"><input type="checkbox" ${it.supply && it.supply.enabled ? "checked" : ""} data-editsupchk="${cat.id}:${it.id}" style="width:auto"></td>
                    <td><input type="number" min="0" step="0.01" value="${it.supply ? it.supply.price : 0}" data-editsupprice="${cat.id}:${it.id}" ${it.supply && it.supply.enabled ? "" : "disabled"} style="border:1px solid var(--border);border-radius:6px;padding:5px 8px;width:90px"></td>
                    <td style="text-align:center"><input type="checkbox" ${it.install && it.install.enabled ? "checked" : ""} data-editinschk="${cat.id}:${it.id}" style="width:auto"></td>
                    <td><input type="number" min="0" step="0.01" value="${it.install ? it.install.price : 0}" data-editinsprice="${cat.id}:${it.id}" ${it.install && it.install.enabled ? "" : "disabled"} style="border:1px solid var(--border);border-radius:6px;padding:5px 8px;width:90px"></td>
                    <td><input type="number" min="0" step="0.1" value="${it.profitMargin !== undefined ? it.profitMargin : 30}" data-editmargin="${cat.id}:${it.id}" style="border:1px solid var(--border);border-radius:6px;padding:5px 8px;width:80px"></td>
                    <td><button class="btn sm danger" data-delitem="${cat.id}:${it.id}">حذف</button></td>
                  </tr>`).join("")}
                <tr>
                  <td><input placeholder="اسم بند جديد" data-newname="${cat.id}"></td>
                  <td><input placeholder="الوحدة" data-newunit="${cat.id}" style="width:70px"></td>
                  <td style="text-align:center"><input type="checkbox" data-newsupchk="${cat.id}" style="width:auto"></td>
                  <td><input type="number" min="0" step="0.01" placeholder="سعر التوريد" data-newsupprice="${cat.id}" style="width:90px"></td>
                  <td style="text-align:center"><input type="checkbox" data-newinschk="${cat.id}" style="width:auto"></td>
                  <td><input type="number" min="0" step="0.01" placeholder="سعر التركيب" data-newinsprice="${cat.id}" style="width:90px"></td>
                  <td><input type="number" min="0" step="0.1" value="30" data-newmargin="${cat.id}" style="width:80px"></td>
                  <td><button class="btn sm primary" data-additem="${cat.id}">+ إضافة</button></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      `).join("") || `<div class="empty-state"><div class="ic">🗂️</div>لا توجد تصنيفات بعد</div>`}
    </div>
  `;

  document.getElementById("addCatBtn").onclick = () => {
    openNewCategoryModal((name) => {
      const cats = dbGet("priceCatalog", []);
      cats.push({ id: uid("cat"), name, items: [] });
      dbSet("priceCatalog", cats);
      renderSettings(el.parentElement);
    });
  };

  el.querySelectorAll("[data-delcat]").forEach(b => b.onclick = () => {
    if (!confirm("حذف هذا التصنيف وجميع بنوده؟")) return;
    dbSet("priceCatalog", dbGet("priceCatalog", []).filter(c => c.id !== b.dataset.delcat));
    renderSettings(el.parentElement);
  });

  function getItem(compositeId) {
    const [catId, itemId] = compositeId.split(":");
    const cats = dbGet("priceCatalog", []);
    const cat = cats.find(c => c.id === catId);
    const item = cat.items.find(i => i.id === itemId);
    return { cats, cat, item };
  }
  function saveField(compositeId, field, value) {
    const { cats, item } = getItem(compositeId);
    item[field] = value;
    dbSet("priceCatalog", cats);
  }

  el.querySelectorAll("[data-editname]").forEach(inp => inp.onchange = () => { saveField(inp.dataset.editname, "name", inp.value); toast("تم الحفظ"); });
  el.querySelectorAll("[data-editunit]").forEach(inp => inp.onchange = () => { saveField(inp.dataset.editunit, "unit", inp.value); toast("تم الحفظ"); });

  el.querySelectorAll("[data-editsupchk]").forEach(chk => chk.onchange = () => {
    const { cats, item } = getItem(chk.dataset.editsupchk);
    item.supply.enabled = chk.checked;
    dbSet("priceCatalog", cats);
    const priceInput = el.querySelector(`[data-editsupprice="${chk.dataset.editsupchk}"]`);
    if (priceInput) priceInput.disabled = !chk.checked;
    toast("تم الحفظ");
  });
  el.querySelectorAll("[data-editinschk]").forEach(chk => chk.onchange = () => {
    const { cats, item } = getItem(chk.dataset.editinschk);
    item.install.enabled = chk.checked;
    dbSet("priceCatalog", cats);
    const priceInput = el.querySelector(`[data-editinsprice="${chk.dataset.editinschk}"]`);
    if (priceInput) priceInput.disabled = !chk.checked;
    toast("تم الحفظ");
  });
  el.querySelectorAll("[data-editsupprice]").forEach(inp => inp.onchange = () => { const { cats, item } = getItem(inp.dataset.editsupprice); item.supply.price = Number(inp.value) || 0; dbSet("priceCatalog", cats); toast("تم الحفظ"); });
  el.querySelectorAll("[data-editinsprice]").forEach(inp => inp.onchange = () => { const { cats, item } = getItem(inp.dataset.editinsprice); item.install.price = Number(inp.value) || 0; dbSet("priceCatalog", cats); toast("تم الحفظ"); });
  el.querySelectorAll("[data-editmargin]").forEach(inp => inp.onchange = () => { const { cats, item } = getItem(inp.dataset.editmargin); item.profitMargin = Number(inp.value) || 0; dbSet("priceCatalog", cats); toast("تم الحفظ"); });

  el.querySelectorAll("[data-delitem]").forEach(b => b.onclick = () => {
    const [catId, itemId] = b.dataset.delitem.split(":");
    const cats = dbGet("priceCatalog", []);
    const cat = cats.find(c => c.id === catId);
    cat.items = cat.items.filter(i => i.id !== itemId);
    dbSet("priceCatalog", cats);
    renderSettings(el.parentElement);
  });

  el.querySelectorAll("[data-additem]").forEach(b => b.onclick = () => {
    const catId = b.dataset.additem;
    const name = el.querySelector(`[data-newname="${catId}"]`).value.trim();
    const unit = el.querySelector(`[data-newunit="${catId}"]`).value.trim() || "م²";
    const supEnabled = el.querySelector(`[data-newsupchk="${catId}"]`).checked;
    const supPrice = Number(el.querySelector(`[data-newsupprice="${catId}"]`).value) || 0;
    const insEnabled = el.querySelector(`[data-newinschk="${catId}"]`).checked;
    const insPrice = Number(el.querySelector(`[data-newinsprice="${catId}"]`).value) || 0;
    const margin = Number(el.querySelector(`[data-newmargin="${catId}"]`).value);
    if (!name) { toast("يرجى إدخال اسم البند"); return; }
    if (!supEnabled && !insEnabled) { toast("يرجى تفعيل توريد أو تركيب على الأقل"); return; }
    const cats = dbGet("priceCatalog", []);
    const cat = cats.find(c => c.id === catId);
    cat.items.push({
      id: uid("it"), name, unit,
      supply: { enabled: supEnabled, price: supPrice },
      install: { enabled: insEnabled, price: insPrice },
      profitMargin: isNaN(margin) ? 30 : margin,
    });
    dbSet("priceCatalog", cats);
    toast("تم إضافة البند");
    renderSettings(el.parentElement);
  });
}
