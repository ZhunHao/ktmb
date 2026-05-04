import { z } from "zod";
import type { Ktmb } from "../../core/index.js";
import { parseDateMyt } from "../../core/time/parse-date.js";
import { mcpError, mcpJson, resolveStation } from "./_shared.js";

export const ListSchedulesInput = z.object({
  from: z.string().describe("Origin station code or name"),
  to: z.string().describe("Destination station code or name"),
  date: z
    .string()
    .describe("Departure date — ISO YYYY-MM-DD or natural language ('tomorrow')"),
});
export type ListSchedulesArgs = z.infer<typeof ListSchedulesInput>;

export const listSchedulesHandler =
  (ktmb: Ktmb) =>
  async (args: ListSchedulesArgs) => {
    const from = resolveStation(ktmb, args.from);
    const to = resolveStation(ktmb, args.to);
    if (!from || !to) return mcpError("not_found", "could not resolve station");
    const d = parseDateMyt(args.date);
    if (!d.ok) return mcpJson(d);
    return mcpJson(await ktmb.schedules.listSchedulesAsync({ from, to, date: d.data }));
  };
