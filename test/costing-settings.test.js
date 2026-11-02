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

test("Costing settings control new sheets and lock every Price List mutation", { timeout: 30000 }, async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "cz-costing-settings-"));
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const source = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
  fs.writeFileSync(path.join(temp, "server.js"), source.replace("const PORTS = [5175, 5176, 5177, 8085];", `const PORTS = [${port}];`));
  for (const file of ["project-progress.js", "maintenance-api.js", "maintenance-store.js", "maintenance-billing.js"]) {
    fs.copyFileSync(path.join(__dirname, "..", file), path.join(temp, file));
  }
  const server = spawn(process.execPath, ["server.js"], {
    cwd: temp, env: { ...process.env, SUPABASE_URL: "", SUPABASE_KEY: "" }, stdio: ["ignore", "pipe", "pipe"]
  });
  let logs = "";
  server.stdout.on("data", chunk => { logs += chunk; });
  server.stderr.on("data", chunk => { logs += chunk; });
  const request = (cookie, endpoint, method = "GET", body) => fetch(`${base}${endpoint}`, {
    method, headers: { Cookie: cookie || "", ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  try {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      if (server.exitCode !== null) throw new Error(logs);
      try { await fetch(`${base}/api/auth/me`); break; } catch {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    const login = async (email, password) => {
      const response = await request("", "/api/auth/login", "POST", { email, password });
      assert.equal(response.status, 200, logs);
      return response.headers.get("set-cookie").split(";")[0];
    };
    const admin = await login("admin@comfortzone.local", "admin123");
    assert.deepEqual((await (await request(admin, "/api/costing")).json()).settings, { priceIncrease: 20, priceListLocked: false });

    const settings = await request(admin, "/api/costing/settings", "PUT", { priceIncrease: 25, priceListLocked: false });
    assert.equal(settings.status, 200);
    assert.equal((await settings.json()).settings.priceIncrease, 25);
    const added = await request(admin, "/api/costing/price-items", "POST", { model: "TEST-AC", finalPrice: 100 });
    assert.equal(added.status, 200);
    const item = (await added.json()).priceItems.find(entry => entry.model === "TEST-AC");

    assert.equal((await request(admin, "/api/costing/settings", "PUT", { priceIncrease: 25, priceListLocked: true })).status, 200);
    assert.equal((await request(admin, "/api/costing/price-items", "POST", { ...item, finalPrice: 200 })).status, 423);
    assert.equal((await request(admin, `/api/costing/price-items/${item.id}`, "DELETE")).status, 423);
    assert.equal((await request(admin, "/api/costing/price-items/import", "POST")).status, 423);
    assert.equal((await request(admin, "/api/costing/settings", "PUT", { priceIncrease: 30, priceListLocked: true })).status, 409);

    const saved = await request(admin, "/api/costing/sheets", "POST", { project: "Test", priceIncrease: 99, salesPerson: "Other User", rows: [] });
    assert.equal(saved.status, 200);
    const sheet = (await saved.json()).sheets[0];
    assert.equal(sheet.priceIncrease, 25);
    assert.equal(sheet.salesPerson, "Admin User");

    const staffCreated = await request(admin, "/api/settings/users", "POST", { name: "Sales Staff", email: "costing-staff@example.test", role: "Staff", password: "test-password" });
    assert.equal(staffCreated.status, 200);
    const staff = await login("costing-staff@example.test", "test-password");
    assert.equal((await request(staff, "/api/costing/settings", "PUT", { priceIncrease: 25, priceListLocked: false })).status, 403);

    assert.equal((await request(admin, "/api/costing/settings", "PUT", { priceIncrease: 25, priceListLocked: false })).status, 200);
    assert.equal((await request(admin, "/api/costing/price-items", "POST", { ...item, finalPrice: 200 })).status, 200);
  } finally {
    server.kill();
    await new Promise(resolve => server.once("exit", resolve));
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
