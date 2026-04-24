# PRD — KolektaPOS

**Product:** KolektaPOS — Private Point-of-Sale for TCG Sales Convention Booths
**Version:** 1.0 (Consolidated)
**Owner:** Revota
**Status:** Ready for implementation planning. All open questions resolved.
**Target users:** Revota + 10 co-owners operating a shared booth at TCG Sales conventions in Indonesia

---

## 1. Context

Revota and 10 friends pool their TCG Sales inventory to sell at conventions under a single shared booth. Off-the-shelf POS apps fail on three dimensions: TCG-specific pricing (condition, rarity, grading, negotiation), multi-owner consignment, and convention-grade network reliability.

KolektaPOS is a private, self-hosted, single-booth POS built for this group. Not a product. Not multi-tenant. Eleven users, one booth, one purpose: run convention weekends smoothly and split profits fairly.

---

## 2. Goals and Non-Goals

### 2.1 Goals (v1)

- Sub-3-second checkout from QR scan to "paid" state on the happy path
- Fully functional offline — every cashier operation works with zero network
- Zero ambiguity on card ownership, sale attribution, and per-owner per-event payout
- Hard floor protection on negotiable cards — never allow a sale below the owner-set bottom price
- Every sale tagged to event, owner, cashier, payment channel
- Cross-device cart visibility — prevent two cashiers from adding the same card to two carts when online or recently synced
- Daily and monthly reports with exportable owner settlement sheets
- Append-only transactions — no deletes, ever. Corrections via void/refund only.
- One-click database backup for peace of mind

### 2.2 Non-Goals (v1)

- Online storefront or customer-facing flow
- Loyalty, coupons beyond simple discount
- External TCG price API integration (TCGPlayer, PriceCharting)
- Inventory buying / supplier management
- Multi-booth / multi-location
- Customer accounts
- Authenticity tracking
- Trade-ins, booth fees, event expenses

---

## 3. Critical Risks

### R1 — Deployment model [RESOLVED: Local-first PWA + background sync]

All reads and writes hit local IndexedDB. Service worker handles offline shell. Background sync reconciles with cloud Fastify backend when network is available. Full protocol in §16.

### R2 — Ownership tracking [RESOLVED]

Every card has a single `owner_user_id`. Separate `stock_received_by_user_id` — anyone can stock-receive on behalf of any owner. Settlement uses the snapshot of `owner_user_id` taken at sale time, stored on the transaction line item.

### R3 — Bottom price leakage at the booth [STANDING]

Bottom price is never rendered visibly at the checkout/negotiation screen by default. Tap-and-hold reveal for 5 seconds, auto-hides. See §9.

### R4 — Counterfeit liability [OUT OF SCOPE]

Owner's responsibility, not booth's.

### R5 — Oversold card conflict [MITIGATED via cart-locking, not eliminated]

Cart locking (F34) prevents the majority of oversell situations by marking a card as `locked_by_cart_id` the moment any cashier adds it to a cart, and showing that lock to all other devices that have synced recently.

**Residual risk:** two devices **both offline simultaneously** can still each lock and sell the same card. On sync, both sales are accepted (append-only), the card is flagged `oversold` by the server, and it surfaces in the admin queue for manual void + refund.

**Accepted:** this is the irreducible cost of offline-first. Rare in practice — conventions rarely see all devices offline at once — but possible. Handled gracefully rather than pretended away.

---

## 4. Users and Roles

| Role    | Count      | Capabilities |
|---------|------------|--------------|
| Admin   | 1 (Revota)  | Everything. User management, event creation, override any guardrail (below-bottom, discount-over-max), void/refund transactions, close event, resolve oversold conflicts, edit settings, download backups. |
| Cashier | 10         | Stock-receive any card (for any owner), sell any card, accept payments, discount within configured max, view own payout. Hard-blocked by UI and server from selling below bottom or discounting over max — admin-only override. |

All users are known and trusted. Email + password, long-lived sessions. No 2FA, no SSO.

---

## 5. Feature Set

### 5.1 In scope — v1

