const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

test("service report directory, filters, details and review controls remain live", async () => {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Dubai", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const part = type => parts.find(entry => entry.type === type).value;
  const today = `${part("year")}-${part("month")}-${part("day")}`;
  const previous = new Date(`${today}T12:00:00Z`); previous.setUTCMonth(previous.getUTCMonth() - 1);
  const previousDate = previous.toISOString().slice(0, 10);
  const workOrders = Array.from({ length: 12 }, (_, index) => ({ id: `w${index + 1}`, number: `WO-${1024 + index}`,
    customerName: index === 0 ? "Villa 14" : index === 1 ? "ABC Office" : `Customer ${index + 1}`,
    site: index === 0 ? "JVC, Dubai" : index === 1 ? "Business Bay" : `Site ${index + 1}`,
    workType: "Preventive Maintenance", serviceDate: index === 11 ? previousDate : today,
    startTime: "09:00", endTime: "12:00", technicianIds: index === 0 ? ["t1", "t2"] : ["t2"], leadTechnicianId: index === 0 ? "t1" : "t2",
    contractId: index === 0 ? "a1" : "" }));
  const statuses = ["Pending Review", "Approved", "Submitted", "Revision", "Rejected"];
  const reports = Array.from({ length: 12 }, (_, index) => ({ id: `r${index + 1}`, number: `SR-2026-${String(48 - index).padStart(3, "0")}`,
    workOrderId: `w${index + 1}`, contractId: index === 0 ? "a1" : "", status: statuses[index] || "Approved",
    type: index === 1 ? "Handwritten Upload" : "Digital Checklist", submittedAt: `${today}T${String(12 - index).padStart(2, "0")}:00:00Z`,
    createdAt: `${today}T00:00:00Z`, submittedBy: index === 0 ? "t1" : "t2", fileIds: index === 0 ? ["f1", "f2", "f3"] : index === 1 ? ["f4"] : [],
    originalFileId: index === 1 ? "f4" : "", signatureFileId: index === 0 ? "f3" : "",
    details: { workCarriedOut: index === 0 ? "Cleaned filters and checked cooling" : "Completed service", remarks: "Cooling normal",
      ...(index === 1 ? { recommendedWork: "Legacy field should stay hidden" } : {}) },
    checklist: index === 0 ? { indoor: { Filters: { value: "OK", note: "Clean" } }, outdoor: { Coil: { value: "Issue", note: "Dust" } } } : {},
    extracted: index === 1 ? { workCarriedOut: "Checked compressor", technicianName: "Ahmed Raza, Guest Technician", workOrderNumber: "Legacy duplicate" } : {},
    history: [{ action: "Submitted", actor: index === 0 ? "Mavis Khan" : "Ahmed Raza", at: `${today}T12:00:00Z` }] }));
  const summary = { viewerRole: "admin", contracts: [{ id: "a1", number: "AMC-2026-014", customerName: "Villa 14", site: "JVC, Dubai" },
    { id: "a2", number: "AMC-2026-015", customerName: "Villa 14", site: "Business Bay" }], visits: [], workOrders, schedules: [], reports,
    technicians: [{ id: "t1", name: "Mavis Khan", active: true }, { id: "t2", name: "Ahmed Raza", active: true }], attendance: [], notifications: [], activity: [],
    files: [{ id: "f1", mimeType: "image/jpeg", originalName: "unit.jpg", kind: "photo" },
      { id: "f2", mimeType: "image/jpeg", originalName: "coil.jpg", kind: "photo" },
      { id: "f3", mimeType: "image/png", originalName: "signature.png", kind: "signature" },
      { id: "f4", mimeType: "image/jpeg", originalName: "paper.jpg", kind: "original" }] };
  const listeners = {}, documentListeners = {}, routes = [], scroller = { scrollTop: 0 };
  const uploadedReport = { id: "uploaded-report", number: "1818", workOrderId: "", contractId: "", type: "Handwritten Upload",
    status: "Pending Review", submittedAt: `${today}T13:00:00Z`, fileIds: ["uploaded-file"], originalFileId: "uploaded-file",
    extracted: { reportNumber: "1818", serviceDate: "2026-10-22", customerName: "Ahmad Villa", siteName: "Nad al Shiba" },
    details: {}, history: [] };
  const root = { innerHTML: "", closest: () => scroller, querySelector: () => null, contains: () => false,
    addEventListener: (name, callback) => { listeners[name] = callback; } };
  const context = {
    document: { querySelector: () => root, body: { classList: { remove() {}, toggle() {} } }, scrollingElement: scroller,
      activeElement: null, addEventListener: (name, callback) => { documentListeners[name] = callback; } },
    window: { scrollY: 0, scrollTo() {}, setTimeout() {}, showMaintenance: (...args) => routes.push(args) },
    fetch: async url => ({ ok: true, headers: { get: () => "application/json" }, json: async () =>
      String(url).includes("/reports/upload?submit=1")
        ? { report: uploadedReport, file: { id: "uploaded-file", originalName: "paper.jpg", mimeType: "image/jpeg", kind: "original" } }
        : summary }),
    Intl, Date, FormData, CSS: { escape: value => value }, setTimeout
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../public/maintenance.js"), "utf8"), context);
  await context.window.maintenanceModule.open("reports");
  const click = async (action, extra = {}) => {
    const button = { dataset: { action, ...extra }, classList: { contains: () => false } };
    button.closest = () => button;
    await listeners.click({ target: button });
  };
  const change = (selector, value, data = {}) => listeners.change({ target: { value, dataset: data, matches: pattern => pattern === selector } });

  assert.match(root.innerHTML, /maint-page maint-reports-page/);
  assert.match(root.innerHTML, /All Reports <span>\(12\)/);
  assert.match(root.innerHTML, /Showing 1 to 10 of 12 reports/);
  assert.match(root.innerHTML, /SR-2026-048/);
  assert.match(root.innerHTML, /Cleaned filters and checked cooling/);
  assert.match(root.innerHTML, /AMC-2026-014/);
  await click("sr-more");
  assert.match(root.innerHTML, /View PDF/);
  assert.match(root.innerHTML, /\/api\/maintenance\/reports\/r1\/pdf/);
  assert.match(root.innerHTML, /Upload SR/);
  assert.doesNotMatch(root.innerHTML, /class="maint-date"/);
  assert.doesNotMatch(root.innerHTML, /Team Name/);
  assert.match(root.innerHTML, /data-action="sr-toggle-filters" aria-expanded="false"/);
  assert.match(root.innerHTML, /id="srFilterPanel"[^>]*hidden/);
  await click("sr-toggle-filters");
  assert.match(root.innerHTML, /data-action="sr-toggle-filters" aria-expanded="true"/);
  assert.match(root.innerHTML, /id="srFilterPanel"/);
  await click("sr-toggle-filters");
  assert.match(root.innerHTML, /id="srFilterPanel"[^>]*hidden/);
  await click("sr-toggle-filters");

  await click("upload-report");
  assert.match(root.innerHTML, /Upload Service Report/);
  assert.match(root.innerHTML, /data-report-upload/);
  assert.doesNotMatch(root.innerHTML, /Link to Work Order/);
  assert.doesNotMatch(root.innerHTML, /Submit for Review|Review Extracted Details/);
  await click("close-drawer");

  scroller.scrollTop = 230;
  await click("open-report", { id: "r2" });
  assert.match(root.innerHTML, /SR-2026-047/);
  assert.match(root.innerHTML, /View Original Handwritten Report/);
  assert.doesNotMatch(root.innerHTML, /Checked compressor/);
  assert.match(root.innerHTML, /Ahmed Raza, Guest Technician/);
  assert.doesNotMatch(root.innerHTML, /Legacy duplicate/);
  assert.doesNotMatch(root.innerHTML, /Legacy field should stay hidden/);
  assert.equal(scroller.scrollTop, 230);
  await click("edit-report", { id: "r2" });
  assert.match(root.innerHTML, /Edit SR-2026-047/);
  assert.match(root.innerHTML, /Link to Work Order \(optional\)/);
  assert.match(root.innerHTML, /Service Report Number/);
  assert.match(root.innerHTML, /data-report-tech-input/);
  assert.match(root.innerHTML, /Mavis Khan/);
  assert.doesNotMatch(root.innerHTML, /Work Order Number/);
  assert.doesNotMatch(root.innerHTML, /Recommended Further Work/);
  assert.match(root.innerHTML, /Save Changes/);
  await click("close-drawer");
  await click("sr-more");
  assert.match(root.innerHTML, /View PDF<\/a><button data-action="edit-report" data-id="r2"[^>]*>.*?Re-Edit<\/button>/);
  await click("edit-report", { id: "r2" });
  assert.match(root.innerHTML, /Re-Edit SR-2026-047/);
  assert.match(root.innerHTML, /Approval and the uploaded original will be retained/);
  await click("close-drawer");
  summary.viewerRole = "mts";
  await context.window.maintenanceModule.refresh();
  await click("sr-more");
  assert.doesNotMatch(root.innerHTML, /Re-Edit/);
  await click("edit-report", { id: "r2" });
  assert.doesNotMatch(root.innerHTML, /maintReportEditForm/);
  summary.viewerRole = "admin";
  await context.window.maintenanceModule.refresh();
  await click("report-tab", { tab: "Checklist" });
  assert.match(root.innerHTML, /original paper report/);
  assert.match(root.innerHTML, /View original handwritten report/);
  await click("report-tab", { tab: "Images" });
  assert.match(root.innerHTML, /paper\.jpg/);
  await click("report-tab", { tab: "History" });
  assert.match(root.innerHTML, /Report created/);
  assert.match(root.innerHTML, /Submitted/);
  assert.equal(scroller.scrollTop, 230);

  await click("open-report", { id: "r1" });
  await click("report-tab", { tab: "Checklist" });
  assert.match(root.innerHTML, /Indoor Unit/);
  assert.match(root.innerHTML, /Outdoor Unit/);
  assert.match(root.innerHTML, /Filters/);
  assert.match(root.innerHTML, /Dust/);
  assert.match(root.innerHTML, /Reported Issues/);
  assert.match(root.innerHTML, /Service Photos \(2\)/);
  assert.match(root.innerHTML, /Customer Signature/);
  await click("report-tab", { tab: "Images" });
  await click("sr-preview", { id: "f1" });
  assert.match(root.innerHTML, /Report image preview/);
  assert.match(root.innerHTML, /1 of 3/);
  await click("sr-preview-next");
  assert.match(root.innerHTML, /2 of 3/);
  await click("sr-preview-prev");
  assert.match(root.innerHTML, /1 of 3/);
  documentListeners.keydown({ key: "Escape" });
  assert.doesNotMatch(root.innerHTML, /Report image preview/);

  await click("review-approve", { id: "r1" });
  assert.match(root.innerHTML, /Approve Service Report/);
  await click("close-drawer");
  await click("review-revision", { id: "r1" });
  assert.match(root.innerHTML, /Request Revision Service Report/);
  await click("close-drawer");
  await click("review-reject", { id: "r1" });
  assert.match(root.innerHTML, /Reject Service Report/);
  await click("close-drawer");

  await click("sr-status", { status: "Pending Review" });
  assert.match(root.innerHTML, /Showing 1 to 1 of 1 reports/);
  assert.match(root.innerHTML, /SR-2026-048/);
  await click("sr-status", { status: "Submitted" });
  assert.match(root.innerHTML, /SR-2026-046/);
  assert.doesNotMatch(root.innerHTML, /data-action="open-report" data-id="r1"/);
  await click("sr-clear");
  change("[data-report-filter]", "Villa 14", { reportFilter: "customer" });
  await click("sr-apply");
  assert.match(root.innerHTML, /Showing 1 to 1 of 1 reports/);
  assert.match(root.innerHTML, /SR-2026-048/);
  await click("sr-clear");
  change("[data-report-filter]", "JVC, Dubai", { reportFilter: "site" });
  change("[data-report-filter]", "t1", { reportFilter: "technician" });
  await click("sr-apply");
  assert.match(root.innerHTML, /Showing 1 to 1 of 1 reports/);
  await click("sr-clear");
  change("[data-report-filter]", "previous", { reportFilter: "range" });
  await click("sr-apply");
  assert.match(root.innerHTML, /Showing 1 to 1 of 1 reports/);
  assert.match(root.innerHTML, /SR-2026-037/);
  await click("sr-clear");
  listeners.input({ target: { value: "Mavis Khan", dataset: { search: "reports" }, matches: () => false, closest: () => null } });
  assert.match(root.innerHTML, /Showing 1 to 1 of 1 reports/);
  await click("sr-clear");
  change("[data-report-sort]", "oldest");
  assert.match(root.innerHTML, /data-action="open-report" data-id="r12"/);
  await click("sr-page-next");
  assert.match(root.innerHTML, /Showing 11 to 12 of 12 reports/);
  assert.match(root.innerHTML, /aria-current="true"/);
  change("[data-report-page-size]", "20");
  assert.match(root.innerHTML, /Showing 1 to 12 of 12 reports/);
  await click("close-report");
  assert.match(root.innerHTML, /sr-layout no-detail/);
  assert.doesNotMatch(root.innerHTML, /class="sr-detail"/);
  await click("open-report", { id: "r1" });
  assert.match(root.innerHTML, /class="sr-detail"/);
  await click("open-job", { id: "w1" });
  assert.deepEqual(routes.at(-1), ["work-orders", "w1"]);

  await context.window.maintenanceModule.open("reports");
  await click("upload-report");
  const file = new Blob(["report"], { type: "image/jpeg" });
  file.name = "paper.jpg";
  await listeners.change({ target: { files: [file], matches: pattern => pattern === "[data-report-upload]" } });
  assert.match(root.innerHTML, /Edit 1818/);
  assert.match(root.innerHTML, /AMC Register/);
  assert.match(root.innerHTML, /name="extracted_serviceDate"[^>]*value="22\/10\/2026"/);
  assert.match(root.innerHTML, /Save Changes/);
  assert.doesNotMatch(root.innerHTML, /Submit for Review|Review Extracted Details/);

  const customerField = { value: "Villa 14", name: "extracted_customerName", setAttribute() {}, removeAttribute() {} };
  const siteField = { value: "Nad al Shiba" }, amcField = { value: "", innerHTML: "" };
  const form = { elements: { namedItem: name => ({ extracted_customerName: customerField,
    extracted_siteName: siteField, contractId: amcField })[name] } };
  const optionList = { innerHTML: "", hidden: true };
  const wrapper = { querySelector: () => customerField };
  customerField.parentElement = { querySelector: () => optionList };
  customerField.closest = selector => selector === "form" ? form : null;
  customerField.matches = selector => selector.includes('extracted_customerName');
  root.querySelector = selector => selector === "#maintReportEditForm [data-report-customer-input]" ? customerField : null;
  listeners.input({ target: customerField });
  assert.match(optionList.innerHTML, /data-id="a1"/);
  assert.match(optionList.innerHTML, /data-id="a2"/);
  assert.match(optionList.innerHTML, /Business Bay/);
  assert.equal(siteField.value, "Nad al Shiba");
  const choice = { dataset: { action: "report-customer-choice", id: "a2" },
    closest: selector => selector === ".maint-report-customer" ? wrapper : choice };
  await listeners.click({ target: choice });
  assert.equal(customerField.value, "Villa 14");
  assert.equal(siteField.value, "Business Bay");
  assert.equal(amcField.value, "a2");
  assert.equal(optionList.hidden, true);
});
