const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

async function uploadHandwritten(extraction) {
  const listeners = {};
  const savedDrafts = [];
  let uploadAlert = null;
  const notice = { textContent: "" };
  const root = {
    innerHTML: "",
    addEventListener(name, callback) { listeners[name] = callback; },
    querySelector(selector) { return selector === "#fieldUploadAlert" ? uploadAlert : selector === "#fieldNotice" ? notice : null; },
    querySelectorAll(selector) {
      // OCR finishes while the old, still-empty form is on screen.
      return selector === "[data-extracted]" ? [{ dataset: { extracted: "reportNumber" }, value: "" },
        { dataset: { extracted: "customerName" }, value: "" }] : [];
    },
    append(element) { uploadAlert = element; element.remove = () => { uploadAlert = null; }; }
  };
  const job = { id: "job-1", number: "WO-1", customerName: "Customer", site: "Site", status: "Scheduled",
    serviceDate: "2026-10-30", technicianIds: ["tech-1"], files: [], attendance: [], activity: [],
    technicians: [], draft: null, report: null };
  const context = {
    document: { querySelector: () => root, createElement: () => ({ setAttribute() {} }) },
    window: { isSecureContext: false, scrollY: 0, scrollTo() {}, addEventListener() {} },
    navigator: { userAgent: "Android" },
    location: { href: "http://localhost/field/" },
    history: { replaceState() {} },
    fetch: async (url, options = {}) => {
      if (url === "/api/field/work-orders/job-1/draft") savedDrafts.push(JSON.parse(options.body));
      const body = url === "/api/field/me" ? { technician: { id: "tech-1", name: "Technician" },
        notifications: [], checklist: { maintenance: [] }, pushConfigured: false, pushSubscribed: false }
        : url === "/api/field/work-orders" ? [job]
          : url === "/api/field/work-orders/job-1" ? job
            : url.includes("/files?kind=original") ? { id: "file-1", kind: "original" }
              : url.endsWith("/extract") ? extraction : {};
      return { ok: true, json: async () => body };
    },
    FormData, URL, Date, Intl, structuredClone, clearTimeout, setTimeout
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../public/field/field.js"), "utf8"), context);
  await new Promise(resolve => setImmediate(resolve));
  const click = async (action, id) => {
    const button = { dataset: { action, id }, closest: () => button, isConnected: false,
      setAttribute() {}, removeAttribute() {} };
    await listeners.click({ target: button });
  };
  await click("open-job", "job-1");
  await click("handwritten");
  const file = new Blob(["small photo"], { type: "image/jpeg" });
  file.name = "report.jpg";
  const input = { files: [file], dataset: { upload: "original" }, isConnected: false,
    matches: selector => selector === "[data-upload]" };
  await listeners.change({ target: input });
  return { root, savedDrafts, notice };
}

test("handwritten OCR fields survive draft save and appear on the form", async () => {
  const { root, savedDrafts, notice } = await uploadHandwritten({ available: true,
    fields: { reportNumber: "SR-1730", customerName: "P 133" }, message: "Review every extracted field before submitting." });
  assert.ok(savedDrafts.length, notice.textContent);
  assert.equal(savedDrafts.at(-1).extracted.reportNumber, "SR-1730");
  assert.equal(savedDrafts.at(-1).extracted.customerName, "P 133");
  assert.match(root.innerHTML, /value="SR-1730"/);
  assert.match(root.innerHTML, /value="P 133"/);
});

test("handwritten OCR failure remains visible for manual review", async () => {
  const { root } = await uploadHandwritten({ available: false, fields: {}, message: "AI extraction is unavailable. Enter details manually." });
  assert.match(root.innerHTML, /AI extraction is unavailable\. Enter details manually\./);
});
