const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const catalog = JSON.parse(fs.readFileSync(path.join(__dirname,'../public/vrv-manual-catalog.json'),'utf8'));
const source = fs.readFileSync(path.join(__dirname,'../public/vrv-manual-engine.js'),'utf8');
const context = {window:{},fetch:async()=>({ok:true,json:async()=>catalog})};
vm.runInNewContext(source,context);
const engine = context.window.VrvManual;
const settings = {matchSC:true,matchAirflow:true,targetCR:120,maxCR:130,maxModules:3,maxHP:48};
const manual = rows => ({indoor:rows,systems:[],outdoor:[],refnets:[],settings:{...settings}});
const row = (name,system,tc,sc,airflow,type='Ducted',origin='Czech Republic') => ({name,system,tc,sc,airflow,type,origin});

test('catalog contains workbook equipment, combinations and REFNET families',()=>{
  assert.equal(catalog.indoor.length,52);
  assert.equal(catalog.outdoor.length,11);
  assert.equal(catalog.combos.length,138);
  assert.deepEqual(Object.keys(catalog.refnet).sort(),['RXQ','RXYTQ']);
});

test('indoor matching respects TC, SC, airflow, type and origin',async()=>{
  await engine.load();
  const m=manual([row('A','VRV-01',6,5.5,310)]);
  engine.calculate(m);
  assert.equal(m.indoor[0].selection.model,'FXSQ80A');
  assert.equal(m.indoor[0].selection.index,80);
  m.settings.matchSC=false;m.settings.matchAirflow=false;
  engine.calculate(m);
  assert.equal(m.indoor[0].selection.model,'FXSQ63A');
  m.settings.matchSC=true;m.settings.matchAirflow=true;m.indoor[0].sc='';m.indoor[0].airflow='';
  engine.calculate(m);
  assert.equal(m.indoor[0].selection.model,'FXSQ63A');
  m.indoor[0].tc=999;
  engine.calculate(m);
  assert.equal(m.indoor[0].selection.status,'No Matching Model');
  assert.equal(m.outdoor[0].status,'Incomplete indoor selection');
});

