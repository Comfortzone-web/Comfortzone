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

let orders = [];
const clientContext = {
  salesProjectBoqRows: project => project.boq || [],
  salesProjectBoqDeliveredQty: (_project, row) => Math.max(Number(row.deliveredQty || 0), Number(row.noteDeliveredQty || 0)),
  salesProjectModelNo: value => value,
  salesProjectStockQty: model => ({ A: 10, B: 1 })[model] || 0,
  salesProjectOrderBookNo: project => project.orderBookNo || "",
  salesData: () => ({ orderBook: orders }),
  orderBookDeliveryStatuses: () => ["Ready for Delivery", "Pending Delivery", "Partially Delivered", "Delivered"],
  norm: value => String(value || "").toUpperCase().replace(/[\s_-]/g, ""),
  inventoryState: { models: [] }
};
vm.createContext(clientContext);
vm.runInContext(extract(client, "salesProjectDeliveryState", "salesProjectStatus"), clientContext);
vm.runInContext(extract(client, "salesProjectCurrentStatus", "salesProjectStatusHtml"), clientContext);
vm.runInContext(extract(client, "salesProjectAutoStatus", "salesProjectProduct"), clientContext);
vm.runInContext(extract(client, "salesProjectStatusOptions", "salesProjectCategoryOptions"), clientContext);

const serverContext = { inventoryNorm: value => String(value || "").toUpperCase(), cleanCell: value => String(value || "").trim() };
vm.createContext(serverContext);
vm.runInContext(extract(server, "salesProjectAutoStatusServer", "normalizeSalesProjectDirectDeliveryUpload"), serverContext);
vm.runInContext(extract(server, "salesProjectWithPayment", "salesCrmView").replace(/\s+async\s*$/, ""), serverContext);

test("project and order delivery choices match and omit Completed", () => {
  assert.deepEqual(Array.from(clientContext.salesProjectStatusOptions()), clientContext.orderBookDeliveryStatuses());
});

test("project delivery status follows quantities, stock and payment", () => {
  const status = clientContext.salesProjectCurrentStatus;
  orders = [{ orderNo: "CZ-1", orderValue: 100, paymentReceived: 0, deliveryStatus: "Pending Delivery" }];
  const project = { orderBookNo: "CZ-1", boq: [{ model: "A", qty: 10, stock: 10, deliveredQty: 0 }] };
  assert.equal(status(project), "Ready for Delivery");
  project.boq[0].qty = 11;
  assert.equal(status(project), "Pending Delivery");
  project.boq[0].qty = 10;
  project.boq[0].deliveredQty = 3;
  assert.equal(status(project), "Partially Delivered");
  assert.equal(clientContext.salesProjectDeliveryState(project).readyRemaining, true);
  project.boq[0].deliveredQty = 10;
  assert.equal(status(project), "Delivered");
  orders[0].paymentReceived = 100;
  assert.equal(status(project), "Completed");
});

test("project uses effective delivery-note quantities and keeps manual status without BOQ", () => {
  orders = [];
  assert.equal(clientContext.salesProjectCurrentStatus({ boq: [{ model: "A", qty: 2, noteDeliveredQty: 2 }] }), "Delivered");
  assert.equal(clientContext.salesProjectCurrentStatus({ status: "Ready for Delivery", boq: [] }), "Ready for Delivery");
});

test("server computes delivery separately from payment and syncs linked order", () => {
  const status = serverContext.salesProjectAutoStatusServer;
  const order = { orderNo: "CZ-1", orderValue: 100, paymentReceived: 0, deliveryStatus: "Pending Delivery" };
  const project = { orderBookNo: "CZ-1", boq: [{ model: "A", qty: 10, deliveredQty: 10, stock: 0 }] };
  assert.equal(status(project, order), "Delivered");
  order.paymentReceived = 100;
  assert.equal(status(project, order), "Completed");
  project.boq[0].deliveredQty = 4;
  assert.equal(status(project, order), "Partially Delivered");
  project.boq[0].deliveredQty = 0;
  project.boq[0].stock = 10;
  assert.equal(status(project, order), "Ready for Delivery");
  const store = { orderBook: [order] };
  serverContext.syncSalesProjectDeliveryStatus(store, project, order);
  assert.equal(order.deliveryStatus, "Ready for Delivery");
});

test("linked order keeps the Project delivery status without BOQ rows", () => {
  const order = { orderNo: "CZ-1", deliveryStatus: "Delivered" };
  const project = { orderBookNo: "CZ-1", status: "Ready for Delivery", boq: [] };
  serverContext.syncSalesProjectDeliveryStatus({ orderBook: [order] }, project, order, true);
  assert.equal(order.deliveryStatus, "Ready for Delivery");
  assert.equal(project.status, "Ready for Delivery");
});

test("payment receipt cannot automatically mark an order Delivered", () => {
  assert.doesNotMatch(client, /payload\.deliveryStatus\s*=\s*"Delivered"/);
  assert.doesNotMatch(server, /deliveryStatus:\s*!base\.sourceValueMissing/);
});

test("issued delivery notes update linked project and order delivery view", () => {
  const order = { id: "order-1", orderNo: "CZ-1", orderValue: 100, paymentReceived: 0, deliveryStatus: "Pending Delivery" };
  const project = { name: "Project A", customer: "Customer A", orderBookNo: "CZ-1", boq: [{ model: "A", qty: 2, deliveredQty: 0 }] };
  const store = { orderBook: [order] };
  const inventory = { deliveryNotes: [{ status: "Issued", projectName: "Project A", customerName: "Customer A", lines: [{ modelNo: "A", qtyGoingOut: 1 }] }] };
  assert.equal(serverContext.salesProjectStatusView(store, project, inventory).status, "Partially Delivered");
  inventory.deliveryNotes[0].lines[0].qtyGoingOut = 2;
  assert.equal(serverContext.salesProjectStatusView(store, project, inventory).status, "Delivered");
  order.paymentReceived = 100;
  assert.equal(serverContext.salesProjectStatusView(store, project, inventory).status, "Completed");
});
