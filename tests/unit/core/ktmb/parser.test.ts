import { describe, expect, it } from "vitest";
import { parseAvailabilityResponse } from "../../../../src/core/ktmb/parser.js";

describe("parser legacy re-export", () => {
  it("forwards to parseTripListing and reports parse_error on bad JSON", () => {
    const r = parseAvailabilityResponse("not json");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("parse_error");
  });
});
