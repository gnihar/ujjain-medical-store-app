# Akshay Medicose (Ujjain Medical Store App v3.0)
## UI/UX Wireframe & User-Flow Specification (Step 2 Deliverable)

**Prepared for:** Nihar sir  
**Prepared by:** UI/UX Designer  
**Target Version:** `v3.0` (Minimal 4-Tab Role-Separated Pharmacy App)  
**Source References:** `/workspace/medical-store-app/PRD-v3.0.md`, `/workspace/medical-store-app/public/index.html`, `/workspace/medical-store-app/public/css/styles.css`, `/workspace/medical-store-app/public/js/app.js`

---

## 0. Executive Summary & Design System Foundation

### 0.1 Core UX Problem Solved
In `v1.0`, the top navigation bar (`#modnav`) rendered **8 horizontal pills** (`Dashboard`, `Purchase Bills`, `Inventory & Racks`, `Shortbook`, `Counter Sale`, `Credit Ledger`, `Monthly Refills`, `Stock Audit`). On mobile screens, this required horizontal scrolling, mixed daily counter tasks with owner-level accounting, and required too many taps during peak counter rush at **Akshay Medicose, Freeganj, Ujjain**.

### 0.2 v3.0 UX Architecture Principles
1. **Strict 4-Tab Navigation Per Role**: Never show more than 4 top-level tabs at once. Every daily counter workflow is reachable in **1–2 taps**.
2. **Hard Role Separation (`Employee Mode` vs `Admin/Owner Mode`)**:
   - **Employee Mode (Default)**: Optimized for speed at the counter. Zero visibility into purchase rates (`PTR`), gross/net margins, owner profit/loss, staff salaries, or destructive database settings.Not merely hidden via CSS—excluded from Employee view templates (`!owner` guard in `app.js` + `body[data-owner="0"] .owner-only { display: none !important; }`).
   - **Admin / Owner Mode (Protected)**: Unlocked via **4-Digit PIN**, **3×3 Pattern Grid**, or **Fingerprint / Face Biometrics**. Surfaces the Shopkeeper Margin Dashboard (*"Ek dhande wale ka din ka kitna margin tha"*), Seasonality Analytics (*"Konsi dawai konse mahine me zyada biki hai"*), Staff Salaries & Shop Expenses, full Store Operations (with PTR & Margin % columns), and Security/Demo controls.
3. **Hands-Free & Low-Tap Input**: Prominent **Camera AI Scan** (with transparent `X / 300` monthly Gemini quota badge) + **Speech-to-Text Voice Entry** (`🎤 Bol kar Dawai Jodein`) + **2-Step Draft Voucher (`Kaccha Parcha`) → `Finalize (`Pakka Bill`)`** workflow.
4. **Zero-State Ready**: Interactive 5-step Coach Marks tutorial and empty-state ghost cards work seamlessly whether the store database has **0 records** (fresh wipe) or full Ujjain demo seed data.

### 0.3 Design Tokens & CSS Variables (Extending `public/css/styles.css`)
```css
:root {
  /* Existing v1.0 Base Palette */
  --bg: #f8fafc;
  --surface: #ffffff;
  --ink: #0f172a;
  --muted: #64748b;
  --line: #e2e8f0;
  --blue: #2563eb;
  --green: #059669;
  --amber: #b45309;
  --rose: #be123c;
  --shadow: 0 1px 2px rgba(15, 23, 42, 0.04), 0 8px 24px rgba(15, 23, 42, 0.04);
  --radius: 12px;

  /* v3.0 Role & Status Semantic Tokens */
  --role-emp-bg: #f1f5f9;
  --role-emp-ink: #0f172a;
  --role-admin-bg: #eff6ff;
  --role-admin-ink: #1e3a8a;
  --role-admin-border: #bfdbfe;

  /* AI Quota Badge Tokens */
  --quota-ok-bg: #ecfdf5;
  --quota-ok-ink: #047857;
  --quota-warn-bg: #fffbeb;
  --quota-warn-ink: #b45309;
  --quota-crit-bg: #fff1f2;
  --quota-crit-ink: #be123c;

  /* Touch Target & Spacing Rules */
  --tap-min: 44px;          /* Minimum touch target height on mobile */
  --tap-cta: 48px;          /* Primary action button height */
}
```

---

## Deliverable 1: Minimal 4-Tab Navigation & Role Split (`Employee Mode` vs `Admin/Owner Mode`)

### 1.1 Sticky App Header & Role Switcher Badge
Replaces the ambiguous `#ownerBtn` pill with a clear, high-contrast role badge in `.topbar` alongside the bilingual toggle (`EN | HI`), Tutorial trigger (`?`), and APK QR button.

#### A. Header in `Employee Mode` (`body[data-owner="0"]`)
```text
+-----------------------------------------------------------------------------------+
| [AM] Akshay Medicose        [👤 Employee Mode · Switch to Admin 🔒] [EN|HI] [📲]  |
|      Freeganj, Ujjain                                                             |
+-----------------------------------------------------------------------------------+
| [ 🧾 1. Counter & Vouchers ] [ 📦 2. Stock & Add ] [ ⚠️ 3. Exp Return (4) ] [ 🎓 4. Help & Demo ] |
+-----------------------------------------------------------------------------------+
```

#### B. Header in `Admin / Owner Mode` (`body[data-owner="1"]`)
```text
+-----------------------------------------------------------------------------------+
| [AM] Akshay Medicose   [🛡️ Admin Mode · Lock to Employee 🔓] [⏱️ 14m] [EN|HI] [📲] |
|      Freeganj, Ujjain                                                             |
+-----------------------------------------------------------------------------------+
| [ 📈 1. Owner P/L & Seasonality ] [ 💸 2. Expenses & Salaries ] [ 🏪 3. Operations ] [ 🔐 4. Security & Demo ] |
+-----------------------------------------------------------------------------------+
```

