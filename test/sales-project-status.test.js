const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const client = fs.readFileSync(path.join(__dirname, "..", "public", "app.js"), "utf8");
const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");

function extract(source, start, end) {
  const from = source.indexOf(`function ${start}(`);
  const to = source.indexOf(`function ${end}(`, from);
  assert.ok(from >= 0 && to > from);
  return source.slice(from, to);
}

const clientContext = { salesProjectBoqRows: project => project.boq || [] };
vm.createContext(clientContext);
vm.runInContext(extract(client, "salesProjectAutoStatus", "salesProjectProduct"), clientContext);
clientContext.salesProjectBoqDeliveredQty = (_project, row) => Math.max(Number(row.deliveredQty || 0), Number(row.noteDeliveredQty || 0));
vm.runInContext(extract(client, "salesProjectCurrentStatus", "salesProjectPeople"), clientContext);
vm.runInContext(extract(client, "salesProjectStatusOptions", "salesProjectCategoryOptions"), clientContext);

const serverContext = {};
vm.createContext(serverContext);
vm.runInContext(extract(server, "salesProjectAutoStatusServer", "normalizeSalesProjectDirectDeliveryUpload"), serverContext);

test("project status choices exclude Lost / Closed", () => {
  assert.deepEqual(Array.from(clientContext.salesProjectStatusOptions()), ["Ongoing", "Delivery Pending", "Completed"]);
});

test("project completion follows displayed pending quantity", () => {
  const status = clientContext.salesProjectAutoStatus;
  assert.equal(status({ boq: [] }), "Ongoing");
  assert.equal(status({ boq: [{ model: "A", qty: 10, deliveredQty: 0, pendingQty: 0 }] }), "Completed");
  assert.equal(status({ boq: [{ model: "A", qty: 10, deliveredQty: 9, pendingQty: 1 }] }), "Delivery Pending");
});

test("project list status follows effective delivery quantities rather than stale saved status", () => {
  const status = clientContext.salesProjectCurrentStatus;
  assert.equal(status({ status: "Delivery Pending", boq: [{ model: "A", qty: 2, deliveredQty: 0, noteDeliveredQty: 2 }] }), "Completed");
  assert.equal(status({ status: "Completed", boq: [{ model: "A", qty: 2, deliveredQty: 1 }] }), "Delivery Pending");
  assert.equal(status({ boq: [] }), "Ongoing");
});

test("server recalculates legacy Lost / Closed projects from delivered quantities", () => {
  const status = serverContext.salesProjectAutoStatusServer;
  assert.equal(status({ status: "Lost / Closed", boq: [{ model: "A", qty: 10, deliveredQty: 10 }] }), "Completed");
  assert.equal(status({ boq: [{ model: "A", qty: 10, deliveredQty: 9 }] }), "Delivery Pending");
});
