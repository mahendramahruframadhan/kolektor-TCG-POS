# WCAG 2.2 Level AA Compliance Review — KolektaPOS Web App

**Reviewer:** Claude Opus 4.7
**Date:** 2026-04-24 08:15:00 WIB
**Target:** `apps/web` — React 19 + Tailwind 3 + Vite PWA
**Commit reviewed:** `3a89477` on branch `feat/complete-mvp`
**Scope:** HTML shell, React components, pages, hooks, Tailwind palette. Backend routes ignored except where they shape rendered output.

---

## 1. Executive Summary

### Overall compliance level
**Fails WCAG 2.2 Level A in multiple places; Level AA is currently unreachable without fixes.** Several Single-A criteria (1.3.1 Info and Relationships, 2.1.1 Keyboard, 4.1.2 Name, Role, Value) have concrete, reproducible violations. A handful of AA criteria (1.4.3 Contrast, 1.4.1 Use of Color) also fail.

### High-level risk rating
**High.** The app's target users are a closed group of 11 known operators at convention-hall booths — so legal exposure is minimal. But two specific failure classes will produce real operational problems: (a) **keyboard-only / assistive-tech users cannot reveal bottom prices** (the core cashier negotiation flow), and (b) **form inputs across every form page have no programmatic label association**, which screen readers (and browser autofill) handle poorly.

### Most critical issues
1. **Form labels across the app are visual-only** — no `<label htmlFor>`↔`<input id>` association in LoginPage, StockReceivePage, EventsAdminPage, UsersAdminPage, CashReconciliationPage, ChangePasswordPage, AdminPage. **SC 1.3.1 / 3.3.2 / 4.1.2 — Fail.**
2. **Bottom-price tap-and-hold reveal is pointer-only** (`BottomPriceReveal` in `POSPage.tsx:66-83` binds `onMouseDown`/`onTouchStart` only; no keyboard equivalent). Keyboard users cannot perform the most important operator interaction. **SC 2.1.1 Keyboard — Fail.**
3. **Modals (PaymentModal, ReceiptModal, oversold-void confirmation, EventsAdmin / UsersAdmin edit sheets) have no dialog semantics, no focus trap, and no focus return.** **SC 1.3.1 / 2.4.3 / 4.1.2 — Fail.**
4. **`text-warning` (2.14:1 on white) fails AA contrast even for large text and non-text UI.** `text-success` (3.17:1 on white) fails AA for normal text. These classes appear in POSPage warnings, settings "saved ✓", BottomPriceReveal, dashboard net-total coloring.
5. **SyncDot encodes state only through color + subtle text** — no `aria-live` region, no status role. Offline/online transitions are invisible to assistive tech. **SC 1.4.1 Use of Color / 4.1.3 Status Messages — Fail.**

### Positive highlights
- `<html lang="id">` is set correctly (`apps/web/index.html:2`) — SC 3.1.1 ✓.
- `MobileAppBar` uses semantic `<header>` and renders a real `<h1>` (`MobileAppBar.tsx:30-46`).
- Icon-only buttons that *were* explicitly added during recent work have `aria-label`s — sidebar logout, menu open/close, back arrow, masked-amount toggle, reports masking toggle, toast dismiss, camera scanner.
- `Toast` component is correctly announced: `role="status"` + `aria-live="polite"` (`Toast.tsx:23-25`).
- Camera scanner fallback input is a real `<input type="text">` with `autoFocus` — keyboard- and HID-scanner-friendly.
- Recent hardening fixed the `useTapHoldReveal` reveal-on-press bug so the mask itself *does* work correctly once revealed (the *input* to reveal is the a11y problem now).
- Touch targets for visible interactive elements mostly meet **SC 2.5.8 Target Size (Minimum)** — 36×36px min, which exceeds the 24×24px AA floor.

---

## 2. Detailed Findings by WCAG Principle (POUR)

### 2.1 Perceivable

