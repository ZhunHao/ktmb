import type { TripListingRow } from "../ktmb/parse-trip-listing.js";
import type { TrainSchedule } from "../types.js";

export type KitsFallbackInput = {
  rows: readonly TripListingRow[];
  date: string;
  fromCode: string;
  toCode: string;
};

const OVERNIGHT_RE = /^(\d{2}:\d{2})\s*\(\+1\)$/;

const addDays = (iso: string, days: number): string => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

const toMytIso = (date: string, hhmm: string): string =>
  `${date}T${hhmm}:00+08:00`;

const classifyService = (kitsService: string): "ETS" | "Intercity" => {
  if (/intercity/i.test(kitsService)) return "Intercity";
  return "ETS";
};

export const kitsRowsToSchedules = (
  input: KitsFallbackInput,
): TrainSchedule[] => {
  const out: TrainSchedule[] = [];
  for (const row of input.rows) {
    const overnight = OVERNIGHT_RE.exec(row.arrival);
    const arrivalHHMM = overnight ? overnight[1]! : row.arrival;
    const arrivalDate = overnight ? addDays(input.date, 1) : input.date;
    out.push({
      trainNo: row.trainNo,
      service: classifyService(row.service),
      bookingProvider: "KTMB",
      from: {
        stationCode: input.fromCode,
        arrival: null,
        departure: toMytIso(input.date, row.departure),
      },
      to: {
        stationCode: input.toCode,
        arrival: toMytIso(arrivalDate, arrivalHHMM),
        departure: null,
      },
      classes: [],
      journeyDurationMinutes: row.durationMinutes,
    });
  }
  return out;
};
