const PROGRESS_PARTS = 5;

function completedFraction(items, completed) {
  return items.length ? items.filter(completed).length / items.length : 0;
}

function quantityFraction(items, field) {
  if (!items.length) return 0;
  const measured = items.filter(item => Number(item.boqQty) > 0);
  const totalBoq = measured.reduce((sum, item) => sum + Number(item.boqQty), 0);
  if (!totalBoq) return 0;
  const completed = measured.reduce((sum, item) => {
    const quantity = Number(item[field]);
    return sum + Math.min(Number(item.boqQty), Number.isFinite(quantity) ? Math.max(0, quantity) : 0);
  }, 0);
  return completed / totalBoq * measured.length / items.length;
}

function calculateProjectProgress(project) {
  const submittals = (project.submittals || []).filter(item => item.item);
  const installationItems = (project.installationItems || []).filter(item => item.item || item.itemNo);
  const testingItems = (project.testingItems || []).filter(item => item.activity || item.item);
  const parts = [
    completedFraction(submittals, item => /^approved(?: as noted)?$/i.test(String(item.status || "").trim())),
    quantityFraction(installationItems, "lpoQty"),
    quantityFraction(installationItems, "deliveredQty"),
    quantityFraction(installationItems, "installedQty"),
    completedFraction(testingItems, item => /^(finished|completed)$/i.test(String(item.status || "").trim()))
  ];
  const rounded = Math.round(parts.reduce((sum, part) => sum + part, 0) / PROGRESS_PARTS * 100);
  return rounded === 100 && parts.some(part => part < 1) ? 99 : rounded;
}

module.exports = { calculateProjectProgress };
