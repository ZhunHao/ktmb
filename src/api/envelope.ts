import type { ErrorCode } from "../core/result.js";

export const statusForError = (code: ErrorCode): number => {
  switch (code) {
    case "invalid_input":
      return 400;
    case "not_found":
      return 404;
    case "rate_limited":
      return 429;
    case "outside_calendar_window":
      return 422;
    case "upstream_error":
    case "parse_error":
      return 502;
    case "internal_error":
      return 500;
  }
};

export const okResponse = <T>(data: T, status = 200): Response =>
  new Response(JSON.stringify({ ok: true, data }), {
    status,
    headers: { "content-type": "application/json" },
  });

export const errorResponse = (code: ErrorCode, message: string, cause?: unknown): Response =>
  new Response(
    JSON.stringify({
      ok: false,
      error: cause === undefined ? { code, message } : { code, message, cause },
    }),
    { status: statusForError(code), headers: { "content-type": "application/json" } },
  );
