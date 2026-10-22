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

test("delivery notes protect reservations by customer and release fulfilled project quantities", { timeout: 30000 }, async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "cz-delivery-reservations-"));
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
    const post = (endpoint, body) => request(endpoint, json(body));
    const saved = async (endpoint, body) => {
      const response = await post(endpoint, body);
      if (response.status !== 200) assert.fail(`${endpoint}: ${response.status} ${await response.text()} ${logs}`);
      return response.json();
    };
    await saved("/api/inventory/models", { modelNo: "M-1", description: "Test model", reservedQty: 1 });
    await saved("/api/inventory/supplier-dns", { supplierDnNo: "IN-1", status: "Confirmed", lines: [{ modelNo: "M-1", finalQty: 6, detectedQty: 6 }] });
    await saved("/api/sales-crm/projects", { name: "Project A", customer: "Customer A", boq: [{ model: "M-1", qty: 2, deliveredQty: 0, reserve: true }] });
    await saved("/api/sales-crm/projects", { name: "Project B", customer: "Customer B", boq: [{ model: "M-1", qty: 1, deliveredQty: 0, reserve: true }] });

    const stock = (await (await request("/api/inventory")).json()).dashboard.stock.find(item => item.modelNo === "M-1");
    assert.equal(stock.qty, 6);
    assert.equal(stock.reservedQty, 4);
    assert.deepEqual(stock.reservations.map(({ customerName, projectName, qty }) => [customerName, projectName, qty]), [
      ["Customer B", "Project B", 1], ["Customer A", "Project A", 2], ["", "", 1]
    ]);

    const note = (dnNo, customerName, projectName, quantities) => ({
      dnNo, customerName, projectName, status: "Delivered",
      lines: quantities.map(qtyGoingOut => ({ modelNo: "M-1", qtyGoingOut, availableQty: 6 }))
    });
    const otherTooMuch = await post("/api/inventory/delivery-notes", note("DN-1", "Customer C", "", [3]));
    assert.equal(otherTooMuch.status, 400);
    const splitTooMuch = await post("/api/inventory/delivery-notes", note("DN-1", "Customer C", "", [2, 1]));
    assert.equal(splitTooMuch.status, 400);
    await saved("/api/inventory/delivery-notes", note("DN-1", "Customer C", "", [2]));
    await saved("/api/inventory/delivery-notes", note("DN-2", "Customer B", "Project B", [1]));
    const afterB = (await (await request("/api/inventory")).json()).dashboard.stock.find(item => item.modelNo === "M-1");
    assert.equal(afterB.qty, 3);
    assert.equal(afterB.reservedQty, 3);
    assert.equal(afterB.reservations.some(entry => entry.customerName === "Customer B"), false);
    const afterBOther = await post("/api/inventory/delivery-notes", note("DN-3", "Customer C", "", [1]));
    assert.equal(afterBOther.status, 400);
    const forA = await saved("/api/inventory/delivery-notes", note("DN-3", "Customer A", "Project A", [2]));
    const aNote = forA.deliveryNotes.find(entry => entry.dnNo === "DN-3");
    const afterA = forA.dashboard.stock.find(item => item.modelNo === "M-1");
    assert.equal(afterA.qty, 1);
    assert.equal(afterA.reservedQty, 1);
    const changedOwner = await post("/api/inventory/delivery-notes", { ...note("DN-3", "Customer C", "", [2]), id: aNote.id });
    assert.equal(changedOwner.status, 400);
    const reduced = await saved("/api/inventory/delivery-notes", { ...note("DN-3", "Customer A", "Project A", [1]), id: aNote.id });
    const afterReduction = reduced.dashboard.stock.find(item => item.modelNo === "M-1");
    assert.equal(afterReduction.qty, 2);
    assert.equal(afterReduction.reservedQty, 2);
    const cancelled = await request(`/api/inventory/delivery-notes/${aNote.id}/cancel`, json({}));
    assert.equal(cancelled.status, 200);
    const afterCancel = (await cancelled.json()).dashboard.stock.find(item => item.modelNo === "M-1");
    assert.equal(afterCancel.qty, 3);
    assert.equal(afterCancel.reservedQty, 3);

    await saved("/api/inventory/models", { modelNo: "M-2", description: "Mixed BOQ model" });
    await saved("/api/inventory/supplier-dns", { supplierDnNo: "IN-2", status: "Confirmed", lines: [{ modelNo: "M-2", finalQty: 10, detectedQty: 10 }] });
    await saved("/api/sales-crm/projects", { name: "Mixed Project", customer: "Customer A", boq: [
      { model: "M-2", qty: 5, deliveredQty: 5, reserve: false },
      { model: "M-2", qty: 5, deliveredQty: 0, reserve: true }
    ] });
    const mixedFirst = await saved("/api/inventory/delivery-notes", {
      dnNo: "DN-4", customerName: "Customer A", projectName: "Mixed Project", status: "Delivered",
      lines: [{ modelNo: "M-2", qtyGoingOut: 5, availableQty: 10 }]
    });
    const mixedStock = mixedFirst.dashboard.stock.find(item => item.modelNo === "M-2");
    assert.equal(mixedStock.qty, 5);
    assert.equal(mixedStock.reservedQty, 5);
  } finally {
    server.kill();
    if (server.exitCode === null) await new Promise(resolve => server.once("exit", resolve));
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
