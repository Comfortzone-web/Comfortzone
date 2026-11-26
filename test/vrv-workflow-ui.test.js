const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function workflow() {
  const project = {
    id: 'vrv-test', workflowMode: 'vrv', details: {}, uploads: [],
    nodes: [{ id: 'thermal-upload', data: {} }, { id: 'vrv-upload', data: {} }, { id: 'thermal-table' }, { id: 'vrv-schedule' }],
    tables: {
      thermal: { columns: ['Indoor', 'Room'], rows: [] },
      vrvSchedule: { columns: ['System', 'Name', 'FCU'], rows: [] },
      costing: { rows: [], summary: {} }, boq: { rows: [], summary: {} }
    }, extracted: {}
  };
  const context = vm.createContext({
    state: project, defaultThermalColumns: ['Indoor','Room','Mode','Family or Model','Cooling DBT','Cooling WBT','Heating T','Tot Cool Cap','Sens Cool Cap','Heat Cap','Air Flow Rate'],
    thermalUploadIds: () => project.nodes[0].data.uploadId ? [project.nodes[0].data.uploadId] : [], escapeHtml: value => String(value ?? ''), prettyBytes: () => '1 KB',
    tableRowClass: () => '', tableCellNeedsReview: () => false, isGeneratedTableRow: () => false,
    VRV_SYSTEM_TOTAL_COLUMNS: ['Rq TC'], fmt: value => String(value), round2: value => Math.round(value * 100) / 100, num: value => Number(value) || 0,
    norm: value => String(value || '').trim().toLowerCase(), workflowCostingPriceItems: () => [],
    rebuildVrvScheduleTotals: () => {}, vrvScheduleTotalValue: () => 0
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/vrv-workflow.js'), 'utf8'), context);
  return { project, context, run: source => vm.runInContext(source, context) };
}

test('VRV custom columns commit with Enter, comma, and composed input', () => {
  const { context, run } = workflow();
  const listeners = new Map();
  const input = {
    value: '',
    addEventListener(name, handler) { listeners.set(name, handler); },
    focus() {}
  };
  const columns = [];
  const messages = [];
  let renders = 0;
  context.testInput = input;
  context.testColumns = columns;
  context.canvas = { querySelector: () => input };
  context.vrvDirty = () => {};
  context.renderVrvWorkspace = () => { renders += 1; };
  context.toast = message => messages.push(message);
  run('vrvBindCustomColumnInput(testInput,{customColumns:testColumns})');
  const key = (name, event) => listeners.get(name)({ preventDefault() {}, stopPropagation() {}, ...event });

  input.value = 'Unit Reference';
  key('keydown', { key: 'Enter' });
  assert.deepEqual(columns, ['Unit Reference']);
  input.value = 'Location';
  key('keydown', { key: 'Unidentified', code: 'Comma' });
  assert.deepEqual(columns, ['Unit Reference', 'Location']);
  input.value = 'Total Kw，Sensible Kw';
  listeners.get('input')();
  assert.deepEqual(columns, ['Unit Reference', 'Location', 'Total Kw']);
  assert.equal(input.value, 'Sensible Kw');
  key('keyup', { key: 'Unidentified', code: 'NumpadEnter' });
  assert.deepEqual(columns, ['Unit Reference', 'Location', 'Total Kw', 'Sensible Kw']);
  input.value = 'Flow Rate,';
  listeners.get('input')();
  assert.deepEqual(columns, ['Unit Reference', 'Location', 'Total Kw', 'Sensible Kw', 'Flow Rate']);
  assert.equal(run('vrvTokenDraft'), '');
  input.value = 'Location';
  key('keydown', { key: 'Enter' });
  assert.deepEqual(columns, ['Unit Reference', 'Location', 'Total Kw', 'Sensible Kw', 'Flow Rate']);
  assert.deepEqual(messages, ['Column already selected.']);
  assert.equal(renders, 5);
});

test('VRV custom-column tags wrap above a separate full-width input', () => {
  const css = fs.readFileSync(path.join(__dirname, '../public/styles.css'), 'utf8');
  const tokenLayout = css.match(/\.vrv-workspace \.vrv-tokens\{([^}]*)\}/)?.[1] || '';
  const tagLayout = css.match(/\.vrv-workspace \.vrv-token-list\{([^}]*)\}/)?.[1] || '';
  assert.match(tokenLayout, /grid-template-rows:auto 38px/);
  assert.match(tagLayout, /flex-wrap:wrap/);
  assert.doesNotMatch(tagLayout, /overflow-x:auto|white-space:nowrap/);
});

test('VRV steps render the live project tables and report tabs', () => {
  const { project, run } = workflow();
  assert.match(run('vrvStepOne()'), /Thermal Sheet Upload/);
  assert.match(run('vrvStepOne()'), /Air Flow Rate|Room/);
  project.extracted.vrv = { vrvRows: [{ system: 'VRV-1', fcu: 'FXMQ' }], materialRows: [{ model: 'FXMQ', qty: 2 }] };
  assert.match(run('vrvStepTwo()'), /VRV-1/);
  run("vrvData().reportTab='material'");
  assert.match(run('vrvStepTwo()'), /FXMQ/);
  project.tables.vrvSchedule.rows = [{ System: 'VRV-1', Name: 'Room A', FCU: 'FXMQ' }];
  assert.match(run('vrvStepThree()'), /Room A/);
});

