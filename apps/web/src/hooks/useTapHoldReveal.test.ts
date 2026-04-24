import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTapHoldReveal } from "./useTapHoldReveal.js";

describe("useTapHoldReveal", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not reveal on pointer-down", () => {
    const { result } = renderHook(() => useTapHoldReveal(1000));
    act(() => result.current.startReveal());
    expect(result.current.revealed).toBe(false);
  });

  it("does not reveal if pointer released before holdMs", () => {
    const { result } = renderHook(() => useTapHoldReveal(1000));
    act(() => result.current.startReveal());
    act(() => vi.advanceTimersByTime(500));
    act(() => result.current.endReveal());
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.revealed).toBe(false);
  });

  it("reveals after pointer held for full holdMs", () => {
    const { result } = renderHook(() => useTapHoldReveal(1000));
    act(() => result.current.startReveal());
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.revealed).toBe(true);
  });

  it("auto-hides after an additional AUTOHIDE_MS once revealed", () => {
    const { result } = renderHook(() => useTapHoldReveal(1000));
    act(() => result.current.startReveal());
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.revealed).toBe(true);
    act(() => vi.advanceTimersByTime(3000));
    expect(result.current.revealed).toBe(false);
  });

  it("clearReveal resets to hidden", () => {
    const { result } = renderHook(() => useTapHoldReveal(500));
    act(() => result.current.startReveal());
    act(() => vi.advanceTimersByTime(500));
    expect(result.current.revealed).toBe(true);
    act(() => result.current.clearReveal());
    expect(result.current.revealed).toBe(false);
  });
});
