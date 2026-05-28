import React, { useEffect, useId, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Wifi, WifiOff, RefreshCw, UserX, AlertTriangle, Clock } from "lucide-react";
import { api } from "../lib/api.js";
import { idb } from "../lib/db.js";
import { useAuthStore, useOfflineAuthStore } from "../store/auth.js";
import { useSyncStateStore } from "../store/sync-state.js";
import { resetAndSync } from "../lib/background-sync.js";
import { trackLoginTime } from "../lib/perf-tracker.js";
import type { OfflineLoginResult } from "../store/auth.js";

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
  const isCritical = hoursLeft <= 1;
  const isWarning = hoursLeft <= 24;
  return (
    <div
      className={`border rounded-xl px-4 py-2.5 text-xs font-medium text-center flex items-center justify-center gap-2 ${
        isCritical
          ? "bg-red-50 border-red-200 text-red-700"
          : isWarning
          ? "bg-yellow-50 border-yellow-200 text-yellow-700"
          : "bg-warning bg-opacity-10 border-warning border-opacity-30 text-warning"
      }`}
    >
      <Clock className="w-3.5 h-3.5" />
      {isCritical
        ? "Sesi offline akan segera expired — login online sekarang!"
        : `Logged in offline — expires in ${hoursLeft}h`}
    </div>
  );
}

interface ErrorState {
  message: string;
  type: "credential_not_found" | "credential_expired" | "role_not_allowed" | "password_mismatch" | "generic";
  details?: any;
}

function getErrorStateFromResult(result: OfflineLoginResult): ErrorState | null {
  if (result.success) return null;
  return {
    message: result.details?.message ?? "Login offline gagal",
    type: result.reason as ErrorState["type"],
    details: result.details,
  };
}

function ErrorActions({
  error,
  onLoginOnline,
  onRefresh,
}: {
  error: ErrorState;
  onLoginOnline: () => void;
  onRefresh: () => void;
}) {
  switch (error.type) {
    case "credential_not_found":
      return (
        <div className="flex flex-col gap-2 mt-2">
          <button
            onClick={onLoginOnline}
            className="flex items-center justify-center gap-2 w-full h-10 bg-primary text-primary-fg font-semibold text-sm rounded-xl hover:opacity-90 transition"
          >
            <Wifi className="w-4 h-4" />
            Login Online
          </button>
          {error.details?.availableEmails?.length > 0 && (
            <p className="text-xs text-slate-500 text-center">
              Credential tersedia untuk: {error.details.availableEmails.join(", ")}
            </p>
          )}
        </div>
      );
    case "credential_expired":
      return (
        <div className="flex flex-col gap-2 mt-2">
          <button
            onClick={onLoginOnline}
            className="flex items-center justify-center gap-2 w-full h-10 bg-primary text-primary-fg font-semibold text-sm rounded-xl hover:opacity-90 transition"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh Credential (Login Online)
          </button>
          <p className="text-xs text-slate-500 text-center">
            Credential Anda expired setelah 7 hari. Login online untuk memperbarui.
          </p>
        </div>
      );
    case "role_not_allowed":
      return (
        <div className="flex flex-col gap-2 mt-2">
          <div className="flex items-center justify-center gap-2 text-xs text-slate-500">
            <UserX className="w-4 h-4" />
            Hubungi admin untuk akses offline
          </div>
        </div>
      );
    case "password_mismatch":
      return (
        <div className="flex flex-col gap-2 mt-2">
          <p className="text-xs text-slate-500 text-center">
            Periksa kembali password Anda. Credential offline menggunakan password yang sama dengan login online.
          </p>
        </div>
      );
    default:
      return (
        <div className="flex flex-col gap-2 mt-2">
          <button
            onClick={onLoginOnline}
            className="flex items-center justify-center gap-2 w-full h-10 bg-primary text-primary-fg font-semibold text-sm rounded-xl hover:opacity-90 transition"
          >
            <Wifi className="w-4 h-4" />
            Coba Login Online
          </button>
        </div>
      );
  }
}

