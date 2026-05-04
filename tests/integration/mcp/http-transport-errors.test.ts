import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runHttp } from "../../../src/mcp/transports/http.js";
import { buildMcpServer } from "../../../src/mcp/server.js";
import type { Ktmb } from "../../../src/core/index.js";

const stubKtmb = (): Ktmb =>
  ({
    stations: { search: () => [], list: () => [], getByCode: () => undefined },
    schedules: {
      listSchedules: () => ({ ok: true, data: [] }),
      listSchedulesAsync: async () => ({ ok: true, data: [] }),
    },
    fares: { get: async () => ({ ok: true, data: [] }) },
    komuter: {
      listLines: () => ({ ok: true, data: [] }),
      getTimetable: () => ({ ok: true, data: [] }),
    },
    realtime: { fetch: async () => ({ ok: true, data: [] }) },
    swapStore: () => {},
  }) as unknown as Ktmb;

let stop: (() => Promise<void>) | undefined;
beforeEach(() => {
  stop = undefined;
});
afterEach(async () => {
  if (stop) await stop();
});

describe("runHttp routing", () => {
  it("returns 404 for paths that do not match the configured mount", async () => {
    const server = buildMcpServer(stubKtmb());
    const handle = await runHttp(server, { port: 0 });
    stop = handle.stop;
    const res = await fetch(`http://127.0.0.1:${handle.port}/not-mcp`);
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toBe("application/json");
    const body = await res.json();
    expect(body).toEqual({ error: "not_found" });
  });

  it("ignores query strings when matching the configured path", async () => {
    const server = buildMcpServer(stubKtmb());
    const handle = await runHttp(server, { port: 0 });
    stop = handle.stop;
    // Wrong base path but with a query string — should still 404 (and not
    // accidentally match because the qs got included in the comparison).
    const res = await fetch(`http://127.0.0.1:${handle.port}/wrong?session=x`);
    expect(res.status).toBe(404);
  });

  it("honours a custom mount path", async () => {
    const server = buildMcpServer(stubKtmb());
    const handle = await runHttp(server, { port: 0, path: "/api/mcp/" });
    stop = handle.stop;
    const reachable = await fetch(`http://127.0.0.1:${handle.port}/api/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        "Mcp-Session-Id": crypto.randomUUID(),
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "test", version: "0" },
        },
      }),
    });
    expect(reachable.ok).toBe(true);
    const wrong = await fetch(`http://127.0.0.1:${handle.port}/mcp`);
    expect(wrong.status).toBe(404);
  });

  it("rejects when the requested port is already bound", async () => {
    const a = await runHttp(buildMcpServer(stubKtmb()), { port: 0 });
    stop = a.stop;
    await expect(
      runHttp(buildMcpServer(stubKtmb()), { port: a.port }),
    ).rejects.toThrow();
  });

  it("stop() rejects if called twice — the http server cannot be re-closed", async () => {
    // Documenting the real contract: callers should call stop() exactly once.
    // The underlying Node http server raises ERR_SERVER_NOT_RUNNING on a
    // second close, and we don't paper over that error.
    const server = buildMcpServer(stubKtmb());
    const handle = await runHttp(server, { port: 0 });
    await handle.stop();
    await expect(handle.stop()).rejects.toThrow(/Server is not running/);
  });
});
