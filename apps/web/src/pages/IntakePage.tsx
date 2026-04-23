import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { v4 as uuidv4 } from "uuid";
import { idb } from "../lib/db.js";
import { api } from "../lib/api.js";
import { useAuthStore } from "../store/auth.js";
import type { IdbUser } from "../lib/db.js";

// ── Short ID generator ─────────────────────────────────────────────────────

function genShortId(ownerIndex: number): string {
  const ownerChar = ownerIndex < 10 ? String(ownerIndex) : "A";
  const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let rand = "";
  for (let i = 0; i < 5; i++) rand += chars[Math.floor(Math.random() * 36)];
  return `${ownerChar}-${rand}`;
}

// ── Types ──────────────────────────────────────────────────────────────────

type PricingMode = "fixed" | "negotiable";

interface FormState {
  ownerUserId: string;
  title: string;
  setName: string;
  setNumber: string;
  rarity: string;
  language: string;
  condition: string;
  edition: string;
  pricingMode: PricingMode;
  priceIdr: string;
  listedPriceIdr: string;
  bottomPriceIdr: string;
}

const INITIAL_FORM: FormState = {
  ownerUserId: "",
  title: "",
  setName: "",
  setNumber: "",
  rarity: "",
  language: "EN",
  condition: "Near Mint",
  edition: "",
  pricingMode: "fixed",
  priceIdr: "",
  listedPriceIdr: "",
  bottomPriceIdr: "",
};

const LANGUAGE_OPTIONS = ["EN", "JP", "ID", "KR", "CN", "Other"];
const CONDITION_OPTIONS = [
  "Mint",
  "Near Mint",
  "Lightly Played",
  "Moderately Played",
  "Heavily Played",
  "Damaged",
];

// ── Component ──────────────────────────────────────────────────────────────

