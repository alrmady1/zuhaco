/* =========================================================
   مهام المشرفين - تقارير المشرفين اليومية
   ========================================================= */

let REPORT_FILTER = { project: "", from: "", to: "" };

function renderReports(el) {
  const projects = dbGet("projects", []);
  let reports = dbGet("reports", []).slice().sort((a, b) => (b.date > a.date ? 1 : -1));

  if (REPORT_FILTER.project) reports = reports.filter(r => r.projectId === REPORT_FILTER.project);
  if (REPORT_FILTER.from) reports = reports.filter(r => r.date >= REPORT_FILTER.from);
  if (REPORT_FILTER.to) reports = reports.filter(r => r.date <= REPORT_FILTER.to);

  el.innerHTML = `
    <div class="section-title-row">
      <div><h2>تقارير المشرفين اليومية</h2><p>أرشيف تقارير سير العمل حسب المشروع والتاريخ</p></div>
      <button class="btn primary" id="newReportBtn">+ تقرير يومي جديد</button>
    </div>

    <div class="card">
      <div class="grid cols-3">
        <div class="field"><label>تصفية حسب المشروع</label>
          <select id="filterProject"><option value="">كل المشاريع</option>${projects.map(p => `<option value="${p.id}" ${REPORT_FILTER.project === p.id ? "selected" : ""}>${p.name}</option>`).join("")}</select>
        </div>
        <div class="field"><label>من تاريخ</label><input type="date" id="filterFrom" value="${REPORT_FILTER.from}"></div>
        <div class="field"><label>إلى تاريخ</label><input type="date" id="filterTo" value="${REPORT_FILTER.to}"></div>
      </div>
    </div>

    <div class="card">
      ${reports.length ? reports.map(r => `
        <div class="timeline-item">
          <div class="dot"></div>
          <div class="body">
            <div class="flex between">
              <div>
                <strong>${r.projectName}</strong>
                <div class="meta">${fmtDate(r.date)} — رفعه: ${r.supervisor}</div>
              </div>
              <button class="btn sm" data-openrep="${r.id}">عرض التقرير</button>
            </div>
            <div style="font-size:13px;margin-top:6px">نسبة الإنجاز: <strong>${r.progress}%</strong></div>
            <div class="progress-track" style="margin:6px 0"><div class="progress-fill" style="width:${r.progress}%"></div></div>
            <div class="text-muted" style="font-size:12.5px">${(r.notes || "").slice(0, 140)}${(r.notes || "").length > 140 ? "…" : ""}</div>
          </div>
        </div>
      `).join("") : `<div class="empty-state"><div class="ic">📋</div>لا توجد تقارير مطابقة</div>`}
    </div>
  `;

  document.getElementById("newReportBtn").onclick = openNewReportModal;
  document.getElementById("filterProject").onchange = (e) => { REPORT_FILTER.project = e.target.value; renderReports(el); };
  document.getElementById("filterFrom").onchange = (e) => { REPORT_FILTER.from = e.target.value; renderReports(el); };
  document.getElementById("filterTo").onchange = (e) => { REPORT_FILTER.to = e.target.value; renderReports(el); };

  el.querySelectorAll("[data-openrep]").forEach(b => b.onclick = () => openReportViewModal(b.dataset.openrep));
}

