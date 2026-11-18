const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../server.js"), "utf8");
const start = source.indexOf("function nextAvailableOrderBookNo(");
const end = source.indexOf("let orderBookCreateQueue", start);
const context = { cleanCell: value => String(value || "").trim() };
vm.createContext(context);
vm.runInContext(source.slice(start, end), context);

test("Order Book continues after the highest number without reusing old gaps", () => {
  const orders = Array.from({ length: 121 }, (_, index) => index + 1)
    .filter(number => number !== 6)
    .concat([134, 135])
    .map(number => ({ orderNo: `CZ26-${String(number).padStart(4, "0")}` }));
  assert.equal(context.nextAvailableOrderBookNo(orders, 2026), "CZ26-0136");
  orders.push({ orderNo: "CZ26-0136" });
  assert.equal(context.nextAvailableOrderBookNo(orders, 2026), "CZ26-0137");
  assert.equal(context.nextAvailableOrderBookNo(orders, 2027), "CZ27-0001");
});

test("New Order preview ignores a stale gap-filling hint", () => {
  const app = fs.readFileSync(path.join(__dirname, "../public/app.js"), "utf8");
  const from = app.indexOf("function nextOrderBookNo(");
  const to = app.indexOf("function showOrderBookSaveNotice(", from);
  const preview = { salesData: () => ({ orderBook: [{ orderNo: "CZ26-0136" }], nextOrderBookNo: "CZ26-0006" }), Date: class extends Date { getFullYear() { return 2026; } } };
  vm.createContext(preview);
  vm.runInContext(app.slice(from, to), preview);
  assert.equal(preview.nextOrderBookNo(), "CZ26-0137");
});
