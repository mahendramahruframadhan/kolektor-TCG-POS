import React, { useState, useId } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle } from "lucide-react";
import { idb } from "../lib/db.js";
import { useAuthStore } from "../store/auth.js";
import { MobileAppBar } from "../components/MobileAppBar.js";
import { api } from "../lib/api.js";
import type { IdbTransaction } from "../lib/db.js";

type Tab = "ringkasan" | "keamanan" | "konfigurasi";

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 py-3 text-xs font-extrabold tracking-wide transition border-b-2 ${
        active
          ? "border-primary text-primary"
          : "border-transparent text-muted-fg hover:text-fg"
      }`}
    >
      {children}
    </button>
  );
}

function StatRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center border-b border-border pb-2.5 last:border-0 last:pb-0">
      <span className="text-sm text-muted-fg">{label}</span>
      {value}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-extrabold tracking-widest uppercase text-muted-fg px-1">
      {children}
    </p>
  );
}

function SaleRow({
  label,
  count,
  total,
}: {
  label: string;
  count: number;
  total: number;
}) {
  return (
    <div className="flex justify-between items-center border-b border-border pb-2.5 last:border-0 last:pb-0">
      <span className="text-sm text-muted-fg">{label}</span>
      <div className="text-right">
        <p className="text-sm font-bold text-fg">
          Rp {total.toLocaleString("id-ID")}
        </p>
        <p className="text-xs text-muted-fg">{count} kartu</p>
      </div>
    </div>
  );
}

function useProfileStats(userId: string) {
  return useQuery({
    queryKey: ["profile-stats", userId],
    queryFn: async () => {
      const [myCards, myItems, allEvents] = await Promise.all([
        idb.cards.where("ownerUserId").equals(userId).toArray(),
        idb.transactionItems.where("ownerUserIdSnapshot").equals(userId).toArray(),
        idb.events.toArray(),
      ]);

      const txIds = [...new Set(myItems.map((i) => i.transactionId))];
      const relatedTxs = txIds.length
        ? await idb.transactions.where("id").anyOf(txIds).toArray()
        : [];

      const txById = new Map<string, IdbTransaction>();
      for (const tx of relatedTxs) txById.set(tx.id, tx);

      const eventById = new Map<string, { name: string; startDate: string }>();
      for (const ev of allEvents)
        eventById.set(ev.id, { name: ev.name, startDate: ev.startDate });

      const inventory = {
        total: myCards.length,
        available: myCards.filter((c) => c.status === "available").length,
        sold: myCards.filter((c) => c.status === "sold").length,
        held: myCards.filter((c) => c.status === "held").length,
        returned: myCards.filter((c) => c.status === "returned").length,
      };

      const saleItems = myItems.filter(
        (item) => txById.get(item.transactionId)?.kind === "sale"
      );

      const today = new Date().toLocaleDateString("id-ID");
      const nowYear = new Date().getFullYear();
      const nowMonth = new Date().getMonth();

      const todayItems = saleItems.filter((item) => {
        const tx = txById.get(item.transactionId);
        if (!tx) return false;
        return (
          new Date(tx.createdAt * 1000).toLocaleDateString("id-ID") === today
        );
      });

      const monthItems = saleItems.filter((item) => {
        const tx = txById.get(item.transactionId);
        if (!tx) return false;
        const d = new Date(tx.createdAt * 1000);
        return d.getFullYear() === nowYear && d.getMonth() === nowMonth;
      });

      const sales = {
        today: {
          count: todayItems.length,
          total: todayItems.reduce((s, i) => s + i.soldPriceIdr, 0),
        },
        month: {
          count: monthItems.length,
          total: monthItems.reduce((s, i) => s + i.soldPriceIdr, 0),
        },
        allTime: {
          count: saleItems.length,
          total: saleItems.reduce((s, i) => s + i.soldPriceIdr, 0),
        },
      };

      const byEvent = new Map<string, { count: number; total: number }>();
      for (const item of saleItems) {
        const tx = txById.get(item.transactionId);
        if (!tx) continue;
        const prev = byEvent.get(tx.eventId) ?? { count: 0, total: 0 };
        byEvent.set(tx.eventId, {
          count: prev.count + 1,
          total: prev.total + item.soldPriceIdr,
        });
      }

      const perEvent = Array.from(byEvent.entries())
        .map(([eventId, stats]) => ({
          eventId,
          name: eventById.get(eventId)?.name ?? eventId,
          startDate: eventById.get(eventId)?.startDate ?? "",
          ...stats,
        }))
        .sort((a, b) => b.startDate.localeCompare(a.startDate));

      return { inventory, sales, perEvent };
    },
  });
}

function ProfileSummaryTab() {
  const user = useAuthStore((s) => s.user)!;
  const { data, isLoading } = useProfileStats(user.id);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 pt-1">
        <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center shrink-0">
          <span className="text-base font-extrabold text-primary-fg">
            {user.displayName[0]?.toUpperCase() ?? "?"}
          </span>
        </div>
        <div className="min-w-0">
          <p className="font-bold text-fg text-base truncate">
            {user.displayName}
          </p>
          <p className="text-xs text-muted-fg truncate">{user.email}</p>
          <span className="inline-block mt-0.5 text-[10px] font-extrabold tracking-widest uppercase bg-primary bg-opacity-10 text-primary px-2 py-0.5 rounded-full">
            {user.role === "admin" ? "Admin" : "Kasir"}
          </span>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-fg text-center py-8">Memuat…</p>
      ) : (
        <>
          <SectionLabel>Inventaris Kartu</SectionLabel>
          <div className="bg-card rounded-2xl border border-border p-4 space-y-3">
            <StatRow
              label="Total Kartu"
              value={
                <span className="text-sm font-bold text-fg">
                  {data?.inventory.total ?? 0}
                </span>
              }
            />
            <StatRow
              label="Tersedia"
              value={
                <span className="text-sm font-bold text-success">
                  {data?.inventory.available ?? 0}
                </span>
              }
            />
            <StatRow
              label="Terjual"
              value={
                <span className="text-sm font-bold text-muted-fg">
                  {data?.inventory.sold ?? 0}
                </span>
              }
            />
            <StatRow
              label="Dipegang"
              value={
                <span className="text-sm font-bold text-warning">
                  {data?.inventory.held ?? 0}
                </span>
              }
            />
            <StatRow
              label="Dikembalikan"
              value={
                <span className="text-sm font-bold text-primary">
                  {data?.inventory.returned ?? 0}
                </span>
              }
            />
          </div>

          <SectionLabel>Penjualan Saya</SectionLabel>
          <div className="bg-card rounded-2xl border border-border p-4 space-y-3">
            <SaleRow
              label="Hari Ini"
              count={data?.sales.today.count ?? 0}
              total={data?.sales.today.total ?? 0}
            />
            <SaleRow
              label="Bulan Ini"
              count={data?.sales.month.count ?? 0}
              total={data?.sales.month.total ?? 0}
            />
            <SaleRow
              label="Sepanjang Waktu"
              count={data?.sales.allTime.count ?? 0}
              total={data?.sales.allTime.total ?? 0}
            />
          </div>

          <SectionLabel>Penjualan Per Event</SectionLabel>
          <div className="bg-card rounded-2xl border border-border p-4">
            {!data?.perEvent.length ? (
              <p className="text-sm text-muted-fg italic text-center py-2">
                Belum ada data penjualan per event.
              </p>
            ) : (
              <div className="space-y-3">
                {data.perEvent.map((ev) => (
                  <div
                    key={ev.eventId}
                    className="flex justify-between items-center border-b border-border pb-2.5 last:border-0 last:pb-0 gap-2"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-fg truncate">
                        {ev.name}
                      </p>
                      <p className="text-xs text-muted-fg">{ev.count} kartu</p>
                    </div>
                    <span className="text-sm font-bold text-fg shrink-0">
                      Rp {ev.total.toLocaleString("id-ID")}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

const inputCls =
  "w-full h-11 border border-border rounded-xl px-3 text-sm font-medium text-fg bg-surface focus:outline-none focus:ring-2 focus:ring-primary transition disabled:bg-muted disabled:text-muted-fg";
const labelCls =
  "block text-[10px] font-extrabold tracking-widest uppercase text-muted-fg mb-1";

function ProfileSecurityTab() {
  const currentId = useId();
  const newId = useId();
  const confirmId = useId();
  const errorId = useId();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPassword.length < 8) {
      setError("Password baru minimal 8 karakter.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Konfirmasi password tidak cocok.");
      return;
    }
    setSaving(true);
    try {
      await api.auth.changePassword({ currentPassword, newPassword });
      setSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Gagal mengubah password."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-card rounded-2xl border border-border p-4 space-y-4">
      {success && (
        <div className="flex items-center gap-2 bg-success bg-opacity-10 border border-success border-opacity-30 text-success rounded-xl px-3 py-2 text-sm font-medium">
          <CheckCircle className="w-4 h-4 shrink-0" />
          Password berhasil diubah.
        </div>
      )}
      {error && (
        <div
          id={errorId}
          role="alert"
          className="bg-destructive bg-opacity-10 border border-destructive border-opacity-30 text-destructive rounded-xl px-3 py-2 text-sm font-medium"
        >
          {error}
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label htmlFor={currentId} className={labelCls}>
            Password Saat Ini
          </label>
          <input
            id={currentId}
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className={inputCls}
            required
            autoComplete="current-password"
            placeholder="••••••••"
            aria-invalid={!!error}
            aria-describedby={error ? errorId : undefined}
          />
        </div>
        <div>
          <label htmlFor={newId} className={labelCls}>
            Password Baru
          </label>
          <input
            id={newId}
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className={inputCls}
            required
            autoComplete="new-password"
            placeholder="Minimal 8 karakter"
            minLength={8}
            aria-invalid={!!error}
            aria-describedby={error ? errorId : undefined}
          />
        </div>
        <div>
          <label htmlFor={confirmId} className={labelCls}>
            Konfirmasi Password Baru
          </label>
          <input
            id={confirmId}
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className={inputCls}
            required
            autoComplete="new-password"
            placeholder="Ulangi password baru"
            aria-invalid={!!error}
            aria-describedby={error ? errorId : undefined}
          />
        </div>
        <button
          type="submit"
          disabled={saving}
          className="w-full h-12 bg-primary text-primary-fg font-bold rounded-2xl hover:opacity-90 transition disabled:opacity-50 mt-1"
        >
          {saving ? "Menyimpan…" : "Ubah Password"}
        </button>
      </form>
    </div>
  );
}

function ProfileConfigTab() {
  return (
    <div className="bg-card rounded-2xl border border-border p-6 flex items-center justify-center min-h-[120px]">
      <p className="text-sm text-muted-fg italic text-center">
        Belum ada konfigurasi pengguna saat ini.
      </p>
    </div>
  );
}

export function ProfilePage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("ringkasan");

  return (
    <div className="min-h-screen bg-surface bg-dotted-overlay flex flex-col">
      <MobileAppBar title="Profil Saya" back onBack={() => navigate(-1)} />

      <div className="border-b border-border bg-card shrink-0">
        <div className="flex max-w-xl mx-auto w-full">
          <TabButton
            active={tab === "ringkasan"}
            onClick={() => setTab("ringkasan")}
          >
            Ringkasan
          </TabButton>
          <TabButton
            active={tab === "keamanan"}
            onClick={() => setTab("keamanan")}
          >
            Keamanan
          </TabButton>
          <TabButton
            active={tab === "konfigurasi"}
            onClick={() => setTab("konfigurasi")}
          >
            Konfigurasi
          </TabButton>
        </div>
      </div>

      <main
        id="main-content"
        className="flex-1 overflow-y-auto max-w-xl mx-auto w-full p-4 space-y-4"
      >
        {tab === "ringkasan" && <ProfileSummaryTab />}
        {tab === "keamanan" && <ProfileSecurityTab />}
        {tab === "konfigurasi" && <ProfileConfigTab />}
      </main>
    </div>
  );
}
