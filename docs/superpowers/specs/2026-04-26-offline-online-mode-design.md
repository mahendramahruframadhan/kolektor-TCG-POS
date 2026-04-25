# Offline/Online Mode — Design Spec

**Date:** 2026-04-26
**Status:** Draft — awaiting user approval

---

## 1. Ringkasan

KolektaPOS adalah aplikasi local-first PWA. Saat ini belum ada penanganan eksplisit
untuk status offline di level UI — modul yang bergantung pada API akan gagal diam-diam
atau loading tanpa batas saat jaringan tidak tersedia.

Fitur ini memperkenalkan:

1. **Klasifikasi modul** — setiap halaman diberi tier `safe | partial | blocked`
   berdasarkan kemampuan offline aktualnya di codebase saat ini.
2. **UI gate** — route wrapper otomatis menampilkan banner atau empty state offline
   sesuai tier, tanpa mengubah setiap file halaman satu per satu.
3. **Network mode toggle** — user dapat memilih `auto` (ikuti OS) atau `force-offline`
   (paksa offline meski jaringan ada), visible di app bar untuk semua user.
4. **POS offline queue** — POSPage direfaktor agar seluruh alur kasir (buka cart,
   scan, bayar) dapat dilakukan tanpa jaringan; transaksi disimpan ke IDB dan
   disinkronkan ke server saat kembali online.

---

## 2. Keputusan Desain

| Keputusan | Pilihan | Alasan |
|-----------|---------|--------|
| Perilaku offline | **Soft block** — read-only, write disabled | Hard block terlalu frustratif; data IDB tetap bisa ditampilkan |
| Scope UI gate | **UI-only** — tidak ada IDB caching baru | Scope cukup untuk sebagian besar modul; POS adalah satu-satunya exception |
| Arsitektur gate | **Route metadata + shared components** | DRY: halaman `blocked` tidak perlu disentuh; halaman `partial` tambah satu hook |
| Network mode | **`auto` dan `force-offline`** | `force-online` tidak berguna saat jaringan mati |
| Oversell offline | **Diterima sebagai trade-off** | Dua device offline bisa jual kartu sama; flagged di OversoldQueue |

---

## 3. Klasifikasi Modul

### `safe` — Berfungsi penuh offline, tidak ada perubahan

| Halaman | Alasan |
|---------|--------|
| LandingPage | Statis, tidak ada network call |
| DocsPage | Konten hardcoded |
| DashboardPage | Semua data dari IDB |
| TransactionDetailPage | Sudah ada fallback API → IDB |
| ProfilePage | Semua kalkulasi dari IDB |
| QRLabelPage | Client-side penuh, QR di-generate lokal |
| MyPayoutPage | Semua kalkulasi dari IDB |
| POSPage | Setelah offline queue diimplementasi (§6) |

### `partial` — Data IDB tampil, aksi write di-disable saat offline

| Halaman | Yang tetap tampil | Yang di-disable |
|---------|------------------|-----------------|
| InventoryPage | Daftar kartu dari IDB | Tombol Edit, Return |
| ReportsPage | Tab Harian & Inventori | Tab Bulanan, Settlement, tombol Tutup Event |
| AdminPage | Setting tersimpan di IDB | Semua tombol Simpan |
| OversoldQueuePage | Daftar kartu oversold dari IDB | Tombol Void |
| CashReconciliationPage | Kalkulasi kas dari transaksi IDB | Tombol Simpan, list history rekonsiliasi |

### `blocked` — Tidak ada data IDB; offline banner + empty state

| Halaman | Alasan |
|---------|--------|
| LoginPage | Autentikasi wajib online |
| StockReceivePage | Pembuatan kartu + foto butuh server |
| BulkImportPage | Batch import butuh API |
| EventsAdminPage | List events langsung dari API, tidak ada IDB |
| UsersAdminPage | List users langsung dari API, tidak ada IDB |
| AuditLogPage | Read-only tapi API-only, tidak ada IDB |
| OverrideHistoryPage | Read-only tapi API-only, tidak ada IDB |

