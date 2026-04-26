import Fuse from "fuse.js";
import type { GtfsStore } from "../gtfs/store.js";
import type { Station } from "../types.js";
import { STATION_OVERLAY } from "./overlay.js";

export class StationsService {
  private readonly all: Station[];
  private readonly byCode = new Map<string, Station>();
  private readonly fuse: Fuse<Station>;

  constructor(store: GtfsStore) {
    this.all = store.listStops().map((s) => {
      const overlay = STATION_OVERLAY[s.stopId];
      return {
        code: s.stopId,
        nameEn: s.stopName,
        nameMs: overlay?.nameMs ?? s.stopName,
        country: overlay?.country ?? "MY",
      };
    });
    for (const s of this.all) this.byCode.set(s.code, s);
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
    return this.byCode.get(code.toUpperCase());
  }

  search(query: string, limit = 10): Station[] {
    const q = query.trim();
    if (!q) return this.all.slice(0, limit);
    return this.fuse.search(q, { limit }).map((r) => r.item);
  }

  list(): readonly Station[] {
    return this.all;
  }
}
