const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "public", "app.js"), "utf8");
const styles = fs.readFileSync(path.join(__dirname, "..", "public", "styles.css"), "utf8");
const start = source.indexOf("function orderBookCustomerField(");
const end = source.indexOf("function orderBookSalesPersonField(", start);

test("Order Book Customer uses an anchored searchable list", () => {
  assert.ok(start >= 0 && end > start);
  const context = { escapeHtml: value => String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;") };
  vm.createContext(context);
  vm.runInContext(source.slice(start, end), context);
  const html = context.orderBookCustomerField('A & S "Trading"');
  assert.match(html, /data-order-book-field="customer"/);
  assert.match(html, /value="A &amp; S &quot;Trading&quot;"/);
  assert.match(html, /role="combobox"[^>]*aria-controls="orderBookCustomerOptions"/);
  assert.match(html, /data-order-book-customer-options role="listbox" hidden/);
  assert.doesNotMatch(html, /<datalist|\slist=/);
  assert.match(styles, /\.order-book-customer-options \{[^}]*max-height: 220px; overflow-y: auto/);
  assert.match(source, /setupOrderBookCustomerPicker\(modal\);/);
  assert.match(source, /customer\.addEventListener\("input", \(\) => \{ input\.value = ""; render\(\); \}\)/);
});
