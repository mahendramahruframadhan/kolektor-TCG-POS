import { useSyncStateStore } from "../store/sync-state.js";

const FONT_CACHE_KEY = "kolekta-fonts-cache";
const FONTS_TO_CACHE = [
  "IBM Plex Mono",
  "IBM Plex Sans",
];

export async function loadFontsWithFallback(): Promise<void> {
  const isOnline = useSyncStateStore.getState().effectiveIsOnline;
  
  if (isOnline) {
    try {
      // Try to cache fonts when online
      await cacheFonts();
      return;
    } catch (e) {
      // Fall through to loading from cache
    }
  }
  
  // Load from cache when offline or if caching failed
  loadCachedFonts();
}

export async function cacheFonts(): Promise<void> {
  if (typeof document === "undefined") return;
  
  const fontFaceSet = document.fonts;
  if (!fontFaceSet) return;
  
  // Check if fonts are already loaded
  const isLoaded = await fontFaceSet.ready.then(() => 
    FONTS_TO_CACHE.every(font => fontFaceSet.check("IBM Plex Sans", 400))
  );
  
  if (isLoaded && typeof localStorage !== "undefined") {
    // Store a marker that fonts were cached
    localStorage.setItem(FONT_CACHE_KEY, Date.now().toString());
  }
}

function loadCachedFonts(): void {
  // This is handled by CSS @font-face fallback automatically
  // When Google Fonts fails to load, browser uses local system fonts
  // CSS font-family has fallback: 'IBM Plex Sans', system-ui, sans-serif
}

export function getFontFamilyWithFallback(fontName: string, fallback: string): string {
  const isOnline = useSyncStateStore.getState().effectiveIsOnline;
  
  if (isOnline) {
    return fontName;
  }
  
  // When offline, use system fonts as fallback
  return fallback;
}