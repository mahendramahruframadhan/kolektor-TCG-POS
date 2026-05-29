import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Pencil, Trash2, Check, X } from "lucide-react";
import { api } from "../lib/api.js";
import { MobileAppBar } from "../components/MobileAppBar.js";

type Channel = {
  id: string;
  name: string;
  type: string;
  isActive: boolean;
  sortOrder: number;
  version: number;
};

const CHANNEL_TYPES = [
  { value: "cash",          label: "Tunai" },
  { value: "bank_transfer", label: "Transfer Bank" },
  { value: "ewallet",       label: "E-Wallet" },
  { value: "qris",          label: "QRIS" },
  { value: "other",         label: "Lainnya" },
];

const inputCls = "w-full h-11 border border-border rounded-xl px-3 text-sm font-medium text-fg bg-surface focus:outline-none focus:ring-2 focus:ring-primary transition";
const labelCls = "block text-[10px] font-extrabold tracking-widest uppercase text-muted-fg mb-1";

export function PaymentChannelsAdminPage() {
  const navigate = useNavigate();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [editId, setEditId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState("cash");
  const [sortOrder, setSortOrder] = useState("0");
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await api.paymentChannels.list();
      setChannels(list as Channel[]);
    } catch {
      setError("Gagal memuat metode pembayaran.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openAdd() {
    setEditId(null);
    setName("");
    setType("cash");
    setSortOrder(String(channels.length));
    setFormError(null);
    setIsAdding(true);
  }

  function openEdit(ch: Channel) {
    setIsAdding(false);
    setEditId(ch.id);
    setName(ch.name);
    setType(ch.type);
    setSortOrder(String(ch.sortOrder));
    setFormError(null);
  }

  function cancelForm() {
    setIsAdding(false);
    setEditId(null);
    setFormError(null);
  }

  async function handleSave() {
    if (!name.trim()) { setFormError("Nama wajib diisi."); return; }
    const order = parseInt(sortOrder, 10);
    if (isNaN(order)) { setFormError("Urutan harus angka."); return; }
    setSaving(true);
    setFormError(null);
    try {
      if (isAdding) {
        await api.paymentChannels.create({ name: name.trim(), type, sortOrder: order });
      } else if (editId) {
        const ch = channels.find((c) => c.id === editId);
        if (!ch) return;
        await api.paymentChannels.update(editId, { name: name.trim(), type, sortOrder: order, version: ch.version });
      }
      cancelForm();
      await load();
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : "Gagal menyimpan.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(ch: Channel) {
    setDeleteError(null);
    try {
      await api.paymentChannels.delete(ch.id);
      await load();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Gagal menghapus.";
      setDeleteError(msg);
    }
  }

  return (
    <div className="min-h-screen bg-surface bg-dotted-overlay flex flex-col">
      <MobileAppBar title="Metode Pembayaran" back onBack={() => navigate(-1)} />

      <div className="flex-1 overflow-y-auto max-w-xl mx-auto w-full p-3 space-y-3">
        {error && (
          <div className="bg-destructive bg-opacity-10 border border-destructive border-opacity-30 text-destructive rounded-xl px-3 py-2 text-sm font-medium">
            {error}
          </div>
        )}
        {deleteError && (
          <div className="bg-destructive bg-opacity-10 border border-destructive border-opacity-30 text-destructive rounded-xl px-3 py-2 text-sm font-medium">
            {deleteError}
          </div>
        )}

        {/* Add/Edit form */}
        {(isAdding || editId) && (
          <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
            <p className="text-sm font-extrabold text-fg">
              {isAdding ? "Tambah Metode Pembayaran" : "Edit Metode Pembayaran"}
            </p>
            <div>
              <label className={labelCls}>Nama</label>
              <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Contoh: BCA" />
            </div>
            <div>
              <label className={labelCls}>Tipe</label>
              <select className={inputCls} value={type} onChange={(e) => setType(e.target.value)}>
                {CHANNEL_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Urutan Tampil</label>
              <input className={inputCls} type="number" min={0} value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
            </div>
            {formError && <p className="text-xs text-destructive font-medium">{formError}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="flex-1 h-11 rounded-xl bg-primary text-primary-fg text-sm font-bold disabled:opacity-50"
              >
                {saving ? "Menyimpan…" : "Simpan"}
              </button>
              <button
                type="button"
                onClick={cancelForm}
                className="h-11 w-11 rounded-xl border border-border flex items-center justify-center text-muted-fg hover:bg-muted transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <p className="text-sm text-muted-fg text-center py-8">Memuat…</p>
        ) : (
          <ul className="space-y-2">
            {channels.map((ch) => (
              <li key={ch.id} className="bg-card border border-border rounded-2xl px-4 py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-fg">{ch.name}</p>
                  <p className="text-xs text-muted-fg">
                    {CHANNEL_TYPES.find((t) => t.value === ch.type)?.label ?? ch.type}
                    {" · "}urutan {ch.sortOrder}
                    {!ch.isActive && <span className="ml-1 text-destructive font-semibold">(nonaktif)</span>}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => openEdit(ch)}
                  className="w-9 h-9 rounded-xl border border-border flex items-center justify-center text-muted-fg hover:bg-muted transition"
                  aria-label="Edit"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(ch)}
                  className="w-9 h-9 rounded-xl border border-destructive border-opacity-40 flex items-center justify-center text-destructive hover:bg-destructive hover:bg-opacity-10 transition"
                  aria-label="Hapus"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {!isAdding && !editId && (
          <button
            type="button"
            onClick={openAdd}
            className="w-full h-11 rounded-xl border-2 border-dashed border-border text-sm font-semibold text-muted-fg hover:bg-muted transition flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Tambah Metode Pembayaran
          </button>
        )}
      </div>
    </div>
  );
}
