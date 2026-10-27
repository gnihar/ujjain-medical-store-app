const { db } = require('../db/database');
const { normalizePhone } = require('./receiptService');
const { deductSaleFEFO } = require('./fefoService');

const STORE_TODAY = '2026-10-27';

function addDays(iso, days) {
  const d = new Date(String(iso).slice(0, 10) + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + (parseInt(days, 10) || 0));
  return d.toISOString().slice(0, 10);
}

function daysUntil(iso) {
  const ref = new Date(STORE_TODAY + 'T00:00:00Z').getTime();
  const due = new Date(String(iso).slice(0, 10) + 'T00:00:00Z').getTime();
  if (Number.isNaN(due)) return 99;
  return Math.round((due - ref) / 86400000);
}

function phoneDigitsReady(phone) {
  const digits = normalizePhone(phone);
  if (digits.length !== 10) throw new Error('Mobile number must be 10 digits');
  return digits;
}

function waLink(phone, text) {
  const digits = String(phone || '').replace(/\D/g, '');
  const local = digits.length >= 10 ? digits.slice(-10) : '';
  const base = local.length === 10 ? `https://wa.me/91${local}` : 'https://wa.me/';
  return `${base}?text=${encodeURIComponent(text)}`;
}

function money(n) {
  return '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function syncShortbook() {
  const meds = db.prepare(`
    SELECT m.id, m.brand_name, m.pack_label, m.min_reorder_strips,
           COALESCE(SUM(b.strips_count), 0) AS strips
    FROM medicines m
    LEFT JOIN inventory_batches b ON b.medicine_id = m.id
    GROUP BY m.id
  `).all();

  const dropAuto = db.prepare(`DELETE FROM shortbook_items WHERE medicine_id = ? AND source = 'AUTO'`);
  const findOpen = db.prepare(`
    SELECT * FROM shortbook_items
    WHERE medicine_id = ? AND source = 'AUTO' AND status = 'OPEN'
  `);
  const findHeld = db.prepare(`
    SELECT id FROM shortbook_items
    WHERE medicine_id = ? AND source = 'AUTO' AND status IN ('ORDERED', 'CLEARED')
  `);
  const touch = db.prepare(`
    UPDATE shortbook_items
    SET last_ptr = ?, last_scheme = ?, supplier_id = ?, supplier_name = ?, supplier_phone = ?, pack_label = ?, updated_at = datetime('now')
    WHERE id = ?
  `);
  const insert = db.prepare(`
    INSERT INTO shortbook_items (
      id, medicine_id, brand_name, pack_label, supplier_id, supplier_name, supplier_phone,
      requested_strips, last_ptr, last_scheme, note, source, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Shelf stock is at or below the reorder level', 'AUTO', 'OPEN')
  `);

  for (const m of meds) {
    const min = m.min_reorder_strips || 0;
    if (m.strips > min) {
      dropAuto.run(m.id);
      continue;
    }
    const last = db.prepare(`
      SELECT b.ptr_per_strip, b.free_strips_received, b.supplier_id, s.name AS supplier_name, s.phone AS supplier_phone
      FROM inventory_batches b
      LEFT JOIN suppliers s ON s.id = b.supplier_id
      WHERE b.medicine_id = ?
      ORDER BY b.created_at DESC, b.id DESC
      LIMIT 1
    `).get(m.id);
    const scheme = last && last.free_strips_received > 0 ? `10+${last.free_strips_received}` : '';
    const open = findOpen.get(m.id);
    if (open) {
      touch.run(
        last ? last.ptr_per_strip : null,
        scheme,
        last ? last.supplier_id : null,
        last ? last.supplier_name : 'Unassigned',
        last ? last.supplier_phone : '',
        m.pack_label,
        open.id
      );
      continue;
    }
    if (findHeld.get(m.id)) continue;
    const qty = Math.max(1, min - m.strips);
    insert.run(
      'sb-auto-' + m.id + '-' + Date.now(),
      m.id,
      m.brand_name,
      m.pack_label,
      last ? last.supplier_id : null,
      last ? last.supplier_name : 'Unassigned',
      last ? last.supplier_phone : '',
      qty,
      last ? last.ptr_per_strip : null,
      scheme
    );
  }
}

