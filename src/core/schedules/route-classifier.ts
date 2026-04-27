export type Service = "ETS" | "Intercity" | "Komuter" | "ShuttleTebrau";

/**
 * Subset of GTFS `Route` fields used by the classifier. `routeType` is optional
 * so the synthetic test fixture (which omits it) still passes through the
 * prefix-based fallbacks below.
 */
export interface RouteLike {
  routeId: string;
  routeShortName: string;
  routeLongName: string;
  routeType?: number;
}

/**
 * Map a GTFS route to one of the four KTMB services we support.
 *
 * Real-feed conventions (verified against
 * `https://api.data.gov.my/gtfs-static/ktmb` on 2026-04-27):
 *
 *   route_type=0 → Komuter (covers both Klang Valley lines like `KC05_KB18`
 *                  "Seremban Line" and Komuter Utara lines like `100_47300`
 *                  "Padang Besar Line").
 *   route_id="ETS" or long name "Electric Train Service ..." → ETS.
 *   route_id="ST" or long name contains "Shuttle Tebrau" → ShuttleTebrau.
 *   Otherwise (e.g. `SH`, `ERT`, `ES`) → Intercity.
 *
 * Synthetic-fixture fallbacks (used only by unit tests):
 *   id starts with `KOM` → Komuter
 *   id starts with `ETS-` → ETS
 *   id starts with `STT` → ShuttleTebrau
 */
export const classifyRoute = (route: RouteLike): Service => {
  const id = route.routeId.toUpperCase();
  const long = route.routeLongName.toUpperCase();
  const short = route.routeShortName.toUpperCase();

  // GTFS route_type=0 (tram/light rail/streetcar) is what the real KTMB feed
  // uses for both Klang Valley Komuter and Komuter Utara. Synthetic fixture
  // signals Komuter via the `KOM` route_id prefix.
  if (route.routeType === 0 || id.startsWith("KOM")) return "Komuter";

  // ETS — real id is exactly "ETS"; long name is "Electric Train Service ...".
  // Synthetic fixture uses route_ids like "ETS-N".
  if (
    id === "ETS" ||
    id.startsWith("ETS-") ||
    short === "ETS" ||
    long.includes("ELECTRIC TRAIN SERVICE")
  ) {
    return "ETS";
  }

  // Shuttle Tebrau — real id is exactly "ST" with long name containing
  // "Shuttle Tebrau". Synthetic fixture uses "STT" prefix. Note: the
  // Tumpat–Gemas Intercity Shuttle (`SH`) is NOT Shuttle Tebrau even though
  // its long name contains the word "Shuttle".
  if (id === "ST" || id.startsWith("STT") || long.includes("SHUTTLE TEBRAU")) {
    return "ShuttleTebrau";
  }

  return "Intercity";
};
