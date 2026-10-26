window.createMaintenanceBilling = function createMaintenanceBilling(api) {
  const { state, root, esc, icon, badge, day, shortDay, today, contract, contractStatus, job, request, refresh,
    notice, render, navigate, drawerShell, closeDrawer, formField } = api;
  const ui = { tab: "Overview", selectedId: "", hideDetail: false, search: "", source: "all", invoiceStatus: "all", paymentStatus: "all",
    customer: "", from: "", to: "", sort: "recent", page: 1, size: 10, filtersOpen: false, uploadTicket: 0 };
  const money = value => `AED ${Number(value || 0).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const amount = value => Number(value || 0).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const rows = () => state.data?.billing || [];
  const row = id => rows().find(item => item.id === id);
  const admin = () => state.data?.viewerRole === "admin";
  const fileUrl = id => `/api/maintenance/files/${encodeURIComponent(id)}`;
  const date = value => value ? shortDay(value) : "—";
  const pill = (value, tone = "") => `<span class="mb-pill ${tone || (/^paid$|completed|active/i.test(value) ? "green" : /overdue|unpaid|expired/i.test(value) ? "red" : /pending|partially|expiring/i.test(value) ? "amber" : "blue")}">${esc(value || "—")}</span>`;
  const action = (label, name, id, className = "") => `<button class="${className}" data-action="${name}" data-id="${esc(id || "")}">${esc(label)}</button>`;
  const kv = (label, value) => `<div><small>${esc(label)}</small><strong>${esc(value || "—")}</strong></div>`;
  const cell = content => `<td>${content}</td>`;
  const table = (headers, body, emptyText) => `<div class="mb-table-wrap"><table class="mb-table"><thead><tr>${headers.map(label => `<th>${esc(label)}</th>`).join("")}</tr></thead><tbody>${body || `<tr><td colspan="${headers.length}" class="mb-table-empty">${esc(emptyText)}</td></tr>`}</tbody></table></div>`;
  function metrics(list, baseLabel, baseAmount) {
    const invoiced = list.reduce((sum, item) => sum + Number(item.invoiceTotal || 0), 0);
    const paid = list.reduce((sum, item) => sum + Number(item.totalPaid || 0), 0);
    const outstanding = list.reduce((sum, item) => sum + Number(item.outstanding || 0), 0);
    return `<div class="mb-metrics">${[[baseLabel, baseAmount, "file-text", "blue"], ["Total Invoiced", invoiced, "circle-check", "green"],
      ["Total Paid", paid, "check", "violet"], ["Outstanding Balance", outstanding, "clock-3", "red"]]
      .map(([label, value, symbol, tone]) => `<div class="mb-metric ${tone}"><span>${icon(symbol)}</span><div><small>${esc(label)}</small><strong>${money(value)}</strong><em>${label === baseLabel ? "excl. VAT" : "incl. VAT"}</em></div></div>`).join("")}</div>`;
  }
  const invoiceLink = record => record.invoice?.fileId ? `<a class="mb-small-link" href="${fileUrl(record.invoice.fileId)}" target="_blank" rel="noopener">View invoice</a>` : "";
  const receiptLink = payment => payment.receiptFileId ? `<a class="mb-small-link" href="${fileUrl(payment.receiptFileId)}" target="_blank" rel="noopener">Receipt</a>` : "";
  function recordActions(record) {
    return `<div class="mb-row-actions">${!record.request && !record.invoice && Number(record.amountExVat) > 0 ? action("Request Invoice", "billing-open-request", record.id) : ""}
      ${!record.invoice ? action("Upload / Enter Invoice", "billing-open-invoice", record.id) : invoiceLink(record)}
      ${record.request && !record.request.preparedAt && !record.invoice && admin() ? action("Mark Prepared", "billing-handoff", record.id) : ""}
      ${record.invoice && !record.invoice.sentAt ? action("Mark Sent", "billing-sent", record.id) : ""}
      ${record.invoice && record.outstanding > 0 && admin() ? `${action("Record Payment", "billing-open-payment", record.id)}${action("Apply Credit", "billing-open-credit", record.id)}` : ""}</div>`;
  }
  function paymentSchedule(list) {
    return table(["#", "Payment Date", "Amount (excl. VAT)", "Amount (incl. VAT)", "Invoice No.", "Invoice Status", "Payment Status", "Actions"],
      list.map(item => `<tr>${cell(esc(item.installmentNumber || "—"))}${cell(date(item.dueDate))}${cell(money(item.amountExVat))}
        ${cell(money(item.invoice?.total ?? (Number(item.amountExVat) * (1 + Number(item.vatRate || 0) / 100))))}${cell(esc(item.invoice?.number || "—"))}
        ${cell(pill(item.invoiceStatus))}${cell(pill(item.paymentStatus))}${cell(recordActions(item))}</tr>`).join(""), "No payment installments yet.");
  }
  function invoiceHistory(list) {
    const requested = list.filter(item => item.request || item.invoice);
    return table(["Requested", "For", "Requested By", "Status", "Invoice No.", "Invoice Date", "Sent to Customer", "Actions"],
      requested.map(item => `<tr>${cell(date(item.request?.requestedAt))}${cell(item.installmentNumber ? `#${esc(item.installmentNumber)} · ${date(item.dueDate)}` : esc(item.description || item.reference))}
      ${cell(esc(item.request?.requestedBy || "—"))}${cell(pill(item.invoiceStatus))}${cell(esc(item.invoice?.number || "—"))}
      ${cell(date(item.invoice?.date))}${cell(date(item.invoice?.sentAt))}${cell(recordActions(item))}</tr>`).join(""), "No invoice requests yet.");
  }
  function paymentHistory(list) {
    const payments = list.flatMap(item => (item.payments || []).map(payment => ({ ...payment, invoiceNumber: item.invoice?.number || "—" })))
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));
    return table(["Payment Date", "Invoice No.", "Amount (AED)", "Method", "Reference", "Verified By", "Receipt"],
      payments.map(item => `<tr>${cell(date(item.date))}${cell(esc(item.invoiceNumber))}${cell(money(item.amount))}
        ${cell(esc(item.method))}${cell(esc(item.reference))}${cell(esc(item.confirmedBy || "—"))}${cell(receiptLink(item))}</tr>`).join(""), "No confirmed payments yet.");
  }
  function amcBilling(item) {
    const list = rows().filter(record => record.contractId === item.id && record.sourceType === "AMC").sort((a, b) => a.installmentNumber - b.installmentNumber);
    const extras = rows().filter(record => record.contractId === item.id && record.sourceType === "Additional Charge");
    const done = list.filter(record => record.paymentStatus === "Paid").length;
    const nextRequest = list.find(record => !record.request && !record.invoice && Number(record.amountExVat) > 0);
    const nextInvoice = list.find(record => record.request && !record.invoice);
    const latest = list.filter(record => record.invoice).sort((a, b) => String(b.invoice.recordedAt).localeCompare(String(a.invoice.recordedAt)))[0];
    const upcoming = list.filter(record => record.paymentStatus !== "Paid").slice(0, 3);
    const recentPayments = list.flatMap(record => (record.payments || []).map(payment => ({ ...payment, invoiceNumber: record.invoice?.number || "—" })))
      .sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 3);
    return `<div class="mb-contract">${metrics(list, "Contract Value", item.contractValue)}
      <section class="mb-card mb-progress"><div><strong>Payment Progress</strong><b>${list.length ? Math.round(done / list.length * 100) : 0}%</b></div><div class="mb-progress-track"><span style="width:${list.length ? done / list.length * 100 : 0}%"></span></div><small>${done} of ${list.length} payments completed</small></section>
      <div class="mb-contract-grid"><div class="mb-contract-main"><section class="mb-card"><div class="mb-section-head"><h2>${icon("calendar-days")} Payment Schedule</h2><div>${nextRequest ? action("+ Request Invoice", "billing-open-request", nextRequest.id, "mb-primary") : ""}${nextInvoice ? action("Upload Invoice", "billing-open-invoice", nextInvoice.id, "mb-outline") : ""}</div></div>${paymentSchedule(list)}</section>
      <section class="mb-card"><div class="mb-section-head"><h2>${icon("file-text")} Invoice Requests & History</h2></div>${invoiceHistory(list)}</section>
      <section class="mb-card"><div class="mb-section-head"><h2>${icon("calendar-check")} Payment History</h2></div>${paymentHistory(list)}</section>
      <section class="mb-card"><div class="mb-section-head"><h2>${icon("pencil")} Payment Notes</h2>${action("Edit", "billing-open-notes", item.id, "mb-small-link")}</div><p class="mb-notes">${esc(state.data.billingNotes?.[item.id] || "No payment notes recorded.")}</p></section>
      ${extras.length ? `<section class="mb-card"><div class="mb-section-head"><h2>Additional Work Order Charges</h2></div>${paymentSchedule(extras)}</section>` : ""}</div>
      <aside class="mb-contract-side"><section class="mb-card"><div class="mb-section-head"><h2>${icon("bell")} Upcoming Actions</h2></div>${upcoming.length ? upcoming.map(record => `<div class="mb-side-row"><span><strong>${!record.request ? Number(record.amountExVat) > 0 ? "Request invoice" : "Set contract value" : !record.invoice ? "Upload invoice" : "Follow up payment"}</strong><small>Installment #${esc(record.installmentNumber)} · ${date(record.dueDate)}</small></span>${!record.request ? Number(record.amountExVat) > 0 ? action("Request", "billing-open-request", record.id) : action("Edit AMC", "edit-amc", item.id) : !record.invoice ? action("Upload", "billing-open-invoice", record.id) : ""}</div>`).join("") : `<p class="mb-muted">No upcoming billing actions.</p>`}</section>
      <section class="mb-card"><div class="mb-section-head"><h2>${icon("file-text")} Latest Invoice</h2></div>${latest ? `<div class="mb-latest"><strong>${esc(latest.invoice.number)}</strong>${pill(latest.invoiceStatus)}${kv("Invoice Date", date(latest.invoice.date))}${kv("Amount (incl. VAT)", money(latest.invoice.total))}${invoiceLink(latest)}</div>` : `<p class="mb-muted">No invoice uploaded yet.</p>`}</section>
      <section class="mb-card"><div class="mb-section-head"><h2>${icon("calendar-check")} Recent Payments</h2></div>${recentPayments.length ? recentPayments.map(payment => `<div class="mb-side-row"><span><strong>${esc(payment.invoiceNumber)}</strong><small>${date(payment.date)} · ${esc(payment.reference)}</small></span><b>${money(payment.amount)}</b></div>`).join("") : `<p class="mb-muted">No payments recorded yet.</p>`}</section></aside></div></div>`;
  }
  function fullAmc(item) {
    if (!item) return `<div class="mb-page"><div class="mb-empty">AMC contract not found. ${action("Back to AMC Register", "billing-go-amc", "")}</div></div>`;
    const visits = state.data.visits.filter(visit => visit.contractId === item.id).sort((a, b) => String(a.plannedDate).localeCompare(String(b.plannedDate)));
    const reports = state.data.reports.filter(report => report.contractId === item.id || job(report.workOrderId)?.contractId === item.id);
    const files = state.data.files.filter(file => file.contractId === item.id && file.kind === "contract");
    const contractBilling = rows().filter(record => record.contractId === item.id && record.sourceType === "AMC");
    const tabs = ["Overview", "Service Schedule", "Service Reports", "Documents", "Billing & Payments"];
    let body;
    if (ui.tab === "Billing & Payments") body = amcBilling(item);
    else if (ui.tab === "Service Schedule") body = `<section class="mb-card"><div class="mb-section-head"><h2>Service Schedule</h2>${action("+ Schedule Visit", "schedule-for-amc", item.id, "mb-outline")}</div>${table(["Visit", "Planned Date", "Status", "Work Order", "Action"], visits.map(visit => `<tr>${cell(esc(visit.sequence))}${cell(date(visit.plannedDate))}${cell(pill(visit.status))}${cell(esc(job(visit.workOrderId)?.number || "—"))}${cell(visit.workOrderId ? action("View Work Order", "open-job", visit.workOrderId) : action("Schedule", "amc-schedule-visit", visit.id))}</tr>`).join(""), "No visits planned.")}</section>`;
    else if (ui.tab === "Service Reports") body = `<section class="mb-card"><div class="mb-section-head"><h2>Service Reports</h2></div>${table(["Report No.", "Service Date", "Work Order", "Status", "Action"], reports.map(report => `<tr>${cell(esc(report.number))}${cell(date(report.extracted?.serviceDate || report.submittedAt))}${cell(esc(job(report.workOrderId)?.number || "—"))}${cell(pill(report.status))}${cell(action("View Report", "open-report", report.id))}</tr>`).join(""), "No service reports yet.")}</section>`;
    else if (ui.tab === "Documents") body = `<section class="mb-card"><div class="mb-section-head"><h2>Documents</h2></div><div class="mb-doc-list">${files.map(file => `<a href="${fileUrl(file.id)}" target="_blank" rel="noopener">${icon("paperclip")}${esc(file.originalName)}</a>`).join("") || `<p class="mb-muted">No contract documents uploaded.</p>`}</div><label class="mb-outline mb-file-label">Upload contract document<input type="file" data-contract-file="${esc(item.id)}" accept=".pdf,.png,.jpg,.jpeg,.webp" hidden></label></section>`;
    else body = `<div class="mb-overview-grid"><section class="mb-card"><h2>Contract Overview</h2><div class="mb-summary-grid">${kv("Customer", item.customerName)}${kv("Site / Location", item.site)}${kv("Contact Person", item.contact)}${kv("Phone", item.phone)}${kv("Email", item.email)}${kv("AMC Type", item.amcType)}${kv("Contract Start", date(item.startDate))}${kv("Contract End", date(item.endDate))}${kv("Frequency", item.frequency)}${kv("Visits per Year", item.visitsPerYear)}${kv("AC Units", item.unitCount)}${kv("Contract Value (excl. VAT)", money(item.contractValue))}</div><p class="mb-notes">${esc(item.notes || "No contract notes.")}</p></section><section class="mb-card"><h2>Service Activity</h2><div class="mb-summary-grid">${kv("Planned Visits", visits.length)}${kv("Completed Visits", visits.filter(visit => visit.status === "Completed").length)}${kv("Service Reports", reports.length)}${kv("Invoices", contractBilling.filter(record => record.invoice).length)}</div><h3>Recent Activity</h3>${state.data.activity.filter(entry => entry.targetId === item.id || state.data.workOrders.some(wo => wo.contractId === item.id && wo.id === entry.targetId)).slice(0, 12).map(entry => `<div class="mb-side-row"><span><strong>${esc(entry.message)}</strong><small>${esc(entry.actor)} · ${date(entry.createdAt)}</small></span></div>`).join("") || `<p class="mb-muted">No activity recorded.</p>`}</section></div>`;
    return `<div class="mb-page mb-amc-full"><div class="mb-crumb">${action("Maintenance", "billing-go-amc", "")} › ${action("AMC Register", "billing-go-amc", "")} › ${esc(item.number)}</div><header class="mb-page-head"><div><h1>${esc(item.number)} ${pill(contractStatus(item))}</h1><p>${esc(item.customerName)} · ${esc(item.site)} · ${date(item.startDate)} – ${date(item.endDate)}</p></div><div>${action("Edit AMC", "edit-amc", item.id, "mb-outline")}${files[0] ? `<a class="mb-outline" href="${fileUrl(files[0].id)}" target="_blank" rel="noopener">Download Contract</a>` : ""}</div></header><nav class="mb-tabs" aria-label="AMC sections">${tabs.map(tab => `<button data-action="billing-amc-tab" data-tab="${tab}" class="${ui.tab === tab ? "active" : ""}">${tab}</button>`).join("")}</nav><div class="mb-content">${body}</div></div>`;
  }
  function workOrder(item) {
    const parent = contract(item.contractId);
    if (parent) {
      const amcList = rows().filter(record => record.contractId === parent.id && record.sourceType === "AMC");
      const extras = rows().filter(record => record.workOrderId === item.id && record.sourceType === "Additional Charge");
      return `<div class="mb-work-order"><section class="mb-card"><div class="mb-section-head"><h2>AMC Contract Billing · ${esc(parent.number)}</h2>${action("View AMC Billing Details", "billing-open-amc", parent.id, "mb-outline")}</div><p class="mb-muted">This work order is covered by its AMC contract. Contract installments are shown once in AMC billing.</p>${metrics(amcList, "Contract Value", parent.contractValue)}${paymentSchedule(amcList)}</section><section class="mb-card"><div class="mb-section-head"><h2>Additional Charges Outside AMC Coverage</h2>${action("+ Additional Charge", "billing-open-extra", item.id, "mb-primary")}</div><p class="mb-muted">Only work or parts explicitly added here are billed separately.</p>${extras.length ? `${metrics(extras, "Extra Charges", extras.reduce((sum, record) => sum + Number(record.amountExVat), 0))}${paymentSchedule(extras)}${paymentHistory(extras)}` : `<div class="mb-empty">No additional charges recorded for this work order.</div>`}</section></div>`;
    }
    const record = rows().find(row => row.sourceType === "Work Order" && row.workOrderId === item.id);
    if (!record) return `<div class="mb-empty">Billing record unavailable. Refresh Maintenance.</div>`;
    return `<div class="mb-work-order"><section class="mb-card"><div class="mb-section-head"><h2>Work Order Billing · ${esc(item.number)}</h2>${!record.request && !record.invoice ? action("Set Service Amount", "billing-open-amount", record.id, "mb-outline") : ""}</div>${metrics([record], "Service Amount", record.amountExVat)}<div class="mb-summary-grid">${kv("Service Amount (excl. VAT)", money(record.amountExVat))}${kv("VAT", `${esc(record.vatRate)}%`)}${kv("Expected Total", money(record.amountExVat * (1 + Number(record.vatRate) / 100)))}${kv("Invoice Number", record.invoice?.number)}${kv("Invoice Date", date(record.invoice?.date))}${kv("Invoice Status", record.invoiceStatus)}${kv("Payment Status", record.paymentStatus)}${kv("Payment Date", date(record.payments?.at(-1)?.date))}${kv("Payment Reference", record.payments?.at(-1)?.reference)}</div><div class="mb-toolbar">${recordActions(record)}</div></section><section class="mb-card"><div class="mb-section-head"><h2>Invoice & Payment History</h2></div>${invoiceHistory([record])}${paymentHistory([record])}</section></div>`;
  }
  function main() {
    const all = rows().filter(item => item.request || item.invoice || item.payments?.length);
    const counts = { requests: all.filter(item => item.request).length, pending: all.filter(item => item.invoiceStatus === "Pending Accountant Action").length,
      invoiced: all.filter(item => !!item.invoice).length, partial: all.filter(item => item.totalPaid > 0 && item.outstanding > 0).length,
      paid: all.filter(item => item.paymentStatus === "Paid").length, overdue: all.filter(item => item.paymentStatus === "Overdue").length };
    const customers = [...new Set(all.map(item => item.customerName))].sort();
    const query = ui.search.toLowerCase().trim();
    const filtered = all.filter(item => {
      if (ui.quick === "pending" && item.invoiceStatus !== "Pending Accountant Action") return false;
      if (ui.quick === "invoiced" && !item.invoice) return false;
      if (ui.quick === "unpaid" && !["Unpaid", "Partially Paid", "Overdue"].includes(item.paymentStatus)) return false;
      if (ui.quick === "paid" && item.paymentStatus !== "Paid") return false;
      if (ui.source === "AMC" && item.sourceType !== "AMC") return false;
      if (ui.source === "Non-AMC" && item.sourceType !== "Work Order") return false;
      if (ui.source === "Additional Charge" && item.sourceType !== "Additional Charge") return false;
      if (ui.invoiceStatus !== "all" && item.invoiceStatus !== ui.invoiceStatus) return false;
      if (ui.paymentStatus !== "all" && item.paymentStatus !== ui.paymentStatus) return false;
      if (ui.customer && item.customerName !== ui.customer) return false;
      const stamp = item.request?.requestedAt?.slice(0, 10) || item.invoice?.date || item.periodStart;
      if (ui.from && stamp < ui.from || ui.to && stamp > ui.to) return false;
      return !query || [item.reference, item.customerName, item.site, item.invoice?.number, item.description].join(" ").toLowerCase().includes(query);
    }).sort((a, b) => ui.sort === "customer" ? a.customerName.localeCompare(b.customerName) : ui.sort === "amount" ? Number(b.invoiceTotal || b.amountExVat) - Number(a.invoiceTotal || a.amountExVat)
      : String(b.request?.requestedAt || b.invoice?.recordedAt || b.periodStart).localeCompare(String(a.request?.requestedAt || a.invoice?.recordedAt || a.periodStart)));
    const pages = Math.max(1, Math.ceil(filtered.length / ui.size));
    ui.page = Math.min(ui.page, pages);
    const pageRows = filtered.slice((ui.page - 1) * ui.size, ui.page * ui.size);
    const selected = filtered.find(item => item.id === ui.selectedId) || pageRows[0];
    ui.selectedId = selected?.id || "";
    const kpis = [["Total Invoice Requests", counts.requests, "file-text", "blue"], ["Pending Accountant Action", counts.pending, "clock-3", "amber"],
      ["Invoiced", counts.invoiced, "file-check-2", "blue"], ["Partially Paid", counts.partial, "calendar-check", "violet"],
      ["Fully Paid", counts.paid, "circle-check", "green"], ["Overdue", counts.overdue, "clock-3", "red"]];
    const tableBody = pageRows.map(item => `<tr class="${selected?.id === item.id ? "selected" : ""}"><td><button class="mb-reference" data-action="billing-open-source" data-id="${esc(item.id)}">${esc(item.reference)}</button><small class="mb-source">${esc(item.sourceType === "AMC" ? "AMC" : "Work Order")}${item.sourceType === "Additional Charge" ? " · Extra" : ""}</small></td><td>${esc(item.customerName)}<small>${esc(item.site)}</small></td><td>${date(item.periodStart)}${item.periodEnd !== item.periodStart ? `<small>to ${date(item.periodEnd)}</small>` : ""}</td><td>${esc(item.request?.requestedBy || "—")}<small>${date(item.request?.requestedAt)}</small></td><td>${pill(item.invoiceStatus)}</td><td>${pill(item.paymentStatus)}</td><td>${money(item.invoice ? item.invoiceTotal : item.amountExVat * (1 + Number(item.vatRate || 0) / 100))}</td><td>${action("View", "billing-select", item.id, "mb-outline")}</td></tr>`).join("");
    const detail = selected && !ui.hideDetail ? `<aside class="mb-detail"><div class="mb-detail-head"><div><h2>${esc(selected.reference)} ${pill(selected.paymentStatus)}</h2><p>${esc(selected.customerName)} · ${esc(selected.site)}</p></div>${action("×", "billing-close-detail", "")}</div><section><h3>Billing Summary</h3><div class="mb-summary-grid">${kv("Reference", selected.reference)}${kv("Customer / Site", `${selected.customerName} / ${selected.site}`)}${kv("Billing Type", selected.sourceType)}${kv("Amount (excl. VAT)", money(selected.amountExVat))}${kv("Invoice Status", selected.invoiceStatus)}${kv("Payment Status", selected.paymentStatus)}</div></section><section><h3>Accountant Handoff</h3><div class="mb-summary-grid">${kv("Requested By / Date", `${selected.request?.requestedBy || "—"} / ${date(selected.request?.requestedAt)}`)}${kv("Sent to Accountant", selected.request ? date(selected.request.requestedAt) : "—")}${kv("Handled By", selected.request?.handledBy)}</div></section><section><h3>Invoice Details</h3><div class="mb-summary-grid">${kv("Invoice Number", selected.invoice?.number)}${kv("Invoice Date", date(selected.invoice?.date))}${kv("Invoice Amount", money(selected.invoiceTotal))}</div>${invoiceLink(selected)}${recordActions(selected)}</section><section><h3>Payment Details</h3><div class="mb-summary-grid">${kv("Amount Paid", money(selected.totalPaid))}${kv("Outstanding", money(selected.outstanding))}${kv("Last Payment Date", date(selected.payments?.at(-1)?.date))}${kv("Payment Reference", selected.payments?.at(-1)?.reference)}</div>${paymentHistory([selected])}</section></aside>` : "";
    return `<div class="mb-page mb-main-page"><header class="mb-page-head"><div><h1>AMC Billing & Payments</h1><p>Manage invoice requests, invoice tracking and payment follow-up for maintenance.</p></div><div class="mb-header-actions"><label class="mb-search">${icon("search")}<input data-billing-search value="${esc(ui.search)}" placeholder="Search AMC, customer, invoice no..."></label>${action("Filter", "billing-toggle-filters", "", "mb-outline")}${action("Export", "billing-export", "", "mb-outline")}${action("+ Create Invoice Request", "billing-open-request", "", "mb-primary")}</div></header><div class="mb-content"><div class="mb-kpis">${kpis.map(([label, count, symbol, tone]) => `<div class="mb-kpi ${tone}"><span>${icon(symbol)}</span><div><small>${esc(label)}</small><strong>${count}</strong></div></div>`).join("")}</div>${ui.filtersOpen ? `<div class="mb-filter-panel"><label>Source<select data-billing-filter="source">${[["all", "All"], ["AMC", "AMC"], ["Non-AMC", "Non-AMC"], ["Additional Charge", "Additional Charge"]].map(([value, label]) => `<option value="${value}" ${ui.source === value ? "selected" : ""}>${label}</option>`).join("")}</select></label><label>Invoice Status<select data-billing-filter="invoiceStatus"><option value="all">All</option>${["Not Requested", "Pending Accountant Action", "Prepared", "Invoice Received", "Sent to Customer"].map(value => `<option ${ui.invoiceStatus === value ? "selected" : ""}>${value}</option>`).join("")}</select></label><label>Payment Status<select data-billing-filter="paymentStatus"><option value="all">All</option>${["Upcoming", "Unpaid", "Partially Paid", "Paid", "Overdue"].map(value => `<option ${ui.paymentStatus === value ? "selected" : ""}>${value}</option>`).join("")}</select></label><label>Customer<select data-billing-filter="customer"><option value="">All customers</option>${customers.map(value => `<option value="${esc(value)}" ${ui.customer === value ? "selected" : ""}>${esc(value)}</option>`).join("")}</select></label><label>From<input type="date" data-billing-filter="from" value="${esc(ui.from)}"></label><label>To<input type="date" data-billing-filter="to" value="${esc(ui.to)}"></label>${action("Clear", "billing-clear-filters", "", "mb-outline")}</div>` : ""}<div class="mb-main-layout"><section class="mb-card"><div class="mb-section-head"><div class="mb-segments">${[["all", "All Requests", all.length], ["pending", "Pending Request", counts.pending], ["invoiced", "Invoiced", counts.invoiced], ["unpaid", "Unpaid", all.filter(item => ["Unpaid", "Partially Paid", "Overdue"].includes(item.paymentStatus)).length], ["paid", "Paid", counts.paid]].map(([value, label, count]) => `<button class="${ui.quick === value || !ui.quick && value === "all" ? "active" : ""}" data-action="billing-quick" data-value="${value}">${label} <b>${count}</b></button>`).join("")}</div><label>Sort by <select data-billing-sort><option value="recent" ${ui.sort === "recent" ? "selected" : ""}>Most Recent</option><option value="customer" ${ui.sort === "customer" ? "selected" : ""}>Customer</option><option value="amount" ${ui.sort === "amount" ? "selected" : ""}>Amount</option></select></label></div>${table(["Reference", "Customer / Site", "Billing Period / Service Date", "Requested By / Date", "Invoice Status", "Payment Status", "Amount (AED)", "Action"], tableBody, "No billing activity matches your filters.")}<div class="mb-pagination"><span>Showing ${filtered.length ? (ui.page - 1) * ui.size + 1 : 0} to ${Math.min(ui.page * ui.size, filtered.length)} of ${filtered.length}</span><div><label>Rows per page <select data-billing-size><option value="10" ${ui.size === 10 ? "selected" : ""}>10</option><option value="20" ${ui.size === 20 ? "selected" : ""}>20</option></select></label>${action("‹", "billing-prev", "", "mb-outline")}<b>${ui.page} / ${pages}</b>${action("›", "billing-next", "", "mb-outline")}</div></div></section>${detail}</div></div></div>`;
  }
  function open(type, id = "") {
    const record = row(id);
    state.drawer = `billing-${type}`;
    state.drawerId = id;
    state.billingDraft = { recordId: id, fileId: "", receiptFileId: "", number: "", date: today(), dueDate: record?.dueDate || "", sourceReference: "", ocrWarnings: [],
      customerName: record?.customerName || "", amountExVat: record?.amountExVat || 0,
      vatAmount: Number((Number(record?.amountExVat || 0) * Number(record?.vatRate ?? 5) / 100).toFixed(2)),
      total: Number((Number(record?.amountExVat || 0) * (1 + Number(record?.vatRate ?? 5) / 100)).toFixed(2)),
      amount: record?.outstanding || 0, credits: record?.credits || 0, method: "Bank Transfer", reference: "", notes: record?.notes || "", remarks: "" };
    render();
  }
  function drawer() {
    const type = String(state.drawer || "").replace(/^billing-/, "");
    if (!state.drawer?.startsWith("billing-")) return "";
    const draft = state.billingDraft || {};
    const record = row(draft.recordId);
    const available = rows().filter(item => type === "payment" ? item.invoice && item.outstanding > 0
      : !item.invoice && (type !== "request" || !item.request && Number(item.amountExVat) > 0));
    const selector = ["request", "invoice", "payment"].includes(type) ? `<label class="maint-field"><span>Billing record *</span><select name="recordId" data-billing-record><option value="">Select AMC installment or work order</option>${available.map(item => `<option value="${esc(item.id)}" ${draft.recordId === item.id ? "selected" : ""}>${esc(item.reference)}${item.installmentNumber ? ` · Installment ${item.installmentNumber}` : item.description ? ` · ${esc(item.description)}` : ""} · ${money(item.amountExVat)}</option>`).join("")}${record && !available.some(item => item.id === record.id) ? `<option value="${esc(record.id)}" selected>${esc(record.reference)}</option>` : ""}</select></label>` : "";
    let body = "";
    if (type === "request") body = `${selector}<p class="mb-form-hint">Customer: ${esc(record?.customerName || "Select a record")} · Site: ${esc(record?.site || "—")} · Amount: ${money(record?.amountExVat)}</p><label class="maint-field"><span>Invoice remarks</span><textarea name="remarks" rows="4">${esc(draft.remarks || "")}</textarea></label>`;
    if (type === "invoice") body = `${selector}<p class="mb-form-hint">Upload the invoice created in your accounting software, then verify its details. Payment remains unpaid until confirmed separately.</p><label class="maint-field"><span>Upload invoice (PDF, JPG, PNG)</span><input type="file" data-billing-file="invoice" accept=".pdf,.jpg,.jpeg,.png"></label>${draft.fileName ? `<p class="mb-file-ok">${esc(draft.fileName)} uploaded · Verify the extracted values below.</p>` : ""}${draft.ocrWarnings?.length ? `<div class="mb-ocr-warnings">${draft.ocrWarnings.map(warning => `<p>${esc(warning)}</p>`).join("")}</div>` : ""}<div class="maint-form-grid">${formField("Invoice Number", "number", draft.number, "text", true)}${formField("Invoice Date", "date", draft.date, "date", true)}${formField("Customer Name", "customerName", draft.customerName, "text", true)}${formField("Reference on Invoice (AMC / Work Order)", "sourceReference", draft.sourceReference, "text")}${formField("Payment Due Date", "dueDate", draft.dueDate, "date")}${formField("Amount Before VAT", "amountExVat", draft.amountExVat, "number", true, 'step="0.01" min="0"')}${formField("VAT Amount", "vatAmount", draft.vatAmount, "number", true, 'step="0.01" min="0"')}${formField("Total Invoice Amount", "total", draft.total, "number", true, 'step="0.01" min="0.01"')}</div><label class="maint-check"><input type="checkbox" name="confirmMismatch"> I verified any difference in customer, reference or amount against the accounting invoice.</label>`;
    if (type === "payment") body = `${selector}<p class="mb-form-hint">Invoice ${esc(record?.invoice?.number || "—")} · Outstanding: ${money(record?.outstanding)}</p><div class="maint-form-grid">${formField("Amount Received", "amount", draft.amount, "number", true, 'step="0.01" min="0.01"')}${formField("Payment Date", "date", draft.date, "date", true)}<label class="maint-field"><span>Payment Method *</span><select name="method">${["Bank Transfer", "Cash", "Cheque", "Card", "Other"].map(value => `<option ${draft.method === value ? "selected" : ""}>${value}</option>`).join("")}</select></label>${formField("Payment Reference", "reference", draft.reference, "text", true)}</div><label class="maint-field"><span>Payment Receipt (optional PDF, JPG, PNG)</span><input type="file" data-billing-file="receipt" accept=".pdf,.jpg,.jpeg,.png"></label>${draft.fileName ? `<p class="mb-file-ok">${esc(draft.fileName)} uploaded · Verify the payment below.</p>` : ""}${draft.ocrWarnings?.length ? `<div class="mb-ocr-warnings">${draft.ocrWarnings.map(warning => `<p>${esc(warning)}</p>`).join("")}</div>` : ""}<label class="maint-check"><input type="checkbox" name="verified" required> I verified this payment in the accounting records.</label>`;
    if (type === "amount") body = `<p class="mb-form-hint">${esc(record?.reference || "Work Order")} · ${esc(record?.customerName || "")}</p><div class="maint-form-grid">${formField("Service / Work Order Amount (AED)", "amountExVat", record?.amountExVat, "number", true, 'step="0.01" min="0"')}${formField("VAT (%)", "vatRate", record?.vatRate ?? 5, "number", true, 'step="0.01" min="0" max="100"')}</div>`;
    if (type === "credit") body = `<p class="mb-form-hint">${esc(record?.reference || "Billing record")} · Invoice ${esc(record?.invoice?.number || "—")}. Credits reduce the outstanding invoice balance.</p>${formField("Total Applicable Credits (AED)", "credits", record?.credits || 0, "number", true, `step="0.01" min="0" max="${esc(record?.invoice?.total || 0)}"`)}`;
    if (type === "extra") body = `<p class="mb-form-hint">Work Order ${esc(job(state.drawerId)?.number || "")} · Charge only work or parts outside AMC coverage.</p>${formField("Description of Additional Work / Parts", "description", "", "text", true)}${formField("Amount Excluding VAT (AED)", "amountExVat", "", "number", true, 'step="0.01" min="0.01"')}`;
    if (type === "notes") body = `<label class="maint-field"><span>Payment Notes</span><textarea name="notes" rows="6">${esc(state.data.billingNotes?.[state.drawerId] || "")}</textarea></label>`;
    const title = ({ request: "Request Invoice", invoice: "Upload / Enter Invoice", payment: "Record Payment", amount: "Set Service Amount", credit: "Apply Credit", extra: "Additional Work Order Charge", notes: "Payment Notes" })[type] || "Billing";
    return drawerShell(title, `<form id="maintBillingForm" class="maint-form mb-form">${body}</form>`, `<button class="maint-outline" data-action="close-drawer">Cancel</button><button class="maint-primary" data-action="billing-submit">${icon("save")} Save ${type === "request" ? "Request" : type === "payment" ? "Payment" : "Changes"}</button>`);
  }
  function remember() {
    const form = root.querySelector("#maintBillingForm");
    if (!form) return;
    const data = new FormData(form);
    for (const [key, value] of data) if (typeof value === "string") state.billingDraft[key] = value;
  }
  async function submit() {
    const form = root.querySelector("#maintBillingForm");
    if (!form?.reportValidity()) return;
    remember();
    const draft = state.billingDraft, type = state.drawer.replace("billing-", "");
    const id = draft.recordId;
    if (["request", "invoice", "payment"].includes(type) && !id) return notice("Choose a billing record first.");
    const target = `/api/maintenance/billing/${encodeURIComponent(id)}`;
    const options = { method: "POST", body: "{}" };
    let url = target;
    if (type === "request") { url += "/request"; options.body = JSON.stringify({ remarks: draft.remarks }); }
    if (type === "invoice") {
      url += "/invoice"; options.body = JSON.stringify({ number: draft.number, date: draft.date, dueDate: draft.dueDate, sourceReference: draft.sourceReference,
        customerName: draft.customerName, amountExVat: Number(draft.amountExVat), vatAmount: Number(draft.vatAmount),
        total: Number(draft.total), fileId: draft.fileId, confirmMismatch: !!form.elements.namedItem("confirmMismatch")?.checked });
    }
    if (type === "payment") { url += "/payments"; options.body = JSON.stringify({ amount: Number(draft.amount), date: draft.date, method: draft.method,
      reference: draft.reference, receiptFileId: draft.receiptFileId }); }
    if (type === "amount") { url = target; options.method = "PUT"; options.body = JSON.stringify({ amountExVat: Number(draft.amountExVat), vatRate: Number(draft.vatRate) }); }
    if (type === "credit") { url = target; options.method = "PUT"; options.body = JSON.stringify({ credits: Number(draft.credits) }); }
    if (type === "extra") { url = "/api/maintenance/billing/extra"; options.body = JSON.stringify({ workOrderId: state.drawerId, description: draft.description, amountExVat: Number(draft.amountExVat) }); }
    if (type === "notes") { url = `/api/maintenance/billing/notes/${encodeURIComponent(state.drawerId)}`; options.method = "PUT"; options.body = JSON.stringify({ notes: draft.notes }); }
    const saveButton = root.querySelector('[data-action="billing-submit"]');
    if (saveButton) { saveButton.disabled = true; saveButton.textContent = "Saving..."; }
    try { await request(url, options); state.drawer = ""; await refresh(); notice(type === "payment" ? "Payment confirmed" : type === "invoice" ? "Invoice saved for review" : "Billing updated"); }
    catch (error) { notice(error.message || "Unable to save billing details"); if (saveButton?.isConnected) { saveButton.disabled = false; saveButton.textContent = "Save Changes"; } }
  }
  async function handleAction(button) {
    const name = button.dataset.action, id = button.dataset.id || "";
    if (!name.startsWith("billing-")) return false;
    if (name === "billing-go-amc") navigate("amc");
    else if (name === "billing-open-amc") { ui.tab = "Billing & Payments"; navigate("amc", id); }
    else if (name === "billing-amc-tab") { ui.tab = button.dataset.tab; render(); }
    else if (name === "billing-open-source") { const item = row(id); if (item) { ui.tab = "Overview"; navigate(item.sourceType === "AMC" ? "amc" : "work-orders", item.sourceType === "AMC" ? item.contractId : item.workOrderId); } }
    else if (name === "billing-select") { ui.selectedId = id; ui.hideDetail = false; render(); }
    else if (name === "billing-close-detail") { ui.hideDetail = true; render(); }
    else if (name === "billing-open-request") open("request", id);
    else if (name === "billing-open-invoice") open("invoice", id);
    else if (name === "billing-open-payment") open("payment", id);
    else if (name === "billing-open-amount") open("amount", id);
    else if (name === "billing-open-credit") open("credit", id);
    else if (name === "billing-open-extra") open("extra", id);
    else if (name === "billing-open-notes") open("notes", id);
    else if (name === "billing-submit") await submit();
    else if (name === "billing-toggle-filters") { ui.filtersOpen = !ui.filtersOpen; render(); }
    else if (name === "billing-clear-filters") { Object.assign(ui, { source: "all", invoiceStatus: "all", paymentStatus: "all", customer: "", from: "", to: "", page: 1 }); render(); }
    else if (name === "billing-prev" || name === "billing-next") { ui.page = Math.max(1, ui.page + (name === "billing-next" ? 1 : -1)); render(); }
    else if (name === "billing-quick") { ui.quick = button.dataset.value; ui.page = 1; render(); }
    else if (name === "billing-export") {
      const header = ["Reference", "Source", "Customer", "Site", "Billing Period", "Requested By", "Invoice Status", "Payment Status", "Amount (AED)"];
      const values = rows().filter(item => item.request || item.invoice).map(item => [item.reference, item.sourceType, item.customerName, item.site, item.periodStart, item.request?.requestedBy || "", item.invoiceStatus, item.paymentStatus, item.invoice ? item.invoiceTotal : Number((item.amountExVat * (1 + Number(item.vatRate || 0) / 100)).toFixed(2))]);
      const csv = [header, ...values].map(record => record.map(value => `"${String(value ?? "").replaceAll('"', '""')}"`).join(",")).join("\r\n");
      const href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); const link = document.createElement("a"); link.href = href; link.download = "maintenance-billing.csv"; link.click(); setTimeout(() => URL.revokeObjectURL(href), 1000);
    }
    else if (name === "billing-handoff" || name === "billing-sent") {
      try { await request(`/api/maintenance/billing/${encodeURIComponent(id)}/${name === "billing-sent" ? "sent" : "handoff"}`, { method: "POST", body: "{}" }); await refresh(); notice(name === "billing-sent" ? "Invoice marked sent to customer" : "Invoice marked prepared"); }
      catch (error) { notice(error.message); }
    }
    return true;
  }
  async function handleChange(input) {
    if (input.matches("[data-billing-filter]")) { ui[input.dataset.billingFilter] = input.value; ui.page = 1; render(); return true; }
    if (input.matches("[data-billing-sort]")) { ui.sort = input.value; render(); return true; }
    if (input.matches("[data-billing-size]")) { ui.size = Number(input.value); ui.page = 1; render(); return true; }
    if (input.matches("[data-billing-record]")) {
      cleanupDraft(); remember(); const selected = row(input.value); state.billingDraft.recordId = input.value;
      state.billingDraft.fileId = ""; state.billingDraft.receiptFileId = ""; state.billingDraft.fileName = ""; state.billingDraft.sourceReference = ""; state.billingDraft.ocrWarnings = [];
      if (selected) Object.assign(state.billingDraft, { customerName: selected.customerName, dueDate: selected.dueDate,
        amountExVat: selected.amountExVat, vatAmount: Number((selected.amountExVat * selected.vatRate / 100).toFixed(2)),
        total: Number((selected.amountExVat * (1 + selected.vatRate / 100)).toFixed(2)), amount: selected.outstanding });
      render(); return true;
    }
    if (!input.matches("[data-billing-file]")) return false;
    const file = input.files?.[0];
    if (!file) return true;
    remember();
    const id = state.billingDraft.recordId;
    if (!id) { notice("Choose a billing record before uploading."); return true; }
    if (file.size > 10 * 1024 * 1024) { notice("Choose a file smaller than 10 MB."); return true; }
    const form = new FormData(); form.append("file", file, file.name);
    const ticket = ++ui.uploadTicket;
    const activeDrawer = state.drawer;
    try {
      const kind = input.dataset.billingFile;
      const result = await request(`/api/maintenance/billing/${encodeURIComponent(id)}/${kind === "invoice" ? "invoice-upload" : "receipt-upload"}`, { method: "POST", body: form });
      if (ticket !== ui.uploadTicket || state.drawer !== activeDrawer || state.billingDraft.recordId !== id) {
        request(`/api/maintenance/billing/${encodeURIComponent(id)}/uploads/${encodeURIComponent(result.file.id)}`, { method: "DELETE" }).catch(() => {});
        return true;
      }
      cleanupDraft();
      state.billingDraft[kind === "invoice" ? "fileId" : "receiptFileId"] = result.file.id;
      state.billingDraft.fileName = result.file.originalName;
      state.billingDraft.ocrWarnings = result.warnings || [];
      const fields = result.fields || {};
      const dateField = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) ? value : "";
      const moneyField = value => value !== "" && value !== undefined && Number.isFinite(Number(value)) ? Number(value) : null;
      if (kind === "invoice") {
        if (fields.invoiceNumber) state.billingDraft.number = fields.invoiceNumber;
        if (dateField(fields.invoiceDate)) state.billingDraft.date = fields.invoiceDate;
        if (fields.customerName) state.billingDraft.customerName = fields.customerName;
        if (fields.sourceReference) state.billingDraft.sourceReference = fields.sourceReference;
        if (dateField(fields.dueDate)) state.billingDraft.dueDate = fields.dueDate;
        for (const [source, target] of [["amountExVat", "amountExVat"], ["vatAmount", "vatAmount"], ["total", "total"]]) {
          const value = moneyField(fields[source]); if (value !== null) state.billingDraft[target] = value;
        }
      } else {
        if (dateField(fields.paymentDate)) state.billingDraft.date = fields.paymentDate;
        const received = moneyField(fields.amountReceived); if (received !== null) state.billingDraft.amount = received;
        if (fields.paymentReference) state.billingDraft.reference = fields.paymentReference;
        if (fields.paymentMethod) state.billingDraft.method = /bank|wire|transfer/i.test(fields.paymentMethod) ? "Bank Transfer"
          : /cash/i.test(fields.paymentMethod) ? "Cash" : /cheque|check/i.test(fields.paymentMethod) ? "Cheque"
            : /card/i.test(fields.paymentMethod) ? "Card" : "Other";
      }
      render(); notice(result.message || "Document uploaded. Verify the details before saving.");
    } catch (error) { notice(error.message || "Unable to upload document"); }
    return true;
  }
  function handleInput(input) {
    if (!input.matches("[data-billing-search]")) return false;
    ui.search = input.value; ui.page = 1; render(); return true;
  }
  function cleanupDraft() {
    ui.uploadTicket++;
    if (!state.drawer?.startsWith("billing-") || !state.billingDraft?.recordId) return;
    const id = encodeURIComponent(state.billingDraft.recordId);
    for (const fileId of [state.billingDraft.fileId, state.billingDraft.receiptFileId].filter(Boolean)) {
      request(`/api/maintenance/billing/${id}/uploads/${encodeURIComponent(fileId)}`, { method: "DELETE" }).catch(() => {});
    }
  }
  return { main, fullAmc, workOrder, drawer, handleAction, handleChange, handleInput,
    cleanupDraft, setTab(tab) { ui.tab = tab; }, resetMain() { ui.selectedId = ""; } };
};
