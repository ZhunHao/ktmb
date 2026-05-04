import type { Result } from "../result.js";
import { err, ok } from "../result.js";
import type { TrainClass } from "../types.js";
import { searchKitsByGtfsCodes } from "./search-by-gtfs.js";

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

export const getAvailability = async (
  input: GetAvailabilityInput,
  opts: GetAvailabilityOptions = {},
): Promise<Result<TrainClass[]>> => {
  const search = await searchKitsByGtfsCodes(
    { from: input.from, to: input.to, date: input.date },
    opts.cookie ? { cookie: opts.cookie } : {},
  );
  if (!search.ok) return search;
  const { rows, client } = search.data;
  const train = rows.find((t) => t.trainNo === input.trainNo);
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
