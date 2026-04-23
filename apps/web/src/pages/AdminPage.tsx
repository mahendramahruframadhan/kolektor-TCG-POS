import React, { useState, useEffect, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Users, Calendar, AlertTriangle, DollarSign, type LucideIcon } from "lucide-react";
import { idb } from "../lib/db.js";
import { api } from "../lib/api.js";
import { useAuthStore } from "../store/auth.js";
import { MobileAppBar } from "../components/MobileAppBar.js";
import type { IdbSetting } from "../lib/db.js";

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
    min: 0, max: 100,
  },
  {
    key: "max_transaction_discount_pct",
    labelId: "Diskon Maks per Transaksi (%)",
    labelEn: "Max Transaction Discount %",
    description: "Batas persentase diskon maksimum untuk total transaksi.",
    min: 0, max: 100,
  },
  {
    key: "cart_idle_ttl_minutes",
    labelId: "Waktu Kadaluarsa Keranjang (menit)",
    labelEn: "Cart Idle TTL (minutes)",
    description: "Berapa menit keranjang tidak aktif sebelum otomatis dibatalkan.",
    min: 1,
  },
];

function SettingRow({
  settingKey, labelId, labelEn, description, currentValue, min, max, onSaved,
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
  const [inputValue, setInputValue] = useState(String(currentValue ?? ""));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setInputValue(String(currentValue ?? ""));
  }, [currentValue]);

  async function handleSave() {
    const parsed = parseInt(inputValue, 10);
    if (isNaN(parsed) || parsed < (min ?? 0)) {
      setError(`Nilai tidak valid. ${min !== undefined ? `Minimum: ${min}.` : ""}`);
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
    <div className="py-4 border-b border-border last:border-0 space-y-2">
      <div>
        <p className="text-sm font-bold text-fg">{labelId}</p>
        <p className="text-xs text-muted-fg">{labelEn}</p>
        <p className="text-xs text-muted-fg mt-0.5">{description}</p>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={min}
          max={max}
          step={1}
          value={inputValue}
          onChange={(e) => { setInputValue(e.target.value); setError(null); setSaved(false); }}
          className={`flex-1 h-11 border rounded-xl px-3 text-sm font-medium text-fg bg-surface focus:outline-none focus:ring-2 focus:ring-primary transition ${error ? "border-destructive" : "border-border"}`}
        />
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-primary text-primary-fg text-sm font-bold px-4 py-2.5 rounded-xl transition hover:opacity-90 disabled:opacity-50 shrink-0"
        >
          {saving ? "Menyimpan…" : saved ? "Tersimpan ✓" : "Simpan"}
        </button>
      </div>
      {error && <p className="text-xs text-destructive font-medium">{error}</p>}
    </div>
  );
}

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

  useEffect(() => { loadSettings(); }, [loadSettings]);

  function handleSaved(key: string, newValue: number) {
    setSettings((prev) => ({ ...prev, [key]: newValue }));
  }

  const adminLinks: { to: string; Icon: LucideIcon; label: string }[] = [
    { to: "/admin/users",                 Icon: Users,          label: "Kelola Pengguna" },
    { to: "/admin/events",                Icon: Calendar,       label: "Kelola Event" },
    { to: "/admin/oversold",              Icon: AlertTriangle,  label: "Antrian Oversold" },
    { to: "/admin/cash-reconciliation",   Icon: DollarSign,     label: "Rekonsiliasi Kas" },
  ];

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      <MobileAppBar title="Admin" back onBack={() => navigate("/dashboard")} />

      <div className="flex-1 overflow-y-auto max-w-xl mx-auto w-full p-4 space-y-4">
        {/* Navigation links */}
        <div className="bg-card rounded-2xl border border-border p-4">
          <p className="text-[10px] font-extrabold tracking-widest uppercase text-muted-fg mb-3">
            Menu Admin
          </p>
          <div className="grid grid-cols-2 gap-3">
            {adminLinks.map((a) => (
              <Link
                key={a.to}
                to={a.to}
                className="flex flex-col items-center gap-2 p-3 rounded-xl bg-muted hover:bg-border text-center text-sm font-bold text-fg transition active:scale-[0.97]"
              >
                <a.Icon className="w-6 h-6" />
                {a.label}
              </Link>
            ))}
          </div>
        </div>

        {/* Editable settings */}
        <div className="bg-card rounded-2xl border border-border p-4">
          <p className="text-[10px] font-extrabold tracking-widest uppercase text-muted-fg mb-2">
            Pengaturan
          </p>
          {loading ? (
            <p className="text-sm text-muted-fg py-4">Memuat…</p>
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

        {/* All settings read-only */}
        <div className="bg-card rounded-2xl border border-border p-4">
          <p className="text-[10px] font-extrabold tracking-widest uppercase text-muted-fg mb-3">
            Semua Pengaturan
          </p>
          {allSettings.length === 0 ? (
            <p className="text-sm text-muted-fg italic">Tidak ada pengaturan tersimpan.</p>
          ) : (
            <ul className="divide-y divide-border">
              {allSettings.map((s) => (
                <li key={s.key} className="flex justify-between items-center py-2 text-sm">
                  <span className="text-muted-fg font-mono text-xs">{s.key}</span>
                  <span className="text-fg font-bold">{JSON.stringify(s.value)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