### 1.2 Complete Role & Navigation Mapping Matrix

| Tab Slot | Employee Mode (`owner = false`) | Admin / Owner Mode (`owner = true`) |
| :--- | :--- | :--- |
| **Tab 1 (Default)** | **`emp-counter` — Counter & Vouchers (`Sale`)**<br>Sub-segments (3): `⚡ Fast Sale & Drafts` · `📒 Customer Udhaar` · `🔁 Monthly Refills` | **`adm-pl` — Owner P/L & Seasonality**<br>Sub-segments (2): `💰 Daily/Weekly/Monthly Margin` · `📊 Medicine Seasonality` |
| **Tab 2** | **`emp-stock` — Stock & Add (`Inventory`)**<br>Sub-segments (3): `🔍 Search & Racks` · `➕ Add Stock (Scan / Mic / Bill)` · `📋 Shortbook` | **`adm-expenses` — Expenses & Salaries**<br>Fast 1-line Expense/Salary entry + Monthly Expense Breakdown & Ledger |
| **Tab 3** | **`emp-expiry` — Expiry Return (`Alag Section`)**<br>Dedicated near-expiry (30/60/90d) & expired stock return slip builder + status tracker | **`adm-ops` — Operations (All Store Views)**<br>Sub-segments (4): `🧾 Counter & Vouchers` · `📦 Stock & Bills (PTR Visible)` · `⚠️ Expiry Return` · `⚖️ Stock Audit` |
| **Tab 4** | **`emp-help` — Help & Demo (`Guide`)**<br>Launch 5-Step Interactive Coach Marks, Voice/Scan tips, Demo Reset/Seed shortcuts | **`adm-settings` — Security, AI Quota & Demo Control**<br>Configure PIN / Pattern / Biometric, Gemini `X/300` Quota Meter, 1-Tap Demo Wipe & Re-seed |

### 1.3 Sub-View Segmented Control Pattern (`.subseg`)
To keep every workflow 1–2 taps away without crowding the main navbar, tabs with multiple related tools use a single horizontal segmented bar (`.seg.subseg`) right below `.page-head` with **maximum 3–4 segments**:
```html
<div class="seg subseg" role="tablist" aria-label="Sub-navigation">
  <button type="button" class="on" data-subview="pos">⚡ Fast Sale &amp; Vouchers <span class="badge">2 Drafts</span></button>
  <button type="button" data-subview="credit">📒 Customer Udhaar</button>
  <button type="button" data-subview="refills">🔁 Monthly Refills (3)</button>
</div>
```

### 1.4 Information Visibility Guardrails (`Employee` vs `Admin`)
| Data Point / Action | Employee Mode (`data-owner="0"`) | Admin Mode (`data-owner="1"`) |
| :--- | :--- | :--- |
| **Medicine MRP & Rack Location** | ✅ Visible everywhere | ✅ Visible everywhere |
| **Purchase Rate (`PTR`) & Margin %** | ❌ Completely hidden (DOM omitted + CSS `.owner-only`) | ✅ Visible in Inventory, Substitutes, Bills, Vouchers, Exp Return |
| **Shopkeeper P/L & Gross/Net Margin** | ❌ No access (Tab does not exist in Employee Mode) | ✅ Default landing tab (`adm-pl`) |
| **Staff Salaries & Shop Expenses** | ❌ No access | ✅ Full CRUD in Tab 2 (`adm-expenses`) |
| **Voucher Draft Creation (`Kaccha Parcha`)** | ✅ Can create, edit, and finalize counter sales | ✅ Can create, edit, approve/finalize, or cancel any voucher |
| **Stock Audit Variance Reconciliation** | ❌ Hidden from Employee tabs to prevent unauthorized stock write-offs | ✅ Accessible under `3. Operations → Stock Audit` |

### 1.5 Responsive Navigation Rules
- **Desktop / Tablet (`>= 768px`)**: 4 tabs sit inside `.sticky-shell .modnav` as equal-width or auto-sized pill tabs with icons, labels, and live count badges (`grid-template-columns: repeat(4, minmax(0, 1fr))`).
- **Mobile (`< 768px`)**: `.modnav` renders as a **2×2 compact grid in the sticky header** OR a **fixed 4-column bottom navigation bar** (`height: 60px; position: fixed; bottom: 0; left: 0; right: 0; z-index: 35`) so thumb navigation at the counter requires zero reach to the top of the phone.

---

## Deliverable 2: Admin Security Unlock Flow (`#admin-unlock-modal`)

### 2.1 User Flow Diagram
```text
[Employee clicks "👤 Employee Mode · Switch to Admin 🔒"]
       │
       ▼
Opens #admin-unlock-modal (Defaults to owner's preferred or last-used auth method)
       │
       ├──► Tab A: [🔢 4-Digit PIN] ──────► Tap 4 digits on keypad (auto-submits on 4th digit)
       │                                     ├─► Match (e.g. "1234") ──► Unlock Admin Mode (toast + switch to Tab 1: Owner P/L)
       │                                     └─► Mismatch ──► Shake animation + inline error "Wrong PIN / गलत पिन"
       │
       ├──► Tab B: [🕸️ Pattern Grid] ────► Drag finger/mouse across 3×3 nodes (min 4 nodes, e.g. L-shape 0-3-6-7-8)
       │                                     ├─► Match stored pattern ──► Nodes turn green (#059669) ──► Unlock Admin Mode
       │                                     └─► Mismatch ──► Nodes flash rose (#be123c) + auto-clear after 600ms
       │
       └──► Tab C: [🫆 Fingerprint / Face] ► Tap "Unlock with Biometrics" (triggers WebAuthn navigator.credentials.get)
                                             ├─► Success ──► Unlock Admin Mode immediately
                                             └─► Canceled / Not Enrolled ──► Instant 1-tap fallback to PIN or Pattern tab
```

