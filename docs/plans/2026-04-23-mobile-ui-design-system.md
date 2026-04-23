# Mobile UI Design System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Apply the Revota POS design system to KolektaPOS mobile pages using Tailwind CSS tokens — pure visual redesign, no new features.

**Architecture:** Extend `tailwind.config.ts` with semantic color tokens + font families matching the reference palette. Add two shared components (`MobileAppBar`, `SyncDot`) that replace the existing `<header>` boilerplate across all pages. Restyle each page's Tailwind classes to use the new tokens.

**Tech Stack:** React + TypeScript + Tailwind CSS v3, Vite, Google Fonts (IBM Plex Sans + Mono)

---

### Task 1: Design Tokens + Fonts

**Files:**
- Modify: `apps/web/tailwind.config.ts`
- Modify: `apps/web/src/index.css`

Extend Tailwind theme with semantic colors and font families. Import fonts via CSS.

**Commit:** `🎨 design tokens: add primary/accent/surface palette + IBM Plex fonts`

---

### Task 2: Shared Components

**Files:**
- Create: `apps/web/src/components/MobileAppBar.tsx`
- Create: `apps/web/src/components/SyncDot.tsx`

`MobileAppBar` — h-14, `bg-card border-b border-border`, title + optional back button + right slot + SyncDot.
`SyncDot` — pill badge showing online/syncing/offline state with colour-coded dot.

**Commit:** `🧩 components: add MobileAppBar + SyncDot`

---

### Task 3: LoginPage

**Files:**
- Modify: `apps/web/src/pages/LoginPage.tsx`

Navy top section, card panel with rounded-2xl, primary-coloured submit button.

**Commit:** `🔐 LoginPage: apply design system`

---

### Task 4: DashboardPage

**Files:**
- Modify: `apps/web/src/pages/DashboardPage.tsx`

Replace blue header with MobileAppBar. Stat cards with `bg-card border border-border rounded-2xl`. Quick-action grid with primary/accent buttons.

**Commit:** `🏠 DashboardPage: apply design system`

---

### Task 5: POSPage

**Files:**
- Modify: `apps/web/src/pages/POSPage.tsx`

Replace header with MobileAppBar. Scan input with accent border. Card review panel, cart panel, PaymentModal, ReceiptModal — all with design tokens.

**Commit:** `💳 POSPage: apply design system`

---

### Task 6: InventoryPage

**Files:**
- Modify: `apps/web/src/pages/InventoryPage.tsx`

MobileAppBar, filter chips with primary active state, card list items, CardDetail bottom sheet.

**Commit:** `📦 InventoryPage: apply design system`

---

### Task 7: IntakePage

**Files:**
- Modify: `apps/web/src/pages/IntakePage.tsx`

MobileAppBar, form section cards, inputs, radio/checkbox controls, submit button.

**Commit:** `➕ IntakePage: apply design system`

---

### Task 8: ReportsPage

**Files:**
- Modify: `apps/web/src/pages/ReportsPage.tsx`

MobileAppBar, tab bar with primary active underline, report summary cards, stat grid.

**Commit:** `📊 ReportsPage: apply design system`

---

### Task 9: Admin pages

**Files:**
- Modify: `apps/web/src/pages/AdminPage.tsx`
- Modify: `apps/web/src/pages/UsersAdminPage.tsx`
- Modify: `apps/web/src/pages/EventsAdminPage.tsx`
- Modify: `apps/web/src/pages/OversoldQueuePage.tsx`
- Modify: `apps/web/src/pages/CashReconciliationPage.tsx`
- Modify: `apps/web/src/pages/BulkImportPage.tsx`

MobileAppBar + design tokens throughout.

**Commit:** `⚙️ admin pages: apply design system`

---

### Task 10: Push

```bash
git push
```
