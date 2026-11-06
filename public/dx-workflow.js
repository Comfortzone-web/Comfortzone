/* DX presentation uses the existing project, uploads, extraction and engineering functions. */
let dxSaveTail = Promise.resolve();
let dxRevision = 0;
let dxSaveStatus = 'Draft';
let dxBusy = false;
let dxSearch = '';
let dxScheduleSearch = '';
let dxTimer;
let dxRenderedProjectId = '';
function dxData() {
  state.dx ||= { step: 1, reviewed: false, selectedUploadIds: thermalUploadIds(), match: { total: true, sensible: true, airflow: true, totalVariation: 0, sensibleVariation: 0, airflowVariation: 0 } };
  state.dx.autosaveEnabled ??= projectPersisted && state.visible !== false;
  return state.dx;
}
function dxIcon(name) { return `<img class="dx-icon" src="/assets/dx-icons/${name}.svg" alt="">`; }
function dxButton(action, label, icon, primary = false) {
  return `<button type="button" data-dx-action="${action}" class="dx-button ${primary ? 'dx-primary' : ''}" ${dxBusy ? 'disabled' : ''}>${icon ? dxIcon(icon) : ''}${label}</button>`;
}
function dxSetStatus(value) {
  dxSaveStatus = value;
  if (!isDxWorkflow()) return;
  document.querySelectorAll('[data-dx-save-status]').forEach(el => { el.textContent = value; el.dataset.dxSaveState = value; el.hidden = value === 'All changes saved' && dxData().step !== 3; });
}
function dxChanged(review = false) {
  ++dxRevision;
  const project = state;
  if (review) dxData().reviewed = false;
  dxSetStatus('Unsaved changes');
  clearTimeout(dxTimer);
  dxTimer = setTimeout(() => { if (state === project) dxSave().catch(() => {}); }, 600);
}
function dxHasSpecifiedValues() {
  return (state.tables?.thermal?.rows || []).some(row=>dxExportColumns.some(column=>String(row[column] ?? '').trim() !== ''));
}
async function dxSave(options = {}) {
  if (!state || !isDxWorkflow()) return;
  clearTimeout(dxTimer);
  const project = state;
  const data=dxData();
  if (data.boq) data.boq = DXBoq.calculate(DXBoq.syncQuantities(data.boq, project.tables.vrvSchedule.rows));
  if(options.manual || String(project.details.project || '').trim() || dxHasSpecifiedValues() || data.boq?.rows?.some(row=>row.model))data.autosaveEnabled=true;
  if(!data.autosaveEnabled && !options.storage) {dxSetStatus('Draft — enter Project Name or Specified values');return;}
  project.visible = !!data.autosaveEnabled;
  project.title = project.details.project || project.details.customer || 'DX Workflow';
  const revision = ++dxRevision;
  const snapshot = JSON.stringify(project);
  dxSetStatus('Saving…');
  const result = dxSaveTail.catch(() => {}).then(() => api(`/api/projects/${project.id}`, { method: 'PUT', body: snapshot }));
  dxSaveTail = result;
  try {
    const saved = await result;
    if (state === project) {
      if(!project.dx.selectionNumberEdited || revision===dxRevision) {
        project.selectionNumber=saved.selectionNumber;
        if(revision===dxRevision)project.dx.selectionNumberEdited=false;
        const input=document.querySelector('[data-dx-number]');if(input)input.value=saved.selectionNumber || '';
      }
      project.updatedAt = saved.updatedAt;
      projectPersisted = saved.visible !== false;
      projectTouched = false;
      if (revision === dxRevision) dxSetStatus(data.autosaveEnabled ? 'All changes saved' : 'Draft — enter Project Name or Specified values');
      document.querySelector('[data-dx-number]')?.setAttribute('value', saved.selectionNumber || '');
    }
    return saved;
  } catch (error) { if (state === project) dxSetStatus('Save failed — changes are not saved'); throw error; }
}
function dxValidateTypes(rows) {
  for (const row of rows) {
    if (/^(FCU|AHU|FAHU)$/i.test(String(row.Type || '').trim())) {
      row.__selectionWarning = `Source Type ${row.Type} was copied exactly. Review DX equipment compatibility separately; it is not an OCR correction.`;
      continue;
    }
    if (!/DUCT|WALL|SPLIT|DECORATIVE|PACKAGE|UATQ/i.test(row.Type || '')) {
      row.__reviewCells = {...row.__reviewCells, Type: {reason:'Unrecognized equipment type. Confirm its family before using the proposed selection.'}};
    }
  }
}
function dxFlagCount() { return state.tables.thermal.rows.reduce((sum, row) => sum + Object.keys(row.__reviewCells || {}).filter(column=>column !== 'Type').length, 0); }
function dxEnsureManualRows() {
  if (state.tables.thermal.rows.length || state.tables.vrvSchedule.rows.length) return;
  state.tables.thermal.rows = Array.from({length:6},()=>Object.fromEntries(dxExportColumns.map(column=>[column,''])));
  dxData().manualEntry = true;
  buildDxSchedule();
}
function dxCard(title, body, actions = '', className = '') { return `<section class="dx-card ${className}"><div class="dx-card-heading"><h2>${title}</h2><div class="dx-actions">${actions}</div></div>${body}</section>`; }
function renderDxWorkspace() {
  const data = dxData();
  const step = [2,3].includes(data.step) ? data.step : 1;
  const pageScroll = canvas.closest('.canvas-wrap');
  const oldTableScroll = canvas.querySelector('.dx-table-scroll');
  const sameTable = dxRenderedProjectId === state.id && !!oldTableScroll?.querySelector(step === 2 ? '.dx-selection-table' : '.dx-thermal-table');
  const scroll = { pageTop: sameTable ? pageScroll?.scrollTop || 0 : 0, pageLeft: sameTable ? pageScroll?.scrollLeft || 0 : 0,
    tableTop: sameTable ? oldTableScroll.scrollTop : 0, tableLeft: sameTable ? oldTableScroll.scrollLeft : 0 };
  const activeCell = sameTable && canvas.contains(document.activeElement) && document.activeElement.matches?.('[data-dx-cell]')
    ? { key: document.activeElement.dataset.key, row: document.activeElement.dataset.row, col: document.activeElement.dataset.col } : null;
  canvas.style.cssText = '';
  canvas.classList.add('dx-workspace');
  setWorkflowTitle('DX Workflow');
  $('#projectMeta').textContent = ['Thermal Sheet & Extraction','DX Schedule – Model Selection & Review','BOQ & Quotation'][step-1];
  document.querySelector('.top-actions:not(#viewActions)')?.classList.add('hidden');
  const headerActions = $('#viewActions');
  headerActions.classList.remove('hidden');
  headerActions.innerHTML = `${dxButton('new','New Workflow','plus')}${step === 3 ? dxBoqMenu() : step === 2 ? dxScheduleMenu() : dxThermalTableMenu()}`;
  headerActions.querySelectorAll('[data-dx-action]').forEach(dxBindAction);
  const fields = [['selectionNumber','Selection No.','clipboard-list'],['project','Project Name','briefcase-business'],['customer','Client','users-round'],['consultant','Consultant','hard-hat'],['contractor','Contractor','building-2']];
  canvas.innerHTML = `<div class="dx-project-header dx-card">${fields.map(([key,label,icon]) => `<label>${dxIcon(icon)}<span>${label}<input ${key === 'selectionNumber' ? 'data-dx-number data-dx-selection' : `data-dx-detail="${key}" data-detail-key="${key}"`} ${key === 'customer' ? 'list="workflowCustomerList"' : key === 'project' ? 'list="workflowProjectList"' : ''} value="${escapeHtml(key === 'selectionNumber' ? state.selectionNumber || 'Assigning…' : state.details[key] || '')}"></span></label>`).join('')}</div>
    <nav class="dx-steps" aria-label="Workflow progress">${[['back','Thermal Sheet & Extraction'],['continue','DX Schedule'],['boq','BOQ & Quotation']].map(([action,label],index)=>{const number=index+1,complete=number<step || (number<=(data.completedThrough || 0) && number!==step);return `<button data-dx-action="${action}" class="${step===number?'active':''} ${complete?'complete':''}" ${step===number?'aria-current="step"':''} ${dxBusy?'disabled':''}><span>${complete?'✓':number}</span>Step 0${number} — ${label}</button>`;}).join('')}</nav>
    ${step === 1 ? dxStepOne() : step === 2 ? dxStepTwo() : dxStepThree()}
    <footer class="dx-footer"><span data-dx-save-status data-dx-save-state="${escapeHtml(dxSaveStatus)}" ${dxSaveStatus === 'All changes saved' && step !== 3 ? 'hidden' : ''}>${escapeHtml(dxSaveStatus)}</span><div class="dx-actions">${step === 1 ? dxButton('continue','Continue to DX Schedule','arrow-right',true) : step === 2 ? dxButton('back','Back to Thermal Sheet','arrow-left')+dxButton('boq','Continue to BOQ & Quotation','arrow-right',true) : dxButton('back-schedule','Back to DX Schedule','arrow-left')+(data.boq?.quotationId ? dxButton('modify-quotation','Modify Quotation','refresh-cw') : '')+dxButton('quotation',data.boq?.quotationId ? 'Open Quotation' : 'Create Quotation','file-text',true)}</div></footer>`;
  canvas.appendChild(workflowDatalist('workflowCustomerList', workflowCustomerNames()));
  canvas.appendChild(workflowDatalist('workflowProjectList', workflowProjectsForCustomer(state.details.customer)));
  canvas.querySelectorAll('[data-dx-action]').forEach(dxBindAction);
  canvas.querySelector('[data-dx-selection]')?.addEventListener('change',event=>{
    state.selectionNumber=event.target.value.trim().toUpperCase();
    dxData().selectionNumberEdited=true;dxChanged();
  });
  canvas.querySelectorAll('[data-dx-detail]').forEach(input => input.addEventListener('input', () => {
    const key = input.dataset.dxDetail;
    state.details[key] = input.value;
    if (key === 'customer') { applyWorkflowCustomer(input.value, canvas); updateWorkflowProjectList(canvas); }
    if (key === 'project') applyWorkflowProject(input.value, canvas);
    dxChanged();
  }));
  canvas.querySelectorAll('[data-dx-file]').forEach(input => input.addEventListener('change', () => {
    const ids = new Set(data.selectedUploadIds);
    input.checked ? ids.add(input.dataset.dxFile) : ids.delete(input.dataset.dxFile);
    data.selectedUploadIds = [...ids]; dxChanged(); renderDxWorkspace();
  }));
  canvas.querySelectorAll('[data-dx-remove]').forEach(button => button.addEventListener('click', async () => {
    if (!confirm('Remove this uploaded file from the workflow? Existing extracted rows will remain.')) return;
    const id = button.dataset.dxRemove;
    state.uploads = state.uploads.filter(item => item.id !== id);
    state.thermalChatUploadIds = thermalUploadIds().filter(value => value !== id);
    state.nodes.forEach(node => { if (node.data?.uploadId === id) delete node.data.uploadId; });
    data.selectedUploadIds = data.selectedUploadIds.filter(value => value !== id);
    dxChanged(); renderDxWorkspace();
  }));
  canvas.querySelectorAll('[data-dx-preview]').forEach(button => button.addEventListener('click', () => dxPreview([button.dataset.dxPreview])));
  canvas.querySelector('[data-dx-search]')?.addEventListener('input', event => {
    dxSearch = event.target.value;
    canvas.querySelectorAll('[data-dx-thermal-row]').forEach(row => { row.hidden = !state.tables.thermal.rows[Number(row.dataset.dxThermalRow)] || !dxExportColumns.some(col => String(state.tables.thermal.rows[Number(row.dataset.dxThermalRow)][col] ?? '').toLowerCase().includes(dxSearch.toLowerCase())); });
  });
  if (step === 3) dxMountBoq();
  else {
    const tableNode = state.nodes.find(node => node.id === (step === 1 ? 'thermal-table' : 'vrv-schedule'));
    dxMountTable(step === 1 ? 'thermal' : 'vrvSchedule', tableNode);
  }
  canvas.querySelector('[data-dx-schedule-search]')?.addEventListener('input', event => {
    dxScheduleSearch = event.target.value;
    dxFilterScheduleRows();
    canvas.querySelector('.dx-table-scroll').scrollTop = 0;
  });
  dxFilterScheduleRows();
  if (activeCell) {
    [...canvas.querySelectorAll('[data-dx-cell]')].find(input => input.dataset.key === activeCell.key && input.dataset.row === activeCell.row && input.dataset.col === activeCell.col)?.focus({ preventScroll: true });
  }
  const tableScroll = canvas.querySelector('.dx-table-scroll');
  if (tableScroll) { tableScroll.scrollTop = scroll.tableTop; tableScroll.scrollLeft = scroll.tableLeft; }
  if (pageScroll) { pageScroll.scrollTop = scroll.pageTop; pageScroll.scrollLeft = scroll.pageLeft; }
  dxRenderedProjectId = state.id;
  canvas.querySelectorAll('[data-dx-match]').forEach(input => input.addEventListener('change', async () => {
    if (input.type === "number" && !input.checkValidity()) { input.reportValidity(); renderDxWorkspace(); return; }
    if (!dxConfirmRegenerate()) { renderDxWorkspace(); return; }
    data.match[input.dataset.dxMatch] = input.type === 'checkbox' ? input.checked : Number(input.value);
    buildDxSchedule(); dxChanged(); renderDxWorkspace();
  }));
  const drop = canvas.querySelector('.dx-drop');
  if (drop) { drop.addEventListener('dragover', event => event.preventDefault()); drop.addEventListener('drop', event => { event.preventDefault(); if (!dxBusy) dxUpload([...event.dataTransfer.files]); }); }
}
function dxThermalTableMenu() {
  const node = state.nodes.find(node => node.id === 'thermal-table');
  return `<details class="dx-table-menu"><summary class="dx-button dx-menu-trigger" aria-label="Thermal table options" title="Thermal table options">${dxIcon('ellipsis-vertical')}</summary><div class="dx-table-menu-panel">${dxButton('lock',node?.locked ? 'Unlock Table' : 'Lock Table','lock-keyhole')}${dxButton('extract','Regenerate','refresh-cw')}${dxButton('clear-table','Clear Table','trash-2')}</div></details>`;
}
function dxStepOne() {
  const data = dxData();
  const files = thermalUploadIds().map(findUpload).filter(Boolean).sort((a,b)=>String(a.originalName).localeCompare(String(b.originalName),undefined,{numeric:true,sensitivity:'base'}));
  const selected = files.filter(file => data.selectedUploadIds.includes(file.id)).length;
  return `<div class="dx-extraction-grid"><div class="dx-left">${dxCard(`${dxIcon('upload')}Thermal Sheet Upload`, `
    <button class="dx-drop" data-dx-action="upload" ${dxBusy ? 'disabled' : ''}>${dxIcon('cloud-upload')}<strong>Drag & drop files here, or click to upload</strong><span>Upload PDF, PNG, JPG</span></button>
    <div class="dx-file-tools"><button data-dx-action="select-all">☑ Select All</button><button data-dx-action="clear">Clear Selection</button><span>${selected} files selected for extraction</span></div>
    <div class="dx-files">${files.map(file => `<div class="dx-file ${data.selectedUploadIds.includes(file.id) ? 'selected' : ''}"><input aria-label="Select ${escapeHtml(file.originalName)}" type="checkbox" data-dx-file="${escapeHtml(file.id)}" ${data.selectedUploadIds.includes(file.id) ? 'checked' : ''} ${dxBusy ? 'disabled' : ''}>${dxIcon(file.mimeType?.includes('pdf') ? 'file-text' : 'image')}<button class="dx-filename" data-dx-preview="${escapeHtml(file.id)}">${escapeHtml(file.originalName)}</button><small>${(file.size / 1024 / 1024).toFixed(2)} MB</small><button data-dx-remove="${escapeHtml(file.id)}" aria-label="Remove file" ${dxBusy ? 'disabled' : ''}>×</button></div>`).join('') || '<div class="dx-empty">No thermal sheets uploaded yet.</div>'}</div>
    <div class="dx-actions dx-upload-actions">${dxButton('upload','Upload Files','upload',true)}${dxButton('preview','Preview','eye')}${dxButton('preview-selected','Preview Selected','files')}</div>`)}
    ${dxCard(`${dxIcon('sparkles')}Extraction Actions`, `<div class="dx-actions">${dxButton('extract',dxBusy ? 'Processing…' : 'Read & Extract Selected Files','play',true)}${dxButton('append','Append Selected Pages','file-plus-2')}</div><p class="dx-hint">Only checked files are read. Extracts Unit Ref, Type, Location, TKw, SKw, and L/S.</p>${data.extractionError ? `<p class="dx-error" role="alert">${escapeHtml(data.extractionError)}</p>` : ''}${data.extractionWarnings?.length ? `<p class="dx-hint">${escapeHtml(data.extractionWarnings.join('; '))}</p>` : ''}<div class="dx-checklist"><span><i class="dx-check-status ${files.length ? 'complete' : ''}">${files.length ? '✓' : ''}</i>Files uploaded</span><span><i class="dx-check-status ${selected ? 'complete' : ''}">${selected ? '✓' : ''}</i>Files selected (${selected} of ${files.length})</span><span><i class="dx-check-status ${data.lastExtracted ? 'complete' : ''}">${data.lastExtracted ? '✓' : ''}</i>Extraction ${dxBusy ? 'in progress…' : 'completed'}</span><span><i class="dx-check-status ${dxFlagCount() ? 'warning' : ''}">${dxFlagCount() ? '!' : ''}</i>${dxFlagCount() ? 'Review flagged cells' : 'Review extracted data before continuing'}</span></div>`)}
    </div>${dxCard(`${dxIcon('table-2')}Extracted Thermal Data`, `<div class="dx-data-toolbar"><div class="dx-badges"><span>${dxIcon('table-2')}${state.tables.thermal.rows.filter(row=>dxExportColumns.some(col=>String(row[col] ?? '').trim())).length} ${data.manualEntry ? 'rows entered' : 'rows extracted'}</span><span class="${dxFlagCount() ? 'warning' : ''}">${dxFlagCount()} cells flagged</span><span>${data.lastExtracted ? 'Last extracted ' + escapeHtml(new Date(data.lastExtracted).toLocaleString()) : 'Awaiting extraction'}</span></div><input class="dx-search" data-dx-search placeholder="Search extracted rows…" aria-label="Search extracted rows" value="${escapeHtml(dxSearch)}"></div><div data-dx-table></div>`, dxButton('thermal-excel','Download Excel','download'), 'dx-thermal-card')}</div>`;
}
function dxScheduleMenu() {
  const locked=state.nodes.find(node=>node.id==='vrv-schedule')?.locked;
  return `<details class="dx-table-menu dx-schedule-menu"><summary class="dx-button dx-menu-trigger" aria-label="Schedule options" title="Schedule options">${dxIcon('ellipsis-vertical')}</summary><div class="dx-table-menu-panel">${dxButton('schedule-excel','Download Excel','download')}${dxButton('pdf','Export PDF','file-text')}${dxButton('lock',locked ? 'Unlock Table' : 'Lock Table','lock-keyhole')}${dxButton('regenerate','Regenerate','refresh-cw')}${dxButton('clear-table','Clear Table','trash-2')}</div></details>`;
}
function dxStepTwo() {
  const data = dxData();
  const rows = state.tables.vrvSchedule.rows;
  rows.forEach(row=>{
    const item=dxProposalCatalog.find(item=>item.model===row['Model ( Indoor / Outdoor )']);
    if(row.__manualProposal && item)dxApplyCatalogItem(row,item);
    else if(!row.__manualProposal)applyDxProposal(row);
  });
  const total = col => rows.reduce((sum,row) => sum + dxNumber(row[col]),0);
  const proposedTotal = col => rows.reduce((sum,row) => sum + dxNumber(row[col]) * dxNumber(row.Qty),0);
  const values = [total('Qty'),proposedTotal('TC'),proposedTotal('SC'),proposedTotal('AFR L/S'),proposedTotal('NOMINAL TR')];
  const labels = ['Total Units','Total TKw','Total SKw','Total Airflow','Total Nominal TR'];
  return `<div class="dx-schedule-heading dx-card"><h2>${dxIcon('layout-grid')}DX Schedule</h2><div class="dx-matching"><b>Match</b>${[['total','TKw'],['sensible','SKw'],['airflow','L/S']].map(([key,label]) => `<label><input type="checkbox" data-dx-match="${key}" ${data.match[key] ? 'checked' : ''} ${key === 'total' ? 'disabled title="TKw is the baseline requirement"' : ''}>${label}</label>`).join('')}<b>Variation</b>${['total','sensible','airflow'].map(key => `<label class="dx-percent"><input type="number" min="0" max="99" step="any" aria-label="${key} variation percent" data-dx-match="${key+'Variation'}" value="${data.match[key+'Variation']}">%</label>`).join('')}</div><div class="dx-schedule-actions dx-actions"><input type="search" class="dx-search dx-schedule-search" data-dx-schedule-search placeholder="Search schedule..." aria-label="Search DX schedule" value="${escapeHtml(dxScheduleSearch)}">${dxButton('add-row','Add Row','plus')}</div></div>
    <section class="dx-card dx-schedule-card"><div data-dx-table></div><p class="dx-hint">Selection follows the Excel TKw baseline and enabled SKw / L/S lookups. Blue technical values come from the selected model. CHOOSE MANUALLY indicates the workbook range was exceeded.</p></section>
    <div class="dx-kpis">${labels.map((label,i) => `<div>${dxIcon(['air-vent','snowflake','wind','fan','snowflake'][i])}<span>${label}<strong>${values[i].toLocaleString(undefined,{maximumFractionDigits:3})}${['',' kW',' kW',' L/S',' TR'][i]}</strong></span></div>`).join('')}</div>`;
}
function dxFilterScheduleRows() {
  const query = dxScheduleSearch.trim().toLowerCase();
  canvas.querySelectorAll('[data-dx-schedule-row]').forEach(row => {
    const item = state.tables.vrvSchedule.rows[Number(row.dataset.dxScheduleRow)];
    row.hidden = !!query && !Object.entries(item || {}).some(([key, value]) => !key.startsWith('__') && String(value ?? '').toLowerCase().includes(query));
  });
}
function dxMountTable(key, node) {
  const target = canvas.querySelector('[data-dx-table]');
  const table = state.tables[key];
  if (!target || !node) return;
  const schedule = key === 'vrvSchedule';
  if (schedule) table.rows.forEach((row,index)=>{
    const source=state.tables.thermal.rows[index];
    if (source) row.__reviewCells=Object.fromEntries(Object.entries(source.__reviewCells || {}).filter(([column])=>column!=='Type').map(([column,review])=>[column==='Unit Ref'?'Ref':column,review]));
  });
  target.innerHTML = `<div class="dx-table-scroll"><table class="${schedule ? 'dx-selection-table' : 'dx-thermal-table'}">${schedule ? dxScheduleTableColgroup(table.columns).replace('width:96px','width:70px').replace('width:218px','width:150px').replace('width:104px','width:120px') + dxScheduleTableHeader() : `<thead><tr>${table.columns.map(col=>`<th>${col}</th>`).join('')}</tr></thead>`}<tbody>${table.rows.map((row,i) => `<tr ${schedule ? `data-dx-schedule-row="${i}"` : `data-dx-thermal-row="${i}"`}>${table.columns.map((col,j) => {
    const flag = col === 'Type' ? null : row.__reviewCells?.[col];
    const numeric = ['TKw','SKw','L/S','Qty','NOMINAL TR'].includes(col);
    const model = col === 'Model ( Indoor / Outdoor )';
    const derived = schedule && j >= 8;
    return `<td class="${flag ? 'dx-warning' : ''}">${col === 'Location' ? `<textarea aria-label="Row ${i+1} Location" title="${escapeHtml(row[col] ?? '')}" data-dx-cell data-key="${key}" data-row="${i}" data-col="Location" rows="${Math.min(4,Math.max(1,String(row[col] ?? '').split('\n').length))}" ${node.locked || dxBusy || derived ? 'disabled' : ''}>${escapeHtml(row[col] ?? '')}</textarea>` : `<input aria-label="Row ${i+1} ${escapeHtml(col)}" title="${escapeHtml(flag?.reason || col)}" data-dx-cell data-key="${key}" data-row="${i}" data-col="${escapeHtml(col)}" ${numeric ? (col === 'Qty' ? 'type="number" step="1" min="1"' : 'type="number" step="any" min="0"') : ''}  ${model ? 'list="dxModels"' : ''} ${col === 'Type' ? 'list="dxTypes"' : ''} value="${escapeHtml(row[col] ?? '')}" ${node.locked || dxBusy || derived ? 'disabled' : ''}>`}${flag ? '<span title="Needs review">⚠</span>' : ''}</td>`;
  }).join('')}</tr>`).join('') || `<tr><td colspan="${table.columns.length}" class="dx-empty"><div class="dx-table-empty">${dxIcon('table-2')}<strong>${schedule ? 'No schedule rows yet.' : 'Your thermal data will appear here'}</strong><span>${schedule ? 'Complete the thermal extraction step to build your schedule.' : 'Upload and extract thermal sheets to begin.'}</span></div></td></tr>`}</tbody></table></div>`;
  target.appendChild(workflowDatalist('dxModels', dxProposalCatalog.map(item => item.model)));
  target.appendChild(workflowDatalist('dxTypes',['Ducted','Ducted-Inv','Wall Mounted','Split','Packaged']));
  target.querySelectorAll('[data-dx-action]').forEach(dxBindAction);
  target.querySelectorAll('[data-dx-cell]').forEach(input => input.addEventListener('change', () => {
    if (node.locked || dxBusy) return;
    if (!input.checkValidity()) { input.reportValidity(); return; }
    const rowIndex = Number(input.dataset.row); const col = input.dataset.col;
    const row = table.rows[rowIndex];
    const specified = schedule ? ['Ref','Type','Location','TKw','SKw','L/S'].includes(col) : true;
    if(schedule && !specified && !['Model ( Indoor / Outdoor )','Qty'].includes(col))return;
    if(schedule && col==='Model ( Indoor / Outdoor )' && !dxProposalCatalog.some(item=>item.model===input.value)) { input.value=row[col] || '';toast('Choose a model from the catalog list.');return; }
    if (specified && state.tables.vrvSchedule.rows[rowIndex]?.__manualProposal && !confirm('Recalculate this row? Its manually edited proposed equipment will be replaced.')) { input.value = row[col] ?? ''; return; }
    row[col] = numericDxValue(col,input.value);
    clearTableCellReview(row,col);
    if (specified) {
      const sourceCol = col === 'Ref' ? 'Unit Ref' : col;
      if (schedule) { state.tables.thermal.rows[rowIndex] ||= Object.fromEntries(dxExportColumns.map(column=>[column,''])); state.tables.thermal.rows[rowIndex][sourceCol] = row[col]; clearTableCellReview(state.tables.thermal.rows[rowIndex],sourceCol); }
      dxData().reviewed = false;
      dxValidateTypes(state.tables.thermal.rows);
      const previous = state.tables.vrvSchedule.rows;
      buildDxSchedule();
      state.tables.vrvSchedule.rows = state.tables.vrvSchedule.rows.map((generated,index) => index !== rowIndex && previous[index] ? previous[index] : generated);
    } else {
      if (col === 'Model ( Indoor / Outdoor )') {
        const item = dxProposalCatalog.find(item => item.model === input.value);
        if (item) { dxApplyCatalogItem(row,item); if (row.Qty === '' || row.Qty == null) row.Qty=1; }
      }
      row.__manualProposal = true;
    }
    dxChanged(specified); renderDxWorkspace();
  }));
  if (!schedule && dxSearch) canvas.querySelector('[data-dx-search]').dispatchEvent(new Event('input'));
}
function numericDxValue(col,value) { return ['TKw','SKw','L/S','Qty','NOMINAL TR'].includes(col) && value !== '' ? Number(value) : value; }
function dxApplyCatalogItem(row,item) {
  const columns = { 'NOMINAL TR':'nominalTR','Proposed Type':'proposedType',Refrigerant:'refrigerant','Indoor Temperature':'indoorTemperature','Outdoor Temperature':'outdoorTemperature',TC:'TC',SC:'SC','AFR L/S':'airflow',SPEED:'speed','Actual Power Input':'actualPowerInput','ESMA Power Input':'esmaPowerInput','COP (W/W)':'cop',ESP:'esp','Power Supply':'powerSupply','Indoor H (mm)':'indoorH','Indoor W (mm)':'indoorW','Indoor D (mm)':'indoorD','Outdoor H (mm)':'outdoorH','Outdoor W (mm)':'outdoorW','Outdoor D (mm)':'outdoorD','Indoor Weight (kg)':'indoorWeight','Outdoor Weight (kg)':'outdoorWeight' };
  Object.entries(columns).forEach(([column,key]) => { row[column] = item[key] ?? ''; });
}
function dxConfirmRegenerate() {
  return !state.tables.vrvSchedule.rows.some(row=>row.__manualProposal) || confirm('Recalculate proposed equipment from the thermal data? This replaces existing proposals, including manual equipment edits. Cancel to keep them.');
}
function dxBindAction(button) { button.addEventListener('click', () => { button.closest('details.dx-table-menu')?.removeAttribute('open'); dxAction(button.dataset.dxAction).catch(error => toast(error.message || 'DX action failed')); }); }
async function dxAction(action) {
  const data = dxData();
  if (dxBusy || dxQuotationOpening) return;
  if (action === 'quotation') return dxCreateQuotation();
  if (action === 'modify-quotation') return dxCreateQuotation(true);
  if (action === 'boq') {
    const project=state, previousStep=data.step;
    dxEnsureManualRows();
    if (!state.tables.vrvSchedule.rows.length) buildDxSchedule();
    dxBusy=true; renderDxWorkspace();
    try {
      await dxLoadBoq();
      if (state !== project) return;
      data.step=3; data.completedThrough=Math.max(data.completedThrough || 0,2);
      await dxSave();
    } catch(error) { data.step=previousStep; throw error; }
    finally { dxBusy=false; if (state===project && activeView==='canvas') renderDxWorkspace(); }
    return;
  }
  if (action === 'back-schedule') { data.step=2; await dxSave(); renderDxWorkspace(); return; }
  if (action === 'new') { await dxSave(); dxSaveStatus = 'Draft'; dxSearch = ''; dxScheduleSearch = ''; return createProject({workflowMode:'dx',fresh:true}); }
  if (action === 'save') return dxSave({manual:true});
  if (action === 'upload') { const input = document.createElement('input'); input.type='file'; input.multiple=true; input.accept='.pdf,.png,.jpg,.jpeg'; input.onchange=()=>dxUpload([...input.files]); input.click(); return; }
  if (action === 'select-all' || action === 'clear') { data.selectedUploadIds = action === 'clear' ? [] : thermalUploadIds(); dxChanged(); renderDxWorkspace(); return; }
  if (action === 'preview' || action === 'preview-selected') return dxPreview(action === 'preview' ? thermalUploadIds() : data.selectedUploadIds);
  if (action === 'extract' || action === 'append') return dxExtract(action === 'append');
  if (action === 'search') { canvas.querySelector('[data-dx-search]').focus(); return; }
  if (action === 'lock') { const node=state.nodes.find(node=>node.id === (data.step === 2 ? 'vrv-schedule' : 'thermal-table')); node.locked=!node.locked; dxChanged(); renderDxWorkspace(); return; }
  if (action === 'clear-table') {
    if (!confirm('Clear this table? This removes its current values and manual edits.')) return;
    state.tables[data.step === 2 ? 'vrvSchedule' : 'thermal'].rows=[];
    if (data.step !== 2) { state.tables.vrvSchedule.rows=[]; data.reviewed=false; }
    dxChanged(); renderDxWorkspace(); return;
  }
  if (action === 'add-row') {
    if(state.nodes.find(node=>node.id==='vrv-schedule')?.locked) return;
    dxScheduleSearch = '';
    state.tables.thermal.rows.push(Object.fromEntries(dxExportColumns.map(column=>[column,''])));
    const previous=state.tables.vrvSchedule.rows;
    buildDxSchedule();
    previous.forEach((row,index)=>{state.tables.vrvSchedule.rows[index]=row;});
    dxData().manualEntry=true; dxChanged(); renderDxWorkspace(); return;
  }
  if (action === 'back') { data.step=1; await dxSave(); renderDxWorkspace(); return; }
  if (action === 'continue') {
    dxEnsureManualRows();
    if (!state.tables.vrvSchedule.rows.length) buildDxSchedule();
    const previousStep=data.step;
    data.step=2;
    try { await dxSave(); } catch (error) { data.step=previousStep; throw error; }
    renderDxWorkspace(); return;
  }
  if (action === 'regenerate') { if (!dxConfirmRegenerate()) return; buildDxSchedule(); await dxSave(); renderDxWorkspace(); return; }
  if (action === 'thermal-excel' || action === 'schedule-excel') { await dxSave(); return downloadTable(action === 'thermal-excel' ? 'thermal' : 'vrvSchedule'); }
  if (action === 'pdf') {
    await dxSave();
    const blob = await api('/api/export/dx-schedule-pdf',{method:'POST',body:JSON.stringify({selectionNumber:state.selectionNumber,projectName:state.details.project,customerName:state.details.customer,consultant:state.details.consultant,contractor:state.details.contractor,rows:state.tables.vrvSchedule.rows})});
    downloadBlob(blob,'DX Schedule.pdf');
  }
}
async function dxUpload(files) {
  if (!files.length || dxBusy) return;
  dxBusy=true; renderDxWorkspace();
  try {
    await dxSave({storage:true});
    for (const file of files) {
      if (!/\.(pdf|png|jpe?g)$/i.test(file.name)) throw new Error('Use PDF, PNG or JPG for AI extraction.');
      const optimized = await workflowUploadFileForNode('thermal-upload',file);
      const form = new FormData(); form.append('nodeId','thermal-upload'); form.append('file',optimized,optimized.name || file.name);
      const upload=await api(`/api/projects/${state.id}/uploads`,{method:'POST',body:form});
      state.uploads.push(upload);
      state.thermalChatUploadIds=[...new Set([...thermalUploadIds(),upload.id])];
      const node=state.nodes.find(node=>node.id==='thermal-upload'); if(node) node.data.uploadId=upload.id;
      dxData().selectedUploadIds.push(upload.id);
      await dxSave({storage:true});
    }
  } catch(error) { toast(error.message || 'Upload failed'); }
  finally { dxBusy=false; renderDxWorkspace(); }
}
function dxMergeRows(existing,incoming) {
  const result=structuredClone(existing);
  const signature=row=>JSON.stringify(dxExportColumns.map(col=>String(row[col] ?? '').trim()));
  const signatures=new Set(result.map(signature));
  for(const row of incoming) {
    if(row.__source && result.some(previous=>previous.__source?.uploadId===row.__source.uploadId && previous.__source?.sourceRow===row.__source.sourceRow)) continue;
    if(signatures.has(signature(row)) && !result.some(previous=>signature(previous)===signature(row) && previous.__source?.uploadId===row.__source?.uploadId && previous.__source?.sourceRow!==row.__source?.sourceRow)) continue;
    const conflict=result.find(previous=>String(previous['Unit Ref']).trim()===String(row['Unit Ref']).trim() && String(previous.Location ?? '').trim()===String(row.Location ?? '').trim() && String(row['Unit Ref'] ?? '').trim());
    if(conflict) {
      const flag={reason:'Conflicting values for the same unit reference and location. Review both source rows.'};
      conflict.__reviewCells={...conflict.__reviewCells,'Unit Ref':flag};
      row.__reviewCells={...row.__reviewCells,'Unit Ref':flag};
    }
    result.push(row); signatures.add(signature(row));
  }
  return result;
}
async function dxExtract(append) {
  const data=dxData();
  const ids=data.selectedUploadIds.filter(id=>thermalUploadIds().includes(id));
  if (!ids.length) return toast('Select at least one uploaded file.');
  if (state.tables.thermal.rows.length && !append && !confirm('Replace extracted rows and corrections? The DX Schedule and manual proposal edits will also be replaced.')) return;
  dxBusy=true; renderDxWorkspace();
  try {
    await dxSave({storage:true});
    // Read-only extraction prevents the endpoint from replacing saved rows before append is merged.
    const extracted=await scanThermal(true,{uploadIds:ids});
    let rows;
    if(extracted.customRows?.length) rows=applyExtractionReviewCells(extracted.customRows.map(row=>Object.fromEntries((extracted.customColumns || dxExportColumns).map((col,i)=>[col,Array.isArray(row)?row[i]??'':row[col]??'']))),extracted.customReviewCells);
    else rows=applyExtractionReviewCells(extracted.rows || [],extracted.reviewCells);
    rows.forEach((row,index)=>{ if(extracted.rowSources?.[index]) row.__source=extracted.rowSources[index]; });
    rows=normalizeDxThermalRows(rows);
    dxValidateTypes(rows);
    if(!rows.length) throw new Error(extracted.message || 'No thermal rows extracted.');
    const oldSchedule=state.tables.vrvSchedule.rows;
    const oldCount=state.tables.thermal.rows.length;
    state.tables.thermal.columns=[...dxExportColumns];
    state.tables.thermal.rows=append?dxMergeRows(state.tables.thermal.rows,rows):rows;
    buildDxSchedule();
    if(append) state.tables.vrvSchedule.rows.splice(0,oldCount,...oldSchedule);
    data.lastExtracted=new Date().toISOString(); data.reviewed=false;
    data.extractionError=""; data.extractionWarnings=[...new Set([...(extracted.unclearFields || []),...rows.map(row=>row.__selectionWarning).filter(Boolean)])];
    if(extracted.gridLayout) data.extractionLayout=extracted.gridLayout;
    if(extracted.sourceUploadIds) data.sourceUploadIds=extracted.sourceUploadIds;
    await dxSave({storage:true});
    if(extracted.unclearFields?.length) toast(extracted.unclearFields.join('; '));
  } catch(error) { data.extractionError=error.message || 'Extraction failed'; toast(data.extractionError); await dxSave({storage:true}).catch(()=>{}); }
  finally { dxBusy=false; renderDxWorkspace(); }
}
function dxPreview(ids) {
  const files=ids.map(findUpload).filter(Boolean);
  if(!files.length) return toast('Select a file to preview.');
  const dialog=document.createElement('dialog'); dialog.className='dx-preview';
  let index=0;
  const show=()=>{ dialog.innerHTML=`<div class="dx-preview-toolbar"><button data-prev>← Previous</button><strong>${escapeHtml(files[index].originalName)} (${index+1}/${files.length})</strong><button data-next>Next →</button><button data-close>Close</button></div><iframe title="Original thermal sheet" src="/api/projects/${encodeURIComponent(state.id)}/uploads/${encodeURIComponent(files[index].id)}"></iframe>`;dialog.querySelector('[data-prev]').onclick=()=>{index=(index-1+files.length)%files.length;show();};dialog.querySelector('[data-next]').onclick=()=>{index=(index+1)%files.length;show();};dialog.querySelector('[data-close]').onclick=()=>dialog.close(); };
  show();document.body.appendChild(dialog);dialog.addEventListener('close',()=>dialog.remove());dialog.showModal();
}

// Dismiss the compact table options without changing any table action behavior.
document.addEventListener('click', event => {
  document.querySelectorAll('.dx-table-menu[open]').forEach(menu => {
    if (!menu.contains(event.target)) menu.removeAttribute('open');
  });
});
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  document.querySelectorAll('.dx-table-menu[open]').forEach(menu => {
    menu.removeAttribute('open');
    menu.querySelector('summary')?.focus();
  });
});