---

## 4. Network Mode State

### Dua mode

| Mode | Artinya | Kapan dipakai |
|------|---------|---------------|
| `auto` | Ikuti `navigator.onLine` + OS events | Default |
| `force-offline` | Paksa anggap offline meski jaringan tersedia | Venue WiFi tidak stabil; ingin semua transaksi antre lokal |

### Formula efektif

```ts
effectiveIsOnline = networkMode === 'force-offline' ? false : actualIsOnline
```

Seluruh aplikasi hanya membaca `effectiveIsOnline`. Tidak perlu tahu apakah
offline karena jaringan mati atau karena user memaksa.

### Penyimpanan state

- `networkMode` disimpan di **localStorage** (per device, persists antar sesi)
- Diintegrasikan ke `sync-state.ts` (Zustand store yang sudah ada)
- Saat `force-offline`: background sync **tidak berjalan** (tidak ada gunanya)

---

## 5. Arsitektur Implementasi

### 5.1 Perubahan `sync-state.ts`

Tambahkan ke Zustand store yang sudah ada:

```ts
interface SyncState {
  // ... existing fields ...
  networkMode: 'auto' | 'force-offline'
  effectiveIsOnline: boolean             // computed
  setNetworkMode: (mode: 'auto' | 'force-offline') => void
}
```

`effectiveIsOnline` di-compute ulang setiap kali `networkMode` atau
`actualIsOnline` berubah. Nilai `networkMode` di-persist ke localStorage
via Zustand `persist` middleware.

### 5.2 Route config

Tambahkan field `offlineMode` ke definisi setiap route:

```ts
type OfflineMode = 'safe' | 'partial' | 'blocked'

interface AppRoute {
  path: string
  component: React.ComponentType
  offlineMode: OfflineMode
  // ... existing fields ...
}
```

### 5.3 `OfflineModeGuard` — route wrapper

Komponen wrapper yang dibaca oleh router. Logikanya:

```
if (!effectiveIsOnline && offlineMode === 'blocked')
  → render <OfflineBlockedState>
else if (!effectiveIsOnline && offlineMode === 'partial')
  → render <OfflineBanner> + <PageComponent>
else
  → render <PageComponent> saja
```

Wrapper ini tidak menyentuh file halaman apapun. Halaman `blocked` tidak
perlu dimodifikasi sama sekali.

### 5.4 `useIsOnline()` hook

```ts
// Hanya baca effectiveIsOnline dari Zustand store
export function useIsOnline(): boolean
```

Dipakai di halaman `partial` untuk disable tombol write:

```tsx
const isOnline = useIsOnline()
// ...
<Button disabled={!isOnline}>Simpan</Button>
```

### 5.5 Komponen baru

**`<OfflineBanner>`**
- Banner amber di bagian atas halaman `partial` saat offline
- Teks: _"Anda sedang offline. Perubahan tidak dapat disimpan."_
- Tidak menggantikan konten halaman — hanya ditambahkan di atas

**`<OfflineBlockedState>`**
- Menggantikan seluruh konten halaman `blocked` saat offline
- Teks: _"Halaman ini memerlukan koneksi internet."_
- Tampilkan icon (misal: cloud dengan tanda silang)

**`<NetworkModeToggle>`**
- Ditempatkan di app bar, di sebelah `SyncDot` yang sudah ada
- Saat `auto`: tombol `🌐 Auto` (warna netral)
- Saat `force-offline`: tombol `✈ Offline` (warna amber)
- Dropdown dengan dua opsi:
  - `✓ Auto` — ikuti jaringan
  - `Mode Offline` — paksa offline

---

## 6. POS Offline Queue

Ini adalah satu-satunya modul yang memerlukan perubahan infrastruktur
(bukan hanya UI gate).

