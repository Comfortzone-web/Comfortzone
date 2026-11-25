const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "public", "ool-ui.js"), "utf8");
const start = source.indexOf("function bindSelectAll(");
const end = source.indexOf("function bind(){", start);
assert.ok(start >= 0 && end > start);

test("OOL header checkbox selects and clears all filtered selectable rows including Awaiting OC across pages", () => {
  const rows = Array.from({ length: 30 }, (_, index) => ({ id: `row-${index}`, available: index >= 28 ? 0 : 1, status: index === 28 ? "Awaiting OC" : "Order Confirmed" }));
  const selected = new Set();
  let renders = 0;
  const context = { filtered: () => rows, selected, render: () => { renders += 1; } };
  vm.createContext(context);
  vm.runInContext(source.slice(start, end), context);
  const checkbox = {};

  context.bindSelectAll(checkbox);
  assert.equal(checkbox.checked, false);
  checkbox.checked = true;
  checkbox.onchange();
  assert.equal(selected.size, 29);
  assert.equal(selected.has("row-28"), true);
  assert.equal(selected.has("row-29"), false);

  context.bindSelectAll(checkbox);
  assert.equal(checkbox.checked, true);
  selected.delete("row-28");
  context.bindSelectAll(checkbox);
  assert.equal(checkbox.indeterminate, true);
  checkbox.checked = false;
  checkbox.onchange();
  assert.equal(selected.size, 0);
  assert.equal(renders, 2);
});
