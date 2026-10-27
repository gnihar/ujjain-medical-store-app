# Ujjain Medical Store App — Complete Handoff for VS Code & Codex (`AGENTS.md` / `HANDOFF.md`)

## 1. Project Overview & Business Context
- **Product:** Mobile-first (Android APK + PWA) and PC Web Medical Store Management System built for a pilot pharmacy/chemist in **Ujjain, Madhya Pradesh** (currently operating on paper files, no legacy ERP).
- **Target Devices:**
  1. **Primary:** Android smartphones used by the chemist/owner and counter staff (camera bill capture, rack onboarding, quick counter sales deduction, shelf audit).
  2. **Secondary:** Occasional PC/laptop browser access for bulk invoice review, expiry return claims, and accounting.
- **Current Status (`v1.0.0` MVP Complete & E2E Tested):**
  - Full-stack Node.js + Express + `better-sqlite3` relational database (`server/`)
  - Dual-Mode Hybrid Frontend (`public/`) that runs against the Express REST API when online and falls back seamlessly to a local relational store (`localStorage`) inside the standalone Android `.apk`.
  - Production PostgreSQL / Supabase schema ready at `supabase/schema.sql`.
  - Signed, installable Android APK (`UjjainMedStore-v1.0.apk`, package `com.ujjainmedstore.app`) + automated APK rebuild script (`scripts/build-apk.sh`).

---

## 2. Directory & File Map
```text
medical-store-app/
├── HANDOFF.md                      # This master handoff document
├── AGENTS.md                       # Auto-loaded instructions for OpenAI Codex / VS Code agents
├── README.md                       # Quick-start commands & overview
├── package.json                    # Dependencies (express, better-sqlite3, multer, cors) & scripts
├── UjjainMedStore-v1.0.apk         # Compiled & signed Android APK (v2/v3 signature)
├── supabase/
│   └── schema.sql                  # Production PostgreSQL / Supabase schema + pg_trgm indexes + views
├── server/
│   ├── index.js                    # Express entry point (default port 3456), static host & APK download route
│   ├── db/
│   │   ├── schema.sqlite.sql       # SQLite3 relational schema (mirrors supabase/schema.sql)
│   │   └── database.js             # DB initialization + Ujjain wholesaler & batch seed data
│   ├── routes/
│   │   └── api.js                  # All REST API endpoints (/api/*)
│   └── services/
│       ├── fefoService.js          # First-Expiry-First-Out (FEFO) Strip + Loose Tablet deduction & Undo math
│       └── ocrParserService.js     # Bill photo OCR (Tesseract + Indian wholesale invoice line-item parser)
├── public/
│   ├── index.html                  # Single-page responsive app shell (6 tabs + modals + EN/HI toggle)
│   ├── manifest.json               # PWA manifest for Android Chrome install
│   ├── sw.js                       # Offline service worker
│   ├── css/
│   │   └── styles.css              # Mobile-first + PC responsive styling
│   └── js/
│       ├── i18n.js                 # Bilingual dictionary (English + हिंदी / Hinglish)
│       ├── storeEngine.js          # Dual-Mode data layer (REST API /api/* <-> Offline engine)
│       └── app.js                  # UI state, event handlers, OCR review table, WhatsApp expiry claim generator
├── scripts/
│   ├── test-e2e.js                 # Automated E2E test suite (8 tests covering OCR, FEFO math, Undo, Audit)
│   └── build-apk.sh                # Rebuilds & signs UjjainMedStore-v1.0.apk from public/ assets
└── apk-build/                      # Android WebView wrapper sources (AndroidManifest.xml, smali, keystore)
```

---

## 3. How to Run & Verify in VS Code
Open this folder in VS Code and run:

```bash
# 1. Install dependencies
npm install

# 2. Start the local server (runs at http://localhost:3456)
npm start

# 3. Run the automated E2E test suite (verifies FEFO strip/loose math, OCR, Undo, Stock Audit)
npm test
```

---

## 4. Core Business Rules & Domain Logic (Must Preserve When Editing)

### A. Strip + Loose Tablet Inventory Math (`pack_size_units`)
Every medicine has `pack_size_units` (e.g., `15` tablets per strip, `10` tablets per strip, `1` for syrup bottles/vials).
Every batch in `inventory_batches` tracks two separate integer columns:
- `strips_count` (Full sealed strips on shelf)
- `loose_tablets_count` (Tablets remaining in an already-opened strip, always `< pack_size_units`)
- **Total sellable units in a batch:** `(strips_count * pack_size_units) + loose_tablets_count`.

### B. FEFO (First-Expiry-First-Out) Sales Deduction (`server/services/fefoService.js`)
When a counter sale requests `S` strips and `L` loose tablets of a medicine:
1. Convert request to total tablets needed: `totalRequestedUnits = (S * pack_size_units) + L`.
2. Query active batches for that `medicine_id` where `(strips_count * pack_size_units + loose_tablets_count) > 0` and `expiry_date > CURRENT_DATE`, ordered by **`expiry_date ASC, id ASC`** (earliest expiry first).
3. Deduct from the earliest expiring batch(es). If loose tablets are requested and `loose_tablets_count` is insufficient, automatically "break open" 1 sealed strip (`strips_count -= 1`, `loose_tablets_count += pack_size_units`) and deduct the loose tablets.
4. Record the exact per-batch deduction breakdown inside `sales_entries.deduction_log_json` so **1-Tap Undo (`/api/sales/:id/undo`)** restores the exact strips and loose tablets back to their original batches.

