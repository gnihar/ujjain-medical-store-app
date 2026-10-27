PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS store_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    store_name TEXT NOT NULL DEFAULT 'Akshay Medicose',
    city TEXT NOT NULL DEFAULT 'Freeganj, Ujjain (M.P.)',
    drug_license_no TEXT NOT NULL DEFAULT '20B/UJN/2021/4418, 21B/UJN/2021/4419',
    gstin TEXT NOT NULL DEFAULT '23AABCS1429B1Z5',
    phone TEXT NOT NULL DEFAULT '+91 98260 12345',
    expiry_alert_days INTEGER NOT NULL DEFAULT 60,
    default_language TEXT NOT NULL DEFAULT 'en',
    owner_pin TEXT NOT NULL DEFAULT '1234',
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS suppliers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    gstin TEXT NOT NULL,
    phone TEXT NOT NULL,
    address TEXT NOT NULL,
    credit_days INTEGER NOT NULL DEFAULT 21,
    expiry_return_window_days INTEGER NOT NULL DEFAULT 60,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS medicines (
    id TEXT PRIMARY KEY,
    brand_name TEXT NOT NULL,
    salt_composition TEXT NOT NULL,
    manufacturer TEXT NOT NULL DEFAULT 'Standard Pharma',
    pack_size_units INTEGER NOT NULL DEFAULT 10,
    pack_label TEXT NOT NULL DEFAULT '1x10 Tabs',
    rack_location TEXT NOT NULL DEFAULT 'Rack A-1',
    schedule_type TEXT NOT NULL DEFAULT 'H',
    hsn_code TEXT NOT NULL DEFAULT '3004',
    gst_percent REAL NOT NULL DEFAULT 12.0,
    min_reorder_strips INTEGER NOT NULL DEFAULT 10,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS purchase_invoices (
    id TEXT PRIMARY KEY,
    supplier_id TEXT NOT NULL REFERENCES suppliers(id),
    supplier_name TEXT NOT NULL,
    supplier_gstin TEXT,
    invoice_number TEXT NOT NULL,
    invoice_date TEXT NOT NULL,
    bill_photo_url TEXT,
    ocr_raw_json TEXT,
    subtotal_amount REAL NOT NULL DEFAULT 0,
    gst_amount REAL NOT NULL DEFAULT 0,
    total_amount REAL NOT NULL DEFAULT 0,
    payment_status TEXT NOT NULL DEFAULT 'CREDIT',
    due_date TEXT,
    verified_by_owner INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS inventory_batches (
    id TEXT PRIMARY KEY,
    medicine_id TEXT NOT NULL REFERENCES medicines(id) ON DELETE CASCADE,
    supplier_id TEXT REFERENCES suppliers(id),
    purchase_invoice_id TEXT REFERENCES purchase_invoices(id),
    batch_number TEXT NOT NULL,
    expiry_date TEXT NOT NULL,
    pack_size_units INTEGER NOT NULL DEFAULT 10,
    strips_count INTEGER NOT NULL DEFAULT 0,
    loose_tablets_count INTEGER NOT NULL DEFAULT 0,
    free_strips_received INTEGER NOT NULL DEFAULT 0,
    ptr_per_strip REAL NOT NULL DEFAULT 0,
    mrp_per_strip REAL NOT NULL DEFAULT 0,
    gst_percent REAL NOT NULL DEFAULT 12.0,
    is_return_claimed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sales_entries (
    id TEXT PRIMARY KEY,
    batch_id TEXT NOT NULL REFERENCES inventory_batches(id),
    medicine_id TEXT NOT NULL REFERENCES medicines(id),
    brand_name TEXT NOT NULL,
    batch_number TEXT NOT NULL,
    rack_location TEXT NOT NULL,
    pack_size_units INTEGER NOT NULL DEFAULT 10,
    strips_sold INTEGER NOT NULL DEFAULT 0,
    loose_tablets_sold INTEGER NOT NULL DEFAULT 0,
    total_units_deducted INTEGER NOT NULL DEFAULT 0,
    prev_strips INTEGER NOT NULL DEFAULT 0,
    prev_loose_tablets INTEGER NOT NULL DEFAULT 0,
    new_strips INTEGER NOT NULL DEFAULT 0,
    new_loose_tablets INTEGER NOT NULL DEFAULT 0,
    billed_amount REAL NOT NULL DEFAULT 0,
    patient_name TEXT,
    customer_phone TEXT,
    doctor_name TEXT,
    sale_note TEXT,
    is_cancelled INTEGER NOT NULL DEFAULT 0,
    sold_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS stock_audits (
    id TEXT PRIMARY KEY,
    batch_id TEXT NOT NULL REFERENCES inventory_batches(id),
    medicine_id TEXT NOT NULL REFERENCES medicines(id),
    brand_name TEXT NOT NULL,
    batch_number TEXT NOT NULL,
    rack_location TEXT NOT NULL,
    expected_strips INTEGER NOT NULL,
    expected_loose_tablets INTEGER NOT NULL,
    counted_strips INTEGER NOT NULL,
    counted_loose_tablets INTEGER NOT NULL,
    variance_strips INTEGER NOT NULL,
    variance_loose_tablets INTEGER NOT NULL,
    audit_note TEXT,
    audited_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS purchase_line_items (
    id TEXT PRIMARY KEY,
    invoice_id TEXT NOT NULL,
    batch_id TEXT,
    medicine_id TEXT,
    brand_name TEXT NOT NULL,
    salt_composition TEXT,
    pack_label TEXT,
    rack_location TEXT,
    batch_number TEXT,
    expiry_date TEXT,
    strips_qty INTEGER NOT NULL DEFAULT 0,
    free_strips_qty INTEGER NOT NULL DEFAULT 0,
    scheme_label TEXT,
    ptr_per_strip REAL NOT NULL DEFAULT 0,
    mrp_per_strip REAL NOT NULL DEFAULT 0,
    gst_percent REAL NOT NULL DEFAULT 12
);

CREATE INDEX IF NOT EXISTS idx_lines_invoice ON purchase_line_items (invoice_id);
CREATE INDEX IF NOT EXISTS idx_lines_brand ON purchase_line_items (brand_name);

CREATE TABLE IF NOT EXISTS shortbook_items (
    id TEXT PRIMARY KEY,
    medicine_id TEXT,
    brand_name TEXT NOT NULL,
    pack_label TEXT,
    supplier_id TEXT,
    supplier_name TEXT,
    supplier_phone TEXT,
    requested_strips INTEGER NOT NULL DEFAULT 1,
    last_ptr REAL,
    last_scheme TEXT,
    note TEXT,
    source TEXT NOT NULL DEFAULT 'MANUAL',
    status TEXT NOT NULL DEFAULT 'OPEN',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS customer_accounts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT NOT NULL UNIQUE,
    outstanding_balance REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS credit_transactions (
    id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL,
    sale_id TEXT,
    txn_type TEXT NOT NULL,
    amount REAL NOT NULL,
    payment_mode TEXT,
    reference_note TEXT,
    item_summary TEXT,
    balance_after REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_credit_customer ON credit_transactions (customer_id, created_at);

CREATE TABLE IF NOT EXISTS refill_schedules (
    id TEXT PRIMARY KEY,
    customer_id TEXT,
    patient_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    medicine_id TEXT,
    brand_name TEXT NOT NULL,
    salt_composition TEXT,
    strips_qty INTEGER NOT NULL DEFAULT 1,
    loose_qty INTEGER NOT NULL DEFAULT 0,
    interval_days INTEGER NOT NULL DEFAULT 30,
    last_purchase_date TEXT,
    next_due_date TEXT NOT NULL,
    notified_at TEXT,
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_refill_due ON refill_schedules (next_due_date);
