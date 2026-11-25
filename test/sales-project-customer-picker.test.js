const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "../public/app.js"), "utf8");
const styles = fs.readFileSync(path.join(__dirname, "../public/styles.css"), "utf8");

test("project drawer uses an anchored, searchable customer listbox", () => {
  const start = source.indexOf("function openSalesProjectDrawer(");
  const end = source.indexOf("function salesProject", start + 1);
  const drawer = source.slice(start, end > start ? end : undefined);
  assert.match(drawer, /data-project-drawer-field="customer"[^>]*role="combobox"/);
  assert.match(drawer, /data-project-customer-options role="listbox" hidden/);
  assert.match(drawer, /setupSalesProjectCustomerPicker\(modal\)/);
  assert.doesNotMatch(drawer, /salesProjectCustomerList/);
  assert.match(source, /data-project-customer-option/);
  assert.match(styles, /\.sales-project-customer-options \{[^}]*max-height: 220px; overflow-y: auto/);
  assert.match(styles, /\.sales-project-drawer \.sales-project-form-section:first-child \{ position: relative; z-index: 2;/);
});
