/**
 * Dual-Mode Hybrid Store Engine:
 * - Connects automatically to the Express + SQLite3 API (/api/*) when reachable.
 * - Runs the identical relational database logic locally (localStorage) when inside the standalone Android APK or offline PWA.
 */
(function () {
  const STORAGE_KEY = 'ujjain_medstore_hybrid_state_v3';

  function makeSvgDataUrl(supplier, gstin, invNo, invDate, itemsText) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="760" height="280" viewBox="0 0 760 280">
      <rect width="760" height="280" fill="#fffdf7" stroke="#94a3b8" stroke-width="2" rx="8"/>
      <rect x="10" y="10" width="740" height="62" fill="#f1f5f9" rx="4"/>
      <text x="20" y="34" font-family="monospace" font-weight="bold" font-size="16" fill="#0f172a">WHOLESALE TAX INVOICE — ${supplier}</text>
      <text x="20" y="54" font-family="monospace" font-size="12" fill="#334155">GSTIN: ${gstin} | Buyer: Akshay Medicose, Ujjain</text>
      <text x="520" y="34" font-family="monospace" font-weight="bold" font-size="13" fill="#b91c1c">INV: ${invNo}</text>
      <text x="520" y="54" font-family="monospace" font-size="12" fill="#334155">DATE: ${invDate}</text>
      <line x1="14" y1="84" x2="746" y2="84" stroke="#cbd5e1" stroke-width="1"/>
      <text x="20" y="106" font-family="monospace" font-weight="bold" font-size="12" fill="#475569">Product Description | Pack | Batch | Expiry | Qty+Free | PTR | MRP</text>
      <text x="20" y="138" font-family="monospace" font-size="12" fill="#0f172a">${itemsText[0] || ''}</text>
      <text x="20" y="166" font-family="monospace" font-size="12" fill="#0f172a">${itemsText[1] || ''}</text>
      <text x="20" y="194" font-family="monospace" font-size="12" fill="#0f172a">${itemsText[2] || ''}</text>
      <line x1="14" y1="224" x2="746" y2="224" stroke="#cbd5e1" stroke-width="1"/>
      <text x="20" y="252" font-family="monospace" font-size="11.5" fill="#0f766e">60-Day Expiry Return Policy Applicable | Ujjain Wholesale Chemist Association</text>
    </svg>`;
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
  }

  function addDays(offset) {
    const d = new Date('2026-10-27T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + offset);
    return d.toISOString().slice(0, 10);
  }

  function daysBetween(expiryStr) {
    const ref = new Date('2026-10-27T00:00:00Z').getTime();
    const exp = new Date(expiryStr + 'T00:00:00Z').getTime();
    if (Number.isNaN(exp)) return 90;
    return Math.ceil((exp - ref) / 86400000);
  }

  function getInitialLocalRaw() {
    const bill1Img = makeSvgDataUrl('MAHAKAL PHARMA AGENCY, UJJAIN', '23AABCM4821E1Z4', 'MPA-26-1842', '2026-10-18', [
      '1. Augmentin 625 Duo Tab | 1x10 | Batch: AG624 | Exp: ' + addDays(39) + ' | Qty: 14+1 | PTR: 162.5 | MRP: 223',
      '2. Dolo 650 Tablet       | 1x15 | Batch: DL552 | Exp: ' + addDays(80) + ' | Qty: 60+5 | PTR: 24.5  | MRP: 33.8',
      '3. Mixtard 30/70 Vial    | 1Vl  | Batch: MX204 | Exp: ' + addDays(44) + ' | Qty: 6+0  | PTR: 342.0 | MRP: 455'
    ]);
    const bill2Img = makeSvgDataUrl('MALWA MEDICO TRADERS, UJJAIN', '23AADCM9102F1Z9', 'MMT-26-0744', '2026-10-21', [
      '1. Moxikind-CV 625 Tab   | 1x10 | Batch: MK402 | Exp: ' + addDays(231) + ' | Qty: 32+3 | PTR: 138.0 | MRP: 195',
      '2. Pan-D Capsule PR      | 1x15 | Batch: PD881 | Exp: ' + addDays(52) + '  | Qty: 18+2 | PTR: 148.0 | MRP: 210',
      '3. Telma 40 Tablet       | 1x15 | Batch: TL774 | Exp: ' + addDays(318) + ' | Qty: 7+0  | PTR: 158.0 | MRP: 222'
    ]);
    const bill3Img = makeSvgDataUrl('SHIPRA DRUG HOUSE, UJJAIN', '23AAECS7731H1Z2', 'SDH-26-3980', '2026-10-24', [
      '1. Pantocid DSR Cap      | 1x10 | Batch: PC319 | Exp: ' + addDays(205) + ' | Qty: 24+2 | PTR: 132.0 | MRP: 188',
      '2. Glycomet-GP 2 Tablet  | 1x15 | Batch: GG108 | Exp: ' + addDays(26) + '  | Qty: 9+0  | PTR: 124.0 | MRP: 174',
      ''
    ]);

    return {
      settings: {
        id: 1,
        store_name: 'Akshay Medicose',
        city: 'Freeganj, Ujjain (M.P.)',
        drug_license_no: '20B/UJN/2021/4418, 21B/UJN/2021/4419',
        gstin: '23AABCS1429B1Z5',
        phone: '+91 98260 12345',
        expiry_alert_days: 60,
        default_language: 'en',
        owner_pin: '1234',
        admin_pattern: '0-3-6-7-8',
        biometric_credential_id: 'bio-demo-akshay-1',
        biometric_enabled: 1,
        tutorial_completed: 0,
        admin_lock_minutes: 15
      },
      suppliers: [
        { id: 'sup-1', name: 'Mahakal Pharma Agency, Ujjain', gstin: '23AABCM4821E1Z4', phone: '+91 94250 91101', address: '14, Freeganj Main Road, Ujjain', credit_days: 21, expiry_return_window_days: 60 },
        { id: 'sup-2', name: 'Malwa Medico Traders, Ujjain', gstin: '23AADCM9102F1Z9', phone: '+91 98270 33219', address: 'Shop 8, Dewas Gate Wholesale Market, Ujjain', credit_days: 30, expiry_return_window_days: 60 },
        { id: 'sup-3', name: 'Shipra Drug House, Ujjain', gstin: '23AAECS7731H1Z2', phone: '+91 99260 77812', address: 'Nazar Ali Marg, Near Kotwali, Ujjain', credit_days: 15, expiry_return_window_days: 60 },
        { id: 'sup-4', name: 'Avantika Pharma Distributors, Ujjain', gstin: '23AABCA5519K1Z1', phone: '+91 97550 61230', address: 'Tower Chowk, Freeganj, Ujjain', credit_days: 21, expiry_return_window_days: 90 }
      ],
      medicines: [
        { id: 'med-1', brand_name: 'Augmentin 625 Duo Tab', salt_composition: 'Amoxicillin 500mg + Clavulanic Acid 125mg', manufacturer: 'GSK Pharma', pack_size_units: 10, pack_label: '1x10 Tabs', rack_location: 'Rack A-1', schedule_type: 'H1', gst_percent: 12, min_reorder_strips: 10 },
        { id: 'med-2', brand_name: 'Moxikind-CV 625 Tab', salt_composition: 'Amoxicillin 500mg + Clavulanic Acid 125mg', manufacturer: 'Mankind Pharma', pack_size_units: 10, pack_label: '1x10 Tabs', rack_location: 'Rack A-2', schedule_type: 'H1', gst_percent: 12, min_reorder_strips: 12 },
        { id: 'med-3', brand_name: 'Clavam 625 Tablet', salt_composition: 'Amoxicillin 500mg + Clavulanic Acid 125mg', manufacturer: 'Alkem Labs', pack_size_units: 10, pack_label: '1x10 Tabs', rack_location: 'Rack A-1', schedule_type: 'H1', gst_percent: 12, min_reorder_strips: 10 },
        { id: 'med-4', brand_name: 'Pan-D Capsule PR', salt_composition: 'Pantoprazole 40mg + Domperidone 30mg', manufacturer: 'Alkem Labs', pack_size_units: 15, pack_label: '1x15 Caps', rack_location: 'Rack B-1', schedule_type: 'H', gst_percent: 12, min_reorder_strips: 15 },
        { id: 'med-5', brand_name: 'Pantocid DSR Cap', salt_composition: 'Pantoprazole 40mg + Domperidone 30mg', manufacturer: 'Sun Pharma', pack_size_units: 10, pack_label: '1x10 Caps', rack_location: 'Rack B-2', schedule_type: 'H', gst_percent: 12, min_reorder_strips: 10 },
        { id: 'med-6', brand_name: 'Dolo 650 Tablet', salt_composition: 'Paracetamol 650mg', manufacturer: 'Micro Labs', pack_size_units: 15, pack_label: '1x15 Tabs', rack_location: 'Rack C-1', schedule_type: 'OTC', gst_percent: 12, min_reorder_strips: 30 },
        { id: 'med-7', brand_name: 'Calpol 650 Tablet', salt_composition: 'Paracetamol 650mg', manufacturer: 'GSK Pharma', pack_size_units: 15, pack_label: '1x15 Tabs', rack_location: 'Rack C-2', schedule_type: 'OTC', gst_percent: 12, min_reorder_strips: 20 },
        { id: 'med-8', brand_name: 'Glycomet-GP 2 Tablet', salt_composition: 'Glimepiride 2mg + Metformin 500mg', manufacturer: 'USV Pvt Ltd', pack_size_units: 15, pack_label: '1x15 Tabs', rack_location: 'Rack B-4', schedule_type: 'H', gst_percent: 12, min_reorder_strips: 12 },
        { id: 'med-9', brand_name: 'Gemer 2 Tablet PR', salt_composition: 'Glimepiride 2mg + Metformin 500mg', manufacturer: 'Sun Pharma', pack_size_units: 15, pack_label: '1x15 Tabs', rack_location: 'Rack B-4', schedule_type: 'H', gst_percent: 12, min_reorder_strips: 10 },
        { id: 'med-10', brand_name: 'Telma 40 Tablet', salt_composition: 'Telmisartan 40mg', manufacturer: 'Glenmark', pack_size_units: 15, pack_label: '1x15 Tabs', rack_location: 'Rack B-3', schedule_type: 'H', gst_percent: 12, min_reorder_strips: 15 },
        { id: 'med-11', brand_name: 'Telmikind 40 Tablet', salt_composition: 'Telmisartan 40mg', manufacturer: 'Mankind Pharma', pack_size_units: 10, pack_label: '1x10 Tabs', rack_location: 'Rack B-3', schedule_type: 'H', gst_percent: 12, min_reorder_strips: 12 },
        { id: 'med-12', brand_name: 'Mixtard 30/70 Vial 10ml', salt_composition: 'Human Insulin 30/70 Soluble + Isophane', manufacturer: 'Novo Nordisk', pack_size_units: 1, pack_label: '1 Vial', rack_location: 'Cold Storage', schedule_type: 'H', gst_percent: 5, min_reorder_strips: 5 },
        { id: 'med-13', brand_name: 'Zerodol-SP Tablet', salt_composition: 'Aceclofenac 100mg + Paracetamol 325mg + Serratiopeptidase 15mg', manufacturer: 'Ipca Labs', pack_size_units: 10, pack_label: '1x10 Tabs', rack_location: 'Rack C-3', schedule_type: 'H', gst_percent: 12, min_reorder_strips: 12 },
        { id: 'med-14', brand_name: 'Ecosprin-AV 75 Tablet', salt_composition: 'Aspirin 75mg + Atorvastatin 10mg', manufacturer: 'USV Ltd', pack_size_units: 10, pack_label: '1x10 Tabs', rack_location: 'Rack B-4', schedule_type: 'H', gst_percent: 12, min_reorder_strips: 5 }
      ],
      invoices: [
        { id: 'inv-1', supplier_id: 'sup-1', supplier_name: 'Mahakal Pharma Agency, Ujjain', supplier_gstin: '23AABCM4821E1Z4', invoice_number: 'MPA-26-1842', invoice_date: '2026-10-18', bill_photo_url: bill1Img, subtotal_amount: 5797, gst_amount: 627.12, total_amount: 6424.12, payment_status: 'CREDIT' },
        { id: 'inv-2', supplier_id: 'sup-2', supplier_name: 'Malwa Medico Traders, Ujjain', supplier_gstin: '23AADCM9102F1Z9', invoice_number: 'MMT-26-0744', invoice_date: '2026-10-21', bill_photo_url: bill2Img, subtotal_amount: 8186, gst_amount: 982.32, total_amount: 9168.32, payment_status: 'PAID' },
        { id: 'inv-3', supplier_id: 'sup-3', supplier_name: 'Shipra Drug House, Ujjain', supplier_gstin: '23AAECS7731H1Z2', invoice_number: 'SDH-26-3980', invoice_date: '2026-10-24', bill_photo_url: bill3Img, subtotal_amount: 4284, gst_amount: 514.08, total_amount: 4798.08, payment_status: 'CREDIT' }
      ],
      rawBatches: [
        { id: 'b-1', medicine_id: 'med-1', supplier_id: 'sup-1', purchase_invoice_id: 'inv-1', batch_number: 'AG624', expiry_date: addDays(39), pack_size_units: 10, strips_count: 14, loose_tablets_count: 6, free_strips_received: 1, ptr_per_strip: 162.5, mrp_per_strip: 223.0, gst_percent: 12, is_return_claimed: 0 },
        { id: 'b-2', medicine_id: 'med-1', supplier_id: 'sup-1', purchase_invoice_id: 'inv-1', batch_number: 'AG910', expiry_date: addDays(308), pack_size_units: 10, strips_count: 28, loose_tablets_count: 0, free_strips_received: 2, ptr_per_strip: 164.0, mrp_per_strip: 223.0, gst_percent: 12, is_return_claimed: 0 },
        { id: 'b-3', medicine_id: 'med-2', supplier_id: 'sup-2', purchase_invoice_id: 'inv-2', batch_number: 'MK402', expiry_date: addDays(231), pack_size_units: 10, strips_count: 35, loose_tablets_count: 4, free_strips_received: 3, ptr_per_strip: 138.0, mrp_per_strip: 195.0, gst_percent: 12, is_return_claimed: 0 },
        { id: 'b-4', medicine_id: 'med-3', supplier_id: 'sup-4', purchase_invoice_id: 'inv-2', batch_number: 'CL118', expiry_date: addDays(270), pack_size_units: 10, strips_count: 22, loose_tablets_count: 0, free_strips_received: 2, ptr_per_strip: 144.0, mrp_per_strip: 201.0, gst_percent: 12, is_return_claimed: 0 },
        { id: 'b-5', medicine_id: 'med-4', supplier_id: 'sup-2', purchase_invoice_id: 'inv-2', batch_number: 'PD881', expiry_date: addDays(52), pack_size_units: 15, strips_count: 18, loose_tablets_count: 9, free_strips_received: 2, ptr_per_strip: 148.0, mrp_per_strip: 210.0, gst_percent: 12, is_return_claimed: 0 },
        { id: 'b-6', medicine_id: 'med-5', supplier_id: 'sup-3', purchase_invoice_id: 'inv-3', batch_number: 'PC319', expiry_date: addDays(205), pack_size_units: 10, strips_count: 24, loose_tablets_count: 3, free_strips_received: 2, ptr_per_strip: 132.0, mrp_per_strip: 188.0, gst_percent: 12, is_return_claimed: 0 },
        { id: 'b-7', medicine_id: 'med-6', supplier_id: 'sup-1', purchase_invoice_id: 'inv-1', batch_number: 'DL552', expiry_date: addDays(80), pack_size_units: 15, strips_count: 62, loose_tablets_count: 11, free_strips_received: 5, ptr_per_strip: 24.5, mrp_per_strip: 33.8, gst_percent: 12, is_return_claimed: 0 },
        { id: 'b-8', medicine_id: 'med-7', supplier_id: 'sup-4', purchase_invoice_id: 'inv-1', batch_number: 'CP605', expiry_date: addDays(240), pack_size_units: 15, strips_count: 40, loose_tablets_count: 0, free_strips_received: 4, ptr_per_strip: 23.0, mrp_per_strip: 32.5, gst_percent: 12, is_return_claimed: 0 },
        { id: 'b-9', medicine_id: 'med-8', supplier_id: 'sup-3', purchase_invoice_id: 'inv-3', batch_number: 'GG108', expiry_date: addDays(26), pack_size_units: 15, strips_count: 9, loose_tablets_count: 5, free_strips_received: 0, ptr_per_strip: 124.0, mrp_per_strip: 174.0, gst_percent: 12, is_return_claimed: 0 },
        { id: 'b-10', medicine_id: 'med-9', supplier_id: 'sup-2', purchase_invoice_id: 'inv-3', batch_number: 'GM504', expiry_date: addDays(260), pack_size_units: 15, strips_count: 26, loose_tablets_count: 0, free_strips_received: 2, ptr_per_strip: 112.0, mrp_per_strip: 158.0, gst_percent: 12, is_return_claimed: 0 },
        { id: 'b-11', medicine_id: 'med-10', supplier_id: 'sup-2', purchase_invoice_id: 'inv-2', batch_number: 'TL774', expiry_date: addDays(318), pack_size_units: 15, strips_count: 7, loose_tablets_count: 2, free_strips_received: 0, ptr_per_strip: 158.0, mrp_per_strip: 222.0, gst_percent: 12, is_return_claimed: 0 },
        { id: 'b-12', medicine_id: 'med-11', supplier_id: 'sup-4', purchase_invoice_id: 'inv-2', batch_number: 'TK309', expiry_date: addDays(290), pack_size_units: 10, strips_count: 30, loose_tablets_count: 0, free_strips_received: 3, ptr_per_strip: 68.0, mrp_per_strip: 96.0, gst_percent: 12, is_return_claimed: 0 },
        { id: 'b-13', medicine_id: 'med-12', supplier_id: 'sup-1', purchase_invoice_id: 'inv-1', batch_number: 'MX204', expiry_date: addDays(44), pack_size_units: 1, strips_count: 6, loose_tablets_count: 0, free_strips_received: 0, ptr_per_strip: 342.0, mrp_per_strip: 455.0, gst_percent: 5, is_return_claimed: 0 },
        { id: 'b-14', medicine_id: 'med-13', supplier_id: 'sup-1', purchase_invoice_id: 'inv-1', batch_number: 'ZS812', expiry_date: addDays(54), pack_size_units: 10, strips_count: 16, loose_tablets_count: 4, free_strips_received: 1, ptr_per_strip: 92.0, mrp_per_strip: 130.0, gst_percent: 12, is_return_claimed: 0 },
        { id: 'b-15', medicine_id: 'med-14', supplier_id: 'sup-2', purchase_invoice_id: 'inv-2', batch_number: 'EC220', expiry_date: addDays(200), pack_size_units: 10, strips_count: 20, loose_tablets_count: 0, free_strips_received: 2, ptr_per_strip: 86.0, mrp_per_strip: 118.0, gst_percent: 12, is_return_claimed: 0 }
      ],
      sales: [
        { id: 'sale-1', batch_id: 'b-7', medicine_id: 'med-6', brand_name: 'Dolo 650 Tablet', batch_number: 'DL552', rack_location: 'Rack C-1', pack_size_units: 15, strips_sold: 0, loose_tablets_sold: 4, total_units_deducted: 4, prev_strips: 63, prev_loose_tablets: 0, new_strips: 62, new_loose_tablets: 11, billed_amount: 9.0, patient_name: 'Ramesh Patidar', doctor_name: 'Dr. V. Sharma', sale_note: 'Opened 1 strip (15 tabs) -> sold 4 loose, 11 loose left', is_cancelled: 0, sold_at: '2026-10-27 10:15:00' },
        { id: 'sale-2', batch_id: 'b-1', medicine_id: 'med-1', brand_name: 'Augmentin 625 Duo Tab', batch_number: 'AG624', rack_location: 'Rack A-1', pack_size_units: 10, strips_sold: 2, loose_tablets_sold: 0, total_units_deducted: 20, prev_strips: 16, prev_loose_tablets: 6, new_strips: 14, new_loose_tablets: 6, billed_amount: 446.0, patient_name: 'Suresh Joshi', doctor_name: 'Dr. A. Kothari', sale_note: 'FEFO auto-selected earliest expiring batch AG624 (39d left)', is_cancelled: 0, sold_at: '2026-10-27 11:05:00' }
      ],
      audits: [
        { id: 'aud-1', batch_id: 'b-7', medicine_id: 'med-6', brand_name: 'Dolo 650 Tablet', batch_number: 'DL552', rack_location: 'Rack C-1', expected_strips: 63, expected_loose_tablets: 11, counted_strips: 62, counted_loose_tablets: 11, variance_strips: -1, variance_loose_tablets: 0, audit_note: 'Weekly Rack C-1 shelf audit reconciled', audited_at: '2026-10-26 20:30:00' }
      ],
      customers: [
        { id: 'cus-1', name: 'Rajesh Sharma', phone: '9826011111', outstanding_balance: 444 },
        { id: 'cus-2', name: 'Meena Joshi', phone: '9826022222', outstanding_balance: 0 },
        { id: 'cus-3', name: 'Suresh Verma', phone: '9826033333', outstanding_balance: 0 }
      ],
      creditTransactions: [
        { id: 'ctx-1', customer_id: 'cus-1', sale_id: null, txn_type: 'SALE', amount: 444, payment_mode: 'CREDIT', reference_note: 'Opening credit bill', item_summary: 'Telma 40 Tablet — 2 strips', balance_after: 444, created_at: '2026-10-01 11:00:00' }
      ],
      refills: [
        { id: 'ref-1', customer_id: 'cus-1', patient_name: 'Rajesh Sharma', phone: '9826011111', medicine_id: 'med-10', brand_name: 'Telma 40 Tablet', salt_composition: 'Telmisartan 40mg', strips_qty: 2, loose_qty: 0, interval_days: 30, last_purchase_date: '2026-09-30', next_due_date: '2026-10-30', status: 'ACTIVE' },
        { id: 'ref-2', customer_id: 'cus-2', patient_name: 'Meena Joshi', phone: '9826022222', medicine_id: 'med-8', brand_name: 'Glycomet-GP 2 Tablet', salt_composition: 'Glimepiride 2mg + Metformin 500mg', strips_qty: 1, loose_qty: 0, interval_days: 30, last_purchase_date: '2026-09-29', next_due_date: '2026-10-29', status: 'ACTIVE' },
        { id: 'ref-3', customer_id: 'cus-3', patient_name: 'Suresh Verma', phone: '9826033333', medicine_id: 'med-14', brand_name: 'Ecosprin-AV 75 Tablet', salt_composition: 'Aspirin 75mg + Atorvastatin 10mg', strips_qty: 1, loose_qty: 0, interval_days: 30, last_purchase_date: '2026-10-01', next_due_date: '2026-10-30', status: 'ACTIVE' }
      ],
      shortbook: [
        { id: 'sb-manual-1', medicine_id: null, brand_name: 'Crocin Advance Tablet', pack_label: '1x15 Tabs', supplier_id: 'sup-1', supplier_name: 'Mahakal Pharma Agency, Ujjain', supplier_phone: '+91 94250 91101', requested_strips: 10, last_ptr: null, last_scheme: '', note: 'Requested at the counter', source: 'MANUAL', status: 'OPEN' }
      ],
      invoiceItems: [],
      sampleTemplates: {
        'tpl-mahakal': {
          supplierId: 'sup-1',
          supplierName: 'Mahakal Pharma Agency, Ujjain',
          gstin: '23AABCM4821E1Z4',
          invoiceNumber: 'MPA-26-2480',
          invoiceDate: '2026-10-27',
          paymentStatus: 'CREDIT',
          billPhotoUrl: bill1Img,
          confidence: 99.4,
          items: [
            { brandName: 'Azithral 500 Tablet', saltComposition: 'Azithromycin 500mg', manufacturer: 'Alembic Pharma', packSizeUnits: 5, packLabel: '1x5 Tabs', rackLocation: 'Rack A-3', scheduleType: 'H1', batchNumber: 'AZ904', expiryDate: '2027-07-31', stripsCount: 20, freeStrips: 2, ptrPerStrip: 89.5, mrpPerStrip: 125.0, gstPercent: 12 },
            { brandName: 'Telma 40 Tablet', saltComposition: 'Telmisartan 40mg', manufacturer: 'Glenmark', packSizeUnits: 15, packLabel: '1x15 Tabs', rackLocation: 'Rack B-3', scheduleType: 'H', batchNumber: 'TL992', expiryDate: '2027-11-30', stripsCount: 30, freeStrips: 3, ptrPerStrip: 156.0, mrpPerStrip: 222.0, gstPercent: 12 }
          ]
        },
        'tpl-malwa': {
          supplierId: 'sup-2',
          supplierName: 'Malwa Medico Traders, Ujjain',
          gstin: '23AADCM9102F1Z9',
          invoiceNumber: 'MMT-26-1350',
          invoiceDate: '2026-10-27',
          paymentStatus: 'PAID',
          billPhotoUrl: bill2Img,
          confidence: 98.9,
          items: [
            { brandName: 'Shelcal 500 Tablet', saltComposition: 'Calcium 500mg + Vitamin D3 250 IU', manufacturer: 'Torrent Pharma', packSizeUnits: 15, packLabel: '1x15 Tabs', rackLocation: 'Rack C-2', scheduleType: 'OTC', batchNumber: 'SH411', expiryDate: '2027-09-30', stripsCount: 40, freeStrips: 4, ptrPerStrip: 98.0, mrpPerStrip: 138.0, gstPercent: 12 },
            { brandName: 'Montair LC Tablet', saltComposition: 'Montelukast 10mg + Levocetirizine 5mg', manufacturer: 'Cipla Ltd', packSizeUnits: 10, packLabel: '1x10 Tabs', rackLocation: 'Rack A-4', scheduleType: 'H', batchNumber: 'ML708', expiryDate: '2026-12-20', stripsCount: 15, freeStrips: 1, ptrPerStrip: 145.0, mrpPerStrip: 204.0, gstPercent: 12 }
          ]
        },
        'tpl-shipra': {
          supplierId: 'sup-3',
          supplierName: 'Shipra Drug House, Ujjain',
          gstin: '23AAECS7731H1Z2',
          invoiceNumber: 'SDH-26-4912',
          invoiceDate: '2026-10-27',
          paymentStatus: 'CREDIT',
          billPhotoUrl: bill3Img,
          confidence: 99.1,
          items: [
            { brandName: 'Ecosprin 75 Tablet', saltComposition: 'Aspirin 75mg Gastro-Resistant', manufacturer: 'USV Pvt Ltd', packSizeUnits: 14, packLabel: '1x14 Tabs', rackLocation: 'Rack B-5', scheduleType: 'H', batchNumber: 'EC612', expiryDate: '2027-10-15', stripsCount: 50, freeStrips: 5, ptrPerStrip: 4.1, mrpPerStrip: 5.5, gstPercent: 12 },
            { brandName: 'Aciloc RD 20 Tablet', saltComposition: 'Pantoprazole 40mg + Domperidone 30mg', manufacturer: 'Cadila Pharma', packSizeUnits: 15, packLabel: '1x15 Tabs', rackLocation: 'Rack B-2', scheduleType: 'H', batchNumber: 'AC809', expiryDate: '2026-12-12', stripsCount: 18, freeStrips: 2, ptrPerStrip: 96.0, mrpPerStrip: 135.0, gstPercent: 12 }
          ]
        }
      },
      expenses: [
        { id: 'exp-salary-rahul', category: 'SALARY', title: 'Rahul (Counter Staff)', employee_name: 'Rahul', amount: 12000, expense_date: '2026-10-01', payment_mode: 'CASH', note: 'October salary' },
        { id: 'exp-rent-oct', category: 'RENT', title: 'Shop Rent (Freeganj)', employee_name: '', amount: 8000, expense_date: '2026-10-05', payment_mode: 'CASH', note: 'October rent' },
        { id: 'exp-power-oct', category: 'ELECTRICITY', title: 'MPPKVVCL Bill', employee_name: '', amount: 1450, expense_date: '2026-10-03', payment_mode: 'CASH', note: 'Fridge and shop' }
      ],
      vouchers: [
        { id: 'vch-demo-1', voucher_number: 'VCH-1042', voucher_type: 'SALE', status: 'DRAFT', customer_or_supplier: 'Rajesh Sharma', customer_phone: '9826011111', items_json: JSON.stringify([{ medicineId: 'med-6', strips: 2, loose: 0 }]), total_amount: 67.6, estimated_margin: 18.6, payment_mode: 'CASH', created_by_role: 'EMPLOYEE', created_at: '2026-10-27 18:10:00' }
      ],
      expiryReturns: [],
      aiUsage: { year_month: '2026-10', calls_used: 16, monthly_limit: 300 }
    };
  }

  function loadRaw() {
    try {
      const s = localStorage.getItem(STORAGE_KEY);
      if (s) return ensureV3(JSON.parse(s));
    } catch (_e) {}
    const init = getInitialLocalRaw();
    saveRaw(init);
    return init;
  }

  function saveRaw(raw) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(raw));
    } catch (_e) {}
  }

  function phoneDigits(input) {
    let digits = String(input || '').replace(/\D/g, '');
    if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
    if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
    return digits;
  }

  function round2(n) {
    return Number((Number(n) || 0).toFixed(2));
  }

  function netBuyPrice(ptr, buyQty, freeQty, discountPct) {
    const buy = Math.max(0, parseInt(buyQty, 10) || 0);
    const free = Math.max(0, parseInt(freeQty, 10) || 0);
    const denom = buy + free;
    if (!denom) return round2(ptr);
    return round2((Number(ptr) || 0) * (1 - (Number(discountPct) || 0) / 100) * buy / denom);
  }

  function schemeParts(label, paid, freeQty) {
    const raw = String(label || '').trim();
    const matched = raw.match(/(\d+)\s*\+\s*(\d+)/);
    if (matched) return { label: matched[1] + '+' + matched[2], buy: parseInt(matched[1], 10), free: parseInt(matched[2], 10) };
    const paidN = Math.max(0, parseInt(paid, 10) || 0);
    const free = Math.max(0, parseInt(freeQty, 10) || 0);
    if (free > 0 && paidN > 0) return { label: paidN + '+' + free, buy: paidN, free: free };
    return { label: 'No Scheme', buy: Math.max(1, paidN || 1), free: 0 };
  }

  function demoOffers() {
    const rows = [
      ['off-s1-aug', 'sup-1', 'med-1', 'Augmentin 625 Duo Tab', 'Amoxicillin 500mg + Clavulanic Acid 125mg', 160, 202.01, 10, 1, 0],
      ['off-s4-mox', 'sup-4', 'med-2', 'Moxikind-CV 625 Tab', 'Amoxicillin 500mg + Clavulanic Acid 125mg', 118, 189.10, 10, 2, 0],
      ['off-s4-clavam', 'sup-4', 'med-3', 'Clavam 625 Tablet', 'Amoxicillin 500mg + Clavulanic Acid 125mg', 130, 201, 5, 1, 0],
      ['off-s1-pand', 'sup-1', 'med-4', 'Pan-D Capsule PR', 'Pantoprazole 40mg + Domperidone 30mg', 155, 210, 10, 1, 0],
      ['off-s2-pand', 'sup-2', 'med-4', 'Pan-D Capsule PR', 'Pantoprazole 40mg + Domperidone 30mg', 140, 210, 10, 2, 2],
      ['off-s3-panto', 'sup-3', 'med-5', 'Pantocid DSR Cap', 'Pantoprazole 40mg + Domperidone 30mg', 132, 188, 10, 2, 1]
    ];
    return rows.map(row => {
      const net = netBuyPrice(row[5], row[7], row[8], row[9]);
      const margin = row[6] > 0 ? round2(((row[6] - net) / row[6]) * 100) : 0;
      return {
        id: row[0], supplier_id: row[1], medicine_id: row[2], brand_name: row[3], salt_composition: row[4],
        buy_price_ptr: row[5], mrp: row[6], scheme_label: row[8] > 0 ? row[7] + '+' + row[8] : 'No Scheme',
        buy_qty: row[7], free_qty: row[8], cash_discount_pct: row[9], net_buy_price: net, retail_margin_pct: margin,
        valid_until: '2026-11-26', source: 'Manual Monthly Circular'
      };
    });
  }

  function decorateOffers(rows, suppliers) {
    const byId = {};
    (suppliers || []).forEach(s => { byId[s.id] = s; });
    const bestMargin = {};
    const bestNet = {};
    rows.forEach(row => {
      const salt = String(row.salt_composition || '').toLowerCase();
      const brand = String(row.brand_name || '').toLowerCase();
      if (bestMargin[salt] == null || row.retail_margin_pct > bestMargin[salt]) bestMargin[salt] = row.retail_margin_pct;
      if (bestNet[brand] == null || row.net_buy_price < bestNet[brand]) bestNet[brand] = row.net_buy_price;
    });
    return rows.map(row => {
      const sup = byId[row.supplier_id] || {};
      const salt = String(row.salt_composition || '').toLowerCase();
      const brand = String(row.brand_name || '').toLowerCase();
      const best = row.retail_margin_pct === bestMargin[salt] && row.retail_margin_pct > 0;
      return Object.assign({}, row, {
        supplier_name: sup.name || row.supplier_name || '',
        supplier_phone: sup.phone || row.supplier_phone || '',
        short_code: sup.short_code || row.short_code || '',
        best_margin: best,
        best_net_for_brand: row.net_buy_price === bestNet[brand],
        deal_label: best ? 'BEST MARGIN DEAL' : ''
      });
    });
  }

  function ensureCommercial(raw) {
    const codes = { 'sup-1': ['S1', 0], 'sup-2': ['S2', 2], 'sup-3': ['S3', 1], 'sup-4': ['S4', 0] };
    (raw.suppliers || []).forEach(s => {
      const known = codes[s.id];
      if (known && !s.short_code) {
        s.short_code = known[0];
        if (s.cash_discount_pct == null) s.cash_discount_pct = known[1];
      }
    });
    if (!raw.supplierOffers || !raw.supplierOffers.length) raw.supplierOffers = demoOffers();
  }

  function buildLocalV2(raw) {
    raw.customers = raw.customers || [];
    raw.creditTransactions = raw.creditTransactions || [];
    raw.refills = raw.refills || [];
    raw.shortbook = raw.shortbook || [];
    raw.invoiceItems = raw.invoiceItems || [];
    raw.rawBatches.filter(b => b.purchase_invoice_id).forEach(b => {
      if (raw.invoiceItems.some(li => li.batch_id === b.id)) return;
      const med = raw.medicines.find(m => m.id === b.medicine_id) || {};
      const free = b.free_strips_received || 0;
      const buy = b.scheme_buy_qty > 0 ? b.scheme_buy_qty : (free > 0 ? 10 : 1);
      raw.invoiceItems.push({
        id: 'li-' + b.id,
        invoice_id: b.purchase_invoice_id,
        batch_id: b.id,
        medicine_id: b.medicine_id,
        brand_name: med.brand_name || '',
        salt_composition: med.salt_composition || '',
        pack_label: med.pack_label || '',
        rack_location: med.rack_location || '',
        batch_number: b.batch_number,
        expiry_date: b.expiry_date,
        strips_qty: b.strips_count,
        free_strips_qty: free,
        scheme_label: free > 0 ? (buy + '+' + free) : 'No Scheme',
        scheme_buy_qty: buy,
        scheme_free_qty: free,
        ptr_per_strip: b.ptr_per_strip,
        mrp_per_strip: b.mrp_per_strip,
        gst_percent: b.gst_percent
      });
    });
    const stripsByMed = {};
    raw.rawBatches.forEach(b => { stripsByMed[b.medicine_id] = (stripsByMed[b.medicine_id] || 0) + b.strips_count; });
    raw.medicines.forEach(med => {
      const strips = stripsByMed[med.id] || 0;
      const min = med.min_reorder_strips || 0;
      const existing = raw.shortbook.find(s => s.source === 'AUTO' && s.medicine_id === med.id);
      if (strips > min) {
        raw.shortbook = raw.shortbook.filter(s => !(s.source === 'AUTO' && s.medicine_id === med.id));
        return;
      }
      if (existing && (existing.status === 'ORDERED' || existing.status === 'CLEARED')) return;
      const last = [...raw.rawBatches].reverse().find(b => b.medicine_id === med.id);
      const sup = last ? raw.suppliers.find(s => s.id === last.supplier_id) : null;
      const scheme = last && last.free_strips_received > 0
        ? ((last.scheme_buy_qty > 0 ? last.scheme_buy_qty : 10) + '+' + (last.scheme_free_qty != null ? last.scheme_free_qty : last.free_strips_received))
        : '';
      if (existing) {
        existing.last_ptr = last ? last.ptr_per_strip : existing.last_ptr;
        existing.last_scheme = scheme;
        existing.supplier_name = sup ? sup.name : existing.supplier_name;
        existing.supplier_phone = sup ? sup.phone : existing.supplier_phone;
        return;
      }
      raw.shortbook.push({
        id: 'sb-auto-' + med.id,
        medicine_id: med.id,
        brand_name: med.brand_name,
        pack_label: med.pack_label,
        supplier_id: sup ? sup.id : null,
        supplier_name: sup ? sup.name : 'Unassigned',
        supplier_phone: sup ? sup.phone : '',
        requested_strips: Math.max(1, min - strips),
        last_ptr: last ? last.ptr_per_strip : null,
        last_scheme: scheme,
        note: '',
        source: 'AUTO',
        status: 'OPEN'
      });
    });
    const refills = raw.refills.map(r => {
      const med = raw.medicines.find(m => m.id === r.medicine_id);
      const stock = stripsByMed[r.medicine_id] || 0;
      const min = med ? med.min_reorder_strips : 0;
      const days = daysBetween(String(r.next_due_date || '').slice(0, 10));
      return Object.assign({}, r, {
        stock_strips: stock,
        low_stock: stock <= min,
        days_until_due: days,
        due_soon: days <= 3 && r.status !== 'PAUSED',
        pack_label: med ? med.pack_label : r.pack_label,
        rack_location: med ? med.rack_location : ''
      });
    });
    const openShort = raw.shortbook.filter(s => s.status === 'OPEN');
    const pendingCreditBalance = Number(raw.customers.reduce((sum, c) => sum + Number(c.outstanding_balance || 0), 0).toFixed(2));
    return {
      invoiceItems: raw.invoiceItems,
      shortbook: openShort,
      customers: raw.customers.map(c => Object.assign({}, c, {
        last_txn_at: (raw.creditTransactions.filter(tx => tx.customer_id === c.id).slice(-1)[0] || {}).created_at || ''
      })),
      creditTransactions: raw.creditTransactions.slice().reverse(),
      refills,
      pendingCreditBalance,
      dueRefillCount: refills.filter(r => r.due_soon).length,
      shortbookCount: openShort.length
    };
  }

  function ensureV3(raw) {
    raw.expenses = raw.expenses || [];
    raw.vouchers = raw.vouchers || [];
    raw.expiryReturns = raw.expiryReturns || [];
    raw.aiUsage = raw.aiUsage || { year_month: '2026-10', calls_used: 0, monthly_limit: 300 };
    raw.settings.admin_pattern = raw.settings.admin_pattern || '0-3-6-7-8';
    if (!raw.settings.biometric_credential_id) raw.settings.biometric_credential_id = 'bio-demo-akshay-1';
    if (raw.settings.biometric_enabled == null) raw.settings.biometric_enabled = 1;
    if (raw.settings.admin_lock_minutes == null) raw.settings.admin_lock_minutes = 15;
    if (raw.settings.tutorial_completed == null) raw.settings.tutorial_completed = 0;
    return raw;
  }

  function localPl(raw) {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    function addDaysIso(iso, n) {
      const d = new Date(iso + 'T12:00:00Z');
      d.setUTCDate(d.getUTCDate() + n);
      return d.toISOString().slice(0, 10);
    }
    function report(range, from, to) {
      const sales = (raw.sales || []).filter(s => !s.is_cancelled && String(s.sold_at || '').slice(0, 10) >= from && String(s.sold_at || '').slice(0, 10) <= to);
      const totalSales = Number(sales.reduce((s, row) => s + Number(row.billed_amount || 0), 0).toFixed(2));
      const cogs = Number(sales.reduce((s, row) => {
        if (Number(row.cogs_amount) > 0) return s + Number(row.cogs_amount);
        const pack = Number(row.pack_size_units) || 10;
        const units = Number(row.total_units_deducted) || 0;
        return s + (units / pack) * Number(row.ptr_per_strip || 0);
      }, 0).toFixed(2));
      const grossMargin = Number((totalSales - cogs).toFixed(2));
      const exps = (raw.expenses || []).filter(e => e.expense_date >= from && e.expense_date <= to);
      const salary = Number(exps.filter(e => e.category === 'SALARY').reduce((s, e) => s + Number(e.amount), 0).toFixed(2));
      const other = Number(exps.filter(e => e.category !== 'SALARY').reduce((s, e) => s + Number(e.amount), 0).toFixed(2));
      const expenses = Number((salary + other).toFixed(2));
      const netProfit = Number((grossMargin - expenses).toFixed(2));
      return {
        range, from, to, prorate: false, totalSales, billCount: sales.length, cogs,
        grossMargin, grossMarginPct: totalSales ? Number(((grossMargin / totalSales) * 100).toFixed(2)) : 0,
        expenses, salary, otherExpenses: other, proratedAmount: 0, netProfit,
        netProfitPct: totalSales ? Number(((netProfit / totalSales) * 100).toFixed(2)) : 0
      };
    }
    const months = {};
    (raw.sales || []).filter(s => !s.is_cancelled).forEach(s => {
      const month = String(s.sold_at || '').slice(0, 7);
      if (month.length < 7) return;
      if (!months[month]) months[month] = {};
      const key = s.medicine_id || s.brand_name;
      if (!months[month][key]) months[month][key] = { medicine_id: s.medicine_id, brand_name: s.brand_name, strips: 0, loose: 0, revenue: 0, margin: 0 };
      months[month][key].strips += Number(s.strips_sold) || 0;
      months[month][key].loose += Number(s.loose_tablets_sold) || 0;
      months[month][key].revenue += Number(s.billed_amount) || 0;
      months[month][key].margin += Number(s.margin_amount) || 0;
    });
    return {
      pl: {
        '1d': report('1d', today, today),
        '1w': report('1w', addDaysIso(today, -6), today),
        '1m': report('1m', today.slice(0, 7) + '-01', today)
      },
      seasonality: {
        months: Object.keys(months).sort().map(month => {
          const items = Object.values(months[month]).sort((a, b) => b.strips - a.strips);
          const top = items[0] ? items[0].strips : 0;
          return { month, top: items.slice(0, 8).map(item => Object.assign({}, item, { bar: top ? Math.round(item.strips / top * 100) : 0 })) };
        })
      }
    };
  }

  function computeFullStateFromRaw(raw) {
    ensureCommercial(raw);
    ensureV3(raw);
    const alertDays = raw.settings.expiry_alert_days || 60;
    const medMap = {};
    raw.medicines.forEach(m => { medMap[m.id] = m; });
    const supMap = {};
    raw.suppliers.forEach(s => { supMap[s.id] = s; });
    const invMap = {};
    raw.invoices.forEach(iv => { invMap[iv.id] = iv; });

    const batches = raw.rawBatches
      .map(b => {
        const m = medMap[b.medicine_id] || {};
        const s = supMap[b.supplier_id] || {};
        const iv = invMap[b.purchase_invoice_id] || {};
        const packSize = b.pack_size_units || m.pack_size_units || 10;
        const daysToExpiry = daysBetween(b.expiry_date);
        const totalUnits = b.strips_count * packSize + b.loose_tablets_count;
        const eqStrips = b.strips_count + (b.loose_tablets_count / packSize);
        const ptrValue = Number((eqStrips * b.ptr_per_strip).toFixed(2));
        const mrpValue = Number((eqStrips * b.mrp_per_strip).toFixed(2));
        const minStrips = m.min_reorder_strips || 10;
        return {
          ...b,
          brand_name: m.brand_name || 'Medicine',
          salt_composition: m.salt_composition || '',
          manufacturer: m.manufacturer || '',
          pack_label: m.pack_label || `1x${packSize}`,
          rack_location: m.rack_location || 'Rack A-1',
          schedule_type: m.schedule_type || 'H',
          min_reorder_strips: minStrips,
          supplier_name: s.name || 'Mahakal Pharma Agency, Ujjain',
          supplier_phone: s.phone || '+91 94250 91101',
          invoice_number: iv.invoice_number || 'ONBOARD',
          bill_photo_url: iv.bill_photo_url || '',
          days_to_expiry: daysToExpiry,
          total_units: totalUnits,
          ptr_value: ptrValue,
          mrp_value: mrpValue,
          is_expiring_soon: daysToExpiry <= alertDays && !b.is_return_claimed && totalUnits > 0,
          is_low_stock: b.strips_count < minStrips
        };
      })
      .sort((a, b) => a.days_to_expiry - b.days_to_expiry);

    const expiringBatches = batches.filter(b => b.is_expiring_soon);
    const stripsByMedicine = {};
    batches.forEach(b => { stripsByMedicine[b.medicine_id] = (stripsByMedicine[b.medicine_id] || 0) + Number(b.strips_count || 0); });
    const lowMedicineIds = {};
    raw.medicines.forEach(m => {
      const strips = stripsByMedicine[m.id] || 0;
      if (strips <= (m.min_reorder_strips || 0)) lowMedicineIds[m.id] = true;
    });
    batches.forEach(b => { b.is_low_stock = !!lowMedicineIds[b.medicine_id]; });
    const lowStockCount = Object.keys(lowMedicineIds).length;

    const supplierGroups = {};
    for (const eb of expiringBatches) {
      const supName = eb.supplier_name || 'Mahakal Pharma Agency, Ujjain';
      if (!supplierGroups[supName]) {
        supplierGroups[supName] = {
          supplierName: supName,
          supplierPhone: eb.supplier_phone || '+91 94250 91101',
          totalCreditValuePtr: 0,
          items: []
        };
      }
      supplierGroups[supName].totalCreditValuePtr = Number((supplierGroups[supName].totalCreditValuePtr + eb.ptr_value).toFixed(2));
      supplierGroups[supName].items.push(eb);
    }

    const hi = raw.settings.default_language === 'hi';
    const whatsappReturnSummary = Object.values(supplierGroups).map(g => {
      const lines = hi
        ? [
          '*समाप्ति वापसी / क्रेडिट नोट दावा*',
          'प्रेषक: *अक्षय मेडिकोज़*',
          'उज्जैन',
          'प्राप्तकर्ता: *' + g.supplierName + '*',
          'समाप्ति अवधि: ' + alertDays + ' दिन',
          '----------------------------------------',
          ...g.items.map((it, idx) =>
            (idx + 1) + '. *' + it.brand_name + '* | बैच: ' + it.batch_number + ' | समाप्ति: ' + it.expiry_date +
            ' | मात्रा: ' + it.strips_count + ' पट्टी + ' + it.loose_tablets_count + ' खुली | बिल: ' + it.invoice_number +
            ' | खरीद रेट (PTR) क्रेडिट: Rs.' + it.ptr_value
          ),
          '----------------------------------------',
          '*कुल खरीद रेट (PTR) क्रेडिट: Rs.' + g.totalCreditValuePtr.toLocaleString('en-IN') + '*',
          'कृपया अगली डिलीवरी पर सामान वापस ले लें।'
        ]
        : [
          '*EXPIRY RETURN / CREDIT NOTE CLAIM*',
          'From: *' + raw.settings.store_name + '*',
          raw.settings.city,
          'To: *' + g.supplierName + '*',
          'Return window: within ' + alertDays + ' days of expiry',
          '----------------------------------------',
          ...g.items.map((it, idx) =>
            (idx + 1) + '. *' + it.brand_name + '* | Batch: ' + it.batch_number + ' | Expiry: ' + it.expiry_date +
            ' (' + it.days_to_expiry + 'd) | Qty: ' + it.strips_count + ' strips + ' + it.loose_tablets_count + ' loose | Bill: ' + it.invoice_number +
            ' | Buy Price (PTR) credit: Rs.' + it.ptr_value
          ),
          '----------------------------------------',
          '*Total Buy Price (PTR) credit: Rs.' + g.totalCreditValuePtr.toLocaleString('en-IN') + '*',
          'Please collect the return goods on the next delivery visit.'
        ];
      return { ...g, whatsappText: lines.join('\n') };
    });

    const activeSales = raw.sales.filter(s => !s.is_cancelled);
    const extra = buildLocalV2(raw);
    const totalPtrValue = Number(batches.reduce((acc, b) => acc + b.ptr_value, 0).toFixed(2));
    const totalMrpValue = Number(batches.reduce((acc, b) => acc + b.mrp_value, 0).toFixed(2));
    return {
      settings: raw.settings,
      kpis: {
        totalActiveBatches: batches.filter(b => b.total_units > 0).length,
        totalPtrValue,
        totalMrpValue,
        avgMarginPercent: totalMrpValue > 0 ? Number((((totalMrpValue - totalPtrValue) / totalMrpValue) * 100).toFixed(1)) : 0,
        expiringCount: expiringBatches.length,
        expiringPtrValue: Number(expiringBatches.reduce((acc, b) => acc + b.ptr_value, 0).toFixed(2)),
        lowStockCount: lowStockCount,
        todaySalesCount: activeSales.length,
        todaySalesAmount: Number(activeSales.reduce((acc, s) => acc + s.billed_amount, 0).toFixed(2)),
        pendingCreditBalance: extra.pendingCreditBalance,
        dueRefillCount: extra.dueRefillCount,
        shortbookCount: extra.shortbookCount
      },
      suppliers: raw.suppliers,
      medicines: raw.medicines.map(m => Object.assign({}, m, { min_stock_strips: m.min_reorder_strips })),
      invoices: raw.invoices,
      invoiceItems: extra.invoiceItems,
      shortbook: extra.shortbook,
      customers: extra.customers,
      creditTransactions: extra.creditTransactions,
      refills: extra.refills,
      offers: decorateOffers(raw.supplierOffers || [], raw.suppliers),
      batches,
      expiringBatches,
      whatsappReturnSummary,
      sales: raw.sales,
      audits: raw.audits,
      sampleTemplates: raw.sampleTemplates,
      expenses: raw.expenses,
      vouchers: (raw.vouchers || []).map(row => {
        let items = [];
        try { items = typeof row.items_json === 'string' ? JSON.parse(row.items_json) : (row.items || []); } catch (_e) { items = row.items || []; }
        return Object.assign({}, row, { items });
      }),
      expiryReturns: raw.expiryReturns,
      aiQuota: {
        year_month: raw.aiUsage.year_month,
        calls_used: raw.aiUsage.calls_used,
        monthly_limit: raw.aiUsage.monthly_limit || 300,
        remaining: Math.max(0, (raw.aiUsage.monthly_limit || 300) - (raw.aiUsage.calls_used || 0)),
        level: ((raw.aiUsage.monthly_limit || 300) - (raw.aiUsage.calls_used || 0)) === 0 ? 'exhausted' : ((raw.aiUsage.monthly_limit || 300) - (raw.aiUsage.calls_used || 0)) < 10 ? 'crit' : ((raw.aiUsage.monthly_limit || 300) - (raw.aiUsage.calls_used || 0)) <= 50 ? 'warn' : 'ok'
      },
      ...localPl(raw)
    };
  }

  const isHttpBackend = window.location.protocol.startsWith('http');

  window.StoreEngine = {
    async bootstrap() {
      if (isHttpBackend) {
        try {
          const res = await fetch('/api/bootstrap');
          const json = await res.json();
          if (json.ok) return json.data;
        } catch (_e) {}
      }
      return computeFullStateFromRaw(loadRaw());
    },

    async updateSettings(payload) {
      if (isHttpBackend) {
        try {
          const res = await fetch('/api/settings', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          const json = await res.json();
          if (json.ok) return json.data;
          if (!res.ok && json.error) throw new Error(json.error);
        } catch (err) {
          if (err && err.message && !/fetch|network/i.test(err.message)) throw err;
        }
      }
      const raw = loadRaw();
      if (payload.expiry_alert_days !== undefined) {
        raw.settings.expiry_alert_days = Math.min(365, Math.max(5, parseInt(payload.expiry_alert_days, 10) || 60));
      }
      if (payload.default_language) raw.settings.default_language = payload.default_language;
      if (payload.store_name) raw.settings.store_name = payload.store_name;
      if (payload.owner_pin !== undefined && payload.owner_pin !== null && String(payload.owner_pin).trim() !== '') {
        const pin = String(payload.owner_pin).trim();
        if (!/^\d{4}$/.test(pin)) throw new Error('Owner PIN must be 4 digits');
        raw.settings.owner_pin = pin;
      }
      if (payload.admin_pattern) {
        const parts = String(payload.admin_pattern).split('-');
        if (parts.length < 4 || parts.some(p => !/^[0-8]$/.test(p))) throw new Error('Pattern must join at least 4 different dots');
        raw.settings.admin_pattern = parts.join('-');
      }
      if (payload.admin_lock_minutes != null) raw.settings.admin_lock_minutes = parseInt(payload.admin_lock_minutes, 10) || 15;
      if (payload.biometric_enabled != null) raw.settings.biometric_enabled = payload.biometric_enabled ? 1 : 0;
      if (payload.tutorial_completed != null) raw.settings.tutorial_completed = payload.tutorial_completed ? 1 : 0;
      saveRaw(raw);
      return computeFullStateFromRaw(raw);
    },

    async parseBill({ file, templateId, photoDataUrl }) {
      if (isHttpBackend && (file || templateId)) {
        try {
          const fd = new FormData();
          if (file) fd.append('billPhoto', file);
          if (templateId) fd.append('templateId', templateId);
          const res = await fetch('/api/ocr/parse', { method: 'POST', body: fd });
          const json = await res.json();
          if (json.ok) {
            if (photoDataUrl && file) json.parsed.billPhotoUrl = photoDataUrl;
            return json.parsed;
          }
        } catch (_e) {}
      }
      const raw = loadRaw();
      if (templateId && raw.sampleTemplates[templateId]) {
        return JSON.parse(JSON.stringify(raw.sampleTemplates[templateId]));
      }
      return {
        supplierId: 'sup-1',
        supplierName: 'Mahakal Pharma Agency, Ujjain',
        gstin: '23AABCM4821E1Z4',
        invoiceNumber: 'CAM-26-' + String(Math.floor(1000 + Math.random() * 8999)),
        invoiceDate: '2026-10-27',
        paymentStatus: 'CREDIT',
        billPhotoUrl: photoDataUrl || raw.sampleTemplates['tpl-mahakal'].billPhotoUrl,
        confidence: 96.8,
        items: [
          {
            brandName: 'Chymoral Forte Tablet',
            saltComposition: 'Trypsin-Chymotrypsin 100000 AU',
            manufacturer: 'Torrent Pharma',
            packSizeUnits: 20,
            packLabel: '1x20 Tabs',
            rackLocation: 'Rack C-3',
            scheduleType: 'H',
            batchNumber: 'CF' + String(Math.floor(100 + Math.random() * 899)),
            expiryDate: '2027-06-30',
            stripsCount: 15,
            freeStrips: 1,
            ptrPerStrip: 318.0,
            mrpPerStrip: 445.0,
            gstPercent: 12
          },
          {
            brandName: 'Becosules Capsules',
            saltComposition: 'Vitamin B-Complex + Vitamin C',
            manufacturer: 'Pfizer Ltd',
            packSizeUnits: 20,
            packLabel: '1x20 Caps',
            rackLocation: 'Rack C-1',
            scheduleType: 'OTC',
            batchNumber: 'BC' + String(Math.floor(100 + Math.random() * 899)),
            expiryDate: '2027-09-30',
            stripsCount: 30,
            freeStrips: 3,
            ptrPerStrip: 38.5,
            mrpPerStrip: 54.0,
            gstPercent: 12
          }
        ]
      };
    },

    async saveInvoice(payload) {
      if (isHttpBackend) {
        try {
          const res = await fetch('/api/invoices', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          const json = await res.json();
          if (json.ok) return json.data;
        } catch (_e) {}
      }
      const raw = loadRaw();
      const invId = 'inv-' + Date.now();
      let subtotal = 0;
      let gst = 0;
      payload.items.forEach((it, idx) => {
        const strips = (parseInt(it.stripsCount, 10) || 10) + (parseInt(it.freeStrips, 10) || 0);
        const ptr = parseFloat(it.ptrPerStrip) || 85;
        const mrp = parseFloat(it.mrpPerStrip) || 120;
        const packUnits = parseInt(it.packSizeUnits, 10) || 10;
        subtotal += (parseInt(it.stripsCount, 10) || 10) * ptr;
        gst += (parseInt(it.stripsCount, 10) || 10) * ptr * 0.12;

        let med = raw.medicines.find(m => m.brand_name.toLowerCase() === (it.brandName || '').toLowerCase());
        if (!med) {
          med = {
            id: 'med-' + Date.now() + '-' + idx,
            brand_name: it.brandName || 'New Medicine',
            salt_composition: it.saltComposition || 'Standard Composition',
            manufacturer: 'Standard Pharma',
            pack_size_units: packUnits,
            pack_label: `1x${packUnits} Tabs`,
            rack_location: it.rackLocation || 'Rack A-1',
            schedule_type: it.scheduleType || 'H',
            gst_percent: 12,
            min_reorder_strips: 10
          };
          raw.medicines.push(med);
        }
        raw.rawBatches.unshift({
          id: 'b-' + Date.now() + '-' + idx,
          medicine_id: med.id,
          supplier_id: payload.supplierId || 'sup-1',
          purchase_invoice_id: invId,
          batch_number: it.batchNumber || ('B' + (100 + idx)),
          expiry_date: it.expiryDate || '2027-09-30',
          pack_size_units: packUnits,
          strips_count: strips,
          loose_tablets_count: 0,
          free_strips_received: parseInt(it.freeStrips, 10) || 0,
          ptr_per_strip: ptr,
          mrp_per_strip: mrp,
          gst_percent: 12,
          is_return_claimed: 0
        });
      });

      raw.invoices.unshift({
        id: invId,
        supplier_id: payload.supplierId || 'sup-1',
        supplier_name: payload.supplierName || 'Mahakal Pharma Agency, Ujjain',
        supplier_gstin: payload.gstin || '23AABCM4821E1Z4',
        invoice_number: payload.invoiceNumber || 'INV-NEW',
        invoice_date: payload.invoiceDate || '2026-10-27',
        bill_photo_url: payload.billPhotoUrl || '',
        subtotal_amount: Number(subtotal.toFixed(2)),
        gst_amount: Number(gst.toFixed(2)),
        total_amount: Number((subtotal + gst).toFixed(2)),
        payment_status: payload.paymentStatus || 'CREDIT'
      });
      raw.invoiceItems = raw.invoiceItems || [];
      payload.items.forEach((it, idx) => {
        const free = parseInt(it.freeStrips, 10) || 0;
        const paid = parseInt(it.stripsCount, 10) || 0;
        raw.invoiceItems.push({
          id: 'li-' + invId + '-' + idx,
          invoice_id: invId,
          brand_name: it.brandName || '',
          salt_composition: it.saltComposition || '',
          pack_label: it.packLabel || '',
          rack_location: it.rackLocation || '',
          batch_number: it.batchNumber || '',
          expiry_date: it.expiryDate || '',
          strips_qty: paid,
          free_strips_qty: free,
          scheme_label: it.schemeLabel || (free > 0 ? paid + '+' + free : ''),
          ptr_per_strip: parseFloat(it.ptrPerStrip) || 0,
          mrp_per_strip: parseFloat(it.mrpPerStrip) || 0,
          gst_percent: parseFloat(it.gstPercent) || 12
        });
      });

      saveRaw(raw);
      return computeFullStateFromRaw(raw);
    },

    async quickRackOnboard(payload) {
      if (isHttpBackend) {
        try {
          const res = await fetch('/api/onboarding/quick-rack', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          const json = await res.json();
          if (json.ok) return json.data;
        } catch (_e) {}
      }
      const raw = loadRaw();
      const packUnits = Math.max(1, parseInt(payload.packSizeUnits, 10) || 10);
      let med = raw.medicines.find(m => m.brand_name.toLowerCase() === (payload.brandName || '').trim().toLowerCase());
      if (!med) {
        med = {
          id: 'med-' + Date.now(),
          brand_name: (payload.brandName || 'Shelf Medicine').trim(),
          salt_composition: (payload.saltComposition || 'Generic Composition').trim(),
          manufacturer: 'Shelf Onboarded',
          pack_size_units: packUnits,
          pack_label: `1x${packUnits} Units`,
          rack_location: payload.rackLocation || 'Rack A-1',
          schedule_type: payload.scheduleType || 'H',
          gst_percent: 12,
          min_reorder_strips: 10
        };
        raw.medicines.push(med);
      } else if (payload.rackLocation) {
        med.rack_location = payload.rackLocation;
      }

      raw.rawBatches.unshift({
        id: 'b-onboard-' + Date.now(),
        medicine_id: med.id,
        supplier_id: 'sup-1',
        purchase_invoice_id: 'inv-1',
        batch_number: payload.batchNumber || 'SHLF-101',
        expiry_date: payload.expiryDate || '2027-08-31',
        pack_size_units: packUnits,
        strips_count: Math.max(0, parseInt(payload.stripsCount, 10) || 0),
        loose_tablets_count: Math.max(0, parseInt(payload.looseTabletsCount, 10) || 0),
        free_strips_received: 0,
        ptr_per_strip: parseFloat(payload.ptrPerStrip) || 80,
        mrp_per_strip: parseFloat(payload.mrpPerStrip) || 115,
        gst_percent: 12,
        is_return_claimed: 0
      });
      saveRaw(raw);
      return computeFullStateFromRaw(raw);
    },

    async recordSale(payload) {
      if (isHttpBackend) {
        try {
          const res = await fetch('/api/sales', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          const json = await res.json();
          if (!json.ok) throw new Error(json.error);
          return json.data;
        } catch (err) {
          if (err.message && !err.message.includes('fetch')) throw err;
        }
      }
      const raw = loadRaw();
      const sSold = Math.max(0, parseInt(payload.stripsSold, 10) || 0);
      const lSold = Math.max(0, parseInt(payload.looseTabletsSold, 10) || 0);
      if (sSold === 0 && lSold === 0) throw new Error('Enter at least 1 Strip or 1 Loose Tablet');

      const candidates = raw.rawBatches
        .filter(b => b.medicine_id === payload.medicineId && (b.strips_count > 0 || b.loose_tablets_count > 0))
        .sort((a, b) => a.expiry_date.localeCompare(b.expiry_date));

      if (candidates.length === 0) throw new Error('Medicine out of stock! Use Salt Substitute Finder.');
      const target = candidates[0];
      const med = raw.medicines.find(m => m.id === target.medicine_id) || {};
      const packSize = target.pack_size_units || 10;
      const reqUnits = sSold * packSize + lSold;
      const availUnits = target.strips_count * packSize + target.loose_tablets_count;
      if (reqUnits > availUnits) throw new Error(`Insufficient stock in batch ${target.batch_number}`);

      const prevStrips = target.strips_count;
      const prevLoose = target.loose_tablets_count;
      let newStrips = prevStrips - sSold;
      let newLoose = prevLoose - lSold;
      let opened = 0;
      while (newLoose < 0 && newStrips > 0) {
        newStrips -= 1;
        newLoose += packSize;
        opened += 1;
      }
      target.strips_count = newStrips;
      target.loose_tablets_count = newLoose;

      const billed = Number(((reqUnits / packSize) * target.mrp_per_strip).toFixed(2));
      const paymentMode = String(payload.paymentMode || 'CASH').toUpperCase();
      const saleId = 'sale-' + Date.now();
      raw.customers = raw.customers || [];
      raw.creditTransactions = raw.creditTransactions || [];
      raw.refills = raw.refills || [];
      if (paymentMode === 'CREDIT') {
        const phone = phoneDigits(payload.customerPhone);
        if (!payload.patientName || phone.length !== 10) throw new Error('Credit account needs a customer name and a 10-digit phone');
        let customer = raw.customers.find(c => c.phone === phone);
        if (!customer) {
          customer = { id: 'cus-' + Date.now(), name: payload.patientName, phone, outstanding_balance: 0 };
          raw.customers.push(customer);
        }
        customer.outstanding_balance = Number((Number(customer.outstanding_balance) + billed).toFixed(2));
        customer.name = payload.patientName;
        raw.creditTransactions.push({
          id: 'ctx-' + Date.now(), customer_id: customer.id, sale_id: saleId, txn_type: 'SALE',
          amount: billed, payment_mode: 'CREDIT', item_summary: (med.brand_name || 'Medicine') + ' — ' + sSold + ' strips',
          balance_after: customer.outstanding_balance, created_at: '2026-10-27 12:00:00'
        });
      }
      if (payload.scheduleRefill) {
        const phone = phoneDigits(payload.customerPhone);
        const interval = Math.max(1, parseInt(payload.refillIntervalDays, 10) || 30);
        raw.refills.push({
          id: 'ref-' + Date.now(), patient_name: payload.patientName || 'Patient', phone,
          medicine_id: target.medicine_id, brand_name: med.brand_name || 'Medicine',
          strips_qty: sSold, loose_qty: lSold, interval_days: interval,
          last_purchase_date: '2026-10-27', next_due_date: addDays(interval), status: 'ACTIVE'
        });
      }
      raw.sales.unshift({
        id: saleId,
        payment_mode: paymentMode,
        batch_id: target.id,
        medicine_id: target.medicine_id,
        brand_name: med.brand_name || 'Medicine',
        batch_number: target.batch_number,
        rack_location: med.rack_location || 'Rack A-1',
        pack_size_units: packSize,
        strips_sold: sSold,
        loose_tablets_sold: lSold,
        total_units_deducted: reqUnits,
        prev_strips: prevStrips,
        prev_loose_tablets: prevLoose,
        new_strips: newStrips,
        new_loose_tablets: newLoose,
        billed_amount: billed,
        patient_name: payload.patientName || '',
        customer_phone: payload.customerPhone || '',
        doctor_name: payload.doctorName || '',
        sale_note: opened > 0
          ? `FEFO Batch ${target.batch_number} | Opened ${opened} strip(s) -> ${newLoose} loose left`
          : `FEFO Batch ${target.batch_number} | Remaining: ${newStrips} strips + ${newLoose} loose`,
        is_cancelled: 0,
        ptr_per_strip: target.ptr_per_strip,
        cogs_amount: Number(((reqUnits / packSize) * target.ptr_per_strip).toFixed(2)),
        margin_amount: Number((billed - ((reqUnits / packSize) * target.ptr_per_strip)).toFixed(2)),
        sold_at: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date()).replace(', ', ' ')
      });
      saveRaw(raw);
      return computeFullStateFromRaw(raw);
    },

    async updateSaleCustomer(saleId, payload) {
      payload = payload || {};
      let phone = payload.customerPhone;
      if (phone !== undefined && window.MedReceipt) {
        phone = window.MedReceipt.normalizePhone(phone);
      }
      if (isHttpBackend) {
        try {
          const res = await fetch('/api/sales/' + saleId + '/customer', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              patientName: payload.patientName,
              customerPhone: phone === undefined ? payload.customerPhone : phone,
              doctorName: payload.doctorName
            })
          });
          const json = await res.json();
          if (!json.ok) throw new Error(json.error || 'Receipt update failed');
          return json;
        } catch (err) {
          if (err && err.message && !/fetch|network/i.test(err.message)) throw err;
        }
      }
      const raw = loadRaw();
      const sale = raw.sales.find(s => s.id === saleId);
      if (!sale) throw new Error('Sale entry not found');
      if (payload.patientName !== undefined) sale.patient_name = payload.patientName || '';
      if (payload.customerPhone !== undefined) sale.customer_phone = phone || '';
      if (payload.doctorName !== undefined) sale.doctor_name = payload.doctorName || '';
      saveRaw(raw);
      const batch = raw.rawBatches.find(b => b.id === sale.batch_id);
      const built = window.MedReceipt.build({
        storeName: raw.settings.store_name,
        city: raw.settings.city,
        sale: sale,
        expiryDate: batch ? batch.expiry_date : '',
        lang: raw.settings.default_language
      });
      return {
        ok: true,
        sale: sale,
        data: computeFullStateFromRaw(raw),
        receiptText: built.text,
        whatsappUrl: built.whatsappUrl
      };
    },

    async undoSale(saleId) {
      if (isHttpBackend) {
        try {
          const res = await fetch(`/api/sales/${saleId}/undo`, { method: 'POST' });
          const json = await res.json();
          if (json.ok) return json.data;
        } catch (_e) {}
      }
      const raw = loadRaw();
      const sale = raw.sales.find(s => s.id === saleId);
      if (sale && !sale.is_cancelled) {
        const b = raw.rawBatches.find(x => x.id === sale.batch_id);
        if (b) {
          const packSize = b.pack_size_units || 10;
          const total = b.strips_count * packSize + b.loose_tablets_count + sale.total_units_deducted;
          b.strips_count = Math.floor(total / packSize);
          b.loose_tablets_count = total % packSize;
        }
        sale.is_cancelled = 1;
        sale.sale_note = (sale.sale_note || '') + ' [UNDONE / RESTORED]';
        if (String(sale.payment_mode || '').toUpperCase() === 'CREDIT') {
          const customer = raw.customers.find(c => c.id === sale.customer_id || c.phone === sale.customer_phone);
          if (customer) {
            const amount = Number(sale.billed_amount) || 0;
            customer.outstanding_balance = round2(Math.max(0, Number(customer.outstanding_balance || 0) - amount));
            raw.creditTransactions = raw.creditTransactions || [];
            raw.creditTransactions.push({
              id: 'ctx-rev-' + Date.now(),
              customer_id: customer.id,
              sale_id: sale.id,
              txn_type: 'REVERSAL',
              amount: amount,
              payment_mode: 'CREDIT',
              reference_note: 'Sale undone',
              item_summary: sale.brand_name || '',
              balance_after: customer.outstanding_balance,
              created_at: '2026-10-27 18:30:00'
            });
          }
        }
      }
      saveRaw(raw);
      return computeFullStateFromRaw(raw);
    },

    async recordAudit(payload) {
      if (isHttpBackend) {
        try {
          const res = await fetch('/api/audits', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          const json = await res.json();
          if (json.ok) return json.data;
        } catch (_e) {}
      }
      const raw = loadRaw();
      const b = raw.rawBatches.find(x => x.id === payload.batchId);
      if (b) {
        const m = raw.medicines.find(x => x.id === b.medicine_id) || {};
        const cStrips = Math.max(0, parseInt(payload.countedStrips, 10) || 0);
        const cLoose = Math.max(0, parseInt(payload.countedLooseTablets, 10) || 0);
        raw.audits.unshift({
          id: 'aud-' + Date.now(),
          batch_id: b.id,
          medicine_id: b.medicine_id,
          brand_name: m.brand_name || 'Medicine',
          batch_number: b.batch_number,
          rack_location: m.rack_location || 'Rack A-1',
          expected_strips: b.strips_count,
          expected_loose_tablets: b.loose_tablets_count,
          counted_strips: cStrips,
          counted_loose_tablets: cLoose,
          variance_strips: cStrips - b.strips_count,
          variance_loose_tablets: cLoose - b.loose_tablets_count,
          audit_note: payload.auditNote || 'Physical shelf count reconciled',
          audited_at: new Date().toLocaleTimeString('en-IN')
        });
        b.strips_count = cStrips;
        b.loose_tablets_count = cLoose;
      }
      saveRaw(raw);
      return computeFullStateFromRaw(raw);
    },

    async setInvoicePayment(id, body) {
      body = body || {};
      if (isHttpBackend) {
        try {
          const res = await fetch('/api/invoices/' + id + '/payment', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
          });
          const json = await res.json();
          if (!json.ok) throw new Error(json.error || 'Could not update the bill');
          return json.data;
        } catch (err) {
          if (err && err.message && !/fetch|network/i.test(err.message)) throw err;
        }
      }
      const raw = loadRaw();
      const inv = raw.invoices.find(row => row.id === id);
      if (!inv) throw new Error('Invoice not found');
      inv.payment_status = body.paymentStatus || 'PAID';
      inv.payment_reference = body.paymentReference || '';
      saveRaw(raw);
      return computeFullStateFromRaw(raw);
    },

    async addShortbook(body) {
      body = body || {};
      if (isHttpBackend) {
        try {
          const res = await fetch('/api/shortbook', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
          });
          const json = await res.json();
          if (!json.ok) throw new Error(json.error || 'Could not add the shortbook line');
          return json.data;
        } catch (err) {
          if (err && err.message && !/fetch|network/i.test(err.message)) throw err;
        }
      }
      const raw = loadRaw();
      const brand = String(body.brandName || '').trim();
      if (!brand) throw new Error('Medicine name is required');
      const sup = raw.suppliers.find(s => s.id === body.supplierId);
      raw.shortbook.push({
        id: 'sb-' + Date.now(), medicine_id: null, brand_name: brand, pack_label: body.packLabel || '',
        supplier_id: sup ? sup.id : null, supplier_name: sup ? sup.name : 'Unassigned', supplier_phone: sup ? sup.phone : '',
        requested_strips: Math.max(1, parseInt(body.requestedStrips, 10) || 1),
        last_ptr: body.lastPtr != null ? Number(body.lastPtr) : null,
        last_scheme: body.lastScheme || '',
        note: body.note || '', source: 'MANUAL', status: 'OPEN'
      });
      saveRaw(raw);
      return computeFullStateFromRaw(raw);
    },

    async markShortbook(body) {
      body = body || {};
      if (isHttpBackend) {
        try {
          const res = await fetch('/api/shortbook/mark', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
          });
          const json = await res.json();
          if (!json.ok) throw new Error(json.error || 'Could not update the shortbook');
          return json.data;
        } catch (err) {
          if (err && err.message && !/fetch|network/i.test(err.message)) throw err;
        }
      }
      const raw = loadRaw();
      buildLocalV2(raw);
      const ids = body.ids || [];
      ids.forEach(id => {
        const item = raw.shortbook.find(s => s.id === id);
        if (!item) return;
        if (body.quantities && body.quantities[id] != null) item.requested_strips = Math.max(1, parseInt(body.quantities[id], 10) || 1);
        item.status = body.status || 'ORDERED';
      });
      saveRaw(raw);
      return computeFullStateFromRaw(raw);
    },

    async recordPayment(body) {
      body = body || {};
      if (isHttpBackend) {
        try {
          const res = await fetch('/api/credit/payment', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
          });
          const json = await res.json();
          if (!json.ok) throw new Error(json.error || 'Could not record the payment');
          return json.data;
        } catch (err) {
          if (err && err.message && !/fetch|network/i.test(err.message)) throw err;
        }
      }
      const raw = loadRaw();
      const customer = raw.customers.find(c => c.id === body.customerId);
      if (!customer) throw new Error('Customer account not found');
      const amount = Number(body.amount);
      if (!amount || amount <= 0) throw new Error('Enter a payment amount');
      if (amount > Number(customer.outstanding_balance) + 0.001) throw new Error('Payment is higher than the outstanding balance');
      customer.outstanding_balance = Number((Number(customer.outstanding_balance) - amount).toFixed(2));
      raw.creditTransactions.push({
        id: 'ctx-pay-' + Date.now(), customer_id: customer.id, txn_type: 'PAYMENT', amount,
        payment_mode: body.paymentMode || 'CASH', item_summary: 'Payment received',
        balance_after: customer.outstanding_balance, created_at: '2026-10-27 18:00:00'
      });
      saveRaw(raw);
      return computeFullStateFromRaw(raw);
    },

    async notifyRefill(id) {
      if (isHttpBackend) {
        try {
          const res = await fetch('/api/refills/' + id + '/notified', { method: 'POST' });
          const json = await res.json();
          if (!json.ok) throw new Error(json.error || 'Could not update the refill');
          return json.data;
        } catch (err) {
          if (err && err.message && !/fetch|network/i.test(err.message)) throw err;
        }
      }
      const raw = loadRaw();
      const row = raw.refills.find(r => r.id === id);
      if (!row) throw new Error('Refill schedule not found');
      row.status = 'NOTIFIED';
      saveRaw(raw);
      return computeFullStateFromRaw(raw);
    },

    async fulfillRefill(id) {
      if (isHttpBackend) {
        try {
          const res = await fetch('/api/refills/' + id + '/bill', { method: 'POST' });
          const json = await res.json();
          if (!json.ok) throw new Error(json.error || 'Could not bill the refill');
          return json.data;
        } catch (err) {
          if (err && err.message && !/fetch|network/i.test(err.message)) throw err;
        }
      }
      const raw = loadRaw();
      const row = raw.refills.find(r => r.id === id);
      if (!row) throw new Error('Refill schedule not found');
      const next = await window.StoreEngine.recordSale({
        medicineId: row.medicine_id,
        stripsSold: row.strips_qty,
        looseTabletsSold: row.loose_qty || 0,
        patientName: row.patient_name,
        customerPhone: row.phone,
        paymentMode: 'CASH'
      });
      const fresh = loadRaw();
      const saved = fresh.refills.find(r => r.id === id);
      if (saved) {
        saved.last_purchase_date = '2026-10-27';
        saved.next_due_date = addDays(saved.interval_days || 30);
        saved.status = 'ACTIVE';
        saveRaw(fresh);
        return computeFullStateFromRaw(fresh);
      }
      return next;
    },

    async saveSupplier(body, id) {
      body = body || {};
      if (isHttpBackend) {
        try {
          const res = await fetch(id ? '/api/suppliers/' + id : '/api/suppliers', {
            method: id ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
          });
          const json = await res.json();
          if (!json.ok) throw new Error(json.error || 'Could not save the supplier');
          return json.data;
        } catch (err) {
          if (err && err.message && !/fetch|network/i.test(err.message)) throw err;
        }
      }
      const raw = loadRaw();
      ensureCommercial(raw);
      const phone = phoneDigits(body.phone);
      if (phone.length !== 10) throw new Error('Mobile number must be 10 digits');
      const name = String(body.name || '').trim();
      if (!name) throw new Error('Supplier name is required');
      if (id) {
        const sup = raw.suppliers.find(s => s.id === id);
        if (!sup) throw new Error('Supplier not found');
        sup.name = name;
        sup.short_code = body.shortCode || sup.short_code || '';
        sup.phone = phone;
        sup.gstin = body.gstin || sup.gstin || '';
        sup.address = body.address || sup.address || '';
        sup.credit_days = parseInt(body.creditDays, 10) || sup.credit_days || 21;
        sup.cash_discount_pct = Number(body.cashDiscountPct) || 0;
      } else {
        raw.suppliers.push({
          id: 'sup-' + Date.now(), name: name, short_code: body.shortCode || '', gstin: body.gstin || '',
          phone: phone, address: body.address || 'Ujjain', credit_days: parseInt(body.creditDays, 10) || 21,
          cash_discount_pct: Number(body.cashDiscountPct) || 0, expiry_return_window_days: 60
        });
      }
      saveRaw(raw);
      return computeFullStateFromRaw(raw);
    },

    async saveOffer(body) {
      body = body || {};
      if (isHttpBackend) {
        try {
          const res = await fetch(body.id ? '/api/offers/' + body.id : '/api/offers', {
            method: body.id ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
          });
          const json = await res.json();
          if (!json.ok) throw new Error(json.error || 'Could not save the offer');
          return json.data;
        } catch (err) {
          if (err && err.message && !/fetch|network/i.test(err.message)) throw err;
        }
      }
      const raw = loadRaw();
      ensureCommercial(raw);
      const scheme = schemeParts(body.schemeLabel, body.buyQty, body.freeQty);
      const ptr = Number(body.buyPricePtr) || 0;
      const mrp = Number(body.mrp) || 0;
      const discount = Number(body.cashDiscountPct) || 0;
      const net = netBuyPrice(ptr, scheme.buy, scheme.free, discount);
      raw.supplierOffers.push({
        id: 'off-' + Date.now(), supplier_id: body.supplierId, medicine_id: body.medicineId || null,
        brand_name: body.brandName, salt_composition: body.saltComposition || '', buy_price_ptr: ptr, mrp: mrp,
        scheme_label: scheme.label, buy_qty: scheme.buy, free_qty: scheme.free, cash_discount_pct: discount,
        net_buy_price: net, retail_margin_pct: mrp > 0 ? round2(((mrp - net) / mrp) * 100) : 0,
        valid_until: body.validUntil || '2026-11-26', source: body.source || 'Manual Monthly Circular'
      });
      saveRaw(raw);
      return computeFullStateFromRaw(raw);
    },

    async orderOffer(id, body) {
      body = body || {};
      if (isHttpBackend) {
        try {
          const res = await fetch('/api/offers/' + id + '/shortbook', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
          });
          const json = await res.json();
          if (!json.ok) throw new Error(json.error || 'Could not send the deal to the shortbook');
          return json.data;
        } catch (err) {
          if (err && err.message && !/fetch|network/i.test(err.message)) throw err;
        }
      }
      const raw = loadRaw();
      ensureCommercial(raw);
      const offer = decorateOffers(raw.supplierOffers, raw.suppliers).find(row => row.id === id);
      if (!offer) throw new Error('Offer not found');
      return window.StoreEngine.addShortbook({
        brandName: offer.brand_name,
        supplierId: offer.supplier_id,
        requestedStrips: body.requestedStrips || 1,
        lastPtr: offer.net_buy_price,
        lastScheme: offer.scheme_label,
        note: 'Order this deal — ' + (offer.short_code || offer.supplier_name)
      });
    },

    async createRefill(body) {
      body = body || {};
      if (isHttpBackend) {
        try {
          const res = await fetch('/api/refills', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
          });
          const json = await res.json();
          if (!json.ok) throw new Error(json.error || 'Could not add the refill');
          return json.data;
        } catch (err) {
          if (err && err.message && !/fetch|network/i.test(err.message)) throw err;
        }
      }
      const raw = loadRaw();
      const med = raw.medicines.find(m => m.id === body.medicineId);
      if (!med) throw new Error('Refill medicine was not found');
      const phone = phoneDigits(body.phone);
      if (phone.length !== 10) throw new Error('Mobile number must be 10 digits');
      raw.refills.push({
        id: 'ref-' + Date.now(), patient_name: body.patientName, phone: phone, medicine_id: med.id,
        brand_name: med.brand_name, salt_composition: med.salt_composition, strips_qty: parseInt(body.stripsQty, 10) || 1,
        loose_qty: 0, interval_days: parseInt(body.intervalDays, 10) || 30, last_purchase_date: '2026-10-27',
        next_due_date: '2026-11-26', status: 'ACTIVE'
      });
      saveRaw(raw);
      return computeFullStateFromRaw(raw);
    },

    async unlock(body) {
      body = body || {};
      if (isHttpBackend) {
        try {
          const res = await fetch('/api/auth/unlock', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
          const json = await res.json();
          if (!json.ok) throw new Error(json.error || 'Unlock failed');
          return json;
        } catch (err) {
          if (err && err.message && !/fetch|network/i.test(err.message)) throw err;
        }
      }
      const raw = ensureV3(loadRaw());
      const method = String(body.method || 'pin');
      if (method === 'pin' && String(body.pin) !== String(raw.settings.owner_pin)) throw new Error('Wrong PIN');
      if (method === 'pattern' && String(body.pattern) !== String(raw.settings.admin_pattern)) throw new Error('Wrong pattern');
      if (method === 'biometric' && String(body.credentialId) !== String(raw.settings.biometric_credential_id)) throw new Error('Biometric credential does not match this store');
      return { ok: true, unlocked: true, method };
    },

    async registerBiometric(credentialId) {
      if (isHttpBackend) {
        try {
          const res = await fetch('/api/auth/webauthn/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ credentialId }) });
          const json = await res.json();
          if (!json.ok) throw new Error(json.error || 'Could not register biometrics');
          return json.data;
        } catch (err) {
          if (err && err.message && !/fetch|network/i.test(err.message)) throw err;
        }
      }
      const raw = ensureV3(loadRaw());
      raw.settings.biometric_credential_id = credentialId;
      raw.settings.biometric_enabled = 1;
      saveRaw(raw);
      return computeFullStateFromRaw(raw);
    },

    async scanStock(body) {
      body = body || {};
      if (isHttpBackend) {
        try {
          const res = await fetch('/api/ai/scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
          const json = await res.json();
          if (res.status === 429 || !json.ok) {
            const err = new Error(json.error || 'Scan failed');
            err.quota = json.quota;
            throw err;
          }
          return json;
        } catch (err) {
          if (err && err.message && !/fetch|network|quota|Gemini|scan/i.test(err.message)) throw err;
          if (err && err.quota) throw err;
          if (err && /quota|Gemini|Scan/i.test(err.message || '')) throw err;
        }
      }
      const raw = ensureV3(loadRaw());
      const limit = raw.aiUsage.monthly_limit || 300;
      if ((raw.aiUsage.calls_used || 0) >= limit) {
        const err = new Error('Monthly 300 AI scan quota reached (resets on the 1st of next month). Use voice entry or the manual rack form.');
        err.quota = { calls_used: raw.aiUsage.calls_used, monthly_limit: limit, remaining: 0, level: 'exhausted' };
        throw err;
      }
      raw.aiUsage.calls_used += 1;
      saveRaw(raw);
      const parsed = window.parseVoiceStockEntry ? window.parseVoiceStockEntry(body.rawText || body.transcript || '') : { brand_name: 'Dolo 650 Tablet', strips_qty: 10 };
      const item = body.rawText ? {
        brand_name: parsed.brand_name, strips_qty: parsed.strips_qty, rack_location: parsed.rack_location,
        batch_number: parsed.batch_number, expiry_date: parsed.expiry_date, ptr_per_strip: parsed.ptr_per_strip, mrp_per_strip: parsed.mrp_per_strip
      } : { brand_name: 'Dolo 650 Tablet', salt_composition: 'Paracetamol 650mg', strips_qty: 10, rack_location: 'Rack A-1', batch_number: 'DL552', expiry_date: '2027-08-31', ptr_per_strip: 24.5, mrp_per_strip: 33.8 };
      return { ok: true, provider: 'offline', parsed: { items: [item] }, quota: { calls_used: raw.aiUsage.calls_used, monthly_limit: limit, remaining: limit - raw.aiUsage.calls_used, level: 'ok' } };
    },

    async parseVoice(transcript) {
      if (isHttpBackend) {
        try {
          const res = await fetch('/api/voice/parse', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ transcript }) });
          const json = await res.json();
          if (json.ok) return json.parsed;
        } catch (_e) {}
      }
      if (!window.parseVoiceStockEntry) throw new Error('Voice parser missing');
      return window.parseVoiceStockEntry(transcript);
    },

    async addVoiceStock(transcript) {
      if (isHttpBackend) {
        try {
          const res = await fetch('/api/voice/add-stock', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ transcript }) });
          const json = await res.json();
          if (!json.ok) throw new Error(json.error || 'Could not add spoken stock');
          return json.data;
        } catch (err) {
          if (err && err.message && !/fetch|network/i.test(err.message)) throw err;
        }
      }
      const parsed = await this.parseVoice(transcript);
      return this.quickRackOnboard({
        brandName: parsed.brand_name,
        rackLocation: parsed.rack_location || 'Rack A-1',
        batchNumber: parsed.batch_number,
        expiryDate: parsed.expiry_date || '2027-08-31',
        stripsCount: parsed.strips_qty,
        looseTabletsCount: parsed.loose_qty,
        ptrPerStrip: parsed.ptr_per_strip,
        mrpPerStrip: parsed.mrp_per_strip
      });
    },

    async saveVoucher(body, id) {
      if (isHttpBackend) {
        try {
          const res = await fetch(id ? '/api/vouchers/' + id : '/api/vouchers', {
            method: id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
          });
          const json = await res.json();
          if (!json.ok) throw new Error(json.error || 'Could not save the voucher');
          return json.data;
        } catch (err) {
          if (err && err.message && !/fetch|network/i.test(err.message)) throw err;
        }
      }
      const raw = ensureV3(loadRaw());
      if (id) {
        const row = raw.vouchers.find(v => v.id === id);
        if (!row || row.status !== 'DRAFT') throw new Error('Only a draft voucher can be edited');
        row.items_json = JSON.stringify(body.items || []);
        row.customer_or_supplier = body.customerOrSupplier || row.customer_or_supplier;
        row.total_amount = body.totalAmount || row.total_amount;
        saveRaw(raw);
        return computeFullStateFromRaw(raw);
      }
      const n = 1000 + raw.vouchers.length + 1;
      raw.vouchers.unshift({
        id: 'vch-' + Date.now(), voucher_number: 'VCH-' + n, voucher_type: body.voucherType || 'SALE', status: 'DRAFT',
        customer_or_supplier: body.customerOrSupplier || '', customer_phone: body.customerPhone || '',
        items_json: JSON.stringify(body.items || []), total_amount: body.totalAmount || 0, payment_mode: body.paymentMode || 'CASH',
        created_by_role: body.createdByRole || 'EMPLOYEE', created_at: new Date().toISOString()
      });
      saveRaw(raw);
      return computeFullStateFromRaw(raw);
    },

    async finalizeVoucher(id) {
      if (isHttpBackend) {
        try {
          const res = await fetch('/api/vouchers/' + id + '/finalize', { method: 'POST' });
          const json = await res.json();
          if (!json.ok) throw new Error(json.error || 'Could not finalize the voucher');
          return json.data;
        } catch (err) {
          if (err && err.message && !/fetch|network/i.test(err.message)) throw err;
        }
      }
      const raw = ensureV3(loadRaw());
      const row = raw.vouchers.find(v => v.id === id);
      if (!row || row.status !== 'DRAFT') throw new Error('Only a draft voucher can be finalized');
      const items = JSON.parse(row.items_json || '[]');
      if (row.voucher_type === 'PURCHASE') {
        for (const item of items) {
          await this.quickRackOnboard({
            brandName: item.brandName || item.brand_name,
            stripsCount: item.stripsCount || item.strips_qty,
            rackLocation: item.rackLocation || item.rack_location,
            batchNumber: item.batchNumber || item.batch_number,
            expiryDate: item.expiryDate || item.expiry_date,
            ptrPerStrip: item.ptrPerStrip || item.ptr_per_strip,
            mrpPerStrip: item.mrpPerStrip || item.mrp_per_strip
          });
        }
        const again = ensureV3(loadRaw());
        const found = again.vouchers.find(v => v.id === id);
        if (found) { found.status = 'FINALIZED'; found.finalized_at = new Date().toISOString(); }
        saveRaw(again);
        return computeFullStateFromRaw(again);
      }
      for (const item of items) {
        await this.recordSale({
          medicineId: item.medicineId || item.medicine_id,
          stripsSold: item.strips || item.stripsSold || 0,
          looseTabletsSold: item.loose || item.looseTabletsSold || 0,
          patientName: item.patientName || row.customer_or_supplier,
          customerPhone: row.customer_phone,
          paymentMode: row.payment_mode || 'CASH'
        });
      }
      const again = ensureV3(loadRaw());
      const found = again.vouchers.find(v => v.id === id);
      if (found) { found.status = 'FINALIZED'; found.finalized_at = new Date().toISOString(); }
      saveRaw(again);
      return computeFullStateFromRaw(again);
    },

    async cancelVoucher(id) {
      if (isHttpBackend) {
        try {
          const res = await fetch('/api/vouchers/' + id + '/cancel', { method: 'POST' });
          const json = await res.json();
          if (!json.ok) throw new Error(json.error || 'Could not cancel the voucher');
          return json.data;
        } catch (err) {
          if (err && err.message && !/fetch|network/i.test(err.message)) throw err;
        }
      }
      const raw = ensureV3(loadRaw());
      const row = raw.vouchers.find(v => v.id === id);
      if (!row || row.status !== 'DRAFT') throw new Error('Only a draft voucher can be cancelled');
      row.status = 'CANCELLED';
      saveRaw(raw);
      return computeFullStateFromRaw(raw);
    },

    async saveExpense(body, id) {
      if (isHttpBackend) {
        try {
          const res = await fetch(id ? '/api/expenses/' + id : '/api/expenses', {
            method: id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
          });
          const json = await res.json();
          if (!json.ok) throw new Error(json.error || 'Could not save the expense');
          return json.data;
        } catch (err) {
          if (err && err.message && !/fetch|network/i.test(err.message)) throw err;
        }
      }
      const raw = ensureV3(loadRaw());
      if (id) {
        const row = raw.expenses.find(e => e.id === id);
        if (!row) throw new Error('Expense not found');
        Object.assign(row, { category: body.category || row.category, title: body.title || row.title, amount: Number(body.amount), expense_date: body.expenseDate || row.expense_date, note: body.note || '' });
      } else {
        raw.expenses.unshift({ id: 'exp-' + Date.now(), category: body.category || 'OTHER', title: body.title || body.category, employee_name: body.employeeName || '', amount: Number(body.amount), expense_date: body.expenseDate, payment_mode: 'CASH', note: body.note || '' });
      }
      saveRaw(raw);
      return computeFullStateFromRaw(raw);
    },

    async deleteExpense(id) {
      if (isHttpBackend) {
        try {
          const res = await fetch('/api/expenses/' + id, { method: 'DELETE' });
          const json = await res.json();
          if (!json.ok) throw new Error(json.error || 'Could not delete the expense');
          return json.data;
        } catch (err) {
          if (err && err.message && !/fetch|network/i.test(err.message)) throw err;
        }
      }
      const raw = ensureV3(loadRaw());
      raw.expenses = raw.expenses.filter(e => e.id !== id);
      saveRaw(raw);
      return computeFullStateFromRaw(raw);
    },

    async createExpiryReturn(body) {
      if (isHttpBackend) {
        try {
          const res = await fetch('/api/expiry-returns', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
          const json = await res.json();
          if (!json.ok) throw new Error(json.error || 'Could not create the return slip');
          return json.data;
        } catch (err) {
          if (err && err.message && !/fetch|network/i.test(err.message)) throw err;
        }
      }
      const raw = ensureV3(loadRaw());
      const batch = raw.rawBatches.find(b => b.id === body.batchId);
      const med = raw.medicines.find(m => m.id === (batch && batch.medicine_id)) || {};
      raw.expiryReturns.unshift({
        id: 'ret-' + Date.now(), return_slip_no: 'RET-' + (200 + raw.expiryReturns.length + 1),
        batch_id: body.batchId, medicine_id: med.id, brand_name: med.brand_name || '', batch_number: batch ? batch.batch_number : '',
        supplier_name: 'Supplier', strips_returned: body.stripsReturned || 0, loose_returned: 0,
        ptr_per_strip: batch ? batch.ptr_per_strip : 0, ptr_value: (body.stripsReturned || 0) * (batch ? batch.ptr_per_strip : 0),
        status: 'PENDING', credit_note_no: ''
      });
      saveRaw(raw);
      return computeFullStateFromRaw(raw);
    },

    async updateExpiryReturn(id, body) {
      if (isHttpBackend) {
        try {
          const res = await fetch('/api/expiry-returns/' + id + '/status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
          const json = await res.json();
          if (!json.ok) throw new Error(json.error || 'Could not update the return');
          return json.data;
        } catch (err) {
          if (err && err.message && !/fetch|network/i.test(err.message)) throw err;
        }
      }
      const raw = ensureV3(loadRaw());
      const row = raw.expiryReturns.find(r => r.id === id);
      if (!row) throw new Error('Return slip not found');
      row.status = body.status;
      if (body.status === 'ADJUSTED') {
        row.credit_note_no = body.creditNoteNo || '';
        const batch = raw.rawBatches.find(b => b.id === row.batch_id);
        if (batch) {
          batch.strips_count = Math.max(0, batch.strips_count - row.strips_returned);
          batch.is_return_claimed = 1;
        }
      }
      saveRaw(raw);
      return computeFullStateFromRaw(raw);
    },

    async clearZero() {
      if (isHttpBackend) {
        try {
          const res = await fetch('/api/demo/clear-zero', { method: 'POST' });
          const json = await res.json();
          if (json.ok) return json.data;
        } catch (_e) {}
      }
      const raw = ensureV3(loadRaw());
      const suppliers = raw.suppliers;
      const settings = raw.settings;
      settings.tutorial_completed = 0;
      const blank = {
        settings, suppliers, medicines: [], invoices: [], rawBatches: [], sales: [], audits: [],
        customers: [], creditTransactions: [], refills: [], shortbook: [], invoiceItems: [],
        supplierOffers: [], expenses: [], vouchers: [], expiryReturns: [],
        aiUsage: { year_month: raw.aiUsage.year_month, calls_used: 0, monthly_limit: 300 },
        sampleTemplates: raw.sampleTemplates
      };
      saveRaw(blank);
      return computeFullStateFromRaw(blank);
    },

    async resetDemo() {
      if (isHttpBackend) {
        try {
          const res = await fetch('/api/reset-demo', { method: 'POST' });
          const json = await res.json();
          if (json.ok) return json.data;
        } catch (_e) {}
      }
      const init = getInitialLocalRaw();
      saveRaw(init);
      return computeFullStateFromRaw(init);
    }
  };
})();
