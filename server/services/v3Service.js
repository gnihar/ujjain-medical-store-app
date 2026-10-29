const { db } = require('../db/database');
const { deductSaleFEFO, undoSaleEntry } = require('./fefoService');
const { parseVoiceStockEntry } = require('./voiceStockParser');

const AI_LIMIT = 300;
const CATEGORIES = ['SALARY', 'RENT', 'ELECTRICITY', 'TRANSPORT', 'OTHER'];
const DEFAULT_PATTERN = '0-3-6-7-8';

function istToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

function addIsoDays(iso, days) {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysInMonth(iso) {
  const [y, m] = iso.split('-').map(n => parseInt(n, 10));
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function yearMonth(iso) {
  return String(iso || istToday()).slice(0, 7);
}

function round2(n) {
  return Number((Number(n) || 0).toFixed(2));
}

function fail(status, message, extra) {
  const err = new Error(message);
  err.status = status;
  if (extra) err.extra = extra;
  return err;
}

function normalizePattern(input) {
  const parts = String(input || '').trim().split('-').map(s => s.trim()).filter(Boolean);
  if (parts.length < 4) return '';
  if (!parts.every(p => /^[0-8]$/.test(p))) return '';
  const seen = new Set();
  for (const p of parts) {
    if (seen.has(p)) return '';
    seen.add(p);
  }
  return parts.join('-');
}

function windowFor(range) {
  const today = istToday();
  const key = String(range || '1d').toLowerCase();
  if (key === '1w' || key === '7d' || key === 'week') {
    return { range: '1w', from: addIsoDays(today, -6), to: today };
  }
  if (key === '1m' || key === '30d' || key === 'month') {
    return { range: '1m', from: today.slice(0, 7) + '-01', to: today };
  }
  return { range: '1d', from: today, to: today };
}

function listExpenses() {
  return db.prepare('SELECT * FROM expenses ORDER BY expense_date DESC, created_at DESC').all();
}

function salesInRange(from, to) {
  return db.prepare(`
    SELECT * FROM sales_entries
    WHERE IFNULL(is_cancelled, 0) = 0
      AND substr(sold_at, 1, 10) >= ?
      AND substr(sold_at, 1, 10) <= ?
  `).all(from, to);
}

function saleCogs(sale) {
  const stored = Number(sale.cogs_amount || 0);
  if (stored > 0) return stored;
  const pack = Number(sale.pack_size_units) || 10;
  const units = Number(sale.total_units_deducted) || ((Number(sale.strips_sold) || 0) * pack + (Number(sale.loose_tablets_sold) || 0));
  let ptr = Number(sale.ptr_per_strip || 0);
  if (!ptr && sale.batch_id) {
    const batch = db.prepare('SELECT ptr_per_strip FROM inventory_batches WHERE id = ?').get(sale.batch_id);
    ptr = batch ? Number(batch.ptr_per_strip) || 0 : 0;
  }
  if (!pack) return 0;
  return round2((units / pack) * ptr);
}

function expenseTotals(from, to, range, prorate) {
  const rows = db.prepare(`
    SELECT * FROM expenses
    WHERE expense_date >= ? AND expense_date <= ?
  `).all(from, to);
  if (!prorate || range === '1m') {
    const salary = round2(rows.filter(r => r.category === 'SALARY').reduce((s, r) => s + Number(r.amount), 0));
    const other = round2(rows.filter(r => r.category !== 'SALARY').reduce((s, r) => s + Number(r.amount), 0));
    return { expenses: round2(salary + other), salary, otherExpenses: other, proratedAmount: 0 };
  }
  const directRows = rows.filter(r => r.category !== 'SALARY' && r.category !== 'RENT');
  const direct = round2(directRows.reduce((s, r) => s + Number(r.amount), 0));
  const today = istToday();
  const monthFrom = today.slice(0, 7) + '-01';
  const monthTo = today.slice(0, 7) + '-' + String(daysInMonth(today)).padStart(2, '0');
  const fixed = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS total FROM expenses
    WHERE expense_date >= ? AND expense_date <= ?
      AND category IN ('SALARY', 'RENT')
  `).get(monthFrom, monthTo);
  const dim = daysInMonth(today);
  const span = Math.round((new Date(to + 'T12:00:00Z') - new Date(from + 'T12:00:00Z')) / 86400000) + 1;
  const proratedAmount = round2((Number(fixed.total) || 0) / dim * span);
  const monthSalary = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS total FROM expenses
    WHERE expense_date >= ? AND expense_date <= ? AND category = 'SALARY'
  `).get(monthFrom, monthTo);
  const salaryShare = Number(fixed.total) > 0
    ? round2(proratedAmount * (Number(monthSalary.total) / Number(fixed.total)))
    : 0;
  return {
    expenses: round2(direct + proratedAmount),
    salary: salaryShare,
    otherExpenses: round2(direct + (proratedAmount - salaryShare)),
    proratedAmount
  };
}

function profitAndLoss(range, prorate) {
  const win = windowFor(range);
  const sales = salesInRange(win.from, win.to);
  const totalSales = round2(sales.reduce((s, row) => s + Number(row.billed_amount || 0), 0));
  const cogs = round2(sales.reduce((s, row) => s + saleCogs(row), 0));
  const grossMargin = round2(totalSales - cogs);
  const grossMarginPct = totalSales > 0 ? round2((grossMargin / totalSales) * 100) : 0;
  const exp = expenseTotals(win.from, win.to, win.range, !!prorate);
  const netProfit = round2(grossMargin - exp.expenses);
  const netProfitPct = totalSales > 0 ? round2((netProfit / totalSales) * 100) : 0;
  return {
    range: win.range,
    from: win.from,
    to: win.to,
    prorate: !!prorate && win.range !== '1m',
    totalSales,
    billCount: sales.length,
    cogs,
    grossMargin,
    grossMarginPct,
    expenses: exp.expenses,
    salary: exp.salary,
    otherExpenses: exp.otherExpenses,
    proratedAmount: exp.proratedAmount,
    netProfit,
    netProfitPct
  };
}

function seasonality() {
  const sales = db.prepare(`
    SELECT substr(sold_at, 1, 7) AS month, medicine_id, brand_name,
           SUM(strips_sold) AS strips,
           SUM(loose_tablets_sold) AS loose,
           SUM(billed_amount) AS revenue,
           SUM(CASE WHEN IFNULL(cogs_amount, 0) > 0 THEN billed_amount - cogs_amount ELSE billed_amount END) AS margin
    FROM sales_entries
    WHERE IFNULL(is_cancelled, 0) = 0 AND sold_at IS NOT NULL AND length(sold_at) >= 7
    GROUP BY month, medicine_id, brand_name
    ORDER BY month ASC, strips DESC
  `).all();
  const byMonth = {};
  sales.forEach(row => {
    if (!byMonth[row.month]) byMonth[row.month] = [];
    byMonth[row.month].push({
      medicine_id: row.medicine_id,
      brand_name: row.brand_name,
      strips: Number(row.strips) || 0,
      loose: Number(row.loose) || 0,
      revenue: round2(row.revenue),
      margin: round2(row.margin)
    });
  });
  const months = Object.keys(byMonth).sort().map(month => {
    const items = byMonth[month].sort((a, b) => b.strips - a.strips || b.revenue - a.revenue);
    const topStrips = items.length ? items[0].strips : 0;
    return {
      month,
      top: items.slice(0, 8).map(item => Object.assign({}, item, {
        bar: topStrips > 0 ? Math.round((item.strips / topStrips) * 100) : 0
      }))
    };
  });
  return { months };
}

function publicQuota(row) {
  const used = Number(row.calls_used) || 0;
  const limit = Number(row.monthly_limit) || AI_LIMIT;
  const remaining = Math.max(0, limit - used);
  let level = 'ok';
  if (remaining === 0) level = 'exhausted';
  else if (remaining < 10) level = 'crit';
  else if (remaining <= 50) level = 'warn';
  return {
    year_month: row.year_month,
    calls_used: used,
    monthly_limit: limit,
    remaining,
    level
  };
}

function ensureQuotaRow(ym) {
  const month = ym || yearMonth(istToday());
  let row = db.prepare('SELECT * FROM ai_usage_monthly WHERE year_month = ?').get(month);
  if (!row) {
    db.prepare(`
      INSERT INTO ai_usage_monthly (year_month, calls_used, monthly_limit, updated_at)
      VALUES (?, 0, ?, datetime('now'))
    `).run(month, AI_LIMIT);
    row = db.prepare('SELECT * FROM ai_usage_monthly WHERE year_month = ?').get(month);
  }
  return row;
}

function getQuota() {
  return publicQuota(ensureQuotaRow());
}

function consumeQuota() {
  const row = ensureQuotaRow();
  if (row.calls_used >= (row.monthly_limit || AI_LIMIT)) {
    throw fail(429, 'Monthly 300 AI scan quota reached (resets on the 1st of next month). Use voice entry or the manual rack form.', {
      quota: publicQuota(row)
    });
  }
  db.prepare(`
    UPDATE ai_usage_monthly
    SET calls_used = calls_used + 1, updated_at = datetime('now')
    WHERE year_month = ?
  `).run(row.year_month);
  return publicQuota(db.prepare('SELECT * FROM ai_usage_monthly WHERE year_month = ?').get(row.year_month));
}

function offlineScan(rawText) {
  const text = String(rawText || '').trim();
  if (!text) {
    return {
      supplier_name: '',
      supplier_gstin: '',
      invoice_number: '',
      invoice_date: istToday(),
      items: [{
        brand_name: 'Dolo 650 Tablet',
        salt_composition: 'Paracetamol 650mg',
        pack_size_units: 15,
        rack_location: 'Rack A-1',
        batch_number: 'DL552',
        expiry_date: '2027-08-31',
        strips_qty: 10,
        free_strips_qty: 0,
        ptr_per_strip: 24.5,
        mrp_per_strip: 33.8,
        gst_percent: 12
      }]
    };
  }
  const voice = parseVoiceStockEntry(text);
  return {
    supplier_name: '',
    supplier_gstin: '',
    invoice_number: '',
    invoice_date: istToday(),
    items: [{
      brand_name: voice.brand_name,
      salt_composition: voice.salt_composition || '',
      pack_size_units: voice.pack_size_units || 10,
      rack_location: voice.rack_location || 'Rack A-1',
      batch_number: voice.batch_number || '',
      expiry_date: voice.expiry_date || '',
      strips_qty: voice.strips_qty || 0,
      free_strips_qty: 0,
      loose_qty: voice.loose_qty || 0,
      ptr_per_strip: voice.ptr_per_strip || 0,
      mrp_per_strip: voice.mrp_per_strip || 0,
      gst_percent: 12
    }]
  };
}

async function callGemini(rawText, imageBase64, mimeType) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const prompt = [
    'Extract a pharmacy purchase or strip into JSON with keys supplier_name, supplier_gstin, invoice_number, invoice_date, items.',
    'Each item needs brand_name, salt_composition, pack_size_units, rack_location, batch_number, expiry_date (YYYY-MM-DD), strips_qty, free_strips_qty, ptr_per_strip, mrp_per_strip, gst_percent.',
    'Return only JSON. If a field is unknown use an empty string or 0.',
    rawText ? ('Text: ' + rawText) : 'Read the attached bill or medicine strip photo.'
  ].join('\n');
  const parts = [{ text: prompt }];
  if (imageBase64) {
    parts.push({
      inline_data: {
        mime_type: mimeType || 'image/jpeg',
        data: String(imageBase64).replace(/^data:[^;]+;base64,/, '')
      }
    });
  }
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + encodeURIComponent(key);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: { responseMimeType: 'application/json' }
    })
  });
  if (!res.ok) {
    const detail = await res.text();
    throw fail(502, 'Gemini scan failed: ' + detail.slice(0, 240));
  }
  const json = await res.json();
  const text = (((json.candidates || [])[0] || {}).content || {}).parts || [];
  const joined = text.map(p => p.text || '').join('\n');
  const parsed = JSON.parse(joined);
  if (!parsed.items) parsed.items = [];
  return parsed;
}

