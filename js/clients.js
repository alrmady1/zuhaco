/* =========================================================
   العملاء
   ========================================================= */

let CLIENTS_VIEW = "list"; // list | detail
let CLIENT_VIEW_ID = null;
let CLIENTS_SEARCH = "";

const CLIENT_TYPES = ["فرد", "شركة", "جهة حكومية"];
function clientTypeBadge(type) {
  const map = { "فرد": "gray", "شركة": "blue", "جهة حكومية": "orange" };
  return `<span class="badge ${map[type] || "gray"}">${type || "فرد"}</span>`;
}

function sameClientName(a, b) {
  return (a || "").trim().toLowerCase() === (b || "").trim().toLowerCase();
}

// حقول إضافية حسب تصنيف العميل: الرقم الضريبي + العنوان الوطني لغير الأفراد، وبيانات الشخص المسؤول للشركات فقط
function clientExtraFieldsHtml(prefix, c, type) {
  let html = "";
  if (type !== "فرد") {
    html += `
      <div class="field"><label>الرقم الضريبي</label><input id="${prefix}_tax" value="${c ? (c.taxNumber || "") : ""}"></div>
      <div class="field"><label>العنوان الوطني</label><input id="${prefix}_nationalAddress" value="${c ? (c.nationalAddress || "") : ""}"></div>
    `;
  }
  if (type === "شركة") {
    html += `
      <div class="field"><label>اسم الشخص المسؤول</label><input id="${prefix}_contactName" value="${c ? (c.contactPersonName || "") : ""}"></div>
      <div class="field"><label>منصبه الوظيفي</label><input id="${prefix}_contactTitle" value="${c ? (c.contactPersonTitle || "") : ""}"></div>
    `;
  }
  return html;
}

// قائمة أحياء الرياض مجمّعة حسب منطقتها (مُدارة من الإعدادات ← مناطق الرياض)
function districtOptionsHtml(selected) {
  const zones = getRiyadhZones();
  const neighborhoods = getNeighborhoodZones();
  const byZone = {};
  neighborhoods.forEach(n => { (byZone[n.zone_id] = byZone[n.zone_id] || []).push(n); });
  let html = `<option value="">— اختر الحي —</option>`;
  zones.forEach(z => {
    const list = (byZone[z.id] || []).slice().sort((a, b) => a.neighborhood.localeCompare(b.neighborhood, "ar"));
    if (!list.length) return;
    html += `<optgroup label="${z.name}">${list.map(n => `<option value="${n.neighborhood}" ${n.neighborhood === selected ? "selected" : ""}>${n.neighborhood}</option>`).join("")}</optgroup>`;
  });
  return html;
}

function renderClients(el) {
  if (CLIENTS_VIEW === "detail") return renderClientDetail(el);
  renderClientsList(el);
}

