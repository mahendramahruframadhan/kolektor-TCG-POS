import { create } from "zustand";
import type { IdbCard } from "../lib/db.js";

interface PosState {
  activeCartId: string | null;
  scannedCard: IdbCard | null;
  setActiveCartId: (id: string | null) => void;
  setScannedCard: (card: IdbCard | null) => void;
}

export const usePosStore = create<PosState>()((set) => ({
  activeCartId: null,
  scannedCard: null,
  setActiveCartId: (id) => set({ activeCartId: id }),
  setScannedCard: (card) => set({ scannedCard: card }),
}));
