const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { createMaintenanceStore } = require("./maintenance-store");
const { roundMoney, billingRows, billingFor, saveBilling } = require("./maintenance-billing");

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
const dubaiToday = () => {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const part = type => parts.find(item => item.type === type).value;
  return `${part("year")}-${part("month")}-${part("day")}`;
};

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

function nextWorkOrderNumber(store) {
  const defaultPrefix = `WO-${new Date().getFullYear()}-`;
  const latest = String(store.workOrders[0]?.number || store.schedules[0]?.workOrderNumber || "").trim();
  const match = latest.match(/^(.*?)(\d+)$/);
  const prefix = match ? match[1] : defaultPrefix;
  const numbers = [...store.workOrders.map(item => item.number), ...store.schedules.map(item => item.workOrderNumber)];
  const suffixes = numbers.map(number => String(number || "").toUpperCase().startsWith(prefix.toUpperCase()) ? String(number).slice(prefix.length) : "")
    .filter(value => /^\d+$/.test(value));
  const next = Math.max(prefix.toUpperCase() === defaultPrefix ? Number(store.sequence.workOrder || 0) : 0,
    ...suffixes.map(Number), 0) + 1;
  const width = Math.max(match?.[2].length || 4, ...suffixes.map(value => value.length));
  return `${prefix}${String(next).padStart(width, "0")}`;
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

const AMC_BILLING_KINDS = new Set(["custom_installment", "full_contract", "advance_billing", "additional_adjustment"]);
const WORK_ORDER_BILLING_KINDS = new Set(["advance_payment", "final_payment", "variation_charge", "materials_charge"]);

function saveInvoiceRequest(store, record, body, user, editing = false) {
  if (editing && !record.request) fail("Invoice request not found", 404);
  if (record.invoice || record.request && record.request.status !== "draft" && !editing)
    fail("An invoice request already exists for this installment or charge", 409);
  const resend = editing && body.resend === true;
  const mode = editing ? resend ? "send" : record.request.status : body.mode === "draft" ? "draft" : "send";
  const requestDate = trim(body.requestDate, 10) || dubaiToday();
  if (!validDate(requestDate)) fail("Enter a valid request date");
  if (record.sourceType === "AMC" && (store.billingRecords || []).some(item => item.sourceType === "AMC Special"
    && item.contractId === record.contractId && item.billingType === "full_contract" && (item.request || item.invoice)))
    fail("Full contract billing already covers this AMC", 409);
  const requestedAmount = Object.hasOwn(body, "amountExVat") ? Number(body.amountExVat) : Number(record.amountExVat);
  if (!Number.isFinite(requestedAmount) || requestedAmount < 0) fail("Enter a valid amount before VAT");
  if (record.contractId && record.sourceType !== "Additional Charge") {
    const contract = find(store.contracts, record.contractId);
    if (!contract) fail("AMC contract not found", 404);
    if (record.billingType === "full_contract"
      && Math.abs(roundMoney(requestedAmount) - roundMoney(contract.contractValue)) > 0.01)
      fail("Full Contract Billing must match the contract value. Choose an installment or another billing option for a partial amount", 409);
    const committed = billingRows(store).filter(item => item.contractId === record.contractId
      && item.id !== record.id && item.sourceType !== "Additional Charge" && (item.request || item.invoice))
      .reduce((total, item) => total + Number(item.amountExVat || 0), 0);
    if (roundMoney(requestedAmount + committed) > roundMoney(contract.contractValue))
      fail(`This request exceeds the AMC contract value. AED ${roundMoney(Math.max(0, contract.contractValue - committed)).toFixed(2)} remains available.`, 409);
  }
  if (record.sourceType === "Work Order") {
    record.serviceAmountExVat ??= roundMoney(record.amountExVat);
    record.serviceVatRate ??= record.vatRate;
  }
  record.amountExVat = roundMoney(requestedAmount);
  if (Object.hasOwn(body, "vatRate")) {
    const rate = Number(body.vatRate);
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) fail("Enter a VAT percentage from 0 to 100");
    record.vatRate = rate;
  }
  if (mode === "send" && Number(record.amountExVat) <= 0) fail("Set the billing amount before requesting an invoice");
  const now = isoNow();
  record.request = editing ? { ...record.request, requestDate, remarks: trim(body.remarks, 500),
    ...(resend ? { status: "send", requestedAt: now, preparedAt: "", handledBy: "", resentAt: now, resentBy: user.name } : {}) }
    : { requestedBy: user.name, createdAt: record.request?.createdAt || now,
      requestedAt: mode === "send" ? now : "", requestDate, status: mode,
      remarks: trim(body.remarks, 500), preparedAt: "", handledBy: "" };
  record.updatedAt = now;
  saveBilling(store, record);
  addActivity(store, "billing", record.contractId || record.workOrderId,
    user.name, `Invoice request ${resend ? "sent again to accounts" : editing ? "edited" : mode === "draft" ? "draft saved" : "sent to accounts"} for ${record.reference}${record.installmentNumber ? ` installment ${record.installmentNumber}` : record.billingType ? ` · ${record.billingType.replaceAll("_", " ")}` : ""}`);
  return record;
}

