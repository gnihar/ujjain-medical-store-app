-- ============================================================================
-- Ujjain Medical Store Management App — Production PostgreSQL Schema (Supabase)
-- Supports: Paper Bill Photo OCR Archive, Batch-wise Strip + Loose Inventory,
-- Configurable 60-Day Expiry Return Alerts, FEFO Daily Sales, and Stock Audits
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- 1. Store Configuration & Configurable Expiry Alert Window (Default: 60 Days)
CREATE TABLE store_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_name TEXT NOT NULL DEFAULT 'Akshay Medicose',
    owner_pin TEXT NOT NULL DEFAULT '1234',
    city TEXT NOT NULL DEFAULT 'Ujjain, MP',
    drug_license_no TEXT,
    gstin TEXT,
    expiry_alert_days INTEGER NOT NULL DEFAULT 60 CHECK (expiry_alert_days > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO store_settings (store_name, city, expiry_alert_days)
VALUES ('Akshay Medicose', 'Ujjain, MP', 60);

-- 2. Wholesale Suppliers / Stockists (Ujjain / Indore Distributors)
CREATE TABLE suppliers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    short_code TEXT,
    gstin TEXT,
    phone TEXT,
    address TEXT,
    credit_days INTEGER NOT NULL DEFAULT 21,
    cash_discount_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
    expiry_return_window_days INTEGER NOT NULL DEFAULT 60,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Master Medicine Catalog (Brand, Salt Composition, Pack Size, Rack)
CREATE TABLE medicines (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    brand_name TEXT NOT NULL,
    salt_composition TEXT NOT NULL,
    manufacturer TEXT,
    pack_size_units INTEGER NOT NULL DEFAULT 10 CHECK (pack_size_units > 0), -- e.g. 10 or 15 tablets per strip
    pack_label TEXT NOT NULL DEFAULT '1x10 Tabs',
    rack_location TEXT NOT NULL DEFAULT 'Rack A-1',
    schedule_type TEXT NOT NULL DEFAULT 'H' CHECK (schedule_type IN ('OTC', 'H', 'H1', 'X')),
    hsn_code TEXT DEFAULT '3004',
    gst_percent NUMERIC(5,2) NOT NULL DEFAULT 12.00,
    min_reorder_strips INTEGER NOT NULL DEFAULT 10,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_medicines_brand_trgm ON medicines USING GIN (brand_name gin_trgm_ops);
CREATE INDEX idx_medicines_salt_trgm ON medicines USING GIN (salt_composition gin_trgm_ops);

-- 4. Purchase Invoices (Captured from Paper Bills via Android Camera + Vision OCR)
CREATE TABLE purchase_invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    supplier_id UUID REFERENCES suppliers(id) ON DELETE RESTRICT,
    invoice_number TEXT NOT NULL,
    invoice_date DATE NOT NULL,
    bill_photo_url TEXT, -- Supabase Storage / Cloudflare R2 path to original paper bill photo
    ocr_raw_json JSONB,  -- Full structured output from Gemini 2.5 Flash / GPT-4o Vision
    subtotal_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    gst_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    payment_status TEXT NOT NULL DEFAULT 'CREDIT' CHECK (payment_status IN ('PAID', 'CREDIT', 'PARTIAL')),
    due_date DATE,
    verified_by_owner BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (supplier_id, invoice_number)
);

-- 5. Batch-Wise Inventory Ledger (Tracks BOTH Full Strips AND Loose Open Tablets)
CREATE TABLE inventory_batches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    medicine_id UUID NOT NULL REFERENCES medicines(id) ON DELETE CASCADE,
    supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
    purchase_invoice_id UUID REFERENCES purchase_invoices(id) ON DELETE SET NULL,
    batch_number TEXT NOT NULL,
    expiry_date DATE NOT NULL,
    pack_size_units INTEGER NOT NULL DEFAULT 10 CHECK (pack_size_units > 0),
    strips_count INTEGER NOT NULL DEFAULT 0 CHECK (strips_count >= 0),
    loose_tablets_count INTEGER NOT NULL DEFAULT 0 CHECK (loose_tablets_count >= 0),
    free_strips_received INTEGER NOT NULL DEFAULT 0,
    scheme_buy_qty INTEGER NOT NULL DEFAULT 0,
    scheme_free_qty INTEGER NOT NULL DEFAULT 0,
    ptr_per_strip NUMERIC(10,2) NOT NULL, -- Buy Price (PTR): wholesale rate paid to the stockist per strip
    mrp_per_strip NUMERIC(10,2) NOT NULL, -- Maximum Retail Price per strip
    gst_percent NUMERIC(5,2) NOT NULL DEFAULT 12.00,
    is_return_claimed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_batches_expiry ON inventory_batches (expiry_date ASC);
CREATE INDEX idx_batches_medicine ON inventory_batches (medicine_id, expiry_date ASC);

-- 6. Daily Counter Sales Deductions (FEFO - First Expiry First Out)
CREATE TABLE sales_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    batch_id UUID NOT NULL REFERENCES inventory_batches(id) ON DELETE RESTRICT,
    medicine_id UUID NOT NULL REFERENCES medicines(id) ON DELETE RESTRICT,
    sale_mode TEXT NOT NULL CHECK (sale_mode IN ('STRIPS', 'LOOSE_TABLETS')),
    quantity_sold INTEGER NOT NULL CHECK (quantity_sold > 0),
    billed_amount NUMERIC(10,2) NOT NULL,
    patient_name TEXT, -- Optional, required for Schedule H1 compliance
    customer_phone TEXT,
    doctor_name TEXT,
    sold_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Physical Stock Audits & Shelf Reconciliation
CREATE TABLE stock_audits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    batch_id UUID NOT NULL REFERENCES inventory_batches(id) ON DELETE CASCADE,
    rack_location TEXT NOT NULL,
    expected_strips INTEGER NOT NULL,
    expected_loose_tablets INTEGER NOT NULL,
    counted_strips INTEGER NOT NULL,
    counted_loose_tablets INTEGER NOT NULL,
    variance_strips INTEGER GENERATED ALWAYS AS (counted_strips - expected_strips) STORED,
    variance_loose_tablets INTEGER GENERATED ALWAYS AS (counted_loose_tablets - expected_loose_tablets) STORED,
    audit_note TEXT,
    audited_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. Helper View: Dynamic Expiry Return Alert View (Uses store_settings.expiry_alert_days)
CREATE OR REPLACE VIEW v_expiring_batches_alert AS
SELECT
    b.id AS batch_id,
    m.brand_name,
    m.salt_composition,
    m.rack_location,
    b.batch_number,
    b.expiry_date,
    (b.expiry_date - CURRENT_DATE) AS days_to_expiry,
    b.strips_count,
    b.loose_tablets_count,
    b.ptr_per_strip,
    ROUND(((b.strips_count + (b.loose_tablets_count::NUMERIC / b.pack_size_units)) * b.ptr_per_strip), 2) AS return_credit_value_ptr,
    s.name AS supplier_name,
    s.phone AS supplier_phone,
    pi.invoice_number
FROM inventory_batches b
JOIN medicines m ON m.id = b.medicine_id
LEFT JOIN suppliers s ON s.id = b.supplier_id
LEFT JOIN purchase_invoices pi ON pi.id = b.purchase_invoice_id
CROSS JOIN store_settings st
WHERE (b.strips_count > 0 OR b.loose_tablets_count > 0)
  AND b.is_return_claimed = FALSE
  AND (b.expiry_date - CURRENT_DATE) <= st.expiry_alert_days
ORDER BY b.expiry_date ASC;

-- 9. Purchase invoice line items (deep search by brand, PTR, and scheme)
CREATE TABLE purchase_line_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_id UUID NOT NULL REFERENCES purchase_invoices(id) ON DELETE CASCADE,
    batch_id UUID,
    medicine_id UUID REFERENCES medicines(id) ON DELETE SET NULL,
    brand_name TEXT NOT NULL,
    salt_composition TEXT,
    pack_label TEXT,
    rack_location TEXT,
    batch_number TEXT,
    expiry_date DATE,
    strips_qty INTEGER NOT NULL DEFAULT 0,
    free_strips_qty INTEGER NOT NULL DEFAULT 0,
    scheme_label TEXT,
    scheme_buy_qty INTEGER NOT NULL DEFAULT 0,
    scheme_free_qty INTEGER NOT NULL DEFAULT 0,
    ptr_per_strip NUMERIC(10,2) NOT NULL DEFAULT 0,
    mrp_per_strip NUMERIC(10,2) NOT NULL DEFAULT 0,
    gst_percent NUMERIC(5,2) NOT NULL DEFAULT 12
);

