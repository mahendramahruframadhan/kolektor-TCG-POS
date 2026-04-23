import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTapHoldReveal } from "./useTapHoldReveal.js";

describe("useTapHoldReveal", () => {
  it("starts revealed on startReveal", () => {
    const { result } = renderHook(() => useTapHoldReveal(100));
    expect(result.current.revealed).toBe(false);
    act(() => result.current.startReveal());
    expect(result.current.revealed).toBe(true);
  });

  it("auto-hides after hold duration", async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useTapHoldReveal(100));
    act(() => result.current.startReveal());
    expect(result.current.revealed).toBe(true);
    act(() => vi.advanceTimersByTime(150));
    expect(result.current.revealed).toBe(false);
    vi.useRealTimers();
  });

  it("hides immediately on clearReveal", () => {
    const { result } = renderHook(() => useTapHoldReveal(5000));
    act(() => result.current.startReveal());
    expect(result.current.revealed).toBe(true);
    act(() => result.current.clearReveal());
    expect(result.current.revealed).toBe(false);
  });
});
