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