### 6.1 Prinsip

Seluruh alur kasir (buka cart → scan → tambah item → bayar) ditulis ke IDB
terlebih dahulu. Server adalah _eventual destination_, bukan _gate_. Ini
sejalan dengan arsitektur local-first yang sudah ada.

### 6.2 Tabel IDB baru: `pending_transactions`

```ts
interface PendingTransaction {
  client_id: string              // UUID, primary key
  cart_client_id: string         // UUID cart lokal
  event_id: string
  items: {
    card_client_id: string
    card_short_id: string
    card_title: string
    price: number                // IDR integer
    bottom_price: number         // snapshot saat transaksi
    owner_user_id: string        // snapshot, tidak berubah
    discount_type: 'pct' | 'fixed' | null
    discount_value: number
    final_price: number
  }[]
  payment_method: string
  amount_paid: number
  change: number
  notes: string
  transaction_discount_type: 'pct' | 'fixed' | null
  transaction_discount_value: number
  created_at: string             // ISO timestamp (client clock)
  created_by_user_id: string
  sync_status: 'pending' | 'syncing' | 'synced' | 'error'
  sync_error?: string
  synced_at?: string
}
```

### 6.3 Alur saat offline

```
Kasir tekan "Bayar"
  │
  ├─ Tulis PendingTransaction ke IDB (sync_status: 'pending')
  ├─ Update status kartu di IDB → 'sold'
  ├─ Hapus cart dari IDB
  └─ Tampilkan struk sukses
       dengan catatan: "Tersimpan lokal — akan disinkronkan saat online"
```

Kasir mendapat konfirmasi instan. Tidak ada spinner menunggu server.

### 6.4 Alur sync saat kembali online

Background sync (yang sudah ada di `background-sync.ts`) diperluas:

```
Deteksi online (auto) atau toggle kembali ke auto
  │
  ├─ Ambil semua PendingTransaction dengan sync_status: 'pending'
  ├─ Untuk setiap transaksi:
  │   ├─ POST ke /api/sync/flush-pending-tx
  │   ├─ Server memproses:
  │   │   ├─ Sukses → update sync_status: 'synced', simpan server_id
  │   │   └─ Konflik (kartu sudah terjual) → flagged oversold di server
  │   │       → muncul di OversoldQueuePage
  │   └─ Error jaringan → sync_status: 'error', retry pada siklus berikutnya
  └─ Setelah semua selesai: tarik delta-sync normal
```

### 6.5 Indikator di UI

- **SyncDot** diperluas: jika ada pending transactions, tampilkan badge angka
  (misal: `↻ 3`)
- **Struk setelah bayar offline**: footer kecil _"Disimpan lokal — menunggu sinkronisasi"_
- **Setelah berhasil sync**: notifikasi singkat _"3 transaksi berhasil disinkronkan"_

### 6.6 Trade-off yang diterima

- Dua cashier di dua device offline bisa menjual kartu yang sama → **oversell**
- Keduanya mendapat konfirmasi sukses secara lokal
- Setelah sync: server flag kartu sebagai `oversold`, muncul di OversoldQueuePage
  untuk penanganan manual (void/refund)
- Ini adalah risiko yang sudah ada dan **diterima secara eksplisit**

---

## 7. Endpoint API Baru yang Dibutuhkan

| Endpoint | Method | Deskripsi |
|----------|--------|-----------|
| `/api/sync/flush-pending-tx` | `POST` | Menerima array `PendingTransaction` dari client, memproses satu per satu, mengembalikan hasil per item (sukses / oversell / error). Idempotent via `client_id`. |

---

## 8. Di Luar Scope

- Menambahkan IDB caching untuk modul `blocked` (EventsAdmin, UsersAdmin, dll)
- Offline queue untuk StockReceive atau BulkImport
- Cart locking lintas device saat offline
- Conflict resolution otomatis untuk oversell
