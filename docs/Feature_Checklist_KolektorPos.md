# FITUR CHECKLIST - KolektorPosTCG

## DAFTAR ISI

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
- [ ] Login dengan email benar
- [ ] Login dengan password salah → error
- [ ] Login dengan email tidak terdaftar → error
- [ ] Redirect ke dashboard setelah berhasil

### Logout
- [ ] Klik logout
- [ ] Session dihapus
- [ ] Redirect ke login

### Change Password
- [ ] Ubah password berhasil
- [ ] Password lama salah → error
- [ ] Password baru < 8 karakter → error

### Notes:
```
| Tanggal | Tester | Status |
|--------|--------|--------|
| | | |
```

---

## 2. DASHBOARD

### Tampilan
- [ ] Total penjualan hari ini tampil
- [ ] Total penjualan minggu ini tampil
- [ ] Jumlah transaksi tampil
- [ ] Event aktif tampil

### Quick Actions
- [ ] Tombol Scan berfungsi
- [ ] Tombol Tambah Inventory berfungsi
- [ ] Tombol Lihat Laporan berfungsi

### Notes:
```
| Tanggal | Tester | Status |
|--------|--------|--------|
| | | |
```

---

## 3. STOCK-RECEIVE

### Input Fixed Price
- [ ] Pilih Owner
- [ ] Input nama kartu
- [ ] Pilih kondisi
- [ ] Pilih kategori
- [ ] Pilih Fixed Price
- [ ] Input harga
- [ ] Simpan berhasil
- [ ] Card ID generated (O-XXXXX)
- [ ] QR Code generated

### Input Negotiable
- [ ] Pilih Negotiable
- [ ] Input Bottom Price
- [ ] Input Listed Price
- [ ] Simpan berhasil

### Validasi
- [ ] Field wajib terisi
- [ ] Simpan gagal jika kosong

### Notes:
```
| Tanggal | Tester | Status |
|--------|--------|--------|
| | | |
```

---

## 4. SCAN

### Scan Kamera
- [ ] Camera permission diminta
- [ ] Kamera menampilkan video
- [ ] Scan QR code berhasil
- [ ] Scan barcode berhasil
- [ ] Kartu ditemukan

### Scan USB
- [ ] USB scanner terdeteksi
- [ ] Scan otomatis input
- [ ] Kartu ditemukan

### Input Manual
- [ ] Input Card ID manual
- [ ] Search/Enter
- [ ] Kartu ditemukan

### Hasil Scan
- [ ] Detail kartu tampil
- [ ] Tambah ke Cart bekerja
- [ ] Kartu sudah di cart → warning
- [ ] Kartu sudah terjual → info

### Notes:
```
| Tanggal | Tester | Status |
|--------|--------|--------|
| | | |
```

---

## 5. CART

### Lihat Cart
- [ ] List item muncul
- [ ] Subtotal correct
- [ ] Total correct

### Tambah/Hapus Item
- [ ] Tambah item berhasil
- [ ] Hapus item berhasil
- [ ] Cart update otomatis

### Diskon
- [ ] Input diskon IDR
- [ ] Input diskon %
- [ ] Diskon <= limit → apply
- [ ] Diskon > limit → minta override
- [ ] Request override ke admin

### Notes:
```
| Tanggal | Tester | Status |
|--------|--------|--------|
| | | |
```

---

## 6. PAYMENT

### Pilih Channel
- [ ] Tampil semua channel
- [ ] Pilih Cash
- [ ] Pilih Transfer (BCA, Mandiri, dll)
- [ ] Pilih E-Wallet (GoPay, OVO, dll)
- [ ] Pilih QRIS

### Checkout
- [ ] Review order
- [ ] Konfirmasi bisa klik
- [ ] Transaksi berhasil dibuat
- [ ] Status kartu update ke Terjual
- [ ] Cart di-clear

### Receipt
- [ ] Tampilkan receipt
- [ ] Print berfungsi
- [ ] Simpan PDF berfungsi

### Notes:
```
| Tanggal | Tester | Status |
|--------|--------|--------|
| | | |
```

---

## 7. TRANSACTIONS

### List
- [ ] Tampil semua transaksi
- [ ] Filter tanggal works
- [ ] Filter event works
- [ ] Filter kind works
- [ ] Pagination works

### Detail
- [ ] Detail transaksi lengkap
- [ ] Item list tampil
- [ ] Total correct

### Void
- [ ] Button Void muncul
- [ ] Input alasan wajib
- [ ] Transaksi dibatalkan
- [ ] Item di-unlock

### Refund
- [ ] Button Refund muncul
- [ ] Pilih item refund
- [ ] Input alasan wajib
- [ ] Refund berhasil

