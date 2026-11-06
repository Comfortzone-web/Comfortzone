const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const zlib = require('node:zlib');

// Exercise the real XLSX template and production exporter without starting a server.
const source = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
function extract(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, name);
  return source.slice(start, source.indexOf('\n}', start) + 2);
}
const context = { fs, path, zlib, Buffer, DX_SELECTION_TEMPLATE: path.join(__dirname, '../data/dx-selection-template.xlsx') };
vm.createContext(context);
const functions = [
  'generateDxSelectionWorkbook', 'fillDxSelectionSheetXml', 'dxExcelType', 'dxScheduleColumns',
  'xlsxDxTemplateRowNumber', 'xlsxDxLastDataRow', 'xlsxTranslateDxFormula',
  'xlsxExpandDxSelectionSharedFormulas', 'xlsxRestoreDxRowFormulas', 'cloneDxSelectionRow',
  'xlsxUpdateDxTotalRow', 'xlsxDxRegularBodyStyles', 'xlsxUpdateDimension', 'xlsxRemoveCellsInColumns', 'xlsxRemoveRowsInRange',
  'replaceXlsxRow', 'removeWorkbookCalcChain', 'removeWorkbookPivotTables', 'forceWorkbookRecalculation',
  'findWorkbookSheetPath', 'firstFilled', 'xlsxRowsByNumber', 'xlsxColumnRange', 'xlsxColumnIndex',
  'xlsxColumnName', 'xlsxRowStyleMap', 'xlsxEnsureStyledCells', 'xlsxCellStyle', 'xlsxCellXml',
  'xlsxCellRegex', 'xlsxUpsertCell', 'xlsxSetFormulaCachedValue', 'xlsxCell', 'escapeRegExp',
  'escapeXml', 'unzipEntriesBuffer', 'zipEntries', 'crc32'
];
vm.runInContext(functions.map(extract).join('\n') + '\n' +
  source.slice(source.indexOf('const crcTable ='), source.indexOf('\nfunction crc32')) +
  '\nconst DX_SELECTION_TABLE_COLUMNS = xlsxColumnRange("B", "AO");', context);
const template = context.unzipEntriesBuffer(fs.readFileSync(context.DX_SELECTION_TEMPLATE));
const proposedColumns = Array.from(context.xlsxColumnRange('H', 'AE'));
const keys = Array.from(context.dxScheduleColumns());

function workbook(rows) {
  return context.unzipEntriesBuffer(context.generateDxSelectionWorkbook({ rows, match: { sensible: true, airflow: true } }));
}
function cells(xml) {
  return Object.fromEntries((xml.match(/<c\b[^>]*\/>|<c\b[^>]*>[\s\S]*?<\/c>/g) || [])
    .map(cell => [cell.match(/\br="([A-Z]+\d+)"/)[1], cell]));
}
function value(cell) {
  const raw = cell.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? cell.match(/<t>([\s\S]*?)<\/t>/)?.[1] ?? '';
  return raw.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}
function row(index) {
  const result = Object.fromEntries(keys.map((key, i) => [key, i < 3 ? `${key} ${index}` : index + i / 100]));
  Object.assign(result, { Type: index % 2 ? 'Ducted-Inv' : 'Ducted', Location: `Room ${index}\nStorage & Lobby`,
    'Model ( Indoor / Outdoor )': `INDOOR-${index} / OUTDOOR-${index}`, 'Proposed Type': 'Non-Inverter',
    Refrigerant: 'R-410A', 'Indoor Temperature': '24/16', SPEED: 'MEDIUM', 'Power Supply': '380-415/3/50' });
  return result;
}

test('every Proposed value is exported for all rows, including template gaps and rows beyond its capacity', () => {
  const rows = Array.from({ length: 400 }, (_, i) => row(i + 1));
  rows[1].__manualProposal = true;
  rows[2]['TC'] = 0;
  rows[2]['Actual Power Input'] = '0';
  const entries = workbook(rows);
  const xml = entries['xl/worksheets/sheet1.xml'].data.toString();
  const exported = cells(xml);
  rows.forEach((saved, i) => {
    const rowNumber = 17 + i;
    proposedColumns.forEach((column, j) => {
      const ref = column + rowNumber;
      assert.ok(exported[ref], `missing cell ${ref}`);
      assert.match(exported[ref], /<f>/, `missing formula ${ref}`);
      assert.equal(value(exported[ref]), String(saved[keys[j + 6]]), `incorrect saved value ${ref}`);
    });
    assert.equal(value(exported['D' + rowNumber]), saved.Location);
    assert.equal(value(exported['AN' + rowNumber]), saved[keys[6]]);
    assert.equal(value(exported['AO' + rowNumber]), String(saved.Qty));
    assert.match(exported['H' + rowNumber], new RegExp(`<f>AN${rowNumber}</f>`));
    assert.match(exported['J' + rowNumber], new RegExp(`H${rowNumber}`));
  });
  assert.doesNotMatch(exported.AN18, /<f>/, 'manual model stays an override');
  assert.match(exported.AN19, /<f>/, 'automatic model remains a selection formula');
  assert.match(xml, /<dimension ref="B4:AO417"\/>/);
  assert.doesNotMatch(xml, /t="shared"/);
  assert.match(exported.I417, /SUM\(I17:I416\)/);
  assert.equal(value(exported.I417), String(rows.reduce((sum, row) => sum + row.Qty, 0)));
  for (const name of ['xl/worksheets/sheet2.xml', 'xl/worksheets/sheet3.xml']) {
    assert.deepEqual(entries[name].data, template[name].data, `${name} must be preserved`);
  }
});

