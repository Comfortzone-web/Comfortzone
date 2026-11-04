"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const PDFDocument = require("pdfkit");
const { renderSalesQuotationPdf } = require("../sales-quotation-pdf");

const root = path.join(__dirname, "..");
const assets = {
  PDFDocument,
  headerPath: path.join(root, "public/assets/quotation-header.jpg"),
  footerPath: path.join(root, "public/assets/quotation-footer.jpg"),
  fontPath: path.join(root, "public/assets/fonts/Inter-Regular.ttf")
};

const baseQuote = {
  no: "QCZ-26-1005",
  date: "2026-11-03",
  customer: "Aerotive Building Contracting LLC",
  salesperson: "Admin User",
  validity: "7 Days",
  paymentTerms: "30 Days Credit",
  deliveryTime: "To be discussed",
  warranty: "ENQ-26-103",
  notes: "All Units are Reserved.",
  items: [{ description: "RXYMQ4AVMK - VRV OUTDOOR UNIT - MINI - INDIA", qty: 1, unit: "Nos", unitPrice: 9262 }]
};

function pageCount(buffer) {
  return (buffer.toString("latin1").match(/\/Type \/Page\b/g) || []).length;
}

function saveSample(name, buffer) {
  const directory = process.env.QUOTATION_PDF_QA_OUTPUT_DIR;
  if (!directory) return;
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, `quotation-redesign-${name}.pdf`), buffer);
}

test("quotation PDF keeps a short quote on one A4 page", async () => {
  const buffer = await renderSalesQuotationPdf({
    quote: { ...baseQuote, terms: "Warranty:\nUnits are covered for 12 months." },
    preparedBy: { name: "Admin User", position: "Sales Engineer", contact: "0501234567", email: "admin@example.com" }
  }, assets);
  assert.equal(buffer.subarray(0, 4).toString(), "%PDF");
  assert.equal(pageCount(buffer), 1);
  assert.ok(buffer.length > 100000);
  saveSample("short", buffer);
});

test("quotation PDF offers distinct bulk and breakup layouts", async () => {
  const bulk = await renderSalesQuotationPdf({ quote: baseQuote, variant: "bulk" }, assets);
  const breakup = await renderSalesQuotationPdf({ quote: baseQuote, variant: "breakup" }, assets);
  assert.equal(pageCount(bulk), 1);
  assert.equal(pageCount(breakup), 1);
  assert.notDeepEqual(bulk, breakup);
  saveSample("bulk", bulk);
  saveSample("breakup", breakup);
});

test("quotation PDF paginates many items and long descriptions", async () => {
  const items = Array.from({ length: 55 }, (_, index) => ({
    description: `Model ${index + 1} - VRV outdoor air conditioning system with extended description for project and delivery specifications`,
    qty: index + 1,
    unit: "Nos",
    unitPrice: 1234.56
  }));
  const buffer = await renderSalesQuotationPdf({ quote: { ...baseQuote, items }, preparedBy: { name: "Admin User" } }, assets);
  assert.ok(pageCount(buffer) >= 3);
  saveSample("many-items", buffer);
});

test("quotation PDF paginates lengthy terms without losing content", async () => {
  const terms = Array.from({ length: 25 }, (_, index) =>
    `Term ${index + 1}:\n${"All equipment shall be supplied in accordance with the agreed project specifications and applicable conditions. ".repeat(4)}`
  ).join("\n\n");
  const buffer = await renderSalesQuotationPdf({ quote: { ...baseQuote, terms }, preparedBy: { name: "Admin User" } }, assets);
  assert.ok(pageCount(buffer) >= 2);
  saveSample("long-terms", buffer);
});

test("quotation PDF accepts another authenticated preparer and missing profile fields", async () => {
  const first = await renderSalesQuotationPdf({ quote: baseQuote, preparedBy: { name: "Admin User" } }, assets);
  const second = await renderSalesQuotationPdf({
    quote: baseQuote,
    preparedBy: { name: "Another Staff User", position: "Sales Executive", contact: "0557654321", email: "staff@example.com" }
  }, assets);
  assert.equal(pageCount(first), 1);
  assert.equal(pageCount(second), 1);
  assert.notDeepEqual(first, second);
  saveSample("other-user", second);
});
