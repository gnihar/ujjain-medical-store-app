const { db } = require('../db/database');
const { normalizePhone } = require('./receiptService');
const { deductSaleFEFO } = require('./fefoService');
const commercial = require('./commercial');

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
      SELECT b.ptr_per_strip, b.free_strips_received, b.scheme_buy_qty, b.scheme_free_qty,
             b.supplier_id, s.name AS supplier_name, s.phone AS supplier_phone
      FROM inventory_batches b
      LEFT JOIN suppliers s ON s.id = b.supplier_id
      WHERE b.medicine_id = ?
      ORDER BY b.created_at DESC, b.id DESC
      LIMIT 1
    `).get(m.id);
    const line = db.prepare(`
      SELECT scheme_label FROM purchase_line_items
      WHERE medicine_id = ? AND scheme_label IS NOT NULL AND scheme_label != '' AND scheme_label != 'No Scheme'
      ORDER BY rowid DESC LIMIT 1
    `).get(m.id);
    const fromBatch = last
      ? commercial.schemeFromParts('', last.scheme_buy_qty, last.scheme_free_qty != null ? last.scheme_free_qty : last.free_strips_received)
      : null;
    const scheme = (line && line.scheme_label) || (fromBatch && fromBatch.free > 0 ? fromBatch.label : '');
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
  const scheme = commercial.schemeFromParts(item.schemeLabel, paid, free);
  db.prepare(`
    INSERT INTO purchase_line_items (
      id, invoice_id, batch_id, medicine_id, brand_name, salt_composition, pack_label,
      rack_location, batch_number, expiry_date, strips_qty, free_strips_qty, scheme_label,
      scheme_buy_qty, scheme_free_qty, ptr_per_strip, mrp_per_strip, gst_percent
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    scheme.label,
    scheme.buy,
    scheme.free,
    parseFloat(item.ptrPerStrip) || 0,
    parseFloat(item.mrpPerStrip) || 0,
    parseFloat(item.gstPercent) || 12
  );
  return scheme;
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
        `   Last Buy Price (PTR): ${it.last_ptr != null ? money(it.last_ptr) : '—'}`
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
  const text = commercial.refillAlertLines({
    lang: settings.default_language,
    storeName: settings.store_name,
    city: settings.city,
    phone: settings.phone,
    patientName: row.patient_name,
    brandName: row.brand_name,
    stripsQty: row.strips_qty,
    nextDue: row.next_due_date
  }).join('\n');
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

function lowStockMedicineCount() {
  const rows = db.prepare(`
    SELECT m.id, m.min_reorder_strips AS min_strips, COALESCE(SUM(b.strips_count), 0) AS strips
    FROM medicines m
    LEFT JOIN inventory_batches b ON b.medicine_id = m.id
    GROUP BY m.id
  `).all();
  const ids = rows.filter(row => Number(row.strips) <= Number(row.min_strips || 0)).map(row => row.id);
  return { count: ids.length, ids };
}

function saveSupplier(body = {}, id) {
  const name = String(body.name || body.supplierName || '').trim();
  if (!name) throw new Error('Supplier name is required');
  const phone = normalizePhone(body.phone || body.whatsapp || '');
  const shortCode = String(body.shortCode || body.short_code || '').trim();
  const gstin = String(body.gstin || '').trim();
  const address = String(body.address || '').trim();
  const creditDays = Math.max(0, parseInt(body.creditDays != null ? body.creditDays : body.credit_days, 10) || 0);
  const cashDiscount = commercial.round2(body.cashDiscountPct != null ? body.cashDiscountPct : body.cash_discount_pct);
  if (id) {
    const existing = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(id);
    if (!existing) throw new Error('Supplier not found');
    db.prepare(`
      UPDATE suppliers
      SET name = ?, short_code = ?, gstin = ?, phone = ?, address = ?, credit_days = ?, cash_discount_pct = ?
      WHERE id = ?
    `).run(
      name,
      shortCode || existing.short_code || '',
      gstin || existing.gstin || '',
      phone,
      address || existing.address || '',
      creditDays || existing.credit_days || 21,
      Number.isFinite(cashDiscount) ? cashDiscount : (existing.cash_discount_pct || 0),
      id
    );
    return db.prepare('SELECT * FROM suppliers WHERE id = ?').get(id);
  }
  const newId = 'sup-' + Date.now();
  db.prepare(`
    INSERT INTO suppliers (id, name, short_code, gstin, phone, address, credit_days, cash_discount_pct, expiry_return_window_days)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 60)
  `).run(newId, name, shortCode, gstin, phone, address || 'Ujjain', creditDays || 21, cashDiscount || 0);
  return db.prepare('SELECT * FROM suppliers WHERE id = ?').get(newId);
}

