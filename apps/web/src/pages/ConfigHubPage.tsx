import React from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Tag, Users, Calendar, CreditCard, AlertTriangle, ShieldAlert, ClipboardList, Settings2, type LucideIcon,
} from "lucide-react";
import { MobileAppBar } from "../components/MobileAppBar.js";

interface HubItem {
  to: string;
  Icon: LucideIcon;
  label: string;
  description: string;
}

const HUB_ITEMS: HubItem[] = [
  { to: "/config/app",               Icon: Settings2,      label: "Pengaturan Aplikasi",  description: "Diskon, TTL keranjang, halaman awal" },
  { to: "/labels",                   Icon: Tag,             label: "Cetak Label QR",       description: "Generate & cetak label kartu" },
  { to: "/config/users",             Icon: Users,           label: "Kelola Pengguna",      description: "Tambah, edit, nonaktifkan akun" },
  { to: "/config/events",            Icon: Calendar,        label: "Kelola Event",         description: "Buat & atur event penjualan" },
  { to: "/config/payment-channels",  Icon: CreditCard,      label: "Metode Pembayaran",    description: "Aktifkan & urutkan saluran bayar" },
  { to: "/config/oversold",          Icon: AlertTriangle,   label: "Antrian Oversold",     description: "Tangani kartu yang terjual ganda" },
  { to: "/config/overrides",         Icon: ShieldAlert,     label: "Riwayat Override",     description: "Log persetujuan harga di bawah floor" },
  { to: "/config/audit-log",         Icon: ClipboardList,   label: "Audit Log",            description: "Riwayat aksi admin di sistem" },
  { to: "/admin/pending-transactions", Icon: ClipboardList, label: "Transaksi Pending",    description: "Transaksi yang belum diselesaikan" },
];

export function ConfigHubPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-surface bg-dotted-overlay flex flex-col">
      <MobileAppBar title="Konfigurasi" back onBack={() => navigate("/dashboard")} />

      <div className="flex-1 overflow-y-auto max-w-xl mx-auto w-full p-4">
        <div className="bg-card rounded-2xl border border-border divide-y divide-border">
          {HUB_ITEMS.map(({ to, Icon, label, description }) => (
            <Link
              key={to}
              to={to}
              className="flex items-center gap-4 px-4 py-4 hover:bg-muted transition active:bg-muted"
            >
              <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Icon className="w-5 h-5 text-primary" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-fg">{label}</p>
                <p className="text-xs text-muted-fg">{description}</p>
              </div>
              <svg className="w-4 h-4 text-muted-fg shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
