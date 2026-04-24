import React, { createContext, useContext } from "react";
import { useMasked } from "./useMasked.js";

interface MaskedScopeValue {
  revealed: boolean;
  toggle: () => void;
}

const MaskedScopeContext = createContext<MaskedScopeValue | null>(null);

/**
 * Wrap a page/section so every `MaskedAmount` inside shares a single
 * reveal/hide state. Replaces per-row masking with scope-level masking.
 */
export function MaskedScopeProvider({
  autoHideMs,
  children,
}: {
  autoHideMs?: number;
  children: React.ReactNode;
}) {
  const { revealed, toggle } = useMasked(autoHideMs);
  return (
    <MaskedScopeContext.Provider value={{ revealed, toggle }}>
      {children}
    </MaskedScopeContext.Provider>
  );
}

/** Returns the nearest MaskedScope state, or `null` if not inside a provider. */
export function useMaskedScope(): MaskedScopeValue | null {
  return useContext(MaskedScopeContext);
}