async function scanStock({ rawText, imageBase64, mimeType }) {
  const quota = consumeQuota();
  let provider = 'offline';
  let parsed;
  if (process.env.GEMINI_API_KEY) {
    try {
      parsed = await callGemini(rawText, imageBase64, mimeType);
      provider = 'gemini';
    } catch (err) {
      if (err.status === 502 && !rawText && !imageBase64) throw err;
      parsed = offlineScan(rawText);
      provider = 'offline-fallback';
    }
  } else {
    parsed = offlineScan(rawText);
  }
  return { provider, parsed, quota };
}

function addShelfBatch(item) {
  const brandName = String(item.brandName || item.brand_name || '').trim();
  if (!brandName) throw fail(400, 'Brand name is required');
  const packUnits = Math.max(1, parseInt(item.packSizeUnits || item.pack_size_units, 10) || 10);
  const strips = Math.max(0, parseInt(item.stripsCount != null ? item.stripsCount : item.strips_qty, 10) || 0);
  const loose = Math.max(0, parseInt(item.looseTabletsCount != null ? item.looseTabletsCount : item.loose_qty, 10) || 0);
  let ptr = parseFloat(item.ptrPerStrip != null ? item.ptrPerStrip : item.ptr_per_strip);
  const mrp = parseFloat(item.mrpPerStrip != null ? item.mrpPerStrip : item.mrp_per_strip);
  if (!Number.isFinite(ptr) || ptr <= 0) ptr = Number.isFinite(mrp) && mrp > 0 ? round2(mrp * 0.72) : 1;
  const mrpSafe = Math.max(ptr, Number.isFinite(mrp) ? mrp : ptr);
  const rack = item.rackLocation || item.rack_location || 'Rack A-1';
  const salt = item.saltComposition || item.salt_composition || 'Generic Salt Composition';
  const batchNumber = String(item.batchNumber || item.batch_number || ('SHLF-' + Date.now().toString().slice(-6))).trim();
  const expiry = item.expiryDate || item.expiry_date || '2027-08-31';
  const supplierId = item.supplierId || item.supplier_id || 'sup-1';
  let med = db.prepare('SELECT * FROM medicines WHERE LOWER(brand_name) = LOWER(?)').get(brandName);
  if (!med) {
    const medId = 'med-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
    db.prepare(`
      INSERT INTO medicines (
        id, brand_name, salt_composition, manufacturer, pack_size_units,
        pack_label, rack_location, schedule_type, gst_percent, min_reorder_strips
      ) VALUES (?, ?, ?, 'Shelf Onboarded', ?, ?, ?, 'H', 12, 10)
    `).run(medId, brandName, salt, packUnits, '1x' + packUnits + ' Units', rack);
    med = db.prepare('SELECT * FROM medicines WHERE id = ?').get(medId);
  } else if (rack) {
    db.prepare('UPDATE medicines SET rack_location = ? WHERE id = ?').run(rack, med.id);
  }
  const batchId = 'b-onboard-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
  db.prepare(`
    INSERT INTO inventory_batches (
      id, medicine_id, supplier_id, purchase_invoice_id, batch_number, expiry_date,
      pack_size_units, strips_count, loose_tablets_count, free_strips_received,
      ptr_per_strip, mrp_per_strip, gst_percent
    ) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, 0, ?, ?, 12)
  `).run(batchId, med.id, supplierId, batchNumber, expiry, packUnits, strips, loose, ptr, mrpSafe);
  return { medicineId: med.id, batchId, brandName };
}

