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
  assert(boot.json.data.whatsappReturnSummary[0].whatsappText.includes('अक्षय मेडिकोज़'));
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

  const cust = await req('POST', `/api/sales/${saleRes.json.sale.id}/customer`, {
    patientName: 'मोहन लाल',
    customerPhone: '9826012345'
  });
  assert.strictEqual(cust.status, 200);
  assert.strictEqual(cust.json.ok, true);
  assert.strictEqual(cust.json.sale.customer_phone, '9826012345');
  assert.strictEqual(cust.json.sale.patient_name, 'मोहन लाल');
  assert(cust.json.receiptText.includes('Akshay Medicose'));
  assert(cust.json.receiptText.includes('अक्षय मेडिकोज़'));
  assert(cust.json.receiptText.includes(saleRes.json.sale.brand_name));
  assert(cust.json.receiptText.includes('Strip'));
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
  assert(order.json.text.includes('Last Supplied PTR'));
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
  console.log('\nALL E2E TESTS PASSED 100%!');
}

runTests().catch(err => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
