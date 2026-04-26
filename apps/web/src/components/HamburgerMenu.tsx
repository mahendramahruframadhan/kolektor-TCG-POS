import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Menu, X, LayoutDashboard, ShoppingCart, Package, Plus, BarChart2,
  Settings, Users, Calendar, LogOut,
  BookOpen, Tag, Wallet, AlertTriangle, ClipboardList, ShieldAlert, type LucideIcon,
} from "lucide-react";
import { useAuthStore } from "../store/auth.js";
import { api } from "../lib/api.js";
import { queryClient } from "../lib/query-client.js";

interface NavItem {
  to: string;
  Icon: LucideIcon;
  label: string;
  adminOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: "/dashboard", Icon: LayoutDashboard, label: "Dashboard" },
  { to: "/pos",       Icon: ShoppingCart, label: "Kasir" },
  { to: "/inventory", Icon: Package,      label: "Inventaris" },
  { to: "/stock-receive", Icon: Plus,     label: "Stock Receive" },
  { to: "/reports",   Icon: BarChart2,    label: "Laporan" },
  { to: "/labels",     Icon: Tag,          label: "Cetak Label QR" },
  { to: "/my-payout", Icon: Wallet,       label: "Payout Saya" },
  { to: "/settings/users",    Icon: Users,        label: "Kelola Pengguna",  adminOnly: true },
  { to: "/settings/events",   Icon: Calendar,     label: "Kelola Event",     adminOnly: true },
  { to: "/settings/oversold", Icon: AlertTriangle,label: "Antrian Oversold", adminOnly: true },
  { to: "/settings/overrides",Icon: ShieldAlert,  label: "Riwayat Override", adminOnly: true },
  { to: "/settings/audit-log",Icon: ClipboardList,label: "Audit Log",        adminOnly: true },
];

export function HamburgerMenu() {
  const [open, setOpen] = useState(false);
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();

  async function handleLogout() {
    setOpen(false);
    await api.auth.logout().catch(() => null);
    useAuthStore.getState().setUser(null);
    useAuthStore.persist.clearStorage();
    queryClient.clear();
    navigate("/login");
  }

  const visibleItems = NAV_ITEMS.filter((item) => !item.adminOnly || user?.role === "admin");

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-muted transition"
        aria-label="Buka menu"
      >
        <Menu className="w-5 h-5 text-fg" />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/40"
          onClick={() => setOpen(false)}
        />
      )}

      <div
        className={`fixed top-0 right-0 bottom-0 z-50 w-72 bg-card shadow-2xl transition-transform duration-200 flex flex-col ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="h-14 flex items-center justify-between px-4 border-b border-border shrink-0">
          <span className="font-bold text-fg text-sm">Navigasi</span>
          <button
            onClick={() => setOpen(false)}
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-muted transition"
            aria-label="Tutup menu"
          >
            <X className="w-4 h-4 text-fg" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-2">
          {visibleItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-4 py-3 text-sm font-semibold text-fg hover:bg-muted transition active:bg-muted"
            >
              <item.Icon className="w-5 h-5 text-muted-fg shrink-0" aria-hidden="true" />
              {item.label}
            </Link>
          ))}

          <div className="border-t border-border my-2 mx-4" />

          {user?.role === "admin" && (
            <Link
              to="/settings"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-4 py-3 text-sm font-semibold text-fg hover:bg-muted transition"
            >
              <Settings className="w-5 h-5 text-muted-fg shrink-0" aria-hidden="true" />
              Konfigurasi
            </Link>
          )}

          <Link
            to="/docs"
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 px-4 py-3 text-sm font-semibold text-fg hover:bg-muted transition"
          >
            <BookOpen className="w-5 h-5 text-muted-fg shrink-0" aria-hidden="true" />
            Bantuan &amp; Docs
          </Link>
        </nav>

        <div className="flex items-center gap-1 border-t border-border shrink-0">
          <Link
            to="/profile"
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 px-4 py-3 flex-1 min-w-0 hover:bg-muted transition"
          >
            <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center shrink-0">
              <span className="text-xs font-extrabold text-primary-fg">
                {user?.displayName?.[0]?.toUpperCase() ?? "?"}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-fg truncate">{user?.displayName}</p>
              <p className="text-[10px] font-extrabold tracking-widest uppercase text-muted-fg">
                {user?.role === "admin" ? "Admin" : "Kasir"}
              </p>
            </div>
          </Link>
          <button
            onClick={handleLogout}
            className="w-12 h-12 flex items-center justify-center text-destructive hover:bg-destructive hover:bg-opacity-10 transition shrink-0 mr-1"
            aria-label="Keluar"
            title="Keluar"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>
    </>
  );
}
