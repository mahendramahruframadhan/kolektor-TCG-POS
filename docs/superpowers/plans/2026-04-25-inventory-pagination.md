# Inventory Pagination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add "load more" pagination to the inventory list so only 50 cards render at a time instead of the full dataset.

**Architecture:** All IDB data stays loaded in `allCards`. A `visibleCount` state controls how many of the already-filtered results are rendered. Each "Muat lagi" click increments `visibleCount` by 50. Filter/search changes reset `visibleCount` to 50.

**Tech Stack:** React (useState, useEffect), Vitest for unit tests, Tailwind CSS.

---

### Task 1: Add visibleCount state, derived slice, and reset effect

**Files:**
- Modify: `apps/web/src/pages/InventoryPage.tsx`

The only file that changes is `InventoryPage.tsx`. We make three additions and two replacements inside the `InventoryPage` function.

- [ ] **Step 1: Add `visibleCount` state after the existing state declarations (around line 317)**

  Current block (lines 312–317):
  ```tsx
  const [allCards, setAllCards] = useState<IdbCard[]>([]);
  const [userMap, setUserMap] = useState<Record<string, string>>({});
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selectedCard, setSelectedCard] = useState<IdbCard | null>(null);
  const [loading, setLoading] = useState(true);
  ```

  Add one line after `loading`:
  ```tsx
  const [allCards, setAllCards] = useState<IdbCard[]>([]);
  const [userMap, setUserMap] = useState<Record<string, string>>({});
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selectedCard, setSelectedCard] = useState<IdbCard | null>(null);
  const [loading, setLoading] = useState(true);
  const [visibleCount, setVisibleCount] = useState(50);
  ```

- [ ] **Step 2: Add the reset effect after the `loadData` useEffect (after line 332)**

  Existing effect at line 332:
  ```tsx
  useEffect(() => { loadData(); }, [loadData]);
  ```

  Add immediately after it:
  ```tsx
  useEffect(() => {
    setVisibleCount(50);
  }, [searchText, statusFilter]);
  ```

- [ ] **Step 3: Add `visibleCards` and `hasMore` derived values after the existing `filteredCards` block (after line 341)**

  Existing block (lines 334–341):
  ```tsx
  const filteredCards = allCards.filter((card) => {
    const matchesSearch =
      !searchText ||
      card.title.toLowerCase().includes(searchText.toLowerCase()) ||
      card.shortId.toLowerCase().includes(searchText.toLowerCase());
    const matchesStatus = statusFilter === "all" || card.status === statusFilter;
    return matchesSearch && matchesStatus;
  });
  ```

  Add two lines after it:
  ```tsx
  const filteredCards = allCards.filter((card) => {
    const matchesSearch =
      !searchText ||
      card.title.toLowerCase().includes(searchText.toLowerCase()) ||
      card.shortId.toLowerCase().includes(searchText.toLowerCase());
    const matchesStatus = statusFilter === "all" || card.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const visibleCards = filteredCards.slice(0, visibleCount);
  const hasMore = filteredCards.length > visibleCount;
  ```

- [ ] **Step 4: Update the count label (around line 386–388)**

  Current:
  ```tsx
  <p className="text-[10px] font-extrabold tracking-widest uppercase text-muted-fg px-1">
    {filteredCards.length} kartu ditemukan
  </p>
  ```

  Replace with:
  ```tsx
  <p className="text-[10px] font-extrabold tracking-widest uppercase text-muted-fg px-1">
    {hasMore
      ? `Menampilkan ${visibleCount} dari ${filteredCards.length} kartu`
      : `${filteredCards.length} kartu ditemukan`}
  </p>
  ```

- [ ] **Step 5: Replace `filteredCards.map(...)` with `visibleCards.map(...)` (around line 399)**

  Current:
  ```tsx
  <ul className="space-y-2">
    {filteredCards.map((card) => {
  ```

  Replace with:
  ```tsx
  <ul className="space-y-2">
    {visibleCards.map((card) => {
  ```

- [ ] **Step 6: Add the "Muat lagi" button after the closing `</ul>` tag and before the closing `)`  of the list section (after the `</ul>`, still inside the `else` branch)**

  Current (after the `filteredCards.map` block, around line 433):
  ```tsx
          </ul>
        )}
      </div>
  ```

  Replace with:
  ```tsx
          </ul>
        )}

        {!loading && hasMore && (
          <button
            onClick={() => setVisibleCount((n) => n + 50)}
            className="w-full h-11 border border-border rounded-2xl text-sm font-bold text-muted-fg hover:bg-muted transition"
          >
            Muat {Math.min(50, filteredCards.length - visibleCount)} kartu lagi
          </button>
        )}
      </div>
  ```

- [ ] **Step 7: Verify the build compiles**

  ```bash
  cd /home/thebennies/dev/repo/thebennies/kolektapos
  pnpm --filter web build 2>&1 | tail -20
  ```

  Expected: no TypeScript errors, build succeeds.

- [ ] **Step 8: Start dev server and manually verify**

  ```bash
  pnpm --filter web dev
  ```

  Open the inventory page. Verify:
  1. With fewer than 50 cards: all cards show, label reads "X kartu ditemukan", no button.
  2. With more than 50 cards (or temporarily reduce `visibleCount` initial value to `2` for testing): label reads "Menampilkan N dari X kartu", button reads "Muat Y kartu lagi".
  3. Clicking the button increments the visible list.
  4. Changing the search text or status filter resets to the first 50 results.
  5. Last page: button disappears, label reverts to "X kartu ditemukan".

- [ ] **Step 9: Commit**

  ```bash
  git add apps/web/src/pages/InventoryPage.tsx
  git commit -m "feat(inventory): add load-more pagination (50 cards per batch)"
  ```
