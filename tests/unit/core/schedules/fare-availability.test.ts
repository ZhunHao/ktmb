import { describe, expect, it, vi } from "vitest";
import { FareAvailabilityService } from "../../../../src/core/schedules/fare-availability.js";
import type { TrainClass } from "../../../../src/core/types.js";
import { ok } from "../../../../src/core/result.js";
import { TtlCache } from "../../../../src/core/client/cache.js";

describe("FareAvailabilityService", () => {
  it("delegates to the KTMB getter and caches the result", async () => {
    const sample: TrainClass[] = [
      {
        className: "Premier",
        fare: { className: "Premier", priceMinor: 5500, currency: "MYR", seatsLeft: 12 },
      },
    ];
    const get = vi.fn().mockResolvedValue(ok(sample));
    const svc = new FareAvailabilityService({
      getter: get,
      cache: new TtlCache({ max: 16, ttlMs: 30_000 }),
    });
    const a = await svc.get({ from: "KUL", to: "BTW", date: "2026-05-01", trainNo: "EG9322" });
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    expect(a.data).toEqual(sample);

    const b = await svc.get({ from: "KUL", to: "BTW", date: "2026-05-01", trainNo: "EG9322" });
    expect(b.ok).toBe(true);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("does not cache failures", async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, error: { code: "upstream_error", message: "x" } })
      .mockResolvedValueOnce(ok([]));
    const svc = new FareAvailabilityService({
      getter: get,
      cache: new TtlCache({ max: 16, ttlMs: 30_000 }),
    });
    const a = await svc.get({ from: "KUL", to: "BTW", date: "2026-05-01", trainNo: "EG9322" });
    expect(a.ok).toBe(false);
    const b = await svc.get({ from: "KUL", to: "BTW", date: "2026-05-01", trainNo: "EG9322" });
    expect(b.ok).toBe(true);
    expect(get).toHaveBeenCalledTimes(2);
  });
});
