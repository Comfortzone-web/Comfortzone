const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const app = fs.readFileSync(path.join(__dirname, "..", "public", "app.js"), "utf8");
const css = fs.readFileSync(path.join(__dirname, "..", "public", "styles.css"), "utf8");
const start = app.indexOf("async function deleteSalesProjectBoqRow(");
const end = app.indexOf("async function saveSalesProjectInBackground(", start);
assert.ok(start >= 0 && end > start);

function setup(saveSalesProject) {
  const notices = [];
  const saveButton = { disabled: false };
  const row = {
    dataset: { projectBoqPersistedIndex: "0" },
    isConnected: true,
    remove() { this.isConnected = false; }
  };
  const parent = {
    querySelectorAll: () => [],
    insertBefore(restored) { restored.isConnected = true; }
  };
  row.parentElement = parent;
  const modal = {
    _projectBase: { id: "project-1", boq: [{ model: "A" }, { model: "B" }] },
    isConnected: true,
    querySelector: () => saveButton
  };
  const context = {
    structuredClone,
    pendingSalesProjectSaves: new Map(),
    salesProjectRefreshDrawerStatus: () => {},
    showOrderBookSaveNotice: (...args) => notices.push(args),
    saveSalesProject,
    openSalesProjectDrawer: () => {}
  };
  vm.createContext(context);
  vm.runInContext(app.slice(start, end), context);
  return { context, modal, row, saveButton, notices };
}

test("BOQ X keeps its original hover-only look without a pointer gap", () => {
  const rule = css.match(/\.sales-project-row-delete\s*\{([^}]+)\}/)?.[1] || "";
  assert.match(rule, /position:\s*absolute/);
  assert.match(rule, /right:\s*-37px/);
  assert.match(rule, /width:\s*44px/);
  assert.match(rule, /font-size:\s*16px/);
  assert.match(rule, /visibility:\s*hidden/);
  assert.match(css, /\.sales-project-row-delete:hover:not\(:disabled\)/);
  assert.match(app, /aria-label="Delete BOQ row"[^>]*>x<\/button>/);
  assert.match(app, /data-project-boq-persisted-index/);
});

test("saved BOQ row disappears before the backend confirms and stays deleted on success", async () => {
  let finishSave;
  let submitted;
  const state = setup(payload => {
    submitted = payload;
    return new Promise(resolve => { finishSave = () => resolve(payload); });
  });
  const pending = state.context.deleteSalesProjectBoqRow(state.modal, state.row);
  assert.equal(state.row.isConnected, false);
  assert.equal(state.saveButton.disabled, true);
  assert.equal(state.context.pendingSalesProjectSaves.has("project-1"), true);
  assert.deepEqual(submitted.boq.map(row => row.model), ["B"]);
  finishSave();
  await pending;
  assert.equal(state.saveButton.disabled, false);
  assert.equal(state.context.pendingSalesProjectSaves.has("project-1"), false);
  assert.equal(state.notices.at(-1)[1], "saved");
});

test("failed BOQ deletion restores the row", async () => {
  const state = setup(async () => { throw new Error("Save failed"); });
  await state.context.deleteSalesProjectBoqRow(state.modal, state.row);
  assert.equal(state.row.isConnected, true);
  assert.equal(state.saveButton.disabled, false);
  assert.equal(state.notices.at(-1)[1], "failed");
});