function addVoiceStock(transcript) {
  const parsed = parseVoiceStockEntry(transcript);
  if (!parsed.brand_name) throw fail(400, 'Could not hear a medicine name');
  if (!parsed.strips_qty && !parsed.loose_qty) throw fail(400, 'Say how many strips or loose tablets to add');
  const saved = addShelfBatch({
    brandName: parsed.brand_name,
    stripsCount: parsed.strips_qty,
    looseTabletsCount: parsed.loose_qty,
    rackLocation: parsed.rack_location || 'Rack A-1',
    batchNumber: parsed.batch_number,
    expiryDate: parsed.expiry_date || '2027-08-31',
    ptrPerStrip: parsed.ptr_per_strip,
    mrpPerStrip: parsed.mrp_per_strip,
    packSizeUnits: parsed.pack_size_units
  });
  return { parsed, saved };
}

function unlock(body) {
  const settings = db.prepare('SELECT * FROM store_settings WHERE id = 1').get();
  const method = String(body.method || 'pin').toLowerCase();
  if (method === 'pin') {
    const pin = String(body.pin || '').trim();
    if (pin !== String(settings.owner_pin || '1234')) throw fail(401, 'Wrong PIN');
    return { unlocked: true, method: 'pin' };
  }
  if (method === 'pattern') {
    const pattern = normalizePattern(body.pattern);
    const stored = normalizePattern(settings.admin_pattern || DEFAULT_PATTERN) || DEFAULT_PATTERN;
    if (!pattern || pattern !== stored) throw fail(401, 'Wrong pattern');
    return { unlocked: true, method: 'pattern' };
  }
  if (method === 'biometric') {
    if (!settings.biometric_enabled) throw fail(401, 'Biometric unlock is turned off');
    const id = String(body.credentialId || body.credential_id || '').trim();
    const stored = String(settings.biometric_credential_id || '').trim();
    if (!stored || id !== stored) throw fail(401, 'Biometric credential does not match this store');
    return { unlocked: true, method: 'biometric' };
  }
  throw fail(400, 'Unknown unlock method');
}