CREATE INDEX idx_lines_brand ON purchase_line_items (brand_name);

-- 10. Shortbook: auto low-stock and manual out-of-stock orders
CREATE TABLE shortbook_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    medicine_id UUID REFERENCES medicines(id) ON DELETE SET NULL,
    brand_name TEXT NOT NULL,
    pack_label TEXT,
    supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
    supplier_name TEXT,
    supplier_phone TEXT,
    requested_strips INTEGER NOT NULL DEFAULT 1,
    last_ptr NUMERIC(10,2),
    last_scheme TEXT,
    note TEXT,
    source TEXT NOT NULL DEFAULT 'MANUAL' CHECK (source IN ('AUTO', 'MANUAL')),
    status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'ORDERED', 'CLEARED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 11. Customer credit accounts
CREATE TABLE customer_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    phone TEXT NOT NULL UNIQUE,
    outstanding_balance NUMERIC(12,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 12. Credit ledger (sales posted and payments received)
CREATE TABLE credit_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID NOT NULL REFERENCES customer_accounts(id) ON DELETE CASCADE,
    sale_id UUID,
    txn_type TEXT NOT NULL CHECK (txn_type IN ('SALE', 'PAYMENT', 'REVERSAL')),
    amount NUMERIC(12,2) NOT NULL,
    payment_mode TEXT,
    reference_note TEXT,
    item_summary TEXT,
    balance_after NUMERIC(12,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 13. Monthly chronic refill schedules
CREATE TABLE refill_schedules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID REFERENCES customer_accounts(id) ON DELETE SET NULL,
    patient_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    medicine_id UUID REFERENCES medicines(id) ON DELETE SET NULL,
    brand_name TEXT NOT NULL,
    salt_composition TEXT,
    strips_qty INTEGER NOT NULL DEFAULT 1,
    loose_qty INTEGER NOT NULL DEFAULT 0,
    interval_days INTEGER NOT NULL DEFAULT 30,
    last_purchase_date DATE,
    next_due_date DATE NOT NULL,
    notified_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'NOTIFIED', 'PAUSED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 14. Stockist scheme and offer matrix (brand and salt comparison across S1–S4)
CREATE TABLE supplier_offers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
    medicine_id UUID REFERENCES medicines(id) ON DELETE SET NULL,
    brand_name TEXT NOT NULL,
    salt_composition TEXT NOT NULL DEFAULT '',
    buy_price_ptr NUMERIC(10,2) NOT NULL DEFAULT 0,
    mrp NUMERIC(10,2) NOT NULL DEFAULT 0,
    scheme_label TEXT,
    buy_qty INTEGER NOT NULL DEFAULT 1,
    free_qty INTEGER NOT NULL DEFAULT 0,
    cash_discount_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
    net_buy_price NUMERIC(10,2) NOT NULL DEFAULT 0,
    retail_margin_pct NUMERIC(6,2) NOT NULL DEFAULT 0,
    valid_until DATE,
    source TEXT NOT NULL DEFAULT 'Manual Monthly Circular',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_offers_salt_trgm ON supplier_offers USING GIN (salt_composition gin_trgm_ops);
CREATE INDEX idx_offers_brand_trgm ON supplier_offers USING GIN (brand_name gin_trgm_ops);
