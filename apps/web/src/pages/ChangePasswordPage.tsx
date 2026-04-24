import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { KeyRound, CheckCircle } from "lucide-react";
import { MobileAppBar } from "../components/MobileAppBar.js";
import { api } from "../lib/api.js";

const inputCls = "w-full h-11 border border-border rounded-xl px-3 text-sm font-medium text-fg bg-surface focus:outline-none focus:ring-2 focus:ring-primary transition disabled:bg-muted disabled:text-muted-fg";
const labelCls = "block text-[10px] font-extrabold tracking-widest uppercase text-muted-fg mb-1";

export function ChangePasswordPage() {
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 8) {
      setError("Password baru minimal 8 karakter.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Konfirmasi password tidak cocok.");
      return;
    }

    setSaving(true);
    try {
      await api.auth.changePassword({ currentPassword, newPassword });
      setSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Gagal mengubah password.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-surface bg-dotted-overlay flex flex-col">
      <MobileAppBar
        title="Ubah Password"
        back
        onBack={() => navigate(-1)}
      />

      <main className="flex-1 overflow-y-auto max-w-xl mx-auto w-full p-4 space-y-4">
        <div className="flex items-center gap-3 pt-1">
          <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center shrink-0">
            <KeyRound className="w-5 h-5 text-primary-fg" />
          </div>
          <div>
            <p className="text-sm font-bold text-fg">Ubah Password</p>
            <p className="text-xs text-muted-fg">Masukkan password saat ini untuk melanjutkan</p>
          </div>
        </div>

        <div className="bg-card rounded-2xl border border-border p-4 space-y-4">
          {success && (
            <div className="flex items-center gap-2 bg-success bg-opacity-10 border border-success border-opacity-30 text-success rounded-xl px-3 py-2 text-sm font-medium">
              <CheckCircle className="w-4 h-4 shrink-0" />
              Password berhasil diubah.
            </div>
          )}

          {error && (
            <div className="bg-destructive bg-opacity-10 border border-destructive border-opacity-30 text-destructive rounded-xl px-3 py-2 text-sm font-medium">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className={labelCls}>Password Saat Ini</label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className={inputCls}
                required
                autoComplete="current-password"
                placeholder="••••••••"
              />
            </div>

            <div>
              <label className={labelCls}>Password Baru</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className={inputCls}
                required
                autoComplete="new-password"
                placeholder="Minimal 8 karakter"
              />
            </div>

            <div>
              <label className={labelCls}>Konfirmasi Password Baru</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={inputCls}
                required
                autoComplete="new-password"
                placeholder="Ulangi password baru"
              />
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full h-12 bg-primary text-primary-fg font-bold rounded-2xl hover:opacity-90 transition disabled:opacity-50 mt-1"
            >
              {saving ? "Menyimpan…" : "Ubah Password"}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