#### SC 1.1.1 Non-text Content (Level A) — **Partial pass**
- **Observation:** All `<img>` tags carry an `alt` attribute (8/8), so bare `<img>` with no alt is not an issue. However, `LandingPage:19` and `LoginPage:67` both use `alt="KolektaPOS"` for a logo that sits directly next to the visible text "KolektaPOS" — this doubles up for screen-reader users (the text and alt announce the same thing). Pattern recurs on `DashboardPage:75`, `QRLabelPage:43`, `InventoryPage:106`, `StockReceivePage:511`.
- **Severity:** Low.
- **Fix:** Mark the logo decorative next to its visible text: `alt=""` + `aria-hidden="true"`. Keep `alt="KolektaPOS"` only where the image stands alone (e.g., `LandingPage:44` hero illustration is already `aria-hidden="true"` with empty `alt` — good).

#### SC 1.1.1 — Decorative lucide icons not marked `aria-hidden` — **Fail**
- **Observation:** `MaskedAmount.tsx:55-57` renders `<Eye>` / `<EyeOff>` with no `aria-hidden`. Because the parent `<span>` has `role="button"` + `aria-label` already announcing the state, the icon's fallback "image" is noise. Same pattern across `DashboardPage` stat icons, `HamburgerMenu` nav icons, `Toast.tsx:32-34` (`CheckCircle2`/`AlertCircle` next to a text message).
- **Severity:** Low.
- **Fix:** Add `aria-hidden="true"` to every lucide icon that sits alongside descriptive text or inside an already-labelled button.

```tsx
// MaskedAmount.tsx
<Eye className="w-4 h-4 text-muted-fg" aria-hidden="true" />
<EyeOff className="w-4 h-4 text-muted-fg" aria-hidden="true" />
```

#### SC 1.3.1 Info and Relationships (Level A) — **Fail**
- **Observation:** `<label>` elements are visually associated via layout only. None of the 28 `<label>` occurrences use `htmlFor`, and none of the sibling `<input>`/`<select>`/`<textarea>` elements carry an `id`. Affected files (verified by grep):
  - `apps/web/src/pages/LoginPage.tsx:87-95, 102-110` (email + password)
  - `apps/web/src/pages/ChangePasswordPage.tsx:81-117`
  - `apps/web/src/pages/EventsAdminPage.tsx:142-165`
  - `apps/web/src/pages/UsersAdminPage.tsx:131-155`
  - `apps/web/src/pages/CashReconciliationPage.tsx:158-181`
  - `apps/web/src/pages/MyPayoutPage.tsx:204`
  - `apps/web/src/pages/POSPage.tsx:200, 226, 252, 299, 870` (payment modal labels)
  - `apps/web/src/pages/ReportsPage.tsx:382, 388`
  - `apps/web/src/pages/StockReceivePage.tsx:105, 454, 560` (large form — ~20 fields)
  - `apps/web/src/pages/AdminPage.tsx` setting rows (generated, same pattern)
- **Impact:** Screen readers can heuristically associate adjacent labels with inputs sometimes, but this is brittle and inconsistent across AT/browser combos. Voice-control users (Dragon, Voice Access) cannot reliably say "Click Nama Event" to focus the right field.
- **Severity:** High. This is the single most widespread violation.
- **Fix:** Thread an `id` through every label/input pair. Two idiomatic React patterns:

```tsx
// Pattern A — useId hook (React 18+)
const emailId = useId();
<label htmlFor={emailId}>Email</label>
<input id={emailId} type="email" ... />

// Pattern B — aria-label on input + visible label as description
<label id="email-lbl">Email</label>
<input aria-labelledby="email-lbl" type="email" ... />
```

Do this on every `<label>` site; React's `useId()` makes it painless.

