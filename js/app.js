/* =========================================================
   شركة زهى الاعمال للمقاولات - التطبيق الرئيسي (التوجيه + الشاشة الرئيسية)
   ========================================================= */

const MENU = [
  { key: "dashboard", label: "لوحة التحكم", icon: "🏠" },
  { key: "projects", label: "المشاريع", icon: "🏗️" },
  { key: "quotes", label: "عروض الأسعار", icon: "🧾" },
  {
    key: "supervisors", label: "مهام المشرفين", icon: "👷",
    children: [
      { key: "visits", label: "زيارة موقع" },
      { key: "reports", label: "تقارير المشرفين" },
    ],
  },
  {
    key: "accounting", label: "المحاسبة", icon: "💰",
    children: [
      { key: "acc_projects", label: "محاسبة المشاريع" },
      { key: "acc_general", label: "المحاسبة العامة" },
      { key: "acc_vat", label: "ضريبة القيمة المضافة" },
    ],
  },
  { key: "contracts", label: "العقود", icon: "📄" },
  { key: "clients", label: "العملاء", icon: "👤" },
  { key: "settings", label: "الإعدادات", icon: "⚙️" },
];

const PAGE_TITLES = {
  dashboard: "لوحة التحكم",
  projects: "المشاريع",
  clients: "العملاء",
  quotes: "عروض الأسعار",
  visits: "زيارة موقع",
  reports: "تقارير المشرفين",
  acc_projects: "محاسبة المشاريع",
  acc_general: "المحاسبة العامة",
  acc_vat: "ضريبة القيمة المضافة",
  contracts: "العقود",
  settings: "الإعدادات",
};

