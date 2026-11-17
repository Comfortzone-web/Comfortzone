const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../public/app.js"), "utf8");
const start = source.indexOf("function orderBookSalesPersonField(item)");
const end = source.indexOf("function collectOrderBookPayload(", start);
const users = [
  { id: "admin", name: "Admin User", role: "Admin", active: true },
  { id: "alice", name: "Alice", role: "Staff", active: true },
  { id: "maintenance", name: "Maintenance User", role: "MTS", active: true },
  { id: "inactive", name: "Inactive Staff", role: "Staff", active: false }
];

function fieldContext(staff = false) {
  const context = {
    appSettings: { users: staff ? [] : users },
    currentUser: staff ? users[1] : users[0],
    salesData: () => ({ settings: { orderBookSalesPeople: users } }),
    norm: value => String(value || "").toUpperCase().replace(/\s+/g, ""),
    escapeHtml: value => String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;")
  };
  vm.createContext(context);
  vm.runInContext(source.slice(start, end), context);
  return context;
}

test("Order Book dropdown contains only active Admin and Staff login names", () => {
  for (const staff of [false, true]) {
    const context = fieldContext(staff);
    const html = context.orderBookSalesPersonField({ id: "", salesPersonId: context.currentUser.id });
    assert.match(html, /<select data-order-book-field="salesPersonId"/);
    assert.match(html, /Admin User/);
    assert.match(html, /Alice/);
    assert.doesNotMatch(html, /Maintenance User|Inactive Staff|Others/);
  }
});
