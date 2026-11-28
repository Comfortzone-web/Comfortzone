const crypto = require('crypto');

const STATUSES = ['Pending', 'Deposited', 'Returned', 'Cancelled'];
const dubaiDate = value => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dubai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(value);
const currentStatus = (record, now = new Date()) => {
  const history = record.history || [];
  let lastStatusChange = -1;
  let lastDateEdit = -1;
  history.forEach((entry, index) => {
    if (entry.action === 'Status changed') lastStatusChange = index;
    if (entry.action === 'Edited' && entry.fields?.includes('chequeDate')) lastDateEdit = index;
  });
  const dateChangedAfterStatus = lastDateEdit > lastStatusChange;
  const automatic = record.statusMode === 'auto' || dateChangedAfterStatus && !['Returned', 'Cancelled'].includes(record.status);
  if (!automatic && ['Returned', 'Cancelled', 'Deposited', 'Cleared'].includes(record.status)) return record.status === 'Cleared' ? 'Deposited' : record.status;
  const manuallyPending = !automatic && (record.statusMode === 'manual' || (record.statusMode == null && history.some(entry => entry.action === 'Status changed' && entry.status === 'Pending')));
  if (manuallyPending || !record.chequeDate || !record.createdAt) return 'Pending';
  const createdDate = dubaiDate(new Date(record.createdAt));
  if (createdDate > record.chequeDate) return 'Pending';
  const date = dubaiDate(now);
  return date === record.chequeDate ? 'Today Deposit' : date > record.chequeDate ? 'Deposited' : 'Pending';
};
const text = value => String(value ?? '').trim();
const companyNameKey = value => text(value).normalize('NFKC').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/LLC$/, '');
const companyMatches = (companies, name) => {
  const key = companyNameKey(name);
  return key ? companies.filter(company => [company.name, ...(company.aliases || [])].some(alias => companyNameKey(alias) === key)) : [];
};
const admin = user => String(user?.role).toLowerCase() === 'admin';
const staff = user => String(user?.role).toLowerCase() === 'staff';
const mts = user => String(user?.role).toLowerCase() === 'mts';
const chequeStaff = user => staff(user) || mts(user);
const defaultConfig = () => ({ companies: [], reminderDays: [7, 3, 1, 0], overdueReminders: true, staffReceivedUploads: true });

