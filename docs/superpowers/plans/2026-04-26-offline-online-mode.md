# Offline/Online Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tambahkan klasifikasi offline/online pada semua modul KolektaPOS dengan UI gate otomatis, network mode toggle (auto/force-offline), dan POS offline queue agar kasir bisa bertransaksi penuh tanpa jaringan.

**Architecture:** Route wrapper `OfflineModeGuard` membaca tier per route (`safe|partial|blocked`) dan menampilkan banner atau empty state saat offline. State jaringan efektif (`effectiveIsOnline`) dihitung dari `networkMode` (auto/force-offline) + `actualIsOnline` (OS event), disimpan di Zustand `sync-state.ts`. POS direfaktor agar menulis transaksi ke tabel IDB `pending_transactions` saat offline, di-flush ke server saat koneksi kembali.

**Tech Stack:** React, Zustand, Dexie (IndexedDB), Fastify, Drizzle ORM, Vitest + @testing-library/react

**Spec:** `docs/superpowers/specs/2026-04-26-offline-online-mode-design.md`

---

## File Map

### Baru (create)
- `apps/web/src/store/sync-state.test.ts`
- `apps/web/src/hooks/use-is-online.ts`
- `apps/web/src/hooks/use-is-online.test.ts`
- `apps/web/src/components/OfflineBanner.tsx`
- `apps/web/src/components/OfflineBanner.test.tsx`
- `apps/web/src/components/OfflineBlockedState.tsx`
- `apps/web/src/components/OfflineBlockedState.test.tsx`
- `apps/web/src/components/NetworkModeToggle.tsx`
- `apps/web/src/components/NetworkModeToggle.test.tsx`
- `apps/web/src/components/OfflineModeGuard.tsx`
- `apps/web/src/components/OfflineModeGuard.test.tsx`
- `apps/api/src/routes/flush-pending-tx.ts`
- `apps/api/src/routes/flush-pending-tx.test.ts`

### Modifikasi (modify)
- `apps/web/src/store/sync-state.ts` — tambah `networkMode`, `effectiveIsOnline`, `pendingTransactionCount`
- `apps/web/src/store/pos.ts` — tambah `activeCartIsOffline`
- `apps/web/src/lib/db.ts` — tambah `IdbPendingTransaction` + Dexie v3
- `apps/web/src/lib/api.ts` — tambah `api.sync.flushPendingTx`
- `apps/web/src/lib/background-sync.ts` — gunakan `effectiveIsOnline`, tambah `flushPendingTransactions`
- `apps/web/src/components/MobileAppBar.tsx` — tambah `NetworkModeToggle`
- `apps/web/src/components/SyncDot.tsx` — tampilkan jumlah pending transactions
- `apps/web/src/App.tsx` — wrap routes `partial`/`blocked` dengan `OfflineModeGuard`
- `apps/web/src/pages/InventoryPage.tsx` — `useIsOnline` + disable write buttons
- `apps/web/src/pages/ReportsPage.tsx` — `useIsOnline` + disable write buttons
- `apps/web/src/pages/AdminPage.tsx` — `useIsOnline` + disable write buttons
- `apps/web/src/pages/OversoldQueuePage.tsx` — `useIsOnline` + disable write buttons
- `apps/web/src/pages/CashReconciliationPage.tsx` — `useIsOnline` + disable write buttons
- `apps/web/src/pages/POSPage.tsx` — offline cart + payment queue
- `apps/api/src/server.ts` — register `flushPendingTxRoute`

---

## Task 1: Extend `sync-state.ts` — Network Mode + Effective Online Status

**Files:**
- Modify: `apps/web/src/store/sync-state.ts`
- Create: `apps/web/src/store/sync-state.test.ts`

- [ ] **Step 1.1: Tulis tes untuk behavior baru**

```ts
// apps/web/src/store/sync-state.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";

const mockStorage: Record<string, string> = {};
vi.stubGlobal("localStorage", {
  getItem: (k: string) => mockStorage[k] ?? null,
  setItem: (k: string, v: string) => { mockStorage[k] = v; },
  removeItem: (k: string) => { delete mockStorage[k]; },
});

import { useSyncStateStore } from "./sync-state.js";

beforeEach(() => {
  Object.keys(mockStorage).forEach(k => delete mockStorage[k]);
  useSyncStateStore.setState({
    state: "online",
    networkMode: "auto",
    effectiveIsOnline: true,
    lastError: null,
    lastSyncAt: null,
    pendingTransactionCount: 0,
  });
});

describe("effectiveIsOnline", () => {
  it("true ketika auto dan state online", () => {
    expect(useSyncStateStore.getState().effectiveIsOnline).toBe(true);
  });

  it("false ketika force-offline meski state online", () => {
    useSyncStateStore.getState().setNetworkMode("force-offline");
    expect(useSyncStateStore.getState().effectiveIsOnline).toBe(false);
  });

  it("false ketika auto dan state offline", () => {
    useSyncStateStore.getState().setState("offline");
    expect(useSyncStateStore.getState().effectiveIsOnline).toBe(false);
  });

  it("true kembali ketika mode kembali ke auto dan state online", () => {
    useSyncStateStore.getState().setNetworkMode("force-offline");
    useSyncStateStore.setState({ state: "online" });
    useSyncStateStore.getState().setNetworkMode("auto");
    expect(useSyncStateStore.getState().effectiveIsOnline).toBe(true);
  });
});

describe("setNetworkMode", () => {
  it("persist ke localStorage", () => {
    useSyncStateStore.getState().setNetworkMode("force-offline");
    expect(localStorage.getItem("kolekta-network-mode")).toBe("force-offline");
  });

  it("update networkMode di store", () => {
    useSyncStateStore.getState().setNetworkMode("force-offline");
    expect(useSyncStateStore.getState().networkMode).toBe("force-offline");
  });
});

describe("setPendingTransactionCount", () => {
  it("update count di store", () => {
    useSyncStateStore.getState().setPendingTransactionCount(3);
    expect(useSyncStateStore.getState().pendingTransactionCount).toBe(3);
  });
});
```

- [ ] **Step 1.2: Jalankan tes, pastikan GAGAL**

```bash
pnpm --filter web test --run src/store/sync-state.test.ts
```
Expected: FAIL — `setNetworkMode` tidak ada.

- [ ] **Step 1.3: Ganti isi `sync-state.ts`**

```ts
// apps/web/src/store/sync-state.ts
import { create } from "zustand";

export type SyncState = "online" | "syncing" | "offline" | "error";
export type NetworkMode = "auto" | "force-offline";

const NETWORK_MODE_KEY = "kolekta-network-mode";

function loadNetworkMode(): NetworkMode {
  if (typeof localStorage === "undefined") return "auto";
  return (localStorage.getItem(NETWORK_MODE_KEY) as NetworkMode) ?? "auto";
}

function computeEffective(state: SyncState, mode: NetworkMode): boolean {
  if (mode === "force-offline") return false;
  return state === "online" || state === "syncing";
}

interface SyncStateStore {
  state: SyncState;
  lastError: string | null;
  lastSyncAt: number | null;
  networkMode: NetworkMode;
  effectiveIsOnline: boolean;
  pendingTransactionCount: number;
  setState: (s: SyncState, error?: string | null) => void;
  markSuccess: () => void;
  setNetworkMode: (mode: NetworkMode) => void;
  setPendingTransactionCount: (count: number) => void;
}

export const useSyncStateStore = create<SyncStateStore>((set) => {
  const initialMode = loadNetworkMode();
  const initialState: SyncState =
    typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "online";
  return {
    state: initialState,
    lastError: null,
    lastSyncAt: null,
    networkMode: initialMode,
    effectiveIsOnline: computeEffective(initialState, initialMode),
    pendingTransactionCount: 0,
    setState: (state, error = null) =>
      set((s) => ({
        state,
        lastError: error,
        effectiveIsOnline: computeEffective(state, s.networkMode),
      })),
    markSuccess: () =>
      set((s) => ({
        state: "online",
        lastError: null,
        lastSyncAt: Date.now(),
        effectiveIsOnline: computeEffective("online", s.networkMode),
      })),
    setNetworkMode: (networkMode) => {
      localStorage.setItem(NETWORK_MODE_KEY, networkMode);
      set((s) => ({
        networkMode,
        effectiveIsOnline: computeEffective(s.state, networkMode),
      }));
    },
    setPendingTransactionCount: (pendingTransactionCount) =>
      set({ pendingTransactionCount }),
  };
});

if (typeof window !== "undefined") {
  window.addEventListener("online", () =>
    useSyncStateStore.getState().setState("online")
  );
  window.addEventListener("offline", () =>
    useSyncStateStore.getState().setState("offline")
  );
}
```