test('VRV report displays extraction reconciliation warnings', () => {
  const { project, run } = workflow();
  project.extracted.vrv = { vrvRows: [], outdoorDetailsRows: [], materialRows: [], warnings: ['Indoor quantities differ from the material list.'] };
  assert.match(run('vrvStepTwo()'), /Review extraction: Indoor quantities differ from the material list\./);
});

test('custom export displays only requested columns and BOQ uses saved pricing', () => {
  const { project, run } = workflow();
  run("vrvData().mode='custom'; vrvData().customColumns=['Indoor','Room']");
  const custom = run('vrvStepOne()');
  assert.match(custom, /Extract Columns/);
  assert.match(custom, /class="vrv-token-list"[^>]*>.*?<\/div><input data-vrv-token-input/s);
  assert.doesNotMatch(custom, /<th>Mode<\/th>/);
  project.tables.costing.rows = [{ Model: 'FXMQ', Qty: 2, 'Final Price (AED)': 100, 'Increased Final Price (AED)': 120, 'Amount (AED)': 240 }];
  const boq = run('vrvStepFour()');
  assert.match(boq, /FXMQ/);
  assert.match(boq, /AED 240\.00/);
  assert.match(boq, /data-vrv-price="Model"/);
  assert.match(boq, /data-vrv-unit-price-open="0"/);
  assert.doesNotMatch(boq, /<input[^>]*data-vrv-unit-price=/);
  assert.equal(run('vrvBoqPricingError()'), false);
  project.tables.costing.rows.push({ Model: 'UNPRICED', Qty: 1, 'Final Price (AED)': '', 'Increased Final Price (AED)': '', 'Amount (AED)': '' });
  assert.equal(run('vrvBoqPricingError()'), true);
  assert.match(run('vrvStepFour()'), /vrv-total-error[^>]*>.*?<strong>Error<\/strong>/s);
  project.tables.costing.rows[1] = { Model: 'ZERO', Qty: 1, 'Final Price (AED)': 0, 'Increased Final Price (AED)': 0, 'Amount (AED)': 0 };
  assert.equal(run('vrvBoqPricingError()'), true);
});

test('VRV quotation cannot open with missing or zero prices in either selection mode', async () => {
  const { project, context, run } = workflow();
  let saved = 0, opened = 0;
  context.toast = () => {};
  context.saveProject = async () => { saved += 1; };
  context.createSalesQuotationFromWorkflow = async () => { opened += 1; };
  project.tables.costing.rows = [{ Model: 'FXMQ', Qty: 1, 'Final Price (AED)': '', 'Increased Final Price (AED)': '', 'Amount (AED)': '' }];
  for (const mode of ['report', 'manual']) {
    run(`vrvData().selectionMode='${mode}'`);
    await run("vrvAction('quotation')");
  }
  assert.equal(saved, 0);
  assert.equal(opened, 0);
  project.tables.costing.rows[0] = { Model: 'FXMQ', Qty: 1, 'Final Price (AED)': 100, 'Increased Final Price (AED)': 120, 'Amount (AED)': 120 };
  await run("vrvAction('quotation')");
  assert.equal(saved, 1);
  assert.equal(opened, 1);
});

test('thermal uploads show selectable files and DX-style preview controls', () => {
  const { project, run } = workflow();
  project.nodes[0].data.uploadId = 'upload-1';
  project.uploads.push({ id: 'upload-1', originalName: 'Thermal Sheet.pdf', size: 1024, mimeType: 'application/pdf' });
  const page = run('vrvStepOne()');
  assert.match(page, /data-vrv-file="upload-1"[^>]*checked/);
  assert.match(page, /Upload Files/);
  assert.match(page, /data-vrv-action="preview-selected"[^>]*>.*Preview<\/button>/);
  assert.doesNotMatch(page, /Preview Selected/);
  assert.match(page, /data-vrv-remove="upload-1"/);
});

test('VRV toolbar uses the DX menu style and the appropriate step actions', () => {
  const { run } = workflow();
  const thermal = run('vrvToolbarMenu(1)');
  assert.match(thermal, /dx-menu-trigger/);
  assert.match(thermal, /Lock Table/);
  assert.match(thermal, /Clear Table/);
  assert.doesNotMatch(thermal, /Save Draft|Download Schedule Excel/);
  const schedule = run('vrvToolbarMenu(3)');
  assert.match(schedule, /Download Excel/);
  assert.match(schedule, /Export PDF/);
  assert.match(schedule, /Regenerate/);
});

test('thermal and schedule tables retain their columns with DX-style empty states', () => {
  const { project, run } = workflow();
  const thermal = run('vrvStepOne()');
  assert.match(thermal, /data-vrv-search/);
  assert.match(thermal, /Your thermal data will appear here/);
  assert.match(thermal, /vrv-empty-panel/);
  project.tables.thermal.columns = ['Indoor','Room','Mode'];
  project.tables.thermal.rows = [{ Indoor: 'IDU-1', Room: 'Long room name', Mode: 'Cooling' }];
  const populated = run('vrvStepOne()');
  assert.match(populated, /Long room name/);
  assert.match(populated, /vrv-standard-table/);
  assert.equal((populated.match(/<col style="width:/g) || []).length, 11);
  assert.doesNotMatch(populated, /vrv-empty-panel/);
  project.tables.vrvSchedule.columns = ['System','Name','Location','Rq TC','Rq SC','Air Flow Rate','FCU','Type'];
  const schedule = run('vrvStepThree()');
  assert.match(schedule, /SPECIFIED/);
  assert.match(schedule, /PROPOSED INDOOR UNITS/);
  assert.equal((schedule.match(/class="vrv-placeholder-row"/g) || []).length, 6);
});
