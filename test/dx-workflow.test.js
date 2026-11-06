const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const vm=require('node:vm');
const server=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');
const app=fs.readFileSync(path.join(__dirname,'../public/app.js'),'utf8');
const ui=fs.readFileSync(path.join(__dirname,'../public/dx-workflow.js'),'utf8');
function extract(source,name) { const start=source.indexOf('function '+name+'('); assert.ok(start>=0,name); const end=source.indexOf('\n}',start)+2;return source.slice(start,end); }
test('selection numbers are unique under concurrent allocation and stable on reopen',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dx-numbering-test-'));
 const create=vm.runInNewContext('('+extract(server,'createDxNumbering')+')',{fs,path});
 const reserve=create({directory:dir});
 const numbers=await Promise.all(Array.from({length:30},(_,i)=>reserve('workflow-'+i)));
 assert.equal(new Set(numbers).size,30);assert.match(numbers[0],/^DX-\d{4}-\d{3,}$/);
 assert.equal(await reserve('workflow-0'),numbers[0]);
 const same=await Promise.all([reserve('same-workflow'),reserve('same-workflow')]);assert.equal(same[0],same[1]);
 assert.equal(await create({directory:dir})('workflow-0'),numbers[0]);
});
test('append skips exact duplicates and flags conflicting references without changing corrections',()=>{
 const columns=['Unit Ref','Type','Location','TKw','SKw','L/S'];
 const merge=vm.runInNewContext('('+extract(ui,'dxMergeRows')+')',{structuredClone,dxExportColumns:columns});
 const row={'Unit Ref':'DX-01',Type:'Ducted',Location:'Office',TKw:0,SKw:0,'L/S':0};
 const merged=merge([row],[{...row},{...row,TKw:4},{...row,'Unit Ref':'DX-02'}]);
 assert.equal(merged.length,3);assert.equal(merged[0].TKw,0);assert.ok(merged[0].__reviewCells['Unit Ref']);assert.ok(merged[1].__reviewCells['Unit Ref']);assert.equal(row.__reviewCells,undefined);
});
test('normalization preserves meaningful zero values and review flags',()=>{
 const context={};vm.createContext(context);
 for (const name of ['normalizeDxThermalRows','firstRowValue','hasDxValue','dxColumnForSource','columnKey']) { try {vm.runInContext(extract(app,name),context);}catch(e){throw e;} }
 const rows=context.normalizeDxThermalRows([{'Unit Ref':'A',Type:'Ducted',TKw:0,SKw:0,'L/S':0}]);assert.equal(rows.length,1);assert.equal(rows[0].TKw,0);
});

test('Excel match booleans are real booleans rather than numbers or strings',()=>{
 const cell=vm.runInNewContext('('+extract(server,'xlsxCell')+')',{escapeXml:String});
 assert.match(cell('F',9,true),/t="b".*<v>1<\/v>/);
 assert.match(cell('G',9,false),/t="b".*<v>0<\/v>/);
});

test('DX schedule retains blank and partial manual rows and carries review flags except Type',()=>{
 const columns=['Ref','Type','Location','TKw','SKw','L/S','Model ( Indoor / Outdoor )','Qty'];
 const state={tables:{thermal:{rows:[{'Unit Ref':'MAN-01',Type:'Ducted',Location:'Office',TKw:8.5,SKw:'','L/S':'',__reviewCells:{Type:{reason:'Legacy family flag'},TKw:{reason:'Check total'}}},{'Unit Ref':'',Type:'',Location:'',TKw:'',SKw:'','L/S':''}]},vrvSchedule:{rows:[]}}};
 const context={state,workflowScheduleColumns:()=>columns,applyDxProposal:row=>{row['Model ( Indoor / Outdoor )']='CATALOG';row.Qty=1;}};
 vm.createContext(context);vm.runInContext(extract(app,'buildDxSchedule'),context);context.buildDxSchedule();
 assert.equal(state.tables.vrvSchedule.rows.length,2);assert.equal(state.tables.vrvSchedule.rows[0].Ref,'MAN-01');assert.equal(state.tables.vrvSchedule.rows[0].SKw,'');
 assert.equal(state.tables.vrvSchedule.rows[0]['Model ( Indoor / Outdoor )'],'CATALOG');assert.equal(state.tables.vrvSchedule.rows[1]['Model ( Indoor / Outdoor )'],'');
 assert.ok(state.tables.vrvSchedule.rows[0].__reviewCells.TKw);assert.equal(state.tables.vrvSchedule.rows[0].__reviewCells.Type,undefined);
});

test('editable year numbers advance from the saved suffix and reject duplicates',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dx-number-edit-'));
 const create=vm.runInNewContext('('+extract(server,'createDxNumbering')+')',{fs,path});const reserve=create({directory:dir,year:()=>2026});
 assert.equal(await reserve.preview(),'DX-2026-001');assert.equal(await reserve.preview(),'DX-2026-001');
 assert.equal(await reserve('one','DX-2026-050'),'DX-2026-050');assert.equal(await reserve.preview(),'DX-2026-051');assert.equal(await reserve('two'),'DX-2026-051');
 await assert.rejects(reserve('two','DX-2026-050'),/already in use/);
 assert.equal(await reserve('two','DX-2026-100'),'DX-2026-100');assert.equal(await reserve('three'),'DX-2026-101');
 await assert.rejects(reserve('four','DX-100'),/DX-YYYY/);
});
test('legacy numbers migrate without losing project bindings',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dx-number-legacy-'));const create=vm.runInNewContext('('+extract(server,'createDxNumbering')+')',{fs,path});
 const reserve=create({directory:dir,year:()=>2026,seed:async()=>[{id:'old',workflowMode:'dx',selectionNumber:'DX-0007',createdAt:'2026-01-01',visible:true}]});
 assert.equal(await reserve('old'),'DX-2026-007');assert.equal(await reserve('new'),'DX-2026-008');
});