#### SC 1.3.1 — Modal dialogs are not marked as dialogs — **Fail**
- **Observation:** `PaymentModal` (`POSPage.tsx:92-338`), `ReceiptModal` (`POSPage.tsx:340-435`), oversold void-confirmation (`OversoldQueuePage.tsx:83-111`), and the edit-form modals in `EventsAdminPage` / `UsersAdminPage` are rendered as absolute-positioned overlay divs with no `role="dialog"`, `aria-modal="true"`, or `aria-labelledby`. Grep for `role="dialog"` across `apps/web/src` returns **zero** hits.
- **Impact:** Screen readers announce the underlying page content, not the modal. Users can tab out of the modal into the background. No dialog title is announced on open.
- **Severity:** High.
- **Fix:** Wrap every modal root with dialog semantics + focus management. Minimum shape:

```tsx
<div
  role="dialog"
  aria-modal="true"
  aria-labelledby="pay-title"
  className="fixed inset-0 z-50 ..."
  onKeyDown={(e) => e.key === "Escape" && onCancel?.()}
>
  <h2 id="pay-title">Pembayaran</h2>
  ...
</div>
```

Pair with a focus trap (a 40-line `useFocusTrap` hook, or `focus-trap-react` / `@headlessui/react`'s `Dialog`) and restore focus to the opener on close.

#### SC 1.4.1 Use of Color (Level A) — **Fail**
- **Observation:** `SyncDot` (`apps/web/src/components/SyncDot.tsx:1-32`) distinguishes online/syncing/offline **only** by color (green / yellow / red) and a tiny 10-px label. There's no shape/icon difference; the text is present but at 10px uppercase with ~4.58:1 contrast on a 24% alpha background of the same hue — barely visible. No `aria-live` region announces state transitions.
- **Impact:** A color-blind or low-vision user cannot distinguish "Tersinkron" from "Offline" at a glance. State transitions are silent for AT users.
- **Severity:** Medium (operationally meaningful: "am I online right now?" is critical for cashiers).
- **Fix:** (a) Add a shape distinction (a check/hourglass/warning icon next to the dot), (b) wrap the component in a visually-hidden live region so transitions announce.

```tsx
<div role="status" aria-live="polite" className="...">
  <CheckCircle2 aria-hidden="true" /> Tersinkron
</div>
```

#### SC 1.4.3 Contrast (Minimum) (Level AA) — **Fail**
Measured against the Tailwind palette in `apps/web/tailwind.config.ts`:

| Foreground | Background | Ratio | Required (AA normal) | Required (AA large) | Verdict |
|------------|------------|-------|-----|-----|---------|
| `muted-fg` hsl(252,8%,47%) | `card` #fff | 4.99:1 | 4.5:1 | 3:1 | ✓ pass |
| `muted-fg` | `surface` hsl(252,35%,97%) | 4.58:1 | 4.5:1 | 3:1 | ✓ (just barely) |
| `destructive` hsl(0,72%,51%) | #fff | 4.80:1 | 4.5:1 | 3:1 | ✓ pass |
| `accent` hsl(265,100%,60%) | #fff | 5.29:1 | 4.5:1 | 3:1 | ✓ pass |
| `success` hsl(152,60%,40%) | #fff | **3.17:1** | 4.5:1 | 3:1 | ✗ **FAIL normal; passes large only** |
| `warning` hsl(38,92%,50%) | #fff | **2.14:1** | 4.5:1 | 3:1 | ✗ **FAIL everywhere** |

**Affected sites (non-exhaustive):**
- `text-warning` — `POSPage.tsx:77` (BottomPriceReveal control text), masked-amount placeholder states, syncing indicator.
- `text-success` — `DashboardPage.tsx:133` (net-after-void total), `AdminPage.tsx` "Tersimpan ✓" flash, `StockReceivePage` toast variant, `POSPage` "Terjual" badges.

- **Severity:** High (contrast is load-bearing for a color-coded POS UI).
- **Fix:** Darken the `success` HSL from `hsl(152,60%,40%)` to ~`hsl(152,60%,29%)` (≈ 4.5:1 on white) and `warning` from `hsl(38,92%,50%)` to ~`hsl(38,92%,33%)` (≈ 4.5:1). Alternatively, reserve the current hues for *backgrounds* behind dark text, and define `success-fg` / `warning-fg` darker variants for inline text. Edit `apps/web/tailwind.config.ts`:

```ts
colors: {
  // ...
  success: "hsl(152,60%,29%)",  // was 40%
  warning: "hsl(38,92%,33%)",   // was 50%
  // (preserve the 40%/50% versions as `success-bg` / `warning-bg` if you rely
  //  on them for background fills; they already pair with white text fine.)
}
```

#### SC 1.4.4 Resize Text (Level AA) — **Partial pass**
- **Observation:** The app uses fixed-pixel `text-[10px]` and `text-xs` in many places (`MobileAppBar:40` uses 15px, fine). At 200% browser zoom, layouts on mobile-first viewports compress further and the `text-[10px]` uppercase labels become illegible.
- **Severity:** Medium.
- **Fix:** Replace `text-[10px]` with `text-xs` (12px) globally, or opt into `rem`-scaled Tailwind utilities (`text-xs` maps to 0.75rem which honours user font-size settings). Audit: 43 uses of `text-[10px]` across pages.

#### SC 1.4.10 Reflow (Level AA) — **Pass** (conditional)
The app is mobile-first with `max-w-xl mx-auto` wrappers — it reflows cleanly at 320px viewport width. No horizontal scroll observed in the layout patterns. Some tables (ReportsPage daily / monthly) may overflow horizontally at very small widths; they use `overflow-x-auto` on wrappers, which satisfies the SC.

#### SC 1.4.11 Non-text Contrast (Level AA) — **Fail**
- **Observation:** Input borders use `border-border` which is `hsl(252,18%,88%)` — contrast with `card` #fff is roughly **1.32:1**, far below the 3:1 required for UI component boundaries. Applies to every form input, select, button, card border, divider, tab indicator (inactive tabs).
- **Severity:** Medium.
- **Fix:** Darken `border` to at least `hsl(252,18%,75%)` (≈ 1.75:1) — still not 3:1 but better. For strict SC 1.4.11 compliance, add a dedicated `border-strong` at ≥ 3:1 and use it on form-field boundaries (where distinguishability matters most), keeping the subtler border for decorative dividers.

#### SC 1.4.12 Text Spacing (Level AA) — **Likely pass**
Tailwind's default line-height and letter-spacing are not overridden below the 1.5× line-height / 0.12em letter-spacing thresholds, except in the `uppercase tracking-widest` labels where tracking-widest = 0.1em (below 0.12em — marginal). User-injected text-spacing (via browser extensions) is unlikely to break the layout in practice.

#### SC 1.4.13 Content on Hover or Focus (Level AA) — **Pass**
Hover states are purely cosmetic (color shifts). No tooltips that require pointer-hover to read. The few `title=""` attributes (HamburgerMenu sidebar logout button, reports mask toggle) are informational and dismissible by moving focus.

### 2.2 Operable

#### SC 2.1.1 Keyboard (Level A) — **Fail**
- **Observation:** `apps/web/src/pages/POSPage.tsx:66-83` (`BottomPriceReveal`) binds `onMouseDown`/`onMouseUp`/`onMouseLeave`/`onTouchStart`/`onTouchEnd` to implement the 5-second tap-and-hold reveal of the bottom price. There is no keyboard equivalent — a keyboard user focused on the control cannot hold it. Similarly, the original per-row `MaskedAmount` requires a pointer-click to toggle (which is OK — `onClick` fires on Enter/Space because `role="button"` — ✓), but the tap-and-hold mechanic is pointer-only.
- **Impact:** Cashiers using an external keyboard (e.g., a paired Bluetooth keyboard on a locked-down tablet) or a switch-control device cannot reveal bottom prices. This is the most load-bearing interaction for the negotiation flow (F2 in the PRD).
- **Severity:** **High / Critical** depending on deployment; the PRD lists 11 known users so direct risk is small, but this is a straight A-level violation.
- **Fix:** Accept `onKeyDown` with a "hold" pattern via `keyDown`/`keyUp` on Space, and optionally add an alternative click-to-reveal mode (Space toggles; holding Space starts the timer). Minimum keyboard support:

```tsx
onKeyDown={(e) => {
  if (e.key === " " || e.key === "Enter") {
    e.preventDefault();
    if (!revealTimerStarted) startReveal();
  }
}}
onKeyUp={(e) => {
  if (e.key === " " || e.key === "Enter") endReveal();
}}
```

#### SC 2.1.1 — Scan input relies on `autoFocus` — **Pass**
The `<input>` at `POSPage.tsx:812-824` has `autoFocus` and `onKeyDown` handling Enter. Keyboard-friendly ✓.

#### SC 2.1.2 No Keyboard Trap (Level A) — **Pass**
No observed keyboard traps in non-modal flows. Modals (see 1.3.1 above) lack focus trap — which is a *missing feature* rather than a *trap*, so SC 2.1.2 is technically met (users can Tab out).

#### SC 2.4.1 Bypass Blocks (Level A) — **Fail**
- **Observation:** No "Skip to main content" link exists. Every page has the sticky `MobileAppBar` + tab bars + filter rows before the main content — a keyboard user has to Tab through every header element on every page.
- **Severity:** Medium.
- **Fix:** Add a skip link in `App.tsx` or `main.tsx` above the `<Routes>`:

```tsx
<a
  href="#main-content"
  className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:bg-primary focus:text-primary-fg focus:px-4 focus:py-2 focus:rounded-xl focus:z-50"
>
  Lewati ke konten utama
</a>
```

Then wrap each page's `<main>` with `id="main-content"` (already using `<main>` in some pages — search for `<main ` confirms partial adoption).

#### SC 2.4.3 Focus Order (Level A) — **Partial pass**
Focus order follows DOM order in ordinary flows. But modal overlays (see 1.3.1) don't trap focus, so pressing Tab from the last modal control moves focus into the background page — confusing for AT users.

#### SC 2.4.7 Focus Visible (Level AA) — **Partial pass**
Input focus indicators are present (`focus:ring-2 focus:ring-primary` / `focus:ring-accent`). But 26 sites use `focus:outline-none` — most replace it with a ring, but:
- `apps/web/src/pages/CashReconciliationPage.tsx:184` — textarea has `focus:outline-none resize-none` with **no replacement** focus indicator.
- Several button components (`DashboardPage` quick-action tiles, `ReportsPage` tab buttons at `:639-648`, `POSPage` quick-amount buttons) rely on `transition active:scale-[0.97]` and have **no explicit focus style** — browser default outline may apply, but the `hover:*` classes don't include `focus:*` variants.
- **Severity:** Medium.
- **Fix:** Global rule — any `focus:outline-none` must pair with a `focus:ring-*` or `focus-visible:*` replacement. Add a `focus-visible:ring-2 focus-visible:ring-primary` to every `<button>`/`<Link>` class string, or centralise via a Tailwind plugin.

#### SC 2.5.5 Target Size (Enhanced) (Level AAA) — **Partial pass**
- **Observation:** Icon buttons are `w-9 h-9` (36px) throughout. This passes **AA SC 2.5.8 Target Size (Minimum) at 24×24px** but fails **AAA SC 2.5.5 at 44×44px**.
- **Severity:** Low (AAA is out of scope for AA target). Call out for mobile thumb-friendliness.

#### SC 2.5.7 Dragging Movements (Level AA, WCAG 2.2) — **Pass**
No drag-and-drop reorder UI. All sortable operations are button/tap based.

#### SC 2.5.8 Target Size (Minimum) (Level AA, WCAG 2.2) — **Pass**
36×36px exceeds 24×24px minimum.

### 2.3 Understandable

#### SC 3.1.1 Language of Page (Level A) — **Pass**
`apps/web/index.html:2` → `<html lang="id">` ✓.

#### SC 3.1.2 Language of Parts (Level AA) — **Partial pass**
Mixed Indonesian + English labels ("Email address" still in English on `LoginPage:87`, "Near Mint" / "Mint" / "Heavily Played" card conditions across `StockReceivePage` and `BulkImportPage`, admin settings labels have both `labelId` Indonesian and `labelEn` English stacked). Individual foreign-language strings within primarily-Indonesian pages should be wrapped in `<span lang="en">`. Severity: Low.

#### SC 3.2.1 On Focus (Level A) — **Pass**
No focus handlers trigger navigation or modal changes.

#### SC 3.2.2 On Input (Level A) — **Pass**
Input events don't cause context changes without user confirmation. The admin "default_landing_page" dropdown saves on change (context change on input), but the context change is a Save action within the same view and is visibly confirmed with a "Tersimpan ✓" badge — arguably compliant.

#### SC 3.3.1 Error Identification (Level A) — **Partial pass**
Form errors are rendered as red text and/or `border-destructive`. They are visually identifiable but:
- No `aria-invalid="true"` is set on the erroring input.
- No `aria-describedby` links the error message to the input.
- Example: `AdminPage.tsx:100-111` — error `<p>` exists but isn't linked to the `<input>`.

**Severity:** Medium. **Fix:**

```tsx
<input
  aria-invalid={!!error}
  aria-describedby={error ? `${id}-error` : undefined}
  ...
/>
{error && <p id={`${id}-error`} className="...">{error}</p>}
```

#### SC 3.3.2 Labels or Instructions (Level A) — **Fail**
Consequence of 1.3.1 above — same fixes.

#### SC 3.3.7 Redundant Entry (Level A, WCAG 2.2) — **Pass**
No observed redundant-entry requirement.

#### SC 3.3.8 Accessible Authentication (Minimum) (Level AA, WCAG 2.2) — **Pass**
Login uses email + password; no CAPTCHA, puzzle, or cognitive test. `autoComplete="email"` and `autoComplete="current-password"` are set on LoginPage — browser autofill / password managers work ✓.

### 2.4 Robust

#### SC 4.1.2 Name, Role, Value (Level A) — **Fail**
- **Observation:** Consequence of unlabeled inputs (1.3.1), unmarked dialogs (1.3.1), color-only status (1.4.1). Specific offender: the StockReceivePage large form uses `<div>`-wrapped visual groups without form landmarks for "Informasi Umum" / "Harga" / "Grading". Not a fail on its own, but contributes.
- **Severity:** High (this is the umbrella SC for the label + dialog + status issues).
- **Fix:** Addressed by fixes to 1.3.1 + 1.4.1 above.

#### SC 4.1.3 Status Messages (Level AA) — **Partial pass**
- `Toast.tsx:23-25` correctly uses `role="status"` + `aria-live="polite"` ✓.
- `SyncDot` — no live region (see 1.4.1).
- Loading states: `{scanning && <p>Mencari…</p>}` in `POSPage.tsx:825-827` — not in a live region; AT won't announce.
- Save-success flashes ("Tersimpan ✓" in AdminPage) — not in a live region.
- **Severity:** Medium.
- **Fix:** Wrap any transient inline status message in a visually-hidden live region:

```tsx
<span className="sr-only" role="status" aria-live="polite">
  {scanning ? "Sedang mencari kartu" : ""}
</span>
```

---

## 3. Automated & Manual Testing Notes

### What automated tools would likely flag
- **axe-core / axe DevTools:** label-no-associated-control (~28 instances), button-name (any icon button that lost its aria-label), aria-hidden-focus (any `aria-hidden="true"` on a focusable element — none observed yet but worth wiring into CI), color-contrast (success + warning text, border-border).
- **Lighthouse Accessibility audit:** would flag contrast, missing form labels, missing skip link, and likely a 70–80/100 score depending on which page is audited (ReportsPage tables and POSPage modals likely score lowest).
- **Wave browser extension:** would flag the same + potentially duplicate-landmark warnings on pages that render multiple `<main>`-like regions.

### Manual testing recommendations
1. **NVDA + Chrome** end-to-end flow: login → POS → scan → pay → receipt. Note every control that isn't announced correctly.
2. **VoiceOver + Safari iOS** (real device, not simulator) for LoginPage, DashboardPage, POSPage, and the PaymentModal.
3. **Keyboard-only** traversal: remove the mouse and attempt login, scan-to-pay, stock-receive, and void-oversold flows. The tap-and-hold reveal will immediately fail.
4. **Switch-control** (iOS Switch Control or macOS Switch Control) — exposes any missing role semantics.
5. **Zoom to 200%** and **browser font-size to "largest"** across all pages.
6. **Color filters** — simulate deuteranopia/protanopia (Chrome DevTools emulation) to catch color-only signalling in StatusBadge, SyncDot, and MaskedAmount eye-icon states.
7. **Print page** (PRD mentions receipt printing) — verify print CSS preserves semantics.
8. **Large-text preference** via OS-level accessibility settings on iPadOS/Android tablets (the intended deployment devices).

---

## 4. Framework-Specific Recommendations

### React 19 / React Router 7
- Use `useId()` (React 18+) to generate stable form-field ids without prop drilling.
- Use `<NavLink>` from react-router-dom for nav items that need an "active" state — pair with `aria-current="page"` which NavLink sets automatically. The custom `HamburgerMenu` currently just uses `<Link>` and loses active-page context for screen readers.
- Consider `@headlessui/react` or `@radix-ui/react-dialog` for ready-made a11y-correct Dialog primitives. Radix Dialog ships with focus trap, `aria-modal`, ESC handling, and focus restore — all in ~3 KB gzipped.
- Consider `react-aria` (Adobe) for more granular primitives (useToggleButton, useDialog) if a full component library feels heavy.

### Tailwind CSS 3
- Define semantic-role color tokens for text-only usage: `success-ink`, `warning-ink` pinned to the AA-compliant HSLs. Keep the existing hues for fills/borders where the contrast requirement is looser (3:1 non-text).
- Ship a `@layer utilities` class `.focus-ring` that bundles `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface`. Audit for `focus:outline-none` without a matching ring.
- The `apps/web/src/index.css`'s `.bg-dotted-overlay` utility uses `background-attachment: fixed` — fine; no a11y impact.

### Vite PWA
- PWA offline-first means many status messages fire without a network round-trip. Ensure every offline→online transition announces via `aria-live` — users on AT may otherwise miss that their cart sync succeeded.
- `vite-plugin-pwa` Workbox config — nothing to change for a11y, but the service worker's cache behaviour means a fixed-in-time CSS palette will persist; bump the build hash whenever you change `tailwind.config.ts` to force users onto the new contrast values.

### Dexie / IndexedDB
- N/A for WCAG directly. Worth noting: the scanning/loading state in POSPage reads from IDB synchronously enough that the "Mencari…" message may not render long enough for AT to announce it. Delay the announce by ~100 ms if users report missed messages.

---

## 5. Prioritized Action Plan

### 🔴 Critical (blockers for any A-level claim)
1. **Add keyboard equivalent for `BottomPriceReveal` tap-and-hold** — `POSPage.tsx:66-83`. Space/Enter keydown starts the hold, keyup ends it. *Effort: S.*
2. **Add `htmlFor`/`id` association to every `<label>`/`<input>` pair** across all form pages. Adopt `useId()` on each component. *Effort: M (30 files, ~60 label sites).*
3. **Add dialog semantics + focus trap + ESC handling + focus restore to every modal** — PaymentModal, ReceiptModal, oversold confirmation, admin edit sheets. Easiest win: swap to `@radix-ui/react-dialog`. *Effort: M.*

### 🟠 High
4. **Darken `success` and `warning` palette to AA-compliant luminance.** Edit `apps/web/tailwind.config.ts` + audit existing pairings. *Effort: S (~15 min for the palette edit; ~1-2h QA sweep).*
5. **Add `aria-invalid` + `aria-describedby` to every input that can error.** Pair with the existing error paragraph. *Effort: S per form; M overall.*
6. **Wrap `SyncDot` in a live region + add a shape/icon distinction** so state is not color-only. *Effort: S.*
7. **Add skip-to-main-content link** above `<Routes>`. *Effort: S.*

### 🟡 Medium
8. **Replace `focus:outline-none` with `focus-visible:ring-*`** everywhere (or centralise via a `.focus-ring` utility). *Effort: S (global sed + audit).*
9. **Darken `border` token or introduce `border-strong`** to meet SC 1.4.11 on form-field boundaries. *Effort: S.*
10. **Add `aria-hidden="true"` to every decorative lucide icon.** Most are already inside an `aria-label`ed button — just suppress the icon's own semantics. *Effort: S (grep + batch edit).*
11. **Localise `LoginPage` "Email address" label to "Alamat Email"** or `<span lang="en">`. *Effort: trivial.*
12. **Wrap transient status messages (Mencari…, Tersimpan ✓) in visually-hidden `role="status"` live regions.** *Effort: S.*

### 🟢 Nice-to-have (AAA / polish)
13. Replace `text-[10px]` with `text-xs` (12px) — better default legibility.
14. Bump icon-button touch targets from `w-9 h-9` (36px) to `w-11 h-11` (44px) to meet SC 2.5.5 AAA.
15. Add `aria-current="page"` to active nav items in `HamburgerMenu`.
16. Consider a "reveal all amounts" confirmation step for cashiers who enable the ReportsPage scoped mask — currently a single click reveals everything.
17. Add a keyboard shortcut (e.g., Ctrl+K) for the new POS ProductSearch input, matching the scanner autofocus pattern.

---

## 6. Additional Recommendations

### Tooling
- **Wire axe-core into tests.** `@axe-core/react` or `jest-axe` (Vitest-compatible) — one integration test per page that renders the page into JSDOM and asserts `await axe(container)` returns no violations. This catches regressions cheaply.
- **ESLint plugin `eslint-plugin-jsx-a11y`** — enable `recommended` config in `apps/web`. It'll flag missing `htmlFor`, `alt`, role usage, etc. as you type.
- **Lighthouse CI** (via `@lhci/cli`) in a pre-commit or CI job — fails the build if the accessibility score drops below 90.
- **Chromium Accessibility Tree inspector** (DevTools → Accessibility pane) — confirm every interactive control exposes a non-empty accessible name.

### Testing strategy
1. One `*.a11y.test.tsx` per page that renders the page and runs `axe`. Start with the 5 most-used pages (Login, Dashboard, POS, StockReceive, Reports).
2. A single Playwright spec per major flow with `@axe-core/playwright` assertions after each nav: login → POS → pay → receipt.
3. Manual checklist that every PR touching a form/modal fills out (form-label, dialog role, focus-trap, contrast).

### Design-system level
- Author a `docs/adr/00NN-accessibility-standards.md` that codifies: minimum 4.5:1 contrast for any text pairing, `useId` on every form, Radix Dialog for every modal, keyboard equivalents for every pointer-only interaction. Future PRs point back to this ADR instead of re-litigating each case.

### References
- WCAG 2.2 (W3C Rec): https://www.w3.org/TR/WCAG22/
- ARIA Authoring Practices (ARIA APG) patterns for Dialog, Tabs, Listbox, Status.
- React Aria (Adobe) — https://react-spectrum.adobe.com/react-aria/
- Radix UI Primitives — https://www.radix-ui.com/primitives
- `jsx-a11y` ESLint recommended config — https://github.com/jsx-eslint/eslint-plugin-jsx-a11y

---

**Summary judgment:** The codebase has good bones — real semantic HTML in `MobileAppBar`, `Toast`, `SyncDot` (visually); lang is set; touch targets are generous; recent hardening pushed accessibility forward (aria-labels on icon buttons, toast live region). What's blocking AA is surface work, not architecture — fix the label associations, dialog roles, keyboard-hold, and two palette HSLs, and this app will clear AA with room to spare.
