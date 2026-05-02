import type { KitsStation } from "./parse-home.js";

/**
 * GTFS stop_id (case-insensitive) → KITS station_id.
 *
 * KTMB's official GTFS feed uses numeric stop_ids that already match KITS
 * internal ids, so the resolver's id-match fallback covers that path. This
 * table is for callers that pass shorter codes or feeds with non-numeric ids.
 *
 * Coverage: every ETS/Intercity station the typical caller is likely to
 * request. Extend as needed; the unit test asserts each id resolves against a
 * station in the live home-page catalog.
 */
const KITS_ALIASES: Record<string, string> = {
  // West-coast trunk (ETS + Intercity, north→south)
  RWG: "17800",   // Rawang
  SGB: "18500",   // Sungai Buloh
  KPS: "18400",   // Kepong Sentral
  KLP: "19000",   // Kuala Lumpur (legacy station)
  KUL: "19100",   // KL Sentral
  BTS: "19600",   // Bandar Tasek Selatan
  KJG: "20400",   // Kajang
  SBN: "22700",   // Seremban
  TPN: "25100",   // Pulau Sebang / Tampin
  BMK: "26400",   // Batang Melaka
  GMS: "27800",   // Gemas
  SGM: "29100",   // Segamat
  LBS: "30500",   // Labis
  BKK: "31300",   // Bekok
  PLH: "32100",   // Paloh
  KLU: "33200",   // Kluang
  RGM: "34200",   // Rengam
  LYL: "34800",   // Layang-Layang
  KLI: "36000",   // Kulai
  KMP: "36900",   // Kempas Baru
  JBS: "37500",   // JB Sentral

  // Northern trunk (ETS + Intercity, south→north)
  TGM: "15200",   // Tanjong Malim
  BHG: "14600",   // Behrang
  SLR: "14100",   // Slim River
  SGK: "12900",   // Sungkai
  TPR: "11600",   // Tapah Road
  KPR: "10900",   // Kampar
  BGH: "9700",    // Batu Gajah
  IPH: "9000",    // Ipoh
  SSP: "7300",    // Sungai Siput
  KGS: "6300",    // Kuala Kangsar
  PRG: "5700",    // Padang Rengas
  TPG: "4700",    // Taiping
  BGS: "2600",    // Bagan Serai
  PBT: "1900",    // Parit Buntar
  NTL: "1700",    // Nibong Tebal
  BMT: "600",     // Bukit Mertajam
  BTW: "100",     // Butterworth
  SGP: "41400",   // Sungai Petani
  GRN: "42400",   // Gurun
  ASN: "44000",   // Alor Setar
  ARU: "45800",   // Arau
  PDB: "47300",   // Padang Besar

  // East-coast Intercity (south→north)
  MNT: "66100",   // Mentakab
  JRT: "68700",   // Jerantut
  KLPS: "71300",  // Kuala Lipis
  GUM: "76000",   // Gua Musang
  KKR: "82100",   // Kuala Krai
  TMR: "83700",   // Tanah Merah
  PMS: "85100",   // Pasir Mas
  WBH: "85700",   // Wakaf Bharu
  TPT: "86300",   // Tumpat

  // Cross-border
  HYI: "91000",   // Hat Yai (Thailand)
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

/** Exposed for tests only — verifies aliases stay in sync with KITS. */
export const _aliasEntries = (): ReadonlyArray<readonly [string, string]> =>
  Object.entries(KITS_ALIASES);
