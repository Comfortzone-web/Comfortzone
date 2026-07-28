const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const zlib = require("zlib");
const { spawnSync } = require("child_process");
let createClient = null;
try {
  ({ createClient } = require("@supabase/supabase-js"));
} catch {}
let PDFDocument = null;
try {
  PDFDocument = require("pdfkit");
} catch {}

loadLocalEnv();

const PORT = process.env.PORT || 4173;
const HOST = process.env.HOST || "0.0.0.0";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, "public");
const DATA = path.join(ROOT, "data");
const PROJECTS = path.join(DATA, "projects");
const UPLOADS = path.join(DATA, "uploads");
const MASTER_LOOKUPS = path.join(DATA, "master-lookups.json");
const MASTER_PRICE_LIST = path.join(DATA, "master-price-list.json");
const QUOTATION_TEMPLATE = path.join(DATA, "quotation-template.docx");
const VRV_SCHEDULE_TEMPLATE = path.join(DATA, "vrv-schedule-template.xlsx");
const INVENTORY_FILE = path.join(DATA, "inventory.json");
const DELIVERY_NOTE_PDF_SCRIPT = path.join(ROOT, "scripts", "delivery_note_pdf.py");
const PURCHASE_ORDERS_FILE = path.join(DATA, "purchase-orders.json");
const AREA_CALCULATIONS_FILE = path.join(DATA, "area-calculations.json");
const PURCHASE_ORDER_PDF_SCRIPT = path.join(ROOT, "scripts", "purchase_order_pdf.py");
const SALES_CRM_FILE = path.join(DATA, "sales-crm.json");
const SALES_QUOTATION_PDF_SCRIPT = path.join(ROOT, "scripts", "sales_quotation_pdf.py");
const SETTINGS_FILE = path.join(DATA, "settings.json");
const SETTINGS_UPLOADS = path.join(DATA, "settings-uploads");
const PYTHON_EXE = process.env.PYTHON_EXE || "C:\\Users\\HP\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\python\\python.exe";
const PDFTOPPM_EXE = process.env.PDFTOPPM_EXE || "C:\\Users\\HP\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\poppler\\Library\\bin\\pdftoppm.exe";
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_KEY || "";
const SUPABASE_TABLE = process.env.SUPABASE_TABLE || "app_data";
const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET || "comfortzone-files";
const DEFAULT_PURCHASE_NOTES = `1. Invoice should be attached with delivery note signed by site supervisor.
2. Attach LPO copy along with invoice.
3. Delivery to be made as per schedule instruction provided to you.`;

function loadLocalEnv() {
  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const splitIndex = trimmed.indexOf("=");
    if (splitIndex <= 0) continue;
    const key = trimmed.slice(0, splitIndex).trim();
    let value = trimmed.slice(splitIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

if ((SUPABASE_URL || SUPABASE_KEY) && !createClient) {
  throw new Error("Supabase environment variables are set, but @supabase/supabase-js is not installed.");
}

const supabase = SUPABASE_URL && SUPABASE_KEY && createClient
  ? createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } })
  : null;
const USE_SUPABASE = !!supabase;

if (!USE_SUPABASE) {
  for (const dir of [DATA, PROJECTS, UPLOADS, SETTINGS_UPLOADS]) fs.mkdirSync(dir, { recursive: true });
}

const sessions = new Map();

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".xls": "application/vnd.ms-excel"
};

function id() {
  return crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString("hex");
}

function passwordHash(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.pbkdf2Sync(String(password || ""), salt, 120000, 32, "sha256").toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = String(stored || "").split(":");
  if (!salt || !hash) return false;
  const check = passwordHash(password, salt).split(":")[1];
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(check, "hex"));
}

function localReadJson(file, fallbackFactory, normalize = value => value) {
  if (!fs.existsSync(file)) return normalize(fallbackFactory());
  try {
    return normalize(JSON.parse(fs.readFileSync(file, "utf8")));
  } catch {
    return normalize(fallbackFactory());
  }
}

async function readSupabaseValue(key) {
  const { data, error } = await supabase
    .from(SUPABASE_TABLE)
    .select("value")
    .eq("key", key)
    .maybeSingle();
  if (error) throw new Error(`Supabase read failed for ${key}: ${error.message}`);
  return data ? data.value : null;
}

async function writeSupabaseValue(key, value) {
  const { error } = await supabase
    .from(SUPABASE_TABLE)
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) throw new Error(`Supabase write failed for ${key}: ${error.message}`);
}

async function readStore(key, file, fallbackFactory, normalize = value => value) {
  if (USE_SUPABASE) {
    try {
      const value = await readSupabaseValue(key);
      if (value === null || value === undefined) {
        const seed = normalize(fallbackFactory());
        await writeSupabaseValue(key, seed);
        return seed;
      }
      return normalize(value);
    } catch (error) {
      console.error(error.message || error);
    }
  }
  return localReadJson(file, fallbackFactory, normalize);
}

async function writeStore(key, file, value) {
  if (USE_SUPABASE) {
    try {
      await writeSupabaseValue(key, value);
      return;
    } catch (error) {
      console.error(error.message || error);
    }
  }
  try {
    fs.writeFileSync(file, JSON.stringify(value, null, 2));
  } catch (error) {
    if (!USE_SUPABASE) throw error;
  }
}

function storagePath(scope, storedName) {
  return `${String(scope || "uploads").replace(/^\/+|\/+$/g, "")}/${storedName}`;
}

function localUploadPath(scope, storedName) {
  return path.join(UPLOADS, ...String(scope || "uploads").split("/"), storedName);
}

async function saveUpload(scope, storedName, body, mimeType) {
  if (USE_SUPABASE) {
    const { error } = await supabase.storage
      .from(SUPABASE_BUCKET)
      .upload(storagePath(scope, storedName), body, {
        contentType: mimeType || "application/octet-stream",
        upsert: true
      });
    if (error) throw new Error(`Supabase upload failed: ${error.message}`);
    return;
  }
  const file = localUploadPath(scope, storedName);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body);
}

async function readUpload(scope, storedName) {
  if (USE_SUPABASE) {
    const { data, error } = await supabase.storage.from(SUPABASE_BUCKET).download(storagePath(scope, storedName));
    if (error) throw new Error(`Supabase download failed: ${error.message}`);
    return Buffer.from(await data.arrayBuffer());
  }
  const file = localUploadPath(scope, storedName);
  if (!fs.existsSync(file)) return null;
  return fs.readFileSync(file);
}

async function deleteUpload(scope, storedName) {
  if (!storedName) return;
  if (USE_SUPABASE) {
    await supabase.storage.from(SUPABASE_BUCKET).remove([storagePath(scope, storedName)]);
    return;
  }
  fs.rmSync(localUploadPath(scope, storedName), { force: true });
}

async function sendStoredUpload(res, upload, scope) {
  const bytes = await readUpload(scope, upload.storedName);
  if (!bytes) return notFound(res);
  res.writeHead(200, {
    "Content-Type": upload.mimeType || "application/octet-stream",
    "Content-Disposition": `inline; filename="${upload.originalName.replace(/"/g, "")}"`
  });
  return res.end(bytes);
}

function defaultSettings() {
  return {
    company: {
      name: "Comfort Zone AC Devices Tr. LLC",
      address: "Showroom 1, Industrial Area 18, Sharjah",
      trn: "",
      phone: "0561772530",
      email: "info@comfortzoneuae.com",
      website: "www.comfortzoneuae.com",
      logoUploadId: ""
    },
    company2: {
      name: "",
      address: "",
      trn: "",
      phone: "",
      email: "",
      website: "",
      logoUploadId: ""
    },
    users: [
      {
        id: "admin",
        name: "Admin User",
        role: "Admin",
        email: "admin@comfortzone.local",
        passwordHash: passwordHash("admin123"),
        active: true
      }
    ],
    attachments: []
  };
}

function normalizeSettings(parsed = {}) {
  const fallback = defaultSettings();
  const settings = {
    ...fallback,
    ...parsed,
    company: { ...fallback.company, ...(parsed.company || {}) },
    company2: { ...fallback.company2, ...(parsed.company2 || {}) },
    users: Array.isArray(parsed.users) && parsed.users.length ? parsed.users : fallback.users,
    attachments: Array.isArray(parsed.attachments) ? parsed.attachments : []
  };
  if (!settings.users.some(user => String(user.role).toLowerCase() === "admin")) settings.users.unshift(fallback.users[0]);
  return settings;
}

async function readSettings() {
  return readStore("settings", SETTINGS_FILE, defaultSettings, normalizeSettings);
}

async function writeSettings(settings) {
  await writeStore("settings", SETTINGS_FILE, settings);
}

function publicSettings(settings) {
  return {
    company: settings.company,
    company2: settings.company2,
    attachments: settings.attachments,
    users: (settings.users || []).map(({ passwordHash: _passwordHash, ...user }) => user)
  };
}

function parseCookies(req) {
  return Object.fromEntries(String(req.headers.cookie || "").split(";").map(part => part.trim()).filter(Boolean).map(part => {
    const index = part.indexOf("=");
    if (index < 0) return [decodeURIComponent(part), ""];
    return [decodeURIComponent(part.slice(0, index)), decodeURIComponent(part.slice(index + 1))];
  }));
}

function sessionSecret() {
  return process.env.SESSION_SECRET || "comfortzone-session-v1";
}

function signSessionPayload(payload) {
  return crypto.createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
}

function createSessionToken(userId) {
  const payload = Buffer.from(JSON.stringify({
    userId,
    exp: Date.now() + 1000 * 60 * 60 * 24 * 14
  }), "utf8").toString("base64url");
  return `${payload}.${signSessionPayload(payload)}`;
}

function readSessionToken(token) {
  const [payload, signature] = String(token || "").split(".");
  if (!payload || !signature) return null;
  const expected = signSessionPayload(payload);
  if (Buffer.byteLength(signature) !== Buffer.byteLength(expected)) return null;
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!session.userId || Number(session.exp || 0) < Date.now()) return null;
    return session;
  } catch {
    return null;
  }
}

