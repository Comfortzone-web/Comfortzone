let dxBoqPreparedId = '';
let dxBoqLoadingId = '';
let dxQuotationOpening = false;

function dxBoqData() {
  const data = dxData();
  data.boq ||= { version: 1, margin: 20, rows: [], excludedModels: [] };
  return data.boq;
}
function dxRecalculateBoq() { dxData().boq = DXBoq.calculate(dxBoqData()); }
async function dxLoadBoq(options = {}) {
  if (!canAccessModule('sales')) throw new Error('Sales Desk access is required to price the BOQ.');
  const project = state;
  dxBoqLoadingId = project.id;
  try {
    // Fetch current catalog records on entry; sync preserves existing snapshots.
    await loadCosting({ force: true });
    if (state !== project) return;
    const before = JSON.stringify(dxBoqData());
    let boq = DXBoq.sync(dxBoqData(), state.tables.vrvSchedule.rows, costingState.priceItems || [], !!options.sync);
    if (options.refresh) {
      boq.rows = boq.rows.map(row => {
        const price = DXBoq.priceForModel(row.model, costingState.priceItems || []);
        return { ...row, ...price, description: price.description || row.equipmentType || '', manualPrice: false };
      });
      boq = DXBoq.calculate(boq);
    }
    dxData().boq = boq;
    dxBoqPreparedId = project.id;
    if (JSON.stringify(boq) !== before) dxChanged();
  } finally { if (dxBoqLoadingId === project.id) dxBoqLoadingId = ''; }
}
function dxBoqMenu() {
  return `<details class="dx-table-menu dx-boq-menu"><summary class="dx-button dx-menu-trigger" aria-label="BOQ options">${dxIcon('ellipsis-vertical')}</summary><div class="dx-table-menu-panel">${dxButton('save','Save Draft','save')}<button class="dx-button" data-boq-action="sync">${dxIcon('refresh-cw')}Synchronize Schedule</button><button class="dx-button" data-boq-action="refresh">${dxIcon('download')}Refresh Prices</button></div></details>`;
}
function dxStepThree() {
  dxRecalculateBoq();
  const boq = dxBoqData(), count = boq.rows.filter(row => row.origin === 'schedule').length;
  const allowed = canAccessModule('sales'), busy = dxBusy || dxQuotationOpening;
  const amount = value => value == null ? '—' : salesMoney(value);
  const percentage = boq.margin == null ? '—' : `${Number(boq.margin).toFixed(2)}%`;
  const pending = boq.rows.some(row => row.sourceRemoved || row.pendingQty != null) || boq.syncWarnings?.length;
  return `<section class="dx-card dx-boq-card">
    <div class="dx-boq-heading"><div class="dx-boq-title">${dxIcon('clipboard-list')}<div><h2>BOQ &amp; Quotation</h2><p>Pricing and quotation preparation from selected DX models.</p></div></div>
      <span class="dx-boq-count">${count} ${count === 1 ? 'item' : 'items'} imported from DX Schedule</span>
      <label class="dx-boq-margin">Overall Profit Margin<span class="dx-boq-percent-field"><input data-boq-margin aria-label="Overall Profit Margin percent" type="text" inputmode="decimal" maxlength="5" pattern="[0-9]{1,2}([.][0-9]{1,2})?" value="${boq.margin == null ? '' : Number(boq.margin).toFixed(2)}" ${!allowed || busy ? 'disabled' : ''}><span aria-hidden="true">%</span></span></label>
      <button class="dx-button" data-boq-action="add" ${!allowed || busy ? 'disabled' : ''}>${dxIcon('plus')}Add Row</button></div>
    ${pending ? `<div class="dx-boq-reconcile" role="status">DX Schedule changed. Review marked rows, then use <button data-boq-action="sync">Synchronize Schedule</button>. ${(boq.syncWarnings || []).map(escapeHtml).join(' ')}</div>` : ''}
    <datalist id="dxBoqProducts">${(costingState?.priceItems || []).map(item => `<option value="${escapeHtml(item.model)}">${escapeHtml(item.description || '')}</option>`).join('')}</datalist>
    <div class="dx-boq-table-wrap"><table class="dx-boq-table"><colgroup><col class="dx-boq-ref"><col class="dx-boq-model"><col class="dx-boq-qty"><col><col><col></colgroup><thead><tr><th>Ref</th><th>Model</th><th>Qty</th><th>Unit Price</th><th>Selling Price</th><th>Line Total</th></tr></thead><tbody>
    ${boq.rows.map((row, index) => `<tr data-boq-row="${escapeHtml(row.id)}" class="${row.sourceRemoved || row.pendingQty != null ? 'dx-boq-changed' : ''}">
      <td>${index + 1}</td>
      <td class="dx-boq-model-cell">${row.origin === 'manual' ? `<input data-boq-field="model" list="dxBoqProducts" aria-label="Row ${index + 1} model" placeholder="Search Price List…" value="${escapeHtml(row.model)}" ${!allowed || busy ? 'disabled' : ''}>` : `<strong>${escapeHtml(row.model)}</strong>`}<small>${escapeHtml(row.description || '')}</small>${row.sourceRemoved ? '<small class="dx-boq-warning">Removed from DX Schedule — synchronize to reconcile.</small>' : row.pendingQty != null ? `<small class="dx-boq-warning">Schedule quantity changed to ${row.pendingQty}.</small>` : ''}</td>
      <td><input data-boq-field="qty" aria-label="Row ${index + 1} quantity" type="number" min="1" step="1" inputmode="numeric" value="${escapeHtml(row.qty)}" ${!allowed || busy ? 'disabled' : ''}>${row.qtyOverride ? '<small>BOQ override</small>' : ''}</td>
      <td><div class="dx-boq-money-input"><span>AED</span><input readonly aria-readonly="true" data-boq-field="unitPrice" aria-label="Row ${index + 1} Unit Price" type="number" min="0" step="0.01" placeholder="—" value="${row.unitPrice == null ? '' : Number(row.unitPrice).toFixed(2)}" ${!allowed || busy ? 'disabled' : ''}></div>${row.unitPrice == null ? '<small class="dx-boq-warning">Price not found — update the Price List and refresh prices.</small>' : row.manualPrice ? '<small>Manual price</small>' : ''}</td>
      <td><span class="dx-boq-calculated">${amount(row.sellingPrice)}</span></td><td class="dx-boq-line-total"><strong>${amount(row.lineTotal)}</strong><button type="button" class="dx-boq-delete" data-boq-action="remove" aria-label="Delete BOQ row ${index + 1}" title="Delete row" ${!allowed || busy ? 'disabled' : ''}>×</button></td></tr>`).join('') || `<tr><td colspan="6" class="dx-boq-empty">${dxBoqLoadingId ? 'Loading Price List…' : 'Select models in DX Schedule or add a Price List item.'}</td></tr>`}
    </tbody></table></div>
    <div class="dx-kpis dx-boq-kpis">${[['Total Cost', amount(boq.totals.cost),'clipboard-list'],['Total Selling',amount(boq.totals.selling),'files'],['Overall Margin',percentage,'snowflake'],['Total Amount',amount(boq.totals.amount),'arrow-right']].map(([label,value,icon]) => `<div>${dxIcon(icon)}<span>${label}<strong>${escapeHtml(value)}</strong></span></div>`).join('')}</div>
    <p class="dx-boq-total-note">Amounts before VAT. ${boq.totals.incomplete ? 'Totals are partial until every quantity and price is valid.' : 'Sales Desk applies its existing 5% VAT when preparing the quotation.'}</p>
    ${boq.errors?.length ? `<ul class="dx-boq-errors" role="alert">${boq.errors.map(error => `<li>${escapeHtml(error)}</li>`).join('')}</ul>` : ''}
  </section>`;
}
function dxMountBoq() {
  document.querySelectorAll('#viewActions [data-boq-action], .dx-workspace [data-boq-action]').forEach(button => button.addEventListener('click', () => {
    button.closest('details')?.removeAttribute('open');
    dxBoqAction(button.dataset.boqAction, button.closest('[data-boq-row]')?.dataset.boqRow).catch(error => toast(error.message));
  }));
  const marginInput = canvas.querySelector('[data-boq-margin]');
  marginInput?.addEventListener('input', () => {
    const [whole, ...fraction] = marginInput.value.replace(/[^\d.]/g, '').split('.');
    marginInput.value = (whole || (fraction.length ? '0' : '')) + (fraction.length ? '.' + fraction.join('').slice(0, 2) : '');
    marginInput.setCustomValidity('');
  });
  marginInput?.addEventListener('change', () => {
    marginInput.setCustomValidity(Number(marginInput.value) > 95 ? 'Enter a percentage between 0 and 95.' : '');
    if (!marginInput.reportValidity()) return;
    dxBoqData().margin = marginInput.value === '' ? null : Number(Number(marginInput.value).toFixed(2)); dxBoqData().errors = []; dxRecalculateBoq(); dxChanged(); renderDxWorkspace();
  });
  canvas.querySelectorAll('[data-boq-field]').forEach(input => input.addEventListener('change', () => {
    if (!input.reportValidity()) return;
    const row = dxBoqData().rows.find(row => row.id === input.closest('[data-boq-row]').dataset.boqRow);
    const key = input.dataset.boqField;
    if (key === 'unitPrice') return;
    if (key === 'model') {
      const product = (costingState?.priceItems || []).find(item => item.model === input.value);
      if (!product) { input.value = row.model; return toast('Select an exact model from the Price List.'); }
      row.model = product.model;
      Object.assign(row, DXBoq.priceForModel(product.model, costingState.priceItems), { manualPrice: false });
    } else {
      row[key] = input.value === '' ? null : Number(input.value);
      if (key === 'unitPrice') row.manualPrice = true;
      if (key === 'qty') row.qtyOverride = row.origin === 'schedule' && Number(row.qty) !== Number(row.sourceQty);
    }
    dxBoqData().errors = []; dxRecalculateBoq(); dxChanged(); renderDxWorkspace();
  }));
  if (dxBoqPreparedId !== state.id && dxBoqLoadingId !== state.id) {
    dxLoadBoq().then(() => { if (isDxWorkflow() && dxData().step === 3) renderDxWorkspace(); }).catch(error => { dxBoqPreparedId = state?.id || ''; toast(error.message); });
  }
}
async function dxBoqAction(action, rowId) {
  if (!canAccessModule('sales') || dxBusy || dxQuotationOpening) return;
  let boq = dxBoqData();
  if (action === 'add') {
    await loadCosting();
    boq = dxBoqData();
    boq.rows.push({ id: costingId(), origin: 'manual', model: '', description: '', qty: 1, unitPrice: null, manualPrice: false, priceItemIds: [] });
  } else if (action === 'remove') {
    const row = boq.rows.find(row => row.id === rowId);
    if (!row || !confirm('Remove this BOQ row? DX Schedule engineering quantities will remain unchanged.')) return;
    if (row.origin === 'schedule') { boq.excludedModels ||= []; boq.excludedModels.push(DXBoq.modelKey(row.model)); }
    boq.rows = boq.rows.filter(row => row.id !== rowId);
  } else if (action === 'refresh' || action === 'sync') {
    if (!confirm(action === 'refresh' ? 'Replace all BOQ unit prices, including manual prices, with the current Price List? Missing prices will be cleared.' : 'Apply changed schedule quantities and remove lines deleted from the DX Schedule? Prices and manually added rows will be preserved.')) return;
    const project=state;
    dxBusy=true; renderDxWorkspace();
    try { await dxLoadBoq({ refresh: action === 'refresh', sync: action === 'sync' }); }
    finally { dxBusy=false; if (state===project && activeView==='canvas') renderDxWorkspace(); }
    if (state!==project) return;
  } else if (action === 'quotation') return dxCreateQuotation();
  dxBoqData().errors = []; dxRecalculateBoq(); dxChanged(); renderDxWorkspace();
}
async function dxCreateQuotation(modify = false) {
  if (dxQuotationOpening || !canAccessModule('sales')) return;
  dxQuotationOpening = true;
  renderDxWorkspace();
  try {
    await dxSave();
    await loadSalesCrm({ force: true });
    const linked = (salesData().quotations || []).find(quote => quote.id === dxBoqData().quotationId || quote.id === `dx-${state.id}`);
    if (linked && !modify) { dxBoqData().quotationId=linked.id; await dxSave(); editSalesQuotation(linked.id); return; }
    const errors = DXBoq.validate(dxBoqData());
    if (!state.details.project?.trim()) errors.unshift('Enter Project Name.');
    if (!findSalesCustomerByName(state.details.customer)) errors.unshift('Select an existing Sales Desk customer in Client.');
    if (errors.length) { dxBoqData().errors = errors; renderDxWorkspace(); return; }
    const defaults = quoteDraftFromSource({ quoteType: 'DX' });
    salesCrmState = await api('/api/sales-crm/quotations', { method: 'POST', body: JSON.stringify({ fromDxBoq: true, modifyDxBoq: modify, sourceDxWorkflowId: state.id, terms: defaults.terms, notes: defaults.notes }) });
    const quotationId = salesCrmState.savedItemId;
    dxBoqData().quotationId = quotationId;
    await dxSave();
    editSalesQuotation(quotationId);
  } finally {
    dxQuotationOpening = false;
    if (activeView === 'canvas' && isDxWorkflow() && dxData().step === 3) renderDxWorkspace();
  }
}
