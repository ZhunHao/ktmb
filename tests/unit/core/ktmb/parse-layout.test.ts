import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { parseLayout, isOkuSeatType } from "../../../../src/core/ktmb/parse-layout.js";

const here = dirname(fileURLToPath(import.meta.url));
const json = readFileSync(
  resolve(here, "../../../fixtures/ktmb/layout-v2.json"),
  "utf8",
);

describe("isOkuSeatType", () => {
  it("flags OKU codes case-insensitively", () => {
    expect(isOkuSeatType("StdBwOKU")).toBe(true);
    expect(isOkuSeatType("Standard Backward OKU")).toBe(true);
    expect(isOkuSeatType("StanForWinWC")).toBe(false);
    expect(isOkuSeatType(null)).toBe(false);
    expect(isOkuSeatType(undefined)).toBe(false);
  });
});

describe("parseLayout", () => {
  it("aggregates classes with OKU-excluded seat counts and per-class min price (minor)", () => {
    const r = parseLayout(json);
    if (!r.ok) throw new Error(r.error.message);
    expect(r.data.currency).toBe("MYR");
    expect(r.data.classes.length).toBeGreaterThan(0);
    for (const cls of r.data.classes) {
      expect(typeof cls.className).toBe("string");
      expect(cls.priceMinor).toBeGreaterThan(0);
      expect(cls.seatsLeft).toBeGreaterThanOrEqual(0);
      expect(cls.seatsLeftIncludesPriority).toBe(false);
    }
  });

  it("excludes OKU seats from per-class seatsLeft and surfaces them via okuSeatsAvailable", () => {
    const r = parseLayout(json);
    if (!r.ok) throw new Error(r.error.message);
    expect(r.data.okuSeatsAvailable).toBeGreaterThanOrEqual(1);

    // Cross-check against the raw fixture: total Status==1 seats (regardless of type)
    // must equal sum(per-class seatsLeft) + okuSeatsAvailable.
    const raw = JSON.parse(json) as {
      Data: { Coaches: Array<{ Seats: Array<{ Status: string }> }> };
    };
    let totalAvail = 0;
    for (const c of raw.Data.Coaches) {
      for (const s of c.Seats) if (s.Status === "1") totalAvail++;
    }
    const summed = r.data.classes.reduce((a, c) => a + c.seatsLeft, 0);
    expect(summed + r.data.okuSeatsAvailable).toBe(totalAvail);
  });

  it("returns parse_error on Status=false", () => {
    const r = parseLayout(
      JSON.stringify({ Status: false, Messages: [], MessageCode: "x", Data: null }),
    );
    expect(r.ok).toBe(false);
  });
});
