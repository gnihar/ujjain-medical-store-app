const assert = require('assert');

const BASE = 'http://127.0.0.1:3456';

async function req(method, path, body) {
  const opts = { method, headers: {} };
  if (body) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(BASE + path, opts);
  const json = await res.json();
  return { status: res.status, json };
}

async function runTests() {
  console.log('1. Testing /health and /api/bootstrap...');
  const h = await req('GET', '/health');
  assert.strictEqual(h.status, 200);
  const boot = await req('GET', '/api/bootstrap');
  assert.strictEqual(boot.json.ok, true);
  assert.strictEqual(boot.json.data.settings.store_name, 'Akshay Medicose');
  assert.strictEqual(String(boot.json.data.settings.owner_pin), '1234');
  assert(boot.json.data.whatsappReturnSummary[0].whatsappText.includes('Akshay Medicose'));
  assert(boot.json.data.whatsappReturnSummary[0].whatsappText.includes('Buy Price (PTR)'));
  assert(!boot.json.data.whatsappReturnSummary[0].whatsappText.includes('अक्षय मेडिकोज़'));
  const autos = boot.json.data.shortbook.filter(item => item.source === 'AUTO');
  assert.strictEqual(boot.json.data.kpis.lowStockCount, autos.length, 'Dashboard low-stock count should match shortbook medicines');
  assert(boot.json.data.offers && boot.json.data.offers.length >= 4, 'Expected seeded stockist offers');
  assert(boot.json.data.batches.length >= 14, 'Expected at least 14 seeded batches');
  assert(boot.json.data.whatsappReturnSummary.length >= 2, 'Expected supplier WhatsApp return summaries');
  console.log('   OK -> Active batches:', boot.json.data.kpis.totalActiveBatches, '| Expiring (<=60d):', boot.json.data.kpis.expiringCount);

  console.log('2. Testing PUT /api/settings (Expiry Return Alert Window 90d -> 60d)...');
  const set90 = await req('PUT', '/api/settings', { expiry_alert_days: 90, default_language: 'hi' });
  assert.strictEqual(set90.json.data.settings.expiry_alert_days, 90);
  const set60 = await req('PUT', '/api/settings', { expiry_alert_days: 60, default_language: 'hi' });
  assert.strictEqual(set60.json.data.settings.expiry_alert_days, 60);
  const setPin = await req('PUT', '/api/settings', { owner_pin: '9876' });
  assert.strictEqual(String(setPin.json.data.settings.owner_pin), '9876');
  const badPin = await req('PUT', '/api/settings', { owner_pin: '12' });
  assert.strictEqual(badPin.status, 400);
  const pinBack = await req('PUT', '/api/settings', { owner_pin: '1234', expiry_alert_days: 60, default_language: 'hi' });
  assert.strictEqual(String(pinBack.json.data.settings.owner_pin), '1234');
  assert(pinBack.json.data.whatsappReturnSummary[0].whatsappText.includes('अक्षय मेडिकोज़'));
  assert(!pinBack.json.data.whatsappReturnSummary[0].whatsappText.includes('EXPIRY RETURN'));
  console.log('   OK -> Configurable expiry window and owner PIN verified.');

  console.log('3. Testing POST /api/ocr/parse & POST /api/invoices...');
  const ocr = await req('POST', '/api/ocr/parse', { templateId: 'tpl-mahakal' });
  assert.strictEqual(ocr.json.ok, true);
  assert.strictEqual(ocr.json.parsed.items.length, 2);
  const invSave = await req('POST', '/api/invoices', ocr.json.parsed);
  assert.strictEqual(invSave.json.ok, true);
  console.log('   OK -> Invoice saved:', invSave.json.invoiceId, '| New batch count:', invSave.json.data.batches.length);

  console.log('4. Testing POST /api/onboarding/quick-rack (Paper-to-Digital Shelf Entry)...');
  const ob = await req('POST', '/api/onboarding/quick-rack', {
    rackLocation: 'Rack A-2',
    brandName: 'Cefixime 200 DT Tab',
    saltComposition: 'Cefixime 200mg Dispersible',
    packSizeUnits: 10,
    batchNumber: 'CFX209',
    expiryDate: '2027-07-31',
    stripsCount: 15,
    looseTabletsCount: 3,
    ptrPerStrip: 72,
    mrpPerStrip: 108
  });
  assert.strictEqual(ob.json.ok, true);
  console.log('   OK -> Quick Rack Onboarded Cefixime 200 DT Tab onto Rack A-2.');

  console.log('5. Testing GET /api/substitutes (Salt Substitute Finder)...');
  const sub = await req('GET', '/api/substitutes?medicineId=med-1');
  assert.strictEqual(sub.json.ok, true);
  assert(sub.json.substitutes.length >= 3, 'Expected at least 3 Amox-Clav substitutes (Augmentin, Moxikind-CV, Clavam)');
  console.log('   OK -> Found', sub.json.substitutes.length, 'in-stock batches matching salt:', sub.json.targetSalt);

  console.log('6. Testing POST /api/sales (FEFO Strip + Loose Tablet Math) & Undo...');
  // Augmentin 625 earliest batch b-1 has 14 strips + 6 loose (packSize 10). Selling 1 strip + 8 loose should open 1 extra strip -> 12 strips + 8 loose left!
  const saleRes = await req('POST', '/api/sales', {
    medicineId: 'med-1',
    stripsSold: 1,
    looseTabletsSold: 8,
    patientName: 'Test Patient',
    doctorName: 'Dr. Sharma'
  });
  assert.strictEqual(saleRes.json.ok, true);
  assert.strictEqual(saleRes.json.sale.batch_number, 'AG624');
  assert.strictEqual(saleRes.json.sale.new_strips, 12);
  assert.strictEqual(saleRes.json.sale.new_loose_tablets, 8);
  console.log('   OK -> FEFO Sale deducted 1 strip + 8 loose from AG624 -> 12 strips + 8 loose remaining.');

  await req('PUT', '/api/settings', { default_language: 'en' });
  const enShare = await req('POST', `/api/sales/${saleRes.json.sale.id}/customer`, {
    patientName: 'Mohan Lal',
    customerPhone: '9826012345'
  });
  assert.strictEqual(enShare.json.ok, true);
  assert(enShare.json.receiptText.includes('Akshay Medicose'));
  assert(enShare.json.receiptText.includes('Thank you.'));
  assert(enShare.json.receiptText.includes('strips'));
  assert(!enShare.json.receiptText.includes('अक्षय मेडिकोज़'));
  assert(!enShare.json.receiptText.includes('धन्यवाद'));
  await req('PUT', '/api/settings', { default_language: 'hi' });
  const cust = await req('POST', `/api/sales/${saleRes.json.sale.id}/customer`, {
    patientName: 'मोहन लाल',
    customerPhone: '9826012345'
  });
  assert.strictEqual(cust.status, 200);
  assert.strictEqual(cust.json.ok, true);
  assert.strictEqual(cust.json.sale.customer_phone, '9826012345');
  assert.strictEqual(cust.json.sale.patient_name, 'मोहन लाल');
  assert(cust.json.receiptText.includes('अक्षय मेडिकोज़'));
  assert(cust.json.receiptText.includes('पूरी पत्ती'));
  assert(cust.json.receiptText.includes('धन्यवाद'));
  assert(!cust.json.receiptText.includes('Thank you'));
  assert(cust.json.receiptText.includes(saleRes.json.sale.brand_name));
  assert(cust.json.receiptText.includes('₹'));
  assert(cust.json.whatsappUrl.startsWith('https://wa.me/919826012345?text='));
  const badPhone = await req('POST', `/api/sales/${saleRes.json.sale.id}/customer`, { customerPhone: '12345' });
  assert.strictEqual(badPhone.status, 400);
  const shareAny = await req('POST', `/api/sales/${saleRes.json.sale.id}/customer`, { customerPhone: '' });
  assert.strictEqual(shareAny.json.ok, true);
  assert(shareAny.json.whatsappUrl.startsWith('https://wa.me/?text='));
  console.log('   OK -> Optional customer receipt + WhatsApp link.');

  const undoRes = await req('POST', `/api/sales/${saleRes.json.sale.id}/undo`);
  assert.strictEqual(undoRes.json.ok, true);
  assert.strictEqual(undoRes.json.restored.restoredStrips, 14);
  assert.strictEqual(undoRes.json.restored.restoredLoose, 6);
  console.log('   OK -> Undo Sale restored exact 14 strips + 6 loose to batch AG624.');

  console.log('7. Testing POST /api/audits (Physical Shelf Stock Audit)...');
  const audRes = await req('POST', '/api/audits', {
    batchId: 'b-1',
    countedStrips: 14,
    countedLooseTablets: 5,
    auditNote: 'E2E automated shelf audit test'
  });
  assert.strictEqual(audRes.json.ok, true);
  console.log('   OK -> Physical stock audit logged & reconciled.');

  console.log('7b. Testing purchase search, shortbook, credit, refills, and QR...');
  const pan = await req('GET', '/api/invoices/search?q=' + encodeURIComponent('Pan-D'));
  assert.strictEqual(pan.json.ok, true);
  assert(pan.json.invoices.some(inv => inv.invoice_number === 'MMT-26-0744'), 'Pan-D should match the Malwa bill');
  const panLine = pan.json.invoices.flatMap(inv => inv.items).find(item => /Pan-D/i.test(item.brand_name));
  assert(panLine, 'Pan-D line item missing');
  assert.strictEqual(Number(panLine.ptr_per_strip), 148);
  assert.strictEqual(panLine.scheme_label, '10+2');
  const aug = await req('GET', '/api/invoices/search?q=Augmentin&status=CREDIT');
  assert(aug.json.invoices.some(inv => /MPA-26-1842/.test(inv.invoice_number)));
  const paid = await req('POST', '/api/invoices/' + aug.json.invoices[0].id + '/payment', {
    paymentStatus: 'PAID',
    paymentReference: 'UPI-8841'
  });
  assert.strictEqual(paid.json.invoice.payment_status, 'PAID');
  assert.strictEqual(paid.json.invoice.payment_reference, 'UPI-8841');

  const book = paid.json.data.shortbook;
  assert(book.some(item => item.source === 'AUTO'), 'Expected an automatic low-stock line');
  assert(book.some(item => item.brand_name === 'Crocin Advance Tablet'), 'Expected the manual shortbook line');
  const order = await req('GET', '/api/shortbook/order?supplierId=sup-3');
  assert.strictEqual(order.json.ok, true);
  assert(order.json.text.includes('Last Buy Price (PTR)'));
  assert(order.json.whatsappUrl.startsWith('https://wa.me/91'));
  const added = await req('POST', '/api/shortbook', {
    brandName: 'Test Missing Syrup',
    requestedStrips: 3,
    supplierId: 'sup-2',
    note: 'Walk-in request'
  });
  assert.strictEqual(added.json.ok, true);
  const marked = await req('POST', '/api/shortbook/mark', { ids: [added.json.item.id], status: 'ORDERED' });
  assert.strictEqual(marked.json.ok, true);
  assert(!marked.json.data.shortbook.some(item => item.id === added.json.item.id));

  const creditSale = await req('POST', '/api/sales', {
    medicineId: 'med-6',
    stripsSold: 1,
    looseTabletsSold: 0,
    paymentMode: 'CREDIT',
    patientName: 'Anita Patel',
    customerPhone: '9988776655'
  });
  assert.strictEqual(creditSale.json.ok, true);
  assert.strictEqual(creditSale.json.sale.payment_mode, 'CREDIT');
  const anita = creditSale.json.data.customers.find(c => c.phone === '9988776655');
  assert(anita && anita.outstanding_balance > 0);
  const part = await req('POST', '/api/credit/payment', {
    customerId: anita.id,
    amount: 10,
    paymentMode: 'UPI'
  });
  assert.strictEqual(part.json.ok, true);
  assert(part.json.customer.outstanding_balance < anita.outstanding_balance);
  const statement = await req('GET', '/api/credit/' + anita.id + '/statement');
  assert(statement.json.text.includes('Anita Patel'));
  assert(statement.json.text.includes('Outstanding Balance'));
  const badCredit = await req('POST', '/api/sales', {
    medicineId: 'med-6',
    stripsSold: 1,
    paymentMode: 'CREDIT',
    patientName: 'No Phone'
  });
  assert.strictEqual(badCredit.status, 400);

  const due = part.json.data.refills.filter(row => row.due_soon);
  assert(due.length >= 3, 'Expected seeded refills due within 3 days');
  assert(part.json.data.refills.some(row => row.patient_name === 'Rajesh Sharma' && row.brand_name.includes('Telma')));
  assert(part.json.data.refills.some(row => row.patient_name === 'Meena Joshi'));
  assert(part.json.data.refills.some(row => row.patient_name === 'Suresh Verma'));
  const noted = await req('POST', '/api/refills/ref-1/notified');
  assert.strictEqual(noted.json.refill.status, 'NOTIFIED');
  const alert = await req('GET', '/api/refills/ref-2/alert');
  assert(alert.json.text.includes('Glycomet'));
  assert(alert.json.whatsappUrl.startsWith('https://wa.me/91'));
  const refilled = await req('POST', '/api/refills/ref-3/bill');
  assert.strictEqual(refilled.json.ok, true);
  assert.strictEqual(refilled.json.refill.next_due_date, '2026-11-26');
  assert.strictEqual(refilled.json.sale.strips_sold, 1);
  assert.strictEqual(refilled.json.sale.brand_name, 'Ecosprin-AV 75 Tablet');
  console.log('   OK -> Bills, shortbook, credit ledger, and monthly refills.');

  console.log('7c. Testing 15-tablet FEFO selection, suppliers, and stockist schemes...');
  const early = await req('POST', '/api/onboarding/quick-rack', {
    rackLocation: 'Rack C-1',
    brandName: 'Strip15 Probe Tab',
    saltComposition: 'Probe Salt 15',
    packSizeUnits: 15,
    batchNumber: 'P15E',
    expiryDate: '2026-11-15',
    stripsCount: 1,
    looseTabletsCount: 0,
    ptrPerStrip: 30,
    mrpPerStrip: 45
  });
  assert.strictEqual(early.json.ok, true);
  const later = await req('POST', '/api/onboarding/quick-rack', {
    rackLocation: 'Rack C-1',
    brandName: 'Strip15 Probe Tab',
    saltComposition: 'Probe Salt 15',
    packSizeUnits: 15,
    batchNumber: 'P15L',
    expiryDate: '2027-06-30',
    stripsCount: 4,
    looseTabletsCount: 0,
    ptrPerStrip: 30,
    mrpPerStrip: 45
  });
  assert.strictEqual(later.json.ok, true);
  const probe = later.json.data.medicines.find(m => m.brand_name === 'Strip15 Probe Tab');
  const probeSale = await req('POST', '/api/sales', {
    medicineId: probe.id,
    stripsSold: 1,
    looseTabletsSold: 4
  });
  assert.strictEqual(probeSale.json.ok, true, probeSale.json.error);
  assert.strictEqual(probeSale.json.sale.batch_number, 'P15L');
  assert.strictEqual(probeSale.json.sale.pack_size_units, 15);
  assert.strictEqual(probeSale.json.sale.total_units_deducted, 19);

  const created = await req('POST', '/api/suppliers', {
    name: 'Freeganj Wholesale',
    shortCode: 'S5',
    phone: '9876543210',
    gstin: '23AAAAA0000A1Z5',
    address: 'Freeganj, Ujjain',
    creditDays: 15,
    cashDiscountPct: 1
  });
  assert.strictEqual(created.json.ok, true);
  assert.strictEqual(created.json.supplier.short_code, 'S5');
  assert.strictEqual(String(created.json.supplier.phone).replace(/\D/g, '').slice(-10), '9876543210');
  const edited = await req('PUT', '/api/suppliers/' + created.json.supplier.id, {
    name: 'Freeganj Wholesale Desk',
    shortCode: 'S5',
    phone: '9123456780',
    gstin: '23AAAAA0000A1Z5',
    address: 'Freeganj, Ujjain',
    creditDays: 18,
    cashDiscountPct: 1.5
  });
  assert.strictEqual(edited.json.ok, true);
  assert.strictEqual(edited.json.supplier.name, 'Freeganj Wholesale Desk');
  assert(String(edited.json.supplier.phone).replace(/\D/g, '').endsWith('9123456780'));
  const badSupplier = await req('POST', '/api/suppliers', { name: 'Bad Phone', phone: '12345' });
  assert.strictEqual(badSupplier.status, 400);

  const saltCmp = await req('GET', '/api/offers/compare?mode=salt&q=' + encodeURIComponent('Amoxicillin 500mg + Clavulanic Acid'));
  assert.strictEqual(saltCmp.json.ok, true);
  const augOffer = saltCmp.json.offers.find(row => row.id === 'off-s1-aug');
  const moxOffer = saltCmp.json.offers.find(row => row.id === 'off-s4-mox');
  assert(augOffer && moxOffer, 'Expected S1 Augmentin and S4 Moxikind offers');
  assert.strictEqual(augOffer.net_buy_price, 145.45);
  assert.strictEqual(augOffer.scheme_label, '10+1');
  assert.strictEqual(moxOffer.net_buy_price, 98.33);
  assert.strictEqual(moxOffer.scheme_label, '10+2');
  assert.strictEqual(moxOffer.short_code, 'S4');
  assert.strictEqual(moxOffer.best_margin, true);
  assert(moxOffer.retail_margin_pct > augOffer.retail_margin_pct);

  const brandCmp = await req('GET', '/api/offers/compare?mode=brand&q=Pan-D');
  const pand = brandCmp.json.offers.filter(row => row.brand_name.includes('Pan-D'));
  const s1 = pand.find(row => row.supplier_id === 'sup-1' && row.source === 'Manual Monthly Circular');
  const s2 = pand.find(row => row.supplier_id === 'sup-2' && row.source === 'Manual Monthly Circular');
  assert(s1 && s2);
  assert(s2.net_buy_price < s1.net_buy_price);

  const deal = await req('POST', '/api/offers/off-s4-mox/shortbook', { requestedStrips: 6 });
  assert.strictEqual(deal.json.ok, true);
  const booked = deal.json.data.shortbook.find(item => item.brand_name.includes('Moxikind-CV') && item.note && item.note.includes('S4'));
  assert(booked, 'Order This Deal should land in the shortbook');
  assert.strictEqual(Number(booked.last_ptr), 98.33);
  assert.strictEqual(booked.last_scheme, '10+2');

  const manualOffer = await req('POST', '/api/offers', {
    supplierId: 'sup-3',
    medicineId: 'med-6',
    brandName: 'Dolo 650 Tablet',
    saltComposition: 'Paracetamol 650mg',
    buyPricePtr: 20,
    mrp: 34,
    schemeLabel: '5+1',
    cashDiscountPct: 0,
    source: 'Manual Monthly Circular'
  });
  assert.strictEqual(manualOffer.json.ok, true);
  assert.strictEqual(manualOffer.json.offer.scheme_label, '5+1');
  assert.strictEqual(manualOffer.json.offer.net_buy_price, 16.67);

  const learned = manualOffer.json.data.offers.find(row => row.brand_name === 'Azithral 500 Tablet' && row.source === 'Auto-learned from Purchase Bill');
  assert(learned, 'Saving a purchase bill should auto-learn a stockist offer');
  assert.strictEqual(learned.scheme_label, '20+2');
  assert.strictEqual(learned.buy_qty, 20);
  assert.strictEqual(learned.free_qty, 2);
  console.log('   OK -> Suppliers, S1–S4 scheme matrix, and 15-tablet FEFO.');

  console.log('8. Resetting database to clean initial demo state & verifying APK download...');
  await req('POST', '/api/reset-demo');
  const apkRes = await fetch(BASE + '/download/UjjainMedStore-v1.0.apk');
  assert.strictEqual(apkRes.status, 200);
  const apkBuf = await apkRes.arrayBuffer();
  assert(apkBuf.byteLength > 30000, 'APK download size should be > 30KB');
  console.log('   OK -> APK download verified (', apkBuf.byteLength, 'bytes ).');

  console.log('9. Testing /qr installer, /install, setup-info, and senior home shell...');
  const qrPage = await fetch(BASE + '/qr');
  assert.strictEqual(qrPage.status, 200);
  const qrHtml = await qrPage.text();
  assert(qrHtml.includes('UjjainMedStore-v1.0.apk'));
  assert(qrHtml.includes('<svg'));
  assert(qrHtml.includes('Akshay Medicose'));
  assert(qrHtml.includes('https://github.com/gnihar/ujjain-medical-store-app/raw/main/UjjainMedStore-v1.0.apk'));
  assert(qrHtml.includes('releases/latest/download/UjjainMedStore-v1.0.apk'));
  const installPage = await fetch(BASE + '/install');
  assert.strictEqual(installPage.status, 200);
  const installHtml = await installPage.text();
  assert(installHtml.includes('Download Android App'));
  assert(installHtml.includes('UjjainMedStore-v1.0.apk'));
  const svgRes = await fetch(BASE + '/qr.svg?data=' + encodeURIComponent(BASE + '/install'));
  assert.strictEqual(svgRes.status, 200);
  assert((await svgRes.text()).includes('<svg'));
  const apiSvg = await fetch(BASE + '/api/qr.svg?text=' + encodeURIComponent('https://github.com/gnihar/ujjain-medical-store-app/raw/main/UjjainMedStore-v1.0.apk'));
  assert.strictEqual(apiSvg.status, 200);
  assert(String(apiSvg.headers.get('content-type') || '').includes('svg'));
  assert((await apiSvg.text()).includes('<svg'));
  const info = await req('GET', '/api/setup-info');
  assert.strictEqual(info.json.ok, true);
  assert(info.json.apkUrl.includes('/download/UjjainMedStore-v1.0.apk'));
  assert.strictEqual(info.json.githubApkUrl, 'https://github.com/gnihar/ujjain-medical-store-app/raw/main/UjjainMedStore-v1.0.apk');
  assert.strictEqual(info.json.recommendedApkUrl, info.json.githubApkUrl);
  assert(info.json.githubReleaseApkUrl.includes('releases/latest/download/UjjainMedStore-v1.0.apk'));
  const home = await fetch(BASE + '/');
  const homeHtml = await home.text();
  assert(homeHtml.includes('Akshay Medicose'));
  assert(homeHtml.includes('Get Mobile App'));
  assert(homeHtml.includes('Counter Mode'));
  assert(homeHtml.includes('voice.js'));
  assert(!homeHtml.includes('easy.css'));
  assert(!homeHtml.includes('A+'));
  console.log('   OK -> QR page, GitHub raw APK link, and shop shell.');

  console.log('10. Testing v3 role shell, auth, quota, voice, vouchers, expiry, expenses, P/L...');
  const shell = await fetch(BASE + '/');
  const shellHtml = await shell.text();
  assert(shellHtml.includes('data-owner="0"'));
  assert(shellHtml.includes('id="modnav"'));
  assert(shellHtml.includes('voice.js'));
  assert(shellHtml.includes('v3ui.js'));
  const appJs = await (await fetch(BASE + '/js/app.js')).text();
  const v3js = await (await fetch(BASE + '/js/v3ui.js')).text();
  const css = await (await fetch(BASE + '/css/styles.css')).text();
  const i18n = await (await fetch(BASE + '/js/i18n.js')).text();
  ['emp-counter', 'emp-stock', 'emp-expiry', 'emp-help', 'adm-pl', 'adm-expenses', 'adm-ops', 'adm-settings'].forEach(id => {
    assert(appJs.includes(id), 'missing tab ' + id);
  });
  assert(css.includes('body[data-owner="0"] .owner-only'));
  assert(v3js.includes('admin-unlock-modal'));
  assert(v3js.includes('data-auth-tab="pattern"'));
  assert(v3js.includes('data-auth-tab="biometric"'));
  assert(appJs.includes("querySelectorAll('.owner-only')"));
  assert(i18n.includes('Employee Mode · Switch to Admin'));
  assert(i18n.includes('कर्मचारी मोड · मालिक मोड खोलें'));
  assert(i18n.includes('Save Draft Voucher'));
  assert(i18n.includes('कच्चा पर्चा सहेजें'));
  assert(!i18n.includes("saveDraftVoucher: 'कच्चा पर्चा सेव करें (Draft)'"));

  await req('POST', '/api/reset-demo');
  const wrongPin = await req('POST', '/api/auth/unlock', { method: 'pin', pin: '0000' });
  assert.strictEqual(wrongPin.status, 401);
  const goodPin = await req('POST', '/api/auth/unlock', { method: 'pin', pin: '1234' });
  assert.strictEqual(goodPin.status, 200);
  assert.strictEqual(goodPin.json.unlocked, true);
  const badPattern = await req('POST', '/api/auth/unlock', { method: 'pattern', pattern: '0-1-2-3' });
  assert.strictEqual(badPattern.status, 401);
  const goodPattern = await req('POST', '/api/auth/unlock', { method: 'pattern', pattern: '0-3-6-7-8' });
  assert.strictEqual(goodPattern.json.method, 'pattern');
  const badBio = await req('POST', '/api/auth/unlock', { method: 'biometric', credentialId: 'nope' });
  assert.strictEqual(badBio.status, 401);
  const goodBio = await req('POST', '/api/auth/unlock', { method: 'biometric', credentialId: 'bio-demo-akshay-1' });
  assert.strictEqual(goodBio.json.unlocked, true);
  const reg = await req('POST', '/api/auth/webauthn/register', { credentialId: 'bio-e2e-device' });
  assert.strictEqual(reg.json.ok, true);
  const regUnlock = await req('POST', '/api/auth/unlock', { method: 'biometric', credentialId: 'bio-e2e-device' });
  assert.strictEqual(regUnlock.json.unlocked, true);
  await req('POST', '/api/auth/webauthn/register', { credentialId: 'bio-demo-akshay-1' });
  const shortPattern = await req('PUT', '/api/settings', { admin_pattern: '0-1' });
  assert.strictEqual(shortPattern.status, 400);
  const newPattern = await req('PUT', '/api/settings', { admin_pattern: '0-1-2-5-8' });
  assert.strictEqual(newPattern.json.data.settings.admin_pattern, '0-1-2-5-8');
  const useNew = await req('POST', '/api/auth/unlock', { method: 'pattern', pattern: '0-1-2-5-8' });
  assert.strictEqual(useNew.json.unlocked, true);
  await req('PUT', '/api/settings', { admin_pattern: '0-3-6-7-8', admin_lock_minutes: 15 });

  const parsed = await req('POST', '/api/voice/parse', {
    transcript: 'Dolo 650 20 strip rack A1 batch DL99 expiry 2027-08 PTR 24.50 MRP 33.25'
  });
  assert.strictEqual(parsed.json.parsed.brand_name, 'Dolo 650');
  assert.strictEqual(parsed.json.parsed.strips_qty, 20);
  assert.strictEqual(parsed.json.parsed.rack_location, 'Rack A-1');
  assert.strictEqual(parsed.json.parsed.batch_number, 'DL99');
  assert.strictEqual(parsed.json.parsed.expiry_date, '2027-08-31');
  assert.strictEqual(parsed.json.parsed.ptr_per_strip, 24.5);
  assert.strictEqual(parsed.json.parsed.mrp_per_strip, 33.25);
  const hindi = await req('POST', '/api/voice/parse', { transcript: 'Dolo 650 पंद्रह पत्ते रैक A-1 बैच DL24 एक्सपायरी अगस्त 2027 एमआरपी 34 पीटीआर 24' });
  assert.strictEqual(hindi.json.parsed.strips_qty, 15);
  assert.strictEqual(hindi.json.parsed.expiry_date, '2027-08-31');
  assert.strictEqual(hindi.json.parsed.rack_location, 'Rack A-1');
  const addedVoice = await req('POST', '/api/voice/add-stock', {
    transcript: 'VoiceProbe Tab 4 strip rack B2 batch VP10 expiry 2027-12 PTR 11 MRP 19'
  });
  assert.strictEqual(addedVoice.json.ok, true);
  const voiceMed = addedVoice.json.data.medicines.find(m => m.brand_name === 'VoiceProbe Tab');
  assert(voiceMed, 'voice add should create the medicine');
  const voiceBatch = addedVoice.json.data.batches.find(b => b.batch_number === 'VP10');
  assert(voiceBatch && voiceBatch.strips_count === 4);

  const before = await req('GET', '/api/bootstrap');
  const telmi = before.json.data.batches.filter(b => b.medicine_id === 'med-11').reduce((s, b) => s + b.strips_count, 0);
  const draft = await req('POST', '/api/vouchers', {
    voucherType: 'SALE',
    customerOrSupplier: 'Draft Patient',
    paymentMode: 'CASH',
    items: [{ medicineId: 'med-11', strips: 1, loose: 0, patientName: 'Draft Patient' }]
  });
  assert.strictEqual(draft.json.voucher.status, 'DRAFT');
  const afterDraft = draft.json.data.batches.filter(b => b.medicine_id === 'med-11').reduce((s, b) => s + b.strips_count, 0);
  assert.strictEqual(afterDraft, telmi, 'draft must not deduct stock');
  const editedVoucher = await req('PUT', '/api/vouchers/' + draft.json.voucher.id, {
    voucherType: 'SALE',
    customerOrSupplier: 'Draft Patient',
    items: [{ medicineId: 'med-11', strips: 2, loose: 0 }]
  });
  assert.strictEqual(editedVoucher.json.ok, true);
  const finalV = await req('POST', '/api/vouchers/' + draft.json.voucher.id + '/finalize');
  assert.strictEqual(finalV.json.voucher.status, 'FINALIZED');
  const afterFinal = finalV.json.data.batches.filter(b => b.medicine_id === 'med-11').reduce((s, b) => s + b.strips_count, 0);
  assert.strictEqual(afterFinal, telmi - 2, 'finalize should FEFO-deduct 2 strips');
  const cancelled = await req('POST', '/api/vouchers', {
    voucherType: 'SALE',
    items: [{ medicineId: 'med-11', strips: 1, loose: 0 }]
  });
  const cancelRes = await req('POST', '/api/vouchers/' + cancelled.json.voucher.id + '/cancel');
  assert.strictEqual(cancelRes.json.voucher.status, 'CANCELLED');

  const slip = await req('POST', '/api/expiry-returns', { batchId: 'b-14', stripsReturned: 1 });
  assert.strictEqual(slip.json.slip.status, 'PENDING');
  const sent = await req('POST', '/api/expiry-returns/' + slip.json.slip.id + '/status', { status: 'SENT' });
  assert.strictEqual(sent.json.slip.status, 'SENT');
  const adjusted = await req('POST', '/api/expiry-returns/' + slip.json.slip.id + '/status', { status: 'ADJUSTED', creditNoteNo: 'CN-8821' });
  assert.strictEqual(adjusted.json.slip.status, 'ADJUSTED');
  assert.strictEqual(adjusted.json.slip.credit_note_no, 'CN-8821');
  const claimed = adjusted.json.data.batches.find(b => b.id === 'b-14');
  assert.strictEqual(claimed.is_return_claimed, 1);
  assert.strictEqual(claimed.strips_count, 15);

  const createdExp = await req('POST', '/api/expenses', {
    category: 'SALARY', title: 'E2E Staff', employeeName: 'E2E Staff', amount: 100, expenseDate: '2026-10-29', note: 'test'
  });
  assert.strictEqual(createdExp.json.expense.category, 'SALARY');
  const updatedExp = await req('PUT', '/api/expenses/' + createdExp.json.expense.id, { amount: 125, category: 'OTHER', title: 'E2E Other' });
  assert.strictEqual(updatedExp.json.expense.amount, 125);
  assert.strictEqual(updatedExp.json.expense.category, 'OTHER');
  const removedExp = await req('DELETE', '/api/expenses/' + createdExp.json.expense.id);
  assert.strictEqual(removedExp.json.ok, true);
  assert(!removedExp.json.data.expenses.some(row => row.id === createdExp.json.expense.id));

  const day0 = await req('GET', '/api/reports/pl?range=1d');
  const salePl = await req('POST', '/api/sales', { medicineId: 'med-7', stripsSold: 1, looseTabletsSold: 0, patientName: 'PL Probe' });
  assert.strictEqual(salePl.json.ok, true);
  const billed = Number(salePl.json.sale.billed_amount);
  const cogs = Number(salePl.json.sale.cogs_amount);
  const today = day0.json.report.to;
  await req('POST', '/api/expenses', { category: 'TRANSPORT', title: 'PL Transport', amount: 40, expenseDate: today, note: 'today' });
  const day1 = await req('GET', '/api/reports/pl?range=1d');
  assert.strictEqual(day1.json.report.range, '1d');
  assert.ok(Math.abs(day1.json.report.totalSales - (day0.json.report.totalSales + billed)) < 0.02);
  assert.ok(Math.abs(day1.json.report.cogs - (day0.json.report.cogs + cogs)) < 0.02);
  assert.ok(Math.abs(day1.json.report.expenses - (day0.json.report.expenses + 40)) < 0.02);
  assert.ok(Math.abs(day1.json.report.netProfit - (day1.json.report.grossMargin - day1.json.report.expenses)) < 0.02);
  const week = await req('GET', '/api/reports/pl?range=1w');
  const month = await req('GET', '/api/reports/pl?range=1m');
  assert.ok(week.json.report.totalSales >= day1.json.report.totalSales);
  assert.ok(month.json.report.totalSales >= week.json.report.totalSales);
  assert.ok(month.json.report.expenses >= 12000, 'October salary should be inside the month');
  assert.strictEqual(month.json.report.from.slice(8), '01');
  const season = await req('GET', '/api/reports/seasonality');
  assert.ok(season.json.months.length >= 6, 'expected several months of seasonality');
  const october = season.json.months.find(m => m.month === '2026-10');
  assert(october && october.top.some(row => /Azithral|Dolo|Allegra/.test(row.brand_name)));

  const quota0 = await req('GET', '/api/ai/quota');
  assert.strictEqual(quota0.json.quota.monthly_limit, 300);
  let guard = 0;
  let last = quota0.json.quota;
  while (last.remaining > 0 && guard < 320) {
    const scan = await req('POST', '/api/ai/scan', { rawText: 'Quota Probe ' + last.remaining + ' strip rack A1 batch Q1 expiry 2027-01 PTR 5 MRP 8' });
    if (scan.status === 429) break;
    assert.strictEqual(scan.status, 200, scan.json.error);
    assert.strictEqual(scan.json.provider, 'offline');
    last = scan.json.quota;
    guard += 1;
  }
  const blocked = await req('POST', '/api/ai/scan', { rawText: 'should fail' });
  assert.strictEqual(blocked.status, 429);
  assert.strictEqual(blocked.json.quota.remaining, 0);
  assert(String(blocked.json.error).includes('300'));

  const cleared = await req('POST', '/api/demo/clear-zero');
  assert.strictEqual(cleared.json.ok, true);
  assert.strictEqual(cleared.json.data.medicines.length, 0);
  assert.strictEqual(cleared.json.data.sales.length, 0);
  assert.strictEqual(cleared.json.data.expenses.length, 0);
  assert.ok(cleared.json.data.suppliers.length >= 3);
  assert.strictEqual(cleared.json.data.settings.store_name, 'Akshay Medicose');
  assert.strictEqual(cleared.json.data.aiQuota.calls_used, 0);
  const seeded = await req('POST', '/api/reset-demo');
  assert.ok(seeded.json.data.medicines.length >= 18);
  assert.ok(seeded.json.data.expenses.length >= 5);
  assert.ok(seeded.json.data.seasonality.months.length >= 6);
  assert.strictEqual(seeded.json.data.settings.owner_pin, '1234');
  console.log('   OK -> v3 auth, quota block, voice, vouchers, expiry, P/L, and demo reset.');
  console.log('\nALL E2E TESTS PASSED 100%!');
}

runTests().catch(err => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
