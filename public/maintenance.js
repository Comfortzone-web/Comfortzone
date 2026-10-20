(() => {
  const root = document.querySelector("#maintenanceRoot");
  const state = {
    data: null, page: "dashboard", recordId: "", selectedContractId: "", contractTab: "Overview",
    selectedReportId: "", reportTab: "Report Details", selectedTechnicianId: "", reportMoreMenu: false,
    srUpload: null,
    reportFilterDraft: { range: "all", from: "", to: "", customer: "", site: "", technician: "", status: "all" },
    reportFilters: { range: "all", from: "", to: "", customer: "", site: "", technician: "", status: "all" },
    reportSort: "newest", reportPageSize: 10, reportPreviewFileId: "",
    technicianTab: "Overview", technicianDirectorySearch: "", technicianAvailability: "all", technicianSort: "name", technicianMoreMenu: false,
    month: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    selectedDate: "", scheduleView: "month", pmFiltersOpen: false, pmUpcomingOffset: 0, pmMenuId: "", dashboardMonth: null, dashboardScheduleRange: "week", dashboardCalendarView: "month",
    drawer: "", drawerId: "", scheduleDraft: null, accessLink: "", message: "",
    search: { dashboard: "", amc: "", schedule: "", "work-orders": "", technicians: "", reports: "" },
    status: { amc: "all", schedule: "all", "work-orders": "all", technicians: "all", reports: "all" },
    filters: { date: "", customer: "", site: "", technician: "", contract: "" },
    pageNumber: { amc: 1, schedule: 1, "work-orders": 1, technicians: 1, reports: 1 },
    pageSize: 10, sort: { page: "", key: "", direction: 1 },
    amcSort: "next-service", amcFiltersOpen: false, amcServiceBefore: "", amcMenuId: "", amcFullDetails: false,
    selectedWorkOrderId: "", workOrderTab: "Overview", workOrderMenuId: "", workOrderMenuLocation: "",
    workOrderDetailTab: "Overview", workOrderDetailMenu: false,
    workOrderDraft: { range: "all", from: "", to: "", status: "all", contract: "", customer: "", site: "", technician: "" },
    workOrderFilters: { range: "all", from: "", to: "", status: "all", contract: "", customer: "", site: "", technician: "" }
  };
  let lastRenderKey = "", lastRenderedDrawer = "", drawerReturnFocus = null;
  let lastLoadedAt = 0, latestRequest = 0, prefetchPromise = null, backgroundRefresh = null;
  const icon = (name, className = "") => `<img class="maint-icon ${className}" src="/assets/maintenance-icons/${name}.svg" alt="" aria-hidden="true">`;
  const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  const day = value => value ? new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${value.slice(0, 10)}T12:00:00`)) : "--";
  const reportDay = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) ? day(value) : (value || "--");
  const shortDay = value => value ? new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(`${value.slice(0, 10)}T12:00:00`)) : "--";
  const today = () => {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Dubai", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
    const part = type => parts.find(item => item.type === type).value;
    return `${part("year")}-${part("month")}-${part("day")}`;
  };
  state.selectedDate = today();
  state.dashboardMonth = new Date(`${state.selectedDate}T12:00:00`);
  state.dashboardMonth.setDate(1);
  const timeLabel = value => value ? new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", hour12: true }).format(new Date(`2000-01-01T${value}:00`)) : "--";
  const contract = id => state.data?.contracts.find(item => item.id === id);
  const job = id => state.data?.workOrders.find(item => item.id === id);
  const tech = id => state.data?.technicians.find(item => item.id === id);
  const visit = id => state.data?.visits.find(item => item.id === id);
  const report = id => state.data?.reports.find(item => item.id === id);
  const selected = (name, value) => name === value ? "selected" : "";
  const checked = value => value ? "checked" : "";

  async function request(url, options = {}) {
    const response = await fetch(url, { credentials: "same-origin", ...options,
      headers: options.body instanceof FormData ? undefined : { "Content-Type": "application/json", ...(options.headers || {}) } });
    if (!response.ok) {
      const problem = await response.json().catch(() => ({}));
      throw new Error(problem.error || `Request failed (${response.status})`);
    }
    return response.headers.get("Content-Type")?.includes("application/json") ? response.json() : response.blob();
  }

  async function refresh({ background = false } = {}) {
    const requestId = ++latestRequest;
    const data = await request("/api/maintenance/summary");
    if (requestId !== latestRequest) return;
    state.data = data;
    lastLoadedAt = Date.now();
    if (!background || !state.drawer) render();
  }

  function prefetch() {
    if (state.data) return Promise.resolve();
    if (!prefetchPromise) {
      const requestId = latestRequest;
      const pending = request("/api/maintenance/summary").then(data => {
        if (requestId === latestRequest && !state.data) {
          state.data = data;
          lastLoadedAt = Date.now();
        }
      }).finally(() => { if (prefetchPromise === pending) prefetchPromise = null; });
      prefetchPromise = pending;
    }
    return prefetchPromise;
  }

  async function open(page = "dashboard", recordId = "") {
    if (page === "work-orders" && recordId && recordId !== state.recordId) { state.workOrderDetailTab = "Overview"; state.workOrderDetailMenu = false; }
    if (page !== state.page || recordId !== state.recordId) {
      state.drawer = "";
      document.body.classList.remove("maint-drawer-open");
    }
    if (page !== state.page && !recordId) {
      if (page === "amc") state.selectedContractId = "";
      if (page === "reports") state.selectedReportId = "";
      if (page === "technicians") { state.selectedTechnicianId = ""; state.technicianTab = "Overview"; }
    }
    state.page = page;
    state.recordId = recordId;
    if (page === "amc" && recordId) state.selectedContractId = recordId;
    if (page === "reports" && recordId) {
      state.selectedReportId = recordId; state.reportTab = "Report Details"; state.status.reports = "all";
      state.reportFilterDraft = { range: "all", from: "", to: "", customer: "", site: "", technician: "", status: "all" };
      state.reportFilters = { ...state.reportFilterDraft }; state.search.reports = "";
    }
    if (page === "technicians" && recordId) {
      state.selectedTechnicianId = recordId; state.technicianTab = "Overview"; state.accessLink = "";
      state.status.technicians = "all"; state.technicianAvailability = "all";
      state.search.technicians = ""; state.technicianDirectorySearch = "";
    }
    if (state.data) {
      render();
      if (Date.now() - lastLoadedAt > 15000 && !backgroundRefresh) {
        const pending = refresh({ background: true }).catch(handleError).finally(() => { if (backgroundRefresh === pending) backgroundRefresh = null; });
        backgroundRefresh = pending;
      }
      return;
    }
    root.innerHTML = `<div class="maint-loading">Loading Maintenance...</div>`;
    try {
      if (prefetchPromise) await prefetchPromise.catch(() => {});
      if (state.data) render();
      else await refresh();
    }
    catch (error) { root.innerHTML = `<div class="maint-error">${esc(error.message)} <button data-action="refresh">Retry</button></div>`; }
  }

  function navigate(page, id = "") { window.showMaintenance(page, id); }
  function notice(message) {
    state.message = message;
    root.querySelector(".maint-toast")?.remove();
    root.querySelector(".maint-page")?.insertAdjacentHTML("beforeend", `<div class="maint-toast" role="status">${esc(message)}</div>`);
    window.setTimeout(() => { if (state.message === message) { state.message = ""; root.querySelector(".maint-toast")?.remove(); } }, 5000);
  }
  function handleError(error) { notice(error.message || "Unable to complete the action"); }
  function statusClass(value) {
    const text = String(value || "").toLowerCase();
    return text.includes("complete") || text.includes("approved") || text === "active" || text === "available" ? "green"
      : text.includes("site") || text.includes("pending") || text.includes("expir") || text.includes("revision") ? "amber"
      : text.includes("reject") || text.includes("cancel") || text.includes("overdue") || text.includes("failed") ? "red"
      : text.includes("draft") || text.includes("off duty") ? "slate" : "blue";
  }
  const badge = value => `<span class="maint-badge ${statusClass(value)}">${esc(value || "--")}</span>`;
  const linkButton = (text, action, id = "") => `<button class="maint-link" data-action="${action}" ${id ? `data-id="${esc(id)}"` : ""}>${esc(text)}</button>`;
  const empty = (message, label = "", action = "") => `<div class="maint-empty">${icon("clipboard-list")}<strong>${esc(message)}</strong>${label ? `<button class="maint-primary" data-action="${action}">${icon("plus")}${esc(label)}</button>` : ""}</div>`;
  const stack = (first, second) => `<span class="maint-stack"><strong>${esc(first || "--")}</strong><small>${esc(second || "")}</small></span>`;
  const iconButton = (name, title, action, id = "", disabled = false) => `<button class="maint-icon-button" title="${esc(title)}" aria-label="${esc(title)}" data-action="${action}" ${id ? `data-id="${esc(id)}"` : ""} ${disabled ? "disabled" : ""}>${icon(name)}</button>`;

  function header(title, subtitle, primaryLabel = "", primaryAction = "", searchPlaceholder = "", showDate = true) {
    return `<header class="maint-header"><div><h1>${esc(title)}</h1><p>${esc(subtitle)}</p></div>
      <div class="maint-header-actions">${searchPlaceholder ? `<label class="maint-search">${icon("search")}<input data-search="${esc(state.page)}" value="${esc(state.search[state.page] || "")}" placeholder="${esc(searchPlaceholder)}" aria-label="Search ${esc(title)}"></label>` : ""}
      ${showDate ? `<span class="maint-date">${icon("calendar-days")}${day(today())}</span>` : ""}
      ${primaryLabel ? `<button class="maint-primary" data-action="${primaryAction}">${icon("plus")}${esc(primaryLabel)}</button>` : ""}</div></header>`;
  }

  function kpi(label, value, iconName, tone, action = "", subtext = "") {
    return `<button class="maint-kpi ${tone}" ${action ? `data-action="${action}"` : "disabled"}>
      <span class="maint-kpi-icon">${icon(iconName)}</span><span><span class="maint-kpi-label">${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(subtext)}</small></span></button>`;
  }

  function panel(title, content, action = "", actionLabel = "View All", extraClass = "") {
    return `<section class="maint-panel ${extraClass}"><div class="maint-panel-head"><h2>${esc(title)}</h2>${action ? linkButton(actionLabel, action) : ""}</div>${content}</section>`;
  }

  function table(headers, rows, emptyMessage = "No records yet", sortKeys = []) {
    return `<div class="maint-table-wrap"><table class="maint-table"><thead><tr>${headers.map((item, index) => `<th>${sortKeys[index]
      ? `<button class="maint-sort" data-action="sort" data-key="${sortKeys[index]}">${esc(item)}${state.sort.page === state.page && state.sort.key === sortKeys[index] ? state.sort.direction === 1 ? " ↑" : " ↓" : ""}</button>`
      : esc(item)}</th>`).join("")}</tr></thead><tbody>${rows || `<tr><td colspan="${headers.length}" class="maint-table-empty">${esc(emptyMessage)}</td></tr>`}</tbody></table></div>`;
  }

  function paginate(items, pageKey) {
    const pageCount = Math.max(1, Math.ceil(items.length / state.pageSize));
    state.pageNumber[pageKey] = Math.max(1, Math.min(state.pageNumber[pageKey] || 1, pageCount));
    const current = state.pageNumber[pageKey];
    const start = (current - 1) * state.pageSize;
    return { items: items.slice(start, start + state.pageSize), footer: `<div class="maint-pagination"><span>Showing ${items.length ? start + 1 : 0} to ${Math.min(start + state.pageSize, items.length)} of ${items.length}</span><div>
      <label>Rows per page <select data-page-size><option ${selected(state.pageSize, 10)}>10</option><option ${selected(state.pageSize, 20)}>20</option><option ${selected(state.pageSize, 50)}>50</option></select></label>
      ${iconButton("chevron-left", "Previous page", "page-prev", "", current === 1)}
      <strong>${current} / ${pageCount}</strong>${iconButton("chevron-right", "Next page", "page-next", "", current === pageCount)}</div></div>` };
  }

  function filtered(items, page, fields) {
    const query = String(state.search[page] || "").toLowerCase().trim();
    const status = state.status[page] || "all";
    const filters = state.filters;
    const result = items.filter(item => {
      if (query && !fields.map(key => String(item[key] || "")).join(" ").toLowerCase().includes(query)) return false;
      if (status !== "all" && item.status !== status) return false;
      if (["work-orders", "reports", "schedule"].includes(page)) {
        if (filters.date && item.serviceDate !== filters.date) return false;
        if (filters.customer && !String(item.customerName || "").toLowerCase().includes(filters.customer.toLowerCase())) return false;
        if (filters.site && !String(item.site || "").toLowerCase().includes(filters.site.toLowerCase())) return false;
        if (filters.technician && !item.technicianIds?.includes(filters.technician)) return false;
        if (filters.contract && item.contractId !== filters.contract) return false;
      }
      return true;
    });
    const { key, direction, page: sortPage } = state.sort;
    if (key && sortPage === page) result.sort((a, b) => String(a[key] || "").localeCompare(String(b[key] || ""), undefined, { numeric: true }) * direction);
    return result;
  }

  function workOrderRow(item, compact = false) {
    const names = item.technicianIds.map(id => tech(id)?.name).filter(Boolean).join(", ");
    return compact ? `<tr><td><button class="maint-row-link" data-action="open-job" data-id="${item.id}">${esc(item.number)}</button></td>
      <td>${stack(item.customerName, item.site)}</td><td>${esc(names || "Unassigned")}</td><td>${shortDay(item.serviceDate)}</td><td>${badge(item.status)}</td>
      <td>${iconButton("eye", "View work order", "open-job", item.id)}</td></tr>`
      : `<tr><td><button class="maint-row-link" data-action="open-job" data-id="${item.id}">${esc(item.number)}</button></td>
      <td>${esc(item.customerName)}</td><td>${esc(item.site)}</td><td>${esc(contract(item.contractId)?.number || "--")}</td>
      <td>${stack(day(item.serviceDate), `${timeLabel(item.startTime)} - ${timeLabel(item.endTime)}`)}</td><td>${esc(names || "Unassigned")}</td>
      <td>${badge(item.status)}</td><td>${progress(item.status)}</td><td>${iconButton("eye", "View work order", "open-job", item.id)}${iconButton("ellipsis", "Edit work order", "edit-job", item.id)}</td></tr>`;
  }

  function progress(status) {
    const steps = ["Scheduled", "On Site", "Report Submitted", "Completed"];
    const level = Math.max(0, steps.indexOf(status));
    return `<div class="maint-progress" title="${esc(status)}">${steps.map((name, index) => `<span class="${index <= level ? status === "Completed" ? "done" : "current" : ""}">${index === 3 && status === "Completed" ? icon("check") : index + 1}</span>`).join("")}</div>`;
  }

  const pmDate = value => new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${value}T12:00:00`));
  const pmShortTime = value => value ? timeLabel(value) : "Time TBD";
  const pmWorkType = item => {
    const unitType = contract(item.contractId)?.units?.[0]?.type;
    return unitType ? `PM - ${unitType}` : "Preventive Maintenance";
  };
  const pmTechnicians = item => (item.technicianIds || []).map(id => tech(id)?.name).filter(Boolean);
  function pmData() {
    const jobs = filtered(state.data.workOrders.filter(item => item.workType === "Preventive Maintenance"), "schedule", ["number", "customerName", "site", "workType"]);
    const query = state.search.schedule.toLowerCase().trim();
    const planned = state.data.visits.filter(item => item.status === "Planned" && (!item.workOrderId || !job(item.workOrderId))).map(item => {
      const linked = contract(item.contractId);
      return { id: item.id, contractId: item.contractId, customerName: linked?.customerName || "AMC visit", site: linked?.site || "", serviceDate: item.plannedDate,
        startTime: "", endTime: "", status: "Pending", workType: "Preventive Maintenance", technicianIds: [], planned: true, number: linked?.number || "" };
    }).filter(item => {
      if (state.status.schedule !== "all" && state.status.schedule !== "Pending") return false;
      if (query && ![item.number, item.customerName, item.site].join(" ").toLowerCase().includes(query)) return false;
      if (state.filters.date && item.serviceDate !== state.filters.date) return false;
      if (state.filters.customer && !item.customerName.toLowerCase().includes(state.filters.customer.toLowerCase())) return false;
      if (state.filters.site && !item.site.toLowerCase().includes(state.filters.site.toLowerCase())) return false;
      if (state.filters.contract && item.contractId !== state.filters.contract) return false;
      if (state.filters.technician) return false;
      return true;
    });
    return { jobs, planned, events: [...jobs, ...planned].sort((a, b) => `${a.serviceDate} ${a.startTime || "99:99"}`.localeCompare(`${b.serviceDate} ${b.startTime || "99:99"}`)) };
  }
  const pmEventAction = item => item.planned ? "schedule-visit" : "open-job";
  const pmBadge = value => `<span class="pm-badge ${String(value).toLowerCase().replace(/[^a-z]+/g, "-")}">${esc(value)}</span>`;
  function pmEvent(item) {
    return `<button class="pm-event ${item.planned ? "pending" : String(item.status).toLowerCase().replace(/[^a-z]+/g, "-")}" data-action="${pmEventAction(item)}" data-id="${esc(item.id)}" title="${esc(`${item.startTime || "Time TBD"} ${item.customerName} - ${item.site}`)}"><i></i><span>${esc(item.startTime || "TBD")}</span><strong>${esc(item.customerName)}</strong></button>`;
  }
  function pmCalendar(events) {
    const current = state.selectedDate;
    const first = new Date(state.month.getFullYear(), state.month.getMonth(), 1);
    const monthLabel = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(first);
    const weekStart = shiftDay(current, -new Date(`${current}T12:00:00`).getDay());
    const title = state.scheduleView === "month" ? monthLabel : state.scheduleView === "week" ? `${day(weekStart)} - ${day(shiftDay(weekStart, 6))}` : pmDate(current);
    const viewButtons = ["month", "week", "day", "list"].map(view => `<button class="${state.scheduleView === view ? "active" : ""}" data-action="pm-view" data-view="${view}" aria-pressed="${state.scheduleView === view}">${view[0].toUpperCase() + view.slice(1)}</button>`).join("");
    const navigation = `<div class="pm-calendar-toolbar"><div class="pm-calendar-navigation">${iconButton("chevron-left", "Previous period", "pm-prev")}<h2>${esc(title)}</h2>${iconButton("chevron-right", "Next period", "pm-next")}<button class="pm-today" data-action="pm-today">Today</button></div><div class="pm-view-switch">${viewButtons}</div></div>`;
    const dateEvents = key => events.filter(item => item.serviceDate === key);
    if (state.scheduleView === "list") return navigation;
    if (state.scheduleView === "day") {
      const items = dateEvents(current);
      return `${navigation}<div class="pm-day-timeline">${items.length ? items.map(item => `<div class="pm-timeline-row"><time>${esc(pmShortTime(item.startTime))}</time><button data-action="${pmEventAction(item)}" data-id="${esc(item.id)}"><strong>${esc(item.customerName)}</strong><small>${esc(item.site)} · ${esc(pmWorkType(item))}</small></button>${pmBadge(item.status)}</div>`).join("") : `<div class="pm-empty-day">No preventive maintenance visits on this day.<button class="maint-outline" data-action="new-schedule-date">${icon("plus")} New Schedule</button></div>`}</div>`;
    }
    if (state.scheduleView === "week") {
      return `${navigation}<div class="pm-week-grid">${Array.from({ length: 7 }, (_, index) => {
        const key = shiftDay(weekStart, index), items = dateEvents(key);
        return `<div class="pm-week-day ${key === current ? "selected" : ""}"><button class="pm-week-heading" data-action="pm-select-date" data-date="${key}">${esc(new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(new Date(`${key}T12:00:00`)))} <strong>${Number(key.slice(-2))}</strong></button><div>${items.map(pmEvent).join("") || `<button class="pm-week-add" data-action="pm-empty-date" data-date="${key}">${icon("plus")} Schedule</button>`}</div></div>`;
      }).join("")}</div>`;
    }
    const offset = first.getDay(), count = Math.ceil((offset + new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()) / 7) * 7;
    const days = Array.from({ length: count }, (_, index) => new Date(first.getFullYear(), first.getMonth(), index - offset + 1));
    return `${navigation}<div class="pm-month-grid">${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(label => `<div class="pm-weekday">${label}</div>`).join("")}${days.map(date => {
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
      const items = dateEvents(key);
      return `<div class="pm-month-day ${date.getMonth() === first.getMonth() ? "" : "outside"} ${key === current ? "selected" : ""} ${key === today() ? "today" : ""}"><button class="pm-date-number" data-action="pm-select-date" data-date="${key}">${date.getDate()}</button><div class="pm-month-events">${items.slice(0, 2).map(pmEvent).join("")}${items.length > 2 ? `<button class="pm-more" data-action="pm-select-date" data-date="${key}">+${items.length - 2} more</button>` : ""}${!items.length ? `<button class="pm-empty-date" data-action="pm-empty-date" data-date="${key}" aria-label="Create schedule for ${pmDate(key)}"></button>` : ""}</div></div>`;
    }).join("")}</div>`;
  }

  const shiftDay = (value, amount) => {
    const date = new Date(`${value.slice(0, 10)}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + amount);
    return date.toISOString().slice(0, 10);
  };
  const monthEnd = value => new Date(Date.UTC(Number(value.slice(0, 4)), Number(value.slice(5, 7)), 0)).toISOString().slice(0, 10);
  const monthShift = (value, amount) => new Date(Date.UTC(Number(value.slice(0, 4)), Number(value.slice(5, 7)) - 1 + amount, 1)).toISOString().slice(0, 7);
  const dashBadge = value => `<span class="dash-badge ${String(value || "").toLowerCase().replace(/[^a-z]+/g, "-")}">${esc(value || "--")}</span>`;
  const dashAvatar = person => {
    const name = typeof person === "string" ? person : person?.name || "";
    const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join("").toUpperCase() || "?";
    const tone = (name.charCodeAt(0) || 0) % 4;
    return `<span class="dash-avatar tone-${tone}" title="${esc(name)}" aria-label="${esc(name)}">${esc(initials)}</span>`;
  };
  function dashSparkline(values) {
    const max = Math.max(1, ...values);
    const points = values.map((value, index) => [index * 100 / Math.max(1, values.length - 1), 28 - value * 21 / max]);
    const line = points.map(([x, y], index) => `${index ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
    return `<svg class="dash-sparkline" viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden="true"><path d="${line} L100 32 L0 32 Z" fill="currentColor" opacity=".11"/><path d="${line}" fill="none" stroke="currentColor" stroke-width="1.5" vector-effect="non-scaling-stroke"/></svg>`;
  }
  function dashKpi(label, value, previous, comparison, values, iconName, tone, action) {
    const difference = value - previous;
    const change = previous ? `${Math.abs(Math.round(difference / previous * 100))}%` : difference ? `${Math.abs(difference)}` : "0%";
    return `<button class="dash-kpi ${tone}" data-action="${action}" title="${esc(label)}: ${value}">
      <span class="dash-kpi-icon">${icon(iconName)}</span><span class="dash-kpi-copy"><span class="dash-kpi-label">${esc(label)}</span><strong>${value}</strong></span>
      <span class="dash-kpi-change ${difference < 0 ? "down" : difference === 0 ? "flat" : "up"}"><b>${difference < 0 ? "&#8600;" : difference > 0 ? "&#8599;" : "="} ${difference < 0 ? "-" : difference > 0 ? "+" : ""}${change}</b><small>${esc(comparison)}</small></span>
      ${dashSparkline(values)}</button>`;
  }
  function dashPanel(title, iconName, content, action = "", className = "") {
    return `<section class="dash-panel ${className}"><div class="dash-panel-head"><div>${icon(iconName)}<h2>${esc(title)}</h2></div>${action ? `<button class="dash-view-all" data-action="${action}">View All ${icon("chevron-right")}</button>` : ""}</div>${content}</section>`;
  }
  function dashCalendar() {
    const view = state.dashboardCalendarView;
    const anchor = state.selectedDate;
    const year = state.dashboardMonth.getFullYear(), month = state.dashboardMonth.getMonth();
    const first = new Date(year, month, 1), start = new Date(year, month, 1 - first.getDay());
    const monthDays = new Date(year, month + 1, 0).getDate();
    const cells = Array.from({ length: Math.ceil((first.getDay() + monthDays) / 7) * 7 }, (_, index) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + index));
    const weekStart = shiftDay(anchor, -new Date(`${anchor}T12:00:00Z`).getUTCDay());
    const weekDays = Array.from({ length: 7 }, (_, index) => shiftDay(weekStart, index));
    const formatMonth = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(first);
    const heading = view === "month" ? formatMonth : view === "week" ? `${day(weekStart)} - ${day(weekDays[6])}` : day(anchor);
    const marks = date => {
      const pm = state.data.workOrders.some(item => item.serviceDate === date && item.workType === "Preventive Maintenance");
      const other = state.data.workOrders.some(item => item.serviceDate === date && item.workType !== "Preventive Maintenance");
      const reports = state.data.reports.some(item => item.submittedAt?.startsWith(date));
      return `<span class="dash-cal-marks">${pm ? '<i class="blue"></i>' : ""}${other ? '<i class="green"></i>' : ""}${reports ? '<i class="orange"></i>' : ""}</span>`;
    };
    const cell = (key, label, outside = false) => `<button class="dash-cal-day ${outside ? "outside" : ""} ${key === anchor ? "selected" : ""} ${key === today() ? "today" : ""}" data-action="dash-select-date" data-date="${key}" aria-label="${day(key)}"><span>${label}</span>${marks(key)}</button>`;
    const viewedMonth = `${year}-${String(month + 1).padStart(2, "0")}`;
    const pmCount = state.data.workOrders.filter(item => item.serviceDate?.startsWith(viewedMonth) && item.workType === "Preventive Maintenance").length;
    const workCount = state.data.workOrders.filter(item => item.serviceDate?.startsWith(viewedMonth) && item.workType !== "Preventive Maintenance").length;
    const reportCount = state.data.reports.filter(item => item.submittedAt?.startsWith(viewedMonth)).length;
    const agenda = state.data.workOrders.filter(item => item.serviceDate === anchor).sort((a, b) => String(a.startTime).localeCompare(String(b.startTime)));
    return `<div class="dash-calendar-controls"><div><button class="dash-nav-button" data-action="dash-cal-prev" aria-label="Previous ${view}">${icon("chevron-left")}</button><button class="dash-nav-button" data-action="dash-cal-next" aria-label="Next ${view}">${icon("chevron-right")}</button><button class="dash-today" data-action="dash-cal-today">Today</button></div></div>
      <div class="dash-calendar-subhead"><strong>${esc(heading)}</strong><div class="dash-segment" role="group" aria-label="Calendar view">${["month", "week", "day"].map(mode => `<button class="${view === mode ? "active" : ""}" data-action="dash-cal-view" data-view="${mode}" aria-pressed="${view === mode}">${mode[0].toUpperCase() + mode.slice(1)}</button>`).join("")}</div></div>
      ${view === "day" ? `<div class="dash-day-agenda">${agenda.length ? agenda.map(item => `<button data-action="open-job" data-id="${esc(item.id)}"><span>${esc(timeLabel(item.startTime))}</span><strong title="${esc(item.customerName)}">${esc(item.customerName)}</strong>${dashBadge(item.status)}${icon("chevron-right")}</button>`).join("") : `<p>No work orders on ${day(anchor)}.</p>`}</div>`
        : `<div class="dash-calendar-grid ${view === "week" ? "week" : ""}">${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(label => `<span class="dash-cal-weekday">${label}</span>`).join("")}${view === "month" ? cells.map(date => { const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; return cell(key, date.getDate(), date.getMonth() !== month); }).join("") : weekDays.map(key => cell(key, Number(key.slice(8)))).join("")}</div>`}
      <div class="dash-calendar-legend"><span><i class="blue"></i> PM Visits (${pmCount})</span><span><i class="green"></i> Work Orders (${workCount})</span><span><i class="orange"></i> Reports (${reportCount})</span></div>`;
  }

  function dashboard() {
    const data = state.data, current = today(), currentMonth = current.slice(0, 7), previousMonth = monthShift(current, -1);
    const query = state.search.dashboard.trim().toLowerCase();
    const hits = query ? [
      ...data.contracts.map(item => ({ type: "AMC", label: item.number, detail: `${item.customerName} - ${item.site}`, action: "open-contract-search", id: item.id })),
      ...data.workOrders.map(item => ({ type: "Work Order", label: item.number, detail: `${item.customerName} - ${item.site}`, action: "open-job", id: item.id })),
      ...data.reports.map(item => ({ type: "Report", label: item.number, detail: job(item.workOrderId)?.customerName || "", action: "open-report", id: item.id })),
      ...data.technicians.map(item => ({ type: "Technician", label: item.name, detail: item.code, action: "open-technician-search", id: item.id }))
    ].filter(item => `${item.label} ${item.detail}`.toLowerCase().includes(query)).slice(0, 15) : [];
    const active = data.contracts.filter(item => item.status === "Active");
    const previousActive = active.filter(item => item.startDate <= monthEnd(previousMonth) && item.endDate >= monthEnd(previousMonth)).length;
    const visitsMonth = data.visits.filter(item => item.plannedDate?.startsWith(currentMonth)).length;
    const previousVisits = data.visits.filter(item => item.plannedDate?.startsWith(previousMonth)).length;
    const workToday = data.workOrders.filter(item => item.serviceDate === current).length;
    const workYesterday = data.workOrders.filter(item => item.serviceDate === shiftDay(current, -1)).length;
    const pending = data.reports.filter(item => item.status === "Pending Review").length;
    const previousPending = data.reports.filter(item => item.status === "Pending Review" && item.submittedAt?.slice(0, 10) < current).length;
    const expiryEnd = shiftDay(current, 30), priorExpiryStart = shiftDay(current, -30);
    const expiring = active.filter(item => item.endDate >= current && item.endDate <= expiryEnd).length;
    const previousExpiring = data.contracts.filter(item => item.endDate >= priorExpiryStart && item.endDate < current).length;
    const recent = [...data.workOrders].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0, 4);
    const newReports = [...data.reports].sort((a, b) => String(b.submittedAt).localeCompare(String(a.submittedAt))).slice(0, 4);
    const activity = [...data.activity].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 4);
    const selectedDate = state.selectedDate;
    const range = state.dashboardScheduleRange;
    const weekStart = shiftDay(selectedDate, -((new Date(`${selectedDate}T12:00:00Z`).getUTCDay() + 6) % 7));
    const rangeStart = range === "today" ? selectedDate : range === "week" ? weekStart : `${selectedDate.slice(0, 7)}-01`;
    const rangeEnd = range === "today" ? selectedDate : range === "week" ? shiftDay(weekStart, 6) : monthEnd(selectedDate.slice(0, 7));
    const scheduled = data.workOrders.filter(item => item.workType === "Preventive Maintenance" && item.serviceDate >= rangeStart && item.serviceDate <= rangeEnd)
      .sort((a, b) => `${a.serviceDate} ${a.startTime}`.localeCompare(`${b.serviceDate} ${b.startTime}`)).slice(0, 5);
    const monthlyCounts = Array.from({ length: 6 }, (_, index) => data.visits.filter(item => item.plannedDate?.startsWith(monthShift(current, index - 5))).length);
    const dayCounts = Array.from({ length: 7 }, (_, index) => data.workOrders.filter(item => item.serviceDate === shiftDay(current, index - 6)).length);
    const pendingCounts = Array.from({ length: 7 }, (_, index) => data.reports.filter(item => item.status === "Pending Review" && item.submittedAt?.startsWith(shiftDay(current, index - 6))).length);
    const activeCounts = Array.from({ length: 6 }, (_, index) => { const sample = shiftDay(current, (index - 5) * 7); return active.filter(item => item.startDate <= sample && item.endDate >= sample).length; });
    const expiryCounts = Array.from({ length: 6 }, (_, index) => active.filter(item => item.endDate >= shiftDay(current, index * 7) && item.endDate < shiftDay(current, (index + 1) * 7)).length);
    const pmRows = scheduled.map(item => {
      const people = item.technicianIds.map(id => tech(id)).filter(Boolean);
      const type = contract(item.contractId)?.units?.[0]?.type;
      return `<div class="dash-schedule-row"><span class="dash-date-badge"><strong>${esc(item.serviceDate.slice(8))}</strong><small>${esc(new Intl.DateTimeFormat("en-US", { month: "short" }).format(new Date(`${item.serviceDate}T12:00:00`)))}</small></span>
        <span class="dash-schedule-customer"><strong title="${esc(item.customerName)}">${esc(item.customerName)}</strong><small title="${esc(item.site)}">${icon("map-pin")}${esc(item.site)}</small></span>
        <span class="dash-schedule-tech"><span class="dash-avatar-stack">${people.slice(0, 2).map(dashAvatar).join("")}</span><small title="${esc(people.map(person => person.name).join(", "))}">${esc(people.map(person => person.name).join(", ") || "Unassigned")}</small></span>
        <span class="dash-schedule-type" title="${esc(type ? `PM - ${type}` : item.workType)}">${icon("wrench")}<span>${esc(type ? `PM - ${type}` : "PM Service")}</span></span>
        <span class="dash-schedule-time">${icon("clock-3")}${esc(timeLabel(item.startTime))}</span>${dashBadge(item.status)}
        ${iconButton("ellipsis", `View ${item.number}`, "open-job", item.id)}</div>`;
    }).join("");
    const recentRows = recent.map(item => { const people = item.technicianIds.map(id => tech(id)).filter(Boolean); return `<tr>
      <td><button class="maint-row-link" data-action="open-job" data-id="${esc(item.id)}">${esc(item.number)}</button></td>
      <td><span class="dash-cell-ellipsis" title="${esc(`${item.customerName} - ${item.site}`)}">${esc(item.customerName)} <small>- ${esc(item.site)}</small></span></td>
      <td><span class="dash-table-tech">${people[0] ? dashAvatar(people[0]) : ""}<span class="dash-cell-ellipsis" title="${esc(people.map(person => person.name).join(", "))}">${esc(people.map(person => person.name).join(", ") || "Unassigned")}</span></span></td>
      <td>${esc(shortDay(item.serviceDate))}</td><td>${dashBadge(item.status)}</td><td>${iconButton("ellipsis", `View ${item.number}`, "open-job", item.id)}</td></tr>`; }).join("");
    const reportRows = newReports.map(item => { const linked = job(item.workOrderId), author = tech(item.submittedBy); return `<button class="dash-report-row" data-action="open-report" data-id="${esc(item.id)}" title="Open ${esc(item.number)}">
      <span class="dash-report-icon">${icon("file-text")}</span><span class="dash-report-number"><strong>${esc(item.number)}</strong><small>${esc(shortDay(item.submittedAt))}</small></span>
      <span class="dash-report-customer"><strong title="${esc(linked?.customerName || item.details?.customerName || item.extracted?.customerName || "")}">${esc(linked?.customerName || item.details?.customerName || item.extracted?.customerName || "--")}</strong><small>${esc(item.type)}</small></span>
      <span class="dash-report-technician">${author ? dashAvatar(author) : ""}<span title="${esc(author?.name || "")}">${esc(author?.name || "--")}</span></span>${dashBadge(item.status)}${icon("chevron-right")}</button>`; }).join("");
    const activityRows = activity.map(item => {
      const action = item.kind === "workOrder" ? "open-job" : item.kind === "report" ? "open-report" : item.kind === "contract" ? "open-contract-search" : "";
      const elapsed = Math.max(0, Math.round((Date.now() - new Date(item.createdAt).getTime()) / 60000));
      const when = elapsed < 60 ? `${elapsed} min ago` : elapsed < 1440 ? `${Math.floor(elapsed / 60)} hr ago` : `${Math.floor(elapsed / 1440)} days ago`;
      return `<div class="dash-activity-row"><span class="dash-activity-icon ${esc(item.kind)}">${icon(item.kind === "report" ? "file-text" : item.kind === "contract" ? "calendar-days" : "bell")}</span><small>${when}</small>${action ? `<button data-action="${action}" data-id="${esc(item.targetId)}"><strong>${esc(item.message)}</strong><span>${esc(item.actor || "Maintenance")}</span></button>` : `<span class="dash-activity-copy"><strong>${esc(item.message)}</strong><span>${esc(item.actor || "Maintenance")}</span></span>`}</div>`;
    }).join("");
    const technicianCards = data.technicians.filter(item => item.active).slice(0, 4).map(person => {
      const checkedIn = data.attendance.find(row => row.technicianId === person.id && !row.checkOutAt);
      const checkInToday = data.attendance.find(row => row.technicianId === person.id && row.checkInAt?.startsWith(current));
      const todayJobs = data.workOrders.filter(item => item.serviceDate === current && item.technicianIds.includes(person.id));
      const site = checkedIn?.site || todayJobs[0]?.site || "--";
      const status = checkedIn ? "On Site" : person.offDuty ? "Off Duty" : todayJobs.length ? "Scheduled" : "Available";
      return `<button class="dash-technician-card" data-action="open-technician" data-id="${esc(person.id)}"><span class="dash-tech-head">${dashAvatar(person)}<span><strong title="${esc(person.name)}">${esc(person.name)}</strong>${dashBadge(status)}</span></span>
        <span class="dash-tech-meta">${icon("clock-3")}<span>${checkInToday ? esc(timeLabel(checkInToday.checkInAt?.slice(11, 16))) : "--"}<small>Check-in</small></span></span>
        <span class="dash-tech-meta">${icon("map-pin")}<span title="${esc(site)}">${esc(site)}<small>Current site</small></span><b>${todayJobs.length}<small>Jobs today</small></b></span></button>`;
    }).join("");
    return `<div class="maint-dashboard">${header("Maintenance Dashboard", "Monitor contracts, schedules, work orders and service performance.", "New Schedule", "new-schedule", "Search customer, site, work order, report...")}
      <div class="maint-body dash-body"><div class="dash-kpi-grid">
        ${dashKpi("Active AMC Contracts", active.length, previousActive, "vs last month", activeCounts, "file-text", "green", "go-amc")}
        ${dashKpi("PM Visits This Month", visitsMonth, previousVisits, "vs last month", monthlyCounts, "calendar-days", "blue", "go-schedule")}
        ${dashKpi("Work Orders Today", workToday, workYesterday, "vs yesterday", dayCounts, "wrench", "orange", "go-jobs-today")}
        ${dashKpi("Pending Reports", pending, previousPending, "new today", pendingCounts, "file-check-2", "purple", "go-pending-reports")}
        ${dashKpi("Contracts Expiring Soon", expiring, previousExpiring, "vs prior 30 days", expiryCounts, "clock-3", "red", "go-expiring")}
      </div>
      ${query ? panel(`Search Results (${hits.length})`, table(["Type", "Record", "Customer / Site"], hits.map(item => `<tr><td>${esc(item.type)}</td><td><button class="maint-row-link" data-action="${item.action}" data-id="${esc(item.id)}">${esc(item.label)}</button></td><td>${esc(item.detail)}</td></tr>`).join(""), "No matching maintenance records"), "", "", "dash-search-results") : ""}
      <div class="dash-layout-top">${dashPanel("Upcoming PM Schedule", "calendar-days", `<div class="dash-schedule-toolbar"><div class="dash-segment" role="group" aria-label="Schedule range">${[["today", "Today"], ["week", "This Week"], ["month", "This Month"]].map(([value, label]) => `<button class="${range === value ? "active" : ""}" data-action="dash-range" data-range="${value}" aria-pressed="${range === value}">${label}</button>`).join("")}</div><label class="dash-date-picker">${icon("calendar-days")}<input type="date" data-dash-date value="${esc(selectedDate)}" aria-label="Schedule date"></label></div>
        <div class="dash-schedule-list">${pmRows || `<div class="dash-empty">No preventive maintenance visits in this period.</div>`}</div>`, "go-schedule", "dash-schedule-panel")}
        ${dashPanel("Schedule Calendar", "calendar-days", dashCalendar(), "", "dash-calendar-panel")}</div>
      <div class="dash-layout-middle">${dashPanel("Recent Work Orders", "wrench", `<div class="dash-table-wrap"><table class="dash-work-table"><colgroup><col style="width:12%"><col style="width:27%"><col style="width:21%"><col style="width:16%"><col style="width:17%"><col style="width:7%"></colgroup><thead><tr><th>WO No.</th><th>Customer / Site</th><th>Technicians</th><th>Service Date</th><th>Status</th><th>Action</th></tr></thead><tbody>${recentRows || '<tr><td colspan="6" class="dash-empty">No work orders yet.</td></tr>'}</tbody></table></div>`, "go-work-orders", "dash-work-panel")}
        ${dashPanel("New Service Reports", "file-text", `<div class="dash-reports-list">${reportRows || '<div class="dash-empty">No service reports submitted yet.</div>'}</div>`, "go-reports", "dash-reports-panel")}</div>
      <div class="dash-layout-bottom">${dashPanel("Technician Notifications", "bell", `<div class="dash-activity-list">${activityRows || '<div class="dash-empty">No recent maintenance activity.</div>'}</div>`, "go-technicians", "dash-notifications-panel")}
        ${dashPanel("Technician Attendance & Status", "users-round", `<div class="dash-technician-grid">${technicianCards || '<div class="dash-empty">No technicians added yet.</div>'}</div>`, "go-technicians", "dash-attendance-panel")}</div></div></div>`;
  }

  function contractStatus(item) {
    if (item.status !== "Active") return item.status;
    return item.endDate >= today() && item.endDate <= new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10) ? "Expiring Soon" : item.status;
  }

  function amc() {
    const all = state.data.contracts, current = today(), month = current.slice(0, 7), previousMonth = monthShift(current, -1);
    const nextFor = item => state.data.visits.filter(row => row.contractId === item.id && row.status !== "Completed" && row.plannedDate >= current).sort((a, b) => a.plannedDate.localeCompare(b.plannedDate))[0];
    const query = state.search.amc.trim().toLowerCase();
    const counts = { all: all.length, Active: all.filter(item => contractStatus(item) === "Active").length,
      "Expiring Soon": all.filter(item => contractStatus(item) === "Expiring Soon").length,
      "Upcoming Service": all.filter(item => { const date = nextFor(item)?.plannedDate; return date && date <= shiftDay(current, 30); }).length };
    const visible = all.filter(item => {
      const nextDate = nextFor(item)?.plannedDate;
      if (query && ![item.number, item.customerName, item.site, item.contact].join(" ").toLowerCase().includes(query)) return false;
      if (state.status.amc === "Upcoming Service" && (!nextDate || nextDate > shiftDay(current, 30))) return false;
      if (state.status.amc !== "all" && state.status.amc !== "Upcoming Service" && contractStatus(item) !== state.status.amc) return false;
      return !state.amcServiceBefore || (nextDate && nextDate <= state.amcServiceBefore);
    }).sort((a, b) => {
      if (state.amcSort === "customer") return a.customerName.localeCompare(b.customerName);
      if (state.amcSort === "end-date") return String(a.endDate).localeCompare(String(b.endDate));
      if (state.amcSort === "number") return a.number.localeCompare(b.number, undefined, { numeric: true });
      return String(nextFor(a)?.plannedDate || "9999").localeCompare(String(nextFor(b)?.plannedDate || "9999"));
    });
    const selectedContract = state.selectedContractId === null ? null : visible.find(item => item.id === state.selectedContractId) || visible[0] || null;
    if (selectedContract) state.selectedContractId = selectedContract.id;
    const rows = visible.map(item => {
      const visits = state.data.visits.filter(row => row.contractId === item.id);
      const complete = visits.filter(row => row.status === "Completed").length;
      const total = Math.max(Number(item.visitsPerYear) || 0, visits.length, 1);
      const percent = Math.min(100, Math.round(complete / total * 100));
      const nextDate = nextFor(item)?.plannedDate;
      const selectedRow = item.id === state.selectedContractId;
      return `<article class="amc-contract-row ${selectedRow ? "selected" : ""}" aria-label="${esc(item.number)} ${esc(item.customerName)}">
        <div class="amc-row-cell amc-number"><button data-action="open-contract" data-id="${esc(item.id)}">${esc(item.number)}</button><small title="${esc(item.site)}">${esc(item.site)}</small></div>
        <div class="amc-row-cell amc-customer"><strong title="${esc(item.customerName)}">${esc(item.customerName)}</strong><small title="${esc(item.site)}">${esc(item.site)}</small></div>
        <div class="amc-row-cell amc-dates">${icon("calendar-days")}<span><strong>${shortDay(item.startDate)}</strong><small>to ${shortDay(item.endDate)}</small></span></div>
        <div class="amc-row-cell amc-visits"><strong>${esc(item.visitsPerYear)}</strong><small>visits/yr</small></div>
        <div class="amc-row-cell amc-progress"><strong>${complete} / ${total}</strong><span class="amc-progress-line"><i style="width:${percent}%"></i></span><small>${percent}%</small></div>
        <div class="amc-row-cell amc-next">${icon("calendar-days")}<span><strong>${shortDay(nextDate)}</strong><small>${nextDate ? `${Math.max(0, Math.round((new Date(`${nextDate}T12:00:00Z`) - new Date(`${current}T12:00:00Z`)) / 86400000))} days away` : "Not scheduled"}</small></span></div>
        <div class="amc-row-cell amc-status">${badge(contractStatus(item))}</div>
        <div class="amc-row-menu">${iconButton("ellipsis", `Actions for ${item.number}`, "amc-menu", item.id)}${state.amcMenuId === item.id ? `<div class="amc-menu-popover"><button data-action="open-contract" data-id="${esc(item.id)}">View details</button><button data-action="edit-amc" data-id="${esc(item.id)}">Edit AMC</button><button data-action="schedule-for-amc" data-id="${esc(item.id)}">Schedule visit</button><button data-action="amc-documents" data-id="${esc(item.id)}">Documents</button><button class="maint-delete-option" data-action="delete-request" data-kind="contracts" data-id="${esc(item.id)}">${icon("trash-2")} Delete AMC</button></div>` : ""}</div></article>`;
    }).join("");
    const newThisMonth = all.filter(item => item.createdAt?.startsWith(month));
    const completed = state.data.visits.filter(item => item.status === "Completed");
    const completedThisMonth = completed.filter(item => String(item.completedAt || item.updatedAt || "").startsWith(month)).length;
    const completedLastMonth = completed.filter(item => String(item.completedAt || item.updatedAt || "").startsWith(previousMonth)).length;
    const customerKey = item => item.customerId || item.customerName?.trim().toLowerCase();
    const newCustomers = new Set(newThisMonth.map(customerKey)).size;
    const expiring = all.filter(item => contractStatus(item) === "Expiring Soon").length;
    const amcKpi = (label, value, iconName, tone, change, hint, action = "") => `<button class="amc-kpi ${tone}" ${action ? `data-action="${action}"` : "disabled"} title="${esc(label)}: ${value}"><span class="amc-kpi-icon">${icon(iconName)}</span><span class="amc-kpi-main"><span>${esc(label)}</span><strong>${value}</strong></span><span class="amc-kpi-change"><b>${esc(change)}</b><small>${esc(hint)}</small></span></button>`;
    return `<div class="maint-amc"><header class="maint-header amc-header"><div><h1>AMC Register</h1><p>Manage maintenance contracts and track service history.</p></div><div class="maint-header-actions"><label class="maint-search">${icon("search")}<input data-search="amc" value="${esc(state.search.amc)}" placeholder="Search AMC, customer, site, contract..." aria-label="Search AMC Register"></label><button class="amc-header-button" data-action="amc-toggle-filters" aria-expanded="${state.amcFiltersOpen}">${icon("filter")} Filter</button><button class="amc-header-button" data-action="export-amc">${icon("download")} Export</button><button class="maint-primary" data-action="new-amc">${icon("plus")} New AMC</button></div></header>
      <div class="maint-body amc-body"><div class="amc-kpi-grid">
      ${amcKpi("Active AMC", all.filter(item => item.status === "Active").length, "file-text", "green", `+${newThisMonth.filter(item => item.status === "Active").length}`, "new this month", "amc-active")}
      ${amcKpi("Total Customers", new Set(all.map(customerKey)).size, "users-round", "blue", `+${newCustomers}`, "new this month")}
      ${amcKpi("Total Units", all.reduce((sum, item) => sum + Number(item.unitCount || 0), 0), "calendar-days", "violet", `+${newThisMonth.reduce((sum, item) => sum + Number(item.unitCount || 0), 0)}`, "new this month")}
      ${amcKpi("Visits Completed", completed.length, "wrench", "orange", completedLastMonth ? `${completedThisMonth >= completedLastMonth ? "+" : ""}${Math.round((completedThisMonth - completedLastMonth) / completedLastMonth * 100)}%` : `+${completedThisMonth}`, "vs last month")}
      ${amcKpi("Expiring Soon", expiring, "clock-3", "red", `${expiring}`, "in next 30 days", "go-expiring")}</div>
      ${state.amcFiltersOpen ? `<div class="amc-filter-panel"><label>Status<select data-filter-status aria-label="Filter AMC status"><option value="all">All statuses</option>${["Active", "Expiring Soon", "Upcoming Service", "Paused", "Cancelled"].map(value => `<option ${selected(state.status.amc, value)}>${value}</option>`).join("")}</select></label><label>Next service by<input type="date" data-amc-service-before value="${esc(state.amcServiceBefore)}"></label><button class="maint-outline" data-action="amc-clear-filters">Clear filters</button></div>` : ""}
      <div class="amc-layout ${selectedContract ? "" : "amc-layout-single"}"><section class="amc-list-panel"><div class="amc-list-toolbar"><div class="amc-filter-tabs">${[["all", "All Contracts"], ["Active", "Active"], ["Expiring Soon", "Expiring Soon"], ["Upcoming Service", "Upcoming Service"]].map(([value, label]) => `<button class="${state.status.amc === value ? "active" : ""}" data-action="amc-tab" data-status="${value}" aria-pressed="${state.status.amc === value}">${label} <span>${counts[value]}</span></button>`).join("")}</div><label class="amc-sort">Sort by <select data-amc-sort><option value="next-service" ${selected(state.amcSort, "next-service")}>Next Service</option><option value="customer" ${selected(state.amcSort, "customer")}>Customer</option><option value="end-date" ${selected(state.amcSort, "end-date")}>Contract End</option><option value="number" ${selected(state.amcSort, "number")}>AMC Number</option></select></label></div>
      <div class="amc-contract-list">${rows || `<div class="amc-empty">${all.length ? "No contracts match these filters." : "No AMC contracts yet."}${!all.length ? `<button class="maint-primary" data-action="new-amc">${icon("plus")} New AMC</button>` : ""}</div>`}</div><div class="amc-list-footer">Showing ${visible.length} of ${all.length} contracts</div></section>
      ${selectedContract ? contractDetail(selectedContract) : ""}</div></div></div>`;
  }

  function contractDetail(item) {
    const tabs = ["Overview", "Service Schedule", "Service Reports", "Documents"];
    const visits = state.data.visits.filter(row => row.contractId === item.id).sort((a, b) => a.plannedDate.localeCompare(b.plannedDate));
    const completed = visits.filter(row => row.status === "Completed").length;
    const next = visits.find(row => row.status !== "Completed" && row.plannedDate >= today());
    let content = "";
    if (state.contractTab === "Overview") {
      const percent = Math.round(completed / Math.max(Number(item.visitsPerYear) || 0, visits.length, 1) * 100);
      const upcoming = next ? `<div class="amc-upcoming">${icon("calendar-days")}<strong>${shortDay(next.plannedDate)}</strong><small>${esc(next.workOrderId ? job(next.workOrderId)?.workType || "Service visit" : "Planned maintenance visit")}</small><button data-action="${next.workOrderId ? "open-job" : "schedule-visit"}" data-id="${esc(next.workOrderId || next.id)}">View Details</button></div>` : `<p class="maint-muted">No upcoming service is scheduled.</p>`;
      const relatedIds = new Set(state.data.workOrders.filter(row => row.contractId === item.id).map(row => row.id));
      const activity = state.data.activity.filter(row => row.targetId === item.id || relatedIds.has(row.targetId)).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
      content = `<div class="amc-overview-grid"><div class="amc-info-card amc-contact-card"><div class="amc-card-icon violet">${icon("user-round")}</div><div class="amc-contact-fields"><small>Customer Name</small><strong>${esc(item.customerName)}</strong><small>Contact Person</small><span>${esc(item.contact || "Not provided")}</span><span class="amc-contact-line">${icon("phone")}${esc(item.phone || "Not provided")}</span><span class="amc-contact-line">${icon("mail")}${esc(item.email || "Not provided")}</span></div></div>
        <div class="amc-info-card amc-period-card"><div class="amc-card-icon blue">${icon("calendar-days")}</div><div><small>Contract Period</small><strong>${shortDay(item.startDate)}</strong><span>to ${shortDay(item.endDate)}</span></div></div>
        <div class="amc-info-card amc-site-card"><div class="amc-card-icon blue">${icon("map-pin")}</div><div><small>Site Location</small><strong title="${esc(item.site)}">${esc(item.site)}</strong></div></div>
        <div class="amc-info-card amc-type-card"><div class="amc-card-icon blue">${icon("file-text")}</div><div><small>AMC Type</small><strong>${esc(item.amcType || "Not specified")}</strong></div></div></div>
        <div class="amc-metrics"><div>${icon("calendar-days")}<small>Total Units</small><strong>${esc(item.unitCount || 0)}</strong></div><div>${icon("calendar-days")}<small>Visits per Year</small><strong>${esc(item.visitsPerYear)}</strong></div><div>${icon("circle-check")}<small>Completed Visits</small><strong>${completed} <em>(${percent}%)</em></strong></div><div>${icon("calendar-days")}<small>Next Service</small><strong>${shortDay(next?.plannedDate)}</strong></div></div>
        <div class="amc-subpanel"><div class="amc-subpanel-head"><h3>Upcoming Service Schedule</h3><button data-action="contract-tab" data-tab="Service Schedule">View All</button></div>${upcoming}</div>
        ${state.amcFullDetails ? `<div class="amc-subpanel"><div class="amc-subpanel-head"><h3>Recent Activity</h3></div><div class="amc-activity-list">${activity.length ? activity.map(row => `<div>${icon(row.kind === "report" ? "file-text" : "circle-check")}<span><strong>${esc(row.message)}</strong><small>${esc(row.actor || "Maintenance")}</small></span><time>${shortDay(row.createdAt)}</time></div>`).join("") : `<p class="maint-muted">No recent activity for this contract.</p>`}</div></div>` : `<div class="amc-subpanel"><div class="amc-subpanel-head"><h3>Full Contract Details</h3></div><dl class="amc-full-list"><div><dt>Frequency</dt><dd>${esc(item.frequency || "--")}</dd></div><div><dt>Contract Value</dt><dd>${item.contractValue ? `AED ${esc(item.contractValue)}` : "--"}</dd></div><div><dt>Covered Units</dt><dd>${(item.units || []).length ? (item.units || []).map(unit => `${esc(unit.reference || unit.type || "Unit")} (${esc(unit.quantity || 1)})`).join(", ") : esc(item.unitCount || 0)}</dd></div><div><dt>Notes</dt><dd>${esc(item.notes || "--")}</dd></div></dl></div>`}`;
    } else if (state.contractTab === "Service Schedule") {
      content = `<div class="amc-tab-list">${visits.length ? visits.map(row => `<div><span class="amc-card-icon blue">${icon("calendar-days")}</span><span><strong>Visit ${esc(row.sequence)} · ${shortDay(row.plannedDate)}</strong><small>${esc(job(row.workOrderId)?.workType || "Preventive maintenance")}</small></span>${badge(row.status)}${row.workOrderId ? iconButton("eye", "View work order", "open-job", row.workOrderId) : row.status === "Planned" ? iconButton("calendar-days", "Schedule planned visit", "schedule-visit", row.id) : ""}</div>`).join("") : `<p class="maint-muted">No service visits planned.</p>`}</div><button class="maint-outline amc-tab-add" data-action="schedule-for-amc" data-id="${esc(item.id)}">${icon("plus")} Schedule Visit</button>`;
    } else if (state.contractTab === "Service Reports") {
      const reports = state.data.reports.filter(row => row.contractId === item.id || job(row.workOrderId)?.contractId === item.id)
        .sort((a, b) => String(b.submittedAt || b.extracted?.serviceDate || "").localeCompare(String(a.submittedAt || a.extracted?.serviceDate || "")));
      content = `<div class="amc-tab-list">${reports.length ? reports.map(row => {
        const linked = job(row.workOrderId);
        const names = reportTechnicianNames(row.extracted?.technicianName);
        if (!names.length) names.push(...(linked?.technicianIds || []).map(id => tech(id)?.name).filter(Boolean));
        return `<div><span class="amc-card-icon ${row.status === "Approved" ? "green" : "blue"}">${icon("file-text")}</span><span><strong>${esc(row.number)}</strong><small>${esc(reportDay(row.extracted?.serviceDate || linked?.serviceDate || row.submittedAt?.slice(0, 10)))}${linked ? ` · ${esc(linked.number)}` : ""}</small><small>Technicians: ${esc(names.join(", ") || "Not specified")}</small></span>${badge(row.status)}${iconButton("eye", "View report", "open-report", row.id)}</div>`;
      }).join("") : `<p class="maint-muted">No service reports for this AMC yet.</p>`}</div>`;
    } else {
      const files = state.data.files.filter(file => file.contractId === item.id);
      content = `<div class="maint-file-list">${files.length ? files.map(file => `<a href="/api/maintenance/files/${encodeURIComponent(file.id)}" target="_blank" rel="noopener">${icon("paperclip")}${esc(file.originalName)}</a>`).join("") : `<p class="maint-muted">No contract documents uploaded.</p>`}</div><label class="maint-upload">${icon("upload")} Upload contract document<input type="file" data-contract-file="${item.id}" accept=".pdf,.png,.jpg,.jpeg,.webp" hidden></label>`;
    }
    return `<section class="amc-detail-panel"><div class="amc-detail-title"><div><h2>${esc(item.number)} ${badge(contractStatus(item))}</h2><p>${esc(item.customerName)} <span>·</span> ${esc(item.site)}</p></div>${iconButton("x", "Close AMC details", "close-contract")}</div>
      <div class="amc-detail-tabs">${tabs.map(tab => `<button data-action="contract-tab" data-tab="${tab}" class="${tab === state.contractTab ? "active" : ""}" aria-pressed="${tab === state.contractTab}">${tab}</button>`).join("")}</div>
      <div class="amc-detail-content">${content}</div><div class="amc-detail-actions"><button class="maint-outline" data-action="edit-amc" data-id="${esc(item.id)}">${icon("pencil")} Edit AMC</button><button class="maint-primary" data-action="amc-full-details">${icon("file-text")} ${state.amcFullDetails ? "Show Contract Details" : "View Full Activity"}</button></div></section>`;
  }

  function filterBar(kind) {
    const filters = state.filters;
    return `<div class="maint-filters">
      <label>Date <input type="date" data-filter="date" value="${esc(filters.date)}"></label>
      <label>Status <select data-filter-status><option value="all">All statuses</option>${(kind === "reports" ? ["Pending Review", "Approved", "Revision", "Rejected"] : kind === "schedule" ? ["Scheduled", "On Site", "Pending", "Report Submitted", "Completed"] : ["Scheduled", "On Site", "Report Submitted", "Completed"]).map(value => `<option ${selected(state.status[kind], value)}>${value}</option>`).join("")}</select></label>
      <label>AMC Contract <select data-filter="contract"><option value="">All contracts</option>${state.data.contracts.map(item => `<option value="${item.id}" ${selected(filters.contract, item.id)}>${esc(item.number)}</option>`).join("")}</select></label>
      <label>Customer <input data-filter="customer" value="${esc(filters.customer)}" placeholder="Customer name"></label>
      <label>Site <input data-filter="site" value="${esc(filters.site)}" placeholder="All locations"></label>
      <label>Technician <select data-filter="technician"><option value="">All technicians</option>${state.data.technicians.map(item => `<option value="${item.id}" ${selected(filters.technician, item.id)}>${esc(item.name)}</option>`).join("")}</select></label>
      <button class="maint-outline" data-action="clear-filters">Clear</button>
    </div>`;
  }

  function schedule() {
    const { events } = pmData();
    const allJobs = state.data.workOrders.filter(item => item.workType === "Preventive Maintenance");
    const allPlanned = state.data.visits.filter(item => item.status === "Planned" && (!item.workOrderId || !job(item.workOrderId)));
    const drafts = state.data.schedules.filter(item => item.status === "Draft" && item.workType === "Preventive Maintenance");
    const pendingCount = allPlanned.length + drafts.filter(item => !item.visitId || !allPlanned.some(visit => visit.id === item.visitId)).length;
    const onDate = events.filter(item => item.serviceDate === state.selectedDate);
    const upcoming = events.filter(item => item.serviceDate > state.selectedDate && item.status !== "Completed");
    const upcomingPageSize = !window.innerWidth || window.innerWidth >= 1300 ? 5 : window.innerWidth >= 1000 ? 3 : window.innerWidth >= 700 ? 2 : 1;
    state.pmUpcomingOffset = Math.min(state.pmUpcomingOffset, Math.max(0, upcoming.length - upcomingPageSize));
    const kpiData = [["Total Scheduled", allJobs.length + pendingCount, "calendar-days", "blue", "all"],
      ["Completed", allJobs.filter(item => item.status === "Completed").length, "circle-check", "green", "Completed"],
      ["On Site", allJobs.filter(item => item.status === "On Site").length, "play", "cyan", "On Site"],
      ["Pending", pendingCount, "clock-3", "orange", "Pending"],
      ["Report Submitted", allJobs.filter(item => item.status === "Report Submitted").length, "file-text", "red", "Report Submitted"]];
    const kpis = kpiData.map(([label, value, symbol, tone, status]) => `<button class="pm-kpi ${tone}" data-action="pm-kpi" data-status="${status}" title="${esc(label)}: ${value}"><span class="pm-kpi-icon">${icon(symbol)}</span><span><strong>${value}</strong><small>${esc(label)}</small></span></button>`).join("");
    const avatars = item => `<span class="pm-avatars">${pmTechnicians(item).length ? pmTechnicians(item).slice(0, 3).map(name => dashAvatar(name)).join("") : `<small>Unassigned</small>`}</span>`;
    const dailyCards = onDate.map(item => `<article class="pm-daily-card"><div class="pm-daily-time"><strong>${esc(item.startTime ? timeLabel(item.startTime).split(" ")[0] : "--")}</strong><small>${esc(item.startTime ? timeLabel(item.startTime).split(" ")[1] : "TBD")}</small></div><div class="pm-daily-main"><div class="pm-daily-title"><button data-action="${pmEventAction(item)}" data-id="${esc(item.id)}" title="${esc(`${item.customerName} - ${item.site}`)}">${esc(item.customerName)}${item.site ? ` - ${esc(item.site)}` : ""}</button><small>${esc(item.number || "Planned AMC")}</small></div><span class="pm-site" title="${esc(item.site)}">${esc(item.site || "Site not set")}</span><div class="pm-daily-type"><span title="${esc(pmWorkType(item))}">${esc(pmWorkType(item))}</span>${pmBadge(item.status)}</div><span class="pm-location">${icon("map-pin")}${esc(item.site || "Site not set")}</span><div class="pm-techs"><span>Technicians</span>${avatars(item)}</div></div><div class="pm-daily-menu">${iconButton("ellipsis", `Actions for ${item.number || item.customerName}`, "pm-menu", item.id)}${state.pmMenuId === item.id ? `<div class="pm-menu-popover"><button data-action="${pmEventAction(item)}" data-id="${esc(item.id)}">${item.planned ? "Plan visit" : "View Work Order"}</button>${!item.planned ? `<button data-action="edit-job" data-id="${esc(item.id)}">Edit Schedule</button><button class="maint-delete-option" data-action="delete-request" data-kind="${item.scheduleId ? "schedules" : "work-orders"}" data-id="${esc(item.scheduleId || item.id)}">${icon("trash-2")} Delete Schedule</button>` : ""}</div>` : ""}</div></article>`).join("");
    const upcomingCards = upcoming.slice(state.pmUpcomingOffset, state.pmUpcomingOffset + upcomingPageSize).map(item => `<article class="pm-upcoming-card"><div class="pm-upcoming-date"><strong>${Number(item.serviceDate.slice(-2))}</strong><small>${esc(new Intl.DateTimeFormat("en-US", { month: "short" }).format(new Date(`${item.serviceDate}T12:00:00`)))}</small><small>${esc(new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(new Date(`${item.serviceDate}T12:00:00`)))}</small></div><div class="pm-upcoming-info"><button data-action="${pmEventAction(item)}" data-id="${esc(item.id)}" title="${esc(`${item.customerName} - ${item.site}`)}">${esc(item.customerName)}${item.site ? ` - ${esc(item.site)}` : ""}</button><small>${esc(item.number || "Planned AMC")}</small><span>${icon("clock-3")}${esc(pmShortTime(item.startTime))}</span><span>${icon("wrench")}${esc(pmWorkType(item))}</span></div><div class="pm-upcoming-right">${pmBadge(item.status)}${avatars(item)}</div></article>`).join("");
    const paged = paginate(events, "schedule");
    const listRows = paged.items.map(item => `<div class="pm-list-row"><time>${esc(pmDate(item.serviceDate))}<small>${esc(pmShortTime(item.startTime))}</small></time><button data-action="${pmEventAction(item)}" data-id="${esc(item.id)}"><strong title="${esc(`${item.customerName} - ${item.site}`)}">${esc(item.customerName)}</strong><small>${esc(item.site)}</small></button><span>${esc(item.number || "Planned AMC")}</span><span title="${esc(pmWorkType(item))}">${esc(pmWorkType(item))}</span>${avatars(item)}${pmBadge(item.status)}${item.planned ? iconButton("eye", "Plan visit", pmEventAction(item), item.id) : `<span class="pm-list-actions">${iconButton("eye", "Open visit", pmEventAction(item), item.id)}<button class="maint-icon-button maint-delete-icon" title="Delete schedule" aria-label="Delete schedule" data-action="delete-request" data-kind="${item.scheduleId ? "schedules" : "work-orders"}" data-id="${esc(item.scheduleId || item.id)}">${icon("trash-2")}</button></span>`}</div>`).join("");
    return `<div class="maint-pm"><header class="maint-header pm-header"><div><h1>PM Schedule</h1><p>Plan and manage preventive maintenance visits.</p></div><div class="maint-header-actions"><label class="maint-search">${icon("search")}<input data-search="schedule" value="${esc(state.search.schedule)}" placeholder="Search customer, site, work order..." aria-label="Search PM Schedule"></label><span class="maint-date">${icon("calendar-days")}${esc(pmDate(today()))}</span><button class="maint-primary" data-action="new-schedule">${icon("plus")} New Schedule</button></div></header>
      <div class="maint-body pm-body"><div class="pm-kpi-strip">${kpis}<button class="pm-filter-button" data-action="pm-toggle-filters" aria-expanded="${state.pmFiltersOpen}">${icon("filter")} Filter</button></div>
      ${state.pmFiltersOpen ? filterBar("schedule") : ""}
      ${state.scheduleView === "list" ? `<section class="pm-calendar-panel pm-list-panel">${pmCalendar(events)}<div class="pm-list-heading"><strong>All PM Visits</strong><span>${events.length} visits</span></div><div class="pm-list-rows">${listRows || `<div class="pm-empty-day">No visits match these filters.</div>`}</div>${paged.footer}</section>` : `<div class="pm-main-layout"><section class="pm-calendar-panel">${pmCalendar(events)}</section><section class="pm-day-panel"><div class="pm-day-head"><h2>${esc(pmDate(state.selectedDate))}</h2><div>${iconButton("chevron-left", "Previous day", "pm-day-prev")}${iconButton("chevron-right", "Next day", "pm-day-next")}<span>${onDate.length} ${onDate.length === 1 ? "Visit" : "Visits"}</span></div></div><div class="pm-daily-list">${dailyCards || `<div class="pm-empty-day">No visits scheduled for this day.<button class="maint-outline" data-action="new-schedule-date">${icon("plus")} New Schedule</button></div>`}</div><button class="pm-day-details" data-action="pm-day-details">View Day Details ${icon("chevron-right")}</button></section></div>`}
      <section class="pm-upcoming-panel"><div class="pm-upcoming-head"><div>${icon("calendar-days")}<h2>Upcoming PM Visits</h2><span>Next scheduled preventive maintenance visits</span></div><div><button class="maint-outline" data-action="pm-view-all">View All</button>${iconButton("chevron-left", "Previous visits", "pm-upcoming-prev", "", state.pmUpcomingOffset === 0)}${iconButton("chevron-right", "Next visits", "pm-upcoming-next", "", state.pmUpcomingOffset >= Math.max(0, upcoming.length - upcomingPageSize))}</div></div><div class="pm-upcoming-grid" style="--pm-card-count:${upcomingPageSize}">${upcomingCards || `<div class="pm-upcoming-empty">No upcoming preventive maintenance visits.</div>`}</div></section>
      ${drafts.length ? `<section class="pm-drafts"><h2>Saved Drafts (${drafts.length})</h2><div>${drafts.map(item => `<div class="pm-draft-row"><button data-action="edit-schedule" data-id="${esc(item.id)}"><strong>${esc(item.customerName || "Draft schedule")}</strong><span>${day(item.serviceDate)} · ${esc(item.site || "Site not set")}</span>${icon("pencil")}</button><button class="maint-icon-button maint-delete-icon" title="Delete draft schedule" aria-label="Delete draft schedule" data-action="delete-request" data-kind="schedules" data-id="${esc(item.id)}">${icon("trash-2")}</button></div>`).join("")}</div></section>` : ""}</div></div>`;
  }

  const workOrderStages = [
    { name: "Scheduled", tone: "scheduled", icon: "calendar-days", description: "Planned work orders" },
    { name: "On Site", tone: "onsite", icon: "play", description: "Currently in progress" },
    { name: "Report Submitted", tone: "submitted", icon: "file-text", description: "Service report submitted" },
    { name: "Completed", tone: "completed", icon: "circle-check", description: "Work completed" }
  ];
  const workOrderFilterDefaults = () => ({ range: "all", from: "", to: "", status: "all", contract: "", customer: "", site: "", technician: "" });
  function workOrderDateRange(range, from, to) {
    const now = new Date(`${today()}T12:00:00`);
    if (range === "custom") return [from, to];
    if (range === "this-month" || range === "last-month") {
      const month = range === "last-month" ? -1 : 0;
      const first = new Date(now.getFullYear(), now.getMonth() + month, 1);
      const last = new Date(now.getFullYear(), now.getMonth() + month + 1, 0);
      const iso = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
      return [iso(first), iso(last)];
    }
    if (range === "next-30") {
      const next = new Date(now); next.setDate(now.getDate() + 30);
      return [today(), `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`];
    }
    return ["", ""];
  }
  function workOrderVisible() {
    const filters = state.workOrderFilters;
    const [from, to] = workOrderDateRange(filters.range, filters.from, filters.to);
    const query = state.search["work-orders"].toLowerCase().trim();
    return state.data.workOrders.filter(item => {
      const linked = contract(item.contractId);
      const names = (item.technicianIds || []).map(id => tech(id)?.name || "").join(" ");
      if (query && ![item.number, item.customerName, item.site, item.workType, linked?.number, names].join(" ").toLowerCase().includes(query)) return false;
      if (filters.status !== "all" && item.status !== filters.status) return false;
      if (filters.contract && item.contractId !== filters.contract) return false;
      if (filters.customer && item.customerName !== filters.customer) return false;
      if (filters.site && item.site !== filters.site) return false;
      if (filters.technician && !(item.technicianIds || []).includes(filters.technician)) return false;
      if (from && item.serviceDate < from) return false;
      if (to && item.serviceDate > to) return false;
      return true;
    }).sort((a, b) => String(a.serviceDate || "").localeCompare(String(b.serviceDate || "")) || String(a.startTime || "").localeCompare(String(b.startTime || "")));
  }
  function workOrderKpi(label, count, iconName, tone, status) {
    const all = status ? state.data.workOrders.filter(item => item.status === status) : state.data.workOrders;
    const current = workOrderDateRange("this-month");
    const previous = workOrderDateRange("last-month");
    const field = status ? "serviceDate" : "createdAt";
    const inRange = ([from, to]) => all.filter(item => item[field] && item[field].slice(0, 10) >= from && item[field].slice(0, 10) <= to).length;
    const nowCount = inRange(current), oldCount = inRange(previous);
    const change = oldCount ? `${nowCount >= oldCount ? "+" : ""}${Math.round((nowCount - oldCount) / oldCount * 100)}%` : nowCount ? `+${nowCount}` : "0";
    return `<button class="wo-kpi ${tone}" data-action="wo-kpi" data-status="${esc(status || "all")}" aria-label="Filter ${esc(label)}"><span class="wo-kpi-icon">${icon(iconName)}</span><span class="wo-kpi-copy"><strong>${count}</strong><small>${esc(label)}</small></span><span class="wo-kpi-change ${nowCount < oldCount ? "negative" : ""}"><b>${esc(change)}</b><small>vs last month</small></span></button>`;
  }
  function workOrderFilterBar() {
    const draft = state.workOrderDraft;
    const option = (value, label, active) => `<option value="${esc(value)}" ${selected(active, value)}>${esc(label)}</option>`;
    const distinct = key => [...new Set(state.data.workOrders.map(item => item[key]).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    const control = (label, key, options) => `<label class="wo-filter"><span>${label}</span><select data-wo-filter="${key}">${options}</select></label>`;
    return `<section class="wo-filters" aria-label="Work order filters">
      ${control("Date Range", "range", [option("all", "All Dates", draft.range), option("this-month", "This Month", draft.range), option("last-month", "Last Month", draft.range), option("next-30", "Next 30 Days", draft.range), option("custom", "Custom Range", draft.range)].join(""))}
      ${control("Status", "status", option("all", "All Statuses", draft.status) + workOrderStages.map(stage => option(stage.name, stage.name, draft.status)).join(""))}
      ${control("AMC Contract", "contract", option("", "All Contracts", draft.contract) + state.data.contracts.map(item => option(item.id, item.number, draft.contract)).join(""))}
      ${control("Customer", "customer", option("", "All Customers", draft.customer) + distinct("customerName").map(name => option(name, name, draft.customer)).join(""))}
      ${control("Site / Location", "site", option("", "All Locations", draft.site) + distinct("site").map(name => option(name, name, draft.site)).join(""))}
      ${control("Technicians", "technician", option("", "All Technicians", draft.technician) + state.data.technicians.map(item => option(item.id, item.name, draft.technician)).join(""))}
      <button class="wo-filter-clear" data-action="wo-clear-filters">Clear</button><button class="wo-filter-apply" data-action="wo-apply-filters">Apply</button>
      ${draft.range === "custom" ? `<div class="wo-custom-range"><label>From<input type="date" data-wo-filter="from" value="${esc(draft.from)}"></label><label>To<input type="date" data-wo-filter="to" value="${esc(draft.to)}"></label></div>` : ""}
    </section>`;
  }
  function workOrderAvatars(item) {
    const names = (item.technicianIds || []).map(id => tech(id)?.name).filter(Boolean);
    return `<span class="wo-techs"><span class="wo-avatar-stack">${names.slice(0, 2).map(name => dashAvatar(name)).join("")}${names.length > 2 ? `<span class="wo-more-tech">+${names.length - 2}</span>` : ""}</span><span title="${esc(names.join(", "))}">${esc(names.length ? names.join(", ") : "Unassigned")}</span></span>`;
  }
  function workOrderCard(item) {
    const linked = contract(item.contractId);
    const priority = item.priority === "Urgent" ? "High" : item.priority === "Normal" ? "Medium" : item.priority || "Medium";
    return `<article class="wo-card ${state.selectedWorkOrderId === item.id ? "selected" : ""}" data-action="wo-select" data-id="${esc(item.id)}" tabindex="0" role="button" aria-label="Show details for ${esc(item.number)}">
      <div class="wo-card-head"><strong>${esc(item.number)}</strong><span class="wo-priority ${esc(priority.toLowerCase())}" title="${esc(item.priority || "Normal")}">${esc(priority)}</span><button class="wo-ellipsis" data-action="wo-menu" data-id="${esc(item.id)}" title="Actions for ${esc(item.number)}" aria-label="Actions for ${esc(item.number)}">${icon("ellipsis")}</button></div>
      <div class="wo-card-line">${icon("building-2")}<span title="${esc(item.customerName)}">${esc(item.customerName || "Customer not set")}</span></div>
      <div class="wo-card-line">${icon("map-pin")}<span title="${esc(item.site)}">${esc(item.site || "Site not set")}</span></div>
      <div class="wo-card-line">${icon("file-text")}<span>${esc(linked?.number || "Non-AMC")}</span></div>
      <div class="wo-card-line wo-card-date">${icon("calendar-days")}<span>${esc(day(item.serviceDate))}<i></i>${esc(`${timeLabel(item.startTime)} - ${timeLabel(item.endTime)}`)}</span></div>
      <div class="wo-card-technicians">${workOrderAvatars(item)}</div>
      ${state.workOrderMenuId === item.id && state.workOrderMenuLocation === "card" ? `<div class="wo-card-menu"><button data-action="wo-select" data-id="${esc(item.id)}">Show Details</button><button data-action="open-job" data-id="${esc(item.id)}">View Full Details</button>${item.status !== "Completed" ? `<button data-action="edit-job" data-id="${esc(item.id)}">Edit Work Order</button>` : ""}${state.data.reports.some(row => row.workOrderId === item.id) ? `<button data-action="view-job-report" data-id="${esc(item.id)}">View Service Report</button>` : ""}<button class="maint-delete-option" data-action="delete-request" data-kind="work-orders" data-id="${esc(item.id)}">${icon("trash-2")} Delete Work Order</button></div>` : ""}
    </article>`;
  }
  function workOrderPanel(item) {
    const linked = contract(item.contractId);
    const serviceReport = state.data.reports.find(row => row.workOrderId === item.id);
    const names = (item.technicianIds || []).map(id => tech(id)?.name).filter(Boolean);
    const activity = state.data.activity.filter(row => row.targetId === item.id).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    const steps = workOrderStages.map(stage => stage.name);
    const stageIndex = steps.indexOf(item.status);
    const progressHtml = `<div class="wo-progress"><div class="wo-progress-label"><strong>Service Progress</strong><small>${Math.max(0, stageIndex + 1)} of 4 steps reached</small></div><div class="wo-progress-track">${steps.map((step, index) => `<span class="${index < stageIndex ? "done" : index === stageIndex ? "current" : ""}" title="${esc(step)}">${index < stageIndex ? icon("check") : index + 1}</span>`).join("")}</div><div class="wo-progress-names">${steps.map(step => `<small>${esc(step)}</small>`).join("")}</div></div>`;
    let body = "";
    if (state.workOrderTab === "Overview") {
      const checklist = serviceReport?.checklist || {};
      const entries = Object.values(checklist).flatMap(group => Object.values(group || {}));
      const checkedItems = entries.filter(entry => entry?.value && entry.value !== "Not Checked").length;
      body = `<div class="wo-overview"><div class="wo-summary-lines"><div>${icon("building-2")}<strong>${esc(item.customerName)}</strong></div><div>${icon("map-pin")}<span>${esc(item.site || "--")}</span></div><div>${icon("file-text")}<span>${esc(linked?.number || "Non-AMC")}</span></div></div>
        <div class="wo-info-highlight">${icon("calendar-days")}<span><small>Service Date & Time</small><strong>${esc(day(item.serviceDate))} · ${esc(timeLabel(item.startTime))} - ${esc(timeLabel(item.endTime))}</strong></span></div>
        <div class="wo-assignment"><strong>Technicians (${names.length})</strong>${names.length ? names.map(name => `<div>${dashAvatar(name)}<span>${esc(name)}${tech(item.leadTechnicianId)?.name === name ? `<small>Lead</small>` : ""}</span></div>`).join("") : `<p>Not assigned</p>`}</div>
        ${progressHtml}<div class="wo-checklist-progress"><div><strong>Checklist Progress</strong><small>${entries.length ? `${checkedItems} of ${entries.length} items` : "No checklist submitted"}</small></div><div class="wo-meter"><span style="width:${entries.length ? Math.round(checkedItems / entries.length * 100) : 0}%"></span></div></div>
        <div class="wo-latest"><strong>Latest Activity</strong><p>${esc(activity[0]?.message || serviceReport?.details?.remarks || "No activity recorded yet.")}</p><small>${activity[0] ? `${esc(activity[0].actor)} · ${esc(day(activity[0].createdAt))}` : ""}</small></div></div>`;
    } else if (state.workOrderTab === "Checklist") {
      const groups = Object.entries(serviceReport?.checklist || {});
      body = groups.length ? `<div class="wo-panel-list">${groups.map(([group, entries]) => `<h3>${esc(group === "indoor" ? "Indoor Unit" : group === "outdoor" ? "Outdoor Unit" : group)}</h3>${Object.entries(entries).map(([label, value]) => `<div><strong>${esc(label)}</strong><span>${esc(value?.value || "--")}${value?.note ? `<small>${esc(value.note)}</small>` : ""}</span></div>`).join("")}`).join("")}</div>` : `<p class="wo-panel-empty">${serviceReport?.type === "Handwritten Upload" ? "Checklist is in the handwritten service report." : "No digital checklist submitted yet."}</p>`;
    } else if (state.workOrderTab === "Attachments") {
      const files = (serviceReport?.fileIds || []).map(id => state.data.files.find(file => file.id === id)).filter(Boolean);
      body = files.length ? `<div class="wo-attachments">${files.map(file => `<a href="/api/maintenance/files/${encodeURIComponent(file.id)}" target="_blank" rel="noopener">${icon(file.mimeType?.startsWith("image/") ? "image" : "paperclip")}<span>${esc(file.originalName)}<small>${esc(file.kind || "Attachment")}</small></span>${icon("chevron-right")}</a>`).join("")}</div>` : `<p class="wo-panel-empty">No attachments for this work order yet.</p>`;
    } else {
      body = activity.length ? `<div class="wo-history">${activity.map(row => `<div><i></i><span><strong>${esc(row.message)}</strong><small>${esc(row.actor)} · ${esc(day(row.createdAt))}</small></span></div>`).join("")}</div>` : `<p class="wo-panel-empty">No work-order activity yet.</p>`;
    }
    return `<aside class="wo-detail" aria-label="Work order details"><div class="wo-detail-head"><div><h2>${esc(item.number)}</h2><span class="wo-status ${esc(item.status.toLowerCase().replaceAll(" ", "-"))}">${esc(item.status)}</span></div>${iconButton("x", "Close details", "wo-close")}</div>
      <div class="wo-tabs" role="tablist">${["Overview", "Checklist", "Attachments", "History"].map(tab => `<button role="tab" aria-selected="${state.workOrderTab === tab}" class="${state.workOrderTab === tab ? "active" : ""}" data-action="wo-tab" data-tab="${tab}">${tab}</button>`).join("")}</div>
      <div class="wo-detail-scroll">${body}</div><div class="wo-detail-actions"><button class="wo-view-full" data-action="open-job" data-id="${esc(item.id)}">${icon("eye")} View Full Details</button><div><button data-action="edit-job" data-id="${esc(item.id)}" ${item.status === "Completed" ? "disabled title=\"Completed work orders cannot be edited\"" : ""}>${icon("pencil")} Edit</button>${serviceReport ? `<button data-action="view-job-report" data-id="${esc(item.id)}">${icon("file-text")} Report</button>` : ""}<button data-action="wo-more" data-id="${esc(item.id)}" title="More actions" aria-label="More actions">${icon("ellipsis")}</button></div>${state.workOrderMenuId === item.id && state.workOrderMenuLocation === "detail" ? `<div class="wo-detail-menu"><button data-action="open-job" data-id="${esc(item.id)}">View Full Details</button>${item.contractId ? `<button data-action="open-contract-search" data-id="${esc(item.contractId)}">Open AMC Contract</button>` : ""}${serviceReport ? `<button data-action="view-job-report" data-id="${esc(item.id)}">Open Service Report</button>` : ""}<button class="maint-delete-option" data-action="delete-request" data-kind="work-orders" data-id="${esc(item.id)}">${icon("trash-2")} Delete Work Order</button></div>` : ""}</div></aside>`;
  }
  function workOrders() {
    if (state.recordId) return workOrderDetail(job(state.recordId));
    const all = state.data.workOrders, visible = workOrderVisible();
    if (state.selectedWorkOrderId === "" && window.innerWidth > 1650) state.selectedWorkOrderId = visible[0]?.id || "";
    else if (state.selectedWorkOrderId && !visible.some(item => item.id === state.selectedWorkOrderId)) state.selectedWorkOrderId = window.innerWidth > 1650 ? visible[0]?.id || "" : null;
    const selectedJob = state.selectedWorkOrderId ? job(state.selectedWorkOrderId) : null;
    const board = workOrderStages.map(stage => {
      const rows = visible.filter(item => item.status === stage.name);
      return `<section class="wo-column ${stage.tone}"><header><span class="wo-column-icon">${icon(stage.icon)}</span><span><h2>${esc(stage.name)}</h2><small>${esc(stage.description)}</small></span><b>${rows.length}</b></header><div class="wo-card-list">${rows.length ? rows.map(workOrderCard).join("") : `<p class="wo-column-empty">No ${esc(stage.name.toLowerCase())} work orders match.</p>`}</div></section>`;
    }).join("");
    return `<div class="maint-work-orders">${header("Work Orders", "Manage and track maintenance work orders across your HVAC operations.", "New Work Order", "new-work-order", "Search work orders, customer, site, AMC...")}
      <div class="maint-body wo-body"><div class="wo-kpi-row">${workOrderKpi("Total Work Orders", all.length, "file-text", "total", "")}${workOrderKpi("Scheduled", all.filter(item => item.status === "Scheduled").length, "calendar-days", "scheduled", "Scheduled")}${workOrderKpi("On Site", all.filter(item => item.status === "On Site").length, "play", "onsite", "On Site")}${workOrderKpi("Report Submitted", all.filter(item => item.status === "Report Submitted").length, "file-text", "submitted", "Report Submitted")}${workOrderKpi("Completed", all.filter(item => item.status === "Completed").length, "circle-check", "completed", "Completed")}</div>
      ${workOrderFilterBar()}<div class="wo-layout ${selectedJob ? "has-detail" : ""}"><div class="wo-board">${board}</div>${selectedJob ? `<div class="wo-detail-backdrop" data-action="wo-close"></div>${workOrderPanel(selectedJob)}` : ""}</div></div></div>`;
  }

  function workOrderDetail(item) {
    if (!item) return `${header("Work Order Details", "Work order not found.")}<div class="maint-body">${empty("Work order not found")}</div>`;
    const amcRecord = contract(item.contractId);
    const reportRecord = state.data.reports.find(row => row.workOrderId === item.id);
    const scheduleRecord = state.data.schedules.find(row => row.workOrderId === item.id);
    const attendance = state.data.attendance.filter(row => row.workOrderId === item.id).sort((a, b) => String(b.checkInAt).localeCompare(String(a.checkInAt)));
    const activities = state.data.activity.filter(row => row.targetId === item.id && row.kind === "workOrder").sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    const files = state.data.files.filter(file => file.workOrderId === item.id || (reportRecord?.fileIds || []).includes(file.id));
    const reportPdfUrl = reportRecord ? `/api/maintenance/reports/${encodeURIComponent(reportRecord.id)}/pdf` : "";
    const mapsUrl = item.site ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.site)}` : "";
    const stageIndex = workOrderStages.findIndex(stage => stage.name === item.status);
    const reached = stageIndex === 3 && reportRecord?.status !== "Approved" ? reportRecord ? 2 : 1 : stageIndex;
    const stageTimes = [scheduleRecord?.createdAt || item.createdAt, attendance.at(-1)?.checkInAt, reportRecord?.submittedAt, item.completedAt];
    const dateTime = value => value ? `${day(value)}${value.length >= 16 ? ` · ${timeLabel(value.slice(11, 16))}` : ""}` : "";
    const field = (label, value, symbol) => `<div class="wd-field"><span class="wd-field-icon">${icon(symbol)}</span><span><small>${esc(label)}</small><strong title="${esc(value || "--")}">${esc(value || "--")}</strong></span></div>`;
    const fileSize = bytes => bytes ? bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB` : "";
    const fileCard = file => `<a class="wd-file" href="/api/maintenance/files/${encodeURIComponent(file.id)}" target="_blank" rel="noopener" title="Open ${esc(file.originalName)}"><span>${file.mimeType?.startsWith("image/") ? `<img src="/api/maintenance/files/${encodeURIComponent(file.id)}" alt="${esc(file.originalName)}">` : icon("file-text")}</span><strong>${esc(file.originalName)}</strong><small>${esc(fileSize(file.size))}</small></a>`;
    const sectionHead = (symbol, title, action = "", actionLabel = "Edit", disabled = false) => `<div class="wd-section-head"><div>${icon(symbol)}<h2>${esc(title)}</h2></div>${action ? `<button data-action="${action}" data-id="${esc(item.id)}" ${disabled ? "disabled title=\"Completed work orders cannot be edited\"" : ""}>${esc(actionLabel)}</button>` : ""}</div>`;
    const viewFiles = (compact = false) => files.length ? `<div class="wd-files ${compact ? "compact" : ""}">${(compact ? files.slice(0, 3) : files).map(fileCard).join("")}${compact ? `<button class="wd-upload-tile" disabled title="Only assigned technicians can upload work-order files in the Field app">${icon("upload")}<span>Upload Files</span></button>` : ""}</div>` : `<div class="wd-no-files">No files attached to this work order.${compact ? `<button disabled title="Only assigned technicians can upload work-order files in the Field app">Upload Files</button>` : ""}</div>`;
    const infoCard = `<section class="wd-card wd-site-card">${sectionHead("map-pin", "Customer & Site Information", "edit-job", "Edit", item.status === "Completed")}<div class="wd-site-content"><div class="wd-field-grid"><div>${field("Customer", item.customerName, "users-round")}${field("Site / Location", item.site, "map-pin")}${field("Contact Person", item.contact, "user-round")}${field("Phone", item.phone, "phone")}</div><div>${field("AMC Contract", amcRecord?.number || "Non-AMC", "file-text")}${field("Work Type", item.workType, "wrench")}${field("Priority", item.priority === "Urgent" ? "High" : "Medium", "triangle-alert")}${field("AC Units", amcRecord?.unitCount ? `${amcRecord.unitCount} Units` : "--", "clipboard-list")}</div></div><div class="wd-map"><span class="wd-map-icon">${icon("map-pin")}</span><strong>${esc(item.site || "Site not set")}</strong>${mapsUrl ? `<a href="${mapsUrl}" target="_blank" rel="noopener">Open in Maps ${icon("chevron-right")}</a>` : `<span>Map unavailable</span>`}</div></div></section>`;
    const reportOptions = `<section class="wd-card">${sectionHead("file-text", "Service Report Options")}<div class="wd-report-options"><div><span class="wd-report-icon green">${icon("check")}</span><span><strong>Digital HVAC Checklist</strong><small>Technicians complete maintenance items, work details, photos and customer signature.</small><button data-action="wd-tab" data-tab="Checklist">Open Checklist ${icon("chevron-right")}</button></span></div><div><span class="wd-report-icon purple">${icon("upload")}</span><span><strong>Upload Handwritten Report</strong><small>The assigned lead technician uploads the original report in the Field app for office review.</small><button data-action="wd-upload-info">Upload Report ${icon("chevron-right")}</button></span></div></div></section>`;
    const notesAndFiles = `<div class="wd-lower-grid"><section class="wd-card">${sectionHead("pencil", "Notes", "edit-job", "Edit", item.status === "Completed")}<p class="wd-notes">${esc(item.instructions || "No work instructions or additional remarks recorded.")}</p></section><section class="wd-card">${sectionHead("paperclip", `Attachments (${files.length})`, "wd-documents", "View All")}<div class="wd-attachments-preview">${viewFiles(true)}</div></section></div>`;
    const checklistGroups = Object.entries(reportRecord?.checklist || {});
    const checklistView = `<section class="wd-card wd-tab-content">${sectionHead("clipboard-list", "Digital HVAC Checklist")}${checklistGroups.length ? `<div class="wd-checklist-meta"><strong>${esc(reportRecord.number)}</strong>${badge(reportRecord.status)}<small>Submitted ${esc(dateTime(reportRecord.submittedAt))}</small></div>${checklistGroups.map(([group, entries]) => `<div class="wd-checklist-group"><h3>${esc(group === "indoor" ? "Indoor Unit" : group === "outdoor" ? "Outdoor Unit" : group)}</h3>${Object.entries(entries).map(([label, result]) => `<div><span>${esc(label)}</span><strong class="${result?.value === "Issue" ? "issue" : ""}">${esc(result?.value || "--")}</strong>${result?.note ? `<small>${esc(result.note)}</small>` : ""}</div>`).join("")}</div>`).join("")}` : `<p class="wd-empty-copy">${reportRecord?.type === "Handwritten Upload" ? "The checklist is included in the uploaded handwritten report." : "No digital checklist has been submitted. Only the assigned lead technician can submit one from the Field app."}</p>`}</section>`;
    const serviceView = `<section class="wd-card wd-tab-content">${sectionHead("file-text", "Service Report")}${reportRecord ? `<div class="wd-report-summary"><div><strong>${esc(reportRecord.number)}</strong>${badge(reportRecord.status)}</div><p>${esc(reportRecord.type)} · Submitted ${esc(dateTime(reportRecord.submittedAt))} by ${esc(tech(reportRecord.submittedBy)?.name || "Technician")}</p><dl><div><dt>Work Carried Out</dt><dd>${esc(reportRecord.details?.workCarriedOut || "--")}</dd></div><div><dt>Materials Used</dt><dd>${esc(reportRecord.details?.materialsUsed || "--")}</dd></div><div><dt>Remarks</dt><dd>${esc(reportRecord.details?.remarks || "--")}</dd></div>${reportRecord.reviewReason ? `<div><dt>Review Note</dt><dd>${esc(reportRecord.reviewReason)}</dd></div>` : ""}</dl><div class="wd-report-actions"><button data-action="open-report" data-id="${esc(reportRecord.id)}">Open Report & Review</button><a href="${reportPdfUrl}" target="_blank" rel="noopener">${icon("download")} Download PDF</a></div></div>` : `<p class="wd-empty-copy">No service report has been submitted for this work order. The assigned lead technician can submit it from the Field app.</p>`}</section>`;
    const documentsView = `<section class="wd-card wd-tab-content">${sectionHead("paperclip", `Photos & Documents (${files.length})`)}${viewFiles()}<p class="wd-permission-note">Work-order uploads are available to assigned technicians in the Field app. Office users can view and download submitted files here.</p></section>`;
    const overview = `${infoCard}${reportOptions}${notesAndFiles}`;
    const tabContent = state.workOrderDetailTab === "Checklist" ? checklistView : state.workOrderDetailTab === "Service Report" ? serviceView : state.workOrderDetailTab === "Photos & Documents" ? documentsView : overview;
    const techRows = (item.technicianIds || []).map(id => {
      const person = tech(id); if (!person) return "";
      const activeCheckIn = state.data.attendance.find(row => row.technicianId === id && row.workOrderId === item.id && !row.checkOutAt);
      const currentAtOtherSite = state.data.attendance.some(row => row.technicianId === id && row.workOrderId !== item.id && !row.checkOutAt);
      const presence = !person.active || person.offDuty ? "Off Duty" : activeCheckIn ? "On Site" : currentAtOtherSite ? "At Other Site" : "Scheduled";
      return `<div class="wd-technician">${dashAvatar(person.name)}<span><strong>${esc(person.name)}${id === item.leadTechnicianId ? `<i>Lead</i>` : ""}</strong><small>${icon("phone")}${esc(person.phone || "No phone")}</small></span><em class="${presence === "On Site" ? "on-site" : ""}">${esc(presence)}</em></div>`;
    }).join("");
    const createdActor = scheduleRecord?.createdBy || activities.at(-1)?.actor || item.createdBy || "--";
    const failedNotices = state.data.notifications.filter(row => row.workOrderId === item.id && ["Failed", "Not Subscribed"].includes(row.status));
    const sidebar = `<aside class="wd-sidebar"><section class="wd-card">${sectionHead("users-round", `Technicians (${(item.technicianIds || []).length})`, "edit-job", "Edit", item.status === "Completed")}<div class="wd-technician-list">${techRows || `<p class="wd-empty-copy">No technicians assigned.</p>`}</div></section>
      <section class="wd-card">${sectionHead("calendar-days", "Schedule Details", "edit-job", "Edit", item.status === "Completed")}<div class="wd-schedule-rows">${field("Service Date", day(item.serviceDate), "calendar-days")}${field("Time", `${timeLabel(item.startTime)} - ${timeLabel(item.endTime)}`, "clock-3")}${field("Created On", dateTime(item.createdAt), "calendar")}${field("Created By", createdActor, "user-round")}</div></section>
      <section class="wd-card">${sectionHead("wrench", "Quick Actions")}<div class="wd-quick-actions"><button data-action="wd-retry-notifications" data-id="${esc(item.id)}" ${failedNotices.length ? `title="Retry ${failedNotices.length} failed delivery attempts"` : `disabled title="New notifications are sent when assignments change; no failed delivery is available to retry"`}>${icon("send")}${failedNotices.length ? "Retry Notification" : "Send Notification"}</button>${reportPdfUrl ? `<a href="${reportPdfUrl}" target="_blank" rel="noopener">${icon("download")} Download PDF</a>` : `<button disabled title="A service report PDF is available after submission">${icon("download")} Download PDF</button>`}<button data-action="wd-duplicate" data-id="${esc(item.id)}">${icon("file-text")} Duplicate</button><button class="danger" disabled title="Work order cancellation is not supported by the current maintenance API">${icon("x")} Cancel Work Order</button></div></section></aside>`;
    return `<div class="wd-detail"><div class="wd-top"><div class="wd-breadcrumb"><button data-action="go-work-orders">Maintenance</button><span>›</span><button data-action="go-work-orders">Work Orders</button><span>›</span><strong>${esc(item.number)}</strong></div><button class="wd-new-order" data-action="new-work-order">${icon("plus")} New Work Order</button></div>
      <header class="wd-header"><div><h1>Work Order #${esc(item.number)} ${badge(item.status)}</h1><p>Created ${esc(dateTime(item.createdAt))} <span>·</span> Last updated ${esc(dateTime(item.updatedAt))}</p></div><div class="wd-header-actions"><button data-action="edit-job" data-id="${esc(item.id)}" ${item.status === "Completed" ? "disabled" : ""}>${icon("pencil")} Edit</button><button data-action="edit-job" data-id="${esc(item.id)}" ${item.status === "Completed" ? "disabled" : ""}>${icon("users-round")} Assign Technicians</button><button data-action="view-job-report" data-id="${esc(item.id)}">${icon("file-text")} View Field Report</button><div class="wd-more-wrap"><button data-action="wd-more" aria-label="More actions" title="More actions">${icon("ellipsis")}</button>${state.workOrderDetailMenu ? `<div class="wd-more-menu"><button data-action="wd-duplicate" data-id="${esc(item.id)}">Duplicate as Draft</button>${item.contractId ? `<button data-action="open-contract-search" data-id="${esc(item.contractId)}">Open AMC Contract</button>` : ""}<button data-action="go-work-orders">Back to Work Orders</button><button class="maint-delete-option" data-action="delete-request" data-kind="work-orders" data-id="${esc(item.id)}">${icon("trash-2")} Delete Work Order</button></div>` : ""}</div></div></header>
      <section class="wd-timeline" aria-label="Work order progress">${workOrderStages.map((stage, index) => `<div class="wd-stage ${index < reached ? "done" : index === reached ? "current" : "pending"} ${stage.tone}"><span class="wd-step">${index < reached ? icon("check") : index + 1}</span><span class="wd-stage-label"><strong>${esc(stage.name)}</strong><small>${index <= reached ? esc(dateTime(stageTimes[index]) || (index === reached ? "In progress" : "Reached")) : "Pending"}</small></span></div>`).join("")}</section>
      <div class="wd-layout"><main class="wd-main"><nav class="wd-tabs" aria-label="Work order sections">${["Overview", "Checklist", "Service Report", "Photos & Documents"].map(tab => `<button data-action="wd-tab" data-tab="${tab}" class="${state.workOrderDetailTab === tab ? "active" : ""}" aria-current="${state.workOrderDetailTab === tab ? "page" : "false"}">${tab}</button>`).join("")}</nav><div class="wd-tab-body">${tabContent}</div></main>${sidebar}</div></div>`;
  }

  function technicianStatus(item) {
    if (!item.active || item.offDuty) return "Off Duty";
    if (state.data.attendance.some(row => row.technicianId === item.id && !row.checkOutAt)) return "On Site";
    if (state.data.workOrders.some(row => row.serviceDate === today() && row.technicianIds.includes(item.id) && row.status !== "Completed")) return "Scheduled";
    return "Available";
  }

  function technicians() {
    const all = state.data.technicians;
    const withStatus = all.map(item => ({ ...item, status: technicianStatus(item) }));
    const query = `${state.search.technicians} ${state.technicianDirectorySearch}`.trim().toLowerCase();
    const jobsToday = item => state.data.workOrders.filter(row => row.serviceDate === today() && row.technicianIds.includes(item.id));
    const visible = withStatus.filter(item => {
      const matchesText = !query || query.split(/\s+/).every(word => [item.name, item.code, item.phone, item.email].some(value => String(value || "").toLowerCase().includes(word)));
      const matchesStatus = state.status.technicians === "all" || item.status === state.status.technicians;
      const matchesAvailability = state.technicianAvailability === "all" ||
        (state.technicianAvailability === "ready" && item.status === "Available") ||
        (state.technicianAvailability === "assigned" && jobsToday(item).length > 0) ||
        (state.technicianAvailability === "unavailable" && item.status === "Off Duty");
      return matchesText && matchesStatus && matchesAvailability;
    }).sort((a, b) => state.technicianSort === "code" ? String(a.code).localeCompare(String(b.code))
      : state.technicianSort === "jobs" ? jobsToday(b).length - jobsToday(a).length || a.name.localeCompare(b.name)
      : a.name.localeCompare(b.name));
    const selectedTech = visible.find(item => item.id === state.selectedTechnicianId) || visible[0];
    if (selectedTech?.id !== state.selectedTechnicianId) { state.accessLink = ""; state.technicianTab = "Overview"; state.technicianMoreMenu = false; }
    state.selectedTechnicianId = selectedTech?.id || "";
    const metric = (label, value, iconName, tone, detail) => `<div class="td-kpi ${tone}"><span class="td-kpi-icon">${icon(iconName)}</span><span class="td-kpi-copy"><span>${label}</span><strong>${value}</strong><small>${detail}</small></span></div>`;
    const directoryRows = visible.map(item => {
      const current = state.data.attendance.filter(row => row.technicianId === item.id && !row.checkOutAt).sort((a, b) => String(b.checkInAt).localeCompare(String(a.checkInAt)))[0];
      const site = current?.site || jobsToday(item).find(row => row.status !== "Completed")?.site || "No current site";
      return `<button class="td-person ${item.id === selectedTech?.id ? "selected" : ""}" data-action="open-technician" data-id="${esc(item.id)}" aria-current="${item.id === selectedTech?.id ? "true" : "false"}">
        ${dashAvatar(item.name)}<span class="td-person-name"><strong title="${esc(item.name)}">${esc(item.name)}</strong><small>${esc(item.code)}</small></span>
        <span class="td-person-contact"><span title="${esc(item.phone || "")}">${icon("phone")}${esc(item.phone || "No phone")}</span><span title="${esc(site)}">${icon("map-pin")}${esc(site)}</span></span>
        <span class="td-status ${item.status.toLowerCase().replace(/\s+/g, "-")}"><i></i>${esc(item.status)}</span>${icon("chevron-right")}</button>`;
    }).join("");
    return `${header("Technicians", "Manage field technicians, availability, assignments and attendance.", "New Technician", "new-technician", "Search technicians...")}
      <div class="maint-body maint-technicians"><div class="td-kpis">
        ${metric("Total Technicians", all.filter(item => item.active).length, "users-round", "blue", "Active technicians")}
        ${metric("Available Now", withStatus.filter(item => item.status === "Available").length, "circle-check", "green", "Ready for assignment")}
        ${metric("On Site", withStatus.filter(item => item.status === "On Site").length, "map-pin", "blue", "Checked in at a site")}
        ${metric("Scheduled Today", withStatus.filter(item => jobsToday(item).some(row => row.status !== "Completed")).length, "calendar-days", "violet", "Technicians with jobs")}
        ${metric("Off Duty", withStatus.filter(item => item.status === "Off Duty").length, "clock-3", "red", "Not available")}</div>
      <div class="td-layout"><section class="td-directory"><div class="td-directory-head"><h2>Technician Directory <span>(${visible.length})</span></h2><p>Select a technician to view details, jobs and attendance.</p></div>
        <label class="td-search">${icon("search")}<input data-tech-directory-search value="${esc(state.technicianDirectorySearch)}" placeholder="Search by name, ID or phone..." aria-label="Search technician directory"></label>
        <div class="td-controls"><label><span>Status</span><select data-filter-status><option value="all">All Status</option>${["Available", "On Site", "Scheduled", "Off Duty"].map(value => `<option value="${value}" ${selected(state.status.technicians, value)}>${value}</option>`).join("")}</select></label>
        <label><span>Availability</span><select data-tech-availability><option value="all" ${selected(state.technicianAvailability, "all")}>All</option><option value="ready" ${selected(state.technicianAvailability, "ready")}>Ready</option><option value="assigned" ${selected(state.technicianAvailability, "assigned")}>Assigned Today</option><option value="unavailable" ${selected(state.technicianAvailability, "unavailable")}>Unavailable</option></select></label>
        <label><span>Sort By</span><select data-tech-sort><option value="name" ${selected(state.technicianSort, "name")}>Name</option><option value="code" ${selected(state.technicianSort, "code")}>ID</option><option value="jobs" ${selected(state.technicianSort, "jobs")}>Jobs Today</option></select></label></div>
        <div class="td-directory-list">${directoryRows || `<div class="td-empty">${all.length ? "No matching technicians" : "No technicians added"}</div>`}</div></section>
        ${selectedTech ? technicianDetail(selectedTech) : `<section class="td-profile td-empty">Select a technician to view their profile.</section>`}</div></div>`;
  }

  function technicianDetail(item) {
    const current = today();
    const assignments = state.data.workOrders.filter(row => row.technicianIds.includes(item.id)).sort((a, b) => a.serviceDate.localeCompare(b.serviceDate) || String(a.startTime).localeCompare(String(b.startTime)));
    const todayJobs = assignments.filter(row => row.serviceDate === current);
    const future = assignments.filter(row => row.serviceDate > current && row.status !== "Completed");
    const activeJob = todayJobs.find(row => row.status === "On Site") || todayJobs.find(row => row.status !== "Completed");
    const attendanceRows = state.data.attendance.filter(row => row.technicianId === item.id).sort((a, b) => String(b.checkInAt).localeCompare(String(a.checkInAt)));
    const zoneDate = value => {
      if (!value) return "";
      const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Dubai", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value));
      const part = type => parts.find(entry => entry.type === type).value;
      return `${part("year")}-${part("month")}-${part("day")}`;
    };
    const zoneTime = value => value ? new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Dubai", hour: "2-digit", minute: "2-digit", hour12: true }).format(new Date(value)) : "--";
    const attendanceToday = attendanceRows.find(row => zoneDate(row.checkInAt) === current);
    const openAttendance = attendanceRows.find(row => !row.checkOutAt);
    const site = openAttendance?.site || activeJob?.site || "No current site";
    const status = technicianStatus(item);
    const notices = state.data.notifications.filter(row => row.technicianId === item.id).slice(0, 8);
    const jobRow = (row, showDate = false) => `<button class="td-job-row" data-action="open-job" data-id="${esc(row.id)}"><span class="td-job-when"><strong>${esc(showDate ? day(row.serviceDate) : timeLabel(row.startTime))}</strong><small>${esc(row.number)}</small></span><span class="td-job-name"><strong title="${esc(`${row.customerName} - ${row.site}`)}">${esc(row.customerName)} - ${esc(row.site)}</strong><small title="${esc(row.workType)}">${esc(row.workType)}</small></span>${badge(row.status)}${icon("chevron-right")}</button>`;
    const jobList = (rows, limit, showDate = false) => rows.length ? rows.slice(0, limit).map(row => jobRow(row, showDate)).join("") : `<p class="td-card-empty">No assigned jobs.</p>`;
    const card = (title, iconName, content, action = "", label = "View All", extra = "") => `<section class="td-card ${extra}"><div class="td-card-head"><h3>${icon(iconName)}${title}</h3>${action ? `<button data-action="td-tab" data-tab="${action}">${label}</button>` : ""}</div>${content}</section>`;
    const monday = shiftDay(current, -((new Date(`${current}T12:00:00Z`).getUTCDay() + 6) % 7));
    const weekly = Array.from({ length: 7 }, (_, index) => assignments.filter(row => row.serviceDate === shiftDay(monday, index)).length);
    const weeklyMax = Math.max(1, ...weekly);
    const weeklyChart = `<div class="td-chart" aria-label="Assigned jobs this week">${weekly.map((count, index) => `<div><strong>${count}</strong><span class="td-chart-bar" style="height:${Math.max(4, count / weeklyMax * 58)}px"></span><small>${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][index]}</small></div>`).join("")}</div>`;
    const mapAction = site !== "No current site" ? `<button data-action="td-map" data-site="${esc(site)}">View on Map</button>` : "";
    const overview = `<div class="td-overview">
      ${card("Current Assignment", "building-2", activeJob ? `<div class="td-assignment"><button class="td-link" data-action="open-job" data-id="${esc(activeJob.id)}">${esc(activeJob.number)}</button><strong>${esc(activeJob.customerName)} - ${esc(activeJob.site)}</strong><span>${esc(activeJob.workType)}</span><span>${timeLabel(activeJob.startTime)} - ${timeLabel(activeJob.endTime)}</span>${badge(activeJob.status)}</div>` : `<p class="td-card-empty">No Active Assignment</p>`)}
      ${card("Current Location & Employment", "map-pin", `<div class="td-info-line"><span>Current Site</span><strong title="${esc(site)}">${esc(site)}</strong>${mapAction}</div><div class="td-info-line"><span>Attendance</span><strong>${openAttendance ? "Checked In" : "Not Checked In"}</strong></div><div class="td-info-line"><span>Employment</span><strong class="${item.active ? "td-positive" : "td-negative"}">${item.active ? "Active" : "Inactive"}</strong></div>`)}
      ${card(`Today's Jobs (${todayJobs.length})`, "calendar-days", jobList(todayJobs, 2), "Today's Jobs")}
      ${card(`Future Jobs (${future.length})`, "calendar-days", jobList(future, 2, true), "Future Jobs")}
      ${card("Attendance Today", "circle-check", `<div class="td-attendance-summary"><div><span>Check-in</span><strong>${zoneTime(attendanceToday?.checkInAt)}</strong></div><div><span>Check-out</span><strong>${zoneTime(attendanceToday?.checkOutAt)}</strong></div><div><span>Status</span><strong class="${openAttendance ? "td-positive" : ""}">${openAttendance ? "Checked In" : attendanceToday ? "Checked Out" : "Not Checked In"}</strong></div><div><span>Current Site</span><strong title="${esc(site)}">${esc(site)}</strong></div></div>`, "Attendance", "History")}
      ${card("Weekly Activity", "list", weeklyChart)}</div>`;
    const attendanceTab = `<div class="td-tab-list">${attendanceRows.length ? attendanceRows.map(row => `<div class="td-attendance-row"><span><strong>${esc(day(zoneDate(row.checkInAt)))}</strong><small>${esc(row.site || "No site")}</small></span><span><small>Check-in</small><strong>${zoneTime(row.checkInAt)}</strong></span><span><small>Check-out</small><strong>${zoneTime(row.checkOutAt)}</strong></span>${row.workOrderId ? `<button data-action="open-job" data-id="${esc(row.workOrderId)}">${esc(job(row.workOrderId)?.number || "View job")}</button>` : ""}</div>`).join("") : `<p class="td-card-empty">No attendance records.</p>`}</div>`;
    const notesTab = `<div class="td-notes"><section class="td-card"><div class="td-card-head"><h3>${icon("file-text")}Notes</h3><button data-action="edit-technician" data-id="${esc(item.id)}">Edit</button></div><p>${esc(item.notes || "No notes recorded.")}</p></section>
      <section class="td-card"><div class="td-card-head"><h3>${icon("bell")}Notifications</h3></div>${notices.length ? notices.map(row => `<div class="td-notice"><span>${esc(job(row.workOrderId)?.number || "Work order")}</span>${badge(row.status)}<small>${row.acknowledgedAt ? `Acknowledged ${esc(day(row.acknowledgedAt))}` : "Not acknowledged"}</small>${["Failed", "Not Subscribed"].includes(row.status) ? iconButton("refresh-cw", "Retry notification", "retry-notification", row.id) : ""}</div>`).join("") : `<p class="td-card-empty">No notifications yet.</p>`}</section>
      <section class="td-card"><div class="td-card-head"><h3>${icon("shield-check")}Field Access</h3></div>${state.accessLink ? `<div class="maint-access-link"><label>Secure field link<input readonly value="${esc(state.accessLink)}"></label><button class="maint-outline" data-action="copy-access">Copy</button><small>Share this one-time link privately. It expires in 48 hours.</small></div>` : ""}<div class="td-access-actions"><button class="maint-outline" data-action="create-access" data-id="${esc(item.id)}">Create Access Link</button><button class="maint-outline danger" data-action="revoke-access" data-id="${esc(item.id)}">Revoke Access</button></div></section></div>`;
    const tabContent = state.technicianTab === "Overview" ? overview : state.technicianTab === "Today's Jobs" ? `<div class="td-tab-list">${jobList(todayJobs, Infinity)}</div>`
      : state.technicianTab === "Future Jobs" ? `<div class="td-tab-list">${jobList(future, Infinity, true)}</div>` : state.technicianTab === "Attendance" ? attendanceTab : notesTab;
    return `<section class="td-profile"><div class="td-profile-head">${dashAvatar(item.name)}<div class="td-profile-identity"><div><h2>${esc(item.name)}</h2><span class="td-status ${status.toLowerCase().replace(/\s+/g, "-")}"><i></i>${esc(status)}</span></div><small>${esc(item.code)} <span>|</span> Field Technician</small><div class="td-profile-contacts"><span title="${esc(item.phone || "")}">${icon("phone")}${esc(item.phone || "No phone")}</span><span title="${esc(item.email || "")}">${icon("mail")}${esc(item.email || "No email")}</span><span title="${esc(site)}">${icon("map-pin")}${esc(site)}</span></div></div>
      <div class="td-profile-actions"><button class="maint-primary" data-action="td-assign" data-id="${esc(item.id)}" ${!item.active || item.offDuty ? "disabled title=\"Technician is unavailable\"" : ""}>${icon("send")}Assign Job</button><button class="maint-outline" data-action="edit-technician" data-id="${esc(item.id)}">${icon("pencil")}Edit Technician</button><div class="td-more-wrap"><button class="maint-icon-button" data-action="td-more" aria-label="More technician actions" title="More technician actions">${icon("ellipsis")}</button>${state.technicianMoreMenu ? `<div class="td-more-menu"><button data-action="td-tab" data-tab="Attendance">Attendance History</button><button data-action="td-tab" data-tab="Notes">Notes & Field Access</button><button data-action="td-toggle" data-id="${esc(item.id)}">${item.active ? "Disable" : "Enable"} Technician</button><button class="maint-delete-option" data-action="delete-request" data-kind="technicians" data-id="${esc(item.id)}">${icon("trash-2")} Delete Technician</button></div>` : ""}</div></div></div>
      <nav class="td-tabs" aria-label="Technician profile sections">${["Overview", "Today's Jobs", "Future Jobs", "Attendance", "Notes"].map(tab => `<button class="${state.technicianTab === tab ? "active" : ""}" data-action="td-tab" data-tab="${tab}" aria-current="${state.technicianTab === tab ? "page" : "false"}">${tab}</button>`).join("")}</nav><div class="td-profile-body">${tabContent}</div></section>`;
  }

  function reports() {
    const all = state.data.reports.map(item => {
      const linked = job(item.workOrderId);
      const reportedNames = reportTechnicianNames(item.extracted?.technicianName);
      const reportedTechnicianIds = state.data.technicians.filter(person => reportedNames.some(name => name.toLowerCase() === person.name.toLowerCase().trim())).map(person => person.id);
      return { ...item, customerId: linked?.customerId || "", customerName: linked?.customerName || item.details?.customerName || item.extracted?.customerName || "",
        site: linked?.site || item.extracted?.siteName || "", serviceDate: linked?.serviceDate || item.extracted?.serviceDate || "",
        serviceTime: linked?.startTime || "", technicianIds: reportedNames.length ? reportedTechnicianIds : (linked?.technicianIds || []),
        workOrderNumber: linked?.number || "" };
    });
    const draft = state.reportFilterDraft, applied = state.reportFilters;
    const customers = [...new Set(all.map(item => item.customerName).filter(Boolean))].sort();
    const sites = [...new Set(all.map(item => item.site).filter(Boolean))].sort();
    const rangeMatch = item => {
      const value = item.serviceDate;
      if (applied.range === "all") return true;
      if (!value) return false;
      const current = today();
      if (applied.range === "month") return value.slice(0, 7) === current.slice(0, 7);
      if (applied.range === "previous") return value.slice(0, 7) === monthShift(current, -1);
      if (applied.range === "30days") return value >= shiftDay(current, -29) && value <= current;
      return (!applied.from || value >= applied.from) && (!applied.to || value <= applied.to);
    };
    const query = state.search.reports.toLowerCase().trim();
    const visible = all.filter(item => (!query || [item.number, item.workOrderNumber, item.customerName, item.site,
      ...item.technicianIds.map(id => tech(id)?.name || "")].join(" ").toLowerCase().includes(query))
      && (!applied.customer || item.customerName === applied.customer) && (!applied.site || item.site === applied.site)
      && (!applied.technician || item.technicianIds.includes(applied.technician))
      && (state.status.reports === "all" || item.status === state.status.reports) && rangeMatch(item));
    visible.sort((a, b) => state.reportSort === "oldest" ? String(a.submittedAt).localeCompare(String(b.submittedAt))
      : state.reportSort === "number" ? String(a.number).localeCompare(String(b.number), undefined, { numeric: true })
      : String(b.submittedAt).localeCompare(String(a.submittedAt)));
    if (state.recordId && state.selectedReportId === state.recordId) {
      const linkedIndex = visible.findIndex(item => item.id === state.recordId);
      if (linkedIndex >= 0) state.pageNumber.reports = Math.floor(linkedIndex / state.reportPageSize) + 1;
    }
    const pageCount = Math.max(1, Math.ceil(visible.length / state.reportPageSize));
    state.pageNumber.reports = Math.max(1, Math.min(state.pageNumber.reports || 1, pageCount));
    const currentPage = state.pageNumber.reports;
    const start = (currentPage - 1) * state.reportPageSize;
    const pageItems = visible.slice(start, start + state.reportPageSize);
    const selectedReport = state.selectedReportId === null ? null : visible.find(item => item.id === state.selectedReportId) || pageItems[0] || null;
    if (selectedReport) state.selectedReportId = selectedReport.id;
    const count = status => all.filter(item => item.status === status).length;
    const tone = status => ({ Submitted: "blue", Approved: "green", "Pending Review": "amber", Revision: "red", Rejected: "violet" })[status] || "blue";
    const statusBadge = status => `<span class="sr-badge ${tone(status)}"><i></i>${esc(status)}</span>`;
    const metric = (label, value, iconName, color, action = "") => `<${action ? "button" : "div"} class="sr-kpi ${color}" ${action ? `data-action="sr-status" data-status="${esc(action)}"` : ""}><span class="sr-kpi-icon">${icon(iconName)}</span><span class="sr-kpi-text"><strong>${value}</strong><small>${label}</small></span><span class="sr-mini-bars" aria-hidden="true"><i></i><i></i><i></i></span></${action ? "button" : "div"}>`;
    const statusTabs = [["all", "All Reports", all.length], ["Submitted", "Submitted", count("Submitted")], ["Approved", "Approved", count("Approved")],
      ["Pending Review", "Pending Review", count("Pending Review")], ["Revision", "Revision", count("Revision")], ["Rejected", "Rejected", count("Rejected")]];
    const directoryRows = pageItems.map(item => `<button class="sr-report-row ${item.id === selectedReport?.id ? "selected" : ""}" data-action="open-report" data-id="${esc(item.id)}" aria-current="${item.id === selectedReport?.id ? "true" : "false"}">
      <span class="sr-row-icon">${icon("file-text")}</span><span class="sr-row-main"><strong title="${esc(item.number)}">${esc(item.number)}</strong><small>${esc(reportDay(item.serviceDate))}${item.serviceTime ? `, ${esc(timeLabel(item.serviceTime))}` : ""}</small></span>
      <span class="sr-row-work"><strong title="${esc(item.workOrderNumber || "Not linked")}">${esc(item.workOrderNumber || "Not linked")}</strong><small title="${esc(item.customerName)}">${esc(item.customerName || "--")}</small></span>
      <span class="sr-row-site">${icon("building-2")}<span><strong title="${esc(item.customerName)}">${esc(item.customerName || "--")}</strong><small title="${esc(item.site)}">${esc(item.site || "--")}</small></span></span>
      <span class="sr-row-people" title="${esc(item.technicianIds.map(id => tech(id)?.name).filter(Boolean).join(", "))}">${item.technicianIds.slice(0, 3).map(id => tech(id)).filter(Boolean).map(dashAvatar).join("")}${item.technicianIds.length > 3 ? `<em>+${item.technicianIds.length - 3}</em>` : ""}</span>
      ${statusBadge(item.status)}${icon("chevron-right")}</button>`).join("");
    const pageStart = Math.max(1, Math.min(currentPage - 2, pageCount - 4));
    const pageButtons = Array.from({ length: Math.min(5, pageCount - pageStart + 1) }, (_, index) => pageStart + index)
      .map(number => `<button class="${number === currentPage ? "active" : ""}" data-action="sr-page" data-page="${number}" aria-label="Page ${number}" ${number === currentPage ? 'aria-current="page"' : ""}>${number}</button>`).join("");
    return `${header("Service Reports", "View and manage all submitted maintenance service reports.", "Upload SR", "upload-report", "Search by WO No., customer, site or technician...", false)}
      <div class="maint-body sr-page"><div class="sr-kpis">${metric("Total Reports", all.length, "file-text", "blue")}${metric("Approved", count("Approved"), "circle-check", "green", "Approved")}${metric("Pending Review", count("Pending Review"), "clock-3", "amber", "Pending Review")}${metric("Revision", count("Revision"), "refresh-cw", "red", "Revision")}${metric("Rejected", count("Rejected"), "file-text", "violet", "Rejected")}</div>
      <div class="sr-filters"><label>Date Range<select data-report-filter="range"><option value="all" ${selected(draft.range, "all")}>All Dates</option><option value="month" ${selected(draft.range, "month")}>This Month</option><option value="previous" ${selected(draft.range, "previous")}>Last Month</option><option value="30days" ${selected(draft.range, "30days")}>Last 30 Days</option><option value="custom" ${selected(draft.range, "custom")}>Custom Range</option></select></label>
      <label>Customer<select data-report-filter="customer"><option value="">All Customers</option>${customers.map(value => `<option value="${esc(value)}" ${selected(draft.customer, value)}>${esc(value)}</option>`).join("")}</select></label>
      <label>Site / Location<select data-report-filter="site"><option value="">All Locations</option>${sites.map(value => `<option value="${esc(value)}" ${selected(draft.site, value)}>${esc(value)}</option>`).join("")}</select></label>
      <label>Technician<select data-report-filter="technician"><option value="">All Technicians</option>${state.data.technicians.map(item => `<option value="${esc(item.id)}" ${selected(draft.technician, item.id)}>${esc(item.name)}</option>`).join("")}</select></label>
      <label>Status<select data-report-filter="status"><option value="all">All Status</option>${statusTabs.slice(1).map(([value]) => `<option value="${esc(value)}" ${selected(draft.status, value)}>${esc(value)}</option>`).join("")}</select></label>
      <div class="sr-filter-actions"><button class="maint-outline" data-action="sr-clear">Clear</button><button class="maint-primary" data-action="sr-apply">Apply</button></div>${draft.range === "custom" ? `<div class="sr-custom-dates"><label>From<input type="date" data-report-filter="from" value="${esc(draft.from)}"></label><label>To<input type="date" data-report-filter="to" value="${esc(draft.to)}"></label></div>` : ""}</div>
      <div class="sr-layout ${selectedReport ? "" : "no-detail"}"><section class="sr-directory"><div class="sr-directory-toolbar"><div class="sr-status-tabs">${statusTabs.map(([value, label, total]) => `<button class="${state.status.reports === value ? "active" : ""} ${tone(value)}" data-action="sr-status" data-status="${esc(value)}">${value === "all" ? "" : "<i></i>"}${esc(label)} <span>(${total})</span></button>`).join("")}</div><label class="sr-sort">${icon("list")}<select data-report-sort aria-label="Sort reports"><option value="newest" ${selected(state.reportSort, "newest")}>Newest First</option><option value="oldest" ${selected(state.reportSort, "oldest")}>Oldest First</option><option value="number" ${selected(state.reportSort, "number")}>Report Number</option></select></label></div>
      <div class="sr-report-list">${directoryRows || `<div class="sr-empty">No matching service reports</div>`}</div><div class="sr-pagination"><span>Showing ${visible.length ? start + 1 : 0} to ${Math.min(start + state.reportPageSize, visible.length)} of ${visible.length} reports</span><div><label>Rows per page<select data-report-page-size><option ${selected(state.reportPageSize, 10)}>10</option><option ${selected(state.reportPageSize, 20)}>20</option><option ${selected(state.reportPageSize, 50)}>50</option></select></label>${iconButton("chevron-left", "Previous page", "sr-page-prev", "", currentPage === 1)}${pageButtons}${iconButton("chevron-right", "Next page", "sr-page-next", "", currentPage === pageCount)}</div></div></section>
      ${selectedReport ? reportDetail(selectedReport) : ""}</div></div>`;
  }

  function reportDetail(item) {
    const linked = job(item.workOrderId);
    const agreement = contract(item.contractId || linked?.contractId);
    const tabs = ["Report Details", "Checklist", "Images", "History"];
    const attached = (item.fileIds || []).map(id => state.data.files.find(file => file.id === id)).filter(Boolean);
    const images = attached.filter(file => file.mimeType?.startsWith("image/"));
    const original = attached.find(file => file.id === item.originalFileId);
    const stamp = value => value ? new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dubai", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true }).format(new Date(value)) : "--";
    const serviceWhen = `${reportDay(linked?.serviceDate || item.extracted?.serviceDate)}${linked?.startTime ? `, ${timeLabel(linked.startTime)}${linked.endTime ? ` - ${timeLabel(linked.endTime)}` : ""}` : ""}`;
    const submittedBy = tech(item.submittedBy)?.name || item.submittedBy || "--";
    const names = reportTechnicianNames(item.extracted?.technicianName);
    if (!names.length) names.push(...(linked?.technicianIds || []).map(id => tech(id)?.name).filter(Boolean));
    const namedTechnicians = state.data.technicians.filter(person => names.some(name => name.toLowerCase() === person.name.toLowerCase().trim()));
    const infoItem = (label, value, iconName, extra = "") => `<div class="sr-info-item">${icon(iconName)}<span><small>${label}</small><strong>${value || "--"}</strong>${extra}</span></div>`;
    const attachment = (file, compact = false) => file.mimeType?.startsWith("image/") ? `<button class="sr-image ${compact ? "compact" : ""}" data-action="sr-preview" data-id="${esc(file.id)}" title="${esc(file.originalName)}"><img src="/api/maintenance/files/${encodeURIComponent(file.id)}" alt="${esc(file.originalName)}">${compact ? "" : `<small>${esc(file.kind || "Image")} - ${esc(file.originalName)}</small>`}</button>`
      : `<a class="sr-image document" href="/api/maintenance/files/${encodeURIComponent(file.id)}" target="_blank" rel="noopener" title="${esc(file.originalName)}">${icon("file-text")}<small>${esc(file.originalName)}</small></a>`;
    const description = item.details?.workCarriedOut || item.extracted?.workCarriedOut || "No description recorded.";
    let content = "";
    if (state.reportTab === "Report Details") {
      content = `<div class="sr-info-card"><div class="sr-info-column">
        ${infoItem("Work Order", linked?.number ? `<button class="sr-link" data-action="open-job" data-id="${esc(linked.id)}">${esc(linked.number)}</button>` : "Not linked", "clipboard-list")}
        ${infoItem("Customer", esc(linked?.customerName || item.details?.customerName || item.extracted?.customerName || "--"), "user-round")}
        ${infoItem("Site / Location", esc(linked?.site || item.extracted?.siteName || "--"), "map-pin")}
        ${infoItem("Service Date & Time", esc(serviceWhen), "calendar-days")}
        ${infoItem("Report Submitted By", esc(submittedBy), "user-round")}
        ${infoItem("Submitted On", esc(stamp(item.submittedAt)), "calendar")}</div><div class="sr-info-column">
        ${infoItem("AMC Contract", agreement ? `<button class="sr-link" data-action="open-contract-search" data-id="${esc(agreement.id)}">${esc(agreement.number)}</button>` : "Non-AMC", "file-text")}
        ${agreement ? infoItem("AMC Site Location", esc(agreement.site || "--"), "map-pin") : ""}
        ${infoItem("Service Type", esc(linked?.workType || item.type || "--"), "wrench")}
        ${infoItem("Assigned Technicians", names.length ? `<span class="sr-assigned-avatars">${namedTechnicians.slice(0, 4).map(dashAvatar).join("")}</span><span class="sr-assigned-names">${esc(names.join(", "))}</span>` : "--", "users-round")}
        ${infoItem("Lead Technician", esc(tech(linked?.leadTechnicianId)?.name || "--"), "user-round")}</div></div>
        <section class="sr-gallery"><div class="sr-section-heading"><h3>Service Report Images (${images.length})</h3><button data-action="report-tab" data-tab="Images">View All</button></div><div class="sr-gallery-strip">${images.length ? images.slice(0, 4).map(file => attachment(file, true)).join("") : `<span class="sr-empty-inline">No report images attached.</span>`}${images.length > 4 ? `<button class="sr-gallery-more" data-action="report-tab" data-tab="Images">+${images.length - 4}</button>` : ""}</div>${original ? `<a class="sr-original-link" href="/api/maintenance/files/${encodeURIComponent(original.id)}" target="_blank" rel="noopener">${icon("file-text")}View Original Handwritten Report</a>` : ""}</section>
        <section class="sr-description">${icon("file-text")}<div><h3>Description of Work</h3><p>${esc(description)}</p>${item.details?.materialsUsed ? `<p><strong>Materials used:</strong> ${esc(item.details.materialsUsed)}</p>` : ""}${item.details?.remarks ? `<p><strong>Remarks:</strong> ${esc(item.details.remarks)}</p>` : ""}</div></section>`;
    } else if (state.reportTab === "Checklist") {
      const groups = Object.entries(item.checklist || {});
      content = item.type === "Digital Checklist" && groups.length ? `<div class="sr-checklist">${groups.map(([group, entries]) => `<section><h3>${esc(group === "indoor" ? "Indoor Unit" : group === "outdoor" ? "Outdoor Unit" : group)}</h3>${Object.entries(entries || {}).map(([label, value]) => `<div class="sr-check-item"><strong>${esc(label)}</strong>${badge(value?.value || "--")}<small>${esc(value?.note || "")}</small></div>`).join("")}</section>`).join("")}</div>`
        : `<div class="sr-checklist-note">${item.type === "Handwritten Upload" ? "Checklist results were not submitted digitally. Review the original paper report and extracted details below." : "No digital checklist was submitted."}</div>`;
      const issues = groups.flatMap(([group, entries]) => Object.entries(entries || {}).filter(([, value]) => value?.value === "Issue")
        .map(([label, value]) => ({ group, label, note: value.note || "" })));
      if (issues.length) content += `<section class="sr-check-issues"><h3>Reported Issues</h3>${issues.map(issue => `<p><strong>${esc(issue.group === "indoor" ? "Indoor Unit" : issue.group === "outdoor" ? "Outdoor Unit" : issue.group)} - ${esc(issue.label)}:</strong> ${esc(issue.note || "Issue reported")}</p>`).join("")}</section>`;
      if (item.details?.remarks) content += `<div class="sr-check-notes"><p><strong>Technician remarks:</strong> ${esc(item.details.remarks)}</p></div>`;
      if (item.type === "Handwritten Upload") content += `<div class="sr-extracted"><h3>Extracted Details</h3>${Object.entries(item.extracted || {}).filter(([key, value]) => key !== "workOrderNumber" && value).map(([key, value]) => `<div><strong>${esc(key === "reportNumber" ? "Service Report Number" : key.replace(/([A-Z])/g, " $1"))}</strong><span>${esc(value)}</span></div>`).join("") || `<p>No extracted checklist details available.</p>`}${original ? `<a href="/api/maintenance/files/${encodeURIComponent(original.id)}" target="_blank" rel="noopener">View original handwritten report</a>` : ""}</div>`;
      const checklistPhotos = attached.filter(file => file.kind === "photo" && file.mimeType?.startsWith("image/"));
      if (checklistPhotos.length) content += `<section class="sr-check-photos"><h3>Service Photos (${checklistPhotos.length})</h3><div class="sr-image-grid">${checklistPhotos.map(file => attachment(file)).join("")}</div></section>`;
      const signature = attached.find(file => file.id === item.signatureFileId);
      if (signature) content += `<div class="sr-signature"><h3>Customer Signature</h3>${attachment(signature)}</div>`;
    } else if (state.reportTab === "Images") {
      content = attached.length ? `<div class="sr-image-grid">${attached.map(file => attachment(file)).join("")}</div>` : `<p class="sr-empty-inline">No files attached to this report.</p>`;
    } else {
      const events = [...(item.history || [])];
      if (item.createdAt) events.push({ at: item.createdAt, actor: "System", action: "Report created" });
      events.sort((a, b) => String(b.at).localeCompare(String(a.at)));
      content = events.length ? `<div class="sr-history">${events.map(row => `<div><span class="sr-history-dot"></span><span><strong>${esc(row.action)}</strong><small>${esc(row.actor || "System")} - ${esc(stamp(row.at))}</small>${row.reason ? `<p>${esc(row.reason)}</p>` : ""}</span></div>`).join("")}</div>` : `<p class="sr-empty-inline">No report activity recorded.</p>`;
    }
    const previewIndex = images.findIndex(file => file.id === state.reportPreviewFileId);
    const preview = previewIndex >= 0 ? `<div class="sr-preview" role="dialog" aria-modal="true" aria-label="Report image preview"><div class="sr-preview-top"><strong>${esc(images[previewIndex].originalName)}</strong><button data-action="sr-preview-close" aria-label="Close image preview">${icon("x")}</button></div><div class="sr-preview-stage"><button data-action="sr-preview-prev" aria-label="Previous image" ${images.length < 2 ? "disabled" : ""}>${icon("chevron-left")}</button><img src="/api/maintenance/files/${encodeURIComponent(images[previewIndex].id)}" alt="${esc(images[previewIndex].originalName)}"><button data-action="sr-preview-next" aria-label="Next image" ${images.length < 2 ? "disabled" : ""}>${icon("chevron-right")}</button></div><small>${previewIndex + 1} of ${images.length}</small></div>` : "";
    return `<section class="sr-detail"><header class="sr-detail-head"><div><h2>${esc(item.number)} <span class="sr-badge ${({ Submitted: "blue", Approved: "green", "Pending Review": "amber", Revision: "red", Rejected: "violet" })[item.status] || "blue"}"><i></i>${esc(item.status)}</span></h2><p>${esc(stamp(item.submittedAt))} <span>-</span> Submitted by ${esc(submittedBy)}</p></div><div class="sr-detail-actions"><div class="sr-detail-tools">${iconButton("x", "Close report", "close-report")}<div class="sr-more-wrap">${iconButton("ellipsis", "More report actions", "sr-more")}${state.reportMoreMenu ? `<div class="sr-more-menu"><a data-action="sr-view-pdf" href="/api/maintenance/reports/${encodeURIComponent(item.id)}/pdf" target="_blank" rel="noopener">${icon("file-text")}View PDF</a>${item.type === "Handwritten Upload" && item.status !== "Approved" ? `<button data-action="edit-report" data-id="${esc(item.id)}">${icon("pencil")}Edit SR</button>` : ""}<button class="maint-delete-option" data-action="delete-request" data-kind="reports" data-id="${esc(item.id)}">${icon("trash-2")} Delete Service Report</button></div>` : ""}</div></div></div></header>
      <nav class="sr-detail-tabs" aria-label="Service report sections">${tabs.map(tab => `<button data-action="report-tab" data-tab="${tab}" class="${tab === state.reportTab ? "active" : ""}" aria-current="${tab === state.reportTab ? "page" : "false"}">${tab === "Images" ? `Images (${images.length})` : tab}</button>`).join("")}</nav>
      <div class="sr-detail-body">${content}</div>${item.status !== "Approved" ? `<div class="sr-review-actions"><button class="maint-primary" data-action="review-approve" data-id="${esc(item.id)}">${icon("check")}Approve</button><button class="maint-outline" data-action="review-revision" data-id="${esc(item.id)}">Request Revision</button><button class="maint-outline danger" data-action="review-reject" data-id="${esc(item.id)}">Reject</button></div>` : ""}${preview}</section>`;
  }

  function formField(label, name, value = "", type = "text", required = false, extra = "") {
    return `<label class="maint-field"><span>${esc(label)}${required ? " *" : ""}</span><input name="${name}" type="${type}" value="${esc(value)}" ${required ? "required" : ""} ${extra}></label>`;
  }

  function drawerShell(title, body, actions) {
    return `<div class="maint-overlay" data-action="close-drawer"><section class="maint-drawer" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <header><div><h2>${esc(title)}</h2><p>Comfort Zone AC Maintenance</p></div>${iconButton("x", "Close drawer", "close-drawer")}</header>
      <div class="maint-drawer-scroll">${body}</div><footer>${actions}</footer></section></div>`;
  }

  const reportTechnicianNames = value => [...new Map(String(value || "").split(/[,;\n]+/).map(name => name.trim()).filter(Boolean)
    .map(name => [name.toLowerCase(), name])).values()];

  function reportTechnicianField(name, value) {
    const names = reportTechnicianNames(value);
    return `<div class="maint-field maint-report-technicians"><span>Technicians</span><div class="maint-report-tech-control">
      <div class="maint-report-tech-tags">${names.map(person => `<span class="maint-report-tech-tag">${esc(person)}<button type="button" data-action="report-tech-remove" data-name="${esc(person)}" title="Remove ${esc(person)}" aria-label="Remove ${esc(person)}">${icon("x")}</button></span>`).join("")}</div>
      <div class="maint-report-tech-entry"><input data-report-tech-input list="maintReportTechnicianOptions" autocomplete="off" aria-label="Add technician"><button type="button" data-action="report-tech-add" title="Add technician" aria-label="Add technician">${icon("plus")}</button></div>
      <input type="hidden" name="${esc(name)}" value="${esc(names.join(", "))}"></div>
      <datalist id="maintReportTechnicianOptions">${state.data.technicians.map(person => `<option value="${esc(person.name)}"></option>`).join("")}</datalist></div>`;
  }

  function updateReportTechnicians(control, names) {
    const people = reportTechnicianNames(names.join(", "));
    control.querySelector('input[type="hidden"]').value = people.join(", ");
    control.querySelector(".maint-report-tech-tags").innerHTML = people.map(person => `<span class="maint-report-tech-tag">${esc(person)}<button type="button" data-action="report-tech-remove" data-name="${esc(person)}" title="Remove ${esc(person)}" aria-label="Remove ${esc(person)}">${icon("x")}</button></span>`).join("");
  }

  function commitReportTechnicianInput(form) {
    const control = form?.querySelector(".maint-report-technicians");
    if (!control) return;
    const input = control.querySelector("[data-report-tech-input]");
    if (!input.value.trim()) return;
    const names = reportTechnicianNames(control.querySelector('input[type="hidden"]').value);
    updateReportTechnicians(control, [...names, ...reportTechnicianNames(input.value)]);
    input.value = "";
  }

  function reportUploadDrawer() {
    const upload = state.srUpload || { fields: {}, fileId: "", message: "Choose a clear service report image or PDF. Extracted fields can be corrected before review." };
    const fields = [["reportNumber", "Service Report Number"], ["serviceDate", "Service Date"], ["customerName", "Customer Name"], ["siteName", "Site / Location"],
      ["technicianName", "Technicians"], ["unitNumber", "Unit Number"], ["modelNumber", "Model Number"],
      ["serialNumber", "Serial Number"], ["refrigerant", "Refrigerant"], ["quantity", "Quantity"], ["jobCompletion", "Job Completion"]];
    const descriptions = [["workCarriedOut", "Work Carried Out"], ["materialsUsed", "Materials Used"], ["remarks", "Remarks"]];
    return drawerShell("Upload Service Report", `<form id="maintReportUploadForm" class="maint-form">
      <label class="maint-field"><span>Service Report Image or PDF *</span><input type="file" data-report-upload accept="image/*,.pdf,application/pdf" ${upload.fileId ? "" : "required"}></label>
      <p class="maint-form-hint ${upload.error ? "maint-upload-error" : ""}" role="status">${esc(upload.message || "")}</p>
      ${upload.fileId ? `<p class="maint-upload-file">${icon("file-check-2")}${esc(upload.fileName || "Service report uploaded")}</p>
        <section class="maint-form-section"><div><h3>Review Extracted Details</h3></div><p class="maint-form-hint">Confirm or correct the extracted values before sending this report for review.</p>
        <div class="maint-form-grid">${fields.map(([key, label]) => key === "technicianName" ? reportTechnicianField(key, upload.fields?.[key] || "") : formField(label, key, upload.fields?.[key] || "")).join("")}</div>
        ${descriptions.map(([key, label]) => `<label class="maint-field"><span>${label}</span><textarea name="${key}" rows="3">${esc(upload.fields?.[key] || "")}</textarea></label>`).join("")}</section>` : ""}
      </form>`, `<button class="maint-outline" data-action="close-drawer">Cancel</button><button class="maint-primary" data-action="submit-report-upload" ${upload.fileId ? "" : "disabled"}>${icon("send")}Submit for Review</button>`);
  }

  function reportAmcOptions(customerName, siteName, selectedId) {
    const customer = String(customerName || "").trim().toLowerCase();
    const site = String(siteName || "").trim().toLowerCase();
    const matches = state.data.contracts.filter(item => item.id === selectedId || (customer
      ? item.customerName?.toLowerCase().includes(customer) : !site || item.site?.toLowerCase().includes(site)));
    return `<option value="">No linked AMC</option>${matches.map(item => `<option value="${esc(item.id)}" ${selected(item.id, selectedId)}>${esc(item.number)} · ${esc(item.customerName)} · ${esc(item.site)}</option>`).join("")}`;
  }

  function updateReportAmcSelect(form) {
    const select = form.elements.namedItem("contractId"), selectedId = select.value;
    select.innerHTML = reportAmcOptions(form.elements.namedItem("extracted_customerName").value,
      form.elements.namedItem("extracted_siteName").value, selectedId);
    select.value = selectedId;
  }

  function showReportCustomerOptions(input) {
    const list = input.parentElement.querySelector("[data-report-customer-options]");
    const query = input.value.trim().toLowerCase();
    const names = [...new Set(state.data.contracts.map(item => item.customerName).filter(Boolean))]
      .filter(name => query && name.toLowerCase().includes(query)).sort((a, b) => a.localeCompare(b));
    list.innerHTML = names.map((name, index) => `<button type="button" role="option" id="maintReportCustomerOption-${index}" data-action="report-customer-choice" data-name="${esc(name)}">${esc(name)}</button>`).join("");
    list.hidden = !names.length;
    input.setAttribute("aria-expanded", String(!!names.length));
    input.removeAttribute("aria-activedescendant");
  }

  function hideReportCustomerOptions(input) {
    input.parentElement.querySelector("[data-report-customer-options]").hidden = true;
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
  }

  function reportEditDrawer() {
    const item = report(state.drawerId);
    if (!item) return "";
    const availableJobs = state.data.workOrders.filter(job => job.id === item.workOrderId || (job.status !== "Completed"
      && !state.data.reports.some(other => other.id !== item.id && other.workOrderId === job.id)));
    const fields = [["reportNumber", "Service Report Number"], ["serviceDate", "Service Date"], ["customerName", "Customer Name"], ["siteName", "Site / Location"],
      ["technicianName", "Technicians"], ["unitNumber", "Unit Number"], ["modelNumber", "Model Number"],
      ["serialNumber", "Serial Number"], ["refrigerant", "Refrigerant"], ["quantity", "Quantity"], ["jobCompletion", "Job Completion"]];
    const details = [["workCarriedOut", "Work Carried Out"], ["materialsUsed", "Materials Used"], ["remarks", "Remarks"]];
    const selectedContractId = item.contractId || job(item.workOrderId)?.contractId || "";
    const customerName = item.extracted?.customerName || item.details?.customerName || job(item.workOrderId)?.customerName || "";
    return drawerShell(`Edit ${item.number}`, `<form id="maintReportEditForm" class="maint-form"><p class="maint-form-hint">Update the extracted service report details before approval. The uploaded original is retained.</p>
      <label class="maint-field"><span>Link to Work Order (optional)</span><select name="workOrderId"><option value="">No linked work order</option>${availableJobs.map(job => `<option value="${esc(job.id)}" ${selected(item.workOrderId, job.id)}>${esc(job.number)} · ${esc(job.customerName)} · ${esc(job.site)}</option>`).join("")}</select></label>
      <section class="maint-form-section"><div><h3>Report Information</h3></div><div class="maint-form-grid">${fields.map(([key, label]) => key === "technicianName" ? reportTechnicianField(`extracted_${key}`, item.extracted?.[key] || "") : key === "customerName" ? `<div class="maint-field maint-report-customer"><span>Customer Name</span><input name="extracted_customerName" value="${esc(customerName)}" autocomplete="off" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="maintReportCustomerOptions" data-report-customer-input><div class="maint-report-customer-options" id="maintReportCustomerOptions" role="listbox" data-report-customer-options hidden></div></div>` : formField(label, `extracted_${key}`, key === "reportNumber" ? (item.extracted?.reportNumber || item.number) : (item.extracted?.[key] || ""), "text", key === "reportNumber")).join("")}
        <label class="maint-field"><span>AMC Register</span><select name="contractId">${reportAmcOptions(customerName, item.extracted?.siteName, selectedContractId)}</select></label></div></section>
      <section class="maint-form-section"><div><h3>Work Summary</h3></div>
        ${details.map(([key, label]) => `<label class="maint-field"><span>${label}</span><textarea name="detail_${key}" rows="3">${esc(item.details?.[key] || "")}</textarea></label>`).join("")}</section></form>`,
      `<button class="maint-outline" data-action="close-drawer">Cancel</button><button class="maint-primary" data-action="save-report-edit">${icon("save")}Save Changes</button>`);
  }

  function amcDrawer() {
    const item = contract(state.drawerId) || {};
    const start = item.startDate || today();
    const end = item.endDate || new Date(new Date(`${start}T12:00:00`).setFullYear(new Date(`${start}T12:00:00`).getFullYear() + 1) - 86400000).toISOString().slice(0, 10);
    const rows = (item.units?.length ? item.units : [{ reference: "", type: "", quantity: 1, location: "" }]).map(unit => `<div class="maint-unit-row">${formField("Reference", "reference", unit.reference)}${formField("Type", "type", unit.type)}${formField("Qty", "quantity", unit.quantity, "number", false, 'min="1"')}${formField("Location", "location", unit.location)}${iconButton("x", "Remove unit", "remove-unit")}</div>`).join("");
    const body = `<form id="maintAmcForm" class="maint-form">
      <div class="maint-form-grid">${item.id ? formField("AMC Number", "number", item.number, "text", true, 'autocomplete="off" spellcheck="false"') : ""}${formField("Customer", "customerName", item.customerName, "text", true, 'autocomplete="organization"')}
      ${formField("Site / Location", "site", item.site, "text", true)}
      ${formField("Contact Person", "contact", item.contact)}${formField("Phone", "phone", item.phone, "tel")}
      ${formField("Email", "email", item.email, "email")}
      ${formField("Contract Start", "startDate", start, "date", true)}${formField("Contract End", "endDate", end, "date", true)}
      ${formField("Contract Value (AED)", "contractValue", item.contractValue || "", "number", false, 'min="0" step="0.01"')}
      <label class="maint-field"><span>Frequency *</span><select name="frequency">${["Monthly", "Quarterly", "Half-Yearly", "Custom"].map(value => `<option ${selected(item.frequency || "Quarterly", value)}>${value}</option>`).join("")}</select></label>
      ${formField("Visits per Year", "visitsPerYear", item.visitsPerYear || 4, "number", true, `min="1" max="52" ${(item.frequency || "Quarterly") === "Custom" ? "" : "readonly"}`)}
      <label class="maint-field"><span>Status</span><select name="status">${["Active", "Paused", "Cancelled"].map(value => `<option ${selected(item.status || "Active", value)}>${value}</option>`).join("")}</select></label>
      ${formField("Number of AC Units", "unitCount", item.unitCount || 1, "number", true, 'min="1"')}
      </div><label class="maint-field"><span>Notes</span><textarea name="notes" rows="3">${esc(item.notes || "")}</textarea></label>
      <div class="maint-form-section"><div><h3>Covered Units</h3><button type="button" class="maint-link" data-action="add-unit">+ Add Unit</button></div><div id="maintUnitRows">${rows}</div></div>
      </form>`;
    return drawerShell(item.id ? `Edit ${item.number}` : "New AMC Contract", body, `<button class="maint-outline" data-action="close-drawer">Cancel</button><button class="maint-primary" data-action="save-amc">${icon("save")} Save AMC</button>`);
  }

  function availability(technicianId, draft) {
    if (!draft.serviceDate || !draft.startTime || !draft.endTime) return "Available";
    const conflict = state.data.workOrders.find(item => item.id !== draft.workOrderId && item.serviceDate === draft.serviceDate && item.status !== "Completed"
      && item.technicianIds.includes(technicianId) && item.startTime < draft.endTime && draft.startTime < item.endTime);
    return conflict ? `Busy: ${conflict.number}` : "Available";
  }

  function scheduleDrawer() {
    const d = state.scheduleDraft || {};
    const chosenContract = contract(d.contractId);
    const visits = state.data.visits.filter(item => item.contractId === d.contractId && (item.status !== "Completed" || item.id === d.visitId));
    const selectable = state.data.technicians.filter(item => item.active);
    const body = `<form id="maintScheduleForm" class="maint-form"><div class="maint-form-section"><h3>Customer / AMC</h3><div class="maint-form-grid">
      ${formField("Customer", "customerName", d.customerName || chosenContract?.customerName || "", "text", true, 'autocomplete="organization"')}
      <label class="maint-field"><span>AMC Contract</span><select name="contractId" data-schedule-change="contract"><option value="">Non-AMC job</option>${state.data.contracts.map(item => `<option value="${item.id}" ${selected(d.contractId, item.id)}>${esc(item.number)} · ${esc(item.site)}</option>`).join("")}</select></label>
      <label class="maint-field"><span>Planned PM Visit</span><select name="visitId"><option value="">Choose visit (optional)</option>${visits.map(item => `<option value="${item.id}" ${selected(d.visitId, item.id)} ${item.workOrderId && item.workOrderId !== d.workOrderId ? "disabled" : ""}>Visit ${item.sequence} · ${day(item.plannedDate)}${item.workOrderId && item.workOrderId !== d.workOrderId ? " · Already scheduled" : ""}</option>`).join("")}</select></label>
      ${formField("Site / Location", "site", d.site || chosenContract?.site || "", "text", true)}
      ${formField("Contact Person", "contact", d.contact || chosenContract?.contact || "")}${formField("Phone", "phone", d.phone || chosenContract?.phone || "", "tel")}</div></div>
      <div class="maint-form-section"><h3>Visit Details</h3><div class="maint-form-grid"><label class="maint-field"><span>Work Type *</span><select name="workType">${["Preventive Maintenance", "Complaint / Repair", "Inspection", "Emergency Service", "Other"].map(value => `<option ${selected(d.workType || "Preventive Maintenance", value)}>${value}</option>`).join("")}</select></label>
      <label class="maint-field"><span>Priority</span><select name="priority"><option ${selected(d.priority || "Normal", "Normal")}>Normal</option><option ${selected(d.priority, "Urgent")}>Urgent</option></select></label>
      ${formField("Service Date", "serviceDate", d.serviceDate || state.selectedDate, "date", true, 'data-schedule-change="time"')}
      ${formField("Start Time", "startTime", d.startTime || "09:00", "time", true, 'data-schedule-change="time"')}
      ${formField("End Time", "endTime", d.endTime || "12:00", "time", true, 'data-schedule-change="time"')}</div></div>
      <div class="maint-form-section"><h3>Assign Individual Technicians</h3><p class="maint-form-hint">Choose 2-5 technicians for preventive maintenance, then designate the lead.</p>
      <label class="maint-search technician-search">${icon("search")}<input data-tech-search placeholder="Search technicians..." aria-label="Search technicians"></label>
      <div class="maint-tech-picker">${selectable.length ? selectable.map(item => `<label data-tech-option="${esc(item.name.toLowerCase())}"><input type="checkbox" name="technicianIds" value="${item.id}" ${checked(d.technicianIds?.includes(item.id))}><span>${esc(item.name)}<small>${esc(availability(item.id, d))}</small></span></label>`).join("") : `<p class="maint-muted">Add technicians before publishing assignments.</p>`}</div>
      <label class="maint-field"><span>Lead Technician *</span><select name="leadTechnicianId"><option value="">Select lead</option>${selectable.filter(item => d.technicianIds?.includes(item.id)).map(item => `<option value="${item.id}" ${selected(d.leadTechnicianId, item.id)}>${esc(item.name)}</option>`).join("")}</select></label></div>
      <label class="maint-field"><span>Work Instructions</span><textarea name="instructions" rows="4" placeholder="Check filters, coils, drainage, electrical connections and cooling performance.">${esc(d.instructions || "")}</textarea></label></form>`;
    return drawerShell(d.workOrderId ? `Edit ${job(d.workOrderId)?.number || "Schedule"}` : "New Maintenance Schedule", body,
      `<button class="maint-outline" data-action="close-drawer">Cancel</button><button class="maint-outline" data-action="save-schedule-draft">${icon("save")} Save Draft</button><button class="maint-primary" data-action="save-schedule-notify">${icon("send")} Save & Notify</button>`);
  }

  function technicianDrawer() {
    const item = tech(state.drawerId) || {};
    const body = `<form id="maintTechnicianForm" class="maint-form"><div class="maint-form-grid">
      ${formField("Technician Name", "name", item.name, "text", true)}${formField("Phone Number", "phone", item.phone, "tel", true)}
      ${formField("Technician ID", "code", item.code, "text", !!item.id)}${formField("Email", "email", item.email, "email")}</div>
      <div class="maint-form-grid"><label class="maint-field"><span>Status</span><select name="active"><option value="true" ${selected(item.active !== false, true)}>Active</option><option value="false" ${selected(item.active, false)}>Inactive</option></select></label>
      <label class="maint-check"><input type="checkbox" name="offDuty" ${checked(item.offDuty)}> Off Duty</label></div>
      <label class="maint-field"><span>Notes</span><textarea name="notes" rows="4">${esc(item.notes || "")}</textarea></label></form>`;
    return drawerShell(item.id ? `Edit ${item.name}` : "New Technician", body, `<button class="maint-outline" data-action="close-drawer">Cancel</button><button class="maint-primary" data-action="save-technician">${icon("save")} Save Technician</button>`);
  }

  function reviewDrawer() {
    const decision = state.drawer === "review-approve" ? "Approved" : state.drawer === "review-revision" ? "Revision" : "Rejected";
    return drawerShell(`${decision === "Approved" ? "Approve" : decision === "Revision" ? "Request Revision" : "Reject"} Service Report`,
      `<form id="maintReviewForm" class="maint-form"><p>${esc(report(state.drawerId)?.number)}${job(report(state.drawerId)?.workOrderId)?.number ? ` · ${esc(job(report(state.drawerId)?.workOrderId)?.number)}` : ""}</p>
      <label class="maint-field"><span>${decision === "Approved" ? "Review note (optional)" : "Reason *"}</span><textarea name="reason" rows="5" ${decision === "Approved" ? "" : "required"} placeholder="${decision === "Approved" ? "Add any final review note" : "Describe what the technician needs to correct"}"></textarea></label></form>`,
      `<button class="maint-outline" data-action="close-drawer">Cancel</button><button class="maint-primary" data-action="submit-review" data-decision="${decision}">Confirm ${decision}</button>`);
  }

  function drawer() {
    if (!state.drawer) return "";
    if (state.drawer === "amc") return amcDrawer();
    if (state.drawer === "schedule") return scheduleDrawer();
    if (state.drawer === "technician") return technicianDrawer();
    if (state.drawer === "report-upload") return reportUploadDrawer();
    if (state.drawer === "report-edit") return reportEditDrawer();
    return reviewDrawer();
  }

  function render() {
    if (!state.data) return;
    const key = `${state.page}:${state.recordId}`;
    const scroller = root.closest(".maintenance-view") || document.scrollingElement;
    const preserveScroll = key === lastRenderKey;
    const scrollTop = preserveScroll ? scroller?.scrollTop || 0 : 0;
    const windowScroll = preserveScroll ? window.scrollY : 0;
    const drawerScroll = root.querySelector(".maint-drawer-scroll")?.scrollTop || 0;
    const active = document.activeElement;
    const restoreFocus = preserveScroll && lastRenderedDrawer === state.drawer && root.contains(active) && active.matches?.("input, select, textarea");
    const focusSelector = restoreFocus ? active.dataset.search !== undefined ? "[data-search]"
      : active.dataset.techDirectorySearch !== undefined ? "[data-tech-directory-search]"
      : active.dataset.filter !== undefined ? `[data-filter="${active.dataset.filter}"]`
      : active.matches("[data-filter-status]") ? "[data-filter-status]"
      : active.matches("[data-page-size]") ? "[data-page-size]"
      : active.name ? `.maint-form [name="${CSS.escape(active.name)}"]${active.type === "checkbox" ? `[value="${CSS.escape(active.value)}"]` : ""}` : "" : "";
    let selection = null;
    try { selection = restoreFocus ? [active.selectionStart, active.selectionEnd] : null; } catch {}
    const content = state.page === "amc" ? amc() : state.page === "schedule" ? schedule() : state.page === "work-orders" ? workOrders()
      : state.page === "technicians" ? technicians() : state.page === "reports" ? reports() : dashboard();
    root.innerHTML = `<div class="maint-page ${state.page === "amc" ? "maint-amc-page" : state.page === "schedule" ? "maint-pm-page" : state.page === "work-orders" ? state.recordId ? "maint-wo-detail-page" : "maint-wo-page" : state.page === "technicians" ? "maint-tech-page" : state.page === "reports" ? "maint-reports-page" : ""}">${content}${state.message ? `<div class="maint-toast" role="status">${esc(state.message)}</div>` : ""}${drawer()}</div>`;
    document.body.classList.toggle("maint-drawer-open", !!state.drawer);
    if (scroller) scroller.scrollTop = scrollTop;
    const nextDrawerScroll = root.querySelector(".maint-drawer-scroll");
    if (nextDrawerScroll && lastRenderedDrawer === state.drawer) nextDrawerScroll.scrollTop = drawerScroll;
    if (focusSelector) {
      const replacement = root.querySelector(focusSelector);
      replacement?.focus({ preventScroll: true });
      if (selection && selection[0] !== null) try { replacement?.setSelectionRange(...selection); } catch {}
    }
    if (scroller) scroller.scrollTop = scrollTop;
    window.scrollTo(0, windowScroll);
    lastRenderKey = key;
    lastRenderedDrawer = state.drawer;
  }

  function openDrawer(type, id = "", options = {}) {
    const trigger = document.activeElement;
    drawerReturnFocus = root.contains(trigger) && trigger?.dataset?.action
      ? { action: trigger.dataset.action, id: trigger.dataset.id || "" } : null;
    state.drawer = type;
    state.drawerId = id;
    if (type === "schedule") {
      const existing = state.data.schedules.find(item => item.id === id) || state.data.schedules.find(item => item.workOrderId === id);
      state.scheduleDraft = existing ? { ...existing, technicianIds: [...existing.technicianIds] }
        : { clientKey: crypto.randomUUID(), customerName: "", contractId: options.contractId || "", visitId: options.visitId || "",
          serviceDate: options.serviceDate || state.selectedDate, startTime: "09:00", endTime: "12:00",
          workType: options.workType || "Preventive Maintenance", priority: "Normal", technicianIds: [...(options.technicianIds || [])], leadTechnicianId: options.leadTechnicianId || "", instructions: "" };
      if (options.contractId) {
        const item = contract(options.contractId);
        Object.assign(state.scheduleDraft, { customerName: item?.customerName || "", site: item?.site || "", contact: item?.contact || "", phone: item?.phone || "" });
      }
    }
    render();
    root.querySelector('.maint-drawer input:not([type="hidden"]), .maint-drawer textarea')?.focus({ preventScroll: true });
  }

  function closeDrawer() {
    state.drawer = "";
    render();
    if (drawerReturnFocus) {
      const selector = `[data-action="${drawerReturnFocus.action}"]${drawerReturnFocus.id ? `[data-id="${CSS.escape(drawerReturnFocus.id)}"]` : ""}`;
      root.querySelector(selector)?.focus({ preventScroll: true });
    }
    drawerReturnFocus = null;
  }

  function formValue(form, key) { return String(new FormData(form).get(key) || "").trim(); }
  function formError(message, input = null) {
    const footer = root.querySelector(".maint-drawer footer");
    if (!footer) return;
    let summary = footer.querySelector(".maint-form-error");
    if (!summary) {
      footer.insertAdjacentHTML("afterbegin", '<p class="maint-form-error" role="alert"></p>');
      summary = footer.querySelector(".maint-form-error");
    }
    summary.textContent = message;
    root.querySelectorAll(".maint-field-error").forEach(item => item.remove());
    if (input) {
      const field = input.closest(".maint-field");
      if (field) field.insertAdjacentHTML("beforeend", `<small class="maint-field-error">${esc(message)}</small>`);
      input.scrollIntoView({ block: "center", behavior: "smooth" });
      input.focus({ preventScroll: true });
    }
  }
  function validForm(form) {
    const email = form.querySelector('input[name="email"]');
    if (email && email.value.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) {
      form.classList.add("maint-attempted");
      email.classList.add("maint-invalid");
      formError("Email is incomplete. Enter an address like name@example.com, or leave Email blank.", email);
      return false;
    }
    const invalid = form.querySelector(":invalid");
    if (!invalid) {
      root.querySelector(".maint-form-error")?.remove();
      root.querySelectorAll(".maint-field-error").forEach(item => item.remove());
      return true;
    }
    form.classList.add("maint-attempted");
    const label = invalid.closest(".maint-field")?.querySelector("span")?.textContent.replace("*", "").trim() || "This field";
    const message = invalid.name === "email" && invalid.validity.typeMismatch
      ? "Email is incomplete. Enter an address like name@example.com, or leave Email blank."
      : invalid.validity.valueMissing ? `${label} is required.` : `Check the value entered for ${label}.`;
    formError(message, invalid);
    return false;
  }
  function scheduleFormData() {
    const form = root.querySelector("#maintScheduleForm");
    const data = new FormData(form);
    return { ...state.scheduleDraft, customerName: formValue(form, "customerName"), contractId: formValue(form, "contractId"), visitId: formValue(form, "visitId"),
      site: formValue(form, "site"), contact: formValue(form, "contact"), phone: formValue(form, "phone"),
      workType: formValue(form, "workType"), priority: formValue(form, "priority"), serviceDate: formValue(form, "serviceDate"),
      startTime: formValue(form, "startTime"), endTime: formValue(form, "endTime"),
      technicianIds: data.getAll("technicianIds").map(String), leadTechnicianId: formValue(form, "leadTechnicianId"),
      instructions: formValue(form, "instructions") };
  }

  async function saveAmc() {
    const form = root.querySelector("#maintAmcForm");
    if (!validForm(form)) return;
    const fields = Object.fromEntries(new FormData(form).entries());
    const units = [...form.querySelectorAll(".maint-unit-row")].map(row => ({
      reference: row.querySelector('[name="reference"]').value.trim(), type: row.querySelector('[name="type"]').value.trim(),
      quantity: Number(row.querySelector('[name="quantity"]').value || 1), location: row.querySelector('[name="location"]').value.trim()
    })).filter(unit => unit.reference || unit.type || unit.location);
    const body = { ...fields, units, unitCount: Number(fields.unitCount), visitsPerYear: Number(fields.visitsPerYear), contractValue: Number(fields.contractValue || 0) };
    try {
      const item = await request(state.drawerId ? `/api/maintenance/contracts/${encodeURIComponent(state.drawerId)}` : "/api/maintenance/contracts",
        { method: state.drawerId ? "PUT" : "POST", body: JSON.stringify(body) });
      state.drawer = "";
      state.selectedContractId = item.id;
      await refresh();
      notice(`${item.number} saved`);
    } catch (error) { formError(error.message || "Unable to save AMC"); }
  }

  async function saveSchedule(mode) {
    const form = root.querySelector("#maintScheduleForm");
    if (!validForm(form)) return;
    const body = { ...scheduleFormData(), mode };
    if (mode === "notify" && body.workType === "Preventive Maintenance" && (body.technicianIds.length < 2 || body.technicianIds.length > 5)) {
      formError("Assign 2 to 5 technicians for preventive maintenance"); return;
    }
    if (mode === "notify" && !body.leadTechnicianId) { formError("Choose a lead technician", form.querySelector('[name="leadTechnicianId"]')); return; }
    try {
      const result = await request("/api/maintenance/schedules", { method: "POST", body: JSON.stringify(body) });
      state.scheduleDraft = { ...result.schedule };
      state.drawer = "";
      await refresh();
      if (result.workOrder) navigate("work-orders", result.workOrder.id);
      else notice("Schedule draft saved");
    } catch (error) { formError(error.message || "Unable to save schedule"); }
  }

  async function saveTechnician() {
    const form = root.querySelector("#maintTechnicianForm");
    if (!validForm(form)) return;
    const fields = Object.fromEntries(new FormData(form).entries());
    fields.active = fields.active !== "false";
    fields.offDuty = form.querySelector('[name="offDuty"]').checked;
    try {
      const item = await request(state.drawerId ? `/api/maintenance/technicians/${encodeURIComponent(state.drawerId)}` : "/api/maintenance/technicians",
        { method: state.drawerId ? "PUT" : "POST", body: JSON.stringify(fields) });
      state.drawer = "";
      state.selectedTechnicianId = item.id;
      await refresh();
      notice(`${item.name} saved`);
    } catch (error) { formError(error.message || "Unable to save technician"); }
  }

  async function reviewReport(decision) {
    const form = root.querySelector("#maintReviewForm");
    if (!validForm(form)) return;
    try {
      await request(`/api/maintenance/reports/${encodeURIComponent(state.drawerId)}/review`,
        { method: "POST", body: JSON.stringify({ decision, reason: formValue(form, "reason") }) });
      state.drawer = "";
      await refresh();
      notice(`Report ${decision.toLowerCase()}`);
    } catch (error) { formError(error.message || "Unable to review report"); }
  }

  async function saveReportUpload() {
    const form = root.querySelector("#maintReportUploadForm");
    commitReportTechnicianInput(form);
    if (!validForm(form)) return;
    const values = new FormData(form);
    const fields = Object.fromEntries(["reportNumber", "serviceDate", "customerName", "siteName", "technicianName", "unitNumber",
      "modelNumber", "serialNumber", "refrigerant", "workCarriedOut", "materialsUsed", "quantity", "remarks", "jobCompletion"]
      .map(key => [key, String(values.get(key) || "").trim()]));
    const payload = { fileId: state.srUpload?.fileId, extracted: fields,
      details: { customerName: fields.customerName, workCarriedOut: fields.workCarriedOut, materialsUsed: fields.materialsUsed, remarks: fields.remarks } };
    if (!payload.fileId) return formError("Upload the service report image or PDF first.");
    try {
      const item = await request("/api/maintenance/reports", { method: "POST", body: JSON.stringify(payload) });
      state.drawer = ""; state.srUpload = null; state.selectedReportId = item.id; state.reportTab = "Report Details";
      state.status.reports = "all"; state.reportFilterDraft = { range: "all", from: "", to: "", customer: "", site: "", technician: "", status: "all" };
      state.reportFilters = { ...state.reportFilterDraft }; state.search.reports = ""; state.pageNumber.reports = 1;
      await refresh(); notice(`${item.number} submitted for review`);
    } catch (error) { formError(error.message || "Unable to submit service report"); }
  }

  async function saveReportEdit() {
    const form = root.querySelector("#maintReportEditForm");
    if (!form) return;
    commitReportTechnicianInput(form);
    if (!validForm(form)) return;
    const values = new FormData(form);
    const keys = ["reportNumber", "serviceDate", "customerName", "siteName", "technicianName", "unitNumber", "modelNumber",
      "serialNumber", "refrigerant", "workCarriedOut", "materialsUsed", "quantity", "remarks", "jobCompletion"];
    const priorFields = report(state.drawerId)?.extracted || {};
    const extracted = Object.fromEntries(keys.map(key => [key, String(values.get(`extracted_${key}`) ?? priorFields[key] ?? "").trim()]));
    const details = Object.fromEntries(["workCarriedOut", "materialsUsed", "remarks"]
      .map(key => [key, String(values.get(`detail_${key}`) || "").trim()]));
    details.customerName = extracted.customerName;
    try {
      await request(`/api/maintenance/reports/${encodeURIComponent(state.drawerId)}`, { method: "PUT",
        body: JSON.stringify({ workOrderId: String(values.get("workOrderId") || ""), contractId: String(values.get("contractId") || ""), extracted, details }) });
      state.drawer = ""; await refresh(); notice("Service report details updated");
    } catch (error) { formError(error.message || "Unable to update service report"); }
  }

  function csvDownload(rows, columns, name) {
    const escapeCsv = value => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const csv = [columns.map(column => escapeCsv(column[0])).join(","), ...rows.map(item => columns.map(column => escapeCsv(item[column[1]])).join(","))].join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = name; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  root.addEventListener("click", async event => {
    const customerInput = root.querySelector("#maintReportEditForm [data-report-customer-input]");
    if (customerInput && !event.target.closest(".maint-report-customer")) hideReportCustomerOptions(customerInput);
    const button = event.target.closest("[data-action]");
    if (!button) { if (state.amcMenuId || state.pmMenuId || state.workOrderMenuId || state.workOrderDetailMenu || state.technicianMoreMenu || state.reportMoreMenu) { state.amcMenuId = ""; state.pmMenuId = ""; state.workOrderMenuId = ""; state.workOrderDetailMenu = false; state.technicianMoreMenu = false; state.reportMoreMenu = false; render(); } return; }
    const action = button.dataset.action, id = button.dataset.id || "";
    if (action === "report-customer-choice") {
      const input = button.closest(".maint-report-customer").querySelector("[data-report-customer-input]");
      input.value = button.dataset.name;
      hideReportCustomerOptions(input);
      updateReportAmcSelect(input.closest("form"));
      return;
    }
    if (action === "report-tech-add") { commitReportTechnicianInput(button.closest("form")); button.parentElement.querySelector("input")?.focus(); return; }
    if (action === "report-tech-remove") {
      const control = button.closest(".maint-report-technicians");
      updateReportTechnicians(control, reportTechnicianNames(control.querySelector('input[type="hidden"]').value)
        .filter(name => name.toLowerCase() !== button.dataset.name.toLowerCase()));
      return;
    }
    if (action !== "amc-menu") state.amcMenuId = "";
    if (action !== "pm-menu") state.pmMenuId = "";
    if (action !== "wd-more") state.workOrderDetailMenu = false;
    if (action !== "td-more") state.technicianMoreMenu = false;
    if (action !== "sr-more") state.reportMoreMenu = false;
    if (button.classList.contains("maint-overlay") && event.target !== button) return;
    if (action === "delete-request") {
      const kind = button.dataset.kind;
      const item = ({ contracts: contract, schedules: key => state.data.schedules.find(row => row.id === key), "work-orders": job,
        technicians: tech, reports: report })[kind]?.(id);
      if (!item) return notice("Record not found.");
      const labels = { contracts: "AMC contract", schedules: "PM schedule", "work-orders": "work order", technicians: "technician", reports: "service report" };
      const name = kind === "technicians" ? item.name : item.number || item.customerName;
      const jobIds = kind === "contracts" ? state.data.workOrders.filter(row => row.contractId === id).map(row => row.id)
        : kind === "schedules" ? [item.workOrderId].filter(Boolean) : kind === "work-orders" ? [id] : [];
      const reportCount = state.data.reports.filter(row => jobIds.includes(row.workOrderId)).length;
      const impact = kind === "contracts" ? ` Its planned visits, ${jobIds.length} linked work orders, and ${reportCount} service reports will also be removed.`
        : kind === "schedules" ? " Its linked work order and report will also be removed."
        : kind === "work-orders" ? ` Its schedule and ${reportCount} service reports will also be removed.` : "";
      if (!confirm(`Delete ${labels[kind]} ${name}?${impact} This action cannot be undone.`)) return;
      state.pmMenuId = ""; state.workOrderMenuId = ""; state.amcMenuId = ""; state.technicianMoreMenu = false; state.reportMoreMenu = false;
      try {
        const response = await request(`/api/maintenance/${kind}/${encodeURIComponent(id)}`, { method: "DELETE" });
        if (kind === "contracts" && state.selectedContractId === id) state.selectedContractId = null;
        if (kind === "technicians" && state.selectedTechnicianId === id) state.selectedTechnicianId = null;
        if (kind === "reports" && state.selectedReportId === id) state.selectedReportId = null;
        if (kind === "work-orders" && state.selectedWorkOrderId === id) state.selectedWorkOrderId = null;
        if (kind === "work-orders" && state.recordId === id) { state.recordId = ""; history.replaceState(null, "", "/maintenance/work-orders"); }
        await refresh(); notice(`${response.deleted.label} deleted`);
      } catch (error) { handleError(error); }
      return;
    }
    if (action === "refresh") return refresh().catch(handleError);
    if (action === "go-amc") return navigate("amc");
    if (action === "amc-active") { state.status.amc = "Active"; return render(); }
    if (action === "go-schedule") return navigate("schedule");
    if (action === "go-work-orders") return navigate("work-orders");
    if (action === "go-technicians") return navigate("technicians");
    if (action === "go-reports") return navigate("reports");
    if (action === "go-pending-reports") { state.status.reports = "Pending Review"; state.reportFilterDraft.status = "Pending Review"; state.reportFilters.status = "Pending Review"; return navigate("reports"); }
    if (action === "go-jobs-today") { state.workOrderDraft = { ...workOrderFilterDefaults(), range: "custom", from: today(), to: today() }; state.workOrderFilters = { ...state.workOrderDraft }; return navigate("work-orders"); }
    if (action === "go-expiring") { state.status.amc = "Expiring Soon"; return navigate("amc"); }
    if (action === "amc-tab") { state.status.amc = button.dataset.status; state.amcMenuId = ""; return render(); }
    if (action === "amc-toggle-filters") { state.amcFiltersOpen = !state.amcFiltersOpen; return render(); }
    if (action === "amc-clear-filters") { state.status.amc = "all"; state.amcServiceBefore = ""; return render(); }
    if (action === "amc-menu") { state.amcMenuId = state.amcMenuId === id ? "" : id; return render(); }
    if (action === "amc-documents") { state.amcMenuId = ""; state.selectedContractId = id; state.contractTab = "Documents"; return render(); }
    if (action === "amc-full-details") { state.contractTab = "Overview"; state.amcFullDetails = !state.amcFullDetails; return render(); }
    if (action === "pm-toggle-filters") { state.pmFiltersOpen = !state.pmFiltersOpen; return render(); }
    if (action === "pm-kpi") { state.status.schedule = button.dataset.status; state.pmUpcomingOffset = 0; return render(); }
    if (action === "pm-view" || action === "pm-view-all") { state.scheduleView = action === "pm-view-all" ? "list" : button.dataset.view; return render(); }
    if (action === "pm-menu") { state.pmMenuId = state.pmMenuId === id ? "" : id; return render(); }
    if (action === "pm-upcoming-prev" || action === "pm-upcoming-next") { state.pmUpcomingOffset = Math.max(0, state.pmUpcomingOffset + (action === "pm-upcoming-next" ? 1 : -1)); return render(); }
    if (action === "pm-day-details") { state.scheduleView = "day"; return render(); }
    if (action === "pm-prev" || action === "pm-next" || action === "pm-day-prev" || action === "pm-day-next") {
      const direction = action.endsWith("next") ? 1 : -1;
      if (state.scheduleView === "month" && (action === "pm-prev" || action === "pm-next")) {
        state.month = new Date(state.month.getFullYear(), state.month.getMonth() + direction, 1);
        state.selectedDate = `${state.month.getFullYear()}-${String(state.month.getMonth() + 1).padStart(2, "0")}-01`;
      } else {
        state.selectedDate = shiftDay(state.selectedDate, direction * (state.scheduleView === "week" && !action.startsWith("pm-day") ? 7 : 1));
        state.month = new Date(`${state.selectedDate}T12:00:00`); state.month.setDate(1);
      }
      state.pmUpcomingOffset = 0; return render();
    }
    if (action === "pm-today") { state.selectedDate = today(); state.month = new Date(`${state.selectedDate}T12:00:00`); state.month.setDate(1); state.pmUpcomingOffset = 0; return render(); }
    if (action === "pm-select-date") { state.selectedDate = button.dataset.date; state.month = new Date(`${state.selectedDate}T12:00:00`); state.month.setDate(1); state.pmUpcomingOffset = 0; return render(); }
    if (action === "pm-empty-date") { state.selectedDate = button.dataset.date; state.month = new Date(`${state.selectedDate}T12:00:00`); state.month.setDate(1); return openDrawer("schedule", "", { serviceDate: state.selectedDate }); }
    if (action === "filter-scheduled" || action === "filter-on-site" || action === "filter-report-submitted" || action === "filter-completed") {
      state.workOrderDraft.status = ({ "filter-scheduled": "Scheduled", "filter-on-site": "On Site", "filter-report-submitted": "Report Submitted", "filter-completed": "Completed" })[action]; state.workOrderFilters = { ...state.workOrderDraft }; return render();
    }
    if (action === "wo-kpi") { state.workOrderDraft.status = button.dataset.status; state.workOrderFilters = { ...state.workOrderDraft }; return render(); }
    if (action === "wo-apply-filters") {
      if (state.workOrderDraft.range === "custom" && state.workOrderDraft.from && state.workOrderDraft.to && state.workOrderDraft.from > state.workOrderDraft.to) return notice("The start date must be before the end date.");
      state.workOrderFilters = { ...state.workOrderDraft }; state.workOrderMenuId = ""; return render();
    }
    if (action === "wo-clear-filters") { state.workOrderDraft = workOrderFilterDefaults(); state.workOrderFilters = workOrderFilterDefaults(); state.search["work-orders"] = ""; state.workOrderMenuId = ""; return render(); }
    if (action === "wo-select") { state.selectedWorkOrderId = id; state.workOrderTab = "Overview"; state.workOrderMenuId = ""; return render(); }
    if (action === "wo-close") { state.selectedWorkOrderId = null; state.workOrderMenuId = ""; return render(); }
    if (action === "wo-tab") { state.workOrderTab = button.dataset.tab; return render(); }
    if (action === "wo-menu" || action === "wo-more") { const location = action === "wo-menu" ? "card" : "detail"; state.workOrderMenuId = state.workOrderMenuId === id && state.workOrderMenuLocation === location ? "" : id; state.workOrderMenuLocation = location; return render(); }
    if (action === "wd-more") { state.workOrderDetailMenu = !state.workOrderDetailMenu; return render(); }
    if (action === "wd-tab") { state.workOrderDetailTab = button.dataset.tab; return render(); }
    if (action === "wd-documents") { state.workOrderDetailTab = "Photos & Documents"; return render(); }
    if (action === "wd-upload-info") { state.workOrderDetailTab = "Service Report"; render(); return notice("Only the assigned lead technician can upload a handwritten report in the Field app."); }
    if (action === "wd-retry-notifications") {
      const failures = state.data.notifications.filter(row => row.workOrderId === id && ["Failed", "Not Subscribed"].includes(row.status));
      if (!failures.length) return notice("There are no failed notifications to retry.");
      try { for (const row of failures) await request(`/api/maintenance/notifications/${encodeURIComponent(row.id)}/retry`, { method: "POST", body: "{}" }); await refresh(); notice(`Retried ${failures.length} notification ${failures.length === 1 ? "delivery" : "deliveries"}`); }
      catch (error) { handleError(error); } return;
    }
    if (action === "wd-duplicate") {
      const source = job(id); if (!source) return notice("Work order not found.");
      try {
        const result = await request("/api/maintenance/schedules", { method: "POST", body: JSON.stringify({ mode: "draft", clientKey: crypto.randomUUID(),
          customerName: source.customerName, contractId: source.contractId || "", visitId: "", site: source.site, contact: source.contact || "", phone: source.phone || "",
          workType: source.workType, priority: source.priority, serviceDate: source.serviceDate, startTime: source.startTime,
          endTime: source.endTime, technicianIds: [...(source.technicianIds || [])], leadTechnicianId: source.leadTechnicianId || "", instructions: source.instructions || "" }) });
        await refresh(); openDrawer("schedule", result.schedule.id); notice(`Draft copied from ${source.number}. Review before publishing.`);
      } catch (error) { handleError(error); } return;
    }
    if (action === "status-tab") { state.status["work-orders"] = button.dataset.status; state.pageNumber["work-orders"] = 1; return render(); }
    if (action === "sort") {
      const key = button.dataset.key;
      state.sort = { page: state.page, key, direction: state.sort.page === state.page && state.sort.key === key ? -state.sort.direction : 1 };
      state.pageNumber[state.page] = 1;
      return render();
    }
    if (action === "open-job") return navigate("work-orders", id);
    if (action === "open-contract-search") return navigate("amc", id);
    if (action === "open-technician-search") return navigate("technicians", id);
    if (action === "edit-job") return openDrawer("schedule", id);
    if (action === "edit-schedule") return openDrawer("schedule", id);
    if (action === "schedule-visit") {
      const planned = visit(id);
      const linked = contract(planned?.contractId);
      if (!planned || !linked) return notice("Planned visit not found");
      return openDrawer("schedule", "", { contractId: linked.id, visitId: planned.id, serviceDate: planned.plannedDate });
    }
    if (action === "open-contract") { state.selectedContractId = id; state.contractTab = "Overview"; state.amcFullDetails = false; state.amcMenuId = ""; return render(); }
    if (action === "close-contract") { state.selectedContractId = null; state.amcMenuId = ""; return render(); }
    if (action === "contract-tab") { state.contractTab = button.dataset.tab; return render(); }
    if (action === "open-technician") { state.selectedTechnicianId = id; state.technicianTab = "Overview"; state.accessLink = ""; return state.page === "technicians" ? render() : navigate("technicians", id); }
    if (action === "td-tab") { state.technicianTab = button.dataset.tab; return render(); }
    if (action === "td-more") { state.technicianMoreMenu = !state.technicianMoreMenu; return render(); }
    if (action === "sr-more") { state.reportMoreMenu = !state.reportMoreMenu; return render(); }
    if (action === "sr-view-pdf") return;
    if (action === "td-assign") return openDrawer("schedule", "", { workType: "Preventive Maintenance", technicianIds: [id], leadTechnicianId: id });
    if (action === "td-map") { window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(button.dataset.site)}`, "_blank", "noopener,noreferrer"); return; }
    if (action === "td-toggle") {
      const item = tech(id); if (!item) return notice("Technician not found");
      const wasActive = item.active;
      if (!confirm(`${wasActive ? "Disable" : "Enable"} ${item.name}?${wasActive ? " Field access will be revoked." : ""}`)) return;
      try { await request(`/api/maintenance/technicians/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify({
        name: item.name, code: item.code, phone: item.phone, email: item.email || "", notes: item.notes || "", active: !wasActive, offDuty: item.offDuty === true
      }) }); await refresh(); notice(`${item.name} ${wasActive ? "disabled" : "enabled"}`); }
      catch (error) { handleError(error); } return;
    }
    if (action === "close-technician") { state.selectedTechnicianId = null; return render(); }
    if (action === "open-report") { state.selectedReportId = id; state.reportTab = "Report Details"; state.reportPreviewFileId = ""; return state.page === "reports" ? render() : navigate("reports", id); }
    if (action === "upload-report") { state.srUpload = { fields: {}, fileId: "", fileName: "", message: "Choose a clear service report image or PDF. AI will extract what it can; you can correct the fields before review." }; return openDrawer("report-upload"); }
    if (action === "edit-report") return openDrawer("report-edit", id);
    if (action === "close-report") { state.selectedReportId = null; state.reportPreviewFileId = ""; return render(); }
    if (action === "report-tab") { state.reportTab = button.dataset.tab; return render(); }
    if (action === "sr-status") { state.status.reports = button.dataset.status; state.reportFilterDraft.status = state.status.reports; state.reportFilters.status = state.status.reports; state.pageNumber.reports = 1; if (state.selectedReportId !== null) state.selectedReportId = ""; state.reportPreviewFileId = ""; return render(); }
    if (action === "sr-apply") {
      const draft = state.reportFilterDraft;
      if (draft.range === "custom" && draft.from && draft.to && draft.from > draft.to) return notice("The start date must be before the end date.");
      state.reportFilters = { ...draft }; state.status.reports = draft.status; state.pageNumber.reports = 1; if (state.selectedReportId !== null) state.selectedReportId = ""; state.reportPreviewFileId = ""; return render();
    }
    if (action === "sr-clear") { state.reportFilterDraft = { range: "all", from: "", to: "", customer: "", site: "", technician: "", status: "all" }; state.reportFilters = { ...state.reportFilterDraft }; state.status.reports = "all"; state.search.reports = ""; state.pageNumber.reports = 1; if (state.selectedReportId !== null) state.selectedReportId = ""; state.reportPreviewFileId = ""; return render(); }
    if (action === "sr-page" || action === "sr-page-prev" || action === "sr-page-next") { state.pageNumber.reports = action === "sr-page" ? Number(button.dataset.page) : state.pageNumber.reports + (action === "sr-page-next" ? 1 : -1); if (state.selectedReportId !== null) state.selectedReportId = ""; return render(); }
    if (action === "sr-preview") { state.reportPreviewFileId = id; return render(); }
    if (action === "sr-preview-close") { state.reportPreviewFileId = ""; return render(); }
    if (action === "sr-preview-prev" || action === "sr-preview-next") {
      const currentReport = report(state.selectedReportId);
      const images = (currentReport?.fileIds || []).map(fileId => state.data.files.find(file => file.id === fileId)).filter(file => file?.mimeType?.startsWith("image/"));
      const currentIndex = images.findIndex(file => file.id === state.reportPreviewFileId);
      if (currentIndex >= 0 && images.length > 1) state.reportPreviewFileId = images[(currentIndex + (action === "sr-preview-next" ? 1 : -1) + images.length) % images.length].id;
      return render();
    }
    if (action === "view-job-report") { const item = state.data.reports.find(row => row.workOrderId === id); return item ? navigate("reports", item.id) : notice("No field report submitted yet"); }
    if (action === "dash-range") { state.dashboardScheduleRange = button.dataset.range; return render(); }
    if (action === "dash-cal-view") { state.dashboardCalendarView = button.dataset.view; return render(); }
    if (action === "dash-cal-prev" || action === "dash-cal-next") {
      const direction = action === "dash-cal-next" ? 1 : -1;
      if (state.dashboardCalendarView === "month") state.dashboardMonth = new Date(state.dashboardMonth.getFullYear(), state.dashboardMonth.getMonth() + direction, 1);
      else {
        state.selectedDate = shiftDay(state.selectedDate, direction * (state.dashboardCalendarView === "week" ? 7 : 1));
        state.dashboardMonth = new Date(`${state.selectedDate}T12:00:00`); state.dashboardMonth.setDate(1);
      }
      return render();
    }
    if (action === "dash-cal-today") { state.selectedDate = today(); state.dashboardMonth = new Date(`${state.selectedDate}T12:00:00`); state.dashboardMonth.setDate(1); return render(); }
    if (action === "dash-select-date") { state.selectedDate = button.dataset.date; state.dashboardScheduleRange = "today"; state.dashboardMonth = new Date(`${state.selectedDate}T12:00:00`); state.dashboardMonth.setDate(1); return render(); }
    if (action === "month-prev" || action === "month-next") { state.month = new Date(state.month.getFullYear(), state.month.getMonth() + (action === "month-next" ? 1 : -1), 1); return render(); }
    if (action === "calendar-today") { state.selectedDate = today(); state.month = new Date(); state.month.setDate(1); return render(); }
    if (action === "select-date") { state.selectedDate = button.dataset.date; return render(); }
    if (action === "calendar-view" || action === "list-view") { state.scheduleView = action === "calendar-view" ? "month" : "list"; return render(); }
    if (action === "new-amc") return openDrawer("amc");
    if (action === "edit-amc") { state.amcMenuId = ""; return openDrawer("amc", id); }
    if (action === "new-schedule" || action === "new-work-order") return openDrawer("schedule", "", { workType: action === "new-work-order" ? "Complaint / Repair" : "Preventive Maintenance" });
    if (action === "new-schedule-date") return openDrawer("schedule", "", { serviceDate: state.selectedDate });
    if (action === "schedule-for-amc") { state.amcMenuId = ""; return openDrawer("schedule", "", { contractId: id }); }
    if (action === "new-technician") return openDrawer("technician");
    if (action === "edit-technician") return openDrawer("technician", id);
    if (action === "review-approve" || action === "review-revision" || action === "review-reject") return openDrawer(action, id);
    if (action === "close-drawer") return closeDrawer();
    if (action === "save-amc") return saveAmc();
    if (action === "save-schedule-draft") return saveSchedule("draft");
    if (action === "save-schedule-notify") return saveSchedule("notify");
    if (action === "save-technician") return saveTechnician();
    if (action === "submit-review") return reviewReport(button.dataset.decision);
    if (action === "submit-report-upload") return saveReportUpload();
    if (action === "save-report-edit") return saveReportEdit();
    if (action === "add-unit") {
      root.querySelector("#maintUnitRows").insertAdjacentHTML("beforeend", `<div class="maint-unit-row">${formField("Reference", "reference")}${formField("Type", "type")}${formField("Qty", "quantity", 1, "number", false, 'min="1"')}${formField("Location", "location")}${iconButton("x", "Remove unit", "remove-unit")}</div>`); return;
    }
    if (action === "remove-unit") { button.closest(".maint-unit-row")?.remove(); return; }
    if (action === "clear-filters") { state.filters = { date: "", customer: "", site: "", technician: "", contract: "" }; state.status[state.page] = "all"; return render(); }
    if (action === "page-prev" || action === "page-next") { state.pageNumber[state.page] += action === "page-next" ? 1 : -1; return render(); }
    if (action === "export-amc") return csvDownload(state.data.contracts, [["AMC No.", "number"], ["Customer", "customerName"], ["Site", "site"], ["Start", "startDate"], ["End", "endDate"], ["Visits", "visitsPerYear"], ["Status", "status"]], "amc-register.csv");
    if (action === "export-work-orders") return csvDownload(state.data.workOrders, [["WO No.", "number"], ["Customer", "customerName"], ["Site", "site"], ["Service Date", "serviceDate"], ["Start", "startTime"], ["End", "endTime"], ["Status", "status"]], "work-orders.csv");
    if (action === "create-access") {
      try { const response = await request(`/api/maintenance/technicians/${encodeURIComponent(id)}/access`, { method: "POST", body: "{}" }); state.accessLink = response.link; state.technicianTab = "Notes"; render(); }
      catch (error) { handleError(error); } return;
    }
    if (action === "revoke-access") {
      if (!confirm("Revoke this technician's field access and device subscriptions?")) return;
      try { await request(`/api/maintenance/technicians/${encodeURIComponent(id)}/revoke`, { method: "POST", body: "{}" }); state.accessLink = ""; await refresh(); notice("Field access revoked"); }
      catch (error) { handleError(error); } return;
    }
    if (action === "copy-access") {
      try { await navigator.clipboard.writeText(state.accessLink); notice("Link copied"); }
      catch { notice("Copy the link from the field above"); } return;
    }
    if (action === "retry-notification") {
      try { await request(`/api/maintenance/notifications/${encodeURIComponent(id)}/retry`, { method: "POST", body: "{}" }); await refresh(); notice("Notification retry recorded"); }
      catch (error) { handleError(error); } return;
    }
  });

  root.addEventListener("input", event => {
    const input = event.target;
    if (input.matches('[data-wo-filter="from"], [data-wo-filter="to"]')) { state.workOrderDraft[input.dataset.woFilter] = input.value; return; }
    if (input.closest(".maint-form")) {
      input.classList.remove("maint-invalid");
      input.closest(".maint-field")?.querySelector(".maint-field-error")?.remove();
      root.querySelector(".maint-form-error")?.remove();
    }
    if (input.matches('#maintReportEditForm [name="extracted_customerName"], #maintReportEditForm [name="extracted_siteName"]')) {
      updateReportAmcSelect(input.closest("form"));
      if (input.name === "extracted_customerName") showReportCustomerOptions(input);
      return;
    }
    if (input.matches("[data-tech-search]")) {
      const query = input.value.toLowerCase();
      root.querySelectorAll("[data-tech-option]").forEach(item => item.hidden = !item.dataset.techOption.includes(query));
      return;
    }
    if (input.matches("[data-tech-directory-search]")) { state.technicianDirectorySearch = input.value; render(); return; }
    const key = input.dataset.search ? "search" : ["site", "customer"].includes(input.dataset.filter) ? input.dataset.filter : "";
    if (!key) return;
    if (key === "search") { state.search[state.page] = input.value; state.pageNumber[state.page] = 1; if (state.page === "reports" && state.selectedReportId !== null) state.selectedReportId = ""; }
    else state.filters[key] = input.value;
    render();
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      if (state.drawer) { event.preventDefault(); closeDrawer(); }
      else if (state.page === "reports" && state.reportPreviewFileId) { state.reportPreviewFileId = ""; render(); }
      else if (state.page === "work-orders" && state.recordId && state.workOrderDetailMenu) { state.workOrderDetailMenu = false; render(); }
      else if (state.page === "work-orders" && !state.recordId && state.selectedWorkOrderId) { state.selectedWorkOrderId = null; render(); }
    }
  });

  root.addEventListener("keydown", event => {
    if (event.target.matches("[data-report-customer-input]")) {
      const input = event.target;
      const list = input.parentElement.querySelector("[data-report-customer-options]");
      if (event.key === "Escape" && !list.hidden) {
        event.preventDefault(); event.stopPropagation(); hideReportCustomerOptions(input); return;
      }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        if (list.hidden) showReportCustomerOptions(input);
        const options = [...list.querySelectorAll("button")];
        if (!options.length) return;
        event.preventDefault();
        const active = options.findIndex(option => option.classList.contains("active"));
        const next = event.key === "ArrowDown" ? (active + 1) % options.length
          : active < 0 ? options.length - 1 : (active + options.length - 1) % options.length;
        options.forEach(option => option.classList.remove("active"));
        options[next].classList.add("active");
        input.setAttribute("aria-activedescendant", options[next].id);
        options[next].scrollIntoView({ block: "nearest" });
        return;
      }
      if (event.key === "Enter" && !list.hidden) {
        event.preventDefault();
        const active = list.querySelector("button.active");
        if (active) {
          input.value = active.dataset.name;
          updateReportAmcSelect(input.closest("form"));
        }
        hideReportCustomerOptions(input);
        return;
      }
    }
    if (event.target.matches("[data-report-tech-input]") && (event.key === "Enter" || event.key === ",")) {
      event.preventDefault(); commitReportTechnicianInput(event.target.closest("form")); return;
    }
    if (event.target.matches(".wo-card") && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault(); state.selectedWorkOrderId = event.target.dataset.id; state.workOrderTab = "Overview"; state.workOrderMenuId = ""; render();
    }
  });

  root.addEventListener("change", async event => {
    const input = event.target;
    if (input.matches("[data-report-tech-input]")) { commitReportTechnicianInput(input.closest("form")); return; }
    if (input.matches("[data-wo-filter]")) { state.workOrderDraft[input.dataset.woFilter] = input.value; if (input.dataset.woFilter === "range") render(); return; }
    if (input.matches("[data-amc-sort]")) { state.amcSort = input.value; return render(); }
    if (input.matches("[data-report-filter]")) { state.reportFilterDraft[input.dataset.reportFilter] = input.value; if (input.dataset.reportFilter === "range") render(); return; }
    if (input.matches("[data-report-sort]")) { state.reportSort = input.value; state.pageNumber.reports = 1; if (state.selectedReportId !== null) state.selectedReportId = ""; return render(); }
    if (input.matches("[data-report-page-size]")) { state.reportPageSize = Number(input.value); state.pageNumber.reports = 1; if (state.selectedReportId !== null) state.selectedReportId = ""; return render(); }
    if (input.matches("[data-tech-availability]")) { state.technicianAvailability = input.value; return render(); }
    if (input.matches("[data-tech-sort]")) { state.technicianSort = input.value; return render(); }
    if (input.matches("[data-amc-service-before]")) { state.amcServiceBefore = input.value; return render(); }
    if (input.matches("[data-report-upload]")) {
      const file = input.files?.[0];
      if (!file) return;
      state.srUpload ||= { fields: {}, fileId: "" };
      state.srUpload.message = "Uploading and reading report..."; state.srUpload.error = false; render();
      const form = new FormData(); form.append("file", file, file.name);
      try {
        const result = await request("/api/maintenance/reports/upload", { method: "POST", body: form });
        Object.assign(state.srUpload, { fileId: result.file.id, fileName: result.file.originalName, fields: result.fields || {},
          message: result.message || "Review the extracted fields, then submit for pending review.", error: !result.available });
      } catch (error) { state.srUpload.message = error.message || "Unable to upload service report"; state.srUpload.error = true; }
      return render();
    }
    if (input.matches("[data-dash-date]")) {
      if (input.value) { state.selectedDate = input.value; state.dashboardScheduleRange = "today"; state.dashboardMonth = new Date(`${input.value}T12:00:00`); state.dashboardMonth.setDate(1); render(); }
      return;
    }
    if (input.matches('#maintAmcForm [name="frequency"]')) {
      const count = { Monthly: 12, Quarterly: 4, "Half-Yearly": 2 }[input.value];
      const visits = root.querySelector('#maintAmcForm [name="visitsPerYear"]');
      if (visits && count) visits.value = count;
      if (visits) visits.readOnly = !!count;
      return;
    }
    if (input.matches("[data-contract-file]")) {
      if (!input.files?.[0]) return;
      const form = new FormData(); form.append("file", input.files[0]);
      try { await request(`/api/maintenance/contracts/${encodeURIComponent(input.dataset.contractFile)}/files`, { method: "POST", body: form }); await refresh(); notice("Document uploaded"); }
      catch (error) { handleError(error); } return;
    }
    if (input.matches("[data-page-size]")) { state.pageSize = Number(input.value); state.pageNumber[state.page] = 1; return render(); }
    if (input.matches("[data-filter-status]")) { state.status[state.page] = input.value; state.pageNumber[state.page] = 1; return render(); }
    if (input.matches("[data-filter]")) { state.filters[input.dataset.filter] = input.value; state.pageNumber[state.page] = 1; return render(); }
    if (input.closest("#maintScheduleForm")) {
      const draft = scheduleFormData();
      if (input.dataset.scheduleChange === "contract") { const item = contract(draft.contractId); Object.assign(draft, { visitId: "", customerName: item?.customerName || draft.customerName, site: item?.site || draft.site, contact: item?.contact || draft.contact, phone: item?.phone || draft.phone }); }
      if (input.name === "technicianIds" && !draft.technicianIds.includes(draft.leadTechnicianId)) draft.leadTechnicianId = "";
      state.scheduleDraft = draft;
      return render();
    }
  });

  window.maintenanceModule = { open, refresh, prefetch,
    reset() { latestRequest++; state.data = null; lastLoadedAt = 0; prefetchPromise = null; backgroundRefresh = null; },
    dismiss() { state.drawer = ""; document.body.classList.remove("maint-drawer-open"); } };
  let pmResizeTimer;
  window.addEventListener?.("resize", () => {
    if (state.page !== "schedule" || !state.data) return;
    clearTimeout(pmResizeTimer);
    pmResizeTimer = setTimeout(render, 120);
  });
})();
