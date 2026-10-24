const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { webcrypto } = require("node:crypto");

test("Work Orders Kanban uses live jobs and keeps filters, detail actions and routing functional", async () => {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const makeJob = (id, status, customerName, technicianIds, contractId = "a1") => ({ id, number: `WO-${id}`,
    status, customerName, site: "JVC, Dubai", contractId, technicianIds, leadTechnicianId: technicianIds[0],
    priority: id === "2" ? "Urgent" : "Normal", serviceDate: today, startTime: "09:00", endTime: "12:00", createdAt: `${today}T08:00:00Z` });
  const summary = {
    nextWorkOrderNumber: "WO-2026-0005",
    workOrders: [makeJob("1", "Scheduled", "A Very Long Customer Name Across Multiple Words", ["t1", "t2", "t3"]),
      makeJob("2", "On Site", "Office Two", ["t2"]), makeJob("3", "Report Submitted", "Site Three", ["t3"]),
      makeJob("4", "Completed", "Site Four", ["t1"])],
    contracts: [{ id: "a1", number: "AMC-1" }],
    technicians: [{ id: "t1", name: "Mavis Khan" }, { id: "t2", name: "Ahmed Raza" }, { id: "t3", name: "Junaid Khan" }],
    reports: [{ id: "r1", workOrderId: "3", type: "Digital Checklist", status: "Pending Review", fileIds: ["f1"],
      checklist: { indoor: { Filter: { value: "OK", note: "Clean" }, Drainage: { value: "Issue", note: "Blocked" } } }, details: { remarks: "Needs follow-up" } }],
    files: [{ id: "f1", originalName: "photo.jpg", mimeType: "image/jpeg", kind: "Service Photo" }],
    activity: [{ targetId: "3", message: "Report submitted", actor: "Junaid Khan", createdAt: `${today}T09:00:00Z` }],
    visits: [], schedules: [{ id: "s2", workOrderId: "2", contractId: "a1", customerName: "Office Two", site: "JVC, Dubai",
      serviceDate: today, startTime: "09:00", endTime: "12:00", workType: "Complaint / Repair", priority: "Urgent",
      technicianIds: ["t2"], leadTechnicianId: "t2" }], attendance: [], notifications: []
  };
  const listeners = {}, routes = [], scroller = { scrollTop: 0 };
  const root = { innerHTML: "", closest: () => scroller, querySelector: () => null, contains: () => false,
    addEventListener: (name, callback) => { listeners[name] = callback; } };
  const context = {
    document: { querySelector: () => root, body: { classList: { remove() {}, toggle() {} } }, scrollingElement: scroller,
      activeElement: null, addEventListener() {} },
    window: { innerWidth: 1920, scrollY: 0, scrollTo() {}, showMaintenance: (...args) => routes.push(args) },
    fetch: async () => ({ ok: true, headers: { get: () => "application/json" }, json: async () => summary }),
    crypto: webcrypto, Intl, Date, FormData, CSS: { escape: value => value }, setTimeout
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../public/maintenance.js"), "utf8"), context);
  await context.window.maintenanceModule.open("work-orders");
  const click = async (action, extra = {}) => {
    const button = { dataset: { action, ...extra }, classList: { contains: () => false } };
    button.closest = () => button;
    await listeners.click({ target: button });
  };
  const change = (key, value) => listeners.change({ target: { value, dataset: { woFilter: key }, matches: selector => selector === "[data-wo-filter]" } });
  const cardCount = () => (root.innerHTML.match(/<article class="wo-card /g) || []).length;

  assert.match(root.innerHTML, /class="maint-page maint-wo-page"/);
  assert.equal(cardCount(), 4);
  assert.match(root.innerHTML, /A Very Long Customer Name Across Multiple Words/);
  assert.match(root.innerHTML, /\+1<\/span>/);
  assert.match(root.innerHTML, /class="wo-detail"/);
  assert.doesNotMatch(root.innerHTML, /<table class="maint-table"/);
  for (const stage of ["Scheduled", "On Site", "Report Submitted", "Completed"]) assert.match(root.innerHTML, new RegExp(`<h2>${stage}</h2>`));

  await click("wo-close");
  assert.doesNotMatch(root.innerHTML, /class="wo-detail"/);
  await click("wo-select", { id: "3" });
  assert.match(root.innerHTML, /WO-3<\/h2>/);
  assert.match(root.innerHTML, /2 of 2 items/);
  await click("wo-tab", { tab: "Checklist" });
  assert.match(root.innerHTML, /Drainage/);
  await click("wo-tab", { tab: "Attachments" });
  assert.match(root.innerHTML, /photo\.jpg/);
  await click("wo-tab", { tab: "History" });
  assert.match(root.innerHTML, /Report submitted/);
  await click("wo-more", { id: "3" });
  assert.match(root.innerHTML, /Open Service Report/);
  await click("view-job-report", { id: "3" });
  assert.deepEqual(routes.at(-1), ["reports", "r1"]);

  change("status", "Completed");
  assert.equal(cardCount(), 4);
  await click("wo-apply-filters");
  assert.equal(cardCount(), 1);
  assert.match(root.innerHTML, /WO-4/);
  await click("wo-clear-filters");
  assert.equal(cardCount(), 4);
  change("customer", "Office Two");
  await click("wo-apply-filters");
  assert.equal(cardCount(), 1);
  await click("wo-clear-filters");
  change("technician", "t1");
  await click("wo-apply-filters");
  assert.equal(cardCount(), 2);
  await click("wo-clear-filters");
  change("range", "last-month");
  await click("wo-apply-filters");
  assert.equal(cardCount(), 0);
  await click("wo-clear-filters");
  await click("wo-kpi", { status: "Scheduled" });
  assert.equal(cardCount(), 1);
  await click("wo-kpi", { status: "all" });
  assert.equal(cardCount(), 4);
  listeners.input({ target: { dataset: { search: "work-orders" }, value: "Office Two", closest: () => null, matches: () => false } });
  assert.equal(cardCount(), 1);
  listeners.input({ target: { dataset: { search: "work-orders" }, value: "", closest: () => null, matches: () => false } });
  await click("wo-menu", { id: "2" });
  assert.match(root.innerHTML, /Edit Work Order/);
  await click("open-job", { id: "2" });
  assert.deepEqual(routes.at(-1), ["work-orders", "2"]);
  await click("edit-job", { id: "2" });
  assert.match(root.innerHTML, /Edit WO-2/);
  assert.match(root.innerHTML, /name="workOrderNumber" type="text" value="WO-2"/);
  await click("close-drawer");
  await click("new-work-order");
  assert.match(root.innerHTML, /New Maintenance Schedule/);
  assert.match(root.innerHTML, /name="workOrderNumber" type="text" value="WO-2026-0005"/);
  assert.match(root.innerHTML, /Customer.*Work Order Number.*AMC Contract.*Site \/ Location/s);
  assert.match(root.innerHTML, /Visit Details.*Planned PM Visit.*Assign Individual Technicians/s);
  assert.match(root.innerHTML, /Service Date.*Planned PM Visit.*Start Time.*End Time/s);
  assert.doesNotMatch(root.innerHTML, /Lead Technician|Choose 2-5 technicians/);
});
