# QA Document - KolektorPos

## Tanggal: 28 April 2026

---

## 1. Kondisi Saat Ini (Current Status)

### 1.1 Build Status
| Komponen | Status | Notes |
|----------|--------|-------|
| API Server (:3001) | ✅ Running | |
| Web (:5173) | ✅ Running | |
| Database | ✅ Ready | kolektapos.sqlite |
| Auth | ✅ Working | admin@kolekta.id |

### 1.2 Server Information
- **API**: http://localhost:3001
- **Web**: http://localhost:5173
- **Admin Email**: admin@kolekta.id

---

## 2. Todo List (Perbaikan/Fitur yang Perlu Ditambahkan)

### 2.1 Prioritas Tinggi 🔴
| # | Item | Status | Notes |
|---|------|--------|-------|
| 1 | Setup default payment channels | ⬜ | Belum ada channel pembayaran |
| 2 | Setup settings default | ⬜ | max_line_discount_pct, dll |
| 3 | Test stock-receive card | ⬜ | |
| 4 | Test scan card | ⬜ | |
| 5 | Test add to cart | ⬜ | |
| 6 | Test payment | ⬜ | |
| 7 | Test void transaction | ⬜ | |
| 8 | Test refund | ⬜ | |

### 2.2 Prioritas Sedang 🟡
| # | Item | Status | Notes |
|---|------|--------|-------|
| 9 | Test offline mode | ⬜ | |
| 10 | Test sync push/pull | ⬜ | |
| 11 | Test backup download | ⬜ | |
| 12 | Test settlement reports | ⬜ | |
| 13 | Test audit log | ⬜ | |
| 14 | Test user management | ⬜ | |
| 15 | Test event management | ⬜ | |

### 2.3 Prioritas Rendah 🟢
| # | Item | Status | Notes |
|---|------|--------|-------|
| 16 | Test oversold queue | ⬜ | |
| 17 | Test override bottom price | ⬜ | |
| 18 | Test QR printing | ⬜ | |
| 19 | Test masked numbers | ⬜ | |
| 20 | Test cash reconciliation | ⬜ | |

---

## 3. Testing Checklist

### 3.1 Authentication
- [ ] Login dengan credensial benar
- [ ] Login dengan password salah
- [ ] Logout berhasil
- [ ] Change password

### 3.2 Kasir (Cashier Flow)
- [ ] Stock-receive fixed price card
- [ ] Stock-receive negotiable card
- [ ] Scan card via kamera
- [ ] Scan card via USB scanner
- [ ] Add card ke cart
- [ ] Remove card dari cart
- [ ] Apply discount (di bawah limit)
- [ ] Apply discount (di atas limit → perlu override)
- [ ] Checkout dengan payment channel
- [ ] Receive payment

### 3.3 Admin Functions
- [ ] Create event
- [ ] Close event
- [ ] Create user (cashier)
- [ ] Delete user
- [ ] View transaction
- [ ] Void transaction
- [ ] Refund transaction
- [ ] View audit log
- [ ] Download backup
- [ ] Update settings

### 3.4 Reports
- [ ] Daily report
- [ ] Monthly report
- [ ] Settlement per event
- [ ] Export ke CSV/Excel

### 3.5 Offline Mode
- [ ] Login offline
- [ ] Scan offline
- [ ] Cart offline
- [ ] Payment offline
- [ ] Sync setelah online

---

## 4. Bugs

### 4.1 Bugs Diketahui
| # | Deskripsi | Severity | Status | Notes |
|---|----------|----------|--------|-------|
| 1 | | | | |
| 2 | | | | |
| 3 | | | | |

### 4.2 Cara Melaporkan Bugs
1. Ambil screenshot error
2. Catat langkah reproduksi
3. Catat expected vs actual result
4. Catat browser dan versi
5. Catat timestamp

---

## 5. Catatan Testing

### 5.1 Pre-Condition
- [ ] API server running di port 3001
- [ ] Web running di port 5173
- [ ] Database ter-initialize
- [ ] User admin sudah dibuat

### 5.2 Test Data yang Dibutuhkan
- [ ] Minimal 1 event aktif
- [ ] Minimal 1 payment channel
- [ ] Minimal 1 user cashier
- [ ] Beberapa sample cards

---

## 6. Rencana Testing

### Fase 1: Basic Flow (Login → Sale)
1. Login
2. Create event
3. Setup payment channels
4. Stock-receive card
5. Scan card
6. Add to cart
7. Checkout

### Fase 2: Admin Features
1. View transactions
2. Generate reports
3. User management

### Fase 3: Edge Cases
1. Void transaction
2. Refund
3. Override bottom price
4. Oversold scenario

### Fase 4: Offline Mode
1. Offline login
2. Offline sale
3. Sync after online

---

## 7. Riwayat Testing

| Tanggal | Tester | Aktivitas | Result |
|---------|--------|----------|--------|
| 28 Apr 2026 | QA | Setup environment | ✅ Berhasil |
| 28 Apr 2026 | QA | API running | ✅ Berhasil |
| 28 Apr 2026 | QA | Web running | ✅ Berhasil |
| 28 Apr 2026 | QA | Login admin | ⏳ Still testing |