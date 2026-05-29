import React, { useState, useEffect } from "react";
import { Check, X } from "lucide-react";
import { api } from "../lib/api.js";
import { idb } from "../lib/db.js";
import type { IdbCard } from "../lib/db.js";
import { CONDITIONS, LANGUAGES, GRADING_COMPANIES } from "../lib/constants.js";

interface CardEditFormProps {
  card: IdbCard;
  onSaved: () => void;
  onCancel: () => void;
}

export function CardEditForm({ card, onSaved, onCancel }: CardEditFormProps) {
  const [title, setTitle] = useState(card.title);
  const [category, setCategory] = useState(card.category ?? "");
  const [existingCategories, setExistingCategories] = useState<string[]>([]);
  const [setName, setSetName] = useState(card.setName ?? "");

  useEffect(() => {
    idb.cards.toArray().then((cards) => {
      const cats = [...new Set(cards.map((c) => c.category).filter(Boolean))].sort();
      setExistingCategories(cats);
    });
  }, []);
  const [setNumber, setSetNumber] = useState(card.setNumber ?? "");
  const [rarity, setRarity] = useState(card.rarity ?? "");
  const [language, setLanguage] = useState(card.language);
  const [edition, setEdition] = useState(card.edition ?? "");
  const [condition, setCondition] = useState(card.condition);
  const [isGraded, setIsGraded] = useState(card.isGraded);
  const [gradingCompany, setGradingCompany] = useState(card.gradingCompany ?? "PSA");
  const [grade, setGrade] = useState(card.grade ?? "");
  const [certNumber, setCertNumber] = useState(card.certNumber ?? "");
  const [pricingMode, setPricingMode] = useState(card.pricingMode);
  const [priceIdr, setPriceIdr] = useState(card.priceIdr?.toString() ?? "");
  const [listedPriceIdr, setListedPriceIdr] = useState(card.listedPriceIdr?.toString() ?? "");
  const [bottomPriceIdr, setBottomPriceIdr] = useState(card.bottomPriceIdr?.toString() ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const body: Record<string, unknown> = {
      title,
      category,
      setName,
      setNumber,
      rarity,
      language,
      edition,
      condition,
      isGraded,
      pricingMode,
      version: card.version,
    };

    if (isGraded) {
      body.gradingCompany = gradingCompany;
      body.grade = grade || undefined;
      body.certNumber = certNumber || undefined;
    }

    if (pricingMode === "fixed") {
      const p = parseInt(priceIdr, 10);
      if (isNaN(p) || p <= 0) {
        setError("Harga harus lebih dari 0.");
        return;
      }
      body.priceIdr = p;
    } else {
      const l = parseInt(listedPriceIdr, 10);
      const b = parseInt(bottomPriceIdr, 10);
      if (isNaN(l) || l <= 0 || isNaN(b) || b <= 0) {
        setError("Harga tayang dan minimum harus lebih dari 0.");
        return;
      }
      body.listedPriceIdr = l;
      body.bottomPriceIdr = b;
    }

    setSaving(true);
    try {
      const updated = await api.cards.update(card.id, body as Parameters<typeof api.cards.update>[1]) as IdbCard;
      await idb.cards.update(card.id, { ...updated });
      onSaved();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Gagal menyimpan perubahan.";
      if (msg.includes("409") || msg.includes("conflict")) {
        setError("Kartu sudah diubah oleh pengguna lain. Muat ulang halaman.");
      } else {
        setError(msg);
      }
    } finally {
      setSaving(false);
    }
  }

  const inputCls =
    "w-full h-10 border border-border rounded-xl px-3 text-sm text-fg bg-surface focus:outline-none focus:ring-2 focus:ring-primary";
  const labelCls = "block text-[10px] font-extrabold tracking-widest uppercase text-muted-fg mb-1";

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {error && (
        <div className="bg-destructive bg-opacity-10 border border-destructive border-opacity-30 text-destructive rounded-xl px-3 py-2 text-xs font-medium">
          {error}
        </div>
      )}

      <div>
        <label className={labelCls}>Judul Kartu</label>
        <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} required />
      </div>

      <div>
        <label className={labelCls}>Kategori</label>
        <input
          className={inputCls}
          list="edit-category-suggestions"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="Contoh: Pokemon"
          required
        />
        <datalist id="edit-category-suggestions">
          {existingCategories.map((cat) => (
            <option key={cat} value={cat} />
          ))}
        </datalist>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelCls}>Set</label>
          <input className={inputCls} value={setName} onChange={(e) => setSetName(e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Nomor Set</label>
          <input className={inputCls} value={setNumber} onChange={(e) => setSetNumber(e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelCls}>Kelangkaan</label>
          <input className={inputCls} value={rarity} onChange={(e) => setRarity(e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Bahasa</label>
          <select className={inputCls} value={language} onChange={(e) => setLanguage(e.target.value as typeof LANGUAGES[number])}>
            {LANGUAGES.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelCls}>Edisi</label>
          <input className={inputCls} value={edition} onChange={(e) => setEdition(e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Kondisi</label>
          <select className={inputCls} value={condition} onChange={(e) => setCondition(e.target.value as typeof CONDITIONS[number])}>
            {CONDITIONS.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex items-center gap-2 py-1">
        <input
          id="isGraded"
          type="checkbox"
          checked={isGraded}
          onChange={(e) => setIsGraded(e.target.checked)}
          className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
        />
        <label htmlFor="isGraded" className="text-sm font-semibold text-fg">Kartu Graded</label>
      </div>

      {isGraded && (
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className={labelCls}>Grading</label>
            <select className={inputCls} value={gradingCompany} onChange={(e) => setGradingCompany(e.target.value as typeof GRADING_COMPANIES[number])}>
              {GRADING_COMPANIES.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Grade</label>
            <input className={inputCls} value={grade} onChange={(e) => setGrade(e.target.value)} placeholder="9.5" />
          </div>
          <div>
            <label className={labelCls}>Sertifikat</label>
            <input className={inputCls} value={certNumber} onChange={(e) => setCertNumber(e.target.value)} />
          </div>
        </div>
      )}

      <div>
        <label className={labelCls}>Mode Harga</label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setPricingMode("fixed")}
            className={`flex-1 h-10 rounded-xl border text-sm font-bold transition ${pricingMode === "fixed" ? "bg-primary border-primary text-primary-fg" : "bg-card border-border text-fg hover:bg-muted"}`}
          >
            Harga Tetap
          </button>
          <button
            type="button"
            onClick={() => setPricingMode("negotiable")}
            className={`flex-1 h-10 rounded-xl border text-sm font-bold transition ${pricingMode === "negotiable" ? "bg-primary border-primary text-primary-fg" : "bg-card border-border text-fg hover:bg-muted"}`}
          >
            Harga Negosiasi
          </button>
        </div>
      </div>

      {pricingMode === "fixed" ? (
        <div>
          <label className={labelCls}>Harga (IDR)</label>
          <input className={inputCls} type="number" min={1} value={priceIdr} onChange={(e) => setPriceIdr(e.target.value)} />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelCls}>Harga Tayang (IDR)</label>
            <input className={inputCls} type="number" min={1} value={listedPriceIdr} onChange={(e) => setListedPriceIdr(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Harga Minimum (IDR)</label>
            <input className={inputCls} type="number" min={1} value={bottomPriceIdr} onChange={(e) => setBottomPriceIdr(e.target.value)} />
          </div>
        </div>
      )}

      <div className="flex gap-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 h-11 border border-border text-fg font-bold rounded-2xl hover:bg-muted transition flex items-center justify-center gap-2"
        >
          <X className="w-4 h-4" />
          Batal
        </button>
        <button
          type="submit"
          disabled={saving}
          className="flex-1 h-11 bg-primary text-primary-fg font-bold rounded-2xl hover:opacity-90 transition disabled:opacity-50 flex items-center justify-center gap-2"
        >
          <Check className="w-4 h-4" />
          {saving ? "Menyimpan…" : "Simpan"}
        </button>
      </div>
    </form>
  );
}