function deleteWorkOrder(store, id) {
  const job = find(store.workOrders, id);
  if (!job) return null;
  const reportIds = new Set(store.reports.filter(item => item.workOrderId === id).map(item => item.id));
  const fileIds = new Set(store.files.filter(item => item.workOrderId === id).map(item => item.id));
  store.reports = store.reports.filter(item => !reportIds.has(item.id));
  store.billingRecords = (store.billingRecords || []).filter(item => item.workOrderId !== id);
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

function guardApprovedReportDeletion(store, workOrderIds, role) {
  if (String(role).toLowerCase() === "admin") return;
  const ids = new Set(workOrderIds.filter(Boolean));
  if (store.reports.some(report => ids.has(report.workOrderId) && report.status === "Approved"))
    fail("Only an Admin can delete approved service reports", 403);
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
  const { invites: _invites, subscriptions: _subscriptions, drafts: _drafts,
    pendingUploadDeletes: _pendingUploadDeletes, ...visible } = store;
  return { ...visible, billing: billingRows(store), nextWorkOrderNumber: nextWorkOrderNumber(store),
    files: store.files.map(({ storedName: _storedName, ...file }) => file) };
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

  function resolveInlineCustomer(store, body, user, existing) {
    if (body.customerId !== "__new__") return body;
    const name = trim(body.newCustomer?.name, 150);
    const contact = trim(body.newCustomer?.contact, 100);
    const phone = trim(body.newCustomer?.phone, 50);
    const email = trim(body.newCustomer?.email, 150);
    if (!name) fail("Enter the new customer name");
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail("Enter a valid customer email address");
    if (existing?.customerId && existing.customerName?.toLocaleLowerCase("en-US") === name.toLocaleLowerCase("en-US"))
      return { ...body, customerId: existing.customerId };
    if (store.customers.some(item => item.name.trim().toLocaleLowerCase("en-US") === name.toLocaleLowerCase("en-US")))
      fail("This customer already exists. Select it from the list instead.", 409);
    const now = isoNow();
    const customer = { id: random(), name, contact, phone, email, createdAt: now, updatedAt: now };
    store.customers.unshift(customer);
    addActivity(store, "customer", customer.id, user.name, `${name} created`);
    return { ...body, customerId: customer.id };
  }

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

  function contractInput(store, body, existing = {}) {
    const number = Object.hasOwn(body, "number") ? trim(body.number, 100) : trim(existing.number, 100);
    if (existing.id && !number) fail("Enter an AMC number");
    const selectedCustomer = body.customerId ? find(store.customers, trim(body.customerId, 80)) : null;
    if (body.customerId && !selectedCustomer) fail("Select a customer from the Customer List");
    const customerName = selectedCustomer && selectedCustomer.id === existing.customerId
      ? existing.customerName : selectedCustomer?.name || trim(body.customerName, 150);
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
    return { ...existing, ...(number ? { number } : {}), customerId: selectedCustomer?.id || (existing.customerName === customerName && existing.customerId
      ? existing.customerId : maintenanceCustomerId(customerName)), customerName, site, contact, phone,
      email, startDate, endDate, frequency, visitsPerYear, unitCount,
      status: ["Active", "Paused", "Cancelled"].includes(body.status) ? body.status : "Active",
      contractValue: Number(body.contractValue || 0) || 0, notes: trim(body.notes, 4000),
      units: Array.isArray(body.units) ? body.units.slice(0, 100).map(unit => ({ reference: trim(unit.reference, 80), type: trim(unit.type, 80), quantity: Math.max(1, Number(unit.quantity || 1)), location: trim(unit.location, 120) })) : (existing.units || []) };
  }

  function validateSchedule(store, body, active, { allowUnassigned = false } = {}) {
    const contract = body.contractId ? find(store.contracts, body.contractId) : null;
    if (body.contractId && !contract) fail("AMC contract not found");
    const selectedCustomer = !contract && body.customerId ? find(store.customers, trim(body.customerId, 80)) : null;
    if (!contract && body.customerId && !selectedCustomer) fail("Select a customer from the Customer List");
    const customerName = contract?.customerName || (selectedCustomer && selectedCustomer.id === active?.customerId
      ? active.customerName : selectedCustomer?.name) || trim(body.customerName, 150);
    if (!customerName) fail("Enter a customer name");
    const serviceDate = trim(body.serviceDate, 10);
    if (!validDate(serviceDate)) fail("Enter a valid service date");
    const startTime = trim(body.startTime, 5);
    const endTime = trim(body.endTime, 5);
    if (!validTime(startTime) || !validTime(endTime) || endTime <= startTime) fail("Enter a valid service time range");
    const workType = ["Preventive Maintenance", "Complaint / Repair", "Inspection", "Emergency Service", "Other"].includes(body.workType)
      ? body.workType : "Preventive Maintenance";
    const technicianIds = unique(body.technicianIds);
    if (active && (technicianIds.length > 5 || (!allowUnassigned && technicianIds.length < 1))) fail("Assign 1 to 5 technicians");
    if (technicianIds.some(id => !find(store.technicians, id) || find(store.technicians, id).active === false)) fail("Select active technicians");
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
    return { contractId: contract?.id || "", visitId: visit?.id || "", customerId: contract?.customerId || selectedCustomer?.id
      || (active?.customerName === customerName && active.customerId ? active.customerId : maintenanceCustomerId(customerName)),
      customerName, site,
      contact: trim(body.contact || contract?.contact, 100), phone: trim(body.phone || contract?.phone, 50),
      workType, serviceDate, startTime, endTime, priority: ["Normal", "Urgent"].includes(body.priority) ? body.priority : "Normal",
      technicianIds, instructions: trim(body.instructions, 4000) };
  }

  function workOrderFromSchedule(store, schedule, existing) {
    const now = isoNow();
    const base = existing || { id: random(), createdAt: now };
    Object.assign(base, { number: schedule.workOrderNumber, scheduleId: schedule.id, contractId: schedule.contractId, visitId: schedule.visitId,
      customerId: schedule.customerId, customerName: schedule.customerName, site: schedule.site, contact: schedule.contact,
      phone: schedule.phone, workType: schedule.workType, serviceDate: schedule.serviceDate, startTime: schedule.startTime,
      endTime: schedule.endTime, priority: schedule.priority, technicianIds: schedule.technicianIds,
      instructions: schedule.instructions, status: existing?.status || "Scheduled", updatedAt: now });
    if (!existing) store.workOrders.unshift(base);
    return base;
  }

  async function flushUploadDeletes(names) {
    if (!deleteUpload) return;
    for (const storedName of names) {
      try {
        await deleteUpload("maintenance", storedName);
        await storage.mutate(store => {
          store.pendingUploadDeletes = store.pendingUploadDeletes.filter(name => name !== storedName);
        });
      } catch (error) {
        console.error("Maintenance upload cleanup:", error);
      }
    }
  }

  async function pruneBillingUploads(state) {
    const referenced = new Set((state.billingRecords || []).flatMap(record => [record.invoice?.fileId,
      ...(record.payments || []).map(payment => payment.receiptFileId)].filter(Boolean)));
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    if (!state.files.some(file => ["invoice", "receipt"].includes(file.kind) && file.billingId
      && !referenced.has(file.id) && Date.parse(file.createdAt || "") < cutoff)) return state;
    const removed = await storage.mutate(store => {
      const used = new Set((store.billingRecords || []).flatMap(record => [record.invoice?.fileId,
        ...(record.payments || []).map(payment => payment.receiptFileId)].filter(Boolean)));
      const orphaned = store.files.filter(file => ["invoice", "receipt"].includes(file.kind) && file.billingId
        && !used.has(file.id) && Date.parse(file.createdAt || "") < cutoff);
      const ids = new Set(orphaned.map(file => file.id));
      store.files = store.files.filter(file => !ids.has(file.id));
      const names = orphaned.map(file => file.storedName).filter(Boolean);
      store.pendingUploadDeletes = [...new Set([...store.pendingUploadDeletes, ...names])];
      return names;
    });
    if (removed.length) await flushUploadDeletes(removed);
    return storage.read();
  }

  async function routeOffice(req, res, url, user) {
    try {
      if (!user || !["admin", "mts"].includes(String(user.role).toLowerCase())) fail("Admin or MTS access required", 403);
      if (req.method !== "GET") sameOrigin(req);
      const parts = url.pathname.split("/").filter(Boolean).slice(2);
      if (parts[0] === "customers" && parts.length <= 2) {
        if (req.method === "POST" && parts.length === 1 || req.method === "PUT" && parts.length === 2) {
          const body = await readJson(req);
          const name = trim(body.name, 150);
          const contact = trim(body.contact, 100);
          const phone = trim(body.phone, 50);
          const email = trim(body.email, 150);
          if (!name) fail("Enter a customer name");
          if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail("Enter a valid email address");
          const customer = await storage.mutate(store => {
            const current = parts.length === 2 ? find(store.customers, parts[1]) : null;
            if (parts.length === 2 && !current) fail("Customer not found", 404);
            if (store.customers.some(item => item.id !== current?.id && item.name.trim().toLocaleLowerCase("en-US") === name.toLocaleLowerCase("en-US")))
              fail("A customer with this name already exists", 409);
            const oldName = current?.name || "";
            const now = isoNow();
            const item = current || { id: random(), createdAt: now };
            Object.assign(item, { name, contact, phone, email, updatedAt: now });
            if (!current) store.customers.unshift(item);
            else {
              const linked = row => row.customerId === item.id || (!row.customerId && row.customerName?.toLocaleLowerCase("en-US") === oldName.toLocaleLowerCase("en-US"));
              for (const agreement of store.contracts.filter(linked)) Object.assign(agreement,
                { customerId: item.id, customerName: name, contact, phone, email, updatedAt: now });
              for (const row of [...store.schedules, ...store.workOrders].filter(linked)) Object.assign(row,
                { customerId: item.id, customerName: name, contact, phone, updatedAt: now });
              const linkedJobIds = new Set(store.workOrders.filter(row => row.customerId === item.id).map(row => row.id));
              for (const notice of store.notifications.filter(row => linkedJobIds.has(row.workOrderId))) {
                notice.message = notice.message?.replace(` | ${oldName} - `, ` | ${name} - `) || notice.message;
              }
              for (const report of store.reports) {
                const workOrder = find(store.workOrders, report.workOrderId);
                const agreement = find(store.contracts, report.contractId);
                if (workOrder?.customerId !== item.id && agreement?.customerId !== item.id
                  && report.extracted?.customerName?.toLocaleLowerCase("en-US") !== oldName.toLocaleLowerCase("en-US")
                  && report.details?.customerName?.toLocaleLowerCase("en-US") !== oldName.toLocaleLowerCase("en-US")) continue;
                if (report.extracted) report.extracted = { ...report.extracted, customerName: name };
                if (report.details) report.details = { ...report.details, customerName: name };
                report.updatedAt = now;
              }
              for (const record of store.billingRecords || []) {
                if (record.customerName?.toLocaleLowerCase("en-US") === oldName.toLocaleLowerCase("en-US")
                  || find(store.contracts, record.contractId)?.customerId === item.id
                  || find(store.workOrders, record.workOrderId)?.customerId === item.id) record.customerName = name;
              }
            }
            addActivity(store, "customer", item.id, user.name, `${name} ${current ? "updated" : "created"}`);
            return item;
          });
          return send(res, parts.length === 1 ? 201 : 200, customer);
        }
        if (req.method === "DELETE" && parts.length === 2) {
          const result = await storage.mutate(store => {
            const customer = find(store.customers, parts[1]);
            if (!customer) fail("Customer not found", 404);
            const linked = row => row.customerId === customer.id || row.customerName?.toLocaleLowerCase("en-US") === customer.name.toLocaleLowerCase("en-US");
            if (store.contracts.some(linked) || store.workOrders.some(linked) || store.schedules.some(linked)
              || store.reports.some(report => [report.extracted?.customerName, report.details?.customerName]
                .some(name => name?.toLocaleLowerCase("en-US") === customer.name.toLocaleLowerCase("en-US")))
              || (store.billingRecords || []).some(record => record.customerName?.toLocaleLowerCase("en-US") === customer.name.toLocaleLowerCase("en-US")))
              fail("This customer is used by a maintenance record. Change the linked record before deleting.", 409);
            store.customers = store.customers.filter(item => item.id !== customer.id);
            addActivity(store, "customer", customer.id, user.name, `${customer.name} deleted`);
            return { ok: true, id: customer.id };
          });
          return send(res, 200, result);
        }
      }
      if (req.method === "GET" && parts[0] === "summary") {
        let state = await storage.read();
        if (state.pendingUploadDeletes.length) await flushUploadDeletes(state.pendingUploadDeletes);
        if (state.pendingUploadDeletes.length) state = await storage.read();
        state = await pruneBillingUploads(state);
        return send(res, 200, { ...publicState(state),
          viewerRole: String(user.role).toLowerCase(), viewerName: user.name });
      }

      if (parts[0] === "billing" && parts.length === 2 && parts[1] === "extra" && req.method === "POST") {
        const body = await readJson(req);
        const result = await storage.mutate(store => {
          const job = find(store.workOrders, trim(body.workOrderId, 80));
          if (!job?.contractId) fail("Choose a work order linked to an AMC");
          const amountExVat = roundMoney(body.amountExVat);
          if (!Number.isFinite(Number(body.amountExVat)) || amountExVat <= 0) fail("Enter an additional charge greater than zero");
          const description = trim(body.description, 300);
          if (!description) fail("Describe the additional work or parts");
          const now = isoNow();
          const record = { id: `extra:${random()}`, sourceType: "Additional Charge", contractId: job.contractId,
            workOrderId: job.id, reference: job.number, customerName: job.customerName, site: job.site,
            periodStart: job.serviceDate, periodEnd: job.serviceDate, dueDate: job.serviceDate,
            amountExVat, vatRate: 5, description, notes: "", request: null, invoice: null,
            payments: [], credits: 0, createdAt: now, updatedAt: now };
          saveBilling(store, record);
          addActivity(store, "billing", job.id, user.name, `Additional charge AED ${amountExVat.toFixed(2)} recorded: ${description}`);
          return record;
        });
        return send(res, 201, result);
      }

      if (parts[0] === "billing" && parts[1] === "notes" && parts[2] && parts.length === 3 && req.method === "PUT") {
        const body = await readJson(req);
        const notes = await storage.mutate(store => {
          if (!find(store.contracts, parts[2])) fail("AMC contract not found", 404);
          store.billingNotes ||= {};
          store.billingNotes[parts[2]] = trim(body.notes, 3000);
          return store.billingNotes[parts[2]];
        });
        return send(res, 200, { notes });
      }

      if (parts[0] === "billing" && parts[1] === "special" && parts[2] === "request" && parts.length === 3 && req.method === "POST") {
        const body = await readJson(req);
        const updated = await storage.mutate(store => {
          const sourceType = trim(body.sourceType, 30), sourceId = trim(body.sourceId, 80);
          const billingType = trim(body.billingType, 40), clientKey = trim(body.clientKey, 80);
          if (!/^[a-zA-Z0-9-]{8,80}$/.test(clientKey)) fail("Invalid billing request key");
          const isAmc = sourceType === "AMC";
          if (!isAmc && sourceType !== "Work Order") fail("Select an AMC or non-AMC work order");
          if (!(isAmc ? AMC_BILLING_KINDS : WORK_ORDER_BILLING_KINDS).has(billingType)) fail("Select a valid billing option");
          const parent = isAmc ? find(store.contracts, sourceId) : find(store.workOrders, sourceId);
          if (!parent || !isAmc && parent.contractId) fail("Selected billing record was not found", 404);
          const id = `special:${clientKey}`;
          let record = billingFor(store, id);
          if (record && (record.sourceType !== (isAmc ? "AMC Special" : "Work Order Special")
            || (isAmc ? record.contractId : record.workOrderId) !== sourceId || record.billingType !== billingType))
            fail("This billing request key belongs to another charge", 409);
          if (!record) {
            if (billingType === "full_contract" && billingRows(store).some(item => item.contractId === sourceId
              && (item.request || item.invoice))) fail("This AMC already has billing activity", 409);
            const now = isoNow();
            record = { id, sourceType: isAmc ? "AMC Special" : "Work Order Special", billingType,
              contractId: isAmc ? sourceId : "", workOrderId: isAmc ? "" : sourceId,
              reference: parent.number, customerName: parent.customerName, site: parent.site,
              periodStart: isAmc ? parent.startDate : parent.serviceDate,
              periodEnd: isAmc ? parent.endDate : parent.serviceDate,
              dueDate: trim(body.requestDate, 10) || dubaiToday(), amountExVat: billingType === "full_contract" ? roundMoney(parent.contractValue) : 0,
              vatRate: 5, notes: "", request: null, invoice: null, payments: [], credits: 0, createdAt: now, updatedAt: now };
          }
          if (billingType === "custom_installment") {
            const start = trim(body.periodStart, 10), end = trim(body.periodEnd, 10);
            if (!validDate(start) || !validDate(end) || end < start
              || start < parent.startDate || end > parent.endDate)
              fail("Enter a custom period within this AMC contract");
            record.periodStart = start;
            record.periodEnd = end;
            record.dueDate = end;
          }
          return saveInvoiceRequest(store, record, body, user);
        });
        return send(res, updated.request.status === "draft" ? 200 : 201, updated);
      }

      if (parts[0] === "billing" && parts[1] && parts.length >= 2) {
        const id = decodeURIComponent(parts[1]);
        const action = parts[2] || "";
        if (!action && parts.length === 2 && req.method === "DELETE") {
          if (String(user.role).toLowerCase() !== "admin") fail("Only Admin can delete payment schedule rows", 403);
          const deleted = await storage.mutate(store => {
            const record = billingFor(store, id);
            if (!record || record.sourceType !== "AMC") fail("Payment schedule row not found", 404);
            if (record.request || record.invoice || record.payments?.length)
              fail("This installment has billing activity and cannot be deleted", 409);
            store.billingDeletedIds ||= [];
            if (!store.billingDeletedIds.includes(id)) store.billingDeletedIds.push(id);
            store.billingRecords = (store.billingRecords || []).filter(item => item.id !== id);
            addActivity(store, "billing", record.contractId, user.name,
              `${record.reference} installment ${record.installmentNumber} removed from payment schedule`);
            return record;
          });
          return send(res, 200, { ok: true, id: deleted.id });
        }
        if (action === "request" && parts.length === 3 && req.method === "DELETE") {
          if (String(user.role).toLowerCase() !== "admin") fail("Only Admin can delete invoice requests", 403);
          const result = await storage.mutate(store => {
            const record = billingFor(store, id);
            if (!record || !record.request && !record.invoice) fail("Invoice request not found", 404);
            if (record.paymentStatus === "Paid") fail("Paid invoices cannot be deleted. Mark the invoice unpaid first.", 409);
            const invoiceNumber = record.invoice?.number;
            const removedUploads = store.files.filter(file => file.billingId === id && ["invoice", "receipt"].includes(file.kind))
              .map(file => file.storedName).filter(Boolean);
            store.files = store.files.filter(file => file.billingId !== id || !["invoice", "receipt"].includes(file.kind));
            store.pendingUploadDeletes = [...new Set([...(store.pendingUploadDeletes || []), ...removedUploads])];
            if (["AMC Special", "Work Order Special"].includes(record.sourceType))
              store.billingRecords = (store.billingRecords || []).filter(item => item.id !== id);
            else {
              record.request = null;
              record.invoice = null;
              record.payments = [];
              record.credits = 0;
              record.updatedAt = isoNow();
              saveBilling(store, record);
            }
            addActivity(store, "billing", record.contractId || record.workOrderId, user.name,
              `Invoice request${invoiceNumber ? ` and invoice ${invoiceNumber}` : ""} for ${record.reference}${record.installmentNumber ? ` installment ${record.installmentNumber}` : ""} deleted`);
            return { removedUploads };
          });
          await flushUploadDeletes(result.removedUploads);
          return send(res, 200, { ok: true, id });
        }
        if (action === "uploads" && parts[3] && parts.length === 4 && req.method === "DELETE") {
          const fileId = parts[3];
          const removed = await storage.mutate(store => {
            const file = find(store.files, fileId);
            if (!file || file.billingId !== id || !["invoice", "receipt"].includes(file.kind)) fail("Billing upload not found", 404);
            if ((store.billingRecords || []).some(record => record.invoice?.fileId === fileId
              || (record.payments || []).some(payment => payment.receiptFileId === fileId)))
              fail("This document is attached to an invoice or payment", 409);
            store.files = store.files.filter(item => item.id !== fileId);
            store.pendingUploadDeletes = [...new Set([...store.pendingUploadDeletes, file.storedName])];
            return file.storedName;
          });
          await flushUploadDeletes([removed]);
          return send(res, 200, { ok: true });
        }
        if (!action && req.method === "PUT") {
          const body = await readJson(req);
          const updated = await storage.mutate(store => {
            const record = billingFor(store, id);
            if (!record) fail("Billing record not found", 404);
            if (Object.hasOwn(body, "notes")) record.notes = trim(body.notes, 3000);
            if (Object.hasOwn(body, "serviceAmountExVat")) {
              if (record.sourceType !== "Work Order") fail("Service amount is only available for non-AMC work orders", 409);
              const amount = Number(body.serviceAmountExVat);
              if (!Number.isFinite(amount) || amount < 0) fail("Enter a valid service amount");
              record.serviceAmountExVat = roundMoney(amount);
              if (!record.request && !record.invoice) record.amountExVat = record.serviceAmountExVat;
            }
            if (Object.hasOwn(body, "serviceVatRate")) {
              if (record.sourceType !== "Work Order") fail("Service VAT is only available for non-AMC work orders", 409);
              const rate = Number(body.serviceVatRate);
              if (!Number.isFinite(rate) || rate < 0 || rate > 100) fail("Enter a VAT percentage from 0 to 100");
              record.serviceVatRate = rate;
              if (!record.request && !record.invoice) record.vatRate = rate;
            }
            if (Object.hasOwn(body, "amountExVat")) {
              if (record.sourceType === "AMC" || record.request || record.invoice) fail("The amount is locked once billing starts", 409);
              const amount = Number(body.amountExVat);
              if (!Number.isFinite(amount) || amount < 0) fail("Enter a valid service amount");
              record.amountExVat = roundMoney(amount);
              if (record.sourceType === "Work Order") record.serviceAmountExVat = record.amountExVat;
            }
            if (Object.hasOwn(body, "vatRate")) {
              if (record.invoice) fail("VAT is locked after the invoice is saved", 409);
              const rate = Number(body.vatRate);
              if (!Number.isFinite(rate) || rate < 0 || rate > 100) fail("Enter a VAT percentage from 0 to 100");
              record.vatRate = rate;
              if (record.sourceType === "Work Order") record.serviceVatRate = rate;
            }
            if (Object.hasOwn(body, "credits")) {
              if (String(user.role).toLowerCase() !== "admin") fail("Only Admin can record credits", 403);
              const credits = Number(body.credits);
            const paid = (record.payments || []).filter(payment => !payment.reversedAt).reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
            if (!Number.isFinite(credits) || credits < 0 || credits > roundMoney(Number(record.invoice?.total || 0) - paid))
              fail("Credits cannot exceed the unpaid invoice balance");
              record.credits = roundMoney(credits);
            }
            record.updatedAt = isoNow();
            return saveBilling(store, record);
          });
          return send(res, 200, updated);
        }
        if (action === "request" && req.method === "POST") {
          const body = await readJson(req);
          const updated = await storage.mutate(store => {
            const record = billingFor(store, id);
            if (!record) fail("Billing record not found", 404);
            return saveInvoiceRequest(store, record, body, user);
          });
          return send(res, updated.request.status === "draft" ? 200 : 201, updated);
        }
        if (action === "request" && req.method === "PUT") {
          const body = await readJson(req);
          const updated = await storage.mutate(store => {
            const record = billingFor(store, id);
            if (!record) fail("Billing record not found", 404);
            return saveInvoiceRequest(store, record, body, user, true);
          });
          return send(res, 200, updated);
        }
        if (action === "handoff" && req.method === "POST") {
          if (String(user.role).toLowerCase() !== "admin") fail("Only Admin can confirm accountant handoff", 403);
          const updated = await storage.mutate(store => {
            const record = billingFor(store, id);
            if (!record?.request || record.request.status === "draft") fail("Send the invoice request to accounts first", 409);
            if (record.request.preparedAt) fail("This invoice was already marked prepared", 409);
            record.request.preparedAt = isoNow();
            record.request.handledBy = user.name;
            record.updatedAt = isoNow();
            return saveBilling(store, record);
          });
          return send(res, 200, updated);
        }
        if (["invoice-upload", "receipt-upload"].includes(action) && req.method === "POST") {
          const record = billingFor(await storage.read(), id);
          if (!record) fail("Billing record not found", 404);
          if (action === "receipt-upload" && String(user.role).toLowerCase() !== "admin") fail("Only Admin can upload payment receipts", 403);
          const kind = action === "invoice-upload" ? "invoice" : "receipt";
          const file = await acceptFile(req, { kind, billingId: id, contractId: record.contractId, workOrderId: record.workOrderId });
          await storage.mutate(store => { store.files.push(file); });
          const extraction = await extractBillingDocument(file, kind);
          const fields = extraction.fields || {};
          const warnings = [];
          if (kind === "invoice") {
            if (fields.invoiceNumber && billingRows(await storage.read()).some(item => item.invoice?.number?.toLowerCase() === fields.invoiceNumber.toLowerCase()))
              warnings.push("This invoice number is already recorded.");
            if (fields.customerName && fields.customerName.toLowerCase() !== record.customerName.toLowerCase())
              warnings.push("The invoice customer differs from this billing record.");
            if (fields.sourceReference && fields.sourceReference.toLowerCase() !== record.reference.toLowerCase())
              warnings.push("The AMC or work order reference differs from this billing record.");
            if (fields.amountExVat && Math.abs(roundMoney(fields.amountExVat) - roundMoney(record.amountExVat)) > 0.01)
              warnings.push("The invoice amount before VAT differs from the expected amount.");
          } else {
            if (fields.invoiceNumber && record.invoice?.number && fields.invoiceNumber.toLowerCase() !== record.invoice.number.toLowerCase())
              warnings.push("The receipt invoice number differs from this billing record.");
            if (fields.amountReceived && roundMoney(fields.amountReceived) > record.outstanding)
              warnings.push("The receipt amount exceeds the outstanding balance.");
          }
          return send(res, 201, { file: publicFile(file), ...extraction, warnings });
        }
        if (action === "invoice-file" && parts.length === 3 && req.method === "DELETE") {
          const removed = await storage.mutate(store => {
            const record = billingFor(store, id);
            if (!record?.invoice?.fileId) fail("Invoice attachment not found", 404);
            if (record.paymentStatus === "Paid") fail("Paid invoices cannot be edited. Mark the invoice unpaid first.", 409);
            const file = store.files.find(item => item.id === record.invoice.fileId && item.billingId === id && item.kind === "invoice");
            if (!file) fail("Invoice attachment not found", 404);
            record.invoice.fileId = "";
            record.invoice.updatedBy = user.name;
            record.invoice.updatedAt = isoNow();
            record.updatedAt = isoNow();
            saveBilling(store, record);
            store.files = store.files.filter(item => item.id !== file.id);
            store.pendingUploadDeletes = [...new Set([...(store.pendingUploadDeletes || []), file.storedName])];
            addActivity(store, "billing", record.contractId || record.workOrderId, user.name,
              `Invoice attachment removed for ${record.reference}`);
            return file.storedName;
          });
          await flushUploadDeletes([removed]);
          return send(res, 200, { ok: true });
        }
        if (action === "invoice" && ["POST", "PUT"].includes(req.method)) {
          const body = await readJson(req);
          const editing = req.method === "PUT";
          const result = await storage.mutate(store => {
            const record = billingFor(store, id);
            if (!record) fail("Billing record not found", 404);
            if (editing && !record.invoice) fail("Invoice not found", 404);
            if (!editing && record.invoice) fail("An invoice is already linked to this installment or charge", 409);
            if (editing && record.paymentStatus === "Paid") fail("Paid invoices cannot be edited. Mark the invoice unpaid first.", 409);
            if (!editing && record.sourceType === "AMC" && (store.billingRecords || []).some(item => item.sourceType === "AMC Special"
              && item.contractId === record.contractId && item.billingType === "full_contract" && (item.request || item.invoice)))
              fail("Full contract billing already covers this AMC", 409);
            const number = trim(body.number, 100);
            if (!number) fail("Enter the invoice number");
            if (billingRows(store).some(item => item.id !== id && item.invoice?.number?.toLowerCase() === number.toLowerCase())) fail("This invoice number is already used", 409);
            const date = trim(body.date, 10), dueDate = trim(body.dueDate, 10);
            if (!validDate(date) || (dueDate && !validDate(dueDate))) fail("Enter a valid invoice date and due date");
            const exVat = Number(body.amountExVat), vat = Number(body.vatAmount), total = Number(body.total);
            if (![exVat, vat, total].every(Number.isFinite) || exVat < 0 || vat < 0 || roundMoney(total) <= 0
              || Math.abs(roundMoney(exVat + vat) - roundMoney(total)) > 0.01) fail("Invoice amounts must add up and be greater than zero");
            if (editing && roundMoney(total) < roundMoney(record.totalPaid + Number(record.credits || 0)))
              fail("Invoice total cannot be less than payments and credits already recorded", 409);
            const customerName = trim(body.customerName, 150);
            const sourceReference = trim(body.sourceReference, 100);
            const mismatch = (customerName && record.customerName && customerName.toLowerCase() !== record.customerName.toLowerCase())
              || (sourceReference && sourceReference.toLowerCase() !== record.reference.toLowerCase())
              || Math.abs(roundMoney(exVat) - roundMoney(record.amountExVat)) > 0.01;
            if (mismatch && body.confirmMismatch !== true) fail("Invoice customer or amount differs from the billing record. Review and confirm the mismatch.", 409);
            const fileId = trim(body.fileId, 80);
            if (fileId && !store.files.some(file => file.id === fileId && file.kind === "invoice" && file.billingId === id))
              fail("Uploaded invoice does not belong to this billing record", 403);
            const previousInvoice = record.invoice;
            const previousFile = editing && previousInvoice?.fileId && previousInvoice.fileId !== fileId
              ? store.files.find(file => file.id === previousInvoice.fileId) : null;
            record.request ||= { requestedBy: user.name, requestedAt: isoNow(), remarks: "Entered with invoice", preparedAt: "", handledBy: "" };
            record.invoice = { number, date, dueDate, customerName: customerName || record.customerName, sourceReference,
              amountExVat: roundMoney(exVat), vatAmount: roundMoney(vat), total: roundMoney(total),
              fileId, recordedBy: previousInvoice?.recordedBy || user.name, recordedAt: previousInvoice?.recordedAt || isoNow(),
              updatedBy: editing ? user.name : "", updatedAt: editing ? isoNow() : "",
              sentAt: previousInvoice?.sentAt || "", sentBy: previousInvoice?.sentBy || "", mismatchConfirmed: !!mismatch };
            record.updatedAt = isoNow();
            saveBilling(store, record);
            if (previousFile) {
              store.files = store.files.filter(file => file.id !== previousFile.id);
              store.pendingUploadDeletes = [...new Set([...(store.pendingUploadDeletes || []), previousFile.storedName])];
            }
            addActivity(store, "billing", record.contractId || record.workOrderId,
              user.name, `Invoice ${number} ${editing ? "updated" : "recorded"} for ${record.reference}`);
            return { record, removedUploads: previousFile?.storedName ? [previousFile.storedName] : [] };
          });
          if (result.removedUploads.length) await flushUploadDeletes(result.removedUploads);
          return send(res, editing ? 200 : 201, result.record);
        }
        if (action === "sent" && req.method === "POST") {
          const updated = await storage.mutate(store => {
            const record = billingFor(store, id);
            if (!record?.invoice) fail("Upload or enter the invoice first", 409);
            if (record.invoice.sentAt) fail("Invoice already marked sent to customer", 409);
            record.invoice.sentAt = isoNow(); record.invoice.sentBy = user.name; record.updatedAt = isoNow();
            return saveBilling(store, record);
          });
          return send(res, 200, updated);
        }
        if (["mark-paid", "mark-unpaid"].includes(action) && req.method === "POST") {
          if (String(user.role).toLowerCase() !== "admin") fail("Only Admin can change payment status", 403);
          const updated = await storage.mutate(store => {
            const record = billingFor(store, id);
            if (!record?.invoice) fail("Record an invoice before changing payment status", 409);
            record.payments ||= [];
            if (action === "mark-paid") {
              if (record.paymentStatus === "Paid") fail("This invoice is already paid", 409);
              const amount = roundMoney(record.outstanding);
              if (amount <= 0) fail("This invoice has no outstanding balance", 409);
              record.payments.push({ id: random(), amount, date: dubaiToday(), method: "Marked as Paid",
                reference: `MARK-${random()}`, receiptFileId: "", confirmedAt: isoNow(), confirmedBy: user.name });
            } else {
              if (record.paymentStatus !== "Paid") fail("This invoice is not marked paid", 409);
              if (Number(record.credits || 0) >= record.invoiceTotal) fail("Remove the full invoice credit before marking it unpaid", 409);
              const active = record.payments.filter(payment => !payment.reversedAt);
              if (!active.length) fail("No payment entry is available to reverse", 409);
              for (const payment of active) { payment.reversedAt = isoNow(); payment.reversedBy = user.name; }
            }
            record.updatedAt = isoNow();
            saveBilling(store, record);
            addActivity(store, "billing", record.contractId || record.workOrderId, user.name,
              `Invoice ${record.invoice.number} marked ${action === "mark-paid" ? "paid" : "unpaid"}`);
            return record;
          });
          return send(res, 200, updated);
        }
        if (action === "payments" && req.method === "POST") {
          if (String(user.role).toLowerCase() !== "admin") fail("Only Admin can confirm payments", 403);
          const body = await readJson(req);
          const updated = await storage.mutate(store => {
            const record = billingFor(store, id);
            if (!record?.invoice) fail("Record an invoice before confirming payment", 409);
            const amount = Number(body.amount);
            if (!Number.isFinite(amount) || roundMoney(amount) <= 0 || roundMoney(amount) > record.outstanding)
              fail("Payment must be at least AED 0.01 and no more than the outstanding balance");
            const date = trim(body.date, 10);
            if (!validDate(date)) fail("Enter a valid payment date");
            const reference = trim(body.reference, 120), method = trim(body.method, 80);
            if (!reference || !method) fail("Enter the payment reference and method");
            if (billingRows(store).some(item => (item.payments || []).some(payment => payment.reference.toLowerCase() === reference.toLowerCase()
              && (item.id === id || payment.date === date && roundMoney(payment.amount) === roundMoney(amount)))))
              fail("This payment reference is already recorded", 409);
            const receiptFileId = trim(body.receiptFileId, 80);
            if (receiptFileId && !store.files.some(file => file.id === receiptFileId && file.kind === "receipt" && file.billingId === id))
              fail("Uploaded receipt does not belong to this billing record", 403);
            record.payments ||= [];
            record.payments.push({ id: random(), amount: roundMoney(amount), date, method, reference, receiptFileId,
              confirmedAt: isoNow(), confirmedBy: user.name });
            record.updatedAt = isoNow();
            saveBilling(store, record);
            addActivity(store, "billing", record.contractId || record.workOrderId,
              user.name, `Payment AED ${roundMoney(amount).toFixed(2)} confirmed for ${record.invoice.number}`);
            return record;
          });
          return send(res, 201, updated);
        }
      }

      if (req.method === "DELETE" && parts.length === 2 && ["contracts", "schedules", "work-orders", "technicians", "reports"].includes(parts[0])) {
        const deleted = await storage.mutate(store => {
          const [kind, id] = parts;
          const priorFiles = store.files;
          const finish = result => {
            const removedUploads = priorFiles.filter(file => !store.files.some(current => current.id === file.id))
              .map(file => file.storedName).filter(Boolean);
            store.pendingUploadDeletes = [...new Set([...store.pendingUploadDeletes, ...removedUploads])];
            return { ...result, removedUploads };
          };
          if (kind === "contracts") {
            const item = find(store.contracts, id);
            if (!item) fail("AMC contract not found", 404);
            const jobs = store.workOrders.filter(job => job.contractId === id).map(job => job.id);
            guardApprovedReportDeletion(store, jobs, user.role);
            jobs.forEach(jobId => deleteWorkOrder(store, jobId));
            store.schedules = store.schedules.filter(schedule => schedule.contractId !== id);
            store.visits = store.visits.filter(visit => visit.contractId !== id);
            store.files = store.files.filter(file => file.contractId !== id);
            store.billingRecords = (store.billingRecords || []).filter(item => item.contractId !== id);
            store.billingDeletedIds = (store.billingDeletedIds || []).filter(rowId => !rowId.startsWith(`amc:${id}:`));
            if (store.billingNotes) delete store.billingNotes[id];
            store.contracts = store.contracts.filter(contract => contract.id !== id);
            store.activity = store.activity.filter(entry => entry.targetId !== id);
            addActivity(store, "deletion", id, user.name, `${item.number} deleted with ${jobs.length} linked work orders`);
            return finish({ label: item.number, linkedWorkOrders: jobs.length });
          }
          if (kind === "schedules") {
            const item = find(store.schedules, id);
            if (!item) fail("PM schedule not found", 404);
            guardApprovedReportDeletion(store, [item.workOrderId], user.role);
            const removed = item.workOrderId ? deleteWorkOrder(store, item.workOrderId) : null;
            store.schedules = store.schedules.filter(schedule => schedule.id !== id);
            store.activity = store.activity.filter(entry => entry.targetId !== id);
            addActivity(store, "deletion", id, user.name, `Schedule for ${item.customerName} deleted${removed ? ` with ${removed.job.number}` : ""}`);
            return finish({ label: item.customerName, linkedWorkOrders: removed ? 1 : 0 });
          }
          if (kind === "work-orders") {
            guardApprovedReportDeletion(store, [id], user.role);
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
          if (item.status === "Approved" && String(user.role).toLowerCase() !== "admin")
            fail("Only an Admin can delete approved service reports", 403);
          store.reports = store.reports.filter(report => report.id !== id);
          const reportFiles = new Set([...(item.fileIds || []), item.originalFileId, item.signatureFileId,
            ...(item.versions || []).flatMap(version => version.fileIds || [])].filter(Boolean));
          const referencedElsewhere = fileId => store.reports.some(report => [
            ...(report.fileIds || []), report.originalFileId, report.signatureFileId,
            ...(report.versions || []).flatMap(version => version.fileIds || [])].includes(fileId))
            || store.drafts.some(draft => draft.data?.fileIds?.includes(fileId));
          store.files = store.files.filter(file => !reportFiles.has(file.id) || referencedElsewhere(file.id));
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
        await flushUploadDeletes(deleted.removedUploads);
        const cleanupPending = (await storage.read()).pendingUploadDeletes.some(name => deleted.removedUploads.includes(name));
        const { removedUploads: _removedUploads, ...result } = deleted;
        return send(res, 200, { ok: true, deleted: result, cleanupPending });
      }

      if (parts[0] === "contracts" && parts.length === 1 && req.method === "POST") {
        const body = await readJson(req);
        const contract = await storage.mutate(store => {
          const input = contractInput(store, resolveInlineCustomer(store, body, user));
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
          const input = contractInput(store, resolveInlineCustomer(store, body, user, contract), contract);
          if ((input.visitsPerYear !== contract.visitsPerYear || input.startDate !== contract.startDate
            || input.endDate !== contract.endDate || input.contractValue !== contract.contractValue)
            && (store.billingRecords || []).some(row => row.contractId === contract.id && (row.request || row.invoice || row.payments?.length)))
            fail("Billing has started for this AMC. Preserve the contract value and payment schedule.", 409);
          if (store.contracts.some(item => item.id !== contract.id
            && String(item.number || "").toLocaleLowerCase("en-US") === input.number.toLocaleLowerCase("en-US")))
            fail("This AMC number is already in use", 409);
          if (input.visitsPerYear !== contract.visitsPerYear || input.startDate !== contract.startDate || input.endDate !== contract.endDate) {
            store.billingDeletedIds = (store.billingDeletedIds || []).filter(rowId => !rowId.startsWith(`amc:${contract.id}:`));
            const visits = store.visits.filter(item => item.contractId === contract.id);
            if (visits.some(item => item.workOrderId || item.status !== "Planned")) fail("Existing scheduled visits must be completed before changing the visit plan", 409);
            store.visits = store.visits.filter(item => item.contractId !== contract.id);
            planDates(input.startDate, input.endDate, input.visitsPerYear).forEach((plannedDate, index) => {
              store.visits.push({ id: random(), contractId: contract.id, sequence: index + 1, plannedDate, status: "Planned", workOrderId: "" });
            });
          }
          const identityChanged = input.customerName !== contract.customerName || input.site !== contract.site;
          const now = isoNow();
          Object.assign(contract, input, { updatedAt: now });
          if (identityChanged) {
            const identity = { customerId: contract.customerId, customerName: contract.customerName, site: contract.site, updatedAt: now };
            for (const schedule of store.schedules.filter(item => item.contractId === contract.id)) Object.assign(schedule, identity);
            for (const job of store.workOrders.filter(item => item.contractId === contract.id)) Object.assign(job, identity);
            const linkedJobIds = new Set(store.workOrders.filter(item => item.contractId === contract.id).map(item => item.id));
            for (const entry of store.attendance.filter(item => linkedJobIds.has(item.workOrderId))) entry.site = contract.site;
            for (const report of store.reports) {
              const linkedJob = find(store.workOrders, report.workOrderId);
              if (report.contractId !== contract.id && (report.contractId || linkedJob?.contractId !== contract.id)) continue;
              if (report.type === "Handwritten Upload") {
                report.extracted = { ...report.extracted, customerName: contract.customerName, siteName: contract.site };
                report.details = { ...report.details, customerName: contract.customerName };
              }
              report.updatedAt = now;
              report.history ||= [];
              report.history.push({ at: now, actor: user.name, action: "AMC customer or site updated" });
            }
          }
          addActivity(store, "contract", contract.id, user.name, `${contract.number} updated`);
          return contract;
        });
        return send(res, 200, result);
      }

      if (parts[0] === "schedules" && parts.length === 1 && req.method === "POST") {
        const body = await readJson(req);
        const published = body.mode === "notify";
        const finished = body.mode === "finished";
        const noticeIds = [];
        const result = await storage.mutate(store => {
          const current = body.id ? find(store.schedules, body.id) : store.schedules.find(item => item.clientKey && item.clientKey === body.clientKey);
          if (body.id && !current) fail("Schedule not found", 404);
          const linked = current?.workOrderId ? find(store.workOrders, current.workOrderId) : null;
          if (linked && ["Report Submitted", "Completed"].includes(linked.status)) fail("Work orders with submitted reports cannot be rescheduled", 409);
          const workOrderNumber = trim(body.workOrderNumber, 100) || linked?.number || current?.workOrderNumber || nextWorkOrderNumber(store);
          const normalizedNumber = workOrderNumber.toLocaleLowerCase("en-US");
          if (store.workOrders.some(item => item.id !== linked?.id && trim(item.number, 100).toLocaleLowerCase("en-US") === normalizedNumber)
            || store.schedules.some(item => item.id !== current?.id && !item.workOrderId
              && trim(item.workOrderNumber, 100).toLocaleLowerCase("en-US") === normalizedNumber))
            fail(`Work Order Number ${workOrderNumber} already exists`, 409);
          const inputBody = body.contractId ? body : resolveInlineCustomer(store, body, user, current);
          const input = validateSchedule(store, inputBody, published || finished ? (current || {}) : null, { allowUnassigned: finished });
          if (finished && (!input.contractId || !input.visitId)) fail("Choose a planned visit from an AMC contract");
          if (finished && input.serviceDate >= dubaiToday()) fail("Mark as Finished is available only for past service dates");
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
          Object.assign(schedule, input, { workOrderNumber, status: finished ? "Report Submitted" : published ? "Scheduled" : "Draft", updatedAt: now });
          const sequencePrefix = `WO-${new Date().getFullYear()}-`;
          const suffix = workOrderNumber.toUpperCase().startsWith(sequencePrefix) ? workOrderNumber.slice(sequencePrefix.length) : "";
          if (/^\d+$/.test(suffix)) store.sequence.workOrder = Math.max(Number(store.sequence.workOrder || 0), Number(suffix));
          if (!current) store.schedules.unshift(schedule);
          if (published || finished) {
            const job = workOrderFromSchedule(store, schedule, linked);
            schedule.workOrderId = job.id;
            if (schedule.visitId) {
              const visit = find(store.visits, schedule.visitId);
              Object.assign(visit, { workOrderId: job.id, plannedDate: schedule.serviceDate,
                status: finished ? "Completed" : "Scheduled", ...(finished ? { completedAt: now } : {}) });
            }
            if (finished) {
              const workCarriedOut = "Marked as Service Work Finished";
              const reportNumber = nextReportNumber(store);
              const extracted = Object.fromEntries(REPORT_FIELDS.map(key => [key, ""]));
              Object.assign(extracted, { reportNumber, serviceDate: input.serviceDate, customerName: input.customerName,
                siteName: input.site, technicianName: input.technicianIds.map(id => find(store.technicians, id)?.name).filter(Boolean).join(", "),
                workCarriedOut });
              const report = { id: random(), number: reportNumber, workOrderId: job.id, contractId: input.contractId,
                visitId: input.visitId, createdAt: now, history: [{ at: now, actor: user.name, action: "Created from completed AMC visit" }],
                versions: [], type: "Manual Entry", details: { customerName: input.customerName, workCarriedOut, materialsUsed: "", remarks: "" },
                checklist: {}, extracted, fileIds: [], originalFileId: "", signatureFileId: "", status: "Pending Review",
                submittedAt: now, submittedBy: user.name, reviewReason: "" };
              job.status = "Report Submitted";
              job.updatedAt = now;
              store.reports.unshift(report);
              addActivity(store, "workOrder", job.id, user.name, `${job.number} marked finished; ${report.number} submitted for review`);
              addActivity(store, "report", report.id, user.name, `${report.number} created from an AMC visit`);
              return { schedule, workOrder: job, report };
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
        const updated = find((await storage.read()).notifications, notice.id);
        return send(res, 200, { ok: true, status: updated.status, detail: updated.detail || "" });
      }

      if (parts[0] === "reports" && parts[1] === "upload" && parts.length === 2 && req.method === "POST") {
        const file = await acceptFile(req, { kind: "original" });
        const extraction = await extractHandwritten(file);
        if (url.searchParams.get("submit") !== "1") {
          await storage.mutate(store => { store.files.unshift(file); });
          return send(res, 201, { file: publicFile(file), ...extraction });
        }
        const report = await storage.mutate(store => {
          const now = isoNow();
          const extracted = Object.fromEntries(REPORT_FIELDS.map(key => [key, trim(extraction.fields?.[key], 1000)]));
          let number = trim(extracted.reportNumber, 100);
          if (!number || reportNumberTaken(store, number)) number = nextReportNumber(store);
          extracted.reportNumber = number;
          const details = { customerName: trim(extracted.customerName, 100), workCarriedOut: trim(extracted.workCarriedOut, 4000),
            materialsUsed: trim(extracted.materialsUsed, 2000), remarks: trim(extracted.remarks, 4000) };
          const item = { id: random(), number, workOrderId: "", contractId: "", visitId: "", createdAt: now,
            history: [{ at: now, actor: user.name, action: "Submitted" }], versions: [], type: "Handwritten Upload",
            details, checklist: {}, extracted, fileIds: [file.id], originalFileId: file.id, signatureFileId: "",
            status: "Pending Review", submittedAt: now, submittedBy: user.name, reviewReason: "" };
          store.files.unshift(file);
          store.reports.unshift(item);
          addActivity(store, "report", item.id, user.name, `${number} uploaded for office review`);
          return item;
        });
        return send(res, 201, { file: publicFile(file), report, ...extraction });
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
          const approved = report.status === "Approved";
          if (approved && (String(user.role).toLowerCase() !== "admin" || report.type !== "Handwritten Upload"))
            fail("Only Admin can re-edit an approved uploaded service report", 403);
          const workOrderId = Object.hasOwn(body, "workOrderId") ? trim(body.workOrderId, 80) : report.workOrderId;
          if (approved && workOrderId !== report.workOrderId) fail("An approved report cannot change work orders", 409);
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
          report.history.push({ at: isoNow(), actor: user.name, action: approved ? "Approved report re-edited" : "Details updated" });
          addActivity(store, "report", report.id, user.name, approved ? `${report.number} re-edited after approval` : `${report.number} details updated`);
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
          if (job) {
            const recipients = job.technicianIds.includes(item.submittedBy) ? [item.submittedBy] : job.technicianIds;
            recipients.forEach(id => noticeIds.push(createNotice(store, id, job, body.decision === "Approved" ? "approved" : "revision",
              `${job.number} report ${body.decision.toLowerCase()}${item.reviewReason ? `: ${item.reviewReason}` : ""}`)));
          }
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
    if (!mimeType || (!["contract", "original", "invoice", "receipt"].includes(target.kind) && mimeType === "application/pdf")) fail("Use PNG, JPEG, WebP, or PDF where supported");
    const file = { id: random(), kind: target.kind, contractId: target.contractId || "", workOrderId: target.workOrderId || "",
      billingId: target.billingId || "",
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
    const agreement = find(store.contracts, report.contractId || job?.contractId);
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
      ["Customer", agreement?.customerName || job?.customerName || report.details?.customerName || report.extracted?.customerName],
      ["Site", agreement?.site || job?.site || report.extracted?.siteName],
      ["Service date", job?.serviceDate || report.extracted?.serviceDate],
      ["Time", job?.startTime && job?.endTime ? `${job.startTime} - ${job.endTime}` : ""],
      ["Service type", job?.workType || report.type],
      ["Technicians", job ? job.technicianIds.map(id => find(store.technicians, id)?.name || "").filter(Boolean).join(", ") : report.extracted?.technicianName],
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
      section(report.type === "Handwritten Upload" ? "Handwritten report details" : "Service report details",
        REPORT_FIELDS.map(key => `${key}: ${report.extracted?.[key] || "-"}`).join("\n"));
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
      draft: store.drafts.find(item => item.workOrderId === job.id)?.data || null,
      files: store.files.filter(item => item.workOrderId === job.id && !["invoice", "receipt"].includes(item.kind)).map(publicFile),
      activity: store.activity.filter(item => item.targetId === job.id && item.kind !== "billing").slice(0, 20) };
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

  async function extractBillingDocument(file, kind) {
    if (!process.env.OPENAI_API_KEY) return { available: false, fields: {},
      message: "AI extraction is not configured. Enter and verify the document details manually." };
    const bytes = await readUpload("maintenance", file.storedName);
    if (!bytes) return { available: false, fields: {}, message: "Document saved. Enter the details manually." };
    const isInvoice = kind === "invoice";
    const names = isInvoice
      ? ["invoiceNumber", "invoiceDate", "customerName", "sourceReference", "amountExVat", "vatAmount", "total", "dueDate"]
      : ["invoiceNumber", "paymentDate", "amountReceived", "paymentMethod", "paymentReference"];
    const dataUrl = `data:${file.mimeType};base64,${bytes.toString("base64")}`;
    const instruction = isInvoice
      ? "Extract only clearly visible fields from this maintenance invoice: invoice number, invoice date, customer name, AMC or work order reference, amount before VAT, VAT amount, total amount and payment due date."
      : "Extract only clearly visible fields from this payment receipt: invoice number, payment date, amount received, payment method and payment reference.";
    const content = [{ type: "input_text", text: `${instruction} Use YYYY-MM-DD for dates and plain decimal numbers without currency symbols or separators for amounts. Return empty strings for missing or uncertain fields. Never infer or invent values. Return JSON only.` },
      file.mimeType === "application/pdf" ? { type: "input_file", filename: file.originalName, file_data: dataUrl }
        : { type: "input_image", image_url: dataUrl }];
    const schema = { type: "object", additionalProperties: false,
      properties: Object.fromEntries(names.map(name => [name, { type: "string" }])), required: names };
    try {
      const response = await fetch("https://api.openai.com/v1/responses", { method: "POST", signal: AbortSignal.timeout(18000),
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: process.env.OPENAI_MODEL || "gpt-4.1-mini", input: [{ role: "user", content }],
          text: { format: { type: "json_schema", name: isInvoice ? "maintenance_invoice_extract" : "maintenance_receipt_extract", strict: true, schema } } }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) return { available: false, fields: {}, message: "AI extraction is unavailable. Enter and verify the document details manually." };
      const output = result.output_text || (result.output || []).flatMap(item => item.content || [])
        .filter(item => item.type === "output_text").map(item => item.text).join("");
      const parsed = JSON.parse(output);
      const fields = Object.fromEntries(names.map(name => [name, typeof parsed[name] === "string" ? parsed[name].trim() : ""]));
      return { available: true, fields, message: "AI extracted document details. Verify every field before saving." };
    } catch {
      return { available: false, fields: {}, message: "AI extraction is unavailable. Enter and verify the document details manually." };
    }
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
          pushPublicKey: process.env.VAPID_PUBLIC_KEY || "", pushConfigured: !!(webPush && process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY),
          pushSubscribed: state.subscriptions.some(item => item.technicianId === technicianId), checklist: CHECKLIST });
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
            endTime: item.endTime, workType: item.workType, status: item.status })));
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
        if (job.status === "Completed") fail("Upload is unavailable for this job", 403);
        const file = await acceptFile(req, { workOrderId: job.id, technicianId, kind });
        await storage.mutate(store => { store.files.push(file); addActivity(store, "workOrder", job.id, auth.technician.name, `${kind} uploaded`); });
        return send(res, 201, publicFile(file));
      }
      if (parts[0] === "work-orders" && parts[2] === "files" && parts[3] && req.method === "DELETE") {
        const storedName = await storage.mutate(store => {
          const job = assignedJob(store, technicianId, parts[1]);
          if (job.status === "Completed") fail("Photo removal is unavailable for this job", 403);
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
          if (job.status === "Completed") fail("This job is completed", 409);
          const prior = store.reports.find(item => item.workOrderId === job.id);
          if (prior && !["Revision", "Rejected"].includes(prior.status)) fail("A report is already awaiting review", 409);
          const fileIds = unique(body.fileIds);
          if (fileIds.some(id => !store.files.some(file => file.id === id && file.workOrderId === job.id
            && ["photo", "original", "signature"].includes(file.kind)))) fail("A report file does not belong to this job", 403);
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
        if (!file || ["invoice", "receipt"].includes(file.kind) || !file.workOrderId
          || !auth.state.workOrders.some(job => job.id === file.workOrderId && job.technicianIds.includes(technicianId))) fail("File not found", 404);
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
