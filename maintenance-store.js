const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const emptyStore = () => ({
  version: 1,
  sequence: { contract: 0, workOrder: 0, report: 0, technician: 0 },
  customers: [], contracts: [], visits: [], schedules: [], workOrders: [], technicians: [],
  attendance: [], reports: [], files: [], notifications: [], subscriptions: [],
  invites: [], drafts: [], activity: [], pendingUploadDeletes: [], billingRecords: [], billingDeletedIds: [], billingNotes: {}
});

function normalize(value) {
  const blank = emptyStore();
  if (!value || typeof value !== "object") return blank;
  const next = { ...blank, ...value, sequence: { ...blank.sequence, ...(value.sequence || {}) } };
  for (const key of Object.keys(blank)) {
    if (Array.isArray(blank[key])) next[key] = Array.isArray(value[key]) ? value[key] : [];
  }
  const known = new Set(next.customers.map(item => String(item.name || "").trim().toLocaleLowerCase("en-US")));
  for (const source of [...next.contracts, ...next.workOrders, ...next.schedules]) {
    const name = String(source.customerName || "").trim();
    const key = name.toLocaleLowerCase("en-US");
    if (!key || known.has(key)) continue;
    known.add(key);
    next.customers.push({ id: source.customerId || `maintenance:${crypto.createHash("sha256").update(key).digest("hex").slice(0, 20)}`,
      name, contact: source.contact || "", phone: source.phone || "", email: source.email || "" });
  }
  return next;
}

function createMaintenanceStore({ dataDir, supabase, table = "app_data" }) {
  const file = path.join(dataDir, "maintenance.json");
  const lockFile = `${file}.lock`;
  const key = "maintenance-v1";
  let pending = Promise.resolve();

  async function read() {
    if (supabase) {
      const { data, error } = await supabase.from(table).select("value").eq("key", key).maybeSingle();
      if (error) throw new Error(`Maintenance read failed: ${error.message}`);
      return normalize(data?.value);
    }
    if (!fs.existsSync(file)) return emptyStore();
    return normalize(JSON.parse(await fs.promises.readFile(file, "utf8")));
  }

  async function localMutation(change) {
    await fs.promises.mkdir(dataDir, { recursive: true });
    let lock;
    for (let attempt = 0; attempt < 120; attempt += 1) {
      try {
        lock = await fs.promises.open(lockFile, "wx");
        break;
      } catch (error) {
        if (error.code !== "EEXIST") throw error;
        const stat = await fs.promises.stat(lockFile).catch(() => null);
        if (stat && Date.now() - stat.mtimeMs > 30000) await fs.promises.unlink(lockFile).catch(() => {});
        await new Promise(resolve => setTimeout(resolve, 30 + Math.min(attempt, 20) * 5));
      }
    }
    if (!lock) throw new Error("Maintenance store is busy. Please retry.");
    try {
      const state = await read();
      const result = await change(state);
      const temp = `${file}.${crypto.randomUUID()}.tmp`;
      try {
        await fs.promises.writeFile(temp, JSON.stringify(state, null, 2), { flag: "wx" });
        await fs.promises.rename(temp, file);
      } finally {
        await fs.promises.unlink(temp).catch(() => {});
      }
      return result;
    } finally {
      await lock.close();
      await fs.promises.unlink(lockFile).catch(() => {});
    }
  }

  async function remoteMutation(change) {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const { data, error } = await supabase.from(table).select("value,updated_at").eq("key", key).maybeSingle();
      if (error) throw new Error(`Maintenance read failed: ${error.message}`);
      const state = normalize(data?.value);
      const result = await change(state);
      const prior = Date.parse(data?.updated_at || "") || 0;
      const stamp = new Date(Math.max(Date.now(), prior + 1)).toISOString();
      if (!data) {
        const inserted = await supabase.from(table).insert({ key, value: state, updated_at: stamp });
        if (!inserted.error) return result;
        if (inserted.error.code === "23505") continue;
        throw new Error(`Maintenance write failed: ${inserted.error.message}`);
      }
      const saved = await supabase.from(table).update({ value: state, updated_at: stamp })
        .eq("key", key).eq("updated_at", data.updated_at).select("key");
      if (saved.error) throw new Error(`Maintenance write failed: ${saved.error.message}`);
      if (saved.data?.length) return result;
    }
    throw new Error("Maintenance data changed during saving. Please retry.");
  }

  function mutate(change) {
    const run = pending.then(() => supabase ? remoteMutation(change) : localMutation(change));
    pending = run.catch(() => {});
    return run;
  }

  return { read, mutate };
}

module.exports = { createMaintenanceStore };
