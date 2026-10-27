const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { db, seedDatabase } = require('../db/database');
const { deductSaleFEFO, undoSaleEntry } = require('../services/fefoService');
const modules = require('../services/storeModules');
const { SAMPLE_TEMPLATES, runTesseractOnFile, parseRawTextToInvoice } = require('../services/ocrParserService');

const router = express.Router();

const uploadDir = path.join(__dirname, '../../public/uploads/bills');
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '.jpg') || '.jpg';
    cb(null, 'bill-' + Date.now() + ext);
  }
});
const upload = multer({ storage });

function computeDaysToExpiry(expiryDateStr) {
  const ref = new Date('2026-10-27T00:00:00Z').getTime();
  const exp = new Date(expiryDateStr + 'T00:00:00Z').getTime();
  if (Number.isNaN(exp)) return 90;
  return Math.ceil((exp - ref) / 86400000);
}

function getFullState() {
  const settings = db.prepare('SELECT * FROM store_settings WHERE id = 1').get();
  const suppliers = db.prepare('SELECT * FROM suppliers ORDER BY name ASC').all();
  const medicines = db.prepare('SELECT * FROM medicines ORDER BY brand_name ASC').all();
  const invoices = db.prepare('SELECT * FROM purchase_invoices ORDER BY created_at DESC').all();
  const sales = db.prepare('SELECT * FROM sales_entries ORDER BY sold_at DESC LIMIT 100').all();
  const audits = db.prepare('SELECT * FROM stock_audits ORDER BY audited_at DESC LIMIT 100').all();

  const rawBatches = db.prepare(`
    SELECT
      b.*,
      m.brand_name,
      m.salt_composition,
      m.manufacturer,
      m.pack_label,
      m.rack_location,
      m.schedule_type,
      m.min_reorder_strips,
      s.name AS supplier_name,
      s.phone AS supplier_phone,
      s.gstin AS supplier_gstin,
      pi.invoice_number,
      pi.bill_photo_url
    FROM inventory_batches b
    JOIN medicines m ON m.id = b.medicine_id
    LEFT JOIN suppliers s ON s.id = b.supplier_id
    LEFT JOIN purchase_invoices pi ON pi.id = b.purchase_invoice_id
    ORDER BY b.expiry_date ASC
  `).all();

  const alertDays = settings ? settings.expiry_alert_days : 60;

  const batches = rawBatches.map(b => {
    const daysToExpiry = computeDaysToExpiry(b.expiry_date);
    const packSize = b.pack_size_units || 10;
    const totalUnits = b.strips_count * packSize + b.loose_tablets_count;
    const eqStrips = b.strips_count + (b.loose_tablets_count / packSize);
    const ptrValue = Number((eqStrips * b.ptr_per_strip).toFixed(2));
    const mrpValue = Number((eqStrips * b.mrp_per_strip).toFixed(2));
    return {
      ...b,
      days_to_expiry: daysToExpiry,
      total_units: totalUnits,
      ptr_value: ptrValue,
      mrp_value: mrpValue,
      is_expiring_soon: daysToExpiry <= alertDays && !b.is_return_claimed && totalUnits > 0,
      is_low_stock: b.strips_count < b.min_reorder_strips
    };
  });

  const expiringBatches = batches.filter(b => b.is_expiring_soon);
  const lowStockBatches = batches.filter(b => b.is_low_stock);

  // Build supplier-grouped WhatsApp expiry return summary
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

  const whatsappReturnSummary = Object.values(supplierGroups).map(g => {
    const lines = [
      `*EXPIRY RETURN / CREDIT NOTE CLAIM*`,
      `From: *${settings.store_name}*`,
      `अक्षय मेडिकोज़, उज्जैन`,
      `(${settings.city})`,
      `To: *${g.supplierName}*`,
      `Return Window: Within ${alertDays} Days of Expiry`,
      `----------------------------------------`,
      ...g.items.map((it, idx) =>
        `${idx + 1}. *${it.brand_name}* | Batch: ${it.batch_number} | Exp: ${it.expiry_date} (${it.days_to_expiry}d) | Qty: ${it.strips_count} Strips + ${it.loose_tablets_count} Loose | Bill: ${it.invoice_number || 'N/A'} | PTR Credit: Rs.${it.ptr_value}`
      ),
      `----------------------------------------`,
      `*Total Credit Note Claim (PTR): Rs.${g.totalCreditValuePtr.toLocaleString('en-IN')}*`,
      `Please collect return goods on next delivery visit.`
    ];
    return {
      ...g,
      whatsappText: lines.join('\n')
    };
  });

  const activeSales = sales.filter(s => !s.is_cancelled);
  const todaySalesAmount = Number(activeSales.reduce((acc, s) => acc + s.billed_amount, 0).toFixed(2));
  const totalPtrValue = Number(batches.reduce((acc, b) => acc + b.ptr_value, 0).toFixed(2));
  const totalMrpValue = Number(batches.reduce((acc, b) => acc + b.mrp_value, 0).toFixed(2));
  const expiringPtrValue = Number(expiringBatches.reduce((acc, b) => acc + b.ptr_value, 0).toFixed(2));
  const extra = modules.v2Payload();
  const avgMarginPercent = totalMrpValue > 0
    ? Number((((totalMrpValue - totalPtrValue) / totalMrpValue) * 100).toFixed(1))
    : 0;

  return {
    settings,
    kpis: {
      totalActiveBatches: batches.filter(b => b.total_units > 0).length,
      totalPtrValue,
      totalMrpValue,
      avgMarginPercent,
      expiringCount: expiringBatches.length,
      expiringPtrValue,
      lowStockCount: lowStockBatches.length,
      todaySalesCount: activeSales.length,
      todaySalesAmount,
      pendingCreditBalance: extra.pendingCreditBalance,
      dueRefillCount: extra.dueRefillCount,
      shortbookCount: extra.shortbookCount
    },
    suppliers,
    medicines: medicines.map(m => ({ ...m, min_stock_strips: m.min_reorder_strips })),
    invoices,
    invoiceItems: extra.invoiceItems,
    shortbook: extra.shortbook,
    customers: extra.customers,
    creditTransactions: extra.creditTransactions,
    refills: extra.refills,
    batches,
    expiringBatches,
    whatsappReturnSummary,
    sales,
    audits,
    sampleTemplates: SAMPLE_TEMPLATES
  };
}

