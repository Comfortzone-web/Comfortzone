const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");
const { spawn } = require("node:child_process");

test("submittal logs retain revisions and share files with Documents", { timeout: 20000 }, async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "cz-project-submittals-"));
  const probe = net.createServer();
  await new Promise(resolve => probe.listen(0, "127.0.0.1", resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  const source = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
  assert.match(source, /const PORTS = \[5175, 5176, 5177, 8085\];/);
  fs.writeFileSync(path.join(temp, "server.js"), source.replace("const PORTS = [5175, 5176, 5177, 8085];", `const PORTS = [${port}];`));
  for (const file of ["project-progress.js", "maintenance-api.js", "maintenance-store.js"]) {
    fs.copyFileSync(path.join(__dirname, "..", file), path.join(temp, file));
  }
  const server = spawn(process.execPath, ["server.js"], {
    cwd: temp, env: { ...process.env, SUPABASE_URL: "", SUPABASE_KEY: "" }, stdio: "ignore"
  });
  try {
    let ready = false;
    for (let attempt = 0; attempt < 50; attempt++) {
      if (server.exitCode !== null) throw new Error("Test server exited");
      try { await fetch(`${base}/api/auth/me`); ready = true; break; } catch {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(ready, "Test server did not start");
    const login = await fetch(`${base}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "admin@comfortzone.local", password: "admin123" }) });
    assert.equal(login.status, 200);
    const cookie = login.headers.get("set-cookie").split(";")[0];
    const request = (endpoint, options = {}) => fetch(`${base}${endpoint}`, { ...options, headers: { Cookie: cookie, ...options.headers } });
    const json = (method, body) => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

    let response = await request("/api/project-management/projects", json("POST", { name: "Submittal test" }));
    assert.equal(response.status, 201);
    let project = await response.json();
    assert.deepEqual(project.submittals, []);
    const endpoint = `/api/project-management/projects/${project.id}`;
    const csv = [
      "Type,Ref No.,Description,Supplier / Manufacturer,Planned Date,Rev,Status,Submitted,Released,Remarks,File",
      "Material Submittals,MS-01,Air Outlets,Vendor A,,R0,Submitted,2026-01-11,,Initial submission,",
      "Material Submittals,MS-01,Air Outlets,Vendor A,,R1,Approved as Noted,2026-02-12,2026-02-20,Approved with comments,",
      "Shop Drawings,SD-01,Basement AC Shop Drawing,,2026-01-15,R0,Submitted,2026-02-05,,For review,"
    ].join("\n");
    const importLog = async () => {
      const form = new FormData();
      form.append("file", new Blob([csv], { type: "text/csv" }), "submittals.csv");
      return request(`${endpoint}/submittals/import`, { method: "POST", body: form });
    };
    response = await importLog();
    assert.equal(response.status, 200, await response.clone().text());
    project = await response.json();
    assert.equal(project.submittals.length, 2);
    const material = project.submittals.find(item => item.refNo === "MS-01");
    const drawing = project.submittals.find(item => item.refNo === "SD-01");
    assert.equal(material.revisions.length, 2);
    assert.equal(material.rev, "R1");
    assert.equal(material.status, "Approved as Noted");
    assert.equal(drawing.kind, "drawing");
    assert.equal(drawing.plannedDate, "2026-01-15");

    response = await importLog();
    assert.equal(response.status, 200, await response.clone().text());
    project = await response.json();
    assert.equal(project.submittals.length, 2);
    assert.equal(project.submittals.find(item => item.refNo === "MS-01").revisions.length, 2);

    response = await request(`${endpoint}/submittals/log`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /spreadsheetml/);
    const workbook = Buffer.from(await response.arrayBuffer());
    assert.equal(workbook.toString("binary", 0, 2), "PK");
    const roundTrip = new FormData();
    roundTrip.append("file", new Blob([workbook], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), "submittals.xlsx");
    response = await request(`${endpoint}/submittals/import`, { method: "POST", body: roundTrip });
    assert.equal(response.status, 200, await response.clone().text());
    project = await response.json();
    assert.equal(project.submittals.length, 2);
    assert.equal(project.submittals.find(item => item.refNo === "MS-01").revisions.length, 2);

    for (const [item, expectedCategory] of [[material, "Submittals"], [drawing, "Shop Drawings"]]) {
      const form = new FormData();
      form.append("file", new Blob(["%PDF-1.4\nTest revision\n"], { type: "application/pdf" }), `${item.refNo}.pdf`);
      response = await request(`${endpoint}/submittals/${item.id}/revisions/${item.revisions[0].id}/file`, { method: "POST", body: form });
      assert.equal(response.status, 201, await response.clone().text());
      project = await response.json();
      const revision = project.submittals.find(row => row.id === item.id).revisions[0];
      const document = project.documents.find(file => file.id === revision.documentId);
      assert.ok(document);
      assert.equal(document.category, expectedCategory);
      response = await request(`${endpoint}/documents/${document.id}`);
      assert.equal(response.status, 200);
      assert.match(await response.text(), /Test revision/);
      response = await request(`${endpoint}/documents/${document.id}`, json("PATCH", { category: "Uncategorized" }));
      assert.equal(response.status, 400);
    }

    const first = project.submittals.find(item => item.refNo === "MS-01");
    const baseStatus = first.revisions[0].status;
    first.revisions.push({ id: "revision-r2", rev: "R2", status: "Preparation", remarks: "Updated catalog", submitted: "", released: "", documentId: "" });
    response = await request(endpoint, json("PUT", project));
    assert.equal(response.status, 200, await response.clone().text());
    project = await response.json();
    assert.equal(project.submittals.find(item => item.refNo === "MS-01").rev, "R2");
    assert.equal(project.submittals.find(item => item.refNo === "MS-01").revisions.length, 3);
    assert.equal(project.documents.length, 2);
    let revised = project.submittals.find(item => item.refNo === "MS-01");
    revised.revisions = revised.revisions.filter(revision => revision.rev !== "R1");
    response = await request(endpoint, json("PUT", project));
    assert.equal(response.status, 200, await response.clone().text());
    project = await response.json();
    revised = project.submittals.find(item => item.refNo === "MS-01");
    assert.deepEqual(revised.revisions.map(revision => revision.rev), ["R0", "R2"]);
    assert.equal(revised.rev, "R2");
    revised.revisions = revised.revisions.filter(revision => revision.rev !== "R2");
    response = await request(endpoint, json("PUT", project));
    assert.equal(response.status, 200, await response.clone().text());
    project = await response.json();
    revised = project.submittals.find(item => item.refNo === "MS-01");
    assert.deepEqual(revised.revisions.map(revision => revision.rev), ["R0"]);
    assert.equal(revised.rev, "R0");
    assert.equal(revised.status, baseStatus);
    assert.equal(project.documents.length, 2);
    project.submittals.push({ id: "legacy-checklist", item: "Material Submittals", status: "Approved", comments: "Historical checklist" });
    response = await request(endpoint, json("PUT", project));
    assert.equal(response.status, 200, await response.clone().text());
    project = await response.json();
    assert.equal(project.submittals.length, 2);
    assert.equal(project.legacySubmittals.at(-1).comments, "Historical checklist");

    const minimal = new FormData();
    minimal.append("file", new Blob(["Ref No.,Description\nMS-02,Flexible Duct"], { type: "text/csv" }), "minimal.csv");
    response = await request(`${endpoint}/submittals/import`, { method: "POST", body: minimal });
    assert.equal(response.status, 200, await response.clone().text());
    project = await response.json();
    assert.equal(project.submittals.length, 3);
    assert.equal(project.submittals.find(item => item.refNo === "MS-02").revisions[0].status, "Preparation");

    for (const kind of ["material", "drawing"]) {
      project.submittals.push({ id: `blank-${kind}`, kind, refNo: "", item: "", supplier: "", plannedDate: "",
        revisions: [{ id: `blank-${kind}-r0`, rev: "R0", status: "Preparation", submitted: "", released: "", remarks: "", documentId: "" }] });
    }
    response = await request(endpoint, json("PUT", project));
    assert.equal(response.status, 200, await response.clone().text());
    project = await (await request(endpoint)).json();
    assert.equal(project.submittals.length, 5);
    assert.deepEqual(project.submittals.filter(item => item.id.startsWith("blank-")).map(item => item.kind), ["material", "drawing"]);
    project.submittals.find(item => item.id === "blank-material").item = "Insulation";
    response = await request(endpoint, json("PUT", project));
    assert.equal(response.status, 200, await response.clone().text());
    project = await response.json();
    assert.equal(project.submittals.find(item => item.id === "blank-material").item, "Insulation");
    const linkedDocumentId = project.submittals.find(item => item.refNo === "MS-01").revisions[0].documentId;
    project.submittals = project.submittals.filter(item => !item.id.startsWith("blank-") && item.refNo !== "MS-01");
    response = await request(endpoint, json("PUT", project));
    assert.equal(response.status, 200, await response.clone().text());
    project = await response.json();
    assert.equal(project.submittals.length, 2);
    assert.ok(project.documents.some(file => file.id === linkedDocumentId));

    response = await request("/api/project-management/projects", json("POST", { name: "Flexible import test" }));
    assert.equal(response.status, 201);
    const flexibleProject = await response.json();
    const flexibleEndpoint = `/api/project-management/projects/${flexibleProject.id}`;
    const upload = async (content, kind = "material") => {
      const form = new FormData();
      form.append("file", new Blob([content], { type: "text/csv" }), "different-log.csv");
      form.append("kind", kind);
      const result = await request(`${flexibleEndpoint}/submittals/import`, { method: "POST", body: form });
      assert.equal(result.status, 200, await result.clone().text());
      return result.json();
    };
    const alternateLog = [
      "Material Submittal Register",
      "Reference No;Material / Work Description;Manufacturer;Revision No;Approval Status;Date Submitted;Date Returned;Review Comments",
      "MS-100;Air Outlets;Vendor A;Rev 0;Submitted for approval;22/10/2026;;Initial submission",
      ";;;R1;Approved with comments;23/10/2026;24/10/2026;Approved with notes",
      "MS-100-R2;Air Outlets;Vendor A;;Revise & Resubmit;25/10/2026;;Revised data"
    ].join("\n");
    let flexible = await upload(alternateLog);
    let importedMaterial = flexible.submittals.find(item => item.refNo === "MS-100");
    assert.deepEqual(importedMaterial.revisions.map(revision => revision.rev), ["R0", "R1", "R2"]);
    assert.deepEqual(importedMaterial.revisions.map(revision => revision.status), ["Submitted", "Approved as Noted", "Revise & Resubmit"]);
    assert.equal(importedMaterial.revisions[0].submitted, "2026-10-22");
    assert.equal(importedMaterial.revisions[1].released, "2026-10-24");
    flexible = await upload(alternateLog);
    assert.equal(flexible.submittals.find(item => item.refNo === "MS-100").revisions.length, 3);

    flexible = await upload("Document Number,Drawing Title,Rev,Review Status,Planned Date\nDWG-01,AC Shop Drawing,R0,Under review,2026-11-01", "drawing");
    const importedDrawing = flexible.submittals.find(item => item.refNo === "DWG-01");
    assert.equal(importedDrawing.kind, "drawing");
    assert.equal(importedDrawing.item, "AC Shop Drawing");
    assert.equal(importedDrawing.revisions[0].status, "Submitted");
    assert.equal(importedDrawing.plannedDate, "2026-11-01");

    flexible = await upload("Submittal Number,Item Description,R0 Status,R0 Submit Date,R1 Status,R1 Release Date\nMS-200,Diffusers,Submitted,01/10/2026,Approved,08/10/2026");
    importedMaterial = flexible.submittals.find(item => item.refNo === "MS-200");
    assert.deepEqual(importedMaterial.revisions.map(revision => revision.rev), ["R0", "R1"]);
    assert.equal(importedMaterial.revisions[1].status, "Approved as Noted");
    assert.equal(importedMaterial.revisions[1].released, "2026-10-08");

    flexible = await upload("Description,Revision,Status\nBasement Plan,R0,Preparation", "drawing");
    assert.equal(flexible.submittals.find(item => item.item === "Basement Plan").kind, "drawing");

    const irregularLog = [
      "TEKTON Transmittal Reference No.,Rev No.,Material Description,Manufacturer/ Local Supplier,Status,Date Submit,Date Release",
      "MS-300,0,Duct Insulation,Vendor A,Submitted,01/01/2026,",
      ",77,,,Revise & Resubmit,05/01/2026,06/01/2026",
      ",78,,,Approved as Noted,10/01/2026,12/01/2026"
    ].join("\n");
    flexible = await upload(irregularLog);
    importedMaterial = flexible.submittals.find(item => item.refNo === "MS-300");
    assert.deepEqual(importedMaterial.revisions.map(revision => revision.rev), ["R0", "R1", "R2"]);
    assert.deepEqual(importedMaterial.revisions.map(revision => revision.sourceRevision), ["R0", "R77", "R78"]);
    assert.equal(importedMaterial.revisions[1].submitted, "2026-01-05");
    assert.equal(importedMaterial.revisions[1].released, "2026-01-06");
    assert.equal(importedMaterial.revisions[2].released, "2026-01-12");
    flexible = await upload(irregularLog);
    importedMaterial = flexible.submittals.find(item => item.refNo === "MS-300");
    assert.deepEqual(importedMaterial.revisions.map(revision => revision.rev), ["R0", "R1", "R2"]);
    assert.equal(importedMaterial.revisions[2].released, "2026-01-12");

    flexible = await upload("Ref No.,Description,Rev,Status,Submit,Release\nMS-301,Air Outlets,R0,Approved,01/02/2026,03/02/2026");
    assert.equal(flexible.submittals.find(item => item.refNo === "MS-301").revisions[0].released, "2026-02-03");
  } finally {
    server.kill();
    if (server.exitCode === null) await new Promise(resolve => server.once("exit", resolve));
    assert.ok(temp.startsWith(`${os.tmpdir()}${path.sep}`));
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
