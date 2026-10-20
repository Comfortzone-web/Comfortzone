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

async function waitForServer(url, process) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (process.exitCode !== null) throw new Error("Test server exited before it was ready");
    try { await fetch(`${url}/api/auth/me`); return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error("Test server did not start");
}

test("project invoices are extracted, reviewed, locked, replaced, and stored per payment row", { timeout: 20000 }, async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "cz-project-invoices-"));
  const port = await freePort();
  const url = `http://127.0.0.1:${port}`;
  const source = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
  assert.match(source, /const PORTS = \[5175, 5176, 5177, 8085\];/);
  fs.writeFileSync(path.join(temp, "server.js"), source.replace("const PORTS = [5175, 5176, 5177, 8085];", `const PORTS = [${port}];`));
  fs.copyFileSync(path.join(__dirname, "..", "project-progress.js"), path.join(temp, "project-progress.js"));
  fs.copyFileSync(path.join(__dirname, "..", "maintenance-api.js"), path.join(temp, "maintenance-api.js"));
  fs.copyFileSync(path.join(__dirname, "..", "maintenance-store.js"), path.join(temp, "maintenance-store.js"));
  fs.writeFileSync(path.join(temp, "mock-openai.js"), `
    const originalFetch = global.fetch;
    global.fetch = (url, options) => {
      if (url !== "https://api.openai.com/v1/responses") return originalFetch(url, options);
      const content = JSON.parse(options.body).input[0].content;
      const filename = content.find(item => item.type === "input_file")?.filename || "";
      const extracted = filename.includes("unclear")
        ? { amountWithoutVat: "", amountInclVat: "", invoiceDate: "", needsReview: true, message: "Totals unclear" }
        : filename.includes("variation")
          ? { amountWithoutVat: "200", amountInclVat: "210", invoiceDate: "2026-10-11", needsReview: false, message: "" }
          : { amountWithoutVat: "100", amountInclVat: "105", invoiceDate: "2026-10-10", needsReview: false, message: "" };
      return Promise.resolve(new Response(JSON.stringify({ output_text: JSON.stringify(extracted) }), { status: 200 }));
    };
  `);
  const server = spawn(process.execPath, ["--require", "./mock-openai.js", "server.js"], {
    cwd: temp, env: { ...process.env, OPENAI_API_KEY: "test-key", SUPABASE_URL: "", SUPABASE_KEY: "" }, stdio: ["ignore", "pipe", "pipe"]
  });
  let logs = "";
  server.stdout.on("data", chunk => { logs += chunk; });
  server.stderr.on("data", chunk => { logs += chunk; });
  try {
    await waitForServer(url, server);
    const login = await fetch(`${url}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "admin@comfortzone.local", password: "admin123" }) });
    assert.equal(login.status, 200, logs);
    const cookie = login.headers.get("set-cookie").split(";")[0];
    const request = (endpoint, options = {}) => fetch(`${url}${endpoint}`, { ...options, headers: { Cookie: cookie, ...options.headers } });
    const json = (method, body) => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const created = await request("/api/project-management/projects", json("POST", { name: "Invoice test project", contractValue: 1000, variationContractValue: 125.75 }));
    assert.equal(created.status, 201, logs);
    let project = await created.json();
    assert.equal(project.variationContractValue, 125.75);
    const base = `/api/project-management/projects/${project.id}`;
    project.variationContractValue = 155.25;
    project.variationPayments = [{ id: "variation-row", milestone: "Variation 1", amount: "", amountWithoutVat: "", status: "Pending" }];
    project = await (await request(base, json("PUT", project))).json();
    assert.equal(project.variationContractValue, 155.25);
    const rowId = project.payments[0].id;
    const paymentInvoice = `${base}/payments/${rowId}/invoice`;
    const variationInvoice = `${base}/variation-payments/variation-row/invoice`;
    const bytes = Buffer.from("%PDF-1.4\ninvoice test bytes\n");
    const upload = (endpoint, filename, body = bytes) => {
      const form = new FormData();
      form.append("file", new Blob([body], { type: "application/pdf" }), filename);
      return request(endpoint, { method: "POST", body: form });
    };

    const firstUpload = await upload(paymentInvoice, "good.pdf");
    assert.equal(firstUpload.status, 200, await firstUpload.text());
    project = await (await request(base)).json();
    assert.equal(project.payments[0].amountWithoutVat, 100);
    assert.equal(project.payments[0].amount, 105);
    assert.equal(project.payments[0].dueDate, "2026-10-10");
    assert.equal(project.payments[0].status, "Received");
    assert.equal(project.payments[0].invoice.status, "confirmed");
    assert.equal(project.derived.receivedPayment, 105);
    assert.equal(project.derived.pendingPayment, 945);
    const oldStoredName = project.payments[0].invoice.storedName;
    const preview = await request(paymentInvoice);
    assert.equal(preview.status, 200);
    assert.match(preview.headers.get("content-disposition"), /^inline;/);
    assert.deepEqual(Buffer.from(await preview.arrayBuffer()), bytes);
    const download = await request(`${paymentInvoice}?download=1`);
    assert.match(download.headers.get("content-disposition"), /^attachment;/);

    project.payments[0].status = "Pending";
    project.payments[0].amount = 9999;
    project.payments[0].amountWithoutVat = 9999;
    project.payments[0].invoice = null;
    project = await (await request(base, json("PUT", project))).json();
    assert.equal(project.payments[0].status, "Received");
    assert.equal(project.payments[0].amount, 105);
    assert.equal(project.payments[0].invoice.status, "confirmed");

    const replacement = await upload(paymentInvoice, "unclear.pdf");
    assert.equal(replacement.status, 200);
    project = await replacement.json();
    assert.equal(project.payments[0].invoice.status, "review");
    assert.equal(project.payments[0].status, "Pending");
    assert.equal(project.derived.receivedPayment, 0);
    assert.equal(fs.existsSync(path.join(temp, "data", "uploads", "project-management", project.id, "invoices", oldStoredName)), false);
    const invoiceId = project.payments[0].invoice.id;
    const invalid = await request(`${paymentInvoice}/confirm`, json("POST", { invoiceId, amountWithoutVat: "", amount: 210, dueDate: "2026-10-12" }));
    assert.equal(invalid.status, 400);
    const confirmed = await request(`${paymentInvoice}/confirm`, json("POST", { invoiceId, amountWithoutVat: 200, amount: 210, dueDate: "2026-10-12" }));
    assert.equal(confirmed.status, 200);
    project = await confirmed.json();
    assert.equal(project.payments[0].invoice.status, "confirmed");
    assert.equal(project.derived.receivedPayment, 210);
    assert.equal(project.derived.pendingPayment, 840);

    const variationUpload = await upload(variationInvoice, "variation.pdf");
    assert.equal(variationUpload.status, 200);
    project = await variationUpload.json();
    assert.equal(project.variationPayments[0].amountWithoutVat, 200);
    assert.equal(project.variationPayments[0].amount, 210);
    assert.equal(project.variationPayments[0].status, "Received");
    assert.equal(project.derived.receivedPayment, 210);
    const variationStoredName = project.variationPayments[0].invoice.storedName;
    const reloaded = await (await request(base)).json();
    assert.equal(reloaded.payments[0].invoice.id, invoiceId);
    assert.equal(reloaded.variationPayments[0].invoice.storedName, variationStoredName);
    reloaded.variationPayments = [];
    project = await (await request(base, json("PUT", reloaded))).json();
    assert.deepEqual(project.variationPayments, []);
    assert.equal(fs.existsSync(path.join(temp, "data", "uploads", "project-management", project.id, "invoices", variationStoredName)), false);
  } finally {
    server.kill();
    if (server.exitCode === null) await new Promise(resolve => server.once("exit", resolve));
    assert.ok(temp.startsWith(`${os.tmpdir()}${path.sep}`));
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
