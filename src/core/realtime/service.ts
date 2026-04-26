import type { Result } from "../result.js";
import { ok } from "../result.js";
import type { TtlCache } from "../client/cache.js";
import type { VehiclePosition } from "../types.js";

export type RealtimeFetcher = () => Promise<Result<VehiclePosition[]>>;

export type RealtimeServiceOptions = {
  fetcher: RealtimeFetcher;
  cache: TtlCache<readonly VehiclePosition[]>;
};

export class RealtimeService {
  private static readonly KEY = "vehicles";
  constructor(private readonly opts: RealtimeServiceOptions) {}

  async getPositions(
    filter: { routeId?: string } = {},
  ): Promise<Result<readonly VehiclePosition[]>> {
    const cached = this.opts.cache.get(RealtimeService.KEY);
    if (cached) return ok(this.applyFilter(cached, filter));
    const r = await this.opts.fetcher();
    if (!r.ok) return r;
    this.opts.cache.set(RealtimeService.KEY, r.data);
    return ok(this.applyFilter(r.data, filter));
  }

  private applyFilter(
    list: readonly VehiclePosition[],
    f: { routeId?: string },
  ): readonly VehiclePosition[] {
    if (!f.routeId) return list;
    return list.filter((v) => v.routeId === f.routeId);
  }
}
