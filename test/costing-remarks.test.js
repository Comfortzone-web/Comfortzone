const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
const parserSource = source.match(/function parseCostingPriceListUpload\(filePart\) \{[\s\S]*?\n\}\n\nfunction safeName/);
assert.ok(parserSource);
const parse = vm.runInNewContext(`(${parserSource[0].replace(/\n\nfunction safeName$/, "")})`, {
  csvTableRows: () => [
    ["Model", "Final Unit Price (AED)", "Remarks"],
    ["RXQ6ARYFK", "11469.16", "Ehtesam Individual Price List"],
    ["RXQ8ARYFK", "12487.24", ""]
  ],
  cleanCell: value => String(value || "").trim()
});

test("Price List import retains model-specific remarks", () => {
  const rows = parse({ filename: "prices.csv", mimeType: "text/csv", body: Buffer.from("") });
  assert.equal(rows[0].remarks, "Ehtesam Individual Price List");
  assert.equal(rows[1].remarks, "");
});