export function IntakePage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  const [users, setUsers] = useState<IdbUser[]>([]);
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [shortId, setShortId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Load users from IDB
  useEffect(() => {
    idb.users.toArray().then((list) => {
      setUsers(list);
    });
  }, []);

  // Generate initial short ID once users load (or when owner changes)
  useEffect(() => {
    regenerateShortId();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.ownerUserId, users]);

  function regenerateShortId() {
    const ownerIndex = users.findIndex((u) => u.id === form.ownerUserId);
    const idx = ownerIndex >= 0 ? ownerIndex : 0;
    setShortId(genShortId(idx));
  }

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  }

  function validate(): boolean {
    const newErrors: Partial<Record<keyof FormState, string>> = {};

    if (!form.ownerUserId) newErrors.ownerUserId = "Pilih pemilik kartu.";
    if (!form.title.trim()) newErrors.title = "Judul wajib diisi.";

    if (form.pricingMode === "fixed") {
      const price = parseInt(form.priceIdr, 10);
      if (!form.priceIdr || isNaN(price) || price <= 0) {
        newErrors.priceIdr = "Harga wajib diisi (bilangan bulat positif).";
      }
    } else {
      const listed = parseInt(form.listedPriceIdr, 10);
      const bottom = parseInt(form.bottomPriceIdr, 10);
      if (!form.listedPriceIdr || isNaN(listed) || listed <= 0) {
        newErrors.listedPriceIdr = "Harga tayang wajib diisi.";
      }
      if (!form.bottomPriceIdr || isNaN(bottom) || bottom <= 0) {
        newErrors.bottomPriceIdr = "Harga minimum wajib diisi.";
      }
      if (!isNaN(listed) && !isNaN(bottom) && bottom > listed) {
        newErrors.bottomPriceIdr = "Harga minimum tidak boleh melebihi harga tayang.";
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    setSubmitError(null);
    setSubmitting(true);
    try {
      const activeEvent = await idb.events
        .filter((ev) => ev.status === "active")
        .first();

      const clientId = uuidv4();
      const body = {
        clientId,
        shortId,
        ownerUserId: form.ownerUserId,
        intakenByUserId: user!.id,
        eventId: activeEvent?.id,
        title: form.title.trim(),
        setName: form.setName.trim(),
        setNumber: form.setNumber.trim(),
        rarity: form.rarity.trim(),
        language: form.language,
        condition: form.condition,
        edition: form.edition.trim(),
        pricingMode: form.pricingMode,
        ...(form.pricingMode === "fixed"
          ? { priceIdr: parseInt(form.priceIdr, 10) }
          : {
              listedPriceIdr: parseInt(form.listedPriceIdr, 10),
              bottomPriceIdr: parseInt(form.bottomPriceIdr, 10),
            }),
      };

      const created = (await api.cards.create(body)) as { id: string };

      // Save to IDB
      await idb.cards.put({
        id: created.id,
        clientId,
        shortId,
        ownerUserId: form.ownerUserId,
        intakenByUserId: user!.id,
        eventId: activeEvent?.id,
        title: form.title.trim(),
        setName: form.setName.trim(),
        setNumber: form.setNumber.trim(),
        rarity: form.rarity.trim(),
        language: form.language,
        condition: form.condition,
        edition: form.edition.trim(),
        isGraded: false,
        pricingMode: form.pricingMode,
        ...(form.pricingMode === "fixed"
          ? { priceIdr: parseInt(form.priceIdr, 10) }
          : {
              listedPriceIdr: parseInt(form.listedPriceIdr, 10),
              bottomPriceIdr: parseInt(form.bottomPriceIdr, 10),
            }),
        status: "available",
        oversold: false,
        version: 1,
      });

      setSuccessMessage(`Kartu berhasil ditambahkan (${shortId})`);
      setForm(INITIAL_FORM);
      // regenerateShortId will run via useEffect on form.ownerUserId reset
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: unknown) {
      setSubmitError(
        err instanceof Error ? err.message : "Gagal menyimpan kartu."
      );
    } finally {
      setSubmitting(false);
    }
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
        <h1 className="font-bold text-base">Intake Kartu</h1>
        <span className="text-sm opacity-70">{user?.displayName}</span>
      </header>

      <div className="flex-1 overflow-y-auto max-w-xl mx-auto w-full p-4">
        {successMessage && (
          <div className="mb-4 bg-green-50 border border-green-200 text-green-800 rounded-xl px-4 py-3 text-sm font-medium">
            {successMessage}
          </div>
        )}
        {submitError && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
            {submitError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {/* Short ID */}
          <div className="bg-white rounded-xl shadow-sm p-4 space-y-2">
            <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">
              ID Kartu (Short ID)
            </p>
            <div className="flex items-center gap-3">
              <span className="font-mono text-2xl font-bold text-blue-700 tracking-widest flex-1">
                {shortId || "—"}
              </span>
              <button
                type="button"
                onClick={regenerateShortId}
                className="text-sm text-blue-600 hover:text-blue-800 font-medium border border-blue-300 rounded-lg px-3 py-1.5 hover:bg-blue-50 transition"
              >
                Buat Ulang
              </button>
            </div>
          </div>

          {/* Owner + Title */}
          <div className="bg-white rounded-xl shadow-sm p-4 space-y-4">
            <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">
              Informasi Kartu
            </p>

            {/* Owner */}
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">
                Pemilik <span className="text-red-500">*</span>
              </label>
              <select
                value={form.ownerUserId}
                onChange={(e) => setField("ownerUserId", e.target.value)}
                className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.ownerUserId ? "border-red-400" : "border-gray-300"
                }`}
              >
                <option value="">-- Pilih Pemilik --</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.displayName}
                  </option>
                ))}
              </select>
              {errors.ownerUserId && (
                <p className="text-xs text-red-600">{errors.ownerUserId}</p>
              )}
            </div>

            {/* Title */}
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">
                Judul Kartu <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setField("title", e.target.value)}
                placeholder="Contoh: Charizard VSTAR"
                className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.title ? "border-red-400" : "border-gray-300"
                }`}
              />
              {errors.title && (
                <p className="text-xs text-red-600">{errors.title}</p>
              )}
            </div>

            {/* Set Name + Number */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">
                  Nama Set
                </label>
                <input
                  type="text"
                  value={form.setName}
                  onChange={(e) => setField("setName", e.target.value)}
                  placeholder="Contoh: Brilliant Stars"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">
                  Nomor Set
                </label>
                <input
                  type="text"
                  value={form.setNumber}
                  onChange={(e) => setField("setNumber", e.target.value)}
                  placeholder="Contoh: 018/172"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Rarity */}
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">
                Kelangkaan (Rarity)
              </label>
              <input
                type="text"
                value={form.rarity}
                onChange={(e) => setField("rarity", e.target.value)}
                placeholder="Contoh: Rare Holo, Ultra Rare"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Language + Condition */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">
                  Bahasa
                </label>
                <select
                  value={form.language}
                  onChange={(e) => setField("language", e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {LANGUAGE_OPTIONS.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">
                  Kondisi
                </label>
                <select
                  value={form.condition}
                  onChange={(e) => setField("condition", e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {CONDITION_OPTIONS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Edition */}
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">
                Edisi
              </label>
              <input
                type="text"
                value={form.edition}
                onChange={(e) => setField("edition", e.target.value)}
                placeholder="Contoh: 1st Edition, Shadowless"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Pricing */}
          <div className="bg-white rounded-xl shadow-sm p-4 space-y-4">
            <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">
              Penetapan Harga
            </p>

            {/* Pricing mode radio */}
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="pricingMode"
                  value="fixed"
                  checked={form.pricingMode === "fixed"}
                  onChange={() => setField("pricingMode", "fixed")}
                  className="accent-blue-600"
                />
                <span className="text-sm font-medium text-gray-700">
                  Harga Tetap
                </span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="pricingMode"
                  value="negotiable"
                  checked={form.pricingMode === "negotiable"}
                  onChange={() => setField("pricingMode", "negotiable")}
                  className="accent-blue-600"
                />
                <span className="text-sm font-medium text-gray-700">
                  Harga Negosiasi
                </span>
              </label>
            </div>

            {form.pricingMode === "fixed" ? (
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">
                  Harga (IDR) <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500 pointer-events-none">
                    Rp
                  </span>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={form.priceIdr}
                    onChange={(e) => setField("priceIdr", e.target.value)}
                    placeholder="0"
                    className={`w-full border rounded-lg pl-10 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      errors.priceIdr ? "border-red-400" : "border-gray-300"
                    }`}
                  />
                </div>
                {errors.priceIdr && (
                  <p className="text-xs text-red-600">{errors.priceIdr}</p>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-700">
                    Harga Tayang (IDR) <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500 pointer-events-none">
                      Rp
                    </span>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={form.listedPriceIdr}
                      onChange={(e) => setField("listedPriceIdr", e.target.value)}
                      placeholder="0"
                      className={`w-full border rounded-lg pl-10 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        errors.listedPriceIdr
                          ? "border-red-400"
                          : "border-gray-300"
                      }`}
                    />
                  </div>
                  {errors.listedPriceIdr && (
                    <p className="text-xs text-red-600">
                      {errors.listedPriceIdr}
                    </p>
                  )}
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-700">
                    Harga Minimum / Bottom (IDR){" "}
                    <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500 pointer-events-none">
                      Rp
                    </span>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={form.bottomPriceIdr}
                      onChange={(e) => setField("bottomPriceIdr", e.target.value)}
                      placeholder="0"
                      className={`w-full border rounded-lg pl-10 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        errors.bottomPriceIdr
                          ? "border-red-400"
                          : "border-gray-300"
                      }`}
                    />
                  </div>
                  {errors.bottomPriceIdr && (
                    <p className="text-xs text-red-600">
                      {errors.bottomPriceIdr}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl text-base transition disabled:opacity-50"
          >
            {submitting ? "Menyimpan…" : "Simpan Kartu"}
          </button>
        </form>
      </div>
    </div>
  );
}
