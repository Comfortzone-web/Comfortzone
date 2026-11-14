/* Manual selection presentation and workflow adapter. Engine and workbook catalog are separate. */
let vrvManualBoqPriceLoad;
let vrvManualComboPopover;
let vrvManualSyncTimer,vrvManualSyncVersion=0,vrvManualSyncQueue=Promise.resolve();
const vrvManualOutdoorReady=row=>row.combo&&['Auto Selected','Manual Override','Review Required'].includes(row.validationStatus);
function vrvManualData() {
  const data = vrvData();
  data.selectionMode ||= 'report';
  data.manual ||= {tab:'indoor', settings:{matchSC:false,matchAirflow:false,targetCR:120,maxCR:130,maxModules:3,maxHP:48}, defaults:{type:'Any',origin:'Any'}, indoor:[],systems:[],outdoor:[],refnets:[],dismissedSources:[]};
  data.manual.dismissedSources ||= [];
  data.manual.collapsedSystems ||= [];
  return data.manual;
}
function vrvManualRender(){
  vrvManualCloseComboPopover();
  const view=document.querySelector('#canvasView'),table=canvas.querySelector('.vrv-manual-scroll');
  const top=view?.scrollTop||0,left=view?.scrollLeft||0,tableTop=table?.scrollTop||0,tableLeft=table?.scrollLeft||0;
  renderVrvWorkspace();
  if(view){view.scrollTop=top;view.scrollLeft=left;}
  const next=canvas.querySelector('.vrv-manual-scroll');if(next){next.scrollTop=tableTop;next.scrollLeft=tableLeft;}
}
function vrvManualPrefill() {
  const manual=vrvManualData();
  const seen=new Map();
  (state.tables.thermal?.rows||[]).forEach((source,index)=>{
    const name=String(firstRowValue(source,['Indoor','Unit Ref','Unit Reference no.','Unit Reference / No.','Units Reference / No.','Name','FCU'])||'').trim();
    const location=String(firstRowValue(source,['Room','Location','Area','Zone'])||'').trim();
    const base=name?`NAME:${name.toUpperCase()}`:`LOCATION:${location.toUpperCase()}`;
    const occurrence=seen.get(base)||0;seen.set(base,occurrence+1);
    const sourceKey=`${base}|${occurrence}`;
    if(manual.dismissedSources.includes(sourceKey))return;
    if(!name && !location && !Object.values(source).some(Boolean))return;
    const existing=manual.indoor.find(row=>row.sourceKey===sourceKey);
    const values={name,location,tc:firstRowValue(source,['Tot Cool Cap','Total Kw','TKw','Rq TC']),sc:firstRowValue(source,['Sens Cool Cap','Sensible Kw','SKw','Rq SC']),airflow:firstRowValue(source,['Air Flow Rate','Flow Rate L/s','L/S','Rq Airflow'])};
    if(existing){for(const [key,value] of Object.entries(values))if(!existing.edited?.includes(key))existing[key]=value;return;}
    manual.indoor.push({id:crypto.randomUUID(),sourceKey,system:'',...values,type:manual.defaults.type,origin:manual.defaults.origin});
  });
  if(window.VrvManual.catalog)window.VrvManual.calculate(manual);
}
function vrvManualOptions(values,selected) {return values.map(value=>`<option value="${escapeHtml(value)}" ${value===selected?'selected':''}>${escapeHtml(value)}</option>`).join('');}
function vrvManualInput(row,key,type='text') {if(type==='text'&&key!=='system')return `<textarea data-manual-field="${key}" data-manual-id="${row.id}" rows="1" aria-label="${key}">${escapeHtml(row[key]??'')}</textarea>`;return `<input data-manual-field="${key}" data-manual-id="${row.id}" type="${type}" ${type==='number'?'min="0" step="any"':''} ${key==='system'?'list="vrv-manual-system-options"':''} value="${escapeHtml(row[key]??'')}" aria-label="${key}">`;}
function vrvManualStep() {
  const manual=vrvManualData();vrvManualPrefill();
  if(!window.VrvManual.catalog)window.VrvManual.load().then(()=>{if(vrvData().selectionMode==='manual'&&vrvData().step===2)renderVrvWorkspace();}).catch(error=>toast(error.message));
  const tabs=[['indoor','Indoor Selection','layers-3'],['outdoor','Outdoor Selection','table-2'],['refnet','REFNET Material Breakdown','layers-3'],['boq','BOQ / Materials','layers-3']];
  const body=manual.tab==='outdoor'?vrvManualOutdoor():manual.tab==='refnet'?vrvManualRefnet():manual.tab==='boq'?vrvManualBoq():vrvManualIndoor();
  return `<section class="dx-card vrv-manual-card"><div class="vrv-manual-tabs">${tabs.map(([key,label,icon])=>`<button type="button" data-manual-tab="${key}" class="${manual.tab===key?'active':''}">${vrvIcon(icon)}${escapeHtml(label)}</button>`).join('')}</div>${window.VrvManual.catalog?body:'<div class="vrv-note">Loading selection catalog…</div>'}</section>`;
}
function vrvManualIndoor() {
  const m=vrvManualData(),types=['Any',...window.VrvManual.types()],origins=['Any',...window.VrvManual.origins()];
  const controls=`<div class="vrv-manual-controls"><label class="vrv-manual-toggle">Match SC <input type="checkbox" data-manual-setting="matchSC" ${m.settings.matchSC?'checked':''}><span aria-hidden="true"></span></label><label class="vrv-manual-toggle">Match Airflow <input type="checkbox" data-manual-setting="matchAirflow" ${m.settings.matchAirflow?'checked':''}><span aria-hidden="true"></span></label><label>Default Type <select data-manual-default="type">${vrvManualOptions(types,m.defaults.type)}</select></label><label>Default Origin <select data-manual-default="origin">${vrvManualOptions(origins,m.defaults.origin)}</select></label><button type="button" class="dx-button vrv-manual-apply" data-manual-apply>Apply</button><button class="dx-button dx-primary" data-manual-add="indoor">+ Add Row</button></div>`;
  const headers=['#','System','Name','Location','Rq TC<br>(kW)','Rq SC<br>(kW)','Rq Airflow<br>(L/s)','Type','Origin','Model<br>(Auto Selected)','Nominal<br>Index','Max TC<br>(kW)','Max SC<br>(kW)',''];
  const displayRows=[...m.indoor,...Array.from({length:Math.max(0,5-m.indoor.length)},(_,index)=>({id:`starter-${index}`,system:'',name:'',location:'',tc:'',sc:'',airflow:'',type:m.defaults.type,origin:m.defaults.origin,__starter:true}))];
  const rows=displayRows.map((row,index)=>{const chosen=row.selection||{};return `<tr><td>${index+1}</td><td>${vrvManualInput(row,'system')}</td><td>${vrvManualInput(row,'name')}</td><td>${vrvManualInput(row,'location')}</td><td>${vrvManualInput(row,'tc','number')}</td><td>${vrvManualInput(row,'sc','number')}</td><td>${vrvManualInput(row,'airflow','number')}</td><td><select data-manual-field="type" data-manual-id="${row.id}">${vrvManualOptions(types,row.type)}</select></td><td><select data-manual-field="origin" data-manual-id="${row.id}">${vrvManualOptions(origins,row.origin)}</select></td><td class="vrv-manual-model">${escapeHtml(chosen.model||chosen.status||'—')}</td><td>${escapeHtml(chosen.index??'—')}</td><td>${escapeHtml(chosen.maxTC??'—')}</td><td>${escapeHtml(chosen.maxSC??'—')}</td><td>${row.__starter?'':`<button type="button" data-manual-delete="${row.id}" aria-label="Delete indoor row">${vrvIcon('trash-2')}</button>`}</td></tr>`}).join('');
  const total=m.indoor.reduce((sum,row)=>sum+(row.selection?.status==='Selected'?Number(row.selection.index):0),0);
  return `${controls}<datalist id="vrv-manual-system-options">${m.systems.map(value=>`<option value="${escapeHtml(value)}">`).join('')}</datalist><div class="vrv-manual-scroll"><table class="vrv-manual-table vrv-manual-indoor"><colgroup>${[42,105,105,155,68,68,82,92,118,175,72,68,68,42].map(width=>`<col style="width:${width}px">`).join('')}</colgroup><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div><div class="vrv-manual-total"><b>Total: ${m.indoor.length} Indoor Units</b><b>Total Nominal Index: ${total} ${m.indoor.some(row=>row.selection?.status!=='Selected')?'<span class="vrv-manual-incomplete">Incomplete</span>':''}</b></div>`;
}
function vrvManualOutdoor() {
  const m=vrvManualData(),s=m.settings;
  const showModuleB=m.outdoor.some(row=>row.combo?.b||row.combo?.c),showModuleC=m.outdoor.some(row=>row.combo?.c);
  const columns=[85,56,80,70,90,105,230,115,...(showModuleB?[115]:[]),...(showModuleC?[115]:[]),67,75,155,36];
  const columnCount=columns.length,tableWidth=columns.reduce((sum,width)=>sum+width,0);
  const moduleKeys=['a',...(showModuleB?['b']:[]),...(showModuleC?['c']:[])];
  const controls=`<div class="vrv-manual-controls">${[['targetCR','Target CR','%'],['maxCR','Max CR','%'],['maxModules','Max Modules',''],['maxHP','Max System Capacity',' HP']].map(([key,label,suffix])=>`<label>${label}<input type="number" data-manual-setting="${key}" value="${s[key]}">${suffix}</label>`).join('')}</div>`;
  const rows=m.outdoor.map(row=>{
    const combination=row.combo?[row.combo.a,row.combo.b,row.combo.c].filter(Boolean).join(' + '):'No combination';
    const reset=row.selectionMode==='Manual Override'||row.seriesOverride;
    const modeLabel=row.combo?(row.selectionMode==='Manual Override'?'Manual Override':'Auto Selected'):(row.validationStatus||'Awaiting selection');
    const selected=`<div class="vrv-manual-combination"><button type="button" class="vrv-manual-combo-open" data-manual-combo-open="${escapeHtml(row.system)}" aria-label="Choose outdoor combination for ${escapeHtml(row.system)}" aria-haspopup="dialog"><span>${escapeHtml(combination)}</span><small>${escapeHtml(modeLabel)} ▾</small></button>${reset?`<button type="button" class="vrv-manual-combo-reset" data-manual-combo-reset="${escapeHtml(row.system)}">Reset to Auto</button>`:''}</div>`;
    const statusClass=['Auto Selected','Manual Override'].includes(row.validationStatus)?'ok':'review';
    return `<tr><td>${escapeHtml(row.system)}</td><td>${row.count}</td><td>${row.index}</td><td><input type="number" data-manual-system="${escapeHtml(row.system)}" data-manual-system-field="targetCR" value="${row.targetCR}">%</td><td>${Number.isFinite(row.requiredIndex)?Math.round(row.requiredIndex):'—'}</td><td><select class="vrv-manual-series-select ${row.seriesOverride&&row.series!==row.recommendedSeries?'is-override':'is-auto'}" data-manual-system="${escapeHtml(row.system)}" data-manual-system-field="series" aria-label="Outdoor series for ${escapeHtml(row.system)}">${row.series?'':'<option value="" selected disabled hidden>—</option>'}${vrvManualOptions(['RXQ','RXYTQ'],row.series)}</select></td><td>${selected}</td>${moduleKeys.map(key=>`<td class="vrv-manual-module">${escapeHtml(row.combo?.[key]||'—')}</td>`).join('')}<td>${row.combo?.hp||'—'} HP</td><td>${Number.isFinite(row.achievedCR)?row.achievedCR.toFixed(1)+'%':'—'}</td><td><span class="vrv-manual-status ${statusClass}">${escapeHtml(row.status)}</span></td><td><button data-manual-system-delete="${escapeHtml(row.system)}" aria-label="Remove system">×</button></td></tr>`;
  }).join('');
  return `${controls}<div class="vrv-manual-scroll vrv-manual-outdoor-scroll"><table class="vrv-manual-table vrv-manual-outdoor" style="--vrv-outdoor-width:${tableWidth}px"><colgroup>${columns.map(width=>`<col style="width:${width}px">`).join('')}</colgroup><thead><tr><th rowspan="2">System</th><th rowspan="2">Indoor<br>Units</th><th rowspan="2">Total Indoor Index</th><th rowspan="2">Target CR</th><th rowspan="2">Required ODU Index</th><th rowspan="2">Outdoor Series</th><th colspan="${moduleKeys.length+1}">Selected Outdoor Units (Modules)</th><th rowspan="2">Total HP</th><th rowspan="2">Achieved CR</th><th rowspan="2">Status</th><th rowspan="2"></th></tr><tr><th>Combination</th>${moduleKeys.map(key=>`<th>Module ${key.toUpperCase()}</th>`).join('')}</tr></thead><tbody>${rows||`<tr><td colspan="${columnCount}">Assign indoor units to a System to begin.</td></tr>`}</tbody></table></div><div class="vrv-manual-total"><b>Total Indoor Units: ${m.outdoor.reduce((sum,row)=>sum+row.count,0)}</b><b>Total Indoor Index: ${m.outdoor.reduce((sum,row)=>sum+row.index,0)}</b><b>Total Outdoor HP: ${m.outdoor.filter(vrvManualOutdoorReady).reduce((sum,row)=>sum+Number(row.combo.hp),0)}</b></div>`;
}
function vrvManualCloseComboPopover() {
  if(!vrvManualComboPopover)return;
  document.removeEventListener('pointerdown',vrvManualComboPopover.outside);
  window.removeEventListener('scroll',vrvManualComboPopover.onScroll,true);
  window.removeEventListener('resize',vrvManualCloseComboPopover);
  vrvManualComboPopover.element.remove();
  vrvManualComboPopover=null;
}
function vrvManualSyncDownstream() {
  if(typeof state==='undefined'||!state.tables)return;
  const tables=state.tables;
  if(!tables.vrvSchedule?.rows?.length && !tables.costing?.rows?.length && !tables.boq?.rows?.length)return;
  const version=++vrvManualSyncVersion;
  clearTimeout(vrvManualSyncTimer);
  vrvManualSyncTimer=setTimeout(()=>{
    vrvManualSyncQueue=vrvManualSyncQueue.then(async()=>{
      if(version!==vrvManualSyncVersion)return;
      try{await vrvManualGenerate();}
      catch{
        if(version!==vrvManualSyncVersion)return;
        for(const key of ['vrvSchedule','costing','boq'])if(tables[key])tables[key].rows=[];
        if(tables.costing?.summary)vrvReprice();
        vrvDirty();
      }
      if(version===vrvManualSyncVersion && vrvData().selectionMode==='manual' && vrvData().step===2)vrvManualRender();
    });
  },120);
}
function vrvManualCommit(m) {
  window.VrvManual.calculate(m);vrvDirty();vrvManualRender();vrvManualSyncDownstream();
}
function vrvManualComboChoices(row,settings) {
  return window.VrvManual.eligibleCombos(row,settings).filter(combo=>row.index/combo.index*100>=95);
}
function vrvManualComboPlacement(rect,width,height,viewportWidth) {
  const gap=6,margin=12;
  const left=Math.max(margin,Math.min(rect.left,viewportWidth-width-margin));
  return {left,top:Math.max(margin,rect.top-height-gap)};
}
function vrvManualOpenComboPopover(button) {
  vrvManualCloseComboPopover();
  const m=vrvManualData(),system=button.dataset.manualComboOpen,row=m.outdoor.find(item=>item.system===system);
  if(!row)return;
  const eligible=vrvManualComboChoices(row,m.settings);
  const element=document.createElement('div');
  element.className='vrv-manual-combo-popover';element.setAttribute('role','dialog');element.setAttribute('aria-label',`Outdoor combinations for ${system}`);
  element.innerHTML=`<input type="search" aria-label="Search combinations by model or HP" placeholder="Search model or HP…"><div class="vrv-manual-combo-options"></div>`;
  document.body.append(element);
  const width=Math.min(470,window.innerWidth-24);
  element.style.width=`${width}px`;
  element.style.maxHeight=`${Math.max(48,Math.min(310,button.getBoundingClientRect().top-18))}px`;
  const search=element.querySelector('input'),list=element.querySelector('.vrv-manual-combo-options');
  const renderOptions=()=>{
    const query=search.value.trim().toLowerCase();
    const shown=eligible.filter(combo=>`${[combo.a,combo.b,combo.c].filter(Boolean).join(' + ')} ${combo.hp} hp`.toLowerCase().includes(query));
    list.innerHTML=shown.map(combo=>{
      const name=[combo.a,combo.b,combo.c].filter(Boolean).join(' + '),cr=(row.index/combo.index*100).toFixed(1);
      return `<button type="button" data-manual-combo-choice="${escapeHtml(combo.id)}"><span>${escapeHtml(name)}</span><small>${combo.hp} HP · ${combo.modules} ${combo.modules===1?'Module':'Modules'} · CR ${cr}% ${combo.id===row.seriesRecommendedComboId?'<b>Recommended</b>':''}</small></button>`;
    }).join('')||'<div class="vrv-manual-combo-empty">No eligible combinations match this search.</div>';
    const position=vrvManualComboPlacement(button.getBoundingClientRect(),width,element.getBoundingClientRect().height,window.innerWidth);
    element.style.left=`${position.left}px`;element.style.top=`${position.top}px`;
  };
  search.addEventListener('input',renderOptions);
  search.addEventListener('keydown',event=>{if(event.key==='Escape')vrvManualCloseComboPopover();});
  list.addEventListener('click',event=>{
    const option=event.target.closest('[data-manual-combo-choice]');if(!option)return;
    const current=vrvManualData().outdoor.find(item=>item.system===system);
    if(!current||!vrvManualComboChoices(current,vrvManualData().settings).some(combo=>combo.id===option.dataset.manualComboChoice))return toast('This combination is no longer eligible or its achieved CR is below 95%.');
    current.overrideKey=option.dataset.manualComboChoice;current.selectedComboId=current.overrideKey;current.selectionMode='Manual Override';
    vrvManualCommit(vrvManualData());
  });
  const outside=event=>{if(!element.contains(event.target)&&event.target!==button)vrvManualCloseComboPopover();};
  const onScroll=event=>{if(!element.contains(event.target))vrvManualCloseComboPopover();};
  document.addEventListener('pointerdown',outside);
  window.addEventListener('scroll',onScroll,true);
  window.addEventListener('resize',vrvManualCloseComboPopover);
  vrvManualComboPopover={element,outside,onScroll};
  renderOptions();search.focus({preventScroll:true});
}
function vrvManualRefnet() {
  const m=vrvManualData();
  const groups=m.outdoor.filter(vrvManualOutdoorReady).map((system,index)=>{
    const lines=m.refnets.filter(row=>row.system===system.system),collapsed=m.collapsedSystems.includes(system.system);
    const heading=`<tr class="vrv-refnet-system"><td><button type="button" data-manual-toggle="${escapeHtml(system.system)}" aria-label="${collapsed?'Expand':'Collapse'} ${escapeHtml(system.system)}">${collapsed?'▸':'▾'}</button></td><td>${index+1}</td><td><span class="vrv-refnet-badge">${escapeHtml(system.system)}</span></td><td>${escapeHtml(system.series)}</td><td>${system.combo.hp} HP</td><td colspan="3"></td></tr>`;
    if(collapsed)return heading;
    const materials=lines.map(line=>`<tr class="vrv-refnet-material"><td colspan="5"></td><td><span class="vrv-refnet-model">${escapeHtml(line.model||'—')}</span></td><td>${escapeHtml(line.description||line.status||'Preliminary REFNET joint')}</td><td>${line.qty||'—'}</td></tr>`).join('');
    const subtotal=`<tr class="vrv-refnet-subtotal"><td colspan="7">Total — ${escapeHtml(system.system)}</td><td>${lines.reduce((sum,line)=>sum+Number(line.qty||0),0)}</td></tr>`;
    return heading+materials+subtotal;
  }).join('');
  return `<div class="vrv-note">Preliminary REFNET selection based on the Excel's linear piping assumption. Final kits must be verified against the actual refrigerant piping layout and Daikin requirements.</div><div class="vrv-manual-scroll vrv-refnet-scroll"><table class="vrv-manual-table vrv-manual-refnet"><colgroup>${[3,4,11,12,11,15,34,10].map(width=>`<col style="width:${width}%">`).join('')}</colgroup><thead><tr>${['','#','System','Outdoor Series','Outdoor HP','REFNET Model','Description','Quantity'].map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>${groups||'<tr class="vrv-refnet-empty"><td colspan="8">Complete indoor and outdoor selections first.</td></tr>'}</tbody></table></div><div class="vrv-refnet-summary"><b>Overall REFNET Summary</b><span>Total Systems <strong>${m.outdoor.filter(vrvManualOutdoorReady).length}</strong></span><span>Total REFNET Types <strong>${new Set(m.refnets.map(row=>row.model).filter(Boolean)).size}</strong></span><span class="vrv-refnet-summary-quantity">Total REFNET Quantity <strong>${m.refnets.reduce((sum,row)=>sum+Number(row.qty||0),0)}</strong></span></div>`;
}
function vrvManualMaterials(m) {
  const items=new Map(),warnings=[];
  const add=(model,qty,category,fallback)=>{
    if(!model || !Number.isFinite(Number(qty)) || Number(qty)<=0)return;
    const existing=items.get(model);
    if(existing)existing.qty+=Number(qty);
    else items.set(model,{model,qty:Number(qty),category,fallback});
  };
  const validIndoor=m.indoor.filter(row=>row.system?.trim() && row.name?.trim() && row.selection?.status==='Selected' && row.selection.model);
  validIndoor.forEach(row=>add(row.selection.model,1,'indoor',row.selection.description||`${row.selection.type||row.type||'VRV'} indoor unit`));
  if(validIndoor.length!==m.indoor.length || !m.indoor.length)warnings.push('Indoor Selection');
  const validOutdoor=m.outdoor.filter(vrvManualOutdoorReady);
  validOutdoor.forEach(row=>[row.combo.a,row.combo.b,row.combo.c].forEach(model=>add(model,1,'outdoor',`${row.series||'VRV'} outdoor unit`)));
  if(validOutdoor.length!==m.outdoor.length || (m.indoor.length && !m.outdoor.length))warnings.push('Outdoor Selection');
  const validSystems=new Set(validOutdoor.map(row=>row.system));
  m.refnets.forEach(row=>{
    if(validSystems.has(row.system) && row.model && Number(row.qty)>0)add(row.model,row.qty,'refnet',row.description||'REFNET branch piping kit');
  });
  if(m.refnets.some(row=>!validSystems.has(row.system) || !row.model || !Number.isFinite(Number(row.qty)) || Number(row.qty)<=0))warnings.push('REFNET Material Breakdown');
  items.delete('BRC1H82W');
  items.set('BRC1H82W',{model:'BRC1H82W',qty:validIndoor.length,category:'thermostat',fallback:'Remote controller (white)'});
  return {items:[...items.values()],warnings};
}
function vrvManualBoq() {
  const m=vrvManualData(),{items,warnings}=vrvManualMaterials(m);
  const prices=typeof workflowCostingPriceItems==='function'?workflowCostingPriceItems():[];
  if(!prices.length && !vrvManualBoqPriceLoad && typeof ensureWorkflowCostingPriceList==='function'){
    vrvManualBoqPriceLoad=ensureWorkflowCostingPriceList().then(()=>{
      if(vrvData().selectionMode==='manual' && vrvData().step===2 && vrvManualData().tab==='boq')vrvManualRender();
    }).catch(()=>{});
  }
  const descriptions=new Map(prices.map(item=>[String(item.model||'').trim().toUpperCase(),item.description]));
  const rows=items.map(item=>`<tr><td>${escapeHtml(item.model)}</td><td>${item.qty}</td><td>${escapeHtml(item.category==='thermostat'?item.fallback:descriptions.get(item.model.toUpperCase())||item.fallback)}</td></tr>`).join('');
  const warning=warnings.length?`<p class="vrv-manual-boq-warning" role="status">Incomplete: ${warnings.map(escapeHtml).join(', ')}. Quantities shown include completed selections only.</p>`:'';
  return `${warning}<div class="vrv-manual-scroll vrv-manual-boq-scroll"><table class="vrv-manual-table vrv-manual-boq"><colgroup><col style="width:30%"><col style="width:16%"><col style="width:54%"></colgroup><thead><tr><th>Model</th><th>Qty</th><th>Description</th></tr></thead><tbody>${rows||'<tr><td colspan="3" class="vrv-manual-boq-empty">Complete selections to see materials.</td></tr>'}</tbody></table></div>`;
}
function vrvManualBind() {
  canvas.querySelectorAll('[data-manual-tab]').forEach(button=>button.onclick=()=>{vrvManualData().tab=button.dataset.manualTab;vrvDirty();vrvManualRender();const table=canvas.querySelector('.vrv-manual-scroll');if(table){table.scrollLeft=0;table.scrollTop=0;}});
  canvas.querySelectorAll('[data-manual-setting]').forEach(input=>input.onchange=()=>{const m=vrvManualData();m.settings[input.dataset.manualSetting]=input.type==='checkbox'?input.checked:Number(input.value);vrvManualCommit(m);});
  canvas.querySelectorAll('[data-manual-default]').forEach(input=>input.onchange=()=>{vrvManualData().defaults[input.dataset.manualDefault]=input.value;vrvDirty();});
  canvas.querySelectorAll('[data-manual-apply]').forEach(button=>button.onclick=()=>{const m=vrvManualData();m.indoor.forEach(row=>{row.type=m.defaults.type;row.origin=m.defaults.origin;row.edited ||= [];for(const field of ['type','origin'])if(!row.edited.includes(field))row.edited.push(field);});vrvManualCommit(m);});
  canvas.querySelectorAll('[data-manual-field]').forEach(input=>input.onchange=()=>{const m=vrvManualData();let row=m.indoor.find(row=>row.id===input.dataset.manualId);if(!row&&input.dataset.manualId.startsWith('starter-')){row={id:crypto.randomUUID(),system:'',name:'',location:'',tc:'',sc:'',airflow:'',type:m.defaults.type,origin:m.defaults.origin};m.indoor.push(row);}if(!row)return;row[input.dataset.manualField]=input.value;row.edited ||= [];if(!row.edited.includes(input.dataset.manualField))row.edited.push(input.dataset.manualField);vrvManualCommit(m);});
  canvas.querySelectorAll('[data-manual-add]').forEach(button=>button.onclick=()=>{const m=vrvManualData();if(button.dataset.manualAdd==='indoor')m.indoor.push({id:crypto.randomUUID(),system:'',name:'',location:'',tc:'',sc:'',airflow:'',type:m.defaults.type,origin:m.defaults.origin});else {let i=1;while(m.systems.includes(`VRV-${String(i).padStart(2,'0')}`))i++;m.systems.push(`VRV-${String(i).padStart(2,'0')}`);}vrvManualCommit(m);});
  canvas.querySelectorAll('[data-manual-delete]').forEach(button=>button.onclick=()=>{if(!confirm('Delete this indoor unit? Outdoor and REFNET results will update.'))return;const m=vrvManualData(),removed=m.indoor.find(row=>row.id===button.dataset.manualDelete);if(removed?.sourceKey)m.dismissedSources.push(removed.sourceKey);m.indoor=m.indoor.filter(row=>row.id!==button.dataset.manualDelete);vrvManualCommit(m);});
  canvas.querySelectorAll('[data-manual-system-field]').forEach(input=>input.onchange=()=>{const m=vrvManualData(),row=m.outdoor.find(row=>row.system===input.dataset.manualSystem);if(!row)return;const key=input.dataset.manualSystemField==='series'?'seriesPreference':input.dataset.manualSystemField;row[key]=key==='seriesPreference'&&input.value===row.recommendedSeries?'Auto':key==='targetCR'?Number(input.value):input.value;if(key==='targetCR')row.targetOverride=true;vrvManualCommit(m);});
  canvas.querySelectorAll('[data-manual-combo-open]').forEach(button=>button.onclick=()=>vrvManualOpenComboPopover(button));
  canvas.querySelectorAll('[data-manual-combo-reset]').forEach(button=>button.onclick=()=>{const m=vrvManualData(),row=m.outdoor.find(item=>item.system===button.dataset.manualComboReset);if(!row)return;row.overrideKey='';row.selectedComboId='';row.selectionMode='Automatic';row.seriesPreference='Auto';vrvManualCommit(m);});
  canvas.querySelectorAll('[data-manual-system-delete]').forEach(button=>button.onclick=()=>{const m=vrvManualData(),name=button.dataset.manualSystemDelete;if(m.indoor.some(row=>row.system===name))return toast('Reassign the indoor units before removing this system.');m.systems=m.systems.filter(value=>value!==name);vrvManualCommit(m);});
  canvas.querySelectorAll('[data-manual-toggle]').forEach(button=>button.onclick=()=>{const m=vrvManualData(),system=button.dataset.manualToggle;m.collapsedSystems=m.collapsedSystems.includes(system)?m.collapsedSystems.filter(value=>value!==system):[...m.collapsedSystems,system];vrvDirty();vrvManualRender();});
}
async function vrvManualGenerate() {
  await window.VrvManual.load();
  await ensureWorkflowCostingPriceList();
  const m=vrvManualData();vrvManualPrefill();window.VrvManual.calculate(m);
  if(!m.indoor.length)throw new Error('Add indoor units or extract thermal data before generating the schedule.');
  const unresolved=m.indoor.filter(row=>!row.system.trim() || !row.name.trim() || row.selection?.status!=='Selected');
  const incomplete=m.outdoor.filter(row=>!vrvManualOutdoorReady(row));
  const refnetErrors=m.refnets.filter(row=>!row.model);
  if(unresolved.length || incomplete.length || refnetErrors.length) throw new Error(`Complete ${unresolved.length} indoor rows and ${incomplete.length} outdoor systems; resolve ${refnetErrors.length} REFNET lookups before generating the schedule.`);
  const catalog=window.VrvManual.catalog;
  const oldLookup=state.lookup;
  try {
    state.lookup={...oldLookup,indoorData:catalog.indoor.map(x=>({fcu:x.model,type:x.type,origin:x.origin,ambient:x.ambient,maxTC:x.maxTC,maxSC:x.maxSC,airflow:x.airflow,pic:x.pic,sound:x.sound,ps:x.ps,mca:x.mca,wxhxd:x.dimensions,weight:x.weight,nominalIndex:x.index})),outdoorData:catalog.outdoor.map(x=>({model:x.model,ambient:x.ambient,cc:x.cc,piEsma:x.piEsma,ps:x.ps,mca:x.mca,mop:x.mop,rla:x.rla,wxhxd:x.dimensions,weight:x.weight,nominalIndex:x.index}))};
    const rows=[];
    for(const system of m.outdoor){
      const indoors=m.indoor.filter(row=>row.system.trim()===system.system);
      const modules=[system.combo.a,system.combo.b,system.combo.c].filter(Boolean);
      indoors.forEach((row,index)=>rows.push({system:system.system,name:row.name||`Indoor ${index+1}`,fcu:row.selection.model,rqTC:row.tc,rqSC:row.sc,airFlowRate:row.selection.airflow,tmpC:row.selection.ambient,maxTC:row.selection.maxTC,maxSC:row.selection.maxSC,outdoorRefs:index===0?[{outdoorName:system.system,outdoorModel:modules.join(' + '),outdoorComponents:modules},...modules.map((model,i)=>({outdoorName:String.fromCharCode(65+i),outdoorModel:model}))]:[]}));
    }
    buildVrvSchedule(rows);
    const queues=new Map();
    m.indoor.forEach(row=>{const key=`${row.system.trim()}|${row.name}`;if(!queues.has(key))queues.set(key,[]);queues.get(key).push(row);});
    state.tables.vrvSchedule.rows.filter(row=>!row.__rowType).forEach(row=>{
      const source=queues.get(`${row.System}|${row.Name}`)?.shift();
      if(source){row.Location=source.location;row['Rq TC']=source.tc;row['Rq SC']=source.sc;row['Air Flow Rate']=source.airflow;}
      const system=m.outdoor.find(item=>item.system===row.System);
      if(system&&row['Outdoor Name']===system.system){
        const modules=[system.combo.a,system.combo.b,system.combo.c].filter(Boolean).map(model=>catalog.outdoor.find(item=>item.model===model)).filter(Boolean);
        row['Outdoor Nominal Index']=system.combo.index;
        row.CC=Math.round(system.combo.cc*100)/100;
        row['PI ESMA']=Math.round(modules.reduce((sum,item)=>sum+Number(item.piEsma||0),0)*100)/100;
      }
    });
  } finally {state.lookup=oldLookup;}
  const materials=vrvManualMaterials(m).items;
  const savedPrices=new Map((state.tables.costing?.rows||[]).filter(row=>Number(row['Final Price (AED)'])>0).map(row=>[String(row.Model).trim().toUpperCase(),Number(row['Final Price (AED)'])]));
  buildCosting(materials.map(({model,qty})=>[model,qty]));
  state.tables.costing.rows.forEach(row=>{if(row['Final Price (AED)']===''&&savedPrices.has(String(row.Model).trim().toUpperCase()))row['Final Price (AED)']=savedPrices.get(String(row.Model).trim().toUpperCase());});
  vrvReprice();vrvDirty();
}
