# M8 Progress Report — Intake Polish + Bulk Import

**Status:** Complete  
**Date:** 2026-04-23

## Deliverables

### F16: Graded card fields (`IntakePage.tsx`)
- `isGraded` checkbox toggling a graded sub-form: `gradingCompany` (PSA/BGS/CGC/ACE/Other dropdown), `grade` (text), `certNumber` (optional text)
- Validation: gradingCompany + grade required when `isGraded=true`
- Fields included in API payload and IDB persistence

### F19: Photo at intake (`IntakePage.tsx`)
- `<input type="file" accept="image/*" capture="environment">` — opens camera on mobile
- Client-side thumbnail generation via Canvas (max 300px, JPEG 80%) before storage
- Thumbnail stored in `idb.pendingPhotos` with `cardClientId` as key
- Immediate upload attempt via `POST /api/sync/photo/:clientId` when online; queued for retry if offline
- Graceful non-fatal failure: card saves even if photo fails
- Preview shown in intake form; "Remove" button clears selection

### F23: Transaction-level discount (`POSPage.tsx` PaymentModal)
- `max_transaction_discount_pct` loaded from IDB settings on mount
- PaymentModal shows subtotal + discount row + net total
- Discount input (IDR) with cap validation: `discountIdr ≤ floor(subtotal × maxPct / 100)`
- Discount reason text field required when discount > 0
- `discountIdr` and `discountReason` passed to `api.carts.pay()` → already wired in carts route

### F26: Excel bulk import (`BulkImportPage.tsx`)
- SheetJS (`xlsx@0.18`) parses `.xlsx/.xls/.csv` files client-side
- Row-level validation: owner name lookup, required fields, pricing consistency, condition/language enum checks, graded field requirements
- Summary: valid count + invalid count before import
- Per-row error list displayed inline for invalid rows
- Import streams valid rows to `api.cards.create()` + IDB in sequence with progress counter
- Error report downloadable as CSV after import
- Template download: pre-populated example `.xlsx` file generated via SheetJS
- Page at `/intake/bulk`; "Bulk Import" link in IntakePage header

### F30: Transaction notes (`POSPage.tsx` PaymentModal)
- `notes` textarea in PaymentModal (below discount section)
- Passed to `api.carts.pay()` as `notes`; stored in `transactions.notes` column (already in schema)

## Package additions
- `xlsx@0.18.5` added to `apps/web`

## Bundle note
xlsx adds ~450 KB to the bundle. Acceptable for a private 11-person internal tool; code-splitting deferred.
