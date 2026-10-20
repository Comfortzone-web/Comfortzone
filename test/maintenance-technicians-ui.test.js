const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { webcrypto } = require("node:crypto");

test("technician directory and profile use live records and preserve existing actions", async () => {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Dubai", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const part = type => parts.find(entry => entry.type === type).value;
  const today = `${part("year")}-${part("month")}-${part("day")}`;
  const next = new Date(`${today}T12:00:00Z`); next.setUTCDate(next.getUTCDate() + 1);
  const tomorrow = next.toISOString().slice(0, 10);
  const summary = {
    contracts: [], visits: [], reports: [], files: [], activity: [],
    technicians: [
      { id: "t1", code: "TCH-001", name: "Mavis Khan", phone: "0501234567", email: "mavis@example.com", notes: "Lead technician", active: true, offDuty: false },
      { id: "t2", code: "TCH-002", name: "Ahmed Raza", phone: "0502345678", email: "ahmed@example.com", notes: "", active: true, offDuty: false },
      { id: "t3", code: "TCH-003", name: "Naseem", phone: "0503456789", email: "", notes: "", active: false, offDuty: false }
    ],
    workOrders: [
      { id: "w1", number: "WO-1024", customerName: "Villa 14", site: "JVC, Dubai", workType: "Preventive Maintenance", serviceDate: today, startTime: "09:00", endTime: "12:00", status: "On Site", technicianIds: ["t1", "t2"] },
      { id: "w2", number: "WO-1025", customerName: "ABC Office", site: "Business Bay", workType: "Filter Replacement", serviceDate: tomorrow, startTime: "13:00", endTime: "15:00", status: "Scheduled", technicianIds: ["t1"] },
      { id: "w3", number: "WO-1026", customerName: "Other Site", site: "Al Quoz", workType: "Service", serviceDate: tomorrow, startTime: "09:00", endTime: "11:00", status: "Scheduled", technicianIds: ["t2"] }
    ],
    schedules: [],
    attendance: [{ technicianId: "t1", workOrderId: "w1", site: "JVC, Dubai", checkInAt: `${today}T06:00:00Z`, checkOutAt: "" }],
    notifications: [{ id: "n1", technicianId: "t1", workOrderId: "w1", status: "Failed", acknowledgedAt: "" }]
  };
  const listeners = {}, routes = [], requests = [], scroller = { scrollTop: 0 };
  const root = { innerHTML: "", closest: () => scroller, querySelector: () => null, contains: () => false,
    addEventListener: (name, callback) => { listeners[name] = callback; } };
  const context = {
    document: { querySelector: () => root, body: { classList: { remove() {}, toggle() {} } }, scrollingElement: scroller,
      activeElement: null, addEventListener() {} },
    window: { scrollY: 0, scrollTo() {}, setTimeout() {}, showMaintenance: (...args) => routes.push(args), open() {} },
    fetch: async (url, options = {}) => {
      requests.push({ url, options });
      if (url.endsWith("/access")) return { ok: true, headers: { get: () => "application/json" }, json: async () => ({ link: "http://example.test/field/invite" }) };
      if (url === "/api/maintenance/technicians/t1" && options.method === "PUT") Object.assign(summary.technicians[0], JSON.parse(options.body));
      return { ok: true, headers: { get: () => "application/json" }, json: async () => summary };
    },
    confirm: () => true, crypto: webcrypto, Intl, Date, FormData, CSS: { escape: value => value }, setTimeout
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../public/maintenance.js"), "utf8"), context);
  await context.window.maintenanceModule.open("technicians");
  const click = async (action, extra = {}) => {
    const button = { dataset: { action, ...extra }, classList: { contains: () => false } };
    button.closest = () => button;
    await listeners.click({ target: button });
  };
  const change = (selector, value) => listeners.change({ target: { value, matches: pattern => pattern === selector } });

  assert.match(root.innerHTML, /maint-page maint-tech-page/);
  assert.match(root.innerHTML, /Technician Directory <span>\(3\)/);
  assert.match(root.innerHTML, /Current Assignment/);
  assert.match(root.innerHTML, /WO-1024/);
  assert.match(root.innerHTML, /Future Jobs \(1\)/);
  assert.match(root.innerHTML, /Weekly Activity/);
  assert.doesNotMatch(root.innerHTML, /Skills|Certifications|Team Name/);
  await click("open-technician", { id: "t1" });
  assert.match(root.innerHTML, /data-action="td-assign" data-id="t1"/);

  scroller.scrollTop = 180;
  await click("td-tab", { tab: "Today's Jobs" });
  assert.match(root.innerHTML, /WO-1024/);
  assert.doesNotMatch(root.innerHTML, /WO-1026/);
  assert.equal(scroller.scrollTop, 180);
  await click("td-tab", { tab: "Future Jobs" });
  assert.match(root.innerHTML, /WO-1025/);
  assert.doesNotMatch(root.innerHTML, /WO-1026/);
  await click("td-tab", { tab: "Attendance" });
  assert.match(root.innerHTML, /JVC, Dubai/);
  assert.match(root.innerHTML, /Check-in/);
  await click("td-tab", { tab: "Notes" });
  assert.match(root.innerHTML, /Lead technician/);
  assert.match(root.innerHTML, /Retry notification/);
  await click("create-access", { id: "t1" });
  assert.match(root.innerHTML, /http:\/\/example\.test\/field\/invite/);
  change("[data-filter-status]", "Off Duty");
  await click("td-tab", { tab: "Notes" });
  assert.doesNotMatch(root.innerHTML, /http:\/\/example\.test\/field\/invite/);
  change("[data-filter-status]", "all");

  await click("open-technician", { id: "t2" });
  assert.match(root.innerHTML, /Ahmed Raza/);
  assert.match(root.innerHTML, /Today's Jobs \(1\)/);
  assert.match(root.innerHTML, /Future Jobs \(1\)/);
  assert.equal(scroller.scrollTop, 180);
  await click("td-assign", { id: "t2" });
  assert.match(root.innerHTML, /New Maintenance Schedule/);
  assert.match(root.innerHTML, /value="t2" checked/);
  await click("close-drawer");
  await click("edit-technician", { id: "t2" });
  assert.match(root.innerHTML, /Edit Technician/);
  await click("close-drawer");
  await click("open-technician", { id: "t1" });
  await click("td-more");
  assert.match(root.innerHTML, /Disable Technician/);
  await click("td-toggle", { id: "t1" });
  assert.equal(summary.technicians[0].active, false);
  assert.ok(requests.some(request => request.url === "/api/maintenance/technicians/t1" && request.options.method === "PUT"));

  change("[data-filter-status]", "Off Duty");
  assert.match(root.innerHTML, /Technician Directory <span>\(2\)/);
  change("[data-tech-availability]", "ready");
  assert.match(root.innerHTML, /No matching technicians/);
  change("[data-tech-availability]", "all");
  change("[data-tech-sort]", "code");
  assert.match(root.innerHTML, /data-tech-sort/);
  listeners.input({ target: { value: "Naseem", dataset: {}, matches: pattern => pattern === "[data-tech-directory-search]", closest: () => null } });
  assert.match(root.innerHTML, /Technician Directory <span>\(1\)/);
  assert.match(root.innerHTML, /Naseem/);
  assert.doesNotMatch(root.innerHTML, /data-action="open-technician" data-id="t1"/);
  await context.window.maintenanceModule.open("technicians", "t1");
  assert.match(root.innerHTML, /data-action="td-assign" data-id="t1" disabled/);
  assert.match(root.innerHTML, /Technician Directory <span>\(3\)/);
});
