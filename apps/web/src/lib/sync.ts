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

  // Replace server-managed tables entirely so deletions propagate to IDB.
  // cards use bulkPut (upsert only) because they can be created offline.
  await Promise.all([
    idb.events.clear().then(() => idb.events.bulkPut(eventsRaw)),
    idb.paymentChannels.clear().then(() => idb.paymentChannels.bulkPut(channelsRaw)),
    idb.settings.clear().then(() =>
      idb.settings.bulkPut(
        Object.entries(settingsRaw).map(([key, value]) => ({ key, value }))
      )
    ),
    idb.users.clear().then(() => idb.users.bulkPut(usersRaw)),
    idb.cards.bulkPut(cardsRaw),
  ]);
}
