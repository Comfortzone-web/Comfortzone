const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "public", "app.js"), "utf8");
const functionSource = source.match(/function costingQuotationWithSheet\(quote, sheet, lines\) \{[\s\S]*?\n\}\n\nasync function createQuotationFromCosting/);
assert.ok(functionSource, "costing quotation sync helper exists");
const costingQuotationWithSheet = vm.runInNewContext(
  `(${functionSource[0].replace(/\n\nasync function createQuotationFromCosting$/, "")})`
);

test("modifying a quotation preserves its identity and settings but replaces costing values", () => {
  const quote = {
    id: "quote-1", no: "QCZ-26-1005", status: "Sent", sourceCostingSheetId: "sheet-1",
    paymentTerms: "30 Days Credit", discount: 50, customer: "Old customer", project: "Old project",
    items: [{ description: "Old item", qty: 1, unitPrice: 10 }], manualSubtotal: "10",
    combineRefnets: true, refnetOriginalItems: [{ description: "Old item" }]
  };
  const sheet = { customer: "New customer", project: "New project", enquiryNo: "ENQ-26-103" };
  const lines = [{ description: "AC-1", qty: 2, unit: "Nos", unitPrice: 150 }];
  const result = costingQuotationWithSheet(quote, sheet, lines);

  assert.equal(result.id, quote.id);
  assert.equal(result.no, quote.no);
  assert.equal(result.requestedQuotationNo, quote.no);
  assert.equal(result.status, "Sent");
  assert.equal(result.sourceCostingSheetId, "sheet-1");
  assert.equal(result.paymentTerms, "30 Days Credit");
  assert.equal(result.discount, 50);
  assert.equal(result.customer, "New customer");
  assert.equal(result.project, "New project");
  assert.equal(result.enquiryNo, "ENQ-26-103");
  assert.equal(result.warranty, "ENQ-26-103");
  assert.deepEqual(Array.from(result.items), lines);
  assert.equal(result.manualSubtotal, "");
  assert.equal(result.combineRefnets, false);
  assert.deepEqual(Array.from(result.refnetOriginalItems), []);
});
