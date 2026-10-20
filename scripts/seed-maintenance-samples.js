const path = require("node:path");
const { createMaintenanceApi } = require("../maintenance-api");

const dataDir = path.resolve(__dirname, "..", "data");
const api = createMaintenanceApi({
  dataDir,
  supabase: null,
  send(res, status, body) {
    res.status = status;
    res.body = body;
  },
  readJson: async req => req.body || {}
});
const admin = { role: "Admin", name: "Maintenance sample setup" };

async function office(method, route, body = {}) {
  const req = { method, body, headers: { host: "127.0.0.1:5175" } };
  const res = {};
  await api.routeOffice(req, res, new URL(route, "http://127.0.0.1:5175"), admin);
  if (res.status >= 400) throw new Error(`${route}: ${res.body?.error || res.status}`);
  return res.body;
}

async function main() {
  const names = ["Sample Technician One", "Sample Technician Two", "Sample Technician Three"];
  const technicians = [];
  for (let index = 0; index < names.length; index += 1) {
    const code = `SAMPLE-TCH-0${index + 1}`;
    const current = await office("GET", "/api/maintenance/summary");
    technicians.push(current.technicians.find(item => item.code === code)
      || await office("POST", "/api/maintenance/technicians", {
        code, name: names[index], phone: `050000000${index + 1}`, notes: "Sample data for Maintenance workflow checks"
      }));
  }

  const cases = [
    { key: "SAMPLE-MAINTENANCE-01", customerName: "Sample Customer One", site: "Sample Site One - JVC",
      frequency: "Monthly", unitCount: 2, date: "2026-10-17", technicians: [0, 1] },
    { key: "SAMPLE-MAINTENANCE-02", customerName: "Sample Customer Two", site: "Sample Site Two - Business Bay",
      frequency: "Quarterly", unitCount: 3, date: "2026-10-18", technicians: [1, 2] },
    { key: "SAMPLE-MAINTENANCE-03", customerName: "Sample Customer Three", site: "Sample Site Three - Sharjah",
      frequency: "Half-Yearly", unitCount: 1, date: "2026-10-19", technicians: [0, 2] }
  ];

  for (const [index, item] of cases.entries()) {
    let current = await office("GET", "/api/maintenance/summary");
    const contract = current.contracts.find(row => row.notes === item.key)
      || await office("POST", "/api/maintenance/contracts", {
        customerName: item.customerName, site: item.site, contact: "Sample Contact",
        phone: `050000001${index + 1}`, email: "sample@example.com", startDate: "2026-10-14",
        endDate: "2027-10-13", frequency: item.frequency, unitCount: item.unitCount,
        status: "Active", notes: item.key
      });
    current = await office("GET", "/api/maintenance/summary");
    const visit = current.visits.find(row => row.contractId === contract.id && row.sequence === 1);
    const clientKey = `sample-maintenance-job-0${index + 1}`;
    const schedule = current.schedules.find(row => row.clientKey === clientKey)
      || (await office("POST", "/api/maintenance/schedules", {
        clientKey, contractId: contract.id, visitId: visit.id, customerName: item.customerName,
        site: item.site, contact: "Sample Contact", phone: `050000001${index + 1}`,
        workType: "Preventive Maintenance", priority: "Normal", serviceDate: item.date,
        startTime: "09:00", endTime: "12:00", technicianIds: item.technicians.map(number => technicians[number].id),
        leadTechnicianId: technicians[item.technicians[0]].id,
        instructions: "Sample PM check: filters, coils, drainage, electrical connections and cooling performance.",
        mode: "notify"
      })).schedule;
    console.log(`${contract.number} / ${schedule.workOrderId ? "scheduled" : "draft"} / ${item.customerName}`);
  }

  const final = await office("GET", "/api/maintenance/summary");
  console.log(`Saved: ${final.contracts.length} AMCs, ${final.workOrders.length} work orders, ${final.technicians.length} technicians`);
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
