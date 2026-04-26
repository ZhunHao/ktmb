import { Headers } from "undici";
import type { RequestInit, Response as UndiciResponse } from "undici";
import type { Result } from "../result.js";
import { err, ok } from "../result.js";
import { queueFor } from "./concurrency.js";

// Node's `globalThis.fetch` is implemented via undici. We deliberately call
// the global (rather than `import { fetch } from "undici"`) so msw's
// FetchInterceptor — which patches `globalThis.fetch` — can intercept network
// calls in tests. The userland undici fetch is a separate function reference
// msw cannot patch.
type GlobalFetch = (input: string, init?: RequestInit) => Promise<UndiciResponse>;
const undiciFetch: GlobalFetch = (input, init) =>
  (globalThis as unknown as { fetch: GlobalFetch }).fetch(input, init);

export type FetchOptions = {
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string | Uint8Array;
  userAgent?: string;
  retryDelaysMs?: readonly number[];
  signal?: AbortSignal;
};

const DEFAULT_RETRIES = [250, 750, 2000] as const;
const DEFAULT_UA = "ktmb/0.1.0 (+https://github.com/zhunhao/ktmb)";

const codeForStatus = (status: number): "not_found" | "rate_limited" | "upstream_error" => {
  if (status === 404) return "not_found";
  if (status === 429) return "rate_limited";
  return "upstream_error";
};

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export type ResponseLike = {
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
  arrayBuffer: () => Promise<ArrayBuffer>;
};

const toResponseLike = (res: UndiciResponse): ResponseLike => ({
  status: res.status,
  json: () => res.json(),
  text: () => res.text(),
  arrayBuffer: () => res.arrayBuffer(),
});

export const fetchWithRetry = async (
  url: string,
  options: FetchOptions = {},
): Promise<Result<ResponseLike>> => {
  const u = new URL(url);
  const queue = queueFor(u.origin);
  const delays = options.retryDelaysMs ?? DEFAULT_RETRIES;

  return queue.add(async () => {
    const headers = new Headers(options.headers);
    if (!headers.has("user-agent")) headers.set("user-agent", options.userAgent ?? DEFAULT_UA);

    let lastStatus = 0;
    let lastError: unknown = undefined;
    for (let attempt = 0; attempt <= delays.length; attempt++) {
      try {
        const init: RequestInit = {
          method: options.method ?? "GET",
          headers,
        };
        if (options.body !== undefined) init.body = options.body;
        if (options.signal !== undefined) init.signal = options.signal;
        const res = await undiciFetch(url, init);
        if (res.ok) {
          return ok(toResponseLike(res));
        }
        if (res.status >= 400 && res.status < 500) {
          return err(codeForStatus(res.status), `HTTP ${res.status} from ${u.host}`);
        }
        lastStatus = res.status;
      } catch (e) {
        lastError = e;
      }
      if (attempt < delays.length) await sleep(delays[attempt]!);
    }
    return err(
      "upstream_error",
      lastStatus
        ? `HTTP ${lastStatus} from ${u.host} after retries`
        : `network error talking to ${u.host}`,
      lastError,
    );
  }) as Promise<Result<ResponseLike>>;
};
