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

test('custom export displays only requested columns and BOQ uses saved pricing', () => {
  const { project, run } = workflow();
  run("vrvData().mode='custom'; vrvData().customColumns=['Indoor','Room']");
  const custom = run('vrvStepOne()');
  assert.match(custom, /Extract Columns/);
  assert.doesNotMatch(custom, /<th>Mode<\/th>/);
  project.tables.costing.rows = [{ Model: 'FXMQ', Qty: 2, 'Final Price (AED)': 100, 'Increased Final Price (AED)': 120, 'Amount (AED)': 240 }];
  const boq = run('vrvStepFour()');
  assert.match(boq, /FXMQ/);
  assert.match(boq, /AED 240\.00/);
  assert.match(boq, /data-vrv-price="Model"/);
  assert.match(boq, /data-vrv-unit-price-open="0"/);
  assert.doesNotMatch(boq, /<input[^>]*data-vrv-unit-price=/);
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
