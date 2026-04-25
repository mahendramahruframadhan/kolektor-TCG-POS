import { create } from "zustand";
import type { IdbCard } from "../lib/db.js";

interface PosState {
  activeCartId: string | null;
  activeCartIsOffline: boolean;
  scannedCard: IdbCard | null;
  setActiveCartId: (id: string | null) => void;
  setActiveCartIsOffline: (v: boolean) => void;
  setScannedCard: (card: IdbCard | null) => void;
}

export const usePosStore = create<PosState>()((set) => ({
  activeCartId: null,
  activeCartIsOffline: false,
  scannedCard: null,
  setActiveCartId: (id) => set({ activeCartId: id }),
  setActiveCartIsOffline: (activeCartIsOffline) => set({ activeCartIsOffline }),
  setScannedCard: (card) => set({ scannedCard: card }),
}));
