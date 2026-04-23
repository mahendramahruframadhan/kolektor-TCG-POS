import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
} from "react";
import { useNavigate } from "react-router-dom";
import { v4 as uuidv4 } from "uuid";
import { idb } from "../lib/db.js";
import { api } from "../lib/api.js";
import { useAuthStore } from "../store/auth.js";
import { usePosStore } from "../store/pos.js";
import { MaskedAmount } from "../components/MaskedAmount.js";
import type { IdbCard, IdbCartItem, IdbPaymentChannel } from "../lib/db.js";

// ── Helpers ────────────────────────────────────────────────────────────────

function StatusBadge({
  card,
  currentUserId,
  activeCartId,
}: {
  card: IdbCard;
  currentUserId: string;
  activeCartId: string | null;
}) {
  if (card.status === "sold") {
    return (
      <span className="inline-block text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-200 text-gray-600">
        Terjual
      </span>
    );
  }
  if (card.status === "held") {
    return (
      <span className="inline-block text-xs font-semibold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">
        Ditahan
      </span>
    );
  }
  if (card.lockedByCartId) {
    const isMyCart =
      card.lockedByCartId === activeCartId ||
      card.lockedByUserId === currentUserId;
    if (isMyCart) {
      return (
        <span className="inline-block text-xs font-semibold px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700">
          Di keranjang Anda
        </span>
      );
    }
    // Locked by someone else — try to show their name (best-effort sync)
    return (
      <span className="inline-block text-xs font-semibold px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700">
        Di keranjang pengguna lain
      </span>
    );
  }
  return (
    <span className="inline-block text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">
      Tersedia
    </span>
  );
}

// ── Payment modal ──────────────────────────────────────────────────────────

interface PaymentModalProps {
  cartItems: IdbCartItem[];
  totalIdr: number;
  onConfirm: (channelId: string, note?: string) => Promise<void>;
  onCancel: () => void;
}

