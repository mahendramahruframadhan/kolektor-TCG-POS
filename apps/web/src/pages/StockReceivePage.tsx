import React, { useState, useEffect, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { v4 as uuidv4 } from "uuid";
import { liveQuery } from "dexie";
import { generateShortId } from "@kolektapos/qr";
import { idb } from "../lib/db.js";
import { api } from "../lib/api.js";
import { useAuthStore } from "../store/auth.js";
import { MobileAppBar } from "../components/MobileAppBar.js";
import { Toast } from "../components/Toast.js";
import type { IdbUser } from "../lib/db.js";
import { CONDITIONS, LANGUAGES, GRADING_COMPANIES } from "../lib/constants.js";

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
  category: string;
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
  category: "",
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

const LANGUAGE_OPTIONS = LANGUAGES;
const CONDITION_OPTIONS = CONDITIONS;

// ── Shared field label ──────────────────────────────────────────────────────

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-[10px] font-extrabold tracking-widest uppercase text-muted-fg mb-1">
      {children}
      {required && <span className="text-destructive ml-1">*</span>}
    </label>
  );
}

function inputCls(error?: string) {
  return `w-full h-11 border rounded-xl px-3 text-sm font-medium text-fg bg-surface focus:outline-none focus:ring-2 focus:ring-primary transition ${
    error ? "border-destructive" : "border-border"
  }`;
}

// ── Component ──────────────────────────────────────────────────────────────

