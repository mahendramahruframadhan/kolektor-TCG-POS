import { create } from "zustand";
import { persist } from "zustand/middleware";
import bcrypt from "bcryptjs";

interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  role: string;
}

interface OfflineCredential {
  email: string;
  offlineHash: string;
  id: string;
  displayName: string;
  role: string;
  cachedAt: number;
}

interface PendingAuth {
  email: string;
  password: string;
  timestamp: number;
}

const SESSION_STORAGE_KEY = "kolekta-pending-auth";
const OFFLINE_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function getPendingAuth(): PendingAuth | null {
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as PendingAuth;
    if (Date.now() - data.timestamp > 30 * 60 * 1000) {
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

function setPendingAuth(email: string, password: string): void {
  try {
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ email, password, timestamp: Date.now() }));
  } catch {}
}

function clearPendingAuth(): void {
  try {
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {}
}

function readOfflineCredentialsFromStorage(): OfflineCredential[] {
  try {
    const raw = localStorage.getItem("kolekta-offline-auth");
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    const state = parsed?.state ?? parsed;
    if (Array.isArray(state?.offlineCredentials)) {
      return state.offlineCredentials;
    }
    return [];
  } catch (e) {
    console.error('[offline-auth] readOfflineCredentialsFromStorage error', e);
    return [];
  }
}

interface AuthState {
  user: AuthUser | null;
  setUser: (user: AuthUser | null) => void;
}

export type OfflineLoginReason =
  | "credential_not_found"
  | "credential_expired"
  | "role_not_allowed"
  | "password_mismatch";

export type OfflineLoginResult =
  | { success: true; user: AuthUser; hoursRemaining?: number }
  | { success: false; reason: OfflineLoginReason; details?: any };

interface OfflineAuthState {
  offlineCredentials: OfflineCredential[];
  isOfflineSession: boolean;
  offlineExpiresAt: number | null;
  cacheCredential: (credential: Omit<OfflineCredential, "cachedAt">) => void;
  validateOfflineLogin: (email: string, password: string) => OfflineLoginResult;
  clearOfflineCredential: () => void;
  clearExpiredCredential: () => boolean;
  setOfflineSession: (user: AuthUser, expiresAt: number) => void;
  clearOfflineSession: () => void;
  logoutAndClearAll: () => void;
  logoutSession: () => void;
  getOfflineSessionRemainingHours: () => number | null;
  getPendingAuth: () => PendingAuth | null;
  setPendingAuth: (email: string, password: string) => void;
  clearPendingAuth: () => void;
  setIsReconnecting: (value: boolean) => void;
  isReconnecting: boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      setUser: (user) => set({ user }),
    }),
    { name: "kolekta-auth" }
  )
);

