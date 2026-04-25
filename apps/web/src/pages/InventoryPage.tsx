import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { X, Search, Award, Pencil, RotateCcw, Copy, Check } from "lucide-react";
import { idb } from "../lib/db.js";
import { useAuthStore } from "../store/auth.js";
import { MobileAppBar } from "../components/MobileAppBar.js";
import { CardEditForm } from "../components/CardEditForm.js";
import { useTapHoldReveal } from "../hooks/useTapHoldReveal.js";
import { api } from "../lib/api.js";
import type { IdbCard } from "../lib/db.js";

// ── Bottom price tap-and-hold reveal (2 s) ────────────────────────────────

function BottomPriceReveal({ amount }: { amount: number | undefined }) {
  const { revealed, startReveal, endReveal } = useTapHoldReveal(2000);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if ((e.key === " " || e.key === "Enter") && !e.repeat) {
      e.preventDefault();
      startReveal();
    }
  };
  const handleKeyUp = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      endReveal();
    }
  };

  return (
    <button
      type="button"
      onMouseDown={startReveal}
      onMouseUp={endReveal}
      onMouseLeave={endReveal}
      onTouchStart={startReveal}
      onTouchEnd={endReveal}
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
      onBlur={endReveal}
      className="text-base font-bold text-warning px-2 py-0.5 rounded-lg bg-warning bg-opacity-5 select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-warning focus-visible:ring-offset-2"
      aria-label="Tekan dan tahan 2 detik untuk melihat harga minimum"
      aria-pressed={revealed}
    >
      {revealed ? (
        <span>Rp {(amount ?? 0).toLocaleString("id-ID")}</span>
      ) : (
        <span className="tracking-widest">••••••</span>
      )}
    </button>
  );
}

// ── Status badge ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: IdbCard["status"] }) {
  switch (status) {
    case "available":
      return (
        <span className="inline-block text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-success bg-opacity-15 text-success">
          Tersedia
        </span>
      );
    case "held":
      return (
        <span className="inline-block text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-warning bg-opacity-15 text-warning">
          Ditahan
        </span>
      );
    case "sold":
      return (
        <span className="inline-block text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-muted text-muted-fg">
          Terjual
        </span>
      );
    case "returned":
      return (
        <span className="inline-block text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-primary bg-opacity-15 text-primary">
          Dikembalikan
        </span>
      );
    default:
      return null;
  }
}

// ── Card detail panel ──────────────────────────────────────────────────────

