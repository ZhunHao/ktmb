import type { Result } from "../result.js";
import { err } from "../result.js";
import { fetchWithRetry } from "../client/http.js";
import type { TrainClass } from "../types.js";
import { parseAvailabilityResponse } from "./parser.js";

const BASE = "https://online.ktmb.com.my";

export type GetAvailabilityInput = {
  from: string;
  to: string;
  date: string;
  trainNo: string;
};

export const getAvailability = async (
  input: GetAvailabilityInput,
): Promise<Result<TrainClass[]>> => {
  // Replace path/method with the real endpoint from Task 11's capture.
  const url = `${BASE}/api/availability`;
  const res = await fetchWithRetry(url, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) return res;
  let json: unknown;
  try {
    json = await res.data.json();
  } catch (e) {
    return err("parse_error", "KTMB returned non-JSON body", e);
  }
  return parseAvailabilityResponse(json);
};
