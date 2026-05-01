import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { parseTripListing } from "../../../../src/core/ktmb/parse-trip-listing.js";

const here = dirname(fileURLToPath(import.meta.url));
const json = readFileSync(
  resolve(here, "../../../fixtures/ktmb/trip-listing.json"),
  "utf8",
);

describe("parseTripListing", () => {
  it("returns at least one train row from a captured /Trip/Trip JSON envelope", () => {
    const r = parseTripListing(json);
    if (!r.ok) throw new Error(r.error.message);
    expect(r.data.length).toBeGreaterThan(0);
  });

  it("each row carries trainNo, service, departure, arrival, durationMinutes, seatsAvailable, minFareMinor", () => {
    const r = parseTripListing(json);
    if (!r.ok) throw new Error(r.error.message);
    for (const row of r.data) {
      expect(row.trainNo).toMatch(/^\d{3,5}$/);
      expect(typeof row.service).toBe("string");
      expect(row.departure).toMatch(/^\d{2}:\d{2}$/);
      expect(row.arrival).toMatch(/^\d{2}:\d{2}/);
      expect(row.durationMinutes).toBeGreaterThan(0);
      expect(row.seatsAvailable).toBeGreaterThanOrEqual(0);
      expect(row.minFareMinor).toBeGreaterThanOrEqual(0);
      expect(typeof row.tripData).toBe("string");
    }
  });

  it("returns parse_error on a non-JSON body", () => {
    const r = parseTripListing("not json");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("parse_error");
  });

  it("returns parse_error when status is false (KITS-side error)", () => {
    const r = parseTripListing(
      JSON.stringify({
        status: false,
        messages: [],
        messageCode: "boom",
        data: "",
      }),
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("parse_error");
    expect(r.error.message).toContain("boom");
  });
});