function CardDetail({
  card,
  ownerName,
  onClose,
}: {
  card: IdbCard;
  ownerName: string;
  onClose: () => void;
}) {
  const user = useAuthStore((s) => s.user);
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(card.shortId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/50">
      <div className="w-full max-w-md bg-card rounded-t-3xl shadow-xl p-5 space-y-4 max-h-[90vh] overflow-y-auto">
        {/* Handle */}
        <div className="flex justify-center -mb-1">
          <div className="w-9 h-1 rounded-full bg-border" />
        </div>

        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="font-bold text-fg text-lg leading-tight">{card.title}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <p className="text-xs text-muted-fg font-mono">{card.shortId}</p>
              <button
                onClick={handleCopy}
                className="w-5 h-5 flex items-center justify-center rounded text-muted-fg hover:text-fg hover:bg-muted transition shrink-0"
                aria-label="Salin kode kartu"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
              {copied && (
                <span className="text-[10px] font-bold text-success">Tersalin!</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
            {user?.role === "admin" && !editing && (
              <button
                onClick={() => setEditing(true)}
                className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-muted-fg hover:bg-border transition shrink-0"
                aria-label="Edit kartu"
              >
                <Pencil className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-muted-fg hover:bg-border transition shrink-0"
              aria-label="Tutup"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {editing ? (
          <CardEditForm
            card={card}
            onSaved={() => { setEditing(false); onClose(); }}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <>
            <StatusBadge status={card.status} />

        {/* Photo */}
        {card.photoPath && (
          <div className="rounded-2xl overflow-hidden border border-border bg-surface">
            <img
              src={card.photoPath.startsWith("/") ? card.photoPath : `/storage/photos/${card.photoPath}`}
              alt={card.title}
              className="w-full h-48 object-cover"
              loading="lazy"
            />
          </div>
        )}

        {/* Details grid */}
        <div className="space-y-2">
          <DetailRow label="Pemilik" value={ownerName} />
          {card.setName && <DetailRow label="Set" value={card.setName} />}
          {card.setNumber && <DetailRow label="Nomor Set" value={`#${card.setNumber}`} />}
          {card.rarity && <DetailRow label="Kelangkaan" value={card.rarity} />}
          <DetailRow label="Bahasa" value={card.language || "—"} />
          <DetailRow label="Kondisi" value={card.condition} />
          {card.edition && <DetailRow label="Edisi" value={card.edition} />}
          <DetailRow
            label="Mode Harga"
            value={card.pricingMode === "fixed" ? "Harga Tetap" : "Harga Negosiasi"}
          />
        </div>

        {/* Graded card info */}
        {card.isGraded && (
          <div className="bg-warning bg-opacity-5 border border-warning border-opacity-20 rounded-xl p-3 space-y-2">
            <div className="flex items-center gap-2">
              <Award className="w-4 h-4 text-warning" />
              <span className="text-xs font-extrabold tracking-widest uppercase text-warning">Kartu Graded</span>
            </div>
            <div className="space-y-1">
              <DetailRow label="Grading" value={card.gradingCompany ?? "—"} />
              <DetailRow label="Grade" value={card.grade ?? "—"} />
              {card.certNumber && <DetailRow label="Sertifikat" value={card.certNumber} />}
            </div>
          </div>
        )}

        {/* Pricing */}
        <div className="border-t border-border pt-3 space-y-2">
          {card.pricingMode === "fixed" ? (
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-fg">Harga</span>
              <span className="text-base font-extrabold text-fg">
                {card.priceIdr != null ? `Rp ${card.priceIdr.toLocaleString("id-ID")}` : "—"}
              </span>
            </div>
          ) : (
            <>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-fg">Harga Tayang</span>
                <span className="text-base font-extrabold text-fg">
                  {card.listedPriceIdr != null ? `Rp ${card.listedPriceIdr.toLocaleString("id-ID")}` : "—"}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-fg">Harga Minimum</span>
                <BottomPriceReveal amount={card.bottomPriceIdr} />
              </div>
            </>
          )}
          {card.oversold && (
            <div className="bg-destructive bg-opacity-10 border border-destructive border-opacity-30 text-destructive rounded-xl px-3 py-2 text-xs font-bold">
              Kartu ini ditandai OVERSOLD — perlu tindakan admin.
            </div>
          )}
        </div>

        {user?.role === "admin" && card.status === "available" && (
          <ReturnCardButton card={card} onReturned={onClose} />
        )}

            <button
              onClick={onClose}
              className="w-full h-12 border border-border text-fg font-bold rounded-2xl hover:bg-muted text-sm transition"
            >
              Tutup
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center gap-2 py-1 border-b border-border last:border-0">
      <span className="text-sm text-muted-fg shrink-0">{label}</span>
      <span className="text-sm font-semibold text-fg text-right">{value}</span>
    </div>
  );
}

// ── Return card button ─────────────────────────────────────────────────────

function ReturnCardButton({ card, onReturned }: { card: IdbCard; onReturned: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleReturn() {
    setBusy(true);
    try {
      await api.cards.update(card.id, {
        status: "returned",
        version: card.version,
      });
      await idb.cards.update(card.id, { status: "returned" });
      onReturned();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Gagal mengembalikan kartu.");
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  if (confirming) {
    return (
      <div className="space-y-2">
        <p className="text-xs text-muted-fg text-center">
          Yakin ingin mengembalikan kartu ini ke pemilik?
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => setConfirming(false)}
            className="flex-1 h-10 border border-border text-fg font-bold rounded-xl hover:bg-muted text-xs transition"
          >
            Batal
          </button>
          <button
            onClick={handleReturn}
            disabled={busy}
            className="flex-1 h-10 bg-primary text-primary-fg font-bold rounded-xl hover:opacity-90 text-xs transition disabled:opacity-50"
          >
            {busy ? "Menyimpan…" : "Kembalikan"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="w-full h-11 border border-primary border-opacity-40 text-primary font-bold rounded-2xl hover:bg-primary hover:bg-opacity-5 text-sm transition flex items-center justify-center gap-2"
    >
      <RotateCcw className="w-4 h-4" />
      Kembalikan ke Pemilik
    </button>
  );
}

// ── Filter helpers ─────────────────────────────────────────────────────────

type StatusFilter = "all" | IdbCard["status"];
type PricingFilter = "all" | "fixed" | "negotiable";
type SortBy = "none" | "price_asc" | "price_desc" | "title_asc" | "shortId_asc";

// ── Main page ──────────────────────────────────────────────────────────────

export function InventoryPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  const [allCards, setAllCards] = useState<IdbCard[]>([]);
  const [userMap, setUserMap] = useState<Record<string, string>>({});
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [pricingFilter, setPricingFilter] = useState<PricingFilter>("all");
  const [sortBy, setSortBy] = useState<SortBy>("none");
  const [selectedCard, setSelectedCard] = useState<IdbCard | null>(null);
  const [loading, setLoading] = useState(true);
  const [extraPages, setExtraPages] = useState(0);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [cards, users] = await Promise.all([
        idb.cards.toArray(),
        idb.users.toArray(),
      ]);
      setAllCards(cards);
      const uMap: Record<string, string> = {};
      for (const u of users) uMap[u.id] = u.displayName;
      setUserMap(uMap);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const allUsers = useMemo(
    () => Object.entries(userMap).map(([id, name]) => ({ id, name })),
    [userMap]
  );

  // Reset pagination whenever filters change — tracked as a page count so the
  // reset happens in the same render pass that sees new filter values, avoiding
  // the extra render cycle a useEffect reset would cause.
  const [prevSearch, setPrevSearch] = useState(searchText);
  const [prevStatus, setPrevStatus] = useState(statusFilter);
  const [prevOwner, setPrevOwner] = useState(ownerFilter);
  const [prevPricing, setPrevPricing] = useState(pricingFilter);
  const [prevSort, setPrevSort] = useState(sortBy);
  let currentExtraPages = extraPages;
  if (
    searchText !== prevSearch ||
    statusFilter !== prevStatus ||
    ownerFilter !== prevOwner ||
    pricingFilter !== prevPricing ||
    sortBy !== prevSort
  ) {
    currentExtraPages = 0;
    setPrevSearch(searchText);
    setPrevStatus(statusFilter);
    setPrevOwner(ownerFilter);
    setPrevPricing(pricingFilter);
    setPrevSort(sortBy);
    setExtraPages(0);
  }

  const visibleCount = 50 + currentExtraPages * 50;

  const filteredCards = useMemo(() => {
    const lc = searchText.toLowerCase();
    const filtered = allCards.filter((card) => {
      const matchesSearch =
        !searchText ||
        card.title.toLowerCase().includes(lc) ||
        card.shortId.toLowerCase().includes(lc);
      const matchesStatus = statusFilter === "all" || card.status === statusFilter;
      const matchesOwner = ownerFilter === "all" || card.ownerUserId === ownerFilter;
      const matchesPricing = pricingFilter === "all" || card.pricingMode === pricingFilter;
      return matchesSearch && matchesStatus && matchesOwner && matchesPricing;
    });

    if (sortBy === "none") return filtered;

    return [...filtered].sort((a, b) => {
      if (sortBy === "title_asc") return a.title.localeCompare(b.title, "id");
      if (sortBy === "shortId_asc") return a.shortId.localeCompare(b.shortId);
      const priceA = (a.pricingMode === "fixed" ? a.priceIdr : a.listedPriceIdr) ?? 0;
      const priceB = (b.pricingMode === "fixed" ? b.priceIdr : b.listedPriceIdr) ?? 0;
      return sortBy === "price_asc" ? priceA - priceB : priceB - priceA;
    });
  }, [allCards, searchText, statusFilter, ownerFilter, pricingFilter, sortBy]);

  const visibleCards = filteredCards.slice(0, visibleCount);
  const hasMore = filteredCards.length > visibleCount;

  const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
    { value: "all", label: "Semua" },
    { value: "available", label: "Tersedia" },
    { value: "held", label: "Ditahan" },
    { value: "sold", label: "Terjual" },
    { value: "returned", label: "Dikembalikan" },
  ];

  return (
    <div className="min-h-screen bg-surface bg-dotted-overlay flex flex-col">
      <MobileAppBar title="Inventaris" back onBack={() => navigate("/dashboard")} />

      <div className="flex-1 overflow-y-auto max-w-xl mx-auto w-full p-3 space-y-3">
        {/* Search + Filter */}
        <div className="bg-card rounded-2xl border border-border p-3 space-y-2.5">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-fg w-4 h-4" />
            <input
              type="search"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Cari kartu (judul atau ID)…"
              className="w-full h-10 border border-border rounded-xl pl-9 pr-3 text-sm text-fg bg-surface focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div className="flex gap-2">
            <select
              value={ownerFilter}
              onChange={(e) => setOwnerFilter(e.target.value)}
              className="flex-1 h-9 border border-border rounded-xl px-2 text-xs text-fg bg-surface focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="all">Semua pemilik</option>
              {allUsers.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortBy)}
              className="flex-1 h-9 border border-border rounded-xl px-2 text-xs text-fg bg-surface focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="none">Urutan default</option>
              <option value="price_asc">Harga: Rendah ke Tinggi</option>
              <option value="price_desc">Harga: Tinggi ke Rendah</option>
              <option value="title_asc">Nama A–Z</option>
              <option value="shortId_asc">Kode A–Z</option>
            </select>
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setStatusFilter(f.value)}
                className={`px-3 py-1 rounded-full text-xs font-bold border transition ${
                  statusFilter === f.value
                    ? "bg-primary border-primary text-primary-fg"
                    : "bg-card border-border text-muted-fg hover:bg-muted"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="flex gap-1.5">
            {(
              [
                { value: "all", label: "Semua harga" },
                { value: "fixed", label: "Harga fix" },
                { value: "negotiable", label: "Harga nego" },
              ] as { value: PricingFilter; label: string }[]
            ).map((f) => (
              <button
                key={f.value}
                onClick={() => setPricingFilter(f.value)}
                className={`px-3 py-1 rounded-full text-xs font-bold border transition ${
                  pricingFilter === f.value
                    ? "bg-warning border-warning text-white"
                    : "bg-card border-border text-muted-fg hover:bg-muted"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Count */}
        <p className="text-[10px] font-extrabold tracking-widest uppercase text-muted-fg px-1">
          {hasMore
            ? `Menampilkan ${visibleCount} dari ${filteredCards.length} kartu`
            : `${filteredCards.length} kartu ditemukan`}
        </p>

        {/* Card list */}
        {loading ? (
          <p className="text-sm text-muted-fg text-center py-8">Memuat…</p>
        ) : filteredCards.length === 0 ? (
          <p className="text-sm text-muted-fg text-center py-8 italic">
            Tidak ada kartu yang cocok.
          </p>
        ) : (
          <ul className="space-y-2">
            {visibleCards.map((card) => {
              const displayPrice =
                card.pricingMode === "fixed" ? card.priceIdr : card.listedPriceIdr;
              return (
                <li key={card.id}>
                  <button
                    onClick={() => setSelectedCard(card)}
                    className={`w-full bg-card rounded-2xl border border-border px-4 py-3 flex flex-col gap-1 hover:bg-muted transition text-left active:scale-[0.98] ${card.status === "sold" ? "opacity-50" : ""}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="font-mono text-xs font-extrabold bg-primary bg-opacity-10 text-primary px-2 py-0.5 rounded-lg shrink-0">
                          {card.shortId}
                        </span>
                        {card.pricingMode === "negotiable" && (
                          <span className="text-[10px] font-extrabold uppercase tracking-widest bg-warning bg-opacity-15 text-warning px-2 py-0.5 rounded-full shrink-0">
                            Nego
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <StatusBadge status={card.status} />
                        <span className="text-xs font-bold text-muted-fg">
                          {displayPrice != null ? `Rp ${displayPrice.toLocaleString("id-ID")}` : "—"}
                        </span>
                      </div>
                    </div>
                    <p className="text-sm font-bold text-fg truncate">{card.title}</p>
                    <p className="text-xs text-muted-fg truncate">
                      {card.condition}
                      {card.setName ? ` · ${card.setName}` : ""}
                      {card.language ? ` · ${card.language}` : ""}
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {!loading && hasMore && (
          <button
            onClick={() => setExtraPages((n) => n + 1)}
            className="w-full h-11 border border-border rounded-2xl text-sm font-bold text-muted-fg hover:bg-muted transition"
          >
            Muat {Math.min(50, filteredCards.length - visibleCount)} kartu lagi
          </button>
        )}
      </div>

      {selectedCard && (
        <CardDetail
          card={selectedCard}
          ownerName={userMap[selectedCard.ownerUserId] ?? selectedCard.ownerUserId}
          onClose={() => setSelectedCard(null)}
        />
      )}
    </div>
  );
}
