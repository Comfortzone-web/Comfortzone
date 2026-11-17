const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const client = fs.readFileSync(path.join(__dirname, "..", "public", "app.js"), "utf8");
const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
const clientStart = client.indexOf("function salesProjectPaymentHtml(");
const clientEnd = client.indexOf("function salesProjectStatus(", clientStart);
const serverStart = server.indexOf("function salesProjectWithPayment(");
const serverEnd = server.indexOf("async function salesCrmView(", serverStart);
assert.ok(clientStart >= 0 && clientEnd > clientStart && serverStart >= 0 && serverEnd > serverStart);

const clientContext = {
  salesProjectOrderBookNo: project => project.orderBookNo || "",
  salesData: () => ({ orderBook: [] }),
  norm: value => String(value || "").toLowerCase(),
  escapeHtml: value => String(value),
  salesMoney: value => `AED ${Number(value).toFixed(2)}`
};
vm.createContext(clientContext);
vm.runInContext(client.slice(clientStart, clientEnd), clientContext);

test("linked project payment shows pending, partial, and completed states", () => {
  const html = clientContext.salesProjectPaymentHtml;
  const project = (value, received) => ({ orderBookNo: "CZ-1", linkedOrderPayment: { orderValue: value, paymentReceived: received } });
  assert.match(html(project(100, 0)), /AED 100\.00.*Payment Pending/s);
  assert.match(html(project(100, 40)), /AED 60\.00.*Payment Pending/s);
  assert.match(html(project(100, 100)), /AED 0\.00.*Payment Completed/s);
  assert.match(html({}), /sales-project-payment-empty/);
});

const serverContext = { cleanCell: value => String(value || "").trim() };
vm.createContext(serverContext);
vm.runInContext(server.slice(serverStart, serverEnd), serverContext);

test("project view includes only linked order payment totals", () => {
  const project = serverContext.salesProjectWithPayment({ orderBook: [{ orderNo: "CZ-1", projectNo: "1008", customer: "Client", orderValue: 100, paymentReceived: 40, privateNote: "hidden" }] }, { projectNo: "1008", customer: "Client" });
  assert.equal(project.linkedOrderPayment.orderValue, 100);
  assert.equal(project.linkedOrderPayment.paymentReceived, 40);
  assert.equal(project.linkedOrderPayment.privateNote, undefined);
});
