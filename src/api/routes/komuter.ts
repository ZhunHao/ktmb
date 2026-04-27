import { Hono } from "hono";
import { z } from "zod";
import type { Ktmb } from "../../core/index.js";
import { errorResponse, okResponse } from "../envelope.js";
import { parseDateMyt } from "../../core/time/parse-date.js";

const TimetableQuery = z.object({ station: z.string().min(1), date: z.string().min(1) });

export const buildKomuterRouter = (ktmb: Ktmb): Hono => {
  const r = new Hono();
  r.get("/lines", () => {
    const r2 = ktmb.komuter.listLines();
    return r2.ok ? okResponse(r2.data) : errorResponse(r2.error.code, r2.error.message);
  });
  r.get("/lines/:line/timetable", (c) => {
    const line = c.req.param("line");
    const parsed = TimetableQuery.safeParse({
      station: c.req.query("station"),
      date: c.req.query("date"),
    });
    if (!parsed.success) return errorResponse("invalid_input", "missing station/date");
    const date = parseDateMyt(parsed.data.date, new Date());
    if (!date.ok) return errorResponse(date.error.code, date.error.message);
    const r2 = ktmb.komuter.getTimetable({
      line,
      station: parsed.data.station.toUpperCase(),
      date: date.data,
    });
    return r2.ok ? okResponse(r2.data) : errorResponse(r2.error.code, r2.error.message);
  });
  return r;
};
