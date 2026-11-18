const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "public", "app.js"), "utf8");
const start = source.indexOf("function salesProjectDeliveryHistoryHtml(");
const end = source.indexOf("function salesProjectBoqRows(", start);
assert.ok(start >= 0 && end > start);
const context = { escapeHtml: value => String(value), formatSalesDateInput: value => value };
vm.createContext(context);
vm.runInContext(source.slice(start, end), context);

test("direct delivery uploads follow regular notes in project history", () => {
  const html = context.salesProjectDeliveryHistoryHtml(
    [{ date: "01/11/2026", dnNo: "DN-1", lines: [{ modelNo: "MODEL-A", qtyGoingOut: 2 }] }],
    [{ date: "02/11/2026", deliveryNoteNo: "DIRECT-1", lines: [{ modelNo: "MODEL-B", quantity: 3 }] }]
  );
  assert.ok(html.indexOf("DN-1") < html.indexOf("DIRECT-1"));
  assert.match(html, /MODEL-B/);
  assert.match(html, />3<\/td>/);
});
