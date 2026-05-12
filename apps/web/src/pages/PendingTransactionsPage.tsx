import { useState } from "react";
import { Link } from "react-router-dom";
import { usePendingTransactions } from "../hooks/usePendingTransactions.js";
import { formatCurrency } from "../lib/format.js";
import { formatTimestamp } from "../lib/time.js";

export function PendingTransactionsPage() {
  const { data, isLoading, error, refetch } = usePendingTransactions();
  const [filterStatus, setFilterStatus] = useState<"all" | "sale" | "void" | "refund">("all");

  const filteredTransactions = data?.transactions.filter((tx) => {
    if (filterStatus === "all") return true;
    return tx.kind === filterStatus;
  }) ?? [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Memuat...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 text-destructive">
          Gagal memuat transaksi: {error.message}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Transaksi Pending</h1>
          <p className="text-muted-foreground">Lihat semua transaksi dari kasir</p>
        </div>
        <button
          onClick={() => refetch()}
          className="px-4 py-2 bg-primary text-primary-fg rounded-lg hover:opacity-90"
        >
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-card border rounded-lg p-4">
          <div className="text-sm text-muted-foreground">Total Transaksi</div>
          <div className="text-2xl font-bold">{data?.totalCount ?? 0}</div>
        </div>
        <div className="bg-card border rounded-lg p-4">
          <div className="text-sm text-muted-foreground">Transaksi Sale</div>
          <div className="text-2xl font-bold">{data?.stats.totalPending ?? 0}</div>
        </div>
        <div className="bg-card border rounded-lg p-4">
          <div className="text-sm text-muted-foreground">Total Amount</div>
          <div className="text-2xl font-bold">{formatCurrency(data?.stats.totalAmount ?? 0)}</div>
        </div>
      </div>

      {data?.stats.byCashier && data.stats.byCashier.length > 0 && (
        <div className="bg-card border rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-4">Per Kasir</h2>
          <div className="space-y-2">
            {data.stats.byCashier.map((cashier) => (
              <div key={cashier.cashierId} className="flex justify-between items-center">
                <span className="text-sm">{cashier.cashierDisplayName}</span>
                <span className="text-sm font-medium">
                  {cashier.count} transaksi · {formatCurrency(cashier.amount)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-2">
        {(["all", "sale", "void", "refund"] as const).map((status) => (
          <button
            key={status}
            onClick={() => setFilterStatus(status)}
            className={`px-4 py-2 rounded-lg ${
              filterStatus === status
                ? "bg-primary text-primary-fg"
                : "bg-muted hover:bg-muted/80"
            }`}
          >
            {status === "all" ? "Semua" : status.charAt(0).toUpperCase() + status.slice(1)}
          </button>
        ))}
      </div>

      <div className="bg-card border rounded-lg overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-left p-3">Tanggal</th>
              <th className="text-left p-3">Kasir</th>
              <th className="text-left p-3">Event</th>
              <th className="text-left p-3">Items</th>
              <th className="text-right p-3">Total</th>
              <th className="text-left p-3">Pembayaran</th>
              <th className="text-left p-3">Jenis</th>
              <th className="text-center p-3">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {filteredTransactions.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center p-8 text-muted-foreground">
                  Tidak ada transaksi
                </td>
              </tr>
            ) : (
              filteredTransactions.map((tx) => (
                <tr key={tx.id} className="border-b hover:bg-muted/30">
                  <td className="p-3 text-sm">{formatTimestamp(tx.createdAt)}</td>
                  <td className="p-3">
                    <div className="font-medium">{tx.cashierDisplayName}</div>
                    <div className="text-xs text-muted-foreground">{tx.cashierEmail}</div>
                  </td>
                  <td className="p-3 text-sm">{tx.eventName}</td>
                  <td className="p-3 text-center">{tx.itemCount}</td>
                  <td className="p-3 text-right font-medium">{formatCurrency(tx.totalIdr)}</td>
                  <td className="p-3 text-sm">{tx.paymentChannel}</td>
                  <td className="p-3">
                    <span
                      className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                        tx.kind === "sale"
                          ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100"
                          : tx.kind === "void"
                            ? "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100"
                            : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100"
                      }`}
                    >
                      {tx.kind}
                    </span>
                  </td>
                  <td className="p-3 text-center">
                    <Link
                      to={`/transactions/${tx.id}`}
                      className="text-primary hover:underline text-sm"
                    >
                      Detail
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}