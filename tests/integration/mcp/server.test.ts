import { describe, expect, it } from "vitest";
import { buildMcpServer } from "../../../src/mcp/server.js";
import { createKtmb } from "../../../src/core/index.js";
import { GtfsStore } from "../../../src/core/gtfs/store.js";
import { parseStaticFeed } from "../../../src/core/gtfs/static-parser.js";
import { ok } from "../../../src/core/result.js";
import { buildMiniFeed } from "../../unit/core/gtfs/_make-fixture.js";

const ktmb = createKtmb({
  store: new GtfsStore(parseStaticFeed(buildMiniFeed())),
  fareGetter: async () => ok([]),
  realtimeFetcher: async () => ok([]),
});

const TOOL_NAMES = [
  "search_stations",
  "list_schedules",
  "get_fare_availability",
  "list_komuter_lines",
  "get_komuter_timetable",
  "get_vehicle_positions",
] as const;

describe("buildMcpServer", () => {
  it("registers all six MCP tools by name", () => {
    const server = buildMcpServer(ktmb);
    const inner = (
      server as unknown as { _registeredTools: Record<string, unknown> }
    )._registeredTools;
    expect(Object.keys(inner).sort()).toEqual([...TOOL_NAMES].sort());
  });

  it("each registered tool has a non-empty description", () => {
    const server = buildMcpServer(ktmb);
    const inner = (
      server as unknown as {
        _registeredTools: Record<string, { description?: string }>;
      }
    )._registeredTools;
    for (const name of TOOL_NAMES) {
      expect(inner[name]?.description ?? "").not.toBe("");
    }
  });
});
