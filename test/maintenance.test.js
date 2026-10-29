const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const PDFDocument = require("pdfkit");
const { createMaintenanceApi } = require("../maintenance-api");

test("maintenance lifecycle and field access", async () => {
  const priorSecret = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = "maintenance-test-secret-long-enough-for-sessions";
  const dataDir = fs.mkdtempSync(path.join(__dirname, ".maintenance-test-"));
  const uploads = new Map();
  const customer = { id: "customer-1", name: "Villa 14", contact: "Mr Raza", phone: "0501234567", site: "JVC, Dubai" };
  const send = (res, status, body) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  };
  const api = createMaintenanceApi({
    dataDir, supabase: null, send, readJson: async req => req.body || {},
    collect: async req => req.rawBody || Buffer.alloc(0),
    parseMultipart: buffer => [{ filename: "field.png", body: buffer }],
    saveUpload: async (_scope, name, bytes) => uploads.set(name, bytes),
    readUpload: async (_scope, name) => uploads.get(name),
    readSettings: async () => ({ company: { name: "Comfort Zone AC" } }), PDFDocument
  });
  const admin = { role: "Admin", name: "Office" };
  const call = async (scope, method, route, body, cookie = "", rawBody, officeUser = admin) => {
    const headers = { host: "127.0.0.1:5176", cookie };
    if (rawBody) headers["content-type"] = "multipart/form-data; boundary=test";
    const req = { method, headers, body, rawBody };
    const res = {
      status: 0, headers: {}, chunks: [],
      setHeader(name, value) { this.headers[name] = value; },
      writeHead(status, nextHeaders) { this.status = status; Object.assign(this.headers, nextHeaders); },
      end(chunk) { if (chunk) this.chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)); }
    };
    const url = new URL(route, "http://127.0.0.1:5176");
    if (scope === "office") await api.routeOffice(req, res, url, officeUser);
    else await api.routeField(req, res, url);
    const bytes = Buffer.concat(res.chunks);
    const result = res.headers["Content-Type"]?.includes("application/json") ? JSON.parse(bytes.toString()) : bytes;
    return { status: res.status, headers: res.headers, result };
  };
  const office = (method, route, body, rawBody) => call("office", method, route, body, "", rawBody);
  const officeAs = (user, method, route, body) => call("office", method, route, body, "", undefined, user);
  const field = (method, route, body, cookie = "", rawBody) => call("field", method, route, body, cookie, rawBody);

  try {
    assert.equal((await officeAs({ role: "MTS", name: "MTS User" }, "GET", "/api/maintenance/summary")).status, 200);
    assert.equal((await officeAs({ role: "Staff", name: "Staff User" }, "GET", "/api/maintenance/summary")).status, 403);
    const first = await office("POST", "/api/maintenance/technicians", { name: "Mavis Khan", phone: "0501111111" });
    const second = await office("POST", "/api/maintenance/technicians", { name: "Ahmed Raza", phone: "0502222222" });
    const third = await office("POST", "/api/maintenance/technicians", { name: "Rashid Ali", phone: "0503333333" });
    assert.equal(first.status, 201, JSON.stringify(first.result));
    assert.equal(second.status, 201);
    const ids = [first.result.id, second.result.id];
    const addedCustomer = await office("POST", "/api/maintenance/customers", { name: "No Contact Sample" });
    assert.equal(addedCustomer.status, 201);
    const temporaryCustomer = await office("POST", "/api/maintenance/customers", { name: "Temporary Customer", email: "temporary@example.com" });
    assert.equal(temporaryCustomer.status, 201);
    assert.equal((await office("DELETE", `/api/maintenance/customers/${temporaryCustomer.result.id}`)).status, 200);

    const invalidEmail = await office("POST", "/api/maintenance/contracts", { customerName: customer.name,
      site: customer.site, contact: customer.contact, phone: customer.phone, email: "ac@gmail.",
      startDate: "2026-01-01", endDate: "2026-12-31", frequency: "Quarterly", unitCount: 4 });
    assert.equal(invalidEmail.status, 400);
    assert.match(invalidEmail.result.error, /Email is incomplete/);
    const amc = await office("POST", "/api/maintenance/contracts", { customerName: customer.name,
      site: customer.site, contact: customer.contact, phone: customer.phone,
      startDate: "2026-01-01", endDate: "2026-12-31", frequency: "Quarterly", unitCount: 4 });
    assert.equal(amc.status, 201);
    const updatedAmc = await office("PUT", `/api/maintenance/contracts/${amc.result.id}`, {
      ...amc.result, notes: "Updated contract details" });
    assert.equal(updatedAmc.status, 200);
    assert.equal(updatedAmc.result.notes, "Updated contract details");
    const secondAmc = await office("POST", "/api/maintenance/contracts", { customerName: customer.name,
      site: "Second sample site", contact: customer.contact, phone: customer.phone,
      startDate: "2026-01-01", endDate: "2026-12-31", frequency: "Half-Yearly", unitCount: 2 });
    assert.equal(secondAmc.status, 201);
    assert.equal(secondAmc.result.customerId, amc.result.customerId);
    const contactlessAmc = await office("POST", "/api/maintenance/contracts", { customerId: addedCustomer.result.id,
      site: "Service Site", startDate: "2026-01-01", endDate: "2026-12-31", frequency: "Quarterly", unitCount: 1 });
    assert.equal(contactlessAmc.status, 201);
    assert.equal(contactlessAmc.result.customerName, "No Contact Sample");
    assert.equal((await office("DELETE", `/api/maintenance/customers/${addedCustomer.result.id}`)).status, 409);
    assert.equal(contactlessAmc.result.contact, "");
    assert.equal(contactlessAmc.result.phone, "");
    const contactlessEdit = await office("PUT", `/api/maintenance/contracts/${contactlessAmc.result.id}`,
      { ...contactlessAmc.result, notes: "Optional contact details" });
    assert.equal(contactlessEdit.status, 200);
    assert.equal(contactlessEdit.result.phone, "");
    let summary = (await office("GET", "/api/maintenance/summary")).result;
    assert.equal(summary.visits.filter(item => item.contractId === amc.result.id).length, 4);
    assert.equal(summary.visits.filter(item => item.contractId === secondAmc.result.id).length, 2);
    assert.ok(summary.customers.some(item => item.name === customer.name));
    const planned = summary.visits.find(item => item.contractId === amc.result.id);

    const freeDraft = await office("POST", "/api/maintenance/schedules", { clientKey: "standalone-draft",
      customerName: "Standalone Sample", site: "Standalone Site", serviceDate: "2026-10-20",
      startTime: "09:00", endTime: "11:00", workType: "Preventive Maintenance", mode: "draft" });
    assert.equal(freeDraft.status, 201);
    assert.equal(freeDraft.result.workOrder, null);
    assert.match(freeDraft.result.schedule.workOrderNumber, /^WO-\d{4}-\d{4}$/);

    const requestedWorkOrderNumber = `WO-${new Date().getFullYear()}-0042`;
    const scheduleBody = { clientKey: "stable-client-key", contractId: amc.result.id, customerName: customer.name,
      visitId: planned.id, site: customer.site, serviceDate: "2026-10-15", startTime: "09:00", endTime: "12:00",
      workType: "Preventive Maintenance", workOrderNumber: requestedWorkOrderNumber, technicianIds: ids, mode: "notify" };
    const scheduled = await office("POST", "/api/maintenance/schedules", scheduleBody);
    assert.equal(scheduled.status, 201);
    const workOrder = scheduled.result.workOrder;
    assert.equal(workOrder.number, requestedWorkOrderNumber);
    assert.equal((await office("POST", "/api/maintenance/schedules", scheduleBody)).result.workOrder.id, workOrder.id);
    summary = (await office("GET", "/api/maintenance/summary")).result;
    assert.equal(summary.nextWorkOrderNumber, `WO-${new Date().getFullYear()}-0043`);
    assert.equal(summary.workOrders.length, 1);
    assert.equal(summary.notifications.length, 2);

    const duplicateNumber = await office("POST", "/api/maintenance/schedules", { ...scheduleBody,
      clientKey: "duplicate-work-order-number", visitId: "", workOrderNumber: requestedWorkOrderNumber });
    assert.equal(duplicateNumber.status, 409);
    assert.match(duplicateNumber.result.error, /Work Order Number .* already exists/);

    const overlap = await office("POST", "/api/maintenance/schedules", { ...scheduleBody, clientKey: "overlap",
      visitId: "", contractId: "", technicianIds: [ids[0], third.result.id], mode: "notify" });
    assert.equal(overlap.status, 409);

    const reschedule = await office("POST", "/api/maintenance/schedules", { ...scheduleBody,
      id: scheduled.result.schedule.id, workOrderNumber: "WO-CLIENT-77", serviceDate: "2026-10-16" });
    assert.equal(reschedule.status, 200);
    summary = (await office("GET", "/api/maintenance/summary")).result;
    assert.equal(summary.workOrders[0].number, "WO-CLIENT-77");
    assert.equal(summary.schedules.find(item => item.id === scheduled.result.schedule.id).workOrderNumber, "WO-CLIENT-77");
    assert.equal(summary.workOrders[0].serviceDate, "2026-10-16");
    assert.equal(summary.notifications.length, 4);

    const access = await office("POST", `/api/maintenance/technicians/${ids[0]}/access`, {});
    assert.equal(access.status, 200);
    const token = new URL(access.result.link).searchParams.get("access");
    const entered = await field("POST", "/api/field/access", { token });
    assert.equal(entered.status, 200);
    assert.match(entered.headers["Set-Cookie"], /Max-Age=7776000/);
    const cookie = entered.headers["Set-Cookie"].split(";")[0];
    const sessionPayload = Buffer.from(JSON.stringify({ technicianId: ids[0],
      issuedAt: Date.now() - 70 * 86400000, exp: Date.now() + 20 * 86400000 }), "utf8").toString("base64url");
    const sessionSignature = crypto.createHmac("sha256", process.env.SESSION_SECRET).update(sessionPayload).digest("base64url");
    const renewingCookie = `cz_field=${encodeURIComponent(`${sessionPayload}.${sessionSignature}`)}`;
    const renewed = await field("GET", "/api/field/me", null, renewingCookie);
    assert.equal(renewed.status, 200);
    assert.equal(typeof renewed.result.pushConfigured, "boolean");
    assert.equal(renewed.result.pushSubscribed, false);
    assert.match(renewed.headers["Set-Cookie"], /Max-Age=7776000/);
    const renewedToken = decodeURIComponent(renewed.headers["Set-Cookie"].split(";")[0].split("=")[1]);
    const renewedPayload = JSON.parse(Buffer.from(renewedToken.split(".")[0], "base64url").toString("utf8"));
    assert.ok(renewedPayload.exp > Date.now() + 89 * 86400000);
    assert.equal((await field("POST", "/api/field/access", { token })).status, 401);
    assert.equal((await field("GET", "/api/field/work-orders", null, cookie)).result.length, 1);
    assert.equal((await field("GET", `/api/field/work-orders/${workOrder.id}`)).status, 401);
    const assignmentNotice = summary.notifications.find(item => item.technicianId === ids[0] && item.type === "rescheduled");
    assert.equal((await field("GET", `/api/field/work-orders/${workOrder.id}`, null, cookie)).status, 200);
    assert.equal((await office("GET", "/api/maintenance/summary")).result.notifications.find(item => item.id === assignmentNotice.id).status, assignmentNotice.status);
    assert.equal((await field("POST", `/api/field/notifications/${assignmentNotice.id}/accept`, {}, cookie)).status, 200);
    summary = (await office("GET", "/api/maintenance/summary")).result;
    assert.equal(summary.notifications.find(item => item.id === assignmentNotice.id).status, "Accepted");
    assert.ok(summary.activity.some(item => item.targetId === workOrder.id && item.message.includes("accepted")));
    const acceptedActivityCount = summary.activity.filter(item => item.targetId === workOrder.id && item.message.includes("accepted")).length;
    assert.equal((await field("POST", `/api/field/notifications/${assignmentNotice.id}/accept`, {}, cookie)).status, 200);
    assert.equal((await office("GET", "/api/maintenance/summary")).result.activity.filter(item => item.targetId === workOrder.id && item.message.includes("accepted")).length, acceptedActivityCount);

    const outsiderAccess = await office("POST", `/api/maintenance/technicians/${third.result.id}/access`, {});
    const outsiderToken = new URL(outsiderAccess.result.link).searchParams.get("access");
    const outsiderCookie = (await field("POST", "/api/field/access", { token: outsiderToken })).headers["Set-Cookie"].split(";")[0];
    assert.equal((await field("GET", `/api/field/work-orders/${workOrder.id}`, null, outsiderCookie)).status, 404);
    assert.equal((await field("POST", `/api/field/notifications/${assignmentNotice.id}/accept`, {}, outsiderCookie)).status, 404);

    assert.equal((await field("POST", `/api/field/work-orders/${workOrder.id}/attendance`, { action: "checkIn" }, cookie)).status, 200);
    summary = (await office("GET", "/api/maintenance/summary")).result;
    assert.equal(summary.workOrders[0].status, "On Site");
    assert.equal((await field("POST", `/api/field/work-orders/${workOrder.id}/attendance`, { action: "checkOut" }, cookie)).status, 200);
    summary = (await office("GET", "/api/maintenance/summary")).result;
    assert.ok(summary.attendance.find(item => item.workOrderId === workOrder.id)?.checkOutAt);

    const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
    const signature = await field("POST", `/api/field/work-orders/${workOrder.id}/files?kind=signature`, null, cookie, png);
    assert.equal(signature.status, 201);
    const checklist = { maintenance: {
      [api.CHECKLIST.maintenance[0]]: { value: "Issue" },
      [api.CHECKLIST.maintenance[1]]: { value: "OK" }
    } };
    const reportBody = { type: "Digital Checklist", checklist, signatureFileId: signature.result.id,
      fileIds: [signature.result.id], details: { customerName: "Mr Raza", workCarriedOut: "Cleaned filters", remarks: "Cooling normally" } };
    const photo = await field("POST", `/api/field/work-orders/${workOrder.id}/files?kind=photo`, null, cookie, png);
    assert.equal(photo.status, 201);
    reportBody.fileIds.push(photo.result.id);
    assert.equal((await field("PUT", `/api/field/work-orders/${workOrder.id}/draft`, reportBody, cookie)).status, 200);
    assert.equal((await field("DELETE", `/api/field/work-orders/${workOrder.id}/files/${photo.result.id}`, null, cookie)).status, 200);
    const afterRemoval = (await field("GET", `/api/field/work-orders/${workOrder.id}`, null, cookie)).result;
    assert.ok(!afterRemoval.draft.fileIds.includes(photo.result.id));
    assert.ok(!afterRemoval.files.some(file => file.id === photo.result.id));
    const replacementPhoto = await field("POST", `/api/field/work-orders/${workOrder.id}/files?kind=photo`, null, cookie, png);
    assert.equal(replacementPhoto.status, 201);
    reportBody.fileIds = [signature.result.id, replacementPhoto.result.id];
    assert.equal((await field("PUT", `/api/field/work-orders/${workOrder.id}/draft`, reportBody, cookie)).status, 200);
    const submitted = await field("POST", `/api/field/work-orders/${workOrder.id}/report`, reportBody, cookie);
    assert.equal(submitted.status, 201);
    assert.ok(submitted.result.fileIds.includes(replacementPhoto.result.id));
    assert.ok(!submitted.result.fileIds.includes(photo.result.id));
    summary = (await office("GET", "/api/maintenance/summary")).result;
    assert.equal(summary.workOrders[0].status, "Report Submitted");
    assert.equal(summary.reports[0].status, "Pending Review");
    assert.equal((await office("POST", "/api/maintenance/schedules", { ...scheduleBody, id: scheduled.result.schedule.id, serviceDate: "2026-10-17" })).status, 409);

    const revision = await office("POST", `/api/maintenance/reports/${submitted.result.id}/review`, { decision: "Revision", reason: "Clarify refrigerant check" });
    assert.equal(revision.status, 200);
    const revised = await field("POST", `/api/field/work-orders/${workOrder.id}/report`, { ...reportBody,
      details: { ...reportBody.details, remarks: "Refrigerant pressure normal" } }, cookie);
    assert.equal(revised.status, 201);
    assert.equal(revised.result.id, submitted.result.id);
    assert.equal(revised.result.versions.length, 1);
    const approval = await office("POST", `/api/maintenance/reports/${submitted.result.id}/review`, { decision: "Approved", reason: "Reviewed" });
    assert.equal(approval.status, 200);
    summary = (await office("GET", "/api/maintenance/summary")).result;
    assert.equal(summary.workOrders[0].status, "Completed");
    assert.equal(summary.visits.find(item => item.id === planned.id).status, "Completed");
    const singlePm = await office("POST", "/api/maintenance/schedules", { clientKey: "single-technician-pm",
      customerName: "Solo PM Customer", site: "Al Quoz", serviceDate: "2026-10-30", startTime: "09:00", endTime: "11:00",
      workType: "Preventive Maintenance", technicianIds: [third.result.id], mode: "notify" });
    assert.equal(singlePm.status, 201, JSON.stringify(singlePm.result));
    assert.equal(Object.hasOwn(singlePm.result.workOrder, "leadTechnicianId"), false);
    const soloId = singlePm.result.workOrder.id;
    const soloSignature = await field("POST", `/api/field/work-orders/${soloId}/files?kind=signature`, null, outsiderCookie, png);
    assert.equal(soloSignature.status, 201);
    const soloBody = { type: "Digital Checklist", checklist: {}, signatureFileId: soloSignature.result.id,
      fileIds: [soloSignature.result.id], details: { customerName: "Customer", workCarriedOut: "Serviced unit" } };
    assert.equal((await field("PUT", `/api/field/work-orders/${soloId}/draft`, soloBody, outsiderCookie)).status, 200);
    assert.equal((await field("POST", `/api/field/work-orders/${soloId}/report`, soloBody, outsiderCookie)).status, 201);
    const pdf = await office("GET", `/api/maintenance/reports/${submitted.result.id}/pdf`);
    assert.equal(pdf.status, 200);
    assert.equal(pdf.result.toString("ascii", 0, 5), "%PDF-");

    const paperJob = await office("POST", "/api/maintenance/schedules", { clientKey: "paper-job",
      customerName: customer.name, site: customer.site, serviceDate: "2026-10-18", startTime: "13:00", endTime: "15:00",
      workType: "Complaint / Repair", technicianIds: [third.result.id], leadTechnicianId: third.result.id, mode: "notify" });
    assert.equal(paperJob.status, 201);
    const paperId = paperJob.result.workOrder.id;
    const original = await field("POST", `/api/field/work-orders/${paperId}/files?kind=original`, null,
      outsiderCookie, Buffer.from("%PDF-1.4\n%%EOF", "ascii"));
    assert.equal(original.status, 201);
    const extraction = await field("POST", `/api/field/work-orders/${paperId}/extract`, { fileId: original.result.id }, outsiderCookie);
    assert.equal(extraction.status, 200);
    const paperBody = { type: "Handwritten Upload", originalFileId: original.result.id, fileIds: [original.result.id],
      extracted: { customerName: customer.name, workCarriedOut: "Checked compressor" },
      details: { workCarriedOut: "Checked compressor", remarks: "Original retained" } };
    const paperReport = await field("POST", `/api/field/work-orders/${paperId}/report`, paperBody, outsiderCookie);
    assert.equal(paperReport.status, 201);
    assert.equal((await office("POST", `/api/maintenance/reports/${paperReport.result.id}/review`,
      { decision: "Rejected", reason: "Missing unit reference" })).status, 200);
    assert.equal((await field("POST", `/api/field/work-orders/${paperId}/report`, { ...paperBody,
      extracted: { ...paperBody.extracted, unitNumber: "AC-04" } }, outsiderCookie)).status, 201);
    assert.equal((await office("POST", `/api/maintenance/reports/${paperReport.result.id}/review`,
      { decision: "Approved" })).status, 200);
    const retryNotice = (await office("GET", "/api/maintenance/summary")).result.notifications.find(item => item.technicianId === third.result.id);
    const retry = await office("POST", `/api/maintenance/notifications/${retryNotice.id}/retry`, {});
    assert.equal(retry.status, 200);
    assert.equal(retry.result.status, "Not Subscribed");
    assert.equal(retry.result.detail, "No device subscription");

    const officeJob = await office("POST", "/api/maintenance/schedules", { clientKey: "office-report-job",
      customerName: "Office Report Customer", site: "Business Bay", serviceDate: "2026-10-20", startTime: "09:00", endTime: "11:00",
      workType: "Complaint / Repair", technicianIds: [ids[1]], leadTechnicianId: ids[1], mode: "notify" });
    const priorApiKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const officeUpload = await office("POST", "/api/maintenance/reports/upload", null, png);
    if (priorApiKey !== undefined) process.env.OPENAI_API_KEY = priorApiKey;
    assert.equal(officeUpload.status, 201);
    assert.equal(officeUpload.result.available, false);
    const officeReport = await office("POST", "/api/maintenance/reports", { workOrderId: officeJob.result.workOrder.id,
      fileId: officeUpload.result.file.id, extracted: { customerName: "Office Report Customer", workCarriedOut: "Replaced capacitor" },
      details: { workCarriedOut: "Replaced capacitor" } });
    assert.equal(officeReport.status, 201);
    assert.equal(officeReport.result.status, "Pending Review");
    const editedOfficeReport = await office("PUT", `/api/maintenance/reports/${officeReport.result.id}`, {
      extracted: { customerName: "Office Report Customer", workCarriedOut: "Replaced and tested capacitor" },
      details: { customerName: "Office Report Customer", workCarriedOut: "Replaced and tested capacitor" } });
    assert.equal(editedOfficeReport.status, 200);
    assert.equal(editedOfficeReport.result.details.workCarriedOut, "Replaced and tested capacitor");
    assert.equal((await office("POST", `/api/maintenance/reports/${officeReport.result.id}/review`, { decision: "Approved" })).status, 200);
    const reEditPath = `/api/maintenance/reports/${officeReport.result.id}`;
    const reEditBody = { workOrderId: officeJob.result.workOrder.id,
      extracted: { reportNumber: officeReport.result.number, customerName: "Office Report Customer", siteName: "Business Bay" },
      details: { customerName: "Office Report Customer", workCarriedOut: "Capacitor replaced and tested again" } };
    const mtsReEdit = await officeAs({ role: "MTS", name: "MTS User" }, "PUT", reEditPath, reEditBody);
    assert.equal(mtsReEdit.status, 403);
    const wrongJobReEdit = await office("PUT", reEditPath, { ...reEditBody, workOrderId: "" });
    assert.equal(wrongJobReEdit.status, 409);
    const adminReEdit = await office("PUT", reEditPath, reEditBody);
    assert.equal(adminReEdit.status, 200);
    assert.equal(adminReEdit.result.status, "Approved");
    assert.equal(adminReEdit.result.details.workCarriedOut, "Capacitor replaced and tested again");
    assert.equal(adminReEdit.result.history.at(-1).action, "Approved report re-edited");
    const afterReEdit = (await office("GET", "/api/maintenance/summary")).result;
    assert.equal(afterReEdit.viewerRole, "admin");
    assert.equal(afterReEdit.workOrders.find(item => item.id === officeJob.result.workOrder.id).status, "Completed");
    assert.equal((await officeAs({ role: "MTS", name: "MTS User" }, "GET", "/api/maintenance/summary")).result.viewerRole, "mts");

    delete process.env.OPENAI_API_KEY;
    const standaloneUpload = await office("POST", "/api/maintenance/reports/upload", null, png);
    if (priorApiKey !== undefined) process.env.OPENAI_API_KEY = priorApiKey;
    assert.equal(standaloneUpload.status, 201);
    const standalone = await office("POST", "/api/maintenance/reports", {
      fileId: standaloneUpload.result.file.id,
      extracted: { customerName: "Walk-in Customer", siteName: "Al Quoz", serviceDate: "2026-10-22", workCarriedOut: "Repaired AC unit" },
      details: { customerName: "Walk-in Customer", workCarriedOut: "Repaired AC unit" } });
    assert.equal(standalone.status, 201, JSON.stringify(standalone.result));
    assert.equal(standalone.result.workOrderId, "");
    assert.equal(standalone.result.status, "Pending Review");
    assert.match(standalone.result.number, /^SR-\d{4}-\d{4}$/);
    assert.equal(standalone.result.extracted.reportNumber, standalone.result.number);
    assert.equal((await office("GET", `/api/maintenance/reports/${standalone.result.id}/pdf`)).status, 200);
    assert.equal((await office("POST", `/api/maintenance/reports/${standalone.result.id}/review`, { decision: "Approved" })).status, 200);

    delete process.env.OPENAI_API_KEY;
    const automaticUpload = await office("POST", "/api/maintenance/reports/upload?submit=1", null, png);
    if (priorApiKey !== undefined) process.env.OPENAI_API_KEY = priorApiKey;
    assert.equal(automaticUpload.status, 201, JSON.stringify(automaticUpload.result));
    assert.equal(automaticUpload.result.report.status, "Pending Review");
    assert.equal(automaticUpload.result.report.originalFileId, automaticUpload.result.file.id);
    assert.equal(automaticUpload.result.report.extracted.reportNumber, automaticUpload.result.report.number);
    assert.ok((await office("GET", "/api/maintenance/summary")).result.reports.some(item => item.id === automaticUpload.result.report.id));

    const laterJob = await office("POST", "/api/maintenance/schedules", { clientKey: "link-report-later",
      customerName: "Another Walk-in Customer", site: "Sharjah", serviceDate: "2026-10-23", startTime: "09:00", endTime: "11:00",
      workType: "Complaint / Repair", technicianIds: [ids[1]], leadTechnicianId: ids[1], mode: "notify" });
    delete process.env.OPENAI_API_KEY;
    const laterUpload = await office("POST", "/api/maintenance/reports/upload", null, png);
    if (priorApiKey !== undefined) process.env.OPENAI_API_KEY = priorApiKey;
    const laterReport = await office("POST", "/api/maintenance/reports", { fileId: laterUpload.result.file.id,
      extracted: { reportNumber: "1730", customerName: "Another Walk-in Customer", technicianName: "Mavis Khan, Ahmed Raza" },
      details: { customerName: "Another Walk-in Customer" } });
    assert.equal(laterReport.status, 201);
    assert.equal(laterReport.result.number, "1730");
    const linkedLater = await office("PUT", `/api/maintenance/reports/${laterReport.result.id}`, {
      workOrderId: laterJob.result.workOrder.id, extracted: { ...laterReport.result.extracted, reportNumber: "1731" }, details: laterReport.result.details });
    assert.equal(linkedLater.status, 200, JSON.stringify(linkedLater.result));
    assert.equal(linkedLater.result.workOrderId, laterJob.result.workOrder.id);
    assert.equal(linkedLater.result.number, "1731");
    assert.equal(linkedLater.result.extracted.technicianName, "Mavis Khan, Ahmed Raza");
    assert.equal((await office("PUT", `/api/maintenance/reports/${laterReport.result.id}`, {
      extracted: { ...linkedLater.result.extracted, reportNumber: standalone.result.number }, details: linkedLater.result.details })).status, 409);
    assert.equal((await office("POST", `/api/maintenance/reports/${laterReport.result.id}/review`, { decision: "Approved" })).status, 200);
    assert.equal((await office("GET", "/api/maintenance/summary")).result.workOrders.find(item => item.id === laterJob.result.workOrder.id).status, "Completed");

    const fieldDirectJob = await office("POST", "/api/maintenance/schedules", { clientKey: "field-direct-report-job",
      customerName: "Field Upload Customer", site: "JVC", serviceDate: "2026-10-21", startTime: "09:00", endTime: "11:00",
      workType: "Complaint / Repair", technicianIds: ids, leadTechnicianId: ids[0], mode: "notify" });
    const secondAccess = await office("POST", `/api/maintenance/technicians/${ids[1]}/access`, {});
    const secondToken = new URL(secondAccess.result.link).searchParams.get("access");
    const secondCookie = (await field("POST", "/api/field/access", { token: secondToken })).headers["Set-Cookie"].split(";")[0];
    const sharedJobId = fieldDirectJob.result.workOrder.id;
    assert.equal((await field("PUT", `/api/field/work-orders/${sharedJobId}/draft`, { type: "Digital Checklist", checklist: {}, details: {} }, secondCookie)).status, 200);
    const sharedPhoto = await field("POST", `/api/field/work-orders/${sharedJobId}/files?kind=photo`, null, secondCookie, png);
    assert.equal(sharedPhoto.status, 201);
    assert.equal((await field("PUT", `/api/field/work-orders/${sharedJobId}/draft`, {
      type: "Digital Checklist", checklist: {}, details: {}, fileIds: [sharedPhoto.result.id] }, secondCookie)).status, 200);
    assert.equal((await field("DELETE", `/api/field/work-orders/${sharedJobId}/files/${sharedPhoto.result.id}`, null, secondCookie)).status, 200);
    delete process.env.OPENAI_API_KEY;
    const fieldUpload = await field("POST", "/api/field/reports/upload", null, secondCookie, png);
    if (priorApiKey !== undefined) process.env.OPENAI_API_KEY = priorApiKey;
    assert.equal(fieldUpload.status, 201, JSON.stringify(fieldUpload.result));
    assert.equal(fieldUpload.result.file.workOrderId, "");
    const fieldReportBody = { fileId: fieldUpload.result.file.id,
      extracted: { reportNumber: "FIELD-1733", customerName: "Walk-in Customer", technicianName: "Ahmed Raza" },
      details: { customerName: "Walk-in Customer", workCarriedOut: "Serviced AC" } };
    assert.equal((await field("POST", "/api/field/reports", fieldReportBody, cookie)).status, 409);
    const fieldStandalone = await field("POST", "/api/field/reports", fieldReportBody, secondCookie);
    assert.equal(fieldStandalone.status, 201, JSON.stringify(fieldStandalone.result));
    assert.equal(fieldStandalone.result.workOrderId, "");
    assert.equal(fieldStandalone.result.status, "Pending Review");
    assert.equal(fieldStandalone.result.submittedBy, ids[1]);
    assert.equal((await field("POST", "/api/field/reports", fieldReportBody, secondCookie)).status, 409);
    assert.equal((await office("GET", "/api/maintenance/summary")).result.reports.find(item => item.id === fieldStandalone.result.id).status, "Pending Review");
    const directOriginal = await field("POST", `/api/field/work-orders/${fieldDirectJob.result.workOrder.id}/files?kind=original`, null, secondCookie, png);
    assert.equal(directOriginal.status, 201);
    const directSubmit = await field("POST", `/api/field/work-orders/${fieldDirectJob.result.workOrder.id}/report`, {
      type: "Handwritten Upload", originalFileId: directOriginal.result.id, fileIds: [directOriginal.result.id],
      extracted: { reportNumber: "FIELD-1732", workCarriedOut: "Field uploaded service report" },
      details: { workCarriedOut: "Field uploaded service report" }
    }, secondCookie);
    assert.equal(directSubmit.status, 201);
    assert.equal(directSubmit.result.status, "Pending Review");
    assert.equal(directSubmit.result.number, "FIELD-1732");

    const customWorkOrderNumber = `CZWO-${new Date().getFullYear()}-001`;
    const customJob = await office("POST", "/api/maintenance/schedules", { clientKey: "custom-work-order-sequence",
      customerId: addedCustomer.result.id, site: "Dubai", serviceDate: "2026-11-10", startTime: "14:00", endTime: "15:00",
      workType: "Complaint / Repair", technicianIds: [ids[0]], workOrderNumber: customWorkOrderNumber, mode: "notify" });
    assert.equal(customJob.status, 201);
    assert.equal(customJob.result.workOrder.number, customWorkOrderNumber);
    assert.equal((await office("GET", "/api/maintenance/summary")).result.nextWorkOrderNumber,
      `CZWO-${new Date().getFullYear()}-002`);
    const nextCustomJob = await office("POST", "/api/maintenance/schedules", { clientKey: "next-custom-work-order",
      customerName: "Next Custom Customer", site: "Dubai", serviceDate: "2026-11-11", startTime: "14:00", endTime: "15:00",
      workType: "Complaint / Repair", technicianIds: [ids[0]], mode: "notify" });
    assert.equal(nextCustomJob.status, 201);
    assert.equal(nextCustomJob.result.workOrder.number, `CZWO-${new Date().getFullYear()}-002`);

    const linkedStandalone = await office("PUT", `/api/maintenance/reports/${fieldStandalone.result.id}`, {
      contractId: amc.result.id, extracted: fieldStandalone.result.extracted, details: fieldStandalone.result.details });
    assert.equal(linkedStandalone.status, 200, JSON.stringify(linkedStandalone.result));
    const currentAmc = (await office("GET", "/api/maintenance/summary")).result.contracts.find(item => item.id === amc.result.id);
    const renamedCustomer = await office("PUT", `/api/maintenance/customers/${currentAmc.customerId}`,
      { name: "Villa 14 Updated", contact: customer.contact, phone: customer.phone });
    assert.equal(renamedCustomer.status, 200, JSON.stringify(renamedCustomer.result));
    const renamedAmc = await office("PUT", `/api/maintenance/contracts/${amc.result.id}`, {
      ...currentAmc, site: "JVC, Updated" });
    assert.equal(renamedAmc.status, 200, JSON.stringify(renamedAmc.result));
    summary = (await office("GET", "/api/maintenance/summary")).result;
    const renamedJob = summary.workOrders.find(item => item.id === workOrder.id);
    const renamedSchedule = summary.schedules.find(item => item.id === scheduled.result.schedule.id);
    const renamedHandwritten = summary.reports.find(item => item.id === fieldStandalone.result.id);
    const digitalReport = summary.reports.find(item => item.id === submitted.result.id);
    for (const item of [renamedJob, renamedSchedule]) {
      assert.equal(item.customerId, renamedAmc.result.customerId);
      assert.equal(item.customerName, "Villa 14 Updated");
      assert.equal(item.site, "JVC, Updated");
    }
    assert.equal(renamedHandwritten.extracted.customerName, "Villa 14 Updated");
    assert.equal(renamedHandwritten.extracted.siteName, "JVC, Updated");
    assert.equal(renamedHandwritten.details.customerName, "Villa 14 Updated");
    assert.equal(digitalReport.details.customerName, "Villa 14 Updated");
    assert.equal(digitalReport.status, "Approved");
    assert.equal(digitalReport.versions.length, 1);
    assert.equal(summary.attendance.find(item => item.workOrderId === workOrder.id).site, "JVC, Updated");
    assert.equal(summary.contracts.find(item => item.id === secondAmc.result.id).site, "Second sample site");
    assert.equal(summary.schedules.find(item => item.id === freeDraft.result.schedule.id).customerName, "Standalone Sample");
    assert.equal(summary.reports.find(item => item.id === standalone.result.id).details.customerName, "Walk-in Customer");
    assert.equal((await field("GET", `/api/field/work-orders/${workOrder.id}`, null, cookie)).result.customerName, "Villa 14 Updated");

    const invalidInlineAmc = await office("POST", "/api/maintenance/contracts", {
      customerId: "__new__", newCustomer: { name: "Invalid Inline Customer" }, site: "",
      startDate: "2026-10-01", endDate: "2027-09-30", frequency: "Quarterly", unitCount: 1 });
    assert.equal(invalidInlineAmc.status, 400);
    assert.equal((await office("GET", "/api/maintenance/summary")).result.customers.some(item => item.name === "Invalid Inline Customer"), false);
    const inlineAmc = await office("POST", "/api/maintenance/contracts", {
      customerId: "__new__", newCustomer: { name: "Inline AMC Customer", contact: "Mina", phone: "0509991111", email: "mina@example.com" },
      site: "Dubai Hills", contact: "Mina", phone: "0509991111", email: "mina@example.com",
      startDate: "2026-10-01", endDate: "2027-09-30", frequency: "Quarterly", unitCount: 1 });
    assert.equal(inlineAmc.status, 201, JSON.stringify(inlineAmc.result));
    assert.equal(inlineAmc.result.customerName, "Inline AMC Customer");
    const inlineSchedule = await office("POST", "/api/maintenance/schedules", {
      clientKey: "inline-customer-schedule", customerId: "__new__",
      newCustomer: { name: "Inline Schedule Customer", contact: "Omar", email: "omar@example.com" },
      site: "Al Quoz", contact: "Omar", serviceDate: "2026-11-12", startTime: "09:00", endTime: "11:00", mode: "draft" });
    assert.equal(inlineSchedule.status, 201, JSON.stringify(inlineSchedule.result));
    summary = (await office("GET", "/api/maintenance/summary")).result;
    assert.equal(summary.customers.find(item => item.id === inlineAmc.result.customerId).email, "mina@example.com");
    assert.equal(summary.customers.find(item => item.id === inlineSchedule.result.schedule.customerId).email, "omar@example.com");
    assert.equal(summary.schedules.find(item => item.id === inlineSchedule.result.schedule.id).customerName, "Inline Schedule Customer");

    const revoked = await office("POST", `/api/maintenance/technicians/${ids[0]}/revoke`, {});
    assert.equal(revoked.status, 200);
    assert.equal((await field("GET", "/api/field/me", null, cookie)).status, 401);
  } finally {
    if (priorSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = priorSecret;
    assert.ok(path.resolve(dataDir).startsWith(`${path.resolve(__dirname)}${path.sep}`));
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
