import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api.js";
import { useAuthStore } from "../store/auth.js";

export function usePendingTransactions() {
  return useQuery({
    queryKey: ["admin", "pending-transactions"],
    queryFn: () => api.admin.pendingTransactions(),
    refetchInterval: 30000,
  });
}

export function usePendingTransactionDetail(transactionId: string) {
  return useQuery({
    queryKey: ["admin", "pending-transactions", transactionId],
    queryFn: () => api.admin.pendingTransactionDetail(transactionId),
    enabled: !!transactionId,
  });
}

export function usePendingTransactionCount() {
  const { data } = usePendingTransactions();
  return data?.stats.totalPending ?? 0;
}

export function usePendingTransactionAmount() {
  const { data } = usePendingTransactions();
  return data?.stats.totalAmount ?? 0;
}