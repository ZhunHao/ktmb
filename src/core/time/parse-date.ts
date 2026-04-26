import * as chrono from "chrono-node";
import type { Result } from "../result.js";
import { err, ok } from "../result.js";
import { mytDate } from "./myt.js";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const parseDateMyt = (input: string, now: Date): Result<string> => {
  const trimmed = input.trim();
  if (ISO_DATE.test(trimmed)) {
    const [y, m, d] = trimmed.split("-").map(Number) as [number, number, number];
    if (m < 1 || m > 12 || d < 1 || d > 31) {
      return err("invalid_input", `invalid date: ${trimmed}`);
    }
    const dt = new Date(Date.UTC(y, m - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
      return err("invalid_input", `invalid date: ${trimmed}`);
    }
    return ok(trimmed);
  }
  const result = chrono.parseDate(trimmed, now, { forwardDate: true });
  if (!result) return err("invalid_input", `could not parse date: ${input}`);
  const utcMillis = result.getTime();
  const mytMillis = utcMillis + 8 * 60 * 60 * 1000;
  const dt = new Date(mytMillis);
  return ok(mytDate(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()));
};
