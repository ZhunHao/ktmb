import { z } from "zod";
import type { Ktmb } from "../../core/index.js";
import { parseDateMyt } from "../../core/time/parse-date.js";

export const ListSchedulesInput = z.object({
  from: z.string().describe("Origin station code or name"),
  to: z.string().describe("Destination station code or name"),
  date: z
    .string()
    .describe("Departure date — ISO YYYY-MM-DD or natural language ('tomorrow')"),
});
export type ListSchedulesArgs = z.infer<typeof ListSchedulesInput>;

const resolve = (ktmb: Ktmb, input: string): string | undefined => {
  const direct = ktmb.stations.getByCode(input);
  if (direct) return direct.code;
  const top = ktmb.stations.search(input, 1)[0];
  return top?.code;
};

export const listSchedulesHandler =
  (ktmb: Ktmb) =>
  async (args: ListSchedulesArgs) => {
    const from = resolve(ktmb, args.from);
    const to = resolve(ktmb, args.to);
    if (!from || !to) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              ok: false,
              error: { code: "not_found", message: "could not resolve station" },
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
    const r = await ktmb.schedules.listSchedulesAsync({ from, to, date: d.data });
    return { content: [{ type: "text" as const, text: JSON.stringify(r) }], isError: !r.ok };
  };
