(function () {
  const root = document.getElementById("projectsRoot");
  if (!root) return;

  const state = { dashboard: null, dashboardQuery: "", dashboardRequest: 0, project: null, tab: "overview", search: "", filter: "all", modal: "", loginUser: null, loginUsers: [], engineerUsers: null, selectedEngineers: [], requiredEngineerId: "", engineerPickerOpen: false, followUpUsers: null,
    lpoOrders: null, lpoUploads: [], lpoError: "", lpoRequest: 0, lpoViewId: "", lpoSearch: "",
    documentSearch: "", documentType: "all", documentCategory: "all", documentUploader: "all", selectedDocumentIds: new Set(), pendingDocumentFile: null,
    folderSelectMode: false, selectedFolderNames: new Set(), renamingFolderName: "", dashboardViewAll: "", dashboardModalSearch: "", dashboardListItems: null, dashboardListError: "",
    boqSearch: "", installationSearch: "", collapsedBoqCategories: new Set(), boqImportBusy: false,
    submittalKind: "material", submittalSearch: "", expandedSubmittals: new Set(), submittalImportBusy: false,
    dashboardExpiryTimer: null, dashboardNeedsRefresh: false };
  let projectSaveQueue = Promise.resolve();
  let projectSaveVersion = 0;
  let paymentSaveTimer = null;
  let dashboardPrefetch = null;
  let cacheGeneration = 0;
  let projectRequest = 0;
  const projectCache = new Map();
  let gridDragItemId = "";
  let gridDragCategoryId = "";
  const documentCategories = ["Shop Drawings", "Submittals", "Correspondence", "Payment", "Testing & Commissioning", "Handover"];
  const esc = value => String(value ?? "").replace(/[&<>\"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const money = value => `AED ${Number(value || 0).toLocaleString("en-AE", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  const moneyWithCents = value => `AED ${Number(value || 0).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const vatInclusiveAmount = value => Number((Number(value || 0) * 1.05).toFixed(2));
  const paymentPercentage = (amount, contractValue) => vatInclusiveAmount(contractValue) > 0 ? Number((Number(amount || 0) / vatInclusiveAmount(contractValue) * 100).toFixed(2)) : 0;
  const variationPaymentReceived = project => Number((project.variationPayments || []).reduce((sum, item) =>
    /^(received|paid)$/i.test(String(item.status || "").trim()) ? sum + Number(item.amount || 0) : sum, 0).toFixed(2));
  const variationPaymentOutstanding = project => Math.max(0, Number((vatInclusiveAmount(project.variationContractValue) - variationPaymentReceived(project)).toFixed(2)));
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
  const statusSelect = (collection, index, field, values, selected, disabled = false) => `<select class="pm-status-select pm-status-${statusClass(selected)}" data-pm-item="${collection}" data-pm-index="${index}" data-pm-field="${field}" ${disabled ? "disabled" : ""}>${options(values, selected)}</select>`;
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
      const error = new Error(message || "Request failed");
      error.status = response.status;
      throw error;
    }
    const type = response.headers.get("content-type") || "";
    return type.includes("application/json") ? response.json() : response.blob();
  }

  function navigate(path) {
    history.replaceState(null, "", path);
  }

  function prefetch() {
    if (state.dashboard) return Promise.resolve(state.dashboard);
    if (!dashboardPrefetch) {
      const generation = cacheGeneration;
      const pending = api("/api/project-management/dashboard").then(dashboard => {
        if (generation === cacheGeneration && !state.dashboard) {
          state.dashboard = dashboard;
          state.dashboardQuery = "";
        }
        return dashboard;
      }).finally(() => { if (dashboardPrefetch === pending) dashboardPrefetch = null; });
      dashboardPrefetch = pending;
    }
    return dashboardPrefetch;
  }

  async function open(projectId = "", tab = "overview", access = {}) {
    const sameProject = state.project?.id === projectId;
    flushPaymentSave().catch(error => toast(error.message));
    const request = ++projectRequest;
    state.loginUser = access.user || null;
    state.loginUsers = (access.users || []).filter(user => user.active !== false && user.id && user.name);
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
        state.lpoSearch = "";
        state.documentSearch = "";
        state.documentType = "all";
        state.documentCategory = "all";
        state.documentUploader = "all";
        state.selectedDocumentIds.clear();
        state.folderSelectMode = false;
        state.selectedFolderNames.clear();
        state.renamingFolderName = "";
        state.submittalKind = "material";
        state.submittalSearch = "";
        state.expandedSubmittals.clear();
      }
      const cached = state.project?.id === projectId ? state.project : projectCache.get(projectId);
      navigate(`/projects/${encodeURIComponent(projectId)}`);
      if (cached) {
        state.project = cached;
        renderDetail();
      } else {
        state.project = null;
        root.innerHTML = `<div class="pm-loading"><span class="pm-spinner"></span> Loading Project...</div>`;
      }
      const saveVersion = projectSaveVersion;
      try {
        if (sameProject) await projectSaveQueue;
        const project = await api(`/api/project-management/projects/${encodeURIComponent(projectId)}`);
        if (request !== projectRequest || saveVersion !== projectSaveVersion) return;
        state.project = project;
        projectCache.set(projectId, project);
        renderDetail();
        if (tab === "lpos") await loadProjectLpos();
      } catch (error) {
        if (request !== projectRequest) return;
        if ([401, 403, 404].includes(error.status)) {
          projectCache.delete(projectId);
          state.project = null;
          root.innerHTML = `<div class="pm-empty"><h2>Project unavailable</h2><p>${esc(error.message)}</p></div>`;
        } else if (cached) toast(`Could not refresh Project: ${error.message}`);
        else root.innerHTML = `<div class="pm-empty"><h2>Project could not be loaded</h2><p>${esc(error.message)}</p></div>`;
      }
      return;
    }
    if (state.project?.id) projectCache.set(state.project.id, state.project);
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
    else if (!state.dashboard) root.innerHTML = `<div class="pm-loading"><span class="pm-spinner"></span> Loading Projects...</div>`;
    try {
      const dashboard = query || !dashboardPrefetch ? await api(`/api/project-management/dashboard?q=${encodeURIComponent(query)}`) : await dashboardPrefetch;
      if (request !== state.dashboardRequest || state.project) return;
      state.dashboard = dashboard;
      state.dashboardQuery = query;
      state.dashboardNeedsRefresh = false;
      renderDashboard();
    } catch (error) {
      if (request !== state.dashboardRequest || state.project) return;
      if ([401, 403].includes(error.status)) {
        state.dashboard = null;
        state.dashboardQuery = "";
        root.innerHTML = `<div class="pm-empty"><h2>Projects unavailable</h2><p>${esc(error.message)}</p></div>`;
      } else if (state.dashboard) toast(`Could not refresh Projects: ${error.message}`);
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
    state.dashboardListItems = state.search ? null : (state.dashboard?.[type === "followups" ? "followUps" : "pendingWorks"] || []);
    state.dashboardListError = "";
    const title = type === "followups" ? "Follow-ups" : "Pending Works";
    root.insertAdjacentHTML("beforeend", `<div class="pm-modal-backdrop pm-dashboard-list-backdrop"><section class="pm-modal pm-dashboard-list-modal" role="dialog" aria-modal="true" aria-label="All ${title}"><div class="pm-modal-head"><div><h2>${title}</h2><p>${type === "followups" ? "What needs a response next" : "Open a project to move work forward"}</p></div><button type="button" class="pm-close" data-pm-action="close-modal" aria-label="Close ${title}">×</button></div><div class="pm-dashboard-list-toolbar"><label class="pm-search"><span aria-hidden="true">⌕</span><input type="search" data-pm-dashboard-list-search placeholder="Search ${title.toLowerCase()}..." aria-label="Search ${title.toLowerCase()}"></label><span data-pm-dashboard-list-count></span></div><div class="pm-dashboard-list-results" data-pm-dashboard-list-results></div></section></div>`);
    renderDashboardListResults();
    root.querySelector("[data-pm-dashboard-list-search]")?.focus();
    if (!state.search) return;
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
      const received = Math.max(0, Number(derived.receivedPayment) || 0);
      const contractWithVat = vatInclusiveAmount(project.contractValue);
      const receivedPercent = contractWithVat > 0 ? Math.min(100, received / contractWithVat * 100) : 0;
      const pendingLabel = contractWithVat > 0 ? `${Math.max(0, Math.round(100 - receivedPercent))}% pending` : "Contract value not set";
      return `<tr data-pm-open-project="${esc(project.id)}"><td>${index + 1}</td><td><button class="pm-project-name-link" type="button" data-pm-open-project="${esc(project.id)}" aria-label="Open ${esc(project.name)}"><strong>${esc(project.code || project.name)}</strong></button><small>${esc(project.code ? project.name : project.customer || "-")}</small></td><td><div class="pm-progress pm-progress-${progressTone(derived.progress)}"><span><i style="width:${derived.progress}%"></i></span><b>${derived.progress}%</b></div></td><td><span class="pm-project-stage pm-project-stage-${statusClass(derived.nextMilestone)}">${esc(derived.nextMilestone)}</span></td><td><div class="pm-payment-progress"><strong class="${received > 0 ? "pm-payment-received" : "pm-payment-unreceived"}">${moneyWithCents(received)}</strong><span class="pm-payment-progress-track" role="progressbar" aria-label="Payment received for ${esc(project.name)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(receivedPercent)}"><i style="width:${receivedPercent}%"></i></span><small>Received · ${pendingLabel}</small></div></td><td><span class="pm-project-count pm-project-pending-${pendingTone}">${derived.pendingWorkCount}</span></td><td><span class="pm-project-count pm-project-followup-${followUpTone}">${derived.activeFollowUpCount}</span></td><td>${dateTime(project.updatedAt)}</td></tr>`;
    }).join("");
    return `<div class="pm-table-wrap pm-all-projects-table"><table class="pm-table"><thead><tr><th>#</th><th>Project</th><th>Project Progress</th><th>Current Stage</th><th>Payment Progress</th><th>Pending Works</th><th>Follow-ups</th><th>Last Updated</th></tr></thead><tbody>${rows || `<tr><td colspan="8" class="pm-table-empty">No projects match this filter. Create a project to get started.</td></tr>`}</tbody></table></div>`;
  }

  function installationQuantityTotals(items) {
    const totals = { boq: 0, ordered: 0, delivered: 0, installed: 0 };
    for (const item of items || []) {
      const boq = Number(item.boqQty);
      if (!Number.isFinite(boq) || boq <= 0) continue;
      totals.boq += boq;
      for (const [key, field] of [["ordered", "lpoQty"], ["delivered", "deliveredQty"], ["installed", "installedQty"]]) {
        const quantity = Number(item[field]);
        if (Number.isFinite(quantity) && quantity > 0) totals[key] += quantity;
      }
    }
    return totals;
  }

  function detailHeader(project) {
    const d = project.derived;
    const contractWithVat = vatInclusiveAmount(project.contractValue);
    const receivedPercent = contractWithVat ? Math.min(100, d.receivedPayment / contractWithVat * 100) : 0;
    const pendingPaymentPercent = contractWithVat ? `${Math.max(0, Math.round(100 - receivedPercent))}% Pending` : "Pending amount not specified";
    const variationContractWithVat = vatInclusiveAmount(project.variationContractValue);
    const variationReceived = variationPaymentReceived(project);
    const variationReceivedPercent = variationContractWithVat > 0 ? Math.min(100, variationReceived / variationContractWithVat * 100) : 0;
    const variationPendingPercent = variationContractWithVat > 0 ? `${Math.max(0, Math.round(100 - variationReceivedPercent))}% Pending` : "Variation contract value not set";
    const quantityTotals = installationQuantityTotals(project.installationItems);
    const quantityKpis = ["ordered", "delivered", "installed"].map(key => {
      const percent = quantityTotals.boq ? quantityTotals[key] / quantityTotals.boq * 100 : 0;
      const displayedPercent = percent >= 100 ? Math.round(percent) : percent > 0 ? Math.max(1, Math.floor(percent)) : 0;
      const label = key[0].toUpperCase() + key.slice(1);
      return `<div class="pm-quantity-metric"><div class="pm-ring pm-quantity-ring-${key}${percent >= 100 ? " pm-quantity-ring-complete" : ""}" style="--pm-progress:${Math.min(100, percent)}%" role="img" aria-label="${label}: ${displayedPercent}% of BOQ"><strong aria-hidden="true">${displayedPercent}%</strong></div><b>${label}</b></div>`;
    }).join("");
    return `<div class="pm-detail-head"><div><div class="pm-breadcrumb"><button data-pm-action="back">Projects</button><span>›</span><b>${esc(project.code || project.name)}</b></div><h1>${esc(project.code ? `${project.code} – ${project.name}` : project.name)}</h1><p>Client: ${esc(project.customer || "-")} · Consultant: ${esc(project.consultant || "-")} ${project.location ? `· Location: ${esc(project.location)}` : "· Location: -"}</p></div><div class="pm-detail-actions"><button class="pm-secondary" data-pm-action="back">← Back to Projects</button><button class="pm-secondary" data-pm-action="edit-project">✎ Edit Project</button><button class="pm-secondary" data-pm-action="delete-project">...</button>${pill(project.status)}</div></div>
      <div class="pm-detail-kpis"><div class="pm-detail-quantity-kpi" aria-label="Overall BOQ quantity progress">${quantityKpis}</div><div class="pm-detail-stat"><span>Current Stage</span><strong>${esc(d.nextMilestone)}</strong>${pill(project.status)}</div><div class="pm-detail-stat"><span>Contract Value</span><strong>${project.contractValue ? `${money(project.contractValue)} <span class="pm-contract-vat">+ VAT</span>` : "-"}</strong><small>${project.contractValue ? `${money(contractWithVat)} Incl VAT` : "Not specified"}</small></div><div class="pm-detail-stat"><span>Payment Received (Incl VAT)</span><strong>${esc(d.paymentStatus)}</strong><div class="pm-mini-progress"><i style="width:${receivedPercent}%"></i></div><small>${esc(pendingPaymentPercent)}</small></div><div class="pm-detail-stat"><span>Variation Payment (Incl VAT)</span><strong>${moneyWithCents(variationReceived)} Received</strong><div class="pm-mini-progress pm-variation-progress"><i style="width:${variationReceivedPercent}%"></i></div><small>${esc(variationPendingPercent)}</small></div></div>`;
  }

  function renderDetail() {
    const project = state.project;
    if (!project) return open();
    root.innerHTML = `${detailHeader(project)}<nav class="pm-tabs">${["overview", "information", "boq", "installation", "submittals", "pending", "payment", "followups", "lpos", "documents", "activity"].map(tab => `<button class="${state.tab === tab ? "active" : ""}" data-pm-tab="${tab}">${tab === "information" ? "Project Information" : tab === "boq" ? "BOQ" : tab === "followups" ? "Follow-ups" : tab === "lpos" ? "LPO's" : tab === "activity" ? "Activity History" : tab === "installation" ? "Installation Progress" : tab === "pending" ? "Pending Works" : tab[0].toUpperCase() + tab.slice(1)}</button>`).join("")}</nav><div class="pm-detail-content">${detailTab(project)}</div>`;
  }

  function detailTab(project) {
    if (state.tab === "information") return informationTab(project);
    if (state.tab === "boq") return boqTab(project);
    if (state.tab === "installation") return installationTab(project);
    if (state.tab === "submittals") return submittalsTab(project);
    if (state.tab === "pending") return pendingWorksTab(project);
    if (state.tab === "payment") return paymentTab(project);
    if (state.tab === "followups") return followUpsTab(project);
    if (state.tab === "lpos") return lposTab();
    if (state.tab === "documents") return documentsTab(project);
    if (state.tab === "activity") return activityTab(project);
    return overviewTab(project);
  }

  function overviewTab(project) {
    const variation = (project.variationPayments || []).length
      ? `<section class="pm-panel pm-command-payment"><div class="pm-panel-head"><h2>Variation Payment</h2><button class="pm-link" data-pm-tab="payment">View All →</button></div>${compactVariationPayments(project)}</section>`
      : "";
    const installationRows = installationOverviewRows(project);
    return `<div class="pm-command-grid"><div class="pm-command-main"><section class="pm-panel pm-command-docs"><div class="pm-panel-head"><div><h2>Documentation / Submittals</h2><p>${project.submittals.filter(item => /^approved(?: as noted)?$/i.test(item.status)).length} of ${project.submittals.length} approved</p></div><button class="pm-link" data-pm-tab="submittals">View All →</button></div>${compactSubmittals(project)}</section><section class="pm-panel pm-command-installation"><div class="pm-panel-head"><span class="pm-installation-heading-icon" aria-hidden="true"></span><div class="pm-installation-heading"><h2>Installation Progress</h2><p>${installationRows.filter(row => row.installed >= 100 && row.hasBoq).length} of ${installationRows.length} categories complete</p></div><button class="pm-installation-view" data-pm-tab="installation">View Full Installation <span aria-hidden="true">→</span></button></div>${compactInstallation(installationRows)}</section><section class="pm-panel pm-command-testing"><div class="pm-panel-head"><div><h2>Testing & Commissioning</h2><p>${project.testingItems.filter(item => /^(finished|completed)$/i.test(item.status)).length} of ${project.testingItems.length} finished</p></div><button class="pm-link" data-pm-tab="information">View All →</button></div>${compactTesting(project)}</section></div><aside class="pm-command-side"><section class="pm-panel pm-command-payment"><div class="pm-panel-head"><h2>Payment Terms</h2><button class="pm-link" data-pm-tab="payment">View All Payment Terms →</button></div>${compactPayments(project)}</section>${variation}<section class="pm-panel pm-command-followups"><div class="pm-panel-head"><div><h2>Follow-ups <em>${project.followUps.length}</em></h2><p>Latest actions requiring attention</p></div><button class="pm-link" data-pm-tab="followups">View All Follow-ups →</button></div>${compactFollowUps(project)}</section></aside></div>`;
  }

  function compactSubmittals(project) {
    const rows = project.submittals.slice(0, 4).map(item => `<div class="pm-compact-row"><span>${esc(item.item)}</span><span>${submittalStatusPill(item.status)}</span><small>${esc(item.comments || "-")}</small></div>`).join("");
    return `<div class="pm-compact-table"><div class="pm-compact-row pm-compact-head"><span>Item</span><span>Status</span><span>Comments</span></div>${rows || `<div class="pm-table-empty">No submittals yet.</div>`}</div>`;
  }

  const submittalStatuses = ["Preparation", "Submitted", "Approved as Noted", "Revise & Resubmit", "Rejected"];
  const submittalTone = status => ({
    Preparation: "preparation", Submitted: "submitted", "Approved as Noted": "approved",
    "Revise & Resubmit": "revise", Rejected: "rejected"
  })[status] || "preparation";
  const submittalStatusPill = status => `<span class="pm-submittal-status pm-submittal-status-${submittalTone(status)}">${esc(status)}</span>`;
  function submittalPendingDays(revision) {
    if (!revision.submitted) return "";
    const endDate = revision.released || (["Submitted", "Revise & Resubmit"].includes(revision.status) ? todayISO() : "");
    if (!endDate) return "";
    const days = Math.floor((Date.parse(endDate) - Date.parse(revision.submitted)) / 86400000);
    return Number.isFinite(days) ? Math.max(0, days) : "";
  }

  function submittalDateText(value) {
    const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return match ? `${match[3]}/${match[2]}/${match[1]}` : "";
  }

  function parseSubmittalDate(value) {
    const text = value.trim();
    if (!text) return "";
    const parts = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
    const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (!parts && !iso) return null;
    const [year, month, day] = parts ? [Number(parts[3]), Number(parts[2]), Number(parts[1])] : [Number(iso[1]), Number(iso[2]), Number(iso[3])];
    const date = new Date(Date.UTC(year, month - 1, day));
    if (year < 1000 || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
    return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  function submittalField(item, field, label, revision = null, type = "text") {
    const value = revision ? revision[field] : item[field];
    if (type === "date") {
      const attrs = `data-pm-sub-field="${field}" data-pm-sub-id="${esc(item.id)}" ${revision ? `data-pm-revision-id="${esc(revision.id)}"` : ""}`;
      return `<span class="pm-submittal-date"><input class="pm-submittal-input pm-submittal-date-text" type="text" inputmode="numeric" maxlength="10" placeholder="dd/mm/yyyy" ${attrs} data-pm-date-text value="${esc(submittalDateText(value))}" aria-label="${esc(label)}"><input class="pm-submittal-date-picker" type="date" ${attrs} value="${esc(value)}" aria-label="Choose ${esc(label)}" title="Choose date"></span>`;
    }
    return `<input class="pm-submittal-input" type="${type}" data-pm-sub-field="${field}" data-pm-sub-id="${esc(item.id)}" ${revision ? `data-pm-revision-id="${esc(revision.id)}"` : ""} value="${esc(value)}" aria-label="${esc(label)}" title="${esc(value)}">`;
  }

  function submittalStatusSelect(item, revision) {
    return `<span class="pm-submittal-status-wrap pm-submittal-status-${submittalTone(revision.status)}"><select class="pm-submittal-status-select" data-pm-sub-field="status" data-pm-sub-id="${esc(item.id)}" data-pm-revision-id="${esc(revision.id)}" aria-label="${esc(item.refNo || item.item)} status">${options(submittalStatuses, revision.status)}</select></span>`;
  }

  function submittalFileCell(item, revision) {
    const document = state.project.documents.find(file => file.id === revision.documentId);
    const link = document ? `<a class="pm-submittal-file-link" href="${esc(documentUrl(document))}" target="_blank" rel="noopener" title="${esc(document.originalName)}">View</a>`
      : revision.sourceFileName ? `<span class="pm-submittal-imported-file" title="${esc(revision.sourceFileName)}">${esc(revision.sourceFileName)}</span>` : "";
    const upload = document ? "" : `<button type="button" class="pm-submittal-icon-button" data-pm-action="choose-submittal-file" title="Upload file" aria-label="Upload ${esc(item.refNo || item.item)} ${esc(revision.rev)} file"><img src="/assets/upload.svg" alt=""></button><input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg" data-pm-sub-file data-pm-sub-id="${esc(item.id)}" data-pm-revision-id="${esc(revision.id)}" hidden>`;
    return `<div class="pm-submittal-file-cell">${link}${upload}</div>`;
  }

  function submittalHistory(item) {
    const rows = item.revisions.map((revision, index) => `<tr class="pm-submittal-history-item"><td><b>${esc(revision.rev)}</b></td><td>${submittalStatusSelect(item, revision)}</td><td>${submittalField(item, "submitted", `${revision.rev} submitted date`, revision, "date")}</td><td>${submittalField(item, "released", `${revision.rev} released date`, revision, "date")}</td><td>${submittalField(item, "remarks", `${revision.rev} remarks`, revision)}</td><td>${submittalFileCell(item, revision)}</td><td class="pm-submittal-history-action">${index ? `<button type="button" class="pm-submittal-delete" data-pm-action="delete-submittal-revision" data-pm-sub-id="${esc(item.id)}" data-pm-revision-id="${esc(revision.id)}" title="Delete ${esc(revision.rev)}" aria-label="Delete ${esc(revision.rev)} revision">×</button>` : ""}</td></tr>`).join("");
    const table = `<table><thead><tr><th>Rev</th><th>Status</th><th>Submit Date</th><th>Release Date</th><th>Remarks</th><th>File</th><th class="pm-submittal-history-action" aria-label="Revision actions"></th></tr></thead><tbody>${rows}</tbody></table>`;
    return `<tr class="pm-submittal-history-row"><td colspan="11"><div class="pm-submittal-history"><div class="pm-submittal-history-head"><h3>Revision History</h3><button type="button" class="pm-secondary" data-pm-action="new-submittal-revision" data-pm-sub-id="${esc(item.id)}">+ New Revision</button></div>${table}</div></td></tr>`;
  }

  function filteredSubmittals() {
    const query = state.submittalSearch.trim().toLowerCase();
    return (state.project?.submittals || []).filter(item => item.kind === state.submittalKind &&
      (!query || [item.refNo, item.item, item.supplier, item.status].some(value => String(value || "").toLowerCase().includes(query))));
  }

  function renderSubmittalRows() {
    const tbody = root.querySelector("[data-pm-submittal-rows]");
    if (!tbody) return;
    const items = filteredSubmittals();
    tbody.innerHTML = items.map((item, index) => {
      const revision = item.revisions.at(-1);
      const expanded = state.expandedSubmittals.has(item.id);
      const pending = submittalPendingDays(revision);
      const detail = state.submittalKind === "material"
        ? submittalField(item, "supplier", `Supplier or manufacturer for ${item.refNo || item.item}`)
        : submittalField(item, "plannedDate", `Planned date for ${item.refNo || item.item}`, null, "date");
      return `<tr class="pm-submittal-row"><td class="pm-submittal-number">${index + 1}</td><td>${submittalField(item, "refNo", `Reference number for ${item.item}`)}</td><td class="pm-submittal-description">${submittalField(item, "item", `Description for ${item.refNo || `row ${index + 1}`}`)}</td><td>${detail}</td><td class="pm-submittal-rev"><button type="button" class="pm-submittal-rev-button ${expanded ? "expanded" : ""}" data-pm-action="toggle-submittal-history" data-pm-sub-id="${esc(item.id)}" aria-label="${expanded ? "Collapse" : "Expand"} ${esc(item.refNo || item.item || `row ${index + 1}`)} revision history" aria-expanded="${expanded}" title="Revision history">${esc(revision.rev)}</button></td><td>${submittalStatusSelect(item, revision)}</td><td>${submittalField(item, "submitted", `Submitted date for ${item.refNo || item.item}`, revision, "date")}</td><td>${submittalField(item, "released", `Released date for ${item.refNo || item.item}`, revision, "date")}</td><td class="pm-submittal-days">${pending === "" ? "-" : `<span class="pm-submittal-days-tag ${revision.released ? "released" : "waiting"}">${pending} days</span>`}</td><td>${submittalFileCell(item, revision)}</td><td class="pm-submittal-action"><button type="button" class="pm-submittal-delete" data-pm-action="delete-submittal-row" data-pm-sub-id="${esc(item.id)}" title="Delete submittal" aria-label="Delete ${esc(item.refNo || item.item || "blank submittal")}">×</button></td></tr>${expanded ? submittalHistory(item) : ""}`;
    }).join("") || `<tr><td colspan="11" class="pm-table-empty">${state.submittalSearch ? "No submittals match the search." : "No submittals yet."}</td></tr>`;
    const count = root.querySelector("[data-pm-submittal-count]");
    if (count) count.textContent = `${items.length} item${items.length === 1 ? "" : "s"}`;
  }

  function submittalsTab(project) {
    const material = state.submittalKind === "material";
    const title = material ? "Material Submittals" : "Shop Drawings";
    const description = material ? "Track material submittals and approvals." : "Track shop drawings, approvals and revisions.";
    const content = `<section class="pm-panel pm-submittals-panel"><div class="pm-submittals-top"><div class="pm-submittals-title"><span class="pm-submittals-title-icon"><img src="/assets/file-text.svg" alt=""></span><div><h2>${title}</h2><p>${description}</p></div></div></div><div class="pm-submittals-inner"><div class="pm-submittals-toolbar"><div class="pm-submittals-segment" role="tablist" aria-label="Submittal type"><button type="button" role="tab" aria-selected="${material}" class="${material ? "active" : ""}" data-pm-action="show-submittal-kind" data-pm-kind="material"><img src="/assets/maintenance-icons/file-check-2.svg" alt="">Material Submittals</button><button type="button" role="tab" aria-selected="${!material}" class="${!material ? "active" : ""}" data-pm-action="show-submittal-kind" data-pm-kind="drawing"><img src="/assets/maintenance-icons/image.svg" alt="">Shop Drawings</button></div><div class="pm-submittals-actions"><label class="pm-search"><img src="/assets/search.svg" alt=""><input type="search" data-pm-sub-search value="${esc(state.submittalSearch)}" placeholder="Search reference, description or status" aria-label="Search submittals by reference, description, supplier or status"></label><button type="button" class="pm-primary" data-pm-action="add-submittal">+ ${material ? "Add Submittal" : "Add Drawing"}</button><div class="pm-submittals-more"><button type="button" class="pm-submittals-more-button" data-pm-action="toggle-submittal-menu" aria-label="More submittal actions" aria-haspopup="menu" aria-expanded="false" aria-controls="pmSubmittalMenu" title="More actions"><img src="/assets/maintenance-icons/ellipsis.svg" alt=""></button><div id="pmSubmittalMenu" class="pm-submittals-menu" role="menu" hidden><button type="button" role="menuitem" data-pm-action="choose-submittal-import"><img src="/assets/upload.svg" alt="">Import Log</button><button type="button" role="menuitem" data-pm-action="download-submittal-log"><img src="/assets/download.svg" alt="">Download Log</button></div></div><input type="file" accept=".xlsx,.csv" data-pm-sub-import hidden></div></div><div class="pm-submittals-table-wrap"><table class="pm-submittals-table ${material ? "pm-submittals-material" : "pm-submittals-drawing"}"><colgroup><col class="pm-sub-col-number"><col class="pm-sub-col-ref"><col class="pm-sub-col-description"><col class="pm-sub-col-detail"><col class="pm-sub-col-rev"><col class="pm-sub-col-status"><col class="pm-sub-col-date"><col class="pm-sub-col-date"><col class="pm-sub-col-days"><col class="pm-sub-col-file"><col class="pm-sub-col-action"></colgroup><thead><tr><th>#</th><th>Ref No.</th><th>Description</th><th>${material ? "Supplier / Manufacturer" : "Planned Date"}</th><th>Rev</th><th>Status</th><th>Submit Date</th><th>Release Date</th><th>Days Pending</th><th>File</th><th class="pm-submittal-action" aria-label="Row actions"></th></tr></thead><tbody data-pm-submittal-rows></tbody></table></div><div class="pm-submittals-footer" data-pm-submittal-count></div></div></section>`;
    queueMicrotask(renderSubmittalRows);
    return content;
  }

  function closeSubmittalMenu() {
    const menu = root.querySelector(".pm-submittals-menu");
    if (menu) menu.hidden = true;
    root.querySelector('[data-pm-action="toggle-submittal-menu"]')?.setAttribute("aria-expanded", "false");
  }

  function toggleSubmittalMenu() {
    const menu = root.querySelector(".pm-submittals-menu");
    const button = root.querySelector('[data-pm-action="toggle-submittal-menu"]');
    if (!menu || !button) return;
    const opening = menu.hidden;
    menu.hidden = !opening;
    button.setAttribute("aria-expanded", String(opening));
    if (opening) menu.querySelector('[role="menuitem"]')?.focus();
    else button.focus();
  }

  async function addSubmittalRow() {
    const next = structuredClone(state.project);
    const itemId = crypto.randomUUID();
    next.submittals.push({ id: itemId, kind: state.submittalKind, refNo: "", item: "", supplier: "", plannedDate: "",
      revisions: [{ id: crypto.randomUUID(), rev: "R0", status: "Preparation", submitted: "", released: "", remarks: "", documentId: "" }] });
    state.submittalSearch = "";
    const saving = saveProjectPayload(projectPayload(next), "", { quiet: true, renderOptimistic: true });
    queueMicrotask(() => root.querySelector(`[data-pm-sub-id="${itemId}"][data-pm-sub-field="refNo"]`)?.focus());
    await saving;
  }

  async function deleteSubmittalRow(itemId) {
    const item = state.project.submittals.find(row => row.id === itemId);
    if (!item) return;
    const hasContent = item.refNo || item.item || item.supplier || item.plannedDate || item.revisions.length > 1 ||
      item.revisions.some(revision => revision.documentId || revision.sourceFileName || revision.submitted || revision.released || revision.remarks);
    if (hasContent && !confirm(`Delete ${item.refNo || item.item || "this submittal"} and its revision history? Uploaded files will remain in Documents.`)) return;
    const next = structuredClone(state.project);
    next.submittals = next.submittals.filter(row => row.id !== itemId);
    state.expandedSubmittals.delete(itemId);
    await saveProjectPayload(projectPayload(next), "Submittal deleted");
  }

  async function updateSubmittalField(input) {
    const next = structuredClone(state.project);
    const item = next.submittals.find(row => row.id === input.dataset.pmSubId);
    if (!item) return;
    const field = input.dataset.pmSubField;
    const revision = input.dataset.pmRevisionId ? item.revisions.find(row => row.id === input.dataset.pmRevisionId) : null;
    const target = revision || item;
    if (!target || !["refNo", "item", "supplier", "plannedDate", "status", "submitted", "released", "remarks"].includes(field)) return;
    const value = input.matches("[data-pm-date-text]") ? parseSubmittalDate(input.value) : input.value.trim();
    if (value === null) {
      input.value = submittalDateText(target[field]);
      toast("Enter a valid date as dd/mm/yyyy");
      return;
    }
    if (field === "refNo" && value && next.submittals.some(row => row.id !== item.id && row.kind === item.kind && String(row.refNo || "").toLowerCase() === value.toLowerCase())) {
      renderDetail(); throw new Error("This reference number already exists in the selected log");
    }
    target[field] = value;
    if (revision && field === "status" && value === "Submitted" && !revision.submitted) revision.submitted = todayISO();
    await saveProjectPayload(projectPayload(next), "", { quiet: true });
    renderDetail();
  }

  async function addSubmittalRevision(submittalId) {
    const next = structuredClone(state.project);
    const item = next.submittals.find(row => row.id === submittalId);
    if (!item) return;
    const number = Math.max(-1, ...item.revisions.map(revision => Number(revision.rev.slice(1)) || 0)) + 1;
    item.revisions.push({ id: crypto.randomUUID(), rev: `R${number}`, status: "Preparation", submitted: "", released: "", remarks: "", documentId: "" });
    state.expandedSubmittals.add(item.id);
    await saveProjectPayload(projectPayload(next), "New revision added");
  }

  async function deleteSubmittalRevision(submittalId, revisionId) {
    const item = state.project.submittals.find(row => row.id === submittalId);
    const revision = item?.revisions.find(row => row.id === revisionId);
    if (!revision || item.revisions[0].id === revisionId) return;
    if (!confirm(`Delete ${revision.rev} from ${item.refNo || item.item || "this submittal"}? Uploaded files will remain in Documents.`)) return;
    const next = structuredClone(state.project);
    const nextItem = next.submittals.find(row => row.id === submittalId);
    nextItem.revisions = nextItem.revisions.filter(row => row.id !== revisionId);
    await saveProjectPayload(projectPayload(next), `${revision.rev} deleted`);
  }

  async function uploadSubmittalFile(itemId, revisionId, file) {
    const form = new FormData();
    form.append("file", file);
    const url = `/api/project-management/projects/${encodeURIComponent(state.project.id)}/submittals/${encodeURIComponent(itemId)}/revisions/${encodeURIComponent(revisionId)}/file`;
    state.project = await api(url, { method: "POST", body: form });
    renderDetail();
    toast("Revision file uploaded to Documents");
  }

  async function importSubmittalLog(input) {
    const file = input.files?.[0];
    input.value = "";
    if (!file || state.submittalImportBusy) return;
    state.submittalImportBusy = true;
    const form = new FormData();
    form.append("file", file);
    form.append("kind", state.submittalKind);
    try {
      state.project = await api(`/api/project-management/projects/${encodeURIComponent(state.project.id)}/submittals/import`, { method: "POST", body: form });
      renderDetail();
      toast("Submittal log imported");
    } catch (error) { toast(error.message); }
    finally { state.submittalImportBusy = false; }
  }
  function compactFollowUps(project) { const items = project.followUps.filter(item => !/^(finished|completed)$/i.test(item.status)).slice(0, 6); return `<div class="pm-followup-timeline">${items.map(item => `<div class="pm-followup-item"><span class="pm-followup-dot"></span><div><div class="pm-followup-meta"><b>${date(item.date)}</b>${pill(item.status)}</div><strong>${esc(item.subject)}</strong><small>${esc(item.notes || "-")}</small><small>Assigned: ${esc(item.assigned || "Unassigned")}</small></div></div>`).join("") || `<div class="pm-table-empty">No active follow-ups.</div>`}</div>`; }
  function checkpointSvg(status) { return status === "completed" ? `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 10 3.1 3.1L15 6.5"></path></svg>` : status === "in_progress" ? `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 10h10"></path></svg>` : status === "issue" ? `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6 6 8 8M14 6l-8 8"></path></svg>` : ""; }
  function checkpointIcon(value, field = "", index = "") { const status = ["completed", "in_progress", "issue", "not_started"].includes(value) ? value : "not_started"; const label = ({ completed: "Completed", in_progress: "In Progress / Partial", issue: "Issue / Not Available", not_started: "Not Started" })[status]; if (!field) return `<span class="pm-checkpoint pm-checkpoint-${status}" title="${label}">${checkpointSvg(status)}</span>`; return `<button type="button" class="pm-checkpoint pm-checkpoint-${status}" title="${label}" aria-label="${label}" data-pm-checkpoint="${field}" data-pm-index="${index}">${checkpointSvg(status)}</button>`; }
  function installationOverviewRows(project) {
    return (project.boqCategories || []).map((category, index) => {
      const items = project.installationItems.filter(item => item.categoryId === category.id && Number(item.boqQty) > 0);
      const boqQty = items.reduce((sum, item) => sum + Number(item.boqQty), 0);
      const percent = field => boqQty ? items.reduce((sum, item) =>
        sum + Math.max(0, Number(item[field]) || 0), 0) / boqQty * 100 : 0;
      return { name: category.name || `Category ${index + 1}`, hasBoq: items.length > 0,
        ordered: percent("lpoQty"), delivered: percent("deliveredQty"), installed: percent("installedQty") };
    });
  }

  function compactInstallation(rows) {
    const displayPercent = value => `${value > 0 ? Math.max(1, Math.round(value)) : 0}%`;
    const circle = (value, label) => {
      const tone = value >= 100 ? "complete" : value > 50 ? "three-quarter" : value > 25 ? "half" : value > 0 ? "early" : "empty";
      return `<span class="pm-installation-circle ${tone}" role="img" aria-label="${label}: ${displayPercent(value)} of BOQ" title="${label}: ${displayPercent(value)} of BOQ"></span>`;
    };
    return `<div class="pm-compact-table pm-installation-summary"><div class="pm-compact-row pm-compact-head"><span>#</span><span>Work Item</span><span>Ordered</span><span>Delivered</span><span>Installed</span><span>Progress</span></div>${rows.map((row, index) => {
      const progress = Math.min(100, row.installed);
      const tone = row.installed >= 75 ? "high" : row.installed > 0 ? "partial" : "empty";
      return `<div class="pm-compact-row pm-installation-row"><span>${index + 1}</span><span title="${esc(row.name)}">${esc(row.name)}</span><span>${circle(row.ordered, "Ordered")}</span><span>${circle(row.delivered, "Delivered")}</span><span>${circle(row.installed, "Installed")}</span><span class="pm-installation-progress ${tone}"><span class="pm-installation-progress-track"><i style="width:${progress}%"></i></span><b>${displayPercent(row.installed)}</b></span></div>`;
    }).join("") || `<div class="pm-table-empty">No installation categories yet.</div>`}</div>`;
  }
  function compactPayments(project) { return `<div class="pm-compact-table pm-payment-summary"><div class="pm-compact-row pm-compact-head"><span>Payment Details</span><span>%</span><span>Amount</span><span>Status</span></div>${project.payments.slice(0, 5).map(item => `<div class="pm-compact-row"><span>${esc(item.milestone)}</span><span>${item.amount === "" ? "-" : `${paymentPercentage(item.amount, project.contractValue)}%`}</span><span>${item.amount === "" ? "-" : money(item.amount)}</span><span>${pill(item.status)}</span></div>`).join("")}</div>`; }
  function compactVariationPayments(project) { return `<div class="pm-compact-table pm-variation-summary"><div class="pm-compact-row pm-compact-head"><span>Payment Details</span><span>Amount</span><span>Status</span></div>${project.variationPayments.map(item => `<div class="pm-compact-row"><span>${esc(item.milestone)}</span><span>${item.amount === "" ? "-" : moneyWithCents(item.amount)}</span><span>${pill(item.status)}</span></div>`).join("")}</div>`; }
  function compactTesting(project) { return `<div class="pm-compact-table"><div class="pm-compact-row pm-compact-head"><span>Activity</span><span>Status</span><span>Comments</span></div>${project.testingItems.slice(0, 4).map(item => `<div class="pm-compact-row"><span>${esc(item.activity)}</span><span>${pill(item.status)}</span><small>${esc(item.comments || "-")}</small></div>`).join("")}</div>`; }

  function pendingWorksTab(project) {
    const items = project.derived.pendingWorkRows || project.derived.pendingWorks || [];
    const rows = items.map((item, index) => `<tr><td>${index + 1}</td><td class="pm-pending-project-date"><strong>${esc(project.name)}</strong><small>${date(item.dueDate || todayISO())}</small></td><td>${pendingStatusSelect(item.id, item.status)}</td><td><input class="pm-inline-edit pm-bold-edit" data-pm-pending-field="workItem" data-pm-pending-id="${esc(item.id)}" value="${esc(item.workItem)}"></td><td class="pm-delete-cell"><button class="pm-row-action pm-inline-row-delete" type="button" title="Delete pending work" aria-label="Delete pending work" data-pm-action="delete-pending-work" data-pm-pending-id="${esc(item.id)}"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6 6 8 8M14 6l-8 8"></path></svg></button></td></tr>`).join("");
    return `<section class="pm-panel pm-pending-detail-panel"><div class="pm-panel-head"><div><h2>Pending Works <em>${items.length}</em></h2><p>Open items that need to be completed to move this project forward.</p></div><button class="pm-secondary" type="button" data-pm-action="add-pending-work">＋ Add Pending Work</button></div><div class="pm-table-wrap pm-rounded-table-wrap"><table class="pm-table pm-edit-table pm-pending-detail-table"><thead><tr><th>#</th><th>Project / Date</th><th>Status</th><th>Work Item</th><th class="pm-delete-col"><span class="sr-only">Delete</span></th></tr></thead><tbody>${rows || `<tr><td colspan="5" class="pm-table-empty">No pending works.</td></tr>`}</tbody></table></div></section>`;
  }

  function informationTab(project) {
    return `<div class="pm-section-grid"><section class="pm-panel"><div class="pm-panel-head"><div><h2>Project Information</h2><p>Keep the project identity and commercial details current.</p></div><button class="pm-secondary" data-pm-action="edit-project">✎ Edit</button></div><div class="pm-info-grid">${info("Customer", project.customer)}${info("Consultant", project.consultant)}${info("Contractor", project.contractor)}${info("Owner", project.owner)}${info("Contact Person", project.contact)}${info("Phone", project.phone)}${info("Email", project.email)}${info("Location", project.location)}${info("Project Engineers", (project.projectEngineers || []).map(user => user.name).join(", "))}${info("Target Handover", date(project.targetHandover))}${info("Contract Value", project.contractValue ? money(project.contractValue) : "-")}${info("Progress", `${project.derived.progress}% calculated`)}${info("Created By", project.createdBy)}${info("Payment Note", project.paymentSummary)}${info("Project Details", project.notes, true)}</div></section>${testingTab(project)}</div>`;
  }

  function info(label, value, full = false) { return `<div${full ? ' class="pm-info-full"' : ""}><span>${esc(label)}</span><b>${esc(value || "-")}</b></div>`; }

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

  function quantityDisplay(value) { return value === "" || value === undefined || value === null ? "" : Number(value).toLocaleString("en-AE", { maximumFractionDigits: 3 }); }
  function boqGridInput(item, field, label, numeric = false) {
    return `<input data-pm-grid-field="${field}" data-pm-row-id="${esc(item.id)}" aria-label="${esc(label)}" ${numeric ? 'type="number" min="0" step="any" inputmode="decimal"' : 'type="text"'} value="${esc(item[field] ?? "")}">`;
  }
  function boqDescriptionInput(item, label) {
    const description = [item.itemNo, item.item].filter(Boolean).join(" ");
    return `<input data-pm-grid-field="description" data-pm-row-id="${esc(item.id)}" aria-label="${esc(label)}" type="text" value="${esc(description)}">`;
  }
  function projectGridRows(project, kind) {
    const query = (kind === "boq" ? state.boqSearch : state.installationSearch).trim().toLowerCase();
    const colCount = kind === "boq" ? 7 : 9;
    const rows = (project.boqCategories || []).map((category, categoryIndex) => {
      const items = project.installationItems.filter(item => item.categoryId === category.id);
      const matchesCategory = category.name.toLowerCase().includes(query);
      const visible = query && !matchesCategory ? items.filter(item => [item.itemNo, item.item, item.unit, item.remarks, item.comments].some(value => String(value || "").toLowerCase().includes(query))) : items;
      if (query && !matchesCategory && !visible.length) return "";
      const collapsed = state.collapsedBoqCategories.has(category.id) && !query;
      const itemRows = collapsed ? "" : visible.map((item, visibleIndex) => {
        const rowNumber = `${categoryIndex + 1}.${items.indexOf(item) + 1}`;
        const addButton = item === visible.at(-1) ? `<button type="button" class="pm-grid-add" data-pm-action="add-boq-row" data-pm-category-id="${esc(category.id)}" title="Add item to ${esc(category.name || "category")}" aria-label="Add item to ${esc(category.name || "category")}"></button>` : "";
        const rowClass = `pm-grid-item${kind === "boq" && visibleIndex % 2 ? " pm-grid-item-shaded" : ""}${addButton ? " pm-grid-item-last" : ""}`;
        if (kind === "boq") {
          const amount = item.boqQty === "" || item.rate === "" ? "" : Number(item.boqQty) * Number(item.rate);
          return `<tr class="${rowClass}" data-pm-grid-row="${esc(item.id)}"><td><span class="pm-grid-drag-handle" draggable="true" data-pm-grid-handle="${esc(item.id)}" title="Drag to move item" aria-label="Drag item ${rowNumber} to reorder">${rowNumber}</span>${addButton}</td><td>${boqDescriptionInput(item, `Materials/work description ${rowNumber}`)}</td><td>${boqGridInput(item, "unit", `Unit ${rowNumber}`)}</td><td>${boqGridInput(item, "boqQty", `BOQ quantity ${rowNumber}`, true)}</td><td>${boqGridInput(item, "rate", `Rate ${rowNumber}`, true)}</td><td><output data-pm-amount>${amount === "" ? "-" : moneyWithCents(amount)}</output></td><td class="pm-grid-last-cell">${boqGridInput(item, "remarks", `Remarks ${rowNumber}`)}<button type="button" class="pm-grid-delete" data-pm-action="delete-boq-row" data-pm-row-id="${esc(item.id)}" title="Delete item" aria-label="Delete item ${rowNumber}">×</button></td></tr>`;
        }
        const balance = item.boqQty === "" ? "" : Number(item.boqQty) - Number(item.installedQty || 0);
        const balanceTone = balance === "" ? "" : balance <= 0 ? "done" : balance <= Number(item.boqQty) * .25 ? "low" : "open";
        return `<tr class="${rowClass}" data-pm-grid-row="${esc(item.id)}"><td><span class="pm-grid-drag-handle" draggable="true" data-pm-grid-handle="${esc(item.id)}" title="Drag to move item" aria-label="Drag item ${rowNumber} to reorder">${rowNumber}</span>${addButton}</td><td>${boqDescriptionInput(item, `Materials/work description ${rowNumber}`)}</td><td>${boqGridInput(item, "unit", `Unit ${rowNumber}`)}</td><td>${quantityDisplay(item.boqQty) || "-"}</td><td class="pm-grid-quantity-green">${boqGridInput(item, "lpoQty", `Ordered quantity ${rowNumber}`, true)}</td><td class="pm-grid-quantity-green">${boqGridInput(item, "deliveredQty", `Delivered quantity ${rowNumber}`, true)}</td><td class="pm-grid-quantity-green">${boqGridInput(item, "installedQty", `Installed quantity ${rowNumber}`, true)}</td><td><output class="pm-grid-balance ${balanceTone}" data-pm-balance>${balance === "" ? "-" : quantityDisplay(balance)}</output></td><td class="pm-grid-last-cell">${boqGridInput(item, "comments", `Comments ${rowNumber}`)}<button type="button" class="pm-grid-delete" data-pm-action="delete-boq-row" data-pm-row-id="${esc(item.id)}" title="Delete item" aria-label="Delete item ${rowNumber}">×</button></td></tr>`;
      }).join("");
      const emptyAddButton = collapsed || !visible.length ? `<button type="button" class="pm-grid-add pm-grid-category-add" data-pm-action="add-boq-row" data-pm-category-id="${esc(category.id)}" title="Add item to ${esc(category.name || "category")}" aria-label="Add item to ${esc(category.name || "category")}"></button>` : "";
      return `<tr class="pm-grid-category" data-pm-grid-category="${esc(category.id)}"><td colspan="${colCount}"><div class="pm-grid-category-content"><button type="button" class="pm-grid-collapse${collapsed ? " is-collapsed" : ""}" data-pm-action="toggle-boq-category" data-pm-category-id="${esc(category.id)}" aria-label="${collapsed ? "Expand" : "Collapse"} ${esc(category.name || "category")}" aria-expanded="${!collapsed}"><span aria-hidden="true"></span></button><span class="pm-grid-category-handle" draggable="true" data-pm-grid-category-handle="${esc(category.id)}" title="Drag to move category" aria-label="Drag category ${categoryIndex + 1} to reorder">${categoryIndex + 1}.</span><input data-pm-category-name data-pm-category-id="${esc(category.id)}" aria-label="Category ${categoryIndex + 1} name" placeholder="Category name" value="${esc(category.name)}"><button type="button" class="pm-grid-category-delete" data-pm-action="delete-boq-category" data-pm-category-id="${esc(category.id)}" title="Delete category" aria-label="Delete ${esc(category.name || "category")}">×</button></div>${emptyAddButton}</td></tr>${itemRows}`;
    }).join("");
    return rows || `<tr><td colspan="${colCount}" class="pm-table-empty">${query ? "No matching BOQ items." : "No categories yet. Add an item to begin."}</td></tr>`;
  }

  function boqTab(project) {
    return `<section class="pm-panel pm-grid-panel"><div class="pm-panel-head"><div><h2>BOQ</h2><p>Original consultant BOQ and project quantities.</p></div><div class="pm-grid-tools"><input type="search" data-pm-grid-search="boq" value="${esc(state.boqSearch)}" placeholder="Search by item, description or reference" aria-label="Search BOQ"><button type="button" class="pm-secondary" data-pm-action="choose-boq-import">↑ Import BOQ</button><input type="file" data-pm-boq-file accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden><button type="button" class="pm-primary" data-pm-action="add-boq-category">＋ Add Item</button></div></div><div class="pm-table-wrap"><table class="pm-table pm-quantity-table pm-boq-table"><thead><tr><th>#</th><th>Materials/work Description</th><th>Unit</th><th>BOQ Quantity</th><th>Rate (AED)</th><th>Amount (AED)</th><th>Remarks</th></tr></thead><tbody>${projectGridRows(project, "boq")}</tbody></table></div></section>`;
  }

  function installationTab(project) {
    return `<section class="pm-panel pm-grid-panel"><div class="pm-panel-head"><div><h2>Installation Progress</h2><p>Track project quantities against BOQ and monitor site execution.</p></div><div class="pm-grid-tools"><input type="search" data-pm-grid-search="installation" value="${esc(state.installationSearch)}" placeholder="Search by item, description or reference" aria-label="Search installation items"><button type="button" class="pm-primary" data-pm-action="add-boq-category">＋ Add Item</button></div></div><div class="pm-table-wrap"><table class="pm-table pm-quantity-table pm-installation-table"><thead><tr><th>#</th><th>Materials/work Description</th><th>Unit</th><th>BOQ Qty</th><th>Ordered Qty</th><th>Delivered Qty</th><th>Installed Qty</th><th>Balance Qty</th><th>Comments</th></tr></thead><tbody>${projectGridRows(project, "installation")}</tbody></table></div></section>`;
  }

  function testingTab(project) {
    return `<section class="pm-panel pm-section-wide"><div class="pm-panel-head"><div><h2>Testing & Commissioning</h2><p>Update each activity as it moves toward handover.</p></div><button class="pm-secondary" data-pm-action="add-row" data-pm-section="testingItems">＋ Add row</button></div><div class="pm-table-wrap pm-rounded-table-wrap"><table class="pm-table pm-edit-table pm-testing-table"><thead><tr><th>#</th><th>Activity</th><th>Status</th><th>Comments</th><th class="pm-delete-col"><span class="sr-only">Delete</span></th></tr></thead><tbody>${project.testingItems.map((item, index) => `<tr><td>${index + 1}</td><td><input class="pm-inline-edit pm-bold-edit" data-pm-item="testingItems" data-pm-index="${index}" data-pm-field="activity" value="${esc(item.activity)}"></td><td>${statusSelect("testingItems", index, "status", ["Not Started", "Pending", "In Progress", "Finished"], item.status)}</td><td><textarea class="pm-inline-edit pm-comment-edit" rows="1" data-pm-item="testingItems" data-pm-index="${index}" data-pm-field="comments">${esc(item.comments)}</textarea></td><td class="pm-delete-cell"><button class="pm-row-action pm-inline-row-delete" type="button" title="Delete testing row" aria-label="Delete testing row" data-pm-action="delete-row" data-pm-section="testingItems" data-pm-index="${index}"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6 6 8 8M14 6l-8 8"></path></svg></button></td></tr>`).join("")}</tbody></table></div></section>`;
  }

  function paymentTable(project, section) {
    const variation = section === "variationPayments";
    const rows = (project[section] || []).map((item, index) => {
      const label = item.milestone || `${section === "variationPayments" ? "variation payment" : "payment"} ${index + 1}`;
      const invoice = item.invoice;
      const invoicePending = invoice?.status === "review";
      const amountLocked = /^(received|paid)$/i.test(String(item.status || "").trim()) || Boolean(invoice);
      const paymentSection = variation ? "variation-payments" : "payments";
      const fileInput = `<input class="pm-invoice-file-input" type="file" accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,application/pdf,image/*" data-pm-invoice-input data-pm-section="${paymentSection}" data-pm-row-id="${esc(item.id)}" aria-label="Upload invoice for ${esc(label)}">`;
      const invoiceCell = invoice
        ? `<div class="pm-invoice-attached"><strong title="${esc(invoice.originalName)}">${esc(invoice.originalName)}</strong><div class="pm-invoice-meta"><small class="${invoicePending ? "pm-invoice-review-note" : ""}">${invoicePending ? "Needs review" : "Invoice confirmed"}</small><div class="pm-invoice-actions"><button type="button" data-pm-action="preview-invoice" data-pm-section="${paymentSection}" data-pm-row-id="${esc(item.id)}">Preview</button><button type="button" data-pm-action="download-invoice" data-pm-section="${paymentSection}" data-pm-row-id="${esc(item.id)}">Download</button>${invoicePending ? `<button type="button" class="pm-invoice-verify" data-pm-action="review-invoice" data-pm-section="${paymentSection}" data-pm-row-id="${esc(item.id)}">Verify</button>` : ""}</div></div></div>`
        : `<button type="button" class="pm-invoice-upload" data-pm-action="choose-invoice" data-pm-section="${paymentSection}" data-pm-row-id="${esc(item.id)}"><span aria-hidden="true">↑</span> Upload Invoice</button>${fileInput}`;
      const amountAttrs = amountLocked ? `disabled title="${invoicePending ? "Verify the invoice to confirm its amounts" : "Received amount is locked"}"` : "";
      return `<tr data-pm-payment-row><td>${index + 1}</td><td><input data-pm-item="${section}" data-pm-index="${index}" data-pm-field="milestone" value="${esc(item.milestone)}" aria-label="Payment details ${index + 1}"></td><td><input type="number" min="0" step="0.01" data-pm-item="${section}" data-pm-index="${index}" data-pm-field="amountWithoutVat" value="${esc(item.amountWithoutVat ?? "")}" aria-label="Amount without VAT for ${esc(label)}" ${amountAttrs}></td><td><input type="number" min="0" step="0.01" data-pm-item="${section}" data-pm-index="${index}" data-pm-field="amount" value="${esc(item.amount)}" aria-label="Amount including VAT for ${esc(label)}" ${amountAttrs}></td>${variation ? "" : `<td><output class="pm-payment-percentage">${item.amount === "" ? "" : `${paymentPercentage(item.amount, project.contractValue)}%`}</output></td>`}<td><input type="date" data-pm-item="${section}" data-pm-index="${index}" data-pm-field="dueDate" value="${esc(item.dueDate)}" aria-label="Payment date for ${esc(label)}" ${invoice ? "disabled" : ""}></td><td>${statusSelect(section, index, "status", ["Pending", "Proforma sent", "Received"], item.status === "Paid" ? "Received" : item.status, Boolean(invoice))}</td><td class="pm-invoice-cell">${invoiceCell}</td><td class="pm-delete-cell"><button class="pm-row-action pm-payment-delete" type="button" title="Delete payment row" aria-label="Delete ${esc(label)}" data-pm-action="delete-row" data-pm-section="${section}" data-pm-index="${index}"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6 6 8 8M14 6l-8 8"></path></svg></button></td></tr>`;
    }).join("");
    return `<div class="pm-table-wrap"><table class="pm-table pm-edit-table pm-payment-table${variation ? " pm-variation-table" : ""}"><colgroup><col span="${variation ? 7 : 8}"><col class="pm-payment-action-col"></colgroup><thead><tr><th>#</th><th>Payment Details</th><th>Amount (AED) Without VAT</th><th>Amount (AED) Incl VAT</th>${variation ? "" : "<th>%</th>"}<th>Payment Date</th><th>Status</th><th>Upload Invoice</th><th class="pm-delete-col"></th></tr></thead><tbody>${rows || `<tr><td colspan="${variation ? 8 : 9}" class="pm-table-empty">No payment milestones yet.</td></tr>`}</tbody></table></div>`;
  }

  function paymentTab(project) {
    const variation = (project.variationPayments || []).length
      ? `<section class="pm-panel pm-payment-panel"><div class="pm-panel-head"><div><h2>Variation Payment</h2><p>The outstanding variation payment is ${Number(project.variationContractValue) > 0 ? `<strong class="pm-payment-outstanding">${moneyWithCents(variationPaymentOutstanding(project))} Incl VAT</strong>` : "not specified (set the variation contract value)"}.</p></div></div>${paymentTable(project, "variationPayments")}</section>`
      : "";
    return `<div class="pm-payment-stack"><section class="pm-panel pm-payment-panel"><div class="pm-panel-head"><div><h2>Payment Terms</h2><p>The outstanding payment for the project is <strong class="pm-payment-outstanding">${moneyWithCents(project.derived.pendingPayment)} Incl VAT</strong>.</p></div><div class="pm-payment-actions"><button class="pm-secondary" data-pm-action="add-row" data-pm-section="variationPayments">＋ Add Variation Payment</button><button class="pm-secondary" data-pm-action="add-row" data-pm-section="payments">＋ Add Payment</button></div></div>${paymentTable(project, "payments")}</section>${variation}</div>`;
  }

  function refreshPaymentFeedback(project) {
    const received = Number((project.payments || []).reduce((sum, row) =>
      /^received$/i.test(String(row.status || "").trim()) ? sum + Number(row.amount || 0) : sum, 0).toFixed(2));
    const contractWithVat = vatInclusiveAmount(project.contractValue);
    const pending = Math.max(0, Number((contractWithVat - received).toFixed(2)));
    project.derived = { ...project.derived, receivedPayment: received,
      paymentStatus: `AED ${received.toLocaleString("en-AE", { maximumFractionDigits: 2 })} Received`, pendingPayment: pending };
    const paymentOutstanding = root.querySelector(".pm-payment-stack > .pm-payment-panel .pm-payment-outstanding");
    if (paymentOutstanding) paymentOutstanding.textContent = `${moneyWithCents(pending)} Incl VAT`;
    const variationOutstanding = root.querySelector(".pm-payment-stack > .pm-payment-panel:nth-child(2) .pm-payment-outstanding");
    if (variationOutstanding) variationOutstanding.textContent = `${moneyWithCents(variationPaymentOutstanding(project))} Incl VAT`;
    const stats = root.querySelectorAll(".pm-detail-kpis .pm-detail-stat");
    const paymentStat = stats[2];
    if (paymentStat) {
      paymentStat.querySelector("strong").textContent = project.derived.paymentStatus;
      const receivedPercent = contractWithVat ? Math.min(100, received / contractWithVat * 100) : 0;
      paymentStat.querySelector(".pm-mini-progress i").style.width = `${receivedPercent}%`;
      paymentStat.querySelector("small").textContent = contractWithVat ? `${Math.max(0, Math.round(100 - receivedPercent))}% Pending` : "Pending amount not specified";
    }
    const variationStat = stats[3];
    if (variationStat) {
      const variationReceived = variationPaymentReceived(project);
      const variationContractWithVat = vatInclusiveAmount(project.variationContractValue);
      const variationPercent = variationContractWithVat > 0 ? Math.min(100, variationReceived / variationContractWithVat * 100) : 0;
      variationStat.querySelector("strong").textContent = `${moneyWithCents(variationReceived)} Received`;
      variationStat.querySelector(".pm-mini-progress i").style.width = `${variationPercent}%`;
      variationStat.querySelector("small").textContent = variationContractWithVat > 0 ? `${Math.max(0, Math.round(100 - variationPercent))}% Pending` : "Variation contract value not set";
    }
  }

  function refreshPaymentRow(input, row, project) {
    const tableRow = input.closest("tr");
    if (!tableRow) return;
    if (["amount", "amountWithoutVat"].includes(input.dataset.pmField)) {
      const otherField = input.dataset.pmField === "amount" ? "amountWithoutVat" : "amount";
      const otherInput = tableRow.querySelector(`[data-pm-field="${otherField}"]`);
      if (otherInput) otherInput.value = row[otherField];
      const percentage = tableRow.querySelector(".pm-payment-percentage");
      if (percentage) percentage.textContent = row.amount === "" ? "" : `${paymentPercentage(row.amount, project.contractValue)}%`;
    }
    if (input.dataset.pmField === "status") {
      input.className = `pm-status-select pm-status-${statusClass(row.status)}`;
      const locked = /^(received|paid)$/i.test(String(row.status || "").trim()) || Boolean(row.invoice);
      tableRow.querySelectorAll('[data-pm-field="amount"], [data-pm-field="amountWithoutVat"]').forEach(field => { field.disabled = locked; });
    }
  }

  function invoicePath(section, rowId) {
    return `/api/project-management/projects/${encodeURIComponent(state.project.id)}/${section}/${encodeURIComponent(rowId)}/invoice`;
  }

  function paymentRow(section, rowId) {
    return state.project?.[section === "payments" ? "payments" : "variationPayments"]?.find(item => item.id === rowId);
  }

  function openInvoiceReview(section, rowId) {
    const row = paymentRow(section, rowId);
    if (row?.invoice?.status !== "review") return;
    state.modal = "invoice-review";
    root.insertAdjacentHTML("beforeend", `<div class="pm-modal-backdrop"><form class="pm-modal pm-small-modal pm-invoice-review-modal" data-pm-form="invoice-review" data-pm-section="${section}" data-pm-row-id="${esc(rowId)}"><div class="pm-modal-head"><div><h2>Verify invoice</h2><p>${esc(row.invoice.originalName)}</p></div><button type="button" class="pm-close" data-pm-action="close-modal" aria-label="Close">×</button></div><div class="pm-invoice-review-body"><p>${esc(row.invoice.reviewMessage || "Check the invoice against the values below before confirming.")}</p><button type="button" class="pm-secondary" data-pm-action="preview-invoice" data-pm-section="${section}" data-pm-row-id="${esc(rowId)}">Preview invoice</button><div class="pm-form-grid"><label>Amount (AED) Without VAT<input type="number" name="amountWithoutVat" min="0.01" step="0.01" required value="${esc(row.amountWithoutVat ?? "")}"></label><label>Amount (AED) Incl VAT<input type="number" name="amount" min="0.01" step="0.01" required value="${esc(row.amount ?? "")}"></label><label>Invoice Date<input type="date" name="dueDate" required value="${esc(row.dueDate || "")}"></label></div></div><div class="pm-modal-actions"><button type="button" class="pm-secondary" data-pm-action="close-modal">Cancel</button><button type="submit" class="pm-primary">Confirm Invoice</button></div></form></div>`);
  }

  async function uploadInvoice(input) {
    const file = input.files?.[0];
    if (!file || !state.project) return;
    const section = input.dataset.pmSection;
    const rowId = input.dataset.pmRowId;
    if (file.size > 15 * 1024 * 1024) { toast("Invoice file must be 15 MB or smaller"); return; }
    const key = `${section}:${rowId}`;
    if (state.invoiceBusy === key) return;
    state.invoiceBusy = key;
    const cell = input.closest(".pm-invoice-cell");
    cell?.classList.add("pm-invoice-processing");
    const button = cell?.querySelector('[data-pm-action="choose-invoice"]');
    if (button) { button.disabled = true; button.textContent = "Processing invoice..."; }
    try {
      await flushPaymentSave();
      const form = new FormData();
      form.append("file", file);
      state.project = await api(invoicePath(section, rowId), { method: "POST", body: form });
      renderDetail();
      if (paymentRow(section, rowId)?.invoice?.status === "review") {
        toast("Invoice needs verification");
        openInvoiceReview(section, rowId);
      } else toast("Invoice processed and payment received");
    } catch (error) {
      toast(error.message);
      renderDetail();
    } finally {
      state.invoiceBusy = "";
    }
  }

  function followUpsTab(project) {
    const rows = project.followUps.map((item, index) => `<tr><td>${date(item.date)}</td><td><strong>${esc(item.subject)}</strong><small>${esc(item.notes)}</small></td><td>${esc(item.assigned || "Unassigned")}</td><td>${pill(item.status)}</td><td>${pill(item.priority)}</td><td><button class="pm-followup-more" type="button" aria-label="More actions for ${esc(item.subject)}" aria-haspopup="menu" aria-expanded="false" data-pm-action="followup-menu" data-pm-index="${index}">⋯</button></td></tr>`).join("");
    return `<div class="pm-followups-layout"><section class="pm-panel pm-followups-main"><div class="pm-panel-head"><div><h2>Follow-ups</h2><p>Capture the next conversation or site action before it gets lost.</p></div><button class="pm-primary" data-pm-action="add-followup">＋ Add Follow-up</button></div><div class="pm-table-wrap"><table class="pm-table pm-followups-table"><thead><tr><th>Date</th><th>Subject</th><th>Assigned</th><th>Status</th><th>Priority</th><th aria-label="Actions"></th></tr></thead><tbody>${rows || `<tr><td colspan="6" class="pm-table-empty">No follow-ups yet.</td></tr>`}</tbody></table></div></section>${installationUpdatesPanel(project)}</div>`;
  }

  function filteredLpos() {
    const query = state.lpoSearch.trim().toLowerCase();
    if (!query) return state.lpoOrders || [];
    return (state.lpoOrders || []).filter(order => [
      order.poNo, order.poDate, date(order.poDate), order.supplierName,
      order.purchaseRepresentative, order.quotationNo, order.status,
      ...(order.items || []).flatMap(item => [item.description, item.modelNo])
    ].join(" ").toLowerCase().includes(query));
  }

  function lpoRows() {
    const orders = filteredLpos();
    const rows = orders.map((order, index) => `<tr><td>${index + 1}</td><td><button class="pm-lpo-link" type="button" data-pm-action="open-lpo" data-pm-lpo-id="${esc(order.id)}">${esc(order.poNo || "-")}</button><small>${date(order.poDate)}</small></td><td>${esc(order.supplierName || "-")}</td><td>${esc(order.purchaseRepresentative || "-")}</td><td>${Number(order.grandTotal || 0).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td><td>${pill(order.status)}</td><td><button class="pm-lpo-view" type="button" data-pm-action="view-lpo" data-pm-lpo-id="${esc(order.id)}" aria-label="View ${esc(order.poNo || "purchase order")}">View</button></td></tr>`).join("");
    const empty = state.lpoError
      ? `Could not load purchase orders. <button class="pm-link" type="button" data-pm-action="retry-lpos">Retry</button>`
      : state.lpoOrders ? state.lpoSearch.trim() ? "No LPOs match your search." : "No created purchase orders for this project." : "Loading purchase orders...";
    return rows || `<tr><td colspan="7" class="pm-table-empty">${empty}</td></tr>`;
  }

  function lpoFooter() {
    if (!state.lpoOrders || state.lpoError) return "";
    const orders = filteredLpos();
    const totalCents = orders.reduce((sum, order) => sum + Math.round(Number(order.grandTotal || 0) * 100), 0);
    const count = state.lpoSearch.trim() ? `${orders.length} of ${state.lpoOrders.length} LPOs` : `${orders.length} LPOs`;
    return `<tr><td colspan="4" class="pm-lpo-total-label"><strong>${state.lpoSearch.trim() ? "Filtered Total" : "Grand Total"}</strong><small>${count}</small></td><td class="pm-lpo-total-amount">${moneyWithCents(totalCents / 100)}</td><td colspan="2"></td></tr>`;
  }

  function lposTab() {
    return `<section class="pm-panel pm-lpo-panel"><div class="pm-panel-head"><div><h2>LPO's ${state.lpoOrders ? `<em>${state.lpoOrders.length}</em>` : ""}</h2><p>Purchase orders created for this project.</p></div><label class="pm-search pm-lpo-search"><span aria-hidden="true">⌕</span><input data-pm-lpo-search type="search" placeholder="Search LPOs..." aria-label="Search LPOs" value="${esc(state.lpoSearch)}"></label></div><div class="pm-table-wrap"><table class="pm-table pm-lpo-table"><thead><tr><th>#</th><th>LPO No. / Date</th><th>Supplier</th><th>Purchase Rep</th><th>Grand Total (AED)</th><th>Status</th><th>Action</th></tr></thead><tbody>${lpoRows()}</tbody><tfoot>${lpoFooter()}</tfoot></table></div></section>`;
  }

  function renderLpoResults() {
    const table = root.querySelector(".pm-lpo-table");
    if (!table) return;
    table.tBodies[0].innerHTML = lpoRows();
    table.tFoot.innerHTML = lpoFooter();
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
        && String(order.projectName || "").split(",").some(name => name.trim().replace(/\s+/g, " ").toLowerCase() === projectName)
      ).sort((a, b) => String(b.poDate || "").localeCompare(String(a.poDate || "")));
      state.lpoUploads = purchaseOrders.uploads || [];
    } catch (error) {
      if (request !== state.lpoRequest || state.project?.id !== project.id || state.tab !== "lpos") return;
      state.lpoError = error.message;
    }
    const heading = root.querySelector(".pm-lpo-panel h2");
    if (heading && state.lpoOrders) heading.innerHTML = `LPO's <em>${state.lpoOrders.length}</em>`;
    renderLpoResults();
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
    state.engineerUsers = state.loginUsers;
    state.selectedEngineers = Array.isArray(project.projectEngineers) ? project.projectEngineers.map(item => ({ id: item.id, name: item.name })) : [];
    state.requiredEngineerId = "";
    if (!project.id && ["mts", "poonly"].includes(String(state.loginUser?.role || "").toLowerCase().replace(/\s+/g, ""))) {
      state.requiredEngineerId = state.loginUser.id;
      state.selectedEngineers.push({ id: state.loginUser.id, name: state.loginUser.name });
    }
    state.engineerPickerOpen = false;
    root.insertAdjacentHTML("beforeend", `<div class="pm-modal-backdrop"><form class="pm-modal" data-pm-form="project"><div class="pm-modal-head"><div><h2>${project.id ? "Edit Project" : "New Project"}</h2><p>Start with the project identity. The standard HVAC checklists will be created automatically.</p></div><button type="button" class="pm-close" data-pm-action="close-modal">×</button></div><div class="pm-form-grid"><label>Project Code<input name="code" value="${esc(project.code)}" placeholder="Optional"></label><label>Project Name<input name="name" required value="${esc(project.name === "Untitled Project" ? "" : project.name)}"></label><label>Customer<input name="customer" value="${esc(project.customer)}"></label><label>Consultant<input name="consultant" value="${esc(project.consultant)}"></label><label>Contact Person<input name="contact" value="${esc(project.contact)}"></label><label>Phone<input name="phone" value="${esc(project.phone)}"></label><label>Email<input type="email" name="email" value="${esc(project.email)}"></label><label>Status<select name="status">${options(["Active", "On Hold", "Completed"], project.status || "Active")}</select></label><label class="wide">Location<input name="location" value="${esc(project.location)}"></label><div class="wide pm-engineer-field"><label for="pmEngineerSearch">Project Engineers</label><div class="pm-engineer-picker"><div class="pm-engineer-chips" data-pm-engineer-chips></div><input id="pmEngineerSearch" data-pm-engineer-search type="text" autocomplete="off" role="combobox" aria-autocomplete="list" aria-controls="pmEngineerOptions" aria-expanded="false" placeholder="Search Login Access names"><div id="pmEngineerOptions" class="pm-engineer-options" role="listbox" hidden></div></div></div><label>Contract Value (AED) Without VAT<input type="number" min="0" step="0.01" inputmode="decimal" name="contractValue" value="${esc(project.contractValue || "")}"></label><label>Target Handover<input type="date" name="targetHandover" value="${esc(project.targetHandover)}"></label><label>Variation Contract Value (AED) Without VAT<input type="number" min="0" step="0.01" inputmode="decimal" name="variationContractValue" value="${esc(project.variationContractValue || "")}"></label><label>Payment Note<input name="paymentSummary" value="${esc(project.paymentSummary)}"></label><label class="wide">Project Notes<textarea name="notes" rows="3">${esc(project.notes)}</textarea></label></div><div class="pm-modal-actions"><button type="button" class="pm-secondary" data-pm-action="close-modal">Cancel</button><button class="pm-primary" type="submit">${project.id ? "Save Changes" : "Create Project"}</button></div></form></div>`);
    root.lastElementChild.querySelector('[name="consultant"]').closest("label").insertAdjacentHTML("afterend",
      `<label>Contractor<input name="contractor" value="${esc(project.contractor)}"></label><label>Owner<input name="owner" value="${esc(project.owner)}"></label>`);
    renderEngineerPicker();
  }

  function renderEngineerPicker() {
    const search = root.querySelector("[data-pm-engineer-search]");
    if (!search) return;
    root.querySelector("[data-pm-engineer-chips]").innerHTML = state.selectedEngineers.map(user => `<span class="pm-engineer-chip">${esc(user.name)}${user.id === state.requiredEngineerId ? "" : `<button type="button" data-pm-action="remove-engineer" data-pm-engineer-id="${esc(user.id)}" aria-label="Remove ${esc(user.name)}">×</button>`}</span>`).join("");
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
    const users = [...state.loginUsers].sort((a, b) => a.name.localeCompare(b.name));
    state.followUpUsers = users;
    const nameMatches = users.filter(user => user.name.trim().toLowerCase() === String(item?.assigned || "").trim().toLowerCase());
    const selectedId = item?.assignedUserId || (nameMatches.length === 1 ? nameMatches[0].id : "");
    const hasSelection = users.some(user => user.id === selectedId);
    const legacySelection = Boolean(item?.assigned) && !hasSelection;
    const assigneeOptions = `<option value="" ${!selectedId && !legacySelection ? "selected" : ""}>Unassigned</option>${users.map(user => {
      const duplicateName = users.some(other => other.id !== user.id && other.name.toLowerCase() === user.name.toLowerCase());
      return `<option value="${esc(user.id)}" ${selectedId === user.id ? "selected" : ""}>${esc(user.name)}${duplicateName ? ` (${esc(user.email || user.id)})` : ""}</option>`;
    }).join("")}${legacySelection ? `<option value="__legacy__" selected>${esc(item.assigned)} (existing)</option>` : ""}`;
    root.insertAdjacentHTML("beforeend", `<div class="pm-modal-backdrop"><form class="pm-modal pm-small-modal" data-pm-form="followup" data-pm-index="${index ?? ""}"><div class="pm-modal-head"><div><h2>${item ? "Edit Follow-up" : "Add Follow-up"}</h2><p>Make the next action explicit.</p></div><button type="button" class="pm-close" data-pm-action="close-modal">×</button></div><div class="pm-form-grid"><label>Date<input type="date" name="date" required value="${esc(item?.date || "")}"></label><label>Assigned To<select name="assignedUserId" data-pm-followup-assignee>${assigneeOptions}</select></label><label class="wide">Subject<input name="subject" required placeholder="What needs to happen?" value="${esc(item?.subject || "")}"></label><label>Priority<select name="priority">${options(["High", "Medium", "Low"], item?.priority || "Medium")}</select></label><label>Status<select name="status">${options(["Pending", "In Progress", "Finished"], item?.status || "Pending")}</select></label><label class="wide">Notes<textarea name="notes" rows="3">${esc(item?.notes || "")}</textarea></label></div><div class="pm-modal-actions"><button type="button" class="pm-secondary" data-pm-action="close-modal">Cancel</button><button class="pm-primary" type="submit">${item ? "Save Changes" : "Add Follow-up"}</button></div></form></div>`);
  }

  function closeFollowUpMenu() {
    root.querySelector(".pm-followup-menu")?.remove();
    root.querySelector('[data-pm-action="followup-menu"][aria-expanded="true"]')?.setAttribute("aria-expanded", "false");
  }

  function cancelPendingPaymentSave() {
    if (!paymentSaveTimer) return;
    clearTimeout(paymentSaveTimer);
    paymentSaveTimer = null;
  }

  function reconcilePaymentView(projectId) {
    if (state.project?.id !== projectId) return;
    const visiblePayments = root.querySelectorAll(".pm-payment-table:not(.pm-variation-table) [data-pm-payment-row]").length;
    const visibleVariations = root.querySelectorAll(".pm-variation-table [data-pm-payment-row]").length;
    if (state.tab === "payment" && (visiblePayments !== state.project.payments.length || visibleVariations !== state.project.variationPayments.length)) renderDetail();
    else refreshPaymentFeedback(state.project);
  }

  function flushPaymentSave() {
    if (!paymentSaveTimer) return projectSaveQueue;
    cancelPendingPaymentSave();
    if (!state.project?.id) return projectSaveQueue;
    const projectId = state.project.id;
    return saveProjectPayload(projectPayload(state.project), "", { quiet: true }).then(() => reconcilePaymentView(projectId));
  }

  function schedulePaymentSave() {
    cancelPendingPaymentSave();
    paymentSaveTimer = setTimeout(() => flushPaymentSave().catch(error => toast(error.message)), 600);
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

  async function saveProjectPayload(payload, message = "Project updated", { quiet = false, renderOptimistic = false } = {}) {
    const projectId = state.project?.id;
    if (!projectId) {
      state.project = await api("/api/project-management/projects", { method: "POST", body: JSON.stringify(payload) });
      toast(message);
      renderDetail();
      return;
    }
    const version = ++projectSaveVersion;
    const previous = state.project;
    state.project = { ...previous, ...payload };
    if (renderOptimistic) renderDetail();
    const request = projectSaveQueue.then(() => api(`/api/project-management/projects/${encodeURIComponent(projectId)}`, { method: "PUT", body: JSON.stringify(payload) }));
    projectSaveQueue = request.catch(() => {});
    try {
      const response = await request;
      if (state.project?.id !== projectId || version !== projectSaveVersion) return;
      state.project = response;
      if (!quiet) { toast(message); renderDetail(); }
    } catch (error) {
      if (state.project?.id === projectId && version === projectSaveVersion) {
        state.project = await api(`/api/project-management/projects/${encodeURIComponent(projectId)}`).catch(() => previous);
        renderDetail();
      }
      throw error;
    }
  }

  function projectPayload(project) {
    const { derived: _derived, ...payload } = project;
    return payload;
  }

  function newBoqRow(categoryId) {
    return { id: crypto.randomUUID(), categoryId, itemNo: "", item: "", unit: "", boqQty: "", rate: "", remarks: "",
      lpoQty: "", deliveredQty: "", installedQty: "", comments: "", lpo_status: "not_started",
      delivered_status: "not_started", installation_status: "not_started", progress: 0 };
  }

  async function updateProjectGrid(input) {
    const next = structuredClone(state.project);
    if (input.matches("[data-pm-category-name]")) {
      const category = next.boqCategories.find(item => item.id === input.dataset.pmCategoryId);
      if (!category || category.name === input.value.trim()) return;
      category.name = input.value.trim();
    } else {
      const item = next.installationItems.find(row => row.id === input.dataset.pmRowId);
      const field = input.dataset.pmGridField;
      if (!item) return;
      if (field === "description") {
        const prefix = item.itemNo ? `${item.itemNo} ` : "";
        const description = [item.itemNo, item.item].filter(Boolean).join(" ");
        if (input.value === description) return;
        if (prefix && input.value.startsWith(prefix)) item.item = input.value.slice(prefix.length);
        else { item.itemNo = ""; item.item = input.value; }
        await saveProjectPayload(projectPayload(next), "BOQ saved", { quiet: true });
        return;
      }
      const value = ["boqQty", "rate", "lpoQty", "deliveredQty", "installedQty"].includes(field)
        ? (input.value === "" ? "" : Math.max(0, Number(input.value))) : input.value;
      if (item[field] === value) return;
      item[field] = value;
    }
    await saveProjectPayload(projectPayload(next), "BOQ saved", { quiet: true });
  }

  async function importProjectBoq(input) {
    const file = input.files?.[0];
    input.value = "";
    if (!file || state.boqImportBusy) return;
    if (file.size > 5 * 1024 * 1024) { toast("BOQ file must be 5 MB or smaller"); return; }
    state.boqImportBusy = true;
    const button = root.querySelector('[data-pm-action="choose-boq-import"]');
    if (button) { button.disabled = true; button.textContent = "Importing..."; }
    try {
      await flushPaymentSave();
      const form = new FormData();
      form.append("file", file);
      state.project = await api(`/api/project-management/projects/${encodeURIComponent(state.project.id)}/boq/import`, { method: "POST", body: form });
      state.collapsedBoqCategories.clear();
      renderDetail();
      toast("BOQ imported");
    } catch (error) {
      if (button?.isConnected) { button.disabled = false; button.textContent = "↑ Import BOQ"; }
      toast(error.message);
    } finally { state.boqImportBusy = false; }
  }

  function renderProjectGridRows() {
    const tbody = root.querySelector(".pm-quantity-table tbody");
    if (tbody && state.project) tbody.innerHTML = projectGridRows(state.project, state.tab);
  }

  function clearGridDrag() {
    root.querySelectorAll(".pm-grid-dragging, .pm-grid-drop-before, .pm-grid-drop-after, .pm-grid-drop-category, .pm-grid-drop-target")
      .forEach(row => row.classList.remove("pm-grid-dragging", "pm-grid-drop-before", "pm-grid-drop-after", "pm-grid-drop-category", "pm-grid-drop-target"));
    gridDragItemId = "";
    gridDragCategoryId = "";
  }

  function gridDropLocation(event) {
    const row = event.target.closest("tr[data-pm-grid-row], tr[data-pm-grid-category]");
    if (!row || !root.contains(row)) return null;
    if (gridDragCategoryId) {
      if (!row.dataset.pmGridCategory || row.dataset.pmGridCategory === gridDragCategoryId) return null;
      const after = event.clientY > row.getBoundingClientRect().top + row.getBoundingClientRect().height / 2;
      let marker = row;
      if (after) while (marker.nextElementSibling && !marker.nextElementSibling.dataset.pmGridCategory) marker = marker.nextElementSibling;
      return { row: marker, targetRow: row, categoryId: row.dataset.pmGridCategory, after };
    }
    if (row.dataset.pmGridCategory) return { row, categoryId: row.dataset.pmGridCategory };
    if (row.dataset.pmGridRow === gridDragItemId) return null;
    const after = event.clientY > row.getBoundingClientRect().top + row.getBoundingClientRect().height / 2;
    return { row, targetId: row.dataset.pmGridRow, after };
  }

  function moveProjectGridRow(sourceId, destination) {
    const next = structuredClone(state.project);
    const before = next.installationItems.map(item => `${item.id}:${item.categoryId}`);
    const sourceIndex = next.installationItems.findIndex(item => item.id === sourceId);
    if (sourceIndex < 0) return null;
    const [source] = next.installationItems.splice(sourceIndex, 1);
    if (destination.targetId) {
      const targetIndex = next.installationItems.findIndex(item => item.id === destination.targetId);
      if (targetIndex < 0) return null;
      source.categoryId = next.installationItems[targetIndex].categoryId;
      next.installationItems.splice(targetIndex + Number(destination.after), 0, source);
    } else {
      if (!next.boqCategories.some(category => category.id === destination.categoryId)) return null;
      source.categoryId = destination.categoryId;
      const firstIndex = next.installationItems.findIndex(item => item.categoryId === destination.categoryId);
      next.installationItems.splice(firstIndex < 0 ? next.installationItems.length : firstIndex, 0, source);
    }
    const unchanged = before.every((entry, index) => entry === `${next.installationItems[index].id}:${next.installationItems[index].categoryId}`);
    return unchanged ? null : next;
  }

  function moveProjectGridCategory(sourceId, destination) {
    const next = structuredClone(state.project);
    const sourceIndex = next.boqCategories.findIndex(category => category.id === sourceId);
    if (sourceIndex < 0) return null;
    const [source] = next.boqCategories.splice(sourceIndex, 1);
    const targetIndex = next.boqCategories.findIndex(category => category.id === destination.categoryId);
    if (targetIndex < 0) return null;
    next.boqCategories.splice(targetIndex + Number(destination.after), 0, source);
    return next.boqCategories.every((category, index) => category.id === state.project.boqCategories[index].id) ? null : next;
  }

  root.addEventListener("dragstart", event => {
    const handle = event.target.closest("[data-pm-grid-handle], [data-pm-grid-category-handle]");
    if (!handle || !state.project) return;
    gridDragItemId = handle.dataset.pmGridHandle || "";
    gridDragCategoryId = handle.dataset.pmGridCategoryHandle || "";
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", gridDragItemId || gridDragCategoryId);
    handle.closest("tr")?.classList.add("pm-grid-dragging");
  });
  root.addEventListener("dragover", event => {
    if (!gridDragItemId && !gridDragCategoryId) return;
    const destination = gridDropLocation(event);
    root.querySelectorAll(".pm-grid-drop-before, .pm-grid-drop-after, .pm-grid-drop-category, .pm-grid-drop-target")
      .forEach(row => row.classList.remove("pm-grid-drop-before", "pm-grid-drop-after", "pm-grid-drop-category", "pm-grid-drop-target"));
    if (!destination) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    destination.row.classList.add(gridDragCategoryId || destination.targetId ? destination.after ? "pm-grid-drop-after" : "pm-grid-drop-before" : "pm-grid-drop-category");
    destination.targetRow?.classList.add("pm-grid-drop-target");
    const scroller = root.closest(".projects-view");
    if (scroller && scroller.scrollHeight > scroller.clientHeight) {
      const bounds = scroller.getBoundingClientRect();
      const distance = event.clientY < bounds.top + 48 ? -12 : event.clientY > bounds.bottom - 48 ? 12 : 0;
      if (distance) scroller.scrollTop += distance;
    }
  });
  root.addEventListener("drop", event => {
    if (!gridDragItemId && !gridDragCategoryId) return;
    const destination = gridDropLocation(event);
    if (!destination) { clearGridDrag(); return; }
    event.preventDefault();
    const sourceId = gridDragItemId;
    const sourceCategoryId = gridDragCategoryId;
    clearGridDrag();
    if (sourceCategoryId) {
      const next = moveProjectGridCategory(sourceCategoryId, destination);
      if (next) saveProjectPayload(projectPayload(next), "Category moved", { quiet: true, renderOptimistic: true }).catch(error => toast(error.message));
      return;
    }
    const next = moveProjectGridRow(sourceId, destination);
    if (!next) return;
    state.collapsedBoqCategories.delete(destination.categoryId || next.installationItems.find(item => item.id === sourceId)?.categoryId);
    saveProjectPayload(projectPayload(next), "Item moved", { quiet: true, renderOptimistic: true }).catch(error => toast(error.message));
  });
  root.addEventListener("dragend", clearGridDrag);

  async function updateItem(input) {
    if (!state.project) return;
    const collection = input.dataset.pmItem;
    const index = Number(input.dataset.pmIndex);
    const field = input.dataset.pmField;
    const next = structuredClone(state.project);
    if (!next[collection]?.[index]) return;
    const payment = ["payments", "variationPayments"].includes(collection);
    if (payment && next[collection][index].invoice && field !== "milestone") return;
    if (payment && ["amount", "amountWithoutVat"].includes(field) && /^(received|paid)$/i.test(String(next[collection][index].status || "").trim())) return;
    next[collection][index][field] = input.value;
    if (payment && ["amount", "amountWithoutVat"].includes(field)) {
      const row = next[collection][index];
      if (field === "amountWithoutVat") row.amount = input.value === "" ? "" : Number((Number(input.value) * 1.05).toFixed(2));
      else row.amountWithoutVat = input.value === "" ? "" : Number((Number(input.value) / 1.05).toFixed(2));
      row.percentage = paymentPercentage(row.amount, Number(next.contractValue || 0));
    }
    if (payment) {
      refreshPaymentRow(input, next[collection][index], next);
      refreshPaymentFeedback(next);
      state.project = next;
      projectSaveVersion++;
      schedulePaymentSave();
      return;
    }
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
      if (state.tab === "payment") flushPaymentSave().catch(error => toast(error.message));
      state.tab = target.dataset.pmTab;
      renderDetail();
      if (state.tab === "lpos") await loadProjectLpos();
      return;
    }
    const action = target.dataset.pmAction;
    if (action === "toggle-submittal-menu") { toggleSubmittalMenu(); return; }
    if (action === "show-submittal-kind") { state.submittalKind = target.dataset.pmKind; renderDetail(); return; }
    if (action === "toggle-submittal-history") {
      const id = target.dataset.pmSubId;
      if (state.expandedSubmittals.has(id)) state.expandedSubmittals.delete(id);
      else state.expandedSubmittals.add(id);
      renderSubmittalRows(); return;
    }
    if (action === "add-submittal") return addSubmittalRow().catch(error => toast(error.message));
    if (action === "delete-submittal-row") return deleteSubmittalRow(target.dataset.pmSubId).catch(error => toast(error.message));
    if (action === "new-submittal-revision") return addSubmittalRevision(target.dataset.pmSubId).catch(error => toast(error.message));
    if (action === "delete-submittal-revision") return deleteSubmittalRevision(target.dataset.pmSubId, target.dataset.pmRevisionId).catch(error => toast(error.message));
    if (action === "choose-submittal-file") { target.parentElement.querySelector("[data-pm-sub-file]")?.click(); return; }
    if (action === "choose-submittal-import") { closeSubmittalMenu(); root.querySelector("[data-pm-sub-import]")?.click(); return; }
    if (action === "download-submittal-log") {
      closeSubmittalMenu();
      window.open(`/api/project-management/projects/${encodeURIComponent(state.project.id)}/submittals/log`, "_blank", "noopener");
      return;
    }
    if (action === "toggle-boq-category") {
      const id = target.dataset.pmCategoryId;
      if (state.collapsedBoqCategories.has(id)) state.collapsedBoqCategories.delete(id);
      else state.collapsedBoqCategories.add(id);
      renderProjectGridRows();
      return;
    }
    if (action === "add-boq-category" || action === "add-boq-row") {
      const next = structuredClone(state.project);
      let categoryId = target.dataset.pmCategoryId;
      if (action === "add-boq-category") {
        categoryId = crypto.randomUUID();
        next.boqCategories.push({ id: categoryId, name: "" });
      }
      const row = newBoqRow(categoryId);
      const lastIndex = next.installationItems.findLastIndex(item => item.categoryId === categoryId);
      next.installationItems.splice(lastIndex < 0 ? next.installationItems.length : lastIndex + 1, 0, row);
      if (state.tab === "boq") state.boqSearch = "";
      else state.installationSearch = "";
      state.collapsedBoqCategories.delete(categoryId);
      const saving = saveProjectPayload(projectPayload(next), "Item added", { quiet: true, renderOptimistic: true });
      root.querySelector(action === "add-boq-category" ? `[data-pm-category-name][data-pm-category-id="${categoryId}"]` : `[data-pm-grid-row="${row.id}"] input`)?.focus();
      await saving.catch(error => toast(error.message));
      return;
    }
    if (action === "delete-boq-row" || action === "delete-boq-category") {
      const category = state.project.boqCategories.find(item => item.id === target.dataset.pmCategoryId);
      const message = action === "delete-boq-category" ? `Delete ${category?.name || "this category"} and its items?` : "Delete this BOQ item?";
      if (!confirm(message)) return;
      const next = structuredClone(state.project);
      if (action === "delete-boq-category") {
        next.boqCategories = next.boqCategories.filter(item => item.id !== target.dataset.pmCategoryId);
        next.installationItems = next.installationItems.filter(item => item.categoryId !== target.dataset.pmCategoryId);
      } else next.installationItems = next.installationItems.filter(item => item.id !== target.dataset.pmRowId);
      await saveProjectPayload(projectPayload(next), "Item deleted").catch(error => toast(error.message));
      return;
    }
    if (action === "choose-boq-import") { root.querySelector("[data-pm-boq-file]")?.click(); return; }
    if (action === "choose-invoice") {
      const input = root.querySelector(`[data-pm-invoice-input][data-pm-section="${target.dataset.pmSection}"][data-pm-row-id="${target.dataset.pmRowId}"]`);
      input?.click();
      return;
    }
    if (action === "preview-invoice" || action === "download-invoice") {
      const url = invoicePath(target.dataset.pmSection, target.dataset.pmRowId) + (action === "download-invoice" ? "?download=1" : "");
      window.open(url, "_blank", "noopener");
      return;
    }
    if (action === "review-invoice") return openInvoiceReview(target.dataset.pmSection, target.dataset.pmRowId);
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
      const variationNumber = section === "variationPayments" ? next.variationPayments.reduce((highest, item) => {
        const match = /^Variation\s+(\d+)$/i.exec(String(item.milestone || "").trim());
        return Math.max(highest, match ? Number(match[1]) : 0);
      }, next.variationPayments.length) + 1 : 0;
      const row = section === "submittals" ? { id: crypto.randomUUID(), item: "New Submittal", status: "Pending", comments: "" } : section === "installationItems" ? { id: crypto.randomUUID(), item: "New Work Item", lpo_status: "not_started", delivered_status: "not_started", installation_status: "not_started", progress: 0, comments: "" } : section === "testingItems" ? { id: crypto.randomUUID(), activity: "New Activity", status: "Not Started", comments: "" } : { id: crypto.randomUUID(), milestone: section === "variationPayments" ? `Variation ${variationNumber}` : "New Milestone", percentage: 0, amountWithoutVat: "", amount: "", dueDate: "", status: "Pending", comments: "" };
      next[section].push(row);
      if (["payments", "variationPayments"].includes(section)) {
        cancelPendingPaymentSave();
        await saveProjectPayload(projectPayload(next), "", { quiet: true, renderOptimistic: true })
          .then(() => reconcilePaymentView(next.id)).catch(error => toast(error.message));
      } else await saveProjectPayload(projectPayload(next), "Checklist row added");
      return;
    }
    if (action === "delete-row") {
      const section = target.dataset.pmSection;
      const index = Number(target.dataset.pmIndex);
      const row = state.project?.[section]?.[index];
      if (!row || !confirm(`Delete ${row.item || row.activity || row.milestone || "this row"}?`)) return;
      const next = structuredClone(state.project);
      next[section].splice(index, 1);
      if (["payments", "variationPayments"].includes(section)) {
        cancelPendingPaymentSave();
        await saveProjectPayload(projectPayload(next), "", { quiet: true, renderOptimistic: true })
          .then(() => reconcilePaymentView(next.id)).catch(error => toast(error.message));
      } else await saveProjectPayload(projectPayload(next), "Work item deleted");
      return;
    }
    if (action === "delete-project") {
      if (!confirm("Delete this project and its documents? This cannot be undone.")) return;
      await api(`/api/project-management/projects/${encodeURIComponent(state.project.id)}`, { method: "DELETE" });
      toast("Project deleted"); return window.showProjects();
    }
  }

  async function onChange(event) {
    const target = event.target;
    if (target.matches("[data-pm-sub-import]")) return importSubmittalLog(target);
    if (target.matches("[data-pm-sub-file]")) {
      const file = target.files?.[0];
      target.value = "";
      if (file) return uploadSubmittalFile(target.dataset.pmSubId, target.dataset.pmRevisionId, file).catch(error => toast(error.message));
      return;
    }
    if (target.matches("[data-pm-sub-field]")) return updateSubmittalField(target).catch(error => toast(error.message));
    if (target.matches("[data-pm-boq-file]")) return importProjectBoq(target);
    if (target.matches("[data-pm-grid-field], [data-pm-category-name]")) return updateProjectGrid(target).catch(error => toast(error.message));
    if (target.matches("[data-pm-invoice-input]")) return uploadInvoice(target);
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
    if (event.target.matches("[data-pm-sub-search]")) {
      state.submittalSearch = event.target.value;
      renderSubmittalRows();
      return;
    }
    if (event.target.matches("[data-pm-grid-search]")) {
      state[event.target.dataset.pmGridSearch === "boq" ? "boqSearch" : "installationSearch"] = event.target.value;
      renderProjectGridRows();
      return;
    }
    if (event.target.matches("[data-pm-grid-field]")) {
      const row = event.target.closest(".pm-grid-item");
      if (event.target.dataset.pmGridField === "boqQty" || event.target.dataset.pmGridField === "rate") {
        const qty = row?.querySelector('[data-pm-grid-field="boqQty"]')?.value;
        const rate = row?.querySelector('[data-pm-grid-field="rate"]')?.value;
        const amount = row?.querySelector("[data-pm-amount]");
        if (amount) amount.textContent = qty === "" || rate === "" ? "-" : moneyWithCents(Number(qty) * Number(rate));
      }
      if (event.target.dataset.pmGridField === "installedQty") {
        const item = state.project?.installationItems.find(candidate => candidate.id === event.target.dataset.pmRowId);
        const balance = row?.querySelector("[data-pm-balance]");
        if (item && balance) {
          const value = item.boqQty === "" ? null : Number(item.boqQty) - Number(event.target.value || 0);
          balance.textContent = value === null ? "-" : quantityDisplay(value);
          balance.className = `pm-grid-balance ${value === null ? "" : value <= 0 ? "done" : value <= Number(item.boqQty) * .25 ? "low" : "open"}`;
        }
      }
      return;
    }
    if (event.target.matches("[data-pm-lpo-search]")) {
      state.lpoSearch = event.target.value;
      renderLpoResults();
      return;
    }
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
    const submitButton = form.querySelector('button[type="submit"]');
    const submitLabel = submitButton?.textContent;
    if (submitButton && ["project", "followup", "invoice-review"].includes(form.dataset.pmForm)) {
      submitButton.disabled = true;
      submitButton.textContent = "Saving...";
    }
    try {
      if (form.dataset.pmForm === "invoice-review") {
        await flushPaymentSave();
        state.project = await api(`${invoicePath(form.dataset.pmSection, form.dataset.pmRowId)}/confirm`, {
          method: "POST", body: JSON.stringify({ ...data, invoiceId: paymentRow(form.dataset.pmSection, form.dataset.pmRowId)?.invoice?.id })
        });
        renderDetail();
        toast("Invoice verified and payment received");
      } else if (form.dataset.pmForm === "project") {
        const payload = { ...(state.project ? projectPayload(state.project) : {}), ...data, projectEngineers: state.selectedEngineers, contractValue: Number(data.contractValue || 0), variationContractValue: Number(data.variationContractValue || 0) };
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
    } catch (error) {
      if (submitButton?.isConnected) {
        submitButton.disabled = false;
        submitButton.textContent = submitLabel;
      }
      toast(error.message);
    }
  }

  root.addEventListener("click", onClick);
  root.addEventListener("focusin", event => {
    if (!event.target.matches("[data-pm-engineer-search]")) return;
    state.engineerPickerOpen = true;
    renderEngineerPicker();
  });
  root.addEventListener("keydown", event => {
    if (event.target.closest(".pm-submittals-menu") && ["ArrowDown", "ArrowUp"].includes(event.key)) {
      event.preventDefault();
      const items = [...root.querySelectorAll('.pm-submittals-menu [role="menuitem"]')];
      items[(items.indexOf(event.target) + (event.key === "ArrowDown" ? 1 : items.length - 1)) % items.length]?.focus();
      return;
    }
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
    if (!event.target.closest(".pm-submittals-more")) closeSubmittalMenu();
    if (!event.target.closest(".pm-followup-menu, [data-pm-action='followup-menu']")) closeFollowUpMenu();
    if (!event.target.closest(".pm-doc-menu, [data-pm-action='document-menu']")) closeDocumentMenu();
    if (!event.target.closest(".pm-engineer-picker")) {
      state.engineerPickerOpen = false;
      renderEngineerPicker();
    }
  });
  document.addEventListener("keydown", event => {
    if (event.key !== "Escape") return;
    if (root.querySelector('.pm-submittals-menu:not([hidden])')) {
      closeSubmittalMenu();
      root.querySelector('[data-pm-action="toggle-submittal-menu"]')?.focus();
      return;
    }
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
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushPaymentSave().catch(error => toast(error.message));
  });
  window.projectManagement = { open, prefetch,
    reset() { flushPaymentSave().catch(error => toast(error.message));
      cacheGeneration++; projectRequest++; state.dashboardRequest++; state.dashboard = null; state.dashboardQuery = "";
      state.project = null; projectCache.clear(); dashboardPrefetch = null; } };
})();
