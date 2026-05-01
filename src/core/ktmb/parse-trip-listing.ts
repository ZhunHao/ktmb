import * as cheerio from "cheerio";
import type { Result } from "../result.js";
import { err, ok } from "../result.js";

export type TripListingRow = {
  trainNo: string;
  service: string; // e.g. "Platinum", "Express", "Gold"
  departure: string; // "HH:MM"
  arrival: string; // "HH:MM" or "HH:MM (+1)"
  durationMinutes: number;
  seatsAvailable: number; // listing-level (includes OKU)
  minFareMinor: number; // MYR cents
  tripData: string; // opaque token for /Trip/LayoutV2
};

const FARE_RE = /([A-Z]{3})\s+([\d,]+(?:\.\d+)?)/;
const DURATION_RE = /(\d+)\s*h\s*(\d+)?\s*m?/i;

const parseDurationToMinutes = (text: string): number => {
  const m = DURATION_RE.exec(text.replace(/\s+/g, " ").trim());
  if (!m) return 0;
  return Number(m[1]) * 60 + Number(m[2] ?? "0");
};

const parseFareToMinor = (text: string): number => {
  const m = FARE_RE.exec(text);
  if (!m) return 0;
  return Math.round(Number(m[2]!.replace(/,/g, "")) * 100);
};

export const parseTripListing = (body: string): Result<TripListingRow[]> => {
  let envelope: { status: boolean; messageCode?: string | null; data?: string };
  try {
    envelope = JSON.parse(body);
  } catch (e) {
    return err("parse_error", "trip listing not JSON", e);
  }
  if (!envelope.status) {
    return err(
      "parse_error",
      `KITS rejected listing (messageCode=${envelope.messageCode ?? "null"})`,
    );
  }
  const html = envelope.data ?? "";
  const $ = cheerio.load(html);
  const rows: TripListingRow[] = [];
  $("tbody tr").each((_, tr) => {
    const tds = $(tr)
      .find("td")
      .map((__, td) => $(td).text().replace(/\s+/g, " ").trim())
      .toArray();
    if (tds.length < 7) return;
    const serviceCell = tds[0]!;
    const trainMatch = /(\w+)\s*-\s*(\d{3,5})/.exec(serviceCell);
    if (!trainMatch) return;
    const tripData = $(tr).find("a[data-tripdata]").attr("data-tripdata") ?? "";
    rows.push({
      trainNo: trainMatch[2]!,
      service: trainMatch[1]!,
      departure: tds[1]!,
      arrival: tds[2]!,
      durationMinutes: parseDurationToMinutes(tds[3]!),
      seatsAvailable: Number(tds[4]!.replace(/[^\d]/g, "")) || 0,
      minFareMinor: parseFareToMinor(tds[5]!),
      tripData,
    });
  });
  return ok(rows);
};
