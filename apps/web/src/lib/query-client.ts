import { QueryClient } from "@tanstack/react-query";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { persistQueryClient } from "@tanstack/react-query-persist-client";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      gcTime: 24 * 60 * 60 * 1000, // 24h
      retry: 1,
    },
  },
});

// Persist TanStack Query cache to localStorage so it survives page reloads
const persister = createSyncStoragePersister({
  storage: typeof window !== "undefined" ? window.localStorage : undefined,
  key: "kolekta-query-cache",
  throttleTime: 1000,
});

persistQueryClient({ queryClient, persister, maxAge: 24 * 60 * 60 * 1000 });
