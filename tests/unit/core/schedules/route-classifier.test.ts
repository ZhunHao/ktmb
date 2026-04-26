import { describe, expect, it } from "vitest";
import { classifyRoute } from "../../../../src/core/schedules/route-classifier.js";

describe("classifyRoute", () => {
  it("recognises ETS by route_id prefix", () => {
    expect(classifyRoute({ routeId: "ETS-N", routeShortName: "EG", routeLongName: "" })).toBe("ETS");
  });
  it("recognises Komuter", () => {
    expect(classifyRoute({ routeId: "KOM-PK", routeShortName: "KP", routeLongName: "" })).toBe(
      "Komuter",
    );
  });
  it("recognises Intercity", () => {
    expect(
      classifyRoute({ routeId: "INT-EKW", routeShortName: "EW", routeLongName: "Ekspres Rakyat" }),
    ).toBe("Intercity");
  });
  it("recognises Shuttle Tebrau", () => {
    expect(
      classifyRoute({ routeId: "STT", routeShortName: "ST", routeLongName: "Shuttle Tebrau" }),
    ).toBe("ShuttleTebrau");
  });
});
