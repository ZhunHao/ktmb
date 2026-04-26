import { describe, expect, it } from "vitest";
import { createKtmb } from "../../../src/core/index.js";
import { GtfsStore } from "../../../src/core/gtfs/store.js";
import { parseStaticFeed } from "../../../src/core/gtfs/static-parser.js";
import { ok, type Result } from "../../../src/core/result.js";
import { buildMiniFeed } from "./gtfs/_make-fixture.js";
import type { TrainClass, VehiclePosition } from "../../../src/core/types.js";

const fakeKtmb = async (): Promise<Result<TrainClass[]>> => ok([]);
const fakeRt = async (): Promise<Result<VehiclePosition[]>> => ok([]);

describe("createKtmb facade", () => {
  it("wires services around an injected GtfsStore", async () => {
    const ktmb = createKtmb({
      store: new GtfsStore(parseStaticFeed(buildMiniFeed())),
      fareGetter: fakeKtmb,
      realtimeFetcher: fakeRt,
    });
    expect(ktmb.stations.getByCode("KUL")?.code).toBe("KUL");
    const sched = ktmb.schedules.listSchedules({ from: "KUL", to: "BTW", date: "2026-05-01" });
    expect(sched.ok).toBe(true);
    const fares = await ktmb.fares.get({
      from: "KUL",
      to: "BTW",
      date: "2026-05-01",
      trainNo: "EG9322",
    });
    expect(fares.ok).toBe(true);
    const lines = ktmb.komuter.listLines();
    expect(lines.ok).toBe(true);
    const rt = await ktmb.realtime.getPositions();
    expect(rt.ok).toBe(true);
  });
});
