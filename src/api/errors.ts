import type { Context } from "hono";
import { errorResponse } from "./envelope.js";
import { createLogger, type Logger } from "../runtime/logger.js";

let activeLogger: Logger = createLogger();

export const setApiLogger = (logger: Logger): void => {
  activeLogger = logger;
};

export const onError = (e: unknown, _c: Context): Response => {
  activeLogger.error("[api] unhandled", e);
  return errorResponse("upstream_error", "internal error");
};
