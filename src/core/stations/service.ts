import Fuse from "fuse.js";
import type { GtfsStore } from "../gtfs/store.js";
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
    this.all = store.listStops().map((s) => {
      const overlay = STATION_OVERLAY[s.stopId];
      return {
        code: s.stopId,
        nameEn: s.stopName,
        nameMs: overlay?.nameMs ?? s.stopName,
        country: overlay?.country ?? "MY",
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