| #   | Feature                                | Notes |
|-----|----------------------------------------|-------|
| F1  | Fixed-price cards                      | Stock-receive with single `price_idr`. Line-level discount allowed within `max_line_discount_pct_fixed` setting, always requires reason note. Beyond max → admin override with reason. |
| F2  | Negotiable cards                       | Stock-receive with `bottom_price_idr` and `listed_price_idr`. Cashier enters final price; discount auto-derived as `(listed − final) / listed`. Hard floor: `final ≥ bottom`. Below bottom → admin override with reason. |
| F3  | Event tagging                          | Every sale and stock-receive scoped to active event. Single active event at a time. |
| F4  | QR / barcode scan at checkout          | Camera-based (mobile) + USB HID scanner (desktop). Both feed the same input field. |
| F5  | QR / barcode printing per card         | Client-rendered PDF + browser print dialog. Target sticker size: 50×25mm (thermal label-friendly). |
| F6  | Short unique card ID                   | Format `O-XXXXX`, see §8. |
| F7  | Payment channel tagging                | Pre-configured: Cash IDR, BCA, Mandiri, BNI, GoPay, OVO, Dana, ShopeePay, QRIS, Other. Editable list. Optional account reference note. |
| F8  | Self-hosted cloud + local PWA          | React PWA served from Revota's domain (e.g. `pos.kolekta.id`). Client works fully offline. Fastify sync server on same domain. |
| F9  | Turbo + pnpm monorepo                  | Structure in §12. |
| F10 | Masked numbers with eye-icon reveal    | Dashboard totals, per-card prices, owner payouts, bottom prices on checkout — all default hidden. |
| F11 | Daily report                           | §7. |
| F12 | Monthly report                         | §7. |
| F13 | Ownership field per card               | Separate `owner_user_id` and `stock_received_by_user_id`. |
| F14 | Condition grade                        | Enum: Mint, Near Mint, Lightly Played, Moderately Played, Heavily Played, Damaged. |
| F15 | Set + card number + rarity + language + edition | Freeform text for set/number; enums for rarity, language (EN/JP/ID/KR/CN/Other), edition. |
| F16 | Graded card support                    | `is_graded`, `grading_company` (PSA/BGS/CGC/SGC/Other), `grade`, `cert_number`. |
| F17 | Per-event owner payout report          | Per-owner gross/net IDR, exportable CSV. |
| F18 | Hold / reserve                         | User-set expiry duration at time of hold. Auto-releases on expiry. Distinct from cart lock (F34). |
| F19 | Photo per card at stock-receive        | Phone camera snap. Stored as IndexedDB blob until sync, then uploaded. |
| F20 | Void / refund — NEVER delete           | Append-only transactions. Void/refund creates new compensating record with `parent_transaction_id`. |
| F21 | End-of-day cash reconciliation         | Expected vs counted cash IDR, variance + notes captured. Virtual tracking. |
| F23 | Transaction-level discount             | Percentage or fixed IDR off transaction total. Capped at `max_transaction_discount_pct` setting. Always reason note. Beyond max → admin override. |
| F26 | Excel bulk import for card catalog     | `.xlsx` upload, SheetJS-parsed, row-level validation. |
| F28 | Quick cash tender buttons              | One-tap amounts: Rp 50k, 100k, 200k, 500k, 1jt. Custom amount always available. Auto-calculates change. |
| F30 | Transaction notes                      | Free-text on every transaction. |
| F34 | Cart locking with cross-device visibility | Adding a card to a draft cart sets `cards.locked_by_cart_id` and `cards.locked_by_user_id`. All scanning devices (post-sync) see "Di keranjang [Name]" on that card. Lock releases on cart paid, abandoned, or auto-expired (TTL 30min idle). See §6 and §9. |
| F35 | App settings                           | Admin-editable singletons: `max_line_discount_pct_fixed` (default 20), `max_transaction_discount_pct` (default 30), `cart_idle_ttl_minutes` (default 30). Extensible. |
| F36 | One-click database backup              | Admin can download full SQLite snapshot + photo archive as single zip. Useful before/after every event. |

### 5.2 Deferred — v1.5 or later

| #   | Feature                                       | Reason deferred |
|-----|-----------------------------------------------|-----------------|
| F22 | Bundle / lot sale                             | Revisit after first event. |
| F33 | Multiple active events in parallel            | Not needed for current model. |
| —   | Buylist / trade-in mode                       | Useful at conventions but adds workflow complexity. Revisit post-MVP. |
| —   | Store credit / customer tab                   | Small crowd; not needed for v1. |
| —   | Low-stock alerts                              | Inventory turnover at conventions is low; not critical. |
| —   | Booth fee model                               | Skipped. Settlement assumes 100% of proceeds to card owner. |
| —   | Event expense tracking                        | Revota absorbs expenses for now. |
| —   | Indonesian tax export (SPT)                   | Relevant only if scale grows significantly. |

