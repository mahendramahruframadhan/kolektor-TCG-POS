import { useState, useRef, useCallback, useEffect } from "react";

const DEFAULT_HOLD_MS = 5000;

export function useTapHoldReveal(holdMs: number = DEFAULT_HOLD_MS) {
  const [revealed, setRevealed] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartRef = useRef<number>(0);

  const startReveal = useCallback(() => {
    setRevealed(true);
    touchStartRef.current = Date.now();
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setRevealed(false);
    }, holdMs);
  }, [holdMs]);

  const endReveal = useCallback(() => {
    const held = Date.now() - touchStartRef.current;
    // If tapped quickly (< 300ms), hide immediately on release
    // If held longer, let the timer auto-hide
    if (held < 300) {
      if (timerRef.current) clearTimeout(timerRef.current);
      setRevealed(false);
    }
  }, []);

  const clearReveal = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setRevealed(false);
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return { revealed, startReveal, endReveal, clearReveal };
}