### Notes:
```
| Tanggal | Tester | Status |
|--------|--------|--------|
| | | |
```

---

## 8. REPORTS

### Daily Report
- [ ] Pilih tanggal
- [ ] Total transaksi correct
- [ ] Total penjualan correct
- [ ] Per channel breakdown
- [ ] Per owner breakdown

### Monthly Report
- [ ] Pilih bulan
- [ ] Report tampil
- [ ] Data correct

### Settlement
- [ ] Pilih event
- [ ] Per owner breakdown
- [ ]Total correct

### Export
- [ ] Export CSV works
- [ ] Export Excel works
- [ ] Data correct di file

### Notes:
```
| Tanggal | Tester | Status |
|--------|--------|--------|
| | | |
```

---

## 9. USERS

### List
- [ ] Semua user tampil
- [ ] Role terlihat
- [ ] Status terlihat

### Create
- [ ] Form muncul
- [ ] Input email
- [ ] Input display name
- [ ] Input password
- [ ] Pilih role
- [ ] Simpan berhasil
- [ ] User bisa login

### Edit
- [ ] Edit berhasil
- [ ] Perubahan disimpan

### Delete
- [ ] Delete user
- [ ] User di-nonaktifkan

### Notes:
```
| Tanggal | Tester | Status |
|--------|--------|--------|
| | | |
```

---

## 10. EVENTS

### Create
- [ ] Input nama event
- [ ] Input venue
- [ ] Input tanggal mulai
- [ ] Input tanggal selesai
- [ ] Simpan berhasil

### Edit
- [ ] Edit event
- [ ] Perubahan disimpan

### Close Event
- [ ] Close event
- [ ] Status ubah ke Selesai
- [ ] Settlement bisa dibuat

### Notes:
```
| Tanggal | Tester | Status |
|--------|--------|--------|
| | | |
```

---

## 11. INVENTORY

### List
- [ ] Semua kartu tampil
- [ ] Filter owner works
- [ ] Filter status works
- [ ] Search works

### Detail
- [ ] Nama kartu
- [ ] Owner
- [ ] Kondisi
- [ ] Bottom/Listed price
- [ ] Status

### Edit
- [ ] Edit kartu
- [ ] Simpan berhasil

### Delete
- [ ] Soft delete
- [ ] Status ubah

### Notes:
```
| Tanggal | Tester | Status |
|--------|--------|--------|
| | | |
```

---

## 12. SETTINGS

### View
- [ ] Semua setting tampil
- [ ] Value terlihat

### Edit
- [ ] Edit max_line_discount
- [ ] Edit max_transaction_discount
- [ ] Edit cart_idle_ttl
- [ ] Edit sync_interval
- [ ] Perubahan berlaku langsung

### Notes:
```
| Tanggal | Tester | Status |
|--------|--------|--------|
| | | |
```

---

## 13. OVERSOLD

### View
- [ ] List oversold tampil
- [ ] Detail transaksi tampil
- [ ] Kedua transaksi terlihat

### Handle
- [ ] Pilih yang di-keep
- [ ] Void transaksi lain
- [ ] Refund jika perlu
- [ ] Item di-unlock

### Notes:
```
| Tanggal | Tester | Status |
|--------|--------|--------|
| | | |
```

---

## 14. AUDIT LOG

### View
- [ ] Semua log tampil
- [ ] Filter table works
- [ ] Filter action works
- [ ] Filter user works

### Detail
- [ ] Table name
- [ ] Action type
- [ ] User
- [ ] Timestamp
- [ ] Old/new value

### Notes:
```
| Tanggal | Tester | Status |
|--------|--------|--------|
| | | |
```

---

## 15. BACKUP

### Download
- [ ] Button muncul
- [ ] Download works
- [ ] File .sqlite valid

### Notes:
```
| Tanggal | Tester | Status |
|--------|--------|--------|
| | | |
```

---

## 16. OFFLINE MODE

### Status
- [ ] Indikator Online/Hijau
- [ ] Indikator Offline/Merah
- [ ] Toggle works

### Offline Operations
- [ ] Login offline
- [ ] Scan offline
- [ ] Add to cart offline
- [ ] Payment offline (simpan lokal)

### Sync
- [ ] Auto sync saat online
- [ ] Conflict resolution server wins
- [ ] Data sync correct

### Notes:
```
| Tanggal | Tester | Status |
|--------|--------|--------|
| | | |
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
| Offline | | | | | |
| **TOTAL** | | | | |

### Overall Status: 

### Sign Off:
| Role | Nama | Tanggal | Tanda Tangan |
|------|------|---------|--------------|
| QA | | | |
| Dev | | | |
| PM | | | |