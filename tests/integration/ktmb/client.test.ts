import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { getAvailability } from "../../../src/core/ktmb/client.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(resolve(here, "../../fixtures/ktmb/availability-sample.json"), "utf8"),
);
const server = setupServer();
beforeEach(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterEach(() => server.close());

describe("KTMB getAvailability", () => {
  it("calls the booking endpoint and returns parsed classes", async () => {
    server.use(
      http.post("https://online.ktmb.com.my/api/availability", () => HttpResponse.json(fixture)),
    );
    const r = await getAvailability({
      from: "KUL",
      to: "BTW",
      date: "2026-05-01",
      trainNo: "EG9322",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.length).toBeGreaterThan(0);
  });
});
