const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs');const os=require('os');const path=require('path');
const {createOol:createLedger,balances,cents}=require('../ool');
const createOol=ctx=>createLedger({...ctx,openingLines:require('./fixtures/ool-opening')});
test('Daikin supplier recognition supports Air Conditioning spelling without matching other suppliers',()=>{const {isDaikinSupplier}=require('../ool');for(const name of ['DAIKIN AIR CONDITIONING LLC','Daikin Airconditioning LLC',' Daikin  Air Conditioning L.L.C. '])assert.ok(isDaikinSupplier(name));for(const name of ['Other Supplier LLC','Daikin Air Conditioning Services LLC',''])assert.equal(isDaikinSupplier(name),false);});
test('Supplier DN matching references come only from nondeleted, noncancelled request materials',()=>{
 const {requestMatchReferences}=require('../ool');
 const line={model:'M1',sd:'SD1',sor:'5S1',qty:3,cancelled:1,confirmed:2};
 assert.deepEqual(requestMatchReferences({requests:[{lines:[line,{...line}]},{deletedAt:'now',lines:[{...line,model:'Deleted'}]},{lines:[{...line,model:'Cancelled',cancelled:3},{...line,model:'No SD',sd:''}]}]}),[{model:'M1',sd:'SD1',sor:'5S1',poNo:''}]);
});
test('delivery contact options exclude missing numbers and inactive users, returning only safe fields',()=>{
 const contacts=require('../ool').deliveryContacts([{id:'a',name:'Abhishek',contact:'052 405 8468',passwordHash:'private'},{id:'b',name:'No number',contact:'  '},{id:'c',name:'Inactive',contact:'050 123 4567',active:false},{id:'d',name:'',contact:'050 123 4567'}]);
 assert.deepEqual(contacts,[{id:'a',name:'Abhishek',contact:'052 405 8468'}]);
});
const admin={id:'admin',name:'Admin',role:'Admin'},staff={id:'staff',name:'Staff',role:'Staff'};
test('automatic Supplier DN allocation caps at OOL balance, is idempotent and leaves ambiguous matches for review',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ool-auto-'));
 const ledger=createOol({dataDir:dir,readPO:async()=>({orders:[]})});await ledger.ready;
 try{
  const first=(await ledger.read()).lines[0];
  await ledger.transaction(admin,'fixture',s=>{s.requests.push({id:'req',lines:[{id:'rl',lineId:first.id,model:first.model,sd:first.sd,sor:first.sor,qty:1,confirmed:0,cancelled:0}],history:[]});});
  const dn={id:'dn',status:'Review Needed',supplierDnNo:'DN',lines:[{modelNo:first.model,sdDocument:first.sd,finalQty:2}]};
  assert.equal((await ledger.autoAllocateSupplierDn(dn,admin)).allocatedQty,0);
  dn.status='Confirmed';assert.equal((await ledger.autoAllocateSupplierDn(dn,admin)).allocatedQty,1);
  let s=balances(await ledger.read());assert.equal(s.lines[0].received,1);assert.equal(s.lines[0].remaining,0);assert.equal(s.requests[0].lines[0].confirmed,1);
  assert.equal((await ledger.autoAllocateSupplierDn(dn,admin)).allocatedQty,0);assert.equal((await ledger.read()).receipts.length,1);
  await ledger.transaction(admin,'ambiguous fixture',s=>{for(const id of ['a','b']){s.lines.push({...first,id,model:'AMB',sd:'SD-AMB',confirmedQty:2,orderQty:2});s.requests.push({id:'req-'+id,lines:[{id:'rl-'+id,lineId:id,model:'AMB',sd:'SD-AMB',qty:1,confirmed:0,cancelled:0}],history:[]});}});
  const ambiguous=await ledger.autoAllocateSupplierDn({id:'amb',status:'Confirmed',lines:[{modelNo:'AMB',sdDocument:'SD-AMB',finalQty:1}]},admin);
  assert.equal(ambiguous.allocatedQty,0);assert.equal(ambiguous.reviewRequired,true);assert.equal((await ledger.read()).receipts.length,1);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('OOL opening balance, future PO cutoff, partial confirmation, requests, receipts, corrections and concurrency',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ool-test-'));let sources=[];
 const ledger=createOol({dataDir:dir,readPO:async()=>({orders:[{id:'old'}]}),receiptSources:async()=>sources,readJson:async r=>r.body,send:(res,status,data)=>{res.status=status;res.data=data;}});
 await ledger.ready;
 const route=async(action,body,user=admin)=>{const res={};await ledger.route({method:body?'POST':'GET',body},res,{pathname:'/api/ool/'+action},user);return res;};
 let s=(await route('')).data;assert.equal(s.lines.length,184);assert.equal(s.kpis.total,887);assert.equal(s.kpis.valueCents,298522418);
 const order={id:'new',status:'Created',supplierName:'Daikin Airconditioning LLC',poNo:'AMTS-NEW',items:[{id:'m',modelNo:'TEST-M',qty:10,unitPrice:12.34}]};
 await ledger.po({...order,id:'old'},null,admin);assert.equal((await ledger.read()).lines.length,184);
 await ledger.po(order,null,admin);s=(await route('')).data;const l=s.lines.find(x=>x.poId==='new');assert.equal(l.available,0);assert.equal(l.status,'Awaiting OC');
 let r=await route('oc',{revision:s.revision,date:'2026-11-20',sd:'123',sor:'5S123',lines:[{id:l.id,confirmedQty:6,price:'12.34'}]},staff);assert.equal(r.status,200);s=r.data;assert.equal(s.lines.find(x=>x.id===l.id).available,6);
 const request={token:'unique',revision:s.revision,lines:[{lineId:l.id,qty:4}]};
 const concurrent=await Promise.all([route('request',request),route('request',{...request,token:'other'})]);assert.deepEqual(concurrent.map(x=>x.status),[200,409]);s=concurrent[0].data;const req=s.requests[0];assert.equal(s.lines.find(x=>x.id===l.id).available,2);
 r=await route('confirmation',{revision:s.revision,id:req.id,date:'2026-11-20',lines:[{id:req.lines[0].id,confirmed:2}]});assert.equal(r.status,200);s=r.data;assert.equal(s.kpis.requested,2);assert.equal(s.kpis.confirmed,2);
 r=await route('followup',{revision:s.revision,id:req.id,email:{text:'follow up'}});s=r.data;assert.equal(s.lines.find(x=>x.id===l.id).available,2);assert.equal(s.requests.length,1);
 sources=[{id:'supplier:dn',label:'DN',lines:[{model:'TEST-M',sd:'123',qty:3}]}];
 r=await route('receipt',{revision:s.revision,sourceId:'supplier:dn',allocations:[{sourceIndex:0,lineId:l.id,qty:3}]});assert.equal(r.status,200);s=r.data;let line=s.lines.find(x=>x.id===l.id);assert.equal(line.received,3);assert.equal(line.remaining,3);assert.equal(line.available,2);assert.equal(line.requested,1);assert.equal(line.deliveryConfirmed,0);
 r=await route('cancel',{revision:s.revision,id:req.id});s=r.data;assert.equal(s.lines.find(x=>x.id===l.id).available,3);
 r=await route('receipt',{revision:s.revision,sourceId:'supplier:dn',allocations:[{sourceIndex:0,lineId:l.id,qty:3}]});assert.equal(r.status,409);
 r=await route('correction',{revision:s.revision,id:s.receipts[0].id,reason:'Wrong DN'},staff);assert.equal(r.status,409);
 r=await route('correction',{revision:s.revision,id:s.receipts[0].id,reason:'Wrong DN'},admin);assert.equal(r.status,200);assert.equal(r.data.lines.find(x=>x.id===l.id).remaining,6);
 assert.equal((await route('',null,{role:'MTS'})).status,403);
 assert.throws(()=>cents('-1'));assert.throws(()=>cents('2.345'));assert.equal(cents('0.01'),1);
 const reopen=createOol({dataDir:dir,readPO:async()=>({orders:[]})});await reopen.ready;assert.equal((await reopen.read()).lines.length,185);
 fs.rmSync(dir,{recursive:true,force:true});
});

test('request deletion releases only pending quantities and protects confirmations',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ool-delete-'));
 const ledger=createOol({dataDir:dir,readPO:async()=>({orders:[]}),receiptSources:async()=>[],readJson:async r=>r.body,send:(res,status,data)=>Object.assign(res,{status,data})});
 await ledger.ready;
 const run=async(action,body)=>{const res={};await ledger.route({method:'POST',body},res,{pathname:'/api/ool/'+action},staff);return res;};
 try{
  let s=balances(await ledger.read()),l=s.lines[2];const original=l.available;
  let result=await run('request',{revision:s.revision,token:'delete-pending',lines:[{lineId:l.id,qty:6}]});assert.equal(result.status,200);s=result.data;let r=s.requests[0];
  result=await run('confirmation',{revision:s.revision,id:r.id,date:'2026-11-23',lines:[{id:r.lines[0].id,confirmed:2}]});s=result.data;
  assert.equal((await run('delete-request',{revision:s.revision,id:r.id})).status,409);
  result=await run('delete-request-line',{revision:s.revision,id:r.id,lineId:r.lines[0].id});assert.equal(result.status,200);s=result.data;r=s.requests[0];
  assert.equal(r.lines[0].qty,6);assert.equal(r.lines[0].cancelled,4);assert.equal(r.lines[0].confirmed,2);assert.equal(s.lines.find(x=>x.id===l.id).available,original-2);assert.ok(!r.deletedAt);
  assert.equal((await run('delete-request-line',{revision:s.revision,id:r.id,lineId:r.lines[0].id})).status,409);
  result=await run('request',{revision:s.revision,token:'delete-entire',lines:[{lineId:l.id,qty:2}]});s=result.data;const unconfirmed=s.requests[0];
  result=await run('delete-request',{revision:s.revision,id:unconfirmed.id});assert.equal(result.status,200);s=result.data;assert.ok(s.requests[0].deletedAt);assert.equal(s.lines.find(x=>x.id===l.id).available,original-2);assert.equal(s.requests[0].lines[0].cancelled,2);
  assert.equal((await run('delete-request',{revision:s.revision,id:unconfirmed.id})).status,409);
  result=await run('request',{revision:s.revision,token:'delete-line',lines:[{lineId:l.id,qty:1}]});s=result.data;const last=s.requests[0];
  result=await run('delete-request-line',{revision:s.revision,id:last.id,lineId:last.lines[0].id});assert.equal(result.status,200);assert.ok(result.data.requests[0].deletedAt);assert.equal(result.data.lines.find(x=>x.id===l.id).available,original-2);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('source reconciliation preserves matching deliveries across row moves and releases only removed quantities',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ool-source-sync-'));
 const ledger=createOol({dataDir:dir,readPO:async()=>({orders:[]})});await ledger.ready;
 try{
  await ledger.transaction(admin,'source fixtures',s=>{for(const model of ['SYNC-A','SYNC-B'])s.lines.push({id:model,model,sd:'SYNC-SD',sor:'5S-SYNC',orderQty:10,confirmedQty:10,priceCents:100});});
  const dn={id:'source',status:'Confirmed',supplierDnNo:'DN-SYNC',uploadedDate:'2026-11-24',lines:[{modelNo:'SYNC-A',sdDocument:'SYNC-SD',finalQty:3},{modelNo:'SYNC-B',sdDocument:'SYNC-SD',finalQty:2}]};
  assert.equal((await ledger.autoAllocateSupplierDn(dn,admin)).allocatedQty,5);
  const original=(await ledger.read()).receipts.find(r=>r.sourceId==='supplier:source');
  dn.lines.reverse();await ledger.autoAllocateSupplierDn(dn,admin);
  let s=await ledger.read(),receipt=s.receipts.find(r=>r.id===original.id);assert.equal(receipt.date,original.date);assert.equal(receipt.allocations.find(a=>a.lineId==='SYNC-A').sourceIndex,1);
  dn.lines[1].finalQty=1;await ledger.autoAllocateSupplierDn(dn,admin);s=balances(await ledger.read());assert.equal(s.lines.find(l=>l.id==='SYNC-A').received,1);assert.equal(s.lines.find(l=>l.id==='SYNC-B').received,2);
  dn.lines[1].sdDocument='WRONG';await ledger.autoAllocateSupplierDn(dn,admin);s=balances(await ledger.read());assert.equal(s.lines.find(l=>l.id==='SYNC-A').received,0);assert.equal(s.lines.find(l=>l.id==='SYNC-A').available,10);assert.equal(s.lines.find(l=>l.id==='SYNC-B').received,2);
  dn.lines=[dn.lines[0]];await ledger.autoAllocateSupplierDn(dn,admin);assert.equal((await ledger.read()).receipts[0].allocations.length,1);
  await ledger.removeSources(['supplier:source'],admin);s=balances(await ledger.read());assert.equal(s.receipts.length,0);assert.equal(s.lines.find(l=>l.id==='SYNC-B').available,10);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('PO edits sync added models, pending quantities, row replacements and metadata without resetting confirmed materials',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ool-po-edit-'));
 let orders=[];const ctx={dataDir:dir,readPO:async()=>({orders})};const ledger=createOol(ctx);await ledger.ready;
 try{
  const order={id:'po-edit',status:'Created',supplierName:'Daikin Air Conditioning LLC',poNo:'PO-EDIT',projectName:'Project A',items:[{id:'a',modelNo:'MODEL-A',qty:5,unitPrice:100}]};
  await ledger.po(order,null,admin);let s=await ledger.read();const first=s.lines.find(l=>l.poId===order.id);
  order.items.push({id:'b',modelNo:'MODEL-B',qty:3,unitPrice:50});await ledger.po(order,order,admin);s=await ledger.read();assert.equal(s.lines.filter(l=>l.poId===order.id).length,2);assert.equal(s.lines.find(l=>l.poLineId==='b').sd,'');assert.equal(balances(s).lines.find(l=>l.poLineId==='b').status,'Awaiting OC');
  order.items.reverse();order.items.find(i=>i.id==='b').qty=4;order.poNo='PO-EDIT-R1';order.projectName='Project B';await ledger.po(order,order,admin);s=await ledger.read();assert.equal(s.lines.find(l=>l.id===first.id).orderQty,5);assert.equal(s.lines.find(l=>l.poLineId==='b').orderQty,4);assert.equal(s.lines.find(l=>l.id===first.id).poNo,'PO-EDIT-R1');
  await ledger.transaction(admin,'confirmed fixture',s=>{const line=s.lines.find(l=>l.id===first.id);line.confirmedQty=5;line.sd='SD-EDIT';line.sor='5S-EDIT';line.priceCents=12345;s.requests.push({id:'request',lines:[{id:'requested',lineId:line.id,model:line.model,sd:line.sd,qty:2,confirmed:2,cancelled:0}],history:[]});s.receipts.push({id:'received',sourceId:'supplier:fixture',allocations:[{lineId:line.id,requestLineId:'requested',qty:1}]});});
  order.items.find(i=>i.id==='a').qty=8;order.items.find(i=>i.id==='a').unitPrice=200;await ledger.po(order,order,admin);s=await ledger.read();let group=s.lines.filter(l=>l.poLineId==='a');assert.equal(group.length,2);assert.equal(group.reduce((t,l)=>t+l.orderQty,0),8);assert.equal(group.find(l=>l.id===first.id).priceCents,12345);assert.equal(group.find(l=>l.id!==first.id).confirmedQty,0);assert.equal(group.find(l=>l.id!==first.id).orderQty,3);assert.equal(balances(s).lines.find(l=>l.id===first.id).received,1);
  const before=JSON.stringify(s);order.items.find(i=>i.id==='a').qty=4;await assert.rejects(ledger.po(order,order,admin),/cannot be below/);assert.equal(JSON.stringify(await ledger.read()),before);order.items.find(i=>i.id==='a').qty=6;
  order.items=order.items.filter(i=>i.id==='a');await ledger.po(order,order,admin);s=await ledger.read();assert.equal(s.lines.some(l=>l.poLineId==='b'),false);assert.equal(s.lines.filter(l=>l.poLineId==='a').reduce((t,l)=>t+l.orderQty,0),6);
  // Restart repairs previously skipped additions for tracked POs only.
  order.items.push({id:'c',modelNo:'MODEL-C',qty:7,unitPrice:80});orders=[order,{...order,id:'untracked-old',poNo:'OLD'}];const restarted=createOol(ctx);await restarted.ready;s=await restarted.read();assert.equal(s.lines.find(l=>l.poLineId==='c').orderQty,7);assert.equal(s.lines.some(l=>l.poId==='untracked-old'),false);assert.equal(balances(s).lines.find(l=>l.id===first.id).received,1);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('selected OOL deletion removes only eligible materials and prevents unchanged PO sync from recreating them',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ool-delete-'));
 const ledger=createOol({dataDir:dir,readPO:async()=>({orders:[]}),readJson:async r=>r.body,send:(res,status,data)=>Object.assign(res,{status,data})});await ledger.ready;
 const del=async ids=>{const s=await ledger.read(),res={};await ledger.route({method:'POST',body:{ids,revision:s.revision}},res,{pathname:'/api/ool/delete-lines'},staff);return res;};
 try{
  const po={id:'delete-po',poNo:'DELETE-PO',status:'Created',supplierName:'Daikin Air Conditioning LLC',items:[{id:'pending-item',modelNo:'PENDING',qty:3,unitPrice:50}]};await ledger.po(po,null,admin);
  let s=await ledger.read();const pending=s.lines.find(l=>l.poId===po.id),confirmed=s.lines[0];
  await ledger.transaction(admin,'delete fixtures',s=>{s.lines.push({id:'protected-received',model:'PROTECTED',sd:'SD-P',orderQty:5,confirmedQty:5,priceCents:100});s.receipts.push({id:'r',sourceId:'supplier:r',allocations:[{lineId:'protected-received',qty:1}]});});
  const before=JSON.stringify(await ledger.read());assert.equal((await del([pending.id,'protected-received'])).status,409);assert.equal(JSON.stringify(await ledger.read()),before);
  assert.equal((await del([pending.id,confirmed.id])).status,200);s=await ledger.read();assert.equal(s.lines.some(l=>l.id===pending.id||l.id===confirmed.id),false);assert.equal(s.deletedLines.length,2);assert.equal(s.receipts.length,1);
  await ledger.po(po,po,admin);assert.equal((await ledger.read()).lines.some(l=>l.poLineId==='pending-item'),false);
  po.items.push({id:'new-item',modelNo:'ADDED-LATER',qty:2,unitPrice:25});await ledger.po(po,po,admin);assert.equal((await ledger.read()).lines.some(l=>l.poLineId==='new-item'),true);
  const restarted=createOol({dataDir:dir,readPO:async()=>({orders:[po]})});await restarted.ready;assert.equal((await restarted.read()).lines.some(l=>l.poLineId==='pending-item'),false);
  assert.equal((await del(['protected-received'])).status,409);assert.equal((await del(['missing'])).status,409);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('Undo split restores PO quantity, supports older splits and preserves confirmed parent activity',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ool-undo-split-'));
 const ledger=createOol({dataDir:dir,readPO:async()=>({orders:[]}),readJson:async r=>r.body,send:(res,status,data)=>Object.assign(res,{status,data})});await ledger.ready;
 const run=async(action,body)=>{const state=await ledger.read(),res={};await ledger.route({method:'POST',body:{...body,revision:state.revision}},res,{pathname:'/api/ool/'+action},staff);return res;};
 try{
  await ledger.po({id:'split-po',poNo:'SPLIT-PO',status:'Created',supplierName:'Daikin Air Conditioning LLC',items:[{id:'item',modelNo:'SPLIT-MODEL',qty:10,unitPrice:100}]},null,admin);
  let s=await ledger.read();const original=s.lines.find(l=>l.poId==='split-po');
  let res=await run('split',{id:original.id,qty:4});assert.equal(res.status,200);let child=res.data.lines.find(l=>l.splitFromId===original.id);assert.equal(child.orderQty,4);
  res=await run('split',{id:child.id,qty:1});assert.equal(res.status,200);const nested=res.data.lines.find(l=>l.splitFromId===child.id);
  res=await run('undo-split',{id:child.id});assert.equal(res.status,200);assert.equal(res.data.lines.find(l=>l.id===nested.id).splitFromId,original.id);assert.equal(res.data.lines.find(l=>l.id===original.id).orderQty,9);
  res=await run('undo-split',{id:nested.id});assert.equal(res.status,200);assert.equal(res.data.lines.find(l=>l.id===original.id).orderQty,10);assert.equal(res.data.lines.filter(l=>l.poId==='split-po').length,1);
  // Previously created splits have no explicit parent ID.
  res=await run('split',{id:original.id,qty:2});child=res.data.lines.find(l=>l.splitFromId===original.id);
  await ledger.transaction(admin,'legacy split and delivery fixture',s=>{delete s.lines.find(l=>l.id===child.id).splitFromId;const root=s.lines.find(l=>l.id===original.id);root.confirmedQty=8;root.sd='SD-SPLIT';root.sor='5S-SPLIT';s.requests.push({id:'req',lines:[{id:'rl',lineId:root.id,qty:1,confirmed:1,cancelled:0}],history:[]});s.receipts.push({id:'receipt',sourceId:'supplier:dn',allocations:[{lineId:root.id,requestLineId:'rl',qty:1}]});});
  res=await run('undo-split',{id:child.id});assert.equal(res.status,200);const parent=res.data.lines.find(l=>l.id===original.id);assert.equal(parent.orderQty,10);assert.equal(parent.confirmedQty,8);assert.equal(parent.received,1);assert.equal(parent.sd,'SD-SPLIT');assert.equal(res.data.requests[0].lines[0].lineId,original.id);
  res=await run('split',{id:original.id,qty:1});child=res.data.lines.find(l=>l.splitFromId===original.id);
  await ledger.transaction(admin,'confirmed child fixture',s=>{const l=s.lines.find(l=>l.id===child.id);l.confirmedQty=1;l.sd='SD-CHILD';});
  const before=JSON.stringify(await ledger.read());assert.equal((await run('undo-split',{id:child.id})).status,409);assert.equal(JSON.stringify(await ledger.read()),before);assert.equal((await run('undo-split',{id:original.id})).status,409);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('Excel reconciliation matches formatted PO/model to Awaiting OC, confirms the existing row, and never duplicates on repeat',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ool-import-po-'));let sheet=[];
 const ledger=createOol({dataDir:dir,readPO:async()=>({orders:[]}),readJson:async r=>r.body,send:(res,status,data)=>Object.assign(res,{status,data}),collect:async()=>Buffer.from('xlsx'),parseMultipart:()=>[{filename:'supplier.xlsx',body:Buffer.from('fixture')}],xlsxRows:()=>sheet});await ledger.ready;
 const run=async(action,body)=>{const state=await ledger.read(),res={};await ledger.route({method:'POST',headers:{},body:{...body,revision:state.revision}},res,{pathname:'/api/ool/'+action},admin);return res;};
 try{
  const po={id:'import-po',poNo:'AMTS-26-LPO-003-R2',status:'Created',supplierName:'Daikin Air Conditioning LLC',projectName:'Actual PO Project',items:[{id:'import-item',modelNo:'IMPORT-MODEL',qty:5,unitPrice:100}]};await ledger.po(po,null,admin);const id=(await ledger.read()).lines.find(l=>l.poId===po.id).id;
  sheet=[['SD-IMPORT','5S-IMPORT','#amts / 26 / lpo / 003 - R2','Supplier Project',' import-model ','001','',3,110,330]];
  const before=JSON.stringify(await ledger.read());let res=await run('import-preview',{});assert.equal(res.status,200);const preview=res.data;assert.equal(preview.lines[0].matchedLineId,id);assert.equal(preview.lines[0].matchType,'po');assert.match(preview.lines[0].review,/Match PO/);assert.equal(JSON.stringify(await ledger.read()),before);
  res=await run('reconcile',preview);assert.equal(res.status,200,JSON.stringify(res.data));let line=res.data.lines.find(l=>l.id===id);assert.equal(line.confirmedQty,3);assert.equal(line.orderQty,5);assert.equal(line.sd,'SD-IMPORT');assert.equal(line.sor,'5S-IMPORT');assert.equal(line.priceCents,11000);assert.equal(line.status,'Order Confirmed');assert.equal(line.project,'Actual PO Project');assert.equal(res.data.lines.filter(l=>l.poId===po.id).length,1);assert.equal(res.data.ocs.at(-1).source,'Excel reconciliation');
  const importCount=res.data.imports.length;const repeated=await run('reconcile',preview);assert.equal(repeated.status,200);assert.equal(repeated.data.imports.length,importCount);assert.equal(repeated.data.lines.filter(l=>l.poId===po.id).length,1);
  // A changed supplier item/key still matches its existing SD/SOR/PO/model.
  res=await run('reconcile',{hash:'different-file',lines:preview.lines.map(l=>({...l,sourceKey:'changed-supplier-key',supplierItem:'new-item',confirmedQty:4}))});assert.equal(res.status,200);assert.equal(res.data.lines.filter(l=>l.poId===po.id).length,1);assert.equal(res.data.lines.find(l=>l.id===id).confirmedQty,4);
  // A different revision must not match this PO accidentally.
  const other={...preview.lines[0],sourceKey:'other-revision',poNo:'AMTS-26-LPO-003-R3',sd:'SD-R3'};
  res=await run('reconcile',{hash:'revision-file',lines:[other]});assert.equal(res.status,200);assert.ok(res.data.lines.some(l=>l.sourceKey==='other-revision'&&!l.poId));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('Import PO matching handles partial OC references and rejects ambiguous or excessive quantities atomically',async()=>{
 const {reconcileImportRows}=require('../ool');
 const initial={lines:[{id:'po',poId:'p',poLineId:'item',poNo:'PO-1',model:'M',orderQty:10,confirmedQty:3,sd:'SD-A',sor:'5S-A',priceCents:100}],requests:[],receipts:[],ocs:[]};
 const row={sourceKey:'row-b',poNo:'po/1',model:'M',sd:'SD-B',sor:'5S-B',confirmedQty:2,orderQty:2,priceCents:200};
 const s=structuredClone(initial);reconcileImportRows(s,[row]);assert.equal(s.lines.length,2);assert.equal(s.lines[0].orderQty,8);assert.equal(s.lines[0].confirmedQty,3);assert.equal(s.lines[0].sd,'SD-A');assert.equal(s.lines[1].poId,'p');assert.equal(s.lines[1].poLineId,'item');assert.equal(s.lines[1].confirmedQty,2);assert.equal(s.lines[1].sd,'SD-B');assert.equal(s.lines.reduce((n,l)=>n+l.orderQty,0),10);
 assert.equal(reconcileImportRows(structuredClone(initial),[{...row,confirmedQty:8}],{preview:true})[0].matchType,'blocked');
 const duplicateRows=reconcileImportRows(structuredClone(initial),[row,{...row,sourceKey:'same-model-second-row'}],{preview:true});assert.equal(duplicateRows[1].matchType,'blocked');
 const ambiguous=structuredClone(initial);ambiguous.lines.push({...ambiguous.lines[0],id:'second',poLineId:'second-item'});assert.equal(reconcileImportRows(ambiguous,[row],{preview:true})[0].matchType,'blocked');assert.equal(ambiguous.lines.length,2);
 const wrongModel=reconcileImportRows(structuredClone(initial),[{...row,model:'NOT-ON-PO'}],{preview:true});assert.equal(wrongModel[0].matchType,'blocked');
});

test('Reupload can link an older duplicate import to its awaiting PO while preserving delivery activity',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ool-import-duplicate-'));
 const ledger=createOol({dataDir:dir,readPO:async()=>({orders:[]}),readJson:async r=>r.body,send:(res,status,data)=>Object.assign(res,{status,data})});await ledger.ready;
 try{
  const po={id:'duplicate-po',poNo:'PO-DUP',status:'Created',supplierName:'Daikin Air Conditioning LLC',items:[{id:'di',modelNo:'DUP-M',qty:5,unitPrice:50}]};await ledger.po(po,null,admin);let s=await ledger.read();const pending=s.lines.find(l=>l.poId===po.id);
  const row={id:'duplicate',sourceKey:'old-import-row',poNo:'PO-DUP',model:'DUP-M',sd:'SD-DUP',sor:'5S-DUP',orderQty:3,confirmedQty:3,priceCents:5000};
  await ledger.transaction(admin,'old duplicate fixture',s=>{s.lines.push(row);s.imports.push({hash:'old-file'});s.requests.push({id:'request',lines:[{id:'rl',lineId:'duplicate',model:'DUP-M',sd:'SD-DUP',sor:'5S-DUP',qty:2,confirmed:2,cancelled:0}],history:[]});s.receipts.push({id:'receipt',sourceId:'supplier:old',allocations:[{lineId:'duplicate',requestLineId:'rl',qty:1}]});});
  s=await ledger.read();const res={};await ledger.route({method:'POST',body:{hash:'old-file',revision:s.revision,lines:[{...row,confirmedQty:2}]}},res,{pathname:'/api/ool/reconcile'},admin);assert.equal(res.status,200,JSON.stringify(res.data));s=res.data;
  assert.equal(s.lines.some(l=>l.id==='duplicate'),false);const line=s.lines.find(l=>l.id===pending.id);assert.equal(line.confirmedQty,3);assert.equal(line.received,1);assert.equal(line.remaining,2);assert.equal(s.requests[0].lines[0].lineId,pending.id);assert.equal(s.receipts[0].allocations[0].lineId,pending.id);assert.equal(s.mergedLines.at(-1).id,'duplicate');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('Remaining OC confirmation adds only the pending quantity and keeps earlier SD/SOR, price and receipts intact',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ool-additional-oc-'));
 const ledger=createOol({dataDir:dir,readPO:async()=>({orders:[]}),readJson:async r=>r.body,send:(res,status,data)=>Object.assign(res,{status,data})});await ledger.ready;
 const run=async body=>{const s=await ledger.read(),res={};await ledger.route({method:'POST',body:{...body,quantityMode:'additional',date:'2026-11-24',revision:s.revision}},res,{pathname:'/api/ool/oc'},staff);return res;};
 try{
  await ledger.po({id:'remaining-po',poNo:'REMAINING-PO',status:'Created',supplierName:'Daikin Air Conditioning LLC',items:[{id:'item',modelNo:'MODEL',qty:4,unitPrice:100}]},null,admin);let s=await ledger.read();const id=s.lines.find(l=>l.poId==='remaining-po').id;
  const before=JSON.stringify(s);assert.equal((await run({lines:[{id,confirmedQty:3,price:'',sd:'OLD-SD',sor:'5S-OLD'}]})).status,409);assert.equal(JSON.stringify(await ledger.read()),before);
  let result=await run({lines:[{id,confirmedQty:3,price:'100.00',sd:'OLD-SD',sor:'5S-OLD'}]});assert.equal(result.status,200);assert.equal(result.data.lines.find(l=>l.id===id).confirmedQty,3);assert.equal(result.data.lines.find(l=>l.id===id).orderQty,4);
  await ledger.transaction(admin,'receipt fixture',s=>{s.requests.push({id:'r',lines:[{id:'rl',lineId:id,qty:2,confirmed:2,cancelled:0}],history:[]});s.receipts.push({id:'receipt',sourceId:'supplier:old',allocations:[{lineId:id,requestLineId:'rl',qty:1}]});});
  s=await ledger.read();assert.equal((await run({lines:[{id,confirmedQty:2,price:'200.00',sd:'NEW-SD',sor:'5S-NEW'}]})).status,409);assert.equal(JSON.stringify(await ledger.read()),JSON.stringify(s));
  result=await run({lines:[{id,confirmedQty:1,price:'200.00',sd:'NEW-SD',sor:'5S-NEW'}]});assert.equal(result.status,200,JSON.stringify(result.data));const lines=result.data.lines.filter(l=>l.poId==='remaining-po'),old=lines.find(l=>l.id===id),added=lines.find(l=>l.id!==id);assert.equal(lines.length,2);assert.equal(lines.reduce((n,l)=>n+l.orderQty,0),4);assert.equal(old.orderQty,3);assert.equal(old.confirmedQty,3);assert.equal(old.sd,'OLD-SD');assert.equal(old.sor,'5S-OLD');assert.equal(old.priceCents,10000);assert.equal(old.received,1);assert.equal(added.confirmedQty,1);assert.equal(added.orderQty,1);assert.equal(added.sd,'NEW-SD');assert.equal(added.sor,'5S-NEW');assert.equal(added.priceCents,20000);assert.equal(result.data.receipts[0].allocations[0].lineId,id);assert.equal(result.data.ocs.at(-1).lines[0].id,added.id);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('Reconciled imported order total follows supplier remaining plus delivered quantity and repairs older mismatches',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ool-reconciled-total-'));
 const ctx={dataDir:dir,readPO:async()=>({orders:[]}),readJson:async r=>r.body,send:(res,status,data)=>Object.assign(res,{status,data})};
 const ledger=createOol(ctx);await ledger.ready;
 try{
  let s=await ledger.read();const id=s.lines[0].id,source={...s.lines[0]};
  await ledger.transaction(admin,'received fixture',s=>s.receipts.push({id:'r',sourceId:'supplier:dn',allocations:[{lineId:id,qty:1}]}));
  const apply=async(hash,open)=>{const s=await ledger.read(),res={};await ledger.route({method:'POST',body:{revision:s.revision,hash,lines:[{...source,confirmedQty:open}]}},res,{pathname:'/api/ool/reconcile'},admin);assert.equal(res.status,200,JSON.stringify(res.data));return res.data;};
  s=await apply('increase-balance',2);let line=s.lines.find(l=>l.id===id);assert.equal(line.orderQty,3);assert.equal(line.confirmedQty,3);assert.equal(line.remaining,2);assert.equal(line.received,1);assert.equal(line.originalOrderQty,1);
  s=await apply('decrease-balance',1);line=s.lines.find(l=>l.id===id);assert.equal(line.orderQty,2);assert.equal(line.confirmedQty,2);assert.equal(line.remaining,1);assert.equal(line.received,1);assert.equal(line.originalOrderQty,1);
  await ledger.transaction(admin,'legacy mismatch fixture',s=>{s.lines.find(l=>l.id===id).orderQty=1;});const before=balances(await ledger.read());
  const restarted=createOol(ctx);await restarted.ready;s=balances(await restarted.read());assert.equal(s.lines.find(l=>l.id===id).orderQty,2);assert.deepEqual(s.kpis,before.kpis);assert.deepEqual(s.requests,before.requests);assert.deepEqual(s.receipts,before.receipts);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('Previously imported workbook restores deleted OOL rows and reapplies actual differences without duplicating current matches',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ool-repeat-import-'));
 const ledger=createOol({dataDir:dir,readPO:async()=>({orders:[]}),readJson:async r=>r.body,send:(res,status,data)=>Object.assign(res,{status,data})});await ledger.ready;
 const run=async(action,body)=>{const state=await ledger.read(),res={};await ledger.route({method:'POST',body:{...body,revision:state.revision}},res,{pathname:'/api/ool/'+action},admin);return res;};
 try{
  const row={sourceKey:'restore-workbook-row',poNo:'SUPPLIER-RESTORE',model:'RESTORE-M',sd:'RESTORE-SD',sor:'5S-RESTORE',orderQty:7,confirmedQty:7,priceCents:10000};
  let result=await run('reconcile',{hash:'same-workbook',lines:[row]});assert.equal(result.status,200);let line=result.data.lines.find(l=>l.sourceKey===row.sourceKey);assert.ok(line.id);
  assert.equal((await run('delete-lines',{ids:result.data.lines.map(l=>l.id)})).status,200);assert.equal((await ledger.read()).lines.length,0);
  const emptyReopen=createOol({dataDir:dir,readPO:async()=>({orders:[]})});await emptyReopen.ready;assert.equal((await emptyReopen.read()).lines.length,0);
  result=await run('reconcile',{hash:'same-workbook',lines:[row]});assert.equal(result.status,200,JSON.stringify(result.data));line=result.data.lines.find(l=>l.sourceKey===row.sourceKey);assert.ok(line);assert.equal(line.remaining,7);assert.equal(result.data.lines.filter(l=>l.sourceKey===row.sourceKey).length,1);
  const count=result.data.imports.length,kpis=result.data.kpis;
  result=await run('reconcile',{hash:'same-workbook',lines:[row]});assert.equal(result.status,200);assert.equal(result.data.imports.length,count);assert.deepEqual(result.data.kpis,kpis);assert.equal(result.data.lines.filter(l=>l.sourceKey===row.sourceKey).length,1);
  await ledger.transaction(admin,'changed current balance',s=>{const l=s.lines.find(l=>l.sourceKey===row.sourceKey);l.confirmedQty=3;l.orderQty=3;});
  result=await run('reconcile',{hash:'same-workbook',lines:[row]});assert.equal(result.status,200);assert.equal(result.data.lines.find(l=>l.sourceKey===row.sourceKey).remaining,7);
  // Even a recorded hash must still enforce current allocation constraints.
  const id=result.data.lines.find(l=>l.sourceKey===row.sourceKey).id;await ledger.transaction(admin,'active request',s=>s.requests.push({id:'r',lines:[{id:'rl',lineId:id,qty:6,confirmed:0,cancelled:0}],history:[]}));
  const before=JSON.stringify(await ledger.read());result=await run('reconcile',{hash:'same-workbook',lines:[{...row,confirmedQty:2}]});assert.equal(result.status,409);assert.equal(JSON.stringify(await ledger.read()),before);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('Distinct supplier item numbers preserve repeated model rows in import, reimport and a unique pending PO',()=>{
 const {reconcileImportRows}=require('../ool');const row={poNo:'AMTS-26-LPO-661-R1',model:'KHRP26A73T6',sd:'327647745',sor:'5S52282',priceCents:27000};
 const rows=[{...row,sourceKey:'item-330',supplierItem:'330',confirmedQty:2,orderQty:2},{...row,sourceKey:'item-340',supplierItem:'340',confirmedQty:5,orderQty:5}];
 const fresh=()=>({lines:[],requests:[],receipts:[],ocs:[]});const empty=fresh();const preview=reconcileImportRows(structuredClone(empty),rows,{preview:true});assert.equal(preview.some(r=>r.matchError),false);
 reconcileImportRows(empty,rows);assert.equal(empty.lines.length,2);assert.equal(empty.lines.reduce((n,l)=>n+l.confirmedQty,0),7);assert.deepEqual(empty.lines.map(l=>l.supplierItem),['330','340']);
 assert.ok(reconcileImportRows(structuredClone(empty),rows,{preview:true}).every(r=>r.review==='Unchanged'));reconcileImportRows(empty,rows);assert.equal(empty.lines.length,2);
 // If row formatting changes, the supplier item still selects the correct record.
 const changed=rows.map(r=>({...r,sourceKey:'new-'+r.sourceKey}));assert.ok(reconcileImportRows(structuredClone(empty),changed,{preview:true}).every(r=>r.review==='Unchanged'));
 const tracked=fresh();tracked.lines.push({...row,id:'pending',poId:'erp-po',poLineId:'erp-item',orderQty:7,confirmedQty:0,sd:'',sor:''});reconcileImportRows(tracked,rows);assert.equal(tracked.lines.length,2);assert.equal(tracked.lines.reduce((n,l)=>n+l.orderQty,0),7);assert.equal(tracked.lines.reduce((n,l)=>n+l.confirmedQty,0),7);assert.ok(tracked.lines.every(l=>l.poId==='erp-po'&&l.poLineId==='erp-item'));
 const duplicateItem=[rows[0],{...rows[0],sourceKey:'another-330'}];assert.ok(reconcileImportRows(fresh(),duplicateItem,{preview:true})[1].matchError);
});

test('Import reports incomplete rows with Excel row numbers and excluded amounts while preserving valid zeros',()=>{
 const {parseImport}=require('../ool'),warnings=[];
 const header=['SD Document','Order','Customer Reference','Projects','Material','Item (SD)','Plant','Open Qty','U/ price','Sum of AED'];
 const orphan=[null,null,null,null,'UATQ180CGXY1U','370','5950',1,35211,35211];Object.defineProperty(orphan,'excelRow',{value:9});
 const rows=[header,orphan,['SD','5S001','PO','Project','VALID','1','',2,10,20],[null,null,null,null,'ZERO','2','',0,0,0],[null,null,null,null,'NO-QTY','3','','',10,20],[null,null,null,null,'NO-PRICE','4','',2,'',20],[null,null,null,null,'','5','',2,10,20]];
 const lines=parseImport(rows,{warnings});assert.deepEqual(lines.map(l=>l.model),['VALID','ZERO']);assert.equal(lines[1].priceCents,0);assert.equal(lines[1].confirmedQty,0);assert.equal(warnings.length,4);assert.equal(warnings[0].row,9);assert.equal(warnings[0].model,'UATQ180CGXY1U');assert.deepEqual(warnings[0].missing,['SD Document','SOR No.','PO No.']);assert.equal(warnings[0].amountCents,3521100);assert.equal(warnings[1].missing[0],'Open Qty');assert.equal(warnings[2].missing[0],'Unit price');assert.equal(warnings[3].missing[0],'Model');
});

test('Compact browser responses keep current balances but omit historical row payloads',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ool-compact-'));
 const ledger=createOol({dataDir:dir,readPO:async()=>({orders:[]}),receiptSources:async()=>[],readJson:async r=>r.body,send:(res,status,data)=>Object.assign(res,{status,data})});await ledger.ready;
 try{
  await ledger.transaction(admin,'large history',s=>{s.deletedLines=[{id:'deleted'}];s.mergedLines=[{id:'merged'}];s.imports.push({hash:'large',lines:Array.from({length:1000},()=>({model:'Historical material',qty:100}))});});
  const get=async headers=>{const res={};await ledger.route({method:'GET',headers},res,{pathname:'/api/ool',searchParams:new URLSearchParams()},admin);assert.equal(res.status,200);return res.data;};
  const full=await get({}),compact=await get({'x-ool-view':'compact'});assert.deepEqual(compact.lines,full.lines);assert.deepEqual(compact.kpis,full.kpis);assert.equal(compact.deletedLines,undefined);assert.equal(compact.mergedLines,undefined);assert.equal(compact.imports.at(-1).lines,undefined);assert.ok(full.imports.at(-1).lines.length===1000);assert.ok(JSON.stringify(compact).length<JSON.stringify(full).length);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
