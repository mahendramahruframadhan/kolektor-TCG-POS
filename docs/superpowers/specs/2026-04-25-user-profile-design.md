# User Profile Page — Design Spec

**Date:** 2026-04-25
**Status:** Approved

---

## Overview

A dedicated profile page for the logged-in user, accessible from the bottom of the hamburger menu. Contains three tabs: a personal mini-dashboard (Ringkasan), a change-password form (Keamanan), and a placeholder for future per-user settings (Konfigurasi).

---

## Entry Point

**File:** `apps/web/src/components/HamburgerMenu.tsx`

The user footer section at the bottom of the menu (currently lines 115–135) is split into two interactive areas:

- **Avatar + nama + role** → wrapped in `<Link to="/profile">` that closes the menu on click.
- **Tombol Logout** → remains as an independent `<button>`, unchanged.

The standalone "Ubah Password" link in the nav section (currently lines 96–103) is **removed**, since password change moves inside the profile page.

---

## Route

```
/profile  →  ProfilePage  (RequireAuth)
```

Added to `apps/web/src/App.tsx` alongside existing protected routes.

**Route `/change-password`** and its page component `ChangePasswordPage.tsx` are **deleted**. No redirects needed — the only entry point was the hamburger menu link being removed.

---

## ProfilePage Structure

**File:** `apps/web/src/pages/ProfilePage.tsx`

```
<div className="min-h-screen bg-surface bg-dotted-overlay flex flex-col">
  <MobileAppBar title="Profil Saya" back onBack={() => navigate(-1)} />

  <!-- Tab bar: three buttons (Ringkasan | Keamanan | Konfigurasi) -->
  <div className="flex border-b border-border bg-card shrink-0">
    <TabButton active={tab==="ringkasan"} onClick={() => setTab("ringkasan")}>Ringkasan</TabButton>
    <TabButton active={tab==="keamanan"} onClick={() => setTab("keamanan")}>Keamanan</TabButton>
    <TabButton active={tab==="konfigurasi"} onClick={() => setTab("konfigurasi")}>Konfigurasi</TabButton>
  </div>

  <main id="main-content" className="flex-1 overflow-y-auto max-w-xl mx-auto w-full p-4 space-y-4">
    {tab === "ringkasan" && <ProfileSummaryTab />}
    {tab === "keamanan" && <ProfileSecurityTab />}
    {tab === "konfigurasi" && <ProfileConfigTab />}
  </main>
</div>
```

Tab state is local (`useState`), defaulting to `"ringkasan"`.

---

## Tab 1 — Ringkasan

### Header

Avatar inisial (same style as HamburgerMenu + DashboardPage), nama lengkap, email, role badge.

### Section: Inventaris Kartu

**Query:** `idb.cards.where('ownerUserId').equals(userId).toArray()`

Displayed as a `bg-card` rounded card with `StatRow` rows (same component pattern as DashboardPage):

| Label | Value |
|---|---|
| Total Kartu | N |
| Tersedia | N |
| Terjual | N |
| Dipegang | N |
| Dikembalikan | N |

Status mapping from `IdbCard.status`: `available`, `sold`, `held`, `returned`.

### Section: Penjualan Saya

**Query:** `idb.transactionItems.where('ownerUserIdSnapshot').equals(userId).toArray()`

Then join to `idb.transactions` (keyed by `transactionId`) to get `kind` and `createdAt`. Only count items where the parent transaction `kind === 'sale'` (exclude void/refund transactions entirely — the UI shows gross sold counts and amounts, not net). No masking applied.

Three sub-rows, each showing kartu count + total Rp:

| Period | Scope |
|---|---|
| Hari Ini | `createdAt` date === today (locale `id-ID`) |
| Bulan Ini | same year + month |
| Sepanjang Waktu | all |

Format: `"X kartu · Rp Y"` on one line, or split into two `StatRow` sub-lines — implementer's choice for legibility.

### Section: Per Event

**Query:** group the above transaction items by `eventId` of the parent transaction, then join to `idb.events` for event name.

Displayed as a table / list of rows sorted by event `startDate` descending:

| Kolom | Sumber |
|---|---|
| Nama Event | `IdbEvent.name` |
| Jumlah Kartu | count of items in that event |
| Total Penjualan | sum of `soldPriceIdr` |

Events with zero items for this user are omitted. If no events at all, show empty-state text: "Belum ada data penjualan per event."

---

## Tab 2 — Keamanan

Content is the change-password form extracted from `ChangePasswordPage`, rendered inline without a page shell. All logic (state, validation, API call) is self-contained in a `ProfileSecurityTab` component.

Form fields identical to current `ChangePasswordPage`:
- Password Saat Ini
- Password Baru (min 8 char)
- Konfirmasi Password Baru

Success banner + error banner pattern unchanged.

---

## Tab 3 — Konfigurasi

Single `bg-card` rounded card with centered placeholder text:

> "Belum ada konfigurasi pengguna saat ini."

No interactive elements.

---

## Data Sources

All data read from IndexedDB (offline-first). No new API endpoints required.

| Data | IDB table | Filter |
|---|---|---|
| User identity | `useAuthStore` | current session |
| Inventory counts | `idb.cards` | `ownerUserId === userId` |
| Sales items | `idb.transactionItems` | `ownerUserIdSnapshot === userId` |
| Transaction metadata | `idb.transactions` | keyed by id, for `kind` + `createdAt` |
| Event names | `idb.events` | keyed by id |

---

## Files Changed

| Action | File |
|---|---|
| Modified | `apps/web/src/components/HamburgerMenu.tsx` |
| Modified | `apps/web/src/App.tsx` |
| Added | `apps/web/src/pages/ProfilePage.tsx` |
| Deleted | `apps/web/src/pages/ChangePasswordPage.tsx` |
