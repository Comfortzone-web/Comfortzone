const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { createMaintenanceApi } = require("../maintenance-api");
const { createMaintenanceStore } = require("../maintenance-store");

test("Maintenance deletes preserve relationship integrity and require an admin", async () => {
  const dataDir = fs.mkdtempSync(path.join(__dirname, ".maintenance-delete-test-"));
  const store = createMaintenanceStore({ dataDir });
  const removedUploads = [];
  const api = createMaintenanceApi({ dataDir, supabase: null,
    send: (res, status, value) => { res.status = status; res.body = value; },
    readJson: async req => req.body || {}, collect: async () => Buffer.alloc(0), parseMultipart: () => [],
    saveUpload: async () => {}, readUpload: async () => Buffer.alloc(0),
    deleteUpload: async (scope, name) => removedUploads.push(`${scope}/${name}`), readSettings: async () => ({}) });
  const admin = { role: "Admin", name: "Office" };
  const call = async (method, route, body = {}, user = admin, origin = "") => {
    const res = { status: 0, body: null };
    await api.routeOffice({ method, body, headers: { host: "127.0.0.1:5175", ...(origin ? { origin } : {}) } },
      res, new URL(route, "http://127.0.0.1:5175"), user);
    return res;
  };
  const summary = async () => (await call("GET", "/api/maintenance/summary")).body;
  const contractBody = { customerName: "Delete Test Customer", site: "JVC", startDate: "2026-01-01", endDate: "2026-12-31",
    frequency: "Quarterly", unitCount: 2 };
  const scheduleBody = (contract, visit, technicians, key) => ({ clientKey: key, contractId: contract.id, visitId: visit.id,
    serviceDate: "2026-10-20", startTime: "09:00", endTime: "12:00", workType: "Preventive Maintenance",
    technicianIds: technicians.map(item => item.id), leadTechnicianId: technicians[0].id, mode: "notify" });
  try {
    const technician = (await call("POST", "/api/maintenance/technicians", { name: "Technician One", phone: "0500000001" })).body;
    const second = (await call("POST", "/api/maintenance/technicians", { name: "Technician Two", phone: "0500000002" })).body;
    const contract = (await call("POST", "/api/maintenance/contracts", contractBody)).body;
    const visit = (await summary()).visits.find(item => item.contractId === contract.id);
    const published = (await call("POST", "/api/maintenance/schedules", scheduleBody(contract, visit, [technician, second], "delete-published"))).body;
    const job = published.workOrder;
    assert.equal((await call("DELETE", `/api/maintenance/technicians/${technician.id}`)).status, 409);
    assert.equal((await call("DELETE", `/api/maintenance/work-orders/${job.id}`, {}, { role: "User" })).status, 403);
    assert.equal((await call("DELETE", `/api/maintenance/work-orders/${job.id}`, {}, admin, "https://other.example")).status, 403);
    assert.equal((await summary()).workOrders.length, 1);

    await store.mutate(data => {
      data.reports.push({ id: "report-a", number: "SR-2026-0001", workOrderId: job.id, submittedBy: technician.id,
        status: "Approved", fileIds: ["photo-a"] });
      data.attendance.push({ id: "attendance-a", workOrderId: job.id, technicianId: technician.id, checkInAt: "2026-10-20T09:00:00Z", checkOutAt: "" });
      data.files.push({ id: "photo-a", workOrderId: job.id, originalName: "photo.png", storedName: "photo-a.png" });
      data.files.push({ id: "photo-b", workOrderId: job.id, originalName: "other.png", storedName: "photo-b.png" });
      data.workOrders[0].status = "Completed";
      data.visits.find(item => item.id === visit.id).status = "Completed";
    });
    assert.equal((await call("DELETE", "/api/maintenance/reports/report-a")).status, 200);
    let data = await summary();
    assert.equal(data.reports.length, 0);
    assert.equal(data.workOrders[0].status, "On Site");
    assert.equal(data.visits.find(item => item.id === visit.id).status, "Scheduled");
    assert.equal(data.files.length, 1);
    assert.equal(data.files[0].id, "photo-b");
    assert.deepEqual(removedUploads, ["maintenance/photo-a.png"]);
    assert.equal((await call("DELETE", "/api/maintenance/reports/report-a")).status, 404);

    assert.equal((await call("DELETE", `/api/maintenance/schedules/${published.schedule.id}`)).status, 200);
    data = await summary();
    assert.equal(data.schedules.length, 0);
    assert.equal(data.workOrders.length, 0);
    assert.equal(data.attendance.length, 0);
    assert.equal(data.files.length, 0);
    assert.deepEqual(removedUploads, ["maintenance/photo-a.png", "maintenance/photo-b.png"]);
    assert.equal(data.visits.find(item => item.id === visit.id).status, "Planned");
    assert.equal(data.visits.find(item => item.id === visit.id).workOrderId, "");
    assert.equal(data.notifications.length, 0);

    const draft = (await call("POST", "/api/maintenance/schedules", { ...scheduleBody(contract, visit, [technician, second], "delete-draft"), mode: "draft" })).body.schedule;
    assert.equal((await call("DELETE", `/api/maintenance/schedules/${draft.id}`)).status, 200);
    assert.equal((await summary()).schedules.length, 0);

    const publishedAgain = (await call("POST", "/api/maintenance/schedules", scheduleBody(contract, visit, [technician, second], "delete-job"))).body;
    assert.equal((await call("DELETE", `/api/maintenance/work-orders/${publishedAgain.workOrder.id}`)).status, 200);
    data = await summary();
    assert.equal(data.workOrders.length, 0);
    assert.equal(data.schedules.length, 0);
    assert.equal(data.visits.find(item => item.id === visit.id).status, "Planned");

    const another = (await call("POST", "/api/maintenance/schedules", scheduleBody(contract, visit, [technician, second], "delete-amc"))).body;
    await store.mutate(data => data.reports.push({ id: "report-b", number: "SR-2026-0002", workOrderId: another.workOrder.id, submittedBy: technician.id }));
    assert.equal((await call("DELETE", `/api/maintenance/contracts/${contract.id}`)).status, 200);
    data = await summary();
    for (const key of ["contracts", "visits", "schedules", "workOrders", "reports", "notifications"]) assert.equal(data[key].length, 0, key);
    assert.equal((await call("DELETE", `/api/maintenance/technicians/${technician.id}`)).status, 200);
    assert.equal((await summary()).technicians.length, 1);
  } finally {
    assert.ok(path.resolve(dataDir).startsWith(`${path.resolve(__dirname)}${path.sep}`));
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test("Deleting a standalone service report removes current and versioned uploads but keeps shared files", async () => {
  const dataDir = fs.mkdtempSync(path.join(__dirname, ".maintenance-delete-test-"));
  const store = createMaintenanceStore({ dataDir });
  const removedUploads = [];
  let failPreviousOnce = true;
  const api = createMaintenanceApi({ dataDir, supabase: null,
    send: (res, status, value) => { res.status = status; res.body = value; },
    readJson: async req => req.body || {}, collect: async () => Buffer.alloc(0), parseMultipart: () => [],
    saveUpload: async () => {}, readUpload: async () => Buffer.alloc(0),
    deleteUpload: async (scope, name) => {
      if (name === "previous.png" && failPreviousOnce) {
        failPreviousOnce = false;
        throw new Error("Temporary storage failure");
      }
      removedUploads.push(`${scope}/${name}`);
    }, readSettings: async () => ({}) });
  try {
    await store.mutate(data => {
      data.reports.push({ id: "deleted", number: "SR-1", workOrderId: "", fileIds: ["current", "shared"],
        versions: [{ fileIds: ["previous"] }] });
      data.reports.push({ id: "kept", number: "SR-2", workOrderId: "", fileIds: ["shared"] });
      for (const id of ["current", "previous", "shared"]) data.files.push({ id, workOrderId: "", storedName: `${id}.png` });
    });
    const res = { status: 0, body: null };
    await api.routeOffice({ method: "DELETE", headers: { host: "127.0.0.1:5175" } }, res,
      new URL("http://127.0.0.1:5175/api/maintenance/reports/deleted"), { role: "Admin", name: "Office" });
    assert.equal(res.status, 200);
    assert.equal(res.body.cleanupPending, true);
    let data = await store.read();
    assert.deepEqual(data.files.map(file => file.id), ["shared"]);
    assert.deepEqual(data.pendingUploadDeletes, ["previous.png"]);
    const summary = { status: 0, body: null };
    await api.routeOffice({ method: "GET", headers: { host: "127.0.0.1:5175" } }, summary,
      new URL("http://127.0.0.1:5175/api/maintenance/summary"), { role: "Admin", name: "Office" });
    assert.equal(summary.status, 200);
    data = await store.read();
    assert.deepEqual(data.pendingUploadDeletes, []);
    assert.deepEqual(removedUploads, ["maintenance/current.png", "maintenance/previous.png"]);
  } finally {
    assert.ok(path.resolve(dataDir).startsWith(`${path.resolve(__dirname)}${path.sep}`));
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