### 2.2 ASCII Wireframes for All 3 Unlock Methods

```text
+-------------------------------------------------------------------+
| 🛡️ Unlock Admin / Owner Mode (मालिक मोड खोलें)               [✕] |
| View daily margins, P/L, staff salaries, and purchase rates (PTR) |
|                                                                   |
|  +--------------------+--------------------+-------------------+  |
|  | 🔢 PIN (पिन)       | 🕸️ Pattern (पैटर्न) | 🫆 Biometric (फिंगर)|  |
|  +--------------------+--------------------+-------------------+  |
|                                                                   |
|  [ VIEW A: 4-DIGIT PIN ]      [ VIEW B: 3x3 PATTERN ]             |
|       ( ● ) ( ● ) ( ○ ) ( ○ )        ( 1 )──────( 2 )      ( 3 )  |
|                                                  │                |
|       [ 1 ]   [ 2 ]   [ 3 ]          ( 4 )      ( 5 )──────( 6 )  |
|       [ 4 ]   [ 5 ]   [ 6 ]                                │      |
|       [ 7 ]   [ 8 ]   [ 9 ]          ( 7 )      ( 8 )      ( 9 )  |
|       [Clr]   [ 0 ]   [ ⌫ ]     "Draw pattern (min 4 dots)"       |
|                                                                   |
|  [ VIEW C: FINGERPRINT / FACE UNLOCK ]                            |
|       +---------------------------------------------------+       |
|       |                  (( 🫆 / 😊 ))                    |       |
|       |     Touch fingerprint sensor or look at camera    |       |
|       |   [ 🔓 Verify Fingerprint / Face (बायोमेट्रिक) ]   |       |
|       +---------------------------------------------------+       |
|       Muted hint: Using WebAuthn / Android Device Biometrics.     |
+-------------------------------------------------------------------+
```

### 2.3 Component & Interaction Specifications
- **DOM ID**: `#admin-unlock-modal` rendered inside `#modalRoot`.
- **Method Switcher**: `.seg.auth-method-seg` with `data-auth-tab="pin" | "pattern" | "biometric"`.
- **PIN Pad (`#pin-view`)**:
  - 4 visual dot indicators (`.pin-dot.filled`) + hidden/readonly `<input id="pinInput" type="password" inputmode="numeric" maxlength="4">`.
  - Supports both physical keyboard typing (`0-9`, `Backspace`, `Enter`) and large on-screen `3×4` touch keypad (`min-height: 52px` per button).
  - Auto-evaluates immediately when the 4th digit is entered (no extra "Submit" tap needed, though an `[Unlock]` button remains for accessibility).
- **3×3 Pattern Grid (`#pattern-view`)**:
  - Rendered as an interactive `<svg id="patternSvg" viewBox="0 0 240 240" class="pattern-grid">` with 9 hit-target circles (`data-node="0"` through `"8"`, radius `24px` touch zone, `8px` visible center dot).
  - Uses `pointerdown`, `pointermove`, `pointerup` events with `setPointerCapture` for smooth mobile touch and desktop mouse drawing.
  - Draws live `<polyline id="patternLine">` connecting visited nodes + active cursor position.
  - Serializes sequence as hyphen-joined string (e.g., `"0-3-6-7-8"` for an `L` pattern, default demo pattern `"0-3-6-7-8"`).
- **Biometric / Face Unlock (`#biometric-view`)**:
  - Checks `window.PublicKeyCredential && PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()`.
  - If enrolled (`store_settings.biometric_credential_id`), triggers `navigator.credentials.get({ publicKey })`.
  - In standalone Android WebView / demo environments without hardware WebAuthn credentials enrolled yet, provides:
    1. In **Admin Settings (`Tab 4`)**: `[+ Register This Device's Fingerprint / Face]` (`navigator.credentials.create`).
    2. In **Unlock Modal**: If hardware biometric prompt succeeds (or in local demo simulation mode when authorized), unlocks Admin Mode; if unavailable or dismissed, displays a non-blocking banner `"Biometric not set up on this browser — use PIN (1234) or Pattern (L-shape)"` and switches focus to PIN.
- **Auto-Lock & 1-Tap Lock Behavior**:
  - Clicking `[🛡️ Admin Mode · Lock to Employee 🔓]` in `.topbar` immediately sets `owner = false`, clears `sessionStorage.removeItem('am-owner')`, and routes to Employee Tab 1 (`emp-counter`) in **1 tap**.
  - **Inactivity Auto-Lock Timer**: While in Admin Mode, an idle timer resets on pointer/keyboard activity. After **15 minutes of inactivity** (configurable in Admin Settings: `5m / 15m / 30m`), automatically locks back to Employee Mode so the owner never accidentally leaves profit margins exposed on the counter screen.

---

## Deliverable 3: Fast Inventory Entry & Voucher UX

### 3.1 Scan to Add Inventory + Gemini AI 300 Calls/Month Quota Badge

