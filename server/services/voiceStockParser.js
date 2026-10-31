/**
 * Deterministic speech-to-stock parser for Hindi, Hinglish, and English.
 * Example: "Dolo 650 20 strip rack A1 batch DL99 expiry 2027-08 PTR 24.50 MRP 33.25"
 */

const HI_NUMBERS = {
  'एक': '1', 'दो': '2', 'तीन': '3', 'चार': '4', 'पांच': '5', 'पाँच': '5',
  'छह': '6', 'सात': '7', 'आठ': '8', 'नौ': '9', 'दस': '10',
  'ग्यारह': '11', 'बारह': '12', 'तेरह': '13', 'चौदह': '14',
  'पंद्रह': '15', 'पन्द्रह': '15', 'सोलह': '16', 'सत्रह': '17',
  'अठारह': '18', 'उन्नीस': '19', 'बीस': '20', 'तीस': '30',
  'चालीस': '40', 'पचास': '50'
};

const MONTHS = {
  jan: 1, january: 1, जनवरी: 1,
  feb: 2, february: 2, फरवरी: 2,
  mar: 3, march: 3, मार्च: 3,
  apr: 4, april: 4, अप्रैल: 4,
  may: 5, मई: 5,
  jun: 6, june: 6, जून: 6,
  jul: 7, july: 7, जुलाई: 7,
  aug: 8, august: 8, अगस्त: 8,
  sep: 9, sept: 9, september: 9, सितंबर: 9, सितम्बर: 9,
  oct: 10, october: 10, अक्टूबर: 10, अक्तूबर: 10,
  nov: 11, november: 11, नवंबर: 11, नवम्बर: 11,
  dec: 12, december: 12, दिसंबर: 12, दिसम्बर: 12
};

function endOfMonth(year, month) {
  const m = Math.min(12, Math.max(1, month));
  const d = new Date(Date.UTC(year, m, 0));
  const day = String(d.getUTCDate()).padStart(2, '0');
  return year + '-' + String(m).padStart(2, '0') + '-' + day;
}

function normalizeRack(raw) {
  const text = String(raw || '').replace(/\s+/g, ' ').trim();
  if (/cold/i.test(text)) return 'Cold Storage';
  const compact = text.replace(/\s+/g, '');
  const hit = compact.match(/^([A-Ca-c])-?([1-5])$/);
  if (hit) return 'Rack ' + hit[1].toUpperCase() + '-' + hit[2];
  return text;
}

function parseVoiceStockEntry(transcript) {
  let text = String(transcript || '').replace(/\s+/g, ' ').trim();
  Object.keys(HI_NUMBERS).forEach((word) => {
    text = text.replace(new RegExp(word, 'g'), HI_NUMBERS[word]);
  });

  const parsed = {
    brand_name: '',
    salt_composition: '',
    strips_qty: 0,
    loose_qty: 0,
    rack_location: '',
    batch_number: '',
    expiry_date: '',
    ptr_per_strip: null,
    mrp_per_strip: null,
    pack_size_units: 10
  };
  const consumed = [];

  function take(re, apply) {
    const match = text.match(re);
    if (!match) return;
    apply(match);
    consumed.push(match[0]);
    text = text.replace(match[0], ' ');
  }

  take(/(?:ptr|पीटीआर|rate)\s*[:\-]?\s*(\d+(?:\.\d+)?)/i, (m) => {
    parsed.ptr_per_strip = Number(m[1]);
  });
  take(/(?:mrp|एमआरपी|एमआरपी)\s*[:\-]?\s*(\d+(?:\.\d+)?)/i, (m) => {
    parsed.mrp_per_strip = Number(m[1]);
  });
  take(/(\d+)\s*(?:strips?|patte|patti|पत्ते|पट्टी|pattiya|पट्टियां|पट्टियाँ)/i, (m) => {
    parsed.strips_qty = parseInt(m[1], 10) || 0;
  });
  take(/(\d+)\s*(?:loose|tablets?|tabs?|goli|goliyan|खुली|गोली|गोलियाँ)/i, (m) => {
    parsed.loose_qty = parseInt(m[1], 10) || 0;
  });
  take(/(?:rack|रैक|shelf)\s*([A-Ca-c]\s*-?\s*[1-5]|cold\s*storage)/i, (m) => {
    parsed.rack_location = normalizeRack(m[1]);
  });
  take(/(?:batch|बैच)\s*([A-Za-z0-9-]+)/i, (m) => {
    parsed.batch_number = m[1].toUpperCase();
  });
  take(/(?:expiry|exp|एक्सपायरी|एक्सपायरी)\s*(20\d{2})-(\d{1,2})(?:-(\d{1,2}))?/i, (m) => {
    const year = parseInt(m[1], 10);
    const month = parseInt(m[2], 10);
    parsed.expiry_date = m[3]
      ? year + '-' + String(month).padStart(2, '0') + '-' + String(parseInt(m[3], 10)).padStart(2, '0')
      : endOfMonth(year, month);
  });
  if (!parsed.expiry_date) {
    take(/(?:expiry|exp|एक्सपायरी)\s*(\d{1,2})\s*[\/\-]\s*(20\d{2})/i, (m) => {
      parsed.expiry_date = endOfMonth(parseInt(m[2], 10), parseInt(m[1], 10));
    });
  }
  if (!parsed.expiry_date) {
    const monthNames = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join('|');
    const re = new RegExp('(?:expiry|exp|एक्सपायरी)?\\s*(' + monthNames + ')\\s*(20\\d{2})', 'i');
    take(re, (m) => {
      const key = m[1].toLowerCase();
      const month = MONTHS[key] || MONTHS[m[1]] || MONTHS[m[1].toLowerCase()];
      parsed.expiry_date = endOfMonth(parseInt(m[2], 10), month);
    });
  }

  parsed.brand_name = text.replace(/\s+/g, ' ').replace(/^[,.\-]+|[,.\-]+$/g, '').trim();
  if (parsed.mrp_per_strip != null && (parsed.ptr_per_strip == null)) {
    parsed.ptr_per_strip = Number((parsed.mrp_per_strip * 0.72).toFixed(2));
    parsed.ptr_inferred = true;
  }
  if (parsed.ptr_per_strip == null) parsed.ptr_per_strip = 0;
  if (parsed.mrp_per_strip == null) parsed.mrp_per_strip = 0;
  parsed.consumed = consumed;
  return parsed;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { parseVoiceStockEntry, endOfMonth, normalizeRack };
} else if (typeof window !== 'undefined') {
  window.parseVoiceStockEntry = parseVoiceStockEntry;
}
