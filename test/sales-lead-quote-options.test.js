const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../public/app.js"), "utf8");
const start = source.indexOf("function salesLeadAvailableQuotations(");
const end = source.indexOf("function fillSalesLeadQuotationDetails(", start);
assert.ok(start >= 0 && end > start);

test("enquiry Quote No. options include only unassigned quotes for the same customer", () => {
  const store = {
    leads: [
      { id: "lead-a", enquiryNo: "EN-A", customer: "Acme", quoteNo: "Q-USED" },
      { id: "lead-b", enquiryNo: "EN-B", customer: "Acme", quoteNo: "Q-OWN" }
    ],
    quotations: [
      { no: "Q-FREE", customer: "Acme" },
      { no: "Q-USED", customer: "Acme", warranty: "EN-A" },
      { no: "Q-OWN", customer: "Acme", warranty: "EN-B" },
      { no: "Q-OTHER", customer: "Other" }
    ]
  };
  const context = {
    salesData: () => store,
    norm: value => String(value || "").toUpperCase().replace(/[\s_\-]/g, ""),
    document: { querySelector: () => null },
    escapeHtml: value => String(value || "")
  };
  vm.createContext(context);
  vm.runInContext(source.slice(start, end), context);
  const numbers = (customer, id = "", no = "") => Array.from(context.salesLeadAvailableQuotations(customer, id, no), quote => quote.no);
  assert.deepEqual(numbers("Acme"), ["Q-FREE"]);
  assert.deepEqual(numbers("acme", "lead-b", "EN-B"), ["Q-FREE", "Q-OWN"]);
  assert.deepEqual(numbers("Other"), ["Q-OTHER"]);
  assert.deepEqual(numbers(""), []);
});
