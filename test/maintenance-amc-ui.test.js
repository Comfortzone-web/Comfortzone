const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { webcrypto } = require("node:crypto");

test("AMC Register renders live contracts and keeps its controls connected", async () => {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const shift = days => { const date = new Date(`${today}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); };
  const summary = {
    contracts: [
      { id: "a1", number: "AMC-2026-014", customerId: "c1", customerName: "Villa 14", site: "JVC, Dubai", status: "Active", startDate: shift(-30), endDate: shift(90), visitsPerYear: 2, unitCount: 3, createdAt: `${today}T10:00:00Z`, units: [] },
      { id: "a2", number: "AMC-2026-013", customerId: "c2", customerName: "ABC Office", site: "Business Bay", status: "Active", startDate: shift(-30), endDate: shift(365), visitsPerYear: 4, unitCount: 2, units: [] },
      { id: "a3", number: "AMC-2026-012", customerId: "c3", customerName: "Closed Site", site: "Sharjah", status: "Cancelled", startDate: shift(-365), endDate: shift(-15), visitsPerYear: 1, unitCount: 1, units: [] }
    ],
    visits: [
      { id: "v1", contractId: "a1", sequence: 1, plannedDate: shift(5), status: "Planned" },
      { id: "v2", contractId: "a1", sequence: 2, plannedDate: shift(-5), status: "Completed", updatedAt: `${today}T10:00:00Z` },
      { id: "v3", contractId: "a2", sequence: 1, plannedDate: shift(50), status: "Planned" }
    ],
    workOrders: [{ id: "w1", number: "WO-1", contractId: "a1", workType: "Preventive Maintenance", serviceDate: shift(-5) }],
    reports: [{ id: "r1", number: "SR-1", contractId: "a1", workOrderId: "w1", status: "Approved" }],
    files: [{ id: "f1", contractId: "a1", originalName: "contract.pdf" }],
    activity: [1, 2, 3, 4].map(number => ({ targetId: "a1", kind: "contract", message: `Activity ${number}`, actor: "Admin", createdAt: `${shift(-number)}T10:00:00Z` })),
    technicians: [], attendance: [], schedules: [], notifications: []
  };
  const listeners = {}, routes = [], exports = [], scroller = { scrollTop: 0 };
  const root = { innerHTML: "", closest: () => scroller, querySelector: () => null, contains: () => false,
    addEventListener: (name, callback) => { listeners[name] = callback; } };
  const context = {
    document: { querySelector: () => root, createElement: () => ({ click() { exports.push(this.download); } }), body: { classList: { remove() {}, toggle() {} } }, scrollingElement: scroller,
      activeElement: null, addEventListener() {} },
    window: { scrollY: 0, scrollTo() {}, showMaintenance: (...args) => routes.push(args) },
    fetch: async () => ({ ok: true, headers: { get: () => "application/json" }, json: async () => summary }),
    crypto: webcrypto, Intl, Date, FormData, Blob, URL: { createObjectURL: () => "blob:amc", revokeObjectURL() {} }, CSS: { escape: value => value }, setTimeout
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../public/maintenance.js"), "utf8"), context);
  await context.window.maintenanceModule.open("amc");
  assert.match(root.innerHTML, /class="maint-page maint-amc-page"/);
  assert.match(root.innerHTML, /class="amc-kpi-grid"/);
  assert.match(root.innerHTML, /AMC-2026-014/);
  assert.match(root.innerHTML, /Villa 14/);
  assert.doesNotMatch(root.innerHTML, /<table class="maint-table"/);

  const click = async (action, values = {}) => {
    const button = { dataset: { action, ...values }, classList: { contains: () => false } };
    button.closest = () => button;
    await listeners.click({ target: button });
  };
  const change = (selector, value) => listeners.change({ target: { value, matches: key => key === selector } });

  await click("amc-tab", { status: "Active" });
  assert.match(root.innerHTML, /data-status="Active" aria-pressed="true"/);
  assert.doesNotMatch(root.innerHTML, /class="amc-contract-row[^\"]*" aria-label="AMC-2026-012/);
  await click("amc-tab", { status: "all" });
  await click("amc-active");
  assert.match(root.innerHTML, /data-status="Active" aria-pressed="true"/);
  await click("amc-tab", { status: "Upcoming Service" });
  assert.match(root.innerHTML, /AMC-2026-014/);
  assert.doesNotMatch(root.innerHTML, /class="amc-contract-row[^\"]*" aria-label="AMC-2026-013/);
  await click("amc-tab", { status: "all" });
  change("[data-amc-sort]", "customer");
  assert.ok(root.innerHTML.indexOf('aria-label="AMC-2026-013') < root.innerHTML.indexOf('aria-label="AMC-2026-014'));
  await click("amc-toggle-filters");
  assert.match(root.innerHTML, /data-amc-service-before/);
  change("[data-amc-service-before]", shift(30));
  assert.doesNotMatch(root.innerHTML, /class="amc-contract-row[^\"]*" aria-label="AMC-2026-013/);
  await click("amc-clear-filters");
  listeners.input({ target: { dataset: { search: "amc" }, value: "ABC Office", closest: () => null, matches: () => false } });
  assert.doesNotMatch(root.innerHTML, /class="amc-contract-row[^\"]*" aria-label="AMC-2026-014/);
  listeners.input({ target: { dataset: { search: "amc" }, value: "", closest: () => null, matches: () => false } });
  await click("open-contract", { id: "a1" });
  assert.match(root.innerHTML, /Service Schedule/);
  assert.doesNotMatch(root.innerHTML, /Activity 4/);
  await click("amc-full-details");
  assert.match(root.innerHTML, /Activity 4/);
  await click("contract-tab", { tab: "Service Schedule" });
  assert.match(root.innerHTML, /Visit 1/);
  await click("contract-tab", { tab: "Service Reports" });
  assert.match(root.innerHTML, /SR-1/);
  await click("amc-documents", { id: "a1" });
  assert.match(root.innerHTML, /contract\.pdf/);
  await click("amc-full-details");
  assert.match(root.innerHTML, /Full Contract Details/);
  await click("amc-menu", { id: "a1" });
  assert.match(root.innerHTML, /class="amc-menu-popover"/);
  await click("close-contract");
  assert.doesNotMatch(root.innerHTML, /class="amc-detail-panel"/);
  await click("export-amc");
  assert.deepEqual(exports, ["amc-register.csv"]);
  await click("new-amc");
  assert.match(root.innerHTML, /New AMC Contract/);
  await click("close-drawer");
  await click("edit-amc", { id: "a1" });
  assert.match(root.innerHTML, /Edit AMC-2026-014/);
  await click("close-drawer");
  await click("schedule-for-amc", { id: "a1" });
  assert.match(root.innerHTML, /New Maintenance Schedule/);
  assert.deepEqual(routes, []);
});