function renderClientsList(el) {
  let clients = dbGet("clients", []).slice().sort((a, b) => (a.name || "").localeCompare(b.name || "", "ar"));
  if (CLIENTS_SEARCH.trim()) {
    const q = CLIENTS_SEARCH.trim().toLowerCase();
    clients = clients.filter(c => (c.name || "").toLowerCase().includes(q) || (c.phone || "").includes(q) || (c.taxNumber || "").includes(q));
  }

  const quotes = dbGet("quotes", []);
  const contracts = dbGet("contracts", []);
  const projects = dbGet("projects", []);
  const role = (getCurrentUser() || {}).role;
  const canAddClient = hasPermission(role, "clients_add");
  const canDeleteClient = hasPermission(role, "clients_delete");

  el.innerHTML = `
    <div class="section-title-row">
      <div><h2>العملاء</h2><p>سجل عملاء المؤسسة وبياناتهم</p></div>
      ${canAddClient ? `<button class="btn primary" id="newClientBtn">+ عميل جديد</button>` : ""}
    </div>

    <div class="card">
      <div class="field" style="max-width:340px;margin-bottom:0">
        <label>بحث</label>
        <input id="clientSearch" placeholder="ابحث بالاسم أو الجوال أو الرقم الضريبي..." value="${CLIENTS_SEARCH}">
      </div>
    </div>

    <div class="card">
      ${clients.length ? `
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>اسم العميل</th><th>النوع</th><th>الجوال</th><th>الرقم الضريبي</th><th>الحي</th><th>المشاريع</th><th></th></tr></thead>
          <tbody>
            ${clients.map(c => {
              const projCount = projects.filter(p => sameClientName(p.client, c.name)).length;
              const quoteCount = quotes.filter(q => sameClientName(q.client && q.client.name, c.name)).length;
              const contractCount = contracts.filter(k => sameClientName(k.clientName, c.name)).length;
              return `
              <tr>
                <td><strong>${c.name}</strong></td>
                <td>${clientTypeBadge(c.clientType)}</td>
                <td>${c.phone || "-"}</td>
                <td>${c.clientType === "فرد" ? "-" : (c.taxNumber || "-")}</td>
                <td class="text-muted">${c.district || "-"}</td>
                <td>${projCount ? `<span class="badge blue">${projCount} مشروع</span>` : ""} ${quoteCount ? `<span class="badge orange">${quoteCount} عرض سعر</span>` : ""} ${contractCount ? `<span class="badge green">${contractCount} عقد</span>` : ""}</td>
                <td>
                  <button class="btn-icon" data-openclient="${c.id}" title="فتح">${ICON_VIEW}</button>
                  <button class="btn-icon" data-editclient="${c.id}" title="تعديل">${ICON_EDIT}</button>
                  ${canDeleteClient ? `<button class="btn-icon danger" data-delclient="${c.id}" title="حذف">${ICON_DELETE}</button>` : ""}
                </td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>` : `<div class="empty-state"><div class="ic">👤</div>لا يوجد عملاء مطابقون</div>`}
    </div>
  `;

  const newClientBtn = document.getElementById("newClientBtn");
  if (newClientBtn) newClientBtn.onclick = openNewClientModal;
  document.getElementById("clientSearch").oninput = (e) => { CLIENTS_SEARCH = e.target.value; renderClientsList(el); };
  el.querySelectorAll("[data-openclient]").forEach(b => b.onclick = () => {
    CLIENT_VIEW_ID = b.dataset.openclient; CLIENTS_VIEW = "detail"; router();
  });
  el.querySelectorAll("[data-editclient]").forEach(b => b.onclick = () => {
    const target = dbGet("clients", []).find(x => x.id === b.dataset.editclient);
    if (target) openNewClientModal(() => renderClientsList(el), target);
  });
  el.querySelectorAll("[data-delclient]").forEach(b => b.onclick = () => {
    const target = dbGet("clients", []).find(x => x.id === b.dataset.delclient);
    if (!target) return;
    if (!confirm(`حذف العميل "${target.name}"؟ لن يؤثر هذا على المشاريع أو العروض المرتبطة به.`)) return;
    dbSet("clients", dbGet("clients", []).filter(x => x.id !== target.id));
    logActivity(`تم حذف العميل "${target.name}"`);
    toast("تم حذف العميل");
    renderClientsList(el);
  });
}

function openNewClientModal(onSaved, existingClient) {
  const isEdit = !!existingClient;
  const initialType = isEdit ? (existingClient.clientType || "فرد") : "فرد";
  const html = `
    <div class="modal-head"><h3>${isEdit ? "تعديل بيانات العميل" : "عميل جديد"}</h3><button class="modal-close" id="mClose">×</button></div>
    <div class="grid cols-2">
      <div class="field" style="grid-column:span 2"><label>اسم العميل</label><input id="nc_name" value="${isEdit ? existingClient.name : ""}"></div>
      <div class="field" style="grid-column:span 2"><label>تصنيف العميل</label>
        <select id="nc_type">${CLIENT_TYPES.map(t => `<option ${initialType === t ? "selected" : ""}>${t}</option>`).join("")}</select>
      </div>
      <div class="field"><label>رقم الجوال</label><input id="nc_phone" value="${isEdit ? (existingClient.phone || "") : ""}"></div>
      <div class="field"><label>البريد الإلكتروني</label><input id="nc_email" value="${isEdit ? (existingClient.email || "") : ""}"></div>
      <div class="field" style="grid-column:span 2"><label>الحي</label><select id="nc_district">${districtOptionsHtml(isEdit ? (existingClient.district || "") : "")}</select></div>
    </div>
    <div class="grid cols-2" id="nc_extraFields">${clientExtraFieldsHtml("nc", isEdit ? existingClient : null, initialType)}</div>
    <div class="field"><label>ملاحظات</label><textarea id="nc_notes">${isEdit ? (existingClient.notes || "") : ""}</textarea></div>
    <div class="flex gap"><button class="btn primary" id="nc_save">${isEdit ? "حفظ التعديلات" : "حفظ العميل"}</button><button class="btn" id="nc_cancel">إلغاء</button></div>
  `;
  const ov = openModalShell(html);
  ov.querySelector("#mClose").onclick = closeModal;
  ov.querySelector("#nc_cancel").onclick = closeModal;

  const typeSelect = ov.querySelector("#nc_type");
  const extraBox = ov.querySelector("#nc_extraFields");
  typeSelect.onchange = () => {
    extraBox.innerHTML = clientExtraFieldsHtml("nc", isEdit ? existingClient : null, typeSelect.value);
  };

  ov.querySelector("#nc_save").onclick = () => {
    const name = ov.querySelector("#nc_name").value.trim();
    if (!name) { toast("يرجى إدخال اسم العميل"); return; }
    const taxInput = ov.querySelector("#nc_tax");
    const natAddrInput = ov.querySelector("#nc_nationalAddress");
    const contactNameInput = ov.querySelector("#nc_contactName");
    const contactTitleInput = ov.querySelector("#nc_contactTitle");
    const clients = dbGet("clients", []);
    const clientData = {
      id: isEdit ? existingClient.id : uid("cl"), name,
      clientType: typeSelect.value,
      phone: ov.querySelector("#nc_phone").value.trim(),
      email: ov.querySelector("#nc_email").value.trim(),
      district: ov.querySelector("#nc_district").value,
      taxNumber: taxInput ? taxInput.value.trim() : "",
      nationalAddress: natAddrInput ? natAddrInput.value.trim() : "",
      contactPersonName: contactNameInput ? contactNameInput.value.trim() : "",
      contactPersonTitle: contactTitleInput ? contactTitleInput.value.trim() : "",
      notes: ov.querySelector("#nc_notes").value.trim(),
      createdAt: isEdit ? existingClient.createdAt : new Date().toISOString(),
    };
    if (isEdit) {
      const idx = clients.findIndex(x => x.id === existingClient.id);
      if (idx >= 0) clients[idx] = clientData;
      dbSet("clients", clients);
      logActivity(`تم تعديل بيانات العميل "${clientData.name}"`);
      toast("تم حفظ التعديلات");
    } else {
      clients.push(clientData);
      dbSet("clients", clients);
      logActivity(`تم إضافة عميل جديد "${clientData.name}"`);
      toast("تم إضافة العميل");
    }
    closeModal();
    if (typeof onSaved === "function") onSaved(clientData);
    else router();
  };
}

function renderClientDetail(el) {
  const clients = dbGet("clients", []);
  const c = clients.find(x => x.id === CLIENT_VIEW_ID);
  if (!c) { CLIENTS_VIEW = "list"; router(); return; }

  const projects = dbGet("projects", []).filter(p => sameClientName(p.client, c.name));
  const quotes = dbGet("quotes", []).filter(q => sameClientName(q.client && q.client.name, c.name));
  const contracts = dbGet("contracts", []).filter(k => sameClientName(k.clientName, c.name));
  const visits = dbGet("visits", []).filter(v => sameClientName(v.clientName, c.name));
  const canDeleteClient = hasPermission((getCurrentUser() || {}).role, "clients_delete");

  el.innerHTML = `
    <div class="section-title-row no-print">
      <div><h2>${c.name}</h2><p>عميل منذ ${fmtDate(c.createdAt)} · ${clientTypeBadge(c.clientType)}</p></div>
      <button class="btn" id="backClients">رجوع لقائمة العملاء</button>
    </div>

    <div class="grid cols-2">
      <div class="card">
        <h3>بيانات العميل</h3>
        <div class="field"><label>اسم العميل</label><input id="ec_name" value="${c.name}"></div>
        <div class="field"><label>تصنيف العميل</label>
          <select id="ec_type">${CLIENT_TYPES.map(t => `<option ${c.clientType === t ? "selected" : ""}>${t}</option>`).join("")}</select>
        </div>
        <div class="grid cols-2">
          <div class="field"><label>رقم الجوال</label><input id="ec_phone" value="${c.phone || ""}"></div>
          <div class="field"><label>البريد الإلكتروني</label><input id="ec_email" value="${c.email || ""}"></div>
        </div>
        <div class="field"><label>الحي</label><select id="ec_district">${districtOptionsHtml(c.district || "")}</select></div>
        <div class="grid cols-2" id="ec_extraFields">${clientExtraFieldsHtml("ec", c, c.clientType || "فرد")}</div>
        <div class="field"><label>ملاحظات</label><textarea id="ec_notes">${c.notes || ""}</textarea></div>
        <div class="flex gap">
          <button class="btn primary" id="ec_save">💾 حفظ التعديلات</button>
          ${canDeleteClient ? `<button class="btn danger" id="ec_delete" style="margin-inline-start:auto">حذف العميل</button>` : ""}
        </div>
      </div>

      <div>
        <div class="card">
          <h3>المشاريع (${projects.length})</h3>
          ${projects.length ? projects.map(p => `
            <div class="timeline-item">
              <div class="dot"></div>
              <div class="body">
                <strong style="font-size:13px">${p.name}</strong>
                <div class="meta">${p.location} — نسبة الإنجاز ${p.completion}%</div>
              </div>
            </div>`).join("") : `<p class="text-muted" style="font-size:12.5px">لا توجد مشاريع مرتبطة</p>`}
        </div>

        <div class="card">
          <h3>عروض الأسعار (${quotes.length})</h3>
          ${quotes.length ? quotes.map(q => `
            <div class="timeline-item">
              <div class="dot"></div>
              <div class="body">
                <div class="flex between">
                  <span style="font-size:13px"><strong>${q.number}</strong> — ${q.projectName}</span>
                  <strong style="font-size:13px">${fmtMoney(quoteTotal(q))}</strong>
                </div>
                <div class="meta">${fmtDate(q.date)}</div>
              </div>
            </div>`).join("") : `<p class="text-muted" style="font-size:12.5px">لا توجد عروض أسعار</p>`}
        </div>

        <div class="card">
          <h3>العقود (${contracts.length})</h3>
          ${contracts.length ? contracts.map(k => `
            <div class="timeline-item">
              <div class="dot"></div>
              <div class="body">
                <div class="flex between">
                  <span style="font-size:13px">${(CONTRACT_TYPES.find(t => t.key === k.type) || {}).label || k.type}</span>
                  <strong style="font-size:13px">${fmtMoney(k.totalAmount)}</strong>
                </div>
                <div class="meta">${fmtDate(k.date)}</div>
              </div>
            </div>`).join("") : `<p class="text-muted" style="font-size:12.5px">لا توجد عقود</p>`}
        </div>

        ${visits.length ? `
        <div class="card">
          <h3>زيارات الموقع (${visits.length})</h3>
          ${visits.map(v => `
            <div class="timeline-item">
              <div class="dot"></div>
              <div class="body">
                <div class="flex between">
                  <span style="font-size:13px">${locationDisplay(v.location)}</span>
                  ${statusBadge(v.status)}
                </div>
                <div class="meta">${v.requestedTime ? new Date(v.requestedTime).toLocaleString("ar-SA") : "-"}</div>
              </div>
            </div>`).join("")}
        </div>` : ""}
      </div>
    </div>
  `;

  document.getElementById("backClients").onclick = () => { CLIENTS_VIEW = "list"; router(); };

  const ecTypeSelect = document.getElementById("ec_type");
  const ecExtraBox = document.getElementById("ec_extraFields");
  ecTypeSelect.onchange = () => {
    ecExtraBox.innerHTML = clientExtraFieldsHtml("ec", c, ecTypeSelect.value);
  };

  document.getElementById("ec_save").onclick = () => {
    const name = document.getElementById("ec_name").value.trim();
    if (!name) { toast("يرجى إدخال اسم العميل"); return; }
    const ecTax = document.getElementById("ec_tax");
    const ecNatAddr = document.getElementById("ec_nationalAddress");
    const ecContactName = document.getElementById("ec_contactName");
    const ecContactTitle = document.getElementById("ec_contactTitle");
    const list = dbGet("clients", []);
    const target = list.find(x => x.id === c.id);
    target.name = name;
    target.clientType = ecTypeSelect.value;
    target.phone = document.getElementById("ec_phone").value.trim();
    target.email = document.getElementById("ec_email").value.trim();
    target.district = document.getElementById("ec_district").value;
    target.taxNumber = ecTax ? ecTax.value.trim() : "";
    target.nationalAddress = ecNatAddr ? ecNatAddr.value.trim() : "";
    target.contactPersonName = ecContactName ? ecContactName.value.trim() : "";
    target.contactPersonTitle = ecContactTitle ? ecContactTitle.value.trim() : "";
    target.notes = document.getElementById("ec_notes").value.trim();
    dbSet("clients", list);
    logActivity(`تم تعديل بيانات العميل "${target.name}"`);
    toast("تم حفظ بيانات العميل");
    router();
  };

  const deleteBtn = document.getElementById("ec_delete");
  if (deleteBtn) deleteBtn.onclick = () => {
    if (!confirm("هل تريد حذف هذا العميل؟ لن يؤثر هذا على المشاريع أو العروض المرتبطة به.")) return;
    dbSet("clients", dbGet("clients", []).filter(x => x.id !== c.id));
    logActivity(`تم حذف العميل "${c.name}"`);
    toast("تم حذف العميل");
    CLIENTS_VIEW = "list";
    router();
  };
}