function openNewReportModal() {
  const projects = dbGet("projects", []);
  const user = getCurrentUser();

  const html = `
    <div class="modal-head"><h3>تقرير يومي جديد</h3><button class="modal-close" id="mClose">×</button></div>
    <div class="grid cols-2">
      <div class="field"><label>المشروع</label>
        <select id="r_project">${projects.map(p => `<option value="${p.id}">${p.name}</option>`).join("")}</select>
      </div>
      <div class="field"><label>تاريخ التقرير</label><input type="date" id="r_date" value="${todayISO()}"></div>
      <div class="field" style="grid-column:span 2"><label>نسبة الإنجاز الحالية (%)</label><input type="number" min="0" max="100" id="r_progress" value="0"></div>
      <div class="field" style="grid-column:span 2"><label>سير العمل والملاحظات</label><textarea id="r_notes" placeholder="وصف الأعمال المنجزة اليوم والملاحظات..."></textarea></div>
      <div class="field" style="grid-column:span 2"><label>طلب مواد للمراحل القادمة / مواد ناقصة</label><textarea id="r_materials" placeholder="مثال: يلزم توريد 50 م² بورسلان لاستكمال أعمال الأرضيات..."></textarea></div>
      <div class="field" style="grid-column:span 2">
        <label class="chk"><input type="checkbox" id="r_extraChk"> طلب المالك أعمال إضافية</label>
        <textarea id="r_extraDetails" placeholder="وضّح الأعمال الإضافية التي طلبها المالك..." style="margin-top:8px;display:none"></textarea>
      </div>
      <div class="field" style="grid-column:span 2">
        <label>صور التقرير (مع إمكانية إضافة تعليق على كل صورة)</label>
        <input type="file" id="r_photos" multiple accept="image/*">
        <div id="r_photosList" class="photo-grid"></div>
      </div>
    </div>
    <div class="flex gap" style="margin-top:6px">
      <button class="btn primary" id="r_save">إرسال التقرير</button>
      <button class="btn" id="r_cancel">إلغاء</button>
    </div>
  `;
  const ov = openModalShell(html, true);
  ov.querySelector("#mClose").onclick = closeModal;
  ov.querySelector("#r_cancel").onclick = closeModal;

  ov.querySelector("#r_extraChk").onchange = (e) => {
    ov.querySelector("#r_extraDetails").style.display = e.target.checked ? "block" : "none";
  };

  let photos = [];
  ov.querySelector("#r_photos").onchange = async (e) => {
    for (const f of e.target.files) {
      const url = await fileToDataURL(f);
      photos.push({ url, caption: "" });
    }
    redrawReportPhotos();
  };

  function redrawReportPhotos() {
    const wrap = ov.querySelector("#r_photosList");
    wrap.innerHTML = photos.map((p, i) => `
      <div class="photo-item">
        <img src="${p.url}">
        <div class="cap"><input placeholder="تعليق..." value="${p.caption}" data-capidx="${i}"></div>
        <button type="button" class="rm" data-rmidx="${i}">حذف</button>
      </div>`).join("");
    wrap.querySelectorAll("[data-capidx]").forEach(inp => inp.oninput = () => { photos[Number(inp.dataset.capidx)].caption = inp.value; });
    wrap.querySelectorAll("[data-rmidx]").forEach(btn => btn.onclick = () => { photos.splice(Number(btn.dataset.rmidx), 1); redrawReportPhotos(); });
  }

  ov.querySelector("#r_save").onclick = () => {
    const projectId = ov.querySelector("#r_project").value;
    const project = projects.find(p => p.id === projectId);
    if (!project) { toast("يرجى اختيار المشروع"); return; }

    const reports = dbGet("reports", []);
    reports.push({
      id: uid("r"),
      projectId,
      projectName: project.name,
      supervisor: user.name,
      date: ov.querySelector("#r_date").value || todayISO(),
      progress: Number(ov.querySelector("#r_progress").value) || 0,
      notes: ov.querySelector("#r_notes").value.trim(),
      materialsRequested: ov.querySelector("#r_materials").value.trim(),
      ownerExtraWork: ov.querySelector("#r_extraChk").checked,
      ownerExtraWorkDetails: ov.querySelector("#r_extraChk").checked ? ov.querySelector("#r_extraDetails").value.trim() : "",
      photos,
      createdAt: new Date().toISOString(),
    });
    dbSet("reports", reports);

    // تحديث نسبة إنجاز المشروع في الشاشة الرئيسية
    const projects2 = dbGet("projects", []);
    const p2 = projects2.find(x => x.id === projectId);
    if (p2) { p2.completion = Number(ov.querySelector("#r_progress").value) || p2.completion; dbSet("projects", projects2); }

    addNotification({
      type: "report_new",
      title: "تقرير يومي جديد",
      message: `${user.name} رفع تقريراً يومياً لمشروع "${project.name}" — نسبة الإنجاز ${Number(ov.querySelector("#r_progress").value) || 0}%`,
      targetRoles: ["مدير عام", "مدير النظام"],
      relatedRoute: "reports",
    });

    toast("تم إرسال التقرير اليومي بنجاح");
    closeModal();
    router();
  };
}

function openReportViewModal(id) {
  const r = dbGet("reports", []).find(x => x.id === id);
  if (!r) return;
  const html = `
    <div class="modal-head"><h3>تقرير يومي — ${r.projectName}</h3><button class="modal-close" id="mClose">×</button></div>
    <div class="kv-row"><span class="k">المشروع</span><span class="v">${r.projectName}</span></div>
    <div class="kv-row"><span class="k">التاريخ</span><span class="v">${fmtDate(r.date)}</span></div>
    <div class="kv-row"><span class="k">المشرف</span><span class="v">${r.supervisor}</span></div>
    <div class="kv-row"><span class="k">نسبة الإنجاز</span><span class="v">${r.progress}%</span></div>
    <div style="margin-top:12px"><strong>سير العمل والملاحظات</strong><p style="font-size:13px">${r.notes || "-"}</p></div>
    <div style="margin-top:6px"><strong>طلب مواد / نواقص</strong><p style="font-size:13px">${r.materialsRequested || "-"}</p></div>
    ${r.ownerExtraWork ? `
      <div style="margin-top:6px;background:#fdecd6;border-radius:8px;padding:10px 12px">
        <strong style="font-size:13px">⚠️ طلب المالك أعمال إضافية</strong>
        <p style="font-size:13px;margin:6px 0 0">${r.ownerExtraWorkDetails || "-"}</p>
      </div>` : ""}
    ${r.photos && r.photos.length ? `
      <strong>صور التقرير</strong>
      <div class="photo-grid">
        ${r.photos.map(p => `<div class="photo-item"><img src="${p.url}"><div class="cap" style="font-size:11.5px;padding:6px 8px">${p.caption || "بدون تعليق"}</div></div>`).join("")}
      </div>` : ""}
    <div class="flex gap" style="margin-top:16px"><button class="btn" id="r_close">إغلاق</button></div>
  `;
  const ov = openModalShell(html, true);
  ov.querySelector("#mClose").onclick = closeModal;
  ov.querySelector("#r_close").onclick = closeModal;
}
