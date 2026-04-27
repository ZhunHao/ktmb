import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { Ktmb } from "../core/index.js";
import {
  GetFareAvailabilityInput,
  getFareAvailabilityHandler,
} from "./tools/get-fare-availability.js";
import {
  GetKomuterTimetableInput,
  getKomuterTimetableHandler,
} from "./tools/get-komuter-timetable.js";
import {
  GetVehiclePositionsInput,
  getVehiclePositionsHandler,
} from "./tools/get-vehicle-positions.js";
import {
  ListKomuterLinesInput,
  listKomuterLinesHandler,
} from "./tools/list-komuter-lines.js";
import { ListSchedulesInput, listSchedulesHandler } from "./tools/list-schedules.js";
import { SearchStationsInput, searchStationsHandler } from "./tools/search-stations.js";

export const buildMcpServer = (ktmb: Ktmb): McpServer => {
  const server = new McpServer({ name: "ktmb", version: "0.1.0" });
  server.tool(
    "search_stations",
    "Fuzzy-search KTMB stations by code or name",
    SearchStationsInput.shape,
    searchStationsHandler(ktmb),
  );
  server.tool(
    "list_schedules",
    "List ETS / Intercity / Shuttle Tebrau trains for a date and OD pair",
    ListSchedulesInput.shape,
    listSchedulesHandler(ktmb),
  );
  server.tool(
    "get_fare_availability",
    "Get per-class fare and seat availability for a specific train",
    GetFareAvailabilityInput.shape,
    getFareAvailabilityHandler(ktmb),
  );
  server.tool(
    "list_komuter_lines",
    "List KTM Komuter lines",
    ListKomuterLinesInput.shape,
    listKomuterLinesHandler(ktmb),
  );
  server.tool(
    "get_komuter_timetable",
    "Get KTM Komuter departures for a line/station/date",
    GetKomuterTimetableInput.shape,
    getKomuterTimetableHandler(ktmb),
  );
  server.tool(
    "get_vehicle_positions",
    "Live vehicle positions from GTFS Realtime, optionally filtered by routeId",
    GetVehiclePositionsInput.shape,
    getVehiclePositionsHandler(ktmb),
  );
  return server;
};

export const runStdio = async (server: McpServer): Promise<void> => {
  const transport = new StdioServerTransport();
  await server.connect(transport);
};
