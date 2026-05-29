import { useState, useEffect, useCallback, useRef } from "react";
import { useSyncStateStore } from "../store/sync-state.js";
import { classifyNetworkQuality } from "../lib/debug-utils.js";

const OFFLINE_THRESHOLD = 3; // consecutive failures = offline
const HEALTH_CHECK_INTERVAL_MS = 10000;
const HEALTH_CHECK_TIMEOUT_MS = 5000;

export interface ConnectionMonitorState {
  isOnline: boolean;
  isChecking: boolean;
  latency: number | null;
  consecutiveFailures: number;
  networkQuality: ReturnType<typeof classifyNetworkQuality>;
}

export function useConnectionMonitor() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const [isChecking, setIsChecking] = useState(false);
  const [latency, setLatency] = useState<number | null>(null);
  const [consecutiveFailures, setConsecutiveFailures] = useState(0);
  const [networkQuality, setNetworkQuality] = useState<
    ReturnType<typeof classifyNetworkQuality>
  >("unknown");

  const isCheckingRef = useRef(false);
  const consecutiveFailuresRef = useRef(0);

  const checkConnection = useCallback(async () => {
    if (isCheckingRef.current) return;
    isCheckingRef.current = true;
    setIsChecking(true);
    try {
      const start = performance.now();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS);
      const response = await fetch("/api/health", {
        method: "HEAD",
        cache: "no-cache",
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      const measuredLatency = Math.round(performance.now() - start);

      if (response.ok) {
        consecutiveFailuresRef.current = 0;
        setIsOnline(true);
        setLatency(measuredLatency);
        setConsecutiveFailures(0);
        setNetworkQuality(classifyNetworkQuality(measuredLatency));

        const { updateServerHealth } = useSyncStateStore.getState();
        updateServerHealth({
          online: true,
          latency: measuredLatency,
          timestamp: Date.now(),
        });
      } else {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (err) {
      const newCount = consecutiveFailuresRef.current + 1;
      consecutiveFailuresRef.current = newCount;
      setConsecutiveFailures(newCount);
      if (newCount >= OFFLINE_THRESHOLD) {
        setIsOnline(false);
        setLatency(null);
        setNetworkQuality("unknown");
      }

      const { updateServerHealth } = useSyncStateStore.getState();
      updateServerHealth({
        online: false,
        latency: null,
        timestamp: Date.now(),
        error: err instanceof Error ? err.message : "Network error",
      });
    } finally {
      setIsChecking(false);
      isCheckingRef.current = false;
    }
  }, []);

  useEffect(() => {
    function handleOnline() {
      // Browser says online, but verify with server
      checkConnection();
    }

    function handleOffline() {
      setIsOnline(false);
      setLatency(null);
      setNetworkQuality("unknown");
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Periodic health check every 10 seconds
    const interval = setInterval(() => {
      checkConnection();
    }, HEALTH_CHECK_INTERVAL_MS);

    // Initial check
    checkConnection();

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      clearInterval(interval);
    };
  }, [checkConnection]);

  return { isOnline, isChecking, latency, consecutiveFailures, networkQuality, checkConnection };
}
