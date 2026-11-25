const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "public", "app.js"), "utf8");
const topbarStart = source.indexOf("function salesDeskTopbarConfig()");
const topbarEnd = source.indexOf("function syncSalesDeskTopbar()", topbarStart);
const actionsStart = source.indexOf("function costingPriceListAvailable()");
const actionsEnd = source.indexOf("function inventoryTopbarConfig()", actionsStart);

function costingView(locked, mode) {
  const context = {
    activeView: "salesDesk",
    salesDeskScreen: "costing",
    salesQuotationMode: "list",
    costingMode: mode,
    costingState: { settings: { priceListLocked: locked } },
    isCurrentAdmin: () => true
  };
  vm.createContext(context);
  vm.runInContext(source.slice(actionsStart, actionsEnd) + source.slice(topbarStart, topbarEnd), context);
  return context.salesDeskTopbarConfig();
}

test("locked Price List is absent from all Costing navigation and view content", () => {
  assert.equal(costingView(true, "all").actions.includes('data-costing-action="show-prices"'), false);
  assert.equal(costingView(true, "sheet").actions.includes('data-costing-action="show-prices"'), false);
  assert.equal(costingView(true, "prices").title, "All Costing Sheets");
  assert.match(source, /if \(costingMode === "prices"\) return costingPriceListAvailable\(\) \? costingPriceListHtml\(\) : costingAllSheetsHtml\(\)/);
  assert.match(source, /if \(action === "show-prices"\) \{ if \(!costingPriceListAvailable\(\)\) return;/);
});

test("unlocked Price List remains available in Costing", () => {
  assert.match(costingView(false, "all").actions, /data-costing-action="show-prices"/);
  assert.match(costingView(false, "sheet").actions, /data-costing-action="show-prices"/);
  assert.equal(costingView(false, "prices").title, "Price List");
});

test("Price List stays hidden while Costing settings are loading", () => {
  const context = { activeView: "salesDesk", salesDeskScreen: "costing", salesQuotationMode: "list", costingMode: "all", costingState: null, isCurrentAdmin: () => true };
  vm.createContext(context);
  vm.runInContext(source.slice(actionsStart, actionsEnd) + source.slice(topbarStart, topbarEnd), context);
  assert.doesNotMatch(context.salesDeskTopbarConfig().actions, /data-costing-action="show-prices"/);
});
