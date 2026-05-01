import { TtlCache } from "./client/cache.js";
import type { GtfsStore } from "./gtfs/store.js";
import { KomuterService } from "./komuter/service.js";
import { FareAvailabilityService } from "./schedules/fare-availability.js";
import type { FareGetter } from "./schedules/fare-availability.js";
import { SchedulesService } from "./schedules/service.js";
import { StationsService } from "./stations/service.js";
import { RealtimeService } from "./realtime/service.js";
import type { RealtimeFetcher } from "./realtime/service.js";
import type { TrainClass, VehiclePosition } from "./types.js";

export * from "./types.js";
export * from "./result.js";
export { GtfsStore } from "./gtfs/store.js";
export { GtfsLoader } from "./gtfs/loader.js";
export { parseStaticFeed } from "./gtfs/static-parser.js";
export { fetchVehiclePositions } from "./gtfs/realtime.js";
export { getAvailability as ktmbGetAvailability } from "./ktmb/client.js";
export { parseDateMyt } from "./time/parse-date.js";

export type Ktmb = {
  stations: StationsService;
  schedules: SchedulesService;
  fares: FareAvailabilityService;
  komuter: KomuterService;
  realtime: RealtimeService;
};

export type CreateKtmbOptions = {
  store: GtfsStore;
  fareGetter: FareGetter;
  realtimeFetcher: RealtimeFetcher;
  fareCacheTtlMs?: number;
  realtimeCacheTtlMs?: number;
};

export const createKtmb = (opts: CreateKtmbOptions): Ktmb => {
  let store = opts.store;
  const getStore = (): GtfsStore => store;
  const fareCache = new TtlCache<readonly TrainClass[]>({
    max: 256,
    ttlMs: opts.fareCacheTtlMs ?? 30_000,
  });
  const realtimeCache = new TtlCache<readonly VehiclePosition[]>({
    max: 1,
    ttlMs: opts.realtimeCacheTtlMs ?? 15_000,
  });
  const ktmb: Ktmb & { swapStore: (s: GtfsStore) => void } = {
    stations: new StationsService(getStore),
    schedules: new SchedulesService(getStore),
    fares: new FareAvailabilityService({ getter: opts.fareGetter, cache: fareCache }),
    komuter: new KomuterService(getStore),
    realtime: new RealtimeService({ fetcher: opts.realtimeFetcher, cache: realtimeCache }),
    swapStore: (s) => {
      store = s;
    },
  };
  return ktmb;
};
