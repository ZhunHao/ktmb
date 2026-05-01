import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { parseTripForm } from "../../../../src/core/ktmb/parse-trip-form.js";

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(
  resolve(here, "../../../fixtures/ktmb/trip-form.html"),
  "utf8",
);

describe("parseTripForm", () => {
  it("returns SearchData, FormValidationCode, and rotated RVT", () => {
    const r = parseTripForm(html);
    if (!r.ok) throw new Error(r.error.message);
    expect(r.data.searchData).toMatch(/REDACTED/);
    expect(r.data.formValidationCode).toMatch(/REDACTED/);
    expect(r.data.requestVerificationToken).toMatch(/REDACTED/);
  });

  it("returns parse_error if SearchData hidden input is absent", () => {
    const r = parseTripForm("<html></html>");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("parse_error");
  });
});
