/** Unix seconds — matches server-side timestamp convention. */
export function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}
