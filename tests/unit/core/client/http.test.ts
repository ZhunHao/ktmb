import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { fetchWithRetry } from "../../../../src/core/client/http.js";

const server = setupServer();
beforeEach(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterEach(() => server.close());

describe("fetchWithRetry", () => {
  it("returns ok JSON on 200", async () => {
    server.use(
      http.get("https://example.test/data", () => HttpResponse.json({ hello: "world" })),
    );
    const r = await fetchWithRetry("https://example.test/data");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(await r.data.json()).toEqual({ hello: "world" });
  });

  it("retries on 503 and succeeds on 3rd attempt", async () => {
    let calls = 0;
    server.use(
      http.get("https://example.test/data", () => {
        calls += 1;
        if (calls < 3) return new HttpResponse(null, { status: 503 });
        return HttpResponse.json({ ok: true });
      }),
    );
    const r = await fetchWithRetry("https://example.test/data", { retryDelaysMs: [1, 1, 1] });
    expect(calls).toBe(3);
    expect(r.ok).toBe(true);
  });

  it("does not retry on 4xx", async () => {
    let calls = 0;
    server.use(
      http.get("https://example.test/data", () => {
        calls += 1;
        return new HttpResponse(null, { status: 404 });
      }),
    );
    const r = await fetchWithRetry("https://example.test/data", { retryDelaysMs: [1, 1, 1] });
    expect(calls).toBe(1);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("not_found");
  });

  it("returns upstream_error after exhausting retries", async () => {
    server.use(http.get("https://example.test/data", () => new HttpResponse(null, { status: 502 })));
    const r = await fetchWithRetry("https://example.test/data", { retryDelaysMs: [1, 1, 1] });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("upstream_error");
  });

  it("maps HTTP 429 to rate_limited", async () => {
    server.use(
      http.get("https://example.test/data", () => new HttpResponse(null, { status: 429 })),
    );
    const r = await fetchWithRetry("https://example.test/data", { retryDelaysMs: [1, 1, 1] });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("rate_limited");
  });

  it("exposes text() on the ResponseLike wrapper", async () => {
    server.use(
      http.get("https://example.test/text", () =>
        new HttpResponse("plain body", {
          status: 200,
          headers: { "content-type": "text/plain" },
        }),
      ),
    );
    const r = await fetchWithRetry("https://example.test/text");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(await r.data.text()).toBe("plain body");
  });

  it("retries through a network exception and gives up with upstream_error", async () => {
    let calls = 0;
    server.use(
      http.get("https://example.test/data", () => {
        calls += 1;
        return HttpResponse.error();
      }),
    );
    const r = await fetchWithRetry("https://example.test/data", { retryDelaysMs: [1, 1] });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("upstream_error");
    expect(r.error.message).toContain("network error");
    expect(calls).toBeGreaterThanOrEqual(2);
  });
});
