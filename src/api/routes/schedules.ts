import { Hono } from "hono";
import { z } from "zod";
import type { Ktmb } from "../../core/index.js";
import { errorResponse, okResponse } from "../envelope.js";
import { parseDateMyt } from "../../core/time/parse-date.js";

const ListQuery = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  date: z.string().min(1),
});

const AvailabilityQuery = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  date: z.string().min(1),
});

export const buildSchedulesRouter = (ktmb: Ktmb): Hono => {
  const r = new Hono();
  r.get("/", (c) => {
    const parsed = ListQuery.safeParse({
      from: c.req.query("from"),
      to: c.req.query("to"),
      date: c.req.query("date"),
    });
    if (!parsed.success) return errorResponse("invalid_input", "missing from/to/date");
    const date = parseDateMyt(parsed.data.date, new Date());
    if (!date.ok) return errorResponse(date.error.code, date.error.message);
    const result = ktmb.schedules.listSchedules({
      from: parsed.data.from.toUpperCase(),
      to: parsed.data.to.toUpperCase(),
      date: date.data,
    });
    return result.ok
      ? okResponse(result.data)
      : errorResponse(result.error.code, result.error.message);
  });
  r.get("/:trainNo/availability", async (c) => {
    const trainNo = c.req.param("trainNo");
    const parsed = AvailabilityQuery.safeParse({
      from: c.req.query("from"),
      to: c.req.query("to"),
      date: c.req.query("date"),
    });
    if (!parsed.success) return errorResponse("invalid_input", "missing from/to/date");
    const date = parseDateMyt(parsed.data.date, new Date());
    if (!date.ok) return errorResponse(date.error.code, date.error.message);
    const r2 = await ktmb.fares.get({
      from: parsed.data.from.toUpperCase(),
      to: parsed.data.to.toUpperCase(),
      date: date.data,
      trainNo,
    });
    return r2.ok ? okResponse(r2.data) : errorResponse(r2.error.code, r2.error.message);
  });
  return r;
};