#### A. Quota Badge Visual States (`.ai-quota-pill`)
Displayed prominently in the `Stock & Add → Add Stock` header, inside the Camera Scan sheet, and in `Admin Settings`:
1. **Healthy (`> 50` left, e.g., `284 / 300`)**:
   - Class: `.pill.ai-quota.ok` (`background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0`)
   - Text: `✨ 284 / 300 AI Scans left this month` (HI: `✨ इस महीने 284 / 300 AI स्कैन बाकी`)
2. **Low Warning (`10 – 50` left, e.g., `32 / 300`)**:
   - Class: `.pill.ai-quota.warn` (`background: #fffbeb; color: #b45309; border: 1px solid #fde68a`)
   - Text: `⚠️ 32 / 300 AI Scans left this month`
3. **Critical (`1 – 9` left, e.g., `4 / 300`)**:
   - Class: `.pill.ai-quota.crit` (`background: #fff1f2; color: #be123c; border: 1px solid #fecdd3`)
   - Text: `🚨 Only 4 / 300 AI Scans left!`
4. **Exhausted (`0 / 300` left — Hard Limit Reached)**:
   - Class: `.pill.ai-quota.exhausted` (`background: #f1f5f9; color: #64748b; border: 1px solid #cbd5e1`)
   - `[📷 Gemini AI Scan]` button becomes `disabled` with tooltip/subtext: `"Monthly 300 AI scan quota reached (resets 1st of next month). Use Voice Entry, Offline OCR, or Manual Rack Form below."`

#### B. Scan to Add Sheet Wireframe
```text
+-----------------------------------------------------------------------------------+
| 📦 Add Stock / Purchase Entry     [✨ 284 / 300 AI Scans left this month]         |
+-----------------------------------------------------------------------------------+
| +-----------------------------------+  +----------------------------------------+ |
| | 📷 Scan Strip / Purchase Bill     |  | 🎤 Bol kar Dawai Jodein (Voice Entry) | |
| | Snap medicine strip or wholesaler |  | Hands-free speech-to-text stock entry  | |
| | invoice for instant AI extraction |  | "Augmentin 625, 10 strips, Rack A-2..."| |
| | [ 📸 Open Camera / Upload Photo ] |  | [ 🎙️ Tap & Speak Stock Details ]      | |
| +-----------------------------------+  +----------------------------------------+ |
+-----------------------------------------------------------------------------------+
```

### 3.2 Speech-to-Text Mic Entry (`🎤 Bol kar Dawai Jodein / Voice Entry`)

#### A. Interaction Flow & Live Listening State
1. Staff taps `[🎙️ Tap & Speak Stock Details]` (`#btnVoiceStockAdd`).
2. Button transitions to active pulsing state (`.btn-voice.listening`, rose/red ring animation) with a live 5-bar CSS waveform (`#voiceWaveform`) and live transcript preview box (`#voiceTranscriptPreview`).
3. Staff speaks naturally in **Hindi, Hinglish, or English**, e.g.:
   > *"Dolo 650 पंद्रह पत्ते रैक A-1 बैच DL24 एक्सपायरी अगस्त 2027 एमआरपी 34 पीटीआर 24"*  
   > or *"Pan D 20 strips rack B2 batch PN99 expiry 12/2027 mrp 190 ptr 142"*
4. **Structured Field Parser (`parseVoiceStockEntry(transcript)`)**:
   - Extracts and highlights parsed tokens into editable chips before populating the form:
     - **Brand Name**: Matched against existing `state.medicines` fuzzy list or capitalized leading phrase (`"Dolo 650"`).
     - **Strips Qty**: Regex matches `<number> (strips|strip|patte|patti|पत्ते|पट्टी)` (`15`).
     - **Loose Qty**: Regex matches `<number> (loose|tablets|goli|खुली|गोली)` (`0`).
     - **Rack Location**: Regex matches `(rack|रैक|shelf)\s*([A-C]-?[1-5]|cold\s*storage)` (`Rack A-1`).
     - **Batch No**: Regex matches `(batch|बैच)\s*([A-Z0-9-]+)` (`DL24`).
     - **Expiry Date**: Parses `MM/YYYY` or `<MonthName> <YYYY>` into end-of-month ISO date (`2027-08-31`).
     - **MRP & PTR**: Regex matches `(mrp|एमआरपी)\s*(\d+(\.\d+)?)` and `(ptr|पीटीआर|rate)\s*(\d+(\.\d+)?)` (note: in Employee Mode, if PTR is omitted, it auto-defaults to last known batch PTR or `0.72 * MRP` behind the scenes without displaying margin).

```text
+-----------------------------------------------------------------------------------+
| 🔴 Listening... Speak medicine, strips, rack, expiry, MRP          [ ⏹️ Stop ]   |
| ılılılılı  "Dolo 650 15 strips rack A-1 batch DL24 expiry Aug 2027 mrp 34"        |
| Parsed: [💊 Dolo 650] [📦 15 Strips] [🗄️ Rack A-1] [🏷️ Batch DL24] [📅 Aug 2027] |
|                                       [ ✏️ Fill into Form ]  [ 🔄 Speak Again ]   |
+-----------------------------------------------------------------------------------+
```

### 3.3 Voucher Option → Finalize (`Kaccha Parcha` → `Pakka Bill`)

#### A. Why 2-Step Voucher Workflow Matters at the Counter
At a busy Ujjain medical counter, a helper frequently packs 2–3 medicines on a slip (`Kaccha Parcha`) while the customer checks their wallet/UPI or waits for the senior pharmacist/owner to verify the bill before stock is permanently deducted.

