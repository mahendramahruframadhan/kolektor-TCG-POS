import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
} from "react";
import { X, Check } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { v4 as uuidv4 } from "uuid";
import { idb } from "../lib/db.js";
import { api } from "../lib/api.js";
import { useAuthStore } from "../store/auth.js";
import { usePosStore } from "../store/pos.js";
import { MaskedAmount } from "../components/MaskedAmount.js";
import { MobileAppBar } from "../components/MobileAppBar.js";
import { CameraScanner } from "../components/CameraScanner.js";
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
      <span className="inline-block text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-muted text-muted-fg">
        Terjual
      </span>
    );
  }
  if (card.status === "held") {
    return (
      <span className="inline-block text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-warning bg-opacity-15 text-warning">
        Ditahan
      </span>
    );
  }
  if (card.lockedByCartId) {
    const isMyCart =
      card.lockedByCartId === activeCartId ||
      card.lockedByUserId === currentUserId;
    return (
      <span className="inline-block text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-warning bg-opacity-15 text-warning">
        {isMyCart ? "Di keranjang Anda" : "Di keranjang lain"}
      </span>
    );
  }
  return (
    <span className="inline-block text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-success bg-opacity-15 text-success">
      Tersedia
    </span>
  );
}

// ── Payment modal ──────────────────────────────────────────────────────────

interface PaymentModalProps {
  cartItems: IdbCartItem[];
  subtotalIdr: number;
  maxTxDiscountPct: number;
  onConfirm: (channelId: string, discountIdr: number, discountReason: string, notes: string) => Promise<void>;
  onCancel: () => void;
}

