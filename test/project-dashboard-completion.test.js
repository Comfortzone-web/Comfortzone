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

test("completed follow-ups and pending works remain on the dashboard for 24 hours", { timeout: 20000 }, async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "cz-project-completion-"));
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
    const json = (method, body) => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const recent = new Date(Date.now() - 23 * 60 * 60 * 1000).toISOString();
    const expired = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    const created = await request("/api/project-management/projects", json("POST", {
      name: "Completion window test",
      followUps: [
        { id: "follow-active", subject: "Active follow-up", assignedUserId: "admin", assigned: "Admin User", status: "Pending" },
        { id: "follow-recent", subject: "Recently finished", assignedUserId: "admin", assigned: "Admin User", status: "Finished", completedAt: recent },
        { id: "follow-expired", subject: "Expired follow-up", assignedUserId: "admin", assigned: "Admin User", status: "Completed", completedAt: expired }
      ],
      pendingWorkItems: [
        { id: "work-active", workItem: "Active work", status: "Pending" },
        { id: "work-recent", workItem: "Recently completed", status: "Completed", completedAt: recent },
        { id: "work-expired", workItem: "Expired work", status: "Completed", completedAt: expired }
      ]
    }));
    assert.equal(created.status, 201);
    let project = await created.json();
    const base = `/api/project-management/projects/${project.id}`;
    const dashboard = async () => (await request("/api/project-management/dashboard")).json();
    project.submittals = [{ id: "progress-submitted", item: "Drawing", status: "Submitted" }];
    project.installationItems = [{ id: "progress-installation", item: "Ducting", lpo_status: "completed", delivered_status: "in_progress", installation_status: "not_started" }];
    project.testingItems = [{ id: "progress-testing", activity: "Testing", status: "In Progress" }];
    const progressUpdate = await request(base, json("PUT", project));
    assert.equal(progressUpdate.status, 200);
    project = await progressUpdate.json();
    assert.equal(project.derived.progress, 50);
    let view = await dashboard();
    assert.equal(view.projects[0].derived.progress, 50);
    assert.equal(view.kpis.averageProgress, 50);
    assert.deepEqual(view.followUps.map(item => item.id).sort(), ["follow-active", "follow-recent"]);
    assert.deepEqual(view.pendingWorks.map(item => item.id).sort(), ["work-active", "work-recent"]);
    assert.equal(view.kpis.pendingFollowUps, 1);
    assert.equal(project.derived.pendingWorkCount, 1);

    project.followUps[0].status = "Finished";
    const finished = await request(base, json("PUT", project));
    assert.equal(finished.status, 200);
    project = await finished.json();
    const followCompletedAt = project.followUps[0].completedAt;
    assert.ok(Date.now() - Date.parse(followCompletedAt) < 5000);
    const completed = await request(`${base}/pending-works/work-active`, json("PATCH", { field: "status", value: "Completed" }));
    assert.equal(completed.status, 200);
    project = await completed.json();
    const workCompletedAt = project.pendingWorkOverrides["work-active"].completedAt;
    assert.ok(Date.now() - Date.parse(workCompletedAt) < 5000);
    view = await dashboard();
    assert.deepEqual(view.followUps.map(item => item.id).sort(), ["follow-active", "follow-recent"]);
    assert.deepEqual(view.pendingWorks.map(item => item.id).sort(), ["work-active", "work-recent"]);
    assert.equal(view.kpis.pendingFollowUps, 0);
    assert.equal(view.projects[0].derived.pendingWorkCount, 0);

    project.followUps[0].notes = "Edited after completion";
    project = await (await request(base, json("PUT", project))).json();
    assert.equal(project.followUps[0].completedAt, followCompletedAt);
    project = await (await request(`${base}/pending-works/work-active`, json("PATCH", { field: "workItem", value: "Edited after completion" }))).json();
    assert.equal(project.pendingWorkOverrides["work-active"].completedAt, workCompletedAt);

    project.followUps[0].status = "Pending";
    project = await (await request(base, json("PUT", project))).json();
    assert.equal(project.followUps[0].completedAt, "");
    project = await (await request(`${base}/pending-works/work-active`, json("PATCH", { field: "status", value: "In Progress" }))).json();
    assert.equal(project.pendingWorkOverrides["work-active"].completedAt, "");
    assert.equal(project.followUps.length, 3);
    assert.equal(project.derived.pendingWorkRows.length, 3);
  } finally {
    server.kill();
    if (server.exitCode === null) await new Promise(resolve => server.once("exit", resolve));
    assert.ok(temp.startsWith(`${os.tmpdir()}${path.sep}`));
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
