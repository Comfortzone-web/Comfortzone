const INSTALLATION_CHECKPOINTS = ["lpo_status", "delivered_status", "installation_status"];

function statusCredit(value, completed, partial) {
  const status = String(value || "").trim().toLowerCase();
  if (completed.includes(status)) return 1;
  return partial.includes(status) ? 0.5 : 0;
}

function calculateProjectProgress(project) {
  const submittals = project.submittals || [];
  const installationItems = project.installationItems || [];
  const testingItems = project.testingItems || [];
  const total = submittals.length + installationItems.length * INSTALLATION_CHECKPOINTS.length + testingItems.length;
  if (!total) return 0;

  const submittalCredits = submittals.reduce((sum, item) =>
    sum + statusCredit(item.status, ["approved"], ["submitted"]), 0);
  const installationCredits = installationItems.reduce((sum, item) =>
    sum + INSTALLATION_CHECKPOINTS.reduce((rowSum, field) =>
      rowSum + statusCredit(item[field], ["completed"], ["in_progress"]), 0), 0);
  const testingCredits = testingItems.reduce((sum, item) =>
    sum + statusCredit(item.status, ["finished", "completed"], ["in progress"]), 0);
  return Math.round((submittalCredits + installationCredits + testingCredits) / total * 100);
}

module.exports = { calculateProjectProgress };
