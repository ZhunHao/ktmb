import { Hono } from "hono";
import type { Ktmb } from "../core/index.js";
import { DEMO_HTML } from "./demo.js";
import { errorResponse } from "./envelope.js";
import { onError } from "./errors.js";
import { buildKomuterRouter } from "./routes/komuter.js";
import { buildRealtimeRouter } from "./routes/realtime.js";
import { buildSchedulesRouter } from "./routes/schedules.js";
import { buildStationsRouter } from "./routes/stations.js";

export const buildApp = (ktmb: Ktmb): Hono => {
  const app = new Hono();
  app.onError(onError);
  app.notFound(() => errorResponse("not_found", "no such route"));
  app.get("/healthz", (c) => c.json({ ok: true, data: { status: "ok" } }));
  app.get(
    "/",
    (c) =>
      new Response(DEMO_HTML, {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      }),
  );
  app.route("/v1/stations", buildStationsRouter(ktmb));
  app.route("/v1/schedules", buildSchedulesRouter(ktmb));
  app.route("/v1/komuter", buildKomuterRouter(ktmb));
  app.route("/v1/realtime", buildRealtimeRouter(ktmb));
  return app;
};
