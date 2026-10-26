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
    request: { requestedBy: "Engineer", requestedAt: "2026-01-02" }, invoice: { number: "INV-001", total: 3150, date: "2026-01-03" },
    payments: [{ amount: 1500, date: "2026-01-04", method: "Bank Transfer", reference: "TRF-001" }] };
  const standaloneBill = { id: "wo:wo2", sourceType: "Work Order", workOrderId: standalone.id,
    reference: standalone.number, customerName: standalone.customerName, site: standalone.site,
    periodStart: "2026-04-01", periodEnd: "2026-04-01", dueDate: "2026-04-01", amountExVat: 1000, vatRate: 5,
    invoiceTotal: 0, totalPaid: 0, outstanding: 0, invoiceStatus: "Not Requested", paymentStatus: "Upcoming", payments: [] };
  const state = { data: { viewerRole: "admin", billing: [installment, standaloneBill], billingNotes: {}, visits: [],
    reports: [], files: [], activity: [], workOrders: [linkedJob, standalone] }, drawer: "", drawerId: "" };
  const routes = [];
  let renders = 0;
  const context = { window: {}, Intl, Date, FormData, Blob, URL, setTimeout, document: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../public/maintenance-billing.js"), "utf8"), context);
  const billing = context.window.createMaintenanceBilling({ state, root: { querySelector: () => null },
    esc: value => String(value ?? ""), icon: () => "", badge: () => "", day: value => value,
    shortDay: value => String(value || "").slice(0, 10), today: () => "2026-10-26",
    contract: id => id === amc.id ? amc : null, contractStatus: () => "Active",
    job: id => state.data.workOrders.find(item => item.id === id), request: () => {}, refresh: () => {},
    notice: () => {}, render: () => { renders++; }, navigate: (...args) => routes.push(args),
    drawerShell: (_title, body) => body, closeDrawer: () => {}, formField: () => "" });
  assert.match(billing.main(), /AMC Billing &amp; Payments|AMC Billing & Payments/);
  assert.match(billing.main(), /INV-001/);
  assert.match(billing.main(), /Partially Paid/);
  assert.match(billing.workOrder(linkedJob), /AMC Contract Billing/);
  assert.match(billing.workOrder(linkedJob), /View AMC Billing Details/);
  assert.doesNotMatch(billing.workOrder(linkedJob), /Set Service Amount/);
  assert.match(billing.workOrder(standalone), /Set Service Amount/);
  await billing.handleAction({ dataset: { action: "billing-open-amc", id: amc.id } });
  assert.deepEqual(routes.at(-1), ["amc", amc.id]);
  assert.match(billing.fullAmc(amc), /Billing & Payments/);
  assert.match(billing.fullAmc(amc), /Payment Schedule/);
  await billing.handleAction({ dataset: { action: "billing-toggle-filters" } });
  assert.match(billing.main(), /data-billing-filter="source"/);
  await billing.handleAction({ dataset: { action: "billing-open-source", id: standaloneBill.id } });
  assert.deepEqual(routes.at(-1), ["work-orders", standalone.id]);
  assert.ok(renders > 0);
});
