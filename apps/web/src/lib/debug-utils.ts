/**
 * Debug utility functions for the offline mode debug panel.
 */

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return `${seconds} detik yang lalu`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} menit yang lalu`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} jam yang lalu`;
  const days = Math.floor(hours / 24);
  return `${days} hari yang lalu`;
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return email;
  const maskedLocal = local.length > 2
    ? `${local.slice(0, 2)}***${local.slice(-1)}`
    : "***";
  return `${maskedLocal}@${domain}`;
}

export function getLocalStorageSize(key: string): number {
  try {
    const value = localStorage.getItem(key);
    if (!value) return 0;
    // Approximate size in bytes (2 bytes per char for UTF-16)
    return value.length * 2;
  } catch {
    return 0;
  }
}

export function getLocalStorageSummary(): {
  totalSize: number;
  itemCount: number;
  items: Array<{ key: string; size: number; lastUpdated?: number }>;
} {
  const items: Array<{ key: string; size: number; lastUpdated?: number }> = [];
  let totalSize = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      const size = getLocalStorageSize(key);
      totalSize += size;
      items.push({ key, size });
    }
  } catch {
    // localStorage may be inaccessible
  }
  return { totalSize, itemCount: items.length, items };
}

export function classifyNetworkQuality(latency: number | null): "excellent" | "good" | "fair" | "poor" | "unknown" {
  if (latency === null) return "unknown";
  if (latency < 100) return "excellent";
  if (latency < 300) return "good";
  if (latency < 1000) return "fair";
  return "poor";
}

export function qualityLabel(q: ReturnType<typeof classifyNetworkQuality>): string {
  switch (q) {
    case "excellent": return "Sangat Baik";
    case "good": return "Baik";
    case "fair": return "Cukup";
    case "poor": return "Buruk";
    case "unknown": return "Tidak Diketahui";
  }
}

export function qualityColor(q: ReturnType<typeof classifyNetworkQuality>): string {
  switch (q) {
    case "excellent": return "text-green-600 bg-green-50";
    case "good": return "text-emerald-600 bg-emerald-50";
    case "fair": return "text-yellow-600 bg-yellow-50";
    case "poor": return "text-red-600 bg-red-50";
    case "unknown": return "text-gray-600 bg-gray-50";
  }
}
