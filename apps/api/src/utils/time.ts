/** Unix seconds — the timestamp unit used across every schema column and sync cursor. */
export function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}
