const pad2 = (n: number) => String(n).padStart(2, "0");

const HHMM = /^(\d{2}):(\d{2})$/;

export const mytDate = (y: number, m: number, d: number): string =>
  `${y}-${pad2(m)}-${pad2(d)}`;

export const isoMyt = (date: string, h: number, m: number, s: number): string =>
  `${date}T${pad2(h)}:${pad2(m)}:${pad2(s)}+08:00`;

export const addDaysMyt = (date: string, days: number): string => {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const utc = Date.UTC(y, m - 1, d) + days * 86_400_000;
  const dt = new Date(utc);
  return mytDate(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
};

/**
 * Build an ISO 8601 MYT timestamp from a service date and a "HH:MM" string.
 * Throws on malformed input — callers should validate at the boundary.
 */
export const isoMytFromHHMM = (date: string, hhmm: string): string => {
  const match = HHMM.exec(hhmm);
  if (!match) throw new Error(`invalid HH:MM: ${hhmm}`);
  return isoMyt(date, Number(match[1]), Number(match[2]), 0);
};

/**
 * Convert a Unix epoch (seconds) to an ISO 8601 MYT timestamp.
 * Used by GTFS-RT decoders where vehicle/header timestamps arrive as epoch.
 */
export const epochToIsoMyt = (epochSeconds: number): string => {
  const shifted = new Date(epochSeconds * 1000 + 8 * 60 * 60 * 1000);
  return isoMyt(
    mytDate(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate()),
    shifted.getUTCHours(),
    shifted.getUTCMinutes(),
    shifted.getUTCSeconds(),
  );
};
