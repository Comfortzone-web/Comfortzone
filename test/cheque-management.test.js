const test = require('node:test');
const assert = require('node:assert/strict');
const { createChequeManagement, currentStatus } = require('../cheque-management');

test('cheque date changes the automatic status but a late upload or manual Pending stays Pending', () => {
  const now = new Date('2026-11-28T08:00:00Z');
  const record = { status: 'Pending', chequeDate: '2026-11-28', createdAt: '2026-11-27T08:00:00Z', history: [] };
  assert.equal(currentStatus(record, new Date('2026-11-27T08:00:00Z')), 'Pending');
  assert.equal(currentStatus(record, now), 'Today Deposit');
  assert.equal(currentStatus(record, new Date('2026-11-29T08:00:00Z')), 'Deposited');
  assert.equal(currentStatus({ ...record, createdAt: '2026-11-29T08:00:00Z' }, new Date('2026-11-29T08:00:00Z')), 'Pending');
  assert.equal(currentStatus({ ...record, statusMode: 'manual' }, new Date('2026-11-29T08:00:00Z')), 'Pending');
  assert.equal(currentStatus({ ...record, status: 'Returned' }, now), 'Returned');
  assert.equal(currentStatus({ ...record, status: 'Cancelled' }, now), 'Cancelled');
  assert.equal(currentStatus({ ...record, status: 'Deposited', history: [{ action: 'Status changed', status: 'Deposited' }, { action: 'Edited', fields: ['chequeDate'] }] }, now), 'Today Deposit');
});

test('manually restoring Pending prevents a previously due cheque from auto-depositing again', async () => {
  const { call, setStore } = fixture();
  const created = await call('POST', '/api/cheques', alice, cheque('one', 'MANUAL-1'));
  const id = created.body.record.id;
  const dueDate = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const createdAt = new Date(Date.now() - 3 * 86400000).toISOString();
  setStore({ records: [{ ...created.body.record, chequeDate: dueDate, createdAt, status: 'Pending' }] });
  assert.equal((await call('GET', '/api/cheques', alice)).body.records[0].status, 'Deposited');
  const changed = await call('POST', `/api/cheques/${id}/status`, alice, { status: 'Pending' });
  assert.equal(changed.body.record.status, 'Pending');
  assert.equal((await call('GET', '/api/cheques', alice)).body.records[0].status, 'Pending');
});

test('editing a deposited cheque date to today restores Today Deposit', async () => {
  const { call } = fixture();
  const created = await call('POST', '/api/cheques', alice, cheque('one', 'DATE-1'));
  const id = created.body.record.id;
  assert.equal((await call('POST', `/api/cheques/${id}/status`, alice, { status: 'Deposited' })).status, 200);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dubai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const edited = await call('PATCH', `/api/cheques/${id}`, alice, { chequeDate: today });
  assert.equal(edited.status, 200);
  assert.equal(edited.body.record.status, 'Today Deposit');
  assert.equal(edited.body.record.statusMode, 'auto');
  assert.equal((await call('GET', '/api/cheques', alice)).body.records[0].status, 'Today Deposit');
});

function fixture() {
  let store = { records: [] };
  const deletedUploads = [];
  let settings = { chequeManagement: { companies: [{ id: 'one', name: 'Company One' }, { id: 'two', name: 'Company Two' }], staffReceivedUploads: true } };
  const api = createChequeManagement({
    read: async () => structuredClone(store),
    write: async value => { store = structuredClone(value); },
    readSettings: async () => structuredClone(settings),
    writeSettings: async value => { settings = structuredClone(value); },
    saveUpload: async () => {}, readUpload: async () => null,
    deleteUpload: async (scope, name) => { deletedUploads.push({ scope, name }); },
    send: (res, status, body) => { res.status = status; res.body = body; return body; },
    readJson: async req => req.body || {}, collect: async () => Buffer.alloc(0), parseMultipart: () => [],
    callOpenAIJson: async () => ({})
  });
  const call = async (method, path, user, body) => {
    const res = {};
    await api.route({ method, body, headers: {} }, res, new URL(`http://localhost${path}`), user);
    return res;
  };
  return { call, setStore: value => { store = structuredClone(value); }, deletedUploads };
}

