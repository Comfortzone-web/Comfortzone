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

test("delivery note numbers follow creation order, not the last edited note", { timeout: 30000 }, async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "cz-delivery-numbering-"));
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
  try {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      if (server.exitCode !== null) throw new Error(logs);
      try { await fetch(`${base}/api/auth/me`); break; } catch {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    const login = await fetch(`${base}/api/auth/login`, json({ email: "admin@comfortzone.local", password: "admin123" }));
    assert.equal(login.status, 200, logs);
    const cookie = login.headers.get("set-cookie").split(";")[0];
    const request = (endpoint, options = {}) => fetch(`${base}${endpoint}`, {
      ...options, headers: { Cookie: cookie, ...options.headers }
    });
    const save = async body => {
      const response = await request("/api/inventory/delivery-notes", json(body));
      if (response.status !== 200) assert.fail(`${response.status} ${await response.text()} ${logs}`);
      return response.json();
    };

    const first = await save({ dnNo: "DN-1867", status: "Draft" });
    const firstId = first.deliveryNotes[0].id;
    assert.equal(first.settings.nextDeliveryNo, "DN-1868");
    const second = await save({ dnNo: "DN-1868", status: "Draft" });
    assert.equal(second.settings.nextDeliveryNo, "DN-1869");

    const edited = await save({ id: firstId, dnNo: "DN-1867", date: "2026-10-10", status: "Draft" });
    assert.deepEqual(edited.deliveryNotes.map(note => note.dnNo), ["DN-1868", "DN-1867"]);
    assert.equal(edited.settings.nextDeliveryNo, "DN-1869");
    const inventoryFile = path.join(temp, "data", "inventory.json");
    const stored = JSON.parse(fs.readFileSync(inventoryFile, "utf8"));
    stored.settings.nextDeliveryNo = "DN-1868";
    fs.writeFileSync(inventoryFile, JSON.stringify(stored));
    const loaded = await (await request("/api/inventory")).json();
    assert.equal(loaded.settings.nextDeliveryNo, "DN-1869");

    const third = await save({ status: "Draft" });
    assert.equal(third.deliveryNotes[0].dnNo, "DN-1869");
    assert.equal(third.settings.nextDeliveryNo, "DN-1870");
    const duplicate = await request("/api/inventory/delivery-notes", json({ dnNo: "DN-1868", status: "Draft" }));
    assert.equal(duplicate.status, 409);
  } finally {
    server.kill();
    if (server.exitCode === null) await new Promise(resolve => server.once("exit", resolve));
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
