import type { Result } from "../result.js";
import { err, ok } from "../result.js";

export type KitsStation = {
  id: string;
  description: string;
  stationData: string;
  trainServices: readonly string[];
  state: string;
};

export type ParsedHomePage = {
  requestVerificationToken: string;
  groupedStations: ReadonlyArray<{
    state: string;
    stations: ReadonlyArray<{
      id: string;
      description: string;
      trainServices: readonly string[];
    }>;
  }>;
  stations: readonly KitsStation[];
};

const RVT_RE = /name="__RequestVerificationToken"[^>]*value="([^"]+)"/;
const GROUPED_RE = /var\s+groupedStations\s*=\s*(\[[\s\S]*?\]);/;
const JS_STATIONS_RE = /var\s+jsStations\s*=\s*(\[[\s\S]*?\]);/;

export const parseHomePage = (html: string): Result<ParsedHomePage> => {
  const rvt = html.match(RVT_RE)?.[1];
  if (!rvt) return err("parse_error", "RequestVerificationToken not found");

  const groupedMatch = html.match(GROUPED_RE);
  if (!groupedMatch) return err("parse_error", "groupedStations var not found");

  const jsMatch = html.match(JS_STATIONS_RE);
  if (!jsMatch) return err("parse_error", "jsStations var not found");

  let grouped: Array<{
    State: string;
    Stations: Array<{ Id: string; Description: string; TrainServices: string[] }>;
  }>;
  let jsList: Array<{ Id: string; StationData: string }>;
  try {
    grouped = JSON.parse(groupedMatch[1]!);
    jsList = JSON.parse(jsMatch[1]!);
  } catch (e) {
    return err("parse_error", "groupedStations / jsStations not JSON", e);
  }

  const tokenById = new Map(jsList.map((s) => [s.Id, s.StationData]));
  const stations: KitsStation[] = [];
  const groupedOut = grouped.map((g) => ({
    state: g.State,
    stations: g.Stations.map((s) => {
      const stationData = tokenById.get(s.Id);
      if (stationData) {
        stations.push({
          id: s.Id,
          description: s.Description,
          stationData,
          trainServices: s.TrainServices,
          state: g.State,
        });
      }
      return {
        id: s.Id,
        description: s.Description,
        trainServices: s.TrainServices,
      };
    }),
  }));

  return ok({
    requestVerificationToken: rvt,
    groupedStations: groupedOut,
    stations,
  });
};
