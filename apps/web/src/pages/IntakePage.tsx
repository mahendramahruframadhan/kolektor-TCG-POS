import React, { useState, useEffect, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
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

// ── Thumbnail helper ───────────────────────────────────────────────────────

function createThumbnail(file: File, maxPx = 300): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(maxPx / img.width, maxPx / img.height, 1);
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("No canvas context"));
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("toBlob failed"));
      }, "image/jpeg", 0.8);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Image load failed")); };
    img.src = url;
  });
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
  isGraded: boolean;
  gradingCompany: string;
  grade: string;
  certNumber: string;
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
  isGraded: false,
  gradingCompany: "",
  grade: "",
  certNumber: "",
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
const GRADING_COMPANIES = ["PSA", "BGS", "CGC", "ACE", "Other"];

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

  // Photo
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    idb.users.toArray().then((list) => setUsers(list));
  }, []);

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

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setPhotoFile(file);
    if (file) {
      const url = URL.createObjectURL(file);
      setPhotoPreview(url);
    } else {
      setPhotoPreview(null);
    }
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

    if (form.isGraded) {
      if (!form.gradingCompany.trim()) newErrors.gradingCompany = "Grading company wajib diisi.";
      if (!form.grade.trim()) newErrors.grade = "Grade wajib diisi.";
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
      const activeEvent = await idb.events.filter((ev) => ev.status === "active").first();

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
        isGraded: form.isGraded,
        ...(form.isGraded ? {
          gradingCompany: form.gradingCompany.trim(),
          grade: form.grade.trim(),
          certNumber: form.certNumber.trim() || undefined,
        } : {}),
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
        isGraded: form.isGraded,
        ...(form.isGraded ? {
          gradingCompany: form.gradingCompany.trim(),
          grade: form.grade.trim(),
          certNumber: form.certNumber.trim() || undefined,
        } : {}),
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

      // If photo selected, store thumbnail in IDB pending upload
      if (photoFile) {
        try {
          const thumb = await createThumbnail(photoFile);
          await idb.pendingPhotos.put({
            cardClientId: clientId,
            blob: thumb,
            createdAt: Math.floor(Date.now() / 1000),
          });
          // Try immediate upload if online
          if (navigator.onLine) {
            const formData = new FormData();
            formData.append("photo", thumb, "photo.jpg");
            fetch(`/api/sync/photo/${clientId}`, {
              method: "POST",
              credentials: "include",
              body: formData,
            }).then(async (res) => {
              if (res.ok) await idb.pendingPhotos.delete(clientId);
            }).catch(() => null);
          }
        } catch {
          // Non-fatal — photo queued for later upload
        }
      }

      setSuccessMessage(`Kartu berhasil ditambahkan (${shortId})`);
      setForm(INITIAL_FORM);
      setPhotoFile(null);
      setPhotoPreview(null);
      if (photoInputRef.current) photoInputRef.current.value = "";
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : "Gagal menyimpan kartu.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <header className="bg-blue-700 text-white px-4 py-3 flex items-center justify-between shrink-0">
        <button onClick={() => navigate("/dashboard")} className="text-sm font-medium opacity-80 hover:opacity-100">
          ← Dasbor
        </button>
        <h1 className="font-bold text-base">Intake Kartu</h1>
        <Link to="/intake/bulk" className="text-xs bg-blue-600 hover:bg-blue-500 border border-blue-400 px-2 py-1 rounded font-medium">
          Bulk Import
        </Link>
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
            <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">ID Kartu (Short ID)</p>
            <div className="flex items-center gap-3">
              <span className="font-mono text-2xl font-bold text-blue-700 tracking-widest flex-1">{shortId || "—"}</span>
              <button type="button" onClick={regenerateShortId}
                className="text-sm text-blue-600 hover:text-blue-800 font-medium border border-blue-300 rounded-lg px-3 py-1.5 hover:bg-blue-50 transition">
                Buat Ulang
              </button>
            </div>
          </div>

          {/* Card info */}
          <div className="bg-white rounded-xl shadow-sm p-4 space-y-4">
            <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">Informasi Kartu</p>

            {/* Owner */}
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Pemilik <span className="text-red-500">*</span></label>
              <select value={form.ownerUserId} onChange={(e) => setField("ownerUserId", e.target.value)}
                className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.ownerUserId ? "border-red-400" : "border-gray-300"}`}>
                <option value="">-- Pilih Pemilik --</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.displayName}</option>)}
              </select>
              {errors.ownerUserId && <p className="text-xs text-red-600">{errors.ownerUserId}</p>}
            </div>

            {/* Title */}
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Judul Kartu <span className="text-red-500">*</span></label>
              <input type="text" value={form.title} onChange={(e) => setField("title", e.target.value)}
                placeholder="Contoh: Charizard VSTAR"
                className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.title ? "border-red-400" : "border-gray-300"}`} />
              {errors.title && <p className="text-xs text-red-600">{errors.title}</p>}
            </div>

            {/* Set Name + Number */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">Nama Set</label>
                <input type="text" value={form.setName} onChange={(e) => setField("setName", e.target.value)}
                  placeholder="Brilliant Stars"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">Nomor Set</label>
                <input type="text" value={form.setNumber} onChange={(e) => setField("setNumber", e.target.value)}
                  placeholder="018/172"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>

            {/* Rarity */}
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Kelangkaan (Rarity)</label>
              <input type="text" value={form.rarity} onChange={(e) => setField("rarity", e.target.value)}
                placeholder="Rare Holo, Ultra Rare"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>

            {/* Language + Condition */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">Bahasa</label>
                <select value={form.language} onChange={(e) => setField("language", e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {LANGUAGE_OPTIONS.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">Kondisi</label>
                <select value={form.condition} onChange={(e) => setField("condition", e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {CONDITION_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>

            {/* Edition */}
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Edisi</label>
              <input type="text" value={form.edition} onChange={(e) => setField("edition", e.target.value)}
                placeholder="1st Edition, Shadowless"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>

            {/* Graded toggle + fields (F16) */}
            <div className="space-y-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.isGraded}
                  onChange={(e) => setField("isGraded", e.target.checked)}
                  className="w-4 h-4 accent-blue-600" />
                <span className="text-sm font-medium text-gray-700">Kartu Graded (PSA/BGS/CGC/dll)</span>
              </label>

              {form.isGraded && (
                <div className="bg-blue-50 rounded-lg p-3 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-sm font-medium text-gray-700">Grading Company <span className="text-red-500">*</span></label>
                      <select value={form.gradingCompany} onChange={(e) => setField("gradingCompany", e.target.value)}
                        className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none ${errors.gradingCompany ? "border-red-400" : "border-gray-300"}`}>
                        <option value="">-- Pilih --</option>
                        {GRADING_COMPANIES.map((gc) => <option key={gc} value={gc}>{gc}</option>)}
                      </select>
                      {errors.gradingCompany && <p className="text-xs text-red-600">{errors.gradingCompany}</p>}
                    </div>
                    <div className="space-y-1">
                      <label className="text-sm font-medium text-gray-700">Grade <span className="text-red-500">*</span></label>
                      <input type="text" value={form.grade} onChange={(e) => setField("grade", e.target.value)}
                        placeholder="10, 9.5, 9"
                        className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none ${errors.grade ? "border-red-400" : "border-gray-300"}`} />
                      {errors.grade && <p className="text-xs text-red-600">{errors.grade}</p>}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-gray-700">Cert Number</label>
                    <input type="text" value={form.certNumber} onChange={(e) => setField("certNumber", e.target.value)}
                      placeholder="Nomor sertifikat"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none" />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Photo capture (F19) */}
          <div className="bg-white rounded-xl shadow-sm p-4 space-y-3">
            <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">Foto Kartu (opsional)</p>
            {photoPreview && (
              <img src={photoPreview} alt="Preview" className="w-32 h-32 object-cover rounded-lg border border-gray-200" />
            )}
            <div className="flex items-center gap-3">
              <input ref={photoInputRef} type="file" accept="image/*" capture="environment"
                onChange={handlePhotoChange} className="hidden" id="photo-input" />
              <label htmlFor="photo-input"
                className="text-sm text-blue-600 border border-blue-300 rounded-lg px-3 py-2 cursor-pointer hover:bg-blue-50 transition">
                {photoFile ? "Ganti Foto" : "Ambil Foto"}
              </label>
              {photoFile && (
                <button type="button" onClick={() => { setPhotoFile(null); setPhotoPreview(null); if (photoInputRef.current) photoInputRef.current.value = ""; }}
                  className="text-xs text-red-500 hover:text-red-700">
                  Hapus
                </button>
              )}
            </div>
            {photoFile && (
              <p className="text-xs text-gray-400">
                {!navigator.onLine ? "Thumbnail tersimpan lokal, upload saat online." : "Foto akan diupload setelah simpan."}
              </p>
            )}
          </div>

          {/* Pricing */}
          <div className="bg-white rounded-xl shadow-sm p-4 space-y-4">
            <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">Penetapan Harga</p>

            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="pricingMode" value="fixed"
                  checked={form.pricingMode === "fixed"} onChange={() => setField("pricingMode", "fixed")}
                  className="accent-blue-600" />
                <span className="text-sm font-medium text-gray-700">Harga Tetap</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="pricingMode" value="negotiable"
                  checked={form.pricingMode === "negotiable"} onChange={() => setField("pricingMode", "negotiable")}
                  className="accent-blue-600" />
                <span className="text-sm font-medium text-gray-700">Harga Negosiasi</span>
              </label>
            </div>

            {form.pricingMode === "fixed" ? (
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">Harga (IDR) <span className="text-red-500">*</span></label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500 pointer-events-none">Rp</span>
                  <input type="number" min={1} step={1} value={form.priceIdr}
                    onChange={(e) => setField("priceIdr", e.target.value)} placeholder="0"
                    className={`w-full border rounded-lg pl-10 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.priceIdr ? "border-red-400" : "border-gray-300"}`} />
                </div>
                {errors.priceIdr && <p className="text-xs text-red-600">{errors.priceIdr}</p>}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-700">Harga Tayang (IDR) <span className="text-red-500">*</span></label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500 pointer-events-none">Rp</span>
                    <input type="number" min={1} step={1} value={form.listedPriceIdr}
                      onChange={(e) => setField("listedPriceIdr", e.target.value)} placeholder="0"
                      className={`w-full border rounded-lg pl-10 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.listedPriceIdr ? "border-red-400" : "border-gray-300"}`} />
                  </div>
                  {errors.listedPriceIdr && <p className="text-xs text-red-600">{errors.listedPriceIdr}</p>}
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-700">Harga Minimum / Bottom (IDR) <span className="text-red-500">*</span></label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500 pointer-events-none">Rp</span>
                    <input type="number" min={1} step={1} value={form.bottomPriceIdr}
                      onChange={(e) => setField("bottomPriceIdr", e.target.value)} placeholder="0"
                      className={`w-full border rounded-lg pl-10 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.bottomPriceIdr ? "border-red-400" : "border-gray-300"}`} />
                  </div>
                  {errors.bottomPriceIdr && <p className="text-xs text-red-600">{errors.bottomPriceIdr}</p>}
                </div>
              </div>
            )}
          </div>

          <button type="submit" disabled={submitting}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl text-base transition disabled:opacity-50">
            {submitting ? "Menyimpan…" : "Simpan Kartu"}
          </button>
        </form>
      </div>
    </div>
  );
}