test('extraction requests the lower-left drawer name separately from the payee', async () => {
  let schema; let prompt;
  const api = createChequeManagement({
    read: async () => ({ records: [] }), write: async () => {},
    readSettings: async () => ({ company: { name: 'Comfort Zone AC Devices Tr. LLC' }, company2: { name: 'City way Airconditioning LLC' } }), writeSettings: async () => {},
    saveUpload: async () => {}, readUpload: async () => null,
    send: (res, status, body) => { res.status = status; res.body = body; },
    readJson: async () => ({}), collect: async () => Buffer.from('file'),
    parseMultipart: () => [{ name: 'file', filename: 'cheque.jpg', mimeType: 'image/jpeg', body: Buffer.from('image') }],
    callOpenAIJson: async (name, requestedSchema, content) => {
      if (name === 'cheque-extraction') { schema = requestedSchema; prompt = content[0].text; }
      return { chequeNo: '000582', drawerName: 'ORAS GENERAL TRADING LLC', payee: 'COMFORT ZONE A/C DEVICES TR LLC', uncertainFields: [] };
    }
  });
  const previous = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'test-only';
  try {
    const res = {};
    await api.route({ method: 'POST', headers: { 'content-type': 'multipart/form-data; boundary=test' } }, res, new URL('http://localhost/api/cheques/extract'), boss);
    assert.equal(res.status, 200);
    assert.equal(res.body.extracted.drawerName, 'ORAS GENERAL TRADING LLC');
    assert.equal(res.body.extracted.payee, 'COMFORT ZONE A/C DEVICES TR LLC');
    assert.equal(res.body.extracted.chequeNo, '000582');
    assert.equal(res.body.extracted.suggestedCompanyId, 'company');
    assert.equal(res.body.extracted.detectedType, 'Received');
    assert.ok(schema.required.includes('drawerName'));
    assert.match(prompt, /sideways or rotated/);
    assert.match(prompt, /IBAN\/account details/);
    assert.match(prompt, /printed MICR line/);
    assert.match(prompt, /leading zero/);
  } finally {
    if (previous === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previous;
  }
});

test('temporary extraction connection failure can be retried without entering cheque details', async () => {
  const api = createChequeManagement({
    read: async () => ({ records: [] }), write: async () => {},
    readSettings: async () => ({ chequeManagement: { companies: [{ id: 'one', name: 'Company One' }] } }), writeSettings: async () => {},
    saveUpload: async () => {}, readUpload: async () => null,
    send: (res, status, body) => { res.status = status; res.body = body; },
    readJson: async () => ({}), collect: async () => Buffer.from('file'),
    parseMultipart: () => [{ name: 'file', filename: 'cheque.jpg', mimeType: 'image/jpeg', body: Buffer.from('image') }],
    callOpenAIJson: async () => { const error = new Error('fetch failed'); error.cause = { code: 'ENOTFOUND' }; throw error; }
  });
  const previous = process.env.OPENAI_API_KEY;
  const previousError = console.error;
  process.env.OPENAI_API_KEY = 'test-only';
  console.error = () => {};
  try {
    const res = {};
    await api.route({ method: 'POST', headers: { 'content-type': 'multipart/form-data; boundary=test' } }, res, new URL('http://localhost/api/cheques/extract'), boss);
    assert.equal(res.status, 200);
    assert.equal(res.body.retryable, true);
    assert.deepEqual(res.body.extracted, {});
    assert.match(res.body.warning, /Retrying is available/);
  } finally {
    console.error = previousError;
    if (previous === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previous;
  }
});

test('printed issuer identifies an issued cheque even when the form defaults to Received', async () => {
  const api = createChequeManagement({
    read: async () => ({ records: [] }), write: async () => {},
    readSettings: async () => ({ chequeManagement: { companies: [{ id: 'al-mahira', name: 'Al Mahira Technical Services' }, { id: 'comfort', name: 'Comfort Zone AC Devices Tr. LLC' }] } }), writeSettings: async () => {},
    saveUpload: async () => {}, readUpload: async () => null,
    send: (res, status, body) => { res.status = status; res.body = body; },
    readJson: async () => ({}), collect: async () => Buffer.from('file'),
    parseMultipart: () => [
      { name: 'file', filename: 'issued.jpg', mimeType: 'image/jpeg', body: Buffer.from('image') },
      { name: 'type', body: Buffer.from('Received') }
    ],
    callOpenAIJson: async () => ({ drawerName: 'AL MAHIRA TECHNICAL SERVICES LLC', payee: 'External Payee', uncertainFields: [] })
  });
  const previous = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'test-only';
  try {
    const res = {};
    await api.route({ method: 'POST', headers: { 'content-type': 'multipart/form-data; boundary=test' } }, res, new URL('http://localhost/api/cheques/extract'), boss);
    assert.equal(res.status, 200);
    assert.equal(res.body.extracted.detectedType, 'Issued');
    assert.equal(res.body.extracted.suggestedCompanyId, 'al-mahira');
  } finally {
    if (previous === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previous;
  }
});

test('independent MICR check restores a missing final digit and matches the received payee', async () => {
  const api = createChequeManagement({
    read: async () => ({ records: [] }), write: async () => {},
    readSettings: async () => ({ chequeManagement: { companies: [{ id: 'comfort', name: 'Comfort Zone AC Devices Tr. LLC' }, { id: 'city', name: 'City way Airconditioning LLC' }] } }), writeSettings: async () => {},
    saveUpload: async () => {}, readUpload: async () => null,
    send: (res, status, body) => { res.status = status; res.body = body; },
    readJson: async () => ({}), collect: async () => Buffer.from('file'),
    parseMultipart: () => [{ name: 'file', filename: 'received.jpg', mimeType: 'image/jpeg', body: Buffer.from('image') }],
    callOpenAIJson: async name => name === 'cheque-number-verification' ? { chequeNo: '000262' } : { chequeNo: '00026', drawerName: 'ORAS GENERAL TRADING LLC', payee: 'COMFORT ZONE A/C DEVICES TR LLC', uncertainFields: ['chequeNo'] }
  });
  const previous = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'test-only';
  try {
    const res = {};
    await api.route({ method: 'POST', headers: { 'content-type': 'multipart/form-data; boundary=test' } }, res, new URL('http://localhost/api/cheques/extract'), boss);
    assert.equal(res.status, 200);
    assert.equal(res.body.extracted.chequeNo, '000262');
    assert.deepEqual(res.body.extracted.uncertainFields, []);
    assert.equal(res.body.extracted.detectedType, 'Received');
    assert.equal(res.body.extracted.suggestedCompanyId, 'comfort');
  } finally {
    if (previous === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previous;
  }
});

test('conflicting MICR readings use an edge-strip tie-break and keep a candidate for review if unresolved', async () => {
  let tieBreakNumber = '000582';
  const api = createChequeManagement({
    read: async () => ({ records: [] }), write: async () => {},
    readSettings: async () => ({ chequeManagement: { companies: [{ id: 'comfort', name: 'Comfort Zone AC Devices Tr. LLC' }] } }), writeSettings: async () => {},
    saveUpload: async () => {}, readUpload: async () => null,
    send: (res, status, body) => { res.status = status; res.body = body; },
    readJson: async () => ({}), collect: async () => Buffer.from('file'),
    parseMultipart: () => [
      { name: 'file', filename: 'sideways.jpg', mimeType: 'image/jpeg', body: Buffer.from('image') },
      { name: 'micrGuide', filename: 'edges.jpg', mimeType: 'image/jpeg', body: Buffer.from('edge strips') }
    ],
    callOpenAIJson: async name => name === 'cheque-number-verification' ? { chequeNo: '000562' } : name === 'cheque-number-final-check' ? { chequeNo: tieBreakNumber } : { chequeNo: '000582', drawerName: 'Customer LLC', payee: 'Comfort Zone AC Devices Tr. LLC', uncertainFields: ['chequeNo'] }
  });
  const previous = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'test-only';
  try {
    const call = async () => { const res = {}; await api.route({ method: 'POST', headers: { 'content-type': 'multipart/form-data; boundary=test' } }, res, new URL('http://localhost/api/cheques/extract'), boss); return res.body.extracted; };
    const confirmed = await call();
    assert.equal(confirmed.chequeNo, '000582');
    assert.equal(confirmed.numberWarning, undefined);
    assert.deepEqual(confirmed.uncertainFields, []);
    tieBreakNumber = '';
    const unresolved = await call();
    assert.equal(unresolved.chequeNo, '000582');
    assert.match(unresolved.numberWarning, /disagree/);
  } finally {
    if (previous === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previous;
  }
});

test('unverified account number is blank when it is only inferred from the IBAN', async () => {
  const api = createChequeManagement({
    read: async () => ({ records: [] }), write: async () => {},
    readSettings: async () => ({ company: { name: 'Comfort Zone AC Devices Tr. LLC' } }), writeSettings: async () => {},
    saveUpload: async () => {}, readUpload: async () => null,
    send: (res, status, body) => { res.status = status; res.body = body; },
    readJson: async () => ({}), collect: async () => Buffer.from('file'),
    parseMultipart: () => [{ name: 'file', filename: 'cheque.jpg', mimeType: 'image/jpeg', body: Buffer.from('image') }],
    callOpenAIJson: async name => name === 'cheque-number-verification' ? { chequeNo: '000262' } : name === 'cheque-account-verification' ? { accountNo: '' } : { chequeNo: '000262', accountNo: '9100448682', iban: 'AE890330000019100448682', payee: 'COMFORT ZONE A/C DEVICES TR LLC', drawerName: 'ORAS GENERAL TRADING LLC', uncertainFields: [] }
  });
  const previous = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'test-only';
  try {
    const res = {};
    await api.route({ method: 'POST', headers: { 'content-type': 'multipart/form-data; boundary=test' } }, res, new URL('http://localhost/api/cheques/extract'), boss);
    assert.equal(res.status, 200);
    assert.equal(res.body.extracted.accountNo, '');
    assert.equal(res.body.extracted.iban, 'AE890330000019100448682');
  } finally {
    if (previous === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previous;
  }
});

const alice = { id: 'alice', name: 'Alice', role: 'Staff' };
const bob = { id: 'bob', name: 'Bob', role: 'Staff' };
const mts = { id: 'mts', name: 'MTS User', role: 'MTS' };
const boss = { id: 'boss', name: 'Boss', role: 'Admin' };
const cheque = (companyId, chequeNo, type = 'Received') => ({ companyId, chequeNo, type, chequeDate: '2026-12-01', party: 'Customer', amount: 100 });

test('Staff and MTS can upload and edit their own received cheques only', async () => {
  const { call } = fixture();
  const created = await call('POST', '/api/cheques', alice, { ...cheque('one', '123'), bankAccount: '12345', iban: 'AE12345' });
  assert.equal(created.status, 201);
  assert.equal((await call('GET', '/api/cheques', bob)).body.records.length, 0);
  assert.equal((await call('GET', '/api/cheques', boss)).body.records.length, 1);
  assert.equal((await call('POST', '/api/cheques', alice, cheque('one', '456', 'Issued'))).status, 403);
  assert.equal((await call('GET', '/api/cheques', alice)).body.records[0].bankAccount, '12345');
  assert.equal((await call('PATCH', `/api/cheques/${created.body.record.id}`, alice, { party: 'Updated customer' })).status, 200);
  assert.equal((await call('PATCH', `/api/cheques/${created.body.record.id}`, bob, { party: 'Other' })).status, 403);
  assert.equal((await call('PATCH', `/api/cheques/${created.body.record.id}`, mts, { party: 'Other' })).status, 403);
  const mtsCheque = await call('POST', '/api/cheques', mts, cheque('one', '456'));
  assert.equal(mtsCheque.status, 201);
  assert.equal((await call('GET', '/api/cheques', mts)).body.records.length, 1);
  assert.equal((await call('PATCH', `/api/cheques/${mtsCheque.body.record.id}`, mts, { party: 'MTS customer' })).body.record.party, 'MTS customer');
  assert.equal((await call('POST', '/api/cheques', mts, cheque('one', '789', 'Issued'))).status, 403);
  assert.equal((await call('POST', `/api/cheques/${mtsCheque.body.record.id}/status`, mts, { status: 'Deposited' })).body.record.status, 'Deposited');
  assert.equal((await call('POST', `/api/cheques/${mtsCheque.body.record.id}/status`, alice, { status: 'Returned' })).status, 403);
  assert.equal((await call('DELETE', `/api/cheques/${mtsCheque.body.record.id}`, mts)).status, 403);
});

test('cheque numbers are unique within a company, including concurrent uploads', async () => {
  const { call } = fixture();
  const [first, duplicate] = await Promise.all([
    call('POST', '/api/cheques', alice, cheque('one', 'ABC-123')),
    call('POST', '/api/cheques', bob, cheque('one', 'ABC 123'))
  ]);
  assert.deepEqual([first.status, duplicate.status], [201, 409]);
  assert.equal((await call('POST', '/api/cheques', bob, cheque('two', 'ABC-123'))).status, 201);
});

test('received cheque cannot be filed under a company other than its payee', async () => {
  const { call } = fixture();
  const response = await call('POST', '/api/cheques', alice, { ...cheque('two', 'PAYEE-1'), payee: 'Company One' });
  assert.equal(response.status, 400);
  assert.match(response.body.error, /Payee does not match/);
});

test('issued cheque payor is the selected company and recipient remains Party', async () => {
  const { call } = fixture();
  const invalid = await call('POST', '/api/cheques', boss, { ...cheque('one', 'ISSUED-1', 'Issued'), party: 'Supplier', payee: 'Company Two' });
  assert.equal(invalid.status, 400);
  const created = await call('POST', '/api/cheques', boss, { ...cheque('one', 'ISSUED-1', 'Issued'), party: 'Supplier', bankAccount: '123', iban: 'AE123' });
  assert.equal(created.status, 201);
  assert.equal(created.body.record.payee, 'Company One');
  assert.equal(created.body.record.party, 'Supplier');
  assert.equal(created.body.record.bankAccount, '');
  assert.equal(created.body.record.iban, '');
  assert.equal(created.body.record.status, 'Pending');
  assert.equal(created.body.record.issueDate, created.body.record.chequeDate);
  const edited = await call('PATCH', `/api/cheques/${created.body.record.id}`, boss, { companyId: 'two', payee: 'Company Two' });
  assert.equal(edited.status, 200);
  assert.equal(edited.body.record.payee, 'Company Two');
});

test('an owner or Admin can change status and every change has an audit entry', async () => {
  const { call } = fixture();
  const created = await call('POST', '/api/cheques', alice, cheque('one', '7788'));
  const id = created.body.record.id;
  assert.equal(created.body.record.status, 'Pending');
  assert.equal((await call('POST', `/api/cheques/${id}/status`, alice, { status: 'Cleared' })).status, 400);
  assert.equal((await call('POST', `/api/cheques/${id}/status`, bob, { status: 'Deposited' })).status, 403);
  assert.equal((await call('POST', `/api/cheques/${id}/status`, boss, { status: 'Cleared' })).status, 400);
  const changed = await call('POST', `/api/cheques/${id}/status`, boss, { status: 'Deposited', note: 'Bank drop' });
  assert.equal(changed.status, 200);
  assert.equal(changed.body.record.status, 'Deposited');
  assert.equal(changed.body.record.history.at(-1).byName, 'Boss');
  assert.equal(changed.body.record.history.at(-1).note, 'Bank drop');
});

test('only Admin can delete a cheque and its stored image', async () => {
  const { call, setStore, deletedUploads } = fixture();
  const created = await call('POST', '/api/cheques', alice, cheque('one', 'DELETE-1'));
  const id = created.body.record.id;
  setStore({ records: [{ ...created.body.record, image: { storedName: `${id}.jpg`, mimeType: 'image/jpeg' } }] });
  assert.equal((await call('DELETE', `/api/cheques/${id}`, alice)).status, 403);
  assert.equal((await call('GET', '/api/cheques', boss)).body.records.length, 1);
  const deleted = await call('DELETE', `/api/cheques/${id}`, boss);
  assert.equal(deleted.status, 200);
  assert.equal(deleted.body.deleted, true);
  assert.deepEqual(deletedUploads, [{ scope: `cheques/${id}`, name: `${id}.jpg` }]);
  assert.equal((await call('GET', '/api/cheques', boss)).body.records.length, 0);
  assert.equal((await call('DELETE', `/api/cheques/${id}`, boss)).status, 404);
});