export function StockReceivePage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  const [users, setUsers] = useState<IdbUser[]>([]);
  const [existingCategories, setExistingCategories] = useState<string[]>([]);
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [shortId, setShortId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const sub = liveQuery(() => idb.users.toArray()).subscribe({
      next: (list) => setUsers(list),
    });
    return () => sub.unsubscribe();
  }, []);

  useEffect(() => {
    idb.cards.toArray().then((cards) => {
      const cats = [...new Set(cards.map((c) => c.category).filter(Boolean))].sort();
      setExistingCategories(cats);
    });
  }, []);

  useEffect(() => {
    regenerateShortId();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.ownerUserId, users]);

  function regenerateShortId() {
    const ownerIndex = users.findIndex((u) => u.id === form.ownerUserId);
    const idx = ownerIndex >= 0 ? ownerIndex : 0;
    setShortId(generateShortId(idx));
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
    if (!form.category.trim()) newErrors.category = "Kategori wajib diisi.";

    if (form.pricingMode === "fixed") {
      const price = parseInt(form.priceIdr, 10);
      if (!form.priceIdr || isNaN(price) || price <= 0) {
        newErrors.priceIdr = "Harga wajib diisi (bilangan bulat positif).";
      }
    } else {
      const listed = parseInt(form.listedPriceIdr, 10);
      const bottom = parseInt(form.bottomPriceIdr, 10);
      if (!form.listedPriceIdr || isNaN(listed) || listed <= 0) newErrors.listedPriceIdr = "Harga tayang wajib diisi.";
      if (!form.bottomPriceIdr || isNaN(bottom) || bottom <= 0) newErrors.bottomPriceIdr = "Harga minimum wajib diisi.";
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
        clientId, shortId,
        ownerUserId: form.ownerUserId,
        stockReceivedByUserId: user!.id,
        eventId: activeEvent?.id,
        title: form.title.trim(),
        category: form.category.trim(),
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

      const created = (await api.cards.create(body as Parameters<typeof api.cards.create>[0])) as { id: string };

      await idb.cards.put({
        id: created.id, clientId, shortId,
        ownerUserId: form.ownerUserId,
        stockReceivedByUserId: user!.id,
        eventId: activeEvent?.id,
        title: form.title.trim(),
        category: form.category.trim(),
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

      if (photoFile) {
        try {
          const thumb = await createThumbnail(photoFile);
          await idb.pendingPhotos.put({
            cardClientId: clientId,
            blob: thumb,
            createdAt: Math.floor(Date.now() / 1000),
          });
          if (navigator.onLine) {
            const formData = new FormData();
            formData.append("photo", thumb, "photo.jpg");
            fetch(`/api/sync/photo/${clientId}`, {
              method: "POST", credentials: "include", body: formData,
            }).then(async (res) => {
              if (res.ok) await idb.pendingPhotos.delete(clientId);
            }).catch(() => null);
          }
        } catch {
          // Non-fatal
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
    <div className="min-h-screen bg-surface bg-dotted-overlay flex flex-col">
      <MobileAppBar
        title="Stock Receive"
        back
        onBack={() => navigate("/dashboard")}
        right={
          <Link
            to="/stock-receive/bulk"
            className="text-xs font-bold text-accent border border-accent border-opacity-40 rounded-lg px-2.5 py-1 hover:bg-accent hover:bg-opacity-10 transition"
          >
            Bulk
          </Link>
        }
      />

      {successMessage && (
        <Toast
          message={successMessage}
          variant="success"
          onDismiss={() => setSuccessMessage(null)}
        />
      )}

      <div className="flex-1 overflow-y-auto max-w-xl mx-auto w-full p-4">
        {submitError && (
          <div className="mb-4 bg-destructive bg-opacity-10 border border-destructive border-opacity-30 text-destructive rounded-2xl px-4 py-3 text-sm font-medium">
            {submitError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3" noValidate>
          {/* Short ID */}
          <div className="bg-card rounded-2xl border border-border p-4 space-y-2">
            <p className="text-[10px] font-extrabold tracking-widest uppercase text-muted-fg">ID Kartu (Short ID)</p>
            <div className="flex items-center gap-3">
              <span className="font-mono text-2xl font-extrabold text-primary tracking-widest flex-1">
                {shortId || "—"}
              </span>
              <button
                type="button"
                onClick={regenerateShortId}
                className="text-sm font-bold text-accent border border-accent border-opacity-40 rounded-xl px-3 py-1.5 hover:bg-accent hover:bg-opacity-10 transition"
              >
                Buat Ulang
              </button>
            </div>
          </div>

          {/* Card info */}
          <div className="bg-card rounded-2xl border border-border p-4 space-y-4">
            <p className="text-[10px] font-extrabold tracking-widest uppercase text-muted-fg">Informasi Kartu</p>

            {/* Owner */}
            <div>
              <FieldLabel required>Pemilik</FieldLabel>
              <select
                value={form.ownerUserId}
                onChange={(e) => setField("ownerUserId", e.target.value)}
                className={inputCls(errors.ownerUserId)}
              >
                <option value="">-- Pilih Pemilik --</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.displayName}</option>)}
              </select>
              {errors.ownerUserId && <p className="text-xs text-destructive mt-1 font-medium">{errors.ownerUserId}</p>}
            </div>

            {/* Title */}
            <div>
              <FieldLabel required>Judul Kartu</FieldLabel>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setField("title", e.target.value)}
                placeholder="Contoh: Charizard VSTAR"
                className={inputCls(errors.title)}
              />
              {errors.title && <p className="text-xs text-destructive mt-1 font-medium">{errors.title}</p>}
            </div>

            {/* Category */}
            <div>
              <FieldLabel required>Kategori</FieldLabel>
              <input
                type="text"
                list="category-suggestions"
                value={form.category}
                onChange={(e) => setField("category", e.target.value)}
                placeholder="Contoh: Pokemon, Magic: The Gathering"
                className={inputCls(errors.category)}
              />
              <datalist id="category-suggestions">
                {existingCategories.map((cat) => (
                  <option key={cat} value={cat} />
                ))}
              </datalist>
              {errors.category && <p className="text-xs text-destructive mt-1 font-medium">{errors.category}</p>}
            </div>

            {/* Set Name + Number */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FieldLabel>Nama Set</FieldLabel>
                <input
                  type="text"
                  value={form.setName}
                  onChange={(e) => setField("setName", e.target.value)}
                  placeholder="Brilliant Stars"
                  className={inputCls()}
                />
              </div>
              <div>
                <FieldLabel>Nomor Set</FieldLabel>
                <input
                  type="text"
                  value={form.setNumber}
                  onChange={(e) => setField("setNumber", e.target.value)}
                  placeholder="018/172"
                  className={inputCls()}
                />
              </div>
            </div>

            {/* Rarity */}
            <div>
              <FieldLabel>Kelangkaan (Rarity)</FieldLabel>
              <input
                type="text"
                value={form.rarity}
                onChange={(e) => setField("rarity", e.target.value)}
                placeholder="Rare Holo, Ultra Rare"
                className={inputCls()}
              />
            </div>

            {/* Language + Condition */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FieldLabel>Bahasa</FieldLabel>
                <select
                  value={form.language}
                  onChange={(e) => setField("language", e.target.value)}
                  className={inputCls()}
                >
                  {LANGUAGE_OPTIONS.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
              <div>
                <FieldLabel>Kondisi</FieldLabel>
                <select
                  value={form.condition}
                  onChange={(e) => setField("condition", e.target.value)}
                  className={inputCls()}
                >
                  {CONDITION_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>

            {/* Edition */}
            <div>
              <FieldLabel>Edisi</FieldLabel>
              <input
                type="text"
                value={form.edition}
                onChange={(e) => setField("edition", e.target.value)}
                placeholder="1st Edition, Shadowless"
                className={inputCls()}
              />
            </div>

            {/* Graded toggle */}
            <label className="flex items-center gap-3 cursor-pointer">
              <div
                className={`w-11 h-6 rounded-full relative transition-colors ${form.isGraded ? "bg-accent" : "bg-muted"}`}
                onClick={() => setField("isGraded", !form.isGraded)}
              >
                <div
                  className={`absolute top-1 w-4 h-4 rounded-full bg-card shadow transition-transform ${form.isGraded ? "translate-x-6" : "translate-x-1"}`}
                />
              </div>
              <span className="text-sm font-bold text-fg">Kartu Graded (PSA/BGS/CGC/dll)</span>
            </label>

            {form.isGraded && (
              <div className="bg-primary bg-opacity-5 rounded-xl border border-primary border-opacity-15 p-3 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <FieldLabel required>Grading Company</FieldLabel>
                    <select
                      value={form.gradingCompany}
                      onChange={(e) => setField("gradingCompany", e.target.value)}
                      className={inputCls(errors.gradingCompany)}
                    >
                      <option value="">-- Pilih --</option>
                      {GRADING_COMPANIES.map((gc) => <option key={gc} value={gc}>{gc}</option>)}
                    </select>
                    {errors.gradingCompany && <p className="text-xs text-destructive mt-1 font-medium">{errors.gradingCompany}</p>}
                  </div>
                  <div>
                    <FieldLabel required>Grade</FieldLabel>
                    <input
                      type="text"
                      value={form.grade}
                      onChange={(e) => setField("grade", e.target.value)}
                      placeholder="10, 9.5, 9"
                      className={inputCls(errors.grade)}
                    />
                    {errors.grade && <p className="text-xs text-destructive mt-1 font-medium">{errors.grade}</p>}
                  </div>
                </div>
                <div>
                  <FieldLabel>Cert Number</FieldLabel>
                  <input
                    type="text"
                    value={form.certNumber}
                    onChange={(e) => setField("certNumber", e.target.value)}
                    placeholder="Nomor sertifikat"
                    className={inputCls()}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Photo */}
          <div className="bg-card rounded-2xl border border-border p-4 space-y-3">
            <p className="text-[10px] font-extrabold tracking-widest uppercase text-muted-fg">Foto Kartu (opsional)</p>
            {photoPreview && (
              <img
                src={photoPreview}
                alt="Preview"
                className="w-32 h-32 object-cover rounded-xl border border-border"
              />
            )}
            <div className="flex items-center gap-3">
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handlePhotoChange}
                className="hidden"
                id="photo-input"
              />
              <label
                htmlFor="photo-input"
                className="text-sm font-bold text-accent border border-accent border-opacity-40 rounded-xl px-4 py-2 cursor-pointer hover:bg-accent hover:bg-opacity-10 transition"
              >
                {photoFile ? "Ganti Foto" : "Ambil Foto"}
              </label>
              {photoFile && (
                <button
                  type="button"
                  onClick={() => {
                    setPhotoFile(null);
                    setPhotoPreview(null);
                    if (photoInputRef.current) photoInputRef.current.value = "";
                  }}
                  className="text-xs text-destructive font-bold hover:opacity-70"
                >
                  Hapus
                </button>
              )}
            </div>
            {photoFile && (
              <p className="text-xs text-muted-fg">
                {!navigator.onLine ? "Thumbnail tersimpan lokal, upload saat online." : "Foto akan diupload setelah simpan."}
              </p>
            )}
          </div>

          {/* Pricing */}
          <div className="bg-card rounded-2xl border border-border p-4 space-y-4">
            <p className="text-[10px] font-extrabold tracking-widest uppercase text-muted-fg">Penetapan Harga</p>

            <div className="flex gap-4">
              {(["fixed", "negotiable"] as PricingMode[]).map((mode) => (
                <label key={mode} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="pricingMode"
                    value={mode}
                    checked={form.pricingMode === mode}
                    onChange={() => setField("pricingMode", mode)}
                    className="accent-primary"
                  />
                  <span className="text-sm font-bold text-fg">
                    {mode === "fixed" ? "Harga Tetap" : "Harga Negosiasi"}
                  </span>
                </label>
              ))}
            </div>

            {form.pricingMode === "fixed" ? (
              <div>
                <FieldLabel required>Harga (IDR)</FieldLabel>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-fg pointer-events-none">Rp</span>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={form.priceIdr}
                    onChange={(e) => setField("priceIdr", e.target.value)}
                    placeholder="0"
                    className={`w-full h-11 border rounded-xl pl-10 pr-3 text-sm font-medium text-fg bg-surface focus:outline-none focus:ring-2 focus:ring-primary transition ${errors.priceIdr ? "border-destructive" : "border-border"}`}
                  />
                </div>
                {errors.priceIdr && <p className="text-xs text-destructive mt-1 font-medium">{errors.priceIdr}</p>}
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <FieldLabel required>Harga Tayang (IDR)</FieldLabel>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-fg pointer-events-none">Rp</span>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={form.listedPriceIdr}
                      onChange={(e) => setField("listedPriceIdr", e.target.value)}
                      placeholder="0"
                      className={`w-full h-11 border rounded-xl pl-10 pr-3 text-sm font-medium text-fg bg-surface focus:outline-none focus:ring-2 focus:ring-primary transition ${errors.listedPriceIdr ? "border-destructive" : "border-border"}`}
                    />
                  </div>
                  {errors.listedPriceIdr && <p className="text-xs text-destructive mt-1 font-medium">{errors.listedPriceIdr}</p>}
                </div>
                <div>
                  <FieldLabel required>Harga Minimum / Bottom (IDR)</FieldLabel>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-fg pointer-events-none">Rp</span>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={form.bottomPriceIdr}
                      onChange={(e) => setField("bottomPriceIdr", e.target.value)}
                      placeholder="0"
                      className={`w-full h-11 border rounded-xl pl-10 pr-3 text-sm font-medium text-fg bg-surface focus:outline-none focus:ring-2 focus:ring-primary transition ${errors.bottomPriceIdr ? "border-destructive" : "border-border"}`}
                    />
                  </div>
                  {errors.bottomPriceIdr && <p className="text-xs text-destructive mt-1 font-medium">{errors.bottomPriceIdr}</p>}
                </div>
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full h-14 bg-primary text-primary-fg font-bold text-[15px] rounded-2xl hover:opacity-90 transition disabled:opacity-50"
          >
            {submitting ? "Menyimpan…" : "Simpan Kartu"}
          </button>
        </form>
      </div>
    </div>
  );
}
