const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

test("AMC delete menu uses one standard confirmation and refreshes live data", async () => {
  const summary = { contracts: [{ id: "a1", number: "AMC-2026-0001", customerName: "Sample Customer", site: "JVC",
    status: "Active", startDate: "2026-01-01", endDate: "2026-12-31", visitsPerYear: 4, unitCount: 1, units: [] }],
  visits: [], schedules: [], workOrders: [], technicians: [], attendance: [], reports: [], files: [], notifications: [], activity: [] };
  const listeners = {}, scroller = { scrollTop: 0 }, calls = [], confirmations = [];
  const root = { innerHTML: "", closest: () => scroller, contains: () => false, addEventListener: (name, callback) => { listeners[name] = callback; },
    querySelector: selector => selector === ".maint-page" ? { insertAdjacentHTML() {} } : null };
  const context = { document: { querySelector: () => root, body: { classList: { remove() {}, toggle() {} } }, scrollingElement: scroller,
    activeElement: null, addEventListener() {} }, window: { scrollY: 0, scrollTo() {}, setTimeout() {} },
  confirm: message => { confirmations.push(message); return true; },
  fetch: async (url, options = {}) => {
    calls.push([url, options.method || "GET"]);
    if (options.method === "DELETE") {
      summary.contracts = [];
      return { ok: true, headers: { get: () => "application/json" }, json: async () => ({ ok: true, deleted: { label: "AMC-2026-0001" } }) };
    }
    return { ok: true, headers: { get: () => "application/json" }, json: async () => summary };
  }, Intl, Date, FormData, CSS: { escape: value => value }, setTimeout };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../public/maintenance-billing.js"), "utf8"), context);
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../public/maintenance.js"), "utf8"), context);
  const click = async (action, data = {}, inDialog = false) => {
    const button = { dataset: { action, ...data }, classList: { contains: () => false }, disabled: false,
      closest: selector => selector === "[data-action]" ? button : null };
    await listeners.click({ target: button });
  };
  await context.window.maintenanceModule.open("amc");
  await click("amc-menu", { id: "a1" });
  assert.match(root.innerHTML, /Documents<\/button><button class="maint-delete-option"[^>]*>.*Delete AMC/);
  await click("delete-request", { kind: "contracts", id: "a1" });
  assert.equal(confirmations.length, 1);
  assert.match(confirmations[0], /Delete AMC contract AMC-2026-0001\?/);
  assert.deepEqual(calls.at(-2), ["/api/maintenance/contracts/a1", "DELETE"]);
  assert.match(root.innerHTML, /No AMC contracts/);
});
