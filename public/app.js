const $ = selector => document.querySelector(selector);
const canvas = $("#canvas");
const loginRoles = ["Admin", "Staff", "PO Only"];

let state = null;
let activeView = "canvas";
let drag = null;
let canvasZoom = 0.72;
let workflowDraftPromise = null;
let workflowRenderRequest = 0;
let preserveTableSizes = false;
let projectPersisted = false;
let projectTouched = false;
let inventoryState = null;
let inventoryScreen = "dashboard";
let inventoryDashboardSearchQuery = "";
let activeSupplierDnId = "";
let supplierAllPage = 1;
let deliveryDraft = null;
let deliveryListPage = 1;
let deliverySearchQuery = "";
let deliveryPanelWidth = Number(localStorage.getItem("deliveryPanelWidth") || 430);
let deliveryResize = null;
let purchaseState = null;
let purchaseScreen = "form";
let purchaseDraft = null;
let purchaseSearchQuery = "";
let purchaseSupplierSearchQuery = "";
let purchaseUploadLoading = false;
let workflowUploadLoading = false;
let purchaseLoadedAt = 0;
let purchaseLoadPromise = null;
let salesDeskScreen = "dashboard";
let salesQuotationMode = "list";
let salesProjectMode = "list";
let salesProjectFilter = "";
let salesProjectDetailId = "";
let salesSearchQuery = "";
let salesLeadFilter = "";
let salesLeadTab = "all";
let salesLeadViewMode = "table";
let salesQuotationTab = "all";
let salesLeadDetailId = "";
let salesLeadDraggedId = "";
let salesLeadFiltersOpen = false;
let salesLeadFilters = {
  salesPerson: "",
  productType: "",
  status: "",
  receivedDate: "",
  finalizingMonth: "",
  minValue: "",
  maxValue: "",
  customer: "",
  flag: ""
};
let salesFollowUpMode = "list";
let salesFollowUpFilter = "";
let salesFollowUpFilterOpen = false;
let salesOrderBookTab = "all";
let salesOrderBookDetailId = "";
let salesOrderBookFiltersOpen = false;
let salesOrderBookFilters = {
  salesPerson: "",
  customer: "",
  dateRange: "",
  startDate: "",
  endDate: "",
  orderStatus: "",
  paymentStatus: "",
  balancePending: ""
};
let salesQuotationDraft = null;
let salesCrmState = null;
let salesCrmLoadedAt = 0;
let salesCrmLoadPromise = null;
let currentUser = null;
let appSettings = null;
let settingsDraft = null;
let inventoryLoadedAt = 0;
let inventoryLoadPromise = null;
const viewDataRefreshMs = 30000;
let thermalChatSelection = {
  mode: "regular",
  capacitySource: "Calculated AC Load",
  familyModel: "",
  customInstruction: "",
  requested: false,
  appendResults: false
};
const defaultThermalColumns = [
  "Indoor", "Room", "Mode", "Family or Model", "Cooling DBT", "Cooling WBT", "Heating T",
  "Tot Cool Cap", "Sens Cool Cap", "Heat Cap", "Air Flow Rate"
];
const paymentTermOptions = ["CDC", "15 Days PDC", "30 Days PDC", "60 Days PDC", "90 Days PDC"];
const defaultPurchaseNotes = `1. Invoice should be attached with delivery note signed by site supervisor.
2. Attach LPO copy along with invoice.
3. Delivery to be made as per schedule instruction provided to you.`;
const quoteVrvTerms = `Warranty:
Units offered are covered under a standard warranty of 12 months from the date of purchase for the whole units and a total of 60 months on compressor against manufacturing defects. The warranty covers the replacement of defective parts and does not include labor charges. Defects caused due to improper installation will void the warranty.

Custom Duties & Taxes:
Only included if specifically mentioned in the proposal. If included, quoted prices are based on the prevailing rate for Custom duty and Taxes. However, if any variation in custom duty and / or other Taxes are imposed by the Federal Government, such variations will be borne by the purchaser.

Inland Freight:
1. In land Freight is included if units are delivered in one lot.
2. Offloading & Rigging at site is not included.

Cancellation:
25% of the material value will become payable in the event of cancellation, prior to the start of manufacturing. After manufacturing has started cancellation will be determined based on costs incurred by us.

Warehouse Fee:
A warehouse fee of 2% will be charged per month for all non-collected and or / non-delivered goods. This charge will become applicable (3) days from the agreed delivery date.

Exclusions:
Installation of AC units, unloading of units at site & supply of items other than mentioned.`;
const quoteFahuNotes = `Notes for FAHU:
1. All major specifications as per Daikin Standards.
2. Access doors are provided as per Daikin Standards.
3. Light & port hole shall be provided for filter and fan section.
4. Differential pressure switch 50-500 Pa shall be provided for each filter section
5. Drive screen shall be provided for all Fan section

Exclusions for FAHU:
1. Sound attenuators or silencers, sand trap louvers, insect screen, damper actuators, Motorized dampers.
2. We have not considered any control valves, thermostats or any kind of DDC or electric control, starters.
3. Any item which is not mentioned specifically in our offer.
4. We are not considering any spares for the units.
5. Unloading, installation, storage and maintenance of equipment's at site.
6. Starter panel and disconnect switch for AHU's.
7. VFD's for fan motors.
8. Special Warranty if any
9. Testing of AHU's
10. Assembly of modular sections of AHUs at site.
11. Modulating control valve installed on return CHW pipe.
12. External Vibration Isolators.
13. BMS connectivity.
14. Performance testing.
15. Thyristor Modulating controls/Controls for heaters if any
16. Starter & DDC control panel for AHUs.
17. EC Motor for AHU/FAHU
18. Spare filters/belts/bearings/Motors for AHU/FAHU

Exclusions for VRV ODU for FAHU:
1. Home Automation system interface
2. Central controller
3. Installation of any systems quoted
4. Copper pipes, insulation, Electrical wires and accessories
5. Refrigerant gas, supply & topping up.
6. Anything that is not mentioned in the BOQ above.`;
const quoteFahuTerms = `Warranty:
Units offered are covered under a standard warranty of 12 months from the date of purchase for the whole units and an additional 48 months on compressor against manufacturing defects. Warranty covers the replacement of defective parts and does not include labor charges. Defects caused due to improper installation will void the warranty.

Exclusions:
Installation of AC units, unloading of units at site & supply of items other than mentioned.`;
const salesCrmData = {
  settings: { nextQuotationNo: `CZ-QTN-${new Date().getFullYear()}-0416`, nextEnquiryNo: `ENQ-${new Date().getFullYear()}-0001`, nextProjectNo: `PRJ-${String(new Date().getFullYear()).slice(-2)}-0001` },
  leads: [
    { id: "L-1001", avatar: "AM", customer: "Mr. Ahmed Mansoor", phone: "+971 50 123 4567", requirement: "Daikin AC Supply & Install", projectType: "Villa Project", location: "Jumeirah 1, Dubai", source: "WhatsApp", status: "New Lead", followUp: "22 Jun 2026", priority: "Overdue" },
    { id: "L-1002", avatar: "SL", customer: "Skyline Logistics", phone: "+971 4 445 2190", requirement: "Warehouse VRV Replacement", projectType: "Commercial", location: "Dubai Investment Park", source: "Website", status: "Contacted", followUp: "24 Jun 2026", priority: "Today" },
    { id: "L-1003", avatar: "PN", customer: "Priya Nair", phone: "+971 55 901 2234", requirement: "Apartment ducted AC service", projectType: "Apartment", location: "JLT, Dubai", source: "Referral", status: "Site Visit", followUp: "25 Jun 2026", priority: "Planned" },
    { id: "L-1004", avatar: "TN", customer: "TechNova Solutions", phone: "+971 4 777 1020", requirement: "Office maintenance contract", projectType: "Commercial", location: "Business Bay, Dubai", source: "Website", status: "Quotation Needed", followUp: "26 Jun 2026", priority: "Planned" }
  ],
  customers: [
    { id: "C-1001", icon: "CO", name: "ABC Contracting LLC", type: "Commercial", contact: "Mr. Sameer Ahmad", role: "Procurement Manager", phone: "+971 50 123 4567", email: "sameer@abccontracting.ae", address: "Business Bay, Dubai", detail: "Tower A, Suite 1402", trn: "100234567890003" },
    { id: "C-1002", icon: "EV", name: "Elite Villas Management", type: "Maintenance", contact: "Fatima Al Sayed", role: "Property Supervisor", phone: "+971 4 888 2345", email: "fatima@elitevillas.ae", address: "Palm Jumeirah, Dubai", detail: "Villa Cluster 6", trn: "100987654320003" },
    { id: "C-1003", icon: "TN", name: "TechNova Solutions", type: "Commercial", contact: "Priya Nair", role: "Admin Manager", phone: "+971 55 612 9911", email: "admin@technova.ae", address: "JLT, Dubai", detail: "Cluster X", trn: "100675430000003" }
  ],
  projects: [
    { id: "P-2026-0042", name: "Villa AC Replacement - Jumeirah", customer: "ABC Contracting", location: "Jumeirah 1, Dubai", type: "Residential", requirement: "Supply & Installation", engineer: "Sarah Johnson", status: "Site Visit Done", date: "12 Oct 2026", value: "AED 128,500" },
    { id: "P-2026-0043", name: "Retail Mall Ducting Service", customer: "Majid Al Futtaim", location: "Mirdif, Dubai", type: "Commercial", requirement: "Repair / Service", engineer: "Michael Chen", status: "Quotation Sent", date: "14 Oct 2026", value: "AED 42,600" },
    { id: "P-2026-0044", name: "Office VRV Maintenance", customer: "TechNova Solutions", location: "JLT, Dubai", type: "Commercial", requirement: "AMC / Maintenance", engineer: "Arjun Singh", status: "Negotiation", date: "16 Oct 2026", value: "AED 88,900" }
  ],
  quotations: [
    { id: "Q-1001", no: "CZ-QTN-2026-0001-R2", revision: "2 Revisions", date: "18 May 2026", customer: "Rahul Mehta", project: "Villa AC Replacement", location: "Dubai Marina, UAE", amount: 125800, status: "Revised" },
    { id: "Q-1002", no: "CZ-QTN-2026-0412", revision: "Fresh Quote", date: "19 May 2026", customer: "GreenLeaf Apartments", project: "Ducted AC Supply", location: "Kondapur", amount: 84200, status: "Sent" },
    { id: "Q-1003", no: "CZ-QTN-2026-0413", revision: "Fresh Quote", date: "20 May 2026", customer: "TechNova Solutions", project: "Office Maintenance", location: "JLT, Dubai", amount: 62000, status: "Approved" }
  ],
  followUps: [
    { id: "F-1001", avatar: "RJ", customer: "Robert Jenkins", phone: "+1 555-0123", project: "HVAC Unit Replacement", quotation: "#QUO-8821", date: "Oct 20, 2026", due: "3 Days Overdue", type: "Call", status: "Overdue" },
    { id: "F-1002", avatar: "SL", customer: "Sarah Lopez", phone: "+1 555-0987", project: "Ductless Mini-Split Install", quotation: "#QUO-8854", date: "Oct 23, 2026", due: "Today @ 2:00 PM", type: "Message", status: "Today" },
    { id: "F-1003", avatar: "MA", customer: "Mr. Ahmed Mansoor", phone: "+971 50 123 4567", project: "Daikin AC Supply & Install", quotation: "CZ-QTN-2026-0415", date: "Oct 25, 2026", due: "Upcoming", type: "Site Visit", status: "Scheduled" }
  ]
};
const debounceSaveProject = debounce(() => saveProject({ auto: true }), 600);

const tableKeys = {
  thermalTable: "thermal",
  costingTable: "costing",
  boqTable: "boq",
  vrvSchedule: "vrvSchedule"
};

const tableDownloadFilenames = {
  thermal: "Export File.xlsx",
  costing: "Costing Sheet.xlsx",
  boq: "BOQ.xlsx",
  vrvSchedule: "VRV Schedule.xlsx"
};

const samplePriceItems = [
  { model: "RXYTQ16U5YF", description: "DAIKIN VRV OUTDOOR UNIT", origin: "TURKEY", boqDescription: "RXYTQ16U5YF - DAIKIN VRV OUTDOOR UNIT - TURKEY", listPrice: 54285, multiplier: 0.5, costPrice: 27142.5, tr: 12.8 },
  { model: "RXYTQ8U5YF", description: "DAIKIN VRV OUTDOOR UNIT", origin: "TURKEY", boqDescription: "RXYTQ8U5YF - DAIKIN VRV OUTDOOR UNIT - TURKEY", listPrice: 30360, multiplier: 0.5, costPrice: 15180, tr: 6.4 },
  { model: "RXYTQ14U5YF", description: "DAIKIN VRV OUTDOOR UNIT", origin: "TURKEY", boqDescription: "RXYTQ14U5YF - DAIKIN VRV OUTDOOR UNIT - TURKEY", listPrice: 52544, multiplier: 0.5, costPrice: 26272, tr: 11.2 },
  { model: "RXYTQ12U5YF", description: "DAIKIN VRV OUTDOOR UNIT", origin: "TURKEY", boqDescription: "RXYTQ12U5YF - DAIKIN VRV OUTDOOR UNIT - TURKEY", listPrice: 43196, multiplier: 0.5, costPrice: 21598, tr: 9.6 },
  { model: "FXSQ25A", description: "DAIKIN VRV INDOOR UNIT- Ducted (medium static)", origin: "CZECH REPUBLIC", boqDescription: "FXSQ25A - DAIKIN VRV INDOOR UNIT- Ducted (medium static) - CZECH REPUBLIC", listPrice: 4498, multiplier: 0.55, costPrice: 2473.9, tr: 0 },
  { model: "FXSQ32A", description: "DAIKIN VRV INDOOR UNIT- Ducted (medium static)", origin: "CZECH REPUBLIC", boqDescription: "FXSQ32A - DAIKIN VRV INDOOR UNIT- Ducted (medium static) - CZECH REPUBLIC", listPrice: 4636, multiplier: 0.55, costPrice: 2549.8, tr: 0 },
  { model: "FXSQ63A", description: "DAIKIN VRV INDOOR UNIT- Ducted (medium static)", origin: "CZECH REPUBLIC", boqDescription: "FXSQ63A - DAIKIN VRV INDOOR UNIT- Ducted (medium static) - CZECH REPUBLIC", listPrice: 5955, multiplier: 0.55, costPrice: 3275.25, tr: 0 },
  { model: "FXSQ80A", description: "DAIKIN VRV INDOOR UNIT- Ducted (medium static)", origin: "CZECH REPUBLIC", boqDescription: "FXSQ80A - DAIKIN VRV INDOOR UNIT- Ducted (medium static) - CZECH REPUBLIC", listPrice: 6136, multiplier: 0.55, costPrice: 3374.8, tr: 0 },
  { model: "FXSQ100A", description: "DAIKIN VRV INDOOR UNIT- Ducted (medium static)", origin: "CZECH REPUBLIC", boqDescription: "FXSQ100A - DAIKIN VRV INDOOR UNIT- Ducted (medium static) - CZECH REPUBLIC", listPrice: 6994, multiplier: 0.55, costPrice: 3846.7, tr: 0 },
  { model: "KHRQ22M20T", description: "DAIKIN REFNETS - IDU", origin: "BELGIUM", boqDescription: "KHRQ22M20T - DAIKIN REFNETS - IDU - BELGIUM", listPrice: 726, multiplier: 0.65, costPrice: 471.9, tr: 0 },
  { model: "KHRQ22M29T9", description: "DAIKIN REFNETS - IDU", origin: "BELGIUM", boqDescription: "KHRQ22M29T9 - DAIKIN REFNETS - IDU - BELGIUM", listPrice: 805, multiplier: 0.65, costPrice: 523.25, tr: 0 },
  { model: "KHRQ22M64T", description: "DAIKIN REFNETS - IDU", origin: "BELGIUM", boqDescription: "KHRQ22M64T - DAIKIN REFNETS - IDU - BELGIUM", listPrice: 1061, multiplier: 0.65, costPrice: 689.65, tr: 0 },
  { model: "KHRQ22M75T", description: "DAIKIN REFNETS - IDU", origin: "BELGIUM", boqDescription: "KHRQ22M75T - DAIKIN REFNETS - IDU - BELGIUM", listPrice: 2223, multiplier: 0.65, costPrice: 1444.95, tr: 0 },
  { model: "BHFQ22P1007", description: "DAIKIN REFNETS - ODU", origin: "BELGIUM", boqDescription: "BHFQ22P1007 - DAIKIN REFNETS - ODU - BELGIUM", listPrice: 1124, multiplier: 0.65, costPrice: 730.6, tr: 0 },
  { model: "BHFQ22P1517", description: "DAIKIN REFNETS - ODU", origin: "BELGIUM", boqDescription: "BHFQ22P1517 - DAIKIN REFNETS - ODU - BELGIUM", listPrice: 2184, multiplier: 0.65, costPrice: 1419.6, tr: 0 },
  { model: "BRC1H82W", description: "DAIKIN WIRED THERMOSTAT (WHITE)", origin: "CHINA", boqDescription: "BRC1H82W - DAIKIN WIRED THERMOSTAT (WHITE) - CHINA", listPrice: 493, multiplier: 0.65, costPrice: 320.45, tr: 0 }
];

const fallbackMaterialRows = [
  ["RXYTQ16U5YF", 2], ["RXYTQ8U5YF", 1], ["RXYTQ14U5YF", 1], ["RXYTQ12U5YF", 3],
  ["FXSQ25A", 9], ["FXSQ32A", 1], ["FXSQ63A", 5], ["FXSQ80A", 5], ["FXSQ100A", 11],
  ["KHRQ22M20T", 3], ["KHRQ22M29T9", 6], ["KHRQ22M64T", 14], ["KHRQ22M75T", 5],
  ["BHFQ22P1007", 2], ["BHFQ22P1517", 1], ["BRC1H82W", 31]
];

const fallbackVrvRows = [
  { system: "VRV-BF", name: "FCU-BF-01", fcu: "FXSQ63A", outdoorName: "", outdoorModel: "" },
  { system: "VRV-BF", name: "FCU-BF-02", fcu: "FXSQ80A", outdoorName: "", outdoorModel: "" },
  { system: "VRV-BF", name: "FCU-BF-03", fcu: "FXSQ100A", outdoorName: "VRV-BF", outdoorModel: "RXYTQ36U5YF" },
  { system: "VRV-BF", name: "FCU-BF-04", fcu: "FXSQ25A", outdoorName: "A", outdoorModel: "RXYTQ12U5YF" },
  { system: "VRV-BF", name: "FCU-BF-05", fcu: "FXSQ80A", outdoorName: "B", outdoorModel: "RXYTQ12U5YF" },
  { system: "VRV-BF", name: "FCU-BF-05", fcu: "FXSQ80A", outdoorName: "C", outdoorModel: "RXYTQ12U5YF" },
  { system: "VRV-GF", name: "FCU-GF-01", fcu: "FXSQ100A", outdoorName: "VRV-GF", outdoorModel: "RXYTQ14U5YF" },
  { system: "VRV-GF", name: "FCU-GF-01", fcu: "FXSQ100A", outdoorName: "A", outdoorModel: "RXYTQ16U5YF" },
  { system: "VRV-GF", name: "FCU-GF-02", fcu: "FXSQ63A", outdoorName: "B", outdoorModel: "RXYTQ8U5YF" }
];

const sampleThermalRows = [
  ["FCU-BF-01", "BASEMENT FLOOR", "A", "FXSQ-A", 24.4, 17.2, 20, 5.6, 4.1, "", 253],
  ["FCU-BF-02", "BASEMENT FLOOR", "A", "FXSQ-A", 24.4, 17.2, 20, 7.1, 5.2, "", 350],
  ["FCU-BF-03", "BASEMENT FLOOR", "A", "FXSQ-A", 24.4, 17.2, 20, 9.0, 6.5, "", 812],
  ["FCU-BF-04", "BASEMENT FLOOR", "A", "FXSQ-A", 24.4, 17.2, 20, 2.2, 1.6, "", 318],
  ["FCU-BF-05", "BASEMENT FLOOR", "A", "FXSQ-A", 24.4, 17.2, 20, 7.1, 5.2, "", 350],
  ["FCU-GF-01", "GROUND FLOOR", "A", "FXSQ-A", 24.4, 17.2, 20, 9.0, 6.5, "", 812],
  ["FCU-GF-02", "GROUND FLOOR", "A", "FXSQ-A", 24.4, 17.2, 20, 5.6, 4.1, "", 253]
];

init();

async function init() {
  bindShell();
  const authenticated = await loadAuth();
  if (!authenticated) return;
  applyRoleAccess();
  if (isPoOnlyUser()) {
    await showPurchaseOrders("list");
    warmViewData();
    return;
  }
  await loadSalesCrm().catch(() => {});
  const url = new URL(location.href);
  const projectId = url.searchParams.get("project");
  if (projectId) {
    await loadProject(projectId);
  } else {
    await showSalesDesk("dashboard");
  }
  warmViewData();
}

function bindShell() {
  $("#newProjectBtn").addEventListener("click", () => {
    if (!canAccessModule("workflow")) return showLockedModuleToast();
    createProject();
  });
  $("#inventoryBtn").addEventListener("click", () => {
    if (!canAccessModule("inventory")) return showLockedModuleToast();
    showInventory("dashboard");
  });
  $("#documentsBtn").addEventListener("click", () => {
    if (!canAccessModule("workflow")) return showLockedModuleToast();
    showDocuments();
  });
  $("#purchaseOrdersBtn").addEventListener("click", () => showPurchaseOrders("form"));
  $("#salesDeskBtn").addEventListener("click", () => {
    if (!canAccessModule("sales")) return showLockedModuleToast();
    showSalesDesk("dashboard");
  });
  $("#settingsBtn").addEventListener("click", () => {
    if (!canAccessModule("settings")) return showLockedModuleToast();
    showSettings();
  });
  $("#logoutBtn").addEventListener("click", logout);
  $("#loginForm").addEventListener("submit", login);
  $("#saveBtn").addEventListener("click", () => saveProject({ manual: true, force: true }));
  $("#addNodeBtn").addEventListener("click", addFileNode);
  $("#zoomOutBtn").addEventListener("click", () => setZoom(canvasZoom - 0.1));
  $("#zoomInBtn").addEventListener("click", () => setZoom(canvasZoom + 0.1));
  $("#zoomFitBtn").addEventListener("click", zoomToFit);
  $("#searchInput").addEventListener("input", debounce(loadProjectList, 150));
  $("#closeChatBtn").addEventListener("click", () => $("#chatPanel").classList.add("hidden"));
  $("#confirmThermalBtn").addEventListener("click", extractThermalFromChat);
  $("#thermalFileInput").addEventListener("change", uploadThermalFromChat);
  $("#thermalChatSendBtn").addEventListener("click", sendThermalChatReply);
  $("#thermalChatReplyInput").addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      sendThermalChatReply();
    }
  });
  document.querySelectorAll("[data-inventory-view]").forEach(button => {
    button.addEventListener("click", () => {
      if (!canAccessModule("inventory")) return showLockedModuleToast();
      showInventory(button.dataset.inventoryView);
    });
  });
  document.querySelectorAll("[data-sales-view]").forEach(button => {
    button.addEventListener("click", () => {
      if (!canAccessModule("sales")) return showLockedModuleToast();
      showSalesDesk(button.dataset.salesView);
    });
  });
  $("#inventoryRoot").addEventListener("click", handleInventoryClick);
  $("#inventoryRoot").addEventListener("input", handleInventoryInput);
  $("#purchaseOrdersRoot").addEventListener("click", handlePurchaseClick);
  $("#purchaseOrdersRoot").addEventListener("input", handlePurchaseInput);
  $("#salesDeskRoot").addEventListener("click", handleSalesClick);
  $("#salesDeskRoot").addEventListener("input", handleSalesInput);
  $("#salesDeskRoot").addEventListener("change", handleSalesChange);
  $("#salesDeskRoot").addEventListener("dragstart", handleSalesLeadBoardDragStart);
  $("#salesDeskRoot").addEventListener("dragover", handleSalesLeadBoardDragOver);
  $("#salesDeskRoot").addEventListener("dragleave", handleSalesLeadBoardDragLeave);
  $("#salesDeskRoot").addEventListener("drop", handleSalesLeadBoardDrop);
  $("#salesDeskRoot").addEventListener("dragend", handleSalesLeadBoardDragEnd);
  $("#settingsRoot").addEventListener("click", handleSettingsClick);
  $("#settingsRoot").addEventListener("input", handleSettingsInput);
  $("#settingsRoot").addEventListener("change", handleSettingsChange);
  window.addEventListener("pointermove", handleDeliveryResizeMove);
  window.addEventListener("pointerup", stopDeliveryResize);
  window.addEventListener("mousemove", handleDeliveryResizeMove);
  window.addEventListener("mouseup", stopDeliveryResize);
}

async function loadAuth() {
  const auth = await api("/api/auth/me").catch(() => ({ user: null, settings: null }));
  currentUser = auth.user;
  appSettings = auth.settings;
  applyAppSettings();
  applyRoleAccess();
  if (!currentUser) {
    showLogin();
    return false;
  }
  hideLogin();
  return true;
}

function showLogin() {
  document.body.classList.remove("auth-pending");
  $("#loginView").classList.remove("hidden");
  document.body.classList.add("login-active");
  applyRoleAccess();
}

function hideLogin() {
  document.body.classList.remove("auth-pending");
  $("#loginView").classList.add("hidden");
  document.body.classList.remove("login-active");
}

async function login(event) {
  event.preventDefault();
  $("#loginMessage").textContent = "";
  try {
    const auth = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: $("#loginEmail").value.trim(), password: $("#loginPassword").value })
    });
    currentUser = auth.user;
    appSettings = auth.settings;
    applyAppSettings();
    applyRoleAccess();
    hideLogin();
    if (isPoOnlyUser()) {
      await showPurchaseOrders("list");
      warmViewData();
      return;
    }
    await loadSalesCrm().catch(() => {});
    const url = new URL(location.href);
    const projectId = url.searchParams.get("project");
    if (projectId) await loadProject(projectId);
    else await showSalesDesk("dashboard");
    warmViewData();
  } catch {
    $("#loginMessage").textContent = "Invalid email or password.";
  }
}

function warmViewData() {
  const run = () => {
    if (!isPoOnlyUser()) loadInventory().catch(error => console.warn(error));
    loadPurchaseOrders().catch(error => console.warn(error));
  };
  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(run, { timeout: 1200 });
  } else {
    setTimeout(run, 300);
  }
}

async function logout() {
  await api("/api/auth/logout", { method: "POST", body: "{}" }).catch(() => {});
  currentUser = null;
  applyRoleAccess();
  showLogin();
}

function isPoOnlyUser() {
  return norm(currentUser?.role) === "POONLY";
}

function canAccessModule(moduleName) {
  if (!isPoOnlyUser()) return true;
  return moduleName === "purchase";
}

function showLockedModuleToast() {
  toast("This login has Purchase Orders access only.");
}

function applyRoleAccess() {
  const poOnly = isPoOnlyUser();
  const lockIds = ["salesDeskBtn", "newProjectBtn", "documentsBtn", "inventoryBtn", "settingsBtn"];
  lockIds.forEach(id => {
    const button = document.getElementById(id);
    if (!button) return;
    button.disabled = poOnly;
    button.classList.toggle("locked-nav", poOnly);
    if (poOnly) button.title = "Locked for PO Only users";
    else button.removeAttribute("title");
  });
  $("#salesDeskSubnav")?.classList.toggle("hidden", poOnly || activeView !== "salesDesk");
  $("#projectSubnav")?.classList.toggle("hidden", poOnly || !["canvas", "documents"].includes(activeView));
  $("#inventorySubnav")?.classList.toggle("hidden", poOnly || activeView !== "inventory");
  $("#purchaseOrdersBtn")?.classList.toggle("active", poOnly && activeView === "purchaseOrders");
}

function applyAppSettings() {
  const company = appSettings?.company || {};
  const brand = document.querySelector(".sidebar .brand");
  if (!brand) return;
  const mark = brand.querySelector(".brand-mark");
  const title = brand.querySelector("strong");
  const subtitle = brand.querySelector("span");
  if (title) title.textContent = company.name || "Comfort Zone";
  if (subtitle) subtitle.textContent = "Daikin Authorized Dealer";
  if (mark) {
    if (company.logoUploadId) {
      mark.innerHTML = `<img src="/api/settings/uploads/${encodeURIComponent(company.logoUploadId)}" alt="">`;
      mark.classList.add("has-logo");
    } else {
      mark.textContent = initialsText(company.name || "CZ").slice(0, 2);
      mark.classList.remove("has-logo");
    }
  }
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: options.body instanceof FormData ? undefined : { "Content-Type": "application/json" },
    credentials: "same-origin",
    ...options
  });
  if (response.status === 401 && path !== "/api/auth/me" && path !== "/api/auth/login") {
    currentUser = null;
    showLogin();
  }
  if (!response.ok) {
    const text = await response.text();
    try {
      const parsed = JSON.parse(text);
      throw new Error(parsed.error || parsed.message || text);
    } catch (error) {
      if (error instanceof SyntaxError) throw new Error(text);
      throw error;
    }
  }
  const type = response.headers.get("content-type") || "";
  return type.includes("application/json") ? response.json() : response.blob();
}

async function createProject() {
  if (!canAccessModule("workflow")) return showPurchaseOrders("list");
  showCanvas();
  if (state) {
    scheduleWorkflowRender({ fit: activeView === "canvas" && !canvas.innerHTML.trim() });
    return;
  }
  canvas.innerHTML = `<div class="workflow-loading-card">Loading workflow...</div>`;
  try {
    workflowDraftPromise = workflowDraftPromise || api("/api/projects?draft=1", { method: "POST", body: "{}" })
      .finally(() => {
        workflowDraftPromise = null;
      });
    state = await workflowDraftPromise;
  } catch (error) {
    canvas.innerHTML = `<div class="workflow-loading-card">Unable to load workflow.</div>`;
    toast(error.message || "Unable to load workflow");
    return;
  }
  projectPersisted = false;
  projectTouched = false;
  if (!state.priceList.items.length) state.priceList.items = structuredClone(samplePriceItems);
  applyCompactLayout(true);
  history.replaceState(null, "", location.pathname);
  scheduleWorkflowRender({ fit: true });
}

async function loadProject(id) {
  if (!canAccessModule("workflow")) return showPurchaseOrders("list");
  state = await api(`/api/projects/${id}`);
  projectPersisted = true;
  projectTouched = false;
  applyCompactLayout(false);
  showCanvas();
  scheduleWorkflowRender({ fit: true });
}

async function saveProject(options = {}) {
  if (!state) return;
  const opts = options && typeof options === "object" ? options : {};
  if (!opts.auto) projectTouched = true;
  if (!projectTouched && !opts.force && !opts.manual) return;
  const workflowStarted = hasWorkflowSourceUpload() || opts.manual;
  if (!workflowStarted && !opts.allowHidden) {
    if (opts.manual) toast("Workflow saved");
    return;
  }
  state.visible = workflowStarted;
  state.title = state.details.project || state.details.customer || "Untitled Project";
  state = await api(`/api/projects/${state.id}`, { method: "PUT", body: JSON.stringify(state) });
  projectPersisted = true;
  projectTouched = false;
  if (state.visible && !new URLSearchParams(location.search).get("project")) {
    history.replaceState(null, "", `?project=${state.id}`);
  }
  if (opts.manual || opts.showToast) toast("Workflow saved");
}

async function ensureProjectSaved(options = {}) {
  projectTouched = true;
  await saveProject({ force: true, allowHidden: !!options.hidden });
}

function scheduleProjectSave() {
  if (!hasWorkflowSourceUpload()) return;
  projectTouched = true;
  debounceSaveProject();
}

function hasWorkflowSourceUpload() {
  if (!state) return false;
  if (state.visible) return true;
  return state.nodes.some(node =>
    (node.id === "thermal-upload" || node.id === "vrv-upload") &&
    node.data &&
    node.data.uploadId
  );
}

async function showDocuments() {
  if (!canAccessModule("workflow")) return showPurchaseOrders("list");
  activeView = "documents";
  setCanvasActionsVisible(false);
  renderViewActions();
  $("#canvasView").classList.add("hidden");
  $("#documentsView").classList.remove("hidden");
  $("#inventoryView").classList.add("hidden");
  $("#purchaseOrdersView").classList.add("hidden");
  $("#salesDeskView").classList.add("hidden");
  $("#settingsView").classList.add("hidden");
  $("#documentsBtn").classList.add("active");
  $("#newProjectBtn").classList.add("active");
  $("#inventoryBtn").classList.remove("active");
  $("#purchaseOrdersBtn").classList.remove("active");
  $("#salesDeskBtn").classList.remove("active");
  $("#settingsBtn").classList.remove("active");
  $("#projectSubnav").classList.remove("hidden");
  $("#inventorySubnav").classList.add("hidden");
  $("#salesDeskSubnav").classList.add("hidden");
  $("#pageTitle").textContent = "My WorkFlows";
  $("#projectMeta").textContent = "Search and reopen saved workflow canvases.";
  await loadProjectList();
}

function showCanvas() {
  if (!canAccessModule("workflow")) return showPurchaseOrders("list");
  activeView = "canvas";
  setCanvasActionsVisible(true);
  renderViewActions();
  $("#documentsView").classList.add("hidden");
  $("#inventoryView").classList.add("hidden");
  $("#purchaseOrdersView").classList.add("hidden");
  $("#salesDeskView").classList.add("hidden");
  $("#settingsView").classList.add("hidden");
  $("#canvasView").classList.remove("hidden");
  $("#newProjectBtn").classList.add("active");
  $("#documentsBtn").classList.remove("active");
  $("#inventoryBtn").classList.remove("active");
  $("#purchaseOrdersBtn").classList.remove("active");
  $("#salesDeskBtn").classList.remove("active");
  $("#settingsBtn").classList.remove("active");
  $("#projectSubnav").classList.remove("hidden");
  $("#inventorySubnav").classList.add("hidden");
  $("#salesDeskSubnav").classList.add("hidden");
}

async function showInventory(screen = "dashboard") {
  if (!canAccessModule("inventory")) return showPurchaseOrders("list");
  activeView = "inventory";
  setCanvasActionsVisible(false);
  inventoryScreen = screen;
  renderViewActions();
  $("#canvasView").classList.add("hidden");
  $("#documentsView").classList.add("hidden");
  $("#inventoryView").classList.remove("hidden");
  $("#purchaseOrdersView").classList.add("hidden");
  $("#salesDeskView").classList.add("hidden");
  $("#settingsView").classList.add("hidden");
  $("#newProjectBtn").classList.remove("active");
  $("#documentsBtn").classList.remove("active");
  $("#inventoryBtn").classList.add("active");
  $("#purchaseOrdersBtn").classList.remove("active");
  $("#salesDeskBtn").classList.remove("active");
  $("#settingsBtn").classList.remove("active");
  $("#projectSubnav").classList.add("hidden");
  $("#inventorySubnav").classList.remove("hidden");
  $("#salesDeskSubnav").classList.add("hidden");
  document.querySelectorAll("[data-inventory-view]").forEach(button => {
    const activeScreen = screen === "supplierAll" ? "supplier" : screen;
    button.classList.toggle("active", button.dataset.inventoryView === activeScreen);
  });
  const topbar = inventoryTopbarConfig();
  if (topbar) {
    $("#pageTitle").innerHTML = `<span>Inventory</span><b>&lt;</b><strong>${escapeHtml(topbar.title)}</strong>`;
    $("#projectMeta").textContent = topbar.subtitle;
  } else {
    $("#pageTitle").textContent = "Inventory";
    $("#projectMeta").textContent = "Quantity-only AC unit stock tracking.";
  }
  const needsInitialInventory = !inventoryState;
  if (needsInitialInventory) await loadInventory().catch(() => {});
  renderInventory();
  if (!needsInitialInventory) refreshInventoryInBackground();
}

async function showPurchaseOrders(screen = "form") {
  activeView = "purchaseOrders";
  setCanvasActionsVisible(false);
  purchaseScreen = screen;
  renderViewActions();
  $("#canvasView").classList.add("hidden");
  $("#documentsView").classList.add("hidden");
  $("#inventoryView").classList.add("hidden");
  $("#purchaseOrdersView").classList.remove("hidden");
  $("#salesDeskView").classList.add("hidden");
  $("#settingsView").classList.add("hidden");
  $("#newProjectBtn").classList.remove("active");
  $("#documentsBtn").classList.remove("active");
  $("#inventoryBtn").classList.remove("active");
  $("#purchaseOrdersBtn").classList.add("active");
  $("#salesDeskBtn").classList.remove("active");
  $("#settingsBtn").classList.remove("active");
  $("#projectSubnav").classList.add("hidden");
  $("#inventorySubnav").classList.add("hidden");
  $("#salesDeskSubnav").classList.add("hidden");
  $("#pageTitle").innerHTML = `Purchase Orders <span class="po-upload-spinner po-title-spinner ${purchaseUploadLoading ? "" : "hidden"}" aria-label="Uploading quotation"></span>`;
  $("#projectMeta").textContent = "Upload a quotation to auto-fill the PO form, or create a purchase order manually.";
  const needsInitialPurchase = !purchaseState;
  if (needsInitialPurchase) await loadPurchaseOrders().catch(() => {});
  if (!purchaseDraft) purchaseDraft = newPurchaseDraft();
  renderPurchaseOrders();
  if (!needsInitialPurchase) refreshPurchaseOrdersInBackground();
}

function refreshPurchaseTitleSpinner() {
  const spinner = document.querySelector(".po-title-spinner");
  if (spinner) spinner.classList.toggle("hidden", !purchaseUploadLoading);
}

function workflowTitleHtml(title) {
  return `${escapeHtml(title || "Workflow")} <span class="po-upload-spinner workflow-title-spinner ${workflowUploadLoading ? "" : "hidden"}" aria-label="Uploading workflow file"></span>`;
}

function setWorkflowTitle(title) {
  $("#pageTitle").innerHTML = workflowTitleHtml(title);
}

function refreshWorkflowTitleSpinner() {
  const spinner = document.querySelector(".workflow-title-spinner");
  if (spinner) spinner.classList.toggle("hidden", !workflowUploadLoading);
}

async function showSalesDesk(screen = "dashboard") {
  if (!canAccessModule("sales")) return showPurchaseOrders("list");
  activeView = "salesDesk";
  setCanvasActionsVisible(false);
  salesDeskScreen = screen;
  renderViewActions();
  $("#canvasView").classList.add("hidden");
  $("#documentsView").classList.add("hidden");
  $("#inventoryView").classList.add("hidden");
  $("#purchaseOrdersView").classList.add("hidden");
  $("#salesDeskView").classList.remove("hidden");
  $("#settingsView").classList.add("hidden");
  $("#newProjectBtn").classList.remove("active");
  $("#documentsBtn").classList.remove("active");
  $("#inventoryBtn").classList.remove("active");
  $("#purchaseOrdersBtn").classList.remove("active");
  $("#salesDeskBtn").classList.add("active");
  $("#settingsBtn").classList.remove("active");
  $("#projectSubnav").classList.add("hidden");
  $("#inventorySubnav").classList.add("hidden");
  $("#salesDeskSubnav").classList.remove("hidden");
  document.querySelectorAll("[data-sales-view]").forEach(button => {
    button.classList.toggle("active", button.dataset.salesView === screen);
  });
  const topbarConfig = salesDeskTopbarConfig();
  document.querySelector(".topbar")?.classList.toggle("quotation-shell", !!topbarConfig);
  if (topbarConfig) {
    $("#pageTitle").innerHTML = `<span>Sales Desk</span><b>&lt;</b><strong>${escapeHtml(topbarConfig.title)}</strong>`;
    $("#projectMeta").textContent = topbarConfig.subtitle;
  } else {
    $("#pageTitle").textContent = "Sales Desk";
    $("#projectMeta").textContent = "CRM workspace from lead to quotation.";
  }
  const needsInitialSales = !salesCrmState;
  if (needsInitialSales) await loadSalesCrm().catch(() => {});
  if (screen === "quotation" && salesQuotationMode === "create" && !inventoryState) {
    loadInventory().then(() => activeView === "salesDesk" && renderSalesDesk()).catch(() => {});
  }
  renderSalesDesk();
  if (!needsInitialSales) refreshSalesCrmInBackground();
}

async function showSettings() {
  if (!canAccessModule("settings")) return showPurchaseOrders("list");
  activeView = "settings";
  setCanvasActionsVisible(false);
  renderViewActions();
  $("#canvasView").classList.add("hidden");
  $("#documentsView").classList.add("hidden");
  $("#inventoryView").classList.add("hidden");
  $("#purchaseOrdersView").classList.add("hidden");
  $("#salesDeskView").classList.add("hidden");
  $("#settingsView").classList.remove("hidden");
  $("#newProjectBtn").classList.remove("active");
  $("#documentsBtn").classList.remove("active");
  $("#inventoryBtn").classList.remove("active");
  $("#purchaseOrdersBtn").classList.remove("active");
  $("#salesDeskBtn").classList.remove("active");
  $("#settingsBtn").classList.add("active");
  $("#projectSubnav").classList.add("hidden");
  $("#inventorySubnav").classList.add("hidden");
  $("#salesDeskSubnav").classList.add("hidden");
  $("#pageTitle").textContent = "Settings";
  $("#projectMeta").textContent = "Admin settings, company details, attachments, and login access.";
  await loadSettings();
  renderSettings();
}

async function loadSettings() {
  const response = await api("/api/settings");
  currentUser = response.user;
  appSettings = response.settings;
  settingsDraft = structuredClone(appSettings);
  applyAppSettings();
}

function renderSettings() {
  const root = $("#settingsRoot");
  if (!isCurrentAdmin()) {
    root.innerHTML = `<div class="inventory-card"><h2>Settings</h2><p class="inventory-muted">Only Admin users can edit company settings and login access.</p></div>`;
    return;
  }
  settingsDraft = settingsDraft || structuredClone(appSettings);
  root.innerHTML = `
    <div class="settings-page">
      <div class="settings-grid">
        ${settingsCompanyCard("company", "Company Details")}
        ${settingsCompanyCard("company2", "Company 2 Details")}
      </div>
      <div class="settings-grid">
        ${settingsAttachmentsCard()}
        ${settingsUsersCard()}
      </div>
    </div>
  `;
}

function isCurrentAdmin() {
  return String(currentUser?.role || "").toLowerCase() === "admin";
}

function settingsCompanyCard(companyKey, title) {
  const company = settingsDraft?.[companyKey] || {};
  return `
    <section class="inventory-card settings-card">
      <div class="inventory-topbar">
        <div><h2>${escapeHtml(title)}</h2><p class="inventory-muted">Used for app branding and company documents.</p></div>
        <button class="primary-button" data-save-company="${companyKey}">Save</button>
      </div>
      <div class="settings-logo-row">
        <div class="settings-logo-preview">${company.logoUploadId ? `<img src="/api/settings/uploads/${encodeURIComponent(company.logoUploadId)}" alt="">` : initialsText(company.name || "CZ").slice(0, 2)}</div>
        <label class="ghost-button settings-upload-button">Upload Logo<input type="file" data-settings-upload-logo="${companyKey}" accept=".png,.jpg,.jpeg,.svg"></label>
      </div>
      <div class="form-grid">
        <label>Company Name<input data-company-key="${companyKey}" data-company-field="name" value="${escapeHtml(company.name || "")}"></label>
        <label>TRN<input data-company-key="${companyKey}" data-company-field="trn" value="${escapeHtml(company.trn || "")}"></label>
        <label>Phone<input data-company-key="${companyKey}" data-company-field="phone" value="${escapeHtml(company.phone || "")}"></label>
        <label>Email<input data-company-key="${companyKey}" data-company-field="email" value="${escapeHtml(company.email || "")}"></label>
        <label>Website<input data-company-key="${companyKey}" data-company-field="website" value="${escapeHtml(company.website || "")}"></label>
        <label class="span-two">Address<textarea data-company-key="${companyKey}" data-company-field="address">${escapeHtml(company.address || "")}</textarea></label>
      </div>
    </section>
  `;
}

function settingsAttachmentsCard() {
  const attachments = settingsDraft?.attachments || [];
  return `
    <section class="inventory-card settings-card">
      <div class="inventory-topbar">
        <div><h2>Attachments</h2><p class="inventory-muted">Upload templates, certificates, letterheads, and company files.</p></div>
        <label class="primary-button settings-upload-button">Attach File<input type="file" data-settings-upload-file></label>
      </div>
      <table class="inventory-table">
        <thead><tr><th>File</th><th>Type</th><th>Size</th><th>Uploaded</th><th>Action</th></tr></thead>
        <tbody>${attachments.map(file => `
          <tr>
            <td><strong>${escapeHtml(file.originalName)}</strong></td>
            <td>${escapeHtml(file.category || "Attachment")}</td>
            <td>${prettyBytes(file.size || 0)}</td>
            <td>${file.createdAt ? new Date(file.createdAt).toLocaleDateString("en-GB") : ""}</td>
            <td>${rowMenu([
              { label: "Preview", action: "settings-preview-file", id: file.id },
              { label: "Delete", action: "settings-delete-file", id: file.id, danger: true }
            ])}</td>
          </tr>`).join("") || `<tr><td colspan="5">No files attached.</td></tr>`}</tbody>
      </table>
    </section>
  `;
}

function settingsUsersCard() {
  const users = settingsDraft?.users || [];
  return `
    <section class="inventory-card settings-card">
      <div class="inventory-topbar">
        <div><h2>Login Access</h2><p class="inventory-muted">Only active users can login with their email and password.</p></div>
        <button class="primary-button" data-add-settings-user>Add User</button>
      </div>
      <table class="inventory-table">
        <thead><tr><th>Name</th><th>Role</th><th>Email</th><th>Status</th><th>Action</th></tr></thead>
        <tbody>${users.map(user => `
          <tr>
            <td><input data-settings-user="${escapeHtml(user.id)}" data-user-field="name" value="${escapeHtml(user.name || "")}"></td>
            <td><select data-settings-user="${escapeHtml(user.id)}" data-user-field="role">${loginRoles.map(role => `<option ${user.role === role ? "selected" : ""}>${role}</option>`).join("")}</select></td>
            <td><input data-settings-user="${escapeHtml(user.id)}" data-user-field="email" value="${escapeHtml(user.email || "")}"></td>
            <td><select data-settings-user="${escapeHtml(user.id)}" data-user-field="active"><option value="true" ${user.active !== false ? "selected" : ""}>Active</option><option value="false" ${user.active === false ? "selected" : ""}>Disabled</option></select></td>
            <td>${rowMenu([
              { label: "Set Password", action: "settings-password-user", id: user.id },
              { label: "Save", action: "settings-save-user", id: user.id },
              { label: "Delete", action: "settings-delete-user", id: user.id, danger: true }
            ])}</td>
          </tr>`).join("")}</tbody>
      </table>
      <div class="settings-new-user hidden" id="settingsNewUser">
        <h3>New User</h3>
        <div class="form-grid">
          <label>Name<input id="settingsNewUserName"></label>
          <label>Role<select id="settingsNewUserRole">${loginRoles.map(role => `<option ${role === "Staff" ? "selected" : ""}>${role}</option>`).join("")}</select></label>
          <label>Email<input id="settingsNewUserEmail" type="email"></label>
          <label>Password<input id="settingsNewUserPassword" type="password"></label>
        </div>
        <div class="inventory-actions"><button class="ghost-button" data-cancel-settings-user>Cancel</button><button class="primary-button" data-save-new-settings-user>Save User</button></div>
      </div>
    </section>
  `;
}

async function handleSettingsClick(event) {
  const target = event.target.closest("button");
  if (!target || !$("#settingsRoot").contains(target)) return;
  if (target.dataset.rowMenu !== undefined) {
    const menu = target.closest(".row-menu").querySelector(".row-menu-list");
    document.querySelectorAll(".row-menu-list").forEach(list => {
      if (list !== menu) list.classList.add("hidden");
    });
    menu.classList.toggle("hidden");
    return;
  }
  if (target.dataset.saveCompany) return saveSettingsCompany(target.dataset.saveCompany);
  if (target.dataset.addSettingsUser !== undefined) {
    $("#settingsNewUser")?.classList.remove("hidden");
    $("#settingsNewUserName")?.focus();
    return;
  }
  if (target.dataset.cancelSettingsUser !== undefined) {
    $("#settingsNewUser")?.classList.add("hidden");
    return;
  }
  if (target.dataset.saveNewSettingsUser !== undefined) return saveNewSettingsUser();
  if (target.dataset.menuAction) {
    document.querySelectorAll(".row-menu-list").forEach(list => list.classList.add("hidden"));
    if (target.dataset.menuAction === "settings-preview-file") return window.open(`/api/settings/uploads/${encodeURIComponent(target.dataset.menuId)}`, "_blank");
    if (target.dataset.menuAction === "settings-delete-file") return deleteSettingsUpload(target.dataset.menuId);
    if (target.dataset.menuAction === "settings-save-user") return saveSettingsUser(target.dataset.menuId);
    if (target.dataset.menuAction === "settings-password-user") return setSettingsUserPassword(target.dataset.menuId);
    if (target.dataset.menuAction === "settings-delete-user") return deleteSettingsUser(target.dataset.menuId);
  }
}

function handleSettingsInput(event) {
  const companyKey = event.target.dataset.companyKey;
  const companyField = event.target.dataset.companyField;
  if (companyKey && companyField) {
    settingsDraft[companyKey] = settingsDraft[companyKey] || {};
    settingsDraft[companyKey][companyField] = event.target.value;
    return;
  }
  const userId = event.target.dataset.settingsUser;
  const userField = event.target.dataset.userField;
  if (userId && userField) {
    const user = settingsDraft.users.find(item => item.id === userId);
    if (!user) return;
    user[userField] = userField === "active" ? event.target.value === "true" : event.target.value;
  }
}

function handleSettingsChange(event) {
  handleSettingsInput(event);
  if (event.target.dataset.settingsUploadLogo) uploadSettingsFile(event.target.files?.[0], "Logo", event.target.dataset.settingsUploadLogo);
  if (event.target.dataset.settingsUploadFile !== undefined) uploadSettingsFile(event.target.files?.[0], "Attachment", "");
}

async function saveSettingsCompany(companyKey) {
  const company = settingsDraft?.[companyKey] || {};
  const response = await api("/api/settings/company", {
    method: "PUT",
    body: JSON.stringify({ companyKey, ...company })
  });
  appSettings = response.settings;
  settingsDraft = structuredClone(appSettings);
  applyAppSettings();
  renderSettings();
  toast("Company settings saved");
}

async function uploadSettingsFile(file, category, companyKey) {
  if (!file) return;
  const form = new FormData();
  form.append("file", file);
  form.append("category", category);
  if (companyKey) form.append("companyKey", companyKey);
  const response = await api("/api/settings/uploads", { method: "POST", body: form });
  appSettings = response.settings;
  settingsDraft = structuredClone(appSettings);
  applyAppSettings();
  renderSettings();
  toast(category === "Logo" ? "Logo uploaded" : "File attached");
}

async function saveSettingsUser(userId, password = "") {
  const user = settingsDraft.users.find(item => item.id === userId);
  if (!user) return;
  const payload = { ...user };
  if (password) payload.password = password;
  const response = await api("/api/settings/users", { method: "POST", body: JSON.stringify(payload) });
  appSettings = response.settings;
  settingsDraft = structuredClone(appSettings);
  renderSettings();
  toast("User saved");
}

async function saveNewSettingsUser() {
  const payload = {
    name: $("#settingsNewUserName").value.trim(),
    role: $("#settingsNewUserRole").value,
    email: $("#settingsNewUserEmail").value.trim(),
    password: $("#settingsNewUserPassword").value
  };
  if (!payload.name || !payload.email || !payload.password) return alert("Name, email, and password are required.");
  const response = await api("/api/settings/users", { method: "POST", body: JSON.stringify(payload) });
  appSettings = response.settings;
  settingsDraft = structuredClone(appSettings);
  renderSettings();
  toast("User added");
}

async function setSettingsUserPassword(userId) {
  const password = prompt("Enter new password for this user:");
  if (!password) return;
  await saveSettingsUser(userId, password);
}

async function deleteSettingsUser(userId) {
  if (!confirm("Delete this login access?")) return;
  const response = await api(`/api/settings/users/${encodeURIComponent(userId)}`, { method: "DELETE" });
  appSettings = response.settings;
  settingsDraft = structuredClone(appSettings);
  renderSettings();
  toast("User deleted");
}

async function deleteSettingsUpload(uploadId) {
  if (!confirm("Delete this attachment?")) return;
  const response = await api(`/api/settings/uploads/${encodeURIComponent(uploadId)}`, { method: "DELETE" });
  appSettings = response.settings;
  settingsDraft = structuredClone(appSettings);
  applyAppSettings();
  renderSettings();
  toast("Attachment deleted");
}

async function loadSalesCrm(options = {}) {
  const force = !!options.force;
  if (!force && salesCrmState && Date.now() - salesCrmLoadedAt < viewDataRefreshMs) return salesCrmState;
  if (salesCrmLoadPromise) return salesCrmLoadPromise;
  salesCrmLoadPromise = api("/api/sales-crm")
    .then(state => {
      salesCrmState = state;
      salesCrmLoadedAt = Date.now();
      return state;
    })
    .finally(() => {
      salesCrmLoadPromise = null;
    });
  return salesCrmLoadPromise;
}

function refreshSalesCrmInBackground() {
  if (!salesCrmState || Date.now() - salesCrmLoadedAt < viewDataRefreshMs) return;
  loadSalesCrm({ force: true })
    .then(() => {
      if (activeView === "salesDesk") renderSalesDesk();
    })
    .catch(error => console.warn(error));
}

function salesData() {
  return salesCrmState || salesCrmData;
}

function salesDeskTopbarConfig() {
  if (activeView !== "salesDesk") return null;
  if (salesDeskScreen === "quotation" && salesQuotationMode === "create") return null;
  const configs = {
    dashboard: {
      title: "Dashboard",
      subtitle: "Overview of leads, quotations, orders, inventory and sales activity.",
      search: "",
      actions: ""
    },
    leads: {
      title: "Leads & Enquiry Pipeline",
      subtitle: "Track HVAC enquiries, quotations, follow-ups and project opportunities.",
      search: "Search by customer, project, enquiry no...",
      actions: `<button class="sales-secondary" data-sales-lead-filter-toggle>Filters</button><button class="sales-primary" data-sales-action="new-lead">+ New Enquiry</button>`
    },
    customers: {
      title: "Customers",
      subtitle: "Customer and company records for the Sales Desk.",
      search: "Search CRM...",
      actions: `<button class="sales-secondary" data-sales-export="customers">Export CSV</button><button class="sales-primary" data-sales-action="add-customer">Add Customer</button>`
    },
    projects: {
      title: "Projects",
      subtitle: "Manage active HVAC projects, BOQ delivery, stock reservation, and project progress.",
      search: "Search by project, customer, location...",
      actions: `<button class="sales-secondary" data-sales-export="projects">Export CSV</button><button class="sales-primary" data-sales-action="new-project">New Project</button>`
    },
    quotation: {
      title: "Quotations",
      subtitle: "Track draft, sent, revised, approved, and lost quotations.",
      search: "Search quotations...",
      actions: `<button class="sales-secondary" data-sales-export="quotations">Export CSV</button><button class="sales-primary" data-sales-action="create-quotation">Create Quotation</button>`
    },
    orderBook: {
      title: "Order Book",
      subtitle: "Track confirmed HVAC orders, job progress, invoices, payments and balance collection.",
      search: "Search by order no, customer, job...",
      actions: `<button class="sales-secondary" data-sales-order-book-filter-toggle>Filters</button><button class="sales-primary" data-sales-action="new-order-book">New Order</button>`
    }
  };
  return configs[salesDeskScreen] || null;
}

function inventoryTopbarConfig() {
  if (activeView !== "inventory") return null;
  const configs = {
    dashboard: {
      title: "Dashboard",
      subtitle: "Simple AC unit stock summary.",
      searchId: "inventorySearch",
      searchValue: inventoryDashboardSearchQuery,
      search: "Search model, description, or DN...",
      actions: `<button class="sales-primary" data-inventory-top-action="upload-dn">Upload DN</button>`
    },
    supplier: {
      title: "Supplier DN",
      subtitle: "Upload, verify, and confirm stock in.",
      searchId: "supplierSearchInput",
      searchValue: "",
      search: "Search DN No, Project Name, Model No",
      actions: `<button class="sales-secondary" data-inventory-top-action="supplier-all">Supplier DN</button><button class="sales-primary" data-inventory-top-action="upload-dn">Upload DN</button>`
    },
    supplierAll: {
      title: "Supplier DN",
      subtitle: "All uploaded and manual stock entries.",
      searchId: "supplierAllSearchInput",
      searchValue: "",
      search: "Search DN No, Project Name, Model No",
      actions: `<button class="sales-secondary" data-inventory-top-action="supplier-latest">Latest 5</button><button class="sales-primary" data-inventory-top-action="upload-dn">Upload DN</button>`
    },
    delivery: {
      title: "Delivery Note",
      subtitle: "Create, manage, and track outbound delivery notes.",
      searchId: "deliverySearchInput",
      searchValue: deliverySearchQuery,
      search: "Search delivery note...",
      actions: `<button class="sales-primary" data-inventory-top-action="add-customer">Add Customer</button><button class="sales-primary" data-inventory-top-action="new-delivery">Create Delivery Note</button><button class="sales-primary" data-inventory-top-action="customer-list">Customer List</button>`
    },
    stock: {
      title: "Stock",
      subtitle: "Manage AC unit model master and view full stock details.",
      searchId: "stockSearchInput",
      searchValue: "",
      search: "Search model or description",
      searchClass: "stock-top-search",
      actions: ""
    }
  };
  return configs[inventoryScreen] || null;
}

function renderSalesDesk() {
  renderViewActions();
  const root = $("#salesDeskRoot");
  const html = {
    dashboard: salesDashboardHtml,
    leads: salesLeadsHtml,
    customers: salesCustomersHtml,
    projects: salesProjectsHtml,
    quotation: salesQuotationHtml,
    orderBook: salesOrderBookHtml,
    followUps: salesFollowUpsHtml
  }[salesDeskScreen];
  root.innerHTML = `<div class="sales-page sales-screen-${salesDeskScreen}">${html ? html() : salesDashboardHtml()}</div>`;
}

function salesPageHeader(title, subtitle, actions = "") {
  if (salesDeskTopbarConfig()) return "";
  return `
    <div class="sales-header">
      <div>
        <h2>${escapeHtml(title)}</h2>
        <p>${escapeHtml(subtitle)}</p>
      </div>
      <div class="sales-header-actions">
        <div class="sales-search"><span>Search</span><input data-sales-search value="${escapeHtml(salesSearchQuery)}" placeholder="Search CRM..."></div>
        ${actions}
      </div>
    </div>
  `;
}

function salesDashboardHtml() {
  const data = salesData();
  const leads = (data.leads || []).map((lead, index) => normalizeSalesLead(lead, index));
  const quotations = data.quotations || [];
  const projects = data.projects || [];
  const orders = salesOrderBookRows();
  const orderStats = salesOrderBookStats(orders);
  const leadStats = salesLeadStats(leads);
  const quotationStats = salesDashboardQuotationStats(quotations);
  const projectStats = salesDashboardProjectStats(projects);
  const inventoryStats = salesDashboardInventoryStats();
  const todayItems = salesDashboardTodayItems({ leads, quotations, projects, orders });
  const quotePendingPct = salesDashboardPercent(leadStats.quotePending, Math.max(leads.length, 1));
  const fullyPaidOrders = orders.filter(order => norm(order.paymentStatus) === "FULLYPAID").length;
  const paymentPendingPct = salesDashboardPercent(orderStats.totalOrders ? orderStats.totalOrders - fullyPaidOrders : 0, Math.max(orderStats.totalOrders, 1));
  const installationPending = projects.filter(project => norm(project.status).includes("INSTALLATION")).length;
  const completedProjects = projects.filter(project => ["COMPLETED", "CLOSED", "JOBINHAND"].includes(norm(project.status))).length;
  return `
    ${salesPageHeader("Dashboard", "Overview of leads, quotations, orders, inventory and sales activity.", `<button class="sales-secondary" data-sales-export="leads">Export CSV</button><button class="sales-primary" data-sales-action="new-lead">+ New Enquiry</button>`)}
    <div class="sales-dashboard-kpis">
      ${salesDashboardKpi("Open Enquiries", leadStats.open, "Active enquiries", "blue")}
      ${salesDashboardKpi("Quotation Pending", leadStats.quotePending, "Quotes not prepared", "orange")}
      ${salesDashboardKpi("Total Orders", orderStats.totalOrders, "Confirmed orders", "blue")}
      ${salesDashboardKpi("Payment Received", salesCompactMoney(orderStats.received), "Including VAT", "green")}
      ${salesDashboardKpi("Active Projects", projectStats.active, "In progress", "purple")}
      ${salesDashboardKpi("Total Stock Units", inventoryStats.totalStockUnits, "All AC Units in Stock", "red")}
    </div>
    <div class="sales-dashboard-layout">
      <div class="sales-dashboard-main">
        <div class="sales-dashboard-card-grid">
          ${salesDashboardListCard("Leads & Enquiries", [
            ["New Enquiries", leadStats.open],
            ["Follow-up Due", leadStats.followDue],
            ["Tender Jobs", leads.filter(lead => lead.status === "Tender").length],
            ["Pipeline Value", salesCompactMoney(leadStats.pipelineValue)]
          ], "View All Enquiries", "leads")}
          ${salesDashboardQuotationCard(quotationStats)}
          ${salesDashboardListCard("Active Projects", [
            ["Ongoing", projectStats.ongoing],
            ["Site Visit Done", projectStats.siteVisit],
            ["Negotiation", projectStats.negotiation],
            ["Quotation Sent", projectStats.quotationSent]
          ], "View All Projects", "projects")}
          ${salesDashboardInventoryCard(inventoryStats)}
        </div>
      </div>
      <aside class="sales-dashboard-today sales-card">
        <div class="sales-card-title"><h3>Today</h3></div>
        <div class="sales-timeline sales-activity-timeline">
          ${todayItems.map(item => `
            <div>
              <span class="sales-activity-dot ${escapeHtml(item.tone)}"></span>
              <strong>${escapeHtml(item.label)}</strong>
              <span>${escapeHtml(item.title)}</span>
              <small>${escapeHtml(item.detail)}</small>
            </div>`).join("") || `<p class="inventory-muted">No activity today.</p>`}
        </div>
      </aside>
    </div>
    <section class="sales-card sales-quick-status">
      <h3>Quick Status Breakdown</h3>
      <div>
        ${salesDashboardProgress("Quotation Pending", quotePendingPct, `${leadStats.quotePending} of ${leads.length}`)}
        ${salesDashboardProgress("Payment Pending", paymentPendingPct, `${orderStats.totalOrders - fullyPaidOrders} of ${orderStats.totalOrders}`, "red")}
        ${salesDashboardProgress("Installation Pending", salesDashboardPercent(installationPending, Math.max(projects.length, 1)), `${installationPending} of ${projects.length}`, "blue")}
        ${salesDashboardProgress("Completed Projects", salesDashboardPercent(completedProjects, Math.max(projects.length, 1)), `${completedProjects} of ${projects.length}`, "green")}
      </div>
    </section>
  `;
}

function salesDashboardKpi(label, value, caption, tone = "blue") {
  return `
    <article class="sales-dashboard-kpi ${tone}">
      <div class="pipeline-kpi-icon">${salesPipelineKpiIcon(label)}</div>
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(String(value))}</strong>
      <small>${escapeHtml(caption)}</small>
    </article>
  `;
}

function salesDashboardListCard(title, rows, buttonLabel, view) {
  return `
    <section class="sales-card sales-dashboard-module">
      <div class="sales-card-title"><h3>${escapeHtml(title)}</h3><button data-sales-goto="${escapeHtml(view)}">›</button></div>
      <div class="sales-dashboard-list">
        ${rows.map(([label, value], index) => `<div><span class="sales-dot dot-${index + 1}"></span><strong>${escapeHtml(label)}</strong><b>${escapeHtml(String(value))}</b></div>`).join("")}
      </div>
      <button class="sales-card-link" data-sales-goto="${escapeHtml(view)}">${escapeHtml(buttonLabel)}</button>
    </section>
  `;
}

function salesDashboardQuotationCard(stats) {
  return `
    <section class="sales-card sales-dashboard-module">
      <div class="sales-card-title"><h3>Quotations</h3><button data-sales-goto="quotation">›</button></div>
      <div class="sales-dashboard-mini-grid">
        ${["Draft", "Sent", "Revised", "Approved", "Lost"].map(status => `<div class="${status.toLowerCase()}"><span>${status}</span><strong>${stats[status.toLowerCase()] || 0}</strong></div>`).join("")}
      </div>
      <button class="sales-card-link" data-sales-goto="quotation">View All Quotations</button>
    </section>
  `;
}

function salesDashboardInventoryCard(stats) {
  return `
    <section class="sales-card sales-dashboard-module">
      <div class="sales-card-title"><h3>Inventory</h3><button data-go-inventory="dashboard">›</button></div>
      <div class="sales-dashboard-mini-grid inventory-mini">
        <div><span>Total Models</span><strong>${stats.totalModels}</strong></div>
        <div><span>Total Stock Units</span><strong>${stats.totalStockUnits}</strong></div>
        <div><span>Recent Stock In</span><strong class="success-text">${stats.recentIn}</strong></div>
        <div><span>Recent Stock Out</span><strong class="danger-text">${stats.recentOut}</strong></div>
      </div>
      <button class="sales-card-link" data-go-inventory="dashboard">Open Inventory</button>
    </section>
  `;
}

function salesDashboardProgress(label, percent, caption, tone = "orange") {
  const safePercent = Math.max(0, Math.min(100, Number(percent) || 0));
  return `
    <div class="sales-progress-item ${tone}">
      <div><strong>${escapeHtml(label)}</strong><span>${safePercent.toFixed(0)}%</span></div>
      <i><b style="width:${safePercent}%"></b></i>
      <small>${escapeHtml(caption)}</small>
    </div>
  `;
}

function salesDashboardQuotationStats(quotations = []) {
  return quotations.reduce((stats, quote) => {
    const key = norm(quote.status);
    if (key.includes("DRAFT")) stats.draft += 1;
    else if (key.includes("REVISED")) stats.revised += 1;
    else if (key.includes("APPROVED") || key.includes("WON") || key.includes("CONFIRMED")) stats.approved += 1;
    else if (key.includes("LOST")) stats.lost += 1;
    else if (isSentQuotationStatus(quote)) stats.sent += 1;
    return stats;
  }, { draft: 0, sent: 0, revised: 0, approved: 0, lost: 0 });
}

function salesDashboardProjectStats(projects = []) {
  const active = projects.filter(project => !["COMPLETED", "CLOSED", "LOST"].includes(norm(project.status)));
  return {
    active: active.length,
    ongoing: projects.filter(project => ["ONGOING", "ORDERCONFIRMED", "MATERIALPENDING"].some(status => norm(project.status).includes(status))).length,
    siteVisit: projects.filter(project => norm(project.status).includes("SITEVISIT")).length,
    negotiation: projects.filter(project => norm(project.status).includes("NEGOTIATION")).length,
    quotationSent: projects.filter(project => norm(project.status).includes("QUOTATIONSENT")).length
  };
}

function salesDashboardInventoryStats() {
  const dashboard = inventoryState?.dashboard || {};
  const stock = dashboard.stock || [];
  return {
    totalModels: stock.length,
    totalStockUnits: stock.reduce((sum, item) => sum + Number(item.qty || 0), 0),
    recentIn: (dashboard.recentIn || []).length,
    recentOut: (dashboard.recentOut || []).length
  };
}

function salesDashboardTodayItems({ leads = [], quotations = [], projects = [], orders = [] } = {}) {
  const today = todaySalesDateInput();
  const items = [];
  leads.forEach(lead => {
    if (formatSalesDateInput(lead.receivedDate) === today) items.push({ label: "Enquiry", title: lead.enquiryNo, detail: lead.customer || lead.projectDescription, tone: "blue" });
  });
  quotations.forEach(quote => {
    if (formatSalesDateInput(quote.date) === today) items.push({ label: "Quotation", title: quote.no || quote.quotationNo || "Quotation", detail: quote.customer || quote.project || "", tone: "purple" });
  });
  orders.forEach(order => {
    if (formatSalesDateInput(order.date) === today) items.push({ label: "Order Book", title: order.orderNo, detail: order.customer || order.jobDescription || "", tone: "green" });
  });
  projects.forEach(project => {
    if (formatSalesDateInput(project.date) === today) items.push({ label: "Project", title: project.name, detail: project.customer || project.location || "", tone: "orange" });
  });
  return items.slice(0, 8);
}

function salesDashboardPercent(value, total) {
  return total ? (Number(value || 0) / total) * 100 : 0;
}

function isSentQuotationStatus(quote) {
  return ["SENT", "QUOTATIONSENT", "AWAITINGRESPONSE", "NEGOTIATION"].includes(norm(quote?.status));
}

function isWonQuotationStatus(quote) {
  return ["APPROVED", "WON", "CONFIRMED"].includes(norm(quote?.status));
}

function salesKpi(label, value, trend, caption, tone = "") {
  return `
    <article class="sales-kpi ${tone}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <small>${escapeHtml(trend)} ${escapeHtml(caption)}</small>
    </article>
  `;
}

function salesLeadsHtml() {
  const rawRows = salesData().leads || [];
  const normalizedRows = rawRows.map((lead, index) => normalizeSalesLead(lead, index));
  const searchedRows = salesLeadSearch(normalizedRows);
  const filteredRows = salesLeadAdvancedFilter(searchedRows);
  const mainRows = salesLeadViewMode === "board" || salesLeadShowsClosedRows() ? filteredRows : filteredRows.filter(lead => !salesLeadIsClosedStatus(lead));
  const rows = salesLeadViewMode === "board" ? mainRows.filter(lead => !salesLeadIsLostStatus(lead)) : salesLeadTabFilter(mainRows);
  if (salesLeadViewMode === "split" && !salesLeadDetailId && rows.length) salesLeadDetailId = rows[0].id;
  const selected = salesLeadDetailId ? normalizedRows.find(lead => lead.id === salesLeadDetailId) : null;
  const stats = salesLeadStats(normalizedRows);
  const detailOpen = salesLeadViewMode === "table" && !!selected && !!salesLeadDetailId;
  return `
    <section class="sales-leads-page">
      <div class="pipeline-header">
        <div>
          <h2>Leads &amp; Enquiry Pipeline</h2>
          <p>Track HVAC enquiries, quotations, follow-ups and project opportunities.</p>
        </div>
        <div class="pipeline-actions">
          <div class="pipeline-search"><input data-sales-search value="${escapeHtml(salesSearchQuery)}" placeholder="Search by customer, project, enquiry no..."><span>Search</span></div>
          <button class="sales-secondary" data-sales-lead-filter-toggle>Filters</button>
          <button class="sales-primary" data-sales-action="new-lead">+ New Enquiry</button>
        </div>
      </div>
      <div class="pipeline-kpis">
        ${salesPipelineKpi("Open Enquiries", stats.open, "Active enquiries", "blue")}
        ${salesPipelineKpi("Quotation Pending", stats.quotePending, "Quotes not prepared", "orange")}
        ${salesPipelineKpi("Follow-ups Due", stats.followDue, "Due this week", "purple")}
        ${salesPipelineKpi("Pipeline Value", salesCompactNumber(stats.pipelineValue), "Total estimated value (AED)", "green")}
        ${salesPipelineKpi("Job in Hand Value", salesCompactNumber(stats.jobInHandValue), "Confirmed jobs (AED)", "blue")}
        ${salesPipelineKpi("Tender Value", salesCompactNumber(stats.tenderValue), "Tender stage value (AED)", "orange")}
      </div>
      ${salesLeadFiltersOpen ? salesLeadFilterPanel() : ""}
      <div class="pipeline-body ${detailOpen ? "has-detail" : ""} ${salesLeadViewMode !== "table" ? `lead-view-${salesLeadViewMode}` : ""}">
        <section class="pipeline-table-card">
          <div class="pipeline-tabs-row">
            <div class="pipeline-tabs">
              ${salesLeadTabButton("all", "All Enquiries")}
              ${salesLeadTabButton("quotePending", "Quotation Pending")}
              ${salesLeadTabButton("followDue", "Follow-up Due")}
              ${salesLeadTabButton("tender", "Tender Jobs")}
              ${salesLeadTabButton("jobInHand", "Job in Hand")}
              ${salesLeadTabButton("lost", "Lost / Closed")}
            </div>
            <div class="lead-view-switcher">
              ${salesLeadViewButton("table", "Table")}
              ${salesLeadViewButton("split", "Split")}
              ${salesLeadViewButton("board", "Board")}
            </div>
          </div>
          ${salesLeadViewMode === "split" ? salesLeadSplitViewHtml(rows, selected) : salesLeadViewMode === "board" ? salesLeadBoardViewHtml(rows) : salesLeadTableViewHtml(rows)}
          <div class="pipeline-footer">Showing ${rows.length} of ${normalizedRows.length} enquiries</div>
        </section>
        ${detailOpen ? salesLeadDetailPanel(selected) : ""}
      </div>
    </section>
  `;
}

function salesPipelineKpi(label, value, caption, tone = "blue") {
  return `
    <article class="pipeline-kpi ${tone}">
      <div class="pipeline-kpi-icon">${salesPipelineKpiIcon(label)}</div>
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(String(value))}</strong>
      <small>${escapeHtml(caption)}</small>
    </article>
  `;
}

function salesPipelineKpiIcon(label) {
  const key = norm(label);
  if (key.includes("QUOTATION")) return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h7l4 4v14H7z"/><path d="M14 3v5h5"/></svg>`;
  if (key.includes("FOLLOW")) return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4v3M17 4v3M4 9h16M6 6h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z"/><path d="M15 14h3v3"/></svg>`;
  if (key.includes("PIPELINE")) return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19V5"/><path d="M4 19h16"/><path d="m7 15 4-4 3 3 5-7"/><path d="M16 7h3v3"/></svg>`;
  if (key.includes("JOB")) return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1"/><path d="M4 8h16v11H4z"/><path d="M4 13h16"/></svg>`;
  if (key.includes("TENDER")) return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5h8v14H8z"/><path d="M10 9h4M10 13h4"/><path d="m16 17 4 4"/></svg>`;
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h14v10H5z"/><path d="M8 8V6h8v2"/><path d="M8 13h8"/></svg>`;
}

function salesLeadRow(lead) {
  const customerLines = [lead.contactName, lead.contactNumber].filter(Boolean).map(value => `<span>${escapeHtml(value)}</span>`).join("");
  return `
    <tr class="${lead.id === salesLeadDetailId ? "selected" : ""}" data-sales-lead-row="${escapeHtml(lead.id)}">
      <td><button class="pipeline-link" data-sales-action="view-lead" data-sales-id="${escapeHtml(lead.id)}">${escapeHtml(lead.enquiryNo)}</button><br><span>${escapeHtml(lead.receivedDate)}</span></td>
      <td><div class="pipeline-cell-stack"><strong class="pipeline-customer">${escapeHtml(lead.customer)}</strong>${customerLines}</div></td>
      <td><strong>${escapeHtml(lead.projectDescription)}</strong><br><span>${escapeHtml(lead.plotNo || lead.location)}</span></td>
      <td>${salesProductBadge(lead.productType)}</td>
      <td>${salesBadge(lead.status)}</td>
      <td>${lead.estimatedValue ? Number(lead.estimatedValue).toLocaleString("en-US") : ""}</td>
      <td>${escapeHtml(lead.salesPerson)}</td>
      <td>
        <div class="pipeline-row-actions">
          <button title="View" data-sales-action="view-lead" data-sales-id="${escapeHtml(lead.id)}">View</button>
          <button title="Edit" data-sales-action="edit-lead" data-sales-id="${escapeHtml(lead.id)}">Edit</button>
          ${rowMenu([
            { label: "Create Quote", action: "lead-quote", id: lead.id },
            { label: "Create Customer", action: "lead-to-customer", id: lead.id },
            { label: "Create Workflow", action: "lead-create-workflow", id: lead.id },
            { label: "Add Follow-up", action: "lead-add-follow-up", id: lead.id },
            { label: "Delete", action: "delete-lead", id: lead.id, danger: true }
          ])}
        </div>
      </td>
    </tr>
  `;
}

function salesLeadTableViewHtml(rows) {
  return `
    <div class="pipeline-table-wrap">
      <table class="sales-table sales-pipeline-table">
        <thead><tr><th>Enquiry No</th><th>Customer / Contractor</th><th>Project / Description</th><th>Product Type</th><th>Status</th><th>Value (AED)</th><th>Sales Person</th><th>Actions</th></tr></thead>
        <tbody>${rows.map(lead => salesLeadRow(lead)).join("") || `<tr><td colspan="8" class="pipeline-empty">No enquiries found.</td></tr>`}</tbody>
      </table>
    </div>
  `;
}

function salesLeadViewButton(mode, label) {
  return `<button class="${salesLeadViewMode === mode ? "active" : ""}" data-sales-lead-view="${escapeHtml(mode)}">${salesPipelineSmallIcon(mode)}${escapeHtml(label)}</button>`;
}

function salesPipelineSmallIcon(mode) {
  if (mode === "split") return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h7v14H4z"/><path d="M13 5h7v14h-7z"/></svg>`;
  if (mode === "board") return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h4v14H4z"/><path d="M10 5h4v14h-4z"/><path d="M16 5h4v14h-4z"/></svg>`;
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16"/><path d="M4 12h16"/><path d="M4 19h16"/><path d="M8 5v14"/></svg>`;
}

function salesLeadSplitViewHtml(rows, selected) {
  return `
    <div class="lead-split-view">
      <div class="lead-split-list">
        <div class="lead-split-search"><span>Search</span><input data-sales-search value="${escapeHtml(salesSearchQuery)}" placeholder="Search enquiries"></div>
        <div class="lead-split-items">
          ${rows.map(lead => salesLeadSplitItem(lead)).join("") || `<div class="pipeline-empty">No enquiries found.</div>`}
        </div>
      </div>
      <div class="lead-split-detail">
        ${selected ? salesLeadSplitDetailHtml(selected) : `<div class="pipeline-empty">Select an enquiry to view details.</div>`}
      </div>
    </div>
  `;
}

function salesLeadSplitItem(lead) {
  return `
    <button class="lead-split-item ${lead.id === salesLeadDetailId ? "active" : ""}" data-sales-lead-select="${escapeHtml(lead.id)}">
      <span class="lead-card-icon">${salesPipelineKpiIcon("Open Enquiries")}</span>
      <span class="lead-split-item-main">
        <strong>${escapeHtml(lead.enquiryNo)}</strong>
        <b>${escapeHtml(lead.customer || "-")}</b>
        <small>${escapeHtml(lead.projectDescription || "-")}</small>
      </span>
      <span class="lead-split-item-meta">
        ${salesProductBadge(lead.productType)}
        ${salesBadge(lead.status)}
        <small>${escapeHtml(lead.receivedDate || "")}</small>
      </span>
    </button>
  `;
}

function salesLeadBoardViewHtml(rows) {
  const groups = salesLeadBoardGroups();
  return `
    <div class="lead-board-view">
      ${groups.map(group => {
        const groupRows = rows.filter(lead => salesLeadBoardGroupKey(lead) === group.key);
        return `
          <section class="lead-board-column ${escapeHtml(group.tone)}" data-lead-board-drop="${escapeHtml(group.key)}" data-lead-board-status="${escapeHtml(group.status)}">
            <div class="lead-board-column-head">
              <h4>${escapeHtml(group.label)}</h4>
              <span>${groupRows.length}</span>
            </div>
            <div class="lead-board-cards">
              ${groupRows.map(lead => salesLeadBoardCard(lead)).join("") || `<div class="lead-board-empty">No enquiries</div>`}
            </div>
          </section>
        `;
      }).join("")}
    </div>
  `;
}

function salesLeadBoardGroups() {
  return [
    { key: "new", label: "1. New Enquiry", tone: "blue", status: "New Enquiry" },
    { key: "quote", label: "2. Quote Sent", tone: "orange", status: "Quote Sent" },
    { key: "follow", label: "3. Follow-up Due", tone: "purple", status: "Follow-up" },
    { key: "negotiation", label: "4. Negotiation", tone: "green", status: "Negotiation" },
    { key: "order", label: "5. Order Received", tone: "blue", status: "Order Received" },
    { key: "closed", label: "6. Closed", tone: "gray", status: "Completed" }
  ];
}

function salesLeadBoardGroupKey(lead) {
  const status = norm(normalizeLeadStatus(lead.status));
  if (salesLeadIsLostStatus(lead)) return "hidden";
  if (["COMPLETED", "CLOSED", "ONHOLD"].includes(status)) return "closed";
  if (["NEWENQUIRY", "SELECTIONPENDING", "QUOTEPENDING"].includes(status)) return "new";
  if (["QUOTESENT", "QUOTATIONSENT"].includes(status)) return "quote";
  if (["FOLLOWUP", "FOLLOWUPDUE", "REVISIONREQUIRED"].includes(status)) return "follow";
  if (["NEGOTIATION", "TENDER", "JOBINHAND"].includes(status)) return "negotiation";
  if (status === "ORDERRECEIVED") return "order";
  return "new";
}

function salesLeadBoardCard(lead) {
  return `
    <article class="lead-board-card" draggable="true" data-lead-board-card="${escapeHtml(lead.id)}">
      <div class="lead-board-card-head">
        <button class="pipeline-link" data-sales-action="view-lead" data-sales-id="${escapeHtml(lead.id)}">${escapeHtml(lead.enquiryNo)}</button>
        ${rowMenu([
          { label: "View", action: "view-lead", id: lead.id },
          { label: "Edit", action: "edit-lead", id: lead.id },
          { label: "Create Quote", action: "lead-quote", id: lead.id },
          { label: "Add Follow-up", action: "lead-add-follow-up", id: lead.id },
          { label: "Delete", action: "delete-lead", id: lead.id, danger: true }
        ])}
      </div>
      <strong>${escapeHtml(lead.customer || "-")}</strong>
      <p>${escapeHtml(lead.projectDescription || "-")}</p>
      <div class="lead-board-tags">${salesProductBadge(lead.productType)}${salesBadge(lead.status)}</div>
      <div class="lead-board-meta">
        <span>${lead.estimatedValue ? `${Number(lead.estimatedValue).toLocaleString("en-US")} AED` : "-"}</span>
        <span>${escapeHtml(lead.receivedDate || "-")}</span>
        <span>${escapeHtml(lead.salesPerson || "-")}</span>
        <span>${escapeHtml(lead.contactNumber || "-")}</span>
      </div>
    </article>
  `;
}

function salesLeadSplitDetailHtml(lead) {
  return `
    <div class="lead-split-detail-head">
      <span class="lead-card-icon">${salesPipelineKpiIcon("Open Enquiries")}</span>
      <div>
        <h3>${escapeHtml(lead.enquiryNo)}</h3>
        <p>Last updated: ${escapeHtml(lead.lastUpdated || lead.receivedDate)}${lead.updatedBy ? ` by ${escapeHtml(lead.updatedBy)}` : ""}</p>
      </div>
      ${salesBadge(lead.status)}
    </div>
    <div class="lead-split-detail-grid">
      ${salesLeadSplitInfoCard("Enquiry Information", [
        ["Sales Person", lead.salesPerson],
        ["S. No", lead.sNo],
        ["Enquiry No", lead.enquiryNo],
        ["Date Enquiry Received", lead.receivedDate],
        ["Date Enquiry Quoted", lead.quotedDate],
        ["Quote No", lead.quoteNo],
        ["Selection & Quote Prepared By", lead.preparedBy]
      ])}
      ${salesLeadSplitInfoCard("Customer & Project", [
        ["Customer", lead.customer],
        ["Project / Description", lead.projectDescription],
        ["Plot No", lead.plotNo],
        ["Client", lead.client],
        ["Main Contractor", lead.mainContractor],
        ["Consultant", lead.consultant],
        ["AC Contractor", lead.acContractor],
        ["Contact Name", lead.contactName],
        ["Contact Number", lead.contactNumber]
      ])}
      ${salesLeadSplitInfoCard("Product & Commercial", [
        ["Product Type", lead.productType],
        ["Scope", lead.scope],
        ["Status", lead.status],
        ["Tentative Finalizing Month", lead.finalizingMonth],
        ["Estimated Value (AED)", lead.estimatedValue ? Number(lead.estimatedValue).toLocaleString("en-US") : ""],
        ["Daikin Purchase Value (AED)", lead.daikinPurchaseValue ? Number(lead.daikinPurchaseValue).toLocaleString("en-US") : ""],
        ["Competitors", lead.competitors]
      ])}
      <section class="lead-split-info-card lead-split-history-card">
        <h4>Follow-up History</h4>
        <table>
          <colgroup><col><col><col></colgroup>
          <thead><tr><th>Date</th><th>Type</th><th>Note</th></tr></thead>
          <tbody>
            ${(lead.followUps || []).map((item, index) => `<tr><td>${escapeHtml(item.date || "-")}</td><td>${escapeHtml(item.type || "-")}</td><td>${escapeHtml(item.note || "-")}<button class="lead-follow-delete" data-sales-action="delete-lead-follow-up" data-sales-id="${escapeHtml(lead.id)}" data-follow-index="${index}" title="Delete follow-up">x</button></td></tr>`).join("") || `<tr><td colspan="3">No follow-up history yet.</td></tr>`}
          </tbody>
        </table>
      </section>
      ${salesLeadSplitInfoCard("Next Follow-up", [
        ["Next Follow-up Date", lead.nextFollowUpDate],
        ["Follow-up Type", lead.followUpType],
        ["Follow-up Note", lead.followUpNote],
        ["Priority", lead.priority]
      ], "lead-split-next-card")}
    </div>
    <div class="lead-split-actions">
      <button class="sales-secondary" data-sales-action="edit-lead" data-sales-id="${escapeHtml(lead.id)}">Edit Enquiry</button>
      <button class="sales-secondary" data-sales-action="lead-add-follow-up" data-sales-id="${escapeHtml(lead.id)}">Add Follow-up</button>
      <button class="sales-primary" data-sales-action="lead-quote" data-sales-id="${escapeHtml(lead.id)}">Create Quotation</button>
    </div>
  `;
}

function salesLeadSplitInfoCard(title, rows, extraClass = "") {
  return `
    <section class="lead-split-info-card ${escapeHtml(extraClass)}">
      <h4>${escapeHtml(title)}</h4>
      <dl>${rows.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value || "-")}</dd></div>`).join("")}</dl>
    </section>
  `;
}

function salesLeadDetailPanel(lead) {
  return `
    <aside class="pipeline-detail">
      ${salesLeadDetailContent(lead)}
    </aside>
  `;
}

function salesLeadDetailContent(lead, options = {}) {
  const close = options.close !== false;
  return `
      <div class="pipeline-detail-head">
        <div class="pipeline-detail-title">
          <h3>${escapeHtml(lead.enquiryNo)}</h3>
          ${salesBadge(lead.status)}
        </div>
        ${close ? `<button class="mini-button" data-sales-action="close-lead-detail">X</button>` : ""}
      </div>
      <div class="pipeline-detail-meta">
        <p>Last updated: ${escapeHtml(lead.lastUpdated || lead.receivedDate)}${lead.updatedBy ? ` by ${escapeHtml(lead.updatedBy)}` : ""}</p>
        <div class="pipeline-detail-actions">
          ${rowMenu([
            { label: "View", action: "view-lead", id: lead.id },
            { label: "Edit", action: "edit-lead", id: lead.id },
            { label: "Create Quote", action: "lead-quote", id: lead.id },
            { label: "Add Follow-up", action: "lead-add-follow-up", id: lead.id },
            { label: "More", action: "lead-more", id: lead.id }
          ])}
        </div>
      </div>
      ${salesDetailSection("Enquiry Information", [
        ["Sales Person", lead.salesPerson],
        ["S. No", lead.sNo],
        ["Enquiry No", lead.enquiryNo],
        ["Date Enquiry Received", lead.receivedDate],
        ["Date Enquiry Quoted", lead.quotedDate],
        ["Quote No", lead.quoteNo],
        ["Selection & Quote Prepared By", lead.preparedBy]
      ])}
      ${salesDetailSection("Customer & Project", [
        ["Customer", lead.customer],
        ["Project / Description", lead.projectDescription],
        ["Plot No", lead.plotNo],
        ["Client", lead.client],
        ["Main Contractor", lead.mainContractor],
        ["Consultant", lead.consultant],
        ["AC Contractor", lead.acContractor],
        ["Contact Name", lead.contactName],
        ["Contact Number", lead.contactNumber]
      ])}
      ${salesDetailSection("Product & Commercial", [
        ["Product Type", lead.productType],
        ["Scope", lead.scope],
        ["Status", lead.status],
        ["Tentative Finalizing Month", lead.finalizingMonth],
        ["Estimated Value (AED)", lead.estimatedValue ? Number(lead.estimatedValue).toLocaleString("en-US") : ""],
        ["Daikin Purchase Value (AED)", lead.daikinPurchaseValue ? Number(lead.daikinPurchaseValue).toLocaleString("en-US") : ""],
        ["Competitors", lead.competitors]
      ])}
      <section class="pipeline-detail-section">
        <h4>Follow-up History</h4>
        <div class="pipeline-history">
          ${(lead.followUps || []).map(item => `<div><strong>${escapeHtml(item.date)}</strong><span>${escapeHtml(item.type)}</span><p>${escapeHtml(item.note)}</p><small>${escapeHtml(item.updatedBy)}</small></div>`).join("") || `<p class="pipeline-muted">No follow-up history yet.</p>`}
        </div>
      </section>
      ${salesDetailSection("Next Follow-up", [
        ["Next Follow-up Date", lead.nextFollowUpDate],
        ["Follow-up Type", lead.followUpType],
        ["Follow-up Note", lead.followUpNote],
        ["Priority", lead.priority]
      ])}
  `;
}

function salesDetailSection(title, rows) {
  return `
    <section class="pipeline-detail-section">
      <h4>${escapeHtml(title)}</h4>
      <dl>${rows.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value || "-")}</dd></div>`).join("")}</dl>
    </section>
  `;
}

function salesLeadTabButton(tab, label) {
  return `<button class="${salesLeadTab === tab ? "active" : ""}" data-sales-lead-tab="${escapeHtml(tab)}">${escapeHtml(label)}</button>`;
}

function salesLeadFilterPanel() {
  const productOptions = ["", ...salesProductTypes()];
  const statusOptions = ["", ...salesLeadStatuses()];
  const salesPeople = ["", ...uniqueValues((salesData().leads || []).map((lead, index) => normalizeSalesLead(lead, index).salesPerson))];
  const customers = ["", ...uniqueValues((salesData().leads || []).map((lead, index) => normalizeSalesLead(lead, index).customer))];
  return `
    <section class="pipeline-filter-panel">
      ${salesFilterSelect("salesPerson", "Sales Person", salesPeople)}
      ${salesFilterSelect("productType", "Product Type", productOptions)}
      ${salesFilterSelect("status", "Status", statusOptions)}
      <label>Date Received<input data-sales-lead-filter-field="receivedDate" placeholder="DD/MM/YYYY" value="${escapeHtml(salesLeadFilters.receivedDate)}"></label>
      <label>Finalizing Month<input data-sales-lead-filter-field="finalizingMonth" placeholder="May 2026" value="${escapeHtml(salesLeadFilters.finalizingMonth)}"></label>
      <label>Min Value<input data-sales-lead-filter-field="minValue" inputmode="decimal" value="${escapeHtml(salesLeadFilters.minValue)}"></label>
      <label>Max Value<input data-sales-lead-filter-field="maxValue" inputmode="decimal" value="${escapeHtml(salesLeadFilters.maxValue)}"></label>
      ${salesFilterSelect("customer", "Customer", customers)}
      ${salesFilterSelect("flag", "Type", ["", "Tender", "Job in Hand", "Lost"])}
      <div class="pipeline-filter-actions">
        <button class="sales-secondary" data-sales-action="clear-lead-filters">Clear</button>
        <button class="sales-secondary" data-sales-export="leads">Export CSV</button>
      </div>
    </section>
  `;
}

function salesFilterSelect(key, label, options) {
  return `<label>${escapeHtml(label)}<select data-sales-lead-filter-field="${escapeHtml(key)}">${options.map(option => `<option value="${escapeHtml(option)}" ${salesLeadFilters[key] === option ? "selected" : ""}>${escapeHtml(option || "All")}</option>`).join("")}</select></label>`;
}

function normalizeSalesLead(lead = {}, index = 0) {
  const status = normalizeLeadStatus(lead.status);
  const customer = cleanDisplay(lead.customer || lead.contractor || "");
  const projectDescription = cleanDisplay(lead.projectDescription || lead.project || lead.requirement || "");
  const contactName = cleanDisplay(lead.contactName || lead.contact || (lead.customer && lead.customer.startsWith("Mr.") ? lead.customer : ""));
  const contactNumber = cleanDisplay(lead.contactNumber || lead.phone || "");
  const followUps = Array.isArray(lead.followUps) ? lead.followUps : lead.followUp ? [{
    date: formatSalesDateInput(lead.followUp),
    type: cleanDisplay(lead.followUpType || "Call"),
    note: cleanDisplay(lead.followUpNote || lead.priority || "Follow-up planned"),
    updatedBy: cleanDisplay(lead.updatedBy || lead.salesPerson || "")
  }] : [];
  const receivedDate = formatSalesDateInput(lead.receivedDate || lead.dateEnquiryReceived || lead.date || lead.createdAt || "");
  return {
    ...lead,
    id: lead.id || `lead-${index + 1}`,
    sNo: cleanDisplay(lead.sNo || lead.serialNo || String(index + 1)),
    enquiryNo: cleanDisplay(lead.enquiryNo || `EN${String(new Date().getFullYear()).slice(-2)}-${String(1000 + index + 1)}`),
    salesPerson: cleanDisplay(lead.salesPerson || lead.engineer || currentUser?.name || ""),
    customer,
    contractor: cleanDisplay(lead.contractor || customer),
    projectDescription,
    plotNo: cleanDisplay(lead.plotNo || lead.location || ""),
    location: cleanDisplay(lead.location || ""),
    client: cleanDisplay(lead.client || ""),
    mainContractor: cleanDisplay(lead.mainContractor || ""),
    consultant: cleanDisplay(lead.consultant || ""),
    acContractor: cleanDisplay(lead.acContractor || ""),
    contactName,
    contactNumber,
    productType: cleanDisplay(lead.productType || inferLeadProductType(lead.projectType || lead.requirement || "")),
    scope: cleanDisplay(lead.scope || lead.scopeNotes || lead.projectType || ""),
    status,
    estimatedValue: salesNumber(lead.estimatedValue ?? lead.value ?? lead.amount),
    daikinPurchaseValue: salesNumber(lead.daikinPurchaseValue ?? lead.daikinPurchase),
    quoteNo: cleanDisplay(lead.quoteNo || lead.quotationNo || ""),
    quotedDate: formatSalesDateInput(lead.quotedDate || lead.dateEnquiryQuoted || ""),
    preparedBy: cleanDisplay(lead.preparedBy || lead.selectionPreparedBy || ""),
    finalizingMonth: cleanDisplay(lead.finalizingMonth || lead.tentativeFinalizingMonth || ""),
    competitors: cleanDisplay(lead.competitors || ""),
    followUps,
    nextFollowUpDate: formatSalesDateInput(lead.nextFollowUpDate || lead.followUp || ""),
    followUpType: cleanDisplay(lead.followUpType || ""),
    followUpNote: cleanDisplay(lead.followUpNote || ""),
    priority: cleanDisplay(lead.priority || ""),
    receivedDate,
    lastUpdated: formatSalesDateInput(lead.lastUpdated || lead.updatedAt || receivedDate),
    updatedBy: cleanDisplay(lead.updatedBy || lead.salesPerson || "")
  };
}

function cleanDisplay(value) {
  return String(value ?? "").trim();
}

function salesNumber(value) {
  const numeric = Number(String(value ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(numeric) ? numeric : 0;
}

function normalizeLeadStatus(status) {
  const text = cleanDisplay(status);
  const key = norm(text);
  if (!key) return "New Enquiry";
  if (key.includes("NEW LEAD")) return "New Enquiry";
  if (key.includes("CONTACTED") || key.includes("SITE VISIT")) return "Selection Pending";
  if (key.includes("QUOTATION NEEDED") || key.includes("QUOTE PENDING")) return "Quote Pending";
  if (key === "SENT" || key.includes("QUOTE SENT") || key.includes("QUOTATION SENT")) return "Quote Sent";
  if (key.includes("WON") || key.includes("CONFIRMED") || key.includes("APPROVED")) return "Job in Hand";
  return text;
}

function inferLeadProductType(value) {
  const text = norm(value);
  if (text.includes("FAHU")) return "VRV + FAHU";
  if (text.includes("AHU")) return "VRV + AHU";
  if (text.includes("VRV")) return "VRV";
  if (text.includes("DX")) return "DX";
  if (text.includes("CHW")) return "CHW";
  if (text.includes("AIR")) return "AIRSIDE";
  return "";
}

function salesProductTypes() {
  return ["DX", "VRV", "CHW", "VRV + FAHU", "VRV + AHU", "VRV + DX", "Other"];
}

function salesLeadStatuses() {
  return ["New Enquiry", "Selection Pending", "Quote Pending", "Quote Sent", "Follow-up", "Tender", "Revision Required", "Negotiation", "Job in Hand", "Lost", "Order Received", "Completed", "On Hold"];
}

function salesFollowUpTypes() {
  return ["Call", "WhatsApp", "Email", "Meeting", "Site Visit"];
}

function salesProductBadge(productType) {
  const key = String(productType || "Other").toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return `<span class="sales-product ${key}">${escapeHtml(productType || "Other")}</span>`;
}

function salesLeadStats(rows) {
  const active = rows.filter(lead => !salesLeadIsClosedStatus(lead) && lead.status !== "Job in Hand");
  const quotePending = rows.filter(lead => ["Selection Pending", "Quote Pending"].includes(lead.status));
  const followDue = rows.filter(lead => ["Quote Sent", "Follow-up", "Negotiation"].includes(lead.status) && isLeadFollowDue(lead));
  const pipelineValue = active.reduce((sum, lead) => sum + Number(lead.estimatedValue || 0), 0);
  const jobInHandValue = rows.filter(lead => lead.status === "Job in Hand").reduce((sum, lead) => sum + Number(lead.estimatedValue || 0), 0);
  const tenderValue = rows.filter(lead => lead.status === "Tender").reduce((sum, lead) => sum + Number(lead.estimatedValue || 0), 0);
  return { open: active.length, quotePending: quotePending.length, followDue: followDue.length, pipelineValue, jobInHandValue, tenderValue };
}

function isLeadFollowDue(lead) {
  const date = parseSalesDate(lead.nextFollowUpDate);
  if (!date) return false;
  const diffDays = Math.floor((date - salesStartOfToday()) / 86400000);
  return diffDays <= 7;
}

function salesLeadTabFilter(rows) {
  if (salesLeadTab === "quotePending") return rows.filter(lead => ["Selection Pending", "Quote Pending"].includes(lead.status));
  if (salesLeadTab === "followDue") return rows.filter(lead => ["Quote Sent", "Follow-up", "Negotiation"].includes(lead.status) && isLeadFollowDue(lead));
  if (salesLeadTab === "tender") return rows.filter(lead => lead.status === "Tender");
  if (salesLeadTab === "jobInHand") return rows.filter(lead => lead.status === "Job in Hand");
  if (salesLeadTab === "lost") return rows.filter(lead => salesLeadIsClosedStatus(lead) || lead.status === "On Hold");
  return rows;
}

function salesLeadShowsClosedRows() {
  return !!salesSearchQuery.trim() || salesLeadTab !== "all" || Object.values(salesLeadFilters).some(value => String(value || "").trim());
}

function salesLeadIsClosedStatus(lead) {
  const status = norm(lead?.status);
  return ["COMPLETED", "LOST", "CLOSED", "LOSTCLOSED"].includes(status);
}

function salesLeadIsLostStatus(lead) {
  const status = norm(normalizeLeadStatus(lead?.status));
  return ["LOST", "LOSTCLOSED"].includes(status);
}

function salesLeadSearch(rows) {
  const q = salesSearchQuery.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter(lead => [
    lead.customer, lead.projectDescription, lead.enquiryNo, lead.quoteNo, lead.contactName,
    lead.productType, lead.status, lead.salesPerson
  ].join(" ").toLowerCase().includes(q));
}

function salesLeadAdvancedFilter(rows) {
  return rows.filter(lead => {
    if (salesLeadFilters.salesPerson && lead.salesPerson !== salesLeadFilters.salesPerson) return false;
    if (salesLeadFilters.productType && lead.productType !== salesLeadFilters.productType) return false;
    if (salesLeadFilters.status && lead.status !== salesLeadFilters.status) return false;
    if (salesLeadFilters.customer && lead.customer !== salesLeadFilters.customer) return false;
    if (salesLeadFilters.receivedDate && formatSalesDateInput(lead.receivedDate) !== formatSalesDateInput(salesLeadFilters.receivedDate)) return false;
    if (salesLeadFilters.finalizingMonth && !norm(lead.finalizingMonth).includes(norm(salesLeadFilters.finalizingMonth))) return false;
    if (salesLeadFilters.minValue && Number(lead.estimatedValue || 0) < Number(salesLeadFilters.minValue)) return false;
    if (salesLeadFilters.maxValue && Number(lead.estimatedValue || 0) > Number(salesLeadFilters.maxValue)) return false;
    if (salesLeadFilters.flag === "Tender" && lead.status !== "Tender") return false;
    if (salesLeadFilters.flag === "Job in Hand" && lead.status !== "Job in Hand") return false;
    if (salesLeadFilters.flag === "Lost" && !salesLeadIsClosedStatus(lead)) return false;
    return true;
  });
}

function uniqueValues(values) {
  return [...new Set(values.map(value => cleanDisplay(value)).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function salesCustomerNames() {
  return (salesData().customers || []).map(customer => customer.name).filter(Boolean);
}

function findSalesCustomerByName(name) {
  const target = norm(name);
  if (!target) return null;
  return (salesData().customers || []).find(customer => norm(customer.name) === target) || null;
}

function requireSavedSalesCustomer(name, context = "Customer") {
  const customer = findSalesCustomerByName(name);
  if (!customer) {
    alert(`${context} must be selected from the saved Customer Database.`);
    return null;
  }
  return customer;
}

function salesCustomersHtml() {
  const data = salesData();
  const customers = data.customers || [];
  const rows = salesFilter(customers, ["name", "type", "contact", "phone", "email", "address", "trn"]);
  const commercialCount = customers.filter(customer => customerTypeKey(customer) === "commercial").length;
  const residentialCount = customers.filter(customer => customerTypeKey(customer) === "residential").length;
  const quotationTotal = (data.quotations || []).reduce((sum, quote) => sum + Number(quote.amount || 0), 0);
  const revenuePerClient = customers.length ? quotationTotal / customers.length : 0;
  return `
    ${salesPageHeader("Customer Database", "Customer and company records for the Sales Desk.", `<button class="sales-secondary" data-sales-export="customers">Export CSV</button><button class="sales-primary" data-sales-action="add-customer">Add Customer</button>`)}
    <div class="sales-kpi-grid">
      ${salesKpi("Total Customers", customers.length.toLocaleString(), "Live", "records")}
      ${salesKpi("Commercial Clients", commercialCount.toLocaleString(), "Active", "accounts", "success")}
      ${salesKpi("Residential Clients", residentialCount.toLocaleString(), "Private", "customers")}
      ${salesKpi("Revenue / Client", salesCompactMoney(revenuePerClient), "Average", "value")}
    </div>
    <section class="sales-card">
      <table class="sales-table sales-customers-table">
        <colgroup>
          <col class="customer-name-col">
          <col class="customer-contact-col">
          <col class="customer-details-col">
          <col class="customer-address-col">
          <col class="customer-trn-col">
          <col class="customer-actions-col">
        </colgroup>
        <thead><tr><th>Customer / Company Name</th><th>Contact Person</th><th>Contact Details</th><th>Address</th><th>TRN Number</th><th>Actions</th></tr></thead>
        <tbody>${rows.map(customer => `
          <tr>
            <td><div class="customer-name-cell">${salesAvatar(customer.icon)}<div><strong>${escapeHtml(customer.name)}</strong><span>${escapeHtml(customer.type)}</span></div></div></td>
            <td><strong>${escapeHtml(customer.contact)}</strong><br><span>${escapeHtml(customer.role)}</span></td>
            <td>${escapeHtml(customer.phone)}<br><span>${escapeHtml(customer.email)}</span></td>
            <td>${escapeHtml(customer.detail)}</td>
            <td>${escapeHtml(customer.trn)}</td>
            <td>${rowMenu([
              { label: "History", action: "customer-history", id: customer.id },
              { label: "Edit", action: "edit-customer", id: customer.id },
              { label: "Delete", action: "delete-customer", id: customer.id, danger: true }
            ])}</td>
          </tr>`).join("")}</tbody>
      </table>
    </section>
  `;
}

function customerTypeKey(customer) {
  const key = norm(customer?.type);
  if (key.includes("COMMERCIAL")) return "commercial";
  if (key.includes("RESIDENTIAL") || key.includes("PRIVATE") || key.includes("VILLA") || key.includes("APARTMENT")) return "residential";
  return "other";
}

function averageQuotationRevision(quotations = []) {
  const revisions = quotations.map(quote => {
    const revisionText = String(quote.revision || quote.no || "");
    const match = revisionText.match(/R(\d+)|(\d+)\s*Revisions?/i);
    return match ? Number(match[1] || match[2] || 0) : 0;
  });
  if (!revisions.length) return 0;
  return revisions.reduce((sum, value) => sum + value, 0) / revisions.length;
}

function followUpBucket(item) {
  const status = norm(item?.status);
  const due = norm(item?.due);
  const priority = norm(item?.priority);
  if (status.includes("COMPLETED") || status.includes("CONFIRMED")) return "completed";
  if (status.includes("OVERDUE") || due.includes("OVERDUE") || priority.includes("OVERDUE")) return "overdue";
  if (status.includes("TODAY") || due.includes("TODAY") || priority.includes("TODAY")) return "today";
  const date = followUpDate(item);
  if (date) {
    const diffDays = Math.floor((date - salesStartOfToday()) / 86400000);
    if (diffDays < 0) return "overdue";
    if (diffDays === 0) return "today";
    if (diffDays <= 7) return "upcoming";
    return "future";
  }
  return "upcoming";
}

function followUpDate(item) {
  const due = norm(item?.due);
  if (due.includes("TODAY")) return salesStartOfToday();
  const candidates = [item?.date, item?.followUp, item?.due].filter(Boolean);
  for (const value of candidates) {
    const parsed = parseSalesDate(value);
    if (parsed) return parsed;
  }
  return null;
}

function parseSalesDate(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  const clean = text.replace(/(\d+)(st|nd|rd|th)/gi, "$1").replace(/,/g, " ");
  let match = clean.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  match = clean.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (match) return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
  const months = { jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11 };
  match = clean.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (match && months[match[2].toLowerCase()] !== undefined) return new Date(Number(match[3]), months[match[2].toLowerCase()], Number(match[1]));
  match = clean.match(/^([A-Za-z]+)\s+(\d{1,2})\s+(\d{4})/);
  if (match && months[match[1].toLowerCase()] !== undefined) return new Date(Number(match[3]), months[match[1].toLowerCase()], Number(match[2]));
  const fallback = new Date(text);
  return Number.isNaN(fallback.getTime()) ? null : new Date(fallback.getFullYear(), fallback.getMonth(), fallback.getDate());
}

function salesStartOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function salesDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatSalesCalendarDate(dateKey) {
  if (dateKey === "No date") return dateKey;
  const date = parseSalesDate(dateKey);
  return date ? date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : dateKey;
}

function formatSalesDateInput(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const parsed = parseSalesDate(text);
  if (!parsed) return text;
  return `${String(parsed.getDate()).padStart(2, "0")}/${String(parsed.getMonth() + 1).padStart(2, "0")}/${parsed.getFullYear()}`;
}

const SALES_PROJECT_TABS = [
  { key: "all", label: "All Projects" },
  { key: "ongoing", label: "Ongoing" },
  { key: "delivery", label: "Delivery Pending" },
  { key: "completed", label: "Completed" },
  { key: "lost", label: "Lost / Closed" }
];

function salesProjectsHtml() {
  if (salesProjectMode === "kanban") salesProjectMode = "list";
  if (!SALES_PROJECT_TABS.some(tab => tab.key === salesProjectFilter)) salesProjectFilter = "all";
  const searchableRows = salesFilter(salesData().projects || [], ["projectNo", "projectId", "name", "customer", "location", "type", "category", "productType", "requirement", "engineer", "status", "scope"]);
  const rows = searchableRows.filter(project => salesProjectMatchesTab(project, salesProjectFilter));
  const selected = salesSelectedProject(rows, searchableRows);
  return `
    ${salesPageHeader("Sales Desk < Projects", "Manage active HVAC projects, BOQ delivery, stock reservation, and project progress.", `<button class="sales-secondary" data-sales-export="projects">Export CSV</button><button class="sales-primary" data-sales-action="new-project">New Project</button>`)}
    <section class="sales-projects-layout ${selected ? "detail-open" : "detail-closed"}">
      <div class="sales-project-list-card">
        <div class="sales-project-tabs">
          ${SALES_PROJECT_TABS.map(tab => `<button class="${salesProjectFilter === tab.key ? "active" : ""}" data-sales-project-filter="${tab.key}">${escapeHtml(tab.label)}</button>`).join("")}
        </div>
        ${salesProjectTableHtml(rows)}
        <div class="sales-project-pagination">
          <span>Showing ${rows.length ? 1 : 0} to ${rows.length} of ${searchableRows.length} projects</span>
          <div><button class="active">1</button><button disabled>2</button><button disabled>3</button></div>
        </div>
      </div>
      ${selected ? salesProjectDetailHtml(selected) : ""}
    </section>
  `;
}

function salesProjectTableHtml(rows) {
  return `
    <table class="sales-table sales-project-table">
      <thead><tr><th>Project & Customer</th><th>Location</th><th>Product Type</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody>${rows.map(project => {
        const projectNo = salesProjectNo(project);
        const productType = salesProjectProduct(project);
        return `
        <tr class="${project.id === salesProjectDetailId ? "selected" : ""}">
          <td><strong>${escapeHtml(project.name || projectNo)}</strong><br><span>${escapeHtml(project.customer || "-")}</span></td>
          <td>${escapeHtml(project.location || "-")}</td>
          <td>${escapeHtml(productType || "-")}</td>
          <td>${salesBadge(salesProjectStatus(project))}</td>
          <td>
            <div class="sales-project-actions">
              <button data-sales-project-select="${escapeHtml(project.id)}">View</button>
              <button data-sales-action="edit-project" data-sales-id="${escapeHtml(project.id)}">Edit</button>
              ${rowMenu([
                { label: "View", action: "view-project", id: project.id },
                { label: "Edit", action: "edit-project", id: project.id },
                { label: "Delete", action: "delete-project", id: project.id, danger: true }
              ])}
            </div>
          </td>
        </tr>`;
      }).join("") || `<tr><td colspan="5">No projects found.</td></tr>`}</tbody>
    </table>
  `;
}

function salesSelectedProject(rows, allRows) {
  if (!salesProjectDetailId) return null;
  const selected = (allRows || []).find(project => project.id === salesProjectDetailId);
  if (!selected) salesProjectDetailId = "";
  return selected || null;
}

function salesProjectMatchesTab(project, tab) {
  const status = norm(salesProjectStatus(project));
  if (!tab || tab === "all") return true;
  if (tab === "ongoing") return !["completed", "lost", "lost / closed", "closed"].includes(status);
  if (tab === "delivery") return status.includes("delivery");
  if (tab === "completed") return status === "completed";
  if (tab === "lost") return ["lost", "lost / closed", "closed"].includes(status);
  return true;
}

function salesProjectNo(project = {}) {
  return project.projectNo || project.projectId || project.no || "";
}

function salesProjectStatus(project = {}) {
  return project.status || "Ongoing";
}

function salesProjectAutoStatus(project = {}) {
  const existingStatus = salesProjectStatus(project);
  if (["LOST", "LOSTCLOSED", "CLOSED"].includes(norm(existingStatus))) return existingStatus;
  const rows = salesProjectBoqRows(project).filter(row => row.model || row.description || Number(row.qty || 0) || Number(row.deliveredQty || 0));
  if (!rows.length) return "Ongoing";
  return rows.some(row => (Number(row.qty || 0) - Number(row.deliveredQty || 0)) > 0) ? "Delivery Pending" : "Completed";
}

function salesProjectProduct(project = {}) {
  return project.productType || project.requirement || project.category || project.type || "";
}

function salesProjectDetailHtml(project) {
  const boqRows = salesProjectBoqRows(project);
  const deliveryNotes = salesProjectDeliveryNotes(project);
  return `
    <aside class="sales-project-detail-panel order-book-detail" data-project-detail-id="${escapeHtml(project.id || "")}">
      <div class="pipeline-detail-head">
        <div class="pipeline-detail-title">
          <h3>${escapeHtml(project.name || salesProjectNo(project) || "Project")}</h3>
          ${salesBadge(salesProjectStatus(project))}
        </div>
        <button class="mini-button" type="button" data-sales-project-close-detail aria-label="Close project details">X</button>
      </div>
      <div class="pipeline-detail-meta">
        <p>Created Date: ${escapeHtml(formatSalesDateInput(project.date || project.createdDate || ""))}${project.engineer ? ` by ${escapeHtml(project.engineer)}` : ""}</p>
        ${rowMenu([
          { label: "Edit", action: "edit-project", id: project.id },
          { label: "Mark as Lost / Closed", action: "project-lost", id: project.id },
          { label: "Delete", action: "delete-project", id: project.id, danger: true }
        ])}
      </div>
      ${salesDetailSection("Project Information", [
        ["Project No", salesProjectNo(project)],
        ["Project Name", project.name],
        ["Customer", project.customer],
        ["Location", project.location],
        ["Project Category", project.category || project.type],
        ["Status", salesProjectStatus(project)],
        ["Created Date", formatSalesDateInput(project.date || project.createdDate || "")]
      ])}
      <section class="pipeline-detail-section">
        <h4>Scope Details</h4>
        <p class="pipeline-muted">${escapeHtml(project.scope || project.description || "-")}</p>
      </section>
      <section class="pipeline-detail-section">
        <h4>BOQ / Delivery Details</h4>
        ${salesProjectBoqTableHtml(project, boqRows)}
      </section>
      <section class="pipeline-detail-section">
        <h4>Delivery History</h4>
        ${salesProjectDeliveryHistoryHtml(deliveryNotes)}
      </section>
    </aside>
  `;
}

function salesProjectDetailField(label, key, value = "", type = "text", options = []) {
  if (type === "select") {
    const selectedValue = String(value || "");
    return `<label>${escapeHtml(label)}<select data-project-detail-field="${escapeHtml(key)}">${options.map(option => `<option ${selectedValue === option ? "selected" : ""}>${escapeHtml(option)}</option>`).join("")}</select></label>`;
  }
  return `<label>${escapeHtml(label)}<input data-project-detail-field="${escapeHtml(key)}" ${type === "dateText" ? `inputmode="numeric" placeholder="DD/MM/YYYY"` : ""} value="${escapeHtml(value || "")}"></label>`;
}

function salesProjectBoqTableHtml(project, boqRows) {
  return `
    <table class="sales-mini-table sales-project-detail-boq-table">
      <thead><tr><th>Model</th><th>Qty</th><th>Delivered Qty</th><th>Pending Qty</th></tr></thead>
      <tbody>${boqRows.map(row => {
        const model = row.model || row.modelNo || "";
        const qty = Number(row.qty || row.quantity || 0) || 0;
        const delivered = Number(row.deliveredQty || salesProjectDeliveredQty(project, model)) || 0;
        const pending = qty - delivered;
        return `<tr><td>${escapeHtml(model || "-")}</td><td>${qty || ""}</td><td class="sales-project-delivered-qty">${delivered || ""}</td><td class="sales-project-pending-qty">${pending}</td></tr>`;
      }).join("") || `<tr><td colspan="4">No BOQ items yet.</td></tr>`}</tbody>
    </table>
  `;
}

function salesProjectDeliveryHistoryHtml(notes) {
  return `
    <table class="sales-mini-table">
      <thead><tr><th>Date</th><th>DN No</th><th>Model</th><th>Delivered Qty</th></tr></thead>
      <tbody>${notes.flatMap(note => (note.lines || note.items || []).map(line => `<tr><td>${escapeHtml(formatSalesDateInput(note.date || ""))}</td><td>${escapeHtml(note.dnNo || note.no || "")}</td><td>${escapeHtml(line.modelNo || line.model || "")}</td><td>${escapeHtml(line.qtyGoingOut || line.qty || line.quantity || "")}</td></tr>`)).join("") || `<tr><td colspan="4">No delivery history.</td></tr>`}</tbody>
    </table>
  `;
}

function salesProjectBoqRows(project = {}) {
  if (Array.isArray(project.boq)) return project.boq;
  if (Array.isArray(project.items)) return project.items;
  return [];
}

function salesProjectDeliveryNotes(project = {}) {
  const projectName = norm(project.name || "");
  if (!projectName || !inventoryState) return [];
  return (inventoryState.deliveryNotes || []).filter(note => {
    const status = norm(note.status || "");
    return norm(note.projectName || note.project || "") === projectName && !["draft", "cancelled"].includes(status);
  });
}

function salesProjectDeliveredQty(project, model) {
  const target = norm(model || "");
  if (!target) return 0;
  return salesProjectDeliveryNotes(project).reduce((total, note) => total + (note.lines || note.items || []).reduce((sum, line) => {
    return norm(line.modelNo || line.model || "") === target ? sum + (Number(line.qtyGoingOut || line.qty || line.quantity || 0) || 0) : sum;
  }, 0), 0);
}

function salesProjectStockQty(model) {
  const target = norm(model || "");
  if (!target || !inventoryState) return 0;
  const stockRows = [...(inventoryState.dashboard?.stock || []), ...(inventoryState.models || []), ...(inventoryState.stock || [])];
  const row = stockRows.find(item => norm(item.modelNo || item.model || item.name || "") === target);
  return Number(row?.currentQty || row?.qty || row?.quantity || 0) || 0;
}

function salesProjectProductTypes() {
  return ["", "DX", "VRV", "CHW", "VRV + FAHU", "VRV + AHU", "VRV + DX", "Other"];
}

function salesProjectStatusOptions() {
  return ["Ongoing", "Delivery Pending", "Completed", "Lost / Closed"];
}

function salesProjectCategoryOptions() {
  return ["", "Commercial", "Residential", "Trading", "Project/Inst", "AMC / Maintenance"];
}

function nextSalesProjectNo() {
  let nextNo = salesData().settings?.nextProjectNo || `PRJ-${String(new Date().getFullYear()).slice(-2)}-0001`;
  for (const project of salesData().projects || []) {
    const projectNo = salesProjectNo(project);
    if (!projectNo) continue;
    const candidate = nextSalesProjectNoFromBase(projectNo);
    if (projectNoSequenceValue(candidate) > projectNoSequenceValue(nextNo)) nextNo = candidate;
  }
  return nextNo;
}

function nextSalesProjectNoFromBase(value) {
  const text = String(value || "");
  const match = text.match(/^(.*?)(\d+)$/);
  if (!match) return `PRJ-${String(new Date().getFullYear()).slice(-2)}-0001`;
  return `${match[1]}${String(Number(match[2]) + 1).padStart(match[2].length, "0")}`;
}

function projectNoSequenceValue(value) {
  const match = String(value || "").match(/(\d+)$/);
  return match ? Number(match[1]) || 0 : 0;
}

function salesProjectNewId() {
  return `sales-project-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function salesProjectBlank() {
  const projectNo = nextSalesProjectNo();
  return {
    id: salesProjectNewId(),
    projectNo,
    projectId: projectNo,
    name: "",
    customer: "",
    location: "",
    category: "",
    type: "Commercial",
    productType: "",
    engineer: currentUser?.name || "Admin User",
    status: "Ongoing",
    date: todaySalesDateInput(),
    createdDate: todaySalesDateInput(),
    targetDate: "",
    scope: "",
    boq: [],
    reserveStock: false,
    expectedDeliveryDate: "",
    deliveryNoteReference: "",
    remarks: "",
    directDeliveryUploads: [],
    value: ""
  };
}

function salesProjectDrawerField(label, key, value = "", options = null, type = "text", className = "") {
  if (options) {
    return `<label class="${className}">${escapeHtml(label)}<select data-project-drawer-field="${escapeHtml(key)}">${options.map(option => `<option value="${escapeHtml(option)}" ${String(value || "") === option ? "selected" : ""}>${escapeHtml(option || "Select")}</option>`).join("")}</select></label>`;
  }
  if (type === "textarea") {
    return `<label class="${className}">${escapeHtml(label)}<textarea data-project-drawer-field="${escapeHtml(key)}">${escapeHtml(value || "")}</textarea></label>`;
  }
  if (type === "checkbox") {
    return `<label class="sales-project-check ${className}"><input type="checkbox" data-project-drawer-field="${escapeHtml(key)}" ${value ? "checked" : ""}> ${escapeHtml(label)}</label>`;
  }
  return `<label class="${className}">${escapeHtml(label)}<input data-project-drawer-field="${escapeHtml(key)}" ${type === "dateText" ? `inputmode="numeric" placeholder="DD/MM/YYYY"` : ""} value="${escapeHtml(value || "")}"></label>`;
}

function salesProjectDrawerBoqRowHtml(row = {}, index = 0) {
  const model = salesProjectModelNo(row.model || row.modelNo || row.description || "");
  const qty = Number(row.qty || row.quantity || 0) || 0;
  const delivered = Number(row.deliveredQty || 0) || 0;
  const pending = qty - delivered;
  const stock = model ? salesProjectStockQty(model) : "";
  const canReserve = pending > 0;
  const reserve = canReserve && !!(row.reserve || row.reserveStock);
  return `
    <tr data-project-boq-row>
      <td>
        <input data-suggestion-list="salesProjectModelList" data-project-boq-field="model" value="${escapeHtml(model)}">
        <input type="hidden" data-project-boq-field="description" value="${escapeHtml(row.description || "")}">
      </td>
      <td><input inputmode="decimal" data-project-boq-field="qty" value="${qty || ""}"></td>
      <td><input inputmode="decimal" data-project-boq-field="deliveredQty" value="${delivered || ""}"></td>
      <td data-project-boq-pending>${pending}</td>
      <td data-project-boq-stock>${model ? escapeHtml(String(stock)) : ""}</td>
      <td class="sales-project-reserve-cell">
        <label class="sales-project-row-toggle ${canReserve ? "" : "is-disabled"}" title="${canReserve ? "Reserve stock" : "No pending quantity to reserve"}">
          <input type="checkbox" data-project-boq-field="reserve" ${reserve ? "checked" : ""} ${canReserve ? "" : "disabled"}>
          <span></span>
        </label>
        <button class="sales-project-row-delete" type="button" data-delete-project-boq="${index}" aria-label="Delete BOQ row">x</button>
      </td>
    </tr>
  `;
}

function salesProjectDirectDeliverySection(project = {}) {
  const uploads = Array.isArray(project.directDeliveryUploads) ? project.directDeliveryUploads : [];
  return `
    <section class="sales-project-form-section sales-project-direct-delivery">
      <h3><span>4</span> Direct Delivery Details <i class="po-upload-spinner sales-project-direct-spinner hidden" data-project-direct-spinner aria-label="Uploading delivery note"></i></h3>
      <p class="sales-project-direct-copy">Upload delivery note to detect delivered models and quantities.</p>
      <label class="sales-project-direct-upload" data-project-direct-upload-zone>
        <input type="file" data-project-direct-file accept=".pdf,.png,.jpg,.jpeg">
        <span class="sales-project-direct-upload-icon">⇧</span>
        <strong>Upload Delivery Note</strong>
        <small>Drag & drop PDF, JPG, or PNG here, or click to upload.</small>
      </label>
      <div class="sales-project-direct-detected">
        <h4>Detected Items</h4>
        <table class="sales-project-direct-table">
          <thead><tr><th>Detected Model</th><th>Quantity</th><th>Status</th><th>Action</th></tr></thead>
          <tbody data-project-direct-detected-body>
            ${salesProjectDirectDetectedRowsHtml([])}
          </tbody>
        </table>
        <div class="sales-project-direct-actions">
          <button type="button" class="ghost-button" data-clear-project-direct>Clear Upload</button>
          <button type="button" class="sales-primary" data-verify-project-direct>Verify & Update Delivered Qty</button>
        </div>
      </div>
      <div class="sales-project-direct-uploaded">
        <h4>Uploaded Information</h4>
        <table class="sales-project-direct-table">
          <thead><tr><th>Date</th><th>Delivery Note No.</th><th>Total Quantity</th><th>Actions</th></tr></thead>
          <tbody data-project-direct-uploaded-body>
            ${salesProjectDirectUploadsHtml(uploads, project.id)}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function salesProjectDirectDetectedRowsHtml(rows = []) {
  return rows.map((row, index) => `
    <tr data-project-direct-detected-row>
      <td><input data-project-direct-field="modelNo" data-suggestion-list="salesProjectModelList" value="${escapeHtml(row.modelNo || "")}"></td>
      <td><input class="sales-project-orange-number" inputmode="decimal" data-project-direct-field="quantity" value="${escapeHtml(row.quantity ?? "")}"></td>
      <td><span class="sales-project-direct-status ${salesProjectDirectStatusClass(row.status)}">${escapeHtml(row.status || "Needs Review")}</span></td>
      <td><button type="button" class="sales-project-direct-remove" data-remove-project-direct="${index}">Remove</button></td>
    </tr>
  `).join("") || `<tr><td colspan="4" class="sales-project-direct-empty">No detected items yet.</td></tr>`;
}

function salesProjectDirectUploadsHtml(uploads = [], projectId = "") {
  return uploads.map(upload => {
    const uploadId = upload.uploadId || upload.id || "";
    return `
      <tr data-project-direct-upload-row="${escapeHtml(uploadId)}">
        <td>${escapeHtml(formatSalesDateInput(upload.date || upload.uploadedAt || ""))}</td>
        <td>${escapeHtml(upload.deliveryNoteNo || upload.originalName || "-")}</td>
        <td class="sales-project-orange-number">${escapeHtml(upload.totalQuantity ?? 0)}</td>
        <td class="sales-project-direct-menu-cell">
          <button type="button" class="sales-project-direct-menu-button" data-project-direct-menu="${escapeHtml(uploadId)}">...</button>
          <div class="sales-project-direct-menu" data-project-direct-menu-panel="${escapeHtml(uploadId)}">
            <button type="button" data-download-project-direct="${escapeHtml(uploadId)}">Download File</button>
            <button type="button" class="danger" data-delete-project-direct-upload="${escapeHtml(uploadId)}">Delete</button>
          </div>
        </td>
      </tr>
    `;
  }).join("") || `<tr><td colspan="4" class="sales-project-direct-empty">No uploaded delivery notes yet.</td></tr>`;
}

function salesProjectDirectStatusClass(status = "") {
  const key = norm(status);
  if (key.includes("NOTINBOQ")) return "not-in-boq";
  if (key.includes("NEEDSREVIEW")) return "needs-review";
  return "matched";
}

function openSalesProjectDrawer(itemId = "") {
  const existing = itemId ? structuredClone((salesData().projects || []).find(item => item.id === itemId)) : null;
  const project = existing || salesProjectBlank();
  const customerOptions = (salesData().customers || []).map(customer => customer.name).filter(Boolean);
  const modelOptions = (inventoryState?.models || inventoryState?.stock || []).map(item => item.modelNo || item.model || item.name || "").filter(Boolean);
  const modal = document.createElement("div");
  modal.className = "sales-project-drawer-backdrop";
  modal.innerHTML = `
    <section class="sales-project-drawer">
      <div class="sales-project-drawer-head">
        <div>
          <h2>${existing ? "Edit Project" : "New Project"}</h2>
          <p>Create a new HVAC project and capture all relevant details.</p>
        </div>
        <button class="mini-button" data-close-project-drawer>X</button>
      </div>
      <datalist id="salesProjectCustomerList">${customerOptions.map(name => `<option value="${escapeHtml(name)}"></option>`).join("")}</datalist>
      <datalist id="salesProjectModelList">${modelOptions.map(name => `<option value="${escapeHtml(name)}"></option>`).join("")}</datalist>
      <div class="sales-project-drawer-body">
        <section class="sales-project-form-section">
          <h3><span>1</span> Project Information</h3>
          <div class="sales-project-form-grid">
            ${salesProjectDrawerField("Project No", "projectNo", salesProjectNo(project))}
            ${salesProjectDrawerField("Project Name", "name", project.name)}
            <label>Customer<input list="salesProjectCustomerList" data-project-drawer-field="customer" value="${escapeHtml(project.customer || "")}"></label>
            ${salesProjectDrawerField("Location", "location", project.location)}
            ${salesProjectDrawerField("Project Category", "category", project.category || project.type, salesProjectCategoryOptions())}
            ${salesProjectDrawerField("Status", "status", salesProjectStatus(project), salesProjectStatusOptions())}
            ${salesProjectDrawerField("Product Type", "productType", salesProjectProduct(project), salesProjectProductTypes())}
            ${salesProjectDrawerField("Created Date", "createdDate", formatSalesDateInput(project.createdDate || project.date || todaySalesDateInput()), null, "dateText")}
            ${salesProjectDrawerField("Target Completion Date", "targetDate", formatSalesDateInput(project.targetDate || ""), null, "dateText")}
          </div>
        </section>
        <section class="sales-project-form-section">
          <h3><span>2</span> Scope / Work Description</h3>
          ${salesProjectDrawerField("Scope / Work Description", "scope", project.scope || project.description || "", null, "textarea")}
        </section>
        <section class="sales-project-form-section">
          <h3><span>3</span> BOQ / Delivery Details</h3>
          <div class="sales-project-boq-wrap">
            <table class="sales-project-boq-edit">
              <colgroup>
                <col class="sales-project-boq-model">
                <col class="sales-project-boq-qty">
                <col class="sales-project-boq-delivered">
                <col class="sales-project-boq-pending">
                <col class="sales-project-boq-stock">
                <col class="sales-project-boq-reserve">
              </colgroup>
              <thead><tr><th>Model</th><th>Qty</th><th>Delivered Qty</th><th>Pending Qty</th><th>Stock</th><th>Reserve</th></tr></thead>
              <tbody>${(salesProjectBoqRows(project).length ? salesProjectBoqRows(project) : [{}]).map(salesProjectDrawerBoqRowHtml).join("")}</tbody>
            </table>
          </div>
          <button class="sales-secondary sales-project-add-boq" data-add-project-boq>Add BOQ Row</button>
        </section>
        ${salesProjectDirectDeliverySection(project)}
      </div>
      <div class="sales-project-drawer-actions">
        <button class="ghost-button" data-close-project-drawer>Cancel</button>
        <button class="sales-primary" data-save-project-drawer>${existing ? "Save Changes" : "Save Project"}</button>
      </div>
    </section>
  `;
  document.body.appendChild(modal);
  modal._directDeliveryUploads = structuredClone(project.directDeliveryUploads || []);
  modal._directDeliveryDetected = [];
  modal._directDeliveryPendingUpload = null;
  modal.querySelectorAll("[data-close-project-drawer]").forEach(button => button.addEventListener("click", () => modal.remove()));
  modal.querySelector("[data-add-project-boq]").addEventListener("click", () => {
    modal.querySelector(".sales-project-boq-edit tbody").insertAdjacentHTML("beforeend", salesProjectDrawerBoqRowHtml({}, modal.querySelectorAll("[data-project-boq-row]").length));
  });
  modal.addEventListener("input", event => {
    if (event.target.dataset.suggestionList) toggleSuggestionList(event.target);
    const row = event.target.closest("[data-project-boq-row]");
    if (row) salesProjectUpdateBoqRow(row);
  });
  modal.addEventListener("change", event => {
    if (event.target.dataset.projectDirectFile !== undefined) return uploadSalesProjectDirectDelivery(modal, project, event.target.files?.[0]);
    if (event.target.dataset.suggestionList) toggleSuggestionList(event.target);
    const row = event.target.closest("[data-project-boq-row]");
    if (row) salesProjectUpdateBoqRow(row, true);
    if (event.target.closest("[data-project-direct-detected-row]")) salesProjectRefreshDirectDetectedStatuses(modal);
  });
  modal.addEventListener("click", event => {
    const deleteButton = event.target.closest("[data-delete-project-boq]");
    if (deleteButton) deleteButton.closest("[data-project-boq-row]")?.remove();
    if (event.target.closest("[data-clear-project-direct]")) clearSalesProjectDirectDelivery(modal);
    if (event.target.closest("[data-verify-project-direct]")) verifySalesProjectDirectDelivery(modal, project);
    const directMenuButton = event.target.closest("[data-project-direct-menu]");
    if (directMenuButton) {
      const menuId = directMenuButton.dataset.projectDirectMenu;
      modal.querySelectorAll("[data-project-direct-menu-panel]").forEach(panel => {
        panel.classList.toggle("open", panel.dataset.projectDirectMenuPanel === menuId && !panel.classList.contains("open"));
      });
      return;
    }
    if (!event.target.closest(".sales-project-direct-menu-cell")) {
      modal.querySelectorAll("[data-project-direct-menu-panel]").forEach(panel => panel.classList.remove("open"));
    }
    const removeDetected = event.target.closest("[data-remove-project-direct]");
    if (removeDetected) {
      removeDetected.closest("[data-project-direct-detected-row]")?.remove();
      salesProjectRefreshDirectDetectedStatuses(modal);
    }
    const downloadUpload = event.target.closest("[data-download-project-direct]");
    if (downloadUpload) downloadSalesProjectDirectUpload(project.id, downloadUpload.dataset.downloadProjectDirect);
    const deleteUpload = event.target.closest("[data-delete-project-direct-upload]");
    if (deleteUpload) deleteSalesProjectDirectUpload(modal, project, deleteUpload.dataset.deleteProjectDirectUpload);
  });
  modal.querySelector("[data-save-project-drawer]").addEventListener("click", async () => {
    const payload = collectSalesProjectDrawer(modal, project);
    if (!payload.name.trim()) return alert("Project name is required.");
    if (!payload.customer.trim()) return alert("Customer is required.");
    await saveSalesProject(payload);
    modal.remove();
  });
}

function salesProjectUpdateBoqRow(row, normalizeModel = false) {
  const modelInput = row.querySelector('[data-project-boq-field="model"]');
  const model = normalizeModel ? salesProjectModelNo(modelInput?.value || "") : modelInput?.value.trim() || "";
  if (normalizeModel && modelInput) modelInput.value = model;
  const qty = Number(row.querySelector('[data-project-boq-field="qty"]')?.value || 0) || 0;
  const delivered = Number(row.querySelector('[data-project-boq-field="deliveredQty"]')?.value || 0) || 0;
  const descriptionInput = row.querySelector('[data-project-boq-field="description"]');
  const modelInfo = salesProjectModelInfo(model);
  const pending = qty - delivered;
  const canReserve = pending > 0;
  const stock = salesProjectStockQty(model);
  const pendingCell = row.querySelector("[data-project-boq-pending]");
  const stockCell = row.querySelector("[data-project-boq-stock]");
  const reserveInput = row.querySelector('[data-project-boq-field="reserve"]');
  const reserveToggle = reserveInput?.closest(".sales-project-row-toggle");
  if (descriptionInput && modelInfo?.description) descriptionInput.value = modelInfo.description;
  if (pendingCell) pendingCell.textContent = String(pending);
  if (stockCell) stockCell.textContent = model ? String(stock) : "";
  if (reserveInput) {
    if (!canReserve) reserveInput.checked = false;
    reserveInput.disabled = !canReserve;
  }
  if (reserveToggle) {
    reserveToggle.classList.toggle("is-disabled", !canReserve);
    reserveToggle.title = canReserve ? "Reserve stock" : "No pending quantity to reserve";
  }
}

async function uploadSalesProjectDirectDelivery(modal, project, file) {
  if (!file) return;
  const input = modal.querySelector("[data-project-direct-file]");
  const form = new FormData();
  form.append("file", file);
  form.append("projectId", project.id || "");
  const uploadZone = modal.querySelector("[data-project-direct-upload-zone]");
  const spinner = modal.querySelector("[data-project-direct-spinner]");
  uploadZone?.classList.add("is-loading");
  spinner?.classList.remove("hidden");
  try {
    const result = await api("/api/sales-crm/projects/direct-delivery/upload", { method: "POST", body: form });
    modal._directDeliveryPendingUpload = result.upload;
    salesProjectRenderDirectUploadZone(modal, result.upload);
    const rows = (result.detected?.lines || result.upload?.lines || []).map(line => ({
      modelNo: salesProjectModelNo(line.modelNo || line.model || ""),
      quantity: Number(line.quantity || line.finalQty || line.detectedQty || 0) || "",
      status: line.status || ""
    }));
    modal._directDeliveryDetected = salesProjectApplyDirectStatuses(modal, rows.length ? rows : [{ modelNo: "", quantity: "", status: "Needs Review" }]);
    salesProjectRenderDirectDetected(modal);
    toast(result.message || "Delivery note scanned. Review detected items.");
  } catch (error) {
    toast(error.message || "Delivery note upload failed");
  } finally {
    uploadZone?.classList.remove("is-loading");
    spinner?.classList.add("hidden");
    if (input) input.value = "";
  }
}

function salesProjectRenderDirectDetected(modal) {
  const body = modal.querySelector("[data-project-direct-detected-body]");
  if (body) body.innerHTML = salesProjectDirectDetectedRowsHtml(modal._directDeliveryDetected || []);
}

function salesProjectRenderDirectUploads(modal, project) {
  const body = modal.querySelector("[data-project-direct-uploaded-body]");
  if (body) body.innerHTML = salesProjectDirectUploadsHtml(modal._directDeliveryUploads || [], project.id);
}

function salesProjectRenderDirectUploadZone(modal, upload = null) {
  const zone = modal.querySelector("[data-project-direct-upload-zone]");
  if (!zone) return;
  const title = zone.querySelector("strong");
  const detail = zone.querySelector("small");
  if (title) title.textContent = upload?.originalName || "Upload Delivery Note";
  if (detail) detail.textContent = upload ? `${prettyBytes(upload.size || 0)} uploaded. Review detected items, then verify.` : "Drag & drop PDF, JPG, or PNG here, or click to upload.";
  zone.classList.toggle("has-file", !!upload);
}

function salesProjectCollectDirectRows(modal) {
  return Array.from(modal.querySelectorAll("[data-project-direct-detected-row]")).map(row => {
    const model = salesProjectModelNo(row.querySelector('[data-project-direct-field="modelNo"]')?.value || "");
    const quantity = Number(row.querySelector('[data-project-direct-field="quantity"]')?.value || 0) || 0;
    return { modelNo: model, quantity };
  }).filter(row => row.modelNo || row.quantity);
}

function salesProjectApplyDirectStatuses(modal, rows = []) {
  const boqModels = new Set(collectSalesProjectBoqRows(modal).map(row => norm(row.model)).filter(Boolean));
  return rows.map(row => {
    const modelNo = salesProjectModelNo(row.modelNo || "");
    const quantity = Number(row.quantity || 0) || 0;
    let status = row.status || "Matched";
    if (!modelNo || !quantity) status = "Needs Review";
    else if (!boqModels.has(norm(modelNo))) status = "Not in BOQ";
    else status = "Matched";
    return { modelNo, quantity: quantity || "", status };
  });
}

function salesProjectRefreshDirectDetectedStatuses(modal) {
  modal._directDeliveryDetected = salesProjectApplyDirectStatuses(modal, salesProjectCollectDirectRows(modal));
  salesProjectRenderDirectDetected(modal);
}

function clearSalesProjectDirectDelivery(modal) {
  modal._directDeliveryDetected = [];
  modal._directDeliveryPendingUpload = null;
  salesProjectRenderDirectDetected(modal);
  salesProjectRenderDirectUploadZone(modal, null);
}

async function verifySalesProjectDirectDelivery(modal, project) {
  const detectedRows = salesProjectApplyDirectStatuses(modal, salesProjectCollectDirectRows(modal));
  if (!detectedRows.length) return toast("No detected items to verify.");
  const boqBody = modal.querySelector(".sales-project-boq-edit tbody");
  for (const item of detectedRows) {
    if (!item.modelNo) continue;
    const quantity = Number(item.quantity || 0) || 0;
    const existingRow = Array.from(modal.querySelectorAll("[data-project-boq-row]")).find(row => {
      const model = salesProjectModelNo(row.querySelector('[data-project-boq-field="model"]')?.value || "");
      return norm(model) === norm(item.modelNo);
    });
    if (existingRow) {
      const deliveredInput = existingRow.querySelector('[data-project-boq-field="deliveredQty"]');
      deliveredInput.value = String((Number(deliveredInput.value || 0) || 0) + quantity);
      salesProjectUpdateBoqRow(existingRow, true);
    } else if (boqBody) {
      boqBody.insertAdjacentHTML("beforeend", salesProjectDrawerBoqRowHtml({ model: item.modelNo, qty: quantity, deliveredQty: quantity }, modal.querySelectorAll("[data-project-boq-row]").length));
      salesProjectUpdateBoqRow(boqBody.lastElementChild, true);
    }
  }
  const upload = modal._directDeliveryPendingUpload || {
    id: `direct-delivery-${Date.now()}`,
    uploadId: "",
    originalName: "Manual Delivery Update",
    date: todaySalesDateInput()
  };
  const savedUpload = {
    ...upload,
    date: formatSalesDateInput(upload.date || todaySalesDateInput()),
    deliveryNoteNo: upload.deliveryNoteNo || upload.originalName || "",
    totalQuantity: detectedRows.reduce((sum, row) => sum + (Number(row.quantity || 0) || 0), 0),
    lines: detectedRows
  };
  modal._directDeliveryUploads = [savedUpload, ...(modal._directDeliveryUploads || [])];
  clearSalesProjectDirectDelivery(modal);
  salesProjectRenderDirectUploads(modal, project);
  const payload = collectSalesProjectDrawer(modal, project);
  if (payload.name?.trim() && payload.customer?.trim()) {
    salesCrmState = await api("/api/sales-crm/projects", { method: "POST", body: JSON.stringify(payload) });
  }
  toast("Delivery note verified. Delivered quantities updated successfully.");
}

async function downloadSalesProjectDirectUpload(projectId, uploadId) {
  if (!projectId || !uploadId) return toast("Save the project before downloading this upload.");
  const project = (salesData().projects || []).find(item => item.id === projectId);
  const upload = (project?.directDeliveryUploads || []).find(item => item.uploadId === uploadId || item.id === uploadId);
  const blob = await api(`/api/sales-crm/projects/${encodeURIComponent(projectId)}/direct-delivery/uploads/${encodeURIComponent(uploadId)}`);
  downloadBlob(blob, upload?.originalName || "Delivery Note");
}

async function deleteSalesProjectDirectUpload(modal, project, uploadId) {
  if (!uploadId) return;
  if (project.id) {
    try {
      salesCrmState = await api(`/api/sales-crm/projects/${encodeURIComponent(project.id)}/direct-delivery/uploads/${encodeURIComponent(uploadId)}`, { method: "DELETE" });
    } catch (error) {
      toast(error.message || "Could not delete uploaded file");
      return;
    }
  }
  modal._directDeliveryUploads = (modal._directDeliveryUploads || []).filter(item => item.uploadId !== uploadId && item.id !== uploadId);
  salesProjectRenderDirectUploads(modal, project);
  toast("Uploaded delivery note deleted");
}

function salesProjectModelInfo(value = "") {
  const key = norm(salesProjectModelNo(value));
  if (!key || !inventoryState) return null;
  return [...(inventoryState.models || []), ...(inventoryState.dashboard?.stock || []), ...(inventoryState.stock || [])]
    .find(item => norm(item.modelNo || item.model || item.name || "") === key) || null;
}

function salesProjectModelNo(value = "") {
  const text = String(value || "").trim();
  if (!text) return "";
  const exact = [...(inventoryState?.models || []), ...(inventoryState?.dashboard?.stock || []), ...(inventoryState?.stock || [])]
    .find(item => norm(item.modelNo || item.model || item.name || "") === norm(text));
  if (exact) return exact.modelNo || exact.model || exact.name || text;
  const splitModel = text.split(/\s+-\s+/)[0]?.trim();
  const splitMatch = [...(inventoryState?.models || []), ...(inventoryState?.dashboard?.stock || []), ...(inventoryState?.stock || [])]
    .find(item => norm(item.modelNo || item.model || item.name || "") === norm(splitModel));
  return splitMatch ? (splitMatch.modelNo || splitMatch.model || splitMatch.name || splitModel) : splitModel || text;
}

function collectSalesProjectDrawer(modal, baseProject) {
  const payload = { ...baseProject };
  modal.querySelectorAll("[data-project-drawer-field]").forEach(field => {
    const key = field.dataset.projectDrawerField;
    payload[key] = field.type === "checkbox" ? field.checked : field.value.trim();
  });
  modal.querySelectorAll("[data-project-field]").forEach(field => {
    const key = field.dataset.projectField;
    payload[key] = field.type === "checkbox" ? field.checked : field.value.trim();
  });
  payload.projectNo = payload.projectNo || nextSalesProjectNo();
  payload.projectId = payload.projectNo;
  payload.createdDate = formatSalesDateInput(payload.createdDate || payload.date || todaySalesDateInput());
  payload.date = payload.createdDate;
  payload.targetDate = formatSalesDateInput(payload.targetDate || "");
  payload.expectedDeliveryDate = formatSalesDateInput(payload.expectedDeliveryDate || "");
  payload.type = payload.category || payload.type || "Commercial";
  payload.requirement = payload.productType || payload.requirement || "";
  payload.boq = collectSalesProjectBoqRows(modal);
  payload.directDeliveryUploads = modal._directDeliveryUploads || [];
  payload.status = salesProjectAutoStatus(payload);
  return payload;
}

function collectSalesProjectBoqRows(container) {
  return Array.from(container.querySelectorAll("[data-project-boq-row]")).map(row => {
    const get = key => {
      const field = row.querySelector(`[data-project-boq-field="${key}"]`);
      if (!field) return "";
      return field.type === "checkbox" ? field.checked : field.value.trim();
    };
    const qty = Number(get("qty")) || 0;
    const deliveredQty = Number(get("deliveredQty")) || 0;
    const pendingQty = qty - deliveredQty;
    const model = salesProjectModelNo(get("model"));
    return {
      model,
      description: get("description"),
      qty,
      deliveredQty,
      reserve: pendingQty > 0 && !!get("reserve"),
      pendingQty,
      stock: salesProjectStockQty(model)
    };
  }).filter(row => row.model || row.description || row.qty || row.deliveredQty);
}

async function saveSalesProject(payload) {
  salesCrmState = await api("/api/sales-crm/projects", { method: "POST", body: JSON.stringify(payload) });
  renderSalesDesk();
  toast("Project saved");
}

async function saveSalesProjectDetail(projectId) {
  const project = salesData().projects.find(item => item.id === projectId);
  const panel = document.querySelector(".sales-project-detail-panel");
  if (!project || !panel) return;
  const payload = { ...project };
  panel.querySelectorAll("[data-project-detail-field]").forEach(field => {
    const key = field.dataset.projectDetailField;
    payload[key] = field.value.trim();
  });
  payload.projectNo = payload.projectNo || payload.projectId || nextSalesProjectNo();
  payload.projectId = payload.projectNo;
  payload.createdDate = formatSalesDateInput(payload.date || payload.createdDate || todaySalesDateInput());
  payload.date = payload.createdDate;
  payload.type = payload.category || payload.type || "Commercial";
  payload.requirement = payload.productType || payload.requirement || "";
  payload.boq = collectSalesProjectBoqRows(panel);
  await saveSalesProject(payload);
}

async function markSalesProjectLost(projectId) {
  const project = salesData().projects.find(item => item.id === projectId);
  if (!project) return;
  await saveSalesProject({ ...project, status: "Lost / Closed" });
}

function salesKanbanHtml(rows) {
  const groups = ["Site Visit Done", "Quotation Sent", "Negotiation"];
  return `<div class="sales-kanban">${groups.map(status => `
    <div class="sales-kanban-col">
      <h4>${escapeHtml(status)}</h4>
      ${rows.filter(project => project.status === status).map(project => `
        <article>
          <strong>${escapeHtml(project.name)}</strong>
          <span>${escapeHtml(project.customer)}</span>
          <small>${escapeHtml(formatProjectValue(project.value))}</small>
        </article>`).join("") || `<p class="inventory-muted">No projects.</p>`}
    </div>`).join("")}</div>`;
}

function formatProjectValue(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/aed/i.test(text)) return text;
  const number = Number(text.replace(/,/g, ""));
  return Number.isFinite(number) ? salesMoney(number) : text;
}

function salesQuotationHtml() {
  return salesQuotationMode === "create" ? salesCreateQuotationHtml() : salesQuotationListHtml();
}

function quotationBaseNo(no = "") {
  return String(no || "").replace(/-R\d+$/i, "");
}

function cleanNextSalesQuotationNo() {
  let nextNo = quotationBaseNo(salesData().settings?.nextQuotationNo || `CZ-QTN-${new Date().getFullYear()}-0001`);
  for (const quote of salesData().quotations || []) {
    const quoteNo = quotationBaseNo(quote.baseQuotationNo || quote.no || quote.quotationNo || "");
    if (!quoteNo) continue;
    const candidate = nextSalesQuotationNoFromBase(quoteNo);
    if (quotationNoSequenceValue(candidate) > quotationNoSequenceValue(nextNo)) nextNo = candidate;
  }
  return nextNo;
}

function nextSalesQuotationNoFromBase(value) {
  const text = quotationBaseNo(value);
  const match = text.match(/^(.*?)(\d+)$/);
  if (!match) return `CZ-QTN-${new Date().getFullYear()}-0001`;
  return `${match[1]}${String(Number(match[2]) + 1).padStart(match[2].length, "0")}`;
}

function quotationNoSequenceValue(value) {
  const match = quotationBaseNo(value).match(/(\d+)$/);
  return match ? Number(match[1]) || 0 : 0;
}

function quotationRevisionNo(quote = {}) {
  const match = String(quote.no || quote.quotationNo || "").match(/-R(\d+)$/i);
  if (match) return Number(match[1]) || 0;
  return Number(quote.revisionNo || 0) || 0;
}

function quotationRevisionLabel(quote = {}) {
  const revisionNo = quotationRevisionNo(quote);
  return revisionNo ? `Revision R${revisionNo}` : (quote.revision || "Fresh Quote");
}

function sortQuotationsByRevision(rows, allQuotes = []) {
  const groupOrder = new Map();
  allQuotes.forEach((quote, index) => {
    const baseNo = quotationBaseNo(quote.baseQuotationNo || quote.no || quote.quotationNo || "");
    if (baseNo && !groupOrder.has(baseNo)) groupOrder.set(baseNo, index);
  });
  return [...rows].sort((a, b) => {
    const baseA = quotationBaseNo(a.baseQuotationNo || a.no || a.quotationNo || "");
    const baseB = quotationBaseNo(b.baseQuotationNo || b.no || b.quotationNo || "");
    const orderDiff = (groupOrder.get(baseA) ?? Number.MAX_SAFE_INTEGER) - (groupOrder.get(baseB) ?? Number.MAX_SAFE_INTEGER);
    if (orderDiff) return orderDiff;
    const revisionDiff = quotationRevisionNo(a) - quotationRevisionNo(b);
    if (revisionDiff) return revisionDiff;
    return String(b.date || "").localeCompare(String(a.date || ""));
  });
}

function salesQuotationListHtml() {
  const quotations = salesData().quotations || [];
  const searchedRows = salesFilter(quotations, ["no", "customer", "project", "location", "status"]);
  const tabRows = searchedRows.filter(quote => {
    if (salesQuotationTab === "all") return true;
    return String(quote.status || "").toLowerCase() === salesQuotationTab;
  });
  const rows = sortQuotationsByRevision(tabRows, quotations);
  const totalValue = quotations.reduce((sum, quote) => sum + Number(quote.amount || 0), 0);
  const pendingSent = quotations.filter(quote => ["draft", "revised"].includes(String(quote.status || "").toLowerCase())).length;
  const wonCount = quotations.filter(quote => ["approved", "won"].includes(String(quote.status || "").toLowerCase())).length;
  const conversionRate = quotations.length ? (wonCount / quotations.length) * 100 : 0;
  const sentCount = quotations.filter(quote => String(quote.status || "").toLowerCase() === "sent").length;
  const showingText = rows.length ? `Showing 1 to ${rows.length} of ${rows.length} entries` : "Showing 0 entries";
  const quotationKpis = [
    { label: "Total Value", value: salesCompactMoney(totalValue), caption: "Pipeline value", tone: "blue", icon: "▣" },
    { label: "Pending Drafts", value: pendingSent.toLocaleString(), caption: "Quotes waiting", tone: "orange", icon: "✉" },
    { label: "Conversion Rate", value: `${conversionRate.toFixed(1)}%`, caption: "Won deals", tone: "green", icon: "↗" },
    { label: "Quotation Sent", value: sentCount.toLocaleString(), caption: "Live sent quotations", tone: "purple", icon: "✈" }
  ];
  return `
    <div class="quotation-page">
      <header class="quotation-topbar">
        <div>
          <div class="quotation-title-row">
            <span>Sales Desk</span>
            <b>&lt;</b>
            <h2>Quotations</h2>
          </div>
          <p>Track draft, sent, revised, approved, and lost quotations.</p>
        </div>
        <div class="quotation-actions">
          <label class="quotation-search">
            <span>⌕</span>
            <input data-sales-search value="${escapeHtml(salesSearchQuery)}" placeholder="Search quotations...">
          </label>
          <button class="sales-secondary" data-sales-export="quotations">⇩ Export CSV</button>
          <button class="sales-primary" data-sales-action="create-quotation">⊕ Create Quotation</button>
        </div>
      </header>
      <div class="quotation-kpi-grid">
        ${quotationKpis.map(kpi => `
          <article class="quotation-kpi quotation-kpi-${kpi.tone}">
            <div class="quotation-kpi-icon">${kpi.icon}</div>
            <span>${escapeHtml(kpi.label)}</span>
            <strong>${escapeHtml(kpi.value)}</strong>
            <small>${escapeHtml(kpi.caption)}</small>
          </article>
        `).join("")}
      </div>
      <section class="quotation-table-card">
        <div class="quotation-tabs">
          ${salesQuotationTabButton("all", "All Quotations")}
          ${salesQuotationTabButton("draft", "Draft")}
          ${salesQuotationTabButton("sent", "Sent")}
        </div>
        <table class="sales-table quotation-table">
        <thead><tr><th>Quotation No</th><th>Customer</th><th>Project</th><th>Amount</th><th>Status</th><th>Sales Person</th><th>Actions</th></tr></thead>
        <tbody>${rows.map(quote => `
          <tr>
            <td><strong>${escapeHtml(quote.no)}</strong><br><span>${escapeHtml(quote.date || "")}</span></td>
            <td>${escapeHtml(quote.customer)}</td>
            <td>${escapeHtml(quote.project)}<br><span>${escapeHtml(quote.location)}</span></td>
            <td>${salesMoney(quote.amount)}</td>
            <td>${salesBadge(quote.status)}</td>
            <td>${escapeHtml(quote.salesperson || quote.salesPerson || quote.preparedBy || "")}</td>
            <td>${rowMenu([
              { label: "Edit", action: "edit-quote", id: quote.id },
              { label: "Preview", action: "preview-quote", id: quote.id },
              { label: "PDF", action: "pdf-quote", id: quote.id },
              { label: "Revision", action: "revision-quote", id: quote.id },
              { label: "Create Project", action: "create-project-from-quote", id: quote.id },
              { label: "Create Order Book", action: "create-order-book-from-quote", id: quote.id },
              { label: "Delete", action: "delete-quote", id: quote.id, danger: true }
            ])}</td>
          </tr>`).join("")}</tbody>
      </table>
        <div class="quotation-table-footer">
          <span>${showingText}</span>
          <div class="quotation-pagination"><button disabled>‹</button><button class="active">1</button><button disabled>›</button></div>
        </div>
      </section>
    </div>
  `;
}

function salesQuotationTabButton(value, label) {
  return salesChip(label, {
    class: salesQuotationTab === value ? "active" : "",
    "data-sales-quotation-tab": value
  });
}

function salesCreateQuotationHtml() {
  salesQuotationDraft = salesQuotationDraft || quoteDraftFromSource();
  salesQuotationDraft.quoteType = salesQuotationDraft.quoteType || "VRV";
  if (salesQuotationDraft.quoteType === "VRV" && !String(salesQuotationDraft.terms || "").trim()) {
    salesQuotationDraft.terms = quoteVrvTerms;
  }
  const quoteType = salesQuotationDraft.quoteType || "VRV";
  const itemSubtotal = salesQuotationDraft.items.reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.unitPrice || 0), 0);
  const manualSubtotalText = String(salesQuotationDraft.manualSubtotal ?? "").trim();
  const subtotal = manualSubtotalText ? Number(manualSubtotalText.replace(/,/g, "")) || 0 : itemSubtotal;
  const discount = Number(salesQuotationDraft.discount || 0);
  const taxable = Math.max(0, subtotal - discount);
  const vat = taxable * 0.05;
  const total = taxable + vat;
  const modelOptions = salesQuoteModelOptions();
  return `
    ${salesPageHeader("Create New Quotation", "Prepare a quotation inside Sales Desk.", `<button class="sales-secondary" data-sales-action="quotation-list">Quotation List</button><button class="sales-primary" data-sales-action="save-quote">Save Draft</button><button class="sales-primary" data-sales-action="send-quote">Mark Sent</button>`)}
    <div class="sales-quote-layout">
      <section class="sales-card">
        <div class="sales-card-title"><h3>Quotation Details</h3>${salesBadge("Draft")}</div>
        <div class="sales-form-grid">
          <label>Quotation No<input data-sales-quote-field="quotationNo" value="${escapeHtml(salesQuotationDraft.quotationNo)}"></label>
          <label>Quotation Date<input data-sales-quote-field="quotationDate" value="${escapeHtml(salesQuotationDraft.quotationDate)}"></label>
          <label>Validity<select data-sales-quote-field="validity">${["7 Days", "15 Days", "30 Days"].map(v => `<option ${salesQuotationDraft.validity === v ? "selected" : ""}>${v}</option>`).join("")}</select></label>
          <label>Sales Person<input data-sales-quote-field="salesperson" value="${escapeHtml(salesQuotationDraft.salesperson)}"></label>
          <label>Customer Name<input data-sales-quote-field="customer" list="salesQuoteCustomerList" placeholder="Type to search customer..." value="${escapeHtml(salesQuotationDraft.customer || "")}"><datalist id="salesQuoteCustomerList">${salesCustomerNames().map(name => `<option value="${escapeHtml(name)}"></option>`).join("")}</datalist></label>
          <label>Project Name<input data-sales-quote-field="project" list="salesQuoteProjectList" placeholder="Type to search project..." value="${escapeHtml(salesQuotationDraft.project || "")}"><datalist id="salesQuoteProjectList">${salesData().projects.map(p => `<option value="${escapeHtml(p.name)}"></option>`).join("")}</datalist></label>
          <label>Payment Terms<input data-sales-quote-field="paymentTerms" value="${escapeHtml(salesQuotationDraft.paymentTerms)}"></label>
          <label>Availability<input data-sales-quote-field="deliveryTime" value="${escapeHtml(salesQuotationDraft.deliveryTime || "To be discussed")}"></label>
          <label>Enquiry no<input data-sales-quote-field="warranty" value="${escapeHtml(salesQuotationDraft.warranty === "1 Year" ? "" : salesQuotationDraft.warranty || "")}"></label>
        </div>
        <datalist id="salesQuoteModelList">
          ${modelOptions.map(item => `<option value="${escapeHtml(salesQuoteModelDisplay(item))}"></option>`).join("")}
        </datalist>
        <div class="sales-card-title"><h3>Item Breakdown</h3></div>
        <table class="sales-table sales-quote-table">
          <thead><tr><th>Description</th><th>Qty</th><th>Unit</th><th></th></tr></thead>
          <tbody>${salesQuotationDraft.items.map((item, index) => `
            <tr>
              <td><input data-suggestion-list="salesQuoteModelList" data-sales-quote-line="${index}" data-field="description" placeholder="Type model no..." value="${escapeHtml(item.description)}"></td>
              <td><input type="number" data-sales-quote-line="${index}" data-field="qty" value="${Number(item.qty || 0)}"></td>
              <td><select data-sales-quote-line="${index}" data-field="unit">${["Nos", "Sets", "Meters", "Units"].map(unit => `<option ${item.unit === unit ? "selected" : ""}>${unit}</option>`).join("")}</select></td>
              <td><button data-sales-delete-quote-line="${index}">Delete</button></td>
            </tr>`).join("")}</tbody>
        </table>
        <div class="inventory-actions quote-item-actions"><button class="ghost-button" data-sales-action="add-quote-item">Add Item</button></div>
        <div class="sales-notes-block">
          <div class="sales-notes-heading">
            <span>Additional Remarks / Notes</span>
            <div class="quote-template-toggle" aria-label="Quotation template">
              ${["VRV", "FAHU"].map(type => `<button type="button" class="${quoteType === type ? "active" : ""}" data-sales-quote-preset="${type}">${type}</button>`).join("")}
            </div>
          </div>
          <textarea data-sales-quote-field="notes">${escapeHtml(salesQuotationDraft.notes)}</textarea>
        </div>
        <label class="sales-notes">Terms &amp; Conditions<textarea data-sales-quote-field="terms">${escapeHtml(salesQuotationDraft.terms || "")}</textarea></label>
      </section>
      <aside class="sales-card sales-summary-card">
        <h3>Financial Summary</h3>
        <div><span>Subtotal</span><input data-sales-quote-field="manualSubtotal" inputmode="decimal" pattern="[0-9]*[.]?[0-9]*" value="${escapeHtml(manualSubtotalText || money(itemSubtotal))}"></div>
        <div><span>Discount</span><input data-sales-quote-field="discount" inputmode="decimal" pattern="[0-9]*[.]?[0-9]*" value="${Number(salesQuotationDraft.discount || 0)}"></div>
        <div><span>VAT (5%)</span><strong data-sales-summary="vat">${salesMoney(vat)}</strong></div>
        <div class="sales-total"><span>Grand Total</span><strong data-sales-summary="total">${salesMoney(total)}</strong></div>
      </aside>
    </div>
  `;
}

function salesQuoteModelOptions() {
  const rows = [
    ...(inventoryState?.dashboard?.stock || []),
    ...(inventoryState?.models || [])
  ];
  return Array.from(new Map(rows
    .filter(item => item?.modelNo)
    .map(item => [norm(item.modelNo), item])
  ).values()).sort((a, b) => String(a.modelNo || "").localeCompare(String(b.modelNo || "")));
}

function salesQuoteModelDisplay(item = {}) {
  const modelNo = String(item.modelNo || "").trim();
  const description = String(item.description || "").trim();
  return description ? `${modelNo} - ${description}` : modelNo;
}

function normalizeSalesQuoteModelValue(value = "") {
  const typed = String(value || "").trim();
  if (!typed) return "";
  const typedKey = norm(typed);
  const match = salesQuoteModelOptions().find(item => {
    const modelKey = norm(item.modelNo);
    const displayKey = norm(salesQuoteModelDisplay(item));
    return typedKey === modelKey || typedKey === displayKey;
  });
  return match ? salesQuoteModelDisplay(match) : typed;
}

function toggleSuggestionList(input) {
  const listId = input?.dataset?.suggestionList;
  if (!listId) return;
  if (String(input.value || "").trim()) input.setAttribute("list", listId);
  else input.removeAttribute("list");
}

function salesOrderBookHtml() {
  const orders = salesOrderBookRows();
  const searched = salesOrderBookSearch(orders);
  const filtered = salesOrderBookAdvancedFilter(searched);
  const rows = salesOrderBookTabFilter(filtered);
  const selected = salesOrderBookDetailId ? orders.find(order => order.id === salesOrderBookDetailId) : null;
  const detailOpen = !!selected;
  const stats = salesOrderBookStats(orders);
  return `
    <section class="order-book-page">
      <div class="order-book-header">
        <div>
          <h2>Order Book</h2>
          <p>Track confirmed HVAC orders, job progress, invoices, payments and balance collection.</p>
        </div>
        <div class="order-book-actions">
          <div class="pipeline-search"><input data-sales-search value="${escapeHtml(salesSearchQuery)}" placeholder="Search by order no, customer, job..."><span>Search</span></div>
          <button class="sales-secondary" data-sales-order-book-filter-toggle>Filters</button>
          <button class="sales-primary" data-sales-action="new-order-book">New Order</button>
        </div>
      </div>
      <div class="order-book-kpis">
        ${orderBookKpi("Total Orders", stats.totalOrders, "All confirmed orders", "blue")}
        ${orderBookKpi("Order Value", salesCompactMoney(stats.orderValue), "Including VAT", "green")}
        ${orderBookKpi("Payment Received", salesCompactMoney(stats.received), "Including VAT", "purple")}
        ${orderBookKpi("Balance to Receive", salesCompactMoney(stats.balance), "Pending collection", "orange")}
        ${orderBookKpi("Pending Jobs", stats.pendingJobs, "Not completed", "blue")}
        ${orderBookKpi("Delivery Pending", stats.deliveryPending, "Delivery Status", "red")}
      </div>
      ${salesOrderBookFiltersOpen ? salesOrderBookFilterPanel(orders) : ""}
      <div class="order-book-body ${detailOpen ? "has-detail" : ""}">
        <section class="order-book-table-card">
          <div class="pipeline-tabs">
            ${salesOrderBookTabButton("all", "All Orders")}
            ${salesOrderBookTabButton("material", "Material Pending")}
            ${salesOrderBookTabButton("delivery", "Delivery Pending")}
            ${salesOrderBookTabButton("installation", "Installation Pending")}
            ${salesOrderBookTabButton("partial", "Partially Done")}
            ${salesOrderBookTabButton("completed", "Completed")}
            ${salesOrderBookTabButton("invoice", "Invoice Pending")}
            ${salesOrderBookTabButton("payment", "Payment Pending")}
            ${salesOrderBookTabButton("closed", "Closed")}
          </div>
          <div class="pipeline-table-wrap">
            <table class="sales-table order-book-table">
              <thead><tr><th>Order No</th><th>Customer</th><th>Job Description</th><th>Order Value</th><th>Received</th><th>Balance</th><th>Order Status</th><th>Actions</th></tr></thead>
              <tbody>${rows.map(order => salesOrderBookRow(order)).join("") || `<tr><td colspan="8" class="pipeline-empty">No orders found.</td></tr>`}</tbody>
            </table>
          </div>
          <div class="pipeline-footer">Showing ${rows.length} of ${orders.length} orders</div>
        </section>
        ${detailOpen ? salesOrderBookDetailPanel(selected) : ""}
      </div>
    </section>
  `;
}

function orderBookKpi(label, value, caption, tone = "blue") {
  return `
    <article class="order-book-kpi ${tone}">
      <div class="pipeline-kpi-icon">${salesPipelineKpiIcon(label)}</div>
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(String(value))}</strong>
      <small>${escapeHtml(caption)}</small>
    </article>
  `;
}

function salesOrderBookTabButton(tab, label) {
  return `<button class="${salesOrderBookTab === tab ? "active" : ""}" data-sales-order-book-tab="${escapeHtml(tab)}">${escapeHtml(label)}</button>`;
}

function salesOrderBookFilterPanel(orders) {
  const salesPeople = uniqueValues(orders.map(order => order.salesPerson));
  const customers = uniqueValues([
    ...orders.map(order => order.customer),
    ...(salesData().customers || []).map(customer => customer.name)
  ]);
  const customerListId = "order-book-customer-filter-list";
  return `
    <section class="order-book-filter-panel">
      ${orderBookFilterSelect("Sales Person", "salesPerson", ["", ...salesPeople])}
      <label>Customer
        <input data-sales-order-book-filter-field="customer" list="${customerListId}" placeholder="Search/select customer name" value="${escapeHtml(salesOrderBookFilters.customer)}">
        <datalist id="${customerListId}">${customers.map(customer => `<option value="${escapeHtml(customer)}"></option>`).join("")}</datalist>
      </label>
      ${orderBookFilterSelect("Date Range", "dateRange", ["", "This Month", "Last Month", "Custom Range"])}
      ${salesOrderBookFilters.dateRange === "Custom Range" ? `
        <label>From<input data-sales-order-book-filter-field="startDate" inputmode="numeric" placeholder="DD/MM/YYYY" value="${escapeHtml(salesOrderBookFilters.startDate)}"></label>
        <label>To<input data-sales-order-book-filter-field="endDate" inputmode="numeric" placeholder="DD/MM/YYYY" value="${escapeHtml(salesOrderBookFilters.endDate)}"></label>
      ` : ""}
      ${orderBookFilterSelect("Order Status", "orderStatus", ["", ...orderBookStatuses()])}
      ${orderBookFilterSelect("Payment Status", "paymentStatus", ["", "Not Paid", "Advance Paid", "Partially Paid", "Fully Paid"])}
      ${orderBookFilterSelect("Balance Pending", "balancePending", ["", "Has Balance", "No Balance", "High Balance"])}
      <div class="order-book-filter-actions">
        <button class="sales-secondary" data-sales-action="clear-order-book-filters">Clear</button>
        <button class="sales-secondary" data-sales-export="orderBook">Export CSV</button>
      </div>
    </section>
  `;
}

function orderBookFilterSelect(label, key, options) {
  return `
    <label>${escapeHtml(label)}
      <select data-sales-order-book-filter-field="${escapeHtml(key)}">
        ${options.map(option => `<option value="${escapeHtml(option)}" ${salesOrderBookFilters[key] === option ? "selected" : ""}>${escapeHtml(option || "All")}</option>`).join("")}
      </select>
    </label>
  `;
}

function salesOrderBookRows() {
  return (salesData().orderBook || []).map((order, index) => normalizeOrderBookOrder(order, index));
}

function normalizeOrderBookOrder(order = {}, index = 0) {
  const invoices = Array.isArray(order.invoices) ? order.invoices : [];
  const payments = Array.isArray(order.payments) ? order.payments : [];
  const valueWithoutVat = salesNumber(order.valueWithoutVat);
  const vatAmount = salesNumber(order.vatAmount || (valueWithoutVat ? valueWithoutVat * 0.05 : 0));
  const orderValue = salesNumber(order.orderValue || order.valueIncludingVat || (valueWithoutVat + vatAmount));
  const invoiceAmount = invoices.reduce((sum, item) => sum + salesNumber(item.totalAmount || item.amount), 0);
  const received = invoices.length ? invoiceAmount : salesNumber(order.paymentReceived || payments.reduce((sum, item) => sum + salesNumber(item.amount), 0));
  const balance = orderValue - received;
  const paymentStatus = orderBookPaymentStatus(received, balance, invoiceAmount);
  const invoiceStatus = orderBookInvoiceStatus(invoices, invoiceAmount, orderValue);
  const status = orderBookStatusFromPayment(orderValue, received);
  const equipmentValue = salesNumber(order.equipmentValue);
  const equipmentCost = salesNumber(order.equipmentCost);
  const equipmentProfit = salesNumber(order.equipmentProfit || (equipmentValue && equipmentCost ? equipmentValue - equipmentCost : 0));
  const grossMargin = salesNumber(order.grossMargin || (equipmentValue ? (equipmentProfit / equipmentValue) * 100 : 0));
  return {
    ...order,
    id: order.id || `order-${index + 1}`,
    orderNo: order.orderNo || `CZ${String(new Date().getFullYear()).slice(-2)}-${String(1000 + index + 1)}`,
    date: formatSalesDateInput(order.date || todaySalesDateInput()),
    customer: order.customer || "",
    jobDescription: order.jobDescription || order.project || "",
    location: order.location || "",
    contactPerson: order.contactPerson || "",
    contactNumber: order.contactNumber || "",
    division: order.division || "Project/Inst",
    brand: order.brand || "Daikin",
    salesPerson: order.salesPerson || "",
    status,
    deliveryStatus: order.deliveryStatus || "Pending Delivery",
    remarks: order.remarks || "",
    valueWithoutVat,
    vatAmount,
    orderValue,
    installationValue: salesNumber(order.installationValue),
    equipmentValue,
    equipmentCost,
    equipmentProfit,
    grossMargin,
    paymentReceived: received,
    balance,
    invoiceAmount,
    paymentStatus,
    invoiceStatus,
    invoices,
    payments,
    timeline: Array.isArray(order.timeline) ? order.timeline : [],
    po: order.po || {}
  };
}

function orderBookPaymentStatus(received, balance, invoiceAmount = 0) {
  if (received <= 0) return "Not Paid";
  if (balance < 0) return "Fully Paid";
  if (balance <= 0.01) return "Fully Paid";
  if (!invoiceAmount) return "Advance Paid";
  return "Partially Paid";
}

function orderBookStatusFromPayment(orderValue, paymentReceived) {
  const value = salesNumber(orderValue);
  const received = salesNumber(paymentReceived);
  if (received <= 0) return "Payment Pending";
  if (value > 0 && received >= value - 0.01) return "Completed";
  return "Partially Paid";
}

function orderBookInvoiceStatus(invoices, invoiceAmount, orderValue) {
  if (!invoices.length && !invoiceAmount) return "Not Attached";
  if (invoiceAmount > 0 && invoiceAmount < orderValue) return "Partial";
  return "Attached";
}

function salesOrderBookStats(orders) {
  return {
    totalOrders: orders.length,
    orderValue: orders.reduce((sum, order) => sum + order.orderValue, 0),
    received: orders.reduce((sum, order) => sum + order.paymentReceived, 0),
    balance: orders.reduce((sum, order) => sum + Math.max(0, order.balance), 0),
    pendingJobs: orders.filter(order => !["COMPLETED", "CLOSED", "CANCELLED"].includes(norm(order.status))).length,
    deliveryPending: orders.filter(order => orderBookIsDeliveryPending(order)).length
  };
}

function orderBookIsDeliveryPending(order = {}) {
  const deliveryStatus = norm(order.deliveryStatus || order.status);
  return deliveryStatus !== "DELIVERED";
}

function salesOrderBookSearch(rows) {
  const q = salesSearchQuery.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter(order => [
    order.orderNo, order.customer, order.jobDescription, order.location, order.status,
    order.division, order.brand, order.salesPerson, order.invoiceStatus
  ].join(" ").toLowerCase().includes(q));
}

function salesOrderBookAdvancedFilter(rows) {
  return rows.filter(order => {
    if (salesOrderBookFilters.salesPerson && norm(order.salesPerson) !== norm(salesOrderBookFilters.salesPerson)) return false;
    if (salesOrderBookFilters.customer && !norm(order.customer).includes(norm(salesOrderBookFilters.customer))) return false;
    if (salesOrderBookFilters.orderStatus && norm(order.status) !== norm(salesOrderBookFilters.orderStatus)) return false;
    if (salesOrderBookFilters.paymentStatus && norm(order.paymentStatus) !== norm(salesOrderBookFilters.paymentStatus)) return false;
    if (!orderMatchesOrderBookDateRange(order)) return false;
    const balance = Number(order.balance || 0);
    if (salesOrderBookFilters.balancePending === "Has Balance" && balance <= 0.01) return false;
    if (salesOrderBookFilters.balancePending === "No Balance" && balance > 0.01) return false;
    if (salesOrderBookFilters.balancePending === "High Balance" && balance < 50000) return false;
    return true;
  });
}

function orderMatchesOrderBookDateRange(order) {
  const range = salesOrderBookFilters.dateRange;
  if (!range) return true;
  const orderDate = parseSalesDate(order.date);
  if (!orderDate) return false;
  const today = salesStartOfToday();
  if (range === "This Month") {
    return orderDate.getFullYear() === today.getFullYear() && orderDate.getMonth() === today.getMonth();
  }
  if (range === "Last Month") {
    const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const end = new Date(today.getFullYear(), today.getMonth(), 0);
    return orderDate >= start && orderDate <= end;
  }
  if (range === "Custom Range") {
    const start = parseSalesDate(salesOrderBookFilters.startDate);
    const end = parseSalesDate(salesOrderBookFilters.endDate);
    if (start && orderDate < start) return false;
    if (end && orderDate > end) return false;
  }
  return true;
}

function salesOrderBookTabFilter(rows) {
  if (salesOrderBookTab === "material") return rows.filter(order => norm(order.status).includes("MATERIAL"));
  if (salesOrderBookTab === "delivery") return rows.filter(order => norm(order.status).includes("DELIVERY") || norm(order.status).includes("DELIVERED"));
  if (salesOrderBookTab === "installation") return rows.filter(order => norm(order.status).includes("INSTALLATION"));
  if (salesOrderBookTab === "partial") return rows.filter(order => norm(order.status).includes("PARTIALLY"));
  if (salesOrderBookTab === "completed") return rows.filter(order => norm(order.status).includes("COMPLETED"));
  if (salesOrderBookTab === "invoice") return rows.filter(order => order.invoiceStatus !== "Attached" || norm(order.status).includes("INVOICE"));
  if (salesOrderBookTab === "payment") return rows.filter(order => order.balance > 0.01 || norm(order.status).includes("PAYMENT"));
  if (salesOrderBookTab === "closed") return rows.filter(order => ["CLOSED", "CANCELLED"].includes(norm(order.status)));
  return rows;
}

function salesOrderBookRow(order) {
  return `
    <tr class="${order.id === salesOrderBookDetailId ? "selected" : ""}">
      <td><button class="pipeline-link" data-sales-action="view-order-book" data-sales-id="${escapeHtml(order.id)}">${escapeHtml(order.orderNo)}</button><br><span class="order-book-subline">${escapeHtml(order.date)}</span></td>
      <td><strong>${escapeHtml(order.customer)}</strong><br><span>${escapeHtml(order.location)}</span></td>
      <td><strong>${escapeHtml(order.jobDescription)}</strong><br><span class="order-book-subline">${escapeHtml(order.division)}</span></td>
      <td>${salesMoneyPlain(order.orderValue)}</td>
      <td class="money-positive">${salesMoneyPlain(order.paymentReceived)}</td>
      <td class="${order.balance > 0 ? "money-danger" : "money-positive"}">${salesMoneyPlain(Math.max(0, order.balance))}</td>
      <td>${salesOrderBookBadge(order.status, "status")}</td>
      <td>
        <div class="pipeline-row-actions">
          <button data-sales-action="view-order-book" data-sales-id="${escapeHtml(order.id)}">View</button>
          <button data-sales-action="edit-order-book" data-sales-id="${escapeHtml(order.id)}">Edit</button>
          ${rowMenu([
            { label: "Upload Invoice", action: "order-book-invoice", id: order.id },
            { label: "Delete", action: "delete-order-book", id: order.id, danger: true }
          ])}
        </div>
      </td>
    </tr>
  `;
}

function salesOrderBookBadge(label, type = "") {
  const key = String(label || "").toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return `<span class="order-book-badge ${type} ${key}">${escapeHtml(label || "-")}</span>`;
}

function salesMoneyPlain(value) {
  return Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function salesOrderBookDetailPanel(order) {
  return `
    <aside class="order-book-detail">
      <div class="pipeline-detail-head">
        <div class="pipeline-detail-title">
          <h3>${escapeHtml(order.orderNo)}</h3>
          ${salesOrderBookBadge(order.status, "status")}
        </div>
        <button class="mini-button" data-sales-action="close-order-book-detail">X</button>
      </div>
      <div class="pipeline-detail-meta">
        <p>Order Date: ${escapeHtml(order.date)}${order.salesPerson ? ` by ${escapeHtml(order.salesPerson)}` : ""}</p>
        ${rowMenu([
          { label: "Edit", action: "edit-order-book", id: order.id },
          { label: "Upload PO", action: "order-book-po", id: order.id },
          { label: "Delete", action: "delete-order-book", id: order.id, danger: true }
        ])}
      </div>
      ${salesDetailSection("Order Information", [
        ["Order No", order.orderNo],
        ["Date", order.date],
        ["Customer", order.customer],
        ["Job Description", order.jobDescription],
        ["Division", order.division],
        ["Brand", order.brand],
        ["Sales Person", order.salesPerson],
        ["Order Status", order.status],
        ["Remarks", order.remarks]
      ])}
      ${salesDetailSection("Commercial Summary", [
        ["Value without VAT", salesMoney(order.valueWithoutVat)],
        ["VAT Amount", salesMoney(order.vatAmount)],
        ["Value including VAT", salesMoney(order.orderValue)],
        ["Installation without VAT", salesMoney(order.installationValue)],
        ["Equipment without VAT", salesMoney(order.equipmentValue)],
        ["Equipment Cost", salesMoney(order.equipmentCost)],
        ["Equipment Profit", salesMoney(order.equipmentProfit)],
        ["Gross Margin", `${order.grossMargin.toFixed(2)}%`]
      ])}
      ${salesDetailSection("Payment Summary", [
        ["Order Value Inc. VAT", salesMoney(order.orderValue)],
        ["Invoice Amount", salesMoney(order.invoiceAmount)],
        ["Payment Received", salesMoney(order.paymentReceived)],
        ["Balance to Receive", salesMoney(Math.max(0, order.balance))],
        ["Payment Status", order.paymentStatus]
      ])}
      <section class="pipeline-detail-section">
        <h4>Purchase Order Attachment</h4>
        <dl>
          <div><dt>PO No</dt><dd>${escapeHtml(order.po?.poNo || "-")}</dd></div>
          <div><dt>PO Date</dt><dd>${escapeHtml(order.po?.poDate || "-")}</dd></div>
          <div><dt>PO Value</dt><dd>${order.po?.poValue ? salesMoney(order.po.poValue) : "-"}</dd></div>
          <div><dt>File</dt><dd>${escapeHtml(order.po?.fileName || "No PO attached")}</dd></div>
        </dl>
        <div class="order-book-detail-actions">
          <button class="sales-secondary" data-sales-action="order-book-po" data-sales-id="${escapeHtml(order.id)}">${order.po?.fileName ? "Replace PO" : "Upload PO"}</button>
          ${order.po?.fileData ? `<button class="sales-secondary" data-menu-action="download-order-book-po" data-menu-id="${escapeHtml(order.id)}">Download PO</button>` : ""}
        </div>
      </section>
      <section class="pipeline-detail-section">
        <h4>Invoice Attachments</h4>
        <div class="order-book-mini-table">
          ${(order.invoices || []).map((invoice, index) => `<div><button class="pipeline-link" data-menu-action="download-order-book-invoice" data-menu-id="${escapeHtml(order.id)}" data-invoice-index="${index}">${escapeHtml(invoice.invoiceNo || invoice.fileName || "Invoice")}</button><span>${escapeHtml(invoice.invoiceDate || "")}</span><span>${invoice.totalAmount ? salesMoney(invoice.totalAmount) : "-"}</span></div>`).join("") || `<p class="pipeline-muted">No invoices attached yet.</p>`}
        </div>
      </section>
      <section class="pipeline-detail-section">
        <h4>Job Timeline</h4>
        <div class="sales-timeline">
          ${(order.timeline || []).map(item => `<div><span>${escapeHtml(item.date || "")}</span><strong>${escapeHtml(item.label || "")}</strong><p>${escapeHtml(item.note || "")}</p></div>`).join("") || `<div><span>${escapeHtml(order.date)}</span><strong>Order Confirmed</strong><p>Order record created.</p></div>`}
        </div>
      </section>
    </aside>
  `;
}

function blankOrderBookOrder() {
  const no = nextOrderBookNo();
  return {
    id: "",
    orderNo: no,
    date: todaySalesDateInput(),
    customer: "",
    jobDescription: "",
    location: "",
    contactPerson: "",
    contactNumber: "",
    salesPerson: currentUser?.name || "",
    division: "Project/Inst",
    brand: "Daikin",
    status: "Order Confirmed",
    remarks: "",
    valueWithoutVat: 0,
    vatAmount: 0,
    orderValue: 0,
    installationValue: 0,
    equipmentValue: 0,
    equipmentCost: 0,
    paymentReceived: 0,
    invoices: [],
    payments: [],
    timeline: []
  };
}

function nextOrderBookNo() {
  const existing = salesOrderBookRows().map(order => order.orderNo).filter(Boolean);
  const latest = existing.find(Boolean) || `CZ${String(new Date().getFullYear()).slice(-2)}-1000`;
  const match = latest.match(/^(.*?)(\d+)$/);
  if (!match) return `CZ${String(new Date().getFullYear()).slice(-2)}-1001`;
  return `${match[1]}${String(Number(match[2]) + 1).padStart(match[2].length, "0")}`;
}

function openOrderBookForm(orderId = "") {
  const existing = orderId ? salesOrderBookRows().find(item => item.id === orderId) : null;
  const item = existing ? structuredClone(existing) : blankOrderBookOrder();
  const modal = document.createElement("div");
  modal.className = "modal-backdrop sales-drawer-backdrop";
  modal.innerHTML = `
    <aside class="sales-lead-drawer order-book-drawer">
      <div class="sales-lead-drawer-head">
        <div><h2>${existing ? "Edit Order" : "New Order"}</h2><p>Capture confirmed HVAC order, commercial and payment details.</p></div>
        <button class="mini-button" data-close-sales-modal>X</button>
      </div>
      <div class="sales-lead-form">
        ${orderBookFormSection("Basic Details", [
          orderBookField("orderNo", "Order No", item.orderNo),
          orderBookField("date", "Date", item.date, "dateText"),
          orderBookField("customer", "Customer", item.customer, "list", salesCustomerNames()),
          orderBookField("jobDescription", "Job Description", item.jobDescription, "textarea"),
          orderBookField("location", "Location", item.location),
          orderBookField("contactPerson", "Contact Person", item.contactPerson),
          orderBookField("contactNumber", "Contact Number", item.contactNumber),
          orderBookField("salesPerson", "Sales Person", item.salesPerson),
          orderBookField("division", "Division", item.division, "select", ["Project/Inst", "Maint/Replace", "Trading"]),
          orderBookField("brand", "Brand", item.brand),
          `<label>Upload PO<button type="button" class="sales-secondary order-book-inline-upload" id="scanOrderBookPoBtn">Upload PO</button><small id="orderBookPoScanStatus">${escapeHtml(item.po?.fileName || "Upload PO to auto-fill order details")}</small></label>`,
          `<textarea id="orderBookUploadedPoJson" hidden>${escapeHtml(item.po ? JSON.stringify(item.po) : "")}</textarea>`
        ])}
        ${orderBookFormSection("Commercial Details", [
          orderBookField("valueWithoutVat", "Value without VAT", item.valueWithoutVat, "money"),
          orderBookField("vatAmount", "VAT Amount", item.vatAmount, "money"),
          orderBookField("orderValue", "Value including VAT", item.orderValue, "money"),
          orderBookField("installationValue", "Installation without VAT", item.installationValue, "money"),
          orderBookField("equipmentValue", "Equipment without VAT", item.equipmentValue, "money"),
          orderBookField("equipmentCost", "Equipment Cost", item.equipmentCost, "money")
        ])}
        ${orderBookFormSection("Payment & Job Status", [
          orderBookField("paymentReceived", "Payment Received Inc. VAT", item.paymentReceived, "money"),
          orderBookField("deliveryStatus", "Delivery Status", item.deliveryStatus || "Pending Delivery", "select", orderBookDeliveryStatuses()),
          orderBookField("status", "Order Status", item.status, "select", orderBookJobStatuses()),
          orderBookField("remarks", "Remarks", item.remarks, "textarea")
        ])}
        ${orderBookInvoicePaymentsSection(item)}
      </div>
      <div class="sales-lead-drawer-actions">
        <button class="ghost-button" data-close-sales-modal>Cancel</button>
        <button class="primary-button" id="saveOrderBookBtn">Save Order</button>
      </div>
    </aside>
  `;
  document.body.appendChild(modal);
  modal.querySelectorAll("[data-close-sales-modal]").forEach(button => button.addEventListener("click", () => modal.remove()));
  modal.querySelector("#scanOrderBookPoBtn")?.addEventListener("click", () => scanOrderBookPoIntoForm(modal));
  modal.querySelector("#scanOrderBookInvoiceBtn")?.addEventListener("click", () => scanOrderBookInvoiceIntoForm(modal));
  modal.addEventListener("input", event => {
    if (event.target.matches("[data-order-invoice-field]")) updateOrderBookPaymentReceivedFromInvoices(modal);
    if (event.target.matches('[data-order-book-field="orderValue"], [data-order-book-field="paymentReceived"], [data-order-invoice-field="totalAmount"]')) updateOrderBookStatusFromPayment(modal);
  });
  modal.addEventListener("click", event => {
    const deleteButton = event.target.closest("[data-delete-order-invoice]");
    if (deleteButton) {
      deleteButton.closest("[data-order-invoice-row]")?.remove();
      updateOrderBookPaymentReceivedFromInvoices(modal);
    }
  });
  modal.querySelector("#saveOrderBookBtn").addEventListener("click", async () => {
    const payload = collectOrderBookPayload(modal, item);
    if (!payload.orderNo || !payload.customer) return alert("Order No and customer are required.");
    const savedCustomer = requireSavedSalesCustomer(payload.customer, "Order customer");
    if (!savedCustomer) return;
    payload.customer = savedCustomer.name;
    salesCrmState = await api("/api/sales-crm/orderBook", { method: "POST", body: JSON.stringify(payload) });
    salesOrderBookDetailId = payload.id || (salesData().orderBook || [])[0]?.id || "";
    modal.remove();
    renderSalesDesk();
    toast("Order saved");
  });
}

function orderBookStatuses() {
  return ["Order Confirmed", "Material Pending", "Ready for Delivery", "Delivered", "Installation Pending", "Partially Done", "Completed", "Invoice Pending", "Payment Pending", "Partially Paid", "Closed", "On Hold", "Cancelled"];
}

function orderBookJobStatuses() {
  return ["Order Confirmed", "Partially Done", "Completed", "Payment Pending", "Partially Paid", "Cancelled"];
}

function orderBookDeliveryStatuses() {
  return ["Pending Delivery", "Ready for Delivery", "Partially Delivered", "Delivered"];
}

function orderBookFormSection(title, fields) {
  return `<section class="sales-lead-form-section"><h3>${escapeHtml(title)}</h3><div class="sales-lead-form-grid">${fields.join("")}</div></section>`;
}

function orderBookInvoicePaymentsSection(item) {
  const invoices = Array.isArray(item.invoices) ? item.invoices : [];
  return `
    <section class="sales-lead-form-section order-book-payments-section">
      <div class="order-book-section-head">
        <h3>Payments</h3>
        <button type="button" class="sales-secondary" id="scanOrderBookInvoiceBtn">Upload Invoice</button>
      </div>
      <small id="orderBookInvoiceScanStatus" class="order-book-scan-status">Upload invoice to auto-fill payment received. If total is unclear, amount stays blank.</small>
      <div class="order-book-payment-table-wrap">
        <table class="order-book-payment-table">
          <thead>
            <tr>
              <th>Invoice Date</th>
              <th>Payment Received</th>
              <th>Remarks</th>
              <th>Invoice</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody id="orderBookInvoiceRows">
            ${invoices.map(orderBookInvoiceRowHtml).join("") || `<tr class="order-book-empty-row"><td colspan="5">No invoices uploaded.</td></tr>`}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function orderBookInvoiceRowHtml(invoice = {}) {
  const payload = escapeHtml(JSON.stringify({
    id: invoice.id || String(Date.now()),
    fileName: invoice.fileName || "",
    fileType: invoice.fileType || "",
    fileSize: invoice.fileSize || 0,
    fileData: invoice.fileData || "",
    invoiceNo: invoice.invoiceNo || ""
  }));
  return `
    <tr data-order-invoice-row data-invoice-payload="${payload}">
      <td><input data-order-invoice-field="invoiceDate" placeholder="DD/MM/YYYY" value="${escapeHtml(formatSalesDateInput(invoice.invoiceDate || invoice.date || ""))}"></td>
      <td><input data-order-invoice-field="totalAmount" inputmode="decimal" value="${escapeHtml(invoice.totalAmount ? String(invoice.totalAmount) : "")}"></td>
      <td><input data-order-invoice-field="remarks" value="${escapeHtml(invoice.remarks || "")}"></td>
      <td><span class="order-book-file-pill">${escapeHtml(invoice.fileName || invoice.invoiceNo || "Manual entry")}</span></td>
      <td><button type="button" class="danger-button compact-danger" data-delete-order-invoice>Delete</button></td>
    </tr>
  `;
}

function orderBookField(key, label, value = "", type = "text", options = []) {
  const attrs = `data-order-book-field="${escapeHtml(key)}"`;
  if (type === "textarea") return `<label class="span-two">${escapeHtml(label)}<textarea ${attrs}>${escapeHtml(value || "")}</textarea></label>`;
  if (type === "select") return `<label>${escapeHtml(label)}<select ${attrs}>${options.map(option => `<option ${String(value) === option ? "selected" : ""}>${escapeHtml(option)}</option>`).join("")}</select></label>`;
  if (type === "list") {
    const listId = `order-book-${key}-${Math.random().toString(36).slice(2)}`;
    return `<label>${escapeHtml(label)}<input ${attrs} list="${listId}" value="${escapeHtml(value || "")}"><datalist id="${listId}">${uniqueValues(options).map(option => `<option value="${escapeHtml(option)}"></option>`).join("")}</datalist></label>`;
  }
  if (type === "dateText") return `<label>${escapeHtml(label)}<input ${attrs} inputmode="numeric" placeholder="DD/MM/YYYY" value="${escapeHtml(formatSalesDateInput(value || ""))}"></label>`;
  if (type === "money") return `<label>${escapeHtml(label)}<input ${attrs} inputmode="decimal" value="${escapeHtml(value ? String(value) : "")}"></label>`;
  return `<label>${escapeHtml(label)}<input ${attrs} value="${escapeHtml(value || "")}"></label>`;
}

function collectOrderBookPayload(modal, base) {
  const payload = { ...base };
  modal.querySelectorAll("[data-order-book-field]").forEach(input => {
    const key = input.dataset.orderBookField;
    const value = input.value.trim();
    payload[key] = ["valueWithoutVat", "vatAmount", "orderValue", "installationValue", "equipmentValue", "equipmentCost", "paymentReceived"].includes(key)
      ? salesNumber(value)
      : key === "date" ? formatSalesDateInput(value) : value;
  });
  payload.invoices = collectOrderBookInvoiceRows(modal);
  const invoicePaymentTotal = payload.invoices.reduce((sum, invoice) => sum + salesNumber(invoice.totalAmount), 0);
  payload.invoiceAmount = invoicePaymentTotal;
  if (payload.invoices.length) payload.paymentReceived = invoicePaymentTotal;
  if (!payload.vatAmount && payload.valueWithoutVat) payload.vatAmount = payload.valueWithoutVat * 0.05;
  if (!payload.orderValue && payload.valueWithoutVat) payload.orderValue = payload.valueWithoutVat + payload.vatAmount;
  payload.status = orderBookStatusFromPayment(payload.orderValue, payload.paymentReceived);
  const uploadedPoJson = modal.querySelector("#orderBookUploadedPoJson")?.value || "";
  if (uploadedPoJson) {
    try {
      payload.po = { ...(payload.po || {}), ...JSON.parse(uploadedPoJson) };
    } catch {}
  }
  payload.equipmentProfit = salesNumber(payload.equipmentValue) - salesNumber(payload.equipmentCost);
  payload.grossMargin = payload.equipmentValue ? (payload.equipmentProfit / payload.equipmentValue) * 100 : 0;
  payload.timeline = Array.isArray(payload.timeline) && payload.timeline.length ? payload.timeline : [{ date: payload.date, label: "Order Confirmed", note: "Order record created." }];
  return payload;
}

function collectOrderBookInvoiceRows(modal) {
  return Array.from(modal.querySelectorAll("[data-order-invoice-row]")).map(row => {
    let payload = {};
    try {
      payload = JSON.parse(row.dataset.invoicePayload || "{}");
    } catch {}
    row.querySelectorAll("[data-order-invoice-field]").forEach(input => {
      const key = input.dataset.orderInvoiceField;
      payload[key] = key === "totalAmount" ? salesNumber(input.value) : key === "invoiceDate" ? formatSalesDateInput(input.value) : input.value.trim();
    });
    payload.amount = payload.totalAmount;
    return payload;
  });
}

function updateOrderBookPaymentReceivedFromInvoices(modal) {
  const total = collectOrderBookInvoiceRows(modal).reduce((sum, invoice) => sum + salesNumber(invoice.totalAmount), 0);
  fillOrderBookField(modal, "paymentReceived", total || "");
  updateOrderBookStatusFromPayment(modal);
}

function updateOrderBookStatusFromPayment(modal) {
  const orderValue = modal.querySelector('[data-order-book-field="orderValue"]')?.value || "";
  const paymentReceived = modal.querySelector('[data-order-book-field="paymentReceived"]')?.value || "";
  fillOrderBookField(modal, "status", orderBookStatusFromPayment(orderValue, paymentReceived));
}

async function scanOrderBookPoIntoForm(modal) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".pdf,.png,.jpg,.jpeg,.doc,.docx";
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    const status = modal.querySelector("#orderBookPoScanStatus");
    if (status) status.textContent = "Scanning PO...";
    try {
      const form = new FormData();
      form.append("file", file);
      const [result, storedFile] = await Promise.all([
        api("/api/sales-crm/order-book/extract-po", { method: "POST", body: form }),
        fileToStoredAttachment(file)
      ]);
      const extracted = result.order || {};
      const matchedCustomer = findSalesCustomerByName(extracted.customer);
      fillOrderBookField(modal, "customer", matchedCustomer ? matchedCustomer.name : "");
      fillOrderBookField(modal, "jobDescription", extracted.jobDescription);
      fillOrderBookField(modal, "location", extracted.location);
      fillOrderBookField(modal, "contactPerson", extracted.contactPerson);
      fillOrderBookField(modal, "contactNumber", extracted.contactNumber);
      fillOrderBookField(modal, "division", extracted.division);
      fillOrderBookField(modal, "valueWithoutVat", extracted.valueWithoutVat);
      fillOrderBookField(modal, "vatAmount", extracted.vatAmount);
      fillOrderBookField(modal, "orderValue", extracted.orderValue);
      updateOrderBookStatusFromPayment(modal);
      const poPayload = {
        ...storedFile,
        poNo: extracted.poNo || "",
        poDate: formatSalesDateInput(extracted.poDate || ""),
        poValue: salesNumber(extracted.orderValue || 0)
      };
      const hidden = modal.querySelector("#orderBookUploadedPoJson");
      if (hidden) hidden.value = JSON.stringify(poPayload);
      if (status) status.textContent = result.message || `${file.name} scanned. Review before saving.`;
      toast(result.message || "PO scanned. Review and save the order.");
    } catch (error) {
      if (status) status.textContent = "Could not scan PO. Fill details manually.";
      toast(error.message || "Could not scan PO");
    }
  };
  input.click();
}

async function scanOrderBookInvoiceIntoForm(modal) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".pdf,.png,.jpg,.jpeg,.doc,.docx";
  input.multiple = true;
  input.onchange = async () => {
    const files = Array.from(input.files || []);
    if (!files.length) return;
    const status = modal.querySelector("#orderBookInvoiceScanStatus");
    const tbody = modal.querySelector("#orderBookInvoiceRows");
    if (status) status.textContent = `Scanning ${files.length} invoice${files.length > 1 ? "s" : ""}...`;
    if (tbody) tbody.querySelector(".order-book-empty-row")?.remove();
    for (const file of files) {
      try {
        const form = new FormData();
        form.append("file", file);
        const [result, storedFile] = await Promise.all([
          api("/api/sales-crm/order-book/extract-invoice", { method: "POST", body: form }),
          fileToStoredAttachment(file)
        ]);
        const extracted = result.invoice || {};
        const invoice = {
          id: String(Date.now()) + Math.random().toString(36).slice(2),
          ...storedFile,
          invoiceNo: extracted.invoiceNo || "",
          invoiceDate: formatSalesDateInput(extracted.invoiceDate || todaySalesDateInput()),
          totalAmount: salesNumber(extracted.totalAmount) || "",
          remarks: ""
        };
        tbody?.insertAdjacentHTML("beforeend", orderBookInvoiceRowHtml(invoice));
      } catch (error) {
        const storedFile = await fileToStoredAttachment(file);
        const invoice = {
          id: String(Date.now()) + Math.random().toString(36).slice(2),
          ...storedFile,
          invoiceDate: todaySalesDateInput(),
          totalAmount: "",
          remarks: ""
        };
        tbody?.insertAdjacentHTML("beforeend", orderBookInvoiceRowHtml(invoice));
      }
    }
    updateOrderBookPaymentReceivedFromInvoices(modal);
    if (status) status.textContent = "Invoice added. Verify payment amount before saving.";
    toast("Invoice added. Review payment amount.");
  };
  input.click();
}

function fillOrderBookField(modal, key, value) {
  if (value === undefined || value === null || value === "") return;
  const field = modal.querySelector(`[data-order-book-field="${CSS.escape(key)}"]`);
  if (!field) return;
  field.value = ["valueWithoutVat", "vatAmount", "orderValue", "paymentReceived"].includes(key) ? salesNumber(value) || "" : value;
}

async function scanOrderBookAttachmentInvoice(modal) {
  const file = modal.querySelector("#orderBookFileInput")?.files?.[0];
  if (!file) return;
  const status = modal.querySelector("#orderBookAttachmentScanStatus");
  if (status) status.textContent = "Scanning invoice...";
  try {
    const form = new FormData();
    form.append("file", file);
    const result = await api("/api/sales-crm/order-book/extract-invoice", { method: "POST", body: form });
    const invoice = result.invoice || {};
    const set = (key, value) => {
      const field = modal.querySelector(`[data-order-attach-field="${CSS.escape(key)}"]`);
      if (field && value !== undefined && value !== null && value !== "") field.value = value;
    };
    set("invoiceNo", invoice.invoiceNo || "");
    set("invoiceDate", formatSalesDateInput(invoice.invoiceDate || todaySalesDateInput()));
    set("totalAmount", salesNumber(invoice.totalAmount) || "");
    if (status) status.textContent = invoice.totalAmount ? "Invoice scanned. Verify before saving." : "Invoice scanned, but amount was unclear. Enter amount manually.";
  } catch (error) {
    if (status) status.textContent = "Could not scan invoice. Enter amount manually.";
  }
}

function openOrderBookAttachment(orderId, kind) {
  const order = salesOrderBookRows().find(item => item.id === orderId);
  if (!order) return;
  const isPo = kind === "po";
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.innerHTML = `
    <div class="modal order-book-upload-modal">
      <div class="inventory-topbar">
        <div><h2>${isPo ? "Upload Purchase Order" : "Upload Invoice"}</h2><p class="inventory-muted">Attach file and verify detected details before saving.</p></div>
        <button class="mini-button" data-close-sales-modal>Close</button>
      </div>
      <div class="form-grid">
        <label class="span-two">File<input type="file" id="orderBookFileInput" accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"></label>
        ${isPo ? `
          <label>PO No<input data-order-attach-field="poNo" value="${escapeHtml(order.po?.poNo || "")}"></label>
          <label>PO Date<input data-order-attach-field="poDate" placeholder="DD/MM/YYYY" value="${escapeHtml(order.po?.poDate || order.date || "")}"></label>
          <label>PO Value<input data-order-attach-field="poValue" inputmode="decimal" value="${escapeHtml(order.po?.poValue || order.orderValue || "")}"></label>
          <label class="span-two">Job Description<input data-order-attach-field="jobDescription" value="${escapeHtml(order.jobDescription || "")}"></label>
        ` : `
          <label>Invoice No<input data-order-attach-field="invoiceNo"></label>
          <label>Invoice Date<input data-order-attach-field="invoiceDate" placeholder="DD/MM/YYYY" value="${escapeHtml(todaySalesDateInput())}"></label>
          <label>Amount Excl. VAT<input data-order-attach-field="amountExVat" inputmode="decimal"></label>
          <label>VAT Amount<input data-order-attach-field="vatAmount" inputmode="decimal"></label>
          <label>Total Amount<input data-order-attach-field="totalAmount" inputmode="decimal"></label>
          <label class="span-two">Remarks<input data-order-attach-field="remarks"></label>
          <small class="span-two order-book-scan-status" id="orderBookAttachmentScanStatus">Upload invoice to scan total amount. If unclear, leave blank and enter manually.</small>
        `}
      </div>
      <div class="inventory-actions">
        <button class="ghost-button" data-close-sales-modal>Cancel</button>
        <button class="primary-button" id="saveOrderBookAttachmentBtn">${isPo ? "Save PO" : "Save Invoice"}</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.querySelectorAll("[data-close-sales-modal]").forEach(button => button.addEventListener("click", () => modal.remove()));
  if (!isPo) {
    modal.querySelector("#orderBookFileInput")?.addEventListener("change", () => scanOrderBookAttachmentInvoice(modal));
  }
  modal.querySelector("#saveOrderBookAttachmentBtn").addEventListener("click", async () => {
    const file = modal.querySelector("#orderBookFileInput").files?.[0];
    const fields = {};
    modal.querySelectorAll("[data-order-attach-field]").forEach(input => fields[input.dataset.orderAttachField] = input.value.trim());
    const filePayload = file ? await fileToStoredAttachment(file) : {};
    const payload = { ...order };
    if (isPo) {
      payload.po = { ...(payload.po || {}), ...filePayload, poNo: fields.poNo, poDate: formatSalesDateInput(fields.poDate), poValue: salesNumber(fields.poValue) };
      payload.date = payload.po.poDate || payload.date;
      payload.orderValue = payload.po.poValue || payload.orderValue;
      payload.jobDescription = fields.jobDescription || payload.jobDescription;
    } else {
      payload.invoices = [{ id: String(Date.now()), ...filePayload, invoiceNo: fields.invoiceNo, invoiceDate: formatSalesDateInput(fields.invoiceDate), amountExVat: salesNumber(fields.amountExVat), vatAmount: salesNumber(fields.vatAmount), totalAmount: salesNumber(fields.totalAmount), remarks: fields.remarks }, ...(payload.invoices || [])];
      payload.invoiceAmount = payload.invoices.reduce((sum, invoice) => sum + salesNumber(invoice.totalAmount), 0);
      payload.paymentReceived = payload.invoiceAmount;
    }
    salesCrmState = await api("/api/sales-crm/orderBook", { method: "POST", body: JSON.stringify(payload) });
    salesOrderBookDetailId = order.id;
    modal.remove();
    renderSalesDesk();
    toast(isPo ? "Purchase order saved" : "Invoice saved");
  });
}

function fileToStoredAttachment(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ fileName: file.name, fileType: file.type, fileSize: file.size, fileData: reader.result });
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function downloadOrderBookAttachment(orderId, kind, invoiceIndex = "") {
  const order = salesOrderBookRows().find(item => item.id === orderId);
  const file = kind === "po" ? order?.po : (order?.invoices || [])[Number(invoiceIndex)];
  if (!file?.fileData) return toast("No file attached");
  const link = document.createElement("a");
  link.href = file.fileData;
  link.download = file.fileName || "attachment";
  link.click();
}

function salesFollowUpsHtml() {
  const followUps = salesFollowUpRows();
  const searchableRows = salesFilter(followUps, ["customer", "phone", "project", "quotation", "date", "due", "status"]);
  const rows = salesFollowUpFilter ? searchableRows.filter(item => followUpBucket(item) === salesFollowUpFilter) : searchableRows;
  const overdueCount = followUps.filter(item => followUpBucket(item) === "overdue").length;
  const todayCount = followUps.filter(item => followUpBucket(item) === "today").length;
  const upcomingCount = followUps.filter(item => followUpBucket(item) === "upcoming").length;
  const completedCount = followUps.filter(item => ["COMPLETED", "CONFIRMED"].some(status => norm(item.status).includes(status))).length;
  const successRate = followUps.length ? (completedCount / followUps.length) * 100 : 0;
  const filterLabels = [
    ["", "All"],
    ["overdue", "Overdue"],
    ["today", "Today"],
    ["upcoming", "Upcoming"],
    ["completed", "Completed"]
  ];
  return `
    ${salesPageHeader("Follow-ups", "Manage and track sent quotation follow-ups.", `<button class="sales-secondary" data-sales-export="followUps">Export CSV</button><button class="sales-primary" data-sales-action="add-follow-up">Add Follow-up</button>`)}
    <div class="sales-kpi-grid">
      ${salesKpi("Overdue Follow-ups", overdueCount.toLocaleString(), "Needs", "attention", "warning")}
      ${salesKpi("Due Today", todayCount.toLocaleString(), "Today", "follow-up")}
      ${salesKpi("Upcoming This Week", upcomingCount.toLocaleString(), "Planned", "range")}
      ${salesKpi("Success Rate", `${successRate.toFixed(1)}%`, "Confirmed", "follow-ups", "success")}
    </div>
    <section class="sales-card">
      <div class="sales-filter-row">
        ${salesChip("List View", { class: salesFollowUpMode === "list" ? "active" : "", "data-sales-follow-mode": "list" })}
        ${salesChip("Calendar View", { class: salesFollowUpMode === "calendar" ? "active" : "", "data-sales-follow-mode": "calendar" })}
        ${salesChip("Filter", { class: salesFollowUpFilterOpen || salesFollowUpFilter ? "active" : "", "data-sales-follow-filter-toggle": "1" })}
        <span class="sales-filter-count">Showing: ${rows.length} of ${searchableRows.length}</span>
      </div>
      ${salesFollowUpFilterOpen ? `<div class="sales-filter-row">${filterLabels.map(([value, label]) => salesChip(label, { class: salesFollowUpFilter === value ? "active" : "", "data-sales-follow-filter": value })).join("")}</div>` : ""}
      ${salesFollowUpMode === "calendar" ? salesFollowUpCalendarHtml(rows) : salesFollowUpTableHtml(rows)}
    </section>
  `;
}

function salesFollowUpRows() {
  const data = salesData();
  const manualRows = (data.followUps || []).map(item => ({ ...item, status: normalizeFollowUpStatus(item.status), source: "manual" }));
  const manualQuotationKeys = new Set(manualRows.map(item => norm(item.quotation)).filter(Boolean));
  const quotationRows = (data.quotations || [])
    .filter(isFollowUpQuotation)
    .filter(quote => !manualQuotationKeys.has(norm(quote.no)))
    .map(quotationFollowUpRow);
  return [...quotationRows, ...manualRows];
}

function normalizeFollowUpStatus(status) {
  const key = norm(status);
  if (key.includes("CONFIRMED") || key.includes("COMPLETED") || key.includes("DONE")) return "Confirmed";
  if (key.includes("NEGOTIATION")) return "Negotiation";
  if (key.includes("AWAITING") || key.includes("OVERDUE")) return "Awaiting Response";
  return "Quotation Sent";
}

function isFollowUpQuotation(quote) {
  return ["SENT", "QUOTATIONSENT", "AWAITINGRESPONSE", "NEGOTIATION", "CONFIRMED"].includes(norm(quote?.status));
}

function quotationFollowUpRow(quote) {
  const customer = (salesData().customers || []).find(item => norm(item.name) === norm(quote.customer)) || {};
  const displayStatus = norm(quote.status) === "SENT" ? "Quotation Sent" : quote.status || "Quotation Sent";
  return {
    id: `quote-${quote.id}`,
    quoteId: quote.id,
    source: "quotation",
    avatar: customer.icon || initialsText(quote.customer),
    customer: quote.customer || "",
    phone: customer.phone || "",
    project: quote.project || "",
    quotation: quote.no || "",
    date: formatSalesDateInput(quote.date || ""),
    due: "",
    type: "Quotation",
    status: displayStatus
  };
}

function findSalesQuotation(identifier) {
  const key = norm(identifier);
  return (salesData().quotations || []).find(item => norm(item.id) === key || norm(item.no) === key);
}

function salesFollowUpTableHtml(rows) {
  return `
    <table class="sales-table">
      <thead><tr><th>Customer</th><th>Project</th><th>Quotation No.</th><th>Quotation Date</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody>${rows.map(item => `
        <tr>
          <td>${salesAvatar(item.avatar)}<strong>${escapeHtml(item.customer)}</strong><br><span>${escapeHtml(item.phone)}</span></td>
          <td>${escapeHtml(item.project)}</td>
          <td>${escapeHtml(item.quotation)}</td>
          <td>${escapeHtml(item.date)}${item.due ? `<br><span>${escapeHtml(item.due)}</span>` : ""}</td>
          <td>${item.source === "quotation" ? salesQuotationFollowStatusSelect(item) : salesManualFollowStatusSelect(item)}</td>
          <td>${item.source === "quotation" ? rowMenu([
            { label: "Edit Quotation", action: "edit-quote", id: item.quoteId || item.quotation },
            { label: "Preview", action: "preview-quote", id: item.quoteId || item.quotation },
            { label: "PDF", action: "pdf-quote", id: item.quoteId || item.quotation }
          ]) : rowMenu([
            { label: "Edit", action: "edit-follow-up", id: item.id },
            { label: "Done", action: "complete-follow-up", id: item.id },
            { label: "Delete", action: "delete-follow-up", id: item.id, danger: true }
          ])}</td>
        </tr>`).join("") || `<tr><td colspan="6">No follow-ups found.</td></tr>`}</tbody>
    </table>
  `;
}

function salesQuotationFollowStatusSelect(item) {
  const statuses = ["Quotation Sent", "Awaiting Response", "Negotiation", "Confirmed"];
  return `<select class="sales-inline-select" data-quote-follow-status="${escapeHtml(item.quoteId)}">${statuses.map(status => `<option value="${escapeHtml(status)}" ${norm(item.status) === norm(status) ? "selected" : ""}>${escapeHtml(status)}</option>`).join("")}</select>`;
}

function salesManualFollowStatusSelect(item) {
  const statuses = ["Quotation Sent", "Awaiting Response", "Negotiation", "Confirmed"];
  return `<select class="sales-inline-select" data-manual-follow-status="${escapeHtml(item.id)}">${statuses.map(status => `<option value="${escapeHtml(status)}" ${norm(item.status) === norm(status) ? "selected" : ""}>${escapeHtml(status)}</option>`).join("")}</select>`;
}

function salesFollowUpCalendarHtml(rows) {
  const groups = new Map();
  rows.forEach(item => {
    const date = followUpDate(item);
    const key = date ? salesDateKey(date) : "No date";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  });
  const sortedGroups = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  return `<div class="sales-kanban sales-follow-calendar">
    ${sortedGroups.map(([dateKey, items]) => `
      <div class="sales-kanban-col">
        <h4>${escapeHtml(formatSalesCalendarDate(dateKey))}</h4>
        ${items.map(item => `<article>
          <strong>${escapeHtml(item.customer)}</strong>
          <span>${escapeHtml(item.project)}</span>
          <small>${escapeHtml(item.quotation)}${item.quotation ? " - " : ""}${escapeHtml(item.status)}</small>
        </article>`).join("")}
      </div>`).join("") || `<p class="inventory-muted">No follow-ups found.</p>`}
  </div>`;
}

function salesFilter(rows, fields) {
  const q = salesSearchQuery.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter(row => fields.map(field => row[field] || "").join(" ").toLowerCase().includes(q));
}

function salesChip(label, attrs = {}) {
  const className = ["sales-chip", attrs.class || ""].filter(Boolean).join(" ");
  const attributes = Object.entries(attrs)
    .filter(([key]) => key !== "class")
    .map(([key, value]) => ` ${key}="${escapeHtml(value)}"`)
    .join("");
  return `<button class="${className}"${attributes}>${escapeHtml(label)}</button>`;
}

function salesAvatar(text) {
  return `<span class="sales-avatar">${escapeHtml(text || "CZ")}</span>`;
}

function initialsText(value) {
  return String(value || "CZ").trim().split(/\s+/).slice(0, 2).map(part => part[0] || "").join("").toUpperCase() || "CZ";
}

function salesBadge(status) {
  const key = String(status || "").toLowerCase().replace(/\s+/g, "-");
  return `<span class="sales-badge ${key}">${escapeHtml(status || "")}</span>`;
}

function salesMoney(value) {
  return `AED ${Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function salesCompactMoney(value) {
  const amount = Number(value || 0);
  if (Math.abs(amount) >= 1000000) return `AED ${(amount / 1000000).toFixed(1).replace(/\.0$/, "")}m`;
  if (Math.abs(amount) >= 1000) return `AED ${(amount / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return `AED ${amount.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function salesCompactNumber(value) {
  const amount = Number(value || 0);
  if (Math.abs(amount) >= 1000000) return `${(amount / 1000000).toFixed(1).replace(/\.0$/, "")}m`;
  if (Math.abs(amount) >= 1000) return `${(amount / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return amount.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function clearSalesLeadBoardDragState() {
  document.querySelectorAll(".lead-board-card.dragging, .lead-board-column.drag-over").forEach(element => {
    element.classList.remove("dragging", "drag-over");
  });
}

function handleSalesLeadBoardDragStart(event) {
  const card = event.target.closest("[data-lead-board-card]");
  if (salesLeadViewMode !== "board" || !card || event.target.closest("button")) return;
  salesLeadDraggedId = card.dataset.leadBoardCard || "";
  if (!salesLeadDraggedId) return;
  card.classList.add("dragging");
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", salesLeadDraggedId);
}

function handleSalesLeadBoardDragOver(event) {
  const column = event.target.closest("[data-lead-board-drop]");
  if (salesLeadViewMode !== "board" || !column || !salesLeadDraggedId) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
  document.querySelectorAll(".lead-board-column.drag-over").forEach(element => {
    if (element !== column) element.classList.remove("drag-over");
  });
  column.classList.add("drag-over");
}

function handleSalesLeadBoardDragLeave(event) {
  const column = event.target.closest("[data-lead-board-drop]");
  if (!column || column.contains(event.relatedTarget)) return;
  column.classList.remove("drag-over");
}

function updateSalesLeadStatusLocal(leadId, status) {
  const current = salesData();
  if (!current?.leads) return;
  salesCrmState = {
    ...current,
    leads: current.leads.map(lead => lead.id === leadId ? { ...lead, status } : lead)
  };
  salesCrmLoadedAt = Date.now();
}

async function handleSalesLeadBoardDrop(event) {
  const column = event.target.closest("[data-lead-board-drop]");
  if (salesLeadViewMode !== "board" || !column) return;
  event.preventDefault();
  const leadId = event.dataTransfer?.getData("text/plain") || salesLeadDraggedId;
  const nextStatus = column.dataset.leadBoardStatus || "";
  clearSalesLeadBoardDragState();
  salesLeadDraggedId = "";
  if (!leadId || !nextStatus) return;
  const lead = (salesData().leads || []).find(item => item.id === leadId);
  if (!lead || salesLeadBoardGroupKey(lead) === column.dataset.leadBoardDrop) return;
  updateSalesLeadStatusLocal(leadId, nextStatus);
  salesLeadDetailId = leadId;
  renderSalesDesk();
  try {
    salesCrmState = await api("/api/sales-crm/leads", {
      method: "POST",
      body: JSON.stringify({ ...lead, status: nextStatus })
    });
    salesCrmLoadedAt = Date.now();
    renderSalesDesk();
    toast(`Enquiry moved to ${nextStatus}`);
  } catch (error) {
    await loadSalesCrm({ force: true });
    renderSalesDesk();
    toast(error.message || "Unable to move enquiry");
  }
}

function handleSalesLeadBoardDragEnd() {
  salesLeadDraggedId = "";
  clearSalesLeadBoardDragState();
}

function handleSalesClick(event) {
  const target = event.target.closest("button");
  const inSalesRoot = !!(target && $("#salesDeskRoot").contains(target));
  const inSalesTopbar = !!(target && $("#viewActions")?.contains(target));
  if (!target || (!inSalesRoot && !inSalesTopbar)) return;
  if (target.dataset.rowMenu !== undefined) {
    toggleSalesFloatingMenu(target);
    return;
  }
  if (target.dataset.menuAction) {
    return handleSalesMenuAction(target.dataset.menuAction, target.dataset.menuId, target.dataset);
  }
  if (target.dataset.salesExport) {
    exportSalesCsv(target.dataset.salesExport);
    return;
  }
  if (target.dataset.goInventory) {
    showInventory(target.dataset.goInventory);
    return;
  }
  if (target.dataset.salesGoto) {
    showSalesDesk(target.dataset.salesGoto);
    return;
  }
  if (target.dataset.salesQuotationTab) {
    salesQuotationTab = target.dataset.salesQuotationTab;
    renderSalesDesk();
    return;
  }
  if (target.dataset.salesLeadTab) {
    salesLeadTab = target.dataset.salesLeadTab;
    salesLeadDetailId = "";
    renderSalesDesk();
    return;
  }
  if (target.dataset.salesLeadView) {
    salesLeadViewMode = target.dataset.salesLeadView;
    if (salesLeadViewMode !== "split") salesLeadDetailId = "";
    renderSalesDesk();
    return;
  }
  if (target.dataset.salesLeadSelect) {
    salesLeadDetailId = target.dataset.salesLeadSelect;
    renderSalesDesk();
    return;
  }
  if (target.dataset.salesLeadFilterToggle !== undefined) {
    salesLeadFiltersOpen = !salesLeadFiltersOpen;
    renderSalesDesk();
    return;
  }
  if (target.dataset.salesAction === "clear-lead-filters") {
    salesLeadFilters = { salesPerson: "", productType: "", status: "", receivedDate: "", finalizingMonth: "", minValue: "", maxValue: "", customer: "", flag: "" };
    renderSalesDesk();
    return;
  }
  if (target.dataset.salesLeadFilter !== undefined) {
    salesLeadFilter = target.dataset.salesLeadFilter;
    renderSalesDesk();
    return;
  }
  if (target.dataset.salesQuotePreset) {
    applySalesQuotePreset(target.dataset.salesQuotePreset);
    return;
  }
  if (target.dataset.salesProjectMode) {
    salesProjectMode = target.dataset.salesProjectMode;
    renderSalesDesk();
    return;
  }
  if (target.dataset.salesProjectFilter !== undefined) {
    salesProjectFilter = target.dataset.salesProjectFilter;
    renderSalesDesk();
    return;
  }
  if (target.dataset.salesProjectSelect) {
    salesProjectDetailId = target.dataset.salesProjectSelect;
    renderSalesDesk();
    return;
  }
  if (target.dataset.salesProjectCloseDetail !== undefined) {
    salesProjectDetailId = "";
    renderSalesDesk();
    return;
  }
  if (target.dataset.salesProjectDetailSave) {
    saveSalesProjectDetail(target.dataset.salesProjectDetailSave);
    return;
  }
  if (target.dataset.salesFollowMode) {
    salesFollowUpMode = target.dataset.salesFollowMode;
    renderSalesDesk();
    return;
  }
  if (target.dataset.salesFollowFilterToggle !== undefined) {
    salesFollowUpFilterOpen = !salesFollowUpFilterOpen;
    renderSalesDesk();
    return;
  }
  if (target.dataset.salesFollowFilter !== undefined) {
    salesFollowUpFilter = target.dataset.salesFollowFilter;
    renderSalesDesk();
    return;
  }
  if (target.dataset.salesOrderBookTab) {
    salesOrderBookTab = target.dataset.salesOrderBookTab;
    renderSalesDesk();
    return;
  }
  if (target.dataset.salesOrderBookFilterToggle !== undefined) {
    salesOrderBookFiltersOpen = !salesOrderBookFiltersOpen;
    renderSalesDesk();
    return;
  }
  if (target.dataset.salesAction === "clear-order-book-filters") {
    salesOrderBookFilters = { salesPerson: "", customer: "", dateRange: "", startDate: "", endDate: "", orderStatus: "", paymentStatus: "", balancePending: "" };
    renderSalesDesk();
    return;
  }
  if (target.dataset.salesDeleteQuoteLine) {
    salesQuotationDraft.items.splice(Number(target.dataset.salesDeleteQuoteLine), 1);
    renderSalesDesk();
    return;
  }
  const action = target.dataset.salesAction;
  if (action === "create-quotation") {
    salesQuotationDraft = null;
    salesQuotationMode = "create";
    showSalesDesk("quotation");
  }
  if (action === "import-leads") toast("Excel import for enquiry pipeline will be mapped in the next step");
  if (action === "view-lead") {
    salesLeadDetailId = target.dataset.salesId || "";
    if (salesLeadViewMode === "board") salesLeadViewMode = "split";
    renderSalesDesk();
  }
  if (action === "close-lead-detail") {
    salesLeadDetailId = "";
    renderSalesDesk();
  }
  if (action === "call-lead") {
    const lead = normalizeSalesLead(salesData().leads.find(item => item.id === target.dataset.salesId) || {});
    if (lead.contactNumber) location.href = `tel:${lead.contactNumber.replace(/\s+/g, "")}`;
  }
  if (action === "lead-quote") {
    const lead = normalizeSalesLead(salesData().leads.find(item => item.id === target.dataset.salesId) || {});
    salesQuotationDraft = quoteDraftFromSource({ customer: lead.customer || "", project: lead.projectDescription || "", location: lead.location || lead.plotNo || "", enquiryNo: lead.enquiryNo || "", sourceLeadId: lead.id || target.dataset.salesId || "" });
    salesQuotationMode = "create";
    showSalesDesk("quotation");
  }
  if (action === "project-quote") {
    const project = salesData().projects.find(item => item.id === target.dataset.salesId);
    salesQuotationDraft = quoteDraftFromSource({ customer: project?.customer || "", project: project?.name || "", location: project?.location || "" });
    salesQuotationMode = "create";
    showSalesDesk("quotation");
  }
  if (action === "quotation-list") {
    salesQuotationMode = "list";
    renderSalesDesk();
  }
  if (action === "add-quote-item") {
    salesQuotationDraft.items.push({ description: "", qty: 1, unit: "Nos", unitPrice: 0 });
    renderSalesDesk();
  }
  if (action === "save-quote") saveSalesQuotation("Draft");
  if (action === "send-quote") saveSalesQuotation("Sent");
  if (action === "preview-quote") previewSalesQuotation(target.dataset.salesId);
  if (action === "pdf-quote") downloadSalesQuotationPdf(target.dataset.salesId);
  if (action === "copy-quote" || action === "revision-quote") createSalesQuotationRevision(target.dataset.salesId);
  if (action === "create-project-from-quote") createProjectFromQuotation(target.dataset.salesId);
  if (action === "create-order-book-from-quote") createOrderBookFromQuotation(target.dataset.salesId);
  if (action === "edit-quote") editSalesQuotation(target.dataset.salesId);
  if (action === "delete-quote") deleteSalesItem("quotations", target.dataset.salesId);
  if (action === "new-lead") openSalesLeadDrawer();
  if (action === "edit-lead") openSalesLeadDrawer(target.dataset.salesId);
  if (action === "delete-lead") deleteSalesItem("leads", target.dataset.salesId);
  if (action === "lead-add-follow-up") openSalesLeadFollowUp(target.dataset.salesId);
  if (action === "delete-lead-follow-up") deleteLeadFollowUp(target.dataset.salesId, target.dataset.followIndex);
  if (action === "add-customer") openSalesForm("customers");
  if (action === "edit-customer") openSalesForm("customers", target.dataset.salesId);
  if (action === "delete-customer") deleteSalesItem("customers", target.dataset.salesId);
  if (action === "customer-history") {
    salesQuotationMode = "list";
    salesSearchQuery = salesData().customers.find(item => item.id === target.dataset.salesId)?.name || "";
    showSalesDesk("quotation");
  }
  if (action === "view-project") {
    salesProjectDetailId = target.dataset.salesId || "";
    renderSalesDesk();
  }
  if (action === "edit-project") openSalesProjectDrawer(target.dataset.salesId);
  if (action === "new-project") openSalesProjectDrawer();
  if (action === "project-lost") markSalesProjectLost(target.dataset.salesId);
  if (action === "delete-project") deleteSalesItem("projects", target.dataset.salesId);
  if (action === "add-follow-up") openSalesForm("followUps");
  if (action === "edit-follow-up") openSalesForm("followUps", target.dataset.salesId);
  if (action === "delete-follow-up") deleteSalesItem("followUps", target.dataset.salesId);
  if (action === "complete-follow-up") completeSalesFollowUp(target.dataset.salesId);
  if (action === "new-order-book") openOrderBookForm();
  if (action === "view-order-book") {
    salesOrderBookDetailId = target.dataset.salesId || "";
    renderSalesDesk();
  }
  if (action === "close-order-book-detail") {
    salesOrderBookDetailId = "";
    renderSalesDesk();
  }
  if (action === "edit-order-book") openOrderBookForm(target.dataset.salesId);
  if (action === "delete-order-book") deleteSalesItem("orderBook", target.dataset.salesId);
  if (action === "order-book-po") openOrderBookAttachment(target.dataset.salesId, "po");
  if (action === "order-book-invoice") openOrderBookAttachment(target.dataset.salesId, "invoice");
  if (action === "order-book-import") toast("Excel import mapping for Order Book can be added in the next step");
}

function handleSalesMenuAction(action, itemId, meta = {}) {
  document.querySelectorAll(".row-menu-list").forEach(list => list.classList.add("hidden"));
  const quote = ["preview-quote", "pdf-quote", "copy-quote", "revision-quote", "create-project-from-quote", "create-order-book-from-quote", "edit-quote", "delete-quote"].includes(action) ? findSalesQuotation(itemId) : null;
  const quoteId = quote?.id || itemId;
  if (action === "lead-to-customer") return createCustomerFromLead(itemId);
  if (action === "lead-create-project") return createProjectFromLead(itemId);
  if (action === "lead-create-workflow") return createWorkflowFromLead(itemId);
  if (action === "lead-quote") {
    const lead = normalizeSalesLead(salesData().leads.find(item => item.id === itemId) || {});
    salesQuotationDraft = quoteDraftFromSource({ customer: lead.customer || "", project: lead.projectDescription || "", location: lead.location || lead.plotNo || "", enquiryNo: lead.enquiryNo || "", sourceLeadId: lead.id || itemId || "" });
    salesQuotationMode = "create";
    return showSalesDesk("quotation");
  }
  if (action === "view-lead") {
    salesLeadDetailId = itemId;
    return renderSalesDesk();
  }
  if (action === "edit-lead") return openSalesLeadDrawer(itemId);
  if (action === "lead-add-follow-up") return openSalesLeadFollowUp(itemId);
  if (action === "lead-more") return toast("More enquiry actions can be added here");
  if (action === "delete-lead") return deleteSalesItem("leads", itemId);
  if (action === "customer-history") {
    salesQuotationMode = "list";
    salesSearchQuery = salesData().customers.find(item => item.id === itemId)?.name || "";
    return showSalesDesk("quotation");
  }
  if (action === "edit-customer") return openSalesForm("customers", itemId);
  if (action === "delete-customer") return deleteSalesItem("customers", itemId);
  if (action === "project-quote") {
    const project = salesData().projects.find(item => item.id === itemId);
    salesQuotationDraft = quoteDraftFromSource({ customer: project?.customer || "", project: project?.name || "", location: project?.location || "" });
    salesQuotationMode = "create";
    return showSalesDesk("quotation");
  }
  if (action === "view-project") {
    salesProjectDetailId = itemId;
    return renderSalesDesk();
  }
  if (action === "edit-project") return openSalesProjectDrawer(itemId);
  if (action === "project-lost") return markSalesProjectLost(itemId);
  if (action === "delete-project") return deleteSalesItem("projects", itemId);
  if (action === "preview-quote") return previewSalesQuotation(quoteId);
  if (action === "pdf-quote") return downloadSalesQuotationPdf(quoteId);
  if (action === "copy-quote" || action === "revision-quote") return createSalesQuotationRevision(quoteId);
  if (action === "create-project-from-quote") return createProjectFromQuotation(quoteId);
  if (action === "create-order-book-from-quote") return createOrderBookFromQuotation(quoteId);
  if (action === "edit-quote") return editSalesQuotation(quoteId);
  if (action === "delete-quote") return deleteSalesItem("quotations", quoteId);
  if (action === "edit-follow-up") return openSalesForm("followUps", itemId);
  if (action === "complete-follow-up") return completeSalesFollowUp(itemId);
  if (action === "delete-follow-up") return deleteSalesItem("followUps", itemId);
  if (action === "view-order-book") {
    salesOrderBookDetailId = itemId;
    return renderSalesDesk();
  }
  if (action === "edit-order-book") return openOrderBookForm(itemId);
  if (action === "order-book-po") return openOrderBookAttachment(itemId, "po");
  if (action === "order-book-invoice") return openOrderBookAttachment(itemId, "invoice");
  if (action === "download-order-book-po") return downloadOrderBookAttachment(itemId, "po");
  if (action === "download-order-book-invoice") return downloadOrderBookAttachment(itemId, "invoice", meta.invoiceIndex);
  if (action === "delete-order-book") return deleteSalesItem("orderBook", itemId);
}

function handleSalesInput(event) {
  if (event.target.dataset.suggestionList) {
    toggleSuggestionList(event.target);
  }
  if (event.target.matches("[data-sales-search]")) {
    const cursor = event.target.selectionStart || 0;
    salesSearchQuery = event.target.value;
    renderSalesDesk();
    const input = document.querySelector("[data-sales-search]");
    if (input) {
      input.focus();
      input.setSelectionRange(cursor, cursor);
    }
    return;
  }
  if (event.target.dataset.salesLeadFilterField) {
    const key = event.target.dataset.salesLeadFilterField;
    salesLeadFilters[key] = event.target.value;
    renderSalesDesk();
    return;
  }
  if (event.target.dataset.salesOrderBookFilterField) {
    const key = event.target.dataset.salesOrderBookFilterField;
    const cursor = event.target.selectionStart || 0;
    salesOrderBookFilters[key] = event.target.value;
    renderSalesDesk();
    const input = document.querySelector(`[data-sales-order-book-filter-field="${CSS.escape(key)}"]`);
    if (input && input.tagName === "INPUT") {
      input.focus();
      input.setSelectionRange(cursor, cursor);
    }
    return;
  }
  if (event.target.dataset.salesQuoteField && ["manualSubtotal", "discount"].includes(event.target.dataset.salesQuoteField)) {
    const cleanValue = sanitizeSalesMoneyInput(event.target.value);
    if (event.target.value !== cleanValue) event.target.value = cleanValue;
    salesQuotationDraft[event.target.dataset.salesQuoteField] = cleanValue;
    updateSalesQuoteSummaryValues();
    return;
  }
  updateSalesQuotationDraft(event, false);
}

function handleSalesChange(event) {
  if (event.target.dataset.suggestionList) {
    toggleSuggestionList(event.target);
  }
  if (event.target.dataset.salesLeadFilterField) {
    const key = event.target.dataset.salesLeadFilterField;
    salesLeadFilters[key] = event.target.value;
    renderSalesDesk();
    return;
  }
  if (event.target.dataset.salesOrderBookFilterField) {
    const key = event.target.dataset.salesOrderBookFilterField;
    salesOrderBookFilters[key] = event.target.value;
    if (key === "dateRange" && salesOrderBookFilters.dateRange !== "Custom Range") {
      salesOrderBookFilters.startDate = "";
      salesOrderBookFilters.endDate = "";
    }
    renderSalesDesk();
    return;
  }
  if (event.target.dataset.quoteFollowStatus) {
    updateQuotationFollowStatus(event.target.dataset.quoteFollowStatus, event.target.value);
    return;
  }
  if (event.target.dataset.manualFollowStatus) {
    updateManualFollowStatus(event.target.dataset.manualFollowStatus, event.target.value);
    return;
  }
  updateSalesQuotationDraft(event, true);
}

function sanitizeSalesMoneyInput(value) {
  const parts = String(value || "").replace(/,/g, "").replace(/[^\d.]/g, "").split(".");
  if (parts.length === 1) return parts[0];
  return `${parts[0]}.${parts.slice(1).join("")}`;
}

function updateSalesQuoteSummaryValues() {
  if (!salesQuotationDraft) return;
  const itemSubtotal = salesQuotationDraft.items.reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.unitPrice || 0), 0);
  const manualSubtotalText = String(salesQuotationDraft.manualSubtotal ?? "").trim();
  const subtotal = manualSubtotalText ? Number(manualSubtotalText.replace(/,/g, "")) || 0 : itemSubtotal;
  const discount = Number(String(salesQuotationDraft.discount || "").replace(/,/g, "")) || 0;
  const taxable = Math.max(0, subtotal - discount);
  const vat = taxable * 0.05;
  const total = taxable + vat;
  const vatEl = document.querySelector('[data-sales-summary="vat"]');
  const totalEl = document.querySelector('[data-sales-summary="total"]');
  if (vatEl) vatEl.textContent = salesMoney(vat);
  if (totalEl) totalEl.textContent = salesMoney(total);
}

function updateSalesQuotationDraft(event, shouldRender = false) {
  if (!salesQuotationDraft) return;
  const field = event.target.dataset.salesQuoteField;
  if (field) {
    salesQuotationDraft[field] = event.target.value;
    if (shouldRender) renderSalesDesk();
    return;
  }
  const index = event.target.dataset.salesQuoteLine;
  const lineField = event.target.dataset.field;
  if (index !== undefined && lineField) {
    const item = salesQuotationDraft.items[Number(index)];
    if (!item) return;
    const value = lineField === "description" && shouldRender
      ? normalizeSalesQuoteModelValue(event.target.value)
      : event.target.value;
    item[lineField] = ["qty", "unitPrice"].includes(lineField) ? Number(value || 0) : value;
    if (shouldRender) renderSalesDesk();
  }
}

function toggleSalesFloatingMenu(button) {
  const menu = button.closest(".row-menu")?.querySelector(".row-menu-list");
  if (!menu) return;
  const shouldOpen = menu.classList.contains("hidden");
  document.querySelectorAll(".row-menu-list").forEach(list => {
    if (list !== menu) list.classList.add("hidden");
  });
  if (!shouldOpen) {
    menu.classList.add("hidden");
    return;
  }
  menu.classList.remove("hidden");
  positionSalesFloatingMenu(button, menu);
}

function positionSalesFloatingMenu(button, menu) {
  const rect = button.getBoundingClientRect();
  const menuWidth = menu.offsetWidth || 160;
  const menuHeight = menu.offsetHeight || 180;
  const viewportPadding = 10;
  const gap = 6;
  const left = Math.min(
    window.innerWidth - menuWidth - viewportPadding,
    Math.max(viewportPadding, rect.right - menuWidth)
  );
  let top = rect.bottom + gap;
  if (top + menuHeight > window.innerHeight - viewportPadding) {
    top = Math.max(viewportPadding, rect.top - menuHeight - gap);
  }
  Object.assign(menu.style, {
    position: "fixed",
    left: `${left}px`,
    top: `${top}px`,
    right: "auto",
    zIndex: "5000"
  });
}

function applySalesQuotePreset(type) {
  if (!salesQuotationDraft) return;
  salesQuotationDraft.quoteType = type;
  if (type === "FAHU") {
    salesQuotationDraft.notes = quoteFahuNotes;
    salesQuotationDraft.terms = quoteFahuTerms;
  } else {
    salesQuotationDraft.notes = "";
    salesQuotationDraft.terms = quoteVrvTerms;
  }
  renderSalesDesk();
}

function quoteDraftFromSource(source = {}) {
  const loginName = String(currentUser?.name || "").trim();
  return {
    id: source.id || "",
    quotationNo: source.quotationNo || source.no || cleanNextSalesQuotationNo(),
    quotationDate: new Date().toLocaleDateString("en-GB").replace(/\//g, "-"),
    validity: "7 Days",
    salesperson: source.salesperson || source.salesPerson || source.preparedBy || loginName,
    customer: source.customer || "",
    project: source.project || "",
    location: source.location || "",
    paymentTerms: "30 Days Credit",
    deliveryTime: "To be discussed",
    warranty: source.enquiryNo || "",
    quoteType: source.quoteType || "VRV",
    notes: source.notes ?? "",
    terms: source.terms || quoteVrvTerms,
    items: Array.isArray(source.items) && source.items.length ? source.items : [{ description: "", qty: 1, unit: "Nos", unitPrice: 0 }],
    manualSubtotal: source.manualSubtotal || "",
    discount: 0,
    baseQuotationNo: source.baseQuotationNo || "",
    revisionNo: Number(source.revisionNo || 0) || 0,
    revision: source.revision || "Fresh Quote",
    sourceLeadId: source.sourceLeadId || "",
    status: "Draft"
  };
}

async function saveSalesQuotation(status = "Draft") {
  if (!salesQuotationDraft) return;
  const savedCustomer = requireSavedSalesCustomer(salesQuotationDraft.customer, "Quotation customer");
  if (!savedCustomer) return;
  salesQuotationDraft.customer = savedCustomer.name;
  const quote = {
    ...salesQuotationDraft,
    no: salesQuotationDraft.quotationNo,
    date: salesQuotationDraft.quotationDate,
    status
  };
  salesCrmState = await api("/api/sales-crm/quotations", { method: "POST", body: JSON.stringify(quote) });
  await markLeadQuoteSentFromQuotation(quote);
  salesQuotationMode = "list";
  salesQuotationDraft = null;
  renderSalesDesk();
  toast(status === "Sent" ? "Quotation marked as sent" : "Quotation saved");
}

async function markLeadQuoteSentFromQuotation(quote) {
  const sourceLeadId = quote.sourceLeadId || "";
  if (!sourceLeadId) return;
  const lead = (salesData().leads || []).find(item => item.id === sourceLeadId);
  if (!lead || normalizeLeadStatus(lead.status) === "Quote Sent") return;
  salesCrmState = await api("/api/sales-crm/leads", {
    method: "POST",
    body: JSON.stringify({ ...lead, status: "Quote Sent", quoteNo: quote.no || quote.quotationNo || lead.quoteNo || "" })
  });
}

async function updateQuotationFollowStatus(quoteId, status) {
  const quote = salesData().quotations.find(item => item.id === quoteId);
  if (!quote) return;
  const savedStatus = status === "Quotation Sent" ? "Sent" : status;
  salesCrmState = await api("/api/sales-crm/quotations", { method: "POST", body: JSON.stringify({ ...quote, status: savedStatus }) });
  renderSalesDesk();
  toast("Follow-up status updated");
}

async function updateManualFollowStatus(itemId, status) {
  const followUp = salesData().followUps.find(item => item.id === itemId);
  if (!followUp) return;
  salesCrmState = await api("/api/sales-crm/followUps", {
    method: "POST",
    body: JSON.stringify({ ...followUp, status, due: status === "Confirmed" ? "Done" : followUp.due })
  });
  renderSalesDesk();
  toast("Follow-up status updated");
}

async function deleteLeadFollowUp(leadId, followIndex) {
  const raw = (salesData().leads || []).find(item => item.id === leadId);
  if (!raw) return;
  const index = Number(followIndex);
  if (!Number.isInteger(index) || index < 0) return;
  const normalized = normalizeSalesLead(raw);
  const followUps = [...(normalized.followUps || [])];
  if (!followUps[index]) return;
  if (!confirm("Delete this follow-up?")) return;
  followUps.splice(index, 1);
  const payload = {
    ...raw,
    followUps,
    followUp: followUps[0]?.date || "",
    nextFollowUpDate: followUps[0]?.date || "",
    followUpType: followUps[0]?.type || "",
    followUpNote: followUps[0]?.note || "",
    priority: followUps.length ? raw.priority || "Planned" : "",
    lastUpdated: todaySalesDateInput(),
    updatedBy: currentUser?.name || raw.salesPerson || ""
  };
  salesCrmState = await api("/api/sales-crm/leads", { method: "POST", body: JSON.stringify(payload) });
  salesLeadDetailId = leadId;
  renderSalesDesk();
  toast("Follow-up deleted");
}

function editSalesQuotation(quoteId) {
  const quote = findSalesQuotation(quoteId);
  if (!quote) return;
  salesQuotationDraft = {
    ...structuredClone(quote),
    quotationNo: quote.no || "",
    quotationDate: quote.date || "",
    discount: quote.discount || 0,
    items: structuredClone(quote.items || [])
  };
  salesQuotationMode = "create";
  showSalesDesk("quotation");
}

async function deleteSalesItem(collection, itemId) {
  if (!itemId || !confirm("Delete this CRM record?")) return;
  try {
    salesCrmState = await api(`/api/sales-crm/${collection}/${encodeURIComponent(itemId)}`, { method: "DELETE" });
    renderSalesDesk();
    toast("CRM record deleted");
  } catch (error) {
    alert(error.message || "Could not delete this CRM record.");
  }
}

async function completeSalesFollowUp(itemId) {
  const followUp = salesData().followUps.find(item => item.id === itemId);
  if (!followUp) return;
  salesCrmState = await api("/api/sales-crm/followUps", {
    method: "POST",
    body: JSON.stringify({ ...followUp, status: "Confirmed", due: "Done" })
  });
  renderSalesDesk();
  toast("Follow-up confirmed");
}

async function createCustomerFromLead(leadId) {
  const rawLead = salesData().leads.find(item => item.id === leadId);
  if (!rawLead) return;
  const lead = normalizeSalesLead(rawLead);
  const exists = salesData().customers.some(customer => norm(customer.name) === norm(lead.customer));
  if (exists && !confirm("Customer already exists. Create another customer record from this lead?")) return;
  salesCrmState = await api("/api/sales-crm/customers", {
    method: "POST",
    body: JSON.stringify({
      name: lead.customer || "",
      type: lead.scope || "Commercial",
      contact: lead.contactName || lead.customer || "",
      role: "",
      phone: lead.contactNumber || "",
      email: "",
      address: lead.location || lead.plotNo || "",
      detail: lead.projectDescription || "",
      trn: ""
    })
  });
  toast("Customer created from lead");
  showSalesDesk("customers");
}

async function createProjectFromLead(leadId) {
  const rawLead = salesData().leads.find(item => item.id === leadId);
  if (!rawLead) return;
  const lead = normalizeSalesLead(rawLead);
  const projectName = lead.projectDescription || lead.requirement || lead.enquiryNo || "New Project";
  const existing = (salesData().projects || []).find(project => (
    norm(project.name) === norm(projectName) &&
    norm(project.customer) === norm(lead.customer)
  ));
  if (existing) {
    toast("Project already exists in Active Projects");
    return showSalesDesk("projects");
  }
  salesCrmState = await api("/api/sales-crm/projects", {
    method: "POST",
    body: JSON.stringify({
      name: projectName,
      customer: lead.customer || "",
      location: lead.location || lead.plotNo || "",
      type: leadTypeFromProduct(lead),
      requirement: projectRequirementFromLead(lead),
      engineer: lead.salesPerson || "",
      status: projectStatusFromLead(lead.status),
      date: lead.receivedDate || todaySalesDateInput(),
      value: lead.estimatedValue ? String(lead.estimatedValue) : ""
    })
  });
  toast("Project created in Active Projects");
  showSalesDesk("projects");
}

async function createWorkflowFromLead(leadId) {
  const rawLead = salesData().leads.find(item => item.id === leadId);
  if (!rawLead) return;
  const lead = normalizeSalesLead(rawLead);
  const customer = findSalesCustomerByName(lead.customer);
  state = await api("/api/projects?draft=1", { method: "POST", body: "{}" });
  projectPersisted = false;
  projectTouched = false;
  if (!state.priceList.items.length) state.priceList.items = structuredClone(samplePriceItems);
  applyCompactLayout(true);
  state.details.customer = customer?.name || "";
  state.details.contactPerson = customer?.contact || lead.contactName || "";
  state.details.telNo = customer?.phone || lead.contactNumber || "";
  state.details.email = customer?.email || "";
  state.details.project = lead.projectDescription || lead.requirement || "";
  state.details.location = lead.location || lead.plotNo || customer?.address || "";
  state.details.model = state.details.model || "Daikin";
  state.title = state.details.project || state.details.customer || "Workflow";
  history.replaceState(null, "", location.pathname);
  showCanvas();
  render();
  requestAnimationFrame(zoomToFit);
  toast(customer ? "Workflow canvas created from enquiry" : "Workflow created. Select a saved customer to link customer details.");
}

function leadTypeFromProduct(lead) {
  const text = norm([lead.productType, lead.scope, lead.projectType, lead.projectDescription].filter(Boolean).join(" "));
  return text.includes("RESIDENTIAL") || text.includes("VILLA") || text.includes("APARTMENT") ? "Residential" : "Commercial";
}

function projectRequirementFromLead(lead) {
  return salesProductTypes().includes(lead.productType) ? lead.productType : "Other";
}

function projectStatusFromLead(status = "") {
  const text = norm(status);
  if (text.includes("COMPLETED")) return "Completed";
  if (text.includes("JOBINHAND") || text.includes("CONFIRMED")) return "Ongoing";
  if (text.includes("QUOTESENT")) return "Quotation Sent";
  if (text.includes("NEGOTIATION")) return "Negotiation";
  return "Site Visit Done";
}

function openSalesLeadDrawer(itemId = "") {
  const existingRaw = itemId ? (salesData().leads || []).find(item => item.id === itemId) : null;
  const existing = existingRaw ? normalizeSalesLead(existingRaw, (salesData().leads || []).indexOf(existingRaw)) : null;
  const item = existing || blankSalesLead();
  if (!String(item.salesPerson || "").trim()) item.salesPerson = String(currentUser?.name || "").trim();
  const modal = document.createElement("div");
  modal.className = "modal-backdrop sales-drawer-backdrop";
  modal.innerHTML = `
    <aside class="sales-lead-drawer">
      <div class="sales-lead-drawer-head">
        <div>
          <h2>${existing ? "Edit Enquiry" : "New Enquiry"}</h2>
          <p>Create a new enquiry and capture opportunity details.</p>
        </div>
        <button class="mini-button" data-close-sales-modal>X</button>
      </div>
      <div class="sales-lead-form">
        ${salesLeadFormSection(1, "Basic Details", [
          salesLeadField("enquiryNo", "Enquiry No", item.enquiryNo, "text", { required: true }),
          salesLeadField("receivedDate", "Date Enquiry Received", item.receivedDate || todaySalesDateInput(), "dateText", { required: true }),
          salesLeadField("salesPerson", "Sales Person", item.salesPerson, "list", { required: true, list: uniqueValues((salesData().leads || []).map((lead, index) => normalizeSalesLead(lead, index).salesPerson)) }),
          salesLeadField("customer", "Customer", item.customer, "list", { required: true, list: (salesData().customers || []).map(customer => customer.name) }),
          salesLeadField("projectDescription", "Project / Description", item.projectDescription, "textarea", { required: true })
        ])}
        ${salesLeadFormSection(2, "Project Parties", [
          salesLeadField("plotNo", "Location", item.plotNo),
          salesLeadField("client", "Client", item.client),
          salesLeadField("mainContractor", "Main Contractor", item.mainContractor),
          salesLeadField("consultant", "Consultant", item.consultant),
          salesLeadField("contactName", "Contact Name", item.contactName, "text", { required: true }),
          salesLeadField("contactNumber", "Contact Number", item.contactNumber, "text", { required: true })
        ])}
        ${salesLeadFormSection(3, "HVAC Scope", [
          salesLeadField("productType", "Product Type", item.productType, "select", { required: true, options: ["", ...salesProductTypes()] }),
          salesLeadField("scope", "Scope Notes", item.scope, "textarea")
        ])}
        ${salesLeadFormSection(4, "Quotation Details", [
          salesLeadField("quoteNo", "Quote No", item.quoteNo),
          salesLeadField("quotedDate", "Date Enquiry Quoted", item.quotedDate, "dateText"),
          salesLeadField("preparedBy", "Selection & Quote Prepared By", item.preparedBy),
          salesLeadField("estimatedValue", "Value (AED)", item.estimatedValue || "", "money"),
          salesLeadField("daikinPurchaseValue", "Daikin Purchase", item.daikinPurchaseValue || "", "money"),
          salesLeadField("finalizingMonth", "Tentative Finalizing Month", item.finalizingMonth)
        ])}
        ${salesLeadFormSection(5, "Follow-up", [
          salesLeadField("status", "Current Status", item.status, "select", { required: true, options: salesLeadStatuses() }),
          salesLeadField("followUpNote", "Follow-up Note", item.followUpNote),
          salesLeadField("nextFollowUpDate", "Next Follow-up Date", item.nextFollowUpDate, "dateText"),
          salesLeadField("followUpType", "Follow-up Type", item.followUpType, "select", { options: ["", ...salesFollowUpTypes()] }),
          salesLeadField("competitors", "Competitors", item.competitors, "textarea")
        ])}
      </div>
      <div class="sales-lead-drawer-actions">
        <button class="ghost-button" data-close-sales-modal>Cancel</button>
        <button class="primary-button" id="saveSalesLeadBtn">${existing ? "Save Enquiry" : "Save / Create Enquiry"}</button>
      </div>
    </aside>
  `;
  document.body.appendChild(modal);
  modal.querySelectorAll("[data-close-sales-modal]").forEach(button => button.addEventListener("click", () => modal.remove()));
  modal.querySelector("#saveSalesLeadBtn").addEventListener("click", async () => {
    const payload = collectSalesLeadPayload(modal, existingRaw || item);
    if (!payload.customer || !payload.projectDescription || !payload.enquiryNo) return alert("Customer, project description and enquiry number are required.");
    salesCrmState = await api("/api/sales-crm/leads", { method: "POST", body: JSON.stringify(payload) });
    const savedLead = (salesData().leads || []).find(lead => norm(lead.enquiryNo) === norm(payload.enquiryNo));
    salesLeadDetailId = savedLead?.id || payload.id || salesLeadDetailId;
    modal.remove();
    renderSalesDesk();
    toast("Enquiry saved");
  });
}

function blankSalesLead() {
  return {
    id: "",
    salesPerson: currentUser?.name || "",
    sNo: String((salesData().leads || []).length + 1),
    customer: "",
    projectDescription: "",
    enquiryNo: salesData().settings?.nextEnquiryNo || `ENQ-${new Date().getFullYear()}-0001`,
    receivedDate: todaySalesDateInput(),
    productType: "",
    status: "New Enquiry",
    contactName: "",
    contactNumber: "",
    followUps: []
  };
}

function salesLeadFormSection(number, title, fields) {
  return `
    <section class="sales-lead-form-section">
      <h3><span>${number}</span>${escapeHtml(title)}</h3>
      <div class="sales-lead-form-grid">${fields.join("")}</div>
    </section>
  `;
}

function salesLeadField(key, label, value = "", type = "text", options = {}) {
  const required = options.required ? `<b class="required-star">*</b>` : "";
  const attrs = `data-sales-lead-field="${escapeHtml(key)}"`;
  const labelHtml = `<span class="sales-lead-label-text">${escapeHtml(label)}${required}</span>`;
  if (type === "textarea") {
    return `<label class="${["projectDescription", "scope", "competitors"].includes(key) ? "span-two" : ""}">${labelHtml}<textarea ${attrs}>${escapeHtml(value || "")}</textarea></label>`;
  }
  if (type === "select") {
    return `<label>${labelHtml}<select ${attrs}>${(options.options || []).map(option => `<option value="${escapeHtml(option)}" ${String(value || "") === option ? "selected" : ""}>${escapeHtml(option || "Select")}</option>`).join("")}</select></label>`;
  }
  if (type === "list") {
    const listId = `lead-list-${key}-${Math.random().toString(36).slice(2)}`;
    const values = uniqueValues(options.list || []);
    return `<label>${labelHtml}<input ${attrs} list="${listId}" value="${escapeHtml(value || "")}"><datalist id="${listId}">${values.map(option => `<option value="${escapeHtml(option)}"></option>`).join("")}</datalist></label>`;
  }
  if (type === "dateText") {
    return `<label>${labelHtml}<input ${attrs} inputmode="numeric" placeholder="DD/MM/YYYY" value="${escapeHtml(formatSalesDateInput(value || ""))}"></label>`;
  }
  if (type === "money") {
    return `<label>${labelHtml}<input ${attrs} inputmode="decimal" placeholder="AED" value="${escapeHtml(value ? String(value) : "")}"></label>`;
  }
  return `<label>${labelHtml}<input ${attrs} value="${escapeHtml(value || "")}"></label>`;
}

function collectSalesLeadPayload(modal, base = {}) {
  const payload = { ...base, id: base.id || "" };
  modal.querySelectorAll("[data-sales-lead-field]").forEach(field => {
    const key = field.dataset.salesLeadField;
    const value = field.value.trim();
    if (["receivedDate", "quotedDate", "nextFollowUpDate"].includes(key)) payload[key] = formatSalesDateInput(value);
    else if (["estimatedValue", "daikinPurchaseValue"].includes(key)) payload[key] = salesNumber(value);
    else payload[key] = value;
  });
  payload.requirement = payload.projectDescription || payload.requirement || "";
  payload.projectType = payload.scope || payload.productType || "";
  payload.phone = payload.contactNumber || payload.phone || "";
  payload.followUp = payload.nextFollowUpDate || payload.followUp || "";
  payload.updatedBy = currentUser?.name || payload.salesPerson || "";
  payload.lastUpdated = todaySalesDateInput();
  payload.followUps = Array.isArray(base.followUps) ? base.followUps : [];
  if (payload.followUpNote || payload.nextFollowUpDate) {
    const duplicate = payload.followUps.some(item => norm(item.date) === norm(payload.nextFollowUpDate) && norm(item.note) === norm(payload.followUpNote));
    if (!duplicate) {
      payload.followUps = [{
        date: payload.nextFollowUpDate || todaySalesDateInput(),
        type: payload.followUpType || "Call",
        note: payload.followUpNote || "Follow-up planned",
        updatedBy: payload.updatedBy
      }, ...payload.followUps];
    }
  }
  return payload;
}

function todaySalesDateInput() {
  const now = new Date();
  return `${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`;
}

function openSalesLeadFollowUp(leadId) {
  const raw = (salesData().leads || []).find(item => item.id === leadId);
  if (!raw) return;
  const lead = normalizeSalesLead(raw);
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.innerHTML = `
    <div class="modal sales-modal">
      <div class="inventory-topbar">
        <div><h2>Add Follow-up</h2><p class="inventory-muted">${escapeHtml(lead.enquiryNo)} - ${escapeHtml(lead.customer)}</p></div>
        <button class="mini-button" data-close-sales-modal>Close</button>
      </div>
      <div class="form-grid sales-modal-grid">
        <label>Date<input data-follow-field="date" inputmode="numeric" placeholder="DD/MM/YYYY" value="${todaySalesDateInput()}"></label>
        <label>Type<select data-follow-field="type">${salesFollowUpTypes().map(type => `<option>${escapeHtml(type)}</option>`).join("")}</select></label>
        <label class="span-two">Note<textarea data-follow-field="note"></textarea></label>
        <label>Updated By<input data-follow-field="updatedBy" value="${escapeHtml(currentUser?.name || lead.salesPerson || "")}"></label>
      </div>
      <div class="inventory-actions">
        <button class="ghost-button" data-close-sales-modal>Cancel</button>
        <button class="primary-button" id="saveLeadFollowBtn">Save</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.querySelectorAll("[data-close-sales-modal]").forEach(button => button.addEventListener("click", () => modal.remove()));
  modal.querySelector("#saveLeadFollowBtn").addEventListener("click", async () => {
    const followUp = {};
    modal.querySelectorAll("[data-follow-field]").forEach(field => {
      followUp[field.dataset.followField] = field.dataset.followField === "date" ? formatSalesDateInput(field.value) : field.value.trim();
    });
    if (!followUp.note) return alert("Follow-up note is required.");
    const payload = {
      ...raw,
      followUps: [followUp, ...(Array.isArray(raw.followUps) ? raw.followUps : [])],
      nextFollowUpDate: followUp.date,
      followUpType: followUp.type,
      followUpNote: followUp.note,
      status: raw.status || "Follow-up",
      lastUpdated: todaySalesDateInput(),
      updatedBy: followUp.updatedBy
    };
    salesCrmState = await api("/api/sales-crm/leads", { method: "POST", body: JSON.stringify(payload) });
    salesLeadDetailId = leadId;
    modal.remove();
    renderSalesDesk();
    toast("Follow-up added");
  });
}

function openSalesForm(collection, itemId = "") {
  if (collection === "leads") return openSalesLeadDrawer(itemId);
  if (collection === "projects") return openSalesProjectDrawer(itemId);
  const existing = itemId ? structuredClone((salesData()[collection] || []).find(item => item.id === itemId)) : null;
  const config = salesFormConfig(collection);
  const item = existing || config.blank();
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.innerHTML = `
    <div class="modal sales-modal">
      <div class="inventory-topbar">
        <div>
          <h2>${existing ? "Edit" : "Add"} ${escapeHtml(config.title)}</h2>
          <p class="inventory-muted">Sales Desk CRM record.</p>
        </div>
        <button class="mini-button" data-close-sales-modal>Close</button>
      </div>
      <div class="form-grid sales-modal-grid">
        ${config.fields.map(field => salesFormField(field, item[field.key])).join("")}
      </div>
      <div class="inventory-actions">
        <button class="ghost-button" data-close-sales-modal>Cancel</button>
        <button class="primary-button" id="saveSalesFormBtn">Save</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.querySelectorAll("[data-close-sales-modal]").forEach(button => button.addEventListener("click", () => modal.remove()));
  modal.querySelector("#saveSalesFormBtn").addEventListener("click", async () => {
    const payload = { ...item };
    config.fields.forEach(field => {
      const el = modal.querySelector(`[data-sales-form-field="${field.key}"]`);
      const value = el ? el.value.trim() : "";
      payload[field.key] = field.type === "dateText" ? formatSalesDateInput(value) : field.type === "money" ? sanitizeSalesMoneyInput(value) : value;
    });
    if (!config.required(payload)) return alert(config.requiredMessage);
    salesCrmState = await api(`/api/sales-crm/${collection}`, { method: "POST", body: JSON.stringify(payload) });
    modal.remove();
    renderSalesDesk();
    toast(`${config.title} saved`);
  });
}

function salesFormField(field, value = "") {
  const common = `data-sales-form-field="${field.key}"`;
  if (field.type === "customerSelect") {
    const customers = salesData().customers || [];
    const names = [...new Set(customers.map(customer => customer.name).filter(Boolean))];
    if (value && !names.includes(value)) names.unshift(value);
    const listId = `salesCustomerList-${field.key}`;
    return `<label>${escapeHtml(field.label)}<input ${common} list="${listId}" placeholder="Type to search customer..." value="${escapeHtml(value || "")}"><datalist id="${listId}">${names.map(name => `<option value="${escapeHtml(name)}"></option>`).join("")}</datalist></label>`;
  }
  if (field.type === "select") {
    return `<label>${escapeHtml(field.label)}<select ${common}>${field.options.map(option => `<option ${String(value) === option ? "selected" : ""}>${escapeHtml(option)}</option>`).join("")}</select></label>`;
  }
  if (field.type === "textarea") {
    return `<label class="span-two">${escapeHtml(field.label)}<textarea ${common}>${escapeHtml(value || "")}</textarea></label>`;
  }
  if (field.type === "dateText") {
    return `<label>${escapeHtml(field.label)}<input ${common} inputmode="numeric" placeholder="DD/MM/YYYY" value="${escapeHtml(formatSalesDateInput(value || ""))}"></label>`;
  }
  if (field.type === "money") {
    return `<label>${escapeHtml(field.label)}<input ${common} type="number" min="0" step="0.01" inputmode="decimal" placeholder="AED" value="${escapeHtml(sanitizeSalesMoneyInput(value || ""))}"></label>`;
  }
  return `<label>${escapeHtml(field.label)}<input ${common} value="${escapeHtml(value || "")}"></label>`;
}

function salesFormConfig(collection) {
  const configs = {
    leads: {
      title: "Enquiry",
      requiredMessage: "Customer name is required.",
      required: item => !!item.customer,
      blank: () => ({ enquiryNo: salesData().settings?.nextEnquiryNo || `ENQ-${new Date().getFullYear()}-0001`, customer: "", phone: "", requirement: "", projectType: "Villa Project", location: "", source: "WhatsApp", status: "New Lead", followUp: "", priority: "Planned" }),
      fields: [
        { key: "enquiryNo", label: "Enquiry No." },
        { key: "customer", label: "Customer / Contact" },
        { key: "phone", label: "Phone" },
        { key: "requirement", label: "Requirement" },
        { key: "projectType", label: "Project Type", type: "select", options: ["Villa Project", "Commercial", "Apartment", "Maintenance"] },
        { key: "location", label: "Location" },
        { key: "source", label: "Source", type: "select", options: ["WhatsApp", "Website", "Referral", "Phone", "Email"] },
        { key: "status", label: "Status", type: "select", options: ["New Lead", "Contacted", "Site Visit", "Quotation Needed", "Won", "Lost"] },
        { key: "followUp", label: "Follow-up Date", type: "dateText" },
        { key: "priority", label: "Priority", type: "select", options: ["Overdue", "Today", "Planned"] }
      ]
    },
    customers: {
      title: "Customer",
      requiredMessage: "Customer name is required.",
      required: item => !!item.name,
      blank: () => ({ name: "", type: "Commercial", contact: "", role: "", phone: "", email: "", address: "", detail: "", trn: "" }),
      fields: [
        { key: "name", label: "Customer / Company Name" },
        { key: "type", label: "Type", type: "select", options: ["Commercial", "Residential", "Maintenance", "Private"] },
        { key: "contact", label: "Contact Person" },
        { key: "role", label: "Role" },
        { key: "phone", label: "Phone" },
        { key: "email", label: "Email" },
        { key: "detail", label: "Address Details" },
        { key: "trn", label: "TRN Number" }
      ]
    },
    projects: {
      title: "Project",
      requiredMessage: "Project name is required.",
      required: item => !!item.name,
      blank: () => ({ name: "", customer: "", location: "", type: "Commercial", requirement: "", engineer: "", status: "Site Visit Done", date: "", value: "" }),
      fields: [
        { key: "name", label: "Project Name" },
        { key: "customer", label: "Customer", type: "customerSelect" },
        { key: "location", label: "Location" },
        { key: "type", label: "Type", type: "select", options: ["Residential", "Commercial", "Industrial"] },
        { key: "requirement", label: "Product Type", type: "select", options: ["", ...salesProductTypes()] },
        { key: "engineer", label: "Assigned Engineer" },
        { key: "status", label: "Status", type: "select", options: ["Site Visit Done", "Quotation Sent", "Negotiation", "Ongoing", "Completed"] },
        { key: "date", label: "Date", type: "dateText" },
        { key: "value", label: "Value", type: "money" }
      ]
    },
    followUps: {
      title: "Follow-up",
      requiredMessage: "Customer name is required.",
      required: item => !!item.customer,
      blank: () => ({ customer: "", phone: "", project: "", quotation: "", date: "", due: "", status: "Quotation Sent" }),
      fields: [
        { key: "customer", label: "Customer" },
        { key: "phone", label: "Phone" },
        { key: "project", label: "Project" },
        { key: "quotation", label: "Quotation No." },
        { key: "date", label: "Date", type: "dateText" },
        { key: "due", label: "Due / Reminder" },
        { key: "status", label: "Status", type: "select", options: ["Quotation Sent", "Awaiting Response", "Negotiation", "Confirmed"] }
      ]
    }
  };
  return configs[collection];
}

function previewSalesQuotation(quoteId) {
  const quote = findSalesQuotation(quoteId);
  if (!quote) return;
  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(salesQuotationDocumentHtml(quote));
  win.document.close();
}

async function downloadSalesQuotationPdf(quoteId) {
  const quote = findSalesQuotation(quoteId);
  if (!quote) return;
  const response = await fetch("/api/sales-crm/quotations/pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ quoteId: quote.id })
  });
  if (!response.ok) return toast("Could not create quotation PDF");
  const blob = await response.blob();
  const disposition = response.headers.get("content-disposition") || "";
  const match = disposition.match(/filename="([^"]+)"/);
  downloadBlob(blob, match ? match[1] : `${safeFile(quote.no || "quotation")}.pdf`);
}

function nextQuotationRevisionNo(quote) {
  const quotations = salesData().quotations || [];
  const baseNo = quotationBaseNo(quote.baseQuotationNo || quote.no || quote.quotationNo || "");
  return quotations.reduce((max, item) => {
    const itemBaseNo = quotationBaseNo(item.baseQuotationNo || item.no || item.quotationNo || "");
    return itemBaseNo === baseNo ? Math.max(max, quotationRevisionNo(item)) : max;
  }, 0) + 1;
}

function createSalesQuotationRevision(quoteId) {
  const quote = findSalesQuotation(quoteId);
  if (!quote) return;
  const baseNo = quotationBaseNo(quote.baseQuotationNo || quote.no || quote.quotationNo || "");
  const revisionNo = nextQuotationRevisionNo(quote);
  const revisionQuoteNo = `${baseNo}-R${revisionNo}`;
  salesQuotationDraft = {
    ...structuredClone(quote),
    id: "",
    no: revisionQuoteNo,
    quotationNo: revisionQuoteNo,
    baseQuotationNo: baseNo,
    revisionNo,
    revision: `Revision R${revisionNo}`,
    status: "Draft",
    quotationDate: new Date().toLocaleDateString("en-GB").replace(/\//g, "-"),
    date: new Date().toLocaleDateString("en-GB").replace(/\//g, "-")
  };
  salesQuotationMode = "create";
  showSalesDesk("quotation");
  toast(`Revision ${revisionQuoteNo} ready to edit`);
}

function copySalesQuotation(quoteId) {
  return createSalesQuotationRevision(quoteId);
}

function salesQuotationOrderTotals(quote = {}) {
  const itemSubtotal = (quote.items || []).reduce((sum, item) => {
    const amount = salesNumber(item.amount);
    if (amount) return sum + amount;
    return sum + salesNumber(item.qty) * salesNumber(item.unitPrice);
  }, 0);
  const subtotal = salesNumber(quote.manualSubtotal || quote.subtotal || quote.totalBeforeVat) || itemSubtotal;
  const discount = salesNumber(quote.discount);
  let valueWithoutVat = Math.max(0, subtotal - discount);
  let vatAmount = salesNumber(quote.vatAmount || quote.vatTotal || quote.vat);
  let orderValue = salesNumber(quote.amount || quote.grandTotal || quote.netAmount || quote.total);
  if (!vatAmount && valueWithoutVat) vatAmount = valueWithoutVat * 0.05;
  if (!orderValue && valueWithoutVat) orderValue = valueWithoutVat + vatAmount;
  if (!valueWithoutVat && orderValue) {
    valueWithoutVat = orderValue / 1.05;
    vatAmount = orderValue - valueWithoutVat;
  }
  const roundMoney = value => Math.round(salesNumber(value) * 100) / 100;
  return {
    valueWithoutVat: roundMoney(valueWithoutVat),
    vatAmount: roundMoney(vatAmount),
    orderValue: roundMoney(orderValue)
  };
}

async function createOrderBookFromQuotation(quoteId) {
  const quote = findSalesQuotation(quoteId);
  if (!quote) return toast("Quotation not found");
  const customerName = String(quote.customer || quote.customerName || "").trim();
  const savedCustomer = findSalesCustomerByName(customerName);
  const totals = salesQuotationOrderTotals(quote);
  const orderId = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `order-${Date.now()}`;
  const order = {
    ...blankOrderBookOrder(),
    id: orderId,
    customer: savedCustomer?.name || customerName,
    jobDescription: quote.project || quote.projectName || quote.subject || "",
    location: quote.location || quote.projectLocation || savedCustomer?.defaultDeliveryLocation || savedCustomer?.address || "",
    contactPerson: quote.contactPerson || savedCustomer?.contactPerson || "",
    contactNumber: quote.phone || quote.tel || savedCustomer?.phone || "",
    salesPerson: quote.salesperson || quote.salesPerson || currentUser?.name || "",
    division: "Project/Inst",
    brand: "Daikin",
    valueWithoutVat: totals.valueWithoutVat,
    vatAmount: totals.vatAmount,
    orderValue: totals.orderValue,
    paymentReceived: 0,
    status: orderBookStatusFromPayment(totals.orderValue, 0),
    deliveryStatus: "Pending Delivery",
    remarks: "",
    quotationNo: quote.no || quote.quotationNo || "",
    timeline: [{
      date: todaySalesDateInput(),
      title: "Order Book Created",
      note: quote.no ? `Created from quotation ${quote.no}` : "Created from quotation."
    }]
  };
  try {
    salesCrmState = await api("/api/sales-crm/orderBook", { method: "POST", body: JSON.stringify(order) });
    const savedOrder = (salesData().orderBook || []).find(item => item.id === orderId) || (salesData().orderBook || []).find(item => item.orderNo === order.orderNo);
    salesOrderBookDetailId = savedOrder?.id || orderId;
    salesOrderBookTab = "all";
    toast("Order Book created from quotation");
    return showSalesDesk("orderBook");
  } catch (error) {
    console.error(error);
    return toast("Could not create Order Book");
  }
}

function splitQuotationModelDescription(item = {}) {
  const rawModel = String(item.model || item.modelNo || item.item || item.productCode || "").trim();
  const rawDescription = String(item.description || item.itemDescription || item.desc || item.name || "").trim();
  const combined = rawModel || rawDescription;
  const model = salesProjectModelNo(rawModel || combined);
  let description = rawDescription;
  if (description && model && norm(description).startsWith(norm(model))) {
    description = description.replace(new RegExp(`^\\s*${escapeRegExp(model)}\\s*-?\\s*`, "i"), "").trim();
  }
  if (!description && rawModel && rawDescription && norm(rawDescription) !== norm(rawModel)) {
    description = rawDescription;
  }
  return { model, description };
}

function quotationProjectNameForProject(quote = {}, quoteNo = "") {
  const candidates = [
    quote.project,
    quote.projectName,
    quote.jobDescription,
    quote.projectDescription,
    quote.enquiryProject
  ];
  const selected = candidates
    .map(value => String(value || "").trim())
    .find(value => value && norm(value) !== norm(quoteNo));
  return selected || "Quotation Project";
}

function quotationScopeForProject(quote = {}) {
  return String(quote.scope || quote.workDescription || quote.scopeOfWork || quote.projectScope || "").trim();
}

function salesProjectBoqFromQuotation(quote = {}) {
  const rows = Array.isArray(quote.items) ? quote.items : Array.isArray(quote.boq) ? quote.boq : Array.isArray(quote.boqRows) ? quote.boqRows : [];
  return rows.map((item, index) => {
    const { model, description } = splitQuotationModelDescription(item);
    const qty = salesNumber(item.qty ?? item.quantity ?? item.Qty ?? item.qtyRequired);
    const deliveredQty = salesNumber(item.deliveredQty);
    return {
      id: `project-boq-${Date.now()}-${index}`,
      model,
      description,
      qty,
      deliveredQty,
      pendingQty: qty - deliveredQty,
      stock: model ? salesProjectStockQty(model) : ""
    };
  }).filter(row => row.model || row.description || row.qty || row.deliveredQty);
}

async function createProjectFromQuotation(quoteId) {
  const quote = findSalesQuotation(quoteId);
  if (!quote) return toast("Quotation not found");
  const quoteNo = String(quote.no || quote.quotationNo || quote.quoteNo || "").trim();
  const existing = (salesData().projects || []).find(project => {
    return project.sourceQuotationId === quote.id || (quoteNo && norm(project.quotationNo || project.quoteNo || "") === norm(quoteNo));
  });
  if (existing) {
    salesProjectDetailId = existing.id;
    toast("Project already exists for this quotation");
    return showSalesDesk("projects");
  }

  const customerName = String(quote.customer || quote.customerName || "").trim();
  const savedCustomer = findSalesCustomerByName(customerName);
  const projectNo = nextSalesProjectNo();
  const today = todaySalesDateInput();
  const boq = salesProjectBoqFromQuotation(quote);
  const projectName = quotationProjectNameForProject(quote, quoteNo);
  const project = {
    ...salesProjectBlank(),
    id: salesProjectNewId(),
    projectNo,
    projectId: projectNo,
    sourceQuotationId: quote.id,
    quotationNo: quoteNo,
    quoteNo,
    name: projectName,
    customer: savedCustomer?.name || customerName,
    location: quote.location || quote.projectLocation || savedCustomer?.defaultDeliveryLocation || savedCustomer?.address || "",
    category: quote.category || "Commercial",
    type: quote.category || "Commercial",
    productType: quote.productType || quote.type || "Other",
    engineer: quote.salesperson || quote.salesPerson || quote.preparedBy || currentUser?.name || "Admin User",
    status: "Ongoing",
    date: today,
    createdDate: today,
    scope: quotationScopeForProject(quote),
    boq,
    items: boq,
    value: salesNumber(quote.amount || quote.grandTotal || quote.netAmount || quote.total || quote.manualSubtotal || ""),
    deliveryHistory: []
  };
  try {
    salesCrmState = await api("/api/sales-crm/projects", { method: "POST", body: JSON.stringify(project) });
    const savedProject = (salesData().projects || []).find(item => item.id === project.id) || (salesData().projects || []).find(item => salesProjectNo(item) === projectNo);
    salesProjectDetailId = savedProject?.id || project.id;
    salesProjectFilter = "";
    toast("Project created from quotation");
    return showSalesDesk("projects");
  } catch (error) {
    console.error(error);
    return toast("Could not create project");
  }
}

function salesQuotationDocumentHtml(quote) {
  const itemSubtotal = (quote.items || []).reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.unitPrice || 0), 0);
  const manualSubtotal = String(quote.manualSubtotal || "").trim();
  const subtotal = manualSubtotal ? Number(manualSubtotal.replace(/,/g, "")) || 0 : itemSubtotal;
  const discount = Number(quote.discount || 0);
  const taxable = Math.max(0, subtotal - discount);
  const vat = taxable * 0.05;
  return `<!doctype html><html><head><title>${escapeHtml(quote.no || "Quotation")}</title><style>
    body{font-family:Arial,sans-serif;color:#0b1c30;padding:36px} h1{color:#1b365d} table{width:100%;border-collapse:collapse;margin-top:18px} th,td{border:1px solid #cbd5e1;padding:9px;text-align:left} th{background:#1b365d;color:white}.summary{margin-left:auto;width:320px}.right{text-align:right}.muted{color:#64748b;white-space:pre-wrap}
  </style></head><body>
    <h1>Quotation</h1><p><strong>${escapeHtml(quote.no || "")}</strong> | ${escapeHtml(quote.date || "")}</p>
    <p><strong>Customer:</strong> ${escapeHtml(quote.customer || "")}<br><strong>Project:</strong> ${escapeHtml(quote.project || "")}<br><strong>Validity:</strong> ${escapeHtml(quote.validity || "")}</p>
    <table><thead><tr><th>#</th><th>Description</th><th>Qty</th><th>Unit</th><th>Unit Price</th><th>Total</th></tr></thead><tbody>
      ${(quote.items || []).map((item, index) => `<tr><td>${index + 1}</td><td>${escapeHtml(item.description || "")}</td><td>${item.qty || 0}</td><td>${escapeHtml(item.unit || "")}</td><td>${salesMoney(item.unitPrice || 0)}</td><td>${salesMoney(Number(item.qty || 0) * Number(item.unitPrice || 0))}</td></tr>`).join("")}
    </tbody></table>
    <table class="summary"><tr><td>Subtotal</td><td class="right">${salesMoney(subtotal)}</td></tr><tr><td>Discount</td><td class="right">${salesMoney(discount)}</td></tr><tr><td>VAT 5%</td><td class="right">${salesMoney(vat)}</td></tr><tr><th>Total</th><th class="right">${salesMoney(taxable + vat)}</th></tr></table>
    <p class="muted">${escapeHtml(quote.notes || "")}</p>
    ${quote.terms ? `<h3>Terms &amp; Conditions</h3><p class="muted">${escapeHtml(quote.terms)}</p>` : ""}
  </body></html>`;
}

function exportSalesCsv(collection) {
  const rows = salesData()[collection] || [];
  if (!rows.length) return toast("No records to export");
  const columns = Object.keys(rows[0]).filter(key => !["items", "invoices", "payments", "timeline", "po"].includes(key));
  const csv = [
    columns.join(","),
    ...rows.map(row => columns.map(column => csvCell(row[column])).join(","))
  ].join("\n");
  downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), `sales-${collection}.csv`);
}

function csvCell(value) {
  const text = String(value ?? "").replace(/"/g, '""');
  return /[",\n]/.test(text) ? `"${text}"` : text;
}

async function loadPurchaseOrders(options = {}) {
  const force = !!options.force;
  if (!force && purchaseState && Date.now() - purchaseLoadedAt < viewDataRefreshMs) return purchaseState;
  if (purchaseLoadPromise) return purchaseLoadPromise;
  purchaseLoadPromise = api("/api/purchase-orders")
    .then(state => {
      purchaseState = state;
      purchaseLoadedAt = Date.now();
      return state;
    })
    .finally(() => {
      purchaseLoadPromise = null;
    });
  return purchaseLoadPromise;
}

function refreshPurchaseOrdersInBackground() {
  if (!purchaseState || Date.now() - purchaseLoadedAt < viewDataRefreshMs) return;
  loadPurchaseOrders({ force: true })
    .then(() => {
      if (activeView === "purchaseOrders") renderPurchaseOrders();
    })
    .catch(error => console.warn(error));
}

function setCanvasActionsVisible(visible) {
  document.querySelector(".top-actions")?.classList.toggle("hidden", !visible);
}

function renderViewActions() {
  const actions = $("#viewActions");
  if (!actions) return;
  const salesTopbar = salesDeskTopbarConfig();
  const inventoryTopbar = inventoryTopbarConfig();
  document.querySelector(".topbar")?.classList.toggle("quotation-shell", !!salesTopbar || !!inventoryTopbar);
  actions.classList.add("hidden");
  actions.innerHTML = "";
  if (salesTopbar) {
    if (salesTopbar.search || salesTopbar.actions) {
      actions.classList.remove("hidden");
      actions.innerHTML = `
        ${salesTopbar.search ? `<label class="quotation-search">
          <span></span>
          <input data-sales-search value="${escapeHtml(salesSearchQuery)}" placeholder="${escapeHtml(salesTopbar.search)}">
        </label>` : ""}
        ${salesTopbar.actions}
      `;
      bindSalesTopbarActions();
    }
    return;
  }
  if (inventoryTopbar) {
    actions.classList.remove("hidden");
    actions.innerHTML = `
      <label class="quotation-search ${escapeHtml(inventoryTopbar.searchClass || "")}">
        <span></span>
        <input id="${escapeHtml(inventoryTopbar.searchId)}" data-inventory-top-search value="${escapeHtml(inventoryTopbar.searchValue || "")}" placeholder="${escapeHtml(inventoryTopbar.search)}">
      </label>
      ${inventoryTopbar.actions}
    `;
    bindInventoryTopbarActions();
    return;
  }
  if (activeView === "purchaseOrders") {
    actions.classList.remove("hidden");
    actions.innerHTML = `
      <button class="ghost-button" id="headerPoListBtn">Purchase Orders</button>
      <button class="ghost-button" id="headerPoSuppliersBtn">Suppliers</button>
      <button class="primary-button" id="headerPoManualBtn">Create PO</button>
      <button class="ghost-button" id="headerPoUploadBtn">Upload</button>
    `;
    $("#headerPoListBtn").addEventListener("click", () => showPurchaseOrders("list"));
    $("#headerPoSuppliersBtn").addEventListener("click", () => showPurchaseOrders("suppliers"));
    $("#headerPoUploadBtn").addEventListener("click", () => uploadPurchaseQuotation());
    $("#headerPoManualBtn").addEventListener("click", () => {
      purchaseDraft = newPurchaseDraft();
      showPurchaseOrders("form");
    });
    return;
  }
  if (activeView !== "inventory") return;
  if (["supplier", "supplierAll"].includes(inventoryScreen)) {
    actions.classList.remove("hidden");
    actions.innerHTML = `
      <button class="primary-button" id="headerSupplierDnBtn">Supplier DN</button>
      <button class="primary-button" id="headerUploadDnBtn">Upload DN</button>
    `;
    $("#headerSupplierDnBtn").addEventListener("click", () => {
      supplierAllPage = 1;
      showInventory("supplierAll");
    });
    $("#headerUploadDnBtn").addEventListener("click", () => uploadSupplierDn());
    return;
  }
  if (!["delivery", "customers"].includes(inventoryScreen)) return;
  actions.classList.remove("hidden");
  actions.innerHTML = `
    <button class="primary-button" id="headerAddCustomerBtn">Add Customer</button>
    <button class="primary-button" id="headerNewDeliveryBtn">Create Delivery Note</button>
    <button class="primary-button" id="headerCustomerListBtn">Customer List</button>
  `;
  $("#headerAddCustomerBtn").addEventListener("click", () => openCustomerModal());
  $("#headerNewDeliveryBtn").addEventListener("click", () => {
    openDeliveryModal();
  });
  $("#headerCustomerListBtn").addEventListener("click", () => showInventory("customers"));
}

function bindSalesTopbarActions() {
  const root = $("#viewActions");
  root.querySelectorAll("button").forEach(button => {
    button.addEventListener("click", handleSalesClick);
  });
  root.querySelectorAll("[data-sales-search]").forEach(input => {
    input.addEventListener("input", handleSalesInput);
    input.addEventListener("change", handleSalesChange);
  });
}

function bindInventoryTopbarActions() {
  const topSearch = $("#viewActions [data-inventory-top-search]");
  topSearch?.addEventListener("input", handleInventoryInput);
  document.querySelectorAll("#viewActions [data-inventory-top-action]").forEach(button => {
    button.addEventListener("click", () => {
      const action = button.dataset.inventoryTopAction;
      if (action === "upload-dn") return uploadSupplierDn();
      if (action === "supplier-all") {
        supplierAllPage = 1;
        return showInventory("supplierAll");
      }
      if (action === "supplier-latest") return showInventory("supplier");
      if (action === "add-customer") return openCustomerModal();
      if (action === "new-delivery") return openDeliveryModal();
      if (action === "customer-list") return showInventory("customers");
      if (action === "save-stock") return openStockModelModal();
    });
  });
}

function renderPurchaseOrders() {
  const root = $("#purchaseOrdersRoot");
  if (!purchaseState) {
    root.innerHTML = "";
    return;
  }
  if (purchaseScreen === "list") root.innerHTML = purchaseOrderListHtml();
  else if (purchaseScreen === "suppliers") root.innerHTML = purchaseSupplierListHtml();
  else root.innerHTML = purchaseOrderFormPageHtml();
  bindPurchaseEvents();
}

function renderPurchaseOrdersKeepingInputFocus(inputId, value) {
  renderPurchaseOrders();
  requestAnimationFrame(() => {
    const nextInput = document.getElementById(inputId);
    if (!nextInput) return;
    nextInput.focus();
    const cursor = String(value || "").length;
    try {
      nextInput.setSelectionRange(cursor, cursor);
    } catch {}
  });
}

function purchaseOrderShell(inner) {
  return `
    <div class="po-page">
      ${inner}
    </div>
  `;
}

function purchaseOrderFormPageHtml() {
  purchaseDraft = purchaseDraft || newPurchaseDraft();
  if (!purchaseDraft.poNo && purchaseState?.settings?.nextPoNo) purchaseDraft.poNo = purchaseState.settings.nextPoNo;
  if (!String(purchaseDraft.purchaseRepresentative || "").trim()) purchaseDraft.purchaseRepresentative = String(currentUser?.name || "").trim();
  recalcPurchaseOrder(purchaseDraft);
  return purchaseOrderShell(`
    <div class="po-layout">
      <section class="inventory-card po-form-card">
        <div class="po-form-title-row">
          <h3>New Purchase Order</h3>
          <label>LPO No.<input data-po-field="poNo" ${poInputAttrs("lpo-no")} value="${escapeHtml(purchaseDraft.poNo || "")}"></label>
        </div>
        ${purchaseOrderFormHtml(purchaseDraft)}
      </section>
      <aside class="po-summary-sidebar">
        <section class="inventory-card po-summary-card">
          <div class="po-summary-heading">
            <span class="po-summary-heading-icon" aria-hidden="true">${poIcon("document")}</span>
            <h3>Order Summary</h3>
          </div>
          ${purchaseSummaryHtml(purchaseDraft)}
        </section>
        ${purchaseAttachmentHtml(purchaseDraft)}
      </aside>
    </div>
  `);
}

function purchaseOrderListHtml() {
  const orders = purchaseFilteredOrders();
  return purchaseOrderShell(`
    <section class="inventory-card">
      <div class="po-list-header">
        <div>
          <h3>Purchase Orders</h3>
          <p class="inventory-muted">Saved drafts and created purchase orders.</p>
        </div>
        <input id="poSearchInput" type="search" placeholder="Search PO, supplier, quotation, project..." value="${escapeHtml(purchaseSearchQuery)}">
      </div>
      <table class="inventory-table po-list-table">
        <colgroup>
          <col class="po-list-col-no">
          <col class="po-list-col-supplier">
          <col class="po-list-col-project">
          <col class="po-list-col-items">
          <col class="po-list-col-total">
          <col class="po-list-col-status">
          <col class="po-list-col-action">
        </colgroup>
        <thead><tr><th>PO No.</th><th>Supplier</th><th>Project Name</th><th>Items</th><th>Grand Total</th><th>Status</th><th>Action</th></tr></thead>
        <tbody>
          ${orders.map(order => `<tr><td><strong>${escapeHtml(order.poNo || "Draft")}</strong><br><span class="inventory-muted">${formatInventoryDate(order.poDate)}</span></td><td>${escapeHtml(order.supplierName || "-")}</td><td>${escapeHtml(order.projectName || "-")}</td><td>${(order.items || []).length}</td><td>${money(order.grandTotal)}</td><td>${statusPill(order.status)}</td><td>${rowMenu([{label:"Edit",action:"edit-po",id:order.id},{label:"Download",action:"download-po",id:order.id},{label:"Delete",action:"delete-po",id:order.id,danger:true}])}</td></tr>`).join("") || `<tr><td colspan="7">No purchase orders saved.</td></tr>`}
        </tbody>
      </table>
    </section>
  `);
}

function purchaseSupplierListHtml() {
  const suppliers = purchaseFilteredSuppliers();
  return purchaseOrderShell(`
    <section class="inventory-card">
      <div class="po-list-header">
        <div>
          <h3>Suppliers</h3>
          <p class="inventory-muted">Manage supplier details used in Purchase Orders.</p>
        </div>
        <div class="inventory-search">
          <input id="poSupplierSearchInput" type="search" placeholder="Search supplier, TRN, phone..." value="${escapeHtml(purchaseSupplierSearchQuery)}">
          <button class="primary-button" id="poAddSupplierBtn">Create New Supplier</button>
        </div>
      </div>
      <table class="inventory-table">
        <thead><tr><th>Supplier Name</th><th>TRN</th><th>Contact</th><th>Email</th><th>Payment Terms</th><th>Action</th></tr></thead>
        <tbody>
          ${suppliers.map(supplier => `<tr><td><strong>${escapeHtml(supplier.supplierName)}</strong><br><span class="inventory-muted">${escapeHtml(supplier.address || "")}</span></td><td>${escapeHtml(supplier.trn || "")}</td><td>${escapeHtml(supplier.contactPerson || "")}<br><span class="inventory-muted">${escapeHtml(supplier.phone || "")}</span></td><td>${escapeHtml(supplier.email || "")}</td><td>${escapeHtml(supplier.paymentTerms || "")}</td><td>${rowMenu([{label:"Edit",action:"edit-po-supplier",id:supplier.id},{label:"Delete",action:"delete-po-supplier",id:supplier.id,danger:true}])}</td></tr>`).join("") || `<tr><td colspan="6">No suppliers added.</td></tr>`}
        </tbody>
      </table>
    </section>
  `);
}

function purchaseFilteredSuppliers() {
  const suppliers = purchaseState?.suppliers || [];
  const q = purchaseSupplierSearchQuery.trim().toLowerCase();
  if (!q) return suppliers;
  return suppliers.filter(supplier => [
    supplier.supplierName,
    supplier.address,
    supplier.trn,
    supplier.contactPerson,
    supplier.phone,
    supplier.email,
    supplier.paymentTerms
  ].join(" ").toLowerCase().includes(q));
}

function paymentTermFieldHtml(value, mode = "po") {
  return `<input list="poPaymentTermOptions" data-po-field="paymentTerms" ${poInputAttrs(`${mode}-payment-terms`)} value="${escapeHtml(value || "")}">`;
}

function supplierPaymentTermFieldHtml(value) {
  return `<input list="poSupplierPaymentOptions" data-po-supplier-payment value="${escapeHtml(value || "")}">`;
}

function poInputAttrs(field) {
  return `name="po-${escapeHtml(field)}" autocomplete="off" autocapitalize="off" spellcheck="false"`;
}

function purchaseFilteredOrders() {
  const orders = purchaseState?.orders || [];
  const q = purchaseSearchQuery.trim().toLowerCase();
  if (!q) return orders;
  return orders.filter(order => [
    order.poNo,
    order.supplierName,
    order.projectName,
    order.quotationNo,
    order.status,
    ...(order.items || []).flatMap(item => [item.description, item.modelNo])
  ].join(" ").toLowerCase().includes(q));
}

function purchaseOrderFormHtml(po) {
  const suppliers = purchaseState?.suppliers || [];
  return `
    <datalist id="poSupplierList">${suppliers.map(supplier => `<option value="${escapeHtml(supplier.supplierName)}"></option>`).join("")}</datalist>
    <datalist id="poPaymentTermOptions">${paymentTermOptions.map(option => `<option value="${escapeHtml(option)}"></option>`).join("")}</datalist>
    <div class="po-form-grid">
      <label>Supplier Name<input list="poSupplierList" data-po-field="supplierName" ${poInputAttrs("supplier-name")} value="${escapeHtml(po.supplierName)}"></label>
      <label>Reference No<input data-po-field="quotationNo" ${poInputAttrs("reference-no")} value="${escapeHtml(po.quotationNo)}"></label>
      <label>Purchase Representative<input data-po-field="purchaseRepresentative" ${poInputAttrs("purchase-representative")} value="${escapeHtml(po.purchaseRepresentative || currentUser?.name || "")}"></label>
      <label class="wide-field">Supplier Address<textarea data-po-field="supplierAddress" ${poInputAttrs("supplier-address")}>${escapeHtml(po.supplierAddress)}</textarea></label>
      <label>PO Date<input data-po-field="poDate" ${poInputAttrs("po-date")} placeholder="DD-MM-YYYY" value="${formatInventoryDate(po.poDate)}"></label>
      <label>Project Name<input data-po-field="projectName" ${poInputAttrs("project-name")} value="${escapeHtml(po.projectName)}"></label>
      <label>TRN<input data-po-field="trn" ${poInputAttrs("trn")} value="${escapeHtml(po.trn)}"></label>
      <label>Payment Terms${paymentTermFieldHtml(po.paymentTerms, "po")}</label>
    </div>
    <div class="po-table-wrap">
    <table class="inventory-table po-item-table">
      <colgroup>
        <col class="po-col-index">
        <col class="po-col-description">
        <col class="po-col-qty">
        <col class="po-col-unit">
        <col class="po-col-vat">
        <col class="po-col-amount">
        <col class="po-col-action">
      </colgroup>
      <thead><tr><th>#</th><th>Item Description</th><th>Qty</th><th>Unit Price (AED)</th><th>VAT (%)</th><th>Amount (AED)</th><th>Action</th></tr></thead>
      <tbody>
        ${(po.items || []).map((item, index) => `
          <tr>
            <td>${index + 1}</td>
            <td><textarea data-po-line="${index}" data-field="description" ${poInputAttrs(`item-description-${index}`)} placeholder="Enter item description...">${escapeHtml(item.description)}</textarea></td>
            <td><input type="number" min="0" data-po-line="${index}" data-field="qty" ${poInputAttrs(`qty-${index}`)} value="${Number(item.qty || 0)}"></td>
            <td><input type="number" min="0" step="0.01" data-po-line="${index}" data-field="unitPrice" ${poInputAttrs(`unit-price-${index}`)} value="${Number(item.unitPrice || 0)}"></td>
            <td><input type="number" min="0" step="0.01" data-po-line="${index}" data-field="vatPercent" ${poInputAttrs(`vat-percent-${index}`)} value="${purchaseVatPercent(item.vatPercent)}"></td>
            <td data-po-amount="${index}">${money(item.amount)}</td>
            <td><button class="danger-button po-delete-line" data-delete-po-line="${index}">${poIcon("trash")}<span>Delete</span></button></td>
          </tr>
        `).join("") || `<tr><td colspan="7">No items added.</td></tr>`}
      </tbody>
    </table>
    </div>
    <div class="inventory-actions po-table-actions"><button class="ghost-button" id="poAddItemBtn">${poIcon("plus")}<span>Add Item</span></button></div>
    <label class="po-notes-field">Notes<textarea data-po-field="notes" ${poInputAttrs("notes")}>${escapeHtml(po.notes)}</textarea></label>
  `;
}

function purchaseSummaryHtml(po) {
  const subtotalValue = String(po.manualSubtotal ?? "").trim() ? po.manualSubtotal : money(po.subtotal);
  return `
    <div class="po-summary-row po-subtotal-row"><span>Subtotal (AED)</span><input id="poSubtotalInput" type="text" inputmode="decimal" data-po-subtotal ${poInputAttrs("subtotal")} value="${escapeHtml(subtotalValue)}"></div>
    <div class="po-summary-row po-subtotal-row"><span>Discount (AED)</span><input id="poDiscountInput" type="text" inputmode="decimal" data-po-discount ${poInputAttrs("discount")} value="${escapeHtml(po.discount || "")}"></div>
    <div class="po-summary-row"><span>Total After Discount (AED)</span><strong id="poTotalAfterDiscount">${money(po.totalAfterDiscount)}</strong></div>
    <div class="po-summary-row"><span>VAT Total (AED)</span><strong id="poVatTotal">${money(po.vatTotal)}</strong></div>
    <div class="po-summary-row po-summary-total"><strong>Grand Total (AED)</strong><strong id="poGrandTotal">${money(po.grandTotal)}</strong></div>
    <div class="po-status-box"><span class="po-status-icon" aria-hidden="true">${poIcon("tag")}</span><span>Status</span>${statusPill(po.status || "Draft")}</div>
    <div class="inventory-actions po-summary-actions">
      <button class="ghost-button" id="poSaveDraftBtn">${poIcon("save")}<span>Save Draft</span></button>
      <button class="primary-button" id="poCreateBtn">${poIcon("clipboard")}<span>Create Purchase Order</span></button>
      <button class="ghost-button" id="poDownloadBtn">${poIcon("download")}<span>Download PDF</span></button>
    </div>
  `;
}

function purchaseAttachmentHtml(po) {
  const upload = (purchaseState?.uploads || []).find(item => item.id === po.sourceUploadId);
  if (!upload) return "";
  const url = `/api/purchase-orders/uploads/${encodeURIComponent(upload.id)}`;
  return `
    <section class="po-attachment-card">
      <div class="po-attachment-title">Attachment</div>
      <div class="po-attachment-main">
        <span class="po-attachment-icon" aria-hidden="true">${poIcon("paperclip")}</span>
        <div class="po-attachment-copy">
          <strong>${escapeHtml(upload.originalName || "Uploaded file")}</strong>
          <span>${escapeHtml(fileExt(upload.originalName))} &bull; ${escapeHtml(prettyBytes(upload.size))}</span>
        </div>
        <button class="po-attachment-close" type="button" data-remove-po-attachment aria-label="Remove attachment">&times;</button>
      </div>
      <div class="po-attachment-actions">
        <a href="${url}" target="_blank" rel="noopener">View</a>
        <span aria-hidden="true">|</span>
        <a href="${url}" download="${escapeHtml(upload.originalName || "attachment")}">Download</a>
      </div>
    </section>
  `;
}

function poIcon(name) {
  const icons = {
    document: `<svg viewBox="0 0 24 24"><path d="M7 3h8l4 4v14H7z"/><path d="M15 3v5h5"/><path d="M10 12h6M10 16h4"/><path d="M16 18h4v4h-4z"/></svg>`,
    tag: `<svg viewBox="0 0 24 24"><path d="M4 12V5h7l9 9-7 7z"/><path d="M8.5 8.5h.01"/></svg>`,
    save: `<svg viewBox="0 0 24 24"><path d="M5 3h12l2 2v16H5z"/><path d="M8 3v7h8V3"/><path d="M8 21v-7h8v7"/></svg>`,
    clipboard: `<svg viewBox="0 0 24 24"><path d="M9 4h6l1 2h3v15H5V6h3z"/><path d="M9 4h6v4H9z"/><path d="M9 13h6M9 17h4"/></svg>`,
    download: `<svg viewBox="0 0 24 24"><path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M5 19h14"/></svg>`,
    paperclip: `<svg viewBox="0 0 24 24"><path d="M21 8.5 10.5 19a5 5 0 0 1-7-7L14 1.5a3.5 3.5 0 0 1 5 5L8.5 17a2 2 0 0 1-3-3L16 3.5"/></svg>`,
    plus: `<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>`,
    trash: `<svg viewBox="0 0 24 24"><path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 14h10l1-14"/><path d="M9 7V4h6v3"/></svg>`
  };
  return icons[name] || "";
}

function newPurchaseDraft() {
  const representativeName = String(currentUser?.name || "").trim();
  return {
    id: "",
    poNo: "",
    status: "Draft",
    supplierName: "",
    supplierAddress: "",
    trn: "",
    quotationNo: "",
    quotationDate: "",
    purchaseRepresentative: representativeName,
    poDate: new Date().toISOString().slice(0, 10),
    projectName: "",
    paymentTerms: "",
    manualSubtotal: "",
    discount: 0,
    notes: defaultPurchaseNotes,
    items: [newPurchaseItem()]
  };
}

function newPurchaseItem() {
  return { id: String(Date.now() + Math.random()), description: "", modelNo: "", qty: 1, unitPrice: 0, vatPercent: 5, amount: 0 };
}

function recalcPurchaseOrder(po) {
  po.items = po.items || [];
  let subtotal = 0;
  let vatTotal = 0;
  for (const item of po.items) {
    item.vatPercent = purchaseVatPercent(item.vatPercent);
    const base = Number(item.qty || 0) * Number(item.unitPrice || 0);
    const vat = base * (item.vatPercent / 100);
    item.amount = base;
    subtotal += base;
    vatTotal += vat;
  }
  const hasManualSubtotal = String(po.manualSubtotal ?? "").trim() !== "";
  const finalSubtotal = hasManualSubtotal ? (Number(String(po.manualSubtotal).replace(/,/g, "")) || 0) : subtotal;
  const vatRate = subtotal > 0 ? vatTotal / subtotal : averageVatRate(po.items);
  const discount = Number(String(po.discount || "").replace(/,/g, "")) || 0;
  const totalAfterDiscount = finalSubtotal - discount;
  const taxable = Math.max(0, totalAfterDiscount);
  po.subtotal = finalSubtotal;
  po.discount = discount;
  po.totalAfterDiscount = totalAfterDiscount;
  po.vatTotal = taxable * vatRate;
  po.grandTotal = taxable + po.vatTotal;
  return po;
}

function purchaseVatPercent(value) {
  const rate = Number(value);
  return Number.isFinite(rate) && rate > 0 ? rate : 5;
}

function averageVatRate(items = []) {
  const rates = items.map(item => Number(item.vatPercent || 0)).filter(rate => Number.isFinite(rate) && rate > 0);
  const rate = rates.length ? rates.reduce((sum, item) => sum + item, 0) / rates.length : 5;
  return rate / 100;
}

function refreshPurchaseTotals() {
  if (!purchaseDraft) return;
  recalcPurchaseOrder(purchaseDraft);
  const subtotalInput = $("#poSubtotalInput");
  if (subtotalInput && String(purchaseDraft.manualSubtotal ?? "").trim() === "") subtotalInput.value = money(purchaseDraft.subtotal);
  const discountInput = $("#poDiscountInput");
  if (discountInput && document.activeElement !== discountInput) discountInput.value = purchaseDraft.discount || "";
  $("#poTotalAfterDiscount") && ($("#poTotalAfterDiscount").textContent = money(purchaseDraft.totalAfterDiscount));
  $("#poVatTotal") && ($("#poVatTotal").textContent = money(purchaseDraft.vatTotal));
  $("#poGrandTotal") && ($("#poGrandTotal").textContent = money(purchaseDraft.grandTotal));
  (purchaseDraft.items || []).forEach((item, index) => {
    const amountCell = document.querySelector(`[data-po-amount="${index}"]`);
    if (amountCell) amountCell.textContent = money(item.amount);
  });
}

function bindPurchaseEvents() {
  const supplierInput = document.querySelector('[data-po-field="supplierName"]');
  supplierInput?.addEventListener("change", () => applyPurchaseSupplierToDraft(supplierInput.value));
}

function applyPurchaseSupplierToDraft(name) {
  if (!purchaseDraft) return;
  const supplier = (purchaseState?.suppliers || []).find(item => norm(item.supplierName) === norm(name));
  if (!supplier) return;
  purchaseDraft.supplierName = supplier.supplierName || "";
  purchaseDraft.supplierAddress = supplier.address || "";
  purchaseDraft.trn = supplier.trn || "";
  if (!purchaseDraft.paymentTerms) purchaseDraft.paymentTerms = supplier.paymentTerms || "";
  renderPurchaseOrders();
}

function openPurchaseSupplierModal(supplier = null) {
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.innerHTML = `
    <div class="modal">
      <datalist id="poSupplierPaymentOptions">${paymentTermOptions.map(option => `<option value="${escapeHtml(option)}"></option>`).join("")}</datalist>
      <div class="inventory-topbar">
        <div>
          <h2>${supplier ? "Edit Supplier" : "Create New Supplier"}</h2>
          <p class="inventory-muted">Supplier details for Purchase Orders only.</p>
        </div>
        <button class="mini-button" data-close-po-supplier-modal>Close</button>
      </div>
      <div class="form-grid">
        <label>Supplier Name<input id="poSupplierName" value="${escapeHtml(supplier?.supplierName || "")}"></label>
        <label>TRN<input id="poSupplierTrn" value="${escapeHtml(supplier?.trn || "")}"></label>
        <label>Contact Person<input id="poSupplierContact" value="${escapeHtml(supplier?.contactPerson || "")}"></label>
        <label>Phone<input id="poSupplierPhone" value="${escapeHtml(supplier?.phone || "")}"></label>
        <label>Email<input id="poSupplierEmail" type="email" value="${escapeHtml(supplier?.email || "")}"></label>
        <label>Payment Terms${supplierPaymentTermFieldHtml(supplier?.paymentTerms || "")}</label>
        <label>Address<textarea id="poSupplierAddress">${escapeHtml(supplier?.address || "")}</textarea></label>
      </div>
      <div class="inventory-actions">
        <button class="ghost-button" data-close-po-supplier-modal>Cancel</button>
        <button class="primary-button" id="savePoSupplierBtn">Save Supplier</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.querySelectorAll("[data-close-po-supplier-modal]").forEach(button => button.addEventListener("click", () => modal.remove()));
  modal.querySelector("#savePoSupplierBtn").addEventListener("click", () => savePurchaseSupplierFromModal(modal, supplier?.id || ""));
  modal.querySelector("#poSupplierName")?.focus();
}

async function savePurchaseSupplierFromModal(modal, supplierId) {
  const paymentField = modal.querySelector("[data-po-supplier-payment]");
  const supplier = {
    id: supplierId,
    supplierName: $("#poSupplierName").value.trim(),
    trn: $("#poSupplierTrn").value.trim(),
    contactPerson: $("#poSupplierContact").value.trim(),
    phone: $("#poSupplierPhone").value.trim(),
    email: $("#poSupplierEmail").value.trim(),
    paymentTerms: paymentField?.value?.trim() || "",
    address: $("#poSupplierAddress").value.trim()
  };
  if (!supplier.supplierName) return alert("Supplier Name is required.");
  purchaseState = await api("/api/purchase-orders/suppliers", { method: "POST", body: JSON.stringify(supplier) });
  modal.remove();
  renderPurchaseOrders();
  toast("Supplier saved");
}

async function deletePurchaseSupplier(supplierId) {
  if (!confirm("Delete this supplier?")) return;
  purchaseState = await api(`/api/purchase-orders/suppliers/${encodeURIComponent(supplierId)}`, { method: "DELETE" });
  renderPurchaseOrders();
  toast("Supplier deleted");
}

async function loadInventory(options = {}) {
  const force = !!options.force;
  if (!force && inventoryState && Date.now() - inventoryLoadedAt < viewDataRefreshMs) return inventoryState;
  if (inventoryLoadPromise) return inventoryLoadPromise;
  inventoryLoadPromise = api("/api/inventory")
    .then(state => {
      inventoryState = state;
      inventoryLoadedAt = Date.now();
      return state;
    })
    .finally(() => {
      inventoryLoadPromise = null;
    });
  return inventoryLoadPromise;
}

function refreshInventoryInBackground() {
  if (!inventoryState || Date.now() - inventoryLoadedAt < viewDataRefreshMs) return;
  loadInventory({ force: true })
    .then(() => {
      if (activeView === "inventory") renderInventory();
      if (activeView === "salesDesk" && salesDeskScreen === "quotation" && salesQuotationMode === "create") renderSalesDesk();
    })
    .catch(error => console.warn(error));
}

async function loadProjectList() {
  const q = encodeURIComponent($("#searchInput").value || "");
  const projects = await api(`/api/projects?q=${q}`);
  $("#projectList").innerHTML = projects.map(project => `
    <article class="project-card">
      <div>
        <h3>${escapeHtml(project.project || project.title || "Untitled Project")}</h3>
        <p>${escapeHtml(project.customer || "No customer")} · ${escapeHtml(project.quotationNo || "")} · ${new Date(project.updatedAt).toLocaleString()}</p>
      </div>
      <div class="project-card-actions">
        <button class="primary-button" data-open-project="${project.id}">Open Canvas</button>
        <button class="danger-button" data-delete-project="${project.id}">Delete</button>
      </div>
    </article>
  `).join("") || "<p>No saved projects found.</p>";
  document.querySelectorAll("[data-open-project]").forEach(button => {
    button.addEventListener("click", () => loadProject(button.dataset.openProject));
  });
  document.querySelectorAll("[data-delete-project]").forEach(button => {
    button.addEventListener("click", () => deleteProject(button.dataset.deleteProject));
  });
}

async function deleteProject(projectId) {
  if (!confirm("Delete this project canvas? This cannot be undone.")) return;
  await api(`/api/projects/${projectId}`, { method: "DELETE" });
  if (state && state.id === projectId) state = null;
  await loadProjectList();
  toast("Project deleted");
}

function scheduleWorkflowRender(options = {}) {
  const shouldFit = !!options.fit;
  if (workflowRenderRequest) cancelAnimationFrame(workflowRenderRequest);
  workflowRenderRequest = requestAnimationFrame(() => {
    workflowRenderRequest = 0;
    if (activeView !== "canvas" || !state) return;
    render();
    if (shouldFit) requestAnimationFrame(zoomToFit);
  });
}

function render() {
  if (state.tables?.costing?.rows?.length) {
    recalcCosting();
    recalcBoq();
  }
  setWorkflowTitle(state.details.project || "Workflow");
  $("#projectMeta").textContent = `${state.details.customer || "Internal project"} · ${state.quotation.quotationNo}`;
  canvas.innerHTML = "";
  state.nodes.forEach(renderNode);
  applyCanvasZoom();
}

function applyCompactLayout(force) {
  if (!force && state.layoutVersion === "screenshot-v5") return;
  const positions = {
    details: [0, 0],
    "thermal-upload": [180, 255],
    "vrv-upload": [640, 250],
    "thermal-table": [55, 520],
    "costing-table": [980, 130],
    "boq-table": [970, 430],
    quotation: [1680, 340],
    "vrv-schedule": [170, 770]
  };
  state.nodes.forEach(node => {
    if (positions[node.id]) {
      node.x = positions[node.id][0];
      node.y = positions[node.id][1];
      applyDefaultNodeSize(node, true);
    }
  });
  state.layoutVersion = "screenshot-v5";
}

function autoLayoutWorkflow() {
  const positions = {
    details: [0, 0],
    "thermal-upload": [180, 255],
    "vrv-upload": [640, 250],
    "thermal-table": [55, 520],
    "costing-table": [980, 130],
    "boq-table": [970, 430],
    quotation: [1680, 340],
    "vrv-schedule": [170, 770]
  };
  const thermalRows = state.tables.thermal.rows.length;
  const costingRows = state.tables.costing.rows.length;
  const boqRows = state.tables.boq.rows.length;
  const vrvRows = state.tables.vrvSchedule.rows.length;
  const thermalHeight = tableAutoHeight("thermal", thermalRows);
  const costingHeight = tableAutoHeight("costing", costingRows);
  const boqHeight = tableAutoHeight("boq", boqRows);
  const vrvHeight = tableAutoHeight("vrvSchedule", vrvRows);

  positions["boq-table"][1] = positions["costing-table"][1] + costingHeight + 32;
  positions.quotation[1] = Math.max(340, positions["boq-table"][1] - 100);
  positions["vrv-schedule"][1] = Math.max(
    770,
    positions["thermal-table"][1] + thermalHeight + 65,
    positions["boq-table"][1] + boqHeight + 65
  );
  state.nodes.forEach(node => {
    if (positions[node.id] && !node.locked) {
      node.x = positions[node.id][0];
      node.y = positions[node.id][1];
      applyAutoNodeSize(node, { thermalHeight, costingHeight, boqHeight, vrvHeight });
    }
  });
  canvas.style.width = "1950px";
  canvas.style.height = `${positions["vrv-schedule"][1] + vrvHeight + 180}px`;
}

function tableAutoHeight(key, rowCount) {
  const rows = Math.max(0, rowCount);
  if (key === "costing") return Math.max(220, 110 + rows * 28 + 110);
  if (key === "boq") return Math.max(190, 104 + rows * 28 + 74);
  if (key === "thermal") return Math.max(205, 104 + rows * 28 + 54);
  if (key === "vrvSchedule") return Math.max(230, 104 + rows * 28 + 54);
  return 240;
}

function applyAutoNodeSize(node, heights) {
  const sizes = {
    "thermal-table": [520, heights.thermalHeight],
    "costing-table": [650, heights.costingHeight],
    "boq-table": [650, heights.boqHeight],
    "vrv-schedule": [1550, heights.vrvHeight]
  };
  if (sizes[node.id]) {
    node.width = Math.max(node.width || 0, sizes[node.id][0]);
    node.height = preserveTableSizes ? Math.max(node.height || 0, sizes[node.id][1]) : sizes[node.id][1];
  }
}

function applyDefaultNodeSize(node, reset = false) {
  const sizes = {
    "thermal-table": [520, 205],
    "costing-table": [650, 220],
    "boq-table": [650, 190],
    "vrv-schedule": [1550, 230]
  };
  if (sizes[node.id]) {
    node.width = reset ? sizes[node.id][0] : node.width || sizes[node.id][0];
    node.height = reset ? sizes[node.id][1] : node.height || sizes[node.id][1];
  }
}

function setZoom(next) {
  canvasZoom = Math.min(1.35, Math.max(0.45, next));
  applyCanvasZoom();
}

function applyCanvasZoom() {
  canvas.style.transformOrigin = "0 0";
  canvas.style.transform = `scale(${canvasZoom})`;
  canvas.style.marginRight = `${Math.max(0, canvas.offsetWidth * (canvasZoom - 1))}px`;
  canvas.style.marginBottom = `${Math.max(0, canvas.offsetHeight * (canvasZoom - 1))}px`;
}

function zoomToFit() {
  const wrap = $("#canvasView");
  if (!wrap) return;
  const neededWidth = 1900;
  const available = Math.max(600, wrap.clientWidth - 30);
  setZoom(Math.min(0.9, Math.max(0.55, available / neededWidth)));
  wrap.scrollTo({ left: 0, top: 0, behavior: "smooth" });
}

function renderNode(node) {
  const template = $("#nodeTemplate").content.firstElementChild.cloneNode(true);
  template.dataset.nodeId = node.id;
  template.classList.toggle("locked", !!node.locked);
  template.style.left = `${node.x}px`;
  template.style.top = `${node.y}px`;
  if (node.width) template.style.width = `${node.width}px`;
  if (node.height) template.style.height = `${node.height}px`;
  template.querySelector("h2").textContent = node.title;
  template.querySelector(".node-body").appendChild(nodeBody(node));
  if (["projectDetails"].includes(node.type)) template.classList.add("details-node");
  if (["thermalUpload", "vrvUpload", "file"].includes(node.type)) template.classList.add("upload-node");
  if (["thermalTable", "costingTable", "boqTable"].includes(node.type)) template.classList.add("table-node");
  if (node.type === "vrvSchedule") template.classList.add("wide-node");
  if (tableKeys[node.type]) template.classList.add("resizable-node");
  if (node.locked) template.style.resize = "none";
  if (node.type === "quotation") template.classList.add("quotation-node");
  bindNode(template, node);
  bindResizeObserver(template, node);
  canvas.appendChild(template);
}

function bindResizeObserver(el, node) {
  if (!tableKeys[node.type]) return;
  const observer = new ResizeObserver(entries => {
    const rect = entries[0].contentRect;
    const width = Math.round(rect.width);
    const height = Math.round(rect.height);
    if (Math.abs((node.width || 0) - width) > 2 || Math.abs((node.height || 0) - height) > 2) {
      node.width = width;
      node.height = height;
      debounceSaveProject();
    }
  });
  observer.observe(el);
}

function bindNode(el, node) {
  const header = el.querySelector(".node-header");
  if (tableKeys[node.type]) {
    el.addEventListener("pointerdown", () => {
      projectTouched = true;
    });
  }
  header.addEventListener("pointerdown", event => {
    if (node.locked || event.target.closest("button")) return;
    drag = { node, el, sx: event.clientX, sy: event.clientY, ox: node.x, oy: node.y };
    header.setPointerCapture(event.pointerId);
  });
  header.addEventListener("pointermove", event => {
    if (!drag || drag.node.id !== node.id) return;
    node.x = Math.max(0, drag.ox + (event.clientX - drag.sx) / canvasZoom);
    node.y = Math.max(0, drag.oy + (event.clientY - drag.sy) / canvasZoom);
    el.style.left = `${node.x}px`;
    el.style.top = `${node.y}px`;
  });
  header.addEventListener("pointerup", () => {
    if (drag && drag.node.id === node.id) {
      drag = null;
      saveProject();
    }
  });

  const menu = el.querySelector(".node-menu");
  el.querySelector(".menu-button").addEventListener("click", event => {
    event.stopPropagation();
    menu.innerHTML = menuItems(node);
    menu.classList.toggle("hidden");
    bindMenu(menu, node);
  });
}

function menuItems(node) {
  const lockedText = node.locked ? "Unlock" : "Lock";
  const download = tableKeys[node.type] ? `<button data-action="download">Download Excel</button>` : "";
  const quotationDownload = node.type === "quotation" ? `<button data-action="download-doc">Download Word</button>` : "";
  const regen = tableKeys[node.type] ? `<button data-action="regenerate">Regenerate</button>` : "";
  const preview = node.type === "file" || node.type.includes("Upload") ? `<button data-action="preview">Preview File</button>` : "";
  const uploadDownload = ["thermalUpload", "vrvUpload"].includes(node.type) && node.data?.uploadId ? `<button data-action="download-upload">Download File</button>` : "";
  const clearChat = node.type === "thermalUpload" ? `<button data-action="clear-thermal-chat">Clear Chat</button>` : "";
  const deleteUpload = node.data && node.data.uploadId ? `<button class="danger" data-action="delete-upload">Delete Uploaded File</button>` : "";
  const del = tableKeys[node.type] || node.type === "file" ? `<button class="danger" data-action="delete">Delete</button>` : "";
  return `<button data-action="lock">${lockedText}</button>${download}${quotationDownload}${regen}${preview}${uploadDownload}${clearChat}${deleteUpload}${del}`;
}

function bindMenu(menu, node) {
  menu.querySelectorAll("button").forEach(button => {
    button.addEventListener("click", async () => {
      const action = button.dataset.action;
      menu.classList.add("hidden");
      if (action === "lock") {
        node.locked = !node.locked;
        render();
        saveProject();
      }
      if (action === "download") downloadTable(tableKeys[node.type]);
      if (action === "regenerate") regenerate(node.type);
      if (action === "delete") deleteNodeData(node);
      if (action === "delete-upload") deleteUploadedFile(node);
      if (action === "preview") previewUpload(node);
      if (action === "download-upload") downloadUploadedFile(node);
      if (action === "clear-thermal-chat") clearThermalChat();
      if (action === "download-doc") downloadQuotation();
      if (action === "download-pdf") openQuotationPrint();
    });
  });
}

function nodeBody(node) {
  if (node.type === "projectDetails") return detailsBody();
  if (node.type === "thermalUpload") return thermalUploadBody(node);
  if (node.type === "vrvUpload") return vrvUploadBody(node);
  if (tableKeys[node.type]) return tableBody(tableKeys[node.type], node);
  if (node.type === "quotation") return quotationBody();
  if (node.type === "file") return fileBody(node);
  return document.createElement("div");
}

function detailsBody() {
  const wrap = document.createElement("div");
  wrap.className = "details-grid";
  if (!state.details.model) state.details.model = "Daikin";
  const fields = [
    ["customer", "Customer"], ["contactPerson", "Contact Person"], ["telNo", "Tel. No"],
    ["email", "Email"], ["project", "Project"], ["date", "Date"],
    ["location", "Location"], ["model", "Model"], ["preparedBy", "Prepared By"]
  ];
  fields.forEach(([key, label]) => {
    const field = document.createElement("label");
    field.textContent = label;
    const input = document.createElement("input");
    input.type = key === "date" ? "date" : "text";
    input.dataset.detailKey = key;
    if (key === "customer") {
      input.setAttribute("list", "workflowCustomerList");
      input.placeholder = "Type to search customer";
    }
    if (key === "project") {
      input.setAttribute("list", "workflowProjectList");
      input.placeholder = "Type to search project";
    }
    input.value = state.details[key] || "";
    input.addEventListener("input", () => {
      if (key === "customer") {
        if (!input.value.trim()) {
          setWorkflowDetail("customer", "", wrap);
          setWorkflowDetail("contactPerson", "", wrap);
          setWorkflowDetail("telNo", "", wrap);
          setWorkflowDetail("email", "", wrap);
          setWorkflowDetail("project", "", wrap);
          setWorkflowDetail("location", "", wrap);
          updateWorkflowProjectList(wrap);
          scheduleProjectSave();
          return;
        }
        if (findWorkflowCustomer(input.value)) {
          applyWorkflowCustomer(input.value, wrap);
          scheduleProjectSave();
        }
        return;
      }
      state.details[key] = input.value;
      if (key === "project") applyWorkflowProject(input.value, wrap);
      if (key === "project") {
        state.title = input.value || "Untitled Project";
        setWorkflowTitle(state.title);
      }
      scheduleProjectSave();
    });
    if (key === "customer") {
      input.addEventListener("change", () => validateWorkflowCustomerSelection(input.value, wrap));
      input.addEventListener("blur", () => validateWorkflowCustomerSelection(input.value, wrap));
    }
    field.appendChild(input);
    wrap.appendChild(field);
  });
  wrap.appendChild(workflowDatalist("workflowCustomerList", workflowCustomerNames()));
  wrap.appendChild(workflowDatalist("workflowProjectList", workflowProjectsForCustomer(state.details.customer)));
  return wrap;
}

function workflowDatalist(id, values) {
  const list = document.createElement("datalist");
  list.id = id;
  [...new Set(values.filter(Boolean))].forEach(value => {
    const option = document.createElement("option");
    option.value = value;
    list.appendChild(option);
  });
  return list;
}

function workflowCustomerNames() {
  return uniqueValues((salesData().customers || []).map(customer => customer.name));
}

function workflowProjectsForCustomer(customerName = "") {
  const customerKey = norm(customerName);
  return uniqueValues((salesData().projects || [])
    .filter(project => !customerKey || norm(project.customer) === customerKey)
    .map(project => project.name)
    .filter(Boolean));
}

function findWorkflowCustomer(customerName) {
  const key = norm(customerName);
  if (!key) return null;
  return (salesData().customers || []).find(item => norm(item.name) === key) || null;
}

function findWorkflowProject(projectName) {
  const key = norm(projectName);
  if (!key) return null;
  const customerKey = norm(state.details.customer);
  return (salesData().projects || []).find(item =>
    norm(item.name) === key && (!customerKey || norm(item.customer) === customerKey)
  ) || null;
}

function updateWorkflowProjectList(wrap) {
  const list = wrap.querySelector("#workflowProjectList");
  if (!list) return;
  list.innerHTML = "";
  workflowProjectsForCustomer(state.details.customer).forEach(value => {
    const option = document.createElement("option");
    option.value = value;
    list.appendChild(option);
  });
}

function applyWorkflowCustomer(customerName, wrap) {
  const customer = findWorkflowCustomer(customerName);
  if (!customer) return;
  setWorkflowDetail("customer", customer.name, wrap);
  setWorkflowDetail("contactPerson", customer.contact || "", wrap);
  setWorkflowDetail("telNo", customer.phone || "", wrap);
  setWorkflowDetail("email", customer.email || "", wrap);
  const allowedProjects = workflowProjectsForCustomer(customer.name).map(norm);
  if (state.details.project && !allowedProjects.includes(norm(state.details.project))) {
    setWorkflowDetail("project", "", wrap);
    setWorkflowDetail("location", "", wrap);
  }
  updateWorkflowProjectList(wrap);
}

function validateWorkflowCustomerSelection(customerName, wrap) {
  if (!String(customerName || "").trim()) return;
  if (findWorkflowCustomer(customerName)) {
    applyWorkflowCustomer(customerName, wrap);
    return;
  }
  setWorkflowDetail("customer", "", wrap);
  setWorkflowDetail("contactPerson", "", wrap);
  setWorkflowDetail("telNo", "", wrap);
  setWorkflowDetail("email", "", wrap);
  setWorkflowDetail("project", "", wrap);
  setWorkflowDetail("location", "", wrap);
  updateWorkflowProjectList(wrap);
  toast("Select a customer from the customer database.");
}

function applyWorkflowProject(projectName, wrap) {
  const project = findWorkflowProject(projectName);
  if (!project) return;
  setWorkflowDetail("project", project.name, wrap);
  setWorkflowDetail("location", project.location || "", wrap);
  setWorkflowDetail("model", state.details.model || "Daikin", wrap);
  if (project.customer) applyWorkflowCustomer(project.customer, wrap);
}

function setWorkflowDetail(key, value, wrap) {
  state.details[key] = value || "";
  const input = wrap.querySelector(`[data-detail-key="${key}"]`);
  if (input && input.value !== state.details[key]) input.value = state.details[key];
  if (key === "project") {
    state.title = state.details.project || "Untitled Project";
    setWorkflowTitle(state.title);
  }
}

function uploadCard(title, upload) {
  const card = document.createElement("div");
  card.className = `upload-card${upload ? " has-file" : ""}`;
  card.innerHTML = `<div><div class="pdf-icon"></div><strong class="${upload ? "upload-file-name" : ""}">${escapeHtml(upload ? upload.originalName : "No file uploaded")}</strong><span>${upload ? prettyBytes(upload.size) : "Click Upload"}</span></div>`;
  return card;
}

function thermalUploadBody(node) {
  const wrap = document.createElement("div");
  const upload = findUpload(node.data.uploadId);
  const card = uploadCard("Thermal_Sheet.pdf", upload);
  card.addEventListener("click", () => chooseUpload(node.id));
  wrap.appendChild(card);
  const actions = div("node-actions");
  actions.innerHTML = `<button data-action="chat">Open Chat</button>`;
  wrap.appendChild(actions);
  actions.querySelector('[data-action="chat"]').addEventListener("click", openThermalChat);
  return wrap;
}

function vrvUploadBody(node) {
  const wrap = document.createElement("div");
  const upload = findUpload(node.data.uploadId);
  const card = uploadCard("VRV_Selection_Report.pdf", upload);
  card.addEventListener("click", () => chooseUpload(node.id));
  wrap.appendChild(card);
  const actions = div("node-actions");
  actions.innerHTML = `<button data-action="sample">Build Tables</button>`;
  wrap.appendChild(actions);
  actions.querySelector('[data-action="sample"]').addEventListener("click", () => buildVrvTablesFromNode(node));
  return wrap;
}

async function buildVrvTablesFromNode(node) {
  const uploadId = node?.data?.uploadId;
  if (uploadId) {
    await extractVrvUpload(uploadId);
    render();
    saveProject();
    return;
  }
  generateWorkflow();
}

function tableBody(key, node) {
  const table = state.tables[key];
  const wrap = document.createElement("div");
  if (!table) {
    wrap.innerHTML = `<div class="upload-card"><div><strong>${node.title} unavailable</strong></div></div>`;
    return wrap;
  }
  const scroll = div("table-scroll");
  const html = [
    "<table><thead><tr>",
    table.columns.map((column, index) => `<th>${key === "costing" && index === 0 ? `<button class="row-add-button" title="Add row" data-add-row="${key}">+</button>` : ""}${escapeHtml(column)}</th>`).join(""),
    "</tr></thead><tbody>",
    table.rows.length
      ? table.rows.map((row, rowIndex) => {
        const editable = !node.locked && !isGeneratedTableRow(row);
        return `<tr class="${tableRowClass(row)}">${table.columns.map((column, colIndex) => {
          const review = tableCellNeedsReview(row, column);
          const title = review ? ` title="${escapeHtml(review.reason || "Needs review")}${review.first || review.second ? escapeHtml(`. First read: ${review.first || "-"}; second read: ${review.second || "-"}`) : ""}"` : "";
          return `<td class="${review ? "needs-review-cell" : ""}"${title} contenteditable="${editable}" data-table="${key}" data-row="${rowIndex}" data-col="${escapeHtml(column)}">${escapeHtml(row[column])}${key === "costing" && editable && colIndex === table.columns.length - 1 ? `<button class="row-delete-button" title="Delete row" data-delete-row="${rowIndex}">-</button>` : ""}</td>`;
        }).join("")}</tr>`;
      }).join("")
      : `<tr>${table.columns.map(() => `<td class="empty-cell"></td>`).join("")}</tr>`,
    "</tbody></table>"
  ].join("");
  scroll.innerHTML = html;
  wrap.appendChild(scroll);
  if (key === "costing" || key === "boq") wrap.appendChild(summaryBody(key));
  const badge = div("excel-badge");
  badge.textContent = "X";
  wrap.appendChild(badge);
  scroll.querySelectorAll("[contenteditable='true']").forEach(cell => {
    cell.addEventListener("blur", () => {
      const t = state.tables[cell.dataset.table];
      const row = t.rows[Number(cell.dataset.row)];
      row[cell.dataset.col] = cell.textContent.trim();
      clearTableCellReview(row, cell.dataset.col);
      if (cell.dataset.table === "costing") {
        recalcCosting();
        buildBoqFromCosting();
      }
      if (cell.dataset.table === "boq") recalcBoq();
      if (cell.dataset.table === "thermal") buildVrvSchedule();
      if (cell.dataset.table === "vrvSchedule") {
        fillVrvScheduleLookups();
        rebuildVrvScheduleTotals();
      }
      if (cell.dataset.table === "costing") {
        preserveTableSizes = true;
        autoLayoutWorkflow();
        preserveTableSizes = false;
      }
      render();
      saveProject();
    });
  });
  scroll.querySelectorAll("[data-add-row]").forEach(button => {
    button.addEventListener("click", event => {
      event.stopPropagation();
      addCostingRow();
    });
  });
  scroll.querySelectorAll("[data-delete-row]").forEach(button => {
    button.addEventListener("click", event => {
      event.stopPropagation();
      deleteCostingRow(Number(button.dataset.deleteRow));
    });
  });
  return wrap;
}

function tableCellNeedsReview(row, column) {
  return row?.__reviewCells?.[column] || null;
}

function clearTableCellReview(row, column) {
  if (!row?.__reviewCells?.[column]) return;
  delete row.__reviewCells[column];
  if (!Object.keys(row.__reviewCells).length) delete row.__reviewCells;
}

function isEmptyRow(row) {
  return Object.entries(row || {})
    .filter(([key]) => !key.startsWith("__"))
    .every(([, value]) => String(value ?? "").trim() === "");
}

function isGeneratedTableRow(row) {
  return Boolean(row?.__rowType);
}

function tableRowClass(row) {
  if (row?.__rowType === "total") return "total-row";
  if (row?.__rowType === "separator" || isEmptyRow(row)) return "separator-row";
  return "";
}

function addCostingRow() {
  const columns = state.tables.costing.columns;
  const row = Object.fromEntries(columns.map(column => [column, ""]));
  row["S.No"] = state.tables.costing.rows.length + 1;
  row.Qty = 1;
  state.tables.costing.rows.push(row);
  recalcCosting();
  buildBoqFromCosting();
  preserveTableSizes = true;
  autoLayoutWorkflow();
  preserveTableSizes = false;
  render();
  saveProject();
}

function deleteCostingRow(index) {
  if (index < 0 || index >= state.tables.costing.rows.length) return;
  state.tables.costing.rows.splice(index, 1);
  recalcCosting();
  buildBoqFromCosting();
  preserveTableSizes = true;
  autoLayoutWorkflow();
  preserveTableSizes = false;
  render();
  saveProject();
}

function summaryBody(key) {
  const box = div("summary");
  const summary = state.tables[key].summary || {};
  const rows = key === "costing"
    ? [
        ["Total TR", fmt(summary.totalTR)],
        ["Total Cost", money(summary.totalCost)],
        ["Margin", `<input class="margin-input" value="${Number(summary.margin || 0.1) * 100}"> %`],
        ["Selling Price", money(summary.sellingPrice)],
        ["Profit", money(summary.profit)],
        ["Price / Ton", money(summary.pricePerTon)]
      ]
    : [
        ["Total", money(summary.total)],
        ["VAT 5%", money(summary.vat)],
        ["Net Amount", money(summary.netAmount)]
      ];
  box.innerHTML = rows.map(([k, v]) => `<strong>${k}</strong><span>${v}</span>`).join("");
  const margin = box.querySelector(".margin-input");
  if (margin) {
    margin.addEventListener("change", () => {
      state.tables.costing.summary.margin = Number(margin.value || 10) / 100;
      recalcCosting();
      buildBoqFromCosting();
      render();
      saveProject();
    });
  }
  return box;
}

function quotationBody() {
  const wrap = document.createElement("div");
  wrap.innerHTML = `
    <button class="upload-card workflow-quote-button" id="workflowCreateQuoteBtn" type="button" style="height:150px;width:100%;cursor:pointer">
      <div><div class="pdf-icon download-icon"></div><strong>Create Quotation</strong><span>Open Sales Desk</span></div>
    </button>
  `;
  wrap.querySelector("#workflowCreateQuoteBtn").addEventListener("click", createSalesQuotationFromWorkflow);
  return wrap;
}

async function createSalesQuotationFromWorkflow() {
  if (!state) return;
  const customerName = state.details.customer || "";
  if (customerName) {
    if (!salesCrmState) await loadSalesCrm();
    const existingCustomer = (salesData().customers || []).find(item => norm(item.name) === norm(customerName));
    salesCrmState = await api("/api/sales-crm/customers", {
      method: "POST",
      body: JSON.stringify({
        id: existingCustomer?.id || "",
        name: customerName,
        contact: existingCustomer?.contact || state.details.contactPerson || "",
        phone: existingCustomer?.phone || state.details.telNo || "",
        email: existingCustomer?.email || state.details.email || "",
        address: existingCustomer?.address || state.details.location || "",
        detail: existingCustomer?.detail || state.details.project || "",
        type: existingCustomer?.type || "Commercial"
      })
    });
  } else if (!salesCrmState) {
    await loadSalesCrm();
  }
  salesQuotationDraft = quoteDraftFromSource({
    customer: customerName,
    project: state.details.project || "",
    location: state.details.location || "",
    enquiryNo: state.details.enquiryNo || "",
    items: workflowBoqQuoteItems(),
    manualSubtotal: money(state.tables.boq.summary?.total || state.tables.costing.summary?.sellingPrice || 0)
  });
  salesQuotationMode = "create";
  showSalesDesk("quotation");
  toast("Quotation draft prepared from workflow");
}

function workflowBoqQuoteItems() {
  const boqRows = state.tables.boq.rows || [];
  if (!boqRows.length) return [{ description: "", qty: 1, unit: "Nos", unitPrice: 0 }];
  return boqRows.map(row => {
    const qty = Number(row.Qty || 0) || 1;
    return {
      description: row.Description || "",
      qty,
      unit: "Nos",
      unitPrice: 0
    };
  });
}

function renderInventory() {
  const root = $("#inventoryRoot");
  if (!inventoryState) {
    root.innerHTML = "";
    return;
  }
  renderViewActions();
  let content = "";
  if (inventoryScreen === "supplier") content = supplierDnViewHtml();
  else if (inventoryScreen === "supplierAll") content = supplierDnAllViewHtml();
  else if (inventoryScreen === "delivery") content = deliveryNoteViewHtml();
  else if (inventoryScreen === "customers") content = customerListViewHtml();
  else if (inventoryScreen === "stock") content = stockViewHtml();
  else content = inventoryDashboardHtml();
  root.innerHTML = inventoryTopbarConfig() ? `<div class="inventory-topbar-moved">${content}</div>` : content;
  bindInventoryEvents();
}

function inventoryDashboardHtml() {
  const d = inventoryState.dashboard;
  const totalReservedQty = (d.stock || []).reduce((sum, item) => sum + Number(item.reservedQty || 0), 0);
  const totalFreeStock = (d.stock || []).reduce((sum, item) => sum + Number(item.freeStock ?? (Number(item.qty || 0) - Number(item.reservedQty || 0))), 0);
  return `
    <div class="inventory-topbar">
      <div class="inventory-title"><h2>Inventory Dashboard</h2><p>Simple AC unit stock summary.</p></div>
      <div class="inventory-search"><input id="inventorySearch" placeholder="Search model, description, or DN..."><button class="primary-button" data-go-inventory="supplier">Upload DN</button></div>
    </div>
    <div class="kpi-grid">
      <div class="kpi-card"><span>Total Models</span><strong>${d.totalModels}</strong><span>Different AC Models</span></div>
      <div class="kpi-card"><span>Total Stock Units</span><strong>${d.totalStockUnits}</strong><span>All AC Units in Stock</span></div>
      <div class="kpi-card"><span>Total Reserved Qty</span><strong>${totalReservedQty}</strong><span>All Reserved Units</span></div>
      <div class="kpi-card"><span>Total Free Stock</span><strong>${totalFreeStock}</strong><span>Free Stock After Reserved</span></div>
    </div>
    <div class="inventory-grid">
      <div class="inventory-card">
        <h3>Stock Overview</h3>
        <table class="inventory-table dashboard-stock-table"><thead><tr><th>Model No.</th><th>Warehouse Qty</th><th>Reserved Qty</th><th>Free Stock</th></tr></thead><tbody>
          ${dashboardStockOverviewRowsHtml()}
        </tbody></table>
      </div>
      <div>
        <div class="inventory-card"><h3>Recent Stock In</h3>${d.recentIn.map(m => `<p><strong>${escapeHtml(m.referenceNo)}</strong> ${escapeHtml(m.modelNo)} <span class="pill green">+${m.quantity}</span><br><span class="inventory-muted">${formatInventoryDate(m.date)}</span></p>`).join("") || `<p class="inventory-muted">No stock in yet.</p>`}</div>
        <div class="inventory-card"><h3>Recent Stock Out</h3>${d.recentOut.map(m => `<p><strong>${escapeHtml(m.referenceNo)}</strong> ${escapeHtml(m.modelNo)} <span class="pill red">${m.quantity}</span><br><span class="inventory-muted">${formatInventoryDate(m.date)}</span></p>`).join("") || `<p class="inventory-muted">No stock out yet.</p>`}</div>
      </div>
    </div>
  `;
}

function dashboardStockOverviewRowsHtml() {
  const query = norm(inventoryDashboardSearchQuery);
  const overviewStock = (inventoryState?.dashboard?.stock || []).filter(item => {
    const warehouseQty = Number(item.qty || 0);
    const reservedQty = Number(item.reservedQty || 0);
    const freeStock = Number(item.freeStock ?? (warehouseQty - reservedQty));
    const rowText = norm(`${item.modelNo || ""} ${item.description || ""}`);
    if (query) return rowText.includes(query);
    return warehouseQty !== 0 || reservedQty !== 0 || freeStock !== 0;
  });
  return overviewStock.map(item => {
    const reservedQty = Number(item.reservedQty || 0);
    const freeStock = Number(item.freeStock ?? (Number(item.qty || 0) - reservedQty));
    return `<tr><td><strong>${escapeHtml(item.modelNo)}</strong>${item.description ? `<span class="dashboard-model-description"> - ${escapeHtml(item.description)}</span>` : ""}</td><td><button class="qty-link" data-stock-model="${escapeHtml(item.modelNo)}">${item.qty}</button></td><td>${reservedQty}</td><td>${freeStock}</td></tr>`;
  }).join("") || `<tr><td colspan="4">${query ? "No matching models found." : "No stock yet."}</td></tr>`;
}

function refreshDashboardStockOverview() {
  const body = document.querySelector(".dashboard-stock-table tbody");
  if (body) body.innerHTML = dashboardStockOverviewRowsHtml();
}

function supplierDnViewHtml() {
  const dns = inventoryState.supplierDns || [];
  const latestDns = dns.slice(0, 5);
  const active = activeSupplierDnId ? dns.find(dn => dn.id === activeSupplierDnId && !dn.isManualAdjustment) : null;
  return `
    <div class="inventory-topbar">
      <div class="inventory-title"><h2>Supplier DN</h2><p>Latest 5 stock-in records and upload verification.</p></div>
      <div class="inventory-search"><input id="supplierSearchInput" placeholder="Search DN No, Project Name, Model No"></div>
    </div>
    <div class="inventory-card">
      <table class="inventory-table supplier-dn-table"><thead><tr><th>Uploaded Date</th><th>Supplier DN No.</th><th>Project Name</th><th>Models Found</th><th>Total Qty</th><th>Status</th><th>Action</th></tr></thead><tbody>
        ${supplierDnRows(latestDns)}
      </tbody></table>
    </div>
    <div class="inventory-card">
      <h3>Verification Details</h3>
      ${active ? supplierVerificationHtml(active) : `<label class="upload-zone" id="supplierUploadZone">Upload DN<br><span class="inventory-muted">AI/OCR detects model and quantity.</span></label>`}
    </div>
  `;
}

function supplierDnAllViewHtml() {
  const dns = inventoryState.supplierDns || [];
  const pageSize = 50;
  const totalPages = Math.max(1, Math.ceil(dns.length / pageSize));
  supplierAllPage = Math.min(Math.max(1, supplierAllPage), totalPages);
  const pageRows = dns.slice((supplierAllPage - 1) * pageSize, supplierAllPage * pageSize);
  return `
    <div class="inventory-topbar">
      <div class="inventory-title"><h2>Supplier DN</h2><p>All uploaded and manual stock entries.</p></div>
      <div class="inventory-search"><input id="supplierAllSearchInput" placeholder="Search DN No, Project Name, Model No"></div>
    </div>
    <div class="inventory-card">
      <table class="inventory-table supplier-dn-all-table"><thead><tr><th>Uploaded Date</th><th>Supplier DN No.</th><th>Project Name</th><th>Models Found</th><th>Total Qty</th><th>Status</th><th>Action</th></tr></thead><tbody>
        ${supplierDnRows(pageRows)}
      </tbody></table>
      ${supplierDnPagination(dns.length, pageSize, supplierAllPage)}
    </div>
  `;
}

function supplierDnRows(dns) {
  return dns.map(dn => `<tr><td>${formatInventoryDate(dn.uploadedDate)}</td><td><strong>${escapeHtml(dn.supplierDnNo || "-")}</strong></td><td>${escapeHtml(dn.projectName)}</td><td>${(dn.lines || []).length}</td><td>${sumSupplierQty(dn)}</td><td>${statusPill(dn.status)}</td><td>${rowMenu(supplierDnMenuItems(dn))}</td></tr>`).join("") || `<tr><td colspan="7">No Supplier DN uploaded.</td></tr>`;
}

function supplierDnPagination(total, pageSize, currentPage) {
  const totalPages = Math.ceil(total / pageSize);
  if (totalPages <= 1) return "";
  return `
    <div class="table-pagination">
      <span>Showing ${((currentPage - 1) * pageSize) + 1} to ${Math.min(currentPage * pageSize, total)} of ${total} entries</span>
      <div>
        ${Array.from({ length: totalPages }, (_, index) => {
          const page = index + 1;
          return `<button class="mini-button ${page === currentPage ? "active-page" : ""}" data-supplier-page="${page}">${page}</button>`;
        }).join("")}
      </div>
    </div>
  `;
}

function supplierDnMenuItems(dn) {
  const items = [{ label: "View", action: "view-supplier", id: dn.id }];
  if (!dn.isManualAdjustment) items.push({ label: "Edit", action: "edit-supplier", id: dn.id });
  items.push({ label: "Cancel", action: "cancel-supplier", id: dn.id, danger: true });
  items.push({ label: "Delete", action: "delete-supplier", id: dn.id, danger: true });
  return items;
}

function supplierVerificationHtml(dn) {
  return `
    <div class="form-grid">
      <label>Uploaded Date<input data-supplier-field="uploadedDate" value="${formatInventoryDate(dn.uploadedDate || "")}"></label>
      <label>Supplier DN No.<input data-supplier-field="supplierDnNo" value="${escapeHtml(dn.supplierDnNo || "")}"></label>
      <label>Project Name<input data-supplier-field="projectName" value="${escapeHtml(dn.projectName || "")}"></label>
    </div>
    ${dn.duplicateWarning ? `<p class="pill orange">Duplicate Supplier DN No. warning</p>` : ""}
    <table class="inventory-table"><thead><tr><th>Model No.</th><th>Description</th><th>Detected Qty</th><th>Final Qty</th><th>Status</th><th>Action</th></tr></thead><tbody>
      ${(dn.lines || []).map((line, index) => `<tr><td contenteditable="true" data-supplier-line="${index}" data-field="modelNo">${escapeHtml(line.modelNo)}</td><td contenteditable="true" data-supplier-line="${index}" data-field="description">${escapeHtml(line.description)}</td><td>${line.detectedQty}</td><td><input type="number" min="0" data-supplier-line="${index}" data-field="finalQty" value="${line.finalQty}"></td><td>${statusPill(line.status)}</td><td><button class="danger-button" data-remove-supplier-line="${index}">Remove</button></td></tr>`).join("") || `<tr><td colspan="6">No detected rows. Add manually.</td></tr>`}
    </tbody></table>
    <div class="inventory-actions"><button class="ghost-button" id="addSupplierLineBtn">Add Row</button><button class="ghost-button" id="saveSupplierDnBtn">Save Review</button><button class="danger-button" id="cancelSupplierDnBtn">Cancel DN</button><button class="primary-button" id="confirmSupplierDnBtn">Confirm Stock In</button></div>
  `;
}

function deliveryNoteViewHtml() {
  const notes = inventoryState.deliveryNotes || [];
  const pageSize = 30;
  const totalPages = Math.max(1, Math.ceil(notes.length / pageSize));
  deliveryListPage = Math.min(Math.max(1, deliveryListPage), totalPages);
  const search = deliverySearchQuery.trim().toLowerCase();
  const visibleNotes = search
    ? notes.filter(note => deliveryNoteSearchText(note).includes(search))
    : notes.slice((deliveryListPage - 1) * pageSize, deliveryListPage * pageSize);
  return `
    <div>
      <div class="inventory-topbar"><div class="inventory-title"><h2>Outbound Delivery Note</h2><p>Create, manage, and track outbound delivery notes.</p></div><div class="inventory-search"><input id="deliverySearchInput" placeholder="Search delivery note..." value="${escapeHtml(deliverySearchQuery)}"></div></div>
      <div class="inventory-card">
        <table class="inventory-table delivery-list-table"><thead><tr><th>DN No.</th><th>Customer / Project</th><th>Date</th><th>Total Qty</th><th>Status</th><th>Action</th></tr></thead><tbody>
          ${deliveryNoteRows(visibleNotes)}
        </tbody></table>
        <div id="deliveryPagination">${deliveryNotePagination(notes.length, pageSize, deliveryListPage, search, visibleNotes.length)}</div>
      </div>
    </div>
  `;
}

function deliveryNoteRows(notes) {
  return notes.map(note => `<tr><td><strong>${escapeHtml(note.dnNo)}</strong></td><td>${escapeHtml(note.customerName)}<br><span class="inventory-muted">${escapeHtml(note.projectName)}</span></td><td>${formatInventoryDate(note.date)}</td><td>${sumDeliveryQty(note)}</td><td>${statusPill(deliveryNoteStatusLabel(note.status))}</td><td>${rowMenu([{label:"Edit",action:"edit-delivery",id:note.id},{label:"Download",action:"download-delivery",id:note.id},{label:"Cancel",action:"cancel-delivery",id:note.id,danger:true},{label:"Delete",action:"delete-delivery",id:note.id,danger:true}])}</td></tr>`).join("") || `<tr><td colspan="6">No delivery notes yet.</td></tr>`;
}

function deliveryNoteStatusLabel(status = "") {
  return norm(status) === "issued" ? "Delivered" : status;
}

function deliveryNotePagination(total, pageSize, currentPage, search, visibleCount) {
  if (search) {
    return `<div class="table-pagination"><span>Showing ${visibleCount} search result${visibleCount === 1 ? "" : "s"}</span></div>`;
  }
  const totalPages = Math.ceil(total / pageSize);
  if (totalPages <= 1) return "";
  return `
    <div class="table-pagination">
      <span>Showing ${((currentPage - 1) * pageSize) + 1} to ${Math.min(currentPage * pageSize, total)} of ${total} entries</span>
      <div>
        ${Array.from({ length: totalPages }, (_, index) => {
          const page = index + 1;
          return `<button class="mini-button ${page === currentPage ? "active-page" : ""}" data-delivery-page="${page}">${page}</button>`;
        }).join("")}
      </div>
    </div>
  `;
}

function deliveryNoteSearchText(note) {
  return [
    note.dnNo,
    note.customerName,
    note.projectName,
    note.date,
    formatInventoryDate(note.date),
    note.status,
    ...(note.lines || []).flatMap(line => [line.modelNo, line.description, line.qtyGoingOut])
  ].join(" ").toLowerCase();
}

function refreshDeliveryNoteList() {
  const notes = inventoryState.deliveryNotes || [];
  const pageSize = 30;
  const totalPages = Math.max(1, Math.ceil(notes.length / pageSize));
  deliveryListPage = Math.min(Math.max(1, deliveryListPage), totalPages);
  const search = deliverySearchQuery.trim().toLowerCase();
  const visibleNotes = search
    ? notes.filter(note => deliveryNoteSearchText(note).includes(search))
    : notes.slice((deliveryListPage - 1) * pageSize, deliveryListPage * pageSize);
  const body = document.querySelector(".delivery-list-table tbody");
  const pagination = $("#deliveryPagination");
  if (body) body.innerHTML = deliveryNoteRows(visibleNotes);
  if (pagination) pagination.innerHTML = deliveryNotePagination(notes.length, pageSize, deliveryListPage, search, visibleNotes.length);
}

function customerListViewHtml() {
  const customers = inventoryState.customers || [];
  return `
    <div class="inventory-topbar">
      <div class="inventory-title"><h2>Customer List</h2><p>Manage customers used in outbound Delivery Notes.</p></div>
    </div>
    <div class="inventory-card">
      <table class="inventory-table"><thead><tr><th>Customer Name</th><th>Contact Person</th><th>Phone</th><th>Email</th><th>Default Delivery Location</th><th>Action</th></tr></thead><tbody>
        ${customers.map(customer => `<tr><td><strong>${escapeHtml(customer.customerName)}</strong></td><td>${escapeHtml(customer.contactPerson || "")}</td><td>${escapeHtml(customer.phone || "")}</td><td>${escapeHtml(customer.email || "")}</td><td>${escapeHtml(customer.defaultDeliveryLocation || "")}</td><td>${rowMenu([{label:"Edit",action:"edit-customer",id:customer.id},{label:"Delete",action:"delete-customer",id:customer.id,danger:true}])}</td></tr>`).join("") || `<tr><td colspan="6">No customers added.</td></tr>`}
      </tbody></table>
    </div>
  `;
}

function deliveryFormHtml(dn) {
  const customers = inventoryState.customers || [];
  const stock = inventoryState.dashboard.stock || [];
  const customerProjects = deliveryProjectsForCustomer(dn.customerName);
  return `
    <div class="form-grid">
      <label>DN No.<input id="dnNoInput" value="${escapeHtml(dn.dnNo)}"></label>
      <label>Date<input id="dnDateInput" placeholder="DD-MM-YYYY" value="${formatInventoryDate(dn.date)}"></label>
      <label>Customer Name<input id="customerNameInput" list="customerList" value="${escapeHtml(dn.customerName)}"></label>
      <label>Contact Person<input id="contactInput" value="${escapeHtml(dn.contactPerson)}"></label>
      <label>Phone<input id="phoneInput" value="${escapeHtml(dn.phone)}"></label>
      <label>Delivery Location<input id="locationInput" value="${escapeHtml(dn.deliveryLocation)}"></label>
      <label>Project Name<input id="projectInput" list="deliveryProjectList" placeholder="Type/select active project" value="${escapeHtml(dn.projectName)}"></label>
    </div>
    <datalist id="customerList">${customers.map(c => `<option value="${escapeHtml(c.customerName)}"></option>`).join("")}</datalist>
    <datalist id="deliveryProjectList">${customerProjects.map(project => `<option value="${escapeHtml(project)}"></option>`).join("")}</datalist>
    <datalist id="modelList">${stock.map(item => `<option value="${escapeHtml(item.modelNo)}">${escapeHtml(item.description)}</option>`).join("")}</datalist>
    <h3>Item Details</h3>
    <table class="inventory-table delivery-line-table">
      <colgroup>
        <col class="delivery-col-model">
        <col class="delivery-col-description">
        <col class="delivery-col-available">
        <col class="delivery-col-qty">
        <col class="delivery-col-action">
      </colgroup>
      <thead><tr><th>MODEL NO.</th><th>DESCRIPTION</th><th>AVAILABLE QTY</th><th>QTY</th><th>ACTION</th></tr></thead><tbody>
      ${(dn.lines || []).map((line, index) => `<tr><td><input data-suggestion-list="modelList" data-delivery-model-line="${index}" value="${escapeHtml(line.modelNo)}"></td><td>${escapeHtml(line.description)}</td><td>${line.availableQty}</td><td><input type="number" min="1" max="${line.availableQty}" data-delivery-line="${index}" value="${line.qtyGoingOut}"></td><td><button class="danger-button" data-remove-delivery-line="${index}">Remove</button></td></tr>`).join("") || `<tr><td colspan="5">No items added.</td></tr>`}
    </tbody></table>
    <div class="inventory-actions" style="justify-content:flex-start"><button class="ghost-button" id="addDeliveryLineBtn">Add Row</button></div>
    <div class="inventory-actions"><button class="ghost-button" id="saveDraftBtn">Save Draft</button><button class="primary-button" id="issueDeliveryBtn">Create</button><button class="ghost-button" id="downloadDraftPdfBtn">Download PDF</button></div>
  `;
}

function openDeliveryModal(note = null) {
  document.querySelector("[data-delivery-modal]")?.remove();
  deliveryDraft = note ? structuredClone(note) : newDeliveryDraft();
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.dataset.deliveryModal = "true";
  modal.innerHTML = `
    <div class="modal delivery-note-modal">
      <div class="inventory-topbar">
        <div><h2>${note ? "Edit Delivery Note" : "Create Delivery Note"}</h2><p class="inventory-muted">Create and issue outbound delivery notes.</p></div>
        <button class="mini-button" data-close-delivery-modal>Close</button>
      </div>
      <div data-delivery-modal-body>
        ${deliveryFormHtml(deliveryDraft)}
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.addEventListener("click", handleDeliveryModalClick);
  modal.addEventListener("input", handleDeliveryModalInput);
  modal.addEventListener("change", handleDeliveryModalChange);
  modal.querySelector("#dnNoInput")?.focus();
}

function closeDeliveryModal() {
  document.querySelector("[data-delivery-modal]")?.remove();
}

function refreshDeliveryModalForm() {
  const body = document.querySelector("[data-delivery-modal-body]");
  if (!body) return renderInventory();
  body.innerHTML = deliveryFormHtml(deliveryDraft);
}

function handleDeliveryModalClick(event) {
  const target = event.target.closest("button");
  if (!target) {
    if (event.target.dataset.deliveryModal) closeDeliveryModal();
    return;
  }
  if (target.dataset.closeDeliveryModal !== undefined) return closeDeliveryModal();
  if (target.id === "addDeliveryLineBtn") return addDeliveryLine();
  if (target.dataset.removeDeliveryLine) {
    deliveryDraft = collectDeliveryDraft(deliveryDraft.status || "Draft");
    deliveryDraft.lines.splice(Number(target.dataset.removeDeliveryLine), 1);
    return refreshDeliveryModalForm();
  }
  if (target.id === "saveDraftBtn") return saveDelivery("Draft");
  if (target.id === "issueDeliveryBtn") return saveDelivery("Delivered");
  if (target.id === "downloadDraftPdfBtn") return downloadDeliveryPdf(collectDeliveryDraft("Draft"));
}

function handleDeliveryModalInput(event) {
  const input = event.target;
  if (input.dataset.suggestionList) {
    toggleSuggestionList(input);
  }
  if (input.id === "customerNameInput") updateDeliveryProjectList(input.value);
  if (input.dataset.deliveryLine) {
    const line = deliveryDraft.lines[Number(input.dataset.deliveryLine)];
    if (!line) return;
    line.qtyGoingOut = Math.min(Number(input.value || 0), Number(line.availableQty || 0));
    input.value = line.qtyGoingOut;
  }
}

function handleDeliveryModalChange(event) {
  const input = event.target;
  if (input.dataset.suggestionList) {
    toggleSuggestionList(input);
  }
  if (input.id === "customerNameInput") return fillCustomerDetails();
  if (input.dataset.deliveryModelLine) return updateDeliveryLineModel(Number(input.dataset.deliveryModelLine), input.value);
}

function stockViewHtml() {
  const stock = inventoryState.dashboard.stock || [];
  return `
    <div class="inventory-topbar">
      <div class="inventory-title"><h2>Stock</h2><p>Manage AC unit model master and view full stock details.</p></div>
      <div class="inventory-search"><input id="stockSearchInput" placeholder="Search model or description"></div>
    </div>
    <div class="inventory-card stock-full-card">
      <h3>Full Stock Details</h3>
      <table class="inventory-table stock-details-table"><thead><tr><th>Model No.</th><th>Description</th><th>Current Qty</th><th>Reserved Qty</th><th>Free Stock</th><th>Action</th></tr></thead><tbody>
        ${stock.map(item => {
          const reservedQty = Number(item.reservedQty || 0);
          const freeStock = Number(item.qty || 0) - reservedQty;
          return `<tr><td><strong>${escapeHtml(item.modelNo)}</strong></td><td class="stock-description-cell">${escapeHtml(item.description)}</td><td><button class="qty-link" data-stock-model="${escapeHtml(item.modelNo)}">${item.qty}</button></td><td><input class="stock-reserved-input" type="number" min="0" data-stock-reserved-model="${escapeHtml(item.modelNo)}" value="${reservedQty}"></td><td data-stock-free="${escapeHtml(item.modelNo)}">${freeStock}</td><td>${rowMenu([{label:"Edit",action:"edit-stock-model",id:item.modelNo},{label:"Delete",action:"delete-stock-model",id:item.modelNo,danger:true}])}</td></tr>`;
        }).join("") || `<tr><td colspan="6">No models yet. Add a model manually.</td></tr>`}
      </tbody></table>
    </div>
  `;
}

function stockModelModalHtml() {
  const stock = inventoryState.dashboard.stock || [];
  const stockModelOptions = Array.from(
    new Map([...(inventoryState.models || []), ...stock].filter(item => item?.modelNo).map(item => [norm(item.modelNo), item])).values()
  );
  return `
    <div class="modal stock-model-modal">
      <div class="inventory-topbar">
        <div><h2>Stock Adjustment / Edit Model</h2><p class="inventory-muted">Update model details and current available stock.</p></div>
        <button class="mini-button" data-close-stock-modal>Close</button>
      </div>
      <div class="form-grid">
        <label>Model No.<input id="stockModelNo" list="stockModelOptions"></label>
        <datalist id="stockModelOptions">
          ${stockModelOptions.map(item => `<option value="${escapeHtml(item.modelNo)}">${escapeHtml(item.description || item.brand || item.type || "")}</option>`).join("")}
        </datalist>
        <label>Description<input id="stockDescription"></label>
        <label>Brand<input id="stockBrand" value="Daikin"></label>
        <label>Quantity<input id="stockQuantity" type="number" min="0" value="0"></label>
      </div>
      <p class="inventory-muted">Quantity sets the current available stock using a manual inventory adjustment.</p>
      <div class="inventory-actions"><button class="danger-button" id="deleteStockModelBtn">Delete Model</button><button class="ghost-button" id="clearStockModelBtn">Clear</button><button class="primary-button" id="saveStockModelBtn2">Save Model</button></div>
    </div>
  `;
}

function openStockModelModal(modelNo = "") {
  document.querySelector("[data-stock-model-modal]")?.remove();
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.dataset.stockModelModal = "true";
  modal.innerHTML = stockModelModalHtml();
  $("#inventoryRoot")?.appendChild(modal);
  if (modelNo) fillStockModelForm(modelNo);
  else clearStockModelForm();
  modal.querySelector("#stockModelNo")?.focus();
}

function closeStockModelModal() {
  document.querySelector("[data-stock-model-modal]")?.remove();
}

function bindInventoryEvents() {
  bindDeliveryResizer();
}

function rowMenu(items) {
  return `<div class="row-menu"><button class="menu-button inventory-menu-button" data-row-menu>...</button><div class="row-menu-list hidden">${items.map(item => `<button class="${item.danger ? "danger" : ""}" data-menu-action="${item.action}" data-menu-id="${escapeHtml(item.id)}">${escapeHtml(item.label)}</button>`).join("")}</div></div>`;
}

function handleInventoryClick(event) {
  const target = event.target.closest("button, .upload-zone");
  if (!target || !$("#inventoryRoot").contains(target)) return;
  if (target.dataset.rowMenu !== undefined) {
    const menu = target.closest(".row-menu").querySelector(".row-menu-list");
    document.querySelectorAll(".row-menu-list").forEach(list => {
      if (list !== menu) list.classList.add("hidden");
    });
    menu.classList.toggle("hidden");
    return;
  }
  if (target.dataset.menuAction) return handleInventoryMenuAction(target.dataset.menuAction, target.dataset.menuId);
  if (target.dataset.goInventory) return showInventory(target.dataset.goInventory);
  if (target.dataset.stockModel) return openStockPopup(target.dataset.stockModel);
  if (target.dataset.supplierPage) {
    supplierAllPage = Number(target.dataset.supplierPage);
    return renderInventory();
  }
  if (target.dataset.deliveryPage) {
    deliveryListPage = Number(target.dataset.deliveryPage);
    return refreshDeliveryNoteList();
  }
  if (target.id === "supplierUploadZone") return uploadSupplierDn();
  if (target.dataset.selectSupplier) {
    activeSupplierDnId = target.dataset.selectSupplier;
    return renderInventory();
  }
  if (target.dataset.removeSupplierLine) {
    const dn = activeSupplierDn();
    dn?.lines?.splice(Number(target.dataset.removeSupplierLine), 1);
    return renderInventory();
  }
  if (target.id === "addSupplierLineBtn") {
    const dn = activeSupplierDn();
    dn.lines.push({ id: String(Date.now()), modelNo: "", description: "", detectedQty: 0, finalQty: 0, status: "Check Needed" });
    return renderInventory();
  }
  if (target.id === "saveSupplierDnBtn") return saveActiveSupplierDn();
  if (target.id === "confirmSupplierDnBtn") return confirmActiveSupplierDn();
  if (target.id === "cancelSupplierDnBtn") return cancelActiveSupplierDn();
  if (target.id === "newDeliveryBtn") {
    return openDeliveryModal();
  }
  if (target.id === "addCustomerBtn") return openCustomerModal();
  if (target.dataset.editDelivery) {
    const note = inventoryState.deliveryNotes.find(item => item.id === target.dataset.editDelivery);
    return openDeliveryModal(note);
  }
  if (target.dataset.downloadDelivery) {
    const note = inventoryState.deliveryNotes.find(item => item.id === target.dataset.downloadDelivery);
    return downloadDeliveryPdf(note);
  }
  if (target.dataset.cancelDelivery) return cancelDeliveryNote(target.dataset.cancelDelivery);
  if (target.id === "addDeliveryLineBtn") return addDeliveryLine();
  if (target.dataset.removeDeliveryLine) {
    deliveryDraft.lines.splice(Number(target.dataset.removeDeliveryLine), 1);
    return renderInventory();
  }
  if (target.id === "saveDraftBtn") return saveDelivery("Draft");
  if (target.id === "issueDeliveryBtn") return saveDelivery("Delivered");
  if (target.id === "downloadDraftPdfBtn") return downloadDeliveryPdf(collectDeliveryDraft("Draft"));
  if (target.id === "saveStockModelBtn") return openStockModelModal();
  if (target.id === "saveStockModelBtn2") return saveStockModel();
  if (target.id === "deleteStockModelBtn") return deleteStockModel();
  if (target.id === "clearStockModelBtn") return clearStockModelForm();
  if (target.dataset.closeStockModal !== undefined) return closeStockModelModal();
  if (target.dataset.editStockModel) return openStockModelModal(target.dataset.editStockModel);
}

function handlePurchaseClick(event) {
  const target = event.target.closest("button");
  if (!target || !$("#purchaseOrdersRoot").contains(target)) return;
  if (target.dataset.rowMenu !== undefined) {
    const menu = target.closest(".row-menu").querySelector(".row-menu-list");
    document.querySelectorAll(".row-menu-list").forEach(list => {
      if (list !== menu) list.classList.add("hidden");
    });
    menu.classList.toggle("hidden");
    return;
  }
  if (target.dataset.menuAction) return handlePurchaseMenuAction(target.dataset.menuAction, target.dataset.menuId);
  if (target.id === "poAddSupplierBtn") return openPurchaseSupplierModal();
  if (target.id === "poAddItemBtn") {
    purchaseDraft.items.push(newPurchaseItem());
    return renderPurchaseOrders();
  }
  if (target.dataset.deletePoLine) {
    purchaseDraft.items.splice(Number(target.dataset.deletePoLine), 1);
    if (!purchaseDraft.items.length) purchaseDraft.items.push(newPurchaseItem());
    recalcPurchaseOrder(purchaseDraft);
    return renderPurchaseOrders();
  }
  if (target.dataset.removePoAttachment !== undefined) return removePurchaseAttachment();
  if (target.id === "poSaveDraftBtn") return savePurchaseDraft(false);
  if (target.id === "poCreateBtn") return savePurchaseDraft(true);
  if (target.id === "poDownloadBtn") return downloadPurchasePdf(purchaseDraft);
}

function removePurchaseAttachment() {
  if (!purchaseDraft) return;
  purchaseDraft.sourceUploadId = "";
  const savedOrder = (purchaseState?.orders || []).find(order => order.id && order.id === purchaseDraft.id);
  if (savedOrder) savedOrder.sourceUploadId = "";
  renderPurchaseOrders();
  toast("Attachment removed");
}

function handlePurchaseMenuAction(action, idValue) {
  document.querySelectorAll(".row-menu-list").forEach(list => list.classList.add("hidden"));
  if (action === "edit-po") {
    const order = (purchaseState.orders || []).find(item => item.id === idValue);
    if (!order) return;
    purchaseDraft = structuredClone(order);
    return showPurchaseOrders("form");
  }
  if (action === "download-po") {
    const order = (purchaseState.orders || []).find(item => item.id === idValue);
    if (order) return downloadPurchasePdf(order);
  }
  if (action === "delete-po") return deletePurchaseOrder(idValue);
  if (action === "edit-po-supplier") {
    const supplier = (purchaseState.suppliers || []).find(item => item.id === idValue);
    if (supplier) return openPurchaseSupplierModal(supplier);
  }
  if (action === "delete-po-supplier") return deletePurchaseSupplier(idValue);
}

function handlePurchaseInput(event) {
  const input = event.target;
  if (input.id === "poSearchInput") {
    purchaseSearchQuery = input.value;
    return renderPurchaseOrdersKeepingInputFocus("poSearchInput", purchaseSearchQuery);
  }
  if (input.id === "poSupplierSearchInput") {
    purchaseSupplierSearchQuery = input.value;
    return renderPurchaseOrdersKeepingInputFocus("poSupplierSearchInput", purchaseSupplierSearchQuery);
  }
  if (!purchaseDraft) return;
  if (input.dataset.poPaymentCustomInline !== undefined) {
    purchaseDraft.paymentTerms = input.value;
    return;
  }
  if (input.dataset.poSubtotal !== undefined) {
    purchaseDraft.manualSubtotal = input.value;
    refreshPurchaseTotals();
    return;
  }
  if (input.dataset.poDiscount !== undefined) {
    input.value = decimalInputValue(input.value);
    purchaseDraft.discount = input.value;
    refreshPurchaseTotals();
    return;
  }
  if (input.dataset.poField) {
    const key = input.dataset.poField;
    purchaseDraft[key] = key.toLowerCase().includes("date") ? parseInventoryDate(input.value) : input.value;
    return;
  }
  if (input.dataset.poLine) {
    const line = purchaseDraft.items[Number(input.dataset.poLine)];
    if (!line) return;
    const field = input.dataset.field;
    line[field] = ["qty", "unitPrice", "vatPercent"].includes(field) ? Number(input.value || 0) : input.value;
    refreshPurchaseTotals();
  }
}

function decimalInputValue(value) {
  const text = String(value || "").replace(/,/g, "").replace(/[^\d.]/g, "");
  const [whole, ...rest] = text.split(".");
  return rest.length ? `${whole}.${rest.join("")}` : whole;
}

async function uploadPurchaseQuotation() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".pdf,.doc,.docx,.png,.jpg,.jpeg";
  input.addEventListener("change", async () => {
    if (!input.files[0]) return;
    const form = new FormData();
    form.append("file", input.files[0]);
    purchaseUploadLoading = true;
    refreshPurchaseTitleSpinner();
    try {
      toast("Scanning quotation...");
      const result = await api("/api/purchase-orders/upload-quotation", { method: "POST", body: form });
      purchaseDraft = { ...newPurchaseDraft(), ...(result.order || {}) };
      if (!String(purchaseDraft.purchaseRepresentative || "").trim()) purchaseDraft.purchaseRepresentative = String(currentUser?.name || "").trim();
      purchaseDraft.notes = defaultPurchaseNotes;
      if (!purchaseDraft.items || !purchaseDraft.items.length) purchaseDraft.items = [newPurchaseItem()];
      recalcPurchaseOrder(purchaseDraft);
      purchaseScreen = "form";
      await loadPurchaseOrders();
      renderPurchaseOrders();
      toast(result.message || "Quotation scanned. Review and edit the PO form.");
    } catch (error) {
      toast(error.message || "Quotation upload failed");
    } finally {
      purchaseUploadLoading = false;
      refreshPurchaseTitleSpinner();
    }
  });
  input.value = "";
  input.click();
}

async function savePurchaseDraft(createOfficial) {
  if (!purchaseDraft.supplierName.trim()) return alert("Supplier Name is required.");
  purchaseDraft.items = (purchaseDraft.items || []).filter(item => item.description || item.modelNo || Number(item.qty || 0) || Number(item.unitPrice || 0));
  if (!purchaseDraft.items.length) return alert("Add at least one item.");
  purchaseDraft.status = createOfficial ? "Created" : "Draft";
  recalcPurchaseOrder(purchaseDraft);
  const result = await api("/api/purchase-orders", {
    method: "POST",
    body: JSON.stringify({ order: purchaseDraft, createOfficial })
  });
  purchaseState = result.state;
  purchaseDraft = result.order;
  renderPurchaseOrders();
  toast(createOfficial ? "Purchase Order created" : "Draft saved");
}

async function deletePurchaseOrder(orderId) {
  if (!confirm("Delete this Purchase Order?")) return;
  purchaseState = await api(`/api/purchase-orders/${encodeURIComponent(orderId)}`, { method: "DELETE" });
  if (purchaseDraft?.id === orderId) purchaseDraft = newPurchaseDraft();
  renderPurchaseOrders();
  toast("Purchase Order deleted");
}

async function downloadPurchasePdf(order) {
  if (!order || order.status !== "Created" || !order.poNo) {
    return alert("Create the Purchase Order first, then download PDF.");
  }
  try {
    const blob = await api("/api/purchase-orders/pdf", { method: "POST", body: JSON.stringify({ order }) });
    downloadBlob(blob, `${safeFile(`${order.poNo}-${order.supplierName || "Supplier"}`)}.pdf`);
  } catch (error) {
    toast(error.message || "Purchase Order PDF download failed.");
  }
}

function handleInventoryMenuAction(action, idValue) {
  document.querySelectorAll(".row-menu-list").forEach(list => list.classList.add("hidden"));
  if (action === "view-supplier") {
    activeSupplierDnId = "";
    return renderInventory();
  }
  if (action === "edit-supplier" || action === "select-supplier") {
    const dn = inventoryState.supplierDns.find(item => item.id === idValue);
    if (dn?.isManualAdjustment) {
      activeSupplierDnId = "";
      return renderInventory();
    }
    activeSupplierDnId = idValue;
    if (inventoryScreen === "supplierAll") return showInventory("supplier");
    return renderInventory();
  }
  if (action === "cancel-supplier") {
    activeSupplierDnId = idValue;
    return cancelActiveSupplierDn();
  }
  if (action === "delete-supplier") return deleteSupplierDn(idValue);
  if (action === "edit-delivery") {
    const note = inventoryState.deliveryNotes.find(item => item.id === idValue);
    return openDeliveryModal(note);
  }
  if (action === "download-delivery") {
    const note = inventoryState.deliveryNotes.find(item => item.id === idValue);
    return downloadDeliveryPdf(note);
  }
  if (action === "cancel-delivery") return cancelDeliveryNote(idValue);
  if (action === "delete-delivery") return deleteDeliveryNote(idValue);
  if (action === "edit-customer") {
    const customer = inventoryState.customers.find(item => item.id === idValue);
    return openCustomerModal(customer);
  }
  if (action === "delete-customer") return deleteCustomer(idValue);
  if (action === "edit-stock-model") return openStockModelModal(idValue);
  if (action === "delete-stock-model") {
    return deleteStockModel(idValue);
  }
}

function handleInventoryInput(event) {
  const input = event.target;
  if (input.dataset.suggestionList) {
    toggleSuggestionList(input);
  }
  if (input.id === "inventorySearch") {
    inventoryDashboardSearchQuery = input.value;
    return refreshDashboardStockOverview();
  }
  if (input.id === "stockSearchInput") return filterInventoryTable(input.value);
  if (input.id === "stockModelNo") return autofillStockModelFields(input.value);
  if (input.dataset.stockReservedModel) return updateStockReservedQty(input.dataset.stockReservedModel, input.value);
  if (input.id === "deliverySearchInput") {
    deliverySearchQuery = input.value;
    deliveryListPage = 1;
    return refreshDeliveryNoteList();
  }
  if (input.id === "supplierSearchInput") return filterScopedTable(".supplier-dn-table", input.value);
  if (input.id === "supplierAllSearchInput") return filterScopedTable(".supplier-dn-all-table", input.value);
  if (input.dataset.supplierField) {
    const dn = activeSupplierDn();
    if (dn) dn[input.dataset.supplierField] = input.dataset.supplierField === "uploadedDate" ? parseInventoryDate(input.value) : input.value;
  }
  if (input.dataset.supplierLine) {
    const dn = activeSupplierDn();
    const line = dn?.lines?.[Number(input.dataset.supplierLine)];
    if (!line) return;
    line[input.dataset.field] = input.dataset.field.includes("Qty") ? Number(input.value || 0) : input.textContent || input.value;
    if (input.dataset.field === "finalQty") line.status = Number(line.finalQty) === Number(line.detectedQty) ? "Ready" : "Edited";
  }
  if (input.dataset.deliveryLine) {
    const line = deliveryDraft.lines[Number(input.dataset.deliveryLine)];
    if (!line) return;
    line.qtyGoingOut = Math.min(Number(input.value || 0), Number(line.availableQty || 0));
    input.value = line.qtyGoingOut;
  }
  if (input.dataset.deliveryModelLine) {
    updateDeliveryLineModel(Number(input.dataset.deliveryModelLine), input.value);
  }
}

function bindDeliveryResizer() {
  const split = $("#deliverySplit");
  const resizer = $("#deliverySplitResizer");
  if (!split || !resizer) return;
  deliveryPanelWidth = clampDeliveryPanelWidth(deliveryPanelWidth, split);
  split.style.setProperty("--delivery-panel-width", `${deliveryPanelWidth}px`);
  resizer.addEventListener("pointerdown", event => {
    startDeliveryResize(event.clientX);
    event.preventDefault();
  });
  resizer.addEventListener("mousedown", event => {
    startDeliveryResize(event.clientX);
    event.preventDefault();
  });
}

function startDeliveryResize(clientX) {
  deliveryResize = { startX: clientX, startWidth: deliveryPanelWidth };
  document.body.classList.add("resizing-delivery");
}

function handleDeliveryResizeMove(event) {
  if (!deliveryResize) return;
  const split = $("#deliverySplit");
  if (!split) return;
  const nextWidth = deliveryResize.startWidth - (event.clientX - deliveryResize.startX);
  deliveryPanelWidth = clampDeliveryPanelWidth(nextWidth, split);
  split.style.setProperty("--delivery-panel-width", `${deliveryPanelWidth}px`);
  event.preventDefault();
}

function stopDeliveryResize() {
  if (!deliveryResize) return;
  deliveryResize = null;
  document.body.classList.remove("resizing-delivery");
  localStorage.setItem("deliveryPanelWidth", String(Math.round(deliveryPanelWidth)));
}

function clampDeliveryPanelWidth(width, split = $("#deliverySplit")) {
  const minRight = 380;
  const minLeft = 360;
  const dividerAndGaps = 36;
  const available = split?.clientWidth || window.innerWidth;
  const maxRight = Math.max(minRight, available - minLeft - dividerAndGaps);
  return Math.max(minRight, Math.min(maxRight, Number(width || 430)));
}

function activeSupplierDn() {
  return inventoryState.supplierDns.find(dn => dn.id === activeSupplierDnId) || inventoryState.supplierDns[0];
}

async function uploadSupplierDn() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".pdf,.png,.jpg,.jpeg";
  input.addEventListener("change", async () => {
    if (!input.files[0]) return;
    const form = new FormData();
    form.append("file", input.files[0]);
    const result = await api("/api/inventory/supplier-dns/upload", { method: "POST", body: form });
    inventoryState = result;
    activeSupplierDnId = result.activeSupplierDnId;
    inventoryScreen = "supplier";
    renderInventory();
  });
  input.click();
}

async function saveActiveSupplierDn() {
  const dn = activeSupplierDn();
  inventoryState = await api("/api/inventory/supplier-dns", { method: "POST", body: JSON.stringify(dn) });
  activeSupplierDnId = dn.id;
  renderInventory();
  toast("Supplier DN saved");
}

async function confirmActiveSupplierDn() {
  const dn = activeSupplierDn();
  await saveActiveSupplierDn();
  const missing = dn.lines.filter(line => !inventoryState.models.some(model => norm(model.modelNo) === norm(line.modelNo)));
  if (missing.length && !confirm(`${missing.length} model(s) are not in Model Master. Add them and confirm stock?`)) return;
  inventoryState = await api(`/api/inventory/supplier-dns/${dn.id}/confirm`, { method: "POST", body: "{}" });
  renderInventory();
  toast("Stock updated");
}

async function cancelActiveSupplierDn() {
  const dn = activeSupplierDn();
  if (!dn || !confirm("Cancel this Supplier DN and reverse its stock effect?")) return;
  inventoryState = await api(`/api/inventory/supplier-dns/${dn.id}/cancel`, { method: "POST", body: "{}" });
  activeSupplierDnId = "";
  renderInventory();
}

async function deleteSupplierDn(supplierDnId) {
  if (!confirm("Delete this Supplier DN? This removes the record.")) return;
  inventoryState = await api(`/api/inventory/supplier-dns/${supplierDnId}`, { method: "DELETE" });
  if (activeSupplierDnId === supplierDnId) activeSupplierDnId = "";
  renderInventory();
  toast("Supplier DN deleted");
}

function newDeliveryDraft() {
  return {
    id: "",
    dnNo: inventoryState?.settings?.nextDeliveryNo || "DN-2057",
    date: new Date().toISOString().slice(0, 10),
    customerName: "",
    contactPerson: "",
    phone: "",
    deliveryLocation: "",
    projectName: "",
    status: "Draft",
    lines: [blankDeliveryLine()]
  };
}

function blankDeliveryLine() {
  return { id: String(Date.now() + Math.random()), modelNo: "", description: "", availableQty: 0, qtyGoingOut: 1 };
}

function collectDeliveryDraft(status) {
  const lines = (deliveryDraft.lines || []).filter(line => line.modelNo);
  return {
    ...deliveryDraft,
    dnNo: $("#dnNoInput")?.value || deliveryDraft.dnNo,
    date: parseInventoryDate($("#dnDateInput")?.value || deliveryDraft.date),
    customerName: $("#customerNameInput")?.value || deliveryDraft.customerName,
    contactPerson: $("#contactInput")?.value || deliveryDraft.contactPerson,
    phone: $("#phoneInput")?.value || deliveryDraft.phone,
    deliveryLocation: $("#locationInput")?.value || deliveryDraft.deliveryLocation,
    projectName: $("#projectInput")?.value || deliveryDraft.projectName,
    lines,
    status
  };
}

function fillCustomerDetails() {
  const name = $("#customerNameInput").value;
  const customer = inventoryState.customers.find(c => c.customerName === name);
  updateDeliveryProjectList(name);
  if (!customer) {
    if (name && confirm("Customer not found. Add New Customer?")) {
      api("/api/inventory/customers", { method: "POST", body: JSON.stringify({ customerName: name }) }).then(next => {
        inventoryState = next;
        renderInventory();
      });
    }
    return;
  }
  $("#contactInput").value = customer.contactPerson || "";
  $("#phoneInput").value = customer.phone || "";
  $("#locationInput").value = "";
  const projectInput = $("#projectInput");
  if (projectInput) projectInput.value = "";
}

function deliveryProjectsForCustomer(customerName = "") {
  const customerKey = norm(customerName);
  return uniqueValues((salesData().projects || [])
    .filter(project => !customerKey || norm(project.customer) === customerKey)
    .filter(project => norm(project.status) !== "COMPLETED")
    .map(project => project.name)
    .filter(Boolean));
}

function updateDeliveryProjectList(customerName = "") {
  const list = $("#deliveryProjectList");
  if (!list) return;
  list.innerHTML = deliveryProjectsForCustomer(customerName)
    .map(project => `<option value="${escapeHtml(project)}"></option>`)
    .join("");
}

function openCustomerModal(customer = null) {
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.innerHTML = `
    <div class="modal">
      <div class="inventory-topbar">
        <div><h2>${customer ? "Edit Customer" : "Add Customer"}</h2><p class="inventory-muted">Create a customer for Delivery Notes.</p></div>
        <button class="mini-button" data-close-customer-modal>Close</button>
      </div>
      <div class="form-grid">
        <label>Customer Name<input id="newCustomerName" value="${escapeHtml(customer?.customerName || "")}"></label>
        <label>Contact Person<input id="newCustomerContact" value="${escapeHtml(customer?.contactPerson || "")}"></label>
        <label>Phone<input id="newCustomerPhone" value="${escapeHtml(customer?.phone || "")}"></label>
        <label>Email<input id="newCustomerEmail" type="email" value="${escapeHtml(customer?.email || "")}"></label>
        <label>Address<input id="newCustomerAddress" value="${escapeHtml(customer?.address || "")}"></label>
        <label>Default Delivery Location<input id="newCustomerLocation" value="${escapeHtml(customer?.defaultDeliveryLocation || "")}"></label>
      </div>
      <div class="inventory-actions">
        <button class="ghost-button" data-close-customer-modal>Cancel</button>
        <button class="primary-button" id="saveCustomerBtn">Save Customer</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.querySelectorAll("[data-close-customer-modal]").forEach(button => {
    button.addEventListener("click", () => modal.remove());
  });
  modal.querySelector("#saveCustomerBtn").addEventListener("click", () => saveCustomerFromModal(modal, customer?.id || ""));
}

async function saveCustomerFromModal(modal, customerId = "") {
  const payload = {
    id: customerId,
    customerName: modal.querySelector("#newCustomerName")?.value.trim(),
    contactPerson: modal.querySelector("#newCustomerContact")?.value.trim(),
    phone: modal.querySelector("#newCustomerPhone")?.value.trim(),
    email: modal.querySelector("#newCustomerEmail")?.value.trim(),
    address: modal.querySelector("#newCustomerAddress")?.value.trim(),
    defaultDeliveryLocation: modal.querySelector("#newCustomerLocation")?.value.trim()
  };
  if (!payload.customerName) return alert("Customer Name is required.");
  if (inventoryScreen === "delivery" && deliveryDraft) deliveryDraft = collectDeliveryDraft(deliveryDraft.status || "Draft");
  inventoryState = await api("/api/inventory/customers", { method: "POST", body: JSON.stringify(payload) });
  if (inventoryScreen === "delivery" && deliveryDraft && !deliveryDraft.customerName) {
    deliveryDraft.customerName = payload.customerName;
    deliveryDraft.contactPerson = payload.contactPerson || "";
    deliveryDraft.phone = payload.phone || "";
    deliveryDraft.deliveryLocation = payload.defaultDeliveryLocation || "";
  }
  modal.remove();
  renderInventory();
  toast("Customer saved");
}

async function deleteCustomer(customerId) {
  const customer = inventoryState.customers.find(item => item.id === customerId);
  if (!customer) return;
  if (!confirm(`Delete customer ${customer.customerName}?`)) return;
  try {
    inventoryState = await api(`/api/inventory/customers/${encodeURIComponent(customerId)}`, { method: "DELETE" });
    renderInventory();
    toast("Customer deleted");
  } catch (error) {
    alert(error.message || "Could not delete this customer.");
  }
}

function addDeliveryLine() {
  deliveryDraft = collectDeliveryDraft(deliveryDraft.status || "Draft");
  deliveryDraft.lines.push(blankDeliveryLine());
  refreshDeliveryModalForm();
}

function updateDeliveryLineModel(index, value) {
  const line = deliveryDraft?.lines?.[index];
  if (!line) return;
  const typedModel = value.trim().toUpperCase();
  const stock = inventoryState.dashboard.stock.find(item => norm(item.modelNo) === norm(typedModel));
  line.modelNo = typedModel;
  if (!stock) {
    line.description = "";
    line.availableQty = 0;
    line.qtyGoingOut = Math.max(1, Number(line.qtyGoingOut || 1));
    return;
  }
  line.modelNo = stock.modelNo;
  line.description = stock.description || "";
  line.availableQty = Number(stock.qty || 0);
  line.qtyGoingOut = Math.min(Math.max(1, Number(line.qtyGoingOut || 1)), line.availableQty);
  refreshDeliveryModalForm();
}

async function saveDelivery(status) {
  const note = collectDeliveryDraft(status);
  note.lines = note.lines.filter(line => line.modelNo && Number(line.qtyGoingOut || 0) > 0);
  if (!note.customerName) return alert("Customer name is required.");
  if (!note.lines.length) return alert("Add at least one model.");
  const overQtyLine = note.lines.find(line => Number(line.qtyGoingOut || 0) > Number(line.availableQty || 0));
  if (overQtyLine) return alert(`Qty Going Out cannot be more than Available Qty for ${overQtyLine.modelNo}.`);
  inventoryState = await api("/api/inventory/delivery-notes", { method: "POST", body: JSON.stringify(note) });
  deliveryDraft = newDeliveryDraft();
  deliverySearchQuery = "";
  deliveryListPage = 1;
  closeDeliveryModal();
  renderInventory();
  toast(status === "Delivered" ? "Delivery Note delivered and stock reduced" : "Draft saved");
}

async function cancelDeliveryNote(deliveryNoteId) {
  if (!confirm("Cancel this Delivery Note? If issued, stock will be returned.")) return;
  inventoryState = await api(`/api/inventory/delivery-notes/${deliveryNoteId}/cancel`, { method: "POST", body: "{}" });
  renderInventory();
}

async function deleteDeliveryNote(deliveryNoteId) {
  if (!confirm("Delete this Delivery Note? This removes the record.")) return;
  inventoryState = await api(`/api/inventory/delivery-notes/${deliveryNoteId}`, { method: "DELETE" });
  deliveryDraft = newDeliveryDraft();
  renderInventory();
  toast("Delivery Note deleted");
}

async function downloadDeliveryPdf(note) {
  try {
    const blob = await api("/api/inventory/delivery-note-pdf", { method: "POST", body: JSON.stringify({ deliveryNote: note }) });
    downloadBlob(blob, `${safeFile(note.dnNo || "delivery-note")}.pdf`);
  } catch (error) {
    toast(error.message || "Delivery Note PDF download failed.");
  }
}

function openStockPopup(modelNo) {
  const stock = inventoryState.dashboard.stock.find(item => norm(item.modelNo) === norm(modelNo));
  const lots = inventoryState.dashboard.lots.filter(lot => norm(lot.modelNo) === norm(modelNo));
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.innerHTML = `<div class="modal"><div class="inventory-topbar"><div><h2>Stock Details - ${escapeHtml(stock.modelNo)}</h2><p>${escapeHtml(stock.description)}</p></div><button class="mini-button" data-close-modal>Close</button></div><p><strong>Total Available Qty</strong> <span class="qty-link">${stock.qty}</span></p><table class="inventory-table"><thead><tr><th>Received Date</th><th>Project Name</th><th>Supplier DN No.</th><th>Received Qty</th><th>Delivered Qty</th><th>Available Qty</th></tr></thead><tbody>${lots.map(lot => `<tr><td>${formatInventoryDate(lot.date)}</td><td>${escapeHtml(lot.projectName)}</td><td>${escapeHtml(lot.supplierDnNo)}</td><td>${lot.receivedQty}</td><td>${lot.deliveredQty}</td><td>${lot.availableQty}</td></tr>`).join("") || `<tr><td colspan="6">No receipt breakdown.</td></tr>`}</tbody></table></div>`;
  document.body.appendChild(modal);
  modal.querySelector("[data-close-modal]").addEventListener("click", () => modal.remove());
}

function findStockModelInfo(modelNo) {
  const key = norm(modelNo);
  if (!key) return null;
  const model = (inventoryState.models || []).find(item => norm(item.modelNo) === key);
  const stock = (inventoryState.dashboard?.stock || []).find(item => norm(item.modelNo) === key);
  if (!model && !stock) return null;
  return {
    modelNo: model?.modelNo || stock?.modelNo || "",
    description: model?.description || stock?.description || "",
    brand: model?.brand || stock?.brand || "Daikin",
    reservedQty: Number(stock?.reservedQty ?? model?.reservedQty ?? 0),
    quantity: stock?.qty || 0
  };
}

function autofillStockModelFields(modelNo) {
  const info = findStockModelInfo(modelNo);
  if (!info) return;
  const description = $("#stockDescription");
  const brand = $("#stockBrand");
  if (description) description.value = info.description || "";
  if (brand) brand.value = info.brand || "Daikin";
}

function fillStockModelForm(modelNo) {
  const info = findStockModelInfo(modelNo) || {};
  $("#stockModelNo").value = info.modelNo || "";
  $("#stockDescription").value = info.description || "";
  $("#stockBrand").value = info.brand || "Daikin";
  $("#stockQuantity").value = info.quantity || 0;
}

function clearStockModelForm() {
  ["stockModelNo", "stockDescription"].forEach(id => {
    const el = $(`#${id}`);
    if (el) el.value = "";
  });
  const brand = $("#stockBrand");
  const quantity = $("#stockQuantity");
  if (brand) brand.value = "Daikin";
  if (quantity) quantity.value = 0;
}

async function saveStockModel() {
  const payload = {
    modelNo: $("#stockModelNo")?.value.trim().toUpperCase(),
    description: $("#stockDescription")?.value.trim(),
    brand: $("#stockBrand")?.value.trim() || "Daikin",
    reservedQty: findStockModelInfo($("#stockModelNo")?.value)?.reservedQty || 0,
    quantity: Number($("#stockQuantity")?.value || 0)
  };
  if (!payload.modelNo) return alert("Model No. is required.");
  inventoryState = await api("/api/inventory/models", { method: "POST", body: JSON.stringify(payload) });
  renderInventory();
  toast("Model saved");
}

async function updateStockReservedQty(modelNo, value) {
  const info = findStockModelInfo(modelNo);
  if (!info) return;
  const reservedQty = Math.max(0, Number(value || 0));
  const freeCell = document.querySelector(`[data-stock-free="${CSS.escape(modelNo)}"]`);
  if (freeCell) freeCell.textContent = String(Number(info.quantity || 0) - reservedQty);
  inventoryState = await api("/api/inventory/models", {
    method: "POST",
    body: JSON.stringify({
      modelNo: info.modelNo,
      description: info.description || "",
      brand: info.brand || "Daikin",
      reservedQty
    })
  });
}

async function deleteStockModel(modelNoValue = "") {
  const modelNo = (modelNoValue || $("#stockModelNo")?.value || "").trim().toUpperCase();
  if (!modelNo) return alert("Select a model to delete.");
  if (!confirm(`Delete model ${modelNo}? Manual stock entries for this model will also be removed.`)) return;
  inventoryState = await api(`/api/inventory/models/${encodeURIComponent(modelNo)}`, { method: "DELETE" });
  clearStockModelForm();
  closeStockModelModal();
  renderInventory();
  toast("Model deleted");
}

function filterInventoryTable(query) {
  const q = String(query || "").toLowerCase();
  document.querySelectorAll(".inventory-table tbody tr").forEach(row => {
    row.style.display = row.innerText.toLowerCase().includes(q) ? "" : "none";
  });
}

function filterScopedTable(selector, query) {
  const q = String(query || "").toLowerCase();
  document.querySelectorAll(`${selector} tbody tr`).forEach(row => {
    row.style.display = row.innerText.toLowerCase().includes(q) ? "" : "none";
  });
}

function statusPill(status) {
  const s = status || "Draft";
  const color = s === "Confirmed" || s === "Issued" || s === "Delivered" || s === "Ready" || s === "Created" ? "green" : s === "Cancelled" ? "red" : s === "Review Needed" || s === "Check Needed" ? "orange" : "gray";
  return `<span class="pill ${color}">${escapeHtml(s)}</span>`;
}

function sumSupplierQty(dn) {
  return (dn.lines || []).reduce((sum, line) => sum + Number(line.finalQty || 0), 0);
}

function sumDeliveryQty(dn) {
  return (dn.lines || []).reduce((sum, line) => sum + Number(line.qtyGoingOut || 0), 0);
}

function formatInventoryDate(value) {
  const text = String(value || "").trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}-${iso[2]}-${iso[1]}`;
  const dmy = text.match(/^(\d{2})[-/](\d{2})[-/](\d{4})/);
  if (dmy) return `${dmy[1]}-${dmy[2]}-${dmy[3]}`;
  return escapeHtml(text);
}

function parseInventoryDate(value) {
  const text = String(value || "").trim();
  const dmy = text.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  return text;
}

function fileBody(node) {
  const wrap = document.createElement("div");
  const upload = findUpload(node.data.uploadId);
  wrap.appendChild(uploadCard("Supporting_File.pdf", upload));
  const actions = div("node-actions");
  actions.innerHTML = `<button data-action="upload">Upload</button><button data-action="preview">Preview</button>`;
  wrap.appendChild(actions);
  actions.querySelector('[data-action="upload"]').addEventListener("click", () => chooseUpload(node.id));
  actions.querySelector('[data-action="preview"]').addEventListener("click", () => previewUpload(node));
  return wrap;
}

async function openThermalChat() {
  syncThermalChatSelection();
  $("#chatPanel").classList.remove("hidden");
  $("#chatLog").innerHTML = "";
  if (state.thermalChatMessages && state.thermalChatMessages.length) {
    renderThermalChatMessages();
    ensureThermalExtractionChoicePrompt();
    return;
  }
  const uploadIds = thermalUploadIds();
  if (!uploadIds.length) {
    addChat("Upload the thermal sheet PDF or a zoomed screenshot here.");
    return;
  }
  uploadIds.forEach(uploadId => {
    const upload = findUpload(uploadId);
    if (upload) addChatFile(upload);
  });
  askThermalExtractionChoice();
}

function ensureThermalExtractionChoicePrompt() {
  if (thermalChatSelection.requested) return;
  if (!thermalUploadIds().length) return;
  const hasPrompt = (state.thermalChatMessages || []).some(message =>
    message.kind === "text" && /what do you want to extract/i.test(message.text || "")
  );
  if (!hasPrompt) askThermalExtractionChoice();
}

function renderThermalChatMessages() {
  $("#chatLog").innerHTML = "";
  (state.thermalChatMessages || []).forEach(message => {
    if (message.kind === "file") {
      renderChatFile(message.name, message.size);
    } else {
      renderChatBubble(message.text, message.role || "assistant");
    }
  });
}

function renderChatBubble(message, role = "assistant") {
  const bubble = div("bubble");
  bubble.classList.add(role === "user" ? "bubble-user" : "bubble-assistant");
  bubble.textContent = message;
  $("#chatLog").appendChild(bubble);
  $("#chatLog").scrollTop = $("#chatLog").scrollHeight;
}

function addChat(message, role = "assistant") {
  renderChatBubble(message, role);
  if (state) {
    state.thermalChatMessages = state.thermalChatMessages || [];
    state.thermalChatMessages.push({ kind: "text", role, text: message });
    scheduleProjectSave();
  }
}

function addChatFile(upload) {
  renderChatFile(upload.originalName, upload.size);
  if (state) {
    state.thermalChatMessages = state.thermalChatMessages || [];
    state.thermalChatMessages.push({ kind: "file", name: upload.originalName, size: upload.size });
    scheduleProjectSave();
  }
}

function renderChatFile(name, size) {
  const bubble = div("bubble");
  bubble.classList.add("bubble-file");
  bubble.innerHTML = `<strong>${escapeHtml(name)}</strong><br>${prettyBytes(size)} uploaded`;
  $("#chatLog").appendChild(bubble);
  $("#chatLog").scrollTop = $("#chatLog").scrollHeight;
}

function clearThermalChat() {
  if (!state) return;
  state.thermalChatMessages = [];
  state.thermalPendingUploadIds = [];
  state.thermalChatSelection = {
    mode: "regular",
    capacitySource: "Calculated AC Load",
    familyModel: "",
    customInstruction: "",
    requested: false,
    appendResults: false
  };
  syncThermalChatSelection();
  if (!$("#chatPanel").classList.contains("hidden")) {
    $("#chatLog").innerHTML = "";
    const uploadIds = thermalUploadIds();
    if (uploadIds.length) {
      uploadIds.forEach(uploadId => {
        const upload = findUpload(uploadId);
        if (upload) addChatFile(upload);
      });
      askThermalExtractionChoice();
    } else {
      addChat("Upload the thermal sheet PDF or a zoomed screenshot here.");
    }
  }
  saveProject();
}

function clearThermalTable(resetColumns = false) {
  if (!state?.tables?.thermal) return;
  if (resetColumns || !state.tables.thermal.columns?.length) {
    state.tables.thermal.columns = [...defaultThermalColumns];
  }
  state.tables.thermal.rows = [];
  buildVrvSchedule();
  autoLayoutWorkflow();
  render();
  saveProject();
}

function syncThermalChatSelection() {
  const saved = state?.thermalChatSelection || {};
  thermalChatSelection = {
    mode: saved.mode || thermalChatSelection.mode || "regular",
    capacitySource: saved.capacitySource || thermalChatSelection.capacitySource || "Calculated AC Load",
    familyModel: saved.familyModel || thermalChatSelection.familyModel || "",
    customInstruction: saved.customInstruction || thermalChatSelection.customInstruction || "",
    requested: !!saved.requested || !!thermalChatSelection.requested,
    appendResults: !!saved.appendResults || !!thermalChatSelection.appendResults
  };
  if (state) state.thermalChatSelection = { ...thermalChatSelection };
}

function thermalSelectionLabel() {
  if (thermalChatSelection.mode === "custom") return `custom extraction: ${thermalChatSelection.customInstruction}`;
  return thermalChatSelection.familyModel
    ? `${thermalChatSelection.capacitySource}, model ${thermalChatSelection.familyModel}`
    : `${thermalChatSelection.capacitySource}, no model specified`;
}

async function sendThermalChatReply() {
  const input = $("#thermalChatReplyInput");
  const text = input.value.trim();
  if (!text) return;
  addChat(text, "user");
  const parsed = parseThermalChatReply(text);
  if (parsed.clearTable) {
    input.value = "";
    clearThermalTable(parsed.resetFlow);
    if (parsed.resetFlow) {
      thermalChatSelection = {
        ...thermalChatSelection,
        mode: "regular",
        customInstruction: "",
        requested: false,
        appendResults: false
      };
      if (state) {
        state.thermalChatSelection = { ...thermalChatSelection };
        scheduleProjectSave();
      }
      addChat("Export File table cleared. We can generate from the beginning now. What do you want to extract?");
      askThermalExtractionChoice();
    } else {
      addChat("Export File table cleared.");
    }
    return;
  }
  if (parsed.feedbackOnly) {
    input.value = "";
    addChat("Understood. Tell me what is wrong or what should change, for example: use First Selection, add Air Flow Rate, or upload a clearer screenshot and say verify again.");
    return;
  }
  if (parsed.append && !parsed.customInstruction && thermalChatSelection.requested) {
    thermalChatSelection = { ...thermalChatSelection, appendResults: true, requested: true };
    if (state) {
      state.thermalChatSelection = { ...thermalChatSelection };
      scheduleProjectSave();
    }
    input.value = "";
    const pendingIds = state?.thermalPendingUploadIds || [];
    if (pendingIds.length) {
      addChat("Ok. I will extract the newly uploaded screenshot part(s) and add the rows below the existing Export File table.");
      await extractThermalFromChat({ uploadIds: pendingIds });
      state.thermalPendingUploadIds = [];
      saveProject();
    } else {
      addChat("Ok. Upload the next screenshot part(s), and I will extract them and add the rows below the existing Export File table.");
    }
    return;
  }
  if (parsed.mode === "custom") {
    thermalChatSelection = {
      ...thermalChatSelection,
      mode: "custom",
      customInstruction: parsed.customInstruction,
      requested: true,
      appendResults: !!parsed.append
    };
    if (state) {
      state.thermalChatSelection = { ...thermalChatSelection };
      scheduleProjectSave();
    }
    input.value = "";
    addChat(parsed.append ? "Ok. Reading the file now and adding the extracted rows below the current table." : "Ok. Reading the file now and placing the extracted table in the Export File table.");
    await extractThermalFromChat();
    return;
  }
  if (parsed.mode === "regular") {
    thermalChatSelection.mode = "regular";
  }
  if (parsed.mode === "regular" && parsed.useDefaultRegular) {
    thermalChatSelection = {
      ...thermalChatSelection,
      mode: "regular",
      capacitySource: parsed.capacitySource || thermalChatSelection.capacitySource || "Calculated AC Load",
      familyModel: "",
      requested: true,
      appendResults: !!parsed.append
    };
    if (state) {
      state.thermalChatSelection = { ...thermalChatSelection };
      scheduleProjectSave();
    }
    input.value = "";
    addChat(`Ok, I will use the fixed VRV Export File template with ${thermalSelectionLabel()}.`);
    await extractThermalFromChat();
    return;
  }
  if (parsed.regenerate && thermalChatSelection.requested) {
    thermalChatSelection = { ...thermalChatSelection, appendResults: !!parsed.append };
    if (state) {
      state.thermalChatSelection = { ...thermalChatSelection };
      scheduleProjectSave();
    }
    input.value = "";
    addChat(`Ok, I will verify/regenerate using ${thermalSelectionLabel()}.`);
    const pendingIds = state?.thermalPendingUploadIds || [];
    await extractThermalFromChat({ uploadIds: pendingIds.length ? pendingIds : undefined });
    if (pendingIds.length) {
      state.thermalPendingUploadIds = [];
      saveProject();
    }
    return;
  }
  if (parsed.mode === "regular" && !parsed.capacitySource && !parsed.familyModel) {
    addChat("Ok, we will use the regular VRV export template. Which capacity source should I use? If you want a model/family, mention it explicitly.");
    input.value = "";
    return;
  }
  if (!parsed.capacitySource && !parsed.familyModel && parsed.mode !== "regular") {
    addChat("Tell me what to extract. For the fixed Export File format, reply: VRV export template. For custom columns, reply: extract columns Indoor, Room, Air Flow Rate.");
    return;
  }
  thermalChatSelection = {
    ...thermalChatSelection,
    mode: "regular",
    capacitySource: parsed.capacitySource || thermalChatSelection.capacitySource,
    familyModel: parsed.familyModel || ((parsed.regenerate || parsed.append) ? thermalChatSelection.familyModel : ""),
    requested: true,
    appendResults: !!parsed.append
  };
  if (state) {
    state.thermalChatSelection = { ...thermalChatSelection };
    scheduleProjectSave();
  }
  input.value = "";
  addChat(parsed.append ? `Ok, I will use ${thermalSelectionLabel()} and add the extracted rows below the current table.` : `Ok, I will use the regular VRV template with ${thermalSelectionLabel()}. Reading the file now.`);
  await extractThermalFromChat();
}

function parseThermalChatReply(text) {
  const lower = text.toLowerCase();
  const clearTable = /\b(clear|empty|remove|delete)\b.*\b(table|export file|export)\b|\b(clear table|empty table)\b/.test(lower);
  const resetFlow = /\b(start over|from first|from beginning|generate from first|fresh|restart)\b/.test(lower);
  if (clearTable || resetFlow) return { clearTable: true, resetFlow };
  const explicitCustom = /\b(custom|specific|particular|selected|only)\b.*\b(column|columns|table|field|fields)\b|\b(column|columns|field|fields)\b/.test(lower);
  const wantsRegular = !explicitCustom && /\bvrv\b|regular template|thermal template|export template|export file template|export file|fixed template/.test(lower);
  const feedbackOnly = /\b(wrong|mistake|incorrect|not correct|bad extraction|error)\b/.test(lower) &&
    !/\b(extract|regenerate|verify|recheck|check again|rerun|retry|use|add|include|column|columns|first|second|calculated|continue|append)\b/.test(lower);
  if (feedbackOnly) return { feedbackOnly: true };
  const wantsRegenerate = /\b(regenerate|verify|recheck|check again|rerun|retry)\b/.test(lower);
  const wantsAppend = /\b(continue|append|add below|below|next screenshot|next page|remaining|rest)\b/.test(lower);
  const wantsCustom = explicitCustom;
  if (wantsCustom) {
    return {
      mode: "custom",
      customInstruction: wantsAppend ? `${text}. Continue from the newly uploaded screenshot(s) and append the extracted rows below the existing table.` : text,
      append: wantsAppend
    };
  }
  let capacitySource = "";
  if (lower.includes("first")) capacitySource = "First Selection";
  else if (lower.includes("second")) capacitySource = "Second Selection";
  else if (lower.includes("calculated") || lower.includes("ac load")) capacitySource = "Calculated AC Load";

  const modelByLabel = text.match(/\b(?:model|family)\s*(?:is|:|-)?\s*([a-z0-9-]+)/i);
  const modelByCode = text.match(/\b(FX[A-Z0-9-]*(?:-[A-Z0-9]+)?|[A-Z]{2,}\d{2,}[A-Z0-9-]*)\b/i);
  const familyModel = (modelByLabel?.[1] || modelByCode?.[1] || "").trim().toUpperCase();
  return {
    mode: wantsRegular || wantsRegenerate || wantsAppend ? "regular" : "",
    capacitySource,
    familyModel,
    regenerate: wantsRegenerate,
    append: wantsAppend,
    useDefaultRegular: wantsRegular && !capacitySource && !familyModel
  };
}

async function uploadThermalFromChat() {
  const input = $("#thermalFileInput");
  const files = Array.from(input.files || []);
  if (!files.length) return;
  workflowUploadLoading = true;
  refreshWorkflowTitleSpinner();
  try {
    await ensureProjectSaved({ hidden: true });
    const uploaded = [];
    for (const file of files) {
      const form = new FormData();
      const isFirst = !thermalUploadIds().length && !uploaded.length;
      form.append("nodeId", isFirst ? "thermal-upload" : "thermal-screenshot");
      form.append("file", file);
      const upload = await api(`/api/projects/${state.id}/uploads`, { method: "POST", body: form });
      uploaded.push(upload);
    }
    const project = await api(`/api/projects/${state.id}`);
    state.uploads = project.uploads;
    state.nodes = project.nodes;
    state.thermalChatUploadIds = [...new Set([...(state.thermalChatUploadIds || []), ...uploaded.map(upload => upload.id)])];
    state.thermalPendingUploadIds = uploaded.map(upload => upload.id);
    uploaded.forEach(addChatFile);
    if (thermalChatSelection.requested) {
      if (thermalChatSelection.appendResults) {
        addChat(`${uploaded.length > 1 ? "Files added" : "Screenshot/file added"}. Should I extract these new screenshot(s) and add the rows below? Reply: continue.`);
      } else {
        addChat(`${uploaded.length > 1 ? "Files added" : "Screenshot/file added"}. Should I verify the table again using these screenshot(s)? Reply: verify again.`);
      }
    } else {
      askThermalExtractionChoice();
    }
    render();
    saveProject();
  } catch (error) {
    addChat(error.message || "File upload failed. Please try again.");
    toast(error.message || "File upload failed");
  } finally {
    workflowUploadLoading = false;
    refreshWorkflowTitleSpinner();
    input.value = "";
  }
}

function askThermalExtractionChoice() {
  addChat("What do you want to extract?");
  addChat("For the regular VRV export, reply like: VRV first selection. Mention a model only if you want it filled.");
  addChat("For any other table, tell me the table or columns, for example: extract columns Indoor, Room, Air Flow Rate.");
}

async function extractThermalFromChat(options = {}) {
  if (!thermalUploadIds().length) {
    addChat("Please upload a thermal sheet PDF or screenshot first.");
    return;
  }
  syncThermalChatSelection();
  if (thermalChatSelection.mode === "custom" && !thermalChatSelection.customInstruction) {
    addChat("Please tell me which table or columns to extract before clicking Extract Table.");
    return;
  }
  addChat(`Selected ${thermalSelectionLabel()}.`);
  addChat("Extracting values into the Export File table...");
  const extracted = await scanThermal(false, { uploadIds: options.uploadIds });
  applyThermalScanOptions(extracted);
  if (extracted.rows && extracted.rows.length) {
    const thermalRows = applyExtractionReviewCells(extracted.rows, extracted.reviewCells);
    state.tables.thermal.columns = [...defaultThermalColumns];
    state.tables.thermal.rows = thermalChatSelection.appendResults
      ? [...(state.tables.thermal.rows || []), ...thermalRows]
      : thermalRows;
    autoLayoutWorkflow();
    addChat(extracted.message || "Preview table is ready in the Export File table. Please verify and edit there before downloading Excel.");
    if (extracted.unclearFields && extracted.unclearFields.length) {
      addChat(`Unable to read clearly: ${extracted.unclearFields.join(", ")}. Upload a higher-resolution or zoomed screenshot.`);
    }
  } else if (extracted.customColumns && extracted.customRows && extracted.customColumns.length) {
    const nextRows = applyExtractionReviewCells(extracted.customRows.map(row => {
      const next = {};
      extracted.customColumns.forEach((column, index) => {
        next[column] = Array.isArray(row) ? (row[index] || "") : (row[column] || "");
      });
      return next;
    }), extracted.customReviewCells);
    const existingColumns = state.tables.thermal.columns || [];
    state.tables.thermal.columns = thermalChatSelection.appendResults && existingColumns.length
      ? existingColumns
      : extracted.customColumns;
    state.tables.thermal.rows = thermalChatSelection.appendResults
      ? [...(state.tables.thermal.rows || []), ...nextRows]
      : nextRows;
    autoLayoutWorkflow();
    addChat(extracted.message || "Custom table extraction is ready in the Export File table.");
    if (extracted.unclearFields && extracted.unclearFields.length) {
      addChat(`Unable to read clearly: ${extracted.unclearFields.join(", ")}. Upload a zoomed screenshot of those parts and I will read it again.`);
    }
  } else {
    addChat(extracted.message || "No rows were extracted. Upload a clearer screenshot and try again.");
  }
  render();
  saveProject();
}

function applyExtractionReviewCells(rows = [], reviewCells = {}) {
  const nextRows = rows.map(row => ({ ...row }));
  Object.values(reviewCells || {}).forEach(review => {
    const rowIndex = Number(review.row);
    const column = review.column;
    if (!Number.isFinite(rowIndex) || !column || !nextRows[rowIndex]) return;
    nextRows[rowIndex].__reviewCells = {
      ...(nextRows[rowIndex].__reviewCells || {}),
      [column]: {
        reason: review.reason || "Needs review",
        first: review.first || "",
        second: review.second || ""
      }
    };
  });
  return nextRows;
}

async function scanThermal(previewOnly, overrides = {}) {
  const selection = { ...thermalChatSelection, ...overrides };
  return api(`/api/projects/${state.id}/extract/thermal-vision`, {
    method: "POST",
    body: JSON.stringify({
      uploadIds: selection.uploadIds || thermalUploadIds(),
      mode: selection.mode,
      capacitySource: selection.capacitySource,
      familyModel: selection.familyModel,
      customInstruction: selection.customInstruction,
      customExtraction: selection.customExtraction !== undefined ? selection.customExtraction : selection.mode === "custom",
      previewOnly
    })
  });
}

function applyThermalScanOptions(result) {
  if (thermalChatSelection.mode === "custom") return;
  if (result.capacitySources && result.capacitySources.length) {
    const current = thermalChatSelection.capacitySource;
    if (!result.capacitySources.includes(current)) {
      thermalChatSelection.capacitySource = result.capacitySources[0];
      if (state) state.thermalChatSelection = { ...thermalChatSelection };
    }
    addChat(`Detected source options: ${result.capacitySources.join(", ")}. Reply with the one you want to use.`);
  }
}

function thermalUploadIds() {
  const nodeUploadId = state.nodes.find(node => node.id === "thermal-upload")?.data?.uploadId;
  return [...new Set([nodeUploadId, ...(state.thermalChatUploadIds || [])].filter(Boolean))];
}

async function chooseUpload(nodeId) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".pdf,.doc,.docx,.xlsx,.xls,.png,.jpg,.jpeg";
  input.addEventListener("change", async () => {
    if (!input.files[0]) return;
    const selectedFile = input.files[0];
    const showWorkflowSpinner = nodeId === "thermal-upload" || nodeId === "vrv-upload";
    if (showWorkflowSpinner) {
      workflowUploadLoading = true;
      refreshWorkflowTitleSpinner();
    }
    try {
      await ensureProjectSaved({ hidden: true });
      const form = new FormData();
      form.append("nodeId", nodeId);
      const uploadFile = await workflowUploadFileForNode(nodeId, selectedFile);
      form.append("file", uploadFile, selectedFile.name);
      const upload = await api(`/api/projects/${state.id}/uploads`, { method: "POST", body: form });
      const project = await api(`/api/projects/${state.id}`);
      state.uploads = project.uploads;
      state.nodes = project.nodes;
      if (nodeId === "vrv-upload" && !state.details.project) {
        state.details.project = projectNameFromFile(upload.originalName);
        state.title = state.details.project;
      }
      if (nodeId === "vrv-upload") {
        await extractVrvUpload(upload.id);
      }
      render();
      saveProject();
      toast("File uploaded");
    } catch (error) {
      toast(error.message || "File upload failed");
    } finally {
      if (showWorkflowSpinner) {
        workflowUploadLoading = false;
        refreshWorkflowTitleSpinner();
      }
    }
  });
  input.value = "";
  input.click();
}

async function workflowUploadFileForNode(nodeId, file) {
  const isDocx = /\.docx$/i.test(file.name || "");
  if (nodeId !== "vrv-upload" || !isDocx || file.size < 3.5 * 1024 * 1024) return file;
  const xml = await extractDocxDocumentXml(file);
  if (!xml) throw new Error("This Word file is too large to upload directly. Save it as a smaller DOCX or upload the VRV schedule as a screenshot/PDF.");
  toast("Large Word file optimized for VRV extraction");
  return new File([xml], file.name, {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document+xml"
  });
}

async function extractDocxDocumentXml(file) {
  if (!("DecompressionStream" in window)) return "";
  const bytes = new Uint8Array(await file.arrayBuffer());
  const decoder = new TextDecoder();
  const read16 = offset => bytes[offset] | (bytes[offset + 1] << 8);
  const read32 = offset => (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
  const target = "word/document.xml";
  let eocd = -1;
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 70000); offset -= 1) {
    if (read32(offset) === 0x06054b50) {
      eocd = offset;
      break;
    }
  }
  if (eocd < 0) return "";
  let centralOffset = read32(eocd + 16);
  while (centralOffset < bytes.length - 46 && read32(centralOffset) === 0x02014b50) {
    const method = read16(centralOffset + 10);
    const compressedSize = read32(centralOffset + 20);
    const nameLength = read16(centralOffset + 28);
    const extraLength = read16(centralOffset + 30);
    const commentLength = read16(centralOffset + 32);
    const localOffset = read32(centralOffset + 42);
    const name = decoder.decode(bytes.slice(centralOffset + 46, centralOffset + 46 + nameLength));
    if (name === target && read32(localOffset) === 0x04034b50) {
      const localNameLength = read16(localOffset + 26);
      const localExtraLength = read16(localOffset + 28);
      const dataStart = localOffset + 30 + localNameLength + localExtraLength;
      const compressed = bytes.slice(dataStart, dataStart + compressedSize);
      if (method === 0) return decoder.decode(compressed);
      if (method !== 8) return "";
      const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
      return decoder.decode(await new Response(stream).arrayBuffer());
    }
    centralOffset += 46 + nameLength + extraLength + commentLength;
  }
  return "";
}

async function extractVrvUpload(uploadId) {
  const extracted = await api(`/api/projects/${state.id}/extract/vrv`, {
    method: "POST",
    body: JSON.stringify({ uploadId })
  });
  state.extracted = state.extracted || {};
  state.extracted.vrv = extracted;
  if (extracted.projectName && !state.details.project) state.details.project = extracted.projectName;
  if (extracted.materialRows && extracted.materialRows.length) {
    buildCosting(extracted.materialRows.map(row => [row.model, row.qty]));
    buildBoqFromCosting();
  } else {
    state.tables.costing.rows = [];
    state.tables.boq.rows = [];
    recalcCosting();
    recalcBoq();
  }
  if (extracted.vrvRows && extracted.vrvRows.length) {
    buildVrvSchedule(extracted.vrvRows);
  } else {
    state.tables.vrvSchedule.rows = [];
  }
  autoLayoutWorkflow();
  toast(extracted.message || "VRV extraction completed");
}

function projectNameFromFile(name) {
  const match = name.match(/VRVSelectionReport-(.*?)-\s*\(/i);
  return match ? match[1].trim() : name.replace(/\.[^.]+$/, "");
}

function generateWorkflow() {
  if (!state.priceList.items.length) state.priceList.items = structuredClone(samplePriceItems);
  const vrv = state.extracted && state.extracted.vrv;
  if (vrv?.materialRows?.length) {
    buildCosting(vrv.materialRows.map(row => [row.model, row.qty]));
    buildBoqFromCosting();
  }
  if (vrv?.vrvRows?.length) buildVrvSchedule(vrv.vrvRows);
  autoLayoutWorkflow();
  render();
  saveProject();
}

function buildCosting(materialRows) {
  const cols = state.tables.costing.columns;
  const lookup = new Map(state.priceList.items.map(item => [norm(item.model), item]));
  state.tables.costing.rows = materialRows.map(([model, qty], index) => {
    const item = lookup.get(norm(model));
    return {
      "S.No": index + 1,
      Model: model,
      Qty: qty,
      TR: item ? round2(item.tr || 0) : "",
      "List Price": item ? item.listPrice : "",
      Multiplier: item ? item.multiplier : "",
      Cost: "",
      Amount: "",
      "Selling Price / Unit": ""
    };
  });
  recalcCosting();
  state.tables.costing.columns = cols;
}

function recalcCosting() {
  const summary = state.tables.costing.summary || { margin: 0.1 };
  const rawMargin = Number(summary.margin ?? 0.1);
  const margin = Math.min(Math.max(rawMargin, 0), 0.99);
  const sellingDivisor = 1 - margin;
  let totalTR = 0;
  let totalCost = 0;
  state.tables.costing.rows.forEach((row, index) => {
    row["S.No"] = index + 1;
    const qty = num(row.Qty);
    const tr = num(row.TR);
    const list = num(row["List Price"]);
    const multiplier = num(row.Multiplier);
    const cost = list && multiplier ? list * multiplier : num(row.Cost);
    const amount = cost * qty;
    if (row.TR !== "" && row.TR != null) row.TR = round2(tr);
    row.Cost = cost ? round2(cost) : "";
    row.Amount = amount ? round2(amount) : "";
    row["Selling Price / Unit"] = cost ? round2(cost / sellingDivisor) : "";
    totalTR += tr * qty;
    totalCost += amount;
  });
  summary.totalTR = round2(totalTR);
  summary.totalCost = round2(totalCost);
  summary.margin = margin;
  summary.sellingPrice = round2(totalCost / sellingDivisor);
  summary.profit = round2(summary.sellingPrice - totalCost);
  summary.pricePerTon = totalTR ? round2(summary.sellingPrice / totalTR) : 0;
  state.tables.costing.summary = summary;
}

function buildBoqFromCosting() {
  const lookup = new Map(state.priceList.items.map(item => [norm(item.model), item]));
  state.tables.boq.rows = state.tables.costing.rows.map((row, index) => {
    const item = lookup.get(norm(row.Model));
    return {
      "S.No": index + 1,
      Description: item ? item.boqDescription : row.Model,
      Qty: row.Qty,
      Unit: "Nos"
    };
  });
  recalcBoq();
}

function recalcBoq() {
  const total = Number(state.tables.costing.summary?.sellingPrice || 0);
  state.tables.boq.summary = {
    total: round2(total),
    vat: round2(total * 0.05),
    netAmount: round2(total * 1.05)
  };
}

function buildVrvSchedule(sourceRows) {
  const thermalLookup = createThermalScheduleLookup();
  const indoorMap = new Map(state.lookup.indoorData.map(item => [norm(item.fcu), item]));
  const outdoorMap = new Map(state.lookup.outdoorData.map(item => [norm(item.model), item]));
  const rows = sourceRows || state.extracted?.vrv?.vrvRows || [];
  const output = [];
  let previousSystem = "";
  let systemRows = [];
  const groupedRows = groupVrvRowsForSchedule(rows);
  groupedRows.forEach(item => {
    if (previousSystem && item.system !== previousSystem) {
      output.push(vrvSystemTotalRow(systemRows));
      output.push(emptyVrvSeparatorRow());
      systemRows = [];
    }
    const thermal = thermalLookup(item.name);
    const indoor = indoorMap.get(norm(item.fcu)) || {};
    const outdoor = outdoorDataForSchedule(item, outdoorMap);
    const row = vrvRow(item, thermal, indoor, outdoor);
    output.push(row);
    systemRows.push(row);
    previousSystem = item.system;
  });
  if (systemRows.length) {
    output.push(vrvSystemTotalRow(systemRows));
    output.push(emptyVrvSeparatorRow());
  }
  state.tables.vrvSchedule.rows = output;
}

function createThermalScheduleLookup() {
  const rows = state.tables.thermal?.rows || [];
  const queues = new Map();
  rows.forEach(row => {
    const reference = firstRowValue(row, [
      "Units Reference / No.",
      "Units Reference / No",
      "Unit Reference / No.",
      "Unit Reference / No",
      "Units Reference No.",
      "Units Reference No",
      "Unit Reference No.",
      "Unit Reference No",
      "Units Reference",
      "Unit Reference",
      "Unit Ref",
      "Reference",
      "Name",
      "Indoor",
      "FCU Name",
      "FCU",
      "Indoor Unit",
      "Unit"
    ]);
    const key = norm(reference);
    if (!key) return;
    const value = {
      Location: firstRowValue(row, ["Location", "Room", "Area", "Zone"]),
      "Rq TC": firstRowValue(row, [
      "Rq TC",
      "Req TC",
      "Calculated AC Load - Total kW",
      "Calculated AC Load Total kW",
      "Calculated AC Load - Total KW",
      "Calculated AC Load Total KW",
      "Total kW",
      "Total KW",
      "Total Cooling kW",
        "Total Cooling KW",
        "Tot Cool Cap",
        "Total Cool Cap",
        "Total Capacity",
        "Total Load",
        "Cooling Load"
      ]),
      "Rq SC": firstRowValue(row, [
      "Rq SC",
      "Req SC",
      "Calculated AC Load - Sensible kW",
      "Calculated AC Load Sensible kW",
      "Calculated AC Load - Sensible KW",
      "Calculated AC Load Sensible KW",
      "Sensible kW",
      "Sensible KW",
      "Sens Cool Cap",
        "Sensible Cool Cap",
        "Sensible Capacity",
        "Sensible Load"
      ]),
      "Air Flow Rate": firstRowValue(row, [
      "Air Flow Rate",
      "Calculated AC Load - Flow Rate L/s",
      "Calculated AC Load Flow Rate L/s",
      "Calculated AC Load - Flow Rate Lps",
      "Calculated AC Load Flow Rate Lps",
      "Calculated AC Load - Air Flow Rate",
      "Calculated AC Load Air Flow Rate",
      "Airflow Rate",
      "Air Flow",
      "Airflow",
        "Air Flowrate",
        "Airflow CFM",
        "CFM",
        "L/S"
      ])
    };
    if (!queues.has(key)) queues.set(key, []);
    queues.get(key).push(value);
  });
  const usage = new Map();
  return name => {
    const key = norm(name);
    const matches = queues.get(key) || [];
    if (!matches.length) return {};
    const index = usage.get(key) || 0;
    usage.set(key, index + 1);
    return matches[Math.min(index, matches.length - 1)];
  };
}

function firstRowValue(row, candidates) {
  if (!row) return "";
  const lookup = new Map(Object.keys(row)
    .filter(key => !String(key).startsWith("__"))
    .map(key => [columnKey(key), row[key]]));
  for (const candidate of candidates) {
    const value = lookup.get(columnKey(candidate));
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return "";
}

function columnKey(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function groupVrvRowsForSchedule(rows) {
  const groups = new Map();
  rows.forEach(row => {
    const system = row.system || "";
    if (!groups.has(system)) groups.set(system, []);
    groups.get(system).push({ ...row, outdoorName: "", outdoorModel: "", outdoorComponents: [] });
    const refs = groups.get(system).outdoorRefs || [];
    const explicitRefs = Array.isArray(row.outdoorRefs) ? row.outdoorRefs : [];
    if (explicitRefs.length) {
      refs.push(...explicitRefs.map(ref => ({
        outdoorName: ref.outdoorName || "",
        outdoorModel: ref.outdoorModel || "",
        outdoorComponents: Array.isArray(ref.outdoorComponents) ? ref.outdoorComponents : []
      })));
    } else if (row.outdoorModel) {
      refs.push({
        outdoorName: row.outdoorName || "",
        outdoorModel: row.outdoorModel,
        outdoorComponents: row.outdoorComponents || []
      });
    }
    groups.get(system).outdoorRefs = refs;
  });
  const output = [];
  groups.forEach((items, system) => {
    const refs = normalizeOutdoorAssignments(system, items.outdoorRefs || []);
    const startIndex = items.length <= 5 ? 1 : 2;
    while (items.length < startIndex + refs.length) {
      items.push({ system, name: "", fcu: "", outdoorName: "", outdoorModel: "", outdoorComponents: [] });
    }
    refs.forEach((ref, index) => {
      const target = items[startIndex + index];
      if (!target) return;
      target.outdoorName = ref.outdoorName;
      target.outdoorModel = ref.outdoorModel;
      target.outdoorComponents = ref.outdoorComponents || [];
    });
    output.push(...items.map(item => {
      const copy = { ...item };
      delete copy.outdoorRefs;
      return copy;
    }));
  });
  return output;
}

function normalizeOutdoorAssignments(system, refs) {
  const cleaned = refs
    .map(ref => ({
      outdoorName: String(ref.outdoorName || "").trim(),
      outdoorModel: String(ref.outdoorModel || "").trim(),
      outdoorComponents: Array.isArray(ref.outdoorComponents) ? ref.outdoorComponents : []
    }))
    .filter(ref => ref.outdoorModel);
  const deduped = [];
  const seen = new Set();
  cleaned.forEach(ref => {
    const key = `${norm(ref.outdoorName)}|${norm(ref.outdoorModel)}`;
    if (seen.has(key)) return;
    seen.add(key);
    deduped.push(ref);
  });
  if (!deduped.length) return [];
  const parentIndex = deduped.findIndex(ref => norm(ref.outdoorName) === norm(system) || /^VRV/i.test(ref.outdoorName));
  const parent = parentIndex >= 0 ? deduped[parentIndex] : deduped[0];
  const componentRefs = deduped.filter((_, index) => index !== (parentIndex >= 0 ? parentIndex : 0));
  const componentModels = [...new Set([
    ...(parent.outdoorComponents || []),
    ...componentRefs.map(ref => ref.outdoorModel)
  ].filter(Boolean).map(model => String(model).trim()).filter(Boolean))];
  const assignments = [{
    outdoorName: system,
    outdoorModel: parent.outdoorModel,
    outdoorComponents: componentModels
  }];
  componentRefs.forEach((ref, index) => {
    assignments.push({
      outdoorName: ref.outdoorName && !/^VRV/i.test(ref.outdoorName) ? ref.outdoorName : String.fromCharCode(65 + index),
      outdoorModel: ref.outdoorModel,
      outdoorComponents: []
    });
  });
  return assignments;
}

function emptyVrvSeparatorRow() {
  return {
    ...Object.fromEntries(state.tables.vrvSchedule.columns.map(column => [column, ""])),
    __rowType: "separator"
  };
}

const VRV_SYSTEM_TOTAL_COLUMNS = [
  "Rq TC",
  "Rq SC",
  "Air Flow Rate",
  "Max TC",
  "Max SC",
  "Proposed Air Flow Rate",
  "PIC",
  "PI ESMA"
];

function vrvSystemTotalRow(rows) {
  const totalRow = Object.fromEntries(state.tables.vrvSchedule.columns.map(column => [column, ""]));
  VRV_SYSTEM_TOTAL_COLUMNS.forEach(column => {
    const total = rows.reduce((sum, row) => sum + num(row[column]), 0);
    totalRow[column] = total ? fmt(round2(total)) : "";
  });
  totalRow.__rowType = "total";
  return totalRow;
}

function fillVrvScheduleLookups() {
  const indoorMap = new Map(state.lookup.indoorData.map(item => [norm(item.fcu), item]));
  const outdoorMap = new Map(state.lookup.outdoorData.map(item => [norm(item.model), item]));
  state.tables.vrvSchedule.rows = state.tables.vrvSchedule.rows.map(row => {
    if (row.__rowType) return row;
    const indoor = indoorMap.get(norm(row.FCU)) || {};
    const outdoor = outdoorDataForSchedule({
      outdoorModel: row["Outdoor Model"],
      outdoorComponents: row.outdoorComponents || []
    }, outdoorMap);
    return { ...row, ...indoorFields(indoor), ...outdoorFields(outdoor) };
  });
}

function rebuildVrvScheduleTotals() {
  const output = [];
  let previousSystem = "";
  let systemRows = [];
  state.tables.vrvSchedule.rows
    .filter(row => !row.__rowType)
    .forEach(row => {
      const system = row.System || "";
      if (previousSystem && system !== previousSystem) {
        output.push(vrvSystemTotalRow(systemRows));
        output.push(emptyVrvSeparatorRow());
        systemRows = [];
      }
      output.push(row);
      systemRows.push(row);
      previousSystem = system;
    });
  if (systemRows.length) {
    output.push(vrvSystemTotalRow(systemRows));
    output.push(emptyVrvSeparatorRow());
  }
  state.tables.vrvSchedule.rows = output;
}

function vrvRow(item, thermal, indoor, outdoor) {
  return {
    System: item.system,
    Name: item.name,
    Location: thermal.Location || "",
    "Rq TC": thermal["Rq TC"] || "",
    "Rq SC": thermal["Rq SC"] || "",
    "Air Flow Rate": thermal["Air Flow Rate"] || "",
    FCU: item.fcu,
    ...indoorFields(indoor),
    "Outdoor Name": item.outdoorName,
    "Outdoor Model": item.outdoorModel,
    ...outdoorFields(outdoor)
  };
}

function indoorFields(indoor) {
  return {
    "Nominal Index": indoor.nominalIndex || "",
    "Country of Origin": indoor.origin || "",
    Type: indoor.type || "",
    "Ambient - On Coil Temperature": indoor.ambient || "",
    "Max TC": indoor.maxTC || "",
    "Max SC": indoor.maxSC || "",
    "Proposed Air Flow Rate": indoor.airflow || "",
    PIC: indoor.pic || "",
    Sound: indoor.sound || "",
    PS: indoor.ps || "",
    MCA: indoor.mca || "",
    WxHxD: indoor.wxhxd || "",
    Weight: indoor.weight || ""
  };
}

function outdoorFields(outdoor) {
  return {
    "Outdoor Nominal Index": outdoor.nominalIndex || "",
    "Ambient Temp": outdoor.ambient || "",
    CC: outdoor.cc || "",
    "PI ESMA": outdoor.piEsma || "",
    "Outdoor PS": outdoor.ps || "",
    "Outdoor MCA": outdoor.mca || "",
    MOP: outdoor.mop || "",
    RLA: outdoor.rla || "",
    "Outdoor WxHxD": outdoor.wxhxd || "",
    "Outdoor Weight": outdoor.weight || ""
  };
}

function outdoorDataForSchedule(item, outdoorMap) {
  const model = item?.outdoorModel || item?.["Outdoor Model"] || "";
  const direct = outdoorMap.get(norm(model));
  if (direct) return direct;
  const componentData = (item?.outdoorComponents || [])
    .map(component => outdoorMap.get(norm(component)))
    .filter(Boolean);
  if (!componentData.length) return {};
  return {
    nominalIndex: round2(componentData.reduce((sum, part) => sum + num(part.nominalIndex), 0)),
    ambient: componentData[0].ambient || "",
    cc: round2(componentData.reduce((sum, part) => sum + num(part.cc), 0)),
    piEsma: "",
    ps: "",
    mca: "",
    mop: "",
    rla: "",
    wxhxd: "",
    weight: ""
  };
}

function regenerate(type) {
  if (type === "thermalTable") state.tables.thermal.rows = [];
  if (type === "costingTable") {
    const rows = state.extracted?.vrv?.materialRows || [];
    buildCosting(rows.map(row => [row.model, row.qty]));
  }
  if (type === "boqTable") buildBoqFromCosting();
  if (type === "vrvSchedule") buildVrvSchedule();
  autoLayoutWorkflow();
  render();
  saveProject();
}

function deleteNodeData(node) {
  if (!confirm("Delete this item? Generated tables can be regenerated later from the workflow source.")) return;
  if (tableKeys[node.type]) {
    const key = tableKeys[node.type];
    state.tables[key].rows = [];
    if (key === "costing") state.tables.boq.rows = [];
  } else if (node.type === "file") {
    state.nodes = state.nodes.filter(item => item.id !== node.id);
  }
  render();
  saveProject();
}

function deleteUploadedFile(node) {
  if (!confirm("Delete the uploaded file from this node?")) return;
  const uploadId = node.data.uploadId;
  state.uploads = state.uploads.filter(upload => upload.id !== uploadId);
  delete node.data.uploadId;
  render();
  saveProject();
}

async function downloadTable(key) {
  const table = state.tables[key];
  const summaryRows = [];
  if (key === "costing") {
    recalcCosting();
    recalcBoq();
    const s = state.tables.costing.summary || {};
    summaryRows.push(
      ["Total TR", money(s.totalTr)],
      ["Total Cost", money(s.totalCost)],
      ["Margin", `${Math.round(Number(s.margin || 0) * 100)}%`],
      ["Selling Price", money(s.sellingPrice)],
      ["Profit", money(s.profit)],
      ["Price / Ton", money(s.pricePerTon)]
    );
  }
  if (key === "vrvSchedule") {
    const blob = await api("/api/export/vrv-schedule", {
      method: "POST",
      body: JSON.stringify({
        filename: tableDownloadFilenames[key],
        projectName: state.details?.project || state.details?.projectName || "",
        customerName: state.details?.customer || state.details?.customerName || "",
        columns: table.columns,
        rows: table.rows
      })
    });
    downloadBlob(blob, tableDownloadFilenames[key]);
    return;
  }
  if (key === "boq") {
    const s = table.summary;
    summaryRows.push(["Total", money(s.total)], ["VAT 5%", money(s.vat)], ["Net Amount", money(s.netAmount)]);
  }
  const blob = buildTableWorkbookBlob({
    title: key,
    columns: table.columns,
    rows: table.rows,
    summaryRows: summaryRows.map(([label, value]) => ({ label, value }))
  });
  downloadBlob(blob, tableDownloadFilenames[key] || `${key}.xlsx`);
}

async function downloadQuotation() {
  const blob = await api("/api/export/quotation", {
    method: "POST",
    body: JSON.stringify({
      filename: `${safeFile(state.quotation.quotationNo || "quotation")}.docx`,
      details: state.details,
      quotationNo: state.quotation.quotationNo,
      boq: state.tables.boq
    })
  });
  downloadBlob(blob, `${safeFile(state.quotation.quotationNo || "quotation")}.docx`);
}

async function openQuotationPrint() {
  const blob = await api("/api/export/quotation", {
    method: "POST",
    body: JSON.stringify({ details: state.details, quotationNo: state.quotation.quotationNo, boq: state.tables.boq })
  });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank");
  if (win) setTimeout(() => win.print(), 800);
}

function addFileNode() {
  const count = state.nodes.filter(node => node.type === "file").length + 1;
  state.nodes.push({ id: `file-${Date.now()}`, type: "file", title: `File ${count}`, x: 360 + count * 30, y: 720 + count * 30, locked: false, data: {} });
  render();
  saveProject();
}

function previewUpload(node) {
  const upload = findUpload(node.data.uploadId);
  if (!upload) return toast("No file uploaded yet");
  window.open(`/api/projects/${state.id}/uploads/${upload.id}`, "_blank");
}

async function downloadUploadedFile(node) {
  const upload = findUpload(node.data.uploadId);
  if (!upload) return toast("No file uploaded yet");
  const blob = await api(`/api/projects/${state.id}/uploads/${upload.id}`);
  downloadBlob(blob, upload.originalName || "uploaded-file");
}

function copyShareLink() {
  navigator.clipboard.writeText(location.href);
  toast("Share link copied");
}

function findUpload(uploadId) {
  return state.uploads.find(upload => upload.id === uploadId);
}

function rowFrom(columns, values) {
  return Object.fromEntries(columns.map((column, index) => [column, values[index] ?? ""]));
}

function div(className) {
  const el = document.createElement("div");
  if (className) el.className = className;
  return el;
}

function norm(value) {
  return String(value || "").toUpperCase().replace(/[\s_\-]/g, "");
}

function num(value) {
  if (value === "" || value == null) return 0;
  return Number(String(value).replace(/,/g, "")) || 0;
}

function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function fmt(value) {
  return Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function money(value) {
  return Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function escapeRegExp(value) {
  return String(value ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function prettyBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(i ? 1 : 0)} ${units[i]}`;
}

function fileExt(name) {
  const ext = String(name || "").split(".").pop().slice(0, 4).toUpperCase();
  return ext || "FILE";
}

function safeFile(name) {
  return String(name).replace(/[^\w.-]+/g, "_");
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function buildTableWorkbookBlob(payload = {}) {
  const columns = Array.isArray(payload.columns) ? payload.columns.map(workbookCleanCell).filter(Boolean) : [];
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  const summaryRows = Array.isArray(payload.summaryRows) ? payload.summaryRows : [];
  const columnCount = Math.max(columns.length, 2);
  const sheetRows = [];

  if (columns.length) {
    sheetRows.push(workbookRowXml(1, columns.map((column, index) => ({
      column: index + 1,
      value: column,
      style: 1
    }))));
  }

  rows.forEach((row, index) => {
    sheetRows.push(workbookRowXml(index + 2, columns.map((column, columnIndex) => {
      const value = workbookNumberOrText(row?.[column]);
      return {
        column: columnIndex + 1,
        value,
        style: typeof value === "number" ? 2 : 0
      };
    })));
  });

  const summaryStart = rows.length + 2;
  summaryRows.forEach((item, index) => {
    const value = workbookNumberOrText(item?.value);
    sheetRows.push(workbookRowXml(summaryStart + index, [
      { column: columnCount - 1, value: item?.label || "", style: 1 },
      { column: columnCount, value, style: typeof value === "number" ? 2 : 1 }
    ]));
  });

  const lastRow = Math.max(1, rows.length + 1, summaryStart + summaryRows.length - 1);
  const colsXml = columns.map((column, index) => {
    const width = workbookColumnWidth(column, rows);
    return `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`;
  }).join("");
  const sheetName = workbookSheetName(payload.title || "Table");
  const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><dimension ref="A1:${workbookColumnName(columnCount)}${lastRow}"/><sheetViews><sheetView showGridLines="1" workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="15"/>${colsXml ? `<cols>${colsXml}</cols>` : ""}<sheetData>${sheetRows.join("")}</sheetData><pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/></worksheet>`;

  const files = {
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    "xl/workbook.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${workbookEscapeXml(sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    "xl/styles.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs></styleSheet>`,
    "xl/worksheets/sheet1.xml": sheetXml
  };

  return new Blob([workbookZip(files)], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  });
}

function workbookRowXml(rowNumber, cells) {
  return `<row r="${rowNumber}">${cells.map(cell => workbookCellXml(rowNumber, cell)).join("")}</row>`;
}

function workbookCellXml(rowNumber, cell) {
  const ref = `${workbookColumnName(cell.column)}${rowNumber}`;
  const style = cell.style ? ` s="${cell.style}"` : "";
  if (typeof cell.value === "number" && Number.isFinite(cell.value)) {
    return `<c r="${ref}"${style}><v>${cell.value}</v></c>`;
  }
  const value = workbookCleanCell(cell.value);
  return `<c r="${ref}" t="inlineStr"${style}><is><t>${workbookEscapeXml(value)}</t></is></c>`;
}

function workbookColumnName(index) {
  let name = "";
  let value = index;
  while (value > 0) {
    const remainder = (value - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    value = Math.floor((value - 1) / 26);
  }
  return name;
}

function workbookSheetName(name) {
  return workbookCleanCell(name).replace(/[\[\]*\/\\?:]/g, " ").slice(0, 31).trim() || "Table";
}

function workbookColumnWidth(column, rows) {
  const samples = [column, ...rows.slice(0, 75).map(row => row?.[column])].map(workbookCleanCell);
  const maxLength = Math.max(8, ...samples.map(value => value.length));
  return Math.min(45, Math.max(10, Math.ceil(maxLength * 1.15)));
}

function workbookNumberOrText(value) {
  if (value === null || value === undefined || value === "") return "";
  const normalized = String(value).replace(/,/g, "").trim();
  return /^-?\d+(\.\d+)?$/.test(normalized) ? Number(normalized) : value;
}

function workbookCleanCell(value) {
  return String(value ?? "").replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "").trim();
}

function workbookEscapeXml(value) {
  return workbookCleanCell(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function workbookZip(files) {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  Object.entries(files).forEach(([name, content]) => {
    const nameBytes = encoder.encode(name);
    const data = typeof content === "string" ? encoder.encode(content) : content;
    const crc = workbookCrc32(data);
    const local = new Uint8Array(30);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0, true);
    localView.setUint16(8, 0, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, data.length, true);
    localView.setUint32(22, data.length, true);
    localView.setUint16(26, nameBytes.length, true);
    localParts.push(local, nameBytes, data);

    const central = new Uint8Array(46);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, data.length, true);
    centralView.setUint32(24, data.length, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint32(42, offset, true);
    centralParts.push(central, nameBytes);
    offset += local.length + nameBytes.length + data.length;
  });

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, Object.keys(files).length, true);
  endView.setUint16(10, Object.keys(files).length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);
  return new Blob([...localParts, ...centralParts, end]);
}

function workbookCrc32(data) {
  let crc = -1;
  for (let i = 0; i < data.length; i += 1) {
    crc = (crc >>> 8) ^ WORKBOOK_CRC_TABLE[(crc ^ data[i]) & 0xff];
  }
  return (crc ^ -1) >>> 0;
}

const WORKBOOK_CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let value = i;
    for (let j = 0; j < 8; j += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[i] = value >>> 0;
  }
  return table;
})();

async function ensureXlsxBlob(blob) {
  const signature = await blob.slice(0, 8).arrayBuffer();
  const bytes = Array.from(new Uint8Array(signature));
  const isZipPackage = bytes[0] === 0x50 && bytes[1] === 0x4b;
  if (isZipPackage) return true;
  toast("Excel export returned an old/invalid file. Restart the server and try again.");
  return false;
}

function toast(message) {
  const el = document.createElement("div");
  el.textContent = message;
  el.style.cssText = "position:fixed;right:24px;top:24px;background:#101a33;color:#fff;padding:10px 14px;border-radius:8px;z-index:99;box-shadow:0 12px 30px rgba(0,0,0,.2)";
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1700);
}

function debounce(fn, wait) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}
