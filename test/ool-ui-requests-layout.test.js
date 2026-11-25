const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "public", "ool-ui.js"), "utf8");
const styles = fs.readFileSync(path.join(__dirname, "..", "public", "ool.css"), "utf8");
const start = source.indexOf("function requestsHTML(");
const end = source.indexOf("function bindSelectAll(", start);

test("Delivery Requests keeps long references within fixed columns", () => {
  assert.ok(start >= 0 && end > start);
  const context = {
    state: { requests: [{
      id: "request-1", date: "2026-11-20", lines: [
        { sor: "SOR-VERY-LONG-REFERENCE-123456789", sd: "SD-100", project: "A long project name that must stay inside its cell", poNo: "PO-123456789", qty: 2 },
        { sor: "SOR-SECOND", sd: "SD-200", project: "Second project", poNo: "PO-987654321", qty: 1 }
      ]
    }], receipts: [] },
    filters: { status: "", project: "", poNo: "" },
    search: "",
    expanded: new Set(),
    activeRequestLines: request => request.lines.filter(line => line.qty - (line.cancelled || 0) > 0),
    requestDetails: () => [],
    deleteButton: () => '',
    money: value => (value / 100).toFixed(2),
    status: () => "Delivery Requested",
    esc: value => String(value ?? "").replaceAll("&", "&amp;").replaceAll('"', "&quot;"),
    sum: (items, key) => items.reduce((total, item) => total + Number(item[key] || 0), 0),
    badge: value => `<span class="ool-badge">${value}</span>`
  };
  vm.createContext(context);
  vm.runInContext(source.slice(start, end), context);
  const html = context.requestsHTML();
  const widths = [...html.matchAll(/<col style="width:(\d+)%">/g)].map(match => Number(match[1]));
  assert.equal(widths.reduce((total, width) => total + width, 0), 100);
  assert.equal(widths.length, 8);
  assert.match(html, /ool-table-wrap/);
  assert.match(html, /title="SOR-VERY-LONG-REFERENCE-123456789, SOR-SECOND"/);
  assert.match(html, /title="A long project name that must stay inside its cell, Second project"/);
  assert.match(html, /ool-request-count">\+1/);
  assert.match(styles, /\.ool-request-table \.ool-request-ref\{[^}]*text-overflow:ellipsis;white-space:nowrap/);
});
