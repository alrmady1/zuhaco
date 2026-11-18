/* =========================================================
   سندات القبض: سند مرقم يُصدر للعميل عند استلام دفعة عن الأعمال
   receipts: [{ id, number, date, projectId, projectName, clientId, clientName, clientPhone, amount,
                paymentMethod, forWhat, notes, entryId, issuedBy, createdAt }]
   ========================================================= */

/* ---------- تفقيط المبلغ بالعربية ---------- */
const AR_ONES = ["", "واحد", "اثنان", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة", "ثمانية", "تسعة", "عشرة", "أحد عشر", "اثنا عشر", "ثلاثة عشر", "أربعة عشر", "خمسة عشر", "ستة عشر", "سبعة عشر", "ثمانية عشر", "تسعة عشر"];
const AR_TENS = ["", "", "عشرون", "ثلاثون", "أربعون", "خمسون", "ستون", "سبعون", "ثمانون", "تسعون"];
const AR_HUNDREDS = ["", "مائة", "مائتان", "ثلاثمائة", "أربعمائة", "خمسمائة", "ستمائة", "سبعمائة", "ثمانمائة", "تسعمائة"];

function arWordsBelow1000(n) {
  const parts = [];
  const h = Math.floor(n / 100), r = n % 100;
  if (h) parts.push(AR_HUNDREDS[h]);
  if (r) {
    if (r < 20) parts.push(AR_ONES[r]);
    else { const u = r % 10, t = Math.floor(r / 10); parts.push(u ? AR_ONES[u] + " و" + AR_TENS[t] : AR_TENS[t]); }
  }
  return parts.join(" و");
}

// مجموعة (آلاف/ملايين/مليارات) بقواعد العدد والمعدود: 1 → ألف، 2 → ألفان، 3–10 → آلاف، غير ذلك → ألف
function arScaleWords(n, one, two, few, many) {
  if (n === 1) return one;
  if (n === 2) return two;
  const last = n % 100;
  if (n > 2 && (last === 1 || last === 2)) return arWordsBelow1000(n - last) + " " + many + " و" + (last === 1 ? one : two);
  return arWordsBelow1000(n) + " " + (last >= 3 && last <= 10 ? few : many);
}

function arIntegerWords(n) {
  if (n === 0) return "صفر";
  const parts = [];
  const billions = Math.floor(n / 1e9), millions = Math.floor((n % 1e9) / 1e6), thousands = Math.floor((n % 1e6) / 1e3), rest = n % 1000;
  if (billions) parts.push(arScaleWords(billions, "مليار", "ملياران", "مليارات", "مليار"));
  if (millions) parts.push(arScaleWords(millions, "مليون", "مليونان", "ملايين", "مليون"));
  if (thousands) parts.push(arScaleWords(thousands, "ألف", "ألفان", "آلاف", "ألف"));
  if (rest) parts.push(arWordsBelow1000(rest));
  return parts.join(" و");
}

function amountToArabicWords(amount) {
  const total = Math.round((Number(amount) || 0) * 100);
  const riyals = Math.floor(total / 100), halalas = total % 100;
  let words;
  if (riyals === 1) words = "ريال سعودي واحد";
  else if (riyals === 2) words = "ريالان سعوديان";
  else { const last = riyals % 100; words = arIntegerWords(riyals) + (last >= 3 && last <= 10 ? " ريالات سعودية" : " ريال سعودي"); }
  if (halalas) {
    const hw = halalas === 1 ? "هللة واحدة" : halalas === 2 ? "هللتان" : arWordsBelow1000(halalas) + (halalas <= 10 ? " هللات" : " هللة");
    words += " و" + hw;
  }
  return "فقط " + words + " لا غير";
}

/* ---------- البيانات ---------- */
function getReceipts() { return dbGet("receipts", []); }

function nextReceiptNumber() {
  const nums = getReceipts().map(r => parseInt(String(r.number || "").replace(/\D/g, ""), 10) || 0);
  return "RV-" + (Math.max(1000, ...nums) + 1);
}

function receiptClientInfo(projectId) {
  const project = dbGet("projects", []).find(p => p.id === projectId) || {};
  const client = project.clientId ? dbGet("clients", []).find(c => c.id === project.clientId) : null;
  return { project, name: client ? client.name : (project.client || ""), phone: client ? (client.phone || "") : "", clientId: client ? client.id : (project.clientId || "") };
}

/* ---------- الطباعة المعزولة: لا يُطبع من الصفحة إلا السند ---------- */
function printIsolated(html, title) {
  let area = document.getElementById("printIsolateArea");
  if (!area) { area = document.createElement("div"); area.id = "printIsolateArea"; document.body.appendChild(area); }
  area.innerHTML = html;
  document.body.classList.add("print-isolate");
  const prevTitle = document.title;
  if (title) document.title = title; // اسم ملف PDF الافتراضي
  let finished = false;
  const done = () => {
    if (finished) return;
    finished = true;
    document.body.classList.remove("print-isolate");
    document.title = prevTitle;
    area.innerHTML = "";
    window.removeEventListener("afterprint", done);
  };
  window.addEventListener("afterprint", done);
  window.print();
  setTimeout(done, 5000);
}

/* ---------- شكل السند ---------- */
function receiptHtml(rc) {
  const c = getCompanyProfile();
  const row = (k, v) => v ? `<tr><td style="width:150px;font-weight:700;color:#444;padding:9px 12px;border:1px solid #cfcfcf;background:#f6f6f6">${k}</td><td style="padding:9px 12px;border:1px solid #cfcfcf">${v}</td></tr>` : "";
  return `
    <div class="receipt-sheet" style="font-family:inherit;color:#111;direction:rtl">
      ${companyHeaderHtml()}
      <div style="display:flex;justify-content:space-between;align-items:center;margin:14px 0 10px">
        <div style="font-size:26px;font-weight:800;letter-spacing:.5px">سند قبض</div>
        <div style="text-align:left;line-height:1.9">
          <div><strong>رقم السند:</strong> ${escHtml(rc.number)}</div>
          <div><strong>التاريخ:</strong> ${fmtDate(rc.date)}</div>
        </div>
      </div>
      <div style="border:2px solid #111;border-radius:10px;padding:12px 18px;display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <span style="font-weight:700">المبلغ المستلم</span>
        <span style="font-size:24px;font-weight:800">${fmtMoney(rc.amount)}</span>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:14.5px">
        ${row("استلمنا من السيد/ـة", escHtml(rc.clientName || "-"))}
        ${row("مبلغاً وقدره", escHtml(amountToArabicWords(rc.amount)))}
        ${row("وذلك عن", escHtml(rc.forWhat || "-"))}
        ${row("المشروع", escHtml(rc.projectName || ""))}
        ${row("طريقة الدفع", escHtml(rc.paymentMethod || ""))}
        ${row("ملاحظات", escHtml(rc.notes || ""))}
      </table>
      <div style="display:flex;justify-content:space-between;margin-top:46px;font-size:14px">
        <div style="text-align:center;min-width:200px">المستلم<div style="margin-top:34px;border-top:1px solid #888;padding-top:6px">${escHtml(rc.issuedBy || "")}</div></div>
        <div style="text-align:center;min-width:200px">ختم الشركة<div style="margin-top:34px;border-top:1px solid #888;padding-top:6px">${escHtml(c.name || "")}</div></div>
        <div style="text-align:center;min-width:200px">توقيع العميل<div style="margin-top:34px;border-top:1px solid #888;padding-top:6px">&nbsp;</div></div>
      </div>
    </div>`;
}

function receiptWhatsappUrl(rc) {
  const c = getCompanyProfile();
  let phone = String(rc.clientPhone || "").replace(/\D/g, "");
  if (phone.startsWith("00")) phone = phone.slice(2);
  else if (phone.startsWith("0")) phone = "966" + phone.slice(1);
  else if (phone.length === 9 && phone.startsWith("5")) phone = "966" + phone;
  const text = `السلام عليكم ${rc.clientName || ""}\nسند قبض رقم ${rc.number}\nالمبلغ: ${fmtMoney(rc.amount)}\n${rc.forWhat ? "عن: " + rc.forWhat + "\n" : ""}${rc.projectName ? "المشروع: " + rc.projectName + "\n" : ""}التاريخ: ${fmtDate(rc.date)}\nشكراً لكم — ${c.name || ""}`;
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

function openReceiptView(id) {
  const rc = getReceipts().find(r => r.id === id);
  if (!rc) return;
  const ov = openModalShell(`
    <div class="modal-head"><h3>سند قبض ${escHtml(rc.number)}</h3><button class="modal-close" id="mClose">×</button></div>
    <div style="background:#fff;border:1px solid var(--border);border-radius:10px;padding:14px;margin-bottom:12px;max-height:62vh;overflow:auto">${receiptHtml(rc)}</div>
    <div class="flex gap wrap">
      <button class="btn primary" id="rcPrint">${svgIcon("printer")} طباعة / حفظ PDF</button>
      <button class="btn" id="rcWhats">إرسال للعميل عبر واتساب</button>
      <button class="btn" id="rcClose">إغلاق</button>
    </div>
    <div class="hint" style="margin-top:8px">لإرسال السند كملف: اضغط «طباعة / حفظ PDF» واختر «حفظ بصيغة PDF»، ثم أرفق الملف في محادثة العميل (اسم الملف الافتراضي رقم السند).</div>
  `, true);
  ov.querySelector("#mClose").onclick = closeModal;
  ov.querySelector("#rcClose").onclick = closeModal;
  ov.querySelector("#rcPrint").onclick = () => printIsolated(receiptHtml(rc), rc.number + (rc.clientName ? " - " + rc.clientName : ""));
  ov.querySelector("#rcWhats").onclick = () => {
    if (!String(rc.clientPhone || "").replace(/\D/g, "")) toast("لا يوجد رقم جوال للعميل — اختر جهة الاتصال داخل واتساب");
    window.open(receiptWhatsappUrl(rc), "_blank", "noopener");
  };
}

/* ---------- إصدار سند قبض ---------- */
// opts: { projectId, entry (حركة إيراد موجودة لإصدار سند عنها), onSaved }
function openReceiptModal(opts) {
  const { projectId, entry, onSaved } = opts;
  const info = receiptClientInfo(projectId);
  const dateDefault = entry && entry.date ? entry.date : todayISO();
  const ov = openModalShell(`
    <div class="modal-head"><h3>إصدار سند قبض</h3><button class="modal-close" id="mClose">×</button></div>
    <div class="hint" style="margin-bottom:8px">رقم السند التالي: <strong>${nextReceiptNumber()}</strong> — المشروع: ${escHtml(info.project.name || "")}</div>
    <div class="grid cols-2">
      <div class="field"><label>استلمنا من السيد/ـة (العميل)</label><input id="rc_client" value="${escHtml(info.name)}"></div>
      <div class="field"><label>رقم جوال العميل (لإرسال السند)</label><input id="rc_phone" value="${escHtml(info.phone)}" placeholder="05xxxxxxxx"></div>
    </div>
    <div class="grid cols-3">
      <div class="field"><label>المبلغ المستلم (ر.س)</label><input type="number" min="0" step="0.01" id="rc_amount" value="${entry ? entry.amount : ""}"></div>
      <div class="field"><label>التاريخ</label><input type="date" id="rc_date" value="${dateDefault}"></div>
      <div class="field"><label>طريقة الدفع</label><select id="rc_method">${PAYMENT_METHODS.map(m => `<option value="${m}" ${entry && entry.paymentMethod === m ? "selected" : ""}>${m}</option>`).join("")}</select></div>
    </div>
    <div class="field"><label>وذلك عن</label><input id="rc_for" value="${escHtml(entry && entry.note ? entry.note : "دفعة عن أعمال مشروع " + (info.project.name || ""))}" placeholder="مثال: الدفعة الأولى من أعمال الترميم"></div>
    <div class="field"><label>ملاحظات (اختياري)</label><textarea id="rc_notes"></textarea></div>
    ${entry ? `<div class="hint">السند مرتبط بحركة الإيراد المسجلة في محاسبة المشروع — لن تُسجَّل حركة جديدة.</div>` : `
    <label class="chk" style="font-weight:700;margin-bottom:10px"><input type="checkbox" id="rc_record" checked> تسجيل المبلغ أيضاً كإيراد مشروع في حركة الحساب (بدون ضريبة — يمكن تعديلها لاحقاً)</label>`}
    <div class="flex gap"><button class="btn primary" id="rc_save">إصدار السند</button><button class="btn" id="rc_cancel">إلغاء</button></div>
  `);
  ov.querySelector("#mClose").onclick = closeModal;
  ov.querySelector("#rc_cancel").onclick = closeModal;
  ov.querySelector("#rc_save").onclick = () => {
    const amount = Number(ov.querySelector("#rc_amount").value) || 0;
    const clientName = ov.querySelector("#rc_client").value.trim();
    if (amount <= 0) { toast("يرجى إدخال مبلغ صحيح"); return; }
    if (!clientName) { toast("يرجى إدخال اسم العميل"); return; }
    const date = ov.querySelector("#rc_date").value || todayISO();
    const method = ov.querySelector("#rc_method").value;
    const number = nextReceiptNumber();
    let entryId = entry ? entry.id : "";
    const record = ov.querySelector("#rc_record");
    if (record && record.checked) {
      entryId = uid("ae");
      const entries = dbGet("accProjects", []);
      entries.push({
        id: entryId, projectId, type: "إيراد مشروع", amount, vatApplicable: false, vatAmount: 0,
        date, note: "سند قبض " + number, paymentMethod: method, receiptNumber: number,
      });
      dbSet("accProjects", entries);
    }
    const user = getCurrentUser() || {};
    const rc = {
      id: uid("rv"), number, date, projectId, projectName: info.project.name || "",
      clientId: info.clientId, clientName, clientPhone: ov.querySelector("#rc_phone").value.trim(),
      amount, paymentMethod: method, forWhat: ov.querySelector("#rc_for").value.trim(),
      notes: ov.querySelector("#rc_notes").value.trim(), entryId, issuedBy: user.name || "", createdAt: new Date().toISOString(),
    };
    const all = getReceipts();
    all.push(rc);
    dbSet("receipts", all);
    logActivity(`تم إصدار سند قبض "${number}" للعميل "${clientName}" بمبلغ ${fmtMoney(amount)}`);
    toast("تم إصدار سند القبض " + number);
    closeModal();
    if (onSaved) onSaved();
    openReceiptView(rc.id);
  };
}

/* ---------- بطاقة سندات القبض داخل محاسبة المشروع ---------- */
function renderReceiptsCard(host, projectId, rerender) {
  if (!host) return;
  const list = getReceipts().filter(r => r.projectId === projectId).sort((a, b) => (b.date + b.number) > (a.date + a.number) ? 1 : -1);
  const total = list.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  host.innerHTML = `
    <div class="card" style="margin-top:18px">
      <div class="flex between wrap" style="margin-bottom:10px">
        <h3 class="mt-0">سندات القبض <span class="badge gray">${list.length}</span></h3>
        <div class="flex gap" style="align-items:center">
          ${list.length ? `<span class="text-muted" style="font-size:12.5px">إجمالي السندات: <strong>${fmtMoney(total)}</strong></span>` : ""}
          <button class="btn sm primary" id="addReceiptBtn">+ إصدار سند قبض</button>
        </div>
      </div>
      ${list.length ? `
      <div class="table-wrap"><table class="data-table">
        <thead><tr><th>رقم السند</th><th>التاريخ</th><th>العميل</th><th>المبلغ</th><th>طريقة الدفع</th><th>عن</th><th></th></tr></thead>
        <tbody>${list.map(r => `
          <tr>
            <td><strong>${escHtml(r.number)}</strong></td>
            <td>${fmtDate(r.date)}</td>
            <td>${escHtml(r.clientName)}</td>
            <td><strong>${fmtMoney(r.amount)}</strong></td>
            <td>${escHtml(r.paymentMethod || "-")}</td>
            <td class="text-muted">${escHtml(r.forWhat || "-")}</td>
            <td style="white-space:nowrap">
              <button class="btn-icon" data-viewrc="${r.id}" title="عرض / طباعة / إرسال">${ICON_VIEW}</button>
              <button class="btn-icon danger" data-delrc="${r.id}" title="حذف السند">${ICON_DELETE}</button>
            </td>
          </tr>`).join("")}</tbody>
      </table></div>` : `<div class="empty-state"><div class="ic">${svgIcon("file-text", 40)}</div>لا توجد سندات قبض لهذا المشروع بعد</div>`}
    </div>`;
  host.querySelector("#addReceiptBtn").onclick = () => openReceiptModal({ projectId, onSaved: rerender });
  host.querySelectorAll("[data-viewrc]").forEach(b => b.onclick = () => openReceiptView(b.dataset.viewrc));
  host.querySelectorAll("[data-delrc]").forEach(b => b.onclick = () => {
    const rc = getReceipts().find(r => r.id === b.dataset.delrc);
    if (!rc || !confirm(`حذف سند القبض ${rc.number}؟ (لن يُحذف أي إيراد مسجل في حركة الحساب)`)) return;
    dbSet("receipts", getReceipts().filter(r => r.id !== rc.id));
    logActivity(`تم حذف سند قبض "${rc.number}"`);
    rerender();
  });
}

// زر "سند قبض" على صف إيراد مشروع في حركة الحساب: يفتح السند الموجود، أو يصدر سنداً مرتبطاً بالحركة
function receiptForEntry(entryId, projectId, rerender) {
  const existing = getReceipts().find(r => r.entryId === entryId);
  if (existing) { openReceiptView(existing.id); return; }
  const entry = dbGet("accProjects", []).find(e => e.id === entryId);
  if (entry) openReceiptModal({ projectId, entry, onSaved: rerender });
}

// زر "طباعة سند قبض" داخل نافذة دفعة الإيراد نفسها (عرض/تعديل): يفتح السند المرتبط أو يصدر سنداً جديداً للدفعة
function receiptEntryButtonHtml(entry) {
  if (!entry || entry.type !== "إيراد مشروع") return "";
  const existing = getReceipts().find(r => r.entryId === entry.id);
  return `<div style="margin:0 0 14px"><button type="button" class="btn primary" id="entryReceiptBtn">${svgIcon("printer")} ${existing ? "طباعة سند القبض (" + escHtml(existing.number) + ")" : "إصدار وطباعة سند قبض"}</button></div>`;
}
function bindReceiptEntryButton(ov, entry) {
  const btn = ov.querySelector("#entryReceiptBtn");
  if (!btn) return;
  btn.onclick = () => receiptForEntry(entry.id, entry.projectId, () => { if (typeof router === "function") router(); });
}
