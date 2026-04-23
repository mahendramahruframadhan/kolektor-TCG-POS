import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api.js";
import { useAuthStore } from "../store/auth.js";

interface User {
  id: string;
  email: string;
  displayName: string;
  role: string;
  createdAt: number;
}

export function UsersAdminPage() {
  const navigate = useNavigate();
  const me = useAuthStore((s) => s.user);

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create / edit form state
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

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  function resetForm() {
    setEmail("");
    setDisplayName("");
    setPassword("");
    setRole("cashier");
    setFormError(null);
    setEditId(null);
    setIsEditing(false);
  }

  function startCreate() {
    resetForm();
    setIsEditing(true);
  }

  function startEdit(user: User) {
    setEmail(user.email);
    setDisplayName(user.displayName);
    setPassword("");
    setRole(user.role as "admin" | "cashier");
    setEditId(user.id);
    setIsEditing(true);
    setFormError(null);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!displayName.trim()) {
      setFormError("Nama tampilan wajib diisi.");
      return;
    }

    if (!editId) {
      if (!email.trim()) {
        setFormError("Email wajib diisi.");
        return;
      }
      if (password.length < 8) {
        setFormError("Password minimal 8 karakter.");
        return;
      }
    } else {
      if (password && password.length < 8) {
        setFormError("Password minimal 8 karakter (kosongkan jika tidak diubah).");
        return;
      }
    }

    setSaving(true);
    try {
      if (editId) {
        const body: { displayName?: string; role?: string; password?: string } = {
          displayName: displayName.trim(),
          role,
        };
        if (password) body.password = password;
        await api.users.update(editId, body);
      } else {
        await api.users.create({
          email: email.trim(),
          password,
          displayName: displayName.trim(),
          role,
        });
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
    new Date(ts * 1000).toLocaleDateString("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* Top bar */}
      <header className="bg-blue-700 text-white px-4 py-3 flex items-center justify-between shrink-0">
        <button
          onClick={() => navigate("/dashboard")}
          className="text-sm font-medium opacity-80 hover:opacity-100"
        >
          ← Dasbor
        </button>
        <h1 className="font-bold text-base">Kelola Pengguna</h1>
        <span className="text-sm opacity-70">{me?.displayName}</span>
      </header>

      <div className="flex-1 overflow-y-auto max-w-xl mx-auto w-full p-4 space-y-4">
        {isEditing ? (
          <div className="bg-white rounded-xl shadow-sm p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-800">
                {editId ? "Edit Pengguna" : "Tambah Pengguna"}
              </h2>
              <button
                onClick={resetForm}
                className="text-xs text-gray-500 hover:text-gray-700"
              >
                Batal
              </button>
            </div>

            {formError && (
              <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
                {formError}
              </p>
            )}

            <form onSubmit={handleSave} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  required={!editId}
                  disabled={!!editId}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                  placeholder="email@kolekta.id"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nama Tampilan
                </label>
                <input
                  type="text"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Nama pengguna"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Peran
                </label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as "admin" | "cashier")}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  <option value="cashier">Kasir</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Password {editId && "(kosongkan jika tidak diubah)"}
                </label>
                <input
                  type="password"
                  required={!editId}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder={editId ? "••••••••" : "Minimal 8 karakter"}
                />
              </div>

              <button
                type="submit"
                disabled={saving}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 rounded-lg transition disabled:opacity-60"
              >
                {saving ? "Menyimpan…" : editId ? "Simpan Perubahan" : "Tambah Pengguna"}
              </button>
            </form>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-600">
                Daftar Pengguna ({users.length})
              </h2>
              <button
                onClick={startCreate}
                className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition"
              >
                + Tambah
              </button>
            </div>

            {loading ? (
              <p className="text-sm text-gray-400 py-4">Memuat…</p>
            ) : error ? (
              <p className="text-sm text-red-600 py-4">{error}</p>
            ) : users.length === 0 ? (
              <p className="text-sm text-gray-400 italic py-4">
                Belum ada pengguna.
              </p>
            ) : (
              <div className="bg-white rounded-xl shadow-sm divide-y divide-gray-100">
                {users.map((user) => (
                  <div
                    key={user.id}
                    className="p-4 flex items-center justify-between"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">
                        {user.displayName}
                      </p>
                      <p className="text-xs text-gray-500 truncate">
                        {user.email}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span
                          className={`text-[10px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded-full ${
                            user.role === "admin"
                              ? "bg-purple-100 text-purple-700"
                              : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {user.role === "admin" ? "Admin" : "Kasir"}
                        </span>
                        <span className="text-[10px] text-gray-400">
                          {formatDate(user.createdAt)}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => startEdit(user)}
                      className="text-sm text-blue-600 hover:text-blue-800 font-medium shrink-0 ml-3"
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
