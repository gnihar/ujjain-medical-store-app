const SOURCE_MANUAL = 'Manual Monthly Circular';
const SOURCE_AUTO = 'Auto-learned from Purchase Bill';
const STORE_TODAY = '2026-10-27';

function round2(n) {
  return Number((Number(n) || 0).toFixed(2));
}

function netBuyPrice(ptr, buyQty, freeQty, discountPct) {
  const buy = Math.max(0, parseInt(buyQty, 10) || 0);
  const free = Math.max(0, parseInt(freeQty, 10) || 0);
  const denom = buy + free;
  if (denom <= 0) return round2(ptr);
  const discounted = (Number(ptr) || 0) * (1 - (Number(discountPct) || 0) / 100);
  return round2(discounted * buy / denom);
}

function retailMargin(mrp, net) {
  const price = Number(mrp) || 0;
  if (price <= 0) return 0;
  return round2(((price - Number(net || 0)) / price) * 100);
}

function schemeFromParts(label, paidQty, freeQty) {
  const raw = String(label || '').trim();
  const matched = raw.match(/(\d+)\s*\+\s*(\d+)/);
  if (matched) {
    const buy = parseInt(matched[1], 10);
    const free = parseInt(matched[2], 10);
    return { label: buy + '+' + free, buy, free };
  }
  if (/no scheme/i.test(raw)) {
    return { label: 'No Scheme', buy: Math.max(1, parseInt(paidQty, 10) || 1), free: 0 };
  }
  const paid = Math.max(0, parseInt(paidQty, 10) || 0);
  const free = Math.max(0, parseInt(freeQty, 10) || 0);
  if (free > 0 && paid > 0) return { label: paid + '+' + free, buy: paid, free };
  if (free > 0) return { label: free + ' free', buy: 0, free };
  return { label: 'No Scheme', buy: Math.max(1, paid || 1), free: 0 };
}

function addDays(iso, days) {
  const d = new Date(String(iso).slice(0, 10) + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + (parseInt(days, 10) || 0));
  return d.toISOString().slice(0, 10);
}

function defaultValidUntil(fromIso) {
  return addDays(fromIso || STORE_TODAY, 30);
}

function phoneDigits(input) {
  let digits = String(input || '').replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return digits;
}

function buildOfferRecord(input) {
  const scheme = schemeFromParts(input.schemeLabel || input.scheme_label, input.buyQty != null ? input.buyQty : input.buy_qty, input.freeQty != null ? input.freeQty : input.free_qty);
  const ptr = Number(input.buyPricePtr != null ? input.buyPricePtr : input.buy_price_ptr) || 0;
  const mrp = Number(input.mrp) || 0;
  const discount = Number(input.cashDiscountPct != null ? input.cashDiscountPct : input.cash_discount_pct) || 0;
  const net = netBuyPrice(ptr, scheme.buy, scheme.free, discount);
  return {
    supplier_id: input.supplierId || input.supplier_id,
    medicine_id: input.medicineId || input.medicine_id || null,
    brand_name: String(input.brandName || input.brand_name || '').trim(),
    salt_composition: String(input.saltComposition || input.salt_composition || '').trim(),
    buy_price_ptr: round2(ptr),
    mrp: round2(mrp),
    scheme_label: scheme.label,
    buy_qty: scheme.buy,
    free_qty: scheme.free,
    cash_discount_pct: round2(discount),
    net_buy_price: net,
    retail_margin_pct: retailMargin(mrp, net),
    valid_until: input.validUntil || input.valid_until || defaultValidUntil(STORE_TODAY),
    source: input.source || SOURCE_MANUAL
  };
}

function decorateOffers(rows) {
  const bestMargin = {};
  const bestNet = {};
  rows.forEach(row => {
    const salt = String(row.salt_composition || '').toLowerCase();
    const brand = String(row.brand_name || '').toLowerCase();
    if (bestMargin[salt] == null || row.retail_margin_pct > bestMargin[salt]) bestMargin[salt] = row.retail_margin_pct;
    if (bestNet[brand] == null || row.net_buy_price < bestNet[brand]) bestNet[brand] = row.net_buy_price;
  });
  return rows.map(row => {
    const salt = String(row.salt_composition || '').toLowerCase();
    const brand = String(row.brand_name || '').toLowerCase();
    const best = row.retail_margin_pct === bestMargin[salt] && row.retail_margin_pct > 0;
    return Object.assign({}, row, {
      best_margin: best,
      best_net_for_brand: row.net_buy_price === bestNet[brand],
      deal_label: best ? 'BEST MARGIN DEAL' : ''
    });
  });
}

