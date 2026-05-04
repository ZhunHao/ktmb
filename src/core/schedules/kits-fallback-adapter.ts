import type { TripListingRow } from "../ktmb/parse-trip-listing.js";
import { addDaysMyt, isoMytFromHHMM } from "../time/myt.js";
import type { TrainSchedule } from "../types.js";

export type KitsFallbackInput = {
  rows: readonly TripListingRow[];
  date: string;
  fromCode: string;
  toCode: string;
};

// Accept both "00:20 (+1)" (KTMB's printed badge text after some whitespace
// normalisation) and "00:20 +1" (the form produced when cheerio's `.text()`
// collapses inline spans without preserving the parens). Both signal an
// arrival that crosses midnight relative to the departure date.
const OVERNIGHT_RE = /^(\d{2}:\d{2})\s*\(?\+1\)?$/;

const classifyService = (
  kitsService: string,
): "ETS" | "Intercity" | "ShuttleTebrau" => {
  // Order matters: GTFS routes named "Intercity Shuttle ..." must classify
  // as Intercity, not ShuttleTebrau. Match the long form first.
  if (/intercity/i.test(kitsService)) return "Intercity";
  if (/tebrau/i.test(kitsService)) return "ShuttleTebrau";
  return "ETS";
};

export const kitsRowsToSchedules = (
  input: KitsFallbackInput,
): TrainSchedule[] => {
  const out: TrainSchedule[] = [];
  for (const row of input.rows) {
    const overnight = OVERNIGHT_RE.exec(row.arrival);
    const arrivalHHMM = overnight ? overnight[1]! : row.arrival;
    const arrivalDate = overnight ? addDaysMyt(input.date, 1) : input.date;
    out.push({
      trainNo: row.trainNo,
      service: classifyService(row.service),
      bookingProvider: "KTMB",
      from: {
        stationCode: input.fromCode,
        arrival: null,
        departure: isoMytFromHHMM(input.date, row.departure),
      },
      to: {
        stationCode: input.toCode,
        arrival: isoMytFromHHMM(arrivalDate, arrivalHHMM),
        departure: null,
      },
      classes: [],
      journeyDurationMinutes: row.durationMinutes,
    });
  }
  return out;
};
