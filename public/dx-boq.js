(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DXBoq = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';
  const modelKey = value => String(value || '').trim().toUpperCase().replace(/\s+-\s+|\s*\/\s*/g, '|').replace(/[\s_\-]/g, '');
  const empty = value => value === '' || value == null;
  function syncQuantities(boq, schedule) {
    const quantities = new Map();
    for (const row of schedule) {
      const key = modelKey(row['Model ( Indoor / Outdoor )']);
      if (key && Number.isInteger(Number(row.Qty)) && Number(row.Qty) > 0) quantities.set(key, (quantities.get(key) || 0) + Number(row.Qty));
    }
    return { ...boq, rows: (boq.rows || []).map(row => {
      const qty = quantities.get(modelKey(row.model));
      if (row.origin !== 'manual' && qty != null && (Number(row.sourceQty) !== qty || !Number.isInteger(Number(row.qty)))) {
        return { ...row, qty, sourceQty: qty, pendingQty: null, qtyOverride: false };
      }
      return row.origin === 'manual' && row.qty != null && !Number.isInteger(Number(row.qty)) ? { ...row, qty: Math.max(1, Math.round(Number(row.qty))) } : row;
    }) };
  }
  function scaled(value, places) {
    if (empty(value) || !/^\d+(?:\.\d+)?$/.test(String(value).trim())) return null;
    const [whole, fraction = ''] = String(value).trim().split('.');
    if (Number(whole) > 1e9) return null;
    const base = 10n ** BigInt(places);
    return BigInt(whole) * base + BigInt((fraction + '0'.repeat(places)).slice(0, places)) + (Number(fraction[places] || 0) >= 5 ? 1n : 0n);
  }
  const divide = (a, b) => (a + b / 2n) / b;
  function calculate(boq) {
    const margin = scaled(boq.margin === undefined ? 20 : boq.margin, 4);
    const validMargin = margin !== null && margin <= 950000n;
    let cost = 0n, selling = 0n, incomplete = !validMargin;
    const rows = (boq.rows || []).map(row => {
      const unit = scaled(row.unitPrice, 2), qty = scaled(row.qty, 4);
      const valid = validMargin && unit !== null && qty !== null && qty > 0n;
      if (!valid) { incomplete = true; return { ...row, sellingPrice: null, lineTotal: null }; }
      // Match the existing Costing Sheet's gross margin definition, using cents.
      const sale = divide(unit * 1000000n, 1000000n - margin);
      const line = divide(sale * qty, 10000n);
      cost += divide(unit * qty, 10000n); selling += line;
      return { ...row, unitPrice: Number(unit) / 100, sellingPrice: Number(sale) / 100, lineTotal: Number(line) / 100 };
    });
    return { ...boq, rows, totals: { cost: Number(cost) / 100, selling: Number(selling) / 100, amount: Number(selling) / 100, incomplete } };
  }
  function priceForModel(model, prices) {
    const exact = text => {
      const literal = prices.filter(item => String(item.model).trim().toUpperCase() === String(text).trim().toUpperCase());
      const matches = literal.length ? literal : prices.filter(item => modelKey(item.model) === modelKey(text));
      return matches.length === 1 ? matches[0] : null;
    };
    const combined = exact(model);
    const parts = String(model).split(/\s+-\s+|\s*\/\s*/).filter(Boolean);
    const products = combined ? [combined] : parts.length === 2 ? parts.map(exact) : [];
    if (!products.length || products.some(item => !item || scaled(item.finalPrice, 2) === null)) {
      return { unitPrice: null, priceItemIds: [], description: '', priceStatus: 'Price not found' };
    }
    const cents = products.reduce((sum, item) => sum + scaled(item.finalPrice, 2), 0n);
    return { unitPrice: Number(cents) / 100, priceItemIds: products.map(item => item.id), description: products.map(item => item.description).filter(Boolean).join(' / '), priceStatus: '', priceUpdatedAt: products.map(item => item.updatedAt || ''), priceSnapshotAt: new Date().toISOString() };
  }
  function sync(existing, schedule, prices, apply = false) {
    const boq = syncQuantities(structuredClone(existing || { version: 1, margin: 20, rows: [], excludedModels: [] }), schedule);
    const groups = new Map(), warnings = [];
    schedule.forEach((row, index) => {
      const model = String(row['Model ( Indoor / Outdoor )'] || '').trim();
      if (!model || /^(CHOOSE|SELECT)\b/i.test(model)) return;
      const quantity = scaled(row.Qty, 4);
      if (quantity === null || quantity <= 0n || !Number.isInteger(Number(row.Qty))) { warnings.push(`Schedule row ${index + 1}: enter a positive whole-number quantity for ${model}.`); return; }
      const key = modelKey(model);
      if ((boq.excludedModels || []).includes(key)) return;
      if (!groups.has(key)) groups.set(key, { model, qty: 0, equipmentType: String(row.Type || row['Proposed Type'] || ''), sourceRefs: [] });
      const group = groups.get(key);
      group.qty += Number(row.Qty);
      group.qty = Number(group.qty.toFixed(4));
      group.sourceRefs.push({ ref: row.Ref || '', location: row.Location || '', row: index, qty: Number(row.Qty) });
    });
    const rows = [];
    for (const row of boq.rows || []) {
      if (row.origin === 'manual') { rows.push(row); continue; }
      const key = modelKey(row.model), group = groups.get(key);
      if (!group) { if (!apply) rows.push({ ...row, sourceRemoved: true }); continue; }
      groups.delete(key);
      const changed = Number(row.sourceQty) !== group.qty;
      rows.push({ ...row, equipmentType: group.equipmentType, sourceRefs: group.sourceRefs, sourceRemoved: false,
        ...(apply && changed ? { qty: group.qty, sourceQty: group.qty, qtyOverride: false, pendingQty: null } : { pendingQty: changed ? group.qty : null }) });
    }
    for (const [key, group] of groups) {
      const price = priceForModel(group.model, prices);
      rows.push({ id: `schedule:${key}`, origin: 'schedule', ...group, sourceQty: group.qty, ...price, description: price.description || group.equipmentType, manualPrice: false });
    }
    return calculate({ ...boq, rows, syncWarnings: warnings });
  }
  function validate(boq) {
    const errors = [...(boq.syncWarnings || [])];
    if (!(boq.rows || []).length) errors.push('Add at least one BOQ item.');
    if (scaled(boq.margin, 4) === null || Number(boq.margin) > 95) errors.push('Overall Profit Margin must be between 0 and 95%.');
    (boq.rows || []).forEach((row, index) => {
      const name = `BOQ row ${index + 1}`;
      if (!String(row.model || '').trim()) errors.push(`${name}: select a model.`);
      const quantity = scaled(row.qty, 4);
      if (quantity === null || quantity <= 0n || !Number.isInteger(Number(row.qty))) errors.push(`${name}: enter a positive whole-number quantity.`);
      if (scaled(row.unitPrice, 2) === null) errors.push(`${name}: enter a valid Unit Price; price lookup is unresolved.`);
      if (row.sourceRemoved || row.pendingQty != null) errors.push(`${name}: synchronize the changed DX Schedule before creating a quotation.`);
    });
    return errors;
  }
  return { modelKey, scaled, calculate, priceForModel, syncQuantities, sync, validate };
});
