(function () {
  const EMP_NAV = [
    ['emp-counter', 'tabEmpCounter'],
    ['emp-stock', 'tabEmpStock'],
    ['emp-expiry', 'tabEmpExpiry'],
    ['emp-help', 'tabEmpHelp']
  ];
  const ADM_NAV = [
    ['adm-pl', 'tabAdmPl'],
    ['adm-expenses', 'tabAdmExpenses'],
    ['adm-ops', 'tabAdmOps'],
    ['adm-settings', 'tabAdmSettings']
  ];
  const SUB_DEFAULT = { 'emp-counter': 'pos', 'emp-stock': 'search', 'adm-pl': 'margin', 'adm-ops': 'counter' };
  const RAW_APK = 'https://github.com/gnihar/ujjain-medical-store-app/raw/main/UjjainMedStore-v1.0.apk';
  const RELEASE_APK = 'https://github.com/gnihar/ujjain-medical-store-app/releases/latest/download/UjjainMedStore-v1.0.apk';

  let state = null;
  let view = 'emp-counter';
  let subview = 'pos';
  let v3api = null;
  let idleTimer = null;
  let lang = 'en';
  let owner = false;
  let billQ = '';
  let billStatus = 'ALL';
  let billFrom = '';
  let billTo = '';
  let draft = null;
  let invQ = '';
  let creditId = '';
  let auditRack = 'ALL';
  let auditQ = '';
  let auditCounts = {};
  let shortQty = {};
  let expiryDraft = 60;
  let schemeMode = 'salt';
  let schemeQuery = '';
  let refillFilter = 'due';
  const pos = {
    q: '', medicineId: '', strips: 1, loose: 0, pay: 'CASH',
    name: '', phone: '', doctor: '', schedule: false, interval: '30', customDays: 45
  };

  owner = false;

  function t(key) {
    const pack = window.I18N || { en: {} };
    return (pack[lang] && pack[lang][key]) || (pack.en && pack.en[key]) || key;
  }

  function rackHint(code) {
    const racks = (window.I18N[lang] && window.I18N[lang].racks) || window.I18N.en.racks || {};
    return racks[code] || t('shelfFallback');
  }

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function inr(num) {
    return '₹' + Number(num || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function toast(msg) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove('show'), 1800);
  }

  function digits(phone) {
    let d = String(phone || '').replace(/\D/g, '');
    if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
    if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
    return d;
  }

  function wa(phone, text) {
    const d = digits(phone);
    const base = d.length === 10 ? 'https://wa.me/91' + d : 'https://wa.me/';
    return base + '?text=' + encodeURIComponent(text);
  }

  function pretty(iso) {
    if (!iso) return '—';
    const d = new Date(String(iso).slice(0, 10) + 'T00:00:00Z');
    if (Number.isNaN(d.getTime())) return String(iso);
    return d.toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN', {
      day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC'
    });
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (_e) {
      const area = document.createElement('textarea');
      area.value = text;
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      area.remove();
    }
    toast(t('copied'));
  }

  function openModal(inner) {
    document.getElementById('modalRoot').innerHTML = '<div class="modal-back" id="modalBack"><div class="drawer" role="dialog">' + inner + '</div></div>';
    document.getElementById('modalBack').addEventListener('click', (event) => {
      if (event.target.id === 'modalBack') closeModal();
    });
    const close = document.getElementById('modalClose');
    if (close) close.onclick = closeModal;
  }

  function closeModal() {
    document.getElementById('modalRoot').innerHTML = '';
  }

  function textModal(title, text, whatsappUrl) {
    openModal(
      '<div class="head" style="display:flex;justify-content:space-between;gap:8px;align-items:center;margin-bottom:10px">' +
        '<h2 style="margin:0">' + esc(title) + '</h2>' +
        '<button type="button" class="btn small" id="modalClose">' + esc(t('close')) + '</button></div>' +
      '<textarea id="modalText" readonly>' + esc(text) + '</textarea>' +
      '<div class="actions" style="margin-top:10px">' +
        '<button type="button" class="btn primary" id="modalCopy">' + esc(t('copy')) + '</button>' +
        (whatsappUrl ? '<a class="btn green" target="_blank" rel="noopener" href="' + esc(whatsappUrl) + '">' + esc(t('sendWhatsapp')) + '</a>' : '') +
        '<button type="button" class="btn" id="modalPrint">' + esc(t('print')) + '</button></div>'
    );
    document.getElementById('modalCopy').onclick = () => copyText(text);
    document.getElementById('modalPrint').onclick = () => {
      const w = window.open('', '_blank');
      if (!w) return;
      w.document.write('<pre style="font:14px/1.5 sans-serif;white-space:pre-wrap">' + esc(text) + '</pre>');
      w.document.close();
      w.focus();
      w.print();
    };
  }

  function paintChrome() {
    document.body.dataset.owner = owner ? '1' : '0';
    document.body.dataset.lang = lang;
    document.documentElement.lang = lang === 'hi' ? 'hi' : 'en';
    document.getElementById('locBadge').textContent = t('location');
    const ownerBtn = document.getElementById('ownerBtn');
    let tools = document.getElementById('ownerTools');
    if (!tools) {
      tools = document.createElement('span');
      tools.id = 'ownerTools';
      tools.style.display = 'inline-flex';
      tools.style.gap = '8px';
      document.querySelector('.top-actions').insertBefore(tools, ownerBtn);
    }
    tools.innerHTML = '';
    document.getElementById('apkBtn').textContent = t('getApp');
    const help = document.getElementById('helpBtn');
    if (help) help.textContent = '?';
    document.getElementById('langEn').classList.toggle('on', lang === 'en');
    document.getElementById('langHi').classList.toggle('on', lang === 'hi');
    ownerBtn.textContent = (owner ? t('admModeBadge') : t('empModeBadge'));
    const expCount = state && state.expiringBatches ? state.expiringBatches.length : 0;
    const drafts = state && state.vouchers ? state.vouchers.filter(v => v.status === 'DRAFT').length : 0;
    const nav = owner ? ADM_NAV : EMP_NAV;
    if (!nav.some(([id]) => id === view)) view = nav[0][0];
    document.getElementById('modnav').innerHTML = nav.map(([id, key]) => {
      let badge = '';
      if (id === 'emp-expiry' && expCount) badge = ' <span class="badge">' + expCount + '</span>';
      if (id === 'emp-counter' && drafts) badge = ' <span class="badge">' + drafts + '</span>';
      return '<button type="button" data-view="' + id + '" class="' + (view === id ? 'on' : '') + '">' + esc(t(key)) + badge + '</button>';
    }).join('');
    let timer = document.getElementById('lockTimer');
    if (owner) {
      if (!timer) {
        timer = document.createElement('span');
        timer.id = 'lockTimer';
        timer.className = 'pill info';
        ownerBtn.before(timer);
      }
      const mins = (state && state.settings && state.settings.admin_lock_minutes) || 15;
      timer.textContent = mins + 'm';
    } else if (timer) timer.remove();
  }

  function stockOf(id) {
    const rows = (state.batches || []).filter(b => b.medicine_id === id);
    return {
      strips: rows.reduce((sum, b) => sum + Number(b.strips_count || 0), 0),
      loose: rows.reduce((sum, b) => sum + Number(b.loose_tablets_count || 0), 0),
      rows
    };
  }

  function earliest(id) {
    return stockOf(id).rows.filter(b => b.total_units > 0).sort((a, b) => a.days_to_expiry - b.days_to_expiry)[0] || null;
  }

  function findMed(id) {
    return (state.medicines || []).find(m => m.id === id) || null;
  }

  function stripSvg(med, batch) {
    return '<svg class="strip" viewBox="0 0 360 92" role="img" aria-label="' + esc(med.brand_name) + '">' +
      '<rect x="1" y="1" width="358" height="90" rx="12" fill="#f8fafc" stroke="#e2e8f0"/>' +
      '<rect x="14" y="16" width="48" height="60" rx="6" fill="#ffffff" stroke="#cbd5e1"/>' +
      '<rect x="22" y="28" width="32" height="16" rx="3" fill="#dbeafe"/>' +
      '<rect x="22" y="50" width="32" height="6" rx="2" fill="#e2e8f0"/>' +
      '<text x="76" y="36" font-size="15" font-family="Inter, sans-serif" font-weight="650" fill="#0f172a">' + esc(med.brand_name) + '</text>' +
      '<text x="76" y="56" font-size="12" fill="#475569">' + esc(med.pack_label || '') + '</text>' +
      '<text x="76" y="74" font-size="12" fill="#0f766e">' + esc(med.rack_location || '') + (batch ? ' · ' + esc(batch.batch_number) : '') + '</text>' +
      '</svg>';
  }

  function rackCard(med, batch) {
    if (!med) return '';
    return '<article class="rack-card"><div>' + stripSvg(med, batch) + '</div><div>' +
      '<div class="rack-code">' + esc(med.rack_location || '—') + '</div>' +
      '<div>' + esc(rackHint(med.rack_location)) + '</div>' +
      '<div class="muted" style="margin-top:6px">' + esc(med.brand_name) + ' · ' + esc(med.pack_label || '') + '</div>' +
      (batch ? '<div class="muted">' + esc(t('batch')) + ' ' + esc(batch.batch_number) + ' · ' + esc(t('expiry')) + ' ' + esc(pretty(batch.expiry_date)) + '</div>' : '') +
      '</div></article>';
  }

  function payPill(status) {
    if (status === 'PAID') return '<span class="pill ok">' + esc(t('paid')) + '</span>';
    if (status === 'PARTIAL') return '<span class="pill warn">' + esc(t('partial')) + '</span>';
    return '<span class="pill pending">' + esc(t('creditPending')) + '</span>';
  }

  function stockPill(strips, min) {
    if (strips <= (min || 0)) return '<span class="pill low">' + esc(t('lowStock')) + '</span>';
    return '<span class="pill ok">' + esc(t('inStock')) + '</span>';
  }

  function applyState(next) {
    if (next && next.settings) state = next;
    expiryDraft = state.settings.expiry_alert_days || 60;
    if (!creditId && state.customers && state.customers[0]) creditId = state.customers[0].id;
  }

  async function run(work, okMsg) {
    try {
      const next = await work();
      if (next) applyState(next);
      if (okMsg) toast(okMsg);
      render();
    } catch (err) {
      toast(err.message || t('failed'));
    }
  }

  function dashboard() {
    const k = state.kpis || {};
    const value = owner
      ? inr(k.totalPtrValue)
      : inr(k.totalMrpValue);
    const sub = owner
      ? t('ptr') + ' · ' + t('mrp') + ' ' + inr(k.totalMrpValue) + ' · ' + t('margin') + ' ' + (k.avgMarginPercent || 0) + '%'
      : t('mrp');
    const groups = state.whatsappReturnSummary || [];
    return '<div class="page-head"><div><h1>' + esc(t('navDashboard')) + '</h1><p class="lede">' + esc(state.settings.city || '') + '</p></div>' +
      '<label class="field" style="width:180px"><span>' + esc(t('expiryWindow')) + '</span>' +
      '<span class="row"><input id="expiryDays" type="number" min="5" max="365" value="' + esc(expiryDraft) + '"><button type="button" class="btn small" id="applyExpiry">' + esc(t('apply')) + '</button></span></label></div>' +
      '<section class="kpis">' +
        kpi(t('kpiBatches'), k.totalActiveBatches || 0, '') +
        kpi(t('kpiValue'), value, sub + (owner ? ' · ' + t('ptrHint') : '')) +
        kpi(t('kpiExpiring'), k.expiringCount || 0, (k.expiringCount || 0) + ' · ' + (state.settings.expiry_alert_days || 60) + ' ' + t('days')) +
        kpi(t('kpiShortbook'), k.shortbookCount || 0, '') +
        kpi(t('kpiCredit'), inr(k.pendingCreditBalance), '') +
        kpi(t('kpiRefills'), k.dueRefillCount || 0, '') +
      '</section>' +
      '<section class="panel"><h2>' + esc(t('expiryClaims')) + '</h2>' +
      (groups.length ? '<div class="table-wrap"><table class="data"><thead><tr><th>' + esc(t('supplier')) + '</th><th>' + esc(t('lines')) + '</th><th class="owner-only">' + esc(t('claimValue')) + '</th><th></th></tr></thead><tbody>' +
        groups.map((g, i) => '<tr><td>' + esc(g.supplierName) + '</td><td>' + g.items.length + '</td><td class="owner-only num">' + inr(g.totalCreditValuePtr) + '</td><td class="actions"><button type="button" class="btn small green" data-return="' + i + '">' + esc(t('sendWhatsapp')) + '</button><button type="button" class="btn small" data-return-copy="' + i + '">' + esc(t('copySummary')) + '</button></td></tr>').join('') +
        '</tbody></table></div>' : '<div class="empty">' + esc(t('noExpiry')) + '</div>') +
      '</section>';
  }

  function kpi(label, value, sub) {
    return '<article class="kpi"><div class="kpi-label">' + esc(label) + '</div><div class="kpi-value">' + esc(value) + '</div>' +
      (sub ? '<div class="kpi-sub">' + esc(sub) + '</div>' : '') + '</article>';
  }

  function returnText(group) {
    const lines = [
      state.settings.store_name,
      state.settings.city,
      t('expiryClaims'),
      t('supplier') + ': ' + group.supplierName,
      t('expiryWindow') + ': ' + (state.settings.expiry_alert_days || 60) + ' ' + t('days'),
      '----------------------------------------',
      ...group.items.map((it, idx) =>
        (idx + 1) + '. ' + it.brand_name + ' | ' + t('batch') + ' ' + it.batch_number + ' | ' + it.expiry_date +
        ' | ' + it.strips_count + ' ' + t('stripsUnit') + ' + ' + it.loose_tablets_count + ' ' + t('looseUnit') +
        (owner ? ' | ' + t('ptr') + ' ' + inr(it.ptr_value) : '')
      )
    ];
    if (owner) lines.push('----------------------------------------', t('claimValue') + ': ' + inr(group.totalCreditValuePtr));
    return lines.join('\n');
  }

  function filteredInvoices() {
    const q = billQ.trim().toLowerCase();
    return (state.invoices || []).filter(inv => {
      if (billStatus !== 'ALL' && inv.payment_status !== billStatus) return false;
      if (billFrom && String(inv.invoice_date) < billFrom) return false;
      if (billTo && String(inv.invoice_date) > billTo) return false;
      if (!q) return true;
      if ((inv.invoice_number || '').toLowerCase().includes(q)) return true;
      if ((inv.supplier_name || '').toLowerCase().includes(q)) return true;
      return (state.invoiceItems || []).some(li => li.invoice_id === inv.id && (
        (li.brand_name || '').toLowerCase().includes(q) || (li.salt_composition || '').toLowerCase().includes(q)
      ));
    });
  }

  function bills() {
    const rows = filteredInvoices();
    const templates = Object.keys(state.sampleTemplates || {});
    return '<div class="page-head"><div><h1>' + esc(t('navBills')) + '</h1><p class="lede">' + esc(t('searchBills')) + '</p></div></div>' +
      '<div class="split"><section class="panel"><h2>' + esc(t('searchBills')) + '</h2>' +
      '<div class="toolbar"><label class="field grow"><span>' + esc(t('searchHint')) + '</span><input id="billQ" type="search" value="' + esc(billQ) + '" placeholder="' + esc(t('searchHint')) + '"></label>' +
      '<label class="field"><span>' + esc(t('status')) + '</span><select id="billStatus">' +
        ['ALL', 'PAID', 'CREDIT', 'PARTIAL'].map(s => '<option value="' + s + '"' + (billStatus === s ? ' selected' : '') + '>' + esc(s === 'ALL' ? t('statusAll') : s === 'PAID' ? t('statusPaid') : s === 'PARTIAL' ? t('statusPartial') : t('statusCredit')) + '</option>').join('') +
      '</select></label>' +
      '<label class="field"><span>' + esc(t('from')) + '</span><input id="billFrom" type="date" value="' + esc(billFrom) + '"></label>' +
      '<label class="field"><span>' + esc(t('to')) + '</span><input id="billTo" type="date" value="' + esc(billTo) + '"></label></div>' +
      (rows.length ? '<div class="table-wrap"><table class="data"><thead><tr><th>' + esc(t('invoice')) + '</th><th>' + esc(t('supplier')) + '</th><th>' + esc(t('date')) + '</th><th>' + esc(t('amount')) + '</th><th>' + esc(t('status')) + '</th><th></th></tr></thead><tbody>' +
        rows.map(inv => '<tr><td>' + esc(inv.invoice_number) + '</td><td>' + esc(inv.supplier_name) + '</td><td>' + esc(pretty(inv.invoice_date)) + '</td><td class="num">' + inr(inv.total_amount) + '</td><td>' + payPill(inv.payment_status) + '</td><td><button type="button" class="btn small" data-invoice="' + esc(inv.id) + '">' + esc(t('open')) + '</button></td></tr>').join('') +
        '</tbody></table></div>' : '<div class="empty">' + esc(t('noBills')) + '</div>') +
      '</section><section class="panel"><h2>' + esc(t('addBill')) + '</h2>' +
      '<p class="lede">' + esc(t('ptrHint')) + '</p>' +
      '<div class="actions" style="margin-bottom:10px">' +
        '<button type="button" class="btn small" id="manageSuppliers">' + esc(t('manageSuppliers')) + '</button>' +
        templates.map(id => '<button type="button" class="btn small" data-template="' + esc(id) + '">' + esc(t(sampleLabel(id))) + '</button>').join('') +
        '<button type="button" class="btn small" id="blankBill">' + esc(t('blankBill')) + '</button>' +
        '<label class="btn small">' + esc(t('upload')) + '<input id="billFile" type="file" accept="image/*" capture="environment" hidden></label></div>' +
      draftForm() +
      '</section></div>';
  }

  function sampleLabel(id) {
    if (id === 'tpl-mahakal') return 'sampleMahakal';
    if (id === 'tpl-malwa') return 'sampleMalwa';
    if (id === 'tpl-shipra') return 'sampleShipra';
    return 'sample';
  }

  function blankItem() {
    return { brandName: '', saltComposition: '', batchNumber: '', expiryDate: '', stripsCount: 1, freeStrips: 0, schemeLabel: '', rackLocation: 'Rack A-1', ptrPerStrip: 0, mrpPerStrip: 0, packSizeUnits: 10, gstPercent: 12 };
  }

  function draftForm() {
    if (!draft) return '<p class="muted">' + esc(t('sample')) + ' / ' + esc(t('upload')) + '</p>';
    const items = draft.items || [];
    const pay = draft.paymentStatus || 'CREDIT';
    return '<div class="toolbar"><label class="field grow"><span>' + esc(t('supplier')) + '</span><input id="dSupplier" value="' + esc(draft.supplierName || '') + '"></label>' +
      '<label class="field"><span>' + esc(t('invoice')) + '</span><input id="dInv" value="' + esc(draft.invoiceNumber || '') + '"></label>' +
      '<label class="field"><span>' + esc(t('date')) + '</span><input id="dDate" type="date" value="' + esc(draft.invoiceDate || '') + '"></label>' +
      '<label class="field"><span>' + esc(t('paymentStatus')) + '</span><select id="dPay">' +
        '<option value="CREDIT"' + (pay === 'CREDIT' ? ' selected' : '') + '>' + esc(t('creditPending')) + '</option>' +
        '<option value="PAID"' + (pay === 'PAID' ? ' selected' : '') + '>' + esc(t('paid')) + '</option>' +
        '<option value="PARTIAL"' + (pay === 'PARTIAL' ? ' selected' : '') + '>' + esc(t('partial')) + '</option></select></label></div>' +
      '<p class="muted">' + esc(t('ptrHint')) + '</p>' +
      '<div class="table-wrap"><table class="data draft-table"><thead><tr><th>' + esc(t('brand')) + '</th><th>' + esc(t('batch')) + '</th><th>' + esc(t('expiry')) + '</th><th>' + esc(t('strips')) + '</th><th>' + esc(t('free')) + '</th><th>' + esc(t('scheme')) + '</th><th>' + esc(t('rack')) + '</th><th class="owner-only" title="' + esc(t('ptrHint')) + '">' + esc(t('ptr')) + '</th><th>' + esc(t('mrp')) + '</th><th></th></tr></thead><tbody>' +
      items.map((it, i) => '<tr>' +
        '<td><input data-di="' + i + '" data-k="brandName" value="' + esc(it.brandName || '') + '"></td>' +
        '<td><input data-di="' + i + '" data-k="batchNumber" value="' + esc(it.batchNumber || '') + '"></td>' +
        '<td><input data-di="' + i + '" data-k="expiryDate" value="' + esc(it.expiryDate || '') + '"></td>' +
        '<td><input data-di="' + i + '" data-k="stripsCount" type="number" value="' + esc(it.stripsCount || 0) + '"></td>' +
        '<td><input data-di="' + i + '" data-k="freeStrips" type="number" value="' + esc(it.freeStrips || 0) + '"></td>' +
        '<td><input data-di="' + i + '" data-k="schemeLabel" value="' + esc(it.schemeLabel || ((it.freeStrips > 0) ? (it.stripsCount + '+' + it.freeStrips) : '')) + '"></td>' +
        '<td><input data-di="' + i + '" data-k="rackLocation" value="' + esc(it.rackLocation || '') + '"></td>' +
        '<td class="owner-only"><input data-di="' + i + '" data-k="ptrPerStrip" type="number" step="0.01" value="' + esc(it.ptrPerStrip || 0) + '"></td>' +
        '<td><input data-di="' + i + '" data-k="mrpPerStrip" type="number" step="0.01" value="' + esc(it.mrpPerStrip || 0) + '"></td>' +
        '<td><button type="button" class="btn small danger" data-delrow="' + i + '">' + esc(t('deleteRow')) + '</button></td></tr>').join('') +
      '</tbody></table></div>' +
      '<div class="actions" style="margin-top:10px"><button type="button" class="btn" id="addRow">' + esc(t('addRow')) + '</button><button type="button" class="btn primary" id="saveBill">' + esc(t('saveBill')) + '</button></div>';
  }

  function invoiceItems(id) {
    return (state.invoiceItems || []).filter(li => li.invoice_id === id);
  }

  function openInvoice(id) {
    const inv = (state.invoices || []).find(row => row.id === id);
    if (!inv) return;
    const items = invoiceItems(id);
    openModal(
      '<div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;margin-bottom:10px"><div><h2 style="margin:0">' + esc(inv.invoice_number) + '</h2><div class="muted">' + esc(inv.supplier_name) + ' · ' + esc(pretty(inv.invoice_date)) + '</div></div>' +
      '<button type="button" class="btn small" id="modalClose">' + esc(t('close')) + '</button></div>' +
      '<div class="bill-grid"><div><div class="label">' + esc(t('billPhoto')) + '</div>' +
      (inv.bill_photo_url ? '<img alt="" src="' + esc(inv.bill_photo_url) + '">' : '<div class="empty">' + esc(t('billPhoto')) + '</div>') +
      '</div><div>' + payPill(inv.payment_status) +
      '<div class="muted" style="margin:8px 0">' + esc(t('subtotal')) + ' ' + inr(inv.subtotal_amount) + ' · ' + esc(t('gst')) + ' ' + inr(inv.gst_amount) + ' · ' + esc(t('total')) + ' ' + inr(inv.total_amount) + '</div>' +
      '<div class="table-wrap"><table class="data"><thead><tr><th>' + esc(t('brand')) + '</th><th>' + esc(t('strips')) + '</th><th>' + esc(t('free')) + '</th><th>' + esc(t('scheme')) + '</th><th class="owner-only">' + esc(t('ptr')) + '</th><th>' + esc(t('mrp')) + '</th><th>' + esc(t('rack')) + '</th></tr></thead><tbody>' +
      items.map(li => '<tr><td>' + esc(li.brand_name) + '</td><td>' + esc(li.strips_qty) + '</td><td>' + esc(li.free_strips_qty) + '</td><td>' + esc(li.scheme_label || '—') + '</td><td class="owner-only num">' + inr(li.ptr_per_strip) + '</td><td class="num">' + inr(li.mrp_per_strip) + '</td><td>' + esc(li.rack_location || '') + '</td></tr>').join('') +
      '</tbody></table></div>' +
      (inv.payment_status === 'PAID'
        ? '<div style="margin-top:10px"><span class="pill ok">' + esc(t('paid')) + '</span> <span class="pill info">' + esc(t('paidRef')) + ': ' + esc(inv.payment_reference || '—') + '</span></div>'
        : '<div class="toolbar" style="margin-top:10px"><label class="field grow"><span>' + esc(t('paymentRef')) + '</span><input id="payRef" placeholder="' + esc(t('paymentRef')) + '"></label>' +
          '<button type="button" class="btn green" id="markPaid">' + esc(t('markPaid')) + '</button></div>') +
      '</div></div>'
    );
    const mark = document.getElementById('markPaid');
    if (mark) mark.onclick = () => {
      const paymentReference = document.getElementById('payRef').value;
      closeModal();
      run(() => StoreEngine.setInvoicePayment(id, { paymentStatus: 'PAID', paymentReference }), t('saved'));
    };
  }

  function inventory() {
    const q = invQ.trim().toLowerCase();
    const meds = (state.medicines || []).filter(m => !q || m.brand_name.toLowerCase().includes(q) || (m.salt_composition || '').toLowerCase().includes(q) || (m.rack_location || '').toLowerCase().includes(q));
    const focus = q.length >= 3 ? meds[0] : null;
    const batch = focus ? earliest(focus.id) : null;
    return '<div class="page-head"><div><h1>' + esc(t('navInventory')) + '</h1></div><button type="button" class="btn primary" id="quickRack">' + esc(t('quickRack')) + '</button></div>' +
      '<div class="toolbar"><label class="field grow"><span>' + esc(t('inventorySearch')) + '</span><input id="invQ" type="search" value="' + esc(invQ) + '"></label>' +
      '<button type="button" class="btn" id="invVoice">' + esc(t('voice')) + '</button></div>' +
      (focus ? rackCard(focus, batch) : '') +
      (meds.length ? '<div class="table-wrap panel"><table class="data"><thead><tr><th>' + esc(t('brand')) + '</th><th>' + esc(t('rack')) + '</th><th>' + esc(t('pack')) + '</th><th>' + esc(t('strips')) + '</th><th>' + esc(t('status')) + '</th><th></th></tr></thead><tbody>' +
        meds.slice(0, 40).map(m => {
          const stock = stockOf(m.id);
          const soon = stock.rows.some(b => b.days_to_expiry <= 90 && b.total_units > 0);
          return '<tr><td><b>' + esc(m.brand_name) + '</b><div class="muted">' + esc(m.salt_composition) + '</div></td><td>' + esc(m.rack_location) + '</td><td>' + esc(m.pack_label) + '</td><td>' + stock.strips + '</td><td>' + stockPill(stock.strips, m.min_stock_strips || m.min_reorder_strips) + (soon ? ' <span class="pill warn">' + esc(t('expiringSoon')) + '</span>' : '') + '</td><td><button type="button" class="btn small" data-sub="' + esc(m.id) + '">' + esc(t('findSubstitute')) + '</button></td></tr>';
        }).join('') +
      '</tbody></table></div>' : '<div class="empty">' + esc(t('noMatch')) + '</div>');
  }

  function substitutesFor(med) {
    const salt = (med.salt_composition || '').toLowerCase();
    const key = salt.split('+')[0].trim().split(' ')[0];
    const rows = (state.batches || []).filter(b => {
      const s = (b.salt_composition || '').toLowerCase();
      return b.total_units > 0 && (s === salt || (key && s.includes(key)));
    }).map(b => {
      const margin = b.mrp_per_strip > 0 ? ((b.mrp_per_strip - b.ptr_per_strip) / b.mrp_per_strip) * 100 : 0;
      return Object.assign({}, b, { margin_percent: margin, sell_first: b.days_to_expiry <= 90 });
    });
    const top = rows.reduce((max, row) => Math.max(max, row.margin_percent), 0);
    return rows.map(row => Object.assign({}, row, { highest_margin: top > 0 && row.margin_percent === top }));
  }

  function openSubstitutes(id) {
    const med = findMed(id);
    if (!med) return;
    const rows = substitutesFor(med);
    openModal(
      '<div style="display:flex;justify-content:space-between;gap:8px;align-items:center;margin-bottom:8px"><h2 style="margin:0">' + esc(t('substitutes')) + '</h2><button type="button" class="btn small" id="modalClose">' + esc(t('close')) + '</button></div>' +
      '<p class="muted">' + esc(med.salt_composition) + '</p>' + rackCard(med, earliest(id)) +
      '<div class="table-wrap"><table class="data"><thead><tr><th>' + esc(t('brand')) + '</th><th>' + esc(t('rack')) + '</th><th>' + esc(t('expiry')) + '</th><th>' + esc(t('strips')) + '</th><th class="owner-only">' + esc(t('margin')) + '</th><th></th></tr></thead><tbody>' +
      rows.map(row => '<tr><td>' + esc(row.brand_name) + '</td><td>' + esc(row.rack_location) + '</td><td>' + esc(pretty(row.expiry_date)) + '</td><td>' + row.strips_count + '</td><td class="owner-only">' + row.margin_percent.toFixed(1) + '%</td><td>' +
        (row.sell_first ? '<span class="pill warn">' + esc(t('sellFirst')) + '</span> ' : '') +
        (owner && row.highest_margin ? '<span class="pill info">' + esc(t('highestMargin')) + ' (' + row.margin_percent.toFixed(0) + '%)</span>' : '') +
      '</td></tr>').join('') +
      '</tbody></table></div>'
    );
  }

  function openQuickRack() {
    const supplierOpts = (state.suppliers || []).map(s => '<option value="' + esc(s.id) + '">' + esc(s.name) + '</option>').join('');
    openModal(
      '<div style="display:flex;justify-content:space-between;gap:8px;align-items:center;margin-bottom:10px"><h2 style="margin:0">' + esc(t('quickRack')) + '</h2><button type="button" class="btn small" id="modalClose">' + esc(t('close')) + '</button></div>' +
      '<div class="toolbar"><label class="field grow"><span>' + esc(t('brand')) + '</span><input id="qrBrand"></label>' +
      '<label class="field"><span>' + esc(t('salt')) + '</span><input id="qrSalt"></label>' +
      '<label class="field"><span>' + esc(t('rack')) + '</span><input id="qrRack" value="Rack A-1"></label></div>' +
      '<div class="toolbar"><label class="field"><span>' + esc(t('pack')) + '</span><input id="qrPack" type="number" value="10"></label>' +
      '<label class="field"><span>' + esc(t('batch')) + '</span><input id="qrBatch" value="SHLF-101"></label>' +
      '<label class="field"><span>' + esc(t('expiry')) + '</span><input id="qrExp" type="date" value="2027-08-31"></label>' +
      '<label class="field"><span>' + esc(t('strips')) + '</span><input id="qrStrips" type="number" value="10"></label>' +
      '<label class="field"><span>' + esc(t('loose')) + '</span><input id="qrLoose" type="number" value="0"></label>' +
      '<label class="field owner-only"><span>' + esc(t('ptr')) + '</span><input id="qrPtr" type="number" value="80"></label>' +
      '<label class="field"><span>' + esc(t('mrp')) + '</span><input id="qrMrp" type="number" value="110"></label>' +
      '<label class="field"><span>' + esc(t('supplier')) + '</span><select id="qrSup">' + supplierOpts + '</select></label></div>' +
      '<button type="button" class="btn primary" id="qrSave">' + esc(t('saveRack')) + '</button>'
    );
    document.getElementById('qrSave').onclick = () => run(async () => {
      const payload = {
        brandName: document.getElementById('qrBrand').value,
        saltComposition: document.getElementById('qrSalt').value,
        rackLocation: document.getElementById('qrRack').value,
        packSizeUnits: document.getElementById('qrPack').value,
        batchNumber: document.getElementById('qrBatch').value,
        expiryDate: document.getElementById('qrExp').value,
        stripsCount: document.getElementById('qrStrips').value,
        looseTabletsCount: document.getElementById('qrLoose').value,
        ptrPerStrip: document.getElementById('qrPtr').value,
        mrpPerStrip: document.getElementById('qrMrp').value,
        supplierId: document.getElementById('qrSup').value
      };
      closeModal();
      return StoreEngine.quickRackOnboard(payload);
    }, t('saved'));
  }

  function shortbook() {
    const groups = {};
    (state.shortbook || []).forEach(item => {
      const key = item.supplier_id || item.supplier_name || 'none';
      if (!groups[key]) groups[key] = { key, name: item.supplier_name || t('unassigned'), phone: item.supplier_phone || '', items: [] };
      groups[key].items.push(item);
    });
    const cards = Object.values(groups);
    const supplierOpts = '<option value="">' + esc(t('unassigned')) + '</option>' + (state.suppliers || []).map(s => '<option value="' + esc(s.id) + '">' + esc(s.name) + '</option>').join('');
    return '<div class="page-head"><div><h1>' + esc(t('navShortbook')) + '</h1><p class="lede">' + esc(t('shortAdd')) + '</p></div>' +
      '<button type="button" class="btn" id="manageSuppliers">' + esc(t('manageSuppliers')) + '</button></div>' +
      '<section class="panel"><div class="toolbar"><label class="field grow"><span>' + esc(t('brand')) + '</span><input id="sbName"></label>' +
      '<label class="field" style="width:90px"><span>' + esc(t('qty')) + '</span><input id="sbQty" type="number" value="1" min="1"></label>' +
      '<label class="field"><span>' + esc(t('supplier')) + '</span><select id="sbSup">' + supplierOpts + '</select></label>' +
      '<label class="field grow"><span>' + esc(t('note')) + '</span><input id="sbNote"></label>' +
      '<button type="button" class="btn primary" id="sbAdd">' + esc(t('add')) + '</button></div></section>' +
      (cards.length ? '<div class="cards">' + cards.map(card =>
        '<article class="supplier-card"><header><div><b>' + esc(card.name) + '</b><div class="muted">' + card.items.length + '</div></div>' +
        '<div class="actions"><button type="button" class="btn small green" data-order="' + esc(card.key) + '">' + esc(t('sendOrder')) + '</button>' +
        '<button type="button" class="btn small" data-order-copy="' + esc(card.key) + '">' + esc(t('copyOrder')) + '</button>' +
        '<button type="button" class="btn small" data-mark="' + esc(card.key) + '" data-status="ORDERED">' + esc(t('markOrdered')) + '</button>' +
        '<button type="button" class="btn small danger" data-mark="' + esc(card.key) + '" data-status="CLEARED">' + esc(t('clearLines')) + '</button></div></header>' +
        card.items.map(item => '<label class="check" style="padding:6px 0;border-top:1px solid #f1f5f9"><input type="checkbox" data-sb="' + esc(item.id) + '" data-group="' + esc(card.key) + '">' +
          '<span style="flex:1"><b>' + esc(item.brand_name) + '</b> <span class="pill neutral">' + esc(item.source === 'AUTO' ? t('auto') : t('manual')) + '</span><div class="muted">' + esc(item.pack_label || '') +
          (owner && item.last_ptr != null ? ' · <span class="owner-only">' + esc(t('lastPtr')) + ' ' + inr(item.last_ptr) + '</span>' : '') +
          (item.last_scheme ? ' · ' + esc(item.last_scheme) : '') + '</div></span>' +
          '<input data-sbqty="' + esc(item.id) + '" type="number" min="1" value="' + esc(shortQty[item.id] != null ? shortQty[item.id] : item.requested_strips) + '" style="width:72px"></label>'
        ).join('') + '</article>'
      ).join('') + '</div>' : '<div class="empty">' + esc(t('emptyShort')) + '</div>');
  }

  function orderText(key) {
    const items = (state.shortbook || []).filter(item => (item.supplier_id || item.supplier_name || 'none') === key);
    if (!items.length) return { text: '', phone: '', items: [] };
    const lines = [
      state.settings.store_name + ' — ' + t('orderTitle'),
      state.settings.city,
      t('supplier') + ': ' + (items[0].supplier_name || t('unassigned')),
      '----------------------------------------',
      ...items.map((item, i) => {
        const qty = shortQty[item.id] != null ? shortQty[item.id] : item.requested_strips;
        return (i + 1) + '. ' + item.brand_name + '\n   ' + t('pack') + ': ' + (item.pack_label || '—') + '\n   ' + t('qty') + ': ' + qty + ' ' + t('stripsUnit') + (owner ? '\n   ' + t('lastPtr') + ': ' + (item.last_ptr != null ? inr(item.last_ptr) : '—') : '') + (item.last_scheme ? '\n   ' + t('scheme') + ': ' + item.last_scheme : '');
      }),
      '----------------------------------------'
    ];
    return { text: lines.join('\n'), phone: items[0].supplier_phone || '', items };
  }

  function checkedIds(key) {
    return Array.from(document.querySelectorAll('input[data-sb][data-group="' + key + '"]:checked')).map(el => el.getAttribute('data-sb'));
  }

  function counter() {
    const q = pos.q.trim().toLowerCase();
    const meds = !q ? [] : (state.medicines || []).filter(m => m.brand_name.toLowerCase().includes(q) || (m.salt_composition || '').toLowerCase().includes(q)).slice(0, 8);
    const med = findMed(pos.medicineId);
    const batch = med ? earliest(med.id) : (q.length >= 3 && meds[0] ? earliest(meds[0].id) : null);
    const shown = med || (q.length >= 3 ? meds[0] : null);
    const customers = state.customers || [];
    return '<div class="page-head"><div><h1>' + esc(t('navCounter')) + '</h1><p class="lede">' + esc(t('counterLead')) + '</p></div></div>' +
      '<div class="split"><section class="panel"><div class="toolbar"><label class="field grow"><span>' + esc(t('inventorySearch')) + '</span><input id="posQ" type="search" value="' + esc(pos.q) + '"></label><button type="button" class="btn" id="posVoice">' + esc(t('voice')) + '</button></div>' +
      (meds.length && !med ? '<div class="actions" style="margin-bottom:8px">' + meds.map(m => '<button type="button" class="btn small" data-pick="' + esc(m.id) + '">' + esc(m.brand_name) + '</button>').join('') + '</div>' : '') +
      (shown ? rackCard(shown, batch) : '') +
      '<div class="toolbar"><div class="field"><span>' + esc(t('strips')) + '</span><span class="stepper"><button type="button" id="posStripMinus">−</button><b id="posStrips">' + pos.strips + '</b><button type="button" id="posStripPlus">+</button></span></div>' +
      '<div class="field"><span>' + esc(t('loose')) + '</span><span class="stepper"><button type="button" id="posLooseMinus">−</button><b id="posLoose">' + pos.loose + '</b><button type="button" id="posLoosePlus">+</button></span></div></div>' +
      salePreview(shown, batch) +
      '<div class="seg" id="paySeg" style="margin:8px 0">' +
        ['CASH', 'UPI', 'CREDIT'].map(mode => '<button type="button" data-pay="' + mode + '" class="' + (pos.pay === mode ? 'on' : '') + '">' + esc(mode === 'CASH' ? t('cash') : mode === 'UPI' ? t('upi') : t('creditAccount')) + '</button>').join('') +
      '</div>' +
      (pos.pay === 'CREDIT' ? '<div class="toolbar"><label class="field"><span>' + esc(t('pickCustomer')) + '</span><select id="posPick"><option value=""></option>' + customers.map(c => '<option value="' + esc(c.id) + '">' + esc(c.name) + ' · ' + esc(c.phone) + '</option>').join('') + '</select></label>' +
        '<label class="field grow"><span>' + esc(t('customer')) + '</span><input id="posName" value="' + esc(pos.name) + '"></label>' +
        '<label class="field"><span>' + esc(t('phone')) + '</span><input id="posPhone" value="' + esc(pos.phone) + '" inputmode="numeric"></label></div>' : '') +
      '<div class="toolbar"><label class="field grow"><span>' + esc(t('doctor')) + '</span><input id="posDoctor" value="' + esc(pos.doctor) + '"></label>' +
      '<label class="check"><input id="posSchedule" type="checkbox"' + (pos.schedule ? ' checked' : '') + '> ' + esc(t('schedule')) + '</label>' +
      (pos.schedule ? '<label class="field"><span>' + esc(t('interval')) + '</span><select id="posInterval"><option value="30"' + (pos.interval === '30' ? ' selected' : '') + '>' + esc(t('days30')) + '</option><option value="15"' + (pos.interval === '15' ? ' selected' : '') + '>' + esc(t('days15')) + '</option><option value="custom"' + (pos.interval === 'custom' ? ' selected' : '') + '>' + esc(t('custom')) + '</option></select></label>' +
        (pos.interval === 'custom' ? '<label class="field" style="width:90px"><span>' + esc(t('days')) + '</span><input id="posCustom" type="number" min="1" value="' + esc(pos.customDays) + '"></label>' : '') : '') +
      '</div><div class="actions split-cta"><button type="button" class="btn" id="btnSaveDraftVoucher">' + esc(t('saveDraftVoucher')) + '</button><button type="button" class="btn primary" id="btnFinalizeNow">' + esc(t('finalizeVoucher')) + '</button></div></section>' +
      '<section class="panel"><h2>' + esc(t('recent')) + '</h2>' + recentSales() + '</section></div>';
  }

  function salePreview(med, batch) {
    if (!med) return '';
    const pack = (batch && batch.pack_size_units) || med.pack_size_units || 10;
    const rate = batch ? Number(batch.mrp_per_strip) || 0 : 0;
    const units = (pos.strips * pack) + pos.loose;
    const total = pack > 0 ? (units / pack) * rate : 0;
    return '<div class="panel" id="salePreview" style="margin:8px 0"><div class="kpi-label">' + esc(t('estimatedTotal')) + '</div>' +
      '<div class="kpi-value">' + inr(total) + '</div>' +
      '<div class="muted">' + esc(t('unitBreakdown')) + ': ' + pos.strips + ' ' + esc(t('stripsUnit')) + ' + ' + pos.loose + ' ' + esc(t('looseUnit')) +
      ' · ' + units + ' @ ' + pack + '/' + esc(t('pack')) + '</div></div>';
  }

  function recentSales() {
    const rows = (state.sales || []).slice(0, 12);
    if (!rows.length) return '<div class="empty">' + esc(t('emptySales')) + '</div>';
    return '<div class="table-wrap"><table class="data"><thead><tr><th>' + esc(t('brand')) + '</th><th>' + esc(t('qty')) + '</th><th>' + esc(t('amount')) + '</th><th></th></tr></thead><tbody>' +
      rows.map(sale => '<tr><td>' + esc(sale.brand_name) + (sale.is_cancelled ? ' <span class="pill neutral">' + esc(t('undo')) + '</span>' : '') + '<div class="muted">' + esc(sale.patient_name || '') + '</div></td><td>' + sale.strips_sold + ' / ' + sale.loose_tablets_sold + '</td><td class="num">' + inr(sale.billed_amount) + '</td><td class="actions">' +
        (sale.is_cancelled ? '' : '<button type="button" class="btn small" data-receipt="' + esc(sale.id) + '">' + esc(t('viewReceipt')) + '</button><button type="button" class="btn small danger" data-undo="' + esc(sale.id) + '">' + esc(t('undo')) + '</button>') +
      '</td></tr>').join('') + '</tbody></table></div>';
  }

  function credit() {
    const customers = state.customers || [];
    const current = customers.find(c => c.id === creditId) || customers[0];
    const txns = current ? (state.creditTransactions || []).filter(tx => tx.customer_id === current.id) : [];
    return '<div class="page-head"><div><h1>' + esc(t('navCredit')) + '</h1><p class="lede">' + esc(t('creditLead')) + '</p></div></div>' +
      '<div class="split"><section class="panel">' +
      (customers.length ? '<div class="table-wrap"><table class="data"><thead><tr><th>' + esc(t('customer')) + '</th><th>' + esc(t('phone')) + '</th><th>' + esc(t('outstanding')) + '</th><th>' + esc(t('lastTxn')) + '</th></tr></thead><tbody>' +
        customers.map(c => '<tr data-cus="' + esc(c.id) + '" style="cursor:pointer"><td><b>' + esc(c.name) + '</b></td><td>' + esc(c.phone) + '</td><td class="num">' + inr(c.outstanding_balance) + '</td><td>' + esc(pretty(c.last_txn_at)) + '</td></tr>').join('') +
      '</tbody></table></div>' : '<div class="empty">' + esc(t('emptyCredit')) + '</div>') +
      '</section><section class="panel">' + (current ? creditDetail(current, txns) : '') + '</section></div>';
  }

  function txnLabel(type) {
    if (type === 'PAYMENT') return t('paymentReceived');
    if (type === 'REVERSAL') return t('reversal');
    return t('creditSale');
  }

  function statementText(customer, txns) {
    const lines = [
      state.settings.store_name,
      state.settings.city,
      t('navCredit'),
      t('customer') + ': ' + customer.name,
      t('phone') + ': ' + customer.phone,
      '----------------------------------------',
      ...txns.slice().reverse().map(tx => pretty(tx.created_at) + ' | ' + txnLabel(tx.txn_type) + ' | ' + (tx.item_summary || tx.reference_note || '') + ' | ' + inr(tx.amount)),
      '----------------------------------------',
      t('outstanding') + ': ' + inr(customer.outstanding_balance)
    ];
    return lines.join('\n');
  }

  function creditDetail(customer, txns) {
    return '<header style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start"><div><h2 style="margin:0">' + esc(customer.name) + '</h2><div class="muted">' + esc(customer.phone) + '</div></div><div class="kpi-value">' + inr(customer.outstanding_balance) + '</div></header>' +
      '<div class="actions" style="margin:8px 0"><button type="button" class="btn small green" id="sendStatement">' + esc(t('sendStatement')) + '</button><button type="button" class="btn small" id="copyStatement">' + esc(t('copyStatement')) + '</button></div>' +
      '<h2>' + esc(t('timeline')) + '</h2><div class="timeline">' +
      (txns.length ? txns.map(tx => '<div class="tl"><div class="muted">' + esc(pretty(tx.created_at)) + '</div><div><b>' + esc(txnLabel(tx.txn_type)) + '</b><div class="muted">' + esc(tx.item_summary || tx.reference_note || '') + '</div></div><div class="num">' + inr(tx.amount) + '</div></div>').join('') : '<div class="empty">—</div>') +
      '</div><h2 style="margin-top:12px">' + esc(t('recordPayment')) + '</h2>' +
      '<div class="toolbar"><label class="field"><span>' + esc(t('payAmount')) + '</span><input id="payAmt" type="number" min="0" step="0.01" value="' + esc(customer.outstanding_balance || 0) + '"></label>' +
      '<div class="seg" id="payMode"><button type="button" data-pm="CASH" class="on">' + esc(t('cash')) + '</button><button type="button" data-pm="UPI">' + esc(t('upi')) + '</button></div>' +
      '<button type="button" class="btn primary" id="savePay">' + esc(t('recordPayment')) + '</button></div>';
  }

  function refills() {
    const all = state.refills || [];
    const rows = refillFilter === 'due' ? all.filter(row => row.due_soon) : all;
    const meds = state.medicines || [];
    const head = '<div class="page-head"><div><h1>' + esc(t('navRefills')) + '</h1><p class="lede">' + esc(t('refillLead')) + '</p></div></div>' +
      '<div class="seg" id="refillFilter" style="margin-bottom:10px"><button type="button" data-rfilter="due" class="' + (refillFilter === 'due' ? 'on' : '') + '">' + esc(t('dueSoonFilter')) + '</button>' +
      '<button type="button" data-rfilter="all" class="' + (refillFilter === 'all' ? 'on' : '') + '">' + esc(t('allSchedules')) + '</button></div>' +
      '<section class="panel"><h2>' + esc(t('addRefill')) + '</h2><div class="toolbar">' +
      '<label class="field"><span>' + esc(t('patient')) + '</span><input id="rfName"></label>' +
      '<label class="field"><span>' + esc(t('phone')) + '</span><input id="rfPhone" inputmode="numeric"></label>' +
      '<label class="field grow"><span>' + esc(t('brand')) + '</span><select id="rfMed">' + meds.map(m => '<option value="' + esc(m.id) + '">' + esc(m.brand_name) + '</option>').join('') + '</select></label>' +
      '<label class="field" style="width:80px"><span>' + esc(t('strips')) + '</span><input id="rfStrips" type="number" min="1" value="1"></label>' +
      '<label class="field"><span>' + esc(t('interval')) + '</span><select id="rfEvery"><option value="30">' + esc(t('days30')) + '</option><option value="15">' + esc(t('days15')) + '</option></select></label>' +
      '<button type="button" class="btn primary" id="rfAdd">' + esc(t('add')) + '</button></div></section>';
    if (!rows.length) return head + '<div class="empty">' + esc(t('emptyRefill')) + '</div>';
    return head + '<div class="cards">' +
      rows.map(row => {
        const due = row.due_soon;
        return '<article class="refill-card' + (due ? ' due' : '') + '"><header><div><b>' + esc(row.patient_name) + '</b><div class="muted">' + esc(row.phone) + '</div></div>' +
          (due ? '<span class="pill warn">' + esc(t('dueSoon')) + '</span>' : row.status === 'NOTIFIED' ? '<span class="pill info">' + esc(t('notified')) + '</span>' : '<span class="pill neutral">' + esc(row.status) + '</span>') +
          '</header><div><b>' + esc(row.brand_name) + '</b> · ' + row.strips_qty + ' ' + esc(t('stripsUnit')) + '</div>' +
          '<div class="muted">' + esc(t('lastBuy')) + ' ' + esc(pretty(row.last_purchase_date)) + ' · ' + esc(t('nextDue')) + ' ' + esc(pretty(row.next_due_date)) + ' · ' + esc(t('dueIn')) + ' ' + row.days_until_due + '</div>' +
          '<div style="margin:8px 0">' + (row.low_stock ? '<span class="pill low">' + esc(t('lowHint')) + '</span>' : '<span class="pill ok">' + esc(t('inStock')) + ': ' + row.stock_strips + ' ' + esc(t('stripsLeft')) + '</span>') + '</div>' +
          '<div class="actions"><button type="button" class="btn small green" data-alert="' + esc(row.id) + '">' + esc(t('sendAlert')) + '</button>' +
          '<button type="button" class="btn small" data-alert-copy="' + esc(row.id) + '">' + esc(t('copyAlert')) + '</button>' +
          '<button type="button" class="btn small" data-notified="' + esc(row.id) + '">' + esc(t('markNotified')) + '</button>' +
          '<button type="button" class="btn small primary" data-fulfill="' + esc(row.id) + '">' + esc(t('oneTap')) + '</button>' +
          (row.low_stock ? '<button type="button" class="btn small" data-short="' + esc(row.id) + '">' + esc(t('shortAdd')) + '</button>' : '') +
          '</div></article>';
      }).join('') + '</div>';
  }

  function alertText(row) {
    if (lang === 'hi') {
      return [
        'नमस्ते ' + row.patient_name + ',',
        'आपकी ' + row.brand_name + ' की मासिक दवा (' + row.strips_qty + ' पट्टी) ' + pretty(row.next_due_date) + ' को देय है। कृपया अक्षय मेडिकोज़, उज्जैन आइए या व्हाट्सऐप पर पुष्टि करें।',
        state.settings.phone || ''
      ].join('\n');
    }
    return [
      state.settings.store_name,
      state.settings.city,
      'Hello ' + row.patient_name + ', your monthly refill of ' + row.brand_name + ' (' + row.strips_qty + ' strip' + (Number(row.strips_qty) === 1 ? '' : 's') + ') is due on ' + pretty(row.next_due_date) + '. Please visit ' + state.settings.store_name + ', ' + state.settings.city + ', or reply on WhatsApp to confirm.'
    ].join('\n');
  }

  function schemes() {
    const offers = (state.offers || []).filter(row => {
      const q = schemeQuery.trim().toLowerCase();
      if (!q) return true;
      if (schemeMode === 'brand') return String(row.brand_name || '').toLowerCase().includes(q);
      return String(row.salt_composition || '').toLowerCase().includes(q);
    });
    const salts = Array.from(new Set((state.offers || []).map(row => row.salt_composition).filter(Boolean)));
    const brands = Array.from(new Set((state.offers || []).map(row => row.brand_name).filter(Boolean)));
    const choices = schemeMode === 'brand' ? brands : salts;
    return '<div class="page-head"><div><h1>' + esc(t('navSchemes')) + '</h1><p class="lede">' + esc(t('schemesLead')) + '</p></div>' +
      '<div class="actions"><button type="button" class="btn" id="manageSuppliers">' + esc(t('manageSuppliers')) + '</button>' +
      '<button type="button" class="btn primary" id="addOffer">' + esc(t('addOffer')) + '</button></div></div>' +
      '<div class="seg" id="schemeMode" style="margin-bottom:10px"><button type="button" data-smode="salt" class="' + (schemeMode === 'salt' ? 'on' : '') + '">' + esc(t('compareSalt')) + '</button>' +
      '<button type="button" data-smode="brand" class="' + (schemeMode === 'brand' ? 'on' : '') + '">' + esc(t('compareBrand')) + '</button></div>' +
      '<div class="toolbar"><label class="field grow"><span>' + esc(schemeMode === 'brand' ? t('brand') : t('salt')) + '</span>' +
      '<input id="schemeQ" list="schemeChoices" value="' + esc(schemeQuery) + '" placeholder="' + esc(schemeMode === 'brand' ? 'Pan-D' : 'Amoxicillin') + '"></label>' +
      '<datalist id="schemeChoices">' + choices.map(name => '<option value="' + esc(name) + '"></option>').join('') + '</datalist></div>' +
      '<p class="muted">' + esc(t('ptrHint')) + '</p>' +
      (offers.length ? '<div class="table-wrap panel"><table class="data"><thead><tr><th>' + esc(t('shortCode')) + '</th><th>' + esc(t('supplier')) + '</th><th>' + esc(t('brand')) + '</th><th>' + esc(t('salt')) + '</th><th title="' + esc(t('ptrHint')) + '">' + esc(t('ptr')) + '</th><th>' + esc(t('mrp')) + '</th><th>' + esc(t('scheme')) + '</th><th>' + esc(t('cashDiscount')) + '</th><th>' + esc(t('netBuy')) + '</th><th>' + esc(t('margin')) + '</th><th>' + esc(t('validUntil')) + '</th><th></th></tr></thead><tbody>' +
        offers.map(row => '<tr class="' + (row.best_margin ? 'best-deal' : '') + '"><td><b>' + esc(row.short_code || '') + '</b></td><td>' + esc(row.supplier_name || '') + '</td><td>' + esc(row.brand_name) + '</td><td>' + esc(row.salt_composition) + '</td><td class="num">' + inr(row.buy_price_ptr) + '</td><td class="num">' + inr(row.mrp) + '</td><td>' + esc(row.scheme_label || t('noScheme')) + '</td><td>' + esc(row.cash_discount_pct || 0) + '%</td><td class="num">' + inr(row.net_buy_price) + '</td><td>' + Number(row.retail_margin_pct || 0).toFixed(0) + '%' + (row.best_margin ? ' <span class="pill ok">' + esc(t('bestDeal')) + '</span>' : '') + '</td><td>' + esc(pretty(row.valid_until)) + '<div class="muted">' + esc(row.source || '') + '</div></td><td><button type="button" class="btn small primary" data-deal="' + esc(row.id) + '">' + esc(t('orderDeal')) + '</button></td></tr>').join('') +
      '</tbody></table></div>' : '<div class="empty">' + esc(t('noMatch')) + '</div>');
  }

  function audit() {
    const racks = Array.from(new Set((state.batches || []).map(b => b.rack_location))).sort();
    const q = auditQ.trim().toLowerCase();
    const rows = (state.batches || []).filter(b => (auditRack === 'ALL' || b.rack_location === auditRack) && (!q || b.brand_name.toLowerCase().includes(q) || b.batch_number.toLowerCase().includes(q)));
    return '<div class="page-head"><div><h1>' + esc(t('navAudit')) + '</h1><p class="lede">' + esc(t('auditLead')) + '</p></div></div>' +
      '<div class="toolbar"><label class="field"><span>' + esc(t('rackFilter')) + '</span><select id="auditRack"><option value="ALL">' + esc(t('allRacks')) + '</option>' + racks.map(r => '<option' + (auditRack === r ? ' selected' : '') + '>' + esc(r) + '</option>').join('') + '</select></label>' +
      '<label class="field grow"><span>' + esc(t('inventorySearch')) + '</span><input id="auditQ" type="search" value="' + esc(auditQ) + '"></label></div>' +
      (rows.length ? '<div class="table-wrap panel"><table class="data"><thead><tr><th>' + esc(t('brand')) + '</th><th>' + esc(t('batch')) + '</th><th>' + esc(t('system')) + '</th><th>' + esc(t('physicalStrips')) + '</th><th>' + esc(t('physicalLoose')) + '</th><th>' + esc(t('variance')) + '</th><th></th></tr></thead><tbody>' +
        rows.slice(0, 40).map(b => {
          if (!auditCounts[b.id]) auditCounts[b.id] = { strips: b.strips_count, loose: b.loose_tablets_count };
          const c = auditCounts[b.id];
          const vs = (parseInt(c.strips, 10) || 0) - b.strips_count;
          const vl = (parseInt(c.loose, 10) || 0) - b.loose_tablets_count;
          return '<tr><td>' + esc(b.brand_name) + '<div class="muted">' + esc(b.rack_location) + '</div></td><td>' + esc(b.batch_number) + '</td><td>' + b.strips_count + ' + ' + b.loose_tablets_count + '</td>' +
            '<td><input data-ac="' + esc(b.id) + '" data-k="strips" type="number" value="' + esc(c.strips) + '" style="width:80px"></td>' +
            '<td><input data-ac="' + esc(b.id) + '" data-k="loose" type="number" value="' + esc(c.loose) + '" style="width:80px"></td>' +
            '<td data-var="' + esc(b.id) + '">' + (vs > 0 ? '+' : '') + vs + ' / ' + (vl > 0 ? '+' : '') + vl + '</td>' +
            '<td><button type="button" class="btn small" data-reconcile="' + esc(b.id) + '">' + esc(t('reconcile')) + '</button></td></tr>';
        }).join('') + '</tbody></table></div>' : '<div class="empty">' + esc(t('emptyAudit')) + '</div>') +
      '<section class="panel"><h2>' + esc(t('history')) + '</h2>' +
      ((state.audits || []).length ? '<div class="table-wrap"><table class="data"><thead><tr><th>' + esc(t('brand')) + '</th><th>' + esc(t('variance')) + '</th><th>' + esc(t('note')) + '</th></tr></thead><tbody>' +
        state.audits.slice(0, 8).map(a => '<tr><td>' + esc(a.brand_name) + ' · ' + esc(a.batch_number) + '</td><td>' + a.variance_strips + ' / ' + a.variance_loose_tablets + '</td><td>' + esc(a.audit_note || '') + '</td></tr>').join('') +
      '</tbody></table></div>' : '<div class="empty">—</div>') + '</section>';
  }

  function render() {
    paintChrome();
    const root = document.getElementById('app');
    const legacy = { dashboard, bills, inventory, shortbook, schemes, counter, credit, refills, audit };
    const builders = v3api ? Object.assign(legacy, v3api.views) : legacy;
    const draw = builders[view] || builders['emp-counter'] || dashboard;
    root.innerHTML = draw();
    if (!owner) root.querySelectorAll('.owner-only').forEach(node => node.remove());
    bind();
    if (v3api) v3api.bind();
    armIdle();
  }

  function bind() {
    document.getElementById('applyExpiry') && (document.getElementById('applyExpiry').onclick = () => {
      expiryDraft = parseInt(document.getElementById('expiryDays').value, 10) || 60;
      run(() => StoreEngine.updateSettings({ expiry_alert_days: expiryDraft }), t('saved'));
    });
    document.querySelectorAll('[data-return]').forEach(btn => btn.onclick = () => {
      const group = state.whatsappReturnSummary[btn.getAttribute('data-return')];
      const text = returnText(group);
      window.open(wa(group.supplierPhone, text), '_blank');
    });
    document.querySelectorAll('[data-return-copy]').forEach(btn => btn.onclick = () => {
      const group = state.whatsappReturnSummary[btn.getAttribute('data-return-copy')];
      textModal(t('expiryClaims'), returnText(group), wa(group.supplierPhone, returnText(group)));
    });
    const billInput = document.getElementById('billQ');
    if (billInput) {
      billInput.oninput = () => { billQ = billInput.value; render(); const el = document.getElementById('billQ'); if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } };
      document.getElementById('billStatus').onchange = (e) => { billStatus = e.target.value; render(); };
      document.getElementById('billFrom').onchange = (e) => { billFrom = e.target.value; render(); };
      document.getElementById('billTo').onchange = (e) => { billTo = e.target.value; render(); };
    }
    document.querySelectorAll('[data-invoice]').forEach(btn => btn.onclick = () => openInvoice(btn.getAttribute('data-invoice')));
    document.querySelectorAll('[data-template]').forEach(btn => btn.onclick = () => run(async () => {
      draft = await StoreEngine.parseBill({ templateId: btn.getAttribute('data-template') });
      return null;
    }));
    const blank = document.getElementById('blankBill');
    if (blank) blank.onclick = () => { draft = { supplierName: '', invoiceNumber: '', invoiceDate: '2026-10-27', paymentStatus: 'CREDIT', items: [blankItem()] }; render(); };
    document.querySelectorAll('#manageSuppliers').forEach(btn => btn.onclick = openSuppliers);
    const billFile = document.getElementById('billFile');
    if (billFile) billFile.onchange = async () => {
      const file = billFile.files && billFile.files[0];
      if (!file) return;
      const photo = await fileToData(file);
      await run(async () => { draft = await StoreEngine.parseBill({ file, photoDataUrl: photo }); return null; });
    };
    document.querySelectorAll('[data-di]').forEach(input => input.oninput = () => {
      const item = draft.items[input.getAttribute('data-di')];
      const key = input.getAttribute('data-k');
      item[key] = input.type === 'number' ? Number(input.value) : input.value;
    });
    const dSupplier = document.getElementById('dSupplier');
    if (dSupplier) {
      dSupplier.oninput = () => { draft.supplierName = dSupplier.value; };
      document.getElementById('dInv').oninput = (e) => { draft.invoiceNumber = e.target.value; };
      document.getElementById('dDate').onchange = (e) => { draft.invoiceDate = e.target.value; };
      const dPay = document.getElementById('dPay');
      if (dPay) dPay.onchange = (e) => { draft.paymentStatus = e.target.value; };
      const addRow = document.getElementById('addRow');
      if (addRow) addRow.onclick = () => { draft.items.push(blankItem()); render(); };
      document.querySelectorAll('[data-delrow]').forEach(btn => btn.onclick = () => {
        draft.items.splice(parseInt(btn.getAttribute('data-delrow'), 10), 1);
        if (!draft.items.length) draft.items.push(blankItem());
        render();
      });
      document.getElementById('saveBill').onclick = () => run(async () => {
        const saved = await StoreEngine.saveInvoice(draft);
        draft = null;
        return saved;
      }, t('saved'));
    }
    const invInput = document.getElementById('invQ');
    if (invInput) {
      invInput.oninput = () => { invQ = invInput.value; render(); const el = document.getElementById('invQ'); if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } };
      document.getElementById('invVoice').onclick = () => speakInto(invInput, (text) => { invQ = text; });
    }
    document.querySelectorAll('[data-sub]').forEach(btn => btn.onclick = () => openSubstitutes(btn.getAttribute('data-sub')));
    const quick = document.getElementById('quickRack');
    if (quick) quick.onclick = openQuickRack;
    const sbAdd = document.getElementById('sbAdd');
    if (sbAdd) sbAdd.onclick = () => run(() => StoreEngine.addShortbook({
      brandName: document.getElementById('sbName').value,
      requestedStrips: document.getElementById('sbQty').value,
      supplierId: document.getElementById('sbSup').value,
      note: document.getElementById('sbNote').value
    }), t('saved'));
    document.querySelectorAll('[data-sbqty]').forEach(input => input.oninput = () => { shortQty[input.getAttribute('data-sbqty')] = input.value; });
    document.querySelectorAll('[data-order]').forEach(btn => btn.onclick = () => {
      const pack = orderText(btn.getAttribute('data-order'));
      window.open(wa(pack.phone, pack.text), '_blank');
    });
    document.querySelectorAll('[data-order-copy]').forEach(btn => btn.onclick = () => {
      const pack = orderText(btn.getAttribute('data-order-copy'));
      textModal(t('orderTitle'), pack.text, wa(pack.phone, pack.text));
    });
    document.querySelectorAll('[data-mark]').forEach(btn => btn.onclick = () => {
      const key = btn.getAttribute('data-mark');
      let ids = checkedIds(key);
      if (!ids.length) ids = (state.shortbook || []).filter(item => (item.supplier_id || item.supplier_name || 'none') === key).map(item => item.id);
      const quantities = {};
      ids.forEach(id => { if (shortQty[id] != null) quantities[id] = shortQty[id]; });
      run(() => StoreEngine.markShortbook({ ids, status: btn.getAttribute('data-status'), quantities }), t('saved'));
    });
    bindCounter();
    bindCredit();
    bindSchemes();
    bindRefills();
    document.querySelectorAll('[data-alert]').forEach(btn => btn.onclick = () => {
      const row = (state.refills || []).find(r => r.id === btn.getAttribute('data-alert'));
      window.open(wa(row.phone, alertText(row)), '_blank');
    });
    document.querySelectorAll('[data-alert-copy]').forEach(btn => btn.onclick = () => {
      const row = (state.refills || []).find(r => r.id === btn.getAttribute('data-alert-copy'));
      textModal(t('navRefills'), alertText(row), wa(row.phone, alertText(row)));
    });
    document.querySelectorAll('[data-notified]').forEach(btn => btn.onclick = () => run(() => StoreEngine.notifyRefill(btn.getAttribute('data-notified')), t('saved')));
    document.querySelectorAll('[data-fulfill]').forEach(btn => btn.onclick = () => run(() => StoreEngine.fulfillRefill(btn.getAttribute('data-fulfill')), t('sold')));
    document.querySelectorAll('[data-short]').forEach(btn => btn.onclick = () => {
      const row = (state.refills || []).find(r => r.id === btn.getAttribute('data-short'));
      run(() => StoreEngine.addShortbook({ brandName: row.brand_name, requestedStrips: row.strips_qty, note: row.patient_name }), t('saved'));
    });
    const auditSelect = document.getElementById('auditRack');
    if (auditSelect) {
      auditSelect.onchange = () => { auditRack = auditSelect.value; render(); };
      document.getElementById('auditQ').oninput = (e) => { auditQ = e.target.value; render(); const el = document.getElementById('auditQ'); if (el) el.focus(); };
    }
    document.querySelectorAll('[data-ac]').forEach(input => input.oninput = () => {
      const id = input.getAttribute('data-ac');
      const batch = (state.batches || []).find(b => b.id === id);
      auditCounts[id] = auditCounts[id] || { strips: 0, loose: 0 };
      auditCounts[id][input.getAttribute('data-k')] = input.value;
      if (!batch) return;
      const vs = (parseInt(auditCounts[id].strips, 10) || 0) - batch.strips_count;
      const vl = (parseInt(auditCounts[id].loose, 10) || 0) - batch.loose_tablets_count;
      const cell = document.querySelector('[data-var="' + id + '"]');
      if (cell) cell.textContent = (vs > 0 ? '+' : '') + vs + ' / ' + (vl > 0 ? '+' : '') + vl;
    });
    document.querySelectorAll('[data-reconcile]').forEach(btn => btn.onclick = () => {
      const id = btn.getAttribute('data-reconcile');
      const c = auditCounts[id] || { strips: 0, loose: 0 };
      run(() => StoreEngine.recordAudit({ batchId: id, countedStrips: c.strips, countedLooseTablets: c.loose, auditNote: t('reconcile') }), t('saved'));
    });
  }

  function bindCounter() {
    const q = document.getElementById('posQ');
    if (!q) return;
    q.oninput = () => { pos.q = q.value; pos.medicineId = ''; render(); const el = document.getElementById('posQ'); if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } };
    document.getElementById('posVoice').onclick = () => speakInto(q, (text) => { pos.q = text; pos.medicineId = ''; });
    document.querySelectorAll('[data-pick]').forEach(btn => btn.onclick = () => { pos.medicineId = btn.getAttribute('data-pick'); const med = findMed(pos.medicineId); pos.q = med ? med.brand_name : pos.q; render(); });
    document.getElementById('posStripMinus').onclick = () => { pos.strips = Math.max(0, pos.strips - 1); render(); };
    document.getElementById('posStripPlus').onclick = () => { pos.strips += 1; render(); };
    document.getElementById('posLooseMinus').onclick = () => { pos.loose = Math.max(0, pos.loose - 1); render(); };
    document.getElementById('posLoosePlus').onclick = () => { pos.loose += 1; render(); };
    document.querySelectorAll('[data-pay]').forEach(btn => btn.onclick = () => { pos.pay = btn.getAttribute('data-pay'); render(); });
    const pick = document.getElementById('posPick');
    if (pick) pick.onchange = () => {
      const customer = (state.customers || []).find(c => c.id === pick.value);
      if (customer) { pos.name = customer.name; pos.phone = customer.phone; }
      render();
    };
    const name = document.getElementById('posName');
    if (name) name.oninput = () => { pos.name = name.value; };
    const phone = document.getElementById('posPhone');
    if (phone) phone.oninput = () => { pos.phone = phone.value; };
    document.getElementById('posDoctor').oninput = (e) => { pos.doctor = e.target.value; };
    document.getElementById('posSchedule').onchange = (e) => { pos.schedule = e.target.checked; render(); };
    const interval = document.getElementById('posInterval');
    if (interval) interval.onchange = () => { pos.interval = interval.value; render(); };
    const custom = document.getElementById('posCustom');
    if (custom) custom.oninput = () => { pos.customDays = parseInt(custom.value, 10) || 30; };
    const charge = document.getElementById('btnFinalizeNow') || document.getElementById('posCharge');
    if (charge) charge.onclick = () => {
      const med = findMed(pos.medicineId) || ((pos.q.trim().length >= 3) ? (state.medicines || []).find(m => m.brand_name.toLowerCase().includes(pos.q.trim().toLowerCase())) : null);
      if (!med) return toast(t('noMatch'));
      if (!pos.strips && !pos.loose) return toast(t('needQty'));
      const phoneDigits = digits(pos.phone);
      if ((pos.pay === 'CREDIT' || pos.schedule) && (phoneDigits.length !== 10 || (pos.pay === 'CREDIT' && !pos.name.trim()))) {
        return toast(pos.pay === 'CREDIT' ? t('needCredit') : t('phoneError'));
      }
      const intervalDays = pos.interval === 'custom' ? pos.customDays : parseInt(pos.interval, 10);
      run(() => StoreEngine.recordSale({
        medicineId: med.id,
        stripsSold: pos.strips,
        looseTabletsSold: pos.loose,
        patientName: pos.name,
        doctorName: pos.doctor,
        customerPhone: phoneDigits,
        paymentMode: pos.pay,
        scheduleRefill: pos.schedule,
        refillIntervalDays: intervalDays
      }), t('sold'));
    };
    document.querySelectorAll('[data-undo]').forEach(btn => btn.onclick = () => run(() => StoreEngine.undoSale(btn.getAttribute('data-undo')), t('restored')));
    document.querySelectorAll('[data-receipt]').forEach(btn => btn.onclick = () => openReceipt(btn.getAttribute('data-receipt')));
  }

  async function openReceipt(id) {
    try {
      const result = await StoreEngine.updateSaleCustomer(id, {});
      const text = result.receiptText;
      const url = result.whatsappUrl;
      textModal(t('viewReceipt'), text, url);
    } catch (err) {
      toast(err.message || t('failed'));
    }
  }

  function bindSchemes() {
    document.querySelectorAll('[data-smode]').forEach(btn => btn.onclick = () => {
      schemeMode = btn.getAttribute('data-smode');
      schemeQuery = '';
      render();
    });
    const q = document.getElementById('schemeQ');
    if (q) q.oninput = () => { schemeQuery = q.value; render(); const el = document.getElementById('schemeQ'); if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } };
    const add = document.getElementById('addOffer');
    if (add) add.onclick = openOfferForm;
    document.querySelectorAll('[data-deal]').forEach(btn => btn.onclick = () => {
      run(async () => {
        const next = await StoreEngine.orderOffer(btn.getAttribute('data-deal'), { requestedStrips: 1 });
        view = 'shortbook';
        return next;
      }, t('saved'));
    });
  }

  function bindRefills() {
    document.querySelectorAll('[data-rfilter]').forEach(btn => btn.onclick = () => { refillFilter = btn.getAttribute('data-rfilter'); render(); });
    const add = document.getElementById('rfAdd');
    if (!add) return;
    add.onclick = () => run(() => StoreEngine.createRefill({
      patientName: document.getElementById('rfName').value,
      phone: document.getElementById('rfPhone').value,
      medicineId: document.getElementById('rfMed').value,
      stripsQty: document.getElementById('rfStrips').value,
      intervalDays: document.getElementById('rfEvery').value
    }), t('saved'));
  }

  function bindCredit() {
    let payMode = 'CASH';
    document.querySelectorAll('[data-cus]').forEach(row => row.onclick = () => { creditId = row.getAttribute('data-cus'); render(); });
    document.querySelectorAll('[data-pm]').forEach(btn => btn.onclick = () => {
      payMode = btn.getAttribute('data-pm');
      document.querySelectorAll('[data-pm]').forEach(el => el.classList.toggle('on', el === btn));
    });
    const save = document.getElementById('savePay');
    if (save) save.onclick = () => run(() => StoreEngine.recordPayment({
      customerId: creditId,
      amount: document.getElementById('payAmt').value,
      paymentMode: payMode
    }), t('saved'));
    const send = document.getElementById('sendStatement');
    if (send) {
      const customer = (state.customers || []).find(c => c.id === creditId);
      const txns = (state.creditTransactions || []).filter(tx => tx.customer_id === creditId);
      const text = statementText(customer, txns);
      send.onclick = () => window.open(wa(customer.phone, text), '_blank');
      document.getElementById('copyStatement').onclick = () => textModal(t('navCredit'), text, wa(customer.phone, text));
    }
  }

  function speakInto(input, assign) {
    if (!window.VoiceInput || !VoiceInput.supported()) {
      toast(t('voiceUnsupported'));
      return;
    }
    toast(t('voiceListening'));
    VoiceInput.start(lang === 'hi' ? 'hi-IN' : 'en-IN', {
      onFinal: (text) => { assign(text); input.value = text; render(); },
      onError: () => toast(t('voiceUnsupported'))
    });
  }

  function fileToData(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => resolve('');
      reader.readAsDataURL(file);
    });
  }

  function openChangePin() {
    openModal(
      '<h2 style="margin-top:0">' + esc(t('changePin')) + '</h2>' +
      '<label class="field"><span>' + esc(t('newPin')) + '</span><input id="pinInput" type="password" inputmode="numeric" maxlength="4" autocomplete="off"></label>' +
      '<div class="actions" style="margin-top:10px"><button type="button" class="btn primary" id="pinGo">' + esc(t('saveSupplier')) + '</button><button type="button" class="btn" id="modalClose">' + esc(t('cancel')) + '</button></div>' +
      '<p id="pinErr" class="muted"></p>'
    );
    const pinInput = document.getElementById('pinInput');
    pinInput.focus();
    const submit = () => {
      const pin = pinInput.value.trim();
      if (!/^\d{4}$/.test(pin)) {
        document.getElementById('pinErr').textContent = t('wrongPin');
        return;
      }
      closeModal();
      run(() => StoreEngine.updateSettings({ owner_pin: pin }), t('saved'));
    };
    pinInput.onkeydown = (event) => { if (event.key === 'Enter') submit(); };
    document.getElementById('pinGo').onclick = submit;
  }

  function openSuppliers() {
    const rows = state.suppliers || [];
    openModal(
      '<div style="display:flex;justify-content:space-between;gap:8px;align-items:center;margin-bottom:8px"><h2 style="margin:0">' + esc(t('manageSuppliers')) + '</h2><button type="button" class="btn small" id="modalClose">' + esc(t('close')) + '</button></div>' +
      '<div class="table-wrap"><table class="data"><thead><tr><th>' + esc(t('shortCode')) + '</th><th>' + esc(t('supplier')) + '</th><th>' + esc(t('phone')) + '</th><th></th></tr></thead><tbody>' +
      rows.map(s => '<tr><td>' + esc(s.short_code || '') + '</td><td>' + esc(s.name) + '</td><td>' + esc(s.phone) + '</td><td><button type="button" class="btn small" data-edit-sup="' + esc(s.id) + '">' + esc(t('editSupplier')) + '</button></td></tr>').join('') +
      '</tbody></table></div><h2>' + esc(t('addSupplier')) + '</h2>' + supplierFields('new') +
      '<button type="button" class="btn primary" id="saveNewSup">' + esc(t('saveSupplier')) + '</button>'
    );
    document.getElementById('saveNewSup').onclick = () => run(async () => {
      const next = await StoreEngine.saveSupplier(readSupplierForm('new'));
      closeModal();
      return next;
    }, t('saved'));
    document.querySelectorAll('[data-edit-sup]').forEach(btn => btn.onclick = () => {
      const sup = (state.suppliers || []).find(s => s.id === btn.getAttribute('data-edit-sup'));
      if (sup) openSupplierEdit(sup);
    });
  }

  function supplierFields(prefix, sup) {
    sup = sup || {};
    return '<div class="toolbar">' +
      '<label class="field grow"><span>' + esc(t('supplier')) + '</span><input id="' + prefix + 'Name" value="' + esc(sup.name || '') + '"></label>' +
      '<label class="field"><span>' + esc(t('shortCode')) + '</span><input id="' + prefix + 'Code" value="' + esc(sup.short_code || '') + '" placeholder="S1"></label>' +
      '<label class="field"><span>' + esc(t('phone')) + '</span><input id="' + prefix + 'Phone" value="' + esc(sup.phone || '') + '" inputmode="numeric"></label>' +
      '<label class="field"><span>GSTIN</span><input id="' + prefix + 'Gst" value="' + esc(sup.gstin || '') + '"></label>' +
      '<label class="field grow"><span>' + esc(t('location')) + '</span><input id="' + prefix + 'Addr" value="' + esc(sup.address || '') + '" placeholder="Freeganj, Ujjain"></label>' +
      '<label class="field"><span>' + esc(t('creditDays')) + '</span><input id="' + prefix + 'Days" type="number" value="' + esc(sup.credit_days != null ? sup.credit_days : 21) + '"></label>' +
      '<label class="field"><span>' + esc(t('cashDiscount')) + '</span><input id="' + prefix + 'Disc" type="number" step="0.1" value="' + esc(sup.cash_discount_pct || 0) + '"></label></div>';
  }

  function readSupplierForm(prefix) {
    return {
      name: document.getElementById(prefix + 'Name').value,
      shortCode: document.getElementById(prefix + 'Code').value,
      phone: document.getElementById(prefix + 'Phone').value,
      gstin: document.getElementById(prefix + 'Gst').value,
      address: document.getElementById(prefix + 'Addr').value,
      creditDays: document.getElementById(prefix + 'Days').value,
      cashDiscountPct: document.getElementById(prefix + 'Disc').value
    };
  }

  function openSupplierEdit(sup) {
    openModal(
      '<div style="display:flex;justify-content:space-between;gap:8px;align-items:center"><h2 style="margin:0">' + esc(t('editSupplier')) + '</h2><button type="button" class="btn small" id="modalClose">' + esc(t('close')) + '</button></div>' +
      supplierFields('edit', sup) +
      '<button type="button" class="btn primary" id="saveEditSup">' + esc(t('saveSupplier')) + '</button>'
    );
    document.getElementById('saveEditSup').onclick = () => run(async () => {
      const next = await StoreEngine.saveSupplier(readSupplierForm('edit'), sup.id);
      closeModal();
      return next;
    }, t('saved'));
  }

  function openOfferForm() {
    const suppliers = state.suppliers || [];
    const meds = state.medicines || [];
    openModal(
      '<div style="display:flex;justify-content:space-between;gap:8px;align-items:center"><h2 style="margin:0">' + esc(t('addOffer')) + '</h2><button type="button" class="btn small" id="modalClose">' + esc(t('close')) + '</button></div>' +
      '<div class="toolbar"><label class="field"><span>' + esc(t('supplier')) + '</span><select id="ofSup">' + suppliers.map(s => '<option value="' + esc(s.id) + '">' + esc((s.short_code || '') + ' ' + s.name) + '</option>').join('') + '</select></label>' +
      '<label class="field grow"><span>' + esc(t('brand')) + '</span><select id="ofMed"><option value=""></option>' + meds.map(m => '<option value="' + esc(m.id) + '">' + esc(m.brand_name) + '</option>').join('') + '</select></label>' +
      '<label class="field grow"><span>' + esc(t('brand')) + '</span><input id="ofBrand"></label>' +
      '<label class="field grow"><span>' + esc(t('salt')) + '</span><input id="ofSalt"></label></div>' +
      '<div class="toolbar"><label class="field"><span>' + esc(t('ptr')) + '</span><input id="ofPtr" type="number" step="0.01" value="100"></label>' +
      '<label class="field"><span>' + esc(t('mrp')) + '</span><input id="ofMrp" type="number" step="0.01" value="140"></label>' +
      '<label class="field"><span>' + esc(t('scheme')) + '</span><input id="ofScheme" value="10+1" placeholder="10+2"></label>' +
      '<label class="field"><span>' + esc(t('cashDiscount')) + '</span><input id="ofDisc" type="number" step="0.1" value="0"></label>' +
      '<label class="field"><span>' + esc(t('validUntil')) + '</span><input id="ofUntil" type="date" value="2026-11-26"></label></div>' +
      '<p class="muted">' + esc(t('ptrHint')) + '</p>' +
      '<button type="button" class="btn primary" id="saveOffer">' + esc(t('add')) + '</button>'
    );
    document.getElementById('ofMed').onchange = () => {
      const med = findMed(document.getElementById('ofMed').value);
      if (!med) return;
      document.getElementById('ofBrand').value = med.brand_name;
      document.getElementById('ofSalt').value = med.salt_composition;
    };
    document.getElementById('saveOffer').onclick = () => run(async () => {
      const med = findMed(document.getElementById('ofMed').value);
      const next = await StoreEngine.saveOffer({
        supplierId: document.getElementById('ofSup').value,
        medicineId: med ? med.id : '',
        brandName: document.getElementById('ofBrand').value || (med ? med.brand_name : ''),
        saltComposition: document.getElementById('ofSalt').value || (med ? med.salt_composition : ''),
        buyPricePtr: document.getElementById('ofPtr').value,
        mrp: document.getElementById('ofMrp').value,
        schemeLabel: document.getElementById('ofScheme').value,
        cashDiscountPct: document.getElementById('ofDisc').value,
        validUntil: document.getElementById('ofUntil').value,
        source: 'Manual Monthly Circular'
      });
      closeModal();
      return next;
    }, t('saved'));
  }

  function openPin() {
    openModal(
      '<h2 style="margin-top:0">' + esc(t('pinTitle')) + '</h2><p class="muted">' + esc(t('pinHint')) + '</p>' +
      '<input id="pinInput" type="password" inputmode="numeric" maxlength="4" autocomplete="off">' +
      '<div class="actions" style="margin-top:10px"><button type="button" class="btn primary" id="pinGo">' + esc(t('unlock')) + '</button><button type="button" class="btn" id="modalClose">' + esc(t('cancel')) + '</button></div>' +
      '<p id="pinErr" class="muted"></p>'
    );
    const pinInput = document.getElementById('pinInput');
    pinInput.focus();
    pinInput.onkeydown = (event) => { if (event.key === 'Enter') document.getElementById('pinGo').click(); };
    document.getElementById('pinGo').onclick = () => {
      const pin = document.getElementById('pinInput').value.trim();
      StoreEngine.unlock({ method: 'pin', pin: pin }).then(async function () {
        owner = true;
        applyState(await StoreEngine.bootstrap());
        closeModal();
        view = 'adm-pl';
        render();
      }).catch(function () {
        document.getElementById('pinErr').textContent = t('wrongPin');
      });
    };
  }

  async function openQr() {
    let info = {
      githubRawApkUrl: RAW_APK,
      githubApkUrl: RAW_APK,
      githubReleaseApkUrl: RELEASE_APK,
      localApkUrl: (location.origin && location.origin !== 'null' ? location.origin : '') + '/download/UjjainMedStore-v1.0.apk'
    };
    try {
      const res = await fetch('/api/setup-info');
      const json = await res.json();
      if (json && json.ok) info = Object.assign(info, json);
    } catch (_e) {}
    const host = location.hostname;
    const onLoopback = !host || host === 'localhost' || host === '127.0.0.1' || host === '::1' || location.protocol === 'file:';
    let mode = onLoopback ? 'raw' : 'lan';
    const urls = {
      raw: info.githubRawApkUrl || info.githubApkUrl || RAW_APK,
      release: info.githubReleaseApkUrl || RELEASE_APK,
      lan: info.localApkUrl || info.apkUrl
    };
    let current = urls[mode];
    openModal(
      '<div style="display:flex;justify-content:space-between;gap:8px;align-items:center"><h2 style="margin:0">' + esc(t('getApp')) + '</h2><button type="button" class="btn small" id="modalClose">' + esc(t('close')) + '</button></div>' +
      '<p class="muted">' + esc(t('qrLead')) + '</p>' +
      '<div class="seg" id="qrMode"><button type="button" data-qmode="raw">' + esc(t('githubMain')) + '</button><button type="button" data-qmode="release">' + esc(t('githubRelease')) + '</button><button type="button" data-qmode="lan">' + esc(t('localWifi')) + '</button><button type="button" data-qmode="custom">' + esc(t('customUrl')) + '</button></div>' +
      '<label class="field" id="qrCustomWrap" style="display:none;margin-top:8px"><span>' + esc(t('customUrl')) + '</span><input id="qrCustom" type="url"></label>' +
      '<div class="qr-box" id="qrBox"></div><p id="qrLink" class="muted" style="word-break:break-all;font-size:12px"></p>' +
      '<div class="actions"><a class="btn primary" id="qrDownload" href="' + esc(current) + '">' + esc(t('downloadApk')) + '</a><button type="button" class="btn" id="qrCopy">' + esc(t('copyLink')) + '</button></div>'
    );
    function paint(url) {
      current = url;
      document.getElementById('qrLink').textContent = url;
      document.getElementById('qrDownload').href = url;
      const box = document.getElementById('qrBox');
      try {
        const qr = qrcode(0, 'M');
        qr.addData(url);
        qr.make();
        box.innerHTML = qr.createSvgTag({ cellSize: 8, margin: 16, scalable: true });
      } catch (_e) {
        box.innerHTML = '<img alt="QR" src="/api/qr.svg?text=' + encodeURIComponent(url) + '">';
      }
      document.querySelectorAll('#qrMode button').forEach(btn => btn.classList.toggle('on', btn.getAttribute('data-qmode') === mode));
    }
    document.getElementById('qrMode').onclick = (event) => {
      const btn = event.target.closest('button');
      if (!btn) return;
      mode = btn.getAttribute('data-qmode');
      document.getElementById('qrCustomWrap').style.display = mode === 'custom' ? 'block' : 'none';
      if (mode === 'custom') paint(document.getElementById('qrCustom').value || current);
      else paint(urls[mode]);
    };
    document.getElementById('qrCustom').oninput = (e) => { if (e.target.value) paint(e.target.value.trim()); };
    document.getElementById('qrCopy').onclick = () => copyText(current);
    paint(current);
  }

  document.getElementById('modnav').addEventListener('click', (event) => {
    const btn = event.target.closest('[data-view]');
    if (!btn) return;
    view = btn.getAttribute('data-view');
    subview = SUB_DEFAULT[view] || subview;
    render();
  });
  function lockEmployee() {
    owner = false;
    view = 'emp-counter';
    subview = 'pos';
    if (StoreEngine.lock) StoreEngine.lock();
    render();
  }
  function armIdle() {
    clearTimeout(idleTimer);
    if (!owner) return;
    const mins = (state && state.settings && state.settings.admin_lock_minutes) || 15;
    idleTimer = setTimeout(lockEmployee, mins * 60 * 1000);
  }
  ['pointerdown', 'keydown'].forEach(type => document.addEventListener(type, () => { if (owner) armIdle(); }));
  document.getElementById('ownerBtn').onclick = () => {
    if (owner) lockEmployee();
    else if (v3api) v3api.openUnlock();
    else openPin();
  };
  const helpBtn = document.getElementById('helpBtn');
  if (helpBtn) helpBtn.onclick = () => { if (v3api) v3api.startTutorial(); };
  document.getElementById('langEn').onclick = () => setLang('en');
  document.getElementById('langHi').onclick = () => setLang('hi');
  document.getElementById('apkBtn').onclick = openQr;

  function setLang(next) {
    lang = next;
    render();
    StoreEngine.updateSettings({ default_language: next }).then(applyState).catch(() => {});
  }

  function currentMed() {
    return findMed(pos.medicineId) || ((pos.q.trim().length >= 3)
      ? (state.medicines || []).find(m => m.brand_name.toLowerCase().includes(pos.q.trim().toLowerCase()))
      : null);
  }

  v3api = window.AkshayV3({
    t, esc, inr, toast, pretty, wa,
    state: () => state,
    owner: () => owner,
    setOwner: (value) => { owner = value; },
    view: () => view,
    setView: (value) => { view = value; },
    sub: () => subview,
    setSub: (value) => { subview = value; },
    render: () => render(),
    run, openModal, closeModal, pos: () => pos, findMed, currentMed, fileToData,
    counter, credit, refills, inventory, shortbook, bills, schemes, audit,
    lang: () => lang,
    setLang,
    applyState,
    openChangePin,
    returnText
  });

  async function boot() {
    document.getElementById('app').innerHTML = '<p class="muted">' + esc(t('loading')) + '</p>';
    paintChrome();
    try {
      const session = await StoreEngine.adminSession();
      owner = !!(session && session.admin);
      if (owner) { view = 'adm-pl'; subview = 'margin'; }
      applyState(await StoreEngine.bootstrap());
      lang = state.settings.default_language === 'hi' ? 'hi' : 'en';
      render();
    } catch (err) {
      document.getElementById('app').innerHTML = '<p>' + esc(err.message || t('failed')) + '</p><button type="button" class="btn" id="retry">' + esc(t('retry')) + '</button>';
      document.getElementById('retry').onclick = boot;
    }
  }

  boot();
})();
