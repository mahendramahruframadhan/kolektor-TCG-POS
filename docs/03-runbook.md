# KolektaPOS — First Event Runbook

**Version:** 1.0 — 2026-04-23  
**Audience:** Revota + designated admins  
**System:** KolektaPOS (offline-first PWA + Fastify API on single VPS)

---

## 1. Pre-event setup (T−7 days)

### 1.1 Deploy / update server
```bash
ssh root@<vps-ip>
cd /opt/kolektapos
git pull origin main
pnpm install --frozen-lockfile
pnpm build

# Run migrations
DATABASE_PATH=/data/kolektapos.db node apps/api/dist/migrate.js

# Restart API (example: pm2 or systemd)
pm2 restart kolektapos-api   # or: systemctl restart kolektapos
```

### 1.2 Seed admin account
On first deploy only:
```bash
ADMIN_EMAIL=Revota@example.com \
ADMIN_PASSWORD=<secure-passphrase> \
DATABASE_PATH=/data/kolektapos.db \
node apps/api/dist/seed.js
```

### 1.3 Create the event
1. Login as admin → no UI event editor yet → use API directly:
```bash
curl -s -X POST http://localhost:3000/api/events \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{"name":"Pop Con 2026","venue":"Jakarta Convention Center","startDate":"2026-05-10","endDate":"2026-05-11"}'
```
2. Activate:
```bash
curl -s -X PUT http://localhost:3000/api/events/<id>/status \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{"status":"active"}'
```

### 1.4 Create cashier accounts
Admin panel → (API for now):
```bash
curl -s -X POST http://localhost:3000/api/users \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{"email":"kasir1@booth.local","password":"...","displayName":"Kasir 1","role":"cashier"}'
```

### 1.5 Configure settings
Admin → Settings page:
- `max_line_discount_pct_fixed`: e.g. `10`
- `max_transaction_discount_pct`: e.g. `5`
- `cart_idle_ttl_minutes`: e.g. `15`

### 1.6 Test backup
```bash
curl -s -o test-backup.db http://localhost:3000/api/backup --cookie cookies.txt
file test-backup.db   # should be: SQLite 3.x database
```

---

## 2. Card stock-receive (T−1 day / morning of event)

### 2.1 One-by-one stock-receive
1. Open PWA on tablet/phone → **Stock Receive**
2. Select owner from dropdown
3. Enter card details; toggle "Kartu Graded" if applicable
4. Optionally capture photo
5. Tap **Simpan Kartu** → card appears in Inventaris with status `Tersedia`

### 2.2 Bulk import
1. Fill `kolektapos-bulk-import-template.xlsx` (download from Bulk Import page)
2. Upload on `/stock-receive/bulk` → review validation summary
3. Fix errors in the spreadsheet if any invalid rows; re-upload
4. Tap **Import N Kartu** — progress shown; error report downloadable

### 2.3 QR / short-ID labels
After stock-receive, short ID is displayed on card detail. Use any label printer to print `O-XXXXX` format; stick to sleeve.

---

## 3. Day-of event checklist

### 3.1 Morning (before doors open)
- [ ] Verify all devices are charged
- [ ] Open PWA on each device → Dashboard → confirm active event shown
- [ ] Each device: tap any nav item to trigger initial sync pull
- [ ] Confirm sync: Inventaris should show all stock-received cards
- [ ] Test scan one card → verify it shows in POS screen
- [ ] Admin: verify settings are correct
- [ ] Have backup: `curl .../api/backup -o morning-backup.db`

### 3.2 Network-down procedure
**KolektaPOS is 100% offline-capable.**

If WiFi/hotspot drops:
1. Continue selling — all writes go to local IndexedDB
2. Carts, payments, card status updates all work locally
3. Background sync will retry automatically when network returns
4. No user action required; the PWA shows no error banner for offline state

**Exception:** Initial sync pull on first login requires network. If a cashier hasn't synced yet, they need at least one successful online pull before going offline.

### 3.3 Multi-device coordination
- Two devices can both be offline and sell different cards — no conflict
- Two devices selling the **same** card offline: both sales are recorded; card is flagged `oversold=true`; admin resolves via `/admin/oversold`
- Cart lock TTL: if cashier idles 15 min (default), cart auto-abandons and cards unlock

---

## 4. Oversold resolution procedure

When a card appears in the Oversold Queue:
1. Admin → **Antrian Oversold** (`/admin/oversold`)
2. Identify which of the two transactions to void: check timestamps, cashier names, and which buyer is still present
3. Enter void reason and tap **Konfirmasi Void**
4. The API creates a void transaction (insert-only) and marks card `available` again
5. Process a fresh sale or manually arrange the refund with the affected customer

---

## 5. End-of-day procedure

### 5.1 Cash reconciliation
1. Admin → **Rekonsiliasi Kas** (`/admin/cash-reconciliation`)
2. Select event + today's date
3. "Ekspektasi Kas" auto-filled from cash channel transactions
4. Count physical cash; enter in "Kas Terhitung"
5. Check variance (should be 0 or near-0); add notes if any discrepancy
6. Tap **Simpan Rekonsiliasi**

### 5.2 Daily report
Reports → **Harian** → select event + today → verify gross/net match POS summary → Export CSV

