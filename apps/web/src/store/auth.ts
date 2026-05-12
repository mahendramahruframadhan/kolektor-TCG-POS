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

const OFFLINE_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface AuthState {
  user: AuthUser | null;
  setUser: (user: AuthUser | null) => void;
}

interface OfflineAuthState {
  offlineCredential: OfflineCredential | null;
  isOfflineSession: boolean;
  offlineExpiresAt: number | null;
  cacheCredential: (credential: Omit<OfflineCredential, "cachedAt">) => void;
  validateOfflineLogin: (email: string, password: string) => AuthUser | null;
  clearOfflineCredential: () => void;
  clearExpiredCredential: () => boolean;
  setOfflineSession: (user: AuthUser, expiresAt: number) => void;
  clearOfflineSession: () => void;
  logoutAndClearAll: () => void;
  getOfflineSessionRemainingHours: () => number | null;
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
      offlineCredential: null,
      isOfflineSession: false,
      offlineExpiresAt: null,

      cacheCredential: (credential) => {
        set({
          offlineCredential: {
            ...credential,
            cachedAt: Date.now(),
          },
        });
      },

      validateOfflineLogin: (email: string, password: string): AuthUser | null => {
        const { offlineCredential, clearExpiredCredential } = get();

        if (!offlineCredential) return null;
        if (offlineCredential.email.toLowerCase() !== email.toLowerCase()) return null;
        // Allow both cashier and admin for offline login
        if (offlineCredential.role !== "cashier" && offlineCredential.role !== "admin") return null;

        if (clearExpiredCredential()) return null;

        let isValid = false;
        try {
          isValid = bcrypt.compareSync(password, offlineCredential.offlineHash);
        } catch {
          isValid = false;
        }

        if (!isValid) return null;

        const expiresAt = offlineCredential.cachedAt + OFFLINE_SESSION_TTL_MS;
        if (Date.now() > expiresAt) {
          get().clearOfflineCredential();
          return null;
        }

        return {
          id: offlineCredential.id,
          email: offlineCredential.email,
          displayName: offlineCredential.displayName,
          role: offlineCredential.role,
        };
      },

      clearOfflineCredential: () =>
        set({ offlineCredential: null, isOfflineSession: false, offlineExpiresAt: null }),

      clearExpiredCredential: (): boolean => {
        const { offlineCredential } = get();
        if (!offlineCredential) return false;

        const isExpired = Date.now() > offlineCredential.cachedAt + OFFLINE_SESSION_TTL_MS;
        if (isExpired) {
          get().clearOfflineCredential();
          return true;
        }
        return false;
      },

      setOfflineSession: (user, expiresAt) =>
        set({ isOfflineSession: true, offlineExpiresAt: expiresAt }),

      clearOfflineSession: () =>
        set({ isOfflineSession: false, offlineExpiresAt: null }),

      logoutAndClearAll: () => {
        localStorage.removeItem("kolekta-offline-auth");
        set({
          offlineCredential: null,
          isOfflineSession: false,
          offlineExpiresAt: null,
        });
      },

      getOfflineSessionRemainingHours: (): number | null => {
        const { offlineExpiresAt, isOfflineSession } = get();
        if (!isOfflineSession || !offlineExpiresAt) return null;

        const remaining = offlineExpiresAt - Date.now();
        if (remaining <= 0) return 0;
        return Math.ceil(remaining / (60 * 60 * 1000));
      },
    }),
    {
      name: "kolekta-offline-auth",
    }
  )
);