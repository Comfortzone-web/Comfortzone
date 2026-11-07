const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../public/dx-workflow.js'),'utf8');
const app=fs.readFileSync(path.join(__dirname,'../public/app.js'),'utf8');
function extract(name){let start=source.indexOf('function '+name+'(');if(source.slice(start-6,start)==='async ')start-=6;return source.slice(start,source.indexOf('\n}',start)+2);}
test('DX step navigation renders without waiting for a slow or failed save',async()=>{
 let rejectSave;const saving=new Promise((_,reject)=>{rejectSave=reject;});const renders=[],errors=[];
 const ctx={state:{dx:{step:1},tables:{vrvSchedule:{rows:[{}]}}},dxBusy:false,dxQuotationOpening:false,
  dxData:()=>ctx.state.dx,dxEnsureManualRows:()=>{},renderDxWorkspace:()=>renders.push(ctx.state.dx.step),dxSave:()=>saving,toast:error=>errors.push(error)};
 vm.createContext(ctx);vm.runInContext(extract('dxSaveInBackground')+'\n'+extract('dxAction'),ctx);
 await ctx.dxAction('continue');assert.deepEqual(renders,[2]);
 await ctx.dxAction('back');assert.deepEqual(renders,[2,1]);
 rejectSave(new Error('offline'));await new Promise(resolve=>setImmediate(resolve));assert.equal(errors.length,2);
 assert.equal(ctx.state.dx.step,1,'a failed save does not roll back navigation');
});
test('a fresh DX workspace is editable before server metadata arrives and hydration preserves input and ID',async()=>{
 let resolveMetadata;const metadata=new Promise(resolve=>{resolveMetadata=resolve;});let renders=0;
 const input={value:'Assigning…'};
 const ctx={state:null,dxLastProject:null,projectPersisted:false,projectTouched:false,currentUser:{name:'User'},
  costingId:()=> 'local-workflow',dxExportColumns:['Unit Ref','Type','Location','TKw','SKw','L/S'],dxScheduleColumns:['Ref'],
  configureDxWorkflow:()=>{},history:{replaceState:()=>{}},location:{pathname:'/'},showCanvas:()=>{},renderDxWorkspace:()=>{renders++;},
  api:()=>metadata,loadSalesCrm:()=>Promise.resolve(),canvas:{querySelector:selector=>selector==='[data-dx-number]'?input:null},
  workflowDatalist:()=>{},workflowCustomerNames:()=>[],updateWorkflowProjectList:()=>{},document:{activeElement:null},activeView:'canvas',toast:()=>{}};
 vm.createContext(ctx);vm.runInContext(extract('dxOpenFreshWorkflow'),ctx);ctx.dxOpenFreshWorkflow();
 assert.equal(renders,1);assert.equal(ctx.state.id,'local-workflow');
 ctx.state.details.project='Typed before load';ctx.state.dx.step=2;ctx.state.tables.thermal.rows.push({TKw:10});
 resolveMetadata({id:'server-template-id',lookup:{indoorData:[]},priceList:{items:[]},selectionNumber:'DX-2026-010'});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(ctx.state.id,'local-workflow');assert.equal(ctx.state.details.project,'Typed before load');assert.equal(ctx.state.dx.step,2);
 assert.equal(ctx.state.tables.thermal.rows[0].TKw,10);assert.equal(input.value,'DX-2026-010');assert.equal(renders,1,'metadata does not replace the editable DOM');
});
test('an older VRV draft response cannot overwrite a newer DX opening',async()=>{
 let resolveDraft;const draft=new Promise(resolve=>{resolveDraft=resolve;});
 const ctx={state:null,workflowOpenSequence:0,workflowDraftPromise:null,canAccessModule:()=>true,
  showCanvas:()=>{},canvas:{innerHTML:''},api:()=>draft,workflowMode:p=>p?.workflowMode,
  dxOpenFreshWorkflow:()=>{ctx.state={id:'new-dx',workflowMode:'dx'};}};
 vm.createContext(ctx);
 const start=app.indexOf('async function createProject('),end=app.indexOf('\n}',start)+2;
 vm.runInContext(app.slice(start,end),ctx);
 const opening=ctx.createProject({workflowMode:'vrv',fresh:true});
 await ctx.createProject({workflowMode:'dx',fresh:true});
 resolveDraft({id:'stale-vrv',workflowMode:'vrv'});await opening;
 assert.equal(ctx.state.id,'new-dx');
});
