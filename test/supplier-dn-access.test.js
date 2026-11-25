const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");
const { spawn } = require("node:child_process");
const vm = require("node:vm");

test("Supplier DN menu hides Delete from staff but keeps Edit", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "public", "app.js"), "utf8");
  const start = source.indexOf("function supplierDnMenuItems(");
  const end = source.indexOf("function supplierVerificationHtml(", start);
  assert.ok(start >= 0 && end > start);
  const context = { isCurrentAdmin: () => false };
  vm.createContext(context);
  vm.runInContext(source.slice(start, end), context);
  const staffActions = context.supplierDnMenuItems({ id: "dn-1" }).map(item => item.label);
  assert.ok(staffActions.includes("Edit"));
  assert.ok(!staffActions.includes("Delete"));
  context.isCurrentAdmin = () => true;
  const adminActions = context.supplierDnMenuItems({ id: "dn-1" }).map(item => item.label);
  assert.ok(adminActions.includes("Delete"));
});

test("staff can save Supplier DNs but only admin can delete them", { timeout: 30000 }, async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "cz-supplier-dn-access-"));
  const probe = net.createServer();
  await new Promise(resolve => probe.listen(0, "127.0.0.1", resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  const source = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
  fs.writeFileSync(path.join(temp, "server.js"), source.replace("const PORTS = [5175, 5176, 5177, 8085];", `const PORTS = [${port}];`));
  for (const file of ["project-progress.js", "maintenance-api.js", "maintenance-store.js", "maintenance-billing.js", "ool.js"]) {
    fs.copyFileSync(path.join(__dirname, "..", file), path.join(temp, file));
  }
  fs.mkdirSync(path.join(temp, "data"), { recursive: true });
  fs.writeFileSync(path.join(temp, "data", "ool-opening.json"), JSON.stringify(require("./fixtures/ool-opening")));
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
    const userResponse = await request(admin, "/api/settings/users", json({
      name: "Supplier Staff", email: "supplier-staff@example.test", role: "Staff", password: "test-password"
    }));
    assert.equal(userResponse.status, 200, await userResponse.text());
    const staff = await login("supplier-staff@example.test", "test-password");

    const create = await request(staff, "/api/inventory/supplier-dns", json({
      supplierDnNo: "STAFF-DN-001", lines: [{ modelNo: "TEST-MODEL", detectedQty: 1, finalQty: 1 }]
    }));
    if (create.status !== 200) assert.fail(`Create failed: ${create.status} ${await create.text()} ${logs}`);
    const created = await create.json();
    const dnId = created.supplierDns.find(dn => dn.supplierDnNo === "STAFF-DN-001").id;
    const edit = await request(staff, "/api/inventory/supplier-dns", json({
      id: dnId, supplierDnNo: "STAFF-DN-001", projectName: "Edited by staff",
      lines: [{ modelNo: "TEST-MODEL", detectedQty: 1, finalQty: 1 }]
    }));
    if (edit.status !== 200) assert.fail(`Edit failed: ${edit.status} ${await edit.text()} ${logs}`);
    assert.equal((await edit.json()).supplierDns.find(dn => dn.id === dnId).projectName, "Edited by staff");
    assert.equal((await request(staff, `/api/inventory/supplier-dns/${dnId}`, { method: "DELETE" })).status, 403);
    const inventory = await request(admin, "/api/inventory");
    assert.equal((await inventory.json()).supplierDns.find(dn => dn.id === dnId).projectName, "Edited by staff");
    assert.equal((await request(admin, `/api/inventory/supplier-dns/${dnId}`, { method: "DELETE" })).status, 200);
  } finally {
    server.kill();
    if (server.exitCode === null) await new Promise(resolve => server.once("exit", resolve));
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
