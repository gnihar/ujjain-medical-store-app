(function () {
  window.AkshayV3 = function (b) {
    let authTab = 'pin';
    let pinBuf = '';
    let patternSeq = [];
    let patternDraw = false;
    let voiceParsed = null;
    let listening = false;
    let stock = { brand: '', salt: '', strips: 10, loose: 0, rack: 'Rack A-1', batch: '', expiry: '2027-08-31', ptr: 0, mrp: 0 };
    let plRange = '1d';
    let prorateOn = false;
    let plOverride = null;
    let seasonMonth = '';
    let expWindow = '30';
    let expSupplier = 'ALL';
    let expStatus = 'ALL';
    let expPick = {};
    let expenseFilter = 'ALL';
    let tutorialOn = false;
    let tutorialStep = 0;
    let opsSub = 'counter';
    let plSub = 'margin';

    const STEPS = [
      { view: 'emp-counter', sub: 'pos', sel: '#posPanel', title: 'tut1Title', body: 'tut1Body', next: 'tutNextStock' },
      { view: 'emp-stock', sub: 'add', sel: '#stockAddBar', title: 'tut2Title', body: 'tut2Body', next: 'tutNextExpiry' },
      { view: 'emp-expiry', sub: '', sel: '#expiryReturnPanel', title: 'tut3Title', body: 'tut3Body', next: 'tutNextAdmin' },
      { view: 'emp-help', sub: '', sel: '#ownerBtn', title: 'tut4Title', body: 'tut4Body', next: 'tutNextDemo' },
      { view: 'emp-help', sub: '', sel: '#demoControlBar', title: 'tut5Title', body: 'tut5Body', next: 'tutDone' }
    ];

    function subSeg(items) {
      return '<div class="seg subseg" role="tablist">' + items.map(function (item) {
        const on = b.sub() === item[0] ? ' on' : '';
        const badge = item[2] ? ' <span class="badge">' + b.esc(item[2]) + '</span>' : '';
        return '<button type="button" data-subview="' + item[0] + '" class="' + on + '">' + b.esc(item[1]) + badge + '</button>';
      }).join('') + '</div>';
    }

    function quota(state) {
      return (state && state.aiQuota) || { remaining: 300, monthly_limit: 300, calls_used: 0, level: 'ok' };
    }

    function quotaPill(q) {
      const left = q.remaining;
      const limit = q.monthly_limit || 300;
      let cls = q.level || 'ok';
      let label;
      if (left <= 0) label = b.t('aiExhausted');
      else if (left < 10) label = b.t('aiCrit').replace('{n}', left).replace('{limit}', limit);
      else label = b.t('aiLeft').replace('{n}', left).replace('{limit}', limit);
      return '<span class="pill ai-quota ' + cls + '" id="aiQuotaPill">' + b.esc(label) + '</span>';
    }

    function draftRows() {
      return ((b.state() && b.state().vouchers) || []).filter(function (v) { return v.status === 'DRAFT'; });
    }

    function draftPanel() {
      const rows = draftRows();
      if (!rows.length) return '<section class="panel" id="draft-vouchers-panel"><h2>' + b.esc(b.t('draftQueue')) + '</h2><div class="empty">' + b.esc(b.t('noDrafts')) + '</div></section>';
      return '<section class="panel" id="draft-vouchers-panel"><h2>' + b.esc(b.t('draftQueue')) + ' (' + rows.length + ')</h2>' +
        rows.map(function (v) {
          let items = v.items || [];
          const summary = items.map(function (it) { return (it.brandName || it.brand_name || it.medicineId || '') + (it.strips ? ' × ' + it.strips : ''); }).join(', ');
          return '<article class="draft-row"><div><b>#' + b.esc(v.voucher_number) + '</b> · ' + b.esc(v.voucher_type) + ' · ' + b.esc(v.customer_or_supplier || '') +
            '<div class="muted">' + b.esc(summary) + '</div></div><div class="num">' + b.inr(v.total_amount) + '</div>' +
            '<div class="actions"><button type="button" class="btn small" data-vedit="' + b.esc(v.id) + '">' + b.esc(b.t('edit')) + '</button>' +
            '<button type="button" class="btn small danger" data-vcancel="' + b.esc(v.id) + '">' + b.esc(b.t('cancel')) + '</button>' +
            '<button type="button" class="btn small primary" data-vfinal="' + b.esc(v.id) + '">' + b.esc(b.t('finalizeVoucher')) + '</button></div></article>';
        }).join('') + '</section>';
    }

    function empCounter() {
      const drafts = draftRows().length;
      const body = b.sub() === 'credit' ? b.credit() : b.sub() === 'refills' ? b.refills() : '<div id="posPanel">' + b.counter() + draftPanel() + '</div>';
      return '<div class="page-head"><div><h1>' + b.esc(b.t('tabEmpCounter')) + '</h1><p class="lede">' + b.esc(b.t('counterLead')) + '</p></div></div>' +
        subSeg([['pos', b.t('subFast'), drafts ? String(drafts) : ''], ['credit', b.t('subCredit'), ''], ['refills', b.t('subRefills'), '']]) + body;
    }

    function stockForm() {
      const q = quota(b.state());
      const blocked = q.remaining <= 0;
      const ptrField = b.owner()
        ? '<label class="field owner-only"><span>' + b.esc(b.t('ptr')) + '</span><input id="stPtr" type="number" step="0.01" value="' + b.esc(stock.ptr) + '"></label>'
        : '';
      return '<div id="stockAddBar" class="split">' +
        '<section class="panel"><h2>' + b.esc(b.t('scanTitle')) + '</h2><p class="muted">' + b.esc(b.t('scanLead')) + '</p>' + quotaPill(q) +
        '<div class="actions" style="margin-top:10px"><label class="btn primary' + (blocked ? ' disabled' : '') + '">' + b.esc(b.t('openCamera')) +
        '<input id="aiScanFile" type="file" accept="image/*" capture="environment" hidden' + (blocked ? ' disabled' : '') + '></label></div>' +
        (blocked ? '<p class="muted">' + b.esc(b.t('aiBlocked')) + '</p>' : '') +
        '<p id="aiScanMsg" class="muted"></p></section>' +
        '<section class="panel"><h2>' + b.esc(b.t('voiceAddStock')) + '</h2><p class="muted">' + b.esc(b.t('voiceLead')) + '</p>' +
        '<button type="button" class="btn btn-voice" id="btnVoiceStockAdd">' + b.esc(b.t('tapSpeak')) + '</button>' +
        '<div id="voiceWaveform" class="voice-wave" hidden><span></span><span></span><span></span><span></span><span></span></div>' +
        '<textarea id="voiceTranscriptPreview" placeholder="' + b.esc(b.t('voiceSample')) + '"></textarea>' +
        '<div id="voiceChips" class="chips"></div>' +
        '<div class="actions"><button type="button" class="btn" id="btnVoiceParse">' + b.esc(b.t('fillForm')) + '</button></div></section></div>' +
        '<section class="panel"><h2>' + b.esc(b.t('manualAdd')) + '</h2><div class="toolbar">' +
        '<label class="field grow"><span>' + b.esc(b.t('brand')) + '</span><input id="stBrand" value="' + b.esc(stock.brand) + '"></label>' +
        '<label class="field"><span>' + b.esc(b.t('strips')) + '</span><input id="stStrips" type="number" value="' + b.esc(stock.strips) + '"></label>' +
        '<label class="field"><span>' + b.esc(b.t('loose')) + '</span><input id="stLoose" type="number" value="' + b.esc(stock.loose) + '"></label>' +
        '<label class="field"><span>' + b.esc(b.t('rack')) + '</span><input id="stRack" value="' + b.esc(stock.rack) + '"></label>' +
        '<label class="field"><span>' + b.esc(b.t('batch')) + '</span><input id="stBatch" value="' + b.esc(stock.batch) + '"></label>' +
        '<label class="field"><span>' + b.esc(b.t('expiry')) + '</span><input id="stExp" type="date" value="' + b.esc(stock.expiry) + '"></label>' +
        ptrField +
        '<label class="field"><span>' + b.esc(b.t('mrp')) + '</span><input id="stMrp" type="number" step="0.01" value="' + b.esc(stock.mrp) + '"></label></div>' +
        '<div class="actions"><button type="button" class="btn" id="btnSavePurchaseDraft">' + b.esc(b.t('saveDraftVoucher')) + '</button>' +
        '<button type="button" class="btn primary" id="btnFinalizePurchase">' + b.esc(b.t('saveRack')) + '</button></div></section>';
    }

    function empStock() {
      const sub = b.sub();
      const body = sub === 'add' ? stockForm() : sub === 'short' ? b.shortbook() : b.inventory();
      return '<div class="page-head"><div><h1>' + b.esc(b.t('tabEmpStock')) + '</h1></div>' + quotaPill(quota(b.state())) + '</div>' +
        subSeg([['search', b.t('subSearch'), ''], ['add', b.t('subAdd'), ''], ['short', b.t('subShort'), '']]) + body;
    }

    function expiryPanel() {
      const state = b.state() || { batches: [], expiryReturns: [], suppliers: [] };
      const windows = [['expired', b.t('winExpired')], ['30', b.t('win30')], ['60', b.t('win60')], ['90', b.t('win90')]];
      const batches = (state.batches || []).filter(function (row) {
        if (!row.total_units || row.is_return_claimed) return false;
        const d = Number(row.days_to_expiry);
        if (expWindow === 'expired') return d < 0;
        return d >= 0 && d <= Number(expWindow);
      }).filter(function (row) {
        if (expSupplier !== 'ALL' && row.supplier_id !== expSupplier) return false;
        return true;
      });
      const slips = (state.expiryReturns || []).filter(function (row) {
        return expStatus === 'ALL' || row.status === expStatus;
      });
      const sups = state.suppliers || [];
      return '<div id="expiryReturnPanel"><div class="page-head"><div><h1>' + b.esc(b.t('tabEmpExpiry')) + '</h1><p class="lede">' + b.esc(b.t('expiryLead')) + '</p></div></div>' +
        '<div class="seg" id="expWindow">' + windows.map(function (w) {
          return '<button type="button" data-expwin="' + w[0] + '" class="' + (expWindow === w[0] ? 'on' : '') + '">' + b.esc(w[1]) + '</button>';
        }).join('') + '</div>' +
        '<div class="toolbar"><label class="field"><span>' + b.esc(b.t('supplier')) + '</span><select id="expSup"><option value="ALL">' + b.esc(b.t('allSuppliers')) + '</option>' +
        sups.map(function (s) { return '<option value="' + b.esc(s.id) + '"' + (expSupplier === s.id ? ' selected' : '') + '>' + b.esc(s.name) + '</option>'; }).join('') +
        '</select></label><label class="field"><span>' + b.esc(b.t('status')) + '</span><select id="expStat">' +
        ['ALL', 'PENDING', 'SENT', 'ADJUSTED'].map(function (s) { return '<option' + (expStatus === s ? ' selected' : '') + '>' + s + '</option>'; }).join('') +
        '</select></label></div>' +
        (batches.length ? '<div class="table-wrap panel"><table class="data"><thead><tr><th></th><th>' + b.esc(b.t('brand')) + '</th><th>' + b.esc(b.t('batch')) + '</th><th>' + b.esc(b.t('expiry')) + '</th><th>' + b.esc(b.t('strips')) + '</th><th class="owner-only">' + b.esc(b.t('ptr')) + '</th></tr></thead><tbody>' +
          batches.map(function (row) {
            return '<tr><td><input type="checkbox" data-expick="' + b.esc(row.id) + '"' + (expPick[row.id] ? ' checked' : '') + '></td><td>' + b.esc(row.brand_name) + '<div class="muted">' + b.esc(row.supplier_name || '') + '</div></td><td>' + b.esc(row.batch_number) + '</td><td>' + b.esc(b.pretty(row.expiry_date)) + ' (' + row.days_to_expiry + 'd)</td><td>' + row.strips_count + '</td><td class="owner-only num">' + b.inr(row.ptr_value) + '</td></tr>';
          }).join('') + '</tbody></table></div>' : '<div class="empty">' + b.esc(b.t('noExpiry')) + '</div>') +
        '<div class="actions"><button type="button" class="btn primary" id="btnCreateReturn">' + b.esc(b.t('createSlip')) + '</button>' +
        '<button type="button" class="btn green" id="btnWaReturn">' + b.esc(b.t('waSupplier')) + '</button></div>' +
        '<section class="panel"><h2>' + b.esc(b.t('returnPipeline')) + '</h2>' +
        (slips.length ? slips.map(function (row) {
          return '<article class="draft-row"><div><b>' + b.esc(row.return_slip_no) + '</b> · ' + b.esc(row.brand_name) + ' · ' + b.esc(row.supplier_name) +
            '<div class="muted">' + row.strips_returned + ' ' + b.esc(b.t('stripsUnit')) + ' · ' + b.esc(row.status) + (row.credit_note_no ? ' · ' + b.esc(row.credit_note_no) : '') + '</div></div>' +
            '<div class="actions">' +
            (row.status === 'PENDING' ? '<button type="button" class="btn small" data-ret="' + b.esc(row.id) + '" data-next="SENT">' + b.esc(b.t('markSent')) + '</button>' : '') +
            (row.status === 'SENT' ? '<button type="button" class="btn small primary" data-ret="' + b.esc(row.id) + '" data-next="ADJUSTED">' + b.esc(b.t('markAdjusted')) + '</button>' : '') +
            '</div></article>';
        }).join('') : '<div class="empty">' + b.esc(b.t('noSlips')) + '</div>') +
        '</section></div>';
    }

    function demoBar() {
      return '<section class="panel" id="demoControlBar"><h2>' + b.esc(b.t('demoTitle')) + '</h2><p class="lede">' + b.esc(b.t('demoLead')) + '</p><div class="split">' +
        '<article class="panel"><h2>' + b.esc(b.t('clearZeroBtn')) + '</h2><p class="muted">' + b.esc(b.t('clearZeroLead')) + '</p><button type="button" class="btn danger" id="btnClearZero">' + b.esc(b.t('clearZeroBtn')) + '</button></article>' +
        '<article class="panel"><h2>' + b.esc(b.t('reseedDemoBtn')) + '</h2><p class="muted">' + b.esc(b.t('reseedLead')) + '</p><button type="button" class="btn primary" id="btnReseed">' + b.esc(b.t('reseedDemoBtn')) + '</button></article></div></section>';
    }

    function empHelp() {
      return '<div class="page-head"><div><h1>' + b.esc(b.t('tabEmpHelp')) + '</h1><p class="lede">' + b.esc(b.t('helpLead')) + '</p></div>' +
        '<button type="button" class="btn primary" id="btnStartTutorial">' + b.esc(b.t('startTutorial')) + '</button></div>' +
        '<section class="panel"><h2>' + b.esc(b.t('language')) + '</h2><div class="actions"><button type="button" class="btn" id="helpEn">EN</button><button type="button" class="btn" id="helpHi">HI</button></div></section>' +
        demoBar() +
        '<section class="panel"><p class="muted">' + b.esc(b.t('adminHint')) + '</p><button type="button" class="btn" id="helpUnlock">' + b.esc(b.t('empModeBadge')) + '</button></section>';
    }

    function plCards() {
      const pack = (plOverride && plOverride.range === plRange ? plOverride : (b.state() && b.state().pl && b.state().pl[plRange])) || { totalSales: 0, cogs: 0, grossMargin: 0, grossMarginPct: 0, expenses: 0, salary: 0, otherExpenses: 0, netProfit: 0, netProfitPct: 0, billCount: 0 };
      const netCls = pack.netProfit < 0 ? 'neg' : 'pos';
      const sales = pack.totalSales || 0;
      const cogsPct = sales ? Math.round((pack.cogs / sales) * 100) : 0;
      const expPct = sales ? Math.round((pack.expenses / sales) * 100) : 0;
      const netPct = sales ? Math.max(0, 100 - cogsPct - expPct) : 0;
      return '<div id="admin-pl-dashboard"><div class="seg" id="plRange">' +
        [['1d', b.t('range1d')], ['1w', b.t('range1w')], ['1m', b.t('range1m')]].map(function (r) {
          return '<button type="button" data-range="' + r[0] + '" class="' + (plRange === r[0] ? 'on' : '') + '">' + b.esc(r[1]) + '</button>';
        }).join('') + '</div>' +
        (plRange === '1m' ? '' : '<label class="check" style="margin:8px 0"><input id="plProrate" type="checkbox"' + (prorateOn ? ' checked' : '') + '> ' + b.esc(b.t('prorateRent')) + '</label>') +
        '<section class="kpis pl-kpis">' +
        '<article class="kpi"><div class="kpi-label">' + b.esc(b.t('totalSales')) + '</div><div class="kpi-value">' + b.inr(pack.totalSales) + '</div><div class="kpi-sub">' + (pack.billCount || 0) + '</div></article>' +
        '<article class="kpi"><div class="kpi-label">' + b.esc(b.t('grossMargin')) + '</div><div class="kpi-value">' + b.inr(pack.grossMargin) + '</div><div class="kpi-sub">' + pack.grossMarginPct + '% · ' + b.esc(b.t('cogs')) + ' ' + b.inr(pack.cogs) + '</div></article>' +
        '<article class="kpi"><div class="kpi-label">' + b.esc(b.t('expensesLabel')) + '</div><div class="kpi-value">' + b.inr(pack.expenses) + '</div><div class="kpi-sub">' + b.esc(b.t('salaryShort')) + ' ' + b.inr(pack.salary) + '</div></article>' +
        '<article class="kpi"><div class="kpi-label">' + b.esc(b.t('netProfit')) + '</div><div class="kpi-value ' + netCls + '">' + b.inr(pack.netProfit) + '</div><div class="kpi-sub">' + pack.netProfitPct + '%</div></article></section>' +
        (sales ? '<div class="split-bar" title="' + b.esc(b.t('totalSales')) + '"><span style="width:' + cogsPct + '%"></span><span class="exp" style="width:' + expPct + '%"></span><span class="net" style="width:' + netPct + '%"></span></div>' : '') + '</div>';
    }

    function seasonPanel() {
      const data = (b.state() && b.state().seasonality) || { months: [] };
      const months = data.months || [];
      if (!seasonMonth && months.length) seasonMonth = months[months.length - 1].month;
      const current = months.find(function (m) { return m.month === seasonMonth; }) || months[months.length - 1] || { top: [] };
      return '<section class="panel" id="seasonPanel"><h2>' + b.esc(b.t('seasonalityTitle')) + '</h2><p class="lede">' + b.esc(b.t('seasonLead')) + '</p>' +
        '<div class="seg">' + months.map(function (m) {
          return '<button type="button" data-month="' + b.esc(m.month) + '" class="' + (current.month === m.month ? 'on' : '') + '">' + b.esc(m.month) + '</button>';
        }).join('') + '</div>' +
        ((current.top || []).map(function (row, i) {
          return '<div class="season-row"><div><b>#' + (i + 1) + ' ' + b.esc(row.brand_name) + '</b><div class="bar"><span style="width:' + (row.bar || 0) + '%"></span></div></div><div class="num">' + row.strips + ' · ' + b.inr(row.revenue) + '</div></div>';
        }).join('') || '<div class="empty">' + b.esc(b.t('noMatch')) + '</div>') + '</section>';
    }

    function admPl() {
      return '<div class="page-head"><div><h1>' + b.esc(b.t('tabAdmPl')) + '</h1><p class="lede">' + b.esc(b.t('shopkeeperMarginTitle')) + '</p></div></div>' +
        subSeg([['margin', b.t('subMargin'), ''], ['season', b.t('subSeason'), '']]) +
        (plSub === 'season' || b.sub() === 'season' ? seasonPanel() : plCards() + seasonPanel());
    }

    function admExpenses() {
      const today = (b.state() && b.state().pl && b.state().pl['1d'] && b.state().pl['1d'].to) || '';
      const monthKey = today.slice(0, 7);
      const all = ((b.state() && b.state().expenses) || []).filter(function (row) {
        return !monthKey || String(row.expense_date || '').slice(0, 7) === monthKey;
      });
      const rows = all.filter(function (row) {
        return expenseFilter === 'ALL' || row.category === expenseFilter;
      });
      function sum(cat) {
        return all.filter(function (r) { return cat === 'ALL' ? true : r.category === cat; }).reduce(function (s, r) { return s + Number(r.amount || 0); }, 0);
      }
      const cats = ['ALL', 'SALARY', 'RENT', 'ELECTRICITY', 'TRANSPORT', 'OTHER'];
      return '<div id="admin-expenses-view"><div class="page-head"><div><h1>' + b.esc(b.t('tabAdmExpenses')) + '</h1></div></div>' +
        '<section class="panel"><div class="toolbar"><label class="field"><span>' + b.esc(b.t('category')) + '</span><select id="exCat">' +
        cats.slice(1).map(function (c) { return '<option>' + c + '</option>'; }).join('') + '</select></label>' +
        '<label class="field grow"><span>' + b.esc(b.t('titleName')) + '</span><input id="exTitle"></label>' +
        '<label class="field"><span>' + b.esc(b.t('amount')) + '</span><input id="exAmt" type="number" step="0.01"></label>' +
        '<label class="field"><span>' + b.esc(b.t('date')) + '</span><input id="exDate" type="date" value="' + b.esc(today) + '"></label>' +
        '<label class="field grow"><span>' + b.esc(b.t('note')) + '</span><input id="exNote"></label>' +
        '<button type="button" class="btn primary" id="exAdd">' + b.esc(b.t('addExpense')) + '</button></div></section>' +
        '<div class="seg">' + cats.map(function (c) {
          return '<button type="button" data-exf="' + c + '" class="' + (expenseFilter === c ? 'on' : '') + '">' + c + ' ' + b.inr(sum(c)) + '</button>';
        }).join('') + '</div>' +
        (rows.length ? '<div class="table-wrap panel"><table class="data"><thead><tr><th>' + b.esc(b.t('date')) + '</th><th>' + b.esc(b.t('category')) + '</th><th>' + b.esc(b.t('titleName')) + '</th><th>' + b.esc(b.t('note')) + '</th><th>' + b.esc(b.t('amount')) + '</th><th></th></tr></thead><tbody>' +
          rows.map(function (row) {
            return '<tr><td>' + b.esc(b.pretty(row.expense_date)) + '</td><td>' + b.esc(row.category) + '</td><td>' + b.esc(row.title || row.employee_name) + '</td><td>' + b.esc(row.note || '') + '</td><td class="num">' + b.inr(row.amount) + '</td><td><button type="button" class="btn small danger" data-exdel="' + b.esc(row.id) + '">' + b.esc(b.t('deleteRow')) + '</button></td></tr>';
          }).join('') + '</tbody></table></div>' : '<div class="empty">' + b.esc(b.t('noExpenses')) + '</div>') + '</div>';
    }

    function admOps() {
      const sub = b.sub() || opsSub;
      let body = b.counter() + draftPanel();
      if (sub === 'stock') body = b.inventory() + b.bills() + b.schemes();
      if (sub === 'expiry') body = expiryPanel();
      if (sub === 'audit') body = b.audit();
      return '<div class="page-head"><div><h1>' + b.esc(b.t('tabAdmOps')) + '</h1></div></div>' +
        subSeg([['counter', b.t('subFast'), ''], ['stock', b.t('subStockBills'), ''], ['expiry', b.t('tabEmpExpiry'), ''], ['audit', b.t('subAudit'), '']]) + body;
    }

    function admSettings() {
      const q = quota(b.state());
      const settings = (b.state() && b.state().settings) || {};
      const mins = settings.admin_lock_minutes || 15;
      return '<div class="page-head"><div><h1>' + b.esc(b.t('tabAdmSettings')) + '</h1></div>' + quotaPill(q) + '</div>' +
        '<section class="panel"><h2>' + b.esc(b.t('securityTitle')) + '</h2><div class="actions">' +
        '<button type="button" class="btn" id="changePin">' + b.esc(b.t('changePin')) + '</button>' +
        '<button type="button" class="btn" id="btnRegBio">' + b.esc(b.t('registerBio')) + '</button></div>' +
        '<div class="toolbar"><label class="field grow"><span>' + b.esc(b.t('patternLabel')) + '</span><input id="patternSetting" value="' + b.esc(settings.admin_pattern || '0-3-6-7-8') + '"></label>' +
        '<button type="button" class="btn" id="savePattern">' + b.esc(b.t('savePattern')) + '</button></div>' +
        '<div class="seg" id="lockMins">' + [5, 15, 30].map(function (n) {
          return '<button type="button" data-mins="' + n + '" class="' + (Number(mins) === n ? 'on' : '') + '">' + n + 'm</button>';
        }).join('') + '</div></section>' +
        '<section class="panel"><h2>' + b.esc(b.t('aiQuotaTitle')) + '</h2><p>' + b.esc(String(q.calls_used || 0)) + ' / ' + (q.monthly_limit || 300) + '</p><p class="muted">' + b.esc(b.t('aiQuotaLead')) + '</p></section>' +
        demoBar();
    }

    function readStock() {
      const brand = document.getElementById('stBrand');
      if (!brand) return stock;
      stock.brand = brand.value;
      stock.strips = Number(document.getElementById('stStrips').value) || 0;
      stock.loose = Number(document.getElementById('stLoose').value) || 0;
      stock.rack = document.getElementById('stRack').value;
      stock.batch = document.getElementById('stBatch').value;
      stock.expiry = document.getElementById('stExp').value;
      stock.mrp = Number(document.getElementById('stMrp').value) || 0;
      const ptr = document.getElementById('stPtr');
      if (ptr) stock.ptr = Number(ptr.value) || 0;
      else if (!stock.ptr && stock.mrp) stock.ptr = Number((stock.mrp * 0.72).toFixed(2));
      return stock;
    }

    function applyParsed(parsed) {
      voiceParsed = parsed;
      stock.brand = parsed.brand_name || stock.brand;
      stock.strips = parsed.strips_qty || stock.strips;
      stock.loose = parsed.loose_qty || 0;
      stock.rack = parsed.rack_location || stock.rack;
      stock.batch = parsed.batch_number || stock.batch;
      stock.expiry = parsed.expiry_date || stock.expiry;
      stock.ptr = parsed.ptr_per_strip || 0;
      stock.mrp = parsed.mrp_per_strip || 0;
      const box = document.getElementById('voiceChips');
      if (box) {
        box.innerHTML = [parsed.brand_name, parsed.strips_qty + ' strips', parsed.rack_location, parsed.batch_number, parsed.expiry_date].filter(Boolean).map(function (chip) {
          return '<span class="pill info">' + b.esc(chip) + '</span>';
        }).join(' ');
      }
      b.render();
    }

    function openUnlock() {
      authTab = 'pin';
      pinBuf = '';
      patternSeq = [];
      b.openModal(
        '<div id="admin-unlock-modal"><div class="head" style="display:flex;justify-content:space-between;gap:8px"><h2 style="margin:0">' + b.esc(b.t('unlockTitle')) + '</h2><button type="button" class="btn small" id="modalClose">' + b.esc(b.t('close')) + '</button></div>' +
        '<p class="muted">' + b.esc(b.t('unlockLead')) + '</p>' +
        '<div class="seg auth-method-seg"><button type="button" data-auth-tab="pin" class="on">' + b.esc(b.t('authPin')) + '</button><button type="button" data-auth-tab="pattern">' + b.esc(b.t('authPattern')) + '</button><button type="button" data-auth-tab="biometric">' + b.esc(b.t('authBio')) + '</button></div>' +
        '<div id="pin-view"></div><div id="pattern-view" hidden></div><div id="biometric-view" hidden></div><p id="authErr" class="muted"></p></div>'
      );
      paintAuth();
      const root = document.getElementById('admin-unlock-modal');
      root.querySelector('.auth-method-seg').onclick = function (event) {
        const btn = event.target.closest('[data-auth-tab]');
        if (!btn) return;
        authTab = btn.getAttribute('data-auth-tab');
        root.querySelectorAll('[data-auth-tab]').forEach(function (el) { el.classList.toggle('on', el.getAttribute('data-auth-tab') === authTab); });
        paintAuth();
      };
    }

    function paintAuth() {
      const pin = document.getElementById('pin-view');
      const pat = document.getElementById('pattern-view');
      const bio = document.getElementById('biometric-view');
      if (!pin) return;
      pin.hidden = authTab !== 'pin';
      pat.hidden = authTab !== 'pattern';
      bio.hidden = authTab !== 'biometric';
      if (authTab === 'pin') {
        pin.innerHTML = '<div class="pin-dots">' + [0, 1, 2, 3].map(function (i) { return '<span class="pin-dot' + (pinBuf.length > i ? ' filled' : '') + '"></span>'; }).join('') + '</div>' +
          '<input id="pinInput" type="password" inputmode="numeric" maxlength="4" autocomplete="off" value="' + b.esc(pinBuf) + '">' +
          '<div class="pinpad">' + ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'].map(function (k) {
            return '<button type="button" data-pin="' + k + '">' + k + '</button>';
          }).join('') + '</div><button type="button" class="btn primary" id="pinGo">' + b.esc(b.t('unlock')) + '</button>';
        pin.querySelectorAll('[data-pin]').forEach(function (btn) {
          btn.onclick = function () {
            const key = btn.getAttribute('data-pin');
            if (key === 'C') pinBuf = '';
            else if (key === '⌫') pinBuf = pinBuf.slice(0, -1);
            else if (pinBuf.length < 4) pinBuf += key;
            const input = document.getElementById('pinInput');
            if (input) input.value = pinBuf;
            document.querySelectorAll('.pin-dot').forEach(function (dot, i) { dot.classList.toggle('filled', i < pinBuf.length); });
            if (pinBuf.length === 4) submitPin();
          };
        });
        const input = document.getElementById('pinInput');
        input.oninput = function () { pinBuf = input.value.replace(/\D/g, '').slice(0, 4); input.value = pinBuf; if (pinBuf.length === 4) submitPin(); };
        document.getElementById('pinGo').onclick = submitPin;
        input.focus();
      }
      if (authTab === 'pattern') {
        pat.innerHTML = '<svg id="patternSvg" viewBox="0 0 240 240" class="pattern-grid"><polyline id="patternLine" points=""></polyline>' +
          [0, 1, 2, 3, 4, 5, 6, 7, 8].map(function (n) {
            const x = 40 + (n % 3) * 80;
            const y = 40 + Math.floor(n / 3) * 80;
            return '<g class="pnode" data-node="' + n + '"><circle cx="' + x + '" cy="' + y + '" r="24" class="hit"></circle><circle cx="' + x + '" cy="' + y + '" r="8" class="dot"></circle></g>';
          }).join('') + '</svg><p class="muted">' + b.esc(b.t('patternHint')) + '</p>';
        bindPattern();
      }
      if (authTab === 'biometric') {
        bio.innerHTML = '<div class="bio-card"><div class="bio-icon">◉</div><p>' + b.esc(b.t('bioLead')) + '</p>' +
          '<button type="button" class="btn primary" id="btnBio">' + b.esc(b.t('verifyBio')) + '</button>' +
          '<p id="bioHint" class="muted"></p></div>';
        document.getElementById('btnBio').onclick = verifyBio;
      }
    }

    function authError(msg) {
      const el = document.getElementById('authErr');
      if (el) el.textContent = msg;
      const dots = document.querySelector('.pin-dots');
      if (dots) {
        dots.classList.remove('shake');
        void dots.offsetWidth;
        dots.classList.add('shake');
      }
    }

    async function grant() {
      b.closeModal();
      try { b.applyState(await StoreEngine.bootstrap()); } catch (_e) {}
      b.setOwner(true);
      b.setView('adm-pl');
      b.setSub('margin');
      b.toast(b.t('unlocked'));
      b.render();
    }

    function submitPin() {
      const pin = (document.getElementById('pinInput') ? document.getElementById('pinInput').value : pinBuf).trim();
      StoreEngine.unlock({ method: 'pin', pin: pin }).then(function () {
        grant();
      }).catch(function (err) {
        pinBuf = '';
        authError((err && err.message) || b.t('wrongPin'));
        paintAuth();
      });
    }

    function nodePoint(n) {
      return { x: 40 + (n % 3) * 80, y: 40 + Math.floor(n / 3) * 80, n: n };
    }

    function bindPattern() {
      const svg = document.getElementById('patternSvg');
      if (!svg) return;
      patternSeq = [];
      function nearest(evt) {
        const rect = svg.getBoundingClientRect();
        const x = ((evt.clientX - rect.left) / rect.width) * 240;
        const y = ((evt.clientY - rect.top) / rect.height) * 240;
        let best = null;
        for (let i = 0; i < 9; i++) {
          const p = nodePoint(i);
          const dist = Math.hypot(p.x - x, p.y - y);
          if (dist < 28 && (!best || dist < best.dist)) best = { n: i, dist: dist, x: x, y: y };
        }
        return { x: x, y: y, n: best ? best.n : null };
      }
      function paintLine(cursor) {
        const pts = patternSeq.map(nodePoint);
        if (cursor) pts.push(cursor);
        document.getElementById('patternLine').setAttribute('points', pts.map(function (p) { return p.x + ',' + p.y; }).join(' '));
        svg.querySelectorAll('.pnode').forEach(function (g) {
          g.classList.toggle('on', patternSeq.indexOf(Number(g.getAttribute('data-node'))) >= 0);
        });
      }
      svg.onpointerdown = function (evt) {
        svg.setPointerCapture(evt.pointerId);
        patternDraw = true;
        patternSeq = [];
        const hit = nearest(evt);
        if (hit.n != null) patternSeq.push(hit.n);
        paintLine(hit);
      };
      svg.onpointermove = function (evt) {
        if (!patternDraw) return;
        const hit = nearest(evt);
        if (hit.n != null && patternSeq.indexOf(hit.n) === -1) patternSeq.push(hit.n);
        paintLine(hit);
      };
      svg.onpointerup = function () {
        patternDraw = false;
        paintLine(null);
        if (patternSeq.length < 4) {
          authError(b.t('patternShort'));
          patternSeq = [];
          paintLine(null);
          return;
        }
        const pattern = patternSeq.join('-');
        StoreEngine.unlock({ method: 'pattern', pattern: pattern }).then(function () {
          svg.classList.add('ok');
          grant();
        }).catch(function () {
          svg.classList.add('bad');
          authError(b.t('wrongPattern'));
          setTimeout(function () {
            patternSeq = [];
            if (document.getElementById('patternSvg')) {
              document.getElementById('patternSvg').classList.remove('bad');
              paintLine(null);
            }
          }, 600);
        });
      };
    }

    function b64url(buf) {
      const bytes = new Uint8Array(buf);
      let bin = '';
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }

    async function verifyBio() {
      try {
        if (!window.PublicKeyCredential || !navigator.credentials || !navigator.credentials.get) throw new Error('unavailable');
        const optsRes = await fetch('/api/auth/webauthn/options', { credentials: 'include' });
        const opts = await optsRes.json();
        const challenge = Uint8Array.from(atob(String(opts.publicKey.challenge).replace(/-/g, '+').replace(/_/g, '/')), function (c) { return c.charCodeAt(0); });
        const cred = await navigator.credentials.get({
          publicKey: { challenge: challenge, timeout: 60000, userVerification: 'required', rpId: location.hostname }
        });
        await StoreEngine.unlock({
          method: 'biometric',
          credentialId: b64url(cred.rawId),
          clientDataJSON: b64url(cred.response.clientDataJSON),
          authenticatorData: b64url(cred.response.authenticatorData),
          signature: b64url(cred.response.signature)
        });
        grant();
      } catch (_e) {
        authTab = 'pin';
        paintAuth();
        authError(b.t('bioFallback'));
      }
    }

    function confirmDemo(kind) {
      b.openModal(
        '<div id="demo-reset-confirm-modal"><h2>' + b.esc(kind === 'clear' ? b.t('clearZeroBtn') : b.t('reseedDemoBtn')) + '</h2><p class="muted">' + b.esc(b.t('confirmLead')) + '</p>' +
        '<div class="actions"><button type="button" class="btn" id="modalClose">' + b.esc(b.t('cancel')) + '</button>' +
        '<button type="button" class="btn primary" id="demoGo">' + b.esc(b.t('confirm')) + '</button></div></div>'
      );
      document.getElementById('demoGo').onclick = function () {
        b.closeModal();
        if (kind === 'clear') {
          b.run(function () { return StoreEngine.clearZero(); }, b.t('saved')).then(function () {
            b.setOwner(false);
            b.setView('emp-counter');
            startTutorial();
          });
        } else {
          b.run(function () { return StoreEngine.resetDemo(); }, b.t('saved'));
        }
      };
    }

    function placeTutorial() {
      const spot = document.getElementById('tutorial-spotlight');
      if (!spot || !tutorialOn) return;
      const step = STEPS[tutorialStep];
      const target = document.querySelector(step.sel) || document.getElementById('app');
      const rect = target.getBoundingClientRect();
      const hole = spot.querySelector('.hole');
      hole.style.top = Math.max(8, rect.top - 6) + 'px';
      hole.style.left = Math.max(8, rect.left - 6) + 'px';
      hole.style.width = Math.min(window.innerWidth - 16, rect.width + 12) + 'px';
      hole.style.height = Math.max(48, rect.height + 12) + 'px';
      const card = spot.querySelector('.tut-card');
      const below = rect.bottom + 16;
      card.style.top = (below + 180 < window.innerHeight ? below : Math.max(12, rect.top - 190)) + 'px';
      if ((b.state().medicines || []).length === 0 && !target.querySelector('.tutorial-ghost-preview')) {
        const ghost = document.createElement('div');
        ghost.className = 'tutorial-ghost-preview';
        ghost.textContent = b.t('ghostSample');
        target.prepend(ghost);
      }
    }

    function startTutorial() {
      tutorialOn = true;
      tutorialStep = 0;
      showStep();
    }

    function showStep() {
      const step = STEPS[tutorialStep];
      b.setOwner(false);
      b.setView(step.view);
      if (step.sub) b.setSub(step.sub);
      b.render();
      let spot = document.getElementById('tutorial-spotlight');
      if (!spot) {
        spot = document.createElement('div');
        spot.id = 'tutorial-spotlight';
        document.body.appendChild(spot);
      }
      const dots = STEPS.map(function (_s, i) { return '<span class="' + (i === tutorialStep ? 'on' : '') + '"></span>'; }).join('');
      spot.innerHTML = '<div class="hole"></div><div class="tut-card"><div class="tut-top"><b>' + b.esc(b.t(step.title)) + '</b><button type="button" id="tutSkip">' + b.esc(b.t('skipTour')) + '</button></div><p>' + b.esc(b.t(step.body)) + '</p><div class="tut-dots">' + dots + '</div><div class="actions"><button type="button" class="btn" id="tutBack"' + (tutorialStep === 0 ? ' disabled' : '') + '>' + b.esc(b.t('back')) + '</button><button type="button" class="btn primary" id="tutNext">' + b.esc(b.t(step.next)) + '</button></div></div>';
      document.getElementById('tutSkip').onclick = endTutorial;
      document.getElementById('tutBack').onclick = function () { if (tutorialStep > 0) { tutorialStep -= 1; showStep(); } };
      document.getElementById('tutNext').onclick = function () {
        if (tutorialStep >= STEPS.length - 1) endTutorial();
        else { tutorialStep += 1; showStep(); }
      };
      placeTutorial();
    }

    function endTutorial() {
      tutorialOn = false;
      const spot = document.getElementById('tutorial-spotlight');
      if (spot) spot.remove();
      StoreEngine.updateSettings({ tutorial_completed: 1 }).catch(function () {});
    }

    function bind() {
      document.querySelectorAll('[data-subview]').forEach(function (btn) {
        btn.onclick = function () {
          const next = btn.getAttribute('data-subview');
          b.setSub(next);
          if (b.view() === 'adm-pl') plSub = next;
          if (b.view() === 'adm-ops') opsSub = next;
          b.render();
        };
      });
      const saveDraft = document.getElementById('btnSaveDraftVoucher');
      if (saveDraft) saveDraft.onclick = function () {
        const pos = b.pos();
        const med = b.currentMed();
        if (!med) return b.toast(b.t('noMatch'));
        b.run(function () {
          return StoreEngine.saveVoucher({
            voucherType: 'SALE',
            customerOrSupplier: pos.name,
            customerPhone: pos.phone,
            doctorName: pos.doctor,
            paymentMode: pos.pay,
            items: [{ medicineId: med.id, brandName: med.brand_name, strips: pos.strips, loose: pos.loose, patientName: pos.name }]
          });
        }, b.t('draftSaved'));
      };
      const file = document.getElementById('aiScanFile');
      if (file) file.onchange = async function () {
        const picked = file.files && file.files[0];
        if (!picked) return;
        const data = await b.fileToData(picked);
        try {
          const result = await StoreEngine.scanStock({ imageBase64: data, mimeType: picked.type, rawText: '' });
          const item = (result.parsed.items || [])[0] || {};
          applyParsed({
            brand_name: item.brand_name, strips_qty: item.strips_qty, loose_qty: item.loose_qty || 0,
            rack_location: item.rack_location, batch_number: item.batch_number, expiry_date: item.expiry_date,
            ptr_per_strip: item.ptr_per_strip, mrp_per_strip: item.mrp_per_strip
          });
          const fresh = await StoreEngine.bootstrap();
          b.applyState(fresh);
          b.toast(b.t('scanDone'));
          b.render();
        } catch (err) {
          b.toast(err.message || b.t('aiBlocked'));
          b.render();
        }
      };
      const mic = document.getElementById('btnVoiceStockAdd');
      if (mic) mic.onclick = function () {
        const preview = document.getElementById('voiceTranscriptPreview');
        const wave = document.getElementById('voiceWaveform');
        if (listening) {
          listening = false;
          if (window.VoiceInput) VoiceInput.stop();
          mic.classList.remove('listening');
          if (wave) wave.hidden = true;
          return;
        }
        listening = true;
        mic.classList.add('listening');
        if (wave) wave.hidden = false;
        if (!window.VoiceInput || !VoiceInput.supported()) {
          listening = false;
          mic.classList.remove('listening');
          if (wave) wave.hidden = true;
          if (preview) preview.focus();
          b.toast(b.t('voiceUnsupported'));
          return;
        }
        VoiceInput.start(b.lang() === 'hi' ? 'hi-IN' : 'en-IN', {
          onPartial: function (text) { if (preview) preview.value = text; },
          onFinal: function (text) { if (preview) preview.value = text; StoreEngine.parseVoice(text).then(applyParsed); },
          onEnd: function () { listening = false; mic.classList.remove('listening'); if (wave) wave.hidden = true; }
        });
      };
      const parseBtn = document.getElementById('btnVoiceParse');
      if (parseBtn) parseBtn.onclick = function () {
        const text = document.getElementById('voiceTranscriptPreview').value;
        StoreEngine.parseVoice(text).then(applyParsed).catch(function (err) { b.toast(err.message); });
      };
      const buyDraft = document.getElementById('btnSavePurchaseDraft');
      if (buyDraft) buyDraft.onclick = function () {
        const row = readStock();
        if (!row.brand) return b.toast(b.t('noMatch'));
        b.run(function () {
          return StoreEngine.saveVoucher({
            voucherType: 'PURCHASE',
            customerOrSupplier: (b.state().suppliers[0] || {}).name || '',
            items: [{ brandName: row.brand, stripsCount: row.strips, looseTabletsCount: row.loose, rackLocation: row.rack, batchNumber: row.batch, expiryDate: row.expiry, ptrPerStrip: row.ptr || Number((row.mrp * 0.72).toFixed(2)), mrpPerStrip: row.mrp }]
          });
        }, b.t('draftSaved'));
      };
      const buyFinal = document.getElementById('btnFinalizePurchase');
      if (buyFinal) buyFinal.onclick = function () {
        const row = readStock();
        b.run(function () {
          return StoreEngine.quickRackOnboard({
            brandName: row.brand, stripsCount: row.strips, looseTabletsCount: row.loose, rackLocation: row.rack,
            batchNumber: row.batch || ('SHLF-' + Date.now()), expiryDate: row.expiry,
            ptrPerStrip: row.ptr || Number((row.mrp * 0.72).toFixed(2)) || 1, mrpPerStrip: row.mrp || row.ptr || 1
          });
        }, b.t('saved'));
      };
      document.querySelectorAll('[data-vfinal]').forEach(function (btn) {
        btn.onclick = function () { b.run(function () { return StoreEngine.finalizeVoucher(btn.getAttribute('data-vfinal')); }, b.t('sold')); };
      });
      document.querySelectorAll('[data-vcancel]').forEach(function (btn) {
        btn.onclick = function () { b.run(function () { return StoreEngine.cancelVoucher(btn.getAttribute('data-vcancel')); }, b.t('saved')); };
      });
      document.querySelectorAll('[data-vedit]').forEach(function (btn) {
        btn.onclick = function () {
          const id = btn.getAttribute('data-vedit');
          const row = (b.state().vouchers || []).find(function (v) { return v.id === id; });
          if (!row) return;
          const item = (row.items || [])[0] || {};
          b.openModal('<h2>' + b.esc(row.voucher_number) + '</h2><label class="field"><span>' + b.esc(b.t('strips')) + '</span><input id="edStrips" type="number" value="' + b.esc(item.strips || item.stripsCount || 1) + '"></label><div class="actions"><button type="button" class="btn" id="modalClose">' + b.esc(b.t('cancel')) + '</button><button type="button" class="btn primary" id="edSave">' + b.esc(b.t('savePattern')) + '</button></div>');
          document.getElementById('edSave').onclick = function () {
            const strips = Number(document.getElementById('edStrips').value) || 0;
            const items = (row.items || [{}]).map(function (it, i) { return i === 0 ? Object.assign({}, it, { strips: strips, stripsCount: strips }) : it; });
            b.closeModal();
            b.run(function () { return StoreEngine.saveVoucher({ items: items, customerOrSupplier: row.customer_or_supplier, voucherType: row.voucher_type }, id); }, b.t('saved'));
          };
        };
      });
      document.querySelectorAll('[data-range]').forEach(function (btn) {
        btn.onclick = function () {
          plRange = btn.getAttribute('data-range');
          plOverride = null;
          if (prorateOn && plRange !== '1m') {
            fetch('/api/reports/pl?range=' + plRange + '&prorate=1').then(function (res) { return res.json(); }).then(function (json) {
              plOverride = json.report;
              b.render();
            }).catch(function () { b.render(); });
          } else b.render();
        };
      });
      const prorate = document.getElementById('plProrate');
      if (prorate) prorate.onchange = function () {
        prorateOn = prorate.checked;
        if (!prorateOn) { plOverride = null; b.render(); return; }
        fetch('/api/reports/pl?range=' + plRange + '&prorate=1').then(function (res) { return res.json(); }).then(function (json) {
          plOverride = json.report;
          b.render();
        }).catch(function (err) { b.toast(err.message || b.t('failed')); });
      };
      document.querySelectorAll('[data-month]').forEach(function (btn) {
        btn.onclick = function () { seasonMonth = btn.getAttribute('data-month'); b.render(); };
      });
      const exAdd = document.getElementById('exAdd');
      if (exAdd) exAdd.onclick = function () {
        b.run(function () {
          return StoreEngine.saveExpense({
            category: document.getElementById('exCat').value,
            title: document.getElementById('exTitle').value,
            employeeName: document.getElementById('exTitle').value,
            amount: document.getElementById('exAmt').value,
            expenseDate: document.getElementById('exDate').value,
            note: document.getElementById('exNote').value
          });
        }, b.t('saved'));
      };
      document.querySelectorAll('[data-exdel]').forEach(function (btn) {
        btn.onclick = function () { b.run(function () { return StoreEngine.deleteExpense(btn.getAttribute('data-exdel')); }, b.t('saved')); };
      });
      document.querySelectorAll('[data-exf]').forEach(function (btn) {
        btn.onclick = function () { expenseFilter = btn.getAttribute('data-exf'); b.render(); };
      });
      document.querySelectorAll('[data-expwin]').forEach(function (btn) {
        btn.onclick = function () { expWindow = btn.getAttribute('data-expwin'); b.render(); };
      });
      const expSup = document.getElementById('expSup');
      if (expSup) expSup.onchange = function () { expSupplier = expSup.value; b.render(); };
      const expStat = document.getElementById('expStat');
      if (expStat) expStat.onchange = function () { expStatus = expStat.value; b.render(); };
      document.querySelectorAll('[data-expick]').forEach(function (box) {
        box.onchange = function () { expPick[box.getAttribute('data-expick')] = box.checked; };
      });
      const createRet = document.getElementById('btnCreateReturn');
      if (createRet) createRet.onclick = function () {
        const ids = Object.keys(expPick).filter(function (id) { return expPick[id]; });
        if (!ids.length) return b.toast(b.t('noMatch'));
        b.run(async function () {
          let last = null;
          for (const id of ids) {
            const batch = (b.state().batches || []).find(function (row) { return row.id === id; });
            last = await StoreEngine.createExpiryReturn({ batchId: id, stripsReturned: batch ? Math.min(1, batch.strips_count) || 1 : 1 });
            b.applyState(last);
          }
          expPick = {};
          return last;
        }, b.t('saved'));
      };
      const waRet = document.getElementById('btnWaReturn');
      if (waRet) waRet.onclick = function () {
        const group = (b.state().whatsappReturnSummary || [])[0];
        if (!group) return b.toast(b.t('noExpiry'));
        const text = b.returnText ? b.returnText(group) : '';
        window.open(b.wa(group.supplierPhone, text), '_blank');
      };
      document.querySelectorAll('[data-ret]').forEach(function (btn) {
        btn.onclick = function () {
          const id = btn.getAttribute('data-ret');
          const next = btn.getAttribute('data-next');
          if (next === 'ADJUSTED') {
            const note = window.prompt(b.t('creditNotePrompt'), 'CN-8821');
            if (!note) return;
            b.run(function () { return StoreEngine.updateExpiryReturn(id, { status: 'ADJUSTED', creditNoteNo: note }); }, b.t('saved'));
          } else {
            b.run(function () { return StoreEngine.updateExpiryReturn(id, { status: next }); }, b.t('saved'));
          }
        };
      });
      const clearBtn = document.getElementById('btnClearZero');
      if (clearBtn) clearBtn.onclick = function () { confirmDemo('clear'); };
      const reseed = document.getElementById('btnReseed');
      if (reseed) reseed.onclick = function () { confirmDemo('seed'); };
      const start = document.getElementById('btnStartTutorial');
      if (start) start.onclick = startTutorial;
      const helpUnlock = document.getElementById('helpUnlock');
      if (helpUnlock) helpUnlock.onclick = openUnlock;
      const helpEn = document.getElementById('helpEn');
      if (helpEn) helpEn.onclick = function () { b.setLang('en'); };
      const helpHi = document.getElementById('helpHi');
      if (helpHi) helpHi.onclick = function () { b.setLang('hi'); };
      const savePattern = document.getElementById('savePattern');
      if (savePattern) savePattern.onclick = function () {
        b.run(function () { return StoreEngine.updateSettings({ admin_pattern: document.getElementById('patternSetting').value.trim() }); }, b.t('saved'));
      };
      document.querySelectorAll('[data-mins]').forEach(function (btn) {
        btn.onclick = function () { b.run(function () { return StoreEngine.updateSettings({ admin_lock_minutes: Number(btn.getAttribute('data-mins')) }); }, b.t('saved')); };
      });
      const reg = document.getElementById('btnRegBio');
      if (reg) reg.onclick = async function () {
        try {
          if (window.PublicKeyCredential && navigator.credentials && navigator.credentials.create) {
            const challenge = new Uint8Array(16);
            crypto.getRandomValues(challenge);
            const cred = await navigator.credentials.create({
              publicKey: {
                challenge: challenge,
                rp: { name: 'Akshay Medicose' },
                user: { id: new Uint8Array([1, 2, 3, 4]), name: 'owner', displayName: 'Owner' },
                pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
                authenticatorSelection: { userVerification: 'required' },
                timeout: 60000
              }
            });
            const raw = new Uint8Array(cred.rawId);
            const id = btoa(String.fromCharCode.apply(null, raw)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
            await b.run(function () { return StoreEngine.registerBiometric(id); }, b.t('saved'));
            return;
          }
        } catch (_e) {}
        await b.run(function () { return StoreEngine.registerBiometric('bio-demo-akshay-1'); }, b.t('bioFallback'));
      };
      const pin = document.getElementById('changePin');
      if (pin && b.view() === 'adm-settings') pin.onclick = b.openChangePin;
      if (tutorialOn) placeTutorial();
    }

    return {
      views: {
        'emp-counter': empCounter,
        'emp-stock': empStock,
        'emp-expiry': expiryPanel,
        'emp-help': empHelp,
        'adm-pl': admPl,
        'adm-expenses': admExpenses,
        'adm-ops': admOps,
        'adm-settings': admSettings
      },
      bind: bind,
      openUnlock: openUnlock,
      startTutorial: startTutorial,
      quotaPill: quotaPill
    };
  };
})();
