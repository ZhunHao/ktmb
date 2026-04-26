import { describe, expect, it } from "vitest";
import { parseStaticFeed } from "../../../../src/core/gtfs/static-parser.js";
import { GtfsStore } from "../../../../src/core/gtfs/store.js";
import { StationsService } from "../../../../src/core/stations/service.js";
import { buildMiniFeed } from "../gtfs/_make-fixture.js";

const make = () => new StationsService(new GtfsStore(parseStaticFeed(buildMiniFeed())));

describe("StationsService", () => {
  it("getByCode resolves a known station", () => {
    expect(make().getByCode("KUL")?.nameEn).toBe("KL Sentral");
  });

  it("search fuzzy-matches typos", () => {
    const matches = make().search("Sentrla");
    expect(matches.some((s) => s.code === "KUL")).toBe(true);
  });

  it("search ranks exact code first", () => {
    const matches = make().search("BTW");
    expect(matches[0]?.code).toBe("BTW");
  });

  it("search returns at most 10 by default", () => {
    expect(make().search("a").length).toBeLessThanOrEqual(10);
  });

  it("Woodlands CIQ is tagged as country=SG", () => {
    expect(make().getByCode("WCQ")?.country).toBe("SG");
  });
});
