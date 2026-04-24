import { useState, useRef, useCallback, useEffect } from "react";

const DEFAULT_HOLD_MS = 5000;
const AUTOHIDE_MS = 3000;

export function useTapHoldReveal(holdMs: number = DEFAULT_HOLD_MS) {
  const [revealed, setRevealed] = useState(false);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearAllTimers = () => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  };

  const startReveal = useCallback(() => {
    clearAllTimers();
    holdTimerRef.current = setTimeout(() => {
      setRevealed(true);
      hideTimerRef.current = setTimeout(() => setRevealed(false), AUTOHIDE_MS);
    }, holdMs);
  }, [holdMs]);

  const endReveal = useCallback(() => {
    // If released before the hold timer elapsed, cancel the pending reveal.
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }, []);

  const clearReveal = useCallback(() => {
    clearAllTimers();
    setRevealed(false);
  }, []);

  useEffect(() => {
    return () => clearAllTimers();
  }, []);

  return { revealed, startReveal, endReveal, clearReveal };
}
