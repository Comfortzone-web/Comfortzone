"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const PDFDocument = require("pdfkit");

const root = path.join(__dirname, "..");
const source = fs.readFileSync(path.join(root, "server.js"), "utf8");
const start = source.indexOf("function deliveryChallanNo(");
const end = source.indexOf("async function purchaseOrderPdfBuffer(", start);
assert.ok(start >= 0 && end > start);

let textCalls = [];
let imageCalls = [];
class RecordingPdf extends PDFDocument {
  text(value, x, y, options) {
    textCalls.push({ value: String(value), x, y, options });
    return super.text(value, x, y, options);
  }

  image(source, x, y, options) {
    imageCalls.push(path.basename(source));
    return super.image(source, x, y, options);
  }
}

const render = vm.runInNewContext(
  `${source.slice(start, end)}\ndeliveryNotePdfBuffer`,
  {
    PDFDocument: RecordingPdf,
    fs,
    path,
    PUBLIC: path.join(root, "public"),
    todayISO: () => "2026-11-25",
    money: value => Number(value).toFixed(2),
    Buffer
  }
);

async function sample(name, projectName, deliveryLocation, customerName = "Marco Electromechanical Contracting LLC") {
  textCalls = [];
  imageCalls = [];
  const buffer = await render({ deliveryNote: {
    dnNo: "DN-1913",
    date: "2026-11-25",
    customerName,
    projectName,
    deliveryLocation,
    lines: [{ modelNo: "FWW1200VANLEH-AOAE", description: "DAIKIN CHW FCU", qtyGoingOut: 2 }]
  } });
  const outputDir = process.env.DELIVERY_NOTE_PDF_QA_OUTPUT_DIR;
  if (outputDir) {
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(path.join(outputDir, `delivery-challan-${name}.pdf`), buffer);
  }
  return { buffer, calls: textCalls, images: imageCalls };
}

test("delivery challan aligns heading and detail columns, and expands for long values", async () => {
  const short = await sample("short", "Warehouse VRV Replacement", "Dubai Investment Park");
  const long = await sample("long",
    "Warehouse VRV Replacement and Mechanical Equipment Supply for the North and South Building Wings ".repeat(2),
    "Dubai Investment Park, Building 14, North Loading Bay, Ground Floor, Unit 25, Opposite the Main Service Entrance ".repeat(2));
  const tallCustomer = await sample("tall-customer", "Warehouse VRV Replacement", "Dubai Investment Park",
    "Marco Electromechanical Contracting and Construction Services LLC ".repeat(5));

  for (const { buffer, calls, images } of [short, long, tallCustomer]) {
    assert.equal(buffer.subarray(0, 4).toString(), "%PDF");
    assert.ok(images.includes("letterhead-full.jpg"));
    const pageCount = (buffer.toString("latin1").match(/\/Type \/Page\b/g) || []).length;
    assert.equal(images.filter(image => image === "quotation-footer.jpg").length, pageCount);
    assert.equal(calls.find(call => call.value === "DELIVERY CHALLAN").y, 136);
    assert.equal(calls.find(call => call.value === "Challan Date").x, 308);
    assert.deepEqual(calls.filter(call => call.value === ":").map(call => call.x), [414, 414, 414]);
    assert.equal(calls.find(call => call.value.startsWith("Warehouse VRV Replacement")).x, 422);
    assert.equal(calls.find(call => call.value.startsWith("Dubai Investment Park")).x, 422);
  }

  const tableY = result => result.calls.find(call => call.value === "Item & Description").y;
  assert.ok(tableY(short) < 350 + 8);
  assert.ok(tableY(long) > tableY(short) + 20);
  assert.ok(tableY(tallCustomer) > tableY(short));
});
