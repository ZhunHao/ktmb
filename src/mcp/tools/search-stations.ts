import { z } from "zod";
import type { Ktmb } from "../../core/index.js";

export const SearchStationsInput = z.object({
  query: z.string().describe("Station name or code (fuzzy)").min(1),
  limit: z.number().int().positive().max(50).optional(),
});
export type SearchStationsArgs = z.infer<typeof SearchStationsInput>;

export const searchStationsHandler =
  (ktmb: Ktmb) =>
  async (args: SearchStationsArgs) => ({
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ ok: true, data: ktmb.stations.search(args.query, args.limit) }),
      },
    ],
  });
