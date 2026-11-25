// OOL is a separate, versioned ledger. No existing PO is backfilled.
const fs = require('fs');
const path = require('path');
const { randomUUID, createHash } = require('crypto');
const norm = v => String(v || '').trim().toUpperCase();
const isDaikinSupplier=value=>norm(value).replace(/[^A-Z0-9]/g,'')==='DAIKINAIRCONDITIONINGLLC';
const qty = v => { const n = Number(v); if (!Number.isSafeInteger(n) || n < 0) throw Error('Quantities must be non-negative whole numbers'); return n; };
const cents = v => { if (!/^\d+(\.\d{1,2})?$/.test(String(v))) throw Error('Enter a non-negative AED price with at most two decimals'); const [a,b=''] = String(v).split('.'); const n = Number(a)*100 + Number(b.padEnd(2,'0')); if (!Number.isSafeInteger(n)) throw Error('Price is too large'); return n; };
const deliveryContacts=users=>(users||[]).filter(u=>u.active!==false&&String(u.name||'').trim()&&String(u.contact||'').trim()).map(u=>({id:u.id,name:String(u.name).trim(),contact:String(u.contact).trim()}));
function requestMatchReferences(s){const refs=new Map();for(const r of s.requests||[]){if(r.deletedAt)continue;for(const l of r.lines||[]){if(l.qty-(l.cancelled||0)<=0)continue;const model=String(l.model||'').trim(),sd=String(l.sd||'').trim(),sor=String(l.sor||'').trim(),poNo=String(l.poNo||s.lines?.find(x=>x.id===l.lineId)?.poNo||'').trim();if(model&&sd)refs.set([norm(model),norm(sd),sor,poNo].join('|'),{model,sd,sor,poNo});}}return [...refs.values()];}
function balances(s) {
  const totals=new Map(),get=id=>{if(!totals.has(id))totals.set(id,{received:0,requested:0,confirmed:0,requestedReceived:0});return totals.get(id);};
  for(const r of s.requests)for(const x of r.lines){const t=get(x.lineId);t.requested+=x.qty-x.confirmed-(x.cancelled||0);t.confirmed+=x.confirmed;}
  for(const r of s.receipts)for(const x of r.allocations){const t=get(x.lineId);t.received+=x.qty;if(x.requestLineId)t.requestedReceived+=x.qty;}
  const lines = s.lines.map(l => {
    const {received,requested,confirmed,requestedReceived}=get(l.id);
    const activeConfirmed = Math.max(0,confirmed-requestedReceived);
    const remaining = l.confirmedQty-received;
    const available = remaining-requested-activeConfirmed;
    if (available < 0 || remaining < 0) throw Error('Quantity allocation conflict. Refresh and retry.');
    return {...l,received,remaining,available,requested,deliveryConfirmed:activeConfirmed,amountCents:remaining*l.priceCents,
      status: !l.confirmedQty ? 'Awaiting OC' : !remaining ? 'Delivered' : requested && (activeConfirmed || available) ? 'Partially Requested' : requested ? 'Delivery Requested' : activeConfirmed ? 'Delivery Confirmed' : 'Order Confirmed'};
  });
  const total = key=>lines.reduce((n,l)=>n+l[key],0);
  return {...s,lines,kpis:{total:total('remaining'),valueCents:total('amountCents'),requested:total('requested'),confirmed:total('deliveryConfirmed'),available:total('available')}};
}
function orderMatchReferences(s){return balances(s).lines.filter(l=>l.confirmedQty>0&&['Order Confirmed','Delivered'].includes(l.status)).map(l=>({model:l.model,sd:l.sd||'',sor:l.sor||'',poNo:l.poNo||''})).filter(l=>l.model&&l.sd);}
function normalizeMissingItems(lines) {
  const counts=new Map();for(const l of lines){if(!l.supplierItem||l.supplierItem==='(blank)'||/^source-row-/.test(l.supplierItem)){const base=[l.sd,l.sor,l.poNo,l.model].join('|');const n=(counts.get(base)||0)+1;counts.set(base,n);l.supplierItem=`unassigned-${l.model}-${n}`;l.sourceKey=[l.sd,l.sor,l.poNo,l.supplierItem,l.model].join('|');}}return lines;
}
function parseImport(rows,{warnings=[]}={}) {
  const out=[];let sd='',sor='',po='',project='';
  for(let i=0;i<rows.length;i++){
    const r=rows[i],text=v=>String(v??'').trim();
    if(/total/i.test(text(r[0]))){sd=sor=po=project='';continue;}
    if(/^(material|model(?: no\.?)?)$/i.test(text(r[4]))&&/qty|quantity/i.test(text(r[7])))continue;
    const hasQty=text(r[7])!==''&&Number.isFinite(Number(r[7]));
    if(!text(r[4])&&!(hasQty&&text(r[8])))continue;
    if(r[0])sd=text(r[0]);if(r[1])sor=text(r[1]);if(r[2])po=text(r[2]);if(r[3])project=text(r[3]);
    const missing=[];
    if(!text(r[4]))missing.push('Model');if(!sd)missing.push('SD Document');if(!sor)missing.push('SOR No.');else if(!/^5S/i.test(sor))missing.push('valid SOR No. (starting with 5S)');if(!po)missing.push('PO No.');
    if(!hasQty)missing.push('Open Qty');else if(!Number.isSafeInteger(Number(r[7]))||Number(r[7])<0)missing.push('valid whole-number Open Qty');
    if(!text(r[8])||!Number.isFinite(Number(r[8]))||Number(r[8])<0)missing.push('Unit price');
    if(!text(r[9])||!Number.isFinite(Number(r[9]))||Number(r[9])<0)missing.push('Supplier amount');
    if(missing.length){warnings.push({row:r.excelRow||i+1,model:text(r[4])||'Model not specified',qty:hasQty?Number(r[7]):null,amountCents:text(r[9])&&Number.isFinite(Number(r[9]))?Math.round(Number(r[9])*100):null,missing,message:'Row skipped: missing or invalid '+missing.join(', ')});continue;}
    const item=r[5]&&r[5]!=='(blank)'?text(r[5]):`source-row-${i+1}`;
    const sourceKey=[sd,sor,po,item,text(r[4])].join('|');
    out.push({id:randomUUID(),sourceKey,sd,sor,poNo:po,project,model:text(r[4]),supplierItem:item,plant:r[6]||'',orderQty:qty(r[7]),confirmedQty:qty(r[7]),supplierPriceRaw:String(r[8]),supplierAmountRaw:String(r[9]),priceCents:cents(Number(r[8]).toFixed(2)),supplierAmountCents:cents(Number(r[9]).toFixed(2)),opening:true,ocDate:'2026-11-11'});
  }
  return normalizeMissingItems(out);
}
// Preserve revision suffixes/digits while tolerating PO formatting differences.
const poMatchKey=v=>norm(v).replace(/[#\s/\\_\-–—]/g,'');
const modelMatchKey=v=>norm(v).replace(/\s/g,'');
function reconcileImportRows(s,rows,{preview=false,date='',hash='',filename=''}={}){
  date=date||new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Dubai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const output=[],confirmed=[],processed=new Map();
  const documentKey=r=>[poMatchKey(r.poNo),modelMatchKey(r.model),norm(r.sd),norm(r.sor)].join('|');
  const incomingCounts=new Map();for(const r of rows)incomingCounts.set(documentKey(r),(incomingCounts.get(documentKey(r))||0)+1);
  for(const row of rows){
    const draft=preview?structuredClone(s):s;
    try{
      if(!row.sourceKey||!row.sd||!/^5S/i.test(String(row.sor||''))||!row.poNo||!row.model)throw Error('PO, model, SD Document and valid SOR are required');
      const target=qty(row.confirmedQty),price=cents((row.priceCents/100).toFixed(2));
      const sameModel=l=>modelMatchKey(l.model)===modelMatchKey(row.model),samePo=l=>poMatchKey(l.poNo)===poMatchKey(row.poNo);
      let matches=draft.lines.filter(l=>l.sourceKey===row.sourceKey);
      if(!matches.length){
        const refs=draft.lines.filter(l=>samePo(l)&&sameModel(l)&&norm(l.sd)===norm(row.sd)&&norm(l.sor)===norm(row.sor));
        const itemMatches=refs.filter(l=>row.supplierItem&&norm(l.supplierItem)===norm(row.supplierItem));
        if(incomingCounts.get(documentKey(row))>1&&refs.length&&(!row.supplierItem||refs.some(l=>!l.supplierItem)))throw Error('Supplier item numbers are required to distinguish repeated model rows');
        // Repeated models with distinct supplier item numbers are real separate
        // rows. Reference-only fallback is safe only for a unique workbook row.
        matches=itemMatches.length?itemMatches:(incomingCounts.get(documentKey(row))===1?refs:[]);
      }
      if(matches.length>1)throw Error('Multiple existing OOL rows match this supplier line; review before applying');
      let old=matches[0];
      if(old&&processed.has(old.id)&&processed.get(old.id)!==row.sourceKey)throw Error('Multiple supplier rows match the same OOL line; review the quantities before applying');
      const pending=draft.lines.filter(l=>l.poId&&samePo(l)&&sameModel(l)&&l.confirmedQty<l.orderQty);
      let poLine;
      if(!old?.poId){
        if(pending.length>1)throw Error('Multiple Awaiting OC lines match this PO and model; review the split quantities first');
        poLine=pending[0];
      }
      const current=old?balances(draft).lines.find(l=>l.id===old.id):poLine?balances(draft).lines.find(l=>l.id===poLine.id):null;
      const currentRemaining=current?.remaining??null;
      let kind=poLine?'po':old?'existing':'new';
      if(poLine&&target===0&&!old){output.push({...row,matchType:'po',matchedLineId:poLine.id,currentRemaining,review:'Match PO / no open quantity to confirm'});continue;}
      if(poLine){
        const received=old?current.received:0,total=target+received;
        if(total>poLine.orderQty-poLine.confirmedQty)throw Error('Supplier quantity exceeds the unconfirmed quantity on the matching PO model');
        if(old&&target<current.requested+current.deliveryConfirmed)throw Error('Supplier balance is below active requests');
        let destination=poLine;
        if(poLine.confirmedQty){
          poLine.orderQty-=total;
          destination={...poLine,id:randomUUID(),splitFromId:poLine.id,orderQty:total,confirmedQty:0,sd:'',sor:'',sourceKey:undefined};
          draft.lines.push(destination);
        }
        if(old){
          Object.assign(destination,{confirmedQty:total,sd:old.sd,sor:old.sor});
          for(const request of draft.requests)for(const line of request.lines.filter(l=>l.lineId===old.id))line.lineId=destination.id;
          for(const receipt of draft.receipts)for(const allocation of receipt.allocations.filter(a=>a.lineId===old.id))allocation.lineId=destination.id;
          draft.mergedLines=draft.mergedLines||[];draft.mergedLines.push({...old,mergedIntoId:destination.id,mergedAt:new Date().toISOString(),reason:'Link Excel supplier row to existing PO'});
          draft.lines=draft.lines.filter(l=>l.id!==old.id);
        }
        old=destination;
      }else if(!old){
        if(draft.lines.some(l=>l.poId&&samePo(l)))throw Error('No matching Awaiting OC quantity for this model on the existing PO');
        old={...row,id:randomUUID(),confirmedQty:0,priceCents:price};draft.lines.push(old);
      }
      const prior=balances(draft).lines.find(l=>l.id===old.id);
      if(target<prior.requested+prior.deliveryConfirmed)throw Error('Supplier balance is below active requests');
      if((prior.requested||prior.deliveryConfirmed||prior.received)&&(norm(old.sd)!==norm(row.sd)||norm(old.sor)!==norm(row.sor)))throw Error('References on requested or received material cannot change');
      const total=target+prior.received;
      if(old.poId&&total>old.orderQty)throw Error('Supplier balance plus receipts exceeds the matching PO quantity');
      Object.assign(old,{sourceKey:row.sourceKey,supplierItem:row.supplierItem,sd:String(row.sd).trim(),sor:String(row.sor).trim(),confirmedQty:total,priceCents:price,supplierAmountCents:row.supplierAmountCents,supplierPriceRaw:row.supplierPriceRaw,supplierAmountRaw:row.supplierAmountRaw});
      if(!old.poId){old.originalOrderQty??=old.orderQty;old.orderQty=total;}
      if(kind==='po')old.ocDate=date||new Date().toISOString().slice(0,10);
      balances(draft);
      const review=kind==='po'?'Match PO / confirm order':kind==='new'?'New / PO link needs review':currentRemaining!==target?'Quantity differs':current.priceCents!==price?'Price differs':'Unchanged';
      output.push({...row,matchType:kind,matchedLineId:kind==='po'?poLine.id:kind==='existing'?old.id:undefined,currentRemaining,review});
      processed.set(old.id,row.sourceKey);
      if(kind==='po')confirmed.push({id:old.id,confirmedQty:old.confirmedQty,sd:old.sd,sor:old.sor,price:(price/100).toFixed(2)});
      if(preview)Object.assign(s,draft);
    }catch(error){if(!preview)throw Error(`${row.poNo} / ${row.model}: ${error.message}`);output.push({...row,matchType:'blocked',matchError:error.message,review:error.message});}
  }
  if(!preview&&confirmed.length)s.ocs.push({id:randomUUID(),source:'Excel reconciliation',date:date||new Date().toISOString().slice(0,10),hash,filename,lines:confirmed,at:new Date().toISOString()});
  return output;
}
function createOol(ctx) {
  const file=path.join(ctx.dataDir,'ool.json'); let chain=Promise.resolve();
  const fresh=()=>({revision:0,lines:[],requests:[],receipts:[],ocs:[],imports:[],audit:[],activation:new Date().toISOString()});
  async function read() {if(ctx.supabase){const {data,error}=await ctx.supabase.from(ctx.table).select('value').eq('key','ool:v1').maybeSingle();if(error)throw Error(error.message);return data?.value||fresh();}return fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):fresh();}
  async function write(s,expected) {s.revision=expected+1;if(ctx.supabase){if(!expected){const {error}=await ctx.supabase.from(ctx.table).insert({key:'ool:v1',value:s,updated_at:new Date().toISOString()});if(error)throw Error('OOL changed; refresh and retry');}else {const {data,error}=await ctx.supabase.from(ctx.table).update({value:s,updated_at:new Date().toISOString()}).eq('key','ool:v1').eq('value->>revision',String(expected)).select('key');if(error||!data?.length)throw Error('OOL changed; refresh and retry');}}else {const tmp=file+'.tmp';fs.writeFileSync(tmp,JSON.stringify(s,null,2));fs.renameSync(tmp,file);}}
  function transaction(user,action,fn,revision) {const task=chain.then(async()=>{const s=await read();if(revision!==undefined && s.revision!==revision)throw Error('OOL changed; refresh before saving');const rev=s.revision;await fn(s);balances(s);s.audit.push({id:randomUUID(),action,userId:user?.id,userName:user?.name,at:new Date().toISOString()});await write(s,rev);return balances(s);});chain=task.catch(()=>{});return task;}
  function syncPo(s,order){
    if(s.excludedPoIds?.includes(order.id)||order.status!=='Created')return;
    const tracked=s.lines.filter(l=>l.poId===order.id);
    if(!isDaikinSupplier(order.supplierName)){
      if(tracked.some(l=>l.confirmedQty>0))throw Error('Cannot change supplier while this PO has confirmed OOL materials.');
      s.lines=s.lines.filter(l=>l.poId!==order.id);return;
    }
    const remaining=new Set(tracked),items=order.items||[];
    const newLine=(item,n)=>({id:randomUUID(),poId:order.id,poLineId:item.id,poNo:order.poNo,project:order.projectName,model:item.modelNo||item.description,orderQty:n,confirmedQty:0,priceCents:cents(Number(item.unitPrice||0).toFixed(2)),sd:'',sor:''});
    for(const item of items){
      const model=item.modelNo||item.description;
      const removed=(s.deletedLines||[]).filter(l=>l.poId===order.id&&l.poLineId===item.id&&norm(l.model)===norm(model)).reduce((t,l)=>t+l.orderQty,0);
      const n=Math.max(0,qty(item.qty)-removed);
      let group=[...remaining].filter(l=>l.poLineId===item.id);
      // Some imports regenerate item IDs; only reuse a uniquely matching model.
      if(!group.length&&!items.some(i=>i!==item&&norm(i.modelNo||i.description)===norm(model))){
        const candidates=[...remaining].filter(l=>norm(l.model)===norm(model)&&!items.some(i=>i.id===l.poLineId));
        if(new Set(candidates.map(l=>l.poLineId)).size===1)group=candidates;
      }
      group.forEach(l=>remaining.delete(l));
      if(group.some(l=>norm(l.model)!==norm(model))){
        if(group.some(l=>l.confirmedQty>0))throw Error('Cannot replace a model with confirmed OOL quantities. Keep that model and add a new PO row.');
        s.lines=s.lines.filter(l=>!group.includes(l));group=[];
      }
      const confirmed=group.reduce((t,l)=>t+l.confirmedQty,0);
      if(n<confirmed)throw Error(`PO quantity for ${model} cannot be below its ${confirmed} order-confirmed units.`);
      let delta=n-group.reduce((t,l)=>t+l.orderQty,0);
      if(delta>0){
        const pending=group.find(l=>!l.confirmedQty);
        if(pending)pending.orderQty+=delta;
        else {const added=newLine(item,delta);s.lines.push(added);group.push(added);}
      }else if(delta<0){
        for(const l of [...group].reverse()){const take=Math.min(-delta,l.orderQty-l.confirmedQty);l.orderQty-=take;delta+=take;if(!delta)break;}
      }
      for(const l of group){
        l.poLineId=item.id;l.poNo=order.poNo;l.poOrderedQty=n;
        if(!l.projectOverride)l.project=order.projectName;
        if(!l.confirmedQty)l.priceCents=cents(Number(item.unitPrice||0).toFixed(2));
        for(const request of s.requests)for(const row of request.lines.filter(r=>r.lineId===l.id)){row.poNo=l.poNo;row.project=l.project;}
      }
      s.lines=s.lines.filter(l=>!group.includes(l)||l.orderQty>0||l.confirmedQty>0);
    }
    if([...remaining].some(l=>l.confirmedQty>0))throw Error('Cannot remove PO models with order-confirmed OOL quantities.');
    s.lines=s.lines.filter(l=>!remaining.has(l));
  }
  async function init(){return transaction({name:'OOL synchronization'},'Initialize OOL and sync tracked purchase orders',async s=>{
    const orders=(await ctx.readPO()).orders;
    if(s.imports.length||s.lines.length){
      normalizeMissingItems(s.lines);
      // Earlier reconciliations changed the confirmed balance without updating
      // imported order totals. Repair that display inconsistency, not the balance.
      for(const line of s.lines.filter(l=>!l.poId&&l.confirmedQty>l.orderQty)){line.originalOrderQty??=line.orderQty;line.orderQty=line.confirmedQty;}
      for(const order of orders.filter(p=>s.lines.some(l=>l.poId===p.id))){
        const draft=structuredClone(s);
        try{syncPo(draft,order);balances(draft);Object.assign(s,draft);}catch(error){console.error(`OOL PO sync ${order.poNo}: ${error.message}`);}
      }
      return;
    }
    s.excludedPoIds=orders.map(p=>p.id);const seedFile=path.join(__dirname,'data','ool-opening.json');const seed=normalizeMissingItems(ctx.openingLines?structuredClone(ctx.openingLines):fs.existsSync(seedFile)?JSON.parse(fs.readFileSync(seedFile,'utf8')):[]);s.lines=seed;s.imports.push({id:randomUUID(),at:new Date().toISOString(),source:seed.length?'Local opening balance':'OOL activated without opening data',rows:seed.length});
  });}
  async function po(order,previous,user){
    await ready;
    if(order.status!=='Created'||(!isDaikinSupplier(order.supplierName)&&!(await read()).lines.some(l=>l.poId===order.id)))return;
    return transaction(user,previous?'Update Daikin PO materials':'New Daikin PO',s=>syncPo(s,order));
  }
  function allocateReceipt(s,b,source,user){
    const view=balances(s);
          const allocations=[];const used=new Map();for(const r of s.receipts.filter(r=>r.sourceId===b.sourceId))for(const a of r.allocations)used.set(a.sourceIndex,(used.get(a.sourceIndex)||0)+a.qty);
          for(const a of b.allocations){const l=view.lines.find(x=>x.id===a.lineId);const n=qty(a.qty);if(!l||!n)throw Error('Invalid receipt allocation');const sourceLine=source.lines[Number(a.sourceIndex)];if(!sourceLine||norm(sourceLine.model)!==norm(l.model)||norm(sourceLine.sd)!==norm(l.sd)||!l.sd)throw Error('SD and model must match the source receipt');const key=Number(a.sourceIndex);used.set(key,(used.get(key)||0)+n);if(used.get(key)>sourceLine.qty)throw Error('Allocation exceeds receipt quantity');if(allocations.filter(x=>x.lineId===l.id).reduce((t,x)=>t+x.qty,0)+n>l.remaining)throw Error('Receipt exceeds OOL balance');
            let left=n;for(const r of s.requests)for(const x of r.lines.filter(x=>x.lineId===l.id)){const already=s.receipts.flatMap(r=>r.allocations).concat(allocations).filter(a=>a.requestLineId===x.id).reduce((n,a)=>n+a.qty,0);const take=Math.min(left,x.qty-x.cancelled-already);if(take>0){x.confirmed=Math.max(x.confirmed,already+take);allocations.push({lineId:l.id,requestLineId:x.id,qty:take,sourceIndex:key});left-=take;}}
            if(left)allocations.push({lineId:l.id,qty:left,sourceIndex:key});
          }s.receipts.push({id:randomUUID(),sourceId:b.sourceId,sourceLabel:source.label,dnNo:source.dnNo||'',dnDate:source.date||'',projectName:source.projectName||'',date:new Date().toISOString(),userId:user.id,allocations});
  }
  // Keep receipt allocations tied to the saved source, including edits and deletions.
  function reconcileSource(s,sourceId,source){
    const rows=source?.lines||[],used=new Map();
    for(const receipt of s.receipts.filter(r=>r.sourceId===sourceId)){
      const allocations=[];
      for(const allocation of receipt.allocations){
        const line=s.lines.find(l=>l.id===allocation.lineId);
        let left=allocation.qty;
        const indices=[allocation.sourceIndex,...rows.map((_,i)=>i).filter(i=>i!==allocation.sourceIndex)];
        for(const i of indices){
          const row=rows[i];
          if(!line||!row||!row.sd||norm(row.model)!==norm(line.model)||norm(row.sd)!==norm(line.sd))continue;
          const take=Math.min(left,Math.max(0,row.qty-(used.get(i)||0)));
          if(take>0){allocations.push({...allocation,sourceIndex:i,qty:take});used.set(i,(used.get(i)||0)+take);left-=take;}
          if(!left)break;
        }
      }
      receipt.allocations=allocations;
      if(source){receipt.sourceLabel=source.label;receipt.dnNo=source.dnNo;receipt.dnDate=source.date;receipt.projectName=source.projectName;}
    }
    s.receipts=s.receipts.filter(r=>r.allocations.length);
  }
  async function removeSources(sourceIds,user){
    await ready;
    if(!(await read()).receipts.some(r=>sourceIds.includes(r.sourceId)))return;
    return transaction(user,'Remove OOL delivery for deleted source',s=>{for(const sourceId of sourceIds)reconcileSource(s,sourceId,null);});
  }
  async function autoAllocateSupplierDn(dn,user,sourcePrefix='supplier:'){
    await ready;
    const result={allocatedQty:0,reviewRequired:false};
    await transaction(user,'Sync OOL delivery with source note',s=>{
      const sourceId=sourcePrefix+dn.id,source={label:dn.supplierDnNo||dn.id,dnNo:dn.supplierDnNo||'',date:dn.uploadedDate||'',projectName:dn.projectName||'',lines:dn.lines.map(l=>({model:l.modelNo,sd:l.sdDocument||'',qty:Number(l.finalQty||0)}))};
      reconcileSource(s,sourceId,dn.status==='Confirmed'?source:null);
      if(dn.status!=='Confirmed')return;
      const view=balances(s),proposed=[],reserved=new Map();
      for(let i=0;i<source.lines.length;i++){
        const row=source.lines[i];if(!row.sd)continue;
        const used=s.receipts.filter(r=>r.sourceId===sourceId).flatMap(r=>r.allocations).filter(a=>a.sourceIndex===i).reduce((n,a)=>n+a.qty,0);
        const left=row.qty-used;if(left<=0)continue;
        const requestedIds=new Set(s.requests.filter(r=>!r.deletedAt).flatMap(r=>r.lines).filter(l=>norm(l.model)===norm(row.model)&&norm(l.sd)===norm(row.sd)&&l.qty-(l.cancelled||0)>0).map(l=>l.lineId));
        const candidates=view.lines.filter(l=>(requestedIds.size?requestedIds.has(l.id):l.status==='Order Confirmed')&&norm(l.model)===norm(row.model)&&norm(l.sd)===norm(row.sd)&&l.remaining>0);
        if(candidates.length>1||!Number.isSafeInteger(left)){if(candidates.length)result.reviewRequired=true;continue;}
        if(candidates.length!==1)continue;
        const l=candidates[0],n=Math.min(left,l.remaining-(reserved.get(l.id)||0));if(n<=0)continue;
        proposed.push({sourceIndex:i,lineId:l.id,qty:n});reserved.set(l.id,(reserved.get(l.id)||0)+n);
      }
      if(proposed.length){allocateReceipt(s,{sourceId,allocations:proposed},source,user);result.allocatedQty=proposed.reduce((n,a)=>n+a.qty,0);}
    });
    return result;
  }
  async function autoAllocateDirectDelivery(project,user){
    const result={allocatedQty:0,reviewRequired:false,reviewSourceIds:[]};
    await ready;
    const prefix=`direct:${project.id}:`,activeIds=new Set((project.directDeliveryUploads||[]).map(u=>prefix+u.id));
    await removeSources((await read()).receipts.filter(r=>r.sourceId.startsWith(prefix)&&!activeIds.has(r.sourceId)).map(r=>r.sourceId),user);
    for(const upload of project.directDeliveryUploads||[]){
      const dn={id:upload.id,status:'Confirmed',supplierDnNo:upload.deliveryNoteNo||upload.id,uploadedDate:upload.date||'',projectName:project.name||'',lines:upload.lines.map(l=>({modelNo:l.modelNo,sdDocument:l.sdDocument,finalQty:l.quantity}))};
      const applied=await autoAllocateSupplierDn(dn,user,`direct:${project.id}:`);result.allocatedQty+=applied.allocatedQty;
      if(applied.reviewRequired){result.reviewRequired=true;result.reviewSourceIds.push(`direct:${project.id}:${upload.id}`);}
    }
    return result;
  }
  function clientView(value,req){if(req.headers?.['x-ool-view']!=='compact')return value;const {deletedLines,mergedLines,...view}=value;return {...view,audit:(value.audit||[]).slice(-50).map(({action,userId,userName,at,reason})=>({action,userId,userName,at,reason})),imports:(value.imports||[]).map(({lines,...x})=>x),ocs:(value.ocs||[]).map(({lines,...x})=>x)};}
  async function route(req,res,url,user){if(!['ADMIN','STAFF'].includes(norm(user.role)))return ctx.send(res,403,{error:'OOL is available to Admin and Staff only'});
    try{await ready; const action=url.pathname.split('/')[3]||'';
      if(req.method==='GET'){const s=balances(await read());if(action==='delivery-note'){const sourceId=url.searchParams.get('sourceId')||'';if(!s.receipts.some(r=>r.sourceId===sourceId))return ctx.send(res,404,{error:'Delivered note not found'});return ctx.downloadDeliveryNote(res,sourceId);}if(action==='attachment'){const oc=s.ocs.find(o=>o.hash===url.searchParams.get('hash'));if(!oc?.attachment)throw Error('Source document not found');const bytes=await ctx.readUpload('ool',oc.attachment.storedName);if(!bytes)throw Error('Source document unavailable');res.writeHead(200,{'Content-Type':oc.attachment.mimeType,'Content-Disposition':`attachment; filename="${oc.attachment.filename.replace(/["\r\n]/g,'')}"`});return res.end(bytes);}const [pos,sources]=await Promise.all([ctx.readPO(),ctx.receiptSources()]);return ctx.send(res,200,clientView({...s,contacts:deliveryContacts(req.authSettings?.users),sources,orders:pos.orders.filter(p=>s.lines.some(l=>l.poId===p.id)).map(p=>({id:p.id,poNo:p.poNo,items:p.items,project:p.projectName}))},req));}
      if(action==='extract'||action==='import-preview'){const parts=ctx.parseMultipart(await ctx.collect(req),req.headers['content-type']||'');const f=parts.find(p=>p.filename);if(!f)throw Error('Choose a file');const hash=createHash('sha256').update(f.body).digest('hex');
        let detected;
        if(action==='import-preview'){const warnings=[],lines=parseImport(ctx.xlsxRows(f.body),{warnings});detected={lines:reconcileImportRows(structuredClone(await read()),lines,{preview:true}),warnings};}
        else detected=await ctx.extract(f);
        const attachment={storedName:hash+path.extname(f.filename).toLowerCase(),filename:f.filename,mimeType:f.mimeType||'application/octet-stream'};if(ctx.saveUpload)await ctx.saveUpload('ool',attachment.storedName,f.body,attachment.mimeType);
        return ctx.send(res,200,{...detected,hash,filename:f.filename,attachment});}
      const b=await ctx.readJson(req);
      const result=await transaction(user,action,async s=>{
        const view=balances(s); const find=id=>{const l=s.lines.find(l=>l.id===id);if(!l)throw Error('Material not found');return l;};
        if(action==='project'){find(b.id).projectOverride=String(b.project||'');find(b.id).project=String(b.project||'');}
        else if(action==='delete-lines'){
          if(!Array.isArray(b.ids)||!b.ids.length)throw Error('Select OOL materials to delete');
          const ids=[...new Set(b.ids)],lines=ids.map(find);
          for(const l of lines){
            const v=view.lines.find(x=>x.id===l.id);
            const active=s.requests.some(r=>r.lines.some(x=>x.lineId===l.id&&x.qty-(x.cancelled||0)>0));
            if(!['Awaiting OC','Order Confirmed'].includes(v.status)||v.received||active)throw Error('Only Awaiting OC or Order Confirmed materials without active delivery requests or receipts can be deleted');
          }
          s.deletedLines=s.deletedLines||[];
          s.deletedLines.push(...lines.map(l=>({...l,deletedAt:new Date().toISOString(),deletedBy:user.id})));
          s.lines=s.lines.filter(l=>!ids.includes(l.id));
        }
        else if(action==='split') {const l=find(b.id),n=qty(b.qty);if(!n||n>=l.orderQty||n>l.orderQty-l.confirmedQty)throw Error('Split only an unconfirmed portion of this PO line');const original=l.poOrderedQty||l.orderQty;l.orderQty-=n;l.poOrderedQty=original;s.lines.push({...l,id:randomUUID(),splitFromId:l.id,orderQty:n,poOrderedQty:original,confirmedQty:0,sd:'',sor:'',ocDate:'',originalAmountCents:undefined});}
        else if(action==='undo-split'){
          const l=find(b.id);
          if(l.confirmedQty||s.requests.some(r=>r.lines.some(x=>x.lineId===l.id))||s.receipts.some(r=>r.allocations.some(a=>a.lineId===l.id)))throw Error('Only an unconfirmed split without delivery activity can be merged back');
          const sameGroup=x=>x.id!==l.id&&x.poId===l.poId&&x.poNo===l.poNo&&norm(x.model)===norm(l.model)&&(l.poLineId?x.poLineId===l.poLineId:!!l.sourceKey&&x.sourceKey===l.sourceKey);
          const parent=l.splitFromId?s.lines.find(x=>x.id===l.splitFromId&&sameGroup(x)):s.lines.find(x=>sameGroup(x)&&l.poOrderedQty);
          if(!parent||(!l.splitFromId&&s.lines.indexOf(parent)>s.lines.indexOf(l)))throw Error('Original split line is unavailable');
          parent.orderQty+=l.orderQty;
          for(const child of s.lines.filter(x=>x.splitFromId===l.id))child.splitFromId=parent.id;
          s.mergedLines=s.mergedLines||[];s.mergedLines.push({...l,mergedIntoId:parent.id,mergedAt:new Date().toISOString(),mergedBy:user.id});
          s.lines=s.lines.filter(x=>x.id!==l.id);
        }
        else if(action==='oc'){
          if(!b.date)throw Error('OC date is required');if(b.hash&&s.ocs.some(o=>o.hash===b.hash))throw Error('This OC has already been verified');
          if(b.attachment && (!/^[a-f0-9]{64}$/.test(b.hash||'')||!new RegExp('^'+b.hash+'\\.(pdf|png|jpg|jpeg|xlsx)$','i').test(b.attachment.storedName||'')))throw Error('Invalid OC attachment');
          if(!Array.isArray(b.lines)||!b.lines.length)throw Error('Select confirmed material lines');
          let appliedLines=b.lines;
          if(b.quantityMode==='additional'){
            appliedLines=[];const seen=new Set();
            for(const row of b.lines){
              if(seen.has(row.id))throw Error('Duplicate OC material');seen.add(row.id);
              const l=find(row.id),n=qty(row.confirmedQty);if(!n)continue;
              if(n>l.orderQty-l.confirmedQty)throw Error('Confirmation quantity exceeds the remaining unconfirmed PO quantity');
              const price=cents(row.price),sd=String(row.sd??b.sd??'').trim(),sor=String(row.sor??b.sor??'').trim();
              if(sor&&!/^5S/i.test(sor))throw Error('SOR must start with 5S');
              let destination=l;
              if(l.confirmedQty){
                const original=l.poOrderedQty||l.orderQty;l.orderQty-=n;l.poOrderedQty=original;
                destination={...l,id:randomUUID(),splitFromId:l.id,sourceKey:undefined,supplierItem:undefined,orderQty:n,confirmedQty:0,originalAmountCents:undefined};s.lines.push(destination);
              }
              Object.assign(destination,{confirmedQty:n,sd,sor,priceCents:price,ocDate:b.date,originalAmountCents:n*price});
              appliedLines.push({...row,id:destination.id,confirmedQty:n,sd,sor});
            }
            if(!appliedLines.length)throw Error('Enter a quantity to confirm');
          }else{
          for(const row of b.lines){const l=find(row.id);const q=qty(row.confirmedQty);if(q>l.orderQty)throw Error('OC quantity exceeds PO quantity');const v=view.lines.find(x=>x.id===l.id);if(q<l.confirmedQty-v.available)throw Error('Revised OC is below committed or received quantity');if((v.requested||v.deliveryConfirmed||v.received) && ((row.sd??b.sd??l.sd)!==l.sd||(row.sor??b.sor??l.sor)!==l.sor))throw Error('References on committed lines cannot change; split the unconfirmed quantity into a separate OC line');l.confirmedQty=q;l.sd=String(row.sd??b.sd??l.sd);l.sor=String(row.sor??b.sor??l.sor);if(l.sor&&!/^5S/i.test(l.sor))throw Error('SOR must start with 5S');l.priceCents=cents(row.price);l.ocDate=b.date;if(l.originalAmountCents===undefined&&q)l.originalAmountCents=q*l.priceCents;}
          }
          s.ocs.push({...b,lines:appliedLines,id:randomUUID(),userId:user.id,at:new Date().toISOString()});
        }else if(action==='request'){
          if(!b.token)throw Error('Missing submission identity');if(s.requests.some(r=>r.token===b.token))return;
          if(!b.lines?.length)throw Error('Select available materials');const seen=new Set();
          const lines=b.lines.map(x=>{if(seen.has(x.lineId))throw Error('Duplicate material');seen.add(x.lineId);const l=view.lines.find(l=>l.id===x.lineId);const n=qty(x.qty);if(!l||!n||n>l.available)throw Error('Requested quantity exceeds current availability');return {id:randomUUID(),lineId:l.id,qty:n,confirmed:0,cancelled:0,priceCents:l.priceCents,sd:l.sd,sor:l.sor,poNo:l.poNo,model:l.model,project:l.project,location:String(x.location||''),contact:String(x.contact||''),date:String(x.date||'')};});
          s.requests.unshift({id:randomUUID(),token:b.token,date:new Date().toISOString(),userId:user.id,userName:user.name,email:b.email,lines,history:[]});
        }else if(action==='confirmation'){
          const r=s.requests.find(r=>r.id===b.id);if(!r)throw Error('Request not found');if(!b.date)throw Error('Delivery confirmation date required');
          for(const x of b.lines){const l=r.lines.find(l=>l.id===x.id);if(!l)throw Error('Request line missing');const n=qty(x.confirmed);const received=s.receipts.flatMap(r=>r.allocations).filter(a=>a.requestLineId===l.id).reduce((n,a)=>n+a.qty,0);if(n>l.qty-l.cancelled||n<received)throw Error('Confirmed quantity must cover receipts and cannot exceed requested quantity');l.confirmed=n;}r.confirmationDate=b.date;r.history.push({type:'Confirmation',date:new Date().toISOString(),userId:user.id,lines:b.lines});
        }else if(action==='delete-request'||action==='delete-request-line'){
          const r=s.requests.find(r=>r.id===b.id&&!r.deletedAt);if(!r)throw Error('Delivery request not found');
          const receivedFor=l=>s.receipts.flatMap(x=>x.allocations).filter(a=>a.requestLineId===l.id).reduce((n,a)=>n+a.qty,0);
          if(action==='delete-request'){
            if(r.lines.some(l=>l.confirmed>0||receivedFor(l)>0))throw Error('Confirmed or partially confirmed delivery requests cannot be deleted. Remove only pending material quantities.');
            for(const l of r.lines)l.cancelled=l.qty;
            r.deletedAt=new Date().toISOString();r.deletedBy=user.id;
            r.history.push({type:'Delivery request deleted; unconfirmed quantities released',date:r.deletedAt,userId:user.id});
          }else{
            const l=r.lines.find(l=>l.id===b.lineId);if(!l)throw Error('Requested material not found');
            const pending=l.qty-l.confirmed-(l.cancelled||0);if(pending<=0||receivedFor(l)>l.confirmed)throw Error('No unconfirmed quantity is available to remove');
            l.cancelled=(l.cancelled||0)+pending;
            r.history.push({type:'Pending material quantity deleted',lineId:l.id,qty:pending,date:new Date().toISOString(),userId:user.id});
            if(r.lines.every(x=>x.qty-(x.cancelled||0)===0)){r.deletedAt=new Date().toISOString();r.deletedBy=user.id;}
          }
        }else if(action==='cancel'){
          const r=s.requests.find(r=>r.id===b.id);if(!r)throw Error('Request missing');for(const l of r.lines)l.cancelled=l.qty-l.confirmed;r.history.push({type:'Unconfirmed quantity released',date:new Date().toISOString(),userId:user.id});
        }else if(action==='followup') {const r=s.requests.find(r=>r.id===b.id);if(!r)throw Error('Request missing');r.history.push({type:'Follow-up copied',date:new Date().toISOString(),userId:user.id,email:b.email});}
        else if(action==='reconcile'){
          if(norm(user.role)!=='ADMIN')throw Error('Admin reconciliation only');if(!b.hash)throw Error('Missing import source identity');
          if(!Array.isArray(b.lines)||!b.lines.length)throw Error('No supplier materials to reconcile');
          // A file hash records history, not the current ledger contents. Deleted
          // rows and changed balances must still be restorable from that workbook.
          if(s.imports.some(i=>i.hash===b.hash)){
            const currentPreview=reconcileImportRows(structuredClone(s),b.lines,{preview:true});
            if(currentPreview.every(l=>l.review==='Unchanged'))return;
          }
          reconcileImportRows(s,b.lines,{date:b.date,hash:b.hash,filename:b.filename});
          s.imports.push({id:randomUUID(),at:new Date().toISOString(),userId:user.id,hash:b.hash,filename:b.filename,lines:b.lines});
        }else if(action==='receipt'){
          if(!b.sourceId||!b.allocations?.length)throw Error('Select a confirmed receipt and material allocations');
          const sources=await ctx.receiptSources();const source=sources.find(x=>x.id===b.sourceId);if(!source)throw Error('Confirmed receipt not found');
          allocateReceipt(s,b,source,user);
        }else if(action==='correction'){
          if(norm(user.role)!=='ADMIN'||!String(b.reason||'').trim())throw Error('Admin and correction reason required');const r=s.receipts.find(r=>r.id===b.id);if(!r)throw Error('Receipt missing');s.receipts=s.receipts.filter(x=>x.id!==r.id);s.audit.push({action:'Receipt correction',reason:b.reason,receipt:r,userId:user.id,at:new Date().toISOString()});
        }else throw Error('Unknown OOL action');
      },b.revision);return ctx.send(res,200,clientView(result,req));
    }catch(e){return ctx.send(res,409,{error:e.message});}
  }
  const ready=init();ready.catch(e=>console.error('OOL initialization:',e.message));
  return {route,po,read,transaction,ready,autoAllocateSupplierDn,autoAllocateDirectDelivery,removeSources};
}
module.exports={createOol,balances,parseImport,cents,qty,normalizeMissingItems,deliveryContacts,requestMatchReferences,orderMatchReferences,isDaikinSupplier,poMatchKey,reconcileImportRows};
