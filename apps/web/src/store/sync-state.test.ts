import { describe, it, expect, beforeEach, vi } from "vitest";

const mockStorage: Record<string, string> = {};
vi.stubGlobal("localStorage", {
  getItem: (k: string) => mockStorage[k] ?? null,
  setItem: (k: string, v: string) => { mockStorage[k] = v; },
  removeItem: (k: string) => { delete mockStorage[k]; },
});

import { useSyncStateStore } from "./sync-state.js";

beforeEach(() => {
  Object.keys(mockStorage).forEach(k => delete mockStorage[k]);
  useSyncStateStore.setState({
    state: "online",
    networkMode: "auto",
    effectiveIsOnline: true,
    lastError: null,
    lastSyncAt: null,
    pendingTransactionCount: 0,
  });
});

describe("effectiveIsOnline", () => {
  it("true ketika auto dan state online", () => {
    expect(useSyncStateStore.getState().effectiveIsOnline).toBe(true);
  });

  it("false ketika force-offline meski state online", () => {
    useSyncStateStore.getState().setNetworkMode("force-offline");
    expect(useSyncStateStore.getState().effectiveIsOnline).toBe(false);
  });

  it("false ketika auto dan state offline", () => {
    useSyncStateStore.getState().setState("offline");
    expect(useSyncStateStore.getState().effectiveIsOnline).toBe(false);
  });

  it("true kembali ketika mode kembali ke auto dan state online", () => {
    useSyncStateStore.getState().setNetworkMode("force-offline");
    useSyncStateStore.setState({ state: "online" });
    useSyncStateStore.getState().setNetworkMode("auto");
    expect(useSyncStateStore.getState().effectiveIsOnline).toBe(true);
  });
});

describe("setNetworkMode", () => {
  it("persist ke localStorage", () => {
    useSyncStateStore.getState().setNetworkMode("force-offline");
    expect(localStorage.getItem("kolekta-network-mode")).toBe("force-offline");
  });

  it("update networkMode di store", () => {
    useSyncStateStore.getState().setNetworkMode("force-offline");
    expect(useSyncStateStore.getState().networkMode).toBe("force-offline");
  });
});

describe("setPendingTransactionCount", () => {
  it("update count di store", () => {
    useSyncStateStore.getState().setPendingTransactionCount(3);
    expect(useSyncStateStore.getState().pendingTransactionCount).toBe(3);
  });
});
