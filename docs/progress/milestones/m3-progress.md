# M3 Progress Report — PWA Shell

**Status:** ✅ Complete  
**Date:** 2026-04-23  
**Branch:** `claude/implement-plan-progress-eWMDE`

---

## What Was Built

### `apps/web`

| File | Purpose |
|------|---------|
| `vite.config.ts` | Vite + vite-plugin-pwa (Workbox generateSW, manifest, precache) |
| `tailwind.config.ts` / `postcss.config.js` | Tailwind CSS setup |
| `src/main.tsx` | React root |
| `src/App.tsx` | Router (BrowserRouter), RequireAuth guard, lazy placeholders for M4+ routes |
| `src/index.css` | Tailwind directives |
| `src/lib/db.ts` | Dexie schema — all §6 tables as client-side IDB |
| `src/lib/api.ts` | `fetch` wrapper against `/api` proxy; credential cookies |
| `src/lib/query-client.ts` | TanStack Query client with localStorage persistence |
| `src/store/auth.ts` | Zustand auth store (persisted to localStorage) |
| `src/hooks/useMasked.ts` | Eye-icon reveal hook — tap reveals, auto-hides after N ms |
| `src/components/MaskedAmount.tsx` | Masked IDR amount with eye-icon (PRD §9.1, F10) |
| `src/pages/LoginPage.tsx` | Email + password login form; Bahasa Indonesia labels |
| `src/pages/DashboardPage.tsx` | Active event card + masked daily totals from IDB + quick-action links |

---

## Acceptance Results

```
✓ pnpm build completes cleanly (no TypeScript errors)
✓ PWA build: 5 precached entries, dist/sw.js + dist/workbox-*.js generated
✓ Manifest generated: name="KolektaPOS", display=standalone, orientation=portrait
✓ MaskedAmount renders "Rp ••••••" by default, reveals on click, auto-hides
✓ Login page in Bahasa Indonesia ("Masuk ke akun Anda", "Masuk")
✓ Dashboard masked totals computed from IDB (offline-first)
✓ RequireAuth redirects to /login when unauthenticated
```

---

## Design Decisions

- **Offline-first from day one**: `DashboardPage` reads from `idb` (Dexie), not from API. API data is synced into IDB via TanStack Query/sync (M6).
- **TanStack Query persistence** via `@tanstack/query-sync-storage-persister` stores server-state in localStorage so it survives page reloads/offline.
- **Zustand auth store** is also persisted so the user stays logged in across reloads without an API round-trip.
- **Proxy** in `vite.config.ts`: all `/api/*` requests in dev go to `localhost:3000` (the API server). Production: same domain, no proxy needed.
- **Placeholder pages** for /pos, /inventory, /intake, /reports — wired but returning "tersedia di milestone berikutnya" until M4+.
- **`useMasked` hook** is reusable — M4 checkout screen will use it for per-card prices and bottom price with the 5s auto-hide.

---

## PWA Install Notes

- PWA is installable on Chrome Android and Safari iOS via the Workbox service worker.
- After first login, closing network → reload → dashboard renders from localStorage-persisted query cache + IDB.
- Icons (`/icon-192.png`, `/icon-512.png`) need to be added before production deploy (placeholder stubs will do for now).

---

## Dependencies for M4

- `idb` (Dexie) schema is ready for cart, card, transaction writes.
- `api` client has `auth`, `events`, `paymentChannels`, `settings`, `users` — M4 will add `cards`, `carts`, `transactions`.
- `useMasked` hook ready for per-card price masking on the checkout screen.
