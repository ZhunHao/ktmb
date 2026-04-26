export type StationOverlay = {
  country: "MY" | "SG" | "TH";
  nameMs?: string;
};

export const STATION_OVERLAY: Record<string, StationOverlay> = {
  WCQ: { country: "SG", nameMs: "Woodlands CIQ" },
};