function sessionCookie(name, value, req, extra = "") {
  const secure = req.headers["x-forwarded-proto"] === "https" || String(req.headers.host || "").includes("vercel.app");
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}${extra}`;
}

async function sessionUser(req) {
  const token = parseCookies(req).cz_session;
  if (!token) return null;
  const session = readSessionToken(token) || sessions.get(token);
  if (!session) return null;
  const settings = await readSettings();
  const user = (settings.users || []).find(item => item.id === session.userId && item.active !== false);
  if (!user) {
    sessions.delete(token);
    return null;
  }
  return { id: user.id, name: user.name, role: user.role, email: user.email };
}

function isAdmin(user) {
  return String(user?.role || "").toLowerCase() === "admin";
}

function isPoOnly(user) {
  return String(user?.role || "").toLowerCase().replace(/\s+/g, "") === "poonly";
}

function sendAuthRequired(res) {
  return send(res, 401, { error: "Login required" });
}

function sendForbidden(res) {
  return send(res, 403, { error: "Admin access required" });
}

function sendPoOnlyForbidden(res) {
  return send(res, 403, { error: "Purchase Orders access only" });
}

function canPoOnlyAccessPath(req, pathname) {
  if (req.method === "GET" && pathname === "/api/settings") return true;
  if (req.method === "GET" && pathname.startsWith("/api/settings/uploads/")) return true;
  if (pathname.startsWith("/api/purchase-orders")) return true;
  if (pathname.startsWith("/api/area-calculations")) return true;
  return false;
}

function projectPath(projectId) {
  return path.join(PROJECTS, `${projectId}.json`);
}

async function readProject(projectId) {
  if (USE_SUPABASE) {
    const value = await readSupabaseValue(`project:${projectId}`);
    return value ? hydrateProject(value) : null;
  }
  const file = projectPath(projectId);
  if (!fs.existsSync(file)) return null;
  return hydrateProject(JSON.parse(fs.readFileSync(file, "utf8")));
}

async function writeProject(project) {
  project.updatedAt = new Date().toISOString();
  if (USE_SUPABASE) {
    await writeSupabaseValue(`project:${project.id}`, project);
    return;
  }
  fs.writeFileSync(projectPath(project.id), JSON.stringify(project, null, 2));
}

async function deleteProject(projectId) {
  if (USE_SUPABASE) {
    const { error } = await supabase.from(SUPABASE_TABLE).delete().eq("key", `project:${projectId}`);
    if (error) throw new Error(`Supabase delete failed for project:${projectId}: ${error.message}`);
    return;
  }
  const file = projectPath(projectId);
  if (fs.existsSync(file)) fs.unlinkSync(file);
}

function defaultInventory() {
  return {
    settings: { nextDeliveryNo: "DN-2057" },
    models: [],
    customers: [],
    supplierDns: [],
    deliveryNotes: [],
    uploads: []
  };
}

function normalizeInventory(parsed = {}) {
  return { ...defaultInventory(), ...parsed };
}

async function readInventory() {
  return readStore("inventory", INVENTORY_FILE, defaultInventory, normalizeInventory);
}

async function writeInventory(inventory) {
  await writeStore("inventory", INVENTORY_FILE, inventory);
}

function defaultPurchaseOrders() {
  return {
    settings: { nextPoNo: `PO-${new Date().getFullYear()}-0001` },
    orders: [],
    suppliers: [],
    uploads: []
  };
}

function normalizePurchaseOrders(parsed = {}) {
  const store = {
    ...defaultPurchaseOrders(),
    ...parsed,
    settings: { ...defaultPurchaseOrders().settings, ...(parsed.settings || {}) },
    orders: Array.isArray(parsed.orders) ? parsed.orders : [],
    suppliers: Array.isArray(parsed.suppliers) ? parsed.suppliers : [],
    uploads: Array.isArray(parsed.uploads) ? parsed.uploads : []
  };
  store.settings.nextPoNo = nextPurchaseNoFromOrders(store.orders);
  return store;
}

async function readPurchaseOrders() {
  return readStore("purchase-orders", PURCHASE_ORDERS_FILE, defaultPurchaseOrders, normalizePurchaseOrders);
}

async function writePurchaseOrders(store) {
  await writeStore("purchase-orders", PURCHASE_ORDERS_FILE, store);
}

function defaultAreaCalculations() {
  return {
    calculations: [],
    uploads: []
  };
}

function normalizeAreaCalculations(parsed = {}) {
  const store = {
    ...defaultAreaCalculations(),
    ...parsed,
    calculations: Array.isArray(parsed.calculations) ? parsed.calculations.map(normalizeAreaCalculation) : [],
    uploads: Array.isArray(parsed.uploads) ? parsed.uploads : []
  };
  store.calculations.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
  return store;
}

async function readAreaCalculations() {
  return readStore("area-calculations", AREA_CALCULATIONS_FILE, defaultAreaCalculations, normalizeAreaCalculations);
}

async function writeAreaCalculations(store) {
  await writeStore("area-calculations", AREA_CALCULATIONS_FILE, normalizeAreaCalculations(store));
}

function areaNumber(value) {
  if (value === null || value === undefined || value === "") return 0;
  return Number(String(value).replace(/,/g, "").replace(/[^\d.-]/g, "")) || 0;
}

function areaDrawingLength(value) {
  const text = String(value || "").replace(/,/g, " ");
  if (areaRadiusOnlyText(text)) return 0;
  const explicit = text.match(/(?:L|LEN|LENGTH)\s*[:=]?\s*(\d+(?:\.\d+)?)/i);
  if (explicit) return Number(explicit[1]) || 0;
  const suffix = text.match(/\b(\d+(?:\.\d+)?)\s*(?:L|LEN|LENGTH)\b/i);
  if (suffix) return Number(suffix[1]) || 0;
  const metric = text.match(/\b(\d+(?:\.\d+)?)\s*(?:MM|MTR|M)\b/i);
  if (metric) {
    const amount = Number(metric[1]) || 0;
    return /(?:MTR|M)\b/i.test(metric[0]) && !/MM\b/i.test(metric[0]) ? amount * 1000 : amount;
  }
  const plain = text.match(/(^|[^\d.])(\d{2,5})(?:\.\d+)?(?=$|[^\d.])/);
  return plain ? Number(plain[2]) || 0 : 0;
}

function areaRadiusOnlyText(value) {
  const text = String(value || "").trim();
  if (!text) return false;
  if (/\bR\s*=?\s*\d+(?:\.\d+)?\b/i.test(text)) return !/\b(?:L|LEN|LENGTH|MM|MTR)\b/i.test(text);
  if (/\b\d+(?:\.\d+)?\s*R\b/i.test(text)) return !/\b(?:L|LEN|LENGTH|MM|MTR)\b/i.test(text);
  return false;
}

function normalizeAreaType(value) {
  const text = cleanCell(value || "OTHER").toUpperCase();
  if (/^SHOE\s*NEC?K?|^SHOENEC|^SHOE/i.test(text)) return "SHOENECK";
  if (/^RED|REDUC/i.test(text)) return "RED";
  if (/^STR|STRAIGHT/i.test(text)) return "STR";
  if (/^ELB|ELBOW/i.test(text)) return "ELB";
  if (/^END|END\s*CAP/i.test(text)) return "END";
  if (/^OFF|OFFSET/i.test(text)) return "OFF";
  if (/^Y[\s-]*PIECE|^Y[\s-]*BRANCH/i.test(text)) return "Y Piece";
  return text || "OTHER";
}

function areaEndcapMention(value) {
  return /\bend\s*cap\b|\bendcap\b/i.test(cleanCell(value || ""));
}

function cleanAreaEndcapText(value) {
  return cleanCell(value || "")
    .replace(/\bend\s*cap\b|\bendcap\b/ig, "")
    .replace(/^[\s,;/|-]+|[\s,;/|-]+$/g, "")
    .replace(/\s*([,;/|])\s*/g, "$1 ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function areaEndcapItemLabel(value) {
  const item = cleanCell(value || "");
  return item ? `${item}-END` : "END";
}

function areaExpandEndcapRows(rows = []) {
  const expanded = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const type = normalizeAreaType(row.type || row.Type || "OTHER");
    const textFields = [
      row.connection,
      row.Connection,
      row.remarks,
      row.Remarks,
      row.drawingLengthAngle,
      row["Drawing Length / Angle"]
    ];
    const hasEndcapNote = type !== "END" && textFields.some(areaEndcapMention);
    if (!hasEndcapNote) {
      expanded.push(row);
      continue;
    }

    const rawConnection = row.connection ?? row.Connection ?? "";
    const cleanConnection = cleanAreaEndcapText(rawConnection);
    const cleanRemarks = cleanAreaEndcapText(row.remarks || row.Remarks || "");
    const originalRow = {
      ...row,
      connection: cleanConnection || cleanCell(rawConnection),
      Connection: cleanConnection || cleanCell(rawConnection),
      remarks: cleanRemarks,
      Remarks: cleanRemarks
    };
    expanded.push(originalRow);

    const endItem = areaEndcapItemLabel(row.item || row.Item || row.no);
    const hasMatchingEnd = rows.some((candidate) => {
      const candidateType = normalizeAreaType(candidate?.type || candidate?.Type || "");
      const candidateItem = cleanCell(candidate?.item || candidate?.Item || candidate?.no || "");
      return candidateType === "END" && candidateItem === endItem;
    });
    if (!hasMatchingEnd) {
      expanded.push({
        item: endItem,
        section: row.section || row.Section || "",
        type: "END",
        connection: cleanConnection || cleanCell(rawConnection),
        w1: row.w1 ?? row.W1,
        h1: row.h1 ?? row.H1,
        w2: row.w2 ?? row.W2 ?? row.w1 ?? row.W1,
        h2: row.h2 ?? row.H2 ?? row.h1 ?? row.H1,
        qty: 1,
        drawingLengthAngle: "50L",
        offset: 20,
        status: "Review",
        remarks: "End cap split from scanned row"
      });
    }
  }
  return expanded;
}

function normalizeAreaRow(row = {}, index = 0) {
  const type = normalizeAreaType(row.type || row.Type || "OTHER");
  const drawingLengthAngle = cleanCell(row.drawingLengthAngle || row["Drawing Length / Angle"] || row.drawingLength || row.length || "");
  let next = {
    id: cleanCell(row.id || "") || id(),
    item: cleanCell(row.item || row.Item || row.no || (index + 1)),
    section: cleanCell(row.section || row.Section || ""),
    type,
    connection: cleanCell(row.connection || row.Connection || ""),
    w1: areaNumber(row.w1 ?? row.W1),
    h1: areaNumber(row.h1 ?? row.H1),
    w2: areaNumber(row.w2 ?? row.W2),
    h2: areaNumber(row.h2 ?? row.H2),
    qty: areaNumber(row.qty ?? row.Qty) || 1,
    drawingLengthAngle,
    offset: areaNumber(row.offset ?? row.Offset) || 20,
    calculatedLength: areaNumber(row.calculatedLength ?? row["Calculated Length"]),
    areaM2: areaNumber(row.areaM2 ?? row["Area m²"]),
    areaFt2: areaNumber(row.areaFt2 ?? row["Area ft²"]),
    status: cleanCell(row.status || row.Status || ""),
    remarks: cleanCell(row.remarks || row.Remarks || ""),
    calculatedLengthManual: Boolean(row.calculatedLengthManual)
  };

  if (["STR", "ELB", "END", "BEND", "SHOENECK", "SHOE NECK", "OFF", "OFFSET"].includes(next.type)) {
    if (!next.w2) next.w2 = next.w1;
    if (!next.h2) next.h2 = next.h1;
  }
  if (next.type === "SHOENECK" && next.w1 && next.w2 === next.w1) {
    next.w2 = next.w1 + 100;
  }

  const missingDims = !next.w1 || !next.h1 || !next.w2 || !next.h2;
  const isEnd = next.type === "END" || /end\s*cap/i.test(drawingLengthAngle);
  const isYPiece = /^Y[\s-]*PIECE$/i.test(next.type);
  const isElbow = next.type === "ELB" || next.type === "BEND" || /elb|elbow|90\s*[°deg]|45\s*[°deg]/i.test(drawingLengthAngle);
  const isTwo45 = /45\s*[°deg].*(x|×|\*)\s*2|2\s*(nos|pcs)?.*45\s*[°deg]/i.test(drawingLengthAngle);
  const is45 = /45\s*[°deg]/i.test(drawingLengthAngle);
  const is90 = /90\s*[°deg]/i.test(drawingLengthAngle);
  const isRadiusOnly = areaRadiusOnlyText(drawingLengthAngle);
  const drawingLength = areaDrawingLength(drawingLengthAngle);

  if (isEnd) {
    next.offset = 20;
    next.drawingLengthAngle = areaDrawingLength(next.drawingLengthAngle) ? next.drawingLengthAngle : "50L";
    if (!next.calculatedLengthManual) next.calculatedLength = 70;
  } else if (isYPiece && (isRadiusOnly || !drawingLength)) {
    if (!next.calculatedLengthManual) next.calculatedLength = 1500;
  } else if (isElbow && (is90 || isTwo45 || isRadiusOnly || !drawingLength)) {
    if (!next.calculatedLengthManual) next.calculatedLength = is45 && !isTwo45 && !is90 ? 500 : 1000;
  } else {
    if (!next.calculatedLengthManual) next.calculatedLength = drawingLength ? drawingLength + next.offset : next.calculatedLength;
  }

  if (missingDims || !next.calculatedLength) {
    next.areaM2 = 0;
    next.areaFt2 = 0;
    next.status = missingDims ? "Missing Dim." : "Review";
  } else {
    const computed = areaFabricationArea(next);
    next.areaM2 = computed.areaM2;
    next.areaFt2 = computed.areaFt2;
    if (!next.status || !["Review", "Missing Dim."].includes(next.status)) next.status = next.remarks ? "Review" : "Clear";
  }
  return next;
}

function areaFabricationArea(row) {
  const perimeter = (areaNumber(row.w1) + 20) + (areaNumber(row.h1) + 20) + (areaNumber(row.w2) + 20) + (areaNumber(row.h2) + 20);
  const areaM2 = Number(((perimeter * areaNumber(row.calculatedLength) * (areaNumber(row.qty) || 1)) / 1000000).toFixed(4));
  return {
    areaM2,
    areaFt2: Number((areaM2 * 10.764).toFixed(6))
  };
}

function areaTotals(rows = []) {
  const totalM2 = rows.reduce((sum, row) => sum + areaNumber(row.areaM2), 0);
  const totalFt2 = rows.reduce((sum, row) => sum + areaNumber(row.areaFt2), 0);
  return {
    totalItems: rows.length,
    totalM2: Number(totalM2.toFixed(4)),
    totalFt2: Number(totalFt2.toFixed(2))
  };
}

function normalizeAreaCalculation(input = {}) {
  const sourceRows = Array.isArray(input.rows) ? areaExpandEndcapRows(input.rows) : [];
  const rows = sourceRows.map(normalizeAreaRow);
  const now = new Date().toISOString();
  return {
    id: cleanCell(input.id || "") || id(),
    title: cleanCell(input.title || "") || "Untitled Area Calculation",
    uploadIds: Array.isArray(input.uploadIds) ? input.uploadIds.filter(Boolean) : [],
    rows,
    totals: areaTotals(rows),
    message: cleanCell(input.message || ""),
    createdAt: input.createdAt || now,
    updatedAt: input.updatedAt || now
  };
}

function defaultSalesCrm() {
  return {
    settings: { nextQuotationNo: `CZ-QTN-${new Date().getFullYear()}-0416`, nextEnquiryNo: `ENQ-${new Date().getFullYear()}-0001`, nextProjectNo: `PRJ-${String(new Date().getFullYear()).slice(-2)}-0001` },
    leads: [
      { id: id(), avatar: "AM", customer: "Mr. Ahmed Mansoor", phone: "+971 50 123 4567", requirement: "Daikin AC Supply & Install", projectType: "Villa Project", location: "Jumeirah 1, Dubai", source: "WhatsApp", status: "New Lead", followUp: "22 Jun 2026", priority: "Overdue" },
      { id: id(), avatar: "SL", customer: "Skyline Logistics", phone: "+971 4 445 2190", requirement: "Warehouse VRV Replacement", projectType: "Commercial", location: "Dubai Investment Park", source: "Website", status: "Contacted", followUp: "24 Jun 2026", priority: "Today" },
      { id: id(), avatar: "PN", customer: "Priya Nair", phone: "+971 55 901 2234", requirement: "Apartment ducted AC service", projectType: "Apartment", location: "JLT, Dubai", source: "Referral", status: "Site Visit", followUp: "25 Jun 2026", priority: "Planned" },
      { id: id(), avatar: "TN", customer: "TechNova Solutions", phone: "+971 4 777 1020", requirement: "Office maintenance contract", projectType: "Commercial", location: "Business Bay, Dubai", source: "Website", status: "Quotation Needed", followUp: "26 Jun 2026", priority: "Planned" }
    ],
    customers: [
      { id: id(), icon: "CO", name: "ABC Contracting LLC", type: "Commercial", contact: "Mr. Sameer Ahmad", role: "Procurement Manager", phone: "+971 50 123 4567", email: "sameer@abccontracting.ae", address: "Business Bay, Dubai", detail: "Tower A, Suite 1402", trn: "100234567890003" },
      { id: id(), icon: "EV", name: "Elite Villas Management", type: "Maintenance", contact: "Fatima Al Sayed", role: "Property Supervisor", phone: "+971 4 888 2345", email: "fatima@elitevillas.ae", address: "Palm Jumeirah, Dubai", detail: "Villa Cluster 6", trn: "100987654320003" },
      { id: id(), icon: "TN", name: "TechNova Solutions", type: "Commercial", contact: "Priya Nair", role: "Admin Manager", phone: "+971 55 612 9911", email: "admin@technova.ae", address: "JLT, Dubai", detail: "Cluster X", trn: "100675430000003" }
    ],
    projects: [
      { id: id(), name: "Villa AC Replacement - Jumeirah", customer: "ABC Contracting", location: "Jumeirah 1, Dubai", type: "Residential", requirement: "Supply & Installation", engineer: "Sarah Johnson", status: "Site Visit Done", date: "12 Oct 2026", value: "AED 128,500" },
      { id: id(), name: "Retail Mall Ducting Service", customer: "Majid Al Futtaim", location: "Mirdif, Dubai", type: "Commercial", requirement: "Repair / Service", engineer: "Michael Chen", status: "Quotation Sent", date: "14 Oct 2026", value: "AED 42,600" },
      { id: id(), name: "Office VRV Maintenance", customer: "TechNova Solutions", location: "JLT, Dubai", type: "Commercial", requirement: "AMC / Maintenance", engineer: "Arjun Singh", status: "Negotiation", date: "16 Oct 2026", value: "AED 88,900" }
    ],
    quotations: [
      { id: id(), no: "CZ-QTN-2026-0001-R2", revision: "2 Revisions", date: "18 May 2026", validity: "30 Days", salesperson: "Arjun Singh", customer: "Rahul Mehta", project: "Villa AC Replacement", location: "Dubai Marina, UAE", paymentTerms: "30 Days Credit", deliveryTime: "To be discussed", warranty: "", notes: "", items: [{ description: "Daikin AC Supply", qty: 1, unit: "Set", unitPrice: 119809.52 }], discount: 0, amount: 125800, status: "Revised" },
      { id: id(), no: "CZ-QTN-2026-0412", revision: "Fresh Quote", date: "19 May 2026", validity: "30 Days", salesperson: "Arjun Singh", customer: "GreenLeaf Apartments", project: "Ducted AC Supply", location: "Kondapur", paymentTerms: "30 Days Credit", deliveryTime: "To be discussed", warranty: "", notes: "", items: [{ description: "Ducted AC Unit", qty: 1, unit: "Set", unitPrice: 80190.48 }], discount: 0, amount: 84200, status: "Sent" },
      { id: id(), no: "CZ-QTN-2026-0413", revision: "Fresh Quote", date: "20 May 2026", validity: "30 Days", salesperson: "Arjun Singh", customer: "TechNova Solutions", project: "Office Maintenance", location: "JLT, Dubai", paymentTerms: "30 Days Credit", deliveryTime: "To be discussed", warranty: "", notes: "", items: [{ description: "Office Maintenance Contract", qty: 1, unit: "Nos", unitPrice: 59047.62 }], discount: 0, amount: 62000, status: "Approved" }
    ],
    orderBook: [],
    followUps: [
      { id: id(), avatar: "RJ", customer: "Robert Jenkins", phone: "+1 555-0123", project: "HVAC Unit Replacement", quotation: "#QUO-8821", date: "Oct 20, 2026", due: "3 Days Overdue", type: "Call", status: "Overdue" },
      { id: id(), avatar: "SL", customer: "Sarah Lopez", phone: "+1 555-0987", project: "Ductless Mini-Split Install", quotation: "#QUO-8854", date: "Oct 23, 2026", due: "Today @ 2:00 PM", type: "Message", status: "Today" },
      { id: id(), avatar: "MA", customer: "Mr. Ahmed Mansoor", phone: "+971 50 123 4567", project: "Daikin AC Supply & Install", quotation: "CZ-QTN-2026-0415", date: "Oct 25, 2026", due: "Upcoming", type: "Site Visit", status: "Scheduled" }
    ]
  };
}

function normalizeSalesCrm(parsed = {}) {
  const fallback = defaultSalesCrm();
  const settings = { ...fallback.settings, ...(parsed.settings || {}) };
  const store = {
    settings,
    leads: Array.isArray(parsed.leads) ? parsed.leads : fallback.leads,
    customers: Array.isArray(parsed.customers) ? parsed.customers : fallback.customers,
    projects: Array.isArray(parsed.projects) ? parsed.projects : fallback.projects,
    quotations: Array.isArray(parsed.quotations) ? parsed.quotations : fallback.quotations,
    orderBook: Array.isArray(parsed.orderBook) ? parsed.orderBook : fallback.orderBook,
    followUps: Array.isArray(parsed.followUps) ? parsed.followUps : fallback.followUps
  };
  store.settings.nextQuotationNo = nextAvailableSalesQuotationNo(store.settings.nextQuotationNo || fallback.settings.nextQuotationNo, store.quotations);
  store.settings.nextProjectNo = nextAvailableSalesProjectNo(store.settings.nextProjectNo || fallback.settings.nextProjectNo, store.projects);
  return store;
}

async function readSalesCrm() {
  return readStore("sales-crm", SALES_CRM_FILE, defaultSalesCrm, normalizeSalesCrm);
}

async function writeSalesCrm(store) {
  await writeStore("sales-crm", SALES_CRM_FILE, store);
}

function salesCustomerToInventoryCustomer(customer, existing = null) {
  return {
    id: existing?.id || customer.inventoryCustomerId || customer.id || id(),
    customerName: cleanCell(customer.name || customer.customerName || ""),
    contactPerson: cleanCell(customer.contact || customer.contactPerson || ""),
    phone: cleanCell(customer.phone || ""),
    email: cleanCell(customer.email || ""),
    address: cleanCell(customer.address || ""),
    defaultDeliveryLocation: cleanCell(customer.defaultDeliveryLocation || customer.detail || customer.address || "")
  };
}

function inventoryCustomerToSalesCustomer(customer, existing = null) {
  const name = cleanCell(customer.customerName || customer.name || "");
  return {
    id: existing?.id || customer.salesCustomerId || customer.id || id(),
    icon: initials(name),
    name,
    type: cleanCell(existing?.type || customer.type || "Commercial"),
    contact: cleanCell(customer.contactPerson || customer.contact || ""),
    role: cleanCell(existing?.role || customer.role || ""),
    phone: cleanCell(customer.phone || ""),
    email: cleanCell(customer.email || ""),
    address: cleanCell(customer.address || ""),
    detail: cleanCell(customer.defaultDeliveryLocation || customer.detail || customer.address || ""),
    trn: cleanCell(existing?.trn || customer.trn || "")
  };
}

function mergedInventoryCustomers(inventoryCustomers = [], salesCustomers = []) {
  const merged = [...inventoryCustomers];
  for (const customer of salesCustomers || []) {
    const name = cleanCell(customer.name || customer.customerName || "");
    if (!name) continue;
    const existingIndex = merged.findIndex(item => inventoryNorm(item.customerName) === inventoryNorm(name));
    const existing = existingIndex >= 0 ? merged[existingIndex] : null;
    const next = salesCustomerToInventoryCustomer(customer, existing);
    if (existing) merged[existingIndex] = { ...existing, ...next };
    else merged.push(next);
  }
  return merged.sort((a, b) => String(a.customerName || "").localeCompare(String(b.customerName || "")));
}

function mergedSalesCustomers(salesCustomers = [], inventoryCustomers = []) {
  const merged = [...salesCustomers];
  for (const customer of inventoryCustomers || []) {
    const name = cleanCell(customer.customerName || customer.name || "");
    if (!name) continue;
    const existingIndex = merged.findIndex(item => inventoryNorm(item.name) === inventoryNorm(name));
    const existing = existingIndex >= 0 ? merged[existingIndex] : null;
    const next = inventoryCustomerToSalesCustomer(customer, existing);
    if (existing) merged[existingIndex] = { ...existing, ...next };
    else merged.push(next);
  }
  return merged.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
}

async function salesCrmView(store) {
  const inventory = await readInventory();
  return {
    ...store,
    customers: mergedSalesCustomers(store.customers || [], inventory.customers || [])
  };
}

async function syncSalesCustomerToInventory(customer) {
  if (!customer?.name) return;
  const inventory = await readInventory();
  const existingIndex = (inventory.customers || []).findIndex(item => item.id === customer.id || inventoryNorm(item.customerName) === inventoryNorm(customer.name));
  const existing = existingIndex >= 0 ? inventory.customers[existingIndex] : null;
  const next = salesCustomerToInventoryCustomer(customer, existing);
  if (existingIndex >= 0) inventory.customers[existingIndex] = next;
  else inventory.customers.push(next);
  await writeInventory(inventory);
}

async function syncInventoryCustomerToSales(customer) {
  if (!customer?.customerName) return;
  const store = await readSalesCrm();
  const existingIndex = (store.customers || []).findIndex(item => item.id === customer.id || inventoryNorm(item.name) === inventoryNorm(customer.customerName));
  const existing = existingIndex >= 0 ? store.customers[existingIndex] : null;
  const next = inventoryCustomerToSalesCustomer(customer, existing);
  if (existingIndex >= 0) store.customers[existingIndex] = next;
  else store.customers.unshift(next);
  await writeSalesCrm(store);
}

function mergeDuplicateSalesCustomers(customers = []) {
  const merged = [];
  const indexByName = new Map();
  for (const customer of customers) {
    const key = inventoryNorm(customer.name || "");
    if (!key) {
      merged.push(customer);
      continue;
    }
    if (!indexByName.has(key)) {
      indexByName.set(key, merged.length);
      merged.push(customer);
      continue;
    }
    const existingIndex = indexByName.get(key);
    const existing = merged[existingIndex];
    merged[existingIndex] = {
      ...customer,
      ...existing,
      id: existing.id || customer.id,
      name: existing.name || customer.name
    };
  }
  return merged;
}

function loadMasterLookups() {
  if (fs.existsSync(MASTER_LOOKUPS)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(MASTER_LOOKUPS, "utf8"));
      return {
        indoorData: Array.isArray(parsed.indoorData) ? parsed.indoorData : defaultIndoorData(),
        outdoorData: Array.isArray(parsed.outdoorData) ? parsed.outdoorData : defaultOutdoorData()
      };
    } catch {}
  }
  return { indoorData: defaultIndoorData(), outdoorData: defaultOutdoorData() };
}

function loadMasterPriceList() {
  if (fs.existsSync(MASTER_PRICE_LIST)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(MASTER_PRICE_LIST, "utf8"));
      return { items: Array.isArray(parsed.items) ? parsed.items : [] };
    } catch {}
  }
  return { items: [] };
}

function hydrateProject(project) {
  project.lookup = loadMasterLookups();
  project.priceList = loadMasterPriceList();
  if (!project.tables) project.tables = {};
  if (!project.tables.vrvSchedule) project.tables.vrvSchedule = { columns: vrvColumns(), rows: [] };
  project.tables.vrvSchedule.columns = vrvColumns();
  return project;
}

function send(res, status, body, type = "application/json; charset=utf-8") {
  const payload = typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, { "Content-Type": type });
  res.end(payload);
}

function notFound(res) {
  send(res, 404, { error: "Not found" });
}

function bufferFromBody(body) {
  if (!body) return Buffer.alloc(0);
  if (Buffer.isBuffer(body)) return body;
  if (body instanceof Uint8Array) return Buffer.from(body);
  if (body instanceof ArrayBuffer) return Buffer.from(body);
  if (typeof body === "string") return Buffer.from(body, "utf8");
  if (typeof body === "object") return Buffer.from(JSON.stringify(body), "utf8");
  return Buffer.alloc(0);
}

function collect(req) {
  if (req.body !== undefined) return Promise.resolve(bufferFromBody(req.body));
  if (req.rawBody !== undefined) return Promise.resolve(bufferFromBody(req.rawBody));
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function readJson(req) {
  const buffer = await collect(req);
  if (!buffer.length) return {};
  return JSON.parse(buffer.toString("utf8"));
}

async function createDefaultProject() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const projectId = id();
  return {
    id: projectId,
    title: "Untitled Project",
    visible: false,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    details: {
      customer: "",
      contactPerson: "",
      telNo: "",
      email: "",
      project: "",
      date: `${yyyy}-${mm}-${dd}`,
      location: "",
      model: "Daikin",
      validity: "Valid for 7 days",
      enquiryNo: "",
      preparedBy: ""
    },
    quotation: { quotationNo: await nextQuotationNo(), generatedDocId: "", generatedPdfId: "" },
    layoutVersion: "screenshot-v5",
    nodes: defaultNodes(),
    uploads: [],
    tables: {
      thermal: { columns: thermalColumns(), rows: [] },
      costing: { columns: costingColumns(), rows: [], summary: defaultCostingSummary() },
      boq: { columns: boqColumns(), rows: [], summary: { total: 0, vat: 0, netAmount: 0 } },
      vrvSchedule: { columns: vrvColumns(), rows: [] }
    },
    priceList: loadMasterPriceList(),
    lookup: loadMasterLookups()
  };
}

async function nextQuotationNo() {
  const projects = await listProjects("", true);
  let max = 1000;
  const year = String(new Date().getFullYear()).slice(-2);
  for (const project of projects) {
    try {
      const q = project.quotation && project.quotation.quotationNo;
      const match = typeof q === "string" && q.match(/(\d+)$/);
      if (match) max = Math.max(max, Number(match[1]));
    } catch {}
  }
  return `QCZ-A/${year}/${max + 1}`;
}

function defaultNodes() {
  return [
    { id: "details", type: "projectDetails", title: "Project / Client Details", x: 0, y: 0, locked: false, data: {} },
    { id: "thermal-upload", type: "thermalUpload", title: "Thermal Sheet", x: 180, y: 255, locked: false, data: {} },
    { id: "vrv-upload", type: "vrvUpload", title: "VRV Selection Report", x: 640, y: 250, locked: false, data: {} },
    { id: "thermal-table", type: "thermalTable", title: "Export File", x: 55, y: 520, locked: false, width: 520, height: 205, data: {} },
    { id: "costing-table", type: "costingTable", title: "Costing Sheet", x: 980, y: 130, locked: false, width: 650, height: 220, data: {} },
    { id: "boq-table", type: "boqTable", title: "BOQ / Price", x: 970, y: 430, locked: false, width: 650, height: 190, data: {} },
    { id: "quotation", type: "quotation", title: "Quotation", x: 1680, y: 340, locked: false, data: {} },
    { id: "vrv-schedule", type: "vrvSchedule", title: "VRV Schedule", x: 170, y: 770, locked: false, width: 1550, height: 230, data: {} }
  ];
}

function thermalColumns() {
  return ["Indoor", "Room", "Mode", "Family or Model", "Cooling DBT", "Cooling WBT", "Heating T", "Tot Cool Cap", "Sens Cool Cap", "Heat Cap", "Air Flow Rate"];
}

function costingColumns() {
  return ["S.No", "Model", "Qty", "TR", "List Price", "Multiplier", "Cost", "Amount", "Selling Price / Unit"];
}

function boqColumns() {
  return ["S.No", "Description", "Qty", "Unit"];
}

function defaultCostingSummary() {
  return { totalTR: 0, totalCost: 0, margin: 0.1, sellingPrice: 0, profit: 0, pricePerTon: 0 };
}

function vrvColumns() {
  return [
    "System", "Name", "Location", "Rq TC", "Rq SC", "Air Flow Rate",
    "FCU", "Nominal Index", "Country of Origin", "Type", "Ambient - On Coil Temperature",
    "Max TC", "Max SC", "Proposed Air Flow Rate", "PIC", "Sound", "PS", "MCA", "WxHxD", "Weight",
    "Outdoor Name", "Outdoor Model", "Outdoor Nominal Index", "Ambient Temp", "CC", "PI ESMA", "Outdoor PS",
    "Outdoor MCA", "MOP", "RLA", "Outdoor WxHxD", "Outdoor Weight"
  ];
}

function defaultIndoorData() {
  return [
    { fcu: "FXSQ25A", type: "Ducted", ambient: "46 - 24.4/17.2", maxTC: 2.5, maxSC: 1.9, airflow: 150, pic: 0.041, sound: "25 - 30", ps: "220V 1ph", mca: 0.8, wxhxd: "550 x 245 x 800", weight: 23.5, nominalIndex: 25, origin: "Czech Republic" },
    { fcu: "FXSQ32A", type: "Ducted", ambient: "46 - 24.4/17.2", maxTC: 3.2, maxSC: 2.4, airflow: 158, pic: 0.045, sound: "26 - 32", ps: "220V 1ph", mca: 1.0, wxhxd: "700 x 245 x 800", weight: 25, nominalIndex: 32, origin: "Czech Republic" },
    { fcu: "FXSQ63A", type: "Ducted", ambient: "46 - 24.4/17.2", maxTC: 6.2, maxSC: 4.7, airflow: 350, pic: 0.101, sound: "27 - 33", ps: "220V 1ph", mca: 1.6, wxhxd: "1,000 x 245 x 800", weight: 35.5, nominalIndex: 63, origin: "Czech Republic" },
    { fcu: "FXSQ80A", type: "Ducted", ambient: "46 - 24.4/17.2", maxTC: 7.9, maxSC: 5.9, airflow: 383, pic: 0.135, sound: "29 - 35", ps: "220V 1ph", mca: 1.9, wxhxd: "1,000 x 245 x 800", weight: 36.5, nominalIndex: 80, origin: "Czech Republic" },
    { fcu: "FXSQ100A", type: "Ducted", ambient: "46 - 24.4/17.2", maxTC: 9.9, maxSC: 7.5, airflow: 533, pic: 0.173, sound: "31 - 36", ps: "220V 1ph", mca: 2.4, wxhxd: "1,400 x 245 x 800", weight: 46, nominalIndex: 100, origin: "Czech Republic" }
  ];
}

function defaultOutdoorData() {
  return [
    { model: "RXYTQ8U5YF", ambient: 46, cc: 17.7, piEsma: 6.5, ps: "400V 3Nph", mca: 21.2, mop: 32, rla: 12.7, wxhxd: "930 x 1,657 x 765", weight: 175, nominalIndex: 200 },
    { model: "RXYTQ12U5YF", ambient: 46, cc: 27.2, piEsma: 8.72, ps: "400V 3Nph", mca: 24, mop: 32, rla: 12.7, wxhxd: "1,240 x 1,685 x 765", weight: 234, nominalIndex: 300 },
    { model: "RXYTQ14U5YF", ambient: 46, cc: 31.5, piEsma: 9.9, ps: "400V 3Nph", mca: 31, mop: 40, rla: 19.3, wxhxd: "1,240 x 1,685 x 765", weight: 283, nominalIndex: 350 },
    { model: "RXYTQ16U5YF", ambient: 46, cc: 36.1, piEsma: 12.1, ps: "400V 3Nph", mca: 31, mop: 40, rla: 19.3, wxhxd: "1,240 x 1,685 x 765", weight: 283, nominalIndex: 400 }
  ];
}

async function listProjects(query = "", includeHidden = false) {
  const q = query.toLowerCase();
  let projects = [];
  if (USE_SUPABASE) {
    const { data, error } = await supabase
      .from(SUPABASE_TABLE)
      .select("value")
      .like("key", "project:%");
    if (error) throw new Error(`Supabase project list failed: ${error.message}`);
    projects = (data || []).map(row => row.value).filter(Boolean).map(hydrateProject);
  } else {
    projects = fs.readdirSync(PROJECTS)
      .filter(file => file.endsWith(".json"))
      .map(file => JSON.parse(fs.readFileSync(path.join(PROJECTS, file), "utf8")));
  }
  const filtered = projects
    .filter(project => includeHidden || project.visible !== false)
    .filter(project => {
      if (!q) return true;
      const haystack = [
        project.title,
        project.details.customer,
        project.details.project,
        project.details.location,
        project.details.model,
        project.details.enquiryNo,
        project.details.preparedBy,
        project.quotation.quotationNo
      ].join(" ").toLowerCase();
      return haystack.includes(q);
    });
  if (includeHidden) return filtered;
  return filtered
    .map(project => ({
      id: project.id,
      title: project.title,
      project: project.details.project,
      customer: project.details.customer,
      location: project.details.location,
      model: project.details.model,
      quotationNo: project.quotation.quotationNo,
      enquiryNo: project.details.enquiryNo,
      preparedBy: project.details.preparedBy,
      updatedAt: project.updatedAt
    }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function parseMultipart(buffer, contentType) {
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!boundaryMatch) return [];
  const boundary = Buffer.from(`--${boundaryMatch[1] || boundaryMatch[2]}`);
  const parts = [];
  const firstBoundary = buffer.indexOf(boundary);
  if (firstBoundary < 0) return [];
  let start = firstBoundary + boundary.length + 2;
  while (start > boundary.length && start < buffer.length) {
    const next = buffer.indexOf(boundary, start);
    if (next < 0) break;
    const part = buffer.subarray(start, next - 2);
    const split = part.indexOf(Buffer.from("\r\n\r\n"));
    if (split > -1) {
      const rawHeaders = part.subarray(0, split).toString("utf8");
      const body = part.subarray(split + 4);
      const name = /name="([^"]+)"/.exec(rawHeaders);
      const filename = /filename="([^"]*)"/.exec(rawHeaders);
      const type = /Content-Type:\s*([^\r\n]+)/i.exec(rawHeaders);
      parts.push({
        name: name && name[1],
        filename: filename && filename[1],
        mimeType: type ? type[1] : "application/octet-stream",
        body
      });
    }
    start = next + boundary.length + 2;
  }
  return parts;
}

function safeName(name) {
  return path.basename(name || "upload.bin").replace(/[^\w.\- ]+/g, "_");
}

function normalizeSalesItem(collection, input, store) {
  const base = { ...(input || {}) };
  base.id = base.id || id();
  if (collection === "leads") {
    const customer = cleanCell(base.customer || "");
    const projectDescription = cleanCell(base.projectDescription || base.requirement || "");
    const contactNumber = cleanCell(base.contactNumber || base.phone || "");
    const status = cleanCell(base.status || "New Enquiry");
    return {
      id: base.id,
      enquiryNo: cleanCell(base.enquiryNo || store.settings.nextEnquiryNo || `ENQ-${new Date().getFullYear()}-0001`),
      avatar: initials(customer),
      salesPerson: cleanCell(base.salesPerson || ""),
      sNo: cleanCell(base.sNo || base.serialNo || ""),
      customer,
      contractor: cleanCell(base.contractor || customer),
      phone: contactNumber,
      contactName: cleanCell(base.contactName || base.contact || ""),
      contactNumber,
      requirement: projectDescription,
      projectDescription,
      projectType: cleanCell(base.projectType || base.scope || base.productType || ""),
      productType: cleanCell(base.productType || ""),
      scope: cleanCell(base.scope || base.scopeNotes || ""),
      location: cleanCell(base.location || ""),
      plotNo: cleanCell(base.plotNo || ""),
      client: cleanCell(base.client || ""),
      mainContractor: cleanCell(base.mainContractor || ""),
      consultant: cleanCell(base.consultant || ""),
      acContractor: cleanCell(base.acContractor || ""),
      source: cleanCell(base.source || "WhatsApp"),
      status,
      quoteNo: cleanCell(base.quoteNo || base.quotationNo || ""),
      quotedDate: cleanCell(base.quotedDate || base.dateEnquiryQuoted || ""),
      receivedDate: cleanCell(base.receivedDate || base.dateEnquiryReceived || ""),
      preparedBy: cleanCell(base.preparedBy || base.selectionPreparedBy || ""),
      estimatedValue: Number(String(base.estimatedValue ?? base.value ?? 0).replace(/[^\d.-]/g, "")) || 0,
      daikinPurchaseValue: Number(String(base.daikinPurchaseValue ?? base.daikinPurchase ?? 0).replace(/[^\d.-]/g, "")) || 0,
      finalizingMonth: cleanCell(base.finalizingMonth || base.tentativeFinalizingMonth || ""),
      competitors: cleanCell(base.competitors || ""),
      followUp: cleanCell(base.followUp || base.nextFollowUpDate || ""),
      nextFollowUpDate: cleanCell(base.nextFollowUpDate || base.followUp || ""),
      followUpType: cleanCell(base.followUpType || ""),
      followUpNote: cleanCell(base.followUpNote || ""),
      followUps: Array.isArray(base.followUps) ? base.followUps.map(item => ({
        date: cleanCell(item.date || ""),
        type: cleanCell(item.type || ""),
        note: cleanCell(item.note || ""),
        updatedBy: cleanCell(item.updatedBy || "")
      })) : [],
      priority: cleanCell(base.priority || "Planned"),
      lastUpdated: cleanCell(base.lastUpdated || ""),
      updatedBy: cleanCell(base.updatedBy || "")
    };
  }
  if (collection === "customers") {
    const name = cleanCell(base.name || "");
    return {
      id: base.id,
      icon: initials(name),
      name,
      type: cleanCell(base.type || "Commercial"),
      contact: cleanCell(base.contact || ""),
      role: cleanCell(base.role || ""),
      phone: cleanCell(base.phone || ""),
      email: cleanCell(base.email || ""),
      address: cleanCell(base.address || ""),
      detail: cleanCell(base.detail || ""),
      trn: cleanCell(base.trn || "")
    };
  }
  if (collection === "projects") {
    const projectNo = cleanCell(base.projectNo || base.projectId || base.no || store.settings.nextProjectNo || `PRJ-${String(new Date().getFullYear()).slice(-2)}-0001`);
    const createdDate = cleanCell(base.createdDate || base.date || todayDisplayDate());
    const project = {
      id: base.id,
      projectNo,
      projectId: projectNo,
      name: cleanCell(base.name || ""),
      customer: cleanCell(base.customer || ""),
      location: cleanCell(base.location || ""),
      category: cleanCell(base.category || base.type || "Commercial"),
      type: cleanCell(base.type || base.category || "Commercial"),
      productType: cleanCell(base.productType || base.requirement || ""),
      requirement: cleanCell(base.requirement || base.productType || ""),
      engineer: cleanCell(base.engineer || ""),
      status: cleanCell(base.status || "Ongoing"),
      date: createdDate,
      createdDate,
      targetDate: cleanCell(base.targetDate || ""),
      scope: cleanMultilineCell(base.scope || base.description || ""),
      boq: Array.isArray(base.boq) ? base.boq.map(normalizeSalesProjectBoqItem) : [],
      directDeliveryUploads: Array.isArray(base.directDeliveryUploads) ? base.directDeliveryUploads.map(normalizeSalesProjectDirectDeliveryUpload) : [],
      reserveStock: !!base.reserveStock,
      expectedDeliveryDate: cleanCell(base.expectedDeliveryDate || ""),
      deliveryNoteReference: cleanCell(base.deliveryNoteReference || ""),
      remarks: cleanMultilineCell(base.remarks || ""),
      value: cleanCell(base.value || "")
    };
    project.status = salesProjectAutoStatusServer(project);
    return project;
  }
  if (collection === "followUps") {
    const customer = cleanCell(base.customer || "");
    return {
      id: base.id,
      avatar: initials(customer),
      customer,
      phone: cleanCell(base.phone || ""),
      project: cleanCell(base.project || ""),
      quotation: cleanCell(base.quotation || ""),
      date: cleanCell(base.date || todayDisplayDate()),
      due: cleanCell(base.due || ""),
      type: cleanCell(base.type || "Call"),
      status: cleanCell(base.status || "Scheduled")
    };
  }
  if (collection === "quotations") {
    const quoteNo = cleanCell(base.no || base.quotationNo || store.settings.nextQuotationNo || `CZ-QTN-${new Date().getFullYear()}-0001`);
    const revisionMatch = quoteNo.match(/-R(\d+)$/i);
    const revisionNo = Number(base.revisionNo || (revisionMatch ? revisionMatch[1] : 0)) || 0;
    const baseQuotationNo = cleanCell(base.baseQuotationNo || quoteNo.replace(/-R\d+$/i, ""));
    const quote = {
      id: base.id,
      no: quoteNo,
      baseQuotationNo,
      revisionNo,
      revision: cleanCell(base.revision || (revisionNo ? `Revision R${revisionNo}` : "Fresh Quote")),
      date: cleanCell(base.date || base.quotationDate || todayDisplayDate()),
      validity: cleanCell(base.validity || "7 Days"),
      salesperson: cleanCell(base.salesperson || ""),
      customer: cleanCell(base.customer || ""),
      project: cleanCell(base.project || ""),
      location: cleanCell(base.location || ""),
      paymentTerms: cleanCell(base.paymentTerms || ""),
      deliveryTime: cleanCell(base.deliveryTime || "To be discussed"),
      warranty: cleanCell(base.warranty || ""),
      quoteType: cleanCell(base.quoteType || "VRV"),
      notes: cleanMultilineCell(base.notes || ""),
      terms: cleanMultilineCell(base.terms || ""),
      items: Array.isArray(base.items) ? base.items.map(normalizeSalesQuoteItem) : [],
      manualSubtotal: cleanCell(base.manualSubtotal || ""),
      discount: Number(base.discount || 0),
      sourceLeadId: cleanCell(base.sourceLeadId || ""),
      status: cleanCell(base.status || "Draft")
    };
    quote.amount = salesQuotationTotal(quote);
    return quote;
  }
  if (collection === "orderBook") {
    const invoices = Array.isArray(base.invoices) ? base.invoices.map(invoice => ({ ...invoice, id: invoice.id || id() })) : [];
    const payments = Array.isArray(base.payments) ? base.payments.map(payment => ({ ...payment, id: payment.id || id() })) : [];
    const timeline = Array.isArray(base.timeline) ? base.timeline.map(item => ({ ...item, id: item.id || id() })) : [];
    const invoiceAmount = invoices.reduce((sum, invoice) => sum + (Number(String(invoice.totalAmount ?? invoice.amount ?? 0).replace(/[^\d.-]/g, "")) || 0), 0);
    const paymentReceived = invoices.length
      ? invoiceAmount
      : (Number(String(base.paymentReceived ?? 0).replace(/[^\d.-]/g, "")) || 0);
    const valueWithoutVat = Number(String(base.valueWithoutVat ?? 0).replace(/[^\d.-]/g, "")) || 0;
    const vatAmount = Number(String(base.vatAmount ?? 0).replace(/[^\d.-]/g, "")) || 0;
    const orderValue = Number(String(base.orderValue ?? base.valueIncludingVat ?? 0).replace(/[^\d.-]/g, "")) || 0;
    return {
      id: base.id,
      orderNo: cleanCell(base.orderNo || `CZ${String(new Date().getFullYear()).slice(-2)}-${String(Date.now()).slice(-4)}`),
      date: cleanCell(base.date || todayDisplayDate()),
      customer: cleanCell(base.customer || ""),
      jobDescription: cleanCell(base.jobDescription || base.project || ""),
      location: cleanCell(base.location || ""),
      contactPerson: cleanCell(base.contactPerson || ""),
      contactNumber: cleanCell(base.contactNumber || ""),
      salesPerson: cleanCell(base.salesPerson || ""),
      division: cleanCell(base.division || "Project/Inst"),
      brand: cleanCell(base.brand || "Daikin"),
      status: orderBookStatusFromPayment(orderValue, paymentReceived),
      deliveryStatus: cleanCell(base.deliveryStatus || "Pending Delivery"),
      remarks: cleanMultilineCell(base.remarks || ""),
      valueWithoutVat,
      vatAmount,
      orderValue,
      installationValue: Number(String(base.installationValue ?? 0).replace(/[^\d.-]/g, "")) || 0,
      equipmentValue: Number(String(base.equipmentValue ?? 0).replace(/[^\d.-]/g, "")) || 0,
      equipmentCost: Number(String(base.equipmentCost ?? 0).replace(/[^\d.-]/g, "")) || 0,
      equipmentProfit: Number(String(base.equipmentProfit ?? 0).replace(/[^\d.-]/g, "")) || 0,
      grossMargin: Number(String(base.grossMargin ?? 0).replace(/[^\d.-]/g, "")) || 0,
      paymentReceived,
      invoiceAmount: invoiceAmount || (Number(String(base.invoiceAmount ?? 0).replace(/[^\d.-]/g, "")) || 0),
      po: base.po && typeof base.po === "object" ? base.po : {},
      invoices,
      payments,
      timeline
    };
  }
  return base;
}

function orderBookStatusFromPayment(orderValue, paymentReceived) {
  const value = Number(String(orderValue ?? 0).replace(/[^\d.-]/g, "")) || 0;
  const received = Number(String(paymentReceived ?? 0).replace(/[^\d.-]/g, "")) || 0;
  if (received <= 0) return "Payment Pending";
  if (value > 0 && received >= value - 0.01) return "Completed";
  return "Partially Paid";
}

function normalizeSalesQuoteItem(item) {
  return {
    id: item.id || id(),
    description: cleanCell(item.description || ""),
    qty: Number(item.qty || 0),
    unit: cleanCell(item.unit || "Nos"),
    unitPrice: Number(item.unitPrice || 0)
  };
}

function salesQuotationTotal(quote) {
  const itemSubtotal = (quote.items || []).reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.unitPrice || 0), 0);
  const manualSubtotal = String(quote.manualSubtotal || "").trim();
  const subtotal = manualSubtotal ? Number(manualSubtotal.replace(/,/g, "")) || 0 : itemSubtotal;
  const taxable = Math.max(0, subtotal - Number(quote.discount || 0));
  return Math.round((taxable + taxable * 0.05) * 100) / 100;
}

function nextSalesQuotationNoFrom(current) {
  const text = cleanSalesQuotationBaseNo(current);
  const match = text.match(/^(.*?)(\d+)$/);
  if (!match) return `CZ-QTN-${new Date().getFullYear()}-0001`;
  return `${match[1]}${String(Number(match[2]) + 1).padStart(match[2].length, "0")}`;
}

function cleanSalesQuotationBaseNo(value) {
  return String(value || "").replace(/-R\d+$/i, "");
}

function quotationNoSequenceValue(value) {
  const match = cleanSalesQuotationBaseNo(value).match(/(\d+)$/);
  return match ? Number(match[1]) || 0 : 0;
}

function nextAvailableSalesQuotationNo(current, quotations = []) {
  let next = cleanSalesQuotationBaseNo(current || `CZ-QTN-${new Date().getFullYear()}-0001`);
  for (const quote of quotations || []) {
    const quoteNo = cleanSalesQuotationBaseNo(quote.baseQuotationNo || quote.no || quote.quotationNo || "");
    if (!quoteNo) continue;
    const candidate = nextSalesQuotationNoFrom(quoteNo);
    if (quotationNoSequenceValue(candidate) > quotationNoSequenceValue(next)) next = candidate;
  }
  return next;
}

function nextSalesProjectNoFrom(current) {
  const text = cleanCell(current || "");
  const match = text.match(/^(.*?)(\d+)$/);
  if (!match) return `PRJ-${String(new Date().getFullYear()).slice(-2)}-0001`;
  return `${match[1]}${String(Number(match[2]) + 1).padStart(match[2].length, "0")}`;
}

function projectNoSequenceValue(value) {
  const match = cleanCell(value).match(/(\d+)$/);
  return match ? Number(match[1]) || 0 : 0;
}

function nextAvailableSalesProjectNo(current, projects = []) {
  let next = cleanCell(current || `PRJ-${String(new Date().getFullYear()).slice(-2)}-0001`);
  for (const project of projects || []) {
    const projectNo = cleanCell(project.projectNo || project.projectId || project.no || "");
    if (!projectNo) continue;
    const candidate = nextSalesProjectNoFrom(projectNo);
    if (projectNoSequenceValue(candidate) > projectNoSequenceValue(next)) next = candidate;
  }
  return next;
}

function nextSalesEnquiryNoFrom(current) {
  const text = String(current || "");
  const match = text.match(/^(.*?)(\d+)$/);
  if (!match) return `ENQ-${new Date().getFullYear()}-0001`;
  return `${match[1]}${String(Number(match[2]) + 1).padStart(match[2].length, "0")}`;
}

function normalizeSalesProjectBoqItem(item = {}) {
  const qty = Number(item.qty || item.quantity || 0) || 0;
  const deliveredQty = Number(item.deliveredQty || 0) || 0;
  const pendingQty = qty - deliveredQty;
  return {
    model: cleanCell(item.model || item.modelNo || ""),
    description: cleanCell(item.description || ""),
    qty,
    deliveredQty,
    reserve: pendingQty > 0 && !!(item.reserve || item.reserveStock),
    pendingQty,
    stock: cleanCell(item.stock || "")
  };
}

function salesProjectAutoStatusServer(project = {}) {
  const existingStatus = cleanCell(project.status || "Ongoing");
  const statusKey = inventoryNorm(existingStatus);
  if (["LOST", "LOSTCLOSED", "CLOSED"].includes(statusKey)) return existingStatus;
  const rows = (project.boq || project.items || []).filter(row => row.model || row.description || Number(row.qty || 0) || Number(row.deliveredQty || 0));
  if (!rows.length) return "Ongoing";
  return rows.some(row => (Number(row.qty || 0) - Number(row.deliveredQty || 0)) > 0) ? "Delivery Pending" : "Completed";
}

function normalizeSalesProjectDirectDeliveryUpload(item = {}) {
  const lines = Array.isArray(item.lines) ? item.lines.map(line => ({
    modelNo: cleanCell(line.modelNo || line.model || ""),
    quantity: Number(line.quantity || line.qty || line.finalQty || line.detectedQty || 0) || 0,
    status: cleanCell(line.status || "")
  })) : [];
  return {
    id: cleanCell(item.id || id()),
    uploadId: cleanCell(item.uploadId || item.id || ""),
    originalName: cleanCell(item.originalName || item.fileName || ""),
    storedName: cleanCell(item.storedName || ""),
    mimeType: cleanCell(item.mimeType || ""),
    size: Number(item.size || 0) || 0,
    uploadedAt: cleanCell(item.uploadedAt || item.createdAt || new Date().toISOString()),
    date: cleanCell(item.date || todayDisplayDate()),
    deliveryNoteNo: cleanCell(item.deliveryNoteNo || item.dnNo || item.supplierDnNo || ""),
    totalQuantity: Number(item.totalQuantity || lines.reduce((sum, line) => sum + line.quantity, 0)) || 0,
    lines
  };
}

function initials(text) {
  const parts = String(text || "CZ").trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? `${parts[0][0]}${parts[1][0]}` : parts[0]?.slice(0, 2) || "CZ").toUpperCase();
}

function todayDisplayDate() {
  const now = new Date();
  return `${String(now.getDate()).padStart(2, "0")}-${String(now.getMonth() + 1).padStart(2, "0")}-${now.getFullYear()}`;
}

function serveStatic(req, res) {
  const urlPath = decodeURIComponent(new URL(req.url, `http://${req.headers.host}`).pathname);
  const target = urlPath === "/" ? path.join(PUBLIC, "index.html") : path.join(PUBLIC, urlPath);
  const normalized = path.normalize(target);
  if (!normalized.startsWith(PUBLIC) || !fs.existsSync(normalized) || fs.statSync(normalized).isDirectory()) {
    return notFound(res);
  }
  const ext = path.extname(normalized).toLowerCase();
  const cacheControl = [".html", ".js", ".css"].includes(ext)
    ? "no-cache, no-store, must-revalidate"
    : "public, max-age=86400";
  res.writeHead(200, {
    "Content-Type": mimeTypes[ext] || "application/octet-stream",
    "Cache-Control": cacheControl
  });
  res.end(fs.readFileSync(normalized));
}

