import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { parseHomePage } from "../../../../src/core/ktmb/parse-home.js";

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(
  resolve(here, "../../../fixtures/ktmb/home.html"),
  "utf8",
);

describe("parseHomePage", () => {
  it("returns the request verification token (post-redaction marker)", () => {
    const r = parseHomePage(html);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.requestVerificationToken).toBe("<RVT_REDACTED>");
  });

  it("parses 12 state groups and 110 stations", () => {
    const r = parseHomePage(html);
    if (!r.ok) throw new Error(r.error.message);
    expect(r.data.groupedStations.length).toBe(12);
    expect(r.data.stations.length).toBe(110);
  });

  it("includes KL Sentral with id 19100 and a station data token", () => {
    const r = parseHomePage(html);
    if (!r.ok) throw new Error(r.error.message);
    const kl = r.data.stations.find((s) => s.id === "19100");
    expect(kl?.description).toBe("KL SENTRAL");
    expect(kl?.stationData).toMatch(/REDACTED/);
  });

  it("returns parse_error on a page missing groupedStations", () => {
    const r = parseHomePage("<html><body>nope</body></html>");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("parse_error");
  });
});
