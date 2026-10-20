const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { webcrypto } = require("node:crypto");

test("dashboard renders live data and keeps its controls connected", async () => {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const tomorrow = new Date(`${today}T12:00:00Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const nextDay = tomorrow.toISOString().slice(0, 10);
  const summary = {
    contracts: [{ id: "amc-1", customerName: "Live Customer", site: "Business Bay", status: "Active", startDate: today, endDate: "2027-10-15", units: [] }],
    visits: [{ id: "visit-1", contractId: "amc-1", plannedDate: today, status: "Planned" }],
    workOrders: [
      { id: "job-1", number: "WO-LIVE-1", customerName: "Live Customer", site: "Business Bay", serviceDate: today, startTime: "09:00", status: "Scheduled", workType: "Preventive Maintenance", technicianIds: ["tech-1"], updatedAt: `${today}T09:00:00Z`, contractId: "amc-1" },
      { id: "job-2", number: "WO-LIVE-2", customerName: "Second Customer", site: "JVC", serviceDate: nextDay, startTime: "11:00", status: "Scheduled", workType: "Preventive Maintenance", technicianIds: ["tech-1"], updatedAt: `${today}T10:00:00Z`, contractId: "amc-1" }
    ],
    reports: [{ id: "report-1", number: "SR-LIVE-1", workOrderId: "job-1", submittedAt: `${today}T12:00:00Z`, submittedBy: "tech-1", status: "Pending Review", type: "Digital Checklist" }],
    technicians: [{ id: "tech-1", name: "Mavis Khan", active: true, offDuty: false }],
    attendance: [], activity: [], schedules: [], notifications: []
  };
  const listeners = {};
  const routes = [];
  const scroller = { scrollTop: 0 };
  const root = {
    innerHTML: "",
    closest: () => scroller,
    querySelector: () => null,
    contains: () => false,
    addEventListener: (name, handler) => { listeners[name] = handler; }
  };
  const context = {
    document: { querySelector: () => root, body: { classList: { remove() {}, toggle() {} } }, scrollingElement: scroller,
      activeElement: null, addEventListener() {} },
    window: { scrollY: 0, scrollTo() {}, showMaintenance: (...args) => routes.push(args) },
    fetch: async () => ({ ok: true, headers: { get: () => "application/json" }, json: async () => summary }),
    crypto: webcrypto, Intl, Date, FormData, CSS: { escape: value => value }, setTimeout
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../public/maintenance.js"), "utf8"), context);
  await context.window.maintenanceModule.open("dashboard");

  assert.match(root.innerHTML, /class="maint-dashboard"/);
  assert.match(root.innerHTML, /Active AMC Contracts/);
  assert.match(root.innerHTML, /WO-LIVE-1/);
  assert.match(root.innerHTML, /SR-LIVE-1/);
  assert.match(root.innerHTML, /Mavis Khan/);
  assert.match(root.innerHTML, /PM Visits \(2\)/);

  const click = async (action, extra = {}) => {
    const button = { dataset: { action, ...extra }, classList: { contains: () => false } };
    button.closest = () => button;
    await listeners.click({ target: button });
  };
  await click("dash-range", { range: "today" });
  assert.equal((root.innerHTML.match(/class="dash-schedule-row"/g) || []).length, 1);
  await click("dash-cal-view", { view: "day" });
  assert.match(root.innerHTML, /data-action="dash-cal-view" data-view="day" aria-pressed="true"/);
  await click("dash-select-date", { date: nextDay });
  assert.match(root.innerHTML, /WO-LIVE-2/);
  assert.equal((root.innerHTML.match(/class="dash-schedule-row"/g) || []).length, 1);
  await click("dash-cal-view", { view: "month" });
  const monthBefore = root.innerHTML.match(/class="dash-calendar-subhead"><strong>([^<]+)/)?.[1];
  await click("dash-cal-next");
  assert.notEqual(root.innerHTML.match(/class="dash-calendar-subhead"><strong>([^<]+)/)?.[1], monthBefore);
  await click("dash-cal-prev");
  assert.equal(root.innerHTML.match(/class="dash-calendar-subhead"><strong>([^<]+)/)?.[1], monthBefore);
  listeners.input({ target: { dataset: { search: "dashboard" }, value: "Second Customer", closest: () => null, matches: () => false } });
  assert.match(root.innerHTML, /Search Results \(1\)/);
  await click("new-schedule");
  assert.match(root.innerHTML, /class="maint-drawer"/);
  await click("close-drawer");
  assert.doesNotMatch(root.innerHTML, /class="maint-drawer"/);
  await click("open-technician", { id: "tech-1" });
  assert.deepEqual(routes.at(-1), ["technicians", "tech-1"]);
});