async function handleApi(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const parts = url.pathname.split("/").filter(Boolean);
  const user = await sessionUser(req);

  if (req.method === "GET" && url.pathname === "/api/auth/me") {
    const settings = await readSettings();
    return send(res, 200, { user, settings: publicSettings(settings) });
  }

  if (req.method === "POST" && url.pathname === "/api/auth/login") {
    const body = await readJson(req);
    const settings = await readSettings();
    const matched = (settings.users || []).find(item => cleanCell(item.email).toLowerCase() === cleanCell(body.email).toLowerCase() && item.active !== false);
    if (!matched || !verifyPassword(body.password, matched.passwordHash)) return send(res, 401, { error: "Invalid email or password" });
    const token = createSessionToken(matched.id);
    sessions.set(token, { userId: matched.id, createdAt: Date.now() });
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Set-Cookie": sessionCookie("cz_session", token, req)
    });
    return res.end(JSON.stringify({ user: { id: matched.id, name: matched.name, role: matched.role, email: matched.email }, settings: publicSettings(settings) }));
  }

  if (req.method === "POST" && url.pathname === "/api/auth/logout") {
    const token = parseCookies(req).cz_session;
    if (token) sessions.delete(token);
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Set-Cookie": sessionCookie("cz_session", "", req, "; Max-Age=0")
    });
    return res.end(JSON.stringify({ ok: true }));
  }

  if (!user) return sendAuthRequired(res);

  if (isPoOnly(user) && !canPoOnlyAccessPath(req, url.pathname)) {
    return sendPoOnlyForbidden(res);
  }

  if (req.method === "GET" && url.pathname === "/api/settings") {
    return send(res, 200, { user, settings: publicSettings(await readSettings()) });
  }

  if (req.method === "PUT" && url.pathname === "/api/settings/company") {
    if (!isAdmin(user)) return sendForbidden(res);
    const body = await readJson(req);
    const settings = await readSettings();
    const key = body.companyKey === "company2" ? "company2" : "company";
    settings[key] = {
      ...settings[key],
      name: cleanCell(body.name || ""),
      address: cleanCell(body.address || ""),
      trn: cleanCell(body.trn || ""),
      phone: cleanCell(body.phone || ""),
      email: cleanCell(body.email || ""),
      website: cleanCell(body.website || ""),
      logoUploadId: cleanCell(body.logoUploadId || settings[key].logoUploadId || "")
    };
    await writeSettings(settings);
    return send(res, 200, { user, settings: publicSettings(settings) });
  }

  if (req.method === "POST" && url.pathname === "/api/settings/users") {
    if (!isAdmin(user)) return sendForbidden(res);
    const body = await readJson(req);
    const settings = await readSettings();
    const email = cleanCell(body.email || "").toLowerCase();
    if (!email) return send(res, 400, { error: "Email is required" });
    const existing = body.id
      ? settings.users.find(item => item.id === body.id)
      : settings.users.find(item => cleanCell(item.email).toLowerCase() === email);
    const nextUser = existing || { id: id(), passwordHash: passwordHash(body.password || "ChangeMe123") };
    nextUser.name = cleanCell(body.name || "");
    nextUser.role = cleanCell(body.role || "Staff");
    nextUser.email = email;
    nextUser.active = body.active !== false;
    if (body.password) nextUser.passwordHash = passwordHash(body.password);
    if (existing) {
      settings.users = settings.users.map(item => item.id === existing.id ? nextUser : item);
    } else {
      settings.users.push(nextUser);
    }
    await writeSettings(settings);
    return send(res, 200, { user, settings: publicSettings(settings) });
  }

  if (req.method === "DELETE" && url.pathname.match(/^\/api\/settings\/users\/[^/]+$/)) {
    if (!isAdmin(user)) return sendForbidden(res);
    const userId = decodeURIComponent(parts[3]);
    if (userId === user.id) return send(res, 400, { error: "You cannot delete your own admin login" });
    const settings = await readSettings();
    settings.users = (settings.users || []).filter(item => item.id !== userId);
    await writeSettings(settings);
    return send(res, 200, { user, settings: publicSettings(settings) });
  }

  if (req.method === "POST" && url.pathname === "/api/settings/uploads") {
    if (!isAdmin(user)) return sendForbidden(res);
    const buffer = await collect(req);
    const multipart = parseMultipart(buffer, req.headers["content-type"] || "");
    const filePart = multipart.find(part => part.filename);
    if (!filePart) return send(res, 400, { error: "No file uploaded" });
    const uploadId = id();
    const storedName = `${uploadId}-${safeName(filePart.filename)}`;
    await saveUpload("settings", storedName, filePart.body, filePart.mimeType);
    const settings = await readSettings();
    const upload = {
      id: uploadId,
      originalName: filePart.filename,
      storedName,
      mimeType: filePart.mimeType,
      size: filePart.body.length,
      category: cleanCell(multipart.find(part => part.name === "category")?.body.toString("utf8") || "Attachment"),
      createdAt: new Date().toISOString()
    };
    settings.attachments.unshift(upload);
    const targetCompany = cleanCell(multipart.find(part => part.name === "companyKey")?.body.toString("utf8"));
    if (upload.category === "Logo" && ["company", "company2"].includes(targetCompany)) settings[targetCompany].logoUploadId = upload.id;
    await writeSettings(settings);
    return send(res, 201, { upload, settings: publicSettings(settings) });
  }

  if (req.method === "GET" && url.pathname.match(/^\/api\/settings\/uploads\/[^/]+$/)) {
    const settings = await readSettings();
    const upload = (settings.attachments || []).find(item => item.id === decodeURIComponent(parts[3]));
    if (!upload) return notFound(res);
    return sendStoredUpload(res, upload, "settings");
  }

  if (req.method === "DELETE" && url.pathname.match(/^\/api\/settings\/uploads\/[^/]+$/)) {
    if (!isAdmin(user)) return sendForbidden(res);
    const settings = await readSettings();
    const uploadId = decodeURIComponent(parts[3]);
    const upload = (settings.attachments || []).find(item => item.id === uploadId);
    settings.attachments = (settings.attachments || []).filter(item => item.id !== uploadId);
    for (const key of ["company", "company2"]) if (settings[key].logoUploadId === uploadId) settings[key].logoUploadId = "";
    if (upload) await deleteUpload("settings", upload.storedName);
    await writeSettings(settings);
    return send(res, 200, { user, settings: publicSettings(settings) });
  }

  if (req.method === "GET" && url.pathname === "/api/projects") {
    return send(res, 200, await listProjects(url.searchParams.get("q") || ""));
  }

  if (req.method === "POST" && url.pathname === "/api/projects") {
    const project = await createDefaultProject();
    if (url.searchParams.get("draft") === "1") {
      return send(res, 200, project);
    }
    await writeProject(project);
    return send(res, 201, project);
  }

  if (req.method === "GET" && url.pathname === "/api/inventory") {
    return send(res, 200, await inventoryView(await readInventory()));
  }

  if (req.method === "GET" && url.pathname === "/api/purchase-orders") {
    return send(res, 200, purchaseOrderView(await readPurchaseOrders()));
  }

  if (req.method === "GET" && url.pathname === "/api/sales-crm") {
    return send(res, 200, await salesCrmView(await readSalesCrm()));
  }

  if (req.method === "POST" && url.pathname === "/api/sales-crm/customers/import") {
    const store = await readSalesCrm();
    const inventory = await readInventory();
    const body = await readJson(req);
    const rows = Array.isArray(body.customers) ? body.customers : Array.isArray(body.items) ? body.items : [];
    let imported = 0;
    for (const row of rows) {
      const item = normalizeSalesItem("customers", row, store);
      if (!item.name) continue;
      const existingIndex = (store.customers || []).findIndex(entry => entry.id === item.id || inventoryNorm(entry.name) === inventoryNorm(item.name));
      if (existingIndex >= 0) {
        item.id = store.customers[existingIndex].id || item.id;
        store.customers[existingIndex] = item;
      } else {
        store.customers.unshift(item);
      }
      const inventoryIndex = (inventory.customers || []).findIndex(entry => entry.id === item.id || inventoryNorm(entry.customerName) === inventoryNorm(item.name));
      const inventoryCustomer = salesCustomerToInventoryCustomer(item, inventoryIndex >= 0 ? inventory.customers[inventoryIndex] : null);
      if (inventoryIndex >= 0) inventory.customers[inventoryIndex] = inventoryCustomer;
      else inventory.customers.push(inventoryCustomer);
      imported++;
    }
    store.customers = mergeDuplicateSalesCustomers(store.customers);
    await writeSalesCrm(store);
    await writeInventory(inventory);
    return send(res, 200, { imported, state: await salesCrmView(store) });
  }

  if (req.method === "POST" && url.pathname === "/api/sales-crm/quotations/pdf") {
    const store = await readSalesCrm();
    const body = await readJson(req);
    const sourceQuote = body.quoteId
      ? (store.quotations || []).find(item => item.id === body.quoteId)
      : (body.quote || body);
    if (!sourceQuote) return notFound(res);
    const quote = normalizeSalesItem("quotations", sourceQuote, store);
    const customer = (store.customers || []).find(item => cleanCell(item.name).toLowerCase() === cleanCell(quote.customer).toLowerCase()) || {};
    const pdf = await salesQuotationPdfBuffer({ quote, customer });
    const filename = salesQuotationPdfFilename(quote);
    const upload = {
      id: id(),
      originalName: filename,
      storedName: `${id()}-${safeName(filename)}`,
      mimeType: "application/pdf",
      size: pdf.length,
      createdAt: new Date().toISOString(),
      category: "Sales Quotation PDF"
    };
    await saveUpload("sales-quotations", upload.storedName, pdf, upload.mimeType);
    if (body.quoteId) {
      const index = (store.quotations || []).findIndex(item => item.id === body.quoteId);
      if (index >= 0) {
        store.quotations[index] = {
          ...store.quotations[index],
          pdfUpload: upload,
          lastPdfGeneratedAt: upload.createdAt
        };
        await writeSalesCrm(store);
      }
    }
    res.writeHead(200, {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`
    });
    return res.end(pdf);
  }

  if (req.method === "POST" && [
    "/api/sales-crm/order-book/extract-po",
    "/api/sales-crm/orderBook/extract-po",
    "/api/order-book/extract-po"
  ].includes(url.pathname)) {
    const buffer = await collect(req);
    const multipart = parseMultipart(buffer, req.headers["content-type"] || "");
    const filePart = multipart.find(part => part.filename);
    if (!filePart) return send(res, 400, { error: "No PO uploaded" });
    const extracted = await extractOrderBookPoWithOpenAI(filePart).catch(error => ({ message: error.message }));
    return send(res, 200, {
      order: normalizeOrderBookPoExtraction(extracted),
      message: extracted.message || "PO scanned. Review and save the order."
    });
  }

  if (req.method === "POST" && [
    "/api/sales-crm/order-book/extract-invoice",
    "/api/sales-crm/orderBook/extract-invoice",
    "/api/order-book/extract-invoice"
  ].includes(url.pathname)) {
    const buffer = await collect(req);
    const multipart = parseMultipart(buffer, req.headers["content-type"] || "");
    const filePart = multipart.find(part => part.filename);
    if (!filePart) return send(res, 400, { error: "No invoice uploaded" });
    const extracted = await extractOrderBookInvoiceWithOpenAI(filePart).catch(error => ({ message: error.message }));
    return send(res, 200, {
      invoice: normalizeOrderBookInvoiceExtraction(extracted),
      message: extracted.message || "Invoice scanned. Review payment amount."
    });
  }

  if (req.method === "POST" && url.pathname === "/api/sales-crm/projects/direct-delivery/upload") {
    const buffer = await collect(req);
    const multipart = parseMultipart(buffer, req.headers["content-type"] || "");
    const filePart = multipart.find(part => part.filename);
    const projectId = cleanCell((multipart.find(part => part.name === "projectId")?.body || Buffer.from("")).toString("utf8"));
    if (!filePart) return send(res, 400, { error: "No delivery note uploaded" });
    const uploadId = id();
    const storedName = `${uploadId}-${safeName(filePart.filename)}`;
    await saveUpload(`sales-project-deliveries/${projectId || "draft"}`, storedName, filePart.body, filePart.mimeType);
    const extracted = await extractProjectDirectDeliveryWithOpenAI(filePart).catch(error => ({
      deliveryNoteNo: "",
      date: todayDisplayDate(),
      lines: [],
      message: error.message || "Delivery note extraction failed."
    }));
    const upload = normalizeSalesProjectDirectDeliveryUpload({
      id: uploadId,
      uploadId,
      originalName: filePart.filename,
      storedName,
      mimeType: filePart.mimeType,
      size: filePart.body.length,
      uploadedAt: new Date().toISOString(),
      date: extracted.date || todayDisplayDate(),
      deliveryNoteNo: extracted.deliveryNoteNo || "",
      lines: (extracted.lines || []).map(line => ({
        modelNo: line.modelNo,
        quantity: line.quantity || line.finalQty || line.detectedQty,
        status: line.status
      }))
    });
    return send(res, 201, { upload, detected: extracted, message: extracted.message || "Delivery note scanned. Review detected items." });
  }

  if (req.method === "GET" && url.pathname.match(/^\/api\/sales-crm\/projects\/[^/]+\/direct-delivery\/uploads\/[^/]+$/)) {
    const parts = url.pathname.split("/");
    const projectId = decodeURIComponent(parts[4]);
    const uploadId = decodeURIComponent(parts[7]);
    const store = await readSalesCrm();
    const project = (store.projects || []).find(item => item.id === projectId);
    const upload = (project?.directDeliveryUploads || []).find(item => item.uploadId === uploadId || item.id === uploadId);
    if (!upload) return notFound(res);
    return sendStoredUpload(res, upload, `sales-project-deliveries/${projectId}`);
  }

  if (req.method === "DELETE" && url.pathname.match(/^\/api\/sales-crm\/projects\/[^/]+\/direct-delivery\/uploads\/[^/]+$/)) {
    const parts = url.pathname.split("/");
    const projectId = decodeURIComponent(parts[4]);
    const uploadId = decodeURIComponent(parts[7]);
    const store = await readSalesCrm();
    const project = (store.projects || []).find(item => item.id === projectId);
    if (!project) return notFound(res);
    const upload = (project.directDeliveryUploads || []).find(item => item.uploadId === uploadId || item.id === uploadId);
    project.directDeliveryUploads = (project.directDeliveryUploads || []).filter(item => item.uploadId !== uploadId && item.id !== uploadId);
    if (upload?.storedName) await deleteUpload(`sales-project-deliveries/${projectId}`, upload.storedName);
    await writeSalesCrm(store);
    return send(res, 200, await salesCrmView(store));
  }

  if (req.method === "POST" && url.pathname.match(/^\/api\/sales-crm\/(leads|customers|projects|quotations|followUps|orderBook)$/)) {
    const store = await readSalesCrm();
    const collection = url.pathname.split("/").pop();
    const body = await readJson(req);
    const item = normalizeSalesItem(collection, body.item || body, store);
    const existingIndex = store[collection].findIndex(entry => (
      entry.id === item.id ||
      (collection === "customers" && inventoryNorm(entry.name) === inventoryNorm(item.name))
    ));
    if (existingIndex >= 0) {
      if (collection === "customers") item.id = store[collection][existingIndex].id || item.id;
      store[collection][existingIndex] = item;
    }
    else store[collection].unshift(item);
    if (collection === "customers") store.customers = mergeDuplicateSalesCustomers(store.customers);
    if (collection === "quotations") {
      store.settings.nextQuotationNo = nextAvailableSalesQuotationNo(store.settings.nextQuotationNo, store.quotations);
    }
    if (collection === "projects") {
      store.settings.nextProjectNo = nextAvailableSalesProjectNo(store.settings.nextProjectNo, store.projects);
    }
    if (collection === "leads" && item.enquiryNo) {
      store.settings.nextEnquiryNo = nextSalesEnquiryNoFrom(item.enquiryNo);
    }
    await writeSalesCrm(store);
    if (collection === "customers") await syncSalesCustomerToInventory(item);
    return send(res, 200, await salesCrmView(store));
  }

  if (req.method === "DELETE" && url.pathname.match(/^\/api\/sales-crm\/(leads|customers|projects|quotations|followUps|orderBook)\/[^/]+$/)) {
    const store = await readSalesCrm();
    const parts = url.pathname.split("/");
    const collection = parts[3];
    const itemId = decodeURIComponent(parts[4]);
    const deletedItem = (store[collection] || []).find(item => item.id === itemId);
    if (collection === "customers") {
      const customerName = deletedItem?.name || "";
      const hasQuotation = customerName && (store.quotations || []).some(quote => inventoryNorm(quote.customer) === inventoryNorm(customerName));
      if (hasQuotation) return send(res, 409, { error: "Customer cannot be deleted because a quotation exists for this customer." });
    }
    store[collection] = (store[collection] || []).filter(item => item.id !== itemId);
    await writeSalesCrm(store);
    if (collection === "customers" && deletedItem) {
      const inventory = await readInventory();
      inventory.customers = (inventory.customers || []).filter(customer => inventoryNorm(customer.customerName) !== inventoryNorm(deletedItem.name));
      await writeInventory(inventory);
    } else if (collection === "customers") {
      const inventory = await readInventory();
      inventory.customers = (inventory.customers || []).filter(customer => customer.id !== itemId);
      await writeInventory(inventory);
    }
    return send(res, 200, await salesCrmView(store));
  }

  if (req.method === "POST" && url.pathname === "/api/purchase-orders/suppliers") {
    const store = await readPurchaseOrders();
    const body = await readJson(req);
    const supplier = normalizePurchaseSupplier(body);
    if (!supplier.supplierName) return send(res, 400, { error: "Supplier Name is required" });
    const existingIndex = store.suppliers.findIndex(item => item.id === supplier.id || inventoryNorm(item.supplierName) === inventoryNorm(supplier.supplierName));
    if (existingIndex >= 0) {
      supplier.id = store.suppliers[existingIndex].id;
      supplier.createdAt = store.suppliers[existingIndex].createdAt || supplier.createdAt;
      store.suppliers[existingIndex] = supplier;
    } else {
      store.suppliers.unshift(supplier);
    }
    await writePurchaseOrders(store);
    return send(res, 200, purchaseOrderView(store));
  }

  if (req.method === "DELETE" && url.pathname.match(/^\/api\/purchase-orders\/suppliers\/[^/]+$/)) {
    const store = await readPurchaseOrders();
    const supplierId = decodeURIComponent(url.pathname.split("/").pop());
    store.suppliers = (store.suppliers || []).filter(supplier => supplier.id !== supplierId);
    await writePurchaseOrders(store);
    return send(res, 200, purchaseOrderView(store));
  }

  if (req.method === "POST" && url.pathname === "/api/purchase-orders/upload-quotation") {
    const store = await readPurchaseOrders();
    const buffer = await collect(req);
    const multipart = parseMultipart(buffer, req.headers["content-type"] || "");
    const filePart = multipart.find(part => part.filename);
    if (!filePart) return send(res, 400, { error: "No quotation uploaded" });
    const uploadId = id();
    const storedName = `${uploadId}-${safeName(filePart.filename)}`;
    await saveUpload("purchase-orders", storedName, filePart.body, filePart.mimeType);
    store.uploads.unshift({ id: uploadId, originalName: filePart.filename, storedName, mimeType: filePart.mimeType, size: filePart.body.length, createdAt: new Date().toISOString() });
    await writePurchaseOrders(store);
    const extracted = await extractPurchaseQuotationWithOpenAI(filePart).catch(error => ({ message: error.message, items: [] }));
    const extractedSubtotal = Number(String(extracted.manualSubtotal ?? extracted.subtotal ?? "").replace(/,/g, "")) || 0;
    const extractedItemBaseTotal = (extracted.items || []).reduce((sum, item) => {
      const qty = Number(item.qty || item.quantity || 0) || 0;
      const unitPrice = Number(item.unitPrice || item.unitPriceAed || item.rate || 0) || 0;
      const amount = Number(item.amount || 0) || 0;
      return sum + (qty * unitPrice || amount);
    }, 0);
    const supplierMerged = mergeScannedPurchaseSupplierDetails(extracted, store);
    const order = normalizePurchaseOrder({
      ...supplierMerged,
      manualSubtotal: extractedItemBaseTotal > 0 ? "" : (extractedSubtotal > 0 ? extractedSubtotal : ""),
      discount: supplierMerged.discount ?? 0,
      notes: DEFAULT_PURCHASE_NOTES,
      sourceUploadId: uploadId,
      status: "Draft"
    }, store, false);
    order.id = "";
    order.poNo = "";
    return send(res, 200, { order, message: extracted.message || "Quotation scanned. Review and edit before creating the PO." });
  }

  if (req.method === "POST" && url.pathname === "/api/purchase-orders") {
    const store = await readPurchaseOrders();
    const body = await readJson(req);
    const sourceOrder = body.order || body;
    const order = normalizePurchaseOrder({
      ...sourceOrder,
      status: body.createOfficial ? "Created" : "Draft"
    }, store, !!body.createOfficial);
    const existingIndex = store.orders.findIndex(item => item.id === order.id);
    if (body.createOfficial && !order.poNo) {
      order.poNo = store.settings.nextPoNo || defaultPurchaseOrders().settings.nextPoNo;
      store.settings.nextPoNo = nextPoNoFrom(order.poNo);
    } else if (body.createOfficial && order.poNo) {
      store.settings.nextPoNo = nextPoNoFrom(order.poNo);
    }
    if (body.createOfficial) order.status = "Created";
    if (existingIndex >= 0) store.orders[existingIndex] = order;
    else store.orders.unshift(order);
    await writePurchaseOrders(store);
    return send(res, 200, { state: purchaseOrderView(store), order });
  }

  if (req.method === "GET" && url.pathname.match(/^\/api\/purchase-orders\/uploads\/[^/]+$/)) {
    const store = await readPurchaseOrders();
    const uploadId = decodeURIComponent(url.pathname.split("/").pop());
    const upload = (store.uploads || []).find(item => item.id === uploadId);
    if (!upload) return notFound(res);
    return sendStoredUpload(res, upload, "purchase-orders");
  }

  if (req.method === "DELETE" && url.pathname.match(/^\/api\/purchase-orders\/[^/]+$/)) {
    const store = await readPurchaseOrders();
    const orderId = decodeURIComponent(url.pathname.split("/").pop());
    store.orders = store.orders.filter(order => order.id !== orderId);
    store.settings.nextPoNo = nextPurchaseNoFromOrders(store.orders);
    await writePurchaseOrders(store);
    return send(res, 200, purchaseOrderView(store));
  }

  if (req.method === "POST" && url.pathname === "/api/purchase-orders/pdf") {
    const payload = await readJson(req);
    const order = normalizePurchaseOrder(payload.order || payload, await readPurchaseOrders(), false);
    if (order.status !== "Created" || !order.poNo) return send(res, 400, { error: "Create the Purchase Order before downloading PDF." });
    const pdf = await purchaseOrderPdfBuffer(order);
    res.writeHead(200, {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${purchaseOrderPdfFilename(order)}"`
    });
    return res.end(pdf);
  }

  if (req.method === "GET" && url.pathname === "/api/area-calculations") {
    const store = await readAreaCalculations();
    return send(res, 200, store);
  }

  if (req.method === "POST" && url.pathname === "/api/area-calculations/upload") {
    const store = await readAreaCalculations();
    const buffer = await collect(req);
    const multipart = parseMultipart(buffer, req.headers["content-type"] || "");
    const fileParts = multipart.filter(part => part.filename);
    if (!fileParts.length) return send(res, 400, { error: "No drawing uploaded" });
    const titlePart = multipart.find(part => part.name === "title");
    const calculationIdPart = multipart.find(part => part.name === "calculationId");
    const title = cleanCell(titlePart?.body.toString("utf8") || fileParts[0].filename.replace(/\.[^.]+$/, "")) || "Untitled Area Calculation";
    const calculationId = cleanCell(calculationIdPart?.body.toString("utf8") || "");
    const uploadIds = [];
    const now = new Date().toISOString();
    for (const filePart of fileParts) {
      const uploadId = id();
      const storedName = `${uploadId}-${safeName(filePart.filename)}`;
      await saveUpload("area-calculations", storedName, filePart.body, filePart.mimeType);
      store.uploads.unshift({ id: uploadId, originalName: filePart.filename, storedName, mimeType: filePart.mimeType, size: filePart.body.length, createdAt: now });
      uploadIds.push(uploadId);
    }
    let extracted;
    try {
      extracted = await extractAreaCalculationWithOpenAI(fileParts);
    } catch (error) {
      return send(res, 502, { error: error.message || "Area extraction failed. The drawing was not scanned." });
    }
    if (!Array.isArray(extracted.rows) || !extracted.rows.length) {
      return send(res, 422, { error: extracted.message || "No duct area rows were detected from this upload." });
    }
    const existingIndex = calculationId ? store.calculations.findIndex(item => item.id === calculationId) : -1;
    if (existingIndex >= 0) {
      const existing = store.calculations[existingIndex];
      const calculation = normalizeAreaCalculation({
        ...existing,
        title: existing.title || title,
        uploadIds: [...(existing.uploadIds || []), ...uploadIds],
        rows: [...(existing.rows || []), ...(extracted.rows || [])],
        message: extracted.message || "Drawing scanned. Review highlighted rows before export.",
        updatedAt: now
      });
      calculation.createdAt = existing.createdAt || calculation.createdAt;
      calculation.updatedAt = now;
      store.calculations[existingIndex] = calculation;
      await writeAreaCalculations(store);
      return send(res, 200, { ...store, activeCalculationId: calculation.id });
    }
    const calculation = normalizeAreaCalculation({
      title,
      uploadIds,
      rows: extracted.rows || [],
      message: extracted.message || "Drawing scanned. Review highlighted rows before export.",
      createdAt: now,
      updatedAt: now
    });
    store.calculations.unshift(calculation);
    await writeAreaCalculations(store);
    return send(res, 200, { ...store, activeCalculationId: calculation.id });
  }

  if (req.method === "POST" && url.pathname === "/api/area-calculations") {
    const store = await readAreaCalculations();
    const body = await readJson(req);
    const calculation = normalizeAreaCalculation(body.calculation || body);
    const existingIndex = store.calculations.findIndex(item => item.id === calculation.id);
    calculation.updatedAt = new Date().toISOString();
    if (existingIndex >= 0) {
      calculation.createdAt = store.calculations[existingIndex].createdAt || calculation.createdAt;
      store.calculations[existingIndex] = calculation;
    } else {
      store.calculations.unshift(calculation);
    }
    await writeAreaCalculations(store);
    return send(res, 200, store);
  }

  if (req.method === "GET" && url.pathname.match(/^\/api\/area-calculations\/uploads\/[^/]+$/)) {
    const store = await readAreaCalculations();
    const uploadId = decodeURIComponent(url.pathname.split("/").pop());
    const upload = (store.uploads || []).find(item => item.id === uploadId);
    if (!upload) return notFound(res);
    return sendStoredUpload(res, upload, "area-calculations");
  }

  if (req.method === "DELETE" && url.pathname.match(/^\/api\/area-calculations\/[^/]+$/)) {
    const store = await readAreaCalculations();
    const calculationId = decodeURIComponent(url.pathname.split("/").pop());
    store.calculations = (store.calculations || []).filter(item => item.id !== calculationId);
    await writeAreaCalculations(store);
    return send(res, 200, store);
  }

    if (req.method === "POST" && url.pathname === "/api/inventory/models") {
    const inventory = await readInventory();
    const body = await readJson(req);
    const modelNo = cleanCell(body.modelNo || body.model || "").toUpperCase();
    if (!modelNo) return send(res, 400, { error: "Model No. is required" });
    const existing = inventory.models.find(model => inventoryNorm(model.modelNo) === inventoryNorm(modelNo));
    const hasReservedQty = Object.prototype.hasOwnProperty.call(body, "reservedQty");
    const reservedQty = hasReservedQty ? Math.max(0, Number(body.reservedQty || 0)) : Number(existing?.reservedQty || 0);
    const modelUpdate = { modelNo, description: body.description || "", brand: body.brand || "Daikin", type: body.type || "" };
    if (hasReservedQty) modelUpdate.reservedQty = reservedQty;
    if (existing) Object.assign(existing, modelUpdate);
    else inventory.models.push({ id: id(), ...modelUpdate, reservedQty });
    if (body.quantity !== undefined && body.quantity !== "") {
      const current = computeInventory(inventory).stockByModel[inventoryNorm(modelNo)]?.qty || 0;
      const target = Number(body.quantity || 0);
      const diff = target - current;
      if (diff !== 0) {
        const uploadedDate = todayISO();
        inventory.supplierDns.unshift({
          id: id(),
          uploadedDate,
          supplierDnNo: nextManualStockNo(inventory, uploadedDate),
          projectName: "Manual Stock Entry",
          status: "Confirmed",
          isManualAdjustment: true,
          lines: [{ id: id(), modelNo, description: body.description || "", detectedQty: Math.abs(diff), finalQty: diff, status: "Ready" }]
        });
      }
    }
    await writeInventory(inventory);
    return send(res, 200, await inventoryView(inventory));
  }

  if (req.method === "POST" && url.pathname === "/api/inventory/models/import") {
    const inventory = await readInventory();
    const body = await readJson(req);
    const rows = Array.isArray(body.models) ? body.models : Array.isArray(body.items) ? body.items : [];
    let imported = 0;
    for (const row of rows) {
      const modelNo = cleanCell(row.modelNo || row.model || "").toUpperCase();
      if (!modelNo) continue;
      const existing = (inventory.models || []).find(model => inventoryNorm(model.modelNo) === inventoryNorm(modelNo));
      const next = {
        modelNo,
        description: cleanCell(row.description || ""),
        brand: cleanCell(row.brand || "Daikin"),
        type: cleanCell(row.type || ""),
        reservedQty: Math.max(0, Number(row.reservedQty || 0))
      };
      if (existing) Object.assign(existing, next);
      else inventory.models.push({ id: id(), ...next });
      imported++;
    }
    await writeInventory(inventory);
    return send(res, 200, { imported, state: await inventoryView(inventory) });
  }

  if (req.method === "DELETE" && url.pathname.match(/^\/api\/inventory\/models\/[^/]+$/)) {
    const inventory = await readInventory();
    const modelNo = decodeURIComponent(url.pathname.split("/").pop());
    inventory.models = (inventory.models || []).filter(model => inventoryNorm(model.modelNo) !== inventoryNorm(modelNo));
    inventory.supplierDns = (inventory.supplierDns || []).filter(dn => {
      if (!dn.isManualAdjustment) return true;
      return !(dn.lines || []).some(line => inventoryNorm(line.modelNo) === inventoryNorm(modelNo));
    });
    await writeInventory(inventory);
    return send(res, 200, await inventoryView(inventory));
  }

  if (req.method === "POST" && url.pathname === "/api/inventory/customers") {
    const inventory = await readInventory();
    const body = await readJson(req);
    if (!body.customerName) return send(res, 400, { error: "Customer name is required" });
    const existing = inventory.customers.find(customer => customer.id === body.id || inventoryNorm(customer.customerName) === inventoryNorm(body.customerName));
    const customer = {
      id: existing ? existing.id : id(),
      customerName: body.customerName || "",
      contactPerson: body.contactPerson || "",
      phone: body.phone || "",
      email: body.email || "",
      address: body.address || "",
      defaultDeliveryLocation: body.defaultDeliveryLocation || body.deliveryLocation || ""
    };
    if (existing) Object.assign(existing, customer);
    else inventory.customers.push(customer);
    await writeInventory(inventory);
    await syncInventoryCustomerToSales(customer);
    return send(res, 200, await inventoryView(inventory));
  }

  if (req.method === "DELETE" && url.pathname.match(/^\/api\/inventory\/customers\/[^/]+$/)) {
    const inventory = await readInventory();
    const customerId = decodeURIComponent(url.pathname.split("/").pop());
    const deletedCustomer = (inventory.customers || []).find(customer => customer.id === customerId);
    if (deletedCustomer?.customerName) {
      const store = await readSalesCrm();
      const hasQuotation = (store.quotations || []).some(quote => inventoryNorm(quote.customer) === inventoryNorm(deletedCustomer.customerName));
      if (hasQuotation) return send(res, 409, { error: "Customer cannot be deleted because a quotation exists for this customer." });
    }
    inventory.customers = (inventory.customers || []).filter(customer => customer.id !== customerId);
    await writeInventory(inventory);
    if (deletedCustomer) {
      const store = await readSalesCrm();
      store.customers = (store.customers || []).filter(customer => inventoryNorm(customer.name) !== inventoryNorm(deletedCustomer.customerName));
      await writeSalesCrm(store);
    } else {
      const store = await readSalesCrm();
      store.customers = (store.customers || []).filter(customer => customer.id !== customerId);
      await writeSalesCrm(store);
    }
    return send(res, 200, await inventoryView(inventory));
  }

  if (req.method === "POST" && url.pathname === "/api/inventory/supplier-dns") {
    const inventory = await readInventory();
    const body = await readJson(req);
    const supplierDn = {
      id: body.id || id(),
      uploadedDate: body.uploadedDate || todayISO(),
      supplierDnNo: body.supplierDnNo || "",
      projectName: body.projectName || "",
      status: body.status || "Review Needed",
      lines: enrichSupplierLinesFromStock(inventory, body.lines || []),
      uploadId: body.uploadId || "",
      isManualAdjustment: !!body.isManualAdjustment,
      duplicateWarning: !!body.supplierDnNo && inventory.supplierDns.some(dn => dn.id !== body.id && dn.supplierDnNo && inventoryNorm(dn.supplierDnNo) === inventoryNorm(body.supplierDnNo))
    };
    const existingIndex = inventory.supplierDns.findIndex(dn => dn.id === supplierDn.id);
    if (existingIndex >= 0) inventory.supplierDns[existingIndex] = supplierDn;
    else inventory.supplierDns.unshift(supplierDn);
    await writeInventory(inventory);
    return send(res, 200, await inventoryView(inventory));
  }

  if (req.method === "POST" && url.pathname === "/api/inventory/supplier-dns/upload") {
    const inventory = await readInventory();
    const buffer = await collect(req);
    const multipart = parseMultipart(buffer, req.headers["content-type"] || "");
    const filePart = multipart.find(part => part.filename);
    if (!filePart) return send(res, 400, { error: "No file uploaded" });
    const uploadId = id();
    const storedName = `${uploadId}-${safeName(filePart.filename)}`;
    await saveUpload("inventory", storedName, filePart.body, filePart.mimeType);
    const extracted = await extractSupplierDnWithOpenAI(filePart, uploadId, inventory).catch(error => ({ supplierDnNo: "", projectName: "", lines: [], message: error.message }));
    const supplierDn = {
      id: id(),
      uploadedDate: todayISO(),
      supplierDnNo: extracted.supplierDnNo || "",
      projectName: extracted.projectName || "",
      status: "Review Needed",
      lines: enrichSupplierLinesFromStock(inventory, combineSupplierLines(extracted.lines || [])),
      uploadId,
      message: extracted.message || "",
      duplicateWarning: false
    };
    supplierDn.duplicateWarning = !!supplierDn.supplierDnNo && inventory.supplierDns.some(dn => dn.supplierDnNo && inventoryNorm(dn.supplierDnNo) === inventoryNorm(supplierDn.supplierDnNo));
    inventory.uploads.push({ id: uploadId, originalName: filePart.filename, storedName, mimeType: filePart.mimeType, size: filePart.body.length, createdAt: new Date().toISOString() });
    inventory.supplierDns.unshift(supplierDn);
    await writeInventory(inventory);
    return send(res, 200, { ...(await inventoryView(inventory)), activeSupplierDnId: supplierDn.id });
  }

  if (req.method === "POST" && url.pathname.match(/^\/api\/inventory\/supplier-dns\/[^/]+\/confirm$/)) {
    const inventory = await readInventory();
    const supplierDnId = url.pathname.split("/")[4];
    const supplierDn = inventory.supplierDns.find(dn => dn.id === supplierDnId);
    if (!supplierDn) return notFound(res);
    for (const line of supplierDn.lines) {
      if (!findModel(inventory, line.modelNo)) {
        inventory.models.push({ id: id(), modelNo: line.modelNo, description: line.description || "", brand: "Daikin", type: "", warehouseLocation: "", minimumStock: 0, needsReview: true });
      }
    }
    supplierDn.status = "Confirmed";
    await writeInventory(inventory);
    return send(res, 200, await inventoryView(inventory));
  }

  if (req.method === "POST" && url.pathname.match(/^\/api\/inventory\/supplier-dns\/[^/]+\/cancel$/)) {
    const inventory = await readInventory();
    const supplierDnId = url.pathname.split("/")[4];
    const supplierDn = inventory.supplierDns.find(dn => dn.id === supplierDnId);
    if (!supplierDn) return notFound(res);
    supplierDn.status = "Cancelled";
    await writeInventory(inventory);
    return send(res, 200, await inventoryView(inventory));
  }

  if (req.method === "DELETE" && url.pathname.match(/^\/api\/inventory\/supplier-dns\/[^/]+$/)) {
    const inventory = await readInventory();
    const supplierDnId = url.pathname.split("/").pop();
    inventory.supplierDns = (inventory.supplierDns || []).filter(dn => dn.id !== supplierDnId);
    await writeInventory(inventory);
    return send(res, 200, await inventoryView(inventory));
  }

  if (req.method === "POST" && url.pathname === "/api/inventory/delivery-notes") {
    const inventory = await readInventory();
    const body = await readJson(req);
    const deliveryNote = normalizeDeliveryNote(body, inventory);
    const existingIndex = inventory.deliveryNotes.findIndex(dn => dn.id === deliveryNote.id);
    const issuing = deliveryNote.status === "Issued" || deliveryNote.status === "Delivered";
    if (issuing) {
      const availabilityInventory = { ...inventory, deliveryNotes: inventory.deliveryNotes.filter(dn => dn.id !== deliveryNote.id) };
      const availability = computeInventory(availabilityInventory).stockByModel;
      for (const line of deliveryNote.lines) {
        if (Number(line.qtyGoingOut || 0) > Number(availability[inventoryNorm(line.modelNo)]?.qty || 0)) {
          return send(res, 400, { error: `Insufficient stock for ${line.modelNo}` });
        }
      }
    }
    if (existingIndex >= 0) inventory.deliveryNotes[existingIndex] = deliveryNote;
    else inventory.deliveryNotes.unshift(deliveryNote);
    inventory.settings.nextDeliveryNo = nextDeliveryNoFrom(deliveryNote.dnNo || inventory.settings.nextDeliveryNo);
    await writeInventory(inventory);
    return send(res, 200, await inventoryView(inventory));
  }

  if (req.method === "POST" && url.pathname.match(/^\/api\/inventory\/delivery-notes\/[^/]+\/cancel$/)) {
    const inventory = await readInventory();
    const deliveryNoteId = url.pathname.split("/")[4];
    const dn = inventory.deliveryNotes.find(item => item.id === deliveryNoteId);
    if (!dn) return notFound(res);
    dn.status = "Cancelled";
    await writeInventory(inventory);
    return send(res, 200, await inventoryView(inventory));
  }

  if (req.method === "DELETE" && url.pathname.match(/^\/api\/inventory\/delivery-notes\/[^/]+$/)) {
    const inventory = await readInventory();
    const deliveryNoteId = url.pathname.split("/").pop();
    inventory.deliveryNotes = (inventory.deliveryNotes || []).filter(item => item.id !== deliveryNoteId);
    await writeInventory(inventory);
    return send(res, 200, await inventoryView(inventory));
  }

  if (req.method === "POST" && url.pathname === "/api/inventory/delivery-note-pdf") {
    const payload = await readJson(req);
    const dn = payload.deliveryNote || payload;
    const pdf = await deliveryNotePdfBuffer(payload);
    res.writeHead(200, {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${(dn.dnNo || "delivery-note").replace(/"/g, "")}.pdf"`
    });
    return res.end(pdf);
  }

  if (parts[0] === "api" && parts[1] === "projects" && parts[2]) {
    const projectId = parts[2];
    const project = await readProject(projectId);

    if (req.method === "PUT" && parts.length === 3) {
      const next = await readJson(req);
      next.id = projectId;
      next.createdAt = project?.createdAt || next.createdAt || new Date().toISOString();
      await writeProject(next);
      return send(res, 200, next);
    }

    if (!project) return notFound(res);

    if (req.method === "GET" && parts.length === 3) return send(res, 200, project);

    if (req.method === "DELETE" && parts.length === 3) {
      await deleteProject(projectId);
      return send(res, 200, { ok: true });
    }

    if (req.method === "POST" && parts[3] === "uploads") {
      try {
        const buffer = await collect(req);
        const multipart = parseMultipart(buffer, req.headers["content-type"] || "");
        const filePart = multipart.find(part => part.filename);
        const nodePart = multipart.find(part => part.name === "nodeId");
        if (!filePart) return send(res, 400, { error: "No file uploaded" });
        const uploadId = id();
        const nodeId = nodePart ? nodePart.body.toString("utf8") : "file";
        const storedName = `${uploadId}-${safeName(filePart.filename)}`;
        await saveUpload(`projects/${projectId}`, storedName, filePart.body, filePart.mimeType);
        const upload = {
          id: uploadId,
          projectId,
          nodeId,
          originalName: filePart.filename,
          storedName,
          mimeType: filePart.mimeType,
          size: filePart.body.length,
          createdAt: new Date().toISOString()
        };
        project.uploads.push(upload);
        const node = project.nodes.find(n => n.id === nodeId);
        if (node) node.data.uploadId = uploadId;
        if (nodeId === "thermal-upload" || nodeId === "vrv-upload") project.visible = true;
        await writeProject(project);
        return send(res, 201, upload);
      } catch (error) {
        return send(res, 500, { error: error.message || "Upload failed" });
      }
    }

    if (req.method === "GET" && parts[3] === "uploads" && parts[4]) {
      const upload = project.uploads.find(item => item.id === parts[4]);
      if (!upload) return notFound(res);
      return sendStoredUpload(res, upload, `projects/${projectId}`);
    }

    if (req.method === "POST" && parts[3] === "extract" && parts[4] === "thermal") {
      const body = await readJson(req);
      const upload = project.uploads.find(item => item.id === body.uploadId);
      if (!upload) return send(res, 400, { error: "Thermal file not found" });
      return send(res, 200, {
        status: "ready_for_options",
        capacitySources: ["Calculated AC Load", "First Selection", "Second Selection"],
        familyModels: [],
        rows: [],
        message: "Thermal sheet uploaded. Select the capacity source, and mention a model/family only if it should be filled. Add zoomed screenshots first if any values are unclear."
      });
    }

    if (req.method === "POST" && parts[3] === "extract" && parts[4] === "thermal-vision") {
      const body = await readJson(req);
      const result = await extractThermalWithOpenAI(project, body);
      if (!body.previewOnly && result.rows && result.rows.length) {
        project.tables.thermal.rows = result.rows;
        await writeProject(project);
      }
      return send(res, 200, result);
    }

    if (req.method === "POST" && parts[3] === "extract" && parts[4] === "vrv") {
      const body = await readJson(req);
      const upload = project.uploads.find(item => item.id === body.uploadId);
      if (!upload) return send(res, 400, { error: "VRV file not found" });
      const bytes = await readUpload(`projects/${projectId}`, upload.storedName);
      if (!bytes) return send(res, 400, { error: "VRV file not found" });
      const extracted = extractVrvFile(bytes, upload.originalName);
      return send(res, 200, extracted);
    }
  }

  if (req.method === "POST" && url.pathname === "/api/export/costing-sheet") {
    const payload = await readJson(req);
    const workbook = generateCostingWorkbook(payload);
    res.writeHead(200, {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${(payload.filename || "costing.xlsx").replace(/"/g, "")}"`
    });
    return res.end(workbook);
  }

  if (req.method === "POST" && url.pathname === "/api/export/table") {
    const payload = await readJson(req);
    const workbook = generateTableWorkbook(payload);
    const filename = String(payload.filename || "table.xlsx").replace(/\.xls$/i, ".xlsx");
    res.writeHead(200, {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename.replace(/"/g, "")}"`,
      "Content-Length": workbook.length
    });
    return res.end(workbook);
  }

  if (req.method === "POST" && url.pathname === "/api/export/vrv-schedule") {
    const payload = await readJson(req);
    const workbook = generateVrvScheduleWorkbook(payload);
    res.writeHead(200, {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${(payload.filename || "vrvSchedule.xlsx").replace(/"/g, "")}"`
    });
    return res.end(workbook);
  }

  if (req.method === "POST" && url.pathname === "/api/export/quotation") {
    const payload = await readJson(req);
    if (fs.existsSync(QUOTATION_TEMPLATE)) {
      const docx = generateQuotationDocx(payload);
      res.writeHead(200, {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${(payload.filename || "quotation.docx").replace(/\.(doc|docx)$/i, ".docx").replace(/"/g, "")}"`
      });
      return res.end(docx);
    }
    const html = quotationHtml(payload);
    res.writeHead(200, {
      "Content-Type": "application/msword; charset=utf-8",
      "Content-Disposition": `attachment; filename="${(payload.filename || "quotation.doc").replace(/"/g, "")}"`
    });
    return res.end(html);
  }

  notFound(res);
}

async function extractThermalWithOpenAI(project, options) {
  options = normalizeThermalExtractionOptions(options || {});
  if (!process.env.OPENAI_API_KEY) {
    return {
      status: "missing_api_key",
      rows: [],
      unclearFields: ["OPENAI_API_KEY"],
      message: "OpenAI vision extraction is configured, but OPENAI_API_KEY is not set on the server."
    };
  }

  const uploadIds = Array.isArray(options.uploadIds) ? options.uploadIds : [];
  const uploads = uploadIds
    .map(uploadId => project.uploads.find(upload => upload.id === uploadId))
    .filter(Boolean);
  if (!uploads.length) {
    return { status: "no_files", rows: [], unclearFields: [], message: "Upload the thermal sheet PDF or screenshots first." };
  }

  let parsed;
  try {
    parsed = await callOpenAIJson(
      "thermal_sheet_extraction",
      thermalJsonSchema(),
      await thermalOpenAIContent(project, uploads, thermalPrompt(options))
    );
  } catch (error) {
    return openAIExtractionError(error);
  }
  if (!Array.isArray(parsed.unclearFields)) parsed.unclearFields = [];

  const customColumns = Array.isArray(parsed.customColumns) ? parsed.customColumns.map(safeExtract).filter(Boolean) : [];
  let customRows = Array.isArray(parsed.customRows)
    ? parsed.customRows.map(row => (Array.isArray(row.cells) ? row.cells.map(safeExtract) : []))
    : [];
  const rows = options.customExtraction ? [] : (parsed.rows || []).map(row => ({
    "Indoor": safeExtract(row.indoor),
    "Room": safeExtract(row.room),
    "Mode": "A",
    "Family or Model": options.familyModel || parsed.familyModel || "",
    "Cooling DBT": "24.4",
    "Cooling WBT": "17.2",
    "Heating T": "20",
    "Tot Cool Cap": safeExtract(row.totCoolCap),
    "Sens Cool Cap": safeExtract(row.sensCoolCap),
    "Heat Cap": "",
    "Air Flow Rate": safeExtract(row.airFlowRate)
  }));
  const reviewCells = {};
  const customReviewCells = {};
  let verifiedRows = [];
  let numericMismatchCount = 0;
  let customMismatchCount = 0;

  if (!options.customExtraction && rows.length) {
    try {
      const numericVerification = await callOpenAIJson(
        "thermal_numeric_verification",
        thermalNumericVerificationJsonSchema(),
        await thermalOpenAIContent(project, uploads, thermalNumericVerificationPrompt(options, rows))
      );
      verifiedRows = Array.isArray(numericVerification.rows) ? numericVerification.rows : [];
      numericMismatchCount = applyThermalNumericVerification(rows, verifiedRows, reviewCells);
      const retryCells = Object.values(reviewCells);
      if (retryCells.length) {
        try {
          const numericRetry = await callOpenAIJson(
            "thermal_targeted_retry",
            thermalNumericVerificationJsonSchema(),
            await thermalOpenAIContent(project, uploads, thermalTargetedRetryPrompt(options, retryCells))
          );
          const retryRows = Array.isArray(numericRetry.rows) ? numericRetry.rows : [];
          applyThermalTargetedRetry(rows, retryRows, reviewCells);
          numericMismatchCount = Object.keys(reviewCells).length;
          if (numericMismatchCount) {
            for (const field of numericRetry.unclearFields || []) {
              if (!parsed.unclearFields.includes(field)) parsed.unclearFields.push(field);
            }
          }
        } catch (error) {
          parsed.unclearFields.push("Targeted numeric retry failed");
        }
      }
    } catch (error) {
      parsed.unclearFields.push("Numeric verification pass failed");
    }
  }
  if (options.customExtraction && customColumns.length && customRows.length) {
    try {
      const customVerification = await callOpenAIJson(
        "thermal_custom_column_verification",
        thermalCustomVerificationJsonSchema(),
        await thermalOpenAIContent(project, uploads, thermalCustomVerificationPrompt(options, customColumns))
      );
      const verifiedCustomRows = Array.isArray(customVerification.customRows)
        ? customVerification.customRows.map(row => (Array.isArray(row.cells) ? row.cells.map(safeExtract) : []))
        : [];
      customMismatchCount = applyThermalCustomVerification(customRows, verifiedCustomRows, customColumns, customReviewCells);
      for (const field of customVerification.unclearFields || []) {
        if (!parsed.unclearFields.includes(field)) parsed.unclearFields.push(field);
      }
    } catch (error) {
      parsed.unclearFields.push("Custom column verification pass failed");
    }
  }
  const filteredReviewCells = {};
  const filteredCustomReviewCells = {};
  const finalRows = options.customExtraction ? [] : highConfidenceThermalRows(rows, reviewCells, filteredReviewCells);
  customRows = options.customExtraction ? highConfidenceCustomThermalRows(customRows, customColumns, customReviewCells, filteredCustomReviewCells) : customRows;
  if (!options.customExtraction) {
    Object.keys(reviewCells).forEach(key => delete reviewCells[key]);
    Object.assign(reviewCells, filteredReviewCells);
  } else {
    Object.keys(customReviewCells).forEach(key => delete customReviewCells[key]);
    Object.assign(customReviewCells, filteredCustomReviewCells);
  }
  numericMismatchCount = Object.keys(reviewCells).length;
  customMismatchCount = Object.keys(customReviewCells).length;

  return {
    status: (parsed.unclearFields && parsed.unclearFields.length) || numericMismatchCount || customMismatchCount ? "needs_verification" : "ok",
    capacitySources: parsed.capacitySources || [],
    selectedCapacitySource: options.capacitySource || parsed.selectedCapacitySource || "",
    familyModel: options.familyModel || parsed.familyModel || "",
    rows: finalRows,
    customColumns,
    customRows,
    unclearFields: parsed.unclearFields || [],
    reviewCells,
    customReviewCells,
    detectedStructure: { rowCount: 0, columns: [], notes: "" },
    numericVerificationRows: verifiedRows,
    message: numericMismatchCount || customMismatchCount
      ? `${numericMismatchCount + customMismatchCount} cell(s) need review. Rows with missing required values were excluded.`
      : parsed.message || (customRows.length ? "Requested table columns were extracted into the Export File table." : finalRows.length ? "Thermal values extracted into the Export File table." : "No high-confidence rows were detected.")
  };
}

function normalizeThermalExtractionOptions(options) {
  const customInstruction = cleanCell(options.customInstruction || "");
  const asksForColumns = /\b(custom|specific|particular|selected|only)\b.*\b(column|columns|table|field|fields)\b|\b(column|columns|field|fields)\b/i.test(customInstruction);
  return {
    ...options,
    customInstruction,
    customExtraction: !!options.customExtraction || options.mode === "custom" || asksForColumns
  };
}

async function thermalOpenAIContent(project, uploads, prompt) {
  const content = [{ type: "input_text", text: prompt }];
  for (const upload of uploads) {
    const bytes = await readUpload(`projects/${project.id}`, upload.storedName);
    if (!bytes) continue;
    const base64 = bytes.toString("base64");
    const mime = upload.mimeType || mimeTypes[path.extname(upload.originalName).toLowerCase()] || "application/octet-stream";
    if (mime.includes("pdf")) {
      content.push({
        type: "input_file",
        filename: upload.originalName,
        file_data: `data:${mime};base64,${base64}`
      });
    } else if (mime.startsWith("image/")) {
      content.push({
        type: "input_image",
        image_url: `data:${mime};base64,${base64}`
      });
    }
  }
  return content;
}

async function callOpenAIJson(name, schema, content) {
  const payload = {
    model: OPENAI_MODEL,
    input: [{ role: "user", content }],
    temperature: 0,
    text: {
      format: {
        type: "json_schema",
        name,
        strict: true,
        schema
      }
    }
  };

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = json.error ? json.error.message : `OpenAI request failed with status ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  const text = extractResponseText(json);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("OpenAI returned an unreadable extraction response.");
  }
}

function openAIExtractionError(error) {
  return {
    status: "openai_error",
    rows: [],
    unclearFields: [],
    message: error?.message || "OpenAI request failed."
  };
}

function applyThermalNumericVerification(rows, verifiedRows, reviewCells) {
  const numericColumns = [
    ["Tot Cool Cap", "totCoolCap"],
    ["Sens Cool Cap", "sensCoolCap"],
    ["Air Flow Rate", "airFlowRate"]
  ];
  let mismatchCount = 0;
  const verifiedByIdentity = new Map();
  const verifiedByIndoor = new Map();
  for (const verify of verifiedRows || []) {
    const key = thermalRowIdentityKey(verify.indoor, verify.room);
    if (key && !verifiedByIdentity.has(key)) verifiedByIdentity.set(key, verify);
    const indoorKey = thermalIdentityText(verify.indoor);
    if (indoorKey && !verifiedByIndoor.has(indoorKey)) verifiedByIndoor.set(indoorKey, verify);
  }
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const indexedVerify = verifiedRows[index] || {};
    const verify = thermalRowIdentityMatches(row, indexedVerify)
      ? indexedVerify
      : verifiedByIdentity.get(thermalRowIdentityKey(row.Indoor, row.Room)) ||
        verifiedByIndoor.get(thermalIdentityText(row.Indoor));
    if (!verify) continue;
    const firstRoom = safeExtract(row.Room);
    const secondRoom = safeExtract(verify.room);
    const rowLabel = safeExtract(row.Indoor || verify.indoor || `Row ${index + 1}`);
    if (firstRoom && secondRoom && !sameThermalLocation(firstRoom, secondRoom)) {
      const review = {
        row: index,
        column: "Room",
        first: firstRoom,
        second: secondRoom,
        reason: "Location verification mismatch",
        rowLabel
      };
      reviewCells[`${index}:Room`] = review;
      row.__reviewCells = {
        ...(row.__reviewCells || {}),
        Room: {
          reason: review.reason,
          first: firstRoom,
          second: secondRoom
        }
      };
      mismatchCount += 1;
    }
    for (const [column, key] of numericColumns) {
      const first = safeExtract(row[column]);
      const second = safeExtract(verify[key]);
      if (!isThermalNumber(first) || !isThermalNumber(second) || !sameThermalNumber(first, second)) {
        const review = {
          row: index,
          column,
          first,
          second,
          reason: thermalReviewReason(first, second),
          rowLabel
        };
        reviewCells[`${index}:${column}`] = review;
        row.__reviewCells = {
          ...(row.__reviewCells || {}),
          [column]: {
            reason: review.reason,
            first,
            second
          }
        };
        mismatchCount += 1;
      }
    }
  }
  return mismatchCount;
}

function applyThermalTargetedRetry(rows, retryRows, reviewCells) {
  const verificationColumns = new Map([
    ["Room", "room"],
    ["Tot Cool Cap", "totCoolCap"],
    ["Sens Cool Cap", "sensCoolCap"],
    ["Air Flow Rate", "airFlowRate"]
  ]);
  for (const key of Object.keys(reviewCells)) {
    const review = reviewCells[key];
    const row = rows[review.row];
    if (!row) {
      delete reviewCells[key];
      continue;
    }
    const retry = retryRows[review.row] || {};
    if (!thermalRowIdentityMatches(row, retry)) continue;
    const field = verificationColumns.get(review.column);
    if (!field) continue;
    const retryValue = safeExtract(retry?.[field]);
    const currentValue = safeExtract(row[review.column]);
    const firstValue = safeExtract(review.first);
    const secondValue = safeExtract(review.second);
    const sameAsCurrent = review.column === "Room"
      ? sameThermalLocation(retryValue, currentValue)
      : sameThermalNumber(retryValue, currentValue);
    const sameAsFirst = review.column === "Room"
      ? sameThermalLocation(retryValue, firstValue)
      : sameThermalNumber(retryValue, firstValue);
    const sameAsSecond = review.column === "Room"
      ? sameThermalLocation(retryValue, secondValue)
      : sameThermalNumber(retryValue, secondValue);
    if (review.column === "Room" ? !retryValue : !isThermalNumber(retryValue)) continue;

    if (sameAsCurrent || sameAsFirst) {
      delete reviewCells[key];
      if (row.__reviewCells) {
        delete row.__reviewCells[review.column];
        if (!Object.keys(row.__reviewCells).length) delete row.__reviewCells;
      }
      continue;
    }

    review.retry = retryValue;
    review.reason = sameAsSecond
      ? "Second pass and retry disagree with first read"
      : "Targeted retry mismatch";
    row.__reviewCells = {
      ...(row.__reviewCells || {}),
      [review.column]: {
        reason: review.reason,
        first: firstValue,
        second: secondValue,
        retry: retryValue
      }
    };
  }
}

function thermalRowIdentityMatches(row, verify) {
  if (!row || !verify) return false;
  const rowIndoor = thermalIdentityText(row.Indoor || row.indoor);
  const verifyIndoor = thermalIdentityText(verify.indoor || verify.Indoor);
  return !!rowIndoor && !!verifyIndoor && rowIndoor === verifyIndoor;
}

function thermalRowIdentityKey(indoor, room) {
  const indoorKey = thermalIdentityText(indoor);
  if (!indoorKey) return "";
  return `${indoorKey}|${thermalIdentityText(room)}`;
}

function thermalIdentityText(value) {
  return safeExtract(value).toUpperCase().replace(/[^A-Z0-9]+/g, "");
}

function applyThermalCustomVerification(customRows, verifiedRows, customColumns, customReviewCells) {
  let mismatchCount = 0;
  const numericIndexes = thermalCustomNumericColumnIndexes(customColumns);
  const locationIndexes = thermalCustomLocationColumnIndexes(customColumns);
  if (!numericIndexes.length && !locationIndexes.length) return 0;
  const identityIndexes = thermalCustomIdentityColumnIndexes(customColumns);
  for (let rowIndex = 0; rowIndex < customRows.length; rowIndex += 1) {
    const row = customRows[rowIndex] || [];
    const verify = verifiedRows[rowIndex] || [];
    if (identityIndexes.length && !thermalCustomRowIdentityMatches(row, verify, identityIndexes, customColumns)) continue;
    for (const columnIndex of locationIndexes) {
      const first = safeExtract(row[columnIndex]);
      const second = safeExtract(verify[columnIndex]);
      if (first && second && !sameThermalLocation(first, second)) {
        customReviewCells[`${rowIndex}:${customColumns[columnIndex]}`] = {
          row: rowIndex,
          column: customColumns[columnIndex],
          first,
          second,
          reason: "Location verification mismatch"
        };
        mismatchCount += 1;
      }
    }
    for (const columnIndex of numericIndexes) {
      const first = safeExtract(row[columnIndex]);
      const second = safeExtract(verify[columnIndex]);
      if (!isThermalNumber(first) || !isThermalNumber(second) || !sameThermalNumber(first, second)) {
        customReviewCells[`${rowIndex}:${customColumns[columnIndex]}`] = {
          row: rowIndex,
          column: customColumns[columnIndex],
          first,
          second,
          reason: thermalReviewReason(first, second)
        };
        mismatchCount += 1;
      }
    }
  }
  return mismatchCount;
}

function thermalCustomIdentityColumnIndexes(columns) {
  const indexes = [];
  (columns || []).forEach((column, index) => {
    const label = String(column || "").toLowerCase();
    if ((label.includes("unit") && label.includes("reference")) ||
      label.includes("reference no") ||
      label.includes("location") ||
      label === "indoor" ||
      label === "room") {
      indexes.push(index);
    }
  });
  return indexes;
}

function thermalCustomRowIdentityMatches(row, verify, identityIndexes, columns = []) {
  const unitIndexes = identityIndexes.filter(index => {
    const label = String(columns[index] || "").toLowerCase();
    return label.includes("unit") || label.includes("reference") || label === "indoor";
  });
  const indexesToUse = unitIndexes.length ? unitIndexes : identityIndexes;
  return indexesToUse.some(index => {
    const first = thermalIdentityText(row?.[index]);
    const second = thermalIdentityText(verify?.[index]);
    return first && second && first === second;
  });
}

function thermalCustomLocationColumnIndexes(columns) {
  const indexes = [];
  (columns || []).forEach((column, index) => {
    const label = String(column || "").toLowerCase();
    if (label.includes("location") || label === "room") indexes.push(index);
  });
  return indexes;
}

function highConfidenceThermalRows(rows, reviewCells, filteredReviewCells = {}) {
  const reviewsByRow = new Map();
  for (const review of Object.values(reviewCells || {})) {
    const rowIndex = Number(review.row);
    if (!reviewsByRow.has(rowIndex)) reviewsByRow.set(rowIndex, []);
    reviewsByRow.get(rowIndex).push(review);
  }
  const keptRows = [];
  (rows || []).forEach((row, index) => {
    if (!safeExtract(row.Indoor)) return false;
    const total = safeExtract(row["Tot Cool Cap"]);
    const sensible = safeExtract(row["Sens Cool Cap"]);
    const flow = safeExtract(row["Air Flow Rate"]);
    if (!isThermalNumber(total) || !isThermalNumber(sensible) || !isThermalNumber(flow)) return false;
    if (thermalNumericValue(sensible) > thermalNumericValue(total)) {
      row.__reviewCells = {
        ...(row.__reviewCells || {}),
        "Sens Cool Cap": {
          reason: "Sensible kW greater than Total kW",
          first: sensible,
          second: total
        }
      };
    }
    const { __reviewCells, ...cleanRow } = row;
    const nextIndex = keptRows.length;
    if (__reviewCells) cleanRow.__reviewCells = __reviewCells;
    for (const review of reviewsByRow.get(index) || []) {
      filteredReviewCells[`${nextIndex}:${review.column}`] = {
        ...review,
        row: nextIndex
      };
    }
    if (row.__reviewCells?.["Sens Cool Cap"]) {
      filteredReviewCells[`${nextIndex}:Sens Cool Cap`] = {
        row: nextIndex,
        column: "Sens Cool Cap",
        first: sensible,
        second: total,
        reason: "Sensible kW greater than Total kW",
        rowLabel: safeExtract(row.Indoor || `Row ${index + 1}`)
      };
    }
    keptRows.push(cleanRow);
  });
  return keptRows;
}

function highConfidenceCustomThermalRows(customRows, customColumns, customReviewCells, filteredCustomReviewCells = {}) {
  const requiredIndexes = thermalCustomNumericColumnIndexes(customColumns);
  if (!requiredIndexes.length) return customRows;
  const reviewsByRow = new Map();
  for (const review of Object.values(customReviewCells || {})) {
    const rowIndex = Number(review.row);
    if (!reviewsByRow.has(rowIndex)) reviewsByRow.set(rowIndex, []);
    reviewsByRow.get(rowIndex).push(review);
  }
  const totalIndex = customColumns.findIndex(column => /total/i.test(column) && /kw|load|capacity|cap/i.test(column));
  const sensibleIndex = customColumns.findIndex(column => /sens/i.test(column) && /kw|load|capacity|cap/i.test(column));
  const keptRows = [];
  (customRows || []).forEach((row, rowIndex) => {
    for (const columnIndex of requiredIndexes) {
      if (!isThermalNumber(row[columnIndex])) return false;
    }
    const nextIndex = keptRows.length;
    for (const review of reviewsByRow.get(rowIndex) || []) {
      filteredCustomReviewCells[`${nextIndex}:${review.column}`] = {
        ...review,
        row: nextIndex
      };
    }
    if (totalIndex >= 0 && sensibleIndex >= 0) {
      const sensible = row[sensibleIndex];
      const total = row[totalIndex];
      if (thermalNumericValue(sensible) > thermalNumericValue(total)) {
        filteredCustomReviewCells[`${nextIndex}:${customColumns[sensibleIndex]}`] = {
          row: nextIndex,
          column: customColumns[sensibleIndex],
          first: safeExtract(sensible),
          second: safeExtract(total),
          reason: "Sensible kW greater than Total kW"
        };
      }
    }
    keptRows.push(row);
  });
  return keptRows;
}

function thermalCustomNumericColumnIndexes(columns) {
  const indexes = [];
  (columns || []).forEach((column, index) => {
    const label = String(column || "").toLowerCase();
    if ((label.includes("total") && (label.includes("kw") || label.includes("load") || label.includes("cap"))) ||
      label.includes("sensible") ||
      label.includes("sens") ||
      label.includes("flow")) {
      indexes.push(index);
    }
  });
  return indexes;
}

function thermalNumericValue(value) {
  const cleaned = safeExtract(value).replace(/,/g, "").trim();
  return /^-?\d+(?:\.\d+)?$/.test(cleaned) ? Number(cleaned) : NaN;
}

function isThermalNumber(value) {
  return Number.isFinite(thermalNumericValue(value));
}

function sameThermalNumber(a, b) {
  const first = thermalNumericValue(a);
  const second = thermalNumericValue(b);
  return Number.isFinite(first) && Number.isFinite(second) && Math.abs(first - second) < 0.005;
}

function sameThermalLocation(a, b) {
  const first = thermalLocationText(a);
  const second = thermalLocationText(b);
  if (!first || !second) return false;
  return first === second;
}

function thermalLocationText(value) {
  return safeExtract(value)
    .toUpperCase()
    .replace(/\bAND\b/g, "")
    .replace(/[^A-Z0-9]+/g, "");
}

function thermalReviewReason(first, second) {
  if (!isThermalNumber(first) && !isThermalNumber(second)) return "Both extraction passes unclear";
  if (!isThermalNumber(first)) return "First pass unclear";
  if (!isThermalNumber(second)) return "Second pass unclear";
  return "Independent verification mismatch";
}

function thermalStructurePrompt(options) {
  return `
You are reading a scanned HVAC Thermal Load Sheet or screenshot before extraction.

Task:
- Identify the main visible table structure.
- Count only actual data rows, not headers, totals, blank lines, or notes.
- Detect the lowest-level column headers exactly as visible.
- Detect merged/hierarchical headers and explain them briefly in notes.
- Do not extract cell values in this pass.

User extraction request:
${options.customInstruction || (options.customExtraction ? "Custom requested columns/table." : "Regular VRV thermal export.")}

Return JSON only.`;
}

function thermalPrompt(options) {
  if (options.customExtraction) {
    return `
You are an accurate table extraction assistant for scanned PDFs and screenshots.

The user wants a custom table extraction, not the regular VRV thermal export template.
User request:
${options.customInstruction || "Extract the requested table and columns."}

Rules:
- Extract only the table(s), columns, and rows requested by the user.
- If the user asks for specific columns, return only those columns in customColumns, in the requested order.
- If the user asks for a particular table but not exact columns, return the visible table columns.
- If extracting thermal load columns such as Units Reference No., Location, Total kW, Sensible kW, and Flow Rate, include only rows where Total kW, Sensible kW, and Flow Rate are all visible.
- Ignore section/header rows and rows where Total kW, Sensible kW, or Flow Rate is blank.
- Preserve row order exactly.
- Transcribe values exactly as visible.
- Do not calculate, infer, auto-correct, or guess.
- For decimal values, read digit by digit and preserve exact decimal places. Return "1.0" as "1.0", not "1" or "1.1".
- Preserve values as strings exactly as shown; do not round, correct, merge, or deduplicate.
- If OCR confidence is uncertain, leave that cell as an empty string and list it in unclearFields.
- Never guess, infer, or hallucinate unclear values.
- Do not use values from Area, No. of People, Outdoor Air, Occupant Density, or DCV columns as Total/Sensible/Flow values.
- If Sensible kW is greater than Total kW, keep the visible values and mark that cell for review; do not blank or discard the row only for that reason.
- Leave the regular rows array empty for custom extraction.
- Set capacitySources to [], selectedCapacitySource to "", and familyModel to "".
- Return JSON only.`;
  }
  return `
You are an HVAC Schedule Extractor specialized in scanned Thermal Load Sheets.
Priority is extraction accuracy, especially for numeric values.

Follow this workflow:
- Detect multi-row, merged, and hierarchical headers.
- Use lowest-level child headers as extractable columns.
- Preserve all rows exactly; never merge, deduplicate, or remove rows.
- Read every visible row continuously from top to bottom. Do not stop after the first few rows.
- Include only rows where Unit Reference No., Total kW, Sensible kW, and Flow Rate are all visible.
- Ignore rows where Total kW, Sensible kW, or Flow Rate is blank.
- Include all units.
- Detect capacity sources containing both Total kW and Sensible kW.
- Capacity source selected by user: ${options.capacitySource || "auto if only one exists"}.
- Family or Model selected by user: ${options.familyModel || "not specified; leave Family or Model blank"}.

Extract these source fields when available:
- Unit Reference No.
- Location.
- Calculated AC Load Total kW and Sensible kW.
- First Selection Total kW and Sensible kW.
- Second Selection Total kW and Sensible kW.
- Air Flow Rate.

Generate rows for this final table mapping:
- indoor = Unit Reference No.
- room = Location.
- totCoolCap = selected source Total kW.
- sensCoolCap = selected source Sensible kW.
- airFlowRate = Air Flow Rate.

Numeric accuracy rules:
- Use OCR text and visual inspection together. If they disagree, leave the value blank.
- Transcribe values exactly as visible.
- For decimal values, read digit by digit.
- Preserve numeric values exactly as shown, including decimal places and trailing zeros.
- Return "1.0" as "1.0", not "1" or "1.1".
- Never round.
- Never truncate trailing zeros.
- Never remove decimal points.
- Do not calculate or derive any value from another column.
- Do not infer missing digits.
- If OCR confidence is uncertain, leave that cell as an empty string and list it in unclearFields.
- Never guess, infer, or hallucinate unclear values.
- Do not use values from Area, No. of People, Outdoor Air, Occupant Density, or DCV columns as load values.
- If Sensible kW is greater than Total kW, keep the visible values and mark that cell for review; do not blank or discard the row only for that reason.
- Flow Rate must come from the Flow Rate L/s column only.

If screenshots are uploaded with the PDF, use screenshots to clarify unreadable values.
Return JSON only.`;
}

function thermalNumericVerificationPrompt(options, rows = []) {
  const rowAnchors = rows
    .map((row, index) => `${index + 1}. Unit Reference: "${safeExtract(row.Indoor)}"; Location: "${safeExtract(row.Room)}"`)
    .join("\n");
  return `
You are doing a second independent verification pass for a scanned HVAC Thermal Load Sheet.

Important:
- Do not use or infer from any previous extraction.
- Read directly from the uploaded PDF/image again.
- Verify Location and numeric values only after matching the same row identity.
- Use the first-pass row list below as row anchors. Match by Unit Reference No. first, then Location.
- If you cannot confidently find the same Unit Reference No. row, return empty numeric values for that row.
- Do not read a nearby row or nearby column if the row identity is uncertain.
- Use OCR text and visual inspection together. If they disagree or a digit is unclear, return an empty string.

Selected capacity source: ${options.capacitySource || "auto if only one exists"}.

First-pass row anchors to verify:
${rowAnchors || "- No rows"}

For each row anchor above, return one row in the same order:
- indoor = Unit Reference No. exactly as visible.
- room = Location exactly as visible.
- totCoolCap = selected source Total kW exactly as visible.
- sensCoolCap = selected source Sensible kW exactly as visible.
- airFlowRate = Air Flow Rate exactly as visible.

Rules:
- Do not calculate.
- Do not guess.
- Do not auto-correct.
- Read decimal values digit by digit.
- Preserve exact decimal places. Return "1.0" as "1.0", not "1" or "1.1".
- Preserve the row anchor order exactly.
- If Location or any numeric cell is not clearly readable, return "" for that cell and list it in unclearFields.

Return JSON only.`;
}

function thermalTargetedRetryPrompt(options, retryCells) {
  const lines = retryCells
    .map(cell => `- Visible table row ${Number(cell.row) + 1} (${cell.rowLabel}), column "${cell.column}"`)
    .join("\n");
  return `
You are doing a targeted retry for unclear thermal sheet cells.

Read the uploaded image/PDF again and inspect only these cells:
${lines}

Rules:
- Use the target row number/order from the visible table.
- Verify the same row before reading the requested numeric column.
- Use OCR text and visual inspection together. If they disagree or a digit is unclear, return an empty string.
- Return the exact visible value with the same decimal places.
- If Location was requested, return the exact visible Location text for the same row.
- Do not calculate or infer values from other columns.
- If the target cell is truly unreadable or blank, return "" and list it in unclearFields.

Selected capacity source: ${options.capacitySource || "auto if only one exists"}.

Return rows with:
- indoor = the visible Unit Reference No. for that row, if present.
- room = the visible Location for that row, if present.
- totCoolCap only when Total kW was requested.
- sensCoolCap only when Sensible kW was requested.
- airFlowRate only when Air Flow Rate was requested.

Return JSON only.`;
}

function thermalCustomVerificationPrompt(options, customColumns) {
  return `
You are doing a second independent verification pass for a scanned table extraction.

Important:
- Do not use or infer from any previous extraction.
- Read directly from the uploaded PDF/image again.
- Verify only these requested columns, in this exact order:
${customColumns.map(column => `- ${column}`).join("\n")}

Rules:
- Transcribe values exactly as visible.
- Do not calculate.
- Do not guess.
- Do not auto-correct.
- Preserve exact decimal places and trailing zeros.
- If OCR text is weak but the image is clear, trust the image.
- If any cell is not visible/readable, return "" for that cell and list it in unclearFields.

Return JSON only.`;
}

function thermalStructureJsonSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      rowCount: { type: "number" },
      columns: { type: "array", items: { type: "string" } },
      notes: { type: "string" }
    },
    required: ["rowCount", "columns", "notes"]
  };
}

function thermalJsonSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      capacitySources: { type: "array", items: { type: "string" } },
      selectedCapacitySource: { type: "string" },
      familyModel: { type: "string" },
      rows: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            indoor: { type: "string" },
            room: { type: "string" },
            totCoolCap: { type: "string" },
            sensCoolCap: { type: "string" },
            airFlowRate: { type: "string" }
          },
          required: ["indoor", "room", "totCoolCap", "sensCoolCap", "airFlowRate"]
        }
      },
      customColumns: { type: "array", items: { type: "string" } },
      customRows: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            cells: { type: "array", items: { type: "string" } }
          },
          required: ["cells"]
        }
      },
      unclearFields: { type: "array", items: { type: "string" } },
      message: { type: "string" }
    },
    required: ["capacitySources", "selectedCapacitySource", "familyModel", "rows", "customColumns", "customRows", "unclearFields", "message"]
  };
}

function thermalCustomVerificationJsonSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      customRows: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            cells: { type: "array", items: { type: "string" } }
          },
          required: ["cells"]
        }
      },
      unclearFields: { type: "array", items: { type: "string" } },
      message: { type: "string" }
    },
    required: ["customRows", "unclearFields", "message"]
  };
}

function thermalNumericVerificationJsonSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      rows: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            indoor: { type: "string" },
            room: { type: "string" },
            totCoolCap: { type: "string" },
            sensCoolCap: { type: "string" },
            airFlowRate: { type: "string" }
          },
          required: ["indoor", "room", "totCoolCap", "sensCoolCap", "airFlowRate"]
        }
      },
      unclearFields: { type: "array", items: { type: "string" } },
      message: { type: "string" }
    },
    required: ["rows", "unclearFields", "message"]
  };
}

function extractResponseText(response) {
  if (typeof response.output_text === "string") return response.output_text;
  const chunks = [];
  for (const item of response.output || []) {
    for (const content of item.content || []) {
      if (content.type === "output_text" && content.text) chunks.push(content.text);
    }
  }
  return chunks.join("");
}

function safeExtract(value) {
  const text = String(value == null ? "" : value).trim();
  return text || "";
}

function inventoryNorm(value) {
  return String(value || "").toUpperCase().replace(/[\s_\-]/g, "");
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function manualStockDateCode(dateValue) {
  const match = String(dateValue || todayISO()).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return manualStockDateCode(todayISO());
  return `${match[3]}${match[2]}${match[1]}`;
}

function nextManualStockNo(inventory, dateValue) {
  const dateCode = manualStockDateCode(dateValue);
  const pattern = new RegExp(`^Stock ${dateCode}(\\d{2})$`, "i");
  let maxSuffix = -1;
  for (const dn of inventory.supplierDns || []) {
    const match = String(dn.supplierDnNo || "").match(pattern);
    if (match) maxSuffix = Math.max(maxSuffix, Number(match[1]));
  }
  return `Stock ${dateCode}${String(maxSuffix + 1).padStart(2, "0")}`;
}

function ensureManualStockNumbers(inventory) {
  const usedByDate = {};
  let changed = false;
  for (const dn of inventory.supplierDns || []) {
    if (!dn.isManualAdjustment) continue;
    const dateCode = manualStockDateCode(dn.uploadedDate);
    usedByDate[dateCode] = usedByDate[dateCode] || new Set();
    const existing = String(dn.supplierDnNo || "").match(new RegExp(`^Stock ${dateCode}(\\d{2})$`, "i"));
    if (existing && !usedByDate[dateCode].has(existing[1])) {
      usedByDate[dateCode].add(existing[1]);
      continue;
    }
    let suffix = 0;
    while (usedByDate[dateCode].has(String(suffix).padStart(2, "0"))) suffix += 1;
    const suffixText = String(suffix).padStart(2, "0");
    dn.supplierDnNo = `Stock ${dateCode}${suffixText}`;
    usedByDate[dateCode].add(suffixText);
    changed = true;
  }
  return changed;
}

function findModel(inventory, modelNo) {
  return inventory.models.find(model => inventoryNorm(model.modelNo) === inventoryNorm(modelNo));
}

function stockModelMatchKey(value) {
  return inventoryNorm(value).replace(/[OQ]/g, "0").replace(/[IL]/g, "1");
}

function supplierModelCorrectionCandidates(value) {
  const cleaned = inventoryNorm(value);
  const candidates = new Set([cleaned]);
  if (cleaned.startsWith("FXQA")) candidates.add(`FXAQ${cleaned.slice(4)}`);
  if (cleaned.startsWith("FX0A")) candidates.add(`FXOA${cleaned.slice(4)}`);
  return [...candidates].filter(Boolean);
}

function isSingleAdjacentSwap(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  const mismatch = [];
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) mismatch.push(index);
    if (mismatch.length > 2) return false;
  }
  return mismatch.length === 2
    && mismatch[1] === mismatch[0] + 1
    && a[mismatch[0]] === b[mismatch[1]]
    && a[mismatch[1]] === b[mismatch[0]];
}

function levenshteinDistance(a, b) {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  const current = Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    current[0] = i;
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    for (let j = 0; j <= b.length; j++) previous[j] = current[j];
  }
  return previous[b.length];
}

function resolveSupplierStockModel(inventory, modelNo) {
  const cleaned = cleanCell(modelNo || "").toUpperCase();
  if (!cleaned) return null;
  const candidates = supplierModelCorrectionCandidates(cleaned);
  const models = inventory.models || [];
  for (const candidate of candidates) {
    const exact = findModel(inventory, candidate);
    if (exact) return exact;
  }
  for (const candidate of candidates) {
    const target = stockModelMatchKey(candidate);
    const loose = models.find(model => stockModelMatchKey(model.modelNo) === target);
    if (loose) return loose;
  }
  let best = null;
  for (const candidate of candidates) {
    const target = stockModelMatchKey(candidate);
    const rawTarget = inventoryNorm(candidate);
    for (const model of models) {
      const modelKey = stockModelMatchKey(model.modelNo);
      const rawModel = inventoryNorm(model.modelNo);
      if (Math.abs(modelKey.length - target.length) > 1) continue;
      const distance = isSingleAdjacentSwap(rawTarget, rawModel) ? 0.5 : levenshteinDistance(target, modelKey);
      if (distance <= 1 && (!best || distance < best.distance)) best = { model, distance };
    }
  }
  return best?.model || null;
}

function normalizeSupplierLine(line) {
  const detectedQty = Number(line.detectedQty ?? line.quantity ?? line.qty ?? 0) || 0;
  const finalQty = Number(line.finalQty ?? detectedQty) || 0;
  return {
    id: line.id || id(),
    modelNo: cleanCell(line.modelNo || line.model || line.unitName || "").toUpperCase(),
    description: cleanCell(line.description || ""),
    detectedQty,
    finalQty,
    status: line.status || (line.modelNo ? "Ready" : "Check Needed")
  };
}

function enrichSupplierLinesFromStock(inventory, lines = []) {
  return lines.map(line => {
    const next = normalizeSupplierLine(line);
    if (!next.modelNo) return { ...next, status: "Check Needed" };
    const model = resolveSupplierStockModel(inventory, next.modelNo);
    if (model) {
      next.modelNo = model.modelNo || next.modelNo;
      next.description = model.description || next.description || "";
      if (next.status === "Not in Stock" || next.status === "Ready" || !next.status) next.status = "Detected";
    } else {
      next.status = "Not in Stock";
    }
    return next;
  });
}

function combineSupplierLines(lines) {
  const byModel = new Map();
  for (const raw of lines) {
    const line = normalizeSupplierLine(raw);
    if (!line.modelNo) continue;
    const key = inventoryNorm(line.modelNo);
    if (!byModel.has(key)) byModel.set(key, line);
    else {
      const existing = byModel.get(key);
      existing.detectedQty += Number(line.detectedQty || 0);
      existing.finalQty += Number(line.finalQty || 0);
      if (!existing.description && line.description) existing.description = line.description;
      if (line.status === "Check Needed") existing.status = "Check Needed";
    }
  }
  return [...byModel.values()];
}

function normalizeDeliveryNote(body, inventory) {
  const dnNo = body.dnNo || inventory.settings.nextDeliveryNo || "DN-2057";
  return {
    id: body.id || id(),
    dnNo,
    date: body.date || todayISO(),
    customerId: body.customerId || "",
    customerName: body.customerName || "",
    contactPerson: body.contactPerson || "",
    phone: body.phone || "",
    deliveryLocation: body.deliveryLocation || "",
    projectName: body.projectName || "",
    status: body.status || "Draft",
    lines: (body.lines || []).map(line => ({
      id: line.id || id(),
      modelNo: cleanCell(line.modelNo || "").toUpperCase(),
      description: cleanCell(line.description || ""),
      availableQty: Number(line.availableQty || 0),
      qtyGoingOut: Number(line.qtyGoingOut || 0)
    })).filter(line => line.modelNo && line.qtyGoingOut > 0)
  };
}

function nextDeliveryNoFrom(current) {
  const match = String(current || "DN-2057").match(/^(.*?)(\d+)$/);
  if (!match) return current || "DN-2057";
  const prefix = match[1];
  const number = match[2];
  return `${prefix}${String(Number(number) + 1).padStart(number.length, "0")}`;
}

function nextPoNoFrom(current) {
  const fallback = `PO-${new Date().getFullYear()}-0001`;
  const match = String(current || fallback).match(/^(.*?)(\d+)$/);
  if (!match) return fallback;
  const prefix = match[1];
  const number = match[2];
  return `${prefix}${String(Number(number) + 1).padStart(number.length, "0")}`;
}

function nextPurchaseNoFromOrders(orders = []) {
  const year = new Date().getFullYear();
  let max = 0;
  for (const order of orders) {
    if (order.status !== "Created") continue;
    const match = String(order.poNo || "").match(/^PO-(\d{4})-(\d+)$/i);
    if (match && Number(match[1]) === year) max = Math.max(max, Number(match[2]));
  }
  return `PO-${year}-${String(max + 1).padStart(4, "0")}`;
}

function purchaseOrderView(store) {
  return {
    settings: store.settings || defaultPurchaseOrders().settings,
    orders: (store.orders || []).map(order => normalizePurchaseOrder(order, store, false)).sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || ""))),
    suppliers: (store.suppliers || []).map(normalizePurchaseSupplier).sort((a, b) => a.supplierName.localeCompare(b.supplierName)),
    uploads: store.uploads || []
  };
}

function normalizePurchaseSupplier(input = {}) {
  const now = new Date().toISOString();
  return {
    id: input.id || id(),
    supplierName: cleanCell(input.supplierName || input.name),
    contactPerson: cleanCell(input.contactPerson),
    phone: cleanCell(input.phone),
    email: cleanCell(input.email),
    address: cleanCell(input.address || input.supplierAddress),
    trn: cleanCell(input.trn || input.supplierTrn),
    deliveryTerms: cleanCell(input.deliveryTerms),
    paymentTerms: cleanCell(input.paymentTerms),
    createdAt: input.createdAt || now,
    updatedAt: now
  };
}

function normalizePurchasePaymentTerms(value) {
  const text = cleanCell(value);
  const lower = text.toLowerCase();
  if (!text) return "";
  if (/\b(cash|cdc|c\.d\.c|current\s+dated)\b/.test(lower)) return "CDC";
  if (/\b15\b/.test(lower) && /\b(day|days|pdc)\b/.test(lower)) return "15 Days PDC";
  if (/\b30\b/.test(lower) && /\b(day|days|pdc)\b/.test(lower)) return "30 Days PDC";
  if (/\b60\b/.test(lower) && /\b(day|days|pdc)\b/.test(lower)) return "60 Days PDC";
  if (/\b90\b/.test(lower) && /\b(day|days|pdc)\b/.test(lower)) return "90 Days PDC";
  return text;
}

function findMatchingPurchaseSupplier(store = {}, supplierName = "") {
  const supplierMatchKey = value => String(value || "").toUpperCase().replace(/[^A-Z0-9]+/g, "");
  const key = supplierMatchKey(supplierName);
  if (!key) return null;
  return (store.suppliers || [])
    .map(normalizePurchaseSupplier)
    .find(supplier => supplierMatchKey(supplier.supplierName) === key) || null;
}

function mergeScannedPurchaseSupplierDetails(extracted = {}, store = {}) {
  const supplier = findMatchingPurchaseSupplier(store, extracted.supplierName || extracted.name || "");
  if (!supplier) return extracted;
  const scannedPaymentTerms = cleanCell(extracted.paymentTerms);
  const savedPaymentTerms = cleanCell(supplier.paymentTerms);
  return {
    ...extracted,
    supplierName: supplier.supplierName || cleanCell(extracted.supplierName),
    supplierAddress: cleanCell(extracted.supplierAddress || extracted.address) || supplier.address || "",
    address: cleanCell(extracted.address || extracted.supplierAddress) || supplier.address || "",
    trn: cleanCell(extracted.trn || extracted.supplierTrn || extracted.supplierTRN) || supplier.trn || "",
    supplierTrn: cleanCell(extracted.supplierTrn || extracted.trn || extracted.supplierTRN) || supplier.trn || "",
    paymentTerms: savedPaymentTerms || scannedPaymentTerms
  };
}

function normalizePurchaseOrder(input = {}, store = defaultPurchaseOrders(), createOfficial = false) {
  const now = new Date().toISOString();
  const order = {
    id: input.id || id(),
    poNo: input.poNo || "",
    status: createOfficial ? "Created" : cleanCell(input.status || "Draft"),
    supplierName: cleanCell(input.supplierName),
    supplierAddress: cleanCell(input.supplierAddress || input.address),
    trn: cleanCell(input.trn || input.supplierTrn || input.supplierTRN),
    quotationNo: cleanCell(input.quotationNo || input.quotationNumber),
    quotationDate: parseServerDate(input.quotationDate),
    purchaseRepresentative: cleanCell(input.purchaseRepresentative),
    poDate: parseServerDate(input.poDate) || todayISO(),
    projectName: cleanCell(input.projectName),
    deliveryTerms: cleanCell(input.deliveryTerms),
    paymentTerms: normalizePurchasePaymentTerms(input.paymentTerms),
    manualSubtotal: cleanCell(input.manualSubtotal),
    discount: Number(String(input.discount || "").replace(/,/g, "")) || 0,
    notes: cleanMultilineCell(input.notes) || DEFAULT_PURCHASE_NOTES,
    sourceUploadId: input.sourceUploadId || "",
    createdAt: input.createdAt || now,
    updatedAt: input.updatedAt || now,
    items: (input.items || input.lines || []).map(normalizePurchaseItem).filter(item => item.description || item.modelNo || item.qty || item.unitPrice)
  };
  if (!order.items.length) order.items = [normalizePurchaseItem({})];
  recalcPurchaseOrderServer(order);
  return order;
}

function normalizePurchaseItem(item = {}) {
  const modelNo = cleanCell(item.modelNo || item.modelNumber || item.model);
  const description = combinePurchaseDescriptionParts([
    item.description || item.itemDescription || item.item,
    item.size || item.dimension || item.dimensions,
    modelNo,
    item.remarks || item.remark || item.notes
  ]);
  return {
    id: item.id || id(),
    description,
    modelNo,
    qty: Number(item.qty || item.quantity || 0),
    unitPrice: Number(item.unitPrice || item.unitPriceAed || item.rate || 0),
    vatPercent: purchaseVatPercentServer(item.vatPercent ?? item.vat ?? item.vatPercentage),
    amount: Number(item.amount || 0)
  };
}

function combinePurchaseDescriptionParts(parts = []) {
  const output = [];
  for (const raw of parts) {
    const part = cleanCell(raw);
    if (!part) continue;
    const normalizedPart = part.toLowerCase().replace(/\s+/g, " ").trim();
    const alreadyIncluded = output.some(existing => {
      const normalizedExisting = existing.toLowerCase().replace(/\s+/g, " ").trim();
      return normalizedExisting === normalizedPart || normalizedExisting.includes(normalizedPart);
    });
    if (!alreadyIncluded) output.push(part);
  }
  return output.join(" - ");
}

function recalcPurchaseOrderServer(order) {
  let subtotal = 0;
  let vatTotal = 0;
  for (const item of order.items || []) {
    item.vatPercent = purchaseVatPercentServer(item.vatPercent);
    const base = Number(item.qty || 0) * Number(item.unitPrice || 0);
    const vat = base * (item.vatPercent / 100);
    item.amount = base;
    subtotal += base;
    vatTotal += vat;
  }
  const hasManualSubtotal = String(order.manualSubtotal || "").trim() !== "";
  const finalSubtotal = hasManualSubtotal ? Number(String(order.manualSubtotal).replace(/,/g, "")) || 0 : subtotal;
  const vatRate = subtotal > 0 ? vatTotal / subtotal : averagePurchaseVatRate(order.items);
  const discount = Number(String(order.discount || "").replace(/,/g, "")) || 0;
  const totalAfterDiscount = finalSubtotal - discount;
  const taxable = Math.max(0, totalAfterDiscount);
  order.subtotal = finalSubtotal;
  order.discount = discount;
  order.totalAfterDiscount = totalAfterDiscount;
  order.vatTotal = taxable * vatRate;
  order.grandTotal = taxable + order.vatTotal;
}

function purchaseVatPercentServer(value) {
  const rate = Number(value);
  return Number.isFinite(rate) && rate > 0 ? rate : 5;
}

function averagePurchaseVatRate(items = []) {
  const rates = (items || []).map(item => Number(item.vatPercent || 0)).filter(rate => Number.isFinite(rate) && rate > 0);
  const rate = rates.length ? rates.reduce((sum, item) => sum + item, 0) / rates.length : 5;
  return rate / 100;
}

function parseServerDate(value) {
  const text = String(value || "").trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  return "";
}

function computeInventory(inventory, projectReservations = {}) {
  const lots = [];
  for (const dn of inventory.supplierDns || []) {
    if (dn.status !== "Confirmed") continue;
    for (const line of dn.lines || []) {
      lots.push({
        lotId: `${dn.id}:${line.id}`,
        date: dn.uploadedDate,
        modelNo: line.modelNo,
        description: line.description,
        projectName: dn.projectName,
        supplierDnNo: dn.supplierDnNo,
        isManualAdjustment: !!dn.isManualAdjustment,
        receivedQty: Number(line.finalQty || 0),
        deliveredQty: 0,
        availableQty: Number(line.finalQty || 0)
      });
    }
  }
  lots.sort((a, b) => String(a.date).localeCompare(String(b.date)));

  const movements = [];
  for (const lot of lots) {
    movements.push({
      date: lot.date,
      modelNo: lot.modelNo,
      description: lot.description,
      projectName: lot.projectName,
      referenceNo: lot.supplierDnNo,
      movementType: lot.isManualAdjustment ? "Manual Adjustment" : "Supplier DN Confirmed",
      quantity: lot.receivedQty,
      availableQty: lot.availableQty
    });
  }

  for (const dn of inventory.deliveryNotes || []) {
    if (dn.status !== "Issued" && dn.status !== "Delivered") continue;
    for (const line of dn.lines || []) {
      let remaining = Number(line.qtyGoingOut || 0);
      const modelLots = lots.filter(lot => inventoryNorm(lot.modelNo) === inventoryNorm(line.modelNo) && lot.availableQty > 0);
      for (const lot of modelLots) {
        if (remaining <= 0) break;
        const used = Math.min(lot.availableQty, remaining);
        lot.availableQty -= used;
        lot.deliveredQty += used;
        remaining -= used;
      }
      movements.push({
        date: dn.date,
        modelNo: line.modelNo,
        description: line.description,
        projectName: dn.projectName,
        referenceNo: dn.dnNo,
        movementType: "Delivery Note Delivered",
        quantity: -Number(line.qtyGoingOut || 0),
        availableQty: 0
      });
    }
  }

  const stockByModel = {};
  for (const model of inventory.models || []) {
    stockByModel[inventoryNorm(model.modelNo)] = {
      modelNo: model.modelNo,
      description: model.description,
      qty: 0,
      reservedQty: Math.max(0, Number(model.reservedQty || 0)),
      freeStock: 0,
      minimumStock: Number(model.minimumStock || 0)
    };
  }
  for (const lot of lots) {
    const key = inventoryNorm(lot.modelNo);
    if (!stockByModel[key]) stockByModel[key] = { modelNo: lot.modelNo, description: lot.description, qty: 0, reservedQty: 0, freeStock: 0, minimumStock: 0 };
    stockByModel[key].qty += lot.availableQty;
    if (!stockByModel[key].description && lot.description) stockByModel[key].description = lot.description;
  }
  Object.values(stockByModel).forEach(item => {
    const projectReservedQty = Math.max(0, Number(projectReservations[inventoryNorm(item.modelNo)] || 0));
    item.reservedQty = Number(item.reservedQty || 0) + projectReservedQty;
    item.freeStock = Number(item.qty || 0) - Number(item.reservedQty || 0);
  });
  for (const movement of movements) {
    const key = inventoryNorm(movement.modelNo);
    if (stockByModel[key]) movement.availableQty = stockByModel[key].qty;
  }
  return { lots, stockByModel, movements };
}

function salesProjectReservations(projects = []) {
  return (projects || []).reduce((reserved, project) => {
    const status = inventoryNorm(project.status || "");
    if (["COMPLETED", "LOST", "LOSTCLOSED", "CLOSED"].includes(status)) return reserved;
    for (const row of project.boq || project.items || []) {
      if (!(row.reserve || row.reserveStock)) continue;
      const modelNo = cleanCell(row.model || row.modelNo || "");
      if (!modelNo) continue;
      const key = inventoryNorm(modelNo);
      const qty = Number(row.qty || row.quantity || 0) || 0;
      const deliveredQty = Number(row.deliveredQty || 0) || 0;
      const reserveQty = Math.max(0, qty - deliveredQty);
      if (!reserveQty) continue;
      reserved[key] = (reserved[key] || 0) + reserveQty;
    }
    return reserved;
  }, {});
}

async function inventoryView(inventory) {
  ensureManualStockNumbers(inventory);
  const salesStore = await readSalesCrm();
  const computed = computeInventory(inventory, salesProjectReservations(salesStore.projects || []));
  const stock = Object.values(computed.stockByModel).sort((a, b) => a.modelNo.localeCompare(b.modelNo));
  const lowStock = stock.filter(item => item.minimumStock && item.qty < item.minimumStock);
  const pendingReview = (inventory.supplierDns || []).filter(dn => dn.status === "Review Needed").length;
  return {
    settings: inventory.settings,
    models: inventory.models,
    customers: mergedInventoryCustomers(inventory.customers || [], salesStore.customers || []),
    supplierDns: inventory.supplierDns || [],
    deliveryNotes: inventory.deliveryNotes,
    dashboard: {
      totalModels: stock.length,
      totalStockUnits: stock.reduce((sum, item) => sum + Number(item.qty || 0), 0),
      lowStockModels: lowStock.length,
      pendingReview,
      stock,
      lowStock,
      recentIn: computed.movements.filter(m => m.quantity > 0).slice(-3).reverse(),
      recentOut: computed.movements.filter(m => m.quantity < 0).slice(-3).reverse(),
      lots: computed.lots,
      movements: computed.movements
    }
  };
}

async function extractSupplierDnWithOpenAI(filePart, uploadId, inventory = null) {
  if (!process.env.OPENAI_API_KEY) {
    return { supplierDnNo: "", projectName: "", lines: [], message: "OpenAI API key is missing. Add rows manually or configure OPENAI_API_KEY." };
  }
  const mime = filePart.mimeType || "application/octet-stream";
  const base64 = filePart.body.toString("base64");
  const stockModels = (inventory?.models || [])
    .map(model => cleanCell(model.modelNo || ""))
    .filter(Boolean)
    .slice(0, 700)
    .join(", ");
  const modelListRule = stockModels
    ? `Known stock model numbers are: ${stockModels}. Compare every detected model against this list and output the exact known stock model spelling when it clearly matches.`
    : "";
  const content = [{ type: "input_text", text: `Extract supplier delivery note data for AC unit stock only. Return JSON with supplierDnNo, projectName, lines [{modelNo, description, detectedQty, finalQty, status}]. Combine duplicate models. No prices. ${modelListRule} Be extra careful with Daikin model letter order: FXAQ is a valid family and must not be transposed as FXQA. If a model is unclear, keep the closest text you can read and mark it for review instead of inventing a model.` }];
  if (mime.includes("pdf")) content.push({ type: "input_file", filename: filePart.filename, file_data: `data:${mime};base64,${base64}` });
  else if (mime.startsWith("image/")) content.push({ type: "input_image", image_url: `data:${mime};base64,${base64}` });
  else return { supplierDnNo: "", projectName: "", lines: [], message: "Unsupported file type for OCR. Add rows manually." };
  const payload = {
    model: OPENAI_MODEL,
    input: [{ role: "user", content }],
    temperature: 0,
    text: { format: { type: "json_schema", name: "supplier_dn_extract", strict: true, schema: supplierDnSchema() } }
  };
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) return { supplierDnNo: "", projectName: "", lines: [], message: json.error?.message || "OpenAI extraction failed." };
  try {
    return JSON.parse(extractResponseText(json));
  } catch {
    return { supplierDnNo: "", projectName: "", lines: [], message: "OCR response could not be parsed." };
  }
}

function supplierDnSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      supplierDnNo: { type: "string" },
      projectName: { type: "string" },
      lines: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            modelNo: { type: "string" },
            description: { type: "string" },
            detectedQty: { type: "number" },
            finalQty: { type: "number" },
            status: { type: "string" }
          },
          required: ["modelNo", "description", "detectedQty", "finalQty", "status"]
        }
      },
      message: { type: "string" }
    },
    required: ["supplierDnNo", "projectName", "lines", "message"]
  };
}

function areaCalculationVisionWorkflowPrompt() {
  return `Vision reading workflow:
1. Build a page layout map before extracting numbers. List every circled/numbered item in visual reading order, including small, edge, partial, repeated, or crowded items.
2. Identify fitting type from the sketch shape before trusting OCR text: STR, RED, ELB, SHOENECK, END, Y Piece, PLENUM, OFF, TEE, BEND, OTHER.
3. Extract raw values literally: dimensions, lengths, radii, angles, connection labels, UP/DN arrows, quantities, crossed-out replacements, and endcap notes.
4. Sanity-check values against the sketch type before finalizing. Do not silently fix unclear numbers; use status Review or Missing Dim. and explain in remarks.
5. Cross-reference repeated handwriting on the same page. If a label such as S & C, TDC, B/F, ST, or Endcap is clear in one place, use that visual pattern to read messy repeats.
6. Preserve original item order and visible repeated item numbers. Do not merge separate sketches only because the same item number appears twice.`;
}

function areaCalculationShapeRulesPrompt() {
  return `Shape and value rules:
- STR: straight rectangular duct, same size both ends. Repeat W1/H1 into W2/H2.
- RED: reducer/transition, two different rectangular sizes joined by a sloped line. Use the written transition length.
- ELB: L-shaped or curved elbow with angle/radius. 90° elbows and radius-only elbows normalize to calculatedLength 1000; one 45° elbow is 500; two 45° elbows are 1000.
- SHOENECK: neck opening tapering into a wider body. If only one width is visible and W2 is missing/equal to W1, use W2 = W1 + 100 and same height, with Review/remarks if uncertain.
- END: one opening only/closed end. Add as a separate row immediately after the parent item. Use drawingLengthAngle "50L" and calculatedLength 70.
- Y Piece: one main body splitting into two branches. Read main size, branch sizes, radius/angle notes, and connection labels. Default calculatedLength is 1500 unless a specific value is shown. A double-curved branch sketch with one main size and two branch sizes is Y Piece even if it resembles two elbows joined together.
- PLENUM/OFF/TEE/BEND: classify by visible shape first, then dimensions.
- If a fitting's dimensions contradict its shape, keep the row but mark Review and explain the uncertainty.`;
}

function areaCalculationConnectionGlossaryPrompt() {
  return `Connection glossary:
- S & C / S.C / S&C = Slip & Clamp joint.
- TDC = Transverse Duct Connection / flange joint.
- TDF = Transverse Duct Flange.
- B/F / BIF = Bar Flange / Break Flange.
- D/M = Damper Mount when written near an opening.
- SELF-F = Self Flange.
- ST usually means straight duct connection/straight item label when written beside STR sketches.
- Bottom to Bottom is an alignment note, usually for reducers/offset/shoe necks, not a drawing length.
Use exactly what is visible when it is clearer than the glossary. Read Section and Connection directly from the drawing, not from examples.`;
}

function areaCalculationValidationPrompt() {
  return `Validation checklist before final rows:
1. Every visible drawing item is included in order.
2. Every section heading is applied only to the items it visually governs.
3. Quantities such as 2 Nos or 3 Nos are captured.
4. End caps become separate rows attached to the correct parent, with no duplicates.
5. Radius text such as 150R is not treated as duct length.
6. Y Piece rows are not missed when the branch sketch is compact or looks like joined elbows.
7. Missing or extra zeros are re-checked, especially 200 vs 2000 and 150 vs 1500.
8. Unclear values are not guessed silently; mark Review or Missing Dim. and write remarks.
9. Area values will be normalized by the application formula, so focus on accurate row fields.`;
}

async function extractAreaCalculationWithOpenAI(fileParts) {
  if (!process.env.OPENAI_API_KEY) {
    return { rows: [], message: "OpenAI API key is missing. The drawing is saved; add rows manually or configure OPENAI_API_KEY." };
  }
  const fileInputs = areaCalculationFileInputs(fileParts);
  const layoutMap = await callOpenAIJson("duct_area_layout_map", areaCalculationLayoutSchema(), [
    {
      type: "input_text",
      text: areaCalculationLayoutPrompt()
    },
    ...fileInputs
  ]);
  const content = [{
    type: "input_text",
    text: `Read every uploaded HVAC duct drawing page/image and extract duct fabrication area calculation rows.
Return JSON only. Preserve item order and section headings.
Use this verified layout map from the first vision pass as your primary guide for item grouping and sketch association:
${JSON.stringify(layoutMap)}

${areaCalculationVisionWorkflowPrompt()}

${areaCalculationShapeRulesPrompt()}

${areaCalculationConnectionGlossaryPrompt()}

${areaCalculationValidationPrompt()}

Do not jump directly to OCR. For each final row, use the layout map's item cluster, sketch type, dimensions, and uncertainty notes before deciding the row values.
Important: read the Section and Connection columns directly from the uploaded drawing in this final pass, the same way as the older one-pass extractor. Use the layout map only as a hint for where to look. If the layout map conflicts with the visible section marker or visible connection label, trust the visible drawing for Section and Connection.
Supported types: STR, RED, ELB, SHOENECK, END, Y-PIECE, PLENUM, OFF, TEE, BEND, OTHER.
Columns to extract per row: item, section, type, connection, w1, h1, w2, h2, qty, drawingLengthAngle, offset, status, remarks.
Use millimetres for dimensions. For straight ducts repeat W1/H1 into W2/H2. Default qty is 1. Default offset is 20.
Do not silently guess unclear dimensions. If unclear, leave numeric fields 0, set status to Review or Missing Dim., and explain in remarks.
For attached end caps, create an END row only when the drawing clearly makes it a duct item or the corrected table convention requires a separate END row. If "End cap" is written directly under/attached to a numbered straight duct item, add the END row immediately after it using the next item number. Do not create an extra END row from a nearby unrelated sketch/note alone. For every actual END/end cap row, set drawingLengthAngle exactly to "50L" unless another explicit end cap length is printed.
If Endcap/End cap appears inside the connection or label text of a non-END row, do not keep "Endcap" in Connection. Keep the original row as its actual fitting type, clean the connection text, and add a separate END row immediately after it using the same section, connection, and duct size.
For elbows, keep original angle/radius text such as "90° R=100" in drawingLengthAngle. If the sketch says 90° Elbow and includes radius R, output "90° R=<radius>"; do not treat notes like "100+150-R" as straight duct length.
For Y Piece/Y-PIECE rows, radius text such as "150R" is the Length / Angle value, not the drawing length. When no explicit L length is printed, use calculatedLength 1500.
Ignore folding/fold notes such as "25mm folding" when choosing connection, dimensions, or Length / Angle.

Training example from a handwritten duct sheet:
- Header/section text "G1+5P+27 Floor+Roof JVC Unit Mouth" means every listed item section is "G1+5P+27".
- A handwritten result like "= 420L", "= 540L", "= 700L", "= 500L" is the row Length / Angle value. Output drawingLengthAngle as the number only if the target table shows it that way, or keep the L suffix if it is explicitly written in the corrected value. Do not use plan view dimension text as length when an "= ...L" result exists.
- Item 1: 820x150 plan to 400x200, connection "B/F, S.C", type RED, drawingLengthAngle 420.
- Item 2: 820x150 plan to 400x200, connection "S.C", type RED, drawingLengthAngle 540.
- Item 3: 1050x250 plan to 700x250, connection "TDC Flange", type RED, drawingLengthAngle 700.
- Items marked shoe-neck/shoe neck are type SHOENECK. Example: 500x200 = 200L with TDC flange uses w1=500,h1=200,w2=600,h2=200,type SHOENECK,drawingLengthAngle 200.
- If a row says 500x200 = 740L and TDC both end, use w1=500,h1=200,w2=500,h2=200,type SHOENECK,connection "TDC (both end)",drawingLengthAngle "740L".
- Rows with taper sketches and bottom-to-bottom notes are RED when sizes change, e.g. 900x160 to 500x200 with =500L is RED/TDC Flange/500.

Second corrected example from same handwritten style:
- Section text such as "L-21" applies to nearby item numbers until a new section marker appears. In this example items 8 and 9 are section "L-21"; items 10 to 16 are section "L-19".
- Items can continue from earlier pages; preserve visible item numbers like 8, 9, 10, 11, 12, 13, 14, 15, 16.
- Type OFF means offset piece; use OFF when the corrected output calls it OFF even if the sketch also tapers. RED is used for clear reduction rows in the corrected output.
- Item 8: section L-21,type OFF,connection "B/F, S.C",w1=820,h1=150,w2=400,h2=200,qty=1,drawingLengthAngle "430L".
- Item 9: section L-21,type OFF,connection "S.C",w1=820,h1=150,w2=400,h2=200,qty=1,drawingLengthAngle "590L".
- Item 10: section L-19,type RED,connection "TDC Flange",w1=1600,h1=150,w2=700,h2=200,qty=1,drawingLengthAngle "320L".
- Item 11: section L-19,type RED,connection "S.C",w1=820,h1=150,w2=400,h2=200,qty=1,drawingLengthAngle "540L".
- Item 12: section L-19,type OFF,connection "S.C",w1=820,h1=150,w2=400,h2=200,qty=1,drawingLengthAngle "550L".
- Item 13: section L-19,type RED,connection "TDC Flange",w1=780,h1=200,w2=550,h2=200,qty=1,drawingLengthAngle "450L".
- Item 14: section L-19,type OFF,connection "S.C",w1=200,h1=100,w2=200,h2=100,qty=1,drawingLengthAngle "430L".
- Straight duct notes like "200x150 = 1200L" with "ST = 2 Nos" mean type STR,w1=200,h1=150,w2=200,h2=150,qty=2,drawingLengthAngle "1200L",connection "S.C".
- Straight duct notes like "250x150 = 1200L" with "ST = 3 Nos" mean type STR,w1=250,h1=150,w2=250,h2=150,qty=3,drawingLengthAngle "1200L",connection "S.C".

Third corrected example from same handwritten style:
- Section marker "L=15" applies to items 17, 18, and 19 exactly as "L=15".
- Item 17: section L=15,type STR,connection "S.C",w1=400,h1=200,w2=400,h2=200,qty=1,drawingLengthAngle "950L". The nearby "Endcap" sketch/note does not become a separate END row in this corrected output.
- Item 18: section L=15,type STR,connection "S.C",w1=450,h1=150,w2=450,h2=150,qty=1,drawingLengthAngle "500L".
- Item 19: section L=15,type ELB,connection "S.C",w1=150,h1=450,w2=150,h2=450,qty=1,drawingLengthAngle "90° R=150". The handwritten "100+150-R" and "25mm folding" notes are references only; do not output them as length or connection.

Fourth corrected example from a PDF drawing named Eqbal Unit Mouth:
- Preserve sections from the drawing markers exactly: items 1 to 3 are section L-13, item 4 is L-14, items 5 to 7 are L-18, items 8 and 9 are L-20, items 10 and 11 are L-22.
- Item 1: section L-13,type RED,connection "S.C",w1=820,h1=150,w2=400,h2=200,qty=1,drawingLengthAngle "420L".
- Item 2: section L-13,type RED,connection "S.C",w1=400,h1=200,w2=820,h2=150,qty=1,drawingLengthAngle "580L".
- Item 3: section L-13,type ELB,connection "S.C",w1=150,h1=150,w2=200,h2=150,qty=1,drawingLengthAngle "90°".
- Item 4: section L-14,type RED,connection "S.C",w1=820,h1=150,w2=400,h2=200,qty=1,drawingLengthAngle "410L".
- Item 5: section L-18,type RED,connection "S.C",w1=400,h1=200,w2=820,h2=150,qty=1,drawingLengthAngle "540L".
- Item 6: section L-18,type PLENUM,connection "S.C",w1=200,h1=200,w2=200,h2=200,qty=1,drawingLengthAngle "1000L".
- Item 7: section L-18,type STR,connection "S.C",w1=650,h1=200,w2=650,h2=200,qty=3,drawingLengthAngle "1200L".
- Item 8: section L-20,type RED,connection "S.C",w1=820,h1=150,w2=400,h2=200,qty=1,drawingLengthAngle "450L".
- Item 9: section L-20,type RED,connection "S.C",w1=400,h1=200,w2=820,h2=150,qty=1,drawingLengthAngle "550L".
- Item 10: section L-22,type RED,connection "S.C",w1=400,h1=200,w2=820,h2=150,qty=1,drawingLengthAngle "570L".
- Item 11: section L-22,type RED,connection "S.C",w1=820,h1=150,w2=400,h2=200,qty=1,drawingLengthAngle "380L".

Fifth corrected example from handwritten section 25F-01B:
- Section marker "25F-01B" applies to items 6 through 14.
- Item 6: section 25F-01B,type RED,connection "B/F",w1=800,h1=200,w2=650,h2=150,qty=1,drawingLengthAngle "400L".
- Item 7: section 25F-01B,type ELB,connection "S.C",w1=650,h1=150,w2=650,h2=150,qty=1,drawingLengthAngle "90° R=200".
- Item 8: section 25F-01B,type SHOENECK,connection "TDC Flange",w1=600,h1=150,w2=700,h2=150,qty=1,drawingLengthAngle "150L".
- Item 9: section 25F-01B,type STR,connection "S.C",w1=600,h1=150,w2=600,h2=150,qty=1,drawingLengthAngle "450L".
- Item 10: section 25F-01B,type ELB,connection "S.C",w1=600,h1=150,w2=600,h2=150,qty=1,drawingLengthAngle "90° R".
- Item 11: section 25F-01B,type STR,connection "S.C",w1=600,h1=150,w2=600,h2=150,qty=1,drawingLengthAngle "1300L".
- Item 12: section 25F-01B,type STR,connection "S.C",w1=600,h1=150,w2=600,h2=150,qty=2,drawingLengthAngle "1200L".
- Item 13: section 25F-01B,type STR,connection "S.C",w1=600,h1=150,w2=600,h2=150,qty=1,drawingLengthAngle "1200L".
- Because "End cap" is written directly below item 13, add item 14: section 25F-01B,type END,connection "S.C",w1=600,h1=150,w2=600,h2=150,qty=1,drawingLengthAngle "50L". Its calculatedLength is 70, areaM2 is 0.1106, and areaFt2 is 1.190498.

Sixth corrected example from handwritten section 25F-02 K.L:
- Section marker "25F-02 K.L" applies to visible items 24 through 32.
- Item 24: section 25F-02 K.L,type STR,connection "ST",w1=750,h1=200,w2=750,h2=200,qty=1,drawingLengthAngle "1100L".
- Item 25: section 25F-02 K.L,type RED,connection "B/F",w1=750,h1=200,w2=650,h2=200,qty=1,drawingLengthAngle "500L".
- Item 26: section 25F-02 K.L,type STR,connection "ST",w1=650,h1=200,w2=650,h2=200,qty=1,drawingLengthAngle "1400L".
- Item 27: section 25F-02 K.L,type RED,connection "B/F",w1=650,h1=200,w2=250,h2=150,qty=1,drawingLengthAngle "500L".
- Item 28: section 25F-02 K.L,type STR,connection "ST",w1=250,h1=150,w2=250,h2=150,qty=1,drawingLengthAngle "1200L".
- Item 29: section 25F-02 K.L,type ELB,connection "ST",w1=250,h1=150,w2=250,h2=150,qty=1,drawingLengthAngle "90°".
- Item 30: section 25F-02 K.L,type STR,connection "ST",w1=250,h1=150,w2=250,h2=150,qty=1,drawingLengthAngle "400L".
- Because "Endcap" is written directly below item 30 and item 31 is already a visible shoe neck item, add item 30-END: section 25F-02 K.L,type END,connection "ST",w1=250,h1=150,w2=250,h2=150,qty=1,drawingLengthAngle "50L". Its calculatedLength is 70, areaM2 is 0.0616, and areaFt2 is 0.663062.
- Item 31: section 25F-02 K.L,type SHOENECK,connection "TDC",w1=1100,h1=150,w2=1200,h2=150,qty=1,drawingLengthAngle "150L". For SHOENECK, W2 is W1 + 100 when the sketch only writes one size at the inlet.
- Item 32: section 25F-02 K.L,type STR,connection "ST",w1=1100,h1=150,w2=1100,h2=150,qty=1,drawingLengthAngle "150L".

Seventh corrected example for Y Piece:
- A handwritten item showing "650x300" above two branch sizes "250x400" and "250x400", with "= 150R" and a Y-shaped sketch labeled B/F and TDC, is type Y Piece.
- Output: type Y Piece,connection "B/F, TDC",w1=650,h1=300,w2=250,h2=400,qty=2,drawingLengthAngle "150R",offset=20,calculatedLength=1500,areaM2=5.0400,areaFt2=54.25.

Eighth corrected example from handwritten sections 25F-03 B.R. and 25F-LK:
- Item 38 appears before the visible section marker; keep section blank when no section marker is clearly attached. It is a shoe neck: item 38,type SHOENECK,connection "S & C",w1=750,h1=210,w2=850,h2=210,qty=1,drawingLengthAngle "250L".
- Section marker "25F-03 B.R." applies to the two item 39 rows and items 40 to 42.
- The drawing can contain the same item number twice for different fittings. Preserve both item 39 rows in order; do not merge them.
- First item 39 is a 90° elbow with radius text: section 25F-03 B.R.,type ELB,connection "ST",w1=350,h1=400,w2=750,h2=400,qty=1,drawingLengthAngle "150R". Radius-only elbow normalizes to calculatedLength 1000.
- Second item 39 is straight duct: section 25F-03 B.R.,type STR,connection "ST",w1=350,h1=400,w2=350,h2=400,qty=1,drawingLengthAngle "1600L".
- Item 40: section 25F-03 B.R.,type RED,connection "BIF",w1=350,h1=400,w2=350,h2=250,qty=1,drawingLengthAngle "500L".
- Item 41: section 25F-03 B.R.,type STR,connection "S & C",w1=350,h1=250,w2=350,h2=250,qty=1,drawingLengthAngle "3600L".
- Because "Endcap" is written directly below item 41, add item 41-END: section 25F-03 B.R.,type END,connection "S & C",w1=350,h1=250,w2=350,h2=250,qty=1,drawingLengthAngle "50L".
- Item 42 says shoe neck = 2 Nos: section 25F-03 B.R.,type SHOENECK,connection "S & C",w1=600,h1=210,w2=700,h2=210,qty=2,drawingLengthAngle "170L".
- Section marker "25F-LK" applies to items 43 to 47.
- Item 43: section 25F-LK,type STR,connection "ST",w1=700,h1=300,w2=700,h2=300,qty=1,drawingLengthAngle "400L".
- Item 44: section 25F-LK,type RED,connection "S & C",w1=700,h1=300,w2=650,h2=300,qty=1,drawingLengthAngle "500L".
- Item 45: section 25F-LK,type ELB,connection "S & C",w1=650,h1=300,w2=650,h2=300,qty=1,drawingLengthAngle "150R".
- Item 46: section 25F-LK,type STR,connection "ST",w1=650,h1=300,w2=650,h2=300,qty=1,drawingLengthAngle "775L".
- Item 47: section 25F-LK,type Y Piece,connection "B/F, TDC, TDC",w1=650,h1=300,w2=250,h2=400,qty=2,drawingLengthAngle "150R". Y Piece radius-only normalizes to calculatedLength 1500.

Ninth corrected example from handwritten sections 25F-01 B-R, 25F-04 B-R, and 25F-04 K-L:
- Section marker "25F-01 B-R" applies to items 53, 54, and 56.
- Item 53: section 25F-01 B-R,type STR,connection "ST",w1=400,h1=250,w2=400,h2=250,qty=1,drawingLengthAngle "400L".
- Item 54 says 90° elbow = 2 Nos: section 25F-01 B-R,type ELB,connection "Elbow",w1=400,h1=250,w2=400,h2=250,qty=2,drawingLengthAngle "90° R=150".
- Item 56: section 25F-01 B-R,type STR,connection "S & C",w1=400,h1=250,w2=400,h2=250,qty=1,drawingLengthAngle "300L".
- Section marker "25F-04 B-R" applies to items 57 to 61.
- Item 57: section 25F-04 B-R,type ELB,connection "90° Elbow",w1=750,h1=400,w2=350,h2=400,qty=1,drawingLengthAngle "90° R=150".
- Item 58: section 25F-04 B-R,type STR,connection "ST",w1=350,h1=400,w2=350,h2=400,qty=1,drawingLengthAngle "1550L".
- Item 59: section 25F-04 B-R,type RED,connection "B/F, Reductor",w1=350,h1=400,w2=350,h2=250,qty=1,drawingLengthAngle "400L".
- Item 60: section 25F-04 B-R,type STR,connection "ST",w1=350,h1=250,w2=350,h2=250,qty=1,drawingLengthAngle "1000L".
- Because "Endcap" is written directly below item 60, add item 60-END: section 25F-04 B-R,type END,connection "Endcap",w1=350,h1=250,w2=350,h2=250,qty=1,drawingLengthAngle "50L". Do not use 70L as the drawing length; the normalized calculated length is 70.
- Item 61 says shoe neck = 2 Nos beside 600x210 plan: section 25F-04 B-R,type SHOENECK,connection "ST",w1=600,h1=210,w2=600,h2=210,qty=1,drawingLengthAngle "250L" in this corrected output.
- Section marker "25F-04 K-L" applies to item 62.
- Item 62 is a Y Piece with main 650x350, one visible 650x350 side and 200x150 branch notes, TDC labels, and multiple angle/radius notes. Corrected table output is: section 25F-04 K-L,type Y Piece,connection "",w1=650,h1=350,w2=650,h2=350,qty=1,drawingLengthAngle "150R, 250R, 90°",calculatedLength 1500.

Tenth corrected example for a compact Y Piece and following endcap row:
- A circled item 72 showing "250x250" above two branch sizes "(200x200)(200x200)" and "=150R" beside a double-curved/Y-shaped sketch must be read as Y Piece. Do not miss this row just because it looks like two elbows joined together.
- Item 72 corrected output: item 72,section 72,type Y Piece,connection "S & C",w1=250,h1=250,w2=200,h2=200,qty=1,drawingLengthAngle "90° R=150",offset=20,calculatedLength 1500.
- Item 73 below it is a straight duct with an endcap note: item 73,section 73,type STR,connection "S & C",w1=200,h1=200,w2=200,h2=200,qty=1,drawingLengthAngle "900L".
- Because "Endcap = 2 Nos" is written directly with item 73, add the END row immediately after it: item 74,section 73,type END,connection "S & C",w1=200,h1=200,w2=200,h2=200,qty=2,drawingLengthAngle "50L".`
  }];
  content.push(...fileInputs);
  const parsed = await callOpenAIJson("duct_area_calculation_extract", areaCalculationExtractSchema(), content);
  const audited = await callOpenAIJson("duct_area_calculation_audit", areaCalculationExtractSchema(), [
    {
      type: "input_text",
      text: areaCalculationAuditPrompt(layoutMap, parsed)
    },
    ...fileInputs
  ]);
  return {
    rows: Array.isArray(audited.rows) && audited.rows.length ? audited.rows : (Array.isArray(parsed.rows) ? parsed.rows : []),
    message: cleanCell(audited.message || parsed.message || `Drawing scanned using ${Array.isArray(layoutMap.items) ? layoutMap.items.length : 0} mapped item cluster(s). Review highlighted rows before export.`)
  };
}

function areaCalculationFileInputs(fileParts) {
  const inputs = [];
  for (const filePart of fileParts) {
    const mime = filePart.mimeType || mimeTypes[path.extname(filePart.filename).toLowerCase()] || "application/octet-stream";
    const base64 = filePart.body.toString("base64");
    if (mime.startsWith("image/")) {
      inputs.push({ type: "input_image", image_url: `data:${mime};base64,${base64}` });
    } else if (mime.includes("pdf")) {
      const pageInputs = pdfPageImageInputs(filePart, "Duct drawing PDF page");
      if (pageInputs.length) inputs.push(...pageInputs);
      else inputs.push({ type: "input_file", filename: filePart.filename, file_data: `data:${mime};base64,${base64}` });
    }
  }
  return inputs;
}

function areaCalculationLayoutPrompt() {
  return `You are reading handwritten HVAC duct fabrication drawings. Do not create the final area table yet.
Return JSON only.

${areaCalculationVisionWorkflowPrompt()}

${areaCalculationShapeRulesPrompt()}

${areaCalculationConnectionGlossaryPrompt()}

First build a visual layout map:
1. Identify every circled or visible item number and its section marker. If the same item number appears twice for separate sketches, keep both clusters in visual order.
2. For each item, describe the page/region and which sketch/labels belong to it.
3. Identify the fitting type from the sketch shape before reading dimensions: STR, RED, ELB, SHOENECK, END, Y Piece, PLENUM, OFF, TEE, BEND, OTHER.
4. Capture raw dimensions and length/angle text exactly as written, including L and R suffixes.
5. Use repeated handwriting labels as anchors: B/F, S.C, ST, TDC, TDC Flange, Endcap.
6. Add explicit uncertainty notes when a number or label is unclear or does not match the fitting shape.

Domain checks:
- STR usually repeats W1/H1 into W2/H2.
- Repeated item numbers can be valid when the drawing shows separate fittings; preserve them instead of merging.
- RED has different opening sizes.
- ELB uses angle/radius text such as 90°, 90° R=200, or 150R; radius text is not duct length.
- SHOENECK often has W2 = W1 + 100 when only one size is written beside the sketch.
- END/Endcap should become a separate row when the note is directly attached to a numbered straight duct item.
- Y Piece has a main size plus branch size(s), often quantity 2, and radius text such as 150R. A double-curved branch sketch with one top/main size and two bottom branch sizes is Y Piece, even if it resembles two elbows joined together.

Your job is to map visual clusters accurately, not to calculate area.`;
}

function areaCalculationAuditPrompt(layoutMap, extracted) {
  return `You are the final audit pass for HVAC duct area extraction. Return JSON only using the same final table schema.

${areaCalculationVisionWorkflowPrompt()}

${areaCalculationShapeRulesPrompt()}

${areaCalculationConnectionGlossaryPrompt()}

${areaCalculationValidationPrompt()}

Compare the visual drawing against:
LAYOUT MAP:
${JSON.stringify(layoutMap)}

EXTRACTED TABLE:
${JSON.stringify(extracted)}

Your task:
1. Check every mapped item cluster and every createsAdditionalRows note against the extracted table.
2. If an item, attached Endcap/END row, Y Piece branch, elbow, shoe neck, reduction, or straight row is missing, add it.
3. If a row exists but its type/dimensions/qty/length-angle clearly contradict the drawing, correct it.
4. Preserve all correctly extracted rows and their order.
5. Do not duplicate rows already present.
6. Read Section and Connection directly from the drawing in this audit pass. Use the layout map only to locate where to look.
7. Keep uncertain rows with status "Review" and explain the reason in remarks.

Domain defaults:
- END/Endcap: drawingLengthAngle "50L", calculated length will be normalized to 70.
- If Endcap/End cap is present only inside a non-END row connection/label, split it into a separate END row and remove Endcap from that original row's connection.
- ELB/BEND with radius or angle but no L length: calculated length will be normalized to 1000.
- Y Piece with radius text such as 150R and no L length: calculated length will be normalized to 1500.
- SHOENECK: if only one width is visible and W2 is missing/equal to W1, use W2 = W1 + 100.

Return the complete corrected rows array, not only changes.`;
}

function areaCalculationLayoutSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      sections: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            section: { type: "string" },
            appliesToItems: { type: "string" },
            confidence: { type: "string" }
          },
          required: ["section", "appliesToItems", "confidence"]
        }
      },
      items: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            item: { type: "string" },
            section: { type: "string" },
            region: { type: "string" },
            sketchType: { type: "string" },
            shapeDescription: { type: "string" },
            rawDimensions: { type: "array", items: { type: "string" } },
            rawLengthAngle: { type: "string" },
            rawConnectionLabels: { type: "array", items: { type: "string" } },
            associatedNotes: { type: "array", items: { type: "string" } },
            createsAdditionalRows: { type: "array", items: { type: "string" } },
            confidence: { type: "string" },
            uncertainty: { type: "string" }
          },
          required: ["item", "section", "region", "sketchType", "shapeDescription", "rawDimensions", "rawLengthAngle", "rawConnectionLabels", "associatedNotes", "createsAdditionalRows", "confidence", "uncertainty"]
        }
      },
      repeatedLabelAnchors: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            label: { type: "string" },
            seenAtItems: { type: "string" },
            visualCue: { type: "string" }
          },
          required: ["label", "seenAtItems", "visualCue"]
        }
      },
      notes: { type: "string" }
    },
    required: ["sections", "items", "repeatedLabelAnchors", "notes"]
  };
}

function areaCalculationExtractSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      rows: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            item: { type: "string" },
            section: { type: "string" },
            type: { type: "string" },
            connection: { type: "string" },
            w1: { type: "number" },
            h1: { type: "number" },
            w2: { type: "number" },
            h2: { type: "number" },
            qty: { type: "number" },
            drawingLengthAngle: { type: "string" },
            offset: { type: "number" },
            status: { type: "string" },
            remarks: { type: "string" }
          },
          required: ["item", "section", "type", "connection", "w1", "h1", "w2", "h2", "qty", "drawingLengthAngle", "offset", "status", "remarks"]
        }
      },
      message: { type: "string" }
    },
    required: ["rows", "message"]
  };
}

async function extractProjectDirectDeliveryWithOpenAI(filePart) {
  if (!process.env.OPENAI_API_KEY) {
    return { deliveryNoteNo: "", date: todayDisplayDate(), lines: [], message: "OpenAI API key is missing. Add detected rows manually or configure OPENAI_API_KEY." };
  }
  const mime = filePart.mimeType || "application/octet-stream";
  const base64 = filePart.body.toString("base64");
  const content = [{
    type: "input_text",
    text: "Extract outbound delivery note item details for an HVAC project. Return JSON only. Identify deliveryNoteNo, date if present, and lines [{modelNo, quantity, status}]. Model number must be the exact equipment model/code when visible. Quantity must be the delivered quantity for that model. Combine duplicate model numbers. If quantity is unclear, use quantity 0 and status 'Needs Review'. If model is unclear, leave modelNo blank and status 'Needs Review'. Do not extract prices."
  }];
  if (mime.includes("pdf")) content.push({ type: "input_file", filename: filePart.filename, file_data: `data:${mime};base64,${base64}` });
  else if (mime.startsWith("image/")) content.push({ type: "input_image", image_url: `data:${mime};base64,${base64}` });
  else return { deliveryNoteNo: "", date: todayDisplayDate(), lines: [], message: "Unsupported file type for delivery note detection." };
  const payload = {
    model: OPENAI_MODEL,
    input: [{ role: "user", content }],
    temperature: 0,
    text: { format: { type: "json_schema", name: "project_direct_delivery_extract", strict: true, schema: projectDirectDeliverySchema() } }
  };
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) return { deliveryNoteNo: "", date: todayDisplayDate(), lines: [], message: json.error?.message || "Delivery note extraction failed." };
  try {
    return JSON.parse(extractResponseText(json));
  } catch {
    return { deliveryNoteNo: "", date: todayDisplayDate(), lines: [], message: "Delivery note OCR response could not be parsed." };
  }
}

function projectDirectDeliverySchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      deliveryNoteNo: { type: "string" },
      date: { type: "string" },
      lines: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            modelNo: { type: "string" },
            quantity: { type: "number" },
            status: { type: "string" }
          },
          required: ["modelNo", "quantity", "status"]
        }
      },
      message: { type: "string" }
    },
    required: ["deliveryNoteNo", "date", "lines", "message"]
  };
}

function pdfPageImageInputs(filePart, label = "PDF page") {
  const mime = filePart.mimeType || "application/octet-stream";
  if (!mime.includes("pdf")) return [];
  const tmpRoot = path.join(DATA, "tmp", `pdf-pages-${id()}`);
  const pdfPath = path.join(tmpRoot, safeName(filePart.filename || "upload.pdf"));
  const outputPrefix = path.join(tmpRoot, "page");
  try {
    fs.mkdirSync(tmpRoot, { recursive: true });
    fs.writeFileSync(pdfPath, filePart.body);
    const candidates = [...new Set([PDFTOPPM_EXE, "pdftoppm"].filter(Boolean))];
    let rendered = false;
    for (const candidate of candidates) {
      const result = spawnSync(candidate, ["-png", "-r", "150", pdfPath, outputPrefix], {
        encoding: "utf8",
        maxBuffer: 10 * 1024 * 1024,
        windowsHide: true
      });
      if (result.status === 0) {
        rendered = true;
        break;
      }
    }
    if (!rendered) return [];
    return fs.readdirSync(tmpRoot)
      .filter(file => /^page-\d+\.png$/i.test(file))
      .sort((a, b) => Number(a.match(/\d+/)?.[0] || 0) - Number(b.match(/\d+/)?.[0] || 0))
      .map((file, index) => {
        const image = fs.readFileSync(path.join(tmpRoot, file)).toString("base64");
        return [
          { type: "input_text", text: `${label} ${index + 1}` },
          { type: "input_image", image_url: `data:image/png;base64,${image}` }
        ];
      })
      .flat();
  } catch {
    return [];
  } finally {
    try {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    } catch {}
  }
}

