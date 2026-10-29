window.createMaintenanceBilling = function createMaintenanceBilling(api) {
  const { state, root, esc, icon, badge, day, shortDay, today, contract, contractStatus, job, request, refresh,
    notice, render, navigate, drawerShell, closeDrawer, formField } = api;
  const ui = { tab: "Overview", search: "", source: "all", status: "all",
    customer: "", from: "", to: "", sort: "recent", page: 1, size: 10, filtersOpen: false, uploadTicket: 0 };
  const billingNoteDrafts = new Map();
  const noteKey = (kind, id) => `${kind}:${id}`;
  function noteDraft(kind, id, savedNotes) {
    const key = noteKey(kind, id);
    if (!billingNoteDrafts.has(key)) billingNoteDrafts.set(key, { value: savedNotes || "", saved: savedNotes || "", timer: null, saving: false });
    return billingNoteDrafts.get(key);
  }
  async function saveBillingNotes(kind, id) {
    const draft = billingNoteDrafts.get(noteKey(kind, id));
    if (!draft) return;
    clearTimeout(draft.timer);
    draft.timer = null;
    if (draft.saving || draft.value === draft.saved) return;
    const value = draft.value;
    draft.saving = true;
    try {
      const path = kind === "amc" ? `/api/maintenance/billing/notes/${encodeURIComponent(id)}` : `/api/maintenance/billing/${encodeURIComponent(id)}`;
      await request(path, { method: "PUT", body: JSON.stringify({ notes: value }) });
      draft.saved = value;
      if (kind === "amc") { state.data.billingNotes ||= {}; state.data.billingNotes[id] = value; }
      else { const record = row(id); if (record) record.notes = value; }
    } catch (error) {
      notice(error.message || "Unable to save billing notes");
    } finally {
      draft.saving = false;
      if (draft.value !== draft.saved && draft.value !== value) draft.timer = setTimeout(() => saveBillingNotes(kind, id), 500);
    }
  }
  const money = value => `AED ${Number(value || 0).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const amount = value => Number(value || 0).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const rows = () => state.data?.billing || [];
  const row = id => rows().find(item => item.id === id);
  const admin = () => state.data?.viewerRole === "admin";
  const fileUrl = id => `/api/maintenance/files/${encodeURIComponent(id)}`;
  const date = value => value ? shortDay(value) : "—";
  const periodDate = value => value ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value.slice(0, 10)}T12:00:00Z`)) : "—";
  const amcChoices = [["custom_installment", "Custom Installment"], ["full_contract", "Full Contract Billing"], ["advance_billing", "Advance Billing"], ["additional_adjustment", "Additional Charge / Adjustment"]];
  const workOrderChoices = [["advance_payment", "Advance Payment"], ["final_payment", "Final Payment"], ["variation_charge", "Additional / Variation Charge"], ["materials_charge", "Material / Spare Parts Charge"]];
  const billingLabel = item => [...amcChoices, ...workOrderChoices].find(([key]) => key === item.billingType)?.[1] || item.description || item.installmentNumber || "—";
  const referenceDetail = item => item.installmentNumber ? `Installment ${item.installmentNumber}`
    : item.billingType === "variation_charge" ? "Additional/Variation charge"
    : item.billingType ? billingLabel(item)
    : item.sourceType === "Additional Charge" ? "Additional charge"
    : ["AMC", "AMC Special"].includes(item.sourceType) ? "AMC" : "Work Order";
  const newRequestKey = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const pill = (value, tone = "") => `<span class="mb-pill ${tone || (/^paid$|completed|active/i.test(value) ? "green" : /overdue|unpaid|expired/i.test(value) ? "red" : /pending|partially|expiring/i.test(value) ? "amber" : "blue")}">${esc(value || "—")}</span>`;
  const invoicePill = value => pill(({ "Sent to Customer": "Sent", "Pending Accountant Action": "Pending", "Invoice Received": "Received" })[value] || value);
  const statusOf = item => {
    if (!item?.invoice) return ({ "Pending Accountant Action": "Invoice Pending" })[item?.invoiceStatus] || item?.invoiceStatus || "Not Requested";
    if (item.paymentStatus === "Paid" || item.paymentStatus === "Overdue" || item.paymentStatus === "Partially Paid") return item.paymentStatus;
    return item.invoice.sentAt ? "Sent to Customer" : "Unpaid";
  };
  const statusPill = item => {
    const status = statusOf(item);
    const tone = ({ "Not Requested": "blue", Draft: "blue", "Invoice Pending": "yellow", Prepared: "gold", "Sent to Customer": "teal", Unpaid: "rose", "Partially Paid": "rose", Overdue: "crimson", Paid: "green" })[status] || "blue";
    return pill(status, tone);
  };
  const action = (label, name, id, className = "") => `<button class="${className}" data-action="${name}" data-id="${esc(id || "")}">${esc(label)}</button>`;
  const kv = (label, value) => `<div><small>${esc(label)}</small><strong>${esc(value || "—")}</strong></div>`;
  const cell = content => `<td>${content}</td>`;
  const table = (headers, body, emptyText, className = "") => `<div class="mb-table-wrap"><table class="mb-table ${className}"><thead><tr>${headers.map(label => `<th>${esc(label)}</th>`).join("")}</tr></thead><tbody>${body || `<tr><td colspan="${headers.length}" class="mb-table-empty">${esc(emptyText)}</td></tr>`}</tbody></table></div>`;
  const labeledCell = (label, content) => `<td data-label="${esc(label)}">${content}</td>`;
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
  const paymentAction = record => !admin() || !record.invoice ? ""
    : record.paymentStatus === "Paid" ? (record.payments || []).some(payment => !payment.reversedAt)
      ? action("Mark as Unpaid", "billing-mark-unpaid", record.id) : ""
      : action("Mark as Paid", "billing-mark-paid", record.id);
  function recordActions(record) {
    return `<div class="mb-row-actions">${!record.invoice && (!record.request || record.request.status === "draft") ? action(record.request ? "Continue Request" : "Request Invoice", "billing-open-request", record.id) : ""}
      ${!record.invoice ? action("Upload Invoice", "billing-open-invoice", record.id) : `${record.paymentStatus !== "Paid" ? action("Edit Invoice", "billing-edit-invoice", record.id) : ""}${invoiceLink(record)}`}
      ${record.request && record.request.status !== "draft" && !record.request.preparedAt && !record.invoice && admin() ? action("Mark Prepared", "billing-handoff", record.id) : ""}
      ${record.invoice && !record.invoice.sentAt ? action("Mark Sent", "billing-sent", record.id) : ""}
      ${paymentAction(record)}</div>`;
  }
  function recordMenu(record) {
    const options = `${!record.invoice && (!record.request || record.request.status === "draft") ? action(record.request ? "Continue Request" : "Request Invoice", "billing-open-request", record.id) : ""}
      ${record.request && !record.invoice ? action("Edit", "billing-edit-request", record.id) : ""}
      ${!record.invoice ? action("Upload Invoice", "billing-open-invoice", record.id) : `${record.paymentStatus !== "Paid" ? action("Edit Invoice", "billing-edit-invoice", record.id) : ""}${invoiceLink(record)}`}
      ${record.request && record.request.status !== "draft" && !record.request.preparedAt && !record.invoice && admin() ? action("Mark Prepared", "billing-handoff", record.id) : ""}
      ${record.invoice && !record.invoice.sentAt ? action("Mark Sent", "billing-sent", record.id) : ""}
      ${paymentAction(record)}
      ${(record.request || record.invoice) && record.paymentStatus !== "Paid" && admin()
        ? action("Delete", "billing-delete-request", record.id, "mb-danger-action") : ""}
      ${record.sourceType === "AMC" && !record.request && !record.invoice && !record.payments?.length && admin()
        ? action("Delete Schedule Row", "billing-delete-installment", record.id, "mb-danger-action") : ""}`;
    return `<details class="mb-action-menu"><summary aria-label="Billing actions for ${esc(record.reference)}" title="More actions">•••</summary><div class="mb-action-menu-list">${options}</div></details>`;
  }
  function paymentSchedule(list, compact = false) {
    return table(["#", compact ? "Due Date" : "Payment Date", compact ? "Amount (AED) excl. VAT" : "Amount (excl. VAT)", compact ? "Amount (AED) incl. VAT" : "Amount (incl. VAT)", "Invoice No.", "Status", "Actions"],
      list.map(item => `<tr data-installment-id="${esc(item.id)}">${labeledCell("#", esc(billingLabel(item)))}${labeledCell("Due Date", date(item.dueDate))}${labeledCell("Amount excl. VAT", compact ? amount(item.amountExVat) : money(item.amountExVat))}
        ${labeledCell("Amount incl. VAT", (compact ? amount : money)(item.invoice?.total ?? (Number(item.amountExVat) * (1 + Number(item.vatRate || 0) / 100))))}${labeledCell("Invoice No.", esc(item.invoice?.number || "—"))}
        ${labeledCell("Status", statusPill(item))}${labeledCell("Actions", compact ? recordMenu(item) : recordActions(item))}</tr>`).join(""), "No payment installments yet.", compact ? "mb-amc-table mb-schedule-table" : "");
  }
  function amcScheduleAndRequests(list) {
    return table(["Charge", "Invoice No. / Date", "Requested / By", "Status", "Amount (AED)", "Actions"],
      list.map(item => `<tr data-installment-id="${esc(item.id)}">${labeledCell("Charge", `<strong>${esc(billingLabel(item))}</strong><small>Due ${date(item.dueDate)}</small>`)}
        ${labeledCell("Invoice No. / Date", `<strong>${esc(item.invoice?.number || "—")}</strong><small>${date(item.invoice?.date)}</small>`)}
        ${labeledCell("Requested / By", `<strong>${date(item.request?.requestDate || item.request?.requestedAt)}</strong><small>${esc(item.request?.requestedBy || "—")}</small>`)}
        ${labeledCell("Status", statusPill(item))}
        ${labeledCell("Amount (AED)", `<strong>${money(item.invoice?.total ?? (Number(item.amountExVat) * (1 + Number(item.vatRate || 0) / 100)))}</strong><small>${money(item.amountExVat)} excl. VAT</small>`)}
        ${labeledCell("Actions", recordMenu(item))}</tr>`).join(""), "No payment installments or invoice requests yet.", "mb-amc-table mb-amc-billing-table");
  }
  function workOrderInvoiceHistory(list) {
    const requested = list.filter(item => item.request || item.invoice);
    return table(["Charge", "Invoice No. / Date", "Requested / By", "Status", "Amount (AED)", "Actions"],
      requested.map(item => `<tr>${labeledCell("Charge", `<strong>${esc(item.sourceType === "Work Order" ? "Full Service Charge" : billingLabel(item))}</strong><small>${esc(item.reference)}</small>`)}
        ${labeledCell("Invoice No. / Date", `<strong>${esc(item.invoice?.number || "—")}</strong><small>${date(item.invoice?.date)}</small>`)}
        ${labeledCell("Requested / By", `<strong>${date(item.request?.requestDate || item.request?.requestedAt)}</strong><small>${esc(item.request?.requestedBy || "—")}</small>`)}
        ${labeledCell("Status", statusPill(item))}
        ${labeledCell("Amount (AED)", money(item.invoice?.total ?? (Number(item.amountExVat) * (1 + Number(item.vatRate || 0) / 100))))}
        ${labeledCell("Actions", recordMenu(item))}</tr>`).join(""), "No invoice requests yet.", "mb-work-order-history");
  }
  function paymentHistory(list) {
    const payments = list.flatMap(item => (item.payments || []).filter(payment => !payment.reversedAt).map(payment => ({ ...payment, invoiceNumber: item.invoice?.number || "—" })))
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));
    return table(["Payment Date", "Invoice No.", "Amount (AED)", "Method", "Reference", "Verified By", "Receipt"],
      payments.map(item => `<tr>${cell(date(item.date))}${cell(esc(item.invoiceNumber))}${cell(money(item.amount))}
        ${cell(esc(item.method))}${cell(esc(item.reference))}${cell(esc(item.confirmedBy || "—"))}${cell(receiptLink(item))}</tr>`).join(""), "No confirmed payments yet.");
  }
  function compactPayments(list) {
    const payments = list.flatMap(item => (item.payments || []).filter(payment => !payment.reversedAt).map(payment => ({ ...payment, invoiceNumber: item.invoice?.number || "—" })))
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const shown = ui.showAllPayments ? payments : payments.slice(0, 3);
    return table(["Payment Date", "Amount (AED)", "Payment Reference", "Actions"], shown.map(payment => `<tr>
      ${labeledCell("Payment Date", `${date(payment.date)}${ui.showAllPayments ? `<small>${esc(payment.invoiceNumber)} · ${esc(payment.method || "—")}</small>` : ""}`)}${labeledCell("Amount (AED)", amount(payment.amount))}
      ${labeledCell("Payment Reference", esc(payment.reference || "—"))}${labeledCell("Actions", payment.receiptFileId ? `<details class="mb-action-menu"><summary aria-label="Payment actions">•••</summary><div class="mb-action-menu-list">${receiptLink(payment)}</div></details>` : "—")}</tr>`).join(""), "No verified payments yet.", "mb-amc-table mb-payment-history-table");
  }
  function amcBilling(item) {
    const list = rows().filter(record => record.contractId === item.id && record.sourceType === "AMC").sort((a, b) => a.installmentNumber - b.installmentNumber);
    const specials = rows().filter(record => record.contractId === item.id && record.sourceType === "AMC Special");
    const activity = [...list, ...specials];
    const extras = rows().filter(record => record.contractId === item.id && record.sourceType === "Additional Charge");
    const fullContract = specials.find(record => record.billingType === "full_contract" && (record.request || record.invoice));
    const progressRows = fullContract ? [fullContract] : list;
    const done = progressRows.filter(record => record.paymentStatus === "Paid").length;
    const nextRequest = fullContract ? null : list.find(record => (!record.request || record.request.status === "draft") && !record.invoice && Number(record.amountExVat) > 0);
    const latest = activity.filter(record => record.invoice).sort((a, b) => String(b.invoice.recordedAt || b.invoice.date).localeCompare(String(a.invoice.recordedAt || a.invoice.date)))[0];
    const nextUnpaid = progressRows.find(record => record.paymentStatus !== "Paid");
    const pendingSend = activity.find(record => record.invoice && !record.invoice.sentAt);
    const payments = activity.flatMap(record => record.payments || []);
    const notes = noteDraft("amc", item.id, state.data.billingNotes?.[item.id]).value;
    return `<div class="mb-contract">${metrics(activity, "Contract Value", item.contractValue)}
      <section class="mb-card mb-progress"><div><strong>Payment Progress</strong><b>${progressRows.length ? Math.round(done / progressRows.length * 100) : 0}%</b></div><div class="mb-progress-track"><span style="width:${progressRows.length ? done / progressRows.length * 100 : 0}%"></span></div><small>${done} of ${progressRows.length} payments completed</small></section>
      <div class="mb-contract-grid"><div class="mb-contract-main"><section class="mb-card"><div class="mb-section-head"><h2>${icon("calendar-days")} Payment Schedule & Invoice Requests</h2><div class="mb-head-buttons">${action("+ Request Invoice", "billing-open-request", nextRequest?.id || "", "mb-primary")}</div></div>${amcScheduleAndRequests(activity)}</section>
      <section class="mb-card"><div class="mb-section-head"><h2>${icon("file-text")} Payment Notes</h2></div><div class="mb-inline-notes"><button type="button" class="mb-note-display" data-action="billing-edit-inline-notes" data-id="${esc(item.id)}" aria-label="Edit payment notes"><span>${esc(notes || "Add payment notes...")}</span><small>Edit</small></button><textarea data-billing-inline-notes data-note-kind="amc" data-id="${esc(item.id)}" rows="3" maxlength="3000" aria-label="Payment Notes" placeholder="Add payment notes..." hidden>${esc(notes)}</textarea></div></section>
      ${extras.length ? `<section class="mb-card"><div class="mb-section-head"><h2>Additional Work Order Charges</h2></div>${paymentSchedule(extras)}</section>` : ""}</div>
      <aside class="mb-contract-side"><section class="mb-card"><div class="mb-section-head"><h2>${icon("bell")} Upcoming Actions</h2></div>
      ${nextRequest ? `<div class="mb-side-row"><span class="mb-side-icon">${icon("clock-3")}</span><span><strong>Request invoice for installment #${esc(nextRequest.installmentNumber)}</strong><small>Due ${date(nextRequest.dueDate)}</small></span>${action("Request", "billing-open-request", nextRequest.id)}</div>` : ""}
      ${pendingSend ? `<div class="mb-side-row"><span class="mb-side-icon">${icon("file-text")}</span><span><strong>Send invoice to customer</strong><small>${esc(pendingSend.invoice.number)} has not been sent</small></span>${action("Mark Sent", "billing-sent", pendingSend.id)}</div>` : ""}
      ${nextUnpaid ? `<div class="mb-side-row"><span class="mb-side-icon">${icon("calendar-days")}</span><span><strong>Next payment due</strong><small>${date(nextUnpaid.dueDate)} · Installment #${esc(nextUnpaid.installmentNumber)}</small></span>${action("View Details", "billing-focus-installment", nextUnpaid.id)}</div>` : ""}
      ${!nextRequest && !pendingSend && !nextUnpaid ? `<p class="mb-muted">No upcoming billing actions.</p>` : ""}</section>
      <section class="mb-card"><div class="mb-section-head"><h2>${icon("file-text")} Latest Invoice</h2>${latest ? action("View All", "billing-view-invoices", item.id, "mb-small-link") : ""}</div>${latest ? `<div class="mb-latest-preview"><div class="mb-invoice-thumb">${latest.invoice.fileId && /\.(png|jpe?g|webp)$/i.test(state.data.files?.find(file => file.id === latest.invoice.fileId)?.originalName || "") ? `<img src="${fileUrl(latest.invoice.fileId)}" alt="Invoice preview">` : `<span>${icon("file-text")}</span><i></i><i></i><i></i><i></i>`}</div><div class="mb-latest-details"><div class="mb-latest-title"><strong>${esc(latest.invoice.number)}</strong>${statusPill(latest)}</div>${kv("Invoice Date", date(latest.invoice.date))}${kv("Due Date", date(latest.invoice.dueDate || latest.dueDate))}${kv("Amount (incl. VAT)", money(latest.invoice.total))}${kv("Sent to Customer", date(latest.invoice.sentAt))}${latest.invoice.fileId ? `<a class="mb-small-link" href="${fileUrl(latest.invoice.fileId)}" target="_blank" rel="noopener">View PDF</a>` : ""}</div></div>` : `<p class="mb-muted">No invoice recorded yet.</p>`}</section>
      <section class="mb-card"><div class="mb-section-head"><h2>${icon("calendar-check")} Payment History</h2>${payments.length ? action(ui.showAllPayments ? "Show Less" : "View All", "billing-toggle-payments", item.id, "mb-small-link") : ""}</div>${compactPayments(activity)}</section></aside></div></div>`;
  }
  function fullAmc(item) {
    if (!item) return `<div class="mb-page"><div class="mb-empty">AMC contract not found. ${action("Back to AMC Register", "billing-go-amc", "")}</div></div>`;
    const visits = state.data.visits.filter(visit => visit.contractId === item.id).sort((a, b) => String(a.plannedDate).localeCompare(String(b.plannedDate)));
    const reports = state.data.reports.filter(report => report.contractId === item.id || job(report.workOrderId)?.contractId === item.id);
    const files = state.data.files.filter(file => file.contractId === item.id && file.kind === "contract");
    const contractBilling = rows().filter(record => record.contractId === item.id && record.sourceType === "AMC");
    const tabs = ["Overview", "Service Schedule", "Service Reports", "Billing & Payments", "Documents"];
    let body;
    if (ui.tab === "Billing & Payments") body = amcBilling(item);
    else if (ui.tab === "Service Schedule") body = `<section class="mb-card"><div class="mb-section-head"><h2>Service Schedule</h2>${action("+ Schedule Visit", "schedule-for-amc", item.id, "mb-outline")}</div>${table(["Visit", "Planned Date", "Status", "Work Order", "Action"], visits.map(visit => `<tr>${cell(esc(visit.sequence))}${cell(date(visit.plannedDate))}${cell(pill(visit.status))}${cell(esc(job(visit.workOrderId)?.number || "—"))}${cell(visit.workOrderId ? action("View Work Order", "open-job", visit.workOrderId) : action("Schedule", "amc-schedule-visit", visit.id))}</tr>`).join(""), "No visits planned.")}</section>`;
    else if (ui.tab === "Service Reports") body = `<section class="mb-card"><div class="mb-section-head"><h2>Service Reports</h2></div>${table(["Report No.", "Service Date", "Work Order", "Status", "Action"], reports.map(report => `<tr>${cell(esc(report.number))}${cell(date(report.extracted?.serviceDate || report.submittedAt))}${cell(esc(job(report.workOrderId)?.number || "—"))}${cell(pill(report.status))}${cell(action("View Report", "open-report", report.id))}</tr>`).join(""), "No service reports yet.")}</section>`;
    else if (ui.tab === "Documents") body = `<section class="mb-card"><div class="mb-section-head"><h2>Documents</h2></div><div class="mb-doc-list">${files.map(file => `<a href="${fileUrl(file.id)}" target="_blank" rel="noopener">${icon("paperclip")}${esc(file.originalName)}</a>`).join("") || `<p class="mb-muted">No contract documents uploaded.</p>`}</div><label class="mb-outline mb-file-label">Upload contract document<input type="file" data-contract-file="${esc(item.id)}" accept=".pdf,.png,.jpg,.jpeg,.webp" hidden></label></section>`;
    else body = `<div class="mb-overview-grid"><section class="mb-card"><h2>Contract Overview</h2><div class="mb-summary-grid">${kv("Customer", item.customerName)}${kv("Site / Location", item.site)}${kv("Contact Person", item.contact)}${kv("Phone", item.phone)}${kv("Email", item.email)}${kv("AMC Type", item.amcType)}${kv("Contract Start", date(item.startDate))}${kv("Contract End", date(item.endDate))}${kv("Frequency", item.frequency)}${kv("Visits per Year", item.visitsPerYear)}${kv("AC Units", item.unitCount)}${kv("Contract Value (excl. VAT)", money(item.contractValue))}</div><p class="mb-notes">${esc(item.notes || "No contract notes.")}</p></section><section class="mb-card"><h2>Service Activity</h2><div class="mb-summary-grid">${kv("Planned Visits", visits.length)}${kv("Completed Visits", visits.filter(visit => visit.status === "Completed").length)}${kv("Service Reports", reports.length)}${kv("Invoices", contractBilling.filter(record => record.invoice).length)}</div><h3>Recent Activity</h3>${state.data.activity.filter(entry => entry.targetId === item.id || state.data.workOrders.some(wo => wo.contractId === item.id && wo.id === entry.targetId)).slice(0, 12).map(entry => `<div class="mb-side-row"><span><strong>${esc(entry.message)}</strong><small>${esc(entry.actor)} · ${date(entry.createdAt)}</small></span></div>`).join("") || `<p class="mb-muted">No activity recorded.</p>`}</section></div>`;
    return `<div class="mb-page mb-amc-full"><div class="mb-crumb">${action("Maintenance", "billing-go-amc", "")} › ${action("AMC Register", "billing-go-amc", "")} › ${esc(item.number)}</div><header class="mb-page-head"><div><h1>${esc(item.number)} ${pill(contractStatus(item))}</h1><p>${esc(item.customerName)} · ${esc(item.site)} · ${date(item.startDate)} – ${date(item.endDate)}</p></div><div class="mb-amc-header-actions">${action("Edit AMC", "edit-amc", item.id, "mb-outline")}${files[0] ? `<a class="mb-outline" href="${fileUrl(files[0].id)}" target="_blank" rel="noopener">Download Contract</a>` : `<button class="mb-outline" disabled title="No contract document uploaded">Download Contract</button>`}<details class="mb-action-menu mb-header-menu"><summary aria-label="More AMC actions" title="More actions">•••</summary><div class="mb-action-menu-list">${action("View Documents", "billing-amc-documents", item.id)}${action("View Billing Activity", "billing-view-invoices", item.id)}</div></details></div></header><nav class="mb-tabs" aria-label="AMC sections">${tabs.map(tab => `<button data-action="billing-amc-tab" data-tab="${tab}" class="${ui.tab === tab ? "active" : ""}">${tab}</button>`).join("")}</nav><div class="mb-content">${body}</div></div>`;
  }
  function workOrder(item) {
    const parent = contract(item.contractId);
    if (parent) {
      const amcList = rows().filter(record => record.contractId === parent.id && record.sourceType === "AMC");
      const extras = rows().filter(record => record.workOrderId === item.id && record.sourceType === "Additional Charge");
      return `<div class="mb-work-order"><section class="mb-card"><div class="mb-section-head"><h2>AMC Contract Billing · ${esc(parent.number)}</h2>${action("View AMC Billing Details", "billing-open-amc", parent.id, "mb-outline")}</div><p class="mb-muted">This work order is covered by its AMC contract. Contract installments are shown once in AMC billing.</p>${metrics(amcList, "Contract Value", parent.contractValue)}${paymentSchedule(amcList, true)}</section><section class="mb-card"><div class="mb-section-head"><h2>Additional Charges Outside AMC Coverage</h2>${action("+ Additional Charge", "billing-open-extra", item.id, "mb-primary")}</div><p class="mb-muted">Only work or parts explicitly added here are billed separately.</p>${extras.length ? `${metrics(extras, "Extra Charges", extras.reduce((sum, record) => sum + Number(record.amountExVat), 0))}${paymentSchedule(extras, true)}` : `<div class="mb-empty">No additional charges recorded for this work order.</div>`}</section></div>`;
    }
    const record = rows().find(row => row.sourceType === "Work Order" && row.workOrderId === item.id);
    if (!record) return `<div class="mb-empty">Billing record unavailable. Refresh Maintenance.</div>`;
    const specials = rows().filter(row => row.sourceType === "Work Order Special" && row.workOrderId === item.id);
    const serviceAmount = Number(record.serviceAmountExVat ?? record.amountExVat ?? 0);
    const serviceVat = Number(record.serviceVatRate ?? record.vatRate ?? 5);
    const notes = noteDraft("work-order", record.id, record.notes).value;
    return `<div class="mb-work-order"><section class="mb-card"><div class="mb-section-head"><h2>Work Order Billing · ${esc(item.number)}</h2><div class="mb-head-buttons">${action(serviceAmount > 0 ? "Change Service Amount" : "Set Service Amount", "billing-open-amount", record.id, "mb-outline")}${!record.request && !record.invoice ? action("Request Invoice", "billing-open-request", record.id, "mb-primary") : ""}</div></div>${metrics([record, ...specials], "Service Amount", serviceAmount)}<div class="mb-summary-grid">${kv("Service Amount (excl. VAT)", money(serviceAmount))}${kv("VAT", `${esc(serviceVat)}%`)}${kv("Expected Total", money(serviceAmount * (1 + serviceVat / 100)))}${kv("Invoice Number", record.invoice?.number)}${kv("Invoice Date", date(record.invoice?.date))}${kv("Status", statusOf(record))}<div class="mb-inline-notes mb-work-order-notes"><label for="mbWorkOrderBillingNotes">Notes</label><button type="button" class="mb-note-display" data-action="billing-edit-inline-notes" data-id="${esc(record.id)}" aria-label="Edit billing notes"><span>${esc(notes || "Add billing notes...")}</span><small>Edit</small></button><textarea id="mbWorkOrderBillingNotes" data-billing-inline-notes data-note-kind="work-order" data-id="${esc(record.id)}" rows="3" maxlength="3000" placeholder="Add billing notes..." hidden>${esc(notes)}</textarea></div></div></section><section class="mb-card"><div class="mb-section-head"><h2>Invoice & Payment History</h2></div>${workOrderInvoiceHistory([record, ...specials])}</section></div>`;
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
      if (ui.source === "AMC" && !["AMC", "AMC Special"].includes(item.sourceType)) return false;
      if (ui.source === "Non-AMC" && !["Work Order", "Work Order Special"].includes(item.sourceType)) return false;
      if (ui.source === "Additional Charge" && item.sourceType !== "Additional Charge") return false;
      if (ui.status !== "all" && statusOf(item) !== ui.status) return false;
      if (ui.customer && item.customerName !== ui.customer) return false;
      const stamp = item.request?.requestedAt?.slice(0, 10) || item.invoice?.date || item.periodStart;
      if (ui.from && stamp < ui.from || ui.to && stamp > ui.to) return false;
      return !query || [item.reference, item.customerName, item.site, item.invoice?.number, item.description].join(" ").toLowerCase().includes(query);
    }).sort((a, b) => ui.sort === "customer" ? a.customerName.localeCompare(b.customerName) : ui.sort === "amount" ? Number(b.invoiceTotal || b.amountExVat) - Number(a.invoiceTotal || a.amountExVat)
      : String(b.request?.requestedAt || b.invoice?.recordedAt || b.periodStart).localeCompare(String(a.request?.requestedAt || a.invoice?.recordedAt || a.periodStart)));
    const pages = Math.max(1, Math.ceil(filtered.length / ui.size));
    ui.page = Math.min(ui.page, pages);
    const pageRows = filtered.slice((ui.page - 1) * ui.size, ui.page * ui.size);
    const kpis = [["Total Invoice Requests", counts.requests, "file-text", "blue"], ["Pending Accountant Action", counts.pending, "clock-3", "amber"],
      ["Invoiced", counts.invoiced, "file-check-2", "blue"], ["Partially Paid", counts.partial, "calendar-check", "violet"],
      ["Fully Paid", counts.paid, "circle-check", "green"], ["Overdue", counts.overdue, "clock-3", "red"]];
    const tableBody = pageRows.map(item => `<tr><td class="mb-reference-cell"><button class="mb-reference" data-action="billing-open-source" data-id="${esc(item.id)}">${esc(item.reference)}</button><span class="mb-reference-detail" title="${esc(referenceDetail(item))}">${esc(referenceDetail(item))}</span></td><td>${esc(item.customerName)}<small>${esc(item.site)}</small></td><td>${date(item.periodStart)}${item.periodEnd !== item.periodStart ? `<small>to ${date(item.periodEnd)}</small>` : ""}</td><td>${esc(item.request?.requestedBy || "—")}<small>${date(item.request?.requestDate || item.request?.requestedAt)}</small></td><td>${statusPill(item)}${item.invoice?.number ? `<small class="mb-invoice-number">Invoice ${esc(item.invoice.number)}</small>` : ""}</td><td>${money(item.invoice ? item.invoiceTotal : item.amountExVat * (1 + Number(item.vatRate || 0) / 100))}${item.invoice?.date ? `<small>Invoice date: ${date(item.invoice.date)}</small>` : ""}</td><td>${recordMenu(item)}</td></tr>`).join("");
    return `<div class="mb-page mb-main-page"><header class="mb-page-head"><div><h1>AMC Billing & Payments</h1><p>Manage invoice requests, invoice tracking and payment follow-up for maintenance.</p></div><div class="mb-header-actions"><label class="mb-search">${icon("search")}<input data-billing-search value="${esc(ui.search)}" placeholder="Search AMC, customer, invoice no..."></label>${action("Filter", "billing-toggle-filters", "", "mb-outline")}${action("Export", "billing-export", "", "mb-outline")}${action("+ Create Invoice Request", "billing-open-request", "", "mb-primary")}</div></header><div class="mb-content"><div class="mb-kpis">${kpis.map(([label, count, symbol, tone]) => `<div class="mb-kpi ${tone}"><span>${icon(symbol)}</span><div><small>${esc(label)}</small><strong>${count}</strong></div></div>`).join("")}</div>${ui.filtersOpen ? `<div class="mb-filter-panel"><label>Source<select data-billing-filter="source">${[["all", "All"], ["AMC", "AMC"], ["Non-AMC", "Non-AMC"], ["Additional Charge", "Additional Charge"]].map(([value, label]) => `<option value="${value}" ${ui.source === value ? "selected" : ""}>${label}</option>`).join("")}</select></label><label>Status<select data-billing-filter="status"><option value="all">All</option>${["Not Requested", "Draft", "Invoice Pending", "Prepared", "Sent to Customer", "Unpaid", "Partially Paid", "Overdue", "Paid"].map(value => `<option ${ui.status === value ? "selected" : ""}>${value}</option>`).join("")}</select></label><label>Customer<select data-billing-filter="customer"><option value="">All customers</option>${customers.map(value => `<option value="${esc(value)}" ${ui.customer === value ? "selected" : ""}>${esc(value)}</option>`).join("")}</select></label><label>From<input type="date" data-billing-filter="from" value="${esc(ui.from)}"></label><label>To<input type="date" data-billing-filter="to" value="${esc(ui.to)}"></label>${action("Clear", "billing-clear-filters", "", "mb-outline")}</div>` : ""}<div class="mb-main-layout"><section class="mb-card"><div class="mb-section-head"><div class="mb-segments">${[["all", "All Requests", all.length], ["pending", "Pending Request", counts.pending], ["invoiced", "Invoiced", counts.invoiced], ["unpaid", "Unpaid", all.filter(item => ["Unpaid", "Partially Paid", "Overdue"].includes(item.paymentStatus)).length], ["paid", "Paid", counts.paid]].map(([value, label, count]) => `<button class="${ui.quick === value || !ui.quick && value === "all" ? "active" : ""}" data-action="billing-quick" data-value="${value}">${label} <b>${count}</b></button>`).join("")}</div><label>Sort by <select data-billing-sort><option value="recent" ${ui.sort === "recent" ? "selected" : ""}>Most Recent</option><option value="customer" ${ui.sort === "customer" ? "selected" : ""}>Customer</option><option value="amount" ${ui.sort === "amount" ? "selected" : ""}>Amount</option></select></label></div>${table(["Reference", "Customer / Site", "Billing Period / Service Date", "Requested By / Date", "Status", "Amount (AED)", "Action"], tableBody, "No billing activity matches your filters.", "mb-billing-list-table")}<div class="mb-pagination"><span>Showing ${filtered.length ? (ui.page - 1) * ui.size + 1 : 0} to ${Math.min(ui.page * ui.size, filtered.length)} of ${filtered.length}</span><div><label>Rows per page <select data-billing-size><option value="10" ${ui.size === 10 ? "selected" : ""}>10</option><option value="20" ${ui.size === 20 ? "selected" : ""}>20</option></select></label>${action("‹", "billing-prev", "", "mb-outline")}<b>${ui.page} / ${pages}</b>${action("›", "billing-next", "", "mb-outline")}</div></div></section></div></div></div>`;
  }
  function open(type, id = "") {
    if (type === "request" && !id && state.page === "amc" && state.recordId)
      id = rows().find(item => item.contractId === state.recordId && item.sourceType === "AMC" && (!item.request || item.request.status === "draft") && !item.invoice)?.id || "";
    const record = row(id);
    if (type === "edit-invoice" && (!record?.invoice || record.paymentStatus === "Paid")) {
      notice("Only invoices that are not fully paid can be edited."); return;
    }
    state.drawer = `billing-${type}`;
    state.drawerId = id;
    ui.requestSaving = false;
    const sourceKey = ["AMC", "AMC Special"].includes(record?.sourceType) ? `amc:${record.contractId}` : record?.workOrderId ? `wo:${record.workOrderId}` : type === "request" && state.page === "amc" && state.recordId ? `amc:${state.recordId}` : "";
    const sourceReference = sourceKey.startsWith("amc:") ? contract(sourceKey.slice(4))?.number : "";
    state.billingDraft = { recordId: id, fileId: "", receiptFileId: "", number: "", date: today(), dueDate: record?.dueDate || "", sourceReference: "", confirmMismatch: false, ocrWarnings: [],
      sourceKey, sourceQuery: record?.reference || sourceReference || "", billingChoice: record ? record.billingType ? `special:${record.billingType}` : `record:${record.id}` : "",
      clientKey: record?.id?.startsWith("special:") ? record.id.slice(8) : newRequestKey(),
      requestDate: record?.request?.requestDate || today(), periodStart: record?.periodStart || "", periodEnd: record?.periodEnd || "",
      remarks: record?.request?.remarks || "", sendToAccountant: type !== "edit-request",
      customerName: record?.customerName || "", amountExVat: record?.amountExVat || 0,
      vatRate: record?.vatRate ?? 5,
      vatAmount: Number((Number(record?.amountExVat || 0) * Number(record?.vatRate ?? 5) / 100).toFixed(2)),
      total: Number((Number(record?.amountExVat || 0) * (1 + Number(record?.vatRate ?? 5) / 100)).toFixed(2)),
      amount: record?.outstanding || 0, credits: record?.credits || 0, method: "Bank Transfer", reference: "", notes: record?.notes || "" };
    if (type === "amount") Object.assign(state.billingDraft, {
      amountExVat: record?.serviceAmountExVat ?? record?.amountExVat ?? 0,
      vatRate: record?.serviceVatRate ?? record?.vatRate ?? 5
    });
    if (type === "edit-invoice") Object.assign(state.billingDraft, {
      fileId: record.invoice.fileId || "", originalFileId: record.invoice.fileId || "",
      fileName: state.data.files?.find(file => file.id === record.invoice.fileId)?.originalName || "",
      number: record.invoice.number, date: record.invoice.date, dueDate: record.invoice.dueDate || "",
      customerName: record.invoice.customerName || record.customerName,
      sourceReference: record.invoice.sourceReference || "", amountExVat: record.invoice.amountExVat,
      vatAmount: record.invoice.vatAmount, total: record.invoice.total,
      confirmMismatch: !!record.invoice.mismatchConfirmed
    });
    render();
  }
  function requestSources() {
    const choices = new Map();
    for (const item of state.data?.contracts || []) {
      choices.set(`amc:${item.id}`, { key: `amc:${item.id}`, reference: item.number, customerName: item.customerName, site: item.site, type: "AMC" });
    }
    for (const item of state.data?.workOrders || []) {
      if (item.contractId) continue;
      choices.set(`wo:${item.id}`, { key: `wo:${item.id}`, reference: item.number, customerName: item.customerName, site: item.site, type: "Work Order" });
    }
    for (const record of rows()) {
      if (!["AMC", "AMC Special", "Work Order", "Work Order Special", "Additional Charge"].includes(record.sourceType)) continue;
      const key = ["AMC", "AMC Special"].includes(record.sourceType) ? `amc:${record.contractId}` : `wo:${record.workOrderId}`;
      if (!choices.has(key)) choices.set(key, { key, reference: record.reference, customerName: record.customerName, site: record.site, type: record.sourceType });
    }
    return [...choices.values()].sort((a, b) => a.reference.localeCompare(b.reference));
  }
  function requestRecords(sourceKey) {
    const existing = rows().filter(record => sourceKey === (["AMC", "AMC Special"].includes(record.sourceType) ? `amc:${record.contractId}` : record.workOrderId ? `wo:${record.workOrderId}` : ""));
    if (!sourceKey || existing.some(record => record.sourceType === (sourceKey.startsWith("amc:") ? "AMC" : "Work Order"))) return existing;
    if (sourceKey.startsWith("wo:")) {
      const workOrder = state.data?.workOrders?.find(item => item.id === sourceKey.slice(3) && !item.contractId);
      return workOrder ? [{ id: `wo:${workOrder.id}`, sourceType: "Work Order", workOrderId: workOrder.id,
        reference: workOrder.number, periodStart: workOrder.serviceDate, periodEnd: workOrder.serviceDate,
        dueDate: workOrder.serviceDate, amountExVat: 0, vatRate: 5, unavailable: true }, ...existing] : existing;
    }
    const agreement = state.data?.contracts?.find(item => item.id === sourceKey.slice(4));
    if (!agreement) return existing;
    const iso = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) ? value : String(value || "").replace(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/, (_, d, m, y) => `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`);
    const start = iso(agreement.startDate), end = iso(agreement.endDate);
    const first = Date.parse(`${start}T12:00:00Z`), last = Date.parse(`${end}T12:00:00Z`);
    if (!Number.isFinite(first) || !Number.isFinite(last) || last < first) return existing;
    const days = Math.round((last - first) / 86400000) + 1;
    const count = Math.min(120, Math.max(1, Math.round(days / 365 * Number(agreement.visitsPerYear || 1))));
    const addDays = n => new Date(first + n * 86400000).toISOString().slice(0, 10);
    const totalCents = Math.round(Number(agreement.contractValue || 0) * 100), share = Math.floor(totalCents / count);
    return [...Array.from({ length: count }, (_, i) => ({ id: `amc:${agreement.id}:${i + 1}`, sourceType: "AMC", contractId: agreement.id,
      installmentNumber: i + 1, reference: agreement.number, periodStart: addDays(Math.floor(days * i / count)),
      periodEnd: i === count - 1 ? end : addDays(Math.floor(days * (i + 1) / count) - 1),
      amountExVat: (i === count - 1 ? totalCents - share * (count - 1) : share) / 100, vatRate: 5, unavailable: true }))
      .filter(item => !(state.data?.billingDeletedIds || []).includes(item.id)), ...existing];
  }
  function requestDrawer(draft, record, editing = false) {
    const sources = requestSources();
    const source = sources.find(choice => choice.key === draft.sourceKey);
    const selectable = requestRecords(draft.sourceKey);
    const isAmc = draft.sourceKey?.startsWith("amc:");
    const baseRecords = selectable.filter(item => item.sourceType === (isAmc ? "AMC" : "Work Order"));
    const regularOptions = baseRecords.map(item => `<option value="record:${esc(item.id)}" ${draft.billingChoice === `record:${item.id}` ? "selected" : ""} ${item.invoice || item.request && item.request.status !== "draft" ? "disabled" : ""}>${esc(isAmc ? `Installment #${item.installmentNumber} — ${periodDate(item.periodStart)} to ${periodDate(item.periodEnd)}` : "Full Service Charge")}${item.request?.status === "draft" ? " · Draft" : item.request || item.invoice ? " · Already requested" : ""}</option>`).join("");
    const specialOptions = (isAmc ? amcChoices : workOrderChoices).map(([key, label]) => `<option value="special:${key}" ${draft.billingChoice === `special:${key}` ? "selected" : ""}>${esc(label)}</option>`).join("");
    const periodOptions = source ? `${regularOptions ? `<optgroup label="${isAmc ? "Scheduled AMC installments" : "Non-AMC work order"}">${regularOptions}</optgroup>` : ""}<optgroup label="${isAmc ? "Other AMC billing" : "Other work order billing"}">${specialOptions}</optgroup>` : "";
    const agreement = isAmc ? contract(draft.sourceKey.slice(4)) : null;
    const committed = isAmc ? selectable.filter(item => item.id !== record?.id && (item.request || item.invoice))
      .reduce((sum, item) => sum + Number(item.amountExVat || 0), 0) : 0;
    const available = agreement ? Math.max(0, Number((Number(agreement.contractValue || 0) - committed).toFixed(2))) : 0;
    const total = Number(draft.amountExVat || 0) * (1 + Number(draft.vatRate ?? record?.vatRate ?? 5) / 100);
    const steps = ["Draft", "Sent to Accountant", "Invoice Received", "Sent to Customer", "Payment Updated"];
    const stage = record?.payments?.length ? 5 : record?.invoice?.sentAt ? 4 : record?.invoice ? 3 : record?.request && record.request.status !== "draft" ? 2 : 1;
    const choices = sources.map(choice => `<button type="button" role="option" data-action="billing-choose-source" data-id="${esc(choice.key)}" data-search-value="${esc(`${choice.reference} ${choice.customerName} ${choice.site}`.toLowerCase())}"><strong>${esc(choice.reference)}</strong><small>${esc(choice.type === "AMC" ? "AMC" : "Work Order")} · ${esc(choice.customerName)} / ${esc(choice.site)}</small></button>`).join("");
    const body = `<form id="maintBillingForm" class="maint-form mb-form mb-request-form"><section class="mb-request-section"><h3>Contract & Customer</h3><div class="mb-request-grid"><div class="maint-field mb-source-picker"><span>AMC or Work Order *</span>${editing ? `<input value="${esc(source?.reference || record?.reference || "")}" readonly>` : `<div class="mb-source-combo"><input type="text" data-billing-source-search role="combobox" aria-autocomplete="list" aria-controls="mbRequestSources" aria-expanded="false" value="${esc(draft.sourceQuery || source?.reference || "")}" placeholder="Search AMC or work order..." autocomplete="off"><div id="mbRequestSources" class="mb-source-options" role="listbox">${choices || `<p>No AMC contracts or work orders available.</p>`}</div></div>`}</div><label class="maint-field"><span>Customer / Site</span><input value="${esc(source ? `${source.customerName} / ${source.site}` : record ? `${record.customerName} / ${record.site}` : "")}" readonly placeholder="Select a record"></label></div></section>
      <section class="mb-request-section"><h3>Billing Details</h3><div class="mb-request-grid"><label class="maint-field"><span>Billing Period / Installment *</span>${editing ? `<input value="${esc(record?.installmentNumber ? `Installment #${record.installmentNumber} — ${periodDate(record.periodStart)} to ${periodDate(record.periodEnd)}` : billingLabel(record))}" readonly>` : `<select name="billingChoice" data-billing-installment required><option value="">Select installment or charge</option>${periodOptions}</select>`}</label><label class="maint-field"><span>Request Date *</span><input name="requestDate" type="date" value="${esc(draft.requestDate || today())}" required></label></div>${draft.billingChoice === "special:custom_installment" ? `<div class="mb-request-grid"><label class="maint-field"><span>Custom Period Start *</span><input name="periodStart" type="date" value="${esc(draft.periodStart || "")}" ${editing ? "readonly" : "required"}></label><label class="maint-field"><span>Custom Period End *</span><input name="periodEnd" type="date" value="${esc(draft.periodEnd || "")}" ${editing ? "readonly" : "required"}></label></div>` : ""}<label class="maint-field"><span>Requested By *</span><input value="${esc(editing ? record?.request?.requestedBy || state.data.viewerName || "Current user" : state.data.viewerName || "Current user")}" readonly></label><div class="mb-request-amounts"><label class="maint-field"><span>Amount (AED) excl. VAT *</span><input name="amountExVat" type="number" step="0.01" min="0" value="${esc(draft.amountExVat ?? record?.amountExVat ?? 0)}" ${draft.billingChoice === "special:full_contract" ? "readonly" : ""} ${agreement ? `max="${available}"` : ""} required></label><label class="maint-field"><span>VAT % *</span><input name="vatRate" type="number" step="0.01" min="0" max="100" value="${esc(draft.vatRate ?? record?.vatRate ?? 5)}" required></label><label class="maint-field"><span>Amount (AED) incl. VAT</span><input data-billing-total value="${esc(amount(total))}" readonly></label></div><div class="mb-request-grid"><div class="maint-field"><span>Status</span><div class="mb-request-readonly">${statusPill(record?.request ? record : { invoiceStatus: "Draft" })}</div></div></div></section>
      ${agreement && draft.billingChoice !== "special:full_contract" ? `<p class="mb-form-hint">Available to request from this AMC: ${money(available)} excl. VAT. You can enter any amount up to this balance.</p>` : ""}
      ${source && !rows().length ? `<p class="mb-form-hint">Scheduled periods are shown from the contract. Saving requires current billing data. ${action("Refresh billing data", "billing-refresh-data", "", "mb-small-link")}</p>` : ""}
      <label class="mb-request-send"><input name="sendToAccountant" type="checkbox" ${draft.sendToAccountant !== false ? "checked" : ""}><span><strong>Send to Accountant</strong><small>${editing ? "Send this updated request to accounts again." : "Create a billing handoff for the accounts team. This records an internal handoff."}</small></span></label>
      <label class="maint-field mb-request-notes"><span>Notes</span><textarea name="remarks" maxlength="500" rows="3" placeholder="Add any additional notes, instructions or reference information...">${esc(draft.remarks || "")}</textarea><small data-billing-note-count>${String(draft.remarks || "").length}/500</small></label>
      <section class="mb-request-summary"><h3>${icon("file-text")} Request Summary</h3><p>Current stage in the invoice request workflow.</p><div class="mb-request-steps">${steps.map((label, index) => `<div class="${index + 1 === stage ? "current" : index + 1 < stage ? "complete" : ""}"><span>${index + 1}</span><strong>${label}</strong></div>`).join("")}</div></section></form>`;
    const title = editing ? "Edit Invoice Request" : "Create Invoice Request";
    const primaryLabel = draft.sendToAccountant !== false ? "Send to Accountant" : "Save Request";
    return `<div class="maint-overlay" data-action="close-drawer"><section class="maint-drawer mb-request-drawer" role="dialog" aria-modal="true" aria-label="${title}"><header><div><h2>${title}</h2><p>${editing ? "Update the request or send it to accounts again." : "Create a billing handoff for accounts and invoice follow-up."}</p></div><button class="mb-request-close" data-action="close-drawer" aria-label="Close drawer">×</button></header><div class="maint-drawer-scroll">${body}</div><footer><button class="maint-outline" data-action="close-drawer">Cancel</button>${editing ? "" : `<button class="maint-outline" data-action="billing-save-draft">Save Draft</button>`}<button class="maint-primary" data-action="billing-primary-request">${icon(draft.sendToAccountant !== false ? "send" : "save")} ${primaryLabel}</button></footer></section></div>`;
  }
  function drawer() {
    const type = String(state.drawer || "").replace(/^billing-/, "");
    if (!state.drawer?.startsWith("billing-")) return "";
    const draft = state.billingDraft || {};
    const record = row(draft.recordId);
    if (type === "request" || type === "edit-request") {
      if (type === "edit-request" && (!record?.request || record.invoice)) return "";
      return requestDrawer(draft, record, type === "edit-request");
    }
    const amcContextId = state.page === "amc" && state.recordId && ["request", "invoice"].includes(type) ? state.recordId : "";
    const available = rows().filter(item => (!amcContextId || item.contractId === amcContextId && item.sourceType === "AMC") && !item.invoice && (type !== "request" || !item.request && Number(item.amountExVat) > 0));
    const selector = ["request", "invoice"].includes(type) ? `<label class="maint-field"><span>Billing record *</span><select name="recordId" data-billing-record><option value="">Select AMC installment or work order</option>${available.map(item => `<option value="${esc(item.id)}" ${draft.recordId === item.id ? "selected" : ""}>${esc(item.reference)}${item.installmentNumber ? ` · Installment ${item.installmentNumber}` : item.description ? ` · ${esc(item.description)}` : ""} · ${money(item.amountExVat)}</option>`).join("")}${record && !available.some(item => item.id === record.id) ? `<option value="${esc(record.id)}" selected>${esc(record.reference)}</option>` : ""}</select></label>` : "";
    const invoiceSource = record ? `<p class="mb-form-hint">Invoice for <strong>${esc(record.reference)}${record.installmentNumber ? ` · Installment #${record.installmentNumber}` : record.billingType ? ` · ${esc(billingLabel(record))}` : ""}</strong> · ${esc(record.customerName)} / ${esc(record.site)}</p>` : selector;
    const currentFile = type === "edit-invoice" && record.invoice.fileId
      ? `<div class="mb-form-hint mb-current-invoice-file"><span>Current file: <a href="${fileUrl(record.invoice.fileId)}" target="_blank" rel="noopener">View invoice</a>. Choose a new file to replace it.</span><button type="button" class="mb-current-invoice-delete" data-action="billing-delete-invoice-file" data-id="${esc(record.id)}" aria-label="Delete uploaded invoice file" title="Delete uploaded invoice file">Delete</button></div>`
      : "";
    let body = "";
    if (type === "request") body = `${selector}<p class="mb-form-hint">Customer: ${esc(record?.customerName || "Select a record")} · Site: ${esc(record?.site || "—")} · Amount: ${money(record?.amountExVat)}</p><label class="maint-field"><span>Invoice remarks</span><textarea name="remarks" rows="4">${esc(draft.remarks || "")}</textarea></label>`;
    if (["invoice", "edit-invoice"].includes(type)) body = `${invoiceSource}<p class="mb-form-hint">Upload a PDF or image to fill the fields automatically, then correct any field if needed. You can also enter the details and save without a file. Payment is confirmed separately.</p><label class="maint-field"><span>Invoice file (PDF, JPG, PNG) · Optional</span><input type="file" data-billing-file="invoice" accept=".pdf,.jpg,.jpeg,.png"></label>${currentFile}${draft.fileName && draft.fileId !== draft.originalFileId ? `<p class="mb-file-ok">${esc(draft.fileName)} uploaded · Verify the extracted values below.</p>` : ""}${draft.ocrWarnings?.length ? `<div class="mb-ocr-warnings">${draft.ocrWarnings.map(warning => `<p>${esc(warning)}</p>`).join("")}</div>` : ""}<div class="maint-form-grid">${formField("Invoice Number", "number", draft.number, "text", true)}${formField("Invoice Date", "date", draft.date, "date", true)}${formField("Customer Name", "customerName", draft.customerName, "text", true)}${formField("Reference on Invoice (AMC / Work Order)", "sourceReference", draft.sourceReference, "text")}${formField("Payment Due Date", "dueDate", draft.dueDate, "date")}${formField("Amount Before VAT", "amountExVat", draft.amountExVat, "number", true, 'step="0.01" min="0"')}${formField("VAT Amount", "vatAmount", draft.vatAmount, "number", true, 'step="0.01" min="0"')}${formField("Total Invoice Amount", "total", draft.total, "number", true, 'step="0.01" min="0.01"')}</div><label class="maint-check"><input type="checkbox" name="confirmMismatch" ${draft.confirmMismatch ? "checked" : ""}> I verified any difference in customer, reference or amount against the accounting invoice.</label>`;
    if (type === "amount") body = `<p class="mb-form-hint">${esc(record?.reference || "Work Order")} · ${esc(record?.customerName || "")}</p><div class="maint-form-grid">${formField("Service / Work Order Amount (AED)", "amountExVat", draft.amountExVat, "number", true, 'step="0.01" min="0"')}${formField("VAT (%)", "vatRate", draft.vatRate, "number", true, 'step="0.01" min="0" max="100"')}</div>`;
    if (type === "extra") body = `<p class="mb-form-hint">Work Order ${esc(job(state.drawerId)?.number || "")} · Charge only work or parts outside AMC coverage.</p>${formField("Description of Additional Work / Parts", "description", "", "text", true)}${formField("Amount Excluding VAT (AED)", "amountExVat", "", "number", true, 'step="0.01" min="0.01"')}`;
    const title = type === "amount" && Number(record?.serviceAmountExVat ?? record?.amountExVat) > 0 ? "Change Service Amount"
      : ({ request: "Request Invoice", invoice: "Upload Invoice", "edit-invoice": "Edit Invoice", amount: "Set Service Amount", extra: "Additional Work Order Charge" })[type] || "Billing";
    return drawerShell(title, `<form id="maintBillingForm" class="maint-form mb-form">${body}</form>`, `<button class="maint-outline" data-action="close-drawer">Cancel</button><button class="maint-primary" data-action="billing-submit">${icon("save")} ${type === "invoice" ? "Save Invoice" : `Save ${type === "request" ? "Request" : "Changes"}`}</button>`);
  }
  function remember() {
    const form = root.querySelector("#maintBillingForm");
    if (!form) return;
    const data = new FormData(form);
    for (const [key, value] of data) if (typeof value === "string") state.billingDraft[key] = value;
    if (["billing-invoice", "billing-edit-invoice"].includes(state.drawer)) state.billingDraft.confirmMismatch = !!form.elements?.namedItem("confirmMismatch")?.checked;
  }
  async function submit(requestMode = "send", primaryRequest = false) {
    const form = root.querySelector("#maintBillingForm");
    if (!form?.reportValidity()) return;
    remember();
    const draft = state.billingDraft, type = state.drawer.replace("billing-", "");
    let id = draft.recordId;
    if (["invoice", "edit-invoice"].includes(type) && !id) return notice("Choose a billing record first.");
    if (type === "edit-request") {
      if (ui.requestSaving) return;
      const record = row(id);
      if (!record?.request || record.invoice) return notice("This invoice request can no longer be edited.");
      if ((record.request.status !== "draft" || requestMode === "send") && Number(draft.amountExVat) <= 0) return notice("Enter an amount greater than zero.");
    }
    if (type === "request") {
      if (ui.requestSaving) return;
      if (!draft.sourceKey || !draft.billingChoice) return notice("Choose an AMC or work order and its billing period.");
      const isSpecial = draft.billingChoice.startsWith("special:");
      if (!isSpecial) {
        id = draft.billingChoice.slice(7);
        if (!row(id)) return notice("Billing periods are not ready. Refresh billing data before saving.");
        if (!requestRecords(draft.sourceKey).some(item => item.id === id)) return notice("Choose a billing period for the selected record.");
      }
      const selected = id ? row(id) : null;
      if (selected && ((selected.request && selected.request.status !== "draft") || selected.invoice))
        return notice("An invoice request already exists for this installment or charge.");
      if (requestMode === "send" && !form.elements.namedItem("sendToAccountant")?.checked)
        return notice("Select Send to Accountant before submitting, or save a draft.");
      if (requestMode === "send" && Number(draft.amountExVat) <= 0) return notice("Enter an amount greater than zero before sending.");
    }
    const target = `/api/maintenance/billing/${encodeURIComponent(id)}`;
    const options = { method: "POST", body: "{}" };
    let url = target;
    if (type === "request") {
      if (draft.billingChoice.startsWith("special:")) url = "/api/maintenance/billing/special/request";
      else url += "/request";
      options.body = JSON.stringify({ mode: requestMode, requestDate: draft.requestDate,
        amountExVat: Number(draft.amountExVat), vatRate: Number(draft.vatRate), remarks: draft.remarks,
        sourceType: draft.sourceKey.startsWith("amc:") ? "AMC" : "Work Order",
        sourceId: draft.sourceKey.slice(draft.sourceKey.indexOf(":") + 1), periodStart: draft.periodStart, periodEnd: draft.periodEnd,
        billingType: draft.billingChoice.startsWith("special:") ? draft.billingChoice.slice(8) : "",
        clientKey: draft.clientKey });
    }
    if (type === "edit-request") {
      url += "/request"; options.method = "PUT";
      options.body = JSON.stringify({ requestDate: draft.requestDate, amountExVat: Number(draft.amountExVat),
        vatRate: Number(draft.vatRate), remarks: draft.remarks, resend: requestMode === "send" });
    }
    if (["invoice", "edit-invoice"].includes(type)) {
      url += "/invoice"; options.method = type === "edit-invoice" ? "PUT" : "POST";
      options.body = JSON.stringify({ number: draft.number, date: draft.date, dueDate: draft.dueDate, sourceReference: draft.sourceReference,
        customerName: draft.customerName, amountExVat: Number(draft.amountExVat), vatAmount: Number(draft.vatAmount),
        total: Number(draft.total), fileId: draft.fileId, confirmMismatch: !!form.elements.namedItem("confirmMismatch")?.checked });
    }
    if (type === "amount") { url = target; options.method = "PUT"; options.body = JSON.stringify({ serviceAmountExVat: Number(draft.amountExVat), serviceVatRate: Number(draft.vatRate) }); }
    if (type === "extra") { url = "/api/maintenance/billing/extra"; options.body = JSON.stringify({ workOrderId: state.drawerId, description: draft.description, amountExVat: Number(draft.amountExVat) }); }
    const saveButton = root.querySelector(type === "request" || type === "edit-request" ? requestMode === "draft" && type === "request" && !primaryRequest ? '[data-action="billing-save-draft"]' : '[data-action="billing-primary-request"]' : '[data-action="billing-submit"]');
    if (type === "request" || type === "edit-request") ui.requestSaving = true;
    if (saveButton) { saveButton.disabled = true; saveButton.textContent = "Saving..."; }
    try { await request(url, options); state.drawer = ""; await refresh(); notice(type === "edit-request" ? requestMode === "send" ? "Invoice request sent again to accounts" : "Invoice request saved" : type === "request" ? requestMode === "draft" ? "Invoice request saved" : "Invoice request sent to accounts internally" : type === "invoice" ? "Invoice recorded" : type === "edit-invoice" ? "Invoice updated" : "Billing updated"); }
    catch (error) { notice(error.message || "Unable to save billing details"); if (saveButton?.isConnected) { saveButton.disabled = false; saveButton.textContent = type === "request" || type === "edit-request" ? requestMode === "send" ? "Send to Accountant" : type === "request" && !primaryRequest ? "Save Draft" : "Save Request" : "Save Changes"; } }
    finally { ui.requestSaving = false; }
  }
  async function handleAction(button) {
    const name = button.dataset.action, id = button.dataset.id || "";
    if (!name.startsWith("billing-")) return false;
    if (name === "billing-go-amc") navigate("amc");
    else if (name === "billing-refresh-data") {
      try { await refresh(); if (!rows().length) notice("Billing periods are still unavailable. Please contact your administrator."); }
      catch (error) { notice(error.message || "Unable to refresh billing data"); }
    }
    else if (name === "billing-choose-source") {
      remember();
      const source = requestSources().find(choice => choice.key === id);
      if (!source) return true;
      Object.assign(state.billingDraft, { sourceKey: id, sourceQuery: source.reference, recordId: "", billingChoice: "",
        clientKey: newRequestKey(), amountExVat: 0, vatRate: 5, remarks: "", requestDate: today(), periodStart: "", periodEnd: "" });
      render();
    }
    else if (name === "billing-open-amc") { ui.tab = "Billing & Payments"; navigate("amc", id); }
    else if (name === "billing-amc-documents") { ui.tab = "Documents"; render(); }
    else if (name === "billing-view-invoices") { ui.search = contract(id)?.number || ""; navigate("billing"); }
    else if (name === "billing-toggle-payments") { ui.showAllPayments = !ui.showAllPayments; render(); }
    else if (name === "billing-focus-installment") { root.querySelector(`[data-installment-id="${CSS.escape(id)}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" }); }
    else if (name === "billing-amc-tab") { ui.tab = button.dataset.tab; render(); }
    else if (name === "billing-open-source") { const item = row(id); if (item) { ui.tab = "Overview"; const isAmc = ["AMC", "AMC Special"].includes(item.sourceType); navigate(isAmc ? "amc" : "work-orders", isAmc ? item.contractId : item.workOrderId); } }
    else if (name === "billing-open-request") open("request", id);
    else if (name === "billing-edit-request") open("edit-request", id);
    else if (name === "billing-delete-installment") {
      const record = row(id);
      if (!record || !admin()) return true;
      if (!window.confirm(`Delete installment #${record.installmentNumber} from this AMC payment schedule?`)) return true;
      try { await request(`/api/maintenance/billing/${encodeURIComponent(id)}`, { method: "DELETE" }); await refresh(); notice("Payment schedule row deleted"); }
      catch (error) { notice(error.message || "Unable to delete the payment schedule row"); }
    }
    else if (name === "billing-delete-request") {
      const record = row(id);
      if ((!record?.request && !record?.invoice) || record.paymentStatus === "Paid" || !admin()) return true;
      const details = record.invoice ? " This also deletes the invoice, uploaded file and any recorded payments." : "";
      if (!window.confirm(`Delete the invoice request for ${record.reference}?${details}`)) return true;
      try { await request(`/api/maintenance/billing/${encodeURIComponent(id)}/request`, { method: "DELETE" }); await refresh(); notice("Invoice request deleted"); }
      catch (error) { notice(error.message || "Unable to delete the invoice request"); }
    }
    else if (name === "billing-save-draft") await submit("draft");
    else if (name === "billing-primary-request") await submit(root.querySelector('#maintBillingForm [name="sendToAccountant"]')?.checked ? "send" : "draft", true);
    else if (name === "billing-send-request") await submit("send");
    else if (name === "billing-open-invoice") open("invoice", id);
    else if (name === "billing-edit-invoice") open("edit-invoice", id);
    else if (name === "billing-delete-invoice-file") {
      if (state.drawer !== "billing-edit-invoice" || state.drawerId !== id) return true;
      remember();
      const fileId = row(id)?.invoice?.fileId;
      if (!fileId) return true;
      button.disabled = true;
      try {
        await request(`/api/maintenance/billing/${encodeURIComponent(id)}/invoice-file`, { method: "DELETE" });
        if (state.billingDraft.fileId === fileId) state.billingDraft.fileId = "";
        state.billingDraft.originalFileId = "";
        await refresh();
        notice("Invoice file deleted. The invoice details are saved.");
      } catch (error) {
        button.disabled = false;
        notice(error.message || "Unable to delete invoice file");
      }
    }
    else if (name === "billing-mark-paid" || name === "billing-mark-unpaid") {
      try { await request(`/api/maintenance/billing/${encodeURIComponent(id)}/${name === "billing-mark-paid" ? "mark-paid" : "mark-unpaid"}`, { method: "POST", body: "{}" }); await refresh(); notice(name === "billing-mark-paid" ? "Invoice marked paid" : "Invoice marked unpaid"); }
      catch (error) { notice(error.message || "Unable to change payment status"); }
    }
    else if (name === "billing-open-amount") open("amount", id);
    else if (name === "billing-edit-inline-notes") {
      const input = button.closest(".mb-inline-notes")?.querySelector("[data-billing-inline-notes]");
      if (input) { button.hidden = true; input.hidden = false; input.focus(); }
    }
    else if (name === "billing-open-extra") open("extra", id);
    else if (name === "billing-submit") await submit();
    else if (name === "billing-toggle-filters") { ui.filtersOpen = !ui.filtersOpen; render(); }
    else if (name === "billing-clear-filters") { Object.assign(ui, { source: "all", status: "all", customer: "", from: "", to: "", page: 1 }); render(); }
    else if (name === "billing-prev" || name === "billing-next") { ui.page = Math.max(1, ui.page + (name === "billing-next" ? 1 : -1)); render(); }
    else if (name === "billing-quick") { ui.quick = button.dataset.value; ui.page = 1; render(); }
    else if (name === "billing-export") {
      const header = ["Reference", "Source", "Customer", "Site", "Billing Period", "Requested By", "Status", "Amount (AED)"];
      const values = rows().filter(item => item.request || item.invoice).map(item => [item.reference, item.sourceType, item.customerName, item.site, item.periodStart, item.request?.requestedBy || "", statusOf(item), item.invoice ? item.invoiceTotal : Number((item.amountExVat * (1 + Number(item.vatRate || 0) / 100)).toFixed(2))]);
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
    if (input.matches('[name="sendToAccountant"]')) {
      state.billingDraft.sendToAccountant = input.checked;
      const primary = root.querySelector('[data-action="billing-primary-request"]');
      if (primary) primary.innerHTML = `${icon(input.checked ? "send" : "save")} ${input.checked ? "Send to Accountant" : "Save Request"}`;
      return true;
    }
    if (input.matches("[data-billing-installment]")) {
      remember();
      const choice = input.value, id = choice.startsWith("record:") ? choice.slice(7) : "";
      const type = choice.startsWith("special:") ? choice.slice(8) : "";
      const matchingDraft = type ? requestRecords(state.billingDraft.sourceKey).find(item => item.billingType === type && item.request?.status === "draft" && !item.invoice) : null;
      const selected = id ? requestRecords(state.billingDraft.sourceKey).find(item => item.id === id) : matchingDraft;
      const full = type === "full_contract" ? contract(state.billingDraft.sourceKey.slice(4)) : null;
      Object.assign(state.billingDraft, { billingChoice: choice, recordId: selected?.unavailable ? "" : selected?.id || "",
        clientKey: matchingDraft?.id?.startsWith("special:") ? matchingDraft.id.slice(8) : newRequestKey(),
        amountExVat: selected?.amountExVat ?? full?.contractValue ?? 0,
        vatRate: selected?.vatRate ?? 5, remarks: selected?.request?.remarks || "",
        periodStart: selected?.periodStart || "", periodEnd: selected?.periodEnd || "",
        requestDate: selected?.request?.requestDate || today() });
      render(); return true;
    }
    if (input.matches("[data-billing-filter]")) { ui[input.dataset.billingFilter] = input.value; ui.page = 1; render(); return true; }
    if (input.matches("[data-billing-sort]")) { ui.sort = input.value; render(); return true; }
    if (input.matches("[data-billing-size]")) { ui.size = Number(input.value); ui.page = 1; render(); return true; }
    if (input.matches("[data-billing-record]")) {
      cleanupDraft(); remember(); const selected = row(input.value); state.billingDraft.recordId = input.value;
      state.billingDraft.fileId = ""; state.billingDraft.receiptFileId = ""; state.billingDraft.fileName = ""; state.billingDraft.sourceReference = ""; state.billingDraft.confirmMismatch = false; state.billingDraft.ocrWarnings = [];
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
      if (kind === "invoice") state.billingDraft.confirmMismatch = true;
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
    if (input.matches("[data-billing-inline-notes]")) {
      const kind = input.dataset.noteKind, id = input.dataset.id;
      if (kind === "amc" ? !contract(id) : row(id)?.sourceType !== "Work Order") return true;
      const draft = noteDraft(kind, id, kind === "amc" ? state.data.billingNotes?.[id] : row(id)?.notes);
      draft.value = input.value;
      clearTimeout(draft.timer);
      draft.timer = setTimeout(() => saveBillingNotes(kind, id), 650);
      return true;
    }
    if (input.matches("[data-billing-source-search]")) {
      state.billingDraft.sourceQuery = input.value;
      if (requestSources().find(choice => choice.key === state.billingDraft.sourceKey)?.reference !== input.value)
        Object.assign(state.billingDraft, { sourceKey: "", recordId: "" });
      const query = input.value.trim().toLowerCase();
      root.querySelectorAll("#mbRequestSources [data-search-value]").forEach(choice => { choice.hidden = !choice.dataset.searchValue.includes(query); });
      input.setAttribute("aria-expanded", "true"); return true;
    }
    if (input.matches(".mb-request-form [name='amountExVat'], .mb-request-form [name='vatRate']")) {
      const form = input.closest("form");
      const exVat = Number(form.elements.namedItem("amountExVat")?.value || 0);
      const vatRate = Number(form.elements.namedItem("vatRate")?.value || 0);
      form.querySelector("[data-billing-total]").value = amount(exVat * (1 + vatRate / 100));
      state.billingDraft[input.name] = input.value; return true;
    }
    if (input.matches(".mb-request-form [name='remarks']")) {
      root.querySelector("[data-billing-note-count]").textContent = `${input.value.length}/500`;
      state.billingDraft.remarks = input.value; return true;
    }
    if (!input.matches("[data-billing-search]")) return false;
    ui.search = input.value; ui.page = 1; render(); return true;
  }
  async function handleBlur(input) {
    if (!input.matches("[data-billing-inline-notes]")) return false;
    const kind = input.dataset.noteKind, id = input.dataset.id;
    if (kind === "amc" ? !contract(id) : row(id)?.sourceType !== "Work Order") return true;
    const draft = noteDraft(kind, id, kind === "amc" ? state.data.billingNotes?.[id] : row(id)?.notes);
    draft.value = input.value;
    const display = input.closest(".mb-inline-notes")?.querySelector(".mb-note-display");
    if (display) {
      display.querySelector("span").textContent = draft.value || (kind === "amc" ? "Add payment notes..." : "Add billing notes...");
      input.hidden = true;
      display.hidden = false;
    }
    await saveBillingNotes(kind, id);
    return true;
  }
  function cleanupDraft() {
    ui.uploadTicket++;
    if (!state.drawer?.startsWith("billing-") || !state.billingDraft?.recordId) return;
    const id = encodeURIComponent(state.billingDraft.recordId);
    for (const fileId of [state.billingDraft.fileId, state.billingDraft.receiptFileId].filter(fileId => fileId && fileId !== state.billingDraft.originalFileId)) {
      request(`/api/maintenance/billing/${id}/uploads/${encodeURIComponent(fileId)}`, { method: "DELETE" }).catch(() => {});
    }
  }
  return { main, fullAmc, workOrder, drawer, handleAction, handleChange, handleInput, handleBlur,
    cleanupDraft, setTab(tab) { ui.tab = tab; }, resetMain() {} };
};
