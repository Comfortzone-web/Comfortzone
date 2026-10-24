const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

test("Projects renders prefetched data before its refresh finishes", async () => {
  const dashboard = { projects: [], followUps: [], pendingWorks: [], kpis: { totalProjects: 2 } };
  const listeners = {};
  const root = { innerHTML: "", addEventListener: (name, callback) => { listeners[name] = callback; } };
  let calls = 0;
  let finishRefresh;
  const context = {
    document: { getElementById: () => root, addEventListener() {}, body: { appendChild() {} } },
    window: {}, history: { replaceState() {} },
    fetch: async () => {
      calls++;
      if (calls === 2) await new Promise(resolve => { finishRefresh = resolve; });
      return { ok: true, headers: { get: () => "application/json" }, json: async () => dashboard };
    },
    Date, Intl, FormData, setTimeout, clearTimeout
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../public/projects-module.js"), "utf8"), context);
  await context.window.projectManagement.prefetch();
  const opening = context.window.projectManagement.open();
  assert.match(root.innerHTML, /<h1>Projects<\/h1>/);
  assert.doesNotMatch(root.innerHTML, /Loading Projects/);
  assert.equal(calls, 2);
  finishRefresh();
  await opening;
});
