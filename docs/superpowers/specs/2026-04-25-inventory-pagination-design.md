# Inventory Pagination — Design Spec

**Date:** 2026-04-25
**Status:** Approved

---

## Overview

Add "load more" pagination to `InventoryPage`. All card data stays loaded in memory from IndexedDB; pagination only controls how many rows are rendered. No new API endpoints or IDB queries required.

---

## Approach

**Load More** — render the first 50 filtered results, show a "Muat 50 kartu lagi" button when more exist. Each click adds 50 to the visible count.

---

## Changes

**File:** `apps/web/src/pages/InventoryPage.tsx` — only file touched.

### New state

```ts
const [visibleCount, setVisibleCount] = useState(50);
```

### Reset on filter/search change

Add a `useEffect` (or inline reset) that resets `visibleCount` to 50 whenever `searchText` or `statusFilter` changes.

```ts
useEffect(() => {
  setVisibleCount(50);
}, [searchText, statusFilter]);
```

### Derived slice

```ts
const visibleCards = filteredCards.slice(0, visibleCount);
const hasMore = filteredCards.length > visibleCount;
```

Replace the existing `filteredCards.map(...)` render loop with `visibleCards.map(...)`.

### Count label

Current: `"X kartu ditemukan"`

Updated logic:
- When `hasMore` is false: `"X kartu ditemukan"` (unchanged)
- When `hasMore` is true: `"Menampilkan N dari X kartu"`

### Load More button

Rendered below the card list, only when `hasMore` is true:

```tsx
{hasMore && (
  <button
    onClick={() => setVisibleCount((n) => n + 50)}
    className="w-full h-11 border border-border rounded-2xl text-sm font-bold text-muted-fg hover:bg-muted transition"
  >
    Muat {Math.min(50, filteredCards.length - visibleCount)} kartu lagi
  </button>
)}
```

The button label shows the exact count of remaining cards if fewer than 50 remain (e.g., "Muat 23 kartu lagi").

---

## Constraints

- `allCards` and `filteredCards` remain unchanged — full dataset in memory for correct counts and filtering.
- No scroll-position preservation. Filter/search resets visible window to top 50, which is the expected UX.
- Page size is hardcoded at 50. No user-configurable setting needed.
