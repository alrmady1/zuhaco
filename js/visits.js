/* =========================================================
   مهام المشرفين - زيارة موقع
   ========================================================= */

let VISIT_MODAL = null; // 'create' | {id}

const VISIT_REMINDER_WINDOW_MS = 60 * 60 * 1000; // ساعة واحدة قبل موعد الزيارة

function checkVisitNotifications() {
  const visits = dbGet("visits", []);
  const now = Date.now();
  let changed = false;

  visits.forEach(v => {
    if (!v.requestedTime || v.status === "منتهية" || v.status === "قيد التنفيذ") return;
    const visitTime = new Date(v.requestedTime).getTime();
    if (isNaN(visitTime)) return;

    // تنبيه قبل الزيارة بساعة للمشرف المسؤول
    if (!v.reminderSent && visitTime > now && visitTime - now <= VISIT_REMINDER_WINDOW_MS) {
      addNotification({
        type: "visit_reminder",
        title: "تذكير بزيارة موقع قادمة",
        message: `تبقى أقل من ساعة على موعد زيارة العميل "${v.clientName}" (${new Date(v.requestedTime).toLocaleString("ar-SA")})`,
        targetRoles: [],
        targetUserIds: v.assignedTo ? [v.assignedTo] : [],
        relatedRoute: "visits",
      });
      v.reminderSent = true;
      changed = true;
    }

    // تجاوز موعد الزيارة دون تحديث حالتها إلى قيد التنفيذ أو منتهية
    if (!v.lateNotified && now > visitTime) {
      v.status = "متأخرة";
      addNotification({
        type: "visit_late",
        title: "موعد زيارة لم يُنفَّذ في وقته",
        message: `تجاوز موعد زيارة العميل "${v.clientName}" (${new Date(v.requestedTime).toLocaleString("ar-SA")}) دون تحديث حالة الطلب`,
        targetRoles: ["مدير النظام"],
        targetUserIds: v.assignedTo ? [v.assignedTo] : [],
        relatedRoute: "visits",
      });
      v.lateNotified = true;
      changed = true;
    }
  });

  if (changed) dbSet("visits", visits);
}

