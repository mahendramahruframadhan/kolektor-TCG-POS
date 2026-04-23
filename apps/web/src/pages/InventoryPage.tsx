import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { idb } from "../lib/db.js";
import { useAuthStore } from "../store/auth.js";
import { MaskedAmount } from "../components/MaskedAmount.js";
import type { IdbCard, IdbUser } from "../lib/db.js";

// ── Status badge ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: IdbCard["status"] }) {
  switch (status) {
    case "available":
      return (
        <span className="inline-block text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">
          Tersedia
        </span>
      );
    case "held":
      return (
        <span className="inline-block text-xs font-semibold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">
          Ditahan
        </span>
      );
    case "sold":
      return (
        <span className="inline-block text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-200 text-gray-600">
          Terjual
        </span>
      );
    case "returned":
      return (
        <span className="inline-block text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-600">
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
  const displayPrice =
    card.pricingMode === "fixed"
      ? card.priceIdr
      : card.listedPriceIdr;

  return (
    <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/50">
      <div className="w-full max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-xl p-5 space-y-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="font-bold text-gray-800 text-lg leading-tight">
              {card.title}
            </p>
            <p className="text-xs text-gray-500 mt-0.5 font-mono">{card.shortId}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition shrink-0"
            aria-label="Tutup"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="w-5 h-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <StatusBadge status={card.status} />

        {/* Details grid */}
        <div className="space-y-2 text-sm">
          <DetailRow label="Pemilik" value={ownerName} />
          {card.setName && <DetailRow label="Set" value={card.setName} />}
          {card.setNumber && (
            <DetailRow label="Nomor Set" value={`#${card.setNumber}`} />
          )}
          {card.rarity && <DetailRow label="Kelangkaan" value={card.rarity} />}
          <DetailRow label="Bahasa" value={card.language || "—"} />
          <DetailRow label="Kondisi" value={card.condition} />
          {card.edition && <DetailRow label="Edisi" value={card.edition} />}
          <DetailRow
            label="Mode Harga"
            value={
              card.pricingMode === "fixed" ? "Harga Tetap" : "Harga Negosiasi"
            }
          />
        </div>

        {/* Pricing */}
        <div className="border-t pt-3 space-y-2">
          {card.pricingMode === "fixed" ? (
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Harga</span>
              <MaskedAmount
                amount={card.priceIdr}
                className="text-base font-bold text-gray-800"
              />
            </div>
          ) : (
            <>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Harga Tayang</span>
                <MaskedAmount
                  amount={card.listedPriceIdr}
                  className="text-base font-bold text-gray-800"
                />
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Harga Minimum</span>
                <MaskedAmount
                  amount={card.bottomPriceIdr}
                  className="text-base font-semibold text-orange-700"
                />
              </div>
            </>
          )}
          {card.oversold && (
            <p className="text-xs bg-red-50 text-red-700 rounded-lg px-3 py-2 font-semibold">
              Kartu ini ditandai OVERSOLD — perlu tindakan admin.
            </p>
          )}
        </div>

        <button
          onClick={onClose}
          className="w-full border border-gray-300 text-gray-700 font-medium py-2 rounded-xl hover:bg-gray-50 text-sm transition"
        >
          Tutup
        </button>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center gap-2">
      <span className="text-gray-500 shrink-0">{label}</span>
      <span className="text-gray-800 text-right">{value}</span>
    </div>
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
      const [cards, users] = await Promise.all([
        idb.cards.toArray(),
        idb.users.toArray(),
      ]);
      setAllCards(cards);
      const map: Record<string, string> = {};
      for (const u of users) {
        map[u.id] = u.displayName;
      }
      setUserMap(map);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Filtered list
  const filteredCards = allCards.filter((card) => {
    const matchesSearch =
      !searchText ||
      card.title.toLowerCase().includes(searchText.toLowerCase()) ||
      card.shortId.toLowerCase().includes(searchText.toLowerCase());
    const matchesStatus =
      statusFilter === "all" || card.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
    { value: "all", label: "Semua" },
    { value: "available", label: "Tersedia" },
    { value: "held", label: "Ditahan" },
    { value: "sold", label: "Terjual" },
  ];

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
        <h1 className="font-bold text-base">Inventaris</h1>
        <span className="text-sm opacity-70">{user?.displayName}</span>
      </header>

      <div className="flex-1 overflow-y-auto max-w-xl mx-auto w-full p-3 space-y-3">
        {/* Search + Filter */}
        <div className="bg-white rounded-xl shadow-sm p-3 space-y-2">
          <input
            type="search"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Cari kartu (judul atau ID)…"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <div className="flex gap-1.5 flex-wrap">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setStatusFilter(f.value)}
                className={`px-3 py-1 rounded-full text-xs font-semibold border transition ${
                  statusFilter === f.value
                    ? "bg-blue-600 border-blue-600 text-white"
                    : "bg-white border-gray-300 text-gray-600 hover:bg-gray-50"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Count */}
        <p className="text-xs text-gray-400 px-1">
          {filteredCards.length} kartu ditemukan
        </p>

        {/* Card list */}
        {loading ? (
          <p className="text-sm text-gray-400 text-center py-8">Memuat…</p>
        ) : filteredCards.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8 italic">
            Tidak ada kartu yang cocok.
          </p>
        ) : (
          <ul className="space-y-2">
            {filteredCards.map((card) => {
              const displayPrice =
                card.pricingMode === "fixed"
                  ? card.priceIdr
                  : card.listedPriceIdr;
              return (
                <li key={card.id}>
                  <button
                    onClick={() => setSelectedCard(card)}
                    className="w-full bg-white rounded-xl shadow-sm px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition text-left"
                  >
                    {/* Short ID badge */}
                    <span className="font-mono text-xs font-bold bg-blue-50 text-blue-700 px-2 py-1 rounded-lg shrink-0">
                      {card.shortId}
                    </span>
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">
                        {card.title}
                      </p>
                      <p className="text-xs text-gray-500 truncate">
                        {card.condition}
                        {card.setName ? ` · ${card.setName}` : ""}
                        {card.language ? ` · ${card.language}` : ""}
                      </p>
                    </div>
                    {/* Status + price */}
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <StatusBadge status={card.status} />
                      <MaskedAmount
                        amount={displayPrice}
                        className="text-xs font-semibold text-gray-700"
                      />
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Detail panel */}
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
