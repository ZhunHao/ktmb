import { describe, expect, it } from "vitest";
import { classifyRoute } from "../../../../src/core/schedules/route-classifier.js";

describe("classifyRoute", () => {
  it("classifies ETS by route_id", () => {
    expect(
      classifyRoute({ routeId: "ETS", routeShortName: "EG", routeLongName: "" }),
    ).toBe("ETS");
  });

  it("classifies ETS by route_long_name substring", () => {
    expect(
      classifyRoute({
        routeId: "X",
        routeShortName: "",
        routeLongName: "Electric Train Service Southbound",
      }),
    ).toBe("ETS");
  });

  it("classifies Komuter by route_type=0", () => {
    expect(
      classifyRoute({
        routeId: "KC05_KB18",
        routeShortName: "KP",
        routeLongName: "",
        routeType: 0,
      }),
    ).toBe("Komuter");
  });

  it("classifies Shuttle Tebrau by route_id", () => {
    expect(
      classifyRoute({ routeId: "ST", routeShortName: "ST", routeLongName: "Shuttle Tebrau" }),
    ).toBe("ShuttleTebrau");
  });

  it("classifies Intercity Shuttle Tumpat-Gemas (SH) as Intercity, not ShuttleTebrau", () => {
    expect(
      classifyRoute({
        routeId: "SH",
        routeShortName: "SH",
        routeLongName: "Intercity Shuttle Tumpat - Gemas",
      }),
    ).toBe("Intercity");
  });

  it("falls through to Intercity for unrecognized routes", () => {
    expect(
      classifyRoute({ routeId: "ERT", routeShortName: "EW", routeLongName: "Ekspres Rakyat" }),
    ).toBe("Intercity");
  });
});
