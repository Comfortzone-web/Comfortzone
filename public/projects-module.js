(function () {
  const root = document.getElementById("projectsRoot");
  if (!root) return;

  const state = { dashboard: null, dashboardQuery: "", dashboardRequest: 0, project: null, tab: "overview", search: "", filter: "all", modal: "", engineerUsers: null, selectedEngineers: [], engineerPickerOpen: false, followUpUsers: null,
    lpoOrders: null, lpoUploads: [], lpoError: "", lpoRequest: 0, lpoViewId: "",
    documentSearch: "", documentType: "all", documentCategory: "all", documentUploader: "all", selectedDocumentIds: new Set(), pendingDocumentFile: null,
    folderSelectMode: false, selectedFolderNames: new Set(), renamingFolderName: "", dashboardViewAll: "", dashboardModalSearch: "", dashboardListItems: null, dashboardListError: "",
    dashboardExpiryTimer: null, dashboardNeedsRefresh: false };
  const documentCategories = ["Shop Drawings", "Submittals", "Correspondence", "Payment", "Testing & Commissioning", "Handover"];
  const esc = value => String(value ?? "").replace(/[&<>\"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const money = value => `AED ${Number(value || 0).toLocaleString("en-AE", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  const vatInclusiveAmount = value => Number((Number(value || 0) * 1.05).toFixed(2));
  const paymentPercentage = (amount, contractValue) => vatInclusiveAmount(contractValue) > 0 ? Number((Number(amount || 0) / vatInclusiveAmount(contractValue) * 100).toFixed(2)) : 0;
  const progressTone = value => {
    const percent = Number(value) || 0;
    if (percent <= 10) return "red";
    if (percent <= 20) return "orange";
    if (percent <= 40) return "yellow";
    if (percent <= 60) return "light-blue";
    if (percent <= 80) return "dark-blue";
    if (percent <= 90) return "purple";
    return "green";
  };
  const date = value => value ? new Date(`${value}T00:00:00`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "-";
  const todayISO = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const dateTime = value => value ? new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "-";
  const statusClass = value => String(value || "pending").toLowerCase().replace(/[^a-z]+/g, "-");
  const pill = value => `<span class="pm-pill ${statusClass(value)}">${esc(value || "Pending")}</span>`;
  const statusSelect = (collection, index, field, values, selected) => `<select class="pm-status-select pm-status-${statusClass(selected)}" data-pm-item="${collection}" data-pm-index="${index}" data-pm-field="${field}">${options(values, selected)}</select>`;
  const pendingStatusSelect = (id, selected) => `<select class="pm-status-select pm-status-${statusClass(selected)}" data-pm-pending-field="status" data-pm-pending-id="${esc(id)}">${options(["Pending", "In Progress", "Completed"], selected)}</select>`;
  const initials = value => String(value || "CZ").trim().split(/\s+/).map(part => part[0]).join("").slice(0, 2).toUpperCase();
  const toast = message => {
    const item = document.createElement("div");
    item.className = "pm-toast";
    item.textContent = message;
    document.body.appendChild(item);
    setTimeout(() => item.remove(), 2600);
  };

  async function api(path, options = {}) {
    const response = await fetch(path, {
      credentials: "same-origin",
      headers: options.body instanceof FormData ? undefined : { "Content-Type": "application/json" },
      ...options
    });
    if (!response.ok) {
      const text = await response.text();
      let message = text;
      try { message = JSON.parse(text).error || message; } catch {}
      throw new Error(message || "Request failed");
    }
    const type = response.headers.get("content-type") || "";
    return type.includes("application/json") ? response.json() : response.blob();
  }

  function navigate(path) {
    history.replaceState(null, "", path);
  }

  async function open(projectId = "", tab = "overview") {
    state.tab = tab;
    state.modal = "";
    if (projectId) {
      state.dashboardRequest++;
      clearTimeout(state.dashboardExpiryTimer);
      if (state.project?.id !== projectId) {
        state.lpoOrders = null;
        state.lpoUploads = [];
        state.lpoError = "";
        state.lpoRequest++;
        state.documentSearch = "";
        state.documentType = "all";
        state.documentCategory = "all";
        state.documentUploader = "all";
        state.selectedDocumentIds.clear();
        state.folderSelectMode = false;
        state.selectedFolderNames.clear();
        state.renamingFolderName = "";
      }
      state.project = await api(`/api/project-management/projects/${encodeURIComponent(projectId)}`);
      navigate(`/projects/${encodeURIComponent(projectId)}`);
      renderDetail();
      if (tab === "lpos") await loadProjectLpos();
      return;
    }
    state.project = null;
    navigate("/projects");
    await loadDashboard();
  }

  async function loadDashboard() {
    const request = ++state.dashboardRequest;
    const query = state.search;
    const hasCachedDashboard = state.dashboard && state.dashboardQuery === query;
    clearTimeout(state.dashboardExpiryTimer);
    if (hasCachedDashboard) renderDashboard();
    else root.innerHTML = `<div class="pm-loading"><span class="pm-spinner"></span> Loading Projects...</div>`;
    try {
      const dashboard = await api(`/api/project-management/dashboard?q=${encodeURIComponent(query)}`);
      if (request !== state.dashboardRequest || state.project) return;
      state.dashboard = dashboard;
      state.dashboardQuery = query;
      state.dashboardNeedsRefresh = false;
      renderDashboard();
    } catch (error) {
      if (request !== state.dashboardRequest || state.project) return;
      if (hasCachedDashboard) toast(`Could not refresh Projects: ${error.message}`);
      else root.innerHTML = `<div class="pm-empty"><h2>Projects could not be loaded</h2><p>${esc(error.message)}</p></div>`;
    }
  }

  function filteredProjects() {
    const projects = state.dashboard?.projects || [];
    return projects.filter(project => {
      if (state.filter === "attention") return project.derived.needsAttention;
      if (state.filter === "handover") return project.derived.readyForHandover;
      if (state.filter === "completed") return project.status === "Completed";
      return state.filter === "active" ? project.status !== "Completed" : true;
    });
  }

  function renderDashboard() {
    const dashboard = state.dashboard || { kpis: {}, followUps: [], pendingWorks: [], projects: [] };
    const kpis = dashboard.kpis || {};
    const projects = filteredProjects();
    root.innerHTML = `
      <div class="pm-page-head">
        <div><h1>Projects</h1><p>Monitor project progress, pending works, payments and follow-ups.</p></div>
        <div class="pm-toolbar">
          <label class="pm-search"><span aria-hidden="true">⌕</span><input data-pm-search value="${esc(state.search)}" placeholder="Search projects..."></label>
          <select class="pm-filter-select" data-pm-filter aria-label="Filter projects">
            <option value="all" ${state.filter === "all" ? "selected" : ""}>All projects</option>
            <option value="active" ${state.filter === "active" ? "selected" : ""}>Active</option>
            <option value="attention" ${state.filter === "attention" ? "selected" : ""}>Needs attention</option>
            <option value="handover" ${state.filter === "handover" ? "selected" : ""}>Near handover</option>
            <option value="completed" ${state.filter === "completed" ? "selected" : ""}>Completed</option>
          </select>
          ${dashboard.permissions?.canCreateProject === false ? "" : `<button class="pm-primary" data-pm-action="new-project">＋ New Project</button>`}
        </div>
      </div>
      <div class="pm-kpis">
        ${kpiCard("Total Projects", kpis.totalProjects || 0, "Active projects", "blue", "▣")}
        ${kpiCard("Average Progress", `${kpis.averageProgress || 0}%`, "Overall completion", "green", "✓")}
        ${kpiCard("Needs Attention", kpis.needsAttention || 0, "Projects", "orange", "!")}
        ${kpiCard("Pending Follow-ups", kpis.pendingFollowUps || 0, "Tasks", "purple", "≡")}
        ${kpiCard("Payment Pending", money(kpis.paymentPending || 0), `Across ${kpis.paymentProjects || 0} projects`, "red", "▤")}
        ${kpiCard("Ready for Handover", kpis.readyForHandover || 0, "Projects", "teal", "⚑")}
      </div>
      <div class="pm-action-grid">
        ${followUpsPanel(dashboard.followUps || [])}
        ${pendingWorksPanel(dashboard.pendingWorks || [])}
      </div>
      <section class="pm-panel pm-projects-panel">
        <div class="pm-panel-head"><div><h2>All Projects</h2><p>${projects.length} project${projects.length === 1 ? "" : "s"} in this view</p></div><div class="pm-view-note">Action-focused view</div></div>
        ${projectsTable(projects)}
      </section>
    `;
    scheduleDashboardExpiry(dashboard);
  }

  function scheduleDashboardExpiry(dashboard) {
    clearTimeout(state.dashboardExpiryTimer);
    const now = Date.now();
    const nextExpiry = [...(dashboard.followUps || []), ...(dashboard.pendingWorks || [])]
      .filter(item => /^(finished|completed)$/i.test(item.status))
      .map(item => Date.parse(item.completedAt || item.updatedAt || "") + 24 * 60 * 60 * 1000)
      .filter(time => Number.isFinite(time) && time > now)
      .sort((a, b) => a - b)[0];
    if (!nextExpiry) return;
    state.dashboardExpiryTimer = setTimeout(() => {
      state.dashboardExpiryTimer = null;
      if (state.project) return;
      if (state.dashboardViewAll) { state.dashboardNeedsRefresh = true; return; }
      loadDashboard();
    }, nextExpiry - now + 50);
  }

  function kpiCard(title, value, subtitle, tone, icon) {
    return `<article class="pm-kpi"><div class="pm-kpi-icon ${tone}">${icon}</div><div><span>${esc(title)}</span><strong>${esc(value)}</strong><small>${esc(subtitle)}</small></div></article>`;
  }

  function followUpsPanel(items) {
    const rows = items.map(item => `<tr data-pm-open-project="${esc(item.projectId)}" data-pm-open-tab="followups"><td><strong title="${esc(item.projectName)}">${esc(item.projectName)}</strong><small>${date(item.date)}</small></td><td><strong title="${esc(item.subject)}">${esc(item.subject)}</strong><small title="${esc(item.notes || "-")}">${esc(item.notes || "-")}</small></td><td><div class="pm-followup-status-assigned">${pill(item.status)}<span class="pm-assignee"><b>${initials(item.assigned)}</b><span title="${esc(item.assigned || "Unassigned")}">${esc(item.assigned || "Unassigned")}</span></span></div></td></tr>`).join("");
    return `<section class="pm-panel pm-action-panel pm-dashboard-followups"><div class="pm-panel-head"><div><h2>Follow-ups <em>${items.length}</em></h2><p>What needs a response next</p></div><button class="pm-link" data-pm-action="open-dashboard-list" data-pm-list="followups">View All →</button></div><div class="pm-table-wrap" role="region" aria-label="Follow-ups list" tabindex="0"><table class="pm-table"><thead><tr><th>Project / Date</th><th>Subject / Notes</th><th>Status / Assigned</th></tr></thead><tbody>${rows || `<tr><td colspan="3" class="pm-table-empty">No follow-ups need attention.</td></tr>`}</tbody></table></div></section>`;
  }

  function pendingWorksPanel(items) {
    const cards = items.map(item => `<article class="pm-pending-card" data-pm-open-project="${esc(item.projectId)}" data-pm-open-tab="pending"><div class="pm-pending-card-head"><strong>${esc(item.projectName)}</strong>${pill(item.status)}<span class="pm-pending-card-arrow" aria-hidden="true">›</span></div><p>${esc(item.workItem)}</p><time>${date(item.dueDate || todayISO())}</time></article>`).join("");
    return `<section class="pm-panel pm-action-panel pm-pending-panel"><div class="pm-panel-head"><div><h2>Pending Works <em>${items.length}</em></h2><p>Open a project to move work forward</p></div><button class="pm-link" data-pm-action="open-dashboard-list" data-pm-list="pending">View All →</button></div><div class="pm-pending-cards" role="region" aria-label="Pending works list" tabindex="0">${cards || `<div class="pm-table-empty">No pending works.</div>`}</div></section>`;
  }

  function openDashboardList(type) {
    if (!["followups", "pending"].includes(type)) return;
    state.dashboardViewAll = type;
    state.dashboardModalSearch = "";
    state.dashboardListItems = null;
    state.dashboardListError = "";
    const title = type === "followups" ? "Follow-ups" : "Pending Works";
    root.insertAdjacentHTML("beforeend", `<div class="pm-modal-backdrop pm-dashboard-list-backdrop"><section class="pm-modal pm-dashboard-list-modal" role="dialog" aria-modal="true" aria-label="All ${title}"><div class="pm-modal-head"><div><h2>${title}</h2><p>${type === "followups" ? "What needs a response next" : "Open a project to move work forward"}</p></div><button type="button" class="pm-close" data-pm-action="close-modal" aria-label="Close ${title}">×</button></div><div class="pm-dashboard-list-toolbar"><label class="pm-search"><span aria-hidden="true">⌕</span><input type="search" data-pm-dashboard-list-search placeholder="Search ${title.toLowerCase()}..." aria-label="Search ${title.toLowerCase()}"></label><span data-pm-dashboard-list-count></span></div><div class="pm-dashboard-list-results" data-pm-dashboard-list-results></div></section></div>`);
    renderDashboardListResults();
    root.querySelector("[data-pm-dashboard-list-search]")?.focus();
    api("/api/project-management/dashboard").then(dashboard => {
      if (state.dashboardViewAll !== type || !root.querySelector(".pm-dashboard-list-backdrop")) return;
      state.dashboardListItems = type === "followups" ? dashboard.followUps || [] : dashboard.pendingWorks || [];
      renderDashboardListResults();
    }).catch(error => {
      if (state.dashboardViewAll !== type || !root.querySelector(".pm-dashboard-list-backdrop")) return;
      state.dashboardListError = error.message;
      renderDashboardListResults();
    });
  }

  function renderDashboardListResults() {
    const type = state.dashboardViewAll;
    const items = state.dashboardListItems;
    const results = root.querySelector("[data-pm-dashboard-list-results]");
    if (!results) return;
    if (!items) {
      results.innerHTML = `<div class="pm-dashboard-list-empty">${state.dashboardListError ? esc(state.dashboardListError) : "Loading items..."}</div>`;
      root.querySelector("[data-pm-dashboard-list-count]").textContent = "";
      return;
    }
    const query = state.dashboardModalSearch.trim().toLowerCase();
    const matches = items.filter(item => !query || (type === "followups"
      ? [item.projectName, item.subject, item.notes, item.assigned, item.status, date(item.date)]
      : [item.projectName, item.workItem, item.status, date(item.dueDate || todayISO())]
    ).some(value => String(value || "").toLowerCase().includes(query)));
    if (type === "followups") {
      const rows = matches.map(item => `<tr><td><button class="pm-dashboard-list-project" type="button" data-pm-open-project="${esc(item.projectId)}" data-pm-open-tab="followups"><strong>${esc(item.projectName)}</strong><small>${date(item.date)}</small></button></td><td><strong>${esc(item.subject)}</strong><small>${esc(item.notes || "-")}</small></td><td>${pill(item.status)}<small>${esc(item.assigned || "Unassigned")}</small></td></tr>`).join("");
      results.innerHTML = `<div class="pm-table-wrap"><table class="pm-table pm-dashboard-list-table"><thead><tr><th>Project / Date</th><th>Subject / Notes</th><th>Status / Assigned</th></tr></thead><tbody>${rows || `<tr><td colspan="3" class="pm-table-empty">${query ? "No follow-ups match your search." : "No follow-ups need attention."}</td></tr>`}</tbody></table></div>`;
    } else {
      results.innerHTML = `<div class="pm-dashboard-list-cards">${matches.map(item => `<button class="pm-pending-card pm-dashboard-list-card" type="button" data-pm-open-project="${esc(item.projectId)}" data-pm-open-tab="pending"><span class="pm-pending-card-head"><strong>${esc(item.projectName)}</strong>${pill(item.status)}<span class="pm-pending-card-arrow" aria-hidden="true">›</span></span><span class="pm-dashboard-list-description">${esc(item.workItem)}</span><time>${date(item.dueDate || todayISO())}</time></button>`).join("") || `<div class="pm-table-empty">${query ? "No pending works match your search." : "No pending works."}</div>`}</div>`;
    }
    root.querySelector("[data-pm-dashboard-list-count]").textContent = `${matches.length} of ${items.length}`;
  }

  function projectsTable(projects) {
    const countTone = count => count >= 6 ? "high" : count >= 3 ? "medium" : count >= 1 ? "low" : "zero";
    const rows = projects.map((project, index) => {
      const { derived } = project;
      const pendingTone = countTone(derived.pendingWorkCount);
      const followUpTone = countTone(derived.activeFollowUpCount);
      const paymentTone = Number(derived.receivedPayment) > 0 ? "received" : "unreceived";
      return `<tr data-pm-open-project="${esc(project.id)}"><td>${index + 1}</td><td><button class="pm-project-name-link" type="button" data-pm-open-project="${esc(project.id)}" aria-label="Open ${esc(project.name)}"><strong>${esc(project.code || project.name)}</strong></button><small>${esc(project.code ? project.name : project.customer || "-")}</small></td><td><div class="pm-progress pm-progress-${progressTone(derived.progress)}"><span><i style="width:${derived.progress}%"></i></span><b>${derived.progress}%</b></div></td><td><span class="pm-project-stage pm-project-stage-${statusClass(derived.nextMilestone)}">${esc(derived.nextMilestone)}</span></td><td><span class="pm-payment"><strong class="pm-payment-${paymentTone}">${esc(derived.paymentStatus)}</strong>${derived.receivedPaymentKnown && project.contractValue ? ` <small>of ${money(vatInclusiveAmount(project.contractValue))}</small>` : ""}</span></td><td><span class="pm-project-count pm-project-pending-${pendingTone}">${derived.pendingWorkCount}</span></td><td><span class="pm-project-count pm-project-followup-${followUpTone}">${derived.activeFollowUpCount}</span></td><td>${dateTime(project.updatedAt)}</td></tr>`;
    }).join("");
    return `<div class="pm-table-wrap pm-all-projects-table"><table class="pm-table"><thead><tr><th>#</th><th>Project</th><th>Progress</th><th>Current Stage</th><th>Payment Status</th><th>Pending Works</th><th>Follow-ups</th><th>Last Updated</th></tr></thead><tbody>${rows || `<tr><td colspan="8" class="pm-table-empty">No projects match this filter. Create a project to get started.</td></tr>`}</tbody></table></div>`;
  }

  function detailHeader(project) {
    const d = project.derived;
    const contractWithVat = vatInclusiveAmount(project.contractValue);
    const receivedPercent = contractWithVat ? Math.min(100, d.receivedPayment / contractWithVat * 100) : 0;
    const pendingPaymentPercent = contractWithVat ? `${Math.max(0, Math.round(100 - receivedPercent))}% Pending` : "Pending amount not specified";
    return `<div class="pm-detail-head"><div><div class="pm-breadcrumb"><button data-pm-action="back">Projects</button><span>›</span><b>${esc(project.code || project.name)}</b></div><h1>${esc(project.code ? `${project.code} – ${project.name}` : project.name)}</h1><p>Client: ${esc(project.customer || "-")} · Consultant: ${esc(project.consultant || "-")} ${project.location ? `· Location: ${esc(project.location)}` : "· Location: -"}</p></div><div class="pm-detail-actions"><button class="pm-secondary" data-pm-action="back">← Back to Projects</button><button class="pm-secondary" data-pm-action="edit-project">✎ Edit Project</button><button class="pm-secondary" data-pm-action="delete-project">...</button>${pill(project.status)}</div></div>
      <div class="pm-detail-kpis"><div class="pm-detail-progress"><div class="pm-ring pm-progress-${progressTone(d.progress)}" style="--pm-progress:${d.progress}%"><strong>${d.progress}%</strong></div><div><b>Project Progress</b><span>${esc(d.nextMilestone === "Completed" ? "Ready for handover" : `Next: ${d.nextMilestone}`)}</span></div></div><div class="pm-detail-stat"><span>Current Stage</span><strong>${esc(d.nextMilestone)}</strong>${pill(project.status)}</div><div class="pm-detail-stat"><span>Contract Value</span><strong>${project.contractValue ? `${money(project.contractValue)} <span class="pm-contract-vat">+ VAT</span>` : "-"}</strong><small>${project.contractValue ? `${money(contractWithVat)} Incl VAT` : "Not specified"}</small></div><div class="pm-detail-stat"><span>Payment Received</span><strong>${esc(d.paymentStatus)}</strong><div class="pm-mini-progress"><i style="width:${receivedPercent}%"></i></div><small>${esc(pendingPaymentPercent)}</small></div><div class="pm-detail-stat"><span>Target Handover</span><strong>${date(project.targetHandover)}</strong><small>${project.targetHandover ? `${Math.max(0, Math.ceil((new Date(`${project.targetHandover}T00:00:00`) - new Date()) / 86400000))} days left` : "Set a target date"}</small></div></div>`;
  }

  function renderDetail() {
    const project = state.project;
    if (!project) return open();
    root.innerHTML = `${detailHeader(project)}<nav class="pm-tabs">${["overview", "information", "installation", "pending", "payment", "followups", "lpos", "documents", "activity"].map(tab => `<button class="${state.tab === tab ? "active" : ""}" data-pm-tab="${tab}">${tab === "information" ? "Project Information" : tab === "followups" ? "Follow-ups" : tab === "lpos" ? "LPO's" : tab === "activity" ? "Activity History" : tab === "installation" ? "Installation Progress" : tab === "pending" ? "Pending Works" : tab[0].toUpperCase() + tab.slice(1)}</button>`).join("")}</nav><div class="pm-detail-content">${detailTab(project)}</div>`;
  }

  function detailTab(project) {
    if (state.tab === "information") return informationTab(project);
    if (state.tab === "installation") return installationTab(project);
    if (state.tab === "pending") return pendingWorksTab(project);
    if (state.tab === "payment") return paymentTab(project);
    if (state.tab === "followups") return followUpsTab(project);
    if (state.tab === "lpos") return lposTab();
    if (state.tab === "documents") return documentsTab(project);
    if (state.tab === "activity") return activityTab(project);
    return overviewTab(project);
  }

  function overviewTab(project) {
    const d = project.derived;
    return `<div class="pm-command-grid"><div class="pm-command-main"><section class="pm-panel pm-command-docs"><div class="pm-panel-head"><div><h2>Documentation / Submittals</h2><p>${project.submittals.filter(item => /^approved$/i.test(item.status)).length} of ${project.submittals.length} approved</p></div><button class="pm-link" data-pm-tab="information">View All →</button></div>${compactSubmittals(project)}</section><section class="pm-panel pm-command-installation"><div class="pm-panel-head"><div><h2>Installation Progress</h2><p>${project.installationItems.filter(item => item.installation_status === "completed").length} of ${project.installationItems.length} rows completed</p></div><button class="pm-link" data-pm-tab="installation">View All Installation Items →</button></div>${compactInstallation(project)}</section><section class="pm-panel pm-command-testing"><div class="pm-panel-head"><div><h2>Testing & Commissioning</h2><p>${project.testingItems.filter(item => /^(finished|completed)$/i.test(item.status)).length} of ${project.testingItems.length} finished</p></div><button class="pm-link" data-pm-tab="information">View All →</button></div>${compactTesting(project)}</section></div><aside class="pm-command-side"><section class="pm-panel pm-command-payment"><div class="pm-panel-head"><div><h2>Payment Terms</h2><p>${d.paymentStatus}${d.pendingPayment ? ` · ${money(d.pendingPayment)} pending` : ""}</p></div><button class="pm-link" data-pm-tab="payment">View All Payment Terms →</button></div>${compactPayments(project)}</section><section class="pm-panel pm-command-followups"><div class="pm-panel-head"><div><h2>Follow-ups <em>${project.followUps.length}</em></h2><p>Latest actions requiring attention</p></div><button class="pm-link" data-pm-tab="followups">View All Follow-ups →</button></div>${compactFollowUps(project)}</section></aside></div>`;
  }

  function compactSubmittals(project) { return `<div class="pm-compact-table"><div class="pm-compact-row pm-compact-head"><span>Item</span><span>Status</span><span>Comments</span></div>${project.submittals.slice(0, 4).map(item => `<div class="pm-compact-row"><span>${esc(item.item)}</span><span>${pill(item.status)}</span><small>${esc(item.comments || "-")}</small></div>`).join("")}</div>`; }
  function compactFollowUps(project) { const items = project.followUps.filter(item => !/^(finished|completed)$/i.test(item.status)).slice(0, 6); return `<div class="pm-followup-timeline">${items.map(item => `<div class="pm-followup-item"><span class="pm-followup-dot"></span><div><div class="pm-followup-meta"><b>${date(item.date)}</b>${pill(item.status)}</div><strong>${esc(item.subject)}</strong><small>${esc(item.notes || "-")}</small><small>Assigned: ${esc(item.assigned || "Unassigned")}</small></div></div>`).join("") || `<div class="pm-table-empty">No active follow-ups.</div>`}</div>`; }
  function checkpointSvg(status) { return status === "completed" ? `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 10 3.1 3.1L15 6.5"></path></svg>` : status === "in_progress" ? `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 10h10"></path></svg>` : status === "issue" ? `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6 6 8 8M14 6l-8 8"></path></svg>` : ""; }
  function checkpointIcon(value, field = "", index = "") { const status = ["completed", "in_progress", "issue", "not_started"].includes(value) ? value : "not_started"; const label = ({ completed: "Completed", in_progress: "In Progress / Partial", issue: "Issue / Not Available", not_started: "Not Started" })[status]; if (!field) return `<span class="pm-checkpoint pm-checkpoint-${status}" title="${label}">${checkpointSvg(status)}</span>`; return `<button type="button" class="pm-checkpoint pm-checkpoint-${status}" title="${label}" aria-label="${label}" data-pm-checkpoint="${field}" data-pm-index="${index}">${checkpointSvg(status)}</button>`; }
  function compactInstallation(project) { return `<div class="pm-compact-table pm-installation-summary"><div class="pm-compact-row pm-compact-head"><span>#</span><span>Work Item</span><span>LPO</span><span>Delivery</span><span>Installation</span><span>Comments</span></div>${project.installationItems.map((item, index) => `<div class="pm-compact-row"><span>${index + 1}</span><span>${esc(item.item)}</span><span>${checkpointIcon(item.lpo_status)}</span><span>${checkpointIcon(item.delivered_status)}</span><span>${checkpointIcon(item.installation_status)}</span><small>${esc(item.comments || "-")}</small></div>`).join("")}</div>`; }
  function compactPayments(project) { return `<div class="pm-compact-table pm-payment-summary"><div class="pm-compact-row pm-compact-head"><span>Payment Details</span><span>%</span><span>Amount</span><span>Status</span></div>${project.payments.slice(0, 5).map(item => `<div class="pm-compact-row"><span>${esc(item.milestone)}</span><span>${item.amount === "" ? "-" : `${paymentPercentage(item.amount, project.contractValue)}%`}</span><span>${item.amount === "" ? "-" : money(item.amount)}</span><span>${pill(item.status)}</span></div>`).join("")}</div>`; }
  function compactTesting(project) { return `<div class="pm-compact-table"><div class="pm-compact-row pm-compact-head"><span>Activity</span><span>Status</span><span>Comments</span></div>${project.testingItems.slice(0, 4).map(item => `<div class="pm-compact-row"><span>${esc(item.activity)}</span><span>${pill(item.status)}</span><small>${esc(item.comments || "-")}</small></div>`).join("")}</div>`; }

  function pendingWorksTab(project) {
    const items = project.derived.pendingWorkRows || project.derived.pendingWorks || [];
    const rows = items.map((item, index) => `<tr><td>${index + 1}</td><td class="pm-pending-project-date"><strong>${esc(project.name)}</strong><small>${date(item.dueDate || todayISO())}</small></td><td>${pendingStatusSelect(item.id, item.status)}</td><td><input class="pm-inline-edit pm-bold-edit" data-pm-pending-field="workItem" data-pm-pending-id="${esc(item.id)}" value="${esc(item.workItem)}"></td><td class="pm-delete-cell"><button class="pm-row-action pm-inline-row-delete" type="button" title="Delete pending work" aria-label="Delete pending work" data-pm-action="delete-pending-work" data-pm-pending-id="${esc(item.id)}"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6 6 8 8M14 6l-8 8"></path></svg></button></td></tr>`).join("");
    return `<section class="pm-panel pm-pending-detail-panel"><div class="pm-panel-head"><div><h2>Pending Works <em>${items.length}</em></h2><p>Open items that need to be completed to move this project forward.</p></div><button class="pm-secondary" type="button" data-pm-action="add-pending-work">＋ Add Pending Work</button></div><div class="pm-table-wrap pm-rounded-table-wrap"><table class="pm-table pm-edit-table pm-pending-detail-table"><thead><tr><th>#</th><th>Project / Date</th><th>Status</th><th>Work Item</th><th class="pm-delete-col"><span class="sr-only">Delete</span></th></tr></thead><tbody>${rows || `<tr><td colspan="5" class="pm-table-empty">No pending works.</td></tr>`}</tbody></table></div></section>`;
  }

  function informationTab(project) {
    return `<div class="pm-section-grid"><section class="pm-panel"><div class="pm-panel-head"><div><h2>Project Information</h2><p>Keep the project identity and commercial details current.</p></div><button class="pm-secondary" data-pm-action="edit-project">✎ Edit</button></div><div class="pm-info-grid">${info("Customer", project.customer)}${info("Consultant", project.consultant)}${info("Contact Person", project.contact)}${info("Phone", project.phone)}${info("Email", project.email)}${info("Location", project.location)}${info("Project Engineers", (project.projectEngineers || []).map(user => user.name).join(", "))}${info("Target Handover", date(project.targetHandover))}${info("Contract Value", project.contractValue ? money(project.contractValue) : "-")}${info("Progress", `${project.derived.progress}% calculated`)}${info("Created By", project.createdBy)}${info("Payment Note", project.paymentSummary)}${info("Project Details", project.notes, true)}</div></section><section class="pm-panel"><div class="pm-panel-head"><div><h2>Documentation / Submittals</h2><p>All rows must be approved for this milestone to complete.</p></div><button class="pm-secondary" data-pm-action="add-row" data-pm-section="submittals">＋ Add row</button></div>${editableSubmittalTable(project)}</section>${testingTab(project)}</div>`;
  }

  function info(label, value, full = false) { return `<div${full ? ' class="pm-info-full"' : ""}><span>${esc(label)}</span><b>${esc(value || "-")}</b></div>`; }
  function editableSubmittalTable(project) { return `<div class="pm-table-wrap pm-rounded-table-wrap"><table class="pm-table pm-edit-table pm-submittal-table"><thead><tr><th>Item</th><th>Status</th><th>Comments</th><th class="pm-delete-col"><span class="sr-only">Delete</span></th></tr></thead><tbody>${project.submittals.map((item, index) => `<tr><td><input class="pm-inline-edit pm-bold-edit" data-pm-item="submittals" data-pm-index="${index}" data-pm-field="item" value="${esc(item.item)}"></td><td>${statusSelect("submittals", index, "status", ["Pending", "Submitted", "Approved", "Revised"], item.status)}</td><td><textarea class="pm-inline-edit pm-comment-edit" rows="1" data-pm-item="submittals" data-pm-index="${index}" data-pm-field="comments">${esc(item.comments)}</textarea></td><td class="pm-delete-cell"><button class="pm-row-action pm-inline-row-delete" type="button" title="Delete submittal" aria-label="Delete submittal" data-pm-action="delete-row" data-pm-section="submittals" data-pm-index="${index}"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6 6 8 8M14 6l-8 8"></path></svg></button></td></tr>`).join("")}</tbody></table></div>`; }

  function installationProgress(item) {
    if (Number.isFinite(Number(item.progress))) return Math.min(100, Math.max(0, Number(item.progress)));
    const noted = String(item.comments || "").match(/(\d{1,3})\s*%/);
    return noted ? Math.min(100, Number(noted[1])) : 0;
  }

  function installationStatus(item) {
    const text = `${item.installation_status} ${item.comments}`;
    if (/\b(on hold|blocked|delayed|delay)\b/i.test(text)) return "On Hold";
    if (item.installation_status === "issue") return "On Hold";
    if (item.installation_status === "completed") return "Completed";
    if (item.installation_status === "in_progress") return "In Progress";
    return "Not Started";
  }

  function installationUpdates(project) {
    return [...project.installationItems].sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""))).slice(0, 6);
  }

  function installationNotes(project) {
    const saved = (project.installationNotes || []).map(item => ({ id: item.id, source: "manual", sourceId: item.id, note: item.note, date: item.date || item.createdAt, createdBy: item.createdBy }));
    const comments = project.installationItems.filter(item => item.comments).map(item => ({ id: `item-${item.id}`, source: "item", sourceId: item.id, note: item.comments, date: item.updatedAt, createdBy: item.updatedBy }));
    return [...saved, ...comments].sort((a, b) => String(b.date || "").localeCompare(String(a.date || ""))).slice(0, 6);
  }

  function installationChecklistPanel(project) {
    return `<section class="pm-panel pm-installation-checklist"><div class="pm-panel-head"><div><h2>Installation Checklist</h2><p>Keep the next site-readiness checks visible.</p></div><button class="pm-link" data-pm-action="add-checklist-item">＋ Add Item</button></div><div class="pm-checklist-list">${(project.installationChecklist || []).map((item, index) => `<div class="pm-checklist-row">${checkpointIcon(item.status, "checklist_status", index)}<input class="pm-checklist-input" data-pm-checklist-item data-pm-index="${index}" value="${esc(item.item)}"><button class="pm-inline-delete" type="button" title="Delete checklist item" aria-label="Delete checklist item" data-pm-action="delete-checklist-item" data-pm-index="${index}"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6 6 8 8M14 6l-8 8"></path></svg></button></div>`).join("") || `<div class="pm-table-empty">No checklist items yet.</div>`}</div></section>`;
  }

  function installationNotesPanel(project) {
    const notes = installationNotes(project);
    return `<section class="pm-panel pm-installation-notes"><div class="pm-panel-head"><div><h2>Installation Notes</h2><p>Recent site notes and observations.</p></div><button class="pm-link" data-pm-action="add-installation-note">＋ Add Note</button></div><div class="pm-notes-list">${notes.map((item, index) => `<article class="pm-note-row"><span class="pm-note-icon"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6 3.5h6l2 2v11H6zM12 3.5v3h2M8 10h4M8 13h4"></path></svg></span><div><textarea class="pm-note-input" rows="2" data-pm-note-edit="${item.source}" data-pm-note-id="${esc(item.sourceId)}">${esc(item.note)}</textarea><small>${dateTime(item.date)}${item.createdBy ? ` · By ${esc(item.createdBy)}` : ""}</small></div><button class="pm-inline-delete" type="button" title="Delete note" aria-label="Delete note" data-pm-action="delete-installation-note" data-pm-note-source="${item.source}" data-pm-note-id="${esc(item.sourceId)}"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6 6 8 8M14 6l-8 8"></path></svg></button></article>`).join("") || `<div class="pm-table-empty">No installation notes yet.</div>`}</div></section>`;
  }

  function installationUpdatesPanel(project) {
    return `<div class="pm-installation-side">${installationChecklistPanel(project)}${installationNotesPanel(project)}</div>`;
  }

  function installationTab(project) {
    const completed = project.installationItems.filter(item => item.installation_status === "completed").length;
    return `<div class="pm-installation-layout"><section class="pm-panel pm-installation-main"><div class="pm-panel-head"><div><h2>Installation Progress</h2><p>Track and manage all installation work items for this project. ${completed} of ${project.installationItems.length} completed.</p></div><button class="pm-primary" data-pm-action="add-row" data-pm-section="installationItems">＋ Add Work Item</button></div><div class="pm-table-wrap"><table class="pm-table pm-edit-table pm-installation-table"><thead><tr><th>#</th><th>Work Item</th><th>LPO</th><th>Delivery</th><th>Installation</th><th>Comments</th><th>Actions</th></tr></thead><tbody>${project.installationItems.map((item, index) => `<tr><td>${index + 1}</td><td><input data-pm-item="installationItems" data-pm-index="${index}" data-pm-field="item" value="${esc(item.item)}"></td><td>${checkpointIcon(item.lpo_status, "lpo_status", index)}</td><td>${checkpointIcon(item.delivered_status, "delivered_status", index)}</td><td>${checkpointIcon(item.installation_status, "installation_status", index)}</td><td><input data-pm-item="installationItems" data-pm-index="${index}" data-pm-field="comments" value="${esc(item.comments)}"></td><td><button class="pm-row-action" type="button" title="Delete work item" aria-label="Delete work item" data-pm-action="delete-row" data-pm-section="installationItems" data-pm-index="${index}"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6 6 8 8M14 6l-8 8"></path></svg></button></td></tr>`).join("") || `<tr><td colspan="7" class="pm-table-empty">No installation work items yet.</td></tr>`}</tbody></table></div></section>${installationUpdatesPanel(project)}</div>`;
  }

  function testingTab(project) {
    return `<section class="pm-panel pm-section-wide"><div class="pm-panel-head"><div><h2>Testing & Commissioning</h2><p>Update each activity as it moves toward handover.</p></div><button class="pm-secondary" data-pm-action="add-row" data-pm-section="testingItems">＋ Add row</button></div><div class="pm-table-wrap pm-rounded-table-wrap"><table class="pm-table pm-edit-table pm-testing-table"><thead><tr><th>#</th><th>Activity</th><th>Status</th><th>Comments</th><th class="pm-delete-col"><span class="sr-only">Delete</span></th></tr></thead><tbody>${project.testingItems.map((item, index) => `<tr><td>${index + 1}</td><td><input class="pm-inline-edit pm-bold-edit" data-pm-item="testingItems" data-pm-index="${index}" data-pm-field="activity" value="${esc(item.activity)}"></td><td>${statusSelect("testingItems", index, "status", ["Not Started", "Pending", "In Progress", "Finished"], item.status)}</td><td><textarea class="pm-inline-edit pm-comment-edit" rows="1" data-pm-item="testingItems" data-pm-index="${index}" data-pm-field="comments">${esc(item.comments)}</textarea></td><td class="pm-delete-cell"><button class="pm-row-action pm-inline-row-delete" type="button" title="Delete testing row" aria-label="Delete testing row" data-pm-action="delete-row" data-pm-section="testingItems" data-pm-index="${index}"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6 6 8 8M14 6l-8 8"></path></svg></button></td></tr>`).join("")}</tbody></table></div></section>`;
  }

  function paymentTab(project) {
    const rows = project.payments.map((item, index) => `<tr><td>${index + 1}</td><td><input data-pm-item="payments" data-pm-index="${index}" data-pm-field="milestone" value="${esc(item.milestone)}" aria-label="Milestone ${index + 1}"></td><td><input type="number" min="0" step="0.01" data-pm-item="payments" data-pm-index="${index}" data-pm-field="amount" value="${esc(item.amount)}" aria-label="Amount for ${esc(item.milestone)}"></td><td><output class="pm-payment-percentage">${item.amount === "" ? "" : `${paymentPercentage(item.amount, project.contractValue)}%`}</output></td><td><input type="date" data-pm-item="payments" data-pm-index="${index}" data-pm-field="dueDate" value="${esc(item.dueDate)}" aria-label="Payment date for ${esc(item.milestone)}"></td><td>${statusSelect("payments", index, "status", ["Pending", "Proforma sent", "Received"], item.status === "Paid" ? "Received" : item.status)}</td><td><input data-pm-item="payments" data-pm-index="${index}" data-pm-field="comments" value="${esc(item.comments)}" aria-label="Comments for ${esc(item.milestone)}"></td><td class="pm-delete-cell"><button class="pm-row-action pm-payment-delete" type="button" title="Delete payment row" aria-label="Delete ${esc(item.milestone)}" data-pm-action="delete-row" data-pm-section="payments" data-pm-index="${index}"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6 6 8 8M14 6l-8 8"></path></svg></button></td></tr>`).join("");
    return `<section class="pm-panel pm-payment-panel"><div class="pm-panel-head"><div><h2>Payment Terms</h2><p>The outstanding payment for the project is <strong class="pm-payment-outstanding">${money(project.derived.pendingPayment)}</strong>.</p></div><button class="pm-secondary" data-pm-action="add-row" data-pm-section="payments">＋ Add Payment</button></div><div class="pm-table-wrap"><table class="pm-table pm-edit-table pm-payment-table"><thead><tr><th>#</th><th>Payment Details</th><th>Amount (AED)</th><th>%</th><th>Payment Date</th><th>Status</th><th>Comments</th><th class="pm-delete-col"></th></tr></thead><tbody>${rows || `<tr><td colspan="8" class="pm-table-empty">No payment milestones yet.</td></tr>`}</tbody></table></div></section>`;
  }

  function followUpsTab(project) {
    const rows = project.followUps.map((item, index) => `<tr><td>${date(item.date)}</td><td><strong>${esc(item.subject)}</strong><small>${esc(item.notes)}</small></td><td>${esc(item.assigned || "Unassigned")}</td><td>${pill(item.status)}</td><td>${pill(item.priority)}</td><td><button class="pm-followup-more" type="button" aria-label="More actions for ${esc(item.subject)}" aria-haspopup="menu" aria-expanded="false" data-pm-action="followup-menu" data-pm-index="${index}">⋯</button></td></tr>`).join("");
    return `<section class="pm-panel"><div class="pm-panel-head"><div><h2>Follow-ups</h2><p>Capture the next conversation or site action before it gets lost.</p></div><button class="pm-primary" data-pm-action="add-followup">＋ Add Follow-up</button></div><div class="pm-table-wrap"><table class="pm-table pm-followups-table"><thead><tr><th>Date</th><th>Subject</th><th>Assigned</th><th>Status</th><th>Priority</th><th aria-label="Actions"></th></tr></thead><tbody>${rows || `<tr><td colspan="6" class="pm-table-empty">No follow-ups yet.</td></tr>`}</tbody></table></div></section>`;
  }

  function lposTab() {
    const orders = state.lpoOrders;
    const rows = orders?.map((order, index) => `<tr><td>${index + 1}</td><td><button class="pm-lpo-link" type="button" data-pm-action="open-lpo" data-pm-lpo-id="${esc(order.id)}">${esc(order.poNo || "-")}</button><small>${date(order.poDate)}</small></td><td>${esc(order.supplierName || "-")}</td><td>${esc(order.purchaseRepresentative || "-")}</td><td>${Number(order.grandTotal || 0).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td><td>${pill(order.status)}</td><td><button class="pm-lpo-view" type="button" data-pm-action="view-lpo" data-pm-lpo-id="${esc(order.id)}" aria-label="View ${esc(order.poNo || "purchase order")}">View</button></td></tr>`).join("");
    const empty = state.lpoError
      ? `Could not load purchase orders. <button class="pm-link" type="button" data-pm-action="retry-lpos">Retry</button>`
      : orders ? "No created purchase orders for this project." : "Loading purchase orders...";
    return `<section class="pm-panel pm-lpo-panel"><div class="pm-panel-head"><div><h2>LPO's ${orders ? `<em>${orders.length}</em>` : ""}</h2><p>Purchase orders created for this project.</p></div></div><div class="pm-table-wrap"><table class="pm-table pm-lpo-table"><thead><tr><th>#</th><th>LPO No. / Date</th><th>Supplier</th><th>Purchase Rep</th><th>Grand Total (AED)</th><th>Status</th><th>Action</th></tr></thead><tbody>${rows || `<tr><td colspan="7" class="pm-table-empty">${empty}</td></tr>`}</tbody></table></div></section>`;
  }

  async function loadProjectLpos() {
    const project = state.project;
    if (!project) return;
    const request = ++state.lpoRequest;
    state.lpoOrders = null;
    state.lpoError = "";
    root.querySelector(".pm-detail-content").innerHTML = lposTab();
    try {
      const purchaseOrders = await api("/api/purchase-orders");
      if (request !== state.lpoRequest || state.project?.id !== project.id || state.tab !== "lpos") return;
      const projectName = String(project.name || "").trim().replace(/\s+/g, " ").toLowerCase();
      state.lpoOrders = (purchaseOrders.orders || []).filter(order =>
        String(order.status || "").toLowerCase() === "created"
        && String(order.projectName || "").trim().replace(/\s+/g, " ").toLowerCase() === projectName
      ).sort((a, b) => String(b.poDate || "").localeCompare(String(a.poDate || "")));
      state.lpoUploads = purchaseOrders.uploads || [];
    } catch (error) {
      if (request !== state.lpoRequest || state.project?.id !== project.id || state.tab !== "lpos") return;
      state.lpoError = error.message;
    }
    root.querySelector(".pm-detail-content").innerHTML = lposTab();
  }

  function openLpoModal(orderId) {
    const order = state.lpoOrders?.find(item => item.id === orderId);
    if (!order) return toast("Purchase order not found");
    const aed = value => `AED ${Number(value || 0).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const detail = (label, value) => `<div><dt>${label}</dt><dd>${esc(value || "-")}</dd></div>`;
    const itemRows = (order.items || []).map((item, index) => `<tr><td>${index + 1}</td><td><strong>${esc(item.description || "-")}</strong>${item.modelNo ? `<small>Model: ${esc(item.modelNo)}</small>` : ""}</td><td>${esc(item.qty ?? 0)}</td><td>${aed(item.unitPrice)}</td><td>${esc(item.vatPercent ?? 0)}%</td><td>${aed(item.amount)}</td></tr>`).join("");
    const upload = state.lpoUploads.find(item => item.id === order.sourceUploadId);
    const attachmentUrl = upload ? `/api/purchase-orders/uploads/${encodeURIComponent(upload.id)}` : "";
    state.modal = "lpo-view";
    state.lpoViewId = orderId;
    root.insertAdjacentHTML("beforeend", `<div class="pm-modal-backdrop pm-lpo-backdrop"><section class="pm-modal pm-lpo-modal" role="dialog" aria-modal="true" aria-labelledby="pmLpoModalTitle"><div class="pm-modal-head"><div><h2 id="pmLpoModalTitle">${esc(order.poNo || "Purchase Order")}</h2><p>${date(order.poDate)} · ${esc(order.projectName || "-")}</p></div><div class="pm-lpo-modal-head-actions">${pill(order.status)}<button type="button" class="pm-close" data-pm-action="close-lpo" aria-label="Close LPO details">×</button></div></div><div class="pm-lpo-modal-body"><dl class="pm-lpo-details">${detail("Supplier", order.supplierName)}${detail("Supplier Address", order.supplierAddress)}${detail("Supplier TRN", order.trn)}${detail("Project", order.projectName)}${detail("Purchase Representative", order.purchaseRepresentative)}${detail("Reference No.", order.quotationNo)}${order.quotationDate ? detail("Reference Date", date(order.quotationDate)) : ""}${detail("Payment Terms", order.paymentTerms)}${order.deliveryTerms ? detail("Delivery Terms", order.deliveryTerms) : ""}${order.revision ? detail("Revision", order.revision) : ""}</dl><section class="pm-lpo-section"><h3>Items</h3><div class="pm-table-wrap"><table class="pm-table pm-lpo-items"><thead><tr><th>#</th><th>Description</th><th>Qty</th><th>Unit Price</th><th>VAT</th><th>Amount</th></tr></thead><tbody>${itemRows || `<tr><td colspan="6" class="pm-table-empty">No items.</td></tr>`}</tbody></table></div></section><div class="pm-lpo-bottom"><div class="pm-lpo-extras">${order.notes ? `<section class="pm-lpo-section"><h3>Notes</h3><p>${esc(order.notes)}</p></section>` : ""}${upload ? `<section class="pm-lpo-section"><h3>Source Attachment</h3><a href="${attachmentUrl}" target="_blank" rel="noopener">${esc(upload.originalName || "View attachment")}</a></section>` : ""}</div><dl class="pm-lpo-totals">${detail("Subtotal", aed(order.subtotal))}${detail("Discount", aed(order.discount))}${detail("After Discount", aed(order.totalAfterDiscount))}${detail("VAT", aed(order.vatTotal))}<div class="pm-lpo-grand"><dt>Grand Total</dt><dd>${aed(order.grandTotal)}</dd></div></dl></div></div><div class="pm-modal-actions"><button type="button" class="pm-secondary" data-pm-action="close-lpo">Close</button></div></section></div>`);
    root.querySelector(".pm-lpo-modal [data-pm-action='close-lpo']")?.focus();
  }

  function closeLpoModal() {
    root.querySelector(".pm-lpo-backdrop")?.remove();
    const trigger = [...root.querySelectorAll('[data-pm-action="view-lpo"]')].find(button => button.dataset.pmLpoId === state.lpoViewId);
    state.modal = "";
    state.lpoViewId = "";
    trigger?.focus();
  }

  function documentsTab(project) {
    const documents = project.documents || [];
    const categories = projectDocumentCategories(project);
    const uploaders = [...new Set(documents.map(item => item.uploadedBy || "Unknown"))].sort((a, b) => a.localeCompare(b));
    const visible = documents.filter(item => {
      const type = documentType(item);
      return item.originalName.toLowerCase().includes(state.documentSearch.toLowerCase())
        && (state.documentType === "all" || type === state.documentType)
        && (state.documentCategory === "all" || (item.category || "Uncategorized") === state.documentCategory)
        && (state.documentUploader === "all" || (item.uploadedBy || "Unknown") === state.documentUploader);
    });
    const selected = visible.filter(item => state.selectedDocumentIds.has(item.id)).length;
    const rows = visible.map(item => `<tr><td class="pm-doc-check"><input type="checkbox" data-pm-doc-select="${esc(item.id)}" aria-label="Select ${esc(item.originalName)}" ${state.selectedDocumentIds.has(item.id) ? "checked" : ""}></td><td><div class="pm-doc-name"><span class="pm-doc-file-icon ${documentType(item)}">${documentType(item) === "excel" ? "XLS" : documentType(item) === "other" ? "FILE" : documentType(item).toUpperCase()}</span><button class="pm-doc-name-button" data-pm-action="open-document" data-pm-doc-id="${esc(item.id)}" title="Open ${esc(item.originalName)}">${esc(item.originalName)}</button></div></td><td><span class="pm-doc-category-badge ${documentCategoryClass(item.category)}">${esc(item.category || "Uncategorized")}</span></td><td>${esc(item.uploadedBy || "Unknown")}</td><td><span class="pm-doc-date">${dateTime(item.uploadedAt)}</span><small>${documentSize(item.size)}</small></td><td class="pm-doc-actions"><button class="pm-more" type="button" data-pm-action="document-menu" data-pm-doc-id="${esc(item.id)}" aria-label="Actions for ${esc(item.originalName)}" aria-expanded="false">...</button></td></tr>`).join("");
    const lastUpload = documents.reduce((latest, item) => !latest || item.uploadedAt > latest ? item.uploadedAt : latest, "");
    const storageUsed = documents.reduce((sum, item) => sum + Number(item.size || 0), 0);
    const categoryRows = categories.map(category => {
      const icon = `<span class="pm-doc-folder-icon ${documentCategoryClass(category)}">▰</span>`;
      const name = `<span class="pm-doc-folder-name">${esc(category)}</span>`;
      const count = `<b>${documents.filter(item => (item.category || "Uncategorized") === category).length}</b>`;
      if (state.renamingFolderName === category) return `<div class="pm-doc-folder pm-doc-folder-select active"><input type="checkbox" data-pm-folder-select="${esc(category)}" checked aria-label="Select ${esc(category)}">${icon}<input class="pm-doc-folder-rename-input" data-pm-folder-rename-input type="text" maxlength="80" value="${esc(category)}" aria-label="New name for ${esc(category)}">${count}</div>`;
      if (state.folderSelectMode) return `<label class="pm-doc-folder pm-doc-folder-select ${state.selectedFolderNames.has(category) ? "active" : ""}" ${category === "Uncategorized" ? 'title="Uncategorized is a system category"' : ""}><input type="checkbox" data-pm-folder-select="${esc(category)}" ${state.selectedFolderNames.has(category) ? "checked" : ""} ${category === "Uncategorized" ? "disabled" : ""} aria-label="Select ${esc(category)}">${icon}${name}${count}</label>`;
      return `<button class="pm-doc-folder ${state.documentCategory === category ? "active" : ""}" type="button" data-pm-action="filter-document-category" data-pm-category="${esc(category)}">${icon}${name}${count}<span class="pm-doc-folder-arrow">›</span></button>`;
    }).join("");
    const folderDelete = state.folderSelectMode && state.selectedFolderNames.size
      ? `<div class="pm-doc-folder-footer">${state.selectedFolderNames.size === 1 ? `<button class="pm-doc-folder-rename-button" type="button" data-pm-action="${state.renamingFolderName ? "save-document-folder-name" : "rename-document-folder"}">${state.renamingFolderName ? "Save" : "Rename Folder"}</button>` : ""}<button class="pm-doc-folder-delete-button" type="button" data-pm-action="delete-document-folders">Delete ${state.selectedFolderNames.size} ${state.selectedFolderNames.size === 1 ? "Folder" : "Folders"}</button></div>` : "";
    return `<div class="pm-doc-layout"><section class="pm-panel pm-doc-main"><div class="pm-panel-head pm-doc-head"><div><h2>Project Documents</h2><p>Manage drawings, submittals, approvals and project files.</p></div><div class="pm-doc-head-actions"><button class="pm-primary" type="button" data-pm-action="upload-document">＋ Upload Document</button><button class="pm-secondary" type="button" data-pm-action="new-document-folder">New Folder</button></div></div><div class="pm-doc-filters"><label class="pm-doc-search"><span aria-hidden="true">⌕</span><input data-pm-doc-search type="search" placeholder="Search documents..." aria-label="Search documents" value="${esc(state.documentSearch)}"></label><select data-pm-doc-filter="type" aria-label="Document type"><option value="all">All Documents</option>${["pdf", "excel", "zip", "other"].map(type => `<option value="${type}" ${state.documentType === type ? "selected" : ""}>${type === "excel" ? "Excel" : type.toUpperCase()}</option>`).join("")}</select><select data-pm-doc-filter="category" aria-label="Category"><option value="all">Category</option>${categories.map(category => `<option value="${esc(category)}" ${state.documentCategory === category ? "selected" : ""}>${esc(category)}</option>`).join("")}</select><select data-pm-doc-filter="uploader" aria-label="Uploaded by"><option value="all">Uploaded By</option>${uploaders.map(name => `<option value="${esc(name)}" ${state.documentUploader === name ? "selected" : ""}>${esc(name)}</option>`).join("")}</select></div><div class="pm-doc-bulk" ${state.selectedDocumentIds.size ? "" : "hidden"}><span>${state.selectedDocumentIds.size} selected</span><button type="button" data-pm-action="download-selected-documents">Download</button><button type="button" class="danger" data-pm-action="delete-selected-documents">Delete</button><button type="button" data-pm-action="clear-document-selection">Clear</button></div><input id="pmDocumentInput" class="hidden" type="file"><div class="pm-doc-table-wrap"><table class="pm-doc-table"><thead><tr><th class="pm-doc-check"><input type="checkbox" data-pm-doc-select-all aria-label="Select visible documents" ${visible.length && selected === visible.length ? "checked" : ""}></th><th>Document Name</th><th>Category</th><th>Uploaded By</th><th>Date / File Size</th><th>Actions</th></tr></thead><tbody>${rows || `<tr><td colspan="6" class="pm-doc-empty">${documents.length ? "No documents match these filters." : "No documents uploaded yet."}</td></tr>`}</tbody></table></div><div class="pm-doc-footer">${visible.length} of ${documents.length} files</div></section><aside class="pm-doc-side"><section class="pm-panel pm-doc-side-panel"><h3>Document Summary</h3><div class="pm-doc-summary"><div><span>Total Files</span><strong>${documents.length}</strong></div><div><span>Categories</span><strong>${categories.length}</strong></div><div><span>Last Upload</span><strong>${lastUpload ? dateTime(lastUpload) : "-"}</strong></div><div><span>Storage Used</span><strong>${documentSize(storageUsed)}</strong></div></div></section><section class="pm-panel pm-doc-side-panel"><div class="pm-doc-side-heading"><h3>Folders / Categories</h3><button class="pm-link" type="button" data-pm-action="toggle-folder-select">${state.folderSelectMode ? "Cancel" : "Select"}</button></div><div class="pm-doc-folders">${categoryRows}</div>${folderDelete}</section><section class="pm-panel pm-doc-side-panel"><h3>Quick Actions</h3><div class="pm-doc-quick"><button type="button" data-pm-action="upload-pdf">Upload PDF</button><button type="button" data-pm-action="upload-excel">Upload Excel</button><button type="button" data-pm-action="new-document-folder">Create Folder</button><button type="button" data-pm-action="download-all-documents" ${documents.length ? "" : "disabled"}>Download All</button></div></section></aside></div>`;
  }

  function projectDocumentCategories(project) {
    return [...new Set([
      ...documentCategories.filter(name => !(project.hiddenDocumentCategories || []).includes(name)),
      ...(project.documentFolders || []),
      ...(project.documents || []).map(item => item.category || "Uncategorized")
    ])];
  }

  function documentType(item) {
    const ext = String(item.originalName || "").split(".").pop().toLowerCase();
    if (ext === "pdf") return "pdf";
    if (["xls", "xlsx", "xlsm", "csv"].includes(ext)) return "excel";
    if (["zip", "rar", "7z"].includes(ext)) return "zip";
    return "other";
  }

  function documentCategoryClass(category) {
    const name = category || "Uncategorized";
    const defaultIndex = documentCategories.indexOf(name);
    if (defaultIndex >= 0) return `category-${defaultIndex}`;
    const customIndex = (state.project?.documentFolders || []).indexOf(name);
    return `category-${customIndex < 0 ? 6 : customIndex % 7}`;
  }

  function documentSize(bytes) {
    const size = Number(bytes || 0);
    return size >= 1048576 ? `${(size / 1048576).toFixed(1)} MB` : `${size ? Math.max(1, Math.round(size / 1024)) : 0} KB`;
  }

  function documentUrl(item, download = false) {
    return `/api/project-management/projects/${encodeURIComponent(state.project.id)}/documents/${encodeURIComponent(item.id)}${download ? "?download=1" : ""}`;
  }

  function renderDocumentsContent(focusSearch = false) {
    if (state.tab !== "documents" || !state.project) return;
    root.querySelector(".pm-detail-content").innerHTML = documentsTab(state.project);
    if (focusSearch) {
      const input = root.querySelector("[data-pm-doc-search]");
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  }

  function closeDocumentMenu() {
    root.querySelector(".pm-doc-menu")?.remove();
    root.querySelector('[data-pm-action="document-menu"][aria-expanded="true"]')?.setAttribute("aria-expanded", "false");
  }

  function openDocumentMenu(button) {
    const wasOpen = button.getAttribute("aria-expanded") === "true";
    closeDocumentMenu();
    if (wasOpen) return;
    const item = state.project.documents.find(document => document.id === button.dataset.pmDocId);
    if (!item) return;
    const rect = button.getBoundingClientRect();
    const left = Math.max(8, Math.min(rect.right - 178, window.innerWidth - 186));
    const top = rect.bottom + 4 + 192 > window.innerHeight ? rect.top - 196 : rect.bottom + 4;
    button.setAttribute("aria-expanded", "true");
    root.insertAdjacentHTML("beforeend", `<div class="pm-doc-menu" role="menu" style="left:${left}px;top:${top}px"><a role="menuitem" href="${documentUrl(item)}" target="_blank" rel="noopener">Open / Preview</a><a role="menuitem" href="${documentUrl(item, true)}">Download</a><button type="button" role="menuitem" data-pm-action="rename-document" data-pm-doc-id="${esc(item.id)}">Rename</button><button type="button" role="menuitem" data-pm-action="move-document" data-pm-doc-id="${esc(item.id)}">Move to folder/category</button><button type="button" role="menuitem" class="danger" data-pm-action="delete-document" data-pm-doc-id="${esc(item.id)}">Delete</button></div>`);
  }

  function openDocumentModal(mode, item = null) {
    const titles = { upload: "Upload Document", folder: "New Folder", rename: "Rename Document", move: "Move Document" };
    const categories = [...new Set([...projectDocumentCategories(state.project), "Uncategorized"])];
    const selectedCategory = item?.category || (state.documentCategory !== "all" ? state.documentCategory : "Uncategorized");
    const categorySelect = `<select name="category">${categories.map(category => `<option value="${esc(category)}" ${category === selectedCategory ? "selected" : ""}>${esc(category)}</option>`).join("")}</select>`;
    const fields = mode === "upload" ? `<p class="pm-doc-modal-file">${esc(state.pendingDocumentFile?.name || "")}</p><label>Folder / Category${categorySelect}</label>`
      : mode === "folder" ? `<label>Folder Name<input name="name" required maxlength="80" autofocus placeholder="Enter folder name"></label>`
      : mode === "rename" ? `<label>Document Name<input name="originalName" required maxlength="255" value="${esc(item.originalName)}"></label>`
      : `<label>Folder / Category${categorySelect}</label>`;
    state.modal = `document-${mode}`;
    root.insertAdjacentHTML("beforeend", `<div class="pm-modal-backdrop"><form class="pm-modal pm-small-modal" data-pm-form="document-${mode}" data-pm-doc-id="${esc(item?.id || "")}"><div class="pm-modal-head"><div><h2>${titles[mode]}</h2><p>${mode === "upload" ? "Save this file to the project and choose its category." : mode === "folder" ? "Organize project files with a new category." : mode === "rename" ? "Change the document's display name." : "Choose where this document belongs."}</p></div><button type="button" class="pm-close" data-pm-action="close-modal" aria-label="Close">×</button></div><div class="pm-form-grid pm-doc-modal-fields">${fields}</div><div class="pm-modal-actions"><button type="button" class="pm-secondary" data-pm-action="close-modal">Cancel</button><button class="pm-primary" type="submit">${mode === "upload" ? "Upload Document" : mode === "folder" ? "Create Folder" : "Save Changes"}</button></div></form></div>`);
    root.querySelector(".pm-doc-modal-fields input, .pm-doc-modal-fields select")?.focus();
  }

  function downloadDocumentArchive(ids = []) {
    const query = ids.length ? `?${ids.map(id => `id=${encodeURIComponent(id)}`).join("&")}` : "";
    const link = document.createElement("a");
    link.href = `/api/project-management/projects/${encodeURIComponent(state.project.id)}/documents/download-all${query}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  function activityTab(project) {
    return `<section class="pm-panel"><div class="pm-panel-head"><div><h2>Activity History</h2><p>Every project change is recorded for traceability.</p></div></div><div class="pm-timeline">${(project.activityHistory || []).map(item => `<div class="pm-timeline-item"><span></span><div><b>${esc(item.action)}</b><p>${esc(item.details)}</p><small>${esc(item.userName || "User")} · ${dateTime(item.createdAt)}</small></div></div>`).join("") || `<div class="pm-empty-inline">No activity recorded yet.</div>`}</div></section>`;
  }

  function options(values, selected) { return values.map(value => `<option value="${esc(value)}" ${value === selected ? "selected" : ""}>${esc(value)}</option>`).join(""); }

  function openProjectModal() {
    const project = state.project || {};
    state.modal = "project";
    state.engineerUsers = null;
    state.selectedEngineers = Array.isArray(project.projectEngineers) ? project.projectEngineers.map(item => ({ id: item.id, name: item.name })) : [];
    state.engineerPickerOpen = false;
    root.insertAdjacentHTML("beforeend", `<div class="pm-modal-backdrop"><form class="pm-modal" data-pm-form="project"><div class="pm-modal-head"><div><h2>${project.id ? "Edit Project" : "New Project"}</h2><p>Start with the project identity. The standard HVAC checklists will be created automatically.</p></div><button type="button" class="pm-close" data-pm-action="close-modal">×</button></div><div class="pm-form-grid"><label>Project Code<input name="code" value="${esc(project.code)}" placeholder="Optional"></label><label>Project Name<input name="name" required value="${esc(project.name === "Untitled Project" ? "" : project.name)}"></label><label>Customer<input name="customer" value="${esc(project.customer)}"></label><label>Consultant<input name="consultant" value="${esc(project.consultant)}"></label><label>Contact Person<input name="contact" value="${esc(project.contact)}"></label><label>Phone<input name="phone" value="${esc(project.phone)}"></label><label>Email<input type="email" name="email" value="${esc(project.email)}"></label><label>Status<select name="status">${options(["Active", "On Hold", "Completed"], project.status || "Active")}</select></label><label class="wide">Location<input name="location" value="${esc(project.location)}"></label><div class="wide pm-engineer-field"><label for="pmEngineerSearch">Project Engineers</label><div class="pm-engineer-picker"><div class="pm-engineer-chips" data-pm-engineer-chips></div><input id="pmEngineerSearch" data-pm-engineer-search type="text" autocomplete="off" role="combobox" aria-autocomplete="list" aria-controls="pmEngineerOptions" aria-expanded="false" placeholder="Search Login Access names"><div id="pmEngineerOptions" class="pm-engineer-options" role="listbox" hidden></div></div></div><label>Contract Value (AED)<input type="number" min="0" step="0.01" inputmode="decimal" name="contractValue" value="${esc(project.contractValue || "")}"></label><label>Target Handover<input type="date" name="targetHandover" value="${esc(project.targetHandover)}"></label><label class="wide">Payment Note<textarea name="paymentSummary" rows="2">${esc(project.paymentSummary)}</textarea></label><label class="wide">Project Notes<textarea name="notes" rows="3">${esc(project.notes)}</textarea></label></div><div class="pm-modal-actions"><button type="button" class="pm-secondary" data-pm-action="close-modal">Cancel</button><button class="pm-primary" type="submit">${project.id ? "Save Changes" : "Create Project"}</button></div></form></div>`);
    const modal = root.querySelector(".pm-modal-backdrop");
    renderEngineerPicker();
    api("/api/settings").then(response => {
      if (!modal.isConnected) return;
      state.engineerUsers = (response.settings?.users || []).filter(user => user.active !== false && user.id && user.name);
      state.selectedEngineers = state.selectedEngineers.map(selected => {
        const current = state.engineerUsers.find(user => user.id === selected.id);
        return current ? { id: current.id, name: current.name } : selected;
      });
      if (state.modal === "project") renderEngineerPicker();
    }).catch(error => {
      if (modal.isConnected && state.modal === "project") {
        root.querySelector("#pmEngineerOptions").textContent = `Could not load Login Access users: ${error.message}`;
        state.engineerPickerOpen = true;
        root.querySelector("#pmEngineerOptions").hidden = false;
      }
    });
  }

  function renderEngineerPicker() {
    const search = root.querySelector("[data-pm-engineer-search]");
    if (!search) return;
    root.querySelector("[data-pm-engineer-chips]").innerHTML = state.selectedEngineers.map(user => `<span class="pm-engineer-chip">${esc(user.name)}<button type="button" data-pm-action="remove-engineer" data-pm-engineer-id="${esc(user.id)}" aria-label="Remove ${esc(user.name)}">×</button></span>`).join("");
    const list = root.querySelector("#pmEngineerOptions");
    const query = search.value.trim().toLowerCase();
    const available = (state.engineerUsers || []).filter(user => !state.selectedEngineers.some(selected => selected.id === user.id) && `${user.name} ${user.email || ""}`.toLowerCase().includes(query));
    list.innerHTML = !state.engineerUsers ? `<div class="pm-engineer-hint">Loading Login Access users...</div>` : available.length ? available.map(user => `<button type="button" role="option" data-pm-action="select-engineer" data-pm-engineer-id="${esc(user.id)}"><strong>${esc(user.name)}</strong><small>${esc(user.email || "")}</small></button>`).join("") : `<div class="pm-engineer-hint">${query ? "No matching users" : "All users selected"}</div>`;
    list.hidden = !state.engineerPickerOpen;
    search.setAttribute("aria-expanded", String(state.engineerPickerOpen));
  }

  function openFollowUpModal(index = null) {
    const item = index === null ? null : state.project?.followUps[index];
    if (index !== null && !item) return;
    state.modal = "followup";
    state.followUpUsers = null;
    root.insertAdjacentHTML("beforeend", `<div class="pm-modal-backdrop"><form class="pm-modal pm-small-modal" data-pm-form="followup" data-pm-index="${index ?? ""}"><div class="pm-modal-head"><div><h2>${item ? "Edit Follow-up" : "Add Follow-up"}</h2><p>Make the next action explicit.</p></div><button type="button" class="pm-close" data-pm-action="close-modal">×</button></div><div class="pm-form-grid"><label>Date<input type="date" name="date" required value="${esc(item?.date || "")}"></label><label>Assigned To<select name="assignedUserId" data-pm-followup-assignee disabled><option>Loading Login Access names...</option></select></label><label class="wide">Subject<input name="subject" required placeholder="What needs to happen?" value="${esc(item?.subject || "")}"></label><label>Priority<select name="priority">${options(["High", "Medium", "Low"], item?.priority || "Medium")}</select></label><label>Status<select name="status">${options(["Pending", "In Progress", "Finished"], item?.status || "Pending")}</select></label><label class="wide">Notes<textarea name="notes" rows="3">${esc(item?.notes || "")}</textarea></label></div><div class="pm-modal-actions"><button type="button" class="pm-secondary" data-pm-action="close-modal">Cancel</button><button class="pm-primary" type="submit">${item ? "Save Changes" : "Add Follow-up"}</button></div></form></div>`);
    const modal = root.querySelector(".pm-modal-backdrop");
    api("/api/settings").then(response => {
      if (!modal.isConnected || state.modal !== "followup") return;
      const users = (response.settings?.users || []).filter(user => user.active !== false && user.id && user.name)
        .sort((a, b) => a.name.localeCompare(b.name));
      state.followUpUsers = users;
      const nameMatches = users.filter(user => user.name.trim().toLowerCase() === String(item?.assigned || "").trim().toLowerCase());
      const selectedId = item?.assignedUserId || (nameMatches.length === 1 ? nameMatches[0].id : "");
      const hasSelection = users.some(user => user.id === selectedId);
      const legacySelection = Boolean(item?.assigned) && !hasSelection;
      const select = modal.querySelector("[data-pm-followup-assignee]");
      select.innerHTML = `<option value="" ${!selectedId && !legacySelection ? "selected" : ""}>Unassigned</option>${users.map(user => {
        const duplicateName = users.some(other => other.id !== user.id && other.name.toLowerCase() === user.name.toLowerCase());
        return `<option value="${esc(user.id)}" ${selectedId === user.id ? "selected" : ""}>${esc(user.name)}${duplicateName ? ` (${esc(user.email || user.id)})` : ""}</option>`;
      }).join("")}${legacySelection ? `<option value="__legacy__" selected>${esc(item.assigned)} (existing)</option>` : ""}`;
      select.disabled = false;
    }).catch(error => {
      if (!modal.isConnected) return;
      modal.querySelector("[data-pm-followup-assignee]").innerHTML = `<option>Could not load Login Access names</option>`;
      toast(error.message);
    });
  }

  function closeFollowUpMenu() {
    root.querySelector(".pm-followup-menu")?.remove();
    root.querySelector('[data-pm-action="followup-menu"][aria-expanded="true"]')?.setAttribute("aria-expanded", "false");
  }

  function openFollowUpMenu(button) {
    const wasOpen = button.getAttribute("aria-expanded") === "true";
    closeFollowUpMenu();
    if (wasOpen) return;
    const index = button.dataset.pmIndex;
    const rect = button.getBoundingClientRect();
    const left = Math.max(8, Math.min(rect.right - 138, window.innerWidth - 146));
    const top = rect.bottom + 4 + 82 > window.innerHeight ? rect.top - 86 : rect.bottom + 4;
    button.setAttribute("aria-expanded", "true");
    root.insertAdjacentHTML("beforeend", `<div class="pm-followup-menu" role="menu" style="left:${left}px;top:${top}px"><button type="button" role="menuitem" data-pm-action="edit-followup" data-pm-index="${index}">Edit</button><button type="button" role="menuitem" class="danger" data-pm-action="delete-followup" data-pm-index="${index}">Delete</button></div>`);
    root.querySelector(".pm-followup-menu button")?.focus();
  }

  async function saveProjectPayload(payload, message = "Project updated") {
    const response = state.project?.id
      ? await api(`/api/project-management/projects/${encodeURIComponent(state.project.id)}`, { method: "PUT", body: JSON.stringify(payload) })
      : await api("/api/project-management/projects", { method: "POST", body: JSON.stringify(payload) });
    state.project = response;
    toast(message);
    renderDetail();
  }

  function projectPayload(project) {
    const { derived: _derived, ...payload } = project;
    return payload;
  }

  async function updateItem(input) {
    if (!state.project) return;
    const collection = input.dataset.pmItem;
    const index = Number(input.dataset.pmIndex);
    const field = input.dataset.pmField;
    const next = structuredClone(state.project);
    if (!next[collection]?.[index]) return;
    next[collection][index][field] = input.value;
    if (collection === "payments" && field === "amount") next.payments[index].percentage = paymentPercentage(input.value, Number(next.contractValue || 0));
    await saveProjectPayload(projectPayload(next), "Project progress saved");
  }

  async function updatePendingWork(input) {
    const source = state.project?.derived?.pendingWorkRows?.find(item => item.id === input.dataset.pmPendingId);
    if (!source) return;
    const field = input.dataset.pmPendingField;
    const value = input.value.trim();
    if (value === source[field]) return;
    const projectId = state.project.id;
    try {
      state.project = await api(`/api/project-management/projects/${encodeURIComponent(projectId)}/pending-works/${encodeURIComponent(source.id)}`, { method: "PATCH", body: JSON.stringify({ field, value }) });
      renderDetail();
      toast("Pending work saved");
    } catch (error) {
      input.value = source[field];
      throw error;
    }
  }

  const checkpointCycle = { not_started: "completed", completed: "in_progress", in_progress: "issue", issue: "not_started" };

  async function cycleCheckpoint(button) {
    if (!state.project) return;
    const index = Number(button.dataset.pmIndex);
    const field = button.dataset.pmCheckpoint;
    const previous = structuredClone(state.project);
    const next = structuredClone(state.project);
    const checklist = field === "checklist_status";
    const item = checklist ? next.installationChecklist?.[index] : next.installationItems?.[index];
    const itemField = checklist ? "status" : field;
    if (!item || (checklist ? itemField !== "status" : !["lpo_status", "delivered_status", "installation_status"].includes(field))) return;
    item[itemField] = checkpointCycle[item[itemField]] || "completed";
    state.project = next;
    renderDetail();
    try {
      state.project = await api(`/api/project-management/projects/${encodeURIComponent(state.project.id)}`, { method: "PUT", body: JSON.stringify(projectPayload(next)) });
      renderDetail();
    } catch (error) {
      state.project = previous;
      renderDetail();
      toast(`Could not save status: ${error.message}`);
    }
  }

  async function updateChecklistItem(input) {
    const next = structuredClone(state.project);
    const item = next.installationChecklist?.[Number(input.dataset.pmIndex)];
    if (!item) return;
    item.item = input.value;
    await saveProjectPayload(projectPayload(next), "Checklist item saved");
  }

  async function updateInstallationNote(input) {
    const next = structuredClone(state.project);
    if (input.dataset.pmNoteEdit === "manual") {
      const note = next.installationNotes?.find(item => item.id === input.dataset.pmNoteId);
      if (note) note.note = input.value;
    } else {
      const item = next.installationItems?.find(row => row.id === input.dataset.pmNoteId);
      if (item) item.comments = input.value;
    }
    await saveProjectPayload(projectPayload(next), "Installation note saved");
  }

  async function onClick(event) {
    if (event.target.matches(".pm-lpo-backdrop")) return closeLpoModal();
    const target = event.target.closest("[data-pm-checkpoint], [data-pm-action], [data-pm-tab], [data-pm-open-project], [data-pm-filter-action]");
    if (!target) return;
    if (target.dataset.pmCheckpoint) return cycleCheckpoint(target);
    if (target.dataset.pmOpenProject) return window.showProjects(target.dataset.pmOpenProject, target.dataset.pmOpenTab || "overview");
    if (target.dataset.pmFilterAction) { state.filter = "attention"; renderDashboard(); return; }
    if (target.dataset.pmTab) {
      if (!state.project) {
        state.filter = target.dataset.pmTab === "followups" ? "attention" : "all";
        return renderDashboard();
      }
      state.tab = target.dataset.pmTab;
      renderDetail();
      if (state.tab === "lpos") await loadProjectLpos();
      return;
    }
    const action = target.dataset.pmAction;
    if (action === "retry-lpos") return loadProjectLpos();
    if (action === "view-lpo") return openLpoModal(target.dataset.pmLpoId);
    if (action === "close-lpo") return closeLpoModal();
    if (action === "open-lpo") return window.openPurchaseOrder(target.dataset.pmLpoId);
    if (action === "open-dashboard-list") return openDashboardList(target.dataset.pmList);
    if (action === "select-engineer") {
      const user = state.engineerUsers?.find(item => item.id === target.dataset.pmEngineerId);
      if (user && !state.selectedEngineers.some(item => item.id === user.id)) state.selectedEngineers.push({ id: user.id, name: user.name });
      const search = root.querySelector("[data-pm-engineer-search]");
      search.value = "";
      state.engineerPickerOpen = true;
      renderEngineerPicker();
      search.focus();
      return;
    }
    if (action === "remove-engineer") {
      state.selectedEngineers = state.selectedEngineers.filter(item => item.id !== target.dataset.pmEngineerId);
      renderEngineerPicker();
      root.querySelector("[data-pm-engineer-search]")?.focus();
      return;
    }
    if (action === "back") return window.showProjects();
    if (action === "new-project") { state.project = null; openProjectModal(); return; }
    if (action === "edit-project") return openProjectModal();
    if (action === "close-modal") { root.querySelector(".pm-modal-backdrop")?.remove(); state.modal = ""; state.pendingDocumentFile = null; state.dashboardViewAll = ""; state.dashboardModalSearch = ""; state.dashboardListItems = null; state.dashboardListError = ""; if (state.dashboardNeedsRefresh) loadDashboard(); return; }
    if (action === "add-followup") return openFollowUpModal();
    if (action === "followup-menu") return openFollowUpMenu(target);
    if (action === "edit-followup") { const index = Number(target.dataset.pmIndex); closeFollowUpMenu(); return openFollowUpModal(index); }
    if (["upload-document", "upload-pdf", "upload-excel"].includes(action)) {
      const input = root.querySelector("#pmDocumentInput");
      input.accept = action === "upload-pdf" ? ".pdf,application/pdf" : action === "upload-excel" ? ".xls,.xlsx,.xlsm,.csv" : "";
      input.click();
      return;
    }
    if (action === "new-document-folder") return openDocumentModal("folder");
    if (action === "document-menu") return openDocumentMenu(target);
    if (action === "open-document") {
      const item = state.project.documents.find(document => document.id === target.dataset.pmDocId);
      if (item) window.open(documentUrl(item), "_blank", "noopener");
      return;
    }
    if (["rename-document", "move-document"].includes(action)) {
      const item = state.project.documents.find(document => document.id === target.dataset.pmDocId);
      closeDocumentMenu();
      if (item) openDocumentModal(action === "rename-document" ? "rename" : "move", item);
      return;
    }
    if (action === "download-all-documents") return downloadDocumentArchive();
    if (action === "download-selected-documents") return downloadDocumentArchive([...state.selectedDocumentIds]);
    if (action === "clear-document-selection") { state.selectedDocumentIds.clear(); renderDocumentsContent(); return; }
    if (action === "delete-selected-documents") {
      const ids = [...state.selectedDocumentIds];
      if (!ids.length || !confirm(`Delete ${ids.length} selected document${ids.length === 1 ? "" : "s"}?`)) return;
      try {
        for (const id of ids) await api(`/api/project-management/projects/${encodeURIComponent(state.project.id)}/documents/${encodeURIComponent(id)}`, { method: "DELETE" });
        state.selectedDocumentIds.clear();
        state.project = await api(`/api/project-management/projects/${encodeURIComponent(state.project.id)}`);
        renderDetail(); toast("Documents deleted");
      } catch (error) {
        state.project = await api(`/api/project-management/projects/${encodeURIComponent(state.project.id)}`);
        state.selectedDocumentIds = new Set(ids.filter(id => state.project.documents.some(item => item.id === id)));
        renderDetail(); toast(error.message);
      }
      return;
    }
    if (action === "filter-document-category") { state.documentCategory = target.dataset.pmCategory; renderDocumentsContent(); return; }
    if (action === "toggle-folder-select") {
      state.folderSelectMode = !state.folderSelectMode;
      state.selectedFolderNames.clear();
      state.renamingFolderName = "";
      renderDocumentsContent();
      return;
    }
    if (action === "rename-document-folder") {
      if (state.selectedFolderNames.size !== 1) return;
      state.renamingFolderName = [...state.selectedFolderNames][0];
      renderDocumentsContent();
      const input = root.querySelector("[data-pm-folder-rename-input]");
      input?.focus();
      input?.select();
      return;
    }
    if (action === "save-document-folder-name") {
      const oldName = state.renamingFolderName;
      const newName = root.querySelector("[data-pm-folder-rename-input]")?.value.trim();
      if (!oldName || !newName) { toast("Enter a folder name"); return; }
      try {
        state.project = await api(`/api/project-management/projects/${encodeURIComponent(state.project.id)}/document-folders`, { method: "PATCH", body: JSON.stringify({ oldName, newName }) });
        if (state.documentCategory === oldName) state.documentCategory = projectDocumentCategories(state.project).find(name => name.toLowerCase() === newName.toLowerCase()) || "all";
        state.renamingFolderName = "";
        state.selectedFolderNames.clear();
        state.folderSelectMode = false;
        renderDetail();
        toast("Folder renamed");
      } catch (error) { toast(error.message); }
      return;
    }
    if (action === "delete-document-folders") {
      const names = [...state.selectedFolderNames];
      if (!names.length) return;
      const filesToMove = state.project.documents.filter(item => names.includes(item.category)).length;
      const message = `Delete ${names.length} selected folder${names.length === 1 ? "" : "s"}?${filesToMove ? ` ${filesToMove} file${filesToMove === 1 ? "" : "s"} will move to Uncategorized. Files will not be deleted.` : ""}`;
      if (!confirm(message)) return;
      try {
        state.project = await api(`/api/project-management/projects/${encodeURIComponent(state.project.id)}/document-folders`, { method: "DELETE", body: JSON.stringify({ names }) });
        if (names.includes(state.documentCategory)) state.documentCategory = "all";
        state.folderSelectMode = false;
        state.selectedFolderNames.clear();
        state.renamingFolderName = "";
        renderDetail();
        toast("Folders deleted");
      } catch (error) { toast(error.message); }
      return;
    }
    if (action === "delete-document") {
      const item = state.project.documents.find(document => document.id === target.dataset.pmDocId);
      if (!item || !confirm(`Delete ${item.originalName}?`)) return;
      try {
        await api(`/api/project-management/projects/${encodeURIComponent(state.project.id)}/documents/${encodeURIComponent(item.id)}`, { method: "DELETE" });
        state.project = await api(`/api/project-management/projects/${encodeURIComponent(state.project.id)}`);
        state.selectedDocumentIds.delete(item.id);
        toast("Document deleted"); renderDetail();
      } catch (error) { toast(error.message); }
      return;
    }
    if (action === "delete-followup") {
      closeFollowUpMenu();
      if (!confirm("Delete this follow-up?")) return;
      const next = structuredClone(state.project); next.followUps.splice(Number(target.dataset.pmIndex), 1);
      await saveProjectPayload(projectPayload(next), "Follow-up deleted"); return;
    }
    if (action === "delete-pending-work") {
      const source = state.project?.derived?.pendingWorkRows?.find(item => item.id === target.dataset.pmPendingId);
      if (!source || !confirm("Delete this pending work?")) return;
      state.project = await api(`/api/project-management/projects/${encodeURIComponent(state.project.id)}/pending-works/${encodeURIComponent(source.id)}`, { method: "DELETE" });
      renderDetail(); toast("Pending work deleted"); return;
    }
    if (action === "add-pending-work") {
      state.project = await api(`/api/project-management/projects/${encodeURIComponent(state.project.id)}/pending-works`, { method: "POST" });
      renderDetail();
      root.querySelector(".pm-pending-detail-table tbody tr:last-child .pm-inline-edit")?.select();
      toast("Pending work added"); return;
    }
    if (action === "add-checklist-item") {
      const next = structuredClone(state.project);
      next.installationChecklist = next.installationChecklist || [];
      next.installationChecklist.push({ id: crypto.randomUUID(), item: "New checklist item", status: "not_started", updatedAt: new Date().toISOString() });
      await saveProjectPayload(projectPayload(next), "Checklist item added");
      root.querySelector(".pm-checklist-input:last-of-type")?.select(); return;
    }
    if (action === "add-installation-note") {
      const now = new Date().toISOString();
      const next = structuredClone(state.project);
      next.installationNotes = next.installationNotes || [];
      next.installationNotes.push({ id: crypto.randomUUID(), note: "New installation note", date: now.slice(0, 10), createdAt: now, updatedAt: now });
      await saveProjectPayload(projectPayload(next), "Installation note added");
      root.querySelector(".pm-note-input:last-of-type")?.select(); return;
    }
    if (action === "delete-checklist-item") {
      const index = Number(target.dataset.pmIndex);
      if (!confirm("Delete this checklist item?")) return;
      const next = structuredClone(state.project); next.installationChecklist.splice(index, 1);
      await saveProjectPayload(projectPayload(next), "Checklist item deleted"); return;
    }
    if (action === "delete-installation-note") {
      if (!confirm("Delete this installation note?")) return;
      const next = structuredClone(state.project);
      if (target.dataset.pmNoteSource === "manual") next.installationNotes = (next.installationNotes || []).filter(item => item.id !== target.dataset.pmNoteId);
      else {
        const item = next.installationItems?.find(row => row.id === target.dataset.pmNoteId);
        if (item) item.comments = "";
      }
      await saveProjectPayload(projectPayload(next), "Installation note deleted"); return;
    }
    if (action === "add-row") {
      const section = target.dataset.pmSection;
      const next = structuredClone(state.project);
      const row = section === "submittals" ? { id: crypto.randomUUID(), item: "New Submittal", status: "Pending", comments: "" } : section === "installationItems" ? { id: crypto.randomUUID(), item: "New Work Item", lpo_status: "not_started", delivered_status: "not_started", installation_status: "not_started", progress: 0, comments: "" } : section === "testingItems" ? { id: crypto.randomUUID(), activity: "New Activity", status: "Not Started", comments: "" } : { id: crypto.randomUUID(), milestone: "New Milestone", percentage: 0, amount: "", dueDate: "", status: "Pending", comments: "" };
      next[section].push(row); await saveProjectPayload(projectPayload(next), "Checklist row added"); return;
    }
    if (action === "delete-row") {
      const section = target.dataset.pmSection;
      const index = Number(target.dataset.pmIndex);
      const row = state.project?.[section]?.[index];
      if (!row || !confirm(`Delete ${row.item || row.activity || "this row"}?`)) return;
      const next = structuredClone(state.project);
      next[section].splice(index, 1);
      await saveProjectPayload(projectPayload(next), "Work item deleted"); return;
    }
    if (action === "delete-project") {
      if (!confirm("Delete this project and its documents? This cannot be undone.")) return;
      await api(`/api/project-management/projects/${encodeURIComponent(state.project.id)}`, { method: "DELETE" });
      toast("Project deleted"); return window.showProjects();
    }
  }

  async function onChange(event) {
    const target = event.target;
    if (target.matches("[data-pm-folder-select]")) {
      if (target.checked) state.selectedFolderNames.add(target.dataset.pmFolderSelect);
      else state.selectedFolderNames.delete(target.dataset.pmFolderSelect);
      state.renamingFolderName = "";
      renderDocumentsContent();
      return;
    }
    if (target.matches("[data-pm-doc-filter]")) {
      state[{ type: "documentType", category: "documentCategory", uploader: "documentUploader" }[target.dataset.pmDocFilter]] = target.value;
      renderDocumentsContent();
      return;
    }
    if (target.matches("[data-pm-doc-select]")) {
      if (target.checked) state.selectedDocumentIds.add(target.dataset.pmDocSelect);
      else state.selectedDocumentIds.delete(target.dataset.pmDocSelect);
      renderDocumentsContent();
      return;
    }
    if (target.matches("[data-pm-doc-select-all]")) {
      root.querySelectorAll("[data-pm-doc-select]").forEach(box => {
        if (target.checked) state.selectedDocumentIds.add(box.dataset.pmDocSelect);
        else state.selectedDocumentIds.delete(box.dataset.pmDocSelect);
      });
      renderDocumentsContent();
      return;
    }
    if (target.matches("[data-pm-pending-field]")) return updatePendingWork(target).catch(error => toast(error.message));
    if (target.matches("[data-pm-checklist-item]")) return updateChecklistItem(target).catch(error => toast(error.message));
    if (target.matches("[data-pm-note-edit]")) return updateInstallationNote(target).catch(error => toast(error.message));
    if (target.matches("[data-pm-item]")) return updateItem(target).catch(error => toast(error.message));
    if (target.matches("[data-pm-filter]")) { state.filter = target.value; return renderDashboard(); }
    if (target.id === "pmDocumentInput" && target.files?.[0]) {
      const file = target.files[0];
      const type = documentType({ originalName: file.name });
      if ((target.accept.includes(".pdf") && type !== "pdf") || (target.accept.includes(".xlsx") && type !== "excel")) { toast("Choose the requested file type"); target.value = ""; return; }
      state.pendingDocumentFile = file;
      target.value = "";
      openDocumentModal("upload");
    }
  }

  function onInput(event) {
    if (event.target.matches("[data-pm-dashboard-list-search]")) {
      state.dashboardModalSearch = event.target.value;
      renderDashboardListResults();
      return;
    }
    if (event.target.matches("[data-pm-doc-search]")) {
      state.documentSearch = event.target.value;
      renderDocumentsContent(true);
      return;
    }
    if (event.target.matches("[data-pm-engineer-search]")) {
      state.engineerPickerOpen = true;
      renderEngineerPicker();
      return;
    }
    if (!event.target.matches("[data-pm-search]")) return;
    state.search = event.target.value;
    clearTimeout(onInput.timer);
    onInput.timer = setTimeout(() => loadDashboard(), 220);
  }

  async function onSubmit(event) {
    const form = event.target.closest("form[data-pm-form]");
    if (!form) return;
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    try {
      if (form.dataset.pmForm === "project") {
        const payload = { ...(state.project ? projectPayload(state.project) : {}), ...data, projectEngineers: state.selectedEngineers, contractValue: Number(data.contractValue || 0) };
        await saveProjectPayload(payload, state.project?.id ? "Project details saved" : "Project created");
      } else if (form.dataset.pmForm.startsWith("document-")) {
        const mode = form.dataset.pmForm.slice("document-".length);
        const projectPath = `/api/project-management/projects/${encodeURIComponent(state.project.id)}`;
        form.querySelector('button[type="submit"]').disabled = true;
        if (mode === "upload") {
          if (!state.pendingDocumentFile) throw new Error("Choose a file to upload");
          const upload = new FormData();
          upload.append("file", state.pendingDocumentFile);
          upload.append("category", data.category);
          await api(`${projectPath}/documents`, { method: "POST", body: upload });
          state.project = await api(projectPath);
          toast("Document uploaded");
        } else if (mode === "folder") {
          state.project = await api(`${projectPath}/document-folders`, { method: "POST", body: JSON.stringify({ name: data.name }) });
          toast("Folder created");
        } else {
          const payload = mode === "rename" ? { originalName: data.originalName } : { category: data.category };
          state.project = await api(`${projectPath}/documents/${encodeURIComponent(form.dataset.pmDocId)}`, { method: "PATCH", body: JSON.stringify(payload) });
          toast(mode === "rename" ? "Document renamed" : "Document moved");
        }
        state.pendingDocumentFile = null;
        renderDetail();
      } else {
        const next = structuredClone(state.project);
        const index = form.dataset.pmIndex === "" ? null : Number(form.dataset.pmIndex);
        if (!state.followUpUsers || form.querySelector("[data-pm-followup-assignee]")?.disabled) throw new Error("Wait for Login Access names to load");
        if (data.assignedUserId === "__legacy__") {
          if (index === null || !next.followUps[index]) throw new Error("Select a Login Access user");
          data.assigned = next.followUps[index].assigned;
          data.assignedUserId = next.followUps[index].assignedUserId || "";
        } else {
          const assignee = state.followUpUsers.find(user => user.id === data.assignedUserId);
          if (data.assignedUserId && !assignee) throw new Error("Select a Login Access user");
          data.assigned = assignee?.name || "";
        }
        if (index === null) next.followUps.unshift({ id: crypto.randomUUID(), ...data, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
        else if (next.followUps[index]) next.followUps[index] = { ...next.followUps[index], ...data, updatedAt: new Date().toISOString() };
        await saveProjectPayload(projectPayload(next), index === null ? "Follow-up added" : "Follow-up updated");
      }
      root.querySelector(".pm-modal-backdrop")?.remove(); state.modal = "";
    } catch (error) { form.querySelector('button[type="submit"]')?.removeAttribute("disabled"); toast(error.message); }
  }

  root.addEventListener("click", onClick);
  root.addEventListener("focusin", event => {
    if (!event.target.matches("[data-pm-engineer-search]")) return;
    state.engineerPickerOpen = true;
    renderEngineerPicker();
  });
  root.addEventListener("keydown", event => {
    if (event.target.matches("[data-pm-folder-rename-input]")) {
      if (event.key === "Enter") { event.preventDefault(); root.querySelector('[data-pm-action="save-document-folder-name"]')?.click(); }
      if (event.key === "Escape") { state.renamingFolderName = ""; renderDocumentsContent(); }
      return;
    }
    if (!event.target.matches("[data-pm-engineer-search]")) return;
    if (event.key === "Escape") { state.engineerPickerOpen = false; renderEngineerPicker(); event.target.blur(); return; }
    if (event.key === "Enter") {
      event.preventDefault();
      const first = root.querySelector("#pmEngineerOptions [data-pm-action='select-engineer']");
      if (state.engineerPickerOpen && first) first.click();
    }
    if (event.key === "ArrowDown") { event.preventDefault(); root.querySelector("#pmEngineerOptions [data-pm-action='select-engineer']")?.focus(); }
  });
  document.addEventListener("click", event => {
    if (!event.target.closest(".pm-followup-menu, [data-pm-action='followup-menu']")) closeFollowUpMenu();
    if (!event.target.closest(".pm-doc-menu, [data-pm-action='document-menu']")) closeDocumentMenu();
    if (!event.target.closest(".pm-engineer-picker")) {
      state.engineerPickerOpen = false;
      renderEngineerPicker();
    }
  });
  document.addEventListener("keydown", event => {
    if (event.key !== "Escape") return;
    if (state.modal === "lpo-view") { closeLpoModal(); return; }
    if (root.querySelector(".pm-followup-menu")) {
      const button = root.querySelector('[data-pm-action="followup-menu"][aria-expanded="true"]');
      closeFollowUpMenu();
      button?.focus();
    }
    if (root.querySelector(".pm-doc-menu")) {
      const button = root.querySelector('[data-pm-action="document-menu"][aria-expanded="true"]');
      closeDocumentMenu();
      button?.focus();
    }
  });
  root.addEventListener("change", onChange);
  root.addEventListener("input", onInput);
  root.addEventListener("submit", onSubmit);
  window.projectManagement = { open };
})();