### C. Configurable Near-Expiry Return Window (Default: `60` Days)
- Stored in `store_settings.expiry_alert_days` (default `60`, adjustable in UI from `15` to `180` days).
- Batches expiring within `expiry_alert_days` are grouped by their supplying wholesaler (`Mahakal Pharma Agency`, `Malwa Medico Traders`, `Shipra Drug House`, etc.) so the chemist can generate a **1-Tap WhatsApp Return / Credit Note Claim** showing Batch No, Expiry Date, Invoice Ref, Qty, and total PTR return value.

### D. Purchase Bill Photo + Smart OCR (`server/services/ocrParserService.js`)
- Supports snapping a photo from an Android camera or uploading an image (`POST /api/ocr/parse` via `multer`).
- Extracts Supplier Name, GSTIN, Invoice Number, Invoice Date, and line items (`brand_name`, `salt_composition`, `pack_size_label`, `pack_size_units`, `rack_location`, `batch_number`, `expiry_date`, `strips_qty`, `free_strips_qty`, `ptr_per_strip`, `mrp_per_strip`, `gst_percent`).
- Renders an editable review table before committing (`POST /api/invoices`), which upserts the supplier, upserts the medicine master, creates the invoice header, and increments/creates the `inventory_batches` rows.

### E. Quick Rack Onboarding (`POST /api/onboarding/quick-rack`)
- Because the Ujjain medical store is transitioning from paper files, staff can pick a shelf/rack (`Rack A-1`, `Rack B-2`, `Cold Storage`) and directly punch in existing shelf stock (Brand, Salt, Batch, Expiry, Strips, Loose Tablets, MRP, PTR) without needing old paper purchase bills.

---

## 5. REST API Reference (`server/routes/api.js`)
| Method & Endpoint | Purpose |
| :--- | :--- |
| `GET /api/bootstrap?expiryDays=60` | Returns store settings, KPI summary,suppliers, medicines with nested batches, expiring batches, low-stock shortbook, invoices, recent sales, and audits |
| `POST /api/settings` | Updates `expiry_alert_days` (e.g. `60`), store name, GSTIN, or language preference |
| `POST /api/ocr/parse` | Accepts `multipart/form-data` (`billPhoto`) or `{ templateKey, rawText }` and returns parsed invoice JSON |
| `POST /api/invoices` | Saves purchase invoice + line items and updates/creates `inventory_batches` |
| `POST /api/onboarding/quick-rack` | Directly adds/updates a shelf batch during paper-to-digital rack onboarding |
| `GET /api/substitutes?medicineId=X` | Finds all in-stock alternative brands sharing the same `salt_composition` |
| `POST /api/sales` | Executes FEFO deduction for `{ medicine_id, sold_strips, sold_loose_tablets, customer_name }` |
| `POST /api/sales/:id/undo` | Reverses a sale and restores exact batch strip + loose counts |
| `POST /api/audits` | Logs physical vs. system stock discrepancy and reconciles `inventory_batches` |
| `POST /api/reset-demo` | Resets SQLite database back to clean Ujjain seed state |

---

## 6. Next Phase Tasks for Codex (Post-Wednesday Store Visit)
When prompting **Codex in VS Code**, you can paste any of these tasks directly:

1. **Upgrade OCR to Gemini 2.5 Flash / OpenAI Vision (`server/services/ocrParserService.js`):**
   > *"In `server/services/ocrParserService.js`, add a Vision LLM provider using `GEMINI_API_KEY` or `OPENAI_API_KEY` that takes the uploaded `billPhoto` buffer from `/api/ocr/parse` and returns the exact JSON schema expected by the invoice review table (`supplier_name`, `supplier_gstin`, `invoice_number`, `invoice_date`, `items[]`), keeping Tesseract/heuristic parsing as the offline fallback."*
2. **Barcode / QR Scanner for Strips:**
   > *"Add `html5-qrcode` camera barcode scanning to the Counter Sales and Quick Rack Onboarding tabs in `public/js/app.js` and link `barcode` column in `medicines`/`inventory_batches`."*
3. **CA / GST Monthly Purchase Register Export (Excel/CSV):**
   > *"Add `GET /api/reports/gst-purchase-csv?month=YYYY-MM` in `server/routes/api.js` and an Export CSV button in the Bill OCR / Invoices tab so the chemist can send monthly GST input credit data to their CA."*
4. **Supabase Cloud Sync:**
   > *"Connect `server/db/database.js` or a sync worker to Supabase using `supabase/schema.sql` so multiple Android phones at the medical store sync inventory in real time."*
