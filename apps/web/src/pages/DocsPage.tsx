import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, ChevronRight, BookOpen, Zap, Info, QrCode, ShoppingCart, Package, BarChart2, Settings } from "lucide-react";
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
    title: "Getting Started",
    icon: <Zap className="w-5 h-5" />,
    content: (
      <ol className="space-y-3 list-none">
        {[
          { step: "1", text: "Login dengan akun yang diberikan oleh Admin. Gunakan email dan password kamu." },
          { step: "2", text: "Di halaman Dashboard, kamu bisa melihat event aktif dan statistik penjualan hari ini." },
          { step: "3", text: "Tap 'Mulai Kasir' untuk memulai sesi kasir. Scan barcode kartu atau ketik ID kartu." },
          { step: "4", text: "Kartu yang discan akan masuk ke keranjang. Pilih kanal pembayaran dan selesaikan transaksi." },
          { step: "5", text: "Gunakan 'Intake Kartu' untuk mendaftarkan kartu baru ke sistem dan cetak label QR." },
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
        <li className="leading-relaxed"><strong className="text-fg">Scan kartu:</strong> Arahkan kamera ke QR/barcode kartu, atau ketik ID kartu (format O-XXXXX) di kolom pencarian.</li>
        <li className="leading-relaxed"><strong className="text-fg">Harga negosiasi:</strong> Beberapa kartu memiliki harga tayang dan harga minimum. Kamu bisa input harga final selama tidak di bawah harga minimum.</li>
        <li className="leading-relaxed"><strong className="text-fg">Diskon:</strong> Diskon per item tersedia untuk kartu dengan harga negosiasi. Diskon total transaksi memerlukan alasan.</li>
        <li className="leading-relaxed"><strong className="text-fg">Pembayaran:</strong> Pilih kanal (Tunai, Transfer, QRIS, dll.) dan selesaikan transaksi.</li>
        <li className="leading-relaxed"><strong className="text-fg">Void / Refund:</strong> Tersedia di halaman Laporan untuk transaksi yang sudah selesai.</li>
      </ul>
    ),
  },
  {
    id: "inventaris",
    title: "Bantuan — Inventaris",
    icon: <Package className="w-5 h-5" />,
    content: (
      <ul className="space-y-2 text-muted-fg">
        <li className="leading-relaxed"><strong className="text-fg">Cari kartu:</strong> Gunakan kolom pencarian berdasarkan judul atau ID pendek kartu.</li>
        <li className="leading-relaxed"><strong className="text-fg">Filter status:</strong> Saring kartu berdasarkan Tersedia, Ditahan, atau Terjual.</li>
        <li className="leading-relaxed"><strong className="text-fg">Harga tersembunyi:</strong> Harga minimum (bottom price) tersembunyi secara default. Tap dan tahan 5 detik ikon mata untuk melihatnya.</li>
        <li className="leading-relaxed"><strong className="text-fg">Cetak label:</strong> Pergi ke menu Cetak Label QR untuk mencetak stiker kartu.</li>
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
        <li className="leading-relaxed"><strong className="text-fg">Tempel di kartu:</strong> Label berisi QR code dan ID pendek kartu yang bisa discan saat checkout.</li>
      </ul>
    ),
  },
  {
    id: "laporan",
    title: "Bantuan — Laporan",
    icon: <BarChart2 className="w-5 h-5" />,
    content: (
      <ul className="space-y-2 text-muted-fg">
        <li className="leading-relaxed"><strong className="text-fg">Settlement per event:</strong> Lihat total penjualan dan pembagian per pemilik kartu untuk suatu event.</li>
        <li className="leading-relaxed"><strong className="text-fg">Laporan bulanan:</strong> Ringkasan transaksi berdasarkan bulan dan tahun.</li>
        <li className="leading-relaxed"><strong className="text-fg">Nilai inventaris:</strong> Total nilai listed price semua kartu yang tersedia.</li>
        <li className="leading-relaxed"><strong className="text-fg">Rekonsiliasi kas:</strong> Bandingkan kas yang diharapkan vs yang dihitung secara fisik.</li>
      </ul>
    ),
  },
  {
    id: "admin",
    title: "Bantuan — Admin",
    icon: <Settings className="w-5 h-5" />,
    content: (
      <ul className="space-y-2 text-muted-fg">
        <li className="leading-relaxed"><strong className="text-fg">Kelola Pengguna:</strong> Tambah, edit, dan atur peran (Admin / Kasir) pengguna KolektaPOS.</li>
        <li className="leading-relaxed"><strong className="text-fg">Kelola Event:</strong> Buat event baru, atur tanggal, dan ubah status (Draft / Aktif / Selesai).</li>
        <li className="leading-relaxed"><strong className="text-fg">Oversold Queue:</strong> Kartu yang terjual dua kali (akibat transaksi offline bersamaan) masuk ke antrian ini untuk ditangani manual.</li>
        <li className="leading-relaxed"><strong className="text-fg">Pengaturan:</strong> Atur batas diskon per item, batas diskon total, dan TTL keranjang idle.</li>
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
          khusus untuk booth Pokémon TCG Benny &amp; co-owners di konvensi Indonesia.
        </p>
        <p className="leading-relaxed">
          Aplikasi ini berjalan sepenuhnya tanpa internet. Semua transaksi tersimpan lokal di perangkat,
          dan disinkronkan ke server saat koneksi tersedia (setiap 60 detik atau saat ada koneksi baru).
        </p>
        <div className="border border-border rounded-xl p-3 space-y-1 text-xs">
          <p><span className="font-bold text-fg">Versi:</span> MVP</p>
          <p><span className="font-bold text-fg">Stack:</span> React + Vite PWA · Fastify · SQLite · Dexie</p>
          <p><span className="font-bold text-fg">Pengguna:</span> 11 co-owners, 1 booth</p>
          <p><span className="font-bold text-fg">Penggunaan:</span> Internal — tidak untuk publik</p>
        </div>
      </div>
    ),
  },
];

export function DocsPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      <MobileAppBar
        title="Bantuan & Docs"
        back
        onBack={() => navigate(-1)}
      />

      <main className="flex-1 overflow-y-auto max-w-xl mx-auto w-full p-4 space-y-3">
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
