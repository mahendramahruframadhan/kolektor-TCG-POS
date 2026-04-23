import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Menu, X, ShoppingCart, Package, Plus, BarChart2,
  Settings, Users, Calendar, DollarSign, LogOut,
  KeyRound, BookOpen, Tag, type LucideIcon,
} from "lucide-react";
import { useAuthStore } from "../store/auth.js";
import { api } from "../lib/api.js";

interface NavItem {
  to: string;
  Icon: LucideIcon;
  label: string;
  adminOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: "/pos",       Icon: ShoppingCart, label: "Kasir" },
  { to: "/inventory", Icon: Package,      label: "Inventaris" },
  { to: "/intake",    Icon: Plus,         label: "Intake Kartu" },
  { to: "/reports",   Icon: BarChart2,    label: "Laporan" },
  { to: "/labels",    Icon: Tag,          label: "Cetak Label QR" },
  { to: "/admin",                     Icon: Settings,  label: "Admin",        adminOnly: true },
  { to: "/admin/users",               Icon: Users,     label: "Pengguna",     adminOnly: true },
  { to: "/admin/events",              Icon: Calendar,  label: "Event",        adminOnly: true },
  { to: "/admin/cash-reconciliation", Icon: DollarSign,label: "Rekonsiliasi", adminOnly: true },
];

export function HamburgerMenu() {
  const [open, setOpen] = useState(false);
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();

  async function handleLogout() {
    setOpen(false);
    await api.auth.logout().catch(() => null);
    useAuthStore.getState().setUser(null);
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

        <div className="px-4 py-3 flex items-center gap-3 border-b border-border shrink-0">
          <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center shrink-0">
            <span className="text-xs font-extrabold text-primary-fg">
              {user?.displayName?.[0]?.toUpperCase() ?? "?"}
            </span>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-fg truncate">{user?.displayName}</p>
            <p className="text-[10px] font-extrabold tracking-widest uppercase text-muted-fg">
              {user?.role === "admin" ? "Admin" : "Kasir"}
            </p>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto py-2">
          {visibleItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-4 py-3 text-sm font-semibold text-fg hover:bg-muted transition active:bg-muted"
            >
              <item.Icon className="w-5 h-5 text-muted-fg shrink-0" />
              {item.label}
            </Link>
          ))}

          <div className="border-t border-border my-2 mx-4" />

          <Link
            to="/change-password"
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 px-4 py-3 text-sm font-semibold text-fg hover:bg-muted transition"
          >
            <KeyRound className="w-5 h-5 text-muted-fg shrink-0" />
            Ubah Password
          </Link>

          <Link
            to="/docs"
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 px-4 py-3 text-sm font-semibold text-fg hover:bg-muted transition"
          >
            <BookOpen className="w-5 h-5 text-muted-fg shrink-0" />
            Bantuan &amp; Docs
          </Link>
        </nav>

        <div className="px-4 py-4 border-t border-border shrink-0">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-destructive rounded-xl hover:bg-destructive hover:bg-opacity-10 transition"
          >
            <LogOut className="w-5 h-5 shrink-0" />
            Keluar
          </button>
        </div>
      </div>
    </>
  );
}
