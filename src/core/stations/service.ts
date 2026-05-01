import Fuse from "fuse.js";
import type { GtfsStore } from "../gtfs/store.js";
import { classifyRoute } from "../schedules/route-classifier.js";
import type { Service } from "../schedules/route-classifier.js";
import type { Station } from "../types.js";
import { STATION_OVERLAY } from "./overlay.js";

export class StationsService {
  private all: Station[] = [];
  private byCode = new Map<string, Station>();
  private fuse: Fuse<Station>;
  private lastStore: GtfsStore | undefined;

  constructor(private readonly getStore: () => GtfsStore) {
    this.fuse = new Fuse<Station>([], { keys: [], threshold: 0.4 });
    this.rebuild();
  }

  private rebuild(): void {
    const store = this.getStore();
    if (store === this.lastStore) return;
    this.lastStore = store;

    const linesByStop = new Map<string, Set<Service>>();
    for (const route of store.listRoutes()) {
      const service = classifyRoute(route);
      const trips = store.tripsForRoute(route.routeId);
      for (const trip of trips) {
        for (const st of store.stopTimesForTrip(trip.tripId)) {
          let bag = linesByStop.get(st.stopId);
          if (!bag) {
            bag = new Set();
            linesByStop.set(st.stopId, bag);
          }
          bag.add(service);
        }
      }
    }

    const orderRank: Record<Service, number> = {
      ETS: 0,
      Intercity: 1,
      Komuter: 2,
      ShuttleTebrau: 3,
    };
    this.all = store.listStops().map((s) => {
      const overlay = STATION_OVERLAY[s.stopId];
      const set = linesByStop.get(s.stopId);
      const lines = set
        ? [...set].sort((a, b) => orderRank[a] - orderRank[b])
        : undefined;
      return {
        code: s.stopId,
        nameEn: s.stopName,
        nameMs: overlay?.nameMs ?? s.stopName,
        country: overlay?.country ?? "MY",
        ...(lines ? { lines } : {}),
      };
    });
    this.byCode = new Map(this.all.map((s) => [s.code, s]));
    this.fuse = new Fuse(this.all, {
      keys: [
        { name: "code", weight: 0.5 },
        { name: "nameEn", weight: 0.3 },
        { name: "nameMs", weight: 0.2 },
      ],
      threshold: 0.4,
      includeScore: true,
    });
  }

  getByCode(code: string): Station | undefined {
    this.rebuild();
    return this.byCode.get(code.toUpperCase());
  }

  search(query: string, limit = 10): Station[] {
    this.rebuild();
    const q = query.trim();
    if (!q) return this.all.slice(0, limit);
    return this.fuse.search(q, { limit }).map((r) => r.item);
  }

  list(): readonly Station[] {
    this.rebuild();
    return this.all;
  }
}
