const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");
const { spawn } = require("node:child_process");

async function freePort() {
  const probe = net.createServer();
  await new Promise(resolve => probe.listen(0, "127.0.0.1", resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  return port;
}

test("entered enquiry and quotation numbers persist and drive the next number", { timeout: 30000 }, async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "cz-quote-numbering-"));
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const source = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
  fs.writeFileSync(path.join(temp, "server.js"), source.replace("const PORTS = [5175, 5176, 5177, 8085];", `const PORTS = [${port}];`));
  fs.copyFileSync(path.join(__dirname, "..", "project-progress.js"), path.join(temp, "project-progress.js"));
  const server = spawn(process.execPath, ["server.js"], {
    cwd: temp, env: { ...process.env, SUPABASE_URL: "", SUPABASE_KEY: "" }, stdio: ["ignore", "pipe", "pipe"]
  });
  let logs = "";
  server.stdout.on("data", chunk => { logs += chunk; });
  server.stderr.on("data", chunk => { logs += chunk; });
  const json = body => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const request = (cookie, endpoint, options = {}) => fetch(`${base}${endpoint}`, {
    ...options, headers: { Cookie: cookie, ...options.headers }
  });
  const save = async (cookie, endpoint, body) => {
    const response = await request(cookie, endpoint, json(body));
    if (response.status !== 200) assert.fail(`${endpoint}: ${response.status} ${await response.text()}; ${logs}`);
    return response.json();
  };
  try {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      if (server.exitCode !== null) throw new Error(logs);
      try { await fetch(`${base}/api/auth/me`); break; } catch {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    const login = async (email, password) => {
      const response = await fetch(`${base}/api/auth/login`, json({ email, password }));
      assert.equal(response.status, 200, logs);
      return response.headers.get("set-cookie").split(";")[0];
    };
    const admin = await login("admin@comfortzone.local", "admin123");
    const year = String(new Date().getFullYear()).slice(-2);
    const adminNo = `EN${year}-1212`;
    const first = await save(admin, "/api/sales-crm/quotations", { no: adminNo, customer: "A", items: [] });
    assert.equal(first.quotations[0].no, adminNo);
    assert.equal(first.settings.nextQuotationNo, `EN${year}-1213`);
    assert.equal((await (await request(admin, "/api/sales-crm")).json()).settings.nextQuotationNo, `EN${year}-1213`);
    const second = await save(admin, "/api/sales-crm/quotations", { customer: "B", items: [] });
    assert.equal(second.quotations[0].no, `EN${year}-1213`);
    const revision = await save(admin, "/api/sales-crm/quotations", { no: `${adminNo}-R1`, customer: "A", items: [] });
    assert.equal(revision.quotations[0].no, `${adminNo}-R1`);
    assert.equal(revision.settings.nextQuotationNo, `EN${year}-1214`);
    const nextRevision = await save(admin, "/api/sales-crm/quotations", { no: `${adminNo}-R1`, customer: "A", items: [] });
    assert.equal(nextRevision.quotations[0].no, `${adminNo}-R2`);
    const duplicate = await request(admin, "/api/sales-crm/quotations", json({ no: adminNo, customer: "C", items: [] }));
    assert.equal(duplicate.status, 409);
    const adminEnquiryNo = `EN${year}-1212`;
    const firstEnquiry = await save(admin, "/api/sales-crm/leads", {
      enquiryNo: adminEnquiryNo, customer: "Admin Customer", projectDescription: "Project A"
    });
    assert.equal(firstEnquiry.leads[0].enquiryNo, adminEnquiryNo);
    assert.equal(firstEnquiry.settings.nextEnquiryNo, `EN${year}-1213`);
    assert.equal((await (await request(admin, "/api/sales-crm")).json()).settings.nextEnquiryNo, `EN${year}-1213`);
    const secondEnquiry = await save(admin, "/api/sales-crm/leads", {
      customer: "Admin Customer 2", projectDescription: "Project B"
    });
    assert.equal(secondEnquiry.leads[0].enquiryNo, `EN${year}-1213`);
    const duplicateEnquiry = await request(admin, "/api/sales-crm/leads", json({
      enquiryNo: adminEnquiryNo, customer: "Duplicate", projectDescription: "Project C"
    }));
    assert.equal(duplicateEnquiry.status, 409);

    for (const name of ["Alice", "Bob"]) {
      await save(admin, "/api/settings/users", {
        name, email: `${name.toLowerCase()}@example.test`, role: "Staff", password: "test-password"
      });
    }
    const alice = await login("alice@example.test", "test-password");
    const bob = await login("bob@example.test", "test-password");
    const collidingNext = await save(alice, "/api/sales-crm/quotations", {
      no: `EN${year}-1211`, customer: "Alice Earlier Customer", items: []
    });
    assert.equal(collidingNext.settings.nextQuotationNo, `EN${year}-1214`);
    const staffNo = `EN${year}-2200`;
    const staffQuote = await save(alice, "/api/sales-crm/quotations", { no: staffNo, customer: "Alice Customer", items: [] });
    assert.equal(staffQuote.quotations[0].no, staffNo);
    assert.equal(staffQuote.settings.nextQuotationNo, `EN${year}-2201`);
    const nextStaffQuote = await save(alice, "/api/sales-crm/quotations", { customer: "Alice Customer 2", items: [] });
    assert.equal(nextStaffQuote.quotations[0].no, `EN${year}-2201`);
    const staffEnquiryNo = `EN${year}-2200`;
    const staffEnquiry = await save(alice, "/api/sales-crm/leads", {
      enquiryNo: staffEnquiryNo, customer: "Alice Customer", projectDescription: "Alice Project"
    });
    assert.equal(staffEnquiry.leads[0].enquiryNo, staffEnquiryNo);
    assert.equal(staffEnquiry.settings.nextEnquiryNo, `EN${year}-2201`);
    const nextStaffEnquiry = await save(alice, "/api/sales-crm/leads", {
      customer: "Alice Customer 2", projectDescription: "Alice Project 2"
    });
    assert.equal(nextStaffEnquiry.leads[0].enquiryNo, `EN${year}-2201`);
    const bobView = await (await request(bob, "/api/sales-crm")).json();
    assert.match(bobView.settings.nextQuotationNo, /^CZ-QTN-\d{2}-S[A-Z0-9]+-001$/);
    assert.match(bobView.settings.nextEnquiryNo, /^EN\d{2}-S[A-Z0-9]+-1001$/);
    assert.equal(bobView.quotations.length, 0);
    assert.equal(bobView.leads.length, 0);
    const bobGenerated = await save(bob, "/api/sales-crm/leads", {
      customer: "Bob First Customer", projectDescription: "Bob First Project"
    });
    assert.match(bobGenerated.leads[0].enquiryNo, /^EN\d{2}-S[A-Z0-9]+-1001$/);
    for (const number of [101, 102]) {
      const result = await save(bob, "/api/sales-crm/leads", {
        enquiryNo: `ENQ-${year}-${number}`, customer: `Bob Customer ${number}`, projectDescription: `Bob Project ${number}`
      });
      assert.equal(result.leads[0].enquiryNo, `ENQ-${year}-${number}`);
    }
    const bobNext = await (await request(bob, "/api/sales-crm")).json();
    assert.equal(bobNext.settings.nextEnquiryNo, `ENQ-${year}-103`);
    assert.equal((await (await request(alice, "/api/sales-crm")).json()).settings.nextEnquiryNo, `EN${year}-2202`);
    const bobQuote = await save(bob, "/api/sales-crm/quotations", {
      no: `CZ-QTN-${year}-001`, customer: "Bob Customer", items: []
    });
    assert.equal(bobQuote.quotations[0].no, `CZ-QTN-${year}-001`);
    assert.equal(bobQuote.settings.nextQuotationNo, `CZ-QTN-${year}-002`);
  } finally {
    server.kill();
    if (server.exitCode === null) await new Promise(resolve => server.once("exit", resolve));
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
