# Changelog

Format: [CalVer](https://calver.org/) `YYYY.MM.PATCH`. All notable changes documented here.

---

## 2026.05.239 — 2026-05-29

### Added
- **Halaman Konfigurasi hub** (`/config`) — satu titik masuk admin dengan link ke semua halaman pengaturan; mengurangi kepadatan sidebar
- **Riwayat Transaksi** (`/transactions`) — daftar transaksi dengan 5 filter (tanggal, event, jenis, pemilik, akun pembayaran), paginasi 50 baris, nama kasir/pemilik di setiap baris
- **Detail transaksi** — tampilkan kanal pembayaran dan catatan pembayaran
- **Metode Pembayaran admin** (`/config/payment-channels`) — tambah, edit, urut, aktifkan/nonaktifkan kanal; Cash & Other terkunci (tidak bisa dihapus)
- **Komponen MaskedAmount** — toggle ikon mata untuk menyembunyikan/menampilkan harga sensitif (bottom price, payout)
- **Pencarian certNumber** di POS — filter kartu berdasarkan nomor sertifikat grading
- **Bulk import** — normalisasi case-insensitive untuk gradingCompany, condition, language
- **Audit log paginasi** — 50 entri per halaman

### Changed
- Rute `/settings/*` → `/config/*` (tidak ada redirect; greenfield)
- Halaman Pengaturan Aplikasi pindah ke `/config/app`
- Sidebar admin: hapus 7 link individual, ganti satu link "Konfigurasi" → `/config`
- Informasi kartu lengkap ditampilkan ringkas di POS dan Inventaris (CardMeta component)
- Harga tampil langsung di daftar transaksi (tidak dimasking)
- Autofocus ke kolom pencarian di POS saat halaman dimuat

### Fixed
- Redirect ke `/login` saat sesi habis (401)
- Parsing response audit log
- Login offline — sesi gagal tidak lagi memblokir pengguna offline
- IndexedDB reactive sync di halaman admin dan POS
- QR label: tampilkan harga, layout cetak
- Vite alias untuk paket internal (`@kolektapos/*`)
- Grading company validation di bulk import

---

## Sebelum 2026.05.0

Lihat commit history: `git log --oneline`.
