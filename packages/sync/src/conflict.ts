/**
 * Conflict resolution rules (PRD §16.3).
 *
 * Each scenario has a deterministic server-side resolution:
 *
 * | Scenario | Resolution |
 * |----------|------------|
 * | Two devices intake same short_id | Server accepts first-write (by server_received_at), rejects second |
 * | Two devices edit same card metadata | Optimistic concurrency: higher-version write wins |
 * | Both online, one locks card X in cart | No conflict: second device sees lock on next sync |
 * | Both offline, both add card X to separate carts, both sync | Server accepts first cart_item by server_received_at, rejects second |
 * | Both offline, both complete sale of card X | R5: both sales accepted (append-only), card flagged oversold |
 * | Hold placed offline on card sold offline | Hold accepted but tagged stale_hold |
 * | Cart TTL expired while device offline | Client receives abandon notice on next pull |
 */

export type ConflictScenario =
  | "duplicate_short_id"
  | "stale_card_version"
  | "cart_item_already_locked"
  | "oversold"
  | "stale_hold"
  | "cart_expired";

export interface ConflictResolution {
  scenario: ConflictScenario;
  action: "reject" | "accept_with_flag" | "accept_both";
  clientMessage: string; // Bahasa Indonesia for cashier
  requiresAdminAction: boolean;
}

export const CONFLICT_RESOLUTIONS: Record<ConflictScenario, ConflictResolution> = {
  duplicate_short_id: {
    scenario: "duplicate_short_id",
    action: "reject",
    clientMessage: "ID kartu sudah digunakan. Cetak ulang label.",
    requiresAdminAction: false,
  },
  stale_card_version: {
    scenario: "stale_card_version",
    action: "reject",
    clientMessage: "Data kartu telah diperbarui di perangkat lain. Muat ulang.",
    requiresAdminAction: false,
  },
  cart_item_already_locked: {
    scenario: "cart_item_already_locked",
    action: "reject",
    clientMessage: "Kartu sudah di keranjang pengguna lain — item dihapus dari keranjang Anda.",
    requiresAdminAction: false,
  },
  oversold: {
    scenario: "oversold",
    action: "accept_both",
    clientMessage: "Kartu terjual di dua perangkat sekaligus. Periksa antrian admin.",
    requiresAdminAction: true,
  },
  stale_hold: {
    scenario: "stale_hold",
    action: "accept_with_flag",
    clientMessage: "Kartu sudah terjual saat hold dibuat.",
    requiresAdminAction: false,
  },
  cart_expired: {
    scenario: "cart_expired",
    action: "reject",
    clientMessage: "Keranjang kadaluarsa. Mulai ulang transaksi.",
    requiresAdminAction: false,
  },
};

/**
 * Detect if two transaction_items represent an oversold scenario:
 * same card_id, both kind='sale', no intervening void.
 */
export function isOversold(
  existingSaleCardIds: Set<string>,
  newSaleCardIds: string[]
): string[] {
  return newSaleCardIds.filter((id) => existingSaleCardIds.has(id));
}
