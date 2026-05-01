import type { KitsStation } from "./parse-home.js";

const KITS_ALIASES: Record<string, string> = {
  // GTFS stop_id → KITS station_id, hand-curated for cases name matching misses.
  // Extend as needed; tests cover the resolver, this map is data.
  KUL: "19100", // KL Sentral
  BTW: "100",  // Butterworth
  ASN: "44000", // Alor Setar
};

export type GtfsStopRef = { stopId: string; stopName: string };

const norm = (s: string): string => s.trim().toUpperCase();

export const resolveKitsStationId = (
  catalog: readonly KitsStation[],
  stop: GtfsStopRef,
): string | undefined => {
  const aliased = KITS_ALIASES[norm(stop.stopId)];
  if (aliased) return aliased;
  const wantName = norm(stop.stopName);
  const byName = catalog.find((s) => norm(s.description) === wantName);
  if (byName) return byName.id;
  const byId = catalog.find((s) => norm(s.id) === norm(stop.stopId));
  return byId?.id;
};
