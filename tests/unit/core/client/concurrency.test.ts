import { afterEach, describe, expect, it, vi } from "vitest";
import {
  __resetQueues,
  drainAll,
  queueFor,
} from "../../../../src/core/client/concurrency.js";

afterEach(() => {
  __resetQueues();
  vi.useRealTimers();
});

describe("queueFor", () => {
  it("returns the same queue for the same origin", () => {
    const a = queueFor("https://example.test");
    const b = queueFor("https://example.test");
    expect(a).toBe(b);
  });

  it("returns distinct queues for different origins", () => {
    const a = queueFor("https://a.test");
    const b = queueFor("https://b.test");
    expect(a).not.toBe(b);
  });

  it("respects the requested concurrency on first creation", () => {
    const q = queueFor("https://throttled.test", 1);
    expect(q.concurrency).toBe(1);
  });
});

describe("drainAll", () => {
  it("waits until every queue is idle", async () => {
    const q1 = queueFor("https://x.test");
    const q2 = queueFor("https://y.test");
    let done1 = false;
    let done2 = false;
    void q1.add(async () => {
      await new Promise((r) => setTimeout(r, 5));
      done1 = true;
    });
    void q2.add(async () => {
      await new Promise((r) => setTimeout(r, 5));
      done2 = true;
    });
    await drainAll();
    expect(done1).toBe(true);
    expect(done2).toBe(true);
  });
});

describe("idle eviction", () => {
  it("drops idle queues older than the eviction window on the next queueFor call", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-05T00:00:00Z"));
    const a1 = queueFor("https://idle.test");
    // Advance past the 5-minute idle window with no active work.
    vi.setSystemTime(new Date("2026-05-05T00:06:00Z"));
    const a2 = queueFor("https://idle.test");
    expect(a2).not.toBe(a1);
  });

  it("does not evict a queue that still has pending work", async () => {
    const q = queueFor("https://busy.test");
    let release: () => void = () => {};
    void q.add(
      () =>
        new Promise<void>((r) => {
          release = r;
        }),
    );
    // Touching another origin runs the eviction sweep without disturbing our
    // pending queue, since q.pending > 0 keeps it alive.
    queueFor("https://other.test");
    const same = queueFor("https://busy.test");
    expect(same).toBe(q);
    release();
    await drainAll();
  });
});

describe("__resetQueues", () => {
  it("clears the module-global map so subsequent queueFor calls see fresh queues", () => {
    const before = queueFor("https://reset.test");
    __resetQueues();
    const after = queueFor("https://reset.test");
    expect(after).not.toBe(before);
  });
});
