import { GtfsLoader } from "../core/gtfs/loader.js";
import { fetchVehiclePositions } from "../core/gtfs/realtime.js";
import type { GtfsStore } from "../core/gtfs/store.js";
import { createKtmb, ktmbGetAvailability, type Ktmb } from "../core/index.js";
import { searchKitsByGtfsCodes } from "../core/ktmb/search-by-gtfs.js";
import type { ForwardFallback } from "../core/schedules/service.js";
import { createLogger, type Logger } from "./logger.js";

export type CreateRuntimeOptions = {
  feedStaticUrl: string;
  feedRealtimeUrl: string;
  refreshIntervalMs?: number;
  retryDelaysMs?: readonly number[];
  logger?: Logger;
};

export type Runtime = {
  ktmb: Ktmb;
  loader: GtfsLoader;
  shutdown: () => void;
};

const DEFAULT_REFRESH_MS = 6 * 60 * 60 * 1000;

export const createKtmbRuntime = async (opts: CreateRuntimeOptions): Promise<Runtime> => {
  const cacheDir =
    typeof process !== "undefined" ? process.env.KTMB_CACHE_DIR : undefined;
  const cacheMaxAgeMs = (() => {
    const raw = typeof process !== "undefined" ? process.env.KTMB_CACHE_MAX_AGE_MS : undefined;
    return raw ? Number(raw) : undefined;
  })();
  const loader = new GtfsLoader(opts.feedStaticUrl, {
    ...(cacheDir ? { cacheDir } : {}),
    ...(cacheMaxAgeMs && Number.isFinite(cacheMaxAgeMs) ? { cacheMaxAgeMs } : {}),
  });
  const initial = await loader.load(
    opts.retryDelaysMs !== undefined ? { retryDelaysMs: opts.retryDelaysMs } : {},
  );
  if (!initial.ok) {
    throw new Error(
      `GTFS load failed: ${initial.error.code} ${initial.error.message}`,
    );
  }
  const cookieFromEnv =
    typeof process !== "undefined" ? process.env.KTMB_COOKIE : undefined;
  const fareGetter = cookieFromEnv
    ? (input: Parameters<typeof ktmbGetAvailability>[0]) =>
        ktmbGetAvailability(input, { cookie: cookieFromEnv })
    : ktmbGetAvailability;
  const forwardFallbackEnabled =
    typeof process !== "undefined" &&
    process.env.KTMB_FORWARD_FALLBACK === "1";
  const forwardFallback: ForwardFallback | undefined = forwardFallbackEnabled
    ? async (input) => {
        const r = await searchKitsByGtfsCodes(
          input,
          cookieFromEnv ? { cookie: cookieFromEnv } : {},
        );
        return r.ok ? { ok: true, data: r.data.rows } : r;
      }
    : undefined;
  const ktmb = createKtmb({
    store: initial.data,
    fareGetter,
    realtimeFetcher: () => fetchVehiclePositions(opts.feedRealtimeUrl),
    ...(forwardFallback ? { forwardFallback } : {}),
  });
  const swap = (ktmb as Ktmb & { swapStore: (s: GtfsStore) => void }).swapStore;
  const logger = opts.logger ?? createLogger();

  const interval = opts.refreshIntervalMs ?? DEFAULT_REFRESH_MS;
  let timer: NodeJS.Timeout | undefined;
  let stopped = false;

  const scheduleNext = (): void => {
    if (stopped || interval <= 0) return;
    timer = setTimeout(() => {
      void loader
        .refresh(
          opts.retryDelaysMs !== undefined ? { retryDelaysMs: opts.retryDelaysMs } : {},
        )
        .then((rr) => {
          if (stopped) return;
          if (rr.ok) {
            swap(rr.data);
          } else {
            logger.error("[ktmb] refresh failed", rr.error);
          }
        })
        .catch((e) => {
          if (stopped) return;
          logger.error("[ktmb] refresh threw", e);
        })
        .finally(() => {
          if (!stopped) setImmediate(() => scheduleNext());
        });
    }, interval);
    if (timer.unref) timer.unref();
  };

  if (interval > 0) {
    scheduleNext();
  }

  return {
    ktmb,
    loader,
    shutdown: () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    },
  };
};
