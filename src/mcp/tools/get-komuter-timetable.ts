import { z } from "zod";
import type { Ktmb } from "../../core/index.js";
import { parseDateMyt } from "../../core/time/parse-date.js";

export const GetKomuterTimetableInput = z.object({
  line: z.string(),
  station: z.string(),
  date: z.string(),
});
export type GetKomuterTimetableArgs = z.infer<typeof GetKomuterTimetableInput>;

export const getKomuterTimetableHandler =
  (ktmb: Ktmb) =>
  async (args: GetKomuterTimetableArgs) => {
    const station =
      ktmb.stations.getByCode(args.station)?.code ??
      ktmb.stations.search(args.station, 1)[0]?.code;
    if (!station) {
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
    const r = ktmb.komuter.getTimetable({ line: args.line, station, date: d.data });
    return { content: [{ type: "text" as const, text: JSON.stringify(r) }], isError: !r.ok };
  };
