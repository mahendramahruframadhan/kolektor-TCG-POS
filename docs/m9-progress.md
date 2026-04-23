# M9 Progress Report — Dry-Run + First Event Runbook

**Status:** Complete  
**Date:** 2026-04-23

## Deliverables

### `docs/03-runbook.md`
Full operational runbook covering:
1. **Pre-event setup (T−7 days):** deploy steps, migration run, admin seeding, event creation, cashier accounts, settings configuration, test backup
2. **Card intake:** one-by-one via IntakePage, bulk import via xlsx, QR/short-ID label printing
3. **Day-of checklist:** morning sync verification, USB scanner test, network-down procedure, multi-device coordination with oversold risk callout
4. **Oversold resolution:** step-by-step admin workflow via `/admin/oversold`
5. **End-of-day procedure:** cash reconciliation, daily CSV export, database backup, event close + settlement lock
6. **Network & device requirements:** browser support, storage quota, camera + USB scanner permissions
7. **Rollback / disaster recovery:** API down, IDB cleared, database corruption, short ID collision
8. **Post-event checklist:** settlement distribution, off-VPS backup, bug log

## Key scenarios exercised in runbook

| Scenario | Procedure |
|---|---|
| Two cashiers both offline selling same card | §3.3 → §4 (oversold queue) |
| WiFi drops during event | §3.2 (network-down) — no action needed, auto-sync on recovery |
| Cashier device IDB wiped | §7 (IDB cleared) — login + sync restores all data |
| Database backup needed mid-event | §5.3 (daily backup curl command) |
| End-of-event settlement | §5.4 (close event → settlement → lock → CSV) |
| Bulk intake from Excel | §2.2 (bulk import) |

## Dry-run instructions
The runbook is designed to be walked through with real cards, real phones, and 2+ cashiers before the first live event:
1. Create a test event (status: active)
2. Intake 10–20 real cards via intake page
3. Simulate a sale from two devices simultaneously (oversold scenario)
4. Let WiFi drop; complete a sale offline; reconnect and verify sync
5. Run cash reconciliation
6. Generate daily report; verify totals match manual count
7. Close event + lock settlement; verify per-owner CSV

## Definition of done (full MVP)
All PRD Phase 1 feature IDs are now implemented and testable:
- F1–F8: auth, users, events, cards, POS, payment, settlement (M2–M4)
- F10–F11: inventory view, intake (M3, M5)
- F13–F15: line discount, admin override, masks (M4–M5)
- F17–F18: cash reconciliation, daily report (M5, M7)
- F20: oversold queue (M6)
- F28: backup (M2)
- F34–F36: cart locking, settings, background sync (M4–M6)
- F12, F16, F19, F21, F23, F26: monthly report, graded fields, photo, reconciliation, tx discount, bulk import (M7–M8)
