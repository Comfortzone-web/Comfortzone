const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const functions = [
  'extractVrvFile', 'validateVrvReportCounts', 'unzipEntries', 'xmlText', 'extractTables',
  'extractMaterialRows', 'outdoorModelFromCell', 'normalizeVrvSystemName',
  'parseVrvSystemHeading', 'reportSystemHeadingsByTable', 'fcuNameFromCells',
  'indoorModelFromCells', 'systemFromName', 'extractOutdoorDetailRefs',
  'extractOutdoorCrValues', 'extractIndoorGroups', 'extractVrvRows', 'cleanCell'
];
const functionSource = name => {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, name);
  const end = source.indexOf('\n}', start) + 2;
  assert.ok(end > start, name);
  return source.slice(start, end);
};
const context = vm.createContext({ fs, path, zlib, Buffer });
vm.runInContext(functions.map(functionSource).join('\n'), context);

const escapeXml = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const paragraph = value => `<w:p><w:r><w:t>${escapeXml(value)}</w:t></w:r></w:p>`;
const table = rows => `<w:tbl>${rows.map(row => `<w:tr>${row.map(cell => `<w:tc>${paragraph(cell)}</w:tc>`).join('')}</w:tr>`).join('')}</w:tbl>`;
function report(materialIndoorQty = 2) {
  const parts = [table([
    ['Model', 'Quantity', 'Description'],
    ['RXYMQ8AYFK', '2', 'Outdoor unit'],
    ['FXMQ100PBV1', String(materialIndoorQty), 'Indoor unit']
  ])];
  for (const system of ['Tower East', 'Tower West']) {
    parts.push(paragraph(`${system} - RXYMQ8AYFK`));
    parts.push(table([
      ['Name', 'FCU', 'Cooling'],
      ['', '', 'Tmp C', 'Rq TC', 'Max TC', 'Rq SC', 'Tevap', 'Max SC', 'PIC'],
      ['', '', '°C', 'kW', 'kW', 'kW', '°C', 'kW', 'kW'],
      ['Room A', 'FXMQ100PBV1', '24.4/17.2', '9.5', '9.9', 'n/a', '6.0', '7.7', '0.215']
    ]));
    parts.push(table([
      ['Name', 'FCU', '', ''], ['', '', 'PIH', 'Air Flow Rate'], ['', '', 'kW', 'l/s'],
      ['Room A', 'FXMQ100PBV1', '0.203', '533.33']
    ]));
  }
  parts.push(table([
    ['Name', 'Model', 'CR', 'Cooling'], ['', '', '', 'Tmp C', 'CC', 'Rq CC'], ['', '', '%', '°C', 'kW', 'kW'],
    ['Tower East', 'RXYMQ8AYFK', '100.0', '46.0', '15.8', '19.0'],
    ['Tower West', 'RXYMQ8AYFK', '100.0', '46.0', '15.8', '19.0']
  ]));
  parts.push(table([
    ['Name', 'Model', 'PS', 'MCA'], ['', '', '', 'A'],
    ['Tower East', 'RXYMQ8AYFK', '400V 3Nph', '24.0'],
    ['Tower West', 'RXYMQ8AYFK', '400V 3Nph', '24.0']
  ]));
  return Buffer.from(`<w:document><w:body>${parts.join('')}</w:body></w:document>`);
}

test('different outdoor names and repeated indoor names remain separate systems', () => {
  const result = context.extractVrvFile(report(), 'selection.xml');
  assert.equal(result.status, 'ok');
  assert.equal(result.vrvRows.length, 2);
  assert.deepEqual(Array.from(result.vrvRows, row => row.system), ['TOWER EAST', 'TOWER WEST']);
  assert.deepEqual(Array.from(result.vrvRows, row => row.name), ['Room A', 'Room A']);
  assert.ok(result.vrvRows.every(row => row.airFlowRate === '533.33'));
  assert.equal(result.outdoorDetailsRows.length, 2);
  assert.deepEqual(Array.from(result.outdoorDetailsRows, row => row.Name), ['TOWER EAST', 'TOWER WEST']);
  assert.ok(result.outdoorDetailsRows.every(row => row.CR === '100.0' && row['CC Kw'] === '15.8' && row.PS === '400V 3Nph'));
  assert.deepEqual(Array.from(result.warnings), []);
});

test('material list quantity mismatch marks report for review', () => {
  const result = context.extractVrvFile(report(3), 'selection.xml');
  assert.equal(result.status, 'partial');
  assert.match(result.warnings.join(' '), /FXMQ100PBV1 2\/3/);
});

