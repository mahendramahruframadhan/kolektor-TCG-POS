import React, { useId, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { api } from "../lib/api.js";
import { idb } from "../lib/db.js";
import { useAuthStore } from "../store/auth.js";
import { useSyncStateStore } from "../store/sync-state.js";
import { resetAndSync } from "../lib/background-sync.js";
import bcrypt from "bcryptjs";

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

export function LoginPage() {
  const navigate = useNavigate();
  const setUser = useAuthStore((s) => s.setUser);
  const emailId = useId();
  const passwordId = useId();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    
    const syncState = useSyncStateStore.getState();
    const isBrowserOnline = typeof navigator !== "undefined" ? navigator.onLine : true;
    const isEffectiveOnline = syncState.effectiveIsOnline;
    const networkMode = syncState.networkMode;
    
    // OFFLINE LOGIN: Untuk cashier yang sudah pernah login dan punya credentials lokal
    // Hanya bisa offline login jika credentials ada DAN email match DAN bukan admin
    const hasOfflineCreds = syncState.offlineCredentials && 
                         syncState.offlineCredentials.role === "cashier";
    const isCashierCreds = hasOfflineCreds && 
                         syncState.offlineCredentials?.email === email;
    
    if (isCashierCreds && (!isBrowserOnline || networkMode === "force-offline")) {
      try {
        // Validasi credentials lokal
        const isValid = await syncState.validateOfflineCredentials(email, password);
        
        if (!isValid) {
          // Check if expired
          if (syncState.offlineCredentials.expiresAt < Date.now()) {
            setError("Session offline expired. Silakan login saat online.");
          } else {
            setError("Email atau password salah.");
          }
          setLoading(false);
          return;
        }
        
        // Load user dari offline credentials
        const user = {
          id: syncState.offlineCredentials.userId,
          email: syncState.offlineCredentials.email,
          displayName: syncState.offlineCredentials.email.split('@')[0],
          role: syncState.offlineCredentials.role,
        };
        
        setUser(user);
        // Offline login berhasil - force offline mode untuk cashier
        if (user.role === "cashier") {
          syncState.enableForceOffline();
        }
        const landingPath = await resolveLandingPath();
        navigate(landingPath);
      } catch (err) {
        setError("Login offline gagal. Coba login saat online.");
      } finally {
        setLoading(false);
      }
      return;
    }
    
    // ONLINE LOGIN
    try {
      const user = await api.auth.login(email, password);
      setUser(user);
      
      // Set networkMode based on role
      if (user.role === "cashier") {
        // Cashier: force offline mode + save credentials for offline login
        const passwordHash = await bcrypt.hash(password, 10);
        syncState.saveOfflineCredentials(email, passwordHash, user.id, user.role);
        syncState.enableForceOffline();
      } else if (user.role === "admin") {
        // Admin: clear any existing cashier credentials to avoid conflicts
        syncState.clearOfflineCredentials();
        syncState.setNetworkMode("auto");
}
       
       // Untuk cashier: WAJIB tekan Sync Data untuk dapat data terbaru (tidak auto pull)
       // Untuk admin: auto pull data
       if (user.role === "admin") {
         resetAndSync().catch(() => null);
       }
       // Cashier harus tekan "Sync Data" button untuk pull data
       
       const landingPath = await resolveLandingPath();
       navigate(landingPath);
    } catch (err: unknown) {
      // Jika online login gagal dan ada offline cashier credentials dengan email sama, coba offline login
      const storedCashierCreds = syncState.offlineCredentials && 
                            syncState.offlineCredentials.role === "cashier" &&
                            syncState.offlineCredentials.email === email;
      
      if (storedCashierCreds) {
        try {
          const isValid = await syncState.validateOfflineCredentials(email, password);
          if (isValid) {
            const user = {
              id: syncState.offlineCredentials.userId,
              email: syncState.offlineCredentials.email,
              displayName: syncState.offlineCredentials.email.split('@')[0],
              role: syncState.offlineCredentials.role,
            };
            setUser(user);
            if (user.role === "cashier") {
              syncState.enableForceOffline();
            }
            const landingPath = await resolveLandingPath();
            navigate(landingPath);
            setLoading(false);
            return;
          }
        } catch {
          // Fall through to error
        }
      }
      setError(
        err instanceof Error ? err.message : "Login gagal. Coba lagi."
      );
    } finally {
      setLoading(false);
    }
  }

  const inputCls =
    "w-full h-12 border border-border rounded-xl px-4 text-sm font-medium text-fg bg-surface focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition placeholder:text-muted-fg";

  return (
    // bg-white matches the pure-white background of hero.webp
    <div className="min-h-screen bg-white flex flex-col overflow-hidden">

      {/* ── Top bar: back button left + logo centered ── */}
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
        <div className="text-center mb-8">
          <h1 className="text-[28px] font-extrabold text-fg leading-tight mb-2">
            Masuk ke KolektaPOS
          </h1>
          <p className="text-sm text-muted-fg">
            Kasir TCG Sales offline-first
          </p>
        </div>

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
            {loading ? "Masuk…" : "Masuk dengan Email"}
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
