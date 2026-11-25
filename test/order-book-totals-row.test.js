const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "public", "app.js"), "utf8");
const helpersStart = source.indexOf("function salesOrderBookHasActiveFilters()");
const helpersEnd = source.indexOf("function orderBookKpi(", helpersStart);
const statsStart = source.indexOf("function salesOrderBookStats(");
const statsEnd = source.indexOf("function orderBookIsDeliveryPending(", statsStart);

function context(overrides = {}) {
  const sandbox = {
    salesSearchQuery: "",
    salesOrderBookTab: "all",
    salesOrderBookFilters: { salesPerson: "", customer: "", dateRange: "", startDate: "", endDate: "", orderStatus: "", paymentStatus: "", balancePending: "" },
    salesMoney: value => `AED ${Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    norm: value => String(value || "").toUpperCase(),
    orderBookIsDeliveryPending: () => false,
    ...overrides
  };
  vm.createContext(sandbox);
  vm.runInContext(source.slice(statsStart, statsEnd) + source.slice(helpersStart, helpersEnd), sandbox);
  return sandbox;
}

test("Order Book totals appear only for search, filters, or a non-default tab", () => {
  const view = context();
  assert.equal(view.salesOrderBookHasActiveFilters(), false);
  view.salesSearchQuery = "  in ch ";
  assert.equal(view.salesOrderBookHasActiveFilters(), true);
  view.salesSearchQuery = "";
  view.salesOrderBookFilters.customer = "INCH SPACE";
  assert.equal(view.salesOrderBookHasActiveFilters(), true);
  view.salesOrderBookFilters.customer = "";
  view.salesOrderBookTab = "completed";
  assert.equal(view.salesOrderBookHasActiveFilters(), true);
});

test("Order Book footer totals every filtered order and keeps other columns empty", () => {
  const view = context();
  const html = view.salesOrderBookTotalsRow([
    { orderValue: 96600, paymentReceived: 0, balance: 96600, status: "Payment Pending" },
    { orderValue: 819, paymentReceived: 819, balance: 0, status: "Completed" },
    { orderValue: 228000, paymentReceived: 228000, balance: 0, status: "Completed" }
  ]);
  assert.match(html, /<td>AED 325,419\.00<\/td><td>AED 228,819\.00<\/td><td>AED 96,600\.00<\/td>/);
  assert.equal((html.match(/<td>/g) || []).length, 8);
  assert.equal((html.match(/<td><\/td>/g) || []).length, 5);
  assert.match(source, /salesOrderBookTotalsRow\(rows\)/);
  assert.match(source, /<tfoot>\$\{totalsRow\}<\/tfoot>/);
});
