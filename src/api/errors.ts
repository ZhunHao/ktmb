import type { Context } from "hono";
import { errorResponse } from "./envelope.js";

export const onError = (e: unknown, _c: Context): Response => {
  console.error("[api] unhandled", e);
  return errorResponse("upstream_error", "internal error");
};
