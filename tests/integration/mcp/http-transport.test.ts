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
  }) as unknown as Ktmb;

let stop: (() => Promise<void>) | undefined;
beforeEach(() => {
  stop = undefined;
});
afterEach(async () => {
  if (stop) await stop();
});

describe("runHttp", () => {
  it("starts an HTTP server and serves the MCP initialize handshake", async () => {
    const server = buildMcpServer(stubKtmb());
    const handle = await runHttp(server, { port: 0 });
    stop = handle.stop;
    const url = `http://127.0.0.1:${handle.port}/mcp`;
    const sessionId = crypto.randomUUID();
    const init = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        "Mcp-Session-Id": sessionId,
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
    expect(init.ok).toBe(true);
    const text = await init.text();
    expect(text).toContain('"jsonrpc":"2.0"');
    expect(text).toContain('"result"');
  });

  it("accepts the path with a trailing slash (POST /mcp/)", async () => {
    const server = buildMcpServer(stubKtmb());
    const handle = await runHttp(server, { port: 0 });
    stop = handle.stop;
    const url = `http://127.0.0.1:${handle.port}/mcp/`;
    const sessionId = crypto.randomUUID();
    const init = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        "Mcp-Session-Id": sessionId,
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
    expect(init.ok).toBe(true);
  });
});
