"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
const helper = source.match(/function salesQuotationPdfFilename\(quote\) \{[\s\S]*?\n\}/)?.[0];
assert.ok(helper);
const filename = vm.runInNewContext(`${helper}\nsalesQuotationPdfFilename`, {
  safeName: value => String(value).replace(/[^a-zA-Z0-9 ._-]/g, "").trim()
});

test("both quotation PDF variants use quotation number and customer name only", () => {
  assert.equal(filename({ no: "QCZ-26-1007", customer: "Ahmed" }), "QCZ-26-1007-Ahmed.pdf");
  assert.match(source, /const filename = salesQuotationPdfFilename\(quote\);/);
  assert.doesNotMatch(source, /salesQuotationPdfFilename\(quote\)\.replace\(/);
});