### 5.3 Dropped — explicit

F24 (authenticity), F25 (price history per card), F27 (customer lookup), F29 (showcase mode), F31 (trade-in), F32 (external price API).

---

## 6. Data Model

```
users
  id, email, password_hash, display_name, role, created_at, updated_at, version

events
  id, name, venue, start_date, end_date, status,
  created_at, updated_at, version
  status: draft | active | closed

payment_channels
  id, name, type, is_active, sort_order

settings
  id, key, value_json, updated_by_user_id, updated_at
  -- singleton-style config table. Known keys:
  --   max_line_discount_pct_fixed      (int, default 20)
  --   max_transaction_discount_pct     (int, default 30)
  --   cart_idle_ttl_minutes            (int, default 30)

cards
  id, short_id, owner_user_id, stock_received_by_user_id,
  title, set_name, set_number, rarity, language, edition, condition,
  is_graded, grading_company, grade, cert_number,
  photo_path,
  pricing_mode,                     -- fixed | negotiable
  price_idr,                        -- for fixed
  listed_price_idr,                 -- for negotiable
  bottom_price_idr,                 -- for negotiable
  status,                           -- available | held | sold | returned
  locked_by_cart_id,                -- nullable FK; denormalized for fast lookup
  locked_by_user_id,                -- nullable FK; denormalized for display
  locked_at,                        -- nullable timestamp
  created_at, updated_at, version,
  client_id                         -- client UUID for offline-created

holds                               -- customer reserves ("let me get cash")
  id, card_id, held_by_user_id, customer_label,
  expires_at, released_at,
  release_reason,                   -- expired | manual_release | converted_to_cart | voided
  notes, created_at

carts                               -- in-progress checkouts
  id, client_id, cashier_user_id, event_id,
  status,                           -- draft | paid | abandoned
  abandoned_reason,                 -- nullable: manual | idle_ttl | admin_force
  paid_transaction_id,              -- nullable FK, set when transitioned to paid
  last_activity_at,                 -- for idle TTL detection
  created_at, updated_at, version

cart_items
  id, cart_id, card_id,
  intended_price_idr,               -- final agreed price for this line
  line_discount_idr,                -- derived
  line_discount_pct,                -- derived
  line_discount_reason,             -- required if line_discount > 0
  requires_admin_override,          -- bool; true if below-bottom OR discount > max
  override_by_user_id,              -- nullable, set when admin approves
  override_reason,
  created_at, updated_at

transactions                        -- APPEND-ONLY
  id, client_id, cart_id,           -- cart_id links back to originating cart
  event_id, cashier_user_id,
  kind,                             -- sale | void | refund
  parent_transaction_id,            -- null for sale; FK for void/refund
  subtotal_idr, discount_idr, discount_reason, total_idr,
  payment_channel_id, payment_note, paid_at,
  void_or_refund_reason,
  notes, created_at

transaction_items                   -- APPEND-ONLY
  id, transaction_id, card_id,
  owner_user_id_snapshot,
  listed_price_idr_snapshot,
  sold_price_idr,
  line_discount_idr,
  line_discount_reason,
  override_below_bottom,
  override_reason,
  created_at

cash_reconciliations
  id, event_id, date, expected_cash_idr, counted_cash_idr,
  variance_idr, notes, closed_by_user_id, closed_at

audit_log
  id, user_id, action, entity_type, entity_id, diff_json, created_at
```

### 6.1 Hard rules on the data layer

