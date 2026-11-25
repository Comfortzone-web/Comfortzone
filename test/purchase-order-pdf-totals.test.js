"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const PDFDocument = require("pdfkit");

const root = path.join(__dirname, "..");
const source = fs.readFileSync(path.join(root, "server.js"), "utf8");
const start = source.indexOf("function createPdfKitBuffer(");
const end = source.indexOf("function purchaseOrderPdfFilename(", start);
assert.ok(start >= 0 && end > start);

let texts = [];
let cells = [];
class RecordingPdf extends PDFDocument {
  text(value, x, y, options) {
    texts.push({ value: String(value), x, y, options, fontSize: this._fontSize,
      width: this.widthOfString(String(value)) });
    return super.text(value, x, y, options);
  }

  rect(x, y, width, height) {
    this.lastRect = { x, y, width, height };
    return super.rect(x, y, width, height);
  }

  fillAndStroke(fill, stroke) {
    cells.push({ ...this.lastRect, fill, stroke });
    return super.fillAndStroke(fill, stroke);
  }
}

const render = vm.runInNewContext(
  `${source.slice(start, end)}\npurchaseOrderPdfBuffer`,
  {
    PDFDocument: RecordingPdf,
    fs,
    path,
    PUBLIC: path.join(root, "public"),
    Buffer,
    DEFAULT_PURCHASE_NOTES: "Thank you for your order.",
    formatPdfDate: () => "25 Nov 2026",
    money: value => Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }
);

async function sample(name, subtotal) {
  texts = [];
  cells = [];
  const buffer = await render({
    poNo: "PO-1001",
    poDate: "2026-11-25",
    supplierName: "Supplier LLC",
    items: [{ description: "Daikin HVAC Unit", qty: 1, unitPrice: subtotal }],
    subtotal,
    vatTotal: subtotal * 0.05,
    grandTotal: subtotal * 1.05
  });
  const outputDir = process.env.PURCHASE_ORDER_PDF_QA_OUTPUT_DIR;
  if (outputDir) {
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(path.join(outputDir, `purchase-order-totals-${name}.pdf`), buffer);
  }
  return { buffer, texts, cells };
}

test("purchase order PDF totals stay centered and amounts fit one line", async () => {
  for (const [name, subtotal] of [["reference", 110000], ["large", 100000000]]) {
    const { buffer, texts, cells } = await sample(name, subtotal);
    assert.equal(buffer.subarray(0, 4).toString(), "%PDF");
    const summaryCells = cells.filter(cell => cell.width === 242 && cell.height === 34);
    assert.deepEqual(summaryCells.map(cell => cell.fill), ["#ffffff", "#ffffff", "#006341"]);
    const labels = ["Subtotal", "VAT Total", "Grand Total"];
    const values = [subtotal, subtotal * 0.05, subtotal * 1.05]
      .map(value => `${Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} AED`);
    labels.forEach((label, index) => {
      const labelCall = texts.find(call => call.value === label);
      const amountCall = texts.find(call => call.value === values[index]);
      assert.ok(labelCall && amountCall);
      assert.ok(Math.abs((labelCall.y + labelCall.fontSize / 2) - (amountCall.y + amountCall.fontSize / 2)) < 0.5);
      assert.ok(amountCall.width <= amountCall.options.width + 0.01);
      assert.equal(amountCall.options.align, "right");
    });
  }
});
