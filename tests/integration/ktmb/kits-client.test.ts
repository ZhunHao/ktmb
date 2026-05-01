import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { KitsClient } from "../../../src/core/ktmb/kits-client.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = (name: string) =>
  readFileSync(resolve(here, "../../fixtures/ktmb", name), "utf8");

const homeHtml = fixtures("home.html");
const tripFormHtml = fixtures("trip-form.html");
const tripTokenJson = fixtures("trip-token.json");
const tripListingJson = fixtures("trip-listing.json");
const layoutJson = fixtures("layout-v2.json");

const server = setupServer();
beforeEach(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  server.resetHandlers();
  server.close();
});

const installAnonymousHandlers = () => {
  server.use(
    http.get("https://online.ktmb.com.my/", () =>
      HttpResponse.html(homeHtml, {
        headers: { "Set-Cookie": "X-CSRF=cookie1; path=/" },
      }),
    ),
    http.post("https://online.ktmb.com.my/Trip", () =>
      HttpResponse.html(tripFormHtml),
    ),
    http.post("https://online.ktmb.com.my/Trip/GetTripToken", () =>
      HttpResponse.text(tripTokenJson, {
        headers: { "Content-Type": "application/json" },
      }),
    ),
    http.post("https://online.ktmb.com.my/Trip/Trip", () =>
      HttpResponse.text(tripListingJson, {
        headers: { "Content-Type": "application/json" },
      }),
    ),
  );
};

describe("KitsClient.searchTrips (anonymous)", () => {
  it("returns the trip listing rows from a captured fixture", async () => {
    installAnonymousHandlers();
    const client = new KitsClient();
    const r = await client.searchTrips({
      fromKitsId: "19100",
      toKitsId: "100",
      date: "2026-05-16",
    });
    if (!r.ok) throw new Error(r.error.message);
    expect(r.data.length).toBeGreaterThan(0);
    for (const row of r.data) {
      expect(row.minFareMinor).toBeGreaterThan(0);
      expect(row.seatsAvailable).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("KitsClient.getLayout (authenticated)", () => {
  it("hits LayoutV2 with the supplied cookie and returns OKU-excluded classes", async () => {
    installAnonymousHandlers();
    server.use(
      http.post("https://online.ktmb.com.my/Trip/LayoutV2", ({ request }) => {
        const cookie = request.headers.get("cookie") ?? "";
        if (!cookie.includes(".AspNetCore.Identity.Application=")) {
          return HttpResponse.text(
            JSON.stringify({ Status: false, MessageCode: "Unauthorized" }),
            { status: 401 },
          );
        }
        return HttpResponse.text(layoutJson, {
          headers: { "Content-Type": "application/json" },
        });
      }),
    );
    const client = new KitsClient({
      cookie: ".AspNetCore.Identity.Application=auth-token; X-CSRF=other",
    });
    const search = await client.searchTrips({
      fromKitsId: "19100",
      toKitsId: "100",
      date: "2026-05-16",
    });
    if (!search.ok) throw new Error(search.error.message);
    const target = search.data[0];
    expect(target).toBeDefined();
    const layout = await client.getLayout({ tripData: target!.tripData, pax: 1 });
    if (!layout.ok) throw new Error(layout.error.message);
    expect(layout.data.classes.every((c) => c.seatsLeftIncludesPriority === false)).toBe(true);
  });
});
