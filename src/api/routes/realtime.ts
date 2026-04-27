import { Hono } from "hono";
import type { Ktmb } from "../../core/index.js";
import { errorResponse, okResponse } from "../envelope.js";

export const buildRealtimeRouter = (ktmb: Ktmb): Hono => {
  const r = new Hono();
  r.get("/vehicles", async (c) => {
    const route = c.req.query("route") ?? undefined;
    const r2 = await ktmb.realtime.getPositions({ ...(route ? { routeId: route } : {}) });
    return r2.ok ? okResponse(r2.data) : errorResponse(r2.error.code, r2.error.message);
  });
  return r;
};
