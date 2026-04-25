import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { useSyncStateStore } from "../store/sync-state.js";
import { OfflineModeGuard } from "./OfflineModeGuard.js";

beforeEach(() => {
  useSyncStateStore.setState({ effectiveIsOnline: true });
});

const Child = () => <div>konten halaman</div>;

describe("OfflineModeGuard", () => {
  it("safe: render children saat online", () => {
    render(<OfflineModeGuard offlineMode="safe"><Child /></OfflineModeGuard>);
    expect(screen.getByText("konten halaman")).toBeInTheDocument();
  });

  it("safe: render children saat offline (tidak ada gate)", () => {
    useSyncStateStore.setState({ effectiveIsOnline: false });
    render(<OfflineModeGuard offlineMode="safe"><Child /></OfflineModeGuard>);
    expect(screen.getByText("konten halaman")).toBeInTheDocument();
  });

  it("partial: render children + banner saat offline", () => {
    useSyncStateStore.setState({ effectiveIsOnline: false });
    render(<OfflineModeGuard offlineMode="partial"><Child /></OfflineModeGuard>);
    expect(screen.getByText("konten halaman")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("partial: tidak tampilkan banner saat online", () => {
    render(<OfflineModeGuard offlineMode="partial"><Child /></OfflineModeGuard>);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("blocked: render OfflineBlockedState saat offline (bukan children)", () => {
    useSyncStateStore.setState({ effectiveIsOnline: false });
    render(<OfflineModeGuard offlineMode="blocked"><Child /></OfflineModeGuard>);
    expect(screen.queryByText("konten halaman")).not.toBeInTheDocument();
    expect(screen.getByRole("heading")).toBeInTheDocument();
  });

  it("blocked: render children saat online", () => {
    render(<OfflineModeGuard offlineMode="blocked"><Child /></OfflineModeGuard>);
    expect(screen.getByText("konten halaman")).toBeInTheDocument();
  });
});
