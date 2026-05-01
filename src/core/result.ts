export type ErrorCode =
  | "invalid_input"
  | "not_found"
  | "rate_limited"
  | "upstream_error"
  | "parse_error"
  | "outside_calendar_window";

export type ResultError = {
  code: ErrorCode;
  message: string;
  cause?: unknown;
};

export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: ResultError };

export const ok = <T>(data: T): Result<T> => ({ ok: true, data });

export const err = <T = never>(
  code: ErrorCode,
  message: string,
  cause?: unknown,
): Result<T> => ({
  ok: false,
  error: cause === undefined ? { code, message } : { code, message, cause },
});

export const isOk = <T>(r: Result<T>): r is { ok: true; data: T } => r.ok;
export const isErr = <T>(r: Result<T>): r is { ok: false; error: ResultError } => !r.ok;
