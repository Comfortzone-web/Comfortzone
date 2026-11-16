const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const vm = require('node:vm');
const { spawn } = require('node:child_process');

test('Sales Person badge offers active Staff logins only to admins', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'dx-workflow.js'), 'utf8');
  const start = source.indexOf('function dxSalesPersonBadge()');
  const end = source.indexOf('function workflowBindSalesPerson(', start);
  const ctx = { state: { ownerId: 'staff-1', salesPerson: 'Alice', details: {} },
    currentUser: { role: 'Admin', name: 'Admin User' },
    appSettings: { users: [
      { id: 'staff-1', name: 'Alice', role: 'Staff', active: true },
      { id: 'staff-2', name: 'Bob', role: 'Staff', active: false },
      { id: 'admin', name: 'Admin User', role: 'Admin', active: true }
    ] }, escapeHtml: value => String(value) };
  vm.runInNewContext(source.slice(start, end), ctx);
  const adminBadge = ctx.dxSalesPersonBadge();
  assert.match(adminBadge, /data-workflow-sales-person/);
  assert.match(adminBadge, /Alice/);
  assert.doesNotMatch(adminBadge, /Bob/);
  ctx.currentUser.role = 'Staff';
  assert.doesNotMatch(ctx.dxSalesPersonBadge(), /data-workflow-sales-person/);
});

async function freePort() {
  const probe = net.createServer();
  await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  return port;
}

