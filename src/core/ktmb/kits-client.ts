import type { Result } from "../result.js";
import { err, ok } from "../result.js";
import { CookieJar } from "./cookie-jar.js";
import { parseHomePage, type ParsedHomePage } from "./parse-home.js";
import { parseTripForm } from "./parse-trip-form.js";
import { parseTripListing, type TripListingRow } from "./parse-trip-listing.js";
import { parseLayout, type ParsedLayout } from "./parse-layout.js";

const BASE = "https://online.ktmb.com.my";
const UA = "ktmb/0.3 (+https://github.com/zhunhao/ktmb)";

export type KitsClientOptions = {
  cookie?: string;        // pre-supplied Cookie header (auth mode)
  fetcher?: typeof fetch; // injection seam for tests
};

export type SearchTripsInput = {
  fromKitsId: string;
  toKitsId: string;
  date: string; // YYYY-MM-DD
  pax?: number;
};

export type GetLayoutInput = {
  tripData: string;
  pax?: number;
};

const monthsShort = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const formatOnward = (iso: string): string => {
  const [y, m, d] = iso.split("-").map((n) => Number(n));
  return `${d} ${monthsShort[m! - 1]} ${y}`;
};

export class KitsClient {
  private readonly jar = new CookieJar();
  private readonly fetcher: typeof fetch;
  private home: ParsedHomePage | undefined;
  private searchData: string | undefined;

  constructor(opts: KitsClientOptions = {}) {
    this.fetcher = opts.fetcher ?? fetch;
    if (opts.cookie) this.jar.seedFromHeader(opts.cookie);
  }

  private async send(
    path: string,
    init: RequestInit,
  ): Promise<{ status: number; body: string }> {
    const res = await this.fetcher(`${BASE}${path}`, {
      ...init,
      headers: {
        ...(init.headers as Record<string, string> | undefined),
        Cookie: this.jar.toHeader(),
        "User-Agent": UA,
      },
    });
    const sc = res.headers.getSetCookie?.() ?? [];
    this.jar.absorb(sc);
    return { status: res.status, body: await res.text() };
  }

  private async ensureHome(): Promise<Result<ParsedHomePage>> {
    if (this.home) return ok(this.home);
    const r = await this.send("/", { method: "GET" });
    if (r.status !== 200) {
      return err("upstream_error", `home returned HTTP ${r.status}`);
    }
    const parsed = parseHomePage(r.body);
    if (!parsed.ok) return parsed;
    this.home = parsed.data;
    return ok(parsed.data);
  }

  async getStationCatalog(): Promise<Result<ParsedHomePage["stations"]>> {
    const home = await this.ensureHome();
    if (!home.ok) return home;
    return ok(home.data.stations);
  }

  async searchTrips(input: SearchTripsInput): Promise<Result<TripListingRow[]>> {
    const home = await this.ensureHome();
    if (!home.ok) return home;

    const from = home.data.stations.find((s) => s.id === input.fromKitsId);
    const to = home.data.stations.find((s) => s.id === input.toKitsId);
    if (!from || !to) {
      return err("not_found", `unknown KITS station id: ${input.fromKitsId}/${input.toKitsId}`);
    }

    // Browser-like headers — KITS content-negotiates on Accept; without these
    // Sec-Fetch / Accept headers, /Trip returns the GetTripToken JSON instead
    // of the listing HTML we need to extract SearchData/FormValidationCode from.
    // Verified live 2026-05-02 via scripts/capture-ktmb-fixtures.ts.
    const tripForm = await this.send("/Trip", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-User": "?1",
        "Upgrade-Insecure-Requests": "1",
        Referer: `${BASE}/`,
      },
      body: new URLSearchParams({
        FromStationData: from.stationData,
        ToStationData: to.stationData,
        FromStationId: from.id,
        ToStationId: to.id,
        OnwardDate: formatOnward(input.date),
        ReturnDate: "",
        PassengerCount: String(input.pax ?? 1),
        __RequestVerificationToken: home.data.requestVerificationToken,
      }).toString(),
    });
    if (tripForm.status !== 200) {
      return err("upstream_error", `/Trip returned HTTP ${tripForm.status}`);
    }
    const formParsed = parseTripForm(tripForm.body);
    if (!formParsed.ok) return formParsed;
    this.searchData = formParsed.data.searchData;
    const rvt = formParsed.data.requestVerificationToken;

    const tokenRes = await this.send(`/Trip/GetTripToken?t=${Date.now()}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        RequestVerificationToken: rvt,
        "X-Requested-With": "XMLHttpRequest",
      },
      body: JSON.stringify({ FormToken: formParsed.data.formValidationCode }),
    });
    if (tokenRes.status !== 200) {
      return err("upstream_error", `/Trip/GetTripToken returned HTTP ${tokenRes.status}`);
    }
    let rotated: string;
    try {
      const raw = JSON.parse(tokenRes.body) as { formToken?: unknown };
      if (typeof raw.formToken !== "string" || !raw.formToken) {
        return err("parse_error", "trip-token response missing formToken");
      }
      rotated = raw.formToken;
    } catch (e) {
      return err("parse_error", "trip-token body not JSON", e);
    }

    const tripRes = await this.send("/Trip/Trip", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        RequestVerificationToken: rvt,
        "X-Requested-With": "XMLHttpRequest",
      },
      body: JSON.stringify({
        SearchData: formParsed.data.searchData,
        FormValidationCode: rotated,
        DepartDate: input.date,
        IsReturn: false,
        BookingTripSequenceNo: 1,
      }),
    });
    if (tripRes.status !== 200) {
      return err("upstream_error", `/Trip/Trip returned HTTP ${tripRes.status}`);
    }
    return parseTripListing(tripRes.body);
  }

  async getLayout(input: GetLayoutInput): Promise<Result<ParsedLayout>> {
    if (!this.searchData) {
      return err(
        "invalid_input",
        "searchTrips must be called before getLayout in the same client",
      );
    }
    const home = this.home;
    if (!home) return err("invalid_input", "home not loaded");
    const res = await this.send("/Trip/LayoutV2", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        RequestVerificationToken: home.requestVerificationToken,
        "X-Requested-With": "XMLHttpRequest",
      },
      body: JSON.stringify({
        SearchData: this.searchData,
        TripData: input.tripData,
        Pax: input.pax ?? 1,
      }),
    });
    if (res.status === 401 || res.status === 403) {
      return err("upstream_error", "LayoutV2 requires authenticated cookie");
    }
    if (res.status !== 200) {
      return err("upstream_error", `LayoutV2 returned HTTP ${res.status}`);
    }
    return parseLayout(res.body);
  }
}