1. **`transactions` and `transaction_items` are insert-only.** No UPDATE, no DELETE. Enforced at DB level via triggers or ORM layer.
2. **Void/refund is a new transaction** with `kind = void | refund` and `parent_transaction_id` set. Reports subtract these from gross to compute net.
3. **`carts` and `cart_items` are mutable** while `status = draft`. Locked to mutation once `paid` or `abandoned`.
4. **Card lock fields (`locked_by_cart_id`, `locked_by_user_id`, `locked_at`) are denormalized.** Updated atomically when cart_items are inserted or removed. Single source of truth is the `cart_items` table; the denorm is for fast UI display.
5. **`owner_user_id_snapshot` on `transaction_items`** is the single source of truth for settlement. Never join live through `cards.owner_user_id` for payout math.
6. **`client_id` on cards, carts, and transactions** enables idempotent sync.
7. **Cart TTL:** server-side sweeper job runs every 5 minutes, marks carts as `abandoned` with `abandoned_reason = idle_ttl` where `status = draft` and `last_activity_at < now − cart_idle_ttl_minutes`. Releases card locks atomically.
8. **All monetary values are integer IDR.** No decimals anywhere in the stack.

---

## 7. Reports

### 7.1 Daily report

Scope: single date × single event.

- Gross sales IDR
- Voids / refunds IDR
- Net IDR = gross − voids − refunds
- Transaction count by kind
- Cards sold count
- Breakdown by payment channel
- Breakdown by owner (gross, net, card count)
- Top 5 sales by value
- Discount total IDR (line + transaction)
- Override count (below-bottom, discount-over-max)
- Export: CSV, PDF

### 7.2 Monthly report

Scope: calendar month, all events.

- Gross, voids, refunds, net
- Events covered with per-event subtotals
- Per-owner settlement summary for the month
- Payment channel split
- Variance log (cash reconciliation summary)
- Negotiable cards sold below/above listed price — "haggling performance"
- Export: CSV, PDF

### 7.3 Per-event settlement

Scope: one event, generated on event close.

- Per owner: cards sold, gross IDR, voids/refunds IDR, net IDR
- Exportable as CSV for WhatsApp distribution
- Once admin marks "settled," settlement view is locked and timestamped. Underlying data stays append-only regardless.

### 7.4 Inventory-value report

- Sum of unsold cards by owner at cost/listed price
- Helps owners understand remaining exposure after each event

---

## 8. Card Short ID + QR Encoding

### 8.1 Format

`O-XXXXX`

- `O` = base-36 char mapping to owner (10 owners → `0-9` and `A`)
- `-` = visual separator
- `XXXXX` = 5-char base-36 random ID

Total: 7 chars (6 payload). Uppercase only. Fits QR Version 1 with error correction H in alphanumeric mode — produces a tiny, fast-to-scan code ideal for small stickers.

### 8.2 Collision handling

On stock-receive, generate random 5-char, check local uniqueness, retry on collision (budget 5 attempts). Server validates global uniqueness on sync — collision → server rejects, client regenerates + reprints label.

### 8.3 Label contents (50×25mm)

- QR code (top-left, ~22mm square)
- Short ID text below QR
- Card title truncated to 24 chars
- Set + number micro-text
- Owner initial
- Condition badge

Printing: client-rendered PDF + browser print dialog (`window.print()`). No direct printer driver integration in v1. Works with any thermal or inkjet printer that handles 50×25mm label stock.

---

## 9. UX Principles and Flows

### 9.1 Masking

- Masked numbers everywhere by default: totals, per-card prices, owner balances, bottom prices
- Eye-icon tap to reveal; long-press reveal-for-N-seconds on touch
- Bottom price on checkout screen: tap-and-hold 5s, auto-hides

### 9.2 Checkout flow — negotiable card

1. Scan card → review screen shows listed price (bottom hidden)
2. Cashier enters final agreed price
3. System computes discount % from `(listed − final) / listed`, displays
4. Validates `final ≥ bottom`:
   - Below bottom: input blocked with inline error "Di bawah harga minimum." Admin override UI appears with required reason note.
5. Line added to cart → card status displays "Di keranjang [self]" on all devices

### 9.3 Checkout flow — fixed card

1. Scan card → review screen shows listed price
2. Cashier can accept as-is OR enter line-level discount (percentage or final price)
3. If discount entered: reason note required (always, even below max)
4. If discount > `max_line_discount_pct_fixed`: admin override UI with forced reason note
5. Line added to cart

### 9.4 Payment finalization

1. Cashier taps "Bayar" on cart
2. Select payment channel (Cash / BCA / GoPay / etc.)
3. For cash: quick-tender buttons (50k, 100k, 200k, 500k, 1jt) or manual entry → auto-calculates change
4. For non-cash: optional reference note (e.g. "BCA ref 123456")
5. Confirm → transaction recorded, cart marked `paid`, locks released, receipt option shown

