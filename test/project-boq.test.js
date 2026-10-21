const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");
const { spawn } = require("node:child_process");

function zipStored(entries) {
  const localParts = [], centralParts = [];
  let offset = 0;
  for (const [name, content] of Object.entries(entries)) {
    const filename = Buffer.from(name), data = Buffer.from(content);
    const local = Buffer.alloc(30), central = Buffer.alloc(46);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(filename.length, 26);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(filename.length, 28);
    central.writeUInt32LE(offset, 42);
    localParts.push(local, filename, data);
    centralParts.push(central, filename);
    offset += local.length + filename.length + data.length;
  }
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(centralParts.length / 2, 8);
  end.writeUInt16LE(centralParts.length / 2, 10);
  end.writeUInt32LE(centralParts.reduce((sum, part) => sum + part.length, 0), 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, ...centralParts, end]);
}

test("BOQ import shares installation rows and preserves progress on re-import", { timeout: 20000 }, async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "cz-project-boq-"));
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
    let project = await (await request("/api/project-management/projects", json("POST", { name: "BOQ test" }))).json();
    assert.deepEqual(project.boqCategories.map(category => category.name), [
      "AIR CONDITIONING UNITS", "DUCTING & INSULATION", "REFRIGERANT PIPE", "FLEXIBLE DUCT",
      "LOUVERS", "DAMPERS", "CLADDING", "AIR INLET & OUTLET", "EXHAUST FAN",
      "THERMOSTAT", "CONTROL PANEL"
    ]);
    assert.equal(project.installationItems.length, 0);
    assert.equal(project.boqDefaultsVersion, 1);
    const endpoint = `/api/project-management/projects/${project.id}`;
    project.boqDefaultsVersion = 0;
    project.boqCategories = [{ id: "custom", name: "Custom Works" }, { id: "air", name: "Air Conditioning Units" }];
    project.installationItems = [{ id: "legacy-row", categoryId: "custom", item: "Existing Work" }];
    project = await (await request(endpoint, json("PUT", project))).json();
    assert.equal(project.boqCategories.length, 12);
    assert.deepEqual(project.boqCategories.slice(0, 2).map(category => category.id), ["custom", "air"]);
    assert.equal(project.installationItems[0].categoryId, "custom");
    const migratedCategories = project.boqCategories;
    project = await (await request(endpoint)).json();
    assert.deepEqual(project.boqCategories, migratedCategories);

    project.boqCategories = [{ id: "air", name: "Air Conditioning Units" }];
    project.installationItems = [{ id: "existing", categoryId: "air", itemNo: "AC-01", item: "VRV Outdoor Unit 28HP",
      unit: "Nos", boqQty: 2, rate: 100000, lpoQty: 2, deliveredQty: 1, installedQty: 1, comments: "One installed" }];
    project = await (await request(endpoint, json("PUT", project))).json();
    assert.equal(project.boqCategories.length, 1);
    assert.equal(project.installationItems[0].installation_status, "in_progress");

    const csv = ["Item No,Description,Unit,BOQ Quantity,Rate (AED),Remarks",
      "1.,Air Conditioning Units,,,,", "AC-01,VRV Outdoor Unit 28HP,Nos,2,120000,Complete with accessories",
      "AC-02,VRV Indoor Unit,Nos,8,8500,Controller included", "2.,Ducting Works,,,,",
      "DW-01,GI Ductwork,Sqm,160,500,With supports"].join("\n");
    const upload = async text => {
      const form = new FormData();
      form.append("file", new Blob([text], { type: "text/csv" }), "boq.csv");
      return request(`${endpoint}/boq/import`, { method: "POST", body: form });
    };
    let response = await upload(csv);
    assert.equal(response.status, 200, await response.text());
    project = await (await request(endpoint)).json();
    assert.deepEqual(project.boqCategories.map(item => item.name), ["Air Conditioning Units", "Ducting Works"]);
    assert.equal(project.installationItems.length, 3);
    assert.equal(project.installationItems[0].id, "existing");
    assert.equal(project.installationItems[0].rate, 120000);
    assert.equal(project.installationItems[0].installedQty, 1);
    assert.equal(project.installationItems[0].comments, "One installed");
    assert.equal(project.installationItems[2].categoryId, project.boqCategories[1].id);

    response = await upload(csv);
    assert.equal(response.status, 200, await response.text());
    project = await (await request(endpoint)).json();
    assert.equal(project.installationItems.length, 3);
    const row = values => `<row>${values.map((value, index) => `<c r="${String.fromCharCode(65 + index)}1" t="inlineStr"><is><t>${value}</t></is></c>`).join("")}</row>`;
    const xlsx = zipStored({
      "xl/worksheets/sheet1.xml": `<worksheet><sheetData>${row(["Cover sheet"])}</sheetData></worksheet>`,
      "xl/worksheets/sheet2.xml": `<worksheet><sheetData>${row(["Item No", "Description", "Unit", "BOQ Quantity", "Rate (AED)"])}<row><c r="A2" t="inlineStr"><is><t>AC-01</t></is></c><c r="B2" t="inlineStr"><is><t>VRV Outdoor Unit 28HP</t></is></c><c r="C2" t="inlineStr"><is><t>Nos</t></is></c><c r="D2"><v>2</v></c><c r="E2"><v>120000</v></c></row></sheetData></worksheet>`
    });
    const form = new FormData();
    form.append("file", new Blob([xlsx], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), "boq.xlsx");
    response = await request(`${endpoint}/boq/import`, { method: "POST", body: form });
    assert.equal(response.status, 200, await response.text());
    project = await (await request(endpoint)).json();
    assert.equal(project.installationItems.length, 3);
    assert.equal(project.installationItems[0].id, "existing");
    project.installationItems[0].installedQty = 2;
    project.installationItems[0].deliveredQty = 2;
    project.installationItems.push({ id: "blank-row", categoryId: "air", item: "", boqQty: "", rate: "", installedQty: "" });
    project = await (await request(endpoint, json("PUT", project))).json();
    assert.equal(project.installationItems[0].installation_status, "completed");
    assert.equal(project.installationItems[0].boqQty - project.installationItems[0].installedQty, 0);
    assert.ok(project.installationItems.some(item => item.id === "blank-row"));
    const progressWithBlank = project.derived.progress;
    project.installationItems = project.installationItems.filter(item => item.id !== "blank-row");
    project = await (await request(endpoint, json("PUT", project))).json();
    assert.equal(project.derived.progress, progressWithBlank);

    const originalOrder = project.installationItems.map(item => item.id);
    const moved = project.installationItems.shift();
    moved.categoryId = project.boqCategories[1].id;
    project.installationItems.push(moved);
    project = await (await request(endpoint, json("PUT", project))).json();
    project = await (await request(endpoint)).json();
    assert.deepEqual(project.installationItems.map(item => item.id), [...originalOrder.slice(1), originalOrder[0]]);
    assert.equal(project.installationItems[2].categoryId, project.boqCategories[1].id);
    assert.equal(project.installationItems[2].installedQty, 2);
    assert.equal(project.derived.progress, progressWithBlank);

    const categoryOrder = project.boqCategories.map(category => category.id).reverse();
    project.boqCategories.reverse();
    project = await (await request(endpoint, json("PUT", project))).json();
    project = await (await request(endpoint)).json();
    assert.deepEqual(project.boqCategories.map(category => category.id), categoryOrder);
    assert.equal(project.installationItems[2].categoryId, moved.categoryId);

    response = await upload("Nothing,Here\n1,2");
    assert.equal(response.status, 400);
    project = await (await request(endpoint)).json();
    assert.equal(project.installationItems.length, 3);

    response = await upload([
      "Reference,Description of Works,QTY,Unit Rate,Notes",
      "1.,Air Conditioning Units,,,",
      "AC-01,VRV Outdoor Unit 28HP,3,130000,Updated consultant rate",
      "AC-03,Fresh Air Unit,2,5000,New item"
    ].join("\n"));
    assert.equal(response.status, 200, await response.text());
    project = await (await request(endpoint)).json();
    const updated = project.installationItems.find(item => item.itemNo === "AC-01");
    assert.equal(updated.id, "existing");
    assert.equal(updated.unit, "Nos");
    assert.equal(updated.boqQty, 3);
    assert.equal(updated.rate, 130000);
    assert.equal(updated.installedQty, 2);
    assert.equal(updated.comments, "One installed");
    assert.ok(project.installationItems.some(item => item.itemNo === "AC-03"));

    response = await upload([
      "3.,Piping Works,,,",
      "PW-01,Copper Pipes,Mtr,400,50",
      "PW-02,Drain Pipes,Mtr,180,35"
    ].join("\n"));
    assert.equal(response.status, 200, await response.text());
    project = await (await request(endpoint)).json();
    const piping = project.boqCategories.find(item => item.name === "Piping Works");
    assert.ok(piping);
    assert.deepEqual(project.installationItems.filter(item => item.categoryId === piping.id).map(item => item.item),
      ["Copper Pipes", "Drain Pipes"]);
    assert.equal(project.installationItems.find(item => item.itemNo === "PW-01").boqQty, 400);

    response = await upload([
      "Item No;Materials/work Description;Unit;BOQ Qty;Unit Price",
      "4.;Valves;;;",
      "SV-01;Isolation Valve;Nos;4;25"
    ].join("\n"));
    assert.equal(response.status, 200, await response.text());
    project = await (await request(endpoint)).json();
    assert.equal(project.installationItems.find(item => item.itemNo === "SV-01").rate, 25);
  } finally {
    server.kill();
    if (server.exitCode === null) await new Promise(resolve => server.once("exit", resolve));
    assert.ok(temp.startsWith(`${os.tmpdir()}${path.sep}`));
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
