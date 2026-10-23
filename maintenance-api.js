const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { createMaintenanceStore } = require("./maintenance-store");

let webPush = null;
try { webPush = require("web-push"); } catch {}

const CHECKLIST = {
  maintenance: [
    "Clean AC air filters.",
    "Clean cooling coils and straighten fins.",
    "Clean AC condenser coils using pressure washer.",
    "Clean drain trays and drain pipes.",
    "Flush drain lines and clear blockages.",
    "Clean electrical control panels using air blower.",
    "Check and record voltage and amperage.",
    "Check AC suction and discharge pressures.",
    "Check belt tension and adjust/replace if required.",
    "Check for abnormal noise and vibration.",
    "Inspect and lubricate motor and blower bearings.",
    "Check thermostats, actuators, and 2-way/3-way valves.",
    "Test VAV actuators and damper operation.",
    "Check and record room temperatures.",
    "Inspect and lubricate pantry exhaust fans."
  ]
};
const REPORT_FIELDS = ["reportNumber", "serviceDate", "customerName", "siteName", "technicianName", "unitNumber", "modelNumber", "serialNumber", "refrigerant", "workCarriedOut", "materialsUsed", "quantity", "remarks", "jobCompletion"];
const FIELD_SESSION_SECONDS = 90 * 86400;
const FIELD_SESSION_RENEW_MS = 30 * 86400000;
const isoNow = () => new Date().toISOString();
const trim = (value, max = 500) => String(value ?? "").trim().slice(0, max);
const unique = values => [...new Set((Array.isArray(values) ? values : []).map(String))];
const sha = value => crypto.createHash("sha256").update(String(value)).digest("hex");
const random = () => crypto.randomUUID();
const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
  && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const validTime = value => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
const fail = (message, status = 400) => { const error = new Error(message); error.status = status; throw error; };
const find = (items, id) => items.find(item => item.id === id);
const dateOnly = value => String(value || "").slice(0, 10);

function planDates(start, end, count) {
  const first = Date.parse(`${start}T12:00:00Z`);
  const last = Date.parse(`${end}T12:00:00Z`);
  const span = Math.max(0, last - first);
  return Array.from({ length: count }, (_, index) => new Date(first + span * index / count).toISOString().slice(0, 10));
}

function nextNumber(store, key, prefix) {
  store.sequence[key] = Number(store.sequence[key] || 0) + 1;
  return `${prefix}-${String(new Date().getFullYear())}-${String(store.sequence[key]).padStart(4, "0")}`;
}

function reportNumberTaken(store, number, exceptId = "") {
  return store.reports.some(item => item.id !== exceptId && [item.number, item.extracted?.reportNumber]
    .some(value => trim(value, 100).toLowerCase() === number.toLowerCase()));
}

function nextReportNumber(store) {
  const year = String(new Date().getFullYear());
  const prefix = `SR-${year}-`;
  store.sequence.report = Math.max(Number(store.sequence.report || 0), ...store.reports.map(item =>
    String(item.number || "").startsWith(prefix) && /^\d+$/.test(String(item.number).slice(prefix.length))
      ? Number(String(item.number).slice(prefix.length)) : 0));
  let number;
  do { number = nextNumber(store, "report", "SR"); } while (reportNumberTaken(store, number));
  return number;
}

function nextContractNumber(store) {
  const highest = store.contracts.reduce((value, item) => {
    const match = String(item.number || "").match(/(\d+)$/);
    return match ? Math.max(value, Number(match[1])) : value;
  }, Number(store.sequence.contract || 0));
  store.sequence.contract = highest + 1;
  return `AMC-${String(new Date().getFullYear())}-${String(store.sequence.contract).padStart(4, "0")}`;
}

function addActivity(store, kind, targetId, actor, message) {
  store.activity.unshift({ id: random(), kind, targetId, actor: trim(actor, 100), message: trim(message, 500), createdAt: isoNow() });
  if (store.activity.length > 3000) store.activity.length = 3000;
}

function deleteWorkOrder(store, id) {
  const job = find(store.workOrders, id);
  if (!job) return null;
  const reportIds = new Set(store.reports.filter(item => item.workOrderId === id).map(item => item.id));
  const fileIds = new Set(store.files.filter(item => item.workOrderId === id).map(item => item.id));
  store.reports = store.reports.filter(item => !reportIds.has(item.id));
  store.files = store.files.filter(item => !fileIds.has(item.id));
  store.attendance = store.attendance.filter(item => item.workOrderId !== id);
  store.drafts = store.drafts.filter(item => item.workOrderId !== id);
  store.notifications = store.notifications.filter(item => item.workOrderId !== id);
  store.schedules = store.schedules.filter(item => item.workOrderId !== id && item.id !== job.scheduleId);
  store.workOrders = store.workOrders.filter(item => item.id !== id);
  store.visits.filter(item => item.workOrderId === id).forEach(item => Object.assign(item, { workOrderId: "", status: "Planned", completedAt: "" }));
  store.activity = store.activity.filter(item => !reportIds.has(item.targetId) && item.targetId !== id);
  return { job, reports: reportIds.size };
}

function createNotice(store, technicianId, workOrder, type, message) {
  const entry = { id: random(), technicianId, workOrderId: workOrder.id, type,
    title: type === "revision" ? "Report returned for revision" : type === "approved" ? "Report approved"
      : type === "rescheduled" ? "Maintenance job rescheduled" : type === "unassigned" ? "Maintenance assignment removed" : "Maintenance job assigned",
    message: trim(message, 250), status: "Queued", createdAt: isoNow(), attemptedAt: "", acknowledgedAt: "" };
  store.notifications.unshift(entry);
  return entry.id;
}

function publicState(store) {
  const { invites: _invites, subscriptions: _subscriptions, drafts: _drafts, ...visible } = store;
  return { ...visible, files: store.files.map(({ storedName: _storedName, ...file }) => file) };
}

