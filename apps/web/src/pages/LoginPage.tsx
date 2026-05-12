import React, { useId, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { api } from "../lib/api.js";
import { idb } from "../lib/db.js";
import { useAuthStore, useOfflineAuthStore } from "../store/auth.js";
import { useSyncStateStore } from "../store/sync-state.js";
import { resetAndSync } from "../lib/background-sync.js";

const LANDING_PAGE_PATHS: Record<string, string> = {
  dashboard: "/dashboard",
  pos: "/pos",
  reports: "/reports",
};

async function resolveLandingPath(): Promise<string> {
  try {
    const setting = await idb.settings.get("default_landing_page");
    const value = typeof setting?.value === "string" ? setting.value : "pos";
    return LANDING_PAGE_PATHS[value] ?? "/pos";
  } catch {
    return "/pos";
  }
}

function OfflineExpiryBanner({ hoursLeft }: { hoursLeft: number }) {
  if (hoursLeft <= 0) return null;
  return (
    <div className="bg-warning bg-opacity-10 border border-warning border-opacity-30 rounded-xl px-4 py-2.5 text-xs font-medium text-warning text-center">
      Logged in offline — expires in {hoursLeft}h
    </div>
  );
}

export function LoginPage() {
  const navigate = useNavigate();
  const setUser = useAuthStore((s) => s.setUser);
  const cacheCredential = useOfflineAuthStore((s) => s.cacheCredential);
  const clearOfflineCredential = useOfflineAuthStore((s) => s.clearOfflineCredential);
  const isOnline = useSyncStateStore((s) => s.effectiveIsOnline);
  const emailId = useId();
  const passwordId = useId();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  interface LoginResponse {
  id: string;
  email: string;
  displayName: string;
  role: string;
  offlineHash?: string;
  allUsersHash?: Array<{
    id: string;
    email: string;
    displayName: string;
    role: string;
    offlineHash: string;
  }>;
}

async function handleOnlineLogin() {
    const response = await api.auth.login(email, password);
    const user = response as LoginResponse;
    setUser(user);

    if (user.role === "admin" && user.allUsersHash) {
      for (const u of user.allUsersHash) {
        cacheCredential({
          email: u.email,
          offlineHash: u.offlineHash,
          id: u.id,
          displayName: u.displayName,
          role: u.role,
        });
      }
    } else if ((user.role === "cashier" || user.role === "admin") && user.offlineHash) {
      cacheCredential({
        email: user.email,
        offlineHash: user.offlineHash,
        id: user.id,
        displayName: user.displayName,
        role: user.role,
      });
    }

    resetAndSync().catch(() => null);
    const landingPath = await resolveLandingPath();
    navigate(landingPath);
  }

  async function handleOfflineLogin() {
    const validateOfflineLogin = useOfflineAuthStore.getState().validateOfflineLogin;
    const setOfflineSession = useOfflineAuthStore.getState().setOfflineSession;
    clearOfflineCredential();

    const offlineUser = validateOfflineLogin(email, password);
    if (!offlineUser) {
      setError("Login offline gagal. Pastikan Anda sudah login online sebelumnya dan credential belum expired (7 hari).");
      return;
    }

    setUser(offlineUser);
    const offlineExpiresAt = offlineUser.id
      ? Date.now() + 7 * 24 * 60 * 60 * 1000
      : Date.now();

    setOfflineSession(offlineUser, offlineExpiresAt);
    const landingPath = await resolveLandingPath();
    navigate(landingPath);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (isOnline) {
        await handleOnlineLogin();
      } else {
        await handleOfflineLogin();
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.message === "Network Error") {
        const offlineUser = useOfflineAuthStore.getState().validateOfflineLogin(email, password);
        if (offlineUser && (offlineUser.role === "cashier" || offlineUser.role === "admin")) {
          const offlineExpiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
          useAuthStore.getState().setUser(offlineUser);
          useOfflineAuthStore.getState().setOfflineSession(offlineUser, offlineExpiresAt);
          const landingPath = await resolveLandingPath();
          navigate(landingPath);
        } else {
          setError("Koneksi gagal dan login offline tidak tersedia. Pastikan Anda sudah login online sebelumnya (credential aktif 7 hari).");
        }
      } else {
        setError(err instanceof Error ? err.message : "Login gagal. Coba lagi.");
      }
    } finally {
      setLoading(false);
    }
  }

  const inputCls =
    "w-full h-12 border border-border rounded-xl px-4 text-sm font-medium text-fg bg-surface focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition placeholder:text-muted-fg";

  return (
    <div className="min-h-screen bg-white flex flex-col overflow-hidden">

      {/* ── Top bar: back button left + logo centered + network badge ── */}
      <div className="relative flex items-center justify-center min-h-14 px-4 pt-10 shrink-0">
        <button
          onClick={() => navigate("/")}
          className="absolute left-4 top-4 w-9 h-9 rounded-full flex items-center justify-center hover:bg-muted transition"
          aria-label="Kembali ke halaman awal"
        >
          <ArrowLeft className="w-5 h-5 text-fg" />
        </button>
        <div className="flex items-center">
          <img src="/favicon.png" alt="KolektaPOS" className="w-[84px] h-[84px] rounded-lg object-cover" />
        </div>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 flex flex-col max-w-sm mx-auto w-full px-6 pt-6 pb-6">

        {/* Title + subtitle — centered */}
        <div className="text-center mb-6">
          <h1 className="text-[28px] font-extrabold text-fg leading-tight mb-2">
            Masuk ke KolektaPOS
          </h1>
          <p className="text-sm text-muted-fg">
            Kasir TCG Sales offline-first
          </p>
        </div>

        {!isOnline && (
          <div className="bg-muted bg-opacity-40 rounded-xl px-4 py-3 text-xs text-muted-fg mb-4 text-center">
            Mode offline — hanya cashier bisa login offline
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor={emailId} className="block text-sm font-semibold text-fg">
              Alamat Email
            </label>
            <input
              id={emailId}
              type="email"
              required
              autoComplete="email"
              className={inputCls}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@kolekta.id"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor={passwordId} className="block text-sm font-semibold text-fg">
              Password
            </label>
            <input
              id={passwordId}
              type="password"
              required
              autoComplete="current-password"
              className={inputCls}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error && (
            <div className="bg-destructive bg-opacity-10 border border-destructive border-opacity-30 text-destructive rounded-xl px-4 py-3 text-sm font-medium">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full h-14 bg-primary text-primary-fg font-bold text-[15px] rounded-2xl transition hover:opacity-90 active:scale-[0.98] disabled:opacity-50 mt-2"
          >
            {loading ? "Masuk…" : (isOnline ? "Masuk dengan Email" : "Login Offline")}
          </button>
        </form>

        <p className="text-center text-xs text-muted-fg mt-6">
          KolektaPOS · Revota © 2026
        </p>
      </div>

      {/* ── Bottom illustration — bg-surface blends into hero.webp background ── */}
      <div className="shrink-0 w-full">
        <img
          src="/hero.webp"
          alt=""
          aria-hidden="true"
          className="w-full object-cover object-top"
          style={{ maxHeight: "38vh" }}
        />
      </div>
    </div>
  );
}