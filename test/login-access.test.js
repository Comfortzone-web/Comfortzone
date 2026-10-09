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

test("Login Access saves role changes together and applies them to active sessions", { timeout: 30000 }, async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "cz-login-access-"));
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
  const json = (body, method = "POST") => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const request = (cookie, endpoint, options = {}) => fetch(`${base}${endpoint}`, {
    ...options, headers: { Cookie: cookie, ...options.headers }
  });
  try {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      if (server.exitCode !== null) throw new Error(logs);
      try { await fetch(`${base}/api/auth/me`); break; } catch {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    const login = async (email, password) => {
      const response = await fetch(`${base}/api/auth/login`, json({ email, password }));
      assert.equal(response.status, 200, logs);
      return response.headers.get("set-cookie").split(";")[0];
    };
    const admin = await login("admin@comfortzone.local", "admin123");
    const created = [];
    for (const name of ["Alice", "Bob"]) {
      const response = await request(admin, "/api/settings/users", json({
        name, email: `${name.toLowerCase()}@example.test`, role: "Staff", password: "test-password"
      }));
      assert.equal(response.status, 200, logs);
      created.push((await response.json()).settings.users.find(item => item.name === name));
    }
    const alice = await login("alice@example.test", "test-password");
    const updates = [
      { ...created[0], role: "MTS" },
      { ...created[1], role: "Admin", name: "Bob Admin" }
    ];
    const saved = await request(admin, "/api/settings/users/batch", json({ users: updates }, "PUT"));
    assert.equal(saved.status, 200, logs);
    const savedUsers = (await saved.json()).settings.users;
    assert.equal(savedUsers.find(item => item.id === created[0].id).role, "MTS");
    assert.equal(savedUsers.find(item => item.id === created[1].id).name, "Bob Admin");
    assert.equal((await (await request(admin, "/api/settings")).json()).settings.users.find(item => item.id === created[1].id).role, "Admin");
    assert.equal((await (await request(alice, "/api/auth/me")).json()).user.role, "MTS");
    assert.equal((await request(alice, "/api/settings/users/batch", json({ users: updates }, "PUT"))).status, 403);
    assert.equal((await request(admin, "/api/settings/users/batch", json({ users: [
      { ...created[0], role: "Staff", email: "bob@example.test" }
    ] }, "PUT"))).status, 400);
    assert.equal((await (await request(admin, "/api/settings")).json()).settings.users.find(item => item.id === created[0].id).role, "MTS");
  } finally {
    server.kill();
    if (server.exitCode === null) await new Promise(resolve => server.once("exit", resolve));
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
