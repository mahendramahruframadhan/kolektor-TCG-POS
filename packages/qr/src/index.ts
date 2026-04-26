/**
 * Short card ID utilities (PRD §8)
 *
 * Format: O-XXXXX
 *   O     — single base-36 char representing owner index
 *             0-9  → '0'-'9'
 *             10   → 'A'
 *   XXXXX — 5 base-36 random chars (uppercase)
 *
 * Total: 7 chars, uppercase, fits QR Version 1 alphanumeric EC-H.
 */

const BASE36_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** Convert a base-36 digit index (0-35) to its character. */
function toBase36Char(n: number): string {
  const ch = BASE36_CHARS[n];
  if (ch === undefined) throw new RangeError(`Base-36 index out of range: ${n}`);
  return ch;
}

/**
 * Map an owner index to the owner prefix character.
 * Indices 0-9  → '0'-'9'
 * Index 10     → 'A'
 */
function ownerChar(ownerIndex: number): string {
  if (ownerIndex < 0 || ownerIndex > 10) {
    throw new RangeError(`ownerIndex must be 0-10, got ${ownerIndex}`);
  }
  return toBase36Char(ownerIndex);
}

/**
 * Generate a random 5-character uppercase base-36 string.
 */
function randomBase36x5(): string {
  const bytes = new Uint8Array(5);
  crypto.getRandomValues(bytes);
  let result = "";
  for (const byte of bytes) {
    result += toBase36Char(byte % 36);
  }
  return result;
}

/**
 * Generate one short ID in O-XXXXX format.
 *
 * @param ownerIndex  0-10 (0-9 map to '0'-'9', 10 maps to 'A')
 */
export function generateShortId(ownerIndex: number): string {
  return `${ownerChar(ownerIndex)}-${randomBase36x5()}`;
}

/** Regex for a valid short ID: one alphanumeric owner char, hyphen, five alphanumeric chars. */
const SHORT_ID_RE = /^[0-9A-Z]-[0-9A-Z]{5}$/;

/**
 * Validate that a string is a properly-formatted short card ID.
 */
export function isValidShortId(id: string): boolean {
  return SHORT_ID_RE.test(id);
}
