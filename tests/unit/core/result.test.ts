import { describe, expect, it } from "vitest";
import { ok, err, isOk, isErr, type Result } from "../../../src/core/result.js";

describe("Result helpers", () => {
  it("ok wraps data with discriminator", () => {
    const r: Result<number> = ok(42);
    expect(r).toEqual({ ok: true, data: 42 });
    expect(isOk(r)).toBe(true);
    expect(isErr(r)).toBe(false);
  });

  it("err wraps error with discriminator", () => {
    const r = err("invalid_input", "missing 'from'");
    expect(r).toEqual({ ok: false, error: { code: "invalid_input", message: "missing 'from'" } });
    expect(isErr(r)).toBe(true);
    expect(isOk(r)).toBe(false);
  });

  it("err preserves cause", () => {
    const cause = { raw: "..." };
    const r = err("parse_error", "schema mismatch", cause);
    if (r.ok) throw new Error("expected err");
    expect(r.error.cause).toBe(cause);
  });
});
