(() => {
  const root = document.getElementById('chequeManagementRoot');
  const state = { data: null, user: null, company: '', type: '', status: '', search: '', view: 'list', month: '', page: 1, alertDays: 7, modal: null, file: null, busy: false, notice: '', pendingUploads: [] };
  let previewFile = null;
  let previewUrl = '';
  const filePreviewUrl = file => {
    if (file !== previewFile) {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewFile = file;
      previewUrl = URL.createObjectURL(file);
    }
    return previewUrl;
  };
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const money = value => `AED ${Number(value || 0).toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dubai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const days = date => Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today()}T00:00:00Z`)) / 86400000);
  const unresolved = row => row.status !== 'Cancelled' && !row.legacyCleared;
  const companyName = row => state.data?.companies.find(c => c.id === row.companyId)?.name || '—';
  const notesWithWords = row => { const notes = String(row.notes || '').trim(); const words = String(row.amountWords || '').trim(); return words && !notes.includes(words) ? [notes, `Amount in words: ${words}`].filter(Boolean).join('\n') : notes; };
    const request = async (path, options) => { const response = await fetch(path, { credentials: 'same-origin', ...options }); const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body.error || 'Request failed'); return body; };
  const notify = message => { state.notice = message; const target = root.querySelector('.chq-register-notice'); if (target) { target.textContent = message; target.hidden = !message; } };
  const filtered = () => (state.data?.records || []).filter(row => (!state.company || row.companyId === state.company) && (!state.type || row.type === state.type) && (!state.status || row.status === state.status) && (!state.search || `${row.chequeNo} ${row.party} ${companyName(row)} ${row.bank}`.toLowerCase().includes(state.search.toLowerCase())));
  const badge = (label, kind = '') => `<span class="chq-badge ${kind || label.toLowerCase().replace(/\s+/g, '-')}">${esc(label)}</span>`;
  const icon = name => {
    const paths = {
      incoming: '<path d="M12 3v15m0 0 5-5m-5 5-5-5M4 21h16"/>',
      outgoing: '<path d="M12 21V6m0 0-5 5m5-5 5 5M4 3h16"/>',
      calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18m-12 4h2m3 0h2"/>',
      warning: '<path d="m12 3 10 18H2L12 3Z"/><path d="M12 9v5m0 3h.01"/>',
      hourglass: '<path d="M5 3h14M5 21h14M7 3c0 5 5 5 5 9s-5 4-5 9m10-18c0 5-5 5-5 9s5 4 5 9"/>',
      chart: '<path d="M4 20V12m5 8V8m5 12V4m5 16v-9M2 21h20"/>',
      register: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M7 6h2m3 0h2M7 13h3m-3 4h3m4-4h3m-3 4h3"/>',
      empty: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 9h9m-9 4h6"/><circle cx="18" cy="18" r="4"/>'
    };
    return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[name] || paths.register}</svg>`;
  };
  const field = (label, name, value = '', type = 'text', extra = '') => `<label class="chq-field">${esc(label)}<input name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`;
  const select = (label, name, options, value, disabled = false) => `<label class="chq-field">${esc(label)}<select name="${name}" ${disabled ? 'disabled' : ''}>${options.map(([key, title]) => `<option value="${esc(key)}" ${key === value ? 'selected' : ''}>${esc(title)}</option>`).join('')}</select></label>`;
  const companyOptions = () => [['', 'All Companies'], ...(state.data?.companies || []).map(c => [c.id, c.name])];
  const headerControls = () => `<div class="chq-header-controls"><select id="chqTopCompany" aria-label="Company">${companyOptions().map(([id, label]) => `<option value="${esc(id)}" ${state.company === id ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select><input id="chqTopSearch" type="search" aria-label="Search cheques" placeholder="Search by cheque no., party…" value="${esc(state.search)}"></div>`;
  function bindHeader() {
    const host = document.getElementById('viewActions');
    host.querySelector('#chqTopCompany')?.addEventListener('change', event => { state.company = event.target.value; state.page = 1; render(); });
    host.querySelector('#chqTopSearch')?.addEventListener('input', event => { state.search = event.target.value; state.page = 1; render(); });
  }
  function refreshHeader() {
    const host = document.getElementById('viewActions');
    const controls = host?.querySelector('.chq-header-controls');
    if (!controls) return;
    controls.outerHTML = headerControls();
    bindHeader();
  }
  const dataRows = () => filtered();
  const dueLabel = row => !unresolved(row) ? '—' : days(row.chequeDate) < 0 ? `Overdue by ${-days(row.chequeDate)} Days` : days(row.chequeDate) === 0 ? 'Today' : `${days(row.chequeDate)} Days`;
  const outstandingRows = rows => rows.filter(row => unresolved(row) && row.status !== 'Returned' && Number(row.amount) > 0);
  const chequeDateLabel = value => new Date(`${value}T00:00:00Z`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const amountLabel = value => Number(value).toLocaleString('en-AE', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
  const sumAmount = rows => rows.reduce((total, row) => total + Number(row.amount || 0), 0);
  const dateOrder = (a, b) => a.chequeDate.localeCompare(b.chequeDate) || a.chequeNo.localeCompare(b.chequeNo);
  const todayRowClass = row => row.status === 'Today Deposit' ? 'chq-today-deposit-row' : '';
  const partyCell = party => `<td class="chq-party-cell"><span title="${esc(party)}">${esc(party)}</span></td>`;
  const chequeFlow = rows => {
    const list = outstandingRows(rows).filter(row => days(row.chequeDate) >= 0 && days(row.chequeDate) < state.alertDays).sort(dateOrder);
    const incoming = sumAmount(list.filter(row => row.type === 'Received'));
    const outgoing = sumAmount(list.filter(row => row.type === 'Issued'));
    return `<section class="chq-card chq-flow-card"><div class="chq-card-head"><h2><span class="chq-section-icon">${icon('calendar')}</span>Cheque Flow Preview (AED)</h2><div class="chq-flow-options" role="group" aria-label="Cheque flow period"><button type="button" data-flow-days="7" class="${state.alertDays === 7 ? 'selected' : ''}">Next 7 Days</button><button type="button" data-flow-days="30" class="${state.alertDays === 30 ? 'selected' : ''}">Next 30 Days</button></div></div><div class="chq-flow-scroll"><table class="chq-table chq-flow-table"><thead><tr><th>Date / Chq No.</th><th>Party</th><th>In (AED)</th><th>Out (AED)</th><th>Net (AED)</th></tr></thead><tbody>${list.map(row => { const value = Number(row.amount); const received = row.type === 'Received'; return `<tr class="${todayRowClass(row)}" data-open-cheque="${esc(row.id)}" tabindex="0" role="button" aria-label="View cheque ${esc(row.chequeNo)}"><td><strong>${esc(chequeDateLabel(row.chequeDate))}</strong><small>#${esc(row.chequeNo)}</small></td>${partyCell(row.party)}<td class="chq-money received">${received ? amountLabel(value) : '—'}</td><td class="chq-money issued">${received ? '—' : amountLabel(value)}</td><td class="chq-money ${received ? 'received' : 'issued'}">${received ? '+' : '−'}${amountLabel(value)}</td></tr>`; }).join('') || '<tr><td colspan="5" class="chq-empty">No upcoming cheques in this period.</td></tr>'}</tbody><tfoot><tr><td colspan="2">Total (Next ${state.alertDays} Days)</td><td class="chq-money received">${amountLabel(incoming)}</td><td class="chq-money issued">${amountLabel(outgoing)}</td><td class="chq-money ${incoming - outgoing >= 0 ? 'received' : 'issued'}">${amountLabel(incoming - outgoing)}</td></tr></tfoot></table></div></section>`;
  };
  const monthlyChart = rows => {
    const now = today();
    const [year, month] = now.slice(0, 7).split('-').map(Number);
    const months = Array.from({ length: 4 }, (_, index) => {
      const date = new Date(Date.UTC(year, month - 1 + index, 1));
      const key = date.toISOString().slice(0, 7);
      const records = outstandingRows(rows).filter(row => row.chequeDate.startsWith(key));
      return { label: date.toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' }), incoming: sumAmount(records.filter(row => row.type === 'Received')), outgoing: sumAmount(records.filter(row => row.type === 'Issued')) };
    });
    const maximum = Math.max(1, ...months.flatMap(item => [item.incoming, item.outgoing]));
    const step = Math.pow(10, Math.floor(Math.log10(maximum / 4)));
    const tick = Math.max(1, Math.ceil(maximum / 4 / step) * step);
    const ceiling = tick * 4;
    const top = 26; const bottom = 214; const height = bottom - top;
    const grid = Array.from({ length: 5 }, (_, index) => { const y = bottom - index * height / 4; return `<line x1="65" y1="${y}" x2="620" y2="${y}" stroke="#e4ebf6"/><text x="57" y="${y + 4}" text-anchor="end" class="chq-chart-axis">${esc(Math.round(index * tick).toLocaleString('en-AE'))}</text>`; }).join('');
    const bars = months.map((item, index) => {
      const center = 120 + index * 145;
      const inTop = bottom - item.incoming / ceiling * height;
      const outTop = bottom - item.outgoing / ceiling * height;
      const closeLabels = item.incoming > 0 && item.outgoing > 0 && Math.abs(inTop - outTop) < 14;
      return [[item.incoming, center - 31, 'in', closeLabels ? Math.max(12, inTop - 17) : Math.max(12, inTop - 6)], [item.outgoing, center + 3, 'out', Math.max(24, outTop - 6)]].map(([value, x, kind, labelY]) => {
        const barHeight = value / ceiling * height;
        const label = amountLabel(value);
        const redBesideTallerGreen = kind === 'out' && item.incoming > item.outgoing && item.outgoing > 0;
        const labelX = redBesideTallerGreen ? Math.max(x + 14, center - 3 + label.length * 2.8 + 4) : x + 14;
        return value ? `<rect x="${x}" y="${bottom - barHeight}" width="28" height="${barHeight}" rx="2" class="chq-chart-${kind}"/><text x="${labelX}" y="${labelY}" text-anchor="middle" class="chq-chart-value">${esc(label)}</text>` : '';
      }).join('') + `<text x="${center}" y="238" text-anchor="middle" class="chq-chart-axis chq-chart-month">${esc(item.label)}</text>`;
    }).join('');
    return `<section class="chq-card chq-chart-card"><div class="chq-card-head"><h2><span class="chq-section-icon">${icon('chart')}</span>Monthly Cheques Views (AED)</h2><div class="chq-chart-legend"><span><i class="in"></i>Receivable (In)</span><span><i class="out"></i>Payable (Out)</span></div></div><div class="chq-chart-wrap"><svg viewBox="0 0 640 250" role="img" aria-label="Monthly outstanding cheque amounts for ${esc(months.map(item => item.label).join(', '))}">${grid}${bars}</svg></div></section>`;
  };
  const directionList = (rows, type) => {
    const payable = type === 'Issued';
    const list = outstandingRows(rows).filter(row => row.type === type).sort(dateOrder);
    return `<section class="chq-card chq-direction-card ${payable ? 'payable' : 'receivable'}"><div class="chq-direction-head"><h2><span class="chq-direction-icon">${icon(payable ? 'outgoing' : 'incoming')}</span>Cheques ${payable ? 'Payable (Out)' : 'Receivable (In)'}</h2><strong>Total: ${money(sumAmount(list))}</strong></div><div class="chq-direction-scroll"><table class="chq-table chq-direction-table"><thead><tr><th>Date</th><th>${payable ? 'Party' : 'Customer'}</th><th>Chq No.</th><th>Amount (AED)</th></tr></thead><tbody>${list.map(row => `<tr class="${todayRowClass(row)}" data-open-cheque="${esc(row.id)}" tabindex="0" role="button" aria-label="View cheque ${esc(row.chequeNo)}"><td>${esc(chequeDateLabel(row.chequeDate))}</td>${partyCell(row.party)}<td>${esc(row.chequeNo)}</td><td class="chq-amount">${amountLabel(row.amount)}</td></tr>`).join('') || `<tr><td colspan="4" class="chq-empty">No outstanding ${payable ? 'payable' : 'receivable'} cheques.</td></tr>`}</tbody></table></div></section>`;
  };
  const register = rows => {
    const pageSize = 15;
    const pages = Math.max(1, Math.ceil(rows.length / pageSize));
    state.page = Math.min(state.page, pages);
    const shown = rows.slice((state.page - 1) * pageSize, state.page * pageSize);
    const uploads = state.page === 1 ? state.pendingUploads.map(item => `<tr class="chq-upload-row" ${item.stage === 'Needs review' ? `data-review-upload="${esc(item.id)}"` : ''}><td><strong>${esc(item.details?.chequeNo || (item.stage === 'Processing' ? 'Processing…' : '—'))}</strong></td><td>${item.details?.chequeDate ? esc(chequeDateLabel(item.details.chequeDate)) : '—'}</td><td>${esc(state.data.companies.find(company => company.id === item.details?.companyId)?.name || '—')}</td><td>${esc(item.details?.party || item.file.name)}</td><td>${esc(item.details?.type || '—')}</td><td>${item.details?.amount ? money(item.details.amount) : '—'}</td><td>—</td><td class="chq-upload-status"><span class="chq-badge ${item.stage !== 'Processing' ? 'returned' : ''}">${esc(item.stage)}</span>${item.stage === 'Retry available' ? `<button type="button" data-retry-upload="${esc(item.id)}">Retry</button>` : item.stage === 'Needs review' ? '<button type="button">Review</button>' : ''}</td></tr>`).join('') : '';
    const table = `<div class="chq-table-wrap"><table class="chq-table chq-register-table"><thead><tr><th>Cheque No.</th><th>Date</th><th>Company</th><th>Party</th><th>Type</th><th>Amount</th><th>Due Days</th><th>Status</th></tr></thead><tbody>${uploads}${shown.map(r => `<tr class="${r.status === 'Today Deposit' ? 'chq-today-deposit-row' : ''}" data-open-cheque="${esc(r.id)}" tabindex="0" role="button" aria-label="View cheque ${esc(r.chequeNo)}"><td><strong>${esc(r.chequeNo)}</strong></td><td>${esc(chequeDateLabel(r.chequeDate))}</td><td>${esc(companyName(r))}</td><td>${esc(r.party)}</td><td>${badge(r.type)}</td><td class="chq-money ${r.type.toLowerCase()}">${money(r.amount)}</td><td>${esc(dueLabel(r))}</td><td>${badge(r.status)}</td></tr>`).join('') || (uploads ? '' : '<tr><td colspan="8" class="chq-empty"><span class="chq-empty-icon">' + icon("empty") + '</span>No cheques match these filters.</td></tr>')}</tbody></table></div><div class="chq-pagination"><span>${rows.length + state.pendingUploads.length} cheques</span><div><button data-page="previous" ${state.page <= 1 ? 'disabled' : ''}>Previous</button><span>${state.page} / ${pages}</span><button data-page="next" ${state.page >= pages ? 'disabled' : ''}>Next</button></div></div>`;
    return table;
  };
  const calendar = rows => {
    const month = state.month || today().slice(0, 7);
    const first = new Date(`${month}-01T00:00:00Z`);
    const count = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
    const blank = first.getUTCDay();
    const byDate = new Map();
    rows.filter(row => row.chequeDate.startsWith(month)).forEach(row => {
      if (!byDate.has(row.chequeDate)) byDate.set(row.chequeDate, []);
      byDate.get(row.chequeDate).push(row);
    });
    const cells = Array.from({ length: blank }, () => '<div class="chq-calendar-blank" aria-hidden="true"></div>');
    for (let day = 1; day <= count; day++) {
      const date = `${month}-${String(day).padStart(2, '0')}`;
      const items = byDate.get(date) || [];
      const kind = items.every(row => row.type === 'Received') ? 'received' : items.every(row => row.type === 'Issued') ? 'issued' : 'mixed';
      const countBadge = items.length ? `<span class="chq-calendar-count ${kind}">${items.length} cheque${items.length === 1 ? '' : 's'}</span>` : '';
      const cards = items.map(row => {
        const received = row.type === 'Received';
        return `<button type="button" class="chq-calendar-event ${received ? 'received' : 'issued'}" data-open-cheque="${esc(row.id)}" aria-label="View ${esc(row.type.toLowerCase())} cheque ${esc(row.chequeNo)} for ${money(row.amount)}"><span class="chq-calendar-event-icon">${icon(received ? 'incoming' : 'outgoing')}</span><span class="chq-calendar-event-copy"><strong>${esc(row.type)}</strong><b>${money(row.amount)}</b><small>#${esc(row.chequeNo)}</small></span></button>`;
      }).join('');
      cells.push(`<div class="chq-day ${date === today() ? 'today' : ''}"><div class="chq-day-top"><button type="button" class="chq-day-number" data-date="${date}" aria-label="Show cheques for ${esc(chequeDateLabel(date))}">${day}</button>${countBadge}</div>${cards ? `<div class="chq-day-events">${cards}</div>` : ''}</div>`);
    }
    while (cells.length % 7) cells.push('<div class="chq-calendar-blank" aria-hidden="true"></div>');
    return `<div class="chq-calendar-view"><div class="chq-calendar-head"><button type="button" data-month="previous" aria-label="Previous month">‹</button><strong>${first.toLocaleDateString('en-AE', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</strong><button type="button" data-month="next" aria-label="Next month">›</button></div><div class="chq-calendar">${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => `<b>${d}</b>`).join('')}${cells.join('')}</div><div id="chqCalendarDate"></div></div>`;
  };
  function render() {
    if (!state.data) { root.innerHTML = '<div class="chq-loading">Loading cheques…</div>'; return; }
    const rows = dataRows();
    root.innerHTML = `<div class="chq-page">
      <input id="chqQuickFile" type="file" accept="image/jpeg,image/png,application/pdf" capture="environment" hidden>
      ${state.data.isAdmin ? `<div class="chq-dashboard-grid">${chequeFlow(rows)}${monthlyChart(rows)}${directionList(rows, 'Issued')}${directionList(rows, 'Received')}</div>` : ''}
      <section class="chq-card chq-register-card">
        <div class="chq-card-head chq-register-head">
          <h2><span class="chq-section-icon">${icon("register")}</span>Cheque Register</h2>
          <div class="chq-segments chq-register-types">${[['', 'All'], ['Received', 'Received'], ['Issued', 'Issued']].map(([key, label]) => `<button data-type-tab="${key}" class="${state.type === key ? 'selected' : ''}">${label}</button>`).join('')}</div>
          <span class="chq-register-notice" role="status" ${state.notice ? "" : "hidden"}>${esc(state.notice)}</span>
          <div class="chq-segments chq-register-view"><button data-view="list" class="${state.view === 'list' ? 'selected' : ''}">List View</button><button data-view="calendar" class="${state.view === 'calendar' ? 'selected' : ''}">Calendar View</button></div>
        </div>
        ${state.view === 'list' ? register(rows) : calendar(rows)}
      </section>
    </div>${state.modal ? modal() : ''}`;
    updateUploadSpinner();
  }
  const newRecord = () => ({ type: 'Received', companyId: state.company || state.data.companies[0]?.id || '', chequeNo: '', chequeDate: '', party: '', amount: '', bank: '', bankAccount: '', iban: '', payee: '', notes: '' });
  function modal() {
    const row = state.modal.record;
    const editing = state.modal.editing;
    const fresh = state.modal.fresh;
    const canEditRecord = state.data.isAdmin || row.uploadedById === state.user?.id && row.type === 'Received';
    const canEdit = fresh || canEditRecord && editing;
    const image = fresh && state.file ? filePreviewUrl(state.file) : row.image ? `/api/cheques/${encodeURIComponent(row.id)}/image` : '';
    const preview = image ? row.image?.mimeType === 'application/pdf' || state.file?.type === 'application/pdf'
      ? `<iframe src="${esc(image)}" title="Cheque preview"></iframe>`
      : `<img data-cheque-preview src="${esc(image)}" alt="Cheque preview"><div class="chq-preview-rotate"><button type="button" data-preview-rotate="-90" aria-label="Rotate cheque left">↶ Rotate left</button><button type="button" data-preview-rotate="90" aria-label="Rotate cheque right">Rotate right ↷</button></div>`
      : '<div class="chq-preview-empty">Cheque preview</div>';
    const values = `<div class="chq-form-grid">${select('Company *', 'companyId', state.data.companies.map(c => [c.id, c.name]), row.companyId)}${select('Type *', 'type', state.data.isAdmin ? [['Received', 'Received'], ['Issued', 'Issued']] : [['Received', 'Received']], row.type, !fresh)}${field('Cheque No. *', 'chequeNo', row.chequeNo)}${field('Cheque Date *', 'chequeDate', row.chequeDate, 'date')}${field('Amount (AED) *', 'amount', row.amount, 'number', 'step="0.01" min="0"')}${field('Party *', 'party', row.party)}${row.type === 'Issued' ? field('Payor', 'payee', companyName(row), 'text', 'readonly') : field('Payee', 'payee', row.payee)}${field('Bank', 'bank', row.bank)}${row.type === 'Issued' ? '' : `${field('Account No.', 'bankAccount', row.bankAccount)}${field('IBAN', 'iban', row.iban)}`}<label class="chq-field chq-wide">Notes<textarea name="notes">${esc(notesWithWords(row))}</textarea></label></div>`;
    const selectedStatus = state.modal.pendingStatus || row.status;
    const statusOptions = `${selectedStatus === 'Today Deposit' ? '<option value="Today Deposit" selected hidden>Today Deposit</option>' : ''}${['Pending', 'Deposited', 'Returned', 'Cancelled'].map(s => `<option ${selectedStatus === s ? 'selected' : ''}>${s}</option>`).join('')}`;
    const footer = state.modal.confirmDelete
      ? `<span class="chq-delete-question">Delete cheque ${esc(row.chequeNo)} permanently?${state.modal.deleteError ? `<small role="alert">${esc(state.modal.deleteError)}</small>` : ''}</span><button type="button" data-cancel-delete ${state.busy ? 'disabled' : ''}>Cancel</button><button type="button" class="chq-confirm-delete" data-confirm-delete ${state.busy ? 'disabled' : ''}>${state.busy ? 'Deleting…' : 'Delete cheque'}</button>`
      : `${!fresh && state.data.isAdmin ? `<button type="button" class="chq-delete-button" data-delete-cheque ${state.busy ? 'disabled' : ''}>Delete</button>` : ''}${fresh ? `<div class="chq-footer-status"><span>Status</span><strong>Pending</strong></div>` : canEditRecord ? `<label class="chq-footer-status"><span>Status</span><select id="chqStatus" aria-label="Cheque status">${statusOptions}</select></label>` : `<div class="chq-footer-status"><span>Status</span><strong>${esc(row.status)}</strong></div>`}${!fresh && canEditRecord ? `<button data-edit-cheque ${editing ? 'disabled' : ''}>Edit Details</button>` : ''}${fresh || canEditRecord ? `<button class="primary-button" data-save-cheque ${state.busy || state.modal.extracting || state.modal.issuedNotAllowed ? 'disabled' : ''}>${state.busy ? 'Saving…' : fresh ? 'Confirm & Save' : 'Save'}</button>` : ''}`;
    return `<div class="chq-overlay" data-close-overlay><div class="chq-modal" role="dialog" aria-modal="true"><header><div><h2>${fresh ? 'New Cheque' : esc(row.chequeNo)}</h2><p>${fresh ? 'Choose a cheque image to extract and save automatically.' : `${esc(companyName(row))} · Uploaded by ${esc(row.uploadedByName)}`}</p></div><button data-close-modal aria-label="Close">×</button></header><div class="chq-modal-body"><div class="chq-preview">${preview}${fresh ? `<input id="chqFile" type="file" accept="image/jpeg,image/png,application/pdf" capture="environment"><button type="button" data-extract ${state.file ? '' : 'hidden'} ${state.modal.extracting ? 'disabled' : ''}>${state.modal.extracting ? 'Extracting…' : 'Extract again'}</button><small>${state.modal.extracting ? 'Reading cheque details…' : 'Details save automatically when all required fields are clear.'}</small>` : ''}</div><div class="chq-modal-fields">${state.modal.issuedNotAllowed ? '<p role="alert" class="chq-extraction-warning">This is an issued cheque. Only Admin can upload issued cheques.</p>' : ''}${canEdit ? values : `<dl class="chq-details">${[['Company', companyName(row)], ['Type', row.type], ['Cheque No.', row.chequeNo], ['Cheque Date', row.chequeDate], ['Amount', money(row.amount)], ['Party', row.party], [row.type === 'Issued' ? 'Payor' : 'Payee', row.type === 'Issued' ? companyName(row) : row.payee], ['Bank', row.bank], ['Notes', notesWithWords(row)]].map(([a, b]) => `<div><dt>${a}</dt><dd>${esc(b || '—')}</dd></div>`).join('')}</dl>`}</div></div><footer>${footer}</footer></div></div>`;
  }
  function detectedPreviewRotation(image) {
    if (image.naturalHeight <= image.naturalWidth * 1.15) return 0;
    try {
      const sample = document.createElement('canvas'); sample.width = 128; sample.height = 256;
      const context = sample.getContext('2d', { willReadFrequently: true });
      context.drawImage(image, 0, 0, sample.width, sample.height);
      const pixels = context.getImageData(0, 0, sample.width, sample.height).data;
      const darkCount = (start, end) => {
        let count = 0;
        for (let y = 31; y < 225; y += 2) for (let x = start; x < end; x += 2) {
          const offset = (y * 128 + x) * 4;
          if (pixels[offset] + pixels[offset + 1] + pixels[offset + 2] < 300) count += 1;
        }
        return count;
      };
      const left = darkCount(8, 28);
      const right = darkCount(100, 120);
      return right > left * 1.3 ? 90 : 270;
    } catch { return 270; }
  }
  async function jpegPreviewRotation(file) {
    if (file?.type !== 'image/jpeg') return 0;
    try {
      const buffer = await file.slice(0, 65536).arrayBuffer();
      const view = new DataView(buffer);
      if (view.byteLength < 12 || view.getUint16(0) !== 0xffd8) return 0;
      for (let offset = 2; offset + 4 < view.byteLength;) {
        if (view.getUint8(offset) !== 0xff) { offset += 1; continue; }
        const marker = view.getUint8(offset + 1);
        if (marker === 0xda || marker === 0xd9) break;
        const length = view.getUint16(offset + 2);
        if (length < 2 || offset + 2 + length > view.byteLength) break;
        const payload = offset + 4;
        if (marker === 0xe1 && view.getUint32(payload) === 0x45786966) {
          const tiff = payload + 6;
          const little = view.getUint16(tiff) === 0x4949;
          const ifd = tiff + view.getUint32(tiff + 4, little);
          const count = view.getUint16(ifd, little);
          for (let index = 0; index < count; index += 1) {
            const entry = ifd + 2 + index * 12;
            if (entry + 12 > view.byteLength) break;
            if (view.getUint16(entry, little) !== 0x0112) continue;
            return ({ 3: 180, 6: 90, 8: 270 })[view.getUint16(entry + 8, little)] || 0;
          }
        }
        offset += 2 + length;
      }
    } catch { /* Fall back to the visible edge direction. */ }
    return 0;
  }
  async function orientPreview(image) {
    if (!state.modal || image.dataset.previewRendered || !image.naturalWidth) return;
    image.dataset.previewRendered = 'pending';
    const activeModal = state.modal;
    let rotation = activeModal.previewRotation;
    if (rotation == null) {
      rotation = image.naturalHeight > image.naturalWidth * 1.15
        ? (await jpegPreviewRotation(activeModal.fresh ? state.file : null)) || detectedPreviewRotation(image)
        : 0;
      if (state.modal !== activeModal || !image.isConnected) return;
      activeModal.previewRotation = rotation;
    }
    if (!rotation) return;
    try {
      const quarterTurn = rotation === 90 || rotation === 270;
      const canvas = document.createElement('canvas');
      canvas.width = quarterTurn ? image.naturalHeight : image.naturalWidth;
      canvas.height = quarterTurn ? image.naturalWidth : image.naturalHeight;
      const context = canvas.getContext('2d');
      context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
      if (rotation === 90) { context.translate(canvas.width, 0); context.rotate(Math.PI / 2); }
      else if (rotation === 180) { context.translate(canvas.width, canvas.height); context.rotate(Math.PI); }
      else if (rotation === 270) { context.translate(0, canvas.height); context.rotate(-Math.PI / 2); }
      context.drawImage(image, 0, 0);
      image.dataset.previewRendered = 'done';
      image.src = canvas.toDataURL('image/jpeg', 0.9);
    } catch { image.dataset.previewRendered = ''; }
  }
  root.addEventListener('load', event => {
    if (event.target.matches?.('[data-cheque-preview]')) orientPreview(event.target);
  }, true);
  const refresh = async () => { state.data = await request('/api/cheques'); refreshHeader(); render(); };
  async function open(user) {
    state.user = user;
    state.lastStatusDate = today();
    if (!state.dateTimer) state.dateTimer = setInterval(() => {
      if (state.lastStatusDate === today() || document.getElementById('chequeManagementView')?.classList.contains('hidden')) return;
      state.lastStatusDate = today();
      refresh().catch(error => notify(error.message));
    }, 60000);
    render();
    try { await refresh(); } catch (error) { root.innerHTML = `<div class="chq-loading">${esc(error.message)} <button id="chqRetry">Retry</button></div>`; root.querySelector('#chqRetry').onclick = () => open(user); }
  }
  function updateUploadSpinner() {
    const title = document.querySelector('.topbar:has(#chqTopCompany) h1');
    if (!title) return;
    title.querySelector('.chq-upload-spinner')?.remove();
    if (state.pendingUploads.some(item => item.stage === 'Processing')) title.insertAdjacentHTML('beforeend', '<span class="chq-upload-spinner" role="status" aria-label="Uploading cheque" title="Uploading cheque"></span>');
  }
  const newCheque = () => { if (!state.data?.companies.length) { notify('Configure a company in Settings first.'); return; } root.querySelector('#chqQuickFile')?.click(); };
  async function micrEdgeGuide(file) {
    if (!/^image\/(jpeg|png)$/.test(file.type) || !window.createImageBitmap) return null;
    const image = await createImageBitmap(file);
    try {
      const sheet = document.createElement('canvas'); sheet.width = 1600; sheet.height = 1120;
      const context = sheet.getContext('2d');
      if (!context) return null;
      context.fillStyle = '#fff'; context.fillRect(0, 0, sheet.width, sheet.height);
      const edgeWidth = Math.max(1, Math.round(image.width * 0.25));
      const edgeHeight = Math.max(1, Math.round(image.height * 0.14));
      const strips = [
        ['Top edge', 0, 0, image.width, edgeHeight, 0],
        ['Bottom edge', 0, image.height - edgeHeight, image.width, edgeHeight, 0],
        ['Left edge, rotated', 0, 0, edgeWidth, image.height, 90],
        ['Right edge, rotated', image.width - edgeWidth, 0, edgeWidth, image.height, -90]
      ];
      strips.forEach(([label, sx, sy, sw, sh, rotation], index) => {
        const strip = document.createElement('canvas');
        strip.width = rotation ? sh : sw; strip.height = rotation ? sw : sh;
        const draw = strip.getContext('2d');
        if (rotation === 90) { draw.translate(sh, 0); draw.rotate(Math.PI / 2); }
        else if (rotation === -90) { draw.translate(0, sw); draw.rotate(-Math.PI / 2); }
        draw.drawImage(image, sx, sy, sw, sh, 0, 0, sw, sh);
        const y = index * 280;
        context.fillStyle = '#172554'; context.font = '20px Arial'; context.fillText(label, 12, y + 21);
        const scale = Math.min(1600 / strip.width, 250 / strip.height);
        const width = strip.width * scale; const height = strip.height * scale;
        context.drawImage(strip, (1600 - width) / 2, y + 25 + (250 - height) / 2, width, height);
      });
      return await new Promise(resolve => sheet.toBlob(resolve, 'image/jpeg', 0.92));
    } finally { image.close?.(); }
  }
  async function appendChequeImage(data, file) {
    data.append('file', file);
    try { const guide = await micrEdgeGuide(file); if (guide) data.append('micrGuide', guide, 'cheque-edges.jpg'); } catch { /* Use the original cheque when an edge guide is unavailable. */ }
  }
  async function quickUpload(file, existingItem = null) {
    const item = existingItem || { id: `upload-${Date.now()}-${Math.random()}`, file, stage: 'Processing', details: null };
    if (!existingItem) state.pendingUploads.unshift(item);
    item.stage = 'Processing'; item.error = '';
    state.notice = '';
    state.page = 1; state.view = 'list'; state.company = ''; state.type = ''; state.status = ''; state.search = ''; refreshHeader(); render();
    try {
      let result;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const data = new FormData(); await appendChequeImage(data, file);
          result = await request('/api/cheques/extract', { method: 'POST', body: data });
        } catch (error) {
          if (attempt === 2 || !/fetch failed|network|timeout|connection/i.test(error.message)) throw error;
          await new Promise(resolve => setTimeout(resolve, 800 * (attempt + 1)));
          continue;
        }
        if (!result.retryable || attempt === 2) break;
        await new Promise(resolve => setTimeout(resolve, 800 * (attempt + 1)));
      }
      const { extracted: found = {}, warning, retryable } = result;
      const type = found.detectedType;
      const companyId = found.suggestedCompanyId;
      const details = { type, companyId, chequeNo: found.chequeNo || '', chequeDate: found.chequeDate || '', amount: String(found.amount || '').replace(/[^0-9.]/g, ''), party: type === 'Issued' ? found.payee : found.drawerName, payee: type === 'Issued' ? state.data.companies.find(company => company.id === companyId)?.name || '' : found.payee || '', bank: found.bank || '', bankAccount: type === 'Issued' ? '' : found.accountNo || '', iban: type === 'Issued' ? '' : found.iban || '', notes: found.amountWords ? `Amount in words: ${found.amountWords}` : '' };
      item.details = details;
      const uncertain = new Set((found.uncertainFields || []).map(value => String(value).toLowerCase()));
      if (warning || found.companyWarning || found.numberWarning || !type || !companyId || type === 'Issued' && !state.data.isAdmin || !details.chequeNo || !/^\d{4}-\d{2}-\d{2}$/.test(details.chequeDate) || !(Number(details.amount) > 0) || !details.party || !details.payee || ['chequeno', 'chequedate', 'amount', 'drawername', 'payee'].some(field => uncertain.has(field))) {
        item.stage = retryable ? 'Retry available' : 'Needs review'; item.error = warning || found.numberWarning || found.companyWarning || 'Some required cheque details could not be confirmed.'; render(); notify(item.error); return;
      }
      const body = new FormData(); body.append('record', JSON.stringify(details)); body.append('file', file);
      await request('/api/cheques', { method: 'POST', body });
      state.pendingUploads = state.pendingUploads.filter(upload => upload !== item);
      state.notice = ''; await refresh();
    } catch (error) { item.stage = /fetch failed|network|timeout|connection/i.test(error.message) ? 'Retry available' : 'Needs review'; item.error = error.message; render(); notify(item.error); }
  }
  function formValues() { const container = root.querySelector('.chq-modal'); const result = {}; for (const field of container.querySelectorAll('[name]')) result[field.name] = field.value; return result; }
  async function saveCheque() {
    if (state.busy) return;
    if (state.modal.issuedNotAllowed) return notify('Only Admin can upload issued cheques.');
    const values = state.modal.fresh || state.modal.editing ? formValues() : {};
    const original = state.modal.record;
    const selectedStatus = root.querySelector('#chqStatus')?.value || original.status;
    const statusChanged = !state.modal.fresh && selectedStatus !== original.status;
    state.busy = true; state.modal.record = { ...original, ...values }; state.modal.pendingStatus = selectedStatus; render();
    try {
      let response;
      if (state.modal.fresh) {
        const body = new FormData(); body.append('record', JSON.stringify(values)); if (state.file) body.append('file', state.file);
        response = await request('/api/cheques', { method: 'POST', body });
      } else {
        if (state.modal.editing) response = await request(`/api/cheques/${original.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values) });
        if (statusChanged) response = await request(`/api/cheques/${original.id}/status`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: selectedStatus }) });
      }
      if (state.modal.pendingUploadId) state.pendingUploads = state.pendingUploads.filter(item => item.id !== state.modal.pendingUploadId);
      state.modal = null; state.file = null; state.notice = ''; await refresh();
    } catch (error) { notify(error.message); } finally { state.busy = false; render(); }
  }
  async function deleteCheque() {
    if (!state.data?.isAdmin || !state.modal || state.modal.fresh || state.busy) return;
    const record = state.modal.record;
    state.busy = true; render();
    try {
      const result = await request(`/api/cheques/${encodeURIComponent(record.id)}`, { method: 'DELETE' });
      state.modal = null; state.file = null;
      await refresh();
      notify(result.imageCleanupFailed ? `Cheque ${record.chequeNo} deleted. Its image could not be removed from storage.` : `Cheque ${record.chequeNo} deleted.`);
    } catch (error) {
      if (state.modal?.record.id === record.id) state.modal.deleteError = error.message;
    } finally { state.busy = false; render(); }
  }
  async function extract(autoSave = false) {
    if (!state.file) return notify('Choose a cheque image or PDF first.');
    if (state.modal.extracting || state.busy) return;
    const activeModal = state.modal;
    const activeFile = state.file;
    state.modal.extracting = true;
    const values = formValues(); const data = new FormData(); await appendChequeImage(data, state.file); data.append('type', values.type);
    const button = root.querySelector('[data-extract]'); if (button) { button.disabled = true; button.textContent = 'Extracting…'; }
    try {
      const result = await request('/api/cheques/extract', { method: 'POST', body: data });
      if (state.modal !== activeModal || state.file !== activeFile) return;
      const found = result.extracted || {};
      const typeConflict = found.detectedType && state.modal.typeTouched && values.type !== found.detectedType;
      state.modal.issuedNotAllowed = found.detectedType === 'Issued' && !state.data.isAdmin;
      if (found.detectedType && state.data.isAdmin && !state.modal.typeTouched) values.type = found.detectedType;
      const mapping = { chequeNo: 'chequeNo', chequeDate: 'chequeDate', amount: 'amount', bank: 'bank', accountNo: 'bankAccount', iban: 'iban' };
      for (const [source, target] of Object.entries(mapping)) if (!values[target] && found[source]) values[target] = found[source];
      if (values.amount) values.amount = String(values.amount).replace(/[^0-9.]/g, '');
      if (found.amountWords && !values.notes?.includes(found.amountWords)) values.notes = [values.notes?.trim(), `Amount in words: ${found.amountWords.trim()}`].filter(Boolean).join('\n');
      if (!values.party) values.party = values.type === 'Issued' ? (found.payee || '') : (found.drawerName || '');
      if (values.type === 'Received' && !values.payee && found.payee) values.payee = found.payee;
      const companyConflict = found.suggestedCompanyId && state.modal.companyTouched && values.companyId !== found.suggestedCompanyId;
      if (found.suggestedCompanyId && (found.detectedType === 'Received' && values.type === 'Received' || found.detectedType === 'Issued' && !state.modal.companyTouched)) values.companyId = found.suggestedCompanyId;
      if (values.type === 'Issued') { values.payee = state.data.companies.find(company => company.id === values.companyId)?.name || ''; values.bankAccount = ''; values.iban = ''; }
      state.modal.record = { ...state.modal.record, ...values }; state.modal.extracting = false; render();
      const uncertain = new Set((found.uncertainFields || []).map(value => String(value).toLowerCase()));
      const needsReview = result.warning || found.companyWarning || found.numberWarning || state.modal.issuedNotAllowed || typeConflict
        || companyConflict && values.companyId !== found.suggestedCompanyId || !found.detectedType || !found.suggestedCompanyId
        || !values.chequeNo || !/^\d{4}-\d{2}-\d{2}$/.test(values.chequeDate) || !(Number(values.amount) > 0)
        || !values.party || !values.payee || ['chequeno', 'chequedate', 'amount', 'drawername', 'payee'].some(field => uncertain.has(field));
      if (autoSave && !needsReview) return saveCheque();
      const message = state.modal.issuedNotAllowed ? 'This is an issued cheque. Only Admin can upload issued cheques.'
        : typeConflict ? 'Extracted cheque type differs from your manual choice. Verify the type before saving.'
        : found.numberWarning || (companyConflict && values.companyId !== found.suggestedCompanyId ? 'Extracted company differs from your manual choice. Verify the company before saving.' : '')
        || found.companyWarning || (!values.party ? 'Party could not be read clearly. Enter it manually.' : found.uncertainFields?.length ? `Verify uncertain fields: ${found.uncertainFields.join(', ')}` : 'Extraction complete. Verify all fields before saving.');
      notify(result.warning || (autoSave ? `Review the extracted details, then select Save. ${message}` : message));
    } catch (error) { if (state.modal === activeModal) { state.modal.extracting = false; render(); notify(error.message); } }
  }
  root.addEventListener('click', async event => {
    if (event.target.matches('[data-close-overlay]')) { state.modal = null; render(); return; }
    if (event.target.closest('[data-close-modal]')) { state.modal = null; render(); return; }
    const openId = event.target.closest('[data-open-cheque]')?.dataset.openCheque;
    if (openId) { state.modal = { fresh: false, editing: false, record: state.data.records.find(r => r.id === openId) }; render(); return; }
    if (event.target.closest('[data-delete-cheque]') && state.modal && !state.busy) {
      if (state.modal.editing) state.modal.record = { ...state.modal.record, ...formValues() };
      state.modal.pendingStatus = root.querySelector('#chqStatus')?.value || state.modal.record.status;
      state.modal.confirmDelete = true; state.modal.deleteError = ''; render(); return;
    }
    if (event.target.closest('[data-cancel-delete]') && state.modal && !state.busy) { state.modal.confirmDelete = false; state.modal.deleteError = ''; render(); return; }
    if (event.target.closest('[data-confirm-delete]')) return deleteCheque();
    const reviewId = event.target.closest('[data-review-upload]')?.dataset.reviewUpload;
    if (reviewId) { const item = state.pendingUploads.find(upload => upload.id === reviewId); if (!item) return; state.file = item.file; state.modal = { fresh: true, editing: true, companyTouched: false, typeTouched: false, issuedNotAllowed: item.details?.type === 'Issued' && !state.data.isAdmin, extracting: false, pendingUploadId: item.id, record: { ...newRecord(), ...item.details } }; render(); notify(item.error || 'Review the cheque details before saving.'); return; }
    const previewTurn = event.target.closest('[data-preview-rotate]');
    if (previewTurn && state.modal) { state.modal.previewRotation = ((Number(state.modal.previewRotation || 0) + Number(previewTurn.dataset.previewRotate)) % 360 + 360) % 360; render(); return; }
    const retryId = event.target.closest('[data-retry-upload]')?.dataset.retryUpload;
    if (retryId) { const item = state.pendingUploads.find(upload => upload.id === retryId); if (item && item.stage === 'Retry available') quickUpload(item.file, item); return; }
    const tab = event.target.closest('[data-type-tab]'); if (tab) { state.type = tab.dataset.typeTab; state.page = 1; refreshHeader(); render(); return; }
    const flowDays = event.target.closest('[data-flow-days]'); if (flowDays) { state.alertDays = Number(flowDays.dataset.flowDays); render(); return; }
    const view = event.target.closest('[data-view]'); if (view) { state.view = view.dataset.view; render(); return; }
    const page = event.target.closest('[data-page]'); if (page) { state.page += page.dataset.page === 'next' ? 1 : -1; render(); return; }
    const month = event.target.closest('[data-month]'); if (month) { const d = new Date(`${state.month || today().slice(0, 7)}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + (month.dataset.month === 'next' ? 1 : -1)); state.month = d.toISOString().slice(0, 7); render(); return; }
    const date = event.target.closest('[data-date]'); if (date) { const items = dataRows().filter(r => r.chequeDate === date.dataset.date); root.querySelector('#chqCalendarDate').innerHTML = `<h3>${esc(date.dataset.date)}</h3>${items.map(r => `<button data-open-cheque="${esc(r.id)}">${esc(r.chequeNo)} · ${esc(r.party)} · ${money(r.amount)}</button>`).join('') || '<p>No cheques on this date.</p>'}`; return; }
    if (event.target.matches('[data-edit-cheque]')) { state.modal.pendingStatus = root.querySelector('#chqStatus')?.value || state.modal.record.status; state.modal.editing = true; render(); return; }
    if (event.target.matches('[data-save-cheque]')) return saveCheque();
    if (event.target.matches('[data-extract]')) return extract();
  });
  root.addEventListener('keydown', event => {
    if (event.target.matches('tr[data-open-cheque]') && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault(); event.target.click();
    }
  });
  root.addEventListener('change', event => {
    if (event.target.id === 'chqQuickFile') { const file = event.target.files?.[0]; if (file) quickUpload(file); return; }
    if (state.modal?.fresh && (event.target.name === 'companyId' || event.target.name === 'type')) {
      const values = formValues();
      if (event.target.name === 'companyId') state.modal.companyTouched = true;
      if (event.target.name === 'type') state.modal.typeTouched = true;
      if (values.type === 'Issued') { values.payee = state.data.companies.find(company => company.id === values.companyId)?.name || ''; values.bankAccount = ''; values.iban = ''; }
      else if (event.target.name === 'type') values.payee = '';
      state.modal.record = { ...state.modal.record, ...values };
      render();
      return;
    }
    if (event.target.id === 'chqFile') { state.file = event.target.files[0] || null; state.modal.extracting = false; state.modal.previewRotation = undefined; state.modal.record = { ...state.modal.record, ...formValues() }; render(); if (state.file) extract(true); return; }
    const key = event.target.dataset.filter; if (key) { state[key] = event.target.value; state.page = 1; render(); }
  });
  root.addEventListener('input', event => { if (event.target.dataset.filter === 'search') { const index = [...root.querySelectorAll('[data-filter="search"]')].indexOf(event.target); state.search = event.target.value; state.page = 1; const pos = event.target.selectionStart; render(); const input = root.querySelectorAll('[data-filter="search"]')[index]; input?.focus(); input?.setSelectionRange(pos, pos); } });
  function settingsCard() {
    return `<section class="inventory-card settings-card chq-settings-card"><div class="inventory-topbar"><div><h2>Cheque Settings</h2><p class="inventory-muted">Configure up to three companies with one bank account each. Only Admin can change settings.</p></div><button class="primary-button" data-cheque-settings-save>Save Cheque Settings</button></div><div id="chqSettingsFields">Loading cheque settings…</div></section>`;
  }
  async function loadSettings() {
    const target = document.getElementById('chqSettingsFields'); if (!target) return;
    try {
      const { config, companies } = await request('/api/cheques/settings');
      target.innerHTML = `<div class="chq-settings-grid">${[0, 1, 2].map(index => { const c = companies[index] || {}; const account = c.accounts?.[0] || {}; return `<fieldset data-company-index="${index}"><legend>Company ${index + 1}</legend><input type="hidden" data-key="id" value="${esc(c.id || `company${index + 1}`)}">${field('Legal Name', 'name', c.name || '')}${field('Aliases (comma separated)', 'aliases', (c.aliases || []).join(', '))}<div data-bank-index="0"><strong>Bank account 1</strong>${field('Bank Name', 'bank', account.bank || '')}${field('Account No.', 'accountNo', account.accountNo || '')}${field('IBAN', 'iban', account.iban || '')}</div></fieldset>`; }).join('')}</div><label class="chq-settings-toggle"><input type="checkbox" id="chqStaffUpload" ${config.staffReceivedUploads ? 'checked' : ''}> Allow Staff to upload Received cheques</label>`;
    } catch (error) { target.textContent = error.message; }
  }
  async function saveSettings() {
    const companies = [...document.querySelectorAll('#chqSettingsFields [data-company-index]')].map(group => { const get = name => group.querySelector(`[name="${name}"]`)?.value.trim() || ''; const id = group.querySelector('[data-key="id"]').value; const accounts = [...group.querySelectorAll('[data-bank-index]')].map(bankGroup => { const value = key => bankGroup.querySelector(`[name="${key}"]`)?.value.trim() || ''; return { bank: value('bank'), accountNo: value('accountNo'), iban: value('iban') }; }).filter(a => a.bank || a.accountNo || a.iban); return { id, name: get('name'), aliases: get('aliases').split(',').map(x => x.trim()).filter(Boolean), accounts }; }).filter(c => c.name);
    try { await request('/api/cheques/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companies, staffReceivedUploads: document.getElementById('chqStaffUpload').checked }) }); alert('Cheque settings saved.'); } catch (error) { alert(error.message); }
  }
  window.chequeManagement = { open, newCheque, settingsCard, loadSettings, saveSettings, headerControls, bindHeader };
})();
