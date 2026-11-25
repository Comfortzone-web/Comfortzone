const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "public", "ool-ui.js"), "utf8");
const styles = fs.readFileSync(path.join(__dirname, "..", "public", "ool.css"), "utf8");
const start = source.indexOf("function listTableHTML(");
const end = source.indexOf("function render(){", start);
assert.ok(start >= 0 && end > start);

test("OOL List keeps long project, model and PO values in allocated columns", () => {
  const context = {
    page: 1,
    selected: new Set(),
    esc: value => String(value ?? ""),
    money: value => (value / 100).toFixed(2),
    oolLineStatusHtml: line => `<span>${line.status}</span>`,
    badge: value => `<span>${value}</span>`
  };
  vm.createContext(context);
  vm.runInContext(source.slice(start, end), context);
  const project = "A very long project name that should never overlap the model column";
  const model = "A-VERY-LONG-MODEL-NUMBER-123456789";
  const html = context.listTableHTML([{
    id: "line-1", available: 1, sor: "SOR-1", sd: "SD-1", poNo: "PO-12345678901234567890", poId: "po-1",
    opening: true, project, model, orderQty: 1, confirmedQty: 1, requested: 1, deliveryConfirmed: 0, received: 0,
    priceCents: 12000, amountCents: 12000, status: "Order Confirmed"
  }]);

  const widths = [...html.matchAll(/<col style="width:(\d+)%">/g)].map(match => Number(match[1]));
  assert.equal(widths.length, 12);
  assert.equal(widths.reduce((sum, width) => sum + width, 0), 100);
  assert.ok(widths[3] > widths[11]);
  assert.ok(widths[4] > widths[11]);
  assert.equal(widths[4], 16);
  assert.ok(widths[7] > widths[5]);
  assert.ok(widths[8] > widths[5]);
  assert.match(html, /Order<br>Qty/);
  assert.match(html, /Rq<br>Qty/);
  assert.match(html, /Delivered<br>Qty/);
  assert.match(html, /Available<br>Qty/);
  assert.match(html, /<td title="Requested quantities awaiting confirmation or receipt">1<\/td><td>0<\/td><td><b class="ool-qty\s*">1<\/b><\/td>/);
  assert.doesNotMatch(html, /requested ·|confirmed<\/small>/);
  assert.match(html, /class="ool-project-input"[^>]*title="A very long project name/);
  assert.doesNotMatch(html, /ool-pencil|data-project="/);
  assert.match(html, /class="ool-model-name" title="A-VERY-LONG-MODEL/);
  assert.match(html, /class="ool-po-number"[^>]*>.*PO-12345678901234567890/);
  assert.doesNotMatch(html, /Opening balance/);
  assert.match(styles, /\.ool-list-table input\.ool-project-input\{[^}]*text-overflow:ellipsis;white-space:nowrap/);
  assert.match(styles, /\.ool-list-table \.ool-model-name\{[^}]*text-overflow:ellipsis;white-space:nowrap/);
});
