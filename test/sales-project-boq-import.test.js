const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
const start = source.indexOf("function salesProjectImportBoqRows(");
const end = source.indexOf("function projectManagementImportBoq(", start);
assert.ok(start >= 0 && end > start);
const context = {
  path,
  cleanCell: value => String(value ?? "").trim(),
  csvTableRows: text => text.trim().split(/\r?\n/).map(line => line.split(","))
};
vm.createContext(context);
vm.runInContext(source.slice(start, end), context);

test("sales project BOQ preview reads model and quantity without saving", () => {
  const rows = context.salesProjectImportBoqRows({ filename: "boq.csv", body: Buffer.from("Model No.,Description,BOQ Qty\nABC-1,Indoor unit,3\nABC-2,Outdoor unit,2") });
  assert.deepEqual(Array.from(rows, row => ({ ...row })), [
    { model: "ABC-1", description: "Indoor unit", qty: 3 },
    { model: "ABC-2", description: "Outdoor unit", qty: 2 }
  ]);
});

test("sales project BOQ preview accepts Item and Description headings", () => {
  const rows = context.salesProjectImportBoqRows({ filename: "boq.csv", body: Buffer.from("Item,Description,BOQ\nFXMQ125PBV1,Indoor unit,4") });
  assert.equal(rows[0].model, "FXMQ125PBV1");
  assert.equal(rows[0].description, "Indoor unit");
  assert.equal(rows[0].qty, 4);
  const descriptionOnly = context.salesProjectImportBoqRows({ filename: "boq.csv", body: Buffer.from("Description,Qty\nFXMQ125PBV1,2") });
  assert.equal(descriptionOnly[0].model, "FXMQ125PBV1");
  assert.equal(descriptionOnly[0].qty, 2);
});
