const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
const start = source.indexOf("function orderBookProjectNumberTaken(");
const end = source.indexOf("function createOrderBook(", start);
assert.ok(start >= 0 && end > start);
const context = { cleanCell: value => String(value ?? "").trim() };
vm.createContext(context);
vm.runInContext(source.slice(start, end), context);

test("Project No. belongs to only one Order Book record", () => {
  const orders = [{ id: "one", projectNo: "1008" }, { id: "two", projectNo: "" }];
  const taken = context.orderBookProjectNumberTaken;
  assert.equal(taken(orders, " 1008 ", "two"), true);
  assert.equal(taken(orders, "1008", "one"), false);
  assert.equal(taken(orders, "1009", "two"), false);
  assert.equal(taken(orders, "", "two"), false);
});
