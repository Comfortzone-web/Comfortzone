const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "public", "app.js"), "utf8");
const functionSource = source.match(/function buildCostingWorkbookBlob\(sheet = \{\}\) \{[\s\S]*?\n\}\n\nfunction buildCostingPriceListWorkbookBlob/);
assert.ok(functionSource, "costing workbook builder exists");

const buildCostingWorkbookBlob = vm.runInNewContext(
  `(${functionSource[0].replace(/\n\nfunction buildCostingPriceListWorkbookBlob$/, "")})`,
  {
    costingNumber: value => Number(String(value ?? "").replace(/,/g, "")) || 0,
    costingTotals: rows => {
      const increasedFinalPrice = rows.reduce((sum, row) => sum + row.qty * row.increasedFinalPrice, 0);
      const selling = rows.reduce((sum, row) => sum + row.qty * row.sellingPrice, 0);
      const profit = selling - increasedFinalPrice;
      const vat = selling * 0.05;
      return { increasedFinalPrice, selling, profit, vat, grand: selling + vat, margin: selling ? profit / selling * 100 : 0 };
    },
    workbookRowXml: (rowNumber, cells) => ({ rowNumber, cells }),
    costingWorkbookBlob: (rows, widths, title, lastRow) => ({ rows, widths, title, lastRow })
  }
);
const priceListSource = source.match(/function buildCostingPriceListWorkbookBlob\(items = \[\]\) \{[\s\S]*?\n\}\n\nfunction costingWorkbookBlob/);
assert.ok(priceListSource, "price list workbook builder exists");
const buildCostingPriceListWorkbookBlob = vm.runInNewContext(
  `(${priceListSource[0].replace(/\n\nfunction costingWorkbookBlob$/, "")})`,
  {
    costingNumber: value => Number(String(value ?? "").replace(/,/g, "")) || 0,
    workbookRowXml: (rowNumber, cells) => ({ rowNumber, cells }),
    costingWorkbookBlob: (rows, widths, title, lastRow) => ({ rows, widths, title, lastRow })
  }
);
const sheetsSource = source.match(/function buildCostingSheetsWorkbookBlob\(sheets = \[\]\) \{[\s\S]*?\n\}\n\nfunction exportCostingPrices/);
assert.ok(sheetsSource, "all costing sheets workbook builder exists");
const buildCostingSheetsWorkbookBlob = vm.runInNewContext(
  `(${sheetsSource[0].replace(/\n\nfunction exportCostingPrices$/, "")})`,
  {
    costingTotals: rows => {
      const increasedFinalPrice = rows.reduce((sum, row) => sum + row.qty * row.increasedFinalPrice, 0);
      const selling = rows.reduce((sum, row) => sum + row.qty * row.sellingPrice, 0);
      const profit = selling - increasedFinalPrice;
      const vat = selling * 0.05;
      return { increasedFinalPrice, selling, profit, vat, grand: selling + vat, margin: selling ? profit / selling * 100 : 0 };
    },
    workbookRowXml: (rowNumber, cells) => ({ rowNumber, cells }),
    costingWorkbookBlob: (rows, widths, title, lastRow) => ({ rows, widths, title, lastRow })
  }
);

function cell(row, column) {
  return row.cells.find(entry => entry.column === column);
}

test("costing Excel columns and formulas match the current table", () => {
  const workbook = buildCostingWorkbookBlob({ title: "Test Costing", rows: [
    { model: "LISTED", qty: 2, increasedFinalPrice: 100, sellingPrice: 125 },
    { model: "CUSTOM", qty: 3, increasedFinalPrice: 20, sellingPrice: 25 }
  ] });
  assert.deepEqual(Array.from(workbook.rows[0].cells, entry => entry.value), [
    "S.No", "Model", "Qty", "Final Unit Price (AED)", "Selling Price (AED)", "Amount (AED)", "Margin %"
  ]);
  assert.equal(workbook.widths.length, 7);
  assert.equal(workbook.lastRow, 9);
  assert.equal(cell(workbook.rows[1], 4).value, 100);
  assert.equal(cell(workbook.rows[1], 4).style, 9);
  assert.equal(cell(workbook.rows[1], 6).formula, "C2*E2");
  assert.equal(cell(workbook.rows[1], 7).formula, "IFERROR((E2-D2)/E2,0)");
  assert.equal(cell(workbook.rows[1], 7).style, 10);
  assert.equal(cell(workbook.rows[2], 6).formula, "C3*E3");
  assert.equal(cell(workbook.rows[3], 6).formula, "SUMPRODUCT(C2:C3,D2:D3)");
  assert.equal(cell(workbook.rows[3], 6).value, 260);
  assert.equal(cell(workbook.rows[4], 6).formula, "IFERROR((F7-F4)/F7,0)");
  assert.equal(cell(workbook.rows[5], 6).formula, "F7-F4");
  assert.equal(cell(workbook.rows[6], 6).formula, "SUM(F2:F3)");
  assert.equal(cell(workbook.rows[7], 6).formula, "F7*0.05");
  assert.equal(cell(workbook.rows[8], 6).formula, "F7+F8");
  assert.equal(cell(workbook.rows[8], 6).value, 341.25);
  assert.equal(cell(workbook.rows[8], 6).style, 12);
});

test("empty costing export does not sum its own summary cells", () => {
  const workbook = buildCostingWorkbookBlob({ rows: [] });
  assert.equal(cell(workbook.rows[1], 6).formula, "0");
  assert.equal(cell(workbook.rows[4], 6).formula, "0");
  assert.equal(workbook.lastRow, 7);
});

test("Price List Excel exports the stored Final Unit Price and Remarks", () => {
  const workbook = buildCostingPriceListWorkbookBlob([{
    model: "AC-1", listPrice: 100, multiplier: 1, costPrice: 100, finalPrice: 120,
    updatedAt: "2026-11-02T00:00:00Z", remarks: "Updated supplier quote"
  }]);
  assert.equal(workbook.widths.length, 9);
  assert.equal(workbook.rows[0].cells[7].value, "Final Unit Price (AED)");
  assert.equal(workbook.rows[0].cells[8].value, "Remarks");
  assert.equal(workbook.rows[0].cells.some(entry => entry.value === "Unit Price (AED)"), false);
  assert.equal(cell(workbook.rows[1], 8).value, 120);
  assert.equal(cell(workbook.rows[1], 8).formula, undefined);
  assert.equal(cell(workbook.rows[1], 9).value, "Updated supplier quote");
});

test("All Costing Sheets Excel exports saved sheet details and totals", () => {
  const workbook = buildCostingSheetsWorkbookBlob([{
    project: "Villa A", customer: "Customer A", enquiryNo: "ENQ-1", salesPerson: "Amal",
    createdAt: "2026-11-03T00:00:00Z",
    rows: [{ qty: 2, increasedFinalPrice: 100, sellingPrice: 125 }]
  }]);
  assert.equal(workbook.title, "All Costing Sheets");
  assert.equal(workbook.widths.length, 11);
  assert.equal(cell(workbook.rows[1], 2).value, "Villa A");
  assert.equal(cell(workbook.rows[1], 4).value, "ENQ-1");
  assert.equal(cell(workbook.rows[1], 5).value, "Amal");
  assert.equal(cell(workbook.rows[1], 6).value, 200);
  assert.equal(cell(workbook.rows[1], 7).value, 50);
  assert.equal(cell(workbook.rows[1], 8).value, 0.2);
  assert.equal(cell(workbook.rows[1], 11).value, 262.5);
});
