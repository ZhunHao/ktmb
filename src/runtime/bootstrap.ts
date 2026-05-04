import { GtfsLoader } from "../core/gtfs/loader.js";
import { fetchVehiclePositions } from "../core/gtfs/realtime.js";
import { createKtmb, ktmbGetAvailability, type Ktmb } from "../core/index.js";
import { searchKitsByGtfsCodes } from "../core/ktmb/search-by-gtfs.js";
import type { ForwardFallback } from "../core/schedules/service.js";
import { getEnv, getEnvFlag, getEnvNumber } from "./env.js";
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
  const cacheDir = getEnv("KTMB_CACHE_DIR");
  const cacheMaxAgeMs = getEnvNumber("KTMB_CACHE_MAX_AGE_MS");
  const loader = new GtfsLoader(opts.feedStaticUrl, {
    ...(cacheDir ? { cacheDir } : {}),
    ...(cacheMaxAgeMs !== undefined ? { cacheMaxAgeMs } : {}),
  });
  const initial = await loader.load(
    opts.retryDelaysMs !== undefined ? { retryDelaysMs: opts.retryDelaysMs } : {},
  );
  if (!initial.ok) {
    throw new Error(
      `GTFS load failed: ${initial.error.code} ${initial.error.message}`,
    );
  }
  const cookieFromEnv = getEnv("KTMB_COOKIE");
  const fareGetter = cookieFromEnv
    ? (input: Parameters<typeof ktmbGetAvailability>[0]) =>
        ktmbGetAvailability(input, { cookie: cookieFromEnv })
    : ktmbGetAvailability;
  const forwardFallback: ForwardFallback | undefined = getEnvFlag("KTMB_FORWARD_FALLBACK")
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
  const logger = opts.logger ?? createLogger();

  const interval = opts.refreshIntervalMs ?? DEFAULT_REFRESH_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;
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
            ktmb.swapStore(rr.data);
          } else {
            logger.error("[ktmb] refresh failed", rr.error);
          }
        })
        .catch((e) => {
          if (stopped) return;
          logger.error("[ktmb] refresh threw", e);
        })
        .finally(() => {
          // Use the globalThis.setImmediate so vitest's fake-timer patch
          // applies to it. Deno provides setImmediate at runtime but doesn't
          // type it on its own, so we read through globalThis. queueMicrotask
          // is wrong here: microtasks run inside the current fake-time
          // window and would re-arm a timer the test then flushes.
          if (!stopped) {
            (
              globalThis as unknown as {
                setImmediate: (cb: () => void) => void;
              }
            ).setImmediate(() => scheduleNext());
          }
        });
    }, interval);
    if (typeof timer === "object" && timer && "unref" in timer) {
      (timer as { unref: () => void }).unref();
    }
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
