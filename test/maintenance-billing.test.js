const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { createMaintenanceApi } = require("../maintenance-api");
const { billingRows } = require("../maintenance-billing");

test("AMC payment installments accept both ISO and displayed DD/MM/YYYY dates", () => {
  const record = { id: "amc-date", number: "AMC-TEST", customerName: "Date Test", site: "Dubai",
    startDate: "16/10/2026", endDate: "15/10/2027", visitsPerYear: 4, contractValue: 10000 };
  const rows = billingRows({ contracts: [record], workOrders: [], billingRecords: [] });
  assert.equal(rows.length, 4);
  assert.deepEqual(rows.map(row => row.periodStart), ["2026-10-16", "2027-01-15", "2027-04-16", "2027-07-16"]);
  assert.deepEqual(rows.map(row => row.periodEnd), ["2027-01-14", "2027-04-15", "2027-07-15", "2027-10-15"]);
  assert.equal(rows.reduce((sum, row) => sum + row.amountExVat, 0), 10000);
});

test("AMC, non-AMC and additional billing share one ledger without duplicate charges or payments", async () => {
  const dataDir = fs.mkdtempSync(path.join(__dirname, ".maintenance-billing-test-"));
  const uploads = new Map();
  const priorSecret = process.env.FIELD_SESSION_SECRET;
  const priorOpenAiKey = process.env.OPENAI_API_KEY;
  process.env.FIELD_SESSION_SECRET = "billing-test-session-secret";
  delete process.env.OPENAI_API_KEY;
  const api = createMaintenanceApi({ dataDir, supabase: null,
    send: (res, status, value) => { res.status = status; res.body = value; },
    readJson: async req => req.body || {}, collect: async () => Buffer.alloc(0),
    parseMultipart: () => [{ filename: "invoice.pdf", body: Buffer.from("%PDF-1.7\nTest invoice") }],
    saveUpload: async (_scope, name, bytes) => uploads.set(name, bytes),
    readUpload: async (_scope, name) => uploads.get(name), deleteUpload: async (_scope, name) => uploads.delete(name),
    readSettings: async () => ({}) });
  const admin = { role: "Admin", name: "Administrator" };
  const mts = { role: "MTS", name: "Engineer" };
  const call = async (method, route, body = {}, user = admin) => {
    const res = { status: 0, body: null, writeHead(code, headers) { this.status = code; this.headers = headers; }, end(bytes) { this.bytes = bytes; } };
    await api.routeOffice({ method, body, headers: { host: "localhost:5175" } }, res,
      new URL(route, "http://localhost:5175"), user);
    return res;
  };
  const summary = async () => (await call("GET", "/api/maintenance/summary")).body;
  const billing = async id => (await summary()).billing.find(row => row.id === id);
  try {
    const contract = (await call("POST", "/api/maintenance/contracts", { customerName: "Arabian Center", site: "Dubai",
      startDate: "2026-01-01", endDate: "2026-12-31", visitsPerYear: 4, contractValue: 12000, unitCount: 1 })).body;
    assert.ok(contract.id);
    await api.storage.mutate(store => {
      store.workOrders.push({ id: "linked-job", number: "CZWO-2026-001", contractId: contract.id,
        customerName: "Arabian Center", site: "Dubai", serviceDate: "2026-07-15" });
      store.workOrders.push({ id: "standalone-job", number: "CZWO-2026-002", contractId: "",
        customerName: "Standalone", site: "Sharjah", serviceDate: "2026-07-20" });
    });
    let data = await summary();
    const installments = data.billing.filter(row => row.contractId === contract.id);
    assert.equal(installments.length, 4);
    assert.equal(installments.reduce((sum, row) => sum + row.amountExVat, 0), 12000);
    assert.equal(data.billing.filter(row => row.workOrderId === "linked-job").length, 0);
    assert.equal(data.billing.find(row => row.workOrderId === "standalone-job").sourceType, "Work Order");

    const first = installments[0].id;
    assert.equal((await call("POST", `/api/maintenance/billing/${encodeURIComponent(first)}/request`, { remarks: "First installment" }, mts)).status, 201);
    assert.equal((await call("POST", `/api/maintenance/billing/${encodeURIComponent(first)}/request`, {}, mts)).status, 409);
    assert.equal((await call("POST", `/api/maintenance/billing/${encodeURIComponent(first)}/handoff`, {}, mts)).status, 403);
    assert.equal((await call("POST", `/api/maintenance/billing/${encodeURIComponent(first)}/handoff`)).status, 200);
    const uploaded = await call("POST", `/api/maintenance/billing/${encodeURIComponent(first)}/invoice-upload`);
    assert.equal(uploaded.status, 201);
    assert.equal(uploaded.body.file.mimeType, "application/pdf");
    const invoice = { number: "INV-001", date: "2026-01-02", dueDate: "2099-01-31", customerName: "Arabian Center",
      amountExVat: 3000, vatAmount: 150, total: 3150, fileId: uploaded.body.file.id };
    assert.equal((await call("POST", `/api/maintenance/billing/${encodeURIComponent(first)}/invoice`,
      { ...invoice, customerName: "Different Customer" })).status, 409);
    assert.equal((await call("POST", `/api/maintenance/billing/${encodeURIComponent(first)}/invoice`, invoice)).status, 201);
    const invoiceFile = await call("GET", `/api/maintenance/files/${uploaded.body.file.id}`);
    assert.equal(invoiceFile.status, 200);
    assert.match(invoiceFile.headers["Content-Type"], /application\/pdf/);
    assert.equal(invoiceFile.bytes.toString(), "%PDF-1.7\nTest invoice");
    assert.equal((await call("DELETE", `/api/maintenance/billing/${encodeURIComponent(first)}/uploads/${uploaded.body.file.id}`)).status, 409);
    assert.equal((await call("POST", `/api/maintenance/billing/${encodeURIComponent(installments[1].id)}/invoice`, invoice)).status, 409);
    assert.equal((await call("POST", `/api/maintenance/billing/${encodeURIComponent(installments[1].id)}/invoice`,
      { ...invoice, number: "INV-002", dueDate: "2026-01-31", fileId: "" })).status, 201);
    assert.equal((await billing(installments[1].id)).paymentStatus, "Overdue");
    assert.equal((await call("POST", `/api/maintenance/billing/${encodeURIComponent(first)}/sent`)).status, 200);
    assert.equal((await call("POST", `/api/maintenance/billing/${encodeURIComponent(first)}/payments`,
      { amount: 1500, date: "2026-01-18", method: "Bank Transfer", reference: "TRF-001" }, mts)).status, 403);
    const firstPayment = { amount: 1500, date: "2026-01-18", method: "Bank Transfer", reference: "TRF-001" };
    assert.equal((await call("POST", `/api/maintenance/billing/${encodeURIComponent(first)}/payments`, firstPayment)).status, 201);
    assert.equal((await call("POST", `/api/maintenance/billing/${encodeURIComponent(first)}/payments`, firstPayment)).status, 409);
    assert.equal((await billing(first)).paymentStatus, "Partially Paid");
    assert.equal((await billing(first)).outstanding, 1650);
    assert.equal((await call("POST", `/api/maintenance/billing/${encodeURIComponent(first)}/payments`,
      { amount: 1650, date: "2026-01-20", method: "Bank Transfer", reference: "TRF-002" })).status, 201);
    assert.equal((await billing(first)).paymentStatus, "Paid");
    assert.equal((await billing(first)).outstanding, 0);
    assert.equal((await billing(first)).invoice.fileId, uploaded.body.file.id);

    const extra = (await call("POST", "/api/maintenance/billing/extra", { workOrderId: "linked-job",
      amountExVat: 500, description: "Repair outside AMC" })).body;
    assert.equal(extra.sourceType, "Additional Charge");
    data = await summary();
    assert.equal(data.billing.filter(row => row.sourceType === "AMC").reduce((sum, row) => sum + row.amountExVat, 0), 12000);
    assert.equal(data.billing.find(row => row.id === extra.id).amountExVat, 500);
    const standaloneId = data.billing.find(row => row.workOrderId === "standalone-job").id;
    assert.equal((await call("PUT", `/api/maintenance/billing/${encodeURIComponent(standaloneId)}`,
      { amountExVat: 1000, vatRate: 5 })).status, 200);
    assert.equal((await call("POST", `/api/maintenance/billing/${encodeURIComponent(standaloneId)}/request`, {}, mts)).status, 201);
    assert.equal((await billing(standaloneId)).reference, "CZWO-2026-002");
    assert.equal((await summary()).billing.filter(row => row.sourceType === "Work Order").length, 1);
    const standaloneInvoice = await call("POST", `/api/maintenance/billing/${encodeURIComponent(standaloneId)}/invoice-upload`);
    assert.equal(standaloneInvoice.status, 201);

    await api.storage.mutate(store => {
      store.technicians.push({ id: "field-tech", name: "Field Tech", code: "T-01", active: true });
      store.workOrders.find(row => row.id === "standalone-job").technicianIds = ["field-tech"];
      store.files.push({ id: "public-photo", workOrderId: "standalone-job", kind: "photo",
        storedName: "public-photo.png", originalName: "photo.png", mimeType: "image/png" });
    });
    const payload = Buffer.from(JSON.stringify({ technicianId: "field-tech", issuedAt: Date.now(),
      exp: Date.now() + 60000 })).toString("base64url");
    const signature = crypto.createHmac("sha256", process.env.FIELD_SESSION_SECRET).update(payload).digest("base64url");
    const field = async route => {
      const res = { status: 0, body: null, setHeader() {} };
      await api.routeField({ method: "GET", headers: { host: "localhost:5175", cookie: `cz_field=${payload}.${signature}` } },
        res, new URL(route, "http://localhost:5175"));
      return res;
    };
    const fieldJob = await field("/api/field/work-orders/standalone-job");
    assert.equal(fieldJob.status, 200, JSON.stringify(fieldJob.body));
    assert.deepEqual(fieldJob.body.files.map(file => file.id), ["public-photo"]);
    assert.equal(fieldJob.body.activity.some(entry => /invoice|payment|charge/i.test(entry.message)), false);
    assert.equal((await field(`/api/field/files/${standaloneInvoice.body.file.id}`)).status, 404);
    const orphanName = (await api.storage.read()).files.find(file => file.id === standaloneInvoice.body.file.id).storedName;
    await api.storage.mutate(store => { store.files.find(file => file.id === standaloneInvoice.body.file.id).createdAt = "2020-01-01T00:00:00Z"; });
    assert.equal((await summary()).files.some(file => file.id === standaloneInvoice.body.file.id), false);
    assert.equal(uploads.has(orphanName), false);
    const canceled = await call("POST", `/api/maintenance/billing/${encodeURIComponent(standaloneId)}/invoice-upload`);
    const canceledName = (await api.storage.read()).files.find(file => file.id === canceled.body.file.id).storedName;
    assert.equal((await call("DELETE", `/api/maintenance/billing/${encodeURIComponent(standaloneId)}/uploads/${canceled.body.file.id}`)).status, 200);
    assert.equal(uploads.has(canceledName), false);
    assert.equal((await call("DELETE", `/api/maintenance/contracts/${contract.id}`)).status, 200);
    assert.equal((await summary()).billing.filter(row => row.contractId === contract.id).length, 0);
    assert.equal((await call("DELETE", "/api/maintenance/work-orders/standalone-job")).status, 200);
    assert.equal((await summary()).billing.length, 0);
  } finally {
    if (priorSecret === undefined) delete process.env.FIELD_SESSION_SECRET;
    else process.env.FIELD_SESSION_SECRET = priorSecret;
    if (priorOpenAiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = priorOpenAiKey;
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test("invoice and receipt OCR fills review fields but never confirms payment", async () => {
  const dataDir = fs.mkdtempSync(path.join(__dirname, ".maintenance-billing-ocr-test-"));
  const files = new Map();
  const priorKey = process.env.OPENAI_API_KEY;
  const priorFetch = global.fetch;
  process.env.OPENAI_API_KEY = "billing-ocr-test-key";
  const prompts = [];
  global.fetch = async (url, options) => {
    assert.equal(url, "https://api.openai.com/v1/responses");
    const input = JSON.parse(options.body);
    prompts.push(input.text.format.name);
    const fields = input.text.format.name === "maintenance_invoice_extract"
      ? { invoiceNumber: "INV-002", invoiceDate: "2026-02-01", customerName: "Wrong Customer",
        sourceReference: "OTHER-WO", amountExVat: "5000", vatAmount: "250", total: "5250", dueDate: "2026-02-28" }
      : { invoiceNumber: "INV-002", paymentDate: "2026-02-10", amountReceived: "5000",
        paymentMethod: "Bank Transfer", paymentReference: "TRF-002" };
    return { ok: true, json: async () => ({ output_text: JSON.stringify(fields) }) };
  };
  const api = createMaintenanceApi({ dataDir, supabase: null,
    send: (res, status, value) => { res.status = status; res.body = value; },
    readJson: async req => req.body || {}, collect: async () => Buffer.alloc(0),
    parseMultipart: () => [{ filename: "financial-document.pdf", body: Buffer.from("%PDF-1.7\nFinancial test") }],
    saveUpload: async (_scope, name, bytes) => files.set(name, bytes),
    readUpload: async (_scope, name) => files.get(name), deleteUpload: async (_scope, name) => files.delete(name),
    readSettings: async () => ({}) });
  const call = async (method, route, body = {}) => {
    const res = { status: 0, body: null };
    await api.routeOffice({ method, body, headers: { host: "localhost:5175" } }, res,
      new URL(route, "http://localhost:5175"), { role: "Admin", name: "Admin" });
    return res;
  };
  try {
    await api.storage.mutate(store => store.workOrders.push({ id: "ocr-job", number: "CZWO-2026-004",
      contractId: "", customerName: "Correct Customer", site: "Dubai", serviceDate: "2026-02-01" }));
    const id = "wo:ocr-job";
    assert.equal((await call("PUT", `/api/maintenance/billing/${encodeURIComponent(id)}`, { amountExVat: 3000 })).status, 200);
    const invoiceUpload = await call("POST", `/api/maintenance/billing/${encodeURIComponent(id)}/invoice-upload`);
    assert.equal(invoiceUpload.status, 201);
    assert.equal(invoiceUpload.body.available, true);
    assert.equal(invoiceUpload.body.fields.invoiceNumber, "INV-002");
    assert.equal(invoiceUpload.body.warnings.length, 3);
    assert.equal((await call("POST", `/api/maintenance/billing/${encodeURIComponent(id)}/invoice`, {
      number: "INV-002", date: "2026-02-01", customerName: "Correct Customer", sourceReference: "CZWO-2026-004",
      amountExVat: 3000, vatAmount: 150, total: 3150, fileId: invoiceUpload.body.file.id })).status, 201);
    const receiptUpload = await call("POST", `/api/maintenance/billing/${encodeURIComponent(id)}/receipt-upload`);
    assert.equal(receiptUpload.body.available, true);
    assert.equal(receiptUpload.body.fields.paymentReference, "TRF-002");
    assert.match(receiptUpload.body.warnings.join(" "), /exceeds the outstanding balance/);
    const record = (await call("GET", "/api/maintenance/summary")).body.billing.find(item => item.id === id);
    assert.equal(record.paymentStatus, "Unpaid");
    assert.equal(record.totalPaid, 0);
    assert.deepEqual(prompts, ["maintenance_invoice_extract", "maintenance_receipt_extract"]);
  } finally {
    if (priorKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = priorKey;
    global.fetch = priorFetch;
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
