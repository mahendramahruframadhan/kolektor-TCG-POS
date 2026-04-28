# Guidebook KolektorPos

## 1. Overview Project

**KolektorPos** adalah aplikasi Point-of-Sale (POS) private untuk booth TCG (Trading Card Game) yang dioperasikan oleh Revota + 10 rekan di convention Indonesia.

### Karakteristik Utama
- **Offline-first**: Semua operasi kasir berfungsi tanpa internet
- **Single-booth**: Satu booth, 11 pengguna (1 admin + 10 kasir)
- **Self-hosted**: Deploy di VPS sendiri
- **Local-first PWA**: React + Vite + Dexie (IndexedDB)
- **Backend**: Fastify + SQLite

### Teknologi
| Komponen | Tech Stack |
|---------|----------|
| Frontend Web | React 19 + Tailwind 3 + Vite 6 |
| Backend API | Fastify 5 + better-sqlite3 |
| Database | Drizzle ORM + SQLite |
| State | Zustand (UI), TanStack Query (server) |
| Sync | Background sync 60 detik |
| Auth | Session cookie (30 hari rolling) |

---

## 2. Arsitektur

```
┌─────────────────────────────────────────────┐
│           PWA (localhost:5173)            │
│  ┌─────────────────────────────────────┐ │
│  │  IndexedDB (Dexie)                  │ │
│  │  - Cards, Carts, Transactions      │ │
│  │  - Offline-first reads/writes     │ │
│  └─────────────────────────────────────┘ │
│                    │                     │
│                    ▼                     │
│         ┌──────────────────┐             │
│         │  Sync Server    │◄───online   │
│         │ (localhost:3001)│             │
│         └──────────────────┘             │
└─────────────────────────────────────────────┘
```

---

## 3. Fitur Utama

### 3.1 Kasir (Cashier)
| # | Fitur | Deskripsi |
|---|-------|----------|
| F1 | Fixed-price cards | Kartu dengan harga tetap |
| F2 | Negotiable cards | Kartu dengan harga bisa nego (bottom price) |
| F3 | Event tagging | Penjualan dikaitkan dengan event aktif |
| F4 | QR/barcode scan | Kamera atau USB scanner |
| F5 | QR printing | Cetak label kartu 50×25mm |
| F6 | Short card ID | Format O-XXXXX |
| F7 | Payment channels | Cash, BCA, Mandiri, GoPay, dll |
| F10 | Masked numbers | Harga disembunyikan, tap untuk lihat |
| F11 | Bottom price protection | Tidak bisa jual di bawah bottom price |
| F12 | Max discount protection | Batasan diskon kasir |

### 3.2 Admin
| # | Fitur | Deskripsi |
|---|-------|----------|
| F13 | User management | Tambah/hapus user |
| F14 | Event management | Buat/update event |
| F15 | Override | Override bottom/discount |
| F16 | Void/Refund | Batalkan transaksi |
| F17 | Oversold queue | Tangani konflik oversell |
| F18 | Cash reconciliation | RekonsiliasiKas |
| F19 | Audit log | Semua aktivitas |
| F20 | Reports | Daily, monthly, settlement |
| F21 | Settings | Pengaturan sistem |
| F22 | Backup | Download database |

### 3.3 Transaksi
| Kind | Deskripsi |
|------|----------|
| `sale` | Penjualan normal |
| `void` | Pembatalan transaksi |
| `refund` | Pengembalian dana |

---

## 4. role User

| Role | Jumlah | Kemampuan |
|------|--------|----------|
| Admin | 1 | Semua: user management, event, override, void/refund, settings, backup |
| Cashier | 10 | Stock-receive, sell, accept payment, view own payout |

---

## 5. API Endpoints

### 5.1 Auth
| Method | Endpoint | Deskripsi |
|--------|----------|---------|
| POST | `/auth/login` | Login |
| POST | `/auth/logout` | Logout |
| POST | `/auth/change-password` | Ganti password |
| GET | `/auth/me` | Info user aktif |

### 5.2 Users
| Method | Endpoint | Deskripsi |
|--------|----------|---------|
| GET | `/users` | List users |
| POST | `/users` | Buat user |
| PATCH | `/users/:id` | Update user |
| DELETE | `/users/:id` | Hapus user |

### 5.3 Events
| Method | Endpoint | Deskripsi |
|--------|----------|---------|
| GET | `/events` | List events |
| POST | `/events` | Buat event |
| PATCH | `/events/:id` | Update event |