export const useOfflineAuthStore = create<OfflineAuthState>()(
  persist(
    (set, get) => ({
      offlineCredentials: [],
      isOfflineSession: false,
      offlineExpiresAt: null,
      isReconnecting: false,

      cacheCredential: (credential) => {
        console.debug('[offline-auth] cacheCredential called', { email: credential.email, role: credential.role });
        set((state) => {
          const exists = state.offlineCredentials.findIndex(
            (c) => c.email.toLowerCase() === credential.email.toLowerCase()
          );
          const newCred: OfflineCredential = {
            ...credential,
            cachedAt: Date.now(),
          };
          let next: OfflineCredential[];
          if (exists >= 0) {
            next = [...state.offlineCredentials];
            next[exists] = newCred;
          } else {
            next = [...state.offlineCredentials, newCred];
          }
          console.debug('[offline-auth] cacheCredential set', { count: next.length, emails: next.map((c) => c.email) });
          return { offlineCredentials: next };
        });
        console.debug('[offline-auth] cacheCredential after set', { count: get().offlineCredentials.length });
      },

      validateOfflineLogin: (email: string, password: string): OfflineLoginResult => {
        const { clearExpiredCredential } = get();

        clearExpiredCredential();

        let creds = get().offlineCredentials;
        console.debug('[offline-auth] validateOfflineLogin memory credentials count', creds.length);

        // Fallback: if zustand hasn't rehydrated yet, read directly from localStorage
        if (creds.length === 0) {
          creds = readOfflineCredentialsFromStorage();
          console.debug('[offline-auth] validateOfflineLogin storage fallback count', creds.length);
          // If fallback found credentials, sync them back to zustand state so next
          // call doesn't need fallback again.
          if (creds.length > 0) {
            console.debug('[offline-auth] syncing fallback credentials into zustand state');
            set({ offlineCredentials: creds });
          }
        }

        const cred = creds.find(
          (c) => c.email.toLowerCase() === email.toLowerCase()
        );
        if (!cred) {
          console.warn('[offline-auth] validateOfflineLogin no credential found for', email);
          const availableEmails = creds.map(c => c.email);
          return {
            success: false,
            reason: "credential_not_found",
            details: {
              message: availableEmails.length > 0
                ? `Credential untuk ${email} tidak ditemukan. Credential yang tersedia: ${availableEmails.join(", ")}`
                : "Anda belum pernah login online. Silakan login dengan koneksi internet pertama kali untuk mengaktifkan mode offline.",
              availableEmails,
            },
          };
        }

        // Check expiry
        const now = Date.now();
        const expiresAt = cred.cachedAt + OFFLINE_SESSION_TTL_MS;
        const hoursRemaining = Math.ceil((expiresAt - now) / (60 * 60 * 1000));
        if (now > expiresAt) {
          console.warn('[offline-auth] validateOfflineLogin credential expired for', cred.email);
          return {
            success: false,
            reason: "credential_expired",
            details: {
              message: "Password salah atau credential expired (lebih dari 7 hari). Silakan login online untuk refresh credential.",
              hoursRemaining: 0,
              cachedAt: cred.cachedAt,
            },
          };
        }

        if (cred.role !== "cashier" && cred.role !== "admin") {
          console.warn('[offline-auth] validateOfflineLogin role not allowed', cred.role);
          return {
            success: false,
            reason: "role_not_allowed",
            details: {
              message: `Role '${cred.role}' tidak diizinkan login offline. Hanya role 'cashier' dan 'admin' yang bisa login offline.`,
              role: cred.role,
            },
          };
        }

        let compareResult = false;
        try {
          console.debug('[offline-auth] validateOfflineLogin comparing bcrypt for', cred.email, 'hash prefix', cred.offlineHash.substring(0, 7));
          compareResult = bcrypt.compareSync(password, cred.offlineHash);
        } catch (e) {
          console.error('[offline-auth] bcrypt.compareSync error', e);
          compareResult = false;
        }

        console.debug('[offline-auth] validateOfflineLogin compareResult', { email: cred.email, compareResult });

        if (!compareResult) {
          console.warn('[offline-auth] validateOfflineLogin bcrypt mismatch for', cred.email);
          return {
            success: false,
            reason: "password_mismatch",
            details: {
              message: "Password salah. Periksa kembali password Anda.",
            },
          };
        }

        console.info('[offline-auth] validateOfflineLogin success for', cred.email);
        return {
          success: true,
          user: {
            id: cred.id,
            email: cred.email,
            displayName: cred.displayName,
            role: cred.role,
          },
          hoursRemaining,
        };
      },

      clearOfflineCredential: () =>
        set({ offlineCredentials: [], isOfflineSession: false, offlineExpiresAt: null }),

      clearExpiredCredential: (): boolean => {
        const { offlineCredentials } = get();
        const now = Date.now();
        const valid = offlineCredentials.filter(
          (c) => now <= c.cachedAt + OFFLINE_SESSION_TTL_MS
        );
        const hadExpired = valid.length < offlineCredentials.length;
        if (hadExpired) {
          set({ offlineCredentials: valid });
        }
        return hadExpired;
      },

      setOfflineSession: (user, expiresAt) =>
        set({ isOfflineSession: true, offlineExpiresAt: expiresAt }),

      clearOfflineSession: () =>
        set({ isOfflineSession: false, offlineExpiresAt: null }),

      logoutAndClearAll: () => {
        localStorage.removeItem("kolekta-offline-auth");
        clearPendingAuth();
        set({
          offlineCredentials: [],
          isOfflineSession: false,
          offlineExpiresAt: null,
          isReconnecting: false,
        });
      },

      logoutSession: () => {
        // Only clear current session / pending auth, but KEEP offlineCredentials
        // so the user can login offline again within the 7-day TTL.
        clearPendingAuth();
        set({
          isOfflineSession: false,
          offlineExpiresAt: null,
          isReconnecting: false,
        });
      },

      getOfflineSessionRemainingHours: (): number | null => {
        const { offlineExpiresAt, isOfflineSession } = get();
        if (!isOfflineSession || !offlineExpiresAt) return null;

        const remaining = offlineExpiresAt - Date.now();
        if (remaining <= 0) return 0;
        return Math.ceil(remaining / (60 * 60 * 1000));
      },

      getPendingAuth: () => getPendingAuth(),
      setPendingAuth: (email: string, password: string) => setPendingAuth(email, password),
      clearPendingAuth: () => clearPendingAuth(),
      setIsReconnecting: (value: boolean) => set({ isReconnecting: value }),
    }),
    {
      name: "kolekta-offline-auth",
      version: 1,
      migrate: (persistedState, version) => {
        console.debug('[offline-auth] migrate running', { persistedState, version });
        const raw = persistedState as any;
        const state = raw?.state ?? raw;
        if (state && state.offlineCredential && !Array.isArray(state.offlineCredentials)) {
          const migrated = {
            ...state,
            offlineCredentials: [state.offlineCredential],
            offlineCredential: undefined,
          };
          console.debug('[offline-auth] migrated old format', migrated);
          return migrated;
        }
        return state ?? { offlineCredentials: [], isOfflineSession: false, offlineExpiresAt: null };
      },
      onRehydrateStorage: () => {
        return (state, error) => {
          if (error) {
            console.error('[offline-auth] rehydrate error', error);
          } else {
            console.debug('[offline-auth] rehydrated', { count: state?.offlineCredentials?.length ?? 0 });
          }
        };
      },
      partialize: (state) => ({
        offlineCredentials: state.offlineCredentials,
        isOfflineSession: state.isOfflineSession,
        offlineExpiresAt: state.offlineExpiresAt,
      }),
    }
  )
);