const crypto = require('crypto');
const { db } = require('../db/database');

const SENSITIVE_KEYS = new Set([
  'owner_pin', 'admin_pattern', 'owner_pin_hash', 'owner_pin_salt',
  'admin_pattern_hash', 'admin_pattern_salt', 'biometric_credential_id',
  'biometric_public_key', 'ptr_per_strip', 'ptr_value', 'ptrPerStrip',
  'buy_price_ptr', 'last_ptr', 'net_buy_price', 'cogs_amount', 'margin_amount',
  'estimated_margin', 'retail_margin_pct', 'avgMarginPercent', 'totalPtrValue',
  'expiringPtrValue', 'margin', 'pl', 'expenses', 'seasonality', 'margin_percent',
  'highest_margin', 'best_margin', 'cogs', 'grossMargin', 'grossMarginPct',
  'netProfit', 'netProfitPct', 'proratedAmount'
]);

function ensureTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS admin_sessions (
      token_hash TEXT PRIMARY KEY,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS webauthn_challenges (
      challenge TEXT PRIMARY KEY,
      expires_at INTEGER NOT NULL
    );
  `);
  const cols = db.prepare('PRAGMA table_info(store_settings)').all().map(c => c.name);
  const add = (name, ddl) => { if (!cols.includes(name)) db.exec('ALTER TABLE store_settings ADD COLUMN ' + ddl); };
  add('owner_pin_hash', 'owner_pin_hash TEXT');
  add('owner_pin_salt', 'owner_pin_salt TEXT');
  add('admin_pattern_hash', 'admin_pattern_hash TEXT');
  add('admin_pattern_salt', 'admin_pattern_salt TEXT');
  add('biometric_public_key', 'biometric_public_key TEXT');
  const row = db.prepare('SELECT * FROM store_settings WHERE id = 1').get();
  if (!row) return;
  if (row.owner_pin && !row.owner_pin_hash) setPin(row.owner_pin);
  if (row.admin_pattern && !row.admin_pattern_hash) setPattern(row.admin_pattern);
}

function hashSecret(secret, salt) {
  return crypto.scryptSync(String(secret), String(salt), 32).toString('hex');
}

function setPin(pin) {
  const salt = crypto.randomBytes(16).toString('hex');
  db.prepare(`UPDATE store_settings SET owner_pin_hash = ?, owner_pin_salt = ?, owner_pin = '' WHERE id = 1`)
    .run(hashSecret(pin, salt), salt);
}

function setPattern(pattern) {
  const salt = crypto.randomBytes(16).toString('hex');
  db.prepare(`UPDATE store_settings SET admin_pattern_hash = ?, admin_pattern_salt = ?, admin_pattern = '' WHERE id = 1`)
    .run(hashSecret(pattern, salt), salt);
}

function checkPin(pin) {
  ensureTables();
  const row = db.prepare('SELECT owner_pin_hash, owner_pin_salt, owner_pin FROM store_settings WHERE id = 1').get();
  if (row && row.owner_pin_hash && row.owner_pin_salt) return hashSecret(pin, row.owner_pin_salt) === row.owner_pin_hash;
  return String(pin) === String(row && row.owner_pin || '1234');
}

function checkPattern(pattern) {
  ensureTables();
  const row = db.prepare('SELECT admin_pattern_hash, admin_pattern_salt, admin_pattern FROM store_settings WHERE id = 1').get();
  if (row && row.admin_pattern_hash && row.admin_pattern_salt) return hashSecret(pattern, row.admin_pattern_salt) === row.admin_pattern_hash;
  return String(pattern) === String(row && row.admin_pattern || '0-3-6-7-8');
}

function tokenHash(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function readToken(req) {
  const header = String((req.headers && (req.headers.authorization || req.headers.Authorization)) || '');
  if (/^bearer\s+/i.test(header)) return header.replace(/^bearer\s+/i, '').trim();
  const cookie = String((req.headers && req.headers.cookie) || '');
  const match = cookie.match(/(?:^|;\s*)am_admin=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}

function isAdmin(req) {
  const token = readToken(req);
  if (!token) return false;
  ensureTables();
  const row = db.prepare('SELECT expires_at FROM admin_sessions WHERE token_hash = ?').get(tokenHash(token));
  if (!row) return false;
  if (row.expires_at <= Date.now()) {
    db.prepare('DELETE FROM admin_sessions WHERE token_hash = ?').run(tokenHash(token));
    return false;
  }
  return true;
}

function issueSession() {
  ensureTables();
  const settings = db.prepare('SELECT admin_lock_minutes FROM store_settings WHERE id = 1').get() || {};
  const minutes = Number(settings.admin_lock_minutes) || 15;
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = Date.now() + minutes * 60 * 1000;
  db.prepare('INSERT INTO admin_sessions (token_hash, expires_at) VALUES (?, ?)').run(tokenHash(token), expiresAt);
  const cookie = 'am_admin=' + token + '; HttpOnly; SameSite=Lax; Path=/; Max-Age=' + (minutes * 60);
  return { token, expiresAt, cookie };
}

function clearSession(req) {
  const token = readToken(req);
  if (!token) return;
  ensureTables();
  db.prepare('DELETE FROM admin_sessions WHERE token_hash = ?').run(tokenHash(token));
}

function requireAdmin(req) {
  if (!isAdmin(req)) {
    const err = new Error('Admin session required');
    err.status = 403;
    throw err;
  }
}

function scrubText(value) {
  if (typeof value !== 'string' || !/ptr|buy price|खरीद रेट/i.test(value)) return value;
  return value.split('\n').filter(line => !/ptr|buy price|खरीद रेट/i.test(line)).join('\n');
}

function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== 'object') return scrubText(value);
  const out = {};
  Object.keys(value).forEach(key => {
    if (SENSITIVE_KEYS.has(key)) return;
    out[key] = redact(value[key]);
  });
  return out;
}

module.exports = {
  ensureTables, setPin, setPattern, checkPin, checkPattern,
  isAdmin, issueSession, clearSession, requireAdmin, redact
};
