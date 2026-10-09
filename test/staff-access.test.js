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

test("Staff owns sales records and can only view purchase orders", { timeout: 30000 }, async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "cz-staff-access-"));
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
  const json = (body, method = "POST") => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const request = (cookie, endpoint, options = {}) => fetch(`${base}${endpoint}`, {
    ...options, headers: { Cookie: cookie, ...options.headers }
  });
  const read = async (cookie, endpoint) => (await request(cookie, endpoint)).json();
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
    const addStaff = async (name, email) => {
      await save(admin, "/api/settings/users", { name, email, role: "Staff", password: "test-password" });
      return login(email, "test-password");
    };
    const alice = await addStaff("Alice", "alice@example.test");
    const bob = await addStaff("Bob", "bob@example.test");
    assert.deepEqual((await read(alice, "/api/settings")).settings.users, []);

    const aliceLead = await save(alice, "/api/sales-crm/leads", { customer: "A", projectDescription: "A project" });
    const bobLead = await save(bob, "/api/sales-crm/leads", { customer: "B", projectDescription: "B project" });
    assert.equal(aliceLead.leads.length, 1);
    assert.equal(bobLead.leads.length, 1);
    const aliceNo = aliceLead.leads[0].enquiryNo;
    const bobNo = bobLead.leads[0].enquiryNo;
    assert.notEqual(aliceNo, bobNo);
    assert.match(aliceNo, /^EN\d{2}-[A-Z0-9]+-1001$/);
    const aliceSecondLead = await save(alice, "/api/sales-crm/leads", { customer: "A2", projectDescription: "A2 project" });
    assert.match(aliceSecondLead.leads[0].enquiryNo, /-1002$/);
    assert.equal(aliceSecondLead.settings.nextEnquiryNo.endsWith("-1003"), true);
    assert.equal((await read(alice, "/api/sales-crm")).leads.length, 2);
    assert.ok((await read(admin, "/api/sales-crm")).leads.length >= 2);
    const bobLeadId = bobLead.leads[0].id;
    assert.equal((await request(alice, "/api/sales-crm/leads", json({
      id: bobLeadId, customer: "Changed", projectDescription: "Changed"
    }))).status, 403);
    assert.equal((await request(alice, `/api/sales-crm/leads/${bobLeadId}`, { method: "DELETE" })).status, 403);

    const aliceSheet = await save(alice, "/api/costing/sheets", { title: "A costing" });
    const bobSheet = await save(bob, "/api/costing/sheets", { title: "B costing" });
    assert.equal(aliceSheet.sheets.length, 1);
    assert.equal(bobSheet.sheets.length, 1);
    assert.equal((await read(alice, "/api/costing")).sheets.length, 1);
    assert.equal((await request(alice, "/api/costing/sheets", json(bobSheet.sheets[0]))).status, 403);
    assert.equal((await request(alice, `/api/costing/sheets/${bobSheet.sheets[0].id}`, { method: "DELETE" })).status, 403);

    const aliceQuote = await save(alice, "/api/sales-crm/quotations", { customer: "A", project: "A project", items: [] });
    const bobQuote = await save(bob, "/api/sales-crm/quotations", { customer: "B", project: "B project", items: [] });
    assert.equal(aliceQuote.quotations.length, 1);
    assert.equal(bobQuote.quotations.length, 1);
    assert.notEqual(aliceQuote.quotations[0].no, bobQuote.quotations[0].no);
    assert.match(aliceQuote.quotations[0].no, /^CZ-QTN-\d{2}-[A-Z0-9]+-001$/);
    const aliceSecondQuote = await save(alice, "/api/sales-crm/quotations", { customer: "A2", project: "A2 project", items: [] });
    assert.match(aliceSecondQuote.quotations[0].no, /-002$/);
    assert.equal((await request(alice, "/api/sales-crm/quotations", json({ ...bobQuote.quotations[0], status: "Sent" }))).status, 403);

    await save(admin, "/api/purchase-orders", { supplierName: "Supplier A", projectName: "Project A" });
    assert.equal((await request(alice, "/api/purchase-orders")).status, 200);
    assert.equal((await request(alice, "/api/purchase-orders", json({ supplierName: "Bad" }))).status, 403);
    assert.equal((await request(alice, "/api/purchase-orders/suppliers", json({ supplierName: "Bad" }))).status, 403);
    assert.equal((await request(alice, "/api/area-calculations")).status, 403);
    assert.equal((await request(alice, "/api/project-management/dashboard")).status, 403);
    assert.equal((await request(alice, "/api/settings/users", json({ name: "Bad", email: "bad@example.test" }))).status, 403);
  } finally {
    server.kill();
    if (server.exitCode === null) await new Promise(resolve => server.once("exit", resolve));
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
