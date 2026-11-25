const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "public", "app.js"), "utf8");
const styles = fs.readFileSync(path.join(__dirname, "..", "public", "styles.css"), "utf8");
const start = source.indexOf("function salesLeadField(");
const end = source.indexOf("function collectSalesLeadPayload(", start);

test("New Enquiry Customer uses an anchored searchable list", () => {
  assert.ok(start >= 0 && end > start);
  const context = { escapeHtml: value => String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;") };
  vm.createContext(context);
  vm.runInContext(source.slice(start, end), context);
  const html = context.salesLeadField("customer", "Customer", 'A & S "Trading"', "customerPicker", { required: true });
  assert.match(html, /data-sales-lead-field="customer"/);
  assert.match(html, /value="A &amp; S &quot;Trading&quot;"/);
  assert.match(html, /role="combobox"[^>]*aria-controls="salesLeadCustomerOptions"/);
  assert.match(html, /data-sales-lead-customer-options role="listbox" hidden/);
  assert.doesNotMatch(html, /<datalist|\slist=/);
  assert.match(styles, /\.sales-lead-customer-options\{[^}]*max-height:220px;overflow-y:auto/);
  assert.match(styles, /\.sales-lead-customer-field\{[^}]*align-self:start/);
  assert.match(styles, /\.sales-lead-customer-options button\{[^}]*overflow-wrap:anywhere/);
  assert.match(source, /setupSalesLeadCustomerPicker\(modal,/);
  assert.match(source, /input\.addEventListener\("keydown", event => \{/);
});

test("Edit Enquiry Quote No. uses an anchored scrollable list", () => {
  const context = { escapeHtml: value => String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;") };
  vm.createContext(context);
  vm.runInContext(source.slice(start, end), context);
  const html = context.salesLeadField("quoteNo", "Quote No", "QCZ-26-1007", "quotePicker");
  assert.match(html, /data-sales-lead-field="quoteNo"/);
  assert.match(html, /value="QCZ-26-1007"/);
  assert.match(html, /role="combobox"[^>]*aria-controls="salesLeadQuoteOptions"/);
  assert.match(html, /data-sales-lead-quote-options role="listbox" hidden/);
  assert.doesNotMatch(html, /<datalist|\slist=/);
  assert.match(styles, /\.sales-lead-customer-options\{[^}]*max-height:220px;overflow-y:auto/);
  assert.match(styles, /\.sales-lead-drawer \.sales-lead-form-section:nth-child\(4\)\{position:relative;z-index:2\}/);
  assert.match(source, /setupSalesLeadQuotePicker\(modal, item\.id\)/);
});

test("Enquiry Prepared By uses the Quotation login-name picker pattern", () => {
  const context = {
    escapeHtml: value => String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;"),
    norm: value => String(value || "").toUpperCase().replace(/[\s_\-]/g, ""),
    salesQuotePersonUsers: () => [{ id: "admin", name: "Admin User" }],
    isStaffUser: () => false
  };
  vm.createContext(context);
  vm.runInContext(source.slice(start, end), context);
  const html = context.salesLeadField("preparedBy", "Selection & Quote Prepared By", "Admin User", "preparedByPicker");
  assert.match(html, /data-sales-lead-field="preparedBy" class="is-linked"/);
  assert.match(html, /data-sales-lead-prepared-options role="listbox" hidden/);
  assert.match(source, /setupSalesLeadPreparedByPicker\(modal\)/);
  assert.match(source, /if \(!input\.value\.trim\(\)\) clearSalesLeadQuoteFields\(modal\)/);
});
