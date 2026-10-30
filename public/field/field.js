(() => {
  const root = document.querySelector("#fieldRoot");
  const state = { technician: null, jobs: [], notifications: [], checklistLabels: {}, pushPublicKey: "", pushConfigured: false, pushSubscribed: false, job: null,
    screen: "home", type: "Digital Checklist", step: 0, draft: null, message: "", error: "", signatureData: "", signatureDirty: false, submitting: false,
    uploadSR: null };
  let autoSaveTimer;
  let lastRenderKey = "";
  const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  const date = value => value ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${value.slice(0, 10)}T12:00:00`)) : "--";
  const today = () => {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Dubai", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
    const part = type => parts.find(item => item.type === type).value;
    return `${part("year")}-${part("month")}-${part("day")}`;
  };
  const time = value => value ? new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(`2000-01-01T${value}:00`)) : "--";

  async function api(path, options = {}) {
    const response = await fetch(path, { credentials: "same-origin", ...options,
      headers: options.body instanceof FormData ? undefined : { "Content-Type": "application/json", ...(options.headers || {}) } });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      const error = new Error(result.error || `Request failed (${response.status})`);
      error.status = response.status;
      throw error;
    }
    return response.json();
  }

  function alertMessage(message, error = false) {
    state[error ? "error" : "message"] = message;
    state[error ? "message" : "error"] = "";
    const slot = root.querySelector("#fieldNotice");
    if (slot) { slot.textContent = message; slot.className = `field-notice ${error ? "error" : "success"}`; slot.hidden = false; }
    const submitNotice = root.querySelector("#fieldSubmitNotice");
    if (submitNotice) { submitNotice.textContent = error ? message : ""; submitNotice.hidden = !error; }
  }

  async function load() {
    const me = await api("/api/field/me");
    const jobs = await api("/api/field/work-orders");
    Object.assign(state, { technician: me.technician, notifications: me.notifications, checklistLabels: me.checklist,
      pushPublicKey: me.pushPublicKey, pushConfigured: me.pushConfigured, pushSubscribed: me.pushSubscribed, jobs, error: "" });
    const requested = new URL(location.href).searchParams.get("workOrder");
    if (requested) await openJob(requested);
    else { state.screen = "home"; render(); }
  }

  async function init() {
    if ("serviceWorker" in navigator && window.isSecureContext) navigator.serviceWorker.register("/field/sw.js", { scope: "/field/" }).catch(() => {});
    const url = new URL(location.href);
    const token = url.searchParams.get("access");
    if (token) {
      try {
        await api("/api/field/access", { method: "POST", body: JSON.stringify({ token }) });
      } catch (error) {
        root.innerHTML = accessScreen(error.message);
        return;
      } finally {
        url.searchParams.delete("access");
        history.replaceState({}, "", url.pathname + url.search);
      }
    }
    try { await load(); }
    catch (error) { root.innerHTML = accessScreen(error.status === 401 ? "Open your secure access link from the office to continue." : error.message); }
  }

  function accessScreen(message) {
    return `<main class="field-access"><img src="/assets/cz-logo.png" alt="Comfort Zone AC"><h1>Field Service</h1><p>${esc(message)}</p>
      <div class="field-access-note">Ask the office for a new private technician link. Links expire after 48 hours and can only be used once.</div></main>`;
  }

  function header(title, back = false) {
    return `<header class="field-header"><div>${back ? `<button class="field-back" data-action="home" aria-label="Back to jobs">&#8592;</button>` : `<img src="/field/icon-512.png?v=20261023-logo" alt="">`}
      <span><strong>${esc(title)}</strong><small>${esc(state.technician?.name || "Comfort Zone AC")}</small></span></div></header>`;
  }

  const badge = status => `<span class="field-badge ${String(status || "").toLowerCase().replace(/[^a-z]+/g, "-")}">${esc(status || "--")}</span>`;
  function jobCard(item) {
    return `<article class="field-job-card"><div class="field-job-top"><strong>${esc(item.number)}</strong>${badge(item.status)}</div>
      <h3>${esc(item.customerName)}</h3><p>${esc(item.site)}</p>
      <dl><div><dt>Date</dt><dd>${date(item.serviceDate)}</dd></div><div><dt>Time</dt><dd>${time(item.startTime)} - ${time(item.endTime)}</dd></div><div><dt>Service</dt><dd>${esc(item.workType)}</dd></div></dl>
      <button class="field-primary" data-action="open-job" data-id="${item.id}">View Job <span aria-hidden="true">&#8594;</span></button></article>`;
  }

  function home() {
    const current = today();
    const todayJobs = state.jobs.filter(item => item.serviceDate === current && item.status !== "Completed");
    const upcoming = state.jobs.filter(item => item.serviceDate > current && item.status !== "Completed");
    const past = state.jobs.filter(item => item.serviceDate < current || item.status === "Completed").slice(-10).reverse();
    const pushStatus = !window.isSecureContext ? "Available over HTTPS" : !("Notification" in window) ? "Unavailable" : !state.pushConfigured ? "Server setup needed" : Notification.permission === "denied" ? "Blocked" : Notification.permission !== "granted" ? "Not enabled" : state.pushSubscribed ? "Enabled" : "Not connected";
    return `${header("My Maintenance Jobs")}
      <main class="field-main"><div id="fieldNotice" class="field-notice ${state.error ? "error" : "success"}" ${state.error || state.message ? "" : "hidden"}>${esc(state.error || state.message)}</div>
      <section class="field-welcome"><div><span>Today · ${date(current)}</span><h1>My Maintenance Jobs</h1><p>${todayJobs.length} job${todayJobs.length === 1 ? "" : "s"} today</p></div><button class="field-primary field-upload-shortcut" data-action="upload-sr">Upload SR</button></section>
      <div class="field-toolbar"><span>Notifications: ${pushStatus}</span><button data-action="enable-push">Enable alerts</button></div>
      ${/iPad|iPhone|iPod/.test(navigator.userAgent) && !window.navigator.standalone ? `<p class="field-tip">On iPhone, use Share &gt; Add to Home Screen to receive web notifications.</p>` : ""}
      <section class="field-section"><h2>Today <span>${todayJobs.length}</span></h2>${todayJobs.length ? todayJobs.map(jobCard).join("") : `<div class="field-empty">No assigned jobs today.</div>`}</section>
      <section class="field-section"><h2>Upcoming <span>${upcoming.length}</span></h2>${upcoming.length ? upcoming.map(jobCard).join("") : `<div class="field-empty">No upcoming jobs assigned.</div>`}</section>
      ${past.length ? `<section class="field-section"><h2>Recent Jobs</h2>${past.map(jobCard).join("")}</section>` : ""}
      <section class="field-section"><h2>Notifications <span>${state.notifications.length}</span></h2>${state.notifications.length ? state.notifications.slice(0, 20).map(item => `<div class="field-notification"><div><strong>${esc(item.title)}</strong><p>${esc(item.message)}</p><small>${date(item.createdAt)} · ${esc(item.status)}</small></div>${item.status !== "Accepted" ? `<button data-action="accept-notification" data-id="${item.id}">Accept</button>` : ""}</div>`).join("") : `<div class="field-empty">No notifications yet.</div>`}</section></main>`;
  }

  function uploadSRForm() {
    const upload = state.uploadSR || { fileId: "", fields: {}, message: "" };
    const fields = [["reportNumber", "Service Report Number"], ["serviceDate", "Service Date"], ["customerName", "Customer Name"], ["siteName", "Site / Location"],
      ["technicianName", "Technician Name"], ["unitNumber", "Unit Number"], ["modelNumber", "Model Number"],
      ["serialNumber", "Serial Number"], ["refrigerant", "Refrigerant"], ["quantity", "Quantity"], ["jobCompletion", "Job Completion"]];
    const descriptions = [["workCarriedOut", "Work Carried Out"], ["materialsUsed", "Materials Used"], ["remarks", "Remarks"]];
    return `${header("Upload Service Report", true)}<main class="field-main"><div id="fieldNotice" class="field-notice ${state.error ? "error" : "success"}" ${state.error || state.message ? "" : "hidden"}>${esc(state.error || state.message)}</div>
      <div class="field-report-heading"><span>${esc(state.technician?.name || "")}</span><h1>Upload SR</h1></div>
      <form id="fieldUploadSRForm"><section class="field-info"><label class="field-file">Upload Service Report<input type="file" data-upload-sr accept="image/*,.pdf,application/pdf" ${upload.fileId || upload.uploading ? "disabled" : ""}></label>
        ${upload.message ? `<p class="field-tip" role="status">${esc(upload.message)}</p>` : ""}${upload.fileId ? `<p class="field-upload-file">${esc(upload.fileName || "Service report uploaded")}</p>` : ""}</section>
        ${upload.fileId ? `<section class="field-info"><h2>Review Extracted Details</h2><p class="field-tip">Correct any values that were read incorrectly. The original report will be attached for office review.</p>
          <div class="field-form-grid">${fields.map(([key, label]) => `<label>${esc(label)}<input data-upload-sr-field="${key}" value="${esc(upload.fields?.[key] || "")}"></label>`).join("")}
          ${descriptions.map(([key, label]) => `<label>${esc(label)}<textarea data-upload-sr-field="${key}" rows="3">${esc(upload.fields?.[key] || "")}</textarea></label>`).join("")}</div></section>` : ""}
      <div class="field-report-footer"><button type="button" class="field-secondary" data-action="home">Cancel</button><button type="button" class="field-primary" data-action="submit-upload-sr" ${upload.fileId && !upload.submitting ? "" : "disabled"}>${upload.submitting ? "Submitting..." : "Submit Service Report"}</button></div></form></main>`;
  }

  async function openJob(id) {
    try {
      state.job = await api(`/api/field/work-orders/${encodeURIComponent(id)}`);
      state.screen = "job";
      const url = new URL(location.href); url.searchParams.set("workOrder", id); history.replaceState({}, "", url.pathname + url.search);
      render();
    } catch (error) { alertMessage(error.message, true); }
  }

  function jobDetails() {
    const item = state.job;
    if (!item) return home();
    const myAttendance = item.attendance.filter(row => row.technicianId === state.technician.id);
    const open = myAttendance.find(row => !row.checkOutAt);
    const allowReport = !["Completed"].includes(item.status) && (!item.report || ["Revision", "Rejected"].includes(item.report.status));
    return `${header("Work Order", true)}<main class="field-main"><div id="fieldNotice" class="field-notice ${state.error ? "error" : "success"}" ${state.error || state.message ? "" : "hidden"}>${esc(state.error || state.message)}</div>
      <div class="field-job-heading"><span>${esc(item.number)}</span>${badge(item.status)}<h1>${esc(item.customerName)}</h1><p>${esc(item.site)}</p></div>
      <section class="field-info"><h2>Job Details</h2><dl><div><dt>Service Date</dt><dd>${date(item.serviceDate)}</dd></div><div><dt>Time</dt><dd>${time(item.startTime)} - ${time(item.endTime)}</dd></div>
        <div><dt>Work Type</dt><dd>${esc(item.workType)}</dd></div><div><dt>AMC Contract</dt><dd>${esc(item.contractNumber || "Non-AMC")}</dd></div>
        <div><dt>Contact</dt><dd>${esc(item.contact || "--")}</dd></div>
        <div class="wide"><dt>Assigned Technicians</dt><dd>${esc(item.technicians.map(row => row.name).join(", "))}</dd></div></dl>
        <p class="field-instructions"><strong>Work Instructions</strong>${esc(item.instructions || "No instructions added.")}</p>
        <div class="field-links"><a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.site)}" target="_blank" rel="noopener">View Location</a>
        ${item.phone ? `<a href="tel:${esc(item.phone.replace(/[^+0-9]/g, ""))}">Call Customer</a>` : ""}</div></section>
      <section class="field-info"><h2>My Attendance</h2><p>${open ? `Checked in ${date(open.checkInAt)} at ${open.checkInAt.slice(11, 16)}` : myAttendance.length ? `Last check-out ${date(myAttendance.at(-1).checkOutAt)}` : "Not checked in"}</p>
        <button class="field-primary" data-action="${open ? "check-out" : "check-in"}" ${item.status === "Completed" ? "disabled" : ""}>${open ? "Check Out" : "Check In"}</button></section>
      <section class="field-info"><h2>Service Report</h2>${item.report ? `<p>${esc(item.report.number)} · ${badge(item.report.status)}</p>${item.report.reviewReason ? `<p class="field-review-note">Office note: ${esc(item.report.reviewReason)}</p>` : ""}` : `<p>No report submitted yet.</p>`}
        ${allowReport ? `<div class="field-report-actions"><button data-action="digital">Digital HVAC Checklist</button><button data-action="handwritten">Upload Handwritten Report</button></div>` : ""}</section>
      <section class="field-info"><h2>Attendance History</h2>${myAttendance.length ? myAttendance.map(row => `<p>${date(row.checkInAt)} · In ${row.checkInAt.slice(11, 16)} · Out ${row.checkOutAt ? row.checkOutAt.slice(11, 16) : "On site"}</p>`).join("") : `<p>No attendance recorded.</p>`}</section></main>`;
  }

  function beginReport(type) {
    const existing = state.job.draft || (["Revision", "Rejected"].includes(state.job.report?.status) ? state.job.report : null);
    state.type = type;
    state.step = 0;
    state.signatureData = "";
    state.signatureDirty = false;
    state.draft = { type, checklist: structuredClone(existing?.checklist || { maintenance: {} }),
      details: { ...(existing?.details || {}) }, fileIds: [...(existing?.fileIds || [])],
      signatureFileId: existing?.signatureFileId || "", originalFileId: existing?.originalFileId || "", extracted: { ...(existing?.extracted || {}) } };
    state.screen = "report";
    render();
  }

  function checklistStep() {
    const d = state.draft;
    if (state.type === "Handwritten Upload") {
      const keys = ["reportNumber", "customerName", "siteName", "serviceDate", "technicianName", "unitNumber", "modelNumber", "serialNumber", "refrigerant", "workCarriedOut", "materialsUsed", "quantity", "remarks", "jobCompletion"];
      return `<section class="field-info"><h2>Original Report</h2><p>Photograph the complete paper report. The original stays available to the office.</p>
        <label class="field-file">Take photo or choose file<input type="file" data-upload="original" accept="image/*,.pdf,application/pdf" capture="environment"></label>
        ${d.originalFileId ? `<a href="/api/field/files/${encodeURIComponent(d.originalFileId)}" target="_blank" rel="noopener">View original upload</a>` : ""}</section>
        <section class="field-info"><h2>Review Extracted Details</h2><p class="field-tip">Leave unreadable or missing fields blank.</p>
        <div class="field-form-grid">${keys.map(key => `<label>${esc(key === "reportNumber" ? "Service Report Number" : key.replace(/([A-Z])/g, " $1"))}<input data-extracted="${key}" value="${esc(d.extracted?.[key] || "")}"></label>`).join("")}</div></section>`;
    }
    const labels = state.checklistLabels.maintenance || [];
    return `<section class="field-info field-checklist-section"><h2>AC Maintenance Checklist</h2><div class="field-checklist-rows">
      ${labels.map((label, index) => { const item = d.checklist?.maintenance?.[label] || {}; return `<div class="field-check-item"><span class="field-check-number">${index + 1}</span><strong>${esc(label)}</strong><div class="field-radio-row">${["OK", "Issue"].map(value => `<label class="field-check-choice ${value.toLowerCase()}"><input type="radio" name="maintenance-${index}" data-check-group="maintenance" data-check-label="${esc(label)}" value="${value}" ${item.value === value ? "checked" : ""}><span>${value}</span></label>`).join("")}</div></div>`; }).join("")}</div></section>
      <section class="field-info field-service-details"><h2>Service Details</h2>${detailsFields()}</section>`;
  }

  function detailsFields() {
    const fields = [["workCarriedOut", "Work Description"], ["materialsUsed", "Materials Used"], ["remarks", "Remarks"]];
    return `<div class="field-form-grid">${fields.map(([key, label]) => `<label>${label}<textarea data-detail="${key}" rows="3">${esc(state.draft.details?.[key] || "")}</textarea></label>`).join("")}</div>`;
  }

  function photosStep() {
    const files = (state.job.files || []).filter(file => state.draft.fileIds.includes(file.id) && file.kind === "photo");
    return `<section class="field-info"><h2>Site Photos</h2><p>Add photos of the units, completed work and any issues.</p>
      <label class="field-file">Add Photos<input type="file" data-upload="photo" accept="image/*" capture="environment" multiple></label>
      ${files.length ? `<div class="field-photos">${files.map(file => `<div class="field-photo"><a href="/api/field/files/${encodeURIComponent(file.id)}" target="_blank" rel="noopener"><img src="/api/field/files/${encodeURIComponent(file.id)}" alt="${esc(file.originalName)}"><small>${esc(file.originalName)}</small></a><button type="button" class="field-photo-remove" data-action="remove-photo" data-id="${esc(file.id)}" aria-label="Remove ${esc(file.originalName)}" title="Remove photo">&times;</button></div>`).join("")}</div>` : `<p class="field-tip">No photos added yet.</p>`}</section>`;
  }

  function signatureStep() {
    if (state.type === "Handwritten Upload") return `<section class="field-info"><h2>Review & Submit</h2><p>Check the extracted fields against the original before sending this report to the office.</p>
      ${detailsFields()}<p class="field-review-note">The signature on the uploaded paper report remains part of the original image and requires office review.</p></section>`;
    return `<section class="field-info"><h2>Customer Signature</h2><label>Customer Name<input data-detail="customerName" value="${esc(state.draft.details?.customerName || "")}" placeholder="Customer or representative"></label>
      <canvas id="fieldSignature" aria-label="Customer signature area"></canvas><button class="field-text-button" data-action="clear-signature">Clear signature</button>
      <p class="field-tip">Ask the customer to sign in the area above.</p></section>`;
  }

  function reportForm() {
    const steps = state.type === "Digital Checklist" ? ["Checklist", "Photos", "Signature & Submit"] : ["Report", "Photos", "Review & Submit"];
    const checklistPage = state.type === "Digital Checklist" && state.step === 0;
    return `${header(state.type, true)}<main class="field-main ${checklistPage ? "field-checklist-page" : ""}"><div id="fieldNotice" class="field-notice ${state.error ? "error" : "success"}" ${state.error || state.message ? "" : "hidden"}>${esc(state.error || state.message)}</div>
      <div class="field-report-heading"><span>${esc(state.job.number)} · ${esc(state.job.customerName)}</span>${checklistPage ? "" : `<h1>${esc(steps[state.step])}</h1>`}</div>
      <nav class="field-steps" aria-label="Report steps">${steps.map((label, index) => `<span class="${index === state.step ? "active" : index < state.step ? "done" : ""}"><b>${index + 1}</b><small>${esc(label)}</small></span>`).join("")}</nav>
      ${state.step === 0 ? checklistStep() : state.step === 1 ? photosStep() : signatureStep()}
      ${state.step === 2 ? `<div id="fieldSubmitNotice" class="field-notice error" ${state.error ? "" : "hidden"}>${esc(state.error)}</div>` : ""}
      <div class="field-report-footer"><button class="field-secondary" data-action="save-draft">Save Draft</button>
      ${state.step > 0 ? `<button class="field-secondary" data-action="previous">Previous</button>` : ""}
      <button class="field-primary" data-action="${state.step < 2 ? "next" : "submit-report"}" ${state.step === 2 && state.submitting ? "disabled aria-busy=\"true\"" : ""}>${state.step < 2 ? "Next" : state.submitting ? "Submitting..." : "Submit Service Report"}</button></div></main>`;
  }

  function render() {
    const key = state.screen === "report" ? `${state.screen}:${state.step}` : state.screen;
    const scrollTop = key === lastRenderKey ? window.scrollY : 0;
    root.innerHTML = state.screen === "job" ? jobDetails() : state.screen === "report" ? reportForm() : state.screen === "upload-sr" ? uploadSRForm() : home();
    if (state.screen === "report" && state.step === 2 && state.type === "Digital Checklist") setupSignature();
    window.scrollTo(0, scrollTop);
    lastRenderKey = key;
  }

  function syncFields() {
    if (state.screen !== "report" || !state.draft) return;
    root.querySelectorAll("[data-detail]").forEach(input => state.draft.details[input.dataset.detail] = input.value);
    root.querySelectorAll("[data-extracted]").forEach(input => state.draft.extracted[input.dataset.extracted] = input.value);
    root.querySelectorAll("[data-check-group]:checked").forEach(input => {
      const group = input.dataset.checkGroup, label = input.dataset.checkLabel;
      state.draft.checklist[group] ||= {};
      state.draft.checklist[group][label] ||= {};
      state.draft.checklist[group][label].value = input.value;
    });
  }

  function setupSignature() {
    const canvas = root.querySelector("#fieldSignature");
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scale = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(rect.width * scale));
    canvas.height = Math.round(160 * scale);
    const ctx = canvas.getContext("2d");
    ctx.scale(scale, scale);
    ctx.lineWidth = 2.5; ctx.lineCap = "round"; ctx.strokeStyle = "#102249";
    if (state.signatureData) { const image = new Image(); image.onload = () => ctx.drawImage(image, 0, 0, rect.width, 160); image.src = state.signatureData; }
    let drawing = false;
    const point = event => { const box = canvas.getBoundingClientRect(); return [event.clientX - box.left, event.clientY - box.top]; };
    canvas.addEventListener("pointerdown", event => { drawing = true; canvas.setPointerCapture(event.pointerId); const [x, y] = point(event); ctx.beginPath(); ctx.moveTo(x, y); });
    canvas.addEventListener("pointermove", event => { if (!drawing) return; const [x, y] = point(event); ctx.lineTo(x, y); ctx.stroke(); });
    canvas.addEventListener("pointerup", () => { drawing = false; state.signatureDirty = true; state.signatureData = canvas.toDataURL("image/png"); });
  }

  async function uploadFile(file, kind) {
    const form = new FormData(); form.append("file", file, file.name);
    return api(`/api/field/work-orders/${encodeURIComponent(state.job.id)}/files?kind=${kind}`, { method: "POST", body: form });
  }

  async function uploadStandaloneSR(file) {
    const upload = state.uploadSR;
    if (!upload) return;
    upload.uploading = true; upload.message = "Uploading and reading the report..."; state.error = ""; render();
    try {
      const form = new FormData(); form.append("file", file, file.name);
      const result = await api("/api/field/reports/upload", { method: "POST", body: form });
      Object.assign(upload, { fileId: result.file.id, fileName: result.file.originalName, fields: result.fields || {}, message: result.message || "Review the extracted details." });
    } catch (error) { upload.message = error.message; upload.error = true; }
    upload.uploading = false;
    render();
  }

  async function submitStandaloneSR() {
    const upload = state.uploadSR;
    if (!upload?.fileId || upload.submitting) return;
    const extracted = { ...upload.fields };
    root.querySelectorAll("[data-upload-sr-field]").forEach(input => { extracted[input.dataset.uploadSrField] = input.value.trim(); });
    upload.fields = extracted;
    upload.submitting = true; state.error = ""; render();
    const body = { fileId: upload.fileId, extracted,
      details: { customerName: extracted.customerName || "", workCarriedOut: extracted.workCarriedOut || "",
        materialsUsed: extracted.materialsUsed || "", remarks: extracted.remarks || "" } };
    try {
      const result = await api("/api/field/reports", { method: "POST", body: JSON.stringify(body) });
      state.message = `${result.number} submitted for office review`; state.uploadSR = null;
      await load();
    } catch (error) { upload.submitting = false; state.error = error.message; render(); }
  }

  async function saveDraft() {
    clearTimeout(autoSaveTimer);
    syncFields();
    await api(`/api/field/work-orders/${encodeURIComponent(state.job.id)}/draft`, { method: "PUT", body: JSON.stringify(state.draft) });
    alertMessage("Draft saved");
  }

  async function submit() {
    if (state.submitting) return;
    clearTimeout(autoSaveTimer);
    syncFields();
    state.submitting = true;
    const submitButton = root.querySelector('[data-action="submit-report"]');
    if (submitButton) { submitButton.disabled = true; submitButton.setAttribute("aria-busy", "true"); submitButton.textContent = "Submitting..."; }
    try {
    if (state.type === "Handwritten Upload" && !state.draft.originalFileId) throw new Error("Upload the original paper report first");
    if (state.type === "Digital Checklist") {
      if (!state.draft.details.customerName?.trim()) throw new Error("Enter the customer name");
      if (!state.signatureDirty && !state.draft.signatureFileId) throw new Error("Capture the customer signature");
      if (state.signatureDirty) {
        const bytes = Uint8Array.from(atob(state.signatureData.split(",")[1]), char => char.charCodeAt(0));
        const blob = new Blob([bytes], { type: "image/png" });
        const signature = await uploadFile(new File([blob], "customer-signature.png", { type: "image/png" }), "signature");
        state.draft.signatureFileId = signature.id;
      }
    }
    const result = await api(`/api/field/work-orders/${encodeURIComponent(state.job.id)}/report`, { method: "POST", body: JSON.stringify(state.draft) });
    state.screen = "job";
    state.message = `${result.number} submitted for office review`;
    try { state.job = await api(`/api/field/work-orders/${encodeURIComponent(state.job.id)}`); } catch { /* The report is already saved; keep the success state visible. */ }
    render();
    } finally {
      state.submitting = false;
      if (state.screen === "report") {
        const button = root.querySelector('[data-action="submit-report"]');
        if (button) { button.disabled = false; button.removeAttribute("aria-busy"); button.textContent = "Submit Service Report"; }
      }
    }
  }

  function vapidBytes(base64) {
    const padding = "=".repeat((4 - base64.length % 4) % 4);
    const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(raw, char => char.charCodeAt(0));
  }

  async function enablePush() {
    if (!window.isSecureContext || !("Notification" in window) || !("PushManager" in window)) throw new Error("Web Push requires HTTPS and a compatible browser.");
    if (!state.pushConfigured || !state.pushPublicKey) throw new Error("Phone alerts are not configured on the server. Set the VAPID public and private keys.");
    const permission = await Notification.requestPermission();
    if (permission !== "granted") throw new Error("Notifications were not allowed. Job updates remain in the inbox.");
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidBytes(state.pushPublicKey) });
    await api("/api/field/push-subscription", { method: "POST", body: JSON.stringify({ subscription }) });
    state.pushSubscribed = true;
    render();
    alertMessage("Notifications enabled");
  }

  root.addEventListener("click", async event => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const action = button.dataset.action;
    try {
      if (action === "home") {
        if (state.screen === "report") { syncFields(); await saveDraft(); state.screen = "job"; render(); }
        else { state.screen = "home"; const url = new URL(location.href); url.searchParams.delete("workOrder"); history.replaceState({}, "", url.pathname + url.search); await load(); }
        return;
      }
      if (action === "open-job") return openJob(button.dataset.id);
      if (action === "upload-sr") { state.uploadSR = { fileId: "", fields: {}, message: "" }; state.error = ""; state.screen = "upload-sr"; return render(); }
      if (action === "submit-upload-sr") return submitStandaloneSR();
      if (action === "check-in" || action === "check-out") {
        await api(`/api/field/work-orders/${encodeURIComponent(state.job.id)}/attendance`, { method: "POST", body: JSON.stringify({ action: action === "check-in" ? "checkIn" : "checkOut" }) });
        state.job = await api(`/api/field/work-orders/${encodeURIComponent(state.job.id)}`); state.message = action === "check-in" ? "Checked in" : "Checked out"; render(); return;
      }
      if (action === "digital" || action === "handwritten") return beginReport(action === "digital" ? "Digital Checklist" : "Handwritten Upload");
      if (action === "previous") { syncFields(); state.step -= 1; return render(); }
      if (action === "next") { syncFields(); await saveDraft(); state.step += 1; return render(); }
      if (action === "save-draft") return saveDraft();
      if (action === "remove-photo") {
        await api(`/api/field/work-orders/${encodeURIComponent(state.job.id)}/files/${encodeURIComponent(button.dataset.id)}`, { method: "DELETE" });
        state.draft.fileIds = state.draft.fileIds.filter(fileId => fileId !== button.dataset.id);
        state.job.files = state.job.files.filter(file => file.id !== button.dataset.id);
        render();
        await saveDraft();
        return;
      }
      if (action === "submit-report") return await submit();
      if (action === "clear-signature") { state.signatureData = ""; state.signatureDirty = false; state.draft.signatureFileId = ""; return setupSignatureClear(); }
      if (action === "enable-push") return enablePush();
      if (action === "accept-notification") { await api(`/api/field/notifications/${encodeURIComponent(button.dataset.id)}/accept`, { method: "POST", body: "{}" }); await load(); return; }
    } catch (error) { alertMessage(error.message, true); }
  });

  function queueDraft() {
    if (state.screen !== "report") return;
    clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(async () => {
      if (state.screen !== "report") return;
      syncFields();
      try { await api(`/api/field/work-orders/${encodeURIComponent(state.job.id)}/draft`, { method: "PUT", body: JSON.stringify(state.draft) }); }
      catch (error) { alertMessage(`Draft could not be saved: ${error.message}`, true); }
    }, 900);
  }

  root.addEventListener("input", event => {
    if (event.target.matches("[data-detail], [data-extracted]")) queueDraft();
  });
  window.addEventListener("beforeunload", event => {
    if (state.screen === "report") { event.preventDefault(); event.returnValue = ""; }
  });

  function setupSignatureClear() { const canvas = root.querySelector("#fieldSignature"); canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height); }

  root.addEventListener("change", async event => {
    const input = event.target;
    if (input.matches("[data-upload-sr]")) {
      const file = input.files?.[0];
      if (file) await uploadStandaloneSR(file);
      return;
    }
    if (input.matches("[data-check-group]") || input.matches("[data-detail]") || input.matches("[data-extracted]")) {
      syncFields(); queueDraft(); return;
    }
    if (!input.matches("[data-upload]")) return;
    try {
      const kind = input.dataset.upload;
      const files = [...input.files];
      if (!files.length) return;
      for (const file of files) {
        const saved = await uploadFile(file, kind);
        state.job.files.push(saved);
        if (kind === "original") {
          state.draft.originalFileId = saved.id;
          state.draft.fileIds = state.draft.fileIds.filter(id => state.job.files.find(item => item.id === id)?.kind !== "original");
          state.draft.fileIds.push(saved.id);
          const extracted = await api(`/api/field/work-orders/${encodeURIComponent(state.job.id)}/extract`, { method: "POST", body: JSON.stringify({ fileId: saved.id }) });
          state.draft.extracted = { ...state.draft.extracted, ...extracted.fields };
          state.message = extracted.message;
        } else state.draft.fileIds.push(saved.id);
      }
      await saveDraft(); render();
    } catch (error) { alertMessage(error.message, true); }
  });

  init();
})();
