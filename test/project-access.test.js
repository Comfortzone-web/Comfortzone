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

test("MTS users see only tagged projects and each dashboard shows only assigned follow-ups", { timeout: 20000 }, async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "cz-project-access-"));
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
  const json = (method, body) => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  try {
    await waitForServer(url, server);
    const login = async email => {
      const response = await fetch(`${url}/api/auth/login`, json("POST", { email, password: "test-password" }));
      assert.equal(response.status, 200, logs);
      return response.headers.get("set-cookie").split(";")[0];
    };
    const adminLogin = await fetch(`${url}/api/auth/login`, json("POST", { email: "admin@comfortzone.local", password: "admin123" }));
    assert.equal(adminLogin.status, 200, logs);
    const admin = adminLogin.headers.get("set-cookie").split(";")[0];
    const request = (cookie, endpoint, options = {}) => fetch(`${url}${endpoint}`, { ...options, headers: { Cookie: cookie, ...options.headers } });
    const createUser = async (name, email, role) => {
      const response = await request(admin, "/api/settings/users", json("POST", { name, email, role, password: "test-password", active: true }));
      assert.equal(response.status, 200);
      return (await response.json()).settings.users.find(user => user.email === email);
    };
    const alice = await createUser("Alice Engineer", "alice@example.test", "MTS");
    const bob = await createUser("Bob Engineer", "bob@example.test", "PO Only");
    await createUser("Office Staff", "staff@example.test", "Staff");
    const created = async body => {
      const response = await request(admin, "/api/project-management/projects", json("POST", body));
      assert.equal(response.status, 201);
      return response.json();
    };
    const aliceProject = await created({
      name: "Alice project", projectEngineers: [{ id: alice.id, name: alice.name }],
      pendingWorkItems: [{ id: "alice-work", workItem: "Alice pending work" }],
      followUps: [
        { id: "alice-follow", subject: "Alice task", assignedUserId: alice.id, assigned: "Wrong name" },
        { id: "alice-legacy", subject: "Legacy Alice task", assigned: alice.name },
        { id: "bob-follow", subject: "Bob task on Alice project", assignedUserId: bob.id, assigned: bob.name },
        { id: "admin-follow", subject: "Admin task", assignedUserId: "admin", assigned: "Admin User" },
        { id: "unassigned-follow", subject: "Unassigned task" }
      ]
    });
    assert.equal(aliceProject.followUps[0].assigned, alice.name);
    const bobProject = await created({
      name: "Bob project", projectEngineers: [{ id: bob.id, name: bob.name }],
      pendingWorkItems: [{ id: "bob-work", workItem: "Bob pending work" }],
      followUps: [{ id: "bob-own", subject: "Bob own task", assignedUserId: bob.id, assigned: bob.name }]
    });
    await created({ name: "Untagged project" });

    const aliceCookie = await login(alice.email);
    const bobCookie = await login(bob.email);
    const staffCookie = await login("staff@example.test");
    const dashboard = async cookie => (await request(cookie, "/api/project-management/dashboard")).json();
    const aliceView = await dashboard(aliceCookie);
    assert.deepEqual(aliceView.projects.map(project => project.id), [aliceProject.id]);
    assert.deepEqual(aliceView.followUps.map(item => item.id).sort(), ["alice-follow", "alice-legacy"]);
    assert.deepEqual(aliceView.pendingWorks.map(item => item.id), ["alice-work"]);
    assert.equal(aliceView.kpis.pendingFollowUps, 2);
    assert.equal(aliceView.projects[0].derived.activeFollowUpCount, 2);
    assert.deepEqual(aliceView.projects[0].followUps, []);
    assert.equal(aliceView.permissions.canCreateProject, true);
    const aliceList = await (await request(aliceCookie, "/api/project-management/projects")).json();
    assert.deepEqual(aliceList.map(project => project.id), [aliceProject.id]);
    const aliceDetail = await request(aliceCookie, `/api/project-management/projects/${aliceProject.id}`);
    assert.equal(aliceDetail.status, 200);
    assert.equal((await aliceDetail.json()).followUps.length, 5);
    assert.equal((await request(aliceCookie, `/api/project-management/projects/${bobProject.id}`)).status, 404);
    assert.equal((await request(aliceCookie, `/api/project-management/projects/${bobProject.id}/pending-works`, json("POST", {}))).status, 404);
    const ownProjectResponse = await request(aliceCookie, "/api/project-management/projects", json("POST", { name: "Alice new project", createdBy: "Someone Else" }));
    assert.equal(ownProjectResponse.status, 201);
    const ownProject = await ownProjectResponse.json();
    assert.equal(ownProject.createdBy, alice.name);
    assert.deepEqual(ownProject.projectEngineers, [{ id: alice.id, name: alice.name }]);
    assert.ok((await dashboard(aliceCookie)).projects.some(project => project.id === ownProject.id));
    assert.equal((await request(bobCookie, `/api/project-management/projects/${ownProject.id}`)).status, 404);

    const bobView = await dashboard(bobCookie);
    assert.deepEqual(bobView.projects.map(project => project.id), [bobProject.id]);
    assert.deepEqual(bobView.followUps.map(item => item.id), ["bob-own"]);
    assert.deepEqual(bobView.pendingWorks.map(item => item.id), ["bob-work"]);
    const adminView = await dashboard(admin);
    assert.equal(adminView.projects.length, 4);
    assert.deepEqual(adminView.followUps.map(item => item.id), ["admin-follow"]);
    assert.equal(adminView.kpis.pendingFollowUps, 1);
    assert.equal((await request(staffCookie, "/api/project-management/dashboard")).status, 403);

    const invalidAssignment = await request(admin, `/api/project-management/projects/${aliceProject.id}`, json("PUT", {
      ...aliceProject, followUps: [...aliceProject.followUps, { id: "invalid", subject: "Invalid", assignedUserId: "missing-user" }]
    }));
    assert.equal(invalidAssignment.status, 400);
  } finally {
    server.kill();
    if (server.exitCode === null) await new Promise(resolve => server.once("exit", resolve));
    assert.ok(temp.startsWith(`${os.tmpdir()}${path.sep}`));
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
