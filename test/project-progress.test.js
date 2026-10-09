const assert = require("node:assert/strict");
const test = require("node:test");
const { calculateProjectProgress } = require("../project-progress");

test("combines full and half credits across all tracked rows", () => {
  const project = {
    submittals: [{ status: "Approved" }, { status: "Pending" }],
    installationItems: [{ lpo_status: "completed", delivered_status: "completed", installation_status: "in_progress" }],
    testingItems: [{ status: "Finished" }, { status: "Pending" }]
  };
  assert.equal(calculateProjectProgress(project), 64);
});

test("submitted documentation earns half credit", () => {
  assert.equal(calculateProjectProgress({ submittals: [{ status: "Submitted" }] }), 50);
  assert.equal(calculateProjectProgress({ submittals: [{ status: " submitted " }] }), 50);
  assert.equal(calculateProjectProgress({ submittals: [{ status: "Rejected" }] }), 0);
});

test("each orange installation checkpoint earns half credit", () => {
  assert.equal(calculateProjectProgress({
    installationItems: [{ lpo_status: "in_progress", delivered_status: "in_progress", installation_status: "in_progress" }]
  }), 50);
  assert.equal(calculateProjectProgress({
    installationItems: [{ lpo_status: "completed", delivered_status: "issue", installation_status: "in_progress" }]
  }), 50);
});

test("in-progress testing earns half credit", () => {
  assert.equal(calculateProjectProgress({ testingItems: [{ status: "In Progress" }] }), 50);
  assert.equal(calculateProjectProgress({ testingItems: [{ status: "Pending" }] }), 0);
});

test("returns 100 only when every tracked item is complete", () => {
  assert.equal(calculateProjectProgress({
    submittals: [{ status: "Approved" }],
    installationItems: [{ lpo_status: "completed", delivered_status: "completed", installation_status: "completed" }],
    testingItems: [{ status: "Finished" }]
  }), 100);
});

test("supports legacy Completed testing status and empty projects", () => {
  assert.equal(calculateProjectProgress({ testingItems: [{ status: "Completed" }] }), 100);
  assert.equal(calculateProjectProgress({}), 0);
});
