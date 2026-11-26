const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const app = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
const start = app.indexOf('async function saveDelivery(status) {');
const end = app.indexOf('async function cancelDeliveryNote(', start);
assert.ok(start >= 0 && end > start, 'Delivery Note save handler exists');
const saveHandler = app.slice(start, end);

function scenario(api) {
  const renders = [];
  const context = {
    deliverySavePending: false,
    inventoryWritePending: false,
    inventoryLoadedAt: 0,
    inventoryState: { deliveryNotes: [] },
    deliveryDraft: {},
    collectDeliveryDraft: status => ({
      id: '', dnNo: 'DN-TEST', date: '2026-11-26', customerName: 'Customer',
      deliveryLocation: 'Dubai', status,
      lines: [{ modelNo: 'MODEL', qtyGoingOut: 1, availableQty: 5 }]
    }),
    deliveryAllowedQty: () => 5,
    deliveryStockItem: () => ({ qty: 5 }),
    norm: value => String(value || '').toUpperCase(),
    newDeliveryDraft: () => ({}),
    closeDeliveryModal: () => {},
    renderInventory: () => renders.push(context.inventoryState.deliveryNotes.map(note => ({ ...note }))),
    openDeliveryModal: note => { context.reopened = note; },
    toast: () => {},
    alert: message => { throw new Error(message); },
    api
  };
  vm.runInNewContext(`${saveHandler}\nthis.saveDelivery = saveDelivery;`, context);
  return { context, renders };
}

test('Delivery Note row appears before save completes and repeated create is ignored', async () => {
  let resolveSave;
  let calls = 0;
  const { context, renders } = scenario(() => {
    calls++;
    return new Promise(resolve => { resolveSave = resolve; });
  });
  const saving = context.saveDelivery('Delivered');
  assert.equal(calls, 1);
  assert.equal(renders.length, 1);
  assert.equal(renders[0][0].dnNo, 'DN-TEST');
  assert.equal(renders[0][0].__pendingLabel, 'Creating...');
  await context.saveDelivery('Delivered');
  assert.equal(calls, 1);
  resolveSave({ deliveryNotes: [{ id: 'saved', dnNo: 'DN-TEST', status: 'Delivered' }] });
  await saving;
  assert.equal(context.inventoryState.deliveryNotes[0].id, 'saved');
  assert.equal(context.deliverySavePending, false);
});

test('failed Delivery Note save removes pending row and restores the form', async () => {
  const { context } = scenario(() => Promise.reject(new Error('Save failed')));
  await context.saveDelivery('Delivered');
  assert.equal(context.inventoryState.deliveryNotes.length, 0);
  assert.equal(context.reopened.dnNo, 'DN-TEST');
  assert.equal(context.reopened.status, 'Draft');
  assert.equal(context.deliverySavePending, false);
});