async function extractPurchaseQuotationWithOpenAI(filePart) {
  if (!process.env.OPENAI_API_KEY) {
    return { message: "OpenAI API key is missing. Fill the PO manually or configure OPENAI_API_KEY.", items: [] };
  }
  const mime = filePart.mimeType || "application/octet-stream";
  const base64 = filePart.body.toString("base64");
  const content = [{
    type: "input_text",
    text: "Extract supplier quotation details for a purchase order. Inspect every page in order. If the quotation has item tables continuing on page 2, page 3, or later pages, extract all item rows from every page; do not stop after the first page. Return blank strings for missing text values and 0 for missing numeric totals. Never invent values. Extract supplierName, supplierAddress, trn, quotationNo, quotationDate, projectName, paymentTerms, subtotal before VAT, discount if shown, and item rows with description, modelNo, qty, unitPrice, vatPercent, amount. Do not extract or change PO notes; return notes as an empty string. For paymentTerms, normalize cash/CDC/current dated cheque as CDC; 30 days as 30 Days PDC; 60 days as 60 Days PDC; 90 days as 90 Days PDC; 15 days as 15 Days PDC. For each item row on every page, combine every description-adjacent/specification column into the description field: Description, Size, Model, Type, Brand, Remarks, Specification, or any similar column next to description must become one description line joined with ' - '. Example: Description VCD, Size 1000 x 1000 mm, Model TAO => description 'VCD - 1000 x 1000 mm - TAO'. Keep qty, unit price, VAT, and amount separate as usual. Return JSON only."
  }];
  if (mime.startsWith("image/")) content.push({ type: "input_image", image_url: `data:${mime};base64,${base64}` });
  else if (mime.includes("pdf")) {
    const pageInputs = pdfPageImageInputs(filePart, "Quotation PDF page");
    if (pageInputs.length) content.push(...pageInputs);
    else content.push({ type: "input_file", filename: filePart.filename, file_data: `data:${mime};base64,${base64}` });
  }
  else content.push({ type: "input_file", filename: filePart.filename, file_data: `data:${mime};base64,${base64}` });
  const payload = {
    model: OPENAI_MODEL,
    input: [{ role: "user", content }],
    temperature: 0,
    text: { format: { type: "json_schema", name: "purchase_quotation_extract", strict: true, schema: purchaseQuotationSchema() } }
  };
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) return { message: json.error?.message || "Quotation extraction failed.", items: [] };
  try {
    return JSON.parse(extractResponseText(json));
  } catch {
    return { message: "Quotation OCR response could not be parsed.", items: [] };
  }
}

async function extractOrderBookPoWithOpenAI(filePart) {
  if (!process.env.OPENAI_API_KEY) {
    return { message: "OpenAI API key is missing. Fill the order manually or configure OPENAI_API_KEY." };
  }
  const mime = filePart.mimeType || "application/octet-stream";
  const base64 = filePart.body.toString("base64");
  const content = [{
    type: "input_text",
    text: "Extract confirmed purchase order details for an HVAC order book. Return blank strings for missing text values and 0 for missing numeric values. Never invent values. Extract poNo, poDate/order date, customer/company name, project name or job description, delivery/site location, contact person, contact number, value without VAT/subtotal, VAT amount, and value including VAT/grand total. The customer is the company issuing the PO / buyer / purchaser / client. Do not use our company as customer: COMFORT ZONE A C. DEVICES TR. LLC, COMFORT ZONE AC DEVICES TR LLC, Comfort Zone A/C Devices Tr. LLC, or similar Comfort Zone names are supplier/seller/internal names and must be ignored as customer. For jobDescription, prefer Project Name, Project, Subject, Job Name, Site Name, Work Description, Scope, Remarks, or meaningful project/order details if present. If the PO mentions AC units, air conditioning units, VRV, DX, indoor units, outdoor units, or HVAC equipment supply, set division to Trading. Otherwise leave division blank unless a clear division is written. Return JSON only."
  }];
  if (mime.startsWith("image/")) content.push({ type: "input_image", image_url: `data:${mime};base64,${base64}` });
  else content.push({ type: "input_file", filename: filePart.filename, file_data: `data:${mime};base64,${base64}` });
  const payload = {
    model: OPENAI_MODEL,
    input: [{ role: "user", content }],
    temperature: 0,
    text: { format: { type: "json_schema", name: "order_book_po_extract", strict: true, schema: orderBookPoSchema() } }
  };
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) return { message: json.error?.message || "PO extraction failed." };
  try {
    return JSON.parse(extractResponseText(json));
  } catch {
    return { message: "PO OCR response could not be parsed." };
  }
}

function normalizeOrderBookPoExtraction(input = {}) {
  const valueWithoutVat = parseLooseNumber(input.valueWithoutVat || input.subtotal);
  const vatAmount = parseLooseNumber(input.vatAmount);
  const orderValue = parseLooseNumber(input.orderValue || input.valueIncludingVat || input.grandTotal) || (valueWithoutVat ? valueWithoutVat + vatAmount : 0);
  const customerCandidates = [
    input.customer,
    input.customerName,
    input.companyName,
    input.client,
    input.clientName,
    input.buyer,
    input.buyerName,
    input.purchaser,
    input.purchaserName
  ].map(cleanCell).filter(Boolean);
  const customer = customerCandidates.find(value => !isComfortZoneCompanyName(value)) || "";
  const combinedText = [
    input.division,
    input.jobDescription,
    input.projectName,
    input.project,
    input.description
  ].map(value => String(value || "").toLowerCase()).join(" ");
  const detectedTrading = /\b(ac|air\s*conditioning|hvac|vrv|dx|indoor|outdoor)\b/.test(combinedText) && /\b(unit|units|equipment|supply)\b/.test(combinedText);
  return {
    poNo: cleanCell(input.poNo),
    poDate: parseServerDate(input.poDate || input.orderDate),
    customer,
    jobDescription: cleanCell(input.jobDescription || input.projectName || input.project || input.description),
    location: cleanCell(input.location || input.deliveryLocation || input.siteLocation),
    contactPerson: cleanCell(input.contactPerson),
    contactNumber: cleanCell(input.contactNumber || input.phone || input.tel),
    division: cleanCell(input.division) || (detectedTrading ? "Trading" : ""),
    valueWithoutVat,
    vatAmount,
    orderValue
  };
}

async function extractOrderBookInvoiceWithOpenAI(filePart) {
  if (!process.env.OPENAI_API_KEY) {
    return { message: "OpenAI API key is missing. Invoice amount can be entered manually." };
  }
  const mime = filePart.mimeType || "application/octet-stream";
  const base64 = filePart.body.toString("base64");
  const content = [{
    type: "input_text",
    text: "Extract invoice payment details for an HVAC order book. Return blank strings for missing text values and 0 for missing numeric values. Never invent values. Extract invoiceNo, invoiceDate, totalAmount including VAT/grand total/net invoice total/amount payable, and remarks. If total amount is unclear or multiple totals conflict, set totalAmount to 0 and explain in message. Return JSON only."
  }];
  if (mime.startsWith("image/")) content.push({ type: "input_image", image_url: `data:${mime};base64,${base64}` });
  else content.push({ type: "input_file", filename: filePart.filename, file_data: `data:${mime};base64,${base64}` });
  const payload = {
    model: OPENAI_MODEL,
    input: [{ role: "user", content }],
    temperature: 0,
    text: { format: { type: "json_schema", name: "order_book_invoice_extract", strict: true, schema: orderBookInvoiceSchema() } }
  };
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) return { message: json.error?.message || "Invoice extraction failed." };
  try {
    return JSON.parse(extractResponseText(json));
  } catch {
    return { message: "Invoice OCR response could not be parsed." };
  }
}

function normalizeOrderBookInvoiceExtraction(input = {}) {
  return {
    invoiceNo: cleanCell(input.invoiceNo),
    invoiceDate: parseServerDate(input.invoiceDate || input.date),
    totalAmount: parseLooseNumber(input.totalAmount || input.grandTotal || input.amountPayable || input.netTotal),
    remarks: cleanCell(input.remarks || input.message || ""),
    message: cleanCell(input.message || "")
  };
}

function isComfortZoneCompanyName(value) {
  const normalized = cleanCell(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return normalized.includes("comfort zone") && (
    normalized.includes("device") ||
    normalized.includes("devices") ||
    normalized.includes("a c") ||
    normalized.includes("ac ") ||
    normalized.includes("air conditioning")
  );
}

function parseLooseNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = String(value == null ? "" : value).replace(/,/g, "").replace(/[^\d.-]/g, "");
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : 0;
}

function orderBookPoSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      poNo: { type: "string" },
      poDate: { type: "string" },
      customer: { type: "string" },
      jobDescription: { type: "string" },
      location: { type: "string" },
      contactPerson: { type: "string" },
      contactNumber: { type: "string" },
      division: { type: "string" },
      valueWithoutVat: { type: "number" },
      vatAmount: { type: "number" },
      orderValue: { type: "number" },
      message: { type: "string" }
    },
    required: ["poNo", "poDate", "customer", "jobDescription", "location", "contactPerson", "contactNumber", "division", "valueWithoutVat", "vatAmount", "orderValue", "message"]
  };
}

function orderBookInvoiceSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      invoiceNo: { type: "string" },
      invoiceDate: { type: "string" },
      totalAmount: { type: "number" },
      remarks: { type: "string" },
      message: { type: "string" }
    },
    required: ["invoiceNo", "invoiceDate", "totalAmount", "remarks", "message"]
  };
}

function purchaseQuotationSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      supplierName: { type: "string" },
      supplierAddress: { type: "string" },
      trn: { type: "string" },
      quotationNo: { type: "string" },
      quotationDate: { type: "string" },
      projectName: { type: "string" },
      paymentTerms: { type: "string" },
      notes: { type: "string" },
      subtotal: { type: "number" },
      discount: { type: "number" },
      items: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            description: { type: "string" },
            modelNo: { type: "string" },
            qty: { type: "number" },
            unitPrice: { type: "number" },
            vatPercent: { type: "number" },
            amount: { type: "number" }
          },
          required: ["description", "modelNo", "qty", "unitPrice", "vatPercent", "amount"]
        }
      },
      message: { type: "string" }
    },
    required: ["supplierName", "supplierAddress", "trn", "quotationNo", "quotationDate", "projectName", "paymentTerms", "notes", "subtotal", "discount", "items", "message"]
  };
}

