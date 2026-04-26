import { describe, expect, it } from "vitest";
import { okResponse, errorResponse, statusForError } from "../../../src/api/envelope.js";

describe("REST envelope helpers", () => {
  it("okResponse wraps data", async () => {
    const r = okResponse({ a: 1 });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, data: { a: 1 } });
  });

  it("errorResponse uses correct status per code", async () => {
    const cases: Array<[Parameters<typeof errorResponse>[0], number]> = [
      ["invalid_input", 400],
      ["not_found", 404],
      ["rate_limited", 429],
      ["upstream_error", 502],
      ["parse_error", 502],
    ];
    for (const [code, expected] of cases) {
      const r = errorResponse(code, "x");
      expect(r.status).toBe(expected);
      expect(statusForError(code)).toBe(expected);
      expect(await r.json()).toEqual({ ok: false, error: { code, message: "x" } });
    }
  });
});
