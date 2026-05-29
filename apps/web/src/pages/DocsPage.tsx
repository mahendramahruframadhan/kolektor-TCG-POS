import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronDown, ChevronRight, BookOpen, Zap, Info, QrCode, ShoppingCart,
  Package, BarChart2, Settings, WifiOff, Upload, List,
} from "lucide-react";
import { MobileAppBar } from "../components/MobileAppBar.js";

interface Section {
  id: string;
  title: string;
  icon: React.ReactNode;
  content: React.ReactNode;
}

function Accordion({ section }: { section: Section }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-card rounded-2xl border border-border overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-4 text-left hover:bg-muted transition"
      >
        <span className="text-muted-fg shrink-0">{section.icon}</span>
        <span className="flex-1 font-bold text-fg text-sm">{section.title}</span>
        {open
          ? <ChevronDown className="w-4 h-4 text-muted-fg shrink-0" />
          : <ChevronRight className="w-4 h-4 text-muted-fg shrink-0" />
        }
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1 text-sm text-fg space-y-3 border-t border-border">
          {section.content}
        </div>
      )}
    </div>
  );
}

const SECTIONS: Section[] = [
  {
    id: "getting-started",
    title: "Memulai",
    icon: <Zap className="w-5 h-5" />,
    content: (
      <ol className="space-y-3 list-none">
        {[
          { step: "1", text: "Login dengan akun yang diberikan Admin. Jika sudah pernah login online sebelumnya, kamu bisa login offline selama 7 hari tanpa koneksi." },
          { step: "2", text: "Di halaman Dashboard, lihat event aktif dan statistik penjualan hari ini." },
          { step: "3", text: "Tap 'Mulai Kasir' untuk memulai sesi kasir. Scan QR kartu, ketik ID kartu (O-XXXXX), atau cari berdasarkan judul / nomor sertifikasi (cert number)." },
          { step: "4", text: "Kartu yang discan masuk ke keranjang. Pilih metode pembayaran dan selesaikan transaksi." },
          { step: "5", text: "Gunakan 'Terima Stok' untuk mendaftarkan kartu baru dan cetak label QR-nya." },
          { step: "6", text: "Transaksi offline tersimpan lokal dan otomatis disinkronkan ke server saat koneksi tersedia. Tap tombol Sync untuk sinkronisasi manual." },
        ].map(({ step, text }) => (
          <li key={step} className="flex gap-3 items-start">
            <span className="w-6 h-6 rounded-full bg-primary flex items-center justify-center text-xs font-extrabold text-primary-fg shrink-0 mt-0.5">
              {step}
            </span>
            <span className="text-muted-fg leading-relaxed">{text}</span>
          </li>
        ))}
      </ol>
    ),
  },
  {
    id: "kasir",
    title: "Bantuan — Kasir (POS)",
    icon: <ShoppingCart className="w-5 h-5" />,
    content: (
      <ul className="space-y-2 text-muted-fg">
        <li className="leading-relaxed"><strong className="text-fg">Cari kartu:</strong> Scan QR/barcode, ketik ID kartu (O-XXXXX), cari berdasarkan judul, atau masukkan nomor sertifikasi (cert number) graded card.</li>
        <li className="leading-relaxed"><strong className="text-fg">Info kartu:</strong> Setiap kartu menampilkan kondisi, bahasa, grading, dan nomor sertifikasi langsung di keranjang.</li>
        <li className="leading-relaxed"><strong className="text-fg">Harga negosiasi:</strong> Kartu dengan mode "Negosiasi" memiliki harga tayang dan harga minimum. Input harga final — tidak boleh di bawah harga minimum tanpa override Admin.</li>
        <li className="leading-relaxed"><strong className="text-fg">Diskon:</strong> Diskon per item tersedia untuk harga negosiasi. Diskon total transaksi memerlukan alasan.</li>
        <li className="leading-relaxed"><strong className="text-fg">Metode pembayaran:</strong> Pilih metode (Tunai, Transfer, QRIS, dll.) yang sudah diaktifkan Admin. Bisa tambah catatan pembayaran.</li>
        <li className="leading-relaxed"><strong className="text-fg">Void / Refund:</strong> Tersedia di halaman Riwayat Transaksi atau Detail Transaksi untuk transaksi yang sudah selesai.</li>
      </ul>
    ),
  },
  {
    id: "inventaris",
    title: "Bantuan — Inventaris",
    icon: <Package className="w-5 h-5" />,
    content: (
      <ul className="space-y-2 text-muted-fg">
        <li className="leading-relaxed"><strong className="text-fg">Cari kartu:</strong> Cari berdasarkan judul, ID pendek, atau nomor sertifikasi.</li>
        <li className="leading-relaxed"><strong className="text-fg">Filter status:</strong> Saring kartu berdasarkan Tersedia, Ditahan, Terjual, atau semua status.</li>
        <li className="leading-relaxed"><strong className="text-fg">Info kartu:</strong> Detail kondisi, bahasa, grading company, grade, dan cert number tampil langsung di kartu.</li>
        <li className="leading-relaxed"><strong className="text-fg">Harga tersembunyi:</strong> Harga minimum (bottom price) tersembunyi secara default. Tap ikon mata untuk menampilkan/menyembunyikan.</li>
        <li className="leading-relaxed"><strong className="text-fg">Cetak label:</strong> Pergi ke Konfigurasi → Cetak Label QR untuk mencetak stiker kartu.</li>
      </ul>
    ),
  },
  {
    id: "label",
    title: "Bantuan — Cetak Label QR",
    icon: <QrCode className="w-5 h-5" />,
    content: (
      <ul className="space-y-2 text-muted-fg">
        <li className="leading-relaxed"><strong className="text-fg">Pilih kartu:</strong> Centang kartu yang ingin dicetak labelnya. Bisa pilih semua sekaligus.</li>
        <li className="leading-relaxed"><strong className="text-fg">Ukuran label:</strong> 50×25mm (landscape), cocok untuk thermal label printer maupun inkjet.</li>
        <li className="leading-relaxed"><strong className="text-fg">Cetak:</strong> Klik tombol Cetak untuk membuka dialog cetak browser. Atur ukuran kertas sesuai label stiker yang dipakai.</li>
        <li className="leading-relaxed"><strong className="text-fg">Tempel di kartu:</strong> Label berisi QR code dan ID pendek (O-XXXXX) yang bisa discan saat checkout.</li>
      </ul>
    ),
  },
  {
    id: "transaksi",
    title: "Bantuan — Riwayat Transaksi",
    icon: <List className="w-5 h-5" />,
    content: (
      <ul className="space-y-2 text-muted-fg">
        <li className="leading-relaxed"><strong className="text-fg">Filter:</strong> Saring transaksi berdasarkan tanggal, event, jenis (Penjualan/Void/Refund), pemilik kartu, atau metode pembayaran.</li>
        <li className="leading-relaxed"><strong className="text-fg">Paginasi:</strong> Ditampilkan 50 transaksi per halaman, urut terbaru terlebih dahulu.</li>
        <li className="leading-relaxed"><strong className="text-fg">Detail transaksi:</strong> Tap baris transaksi untuk melihat detail item, kasir, channel pembayaran, dan catatan.</li>
        <li className="leading-relaxed"><strong className="text-fg">Nama kasir &amp; pemilik:</strong> Setiap baris menampilkan nama kasir dan total harga final.</li>
      </ul>
    ),
  },
  {
    id: "laporan",
    title: "Bantuan — Laporan",
    icon: <BarChart2 className="w-5 h-5" />,
    content: (
      <ul className="space-y-2 text-muted-fg">
        <li className="leading-relaxed"><strong className="text-fg">Settlement per event:</strong> Lihat total penjualan dan pembagian per pemilik kartu untuk suatu event. Hanya Admin yang bisa menutup settlement.</li>
        <li className="leading-relaxed"><strong className="text-fg">Laporan bulanan:</strong> Ringkasan transaksi berdasarkan bulan, tahun, dan (opsional) event.</li>
        <li className="leading-relaxed"><strong className="text-fg">Payout saya:</strong> Kasir bisa melihat ringkasan payout kartu milik mereka sendiri.</li>
        <li className="leading-relaxed"><strong className="text-fg">Rekonsiliasi kas:</strong> Bandingkan kas yang diharapkan vs yang dihitung secara fisik di akhir hari.</li>
      </ul>
    ),
  },
  {
    id: "bulk-import",
    title: "Bantuan — Import Massal",
    icon: <Upload className="w-5 h-5" />,
    content: (
      <ul className="space-y-2 text-muted-fg">
        <li className="leading-relaxed"><strong className="text-fg">Format file:</strong> Upload file CSV dengan kolom: title, set_name, set_number, rarity, language, condition, pricing_mode, price_idr, listed_price_idr, bottom_price_idr, is_graded, grading_company, grade, cert_number, category.</li>
        <li className="leading-relaxed"><strong className="text-fg">Normalisasi otomatis:</strong> Nilai condition, language, grading_company, dan pricing_mode dicocokkan secara case-insensitive (misal "near mint" → "Near Mint").</li>
        <li className="leading-relaxed"><strong className="text-fg">Hasil import:</strong> Setiap baris dilaporkan sebagai berhasil atau gagal beserta alasan error spesifik.</li>
        <li className="leading-relaxed"><strong className="text-fg">Akses:</strong> Tersedia di menu Terima Stok → Import Massal. Hanya tersedia saat online.</li>
      </ul>
    ),
  },
  {
    id: "offline",
    title: "Bantuan — Mode Offline & Sinkronisasi",
    icon: <WifiOff className="w-5 h-5" />,
    content: (
      <ul className="space-y-2 text-muted-fg">
        <li className="leading-relaxed"><strong className="text-fg">Login offline:</strong> Setelah login online minimal sekali, kamu bisa login tanpa internet selama 7 hari. Credential tersimpan aman di perangkat.</li>
        <li className="leading-relaxed"><strong className="text-fg">Transaksi offline:</strong> Semua transaksi tersimpan lokal di IndexedDB. Tidak ada yang hilang saat offline.</li>
        <li className="leading-relaxed"><strong className="text-fg">Sinkronisasi otomatis:</strong> Setiap 60 detik, atau saat koneksi baru terdeteksi, aplikasi otomatis sinkronisasi ke server.</li>
        <li className="leading-relaxed"><strong className="text-fg">Tombol Sync:</strong> Tap tombol Sync di app bar untuk sinkronisasi manual. Badge angka menunjukkan jumlah transaksi yang belum disinkronkan.</li>
        <li className="leading-relaxed"><strong className="text-fg">Transaksi gagal sync:</strong> Jika sinkronisasi gagal, status ditandai "error" dan akan dicoba lagi di sinkronisasi berikutnya.</li>
        <li className="leading-relaxed"><strong className="text-fg">Oversold:</strong> Dua perangkat offline bisa menjual kartu yang sama. Kartu tersebut ditandai "oversold" dan masuk antrian Admin untuk ditangani.</li>
      </ul>
    ),
  },
  {
    id: "admin",
    title: "Bantuan — Admin",
    icon: <Settings className="w-5 h-5" />,
    content: (
      <ul className="space-y-2 text-muted-fg">
        <li className="leading-relaxed"><strong className="text-fg">Konfigurasi (/config):</strong> Hub utama semua pengaturan Admin. Akses dari sidebar atau Dashboard.</li>
        <li className="leading-relaxed"><strong className="text-fg">Kelola Pengguna:</strong> Tambah, edit, dan atur peran (Admin / Kasir) pengguna KolektaPOS.</li>
        <li className="leading-relaxed"><strong className="text-fg">Kelola Event:</strong> Buat event baru, atur tanggal, dan ubah status (Draft / Aktif / Selesai).</li>
        <li className="leading-relaxed"><strong className="text-fg">Metode Pembayaran:</strong> Aktifkan, nonaktifkan, dan urutkan metode pembayaran. Tunai dan "Lainnya" tidak bisa dihapus. Metode yang sudah dipakai di transaksi tidak bisa dihapus.</li>
        <li className="leading-relaxed"><strong className="text-fg">Antrian Oversold:</strong> Kartu yang terjual ganda (offline bersamaan) masuk antrian ini untuk void/refund manual.</li>
        <li className="leading-relaxed"><strong className="text-fg">Transaksi Pending:</strong> Lihat dan kelola transaksi yang belum disinkronkan dari perangkat kasir.</li>
        <li className="leading-relaxed"><strong className="text-fg">Riwayat Override:</strong> Log semua persetujuan harga di bawah floor price oleh Admin.</li>
        <li className="leading-relaxed"><strong className="text-fg">Audit Log:</strong> Riwayat lengkap aksi Admin di sistem, 50 entri per halaman.</li>
        <li className="leading-relaxed"><strong className="text-fg">Pengaturan Aplikasi:</strong> Atur batas diskon per item, batas diskon total transaksi, TTL keranjang idle, dan halaman awal default.</li>
      </ul>
    ),
  },
  {
    id: "about",
    title: "Tentang KolektaPOS",
    icon: <Info className="w-5 h-5" />,
    content: (
      <div className="space-y-3 text-muted-fg">
        <p className="leading-relaxed">
          <strong className="text-fg">KolektaPOS</strong> adalah sistem kasir offline-first yang dirancang
          khusus untuk booth TCG Sales Revota &amp; co-owners di konvensi Indonesia.
        </p>
        <p className="leading-relaxed">
          Semua transaksi tersimpan lokal di perangkat dan disinkronkan ke server saat koneksi tersedia.
          Operasi kasir 100% berjalan tanpa internet.
        </p>
        <div className="border border-border rounded-xl p-3 space-y-1 text-xs">
          <p><span className="font-bold text-fg">Versi:</span> 2026.05.239</p>
          <p><span className="font-bold text-fg">Pengguna:</span> 11 co-owners, 1 booth</p>
          <p><span className="font-bold text-fg">Penggunaan:</span> Internal — tidak untuk publik</p>
          <p><span className="font-bold text-fg">Dibuat oleh:</span> <a href="https://revota.id" target="_blank" rel="noopener noreferrer" className="text-primary underline">Revota</a> — consulting firm specializing in business systems</p>
        </div>
      </div>
    ),
  },
];

export function DocsPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-surface bg-dotted-overlay flex flex-col">
      <MobileAppBar
        title="Bantuan & Docs"
        back
        onBack={() => navigate(-1)}
      />

      <main id="main-content" className="flex-1 overflow-y-auto max-w-xl mx-auto w-full p-4 space-y-3">
        <div className="flex items-center gap-3 pt-1 pb-1">
          <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center shrink-0">
            <BookOpen className="w-5 h-5 text-primary-fg" />
          </div>
          <div>
            <p className="text-sm font-bold text-fg">Dokumentasi KolektaPOS</p>
            <p className="text-xs text-muted-fg">Panduan penggunaan &amp; referensi fitur</p>
          </div>
        </div>

        {SECTIONS.map((section) => (
          <Accordion key={section.id} section={section} />
        ))}
      </main>
    </div>
  );
}
