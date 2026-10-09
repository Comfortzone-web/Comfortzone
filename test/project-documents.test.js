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
    try {
      await fetch(`${url}/api/auth/me`);
      return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error("Test server did not start");
}

test("project documents keep file bytes and editable metadata in existing storage", { timeout: 20000 }, async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "cz-project-documents-"));
  const port = await freePort();
  const url = `http://127.0.0.1:${port}`;
  const source = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
  assert.match(source, /const PORTS = \[5175, 5176, 5177, 8085\];/);
  fs.writeFileSync(path.join(temp, "server.js"), source.replace("const PORTS = [5175, 5176, 5177, 8085];", `const PORTS = [${port}];`));
  fs.copyFileSync(path.join(__dirname, "..", "project-progress.js"), path.join(temp, "project-progress.js"));
  const server = spawn(process.execPath, ["server.js"], { cwd: temp, env: { ...process.env, SUPABASE_URL: "", SUPABASE_KEY: "" }, stdio: ["ignore", "pipe", "pipe"] });
  let logs = "";
  server.stdout.on("data", chunk => { logs += chunk; });
  server.stderr.on("data", chunk => { logs += chunk; });
  try {
    await waitForServer(url, server);
    const login = await fetch(`${url}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "admin@comfortzone.local", password: "admin123" }) });
    assert.equal(login.status, 200, logs);
    const cookie = login.headers.get("set-cookie").split(";")[0];
    const request = (endpoint, options = {}) => fetch(`${url}${endpoint}`, { ...options, headers: { Cookie: cookie, ...options.headers } });
    const created = await request("/api/project-management/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Document test project" }) });
    assert.equal(created.status, 201);
    const project = await created.json();
    const base = `/api/project-management/projects/${project.id}`;

    const folder = await request(`${base}/document-folders`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Site Photos" }) });
    assert.equal(folder.status, 201);
    assert.deepEqual((await folder.json()).documentFolders, ["Site Photos"]);

    const bytes = Buffer.from("document test bytes");
    const form = new FormData();
    form.append("file", new Blob([bytes], { type: "application/pdf" }), "Test_Drawings.pdf");
    form.append("category", "Shop Drawings");
    const uploaded = await request(`${base}/documents`, { method: "POST", body: form });
    const document = await uploaded.json();
    assert.equal(uploaded.status, 201, JSON.stringify(document));
    assert.equal(document.projectId, project.id);
    assert.equal(document.category, "Shop Drawings");
    assert.equal(document.size, bytes.length);

    const updated = await request(`${base}/documents/${document.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ originalName: "Renamed_Drawings.pdf", category: "Site Photos" }) });
    assert.equal(updated.status, 200);
    const saved = (await updated.json()).documents[0];
    assert.equal(saved.originalName, "Renamed_Drawings.pdf");
    assert.equal(saved.category, "Site Photos");
    assert.equal(saved.projectId, project.id);

    const preview = await request(`${base}/documents/${document.id}`);
    assert.equal(preview.status, 200);
    assert.match(preview.headers.get("content-disposition"), /^inline;/);
    assert.deepEqual(Buffer.from(await preview.arrayBuffer()), bytes);
    const download = await request(`${base}/documents/${document.id}?download=1`);
    assert.match(download.headers.get("content-disposition"), /^attachment;/);
    assert.deepEqual(Buffer.from(await download.arrayBuffer()), bytes);
    const archive = await request(`${base}/documents/download-all`);
    assert.equal(archive.status, 200);
    const zip = Buffer.from(await archive.arrayBuffer());
    assert.equal(zip.readUInt32LE(0), 0x04034b50);
    assert.ok(zip.includes(Buffer.from("Site Photos/Renamed_Drawings.pdf")));

    const renamedFolder = await request(`${base}/document-folders`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ oldName: "Site Photos", newName: "Site Images" }) });
    assert.equal(renamedFolder.status, 200);
    const afterRename = await renamedFolder.json();
    assert.deepEqual(afterRename.documentFolders, ["Site Images"]);
    assert.equal(afterRename.documents[0].category, "Site Images");
    const duplicateName = await request(`${base}/document-folders`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ oldName: "Site Images", newName: "Submittals" }) });
    assert.equal(duplicateName.status, 400);
    const renamedBuiltIn = await request(`${base}/document-folders`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ oldName: "Shop Drawings", newName: "Design Docs" }) });
    assert.equal(renamedBuiltIn.status, 200);
    const afterBuiltInRename = await renamedBuiltIn.json();
    assert.deepEqual(afterBuiltInRename.documentFolders, ["Site Images", "Design Docs"]);
    assert.deepEqual(afterBuiltInRename.hiddenDocumentCategories, ["Shop Drawings"]);
    const renamedArchive = await request(`${base}/documents/download-all`);
    assert.ok(Buffer.from(await renamedArchive.arrayBuffer()).includes(Buffer.from("Site Images/Renamed_Drawings.pdf")));

    const removedFolders = await request(`${base}/document-folders`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ names: ["Site Images", "Design Docs"] }) });
    assert.equal(removedFolders.status, 200);
    const afterFolderDelete = await removedFolders.json();
    assert.deepEqual(afterFolderDelete.documentFolders, []);
    assert.deepEqual(afterFolderDelete.hiddenDocumentCategories, ["Shop Drawings"]);
    assert.equal(afterFolderDelete.documents[0].category, "Uncategorized");
    const keptFile = await request(`${base}/documents/${document.id}`);
    assert.deepEqual(Buffer.from(await keptFile.arrayBuffer()), bytes);
    const restoredFolder = await request(`${base}/document-folders`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Shop Drawings" }) });
    assert.equal(restoredFolder.status, 201);
    assert.deepEqual((await restoredFolder.json()).hiddenDocumentCategories, []);

    const deleted = await request(`${base}/documents/${document.id}`, { method: "DELETE" });
    assert.equal(deleted.status, 200);
    const remaining = await request(base);
    assert.deepEqual((await remaining.json()).documents, []);
  } finally {
    server.kill();
    if (server.exitCode === null) await new Promise(resolve => server.once("exit", resolve));
    assert.ok(temp.startsWith(`${os.tmpdir()}${path.sep}`));
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
