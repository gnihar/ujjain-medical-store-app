(function () {
  function normalizePhone(input) {
    if (input === undefined || input === null || String(input).trim() === '') return '';
    let digits = String(input).replace(/\D/g, '');
    if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
    if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
    if (digits.length !== 10) {
      throw new Error('Mobile number must be 10 digits.');
    }
    return digits;
  }

  function money(amount) {
    const n = Number(amount) || 0;
    return '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
  }

  function build(opts) {
    const sale = opts.sale || {};
    const hi = opts.lang === 'hi';
    const storeName = hi ? 'अक्षय मेडिकोज़' : (opts.storeName || 'Akshay Medicose');
    const place = hi ? 'उज्जैन' : (opts.city || 'Ujjain (M.P.)');
    const lines = hi
      ? [
        '*' + storeName + '*',
        place,
        '----------------',
        'तारीख: ' + (sale.sold_at || ''),
        'दवा: ' + (sale.brand_name || ''),
        'बैच: ' + (sale.batch_number || ''),
        'समाप्ति: ' + (opts.expiryDate || '—'),
        'पूरी पत्ती: ' + (sale.strips_sold || 0) + ' | खुली गोली: ' + (sale.loose_tablets_sold || 0),
        'कुल राशि: ' + money(sale.billed_amount)
      ]
      : [
        '*' + storeName + '*',
        place,
        '----------------',
        'Date: ' + (sale.sold_at || ''),
        'Medicine: ' + (sale.brand_name || ''),
        'Batch: ' + (sale.batch_number || ''),
        'Expiry: ' + (opts.expiryDate || '—'),
        'Qty: ' + (sale.strips_sold || 0) + ' strips / ' + (sale.loose_tablets_sold || 0) + ' loose tablets',
        'Total amount: ' + money(sale.billed_amount)
      ];
    if (sale.patient_name) lines.splice(3, 0, (hi ? 'ग्राहक: ' : 'Customer: ') + sale.patient_name);
    if (sale.customer_phone) lines.splice(sale.patient_name ? 4 : 3, 0, (hi ? 'मोबाइल: ' : 'Mobile: ') + sale.customer_phone);
    lines.push('----------------', hi ? 'धन्यवाद।' : 'Thank you.');
    const text = lines.join('\n');
    const phone = sale.customer_phone ? String(sale.customer_phone).replace(/\D/g, '') : '';
    const whatsappUrl = phone.length === 10
      ? 'https://wa.me/91' + phone + '?text=' + encodeURIComponent(text)
      : 'https://wa.me/?text=' + encodeURIComponent(text);
    return { text: text, whatsappUrl: whatsappUrl };
  }

  window.MedReceipt = { normalizePhone: normalizePhone, build: build, money: money };
})();
