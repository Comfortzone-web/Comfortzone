const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),zlib=require('node:zlib'),crypto=require('node:crypto');
const root=path.join(__dirname,'..'),source=fs.readFileSync(path.join(root,'server.js'),'utf8');
const fixture=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/dx-thermal/expected.json'),'utf8'));
const functions=source.slice(source.indexOf('function dxPngChunk('),source.indexOf('async function extractDxThermalWithOpenAI('));
function context(extra={}) {
 const result={require:require('node:module').createRequire(path.join(root,'server.js')),Buffer,path,zlib,structuredClone,console,safeExtract:value=>String(value??'').trim(),dxExportColumns:()=>fixture.columns,isThermalNumber:value=>/^-?\d+(\.\d+)?$/.test(value),thermalNumericValue:Number,applyDxThermalColumnSanityReview:()=>{},...extra};vm.createContext(result);vm.runInContext(functions,result);return result;
}
const images=[1,2,3].map(i=>fs.readFileSync(path.join(__dirname,`fixtures/dx-thermal/page-${i}.png`)));
let prepared;
async function regions() {
 if(prepared)return prepared;
 const ctx=context();prepared=[];
 for(let index=0;index<3;index++)prepared.push({geometry:await ctx.dxGridImage(images[index],{mode:'inspect'}),crops:await ctx.dxGridImage(images[index],{columns:[0,2,3,10,11,12],headerBottom:index===0?141:0})});
 return prepared;
}
test('actual screenshots lock 13 columns and preserve 26/31/12 equipment rows including merged cells',async()=>{
 const pages=await regions();assert.deepEqual(pages.map(p=>p.geometry.columnCount),[13,13,13]);assert.deepEqual(pages.map(p=>p.crops.rowCount),[26,31,12]);
 assert.equal(fixture.pages.flat().filter(row=>row[2].includes('\n')).length,7);
 const ctx=context();for(const page of pages)for(const crop of page.crops.regions){const geometry=await ctx.dxGridImage(Buffer.from(crop.image,'base64'),{mode:'inspect'});assert.ok(geometry.width<2100,'packed crop remains full-resolution after vision resizing');}
});
test('selection screenshot preserves separate calculated and first-selection column groups',async()=>{
 const ctx=context(),image=fs.readFileSync(path.join(__dirname,'fixtures/dx-thermal/selection-groups.png'));
 const geometry=await ctx.dxGridImage(image,{mode:'inspect'});
 assert.equal(geometry.columnCount,18);
 const calculated=await ctx.dxGridImage(image,{columns:[0,2,3,10,11,12],headerBottom:99});
 const first=await ctx.dxGridImage(image,{columns:[0,2,3,15,16,17],headerBottom:99});
 assert.equal(calculated.rowCount,25);
 assert.equal(calculated.rowCount,first.rowCount);
 assert.ok(first.regions.length>0);
});
test('selected First Selection group is passed to layout reads and retained with extracted rows',async()=>{
 const image=fs.readFileSync(path.join(__dirname,'fixtures/dx-thermal/selection-groups.png'));
 const geometry=await context().dxGridImage(image,{mode:'inspect'});
 const crops=await context().dxGridImage(image,{columns:[0,2,3,15,16,17],headerBottom:99});
 const regions=new Map(crops.regions.map(region=>[region.image,region]));
 const upload={id:'selection',originalName:'selection-groups.png',mimeType:'image/png'};
 let layoutPrompt='';
 const ctx=context({callOpenAIJson:async(name,_schema,content)=>{
  if(name.startsWith('dx_thermal_grid_layout')){
   layoutPrompt=content[0].text;
   return {orderedUploadIds:['selection'],columns:[0,5,6,15,16,17],pages:[{uploadId:'selection',hasHeader:true,headerBottom:99}],unclearFields:[]};
  }
  const sourceImage=content.find(item=>item.type==='input_image').image_url.split(',')[1];
  const region=regions.get(sourceImage);
  assert.ok(region);
  return {rows:Array.from({length:region.rowCount},(_,index)=>({sourceRow:region.firstRow+index,values:['FCU-01 B','Decorative','Pump Room','3.90','3.10','200.00'],uncertainColumns:[]})),unclearFields:[]};
 }});
 const result=await ctx.extractDxGridThermal({id:'project',uploads:[upload]},[upload],new Map([['selection',{upload,bytes:image,geometry}]]),{capacitySource:'First Selection'});
 assert.match(layoutPrompt,/selected the load group named "First Selection"/);
 assert.deepEqual(Array.from(result.gridLayout.columns),[0,2,3,15,16,17]);
 assert.equal(result.gridLayout.capacitySource,'First Selection');
 assert.equal(result.customRows[0][3],'3.90');
});
test('wrong AI Type and Location indices are corrected and outdoor rows are excluded',async()=>{
 const image=fs.readFileSync(path.join(__dirname,'fixtures/dx-thermal/selection-groups.png'));
 const base=context(),geometry=await base.dxGridImage(image,{mode:'inspect'});
 const crops=await base.dxGridImage(image,{columns:[0,2,3,10,11,12],headerBottom:99});
 const regions=new Map(crops.regions.map(region=>[region.image,region]));
 const upload={id:'selection',originalName:'selection-groups.png',mimeType:'image/png'};
 const ctx=context({callOpenAIJson:async(name,_schema,content)=>{
  if(name.startsWith('dx_thermal_grid_layout'))return {orderedUploadIds:['selection'],columns:[0,5,6,10,11,12],pages:[{uploadId:'selection',hasHeader:true,headerBottom:99}],unclearFields:[]};
  const sourceImage=content.find(item=>item.type==='input_image').image_url.split(',')[1],region=regions.get(sourceImage);
  assert.ok(region,'identity columns must use the corrected source crop');
  const rows=Array.from({length:region.rowCount},(_,index)=>{
   const sourceRow=region.firstRow+index,outdoor=[11,16,24].includes(sourceRow),total=sourceRow===25;
   return {sourceRow,values:total?['','','TOTAL','137.30','115.40','9441.00']:outdoor?[`VRV-${sourceRow}`,'Outdoor Unit','Roof','','','']:[`FCU-${sourceRow}`,'Ducted',`Room ${sourceRow}`,'2.40','2.10','175.00'],uncertainColumns:[]};
  });
  return {rows,unclearFields:[]};
 }});
 const result=await ctx.extractDxGridThermal({id:'project',uploads:[upload]},[upload],new Map([['selection',{upload,bytes:image,geometry}]]),{capacitySource:'Calculated AC Load'});
 assert.equal(result.customRows.length,21);
 assert.deepEqual(Array.from(result.gridLayout.columns),[0,2,3,10,11,12]);
 assert.deepEqual(Array.from(result.customRows[0].slice(0,3)),['FCU-1','Ducted','Room 1']);
});
test('malformed four-row reading falls back to physical single-row crops',async()=>{
 const image=fs.readFileSync(path.join(__dirname,'fixtures/dx-thermal/selection-groups.png'));
 const base=context(),geometry=await base.dxGridImage(image,{mode:'inspect'});
 const request={columns:[0,2,3,10,11,12],headerBottom:99};
 const grouped=await base.dxGridImage(image,request);
 const singles=await base.dxGridImage(image,{...request,groupSize:1});
 const regions=new Map([...grouped.regions,...singles.regions].map(region=>[region.image,region]));
 const upload={id:'selection',originalName:'selection-groups.png',mimeType:'image/png'};
 let singleReads=0;
 const ctx=context({callOpenAIJson:async(name,_schema,content)=>{
  if(name.startsWith('dx_thermal_grid_layout'))return {orderedUploadIds:['selection'],columns:request.columns,pages:[{uploadId:'selection',hasHeader:true,headerBottom:99}],unclearFields:[]};
  const sourceImage=content.find(item=>item.type==='input_image').image_url.split(',')[1],region=regions.get(sourceImage);
  assert.ok(region);
  if(name.startsWith('dx_thermal_grid_single_')){
   singleReads++;
   const uncertain=region.firstRow===6;
   return {unitRef:'FCU-01 B',type:'Decorative',location:'Pump Room',tKw:'2.40',sKw:'2.10',flowRate:uncertain?'':'175.00',uncertainColumns:uncertain?['L/S']:[],unclearFields:[]};
  }
  const rows=Array.from({length:region.rowCount},(_,index)=>({sourceRow:region.rowCount===1?1:region.firstRow+index,values:['FCU-01 B','Decorative','Pump Room','2.40','2.10','175.00'],uncertainColumns:[]}));
  return {rows:region.firstRow===5 && region.rowCount===4?rows.slice(1):rows,unclearFields:[]};
 }});
 const result=await ctx.extractDxGridThermal({id:'project',uploads:[upload]},[upload],new Map([['selection',{upload,bytes:image,geometry}]]),{capacitySource:'Calculated AC Load'});
 assert.equal(singleReads,8);
 assert.equal(result.rowSources.length,grouped.rowCount);
 assert.deepEqual(Array.from(result.rowSources.slice(4,8),source=>source.sourceRow),[5,6,7,8]);
 assert.equal(result.customRows[5][5],'');
 assert.match(result.customReviewCells['5:L/S'].reason,/could not be read/);
});
test('full pipeline keeps source order and corrects conflicting Type/load reads with independent agreement',async()=>{
 const pages=await regions(),regionRows=new Map();
 const uploads=pages.map((_,i)=>({id:`source-${i+1}`,originalName:`Screenshot 2026-10-08 ${['120948','121231','121309'][i]}.png`,storedName:`page-${i+1}.png`,mimeType:'image/png'}));
 pages.forEach((page,index)=>page.crops.regions.forEach(region=>regionRows.set(crypto.createHash('sha256').update(region.image).digest('hex'),{region,page:index})));
 const calls=new Map();let layoutContent;
 const ctx=context({readUpload:async(_folder,name)=>images[Number(name.match(/\d/)[0])-1],callOpenAIJson:async(name,_schema,content)=>{
  if(name.startsWith('dx_thermal_grid_layout')){layoutContent=content;return {orderedUploadIds:uploads.map(u=>u.id),columns:[0,2,3,10,11,12],pages:uploads.map((u,i)=>({uploadId:u.id,hasHeader:i===0,headerBottom:i===0?141:0})),unclearFields:[]};}
  const encoded=content.find(c=>c.type==='input_image').image_url.split(',')[1],key=crypto.createHash('sha256').update(encoded).digest('hex'),{region,page}=regionRows.get(key);
  const count=(calls.get(key)||0)+1;calls.set(key,count);
  const rows=fixture.pages[page].slice(region.firstRow-1,region.firstRow-1+region.rowCount).map((row,i)=>({sourceRow:region.firstRow+i,values:[...row],uncertainColumns:[]}));
  if(page===1 && region.firstRow===1 && count===1){rows[0].values[1]='Chilled Water';rows[0].values[3]='20';rows[0].values[4]='1.8';}
  return {rows,unclearFields:[]};
 }});
 const result=await ctx.tryDxGridExtraction({id:'project',uploads},[uploads[2],uploads[0],uploads[1]]);
 assert.deepEqual(JSON.parse(JSON.stringify(result.customRows)),fixture.pages.flat());assert.equal(result.customRows.length,69);
 assert.deepEqual(Array.from(result.sourceUploadIds),uploads.map(u=>u.id));assert.equal(Object.keys(result.customReviewCells).length,0);
 assert.ok([...calls.values()].some(n=>n===3),'conflicting fields receive a third read');
 assert.match(layoutContent[0].text,/System and Type are DIFFERENT/);assert.equal(result.rowSources[26].sourceRow,1);assert.equal(result.rowSources[26].uploadId,'source-2');
});
test('unresolved disagreement is flagged rather than silently accepted and missing rows fail alignment',()=>{
 const ctx=context(),region={firstRow:1,rowCount:1};
 const read=(value)=>({rows:[{sourceRow:1,values:['FCU-01','FCU','Office',value,'1.7','235'],uncertainColumns:[]}]});
 const result=ctx.dxReconcileGridReadings([read('1.8'),read('20'),read('2')],region);assert.ok(result[0].flags.TKw);
 assert.throws(()=>ctx.dxGridRowsByNumber({rows:[]},region),/omitted source rows/);
 assert.throws(()=>ctx.dxGridRowsByNumber({rows:[read('1').rows[0],read('1').rows[0]]},region),/inconsistent source-row alignment/);
});
test('a malformed AI row list is retried without shifting equipment values',async()=>{
 let calls=0;
 const ctx=context({callOpenAIJson:async()=>{
  calls++;
  const rows=[1,2].map(sourceRow=>({sourceRow,values:[`FCU-0${sourceRow}`,'Ducted',`Room ${sourceRow}`,'2.40','2.10','175.00'],uncertainColumns:[]}));
  return {rows:calls===1?rows.slice(1):rows,unclearFields:[]};
 }});
 const result=await ctx.dxReadGridRegion({firstRow:1,rowCount:2,image:'fixture'});
 assert.equal(calls,3);
 assert.equal(result.reconciled.length,2);
 assert.equal(result.reconciled[0].values[0],'FCU-01');
});
test('repeated FCU references in different rooms survive append without duplicate warnings',()=>{
 const ui=fs.readFileSync(path.join(root,'public/dx-workflow.js'),'utf8'),start=ui.indexOf('function dxMergeRows('),end=ui.indexOf('\n}',start)+2;
 const merge=vm.runInNewContext('('+ui.slice(start,end)+')',{structuredClone,dxExportColumns:fixture.columns});
 const first={'Unit Ref':'FCU-01',Type:'FCU',Location:'Room A',TKw:1.8,SKw:1.7,'L/S':235};
 const result=merge([first],[{...first,Location:'Room B'}]);assert.equal(result.length,2);assert.equal(result[0].__reviewCells,undefined);assert.equal(result[1].__reviewCells,undefined);
});