function listOffers(filter = {}) {
  const rows = db.prepare(`
    SELECT o.*, s.name AS supplier_name, s.short_code, s.phone AS supplier_phone
    FROM supplier_offers o
    JOIN suppliers s ON s.id = o.supplier_id
    ORDER BY o.salt_composition, o.retail_margin_pct DESC, o.brand_name
  `).all();
  let list = commercial.decorateOffers(rows);
  const mode = String(filter.mode || '').toLowerCase();
  const q = String(filter.q || filter.query || '').trim().toLowerCase();
  if (q) {
    list = list.filter(row => {
      if (mode === 'brand') return String(row.brand_name || '').toLowerCase().includes(q);
      if (mode === 'salt') return String(row.salt_composition || '').toLowerCase().includes(q);
      return String(row.brand_name || '').toLowerCase().includes(q) || String(row.salt_composition || '').toLowerCase().includes(q);
    });
  }
  if (filter.supplierId) list = list.filter(row => row.supplier_id === filter.supplierId);
  return list;
}

function upsertOffer(body = {}, id) {
  const record = commercial.buildOfferRecord(body);
  if (!record.supplier_id) throw new Error('Choose a stockist');
  if (!record.brand_name) throw new Error('Brand name is required');
  const supplier = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(record.supplier_id);
  if (!supplier) throw new Error('Supplier not found');
  const offerId = id || body.id || ('off-' + Date.now() + '-' + Math.floor(Math.random() * 100000));
  const existing = db.prepare('SELECT id FROM supplier_offers WHERE id = ?').get(offerId);
  if (existing) {
    db.prepare(`
      UPDATE supplier_offers
      SET supplier_id = ?, medicine_id = ?, brand_name = ?, salt_composition = ?, buy_price_ptr = ?, mrp = ?,
          scheme_label = ?, buy_qty = ?, free_qty = ?, cash_discount_pct = ?, net_buy_price = ?, retail_margin_pct = ?,
          valid_until = ?, source = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(
      record.supplier_id, record.medicine_id, record.brand_name, record.salt_composition, record.buy_price_ptr, record.mrp,
      record.scheme_label, record.buy_qty, record.free_qty, record.cash_discount_pct, record.net_buy_price, record.retail_margin_pct,
      record.valid_until, record.source, offerId
    );
  } else {
    db.prepare(`
      INSERT INTO supplier_offers (
        id, supplier_id, medicine_id, brand_name, salt_composition, buy_price_ptr, mrp, scheme_label,
        buy_qty, free_qty, cash_discount_pct, net_buy_price, retail_margin_pct, valid_until, source
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      offerId, record.supplier_id, record.medicine_id, record.brand_name, record.salt_composition, record.buy_price_ptr, record.mrp,
      record.scheme_label, record.buy_qty, record.free_qty, record.cash_discount_pct, record.net_buy_price, record.retail_margin_pct,
      record.valid_until, record.source
    );
  }
  return listOffers().find(row => row.id === offerId);
}

function learnOfferFromBill({ supplierId, medicine, item }) {
  if (!supplierId || !medicine) return null;
  const supplier = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(supplierId);
  const scheme = commercial.schemeFromParts(item.schemeLabel, item.stripsCount, item.freeStrips);
  const brand = medicine.brand_name || item.brandName;
  const existing = db.prepare(`
    SELECT id FROM supplier_offers
    WHERE supplier_id = ? AND LOWER(brand_name) = LOWER(?) AND source = ?
  `).get(supplierId, brand, commercial.SOURCE_AUTO);
  return upsertOffer({
    id: existing ? existing.id : undefined,
    supplierId,
    medicineId: medicine.id,
    brandName: brand,
    saltComposition: medicine.salt_composition || item.saltComposition || '',
    buyPricePtr: item.ptrPerStrip,
    mrp: item.mrpPerStrip,
    schemeLabel: scheme.label,
    buyQty: scheme.buy,
    freeQty: scheme.free,
    cashDiscountPct: supplier ? supplier.cash_discount_pct : 0,
    source: commercial.SOURCE_AUTO
  }, existing ? existing.id : undefined);
}

function orderOfferToShortbook(offerId, body = {}) {
  const offer = db.prepare(`
    SELECT o.*, s.name AS supplier_name, s.phone AS supplier_phone, s.short_code
    FROM supplier_offers o
    JOIN suppliers s ON s.id = o.supplier_id
    WHERE o.id = ?
  `).get(offerId);
  if (!offer) throw new Error('Offer not found');
  return addShortbook({
    brandName: offer.brand_name,
    packLabel: body.packLabel || '',
    supplierId: offer.supplier_id,
    requestedStrips: body.requestedStrips || 1,
    lastPtr: offer.net_buy_price,
    lastScheme: offer.scheme_label,
    note: 'Order this deal — ' + (offer.short_code || offer.supplier_name) + ' net ' + money(offer.net_buy_price)
  });
}

function seedManualOffers() {
  for (const offer of commercial.MANUAL_OFFERS) {
    if (db.prepare('SELECT id FROM supplier_offers WHERE id = ?').get(offer.id)) continue;
    upsertOffer(Object.assign({}, offer, { source: commercial.SOURCE_MANUAL }), offer.id);
  }
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
    shortbookCount: shortbook.length,
    offers: listOffers()
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
  v2Payload,
  lowStockMedicineCount,
  saveSupplier,
  listOffers,
  upsertOffer,
  learnOfferFromBill,
  orderOfferToShortbook,
  seedManualOffers,
  commercial
};
