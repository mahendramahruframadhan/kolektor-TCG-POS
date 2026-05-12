/** Unix seconds — matches server-side timestamp convention. */
export function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

export function formatTimestamp(ts: number): string {
  return new Date(ts * 1000).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