function createMaintenanceApi(deps) {
  const {
    dataDir, supabase, supabaseTable, send, readJson, collect, parseMultipart, saveUpload, readUpload, deleteUpload,
    readSettings, PDFDocument
  } = deps;
  const storage = createMaintenanceStore({ dataDir, supabase, table: supabaseTable });
  const secret = () => process.env.FIELD_SESSION_SECRET || process.env.SESSION_SECRET || "";

  function cookies(req) {
    return Object.fromEntries(String(req.headers.cookie || "").split(";").map(part => part.trim()).filter(Boolean).map(part => {
      const index = part.indexOf("=");
      return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
    }));
  }

  function fieldToken(technicianId) {
    if (!secret()) fail("FIELD_SESSION_SECRET or SESSION_SECRET is required for technician access", 503);
    const issuedAt = Date.now();
    const payload = Buffer.from(JSON.stringify({ technicianId, issuedAt, exp: issuedAt + FIELD_SESSION_SECONDS * 1000 }), "utf8").toString("base64url");
    const signature = crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
    return `${payload}.${signature}`;
  }

  async function fieldUser(req) {
    const [payload, signature] = String(cookies(req).cz_field || "").split(".");
    if (!payload || !signature || !secret()) return null;
    const expected = crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
    if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
    let session;
    try { session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")); } catch { return null; }
    if (session.exp < Date.now()) return null;
    const state = await storage.read();
    const technician = find(state.technicians, session.technicianId);
    if (!technician || technician.active === false || (technician.accessRevokedAt && session.issuedAt <= Date.parse(technician.accessRevokedAt))) return null;
    return { technician, state, expiresAt: session.exp };
  }

  function secureCookie(req, value, maxAge = FIELD_SESSION_SECONDS) {
    const secure = req.headers["x-forwarded-proto"] === "https" || String(req.headers.host || "").includes("vercel.app");
    return `cz_field=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
  }

  function sameOrigin(req) {
    const origin = req.headers.origin;
    if (!origin) return;
    try {
      if (new URL(origin).host === req.headers.host) return;
    } catch {}
    fail("Cross-origin request blocked", 403);
  }

  const maintenanceCustomerId = name => `maintenance:${sha(name.toLocaleLowerCase("en-US")).slice(0, 20)}`;

  async function attemptPush(notificationId) {
    const state = await storage.read();
    const notice = find(state.notifications, notificationId);
    if (!notice || notice.status === "Sent" || notice.acknowledgedAt) return;
    const subscriptions = state.subscriptions.filter(item => item.technicianId === notice.technicianId);
    const workOrder = find(state.workOrders, notice.workOrderId);
    let status = "Not Subscribed";
    let detail = "No device subscription";
    const publicKey = process.env.VAPID_PUBLIC_KEY || "";
    const privateKey = process.env.VAPID_PRIVATE_KEY || "";
    if (subscriptions.length && webPush && publicKey && privateKey) {
      try {
        webPush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:info@comfortzoneuae.com", publicKey, privateKey);
        let sent = 0;
        const expired = [];
        for (const subscription of subscriptions) {
          try {
          await webPush.sendNotification(subscription.subscription, JSON.stringify({
            title: notice.title, body: workOrder ? `${workOrder.number} · ${workOrder.serviceDate} ${workOrder.startTime}` : "Open your field inbox for details",
            url: `/field/?workOrder=${encodeURIComponent(notice.workOrderId)}`
          }));
            sent += 1;
          } catch (error) {
            if ([404, 410].includes(error.statusCode)) expired.push(subscription.id);
            detail = trim(error.message || "Push delivery failed", 200);
          }
        }
        status = sent ? "Sent" : "Failed";
        if (sent) detail = `Accepted by ${sent} push service${sent === 1 ? "" : "s"}`;
        if (expired.length) await storage.mutate(next => { next.subscriptions = next.subscriptions.filter(item => !expired.includes(item.id)); });
      } catch (error) {
        status = "Failed";
        detail = trim(error.message || "Push configuration failed", 200);
      }
    } else if (subscriptions.length) {
      status = "Failed";
      detail = "Web push needs the web-push package and VAPID keys";
    }
    await storage.mutate(next => {
      const current = find(next.notifications, notificationId);
      if (current && !current.acknowledgedAt) Object.assign(current, { status, detail, attemptedAt: isoNow() });
      if (status === "Failed") addActivity(next, "notification", notificationId, "System", detail);
    });
  }

  async function deliver(ids) {
    for (const notificationId of ids) await attemptPush(notificationId).catch(error => console.error("Maintenance push:", error));
  }

  function requireDateRange(start, end) {
    if (!validDate(start) || !validDate(end) || end < start) fail("Enter a valid contract period");
  }

  function contractInput(body, existing = {}) {
    const number = Object.hasOwn(body, "number") ? trim(body.number, 100) : trim(existing.number, 100);
    if (existing.id && !number) fail("Enter an AMC number");
    const customerName = trim(body.customerName, 150);
    if (!customerName) fail("Enter a customer name");
    const startDate = trim(body.startDate, 10);
    const endDate = trim(body.endDate, 10);
    requireDateRange(startDate, endDate);
    const frequency = ["Monthly", "Quarterly", "Half-Yearly", "Custom"].includes(body.frequency) ? body.frequency : "Custom";
    const visitsPerYear = frequency === "Monthly" ? 12 : frequency === "Quarterly" ? 4 : frequency === "Half-Yearly" ? 2 : Number(body.visitsPerYear || 0);
    if (!Number.isInteger(visitsPerYear) || visitsPerYear < 1 || visitsPerYear > 52) fail("Visits per year must be between 1 and 52");
    const unitCount = Number(body.unitCount || 0);
    if (!Number.isInteger(unitCount) || unitCount < 1) fail("Enter the number of AC units");
    const site = trim(body.site, 200);
    const contact = trim(body.contact, 100);
    const phone = trim(body.phone, 50);
    if (!site) fail("Enter a site or location");
    const email = trim(body.email, 150);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      fail("Email is incomplete. Enter an address like name@example.com, or leave Email blank.");
    return { ...existing, ...(number ? { number } : {}), customerId: existing.customerName === customerName && existing.customerId
      ? existing.customerId : maintenanceCustomerId(customerName), customerName, site, contact, phone,
      email, startDate, endDate, frequency, visitsPerYear, unitCount,
      status: ["Active", "Paused", "Cancelled"].includes(body.status) ? body.status : "Active",
      contractValue: Number(body.contractValue || 0) || 0, notes: trim(body.notes, 4000),
      units: Array.isArray(body.units) ? body.units.slice(0, 100).map(unit => ({ reference: trim(unit.reference, 80), type: trim(unit.type, 80), quantity: Math.max(1, Number(unit.quantity || 1)), location: trim(unit.location, 120) })) : (existing.units || []) };
  }

  function validateSchedule(store, body, active) {
    const contract = body.contractId ? find(store.contracts, body.contractId) : null;
    if (body.contractId && !contract) fail("AMC contract not found");
    const customerName = contract?.customerName || trim(body.customerName, 150);
    if (!customerName) fail("Enter a customer name");
    const serviceDate = trim(body.serviceDate, 10);
    if (!validDate(serviceDate)) fail("Enter a valid service date");
    const startTime = trim(body.startTime, 5);
    const endTime = trim(body.endTime, 5);
    if (!validTime(startTime) || !validTime(endTime) || endTime <= startTime) fail("Enter a valid service time range");
    const workType = ["Preventive Maintenance", "Complaint / Repair", "Inspection", "Emergency Service", "Other"].includes(body.workType)
      ? body.workType : "Preventive Maintenance";
    const technicianIds = unique(body.technicianIds);
    if (active && (technicianIds.length < (workType === "Preventive Maintenance" ? 2 : 1) || technicianIds.length > 5))
      fail(workType === "Preventive Maintenance" ? "Assign 2 to 5 technicians" : "Assign 1 to 5 technicians");
    if (technicianIds.some(id => !find(store.technicians, id) || find(store.technicians, id).active === false)) fail("Select active technicians");
    const leadTechnicianId = trim(body.leadTechnicianId, 80);
    if (active && !technicianIds.includes(leadTechnicianId)) fail("Choose a lead from the assigned technicians");
    const visit = body.visitId ? find(store.visits, body.visitId) : null;
    if (body.visitId && (!visit || visit.contractId !== contract?.id)) fail("Selected PM visit does not belong to this AMC");
    if (visit && visit.workOrderId && visit.workOrderId !== active?.workOrderId) fail("This PM visit already has a work order", 409);
    if (active) {
      const conflict = store.workOrders.find(job => job.id !== active.workOrderId && !["Completed", "Cancelled"].includes(job.status)
        && job.serviceDate === serviceDate && job.startTime < endTime && startTime < job.endTime
        && technicianIds.some(id => job.technicianIds.includes(id)));
      if (conflict) fail(`Technician overlap with ${conflict.number} at ${conflict.site}`, 409);
    }
    const site = trim(body.site || contract?.site, 200);
    if (!site) fail("Enter a site or location");
    return { contractId: contract?.id || "", visitId: visit?.id || "", customerId: contract?.customerId
      || (active?.customerName === customerName && active.customerId ? active.customerId : maintenanceCustomerId(customerName)),
      customerName, site,
      contact: trim(body.contact || contract?.contact, 100), phone: trim(body.phone || contract?.phone, 50),
      workType, serviceDate, startTime, endTime, priority: ["Normal", "Urgent"].includes(body.priority) ? body.priority : "Normal",
      technicianIds, leadTechnicianId, instructions: trim(body.instructions, 4000) };
  }

  function workOrderFromSchedule(store, schedule, existing) {
    const now = isoNow();
    const base = existing || { id: random(), number: nextNumber(store, "workOrder", "WO"), createdAt: now };
    Object.assign(base, { scheduleId: schedule.id, contractId: schedule.contractId, visitId: schedule.visitId,
      customerId: schedule.customerId, customerName: schedule.customerName, site: schedule.site, contact: schedule.contact,
      phone: schedule.phone, workType: schedule.workType, serviceDate: schedule.serviceDate, startTime: schedule.startTime,
      endTime: schedule.endTime, priority: schedule.priority, technicianIds: schedule.technicianIds,
      leadTechnicianId: schedule.leadTechnicianId, instructions: schedule.instructions, status: existing?.status || "Scheduled", updatedAt: now });
    if (!existing) store.workOrders.unshift(base);
    return base;
  }

  async function routeOffice(req, res, url, user) {
    try {
      if (!user || !["admin", "mts"].includes(String(user.role).toLowerCase())) fail("Admin or MTS access required", 403);
      if (req.method !== "GET") sameOrigin(req);
      const parts = url.pathname.split("/").filter(Boolean).slice(2);
      if (req.method === "GET" && parts[0] === "summary") return send(res, 200, publicState(await storage.read()));

      if (req.method === "DELETE" && parts.length === 2 && ["contracts", "schedules", "work-orders", "technicians", "reports"].includes(parts[0])) {
        const deleted = await storage.mutate(store => {
          const [kind, id] = parts;
          const priorFiles = store.files;
          const finish = result => ({ ...result, removedUploads: priorFiles.filter(file => !store.files.some(current => current.id === file.id))
            .map(file => file.storedName).filter(Boolean) });
          if (kind === "contracts") {
            const item = find(store.contracts, id);
            if (!item) fail("AMC contract not found", 404);
            const jobs = store.workOrders.filter(job => job.contractId === id).map(job => job.id);
            jobs.forEach(jobId => deleteWorkOrder(store, jobId));
            store.schedules = store.schedules.filter(schedule => schedule.contractId !== id);
            store.visits = store.visits.filter(visit => visit.contractId !== id);
            store.files = store.files.filter(file => file.contractId !== id);
            store.contracts = store.contracts.filter(contract => contract.id !== id);
            store.activity = store.activity.filter(entry => entry.targetId !== id);
            addActivity(store, "deletion", id, user.name, `${item.number} deleted with ${jobs.length} linked work orders`);
            return finish({ label: item.number, linkedWorkOrders: jobs.length });
          }
          if (kind === "schedules") {
            const item = find(store.schedules, id);
            if (!item) fail("PM schedule not found", 404);
            const removed = item.workOrderId ? deleteWorkOrder(store, item.workOrderId) : null;
            store.schedules = store.schedules.filter(schedule => schedule.id !== id);
            store.activity = store.activity.filter(entry => entry.targetId !== id);
            addActivity(store, "deletion", id, user.name, `Schedule for ${item.customerName} deleted${removed ? ` with ${removed.job.number}` : ""}`);
            return finish({ label: item.customerName, linkedWorkOrders: removed ? 1 : 0 });
          }
          if (kind === "work-orders") {
            const removed = deleteWorkOrder(store, id);
            if (!removed) fail("Work order not found", 404);
            addActivity(store, "deletion", id, user.name, `${removed.job.number} deleted with ${removed.reports} service reports`);
            return finish({ label: removed.job.number, linkedReports: removed.reports });
          }
          if (kind === "technicians") {
            const item = find(store.technicians, id);
            if (!item) fail("Technician not found", 404);
            if (store.workOrders.some(job => job.technicianIds?.includes(id)) || store.schedules.some(schedule => schedule.technicianIds?.includes(id))
              || store.reports.some(report => report.submittedBy === id)
              || store.attendance.some(entry => entry.technicianId === id))
              fail("This technician has maintenance assignments or service history. Remove those records first, or disable the technician to preserve history.", 409);
            store.technicians = store.technicians.filter(technician => technician.id !== id);
            store.invites = store.invites.filter(invite => invite.technicianId !== id);
            store.subscriptions = store.subscriptions.filter(subscription => subscription.technicianId !== id);
            store.notifications = store.notifications.filter(notification => notification.technicianId !== id);
            store.drafts = store.drafts.filter(draft => draft.technicianId !== id);
            store.activity = store.activity.filter(entry => entry.targetId !== id);
            addActivity(store, "deletion", id, user.name, `Technician ${item.name} (${item.code}) deleted`);
            return finish({ label: item.name });
          }
          const item = find(store.reports, id);
          if (!item) fail("Service report not found", 404);
          store.reports = store.reports.filter(report => report.id !== id);
          const linked = find(store.workOrders, item.workOrderId);
          if (linked) {
            const onSite = store.attendance.some(entry => entry.workOrderId === linked.id && !entry.checkOutAt);
            Object.assign(linked, { status: onSite ? "On Site" : "Scheduled", completedAt: "", updatedAt: isoNow() });
            const visit = find(store.visits, linked.visitId);
            if (visit?.status === "Completed") Object.assign(visit, { status: "Scheduled", completedAt: "" });
            store.notifications = store.notifications.filter(notification => notification.workOrderId !== linked.id || !["approved", "revision"].includes(notification.type));
          }
          store.activity = store.activity.filter(entry => entry.targetId !== id);
          addActivity(store, "deletion", id, user.name, `${item.number} deleted`);
          return finish({ label: item.number });
        });
        for (const storedName of deleted.removedUploads) {
          if (deleteUpload) await deleteUpload("maintenance", storedName).catch(error => console.error("Maintenance upload cleanup:", error));
        }
        const { removedUploads: _removedUploads, ...result } = deleted;
        return send(res, 200, { ok: true, deleted: result });
      }

      if (parts[0] === "contracts" && parts.length === 1 && req.method === "POST") {
        const body = await readJson(req);
        const input = contractInput(body);
        const contract = await storage.mutate(store => {
          const now = isoNow();
          const item = { ...input, id: random(), number: nextContractNumber(store), createdAt: now, updatedAt: now };
          store.contracts.unshift(item);
          planDates(item.startDate, item.endDate, item.visitsPerYear).forEach((plannedDate, index) => {
            store.visits.push({ id: random(), contractId: item.id, sequence: index + 1, plannedDate, status: "Planned", workOrderId: "" });
          });
          addActivity(store, "contract", item.id, user.name, `${item.number} created with ${item.visitsPerYear} planned visits`);
          return item;
        });
        return send(res, 201, contract);
      }

      if (parts[0] === "contracts" && parts.length === 2 && req.method === "PUT") {
        const body = await readJson(req);
        const result = await storage.mutate(store => {
          const contract = find(store.contracts, parts[1]);
          if (!contract) fail("AMC contract not found", 404);
          const input = contractInput(body, contract);
          if (store.contracts.some(item => item.id !== contract.id
            && String(item.number || "").toLocaleLowerCase("en-US") === input.number.toLocaleLowerCase("en-US")))
            fail("This AMC number is already in use", 409);
          if (input.visitsPerYear !== contract.visitsPerYear || input.startDate !== contract.startDate || input.endDate !== contract.endDate) {
            const visits = store.visits.filter(item => item.contractId === contract.id);
            if (visits.some(item => item.workOrderId || item.status !== "Planned")) fail("Existing scheduled visits must be completed before changing the visit plan", 409);
            store.visits = store.visits.filter(item => item.contractId !== contract.id);
            planDates(input.startDate, input.endDate, input.visitsPerYear).forEach((plannedDate, index) => {
              store.visits.push({ id: random(), contractId: contract.id, sequence: index + 1, plannedDate, status: "Planned", workOrderId: "" });
            });
          }
          Object.assign(contract, input, { updatedAt: isoNow() });
          addActivity(store, "contract", contract.id, user.name, `${contract.number} updated`);
          return contract;
        });
        return send(res, 200, result);
      }

      if (parts[0] === "schedules" && parts.length === 1 && req.method === "POST") {
        const body = await readJson(req);
        const published = body.mode === "notify";
        const noticeIds = [];
        const result = await storage.mutate(store => {
          const current = body.id ? find(store.schedules, body.id) : store.schedules.find(item => item.clientKey && item.clientKey === body.clientKey);
          if (body.id && !current) fail("Schedule not found", 404);
          const linked = current?.workOrderId ? find(store.workOrders, current.workOrderId) : null;
          if (linked && ["Report Submitted", "Completed"].includes(linked.status)) fail("Work orders with submitted reports cannot be rescheduled", 409);
          const input = validateSchedule(store, body, published ? (current || {}) : null);
          const now = isoNow();
          const priorDate = current?.serviceDate;
          const previousIds = [...(current?.technicianIds || [])];
          const priorTechnicians = JSON.stringify(current?.technicianIds || []);
          if (!published && linked) fail("Published schedules cannot be returned to draft", 409);
          const schedule = current || { id: random(), clientKey: trim(body.clientKey, 100) || random(), createdAt: now };
          if (current?.visitId && current.visitId !== input.visitId) {
            const previousVisit = find(store.visits, current.visitId);
            if (previousVisit && previousVisit.workOrderId === current.workOrderId) Object.assign(previousVisit, { workOrderId: "", status: "Planned" });
          }
          Object.assign(schedule, input, { status: published ? "Scheduled" : "Draft", updatedAt: now });
          if (!current) store.schedules.unshift(schedule);
          if (published) {
            const job = workOrderFromSchedule(store, schedule, linked);
            schedule.workOrderId = job.id;
            if (schedule.visitId) {
              const visit = find(store.visits, schedule.visitId);
              Object.assign(visit, { workOrderId: job.id, plannedDate: schedule.serviceDate, status: "Scheduled" });
            }
            const type = priorDate && priorDate !== schedule.serviceDate ? "rescheduled" : "assigned";
            if (!current || priorDate !== schedule.serviceDate || priorTechnicians !== JSON.stringify(input.technicianIds)) {
              schedule.technicianIds.forEach(technicianId => noticeIds.push(createNotice(store, technicianId, job, type,
                `${job.number} | ${job.customerName} - ${job.site} | ${job.serviceDate} ${job.startTime}`)));
              previousIds.filter(id => !schedule.technicianIds.includes(id)).forEach(id => noticeIds.push(createNotice(store, id, job, "unassigned",
                `${job.number} assignment has been removed`)));
            }
            addActivity(store, "workOrder", job.id, user.name, linked ? `${job.number} updated` : `${job.number} scheduled`);
          } else {
            addActivity(store, "schedule", schedule.id, user.name, "Schedule draft saved");
          }
          return { schedule, workOrder: schedule.workOrderId ? find(store.workOrders, schedule.workOrderId) : null };
        });
        await deliver(noticeIds);
        return send(res, currentStatus(result.schedule), result);
      }

      if (parts[0] === "technicians" && parts.length === 1 && req.method === "POST") {
        const body = await readJson(req);
        const technician = await storage.mutate(store => {
          const name = trim(body.name, 100), phone = trim(body.phone, 50);
          if (!name || !phone) fail("Technician name and phone are required");
          const code = trim(body.code, 50) || nextNumber(store, "technician", "TCH");
          if (store.technicians.some(item => item.code === code)) fail("Technician ID already exists", 409);
          const item = { id: random(), code, name, phone, email: trim(body.email, 150), notes: trim(body.notes, 2000), active: true, offDuty: false, createdAt: isoNow() };
          store.technicians.push(item);
          addActivity(store, "technician", item.id, user.name, `${item.name} added`);
          return item;
        });
        return send(res, 201, technician);
      }

      if (parts[0] === "technicians" && parts.length === 2 && req.method === "PUT") {
        const body = await readJson(req);
        const technician = await storage.mutate(store => {
          const item = find(store.technicians, parts[1]);
          if (!item) fail("Technician not found", 404);
          const name = trim(body.name, 100), phone = trim(body.phone, 50), code = trim(body.code, 50);
          if (!name || !phone || !code) fail("Name, phone and technician ID are required");
          if (store.technicians.some(other => other.id !== item.id && other.code === code)) fail("Technician ID already exists", 409);
          Object.assign(item, { name, phone, code, email: trim(body.email, 150), notes: trim(body.notes, 2000),
            active: body.active !== false, offDuty: body.offDuty === true, updatedAt: isoNow() });
          if (!item.active) item.accessRevokedAt = isoNow();
          addActivity(store, "technician", item.id, user.name, `${item.name} updated`);
          return item;
        });
        return send(res, 200, technician);
      }

      if (parts[0] === "technicians" && parts[2] === "access" && req.method === "POST") {
        if (!secret()) fail("Set FIELD_SESSION_SECRET or SESSION_SECRET before issuing technician access", 503);
        const token = crypto.randomBytes(32).toString("base64url");
        const result = await storage.mutate(store => {
          const technician = find(store.technicians, parts[1]);
          if (!technician || !technician.active) fail("Active technician not found", 404);
          store.invites = store.invites.filter(item => item.technicianId !== technician.id || item.usedAt);
          store.invites.push({ id: random(), technicianId: technician.id, tokenHash: sha(token), createdAt: isoNow(),
            expiresAt: new Date(Date.now() + 48 * 3600000).toISOString(), usedAt: "" });
          addActivity(store, "technician", technician.id, user.name, "Secure field access link created");
          return technician;
        });
        const protocol = req.headers["x-forwarded-proto"] || (String(req.headers.host || "").startsWith("127.") ? "http" : "https");
        return send(res, 200, { technicianId: result.id, expiresInHours: 48,
          link: `${protocol}://${req.headers.host}/field/?access=${encodeURIComponent(token)}` });
      }

      if (parts[0] === "technicians" && parts[2] === "revoke" && req.method === "POST") {
        await storage.mutate(store => {
          const technician = find(store.technicians, parts[1]);
          if (!technician) fail("Technician not found", 404);
          technician.accessRevokedAt = isoNow();
          store.invites = store.invites.filter(item => item.technicianId !== technician.id);
          store.subscriptions = store.subscriptions.filter(item => item.technicianId !== technician.id);
          addActivity(store, "technician", technician.id, user.name, "Field access revoked");
        });
        return send(res, 200, { ok: true });
      }

      if (parts[0] === "notifications" && parts[2] === "retry" && req.method === "POST") {
        const notice = find((await storage.read()).notifications, parts[1]);
        if (!notice) fail("Notification not found", 404);
        await attemptPush(notice.id);
        return send(res, 200, { ok: true });
      }

      if (parts[0] === "reports" && parts[1] === "upload" && parts.length === 2 && req.method === "POST") {
        const file = await acceptFile(req, { kind: "original" });
        const extraction = await extractHandwritten(file);
        await storage.mutate(store => { store.files.unshift(file); });
        return send(res, 201, { file: publicFile(file), ...extraction });
      }

      if (parts[0] === "reports" && parts.length === 1 && req.method === "POST") {
        const body = await readJson(req);
        const item = await storage.mutate(store => {
          const workOrderId = trim(body.workOrderId, 80);
          const job = workOrderId ? find(store.workOrders, workOrderId) : null;
          if (workOrderId && !job) fail("Work order not found", 404);
          const file = find(store.files, trim(body.fileId, 80));
          if (!file || file.kind !== "original" || file.workOrderId || store.reports.some(report => report.originalFileId === file.id)) fail("Uploaded service report was not found or is already linked", 409);
          const prior = job ? store.reports.find(report => report.workOrderId === job.id) : null;
          if (prior && !["Revision", "Rejected"].includes(prior.status)) fail("A report is already awaiting review", 409);
          const now = isoNow();
          const extracted = Object.fromEntries(REPORT_FIELDS.map(key => [key, trim(body.extracted?.[key], 1000)]));
          const details = { workCarriedOut: trim(body.details?.workCarriedOut || extracted.workCarriedOut, 4000),
            materialsUsed: trim(body.details?.materialsUsed || extracted.materialsUsed, 2000),
            remarks: trim(body.details?.remarks || extracted.remarks, 4000),
            customerName: trim(body.details?.customerName || extracted.customerName || job?.customerName, 100) };
          const requestedNumber = trim(extracted.reportNumber, 100);
          if (!prior && requestedNumber && reportNumberTaken(store, requestedNumber)) fail("Service Report Number already exists", 409);
          const report = prior || { id: random(), number: requestedNumber || nextReportNumber(store), workOrderId: job?.id || "",
            contractId: job?.contractId || "", visitId: job?.visitId || "", createdAt: now, history: [], versions: [] };
          extracted.reportNumber = report.number;
          if (prior) report.versions.push({ submittedAt: prior.submittedAt, type: prior.type, details: prior.details,
            checklist: prior.checklist, fileIds: prior.fileIds, extracted: prior.extracted, reviewReason: prior.reviewReason });
          Object.assign(file, { workOrderId: job?.id || "", technicianId: "" });
          Object.assign(report, { type: "Handwritten Upload", details, checklist: {}, extracted, fileIds: [file.id],
            originalFileId: file.id, signatureFileId: "", status: "Pending Review", submittedAt: now,
            submittedBy: user.name, reviewReason: "" });
          report.history.push({ at: now, actor: user.name, action: prior ? "Resubmitted" : "Submitted" });
          if (!prior) store.reports.unshift(report);
          if (job) {
            job.status = "Report Submitted";
            job.updatedAt = now;
            addActivity(store, "workOrder", job.id, user.name, `${report.number} uploaded for office review`);
          } else {
            addActivity(store, "report", report.id, user.name, `${report.number} uploaded for office review`);
          }
          return report;
        });
        return send(res, 201, item);
      }

      if (parts[0] === "reports" && parts.length === 2 && req.method === "PUT") {
        const body = await readJson(req);
        const item = await storage.mutate(store => {
          const report = find(store.reports, parts[1]);
          if (!report) fail("Service report not found", 404);
          if (report.status === "Approved") fail("Approved reports cannot be edited", 409);
          const workOrderId = Object.hasOwn(body, "workOrderId") ? trim(body.workOrderId, 80) : report.workOrderId;
          const job = workOrderId ? find(store.workOrders, workOrderId) : null;
          if (workOrderId && !job) fail("Work order not found", 404);
          const contractId = Object.hasOwn(body, "contractId") ? trim(body.contractId, 80) : (job?.contractId || report.contractId || "");
          if (contractId && !find(store.contracts, contractId)) fail("AMC contract not found", 404);
          if (workOrderId !== report.workOrderId) {
            if (report.type !== "Handwritten Upload") fail("Only uploaded service reports can change work orders", 409);
            if (job?.status === "Completed") fail("Completed work orders cannot be linked", 409);
            if (job && store.reports.some(other => other.id !== report.id && other.workOrderId === job.id))
              fail("This work order already has a service report", 409);
            const previousJob = find(store.workOrders, report.workOrderId);
            if (previousJob) {
              const onSite = store.attendance.some(entry => entry.workOrderId === previousJob.id && !entry.checkOutAt);
              Object.assign(previousJob, { status: onSite ? "On Site" : "Scheduled", completedAt: "", updatedAt: isoNow() });
            }
            for (const fileId of report.fileIds || []) {
              const file = find(store.files, fileId);
              if (file) file.workOrderId = job?.id || "";
            }
            if (job) Object.assign(job, { status: "Report Submitted", updatedAt: isoNow() });
          }
          const extracted = Object.fromEntries(REPORT_FIELDS.map(key => [key, trim(body.extracted?.[key], 1000)]));
          const number = Object.hasOwn(body.extracted || {}, "reportNumber") ? trim(extracted.reportNumber, 100) : report.number;
          if (!number) fail("Enter a Service Report Number");
          if (reportNumberTaken(store, number, report.id)) fail("Service Report Number already exists", 409);
          extracted.reportNumber = number;
          const details = { workCarriedOut: trim(body.details?.workCarriedOut, 4000), materialsUsed: trim(body.details?.materialsUsed, 2000),
            remarks: trim(body.details?.remarks, 4000),
            customerName: trim(body.details?.customerName || extracted.customerName || job?.customerName, 100) };
          Object.assign(report, { number, workOrderId: job?.id || "", contractId, visitId: job?.visitId || "",
            extracted, details, updatedAt: isoNow() });
          report.history ||= [];
          report.history.push({ at: isoNow(), actor: user.name, action: "Details updated" });
          addActivity(store, "report", report.id, user.name, `${report.number} details updated`);
          return report;
        });
        return send(res, 200, item);
      }

      if (parts[0] === "reports" && parts[2] === "review" && req.method === "POST") {
        const body = await readJson(req);
        const noticeIds = [];
        const report = await storage.mutate(store => {
          const item = find(store.reports, parts[1]);
          if (!item) fail("Service report not found", 404);
          const job = item.workOrderId ? find(store.workOrders, item.workOrderId) : null;
          if (item.workOrderId && !job) fail("Linked work order not found", 409);
          if (item.status === "Approved") fail("Approved reports cannot be changed", 409);
          if (!["Approved", "Revision", "Rejected"].includes(body.decision)) fail("Choose a review decision");
          if (body.decision !== "Approved" && !trim(body.reason, 1000)) fail("Enter a reason for revision or rejection");
          Object.assign(item, { status: body.decision, reviewReason: trim(body.reason, 1000), reviewedBy: user.name, reviewedAt: isoNow() });
          if (job) {
            if (body.decision === "Approved") {
              job.status = "Completed";
              job.completedAt = isoNow();
              const visit = find(store.visits, job.visitId);
              if (visit) Object.assign(visit, { status: "Completed", completedAt: job.completedAt });
            } else {
              job.status = "Report Submitted";
            }
            job.updatedAt = isoNow();
          }
          item.history = item.history || [];
          item.history.push({ at: isoNow(), actor: user.name, action: body.decision, reason: item.reviewReason });
          if (job?.leadTechnicianId) noticeIds.push(createNotice(store, job.leadTechnicianId, job, body.decision === "Approved" ? "approved" : "revision",
            `${job.number} report ${body.decision.toLowerCase()}${item.reviewReason ? `: ${item.reviewReason}` : ""}`));
          addActivity(store, "report", item.id, user.name, `${item.number} ${body.decision.toLowerCase()}`);
          return item;
        });
        await deliver(noticeIds);
        return send(res, 200, report);
      }

      if (parts[0] === "reports" && parts[2] === "pdf" && req.method === "GET") {
        return reportPdf(res, parts[1]);
      }

      if (parts[0] === "files" && parts[1] && req.method === "GET") {
        const file = find((await storage.read()).files, parts[1]);
        if (!file) fail("File not found", 404);
        return serveFile(res, file);
      }

      if (parts[0] === "contracts" && parts[2] === "files" && req.method === "POST") {
        const contract = find((await storage.read()).contracts, parts[1]);
        if (!contract) fail("Contract not found", 404);
        const file = await acceptFile(req, { contractId: contract.id, kind: "contract" });
        await storage.mutate(store => { store.files.push(file); addActivity(store, "contract", contract.id, user.name, "Contract document uploaded"); });
        return send(res, 201, publicFile(file));
      }

      return send(res, 404, { error: "Maintenance route not found" });
    } catch (error) {
      return send(res, error.status || 500, { error: error.message || "Maintenance error" });
    }
  }

  function currentStatus(schedule) { return schedule.createdAt === schedule.updatedAt ? 201 : 200; }

  function publicFile(file) {
    const { storedName: _storedName, ...visible } = file;
    return visible;
  }

  async function acceptFile(req, target) {
    const limit = 12 * 1024 * 1024;
    if (Number(req.headers["content-length"] || 0) > limit + 4096) fail("File exceeds the 12 MB limit", 413);
    let buffer;
    if (req.body !== undefined || req.rawBody !== undefined) buffer = await collect(req);
    else {
      const chunks = [];
      let length = 0;
      for await (const chunk of req) {
        length += chunk.length;
        if (length > limit + 4096) fail("File exceeds the 12 MB limit", 413);
        chunks.push(chunk);
      }
      buffer = Buffer.concat(chunks);
    }
    if (buffer.length > limit + 4096) fail("File exceeds the 12 MB limit", 413);
    const part = parseMultipart(buffer, String(req.headers["content-type"] || "")).find(item => item.filename);
    if (!part || !part.body.length) fail("Choose a file to upload");
    const bytes = part.body;
    let mimeType = "";
    let extension = "";
    if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) { mimeType = "image/png"; extension = ".png"; }
    else if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) { mimeType = "image/jpeg"; extension = ".jpg"; }
    else if (bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") { mimeType = "image/webp"; extension = ".webp"; }
    else if (bytes.toString("ascii", 0, 5) === "%PDF-") { mimeType = "application/pdf"; extension = ".pdf"; }
    if (!mimeType || (target.kind !== "contract" && target.kind !== "original" && mimeType === "application/pdf")) fail("Use PNG, JPEG, WebP, or PDF where supported");
    const file = { id: random(), kind: target.kind, contractId: target.contractId || "", workOrderId: target.workOrderId || "",
      technicianId: target.technicianId || "", originalName: path.basename(part.filename).replace(/[\r\n"\\]/g, "").slice(0, 180),
      storedName: `${random()}${extension}`, mimeType, size: bytes.length, createdAt: isoNow() };
    await saveUpload("maintenance", file.storedName, bytes, mimeType);
    return file;
  }

  async function serveFile(res, file) {
    const bytes = await readUpload("maintenance", file.storedName);
    if (!bytes) fail("File is unavailable", 404);
    res.writeHead(200, { "Content-Type": file.mimeType, "Content-Length": bytes.length,
      "Content-Disposition": `${file.mimeType === "application/pdf" ? "attachment" : "inline"}; filename="${file.originalName}"`,
      "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" });
    return res.end(bytes);
  }

  async function reportPdf(res, reportId) {
    if (!PDFDocument) fail("PDF generation is unavailable", 503);
    const store = await storage.read();
    const report = find(store.reports, reportId);
    if (!report) fail("Report not found", 404);
    const job = find(store.workOrders, report.workOrderId);
    const settings = await readSettings();
    const doc = new PDFDocument({ margin: 44, size: "A4" });
    const chunks = [];
    doc.on("data", chunk => chunks.push(chunk));
    const done = new Promise((resolve, reject) => { doc.on("end", resolve); doc.on("error", reject); });
    const logo = path.join(__dirname, "public", "assets", "cz-logo.png");
    if (fs.existsSync(logo)) { try { doc.image(logo, 44, 42, { fit: [50, 50] }); } catch {} }
    doc.font("Helvetica-Bold").fontSize(16).fillColor("#101d38").text(settings.company?.name || "Comfort Zone AC Devices Tr. LLC", 104, 47);
    doc.font("Helvetica").fontSize(9).fillColor("#64748b").text("Maintenance Service Report", 104, 69);
    doc.moveDown(4);
    doc.strokeColor("#dbe5f1").moveTo(44, 105).lineTo(550, 105).stroke();
    doc.font("Helvetica-Bold").fontSize(14).fillColor("#101d38").text(report.number, 44, 122);
    doc.font("Helvetica").fontSize(9).fillColor("#475569");
    const rows = [
      ["Work order", job?.number || "Not linked"], ["Status", report.status],
      ["Customer", job?.customerName || report.details?.customerName || report.extracted?.customerName],
      ["Site", job?.site || report.extracted?.siteName],
      ["Service date", job?.serviceDate || report.extracted?.serviceDate],
      ["Time", job?.startTime && job?.endTime ? `${job.startTime} - ${job.endTime}` : ""],
      ["Service type", job?.workType || report.type],
      ["Technicians", job ? job.technicianIds.map(id => find(store.technicians, id)?.name || "").filter(Boolean).join(", ") : report.extracted?.technicianName],
      ["Lead technician", job ? find(store.technicians, job.leadTechnicianId)?.name || "" : ""],
      ["Submitted", dateOnly(report.submittedAt)]
    ];
    let y = 154;
    rows.forEach(([label, value]) => {
      doc.font("Helvetica-Bold").text(`${label}:`, 44, y, { width: 115 });
      doc.font("Helvetica").text(String(value || "-"), 160, y, { width: 380 });
      y = Math.max(doc.y, y + 16) + 3;
    });
    const section = (label, value) => {
      doc.moveDown(0.5).font("Helvetica-Bold").fontSize(10).fillColor("#0b449f").text(label);
      doc.font("Helvetica").fontSize(9).fillColor("#26354f").text(String(value || "-"), { lineGap: 3 });
    };
    section("Work Description", report.details?.workCarriedOut);
    section("Materials used", report.details?.materialsUsed);
    section("Remarks", report.details?.remarks);
    if (report.type === "Digital Checklist") {
      doc.moveDown().font("Helvetica-Bold").fontSize(10).fillColor("#0b449f").text("AC Maintenance Checklist");
      if (report.checklist?.maintenance) {
        for (const [index, label] of CHECKLIST.maintenance.entries()) {
          const item = report.checklist.maintenance[label] || {};
          doc.font("Helvetica").fontSize(8).text(`${index + 1}. ${label} ${item.value || "-"}`);
        }
      } else {
        for (const [group, entries] of Object.entries(report.checklist || {})) {
          doc.moveDown(0.3).font("Helvetica-Bold").fillColor("#101d38").text(group === "indoor" ? "Indoor unit" : group === "outdoor" ? "Outdoor unit" : group);
          for (const [label, item] of Object.entries(entries || {})) {
            doc.font("Helvetica").fontSize(8).text(`${label}: ${item.value || "-"}${item.note ? ` - ${item.note}` : ""}`);
          }
        }
      }
    } else {
      section("Handwritten report details", REPORT_FIELDS.map(key => `${key}: ${report.extracted?.[key] || "-"}`).join("\n"));
    }
    const attachments = (report.fileIds || []).map(id => find(store.files, id)).filter(Boolean);
    for (const file of attachments.filter(item => item.mimeType.startsWith("image/")).slice(0, 8)) {
      const bytes = await readUpload("maintenance", file.storedName);
      if (!bytes) continue;
      doc.addPage();
      doc.font("Helvetica-Bold").fontSize(11).fillColor("#101d38").text(file.kind === "signature" ? "Customer signature" : file.kind === "original" ? "Original handwritten report" : "Service photo");
      try { doc.image(bytes, 44, 82, { fit: [505, 680] }); } catch { doc.font("Helvetica").text("Image could not be embedded."); }
    }
    doc.end();
    await done;
    const pdf = Buffer.concat(chunks);
    res.writeHead(200, { "Content-Type": "application/pdf", "Content-Length": pdf.length,
      "Content-Disposition": `attachment; filename="${report.number}.pdf"`, "Cache-Control": "private, no-store" });
    return res.end(pdf);
  }

  function assignedJob(store, technicianId, workOrderId) {
    const job = find(store.workOrders, workOrderId);
    if (!job || !job.technicianIds.includes(technicianId)) fail("Work order not found", 404);
    return job;
  }

  function fieldJobView(store, job, technicianId) {
    const contract = find(store.contracts, job.contractId);
    return { ...job, contractNumber: contract?.number || "",
      technicians: job.technicianIds.map(id => find(store.technicians, id)).filter(Boolean).map(item => ({ id: item.id, name: item.name, code: item.code })),
      attendance: store.attendance.filter(item => item.workOrderId === job.id),
      report: store.reports.find(item => item.workOrderId === job.id) || null,
      draft: job.leadTechnicianId === technicianId ? store.drafts.find(item => item.workOrderId === job.id)?.data || null : null,
      files: store.files.filter(item => item.workOrderId === job.id).map(publicFile),
      activity: store.activity.filter(item => item.targetId === job.id).slice(0, 20) };
  }

  async function extractHandwritten(file) {
    if (!process.env.OPENAI_API_KEY) return { available: false, fields: {}, message: "AI extraction is not configured. Review the original and enter details manually." };
    const bytes = await readUpload("maintenance", file.storedName);
    if (!bytes) fail("Original report file is unavailable", 404);
    const dataUrl = `data:${file.mimeType};base64,${bytes.toString("base64")}`;
    const content = [{ type: "input_text", text: "Extract only fields clearly visible in this HVAC service report. Use YYYY-MM-DD for serviceDate when the date is clear. Return empty strings for missing or unreadable fields. Never infer or invent values. Keep uncertain fields empty. Return JSON only." },
      file.mimeType === "application/pdf" ? { type: "input_file", filename: file.originalName, file_data: dataUrl } : { type: "input_image", image_url: dataUrl }];
    const schema = { type: "object", additionalProperties: false,
      properties: Object.fromEntries(REPORT_FIELDS.map(field => [field, { type: "string" }])), required: REPORT_FIELDS };
    try {
      const response = await fetch("https://api.openai.com/v1/responses", { method: "POST",
        headers: { "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: process.env.OPENAI_MODEL || "gpt-4.1-mini", input: [{ role: "user", content }],
          text: { format: { type: "json_schema", name: "maintenance_report_extract", strict: true, schema } } }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) return { available: false, fields: {}, message: result.error?.message || "AI extraction failed. Enter details manually." };
      const text = result.output_text || (result.output || []).flatMap(item => item.content || []).filter(item => item.type === "output_text").map(item => item.text).join("");
      try { return { available: true, fields: JSON.parse(text), message: "Review every extracted field before submitting." }; }
      catch { return { available: false, fields: {}, message: "AI extraction could not be read. Enter details manually." }; }
    } catch { return { available: false, fields: {}, message: "AI extraction is unavailable. Enter details manually." }; }
  }

  async function routeField(req, res, url) {
    try {
      if (req.method !== "GET") sameOrigin(req);
      const parts = url.pathname.split("/").filter(Boolean).slice(2);
      if (parts[0] === "access" && req.method === "POST") {
        if (!secret()) fail("FIELD_SESSION_SECRET or SESSION_SECRET is required for technician access", 503);
        const body = await readJson(req);
        const tokenHash = sha(trim(body.token, 200));
        const technician = await storage.mutate(store => {
          const invite = store.invites.find(item => item.tokenHash === tokenHash && !item.usedAt && Date.parse(item.expiresAt) > Date.now());
          if (!invite) fail("Access link is invalid or expired", 401);
          const item = find(store.technicians, invite.technicianId);
          if (!item || !item.active) fail("Technician access is unavailable", 403);
          invite.usedAt = isoNow();
          addActivity(store, "technician", item.id, item.name, "Field access activated");
          return item;
        });
        const token = fieldToken(technician.id);
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Set-Cookie": secureCookie(req, token), "Cache-Control": "no-store" });
        return res.end(JSON.stringify({ technician: { id: technician.id, name: technician.name, code: technician.code } }));
      }
      if (parts[0] === "logout" && req.method === "POST") {
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Set-Cookie": secureCookie(req, "", 0), "Cache-Control": "no-store" });
        return res.end(JSON.stringify({ ok: true }));
      }
      const auth = await fieldUser(req);
      if (!auth) fail("Technician access expired. Request a new link from the office.", 401);
      if (auth.expiresAt - Date.now() <= FIELD_SESSION_RENEW_MS) {
        res.setHeader("Set-Cookie", secureCookie(req, fieldToken(auth.technician.id)));
        res.setHeader("Cache-Control", "no-store");
      }
      const technicianId = auth.technician.id;
      if (parts[0] === "me" && req.method === "GET") {
        const state = auth.state;
        return send(res, 200, { technician: { id: technicianId, name: auth.technician.name, code: auth.technician.code },
          notifications: state.notifications.filter(item => item.technicianId === technicianId).slice(0, 80),
          pushPublicKey: process.env.VAPID_PUBLIC_KEY || "", checklist: CHECKLIST });
      }
      if (parts[0] === "reports" && parts[1] === "upload" && parts.length === 2 && req.method === "POST") {
        const file = await acceptFile(req, { kind: "original", technicianId });
        const extraction = await extractHandwritten(file);
        await storage.mutate(store => { store.files.unshift(file); });
        return send(res, 201, { file: publicFile(file), ...extraction });
      }
      if (parts[0] === "reports" && parts.length === 1 && req.method === "POST") {
        const body = await readJson(req);
        const report = await storage.mutate(store => {
          const file = find(store.files, trim(body.fileId, 80));
          if (!file || file.kind !== "original" || file.technicianId !== technicianId || file.workOrderId
            || store.reports.some(item => item.originalFileId === file.id)) fail("Uploaded service report was not found or is already submitted", 409);
          const extracted = Object.fromEntries(REPORT_FIELDS.map(key => [key, trim(body.extracted?.[key], 1000)]));
          const requestedNumber = trim(extracted.reportNumber, 100);
          if (requestedNumber && reportNumberTaken(store, requestedNumber)) fail("Service Report Number already exists", 409);
          const now = isoNow();
          const number = requestedNumber || nextReportNumber(store);
          extracted.reportNumber = number;
          const details = { workCarriedOut: trim(body.details?.workCarriedOut || extracted.workCarriedOut, 4000),
            materialsUsed: trim(body.details?.materialsUsed || extracted.materialsUsed, 2000),
            remarks: trim(body.details?.remarks || extracted.remarks, 4000),
            customerName: trim(body.details?.customerName || extracted.customerName, 100) };
          const item = { id: random(), number, workOrderId: "", contractId: "", visitId: "", createdAt: now,
            type: "Handwritten Upload", details, checklist: {}, extracted, fileIds: [file.id], originalFileId: file.id,
            signatureFileId: "", status: "Pending Review", submittedAt: now, submittedBy: technicianId,
            reviewReason: "", history: [{ at: now, actor: auth.technician.name, action: "Submitted" }], versions: [] };
          store.reports.unshift(item);
          addActivity(store, "report", item.id, auth.technician.name, `${item.number} uploaded for office review`);
          return item;
        });
        return send(res, 201, report);
      }
      if (parts[0] === "work-orders" && parts.length === 1 && req.method === "GET") {
        return send(res, 200, auth.state.workOrders.filter(item => item.technicianIds.includes(technicianId))
          .sort((a, b) => a.serviceDate.localeCompare(b.serviceDate)).map(item => ({ id: item.id, number: item.number,
            customerName: item.customerName, site: item.site, serviceDate: item.serviceDate, startTime: item.startTime,
            endTime: item.endTime, workType: item.workType, status: item.status, lead: item.leadTechnicianId === technicianId })));
      }
      if (parts[0] === "work-orders" && parts[1] && parts.length === 2 && req.method === "GET") {
        const job = assignedJob(auth.state, technicianId, parts[1]);
        return send(res, 200, fieldJobView(auth.state, job, technicianId));
      }
      if (parts[0] === "work-orders" && parts[2] === "attendance" && req.method === "POST") {
        const body = await readJson(req);
        const entry = await storage.mutate(store => {
          const job = assignedJob(store, technicianId, parts[1]);
          if (job.status === "Completed") fail("This work order is completed", 409);
          const open = store.attendance.find(item => item.workOrderId === job.id && item.technicianId === technicianId && !item.checkOutAt);
          if (body.action === "checkIn") {
            if (open) return open;
            const item = { id: random(), workOrderId: job.id, technicianId, site: job.site, checkInAt: isoNow(), checkOutAt: "" };
            store.attendance.push(item);
            if (job.status === "Scheduled") job.status = "On Site";
            job.updatedAt = isoNow();
            addActivity(store, "workOrder", job.id, auth.technician.name, "Checked in at site");
            return item;
          }
          if (body.action === "checkOut") {
            if (!open) fail("Check in before checking out", 409);
            open.checkOutAt = isoNow();
            addActivity(store, "workOrder", job.id, auth.technician.name, "Checked out from site");
            return open;
          }
          fail("Choose check in or check out");
        });
        return send(res, 200, entry);
      }
      if (parts[0] === "work-orders" && parts[2] === "draft" && req.method === "PUT") {
        const body = await readJson(req);
        await storage.mutate(store => {
          const job = assignedJob(store, technicianId, parts[1]);
          if (job.leadTechnicianId !== technicianId) fail("Only the lead technician can prepare the report", 403);
          if (job.status === "Completed") fail("Completed jobs cannot be edited", 409);
          const data = { type: body.type === "Handwritten Upload" ? "Handwritten Upload" : "Digital Checklist",
            checklist: body.checklist || {}, details: body.details || {}, fileIds: unique(body.fileIds),
            signatureFileId: trim(body.signatureFileId, 80), originalFileId: trim(body.originalFileId, 80), extracted: body.extracted || {} };
          if (JSON.stringify(data).length > 40000) fail("Report draft is too large", 413);
          const current = store.drafts.find(item => item.workOrderId === job.id);
          if (current) Object.assign(current, { data, updatedAt: isoNow() });
          else store.drafts.push({ workOrderId: job.id, technicianId, data, updatedAt: isoNow() });
        });
        return send(res, 200, { ok: true });
      }
      if (parts[0] === "work-orders" && parts[2] === "files" && req.method === "POST") {
        const job = assignedJob(auth.state, technicianId, parts[1]);
        const kind = ["photo", "original", "signature"].includes(url.searchParams.get("kind")) ? url.searchParams.get("kind") : "photo";
        if ((job.leadTechnicianId !== technicianId && kind !== "original") || job.status === "Completed") fail("Upload is unavailable for this job", 403);
        const file = await acceptFile(req, { workOrderId: job.id, technicianId, kind });
        await storage.mutate(store => { store.files.push(file); addActivity(store, "workOrder", job.id, auth.technician.name, `${kind} uploaded`); });
        return send(res, 201, publicFile(file));
      }
      if (parts[0] === "work-orders" && parts[2] === "files" && parts[3] && req.method === "DELETE") {
        const storedName = await storage.mutate(store => {
          const job = assignedJob(store, technicianId, parts[1]);
          if (job.leadTechnicianId !== technicianId || job.status === "Completed") fail("Photo removal is unavailable for this job", 403);
          const file = find(store.files, parts[3]);
          const draft = store.drafts.find(item => item.workOrderId === job.id);
          if (!file || file.workOrderId !== job.id || file.kind !== "photo" || !draft?.data.fileIds?.includes(file.id)) fail("Draft photo not found", 404);
          draft.data.fileIds = draft.data.fileIds.filter(id => id !== file.id);
          draft.updatedAt = isoNow();
          const usedByReport = store.reports.some(report => (report.fileIds || []).includes(file.id)
            || (report.versions || []).some(version => (version.fileIds || []).includes(file.id)));
          if (usedByReport) return "";
          store.files = store.files.filter(item => item.id !== file.id);
          return file.storedName;
        });
        if (storedName && deleteUpload) await deleteUpload("maintenance", storedName).catch(error => console.error("Maintenance upload cleanup:", error));
        return send(res, 200, { ok: true });
      }
      if (parts[0] === "work-orders" && parts[2] === "extract" && req.method === "POST") {
        const job = assignedJob(auth.state, technicianId, parts[1]);
        const body = await readJson(req);
        const file = find(auth.state.files, body.fileId);
        if (!file || file.workOrderId !== job.id || file.kind !== "original") fail("Original report not found", 404);
        return send(res, 200, await extractHandwritten(file));
      }
      if (parts[0] === "work-orders" && parts[2] === "report" && req.method === "POST") {
        const body = await readJson(req);
        const report = await storage.mutate(store => {
          const job = assignedJob(store, technicianId, parts[1]);
          const type = body.type === "Handwritten Upload" ? "Handwritten Upload" : "Digital Checklist";
          if (job.leadTechnicianId !== technicianId && type !== "Handwritten Upload") fail("Only the lead technician can submit the report", 403);
          if (job.status === "Completed") fail("This job is completed", 409);
          const prior = store.reports.find(item => item.workOrderId === job.id);
          if (prior && !["Revision", "Rejected"].includes(prior.status)) fail("A report is already awaiting review", 409);
          const fileIds = unique(body.fileIds);
          if (fileIds.some(id => !store.files.some(file => file.id === id && file.workOrderId === job.id))) fail("A report file does not belong to this job", 403);
          const originalFileId = trim(body.originalFileId, 80);
          const signatureFileId = trim(body.signatureFileId, 80);
          if (type === "Handwritten Upload" && !store.files.some(file => file.id === originalFileId && file.workOrderId === job.id && file.kind === "original")) fail("Upload the original handwritten report first");
          if (type === "Digital Checklist") {
            if (!store.files.some(file => file.id === signatureFileId && file.workOrderId === job.id && file.kind === "signature")) fail("Capture the customer signature before submitting");
            if (!trim(body.details?.customerName, 100)) fail("Enter the customer's name before submitting");
            for (const group of Object.keys(CHECKLIST)) for (const label of CHECKLIST[group]) {
              const item = body.checklist?.[group]?.[label];
              if (item?.value && !["OK", "Issue"].includes(item.value)) fail(`Choose OK or Issue for: ${label}`);
            }
          }
          const now = isoNow();
          const details = { workCarriedOut: trim(body.details?.workCarriedOut, 4000), materialsUsed: trim(body.details?.materialsUsed, 2000),
            remarks: trim(body.details?.remarks, 4000),
            customerName: trim(body.details?.customerName, 100) };
          const extracted = Object.fromEntries(REPORT_FIELDS.map(key => [key, trim(body.extracted?.[key], 1000)]));
          const requestedNumber = type === "Handwritten Upload" ? trim(extracted.reportNumber, 100) : "";
          if (!prior && requestedNumber && reportNumberTaken(store, requestedNumber)) fail("Service Report Number already exists", 409);
          const item = prior || { id: random(), number: requestedNumber || nextReportNumber(store), workOrderId: job.id,
            contractId: job.contractId, visitId: job.visitId, createdAt: now, history: [], versions: [] };
          extracted.reportNumber = item.number;
          if (prior) item.versions.push({ submittedAt: prior.submittedAt, type: prior.type, details: prior.details, checklist: prior.checklist,
            fileIds: prior.fileIds, extracted: prior.extracted, reviewReason: prior.reviewReason });
          Object.assign(item, { type, details, checklist: type === "Digital Checklist" ? body.checklist : {}, extracted,
            fileIds: unique([...fileIds, originalFileId, signatureFileId].filter(Boolean)), originalFileId, signatureFileId,
            status: "Pending Review", submittedAt: now, submittedBy: technicianId, reviewReason: "" });
          item.history.push({ at: now, actor: auth.technician.name, action: prior ? "Resubmitted" : "Submitted" });
          if (!prior) store.reports.unshift(item);
          store.drafts = store.drafts.filter(draft => draft.workOrderId !== job.id);
          job.status = "Report Submitted";
          job.updatedAt = now;
          addActivity(store, "workOrder", job.id, auth.technician.name, `${item.number} submitted for office review`);
          return item;
        });
        return send(res, 201, report);
      }
      if (parts[0] === "files" && parts[1] && req.method === "GET") {
        const file = find(auth.state.files, parts[1]);
        if (!file || !file.workOrderId || !auth.state.workOrders.some(job => job.id === file.workOrderId && job.technicianIds.includes(technicianId))) fail("File not found", 404);
        return serveFile(res, file);
      }
      if (parts[0] === "push-subscription" && req.method === "POST") {
        const body = await readJson(req);
        const subscription = body.subscription;
        if (!subscription?.endpoint || !subscription.keys?.auth || !subscription.keys?.p256dh || !String(subscription.endpoint).startsWith("https://")) fail("Invalid push subscription");
        await storage.mutate(store => {
          const current = store.subscriptions.find(item => item.subscription.endpoint === subscription.endpoint);
          if (current) Object.assign(current, { technicianId, subscription, updatedAt: isoNow() });
          else store.subscriptions.push({ id: random(), technicianId, subscription, createdAt: isoNow() });
        });
        return send(res, 200, { ok: true });
      }
      if (parts[0] === "notifications" && parts[2] === "accept" && req.method === "POST") {
        await storage.mutate(store => {
          const notice = find(store.notifications, parts[1]);
          if (!notice || notice.technicianId !== technicianId) fail("Notification not found", 404);
          if (notice.status === "Accepted") return;
          notice.acknowledgedAt = isoNow();
          notice.status = "Accepted";
          if (["assigned", "rescheduled"].includes(notice.type)) {
            const job = find(store.workOrders, notice.workOrderId);
            if (job?.technicianIds.includes(technicianId)) addActivity(store, "workOrder", job.id, auth.technician.name, `${auth.technician.name} accepted ${job.number}`);
          }
        });
        return send(res, 200, { ok: true });
      }
      return send(res, 404, { error: "Field route not found" });
    } catch (error) {
      return send(res, error.status || 500, { error: error.message || "Field error" });
    }
  }

  return { routeOffice, routeField, storage, CHECKLIST };
}

module.exports = { createMaintenanceApi };
