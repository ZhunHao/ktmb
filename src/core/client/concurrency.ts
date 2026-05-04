import PQueue from "p-queue";

// Per-origin politeness budget. Each origin gets its own concurrency-bounded
// PQueue so requests to one host can't starve another. Idle queues are evicted
// lazily on subsequent `queueFor` calls (no module-level timers, which would
// otherwise interfere with consumers that mock setTimeout in tests), so the
// Map cannot grow unbounded across long-running processes.
const DEFAULT_CONCURRENCY = 4;
const IDLE_EVICT_MS = 5 * 60_000;

type Entry = { q: PQueue; lastUsedAt: number };
const queues = new Map<string, Entry>();

const evictIdle = (now: number): void => {
  for (const [origin, entry] of queues) {
    if (
      now - entry.lastUsedAt >= IDLE_EVICT_MS &&
      entry.q.size === 0 &&
      entry.q.pending === 0
    ) {
      queues.delete(origin);
    }
  }
};

export const queueFor = (origin: string, concurrency = DEFAULT_CONCURRENCY): PQueue => {
  const now = Date.now();
  evictIdle(now);
  const existing = queues.get(origin);
  if (existing) {
    existing.lastUsedAt = now;
    return existing.q;
  }
  const q = new PQueue({ concurrency });
  queues.set(origin, { q, lastUsedAt: now });
  return q;
};

export const drainAll = async (): Promise<void> => {
  await Promise.all([...queues.values()].map(({ q }) => q.onIdle()));
};

export const __resetQueues = (): void => {
  queues.clear();
};
