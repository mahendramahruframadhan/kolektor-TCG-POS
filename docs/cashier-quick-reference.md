# Panduan Kasir KolektaPOS

*Cetak dan tempel di booth. Bahasa ringkas untuk kasir.*

---

## Format ID Kartu

```
X-XXXXX
│ └─────── 5 karakter acak (A-Z, 0-9)
└───────── karakter pemilik (0-9 atau A)
```

Contoh: `0-ABC12`, `A-ZZZ99`

---

## Alur Kasir (Online)

1. **Scan** → arahkan kamera atau tempelkan USB scanner ke input besar
2. **Review kartu** → pastikan judul dan kondisi benar
3. **Tambah ke Keranjang** → tekan tombol biru
4. **Ulangi** untuk kartu berikutnya
5. **Bayar** → pilih metode pembayaran → masukkan nominal → konfirmasi
6. **Struk** → cetak atau tekan "Transaksi Baru"

---

## Alur Kasir (Offline)

Prosedur **sama persis** dengan online. Perbedaannya:

- Struk menampilkan: *"Tersimpan lokal — akan disinkronkan saat kembali online"*
- SyncDot (pojok kanan atas) menampilkan angka pending
- Transaksi dikirim otomatis saat koneksi pulih

**Jangan restart atau tutup browser saat ada pending transaksi.**

---

## Ikon Status SyncDot

| Ikon | Warna | Artinya |
|------|-------|---------|
| ✓ | Hijau | Tersinkron |
| ↻ | Kuning | Sedang sinkron |
| ✈ | Abu | Offline manual |
| ✗ | Merah | Error — hubungi admin |

---

## Status Kartu

| Status | Artinya |
|--------|---------|
| Tersedia | Bisa dijual |
| Ditahan | Ada hold aktif |
| Di keranjang Anda | Sudah di keranjang ini |
| Di keranjang lain | Dipakai kasir lain |
| Terjual | Sudah laku |

---

## Masalah Umum

**"Kartu tidak ditemukan"** → Scan ulang; jika masih gagal, logout dan login ulang (memaksa sync ulang).

**"Harga di bawah minimum"** → Harga yang dimasukkan lebih rendah dari batas bawah. Minta persetujuan admin untuk override.

**"Kartu di keranjang lain"** → Kasir lain sedang checkout kartu ini. Tunggu atau koordinasi.

**SyncDot merah** → Hubungi admin. Jangan tutup browser.

---

## Scorcodes / Shortcut

- `Enter` setelah scan → proses scan
- Klik scan input → fokus ke scanner
- Tombol "Transaksi Baru" → reset ke scan berikutnya
