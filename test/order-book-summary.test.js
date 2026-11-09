const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../public/app.js"), "utf8");
const start = source.indexOf("function orderBookPremiumSummaryHtml()");
const end = source.indexOf("function exportOrderBookSummary()", start);
const renderSource = source.slice(start, end);

function summaryContext(overrides = {}) {
  const orders = [
    { id: "june-a", orderNo: "O-1", date: "2026-06-03", customer: "Alpha", jobDescription: "AC", salesPerson: "Amal", division: "Trading", status: "Completed", valueWithoutVat: 100, orderValue: 105, equipmentProfit: 20, paymentReceived: 105, balance: 0 },
    { id: "june-b", orderNo: "O-2", date: "2026-06-18", customer: "Beta", jobDescription: "VRV", salesPerson: "Yoonus", division: "Projects", status: "Payment Pending", valueWithoutVat: 200, orderValue: 210, equipmentProfit: 30, paymentReceived: 0, balance: 210 },
    { id: "july-a", orderNo: "O-3", date: "2026-07-01", customer: "Gamma", jobDescription: "DX", salesPerson: "Amal", division: "Trading", status: "Completed", valueWithoutVat: 300, orderValue: 315, equipmentProfit: 40, paymentReceived: 315, balance: 0 }
  ];
  const context = {
    salesOrderBookRows: () => orders,
    salesData: () => ({ settings: { salesPeople: [], salesTargets: [] } }),
    nativeDateValue: value => value,
    norm: value => String(value || "").toUpperCase(),
    escapeHtml: value => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;"),
    salesMoney: value => `AED ${Number(value || 0).toFixed(2)}`,
    salesCompactMoney: value => `AED ${Number(value || 0).toFixed(0)}`,
    orderSummaryTarget: () => 300000,
    isCurrentAdmin: () => true,
    orderSummaryYear: "2026",
    orderSummaryMonth: "",
    orderSummaryPerson: "",
    orderSummaryDivision: "",
    orderSummaryStatus: "",
    orderSummarySearch: "",
    orderSummarySort: "newest",
    orderSummaryPage: 1,
    ...overrides
  };
  vm.createContext(context);
  vm.runInContext(renderSource, context);
  return context;
}

test("year and month summary use the same filtered order records", () => {
  const context = summaryContext();
  const year = context.orderBookPremiumSummaryHtml();
  assert.match(year, /YEAR VIEW/);
  assert.match(year, /AED 600/);
  assert.match(year, /june-a/);
  assert.match(year, /july-a/);

  context.orderSummaryMonth = "06";
  const month = context.orderBookPremiumSummaryHtml();
  assert.match(month, /MONTH VIEW/);
  assert.match(month, /Daily Order Value/);
  assert.match(month, /AED 300/);
  assert.match(month, /june-a/);
  assert.match(month, /AED 105\.00/);
  assert.doesNotMatch(month, /july-a/);

  context.orderSummaryPerson = "Amal";
  context.orderSummaryDivision = "Trading";
  context.orderSummaryStatus = "Completed";
  const filtered = context.orderBookPremiumSummaryHtml();
  assert.match(filtered, /1 matching orders/);
  assert.match(filtered, /june-a/);
  assert.doesNotMatch(filtered, /june-b/);
});

test("summary register search and pagination retain access to all orders", () => {
  const context = summaryContext({ orderSummarySearch: "beta", orderSummaryMonth: "06" });
  const html = context.orderBookPremiumSummaryHtml();
  assert.match(html, /june-b/);
  assert.doesNotMatch(html, /june-a/);
  assert.match(html, /Showing 1–1 of 1 orders/);
});

test("annual month cells use each person's configured target and leave no-sales cells neutral", () => {
  const targets = { Amal: 250, Yoonus: 300 };
  const context = summaryContext({ orderSummaryTarget: person => targets[person] });
  const html = context.orderBookPremiumSummaryHtml();
  assert.match(html, /order-premium-annual/);
  assert.match(html, /order-premium-month-below[^>]*>AED 100<\/td>/);
  assert.match(html, /order-premium-month-met[^>]*>AED 300<\/td>/);
  assert.match(html, /order-premium-month-empty">—<\/td>/);

  context.orderSummaryMonth = "06";
  assert.doesNotMatch(context.orderBookPremiumSummaryHtml(), /order-premium-annual/);
});

test("partially paid register status has its own badge style", () => {
  const context = summaryContext({ salesOrderBookRows: () => [
    { id: "part-paid", orderNo: "O-4", date: "2026-06-04", customer: "Delta", jobDescription: "DX", salesPerson: "Amal", division: "Trading", status: "Partially Paid", valueWithoutVat: 100, orderValue: 105, equipmentProfit: 20, paymentReceived: 50, balance: 55 }
  ] });
  assert.match(context.orderBookPremiumSummaryHtml(), /order-premium-status partially-paid">Partially Paid<\/span>/);
});