function expiryClaimLines({ lang, storeName, city, supplierName, alertDays, items, total }) {
  const hi = lang === 'hi';
  if (hi) {
    return [
      '*समाप्ति वापसी / क्रेडिट नोट दावा*',
      'प्रेषक: *अक्षय मेडिकोज़*',
      'उज्जैन',
      'प्राप्तकर्ता: *' + supplierName + '*',
      'समाप्ति अवधि: ' + alertDays + ' दिन',
      '----------------------------------------',
      ...items.map((it, idx) =>
        (idx + 1) + '. *' + it.brand_name + '* | बैच: ' + it.batch_number + ' | समाप्ति: ' + it.expiry_date +
        ' | मात्रा: ' + it.strips_count + ' पट्टी + ' + it.loose_tablets_count + ' खुली | बिल: ' + (it.invoice_number || 'N/A') +
        ' | खरीद रेट (PTR) क्रेडिट: Rs.' + it.ptr_value
      ),
      '----------------------------------------',
      '*कुल खरीद रेट (PTR) क्रेडिट: Rs.' + Number(total || 0).toLocaleString('en-IN') + '*',
      'कृपया अगली डिलीवरी पर सामान वापस ले लें।'
    ];
  }
  return [
    '*EXPIRY RETURN / CREDIT NOTE CLAIM*',
    'From: *' + (storeName || 'Akshay Medicose') + '*',
    city || 'Ujjain',
    'To: *' + supplierName + '*',
    'Return window: within ' + alertDays + ' days of expiry',
    '----------------------------------------',
    ...items.map((it, idx) =>
      (idx + 1) + '. *' + it.brand_name + '* | Batch: ' + it.batch_number + ' | Expiry: ' + it.expiry_date +
      ' (' + it.days_to_expiry + 'd) | Qty: ' + it.strips_count + ' strips + ' + it.loose_tablets_count + ' loose | Bill: ' + (it.invoice_number || 'N/A') +
      ' | Buy Price (PTR) credit: Rs.' + it.ptr_value
    ),
    '----------------------------------------',
    '*Total Buy Price (PTR) credit: Rs.' + Number(total || 0).toLocaleString('en-IN') + '*',
    'Please collect the return goods on the next delivery visit.'
  ];
}

function refillAlertLines({ lang, storeName, city, phone, patientName, brandName, stripsQty, nextDue }) {
  const hi = lang === 'hi';
  if (hi) {
    return [
      'नमस्ते ' + patientName + ',',
      'आपकी ' + brandName + ' की मासिक दवा (' + stripsQty + ' पट्टी) ' + nextDue + ' को देय है। कृपया अक्षय मेडिकोज़, उज्जैन आइए या व्हाट्सऐप पर पुष्टि करें।',
      phone || ''
    ].filter(Boolean);
  }
  return [
    storeName || 'Akshay Medicose',
    city || 'Ujjain',
    'Hello ' + patientName + ', your monthly refill of ' + brandName + ' (' + stripsQty + ' strip' + (Number(stripsQty) === 1 ? '' : 's') + ') is due on ' + nextDue + '. Please visit ' + (storeName || 'Akshay Medicose') + (city ? ', ' + city : '') + ', or reply on WhatsApp to confirm.',
    phone || ''
  ].filter(Boolean);
}

const MANUAL_OFFERS = [
  { id: 'off-s1-aug', supplierId: 'sup-1', medicineId: 'med-1', brandName: 'Augmentin 625 Duo Tab', saltComposition: 'Amoxicillin 500mg + Clavulanic Acid 125mg', buyPricePtr: 160, mrp: 202.01, buyQty: 10, freeQty: 1, cashDiscountPct: 0 },
  { id: 'off-s4-mox', supplierId: 'sup-4', medicineId: 'med-2', brandName: 'Moxikind-CV 625 Tab', saltComposition: 'Amoxicillin 500mg + Clavulanic Acid 125mg', buyPricePtr: 118, mrp: 189.10, buyQty: 10, freeQty: 2, cashDiscountPct: 0 },
  { id: 'off-s4-clavam', supplierId: 'sup-4', medicineId: 'med-3', brandName: 'Clavam 625 Tablet', saltComposition: 'Amoxicillin 500mg + Clavulanic Acid 125mg', buyPricePtr: 130, mrp: 201, buyQty: 5, freeQty: 1, cashDiscountPct: 0 },
  { id: 'off-s1-pand', supplierId: 'sup-1', medicineId: 'med-4', brandName: 'Pan-D Capsule PR', saltComposition: 'Pantoprazole 40mg + Domperidone 30mg', buyPricePtr: 155, mrp: 210, buyQty: 10, freeQty: 1, cashDiscountPct: 0 },
  { id: 'off-s2-pand', supplierId: 'sup-2', medicineId: 'med-4', brandName: 'Pan-D Capsule PR', saltComposition: 'Pantoprazole 40mg + Domperidone 30mg', buyPricePtr: 140, mrp: 210, buyQty: 10, freeQty: 2, cashDiscountPct: 2 },
  { id: 'off-s3-panto', supplierId: 'sup-3', medicineId: 'med-5', brandName: 'Pantocid DSR Cap', saltComposition: 'Pantoprazole 40mg + Domperidone 30mg', buyPricePtr: 132, mrp: 188, buyQty: 10, freeQty: 2, cashDiscountPct: 1 }
];

module.exports = {
  SOURCE_MANUAL,
  SOURCE_AUTO,
  STORE_TODAY,
  round2,
  netBuyPrice,
  retailMargin,
  schemeFromParts,
  addDays,
  defaultValidUntil,
  phoneDigits,
  buildOfferRecord,
  decorateOffers,
  expiryClaimLines,
  refillAlertLines,
  MANUAL_OFFERS
};
