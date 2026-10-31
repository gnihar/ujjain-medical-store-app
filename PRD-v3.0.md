# Akshay Medicose (Ujjain Medical Store App) — PRD v3.0
**Author:** Product Manager  
**Owner:** Nihar sir  
**Status:** Step 1 Complete (PRD Drafted) · Step 2 In Review with UI/UX Designer  

---

## 1. Product Goal & Design Philosophy
Transform **Akshay Medicose** (`medical-store-app`) into a **minimal, fast, role-separated pharmacy app** that is effortless for counter staff to use daily while giving the shop owner (Admin) complete visibility into daily/weekly/monthly margins, expenses, seasonal medicine demand, and security.

---

## 2. Scope & Phasing Decisions (Approved by Nihar sir)
- **In Scope Now (v3.0):**
  1. Minimal 4-tab navigation & clean role separation (**Employee Mode** vs. **Admin/Owner Mode**).
  2. **App Lock & Security**: PIN, Pattern lock, and Biometric (Fingerprint / Face unlock via WebAuthn / Android Biometrics) to enter Admin Mode or unlock the app.
  3. **Interactive Tutorial + 1-Click Demo Data Reset & Seed**:
     - Interactive step-by-step coach marks / walkthrough for zero-record or first-time users.
     - **"Reset & Load Fresh Demo Data" / "Clear All Demo Data (Start Fresh)"** controls so Nihar sir can wipe messy test entries during a live demo and either start from 0 records (to show the onboarding/tutorial) or re-seed realistic Ujjain medical store data in one tap.
  4. **Fast Inventory Entry (Scan + Speech-to-Text + Gemini 300 Calls/Month Quota)**:
     - Barcode / medicine strip / purchase bill camera scan powered by Gemini AI.
     - Strict **300 AI calls/month counter & hard limit** stored in SQLite (`ai_usage_log` / `store_settings`) with a visible remaining-calls badge.
     - **Speech-to-Text Add Inventory**: Voice dictation to add stock fields hands-free (brand, strips, rack, expiry, PTR/MRP).
  5. **Voucher Draft → Finalize Workflow**:
     - Ability to save sales or stock entries as a **Draft Voucher (Kaccha Parcha)** first, review/edit, and tap **Finalize** to commit stock deductions and ledger entries.
  6. **Dedicated Expiry Return Section (`Alag Section Exp Return`)**:
     - Separate view/tab for expired and near-expiry stock returns to suppliers, tracking return voucher status and credit notes/adjustments.
  7. **Admin-Only Shopkeeper Profit/Loss, Margin & Expense Dashboard**:
     - **Monthly Expenses Ledger**: Track **Salary** and **Other Expenses** (rent, electricity, transport, misc).
     - **Shopkeeper P/L & Margin View ("Ek dhande wale ka din ka kitna margin tha")**: Strictly in **Admin/Owner Mode**, with **1-Day, 1-Week, and 1-Month** toggles showing Total Sales, Cost of Goods Sold (PTR), **Gross Margin (₹ and %)**, Total Expenses (Salary + Other), and **Net Profit**.
  8. **Seasonality & Monthly Medicine Analytics ("Konsi dawai konse mahine me zyada biki hai")**:
     - Month-by-month top-selling medicines breakdown (units/strips sold & revenue by month) to spot seasonal demand peaks.
- **Deferred to Future Release (Per Nihar sir):**
  - End-to-end encrypted backups / data encryption at rest (moved to backlog for a later phase).

---

## 3. Role Separation & Minimal 4-Tab Navigation Proposal (For UI/UX Review)

