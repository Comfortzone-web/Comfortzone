const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../public/app.js"), "utf8");
const start = source.indexOf("function salesQuotePersonUsers()");
const end = source.indexOf("function salesCreateQuotationHtml()", start);
const fieldSource = source.slice(start, end);

function fieldContext(role) {
  const currentUser = role === "Admin"
    ? { id: "admin", name: "Admin User", role }
    : { id: "staff", name: "Staff User", role };
  const context = {
    currentUser,
    document: { querySelector: () => null },
    appSettings: { users: role === "Admin" ? [currentUser, { id: "alice", name: "Alice", role: "Staff" }] : [] },
    salesQuotationDraft: { ownerId: currentUser.id, salesperson: currentUser.name },
    norm: value => String(value || "").trim().toUpperCase(),
    escapeHtml: value => String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;"),
    isCurrentAdmin: () => role === "Admin",
    isStaffUser: () => role === "Staff"
  };
  vm.createContext(context);
  vm.runInContext(fieldSource, context);
  return context;
}

test("admin quotation shows a linked login name in a searchable text field", () => {
  const context = fieldContext("Admin");
  assert.match(context.salesQuotePersonFieldHtml(), /Admin User/);
  assert.match(context.salesQuotePersonFieldHtml(), /data-sales-quote-person-input class="is-linked"/);
  assert.match(context.salesQuotePersonFieldHtml(), /data-sales-quote-person-options/);
  context.salesQuotationDraft.ownerId = "alice";
  context.salesQuotationDraft.salesperson = "Stale Name";
  assert.equal(context.salesQuotePersonName(), "Alice");
  assert.equal(context.salesQuotationDraft.salesperson, "Alice");
  context.salesQuotationDraft.ownerId = "";
  context.salesQuotationDraft.salesperson = "External Agent";
  assert.match(context.salesQuotePersonFieldHtml(), /class="" value="External Agent"/);
});

test("staff quotation shows their own read-only login name", () => {
  const context = fieldContext("Staff");
  const html = context.salesQuotePersonFieldHtml();
  assert.match(html, /Staff User/);
  assert.match(html, /readonly/);
  assert.doesNotMatch(html, /data-sales-quote-person-options/);
});

test("Backspace and Delete clear a linked name while custom text stays regular", () => {
  const context = fieldContext("Admin");
  const classes = new Set(["is-linked"]);
  const input = {
    value: "Admin User",
    matches: selector => selector === "[data-sales-quote-person-input]",
    classList: {
      add: name => classes.add(name),
      remove: name => classes.delete(name),
      toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name)
    }
  };
  for (const key of ["Backspace", "Delete"]) {
    let prevented = false;
    context.handleSalesQuotePersonKeydown({ target: input, key, preventDefault: () => { prevented = true; } });
    assert.equal(prevented, true);
    assert.equal(input.value, "");
    assert.equal(context.salesQuotationDraft.ownerId, "");
    assert.equal(classes.has("is-linked"), false);
    input.value = "Alice";
    context.updateSalesQuotePersonInput(input);
  }
  assert.equal(context.salesQuotationDraft.ownerId, "alice");
  input.value = "External Agent";
  context.updateSalesQuotePersonInput(input);
  assert.equal(context.salesQuotationDraft.ownerId, "");
  assert.equal(context.salesQuotationDraft.salesperson, "External Agent");
  assert.equal(classes.has("is-linked"), false);
});
