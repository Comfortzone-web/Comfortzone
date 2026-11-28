const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function dashboard() {
  const source = fs.readFileSync(path.join(__dirname, '../public/cheque-management.js'), 'utf8');
  const exposed = source.replace('  window.chequeManagement = {', '  window.dashboardTest = { state, filtered, chequeFlow, monthlyChart, directionList, calendar };\n  window.chequeManagement = {');
  class FixedDate extends Date {
    constructor(...args) { super(...(args.length ? args : ['2026-11-27T08:00:00Z'])); }
    static now() { return Date.parse('2026-11-27T08:00:00Z'); }
  }
  const window = {};
  const root = { addEventListener() {} };
  vm.runInNewContext(exposed, { window, document: { getElementById: () => root }, Date: FixedDate, Intl, URL, fetch: () => {} });
  return window.dashboardTest;
}

const row = (id, chequeDate, type, amount, companyId = 'a', status = 'Pending', legacyCleared = false) => ({ id, chequeNo: id, chequeDate, type, amount, companyId, status, legacyCleared, party: `Party ${id}` });

test('rolling cheque flow and company filter use dated, outstanding cheques only', () => {
  const view = dashboard();
  view.state.data = { companies: [{ id: 'a', name: 'Company A' }, { id: 'b', name: 'Company B' }], records: [
    row('overdue', '2026-11-26', 'Issued', 900),
    row('today', '2026-11-27', 'Received', 100),
    row('sixDays', '2026-12-03', 'Issued', 30),
    row('sevenDays', '2026-12-04', 'Received', 50),
    row('twentyNineDays', '2026-12-26', 'Issued', 20),
    row('thirtyDays', '2026-12-27', 'Received', 10),
    row('cancelled', '2026-11-28', 'Received', 500, 'a', 'Cancelled'),
    row('returned', '2026-11-28', 'Issued', 500, 'a', 'Returned'),
    row('cleared', '2026-11-28', 'Received', 500, 'a', 'Deposited', true),
    row('otherCompany', '2026-11-28', 'Received', 700, 'b')
  ] };
  view.state.company = 'a';
  const rows = view.filtered();
  const seven = view.chequeFlow(rows);
  assert.match(seven, /View cheque today/);
  assert.match(seven, /View cheque sixDays/);
  for (const id of ['overdue', 'sevenDays', 'cancelled', 'returned', 'cleared', 'otherCompany']) assert.doesNotMatch(seven, new RegExp(`View cheque ${id}`));
  assert.match(seven, /<tfoot>.*100\.00.*30\.00.*70\.00.*<\/tfoot>/);
  assert.doesNotMatch(seven, /<tfoot>[\s\S]*AED /);

  view.state.alertDays = 30;
  const thirty = view.chequeFlow(rows);
  assert.match(thirty, /View cheque sevenDays/);
  assert.match(thirty, /View cheque twentyNineDays/);
  assert.doesNotMatch(thirty, /View cheque thirtyDays/);
  assert.match(thirty, /<tfoot>.*150\.00.*50\.00.*100\.00.*<\/tfoot>/);
});

test('monthly and payable/receivable views use the same filtered records', () => {
  const view = dashboard();
  view.state.data = { companies: [{ id: 'a', name: 'Company A' }, { id: 'b', name: 'Company B' }], records: [
    row('inNov', '2026-11-28', 'Received', 100),
    row('outDec', '2026-12-02', 'Issued', 40),
    row('inJan', '2027-01-02', 'Received', 200),
    row('outFeb', '2027-02-02', 'Issued', 60),
    row('outside', '2027-03-01', 'Received', 300),
    row('otherCompany', '2026-12-02', 'Issued', 999, 'b')
  ] };
  view.state.company = 'a';
  const rows = view.filtered();
  const chart = view.monthlyChart(rows);
  for (const month of ['Nov 2026', 'Dec 2026', 'Jan 2027', 'Feb 2027']) assert.match(chart, new RegExp(month));
  assert.doesNotMatch(chart, /Mar 2027|999\.00/);
  assert.match(view.directionList(rows, 'Received'), /Total: AED 600\.00/);
  assert.match(view.directionList(rows, 'Issued'), /Total: AED 100\.00/);
  view.state.type = 'Issued';
  assert.doesNotMatch(view.directionList(view.filtered(), 'Received'), /View cheque inNov/);
  view.state.type = '';
  view.state.search = 'inJan';
  assert.match(view.directionList(view.filtered(), 'Received'), /View cheque inJan/);
  assert.doesNotMatch(view.directionList(view.filtered(), 'Received'), /View cheque inNov/);
});

test('payable chart value is centered above its bar and clears a taller receivable bar', () => {
  const view = dashboard();
  view.state.data = { companies: [{ id: 'a', name: 'Company A' }], records: [
    row('in', '2026-11-28', 'Received', 35134.79),
    row('out', '2026-11-28', 'Issued', 11865.53)
  ] };
  const chart = view.monthlyChart(view.filtered());
  const label = chart.match(/<text x="([\d.]+)" y="[\d.]+" text-anchor="middle" class="chq-chart-value">11,865\.53<\/text>/);
  assert.ok(label);
  assert.ok(Number(label[1]) > 137);
});

test('calendar stacks cheques by date and respects company and type filters', () => {
  const view = dashboard();
  view.state.month = '2026-11';
  view.state.data = { companies: [{ id: 'a', name: 'Company A' }, { id: 'b', name: 'Company B' }], records: [
    row('receivedOne', '2026-11-13', 'Received', 100),
    row('issuedOne', '2026-11-13', 'Issued', 50),
    row('otherCompany', '2026-11-18', 'Issued', 300, 'b'),
    row('nextMonth', '2026-12-01', 'Received', 200)
  ] };
  view.state.company = 'a';
  const all = view.calendar(view.filtered());
  assert.match(all, /November 2026/);
  assert.match(all, /2 cheques/);
  assert.match(all, /data-open-cheque="receivedOne"/);
  assert.match(all, /data-open-cheque="issuedOne"/);
  assert.doesNotMatch(all, /data-open-cheque="otherCompany"|data-open-cheque="nextMonth"/);
  assert.equal((all.match(/class="chq-day /g) || []).length, 30);
  view.state.type = 'Received';
  const received = view.calendar(view.filtered());
  assert.match(received, /1 cheque/);
  assert.doesNotMatch(received, /data-open-cheque="issuedOne"/);
  view.state.month = '2026-12';
  assert.match(view.calendar(view.filtered()), /December 2026/);
});

test('today deposit is highlighted in flow and direction tables and party stays inside its cell', () => {
  const view = dashboard();
  const cheque = row('today', '2026-11-27', 'Issued', 100, 'a', 'Today Deposit');
  cheque.party = 'A long hardware supplier name that must fit inside the Party cell';
  view.state.data = { companies: [{ id: 'a', name: 'Company A' }], records: [cheque] };
  assert.match(view.chequeFlow(view.filtered()), /class="chq-today-deposit-row"/);
  assert.match(view.chequeFlow(view.filtered()), /class="chq-party-cell"><span title="A long hardware supplier name/);
  assert.match(view.directionList(view.filtered(), 'Issued'), /class="chq-today-deposit-row"/);
});
