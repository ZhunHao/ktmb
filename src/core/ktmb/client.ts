import type { Result } from "../result.js";
import { err, ok } from "../result.js";
import type { TrainClass } from "../types.js";
import { KitsClient } from "./kits-client.js";

export type GetAvailabilityInput = {
  from: string;       // GTFS stop_id (current contract)
  to: string;         // GTFS stop_id
  date: string;       // YYYY-MM-DD
  trainNo: string;
};

export type GetAvailabilityOptions = {
  /**
   * Optional KITS session cookie. When supplied, the client falls through to
   * the authenticated /Trip/LayoutV2 endpoint to return per-class fares with
   * OKU/priority seats excluded. When absent, only the public listing is used
   * and `seatsLeftIncludesPriority` is `true` on each returned fare.
   *
   * Format: a complete `Cookie:` header value captured from a logged-in
   * browser session, e.g. ".AspNetCore.Identity.Application=...; X-CSRF=...".
   */
  cookie?: string;
};

const KITS_BY_GTFS: Record<string, string> = {
  KUL: "19100",
  BTW: "100",
};

const resolveKits = (gtfsId: string): string | undefined =>
  KITS_BY_GTFS[gtfsId.toUpperCase()];

export const getAvailability = async (
  input: GetAvailabilityInput,
  opts: GetAvailabilityOptions = {},
): Promise<Result<TrainClass[]>> => {
  const fromKits = resolveKits(input.from);
  const toKits = resolveKits(input.to);
  if (!fromKits || !toKits) {
    return err(
      "not_found",
      `no KITS station mapped for GTFS pair ${input.from}/${input.to}`,
    );
  }
  const client = opts.cookie
    ? new KitsClient({ cookie: opts.cookie })
    : new KitsClient();
  const search = await client.searchTrips({
    fromKitsId: fromKits,
    toKitsId: toKits,
    date: input.date,
  });
  if (!search.ok) return search;
  const train = search.data.find((t) => t.trainNo === input.trainNo);
  if (!train) return err("not_found", `train ${input.trainNo} not found in KITS listing`);

  if (!opts.cookie) {
    const cls: TrainClass = {
      className: train.service,
      fare: {
        className: train.service,
        priceMinor: train.minFareMinor,
        currency: "MYR",
        seatsLeft: train.seatsAvailable,
        seatsLeftIncludesPriority: true,
      },
    };
    return ok([cls]);
  }

  const layout = await client.getLayout({ tripData: train.tripData });
  if (!layout.ok) return layout;
  const out: TrainClass[] = layout.data.classes.map((c) => ({
    className: c.className,
    fare: {
      className: c.className,
      priceMinor: c.priceMinor,
      currency: layout.data.currency,
      seatsLeft: c.seatsLeft,
      seatsLeftIncludesPriority: false,
    },
  }));
  return ok(out);
};