### 9.5 Cart lock visibility

When scanning any card, the result screen shows one of:

- **Tersedia (Available)** — green, proceed to add to cart
- **Di keranjang [Name]** — yellow, with cart age shown (e.g., "3 min ago"). Cashier cannot add to own cart. Can contact the named cashier to resolve.
- **Ditahan untuk [Customer label]** — orange, card is held (F18). Holder's name shown; expiry countdown.
- **Terjual** — gray, already sold. Scan history accessible.

### 9.6 Cart abandonment

- **Manual:** cashier taps "Bersihkan keranjang" → cart moves to `abandoned`, locks release
- **Auto:** no activity for `cart_idle_ttl_minutes` (default 30) → server sweeper marks abandoned
- **Admin force:** admin can force-abandon any cashier's cart (for stuck/stale locks)

### 9.7 General UX

- **Scan-first:** default checkout screen is camera viewfinder; USB scanner feeds same field
- **One-handed:** primary actions thumb-reachable on mobile portrait
- **No modal chains:** scan → review → pay → done. Three taps on happy path
- **Destructive confirmations:** void, refund, admin-override all red + reason-required
- **Indonesian-first copy:** all cashier-facing UI in Bahasa Indonesia; admin/reports bilingual

### 9.8 Page map

1. **Login** — email + password
2. **Dashboard** — current event, today's masked totals, quick-scan button, quick "New Sale"
3. **POS / Checkout** — scan viewfinder + cart (primary screen, open all day)
4. **Inventory** — tabbed list + search + filters (owner, price type, condition, bottom-price range), print-label action
5. **Stock Receive** — new card form with camera photo
6. **Events** — list, create, close, settle
7. **Reports** — Daily, Monthly, Per-event settlement, Inventory value
8. **Admin** — users, payment channels, settings, override queue, oversold resolution, backup
9. **My Payout** — cashier-level read-only view of their own sold cards (if cashier is also owner)

---

## 10. Authentication and Audit

- Email + password, bcrypt
- Session cookies, 30-day rolling, HttpOnly + Secure, SameSite=Lax
- `audit_log` append-only, admin-only visibility
- Logged actions: login, card stock-receive, card edit, card price change, cart create/abandon, sale, void, refund, admin override, event create/close, settlement close, settings change, user create, backup download

---

## 11. Non-Functional Requirements

| Category      | Requirement |
|---------------|-------------|
| Offline       | 100% of read + write operational offline. Online required only for: initial pull on fresh install, sync, photo upload backfill. |
| Performance   | Scan-to-cart < 300ms (local). Full checkout < 2s (local). Any report < 2s for a single event. |
| Sync          | Background every 60s when online; opportunistic on every cashier action if network present. |
| Storage       | IndexedDB ~50MB typical. Full-res photos server-only; thumbnails client-side. |
| Backups       | Server SQLite snapshot every 6h during events, retained 90 days. Admin on-demand backup download (F36). |
| Security      | HTTPS only. Authenticated sessions. Single-tenant. |
| Responsive    | Works on phone, tablet, and laptop browsers. PWA-installable. |

---

## 12. Tech Stack and Repo Structure

