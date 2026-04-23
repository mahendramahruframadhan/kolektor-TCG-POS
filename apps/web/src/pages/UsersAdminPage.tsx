import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api.js";
import { useAuthStore } from "../store/auth.js";
import { MobileAppBar } from "../components/MobileAppBar.js";

interface User {
  id: string;
  email: string;
  displayName: string;
  role: string;
  createdAt: number;
}

const inputCls = (error?: boolean) =>
  `w-full h-11 border rounded-xl px-3 text-sm font-medium text-fg bg-surface focus:outline-none focus:ring-2 focus:ring-primary transition ${error ? "border-destructive" : "border-border"} disabled:bg-muted disabled:text-muted-fg`;

const labelCls = "block text-[10px] font-extrabold tracking-widest uppercase text-muted-fg mb-1";

export function UsersAdminPage() {
  const navigate = useNavigate();
  const me = useAuthStore((s) => s.user);

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "cashier">("cashier");
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await api.users.list();
      setUsers(list);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Gagal memuat pengguna.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  function resetForm() {
    setEmail(""); setDisplayName(""); setPassword(""); setRole("cashier");
    setFormError(null); setEditId(null); setIsEditing(false);
  }

  function startCreate() { resetForm(); setIsEditing(true); }

  function startEdit(user: User) {
    setEmail(user.email); setDisplayName(user.displayName);
    setPassword(""); setRole(user.role as "admin" | "cashier");
    setEditId(user.id); setIsEditing(true); setFormError(null);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!displayName.trim()) { setFormError("Nama tampilan wajib diisi."); return; }
    if (!editId) {
      if (!email.trim()) { setFormError("Email wajib diisi."); return; }
      if (password.length < 8) { setFormError("Password minimal 8 karakter."); return; }
    } else {
      if (password && password.length < 8) { setFormError("Password minimal 8 karakter (kosongkan jika tidak diubah)."); return; }
    }

    setSaving(true);
    try {
      if (editId) {
        const body: { displayName?: string; role?: string; password?: string } = { displayName: displayName.trim(), role };
        if (password) body.password = password;
        await api.users.update(editId, body);
      } else {
        await api.users.create({ email: email.trim(), password, displayName: displayName.trim(), role });
      }
      resetForm();
      await loadUsers();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Gagal menyimpan pengguna.");
    } finally {
      setSaving(false);
    }
  }

  const formatDate = (ts: number) =>
    new Date(ts * 1000).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      <MobileAppBar
        title="Kelola Pengguna"
        back
        onBack={() => navigate("/admin")}
        right={
          !isEditing ? (
            <button
              onClick={startCreate}
              className="text-xs font-bold text-accent border border-accent border-opacity-40 rounded-lg px-3 py-1 hover:bg-accent hover:bg-opacity-10 transition"
            >
              + Tambah
            </button>
          ) : undefined
        }
      />

      <div className="flex-1 overflow-y-auto max-w-xl mx-auto w-full p-4 space-y-4">
        {isEditing ? (
          <div className="bg-card rounded-2xl border border-border p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-fg">{editId ? "Edit Pengguna" : "Tambah Pengguna"}</h2>
              <button onClick={resetForm} className="text-xs font-bold text-muted-fg hover:text-fg">Batal</button>
            </div>

            {formError && (
              <div className="bg-destructive bg-opacity-10 border border-destructive border-opacity-30 text-destructive rounded-xl px-3 py-2 text-sm font-medium">
                {formError}
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-3">
              <div>
                <label className={labelCls}>Email</label>
                <input type="email" required={!editId} disabled={!!editId}
                  value={email} onChange={(e) => setEmail(e.target.value)}
                  className={inputCls()} placeholder="email@kolekta.id" />
              </div>
              <div>
                <label className={labelCls}>Nama Tampilan</label>
                <input type="text" required value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className={inputCls()} placeholder="Nama pengguna" />
              </div>
              <div>
                <label className={labelCls}>Peran</label>
                <select value={role} onChange={(e) => setRole(e.target.value as "admin" | "cashier")}
                  className={inputCls()}>
                  <option value="cashier">Kasir</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Password {editId && "(kosongkan jika tidak diubah)"}</label>
                <input type="password" required={!editId} value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={inputCls()} placeholder={editId ? "••••••••" : "Minimal 8 karakter"} />
              </div>
              <button type="submit" disabled={saving}
                className="w-full h-12 bg-primary text-primary-fg font-bold rounded-2xl hover:opacity-90 transition disabled:opacity-50">
                {saving ? "Menyimpan…" : editId ? "Simpan Perubahan" : "Tambah Pengguna"}
              </button>
            </form>
          </div>
        ) : (
          <>
            {loading ? (
              <p className="text-sm text-muted-fg py-4 text-center">Memuat…</p>
            ) : error ? (
              <p className="text-sm text-destructive py-4 text-center">{error}</p>
            ) : users.length === 0 ? (
              <p className="text-sm text-muted-fg italic py-4 text-center">Belum ada pengguna.</p>
            ) : (
              <div className="bg-card rounded-2xl border border-border divide-y divide-border overflow-hidden">
                {users.map((user) => (
                  <div key={user.id} className="p-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center shrink-0">
                        <span className="text-xs font-extrabold text-primary-fg">
                          {user.displayName[0]?.toUpperCase()}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-fg truncate">{user.displayName}</p>
                        <p className="text-xs text-muted-fg truncate">{user.email}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={`text-[10px] font-extrabold tracking-widest uppercase px-2 py-0.5 rounded-full ${
                            user.role === "admin"
                              ? "bg-primary bg-opacity-15 text-primary"
                              : "bg-muted text-muted-fg"
                          }`}>
                            {user.role === "admin" ? "Admin" : "Kasir"}
                          </span>
                          <span className="text-[10px] text-muted-fg">{formatDate(user.createdAt)}</span>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => startEdit(user)}
                      className="text-xs font-bold text-accent shrink-0 hover:opacity-70"
                    >
                      Edit
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
