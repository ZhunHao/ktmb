import type { Result } from "../result.js";
import { err, ok } from "../result.js";
import type { TrainClass } from "../types.js";
import { KtmbAvailabilityResponseSchema } from "./types.js";

const toMinor = (
  price: number,
  currency: string,
): { priceMinor: number; currency: "MYR" | "SGD" } => {
  const cur = currency === "SGD" ? "SGD" : "MYR";
  return { priceMinor: Math.round(price * 100), currency: cur };
};

export const parseAvailabilityResponse = (raw: unknown): Result<TrainClass[]> => {
  const parsed = KtmbAvailabilityResponseSchema.safeParse(raw);
  if (!parsed.success) {
    return err("parse_error", "unexpected KTMB availability shape", parsed.error.issues);
  }
  const out: TrainClass[] = parsed.data.classes.map((c) => {
    const minor = toMinor(c.price, c.currency);
    return {
      className: c.name,
      fare: {
        className: c.name,
        priceMinor: minor.priceMinor,
        currency: minor.currency,
        seatsLeft: c.seats ?? null,
      },
    };
  });
  return ok(out);
};