```
kolektapos/
├── apps/
│   ├── web/                      # React + Tailwind + Vite + vite-plugin-pwa
│   └── api/                      # Fastify + SQLite (better-sqlite3)
├── packages/
│   ├── db/                       # Drizzle schema + migrations
│   ├── types/                    # Zod schemas + inferred TS types
│   ├── sync/                     # Sync protocol + conflict resolution
│   ├── ui/                       # Shared Tailwind + shadcn/ui components
│   └── qr/                       # Short ID gen + QR payload helpers
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

### 12.1 Libraries

| Concern                   | Choice |
|---------------------------|--------|
| DB (server)               | better-sqlite3 + drizzle-orm |
| DB (client)               | Dexie.js (IndexedDB) |
| Validation                | zod end-to-end |
| QR generation             | qrcode |
| QR scanning               | html5-qrcode (primary) or @zxing/library (fallback) |
| Label PDF                 | @react-pdf/renderer or pdf-lib |
| Excel import              | SheetJS (xlsx) |
| Auth                      | @fastify/session + @fastify/cookie + bcrypt |
| Client server-state       | TanStack Query (with IDB persistence) |
| Client UI-state           | Zustand |
| PWA / SW                  | vite-plugin-pwa (Workbox) |
| Background sync           | Workbox BackgroundSyncPlugin |
| Server cron               | node-cron (cart TTL sweeper, backup scheduler) |

### 12.2 Deployment

- Any VPS or PaaS (Railway, Render, Fly.io) — stateful single-node sufficient
- Custom domain (e.g. `pos.kolekta.id`)
- SQLite file on persistent disk, backed up per §11
- Environment config via `.env`: `DATABASE_PATH`, `JWT_SECRET`, `PHOTO_STORAGE_PATH`, `DOMAIN`
- Migration path to PostgreSQL reserved for future scale, not planned for v1

---

## 13. MVP vs v1 Cut

### Phase 1 — MVP (first shippable; target: first event)

**Features:** F1, F2, F3, F4, F5, F6, F7, F8, F10, F11, F13, F14, F15, F17, F18, F20, F28, F34, F35, F36

Cart locking (F34) and settings (F35) are MVP because they are foundational — adding them later requires migrations and UX reflow. Backup (F36) is MVP because losing an event's data is unrecoverable.

### Phase 2 — v1 (after first event shakedown)

**Features:** F12, F16, F19, F23, F26, F30

### Phase 3 — v1.5 and later

F22 (bundles), F33 (parallel events), buylist mode, store credit, low-stock alerts, booth fee model, event expense tracking, tax export.

### Dropped — indefinitely deferred

**F21 — End-of-day cash reconciliation.** Dropped: the marginal value over a manual count is low for an 11-person single-booth setup, and the feature adds a dedicated screen, route, and table with no other dependencies. If ever needed, requirements are fully specified in §5 (F21 row) and the `cash_reconciliations` schema is in §6. The DB table is retained in migrations as a no-op tombstone; the API endpoints have been removed. Re-enable by: restoring POST/GET `/cash-reconciliations` routes in `settlement.ts`, adding UI to the admin section.

---

## 14. Open Questions — All Resolved

| # | Question | Resolution |
|---|----------|------------|
| 1 | Deployment model | Local-first PWA + background sync |
| 2 | Booth fee | Deferred |
| 3 | Counterfeit liability | Out of scope (owner's problem) |
| 4 | Unsold cards at event end | Auto-return to owner |
| 5 | Hold duration | User-set per hold |
| 6 | Minimum discount threshold | None for negotiable (bottom price is floor); max for fixed & transaction level via settings |
| 7 | Cash drawer | Virtual only |
| 8 | Label printer | Browser PDF + print dialog (50×25mm target) |
| 9 | Event expenses | Deferred |
| 10 | Stock-receive-on-behalf | Allowed: anyone for any owner |
| 11 | Fixed-card discount | Allowed, reason always required, max via settings, admin override above max |
| 12 | Oversold scenario | Preempted via cart-locking entity (F34); residual offline-conflict surfaces in admin queue |

**No open questions remain. Ready for implementation planning.**

---

## 15. Out of Scope — Explicit

Customer shop, payment gateway processing, tax/invoicing, promo/marketing, SMS/WA notifications, accounting integrations, multi-currency, authenticity tracking, booth fees, event expenses, trade-ins, external price feeds.

---

## 16. Sync Architecture

### 16.1 Data classification

| Class                | Entities | Strategy |
|----------------------|----------|----------|
| Append-only events   | transactions, transaction_items, holds, audit_log, cash_reconciliations | Client generates `client_id` UUID. Server dedups by `client_id`. Never overwritten. |
| Mutable entities     | cards, events, users, payment_channels, carts, cart_items, settings | Versioned. Optimistic concurrency via `version`. Server wins on conflict, client re-surfaces local edit for resolution. |
| Derived denorm       | `cards.locked_by_cart_id`, `cards.locked_by_user_id`, `cards.locked_at` | Server-computed from cart_items + cart.status. Client-computed optimistically for snappy UX, reconciled on pull. |
| Static / admin       | schema, config | Pull-only. |

### 16.2 Sync protocol

Push/pull with server-authoritative cursor:

- **Push:** client sends batch of ops since last cursor (`create_card`, `update_card`, `create_cart`, `update_cart`, `add_cart_item`, `remove_cart_item`, `abandon_cart`, `pay_cart`, `create_transaction`, `create_hold`, etc.). Server applies, returns per-op result (accepted / rejected / conflict) and new cursor.
- **Pull:** client requests changes since cursor. Server returns ordered stream of entity changes. Client merges into IndexedDB.
- **Frequency:** every 60s when online + opportunistically after every cashier action with network present.

### 16.3 Conflict scenarios and resolution

| Scenario | Resolution |
|----------|------------|
| Two devices stock-receive a card with same `short_id` | Server accepts first-write, rejects second. Client regenerates + reprints. |
| Two devices edit same card metadata | Optimistic concurrency: higher-version write wins. Lower-version client pulls, re-surfaces pending edit. |
| Two devices both online, one locks card X in cart | No conflict: second device sees lock on next sync (within 60s); `add_cart_item` is rejected. |
| Two devices both offline, both add card X to separate carts, both sync | Server accepts first cart_item by `server_received_at`, rejects second. Second cashier sees "Kartu sudah di keranjang [Name] — item dihapus dari keranjang Anda." |
| Two devices both offline, both complete sale of card X, both sync | **R5 residual case.** Both sales accepted (append-only). Card flagged `oversold`. Admin queue surfaces it. Resolved via manual void + refund on one. |
| Hold placed offline on card sold offline elsewhere | Hold insert accepted but server tags `stale_hold` since sale has earlier logical timestamp; cashier sees "already sold" on next pull. |
| Cart TTL expired server-side while cashier still has device open offline | On sync, server has already abandoned the cart. Client receives abandon notice, gracefully discards local draft cart with UI notice "Keranjang kadaluarsa." Cashier can rebuild if physical cards still available. |

### 16.4 Clock handling

Do not trust client wall-clock for ordering. Every record carries `created_at` (client, display-only) and `server_received_at` (authoritative for conflict ordering). Cursor based on `server_received_at`.

### 16.5 Photo sync

Stock-receive photo compressed to JPEG max 1024px (~150KB), stored as IndexedDB blob under `pending_photos`. On sync: multipart POST to `/sync/photo/:card_client_id`. Server stores at `/storage/photos/` and returns canonical URL. Thumbnail (256px) stays in IDB; full-res server-only.

### 16.6 Initial install

Fresh install pulls: users, events (active + last 2 closed), payment_channels, settings, all cards where `status != retired`, all active draft carts, past 30 days of transactions. After that, offline is fully functional.

### 16.7 Cart TTL sweeper

Server cron every 5 min:

```sql
UPDATE carts
SET status='abandoned', abandoned_reason='idle_ttl',
    updated_at=NOW(), version=version+1
