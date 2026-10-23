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

test("deleting a verified direct delivery reverses only its BOQ quantities", { timeout: 30000 }, async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "cz-direct-delivery-delete-"));
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const source = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
  fs.writeFileSync(path.join(temp, "server.js"), source.replace("const PORTS = [5175, 5176, 5177, 8085];", `const PORTS = [${port}];`));
  for (const file of ["project-progress.js", "maintenance-api.js", "maintenance-store.js"]) {
    fs.copyFileSync(path.join(__dirname, "..", file), path.join(temp, file));
  }
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
    const request = (endpoint, options = {}) => fetch(`${base}${endpoint}`, { ...options, headers: { Cookie: cookie, ...options.headers } });
    const saved = await request("/api/sales-crm/projects", json({
      name: "Warehouse", customer: "Ahmed", boq: [
        { model: "M-1", qty: 10, deliveredQty: 8 },
        { model: "M-2", qty: 5, deliveredQty: 4 }
      ],
      directDeliveryUploads: [
        { id: "upload-1", uploadId: "upload-1", lines: [{ modelNo: "M-1", quantity: 3 }, { modelNo: "M-2", quantity: 4 }] },
        { id: "upload-2", uploadId: "upload-2", lines: [{ modelNo: "M-1", quantity: 3 }] }
      ]
    }));
    if (saved.status !== 200) assert.fail(`${saved.status} ${await saved.text()} ${logs}`);
    const project = (await saved.json()).projects.find(item => item.name === "Warehouse");
    const deleteUpload = async id => {
      const response = await request(`/api/sales-crm/projects/${project.id}/direct-delivery/uploads/${id}`, { method: "DELETE" });
      if (response.status !== 200) assert.fail(`${response.status} ${await response.text()} ${logs}`);
      return (await response.json()).projects.find(item => item.id === project.id);
    };

    const afterFirst = await deleteUpload("upload-1");
    assert.deepEqual(afterFirst.boq.map(row => [row.deliveredQty, row.pendingQty]), [[5, 5], [0, 5]]);
    assert.deepEqual(afterFirst.directDeliveryUploads.map(item => item.id), ["upload-2"]);
    const repeated = await deleteUpload("upload-1");
    assert.deepEqual(repeated.boq.map(row => row.deliveredQty), [5, 0]);
    const afterSecond = await deleteUpload("upload-2");
    assert.deepEqual(afterSecond.boq.map(row => [row.deliveredQty, row.pendingQty]), [[2, 8], [0, 5]]);
    assert.equal(afterSecond.directDeliveryUploads.length, 0);
  } finally {
    server.kill();
    if (server.exitCode === null) await new Promise(resolve => server.once("exit", resolve));
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
