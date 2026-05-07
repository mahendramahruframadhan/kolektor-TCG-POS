# FITUR CHECKLIST - KolektorPosTCG
# DAFTAR ISI

- [Auth](#1-auth)
- [Dashboard](#2-dashboard)
- [Stock-Receive](#3-stock-receive)
- [Scan](#4-scan)
- [Cart](#5-cart)
- [Payment](#6-payment)
- [Transactions](#7-transactions)
- [Reports](#8-reports)
- [Users](#9-users)
- [Events](#10-events)
- [Inventory](#11-inventory)
- [Settings](#12-settings)
- [Oversold](#13-oversold)
- [Audit](#14-audit)
- [Backup](#15-backup)
- [Offline](#16-offline)

---

## 1. AUTH

### Login
- [ ] Login dengan email benar | Notes: _______________
- [ ] Login dengan password salah → error | Notes: _______________
- [ ] Login dengan email tidak terdaftar → error | Notes: _______________
- [ ] Redirect ke dashboard setelah berhasil | Notes: _______________

### Logout
- [ ] Klik logout | Notes: _______________
- [ ] Session dihapus | Notes: _______________
- [ ] Redirect ke login | Notes: _______________

### Change Password
- [ ] Ubah password berhasil | Notes: _______________
- [ ] Password lama salah → error | Notes: _______________
- [ ] Password baru < 8 karakter → error | Notes: _______________

### Notes:
```
 redirect, error message, lokasi tombol, dll:
 | Tanggal | Tester | TC | Notes |
 |--------|--------|-----|-------|
 | | | | |
 | | | | |
```

---

## 2. DASHBOARD

### Tampilan
- [ ] Total penjualan hari ini tampil | Notes: _______________
- [ ] Total penjualan minggu ini tampil | Notes: _______________
- [ ] Jumlah transaksi tampil | Notes: _______________
- [ ] Event aktif tampil | Notes: _______________

### Quick Actions
- [ ] Tombol Scan berfungsi | Notes: _______________
- [ ] Tombol Tambah Inventory berfungsi | Notes: _______________
- [ ] Tombol Lihat Laporan berfungsi | Notes: _______________

### Notes:
```
 catatan tambahan:
 | Tanggal | Tester | TC | Notes |
 |--------|--------|-----|-------|
 | | | | |
 | | | | |
```

---

## 3. STOCK-RECEIVE

### Input Fixed Price
- [ ] Pilih Owner | Notes: _______________
- [ ] Input nama kartu | Notes: _______________
- [ ] Pilih kondisi | Notes: _______________
- [ ] Pilih kategori | Notes: _______________
- [ ] Pilih Fixed Price | Notes: _______________
- [ ] Input harga | Notes: _______________
- [ ] Simpan berhasil | Notes: _______________
- [ ] Card ID generated (O-XXXXX) | Notes: _______________
- [ ] QR Code generated | Notes: _______________

### Input Negotiable
- [ ] Pilih Negotiable | Notes: _______________
- [ ] Input Bottom Price | Notes: _______________
- [ ] Input Listed Price | Notes: _______________
- [ ] Simpan berhasil | Notes: _______________

### Validasi
- [ ] Field wajib terisi | Notes: _______________
- [ ] Simpan gagal jika kosong | Notes: _______________

### Notes:
```
 catatan tambahan:
 | Tanggal | Tester | TC | Notes |
 |--------|--------|-----|-------|
 | | | | |
 | | | | |
```

---

## 4. SCAN

### Scan Kamera
- [ ] Camera permission diminta | Notes: _______________
- [ ] Kamera menampilkan video | Notes: _______________
- [ ] Scan QR code berhasil | Notes: _______________
- [ ] Scan barcode berhasil | Notes: _______________
- [ ] Kartu ditemukan | Notes: _______________

### Scan USB
- [ ] USB scanner terdeteksi | Notes: _______________
- [ ] Scan otomatis input | Notes: _______________
- [ ] Kartu ditemukan | Notes: _______________

### Input Manual
- [ ] Input Card ID manual | Notes: _______________
- [ ] Search/Enter | Notes: _______________
- [ ] Kartu ditemukan | Notes: _______________

### Hasil Scan
- [ ] Detail kartu tampil | Notes: _______________
- [ ] Tambah ke Cart bekerja | Notes: _______________
- [ ] Kartu sudah di cart → warning | Notes: _______________
- [ ] Kartu sudah terjual → info | Notes: _______________

### Notes:
```
 catatan tambahan:
 | Tanggal | Tester | TC | Notes |
 |--------|--------|-----|-------|
 | | | | |
 | | | | |
```

---

## 5. CART

### Lihat Cart
- [ ] List item muncul | Notes: _______________
- [ ] Subtotal correct | Notes: _______________
- [ ] Total correct | Notes: _______________

### Tambah/Hapus Item
- [ ] Tambah item berhasil | Notes: _______________
- [ ] Hapus item berhasil | Notes: _______________
- [ ] Cart update otomatis | Notes: _______________

### Diskon
- [ ] Input diskon IDR | Notes: _______________
- [ ] Input diskon % | Notes: _______________
- [ ] Diskon <= limit → apply | Notes: _______________
- [ ] Diskon > limit → minta override | Notes: _______________
- [ ] Request override ke admin | Notes: _______________

### Notes:
```
 catatan tambahan:
 | Tanggal | Tester | TC | Notes |
 |--------|--------|-----|-------|
 | | | | |
 | | | | |
```

---

## 6. PAYMENT

### Pilih Channel
- [ ] Tampil semua channel | Notes: _______________
- [ ] Pilih Cash | Notes: _______________
- [ ] Pilih Transfer (BCA, Mandiri, dll) | Notes: _______________
- [ ] Pilih E-Wallet (GoPay, OVO, dll) | Notes: _______________
- [ ] Pilih QRIS | Notes: _______________

### Checkout
- [ ] Review order | Notes: _______________
- [ ] Konfirmasi bisa klik | Notes: _______________
- [ ] Transaksi berhasil dibuat | Notes: _______________
- [ ] Status kartu update ke Terjual | Notes: _______________
- [ ] Cart di-clear | Notes: _______________

### Receipt
- [ ] Tampilkan receipt | Notes: _______________
- [ ] Print berfungsi | Notes: _______________
- [ ] Simpan PDF berfungsi | Notes: _______________

### Notes:
```
 catatan tambahan:
 | Tanggal | Tester | TC | Notes |
 |--------|--------|-----|-------|
 | | | | |
 | | | | |
```

---

## 7. TRANSACTIONS

### List
- [ ] Tampil semua transaksi | Notes: _______________
- [ ] Filter tanggal works | Notes: _______________
- [ ] Filter event works | Notes: _______________
- [ ] Filter kind works | Notes: _______________
- [ ] Pagination works | Notes: _______________

### Detail
- [ ] Detail transaksi lengkap | Notes: _______________
- [ ] Item list tampil | Notes: _______________
- [ ] Total correct | Notes: _______________

### Void
- [ ] Button Void muncul | Notes: _______________
- [ ] Input alasan wajib | Notes: _______________
- [ ] Transaksi dibatalkan | Notes: _______________
- [ ] Item di-unlock | Notes: _______________

### Refund
- [ ] Button Refund muncul | Notes: _______________
- [ ] Pilih item refund | Notes: _______________
- [ ] Input alasan wajib | Notes: _______________
- [ ] Refund berhasil | Notes: _______________

### Notes:
```
 catatan tambahan:
 | Tanggal | Tester | TC | Notes |
 |--------|--------|-----|-------|
 | | | | |
 | | | | |
```

---

## 8. REPORTS

### Daily Report
- [ ] Pilih tanggal | Notes: _______________
- [ ] Total transaksi correct | Notes: _______________
- [ ] Total penjualan correct | Notes: _______________
- [ ] Per channel breakdown | Notes: _______________
- [ ] Per owner breakdown | Notes: _______________

### Monthly Report
- [ ] Pilih bulan | Notes: _______________
- [ ] Report tampil | Notes: _______________
- [ ] Data correct | Notes: _______________

### Settlement
- [ ] Pilih event | Notes: _______________
- [ ] Per owner breakdown | Notes: _______________
- [ ] Total correct | Notes: _______________

### Export
- [ ] Export CSV works | Notes: _______________
- [ ] Export Excel works | Notes: _______________
- [ ] Data correct di file | Notes: _______________

### Notes:
```
 catatan tambahan:
 | Tanggal | Tester | TC | Notes |
 |--------|--------|-----|-------|
 | | | | |
 | | | | |
```

---

## 9. USERS

### List
- [ ] Semua user tampil | Notes: _______________
- [ ] Role terlihat | Notes: _______________
- [ ] Status terlihat | Notes: _______________

### Create
- [ ] Form muncul | Notes: _______________
- [ ] Input email | Notes: _______________
- [ ] Input display name | Notes: _______________
- [ ] Input password | Notes: _______________
- [ ] Pilih role | Notes: _______________
- [ ] Simpan berhasil | Notes: _______________
- [ ] User bisa login | Notes: _______________

### Edit
- [ ] Edit berhasil | Notes: _______________
- [ ] Perubahan disimpan | Notes: _______________

### Delete
- [ ] Delete user | Notes: _______________
- [ ] User di-nonaktifkan | Notes: _______________

### Notes:
```
 catatan tambahan:
 | Tanggal | Tester | TC | Notes |
 |--------|--------|-----|-------|
 | | | | |
 | | | | |
```

---

## 10. EVENTS

### Create
- [ ] Input nama event | Notes: _______________
- [ ] Input venue | Notes: _______________
- [ ] Input tanggal mulai | Notes: _______________
- [ ] Input tanggal selesai | Notes: _______________
- [ ] Simpan berhasil | Notes: _______________

### Edit
- [ ] Edit event | Notes: _______________
- [ ] Perubahan disimpan | Notes: _______________

### Close Event
- [ ] Close event | Notes: _______________
- [ ] Status ubah ke Selesai | Notes: _______________
- [ ] Settlement bisa dibuat | Notes: _______________

### Notes:
```
 catatan tambahan:
 | Tanggal | Tester | TC | Notes |
 |--------|--------|-----|-------|
 | | | | |
 | | | | |
```

---

## 11. INVENTORY

### List
- [ ] Semua kartu tampil | Notes: _______________
- [ ] Filter owner works | Notes: _______________
- [ ] Filter status works | Notes: _______________
- [ ] Search works | Notes: _______________

### Detail
- [ ] Nama kartu | Notes: _______________
- [ ] Owner | Notes: _______________
- [ ] Kondisi | Notes: _______________
- [ ] Bottom/Listed price | Notes: _______________
- [ ] Status | Notes: _______________

### Edit
- [ ] Edit kartu | Notes: _______________
- [ ] Simpan berhasil | Notes: _______________

### Delete
- [ ] Soft delete | Notes: _______________
- [ ] Status ubah | Notes: _______________

### Notes:
```
 catatan tambahan:
 | Tanggal | Tester | TC | Notes |
 |--------|--------|-----|-------|
 | | | | |
 | | | | |
```

---

## 12. SETTINGS

### View
- [ ] Semua setting tampil | Notes: _______________
- [ ] Value terlihat | Notes: _______________

### Edit
- [ ] Edit max_line_discount | Notes: _______________
- [ ] Edit max_transaction_discount | Notes: _______________
- [ ] Edit cart_idle_ttl | Notes: _______________
- [ ] Edit sync_interval | Notes: _______________
- [ ] Perubahan berlaku langsung | Notes: _______________

### Notes:
```
 catatan tambahan:
 | Tanggal | Tester | TC | Notes |
 |--------|--------|-----|-------|
 | | | | |
 | | | | |
```

---

## 13. OVERSOLD

### View
- [ ] List oversold tampil | Notes: _______________
- [ ] Detail transaksi tampil | Notes: _______________
- [ ] Kedua transaksi terlihat | Notes: _______________

### Handle
- [ ] Pilih yang di-keep | Notes: _______________
- [ ] Void transaksi lain | Notes: _______________
- [ ] Refund jika perlu | Notes: _______________
- [ ] Item di-unlock | Notes: _______________

### Notes:
```
 catatan tambahan:
 | Tanggal | Tester | TC | Notes |
 |--------|--------|-----|-------|
 | | | | |
 | | | | |
```

---

## 14. AUDIT LOG

### View
- [ ] Semua log tampil | Notes: _______________
- [ ] Filter table works | Notes: _______________
- [ ] Filter action works | Notes: _______________
- [ ] Filter user works | Notes: _______________

### Detail
- [ ] Table name | Notes: _______________
- [ ] Action type | Notes: _______________
- [ ] User | Notes: _______________
- [ ] Timestamp | Notes: _______________
- [ ] Old/new value | Notes: _______________

### Notes:
```
 catatan tambahan:
 | Tanggal | Tester | TC | Notes |
 |--------|--------|-----|-------|
 | | | | |
 | | | | |
```

---

## 15. BACKUP

### Download
- [ ] Button muncul | Notes: _______________
- [ ] Download works | Notes: _______________
- [ ] File .sqlite valid | Notes: _______________

### Notes:
```
 catatan tambahan:
 | Tanggal | Tester | TC | Notes |
 |--------|--------|-----|-------|
 | | | | |
 | | | | |
```

---

## 16. OFFLINE MODE

### Status
- [ ] Indikator Online/Hijau | Notes: _______________
- [ ] Indikator Offline/Merah | Notes: _______________
- [ ] Toggle works | Notes: _______________

### Offline Operations
- [ ] Login offline | Notes: _______________
- [ ] Scan offline | Notes: _______________
- [ ] Add to cart offline | Notes: _______________
- [ ] Payment offline (simpan lokal) | Notes: _______________

### Sync
- [ ] Auto sync saat online | Notes: _______________
- [ ] Conflict resolution server wins | Notes: _______________
- [ ] Data sync correct | Notes: _______________

### Notes:
```
 catatan tambahan:
 | Tanggal | Tester | TC | Notes |
 |--------|--------|-----|-------|
 | | | | |
 | | | | |
```

---

## RINGKASAN

| Fitur | Total TC | Passed | Failed | Notes |
|-------|---------|--------|--------|-------|
| Auth | | | | |
| Dashboard | | | | |
| Stock-Receive | | | | |
| Scan | | | | |
| Cart | | | | |
| Payment | | | | |
| Transactions | | | | |
| Reports | | | | |
| Users | | | | |
| Events | | | | |
| Inventory | | | | |
| Settings | | | | | |
| Oversold | | | | |
| Audit Log | | | | |
| Backup | | | | |
| Offline | | | | |
| **TOTAL** | | | | |

---

## BUG REPORT

| Bug ID | Severity | TC | Deskripsi | Tanggal | Status |
|-------|----------|-----|-----------|---------|--------|
| | | | | | |
| | | | | | |

### Detail Bug:
- **TC:**
- ** Steps:**
- **Expected:**
- **Actual:**
- **Evidence:**

---

## KESIMPULAN

**Overall Status:** _______________

**Catatan/Kesimpulan:**


**Sign Off:**
| Role | Nama | Tanggal | Tanda Tangan |
|------|------|---------|--------------|
| QA | | | |
| Dev | | | |
| PM | | | |