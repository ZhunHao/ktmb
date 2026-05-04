import { z } from "zod";
import type { Ktmb } from "../../core/index.js";
import { parseDateMyt } from "../../core/time/parse-date.js";
import { mcpError, mcpJson, resolveStation } from "./_shared.js";

export const GetKomuterTimetableInput = z.object({
  line: z.string(),
  station: z.string(),
  date: z.string(),
});
export type GetKomuterTimetableArgs = z.infer<typeof GetKomuterTimetableInput>;

export const getKomuterTimetableHandler =
  (ktmb: Ktmb) =>
  async (args: GetKomuterTimetableArgs) => {
    const station = resolveStation(ktmb, args.station);
    if (!station) return mcpError("not_found", "station not resolved");
    const d = parseDateMyt(args.date);
    if (!d.ok) return mcpJson(d);
    return mcpJson(ktmb.komuter.getTimetable({ line: args.line, station, date: d.data }));
  };
