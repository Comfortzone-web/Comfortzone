const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../public/app.js"), "utf8");
const start = source.indexOf('document.querySelectorAll("[data-sales-view]").forEach(button => {');
const end = source.indexOf('$("#inventoryRoot").addEventListener', start);
const navigation = source.slice(start, end);

function clickQuotation(justCreated) {
  let click;
  const screens = [];
  const button = { dataset: { salesView: "quotation" }, addEventListener: (_, handler) => { click = handler; } };
  const context = {
    document: { querySelectorAll: () => [button] },
    canAccessModule: () => true,
    collapsedSidebarGroups: new Set(),
    salesQuotationJustCreated: justCreated,
    salesQuotationMode: "create",
    salesQuotationDraft: { customer: "Customer" },
    showSalesDesk: screen => screens.push(screen)
  };
  vm.createContext(context);
  vm.runInContext(navigation, context);
  click();
  return { context, screens };
}

test("Quotation navigation returns to list after creating a quotation", () => {
  const { context, screens } = clickQuotation(true);
  assert.equal(context.salesQuotationMode, "list");
  assert.equal(context.salesQuotationDraft, null);
  assert.equal(context.salesQuotationJustCreated, false);
  assert.deepEqual(screens, ["quotation"]);
});

test("Quotation navigation does not discard an unsaved draft", () => {
  const { context } = clickQuotation(false);
  assert.equal(context.salesQuotationMode, "create");
  assert.equal(context.salesQuotationDraft.customer, "Customer");
});
