import { z } from "zod";
import type { Ktmb } from "../../core/index.js";
import { parseDateMyt } from "../../core/time/parse-date.js";
import { mcpError, mcpJson, resolveStation } from "./_shared.js";

export const GetFareAvailabilityInput = z.object({
  from: z.string(),
  to: z.string(),
  date: z.string(),
  trainNo: z.string(),
});
export type GetFareAvailabilityArgs = z.infer<typeof GetFareAvailabilityInput>;

export const getFareAvailabilityHandler =
  (ktmb: Ktmb) =>
  async (args: GetFareAvailabilityArgs) => {
    const fromCode = resolveStation(ktmb, args.from);
    const toCode = resolveStation(ktmb, args.to);
    if (!fromCode || !toCode) return mcpError("not_found", "station not resolved");
    const d = parseDateMyt(args.date);
    if (!d.ok) return mcpJson(d);
    return mcpJson(
      await ktmb.fares.get({
        from: fromCode,
        to: toCode,
        date: d.data,
        trainNo: args.trainNo,
      }),
    );
  };
