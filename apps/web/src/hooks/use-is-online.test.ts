import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSyncStateStore } from "../store/sync-state.js";
import { useIsOnline } from "./use-is-online.js";

beforeEach(() => {
  useSyncStateStore.setState({ effectiveIsOnline: true });
});

describe("useIsOnline", () => {
  it("returns true ketika effectiveIsOnline true", () => {
    const { result } = renderHook(() => useIsOnline());
    expect(result.current).toBe(true);
  });

  it("returns false ketika effectiveIsOnline false", () => {
    act(() => useSyncStateStore.setState({ effectiveIsOnline: false }));
    const { result } = renderHook(() => useIsOnline());
    expect(result.current).toBe(false);
  });

  it("re-render saat effectiveIsOnline berubah", () => {
    const { result, rerender } = renderHook(() => useIsOnline());
    expect(result.current).toBe(true);
    act(() => useSyncStateStore.setState({ effectiveIsOnline: false }));
    rerender();
    expect(result.current).toBe(false);
  });
});