#### B. Counter & Stock Entry Action Bar (2-Button Split)
Instead of a single immediate commit button, both **Counter Sale** and **Purchase Stock Entry** provide two clear actions:
```text
+-----------------------------------------------------------------------------------+
| Medicine: Augmentin 625 Duo (Rack A-2 · Batch AUG24 · Exp Nov 2027)               |
| Strips: [ − ]  2  [ + ]    Loose: [ − ]  0  [ + ]    Pay: [Cash] [UPI] [Udhaar]   |
| Customer: Rajesh Sharma (9826011223)                 Total Payable: ₹404.00       |
|                                                                                   |
|  +---------------------------------------+  +-----------------------------------+ |
|  | 💾 Save Draft Voucher (कच्चा पर्चा)     |  | ✅ Finalize & Deduct Stock (पक्का) | |
|  +---------------------------------------+  +-----------------------------------+ |
+-----------------------------------------------------------------------------------+
```
- **`[💾 Save Draft Voucher (Kaccha Parcha)]` (`#btnSaveDraftVoucher`)**:
  - Creates a row in `vouchers` with `status = 'DRAFT'` (e.g., `VCH-1042`).
  - **Does NOT deduct** `inventory_batches` or post to `credit_transactions` yet.
  - Shows toast: `"Draft Voucher #VCH-1042 saved (Kaccha Parcha)"`.
- **`[✅ Finalize & Deduct Stock (Pakka Bill)]` (`#btnFinalizeNow`)**:
  - Immediately executes FEFO batch deduction (`fefoService`), logs `sales_entries`, creates a `FINALIZED` voucher record, and opens the receipt/WhatsApp option.

#### C. Pending Draft Vouchers Queue Banner/Drawer (`#draft-vouchers-panel`)
Displayed right below the Counter Sale form (and inside Admin `Operations → Vouchers`):
```text
+-----------------------------------------------------------------------------------+
| ⏳ Pending Draft Vouchers (कच्चे पर्चे — 2 Waiting to Finalize)                    |
+-----------------------------------------------------------------------------------+
| #VCH-1042 · SALE · Rajesh Sharma · Augmentin 625 (2 strips)           ₹404.00    |
| Created 2 mins ago by Employee     [ ✏️ Edit ]  [ 🗑️ Cancel ]  [ ✅ Finalize ]    |
|-----------------------------------------------------------------------------------|
| #VCH-1041 · PURCHASE · Mahakal Pharma · 4 Line Items                  ₹6,420.00  |
| Created 15 mins ago by Employee    [ ✏️ Review ] [ 🗑️ Cancel ]  [ ✅ Finalize ]    |
+-----------------------------------------------------------------------------------+
```
- Tapping **`[✅ Finalize]`** on any draft row commits the FEFO sale deduction (or increments purchase batch stock) in **1 tap**, stamps `finalized_at`, and moves the voucher to `FINALIZED` history.

### 3.4 Dedicated Expiry Return Section (`Alag Section Exp Return`)

#### A. Standalone Tab Layout (`Tab 3` in Employee Mode & `Operations → Exp Return` in Admin Mode)
```text
+-----------------------------------------------------------------------------------+
| ⚠️ Expiry Return Section (एक्सपायरी वापसी — अलग सेक्शन)                           |
| Filter Batches & Generate Supplier Return Slips / Credit Note Claims              |
+-----------------------------------------------------------------------------------+
| Window: [ 🔴 Already Expired (2) ] [ 🟠 <= 30 Days (3) ] [ 🟡 <= 60 Days (6) ] [ 90d ] |
| Supplier: [ All Wholesalers (सभी) ▾ ]   Status: [ All | Pending | Sent | Adjusted ]|
+-----------------------------------------------------------------------------------+
| 🏢 Mahakal Pharma Agency (Ujjain) · GSTIN: 23AABCM1122D1Z2                        |
| 3 Expiring Batches Selected                        [Owner Only: PTR Claim ₹1,480] |
|-----------------------------------------------------------------------------------|
| [☑] Pan-D Capsules       Batch: PND19  Exp: 15 Nov 2026 (17d)  12 Strips  PENDING |
| [☑] Azithral 500         Batch: AZT04  Exp: 02 Oct 2026 (EXP)   5 Strips  PENDING |
| [☑] Shelcal 500          Batch: SHL88  Exp: 10 Dec 2026 (42d)   8 Strips  SENT    |
|                                                                                   |
| Actions for Selected (3):                                                         |
| [ 📄 Create Return Slip ] [ 💬 WhatsApp Supplier ] [ ➡️ Mark Sent ] [ ✅ Adjusted ]|
+-----------------------------------------------------------------------------------+
| 📋 Return Slips & Credit Note Pipeline (`expiry_returns` table)                   |
| RET-201 · Mahakal Pharma · 17 Strips · [ 🟡 SENT TO SUPPLIER ] · CN#: [________]  |
|                                                       [ ✅ Mark Credit Adjusted ] |
+-----------------------------------------------------------------------------------+
```

#### B. Expiry Return Status Pipeline
Each return item/slip progresses through 3 clear states with 1-tap transitions:
1. **`PENDING` (`⏳ वापसी बाकी`)**: Flagged in shelf stock (`days_to_expiry <= window`), ready to pack for the wholesaler's delivery boy.
2. **`SENT` (`📦 सप्लायर को भेजा`)**: Handed over to supplier with generated Return Slip; awaiting Credit Note.
3. **`ADJUSTED` (`✅ हिसाब एडजस्ट / Credit Note Received`)**: Records `credit_note_no` (e.g. `CN-8821`) and zeroes out the expired batch from active shelf count (`is_return_claimed = 1`).

---

## Deliverable 4: Admin-Only Profit/Loss, Expenses & Seasonality Dashboard

