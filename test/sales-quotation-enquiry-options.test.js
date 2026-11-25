const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../public/app.js"), "utf8");
const start = source.indexOf("function salesQuoteEnquiryNumbers(");
const end = source.indexOf("function salesCreateQuotationHtml()", start);
assert.ok(start >= 0 && end > start);

test("quotation enquiry suggestions follow the selected customer without changing typed text", () => {
  const list = { innerHTML: "", hidden: true };
  const typed = { value: "", attributes: {}, setAttribute(name, value) { this.attributes[name] = value; } };
  const leads = [
    { customer: "Acme LLC", enquiryNo: "EN-101", quoteNo: "" },
    { customer: "Other LLC", enquiryNo: "EN-202", quoteNo: "" },
    { customer: "acme llc", enquiryNo: "EN-103", quoteNo: "Q-OLD" },
    { customer: "Acme LLC", enquiryNo: "EN-104", quoteNo: "" }
  ];
  const quotations = [
    { id: "quote-old", no: "Q-OLD", warranty: "EN-103" },
    { id: "quote-used", no: "Q-USED", warranty: "EN-104" }
  ];
  const context = {
    salesData: () => ({ leads, quotations }),
    salesQuotationDraft: { id: "", quotationNo: "Q-NEW", customer: "Acme LLC" },
    norm: value => String(value || "").toUpperCase().replace(/[\s_\-]/g, ""),
    uniqueValues: values => [...new Set(values)],
    escapeHtml: value => String(value || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;"),
    document: {
      activeElement: typed,
      querySelector: selector => selector === "[data-sales-quote-enquiry-options]" ? list : typed
    }
  };
  vm.createContext(context);
  vm.runInContext(source.slice(start, end), context);
  context.renderSalesQuoteEnquiryOptions();
  assert.equal(list.hidden, false);
  assert.match(list.innerHTML, /EN-101/);
  assert.doesNotMatch(list.innerHTML, /EN-103|EN-104/);
  assert.doesNotMatch(list.innerHTML, /EN-202/);
  context.salesQuotationDraft.customer = "Other LLC";
  context.renderSalesQuoteEnquiryOptions();
  assert.match(list.innerHTML, /EN-202/);
  context.salesQuotationDraft.customer = "Acme LLC";
  context.salesQuotationDraft.id = "quote-old";
  context.salesQuotationDraft.quotationNo = "Q-OLD";
  context.renderSalesQuoteEnquiryOptions();
  assert.match(list.innerHTML, /EN-103/);
  typed.value = "MANUAL-123";
  context.renderSalesQuoteEnquiryOptions();
  assert.equal(typed.value, "MANUAL-123");
  assert.match(list.innerHTML, /No available enquiries/);
});