function insertPurchaseLine({ invoiceId, batchId, medicineId, item, packUnits, index }) {
  const free = parseInt(item.freeStrips, 10) || 0;
  const paid = parseInt(item.stripsCount, 10) || 0;
  const scheme = item.schemeLabel || (free > 0 ? `${paid}+${free}` : '');
  db.prepare(`
    INSERT INTO purchase_line_items (
      id, invoice_id, batch_id, medicine_id, brand_name, salt_composition, pack_label,
      rack_location, batch_number, expiry_date, strips_qty, free_strips_qty, scheme_label,
      ptr_per_strip, mrp_per_strip, gst_percent
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    `li-${invoiceId}-${index}`,
    invoiceId,
    batchId,
    medicineId,
    (item.brandName || 'Medicine').trim(),
    item.saltComposition || '',
    item.packLabel || `1x${packUnits}`,
    item.rackLocation || '',
    item.batchNumber || '',
    item.expiryDate || '',
    paid,
    free,
    scheme,
    parseFloat(item.ptrPerStrip) || 0,
    parseFloat(item.mrpPerStrip) || 0,
    parseFloat(item.gstPercent) || 12
  );
}

function searchInvoices({ q = '', status = 'ALL', from = '', to = '' } = {}) {
  const term = String(q || '').trim();
  const like = `%${term}%`;
  const stat = String(status || 'ALL').toUpperCase();
  const rows = db.prepare(`
    SELECT DISTINCT pi.*
    FROM purchase_invoices pi
    LEFT JOIN purchase_line_items li ON li.invoice_id = pi.id
    WHERE (
      ? = '' OR
      pi.invoice_number LIKE ? COLLATE NOCASE OR
      pi.supplier_name LIKE ? COLLATE NOCASE OR
      IFNULL(li.brand_name, '') LIKE ? COLLATE NOCASE OR
      IFNULL(li.salt_composition, '') LIKE ? COLLATE NOCASE
    )
    AND (? = 'ALL' OR pi.payment_status = ?)
    AND (? = '' OR pi.invoice_date >= ?)
    AND (? = '' OR pi.invoice_date <= ?)
    ORDER BY pi.invoice_date DESC, pi.invoice_number DESC
  `).all(term, like, like, like, like, stat, stat, from || '', from || '', to || '', to || '');

  const itemsFor = db.prepare('SELECT * FROM purchase_line_items WHERE invoice_id = ? ORDER BY brand_name');
  return rows.map(inv => ({ ...inv, items: itemsFor.all(inv.id) }));
}

function setInvoicePayment(id, { paymentStatus, paymentReference } = {}) {
  const status = String(paymentStatus || 'PAID').toUpperCase();
  if (!['PAID', 'CREDIT', 'PARTIAL'].includes(status)) {
    throw new Error('Payment status must be PAID, CREDIT, or PARTIAL');
  }
  const inv = db.prepare('SELECT * FROM purchase_invoices WHERE id = ?').get(id);
  if (!inv) throw new Error('Invoice not found');
  db.prepare('UPDATE purchase_invoices SET payment_status = ?, payment_reference = ? WHERE id = ?')
    .run(status, paymentReference || null, id);
  return db.prepare('SELECT * FROM purchase_invoices WHERE id = ?').get(id);
}

function addShortbook(body = {}) {
  const brand = String(body.brandName || '').trim();
  if (!brand) throw new Error('Medicine name is required');
  const qty = Math.max(1, parseInt(body.requestedStrips, 10) || 1);
  const supplier = body.supplierId
    ? db.prepare('SELECT * FROM suppliers WHERE id = ?').get(body.supplierId)
    : null;
  const med = db.prepare('SELECT * FROM medicines WHERE LOWER(brand_name) = LOWER(?)').get(brand);
  const id = 'sb-' + Date.now();
  db.prepare(`
    INSERT INTO shortbook_items (
      id, medicine_id, brand_name, pack_label, supplier_id, supplier_name, supplier_phone,
      requested_strips, last_ptr, last_scheme, note, source, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'MANUAL', 'OPEN')
  `).run(
    id,
    med ? med.id : null,
    brand,
    body.packLabel || (med ? med.pack_label : ''),
    supplier ? supplier.id : null,
    supplier ? supplier.name : (body.supplierName || 'Unassigned'),
    supplier ? supplier.phone : '',
    qty,
    body.lastPtr != null ? Number(body.lastPtr) : null,
    body.lastScheme || '',
    body.note || ''
  );
  return db.prepare('SELECT * FROM shortbook_items WHERE id = ?').get(id);
}

function markShortbook(body = {}) {
  const status = String(body.status || 'ORDERED').toUpperCase();
  if (!['ORDERED', 'CLEARED', 'OPEN'].includes(status)) throw new Error('Invalid shortbook status');
  let ids = Array.isArray(body.ids) ? body.ids.filter(Boolean) : [];
  if (!ids.length && body.supplierId) {
    ids = db.prepare(`
      SELECT id FROM shortbook_items
      WHERE status = 'OPEN' AND (supplier_id = ? OR supplier_name = ?)
    `).all(body.supplierId, body.supplierId).map(r => r.id);
  }
  if (!ids.length) throw new Error('Choose at least one shortbook line');
  const quantities = body.quantities || {};
  const tx = db.transaction(() => {
    for (const id of ids) {
      if (quantities[id] !== undefined) {
        db.prepare(`
          UPDATE shortbook_items
          SET requested_strips = ?, status = ?, updated_at = datetime('now')
          WHERE id = ?
        `).run(Math.max(1, parseInt(quantities[id], 10) || 1), status, id);
      } else {
        db.prepare(`
          UPDATE shortbook_items SET status = ?, updated_at = datetime('now') WHERE id = ?
        `).run(status, id);
      }
    }
  });
  tx();
  return { updated: ids.length, status };
}

function orderPack(supplierId) {
  const items = db.prepare(`
    SELECT * FROM shortbook_items
    WHERE status = 'OPEN' AND (supplier_id = ? OR supplier_name = ?)
    ORDER BY brand_name
  `).all(supplierId, supplierId);
  if (!items.length) throw new Error('No open shortbook lines for this supplier');
  const settings = db.prepare('SELECT * FROM store_settings WHERE id = 1').get();
  const name = items[0].supplier_name || 'Supplier';
  const lines = [
    `${settings.store_name} — Purchase Order`,
    settings.city,
    `Supplier: ${name}`,
    `Date: ${STORE_TODAY}`,
    '----------------------------------------',
    ...items.map((it, i) => {
      const bits = [
        `${i + 1}. ${it.brand_name}`,
        `   Pack: ${it.pack_label || '—'}`,
        `   Qty: ${it.requested_strips} strips`,
        `   Last Supplied PTR: ${it.last_ptr != null ? money(it.last_ptr) : '—'}`
      ];
      if (it.last_scheme) bits.push(`   Scheme: ${it.last_scheme}`);
      if (it.note) bits.push(`   Note: ${it.note}`);
      return bits.join('\n');
    }),
    '----------------------------------------',
    'Please confirm availability and rate.'
  ];
  const text = lines.join('\n');
  return { text, whatsappUrl: waLink(items[0].supplier_phone, text), items, supplierName: name };
}

function ensureCustomer(name, phone) {
  const digits = phoneDigitsReady(phone);
  let customer = db.prepare('SELECT * FROM customer_accounts WHERE phone = ?').get(digits);
  if (!customer) {
    const id = 'cus-' + Date.now();
    db.prepare('INSERT INTO customer_accounts (id, name, phone, outstanding_balance) VALUES (?, ?, ?, 0)')
      .run(id, name, digits);
    customer = db.prepare('SELECT * FROM customer_accounts WHERE id = ?').get(id);
  }
  return customer;
}

function postCreditForSale({ sale, name, phone }) {
  const customerName = String(name || '').trim();
  if (!customerName) throw new Error('Credit account needs a customer name');
  const digits = normalizePhone(phone);
  if (digits.length !== 10) throw new Error('Credit account needs a 10-digit phone');
  const customer = ensureCustomer(customerName, digits);
  const amount = Number(sale.billed_amount) || 0;
  const next = Number((Number(customer.outstanding_balance) + amount).toFixed(2));
  db.prepare(`
    UPDATE customer_accounts
    SET outstanding_balance = ?, name = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(next, customerName, customer.id);
  const summary = `${sale.brand_name} — ${sale.strips_sold || 0} strips + ${sale.loose_tablets_sold || 0} loose`;
  db.prepare(`
    INSERT INTO credit_transactions (
      id, customer_id, sale_id, txn_type, amount, payment_mode, reference_note, item_summary, balance_after
    ) VALUES (?, ?, ?, 'SALE', ?, 'CREDIT', 'Counter credit sale', ?, ?)
  `).run('ctx-' + Date.now(), customer.id, sale.id, amount, summary, next);
  db.prepare(`
    UPDATE sales_entries
    SET payment_mode = 'CREDIT', customer_id = ?, customer_phone = ?, patient_name = ?
    WHERE id = ?
  `).run(customer.id, customer.phone, customerName, sale.id);
  return customer.id;
}

function reverseCreditForSale(saleId) {
  const txn = db.prepare(`
    SELECT * FROM credit_transactions WHERE sale_id = ? AND txn_type = 'SALE'
  `).get(saleId);
  if (!txn) return;
  if (db.prepare(`SELECT id FROM credit_transactions WHERE sale_id = ? AND txn_type = 'REVERSAL'`).get(saleId)) return;
  const customer = db.prepare('SELECT * FROM customer_accounts WHERE id = ?').get(txn.customer_id);
  if (!customer) return;
  const next = Number(Math.max(0, Number(customer.outstanding_balance) - Number(txn.amount)).toFixed(2));
  db.prepare(`UPDATE customer_accounts SET outstanding_balance = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(next, customer.id);
  db.prepare(`
    INSERT INTO credit_transactions (
      id, customer_id, sale_id, txn_type, amount, payment_mode, reference_note, item_summary, balance_after
    ) VALUES (?, ?, ?, 'REVERSAL', ?, 'CREDIT', 'Sale undone', ?, ?)
  `).run('ctx-rev-' + Date.now(), customer.id, saleId, txn.amount, txn.item_summary, next);
}

function recordPayment(body = {}) {
  const customer = db.prepare('SELECT * FROM customer_accounts WHERE id = ?').get(body.customerId);
  if (!customer) throw new Error('Customer account not found');
  const amount = Number(body.amount);
  if (!amount || amount <= 0) throw new Error('Enter a payment amount');
  if (amount - Number(customer.outstanding_balance) > 0.009) {
    throw new Error('Payment is higher than the outstanding balance');
  }
  const mode = String(body.paymentMode || 'CASH').toUpperCase();
  if (!['CASH', 'UPI'].includes(mode)) throw new Error('Record the payment as Cash or UPI');
  const next = Number((Number(customer.outstanding_balance) - amount).toFixed(2));
  db.prepare(`UPDATE customer_accounts SET outstanding_balance = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(next, customer.id);
  db.prepare(`
    INSERT INTO credit_transactions (
      id, customer_id, sale_id, txn_type, amount, payment_mode, reference_note, item_summary, balance_after
    ) VALUES (?, ?, NULL, 'PAYMENT', ?, ?, ?, 'Payment received', ?)
  `).run(
    'ctx-pay-' + Date.now(),
    customer.id,
    amount,
    mode,
    body.note || (mode === 'UPI' ? 'UPI payment' : 'Cash payment'),
    next
  );
  return db.prepare('SELECT * FROM customer_accounts WHERE id = ?').get(customer.id);
}

function statementText(customerId) {
  const customer = db.prepare('SELECT * FROM customer_accounts WHERE id = ?').get(customerId);
  if (!customer) throw new Error('Customer account not found');
  const txns = db.prepare(`
    SELECT * FROM credit_transactions WHERE customer_id = ? ORDER BY created_at ASC, id ASC
  `).all(customerId);
  const settings = db.prepare('SELECT * FROM store_settings WHERE id = 1').get();
  const lines = [
    `${settings.store_name} — Credit Statement`,
    settings.city,
    `Customer: ${customer.name}`,
    `Phone: ${customer.phone}`,
    '----------------------------------------',
    ...txns.map(t => `${t.created_at} | ${t.txn_type} | ${t.item_summary || t.reference_note || ''} | ${money(t.amount)} | Bal ${money(t.balance_after)}`),
    '----------------------------------------',
    `Outstanding Balance: ${money(customer.outstanding_balance)}`
  ];
  const text = lines.join('\n');
  return { text, whatsappUrl: waLink(customer.phone, text), customer, transactions: txns };
}

function createRefill(body = {}) {
  const name = String(body.patientName || body.customerName || '').trim();
  if (!name) throw new Error('Refill schedule needs a patient name');
  const phone = normalizePhone(body.phone || body.customerPhone);
  const med = db.prepare('SELECT * FROM medicines WHERE id = ?').get(body.medicineId);
  if (!med) throw new Error('Refill medicine was not found');
  const customer = ensureCustomer(name, phone);
  const interval = Math.max(1, parseInt(body.intervalDays || body.refillIntervalDays, 10) || 30);
  const id = 'ref-' + Date.now();
  db.prepare(`
    INSERT INTO refill_schedules (
      id, customer_id, patient_name, phone, medicine_id, brand_name, salt_composition,
      strips_qty, loose_qty, interval_days, last_purchase_date, next_due_date, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE')
  `).run(
    id,
    customer.id,
    name,
    phone,
    med.id,
    med.brand_name,
    med.salt_composition,
    Math.max(0, parseInt(body.stripsQty, 10) || 0),
    Math.max(0, parseInt(body.looseQty, 10) || 0),
    interval,
    STORE_TODAY,
    addDays(STORE_TODAY, interval)
  );
  return db.prepare('SELECT * FROM refill_schedules WHERE id = ?').get(id);
}

function listRefills() {
  const rows = db.prepare('SELECT * FROM refill_schedules ORDER BY next_due_date ASC, patient_name ASC').all();
  return rows.map(r => {
    const stock = r.medicine_id
      ? db.prepare(`
          SELECT COALESCE(SUM(strips_count), 0) AS strips, COALESCE(SUM(loose_tablets_count), 0) AS loose
          FROM inventory_batches WHERE medicine_id = ?
        `).get(r.medicine_id)
      : { strips: 0, loose: 0 };
    const med = r.medicine_id
      ? db.prepare('SELECT min_reorder_strips, pack_label, rack_location FROM medicines WHERE id = ?').get(r.medicine_id)
      : null;
    const min = med ? med.min_reorder_strips : 0;
    const days = daysUntil(r.next_due_date);
    return {
      ...r,
      pack_label: med ? med.pack_label : '',
      rack_location: med ? med.rack_location : '',
      stock_strips: stock.strips || 0,
      stock_loose: stock.loose || 0,
      low_stock: (stock.strips || 0) <= min,
      days_until_due: days,
      due_soon: days <= 3 && r.status !== 'PAUSED'
    };
  });
}

function markRefillNotified(id) {
  const row = db.prepare('SELECT * FROM refill_schedules WHERE id = ?').get(id);
  if (!row) throw new Error('Refill schedule not found');
  db.prepare(`UPDATE refill_schedules SET status = 'NOTIFIED', notified_at = datetime('now') WHERE id = ?`).run(id);
  return db.prepare('SELECT * FROM refill_schedules WHERE id = ?').get(id);
}

function refillAlert(id) {
  const row = db.prepare('SELECT * FROM refill_schedules WHERE id = ?').get(id);
  if (!row) throw new Error('Refill schedule not found');
  const settings = db.prepare('SELECT * FROM store_settings WHERE id = 1').get();
  const text = [
    settings.store_name,
    settings.city,
    `Hello ${row.patient_name},`,
    `Your refill for ${row.brand_name} (${row.strips_qty} strips) is due on ${row.next_due_date}.`,
    'Please visit the counter or reply to confirm.',
    settings.phone
  ].join('\n');
  return { text, whatsappUrl: waLink(row.phone, text), refill: row };
}

function fulfillRefill(id) {
  const row = db.prepare('SELECT * FROM refill_schedules WHERE id = ?').get(id);
  if (!row) throw new Error('Refill schedule not found');
  if (!row.medicine_id) throw new Error('This refill is not linked to shelf stock');
  const sale = deductSaleFEFO({
    medicineId: row.medicine_id,
    stripsSold: row.strips_qty,
    looseTabletsSold: row.loose_qty,
    patientName: row.patient_name,
    customerPhone: row.phone,
    paymentMode: 'CASH'
  });
  const next = addDays(STORE_TODAY, row.interval_days || 30);
  db.prepare(`
    UPDATE refill_schedules
    SET last_purchase_date = ?, next_due_date = ?, status = 'ACTIVE', notified_at = NULL
    WHERE id = ?
  `).run(STORE_TODAY, next, id);
  return {
    sale,
    refill: db.prepare('SELECT * FROM refill_schedules WHERE id = ?').get(id)
  };
}

function v2Payload() {
  syncShortbook();
  const invoiceItems = db.prepare('SELECT * FROM purchase_line_items ORDER BY brand_name').all();
  const shortbook = db.prepare(`
    SELECT * FROM shortbook_items WHERE status = 'OPEN' ORDER BY supplier_name, brand_name
  `).all();
  const customers = db.prepare(`
    SELECT c.*,
      (SELECT MAX(created_at) FROM credit_transactions t WHERE t.customer_id = c.id) AS last_txn_at
    FROM customer_accounts c
    ORDER BY c.outstanding_balance DESC, c.name ASC
  `).all();
  const creditTransactions = db.prepare(`
    SELECT * FROM credit_transactions ORDER BY created_at DESC, id DESC LIMIT 300
  `).all();
  const refills = listRefills();
  const pendingCreditBalance = Number(customers.reduce((sum, c) => sum + Number(c.outstanding_balance || 0), 0).toFixed(2));
  const dueRefillCount = refills.filter(r => r.due_soon).length;
  return {
    invoiceItems,
    shortbook,
    customers,
    creditTransactions,
    refills,
    pendingCreditBalance,
    dueRefillCount,
    shortbookCount: shortbook.length
  };
}

module.exports = {
  STORE_TODAY,
  syncShortbook,
  insertPurchaseLine,
  searchInvoices,
  setInvoicePayment,
  addShortbook,
  markShortbook,
  orderPack,
  postCreditForSale,
  reverseCreditForSale,
  recordPayment,
  statementText,
  createRefill,
  listRefills,
  markRefillNotified,
  refillAlert,
  fulfillRefill,
  v2Payload
};