function webauthnOptions() {
  const challenge = Buffer.from('akshay-medicose-' + Date.now()).toString('base64url');
  return {
    challenge,
    rpId: 'localhost',
    timeout: 60000,
    userVerification: 'required',
    allowCredentials: []
  };
}

function registerBiometric(body) {
  const id = String(body.credentialId || body.credential_id || '').trim();
  if (!id) throw fail(400, 'Missing biometric credential id');
  db.prepare(`
    UPDATE store_settings
    SET biometric_credential_id = ?, biometric_enabled = 1, updated_at = datetime('now')
    WHERE id = 1
  `).run(id);
  return { credentialId: id, enabled: true };
}

function createExpense(body) {
  const category = String(body.category || 'OTHER').toUpperCase();
  if (!CATEGORIES.includes(category)) throw fail(400, 'Unknown expense category');
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw fail(400, 'Enter an expense amount');
  const date = String(body.expenseDate || body.expense_date || istToday()).slice(0, 10);
  const id = 'exp-' + Date.now();
  db.prepare(`
    INSERT INTO expenses (id, category, title, employee_name, amount, expense_date, payment_mode, note)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    category,
    String(body.title || body.employeeName || body.employee_name || category),
    String(body.employeeName || body.employee_name || ''),
    round2(amount),
    date,
    String(body.paymentMode || body.payment_mode || 'CASH').toUpperCase(),
    String(body.note || '')
  );
  return db.prepare('SELECT * FROM expenses WHERE id = ?').get(id);
}

function updateExpense(id, body) {
  const row = db.prepare('SELECT * FROM expenses WHERE id = ?').get(id);
  if (!row) throw fail(404, 'Expense not found');
  const category = body.category ? String(body.category).toUpperCase() : row.category;
  if (!CATEGORIES.includes(category)) throw fail(400, 'Unknown expense category');
  const amount = body.amount != null ? Number(body.amount) : row.amount;
  if (!Number.isFinite(amount) || amount <= 0) throw fail(400, 'Enter an expense amount');
  db.prepare(`
    UPDATE expenses
    SET category = ?, title = ?, employee_name = ?, amount = ?, expense_date = ?, note = ?
    WHERE id = ?
  `).run(
    category,
    body.title != null ? String(body.title) : row.title,
    body.employeeName != null ? String(body.employeeName) : (body.employee_name != null ? String(body.employee_name) : row.employee_name),
    round2(amount),
    body.expenseDate || body.expense_date || row.expense_date,
    body.note != null ? String(body.note) : row.note,
    id
  );
  return db.prepare('SELECT * FROM expenses WHERE id = ?').get(id);
}

function deleteExpense(id) {
  const row = db.prepare('SELECT * FROM expenses WHERE id = ?').get(id);
  if (!row) throw fail(404, 'Expense not found');
  db.prepare('DELETE FROM expenses WHERE id = ?').run(id);
  return { id };
}

function nextNumber(table, column, prefix, start) {
  const rows = db.prepare(`SELECT ${column} AS n FROM ${table}`).all();
  let max = start;
  rows.forEach(row => {
    const m = String(row.n || '').match(/(\d+)/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  });
  return prefix + (max + 1);
}

function voucherItems(body) {
  const items = Array.isArray(body.items) ? body.items : [];
  if (!items.length) throw fail(400, 'Add at least one line to the voucher');
  return items;
}

function estimateVoucher(type, items) {
  let total = 0;
  let margin = 0;
  items.forEach(item => {
    if (type === 'PURCHASE') {
      const strips = Number(item.stripsCount != null ? item.stripsCount : item.strips_qty) || 0;
      const ptr = Number(item.ptrPerStrip != null ? item.ptrPerStrip : item.ptr_per_strip) || 0;
      total += strips * ptr;
      return;
    }
    const medId = item.medicineId || item.medicine_id;
    const strips = Number(item.strips != null ? item.strips : item.stripsSold) || 0;
    const loose = Number(item.loose != null ? item.loose : item.looseTabletsSold) || 0;
    const med = medId ? db.prepare('SELECT * FROM medicines WHERE id = ?').get(medId) : null;
    const batch = medId ? db.prepare(`
      SELECT * FROM inventory_batches
      WHERE medicine_id = ? AND (strips_count > 0 OR loose_tablets_count > 0)
      ORDER BY expiry_date ASC LIMIT 1
    `).get(medId) : null;
    const pack = (batch && batch.pack_size_units) || (med && med.pack_size_units) || 10;
    const mrp = batch ? Number(batch.mrp_per_strip) : Number(item.mrp || 0);
    const ptr = batch ? Number(batch.ptr_per_strip) : Number(item.ptr || 0);
    const units = strips * pack + loose;
    const billed = pack ? (units / pack) * mrp : 0;
    const cogs = pack ? (units / pack) * ptr : 0;
    total += billed;
    margin += billed - cogs;
  });
  return { total: round2(total), margin: round2(margin) };
}

function listVouchers() {
  return db.prepare('SELECT * FROM vouchers ORDER BY created_at DESC').all().map(row => {
    let items = [];
    try { items = JSON.parse(row.items_json || '[]'); } catch (_e) { items = []; }
    return Object.assign({}, row, { items });
  });
}

function saveVoucher(body, existingId) {
  const type = String(body.voucherType || body.voucher_type || 'SALE').toUpperCase();
  if (type !== 'SALE' && type !== 'PURCHASE') throw fail(400, 'Voucher type must be SALE or PURCHASE');
  const items = voucherItems(body);
  const estimate = estimateVoucher(type, items);
  const payment = String(body.paymentMode || body.payment_mode || 'CASH').toUpperCase();
  const fields = {
    voucher_type: type,
    customer_or_supplier: String(body.customerOrSupplier || body.customer_or_supplier || body.patientName || body.supplierName || ''),
    customer_phone: String(body.customerPhone || body.customer_phone || ''),
    doctor_name: String(body.doctorName || body.doctor_name || ''),
    items_json: JSON.stringify(items),
    total_amount: body.totalAmount != null ? round2(body.totalAmount) : estimate.total,
    estimated_margin: estimate.margin,
    payment_mode: payment,
    schedule_refill: body.scheduleRefill ? 1 : 0,
    refill_interval_days: parseInt(body.refillIntervalDays, 10) || 30,
    created_by_role: String(body.createdByRole || body.created_by_role || 'EMPLOYEE').toUpperCase(),
    note: String(body.note || '')
  };
  if (existingId) {
    const row = db.prepare('SELECT * FROM vouchers WHERE id = ?').get(existingId);
    if (!row) throw fail(404, 'Voucher not found');
    if (row.status !== 'DRAFT') throw fail(400, 'Only a draft voucher can be edited');
    db.prepare(`
      UPDATE vouchers
      SET voucher_type = ?, customer_or_supplier = ?, customer_phone = ?, doctor_name = ?,
          items_json = ?, total_amount = ?, estimated_margin = ?, payment_mode = ?,
          schedule_refill = ?, refill_interval_days = ?, note = ?
      WHERE id = ?
    `).run(
      fields.voucher_type, fields.customer_or_supplier, fields.customer_phone, fields.doctor_name,
      fields.items_json, fields.total_amount, fields.estimated_margin, fields.payment_mode,
      fields.schedule_refill, fields.refill_interval_days, fields.note, existingId
    );
    return db.prepare('SELECT * FROM vouchers WHERE id = ?').get(existingId);
  }
  const id = 'vch-' + Date.now();
  const number = nextNumber('vouchers', 'voucher_number', 'VCH-', 1000);
  db.prepare(`
    INSERT INTO vouchers (
      id, voucher_number, voucher_type, status, customer_or_supplier, customer_phone, doctor_name,
      items_json, total_amount, estimated_margin, payment_mode, schedule_refill, refill_interval_days,
      created_by_role, note
    ) VALUES (?, ?, ?, 'DRAFT', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, number, fields.voucher_type, fields.customer_or_supplier, fields.customer_phone, fields.doctor_name,
    fields.items_json, fields.total_amount, fields.estimated_margin, fields.payment_mode,
    fields.schedule_refill, fields.refill_interval_days, fields.created_by_role, fields.note
  );
  return db.prepare('SELECT * FROM vouchers WHERE id = ?').get(id);
}

function finalizeVoucher(id) {
  const row = db.prepare('SELECT * FROM vouchers WHERE id = ?').get(id);
  if (!row) throw fail(404, 'Voucher not found');
  if (row.status !== 'DRAFT') throw fail(400, 'Only a draft voucher can be finalized');
  let items = [];
  try { items = JSON.parse(row.items_json || '[]'); } catch (_e) { items = []; }
  if (!items.length) throw fail(400, 'Draft voucher has no lines');
  const saleIds = [];
  if (row.voucher_type === 'SALE') {
    const done = [];
    try {
      items.forEach(item => {
        const sale = deductSaleFEFO({
          medicineId: item.medicineId || item.medicine_id,
          stripsSold: item.strips != null ? item.strips : item.stripsSold,
          looseTabletsSold: item.loose != null ? item.loose : item.looseTabletsSold,
          patientName: item.patientName || row.customer_or_supplier,
          doctorName: item.doctorName || row.doctor_name,
          customerPhone: item.customerPhone || row.customer_phone,
          paymentMode: row.payment_mode || 'CASH'
        });
        done.push(sale.id);
        try {
          db.prepare('UPDATE sales_entries SET voucher_id = ? WHERE id = ?').run(id, sale.id);
        } catch (_e) { /* column is added at startup */ }
      });
    } catch (err) {
      done.forEach(saleId => { try { undoSaleEntry(saleId); } catch (_u) {} });
      throw err;
    }
    saleIds.push(...done);
  } else {
    const tx = db.transaction(() => {
      items.forEach(item => addShelfBatch(item));
    });
    tx();
  }
  db.prepare(`
    UPDATE vouchers
    SET status = 'FINALIZED', finalized_at = datetime('now'), sale_ids_json = ?
    WHERE id = ?
  `).run(JSON.stringify(saleIds), id);
  return db.prepare('SELECT * FROM vouchers WHERE id = ?').get(id);
}

function cancelVoucher(id) {
  const row = db.prepare('SELECT * FROM vouchers WHERE id = ?').get(id);
  if (!row) throw fail(404, 'Voucher not found');
  if (row.status !== 'DRAFT') throw fail(400, 'Only a draft voucher can be cancelled');
  db.prepare(`UPDATE vouchers SET status = 'CANCELLED' WHERE id = ?`).run(id);
  return db.prepare('SELECT * FROM vouchers WHERE id = ?').get(id);
}

function createExpiryReturn(body) {
  const batch = db.prepare(`
    SELECT b.*, m.brand_name, m.rack_location, s.name AS supplier_name, s.phone AS supplier_phone, s.id AS sup_id
    FROM inventory_batches b
    JOIN medicines m ON m.id = b.medicine_id
    LEFT JOIN suppliers s ON s.id = b.supplier_id
    WHERE b.id = ?
  `).get(body.batchId || body.batch_id);
  if (!batch) throw fail(404, 'Batch not found');
  const strips = Math.max(0, parseInt(body.stripsReturned != null ? body.stripsReturned : body.strips_returned, 10) || 0);
  const loose = Math.max(0, parseInt(body.looseReturned != null ? body.looseReturned : body.loose_returned, 10) || 0);
  if (!strips && !loose) throw fail(400, 'Enter strips or loose tablets to return');
  if (strips > batch.strips_count) throw fail(400, 'Return strips exceed shelf stock');
  const id = 'ret-' + Date.now();
  const slip = nextNumber('expiry_returns', 'return_slip_no', 'RET-', 200);
  const ptr = Number(batch.ptr_per_strip) || 0;
  const pack = Number(batch.pack_size_units) || 10;
  const ptrValue = round2((strips + (loose / pack)) * ptr);
  db.prepare(`
    INSERT INTO expiry_returns (
      id, return_slip_no, batch_id, medicine_id, brand_name, batch_number, expiry_date, rack_location,
      supplier_id, supplier_name, supplier_phone, strips_returned, loose_returned, ptr_per_strip, ptr_value,
      return_reason, status, note
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)
  `).run(
    id, slip, batch.id, batch.medicine_id, batch.brand_name, batch.batch_number, batch.expiry_date, batch.rack_location,
    batch.sup_id || batch.supplier_id || '', batch.supplier_name || 'Supplier', batch.supplier_phone || '',
    strips, loose, ptr, ptrValue,
    body.reason || body.return_reason || 'Near Expiry',
    body.note || ''
  );
  return db.prepare('SELECT * FROM expiry_returns WHERE id = ?').get(id);
}

function updateExpiryStatus(id, body) {
  const row = db.prepare('SELECT * FROM expiry_returns WHERE id = ?').get(id);
  if (!row) throw fail(404, 'Return slip not found');
  const next = String(body.status || '').toUpperCase();
  const allowed = { PENDING: ['SENT', 'ADJUSTED'], SENT: ['ADJUSTED'], ADJUSTED: [] };
  if (!allowed[row.status] || allowed[row.status].indexOf(next) === -1) {
    throw fail(400, 'Cannot move a return from ' + row.status + ' to ' + (next || 'empty'));
  }
  let credit = row.credit_note_no || '';
  if (next === 'ADJUSTED') {
    credit = String(body.creditNoteNo || body.credit_note_no || '').trim();
    if (!credit) throw fail(400, 'Enter the credit note number');
    const batch = db.prepare('SELECT * FROM inventory_batches WHERE id = ?').get(row.batch_id);
    if (batch) {
      const strips = Math.max(0, batch.strips_count - row.strips_returned);
      const loose = Math.max(0, batch.loose_tablets_count - row.loose_returned);
      db.prepare(`
        UPDATE inventory_batches
        SET strips_count = ?, loose_tablets_count = ?, is_return_claimed = 1, updated_at = datetime('now')
        WHERE id = ?
      `).run(strips, loose, batch.id);
    }
  }
  db.prepare(`
    UPDATE expiry_returns
    SET status = ?, credit_note_no = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(next, credit, id);
  return db.prepare('SELECT * FROM expiry_returns WHERE id = ?').get(id);
}

function listExpiryReturns() {
  return db.prepare('SELECT * FROM expiry_returns ORDER BY created_at DESC').all();
}

function clearZero() {
  const tx = db.transaction(() => {
    db.exec(`
      DELETE FROM credit_transactions;
      DELETE FROM refill_schedules;
      DELETE FROM shortbook_items;
      DELETE FROM expiry_returns;
      DELETE FROM sales_entries;
      DELETE FROM stock_audits;
      DELETE FROM purchase_line_items;
      DELETE FROM inventory_batches;
      DELETE FROM purchase_invoices;
      DELETE FROM supplier_offers;
      DELETE FROM customer_accounts;
      DELETE FROM vouchers;
      DELETE FROM expenses;
      DELETE FROM medicines;
    `);
    db.prepare(`UPDATE ai_usage_monthly SET calls_used = 0, updated_at = datetime('now')`).run();
    db.prepare(`UPDATE store_settings SET tutorial_completed = 0, updated_at = datetime('now') WHERE id = 1`).run();
  });
  tx();
  return { cleared: true, tutorial: true };
}

function snapshot() {
  return {
    expenses: listExpenses(),
    vouchers: listVouchers(),
    expiryReturns: listExpiryReturns(),
    aiQuota: getQuota(),
    pl: {
      '1d': profitAndLoss('1d', false),
      '1w': profitAndLoss('1w', false),
      '1m': profitAndLoss('1m', false)
    },
    seasonality: seasonality()
  };
}

function applySettings(current, body) {
  const next = {
    admin_pattern: current.admin_pattern || DEFAULT_PATTERN,
    biometric_enabled: current.biometric_enabled == null ? 1 : current.biometric_enabled,
    tutorial_completed: current.tutorial_completed || 0,
    admin_lock_minutes: current.admin_lock_minutes || 15
  };
  if (body.admin_pattern != null && String(body.admin_pattern).trim() !== '') {
    const pattern = normalizePattern(body.admin_pattern);
    if (!pattern) throw fail(400, 'Pattern must join at least 4 different dots, for example 0-3-6-7-8');
    next.admin_pattern = pattern;
  }
  if (body.biometric_enabled != null) next.biometric_enabled = body.biometric_enabled ? 1 : 0;
  if (body.tutorial_completed != null) next.tutorial_completed = body.tutorial_completed ? 1 : 0;
  if (body.admin_lock_minutes != null) {
    const mins = parseInt(body.admin_lock_minutes, 10);
    if (![5, 15, 30].includes(mins)) throw fail(400, 'Lock timer must be 5, 15, or 30 minutes');
    next.admin_lock_minutes = mins;
  }
  db.prepare(`
    UPDATE store_settings
    SET admin_pattern = ?, biometric_enabled = ?, tutorial_completed = ?, admin_lock_minutes = ?, updated_at = datetime('now')
    WHERE id = 1
  `).run(next.admin_pattern, next.biometric_enabled, next.tutorial_completed, next.admin_lock_minutes);
}

module.exports = {
  AI_LIMIT,
  CATEGORIES,
  DEFAULT_PATTERN,
  istToday,
  normalizePattern,
  profitAndLoss,
  seasonality,
  getQuota,
  scanStock,
  parseVoiceStockEntry,
  addVoiceStock,
  unlock,
  webauthnOptions,
  registerBiometric,
  createExpense,
  updateExpense,
  deleteExpense,
  saveVoucher,
  finalizeVoucher,
  cancelVoucher,
  createExpiryReturn,
  updateExpiryStatus,
  clearZero,
  snapshot,
  applySettings,
  listExpenses
};
