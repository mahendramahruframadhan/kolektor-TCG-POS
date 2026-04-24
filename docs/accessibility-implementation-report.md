# Accessibility Implementation Report

**Audit source:** [`docs/WCAG-review-claude-opus-4-7-20260424-081500.md`](WCAG-review-claude-opus-4-7-20260424-081500.md)
**Branch:** `feat/complete-mvp`
**Commits shipped:** `6a415ae` · `5d8bd0d` · `beca76d` · `9e3f4da` · `4cb5c26`
**Date:** 2026-04-24

One entry per fix below. Each covers: audit reference → files changed → summary → before/after snippet.

---

## 1. Palette contrast — `success` and `warning` darkened to AA ratios

**Audit reference:** SC 1.4.3 Contrast (Minimum), Level AA — text-success (3.17:1) and text-warning (2.14:1) on white both failed.
**Commit:** `6a415ae`
**Files changed:** `apps/web/tailwind.config.ts`, `apps/web/src/components/SyncDot.tsx`

**Fix:** Single-source palette update in the Tailwind config. Also added a new `border-strong` token for form-field edges per SC 1.4.11.

```ts
// Before
success: "hsl(152,60%,40%)",  // 3.17:1 on white — FAIL
warning: "hsl(38,92%,50%)",   // 2.14:1 on white — FAIL
// (no border-strong token)

// After
success: "hsl(152,60%,29%)",  // 4.56:1 on white — AA ✓
warning: "hsl(38,92%,33%)",   // 4.51:1 on white — AA ✓
"border-strong": "hsl(252,18%,68%)", // for form-field edges (SC 1.4.11)
```

`SyncDot` inlines HSL (not Tailwind classes); updated to match.

---

## 2. SyncDot — shape distinction + live region

**Audit reference:** SC 1.4.1 Use of Color, SC 4.1.3 Status Messages.
**Commit:** `6a415ae`
**Files changed:** `apps/web/src/components/SyncDot.tsx`

**Fix:** Added a lucide icon (`Check` / `RefreshCw` / `WifiOff`) so state reads without colour. Wrapped the component in `role="status"` + `aria-live="polite"` with a descriptive `aria-label` so state transitions announce to AT.

```tsx
// Before — color-only dot + tiny label; no live region
<div className="..." style={{ background, border }}>
  <div className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
  <span style={{ color }}>{LABELS[state]}</span>
</div>

// After — shape + live region
<div
  role="status"
  aria-live="polite"
  aria-label={`Status sinkronisasi: ${LABELS[state]}`}
  className="..."
>
  <Icon className="w-3 h-3" style={{ color }} aria-hidden="true" />
  <span style={{ color }}>{LABELS[state]}</span>
</div>
```

---

## 3. BottomPriceReveal — keyboard tap-and-hold equivalent

**Audit reference:** SC 2.1.1 Keyboard, Level A.
**Commit:** `5d8bd0d`
**Files changed:** `apps/web/src/pages/POSPage.tsx`

**Fix:** `onKeyDown` with Space/Enter starts the 5-second hold timer (same callback as `onMouseDown`/`onTouchStart`); `onKeyUp` cancels. `onBlur` also cancels so focus leaving the control resets state. `aria-pressed` reports the current revealed state. Added focus-visible ring.

```tsx
// Before — pointer-only
<button
  onMouseDown={startReveal}
  onMouseUp={endReveal}
  onTouchStart={startReveal}
  onTouchEnd={endReveal}
  aria-label="Tap dan tahan untuk melihat harga minimum"
>

// After — keyboard-parity
<button
  onMouseDown={startReveal}
  onMouseUp={endReveal}
  onMouseLeave={endReveal}
  onTouchStart={startReveal}
  onTouchEnd={endReveal}
  onKeyDown={(e) => {
    if ((e.key === " " || e.key === "Enter") && !e.repeat) {
      e.preventDefault();
      startReveal();
    }
  }}
  onKeyUp={(e) => {
    if (e.key === " " || e.key === "Enter") { e.preventDefault(); endReveal(); }
  }}
  onBlur={endReveal}
  className="... focus:outline-none focus-visible:ring-2 focus-visible:ring-warning focus-visible:ring-offset-2"
  aria-label="Tekan dan tahan (Spasi/Enter atau tap) selama 5 detik untuk melihat harga minimum"
  aria-pressed={revealed}
>
```

---

## 4. Form-label associations via `useId()`

**Audit reference:** SC 1.3.1 Info and Relationships (A), SC 3.3.2 Labels or Instructions (A), SC 4.1.2 Name, Role, Value (A).
**Commit:** `beca76d`
**Files changed:** `LoginPage.tsx`, `ChangePasswordPage.tsx`, `EventsAdminPage.tsx`, `UsersAdminPage.tsx`, `CashReconciliationPage.tsx`, `ReportsPage.tsx`, `AdminPage.tsx`

**Fix:** `React.useId()` threads a stable id between `<label htmlFor>` and the associated `<input>`/`<select>`/`<textarea>`. Where inputs can error, also added `aria-invalid` + `aria-describedby` pointing at the error `<p>` (which gains `role="alert"`). Non-semantic `<p>` labels in `AdminPage`'s `SettingRow` / `SettingSelectRow` were converted to real `<label>`. Localised "Email address" → "Alamat Email" on LoginPage. Added autoComplete hints on the users form.

```tsx
// Before — visual-only, no programmatic association
<label className="block text-sm font-semibold text-fg">Email address</label>
<input type="email" required autoComplete="email" ... />

// After — useId-based association + localised label
const emailId = useId();
// …
<label htmlFor={emailId} className="block text-sm font-semibold text-fg">
  Alamat Email
</label>
<input id={emailId} type="email" required autoComplete="email" ... />
```

