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

test("Order Book fills the newest missing block starting at CZ26-0122", () => {
  const orders = Array.from({ length: 121 }, (_, index) => index + 1)
    .filter(number => number !== 6)
    .concat([134, 135])
    .map(number => ({ orderNo: `CZ26-${String(number).padStart(4, "0")}` }));
  assert.equal(context.nextAvailableOrderBookNo(orders, 2026), "CZ26-0122");
  for (let number = 122; number <= 133; number += 1) {
    orders.push({ orderNo: `CZ26-${String(number).padStart(4, "0")}` });
    assert.equal(context.nextAvailableOrderBookNo(orders, 2026), number < 133
      ? `CZ26-${String(number + 1).padStart(4, "0")}` : "CZ26-0006");
  }
  orders.push({ orderNo: "CZ26-0006" });
  assert.equal(context.nextAvailableOrderBookNo(orders, 2026), "CZ26-0136");
});
