const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const DXBoq = require('../public/dx-boq');

const source = fs.readFileSync(path.join(__dirname, '../public/dx-boq-ui.js'), 'utf8');
const start = source.indexOf('function dxStepThree()');
const end = source.indexOf('function dxMountBoq()', start);

function render(rows) {
  const data = { boq: { margin: 20, rows } };
  const context = {
    DXBoq,
    dxData: () => data,
    dxBoqData: () => data.boq,
    dxRecalculateBoq: () => { data.boq = DXBoq.calculate(data.boq); },
    canAccessModule: () => true,
    dxBusy: false,
    dxQuotationOpening: false,
    dxBoqLoadingId: '',
    costingState: { priceItems: [] },
    dxIcon: () => '',
    dxButton: () => '',
    escapeHtml: value => String(value ?? ''),
    salesMoney: value => `AED ${Number(value).toFixed(2)}`
  };
  vm.createContext(context);
  vm.runInContext(source.slice(start, end), context);
  return context.dxStepThree();
}

test('DX totals show Error for missing or zero-priced lines, but valid totals remain numeric', () => {
  const missing = render([{ id: 'missing', origin: 'schedule', model: 'MISSING', qty: 1, unitPrice: null }]);
  assert.match(missing, /Total Amount<strong>Error<\/strong>/);
  assert.match(missing, /dx-boq-total-warning/);
  const zero = render([{ id: 'zero', origin: 'schedule', model: 'ZERO', qty: 1, unitPrice: 0 }]);
  assert.match(zero, /Total Selling<strong>Error<\/strong>/);
  const valid = render([{ id: 'valid', origin: 'schedule', model: 'PRICED', qty: 2, unitPrice: 100 }]);
  assert.match(valid, /Total Amount<strong>AED 250\.00<\/strong>/);
  assert.doesNotMatch(valid, /dx-boq-total-error/);
  assert.match(source, /const pricingErrors = DXBoq\.validate\(dxBoqData\(\)\);/);
});