### A. Employee Mode (Counter Staff Default)
Hides all purchase margins (PTR vs MRP profit), owner P/L dashboards, salary/expense records, and destructive settings.
1. **Tab 1 — Counter & Vouchers (`Sale`)**: Fast FEFO billing, Save as Draft Voucher, Finalize Voucher, Customer Credit (Udhaar) entry, Refill reminders.
2. **Tab 2 — Stock & Add (`Inventory`)**: Search Racks, **Scan to Add (Gemini AI)**, **Speech-to-Text Add**, Purchase Bill entry, Shortbook.
3. **Tab 3 — Expiry Return (`Exp Return`)**: Dedicated section for expired / expiring batches (30/60/90 days), supplier return slips, and return claim status.
4. **Tab 4 — Help & Demo (`Guide`)**: Launch 2-Minute Interactive Tutorial, Language toggle (EN/HI), and Switch to Admin Mode.

### B. Admin / Owner Mode (Protected by PIN / Pattern / Fingerprint / Face)
Unlocks full financial visibility and store controls:
1. **Tab 1 — Owner P/L Dashboard (`Profit & Loss`)**:
   - **1 Day / 1 Week / 1 Month** toggle.
   - Headline cards: Gross Margin ("Aaj ka Margin"), Total Sales, Expenses (Salary + Other), Net Profit.
   - **Seasonality Analytics**: *"Konsi dawai konse mahine me zyada biki hai"* (Month selector + Top Medicines chart/table).
2. **Tab 2 — Expenses & Salaries (`Expenses`)**:
   - Quick add & monthly summary for **Staff Salaries** and **Other Shop Expenses** (Rent, Electricity, Transport, Misc).
3. **Tab 3 — Operations (`Sale, Stock, Vouchers & Exp Return`)**:
   - Full access to Counter, Vouchers (approve/finalize/cancel), Inventory (with PTR & Margin % visible), Purchase Bills, Expiry Returns, and Stock Audit.
4. **Tab 4 — Security, AI Quota & Demo Control (`Admin Settings`)**:
   - Security methods: Set/Change **PIN**, **Pattern Lock**, and **Fingerprint / Face Unlock**.
   - **Gemini AI Quota Meter**: `X / 300 calls used this month` (auto-resets monthly, blocks overage).
   - **Demo Mode Controls**:
     - *"Clear All Data (Zero-Record State + Start Tutorial)"*
     - *"Reset & Seed Fresh Realistic Demo Data"*

---

## 4. Database Additions (SQLite `schema.sqlite.sql`)
1. `expenses`: `id`, `category` (`SALARY` | `RENT` | `ELECTRICITY` | `TRANSPORT` | `OTHER`), `title`, `employee_name`, `amount`, `expense_date`, `note`, `created_at`.
2. `vouchers`: `id`, `voucher_number`, `voucher_type` (`SALE` | `PURCHASE`), `status` (`DRAFT` | `FINALIZED` | `CANCELLED`), `customer_or_supplier`, `items_json`, `total_amount`, `estimated_margin`, `created_by_role`, `created_at`, `finalized_at`.
3. `expiry_returns`: `id`, `batch_id`, `medicine_id`, `brand_name`, `batch_number`, `supplier_id`, `supplier_name`, `strips_returned`, `ptr_value`, `status` (`PENDING` | `SENT` | `ADJUSTED`), `credit_note_no`, `created_at`.
4. `ai_usage_monthly`: `year_month` (`YYYY-MM` PRIMARY KEY), `calls_used` (INTEGER DEFAULT 0), `monthly_limit` (INTEGER DEFAULT 300), `updated_at`.
5. `store_settings` extensions: `admin_pattern`, `biometric_credential_id`, `tutorial_completed`.

---

## 5. Phased Implementation Plan (Awaiting UI/UX Review & Nihar sir's Approval Before Build)
- **Phase A — Minimal UI, Role Split, Security (PIN/Pattern/Biometric) & Tutorial + Demo Reset/Seed**
- **Phase B — Admin Profit/Loss Dashboard (1D/1W/1M Margin), Monthly Expenses (Salary + Other), Voucher Draft→Final, Dedicated Expiry Return & Seasonality Analytics**
- **Phase C — Scan to Add Inventory, Speech-to-Text Inventory Entry & Gemini 300 Calls/Month Meter**