export function LoginPage() {
  const navigate = useNavigate();
  const setUser = useAuthStore((s) => s.setUser);
  const cacheCredential = useOfflineAuthStore((s) => s.cacheCredential);
  const isOnline = useSyncStateStore((s) => s.effectiveIsOnline);
  const emailId = useId();
  const passwordId = useId();

  useEffect(() => {
    console.log("[login] LoginPage mounted");
    console.log("[login] isOnline (effective)", isOnline);
    console.log("[login] navigator.onLine", navigator.onLine);
    const stored = localStorage.getItem("kolekta-offline-auth");
    console.log("[login] raw localStorage kolekta-offline-auth", stored);
    const memCreds = useOfflineAuthStore.getState().offlineCredentials;
    console.log("[login] memory offlineCredentials count", memCreds.length);
    console.log(
      "[login] memory offlineCredentials emails",
      memCreds.map((c) => c.email)
    );

    // Manual rehydrate: ensure zustand state matches localStorage immediately
    if (stored && memCreds.length === 0) {
      try {
        const parsed = JSON.parse(stored);
        const state = parsed?.state ?? parsed;
        if (
          Array.isArray(state?.offlineCredentials) &&
          state.offlineCredentials.length > 0
        ) {
          console.log(
            "[login] manual rehydrate triggered",
            state.offlineCredentials.length
          );
          useOfflineAuthStore.setState({
            offlineCredentials: state.offlineCredentials,
          });
        }
      } catch (e) {
        console.error("[login] manual rehydrate failed", e);
      }
    }
  }, []);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<ErrorState | null>(null);
  const [loading, setLoading] = useState(false);
  const [expiryWarning, setExpiryWarning] = useState<number | null>(null);

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
    console.log("[login] handleOnlineLogin start");
    const loginStart = performance.now();
    const response = await api.auth.login(email, password);
    trackLoginTime(Math.round(performance.now() - loginStart));
    console.log("[login] raw response", JSON.stringify(response));
    const user = response as LoginResponse;
    setUser(user);

    console.log("[login] user.offlineHash?", Boolean(user.offlineHash));
    console.log(
      "[login] user.allUsersHash?",
      user.allUsersHash?.length ?? 0
    );

    if (user.allUsersHash && user.allUsersHash.length > 0) {
      console.log(
        "[login] caching allUsersHash count",
        user.allUsersHash.length
      );
      for (const u of user.allUsersHash) {
        console.log("[login] caching user", u.email);
        cacheCredential({
          email: u.email,
          offlineHash: u.offlineHash,
          id: u.id,
          displayName: u.displayName,
          role: u.role,
        });
      }
    } else if (user.offlineHash) {
      console.log("[login] caching single offlineHash for", user.email);
      cacheCredential({
        email: user.email,
        offlineHash: user.offlineHash,
        id: user.id,
        displayName: user.displayName,
        role: user.role,
      });
    } else {
      console.warn(
        "[login] no offlineHash/allUsersHash in login response, trying fallback cache-credential"
      );
      try {
        const cached = await api.auth.cacheCredential();
        console.log("[login] fallback cache-credential response", cached);
        cacheCredential({
          email: cached.email,
          offlineHash: cached.offlineHash,
          id: cached.id,
          displayName: cached.displayName,
          role: cached.role,
        });
      } catch (cacheErr) {
        console.error("[login] cache-credential fallback failed", cacheErr);
      }
    }

    const credsAfter = useOfflineAuthStore.getState().offlineCredentials;
    console.log(
      "[login] offlineCredentials count after cache",
      credsAfter.length
    );
    console.log(
      "[login] localStorage kolekta-offline-auth",
      localStorage.getItem("kolekta-offline-auth")
    );

    useOfflineAuthStore.getState().setPendingAuth(email, password);
    resetAndSync().catch(() => null);
    const landingPath = await resolveLandingPath();
    navigate(landingPath);
  }

  async function handleOfflineLogin() {
    console.log("[login] handleOfflineLogin start", { email, isOnline });
    const loginStart = performance.now();
    const validateOfflineLogin =
      useOfflineAuthStore.getState().validateOfflineLogin;
    const setOfflineSession =
      useOfflineAuthStore.getState().setOfflineSession;
    const memoryCreds = useOfflineAuthStore.getState().offlineCredentials;
    console.log(
      "[login] handleOfflineLogin memory credentials count",
      memoryCreds.length
    );
    const result = validateOfflineLogin(email, password);
    console.log("[login] handleOfflineLogin validate result", result);

    if (!result.success) {
      setError(getErrorStateFromResult(result));
      return;
    }

    trackLoginTime(Math.round(performance.now() - loginStart));

    const offlineUser = result.user;
    const hoursRemaining = result.hoursRemaining;

    setUser(offlineUser);
    const offlineExpiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;

    setOfflineSession(offlineUser, offlineExpiresAt);
    useOfflineAuthStore.getState().setPendingAuth(email, password);

    // Show expiry warning if <= 24 hours
    if (hoursRemaining != null && hoursRemaining <= 24) {
      setExpiryWarning(hoursRemaining);
    }

    const landingPath = await resolveLandingPath();
    navigate(landingPath);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const browserOnline = navigator.onLine;
    console.log("[login] handleSubmit start", { browserOnline, isOnline, email });

    try {
      if (browserOnline) {
        console.log("[login] path: online login");
        await handleOnlineLogin();
      } else {
        console.log("[login] path: offline login");
        await handleOfflineLogin();
      }
    } catch (err: unknown) {
      console.error("[login] handleSubmit error", err);
      const apiError = err as any;
      const isNetworkError =
        !apiError.status ||
        apiError.name === "NetworkError" ||
        apiError.name === "TypeError" ||
        apiError.message?.includes("Network");
      console.log("[login] error analysis", {
        status: apiError.status,
        name: apiError.name,
        message: apiError.message,
        isNetworkError,
      });

      if (isNetworkError && browserOnline) {
        // Browser claims online but fetch failed → try offline fallback
        console.log("[login] network error despite browser online → fallback offline");
        const result = useOfflineAuthStore.getState().validateOfflineLogin(email, password);
        if (result.success && (result.user.role === "cashier" || result.user.role === "admin")) {
          const offlineExpiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
          useAuthStore.getState().setUser(result.user);
          useOfflineAuthStore.getState().setOfflineSession(result.user, offlineExpiresAt);
          useOfflineAuthStore.getState().setPendingAuth(email, password);
          if (result.hoursRemaining != null && result.hoursRemaining <= 24) {
            setExpiryWarning(result.hoursRemaining);
          }
          const landingPath = await resolveLandingPath();
          navigate(landingPath);
        } else {
          if (!result.success) {
            setError(getErrorStateFromResult(result));
          } else {
            setError({
              message: "Login offline tidak tersedia untuk role ini.",
              type: "role_not_allowed",
            });
          }
        }
      } else if (apiError.status === 401) {
        setError({ message: "Email atau password salah.", type: "password_mismatch" });
      } else {
        setError({
          message: err instanceof Error ? err.message : "Login gagal. Coba lagi.",
          type: "generic",
        });
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
          <img
            src="/favicon.png"
            alt="KolektaPOS"
            className="w-[84px] h-[84px] rounded-lg object-cover"
          />
        </div>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 flex flex-col max-w-sm mx-auto w-full px-6 pt-6 pb-6">
        {/* Title + subtitle — centered */}
        <div className="text-center mb-6">
          <h1 className="text-[28px] font-extrabold text-fg leading-tight mb-2">
            Masuk ke KolektaPOS
          </h1>
          <p className="text-sm text-muted-fg">Kasir TCG Sales offline-first</p>
        </div>

        {!navigator.onLine && (
          <div className="bg-muted bg-opacity-40 rounded-xl px-4 py-3 text-xs text-muted-fg mb-4 text-center flex items-center justify-center gap-2">
            <WifiOff className="w-3.5 h-3.5" />
            Mode offline — hanya cashier dan admin bisa login offline
          </div>
        )}

        {expiryWarning != null && expiryWarning > 0 && (
          <OfflineExpiryBanner hoursLeft={expiryWarning} />
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
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
            <div className="space-y-1">
              <div className="bg-destructive bg-opacity-10 border border-destructive border-opacity-30 text-destructive rounded-xl px-4 py-3 text-sm font-medium flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="flex-1">{error.message}</div>
              </div>
              <ErrorActions
                error={error}
                onLoginOnline={() => {
                  setError(null);
                  handleOnlineLogin().catch((err) => {
                    setError({
                      message: err instanceof Error ? err.message : "Login online gagal.",
                      type: "generic",
                    });
                  });
                }}
                onRefresh={() => {
                  setError(null);
                  handleOnlineLogin().catch((err) => {
                    setError({
                      message: err instanceof Error ? err.message : "Refresh gagal.",
                      type: "generic",
                    });
                  });
                }}
              />
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full h-14 bg-primary text-primary-fg font-bold text-[15px] rounded-2xl transition hover:opacity-90 active:scale-[0.98] disabled:opacity-50 mt-2"
          >
            {loading
              ? "Masuk…"
              : navigator.onLine
              ? "Masuk dengan Email"
              : "Login Offline"}
          </button>
        </form>

        <p className="text-center text-xs text-muted-fg mt-6">
          KolektaPOS · Revota © 2026
        </p>
      </div>

      {/* ── Bottom illustration ── */}
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
