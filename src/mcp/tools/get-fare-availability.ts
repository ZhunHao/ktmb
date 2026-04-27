import { z } from "zod";
import type { Ktmb } from "../../core/index.js";
import { parseDateMyt } from "../../core/time/parse-date.js";

export const GetFareAvailabilityInput = z.object({
  from: z.string(),
  to: z.string(),
  date: z.string(),
  trainNo: z.string(),
});
export type GetFareAvailabilityArgs = z.infer<typeof GetFareAvailabilityInput>;

const resolve = (ktmb: Ktmb, input: string): string | undefined =>
  ktmb.stations.getByCode(input)?.code ?? ktmb.stations.search(input, 1)[0]?.code;

export const getFareAvailabilityHandler =
  (ktmb: Ktmb) =>
  async (args: GetFareAvailabilityArgs) => {
    const fromCode = resolve(ktmb, args.from);
    const toCode = resolve(ktmb, args.to);
    if (!fromCode || !toCode) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              ok: false,
              error: { code: "not_found", message: "station not resolved" },
            }),
          },
        ],
        isError: true,
      };
    }
    const d = parseDateMyt(args.date, new Date());
    if (!d.ok) {
      return { content: [{ type: "text" as const, text: JSON.stringify(d) }], isError: true };
    }
    const r = await ktmb.fares.get({
      from: fromCode,
      to: toCode,
      date: d.data,
      trainNo: args.trainNo,
    });
    return { content: [{ type: "text" as const, text: JSON.stringify(r) }], isError: !r.ok };
  };
