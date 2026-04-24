import React, { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Printer, CheckSquare, Square, Tag } from "lucide-react";
import QRCode from "qrcode";
import { idb } from "../lib/db.js";
import { MobileAppBar } from "../components/MobileAppBar.js";
import type { IdbCard } from "../lib/db.js";

// ── QR data URL cache ─────────────────────────────────────────────────────

async function generateQR(text: string): Promise<string> {
  return QRCode.toDataURL(text, {
    errorCorrectionLevel: "H",
    width: 200,
    margin: 1,
    color: { dark: "#000000", light: "#ffffff" },
  });
}

// ── Single label (screen preview + print) ─────────────────────────────────

function CardLabel({
  card,
  ownerName,
}: {
  card: IdbCard;
  ownerName: string;
}) {
  const [qrUrl, setQrUrl] = useState<string | null>(null);

  useEffect(() => {
    generateQR(card.shortId).then(setQrUrl).catch(() => null);
  }, [card.shortId]);

  return (
    <div
      className="label-item flex items-center gap-2 bg-white border border-gray-300 rounded overflow-hidden"
      style={{ width: "50mm", height: "25mm", padding: "2mm", boxSizing: "border-box" }}
    >
      {/* QR code */}
      <div className="shrink-0" style={{ width: "20mm", height: "20mm" }}>
        {qrUrl ? (
          <img
            src={qrUrl}
            alt={card.shortId}
            style={{ width: "20mm", height: "20mm", display: "block" }}
          />
        ) : (
          <div style={{ width: "20mm", height: "20mm", background: "#eee" }} />
        )}
      </div>

      {/* Text */}
      <div className="flex flex-col justify-center min-w-0 flex-1" style={{ fontSize: "5.5pt", lineHeight: 1.3 }}>
        <span
          style={{ fontFamily: "monospace", fontWeight: 900, fontSize: "8pt", letterSpacing: "0.05em" }}
          className="text-black"
        >
          {card.shortId}
        </span>
        <span
          style={{ fontWeight: 600, fontSize: "5.5pt", wordBreak: "break-word", lineHeight: 1.2 }}
          className="text-gray-800"
        >
          {card.title.length > 40 ? card.title.slice(0, 38) + "…" : card.title}
        </span>
        <span style={{ fontSize: "4.5pt", color: "#666", marginTop: "0.5mm" }}>
          {ownerName} · {card.condition}
        </span>
      </div>
    </div>
  );
}

// ── Print styles injected into <head> ─────────────────────────────────────

const PRINT_STYLE = `
@media print {
  @page {
    size: A4 landscape;
    margin: 10mm;
  }
  body * { visibility: hidden !important; }
  #label-print-area, #label-print-area * { visibility: visible !important; }
  #label-print-area {
    position: fixed !important;
    top: 0 !important;
    left: 0 !important;
    width: 100% !important;
    display: flex !important;
    flex-wrap: wrap !important;
    gap: 3mm !important;
    padding: 0 !important;
    background: white !important;
  }
  .label-item {
    width: 50mm !important;
    height: 25mm !important;
    page-break-inside: avoid !important;
    border: 0.3mm solid #ccc !important;
    print-color-adjust: exact !important;
    -webkit-print-color-adjust: exact !important;
  }
}
`;

// ── Main page ──────────────────────────────────────────────────────────────

