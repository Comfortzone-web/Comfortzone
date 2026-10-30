const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

async function uploadHandwritten(extraction) {
  const listeners = {};
  const savedDrafts = [];
  const removedFiles = [];
  let uploadAlert = null;
  const notice = { textContent: "" };
  const root = {
    innerHTML: "",
    addEventListener(name, callback) { listeners[name] = callback; },
    querySelector(selector) { return selector === "#fieldUploadAlert" ? uploadAlert : selector === "#fieldNotice" ? notice : null; },
    querySelectorAll(selector) {
      // The upload screen has no extracted inputs; they appear only after Next.
      return selector === "[data-extracted]" ? [...this.innerHTML.matchAll(/data-extracted="([^"]+)" value="([^"]*)"/g)]
        .map(([, key, value]) => ({ dataset: { extracted: key }, value })) : [];
    },
    append(element) { uploadAlert = element; element.remove = () => { uploadAlert = null; }; }
  };
  const job = { id: "job-1", number: "WO-1", customerName: "Customer", site: "Site", status: "Scheduled",
    serviceDate: "2026-10-30", technicianIds: ["tech-1"], files: [], attendance: [], activity: [],
    technicians: [{ id: "tech-1", name: "Azeem" }], draft: null, report: null };
  const context = {
    document: { querySelector: () => root, createElement: () => ({ setAttribute() {} }) },
    window: { isSecureContext: false, scrollY: 0, scrollTo() {}, addEventListener() {} },
    navigator: { userAgent: "Android" },
    location: { href: "http://localhost/field/" },
    history: { replaceState() {} },
    fetch: async (url, options = {}) => {
      if (options.method === "DELETE") {
        removedFiles.push(url);
        return { ok: true, json: async () => ({ ok: true, deleted: true }) };
      }
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
  const beforeUpload = root.innerHTML;
  const file = new Blob(["small photo"], { type: "image/jpeg" });
  file.name = "report.jpg";
  const input = { files: [file], dataset: { upload: "original" }, isConnected: false,
    matches: selector => selector === "[data-upload]" };
  await listeners.change({ target: input });
  return { root, savedDrafts, removedFiles, notice, click, beforeUpload };
}

test("handwritten OCR fields survive draft save and appear on the form", async () => {
  const { root, savedDrafts, notice, click, beforeUpload } = await uploadHandwritten({ available: true,
    fields: { reportNumber: "SR-1730", customerName: "P 133", technicianName: "Someone else" }, message: "Review every extracted field before submitting." });
  assert.match(beforeUpload, /data-action="next" disabled/);
  assert.doesNotMatch(beforeUpload, /data-extracted=/);
  assert.ok(savedDrafts.length, notice.textContent);
  assert.equal(savedDrafts.at(-1).extracted.reportNumber, "SR-1730");
  assert.equal(savedDrafts.at(-1).extracted.customerName, "P 133");
  assert.equal(savedDrafts.at(-1).extracted.technicianName, "Azeem");
  assert.match(root.innerHTML, /Review every extracted field before submitting\./);
  assert.doesNotMatch(root.innerHTML, /data-extracted=/);
  await click("next");
  assert.match(root.innerHTML, /value="SR-1730"/);
  assert.match(root.innerHTML, /value="P 133"/);
  assert.match(root.innerHTML, /data-extracted="technicianName" value="Azeem"/);
  await new Promise(resolve => setTimeout(resolve, 710));
  await click("next");
  assert.match(root.innerHTML, /Site Photos/);
  await new Promise(resolve => setTimeout(resolve, 710));
  await click("next");
  assert.match(root.innerHTML, /Review &amp; Submit/);
});

test("handwritten OCR failure remains visible for manual review", async () => {
  const { root } = await uploadHandwritten({ available: false, fields: {}, message: "AI extraction is unavailable. Enter details manually." });
  assert.match(root.innerHTML, /AI extraction is unavailable\. Enter details manually\./);
});

test("wrong original report can be deleted before continuing", async () => {
  const { root, savedDrafts, removedFiles, click } = await uploadHandwritten({ available: true,
    fields: { reportNumber: "WRONG" }, message: "Review extracted details." });
  assert.match(root.innerHTML, /data-action="remove-original" data-id="file-1"/);
  await click("remove-original", "file-1");
  assert.deepEqual(removedFiles, ["/api/field/work-orders/job-1/files/file-1"]);
  assert.equal(savedDrafts.at(-1).originalFileId, "");
  assert.deepEqual(savedDrafts.at(-1).fileIds, []);
  assert.equal(savedDrafts.at(-1).extracted.reportNumber, undefined);
  assert.doesNotMatch(root.innerHTML, /View original upload/);
  assert.match(root.innerHTML, /data-action="next" disabled/);
});