function PaymentModal({
  cartItems,
  subtotalIdr,
  maxTxDiscountPct,
  onConfirm,
  onCancel,
}: PaymentModalProps) {
  const [channels, setChannels] = useState<IdbPaymentChannel[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<string>("");
  const [cashTender, setCashTender] = useState<number | null>(null);
  const [customInput, setCustomInput] = useState("");
  const [txDiscountInput, setTxDiscountInput] = useState("");
  const [txDiscountReason, setTxDiscountReason] = useState("");
  const [notes, setNotes] = useState("");
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

  const txDiscountIdr = parseInt(txDiscountInput, 10) || 0;
  const maxDiscountIdr = Math.floor(subtotalIdr * maxTxDiscountPct / 100);
  const discountExceedsCap = txDiscountIdr > maxDiscountIdr;
  const totalIdr = Math.max(0, subtotalIdr - txDiscountIdr);

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
    if (txDiscountIdr > 0 && discountExceedsCap) {
      setError(`Diskon transaksi melebihi batas (${maxTxDiscountPct}% = Rp ${maxDiscountIdr.toLocaleString("id-ID")}).`);
      return;
    }
    if (txDiscountIdr > 0 && !txDiscountReason.trim()) {
      setError("Alasan diskon transaksi wajib diisi.");
      return;
    }
    setError(null);
    setPaying(true);
    try {
      await onConfirm(selectedChannel, txDiscountIdr, txDiscountReason, notes);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Pembayaran gagal.");
    } finally {
      setPaying(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50">
      <div className="w-full max-w-md bg-card rounded-t-3xl shadow-xl p-5 space-y-4 max-h-[90vh] overflow-y-auto">
        {/* Handle */}
        <div className="flex justify-center -mb-1">
          <div className="w-9 h-1 rounded-full bg-border" />
        </div>

        <h2 className="text-base font-bold text-fg">Pembayaran</h2>

        {/* Totals */}
        <div className="space-y-1.5 border-b border-border pb-3">
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-fg">Subtotal</span>
            <MaskedAmount amount={subtotalIdr} className="font-bold text-fg" />
          </div>
          {txDiscountIdr > 0 && (
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-fg">Diskon Transaksi</span>
              <span className="text-sm font-bold text-destructive">- Rp {txDiscountIdr.toLocaleString("id-ID")}</span>
            </div>
          )}
          <div className="flex justify-between items-center">
            <span className="text-sm font-semibold text-fg">Total</span>
            <MaskedAmount amount={totalIdr} className="text-xl font-extrabold text-primary" />
          </div>
        </div>

        {/* Transaction discount */}
        {maxTxDiscountPct > 0 && (
          <div className="space-y-1.5">
            <label className="text-[10px] font-extrabold tracking-widest uppercase text-muted-fg">
              Diskon Transaksi (maks {maxTxDiscountPct}%)
            </label>
            <input
              type="number"
              min={0}
              step={1000}
              value={txDiscountInput}
              onChange={(e) => setTxDiscountInput(e.target.value)}
              placeholder="0"
              className={`w-full h-11 border rounded-xl px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary ${discountExceedsCap ? "border-destructive" : "border-border"}`}
            />
            {txDiscountIdr > 0 && (
              <input
                type="text"
                value={txDiscountReason}
                onChange={(e) => setTxDiscountReason(e.target.value)}
                placeholder="Alasan diskon…"
                className="w-full h-11 border border-border rounded-xl px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            )}
          </div>
        )}

        {/* Payment channel */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-extrabold tracking-widest uppercase text-muted-fg">
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
                className={`h-11 rounded-xl text-sm font-bold border transition ${
                  selectedChannel === ch.id
                    ? "bg-primary border-primary text-primary-fg"
                    : "bg-card border-border text-fg hover:bg-muted"
                }`}
              >
                {ch.name}
              </button>
            ))}
          </div>
        </div>

        {/* Cash tender */}
        {isCash && (
          <div className="space-y-2">
            <label className="text-[10px] font-extrabold tracking-widest uppercase text-muted-fg">
              Uang Diterima
            </label>
            <div className="flex flex-wrap gap-2">
              {quickAmounts.map((amt) => (
                <button
                  key={amt}
                  onClick={() => { setCashTender(amt); setCustomInput(""); }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition ${
                    cashTender === amt && customInput === ""
                      ? "bg-accent border-accent text-accent-fg"
                      : "bg-muted border-border text-muted-fg hover:bg-border"
                  }`}
                >
                  {amt >= 1000000 ? `${amt / 1000000}jt` : `${amt / 1000}k`}
                </button>
              ))}
            </div>
            <input
              type="number"
              min={0}
              placeholder="Nominal lainnya…"
              value={customInput}
              onChange={(e) => { setCustomInput(e.target.value); setCashTender(null); }}
              className="w-full h-11 border border-border rounded-xl px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
            {effectiveTender > 0 && (
              <div className="flex justify-between items-center text-sm font-bold">
                <span className="text-muted-fg">Kembalian</span>
                <span className="text-success">Rp {change.toLocaleString("id-ID")}</span>
              </div>
            )}
          </div>
        )}

        {/* Notes */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-extrabold tracking-widest uppercase text-muted-fg">
            Catatan Transaksi
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Catatan opsional…"
            className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none resize-none"
          />
        </div>

        {error && (
          <div className="bg-destructive bg-opacity-10 border border-destructive border-opacity-30 text-destructive rounded-xl px-4 py-3 text-sm font-medium">
            {error}
          </div>
        )}

        <div className="flex gap-3 pt-1">
          <button
            onClick={onCancel}
            disabled={paying}
            className="flex-1 h-14 border border-border text-fg font-bold rounded-2xl hover:bg-muted transition disabled:opacity-50"
          >
            Batal
          </button>
          <button
            onClick={handleConfirm}
            disabled={paying || !selectedChannel}
            className="flex-1 h-14 bg-primary text-primary-fg font-bold rounded-2xl hover:opacity-90 transition disabled:opacity-50"
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

function ReceiptModal({ transactionId, totalIdr, itemCount, onDone }: ReceiptModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-sm bg-card rounded-3xl shadow-xl p-6 space-y-5 text-center">
        <div className="w-16 h-16 rounded-full bg-success bg-opacity-15 flex items-center justify-center mx-auto">
          <Check className="w-8 h-8 text-success" />
        </div>
        <div>
          <h2 className="text-xl font-extrabold text-fg">Pembayaran Berhasil</h2>
          <p className="text-sm text-muted-fg font-mono mt-1">
            #{transactionId.slice(0, 8).toUpperCase()}
          </p>
        </div>
        <div className="bg-surface rounded-2xl p-4 space-y-2 text-left border border-border">
          <div className="flex justify-between text-sm">
            <span className="text-muted-fg">Jumlah kartu</span>
            <span className="font-bold text-fg">{itemCount}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-fg">Total</span>
            <MaskedAmount amount={totalIdr} className="font-extrabold text-primary" />
          </div>
        </div>
        <button
          onClick={onDone}
          className="w-full h-14 bg-primary text-primary-fg font-bold rounded-2xl hover:opacity-90 transition"
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
  const { activeCartId, scannedCard, setActiveCartId, setScannedCard } = usePosStore();

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

  const [finalPriceInput, setFinalPriceInput] = useState("");
  const [belowBottomError, setBelowBottomError] = useState(false);

  const scanRef = useRef<HTMLInputElement>(null);

  const refocusScan = useCallback(() => {
    setTimeout(() => scanRef.current?.focus(), 50);
  }, []);

  const [maxTxDiscountPct, setMaxTxDiscountPct] = useState(0);

  useEffect(() => {
    scanRef.current?.focus();
    idb.settings.get("max_transaction_discount_pct").then((s) => {
      if (s && typeof s.value === "number") setMaxTxDiscountPct(s.value);
    });
  }, []);

  useEffect(() => {
    if (!activeCartId) {
      setCartItems([]);
      setCartCards({});
      return;
    }
    async function loadCart() {
      const items = await idb.cartItems.where("cartId").equals(activeCartId!).toArray();
      setCartItems(items);
      const cardIds = items.map((i) => i.cardId);
      const cards = await idb.cards.bulkGet(cardIds);
      const byId: Record<string, IdbCard> = {};
      for (const c of cards) if (c) byId[c.id] = c;
      setCartCards(byId);
    }
    loadCart();
  }, [activeCartId]);

  const totalIdr = cartItems.reduce((sum, item) => sum + item.intendedPriceIdr - item.lineDiscountIdr, 0);

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
        setFinalPriceInput("");
        setBelowBottomError(false);
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

  async function ensureCart(): Promise<string> {
    if (activeCartId) return activeCartId;
    const activeEvent = await idb.events.filter((ev) => ev.status === "active").first();
    if (!activeEvent) throw new Error("Tidak ada event aktif.");
    const clientId = uuidv4();
    const response = (await api.carts.create({ clientId, eventId: activeEvent.id })) as { id: string };
    const cartId = response.id;
    await idb.carts.put({
      id: cartId, clientId,
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
      let intendedPriceIdr: number;
      let lineDiscountIdr: number;
      let lineDiscountPct: number;
      let requiresAdminOverride = false;

      if (scannedCard.pricingMode === "negotiable") {
        const finalPrice = parseInt(finalPriceInput, 10);
        const listed = scannedCard.listedPriceIdr ?? 0;
        const bottom = scannedCard.bottomPriceIdr ?? 0;
        if (isNaN(finalPrice) || finalPrice <= 0) {
          setAddError("Masukkan harga final yang valid.");
          setAddingCard(false);
          return;
        }
        if (finalPrice < bottom) {
          if (user?.role !== "admin") {
            setBelowBottomError(true);
            setAddError("Harga final di bawah harga minimum. Hubungi admin untuk override.");
            setAddingCard(false);
            return;
          }
          requiresAdminOverride = true;
        }
        intendedPriceIdr = finalPrice;
        lineDiscountIdr = Math.max(0, listed - finalPrice);
        lineDiscountPct = listed > 0 ? Math.round(((listed - finalPrice) / listed) * 100) : 0;
      } else {
        intendedPriceIdr = scannedCard.priceIdr ?? 0;
        lineDiscountIdr = 0;
        lineDiscountPct = 0;
      }

      const response = (await api.carts.addItem(cartId, {
        cardId: scannedCard.id, intendedPriceIdr, lineDiscountIdr, lineDiscountPct, requiresAdminOverride,
      })) as { id: string };

      const newItem: IdbCartItem = {
        id: response.id, cartId, cardId: scannedCard.id,
        intendedPriceIdr, lineDiscountIdr, lineDiscountPct, requiresAdminOverride,
      };

      await idb.cartItems.put(newItem);
      await idb.cards.update(scannedCard.id, {
        lockedByCartId: cartId, lockedByUserId: user!.id, lockedAt: Date.now(),
      });

      setCartItems((prev) => [...prev, newItem]);
      setCartCards((prev) => ({
        ...prev,
        [scannedCard.id]: { ...scannedCard, lockedByCartId: cartId, lockedByUserId: user!.id },
      }));
      setScannedCard(null);
      setFinalPriceInput("");
      setBelowBottomError(false);
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
      await idb.cards.update(item.cardId, {
        lockedByCartId: undefined, lockedByUserId: undefined, lockedAt: undefined,
      });
      setCartItems((prev) => prev.filter((i) => i.id !== item.id));
      setCartCards((prev) => {
        const updated = { ...prev };
        const existing = updated[item.cardId];
        if (existing) {
          updated[item.cardId] = {
            ...existing, lockedByCartId: undefined, lockedByUserId: undefined, lockedAt: undefined,
          };
        }
        return updated;
      });
    } catch {
      // Best effort for offline resilience
    }
    refocusScan();
  }

  async function handlePay(channelId: string, discountIdr: number, discountReason: string, notes: string) {
    if (!activeCartId) throw new Error("Tidak ada keranjang aktif.");
    const response = (await api.carts.pay(activeCartId, {
      paymentChannelId: channelId,
      transactionClientId: uuidv4(),
      discountIdr: discountIdr || undefined,
      discountReason: discountReason || undefined,
      notes: notes || undefined,
    })) as { transaction: { id: string }; receipt: unknown[] };

    const txId = response.transaction.id;
    await idb.carts.update(activeCartId, { status: "paid", paidTransactionId: txId });
    for (const item of cartItems) {
      await idb.cards.update(item.cardId, {
        status: "sold", lockedByCartId: undefined, lockedByUserId: undefined, lockedAt: undefined,
      });
    }
    setShowPayModal(false);
    setReceipt({ transactionId: txId, totalIdr, itemCount: cartItems.length });
  }

  function handleReceiptDone() {
    setReceipt(null);
    setActiveCartId(null);
    setScannedCard(null);
    setCartItems([]);
    setCartCards({});
    setScanError(null);
    setAddError(null);
    setFinalPriceInput("");
    setBelowBottomError(false);
    refocusScan();
  }

  async function handleAbandonCart() {
    if (!activeCartId) return;
    try {
      await api.carts.abandon(activeCartId);
      await idb.carts.update(activeCartId, { status: "abandoned" });
      for (const item of cartItems) {
        await idb.cards.update(item.cardId, {
          lockedByCartId: undefined, lockedByUserId: undefined, lockedAt: undefined,
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
    scannedCard && scannedCard.status === "available" && !scannedCard.lockedByCartId;

  const cardAlreadyInCart =
    scannedCard?.lockedByCartId === activeCartId ||
    cartItems.some((i) => i.cardId === scannedCard?.id);

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      <MobileAppBar
        title="Kasir POS"
        back
        onBack={() => navigate("/dashboard")}
      />

      <div className="flex-1 overflow-y-auto max-w-xl mx-auto w-full p-3 space-y-3">
        {/* ── Scanner section ── */}
        <div className="bg-card rounded-2xl border border-border p-4 space-y-3">
          <p className="text-[10px] font-extrabold tracking-widest uppercase text-muted-fg">
            Scan / Ketik ID Kartu
          </p>
          <CameraScanner onScan={(text) => handleScan(text)} />
          <input
            ref={scanRef}
            type="text"
            value={scanInput}
            onChange={(e) => setScanInput(e.target.value.toUpperCase())}
            onKeyDown={handleScanKeyDown}
            placeholder="O-XXXXX  atau  scan USB"
            autoFocus
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            className="w-full h-14 border-2 border-accent rounded-2xl px-4 text-2xl font-mono font-bold text-center tracking-widest text-fg focus:outline-none focus:ring-2 focus:ring-accent placeholder:text-border placeholder:text-sm"
          />
          {scanning && (
            <p className="text-sm text-muted-fg text-center">Mencari…</p>
          )}
          {scanError && (
            <div className="bg-destructive bg-opacity-10 border border-destructive border-opacity-30 text-destructive rounded-xl px-3 py-2 text-sm font-medium">
              {scanError}
            </div>
          )}
        </div>

        {/* ── Scanned card review ── */}
        {scannedCard && (
          <div className="bg-card rounded-2xl border border-border p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="font-bold text-fg leading-tight truncate">
                  {scannedCard.title}
                </p>
                <p className="text-xs text-muted-fg mt-0.5">
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

            {scannedCard.pricingMode === "negotiable" ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-fg">Harga Tayang</span>
                  <MaskedAmount
                    amount={scannedCard.listedPriceIdr}
                    className="text-lg font-extrabold text-fg"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-extrabold tracking-widest uppercase text-muted-fg">
                    Harga Final (IDR)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-fg pointer-events-none">
                      Rp
                    </span>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={finalPriceInput}
                      onChange={(e) => {
                        setFinalPriceInput(e.target.value);
                        setBelowBottomError(false);
                        const val = parseInt(e.target.value, 10);
                        const bottom = scannedCard.bottomPriceIdr ?? 0;
                        if (!isNaN(val) && val < bottom) setBelowBottomError(true);
                      }}
                      placeholder="0"
                      className={`w-full h-11 border rounded-xl pl-10 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary ${belowBottomError ? "border-destructive" : "border-border"}`}
                    />
                  </div>
                  {belowBottomError && (
                    <p className="text-xs text-destructive font-bold">
                      Di bawah harga minimum
                      {user?.role === "admin" ? " — admin override diizinkan." : " — tidak dapat ditambahkan ke keranjang."}
                    </p>
                  )}
                  {finalPriceInput &&
                    !isNaN(parseInt(finalPriceInput, 10)) &&
                    parseInt(finalPriceInput, 10) > 0 &&
                    scannedCard.listedPriceIdr &&
                    parseInt(finalPriceInput, 10) < scannedCard.listedPriceIdr && (
                      <p className="text-xs text-muted-fg">
                        Diskon:{" "}
                        {Math.round(
                          ((scannedCard.listedPriceIdr - parseInt(finalPriceInput, 10)) /
                            scannedCard.listedPriceIdr) * 100
                        )}%
                      </p>
                    )}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-fg">Harga</span>
                <MaskedAmount
                  amount={scannedCard.priceIdr}
                  className="text-lg font-extrabold text-fg"
                />
              </div>
            )}

            {addError && (
              <div className="bg-destructive bg-opacity-10 border border-destructive border-opacity-30 text-destructive rounded-xl px-3 py-2 text-sm font-medium">
                {addError}
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => {
                  setScannedCard(null);
                  setFinalPriceInput("");
                  setBelowBottomError(false);
                  refocusScan();
                }}
                className="flex-1 h-11 border border-border text-muted-fg font-bold rounded-xl hover:bg-muted text-sm transition"
              >
                Tutup
              </button>
              {cardAlreadyInCart ? (
                <button
                  disabled
                  className="flex-1 h-11 bg-muted text-muted-fg font-bold rounded-xl text-sm cursor-not-allowed"
                >
                  Sudah di keranjang
                </button>
              ) : cardIsAvailableToAdd ? (
                <button
                  onClick={handleAddToCart}
                  disabled={addingCard || (belowBottomError && user?.role !== "admin")}
                  className="flex-1 h-11 bg-accent text-accent-fg font-bold rounded-xl text-sm transition hover:opacity-90 disabled:opacity-50"
                >
                  {addingCard ? "Menambah…" : "Tambah ke Keranjang"}
                </button>
              ) : (
                <button
                  disabled
                  className="flex-1 h-11 bg-muted text-muted-fg font-bold rounded-xl text-sm cursor-not-allowed"
                >
                  Tidak tersedia
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── Cart panel ── */}
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          <div className="px-4 pt-4 pb-2 flex items-center justify-between">
            <p className="text-[10px] font-extrabold tracking-widest uppercase text-muted-fg">
              Keranjang ({cartItems.length} kartu)
            </p>
            {activeCartId && cartItems.length > 0 && (
              <button
                onClick={handleAbandonCart}
                className="text-xs text-destructive hover:opacity-70 font-bold"
              >
                Batalkan
              </button>
            )}
          </div>

          {cartItems.length === 0 ? (
            <p className="px-4 pb-4 text-sm text-muted-fg italic">
              Keranjang kosong
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {cartItems.map((item) => {
                const card = cartCards[item.cardId];
                const lineTotal = item.intendedPriceIdr - item.lineDiscountIdr;
                return (
                  <li key={item.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-fg truncate">
                        {card?.title ?? item.cardId}
                      </p>
                      {card && (
                        <p className="text-xs text-muted-fg truncate">
                          {card.setName}
                          {card.setNumber ? ` #${card.setNumber}` : ""}
                          {" · "}
                          {card.condition}
                        </p>
                      )}
                    </div>
                    <MaskedAmount
                      amount={lineTotal}
                      className="text-sm font-bold text-fg shrink-0"
                    />
                    <button
                      onClick={() => handleRemoveItem(item)}
                      className="text-border hover:text-destructive transition ml-1 shrink-0"
                      aria-label="Hapus dari keranjang"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {cartItems.length > 0 && (
            <div className="px-4 py-4 border-t border-border space-y-3">
              <div className="flex justify-between items-center">
                <span className="font-bold text-fg">Total</span>
                <MaskedAmount amount={totalIdr} className="text-xl font-extrabold text-primary" />
              </div>
              <button
                onClick={() => setShowPayModal(true)}
                className="w-full h-14 bg-primary text-primary-fg font-bold text-base rounded-2xl hover:opacity-90 transition"
              >
                Bayar
              </button>
            </div>
          )}
        </div>
      </div>

      {showPayModal && (
        <PaymentModal
          cartItems={cartItems}
          subtotalIdr={totalIdr}
          maxTxDiscountPct={maxTxDiscountPct}
          onConfirm={handlePay}
          onCancel={() => { setShowPayModal(false); refocusScan(); }}
        />
      )}

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