test('append uses the saved header as context without extracting unselected header rows',async()=>{
 const pages=await regions(),uploads=[1,2].map(i=>({id:`source-${i}`,originalName:`page-${i}.png`,storedName:`page-${i}.png`,mimeType:'image/png'}));
 let sawContext=false;
 const ctx=context({readUpload:async(_folder,name)=>images[Number(name.match(/\d/)[0])-1],callOpenAIJson:async(name,_schema,content)=>{
  if(name.startsWith('dx_thermal_grid_layout')){sawContext ||= content.some(c=>c.text?.includes('CONTEXT ONLY'));return {orderedUploadIds:['source-2'],columns:[0,2,3,10,11,12],pages:[{uploadId:'source-2',hasHeader:false,headerBottom:0}],unclearFields:[]};}
  const encoded=content.find(c=>c.type==='input_image').image_url.split(',')[1],region=pages[1].crops.regions.find(r=>r.image===encoded);assert.ok(region);
  return {rows:fixture.pages[1].slice(region.firstRow-1,region.firstRow-1+region.rowCount).map((values,i)=>({sourceRow:region.firstRow+i,values,uncertainColumns:[]})),unclearFields:[]};
 }});
 const result=await ctx.tryDxGridExtraction({id:'project',uploads,dx:{extractionLayout:{headerUploadId:'source-1',columnCount:13}}},[uploads[1]]);
 assert.equal(sawContext,true);assert.equal(result.customRows.length,31);assert.ok(result.rowSources.every(source=>source.uploadId==='source-2'));
});

test('disagreeing header columns stop extraction before any row readings',async()=>{
 const pages=await regions();let calls=0;
 const ctx=context({callOpenAIJson:async(name)=>{assert.ok(name.startsWith('dx_thermal_grid_layout'));calls++;return {orderedUploadIds:['one'],columns:calls===1?[0,2,3,10,11,12]:calls===2?[0,2,3,9,10,11]:[0,2,3,8,9,10],pages:[{uploadId:'one',hasHeader:true,headerBottom:141}],unclearFields:[]};}});
 const upload={id:'one',mimeType:'image/png',originalName:'page-1.png'};
 await assert.rejects(ctx.extractDxGridThermal({id:'project',uploads:[upload]},[upload],new Map([['one',{upload,bytes:images[0],geometry:pages[0].geometry}]])),/could not agree/);
 assert.equal(calls,3);
});