### 4.1 Tab 1 (Admin Mode): Shopkeeper P/L & Margin View (*"Ek dhande wale ka din ka kitna margin tha"*)

#### A. ASCII Wireframe (`#admin-pl-dashboard`)
```text
+-----------------------------------------------------------------------------------+
| 📈 Shopkeeper Profit, Margin & Seasonality (दुकानदार मुनाफा और विश्लेषण)           |
| "Ek dhande wale ka din ka kitna margin tha" — Strictly Admin / Owner View         |
|                                                                                   |
| Period: [ ☀️ Aaj (1 Day) ] [ 📅 Is Hafte (7 Days) ] [ 🗓️ Is Mahine (30 Days) ]    |
+-----------------------------------------------------------------------------------+
| +-------------------+ +-------------------+ +-------------------+ +-------------+ |
| | 🧾 Total Sales    | | 📈 Gross Margin   | | 💸 Expenses       | | 💰 Net Profit| |
| | (कुल बिक्री)       | | (MRP − PTR बचत)   | | (पगार + अन्य खर्च)| | (असली मुनाफा)| |
| | ₹14,850.00        | | ₹3,861.00 (26.0%) | | ₹1,150.00         | | ₹2,711.00   | |
| | 42 Counter Bills  | | COGS PTR: ₹10,989 | | Salary ₹800+Oth350| | 18.2% Net   | |
| +-------------------+ +-------------------+ +-------------------+ +-------------+ |
|                                                                                   |
| 📊 Revenue Split Bar (₹14,850 Total Sales):                                       |
| [██████████████████████ PTR Cost (74%) ██████████████████████][██ Exp 8%][██ Net 18%]|
+-----------------------------------------------------------------------------------+
```

#### B. P/L Calculation Rules (Transparent & Exact)
For the selected time window (`1D = Today 00:00 to now`, `1W = Last 7 days`, `1M = Current calendar month / Last 30 days`):
1. **Total Sales (`कुल बिक्री`)**: Sum of `billed_amount` across non-cancelled `sales_entries` (and finalized `SALE` vouchers) in period.
2. **Cost of Goods Sold (`खरीद लागत / PTR Cost`)**: Sum of `(units_sold / pack_size_units) * batch.ptr_per_strip` for all items sold in period.
3. **Gross Margin (`दवा पर सीधा मार्जिन`)**: `Total Sales − COGS (PTR Cost)` along with `Gross Margin % = (Gross Margin / Total Sales) * 100`.
4. **Period Expenses (`खर्च — पगार + दुकान खर्च`)**:
   - In `1-Month` view: Full sum of `expenses` logged in that month.
   - In `1-Day` / `1-Week` view: Direct daily expenses logged on those dates + optional pro-rated fixed monthly salary/rent toggle (`[☑ Include Pro-Rated Daily Salary/Rent]`) so the shopkeeper sees true daily take-home profit.
5. **Net Profit (`असली शुद्ध मुनाफा`)**: `Gross Margin − Period Expenses` (rendered in bold green `#059669` if positive, rose `#be123c` if negative).

### 4.2 Tab 2 (Admin Mode): Staff Salaries & Shop Expenses (`#admin-expenses-view`)

```text
+-----------------------------------------------------------------------------------+
| 💸 Monthly Expenses & Staff Salaries (मासिक खर्च और स्टाफ पगार)                   |
+-----------------------------------------------------------------------------------+
| ➕ Quick Add Expense / Salary (1-Line Fast Entry):                                |
| [ Category: 👷 Staff Salary ▾ ] [ Name/Title: Rahul (Counter Staff) ]             |
| [ Amount ₹: 12000 ] [ Date: 2026-10-29 ] [ Note: Oct Salary ] [ ➕ Add Expense ]  |
+-----------------------------------------------------------------------------------+
| Category Pills: [ All: ₹24,500 ] [ 👷 Salary: ₹18,000 ] [ 🏪 Rent: ₹5,000 ]       |
|                 [ ⚡ Electricity: ₹1,100 ] [ 🚚 Transport/Misc: ₹400 ]            |
|-----------------------------------------------------------------------------------|
| Date         Category       Title / Staff Name        Note           Amount       |
| 29 Oct 2026  [👷 SALARY]    Rahul (Counter Boy)       Oct Full       ₹12,000.00 🗑️|
| 28 Oct 2026  [👷 SALARY]    Deepak (Helper)           Oct Part        ₹6,000.00 🗑️|
| 05 Oct 2026  [🏪 RENT]      Shop Rent (Freeganj)      Oct Rent        ₹5,000.00 🗑️|
| 03 Oct 2026  [⚡ ELECTRIC]  MPPKVVCL Bill             Fridge+Shop     ₹1,100.00 🗑️|
+-----------------------------------------------------------------------------------+
```

### 4.3 Seasonality Breakdown (*"Konsi dawai konse mahine me zyada biki hai"*)
Located directly below the P/L KPI cards in Admin Tab 1 (or switched via the `📊 Medicine Seasonality` sub-segment):

