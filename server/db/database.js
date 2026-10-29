const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, '../../data/ujjain_medstore.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sqlite.sql');
const BILLS_DIR = path.join(__dirname, '../../public/uploads/bills');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
fs.mkdirSync(BILLS_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function generateSampleBillSvg(filename, supplier, gstin, address, invNo, invDate, rows) {
  const filePath = path.join(BILLS_DIR, filename);
  const itemsSvg = rows.map((r, i) => {
    const y = 210 + i * 28;
    return `<text x="20" y="${y}" font-family="monospace" font-size="12" fill="#1e293b">${i + 1}. ${r.name.padEnd(22, ' ')} | ${r.pack.padEnd(8, ' ')} | Batch: ${r.batch} | Exp: ${r.exp} | Qty: ${r.qty}+${r.free} | PTR: Rs.${r.ptr} | MRP: Rs.${r.mrp}</text>`;
  }).join('\n');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="820" height="360" viewBox="0 0 820 360">
  <rect width="820" height="360" fill="#fffdf7" stroke="#cbd5e1" stroke-width="2" rx="8"/>
  <rect x="12" y="12" width="796" height="75" fill="#f1f5f9" rx="4"/>
  <text x="24" y="38" font-family="monospace" font-weight="bold" font-size="18" fill="#0f172a">TAX INVOICE — ${supplier.toUpperCase()}</text>
  <text x="24" y="58" font-family="monospace" font-size="12" fill="#334155">${address} | GSTIN: ${gstin}</text>
  <text x="24" y="76" font-family="monospace" font-size="12" fill="#0f766e">Buyer: Akshay Medicose, Ujjain | DL: 20B/UJN/4418</text>
  <text x="560" y="38" font-family="monospace" font-weight="bold" font-size="14" fill="#b91c1c">INV NO: ${invNo}</text>
  <text x="560" y="58" font-family="monospace" font-size="12" fill="#334155">DATE: ${invDate}</text>
  <line x1="16" y1="102" x2="804" y2="102" stroke="#94a3b8" stroke-width="1"/>
  <text x="20" y="124" font-family="monospace" font-weight="bold" font-size="12" fill="#475569">S.No | Product Description    | Pack     | Batch No   | Expiry   | Qty+Free | PTR       | MRP</text>
  <line x1="16" y1="136" x2="804" y2="136" stroke="#94a3b8" stroke-width="1"/>
  ${itemsSvg.replace(/210/g, '165').replace(/238/g, '195').replace(/266/g, '225')}
  <line x1="16" y1="285" x2="804" y2="285" stroke="#94a3b8" stroke-width="1"/>
  <text x="24" y="315" font-family="monospace" font-size="12" fill="#475569">Terms: Goods returnable up to 60 days prior to expiry for credit note adjustment.</text>
  <text x="580" y="335" font-family="monospace" font-weight="bold" font-size="13" fill="#0f172a">Authorized Signatory</text>
</svg>`;
  fs.writeFileSync(filePath, svg, 'utf8');
  return `/uploads/bills/${filename}`;
}

function addDaysIso(daysOffset) {
  const d = new Date('2026-10-27T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + daysOffset);
  return d.toISOString().slice(0, 10);
}

function ensureColumns() {
  const hasSettings = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='store_settings'").get();
  if (hasSettings) {
    const cols = db.prepare('PRAGMA table_info(store_settings)').all().map(c => c.name);
    if (!cols.includes('owner_pin')) {
      db.exec("ALTER TABLE store_settings ADD COLUMN owner_pin TEXT NOT NULL DEFAULT '1234'");
    }
    db.prepare(`UPDATE store_settings SET store_name = 'Akshay Medicose' WHERE store_name LIKE '%Mahakal Medical%'`).run();
    db.prepare(`UPDATE store_settings SET owner_pin = '1234' WHERE owner_pin IS NULL OR TRIM(owner_pin) = ''`).run();
  }
  const hasSales = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sales_entries'").get();
  if (hasSales) {
    const cols = db.prepare('PRAGMA table_info(sales_entries)').all().map(c => c.name);
    if (!cols.includes('customer_phone')) {
      db.exec('ALTER TABLE sales_entries ADD COLUMN customer_phone TEXT');
    }
    if (!cols.includes('payment_mode')) {
      db.exec("ALTER TABLE sales_entries ADD COLUMN payment_mode TEXT NOT NULL DEFAULT 'CASH'");
    }
    if (!cols.includes('customer_id')) {
      db.exec('ALTER TABLE sales_entries ADD COLUMN customer_id TEXT');
    }
  }
  const hasInv = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='purchase_invoices'").get();
  if (hasInv) {
    const cols = db.prepare('PRAGMA table_info(purchase_invoices)').all().map(c => c.name);
    if (!cols.includes('payment_reference')) {
      db.exec('ALTER TABLE purchase_invoices ADD COLUMN payment_reference TEXT');
    }
  }
  const addCol = (table, column, ddl) => {
    const exists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table);
    if (!exists) return;
    const cols = db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
    if (!cols.includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  };
  addCol('suppliers', 'short_code', 'short_code TEXT');
  addCol('suppliers', 'cash_discount_pct', 'cash_discount_pct REAL NOT NULL DEFAULT 0');
  addCol('inventory_batches', 'scheme_buy_qty', 'scheme_buy_qty INTEGER NOT NULL DEFAULT 0');
  addCol('inventory_batches', 'scheme_free_qty', 'scheme_free_qty INTEGER NOT NULL DEFAULT 0');
  addCol('purchase_line_items', 'scheme_buy_qty', 'scheme_buy_qty INTEGER NOT NULL DEFAULT 0');
  addCol('purchase_line_items', 'scheme_free_qty', 'scheme_free_qty INTEGER NOT NULL DEFAULT 0');
  addCol('store_settings', 'admin_pattern', "admin_pattern TEXT NOT NULL DEFAULT '0-3-6-7-8'");
  addCol('store_settings', 'biometric_credential_id', "biometric_credential_id TEXT DEFAULT 'bio-demo-akshay-1'");
  addCol('store_settings', 'biometric_enabled', 'biometric_enabled INTEGER NOT NULL DEFAULT 1');
  addCol('store_settings', 'tutorial_completed', 'tutorial_completed INTEGER NOT NULL DEFAULT 0');
  addCol('store_settings', 'admin_lock_minutes', 'admin_lock_minutes INTEGER NOT NULL DEFAULT 15');
  addCol('sales_entries', 'ptr_per_strip', 'ptr_per_strip REAL NOT NULL DEFAULT 0');
  addCol('sales_entries', 'cogs_amount', 'cogs_amount REAL NOT NULL DEFAULT 0');
  addCol('sales_entries', 'margin_amount', 'margin_amount REAL NOT NULL DEFAULT 0');
  addCol('sales_entries', 'voucher_id', 'voucher_id TEXT');
  const settingsRow = db.prepare('SELECT admin_pattern, biometric_credential_id FROM store_settings WHERE id = 1').get();
  if (settingsRow) {
    if (!settingsRow.admin_pattern) {
      db.prepare(`UPDATE store_settings SET admin_pattern = '0-3-6-7-8' WHERE id = 1`).run();
    }
    if (!settingsRow.biometric_credential_id) {
      db.prepare(`UPDATE store_settings SET biometric_credential_id = 'bio-demo-akshay-1', biometric_enabled = 1 WHERE id = 1`).run();
    }
  }
}

function backfillV2() {
  const hasMed = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='medicines'").get();
  if (!hasMed) return;
  if (db.prepare('SELECT COUNT(*) AS c FROM store_settings').get().c === 0) return;

  if (!db.prepare("SELECT id FROM medicines WHERE id = 'med-14'").get()) {
    db.prepare(`
      INSERT INTO medicines (
        id, brand_name, salt_composition, manufacturer, pack_size_units, pack_label,
        rack_location, schedule_type, hsn_code, gst_percent, min_reorder_strips
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'med-14', 'Ecosprin-AV 75 Tablet', 'Aspirin 75mg + Atorvastatin 10mg', 'USV Ltd',
      10, '1x10 Tabs', 'Rack B-4', 'H', '3004', 12, 5
    );
  }
  if (!db.prepare("SELECT id FROM inventory_batches WHERE id = 'b-15'").get()) {
    db.prepare(`
      INSERT INTO inventory_batches (
        id, medicine_id, supplier_id, purchase_invoice_id, batch_number, expiry_date,
        pack_size_units, strips_count, loose_tablets_count, free_strips_received,
        ptr_per_strip, mrp_per_strip, gst_percent
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('b-15', 'med-14', 'sup-2', 'inv-2', 'EC220', addDaysIso(200), 10, 20, 0, 2, 86, 118, 12);
  }

  const missingLines = db.prepare(`
    SELECT b.*, m.brand_name, m.salt_composition, m.pack_label, m.rack_location
    FROM inventory_batches b
    JOIN medicines m ON m.id = b.medicine_id
    WHERE b.purchase_invoice_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM purchase_line_items li WHERE li.batch_id = b.id)
  `).all();
  const insertLine = db.prepare(`
    INSERT INTO purchase_line_items (
      id, invoice_id, batch_id, medicine_id, brand_name, salt_composition, pack_label,
      rack_location, batch_number, expiry_date, strips_qty, free_strips_qty, scheme_label,
      scheme_buy_qty, scheme_free_qty, ptr_per_strip, mrp_per_strip, gst_percent
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const b of missingLines) {
    const free = b.free_strips_received || 0;
    const buy = b.scheme_buy_qty > 0 ? b.scheme_buy_qty : (free > 0 ? 10 : 1);
    const label = free > 0 ? `${buy}+${free}` : 'No Scheme';
    insertLine.run(
      'li-' + b.id,
      b.purchase_invoice_id,
      b.id,
      b.medicine_id,
      b.brand_name,
      b.salt_composition,
      b.pack_label,
      b.rack_location,
      b.batch_number,
      b.expiry_date,
      b.strips_count,
      free,
      label,
      buy,
      free,
      b.ptr_per_strip,
      b.mrp_per_strip,
      b.gst_percent
    );
  }
  try {
    const { seedManualOffers } = require('../services/storeModules');
    seedManualOffers();
  } catch (err) {
    console.error('Offer seed skipped:', err.message);
  }

  if (!db.prepare("SELECT id FROM customer_accounts WHERE id = 'cus-1'").get()) {
    const insertCus = db.prepare(`
      INSERT INTO customer_accounts (id, name, phone, outstanding_balance)
      VALUES (?, ?, ?, ?)
    `);
    insertCus.run('cus-1', 'Rajesh Sharma', '9826011111', 444);
    insertCus.run('cus-2', 'Meena Joshi', '9826022222', 0);
    insertCus.run('cus-3', 'Suresh Verma', '9826033333', 0);
    db.prepare(`
      INSERT INTO credit_transactions (
        id, customer_id, sale_id, txn_type, amount, payment_mode, reference_note,
        item_summary, balance_after, created_at
      ) VALUES (?, ?, NULL, 'SALE', ?, 'CREDIT', ?, ?, ?, ?)
    `).run(
      'ctx-1', 'cus-1', 444, 'Opening credit bill',
      'Telma 40 Tablet — 2 strips', 444, '2026-10-01 11:00:00'
    );
    const insertRef = db.prepare(`
      INSERT INTO refill_schedules (
        id, customer_id, patient_name, phone, medicine_id, brand_name, salt_composition,
        strips_qty, loose_qty, interval_days, last_purchase_date, next_due_date, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, 'ACTIVE')
    `);
    insertRef.run('ref-1', 'cus-1', 'Rajesh Sharma', '9826011111', 'med-10', 'Telma 40 Tablet', 'Telmisartan 40mg', 2, 30, '2026-09-30', '2026-10-30');
    insertRef.run('ref-2', 'cus-2', 'Meena Joshi', '9826022222', 'med-8', 'Glycomet-GP 2 Tablet', 'Glimepiride 2mg + Metformin 500mg', 1, 30, '2026-09-29', '2026-10-29');
    insertRef.run('ref-3', 'cus-3', 'Suresh Verma', '9826033333', 'med-14', 'Ecosprin-AV 75 Tablet', 'Aspirin 75mg + Atorvastatin 10mg', 1, 30, '2026-10-01', '2026-10-30');
  }

  const codes = [
    ['sup-1', 'S1', 0],
    ['sup-2', 'S2', 2],
    ['sup-3', 'S3', 1],
    ['sup-4', 'S4', 0]
  ];
  for (const [id, code, discount] of codes) {
    db.prepare(`
      UPDATE suppliers
      SET short_code = ?, cash_discount_pct = ?
      WHERE id = ? AND (short_code IS NULL OR TRIM(short_code) = '')
    `).run(code, discount, id);
  }
  db.prepare(`
    UPDATE inventory_batches
    SET scheme_free_qty = free_strips_received,
        scheme_buy_qty = CASE WHEN free_strips_received > 0 THEN 10 ELSE 1 END
    WHERE scheme_buy_qty IS NULL OR scheme_buy_qty = 0
  `).run();

  if (!db.prepare("SELECT id FROM shortbook_items WHERE id = 'sb-manual-1'").get()) {
    db.prepare(`
      INSERT INTO shortbook_items (
        id, medicine_id, brand_name, pack_label, supplier_id, supplier_name, supplier_phone,
        requested_strips, last_ptr, last_scheme, note, source, status
      ) VALUES (?, NULL, ?, ?, ?, ?, ?, ?, NULL, '', ?, 'MANUAL', 'OPEN')
    `).run(
      'sb-manual-1',
      'Crocin Advance Tablet',
      '1x15 Tabs',
      'sup-1',
      'Mahakal Pharma Agency, Ujjain',
      '+91 94250 91101',
      10,
      'Requested at the counter — not on the shelf'
    );
  }
  seedV3Demo();
}

function seedV3Demo() {
  const hasMed = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='medicines'").get();
  if (!hasMed) return;
  if (db.prepare('SELECT COUNT(*) AS c FROM store_settings').get().c === 0) return;

  const insertMed = db.prepare(`
    INSERT INTO medicines (id, brand_name, salt_composition, manufacturer, pack_size_units, pack_label, rack_location, schedule_type, hsn_code, gst_percent, min_reorder_strips)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, '3004', 12, ?)
  `);
  const extraMeds = [
    ['med-15', 'Azithral 500 Tablet', 'Azithromycin 500mg', 'Alembic', 5, '1x5 Tabs', 'Rack A-3', 'H1', 8],
    ['med-16', 'Allegra 120 Tablet', 'Fexofenadine 120mg', 'Sanofi', 10, '1x10 Tabs', 'Rack A-4', 'H', 8],
    ['med-17', 'Electral ORS Powder', 'Oral Rehydration Salts', 'FDC', 1, '21.8g Sachet', 'Rack C-2', 'OTC', 20],
    ['med-18', 'Shelcal 500 Tablet', 'Calcium 500mg + Vitamin D3', 'Torrent', 15, '1x15 Tabs', 'Rack C-2', 'OTC', 10]
  ];
  extraMeds.forEach(row => {
    if (!db.prepare('SELECT id FROM medicines WHERE id = ?').get(row[0])) insertMed.run(...row);
  });

  const insertBatch = db.prepare(`
    INSERT INTO inventory_batches (
      id, medicine_id, supplier_id, purchase_invoice_id, batch_number, expiry_date,
      pack_size_units, strips_count, loose_tablets_count, free_strips_received,
      ptr_per_strip, mrp_per_strip, gst_percent
    ) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, 0, 0, ?, ?, 12)
  `);
  const extraBatches = [
    ['b-16', 'med-15', 'sup-1', 'AZT04', addDaysIso(18), 5, 24, 89.5, 125],
    ['b-17', 'med-16', 'sup-3', 'ALG88', addDaysIso(40), 10, 30, 92, 148],
    ['b-18', 'med-17', 'sup-2', 'EL220', addDaysIso(120), 1, 48, 18, 22],
    ['b-19', 'med-18', 'sup-2', 'SHL88', addDaysIso(70), 15, 22, 98, 138]
  ];
  extraBatches.forEach(row => {
    if (!db.prepare('SELECT id FROM inventory_batches WHERE id = ?').get(row[0])) insertBatch.run(...row);
  });

  const insertSale = db.prepare(`
    INSERT INTO sales_entries (
      id, batch_id, medicine_id, brand_name, batch_number, rack_location, pack_size_units,
      strips_sold, loose_tablets_sold, total_units_deducted, prev_strips, prev_loose_tablets,
      new_strips, new_loose_tablets, billed_amount, ptr_per_strip, cogs_amount, margin_amount,
      patient_name, sale_note, is_cancelled, payment_mode, sold_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 0, ?, 0, ?, ?, ?, ?, ?, 'Seasonal demo history', 0, 'CASH', ?)
  `);
  const seasonal = [
    ['sale-s-2026-05-dolo', 'b-7', 'med-6', 'Dolo 650 Tablet', 'DL552', 'Rack C-1', 15, 40, 40, 33.8, 24.5, '2026-05-18 11:00:00'],
    ['sale-s-2026-05-ors', 'b-18', 'med-17', 'Electral ORS Powder', 'EL220', 'Rack C-2', 1, 30, 30, 22, 18, '2026-05-22 16:00:00'],
    ['sale-s-2026-06-dolo', 'b-7', 'med-6', 'Dolo 650 Tablet', 'DL552', 'Rack C-1', 15, 55, 55, 33.8, 24.5, '2026-06-12 10:00:00'],
    ['sale-s-2026-06-ors', 'b-18', 'med-17', 'Electral ORS Powder', 'EL220', 'Rack C-2', 1, 36, 36, 22, 18, '2026-06-20 15:00:00'],
    ['sale-s-2026-07-dolo', 'b-7', 'med-6', 'Dolo 650 Tablet', 'DL552', 'Rack C-1', 15, 48, 48, 33.8, 24.5, '2026-07-08 12:00:00'],
    ['sale-s-2026-07-aug', 'b-1', 'med-1', 'Augmentin 625 Duo Tab', 'AG624', 'Rack A-1', 10, 18, 18, 223, 162.5, '2026-07-19 13:00:00'],
    ['sale-s-2026-08-aug', 'b-1', 'med-1', 'Augmentin 625 Duo Tab', 'AG624', 'Rack A-1', 10, 26, 26, 223, 162.5, '2026-08-11 11:30:00'],
    ['sale-s-2026-08-dolo', 'b-7', 'med-6', 'Dolo 650 Tablet', 'DL552', 'Rack C-1', 15, 22, 22, 33.8, 24.5, '2026-08-25 17:00:00'],
    ['sale-s-2026-09-azi', 'b-16', 'med-15', 'Azithral 500 Tablet', 'AZT04', 'Rack A-3', 5, 20, 20, 125, 89.5, '2026-09-09 10:20:00'],
    ['sale-s-2026-09-pan', 'b-5', 'med-4', 'Pan-D Capsule PR', 'PD881', 'Rack B-1', 15, 14, 14, 210, 148, '2026-09-18 18:00:00'],
    ['sale-s-2026-10-azi', 'b-16', 'med-15', 'Azithral 500 Tablet', 'AZT04', 'Rack A-3', 5, 28, 28, 125, 89.5, '2026-10-06 11:10:00'],
    ['sale-s-2026-10-alg', 'b-17', 'med-16', 'Allegra 120 Tablet', 'ALG88', 'Rack A-4', 10, 18, 18, 148, 92, '2026-10-12 12:40:00'],
    ['sale-s-2026-10-dolo', 'b-7', 'med-6', 'Dolo 650 Tablet', 'DL552', 'Rack C-1', 15, 16, 16, 33.8, 24.5, '2026-10-15 09:50:00']
  ];
  seasonal.forEach(row => {
    if (db.prepare('SELECT id FROM sales_entries WHERE id = ?').get(row[0])) return;
    const strips = row[7];
    const units = strips * row[6];
    const billed = Number((strips * row[9]).toFixed(2));
    const cogs = Number((strips * row[10]).toFixed(2));
    insertSale.run(
      row[0], row[1], row[2], row[3], row[4], row[5], row[6], strips, units, strips, strips,
      billed, row[10], cogs, Number((billed - cogs).toFixed(2)), 'Walk-in', row[11]
    );
  });

  const todayStamp = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
  const todaySales = [
    ['sale-today-dolo', 'b-7', 'med-6', 'Dolo 650 Tablet', 'DL552', 'Rack C-1', 15, 40, 33.8, 24.5, '10:15:00'],
    ['sale-today-azi', 'b-16', 'med-15', 'Azithral 500 Tablet', 'AZT04', 'Rack A-3', 5, 12, 125, 89.5, '11:40:00'],
    ['sale-today-alg', 'b-17', 'med-16', 'Allegra 120 Tablet', 'ALG88', 'Rack A-4', 10, 10, 148, 92, '16:05:00']
  ];
  todaySales.forEach(row => {
    const strips = row[7];
    const units = strips * row[6];
    const billed = Number((strips * row[8]).toFixed(2));
    const cogs = Number((strips * row[9]).toFixed(2));
    const soldAt = todayStamp + ' ' + row[10];
    if (db.prepare('SELECT id FROM sales_entries WHERE id = ?').get(row[0])) {
      db.prepare('UPDATE sales_entries SET sold_at = ? WHERE id = ?').run(soldAt, row[0]);
      return;
    }
    insertSale.run(
      row[0], row[1], row[2], row[3], row[4], row[5], row[6], strips, units, strips, strips,
      billed, row[9], cogs, Number((billed - cogs).toFixed(2)), 'Counter', soldAt
    );
  });

  db.prepare(`
    UPDATE sales_entries
    SET ptr_per_strip = COALESCE((SELECT ptr_per_strip FROM inventory_batches b WHERE b.id = sales_entries.batch_id), 0)
    WHERE IFNULL(ptr_per_strip, 0) = 0
  `).run();
  db.prepare(`
    UPDATE sales_entries
    SET cogs_amount = ROUND((total_units_deducted * 1.0 / CASE WHEN pack_size_units = 0 THEN 1 ELSE pack_size_units END) * ptr_per_strip, 2),
        margin_amount = ROUND(billed_amount - ((total_units_deducted * 1.0 / CASE WHEN pack_size_units = 0 THEN 1 ELSE pack_size_units END) * ptr_per_strip), 2)
    WHERE IFNULL(cogs_amount, 0) = 0 AND IFNULL(ptr_per_strip, 0) > 0
  `).run();

  if (!db.prepare("SELECT id FROM expenses WHERE id = 'exp-salary-rahul'").get()) {
    const insertExp = db.prepare(`
      INSERT INTO expenses (id, category, title, employee_name, amount, expense_date, payment_mode, note)
      VALUES (?, ?, ?, ?, ?, ?, 'CASH', ?)
    `);
    insertExp.run('exp-salary-rahul', 'SALARY', 'Rahul (Counter Staff)', 'Rahul', 12000, '2026-10-01', 'October salary');
    insertExp.run('exp-salary-deepak', 'SALARY', 'Deepak (Helper)', 'Deepak', 6000, '2026-10-01', 'October salary');
    insertExp.run('exp-rent-oct', 'RENT', 'Shop Rent (Freeganj)', '', 8000, '2026-10-05', 'October rent');
    insertExp.run('exp-power-oct', 'ELECTRICITY', 'MPPKVVCL Bill', '', 1450, '2026-10-03', 'Fridge and shop');
    insertExp.run('exp-transport-oct', 'TRANSPORT', 'Wholesaler pickup', '', 350, '2026-10-21', 'Dewas Gate trip');
    insertExp.run('exp-salary-sep', 'SALARY', 'Rahul (Counter Staff)', 'Rahul', 12000, '2026-09-01', 'September salary');
    insertExp.run('exp-rent-sep', 'RENT', 'Shop Rent (Freeganj)', '', 8000, '2026-09-05', 'September rent');
  }

  if (!db.prepare("SELECT id FROM vouchers WHERE id = 'vch-demo-1'").get()) {
    db.prepare(`
      INSERT INTO vouchers (
        id, voucher_number, voucher_type, status, customer_or_supplier, customer_phone,
        items_json, total_amount, estimated_margin, payment_mode, created_by_role, note, created_at
      ) VALUES ('vch-demo-1', 'VCH-1042', 'SALE', 'DRAFT', 'Rajesh Sharma', '9826011111', ?, 67.6, 18.6, 'CASH', 'EMPLOYEE', 'Kaccha parcha at the counter', '2026-10-27 18:10:00')
    `).run(JSON.stringify([{ medicineId: 'med-6', strips: 2, loose: 0, patientName: 'Rajesh Sharma' }]));
  }

  if (!db.prepare("SELECT id FROM expiry_returns WHERE id = 'ret-demo-1'").get()) {
    db.prepare(`
      INSERT INTO expiry_returns (
        id, return_slip_no, batch_id, medicine_id, brand_name, batch_number, expiry_date, rack_location,
        supplier_id, supplier_name, supplier_phone, strips_returned, loose_returned, ptr_per_strip, ptr_value,
        return_reason, status, credit_note_no
      ) VALUES (
        'ret-demo-1', 'RET-201', 'b-9', 'med-8', 'Glycomet-GP 2 Tablet', 'GG108', ?, 'Rack B-4',
        'sup-3', 'Shipra Drug House, Ujjain', '+91 99260 77812', 2, 0, 124, 248,
        'Near Expiry (<=30d)', 'SENT', ''
      )
    `).run(addDaysIso(26));
  }

  const month = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit' }).format(new Date());
  const usage = db.prepare('SELECT year_month FROM ai_usage_monthly WHERE year_month = ?').get(month);
  if (!usage) {
    db.prepare(`
      INSERT INTO ai_usage_monthly (year_month, calls_used, monthly_limit) VALUES (?, 16, 300)
    `).run(month);
  }
}

function seedDatabase(forceReset = false) {
  const schemaSql = fs.readFileSync(SCHEMA_PATH, 'utf8');
  db.exec(schemaSql);
  ensureColumns();

  if (forceReset) {
    db.exec(`
      DELETE FROM credit_transactions;
      DELETE FROM refill_schedules;
      DELETE FROM shortbook_items;
      DELETE FROM expiry_returns;
      DELETE FROM vouchers;
      DELETE FROM expenses;
      DELETE FROM ai_usage_monthly;
      DELETE FROM purchase_line_items;
      DELETE FROM customer_accounts;
      DELETE FROM stock_audits;
      DELETE FROM sales_entries;
      DELETE FROM inventory_batches;
      DELETE FROM purchase_invoices;
      DELETE FROM supplier_offers;
      DELETE FROM medicines;
      DELETE FROM suppliers;
      DELETE FROM store_settings;
    `);
  }

  const existingSettings = db.prepare('SELECT COUNT(*) as cnt FROM store_settings').get();
  if (existingSettings.cnt > 0 && !forceReset) {
    backfillV2();
    return;
  }

  // Create sample SVG bill photos
  const bill1Url = generateSampleBillSvg(
    'mpa-26-1842.svg',
    'Mahakal Pharma Agency',
    '23AABCM4821E1Z4',
    '14, Freeganj Main Road, Ujjain (M.P.)',
    'MPA-26-1842',
    '2026-10-18',
    [
      { name: 'Augmentin 625 Duo Tab', pack: '1x10', batch: 'AG624', exp: addDaysIso(39), qty: 14, free: 1, ptr: '162.50', mrp: '223.00' },
      { name: 'Dolo 650 Tablet', pack: '1x15', batch: 'DL552', exp: addDaysIso(80), qty: 60, free: 5, ptr: '24.50', mrp: '33.80' },
      { name: 'Mixtard 30/70 Vial', pack: '1 Vial', batch: 'MX204', exp: addDaysIso(44), qty: 6, free: 0, ptr: '342.00', mrp: '455.00' }
    ]
  );

  const bill2Url = generateSampleBillSvg(
    'mmt-26-0744.svg',
    'Malwa Medico Traders',
    '23AADCM9102F1Z9',
    'Shop 8, Dewas Gate Wholesale Market, Ujjain',
    'MMT-26-0744',
    '2026-10-21',
    [
      { name: 'Moxikind-CV 625 Tab', pack: '1x10', batch: 'MK402', exp: addDaysIso(231), qty: 32, free: 3, ptr: '138.00', mrp: '195.00' },
      { name: 'Pan-D Capsule PR', pack: '1x15', batch: 'PD881', exp: addDaysIso(52), qty: 18, free: 2, ptr: '148.00', mrp: '210.00' },
      { name: 'Telma 40 Tablet', pack: '1x15', batch: 'TL774', exp: addDaysIso(318), qty: 7, free: 0, ptr: '158.00', mrp: '222.00' }
    ]
  );

  const bill3Url = generateSampleBillSvg(
    'sdh-26-3980.svg',
    'Shipra Drug House',
    '23AAECS7731H1Z2',
    'Nazar Ali Marg, Near Kotwali, Ujjain',
    'SDH-26-3980',
    '2026-10-24',
    [
      { name: 'Pantocid DSR Cap', pack: '1x10', batch: 'PC319', exp: addDaysIso(205), qty: 24, free: 2, ptr: '132.00', mrp: '188.00' },
      { name: 'Glycomet-GP 2 Tablet', pack: '1x15', batch: 'GG108', exp: addDaysIso(26), qty: 9, free: 0, ptr: '124.00', mrp: '174.00' }
    ]
  );

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO store_settings (id, store_name, city, drug_license_no, gstin, phone, expiry_alert_days, default_language, owner_pin)
      VALUES (1, 'Akshay Medicose', 'Freeganj, Ujjain (M.P.)', '20B/UJN/2021/4418, 21B/UJN/2021/4419', '23AABCS1429B1Z5', '+91 98260 12345', 60, 'en', '1234')
    `).run();

    const insertSupplier = db.prepare(`
      INSERT INTO suppliers (id, name, short_code, gstin, phone, address, credit_days, cash_discount_pct, expiry_return_window_days)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertSupplier.run('sup-1', 'Mahakal Pharma Agency, Ujjain', 'S1', '23AABCM4821E1Z4', '+91 94250 91101', '14, Freeganj Main Road, Ujjain', 21, 0, 60);
    insertSupplier.run('sup-2', 'Malwa Medico Traders, Ujjain', 'S2', '23AADCM9102F1Z9', '+91 98270 33219', 'Shop 8, Dewas Gate Wholesale Market, Ujjain', 30, 2, 60);
    insertSupplier.run('sup-3', 'Shipra Drug House, Ujjain', 'S3', '23AAECS7731H1Z2', '+91 99260 77812', 'Nazar Ali Marg, Near Kotwali, Ujjain', 15, 1, 60);
    insertSupplier.run('sup-4', 'Avantika Pharma Distributors, Ujjain', 'S4', '23AABCA5519K1Z1', '+91 97550 61230', 'Tower Chowk, Freeganj, Ujjain', 21, 0, 90);

    const insertMed = db.prepare(`
      INSERT INTO medicines (id, brand_name, salt_composition, manufacturer, pack_size_units, pack_label, rack_location, schedule_type, hsn_code, gst_percent, min_reorder_strips)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const meds = [
      ['med-1', 'Augmentin 625 Duo Tab', 'Amoxicillin 500mg + Clavulanic Acid 125mg', 'GSK Pharma', 10, '1x10 Tabs', 'Rack A-1', 'H1', '3004', 12, 10],
      ['med-2', 'Moxikind-CV 625 Tab', 'Amoxicillin 500mg + Clavulanic Acid 125mg', 'Mankind Pharma', 10, '1x10 Tabs', 'Rack A-2', 'H1', '3004', 12, 12],
      ['med-3', 'Clavam 625 Tablet', 'Amoxicillin 500mg + Clavulanic Acid 125mg', 'Alkem Labs', 10, '1x10 Tabs', 'Rack A-1', 'H1', '3004', 12, 10],
      ['med-4', 'Pan-D Capsule PR', 'Pantoprazole 40mg + Domperidone 30mg', 'Alkem Labs', 15, '1x15 Caps', 'Rack B-1', 'H', '3004', 12, 15],
      ['med-5', 'Pantocid DSR Cap', 'Pantoprazole 40mg + Domperidone 30mg', 'Sun Pharma', 10, '1x10 Caps', 'Rack B-2', 'H', '3004', 12, 10],
      ['med-6', 'Dolo 650 Tablet', 'Paracetamol 650mg', 'Micro Labs', 15, '1x15 Tabs', 'Rack C-1', 'OTC', '3004', 12, 30],
      ['med-7', 'Calpol 650 Tablet', 'Paracetamol 650mg', 'GSK Pharma', 15, '1x15 Tabs', 'Rack C-2', 'OTC', '3004', 12, 20],
      ['med-8', 'Glycomet-GP 2 Tablet', 'Glimepiride 2mg + Metformin 500mg', 'USV Pvt Ltd', 15, '1x15 Tabs', 'Rack B-4', 'H', '3004', 12, 12],
      ['med-9', 'Gemer 2 Tablet PR', 'Glimepiride 2mg + Metformin 500mg', 'Sun Pharma', 15, '1x15 Tabs', 'Rack B-4', 'H', '3004', 12, 10],
      ['med-10', 'Telma 40 Tablet', 'Telmisartan 40mg', 'Glenmark', 15, '1x15 Tabs', 'Rack B-3', 'H', '3004', 12, 15],
      ['med-11', 'Telmikind 40 Tablet', 'Telmisartan 40mg', 'Mankind Pharma', 10, '1x10 Tabs', 'Rack B-3', 'H', '3004', 12, 12],
      ['med-12', 'Mixtard 30/70 Vial 10ml', 'Human Insulin 30/70 Soluble + Isophane', 'Novo Nordisk', 1, '1 Vial', 'Cold Storage', 'H', '3004', 5, 5],
      ['med-13', 'Zerodol-SP Tablet', 'Aceclofenac 100mg + Paracetamol 325mg + Serratiopeptidase 15mg', 'Ipca Labs', 10, '1x10 Tabs', 'Rack C-3', 'H', '3004', 12, 12]
    ];
    for (const m of meds) insertMed.run(...m);

    const insertInv = db.prepare(`
      INSERT INTO purchase_invoices (id, supplier_id, supplier_name, supplier_gstin, invoice_number, invoice_date, bill_photo_url, subtotal_amount, gst_amount, total_amount, payment_status, due_date, verified_by_owner)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `);
    insertInv.run('inv-1', 'sup-1', 'Mahakal Pharma Agency, Ujjain', '23AABCM4821E1Z4', 'MPA-26-1842', '2026-10-18', bill1Url, 5797.0, 627.12, 6424.12, 'CREDIT', '2026-11-08');
    insertInv.run('inv-2', 'sup-2', 'Malwa Medico Traders, Ujjain', '23AADCM9102F1Z9', 'MMT-26-0744', '2026-10-21', bill2Url, 8186.0, 982.32, 9168.32, 'PAID', '2026-10-21');
    insertInv.run('inv-3', 'sup-3', 'Shipra Drug House, Ujjain', '23AAECS7731H1Z2', 'SDH-26-3980', '2026-10-24', bill3Url, 4284.0, 514.08, 4798.08, 'CREDIT', '2026-11-08');

    const insertBatch = db.prepare(`
      INSERT INTO inventory_batches (id, medicine_id, supplier_id, purchase_invoice_id, batch_number, expiry_date, pack_size_units, strips_count, loose_tablets_count, free_strips_received, ptr_per_strip, mrp_per_strip, gst_percent)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const batches = [
      ['b-1', 'med-1', 'sup-1', 'inv-1', 'AG624', addDaysIso(39), 10, 14, 6, 1, 162.5, 223.0, 12],
      ['b-2', 'med-1', 'sup-1', 'inv-1', 'AG910', addDaysIso(308), 10, 28, 0, 2, 164.0, 223.0, 12],
      ['b-3', 'med-2', 'sup-2', 'inv-2', 'MK402', addDaysIso(231), 10, 35, 4, 3, 138.0, 195.0, 12],
      ['b-4', 'med-3', 'sup-4', 'inv-2', 'CL118', addDaysIso(270), 10, 22, 0, 2, 144.0, 201.0, 12],
      ['b-5', 'med-4', 'sup-2', 'inv-2', 'PD881', addDaysIso(52), 15, 18, 9, 2, 148.0, 210.0, 12],
      ['b-6', 'med-5', 'sup-3', 'inv-3', 'PC319', addDaysIso(205), 10, 24, 3, 2, 132.0, 188.0, 12],
      ['b-7', 'med-6', 'sup-1', 'inv-1', 'DL552', addDaysIso(80), 15, 62, 11, 5, 24.5, 33.8, 12],
      ['b-8', 'med-7', 'sup-4', 'inv-1', 'CP605', addDaysIso(240), 15, 40, 0, 4, 23.0, 32.5, 12],
      ['b-9', 'med-8', 'sup-3', 'inv-3', 'GG108', addDaysIso(26), 15, 9, 5, 0, 124.0, 174.0, 12],
      ['b-10', 'med-9', 'sup-2', 'inv-3', 'GM504', addDaysIso(260), 15, 26, 0, 2, 112.0, 158.0, 12],
      ['b-11', 'med-10', 'sup-2', 'inv-2', 'TL774', addDaysIso(318), 15, 7, 2, 0, 158.0, 222.0, 12],
      ['b-12', 'med-11', 'sup-4', 'inv-2', 'TK309', addDaysIso(290), 10, 30, 0, 3, 68.0, 96.0, 12],
      ['b-13', 'med-12', 'sup-1', 'inv-1', 'MX204', addDaysIso(44), 1, 6, 0, 0, 342.0, 455.0, 5],
      ['b-14', 'med-13', 'sup-1', 'inv-1', 'ZS812', addDaysIso(54), 10, 16, 4, 1, 92.0, 130.0, 12]
    ];
    for (const b of batches) insertBatch.run(...b);

    const insertSale = db.prepare(`
      INSERT INTO sales_entries (id, batch_id, medicine_id, brand_name, batch_number, rack_location, pack_size_units, strips_sold, loose_tablets_sold, total_units_deducted, prev_strips, prev_loose_tablets, new_strips, new_loose_tablets, billed_amount, patient_name, doctor_name, sale_note, sold_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertSale.run('sale-1', 'b-7', 'med-6', 'Dolo 650 Tablet', 'DL552', 'Rack C-1', 15, 0, 4, 4, 63, 0, 62, 11, 9.0, 'Ramesh Patidar', 'Dr. V. Sharma', 'Opened 1 strip (15 tabs) -> sold 4 loose, 11 loose left', '2026-10-27 10:15:00');
    insertSale.run('sale-2', 'b-1', 'med-1', 'Augmentin 625 Duo Tab', 'AG624', 'Rack A-1', 10, 2, 0, 20, 16, 6, 14, 6, 446.0, 'Suresh Joshi', 'Dr. A. Kothari', 'FEFO auto-selected earliest expiring batch AG624 (39d left)', '2026-10-27 11:05:00');

    const insertAudit = db.prepare(`
      INSERT INTO stock_audits (id, batch_id, medicine_id, brand_name, batch_number, rack_location, expected_strips, expected_loose_tablets, counted_strips, counted_loose_tablets, variance_strips, variance_loose_tablets, audit_note, audited_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertAudit.run('aud-1', 'b-7', 'med-6', 'Dolo 650 Tablet', 'DL552', 'Rack C-1', 63, 11, 62, 11, -1, 0, 'Weekly Rack C-1 shelf audit reconciled', '2026-10-26 20:30:00');
  });

  tx();
  backfillV2();
}

module.exports = {
  db,
  seedDatabase,
  generateSampleBillSvg
};

seedDatabase(false);
