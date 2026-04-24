import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { X, Search, Camera, Award, Pencil, RotateCcw } from "lucide-react";
import { idb } from "../lib/db.js";
import { useAuthStore } from "../store/auth.js";
import { MaskedAmount } from "../components/MaskedAmount.js";
import { MobileAppBar } from "../components/MobileAppBar.js";
import { CardEditForm } from "../components/CardEditForm.js";
import { api } from "../lib/api.js";
import type { IdbCard } from "../lib/db.js";

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
            <p className="text-xs text-muted-fg font-mono mt-0.5">{card.shortId}</p>
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
              <MaskedAmount amount={card.priceIdr} className="text-base font-extrabold text-fg" />
            </div>
          ) : (
            <>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-fg">Harga Tayang</span>
                <MaskedAmount amount={card.listedPriceIdr} className="text-base font-extrabold text-fg" />
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-fg">Harga Minimum</span>
                <MaskedAmount amount={card.bottomPriceIdr} className="text-base font-bold text-warning" />
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

// ── Main page ──────────────────────────────────────────────────────────────

export function InventoryPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  const [allCards, setAllCards] = useState<IdbCard[]>([]);
  const [userMap, setUserMap] = useState<Record<string, string>>({});
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selectedCard, setSelectedCard] = useState<IdbCard | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [cards, users] = await Promise.all([idb.cards.toArray(), idb.users.toArray()]);
      setAllCards(cards);
      const map: Record<string, string> = {};
      for (const u of users) map[u.id] = u.displayName;
      setUserMap(map);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const filteredCards = allCards.filter((card) => {
    const matchesSearch =
      !searchText ||
      card.title.toLowerCase().includes(searchText.toLowerCase()) ||
      card.shortId.toLowerCase().includes(searchText.toLowerCase());
    const matchesStatus = statusFilter === "all" || card.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

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
        </div>

        {/* Count */}
        <p className="text-[10px] font-extrabold tracking-widest uppercase text-muted-fg px-1">
          {filteredCards.length} kartu ditemukan
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
            {filteredCards.map((card) => {
              const displayPrice =
                card.pricingMode === "fixed" ? card.priceIdr : card.listedPriceIdr;
              return (
                <li key={card.id}>
                  <button
                    onClick={() => setSelectedCard(card)}
                    className="w-full bg-card rounded-2xl border border-border px-4 py-3 flex items-center gap-3 hover:bg-muted transition text-left active:scale-[0.98]"
                  >
                    {/* Short ID badge */}
                    <span className="font-mono text-xs font-extrabold bg-primary bg-opacity-10 text-primary px-2 py-1 rounded-lg shrink-0">
                      {card.shortId}
                    </span>
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-fg truncate">{card.title}</p>
                      <p className="text-xs text-muted-fg truncate">
                        {card.condition}
                        {card.setName ? ` · ${card.setName}` : ""}
                        {card.language ? ` · ${card.language}` : ""}
                      </p>
                    </div>
                    {/* Status + price */}
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <StatusBadge status={card.status} />
                      <MaskedAmount amount={displayPrice} className="text-xs font-bold text-muted-fg" />
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
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
