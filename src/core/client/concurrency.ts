import PQueue from "p-queue";

const queues = new Map<string, PQueue>();

export const queueFor = (origin: string, concurrency = 4): PQueue => {
  let q = queues.get(origin);
  if (!q) {
    q = new PQueue({ concurrency });
    queues.set(origin, q);
  }
  return q;
};

export const __resetQueues = (): void => {
  queues.clear();
};