function toast(msg) {
  let t = document.getElementById("toast");
  if (!t) {
    t = document.createElement("div");
    t.id = "toast";
    t.className = "toast";
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
}

function initials(name) {
  return (name || "").trim().split(/\s+/).slice(0, 2).map(s => s[0]).join("");
}

/* ---------- تسجيل الدخول ---------- */
function renderLogin() {
  const users = dbGet("users", []);
  document.getElementById("root").innerHTML = `
    <div class="login-wrap">
      <div class="login-card login-card-wide">
        <div class="login-logo"><img src="logo.jpg" alt="شركة زهى الاعمال للمقاولات"></div>
        <h1>شركة زهى الاعمال للمقاولات</h1>
        <p class="sub">اختر اسمك وأدخل الرقم السري لتسجيل الدخول</p>
        <div class="login-user-list">
          ${users.map(u => `
            <div class="login-user-row" data-loginrow="${u.id}">
              <div class="login-user-info">
                <div class="login-user-avatar">${initials(u.name)}</div>
                <div class="login-user-text">
                  <div class="login-user-name">${u.name}</div>
                  <div class="login-user-role">${u.role}</div>
                </div>
              </div>
              <input type="password" class="login-pass-input" data-passfor="${u.id}" placeholder="الرقم السري">
              <button class="btn sm primary" data-loginbtn="${u.id}">دخول</button>
            </div>`).join("")}
        </div>
        <p class="sub" style="margin:16px 0 0">هذا عرض تجريبي: الرقم السري اختياري لكل موظف ويُدار من الإعدادات ← التحكم بالمستخدمين.</p>
      </div>
    </div>`;

  function attemptLogin(id) {
    const u = users.find(x => x.id === id);
    if (!u) return;
    const input = document.querySelector(`[data-passfor="${id}"]`);
    const entered = input ? input.value : "";
    if (u.password && u.password !== entered) {
      toast("الرقم السري غير صحيح");
      if (input) { input.value = ""; input.focus(); }
      return;
    }
    setCurrentUser(u);
    location.hash = "#/dashboard";
    renderApp();
  }

  document.querySelectorAll("[data-loginbtn]").forEach(b => b.onclick = () => attemptLogin(b.dataset.loginbtn));
  document.querySelectorAll("[data-passfor]").forEach(inp => inp.onkeydown = (e) => {
    if (e.key === "Enter") attemptLogin(inp.dataset.passfor);
  });
}

/* ---------- الهيكل العام ---------- */
function renderApp() {
  const user = getCurrentUser();
  if (!user) { renderLogin(); return; }

  const root = document.getElementById("root");
  root.innerHTML = `
    <div class="app-shell">
      <div class="sidebar-backdrop" id="sidebarBackdrop"></div>
      <aside class="sidebar" id="sidebarAside">
        <div class="sidebar-brand">
          <div class="logo"><img src="logo.jpg" alt="شركة زهى الاعمال للمقاولات"></div>
          <div class="name">شركة زهى الاعمال للمقاولات<small>نظام إدارة المشاريع</small></div>
        </div>
        <nav class="sidebar-nav" id="sidebarNav"></nav>
        <div class="sidebar-footer">
          <div>${user.name}</div>
          <span class="role-badge">${user.role}</span>
          <div><span class="logout-btn" id="logoutBtn">تسجيل الخروج</span></div>
        </div>
      </aside>
      <div class="main">
        <div class="topbar">
          <div class="flex gap center">
            <button class="hamburger-btn" id="hamburgerBtn" type="button" title="القائمة">☰</button>
            <h2 id="pageTitle">لوحة التحكم</h2>
          </div>
          <div class="flex gap center">
            <div class="notif-bell-wrap">
              <button class="notif-bell" id="notifBellBtn" type="button" title="التنبيهات">
                🔔<span class="notif-badge" id="notifBadge" style="display:none"></span>
              </button>
              <div class="notif-panel" id="notifPanel" style="display:none"></div>
            </div>
            <div class="user-chip">
              <div class="avatar">${initials(user.name)}</div>
              <div>${user.name}<br><small class="text-muted">${user.role}</small></div>
            </div>
          </div>
        </div>
        <div class="content" id="content"></div>
      </div>
    </div>`;

  document.getElementById("logoutBtn").onclick = () => {
    setCurrentUser(null);
    location.hash = "";
    renderLogin();
  };

  document.getElementById("notifBellBtn").onclick = (e) => {
    e.stopPropagation();
    toggleNotifPanel();
  };
  document.addEventListener("click", (e) => {
    const wrap = document.querySelector(".notif-bell-wrap");
    const panel = document.getElementById("notifPanel");
    if (wrap && panel && panel.style.display !== "none" && !wrap.contains(e.target)) {
      panel.style.display = "none";
    }
  });

  document.getElementById("hamburgerBtn").onclick = (e) => { e.stopPropagation(); toggleSidebar(); };
  document.getElementById("sidebarBackdrop").onclick = () => closeSidebar();

  renderSidebar();
  renderNotifBell();
  router();
}

/* ---------- القائمة الجانبية المنسدلة ---------- */
function openSidebar() {
  document.getElementById("sidebarAside").classList.add("open");
  document.getElementById("sidebarBackdrop").classList.add("open");
}
function closeSidebar() {
  const aside = document.getElementById("sidebarAside");
  const backdrop = document.getElementById("sidebarBackdrop");
  if (aside) aside.classList.remove("open");
  if (backdrop) backdrop.classList.remove("open");
}
function toggleSidebar() {
  const aside = document.getElementById("sidebarAside");
  if (!aside) return;
  if (aside.classList.contains("open")) closeSidebar(); else openSidebar();
}

/* ---------- التنبيهات ---------- */
function renderNotifBell() {
  const user = getCurrentUser();
  if (!user) return;
  const badge = document.getElementById("notifBadge");
  if (!badge) return;
  const unread = getNotificationsForUser(user).filter(n => !n.readBy.includes(user.id));
  if (unread.length) {
    badge.textContent = unread.length > 9 ? "9+" : String(unread.length);
    badge.style.display = "flex";
  } else {
    badge.style.display = "none";
  }
}

function toggleNotifPanel() {
  const panel = document.getElementById("notifPanel");
  if (!panel) return;
  const isOpen = panel.style.display !== "none";
  if (isOpen) { panel.style.display = "none"; return; }
  renderNotifPanelContent();
  panel.style.display = "block";
}

function notifTimeAgo(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "الآن";
  if (mins < 60) return `منذ ${mins} دقيقة`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `منذ ${hrs} ساعة`;
  return `منذ ${Math.floor(hrs / 24)} يوم`;
}

function renderNotifPanelContent() {
  const user = getCurrentUser();
  const panel = document.getElementById("notifPanel");
  const notifs = getNotificationsForUser(user).slice(0, 30);
  panel.innerHTML = `
    <div class="notif-panel-head">
      <strong>التنبيهات</strong>
      ${notifs.length ? `<span class="notif-markall" id="notifMarkAll">تعليم الكل كمقروء</span>` : ""}
    </div>
    <div class="notif-list">
      ${notifs.length ? notifs.map(n => `
        <div class="notif-item ${n.readBy.includes(user.id) ? "" : "unread"}" data-notif="${n.id}" data-route="${n.relatedRoute || ""}">
          <div class="notif-item-title">${n.title}</div>
          <div class="notif-item-msg">${n.message}</div>
          <div class="notif-item-time">${notifTimeAgo(n.createdAt)}</div>
        </div>
      `).join("") : `<div class="notif-empty">لا توجد تنبيهات</div>`}
    </div>
  `;
  panel.querySelectorAll("[data-notif]").forEach(item => item.onclick = () => {
    markNotificationRead(item.dataset.notif, user.id);
    if (item.dataset.route) location.hash = "#/" + item.dataset.route;
    panel.style.display = "none";
    renderNotifBell();
  });
  const markAllBtn = document.getElementById("notifMarkAll");
  if (markAllBtn) markAllBtn.onclick = (e) => {
    e.stopPropagation();
    markAllNotificationsRead(user.id, notifs.map(n => n.id));
    renderNotifPanelContent();
    renderNotifBell();
  };
}

function renderSidebar() {
  const user = getCurrentUser();
  const nav = document.getElementById("sidebarNav");
  const currentRoute = (location.hash || "#/dashboard").replace("#/", "");

  let html = "";
  MENU.forEach(item => {
    if (item.children) {
      const visibleChildren = item.children.filter(c => canAccess(user.role, c.key));
      if (!visibleChildren.length) return;
      const isOpen = visibleChildren.some(c => c.key === currentRoute);
      html += `<div class="nav-group ${isOpen ? "open" : ""}">
        <div class="nav-link" data-group-toggle>
          <span class="ic">${item.icon}</span><span>${item.label}</span><span class="nav-caret">◀</span>
        </div>
        <div class="nav-sub">
          ${visibleChildren.map(c => `<div class="nav-link ${currentRoute === c.key ? "active" : ""}" data-route="${c.key}">${c.label}</div>`).join("")}
        </div>
      </div>`;
    } else {
      if (!canAccess(user.role, item.key)) return;
      html += `<div class="nav-link ${currentRoute === item.key ? "active" : ""}" data-route="${item.key}">
        <span class="ic">${item.icon}</span><span>${item.label}</span>
      </div>`;
    }
  });
  nav.innerHTML = html;

  nav.querySelectorAll("[data-route]").forEach(el => {
    el.onclick = () => { location.hash = "#/" + el.dataset.route; closeSidebar(); };
  });
  nav.querySelectorAll("[data-group-toggle]").forEach(el => {
    el.onclick = () => { el.parentElement.classList.toggle("open"); };
  });
}

function router() {
  const user = getCurrentUser();
  if (!user) { renderLogin(); return; }

  let route = (location.hash || "#/dashboard").replace("#/", "");
  if (!route) route = "dashboard";

  if (!canAccess(user.role, route)) {
    document.getElementById("content").innerHTML = `
      <div class="empty-state card"><div class="ic">🚫</div><h3>لا تملك صلاحية الوصول لهذه الصفحة</h3>
      <p>مسماك الوظيفي: <strong>${user.role}</strong></p></div>`;
    document.getElementById("pageTitle").textContent = "غير مصرح";
    return;
  }

  document.getElementById("pageTitle").textContent = PAGE_TITLES[route] || "شركة زهى الاعمال للمقاولات";
  renderSidebar();
  renderNotifBell();

  const renderers = {
    dashboard: renderDashboard,
    projects: renderProjects,
    clients: renderClients,
    quotes: renderQuotes,
    visits: renderVisits,
    reports: renderReports,
    acc_projects: renderAccProjects,
    acc_general: renderAccGeneral,
    acc_vat: renderAccVat,
    contracts: renderContracts,
    settings: renderSettings,
  };

  const fn = renderers[route];
  if (fn) fn(document.getElementById("content"));
}

/* ---------- لوحة التحكم ---------- */
function renderDashboard(el) {
  const projects = dbGet("projects", []);
  const reports = dbGet("reports", []).slice().sort((a, b) => (b.date > a.date ? 1 : -1));
  const quotes = dbGet("quotes", []);
  const visits = dbGet("visits", []);

  const avgCompletion = projects.length ? Math.round(projects.reduce((s, p) => s + Number(p.completion || 0), 0) / projects.length) : 0;
  const openVisits = visits.filter(v => v.status !== "منتهية").length;

  el.innerHTML = `
    <div class="section-title-row">
      <div><h2>نظرة عامة</h2><p>ملخص أداء المشاريع والتقارير اليومية</p></div>
    </div>

    <div class="grid cols-4" style="margin-bottom:18px">
      <div class="stat-card"><div class="label">عدد المشاريع الجارية</div><div class="value">${projects.length}</div></div>
      <div class="stat-card"><div class="label">متوسط نسبة الإنجاز</div><div class="value success">${avgCompletion}%</div></div>
      <div class="stat-card"><div class="label">عروض أسعار محفوظة</div><div class="value">${quotes.length}</div></div>
      <div class="stat-card"><div class="label">زيارات مواقع مفتوحة</div><div class="value warning">${openVisits}</div></div>
    </div>

    <div class="grid cols-2">
      <div class="card">
        <h3>نسبة إنجاز المشاريع</h3>
        ${projects.length ? projects.map(p => `
          <div style="margin-bottom:14px">
            <div class="flex between" style="margin-bottom:6px">
              <div>
                <strong style="font-size:13px">${p.name}</strong> ${delayedBadgeHtml(p)}
                <div class="text-muted" style="font-size:11.5px">${p.location}</div>
              </div>
              <strong style="font-size:13px">${p.completion}%</strong>
            </div>
            <div class="progress-track"><div class="progress-fill ${p.completion >= 80 ? "success" : p.completion < 40 ? "warning" : ""}" style="width:${p.completion}%"></div></div>
          </div>`).join("") : `<div class="empty-state"><div class="ic">📁</div>لا توجد مشاريع بعد</div>`}
      </div>

      <div class="card">
        <h3>آخر التقارير اليومية المرفوعة من المشرفين</h3>
        ${reports.length ? reports.slice(0, 6).map(r => `
          <div class="timeline-item">
            <div class="dot"></div>
            <div class="body">
              <div class="meta">${fmtDate(r.date)} — ${r.supervisor} — ${r.projectName}</div>
              <div style="font-size:13px">نسبة الإنجاز: <strong>${r.progress}%</strong></div>
              <div class="text-muted" style="font-size:12px">${(r.notes || "").slice(0, 90)}${(r.notes || "").length > 90 ? "…" : ""}</div>
            </div>
          </div>`).join("") : `<div class="empty-state"><div class="ic">📋</div>لا توجد تقارير مرفوعة بعد</div>`}
      </div>
    </div>
  `;
}

/* ---------- بدء التشغيل ---------- */
window.addEventListener("hashchange", router);
window.addEventListener("DOMContentLoaded", () => {
  seedIfEmpty();
  migrateClients();
  migratePriceCatalog();
  migrateProfitMargin();
  migrateProjectsSchema();
  migrateClientTypes();
  checkProjectDeadlineNotifications();
  checkVisitNotifications();
  setInterval(() => {
    if (!getCurrentUser()) return;
    checkProjectDeadlineNotifications();
    checkVisitNotifications();
    renderNotifBell(); // تحديث عداد التنبيهات فقط دون إعادة رسم الصفحة الحالية (حتى لا تُفقد أي بيانات قيد الإدخال)
  }, 5 * 60 * 1000); // إعادة فحص التنبيهات كل 5 دقائق أثناء بقاء التطبيق مفتوحاً
  renderApp();
});