function createChequeManagement({ read, write, readSettings, writeSettings, saveUpload, readUpload, deleteUpload, send, readJson, collect, parseMultipart, callOpenAIJson, model }) {
  let pending = Promise.resolve();
  const withLock = operation => {
    const result = pending.then(operation);
    pending = result.catch(() => {});
    return result;
  };
  const configOf = settings => ({ ...defaultConfig(), ...(settings.chequeManagement || {}) });
  const companiesOf = settings => {
    const configured = configOf(settings).companies || [];
    if (configured.length) return configured.filter(company => text(company.name));
    return ['company', 'company2', 'company3'].map((key, index) => ({ id: key, name: text(settings[key]?.name), aliases: [], accounts: [] })).filter(company => company.name);
  };
  const visible = (record, user) => admin(user) || record.uploadedById === user.id;
  const safe = (record, user) => admin(user) ? { ...record, status: currentStatus(record), legacyCleared: record.status === 'Cleared' } : { ...record, status: currentStatus(record), legacyCleared: record.status === 'Cleared', history: (record.history || []).map(entry => ({ ...entry, changes: undefined })) };
  const validDate = date => /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date));
  const uniqueKey = record => `${record.companyId}\u0000${text(record.chequeNo).toUpperCase().replace(/[\s-]/g, '')}`;
  const save = async store => write(store);
  const failure = (res, status, error) => send(res, status, { error });
  async function route(req, res, url, user) {
    if (!admin(user) && !chequeStaff(user)) return failure(res, 403, 'Cheque Management is not available to this login');
    const path = url.pathname;
    const settings = await readSettings();
    const config = configOf(settings);
    const companies = companiesOf(settings);
    if (req.method === 'GET' && path === '/api/cheques') {
      const store = await read();
      return send(res, 200, { records: (store.records || []).filter(record => visible(record, user)).map(record => safe(record, user)), companies: companies.map(company => ({ id: company.id, name: company.name })), config: { reminderDays: config.reminderDays, overdueReminders: config.overdueReminders, staffReceivedUploads: config.staffReceivedUploads }, isAdmin: admin(user) });
    }
    if (path === '/api/cheques/settings') {
      if (!admin(user)) return failure(res, 403, 'Admin access required');
      if (req.method === 'GET') return send(res, 200, { config, companies });
      if (req.method === 'PUT') {
        const body = await readJson(req);
        const supplied = Array.isArray(body.companies) ? body.companies.slice(0, 3) : [];
        if (supplied.some(company => !text(company.name))) return failure(res, 400, 'Each company needs a name');
        const used = new Set();
        const next = supplied.map((company, index) => {
          const id = text(company.id) || `company${index + 1}`;
          if (used.has(id)) throw new Error('Duplicate company');
          used.add(id);
          return { id, name: text(company.name), aliases: Array.isArray(company.aliases) ? company.aliases.map(text).filter(Boolean) : [], accounts: Array.isArray(company.accounts) ? company.accounts.slice(0, 1).map(account => ({ bank: text(account.bank), accountNo: text(account.accountNo), iban: text(account.iban) })).filter(account => account.bank || account.accountNo || account.iban) : [] };
        });
        settings.chequeManagement = { companies: next, reminderDays: [7, 3, 1, 0], overdueReminders: config.overdueReminders, staffReceivedUploads: body.staffReceivedUploads !== false };
        await writeSettings(settings);
        return send(res, 200, { config: settings.chequeManagement });
      }
    }
    if (req.method === 'POST' && path === '/api/cheques/extract') {
      const parts = parseMultipart(await collect(req), req.headers['content-type'] || '');
      const file = parts.find(part => part.name === 'file' && part.filename);
      if (!file || !['image/jpeg', 'image/png', 'application/pdf'].includes(file.mimeType) || file.body.length > 12 * 1024 * 1024) return failure(res, 400, 'Upload a JPG, PNG, or PDF under 12 MB');
      if (!process.env.OPENAI_API_KEY) return send(res, 200, { extracted: {}, warning: 'AI extraction is unavailable. Enter the cheque details manually.' });
      try {
        const dataUrl = `data:${file.mimeType};base64,${file.body.toString('base64')}`;
        const media = file.mimeType === 'application/pdf' ? { type: 'input_file', filename: file.filename, file_data: dataUrl } : { type: 'input_image', image_url: dataUrl, detail: 'high' };
        const edgeGuide = parts.find(part => part.name === 'micrGuide' && part.mimeType === 'image/jpeg' && part.body.length <= 3 * 1024 * 1024);
        const guideMedia = edgeGuide ? { type: 'input_image', image_url: `data:image/jpeg;base64,${edgeGuide.body.toString('base64')}`, detail: 'high' } : null;
        const fields = ['chequeNo', 'chequeDate', 'amount', 'amountWords', 'bank', 'drawerName', 'payee', 'accountNo', 'iban', 'type', 'companyName', 'uncertainFields'];
        const output = await callOpenAIJson('cheque-extraction', { type: 'object', properties: Object.fromEntries(fields.map(key => [key, key === 'uncertainFields' ? { type: 'array', items: { type: 'string' } } : { type: 'string' }])), required: fields, additionalProperties: false }, [{ type: 'input_text', text: 'Read the cheque image carefully, including sideways or rotated images. Find chequeNo in the printed MICR line at the bottom edge of the physical cheque (this may appear at the side of a rotated photo). It is commonly the first short number group; distinguish it from the longer account and routing numbers. Prefer a clearly labeled Cheque No. elsewhere if present. Preserve every leading zero exactly. If the number cannot be read reliably, return an empty chequeNo and mark it uncertain; never use an account number as chequeNo. Return drawerName as the legal name of the person or company that ISSUED the cheque. On UAE cheques this name is often printed beside the IBAN/account details near an edge of the cheque; inspect the entire image, including small vertical or sideways print. Return payee separately: the handwritten or printed name after "Pay against this Cheque to". Never substitute payee for drawerName or assume the payee is the issuer. For a Received cheque the Party is the drawerName; for an Issued cheque the Party is the payee. Do not infer type solely from the image if unclear. chequeDate is the single date written on the cheque, formatted YYYY-MM-DD. Preserve visible legal-name spelling and suffixes such as LLC. If any name is unreadable, leave it blank and include its field in uncertainFields; never guess. companyName is only the internal ERP company if identifiable. For accountNo, return a value ONLY when a separate account number is explicitly printed beneath the IBAN area on the cheque. Otherwise return an empty string. Never derive accountNo from the IBAN, MICR line, or cheque number. Extract only visible details.' }, media]);
        const extracted = output || {};
        let numberCheck;
        try {
          numberCheck = await callOpenAIJson('cheque-number-verification', { type: 'object', properties: { chequeNo: { type: 'string' } }, required: ['chequeNo'], additionalProperties: false }, [{ type: 'input_text', text: 'Independently read ONLY the printed cheque number from the MICR line. The second image, when present, shows enlarged top, bottom, left and right edge strips from the same cheque; the vertical strips have been rotated horizontally. Find the short six-digit group before the MICR separator, including its final digit and every leading zero. Compare the edge strip with the original image. Never use the account number, routing number, date or amount. If all six digits cannot be read reliably, return an empty string.' }, media, ...(guideMedia ? [guideMedia] : [])]);
        } catch { numberCheck = null; }
        const firstNumber = text(extracted.chequeNo).replace(/[^0-9]/g, '');
        const checkedNumber = text(numberCheck?.chequeNo).replace(/[^0-9]/g, '');
        let verifiedNumber = '';
        if (/^\d{6}$/.test(checkedNumber) && (!/^\d{6}$/.test(firstNumber) || checkedNumber === firstNumber)) verifiedNumber = checkedNumber;
        else if (/^\d{6}$/.test(checkedNumber) && /^\d{6}$/.test(firstNumber) && checkedNumber !== firstNumber) {
          if (guideMedia) {
            try {
              const tieBreak = await callOpenAIJson('cheque-number-final-check', { type: 'object', properties: { chequeNo: { type: 'string' } }, required: ['chequeNo'], additionalProperties: false }, [{ type: 'input_text', text: `The full-image reading was ${firstNumber} and the edge-strip reading was ${checkedNumber}. Read the six printed cheque-number digits independently from this enlarged edge-strip image. Do not assume either previous reading is correct. Preserve leading zeros; return an empty string if the final digit is unclear.` }, guideMedia]);
              const finalNumber = text(tieBreak?.chequeNo).replace(/[^0-9]/g, '');
              if (finalNumber === firstNumber || finalNumber === checkedNumber) verifiedNumber = finalNumber;
            } catch { /* Keep the original reading for manual review. */ }
          }
          if (!verifiedNumber) extracted.numberWarning = 'Two readings of the printed cheque number disagree. Check the six digits in the image before saving.';
        } else if (/^\d{5}$/.test(firstNumber) || /^\d{5}$/.test(checkedNumber)) {
          extracted.numberWarning = 'The printed cheque number appears incomplete. Check all six digits in the image before saving.';
        }
        extracted.chequeNo = verifiedNumber || firstNumber || checkedNumber;
        if (verifiedNumber) extracted.uncertainFields = (extracted.uncertainFields || []).filter(field => text(field).toLowerCase() !== 'chequeno');
        const payeeMatches = companyMatches(companies, extracted.payee);
        const drawerMatches = companyMatches(companies, extracted.drawerName);
        if (payeeMatches.length === 1 && drawerMatches.length === 0) {
          extracted.detectedType = 'Received';
          extracted.suggestedCompanyId = payeeMatches[0].id;
        } else if (drawerMatches.length === 1 && payeeMatches.length === 0) {
          extracted.detectedType = 'Issued';
          extracted.suggestedCompanyId = drawerMatches[0].id;
        } else if (payeeMatches.length || drawerMatches.length) {
          extracted.companyWarning = 'Both cheque names match configured companies, or a name matches more than one company. Verify the type and company manually.';
        } else {
          const namedMatches = companyMatches(companies, extracted.companyName);
          const accountMatches = companies.filter(company => (company.accounts || []).some(account =>
            (extracted.iban && text(account.iban).replace(/\s/g, '').toUpperCase() === text(extracted.iban).replace(/\s/g, '').toUpperCase()) ||
            (extracted.accountNo && text(account.accountNo).replace(/\s/g, '') === text(extracted.accountNo).replace(/\s/g, ''))));
          const matches = namedMatches.length ? namedMatches : accountMatches;
          if (matches.length === 1) extracted.suggestedCompanyId = matches[0].id;
          else if (matches.length > 1) extracted.companyWarning = 'More than one company matches. Choose the correct company manually.';
          if (!extracted.companyWarning) extracted.companyWarning = 'Could not confirm cheque type from the payee and printed issuer. Verify the type and company manually.';
        }
        if (extracted.detectedType === 'Issued') {
          extracted.accountNo = '';
          extracted.iban = '';
        } else if (text(extracted.accountNo)) {
          let accountCheck;
          try {
            accountCheck = await callOpenAIJson('cheque-account-verification', { type: 'object', properties: { accountNo: { type: 'string' } }, required: ['accountNo'], additionalProperties: false }, [{ type: 'input_text', text: 'Read only a separately printed account number explicitly labeled Account No. in the cheque body BELOW the printed IBAN area. If no account number is printed there, return an empty string. Do not derive one from the IBAN, MICR line, cheque number, routing number, or bank details. If unclear, return an empty string.' }, media]);
          } catch { accountCheck = null; }
          if (text(accountCheck?.accountNo).replace(/\s/g, '') !== text(extracted.accountNo).replace(/\s/g, '')) extracted.accountNo = '';
        }
        return send(res, 200, { extracted });
      } catch (error) {
        const retryable = /fetch failed|network|timeout|econnreset|etimedout|enotfound/i.test(String(error?.message || '') + ' ' + String(error?.cause?.code || '')) || [408, 429, 500, 502, 503, 504].includes(Number(error?.status));
        console.error('[cheques] extraction failed', error?.message, error?.cause?.code || '', error?.status || '');
        return send(res, 200, {
          extracted: {},
          retryable,
          warning: retryable ? 'Cheque extraction could not reach the AI service. Retrying is available.' : `Cheque extraction failed: ${error.message}. Review the cheque details.`
        });
      }
    }
    if (req.method === 'POST' && path === '/api/cheques') return withLock(async () => {
      if (!admin(user) && !config.staffReceivedUploads) return failure(res, 403, 'Staff cheque uploads are disabled');
      const contentType = req.headers['content-type'] || '';
      let body; let file;
      if (contentType.includes('multipart/form-data')) {
        const parts = parseMultipart(await collect(req), contentType);
        body = JSON.parse(parts.find(part => part.name === 'record')?.body.toString('utf8') || '{}');
        file = parts.find(part => part.name === 'file' && part.filename);
      } else body = await readJson(req);
      const type = text(body.type);
      if (!['Received', 'Issued'].includes(type) || (chequeStaff(user) && type !== 'Received')) return failure(res, 403, 'Staff and MTS can upload Received cheques only');
      if (!companies.some(company => company.id === body.companyId)) return failure(res, 400, 'Select a configured company');
      if (type === 'Received' && text(body.payee)) {
        const matches = companyMatches(companies, body.payee);
        if (matches.length !== 1 || matches[0].id !== body.companyId) return failure(res, 400, 'Payee does not match the selected company. Correct the payee or add its alias in Cheque Settings.');
      }
      const selectedCompany = companies.find(company => company.id === body.companyId);
      if (type === 'Issued' && text(body.payee) && !companyMatches([selectedCompany], body.payee).length) return failure(res, 400, 'Payor must match the selected company.');
      if (!text(body.chequeNo) || !validDate(body.chequeDate) || !text(body.party) || !Number.isFinite(Number(body.amount)) || !(Number(body.amount) > 0)) return failure(res, 400, 'Company, cheque number, cheque date, party and amount are required');
      const store = await read();
      const candidate = { companyId: body.companyId, chequeNo: body.chequeNo };
      const existing = (store.records || []).find(record => uniqueKey(record) === uniqueKey(candidate));
      if (existing) return failure(res, 409, `Cheque ${existing.chequeNo} was already uploaded for this company`);
      if (file && (!['image/jpeg', 'image/png', 'application/pdf'].includes(file.mimeType) || file.body.length > 12 * 1024 * 1024)) return failure(res, 400, 'Upload a JPG, PNG, or PDF under 12 MB');
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const record = { id, companyId: body.companyId, type, chequeNo: text(body.chequeNo), chequeDate: body.chequeDate, issueDate: body.chequeDate, party: text(body.party), amount: Number(body.amount), amountWords: text(body.amountWords), bank: text(body.bank), bankAccount: type === 'Issued' ? '' : text(body.bankAccount), iban: type === 'Issued' ? '' : text(body.iban), payee: type === 'Issued' ? selectedCompany.name : text(body.payee), notes: text(body.notes), status: 'Pending', uploadedById: user.id, uploadedByName: user.name, createdAt: now, updatedAt: now, image: null, history: [{ at: now, byId: user.id, byName: user.name, action: 'Created', status: 'Pending' }] };
      if (file) {
        const storedName = `${id}.${file.mimeType === 'application/pdf' ? 'pdf' : file.mimeType === 'image/png' ? 'png' : 'jpg'}`;
        await saveUpload(`cheques/${id}`, storedName, file.body, file.mimeType);
        record.image = { storedName, mimeType: file.mimeType, originalName: file.filename };
      }
      store.records = [...(store.records || []), record];
      await save(store);
      return send(res, 201, { record: safe(record, user) });
    });
    const match = path.match(/^\/api\/cheques\/([^/]+)(?:\/(image|status))?$/);
    if (match) {
      const store = await read();
      const record = (store.records || []).find(item => item.id === match[1]);
      if (!record) return failure(res, 404, 'Cheque not found');
      if (!visible(record, user)) return failure(res, 403, 'Access denied');
      if (req.method === 'GET' && match[2] === 'image') {
        if (!record.image) return failure(res, 404, 'Image not found');
        const bytes = await readUpload(`cheques/${record.id}`, record.image.storedName);
        if (!bytes) return failure(res, 404, 'Image not found');
        res.writeHead(200, { 'Content-Type': record.image.mimeType, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
        return res.end(bytes);
      }
      if (req.method === 'DELETE' && !match[2]) return withLock(async () => {
        if (!admin(user)) return failure(res, 403, 'Only Admin can delete cheques');
        const latestStore = await read();
        const latest = (latestStore.records || []).find(item => item.id === record.id);
        if (!latest) return failure(res, 404, 'Cheque not found');
        latestStore.records = latestStore.records.filter(item => item.id !== latest.id);
        await save(latestStore);
        let imageCleanupFailed = false;
        if (latest.image && deleteUpload) {
          try { await deleteUpload(`cheques/${latest.id}`, latest.image.storedName); }
          catch (error) { imageCleanupFailed = true; console.error('[cheques] image cleanup failed', latest.id, error?.message); }
        }
        return send(res, 200, { deleted: true, id: latest.id, imageCleanupFailed });
      });
      if (req.method === 'PATCH' && !match[2]) return withLock(async () => {
        const body = await readJson(req);
        const latestStore = await read();
        const latest = latestStore.records.find(item => item.id === record.id);
        if (!latest) return failure(res, 404, 'Cheque not found');
        if (!visible(latest, user) || (!admin(user) && latest.type !== 'Received')) return failure(res, 403, 'Access denied');
        const next = { ...latest };
        for (const key of ['party', 'chequeDate', 'issueDate', 'amount', 'amountWords', 'bank', 'bankAccount', 'iban', 'payee', 'notes', 'chequeNo', 'companyId']) if (body[key] !== undefined) next[key] = key === 'amount' ? Number(body[key]) : text(body[key]);
        if (!companies.some(company => company.id === next.companyId) || !validDate(next.chequeDate) || !Number.isFinite(next.amount) || !(next.amount > 0) || !next.chequeNo || !next.party) return failure(res, 400, 'Complete all required cheque fields');
        if (next.chequeDate !== latest.chequeDate && !['Returned', 'Cancelled'].includes(latest.status)) {
          next.status = 'Pending';
          next.statusMode = 'auto';
        }
        next.issueDate = next.chequeDate;
        if (body.notes !== undefined) next.amountWords = '';
        if (next.type === 'Issued') {
          const selectedCompany = companies.find(company => company.id === next.companyId);
          if (body.payee !== undefined && text(body.payee) && !companyMatches([selectedCompany], body.payee).length) return failure(res, 400, 'Payor must match the selected company.');
          next.payee = selectedCompany.name;
          next.bankAccount = '';
          next.iban = '';
        } else if (text(next.payee)) {
          const matches = companyMatches(companies, next.payee);
          if (matches.length !== 1 || matches[0].id !== next.companyId) return failure(res, 400, 'Payee does not match the selected company. Correct the payee or add its alias in Cheque Settings.');
        }
        if (latestStore.records.some(item => item.id !== latest.id && uniqueKey(item) === uniqueKey(next))) return failure(res, 409, 'Cheque number already uploaded for this company');
        const changes = [...Object.keys(body).filter(key => next[key] !== latest[key]), ...(['status', 'statusMode'].filter(key => next[key] !== latest[key]))];
        next.updatedAt = new Date().toISOString();
        next.history = [...latest.history, { at: next.updatedAt, byId: user.id, byName: user.name, action: 'Edited', fields: changes, changes: Object.fromEntries(changes.map(key => [key, { from: latest[key], to: next[key] }])) }];
        latestStore.records = latestStore.records.map(item => item.id === next.id ? next : item);
        await save(latestStore);
        return send(res, 200, { record: safe(next, user) });
      });
      if (req.method === 'POST' && match[2] === 'status') return withLock(async () => {
        const body = await readJson(req);
        const latestStore = await read();
        const latest = latestStore.records.find(item => item.id === record.id);
        if (!latest) return failure(res, 404, 'Cheque not found');
        if (!visible(latest, user) || (!admin(user) && latest.type !== 'Received')) return failure(res, 403, 'Access denied');
        if (!STATUSES.includes(body.status)) return failure(res, 400, 'Invalid status');
        const now = new Date().toISOString();
        latest.status = body.status;
        latest.statusMode = 'manual';
        latest.updatedAt = now;
        latest.history.push({ at: now, byId: user.id, byName: user.name, action: 'Status changed', status: body.status, note: text(body.note) });
        await save(latestStore);
        return send(res, 200, { record: safe(latest, user) });
      });
    }
    return failure(res, 404, 'Not found');
  }
  return { route };
}

module.exports = { createChequeManagement, currentStatus };
