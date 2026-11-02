const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
const functionSource = source.match(/function normalizeCostingSheets\(parsed = \{\}\) \{[\s\S]*?\n\}\n\nasync function readCostingSheets/);
assert.ok(functionSource, "costing store normalizer exists");

const normalizeCostingSheets = vm.runInNewContext(
  `(${functionSource[0].replace(/\n\nasync function readCostingSheets$/, "")})`,
  {
    defaultCostingSheets: () => ({ priceItems: [], sheets: [] }),
    normalizeCostingPriceItem: item => ({ ...item, history: item.history || [] }),
    normalizeCostingSheet: sheet => sheet,
    inventoryNorm: value => String(value || "").toUpperCase(),
    costingNumber: value => Number(value) || 0,
    cleanCell: value => String(value || "")
  }
);

test("legacy Unit Price becomes the displayed Final Unit Price only once", () => {
  const legacy = {
    priceItems: [{ id: "ac", model: "AC-1", costPrice: 80, finalPrice: 100,
      history: [{ finalPrice: 90, costPrice: 70 }] }],
    settings: { priceIncrease: 20, priceListLocked: false },
    sheets: []
  };
  const migrated = normalizeCostingSheets(legacy);
  assert.equal(migrated.priceItems[0].finalPrice, 120);
  assert.equal(migrated.priceItems[0].history[0].finalPrice, 108);
  assert.equal(migrated.settings.priceListLocked, false);
  assert.equal(Object.hasOwn(migrated.settings, "priceIncrease"), false);
  assert.equal(migrated.priceVersion, 2);
  assert.equal(normalizeCostingSheets(migrated).priceItems[0].finalPrice, 120);
});

test("older Price Lists without settings retain the previously displayed price", () => {
  const migrated = normalizeCostingSheets({
    priceItems: [{ model: "FTKF30UVMKL - RKF30UVMKL", finalPrice: 3091.67 }],
    sheets: []
  });
  assert.equal(migrated.priceItems[0].finalPrice, 3710);
  assert.equal(normalizeCostingSheets(migrated).priceItems[0].finalPrice, 3710);
});

test("custom legacy increase is applied when migrating a saved Price List", () => {
  const migrated = normalizeCostingSheets({
    priceItems: [{ model: "AC-2", finalPrice: 100 }],
    settings: { priceIncrease: 25, priceListLocked: true }
  });
  assert.equal(migrated.priceItems[0].finalPrice, 125);
  assert.equal(migrated.settings.priceListLocked, true);
});

test("legacy manual rows keep their previously displayed final price", () => {
  const migrated = normalizeCostingSheets({
    priceItems: [{ model: "LISTED", finalPrice: 100 }],
    settings: { priceIncrease: 20, priceListLocked: false },
    sheets: [{ id: "sheet", rows: [
      { model: "MANUAL", finalPrice: 50, increasedFinalPrice: 0 },
      { model: "LISTED", finalPrice: 100, increasedFinalPrice: 0 }
    ] }]
  });
  assert.equal(migrated.sheets[0].rows[0].increasedFinalPrice, 60);
  assert.equal(migrated.sheets[0].rows[1].increasedFinalPrice, 0);
});
