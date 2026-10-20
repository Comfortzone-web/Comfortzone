const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { webcrypto } = require("node:crypto");

test("PM Schedule uses live visits without duplicates and keeps calendar actions working", async () => {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const shift = days => { const date = new Date(`${today}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); };
  const future = shift(3), emptyDate = shift(2);
  const orders = [0, 1, 2, 3].map(index => ({ id: `w${index + 1}`, number: `WO-${index + 1}`, contractId: "a1",
    customerName: index === 0 ? "A Very Long Customer Name That Must Truncate Cleanly" : `Customer ${index + 1}`,
    site: "JVC, Dubai", workType: "Preventive Maintenance", serviceDate: today, startTime: `${String(index + 9).padStart(2, "0")}:00`, endTime: "13:00",
    technicianIds: ["t1", "t2"], status: index === 1 ? "On Site" : "Scheduled" }));
  orders.push(...[3, 4, 5, 6].map(index => ({ id: `w${index + 2}`, number: `WO-${index + 2}`, contractId: "a1",
    customerName: `Future Customer ${index}`, site: "Business Bay", workType: "Preventive Maintenance", serviceDate: shift(index),
    startTime: "09:00", endTime: "12:00", technicianIds: ["t1", "t2"], status: "Scheduled" })));
  const summary = {
    contracts: [{ id: "a1", number: "AMC-1", customerName: "Villa 14", site: "JVC, Dubai", contact: "Manager", phone: "0501234567", units: [{ type: "Split AC" }] }],
    visits: [
      { id: "v1", contractId: "a1", plannedDate: today, status: "Planned", workOrderId: "w1", sequence: 1 },
      { id: "v2", contractId: "a1", plannedDate: future, status: "Planned", sequence: 2 }
    ],
    workOrders: orders,
    schedules: [{ id: "d1", customerName: "Draft Customer", site: "JVC", workType: "Preventive Maintenance", status: "Draft", serviceDate: shift(8), technicianIds: [] }],
    technicians: [{ id: "t1", name: "Mavis Khan", active: true }, { id: "t2", name: "Ahmed Raza", active: true }],
    reports: [], files: [], attendance: [], activity: [], notifications: []
  };
  const listeners = {}, routes = [], scroller = { scrollTop: 0 };
  const root = { innerHTML: "", closest: () => scroller, querySelector: () => null, contains: () => false,
    addEventListener: (name, callback) => { listeners[name] = callback; } };
  const context = {
    document: { querySelector: () => root, body: { classList: { remove() {}, toggle() {} } }, scrollingElement: scroller,
      activeElement: null, addEventListener() {} },
    window: { innerWidth: 1366, scrollY: 0, scrollTo() {}, showMaintenance: (...args) => routes.push(args) },
    fetch: async () => ({ ok: true, headers: { get: () => "application/json" }, json: async () => summary }),
    crypto: webcrypto, Intl, Date, FormData, CSS: { escape: value => value }, setTimeout
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../public/maintenance.js"), "utf8"), context);
  await context.window.maintenanceModule.open("schedule");
  const click = async (action, extra = {}) => {
    const button = { dataset: { action, ...extra }, classList: { contains: () => false } };
    button.closest = () => button;
    await listeners.click({ target: button });
  };

  assert.match(root.innerHTML, /class="maint-page maint-pm-page"/);
  assert.match(root.innerHTML, /Total Scheduled/);
  assert.match(root.innerHTML, /Report Submitted/);
  assert.doesNotMatch(root.innerHTML, /In Progress/);
  assert.match(root.innerHTML, /\+2 more/);
  assert.equal((root.innerHTML.match(/data-action="open-job" data-id="w1"/g) || []).length, 2);
  assert.doesNotMatch(root.innerHTML, /data-action="schedule-visit" data-id="v1"/);
  await click("pm-toggle-filters");
  assert.match(root.innerHTML, /data-filter-status/);
  await click("pm-toggle-filters");
  listeners.input({ target: { dataset: { search: "schedule" }, value: "Very Long Customer", closest: () => null, matches: () => false } });
  assert.match(root.innerHTML, /A Very Long Customer Name/);
  assert.doesNotMatch(root.innerHTML, /data-action="open-job" data-id="w2"/);
  listeners.input({ target: { dataset: { search: "schedule" }, value: "", closest: () => null, matches: () => false } });
  await click("pm-menu", { id: "w1" });
  assert.match(root.innerHTML, /class="pm-menu-popover"/);
  await click("pm-menu", { id: "w1" });
  await click("pm-view", { view: "week" });
  assert.match(root.innerHTML, /class="pm-week-grid"/);
  await click("pm-view", { view: "day" });
  assert.match(root.innerHTML, /class="pm-day-timeline"/);
  await click("pm-day-details");
  assert.match(root.innerHTML, /data-view="day" aria-pressed="true"/);
  await click("pm-view", { view: "list" });
  assert.match(root.innerHTML, /class="pm-list-rows"/);
  assert.doesNotMatch(root.innerHTML, /class="pm-month-grid"/);
  await click("pm-view", { view: "month" });
  assert.match(root.innerHTML, /class="pm-month-grid"/);
  await click("pm-prev");
  assert.doesNotMatch(root.innerHTML, /\+2 more/);
  await click("pm-today");
  assert.match(root.innerHTML, /\+2 more/);
  await click("pm-select-date", { date: future });
  assert.match(root.innerHTML, /pm-day-head/);
  assert.match(root.innerHTML, /Future Customer/);
  await click("pm-day-prev");
  assert.match(root.innerHTML, /pm-day-head/);
  await click("pm-day-next");
  context.window.innerWidth = 900;
  await click("pm-view", { view: "month" });
  const firstUpcoming = root.innerHTML.match(/class="pm-upcoming-card"[^]*?data-id="([^"]+)"/)?.[1];
  await click("pm-upcoming-next");
  assert.match(root.innerHTML, /Upcoming PM Visits/);
  assert.notEqual(root.innerHTML.match(/class="pm-upcoming-card"[^]*?data-id="([^"]+)"/)?.[1], firstUpcoming);
  await click("pm-view-all");
  assert.match(root.innerHTML, /class="pm-list-rows"/);
  await click("pm-kpi", { status: "Pending" });
  assert.match(root.innerHTML, /data-action="schedule-visit" data-id="v2"/);
  assert.match(root.innerHTML, /class="pm-badge pending"/);
  await click("pm-kpi", { status: "all" });
  await click("open-job", { id: "w1" });
  assert.deepEqual(routes.at(-1), ["work-orders", "w1"]);
  await click("pm-empty-date", { date: emptyDate });
  assert.match(root.innerHTML, /New Maintenance Schedule/);
  assert.match(root.innerHTML, new RegExp(`name="serviceDate"[^>]*value="${emptyDate}"`));
  await click("close-drawer");
  await click("schedule-visit", { id: "v2" });
  assert.match(root.innerHTML, /value="v2" selected/);
  await click("close-drawer");
  await click("new-schedule");
  assert.match(root.innerHTML, /New Maintenance Schedule/);
});
