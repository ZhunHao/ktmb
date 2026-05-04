import { err } from "../result.js";
import type { Result } from "../result.js";
import { KitsClient, type KitsClientOptions } from "./kits-client.js";
import type { TripListingRow } from "./parse-trip-listing.js";
import { resolveKitsStationId } from "./station-map.js";

export type SearchKitsByGtfsCodesInput = {
  from: string; // GTFS stop_id
  to: string;   // GTFS stop_id
  date: string; // YYYY-MM-DD
  pax?: number;
};

export type SearchKitsByGtfsCodesResult = {
  rows: readonly TripListingRow[];
  /**
   * The KitsClient used for this search, retained so callers can chain
   * `getLayout()` against the same session. KITS state (cookies, searchData)
   * lives on this instance — do not share it across unrelated requests.
   */
  client: KitsClient;
};

/**
 * Run the public KITS search pipeline (catalog → resolve from/to → /Trip/Trip)
 * keyed by GTFS stop_ids. Returns the listing rows plus the live KitsClient so
 * the caller can optionally call `client.getLayout()` against the same session.
 *
 * Each invocation builds a fresh KitsClient — safe to call concurrently.
 */
export const searchKitsByGtfsCodes = async (
  input: SearchKitsByGtfsCodesInput,
  opts: KitsClientOptions = {},
): Promise<Result<SearchKitsByGtfsCodesResult>> => {
  const client = new KitsClient(opts);
  const catalog = await client.getStationCatalog();
  if (!catalog.ok) return catalog;

  // GTFS callers pass stop_id in `from`/`to`. We feed it as both stopId and
  // stopName so the resolver can fall through alias map → name match → id
  // match without a separate name-lookup contract.
  const fromKits = resolveKitsStationId(catalog.data, {
    stopId: input.from,
    stopName: input.from,
  });
  const toKits = resolveKitsStationId(catalog.data, {
    stopId: input.to,
    stopName: input.to,
  });
  if (!fromKits || !toKits) {
    return err(
      "not_found",
      `no KITS station mapped for GTFS pair ${input.from}/${input.to}`,
    );
  }

  const search = await client.searchTrips({
    fromKitsId: fromKits,
    toKitsId: toKits,
    date: input.date,
    ...(input.pax !== undefined ? { pax: input.pax } : {}),
  });
  if (!search.ok) return search;
  return { ok: true, data: { rows: search.data, client } };
};
