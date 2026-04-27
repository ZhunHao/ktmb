import { Hono } from "hono";
import type { Ktmb } from "../../core/index.js";
import { errorResponse, okResponse } from "../envelope.js";

export const buildStationsRouter = (ktmb: Ktmb): Hono => {
  const r = new Hono();
  r.get("/", (c) => {
    const q = c.req.query("q") ?? "";
    return okResponse(ktmb.stations.search(q));
  });
  r.get("/:id", (c) => {
    const id = c.req.param("id");
    const s = ktmb.stations.getByCode(id);
    if (!s) return errorResponse("not_found", `unknown station: ${id}`);
    return okResponse(s);
  });
  return r;
};
