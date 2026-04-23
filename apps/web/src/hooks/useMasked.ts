import { useState, useCallback, useRef } from "react";

/**
 * Masked number reveal — eye-icon tap reveals value, long-press (5s default)
 * auto-hides. PRD §9.1 / §3 R3.
 */
export function useMasked(autoHideMs = 5000) {
  const [revealed, setRevealed] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reveal = useCallback(() => {
    setRevealed(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setRevealed(false), autoHideMs);
  }, [autoHideMs]);

  const hide = useCallback(() => {
    setRevealed(false);
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const toggle = useCallback(() => {
    if (revealed) hide();
    else reveal();
  }, [revealed, reveal, hide]);

  return { revealed, reveal, hide, toggle };
}
