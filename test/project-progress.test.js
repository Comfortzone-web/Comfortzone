const assert = require("node:assert/strict");
const test = require("node:test");
const { calculateProjectProgress } = require("../project-progress");

test("combines approvals, BOQ quantities, and finished testing as five equal parts", () => {
  const project = {
    submittals: [{ item: "Drawing", status: "Approved" }, { item: "Material", status: "Pending" }],
    installationItems: [{ item: "Duct", boqQty: 100, lpoQty: 100, deliveredQty: 50, installedQty: 25 }],
    testingItems: [{ activity: "Pressure", status: "Finished" }, { activity: "Commissioning", status: "Pending" }]
  };
  assert.equal(calculateProjectProgress(project), 55);
});

test("submittals count only when approved and testing counts only when finished", () => {
  assert.equal(calculateProjectProgress({ submittals: [{ item: "Drawing", status: "Submitted" }] }), 0);
  assert.equal(calculateProjectProgress({ submittals: [{ item: "Drawing", status: "Approved" }] }), 20);
  assert.equal(calculateProjectProgress({ testingItems: [{ activity: "Pressure", status: "In Progress" }] }), 0);
  assert.equal(calculateProjectProgress({ testingItems: [{ activity: "Pressure", status: "Finished" }] }), 20);
});

test("quantities are capped per BOQ row so over-ordering cannot hide an incomplete row", () => {
  assert.equal(calculateProjectProgress({
    installationItems: [
      { item: "Duct", boqQty: 100, lpoQty: 200 },
      { item: "Pipe", boqQty: 100, lpoQty: 0 }
    ]
  }), 10);
});

test("an item without BOQ quantity prevents full completion and blank rows do not count", () => {
  const complete = {
    submittals: [{ item: "Drawing", status: "Approved" }],
    installationItems: [{ item: "Duct", boqQty: 10, lpoQty: 10, deliveredQty: 10, installedQty: 10 }],
    testingItems: [{ activity: "Pressure", status: "Finished" }]
  };
  assert.equal(calculateProjectProgress(complete), 100);
  assert.equal(calculateProjectProgress({ ...complete, installationItems: [...complete.installationItems, { item: "Pipe" }] }), 70);
  assert.equal(calculateProjectProgress({ ...complete, installationItems: [...complete.installationItems, { item: "" }] }), 100);
});

test("returns 100 only when all five project parts are complete", () => {
  assert.equal(calculateProjectProgress({
    submittals: [{ item: "Drawing", status: "Approved" }],
    installationItems: [{ item: "Duct", boqQty: 10, lpoQty: 10, deliveredQty: 10, installedQty: 10 }],
    testingItems: [{ activity: "Pressure", status: "Finished" }]
  }), 100);
});

test("supports Completed testing status and empty projects", () => {
  assert.equal(calculateProjectProgress({ testingItems: [{ activity: "Pressure", status: "Completed" }] }), 20);
  assert.equal(calculateProjectProgress({}), 0);
});