```text
+-----------------------------------------------------------------------------------+
| 🌦️ Medicine Seasonality ("कौनसी दवाई कौनसे महीने में ज़्यादा बिकी है")            |
| Compare monthly demand peaks to stock up before monsoon, winter, or summer waves  |
|                                                                                   |
| Month: [Jul] [Aug 🌧️] [Sep] [Oct (Current) ●] [Nov ❄️] [Dec]  | [📊 6-Month View] |
+-----------------------------------------------------------------------------------+
| Top Selling Medicines in October 2026:                                            |
|                                                                                   |
| #1 Dolo 650 (Paracetamol 650mg)                 🔥 Seasonal Peak: Monsoon/Fever   |
|    [████████████████████████████████████████] 148 Strips · ₹4,958 · Margin ₹1,388 |
|                                                                                   |
| #2 Azithral 500 (Azithromycin 500mg)            ❄️ Seasonal Peak: Oct–Jan Throat  |
|    [████████████████████████████            ]  96 Strips · ₹11,424 · Margin ₹2,688|
|                                                                                   |
| #3 Allegra 120mg (Fexofenadine)                 🍂 Seasonal Peak: Oct–Nov Allergy |
|    [█████████████████████                   ]  72 Strips · ₹15,696 · Margin ₹3,456|
|                                                                                   |
| #4 Electral ORS Powder                          ☀️ Seasonal Peak: Apr–Jul Summer  |
|    [██████████                              ]  34 Packs  · ₹748    · Margin ₹170  |
+-----------------------------------------------------------------------------------+
| 💡 Owner Reorder Insight: In Oct–Nov (Change of Season in Ujjain), Paracetamol,   |
|    Azithromycin & Antihistamines spike +42%. [ 📋 Add Top 3 to Shortbook ]        |
+-----------------------------------------------------------------------------------+
```

---

## Deliverable 5: Interactive Tutorial & 1-Tap Demo Data Reset/Seed

### 5.1 Step-by-Step Coach Marks Walkthrough (`#tutorial-spotlight`)
Works seamlessly in **both seeded state and 0-record (empty) state**. When launched from **0 records**, the tutorial renders non-persistent **Ghost Sample Cards** (`.tutorial-ghost-preview`) inside the highlighted container so the user sees exactly how a rack card, FEFO counter deduction, or P/L card looks without polluting the database.

#### 5-Step Guided Flow
```text
+-----------------------------------------------------------------------------------+
|                     [ Darkened Backdrop Overlay rgba(15,23,42,0.65) ]             |
|                                                                                   |
|   +---------------------------------------------------------------------------+   |
|   | [Highlighted Target Element with 4px #3b82f6 pulse ring]                  |   |
|   +---------------------------------------------------------------------------+   |
|                          ▲                                                        |
|   +---------------------------------------------------------------------------+   |
|   | 🎓 Step 1 of 5: Fast Counter Billing & Kaccha Parcha       [Skip Tour ✕]  |   |
|   | Type or speak any medicine name. The app automatically picks the          |   |
|   | earliest-expiring batch (FEFO) and shows the exact shelf Rack code.       |   |
|   | Save as a Draft Voucher (Kaccha Parcha) or Finalize in 1 tap!             |   |
|   |                                                                           |   |
|   | ● ○ ○ ○ ○                              [ ← Back ]  [ Next: Stock Add → ]  |   |
|   +---------------------------------------------------------------------------+   |
+-----------------------------------------------------------------------------------+
```

| Step | Target Selector | Title (EN / HI) | Zero-Record (0 Rows) Behavior |
| :--- | :--- | :--- | :--- |
| **Step 1** | `[data-view="emp-counter"]`, `#posPanel` | **1. Fast FEFO Counter & Draft Vouchers**<br>*(तेज़ काउंटर बिलिंग और कच्चा पर्चा)* | Shows a translucent ghost preview of *Dolo 650 · Rack A-1* and highlights `[💾 Save Draft Voucher]` vs `[✅ Finalize]`. |
| **Step 2** | `[data-view="emp-stock"]`, `#stockAddBar` | **2. AI Camera Scan & Voice Stock Entry**<br>*(कैमरा AI स्कैन और बोलकर स्टॉक जोड़ें)* | Highlights the `✨ 300 / 300 AI Scans left` badge and the `🎤 Bol kar Dawai Jodein` button. |
| **Step 3** | `[data-view="emp-expiry"]`, `#expiryReturnPanel` | **3. Dedicated Expiry Return Section**<br>*(एक्सपायरी वापसी का अलग सेक्शन)* | Highlights the `30 / 60 / 90 Days` filter chips and 1-tap WhatsApp Supplier Return Slip button. |
| **Step 4** | `#ownerBtn` | **4. Admin Unlock for Daily Margin & Seasonality**<br>*(मालिक मोड: दिन का मार्जिन और महीनेवार बिक्री)* | Demonstrates how PIN (`1234`), Pattern (`L`), or Fingerprint unlocks `Ek dhande wale ka din ka kitna margin tha` and `Konsi dawai konse mahine me zyada biki hai`. |
| **Step 5** | `[data-view="emp-help"]` / `#demoControlBar` | **5. 1-Tap Demo Wipe or Fresh Ujjain Seed**<br>*(1-टैप डेमो डेटा रीसेट या खाली शुरू करें)* | Points to the two 1-tap demo buttons so Nihar sir can switch between 0 records and realistic Ujjain data anytime during a live pitch. |

### 5.2 1-Tap Demo Data Reset / Seed Controls
Available in **Admin Tab 4 (`Security, AI Quota & Demo Control`)** AND as a quick-access Demo Bar inside **Employee Tab 4 (`Help & Demo`)** so Nihar sir never gets stuck during a live walkthrough:

