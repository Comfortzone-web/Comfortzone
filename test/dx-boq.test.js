const test = require('node:test');
const assert = require('node:assert/strict');
const boq = require('../public/dx-boq');
const prices = [{ id: 'set', model: 'ID-100 - OD-100', finalPrice: 1000, description: 'Ducted set' },
  { id: 'indoor', model: 'ID-200', finalPrice: 400.25 }, { id: 'outdoor', model: 'OD-200', finalPrice: 600.45 }];
const source = (model, qty, ref = 'DX-1') => ({ 'Model ( Indoor / Outdoor )': model, Qty: qty, Ref: ref });
test('exact sets take precedence; component lookup requires both exact prices and preserves product references', () => {
  assert.equal(boq.priceForModel('ID-100 - OD-100', prices).unitPrice, 1000);
  assert.equal(boq.priceForModel('ID-200 / OD-200', prices).unitPrice, 1000.70);
  assert.deepEqual(boq.priceForModel('ID-200 / OD-200', prices).priceItemIds, ['indoor', 'outdoor']);
  assert.equal(boq.priceForModel('ID-201 / OD-200', prices).unitPrice, null);
  assert.equal(boq.priceForModel('ID-200 / OD-999', prices).unitPrice, null);
  assert.equal(boq.priceForModel('ID-200', [...prices, { ...prices[1], id: 'duplicate' }]).unitPrice, null);
});
test('import groups models, sums equipment sets once and retains all source references', () => {
  const result = boq.sync(null, [source('ID-100 - OD-100', 2), source('ID-100 / OD-100', 3, 'DX-2'), source('', 1), source('CHOOSE MANUALLY', 1)], prices);
  assert.equal(result.rows.length, 1); assert.equal(result.rows[0].qty, 5);
  assert.equal(result.rows[0].sourceRefs.length, 2); assert.equal(result.rows[0].model, 'ID-100 - OD-100');
  assert.equal(result.rows[0].unitPrice, 1000); assert.equal(result.rows[0].sellingPrice, 1250);
});
test('financial calculations use gross margin and round selling/line totals in integer cents', () => {
  const result = boq.calculate({ margin: 20, rows: [{ qty: 3, unitPrice: '0.10' }, { qty: '2.5', unitPrice: '1000.01' }] });
  assert.equal(result.rows[0].sellingPrice, .13); assert.equal(result.rows[0].lineTotal, .39);
  assert.equal(result.rows[1].sellingPrice, 1250.01); assert.equal(result.rows[1].lineTotal, 3125.03);
  assert.equal(result.totals.cost, 2500.33); assert.equal(result.totals.selling, 3125.42); assert.equal(result.totals.amount, 3125.42);
  assert.equal(boq.calculate({ margin: 0, rows: [{ qty: 1, unitPrice: 0 }] }).totals.incomplete, false);
});
test('missing prices stay visible and block quotation; zero and blanks remain distinct', () => {
  const result = boq.sync(null, [source('MISSING', 1)], prices);
  assert.equal(result.rows[0].unitPrice, null); assert.equal(result.rows[0].lineTotal, null);
  assert.equal(result.totals.incomplete, true); assert.match(boq.validate(result).join(), /Unit Price/);
  assert.ok(boq.validate(boq.sync(null, [source('ID-100 - OD-100', 0)], prices)).some(error => /positive whole-number quantity/.test(error)));
  assert.ok(boq.validate({ margin: 100, rows: [] }).some(error => /95%/.test(error)));
});
test('synchronization detects quantity/removal changes without destroying price snapshots or manual rows', () => {
  const initial = boq.sync(null, [source('ID-100 - OD-100', 2)], prices);
  initial.rows[0].unitPrice = 1111; initial.rows[0].manualPrice = true;
  initial.rows.push({ id: 'manual', origin: 'manual', model: 'ID-200', qty: 3, unitPrice: 400.25 });
  const changed = boq.sync(initial, [source('ID-100 - OD-100', 5), source('ID-200 / OD-200', 2)], prices.map(item => ({ ...item, finalPrice: 9999 })));
  assert.equal(changed.rows.length, 3); assert.equal(changed.rows[0].qty, 5); assert.equal(changed.rows[0].pendingQty, null);
  assert.equal(changed.rows[0].unitPrice, 1111); assert.ok(changed.rows[0].manualPrice);
  assert.equal(changed.rows[1].id, 'manual'); assert.equal(changed.margin, 20);
  assert.equal(boq.validate(changed).length, 0);
  const applied = boq.sync(changed, [source('ID-100 - OD-100', 5)], prices, true);
  assert.equal(applied.rows[0].qty, 5); assert.equal(applied.rows[0].unitPrice, 1111); assert.equal(applied.rows[1].id, 'manual'); assert.equal(applied.rows.length, 2);
  const removed = boq.sync(applied, [], prices); assert.ok(removed.rows[0].sourceRemoved);
  assert.equal(boq.sync(removed, [], prices, true).rows.length, 1);
  assert.equal(initial.rows[0].qty, 2, 'saved input is not mutated');
});
test('unchanged schedule preserves quantity overrides and excluded rows do not reappear', () => {
  const initial = boq.sync(null, [source('ID-100 - OD-100', 2)], prices);
  initial.rows[0].qty = 9; initial.rows[0].qtyOverride = true;
  const result = boq.sync(initial, [source('ID-100 - OD-100', 2)], prices);
  assert.equal(result.rows[0].qty, 9); assert.equal(result.rows[0].pendingQty, null);
  result.rows = []; result.excludedModels = [boq.modelKey('ID-100 - OD-100')];
  assert.equal(boq.sync(result, [source('ID-100 - OD-100', 2)], prices).rows.length, 0);
});

test('legacy fractional overrides reset to source quantity and fractional quantities cannot be quoted', () => {
 const saved=boq.sync(null,[source('ID-100 - OD-100',27)],prices);
 saved.rows[0].qty=34.0003;saved.rows[0].qtyOverride=true;saved.rows[0].pendingQty=27;
 const result=boq.sync(saved,[source('ID-100 - OD-100',27)],prices);
 assert.equal(result.rows[0].qty,27);assert.equal(result.rows[0].pendingQty,null);
 result.rows[0].qty=1.5;assert.match(boq.validate(result).join(),/whole-number/);
});