- [ ] **Step 1.4: Jalankan tes, pastikan LULUS**

```bash
pnpm --filter web test --run src/store/sync-state.test.ts
```
Expected: PASS semua test.

- [ ] **Step 1.5: Commit**

```bash
git add apps/web/src/store/sync-state.ts apps/web/src/store/sync-state.test.ts
git commit -m "feat(offline): extend sync-state with networkMode and effectiveIsOnline"
```

---

## Task 2: Hook `useIsOnline`

**Files:**
- Create: `apps/web/src/hooks/use-is-online.ts`
- Create: `apps/web/src/hooks/use-is-online.test.ts`

- [ ] **Step 2.1: Tulis tes**

```ts
// apps/web/src/hooks/use-is-online.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSyncStateStore } from "../store/sync-state.js";
import { useIsOnline } from "./use-is-online.js";

beforeEach(() => {
  useSyncStateStore.setState({ effectiveIsOnline: true });
});

describe("useIsOnline", () => {
  it("returns true ketika effectiveIsOnline true", () => {
    const { result } = renderHook(() => useIsOnline());
    expect(result.current).toBe(true);
  });

  it("returns false ketika effectiveIsOnline false", () => {
    act(() => useSyncStateStore.setState({ effectiveIsOnline: false }));
    const { result } = renderHook(() => useIsOnline());
    expect(result.current).toBe(false);
  });

  it("re-render saat effectiveIsOnline berubah", () => {
    const { result, rerender } = renderHook(() => useIsOnline());
    expect(result.current).toBe(true);
    act(() => useSyncStateStore.setState({ effectiveIsOnline: false }));
    rerender();
    expect(result.current).toBe(false);
  });
});
```

- [ ] **Step 2.2: Jalankan tes, pastikan GAGAL**

```bash
pnpm --filter web test --run src/hooks/use-is-online.test.ts
```
Expected: FAIL — module tidak ada.

- [ ] **Step 2.3: Buat implementasi**

```ts
// apps/web/src/hooks/use-is-online.ts
import { useSyncStateStore } from "../store/sync-state.js";

export function useIsOnline(): boolean {
  return useSyncStateStore((s) => s.effectiveIsOnline);
}
```

- [ ] **Step 2.4: Jalankan tes, pastikan LULUS**

```bash
pnpm --filter web test --run src/hooks/use-is-online.test.ts
```

- [ ] **Step 2.5: Commit**

```bash
git add apps/web/src/hooks/use-is-online.ts apps/web/src/hooks/use-is-online.test.ts
git commit -m "feat(offline): add useIsOnline hook"
```

---

## Task 3: Komponen `OfflineBanner` dan `OfflineBlockedState`

**Files:**
- Create: `apps/web/src/components/OfflineBanner.tsx`
- Create: `apps/web/src/components/OfflineBanner.test.tsx`
- Create: `apps/web/src/components/OfflineBlockedState.tsx`
- Create: `apps/web/src/components/OfflineBlockedState.test.tsx`

- [ ] **Step 3.1: Tulis tes untuk kedua komponen**

```tsx
// apps/web/src/components/OfflineBanner.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { OfflineBanner } from "./OfflineBanner.js";

describe("OfflineBanner", () => {
  it("render dengan role alert", () => {
    render(<OfflineBanner />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("tampilkan pesan offline", () => {
    render(<OfflineBanner />);
    expect(screen.getByText(/offline/i)).toBeInTheDocument();
    expect(screen.getByText(/tidak dapat disimpan/i)).toBeInTheDocument();
  });
});
```

```tsx
// apps/web/src/components/OfflineBlockedState.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { OfflineBlockedState } from "./OfflineBlockedState.js";

describe("OfflineBlockedState", () => {
  it("tampilkan heading dan pesan", () => {
    render(<OfflineBlockedState />);
    expect(screen.getByRole("heading")).toBeInTheDocument();
    expect(screen.getByText(/koneksi internet/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 3.2: Jalankan tes, pastikan GAGAL**

```bash
pnpm --filter web test --run src/components/OfflineBanner.test.tsx src/components/OfflineBlockedState.test.tsx
```

- [ ] **Step 3.3: Buat `OfflineBanner.tsx`**

```tsx
// apps/web/src/components/OfflineBanner.tsx
import React from "react";
import { WifiOff } from "lucide-react";

export function OfflineBanner() {
  return (
    <div
      role="alert"
      className="flex items-center gap-2 px-4 py-3 bg-warning/10 border-b border-warning/30 text-warning text-sm font-medium"
    >
      <WifiOff className="w-4 h-4 shrink-0" aria-hidden="true" />
      <span>Anda offline. Perubahan tidak dapat disimpan.</span>
    </div>
  );
}
```

- [ ] **Step 3.4: Buat `OfflineBlockedState.tsx`**

```tsx
// apps/web/src/components/OfflineBlockedState.tsx
import React from "react";
import { WifiOff } from "lucide-react";

export function OfflineBlockedState() {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-64 gap-4 p-8 text-center">
      <WifiOff className="w-12 h-12 text-muted-fg" aria-hidden="true" />
      <h2 className="text-lg font-bold text-fg">Perlu Koneksi Internet</h2>
      <p className="text-sm text-muted-fg max-w-xs">
        Halaman ini tidak tersedia saat offline.
      </p>
    </div>
  );
}
```

- [ ] **Step 3.5: Jalankan tes, pastikan LULUS**

```bash
pnpm --filter web test --run src/components/OfflineBanner.test.tsx src/components/OfflineBlockedState.test.tsx
```

- [ ] **Step 3.6: Commit**

```bash
git add apps/web/src/components/OfflineBanner.tsx apps/web/src/components/OfflineBanner.test.tsx apps/web/src/components/OfflineBlockedState.tsx apps/web/src/components/OfflineBlockedState.test.tsx
git commit -m "feat(offline): add OfflineBanner and OfflineBlockedState components"
```

---

## Task 4: Komponen `NetworkModeToggle`

**Files:**
- Create: `apps/web/src/components/NetworkModeToggle.tsx`
- Create: `apps/web/src/components/NetworkModeToggle.test.tsx`

- [ ] **Step 4.1: Tulis tes**

```tsx
// apps/web/src/components/NetworkModeToggle.test.tsx
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useSyncStateStore } from "../store/sync-state.js";
import { NetworkModeToggle } from "./NetworkModeToggle.js";

beforeEach(() => {
  useSyncStateStore.setState({ networkMode: "auto" });
});