```text
+-----------------------------------------------------------------------------------+
| 🧪 Live Demo & Onboarding Data Controls (डेमो डेटा नियंत्रण)                      |
| Instantly switch between a clean 0-record store and full Ujjain pharmacy data     |
+-----------------------------------------------------------------------------------+
| +---------------------------------------+ +-------------------------------------+ |
| | 🗑️ Clear All Demo Data (Zero State)   | | 🌱 Re-seed Fresh Ujjain Demo Data   | |
| | Wipes all medicines, batches, sales,  | | Loads 18 realistic Ujjain medicines,| |
| | vouchers & expenses to 0 records.     | | 3 wholesalers, expiring batches,    | |
| | Ideal for showing first-time setup.   | | expenses, and 6-month seasonality.  | |
| |                                       | |                                     | |
| | [ 🗑️ Wipe to 0 Records & Start Tour ] | | [ 🌱 Reset & Seed Realistic Data ]  | |
| +---------------------------------------+ +-------------------------------------+ |
+-----------------------------------------------------------------------------------+
```

#### Confirmation Modal Specification (`#demo-reset-confirm-modal`)
- Clicking either button opens a fast 1-tap confirmation sheet (`Cancel` vs `Confirm`) to prevent accidental taps:
  - **Action 1 (`POST /api/demo/clear-zero`)**: Truncates `sales_entries`, `vouchers`, `expiry_returns`, `expenses`, `inventory_batches`, `purchase_line_items`, `purchase_invoices`, `shortbook_items`, `credit_transactions`, `customer_accounts`, `refill_schedules`, `stock_audits`, `medicines`, and resets `ai_usage_monthly.calls_used = 0`. Optionally auto-launches the 5-Step Interactive Coach Marks (`#tutorial-spotlight`).
  - **Action 2 (`POST /api/reset-demo`)**: Resets and seeds fresh Ujjain data (`Mahakal Pharma Agency`, `Malwa Medico Traders`, `Shipra Drug House`, 6 months of historical sales across summer/monsoon/winter for Seasonality charts, sample `DRAFT` vouchers, sample `expenses` for Salary/Rent/Electricity, and near-expiry batches).

---

## 6. Developer Handoff: Bilingual `I18N` Keys & API/DOM Contract (For Step 3 Build)

### 6.1 New Bilingual Keys to Add to `public/js/i18n.js`
| Key | English (`en`) | Hindi (`hi`) |
| :--- | :--- | :--- |
| `empModeBadge` | `Employee Mode · Switch to Admin` | `कर्मचारी मोड · मालिक मोड खोलें` |
| `admModeBadge` | `Admin Mode · Lock to Employee` | `मालिक मोड · कर्मचारी मोड में लॉक करें` |
| `tabEmpCounter` | `1. Counter & Vouchers` | `1. काउंटर और पर्चे` |
| `tabEmpStock` | `2. Stock & Add` | `2. स्टॉक और नई दवा` |
| `tabEmpExpiry` | `3. Expiry Return` | `3. एक्सपायरी वापसी` |
| `tabEmpHelp` | `4. Help & Demo` | `4. गाइड और डेमो` |
| `tabAdmPl` | `1. Owner P/L & Seasonality` | `1. मुनाफा और सीज़न बिक्री` |
| `tabAdmExpenses` | `2. Expenses & Salaries` | `2. पगार और दुकान खर्च` |
| `tabAdmOps` | `3. Store Operations` | `3. सभी काउंटर कार्य` |
| `tabAdmSettings` | `4. Security & Demo` | `4. सुरक्षा और डेमो` |
| `aiScansLeft` | `AI Scans left this month` | `AI स्कैन इस महीने बाकी` |
| `voiceAddStock` | `Voice Entry (Speak to Add)` | `बोलकर दवाई जोड़ें (माइक)` |
| `saveDraftVoucher` | `Save Draft Voucher (Kaccha Parcha)` | `कच्चा पर्चा सेव करें (Draft)` |
| `finalizeVoucher` | `Finalize & Deduct Stock` | `पक्का बिल बनाएँ और स्टॉक घटाएँ` |
| `shopkeeperMarginTitle` | `Today's / Period Shopkeeper Margin` | `एक धंधे वाले का दिन/महीने का मार्जिन` |
| `seasonalityTitle` | `Which Medicine Sold Most in Which Month` | `कौनसी दवाई कौनसे महीने में ज़्यादा बिकी है` |
| `clearZeroBtn` | `Clear All Demo Data (0 Records)` | `सारा डेमो डेटा हटाएँ (0 रिकॉर्ड्स)` |
| `reseedDemoBtn` | `Re-seed Fresh Ujjain Demo Data` | `उज्जैन मेडिकल डेमो डेटा फिर से भरें` |

### 6.2 Summary Checklist for Nihar sir's Step 2 Sign-off
- [x] **Deliverable 1**: 8 crowded pills consolidated into **4 clean tabs** for Employee Mode and **4 clean tabs** for Admin Mode, with strict hiding of PTR/margins in Employee Mode.
- [x] **Deliverable 2**: Admin Unlock modal with **4-Digit PIN**, **3×3 Pattern Grid**, and **Fingerprint / Face Biometric** tabs + 1-tap Lock to Employee Mode.
- [x] **Deliverable 3**: **Scan to Add** with `X / 300` Gemini AI quota badge + **Speech-to-Text Mic Entry** + **Draft Voucher (`Kaccha Parcha`) → Finalize** + **Dedicated Expiry Return (`Alag Section`)**.
- [x] **Deliverable 4**: Admin-only **1-Day / 1-Week / 1-Month Margin & Net Profit Dashboard** (*"Ek dhande wale ka din ka kitna margin tha"*), **Salary + Other Expenses ledger**, and **Monthly Medicine Seasonality** (*"Konsi dawai konse mahine me zyada biki hai"*).
- [x] **Deliverable 5**: **5-Step Coach Marks Tutorial** (with 0-record ghost previews) + **1-Tap Demo Wipe (0 Records) & 1-Tap Realistic Ujjain Re-seed** controls.