### 5.3 Backup
```bash
curl -o "backup-$(date +%Y%m%d-%H%M).db" https://<domain>/api/backup --cookie cookies.txt
```
Or admin → **Admin** → (backup download button if wired) → save copy off-device.

### 5.4 Last day: close event + settle
After final day:
1. Update event status to `closed` via API:
```bash
curl -X PUT .../api/events/<id>/status -d '{"status":"closed"}' ...
```
2. Reports → **Settlement** → select event → verify per-owner payouts → Export CSV
3. Distribute CSV to each owner for verification
4. Once all confirm: Reports → Settlement → **Kunci Settlement**
5. Take final backup

---

## 6. Network & device preparation

| Requirement | Notes |
|---|---|
| Server reachability | Same WiFi/hotspot; or VPS with domain |
| Initial pull | Each device needs ≥1 online login before going offline |
| Browser | Chrome/Firefox latest; Safari iOS 16+ |
| Storage quota | Allow site storage when prompted (PersistentStorage API) |
| USB HID scanner | Plug in before opening POS; feeds `<input>` on scan screen |
| Camera | Granted permission once on stock-receive page |

---

## 7. Rollback / disaster recovery

### API down during event
PWA keeps working entirely offline. When API recovers:
1. All pending offline writes sync via background pull/push (60s interval)
2. No manual intervention needed unless there are version conflicts (rare for cashier ops)

### IDB cleared on a device
All data lives on the server. On that device:
1. Re-open PWA → login → dashboard will trigger fresh sync pull
2. Full dataset restored from server within one sync cycle

### Database corruption on server
Restore from last backup:
```bash
systemctl stop kolektapos
cp morning-backup.db /data/kolektapos.db
systemctl start kolektapos
```
Transactions since the backup are lost — mitigate with frequent backups.

### Short ID collision
If stock-receive says "duplicate short ID":
1. Tap **Buat Ulang** in StockReceivePage to regenerate
2. In bulk import: re-upload the corrected row (new short ID auto-generated per row on each parse)

---

## 8. Post-event checklist

- [ ] Settlement locked in system
- [ ] Settlement CSV distributed to all 10 owners
- [ ] Final backup saved off-VPS (e.g. Google Drive)
- [ ] Oversold queue empty (or documented)
- [ ] Bug log written for next event

---

## 9. Contacts & escalation

- **Revota** — admin account, has backup files
- **VPS access** — SSH key required; keep credentials in password manager
- **Issues** — file at https://github.com/thebennies/kolektapos/issues

---

## 10. Troubleshooting

### Sync not working / SyncDot stuck in error state

**Symptoms:** SyncDot shows red error icon; cashiers see "Sinkronisasi gagal".

1. Check API connectivity: from the tablet browser, open `http://[server-ip]:3001/health`. Should return `{"ok":true}`.
2. Check the browser console (F12 → Console) for `[sync]` error messages.
3. If the error is "Unauthorized (401)", the session has expired — cashier must log out and log back in.
4. If the error is a network error, check Wi-Fi on the tablet.
5. If sync keeps failing, force a full re-sync: log out → log in (triggers `resetAndSync`).

### Pending transactions not flushing (SyncDot shows count badge)

**Symptoms:** SyncDot shows a number badge (e.g. `(2)`); receipts say "Tersimpan lokal".

1. The transactions are safe in IndexedDB — they will flush as soon as connectivity is restored.
2. Check connectivity (see above).
3. To trigger an immediate flush: switch to "Offline" mode and back to "Auto" using the NetworkModeToggle in the app bar.
4. If transactions remain stuck after connectivity is restored for >5 minutes, check the console for flush rejection reasons. Common cause: a card was sold by another device in the meantime (oversold) — the flush still succeeds, the card is just flagged for the Oversold Queue.

### Oversold queue not clearing

**Symptoms:** Admin sees cards in `Settings → Antrian Oversold` that should be resolved.

1. Navigate to `Settings → Antrian Oversold`.
2. For each card, click "Void Transaksi", enter a reason, and confirm.
3. After voiding, the card returns to `available` or remains `sold` depending on how many concurrent sales exist.
4. If a card still appears after voiding: another sale transaction for the same card still exists. Void that one too, or accept the state and handle manually during reconciliation.

### Card scan says "tidak ditemukan di database lokal"

**Symptoms:** Scanning a valid card QR code shows "Kartu tidak ditemukan di database lokal."

1. The card is not in IDB yet — trigger a fresh sync by logging out and logging back in.
2. If the card was just added in StockReceive on another device, wait 60 seconds for background sync.
3. Verify the card exists on the server: `http://[server-ip]:3001/api/cards/by-short-id/[SHORT-ID]`.

### Receipt says the wrong total / settlement numbers don't add up

1. Settlement uses `ownerUserIdSnapshot` on `transaction_items` — it never reads the live `cards.ownerUserId`. If a card's owner was changed after sale, the settlement correctly uses the owner at time of sale.
2. Discounts are distributed proportionally (last-owner absorbs rounding residual). A ±1 IDR difference per transaction is normal in multi-item carts with discounts.
3. Void/refund transactions appear as negative values in settlement. Check the "Void" column in the settlement CSV.

### API won't start / port already in use

```bash
# Find what's using port 3001
lsof -i :3001

# Kill it (replace PID)
kill -9 <PID>

# Restart
pnpm --filter @kolektapos/api dev
```
