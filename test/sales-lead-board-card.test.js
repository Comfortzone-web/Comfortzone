const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../public/app.js"), "utf8");
const start = source.indexOf("function salesLeadBoardCard(");
const end = source.indexOf("function salesLeadSplitDetailHtml(", start);
assert.ok(start >= 0 && end > start);

test("Board cards omit the action menu and status badge but keep the view link", () => {
  const context = {
    escapeHtml: value => String(value || ""),
    salesProductBadge: value => `<span class="product-badge">${value}</span>`,
    rowMenu: () => { throw new Error("Board action menu should not render"); },
    salesBadge: () => { throw new Error("Board status badge should not render"); }
  };
  vm.createContext(context);
  vm.runInContext(source.slice(start, end), context);
  const html = context.salesLeadBoardCard({
    id: "lead-1", enquiryNo: "EN26-1007", customer: "Ahmed", projectDescription: "VRV supply",
    productType: "VRV", status: "Quote Sent", estimatedValue: 5000
  });
  assert.match(html, /data-sales-action="view-lead"/);
  assert.match(html, /EN26-1007/);
  assert.match(html, /lead-board-card-head[\s\S]*EN26-1007[\s\S]*product-badge/);
  assert.match(html, /5,000 AED/);
  assert.match(html, /calendar-days\.svg|user-round\.svg/);
  assert.doesNotMatch(html, /row-menu|Quote Sent/);
  assert.doesNotMatch(html, /lead-board-tags|contactNumber/);
});

test("Board cards reserve the amount row without showing a placeholder", () => {
  const context = {
    escapeHtml: value => String(value || ""),
    salesProductBadge: value => `<span class="product-badge">${value}</span>`
  };
  vm.createContext(context);
  vm.runInContext(source.slice(start, end), context);
  const html = context.salesLeadBoardCard({
    id: "lead-2", enquiryNo: "EN26-1008", customer: "Long Customer", productType: "CHW",
    receivedDate: "19/11/2026", salesPerson: "Yoonus", estimatedValue: 0
  });
  assert.match(html, /class="lead-board-meta-row lead-board-amount"><\/span>/);
  assert.match(html, /19\/11\/2026/);
  assert.match(html, /Yoonus/);
  assert.doesNotMatch(html, /0 AED|class="lead-board-amount">-/);
});
