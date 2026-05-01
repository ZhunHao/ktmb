import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { getAvailability } from "../../../src/core/ktmb/client.js";

const here = dirname(fileURLToPath(import.meta.url));
const fix = (n: string) =>
  readFileSync(resolve(here, "../../fixtures/ktmb", n), "utf8");

const server = setupServer();
beforeEach(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  server.resetHandlers();
  server.close();
});

const stub = () =>
  server.use(
    http.get("https://online.ktmb.com.my/", () =>
      HttpResponse.html(fix("home.html")),
    ),
    http.post("https://online.ktmb.com.my/Trip", () =>
      HttpResponse.html(fix("trip-form.html")),
    ),
    http.post("https://online.ktmb.com.my/Trip/GetTripToken", () =>
      HttpResponse.text(fix("trip-token.json"), {
        headers: { "Content-Type": "application/json" },
      }),
    ),
    http.post("https://online.ktmb.com.my/Trip/Trip", () =>
      HttpResponse.text(fix("trip-listing.json"), {
        headers: { "Content-Type": "application/json" },
      }),
    ),
  );

describe("getAvailability (anonymous)", () => {
  it("returns one synthetic class for the requested train, marked priority-inclusive", async () => {
    stub();
    const r = await getAvailability({
      from: "KUL",
      to: "BTW",
      date: "2026-05-16",
      // Use a trainNo present in the captured trip-listing.json (e.g. 9124).
      trainNo: "9124",
    });
    if (!r.ok) throw new Error(r.error.message);
    expect(r.data.length).toBe(1);
    expect(r.data[0]!.fare.seatsLeftIncludesPriority).toBe(true);
    expect(r.data[0]!.fare.seatsLeft).toBeGreaterThan(0);
  });

  it("returns not_found for an unknown trainNo", async () => {
    stub();
    const r = await getAvailability({
      from: "KUL",
      to: "BTW",
      date: "2026-05-16",
      trainNo: "0000",
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("not_found");
  });
});

describe("getAvailability (authenticated)", () => {
  it("returns OKU-excluded classes when a cookie is supplied", async () => {
    stub();
    server.use(
      http.post("https://online.ktmb.com.my/Trip/LayoutV2", () =>
        HttpResponse.text(fix("layout-v2.json"), {
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    const r = await getAvailability(
      { from: "KUL", to: "BTW", date: "2026-05-16", trainNo: "9124" },
      { cookie: ".AspNetCore.Identity.Application=auth-token" },
    );
    if (!r.ok) throw new Error(r.error.message);
    expect(r.data.length).toBeGreaterThan(0);
    for (const c of r.data) {
      expect(c.fare.seatsLeftIncludesPriority).toBe(false);
    }
  });
});
