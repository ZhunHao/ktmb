import { describe, expect, it } from "vitest";
import { classifyRoute } from "../../../../src/core/schedules/route-classifier.js";

describe("classifyRoute (synthetic fixture conventions)", () => {
  it("recognises ETS by route_id prefix", () => {
    expect(classifyRoute({ routeId: "ETS-N", routeShortName: "EG", routeLongName: "" })).toBe(
      "ETS",
    );
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

// Real-feed shapes verified against api.data.gov.my/gtfs-static/ktmb on
// 2026-04-27. See CHANGELOG.md for the full route enumeration.
describe("classifyRoute (real KTMB feed shapes)", () => {
  it("classifies Klang Valley Seremban Line as Komuter via route_type=0", () => {
    expect(
      classifyRoute({
        routeId: "KC05_KB18",
        routeShortName: "Seremban Line",
        routeLongName: "KTM Batu Caves - Pulau Sebang/Tampin",
        routeType: 0,
      }),
    ).toBe("Komuter");
  });

  it("classifies Klang Valley Port Klang Line as Komuter", () => {
    expect(
      classifyRoute({
        routeId: "KA15_KD19",
        routeShortName: "Port Klang Line",
        routeLongName: "KTM Tanjung Malim - Pelabuhan Klang",
        routeType: 0,
      }),
    ).toBe("Komuter");
  });

  it("classifies Komuter Utara Padang Besar Line as Komuter", () => {
    expect(
      classifyRoute({
        routeId: "100_47300",
        routeShortName: "Padang Besar Line",
        routeLongName: "KTM Butterworth - Padang Besar",
        routeType: 0,
      }),
    ).toBe("Komuter");
  });

  it("classifies Komuter Utara Ipoh Line as Komuter", () => {
    expect(
      classifyRoute({
        routeId: "100_9000",
        routeShortName: "Ipoh Line",
        routeLongName: "KTM Butterworth - Ipoh",
        routeType: 0,
      }),
    ).toBe("Komuter");
  });

  it("classifies the real ETS route as ETS via route_id and long name", () => {
    expect(
      classifyRoute({
        routeId: "ETS",
        routeShortName: "ETS",
        routeLongName: "Electric Train Service Padang Besar - Gemas",
        routeType: 2,
      }),
    ).toBe("ETS");
  });

  it("classifies Shuttle Tebrau (route_id ST) as ShuttleTebrau", () => {
    expect(
      classifyRoute({
        routeId: "ST",
        routeShortName: "ST",
        routeLongName: "Intercity Shuttle Tebrau JB Sentral - Woodlands",
        routeType: 2,
      }),
    ).toBe("ShuttleTebrau");
  });

  it("classifies Ekspres Rakyat Timuran (ERT) as Intercity", () => {
    expect(
      classifyRoute({
        routeId: "ERT",
        routeShortName: "ERT",
        routeLongName: "Intercity Ekspres Rakyat Timuran Tumpat - JB Sentral",
        routeType: 2,
      }),
    ).toBe("Intercity");
  });

  it("classifies Ekspres Selatan (ES) as Intercity", () => {
    expect(
      classifyRoute({
        routeId: "ES",
        routeShortName: "ES",
        routeLongName: "Intercity Ekspres Selatan Gemas - JB Sentral",
        routeType: 2,
      }),
    ).toBe("Intercity");
  });

  it("classifies Tumpat-Gemas Intercity Shuttle (SH) as Intercity, NOT ShuttleTebrau", () => {
    // Critical distinction: long name contains the word "Shuttle" but NOT
    // "Shuttle Tebrau", and route_id is "SH" not "ST". Must classify as
    // Intercity to avoid lumping the Jungle Railway shuttle with Tebrau.
    expect(
      classifyRoute({
        routeId: "SH",
        routeShortName: "SH",
        routeLongName: "Intercity Shuttle Tumpat - Gemas",
        routeType: 2,
      }),
    ).toBe("Intercity");
  });
});
