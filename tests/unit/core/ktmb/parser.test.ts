import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { parseAvailabilityResponse } from "../../../../src/core/ktmb/parser.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(resolve(here, "../../../fixtures/ktmb/availability-sample.json"), "utf8"),
);

describe("KTMB parseAvailabilityResponse", () => {
  it("yields a Result with at least one fare class", () => {
    const r = parseAvailabilityResponse(fixture);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.length).toBeGreaterThan(0);
    for (const c of r.data) {
      expect(typeof c.className).toBe("string");
      expect(c.fare.priceMinor).toBeGreaterThanOrEqual(0);
      expect(["MYR", "SGD"]).toContain(c.fare.currency);
    }
  });

  it("returns parse_error on completely unrecognised shape", () => {
    const r = parseAvailabilityResponse({ totally: "wrong" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("parse_error");
  });
});
