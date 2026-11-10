const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const source=fs.readFileSync(path.join(__dirname,'../public/dx-workflow.js'),'utf8');
function helpers() {
  const context={clearTableCellReview:(row,column)=>{delete row.__reviewCells?.[column];}};
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('const dxCanonicalTypes ='),source.indexOf('function dxFlagCount(')),context);
  vm.runInContext(source.slice(source.indexOf('function dxFillThermalRows('),source.indexOf('function dxBindThermalFill(')),context);
  vm.runInContext(source.slice(source.indexOf('function numericDxValue('),source.indexOf('function dxApplyCatalogItem(')),context);
  return context;
}

test('clear OCR Type typos are corrected without changing unrelated types',()=>{
  const ctx=helpers();
  assert.equal(ctx.dxCorrectType('Dcuted'),'Ducted');
  assert.equal(ctx.dxCorrectType('ductted'),'Ducted');
  assert.equal(ctx.dxCorrectType('Decorative'),'Decorative');
  assert.equal(ctx.dxCorrectType('FCU'),'FCU');
  assert.equal(ctx.dxCorrectType('Unknown Type'),'Unknown Type');
});

test('fill down copies only the chosen column and clears replaced cell reviews',()=>{
  const ctx=helpers();
  const rows=[
    {Type:'Ducted',Location:'Room 1',TKw:2.4},
    {Type:'Dcuted',Location:'Room 2',TKw:3.6,__reviewCells:{Type:{reason:'Review'},TKw:{reason:'Review'}}},
    {Type:'Split',Location:'Room 3',TKw:4.8,__reviewCells:{Type:{reason:'Review'}}}
  ];
  ctx.dxFillThermalRows(rows,'Type',[0,1,2],'Ducted');
  assert.deepEqual(rows.map(row=>row.Type),['Ducted','Ducted','Ducted']);
  assert.deepEqual(rows.map(row=>row.Location),['Room 1','Room 2','Room 3']);
  assert.equal(rows[1].__reviewCells.TKw.reason,'Review');
  assert.equal(rows[1].__reviewCells.Type,undefined);
  ctx.dxFillThermalRows(rows,'TKw',[1,2],'5.2');
  assert.deepEqual(rows.map(row=>row.TKw),[2.4,5.2,5.2]);
});