export function QRLabelPage() {
  const navigate = useNavigate();
  const styleRef = useRef<HTMLStyleElement | null>(null);

  const [allCards, setAllCards] = useState<IdbCard[]>([]);
  const [userMap, setUserMap] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const el = document.createElement("style");
    el.textContent = PRINT_STYLE;
    document.head.appendChild(el);
    styleRef.current = el;
    return () => { el.remove(); };
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [cards, users] = await Promise.all([idb.cards.toArray(), idb.users.toArray()]);
      const available = cards.filter((c) => c.status === "available");
      setAllCards(available);
      const map: Record<string, string> = {};
      for (const u of users) map[u.id] = u.displayName;
      setUserMap(map);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const filtered = allCards.filter((c) => {
    if (!search) return true;
    return (
      c.title.toLowerCase().includes(search.toLowerCase()) ||
      c.shortId.toLowerCase().includes(search.toLowerCase())
    );
  });

  function toggleCard(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === filtered.length && filtered.length > 0) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((c) => c.id)));
    }
  }

  function handlePrint() {
    window.print();
  }

  const selectedCards = allCards.filter((c) => selected.has(c.id));
  const allSelected = filtered.length > 0 && selected.size === filtered.length;

  return (
    <div className="min-h-screen bg-surface bg-dotted-overlay flex flex-col">
      <MobileAppBar
        title="Cetak Label QR"
        back
        onBack={() => navigate(-1)}
      />

      <div className="flex-1 overflow-y-auto max-w-xl mx-auto w-full p-3 space-y-3">
        {/* Header info */}
        <div className="flex items-center gap-3 pt-1">
          <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center shrink-0">
            <Tag className="w-5 h-5 text-primary-fg" />
          </div>
          <div>
            <p className="text-sm font-bold text-fg">Label QR Kartu</p>
            <p className="text-xs text-muted-fg">Ukuran stiker 50×25mm · Landscape A4</p>
          </div>
        </div>

        {/* Search + select all */}
        <div className="bg-card rounded-2xl border border-border p-3 space-y-2.5">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari kartu (judul atau ID)…"
            className="w-full h-10 border border-border rounded-xl px-3 text-sm text-fg bg-surface focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <button
            onClick={toggleAll}
            className="flex items-center gap-2 text-sm font-semibold text-fg hover:text-primary transition"
          >
            {allSelected
              ? <CheckSquare className="w-4 h-4 text-primary" />
              : <Square className="w-4 h-4 text-muted-fg" />
            }
            {allSelected ? "Batalkan semua" : `Pilih semua (${filtered.length})`}
          </button>
        </div>

        {/* Card list */}
        {loading ? (
          <p className="text-sm text-muted-fg text-center py-8">Memuat…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-fg text-center py-8 italic">
            {allCards.length === 0
              ? "Belum ada kartu tersedia di inventaris."
              : "Tidak ada kartu yang cocok."}
          </p>
        ) : (
          <ul className="space-y-1.5">
            {filtered.map((card) => {
              const checked = selected.has(card.id);
              return (
                <li key={card.id}>
                  <button
                    onClick={() => toggleCard(card.id)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl border text-left transition active:scale-[0.98] ${
                      checked
                        ? "bg-primary bg-opacity-5 border-primary border-opacity-40"
                        : "bg-card border-border hover:bg-muted"
                    }`}
                  >
                    {checked
                      ? <CheckSquare className="w-4 h-4 text-primary shrink-0" />
                      : <Square className="w-4 h-4 text-muted-fg shrink-0" />
                    }
                    <span className="font-mono text-xs font-extrabold bg-primary bg-opacity-10 text-primary px-2 py-0.5 rounded shrink-0">
                      {card.shortId}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-fg truncate">{card.title}</p>
                      <p className="text-xs text-muted-fg truncate">
                        {userMap[card.ownerUserId] ?? "—"} · {card.condition}
                      </p>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

      </div>

      {/* Floating print FAB */}
      <button
        onClick={handlePrint}
        disabled={selected.size === 0}
        aria-label={selected.size > 0 ? `Cetak ${selected.size} label` : "Pilih kartu untuk mencetak"}
        className="fixed bottom-6 right-6 z-30 w-14 h-14 rounded-full bg-primary shadow-lg flex items-center justify-center transition hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Printer className="w-5 h-5 text-primary-fg" />
        {selected.size > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[20px] h-5 rounded-full bg-accent text-primary-fg text-[10px] font-extrabold flex items-center justify-center px-1">
            {selected.size}
          </span>
        )}
      </button>

      {/* Hidden print area — rendered off-screen but visible to print CSS */}
      <div
        id="label-print-area"
        style={{ position: "absolute", left: "-9999px", top: 0, display: "flex", flexWrap: "wrap", gap: "3mm" }}
        aria-hidden="true"
      >
        {selectedCards.map((card) => (
          <CardLabel
            key={card.id}
            card={card}
            ownerName={userMap[card.ownerUserId] ?? card.ownerUserId}
          />
        ))}
      </div>
    </div>
  );
}