test('VRV named systems retain combined outdoor parent and physical modules', () => {
  const xml = [
    table([
      ['Model', 'Quantity', 'Description'], ['RXQ12ARYFK', '1', 'Outdoor module'],
      ['RXQ10ARYFK', '1', 'Outdoor module'], ['FXMQ100PBV1', '2', 'Indoor unit']
    ]),
    paragraph('VRV-01 - RXQ22ANRYFK = RXQ12ARYFK + RXQ10ARYFK'),
    table([
      ['Name', 'FCU', 'Cooling'], ['', '', 'Tmp C', 'Rq TC', 'Max TC', 'Rq SC', 'Tevap', 'Max SC', 'PIC'],
      ['', '', '°C', 'kW', 'kW', 'kW', '°C', 'kW', 'kW'],
      ['GF-FCU01', 'FXMQ100PBV1', '24.4/17.2', '9.5', '9.9', '8.5', '6.0', '7.7', '0.215'],
      ['GF-FCU02', 'FXMQ100PBV1', '24.4/17.2', '9.5', '9.9', '8.5', '6.0', '7.7', '0.215']
    ]),
    table([
      ['Name', 'Model', 'PS', 'MCA'], ['', '', '', 'A'],
      ['VRV-01', 'RXQ22ANRYFK', '400V 3Nph', ''],
      ['A', '- RXQ12ARYFK', '', '26.9'], ['B', '- RXQ10ARYFK', '', '26.9']
    ])
  ].join('');
  const result = context.extractVrvFile(Buffer.from(`<w:document><w:body>${xml}</w:body></w:document>`), 'selection.xml');
  assert.equal(result.status, 'ok');
  assert.equal(result.vrvRows.length, 2);
  assert.equal(result.vrvRows[0].system, 'VRV-01');
  assert.deepEqual(Array.from(result.vrvRows[0].outdoorRefs, row => row.outdoorModel), ['RXQ22ANRYFK', 'RXQ12ARYFK', 'RXQ10ARYFK']);
  assert.deepEqual(Array.from(result.vrvRows[0].outdoorComponents), ['RXQ12ARYFK', 'RXQ10ARYFK']);
  assert.equal(result.outdoorDetailsRows.length, 3);
  assert.deepEqual(Array.from(result.warnings), []);
});

test('schedule keeps generic outdoor cooling capacity and power supply', () => {
  const extracted = context.extractVrvFile(report(), 'selection.xml');
  const appSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  const appFunction = name => {
    const start = appSource.indexOf(`function ${name}(`);
    assert.ok(start >= 0, name);
    return appSource.slice(start, appSource.indexOf('\n}', start) + 2);
  };
  const state = { extracted: { vrv: extracted } };
  const schedule = vm.createContext({ state, norm: value => String(value || '').trim().toLowerCase() });
  vm.runInContext(['vrvExtractedOutdoorGroups', 'normalizeOutdoorAssignments', 'groupVrvRowsForSchedule', 'vrvOutdoorCcForSchedule'].map(appFunction).join('\n'), schedule);
  const rows = schedule.groupVrvRowsForSchedule(extracted.vrvRows);
  assert.equal(rows[0].outdoorName, 'TOWER EAST');
  assert.equal(rows[0].outdoorModel, 'RXYMQ8AYFK');
  assert.equal(rows[0].outdoorPs, '400V 3Nph');
  assert.equal(schedule.vrvOutdoorCcForSchedule(rows[0].outdoorName, rows[0].outdoorModel, {}), '15.8');
  assert.equal(schedule.vrvOutdoorCcForSchedule('A', 'RXQ12ARYFK', {}), '');
});

test('RXYMQ8 outdoor lookup fills saved schedule blanks without replacing report CC', () => {
  const lookup = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'master-lookups.json'), 'utf8'));
  const model = lookup.outdoorData.find(item => item.model === 'RXYMQ8AYFK');
  assert.deepEqual({ ambient:model.ambient, ps:model.ps, mca:model.mca, rla:model.rla,
    wxhxd:model.wxhxd, weight:model.weight, nominalIndex:model.nominalIndex },
    { ambient:46, ps:'400V 3Nph', mca:24, rla:10.8, wxhxd:'940 x 1,627 x 460', weight:170, nominalIndex:200 });
  const project = { workflowMode:'vrv', nodes:[], tables:{ thermal:{rows:[]}, vrvSchedule:{rows:[{
    'Outdoor Name':'ODU-TYP-01', 'Outdoor Model':'RXYMQ8AYFK', CC:'15.8', 'Outdoor PS':'400V 3Nph'
  }]}}};
  const hydration = vm.createContext({ loadMasterLookups:()=>lookup, loadMasterPriceList:()=>({items:[]}),
    workflowScheduleColumns:()=>[], workflowThermalColumns:()=>[], cleanCell:context.cleanCell });
  vm.runInContext(functionSource('hydrateProject'), hydration);
  const row = hydration.hydrateProject(project).tables.vrvSchedule.rows[0];
  assert.equal(row['Outdoor Nominal Index'], 200);
  assert.equal(row['Ambient Temp'], 46);
  assert.equal(row.CC, '15.8');
  assert.equal(row['Outdoor MCA'], 24);
  assert.equal(row.RLA, 10.8);
  assert.equal(row['Outdoor WxHxD'], '940 x 1,627 x 460');
  assert.equal(row['Outdoor Weight'], 170);
  assert.equal(row['PI ESMA'], undefined);
});
