const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");
const { spawn } = require("node:child_process");

test("quotation and enquiry numbers populate linked quotation details both ways", { timeout: 30000 }, async () => {
  const probe = net.createServer();
  await new Promise(resolve => probe.listen(0, "127.0.0.1", resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "cz-quote-enquiry-link-"));
  const source = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
  fs.writeFileSync(path.join(temp, "server.js"), source.replace("const PORTS = [5175, 5176, 5177, 8085];", `const PORTS = [${port}];`));
  for (const name of ["project-progress.js", "maintenance-api.js", "maintenance-store.js", "maintenance-billing.js", "ool.js"]) {
    fs.copyFileSync(path.join(__dirname, "..", name), path.join(temp, name));
  }
  fs.mkdirSync(path.join(temp, "data"), { recursive: true });
  fs.writeFileSync(path.join(temp, "data", "ool-opening.json"), JSON.stringify(require("./fixtures/ool-opening")));
  const server = spawn(process.execPath, ["server.js"], {
    cwd: temp, env: { ...process.env, SUPABASE_URL: "", SUPABASE_KEY: "" }, stdio: ["ignore", "pipe", "pipe"]
  });
  let logs = "";
  server.stdout.on("data", chunk => { logs += chunk; });
  server.stderr.on("data", chunk => { logs += chunk; });
  const base = `http://127.0.0.1:${port}`;
  const json = body => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  try {
    for (let attempt = 0; attempt < 50; attempt++) {
      if (server.exitCode !== null) throw new Error(logs);
      try { await fetch(`${base}/api/auth/me`); break; } catch {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    const login = await fetch(`${base}/api/auth/login`, json({ email: "admin@comfortzone.local", password: "admin123" }));
    assert.equal(login.status, 200, logs);
    const cookie = login.headers.get("set-cookie").split(";")[0];
    const save = async (endpoint, body) => {
      const response = await fetch(`${base}${endpoint}`, { ...json(body), headers: { ...json(body).headers, Cookie: cookie } });
      if (response.status !== 200) assert.fail(`${endpoint}: ${response.status} ${await response.text()} ${logs}`);
      return response.json();
    };
    const enquiryFirst = await save("/api/sales-crm/leads", {
      enquiryNo: "LINK-E-1", customer: "Linked Customer", projectDescription: "Project A"
    });
    const quotationSecond = await save("/api/sales-crm/quotations?compact=1", {
      no: "LINK-Q-1", warranty: "LINK-E-1", customer: "Linked Customer", date: "13/11/2026",
      items: [{ description: "Unit", qty: 2, unitPrice: 100 }]
    });
    assert.equal(quotationSecond.linkedLead.id, enquiryFirst.savedItemId);
    assert.equal(quotationSecond.linkedLead.quoteNo, "LINK-Q-1");
    assert.equal(quotationSecond.linkedLead.quotedDate, "13/11/2026");
    assert.equal(quotationSecond.linkedLead.estimatedValue, 210);
    assert.ok(quotationSecond.linkedLead.preparedBy);
    const storePath = path.join(temp, "data", "sales-crm.json");
    const persisted = JSON.parse(fs.readFileSync(storePath, "utf8"));
    const legacyLead = persisted.leads.find(lead => lead.id === enquiryFirst.savedItemId);
    legacyLead.quoteNo = "";
    legacyLead.quotedDate = "";
    legacyLead.preparedBy = "";
    legacyLead.estimatedValue = 0;
    fs.writeFileSync(storePath, JSON.stringify(persisted));
    const linkedView = await (await fetch(`${base}/api/sales-crm`, { headers: { Cookie: cookie } })).json();
    const projectedLead = linkedView.leads.find(lead => lead.id === enquiryFirst.savedItemId);
    assert.equal(projectedLead.quoteNo, "LINK-Q-1");
    assert.equal(projectedLead.quotedDate, "13/11/2026");
    assert.equal(projectedLead.estimatedValue, 210);
    const duplicateEnquiryLink = await fetch(`${base}/api/sales-crm/quotations?compact=1`, {
      ...json({ no: "LINK-Q-3", warranty: "LINK-E-1", customer: "Linked Customer", items: [] }),
      headers: { ...json({}).headers, Cookie: cookie }
    });
    assert.equal(duplicateEnquiryLink.status, 409);
    assert.match((await duplicateEnquiryLink.json()).error, /already linked to another quotation/i);

    const quotationFirst = await save("/api/sales-crm/quotations?compact=1", {
      no: "LINK-Q-2", customer: "Linked Customer", date: "14/11/2026",
      items: [{ description: "Unit", qty: 1, unitPrice: 50 }]
    });
    const enquirySecond = await save("/api/sales-crm/leads", {
      enquiryNo: "LINK-E-2", quoteNo: "LINK-Q-2", customer: "Linked Customer", projectDescription: "Project B"
    });
    const filled = enquirySecond.leads.find(lead => lead.id === enquirySecond.savedItemId);
    assert.equal(filled.quotedDate, "14/11/2026");
    assert.equal(filled.preparedBy, quotationFirst.savedItem.salesperson);
    assert.equal(filled.estimatedValue, 52.5);
    assert.equal(enquirySecond.quotations.find(quote => quote.id === quotationFirst.savedItemId).warranty, "LINK-E-2");
    const duplicateLink = await fetch(`${base}/api/sales-crm/leads`, {
      ...json({ enquiryNo: "LINK-E-3", quoteNo: "LINK-Q-2", customer: "Linked Customer", projectDescription: "Project C" }),
      headers: { ...json({}).headers, Cookie: cookie }
    });
    assert.equal(duplicateLink.status, 409);
    assert.match((await duplicateLink.json()).error, /already linked to another enquiry/i);
    const wrongCustomer = await fetch(`${base}/api/sales-crm/leads`, {
      ...json({ enquiryNo: "LINK-E-4", quoteNo: "LINK-Q-1", customer: "Different Customer", projectDescription: "Project D" }),
      headers: { ...json({}).headers, Cookie: cookie }
    });
    assert.equal(wrongCustomer.status, 409);
    assert.match((await wrongCustomer.json()).error, /different customer/i);
    const clearedFromEnquiry = await save("/api/sales-crm/leads", {
      ...filled, quoteNo: ""
    });
    const clearedLead = clearedFromEnquiry.leads.find(lead => lead.id === enquirySecond.savedItemId);
    assert.equal(clearedLead.quoteNo, "");
    assert.equal(clearedLead.quotedDate, "");
    assert.equal(clearedLead.preparedBy, "");
    assert.equal(clearedLead.estimatedValue, 0);
    assert.equal(clearedFromEnquiry.quotations.find(quote => quote.id === quotationFirst.savedItemId).warranty, "");

    const clearedFromQuotation = await save("/api/sales-crm/quotations?compact=1", {
      ...quotationSecond.savedItem, warranty: ""
    });
    assert.equal(clearedFromQuotation.savedItem.warranty, "");
    assert.equal(clearedFromQuotation.unlinkedLeads[0].id, enquiryFirst.savedItemId);
    const afterQuoteClear = await (await fetch(`${base}/api/sales-crm`, { headers: { Cookie: cookie } })).json();
    const unlinkedLead = afterQuoteClear.leads.find(lead => lead.id === enquiryFirst.savedItemId);
    assert.equal(unlinkedLead.quoteNo, "");
    assert.equal(unlinkedLead.quotedDate, "");
    assert.equal(unlinkedLead.preparedBy, "");
    assert.equal(unlinkedLead.estimatedValue, 0);
  } finally {
    server.kill();
  }
});
