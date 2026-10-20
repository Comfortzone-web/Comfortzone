const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { webcrypto } = require("node:crypto");

test("single work-order detail keeps live tabs, permissions, workflow timing and draft duplication", async () => {
  const summary = {
    contracts: [{ id: "a1", number: "AMC-2026-014", unitCount: 4 }], visits: [],
    workOrders: [{ id: "w1", number: "WO-1024", contractId: "a1", customerName: "Villa 14", site: "JVC, Dubai",
      contact: "Mr. Ahmed", phone: "0501234567", workType: "Preventive Maintenance", priority: "Normal",
      serviceDate: "2026-10-15", startTime: "09:00", endTime: "12:00", technicianIds: ["t1", "t2"], leadTechnicianId: "t1",
      instructions: "Check drainage and filters", status: "On Site", createdAt: "2026-10-10T11:30:00Z", updatedAt: "2026-10-15T09:02:00Z" }],
    schedules: [{ id: "s1", workOrderId: "w1", contractId: "a1", customerName: "Villa 14", site: "JVC, Dubai",
      serviceDate: "2026-10-15", startTime: "09:00", endTime: "12:00", workType: "Preventive Maintenance", priority: "Normal",
      technicianIds: ["t1", "t2"], leadTechnicianId: "t1", createdAt: "2026-10-10T11:30:00Z" }],
    technicians: [{ id: "t1", name: "Mavis Khan", phone: "0501234567", active: true },
      { id: "t2", name: "Ahmed Raza", phone: "0502345678", active: true }],
    attendance: [{ workOrderId: "w1", technicianId: "t1", checkInAt: "2026-10-15T09:02:00Z", checkOutAt: "" }],
    reports: [{ id: "r1", number: "SR-1724", workOrderId: "w1", status: "Pending Review", type: "Digital Checklist",
      submittedAt: "2026-10-15T11:00:00Z", submittedBy: "t1", fileIds: ["f1"], checklist: { indoor: { Filters: { value: "OK", note: "Clean" } } },
      details: { workCarriedOut: "Cleaned filters", materialsUsed: "None", remarks: "Cooling normal" } },
      { id: "r2", number: "SR-OTHER", workOrderId: "w2", status: "Approved", fileIds: [] }],
    files: [{ id: "f1", workOrderId: "w1", mimeType: "image/jpeg", originalName: "unit.jpg", kind: "photo", size: 1024 },
      { id: "f2", workOrderId: "w2", mimeType: "image/jpeg", originalName: "other.jpg", kind: "photo", size: 1024 }],
    activity: [{ kind: "workOrder", targetId: "w1", actor: "Admin", message: "WO-1024 scheduled", createdAt: "2026-10-10T11:30:00Z" }],
    notifications: [{ id: "n1", workOrderId: "w1", status: "Failed", technicianId: "t1" }]
  };
  const listeners = {}, documentListeners = {}, routes = [], requests = [], scroller = { scrollTop: 0 };
  const root = { innerHTML: "", closest: () => scroller, querySelector: () => null, contains: () => false,
    addEventListener: (name, callback) => { listeners[name] = callback; } };
  const context = {
    document: { querySelector: () => root, body: { classList: { remove() {}, toggle() {} } }, scrollingElement: scroller,
      activeElement: null, addEventListener: (name, callback) => { documentListeners[name] = callback; } },
    window: { innerWidth: 1440, scrollY: 0, scrollTo() {}, setTimeout() {}, showMaintenance: (...args) => routes.push(args) },
    fetch: async (url, options = {}) => {
      requests.push({ url, options });
      if (url === "/api/maintenance/schedules") {
        const body = JSON.parse(options.body);
        assert.equal(body.mode, "draft");
        assert.equal(body.visitId, "");
        assert.equal(body.customerName, "Villa 14");
        assert.equal(body.reportId, undefined);
        assert.equal(body.attendance, undefined);
        const schedule = { ...body, id: "s-copy", workOrderId: "", status: "Draft" };
        summary.schedules.unshift(schedule);
        return { ok: true, headers: { get: () => "application/json" }, json: async () => ({ schedule }) };
      }
      return { ok: true, headers: { get: () => "application/json" }, json: async () => url.endsWith("/retry") ? { ok: true } : summary };
    },
    crypto: webcrypto, Intl, Date, FormData, CSS: { escape: value => value }, setTimeout
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../public/maintenance.js"), "utf8"), context);
  await context.window.maintenanceModule.open("work-orders", "w1");
  const click = async (action, extra = {}) => {
    const button = { dataset: { action, ...extra }, classList: { contains: () => false } };
    button.closest = () => button;
    await listeners.click({ target: button });
  };

  assert.match(root.innerHTML, /class="maint-page maint-wo-detail-page"/);
  assert.match(root.innerHTML, /Work Order #WO-1024/);
  assert.match(root.innerHTML, /class="wd-timeline"/);
  assert.match(root.innerHTML, /wd-stage current onsite/);
  assert.match(root.innerHTML, /wd-stage pending completed/);
  assert.match(root.innerHTML, /Mavis Khan/);
  assert.match(root.innerHTML, /Ahmed Raza/);
  assert.match(root.innerHTML, /Open in Maps/);
  assert.match(root.innerHTML, /JVC%2C%20Dubai/);
  assert.match(root.innerHTML, /Check drainage and filters/);
  assert.doesNotMatch(root.innerHTML, /other\.jpg/);
  assert.match(root.innerHTML, /Cancel Work Order<\/button>/);
  assert.match(root.innerHTML, /disabled title="Work order cancellation/);

  scroller.scrollTop = 180;
  await click("wd-tab", { tab: "Checklist" });
  assert.match(root.innerHTML, /Filters/);
  assert.match(root.innerHTML, /Clean/);
  assert.equal(scroller.scrollTop, 180);
  await click("wd-tab", { tab: "Service Report" });
  assert.match(root.innerHTML, /SR-1724/);
  assert.match(root.innerHTML, /Cleaned filters/);
  assert.doesNotMatch(root.innerHTML, /SR-OTHER/);
  await click("wd-tab", { tab: "Photos & Documents" });
  assert.match(root.innerHTML, /unit\.jpg/);
  assert.doesNotMatch(root.innerHTML, /other\.jpg/);
  await click("wd-tab", { tab: "Overview" });
  await click("wd-documents");
  assert.match(root.innerHTML, /Photos &amp; Documents \(1\)/);
  await click("wd-more");
  assert.match(root.innerHTML, /Duplicate as Draft/);
  documentListeners.keydown({ key: "Escape" });
  assert.doesNotMatch(root.innerHTML, /Duplicate as Draft/);
  await click("wd-retry-notifications", { id: "w1" });
  assert.ok(requests.some(request => request.url === "/api/maintenance/notifications/n1/retry"));
  await click("view-job-report", { id: "w1" });
  assert.deepEqual(routes.at(-1), ["reports", "r1"]);
  await click("wd-duplicate", { id: "w1" });
  assert.equal(summary.workOrders.length, 1);
  await context.window.maintenanceModule.refresh();
  assert.match(root.innerHTML, /Draft copied from WO-1024/);
  assert.match(root.innerHTML, /New Maintenance Schedule/);
  await click("close-drawer");

  summary.workOrders[0].status = "Completed";
  await context.window.maintenanceModule.refresh();
  assert.match(root.innerHTML, /wd-stage pending completed/);
  summary.reports[0].status = "Approved";
  await context.window.maintenanceModule.refresh();
  assert.match(root.innerHTML, /wd-stage current completed/);
});
