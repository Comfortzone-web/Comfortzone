/* Four-step VRV presentation. Extraction, engineering and price calculations remain in app.js. */
let vrvBusy = false;
let vrvStatus = 'Draft — enter Project Name or upload a file';
let vrvThermalSearch = '';
const vrvSteps = ['Thermal Sheet & Extraction', 'VRV Selection Report', 'VRV Schedule', 'BOQ & Quotation'];
const vrvSelectionColumns = ['System','Name','FCU','°C - (DBT/WBT)','Rq TC','Max TC','Rq SC','Max SC','Air Flow Rate'];
const vrvSelectionDisplayRows = rows => rows.map(row => ({System:row.system || row.System || '',Name:row.name || row.Name || '',FCU:row.fcu || row.FCU || '','°C - (DBT/WBT)':row.tmpC || row['°C - (DBT/WBT)'] || '','Rq TC':row.rqTC || row['Rq TC'] || '','Max TC':row.maxTC || row['Max TC'] || '','Rq SC':row.rqSC || row['Rq SC'] || '','Max SC':row.maxSC || row['Max SC'] || '','Air Flow Rate':row.airFlowRate || row['Air Flow Rate'] || ''}));
const vrvDefaultCustomColumns = ['Unit Reference no.', 'Type', 'Location', 'Total Kw', 'Sensible Kw', 'Flow Rate L/s'];
const vrvIcon = name => `<img class="dx-icon" src="/assets/dx-icons/${name}.svg" alt="">`;
const vrvButton = (action, label, icon, primary = false) => `<button type="button" class="dx-button ${primary ? 'dx-primary' : ''}" data-vrv-action="${action}" ${vrvBusy ? 'disabled' : ''}>${icon ? vrvIcon(icon) : ''}${label}</button>`;
const vrvCard = (title, body, actions = '', extra = '') => `<section class="dx-card ${extra}"><div class="dx-card-heading"><h2>${title}</h2><div class="dx-actions">${actions}</div></div>${body}</section>`;
function vrvToolbarMenu(step) {
  const tableId = step === 1 ? 'thermal-table' : 'vrv-schedule';
  const locked = state.nodes.find(node => node.id === tableId)?.locked;
  const item = (action,label,icon) => vrvButton(action,label,icon);
  const options = step === 1
    ? item('lock',locked ? 'Unlock Table' : 'Lock Table','lock-keyhole') + item('menu-regenerate','Regenerate','refresh-cw') + item('clear-table','Clear Table','trash-2')
    : step === 2
      ? item('menu-regenerate','Regenerate','refresh-cw') + item('clear-table','Clear Table','trash-2')
      : step === 3
        ? item('schedule-excel','Download Excel','download') + item('schedule-pdf','Export PDF','file-text') + item('lock',locked ? 'Unlock Table' : 'Lock Table','lock-keyhole') + item('menu-regenerate','Regenerate','refresh-cw') + item('clear-table','Clear Table','trash-2')
        : item('sync-schedule','Synchronize Schedule','refresh-cw') + item('refresh-prices','Refresh Prices','download');
  return `<details class="dx-table-menu vrv-options-menu"><summary class="dx-button dx-menu-trigger" aria-label="Workflow options" title="Workflow options">${vrvIcon('ellipsis-vertical')}</summary><div class="dx-table-menu-panel">${options}</div></details>`;
}
function vrvData() {
  state.vrv ||= { step: 1, mode: 'regular', familyModel: 'FXMQ', customColumns: [], reportTab: 'system', margin: 20 };
  if (!state.vrv.customColumnsInitialized) {
    if (!state.vrv.customColumns?.length) state.vrv.customColumns = [...vrvDefaultCustomColumns];
    state.vrv.customColumnsInitialized = true;
  }
  state.vrv.capacitySource ||= 'Calculated AC Load';
  state.vrv.step = Math.max(1, Math.min(4, Number(state.vrv.step) || 1));
  const uploads = thermalUploadIds();
  state.vrv.selectedUploadIds ??= [...uploads];
  const known = state.vrv.knownUploadIds || uploads;
  for (const id of uploads) if (!known.includes(id) && !state.vrv.selectedUploadIds.includes(id)) state.vrv.selectedUploadIds.push(id);
  state.vrv.knownUploadIds = [...uploads];
  return state.vrv;
}
function vrvFiles(nodeId) {
  const ids = nodeId === 'thermal-upload' ? thermalUploadIds() : [state.nodes.find(node => node.id === nodeId)?.data?.uploadId];
  const files = ids.map(id => state.uploads.find(file => file.id === id)).filter(Boolean);
  return nodeId === 'thermal-upload' ? files.sort((a,b)=>String(a.originalName).localeCompare(String(b.originalName),undefined,{numeric:true,sensitivity:'base'})) : files;
}
function vrvFileList(nodeId) {
  const selected = vrvData().selectedUploadIds || [];
  return vrvFiles(nodeId).map(file => `<div class="vrv-file ${selected.includes(file.id) ? 'selected' : ''}">${nodeId === 'thermal-upload' ? `<input type="checkbox" data-vrv-file="${escapeHtml(file.id)}" aria-label="Select ${escapeHtml(file.originalName)}" ${selected.includes(file.id) ? 'checked' : ''}>` : ''}${vrvIcon(file.mimeType?.includes('pdf') ? 'file-text' : 'image')}<button type="button" class="vrv-filename" data-vrv-preview="${escapeHtml(file.id)}">${escapeHtml(file.originalName)}</button><small>${prettyBytes(file.size)}</small><button type="button" data-vrv-remove="${escapeHtml(file.id)}" aria-label="Remove ${escapeHtml(file.originalName)}">×</button></div>`).join('');
}
function vrvUploadCard(nodeId, title, types) {
  const thermal = nodeId === 'thermal-upload';
  const files = vrvFiles(nodeId);
  const selected = (vrvData().selectedUploadIds || []).filter(id => files.some(file => file.id === id)).length;
  const tools = thermal ? `<div class="dx-file-tools"><button type="button" data-vrv-action="select-all">☑ Select All</button><button type="button" data-vrv-action="clear-selection">Clear Selection</button><span>${selected} files selected</span></div>` : '';
  const actions = thermal ? `<div class="dx-actions dx-upload-actions">${vrvButton('upload-files','Upload Files','upload',true)}${vrvButton('preview-selected','Preview','eye')}</div>` : '';
  const capacitySource = thermal ? `<label class="dx-capacity-source">Load columns to read<select data-vrv-capacity-source ${vrvBusy ? 'disabled' : ''}>${['Calculated AC Load','First Selection','Second Selection'].map(source=>`<option value="${source}" ${vrvData().capacitySource===source?'selected':''}>${source}</option>`).join('')}</select></label>` : '';
  return vrvCard(`${vrvIcon('upload')} ${title}`, `<button type="button" class="vrv-drop" data-vrv-pick="${nodeId}">${vrvIcon('cloud-upload')}<b>Drag & drop files here, or click to upload</b><small>Upload ${types}</small></button>${tools}<div class="vrv-files">${vrvFileList(nodeId) || '<div class="dx-empty">No files uploaded yet.</div>'}</div>${actions}${capacitySource}`,'','vrv-upload-card');
}
function vrvTable(key, rows = [], columns = []) {
  const node = state.nodes.find(item => item.id === (key === 'thermal' ? 'thermal-table' : 'vrv-schedule'));
  const schedule = key === 'vrvSchedule';
  const standard = key === 'thermal' && columns.length === defaultThermalColumns.length && columns.every((col,index)=>col===defaultThermalColumns[index]);
  const standardWidths = [90,110,70,155,85,85,85,95,95,85,105];
  const colgroup = standard ? `<colgroup>${standardWidths.map(width=>`<col style="width:${width}px">`).join('')}</colgroup>` : '';
  const groups = schedule && columns.length >= 6 ? `<tr class="vrv-group-head"><th colspan="6" class="vrv-specified">SPECIFIED</th><th colspan="${Math.max(1,Math.min(columns.length-6,14))}" class="vrv-proposed">PROPOSED INDOOR UNITS</th>${columns.length>20?`<th colspan="${columns.length-20}" class="vrv-proposed">PROPOSED OUTDOOR UNITS</th>`:''}</tr>` : '';
  const header = `<thead>${groups}<tr>${columns.map((col,index) => `<th class="${schedule ? index < 6 ? 'vrv-specified' : 'vrv-proposed' : ''}">${escapeHtml(col)}</th>`).join('')}</tr></thead>`;
  const body = rows.length ? rows.map((row, index) => `<tr data-vrv-row="${index}" class="${row.__rowType === 'project-total' ? 'project-total-row' : tableRowClass(row)}">${columns.map(col => `<td data-vrv-cell="${key}" data-row="${index}" data-col="${escapeHtml(col)}" class="${tableCellNeedsReview(row,col) ? 'needs-review-cell' : ''}" contenteditable="${key !== 'report' && !node?.locked && !isGeneratedTableRow(row)}">${escapeHtml(row[col] ?? '')}</td>`).join('')}</tr>`).join('')
    : schedule ? Array.from({length:6},()=>`<tr class="vrv-placeholder-row">${columns.map(()=>'<td></td>').join('')}</tr>`).join('')
    : '';
  const empty = !rows.length && !schedule ? `<div class="vrv-empty-panel"><div class="dx-table-empty">${vrvIcon('table-2')}<strong>${key === 'thermal' ? 'Your thermal data will appear here' : 'No VRV report data extracted yet.'}</strong><span>${key === 'thermal' ? 'Upload and extract thermal sheets to begin.' : 'Upload and extract a VRV Selection Report to begin.'}</span></div></div>` : '';
  return `<div class="vrv-table-scroll"><table class="vrv-table ${schedule ? 'vrv-schedule-table' : key === 'thermal' ? 'vrv-thermal-table' : ''} ${standard ? 'vrv-standard-table' : ''}">${colgroup}${header}<tbody>${body}</tbody></table>${empty}</div>`;
}
function vrvStepOne() {
  const data = vrvData(), table = state.tables.thermal;
  const columns = data.mode === 'custom' ? (data.extractedMode === 'custom' ? table.columns : data.customColumns) : defaultThermalColumns;
  const mode = `<div class="vrv-switch">${vrvButton('standard','Standard VRV Export','table-2',data.mode !== 'custom')}${vrvButton('custom','Custom Columns','table-2',data.mode === 'custom')}</div>`;
  const family = `<label class="vrv-control">Family / Model <span class="required">*</span><select data-vrv-family>${['FXMQ','FXAQ','FXFQ','FXSQ','Others'].map(value => `<option ${data.familyModel === value ? 'selected' : ''}>${value}</option>`).join('')}</select></label>${data.familyModel === 'Others' ? `<input data-vrv-other placeholder="Enter family or model" value="${escapeHtml(data.otherFamily || '')}">` : ''}`;
  const tags = `<label class="vrv-control">Extract Columns<div class="vrv-tokens">${data.customColumns.map((column,index)=>`<span>${escapeHtml(column)}<button type="button" data-vrv-tag="${index}" aria-label="Remove ${escapeHtml(column)}">×</button></span>`).join('')}<input data-vrv-token-input placeholder="Type a column, then press comma"></div></label>`;
  const controls = vrvCard(`${vrvIcon('layers-3')} Extraction Type`, `${mode}${data.mode === 'custom' ? tags : family}<div class="vrv-control-actions">${vrvButton('extract','Extract Data','play',true)}${vrvButton('append','Append Pages','file-plus-2')}</div>`);
  const flags = table.rows.reduce((sum,row)=>sum+Object.keys(row.__reviewCells || {}).length,0);
  const exportCard = vrvCard(`${vrvIcon('table-2')} Export File`, `<div class="vrv-data-toolbar"><div class="vrv-badges"><span>${vrvIcon('table-2')}${table.rows.length} rows extracted</span><span>${flags} cells flagged</span><span>${table.rows.length ? 'Extraction ready' : 'Awaiting extraction'}</span></div><input class="dx-search" data-vrv-search aria-label="Search extracted rows" placeholder="Search extracted rows…" value="${escapeHtml(vrvThermalSearch)}"></div>${vrvTable('thermal',table.rows,columns)}`,vrvButton('thermal-excel','Download Excel','download'),'vrv-main-table vrv-thermal-card');
  return `<div class="vrv-two-col vrv-step-one-grid"><div class="vrv-left">${vrvUploadCard('thermal-upload','Thermal Sheet Upload','PDF, DOC, DOCX, XLS, XLSX, PNG, JPG')}${controls}</div>${exportCard}</div>`;
}
function vrvStepTwo() {
  const data = vrvData(), extracted = state.extracted?.vrv || {};
  const tab = ['system','outdoor','material'].includes(data.reportTab) ? data.reportTab : 'system';
  const rows = tab === 'system' ? vrvSelectionDisplayRows(extracted.vrvRows || []) : tab === 'outdoor' ? extracted.outdoorDetailsRows || [] : extracted.materialRows || [];
  const columns = tab === 'system' ? vrvSelectionColumns : tab === 'outdoor' ? ['Name','Model','CR','PS'] : [...new Set(rows.flatMap(row => Object.keys(row).filter(key => !key.startsWith('__'))))];
  const note = `<div class="vrv-note">Automatic structured extraction works for DOCX and XML files. PDF or image uploads may not produce structured rows.</div>`;
  const actions = `<div class="vrv-control-actions">${vrvButton('report-extract','Extract VRV Report','play',true)}${vrvButton('report-rebuild','Rebuild Tables','refresh-cw')}</div>`;
  const tabs = `<div class="vrv-switch vrv-report-tabs">${vrvButton('report-system',`System / Selection (${(extracted.vrvRows || []).length})`,'table-2',tab==='system')}${vrvButton('report-outdoor',`Outdoor Details (${(extracted.outdoorDetailsRows || []).length})`,'table-2',tab==='outdoor')}${vrvButton('report-material',`Material / BOQ (${(extracted.materialRows || []).length})`,'layers-3',tab==='material')}</div>`;
  return `<div class="vrv-two-col"><div class="vrv-left">${vrvUploadCard('vrv-upload','VRV Selection Report Upload','DOCX, XML, PDF, DOC, XLS, XLSX, PNG, JPG')}${note}${actions}</div>${vrvCard(`${vrvIcon('layers-3')} Extracted VRV Report`,`${tabs}${vrvTable('report',rows,columns.length ? columns : ['System','Name','FCU'])}`,vrvButton('report-excel','Download Excel','download'),`vrv-main-table ${tab==='system'?'vrv-selection-report':''}`)}</div>`;
}
function vrvScheduleRows() { return state.tables.vrvSchedule?.rows || []; }
function vrvStepThree() {
  if (state.tables.vrvSchedule?.rows?.length) rebuildVrvScheduleTotals();
  const rows = vrvScheduleRows(), cols = state.tables.vrvSchedule?.columns || [];
  const normal = rows.filter(row => !isGeneratedTableRow(row) && Object.values(row).some(Boolean));
  const systems = new Set(normal.map(row => row.System).filter(Boolean));
  const indoor = normal.filter(row => row.FCU).length;
  const outdoor = new Set(normal.map(row => row['Outdoor Unit'] || row['Outdoor Model']).filter(Boolean)).size;
  const badges = `<div class="vrv-badges"><span>Total Systems: ${systems.size}</span><span>Total Indoor: ${indoor}</span><span>Total Outdoor: ${outdoor}</span></div>`;
  const totals = Object.fromEntries(cols.map(col=>[col,'']));
  totals.System='Project Total';totals.__rowType='project-total';
  for(const col of VRV_SYSTEM_TOTAL_COLUMNS)if(cols.includes(col))totals[col]=vrvScheduleTotalValue(normal,col);
  return vrvCard(`${vrvIcon('table-2')} VRV Schedule`, `<p class="vrv-subtitle">System-wise schedule with matched thermal data and equipment selection.</p>${badges}${vrvTable('vrvSchedule',rows.length?[...rows,totals]:rows,cols)}<p class="vrv-help">Scroll horizontally to view all indoor and outdoor equipment columns.</p>`,'','vrv-schedule-card');
}
function vrvMoney(value) { return `AED ${Number(value || 0).toLocaleString('en-AE',{minimumFractionDigits:2,maximumFractionDigits:2})}`; }
function vrvBoqRows() { return state.tables.costing?.rows || []; }
function vrvUnitPriceCell(row,index) {
  const listed = workflowCostingPriceItems().find(item => norm(item.model) === norm(row.Model) && num(item.finalPrice) > 0);
  if (listed) return vrvMoney(row['Final Price (AED)']);
  return `<button type="button" class="vrv-unit-price-display" data-vrv-unit-price-open="${index}" aria-label="Edit Unit Price for ${escapeHtml(row.Model || `row ${index+1}`)}">${vrvMoney(row['Final Price (AED)'])}</button>`;
}
function vrvRenderKeepingScroll() {
  const view = document.querySelector('#canvasView');
  const top = view?.scrollTop || 0, left = view?.scrollLeft || 0;
  const oldTable = canvas.querySelector('.vrv-boq-card .vrv-table-scroll');
  const tableTop = oldTable?.scrollTop || 0, tableLeft = oldTable?.scrollLeft || 0;
  renderVrvWorkspace();
  if (view) { view.scrollTop=top; view.scrollLeft=left; }
  const table = canvas.querySelector('.vrv-boq-card .vrv-table-scroll');
  if (table) { table.scrollTop=tableTop; table.scrollLeft=tableLeft; }
}
function vrvStepFour() {
  const data = vrvData(), rows = vrvBoqRows();
  const margin = Math.min(99.99,Math.max(0,Number(data.margin) || 0));
  const cost = rows.reduce((sum,row)=>sum+Number(row['Final Price (AED)'] || 0)*Number(row.Qty || 0),0);
  const selling = rows.reduce((sum,row)=>sum+Number(row['Increased Final Price (AED)'] || 0)*Number(row.Qty || 0),0);
  const vat = selling*0.05;
  const tr = rows.map((row,index)=>`<tr><td>${index+1}</td><td><b contenteditable="true" data-vrv-price="Model" data-row="${index}">${escapeHtml(row.Model || '')}</b><small>${escapeHtml((state.tables.boq.rows[index] || {}).Description || '')}</small></td><td contenteditable="true" data-vrv-price="Qty" data-row="${index}">${escapeHtml(row.Qty ?? '')}</td><td>Nos</td><td>${vrvUnitPriceCell(row,index)}</td><td>${vrvMoney(row['Increased Final Price (AED)'])}</td><td><b>${vrvMoney(row['Amount (AED)'])}</b><button type="button" class="vrv-delete-row" data-vrv-delete="${index}" aria-label="Delete row ${index+1}">×</button></td></tr>`).join('');
  const summary = [['Total Cost',cost],['Total Selling',selling],['Overall Margin',`${margin.toFixed(2)} %`],['VAT (5%)',vat],['Net Amount (Incl. VAT)',selling+vat]].map(([name,value])=>`<div><small>${name}</small><strong>${typeof value === 'string' ? value : vrvMoney(value)}</strong></div>`).join('');
  return vrvCard(`${vrvIcon('clipboard-list')} BOQ & Quotation`,`<p class="vrv-subtitle">Material BOQ and pricing from the VRV Selection Report.</p><div class="vrv-boq-tools"><span>${rows.length} items from VRV Report</span><label>Overall Profit Margin <span class="vrv-percent"><input data-vrv-margin inputmode="decimal" value="${margin.toFixed(2)}">%</span></label>${vrvButton('add-row','Add Row','plus')}</div><div class="vrv-table-scroll"><table class="vrv-table"><thead><tr>${['Ref','Description / Model','Qty','Unit','Unit Price','Selling Price','Line Total'].map(col=>`<th>${col}</th>`).join('')}</tr></thead><tbody>${tr || '<tr><td colspan="7" class="vrv-empty">Extract a VRV Selection Report to populate the BOQ.</td></tr>'}</tbody></table></div><div class="vrv-kpis">${summary}</div>`,'','vrv-boq-card');
}
function renderVrvWorkspace() {
  const data=vrvData(), step=data.step;
  canvas.classList.add('dx-workspace','vrv-workspace'); canvas.style.cssText='';
  setWorkflowTitle('VRV Workflow'); $('#projectMeta').textContent=vrvSteps[step-1];
  document.querySelector('.top-actions:not(#viewActions)')?.classList.add('hidden');
  const actions=$('#viewActions'); actions.classList.remove('hidden');
  actions.innerHTML=`${vrvButton('new','New Workflow','plus')}${vrvToolbarMenu(step)}`;
  const fields=[['selectionNumber','Selection No.','clipboard-list'],['project','Project Name','briefcase-business'],['customer','Client','users-round'],['consultant','Consultant','hard-hat'],['contractor','Contractor','building-2']];
  canvas.innerHTML=`<div class="dx-project-header dx-card">${fields.map(([key,label,icon])=>`<label>${vrvIcon(icon)}<span>${label}<input ${key==='selectionNumber'?'data-vrv-number':`data-vrv-detail="${key}" data-detail-key="${key}"`} value="${escapeHtml(key==='selectionNumber' ? state.selectionNumber || 'Assigning…' : state.details[key] || '')}"></span></label>`).join('')}</div><nav class="dx-steps vrv-steps" aria-label="VRV workflow progress">${vrvSteps.map((name,index)=>`<button type="button" data-vrv-step="${index+1}" class="${step===index+1?'active':''} ${index+1<step?'complete':''}" ${step===index+1?'aria-current="step"':''}><span>${index+1<step?'✓':index+1}</span>Step 0${index+1} — ${name}</button>`).join('')}</nav>${step===1?vrvStepOne():step===2?vrvStepTwo():step===3?vrvStepThree():vrvStepFour()}<footer class="dx-footer"><span data-vrv-status>${escapeHtml(vrvStatus)}</span><div class="dx-actions">${step>1?vrvButton('back',`Back to ${vrvSteps[step-2]}`,'arrow-left'):''}${vrvButton(step<4?'next':'quotation',step<4?`Continue to ${vrvSteps[step]}`:'Create Quotation',step<4?'arrow-right':'file-text',true)}</div></footer>`;
  if (state.selectionNumber) canvas.querySelector('[data-vrv-number]').value = state.selectionNumber;
  canvas.querySelector('[data-vrv-number]')?.addEventListener('change',event=>{const value=event.target.value.trim();if(!value){event.target.value=state.selectionNumber||'';return;}state.selectionNumber=value;vrvDirty();});
  canvas.querySelectorAll('[data-vrv-detail]').forEach(input=>input.addEventListener('input',()=>{state.details[input.dataset.vrvDetail]=input.value;if(input.dataset.vrvDetail==='project')state.title=input.value;vrvDirty();}));
  canvas.querySelector('[data-vrv-capacity-source]')?.addEventListener('change',event=>{data.capacitySource=event.target.value;vrvDirty();});
  document.querySelectorAll('[data-vrv-action]').forEach(button=>button.addEventListener('click',()=>{
    button.closest('details.dx-table-menu')?.removeAttribute('open');
    Promise.resolve(vrvAction(button.dataset.vrvAction)).catch(error=>toast(error.message || 'VRV action failed'));
  }));
  canvas.querySelectorAll('[data-vrv-step]').forEach(button=>{
    const goToStep=()=>{
      const nextStep=Number(button.dataset.vrvStep);
      if(data.step===nextStep)return;
      const active=document.activeElement;
      if(active && canvas.contains(active))active.blur();
      data.step=nextStep;vrvDirty();renderVrvWorkspace();
    };
    button.addEventListener('pointerdown',event=>{
      if(event.button!==0)return;
      event.preventDefault();
      goToStep();
    });
    button.addEventListener('click',event=>{if(event.detail===0)goToStep();});
  });
  canvas.querySelectorAll('[data-vrv-pick]').forEach(button=>{button.addEventListener('click',()=>{if(button.dataset.vrvPick!=='thermal-upload')return chooseUpload(button.dataset.vrvPick);const input=document.createElement('input');input.type='file';input.multiple=true;input.accept='.pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg';input.addEventListener('change',()=>vrvUploadFiles('thermal-upload',[...input.files]));input.click();});button.addEventListener('dragover',event=>event.preventDefault());button.addEventListener('drop',event=>{event.preventDefault();vrvUploadFiles(button.dataset.vrvPick,[...event.dataTransfer.files]);});});
  canvas.querySelectorAll('[data-vrv-preview]').forEach(button=>button.addEventListener('click',()=>window.open(`/api/projects/${state.id}/uploads/${button.dataset.vrvPreview}`,'_blank')));
  canvas.querySelectorAll('[data-vrv-remove]').forEach(button=>button.addEventListener('click',()=>vrvRemoveUpload(button.dataset.vrvRemove)));
  canvas.querySelectorAll('[data-vrv-file]').forEach(input=>input.addEventListener('change',()=>{const ids=new Set(data.selectedUploadIds || []);if(input.checked)ids.add(input.dataset.vrvFile);else ids.delete(input.dataset.vrvFile);data.selectedUploadIds=[...ids];renderVrvWorkspace();}));
  const search=canvas.querySelector('[data-vrv-search]');
  if(search){const filter=()=>canvas.querySelectorAll('.vrv-thermal-table tbody tr[data-vrv-row]').forEach(row=>{row.hidden=!row.textContent.toLowerCase().includes(vrvThermalSearch.toLowerCase());});search.addEventListener('input',()=>{vrvThermalSearch=search.value;filter();});filter();}
  canvas.querySelector('[data-vrv-family]')?.addEventListener('change',event=>{const selected=event.currentTarget.value;state.vrv.familyModel=selected;vrvDirty();if(selected==='Others'||data.otherFamily)renderVrvWorkspace();});
  canvas.querySelector('[data-vrv-other]')?.addEventListener('input',event=>{data.otherFamily=event.target.value;vrvDirty();});
  const tokenInput=canvas.querySelector('[data-vrv-token-input]');
  const addTokens=()=>{const values=tokenInput.value.split(',').map(value=>value.trim()).filter(Boolean);if(!values.length)return;for(const value of values)if(!data.customColumns.some(col=>col.toLowerCase()===value.toLowerCase()))data.customColumns.push(value);vrvDirty();renderVrvWorkspace();canvas.querySelector('[data-vrv-token-input]')?.focus();};
  tokenInput?.addEventListener('keydown',event=>{if(event.key!==',' && event.key!=='Enter')return;event.preventDefault();event.stopPropagation();addTokens();});
  tokenInput?.addEventListener('input',()=>{if(tokenInput.value.includes(','))addTokens();});
  canvas.querySelectorAll('[data-vrv-tag]').forEach(button=>button.addEventListener('click',()=>{data.customColumns.splice(Number(button.dataset.vrvTag),1);vrvDirty();renderVrvWorkspace();}));
  canvas.querySelectorAll('[data-vrv-cell][contenteditable="true"]').forEach(cell=>cell.addEventListener('blur',()=>{const table=state.tables[cell.dataset.vrvCell],row=table.rows[Number(cell.dataset.row)];row[cell.dataset.col]=cell.textContent.trim();clearTableCellReview(row,cell.dataset.col);if(cell.dataset.vrvCell==='thermal')buildWorkflowScheduleFromThermal();else {fillVrvScheduleLookups();rebuildVrvScheduleTotals();}vrvDirty();renderVrvWorkspace();}));
  canvas.querySelector('[data-vrv-margin]')?.addEventListener('change',event=>{data.margin=Math.min(99.99,Math.max(0,Number(event.target.value)||0));vrvReprice();vrvDirty();renderVrvWorkspace();});
  canvas.querySelectorAll('[data-vrv-price]').forEach(cell=>cell.addEventListener('blur',()=>{const row=state.tables.costing.rows[Number(cell.dataset.row)];if(cell.dataset.vrvPrice==='Qty')row.Qty=Math.max(0,Math.floor(Number(cell.textContent)||0));else {row.Model=cell.textContent.trim();row['Final Price (AED)']='';}vrvReprice();vrvDirty();renderVrvWorkspace();}));
  canvas.querySelectorAll('[data-vrv-unit-price-open]').forEach(button=>button.addEventListener('click',()=>{
    const index=Number(button.dataset.vrvUnitPriceOpen), row=state.tables.costing.rows[index];
    if(!row)return;
    const input=document.createElement('input');
    input.className='vrv-manual-unit-price';input.type='text';input.inputMode='decimal';
    input.setAttribute('aria-label',button.getAttribute('aria-label'));
    input.value=row['Final Price (AED)'] === '' ? '' : String(row['Final Price (AED)'] ?? '');
    button.replaceWith(input);input.focus({preventScroll:true});input.select();
    input.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();input.blur();}else if(event.key==='Escape'){event.preventDefault();vrvRenderKeepingScroll();}});
    input.addEventListener('blur',()=>{
      const raw=input.value.trim().replace(/,/g,'');
      if(raw && !/^\d+(?:\.\d{1,2})?$/.test(raw)){toast('Enter a valid Unit Price with up to two decimal places.');vrvRenderKeepingScroll();return;}
      const value=raw ? round2(Number(raw)) : '';
      if(value!==row['Final Price (AED)']){row['Final Price (AED)']=value;vrvReprice();vrvDirty();}
      vrvRenderKeepingScroll();
    },{once:true});
  }));
  canvas.querySelectorAll('[data-vrv-delete]').forEach(button=>button.addEventListener('click',()=>{state.tables.costing.rows.splice(Number(button.dataset.vrvDelete),1);vrvReprice();vrvDirty();renderVrvWorkspace();}));
}
function vrvDirty() { projectTouched=true;vrvStatus='Unsaved changes';const label=canvas.querySelector('[data-vrv-status]');if(label)label.textContent=vrvStatus;scheduleProjectSave(); }
function vrvReprice() { const margin=Number(vrvData().margin)||0;state.tables.costing.summary.priceIncrease=margin;state.tables.costing.rows.forEach(row=>{row['Increased Final Price (AED)']='';});recalcCosting();buildBoqFromCosting(); }
async function vrvRemoveUpload(id) { if(!confirm('Remove this uploaded file?'))return;state.uploads=state.uploads.filter(file=>file.id!==id);state.thermalChatUploadIds=(state.thermalChatUploadIds||[]).filter(value=>value!==id);for(const node of state.nodes)if(node.data?.uploadId===id)delete node.data.uploadId;vrvDirty();renderVrvWorkspace();saveProject(); }
async function vrvUploadFiles(nodeId,files) { for(const file of files){try{await ensureProjectSaved({hidden:true});const form=new FormData();form.append('nodeId',nodeId);form.append('file',await workflowUploadFileForNode(nodeId,file));const upload=await api(`/api/projects/${state.id}/uploads`,{method:'POST',body:form});state.uploads.push(upload);const node=state.nodes.find(node=>node.id===nodeId);if(node)node.data.uploadId=upload.id;if(nodeId==='thermal-upload')state.thermalChatUploadIds=[...new Set([...thermalUploadIds(),upload.id])];vrvDirty();await saveProject();}catch(error){toast(error.message||'Upload failed');}}renderVrvWorkspace(); }
function vrvExportSchedulePdf() {
  const table=state.tables.vrvSchedule;
  if(!table?.rows?.length)return toast('Generate a VRV Schedule before exporting PDF.');
  const popup=window.open('','_blank');
  if(!popup)return toast('Allow pop-ups to export the VRV Schedule PDF.');
  const columns=table.columns || [];
  const cells=table.rows.filter(row=>row.__rowType!=='separator').map(row=>`<tr>${columns.map(col=>`<td>${escapeHtml(row[col] ?? '')}</td>`).join('')}</tr>`).join('');
  popup.document.write(`<!doctype html><html><head><title>VRV Schedule</title><style>@page{size:A3 landscape;margin:10mm}body{font:10px Arial,sans-serif;color:#142340}h1{font-size:18px}p{font-size:11px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #cdd8e9;padding:4px;text-align:center}th{background:#d9e8ff}tr{break-inside:avoid}</style></head><body><h1>VRV Schedule</h1><p>${escapeHtml(state.details.project || '')} ${escapeHtml(state.selectionNumber || '')}</p><table><thead><tr>${columns.map(col=>`<th>${escapeHtml(col)}</th>`).join('')}</tr></thead><tbody>${cells}</tbody></table></body></html>`);
  popup.document.close();
  popup.focus();
  setTimeout(()=>popup.print(),250);
}
async function vrvExtract(append) {
  const data=vrvData(), ids=vrvFiles('thermal-upload').map(file=>file.id).filter(id=>data.selectedUploadIds.includes(id));if(!ids.length)return toast('Select at least one uploaded thermal sheet.');
  const columns=data.customColumns;
  if(data.mode==='custom' && !columns.length)return toast('Add at least one column to extract.');
  vrvBusy=true;renderVrvWorkspace();
  try {
    await ensureProjectSaved({hidden:true});
    const selection={mode:data.mode,familyModel:data.familyModel==='Others'?data.otherFamily:data.familyModel,capacitySource:data.capacitySource,customInstruction:data.mode==='custom'?`Extract only these columns in this order: ${columns.join(', ')}.`:'',appendResults:append,uploadIds:ids};
    thermalChatSelection={...thermalChatSelection,...selection};state.thermalChatSelection={...selection};
    const result=await scanThermal(false,selection);
    const source=result.rows?.length ? result.rows : (result.customRows||[]).map(row=>Object.fromEntries((result.customColumns||columns).map((col,index)=>[col,Array.isArray(row)?row[index]:row[col]])));
    const incoming=applyExtractionReviewCells(source,result.rows?.length?result.reviewCells:result.customReviewCells);
    const nextColumns=data.mode==='custom' ? (result.customColumns?.length?result.customColumns:columns) : defaultThermalColumns;
    if(append && state.tables.thermal.rows.length && JSON.stringify(state.tables.thermal.columns)!==JSON.stringify(nextColumns))throw new Error('Append requires the same columns as the existing Export File.');
    state.tables.thermal.columns=[...nextColumns];state.tables.thermal.rows=append?[...state.tables.thermal.rows,...incoming]:incoming;
    data.extractedMode=data.mode;
    buildWorkflowScheduleFromThermal();vrvDirty();await saveProject();toast(result.message||`Extracted ${incoming.length} rows.`);
  }catch(error){toast(error.message||'Thermal extraction failed');}finally{vrvBusy=false;renderVrvWorkspace();}
}
async function vrvAction(action) {
  const data=vrvData();
  if(action==='schedule-pdf')return vrvExportSchedulePdf();
  if(action==='lock'){
    const id=data.step===1?'thermal-table':'vrv-schedule';
    const node=state.nodes.find(item=>item.id===id);
    if(node){node.locked=!node.locked;vrvDirty();renderVrvWorkspace();}
    return;
  }
  if(action==='clear-table'){
    if(!confirm('Clear the current VRV table? This removes its extracted and edited rows.'))return;
    if(data.step===1)state.tables.thermal.rows=[];
    else if(data.step===2){state.extracted ||= {};state.extracted.vrv={};state.tables.vrvSchedule.rows=[];state.tables.costing.rows=[];state.tables.boq.rows=[];}
    else state.tables.vrvSchedule.rows=[];
    vrvDirty();renderVrvWorkspace();return;
  }
  if(action==='menu-regenerate')return data.step===1?vrvExtract(false):vrvAction(data.step===2?'report-extract':'regenerate');
  if(action==='sync-schedule')return vrvAction('regenerate');
  if(action==='refresh-prices')return ensureWorkflowCostingPriceList().then(()=>{vrvReprice();vrvDirty();renderVrvWorkspace();});
  if(action==='upload-files')return canvas.querySelector('[data-vrv-pick="thermal-upload"]')?.click();
  if(action==='select-all'||action==='clear-selection'){data.selectedUploadIds=action==='select-all'?vrvFiles('thermal-upload').map(file=>file.id):[];renderVrvWorkspace();return;}
  if(action==='preview-files'||action==='preview-selected'){
    const files=vrvFiles('thermal-upload');
    const selected=action==='preview-selected'?files.filter(file=>(data.selectedUploadIds||[]).includes(file.id)):files;
    if(!selected.length)return toast('Select a thermal sheet to preview.');
    selected.forEach(file=>window.open(`/api/projects/${state.id}/uploads/${file.id}`,'_blank'));
    return;
  }
  if(action==='new')return createProject({workflowMode:'vrv',fresh:true});
  if(action==='save'){await saveProject({manual:true});vrvStatus='All changes saved';renderVrvWorkspace();return;}
  if(action==='back'||action==='next'){data.step+=action==='back'?-1:1;vrvDirty();renderVrvWorkspace();return;}
  if(action==='standard'||action==='custom'){data.mode=action==='custom'?'custom':'regular';vrvDirty();renderVrvWorkspace();return;}
  if(action==='extract'||action==='append')return vrvExtract(action==='append');
  if(action==='report-system'||action==='report-outdoor'||action==='report-material'){data.reportTab=action==='report-system'?'system':action==='report-outdoor'?'outdoor':'material';renderVrvWorkspace();return;}
  if(action==='thermal-excel'||action==='schedule-excel')return downloadTable(action==='thermal-excel'?'thermal':'vrvSchedule');
  if(action==='report-excel'){
    const rows=data.reportTab==='material' ? state.extracted?.vrv?.materialRows || [] : data.reportTab==='outdoor' ? state.extracted?.vrv?.outdoorDetailsRows || [] : vrvSelectionDisplayRows(state.extracted?.vrv?.vrvRows || []);
    const columns=data.reportTab==='material' ? [...new Set(rows.flatMap(row=>Object.keys(row).filter(key=>!key.startsWith('__'))))] : data.reportTab==='outdoor' ? ['Name','Model','CR','PS'] : vrvSelectionColumns;
    return downloadBlob(buildTableWorkbookBlob({title:'VRV Selection Report',columns,rows}),'VRV Selection Report.xlsx');
  }
  if(action==='report-extract'||action==='report-rebuild'||action==='regenerate'){
    vrvBusy=true;renderVrvWorkspace();try{if(action==='report-extract'){const id=state.nodes.find(node=>node.id==='vrv-upload')?.data?.uploadId;if(!id)throw new Error('Upload a VRV Selection Report first.');await extractVrvUpload(id);}else await generateWorkflow();vrvDirty();await saveProject();}catch(error){toast(error.message||'Could not build VRV tables');}finally{vrvBusy=false;renderVrvWorkspace();}return;
  }
  if(action==='add-row'){state.tables.costing.rows.push({Model:'',Qty:1,'Final Price (AED)':'','Increased Final Price (AED)':'','Amount (AED)':''});vrvReprice();vrvDirty();renderVrvWorkspace();return;}
  if(action==='quotation'){await saveProject({manual:true});return createSalesQuotationFromWorkflow();}
}
