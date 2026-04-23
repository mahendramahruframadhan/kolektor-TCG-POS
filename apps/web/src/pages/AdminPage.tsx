import React, { useState, useEffect, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { idb } from "../lib/db.js";
import { api } from "../lib/api.js";
import { useAuthStore } from "../store/auth.js";
import type { IdbSetting } from "../lib/db.js";

// ── Editable setting keys ──────────────────────────────────────────────────

const EDITABLE_KEYS: {
  key: string;
  labelId: string;
  labelEn: string;
  description: string;
  min?: number;
  max?: number;
}[] = [
  {
    key: "max_line_discount_pct_fixed",
    labelId: "Diskon Maks per Kartu (%)",
    labelEn: "Max Line Discount %",
    description: "Batas persentase diskon maksimum untuk setiap kartu dalam transaksi.",
    min: 0,
    max: 100,
  },
  {
    key: "max_transaction_discount_pct",
    labelId: "Diskon Maks per Transaksi (%)",
    labelEn: "Max Transaction Discount %",
    description: "Batas persentase diskon maksimum untuk total transaksi.",
    min: 0,
    max: 100,
  },
  {
    key: "cart_idle_ttl_minutes",
    labelId: "Waktu Kadaluarsa Keranjang (menit)",
    labelEn: "Cart Idle TTL (minutes)",
    description:
      "Berapa menit keranjang tidak aktif sebelum otomatis dibatalkan.",
    min: 1,
  },
];

// ── Setting row component ──────────────────────────────────────────────────

function SettingRow({
  settingKey,
  labelId,
  labelEn,
  description,
  currentValue,
  min,
  max,
  onSaved,
}: {
  settingKey: string;
  labelId: string;
  labelEn: string;
  description: string;
  currentValue: unknown;
  min?: number;
  max?: number;
  onSaved: (key: string, newValue: number) => void;
}) {
  const [inputValue, setInputValue] = useState(
    String(currentValue ?? "")
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Keep input in sync if external value changes
  useEffect(() => {
    setInputValue(String(currentValue ?? ""));
  }, [currentValue]);

  async function handleSave() {
    const parsed = parseInt(inputValue, 10);
    if (isNaN(parsed) || parsed < (min ?? 0)) {
      setError(
        `Nilai tidak valid. ${min !== undefined ? `Minimum: ${min}.` : ""}`
      );
      return;
    }
    if (max !== undefined && parsed > max) {
      setError(`Nilai tidak boleh melebihi ${max}.`);
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await api.settings.set(settingKey, parsed);
      await idb.settings.put({ key: settingKey, value: parsed });
      onSaved(settingKey, parsed);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan pengaturan.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="py-4 border-b border-gray-100 last:border-b-0 space-y-2">
      <div>
        <p className="text-sm font-semibold text-gray-800">{labelId}</p>
        <p className="text-xs text-gray-400">{labelEn}</p>
        <p className="text-xs text-gray-500 mt-0.5">{description}</p>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={min}
          max={max}
          step={1}
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            setError(null);
            setSaved(false);
          }}
          className={`flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
            error ? "border-red-400" : "border-gray-300"
          }`}
        />
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition disabled:opacity-50 shrink-0"
        >
          {saving ? "Menyimpan…" : saved ? "Tersimpan ✓" : "Simpan"}
        </button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

export function AdminPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  const [settings, setSettings] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [allSettings, setAllSettings] = useState<IdbSetting[]>([]);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const list = await idb.settings.toArray();
      setAllSettings(list);
      const map: Record<string, unknown> = {};
      for (const s of list) map[s.key] = s.value;
      setSettings(map);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  function handleSaved(key: string, newValue: number) {
    setSettings((prev) => ({ ...prev, [key]: newValue }));
  }

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
        <h1 className="font-bold text-base">Admin / Settings</h1>
        <span className="text-sm opacity-70">{user?.displayName}</span>
      </header>

      <div className="flex-1 overflow-y-auto max-w-xl mx-auto w-full p-4 space-y-4">
        {/* Navigation links */}
        <div className="bg-white rounded-xl shadow-sm p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-3">
            Menu Admin
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Link
              to="/admin/users"
              className="block text-center bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg py-2 text-sm font-semibold transition"
            >
              👥 Kelola Pengguna
            </Link>
            <Link
              to="/admin/oversold"
              className="block text-center bg-red-50 hover:bg-red-100 text-red-700 rounded-lg py-2 text-sm font-semibold transition"
            >
              🚨 Antrian Oversold
            </Link>
            <Link
              to="/admin/cash-reconciliation"
              className="block text-center bg-green-50 hover:bg-green-100 text-green-700 rounded-lg py-2 text-sm font-semibold transition"
            >
              💰 Rekonsiliasi Kas
            </Link>
          </div>
        </div>

        {/* Editable settings */}
        <div className="bg-white rounded-xl shadow-sm p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-2">
            Pengaturan / Settings
          </p>
          {loading ? (
            <p className="text-sm text-gray-400 py-4">Memuat…</p>
          ) : (
            EDITABLE_KEYS.map((def) => (
              <SettingRow
                key={def.key}
                settingKey={def.key}
                labelId={def.labelId}
                labelEn={def.labelEn}
                description={def.description}
                currentValue={settings[def.key] ?? ""}
                min={def.min}
                max={def.max}
                onSaved={handleSaved}
              />
            ))
          )}
        </div>

        {/* All settings (read-only view) */}
        <div className="bg-white rounded-xl shadow-sm p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-3">
            Semua Pengaturan / All Settings
          </p>
          {allSettings.length === 0 ? (
            <p className="text-sm text-gray-400 italic">
              Tidak ada pengaturan tersimpan.
            </p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {allSettings.map((s) => (
                <li
                  key={s.key}
                  className="flex justify-between items-center py-2 text-sm"
                >
                  <span className="text-gray-600 font-mono text-xs">
                    {s.key}
                  </span>
                  <span className="text-gray-800 font-semibold">
                    {JSON.stringify(s.value)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
