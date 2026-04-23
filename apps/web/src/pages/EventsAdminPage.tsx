import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api.js";
import { useAuthStore } from "../store/auth.js";

interface Event {
  id: string;
  name: string;
  venue: string;
  startDate: string;
  endDate: string;
  status: string;
  version: number;
  createdAt: number;
}

export function EventsAdminPage() {
  const navigate = useNavigate();
  const me = useAuthStore((s) => s.user);

  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editVersion, setEditVersion] = useState(1);
  const [name, setName] = useState("");
  const [venue, setVenue] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [status, setStatus] = useState<"draft" | "active" | "closed">("draft");
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await api.events.list();
      setEvents(list);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Gagal memuat event.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  function resetForm() {
    setName("");
    setVenue("");
    setStartDate("");
    setEndDate("");
    setStatus("draft");
    setFormError(null);
    setEditId(null);
    setEditVersion(1);
    setIsEditing(false);
  }

  function startCreate() {
    resetForm();
    setIsEditing(true);
  }

  function startEdit(ev: Event) {
    setName(ev.name);
    setVenue(ev.venue);
    setStartDate(ev.startDate);
    setEndDate(ev.endDate);
    setStatus(ev.status as "draft" | "active" | "closed");
    setEditId(ev.id);
    setEditVersion(ev.version);
    setIsEditing(true);
    setFormError(null);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!name.trim()) {
      setFormError("Nama event wajib diisi.");
      return;
    }
    if (!startDate) {
      setFormError("Tanggal mulai wajib diisi.");
      return;
    }
    if (!endDate) {
      setFormError("Tanggal selesai wajib diisi.");
      return;
    }
    if (new Date(startDate) > new Date(endDate)) {
      setFormError("Tanggal selesai tidak boleh sebelum tanggal mulai.");
      return;
    }

    setSaving(true);
    try {
      if (editId) {
        await api.events.update(editId, {
          name: name.trim(),
          venue: venue.trim(),
          startDate,
          endDate,
          status,
          version: editVersion,
        });
      } else {
        await api.events.create({
          name: name.trim(),
          venue: venue.trim(),
          startDate,
          endDate,
          status,
        });
      }
      resetForm();
      await loadEvents();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Gagal menyimpan event.");
    } finally {
      setSaving(false);
    }
  }

  const statusBadge = (s: string) => {
    const map: Record<string, string> = {
      draft: "bg-gray-100 text-gray-600",
      active: "bg-green-100 text-green-700",
      closed: "bg-red-100 text-red-700",
    };
    const label: Record<string, string> = {
      draft: "Draft",
      active: "Aktif",
      closed: "Ditutup",
    };
    return (
      <span className={`text-[10px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded-full ${map[s] ?? map.draft}`}>
        {label[s] ?? s}
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <header className="bg-blue-700 text-white px-4 py-3 flex items-center justify-between shrink-0">
        <button
          onClick={() => navigate("/dashboard")}
          className="text-sm font-medium opacity-80 hover:opacity-100"
        >
          ← Dasbor
        </button>
        <h1 className="font-bold text-base">Kelola Event</h1>
        <span className="text-sm opacity-70">{me?.displayName}</span>
      </header>

      <div className="flex-1 overflow-y-auto max-w-xl mx-auto w-full p-4 space-y-4">
        {isEditing ? (
          <div className="bg-white rounded-xl shadow-sm p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-800">
                {editId ? "Edit Event" : "Tambah Event"}
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
                  Nama Event <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Contoh: Pop Con 2026"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Venue
                </label>
                <input
                  type="text"
                  value={venue}
                  onChange={(e) => setVenue(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Contoh: Jakarta Convention Center"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tanggal Mulai <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tanggal Selesai <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Status
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as "draft" | "active" | "closed")}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  <option value="draft">Draft</option>
                  <option value="active">Aktif</option>
                  <option value="closed">Ditutup</option>
                </select>
                {status === "active" && (
                  <p className="text-xs text-amber-600 mt-1">
                    Hanya boleh ada satu event aktif dalam satu waktu.
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={saving}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 rounded-lg transition disabled:opacity-60"
              >
                {saving ? "Menyimpan…" : editId ? "Simpan Perubahan" : "Tambah Event"}
              </button>
            </form>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-600">
                Daftar Event ({events.length})
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
            ) : events.length === 0 ? (
              <p className="text-sm text-gray-400 italic py-4">
                Belum ada event.
              </p>
            ) : (
              <div className="bg-white rounded-xl shadow-sm divide-y divide-gray-100">
                {events.map((ev) => (
                  <div
                    key={ev.id}
                    className="p-4 flex items-center justify-between"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">
                        {ev.name}
                      </p>
                      {ev.venue && (
                        <p className="text-xs text-gray-500 truncate">
                          {ev.venue}
                        </p>
                      )}
                      <div className="flex items-center gap-2 mt-1">
                        {statusBadge(ev.status)}
                        <span className="text-[10px] text-gray-400">
                          {ev.startDate} — {ev.endDate}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => startEdit(ev)}
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