describe("NetworkModeToggle", () => {
  it('render tombol "Auto" saat mode auto', () => {
    render(<NetworkModeToggle />);
    expect(screen.getByRole("button", { name: /auto/i })).toBeInTheDocument();
  });

  it("buka dropdown saat diklik", () => {
    render(<NetworkModeToggle />);
    fireEvent.click(screen.getByRole("button", { name: /auto/i }));
    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });

  it("set force-offline saat opsi Mode Offline diklik", () => {
    render(<NetworkModeToggle />);
    fireEvent.click(screen.getByRole("button", { name: /auto/i }));
    fireEvent.click(screen.getByText(/mode offline/i));
    expect(useSyncStateStore.getState().networkMode).toBe("force-offline");
  });

  it('tampilkan "Offline" saat mode force-offline', () => {
    useSyncStateStore.setState({ networkMode: "force-offline" });
    render(<NetworkModeToggle />);
    expect(screen.getByRole("button", { name: /offline/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 4.2: Jalankan tes, pastikan GAGAL**

```bash
pnpm --filter web test --run src/components/NetworkModeToggle.test.tsx
```

- [ ] **Step 4.3: Buat `NetworkModeToggle.tsx`**

```tsx
// apps/web/src/components/NetworkModeToggle.tsx
import React, { useState, useRef, useEffect } from "react";
import { Wifi, Plane } from "lucide-react";
import { useSyncStateStore } from "../store/sync-state.js";

export function NetworkModeToggle() {
  const networkMode = useSyncStateStore((s) => s.networkMode);
  const setNetworkMode = useSyncStateStore((s) => s.setNetworkMode);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  const isForceOffline = networkMode === "force-offline";

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={isForceOffline ? "Mode jaringan: Offline" : "Mode jaringan: Auto"}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-extrabold tracking-widest uppercase border transition ${
          isForceOffline
            ? "bg-warning/10 border-warning/40 text-warning"
            : "bg-muted border-border text-muted-fg"
        }`}
      >
        {isForceOffline ? (
          <Plane className="w-3 h-3" aria-hidden="true" />
        ) : (
          <Wifi className="w-3 h-3" aria-hidden="true" />
        )}
        {isForceOffline ? "Offline" : "Auto"}
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Pilih mode jaringan"
          className="absolute right-0 top-full mt-1 bg-card border border-border rounded-xl shadow-lg py-1 min-w-[148px] z-50"
        >
          <button
            role="option"
            aria-selected={networkMode === "auto"}
            onClick={() => { setNetworkMode("auto"); setOpen(false); }}
            className="w-full text-left px-4 py-2.5 text-sm hover:bg-muted transition flex items-center gap-2"
          >
            <Wifi className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>{networkMode === "auto" ? "✓ " : ""}Auto</span>
          </button>
          <button
            role="option"
            aria-selected={networkMode === "force-offline"}
            onClick={() => { setNetworkMode("force-offline"); setOpen(false); }}
            className="w-full text-left px-4 py-2.5 text-sm hover:bg-muted transition flex items-center gap-2"
          >
            <Plane className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>{networkMode === "force-offline" ? "✓ " : ""}Mode Offline</span>
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4.4: Jalankan tes, pastikan LULUS**

```bash
pnpm --filter web test --run src/components/NetworkModeToggle.test.tsx
```

- [ ] **Step 4.5: Commit**

```bash
git add apps/web/src/components/NetworkModeToggle.tsx apps/web/src/components/NetworkModeToggle.test.tsx
git commit -m "feat(offline): add NetworkModeToggle component"
```

---

## Task 5: Komponen `OfflineModeGuard`

**Files:**
- Create: `apps/web/src/components/OfflineModeGuard.tsx`
- Create: `apps/web/src/components/OfflineModeGuard.test.tsx`

- [ ] **Step 5.1: Tulis tes**

```tsx
// apps/web/src/components/OfflineModeGuard.test.tsx
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { useSyncStateStore } from "../store/sync-state.js";
import { OfflineModeGuard } from "./OfflineModeGuard.js";

beforeEach(() => {
  useSyncStateStore.setState({ effectiveIsOnline: true });
});

const Child = () => <div>konten halaman</div>;

describe("OfflineModeGuard", () => {
  it("safe: render children saat online", () => {
    render(<OfflineModeGuard offlineMode="safe"><Child /></OfflineModeGuard>);
    expect(screen.getByText("konten halaman")).toBeInTheDocument();
  });

  it("safe: render children saat offline (tidak ada gate)", () => {
    useSyncStateStore.setState({ effectiveIsOnline: false });
    render(<OfflineModeGuard offlineMode="safe"><Child /></OfflineModeGuard>);
    expect(screen.getByText("konten halaman")).toBeInTheDocument();
  });

  it("partial: render children + banner saat offline", () => {
    useSyncStateStore.setState({ effectiveIsOnline: false });
    render(<OfflineModeGuard offlineMode="partial"><Child /></OfflineModeGuard>);
    expect(screen.getByText("konten halaman")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("partial: tidak tampilkan banner saat online", () => {
    render(<OfflineModeGuard offlineMode="partial"><Child /></OfflineModeGuard>);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("blocked: render OfflineBlockedState saat offline (bukan children)", () => {
    useSyncStateStore.setState({ effectiveIsOnline: false });
    render(<OfflineModeGuard offlineMode="blocked"><Child /></OfflineModeGuard>);
    expect(screen.queryByText("konten halaman")).not.toBeInTheDocument();
    expect(screen.getByRole("heading")).toBeInTheDocument();
  });

  it("blocked: render children saat online", () => {
    render(<OfflineModeGuard offlineMode="blocked"><Child /></OfflineModeGuard>);
    expect(screen.getByText("konten halaman")).toBeInTheDocument();
  });
});
```

- [ ] **Step 5.2: Jalankan tes, pastikan GAGAL**

```bash
pnpm --filter web test --run src/components/OfflineModeGuard.test.tsx
```

- [ ] **Step 5.3: Buat `OfflineModeGuard.tsx`**

```tsx
// apps/web/src/components/OfflineModeGuard.tsx
import React from "react";
import { useIsOnline } from "../hooks/use-is-online.js";
import { OfflineBanner } from "./OfflineBanner.js";
import { OfflineBlockedState } from "./OfflineBlockedState.js";

export type OfflineMode = "safe" | "partial" | "blocked";

interface Props {
  children: React.ReactNode;
  offlineMode: OfflineMode;
}

export function OfflineModeGuard({ children, offlineMode }: Props) {
  const isOnline = useIsOnline();

  if (!isOnline && offlineMode === "blocked") {
    return <OfflineBlockedState />;
  }

  if (!isOnline && offlineMode === "partial") {
    return (
      <>
        <OfflineBanner />
        {children}
      </>
    );
  }

  return <>{children}</>;
}
```

- [ ] **Step 5.4: Jalankan tes, pastikan LULUS**

```bash
pnpm --filter web test --run src/components/OfflineModeGuard.test.tsx
```

- [ ] **Step 5.5: Commit**

```bash
git add apps/web/src/components/OfflineModeGuard.tsx apps/web/src/components/OfflineModeGuard.test.tsx
git commit -m "feat(offline): add OfflineModeGuard route wrapper"
```

---

## Task 6: Wire Routes di `App.tsx` + `MobileAppBar`

**Files:**
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/components/MobileAppBar.tsx`

Tidak ada tes baru — perubahan App.tsx bersifat wiring saja.

- [ ] **Step 6.1: Tambahkan import di `App.tsx`**

Tambahkan di baris import `App.tsx` (setelah import pages terakhir):

```ts
import { OfflineModeGuard } from "./components/OfflineModeGuard.js";
```

- [ ] **Step 6.2: Wrap routes `partial` dan `blocked` di `App.tsx`**

Ganti blok `<Routes>` menjadi (hanya route yang berubah, sisanya tetap):

```tsx
<Routes>
  <Route path="/" element={<LandingPage />} />

  {/* blocked — tidak ada data IDB */}
  <Route path="/login" element={
    <OfflineModeGuard offlineMode="blocked">
      <LoginPage />
    </OfflineModeGuard>
  } />

  {/* safe — semua dari IDB */}
  <Route path="/dashboard" element={<RequireAuth><DashboardPage /></RequireAuth>} />
  <Route path="/pos" element={<RequireAuth><POSPage /></RequireAuth>} />
  <Route path="/transactions/:id" element={<RequireAuth><TransactionDetailPage /></RequireAuth>} />
  <Route path="/profile" element={<RequireAuth><ProfilePage /></RequireAuth>} />
  <Route path="/labels" element={<RequireAuth><QRLabelPage /></RequireAuth>} />
  <Route path="/my-payout" element={<RequireAuth><MyPayoutPage /></RequireAuth>} />
  <Route path="/docs" element={<DocsPage />} />

  {/* partial — IDB read oke, write disabled */}
  <Route path="/inventory" element={
    <RequireAuth>
      <OfflineModeGuard offlineMode="partial">
        <InventoryPage />
      </OfflineModeGuard>
    </RequireAuth>
  } />
  <Route path="/reports" element={
    <RequireAuth>
      <OfflineModeGuard offlineMode="partial">
        <ReportsPage />
      </OfflineModeGuard>
    </RequireAuth>
  } />
  <Route path="/reports/:code" element={
    <RequireAuth>
      <OfflineModeGuard offlineMode="partial">
        <ReportsPage />
      </OfflineModeGuard>
    </RequireAuth>
  } />
  <Route path="/settings" element={
    <RequireAdmin>
      <OfflineModeGuard offlineMode="partial">
        <AdminPage />
      </OfflineModeGuard>
    </RequireAdmin>
  } />
  <Route path="/settings/oversold" element={
    <RequireAdmin>
      <OfflineModeGuard offlineMode="partial">
        <OversoldQueuePage />
      </OfflineModeGuard>
    </RequireAdmin>
  } />

  {/* blocked — list dari API, tidak ada IDB fallback */}
  <Route path="/stock-receive" element={
    <RequireAuth>
      <OfflineModeGuard offlineMode="blocked">
        <StockReceivePage />
      </OfflineModeGuard>
    </RequireAuth>
  } />
  <Route path="/stock-receive/bulk" element={
    <RequireAuth>
      <OfflineModeGuard offlineMode="blocked">
        <BulkImportPage />
      </OfflineModeGuard>
    </RequireAuth>
  } />
  <Route path="/settings/users" element={
    <RequireAdmin>
      <OfflineModeGuard offlineMode="blocked">
        <UsersAdminPage />
      </OfflineModeGuard>
    </RequireAdmin>
  } />
  <Route path="/settings/events" element={
    <RequireAdmin>
      <OfflineModeGuard offlineMode="blocked">
        <EventsAdminPage />
      </OfflineModeGuard>
    </RequireAdmin>
  } />
  <Route path="/settings/audit-log" element={
    <RequireAdmin>
      <OfflineModeGuard offlineMode="blocked">
        <AuditLogPage />
      </OfflineModeGuard>
    </RequireAdmin>
  } />
  <Route path="/settings/overrides" element={
    <RequireAdmin>
      <OfflineModeGuard offlineMode="blocked">
        <OverrideHistoryPage />
      </OfflineModeGuard>
    </RequireAdmin>
  } />

  {/* CashReconciliation — partial: kalkulasi kas dari IDB bisa tampil */}
  <Route path="/settings/cash-reconciliation" element={
    <RequireAdmin>
      <OfflineModeGuard offlineMode="partial">
        <CashReconciliationPage />
      </OfflineModeGuard>
    </RequireAdmin>
  } />

  <Route path="*" element={<Navigate to="/" replace />} />
</Routes>
```

Catatan: `CashReconciliationPage` ada di codebase tapi belum terlihat di `App.tsx` yang dibaca. Cari path route yang benar dengan `grep -r "CashReconciliation" apps/web/src/App.tsx` sebelum menambahkan `OfflineModeGuard`-nya.

- [ ] **Step 6.3: Tambahkan `NetworkModeToggle` di `MobileAppBar.tsx`**

Tambahkan import:
```ts
import { NetworkModeToggle } from "./NetworkModeToggle.js";
```

Ubah bagian `div` yang berisi `SyncDot`:
```tsx
<div className="flex items-center gap-2 ml-2 shrink-0">
  <SyncDot />
  <NetworkModeToggle />
  {right}
  {showMenu && <HamburgerMenu />}
</div>
```

- [ ] **Step 6.4: Typecheck**

```bash
pnpm --filter web typecheck
```
Expected: no errors.

- [ ] **Step 6.5: Commit**

```bash
git add apps/web/src/App.tsx apps/web/src/components/MobileAppBar.tsx
git commit -m "feat(offline): wire OfflineModeGuard to routes and add NetworkModeToggle to app bar"
```

---

## Task 7: Update `background-sync.ts` — Gunakan `effectiveIsOnline`

**Files:**
- Modify: `apps/web/src/lib/background-sync.ts`

`background-sync.ts` saat ini cek `navigator.onLine` langsung. Harus diganti dengan `effectiveIsOnline` dari store agar `force-offline` dihormati.

- [ ] **Step 7.1: Update `startBackgroundSync` dan `opportunisticSync`**

Ganti kedua fungsi tersebut:

```ts
export function startBackgroundSync() {
  if (syncInterval) return;
  syncInterval = setInterval(async () => {
    const { effectiveIsOnline } = useSyncStateStore.getState();
    if (!effectiveIsOnline) {
      useSyncStateStore.getState().setState("offline");
      return;
    }
    useSyncStateStore.getState().setState("syncing");
    try {
      await deltaSyncPull();
      useSyncStateStore.getState().markSuccess();
    } catch (err) {
      console.warn("[sync] Background sync failed:", err);
      useSyncStateStore.getState().setState(
        "error",
        err instanceof Error ? err.message : "Sinkronisasi gagal"
      );
    }
  }, 60 * 1000);
}

export function opportunisticSync() {
  const { effectiveIsOnline } = useSyncStateStore.getState();
  if (!effectiveIsOnline) {
    useSyncStateStore.getState().setState("offline");
    return;
  }
  useSyncStateStore.getState().setState("syncing");
  deltaSyncPull()
    .then(() => useSyncStateStore.getState().markSuccess())
    .catch((err) => {
      useSyncStateStore.getState().setState(
        "error",
        err instanceof Error ? err.message : "Sinkronisasi gagal"
      );
    });
}
```

- [ ] **Step 7.2: Typecheck**

```bash
pnpm --filter web typecheck
```

- [ ] **Step 7.3: Commit**

```bash
git add apps/web/src/lib/background-sync.ts
git commit -m "feat(offline): respect effectiveIsOnline in background sync"
```

---

## Task 8: Wire `useIsOnline` ke Halaman `partial`

**Files:**
- Modify: `apps/web/src/pages/InventoryPage.tsx`
- Modify: `apps/web/src/pages/ReportsPage.tsx`
- Modify: `apps/web/src/pages/AdminPage.tsx`
- Modify: `apps/web/src/pages/OversoldQueuePage.tsx`
- Modify: `apps/web/src/pages/CashReconciliationPage.tsx`

Pola yang sama untuk semua file. Tes dilakukan secara manual (tes UI/E2E di luar scope saat ini). Typecheck jadi verification utama.

- [ ] **Step 8.1: `InventoryPage.tsx`**

Tambahkan import:
```ts
import { useIsOnline } from "../hooks/use-is-online.js";
```

Di dalam komponen, tambahkan:
```ts
const isOnline = useIsOnline();
```

Temukan semua tombol edit dan return, tambahkan `disabled={!isOnline}`:
```tsx
// Contoh: tombol Edit kartu
<button
  disabled={!isOnline}
  onClick={handleEdit}
  className="... disabled:opacity-50"
>
  Edit
</button>
```

Lakukan `grep -n "onClick.*edit\|onClick.*return\|disabled" apps/web/src/pages/InventoryPage.tsx` untuk menemukan semua tombol yang perlu di-disable.

- [ ] **Step 8.2: `ReportsPage.tsx`**

Tambahkan:
```ts
import { useIsOnline } from "../hooks/use-is-online.js";
// ...
const isOnline = useIsOnline();
```

Disable tombol settlement/tutup event:
```tsx
<button disabled={!isOnline} className="... disabled:opacity-50">
  Tutup Event / Settle
</button>
```

Tab "Bulanan" dan "Settlement" tetap dapat diklik (tab navigasi tidak di-disable), tapi akan gagal saat fetch API jika offline — error sudah di-handle oleh catch yang ada di page tersebut.

- [ ] **Step 8.3: `AdminPage.tsx`**

Tambahkan `useIsOnline` dan disable semua tombol simpan:
```tsx
const isOnline = useIsOnline();
// ...
<button type="submit" disabled={!isOnline} className="... disabled:opacity-50">
  Simpan
</button>
```

- [ ] **Step 8.4: `OversoldQueuePage.tsx`**

Tambahkan `useIsOnline` dan disable tombol void:
```tsx
const isOnline = useIsOnline();
// ...
<button disabled={!isOnline} onClick={handleVoid} className="... disabled:opacity-50">
  Void
</button>
```

- [ ] **Step 8.5: `CashReconciliationPage.tsx`**

Tambahkan `useIsOnline` dan disable tombol simpan rekonsiliasi:
```tsx
const isOnline = useIsOnline();
// ...
<button disabled={!isOnline} onClick={handleSave} className="... disabled:opacity-50">
  Simpan Rekonsiliasi
</button>
```

- [ ] **Step 8.6: Typecheck semua**

```bash
pnpm --filter web typecheck
```
Expected: no errors.

- [ ] **Step 8.7: Commit**

```bash
git add apps/web/src/pages/InventoryPage.tsx apps/web/src/pages/ReportsPage.tsx apps/web/src/pages/AdminPage.tsx apps/web/src/pages/OversoldQueuePage.tsx apps/web/src/pages/CashReconciliationPage.tsx
git commit -m "feat(offline): disable write actions on partial pages when offline"
```

---

## Task 9: IDB Schema — Tambah Tabel `pending_transactions` (Dexie v3)

**Files:**
- Modify: `apps/web/src/lib/db.ts`

- [ ] **Step 9.1: Tambahkan interface `IdbPendingTransaction`**

Di `apps/web/src/lib/db.ts`, tambahkan setelah `IdbPendingPhoto`:

```ts
export interface IdbPendingTransactionItem {
  cardId: string;
  ownerUserIdSnapshot: string;
  listedPriceIdrSnapshot: number;
  intendedPriceIdr: number;
  lineDiscountIdr: number;
  lineDiscountReason?: string;
  overrideBelowBottom: boolean;
  overrideReason?: string;
  soldPriceIdr: number;
}

export interface IdbPendingTransaction {
  clientId: string;              // primary key
  cartClientId: string;
  eventId: string;
  items: IdbPendingTransactionItem[];
  subtotalIdr: number;
  discountIdr: number;
  discountReason?: string;
  totalIdr: number;
  paymentChannelId?: string;
  paymentNote?: string;
  notes?: string;
  paidAt: number;
  createdAt: number;
  createdByUserId: string;
  syncStatus: "pending" | "syncing" | "synced" | "error";
  syncError?: string;
  syncedAt?: number;
}
```

- [ ] **Step 9.2: Tambahkan tabel dan Dexie version 3**

Di `class KolektaDb`, tambahkan property:
```ts
pendingTransactions!: Table<IdbPendingTransaction>;
```

Di `constructor()`, tambahkan setelah version 2:
```ts
this.version(3).stores({
  pendingTransactions: "clientId, syncStatus",
});
```

- [ ] **Step 9.3: Typecheck**

```bash
pnpm --filter web typecheck
```

- [ ] **Step 9.4: Commit**

```bash
git add apps/web/src/lib/db.ts
git commit -m "feat(offline): add pendingTransactions IDB table (Dexie v3)"
```

---

## Task 10: API Endpoint `POST /sync/flush-pending-tx`

**Files:**
- Create: `apps/api/src/routes/flush-pending-tx.ts`
- Create: `apps/api/src/routes/flush-pending-tx.test.ts`
- Modify: `apps/api/src/server.ts`

- [ ] **Step 10.1: Tulis tes**

```ts
// apps/api/src/routes/flush-pending-tx.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Fastify from "fastify";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import bcrypt from "bcryptjs";
import * as schema from "@kolektapos/db/schema";
import { applyDrizzleMigrations } from "../test-migrations.js";

process.env.SESSION_SECRET = "test-secret-that-is-at-least-32-characters-long";

import { authRoutes } from "./auth.js";
import { flushPendingTxRoute } from "./flush-pending-tx.js";
import { sessionPlugin } from "../plugins/session.js";

let app: ReturnType<typeof Fastify>;
let sqlite: Database.Database;
let cookie: string;
let cardId: string;

beforeAll(async () => {
  sqlite = new Database(":memory:");
  applyDrizzleMigrations(sqlite);
  const db = drizzle(sqlite, { schema });

  const hash = await bcrypt.hash("pw-secret-12345", 10);
  sqlite
    .prepare("INSERT INTO users (id, email, password_hash, display_name, role) VALUES (?, ?, ?, ?, ?)")
    .run("u1", "cashier@test.com", hash, "Cashier", "cashier");

  // Insert event and card for tests
  sqlite
    .prepare("INSERT INTO events (id, name, venue, start_date, end_date, status, version) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run("ev1", "Test Event", "Venue", "2026-04-26", "2026-04-27", "active", 1);

  cardId = "10000000-0000-4000-8000-000000000001";
  sqlite
    .prepare(
      "INSERT INTO cards (id, client_id, short_id, owner_user_id, stock_received_by_user_id, title, pricing_mode, price_idr, status, oversold, version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .run(cardId, "cc1", "A-AAAAA", "u1", "u1", "Pikachu", "fixed", 50000, "available", 0, 1);

  app = Fastify({ logger: false });
  await sessionPlugin(app);
  await authRoutes(app, { db });
  await flushPendingTxRoute(app, { db });

  const login = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email: "cashier@test.com", password: "pw-secret-12345" },
  });
  cookie = login.headers["set-cookie"] as string;
});

afterAll(async () => {
  await app.close();
  sqlite.close();
});

describe("POST /sync/flush-pending-tx", () => {
  it("401 tanpa session", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/sync/flush-pending-tx",
      payload: { transactions: [] },
    });
    expect(res.statusCode).toBe(401);
  });

  it("400 jika body tidak valid", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/sync/flush-pending-tx",
      headers: { cookie },
      payload: { transactions: "bukan-array" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("berhasil flush satu transaksi offline", async () => {
    const txClientId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const res = await app.inject({
      method: "POST",
      url: "/sync/flush-pending-tx",
      headers: { cookie },
      payload: {
        transactions: [{
          clientId: txClientId,
          cartClientId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
          eventId: "ev1",
          items: [{
            cardId,
            ownerUserIdSnapshot: "u1",
            listedPriceIdrSnapshot: 50000,
            intendedPriceIdr: 50000,
            lineDiscountIdr: 0,
            overrideBelowBottom: false,
            soldPriceIdr: 50000,
          }],
          subtotalIdr: 50000,
          discountIdr: 0,
          totalIdr: 50000,
          paidAt: Math.floor(Date.now() / 1000),
        }],
      },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.results).toHaveLength(1);
    expect(body.results[0].status).toBe("accepted");
    expect(body.results[0].serverTransactionId).toBeTruthy();
  });

  it("idempotent: clientId sama menghasilkan accepted tanpa duplicate", async () => {
    const txClientId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"; // same as previous
    const res = await app.inject({
      method: "POST",
      url: "/sync/flush-pending-tx",
      headers: { cookie },
      payload: {
        transactions: [{
          clientId: txClientId,
          cartClientId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
          eventId: "ev1",
          items: [{
            cardId,
            ownerUserIdSnapshot: "u1",
            listedPriceIdrSnapshot: 50000,
            intendedPriceIdr: 50000,
            lineDiscountIdr: 0,
            overrideBelowBottom: false,
            soldPriceIdr: 50000,
          }],
          subtotalIdr: 50000,
          discountIdr: 0,
          totalIdr: 50000,
          paidAt: Math.floor(Date.now() / 1000),
        }],
      },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.results[0].status).toBe("accepted");
  });
});
```

- [ ] **Step 10.2: Jalankan tes, pastikan GAGAL**

```bash
pnpm --filter api test --run src/routes/flush-pending-tx.test.ts
```

- [ ] **Step 10.3: Buat `flush-pending-tx.ts`**

```ts
// apps/api/src/routes/flush-pending-tx.ts
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as dbSchema from "@kolektapos/db/schema";
import { cards, transactions, transactionItems } from "@kolektapos/db/schema";
import { eq, inArray } from "drizzle-orm";
import { requireAuth } from "../plugins/auth-guard.js";

type Db = BetterSQLite3Database<typeof dbSchema>;

const PendingItemSchema = z.object({
  cardId: z.string().uuid(),
  ownerUserIdSnapshot: z.string(),
  listedPriceIdrSnapshot: z.number().int(),
  intendedPriceIdr: z.number().int(),
  lineDiscountIdr: z.number().int().default(0),
  lineDiscountReason: z.string().optional(),
  overrideBelowBottom: z.boolean().default(false),
  overrideReason: z.string().optional(),
  soldPriceIdr: z.number().int(),
});

const PendingTxSchema = z.object({
  clientId: z.string().uuid(),
  cartClientId: z.string().uuid(),
  eventId: z.string(),
  items: z.array(PendingItemSchema).min(1),
  subtotalIdr: z.number().int(),
  discountIdr: z.number().int().default(0),
  discountReason: z.string().optional(),
  totalIdr: z.number().int(),
  paymentChannelId: z.string().uuid().nullable().optional(),
  paymentNote: z.string().optional(),
  notes: z.string().optional(),
  paidAt: z.number().int(),
});

const FlushBodySchema = z.object({
  transactions: z.array(PendingTxSchema).min(1),
});

export async function flushPendingTxRoute(
  app: FastifyInstance,
  opts: { db: Db }
) {
  const { db } = opts;

  app.post(
    "/sync/flush-pending-tx",
    { preHandler: requireAuth },
    async (request, reply) => {
      const parsed = FlushBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }

      const cashierUserId = request.session.userId!;
      const nowSec = Math.floor(Date.now() / 1000);
      const results: {
        clientId: string;
        status: "accepted" | "rejected";
        serverTransactionId?: string;
        reason?: string;
      }[] = [];

      for (const tx of parsed.data.transactions) {
        // Idempotency: clientId sudah ada → return existing
        const existing = db
          .select()
          .from(transactions)
          .where(eq(transactions.clientId, tx.clientId))
          .get();

        if (existing) {
          results.push({ clientId: tx.clientId, status: "accepted", serverTransactionId: existing.id });
          continue;
        }

        const txId = crypto.randomUUID();

        db.transaction(() => {
          db.insert(transactions)
            .values({
              id: txId,
              clientId: tx.clientId,
              cartId: null,
              eventId: tx.eventId,
              cashierUserId,
              kind: "sale",
              subtotalIdr: tx.subtotalIdr,
              discountIdr: tx.discountIdr,
              discountReason: tx.discountReason,
              totalIdr: tx.totalIdr,
              paymentChannelId: tx.paymentChannelId ?? null,
              paymentNote: tx.paymentNote,
              paidAt: nowSec,
              notes: tx.notes,
            })
            .run();

          for (const item of tx.items) {
            db.insert(transactionItems)
              .values({
                id: crypto.randomUUID(),
                transactionId: txId,
                cardId: item.cardId,
                ownerUserIdSnapshot: item.ownerUserIdSnapshot,
                listedPriceIdrSnapshot: item.listedPriceIdrSnapshot,
                soldPriceIdr: item.soldPriceIdr,
                lineDiscountIdr: item.lineDiscountIdr,
                lineDiscountReason: item.lineDiscountReason,
                overrideBelowBottom: item.overrideBelowBottom,
                overrideReason: item.overrideReason,
              })
              .run();
          }

          const cardIds = tx.items.map((i) => i.cardId);
          const cardRows = db
            .select()
            .from(cards)
            .where(inArray(cards.id, cardIds))
            .all();
          const cardMap = new Map(cardRows.map((c) => [c.id, c]));

          for (const cardId of cardIds) {
            const card = cardMap.get(cardId);
            db.update(cards)
              .set({
                status: "sold",
                oversold: card?.status === "sold",
                lockedByCartId: null,
                lockedByUserId: null,
                lockedAt: null,
                updatedAt: nowSec,
                version: (card?.version ?? 1) + 1,
              })
              .where(eq(cards.id, cardId))
              .run();
          }
        });

        results.push({ clientId: tx.clientId, status: "accepted", serverTransactionId: txId });
      }

      return reply.send({ results, processedAt: nowSec });
    }
  );
}
```

- [ ] **Step 10.4: Register di `server.ts`**

Tambahkan import di `server.ts`:
```ts
import { flushPendingTxRoute } from "./routes/flush-pending-tx.js";
```

Tambahkan di dalam `build()` setelah `await syncRoutes(app, { db })`:
```ts
await flushPendingTxRoute(app, { db });
```

- [ ] **Step 10.5: Jalankan tes, pastikan LULUS**

```bash
pnpm --filter api test --run src/routes/flush-pending-tx.test.ts
```

- [ ] **Step 10.6: Commit**

```bash
git add apps/api/src/routes/flush-pending-tx.ts apps/api/src/routes/flush-pending-tx.test.ts apps/api/src/server.ts
git commit -m "feat(offline): add POST /sync/flush-pending-tx endpoint"
```

---

## Task 11: Tambah `flushPendingTransactions` ke `background-sync.ts` + Update `api.ts` dan `SyncDot`

**Files:**
- Modify: `apps/web/src/lib/api.ts`
- Modify: `apps/web/src/lib/background-sync.ts`
- Modify: `apps/web/src/components/SyncDot.tsx`

- [ ] **Step 11.1: Tambah `api.sync.flushPendingTx` di `api.ts`**

Di blok `sync:` di `api.ts`, tambahkan:
```ts
sync: {
  pull: (cursor: number, deviceId: string) =>
    request<unknown>(`/sync/pull?cursor=${cursor}&deviceId=${encodeURIComponent(deviceId)}`),
  push: (ops: unknown[], deviceId: string) =>
    request<unknown>("/sync/push", {
      method: "POST",
      body: JSON.stringify({ ops, deviceId }),
    }),
  flushPendingTx: (pendingTxs: unknown[]) =>
    request<{
      results: { clientId: string; status: "accepted" | "rejected"; serverTransactionId?: string; reason?: string }[];
      processedAt: number;
    }>("/sync/flush-pending-tx", {
      method: "POST",
      body: JSON.stringify({ transactions: pendingTxs }),
    }),
},
```

- [ ] **Step 11.2: Tambah `flushPendingTransactions()` di `background-sync.ts`**

Tambahkan import `idb` dan fungsi baru:
```ts
import { idb } from "./db.js";

export async function flushPendingTransactions(): Promise<void> {
  const pending = await idb.pendingTransactions
    .where("syncStatus")
    .equals("pending")
    .toArray();

  if (pending.length === 0) return;

  await Promise.all(
    pending.map((tx) =>
      idb.pendingTransactions.update(tx.clientId, { syncStatus: "syncing" })
    )
  );

  const response = await api.sync.flushPendingTx(pending);

  for (const result of response.results) {
    if (result.status === "accepted") {
      await idb.pendingTransactions.update(result.clientId, {
        syncStatus: "synced",
        syncedAt: Date.now(),
      });
    } else {
      await idb.pendingTransactions.update(result.clientId, {
        syncStatus: "error",
        syncError: result.reason,
      });
    }
  }

  const stillPending = await idb.pendingTransactions
    .where("syncStatus")
    .equals("pending")
    .count();
  useSyncStateStore.getState().setPendingTransactionCount(stillPending);
}
```

Di dalam `startBackgroundSync`, panggil flush sebelum deltaSyncPull:
```ts
syncInterval = setInterval(async () => {
  const { effectiveIsOnline } = useSyncStateStore.getState();
  if (!effectiveIsOnline) {
    useSyncStateStore.getState().setState("offline");
    return;
  }
  useSyncStateStore.getState().setState("syncing");
  try {
    await flushPendingTransactions();  // ← tambahkan ini
    await deltaSyncPull();
    useSyncStateStore.getState().markSuccess();
  } catch (err) {
    console.warn("[sync] Background sync failed:", err);
    useSyncStateStore.getState().setState(
      "error",
      err instanceof Error ? err.message : "Sinkronisasi gagal"
    );
  }
}, 60 * 1000);
```

Lakukan hal yang sama di `opportunisticSync()`:
```ts
export function opportunisticSync() {
  const { effectiveIsOnline } = useSyncStateStore.getState();
  if (!effectiveIsOnline) {
    useSyncStateStore.getState().setState("offline");
    return;
  }
  useSyncStateStore.getState().setState("syncing");
  flushPendingTransactions()
    .then(() => deltaSyncPull())
    .then(() => useSyncStateStore.getState().markSuccess())
    .catch((err) => {
      useSyncStateStore.getState().setState(
        "error",
        err instanceof Error ? err.message : "Sinkronisasi gagal"
      );
    });
}
```

- [ ] **Step 11.3: Update `SyncDot.tsx` — tampilkan badge pending**

Tambahkan di `SyncDot`:
```tsx
const pendingCount = useSyncStateStore((s) => s.pendingTransactionCount);

// Di dalam return, setelah label:
{pendingCount > 0 && (
  <span
    className="text-[11px] font-extrabold"
    style={{ color }}
    aria-label={`${pendingCount} transaksi menunggu sinkronisasi`}
  >
    ({pendingCount})
  </span>
)}
```

- [ ] **Step 11.4: Typecheck**

```bash
pnpm --filter web typecheck
```

- [ ] **Step 11.5: Commit**

```bash
git add apps/web/src/lib/api.ts apps/web/src/lib/background-sync.ts apps/web/src/components/SyncDot.tsx
git commit -m "feat(offline): flush pending transactions on sync + show pending count in SyncDot"
```

---

## Task 12: Refaktor POSPage — Offline Cart & Payment Queue

**Files:**
- Modify: `apps/web/src/store/pos.ts`
- Modify: `apps/web/src/pages/POSPage.tsx`

Ini task terbesar dan paling kritis. Baca seluruh task sebelum mulai.

- [ ] **Step 12.1: Tambah `activeCartIsOffline` ke `pos.ts`**

```ts
// apps/web/src/store/pos.ts
import { create } from "zustand";
import type { IdbCard } from "../lib/db.js";

interface PosState {
  activeCartId: string | null;
  activeCartIsOffline: boolean;
  scannedCard: IdbCard | null;
  setActiveCartId: (id: string | null) => void;
  setActiveCartIsOffline: (v: boolean) => void;
  setScannedCard: (card: IdbCard | null) => void;
}

export const usePosStore = create<PosState>()((set) => ({
  activeCartId: null,
  activeCartIsOffline: false,
  scannedCard: null,
  setActiveCartId: (id) => set({ activeCartId: id }),
  setActiveCartIsOffline: (activeCartIsOffline) => set({ activeCartIsOffline }),
  setScannedCard: (card) => set({ scannedCard: card }),
}));
```

- [ ] **Step 12.2: Tambahkan import dan state baru di `POSPage.tsx`**

Tambahkan import di atas file:
```ts
import { useIsOnline } from "../hooks/use-is-online.js";
import { useSyncStateStore } from "../store/sync-state.js";
import type { IdbPendingTransactionItem } from "../lib/db.js";
```

Di dalam komponen utama `POSPage`, tambahkan:
```ts
const isOnline = useIsOnline();
const { activeCartIsOffline, setActiveCartIsOffline } = usePosStore();
```

- [ ] **Step 12.3: Refaktor `ensureCart()`**

Ganti seluruh fungsi `ensureCart`:

```ts
async function ensureCart(): Promise<string> {
  if (activeCartId) return activeCartId;
  const activeEvent = await idb.events.filter((ev) => ev.status === "active").first();
  if (!activeEvent) throw new Error("Tidak ada event aktif.");
  const clientId = uuidv4();

  if (isOnline) {
    const response = (await api.carts.create({ clientId, eventId: activeEvent.id })) as { id: string };
    const cartId = response.id;
    await idb.carts.put({
      id: cartId, clientId,
      cashierUserId: user!.id,
      eventId: activeEvent.id,
      status: "draft",
      lastActivityAt: nowSec(),
      version: 1,
    });
    setActiveCartId(cartId);
    setActiveCartIsOffline(false);
    return cartId;
  } else {
    // Offline: gunakan clientId sebagai cart ID (tidak ada server ID)
    await idb.carts.put({
      id: clientId, clientId,
      cashierUserId: user!.id,
      eventId: activeEvent.id,
      status: "draft",
      lastActivityAt: nowSec(),
      version: 1,
    });
    setActiveCartId(clientId);
    setActiveCartIsOffline(true);
    return clientId;
  }
}
```

- [ ] **Step 12.4: Refaktor `handleAddToCart()` — skip API call saat offline**

Di dalam `handleAddToCart`, bagian setelah kalkulasi harga, ubah:

```ts
// Ganti:
// const response = (await api.carts.addItem(cartId, { ... })) as { item: { id: string } };
// const newItem: IdbCartItem = { id: response.item.id, ... };

// Menjadi:
let newItemId: string;
if (isOnline && !activeCartIsOffline) {
  const response = (await api.carts.addItem(cartId, {
    cardId: scannedCard.id, intendedPriceIdr, lineDiscountIdr, lineDiscountPct, requiresAdminOverride,
  })) as { item: { id: string } };
  newItemId = response.item.id;
} else {
  newItemId = uuidv4();
}

const newItem: IdbCartItem = {
  id: newItemId,
  cartId,
  cardId: scannedCard.id,
  intendedPriceIdr,
  lineDiscountIdr,
  lineDiscountPct,
  requiresAdminOverride,
};
```

- [ ] **Step 12.5: Refaktor `handlePay()` — offline queue path**

Ganti seluruh fungsi `handlePay`:

```ts
async function handlePay(
  channelId: string,
  discountIdr: number,
  discountReason: string,
  notes: string
) {
  if (!activeCartId) throw new Error("Tidak ada keranjang aktif.");

  const subtotalIdr = cartItems.reduce(
    (sum, item) => sum + (item.intendedPriceIdr - item.lineDiscountIdr),
    0
  );
  const finalTotalIdr = Math.max(0, subtotalIdr - discountIdr);

  if (isOnline && !activeCartIsOffline) {
    // ── Online path: alur existing ───────────────────────────────────────
    const response = (await api.carts.pay(activeCartId, {
      paymentChannelId: channelId,
      transactionClientId: uuidv4(),
      discountIdr: discountIdr || undefined,
      discountReason: discountReason || undefined,
      notes: notes || undefined,
    })) as { transaction: { id: string }; receipt: unknown[] };

    const txId = response.transaction.id;
    await idb.carts.update(activeCartId, { status: "paid", paidTransactionId: txId });
    await Promise.all(
      cartItems.map((item) =>
        idb.cards.update(item.cardId, {
          status: "sold",
          lockedByCartId: undefined,
          lockedByUserId: undefined,
          lockedAt: undefined,
        })
      )
    );
    setShowPayModal(false);
    setReceipt({
      transactionId: txId,
      totalIdr: finalTotalIdr,
      itemCount: cartItems.length,
      isPendingSync: false,
    });
  } else {
    // ── Offline path: simpan ke pending queue ────────────────────────────
    const txClientId = uuidv4();
    const activeEvent = await idb.events.filter((ev) => ev.status === "active").first();

    const pendingItems: IdbPendingTransactionItem[] = cartItems.map((item) => {
      const card = cartCards[item.cardId];
      const listedPriceIdrSnapshot =
        card?.pricingMode === "fixed"
          ? (card.priceIdr ?? 0)
          : (card?.listedPriceIdr ?? 0);
      return {
        cardId: item.cardId,
        ownerUserIdSnapshot: card?.ownerUserId ?? "",
        listedPriceIdrSnapshot,
        intendedPriceIdr: item.intendedPriceIdr,
        lineDiscountIdr: item.lineDiscountIdr,
        lineDiscountReason: item.lineDiscountReason,
        overrideBelowBottom: item.requiresAdminOverride,
        overrideReason: item.overrideReason,
        soldPriceIdr: item.intendedPriceIdr - item.lineDiscountIdr,
      };
    });

    await idb.pendingTransactions.put({
      clientId: txClientId,
      cartClientId: activeCartId,
      eventId: activeEvent?.id ?? "",
      items: pendingItems,
      subtotalIdr,
      discountIdr: discountIdr || 0,
      discountReason: discountReason || undefined,
      totalIdr: finalTotalIdr,
      paymentChannelId: channelId || undefined,
      notes: notes || undefined,
      paidAt: nowSec(),
      createdAt: nowSec(),
      createdByUserId: user!.id,
      syncStatus: "pending",
    });

    await idb.carts.update(activeCartId, { status: "paid", paidTransactionId: txClientId });
    await Promise.all(
      cartItems.map((item) =>
        idb.cards.update(item.cardId, {
          status: "sold",
          lockedByCartId: undefined,
          lockedByUserId: undefined,
          lockedAt: undefined,
        })
      )
    );

    const pendingCount = await idb.pendingTransactions
      .where("syncStatus")
      .equals("pending")
      .count();
    useSyncStateStore.getState().setPendingTransactionCount(pendingCount);

    setShowPayModal(false);
    setReceipt({
      transactionId: txClientId,
      totalIdr: finalTotalIdr,
      itemCount: cartItems.length,
      isPendingSync: true,
    });
  }
}
```

- [ ] **Step 12.6: Update `handleReceiptDone()` — reset `activeCartIsOffline`**

Tambahkan `setActiveCartIsOffline(false)` di dalam `handleReceiptDone`:
```ts
function handleReceiptDone() {
  setReceipt(null);
  setActiveCartId(null);
  setActiveCartIsOffline(false);  // ← tambahkan ini
  setScannedCard(null);
  setCartItems([]);
  setCartCards({});
  setScanError(null);
  setAddError(null);
  setFinalPriceInput("");
  setBelowBottomError(false);
  refocusScan();
}
```

- [ ] **Step 12.7: Update state `receipt` dan `ReceiptModal`**

State `receipt` perlu tambah field `isPendingSync`. Cari deklarasi state `receipt` dan ubah type-nya:
```ts
const [receipt, setReceipt] = useState<{
  transactionId: string;
  totalIdr: number;
  itemCount: number;
  isPendingSync: boolean;
} | null>(null);
```

Di `ReceiptModal`, tambahkan prop `isPendingSync: boolean` dan tampilkan catatan jika true:

Cari interface `ReceiptModalProps` dan tambahkan:
```ts
interface ReceiptModalProps {
  transactionId: string;
  totalIdr: number;
  itemCount: number;
  isPendingSync: boolean;  // ← tambahkan
  onDone: () => void;
}
```

Di dalam `ReceiptModal`, tambahkan sebelum tombol Selesai:
```tsx
{isPendingSync && (
  <div className="text-xs text-warning font-medium text-center px-4 pb-2">
    Tersimpan lokal — akan disinkronkan saat kembali online.
  </div>
)}
```

- [ ] **Step 12.8: Typecheck**

```bash
pnpm --filter web typecheck
```
Expected: no errors.

- [ ] **Step 12.9: Commit**

```bash
git add apps/web/src/store/pos.ts apps/web/src/pages/POSPage.tsx
git commit -m "feat(offline): POS offline cart and payment queue — full alur kasir tanpa jaringan"
```

---

## Task 13: Verifikasi Akhir

- [ ] **Step 13.1: Jalankan semua tes web**

```bash
pnpm --filter web test --run
```
Expected: semua PASS.

- [ ] **Step 13.2: Jalankan semua tes API**

```bash
pnpm --filter api test --run
```
Expected: semua PASS.

- [ ] **Step 13.3: Typecheck monorepo**

```bash
pnpm typecheck
```
Expected: no errors.

- [ ] **Step 13.4: Build production**

```bash
pnpm build
```
Expected: build sukses tanpa error.

- [ ] **Step 13.5: Smoke test manual**

Dengan dev server running (`pnpm dev`):
1. Buka DevTools → Network → set "Offline"
2. Navigasi ke `/inventory` → pastikan banner amber muncul, tombol Edit disabled
3. Navigasi ke `/stock-receive` → pastikan blocked state muncul
4. Navigasi ke `/pos` → scan kartu → tambah ke cart → bayar → struk muncul dengan catatan "Tersimpan lokal"
5. Set Network kembali online → SyncDot harus tunjukkan pending count, lalu sync
6. Cek DevTools Network tab: `POST /sync/flush-pending-tx` muncul setelah kembali online
7. Toggle `NetworkModeToggle` ke "Mode Offline" → semua halaman `partial` harus tampilkan banner
8. Toggle kembali ke "Auto" → banner hilang

- [ ] **Step 13.6: Commit final jika ada perbaikan**

```bash
git add -A
git commit -m "feat(offline): finalize offline/online mode — all tests pass"
```
