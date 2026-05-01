import { describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { onError } from "../../../src/api/errors.js";

describe("api onError", () => {
  it("returns the upstream_error envelope and logs the cause", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const app = new Hono();
      app.onError(onError);
      app.get("/boom", () => {
        throw new Error("kaboom");
      });
      const res = await app.request("/boom");
      expect(res.status).toBe(502);
      const body = (await res.json()) as { ok: false; error: { code: string; message: string } };
      expect(body).toEqual({
        ok: false,
        error: { code: "upstream_error", message: "internal error" },
      });
      expect(spy).toHaveBeenCalledWith("[api] unhandled", expect.any(Error));
    } finally {
      spy.mockRestore();
    }
  });
});