router.get('/bootstrap', (_req, res) => {
  try {
    res.json({ ok: true, data: getFullState() });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.put('/settings', (req, res) => {
  try {
    const { expiry_alert_days, store_name, city, drug_license_no, gstin, default_language, owner_pin } = req.body;
    const current = db.prepare('SELECT * FROM store_settings WHERE id = 1').get();
    const newAlertDays = expiry_alert_days !== undefined
      ? Math.min(365, Math.max(5, parseInt(expiry_alert_days, 10) || 60))
      : current.expiry_alert_days;

    let newPin = current.owner_pin || '1234';
    if (owner_pin !== undefined && owner_pin !== null && String(owner_pin).trim() !== '') {
      const pin = String(owner_pin).trim();
      if (!/^\d{4}$/.test(pin)) {
        throw new Error('Owner PIN must be 4 digits');
      }
      newPin = pin;
    }

    db.prepare(`
      UPDATE store_settings
      SET expiry_alert_days = ?,
          store_name = ?,
          city = ?,
          drug_license_no = ?,
          gstin = ?,
          default_language = ?,
          owner_pin = ?,
          updated_at = datetime('now')
      WHERE id = 1
    `).run(
      newAlertDays,
      store_name || current.store_name,
      city || current.city,
      drug_license_no || current.drug_license_no,
      gstin || current.gstin,
      default_language || current.default_language,
      newPin
    );

    res.json({ ok: true, data: getFullState() });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.post('/ocr/parse', upload.single('billPhoto'), (req, res) => {
  try {
    const { templateId, rawText } = req.body || {};
    if (templateId && SAMPLE_TEMPLATES[templateId]) {
      return res.json({
        ok: true,
        parsed: JSON.parse(JSON.stringify(SAMPLE_TEMPLATES[templateId]))
      });
    }

    let photoUrl = '/uploads/bills/mpa-26-1842.svg';
    let ocrText = rawText || '';

    if (req.file) {
      photoUrl = '/uploads/bills/' + req.file.filename;
      const extracted = runTesseractOnFile(req.file.path);
      if (extracted) {
        ocrText = extracted + (ocrText ? '\n' + ocrText : '');
      }
    }

    const parsed = parseRawTextToInvoice(ocrText, photoUrl);
    res.json({ ok: true, parsed });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.post('/invoices', (req, res) => {
  try {
    const {
      supplierId,
      supplierName,
      gstin,
      invoiceNumber,
      invoiceDate,
      paymentStatus,
      billPhotoUrl,
      items
    } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      throw new Error('Invoice must include at least one medicine line item.');
    }

    const invId = 'inv-' + Date.now();
    let subtotal = 0;
    let totalGst = 0;

    const tx = db.transaction(() => {
      let supId = supplierId;
      if (!supId) {
        const existingSup = db.prepare('SELECT id FROM suppliers WHERE LOWER(name) = LOWER(?)').get(supplierName || 'Mahakal Pharma Agency, Ujjain');
        if (existingSup) {
          supId = existingSup.id;
        } else {
          supId = 'sup-' + Date.now();
          db.prepare(`
            INSERT INTO suppliers (id, name, gstin, phone, address, credit_days, expiry_return_window_days)
            VALUES (?, ?, ?, '+91 94250 00000', 'Ujjain, MP', 21, 60)
          `).run(supId, supplierName || 'New Ujjain Stockist', gstin || '23AABCM0000A1Z1');
        }
      }

      for (const item of items) {
        const strips = Math.max(1, parseInt(item.stripsCount, 10) || 10);
        const ptr = Math.max(1, parseFloat(item.ptrPerStrip) || 80);
        const gstPct = parseFloat(item.gstPercent) || 12;
        const lineSub = strips * ptr;
        subtotal += lineSub;
        totalGst += lineSub * (gstPct / 100);
      }

      const grandTotal = Number((subtotal + totalGst).toFixed(2));

      db.prepare(`
        INSERT INTO purchase_invoices (
          id, supplier_id, supplier_name, supplier_gstin, invoice_number, invoice_date,
          bill_photo_url, ocr_raw_json, subtotal_amount, gst_amount, total_amount,
          payment_status, verified_by_owner
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      `).run(
        invId,
        supId,
        supplierName || 'Mahakal Pharma Agency, Ujjain',
        gstin || '23AABCM4821E1Z4',
        invoiceNumber || ('INV-' + Date.now().toString().slice(-4)),
        invoiceDate || '2026-10-27',
        billPhotoUrl || '/uploads/bills/mpa-26-1842.svg',
        JSON.stringify(items),
        Number(subtotal.toFixed(2)),
        Number(totalGst.toFixed(2)),
        grandTotal,
        paymentStatus || 'CREDIT'
      );

      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const brand = (it.brandName || 'Medicine Tab').trim();
        let med = db.prepare('SELECT * FROM medicines WHERE LOWER(brand_name) = LOWER(?)').get(brand);
        const packUnits = Math.max(1, parseInt(it.packSizeUnits, 10) || 10);

        if (!med) {
          const medId = 'med-' + Date.now() + '-' + i;
          db.prepare(`
            INSERT INTO medicines (
              id, brand_name, salt_composition, manufacturer, pack_size_units,
              pack_label, rack_location, schedule_type, gst_percent, min_reorder_strips
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 10)
          `).run(
            medId,
            brand,
            it.saltComposition || 'Standard Composition',
            it.manufacturer || 'Standard Pharma',
            packUnits,
            it.packLabel || `1x${packUnits} Tabs`,
            it.rackLocation || 'Rack A-1',
            it.scheduleType || 'H',
            parseFloat(it.gstPercent) || 12
          );
          med = { id: medId, pack_size_units: packUnits };
        } else if (it.rackLocation) {
          db.prepare('UPDATE medicines SET rack_location = ? WHERE id = ?').run(it.rackLocation, med.id);
        }

        const totalStrips = (parseInt(it.stripsCount, 10) || 0) + (parseInt(it.freeStrips, 10) || 0);
        const batchId = 'b-' + Date.now() + '-' + i;
        db.prepare(`
          INSERT INTO inventory_batches (
            id, medicine_id, supplier_id, purchase_invoice_id, batch_number, expiry_date,
            pack_size_units, strips_count, loose_tablets_count, free_strips_received,
            ptr_per_strip, mrp_per_strip, gst_percent
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          batchId,
          med.id,
          supId,
          invId,
          it.batchNumber || ('B' + (100 + i)),
          it.expiryDate || '2027-09-30',
          packUnits,
          totalStrips,
          parseInt(it.looseTabletsCount, 10) || 0,
          parseInt(it.freeStrips, 10) || 0,
          parseFloat(it.ptrPerStrip) || 85,
          parseFloat(it.mrpPerStrip) || 120,
          parseFloat(it.gstPercent) || 12
        );
        modules.insertPurchaseLine({
          invoiceId: invId,
          batchId,
          medicineId: med.id,
          item: it,
          packUnits,
          index: i
        });
      }
    });

    tx();
    res.json({ ok: true, invoiceId: invId, data: getFullState() });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.post('/onboarding/quick-rack', (req, res) => {
  try {
    const {
      rackLocation,
      brandName,
      saltComposition,
      packSizeUnits,
      scheduleType,
      batchNumber,
      expiryDate,
      stripsCount,
      looseTabletsCount,
      ptrPerStrip,
      mrpPerStrip,
      supplierId
    } = req.body;

    if (!brandName || !brandName.trim()) {
      throw new Error('Brand name is required for Quick Rack Onboarding.');
    }

    const packUnits = Math.max(1, parseInt(packSizeUnits, 10) || 10);
    const strips = Math.max(0, parseInt(stripsCount, 10) || 0);
    const loose = Math.max(0, parseInt(looseTabletsCount, 10) || 0);
    const ptr = Math.max(1, parseFloat(ptrPerStrip) || 75);
    const mrp = Math.max(ptr, parseFloat(mrpPerStrip) || 110);

    const tx = db.transaction(() => {
      let med = db.prepare('SELECT * FROM medicines WHERE LOWER(brand_name) = LOWER(?)').get(brandName.trim());
      if (!med) {
        const medId = 'med-' + Date.now();
        db.prepare(`
          INSERT INTO medicines (
            id, brand_name, salt_composition, manufacturer, pack_size_units,
            pack_label, rack_location, schedule_type, gst_percent, min_reorder_strips
          ) VALUES (?, ?, ?, 'Shelf Onboarded', ?, ?, ?, ?, 12, 10)
        `).run(
          medId,
          brandName.trim(),
          (saltComposition || 'Generic Salt Composition').trim(),
          packUnits,
          `1x${packUnits} Units`,
          rackLocation || 'Rack A-1',
          scheduleType || 'H'
        );
        med = { id: medId };
      } else if (rackLocation) {
        db.prepare('UPDATE medicines SET rack_location = ? WHERE id = ?').run(rackLocation, med.id);
      }

      db.prepare(`
        INSERT INTO inventory_batches (
          id, medicine_id, supplier_id, purchase_invoice_id, batch_number, expiry_date,
          pack_size_units, strips_count, loose_tablets_count, free_strips_received,
          ptr_per_strip, mrp_per_strip, gst_percent
        ) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, 0, ?, ?, 12)
      `).run(
        'b-onboard-' + Date.now(),
        med.id,
        supplierId || 'sup-1',
        (batchNumber || 'SHLF-' + String(Math.floor(100 + Math.random() * 899))).trim(),
        expiryDate || '2027-08-31',
        packUnits,
        strips,
        loose,
        ptr,
        mrp
      );
    });

    tx();
    res.json({ ok: true, data: getFullState() });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.get('/substitutes', (req, res) => {
  try {
    const { medicineId, salt } = req.query;
    let targetSalt = salt || '';
    let sourceMed = null;

    if (medicineId) {
      sourceMed = db.prepare('SELECT * FROM medicines WHERE id = ?').get(medicineId);
      if (sourceMed) targetSalt = sourceMed.salt_composition;
    }

    if (!targetSalt) {
      return res.json({ ok: true, targetSalt: '', substitutes: [] });
    }

    const primaryKeyword = targetSalt.split('+')[0].trim().split(' ')[0].trim();
    const matches = db.prepare(`
      SELECT
        b.*,
        m.brand_name,
        m.salt_composition,
        m.manufacturer,
        m.rack_location,
        m.pack_label,
        m.schedule_type
      FROM inventory_batches b
      JOIN medicines m ON m.id = b.medicine_id
      WHERE (LOWER(m.salt_composition) = LOWER(?) OR LOWER(m.salt_composition) LIKE LOWER(?))
        AND (b.strips_count > 0 OR b.loose_tablets_count > 0)
      ORDER BY b.mrp_per_strip ASC, b.expiry_date ASC
    `).all(targetSalt, `%${primaryKeyword}%`);

    res.json({
      ok: true,
      sourceMedicine: sourceMed,
      targetSalt,
      substitutes: (() => {
        const enriched = matches.map(m => {
          const margin = m.mrp_per_strip > 0
            ? ((m.mrp_per_strip - m.ptr_per_strip) / m.mrp_per_strip) * 100
            : 0;
          const days = computeDaysToExpiry(m.expiry_date);
          return {
            ...m,
            days_to_expiry: days,
            margin_percent: Number(margin.toFixed(1)),
            sell_first: days <= 90,
            total_units: m.strips_count * m.pack_size_units + m.loose_tablets_count
          };
        });
        const top = enriched.reduce((max, row) => Math.max(max, row.margin_percent), 0);
        return enriched.map(row => ({ ...row, highest_margin: top > 0 && row.margin_percent === top }));
      })()
    });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.put('/batches/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { strips_count, loose_tablets_count, rack_location, expiry_date, ptr_per_strip, mrp_per_strip, is_return_claimed } = req.body;
    const batch = db.prepare('SELECT * FROM inventory_batches WHERE id = ?').get(id);
    if (!batch) throw new Error('Batch not found');

    db.prepare(`
      UPDATE inventory_batches
      SET strips_count = ?,
          loose_tablets_count = ?,
          expiry_date = ?,
          ptr_per_strip = ?,
          mrp_per_strip = ?,
          is_return_claimed = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `).run(
      strips_count !== undefined ? parseInt(strips_count, 10) : batch.strips_count,
      loose_tablets_count !== undefined ? parseInt(loose_tablets_count, 10) : batch.loose_tablets_count,
      expiry_date || batch.expiry_date,
      ptr_per_strip !== undefined ? parseFloat(ptr_per_strip) : batch.ptr_per_strip,
      mrp_per_strip !== undefined ? parseFloat(mrp_per_strip) : batch.mrp_per_strip,
      is_return_claimed !== undefined ? (is_return_claimed ? 1 : 0) : batch.is_return_claimed,
      id
    );

    if (rack_location) {
      db.prepare('UPDATE medicines SET rack_location = ? WHERE id = ?').run(rack_location, batch.medicine_id);
    }

    res.json({ ok: true, data: getFullState() });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.post('/sales', (req, res) => {
  try {
    const body = req.body || {};
    const paymentMode = String(body.paymentMode || 'CASH').toUpperCase();
    if (!['CASH', 'UPI', 'CREDIT'].includes(paymentMode)) {
      throw new Error('Payment mode must be Cash, UPI, or Credit Account');
    }
    const sale = deductSaleFEFO({ ...body, paymentMode });
    try {
      if (paymentMode === 'CREDIT') {
        modules.postCreditForSale({
          sale,
          name: body.patientName || body.customerName,
          phone: body.customerPhone
        });
      }
      if (body.scheduleRefill) {
        modules.createRefill({
          patientName: body.patientName || body.customerName,
          phone: body.customerPhone,
          medicineId: sale.medicine_id,
          stripsQty: sale.strips_sold,
          looseQty: sale.loose_tablets_sold,
          intervalDays: body.refillIntervalDays || 30
        });
      }
    } catch (err) {
      try { undoSaleEntry(sale.id); } catch (_undoErr) { /* stock restore is best-effort */ }
      try { modules.reverseCreditForSale(sale.id); } catch (_revErr) { /* ledger restore is best-effort */ }
      throw err;
    }
    const saved = db.prepare('SELECT * FROM sales_entries WHERE id = ?').get(sale.id);
    res.json({ ok: true, sale: saved, data: getFullState() });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.post('/sales/:id/customer', (req, res) => {
  try {
    const { buildCustomerReceipt, normalizePhone } = require('../services/receiptService');
    const sale = db.prepare('SELECT * FROM sales_entries WHERE id = ?').get(req.params.id);
    if (!sale) throw new Error('Sale entry not found');

    const body = req.body || {};
    const nextName = body.patientName !== undefined
      ? String(body.patientName || '')
      : (body.customerName !== undefined ? String(body.customerName || '') : (sale.patient_name || ''));
    const nextDoctor = body.doctorName !== undefined ? String(body.doctorName || '') : (sale.doctor_name || '');
    const nextPhone = body.customerPhone !== undefined
      ? normalizePhone(body.customerPhone)
      : (sale.customer_phone || '');

    db.prepare(`
      UPDATE sales_entries
      SET patient_name = ?, customer_phone = ?, doctor_name = ?
      WHERE id = ?
    `).run(nextName || null, nextPhone || null, nextDoctor || null, sale.id);

    const updated = db.prepare('SELECT * FROM sales_entries WHERE id = ?').get(sale.id);
    const batch = db.prepare('SELECT expiry_date, mrp_per_strip, ptr_per_strip FROM inventory_batches WHERE id = ?').get(updated.batch_id);
    const settings = db.prepare('SELECT * FROM store_settings WHERE id = 1').get();
    const receipt = buildCustomerReceipt({
      storeName: settings.store_name,
      city: settings.city,
      sale: updated,
      expiryDate: batch ? batch.expiry_date : ''
    });
    res.json({ ok: true, sale: updated, receiptText: receipt.text, whatsappUrl: receipt.whatsappUrl, data: getFullState() });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.post('/sales/:id/undo', (req, res) => {
  try {
    const restored = undoSaleEntry(req.params.id);
    modules.reverseCreditForSale(req.params.id);
    res.json({ ok: true, restored, data: getFullState() });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.post('/audits', (req, res) => {
  try {
    const { batchId, countedStrips, countedLooseTablets, auditNote } = req.body;
    const batch = db.prepare(`
      SELECT b.*, m.brand_name, m.rack_location
      FROM inventory_batches b
      JOIN medicines m ON m.id = b.medicine_id
      WHERE b.id = ?
    `).get(batchId);

    if (!batch) throw new Error('Batch not found for audit');

    const cStrips = Math.max(0, parseInt(countedStrips, 10) || 0);
    const cLoose = Math.max(0, parseInt(countedLooseTablets, 10) || 0);
    const varStrips = cStrips - batch.strips_count;
    const varLoose = cLoose - batch.loose_tablets_count;
    const auditId = 'aud-' + Date.now();

    const tx = db.transaction(() => {
      db.prepare(`
        INSERT INTO stock_audits (
          id, batch_id, medicine_id, brand_name, batch_number, rack_location,
          expected_strips, expected_loose_tablets, counted_strips, counted_loose_tablets,
          variance_strips, variance_loose_tablets, audit_note, audited_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+5 hours', '+30 minutes'))
      `).run(
        auditId,
        batch.id,
        batch.medicine_id,
        batch.brand_name,
        batch.batch_number,
        batch.rack_location,
        batch.strips_count,
        batch.loose_tablets_count,
        cStrips,
        cLoose,
        varStrips,
        varLoose,
        auditNote || 'Physical shelf stock count reconciled'
      );

      db.prepare(`
        UPDATE inventory_batches
        SET strips_count = ?, loose_tablets_count = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(cStrips, cLoose, batch.id);
    });

    tx();
    res.json({ ok: true, auditId, data: getFullState() });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.get('/setup-info', (req, res) => {
  const os = require('os');
  const port = Number(process.env.PORT || 3456);
  const ips = [];
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      const family = net.family === 4 || net.family === 'IPv4';
      if (family && !net.internal) ips.push(net.address);
    }
  }
  const hostHeader = req.get('host') || `127.0.0.1:${port}`;
  const hostname = hostHeader.split(':')[0];
  const local = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  const requestBase = `${req.protocol}://${hostHeader}`;
  const suggestedBase = !local ? requestBase : (ips[0] ? `http://${ips[0]}:${port}` : requestBase);
  const apkPath = '/download/UjjainMedStore-v1.0.apk';
  const { GITHUB_RAW_APK, GITHUB_RELEASE_APK } = require('../apkLinks');
  const localApkUrl = suggestedBase.replace(/\/$/, '') + apkPath;
  res.json({
    ok: true,
    port,
    ips,
    suggestedBase,
    apkPath,
    webPath: '/',
    installPath: '/install',
    apkUrl: localApkUrl,
    localApkUrl,
    githubApkUrl: GITHUB_RAW_APK,
    githubRawApkUrl: GITHUB_RAW_APK,
    githubReleaseApkUrl: GITHUB_RELEASE_APK,
    recommendedApkUrl: local ? GITHUB_RAW_APK : localApkUrl,
    webUrl: suggestedBase.replace(/\/$/, '') + '/',
    installUrl: suggestedBase.replace(/\/$/, '') + '/install'
  });
});

router.get('/invoices/search', (req, res) => {
  try {
    const invoices = modules.searchInvoices({
      q: req.query.q || '',
      status: req.query.status || 'ALL',
      from: req.query.from || '',
      to: req.query.to || ''
    });
    res.json({ ok: true, invoices });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.get('/invoices/:id', (req, res) => {
  try {
    const found = modules.searchInvoices({}).find(inv => inv.id === req.params.id);
    if (!found) return res.status(404).json({ ok: false, error: 'Invoice not found' });
    res.json({ ok: true, invoice: found });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.post('/invoices/:id/payment', (req, res) => {
  try {
    const invoice = modules.setInvoicePayment(req.params.id, req.body || {});
    res.json({ ok: true, invoice, data: getFullState() });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.post('/shortbook', (req, res) => {
  try {
    const item = modules.addShortbook(req.body || {});
    res.json({ ok: true, item, data: getFullState() });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.post('/shortbook/sync', (_req, res) => {
  try {
    modules.syncShortbook();
    res.json({ ok: true, data: getFullState() });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.post('/shortbook/mark', (req, res) => {
  try {
    const result = modules.markShortbook(req.body || {});
    res.json({ ok: true, result, data: getFullState() });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.get('/shortbook/order', (req, res) => {
  try {
    const supplierId = req.query.supplierId || req.query.supplier || '';
    if (!supplierId) throw new Error('supplierId is required');
    res.json({ ok: true, ...modules.orderPack(supplierId) });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.post('/credit/payment', (req, res) => {
  try {
    const customer = modules.recordPayment(req.body || {});
    res.json({ ok: true, customer, data: getFullState() });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.get('/credit/:customerId/statement', (req, res) => {
  try {
    res.json({ ok: true, ...modules.statementText(req.params.customerId) });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.post('/refills', (req, res) => {
  try {
    const refill = modules.createRefill(req.body || {});
    res.json({ ok: true, refill, data: getFullState() });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.get('/refills/:id/alert', (req, res) => {
  try {
    res.json({ ok: true, ...modules.refillAlert(req.params.id) });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.post('/refills/:id/notified', (req, res) => {
  try {
    const refill = modules.markRefillNotified(req.params.id);
    res.json({ ok: true, refill, data: getFullState() });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.post('/refills/:id/bill', (req, res) => {
  try {
    const result = modules.fulfillRefill(req.params.id);
    res.json({ ok: true, ...result, data: getFullState() });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.get('/qr.svg', (req, res) => {
  const { makeQrSvg } = require('../qrSvg');
  const data = String(req.query.text || req.query.data || '').slice(0, 1800);
  if (!data) return res.status(400).type('text/plain').send('missing text');
  res.type('image/svg+xml').send(makeQrSvg(data));
});

router.post('/reset-demo', (_req, res) => {
  try {
    seedDatabase(true);
    res.json({ ok: true, data: getFullState() });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
