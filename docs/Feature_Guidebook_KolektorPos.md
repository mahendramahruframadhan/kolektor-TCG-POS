# GUIDEBOOK FITUR KolektorPosTCG

## DAFTAR ISI

1. [Authentication](#1-authentication)
2. [Dashboard](#2-dashboard)
3. [Stock-Receive (Input Kartu)](#3-stock-receive--input-kartu)
4. [Scan & Find Card](#4-scan--find-card)
5. [Cart Management](#5-cart-management)
6. [Payment & Checkout](#6-payment--checkout)
7. [Transactions](#7-transactions)
8. [Reports](#8-reports)
9. [User Management](#9-user-management)
10. [Event Management](#10-event-management)
11. [Inventory](#11-inventory)
12. [Settings](#12-settings)
13. [Oversold Queue](#13-oversold-queue)
14. [Audit Log](#14-audit-log)
15. [Backup](#15-backup)
16. [Offline Mode](#16-offline-mode)

---

## 1. AUTHENTICATION

### Deskripsi
Fitur untuk login dan logout user, serta change password.

### Akses
- **URL:** `/login`
- **Role:** Semua user (Admin, Cashier)

### Langkah Login

```
1. Buka browser ke http://localhost:5173/login
2. Masukkan Email
   - Contoh: admin@kolekta.id
3. Masukkan Password
   - Contoh: admin123
4. Klik tombol "Masuk" / "Login"
5. Jika berhasil → redirect ke /dashboard
   Jika gagal → tampil error "Email atau password salah"
```

### Informasi Kredensial Default

| Role | Email Default | Password |
|------|---------------|----------|
| Admin | admin@kolekta.id | (sesuai .env ADMIN_PASSWORD) |

### Langkah Change Password

```
1. Login sebagai user
2. Buka /settings atau /profile
3. Klik "Ganti Password"
4. Masukkan password saat ini
5. Masukkan password baru (min 8 karakter)
6. Konfirmasi password baru
7. Klik "Simpan"
8. Jika berhasil → notifikasi "Password berhasil diubah"
   Jika gagal → tampil error
```

### Logout

```
1. Klik menu logout / keluar
2. Session dihapus
3. Redirect ke /login
```

### Catatan
- Session aktif 30 hari (rolling)
- Max 20x percobaan login per menit

---

## 2. DASHBOARD

### Deskripsi
Halaman utama setelah login, menampilkan ringkasan aktivitas.

### Akses
- **URL:** `/dashboard`
- **Role:** Admin, Cashier

### Komponen Dashboard

```
┌─────────────────────────────────────────┐
│           DASHBOARD                    │
├─────────────────────────────────────────┤
│ [Header: Nama User + Role]              │
│ [Online/Offline Status]                │
├─────────────────────────────────────────┤
│ ┌───────────┐ ┌───────────┐           │
│ │ Hari Ini │ │ Minggu Ini│           │
│ │ Rp XXX   │ │ Rp XXX   │           │
│ │ Penjualan│ │ Penjualan│           │
│ └───────────┘ └───────────┘           │
├─────────────────────────────────────────┤
│ TRANSAKSI TERAKHIR                      │
│ - Jumlah transaksi                     │
│ - Total penjualan                      │
├─────────────────────────────────────────┤
│ AKTIF EVENT                             │
│ - Nama event                            │
│ - Tanggal                               │
│ - Status                                │
├─────────────────────────────────────────┤
│ QUICK ACTIONS                           │
│ - Scan Kartu                           │
│ - Tambah Inventory                    │
│ - Lihat Laporan                        │
└─────────────────────────────────────────┘
```

### Informasi yang Ditampilkan
- Total penjualan hari ini
- Total penjualan minggu ini
- Jumlah transaksi
- Event aktif
- Quick action buttons

---

## 3. STOCK-RECEIVE (INPUT KARTU)

### Deskripsi
Fitur untuk menambahkan kartu baru ke inventory.

### Akses
- **URL:** `/inventory` → Klik "Tambah" atau `/stock-receive`
- **Role:** Admin, Cashier

### Jenis Input

#### A. Fixed Price (Harga Tetap)
```
Kartu dijual dengan harga tetap, tidak bisa nego.
```

#### B. Negotiable (Bisa Nego)
```
Kartu dengan floor price (bottom) dan listed price (tampilan).
```

### Langkah Tambah Kartu

```
1. Buka /inventory atau /stock-receive
2. Klik tombol "Tambah Kartu" / "+"
3. Isi form input:

   ┌────────────────────────────────────┐
   │     FORM INPUT KARTU               │
   ├────────────────────────────────────┤
   │ Owner: [Pilih Owner dari list]    │
   │ Nama Kartu: [input text]          │
   │ Kondisi: [Pilih]                 │
   │   ├ Mint                         │
   │   ├ Near Mint (NM)              │
   │   ├ Lightly Played (LP)         │
   │   ├ Played (P)                 │
   │   └ Damaged (D)                 │
   │ Kategori: [Pilih]               │
   │   ├ Magic: The Gathering       │
   │   ├ Pokemon                   │
   │   ├ Yu-Gi-Oh!                  │
   │   └ Lainnya                    │
   │ Jenis Harga:                   │
   │   ├ [ ] Fixed Price           │
   │   └ [ ] Negotiable            │
   └────────────────────────────────────┘

4. JIKA Fixed Price:
   - Masukkan Price (IDR)
   - Contoh: 50000

5. JIKA Negotiable:
   - Masukkan Bottom Price (harga MINIMAL)
     Contoh: 30000
   - Masukkan Listed Price (harga TAMPILAN)
     Contoh: 50000

6. JIKA ingin tambahkan foto (opsional):
   - Klik "Upload Foto"
   - Pilih file gambar

7. Klik "Simpan" / "Save"

8. Sistem generate:
   - Card ID: O-XXXXX (format short ID)
   - QR Code otomatis

9. Jika berhasil:
   - Notifikasi "Kartu berhasil ditambahkan"
   - Redirect ke /inventory
   - Kartu muncul di list

10. Jika gagal:
    - Tampil error message
```

### Detail Field Input

| Field | Wajib | Keterangan |
|-------|-------|------------|
| Owner | Ya | pilih user yang memiliki kartu |
| Nama Kartu | Ya | Nama lengkap kartu |
| Kondisi | Ya | Kondisi fisik kartu |
| Kategori | Ya | Jenis TCG |
| Jenis Harga | Ya | Fixed atau Negotiable |
| Price (Fixed) | Ya (jika Fixed) | Harga dalam IDR |
| Bottom Price | Ya (jika Negotiable) | Harga minimal yang diterima |
| Listed Price | Ya (jika Negotiable) | Harga yang ditampilkan |
| Foto | Tidak | Upload foto kartu |

### Catatan Penting
- **Bottom Price** adalah floor - kasir TIDAK BISA jual di bawah harga ini
- Short ID format: `O-XXXXX` (O = Owner initial + 5 random chars)
- QR Code di-generate otomatis untuk print

---

## 4. SCAN & FIND CARD

### Deskripsi
Fitur untuk menemukan kartu melalui scan QR/barcode atau pencarian manual.

### Akses
- **URL:** `/scan`
- **Role:** Admin, Cashier

### Cara Scan

#### A. Scan dengan Kamera
```
1. Buka /scan
2. Izinkan akses kamera jika diminta
3. Arahkan kamera ke QR code / barcode kartu
4. Sistem otomatis deteksi dan cari kartu
5. Jika ditemukan → tampil detail kartu
   Jika tidak → pesan "Kartu tidak ditemukan"
```

#### B. Scan dengan USB Scanner
```
1. Buka /scan
2. Pastikan USB scanner terhubung
3. Scan (tekan tombol di scanner)
4. Card ID / barcode masuk otomatis
5. Sistem cari kartu
6. Jika ditemukan → tampil detail kartu
   Jika tidak → pesan "Kartu tidak ditemukan"
```

#### C. Input Manual
```
1. Buka /scan
2. Klik input field
3. Masukkan Card ID (contoh: O-XXXXX)
4. Tekan Enter / Search
5. Jika ditemukan → tampil detail kartu
   Jika tidak → pesan "Kartu tidak ditemukan"
```

### Tampilan Hasil Scan

```
┌─────────────────────────────────────────┐
│           DETAIL KARTU                 │
├─────────────────────────────────────────┤
│ Card ID: O-12345                       │
├─────────────────────────────────────────┤
│ Nama: Black Lotus                     │
│ Kondisi: Mint                         │
│ Kategori: Magic: The Gathering       │
├─────────────────────────────────────────┤
│ Owner: Revota                         │
├─────────────────────────────────────────┤
│ Harga:                                │
│   Bottom: Rp 30.000                  │
│   Listed: Rp 50.000                  │
├─────────────────────────────────────────┤
│ Status: Tersedia / Di Cart / Terjual   │
├─────────────────────────────────────────┤
│ [Tambah ke Cart]  [Edit]  [Batal]     │
└─────────────────────────────────────────┘
```

### Tombol Aksi

| Tombol | Fungsi |
|-------|--------|
| Tambah ke Cart | Masukkan kartu ke keranjang |
| Edit | Edit informasi kartu (Admin only) |
| Batal | Kembali ke scan |

### Catatan
- Jika kartu sudah di cart oleh kasir lain → tampil warning
- Jika kartu sudah terjual → tampil info dan tidak bisa add to cart

---

## 5. CART MANAGEMENT

### Deskripsi
Fitur untuk mengelola keranjang belanja.

### Akses
- **URL:** `/cart`
- **Role:** Admin, Cashier

### Lihat Cart

```
1. Buka /cart
2. Tampil list kartu di cart:

   ┌─────────────────────────────────────────┐
   │           MY CART                      │
   ├─────────────────────────────────────────┤
   │ Item: 3 kartu                         │
   ├─────────────────────────────────────────┤
   │ ┌─────────────────────────────────┐   │
   │ │ [ ] O-12345 Black Lotus        Rp 50.000│
   │ │    Owner: Revota              [X]  │
   │ └─────────────────────────────────┘   │
   │ ┌─────────────────────────────────┐   │
   │ │ [ ] O-12346 Lightning Bolt    Rp 25.000│
   │ │    Owner: Budi                [X]  │
   │ └─────────────────────────────────┘   │
   │ ┌───────────────────────────��─��───┐   │
   │ │ [ ] O-12347 Dark Magician     Rp 75.000│
   │ │    Owner: Toni                 [X]  │
   │ └─────────────────────────────────┘   │
   ├─────────────────────────────────────────┤
   │ Subtotal: Rp 150.000                   │
   │ Diskon: Rp 0                          │
   │ TOTAL: Rp 150.000                    │
   ├─────────────────────────────────────────┤
   │ [+ Tambah Kartu]  [Batal]  [Bayar]    │
   └─────────────────────────────────────────┘
```

### Apply Diskon

```
1. Di halaman cart
2. Masukkan jumlah diskon:
   - Dalam bentuk Rupiah (IDR)
   - ATAU dalam persen (%)

3. Sistem cek:
   ┌──────────────────┐
   │ Diskun <= Limit? │
   └────────┬─────────┘
            │
    ┌──────┴──────┐
    │             │
   YES            NO
    │             │
    ▼             ▼
┌────────┐  ┌─────────────────┐
│Apply  │  │Need Override     │
│Diskon │  │Admin?            │
└────────┘  └────────┬────────┘
                    │
                    ▼
            ┌───────────────┐
            │ Request     │
            │ Override    │
            └─────────────┘
```

### Hapus Item dari Cart

```
1. Klik tombol [X] di samping item
2. Konfirmasi:
   ┌──────────────────┐
   │ Hapus dari cart? │
   │ [Ya] [Tidak]    │
   └──────────────────┘
3. Jika Ya → Item dihapus dari cart
```

### Catatan
- Max diskon kasir: sesuai settings (default 10%)
- Diatas itu butuh override admin
- Cart akan di-abandon jika idle > 15 menit

---

## 6. PAYMENT & CHECKOUT

### Deskripsi
Fitur untuk menyelesaikan pembayaran dan membuat transaksi.

### Akses
- **URL:** `/cart` → Klik "Bayar"
- **Role:** Admin, Cashier

###Langkah Checkout

```
1. Di halaman cart
2. Klik "Bayar" / "Checkout"
3. Pilih Payment Channel:

   ┌─────────────────────────────────────────┐
   │         PILIH PEMBAYARAN                 │
   ├─────────────────────────────────────────┤
   │  ┌─────────┐ ┌─────────┐              │
   │  │Cash IDR│ │ BCA    │              │
   │  └─────────┘ └─────────┘              │
   │  ┌─────────┐ ┌─────────┐              │
   │  │Mandiri │ │BNI    │              │
   │  └─────────┘ └─────────┘              │
   │  ┌─────────┐ ┌─────────┐              │
   │  │GoPay  │ │OVO    │              │
   │  └─────────┘ └─────────┘              │
   │  ┌─────────┐ ┌─────────┐              │
   │  │Dana   │ │ShopeePay              │
   │  └─────────┘ └─────────┘              │
   │  ┌─────────┐ ┌─────────┐              │
   │  │QRIS   │ │Other   │              │
   │  └─────────┘ └─────────┘              │
   └─────────────────────────────────────────┘

4. JIKA Non-Tunai (BCA, Mandiri, dll):
   - Masukkan nama/nomor rekening (opsional)
   - Upload bukti transfer (opsional)

5. Konfirmasi total:

   ┌─────────────────────────────────────────┐
   │           RINGKASAN                    │
   ├─────────────────────────────────────────┤
   │ Item: 3 kartu                         │
   │ Subtotal: Rp 150.000                  │
   │ Diskon: Rp 0                          │
   │ TOTAL: Rp 150.000                    │
   │ Payment: BCA                         │
   ├─────────────────────────────────────────┤
   │ [Kembali]  [Konfirmasi & Bayar]       │
   └─────────────────────────────────────────┘

6. Klik "Konfirmasi & Bayar"

7. Proses:
   - Buat transaksi di database
   - Update status kartu (terjual)
   - Release cart lock

8. Setelah berhasil:
   ┌─────────────────────────────────────────┐
   │         TRANSAKSI BERHASIL               │
   ├─────────────────────────────────────────┤
   │ Transaction ID: TX-XXXXX               │
   │ Total: Rp 150.000                    │
   │ Waktu: 28 Apr 2026 14:30           │
   ├─────────────────────────────────────────┤
   │ [Cetak Receipt]  [Scan Lagi]           │
   └─────────────────────────────────────────┘
```

### Jenis Payment Channel

| ID | Nama | Tipe |
|----|------|-----|
| cash | Cash IDR | Tunai |
| bca | BCA | Transfer |
| mandiri | Mandiri | Transfer |
| bni | BNI | Transfer |
| gopay | GoPay | E-Wallet |
| ovo | OVO | E-Wallet |
| dana | Dana | E-Wallet |
| shopepay | ShopeePay | E-Wallet |
| qris | QRIS | QR |
| other | Other | Lainnya |

### Cetak Receipt

```
1. Setelah payment berhasil
2. Klik "Cetak Receipt"
3. Print dialog terbuka
4. Bisa print atau save as PDF
```

### Catatan
- Transaksi TIDAK BISA dihapus (append-only)
- Jika ada kesalahan → gunakan Void atau Refund

---

## 7. TRANSACTIONS

### Deskripsi
Fitur untuk melihat dan mengelola transaksi.

### Akses
- **URL:** `/transactions`
- **Role:** Admin, Cashier

### Lihat Daftar Transaksi

```
1. Buka /transactions
2. Tampil list transaksi:

   ┌─────────────────────────────────────────┐
   │        DAFTAR TRANSAKSI                │
   ├─────────────────────────────────────────┤
   │Filter:                                │
   │ [Tanggal ▼] [Event ▼] [Status ▼]       │
   ├─────────────────────────────────────────┤
   │ ┌─────────────────────────────────┐   │
   │ │ TX-001  | 28 Apr | Rp 150.000  │   │
   │ │ Cash   | 3 item | Sold         │   │
   │ └────────────��─��──────────────────┘   │
   │ ┌─────────────────────────────────┐   │
   │ │ TX-002  | 28 Apr | Rp 75.000   │   │
   │ │ GoPay  | 1 item | Sold         │   │
   │ └─────────────────────────────────┘   │
   │ ┌─────────────────────────────────┐   │
   │ │ TX-003  | 27 Apr | Rp 200.000  │   │
   │ │ Void  | 2 item | Void          │   │
   │ └─────────────────────────────────┘   │
   └─────────────────────────────────────────┘
```

### Filter Transaksi

| Filter | Opsi |
|--------|------|
| Tanggal | Today, Yesterday, This Week, This Month, Custom |
| Event | Semua, [Nama Event] |
| Kind | Sale, Void, Refund |
| Payment | Semua, [Channel] |

### Detail Transaksi

```
1. Klik pada transaksi
2. Tampil detail:

   ┌─────────────────────────────────────────┐
   │      DETAIL TRANSAKSI                    │
   ├─────────────────────────────────────────┤
   │ ID: TX-001                            │
   │ Tanggal: 28 Apr 2026 14:30            │
   │ Event: Jakarta Comic Con              │
   │ Cashier: Revota                     │
   │ Kind: Sale                         │
   ├─────────────────────────────────────────┤
   │ ITEM:                               │
   │ - Black Lotus (O-12345) Rp 50.000   │
   │ - Lightning Bolt (O-12346) Rp 25.000│
   │ - Dark Magician (O-12347) Rp 75.000  │
   ├─────────────────────────────────────────┤
   │ Subtotal: Rp 150.000                 │
   │ Diskon: Rp 0                        │
   │ Total: Rp 150.000                   │
   │ Payment: Cash                      │
   ├─────────────────────────────────────────┤
   │ [Void] [Refund] [Cetak]             │
   └─────────────────────────────────────────┘
```

### Void Transaksi

```
1. Pilih transaksi
2. Klik "Void"
3. Isi alasan void (wajib):
   ┌──────────────────┐
   │ ALASAN VOID      │
   │ [input text]    │
   └──────────────────┘
4. Klik "Konfirmasi"
5. Buat transaksi baru dengan kind: void
6. Update status: void
```

### Refund Transaksi

```
1. Pilih transaksi
2. Klik "Refund"
3. Pilih item yang di-refund (atau semua)
4. Isi alasan refund (wajib)
5. Klik "Konfirmasi"
6. Proses refund
7. Buat transaksi baru dengan kind: refund
```

### Catatan
- Void = pembatalan penuh
- Refund = pengembalian dana (partial atau penuh)
- Void/Refund TIDAK BISA dibatalkan

---

## 8. REPORTS

### Deskripsi
Fitur untuk melihat laporan penjualan dan settlement.

### Akses
- **URL:** `/reports`
- **Role:** Admin (semua), Cashier (hanya payout sendiri)

### Jenis Laporan

#### A. Laporan Harian
```
1. Buka /reports
2. Pilih "Harian"
3. Pilih tanggal
4. Tampil:
   - Jumlah transaksi
   - Total penjualan
   - Per payment channel
   - Per owner
```

#### B. Laporan Bulanan
```
1. Buka /reports
2. Pilih "Bulanan"
3. Pilih bulan/tahun
4. Tampil ringkasan bulanan
```

#### C. Settlement per Event
```
1. Buka /reports
2. Pilih "Event"
3. Pilih event
4. Tampil settlement per owner:
   - Total penjualan per owner
   - Komisi booth (jika ada)
   - Jumlah payout
```

### Tampilan Laporan

```
┌─────────────────────────────────────────┐
│         LAPORAN PENJUALAN                │
│         Jakarta Comic Con              │
│         28 April 2026                │
├─────────────────────────────────────────┤
│ RINGKASAN                             │
│ ──────────────────────────────────────│
│ Total Transaksi: 15                    │
│ Total Penjualan: Rp 1.250.000         │
│ Item Terjual: 23                      │
├─────────────────────────────────────────┤
│ PER PAYMENT CHANNEL                   │
│ ──────────────────────────────────────│
│ Cash: Rp 300.000    (6 transaksi)    │
│ BCA: Rp 500.000    (5 transaksi)    │
│ GoPay: Rp 250.000    (3 transaksi)  │
│ QRIS: Rp 200.000    (1 transaksi)   │
├─────────────────────────────────────────┤
│ PER OWNER                            │
│ ──────────────────────────────────────│
│ Revota: Rp 400.000    (8 kartu)      │
│ Budi: Rp 350.000    (7 kartu)        │
│ Toni: Rp 500.000    (8 kartu)       │
├─────────────────────────────────────────┤
│ [Export CSV] [Export Excel] [Print]    │
└─────────────────────────────────────────┘
```

### Export

```
1. Klik "Export CSV" atau "Export Excel"
2. File di-download
3. Siap untuk diolah
```

### Catatan
- Semua harga dalam integer IDR
- Diskon di-tambahkan ke laporan

---

## 9. USER MANAGEMENT

### Deskripsi
Fitur untuk mengelola user (admin & cashier).

### Akses
- **URL:** `/users`
- **Role:** Admin only

### Lihat Daftar User

```
1. Buka /users
2. Tampil list user:

   ┌─────────────────────────────────────────┐
   │           DAFTAR USER                  │
   ├─────────────────────────────────────────┤
   │ ┌─────────────────────────────────┐   │
   │ │ Revota    │ admin │ Aktif        │   │
   │ └─────────────────────────────────┘   │
   │ ┌─────────────────────────────────┐   │
   │ │ Budi     │ cash │ Aktif        │   │
   │ └─────────────────────────────────┘   │
   │ ┌─────────────────────────────────┐   │
   │ │ Toni     │ cash │ Aktif        │   │
   │ └─────────────────────────────────┘   │
   ├───────────────────────────────────���─���───┤
   │ [+ Tambah User]                       │
   └─────────────────────────────────────────┘
```

### Tambah User

```
1. Buka /users
2. Klik "+ Tambah User"
3. Isi form:

   ┌────────────────────────────────────┐
   │     TAMBAH USER                    │
   ├────────────────────────────────────┤
   │ Email: [input email]               │
   │ Display Name: [input text]         │
   │ Password: [input password]        │
   │ Role: [Pilih]                     │
   │   ├ Admin                       │
   │   └ Cashier                     │
   └────────────────────────────────────┘
4. Klik "Simpan"
5. User dibuat & bisa login
```

### Edit User

```
1. Pilih user
2. Klik "Edit"
3. Ubah field yang diperlukan
4. Klik "Simpan"
```

### Hapus User

```
1. Pilih user
2. Klik "Hapus"
3. Konfirmasi:
   ┌──────────────────┐
   │ Hapus user ini? │
   │ [Ya] [Tidak]   │
   └──────────────────┘
4. Jika Ya → User di-nonaktifkan
```

### Role User

| Role | Kemampuan |
|------|-----------|
| Admin | Semua: user, event, settings, override, void/refund, reports, backup |
| Cashier | Stock-receive, sell, cart, payment, view payout sendiri |

---

## 10. EVENT MANAGEMENT

### Deskripsi
Fitur untuk mengelola event convention.

### Akses
- **URL:** `/events`
- **Role:** Admin only

### Buat Event

```
1. Buka /events
2. Klik "+ Buat Event"
3. Isi form:

   ┌────────────────────────────────────┐
   │        BUAT EVENT                 │
   ├────────────────────────────────────┤
   │ Nama Event: [input text]           │
   │ Venue: [input text]               │
   │ Tanggal Mulai: [date picker]      │
   │ Tanggal Selesai: [date picker]   │
   │ Status: Draft / Aktif / Selesai   │
   └────────────────────────────────────┘
4. Klik "Simpan"
5. Event dibuat
```

### Edit Event

```
1. Pilih event
2. Klik "Edit"
3. Ubah detail
4. Klik "Simpan"
```

### Tutup Event

```
1. Pilih event
2. Klik "Tutup Event"
3. Event ditutup dan di-arsipkan
4. Settlement bisa dilakukan
```

### Status Event

| Status | Keterangan |
|--------|-----------|
| Draft | Belum aktif |
| Aktif | Sedang berjalan |
| Selesai | Event selesai |

### Catatan
- Hanya 1 event yang bisa aktif dalam satu waktu
- Semua transaksi dikaitkan dengan event aktif

---

## 11. INVENTORY

### Deskripsi
Fitur untuk melihat dan mengelola inventory kartu.

### Akses
- **URL:** `/inventory`
- **Role:** Admin, Cashier

### Lihat Inventory

```
1. Buka /inventory
2. Tampil list kartu:

   ┌─────────────────────────────────────────┐
   │         INVENTORY                     │
   ├─────────────────────────────────────────┤
   │Filter:                           │
   │ [Owner ▼] [Status ▼] [Cari...]  │
   ├─────────────────────────────────────────┤
   │ ┌────────────────��─��──────────────┐   │
   │ │ O-12345 | Black Lotus | Tersedia │   │
   │ │ Revota | Rp 50.000            │   │
   │ └─────────────────────────────────┘   │
   │ ┌─────────────────────────────────┐   │
   │ │ O-12346 | Lightning Bolt | Cart  │   │
   │ │ Toni | Rp 25.000              │   │
   │ └─────────────────────────────────┘   │
   └─────────────────────────────────────────┘
```

### Filter Inventory

| Filter | Opsi |
|--------|------|
| Owner | Semua, [Nama Owner] |
| Status | Tersedia, Di Cart, Terjual, Void, Oversold |
| Available | Semua, Tersedia saja |

### Edit Kartu

```
1. Pilih kartu
2. Klik "Edit"
3. Ubah detail
4. Klik "Simpan"
```

### Hapus Kartu (Soft Delete)

```
1. Pilih kartu
2. Klik "Hapus"
3. Kartu di-mark as Terjual/Void
```

### Status Kartu

| Status | Keterangan |
|--------|-----------|
| Tersedia | Ready untuk dijual |
| Di Cart | Sedang di cart |
| Terjual | Sudah terjual |
| Void | Dibatalkan |
| Oversold | Terjual 2x (conflict) |

---

## 12. SETTINGS

### Deskripsi
Fitur untuk mengatur sistem.

### Akses
- **URL:** `/settings`
- **Role:** Admin only

### Pengaturan yang Tersedia

```
┌─────────────────────────────────────────┐
│           SETTINGS                     │
├─────────────────────────────────────────┤
│ GENERAL                              │
│ ──────────────────────────────────── │
│ max_line_discount_pct_fixed: [10]     │
│ max_transaction_discount_pct: [10]    │
│ cart_idle_ttl_minutes: [15]           │
│ sync_interval_seconds: [60]            │
├─────────────────────────────────────┤
│ EVENT                               │
│ ──────────────────────────────────── │
│ active_event_id: [EVT-001]           │
└─────────────────────────────────────────┘
```

### Ubah Settings

```
1. Buka /settings
2. Klik pada value yang ingin diubah
3. Masukkan nilai baru
4. Klik "Simpan"
5. Perubahan langsung berlaku
```

### Keterangan Settings

| Key | Default | Keterangan |
|-----|---------|-----------|
| max_line_discount_pct_fixed | 10 | Max diskon per item (%) |
| max_transaction_discount_pct | 10 | Max diskon transaksi (%) |
| cart_idle_ttl_minutes | 15 | Timeout cart idle |
| sync_interval_seconds | 60 | Interval sync |

---

## 13. OVERSOLD QUEUE

### Deskripsi
Fitur untuk menangani oversold (kartu terjual 2x).

### Akses
- **URL:** `/oversold`
- **Role:** Admin only

### Apa itu Oversold?
```
 terjadi ketika 2 perangkat (offline simultaneously) menjual
 kartu yang sama. Kedua transaksi accepted (append-only),
 kartu di-flag oversold.
```

### Lihat Oversold

```
1. Buka /oversold
2. Tampil list:

   ┌─────────────────────────────────────────┐
   │         OVERSOLD QUEUE                  │
   ├─────────────────────────────────────────┤
   │ ┌────────���─���──────────────────────┐   │
   │ │ O-12345 | Black Lotus           │   │
   │ │ TX-001 Revota | TX-002 Budi     │   │
   │ │ Sold: 28 Apr | Sold: 28 Apr    │   │
   │ └─────────────────────────────────┘   │
   └─────────────────────────────────────────┘
```

### Tangani Oversold

```
1. Pilih oversold item
2. Pilih tindakan:

   ┌────────────────────────────────────┐
   │       TANGANI OVERSOLD             │
   ├────────────────────────────────────┤
   │ O-12345 Black Lotus               │
   │ TX-001 (Revota) - 50.000       │
   │ TX-002 (Budi) - 50.000        │
   ├────────────────────────────────────┤
   │ PILIH YANG DI-KEEP:              │
   │ [ ] TX-001 (Revota)           │
   │ [ ] TX-002 (Budi)            │
   ├────────────────────────────────────┤
   │ [Batal TX terpilih]            │
   └────────────────────────────────────┘

3. Klik "Batal TX"
4. Jika TX tersebut memiliki item lain:
   - Pilih mana yang di-refund
5. Refund diproses
```

### Catatan
- Accepted residual risk - TIDAK BISA dicegah 100%
- Perlu penanganan manual

---

## 14. AUDIT LOG

### Deskripsi
Log semua aktivitas dalam sistem.

### Akses
- **URL:** `/audit-log`
- **Role:** Admin only

### Lihat Audit Log

```
1. Buka /audit-log
2. Tampil list:

   ┌─────────────────────────────────────────┐
   │          AUDIT LOG                     │
   ├─────────────────────────────────────────┤
   │ Filter:                             │
   │ [Tabel ▼] [Aksi ▼] [User ▼]        │
   ├─────────────────────────────────────────┤
   │ ┌─────────────────────────────────┐   │
   │ │ users    | create | revota | 14:30│   │
   │ └─────────────────────────────────┘   │
   │ ┌─────────────────────────────────┐   │
   │ │ cards   | insert | budi | 14:25 │   │
   │ └─────────────────────────────────┘   │
   │ ┌─────────────────────────────────┐   │
   │ │transaction| insert | revota|14:15│   │
   │ └─────────────────────────────────┘   │
   └─────────────────────────────────────────┘
```

### Catatan
- Append-only - TIDAK BISA dihapus
- Semua action dicatat

---

## 15. BACKUP

### Deskripsi
Fitur untuk mendownload backup database.

### Akses
- **URL:** `/admin/backup` atau `/backup`
- **Role:** Admin only

### Download Backup

```
1. Buka /backup
2. Klik "Download Backup"
3. File database (.sqlite) di-download
4. Simpan di tempat aman
```

### Restore (Jika Diperlukan)

```
1. Hentikan API server
2. Replace database file dengan backup
3. Start API server
4. Database terkembalikan ke titik backup
```

### Catatan
- Backup manual - TIDAK ada auto-backup
- Lakukan backup secara berkala

---

## 16. OFFLINE MODE

### Deskripsi
KolektorPos bekerja offline - semua operasi berfungsi tanpa internet.

### Status Indicator

```
┌─────────────────────────────────────────┐
│ ONLINE (Hijau)  │ OFFLINE (Merah)       │
│ Terhubung      │ Tidak Terhubung       │
└─────────────────────────────────────────┘
```

### Apa yang Berhasil Offline?

| Fitur | Offline |
|-------|---------|
| Login | Ya |
| Scan | Ya |
| Add to Cart | Ya |
| View Inventory | Ya |
| Payment | Ya (simpan lokal) |
| View Reports | Ya (dari cache) |

### Apa yang TIDAK Berhasil Offline?

| Fitur | Keterangan |
|-------|-----------|
| Sync ke server | Perlu online |
| View user management | Read from server |
| Create user | Perlu online |
| Create event | Perlu online |

### Cara Kerja

```
ONLINE:
1. Semua operasi langsung ke server
2. Data di-sync otomatis (60 detik)
3. Indikator hijau

OFFLINE:
1. Simpan ke IndexedDB lokal
2. Indikator merah
3. Saat online → auto-sync
```

### Sync Konflik

```
JIKA KONFLIK:
- Mutable items (cards, users): Server wins
- Append-only (transactions): Both accepted
```

---

## LAMPIRAN: API ENDPOINTS

### Auth
| Method | Endpoint | Notes |
|--------|----------|-------|
| POST | /auth/login | |
| POST | /auth/logout | |
| GET | /auth/me | |
| POST | /auth/change-password | |

### Users
| Method | Endpoint | Notes |
|--------|----------|-------|
| GET | /users | |
| POST | /users | Admin only |
| PATCH | /users/:id | |
| DELETE | /users/:id | |

### Events
| Method | Endpoint | Notes |
|--------|----------|-------|
| GET | /events | |
| POST | /events | Admin only |
| PATCH | /events/:id | Admin only |

### Cards
| Method | Endpoint | Notes |
|--------|----------|-------|
| GET | /cards | |
| POST | /cards | Stock-receive |
| PATCH | /cards/:id | |

### Carts
| Method | Endpoint | Notes |
|--------|----------|-------|
| GET | /carts | |
| POST | /carts | Create |
| POST | /carts/:id/add | Add item |
| POST | /carts/:id/pay | Checkout |

### Transactions
| Method | Endpoint | Notes |
|--------|----------|-------|
| GET | /transactions | |
| POST | /transactions/:id/void | |
| POST | /transactions/:id/refund | |

### Reports
| Method | Endpoint | Notes |
|--------|----------|-------|
| GET | /settlement/daily | |
| GET | /settlement/monthly | |
| GET | /settlement/event/:id | |

### Admin
| Method | Endpoint | Notes |
|--------|----------|-------|
| GET | /settings | |
| PUT | /settings/:key | |
| GET | /audit-log | |
| GET | /backup | |
| GET | /oversold | |