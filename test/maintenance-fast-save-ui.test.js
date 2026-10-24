const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

test("AMC save shows the confirmed record without waiting for the summary refresh", async () => {
  const summary = { contracts: [], visits: [], workOrders: [], reports: [], files: [], activity: [], technicians: [],
    attendance: [], schedules: [], notifications: [] };
  const saved = { id: "amc-new", number: "AMC-2026-001", customerName: "Fast Customer", site: "Dubai",
    status: "Active", startDate: "2026-10-24", endDate: "2027-10-23", visitsPerYear: 4, unitCount: 1, units: [] };
  const listeners = {};
  const button = { disabled: false, innerHTML: "Save AMC", textContent: "Save AMC", isConnected: true };
  const form = { values: { customerName: saved.customerName, site: saved.site, startDate: saved.startDate,
    endDate: saved.endDate, visitsPerYear: "4", unitCount: "1" },
  querySelector: () => null, querySelectorAll: () => [] };
  const root = { innerHTML: "", closest: () => ({ scrollTop: 0 }), contains: () => false,
    querySelector: selector => selector === "#maintAmcForm" ? form : selector === '[data-action="save-amc"]' ? button : null,
    querySelectorAll: () => [],
    addEventListener: (name, callback) => { listeners[name] = callback; } };
  let getCount = 0, postCount = 0, finishPost, finishRefresh;
  const context = {
    document: { querySelector: () => root, activeElement: null, scrollingElement: { scrollTop: 0 },
      body: { classList: { remove() {}, toggle() {} } }, addEventListener() {} },
    window: { scrollY: 0, scrollTo() {}, showMaintenance() {} },
    fetch: async (_url, options = {}) => {
      if (options.method === "POST") {
        postCount++;
        await new Promise(resolve => { finishPost = resolve; });
        return { ok: true, headers: { get: () => "application/json" }, json: async () => saved };
      }
      getCount++;
      if (getCount > 1) await new Promise(resolve => { finishRefresh = resolve; });
      return { ok: true, headers: { get: () => "application/json" }, json: async () => ({ ...summary, contracts: getCount > 1 ? [saved] : [] }) };
    },
    FormData: class { constructor(element) { this.values = element.values; } entries() { return Object.entries(this.values)[Symbol.iterator](); } },
    Date, Intl, CSS: { escape: value => value }, setTimeout
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../public/maintenance.js"), "utf8"), context);
  await context.window.maintenanceModule.open("amc");
  const click = () => listeners.click({ target: { dataset: { action: "save-amc" }, classList: { contains: () => false },
    closest() { return this; } } });
  const saving = click();
  assert.equal(button.disabled, true);
  await click();
  assert.equal(postCount, 1);
  finishPost();
  await saving;
  assert.match(root.innerHTML, /Fast Customer/);
  assert.doesNotMatch(root.innerHTML, /New AMC Contract/);
  assert.equal(getCount, 2);
  finishRefresh();
});

test("editing an AMC immediately updates linked work orders and reports", async () => {
  const original = { id: "amc-1", number: "AMC-1", customerId: "old-customer", customerName: "Old Villa", site: "Old Site",
    status: "Active", startDate: "2026-01-01", endDate: "2026-12-31", visitsPerYear: 4, unitCount: 1, units: [] };
  const updated = { ...original, customerId: "new-customer", customerName: "Updated Villa", site: "Updated Site", updatedAt: "2026-10-24T12:00:00Z" };
  const summary = { contracts: [original], visits: [], schedules: [{ id: "schedule-1", contractId: original.id,
    customerName: original.customerName, site: original.site }], workOrders: [{ id: "job-1", number: "WO-1", contractId: original.id,
    customerName: original.customerName, site: original.site, serviceDate: "2026-10-24", startTime: "09:00", endTime: "10:00",
    status: "Scheduled", priority: "Normal", technicianIds: [] }], reports: [{ id: "report-1", number: "SR-1", contractId: original.id,
    workOrderId: "job-1", type: "Handwritten Upload", status: "Pending Review", submittedAt: "2026-10-24T10:00:00Z",
    extracted: { customerName: original.customerName, siteName: original.site }, details: { customerName: original.customerName },
    fileIds: [], history: [] }], files: [], activity: [], technicians: [], attendance: [], notifications: [] };
  const form = { values: { ...updated, unitCount: "1", visitsPerYear: "4" }, querySelector: () => null, querySelectorAll: () => [] };
  const button = { disabled: false, innerHTML: "Save AMC", textContent: "Save AMC", isConnected: true };
  const listeners = {}, scroller = { scrollTop: 0 };
  const root = { innerHTML: "", closest: () => scroller, contains: () => false, querySelector: selector =>
    selector === "#maintAmcForm" ? form : selector === '[data-action="save-amc"]' ? button : null,
    querySelectorAll: () => [], addEventListener: (name, callback) => { listeners[name] = callback; } };
  let finishRefresh;
  const context = {
    document: { querySelector: () => root, activeElement: null, scrollingElement: scroller,
      body: { classList: { remove() {}, toggle() {} } }, addEventListener() {} },
    window: { innerWidth: 1200, scrollY: 0, scrollTo() {}, showMaintenance() {} },
    fetch: async (_url, options = {}) => {
      if (options.method === "PUT") return { ok: true, headers: { get: () => "application/json" }, json: async () => updated };
      if (finishRefresh === undefined && context.loaded) await new Promise(resolve => { finishRefresh = resolve; });
      context.loaded = true;
      return { ok: true, headers: { get: () => "application/json" }, json: async () => summary };
    },
    FormData: class { constructor(element) { this.values = element.values; } entries() { return Object.entries(this.values)[Symbol.iterator](); } },
    Date, Intl, CSS: { escape: value => value }, setTimeout
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../public/maintenance.js"), "utf8"), context);
  await context.window.maintenanceModule.open("amc");
  const click = (action, id = "") => listeners.click({ target: { dataset: { action, id }, classList: { contains: () => false }, closest() { return this; } } });
  await click("edit-amc", original.id);
  await click("save-amc");
  await context.window.maintenanceModule.open("work-orders");
  assert.match(root.innerHTML, /Updated Villa/);
  assert.match(root.innerHTML, /Updated Site/);
  await context.window.maintenanceModule.open("reports");
  assert.match(root.innerHTML, /Updated Villa/);
  assert.match(root.innerHTML, /Updated Site/);
  finishRefresh();
});
