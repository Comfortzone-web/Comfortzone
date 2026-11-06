const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.join(__dirname,'..'),app=fs.readFileSync(path.join(root,'public/app.js'),'utf8');
function extract(name){const start=app.indexOf('function '+name+'(');return app.slice(start,app.indexOf('\n}',start)+2);}
const ctx={state:{dx:{match:{sensible:false,airflow:false,totalVariation:0,sensibleVariation:0,airflowVariation:0}}}};
vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(root,'public/dx-selection-data.js'),'utf8')+'\nconst dxProposalCatalog=dxWorkbookCatalog;\n'+['dxNumber','dxExcelFamily','dxExcelLookupIndex','chooseDxProposal','applyDxProposal'].map(extract).join('\n'),ctx);
function choose(row,match={}){ctx.state.dx.match={sensible:false,airflow:false,totalVariation:0,sensibleVariation:0,airflowVariation:0,...match};return ctx.chooseDxProposal(row);}
test('Excel example 10/9/800 selects 4TR normally and 5TR with airflow matching, never multiple small units',()=>{
 const row={Type:'Ducted',TKw:10,SKw:9,'L/S':800};
 assert.equal(choose(row).item.model,'FDMRN50AVKU - RR50AYKU');assert.equal(choose(row,{sensible:true}).item.nominalTR,4);
 const selected=choose(row,{airflow:true});assert.equal(selected.item.model,'FDMRN60AVKU - RR60AYKU');assert.equal(selected.qty,1);assert.equal(selected.item.airflow,826);
});
test('optional sensible and airflow checks independently select their index and MAX chooses the controlling model',()=>{
 const row={Type:'Ducted',TKw:5,SKw:9,'L/S':800};assert.equal(choose(row).index,2);assert.equal(choose(row,{sensible:true}).index,5);assert.equal(choose(row,{airflow:true}).index,6);assert.equal(choose(row,{sensible:true,airflow:true}).index,6);
});
test('family ranges, thresholds and duplicate indices match DX-Data without mixing inverter and non-inverter models',()=>{
 assert.equal(choose({Type:'Ducted',TKw:4.24}).index,1);assert.equal(choose({Type:'Ducted',TKw:4.25}).index,2);
 assert.equal(choose({Type:'Ducted-Inv',TKw:4.28}).index,9);assert.equal(choose({Type:'Wall Mounted',TKw:3.45}).index,16);assert.equal(choose({Type:'Packaged',TKw:17.81}).index,21);
 assert.equal(choose({Type:'Ducted-Inv',TKw:1,'L/S':568},{airflow:true}).index,12);
 assert.equal(choose({Type:'Ducted',TKw:13.51}).model,'CHOOSE MANUALLY');assert.equal(choose({Type:'FCU',TKw:5}),null);assert.equal(choose({Type:'Ducted',TKw:'',SKw:9},{sensible:true}),null);
});
test('variation follows threshold / (1 - percentage) rather than changing equipment quantities',()=>{
 const row={Type:'Ducted',TKw:10};assert.equal(choose(row).index,5);const selected=choose(row,{totalVariation:30});assert.equal(selected.index,4);assert.equal(selected.qty,1);
});
test('all automatic technical values come from the selected Data row',()=>{
 ctx.state.dx.match={airflow:true};const row={Type:'DUCTED',TKw:10,SKw:9,'L/S':800};ctx.applyDxProposal(row);assert.equal(row['NOMINAL TR'],5);assert.equal(row.TC,13.5);assert.equal(row.SC,12.28);assert.equal(row['Actual Power Input'],5.34);assert.equal(row.Qty,1);
});
