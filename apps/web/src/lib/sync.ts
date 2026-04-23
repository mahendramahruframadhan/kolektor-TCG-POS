import { idb } from "./db.js";
import { api } from "./api.js";
import type {
  IdbEvent,
  IdbPaymentChannel,
  IdbSetting,
  IdbUser,
  IdbCard,
} from "./db.js";

/**
 * Initial pull: fetches all reference data from the server and persists to IDB.
 * Must be called after login (or when IDB is empty). Subsequent background syncs
 * will use the delta-sync endpoint (not yet implemented — this is the full pull).
 */
export async function fetchAndSync(): Promise<void> {
  const [eventsRaw, channelsRaw, settingsRaw, usersRaw, cardsRaw] =
    await Promise.all([
      api.events.list() as Promise<IdbEvent[]>,
      api.paymentChannels.list() as Promise<IdbPaymentChannel[]>,
      api.settings.get() as Promise<Record<string, unknown>>,
      api.users.list() as Promise<IdbUser[]>,
      api.cards.list() as Promise<IdbCard[]>,
    ]);

  // Persist in parallel using bulkPut (upsert semantics)
  await Promise.all([
    idb.events.bulkPut(eventsRaw),
    idb.paymentChannels.bulkPut(channelsRaw),
    idb.settings.bulkPut(
      Object.entries(settingsRaw).map(([key, value]) => ({ key, value }))
    ),
    idb.users.bulkPut(usersRaw),
    idb.cards.bulkPut(cardsRaw),
  ]);
}
