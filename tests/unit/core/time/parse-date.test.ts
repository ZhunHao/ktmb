import { describe, expect, it } from "vitest";
import { parseDateMyt } from "../../../../src/core/time/parse-date.js";

describe("parseDateMyt", () => {
  it("accepts ISO YYYY-MM-DD", () => {
    expect(parseDateMyt("2026-05-01", new Date("2026-04-26T00:00:00+08:00"))).toEqual({
      ok: true,
      data: "2026-05-01",
    });
  });

  it("rejects malformed ISO", () => {
    const r = parseDateMyt("2026-13-99", new Date("2026-04-26T00:00:00+08:00"));
    expect(r.ok).toBe(false);
  });

  it("resolves 'tomorrow' relative to MYT now", () => {
    expect(
      parseDateMyt("tomorrow", new Date("2026-04-26T00:00:00+08:00")),
    ).toEqual({ ok: true, data: "2026-04-27" });
  });

  it("resolves 'next Friday'", () => {
    expect(
      parseDateMyt("next Friday", new Date("2026-04-26T00:00:00+08:00")),
    ).toEqual({ ok: true, data: "2026-05-01" });
  });

  it("rejects unparseable text", () => {
    const r = parseDateMyt("blarg", new Date("2026-04-26T00:00:00+08:00"));
    expect(r.ok).toBe(false);
  });
});