test('all total ranges cover exactly the exported body and caches include row quantities', () => {
  for (const count of [0, 1, 6, 81, 148, 149, 400]) {
    const rows = Array.from({ length: count }, (_, i) => ({ Qty: i % 3 + 1, TC: 4.24, SC: 4.11, 'AFR L/S': 255, 'ESMA Power Input': 1.8 }));
    const exported = cells(workbook(rows)['xl/worksheets/sheet1.xml'].data.toString());
    const last = 16 + Math.max(1, count), total = last + 1;
    for (const [column, key] of [['I', 'Qty'], ['O', 'TC'], ['P', 'SC'], ['Q', 'AFR L/S'], ['T', 'ESMA Power Input']]) {
      const expectedFormula = column === 'I' ? `SUM(I17:I${last})` : `SUMPRODUCT(I17:I${last},${column}17:${column}${last})`;
      assert.equal(exported[column + total].match(/<f>(.*?)<\/f>/)[1], expectedFormula);
      const expected = rows.reduce((sum, row) => sum + row[key] * (column === 'I' ? 1 : row.Qty), 0);
      assert.equal(Number(value(exported[column + total])), expected);
    }
  }
});

test('uploaded 81-row regression totals match Proposed values rather than old template totals', () => {
  const rows = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/dx-export-81-row-proposals.json'), 'utf8'));
  const exported = cells(workbook(rows)['xl/worksheets/sheet1.xml'].data.toString());
  assert.equal(Number(value(exported.I98)), 81);
  assert.ok(Math.abs(Number(value(exported.O98)) - 540.46) < 1e-8);
  assert.ok(Math.abs(Number(value(exported.P98)) - 506.08) < 1e-8);
  assert.equal(Number(value(exported.Q98)), 34470);
});

test('Specified body fonts are regular while headers, totals and original style definitions remain intact', () => {
  const entries = workbook(Array.from({ length: 150 }, (_, i) => row(i)));
  const xml = entries['xl/worksheets/sheet1.xml'].data.toString();
  const originalStyles = template['xl/styles.xml'].data.toString();
  const exportedStyles = entries['xl/styles.xml'].data.toString();
  const fonts = s => s.match(/<fonts\b[^>]*>([\s\S]*?)<\/fonts>/)[1].match(/<font\b[^>]*>[\s\S]*?<\/font>/g);
  const styles = s => s.match(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/)[1].match(/<xf\b[^>]*\/>|<xf\b[^>]*>[\s\S]*?<\/xf>/g);
  const sourceFonts = fonts(originalStyles), sourceStyles = styles(originalStyles);
  const actualFonts = fonts(exportedStyles), actualStyles = styles(exportedStyles);
  assert.deepEqual(actualFonts.slice(0, sourceFonts.length), sourceFonts);
  assert.deepEqual(actualStyles.slice(0, sourceStyles.length), sourceStyles);
  const exported = cells(xml), original = cells(template['xl/worksheets/sheet1.xml'].data.toString());
  for (let number = 17; number < 167; number++) {
    for (const column of ['B', 'C', 'D', 'E', 'F', 'G']) {
      const styleId = Number(exported[column + number].match(/\bs="(\d+)"/)[1]);
      const fontId = Number(actualStyles[styleId].match(/\bfontId="(\d+)"/)[1]);
      assert.doesNotMatch(actualFonts[fontId], /<b\b/, `bold body ${column}${number}`);
      if (original[column + number]) {
        const oldStyleId = Number(original[column + number].match(/\bs="(\d+)"/)[1]);
        assert.equal(actualStyles[styleId].replace(/fontId="\d+"/, ''), sourceStyles[oldStyleId].replace(/fontId="\d+"/, ''));
      }
    }
  }
  for (const ref of ['B12', 'B13', 'E13', 'H12', 'O13']) assert.equal(exported[ref], original[ref], `preserve header ${ref}`);
  assert.equal(exported.O167.match(/\bs="(\d+)"/)[1], original.O165.match(/\bs="(\d+)"/)[1]);
});

test('blank and partial saved rows do not inherit old template Proposed values', () => {
  const rows = [row(1), {}, { Ref: 'PARTIAL', Type: 'Ducted', TKw: 0 }, row(4)];
  rows[3].__manualProposal = true;
  rows[3].Qty = '';
  const xml = workbook(rows)['xl/worksheets/sheet1.xml'].data.toString();
  const exported = cells(xml);
  for (const number of [18, 19]) {
    for (const column of proposedColumns) {
      assert.equal(value(exported[column + number]), '', `${column}${number} should be blank`);
    }
  }
  assert.equal(value(exported.E19), '0');
  assert.equal(value(exported.H20), rows[3][keys[6]]);
  assert.equal(value(exported.J20), String(rows[3]['NOMINAL TR']));
  assert.doesNotMatch(exported.AO20, /<f>/, 'blank manual quantity stays blank after recalculation');
  assert.equal(Object.keys(context.xlsxRowsByNumber(xml)).filter(n => Number(n) >= 17).length, 5);
});

test('formula translation keeps absolute ranges and quoted text stable', () => {
  assert.equal(context.xlsxTranslateDxFormula('IF(H17="A17",$B$17+C$17+$D17+Data!E17,"R32")', 12),
    'IF(H29="A17",$B$17+C$17+$D29+Data!E29,"R32")');
});
