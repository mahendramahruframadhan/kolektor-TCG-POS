import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api.js";
import { useAuthStore } from "../store/auth.js";

export function LoginPage() {
  const navigate = useNavigate();
  const setUser = useAuthStore((s) => s.setUser);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const user = await api.auth.login(email, password);
      setUser(user);
      navigate("/dashboard");
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Login gagal. Coba lagi."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-surface">
      {/* Brand header */}
      <div className="bg-primary px-6 pt-12 pb-10 flex flex-col gap-2">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center shrink-0">
            <svg
              width="20"
              height="20"
              fill="none"
              stroke="hsl(220,60%,10%)"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <path d="M16 10a4 4 0 0 1-8 0" />
            </svg>
          </div>
          <div>
            <div className="text-lg font-extrabold text-primary-fg tracking-tight">
              KolektaPOS
            </div>
            <div className="text-[10px] font-bold tracking-[0.15em] uppercase text-primary-fg opacity-60">
              Point of Sale
            </div>
          </div>
        </div>
        <p className="text-sm text-primary-fg opacity-70">
          Masuk ke akun Anda
        </p>
      </div>

      {/* Login card */}
      <div className="flex-1 flex flex-col justify-center px-6 py-8 -mt-4">
        <div className="bg-card rounded-3xl shadow-sm border border-border p-6">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <label className="block text-[10px] font-extrabold tracking-widest uppercase text-muted-fg">
                Email
              </label>
              <input
                type="email"
                required
                autoComplete="email"
                className="w-full h-12 border border-border rounded-xl px-4 text-sm font-medium text-fg bg-surface focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@kolekta.id"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-[10px] font-extrabold tracking-widest uppercase text-muted-fg">
                Password
              </label>
              <input
                type="password"
                required
                autoComplete="current-password"
                className="w-full h-12 border border-border rounded-xl px-4 text-sm font-medium text-fg bg-surface focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition"
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
              className="w-full h-14 bg-primary text-primary-fg font-bold text-[15px] rounded-2xl transition hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
            >
              {loading ? "Masuk…" : "Masuk"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
