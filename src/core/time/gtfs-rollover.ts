import { addDaysMyt, isoMyt } from "./myt.js";

const GTFS_TIME = /^(\d{2,3}):(\d{2}):(\d{2})$/;

export const gtfsTimeToIso = (serviceDate: string, hms: string): string => {
  const m = GTFS_TIME.exec(hms);
  if (!m) throw new Error(`invalid GTFS time: ${hms}`);
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  const ss = Number(m[3]);
  if (mm > 59 || ss > 59) throw new Error(`invalid GTFS time: ${hms}`);
  const dayOffset = Math.floor(hh / 24);
  const hour = hh % 24;
  const date = dayOffset === 0 ? serviceDate : addDaysMyt(serviceDate, dayOffset);
  return isoMyt(date, hour, mm, ss);
};

const HHMM = /^(\d{2}):(\d{2})$/;

export type KtmbStopInput = { hhmm: string };
export type KtmbStopOutput = { iso: string };

export const ktmbTimeRollover = (
  startDate: string,
  stops: readonly KtmbStopInput[],
): KtmbStopOutput[] => {
  let date = startDate;
  let prevMinutes = -1;
  const out: KtmbStopOutput[] = [];
  for (const s of stops) {
    const m = HHMM.exec(s.hhmm);
    if (!m) throw new Error(`invalid HH:MM: ${s.hhmm}`);
    const hh = Number(m[1]);
    const mm = Number(m[2]);
    const minutes = hh * 60 + mm;
    if (prevMinutes >= 0 && minutes < prevMinutes) {
      date = addDaysMyt(date, 1);
    }
    out.push({ iso: isoMyt(date, hh, mm, 0) });
    prevMinutes = minutes;
  }
  return out;
};