test('DX and VRV workflows belong to their authenticated creator', { timeout: 30000 }, async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'cz-workflow-owner-'));
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const source = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.match(source, /const PORTS = \[5175, 5176, 5177, 8085\];/);
  fs.writeFileSync(path.join(temp, 'server.js'), source.replace('const PORTS = [5175, 5176, 5177, 8085];', `const PORTS = [${port}];`));
  for (const file of ['project-progress.js', 'maintenance-api.js', 'maintenance-store.js', 'maintenance-billing.js'])
    fs.copyFileSync(path.join(__dirname, '..', file), path.join(temp, file));
  const server = spawn(process.execPath, ['server.js'], {
    cwd: temp, env: { ...process.env, SUPABASE_URL: '', SUPABASE_KEY: '' }, stdio: ['ignore', 'pipe', 'pipe']
  });
  let logs = '';
  server.stdout.on('data', chunk => { logs += chunk; });
  server.stderr.on('data', chunk => { logs += chunk; });
  const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const request = (cookie, endpoint, options = {}) => fetch(`${base}${endpoint}`, {
    ...options, headers: { Cookie: cookie, ...options.headers }
  });
  try {
    let ready = false;
    for (let attempt = 0; attempt < 50; attempt += 1) {
      if (server.exitCode !== null) throw new Error(logs);
      try { await fetch(`${base}/api/auth/me`); ready = true; break; } catch {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(ready, logs);
    const login = async (email, password) => {
      const response = await fetch(`${base}/api/auth/login`, json('POST', { email, password }));
      assert.equal(response.status, 200, logs);
      return response.headers.get('set-cookie').split(';')[0];
    };
    const admin = await login('admin@comfortzone.local', 'admin123');
    const createStaff = async (name, email) => {
      const response = await request(admin, '/api/settings/users', json('POST', { name, email, role: 'Staff', password: 'test-password', active: true }));
      assert.equal(response.status, 200, logs);
      return (await response.json()).settings.users.find(user => user.email === email);
    };
    const alice = await createStaff('Alice Sales', 'alice@example.test');
    const bob = await createStaff('Bob Sales', 'bob@example.test');
    const aliceCookie = await login(alice.email, 'test-password');
    const bobCookie = await login(bob.email, 'test-password');
    const hiddenDraft = await (await request(aliceCookie, '/api/projects?draft=1', json('POST', { workflowMode: 'vrv' }))).json();
    const hiddenSaved = await request(aliceCookie, `/api/projects/${hiddenDraft.id}`, json('PUT', hiddenDraft));
    assert.equal(hiddenSaved.status, 200, logs);
    const uploadForm = new FormData();
    uploadForm.append('nodeId', 'thermal-upload');
    uploadForm.append('file', new Blob(['thermal sheet'], { type: 'text/plain' }), 'thermal.txt');
    assert.equal((await request(aliceCookie, `/api/projects/${hiddenDraft.id}/uploads`, { method: 'POST', body: uploadForm })).status, 201, logs);
    assert.equal((await (await request(aliceCookie, `/api/projects/${hiddenDraft.id}`)).json()).visible, false);
    assert.ok(!(await (await request(aliceCookie, '/api/projects')).json()).some(item => item.id === hiddenDraft.id));
    const createWorkflow = async (cookie, mode, spoofedOwner = null) => {
      const draftResponse = await request(cookie, '/api/projects?draft=1', json('POST', { workflowMode: mode }));
      assert.equal(draftResponse.status, 200, logs);
      const draft = await draftResponse.json();
      draft.visible = true;
      draft.details.project = `${mode} selection`;
      if (spoofedOwner) { draft.ownerId = spoofedOwner.id; draft.salesPerson = spoofedOwner.name; }
      const saved = await request(cookie, `/api/projects/${draft.id}`, json('PUT', draft));
      assert.equal(saved.status, 200, logs);
      return saved.json();
    };
    const aliceDx = await createWorkflow(aliceCookie, 'dx', bob);
    const aliceVrv = await createWorkflow(aliceCookie, 'vrv');
    const bobVrv = await createWorkflow(bobCookie, 'vrv');
    assert.equal(aliceDx.ownerId, alice.id);
    assert.equal(aliceDx.salesPerson, alice.name);
    assert.equal(aliceDx.createdById, alice.id);
    assert.equal(aliceDx.createdByName, alice.name);
    assert.equal(aliceVrv.createdByName, alice.name);
    const aliceList = await (await request(aliceCookie, '/api/projects')).json();
    const bobList = await (await request(bobCookie, '/api/projects')).json();
    const adminList = await (await request(admin, '/api/projects')).json();
    assert.deepEqual(new Set(aliceList.map(item => item.id)), new Set([aliceDx.id, aliceVrv.id]));
    assert.deepEqual(new Set(bobList.map(item => item.id)), new Set([bobVrv.id]));
    assert.deepEqual(new Set(adminList.map(item => item.id)), new Set([aliceDx.id, aliceVrv.id, bobVrv.id]));
    assert.equal(aliceList.find(item => item.id === aliceDx.id).salesPerson, alice.name);
    assert.equal((await request(bobCookie, `/api/projects/${aliceDx.id}`)).status, 404);
    assert.equal((await request(bobCookie, `/api/projects/${aliceDx.id}`, json('PUT', { ...aliceDx, ownerId: bob.id }))).status, 404);
    assert.equal((await request(bobCookie, `/api/projects/${aliceDx.id}`, { method: 'DELETE' })).status, 404);
    assert.equal((await request(bobCookie, `/api/projects/${aliceDx.id}/uploads/file`)).status, 404);
    assert.equal((await request(bobCookie, '/api/sales-crm/quotations', json('POST', { fromDxBoq: true, sourceDxWorkflowId: aliceDx.id }))).status, 404);
    assert.equal((await request(admin, `/api/projects/${aliceDx.id}`)).status, 200);
    const ownUpdate = await request(aliceCookie, `/api/projects/${aliceDx.id}`, json('PUT', { ...aliceDx, ownerId: bob.id, salesPerson: bob.name, createdById: bob.id, createdByName: bob.name }));
    assert.equal(ownUpdate.status, 200);
    const immutable = await ownUpdate.json();
    assert.equal(immutable.ownerId, alice.id);
    assert.equal(immutable.createdById, alice.id);
    assert.equal(immutable.createdByName, alice.name);
    const staffAuth = await (await request(aliceCookie, '/api/auth/me')).json();
    assert.deepEqual(staffAuth.settings.workflowSalesPeople, []);
    assert.deepEqual(staffAuth.settings.users, []);
    assert.equal((await request(bobCookie, `/api/projects/${aliceDx.id}/sales-person`, json('PATCH', { userId: bob.id }))).status, 404);
    assert.equal((await request(aliceCookie, `/api/projects/${aliceVrv.id}/sales-person`, json('PATCH', { userId: bob.id }))).status, 403);
    assert.equal((await request(aliceCookie, `/api/projects/${aliceVrv.id}`)).status, 200);
    assert.equal((await request(bobCookie, `/api/projects/${aliceVrv.id}`)).status, 404);
    assert.equal((await request(admin, `/api/projects/${aliceDx.id}/sales-person`, json('PATCH', { userId: 'missing' }))).status, 400);
    const transferred = await request(admin, `/api/projects/${aliceDx.id}/sales-person`, json('PATCH', { userId: bob.id }));
    assert.equal(transferred.status, 200);
    assert.deepEqual(await transferred.json(), { ownerId: bob.id, salesPerson: bob.name });
    const transferredProject = await (await request(bobCookie, `/api/projects/${aliceDx.id}`)).json();
    assert.equal(transferredProject.createdById, alice.id);
    assert.equal(transferredProject.createdByName, alice.name);
    assert.equal((await request(aliceCookie, `/api/projects/${aliceDx.id}`)).status, 404);
    assert.equal((await request(bobCookie, `/api/projects/${aliceDx.id}`)).status, 200);
    assert.equal((await request(bobCookie, '/api/projects')).status, 200);
    assert.ok((await (await request(bobCookie, '/api/projects')).json()).some(item => item.id === aliceDx.id && item.salesPerson === bob.name));
    assert.equal((await request(bobCookie, `/api/projects/${aliceDx.id}`, { method: 'DELETE' })).status, 200);
  } finally {
    server.kill();
    if (server.exitCode === null) await new Promise(resolve => server.once('exit', resolve));
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
