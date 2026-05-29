import { useState, useEffect, useCallback } from "react";

export function useConnectionMonitor() {
  const [isOnline, setIsOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  const [isChecking, setIsChecking] = useState(false);

  const checkConnection = useCallback(async () => {
    if (isChecking) return;
    setIsChecking(true);
    try {
      const response = await fetch("/api/health", { method: "HEAD", cache: "no-cache" });
      setIsOnline(response.ok);
    } catch {
      setIsOnline(false);
    } finally {
      setIsChecking(false);
    }
  }, [isChecking]);

  useEffect(() => {
    function handleOnline() {
      setIsOnline(true);
    }

    function handleOffline() {
      setIsOnline(false);
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Periodic ping check every 10 seconds
    const interval = setInterval(() => {
      checkConnection();
    }, 10000);

    // Initial check
    checkConnection();

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      clearInterval(interval);
    };
  }, [checkConnection]);

  return { isOnline, isChecking, checkConnection };
}