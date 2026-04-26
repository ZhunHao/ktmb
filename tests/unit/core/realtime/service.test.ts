import { describe, expect, it, vi } from "vitest";
import { RealtimeService } from "../../../../src/core/realtime/service.js";
import { TtlCache } from "../../../../src/core/client/cache.js";
import { ok } from "../../../../src/core/result.js";

describe("RealtimeService", () => {
  it("caches the previous vehicle position list within TTL", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      ok([{ vehicleId: "v1", lat: 3, lon: 101, timestamp: "2026-05-01T08:00:00+08:00" }]),
    );
    const svc = new RealtimeService({
      fetcher: fetchFn,
      cache: new TtlCache({ max: 1, ttlMs: 60_000 }),
    });
    await svc.getPositions();
    await svc.getPositions();
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("filters by routeId", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      ok([
        { vehicleId: "v1", routeId: "ETS-N", lat: 3, lon: 101, timestamp: "2026-05-01T08:00:00+08:00" },
        { vehicleId: "v2", routeId: "KOM-PK", lat: 3, lon: 101, timestamp: "2026-05-01T08:00:00+08:00" },
      ]),
    );
    const svc = new RealtimeService({
      fetcher: fetchFn,
      cache: new TtlCache({ max: 1, ttlMs: 60_000 }),
    });
    const r = await svc.getPositions({ routeId: "KOM-PK" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.map((v) => v.vehicleId)).toEqual(["v2"]);
  });
});
