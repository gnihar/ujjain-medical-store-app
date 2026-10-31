# Akshay Medicose — handoff

Pharmacy counter app for **Akshay Medicose, Freeganj, Ujjain**. Staff sell and add stock. The owner unlocks margins, salaries, and profit. English is the default; Hindi is a full translation.

## Stack
- Node.js + Express (`server/index.js`, port **3456**)
- SQLite via `better-sqlite3` (`data/ujjain_medstore.db`)
- Vanilla JS UI in `public/` (no build step)
- Offline mirror: `public/js/storeEngine.js` (used by the Android WebView APK)
- APK shell: `scripts/build-apk.sh` or `scripts/repack-apk.py` → `UjjainMedStore-v1.0.apk` (versionName 3.0.0)

## Commands
```bash
npm install
npm start          # http://localhost:3456
npm test           # needs the server already running
npm run build:apk  # rebuilds UjjainMedStore-v1.0.apk
```

## Folder map
- `server/routes/api.js` — HTTP API
- `server/services/fefoService.js` — strip + loose sale math
- `server/services/v3Service.js` — vouchers, expenses, expiry returns, P/L, scans
- `server/services/accessControl.js` — admin session, PIN/pattern hashes, response redaction
- `server/db/schema.sqlite.sql` + `database.js` — schema and Ujjain seed
- `public/index.html`, `public/js/app.js`, `public/js/v3ui.js`, `public/css/styles.css`
- `public/js/i18n.js` — English and Hindi
- `scripts/test-e2e.js` — HTTP regression suite

## Data model
`store_settings`, `suppliers`, `medicines`, `inventory_batches` (strips + loose), `purchase_invoices`, `purchase_line_items`, `sales_entries`, `stock_audits`, `shortbook_items`, `customer_accounts`, `credit_transactions`, `refill_schedules`, `supplier_offers`, `expenses`, `vouchers`, `expiry_returns`, `ai_usage_monthly`, `admin_sessions`, `webauthn_challenges`.

Sellable units = `strips_count * pack_size_units + loose_tablets_count`. Sales deduct earliest expiry first (FEFO).

## Roles
- **Employee (default):** counter, stock, expiry returns, help. API responses omit PIN, pattern, purchase rate (PTR), margin, COGS, P/L, and salaries.
- **Admin:** `POST /api/auth/unlock` with PIN `1234` or pattern `0-3-6-7-8` returns a bearer token and an httpOnly `am_admin` cookie. Send `Authorization: Bearer <token>` on admin calls. Session length follows `admin_lock_minutes` (default 15).
- PIN and pattern are stored as scrypt hashes and are never returned.
- Biometric unlock requires a stored SPKI public key plus a one-time WebAuthn challenge and a valid signature. A credential id alone is rejected. If the device has no authenticator, the UI falls back to PIN.
- Admin-only routes (`/api/reports/pl`, `/api/reports/seasonality`, `/api/expenses`) return **403** without a session.

## API (high level)
`GET /api/bootstrap` loads the shop. `POST /api/sales` is FEFO. `POST /api/sales/:id/undo` restores that sale. `POST /api/vouchers` saves a draft without touching stock; `POST /api/vouchers/:id/finalize` commits; `POST /api/vouchers/:id/cancel` drops a draft. Expiry slips move **PENDING → SENT → ADJUSTED** only. `GET /api/reports/pl?range=1d|1w|1m` is owner profit. `POST /api/ai/scan` counts a call only after a successful Gemini response. `POST /api/demo/clear-zero` and `POST /api/reset-demo` reset demo data.

## Env
- `PORT` — default 3456
- `GEMINI_API_KEY` — if set, bill/strip scans call Gemini 2.5 Flash. If unset, a deterministic parser is used and the monthly counter does not increase. A failed Gemini call does not increase it either. Hard stop is 300 successful calls per calendar month (HTTP 429).

## Conventions
- Keep employee and admin copy in `i18n.js` (plain English, plain Hindi).
- Do not put purchase rate in employee DOM. The server must also omit it.
- Preserve FEFO strip/loose math and the existing `/api` paths.
- Do not add end-to-end encryption; it is deferred.

## Known gaps
- WebAuthn attestation (that the key was born inside a real secure element) is not checked. The signature over the server challenge is checked.
- Multi-month seasonality rows are a sales ledger. They do not reduce current shelf counts.
- Offline APK storage hashes the PIN and pattern. Other owner figures are hidden from employee API results, not encrypted at rest.

## Starter prompt
```text
You are working on Akshay Medicose (Freeganj, Ujjain) in this repo. Read HANDOFF.md first.
Stack: Express + SQLite in server/, vanilla JS in public/, offline mirror public/js/storeEngine.js, tests in scripts/test-e2e.js.
Employee responses must never include PIN, pattern, PTR, margin, COGS, P/L, or salaries. Admin routes need the bearer token from POST /api/auth/unlock.
Keep FEFO strip/loose math. Default language is English with a full Hindi dictionary. Do not add E2E encryption.
Run the server (npm start) and npm test before you finish.
```
