import { Hono } from "hono";
import type { Ktmb } from "../core/index.js";
import { onError } from "./errors.js";
import { buildKomuterRouter } from "./routes/komuter.js";
import { buildRealtimeRouter } from "./routes/realtime.js";
import { buildSchedulesRouter } from "./routes/schedules.js";
import { buildStationsRouter } from "./routes/stations.js";

export const buildApp = (ktmb: Ktmb): Hono => {
  const app = new Hono();
  app.onError(onError);
  app.notFound(
    () =>
      new Response(
        JSON.stringify({ ok: false, error: { code: "not_found", message: "no such route" } }),
        { status: 404, headers: { "content-type": "application/json" } },
      ),
  );
  app.get("/healthz", (c) => c.json({ ok: true, data: { status: "ok" } }));
  app.route("/v1/stations", buildStationsRouter(ktmb));
  app.route("/v1/schedules", buildSchedulesRouter(ktmb));
  app.route("/v1/komuter", buildKomuterRouter(ktmb));
  app.route("/v1/realtime", buildRealtimeRouter(ktmb));
  return app;
};