function renderVisits(el) {
  const visits = dbGet("visits", []).slice().sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  const users = dbGet("users", []);
  const canAddVisit = hasPermission((getCurrentUser() || {}).role, "visits_add");

  el.innerHTML = `
    <div class="section-title-row">
      <div><h2>زيارة موقع</h2><p>تكليف المشرفين بزيارات ميدانية ومتابعة نتائجها</p></div>
      ${canAddVisit ? `<button class="btn primary" id="newVisitBtn">+ طلب زيارة جديد</button>` : ""}
    </div>

    <div class="card">
      ${visits.length ? `
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>العميل</th><th>الموقع</th><th>الوقت المطلوب</th><th>المشرف المكلف</th><th>الحالة</th><th></th></tr></thead>
          <tbody>
            ${visits.map(v => `
              <tr>
                <td>${v.clientName}</td>
                <td>${locationDisplay(v.location)}</td>
                <td>${v.requestedTime ? new Date(v.requestedTime).toLocaleString("ar-SA") : "-"}</td>
                <td>${v.assignedToName || "-"}</td>
                <td>${statusBadge(v.status)}</td>
                <td><button class="btn sm" data-open="${v.id}">فتح</button></td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>` : `<div class="empty-state"><div class="ic">📍</div>لا توجد طلبات زيارة بعد</div>`}
    </div>
  `;

  const newVisitBtn = document.getElementById("newVisitBtn");
  if (newVisitBtn) newVisitBtn.onclick = () => { VISIT_MODAL = "create"; openVisitModal(); };
  el.querySelectorAll("[data-open]").forEach(b => b.onclick = () => { VISIT_MODAL = { id: b.dataset.open }; openVisitModal(); });
}

const WHATSAPP_SVG = `<svg viewBox="0 0 32 32" width="15" height="15" fill="#fff"><path d="M16.004 3C9.096 3 3.5 8.596 3.5 15.504c0 2.386.663 4.62 1.813 6.527L3 29l7.146-2.26a12.44 12.44 0 0 0 5.858 1.49h.005c6.908 0 12.503-5.596 12.503-12.504C28.512 8.818 22.914 3.223 16.004 3zm7.29 17.774c-.31.874-1.542 1.6-2.522 1.81-.673.14-1.55.253-4.505-.967-3.782-1.566-6.216-5.406-6.406-5.658-.183-.252-1.53-2.037-1.53-3.885 0-1.848.966-2.756 1.31-3.132.343-.376.75-.47 1-.47.25 0 .5.002.717.013.23.012.539-.087.842.643.31.75 1.056 2.598 1.148 2.786.093.19.155.412.031.664-.124.252-.187.408-.372.628-.187.22-.393.49-.562.658-.187.187-.382.39-.164.766.218.376.968 1.598 2.078 2.588 1.428 1.274 2.632 1.669 3.008 1.856.376.187.596.156.816-.094.22-.25.937-1.093 1.187-1.469.25-.376.5-.313.842-.188.343.125 2.178 1.028 2.552 1.215.375.188.624.281.717.438.093.156.093.906-.218 1.78z"/></svg>`;
const CALL_SVG = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.362 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.338 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`;

function contactIconsHtml(phone) {
  if (!phone) return "";
  const digits = phone.replace(/[^\d+]/g, "");
  let waNumber = digits.replace(/^\+/, "");
  if (waNumber.startsWith("0")) waNumber = "966" + waNumber.slice(1);
  return `<a href="https://wa.me/${waNumber}" target="_blank" rel="noopener" class="icon-btn wa" title="تواصل عبر واتساب">${WHATSAPP_SVG}</a><a href="tel:${digits}" class="icon-btn call" title="اتصال">${CALL_SVG}</a>`;
}

function locationDisplay(loc) {
  if (!loc) return "-";
  if (/^https?:\/\//i.test(loc.trim())) {
    return `<a href="${loc}" target="_blank" rel="noopener" class="badge blue" style="text-decoration:none">📍 فتح في خرائط جوجل</a>`;
  }
  return loc;
}

const VISIT_STATUSES = ["جديدة", "قيد التنفيذ", "منتهية", "متأخرة"];

function statusBadge(status) {
  const map = { "جديدة": "gray", "قيد التنفيذ": "orange", "منتهية": "green", "متأخرة": "red" };
  return `<span class="badge ${map[status] || "gray"}">${status || "جديدة"}</span>`;
}

function closeModal() {
  const ov = document.getElementById("modalOverlay");
  if (ov) ov.remove();
}

function openModalShell(innerHtml, wide) {
  closeModal();
  const ov = document.createElement("div");
  ov.className = "modal-overlay";
  ov.id = "modalOverlay";
  ov.innerHTML = `<div class="modal ${wide ? "wide" : ""}">${innerHtml}</div>`;
  ov.addEventListener("mousedown", (e) => { if (e.target === ov) closeModal(); });
  document.body.appendChild(ov);
  return ov;
}

function openVisitModal(prefill) {
  const users = dbGet("users", []).filter(u => u.role === "مراقب موقع");

  if (VISIT_MODAL === "create") {
    prefill = prefill || {};
    const html = `
      <div class="modal-head"><h3>طلب زيارة موقع جديد</h3><button class="modal-close" id="mClose">×</button></div>
      <div class="grid cols-2">
        <div class="field" style="position:relative">
          <label>اسم العميل</label>
          <input id="v_clientName" value="${prefill.clientName || ""}" autocomplete="off" placeholder="اكتب للبحث في سجل العملاء...">
          <div id="v_clientResults" class="client-suggest-box"></div>
        </div>
        <div class="field">
          <label>رقم جوال العميل</label>
          <input id="v_clientPhone" value="${prefill.clientPhone || ""}">
        </div>
        <div class="field" style="grid-column:span 2;margin-top:-8px">
          <button class="btn sm" id="v_addClientBtn" type="button">+ إضافة عميل جديد</button>
        </div>
        <div class="field" style="grid-column:span 2">
          <label>موقع الزيارة (رابط خرائط جوجل)</label>
          <input id="v_location" type="url" placeholder="https://maps.app.goo.gl/..." value="${prefill.location || ""}">
          <div class="hint">افتح الموقع في خرائط جوجل، اضغط "مشاركة"، ثم انسخ الرابط والصقه هنا</div>
        </div>
        <div class="field"><label>الوقت المطلوب للزيارة</label><input type="datetime-local" id="v_time" value="${prefill.time || ""}"></div>
        <div class="field"><label>المشرف المكلف</label>
          <select id="v_assigned">${users.map(u => `<option value="${u.id}" ${prefill.assigned === u.id ? "selected" : ""}>${u.name}</option>`).join("") || `<option value="">لا يوجد مشرفون مسجلون</option>`}</select>
        </div>
        <div class="field" style="grid-column:span 2"><label>ملاحظات / تعليمات الزيارة</label><textarea id="v_notes">${prefill.notes || ""}</textarea></div>
        <div class="field" style="grid-column:span 2">
          <label>رفع المخططات (AutoCAD أو PDF)</label>
          <input type="file" id="v_plans" multiple accept=".dwg,.dxf,.pdf,application/pdf">
          <div class="hint">يمكن اختيار أكثر من ملف</div>
          <div id="v_plansList" class="flex wrap"></div>
        </div>
        <div class="field" style="grid-column:span 2">
          <label>إضافة صور للموقع الحالي (إن وجدت)</label>
          <input type="file" id="v_photos" multiple accept="image/*">
          <div id="v_photosList" class="photo-grid"></div>
        </div>
      </div>
      <div class="flex gap" style="margin-top:6px">
        <button class="btn primary" id="v_save">حفظ طلب الزيارة</button>
        <button class="btn" id="v_cancel">إلغاء</button>
      </div>
    `;
    const ov = openModalShell(html, true);
    let plans = (prefill.plans || []).slice();
    let photos = (prefill.photos || []).slice();
    let linkedClientId = prefill.linkedClientId || "";
    ov.querySelector("#v_plansList").innerHTML = plans.map(p => `<span class="file-chip">📎 ${p.name}</span>`).join("");
    renderPhotoGrid(ov.querySelector("#v_photosList"), photos, false);

    ov.querySelector("#mClose").onclick = closeModal;
    ov.querySelector("#v_cancel").onclick = closeModal;

    const nameInput = ov.querySelector("#v_clientName");
    const resultsBox = ov.querySelector("#v_clientResults");
    const renderClientSuggestions = (query) => {
      const q = (query || "").trim().toLowerCase();
      if (!q) { resultsBox.innerHTML = ""; return; }
      const clients = dbGet("clients", []).filter(c => (c.name || "").toLowerCase().includes(q) || (c.phone || "").includes(q));
      resultsBox.innerHTML = clients.length ? clients.slice(0, 8).map(c => `
        <div class="client-suggest" data-pick="${c.id}"><strong>${c.name}</strong> <span class="text-muted" style="font-size:11.5px">${c.phone || ""}</span></div>
      `).join("") : `<div class="text-muted" style="font-size:12px;padding:8px 4px">لا يوجد عملاء مطابقون</div>`;
      resultsBox.querySelectorAll("[data-pick]").forEach(row => row.onclick = () => {
        const client = dbGet("clients", []).find(x => x.id === row.dataset.pick);
        nameInput.value = client.name;
        ov.querySelector("#v_clientPhone").value = client.phone || "";
        linkedClientId = client.id;
        resultsBox.innerHTML = "";
      });
    };
    nameInput.oninput = () => { linkedClientId = ""; renderClientSuggestions(nameInput.value); };

    ov.querySelector("#v_addClientBtn").onclick = () => {
      const capturedPrefill = {
        clientName: nameInput.value.trim(),
        clientPhone: ov.querySelector("#v_clientPhone").value.trim(),
        location: ov.querySelector("#v_location").value.trim(),
        time: ov.querySelector("#v_time").value,
        assigned: ov.querySelector("#v_assigned").value,
        notes: ov.querySelector("#v_notes").value.trim(),
        plans, photos,
      };
      openNewClientModal((newClient) => {
        VISIT_MODAL = "create";
        openVisitModal({ ...capturedPrefill, clientName: newClient.name, clientPhone: newClient.phone || capturedPrefill.clientPhone, linkedClientId: newClient.id });
      });
    };

    ov.querySelector("#v_plans").onchange = async (e) => {
      for (const f of e.target.files) {
        plans.push({ name: f.name, type: f.type, size: f.size });
      }
      ov.querySelector("#v_plansList").innerHTML = plans.map((p, i) => `<span class="file-chip">📎 ${p.name}</span>`).join("");
    };
    ov.querySelector("#v_photos").onchange = async (e) => {
      for (const f of e.target.files) {
        const url = await fileToDataURL(f);
        photos.push({ url, caption: "" });
      }
      renderPhotoGrid(ov.querySelector("#v_photosList"), photos, false);
    };

    ov.querySelector("#v_save").onclick = () => {
      const clientName = ov.querySelector("#v_clientName").value.trim();
      const location = ov.querySelector("#v_location").value.trim();
      if (!clientName || !location) { toast("يرجى إدخال اسم العميل والموقع"); return; }
      const assignedSelect = ov.querySelector("#v_assigned");
      const assignedUser = users.find(u => u.id === assignedSelect.value);

      const visits = dbGet("visits", []);
      visits.push({
        id: uid("v"),
        clientName,
        clientPhone: ov.querySelector("#v_clientPhone").value.trim(),
        linkedClientId,
        location,
        requestedTime: ov.querySelector("#v_time").value,
        assignedTo: assignedUser ? assignedUser.id : "",
        assignedToName: assignedUser ? assignedUser.name : "",
        notes: ov.querySelector("#v_notes").value.trim(),
        planFiles: plans,
        refPhotos: photos,
        status: "جديدة",
        visitResult: "",
        visitPhotos: [],
        receivedFiles: [],
        createdAt: new Date().toISOString(),
      });
      dbSet("visits", visits);
      logActivity(`تم إنشاء طلب زيارة موقع للعميل "${clientName}"`);

      addNotification({
        type: "visit_new",
        title: "طلب زيارة موقع جديد",
        message: `طلب زيارة جديد للعميل "${clientName}" في ${location}${assignedUser ? " — مُكلَّف: " + assignedUser.name : ""}`,
        targetRoles: ["مدير عام"],
        targetUserIds: assignedUser ? [assignedUser.id] : [],
        relatedRoute: "visits",
      });

      toast("تم إرسال طلب الزيارة للمشرف");
      closeModal();
      router();
    };
    return;
  }

  // Open existing visit (supervisor fills result)
  const visits = dbGet("visits", []);
  const v = visits.find(x => x.id === VISIT_MODAL.id);
  if (!v) return;

  const html = `
    <div class="modal-head"><h3>زيارة موقع — ${v.clientName}</h3><button class="modal-close" id="mClose">×</button></div>
    <div class="grid cols-2">
      <div class="kv-row"><span class="k">العميل</span><span class="v">${v.clientName} (${v.clientPhone || "-"})${contactIconsHtml(v.clientPhone)}</span></div>
      <div class="kv-row"><span class="k">الموقع</span><span class="v">${locationDisplay(v.location)}</span></div>
      <div class="kv-row"><span class="k">الوقت المطلوب</span><span class="v">${v.requestedTime ? new Date(v.requestedTime).toLocaleString("ar-SA") : "-"}</span></div>
      <div class="kv-row"><span class="k">المشرف المكلف</span><span class="v">${v.assignedToName || "-"}</span></div>
    </div>
    ${v.notes ? `<p class="text-muted" style="font-size:13px">ملاحظات الطلب: ${v.notes}</p>` : ""}
    ${v.planFiles && v.planFiles.length ? `<div class="field"><label>المخططات المرفقة</label>${v.planFiles.map(p => `<span class="file-chip">📎 ${p.name}</span>`).join("")}</div>` : ""}
    ${v.refPhotos && v.refPhotos.length ? `<div class="field"><label>صور مرفقة مع الطلب</label><div class="photo-grid">${v.refPhotos.map(p => `<div class="photo-item"><img src="${p.url}"></div>`).join("")}</div></div>` : ""}

    <hr style="border:none;border-top:1px solid var(--border);margin:16px 0">
    <h3>تسجيل نتيجة الزيارة الميدانية (المشرف)</h3>
    <div class="field">
      <label>حالة الزيارة</label>
      <select id="v_status">
        ${VISIT_STATUSES.map(s => `<option value="${s}" ${v.status === s ? "selected" : ""}>${s}</option>`).join("")}
      </select>
    </div>
    <div class="field"><label>نتيجة الزيارة / الوضع الراهن</label><textarea id="v_result">${v.visitResult || ""}</textarea></div>
    <div class="field">
      <label>رفع صور الزيارة الميدانية</label>
      <input type="file" id="v_visitPhotos" multiple accept="image/*">
      <div id="v_visitPhotosList" class="photo-grid">${(v.visitPhotos || []).map((p, i) => `<div class="photo-item" data-vp="${i}"><img src="${p.url}"></div>`).join("")}</div>
    </div>
    <div class="field">
      <label>رفع الملفات/المخططات المستلمة من العميل أثناء الزيارة</label>
      <input type="file" id="v_receivedFiles" multiple accept=".dwg,.dxf,.pdf,application/pdf,image/*">
      <div id="v_receivedList" class="flex wrap">${(v.receivedFiles || []).map(f => `<span class="file-chip">📎 ${f.name}</span>`).join("")}</div>
    </div>

    <div class="flex gap" style="margin-top:6px">
      <button class="btn primary" id="v_saveResult">حفظ نتيجة الزيارة</button>
      <button class="btn" id="v_cancel2">إغلاق</button>
    </div>
  `;
  const ov = openModalShell(html, true);
  ov.querySelector("#mClose").onclick = closeModal;
  ov.querySelector("#v_cancel2").onclick = closeModal;

  let newVisitPhotos = (v.visitPhotos || []).slice();
  let newReceivedFiles = (v.receivedFiles || []).slice();

  ov.querySelector("#v_visitPhotos").onchange = async (e) => {
    for (const f of e.target.files) {
      const url = await fileToDataURL(f);
      newVisitPhotos.push({ url, caption: "" });
    }
    ov.querySelector("#v_visitPhotosList").innerHTML = newVisitPhotos.map(p => `<div class="photo-item"><img src="${p.url}"></div>`).join("");
  };
  ov.querySelector("#v_receivedFiles").onchange = (e) => {
    for (const f of e.target.files) newReceivedFiles.push({ name: f.name, type: f.type, size: f.size });
    ov.querySelector("#v_receivedList").innerHTML = newReceivedFiles.map(f => `<span class="file-chip">📎 ${f.name}</span>`).join("");
  };

  ov.querySelector("#v_saveResult").onclick = () => {
    const prevStatus = v.status;
    const prevPhotoCount = (v.visitPhotos || []).length;
    v.status = ov.querySelector("#v_status").value;
    v.visitResult = ov.querySelector("#v_result").value.trim();
    v.visitPhotos = newVisitPhotos;
    v.receivedFiles = newReceivedFiles;
    dbSet("visits", visits);
    if (v.status !== prevStatus) logActivity(`تم تحديث حالة زيارة العميل "${v.clientName}" إلى: ${v.status}`);
    if (newVisitPhotos.length > prevPhotoCount) logActivity(`تم إضافة صور ميدانية لزيارة العميل "${v.clientName}"`);
    toast("تم حفظ نتيجة الزيارة");
    closeModal();
    router();
  };
}

function renderPhotoGrid(container, photos, withCaption) {
  container.className = "photo-grid";
  container.innerHTML = photos.map((p, i) => `
    <div class="photo-item">
      <img src="${p.url}">
      ${withCaption ? `<div class="cap"><input placeholder="تعليق على الصورة" value="${p.caption || ""}" data-capidx="${i}"></div>` : ""}
    </div>
  `).join("");
}
