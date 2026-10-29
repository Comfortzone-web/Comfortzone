const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

test("billing views share records and navigate between AMC, work order and main pages", async () => {
  const amc = { id: "amc1", number: "AMC-2026-0008", customerName: "Arabian Center", site: "Dubai",
    startDate: "2026-01-01", endDate: "2026-12-31", contractValue: 12000, visitsPerYear: 4, status: "Active" };
  const linkedJob = { id: "wo1", number: "CZWO-2026-001", contractId: amc.id, customerName: amc.customerName, site: amc.site };
  const standalone = { id: "wo2", number: "CZWO-2026-002", contractId: "", customerName: "Standalone", site: "Sharjah" };
  const installment = { id: "amc:amc1:1", sourceType: "AMC", contractId: amc.id, installmentNumber: 1,
    reference: amc.number, customerName: amc.customerName, site: amc.site, amountExVat: 3000, vatRate: 5,
    periodStart: "2026-01-01", periodEnd: "2026-03-31", dueDate: "2026-03-31", invoiceTotal: 3150,
    totalPaid: 1500, outstanding: 1650, invoiceStatus: "Invoice Received", paymentStatus: "Partially Paid",
    request: { requestedBy: "Engineer", requestedAt: "2026-01-02" }, invoice: { number: "INV-001", total: 3150, date: "2026-01-03", fileId: "invoice-file-1" },
    payments: [{ amount: 1500, date: "2026-01-04", method: "Bank Transfer", reference: "TRF-001" }] };
  const standaloneBill = { id: "wo:wo2", sourceType: "Work Order", workOrderId: standalone.id,
    reference: standalone.number, customerName: standalone.customerName, site: standalone.site,
    periodStart: "2026-04-01", periodEnd: "2026-04-01", dueDate: "2026-04-01", amountExVat: 1000, vatRate: 5,
    serviceAmountExVat: 1000, serviceVatRate: 5,
    invoiceTotal: 0, totalPaid: 0, outstanding: 0, invoiceStatus: "Not Requested", paymentStatus: "Upcoming", payments: [], notes: "Initial billing note" };
  const specialBill = { ...standaloneBill, id: "wo-special:wo2:1", sourceType: "Work Order Special",
    billingType: "variation_charge", amountExVat: 250, invoiceStatus: "Pending Accountant Action",
    request: { status: "sent_to_accountant", requestedBy: "Admin User", requestDate: "2026-10-27" } };
  const state = { data: { viewerRole: "admin", billing: [installment, standaloneBill, specialBill], billingNotes: { amc1: "Initial AMC note" }, visits: [],
    reports: [], files: [], activity: [], workOrders: [linkedJob, standalone] }, drawer: "", drawerId: "" };
  const routes = [], requests = [];
  let renders = 0;
  const context = { window: {}, Intl, Date, FormData, Blob, URL, setTimeout, clearTimeout, document: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../public/maintenance-billing.js"), "utf8"), context);
  const noteDisplay = { hidden: true, querySelector: () => ({ textContent: "" }) };
  const noteInput = { value: "Updated billing note", dataset: { id: standaloneBill.id, noteKind: "work-order" }, matches: selector => selector === "[data-billing-inline-notes]", closest: () => ({ querySelector: () => noteDisplay }), focus() { this.focused = true; } };
  const billing = context.window.createMaintenanceBilling({ state, root: { querySelector: () => null },
    esc: value => String(value ?? ""), icon: () => "", badge: () => "", day: value => value,
    shortDay: value => String(value || "").slice(0, 10), today: () => "2026-10-26",
    contract: id => id === amc.id ? amc : null, contractStatus: () => "Active",
    job: id => state.data.workOrders.find(item => item.id === id),
    request: async (url, options) => { requests.push([url, options]); if (url.endsWith("/invoice-file")) installment.invoice.fileId = ""; if (url === "/api/maintenance/billing/wo%3Awo2" && options.method === "PUT") standaloneBill.notes = JSON.parse(options.body).notes; if (url === "/api/maintenance/billing/notes/amc1" && options.method === "PUT") state.data.billingNotes.amc1 = JSON.parse(options.body).notes; }, refresh: () => {},
    notice: () => {}, render: () => { renders++; }, navigate: (...args) => routes.push(args),
    drawerShell: (title, body) => title + body, closeDrawer: () => {},
    formField: (label, name, value, type = "text", required = false, extra = "") => `<label>${label}<input name="${name}" type="${type}" value="${value ?? ""}" ${required ? "required" : ""} ${extra}></label>` });
  assert.match(billing.main(), /AMC Billing &amp; Payments|AMC Billing & Payments/);
  assert.match(billing.main(), /INV-001/);
  assert.match(billing.main(), /<td><span class="mb-pill rose">Partially Paid<\/span><small class="mb-invoice-number">Invoice INV-001<\/small><\/td>/);
  assert.doesNotMatch(billing.main(), /mb-reference-detail[^<]*<\/span><small>Invoice INV-001/);
  assert.match(billing.main(), /mb-reference-cell/);
  assert.match(billing.main(), /mb-billing-list-table/);
  assert.match(billing.main(), /<th>Status<\/th>/);
  assert.doesNotMatch(billing.main(), /<th>(Invoice Status|Payment Status)<\/th>/);
  assert.match(billing.main(), />Partially Paid<\/span>/);
  assert.match(billing.main(), />Invoice Pending<\/span>/);
  assert.match(billing.main(), /data-action="billing-mark-paid"/);
  assert.doesNotMatch(billing.main(), /Record Payment|billing-open-payment/);
  assert.match(billing.main(), /data-action="billing-edit-invoice"/);
  assert.match(billing.main(), /data-action="billing-delete-request"/);
  assert.doesNotMatch(billing.main(), /Apply Credit|billing-open-credit/);
  installment.paymentStatus = "Paid";
  const specialRequest = specialBill.request;
  specialBill.request = null;
  assert.match(billing.main(), /data-action="billing-mark-unpaid"/);
  assert.doesNotMatch(billing.main(), /data-action="billing-edit-invoice"/);
  assert.doesNotMatch(billing.main(), /data-action="billing-delete-request"/);
  specialBill.request = specialRequest;
  installment.paymentStatus = "Partially Paid";
  assert.match(billing.main(), /<span class="mb-reference-detail" title="Installment 1">Installment 1<\/span>/);
  assert.match(billing.main(), /<span class="mb-reference-detail" title="Additional\/Variation charge">Additional\/Variation charge<\/span>/);
  assert.doesNotMatch(billing.main(), /Work Order · Additional \/ Variation Charge/);
  assert.match(billing.main(), /Invoice date: 2026-01-03/);
  assert.match(billing.main(), /Partially Paid/);
  assert.match(billing.workOrder(linkedJob), /AMC Contract Billing/);
  assert.match(billing.workOrder(linkedJob), /View AMC Billing Details/);
  assert.match(billing.workOrder(linkedJob), /mb-schedule-table/);
  assert.match(billing.workOrder(linkedJob), /<th>Due Date<\/th>/);
  assert.match(billing.workOrder(linkedJob), /<th>Status<\/th>/);
  assert.match(billing.workOrder(linkedJob), /mb-action-menu/);
  assert.doesNotMatch(billing.workOrder(linkedJob), /<th>Payment Date<\/th>|<th>Payment Status<\/th>/);
  assert.doesNotMatch(billing.workOrder(linkedJob), /Set Service Amount/);
  assert.match(billing.workOrder(standalone), /Change Service Amount/);
  const standaloneView = billing.workOrder(standalone);
  assert.ok(standaloneView.indexOf("Change Service Amount") < standaloneView.indexOf("Request Invoice"));
  assert.doesNotMatch(standaloneView, /mb-toolbar/);
  assert.match(standaloneView, /<textarea[^>]*data-billing-inline-notes[^>]*hidden>Initial billing note<\/textarea>/);
  assert.match(standaloneView, /data-action="billing-edit-inline-notes"/);
  assert.doesNotMatch(standaloneView, /Payment Date|Payment Reference/);
  assert.doesNotMatch(standaloneView, /Save Notes/);
  await billing.handleAction({ dataset: { action: "billing-edit-inline-notes", id: standaloneBill.id }, closest: () => ({ querySelector: () => noteInput }) });
  assert.equal(noteInput.focused, true);
  assert.equal(noteInput.hidden, false);
  assert.equal(billing.handleInput(noteInput), true);
  await billing.handleBlur(noteInput);
  assert.equal(standaloneBill.notes, "Updated billing note");
  assert.match(billing.workOrder(standalone), /Updated billing note/);
  standaloneBill.serviceAmountExVat = 0;
  assert.match(billing.workOrder(standalone), /Set Service Amount/);
  standaloneBill.serviceAmountExVat = 1000;
  standaloneBill.amountExVat = 525;
  standaloneBill.request = { requestedBy: "Admin User", requestDate: "2026-10-28", status: "send" };
  const requestedView = billing.workOrder(standalone);
  assert.match(requestedView, /Service Amount[\s\S]*?AED 1,000\.00/);
  assert.match(requestedView, /Expected Total[\s\S]*?AED 1,050\.00/);
  assert.match(requestedView, /Change Service Amount/);
  standaloneBill.amountExVat = 1000;
  standaloneBill.request = null;
  assert.match(standaloneView, /class="mb-metrics"/);
  assert.doesNotMatch(standaloneView, /<th>Payment Date<\/th>|<th>Method<\/th>|<th>Verified By<\/th>/);
  assert.doesNotMatch(standaloneView, /Other Work Order Billing/);
  assert.match(standaloneView, /Additional \/ Variation Charge/);
  assert.match(standaloneView, /Invoice No\. \/ Date/);
  assert.doesNotMatch(standaloneView, /<th>(Invoice Status|Payment Status)<\/th>/);
  assert.match(standaloneView, /Requested \/ By/);
  assert.match(standaloneView, /mb-action-menu/);
  assert.match(standaloneView, /Upload Invoice/);
  assert.match(standaloneView, /Mark Prepared/);
  assert.match(standaloneView, /billing-delete-request/);
  assert.match(standaloneView, /billing-edit-request/);
  await billing.handleAction({ dataset: { action: "billing-edit-request", id: specialBill.id } });
  const editDrawer = billing.drawer();
  assert.match(editDrawer, /Edit Invoice Request/);
  assert.match(editDrawer, /Contract & Customer/);
  assert.match(editDrawer, /Billing Details/);
  assert.match(editDrawer, /Amount \(AED\) excl\. VAT/);
  assert.match(editDrawer, /Save Request/);
  assert.match(editDrawer, /name="sendToAccountant" type="checkbox"(?! checked)/);
  assert.equal(state.billingDraft.amountExVat, 250);
  await billing.handleChange({ matches: selector => selector === '[name="sendToAccountant"]', checked: true });
  assert.match(billing.drawer(), /Send to Accountant/);
  assert.equal(state.billingDraft.sendToAccountant, true);
  await billing.handleAction({ dataset: { action: "billing-open-amc", id: amc.id } });
  assert.deepEqual(routes.at(-1), ["amc", amc.id]);
  assert.match(billing.fullAmc(amc), /Billing & Payments/);
  const amcBillingView = billing.fullAmc(amc);
  assert.match(amcBillingView, /Payment Schedule & Invoice Requests/);
  assert.match(amcBillingView, /Payment Notes/);
  assert.match(amcBillingView, /<textarea[^>]*data-billing-inline-notes[^>]*data-note-kind="amc"[^>]*hidden>Initial AMC note<\/textarea>/);
  assert.doesNotMatch(amcBillingView, /billing-open-notes/);
  const amcNoteInput = { value: "Updated AMC note", dataset: { id: amc.id, noteKind: "amc" }, matches: selector => selector === "[data-billing-inline-notes]", closest: () => ({ querySelector: () => noteDisplay }) };
  assert.equal(billing.handleInput(amcNoteInput), true);
  await billing.handleBlur(amcNoteInput);
  assert.equal(state.data.billingNotes.amc1, "Updated AMC note");
  assert.match(billing.fullAmc(amc), /Updated AMC note/);
  assert.match(amcBillingView, /mb-amc-billing-table/);
  assert.match(amcBillingView, /<th>Invoice No\. \/ Date<\/th>/);
  assert.match(amcBillingView, /<th>Requested \/ By<\/th>/);
  assert.match(amcBillingView, /data-installment-id="amc:amc1:1"/);
  assert.doesNotMatch(amcBillingView, /Invoice Requests & History|Other AMC Billing/);
  assert.doesNotMatch(amcBillingView, /class="mb-outline"[^>]*>Upload Invoice/);
  await billing.handleAction({ dataset: { action: "billing-toggle-filters" } });
  assert.match(billing.main(), /data-billing-filter="source"/);
  await billing.handleAction({ dataset: { action: "billing-open-source", id: standaloneBill.id } });
  assert.deepEqual(routes.at(-1), ["work-orders", standalone.id]);
  await billing.handleAction({ dataset: { action: "billing-open-invoice", id: standaloneBill.id } });
  const manualInvoiceDrawer = billing.drawer();
  assert.match(manualInvoiceDrawer, /Invoice file \(PDF, JPG, PNG\) · Optional/);
  assert.match(manualInvoiceDrawer, /save without a file/);
  for (const field of ["number", "date", "customerName", "sourceReference", "dueDate", "amountExVat", "vatAmount", "total"]) {
    const input = manualInvoiceDrawer.match(new RegExp(`<input name="${field}"[^>]*>`))?.[0];
    assert.ok(input, `Missing editable ${field} input`);
    assert.doesNotMatch(input, /\b(?:readonly|disabled)\b/, `${field} should stay editable`);
  }
  assert.match(billing.drawer(), /name="confirmMismatch"(?! checked)/);
  state.billingDraft.fileId = "uploaded-invoice";
  state.billingDraft.confirmMismatch = true;
  assert.match(billing.drawer(), /name="confirmMismatch" checked/);
  await billing.handleAction({ dataset: { action: "billing-edit-invoice", id: installment.id } });
  assert.match(billing.drawer(), /Edit Invoice/);
  assert.equal(state.billingDraft.number, "INV-001");
  assert.equal(state.billingDraft.fileId, state.billingDraft.originalFileId);
  assert.match(billing.drawer(), /name="number" type="text" value="INV-001"/);
  assert.match(billing.drawer(), /mb-current-invoice-file/);
  assert.match(billing.drawer(), /data-action="billing-delete-invoice-file"/);
  await billing.handleAction({ dataset: { action: "billing-delete-invoice-file", id: installment.id } });
  assert.match(requests.at(-1)[0], /\/invoice-file$/);
  assert.equal(requests.at(-1)[1].method, "DELETE");
  assert.equal(state.billingDraft.fileId, "");
  assert.doesNotMatch(billing.drawer(), /mb-current-invoice-file/);
  assert.equal(installment.invoice.number, "INV-001");
  assert.ok(renders > 0);
});
