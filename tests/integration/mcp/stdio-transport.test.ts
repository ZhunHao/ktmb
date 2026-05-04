import { describe, expect, it, vi } from "vitest";
import { runStdio } from "../../../src/mcp/transports/stdio.js";

describe("runStdio", () => {
  it("connects the McpServer to a StdioServerTransport instance", async () => {
    const connect = vi.fn().mockResolvedValue(undefined);
    const fakeServer = { connect } as unknown as Parameters<typeof runStdio>[0];
    await runStdio(fakeServer);
    expect(connect).toHaveBeenCalledTimes(1);
    const arg = connect.mock.calls[0]![0];
    // The SDK's StdioServerTransport exposes start/close/send and it never
    // returns undefined from its constructor — assert on the contract.
    expect(arg).toBeDefined();
    expect(typeof (arg as { close?: unknown }).close).toBe("function");
  });
});