function PaymentModal({
  cartItems,
  totalIdr,
  onConfirm,
  onCancel,
}: PaymentModalProps) {
  const [channels, setChannels] = useState<IdbPaymentChannel[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<string>("");
  const [cashTender, setCashTender] = useState<number | null>(null);
  const [customInput, setCustomInput] = useState("");
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    idb.paymentChannels
      .filter((c) => c.isActive)
      .sortBy("sortOrder")
      .then((list) => {
        setChannels(list);
        if (list.length > 0) setSelectedChannel(list[0]!.id);
      });
  }, []);

  const selectedChannelObj = channels.find((c) => c.id === selectedChannel);
  const isCash = selectedChannelObj?.type === "cash";

  const effectiveTender =
    customInput !== ""
      ? parseInt(customInput.replace(/\D/g, ""), 10) || 0
      : (cashTender ?? 0);

  const change = isCash ? Math.max(0, effectiveTender - totalIdr) : 0;

  const quickAmounts = [50000, 100000, 200000, 500000, 1000000];

  async function handleConfirm() {
    if (!selectedChannel) {
      setError("Pilih metode pembayaran.");
      return;
    }
    if (isCash && effectiveTender < totalIdr) {
      setError("Jumlah uang tidak cukup.");
      return;
    }
    setError(null);
    setPaying(true);
    try {
      await onConfirm(selectedChannel);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Pembayaran gagal.");
    } finally {
      setPaying(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50">
      <div className="w-full max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-xl p-5 space-y-4">
        <h2 className="text-lg font-bold text-gray-800">Pembayaran</h2>

        {/* Total */}
        <div className="flex justify-between items-center py-2 border-b">
          <span className="text-sm text-gray-600">Total</span>
          <MaskedAmount
            amount={totalIdr}
            className="text-xl font-bold text-gray-900"
          />
        </div>

        {/* Payment channel selector */}
        <div className="space-y-1">
          <label className="text-sm font-medium text-gray-700">
            Metode Pembayaran
          </label>
          <div className="grid grid-cols-2 gap-2">
            {channels.map((ch) => (
              <button
                key={ch.id}
                onClick={() => {
                  setSelectedChannel(ch.id);
                  setCashTender(null);
                  setCustomInput("");
                }}
                className={`px-3 py-2 rounded-lg text-sm font-medium border transition ${
                  selectedChannel === ch.id
                    ? "bg-blue-600 border-blue-600 text-white"
                    : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50"
                }`}
              >
                {ch.name}
              </button>
            ))}
          </div>
        </div>

        {/* Cash tender section */}
        {isCash && (
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">
              Uang Diterima
            </label>
            <div className="flex flex-wrap gap-2">
              {quickAmounts.map((amt) => (
                <button
                  key={amt}
                  onClick={() => {
                    setCashTender(amt);
                    setCustomInput("");
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                    cashTender === amt && customInput === ""
                      ? "bg-blue-600 border-blue-600 text-white"
                      : "bg-gray-100 border-gray-200 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  {amt >= 1000000
                    ? `${amt / 1000000}jt`
                    : `${amt / 1000}k`}
                </button>
              ))}
            </div>
            <input
              type="number"
              min={0}
              placeholder="Nominal lainnya…"
              value={customInput}
              onChange={(e) => {
                setCustomInput(e.target.value);
                setCashTender(null);
              }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {effectiveTender > 0 && (
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-600">Kembalian</span>
                <span className="font-bold text-green-700">
                  Rp {change.toLocaleString("id-ID")}
                </span>
              </div>
            )}
          </div>
        )}

        {error && (
          <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <div className="flex gap-3 pt-1">
          <button
            onClick={onCancel}
            disabled={paying}
            className="flex-1 border border-gray-300 text-gray-700 font-semibold py-2.5 rounded-xl hover:bg-gray-50 transition disabled:opacity-50"
          >
            Batal
          </button>
          <button
            onClick={handleConfirm}
            disabled={paying || !selectedChannel}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-xl transition disabled:opacity-50"
          >
            {paying ? "Memproses…" : "Bayar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Receipt modal ──────────────────────────────────────────────────────────

interface ReceiptModalProps {
  transactionId: string;
  totalIdr: number;
  itemCount: number;
  onDone: () => void;
}

function ReceiptModal({
  transactionId,
  totalIdr,
  itemCount,
  onDone,
}: ReceiptModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-6 space-y-4 text-center">
        <div className="text-5xl">✅</div>
        <h2 className="text-xl font-bold text-gray-800">Pembayaran Berhasil</h2>
        <p className="text-sm text-gray-500">#{transactionId.slice(0, 8).toUpperCase()}</p>
        <div className="bg-gray-50 rounded-xl p-4 space-y-1 text-left">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Jumlah kartu</span>
            <span className="font-semibold">{itemCount}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Total</span>
            <MaskedAmount amount={totalIdr} className="font-bold text-gray-800" />
          </div>
        </div>
        <button
          onClick={onDone}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-xl transition"
        >
          Transaksi Baru
        </button>
      </div>
    </div>
  );
}

// ── Main POS page ──────────────────────────────────────────────────────────

export function POSPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const { activeCartId, scannedCard, setActiveCartId, setScannedCard } =
    usePosStore();

  const [scanInput, setScanInput] = useState("");
  const [cartItems, setCartItems] = useState<IdbCartItem[]>([]);
  const [cartCards, setCartCards] = useState<Record<string, IdbCard>>({});
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [addingCard, setAddingCard] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [showPayModal, setShowPayModal] = useState(false);
  const [receipt, setReceipt] = useState<{
    transactionId: string;
    totalIdr: number;
    itemCount: number;
  } | null>(null);

  const scanRef = useRef<HTMLInputElement>(null);

  // Keep scan input focused
  const refocusScan = useCallback(() => {
    setTimeout(() => scanRef.current?.focus(), 50);
  }, []);

  useEffect(() => {
    scanRef.current?.focus();
  }, []);

  // Load cart items from IDB whenever activeCartId changes
  useEffect(() => {
    if (!activeCartId) {
      setCartItems([]);
      setCartCards({});
      return;
    }
    async function loadCart() {
      const items = await idb.cartItems
        .where("cartId")
        .equals(activeCartId!)
        .toArray();
      setCartItems(items);

      // Fetch card metadata for display
      const cardIds = items.map((i) => i.cardId);
      const cards = await idb.cards.bulkGet(cardIds);
      const byId: Record<string, IdbCard> = {};
      for (const c of cards) {
        if (c) byId[c.id] = c;
      }
      setCartCards(byId);
    }
    loadCart();
  }, [activeCartId]);

  const totalIdr = cartItems.reduce((sum, item) => sum + item.intendedPriceIdr - item.lineDiscountIdr, 0);

  // Look up card by shortId in IDB
  async function handleScan(rawInput: string) {
    const shortId = rawInput.trim().toUpperCase();
    if (!shortId) return;

    setScanError(null);
    setScanning(true);
    try {
      const card = await idb.cards.where("shortId").equals(shortId).first();
      if (!card) {
        setScanError(`Kartu "${shortId}" tidak ditemukan di database lokal.`);
        setScannedCard(null);
      } else {
        setScannedCard(card);
      }
    } finally {
      setScanning(false);
      setScanInput("");
      refocusScan();
    }
  }

  function handleScanKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleScan(scanInput);
    }
  }

  // Ensure or create a draft cart for current user + active event
  async function ensureCart(): Promise<string> {
    if (activeCartId) return activeCartId;

    const activeEvent = await idb.events
      .filter((ev) => ev.status === "active")
      .first();

    if (!activeEvent) throw new Error("Tidak ada event aktif.");

    const clientId = uuidv4();
    const response = (await api.carts.create({
      clientId,
      eventId: activeEvent.id,
    })) as { id: string };

    const cartId = response.id;

    // Persist cart locally
    await idb.carts.put({
      id: cartId,
      clientId,
      cashierUserId: user!.id,
      eventId: activeEvent.id,
      status: "draft",
      lastActivityAt: Date.now(),
      version: 1,
    });

    setActiveCartId(cartId);
    return cartId;
  }

  async function handleAddToCart() {
    if (!scannedCard) return;
    setAddError(null);
    setAddingCard(true);
    try {
      const cartId = await ensureCart();

      const priceIdr = scannedCard.listedPriceIdr ?? scannedCard.priceIdr ?? 0;

      const response = (await api.carts.addItem(cartId, {
        cardId: scannedCard.id,
        intendedPriceIdr: priceIdr,
        lineDiscountIdr: 0,
        lineDiscountPct: 0,
      })) as { id: string };

      const newItem: IdbCartItem = {
        id: response.id,
        cartId,
        cardId: scannedCard.id,
        intendedPriceIdr: priceIdr,
        lineDiscountIdr: 0,
        lineDiscountPct: 0,
        requiresAdminOverride: false,
      };

      await idb.cartItems.put(newItem);

      // Update denorm on card (optimistic local)
      await idb.cards.update(scannedCard.id, {
        lockedByCartId: cartId,
        lockedByUserId: user!.id,
        lockedAt: Date.now(),
      });

      setCartItems((prev) => [...prev, newItem]);
      setCartCards((prev) => ({
        ...prev,
        [scannedCard.id]: {
          ...scannedCard,
          lockedByCartId: cartId,
          lockedByUserId: user!.id,
        },
      }));
      setScannedCard(null);
      refocusScan();
    } catch (err: unknown) {
      setAddError(err instanceof Error ? err.message : "Gagal menambah kartu.");
    } finally {
      setAddingCard(false);
    }
  }

  async function handleRemoveItem(item: IdbCartItem) {
    if (!activeCartId) return;
    try {
      await api.carts.removeItem(activeCartId, item.cardId);
      await idb.cartItems.delete(item.id);

      // Release lock on card (optimistic)
      await idb.cards.update(item.cardId, {
        lockedByCartId: undefined,
        lockedByUserId: undefined,
        lockedAt: undefined,
      });

      setCartItems((prev) => prev.filter((i) => i.id !== item.id));
      setCartCards((prev) => {
        const updated = { ...prev };
        const existing = updated[item.cardId];
        if (existing) {
          updated[item.cardId] = {
            ...existing,
            lockedByCartId: undefined,
            lockedByUserId: undefined,
            lockedAt: undefined,
          };
        }
        return updated;
      });
    } catch {
      // Ignore network errors for offline resilience; local state already updated
    }
    refocusScan();
  }

  async function handlePay(channelId: string) {
    if (!activeCartId) throw new Error("Tidak ada keranjang aktif.");

    const response = (await api.carts.pay(activeCartId, {
      paymentChannelId: channelId,
      transactionClientId: uuidv4(),
    })) as { transaction: { id: string }; receipt: unknown[] };

    const txId = response.transaction.id;

    // Update local cart status
    await idb.carts.update(activeCartId, {
      status: "paid",
      paidTransactionId: txId,
    });

    // Mark cards as sold
    for (const item of cartItems) {
      await idb.cards.update(item.cardId, {
        status: "sold",
        lockedByCartId: undefined,
        lockedByUserId: undefined,
        lockedAt: undefined,
      });
    }

    setShowPayModal(false);
    setReceipt({
      transactionId: txId,
      totalIdr,
      itemCount: cartItems.length,
    });
  }

  function handleReceiptDone() {
    setReceipt(null);
    setActiveCartId(null);
    setScannedCard(null);
    setCartItems([]);
    setCartCards({});
    setScanError(null);
    setAddError(null);
    refocusScan();
  }

  async function handleAbandonCart() {
    if (!activeCartId) return;
    try {
      await api.carts.abandon(activeCartId);
      await idb.carts.update(activeCartId, { status: "abandoned" });
      // Release locks
      for (const item of cartItems) {
        await idb.cards.update(item.cardId, {
          lockedByCartId: undefined,
          lockedByUserId: undefined,
          lockedAt: undefined,
        });
      }
    } catch {
      // Best effort
    }
    setActiveCartId(null);
    setScannedCard(null);
    setCartItems([]);
    setCartCards({});
    refocusScan();
  }

  const cardIsAvailableToAdd =
    scannedCard &&
    scannedCard.status === "available" &&
    !scannedCard.lockedByCartId;

  const cardAlreadyInCart =
    scannedCard?.lockedByCartId === activeCartId ||
    cartItems.some((i) => i.cardId === scannedCard?.id);

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
        <h1 className="font-bold text-base">Kasir POS</h1>
        <span className="text-sm opacity-70">{user?.displayName}</span>
      </header>

      <div className="flex-1 overflow-y-auto max-w-xl mx-auto w-full p-3 space-y-3">
        {/* ── Scanner section ── */}
        <div className="bg-white rounded-xl shadow-sm p-4 space-y-3">
          <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">
            Scan / Ketik ID Kartu
          </p>
          <input
            ref={scanRef}
            type="text"
            value={scanInput}
            onChange={(e) => setScanInput(e.target.value.toUpperCase())}
            onKeyDown={handleScanKeyDown}
            placeholder="O-XXXXX"
            autoFocus
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            className="w-full border-2 border-blue-400 rounded-xl px-4 py-3 text-2xl font-mono text-center tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-300"
          />
          {scanning && (
            <p className="text-sm text-gray-400 text-center">Mencari…</p>
          )}
          {scanError && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
              {scanError}
            </p>
          )}
        </div>

        {/* ── Scanned card review ── */}
        {scannedCard && (
          <div className="bg-white rounded-xl shadow-sm p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-800 leading-tight truncate">
                  {scannedCard.title}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {scannedCard.setName}{" "}
                  {scannedCard.setNumber ? `#${scannedCard.setNumber}` : ""}
                  {" · "}
                  {scannedCard.condition}
                  {scannedCard.language ? ` · ${scannedCard.language}` : ""}
                </p>
              </div>
              <StatusBadge
                card={scannedCard}
                currentUserId={user?.id ?? ""}
                activeCartId={activeCartId}
              />
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Harga</span>
              <MaskedAmount
                amount={scannedCard.listedPriceIdr ?? scannedCard.priceIdr}
                className="text-lg font-bold text-gray-900"
              />
            </div>

            {addError && (
              <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
                {addError}
              </p>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => {
                  setScannedCard(null);
                  refocusScan();
                }}
                className="flex-1 border border-gray-300 text-gray-600 font-medium py-2 rounded-xl hover:bg-gray-50 text-sm transition"
              >
                Tutup
              </button>
              {cardAlreadyInCart ? (
                <button
                  disabled
                  className="flex-1 bg-gray-100 text-gray-400 font-semibold py-2 rounded-xl text-sm cursor-not-allowed"
                >
                  Sudah di keranjang
                </button>
              ) : cardIsAvailableToAdd ? (
                <button
                  onClick={handleAddToCart}
                  disabled={addingCard}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 rounded-xl text-sm transition disabled:opacity-50"
                >
                  {addingCard ? "Menambah…" : "Tambah ke Keranjang"}
                </button>
              ) : (
                <button
                  disabled
                  className="flex-1 bg-gray-100 text-gray-400 font-semibold py-2 rounded-xl text-sm cursor-not-allowed"
                >
                  Tidak tersedia
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── Cart panel ── */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 pt-4 pb-2 flex items-center justify-between">
            <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">
              Keranjang ({cartItems.length} kartu)
            </p>
            {activeCartId && cartItems.length > 0 && (
              <button
                onClick={handleAbandonCart}
                className="text-xs text-red-500 hover:text-red-700 font-medium"
              >
                Batalkan
              </button>
            )}
          </div>

          {cartItems.length === 0 ? (
            <p className="px-4 pb-4 text-sm text-gray-400 italic">
              Keranjang kosong
            </p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {cartItems.map((item) => {
                const card = cartCards[item.cardId];
                const lineTotal = item.intendedPriceIdr - item.lineDiscountIdr;
                return (
                  <li
                    key={item.id}
                    className="flex items-center gap-3 px-4 py-3"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">
                        {card?.title ?? item.cardId}
                      </p>
                      {card && (
                        <p className="text-xs text-gray-400 truncate">
                          {card.setName}
                          {card.setNumber ? ` #${card.setNumber}` : ""}
                          {" · "}
                          {card.condition}
                        </p>
                      )}
                    </div>
                    <MaskedAmount
                      amount={lineTotal}
                      className="text-sm font-semibold text-gray-700 shrink-0"
                    />
                    <button
                      onClick={() => handleRemoveItem(item)}
                      className="text-gray-300 hover:text-red-400 transition ml-1 shrink-0"
                      aria-label="Hapus dari keranjang"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="w-4 h-4"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {/* Total + pay button */}
          {cartItems.length > 0 && (
            <div className="px-4 py-4 border-t border-gray-100 space-y-3">
              <div className="flex justify-between items-center">
                <span className="font-semibold text-gray-700">Total</span>
                <MaskedAmount
                  amount={totalIdr}
                  className="text-xl font-bold text-gray-900"
                />
              </div>
              <button
                onClick={() => {
                  setShowPayModal(true);
                }}
                className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-xl text-base transition"
              >
                Bayar
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Payment modal */}
      {showPayModal && (
        <PaymentModal
          cartItems={cartItems}
          totalIdr={totalIdr}
          onConfirm={handlePay}
          onCancel={() => {
            setShowPayModal(false);
            refocusScan();
          }}
        />
      )}

      {/* Receipt modal */}
      {receipt && (
        <ReceiptModal
          transactionId={receipt.transactionId}
          totalIdr={receipt.totalIdr}
          itemCount={receipt.itemCount}
          onDone={handleReceiptDone}
        />
      )}
    </div>
  );
}
