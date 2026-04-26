import { describe, expect, it } from "vitest";
import { mytDate, isoMyt, addDaysMyt } from "../../../../src/core/time/myt.js";

describe("MYT helpers", () => {
  it("mytDate builds a YYYY-MM-DD string in MYT", () => {
    expect(mytDate(2026, 5, 1)).toBe("2026-05-01");
  });

  it("isoMyt formats H/M/S into ISO with +08:00", () => {
    expect(isoMyt("2026-05-01", 8, 30, 0)).toBe("2026-05-01T08:30:00+08:00");
    expect(isoMyt("2026-05-01", 23, 5, 9)).toBe("2026-05-01T23:05:09+08:00");
  });

  it("addDaysMyt rolls forward across month boundary", () => {
    expect(addDaysMyt("2026-04-30", 1)).toBe("2026-05-01");
    expect(addDaysMyt("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysMyt("2026-05-01", 0)).toBe("2026-05-01");
  });
});