test('Apply sets the default type and origin on every indoor row',()=>{
  const data={selectionMode:'manual',manual:{defaults:{type:'Cassette',origin:'Thailand'},indoor:[{type:'Ducted',origin:'India'},{type:'Decorative',origin:'Czech Republic'}],dismissedSources:[],collapsedSystems:[]}};
  const button={};let recalculated=0,rendered=0;
  const ctx={window:{VrvManual:{calculate:()=>{recalculated++;}}},vrvData:()=>data,canvas:{querySelectorAll:selector=>selector==='[data-manual-apply]'?[button]:[]},vrvDirty:()=>{},vrvManualRender:()=>{rendered++;}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/vrv-manual-ui.js'),'utf8'),ctx);
  ctx.vrvManualRender=()=>{rendered++;};
  ctx.vrvManualBind();button.onclick();
  assert.ok(data.manual.indoor.every(item=>item.type==='Cassette'&&item.origin==='Thailand'));
  assert.equal(recalculated,1);
  assert.equal(rendered,1);
});

test('outdoor table omits the checkbox and shows only populated module columns',()=>{
  const data={manual:{settings:{...settings},indoor:[],outdoor:[],refnets:[],systems:[],defaults:{type:'Any',origin:'Any'},dismissedSources:[]}};
  const ctx={vrvData:()=>data,window:{VrvManual:{catalog:{combos:[]}}},escapeHtml:value=>String(value??'')};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/vrv-manual-ui.js'),'utf8'),ctx);
  const empty=ctx.vrvManualOutdoor();
  assert.doesNotMatch(empty,/Add System|type="checkbox"|<th rowspan="2">#<\/th>/);
  assert.match(empty,/colspan="12"/);
  assert.match(empty,/<th rowspan="2">Indoor<br>Units<\/th>/);
  assert.match(empty,/<th>Combination<\/th><th>Module A<\/th>/);
  assert.doesNotMatch(empty,/<th>Module B<\/th>|<th>Module C<\/th>/);
  const one={system:'VRV-01',count:2,index:160,targetCR:120,requiredIndex:133,series:'RXYTQ',recommendedSeries:'RXYTQ',seriesPreference:'Auto',selectionMode:'Automatic',validationStatus:'Auto Selected',status:'Auto Selected',combo:{a:'RXYTQ8U5YF',b:'',c:'',hp:8}};
  data.manual.outdoor=[one];
  const oneHtml=ctx.vrvManualOutdoor();
  assert.doesNotMatch(oneHtml,/<th>Module B<\/th>|<th>Module C<\/th>/);
  assert.match(oneHtml,/class="vrv-manual-series-select is-auto"/);
  assert.match(oneHtml,/<option value="RXQ"[^>]*>RXQ<\/option><option value="RXYTQ"[^>]*>RXYTQ<\/option>/);
  assert.doesNotMatch(oneHtml,/<option value="Auto"|Override:|recommended RXYTQ/);
  one.series='RXQ';one.seriesPreference='RXQ';one.seriesOverride=true;
  assert.match(ctx.vrvManualOutdoor(),/class="vrv-manual-series-select is-override"/);
  one.series='RXYTQ';one.seriesPreference='Auto';one.seriesOverride=false;
  one.combo.b='RXYTQ8U5YF';
  const two=ctx.vrvManualOutdoor();
  assert.match(two,/<th>Module B<\/th>/);
  assert.doesNotMatch(two,/<th>Module C<\/th>/);
  one.combo.c='RXYTQ8U5YF';
  assert.match(ctx.vrvManualOutdoor(),/<th>Module C<\/th>/);
});

test('choosing the recommended outdoor series restores automatic series mode',async()=>{
  await engine.load();
  const m=manual([row('A','VRV-01',6,5,300,'Ducted','India')]);
  engine.calculate(m);
  const input={dataset:{manualSystem:'VRV-01',manualSystemField:'series'},value:'RXYTQ'};
  const ctx={vrvData:()=>({manual:m}),window:{VrvManual:engine},canvas:{querySelectorAll:selector=>selector==='[data-manual-system-field]'?[input]:[]},vrvDirty:()=>{},vrvManualRender:()=>{}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/vrv-manual-ui.js'),'utf8'),ctx);
  ctx.vrvManualRender=()=>{};
  ctx.vrvManualBind();input.onchange();
  assert.equal(m.outdoor[0].seriesPreference,'RXYTQ');
  assert.equal(m.outdoor[0].validationStatus,'Review Required');
  input.value='RXQ';input.onchange();
  assert.equal(m.outdoor[0].seriesPreference,'Auto');
  assert.equal(m.outdoor[0].validationStatus,'Auto Selected');
});

test('REFNET rows and subtotal align to eight proportional columns',()=>{
  const data={manual:{outdoor:[{system:'VRV-01',series:'RXQ',validationStatus:'Auto Selected',combo:{hp:14}}],refnets:[{system:'VRV-01',model:'KHRQ22M20T',description:'First branch',qty:2}],collapsedSystems:[],dismissedSources:[]}};
  const ctx={vrvData:()=>data,escapeHtml:value=>String(value??'')};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/vrv-manual-ui.js'),'utf8'),ctx);
  const html=ctx.vrvManualRefnet();
  assert.equal((html.match(/<col style="width:\d+%">/g)||[]).length,8);
  assert.match(html,/<tr class="vrv-refnet-material"><td colspan="5"><\/td><td><span class="vrv-refnet-model">KHRQ22M20T<\/span><\/td><td>First branch<\/td><td>2<\/td><\/tr>/);
  assert.match(html,/<tr class="vrv-refnet-subtotal"><td colspan="7">Total — VRV-01<\/td><td>2<\/td><\/tr>/);
  assert.match(html,/Overall REFNET Summary/);
});

test('system grouping selects catalog outdoor modules and counts N−1 REFNET joints',async()=>{
  await engine.load();
  const m=manual([row('A','VRV-01',7,5.5,310),row('B','VRV-01',7,5.5,310),row('C','VRV-01',7,5.5,310)]);
  engine.calculate(m);
  assert.equal(m.outdoor.length,1);
  assert.equal(m.outdoor[0].index,240);
  assert.equal(m.outdoor[0].requiredIndex,200);
  assert.equal(m.outdoor[0].combo.a,'RXYTQ8U5YF');
  assert.equal(m.outdoor[0].achievedCR,120);
  assert.equal(m.refnets.reduce((sum,line)=>sum+line.qty,0),2);
  assert.ok(m.refnets.some(line=>line.model==='KHRQ22M29T9'));
  assert.ok(m.refnets.some(line=>line.model==='KHRQ22M20T'));
});

test('all India indoor selection uses RXQ and user limits can produce no match',async()=>{
  await engine.load();
  const m=manual([row('A','VRV-02',6,5,300,'Ducted','India'),row('B','VRV-02',6,5,300,'Ducted','India')]);
  engine.calculate(m);
  assert.equal(m.indoor[0].selection.model,'FXMQ63PBV1');
  assert.equal(m.outdoor[0].series,'RXQ');
  assert.equal(m.outdoor[0].combo.a,'RXQ6ARYFK');
  assert.equal(m.refnets[0].model,'KHRP26A33T');
  m.settings.maxHP=5;
  engine.calculate(m);
  assert.equal(m.outdoor[0].status,'No Match — system capacity limit');
  assert.equal(m.refnets.length,0);
});

test('hundreds of indoor rows and systems are grouped without spreadsheet row limits',async()=>{
  await engine.load();
  const rows=Array.from({length:200},(_,index)=>row(`IDU-${index}`,`VRV-${String(index+1).padStart(3,'0')}`,2,1.5,150));
  const m=manual(rows);
  engine.calculate(m);
  assert.equal(m.indoor.length,200);
  assert.equal(m.outdoor.length,200);
  assert.ok(m.outdoor.every(system=>system.combo));
});

test('Step 1 prefill preserves manual values and does not duplicate on revisit',async()=>{
  await engine.load();
  const data={selectionMode:'manual'};
  const state={tables:{thermal:{rows:[{'Indoor':'FCU-01','Room':'Living Room','Tot Cool Cap':6,'Sens Cool Cap':5.5,'Air Flow Rate':310}]}}};
  const ctx={window:context.window,state,vrvData:()=>data,crypto:{randomUUID:()=>`id-${data.manual?.indoor?.length||0}`},firstRowValue:(source,keys)=>keys.map(key=>source[key]).find(value=>value!==undefined&&value!==null&&value!=='')??'',escapeHtml:value=>String(value??''),vrvIcon:()=>''};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/vrv-manual-ui.js'),'utf8'),ctx);
  ctx.vrvManualPrefill();
  assert.equal(data.manual.indoor.length,1);
  assert.equal(data.manual.indoor[0].name,'FCU-01');
  assert.equal(data.manual.indoor[0].location,'Living Room');
  assert.equal(data.manual.indoor[0].tc,6);
  data.manual.indoor[0].location='Staff edit';data.manual.indoor[0].edited=['location'];
  state.tables.thermal.rows[0]['Tot Cool Cap']=7;
  state.tables.thermal.rows[0].Room='Updated source room';
  ctx.vrvManualPrefill();
  assert.equal(data.manual.indoor.length,1);
  assert.equal(data.manual.indoor[0].location,'Staff edit');
  assert.equal(data.manual.indoor[0].tc,7);
  data.manual.dismissedSources.push(data.manual.indoor[0].sourceKey);data.manual.indoor=[];
  ctx.vrvManualPrefill();
  assert.equal(data.manual.indoor.length,0);
  const html=ctx.vrvManualStep();
  assert.match(html,/Indoor Selection.*Outdoor Selection.*REFNET Material Breakdown/s);
  assert.match(html,/REFNET Material Breakdown.*BOQ \/ Materials/s);
  assert.match(html,/Rq TC<br>\(kW\).*Rq SC<br>\(kW\).*Rq Airflow<br>\(L\/s\)/s);
  assert.match(html,/data-manual-id="starter-4"/);
  assert.equal(data.manual.indoor.length,0);
  const starter={dataset:{manualId:'starter-0',manualField:'name'},value:'Office'};
  ctx.canvas={querySelectorAll:selector=>selector==='[data-manual-field]'?[starter]:[]};
  ctx.vrvDirty=()=>{};
  ctx.vrvManualRender=()=>{};
  ctx.vrvManualBind();
  starter.onchange();
  assert.equal(data.manual.indoor.length,1);
  assert.equal(data.manual.indoor[0].name,'Office');
  assert.doesNotMatch(html,/Import Excel|Export Excel/);
});

test('manual selection supplies existing schedule and BOQ builders with selected catalog models',async()=>{
  await engine.load();
  const data={selectionMode:'manual',manual:manual([row('IDU-01','VRV-01',7,5.5,310),row('IDU-02','VRV-01',7,5.5,310)])};
  const state={lookup:{original:true},tables:{thermal:{rows:[]},vrvSchedule:{rows:[]},costing:{rows:[]}}};
  let scheduleSource,materials,repriced=false,saved=false;
  const ctx={window:context.window,state,vrvData:()=>data,firstRowValue:()=>'',buildVrvSchedule:rows=>{scheduleSource=rows;state.tables.vrvSchedule.rows=rows.map(item=>({System:item.system,Name:item.name,'Outdoor Name':item.outdoorRefs?.[0]?.outdoorName||'', 'Outdoor Model':item.outdoorRefs?.[0]?.outdoorModel||''}));},ensureWorkflowCostingPriceList:async()=>{},buildCosting:rows=>{materials=rows;state.tables.costing.rows=rows.map(([Model,Qty])=>({Model,Qty,'Final Price (AED)':''}));},vrvReprice:()=>{repriced=true;},vrvDirty:()=>{saved=true;}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/vrv-manual-ui.js'),'utf8'),ctx);
  await ctx.vrvManualGenerate();
  assert.equal(scheduleSource.length,2);
  assert.equal(scheduleSource[0].fcu,'FXSQ80A');
  assert.equal(scheduleSource[0].airFlowRate,383.33);
  assert.equal(state.tables.vrvSchedule.rows[0].CC,17.7);
  assert.equal(state.lookup.original,true);
  const quantity=new Map(materials);
  assert.equal(quantity.get('FXSQ80A'),2);
  assert.equal(quantity.get('RXYTQ8U5YF'),1);
  assert.equal(quantity.get('KHRQ22M29T9'),1);
  assert.equal(quantity.get('BRC1H82W'),2);
  assert.equal(materials.at(-1)[0],'BRC1H82W');
  assert.ok(repriced&&saved);
  const chosen=engine.eligibleCombos(data.manual.outdoor[0],data.manual.settings).find(combo=>combo.a==='RXYTQ8U5YF'&&combo.b==='RXYTQ8U5YF'&&!combo.c);
  data.manual.outdoor[0].overrideKey=chosen.id;data.manual.outdoor[0].selectionMode='Manual Override';
  await ctx.vrvManualGenerate();
  assert.equal(scheduleSource[0].outdoorRefs[0].outdoorComponents.length,2);
  assert.equal(new Map(materials).get('RXYTQ8U5YF'),2);
  assert.equal(data.manual.outdoor[0].validationStatus,'Manual Override');
});

test('Manual BOQ groups selected modules and REFNET kits using Step 04 material quantities',()=>{
  const data={selectionMode:'manual',step:2,manual:{
    tab:'boq',indoor:[
      {system:'VRV-01',name:'FCU-01',selection:{status:'Selected',model:'FXSQ80A',type:'Ducted'}},
      {system:'VRV-02',name:'FCU-02',selection:{status:'Selected',model:'FXSQ80A',type:'Ducted'}},
      {system:'',name:'FCU-03',selection:{status:'Selected',model:'FXSQ63A',type:'Ducted'}}
    ],
    outdoor:[
      {system:'VRV-01',series:'RXYTQ',validationStatus:'Auto Selected',combo:{a:'RXYTQ8U5YF',b:'RXYTQ8U5YF',c:''}},
      {system:'VRV-02',series:'RXYTQ',validationStatus:'Auto Selected',combo:{a:'RXYTQ8U5YF',b:'RXYTQ10U5YF',c:''}},
      {system:'VRV-03',series:'RXYTQ',status:'Incomplete indoor selection'}
    ],
    refnets:[
      {system:'VRV-01',model:'KHRQ22M20T',qty:2,description:'First branch'},
      {system:'VRV-02',model:'KHRQ22M20T',qty:3,description:'First branch'},
      {system:'VRV-03',model:'KHRQ22M64T',qty:1,description:'Excluded'}
    ],dismissedSources:[],collapsedSystems:[]
  }};
  const ctx={vrvData:()=>data,window:{},escapeHtml:value=>String(value??''),workflowCostingPriceItems:()=>[{model:'FXSQ80A',description:'Catalog indoor description'}]};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/vrv-manual-ui.js'),'utf8'),ctx);
  const {items,warnings}=ctx.vrvManualMaterials(data.manual);
  assert.deepEqual(Array.from(items,item=>[item.model,item.qty]),[
    ['FXSQ80A',2],['RXYTQ8U5YF',3],['RXYTQ10U5YF',1],['KHRQ22M20T',5],['BRC1H82W',2]
  ]);
  assert.deepEqual(Array.from(warnings),['Indoor Selection','Outdoor Selection','REFNET Material Breakdown']);
  const html=ctx.vrvManualBoq();
  assert.match(html,/<th>Model<\/th><th>Qty<\/th><th>Description<\/th>/);
  assert.match(html,/Catalog indoor description/);
  assert.match(html,/<td>BRC1H82W<\/td><td>2<\/td><td>Remote controller \(white\)<\/td>/);
  assert.ok(html.lastIndexOf('BRC1H82W')>html.lastIndexOf('KHRQ22M20T'));
  assert.match(html,/Quantities shown include completed selections only/);
  assert.doesNotMatch(html,/FXSQ63A|KHRQ22M64T|Download Excel/);
  assert.equal(ctx.vrvManualMaterials(data.manual).items.filter(item=>item.model==='BRC1H82W').length,1);
  data.manual.indoor[0].selection.status='No Matching Model';
  const updated=ctx.vrvManualMaterials(data.manual);
  assert.equal(updated.items.at(-1).qty,1);
  assert.equal(updated.items.filter(item=>item.model==='BRC1H82W').length,1);
  data.manual.indoor[1].selection.status='No Matching Model';
  assert.equal(ctx.vrvManualMaterials(data.manual).items.at(-1).qty,0);
});

test('outdoor auto ranking follows workbook sort key and system origins',async()=>{
  await engine.load();
  const target=116,indoorIndex=369;
  const options=engine.eligibleCombos({series:'RXYTQ',index:indoorIndex,requiredIndex:Math.round(indoorIndex/(target/100)*1e6)/1e6},settings);
  assert.equal(options[0].a,'RXYTQ14U5YF');
  assert.equal(options[0].hp,14);
  assert.equal(options[0].sortKey,3501);
  assert.equal((indoorIndex/options[0].index*100).toFixed(1),'105.4');
  const india=manual([row('India-01','VRV-01',6,5,300,'Ducted','India'),row('India-02','VRV-01',6,5,300,'Ducted','India')]);
  engine.calculate(india);
  assert.equal(india.outdoor[0].recommendedSeries,'RXQ');
  assert.equal(india.outdoor[0].validationStatus,'Auto Selected');
  india.indoor[1].origin='Czech Republic';engine.calculate(india);
  assert.equal(india.outdoor[0].recommendedSeries,'RXYTQ');
  assert.equal(india.outdoor[0].series,'RXYTQ');
  assert.equal(india.outdoor[0].validationStatus,'Review Required');
  const separate=manual([row('India','VRV-01',6,5,300,'Ducted','India'),row('Czech','VRV-02',6,5,300,'Ducted','Czech Republic')]);
  engine.calculate(separate);
  assert.equal(separate.outdoor.find(item=>item.system==='VRV-01').recommendedSeries,'RXQ');
  assert.equal(separate.outdoor.find(item=>item.system==='VRV-02').recommendedSeries,'RXYTQ');
});

test('outdoor combination dropdown hides achieved CR below 95 percent',async()=>{
  await engine.load();
  const ctx={window:{VrvManual:engine}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/vrv-manual-ui.js'),'utf8'),ctx);
  const system={series:'RXYTQ',index:190,requiredIndex:100};
  const catalogChoices=engine.eligibleCombos(system,settings);
  assert.ok(catalogChoices.some(combo=>system.index/combo.index*100<95));
  const shown=ctx.vrvManualComboChoices(system,settings);
  assert.ok(shown.some(combo=>combo.index===200));
  assert.ok(shown.every(combo=>system.index/combo.index*100>=95));
  system.index=189.9;
  assert.ok(!ctx.vrvManualComboChoices(system,settings).some(combo=>combo.index===200));
});

test('combination popup opens directly above its button using the rendered height',()=>{
  const ctx={window:{}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/vrv-manual-ui.js'),'utf8'),ctx);
  const above=ctx.vrvManualComboPlacement({left:630,top:550,bottom:590},470,190,1570);
  assert.equal(above.top,354);
  assert.equal(above.left,630);
  const constrained=ctx.vrvManualComboPlacement({left:1400,top:200,bottom:240},470,182,1570);
  assert.equal(constrained.top,12);
  assert.equal(constrained.left,1088);
});

test('structured two and three module overrides retain physical modules and BOQ quantities',async()=>{
  await engine.load();
  const m=manual([row('A','VRV-01',7,5.5,310),row('B','VRV-01',7,5.5,310),row('C','VRV-01',7,5.5,310)]);
  engine.calculate(m);
  assert.equal(m.outdoor[0].validationStatus,'Auto Selected');
  const recommended=m.outdoor[0].recommendedComboId;
  const autoRefnet=m.refnets.find(item=>item.description?.includes('First branch'))?.model;
  const two=engine.eligibleCombos(m.outdoor[0],m.settings).find(combo=>combo.a==='RXYTQ8U5YF'&&combo.b==='RXYTQ8U5YF'&&!combo.c);
  assert.ok(two);
  m.outdoor[0].overrideKey=two.id;m.outdoor[0].selectionMode='Manual Override';engine.calculate(m);
  assert.equal(m.outdoor[0].combo.a,'RXYTQ8U5YF');
  assert.equal(m.outdoor[0].combo.b,'RXYTQ8U5YF');
  assert.equal(m.outdoor[0].combo.c,'');
  assert.equal(m.outdoor[0].combo.hp,16);
  assert.equal(m.outdoor[0].achievedCR,60);
  assert.equal(m.outdoor[0].validationStatus,'Manual Override');
  const htmlContext={vrvData:()=>({manual:m}),window:{VrvManual:engine},escapeHtml:value=>String(value??'')};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/vrv-manual-ui.js'),'utf8'),htmlContext);
  const outdoorHtml=htmlContext.vrvManualOutdoor();
  assert.match(outdoorHtml,/data-manual-combo-open="VRV-01"/);
  assert.match(outdoorHtml,/data-manual-combo-reset="VRV-01"/);
  assert.match(outdoorHtml,/<td class="vrv-manual-module">RXYTQ8U5YF<\/td><td class="vrv-manual-module">RXYTQ8U5YF<\/td>/);
  assert.doesNotMatch(outdoorHtml,/<th>Module C<\/th>/);
  assert.doesNotMatch(outdoorHtml,/<td class="vrv-manual-module">[^<]*\+/);
  const ctx={vrvData:()=>({manual:m}),window:{}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/vrv-manual-ui.js'),'utf8'),ctx);
  assert.equal(ctx.vrvManualMaterials(m).items.find(item=>item.model==='RXYTQ8U5YF').qty,2);
  const three=engine.eligibleCombos(m.outdoor[0],m.settings).find(combo=>combo.a==='RXYTQ8U5YF'&&combo.b==='RXYTQ8U5YF'&&combo.c==='RXYTQ8U5YF');
  assert.ok(three);
  m.outdoor[0].overrideKey=three.id;engine.calculate(m);
  assert.deepEqual([m.outdoor[0].combo.a,m.outdoor[0].combo.b,m.outdoor[0].combo.c],['RXYTQ8U5YF','RXYTQ8U5YF','RXYTQ8U5YF']);
  assert.equal(m.outdoor[0].combo.hp,24);
  assert.equal(ctx.vrvManualMaterials(m).items.find(item=>item.model==='RXYTQ8U5YF').qty,3);
  assert.notEqual(m.refnets.find(item=>item.description?.includes('First branch'))?.model,autoRefnet);
  const reopened=JSON.parse(JSON.stringify(m));engine.calculate(reopened);
  assert.equal(reopened.outdoor[0].selectedComboId,three.id);
  assert.equal(reopened.outdoor[0].validationStatus,'Manual Override');
  reopened.outdoor[0].overrideKey='';reopened.outdoor[0].selectedComboId='';reopened.outdoor[0].selectionMode='Automatic';engine.calculate(reopened);
  assert.equal(reopened.outdoor[0].selectedComboId,recommended);
  assert.equal(reopened.outdoor[0].validationStatus,'Auto Selected');
});

test('series overrides and changed loads retain invalid manual choices for review',async()=>{
  await engine.load();
  const m=manual([row('A','VRV-01',6,5,300,'Ducted','India'),row('B','VRV-01',6,5,300,'Ducted','India')]);
  engine.calculate(m);
  assert.equal(m.outdoor[0].series,'RXQ');
  m.outdoor[0].seriesPreference='RXYTQ';engine.calculate(m);
  assert.equal(m.outdoor[0].recommendedSeries,'RXQ');
  assert.equal(m.outdoor[0].series,'RXYTQ');
  assert.equal(m.outdoor[0].validationStatus,'Review Required');
  const chosen=m.outdoor[0].selectedComboId;
  m.outdoor[0].overrideKey=chosen;m.outdoor[0].selectionMode='Manual Override';
  m.indoor[0].tc=20;engine.calculate(m);
  assert.equal(m.outdoor[0].selectedComboId,chosen);
  assert.equal(m.outdoor[0].validationStatus,'Invalid');
  assert.match(m.outdoor[0].status,/outdoor index below target/);
  assert.equal(m.refnets.length,0);
  m.outdoor[0].overrideKey='';m.outdoor[0].selectedComboId='';m.outdoor[0].selectionMode='Automatic';m.outdoor[0].seriesPreference='Auto';engine.calculate(m);
  assert.equal(m.outdoor[0].recommendedSeries,'RXQ');
  assert.equal(m.outdoor[0].validationStatus,'Auto Selected');
});

test('distinct RXQ modules stay separate in the schedule and consolidated BOQ',async()=>{
  await engine.load();
  const m=manual([row('A','VRV-01',6,5,300,'Ducted','India'),row('B','VRV-01',6,5,300,'Ducted','India')]);
  engine.calculate(m);
  const combo=engine.eligibleCombos(m.outdoor[0],m.settings).find(item=>item.a==='RXQ6ARYFK'&&item.b==='RXQ8ARYFK'&&!item.c);
  assert.ok(combo);
  m.outdoor[0].overrideKey=combo.id;m.outdoor[0].selectionMode='Manual Override';engine.calculate(m);
  assert.equal(m.outdoor[0].combo.a,'RXQ6ARYFK');
  assert.equal(m.outdoor[0].combo.b,'RXQ8ARYFK');
  assert.equal(m.outdoor[0].combo.c,'');
  assert.equal(m.outdoor[0].totalHP,14);
  const ctx={vrvData:()=>({manual:m}),window:{}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/vrv-manual-ui.js'),'utf8'),ctx);
  const rows=ctx.vrvManualMaterials(m).items;
  assert.equal(rows.find(item=>item.model==='RXQ6ARYFK').qty,1);
  assert.equal(rows.find(item=>item.model==='RXQ8ARYFK').qty,1);
  assert.ok(!rows.some(item=>item.model==='RXQ6ARYFK + RXQ8ARYFK'));
});

test('Reset to Auto clears saved combination and series overrides',async()=>{
  await engine.load();
  const m=manual([row('A','VRV-01',6,5,300,'Ducted','India')]);
  engine.calculate(m);
  const autoId=m.outdoor[0].selectedComboId;
  m.outdoor[0].seriesPreference='RXYTQ';
  engine.calculate(m);
  m.outdoor[0].overrideKey=m.outdoor[0].selectedComboId;
  m.outdoor[0].selectionMode='Manual Override';
  engine.calculate(m);
  const button={dataset:{manualComboReset:'VRV-01'}};
  const ctx={vrvData:()=>({manual:m}),window:{VrvManual:engine},canvas:{querySelectorAll:selector=>selector==='[data-manual-combo-reset]'?[button]:[]},vrvDirty:()=>{},vrvManualRender:()=>{}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/vrv-manual-ui.js'),'utf8'),ctx);
  ctx.vrvManualRender=()=>{};
  ctx.vrvManualBind();button.onclick();
  assert.equal(m.outdoor[0].overrideKey,'');
  assert.equal(m.outdoor[0].seriesPreference,'Auto');
  assert.equal(m.outdoor[0].selectedComboId,autoId);
  assert.equal(m.outdoor[0].validationStatus,'Auto Selected');
});
