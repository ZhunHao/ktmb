/* eslint-disable no-console */
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import * as cheerio from "cheerio";
import { CookieJar } from "../src/core/ktmb/cookie-jar.js";

const BASE = "https://online.ktmb.com.my";
const FIXTURES = resolve(import.meta.dirname, "../tests/fixtures/ktmb");

const REDACT = (s: string): string =>
  s
    .replace(/CfDJ8[\w\-+/=]+/g, "<RVT_REDACTED>")
    .replace(/[A-Za-z0-9+/]{40,}={0,2}/g, "<TOKEN_REDACTED>");

const fetchKits = async (
  path: string,
  init: RequestInit,
  jar: CookieJar,
): Promise<{ status: number; body: string }> => {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      ...(init.headers as Record<string, string>),
      Cookie: jar.toHeader(),
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36",
    },
  });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  jar.absorb(setCookie);
  return { status: res.status, body: await res.text() };
};

const main = async (): Promise<void> => {
  mkdirSync(FIXTURES, { recursive: true });
  const jar = new CookieJar();

  console.log("[1/4] GET /");
  const home = await fetchKits("/", { method: "GET" }, jar);
  writeFileSync(resolve(FIXTURES, "home.html"), REDACT(home.body));

  const rvt = home.body.match(
    /name="__RequestVerificationToken"[^>]*value="([^"]+)"/,
  )?.[1];
  if (!rvt) throw new Error("RVT not found in home page");
  const jsStationsMatch = home.body.match(/var jsStations = (\[[\s\S]*?\]);/);
  if (!jsStationsMatch) throw new Error("jsStations not found");
  const jsStations = JSON.parse(jsStationsMatch[1]) as Array<{
    Id: string;
    StationData: string;
  }>;
  const kl = jsStations.find((s) => s.Id === "19100");
  const bwt = jsStations.find((s) => s.Id === "100");
  if (!kl || !bwt) throw new Error("KL/BWT station data missing");

  const d = new Date();
  d.setDate(d.getDate() + 14);
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  const onward = `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  const isoDate = d.toISOString().slice(0, 10);

  console.log(`[2/4] POST /Trip (onward=${onward})`);
  const tripForm = await fetchKits(
    "/Trip",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-User": "?1",
        "Upgrade-Insecure-Requests": "1",
        Referer: `${BASE}/`,
      },
      body: new URLSearchParams({
        FromStationData: kl.StationData,
        ToStationData: bwt.StationData,
        FromStationId: "19100",
        ToStationId: "100",
        OnwardDate: onward,
        ReturnDate: "",
        PassengerCount: "1",
        __RequestVerificationToken: rvt,
      }).toString(),
    },
    jar,
  );
  writeFileSync(resolve(FIXTURES, "trip-form.html"), REDACT(tripForm.body));
  // Use cheerio so HTML entities (&#x2B;, &amp;) are decoded back to +/&.
  const $ = cheerio.load(tripForm.body);
  const fvc = $("#FormValidationCode").attr("value");
  const sd = $("#SearchData").attr("value");
  const newRvt = $('input[name="__RequestVerificationToken"]').attr("value");
  if (!fvc || !sd || !newRvt) throw new Error("/Trip extract failed");

  console.log("[3/4] POST /Trip/GetTripToken");
  const token = await fetchKits(
    `/Trip/GetTripToken?t=${Date.now()}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        RequestVerificationToken: newRvt,
        "X-Requested-With": "XMLHttpRequest",
      },
      body: JSON.stringify({ FormToken: fvc }),
    },
    jar,
  );
  writeFileSync(resolve(FIXTURES, "trip-token.json"), REDACT(token.body));
  const rotated = JSON.parse(token.body).formToken as string;

  console.log("[4/4] POST /Trip/Trip");
  const trip = await fetchKits(
    "/Trip/Trip",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        RequestVerificationToken: newRvt,
        "X-Requested-With": "XMLHttpRequest",
      },
      body: JSON.stringify({
        SearchData: sd,
        FormValidationCode: rotated,
        DepartDate: isoDate,
        IsReturn: false,
        BookingTripSequenceNo: 1,
      }),
    },
    jar,
  );
  writeFileSync(resolve(FIXTURES, "trip-listing.json"), REDACT(trip.body));

  console.log("Done. Fixtures written to", FIXTURES);
  console.log(
    "NOTE: layout-v2.json must be captured separately with an authenticated session.",
  );
};

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