WHERE status='draft'
  AND last_activity_at < NOW() - INTERVAL cart_idle_ttl_minutes MINUTE;

-- Then: for each newly-abandoned cart, release card locks
UPDATE cards
SET locked_by_cart_id=NULL, locked_by_user_id=NULL, locked_at=NULL,
    updated_at=NOW(), version=version+1
WHERE locked_by_cart_id IN (<newly_abandoned_cart_ids>);
```

Broadcast changes via next sync pull to all clients.

---

## 17. Implementation Next Steps

1. **Schema + migrations** — generate Drizzle migrations for all tables in §6, including triggers enforcing append-only constraints on transactions tables.
2. **Monorepo bootstrap** — Turbo + pnpm workspace with `apps/web`, `apps/api`, and shared `packages/*`.
3. **API routes** — auth, users, events, cards (CRUD), carts (create/update/abandon/pay), transactions (insert-only), sync push/pull, backup download.
4. **PWA shell** — React + Tailwind + shadcn/ui, IndexedDB setup via Dexie, service worker via Workbox.
5. **POS happy-path spike** — login → scan → review → add to cart → pay → receipt. Wire cart locking end-to-end first; it touches every layer.
6. **Reports** — daily first, monthly and per-event settlement after.
7. **Admin tooling** — override approval, oversold queue, cash reconciliation, settings editor, backup.
8. **First event dry-run** — internal test with real cards before Jakarta Comic Con or similar convention.

---

*End of consolidated PRD v1.0. Status: ready for implementation planning — schema generation, epic breakdown, or wireframes next.*
