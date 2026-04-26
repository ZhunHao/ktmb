import type { TrainClass } from "../types.js";
import type { Result } from "../result.js";
import type { TtlCache } from "../client/cache.js";
import { cacheKey } from "../client/cache.js";

export type GetFareAvailabilityInput = {
  from: string;
  to: string;
  date: string;
  trainNo: string;
};

export type FareGetter = (input: GetFareAvailabilityInput) => Promise<Result<TrainClass[]>>;

export type FareAvailabilityServiceOptions = {
  getter: FareGetter;
  cache: TtlCache<readonly TrainClass[]>;
};

export class FareAvailabilityService {
  constructor(private readonly opts: FareAvailabilityServiceOptions) {}

  async get(input: GetFareAvailabilityInput): Promise<Result<readonly TrainClass[]>> {
    const key = cacheKey(input);
    const cached = this.opts.cache.get(key);
    if (cached) return { ok: true, data: cached };
    const r = await this.opts.getter(input);
    if (r.ok) this.opts.cache.set(key, r.data);
    return r;
  }
}
