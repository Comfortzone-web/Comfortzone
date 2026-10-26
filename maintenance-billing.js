const roundMoney = value => Math.round((Number(value) || 0) * 100) / 100;
const isoDay = value => {
  const text = String(value || "").trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return text.slice(0, 10);
  const dmy = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (!dmy) return "";
  return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
};
const addDays = (day, count) => new Date(Date.parse(`${day}T12:00:00Z`) + count * 86400000).toISOString().slice(0, 10);

function installments(contract) {
  const startDate = isoDay(contract.startDate), endDate = isoDay(contract.endDate);
  const start = Date.parse(`${startDate}T12:00:00Z`);
  const end = Date.parse(`${endDate}T12:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return [];
  const days = Math.round((end - start) / 86400000) + 1;
  const count = Math.min(120, Math.max(1, Math.round(days / 365 * Number(contract.visitsPerYear || 1))));
  const totalCents = Math.round(Number(contract.contractValue || 0) * 100);
  const share = Math.floor(totalCents / count);
  return Array.from({ length: count }, (_, index) => {
    const from = addDays(startDate, Math.floor(days * index / count));
    const through = index === count - 1 ? endDate : addDays(startDate, Math.floor(days * (index + 1) / count) - 1);
    return { id: `amc:${contract.id}:${index + 1}`, sourceType: "AMC", contractId: contract.id, workOrderId: "",
      installmentNumber: index + 1, reference: contract.number, customerName: contract.customerName, site: contract.site,
      periodStart: from, periodEnd: through, dueDate: through, amountExVat: (index === count - 1 ? totalCents - share * (count - 1) : share) / 100,
      vatRate: 5, notes: "", request: null, invoice: null, payments: [], credits: 0 };
  });
}

function billingRows(store) {
  const dateParts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const part = type => dateParts.find(item => item.type === type).value;
  const today = `${part("year")}-${part("month")}-${part("day")}`;
  const saved = new Map((store.billingRecords || []).map(row => [row.id, row]));
  const base = (store.contracts || []).flatMap(installments);
  for (const job of store.workOrders || []) {
    if (job.contractId) continue;
    base.push({ id: `wo:${job.id}`, sourceType: "Work Order", contractId: "", workOrderId: job.id,
      reference: job.number, customerName: job.customerName, site: job.site, periodStart: job.serviceDate,
      periodEnd: job.serviceDate, dueDate: job.serviceDate, amountExVat: 0, vatRate: 5,
      notes: "", request: null, invoice: null, payments: [], credits: 0 });
  }
  const rows = base.map(item => {
    const prior = saved.get(item.id);
    if (!prior) return item;
    saved.delete(item.id);
    return { ...item, ...prior, reference: item.reference, customerName: item.customerName, site: item.site,
      amountExVat: prior.request || prior.invoice ? prior.amountExVat : item.sourceType === "AMC" ? item.amountExVat : prior.amountExVat,
      payments: prior.payments || [] };
  });
  for (const item of saved.values()) {
    if (item.sourceType !== "Additional Charge") continue;
    const job = (store.workOrders || []).find(row => row.id === item.workOrderId);
    if (!job || !job.contractId) continue;
    rows.push({ ...item, reference: job.number, customerName: job.customerName, site: job.site, payments: item.payments || [] });
  }
  return rows.map(item => {
    const invoiceTotal = roundMoney(item.invoice?.total || 0);
    const totalPaid = roundMoney((item.payments || []).reduce((sum, payment) => sum + Number(payment.amount || 0), 0));
    const outstanding = roundMoney(Math.max(0, invoiceTotal - totalPaid - Number(item.credits || 0)));
    const paymentStatus = !item.invoice ? "Upcoming" : outstanding <= 0 ? "Paid"
      : item.invoice.dueDate && item.invoice.dueDate < today ? "Overdue"
        : totalPaid > 0 ? "Partially Paid" : "Unpaid";
    const invoiceStatus = item.invoice ? item.invoice.sentAt ? "Sent to Customer" : "Invoice Received"
      : item.request ? item.request.preparedAt ? "Prepared" : "Pending Accountant Action" : "Not Requested";
    return { ...item, invoiceTotal, totalPaid, outstanding, invoiceStatus, paymentStatus };
  });
}

function billingFor(store, id) {
  return billingRows(store).find(item => item.id === id);
}

function saveBilling(store, record) {
  store.billingRecords ||= [];
  const index = store.billingRecords.findIndex(item => item.id === record.id);
  const { invoiceTotal: _invoiceTotal, totalPaid: _totalPaid, outstanding: _outstanding,
    invoiceStatus: _invoiceStatus, paymentStatus: _paymentStatus, ...persisted } = record;
  if (index < 0) store.billingRecords.push(persisted);
  else store.billingRecords[index] = persisted;
  return persisted;
}

module.exports = { roundMoney, billingRows, billingFor, saveBilling };