function deliveryNotePdfHtml(payload) {
  const dn = payload.deliveryNote || payload;
  const rows = (dn.lines || []).map((line, index) => `
    <tr>
      <td class="sl">${index + 1}</td>
      <td><strong>${esc(line.modelNo)}</strong><br><span>${esc(line.description)}</span></td>
      <td class="qty"><strong>${money(line.qtyGoingOut)}</strong><br><span>pcs</span></td>
    </tr>
  `).join("");
  const challanNo = deliveryChallanNo(dn.dnNo);
  const challanDate = formatChallanDate(todayISO());
  const letterhead = assetDataUri("assets/letterhead-full.jpg");
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>${esc(challanNo)} Delivery Challan</title>
  <style>
    @page { size: A4; margin: 0; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #f3f4f7; font-family: Arial, Helvetica, sans-serif; color: #111; }
    .page { position: relative; width: 210mm; min-height: 297mm; margin: 0 auto; background: #fff ${letterhead ? `url("${letterhead}")` : ""} center top / 210mm 297mm no-repeat; overflow: hidden; padding: 31mm 16mm 30mm; }
    .intro { display: grid; grid-template-columns: 1fr 1fr; gap: 18mm; align-items: start; }
    .company-block { margin-left: 5mm; margin-top: 7mm; font-size: 12px; line-height: 1.35; color: #343434; }
    .company-block strong { display: block; margin-bottom: 1mm; font-size: 13px; letter-spacing: .1px; }
    .title { text-align: right; margin-top: 14mm; }
    .title h1 { margin: 0 0 3mm; font-size: 32px; font-weight: 400; letter-spacing: .5px; }
    .title strong { font-size: 13px; }
    .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 18mm; margin-top: 18mm; font-size: 13px; align-items: start; }
    .deliver-to { line-height: 1.45; }
    .deliver-to .label { margin-bottom: 1mm; }
    .meta-table { width: 100%; border-collapse: collapse; }
    .meta-table td { padding: 0 0 4.5mm; border: 0; }
    .meta-table td:first-child { text-align: right; padding-right: 8mm; width: 45%; }
    .meta-table td:last-child { text-align: right; font-weight: 500; }
    .item-table { width: 100%; border-collapse: collapse; margin-top: 6mm; font-size: 13px; }
    .item-table th { background: #363837; color: #fff; padding: 3.3mm 4mm; font-weight: 400; text-align: left; }
    .item-table th.qty, .item-table td.qty { text-align: right; }
    .item-table td { border-bottom: 1px solid #9d9d9d; padding: 4mm; vertical-align: top; }
    .item-table td.sl { width: 11mm; text-align: center; }
    .item-table td.qty { width: 24mm; }
    .item-table td span { display: inline-block; margin-top: 1.5mm; font-size: 12px; }
    .receiver { width: 47%; margin: 16mm 0 0 auto; font-size: 14px; line-height: 2.2; }
    @media print { body { background: #fff; } .page { margin: 0; } }
  </style>
</head>
<body>
  <div class="page">
    <div class="intro">
      <div class="company-block">
        <strong>COMFORT ZONE A/C. DEVICES TR. LLC</strong>
        SHOWROOM 1<br>
        INDUSTRIAL AREA 18<br>
        SHARJAH Sharjah 343105<br>
        U.A.E<br>
        TRN 100543358400003<br>
        00971561772530<br>
        mudassir@comfortzoneuae.com<br>
        https://comfortzoneuae.com/
      </div>
      <div class="title">
        <h1>DELIVERY CHALLAN</h1>
        <strong>Delivery Challan# ${esc(challanNo)}</strong>
      </div>
    </div>
    <div class="meta">
      <div class="deliver-to">
        <div class="label">Deliver To</div>
        <strong>${esc(dn.customerName)}</strong><br>
        ${esc(dn.deliveryLocation)}<br>
        ${dn.phone ? `Tel: ${esc(dn.phone)}<br>` : ""}
        ${dn.contactPerson ? `Contact: ${esc(dn.contactPerson)}<br>` : ""}
        U.A.E
      </div>
      <table class="meta-table">
        <tr><td>Challan Date :</td><td>${esc(challanDate)}</td></tr>
        <tr><td>Ref :</td><td>${esc(dn.projectName)}</td></tr>
      </table>
    </div>
    <table class="item-table">
      <thead><tr><th style="width:12mm">#</th><th>Item &amp; Description</th><th class="qty">Qty</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="3">No items added.</td></tr>`}</tbody>
    </table>
    <div class="receiver">
      Receivers Name:<br>
      Receiver Number:<br>
      Date &amp; Signature:
    </div>
  </div>
</body>
</html>`;
}

function assetDataUri(relativePath) {
  const file = path.join(PUBLIC, relativePath);
  if (!fs.existsSync(file)) return "";
  const ext = path.extname(file).toLowerCase() === ".png" ? "png" : "jpeg";
  return `data:image/${ext};base64,${fs.readFileSync(file).toString("base64")}`;
}

function deliveryChallanNo(dnNo) {
  const text = String(dnNo || "DN").trim();
  const match = text.match(/^DN[-/ ]?(.+)$/i);
  return match ? `DN/${match[1]}` : text;
}

function formatChallanDate(dateValue) {
  const date = new Date(`${dateValue || todayISO()}T00:00:00`);
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }).replace(/ /g, " ");
}

function createPdfKitBuffer(draw) {
  if (!PDFDocument) throw new Error("PDF generation library is not available on this deployment.");
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 0, bufferPages: true });
    const chunks = [];
    doc.on("data", chunk => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    try {
      draw(doc);
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

function drawPdfText(doc, text, x, y, width, options = {}) {
  doc.font(options.bold ? "Helvetica-Bold" : "Helvetica")
    .fontSize(options.size || 9)
    .fillColor(options.color || "#07152f")
    .text(String(text ?? ""), x, y, {
      width,
      align: options.align || "left",
      lineGap: options.lineGap || 1
    });
}

function drawPdfTableCell(doc, text, x, y, width, height, options = {}) {
  doc.rect(x, y, width, height).stroke(options.border || "#c8d7ee");
  drawPdfText(doc, text, x + 5, y + 6, width - 10, {
    bold: options.bold,
    size: options.size || 8.5,
    align: options.align || "left",
    color: options.color || "#07152f"
  });
}

function pdfTextHeight(doc, text, width, size = 8.5) {
  doc.font("Helvetica").fontSize(size);
  return doc.heightOfString(String(text || ""), { width, lineGap: 1 });
}

function pdfWrapWords(doc, text, width, font = "Helvetica", size = 9) {
  const words = String(text || "").replace(/\r/g, "\n").split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";
  doc.font(font).fontSize(size);
  for (const word of words) {
    const candidate = `${current} ${word}`.trim();
    if (!current || doc.widthOfString(candidate) <= width) {
      current = candidate;
      continue;
    }
    lines.push(current);
    current = word;
    while (doc.widthOfString(current) > width && current.length > 1) {
      let cut = current.length;
      while (cut > 1 && doc.widthOfString(current.slice(0, cut)) > width) cut -= 1;
      lines.push(current.slice(0, cut));
      current = current.slice(cut);
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

function amountAed(value) {
  return `${money(value)} AED`;
}

async function deliveryNotePdfBuffer(payload) {
  return createPdfKitBuffer(doc => {
    const dn = payload.deliveryNote || payload || {};
    const pageWidth = 595.28;
    const pageHeight = 841.89;
    const letterhead = path.join(PUBLIC, "assets", "letterhead-full.jpg");
    const tableX = 46;
    const tableW = pageWidth - 92;
    const tableBottomY = 700;
    const rowH = 43;
    const drawBackground = () => {
      if (fs.existsSync(letterhead)) doc.image(letterhead, 0, 0, { width: pageWidth, height: pageHeight });
    };
    const drawHeaderBlock = pageIndex => {
      drawBackground();
      if (pageIndex > 0) return 120;
      doc.fillColor("#333333").font("Helvetica-Bold").fontSize(10.8).text("COMFORT ZONE A/C. DEVICES TR. LLC", 44, 136);
      doc.font("Helvetica").fontSize(9.5).text([
        "SHOWROOM 1",
        "INDUSTRIAL AREA 18",
        "SHARJAH Sharjah 343105",
        "U.A.E",
        "TRN 100543358400003",
        "00971561772530",
        "mudassir@comfortzoneuae.com",
        "https://comfortzoneuae.com/"
      ].join("\n"), 44, 150, { lineGap: 1.6 });

      const titleX = pageWidth - 39;
      doc.fillColor("#000000").font("Helvetica").fontSize(27).text("DELIVERY CHALLAN", 160, 151, { width: titleX - 160, align: "right" });
      doc.fillColor("#383838").font("Helvetica-Bold").fontSize(10).text(`Delivery Challan# ${deliveryChallanNo(dn.dnNo)}`, 160, 179, { width: titleX - 160, align: "right" });

      const metaTop = 260;
      doc.fillColor("#404040").font("Helvetica").fontSize(10.5).text("Deliver To", 47, metaTop);
      doc.font("Helvetica-Bold").fontSize(9.7).text(dn.customerName || "", 47, metaTop + 14);
      const deliverLines = [
        "U.A.E",
        dn.contactPerson,
        dn.phone
      ].filter(value => String(value || "").trim());
      doc.font("Helvetica").fontSize(9.7).text(deliverLines.join("\n"), 47, metaTop + 28, { width: 230, lineGap: 1.5 });

      const details = [
        ["Challan Date :", formatChallanDate(dn.date || todayISO())],
        ["Reference :", dn.projectName],
        ["Delivery Location :", dn.deliveryLocation]
      ].filter(([, value], index) => index === 0 || String(value || "").trim());
      const labelX = 330;
      const valueX = pageWidth - 45;
      doc.font("Helvetica").fontSize(10.5).fillColor("#404040");
      details.forEach(([label, value], index) => {
        const y = metaTop + 1 + index * 22;
        doc.text(label, labelX, y, { width: 110, align: "right" });
        doc.text(String(value || ""), valueX - 150, y, { width: 150, align: "right" });
      });
      return Math.max(350, metaTop + details.length * 22 + 20);
    };
    const drawTableHeader = y => {
      doc.rect(tableX, y, tableW, 24).fill("#383b39");
      doc.fillColor("#ffffff").font("Helvetica").fontSize(9.5);
      doc.text("#", tableX + 13, y + 8);
      doc.text("Item & Description", tableX + 40, y + 8);
      doc.text("Qty", tableX + tableW - 60, y + 8, { width: 52, align: "right" });
      return y + 24;
    };
    const drawLine = (line, index, rowY) => {
      const contentTop = rowY + 8;
      doc.fillColor("#000000").font("Helvetica").fontSize(9.5);
      doc.text(String(index + 1), tableX + 13, contentTop + 5);
      doc.text(line.modelNo || "", tableX + 40, contentTop, { width: tableW - 110 });
      doc.font("Helvetica").fontSize(8.4);
      const descLines = pdfWrapWords(doc, line.description || "", tableW - 120, "Helvetica", 8.4).slice(0, 2);
      descLines.forEach((desc, descIndex) => doc.text(desc, tableX + 40, contentTop + 13 + descIndex * 10, { width: tableW - 120 }));
      doc.font("Helvetica").fontSize(9.5).text(money(line.qtyGoingOut || line.quantity || 0), tableX + tableW - 70, contentTop, { width: 62, align: "right" });
      doc.font("Helvetica").fontSize(8.4).text("pcs", tableX + tableW - 70, contentTop + 14, { width: 62, align: "right" });
      doc.moveTo(tableX, rowY + rowH).lineTo(tableX + tableW, rowY + rowH).strokeColor("#9e9e9e").stroke();
      return rowY + rowH;
    };
    const drawReceiver = y => {
      const receiverY = y + 18;
      doc.fillColor("#000000").font("Helvetica").fontSize(10.5)
        .text("Receivers Name:", 345, receiverY)
        .text("Receiver Number:", 345, receiverY + 25)
        .text("Date & Signature:", 345, receiverY + 50);
    };

    const lines = dn.lines || [];
    let pageIndex = 0;
    let y = drawTableHeader(drawHeaderBlock(pageIndex));
    if (!lines.length) {
      doc.fillColor("#000000").font("Helvetica").fontSize(9.5).text("No items added.", tableX + 13, y + 10);
      drawReceiver(y + 40);
      return;
    }
    lines.forEach((line, index) => {
      if (y + rowH > tableBottomY) {
        doc.addPage({ size: "A4", margin: 0 });
        pageIndex += 1;
        y = drawTableHeader(drawHeaderBlock(pageIndex));
      }
      y = drawLine(line, index, y);
    });
    if (y + 95 > tableBottomY) {
      doc.addPage({ size: "A4", margin: 0 });
      pageIndex += 1;
      y = drawTableHeader(drawHeaderBlock(pageIndex));
    }
    drawReceiver(y);
  });
}

async function purchaseOrderPdfBuffer(order) {
  return createPdfKitBuffer(doc => {
    const pageWidth = 595.28;
    const pageHeight = 841.89;
    const left = 36;
    const letterhead = path.join(PUBLIC, "assets", "purchase-order-letterhead.jpg");
    const sealImage = path.join(PUBLIC, "assets", "seal-al-mahira-square.png");
    const fallbackSealImage = path.join(PUBLIC, "assets", "seal-al-mahira.png");
    const signImage = path.join(PUBLIC, "assets", "sign-2.jpg");
    const sansFont = "Helvetica";
    const sansBoldFont = "Helvetica-Bold";
    const green = "#00572e";
    const line = "#949494";
    const tableW = pageWidth - left * 2;
    const col = [42, 176, 66, 86, 50, tableW - 420];
    const py = (value, height = 0) => pageHeight - value - height;
    const firstTableY = 312;
    const nextTableY = 170;
    const tableBottomY = 765;

    const rowHeight = item => Math.max(28, 12 + Math.min(8, pdfWrapWords(doc, item.description || "", col[1] - 18, sansFont, 9.2).length) * 13);
    const paginate = items => {
      const pages = [];
      let current = [];
      let used = 0;
      let limit = tableBottomY - firstTableY - 30;
      for (const item of items) {
        const h = rowHeight(item);
        if (current.length && used + h > limit) {
          pages.push(current);
          current = [];
          used = 0;
          limit = tableBottomY - nextTableY - 30;
        }
        current.push(item);
        used += h;
      }
      pages.push(current);
      return pages;
    };

    const drawBackground = (pageNo, totalPages) => {
      if (fs.existsSync(letterhead)) doc.image(letterhead, 0, 0, { width: pageWidth, height: pageHeight });
    };

    const drawTitle = y => {
      doc.fillColor("#000000").font(sansBoldFont).fontSize(20).text("PURCHASE ORDER", 0, py(y, 20), { width: pageWidth, align: "center" });
    };

    const drawDetails = y => {
      const supplierLines = [order.supplierName, ...pdfWrapWords(doc, order.supplierAddress || "", 210, sansFont, 11).slice(0, 4), order.trn ? `VAT: ${order.trn}` : ""].filter(Boolean);
      doc.fillColor("#000000").font(sansFont).fontSize(11);
      supplierLines.slice(0, 7).forEach((lineText, index) => doc.text(lineText, left, py(y - index * 17, 11), { width: 230 }));
      const details = [
        ["PO No:", order.poNo],
        ["PO Date:", formatPdfDate(order.poDate)],
        ["Reference:", order.quotationNo],
        ["Payment Terms:", order.paymentTerms],
        ["Purchase Rep:", order.purchaseRepresentative]
      ].filter(([, value]) => String(value || "").trim());
      details.forEach(([label, value], index) => {
        const rowY = y - index * 18;
        doc.font(sansBoldFont).fontSize(11).text(label, pageWidth - 262, py(rowY, 11), { width: 100 });
        doc.font(sansFont).fontSize(10.5).text(String(value || ""), pageWidth - 180, py(rowY, 10.5), { width: 122, align: "right" });
      });
    };

    const drawHeader = y => {
      const headers = ["S.No", "Item Description", "QTY", "UNIT PRICE", "TAXES", "AMOUNT"];
      const top = py(y, 30);
      doc.rect(left, top, tableW, 30).fill(green);
      let x = left;
      headers.forEach((header, index) => {
        doc.moveTo(x, top).lineTo(x, top + 30).strokeColor("#bfbfbf").lineWidth(0.45).stroke();
        doc.fillColor("#ffffff").font(sansBoldFont).fontSize(10.5);
        doc.text(header, x + (index === 1 ? 10 : 0), top + 10, { width: col[index], align: index === 1 ? "left" : "center" });
        x += col[index];
      });
      doc.moveTo(x, top).lineTo(x, top + 30).stroke();
      return top + 30;
    };

    const drawRow = (item, top, serial) => {
      const h = rowHeight(item);
      doc.rect(left, top, tableW, h).strokeColor(line).lineWidth(0.45).stroke();
      let x = left;
      for (const width of col.slice(0, -1)) {
        x += width;
        doc.moveTo(x, top).lineTo(x, top + h).stroke();
      }
      const midY = top + h / 2 - 5;
      doc.fillColor("#000000").font(sansFont).fontSize(10.2);
      doc.text(String(serial), left, midY, { width: col[0], align: "center" });
      const descLines = pdfWrapWords(doc, item.description || "", col[1] - 18, sansFont, 9.2).slice(0, 8);
      let descY = top + (h - descLines.length * 13) / 2;
      doc.font(sansFont).fontSize(9.2);
      descLines.forEach(lineText => {
        doc.text(lineText, left + col[0] + 10, descY, { width: col[1] - 18 });
        descY += 13;
      });
      const qtyX = left + col[0] + col[1];
      doc.font(sansFont).fontSize(10.2);
      doc.text(`${money(item.qty)} Nos`, qtyX, midY, { width: col[2], align: "center" });
      doc.text(money(item.unitPrice), qtyX + col[2], midY, { width: col[3], align: "center" });
      doc.text(`${String(money(item.vatPercent || 5)).replace(/\.00$/, "")}%`, qtyX + col[2] + col[3], midY, { width: col[4], align: "center" });
      doc.text(money(Number(item.qty || 0) * Number(item.unitPrice || 0)), qtyX + col[2] + col[3] + col[4], midY, { width: col[5], align: "center" });
      return top + h;
    };

    const drawSummary = (top) => {
      const valueW = col[5];
      const labelW = 122;
      const summaryW = labelW + valueW;
      const x = left + tableW - summaryW;
      const itemSubtotal = (order.items || []).reduce((sum, item) => {
        const savedAmount = Number(item.amount || 0);
        const lineAmount = savedAmount || Number(item.qty || 0) * Number(item.unitPrice || 0);
        return sum + lineAmount;
      }, 0);
      const subtotal = Number(order.subtotal || itemSubtotal);
      const discount = Number(order.discount || 0);
      const totalAfterDiscount = Number.isFinite(Number(order.totalAfterDiscount))
        ? Number(order.totalAfterDiscount)
        : subtotal - discount;
      const vatTotal = Number.isFinite(Number(order.vatTotal))
        ? Number(order.vatTotal)
        : totalAfterDiscount * 0.05;
      const grandTotal = Number.isFinite(Number(order.grandTotal))
        ? Number(order.grandTotal)
        : totalAfterDiscount + vatTotal;
      const rows = [["Subtotal", amountAed(subtotal)]];
      if (discount) {
        rows.push(["Discount", `-${amountAed(discount)}`]);
        rows.push(["Total After Discount", amountAed(totalAfterDiscount)]);
      }
      rows.push(["VAT Total", amountAed(vatTotal)], ["Grand Total", amountAed(grandTotal)]);
      rows.forEach(([label, value], index) => {
        const isLast = index === rows.length - 1;
        const boldSummaryLabel = ["Subtotal", "VAT Total", "Grand Total"].includes(label);
        const rowTop = top + index * 34;
        doc.rect(x, rowTop, summaryW, 34).fillAndStroke(isLast ? green : "#ffffff", line);
        doc.moveTo(x + labelW, rowTop).lineTo(x + labelW, rowTop + 34).stroke();
        doc.fillColor(isLast ? "#ffffff" : "#000000").font(boldSummaryLabel ? sansBoldFont : sansFont).fontSize(10.5);
        doc.text(label, x + 8, rowTop + 11, { width: labelW - 14 });
        doc.font(isLast ? sansBoldFont : sansFont);
        doc.text(value, x + labelW + 8, rowTop + 11, { width: valueW - 16, align: "right" });
      });
      return top + rows.length * 34;
    };

    const summaryRowCount = () => {
      const discount = Number(order.discount || 0);
      return 1 + (discount ? 2 : 0) + 2;
    };

    const estimateNotesHeight = maxLines => {
      const lines = String(order.notes || DEFAULT_PURCHASE_NOTES).replace(/\r/g, "\n").split("\n");
      return 22 + Math.min(lines.length, maxLines) * 15;
    };

    const estimateFinalBlockBottom = (tableEndY, finalStartY, notesBesideSummary) => {
      const summaryBottom = finalStartY + summaryRowCount() * 34;
      const notesTop = notesBesideSummary ? tableEndY + 20 : summaryBottom + 14;
      const afterNotes = notesTop + estimateNotesHeight(notesBesideSummary ? 8 : 12);
      const sealTop = Math.min(afterNotes + 10, pageHeight - 220);
      if (sealTop < afterNotes) return Infinity;
      return Math.max(summaryBottom, sealTop + 131);
    };

    const drawNotes = (x, top, width, maxLines = 12) => {
      doc.fillColor("#000000").font(sansBoldFont).fontSize(10).text("Note:", x, top);
      top += 22;
      doc.font(sansFont).fontSize(9.8);
      const lines = String(order.notes || DEFAULT_PURCHASE_NOTES).replace(/\r/g, "\n").split("\n");
      for (const lineText of lines.slice(0, maxLines)) {
        const wrapped = pdfWrapWords(doc, lineText, width, sansFont, 9.8).slice(0, 4);
        wrapped.forEach(w => {
          doc.text(w, x, top, { width });
          top += 15;
        });
      }
      return top;
    };

    const drawSealAndSign = top => {
      const sealTop = Math.min(top + 10, pageHeight - 220);
      const sealSource = fs.existsSync(sealImage) ? sealImage : fallbackSealImage;
      const sealSize = 131;
      if (fs.existsSync(sealSource)) doc.image(sealSource, left + 22, sealTop, { width: sealSize, height: sealSize });
      if (fs.existsSync(signImage)) doc.image(signImage, left + 168, sealTop + 50, { width: 82, height: 42 });
    };

    const pages = paginate(order.items || []);
    const totalPages = pages.length;
    pages.forEach((items, pageIndex) => {
      if (pageIndex > 0) doc.addPage({ size: "A4", margin: 0 });
      drawBackground(pageIndex + 1, totalPages);
      if (pageIndex === 0) drawTitle(704);
      if (pageIndex === 0) drawDetails(662);
      let y = drawHeader(pageHeight - (pageIndex === 0 ? firstTableY : nextTableY));
      const startIndex = pages.slice(0, pageIndex).reduce((sum, page) => sum + page.length, 0);
      items.forEach((item, index) => {
        y = drawRow(item, y, startIndex + index + 1);
      });
      if (pageIndex === totalPages - 1) {
        let finalStartY = y + 14;
        if (finalStartY + summaryRowCount() * 34 > tableBottomY) {
          doc.addPage({ size: "A4", margin: 0 });
          drawBackground(pageIndex + 2, totalPages + 1);
          finalStartY = 145;
          y = 145;
        }
        let notesBesideSummary = items.length && estimateFinalBlockBottom(y, finalStartY, true) <= tableBottomY;
        if (estimateFinalBlockBottom(y, finalStartY, notesBesideSummary) > tableBottomY) {
          notesBesideSummary = false;
        }
        const summaryBottom = drawSummary(finalStartY);
        const notesY = notesBesideSummary ? y + 20 : summaryBottom + 14;
        if (estimateFinalBlockBottom(y, finalStartY, notesBesideSummary) > tableBottomY) {
          doc.addPage({ size: "A4", margin: 0 });
          drawBackground(pageIndex + 2, totalPages + 1);
          const afterNotesY = drawNotes(left, 145, tableW, 12);
          drawSealAndSign(afterNotesY);
          return;
        }
        const afterNotesY = drawNotes(left, notesY, notesBesideSummary ? 280 : tableW, notesBesideSummary ? 8 : 12);
        drawSealAndSign(afterNotesY);
      }
    });
  });
}

function purchaseOrderPdfFilename(order) {
  const supplier = safeName(order.supplierName || "Supplier").replace(/\s+/g, "-");
  return `${safeName(order.poNo || "PO")}-${supplier}.pdf`.replace(/"/g, "");
}

async function salesQuotationPdfBuffer(payload) {
  if (PDFDocument) return salesQuotationPdfKitBuffer(payload);
  const input = {
    ...(payload || {}),
    letterheadPath: path.join(PUBLIC, "assets", "quotation-letterhead.jpg")
  };
  const result = spawnSync(PYTHON_EXE, [SALES_QUOTATION_PDF_SCRIPT], {
    input: JSON.stringify(input),
    maxBuffer: 15 * 1024 * 1024
  });
  if (result.status !== 0) {
    const message = result.stderr ? result.stderr.toString("utf8") : "Unknown quotation PDF generation error";
    throw new Error(message);
  }
  return result.stdout;
}

function salesQuotationPdfKitBuffer(payload) {
  return new Promise((resolve, reject) => {
    const quote = payload.quote || payload;
    const customer = payload.customer || {};
    const doc = new PDFDocument({ size: "A4", margin: 0, bufferPages: true });
    const chunks = [];
    doc.on("data", chunk => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const pageWidth = 595.28;
    const pageHeight = 841.89;
    const left = 46;
    const tableWidth = pageWidth - left * 2;
    const bottom = 86;
    const letterhead = path.join(PUBLIC, "assets", "quotation-letterhead.jpg");

    const drawBackground = () => {
      if (fs.existsSync(letterhead)) {
        doc.image(letterhead, 0, 0, { width: pageWidth, height: pageHeight });
      }
      doc.fillColor("#000000").strokeColor("#c5cddb").lineWidth(0.6);
    };

    const addPage = () => {
      doc.addPage({ size: "A4", margin: 0 });
      drawBackground();
      return 142;
    };

    const writeWrapped = (text, x, y, width, options = {}) => {
      doc.font(options.bold ? "Helvetica-Bold" : "Helvetica").fontSize(options.size || 8.6).fillColor("#000000");
      doc.text(String(text || ""), x, y, {
        width,
        align: options.align || "left",
        lineGap: options.lineGap || 1
      });
    };

    const textHeight = (text, width, size = 8.6) => {
      doc.font("Helvetica").fontSize(size);
      return doc.heightOfString(String(text || ""), { width, lineGap: 1 });
    };

    const detailTable = (x, y, width) => {
      const labelW = 88;
      const valueW = 168;
      const label2W = 96;
      const value2W = width - labelW - valueW - label2W;
      const rowH = 25;
      const rows = [
        ["Customer:", quote.customer, "Date:", formatPdfDate(quote.date)],
        ["Contact Person:", customer.contact, "Quotation No:", quote.no],
        ["Email:", customer.email, "Salesperson:", quote.salesperson],
        ["Payment Terms:", quote.paymentTerms, "Availability:", quote.deliveryTime]
      ];
      const height = rowH * (rows.length + 1);
      doc.rect(x, y, width, height).stroke("#000000");
      let rowY = y;
      for (const row of rows) {
        doc.moveTo(x, rowY + rowH).lineTo(x + width, rowY + rowH).stroke();
        const colX = [x + labelW, x + labelW + valueW, x + labelW + valueW + label2W];
        for (const lineX of colX) doc.moveTo(lineX, rowY).lineTo(lineX, rowY + rowH).stroke();
        writeWrapped(row[0], x + 6, rowY + 8, labelW - 10, { bold: true });
        writeWrapped(row[1], x + labelW + 6, rowY + 8, valueW - 10);
        writeWrapped(row[2], x + labelW + valueW + 6, rowY + 8, label2W - 10, { bold: true });
        writeWrapped(row[3], x + labelW + valueW + label2W + 6, rowY + 8, value2W - 10);
        rowY += rowH;
      }
      doc.moveTo(x + labelW, rowY).lineTo(x + labelW, rowY + rowH).stroke();
      writeWrapped("Project:", x + 6, rowY + 8, labelW - 10, { bold: true });
      writeWrapped(quote.project, x + labelW + 6, rowY + 8, width - labelW - 10);
      return y + height;
    };

    const drawItemHeader = y => {
      const widths = [42, tableWidth - 162, 60, 60];
      doc.rect(left, y, tableWidth, 22).fillAndStroke("#e1e5eb", "#c5cddb");
      let x = left;
      ["S. No.", "Description", "Qty", "Unit"].forEach((title, index) => {
        doc.strokeColor("#c5cddb").moveTo(x, y).lineTo(x, y + 22).stroke();
        doc.font("Helvetica-Bold").fontSize(8.4).fillColor("#000000")
          .text(title, x + 4, y + 7, { width: widths[index] - 8, align: "center" });
        x += widths[index];
      });
      doc.moveTo(left + tableWidth, y).lineTo(left + tableWidth, y + 22).stroke();
      return { y: y + 22, widths };
    };

    const drawItemRow = (item, serial, y, widths) => {
      const descriptionHeight = textHeight(item.description, widths[1] - 14, 8.4);
      const rowH = Math.max(24, descriptionHeight + 14);
      if (y + rowH > pageHeight - bottom - 90) {
        y = addPage();
        ({ y, widths } = drawItemHeader(y));
      }
      doc.rect(left, y, tableWidth, rowH).stroke("#c5cddb");
      let x = left;
      for (const width of widths.slice(0, -1)) {
        x += width;
        doc.moveTo(x, y).lineTo(x, y + rowH).stroke();
      }
      const mid = y + rowH / 2 - 4;
      writeWrapped(serial, left + 4, mid, widths[0] - 8, { align: "center" });
      writeWrapped(item.description, left + widths[0] + 8, y + 8, widths[1] - 14, { size: 8.4 });
      writeWrapped(trimNumber(item.qty), left + widths[0] + widths[1] + 4, mid, widths[2] - 8, { align: "center" });
      writeWrapped(item.unit || "Nos", left + widths[0] + widths[1] + widths[2] + 4, mid, widths[3] - 8, { align: "center" });
      return y + rowH;
    };

    const drawSummary = y => {
      const itemSubtotal = (quote.items || []).reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.unitPrice || 0), 0);
      const manual = String(quote.manualSubtotal || "").replace(/,/g, "").trim();
      const subtotal = manual ? Number(manual || 0) : itemSubtotal;
      const discount = Number(quote.discount || 0);
      const taxable = Math.max(0, subtotal - discount);
      const vat = taxable * 0.05;
      const net = taxable + vat;
      const rows = [["Total", money(subtotal)]];
      if (discount) {
        rows.push(["Discount", `-${money(discount)}`]);
        rows.push(["Subtotal", money(taxable)]);
      }
      rows.push(["VAT 5%", money(vat)], ["Net Amount", money(net)]);
      y += 15;
      for (const [label, value] of rows) {
        doc.font("Helvetica-Bold").fontSize(8.5).fillColor("#000000");
        doc.text(label, left + tableWidth - 155, y, { width: 80, align: "right" });
        doc.text(value, left + tableWidth - 70, y, { width: 70, align: "right" });
        y += 14;
      }
      return y + 8;
    };

    const drawBlock = (title, text, y) => {
      if (!String(text || "").trim()) return y;
      if (y > pageHeight - bottom - 50) y = addPage();
      doc.font("Helvetica-Bold").fontSize(9).fillColor("#000000").text(title, left, y, { width: tableWidth });
      y += 16;
      doc.font("Helvetica").fontSize(8.3);
      for (const raw of String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n")) {
        const height = doc.heightOfString(raw || " ", { width: tableWidth, lineGap: 2 });
        if (y + height > pageHeight - bottom) y = addPage();
        doc.text(raw || " ", left, y, { width: tableWidth, lineGap: 2 });
        y += Math.max(11, height);
      }
      return y + 8;
    };

    drawBackground();
    doc.font("Helvetica-Bold").fontSize(14.5).fillColor("#07152f").text("Quotation", 0, 124, { width: pageWidth, align: "center" });
    let y = detailTable(left, 154, tableWidth) + 20;
    doc.font("Helvetica-Bold").fontSize(9.3).fillColor("#000000").text("Subject: Supply of Daikin AC Units", left, y);
    y += 18;
    doc.font("Helvetica").fontSize(8.9).text("Thank you very much for your valid enquiry. We are offering our best quote as below.", left, y);
    y += 31;
    let header = drawItemHeader(y);
    y = header.y;
    for (let index = 0; index < (quote.items || []).length; index += 1) {
      y = drawItemRow(quote.items[index], index + 1, y, header.widths);
    }
    y = drawSummary(y);
    y = drawBlock("Notes", quote.notes, y);
    y = drawBlock("Terms & Conditions", quote.terms, y);
    doc.end();
  });
}

function formatPdfDate(value) {
  const text = String(value || "").trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  const dmy = text.match(/^(\d{2})[-/](\d{2})[-/](\d{4})/);
  if (dmy) return `${dmy[1]}/${dmy[2]}/${dmy[3]}`;
  return text;
}

function trimNumber(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return String(value || "");
  return String(number).replace(/\.0+$/, "");
}

function salesQuotationPdfFilename(quote) {
  const customer = safeName(quote.customer || "Customer").replace(/\s+/g, "-");
  return `${safeName(quote.no || "Quotation")}-${customer}.pdf`.replace(/"/g, "");
}

function extractVrvFile(file, originalName) {
  const ext = path.extname(originalName).toLowerCase();
  if (![".docx", ".xml"].includes(ext)) {
    return {
      status: "needs_parser",
      materialRows: [],
      vrvRows: [],
      projectName: "",
      message: "Automatic VRV extraction is available for DOCX in this MVP. PDF/image parsing needs OCR."
    };
  }
  const bytes = Buffer.isBuffer(file) ? file : fs.readFileSync(file);
  const textStart = bytes.subarray(0, 120).toString("utf8").trimStart();
  const documentXml = textStart.startsWith("<")
    ? bytes.toString("utf8")
    : unzipEntries(bytes)["word/document.xml"];
  if (!documentXml) return { status: "error", materialRows: [], vrvRows: [], projectName: "", message: "Could not read DOCX document.xml" };
  const text = xmlText(documentXml);
  const projectMatch = text.match(/Project name:\s*([^\n]+)/i);
  const projectName = projectMatch ? projectMatch[1].trim() : "";
  const materialRows = extractMaterialRows(documentXml);
  const vrvRows = extractVrvRows(documentXml, text);
  return {
    status: materialRows.length || vrvRows.length ? "ok" : "empty",
    materialRows,
    vrvRows,
    projectName,
    message: materialRows.length || vrvRows.length ? "VRV report extracted." : "No material rows were detected."
  };
}

function unzipEntries(buffer) {
  const entries = {};
  let offset = 0;
  while (offset < buffer.length - 30) {
    const sig = buffer.readUInt32LE(offset);
    if (sig !== 0x04034b50) {
      offset += 1;
      continue;
    }
    const method = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const uncompressedSize = buffer.readUInt32LE(offset + 22);
    const nameLen = buffer.readUInt16LE(offset + 26);
    const extraLen = buffer.readUInt16LE(offset + 28);
    const name = buffer.subarray(offset + 30, offset + 30 + nameLen).toString("utf8");
    const start = offset + 30 + nameLen + extraLen;
    const compressed = buffer.subarray(start, start + compressedSize);
    if (method === 0) entries[name] = compressed.toString("utf8");
    if (method === 8) entries[name] = zlib.inflateRawSync(compressed, { finishFlush: zlib.constants.Z_SYNC_FLUSH }).toString("utf8");
    offset = start + compressedSize;
    if (!compressedSize && !uncompressedSize) break;
  }
  return entries;
}

function unzipEntriesBuffer(buffer) {
  const entries = {};
  let offset = 0;
  while (offset < buffer.length - 30) {
    const sig = buffer.readUInt32LE(offset);
    if (sig !== 0x04034b50) {
      offset += 1;
      continue;
    }
    const method = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const uncompressedSize = buffer.readUInt32LE(offset + 22);
    const nameLen = buffer.readUInt16LE(offset + 26);
    const extraLen = buffer.readUInt16LE(offset + 28);
    const name = buffer.subarray(offset + 30, offset + 30 + nameLen).toString("utf8");
    const start = offset + 30 + nameLen + extraLen;
    const compressed = buffer.subarray(start, start + compressedSize);
    let data = Buffer.alloc(0);
    if (method === 0) data = Buffer.from(compressed);
    if (method === 8) data = zlib.inflateRawSync(compressed, { finishFlush: zlib.constants.Z_SYNC_FLUSH });
    entries[name] = { name, data, method, uncompressedSize };
    offset = start + compressedSize;
    if (!compressedSize && !uncompressedSize) break;
  }
  return entries;
}

function zipEntries(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const name of Object.keys(entries)) {
    const data = Buffer.isBuffer(entries[name].data) ? entries[name].data : Buffer.from(entries[name].data);
    const compressed = zlib.deflateRawSync(data);
    const nameBuffer = Buffer.from(name, "utf8");
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuffer.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, nameBuffer, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuffer.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, nameBuffer);
    offset += local.length + nameBuffer.length + compressed.length;
  }
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(Object.keys(entries).length, 8);
  end.writeUInt16LE(Object.keys(entries).length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, ...centralParts, end]);
}

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let j = 0; j < 8; j += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function xmlText(xml) {
  return xml
    .replace(/<w:br\/>/g, "\n")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n");
}

function extractTables(xml) {
  const tables = [];
  const tblMatches = xml.match(/<w:tbl[\s\S]*?<\/w:tbl>/g) || [];
  for (const tbl of tblMatches) {
    const rows = [];
    const trMatches = tbl.match(/<w:tr[\s\S]*?<\/w:tr>/g) || [];
    for (const tr of trMatches) {
      const cells = [];
      const tcMatches = tr.match(/<w:tc[\s\S]*?<\/w:tc>/g) || [];
      for (const tc of tcMatches) cells.push(xmlText(tc).trim());
      rows.push(cells);
    }
    tables.push(rows);
  }
  return tables;
}

function extractMaterialRows(xml) {
  const tables = extractTables(xml);
  const material = tables.find(table => {
    const h = (table[0] || []).join("|").toLowerCase();
    return h.includes("model") && h.includes("quantity") && h.includes("description");
  });
  if (!material) return [];
  return material.slice(1)
    .map(row => ({ model: cleanCell(row[0]), qty: Number(cleanCell(row[1])) || cleanCell(row[1]), description: cleanCell(row[2]) }))
    .filter(row => row.model && String(row.model).toLowerCase() !== "model");
}

function outdoorModelFromCell(value) {
  const match = cleanCell(value).match(/(?:RXY[A-Z0-9]+|RXQ[A-Z0-9]+)/i);
  return match ? match[0].toUpperCase() : "";
}

function normalizeVrvSystemName(value) {
  const raw = cleanCell(value).toUpperCase().replace(/[.。]+$/g, "");
  const match = raw.match(/^VRV-[A-Z0-9-]+/i);
  return match ? match[0].toUpperCase() : raw;
}

function fcuNameFromCells(cells) {
  for (const cell of cells) {
    const match = cleanCell(cell).match(/\bFCU-[A-Z0-9-]+\b/i);
    if (match) return match[0].toUpperCase();
  }
  return "";
}

function indoorModelFromCells(cells) {
  for (const cell of cells) {
    const match = cleanCell(cell).match(/\bFX[A-Z0-9-]{2,}\b/i);
    if (match) return match[0].toUpperCase();
  }
  return "";
}

function systemFromName(name, systemByPrefix, fallbackSystem = "") {
  const prefix = (cleanCell(name).match(/^FCU-([A-Z0-9]+)/i) || [])[1] || "";
  if (prefix) {
    const normalizedPrefix = prefix.toUpperCase();
    return systemByPrefix[normalizedPrefix] || fallbackSystem || `VRV-${normalizedPrefix}`;
  }
  const floorPrefix = (cleanCell(name).match(/\b(BF|GF|FF|RF|B[0-9]+|G[0-9]+|F[0-9]+|R[0-9]+)\b/i) || [])[1] || "";
  if (floorPrefix && systemByPrefix[floorPrefix.toUpperCase()]) return systemByPrefix[floorPrefix.toUpperCase()];
  return fallbackSystem || "";
}

function extractOutdoorDetailRefs(tables) {
  const refsBySystem = {};
  for (const table of tables) {
    const headRows = table.slice(0, 3).flat().map(cleanCell).join("|").toLowerCase();
    const header = (table[0] || []).map(cleanCell).join("|").toLowerCase();
    if (!header.includes("name") || !header.includes("model")) continue;
    const hasOutdoorColumns = headRows.includes("mca") || headRows.includes("wxhxd") || headRows.includes("weight") || headRows.includes("ps");
    const hasOutdoorRows = table.some(row => /^VRV-/i.test(cleanCell(row[0])) && outdoorModelFromCell(row[1]));
    if (!hasOutdoorColumns || !hasOutdoorRows) continue;

    let currentSystem = "";
    for (const row of table.slice(2)) {
      const outdoorName = normalizeVrvSystemName(row[0]);
      const outdoorModel = outdoorModelFromCell(row[1]);
      if (!outdoorName || !outdoorModel) continue;
      if (/^VRV-[A-Z0-9-]+$/i.test(outdoorName)) {
        currentSystem = outdoorName;
        refsBySystem[currentSystem] = refsBySystem[currentSystem] || [];
        refsBySystem[currentSystem].push({
          outdoorName: currentSystem,
          outdoorModel,
          outdoorComponents: []
        });
      } else if (/^[A-Z]$/i.test(outdoorName) && currentSystem) {
        refsBySystem[currentSystem] = refsBySystem[currentSystem] || [];
        refsBySystem[currentSystem].push({
          outdoorName,
          outdoorModel,
          outdoorComponents: []
        });
      }
    }
  }

  for (const refs of Object.values(refsBySystem)) {
    const parent = refs.find(ref => /^VRV-/i.test(ref.outdoorName));
    if (parent) {
      parent.outdoorComponents = refs
        .filter(ref => !/^VRV-/i.test(ref.outdoorName))
        .map(ref => ref.outdoorModel)
        .filter(Boolean);
    }
  }
  return refsBySystem;
}

function extractIndoorGroups(tables, systemByPrefix, outdoorRefsBySystem) {
  const rows = [];
  const systemsInReport = Object.keys(outdoorRefsBySystem);
  const seenGroups = new Set();
  let systemIndex = 0;

  for (const table of tables) {
    const header = (table[0] || []).map(cleanCell);
    const headerText = table.slice(0, 3).flat().map(cleanCell).join("|").toLowerCase();
    const nameIndex = header.findIndex(cell => /^name$/i.test(cell));
    const fcuIndex = header.findIndex(cell => /^fcu$/i.test(cell) || /^model$/i.test(cell));
    const isIndoorCoolingTable = nameIndex >= 0 && fcuIndex >= 0 && (
      headerText.includes("rq tc") ||
      headerText.includes("max tc") ||
      headerText.includes("<r:tableofabbreviationscooling>") ||
      header.some(cell => /cooling/i.test(cell))
    );
    if (!isIndoorCoolingTable) continue;

    const dataRows = [];
    for (const row of table.slice(1)) {
      const cells = row.map(cleanCell);
      const name = cells[nameIndex] || fcuNameFromCells(cells);
      const fcu = indoorModelFromCells([cells[fcuIndex]]) || indoorModelFromCells(cells);
      if (!name || !fcu) continue;
      dataRows.push({ name, fcu });
    }
    if (!dataRows.length) continue;

    const signature = dataRows.map(row => `${row.name}|${row.fcu}`).join(";");
    if (seenGroups.has(signature)) continue;
    seenGroups.add(signature);

    const firstNamedSystem = systemFromName(dataRows[0].name, systemByPrefix, "");
    const fallbackSystem = firstNamedSystem || systemsInReport[systemIndex] || "";
    for (const row of dataRows) {
      rows.push({
        system: systemFromName(row.name, systemByPrefix, fallbackSystem),
        name: row.name,
        fcu: row.fcu,
        outdoorName: "",
        outdoorModel: ""
      });
    }
    systemIndex += 1;
  }

  return rows;
}

function extractVrvRows(xml, text) {
  const systemByPrefix = {};
  const outdoorBySystem = {};
  const tables = extractTables(xml);
  const outdoorRefsBySystem = extractOutdoorDetailRefs(tables);
  for (const system of Object.keys(outdoorRefsBySystem)) {
    systemByPrefix[system.replace(/^VRV-/i, "").toUpperCase()] = system;
  }
  const systemLines = text.split("\n").filter(line => /^VRV-[A-Z0-9]+/i.test(line.trim()));
  for (const line of systemLines) {
    const system = (line.match(/^(VRV-[A-Z0-9]+)/i) || [])[1];
    if (system) {
      const normalizedSystem = system.toUpperCase();
      systemByPrefix[system.replace(/^VRV-/i, "").toUpperCase()] = normalizedSystem;
      const main = (line.match(/-\s*((?:RXY[A-Z0-9]+|RXQ[A-Z0-9]+))\s*=/i) || [])[1];
      const componentsPart = line.includes("=") ? line.split("=").slice(1).join("=") : "";
      const components = (componentsPart.match(/(?:RXY[A-Z0-9]+|RXQ[A-Z0-9]+)/gi) || []).map(part => cleanCell(part).toUpperCase());
      if (main || components.length) {
        outdoorBySystem[normalizedSystem] = { main, components };
      }
    }
  }
  const rows = extractIndoorGroups(tables, systemByPrefix, outdoorRefsBySystem);
  if (!rows.length) {
    for (const line of text.split("\n")) {
      const cells = line.split(/\s{2,}|\t|\|/);
      const name = fcuNameFromCells(cells);
      const fcu = indoorModelFromCells(cells);
      if (!name || !fcu) continue;
      rows.push({ system: systemFromName(name, systemByPrefix), name, fcu, outdoorName: "", outdoorModel: "" });
    }
  }
  const uniqueRows = rows;
  const rowsBySystem = {};
  for (const row of uniqueRows) {
    rowsBySystem[row.system] = rowsBySystem[row.system] || [];
    rowsBySystem[row.system].push(row);
  }
  for (const [system, systemRows] of Object.entries(rowsBySystem)) {
    const info = outdoorBySystem[system];
    let assignments = outdoorRefsBySystem[system] || [];
    if (!assignments.length && info) {
      assignments = [];
      if (info.main) {
        assignments.push({
          outdoorName: system,
          outdoorModel: info.main.toUpperCase(),
          outdoorComponents: info.components
        });
      }
      info.components.forEach((model, index) => {
        assignments.push({
          outdoorName: String.fromCharCode(65 + index),
          outdoorModel: model.toUpperCase(),
          outdoorComponents: []
        });
      });
    }
    if (!assignments.length) continue;
    if (systemRows[0]) systemRows[0].outdoorRefs = assignments;
    const startIndex = systemRows.length <= 5 ? 1 : 2;
    assignments.forEach((assignment, index) => {
      const target = systemRows[startIndex + index];
      if (!target) return;
      target.outdoorName = assignment.outdoorName;
      target.outdoorModel = assignment.outdoorModel;
      target.outdoorComponents = assignment.outdoorComponents || [];
    });
    if (systemRows[startIndex] && assignments[0]?.outdoorComponents?.length) {
      systemRows[startIndex].outdoorComponents = assignments[0].outdoorComponents;
    }
  }
  return uniqueRows;
}

function cleanCell(value) {
  return String(value == null ? "" : value).replace(/\s+/g, " ").trim();
}

function cleanMultilineCell(value) {
  return String(value == null ? "" : value)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map(line => line.replace(/[ \t]+/g, " ").trimEnd())
    .join("\n")
    .trim();
}

function esc(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function tableWorkbookHtml(title, columns, rows, summaryRows) {
  const head = columns.map(col => `<td><b>${esc(col)}</b></td>`).join("");
  const body = rows.map(row => `<tr>${columns.map(col => `<td>${esc(row[col])}</td>`).join("")}</tr>`).join("");
  const summaryPad = Math.max(columns.length - 2, 0);
  const summary = summaryRows.map(row => `<tr>${Array.from({ length: summaryPad }, () => "<td></td>").join("")}<td><b>${esc(row.label)}</b></td><td><b>${esc(row.value)}</b></td></tr>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="ProgId" content="Excel.Sheet"><style>table{border-collapse:collapse}td{border:1px solid #d9d9d9;padding:2px 4px;vertical-align:top}</style></head><body><table><tbody><tr>${head}</tr>${body}${summary}</tbody></table></body></html>`;
}

function generateTableWorkbook(payload = {}) {
  const columns = Array.isArray(payload.columns) ? payload.columns.map(cleanCell).filter(Boolean) : [];
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  const summaryRows = Array.isArray(payload.summaryRows) ? payload.summaryRows : [];
  const columnCount = Math.max(columns.length, 2);
  const sheetRows = [];

  if (columns.length) {
    sheetRows.push(costingRowXml(1, columns.map((column, index) => ({
      column: index + 1,
      value: column,
      style: 1
    }))));
  }

  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    sheetRows.push(costingRowXml(rowNumber, columns.map((column, columnIndex) => {
      const value = numberOrText(row?.[column]);
      return {
        column: columnIndex + 1,
        value,
        style: typeof value === "number" ? 4 : 2
      };
    })));
  });

  const summaryStart = rows.length + 2;
  summaryRows.forEach((item, index) => {
    const value = numberOrText(item?.value);
    sheetRows.push(costingRowXml(summaryStart + index, [
      { column: columnCount - 1, value: item?.label || "", style: 6 },
      { column: columnCount, value, style: typeof value === "number" ? 7 : 6 }
    ]));
  });

  const lastRow = Math.max(1, rows.length + 1, summaryStart + summaryRows.length - 1);
  const colsXml = columns.map((column, index) => {
    const width = tableColumnWidth(column, rows);
    return `    <col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`;
  }).join("\n");
  const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <dimension ref="A1:${xlsxColumnName(columnCount)}${lastRow}"/>
  <sheetViews><sheetView showGridLines="1" workbookViewId="0"/></sheetViews>
  <sheetFormatPr defaultRowHeight="15"/>
  ${colsXml ? `<cols>\n${colsXml}\n  </cols>` : ""}
  <sheetData>${sheetRows.join("")}</sheetData>
  <pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>
</worksheet>`;

  return zipEntries({
    "[Content_Types].xml": { data: Buffer.from(costingContentTypesXml(), "utf8") },
    "_rels/.rels": { data: Buffer.from(costingRootRelsXml(), "utf8") },
    "docProps/app.xml": { data: Buffer.from(costingAppXml(), "utf8") },
    "docProps/core.xml": { data: Buffer.from(costingCoreXml(), "utf8") },
    "xl/workbook.xml": { data: Buffer.from(singleSheetWorkbookXml(payload.title || "Table"), "utf8") },
    "xl/_rels/workbook.xml.rels": { data: Buffer.from(costingWorkbookRelsXml(), "utf8") },
    "xl/styles.xml": { data: Buffer.from(costingStylesXml(), "utf8") },
    "xl/worksheets/sheet1.xml": { data: Buffer.from(sheetXml, "utf8") }
  });
}

function singleSheetWorkbookXml(sheetName) {
  const safeName = cleanCell(sheetName || "Table")
    .replace(/[\[\]*\/\\?:]/g, " ")
    .slice(0, 31)
    .trim() || "Table";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="${escapeXml(safeName)}" sheetId="1" r:id="rId1"/></sheets>
</workbook>`;
}

function tableColumnWidth(column, rows) {
  const samples = [column, ...rows.slice(0, 75).map(row => row?.[column])].map(cleanCell);
  const maxLength = Math.max(8, ...samples.map(value => value.length));
  return Math.min(45, Math.max(10, Math.ceil(maxLength * 1.15)));
}

const COSTING_EXPORT_COLUMNS = [
  "S.No",
  "Model",
  "Qty",
  "TR",
  "List Price",
  "Multiplier",
  "Cost",
  "Amount",
  "Selling Price / Unit"
];

function generateCostingWorkbook(payload = {}) {
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  const summary = payload.summary || {};
  const sheetRows = [];
  const headerRowNumber = 2;
  const firstDataRow = headerRowNumber + 1;

  sheetRows.push(costingRowXml(headerRowNumber, COSTING_EXPORT_COLUMNS.map((column, index) => ({
    column: index + 1,
    value: column === "Selling Price / Unit" ? "Selling Price\n/ Unit" : column,
    style: 1
  })), 30));

  rows.forEach((row, index) => {
    const rowNumber = firstDataRow + index;
    sheetRows.push(costingRowXml(rowNumber, [
      { column: 1, value: numberOrText(row["S.No"] || index + 1), style: 3 },
      { column: 2, value: row.Model || "", style: 2 },
      { column: 3, value: numberOrText(row.Qty), style: 3 },
      { column: 4, value: numberOrText(row.TR), style: 12 },
      { column: 5, value: numberOrText(row["List Price"]), style: 4 },
      { column: 6, value: numberOrText(row.Multiplier), style: 11 },
      { column: 7, value: numberOrText(row.Cost), style: 4 },
      { column: 8, value: numberOrText(row.Amount), style: 4 },
      { column: 9, value: numberOrText(row["Selling Price / Unit"]), style: 4 }
    ]));
  });

  const summaryStart = firstDataRow + rows.length;
  const summaryRows = [
    { label: "Total Cost", value: numberOrText(summary.totalCost), labelStyle: 6, valueStyle: 7, tr: numberOrText(summary.totalTR) },
    { label: "Margin", value: Number(summary.margin || 0), labelStyle: 6, valueStyle: 10 },
    { label: "Selling Price", value: numberOrText(summary.sellingPrice), labelStyle: 6, valueStyle: 7 },
    { label: "Profit", value: numberOrText(summary.profit), labelStyle: 8, valueStyle: 9 },
    { label: "Price / Ton", value: numberOrText(summary.pricePerTon), labelStyle: 6, valueStyle: 7 }
  ];

  summaryRows.forEach((item, index) => {
    const rowNumber = summaryStart + index;
    const cells = [
      { column: 7, value: item.label, style: item.labelStyle },
      { column: 8, value: item.value, style: item.valueStyle }
    ];
    if (index === 0) cells.push({ column: 4, value: item.tr, style: 13 });
    sheetRows.push(costingRowXml(rowNumber, cells));
  });

  const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheetViews><sheetView showGridLines="1" workbookViewId="0"/></sheetViews>
  <sheetFormatPr defaultRowHeight="15"/>
  <cols>
    <col min="1" max="1" width="8" customWidth="1"/>
    <col min="2" max="2" width="34" customWidth="1"/>
    <col min="3" max="4" width="9" customWidth="1"/>
    <col min="5" max="5" width="13" customWidth="1"/>
    <col min="6" max="6" width="12" customWidth="1"/>
    <col min="7" max="8" width="14" customWidth="1"/>
    <col min="9" max="9" width="15" customWidth="1"/>
  </cols>
  <sheetData>${sheetRows.join("")}</sheetData>
  <pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>
</worksheet>`;

  return zipEntries({
    "[Content_Types].xml": { data: Buffer.from(costingContentTypesXml(), "utf8") },
    "_rels/.rels": { data: Buffer.from(costingRootRelsXml(), "utf8") },
    "docProps/app.xml": { data: Buffer.from(costingAppXml(), "utf8") },
    "docProps/core.xml": { data: Buffer.from(costingCoreXml(), "utf8") },
    "xl/workbook.xml": { data: Buffer.from(costingWorkbookXml(), "utf8") },
    "xl/_rels/workbook.xml.rels": { data: Buffer.from(costingWorkbookRelsXml(), "utf8") },
    "xl/styles.xml": { data: Buffer.from(costingStylesXml(), "utf8") },
    "xl/worksheets/sheet1.xml": { data: Buffer.from(sheetXml, "utf8") }
  });
}

function costingRowXml(rowNumber, cells, height = "") {
  const attrs = height ? ` ht="${height}" customHeight="1"` : "";
  return `<row r="${rowNumber}"${attrs}>${cells.map(cell => costingCellXml(rowNumber, cell)).join("")}</row>`;
}

function costingCellXml(rowNumber, cell) {
  const ref = `${xlsxColumnName(cell.column)}${rowNumber}`;
  const style = cell.style !== undefined && cell.style !== "" ? ` s="${cell.style}"` : "";
  if (cell.value === undefined || cell.value === null || cell.value === "") return `<c r="${ref}"${style}/>`;
  if (typeof cell.value === "number" && Number.isFinite(cell.value)) return `<c r="${ref}"${style}><v>${cell.value}</v></c>`;
  return `<c r="${ref}" t="inlineStr"${style}><is><t>${escapeXml(cell.value)}</t></is></c>`;
}

function xlsxColumnName(index) {
  let value = Number(index);
  let name = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    value = Math.floor((value - 1) / 26);
  }
  return name || "A";
}

function numberOrText(value) {
  if (value === null || value === undefined || value === "") return "";
  const normalized = String(value).replace(/,/g, "").trim();
  return /^-?\d+(\.\d+)?$/.test(normalized) ? Number(normalized) : value;
}

function costingContentTypesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`;
}

function costingRootRelsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;
}

function costingWorkbookXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="Costing Sheet" sheetId="1" r:id="rId1"/></sheets>
</workbook>`;
}

function costingWorkbookRelsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;
}

function costingAppXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>Comfort Zone</Application>
</Properties>`;
}

function costingCoreXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:creator>Comfort Zone</dc:creator>
  <cp:lastModifiedBy>Comfort Zone</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:modified>
</cp:coreProperties>`;
}

function costingStylesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="1"><numFmt numFmtId="164" formatCode="0.##"/></numFmts>
  <fonts count="2">
    <font><sz val="11"/><color theme="1"/><name val="Calibri"/><family val="2"/></font>
    <font><b/><sz val="11"/><color theme="1"/><name val="Calibri"/><family val="2"/></font>
  </fonts>
  <fills count="4">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFD9D9D9"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFE2F0D9"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border><left style="thin"><color rgb="FF000000"/></left><right style="thin"><color rgb="FF000000"/></right><top style="thin"><color rgb="FF000000"/></top><bottom style="thin"><color rgb="FF000000"/></bottom><diagonal/></border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="14">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="4" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="4" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="0" fontId="1" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="4" fontId="1" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="9" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="2" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="2" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
}

const VRV_SCHEDULE_XLSX_COLUMNS = [
  { col: "B", keys: ["System"] },
  { col: "C", keys: ["Name"] },
  { col: "D", keys: ["Location"] },
  { col: "E", keys: ["Rq TC"] },
  { col: "F", keys: ["Rq SC"] },
  { col: "G", keys: ["Air Flow Rate"] },
  { col: "H", keys: ["FCU"] },
  { col: "I", keys: ["Nominal Index"] },
  { col: "J", keys: ["Country of Origin"] },
  { col: "K", keys: ["Type"] },
  { col: "L", keys: ["Ambient - On Coil Temperature", "Ambient - On  Coil Temperature"] },
  { col: "M", keys: ["Max TC"] },
  { col: "N", keys: ["Max SC"] },
  { col: "O", keys: ["Proposed Air Flow Rate"] },
  { col: "P", keys: ["PIC"] },
  { col: "Q", keys: ["Sound"] },
  { col: "R", keys: ["PS"] },
  { col: "S", keys: ["MCA"] },
  { col: "T", keys: ["WxHxD"] },
  { col: "U", keys: ["Weight"] },
  { col: "V", keys: ["Outdoor Name"] },
  { col: "W", keys: ["Outdoor Model"] },
  { col: "X", keys: ["Outdoor Nominal Index"] },
  { col: "Y", keys: ["Ambient Temp"] },
  { col: "Z", keys: ["CC"] },
  { col: "AA", keys: ["CR"] },
  { col: "AB", keys: ["PI ESMA"] },
  { col: "AC", keys: ["Outdoor PS"] },
  { col: "AD", keys: ["Outdoor MCA"] },
  { col: "AE", keys: ["MOP"] },
  { col: "AF", keys: ["RLA"] },
  { col: "AG", keys: ["Outdoor WxHxD"] },
  { col: "AH", keys: ["Outdoor Weight"] }
];

function generateVrvScheduleWorkbook(payload = {}) {
  if (!fs.existsSync(VRV_SCHEDULE_TEMPLATE)) {
    throw new Error("VRV Schedule template file is missing.");
  }
  const entries = unzipEntriesBuffer(fs.readFileSync(VRV_SCHEDULE_TEMPLATE));
  removeWorkbookCalcChain(entries);
  const sheetPath = findWorkbookSheetPath(entries, "VRV Schedule") || "xl/worksheets/sheet1.xml";
  if (!entries[sheetPath]) throw new Error("VRV Schedule worksheet was not found in the template.");
  let xml = entries[sheetPath].data.toString("utf8");
  xml = fillVrvScheduleSheetXml(xml, payload);
  entries[sheetPath].data = Buffer.from(xml, "utf8");
  return zipEntries(entries);
}

function removeWorkbookCalcChain(entries) {
  delete entries["xl/calcChain.xml"];
  const workbookRels = entries["xl/_rels/workbook.xml.rels"];
  if (workbookRels) {
    workbookRels.data = Buffer.from(
      workbookRels.data.toString("utf8").replace(/<Relationship\b(?=[^>]*Type="[^"]*\/calcChain")[^>]*\/>/g, ""),
      "utf8"
    );
  }
  const contentTypes = entries["[Content_Types].xml"];
  if (contentTypes) {
    contentTypes.data = Buffer.from(
      contentTypes.data.toString("utf8").replace(/<Override\b(?=[^>]*PartName="\/xl\/calcChain\.xml")[^>]*\/>/g, ""),
      "utf8"
    );
  }
}

function findWorkbookSheetPath(entries, sheetName) {
  const workbook = entries["xl/workbook.xml"]?.data?.toString("utf8") || "";
  const rels = entries["xl/_rels/workbook.xml.rels"]?.data?.toString("utf8") || "";
  const sheetMatch = workbook.match(new RegExp(`<sheet[^>]*name="${escapeRegExp(sheetName)}"[^>]*r:id="([^"]+)"`, "i"));
  if (!sheetMatch) return "";
  const relMatch = rels.match(new RegExp(`<Relationship[^>]*Id="${escapeRegExp(sheetMatch[1])}"[^>]*Target="([^"]+)"`, "i"));
  if (!relMatch) return "";
  const target = relMatch[1].replace(/^\/+/, "");
  return target.startsWith("xl/") ? target : `xl/${target}`;
}

function fillVrvScheduleSheetXml(xml, payload) {
  const originalRows = xlsxRowsByNumber(xml);
  const normalFirstStyles = xlsxRowStyleMap(originalRows[11] || "");
  const normalNextStyles = xlsxRowStyleMap(originalRows[12] || originalRows[11] || "");
  const totalStyles = xlsxRowStyleMap(originalRows[26] || originalRows[11] || "");
  const separatorStyles = xlsxRowStyleMap(originalRows[27] || originalRows[11] || "");
  const headerRows = [];
  for (let rowNumber = 1; rowNumber <= 10; rowNumber += 1) {
    let rowXml = originalRows[rowNumber] || `<row r="${rowNumber}"/>`;
    if (rowNumber === 4) rowXml = xlsxUpsertCell(rowXml, "C4", payload.projectName || "", xlsxCellStyle(rowXml, "C4"));
    if (rowNumber === 5) rowXml = xlsxUpsertCell(rowXml, "C5", payload.customerName || "", xlsxCellStyle(rowXml, "C5"));
    headerRows.push(rowXml);
  }

  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  const dataRows = [];
  const groupMerges = [];
  let rowNumber = 11;
  let groupStart = 0;
  let groupSystem = "";
  let groupDataCount = 0;

  function closeGroup() {
    if (groupStart && groupDataCount > 1) {
      groupMerges.push(`B${groupStart}:B${groupStart + groupDataCount - 1}`);
    }
    groupStart = 0;
    groupSystem = "";
    groupDataCount = 0;
  }

  for (const sourceRow of rows) {
    const rowType = sourceRow.__rowType || "";
    if (rowType === "separator") {
      closeGroup();
      dataRows.push(xlsxScheduleRowXml(rowNumber, {}, separatorStyles));
      rowNumber += 1;
      continue;
    }
    if (rowType === "total") {
      closeGroup();
      dataRows.push(xlsxScheduleRowXml(rowNumber, xlsxScheduleValues(sourceRow), totalStyles));
      rowNumber += 1;
      continue;
    }

    const rowSystem = cleanCell(sourceRow.System || "");
    if (rowSystem && rowSystem !== groupSystem) {
      closeGroup();
      groupStart = rowNumber;
      groupSystem = rowSystem;
      groupDataCount = 0;
    }
    const values = xlsxScheduleValues(sourceRow);
    if (groupDataCount > 0 && groupSystem) values.B = "";
    dataRows.push(xlsxScheduleRowXml(rowNumber, values, groupDataCount > 0 ? normalNextStyles : normalFirstStyles));
    groupDataCount += 1;
    rowNumber += 1;
  }
  closeGroup();

  const sheetData = `<sheetData>${headerRows.join("")}${dataRows.join("")}</sheetData>`;
  let next = xml.replace(/<sheetData>[\s\S]*?<\/sheetData>/, sheetData);
  const lastRow = Math.max(rowNumber - 1, 10);
  next = next.replace(/<dimension\s+ref="[^"]+"\s*\/>/, `<dimension ref="A1:AH${lastRow}"/>`);
  next = xlsxReplaceMergeCells(next, [
    ...xlsxMergeRefs(xml).filter(ref => xlsxMergeMaxRow(ref) <= 10),
    ...groupMerges
  ]);
  next = next.replace(/<extLst\b[\s\S]*?<\/extLst>/g, "");
  return next;
}

function xlsxScheduleValues(row) {
  const values = {};
  for (const column of VRV_SCHEDULE_XLSX_COLUMNS) {
    values[column.col] = firstFilled(row, column.keys);
  }
  return values;
}

function firstFilled(row, keys) {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && String(row[key]) !== "") return row[key];
  }
  return "";
}

function xlsxScheduleRowXml(rowNumber, values, styleMap) {
  const cells = VRV_SCHEDULE_XLSX_COLUMNS
    .map(column => xlsxCell(column.col, rowNumber, values[column.col], styleMap[column.col]))
    .join("");
  return `<row r="${rowNumber}" spans="2:34">${cells}</row>`;
}

function xlsxRowsByNumber(xml) {
  const rows = {};
  const rowRegex = /<row\b[^>]*\br="(\d+)"[^>]*>[\s\S]*?<\/row>/g;
  let match;
  while ((match = rowRegex.exec(xml))) rows[Number(match[1])] = match[0];
  return rows;
}

function xlsxRowStyleMap(rowXml) {
  const styles = {};
  const cellRegex = /<c\b[^>]*\br="([A-Z]+)\d+"[^>]*>/g;
  let match;
  while ((match = cellRegex.exec(rowXml))) {
    const styleMatch = match[0].match(/\bs="([^"]+)"/);
    if (styleMatch) styles[match[1]] = styleMatch[1];
  }
  return styles;
}

function xlsxCellStyle(rowXml, ref) {
  const match = rowXml.match(new RegExp(`<c\\b[^>]*\\br="${escapeRegExp(ref)}"[^>]*>`, "i"));
  return match?.[0]?.match(/\bs="([^"]+)"/)?.[1] || "";
}

function xlsxUpsertCell(rowXml, ref, value, styleId = "") {
  const col = ref.match(/^[A-Z]+/)?.[0] || "";
  const rowNumber = Number(ref.match(/\d+$/)?.[0] || 0);
  const cell = xlsxCell(col, rowNumber, value, styleId);
  const cellRegex = new RegExp(`<c\\b[^>]*\\br="${escapeRegExp(ref)}"[^>]*>[\\s\\S]*?<\\/c>`, "i");
  if (cellRegex.test(rowXml)) return rowXml.replace(cellRegex, cell);
  return rowXml.replace(/<\/row>$/, `${cell}</row>`);
}

function xlsxCell(col, rowNumber, value, styleId = "") {
  const ref = `${col}${rowNumber}`;
  const style = styleId !== "" && styleId !== undefined ? ` s="${styleId}"` : "";
  if (value === undefined || value === null || value === "") return `<c r="${ref}"${style}/>`;
  const normalized = typeof value === "string" ? value.replace(/,/g, "").trim() : value;
  if (typeof normalized === "number" || (/^-?\d+(\.\d+)?$/.test(String(normalized)) && String(value).trim() !== "")) {
    return `<c r="${ref}"${style}><v>${Number(normalized)}</v></c>`;
  }
  return `<c r="${ref}" t="inlineStr"${style}><is><t>${escapeXml(value)}</t></is></c>`;
}

function xlsxMergeRefs(xml) {
  return [...xml.matchAll(/<mergeCell\s+ref="([^"]+)"\s*\/>/g)].map(match => match[1]);
}

function xlsxMergeMaxRow(ref) {
  return Math.max(...(ref.match(/\d+/g) || ["0"]).map(Number));
}

function xlsxReplaceMergeCells(xml, refs) {
  const uniqueRefs = [...new Set(refs)];
  const block = uniqueRefs.length
    ? `<mergeCells count="${uniqueRefs.length}">${uniqueRefs.map(ref => `<mergeCell ref="${ref}"/>`).join("")}</mergeCells>`
    : "";
  if (/<mergeCells\b[\s\S]*?<\/mergeCells>/.test(xml)) {
    return xml.replace(/<mergeCells\b[\s\S]*?<\/mergeCells>/, block);
  }
  return xml.replace(/<\/sheetData>/, `</sheetData>${block}`);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function quotationHtml(payload) {
  const d = payload.details || {};
  const b = payload.boq || { columns: [], rows: [], summary: {} };
  const rows = (b.rows || []).map(row => `<tr><td>${esc(row["S.No"])}</td><td>${esc(row.Description)}</td><td>${esc(row.Qty)}</td><td>${esc(row.Unit || "Nos")}</td></tr>`).join("");
  const total = Number(b.summary && b.summary.total || 0);
  const vat = Number(b.summary && b.summary.vat || 0);
  const net = Number(b.summary && b.summary.netAmount || 0);
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${esc(payload.quotationNo || "Quotation")}</title>
<style>
body{font-family:Arial,sans-serif;color:#111;font-size:11pt}
h1{text-align:center;font-size:20pt}
table{border-collapse:collapse;width:100%;margin:12px 0}
td,th{border:1px solid #333;padding:6px;vertical-align:top}
th{background:#d9d9d9}
.meta td:nth-child(1),.meta td:nth-child(3){font-weight:bold;width:16%}
.summary{width:40%;margin-left:auto}
</style></head>
<body>
<h1>Quotation</h1>
<table class="meta">
<tr><td>Customer:</td><td>${esc(d.customer)}</td><td>Date:</td><td>${esc(d.date)}</td></tr>
<tr><td>Contact Person:</td><td>${esc(d.contactPerson)}</td><td>Quotation No:</td><td>${esc(payload.quotationNo)}</td></tr>
<tr><td>Tel. No:</td><td>${esc(d.telNo)}</td><td>Enq. No:</td><td>${esc(d.enquiryNo)}</td></tr>
<tr><td>Email:</td><td>${esc(d.email)}</td><td></td><td></td></tr>
<tr><td>Project:</td><td colspan="3">${esc(d.project)}</td></tr>
</table>
<p><b>Subject:</b> Supply of Daikin AC Units</p>
<p>Thank you very much for your valid enquiry. We are offering our best quote as below.</p>
<table>
<thead><tr><th>S. No.</th><th>Description</th><th>Qty</th><th>Unit</th></tr></thead>
<tbody>${rows}</tbody>
</table>
<table class="summary">
<tr><td><b>Total</b></td><td>${money(total)}</td></tr>
<tr><td><b>VAT 5%</b></td><td>${money(vat)}</td></tr>
<tr><td><b>Net Amount</b></td><td>${money(net)}</td></tr>
</table>
<table>
<tr><th colspan="3">Terms & Conditions</th></tr>
<tr><td>Validity</td><td>:</td><td>${esc(d.validity)}</td></tr>
<tr><td>Terms of Payment</td><td>:</td><td>100% advance.</td></tr>
</table>
<p>Thanking You</p>
<p>For Comfort Zone AC Trading LLC</p>
<p>Prepared by: ${esc(d.preparedBy)}</p>
</body></html>`;
}

function generateQuotationDocx(payload) {
  const entries = unzipEntriesBuffer(fs.readFileSync(QUOTATION_TEMPLATE));
  const documentPath = "word/document.xml";
  let xml = entries[documentPath].data.toString("utf8");
  xml = fillQuotationDetails(xml, payload);
  xml = replaceBoqPlaceholder(xml, payload.boq || { rows: [], summary: {} });
  entries[documentPath].data = Buffer.from(xml, "utf8");
  return zipEntries(entries);
}

function fillQuotationDetails(xml, payload) {
  const d = payload.details || {};
  const q = payload.quotationNo || "";
  const replacements = [
    ["Customer:", d.customer || ""],
    ["Contact Person:", d.contactPerson || ""],
    ["Tel. No:", d.telNo || ""],
    ["Email:", d.email || ""],
    ["Project:", d.project || ""],
    ["Date:", formatDocDate(d.date || "")],
    ["Quotation No:", q],
    ["Enq. No:", d.enquiryNo || ""]
  ];
  return removeSalesEngineerSection(replaceFirstTableValues(xml, replacements));
}

function replaceFirstTableValues(xml, replacements) {
  const match = xml.match(/<w:tbl[\s\S]*?<\/w:tbl>/);
  if (!match) return xml;
  let table = match[0];
  for (const [label, value] of replacements) {
    table = replaceValueAfterLabel(table, label, value);
  }
  return xml.slice(0, match.index) + table + xml.slice(match.index + match[0].length);
}

function replaceValueAfterLabel(tableXml, label, value) {
  const rows = tableXml.match(/<w:tr[\s\S]*?<\/w:tr>/g) || [];
  for (const row of rows) {
    const cells = row.match(/<w:tc[\s\S]*?<\/w:tc>/g) || [];
    for (let i = 0; i < cells.length - 1; i += 1) {
      if (xmlText(cells[i]).trim() === label) {
        const next = setCellText(cells[i + 1], value);
        const newRow = row.replace(cells[i + 1], next);
        return tableXml.replace(row, newRow);
      }
    }
  }
  return tableXml;
}

function replaceBoqPlaceholder(xml, boq) {
  const marker = "{{BOQ_TABLE}}";
  const index = xml.indexOf(marker);
  if (index < 0) return xml;
  const pStart = findParagraphStart(xml, index);
  const pEnd = xml.indexOf("</w:p>", index);
  if (pStart < 0 || pEnd < 0) return xml.replace(marker, "");
  const tableXml = buildBoqDocxTable(boq);
  return xml.slice(0, pStart) + tableXml + xml.slice(pEnd + "</w:p>".length);
}

function findParagraphStart(xml, index) {
  const candidates = ["<w:p ", "<w:p>"];
  let best = -1;
  for (const token of candidates) {
    const found = xml.lastIndexOf(token, index);
    if (found > best) best = found;
  }
  return best;
}

function buildBoqDocxTable(boq) {
  const rows = boq.rows || [];
  const summary = boq.summary || {};
  const widths = [760, 5700, 1200, 1440];
  const tableRows = [
    docxRow(["S. No.", "Description", "Qty", "Unit"], widths, true),
    ...rows.map(row => docxRow([
      row["S.No"] || row["S. No."] || "",
      row.Description || "",
      row.Qty || "",
      row.Unit || "Nos"
    ], widths, false)),
    docxSummaryRow("Total", money(summary.total || 0), widths),
    docxSummaryRow("VAT 5%", money(summary.vat || 0), widths),
    docxSummaryRow("Net Amount", money(summary.netAmount || 0), widths)
  ].join("");
  return `<w:tbl>
<w:tblPr><w:tblW w:w="9100" w:type="dxa"/><w:tblInd w:w="0" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="000000"/><w:left w:val="single" w:sz="4" w:space="0" w:color="000000"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="000000"/><w:right w:val="single" w:sz="4" w:space="0" w:color="000000"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="000000"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="000000"/></w:tblBorders><w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/></w:tblPr>
<w:tblGrid>${widths.map(width => `<w:gridCol w:w="${width}"/>`).join("")}</w:tblGrid>
${tableRows}
</w:tbl>`;
}

function docxRow(values, widths, header) {
  return `<w:tr>${values.map((value, index) => docxCell(value, widths[index], header)).join("")}</w:tr>`;
}

function docxSummaryRow(label, value, widths) {
  return `<w:tr>${docxCell("", widths[0], false)}${docxCell("", widths[1], false)}${docxCell(label, widths[2], true)}${docxCell(value, widths[3], true)}</w:tr>`;
}

function docxCell(value, width, bold) {
  const fill = bold ? `<w:shd w:fill="D9D9D9"/>` : "";
  const b = bold ? "<w:b/>" : "";
  return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${fill}<w:tcMar><w:top w:w="70" w:type="dxa"/><w:left w:w="70" w:type="dxa"/><w:bottom w:w="70" w:type="dxa"/><w:right w:w="70" w:type="dxa"/></w:tcMar></w:tcPr><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr>${b}<w:sz w:val="18"/></w:rPr><w:t xml:space="preserve">${escapeXml(value)}</w:t></w:r></w:p></w:tc>`;
}

function removeSalesEngineerSection(xml) {
  const tables = [...xml.matchAll(/<w:tbl[\s\S]*?<\/w:tbl>/g)];
  for (const match of tables) {
    if (xmlText(match[0]).includes("Sales Engineer")) {
      const table = match[0].replace(/Sales Engineer[\s\S]*?yoonus@comfortzoneuae\.com/g, "");
      return xml.slice(0, match.index) + table + xml.slice(match.index + match[0].length);
    }
  }
  return xml
    .replace(/Sales Engineer[\s\S]*?Yoonus Muhamed[\s\S]*?\+971 56 683 3511[\s\S]*?yoonus@comfortzoneuae\.com/g, "")
    .replace(/Sales Engineer\s*\|\s*Yoonus Muhamed\s*\|\s*\+971 56 683 3511\s*\|\s*yoonus@comfortzoneuae\.com/g, "");
}

function setCellText(cellXml, value) {
  const tcPr = (cellXml.match(/<w:tcPr[\s\S]*?<\/w:tcPr>/) || [""])[0];
  return `<w:tc>${tcPr}<w:p><w:r><w:t xml:space="preserve">${escapeXml(value)}</w:t></w:r></w:p></w:tc>`;
}

function formatDocDate(value) {
  if (!value) return "";
  const parts = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return parts ? `${parts[3]}/${parts[2]}/${parts[1]}` : value;
}

function escapeXml(value) {
  return String(value == null ? "" : value)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function money(value) {
  return Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const server = http.createServer((req, res) => {
  if (req.url.startsWith("/api/")) {
    handleApi(req, res).catch(error => {
      console.error(error);
      send(res, 500, { error: error.message || "Server error" });
    });
  } else {
    serveStatic(req, res);
  }
});

if (process.env.VERCEL) {
  module.exports = (req, res) => server.emit("request", req, res);
} else {
  server.listen(PORT, HOST, () => {
    console.log(`HVAC Workflow App running at http://127.0.0.1:${PORT}`);
  });
}