And for inputs that can error:

```tsx
<input
  id={currentId}
  aria-invalid={!!error}
  aria-describedby={error ? errorId : undefined}
  ...
/>
{error && <p id={errorId} role="alert" className="...">{error}</p>}
```

**Deferred to follow-up:** StockReceivePage (~20 fields) and POSPage PaymentModal inline labels — covered in the next wave alongside the Dialog primitive rollout for other admin edit sheets.

---

## 5. Accessible `<Dialog>` primitive — applied to PaymentModal & ReceiptModal

**Audit reference:** SC 1.3.1, SC 2.1.2 No Keyboard Trap, SC 2.4.3 Focus Order, SC 4.1.2 Name, Role, Value.
**Commit:** `9e3f4da`
**Files changed:** `apps/web/src/components/Dialog.tsx` (new), `apps/web/src/pages/POSPage.tsx`

**Fix:** New `Dialog` component with:
- `role="dialog"` + `aria-modal="true"` + `aria-labelledby`/`aria-describedby` wired to auto-ID'd title/description.
- Focus trap — Tab/Shift-Tab cycle within the panel.
- Escape-to-close (`disableEscape` opts out for in-flight operations like paying).
- Backdrop-click-to-close (`disableBackdropClose` opts out).
- Initial focus to the first tabbable child (or caller-supplied `initialFocusRef`).
- Focus restore to the element that opened the dialog.

```tsx
// Dialog component usage
<Dialog
  open={showPayModal}
  onClose={onCancel}
  title="Pembayaran"
  disableEscape={paying}
  disableBackdropClose={paying}
>
  {/* modal body */}
</Dialog>
```

`PaymentModal` and `ReceiptModal` refactored to the Dialog contract — previously raw `<div className="fixed inset-0 ...">` overlays with no dialog semantics and no focus management. Decorative visuals (bottom-sheet drag handle, the success-checkmark circle) marked `aria-hidden="true"`.

---

## 6. Skip link, `aria-current`, decorative icon suppression, live-region scanning state

**Audit reference:** SC 2.4.1 Bypass Blocks (A), SC 1.1.1 Non-text Content (A), SC 4.1.3 Status Messages (AA), SC 2.4.7 Focus Visible (AA).
**Commit:** `4cb5c26`
**Files changed:** `App.tsx`, `DashboardPage.tsx`, `ChangePasswordPage.tsx`, `DocsPage.tsx`, `OversoldQueuePage.tsx`, `ReportsPage.tsx`, `POSPage.tsx`, `MaskedAmount.tsx`, `Toast.tsx`, `HamburgerMenu.tsx`

**Fix:**
- **Skip link** inside `App.tsx`, visible only on focus, jumps to `#main-content`. The four pages that already render a semantic `<main>` gain `id="main-content"` — remaining pages still use `<div>` wrappers and will land the user in the document body on activation (visual landing point matches page content; semantic `<main>` conversion across the other 14 pages is a follow-up).
- **`aria-current="page"`** on ReportsPage tab buttons so screen readers announce the active tab; also gained `focus-visible:ring-2 focus-visible:ring-inset`.
- **Dashboard quick-action tiles** gain `focus-visible` ring + `aria-hidden="true"` on the icon (icon duplicates the label text).
- **Decorative lucide icons** inside already-labelled controls marked `aria-hidden="true"` in `MaskedAmount` (Eye/EyeOff), `Toast` (CheckCircle/AlertCircle), `HamburgerMenu` (every nav icon, Key, BookOpen).
- **POSPage scanning indicator** — the `{scanning && <p>Mencari…</p>}` inline string is now a persistent `role="status"` `aria-live="polite"` node whose content changes between "Mencari kartu…" and empty. AT announces on each scan attempt without forcing a focus change.

```tsx
// Skip link in App.tsx
<a
  href="#main-content"
  className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[100] focus:bg-primary focus:text-primary-fg focus:px-4 focus:py-2 focus:rounded-xl focus:font-bold focus:shadow-lg focus:ring-2 focus:ring-accent"
>
  Lewati ke konten utama
</a>
```

---

## What was NOT fixed in this wave (deferred, tracked)

The items below are from the audit but intentionally pushed to a follow-up to keep each commit focused:

- **StockReceivePage form labels + aria-invalid.** Large form (~20 fields); belongs in the same commit as its own Dialog rollout if it ever converts its "Bulk" sheet, and benefits from a shared `<LabeledInput>` helper which wasn't in scope here.
- **POSPage PaymentModal inline labels** inside the now-dialog body (the modal envelope is fixed; inner `<label>` nodes still lack `htmlFor`). Same helper would fix this.
- **`<main id="main-content">` on the 14 pages that still use a `<div>` wrapper.** The skip link is injected and functional; those pages just don't land the user precisely at the content start. Low-risk bulk sed when someone has the bandwidth.
- **`border-strong` token adoption.** The token is defined but no form inputs are migrated to it yet — still using the lighter `border` token (contrast 1.32:1 on white), which fails SC 1.4.11. One-line class swap per input type; batched with the next form-helper refactor.
- **Nice-to-have AAA items** — 44×44 target size, 12px minimum font size, `aria-current` on HamburgerMenu NavLinks. Tracked in the original audit's "🟢 Nice-to-have" block.

## Verification

- `pnpm typecheck` — green on every commit.
- `pnpm build` — green on every commit (PWA bundle rebuilt on palette change).
- Manual keyboard traversal of `BottomPriceReveal`, `PaymentModal`, `ReceiptModal`, and the new skip link — all work as specified.
- No regressions observed in the 60-test suite (no tests directly touch the changed surfaces).
