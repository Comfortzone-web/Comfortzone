const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");
const { spawn } = require("node:child_process");

test("new projects start with one blank advance payment and not-started testing", { timeout: 20000 }, async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "cz-project-defaults-"));
  const probe = net.createServer();
  await new Promise(resolve => probe.listen(0, "127.0.0.1", resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  const source = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
  assert.match(source, /const PORTS = \[5175, 5176, 5177, 8085\];/);
  fs.writeFileSync(path.join(temp, "server.js"), source.replace("const PORTS = [5175, 5176, 5177, 8085];", `const PORTS = [${port}];`));
  fs.copyFileSync(path.join(__dirname, "..", "project-progress.js"), path.join(temp, "project-progress.js"));
  const server = spawn(process.execPath, ["server.js"], { cwd: temp, env: { ...process.env, SUPABASE_URL: "", SUPABASE_KEY: "" }, stdio: "ignore" });
  try {
    let ready = false;
    for (let attempt = 0; attempt < 50; attempt += 1) {
      if (server.exitCode !== null) throw new Error("Test server exited before it was ready");
      try { await fetch(`${base}/api/auth/me`); ready = true; break; } catch {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(ready, "Test server did not start");
    const login = await fetch(`${base}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "admin@comfortzone.local", password: "admin123" }) });
    assert.equal(login.status, 200);
    const cookie = login.headers.get("set-cookie").split(";")[0];
    const request = (endpoint, method, body) => fetch(`${base}${endpoint}`, {
      method, headers: { Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify(body)
    });

    const created = await request("/api/project-management/projects", "POST", { name: "Project defaults test", contractValue: 1000000 });
    assert.equal(created.status, 201);
    let project = await created.json();
    assert.equal(project.payments.length, 1);
    assert.equal(project.payments[0].milestone, "Advance Payment");
    assert.equal(project.payments[0].amount, "");
    assert.equal(project.payments[0].percentage, 0);
    assert.deepEqual(project.variationPayments, []);
    assert.deepEqual(project.testingItems.map(item => item.status), ["Not Started", "Not Started", "Not Started", "Not Started"]);
    assert.equal(project.derived.progress, 0);

    const endpoint = `/api/project-management/projects/${project.id}`;
    project = await (await request(endpoint, "PUT", project)).json();
    assert.equal(project.payments[0].amount, "");
    project.payments[0].amount = 123.45;
    project.testingItems[1].status = "In Progress";
    project = await (await request(endpoint, "PUT", project)).json();
    assert.equal(project.payments[0].amount, 123.45);
    assert.equal(project.testingItems[1].status, "In Progress");
    assert.equal(project.testingItems[0].status, "Not Started");

    project.variationPayments = [
      { id: "variation-blank", milestone: "", amount: "", dueDate: "", status: "Pending", comments: "" },
      { id: "variation-received", milestone: "Additional works", amount: 500.25, dueDate: "", status: "Received", comments: "" }
    ];
    project = await (await request(endpoint, "PUT", project)).json();
    assert.equal(project.variationPayments.length, 2);
    assert.equal(project.variationPayments[0].milestone, "");
    assert.equal(project.variationPayments[0].amount, "");
    assert.equal(project.variationPayments[1].amount, 500.25);
    assert.equal(project.derived.receivedPayment, 0);
    assert.equal(project.derived.pendingPayment, 1050000);
    let dashboard = await (await request("/api/project-management/dashboard", "GET")).json();
    assert.equal(dashboard.kpis.paymentPending, 1050000);
    assert.equal(dashboard.projects[0].derived.receivedPayment, 0);

    project.payments[0].status = "Received";
    project = await (await request(endpoint, "PUT", project)).json();
    assert.equal(project.derived.receivedPayment, 123.45);
    assert.equal(project.derived.pendingPayment, 1049876.55);
    dashboard = await (await request("/api/project-management/dashboard", "GET")).json();
    assert.equal(dashboard.kpis.paymentPending, 1049876.55);
    project.variationPayments.splice(0, 1);
    project = await (await request(endpoint, "PUT", project)).json();
    assert.equal(project.variationPayments.length, 1);
    project.variationPayments.splice(0, 1);
    project = await (await request(endpoint, "PUT", project)).json();
    assert.deepEqual(project.variationPayments, []);
    assert.equal(project.derived.receivedPayment, 123.45);
  } finally {
    server.kill();
    if (server.exitCode === null) await new Promise(resolve => server.once("exit", resolve));
    assert.ok(temp.startsWith(`${os.tmpdir()}${path.sep}`));
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
