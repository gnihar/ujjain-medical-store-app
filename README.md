# Akshay Medicose — Ujjain

Shop app for **Akshay Medicose, Freeganj, Ujjain**. It runs in the browser and inside `UjjainMedStore-v1.0.apk`.

English is the default. **HI** switches every label to Hindi. Owner mode (PIN `1234`) shows purchase rates and margin. Counter mode hides them.

## Run

```bash
npm install
npm start          # http://localhost:3456
npm test           # start the server first, then run this
npm run build:apk  # rebuild the signed Android APK
```

Open the shop at `/`. Open the phone installer at `/qr`.

## Modules

Dashboard, purchase bills, inventory and racks, shortbook, suppliers and stockist schemes, counter sale, credit ledger, monthly refills, and stock audit.

On `/qr`, the default code points at the public file:

`https://github.com/gnihar/ujjain-medical-store-app/raw/main/UjjainMedStore-v1.0.apk`

The same screen can switch to the GitHub release file or the shop Wi-Fi address `http://<lan-ip>:3456/download/UjjainMedStore-v1.0.apk`.

## Layout

- `server/` — Express, SQLite, FEFO sales, bills, credit, refills
- `public/` — the shop screens, plus `/qr` and `/install`
- `UjjainMedStore-v1.0.apk` — the Android app
- `supabase/schema.sql` — the same tables for a hosted database