### 5.4 Cards
| Method | Endpoint | Deskripsi |
|--------|----------|---------|
| GET | `/cards` | List cards |
| POST | `/cards` | Stock-receive card |
| PATCH | `/cards/:id` | Update card |

### 5.5 Carts
| Method | Endpoint | Deskripsi |
|--------|----------|---------|
| GET | `/carts` | List carts |
| POST | `/carts` | Buat cart |
| POST | `/carts/:id/add` | Tambah item |
| POST | `/carts/:id/pay` | Bayar |

### 5.6 Transactions
| Method | Endpoint | Deskripsi |
|--------|----------|---------|
| GET | `/transactions` | List transactions |
| GET | `/transactions/:id` | Detail transaksi |
| POST | `/transactions` | Buat transaksi |
| POST | `/transactions/:id/void` | Void |
| POST | `/transactions/:id/refund` | Refund |

### 5.7 Reports
| Method | Endpoint | Deskripsi |
|--------|----------|---------|
| GET | `/settlement/daily` | Laporan harian |
| GET | `/settlement/monthly` | Laporan bulanan |
| GET | `/settlement/event/:id` | Settlement per event |

### 5.8 Admin
| Method | Endpoint | Deskripsi |
|--------|----------|---------|
| GET | `/settings` | Get settings |
| PUT | `/settings/:key` | Update setting |
| GET | `/audit-log` | Audit log |
| GET | `/backup` | Download backup |
| GET | `/oversold` | Oversold queue |

### 5.9 Sync
| Method | Endpoint | Deskripsi |
|--------|----------|---------|
| POST | `/sync/push` | Push perubahan |
| GET | `/sync/pull` | Pull perubahan |

### 5.10 Health
| Method | Endpoint | Deskripsi |
|--------|----------|---------|
| GET | `/health` | Health check |
| GET | `/health/ready` | Ready check |

---

## 6. Database Schema

### Tables Utama
- `users` - User (admin, cashier)
- `events` - Event convention
- `cards` - Kartu (inventory)
- `carts` - Keranjang belanja
- `cart_items` - Item dalam cart
- `transactions` - Transaksi (append-only)
- `transaction_items` - Item transaksi
- `payment_channels` - Channel pembayaran
- `settings` - Pengaturan sistem
- `audit_log` - Log aktivitas

### Aturan Khusus
- **transactions** & **transaction_items**: append-only (tidak bisa update/delete)
- **owner_user_id_snapshot**: snapshot saat transaksi untuk settlement
- **bottom_price**: floor protection, tidak bisa jual di bawah ini

---

## 7. Cara Menjalankan

### 7.1 Setup
```bash
# Install dependencies
pnpm install

# Copy environment
cp .env.example .env

# Edit .env
SESSION_SECRET=<32+ char random>
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=min8char
```

### 7.2 Menjalankan
```bash
# Development (web :5173, api :3001)
pnpm dev

# Build
pnpm build

# Test
pnpm test
```

### 7.3 Login Default
- Email: `admin@kolekta.id`
- Password: (sesuai ADMIN_PASSWORD di .env)

---

## 8. Halaman Web

| Path | Deskripsi |
|------|----------|
| `/login` | Login |
| `/dashboard` | Dashboard utama |
| `/scan` | Scan kartu |
| `/cart` | Keranjang |
| `/inventory` | Inventory kartu |
| `/transactions` | Riwayat transaksi |
| `/reports` | Laporan |
| `/users` | Manajemen user |
| `/events` | Manajemen event |
| `/settings` | Pengaturan |
| `/oversold` | Queue oversold |
| `/admin` | Admin tools |

---

## 9. Aturan Bisnis

1. **Bottom price adalah floor** - kasir tidak bisa jual di bawah bottom price
2. **Append-only transactions** - tidak ada delete, koreksi via void/refund
3. **Snapshot untuk settlement** - owner_user_id di-snapshot saat transaksi
4. **Offline-first** - semua operasi bekerja tanpa internet
5. **Cart locking** - kartu di-lock saat masuk cart untuk mencegah oversell

---

## 10. Catatan Penting

- Semua harga dalam integer IDR (tanpa desimal)
- Bottom price tidak ditampilkan di checkout secara default
- Tap-and-hold 5 detik untuk melihat harga sensitif
- 30-day rolling session
- Sync otomatis setiap 60 detik saat online