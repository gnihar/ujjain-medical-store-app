const { db } = require('../db/database');

/**
 * Deducts strips and/or loose tablets using FEFO (First-Expiry-First-Out)
 * Automatically opens sealed strips when loose tablets are needed.
 */
function deductSaleFEFO({ medicineId, batchId, stripsSold = 0, looseTabletsSold = 0, patientName = '', doctorName = '', customerPhone = '', paymentMode = 'CASH' }) {
  const sSold = Math.max(0, parseInt(stripsSold, 10) || 0);
  const lSold = Math.max(0, parseInt(looseTabletsSold, 10) || 0);

  if (sSold === 0 && lSold === 0) {
    throw new Error('Please enter at least 1 Strip or 1 Loose Tablet to deduct.');
  }

  let targetBatch;
  if (batchId) {
    targetBatch = db.prepare(`
      SELECT b.*, m.brand_name, m.rack_location, m.pack_size_units as med_pack_size
      FROM inventory_batches b
      JOIN medicines m ON m.id = b.medicine_id
      WHERE b.id = ?
    `).get(batchId);
  } else {
    targetBatch = db.prepare(`
      SELECT b.*, m.brand_name, m.rack_location, m.pack_size_units as med_pack_size
      FROM inventory_batches b
      JOIN medicines m ON m.id = b.medicine_id
      WHERE b.medicine_id = ?
        AND (b.strips_count * b.pack_size_units + b.loose_tablets_count) >= (? * b.pack_size_units + ?)
      ORDER BY b.expiry_date ASC
      LIMIT 1
    `).get(medicineId, sSold, lSold);

    if (!targetBatch) {
      targetBatch = db.prepare(`
        SELECT b.*, m.brand_name, m.rack_location, m.pack_size_units as med_pack_size
        FROM inventory_batches b
        JOIN medicines m ON m.id = b.medicine_id
        WHERE b.medicine_id = ?
          AND (b.strips_count > 0 OR b.loose_tablets_count > 0)
        ORDER BY b.expiry_date ASC
        LIMIT 1
      `).get(medicineId);
    }
  }

  if (!targetBatch) {
    throw new Error('Selected medicine is out of stock across all batches. Use Salt Substitute Finder!');
  }

  const packSize = targetBatch.pack_size_units || targetBatch.med_pack_size || 10;
  const requestedUnits = sSold * packSize + lSold;
  const availableUnits = targetBatch.strips_count * packSize + targetBatch.loose_tablets_count;

  if (requestedUnits > availableUnits) {
    throw new Error(`Insufficient stock in batch ${targetBatch.batch_number}: requested ${requestedUnits} units, available ${availableUnits} units (${targetBatch.strips_count} strips + ${targetBatch.loose_tablets_count} loose).`);
  }

  // Calculate exact strip + loose math
  let newStrips = targetBatch.strips_count - sSold;
  let newLoose = targetBatch.loose_tablets_count - lSold;
  let stripsOpened = 0;

  while (newLoose < 0 && newStrips > 0) {
    newStrips -= 1;
    newLoose += packSize;
    stripsOpened += 1;
  }

  if (newStrips < 0 || newLoose < 0) {
    const remainingTotal = availableUnits - requestedUnits;
    newStrips = Math.floor(remainingTotal / packSize);
    newLoose = remainingTotal % packSize;
  }

  const billedAmount = Number(((requestedUnits / packSize) * targetBatch.mrp_per_strip).toFixed(2));
  const daysLeft = Math.ceil((new Date(targetBatch.expiry_date).getTime() - new Date('2026-10-27').getTime()) / 86400000);

  const noteParts = [`FEFO Batch ${targetBatch.batch_number} (${daysLeft}d to exp)`];
  if (stripsOpened > 0) {
    noteParts.push(`Auto-opened ${stripsOpened} strip(s) (${packSize} units/strip) -> ${newLoose} loose left`);
  } else {
    noteParts.push(`Remaining: ${newStrips} strips + ${newLoose} loose`);
  }
  const saleNote = noteParts.join(' | ');
  const saleId = 'sale-' + Date.now();

  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE inventory_batches
      SET strips_count = ?, loose_tablets_count = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(newStrips, newLoose, targetBatch.id);

    const mode = ['CASH', 'UPI', 'CREDIT'].includes(String(paymentMode || '').toUpperCase())
      ? String(paymentMode).toUpperCase()
      : 'CASH';
    db.prepare(`
      INSERT INTO sales_entries (
        id, batch_id, medicine_id, brand_name, batch_number, rack_location,
        pack_size_units, strips_sold, loose_tablets_sold, total_units_deducted,
        prev_strips, prev_loose_tablets, new_strips, new_loose_tablets,
        billed_amount, patient_name, customer_phone, doctor_name, sale_note, is_cancelled, payment_mode, sold_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, datetime('now', '+5 hours', '+30 minutes'))
    `).run(
      saleId,
      targetBatch.id,
      targetBatch.medicine_id,
      targetBatch.brand_name,
      targetBatch.batch_number,
      targetBatch.rack_location,
      packSize,
      sSold,
      lSold,
      requestedUnits,
      targetBatch.strips_count,
      targetBatch.loose_tablets_count,
      newStrips,
      newLoose,
      billedAmount,
      patientName || null,
      customerPhone || null,
      doctorName || null,
      saleNote,
      mode
    );
  });

  tx();

  return db.prepare('SELECT * FROM sales_entries WHERE id = ?').get(saleId);
}

function undoSaleEntry(saleId) {
  const sale = db.prepare('SELECT * FROM sales_entries WHERE id = ?').get(saleId);
  if (!sale) {
    throw new Error('Sale entry not found');
  }
  if (sale.is_cancelled) {
    throw new Error('Sale entry is already cancelled/restored');
  }

  const batch = db.prepare('SELECT * FROM inventory_batches WHERE id = ?').get(sale.batch_id);
  if (!batch) {
    throw new Error('Associated batch no longer exists');
  }

  const packSize = sale.pack_size_units || batch.pack_size_units || 10;
  const currentUnits = batch.strips_count * packSize + batch.loose_tablets_count;
  const restoredUnits = currentUnits + sale.total_units_deducted;
  const restoredStrips = Math.floor(restoredUnits / packSize);
  const restoredLoose = restoredUnits % packSize;

  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE inventory_batches
      SET strips_count = ?, loose_tablets_count = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(restoredStrips, restoredLoose, batch.id);

    db.prepare(`
      UPDATE sales_entries
      SET is_cancelled = 1, sale_note = sale_note || ' [UNDONE / RESTORED]'
      WHERE id = ?
    `).run(saleId);
  });

  tx();
  return { saleId, restoredStrips, restoredLoose, batchNumber: batch.batch_number };
}

module.exports = {
  deductSaleFEFO,
  undoSaleEntry
};
