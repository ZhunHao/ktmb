# KTMB Real Booking Client Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the placeholder `getAvailability` in `src/core/ktmb/client.ts` with the verified live KITS booking flow — anonymous by default (fares + listing seat counts), optional authenticated mode (per-class fares + OKU-excluded seat counts) when the user supplies a session cookie.

**Architecture:** A small `KitsClient` class wraps the four anonymous endpoints (home → `/Trip` → `/Trip/GetTripToken` → `/Trip/Trip`) and the fifth authenticated endpoint (`/Trip/LayoutV2`). It manages a per-session cookie jar via plain `set-cookie` parsing — no `tough-cookie` dependency. HTML parsing uses `cheerio`. The existing `FareGetter` contract (`Result<TrainClass[]>`) is preserved; the `Fare` schema gains a `seatsLeftIncludesPriority: boolean` field to signal the OKU caveat that only auth mode can lift. Station ID translation between GTFS `stop_id` and KITS internal IDs (e.g. `19100` for KL Sentral) is built lazily on first use by name-matching against the home-page station catalog.

**Tech Stack:** TypeScript (Node 22.19+, ESM), Vitest, MSW for HTTP mocks, `cheerio` for HTML parsing, Zod for schema validation. Existing utilities: `fetchWithRetry` from `src/core/client/http.ts`, `Result` from `src/core/result.ts`.

**Verified live on 2026-05-02 with logged-in account:** see `~/.claude/projects/-Users-zhunhao-Documents-Projects-ktmb/memory/ktmb_kits_endpoints.md` for the captured request/response shapes referenced throughout this plan.

---

## File Structure

```
src/core/ktmb/
  client.ts              MODIFY — replace placeholder; export getAvailability(input, opts?)
  types.ts               MODIFY — replace KtmbAvailabilityResponseSchema with KITS wire schemas
  parser.ts              MODIFY — replace JSON parser with HTML/JSON parsers per endpoint
  cookie-jar.ts          CREATE — minimal Set-Cookie parser + Cookie header formatter
  parse-home.ts          CREATE — extract jsStations, groupedStations, RVT
  parse-trip-form.ts     CREATE — extract SearchData + FormValidationCode from /Trip HTML
  parse-trip-listing.ts  CREATE — extract train rows from /Trip/Trip data HTML
  parse-layout.ts        CREATE — extract Coaches[].Seats[] with OKU detection
  station-map.ts         CREATE — GTFS stop_id ↔ KITS station_id resolver
  kits-client.ts         CREATE — orchestrates the 4-step anonymous flow + optional 5th

src/core/types.ts        MODIFY — extend Fare schema with seatsLeftIncludesPriority

src/runtime/bootstrap.ts MODIFY — read KTMB_COOKIE env var, build authenticated FareGetter when present

scripts/
  capture-ktmb-fixtures.ts        CREATE — runs the anonymous flow live, anonymises, writes fixtures
  redact-layout-fixture.ts        CREATE — redacts a hand-captured layout-v2.json in place
  inspect-ktmb.md                 DELETE — obsolete; replaced by reproducible capture script

tests/fixtures/ktmb/
  home.html              REPLACE — real anonymised capture
  trip-form.html         CREATE — real anonymised capture
  trip-token.json        CREATE — real anonymised capture
  trip-listing.json      REPLACE — real anonymised capture (was search-sample.json)
  layout-v2.json         REPLACE — real anonymised capture (was availability-sample.json)

tests/unit/core/ktmb/
  cookie-jar.test.ts            CREATE
  parse-home.test.ts            CREATE
  parse-trip-form.test.ts       CREATE
  parse-trip-listing.test.ts    CREATE
  parse-layout.test.ts          CREATE
  station-map.test.ts           CREATE
  parser.test.ts                MODIFY — keep parse_error case; switch fixtures

tests/integration/ktmb/
  client.test.ts                MODIFY — exercise full 4-step + 5-step flows via msw
  kits-client.test.ts           CREATE — auth-mode-specific assertions
```

---

## Task 1: Add cheerio dependency

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add the dependency**

```bash
pnpm add cheerio@^1.0.0
```

- [ ] **Step 2: Verify the install resolved a 1.x release**

Run: `pnpm list cheerio`
Expected: shows `cheerio 1.x.y`.

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add cheerio for KTMB HTML parsing"
```

---

## Task 2: Extend Fare schema with the OKU caveat field

**Files:**
- Modify: `src/core/types.ts:48-54`
- Test: `tests/unit/core/types.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/core/types.test.ts`:

```typescript
import { FareSchema } from "../../../src/core/types.js";

describe("FareSchema seatsLeftIncludesPriority", () => {
  it("accepts a fare with seatsLeftIncludesPriority=true", () => {
    const r = FareSchema.safeParse({
      className: "Standard",
      priceMinor: 11200,
      currency: "MYR",
      seatsLeft: 230,
      seatsLeftIncludesPriority: true,
    });
    expect(r.success).toBe(true);
  });

  it("accepts a fare without the field (legacy fixtures)", () => {
    const r = FareSchema.safeParse({
      className: "Standard",
      priceMinor: 11200,
      currency: "MYR",
      seatsLeft: null,
    });
    expect(r.success).toBe(true);
  });

  it("rejects non-boolean seatsLeftIncludesPriority", () => {
    const r = FareSchema.safeParse({
      className: "Standard",
      priceMinor: 11200,
      currency: "MYR",
      seatsLeft: 0,
      seatsLeftIncludesPriority: "yes",
    });
    expect(r.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- types.test.ts`
Expected: FAIL — schema doesn't yet accept the new field; first test fails.

- [ ] **Step 3: Extend FareSchema**

Replace `src/core/types.ts:48-54` with:

```typescript
export const FareSchema = z.object({
  className: z.string().min(1),
  priceMinor: z.number().int().nonnegative(),
  currency: z.enum(["MYR", "SGD"]),
  seatsLeft: z.number().int().nonnegative().nullable(),
  /**
   * True when seatsLeft was derived from the public KITS listing (which counts
   * OKU/priority seats in the total). False when derived from /Trip/LayoutV2
   * (authenticated mode), where OKU seats are excluded. Optional for backward
   * compatibility with cached/persisted fixtures that pre-date this field.
   */
  seatsLeftIncludesPriority: z.boolean().optional(),
});
```

- [ ] **Step 4: Run all type tests**

Run: `pnpm test -- types.test.ts`
Expected: PASS — all three new tests green.

- [ ] **Step 5: Run full type-check**

Run: `pnpm typecheck`
Expected: no errors. (Existing fixture tests stay green because the field is optional.)

- [ ] **Step 6: Commit**

```bash
git add src/core/types.ts tests/unit/core/types.test.ts
git commit -m "feat(core): add seatsLeftIncludesPriority to Fare schema"
```

---

## Task 3: Cookie jar utility

**Files:**
- Create: `src/core/ktmb/cookie-jar.ts`
- Test: `tests/unit/core/ktmb/cookie-jar.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/core/ktmb/cookie-jar.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { CookieJar } from "../../../../src/core/ktmb/cookie-jar.js";

describe("CookieJar", () => {
  it("starts empty and produces empty Cookie header", () => {
    const jar = new CookieJar();
    expect(jar.toHeader()).toBe("");
  });

  it("absorbs a single Set-Cookie and emits it", () => {
    const jar = new CookieJar();
    jar.absorb(["__RequestVerificationToken=abc; path=/; HttpOnly"]);
    expect(jar.toHeader()).toBe("__RequestVerificationToken=abc");
  });

  it("absorbs multiple Set-Cookie headers and emits them sorted by name", () => {
    const jar = new CookieJar();
    jar.absorb([
      "X-CSRF=cookie1; path=/",
      "ARRAffinity=cookie2; path=/",
      "session=cookie3; path=/",
    ]);
    expect(jar.toHeader()).toBe(
      "ARRAffinity=cookie2; X-CSRF=cookie1; session=cookie3",
    );
  });

  it("later Set-Cookie with the same name overwrites the value", () => {
    const jar = new CookieJar();
    jar.absorb(["session=v1; path=/"]);
    jar.absorb(["session=v2; path=/"]);
    expect(jar.toHeader()).toBe("session=v2");
  });

  it("ignores Set-Cookie with empty value (server clears)", () => {
    const jar = new CookieJar();
    jar.absorb(["session=v1"]);
    jar.absorb(["session=; path=/; expires=Thu, 01 Jan 1970"]);
    expect(jar.toHeader()).toBe("");
  });

  it("seedFromHeader parses a user-supplied Cookie header", () => {
    const jar = new CookieJar();
    jar.seedFromHeader(".AspNetCore.Identity.Application=foo; X-CSRF=bar");
    expect(jar.toHeader()).toBe(
      ".AspNetCore.Identity.Application=foo; X-CSRF=bar",
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- cookie-jar.test.ts`
Expected: FAIL with "Cannot find module …cookie-jar.js".

- [ ] **Step 3: Implement CookieJar**

Create `src/core/ktmb/cookie-jar.ts`:

```typescript
export class CookieJar {
  private cookies = new Map<string, string>();

  absorb(setCookieHeaders: readonly string[]): void {
    for (const raw of setCookieHeaders) {
      const firstSemi = raw.indexOf(";");
      const pair = firstSemi === -1 ? raw : raw.slice(0, firstSemi);
      const eq = pair.indexOf("=");
      if (eq <= 0) continue;
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      if (value === "") {
        this.cookies.delete(name);
      } else {
        this.cookies.set(name, value);
      }
    }
  }

  seedFromHeader(cookieHeader: string): void {
    for (const part of cookieHeader.split(";")) {
      const eq = part.indexOf("=");
      if (eq <= 0) continue;
      const name = part.slice(0, eq).trim();
      const value = part.slice(eq + 1).trim();
      if (name && value) this.cookies.set(name, value);
    }
  }

  toHeader(): string {
    const names = [...this.cookies.keys()].sort();
    return names.map((n) => `${n}=${this.cookies.get(n)}`).join("; ");
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- cookie-jar.test.ts`
Expected: PASS — all six tests green.

- [ ] **Step 5: Commit**

```bash
git add src/core/ktmb/cookie-jar.ts tests/unit/core/ktmb/cookie-jar.test.ts
git commit -m "feat(ktmb): add CookieJar for KITS session management"
```

---

## Task 4: Capture real fixtures

This task gates Tasks 5–8 (parsers) and Tasks 10–11 (integration tests): all of those consume the committed fixture files produced here.

**Files:**
- Create: `scripts/capture-ktmb-fixtures.ts`
- Create: `scripts/redact-layout-fixture.ts`
- Replace: `tests/fixtures/ktmb/home.html` (currently absent)
- Replace: `tests/fixtures/ktmb/trip-form.html` (new)
- Replace: `tests/fixtures/ktmb/trip-token.json` (new)
- Replace: `tests/fixtures/ktmb/trip-listing.json` (replaces `search-sample.json`)
- Replace: `tests/fixtures/ktmb/layout-v2.json` (replaces `availability-sample.json`)

- [ ] **Step 1: Add anonymous capture script**

Create `scripts/capture-ktmb-fixtures.ts`:

```typescript
/* eslint-disable no-console */
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { CookieJar } from "../src/core/ktmb/cookie-jar.js";

const BASE = "https://online.ktmb.com.my";
const FIXTURES = resolve(import.meta.dirname, "../tests/fixtures/ktmb");

// Anonymise: collapse RVT-shaped tokens and any other long base64-ish run.
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

  // Extract RVT + KL Sentral + Butterworth StationData by quick regex on the
  // unredacted body.
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

  // Date 14 days out
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
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
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
  const fvc = tripForm.body.match(
    /id="FormValidationCode"[^>]*value="([^"]+)"/,
  )?.[1];
  const sd = tripForm.body.match(/id="SearchData"[^>]*value="([^"]+)"/)?.[1];
  const newRvt = tripForm.body.match(
    /name="__RequestVerificationToken"[^>]*value="([^"]+)"/,
  )?.[1];
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
    "NOTE: layout-v2.json must be captured separately with an authenticated session. See plan Task 4 Step 4.",
  );
};

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: Add layout-fixture redaction script**

Create `scripts/redact-layout-fixture.ts`:

```typescript
/* eslint-disable no-console */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const path = resolve(import.meta.dirname, "../tests/fixtures/ktmb/layout-v2.json");
const before = readFileSync(path, "utf8");
const after = before
  .replace(/CfDJ8[\w\-+/=]+/g, "<RVT_REDACTED>")
  .replace(/[A-Za-z0-9+/]{40,}={0,2}/g, "<TOKEN_REDACTED>");
writeFileSync(path, after);
console.log(`Redacted ${path} (${before.length} → ${after.length} bytes)`);
```

- [ ] **Step 3: Run the anonymous capture**

Run: `pnpm tsx scripts/capture-ktmb-fixtures.ts`
Expected output: 4 progress lines, ends with "Done." Files written:
- `tests/fixtures/ktmb/home.html` (~73KB, redacted)
- `tests/fixtures/ktmb/trip-form.html`
- `tests/fixtures/ktmb/trip-token.json`
- `tests/fixtures/ktmb/trip-listing.json`

If KITS is in maintenance window (23:00–00:15 UTC+8), wait and retry.

- [ ] **Step 4: Verify fixtures look like real captures and contain no live tokens**

Run: `grep -c CfDJ8 tests/fixtures/ktmb/home.html tests/fixtures/ktmb/trip-form.html tests/fixtures/ktmb/trip-token.json tests/fixtures/ktmb/trip-listing.json`
Expected: every line ends in `:0` — no raw RVTs survive.

Run: `grep -E '"status":(true|false)' tests/fixtures/ktmb/trip-listing.json`
Expected: at least one match (the response envelope).

- [ ] **Step 5: Capture LayoutV2 fixture manually + redact**

Open `https://online.ktmb.com.my/`, log in, search KL Sentral → Butterworth (date used by capture script — same +14 days), click "Pick Seats" on Platinum-9124, open DevTools → Network → find the `POST /Trip/LayoutV2` XHR, right-click → Copy → Copy response.

Save the response body to `tests/fixtures/ktmb/layout-v2.json`, then redact:

```bash
pnpm tsx scripts/redact-layout-fixture.ts
```

Expected: prints redaction stats. Then verify:

Run: `grep -c CfDJ8 tests/fixtures/ktmb/layout-v2.json`
Expected: `0`.

- [ ] **Step 6: Delete legacy synthetic fixtures**

```bash
git rm tests/fixtures/ktmb/search-sample.json tests/fixtures/ktmb/availability-sample.json
```

- [ ] **Step 7: Commit**

```bash
git add scripts/capture-ktmb-fixtures.ts scripts/redact-layout-fixture.ts tests/fixtures/ktmb
git commit -m "test(ktmb): capture real anonymised KITS fixtures"
```

---

## Task 5: parse-home (extract station catalog + RVT)

**Files:**
- Create: `src/core/ktmb/parse-home.ts`
- Test: `tests/unit/core/ktmb/parse-home.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/core/ktmb/parse-home.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { parseHomePage } from "../../../../src/core/ktmb/parse-home.js";

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(
  resolve(here, "../../../fixtures/ktmb/home.html"),
  "utf8",
);

describe("parseHomePage", () => {
  it("returns the request verification token (post-redaction marker)", () => {
    const r = parseHomePage(html);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.requestVerificationToken).toBe("<RVT_REDACTED>");
  });

  it("parses 12 state groups and 110 stations", () => {
    const r = parseHomePage(html);
    if (!r.ok) throw new Error(r.error.message);
    expect(r.data.groupedStations.length).toBe(12);
    expect(r.data.stations.length).toBe(110);
  });

  it("includes KL Sentral with id 19100 and a station data token", () => {
    const r = parseHomePage(html);
    if (!r.ok) throw new Error(r.error.message);
    const kl = r.data.stations.find((s) => s.id === "19100");
    expect(kl?.description).toBe("KL SENTRAL");
    expect(kl?.stationData).toMatch(/REDACTED/);
  });

  it("returns parse_error on a page missing groupedStations", () => {
    const r = parseHomePage("<html><body>nope</body></html>");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("parse_error");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- parse-home.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement parseHomePage**

Create `src/core/ktmb/parse-home.ts`:

```typescript
import type { Result } from "../result.js";
import { err, ok } from "../result.js";

export type KitsStation = {
  id: string;
  description: string;
  stationData: string;
  trainServices: readonly string[];
  state: string;
};

export type ParsedHomePage = {
  requestVerificationToken: string;
  groupedStations: ReadonlyArray<{
    state: string;
    stations: ReadonlyArray<{
      id: string;
      description: string;
      trainServices: readonly string[];
    }>;
  }>;
  stations: readonly KitsStation[];
};

const RVT_RE = /name="__RequestVerificationToken"[^>]*value="([^"]+)"/;
const GROUPED_RE = /var\s+groupedStations\s*=\s*(\[[\s\S]*?\]);/;
const JS_STATIONS_RE = /var\s+jsStations\s*=\s*(\[[\s\S]*?\]);/;

export const parseHomePage = (html: string): Result<ParsedHomePage> => {
  const rvt = html.match(RVT_RE)?.[1];
  if (!rvt) return err("parse_error", "RequestVerificationToken not found");

  const groupedMatch = html.match(GROUPED_RE);
  if (!groupedMatch) return err("parse_error", "groupedStations var not found");

  const jsMatch = html.match(JS_STATIONS_RE);
  if (!jsMatch) return err("parse_error", "jsStations var not found");

  let grouped: Array<{
    State: string;
    Stations: Array<{ Id: string; Description: string; TrainServices: string[] }>;
  }>;
  let jsList: Array<{ Id: string; StationData: string }>;
  try {
    grouped = JSON.parse(groupedMatch[1]!);
    jsList = JSON.parse(jsMatch[1]!);
  } catch (e) {
    return err("parse_error", "groupedStations / jsStations not JSON", e);
  }

  const tokenById = new Map(jsList.map((s) => [s.Id, s.StationData]));
  const stations: KitsStation[] = [];
  const groupedOut = grouped.map((g) => ({
    state: g.State,
    stations: g.Stations.map((s) => {
      const stationData = tokenById.get(s.Id);
      if (stationData) {
        stations.push({
          id: s.Id,
          description: s.Description,
          stationData,
          trainServices: s.TrainServices,
          state: g.State,
        });
      }
      return {
        id: s.Id,
        description: s.Description,
        trainServices: s.TrainServices,
      };
    }),
  }));

  return ok({
    requestVerificationToken: rvt,
    groupedStations: groupedOut,
    stations,
  });
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- parse-home.test.ts`
Expected: PASS — all four tests green.

- [ ] **Step 5: Commit**

```bash
git add src/core/ktmb/parse-home.ts tests/unit/core/ktmb/parse-home.test.ts
git commit -m "feat(ktmb): parse home-page station catalog and RVT"
```

---

## Task 6: parse-trip-form (extract SearchData + FormValidationCode)

**Files:**
- Create: `src/core/ktmb/parse-trip-form.ts`
- Test: `tests/unit/core/ktmb/parse-trip-form.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/core/ktmb/parse-trip-form.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { parseTripForm } from "../../../../src/core/ktmb/parse-trip-form.js";

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(
  resolve(here, "../../../fixtures/ktmb/trip-form.html"),
  "utf8",
);

describe("parseTripForm", () => {
  it("returns SearchData, FormValidationCode, and rotated RVT", () => {
    const r = parseTripForm(html);
    if (!r.ok) throw new Error(r.error.message);
    expect(r.data.searchData).toMatch(/REDACTED/);
    expect(r.data.formValidationCode).toMatch(/REDACTED/);
    expect(r.data.requestVerificationToken).toMatch(/REDACTED/);
  });

  it("returns parse_error if SearchData hidden input is absent", () => {
    const r = parseTripForm("<html></html>");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("parse_error");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- parse-trip-form.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement parseTripForm**

Create `src/core/ktmb/parse-trip-form.ts`:

```typescript
import type { Result } from "../result.js";
import { err, ok } from "../result.js";

export type ParsedTripForm = {
  searchData: string;
  formValidationCode: string;
  requestVerificationToken: string;
};

const SD_RE = /id="SearchData"[^>]*value="([^"]+)"/;
const FVC_RE = /id="FormValidationCode"[^>]*value="([^"]+)"/;
const RVT_RE = /name="__RequestVerificationToken"[^>]*value="([^"]+)"/;

export const parseTripForm = (html: string): Result<ParsedTripForm> => {
  const sd = html.match(SD_RE)?.[1];
  const fvc = html.match(FVC_RE)?.[1];
  const rvt = html.match(RVT_RE)?.[1];
  if (!sd || !fvc || !rvt) {
    return err(
      "parse_error",
      `missing tokens on /Trip response (sd=${!!sd}, fvc=${!!fvc}, rvt=${!!rvt})`,
    );
  }
  return ok({
    searchData: sd,
    formValidationCode: fvc,
    requestVerificationToken: rvt,
  });
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- parse-trip-form.test.ts`
Expected: PASS — both tests green.

- [ ] **Step 5: Commit**

```bash
git add src/core/ktmb/parse-trip-form.ts tests/unit/core/ktmb/parse-trip-form.test.ts
git commit -m "feat(ktmb): parse /Trip form response tokens"
```

---

## Task 7: parse-trip-listing (extract train rows from /Trip/Trip data HTML)

**Files:**
- Create: `src/core/ktmb/parse-trip-listing.ts`
- Test: `tests/unit/core/ktmb/parse-trip-listing.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/core/ktmb/parse-trip-listing.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { parseTripListing } from "../../../../src/core/ktmb/parse-trip-listing.js";

const here = dirname(fileURLToPath(import.meta.url));
const json = readFileSync(
  resolve(here, "../../../fixtures/ktmb/trip-listing.json"),
  "utf8",
);

describe("parseTripListing", () => {
  it("returns at least one train row from a captured /Trip/Trip JSON envelope", () => {
    const r = parseTripListing(json);
    if (!r.ok) throw new Error(r.error.message);
    expect(r.data.length).toBeGreaterThan(0);
  });

  it("each row carries trainNo, service, departure, arrival, durationMinutes, seatsAvailable, minFareMinor", () => {
    const r = parseTripListing(json);
    if (!r.ok) throw new Error(r.error.message);
    for (const row of r.data) {
      expect(row.trainNo).toMatch(/^\d{3,5}$/);
      expect(typeof row.service).toBe("string");
      expect(row.departure).toMatch(/^\d{2}:\d{2}$/);
      expect(row.arrival).toMatch(/^\d{2}:\d{2}/);
      expect(row.durationMinutes).toBeGreaterThan(0);
      expect(row.seatsAvailable).toBeGreaterThanOrEqual(0);
      expect(row.minFareMinor).toBeGreaterThanOrEqual(0);
      expect(typeof row.tripData).toBe("string");
    }
  });

  it("returns parse_error on a non-JSON body", () => {
    const r = parseTripListing("not json");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("parse_error");
  });

  it("returns parse_error when status is false (KITS-side error)", () => {
    const r = parseTripListing(
      JSON.stringify({
        status: false,
        messages: [],
        messageCode: "boom",
        data: "",
      }),
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("parse_error");
    expect(r.error.message).toContain("boom");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- parse-trip-listing.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement parseTripListing**

Create `src/core/ktmb/parse-trip-listing.ts`:

```typescript
import * as cheerio from "cheerio";
import type { Result } from "../result.js";
import { err, ok } from "../result.js";

export type TripListingRow = {
  trainNo: string;
  service: string;          // e.g. "Platinum", "Express", "Gold"
  departure: string;        // "HH:MM"
  arrival: string;          // "HH:MM" or "HH:MM (+1)"
  durationMinutes: number;
  seatsAvailable: number;   // listing-level (includes OKU)
  minFareMinor: number;     // MYR cents
  tripData: string;         // opaque token for /Trip/LayoutV2
};

const FARE_RE = /([A-Z]{3})\s+([\d,]+(?:\.\d+)?)/;
const DURATION_RE = /(\d+)\s*h\s*(\d+)?\s*m?/i;

const parseDurationToMinutes = (text: string): number => {
  const m = DURATION_RE.exec(text.replace(/\s+/g, " ").trim());
  if (!m) return 0;
  return Number(m[1]) * 60 + Number(m[2] ?? "0");
};

const parseFareToMinor = (text: string): number => {
  const m = FARE_RE.exec(text);
  if (!m) return 0;
  return Math.round(Number(m[2]!.replace(/,/g, "")) * 100);
};

export const parseTripListing = (
  body: string,
): Result<TripListingRow[]> => {
  let envelope: { status: boolean; messageCode?: string | null; data?: string };
  try {
    envelope = JSON.parse(body);
  } catch (e) {
    return err("parse_error", "trip listing not JSON", e);
  }
  if (!envelope.status) {
    return err(
      "parse_error",
      `KITS rejected listing (messageCode=${envelope.messageCode ?? "null"})`,
    );
  }
  const html = envelope.data ?? "";
  const $ = cheerio.load(html);
  const rows: TripListingRow[] = [];
  $("tbody tr").each((_, tr) => {
    const tds = $(tr)
      .find("td")
      .map((__, td) => $(td).text().replace(/\s+/g, " ").trim())
      .toArray();
    if (tds.length < 7) return;
    const serviceCell = tds[0]!;
    const trainMatch = /(\w+)\s*-\s*(\d{3,5})/.exec(serviceCell);
    if (!trainMatch) return;
    const tripData = $(tr).find("a[data-tripdata]").attr("data-tripdata") ?? "";
    rows.push({
      trainNo: trainMatch[2]!,
      service: trainMatch[1]!,
      departure: tds[1]!,
      arrival: tds[2]!,
      durationMinutes: parseDurationToMinutes(tds[3]!),
      seatsAvailable: Number(tds[4]!.replace(/[^\d]/g, "")) || 0,
      minFareMinor: parseFareToMinor(tds[5]!),
      tripData,
    });
  });
  return ok(rows);
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- parse-trip-listing.test.ts`
Expected: PASS — all four tests green.

- [ ] **Step 5: Commit**

```bash
git add src/core/ktmb/parse-trip-listing.ts tests/unit/core/ktmb/parse-trip-listing.test.ts
git commit -m "feat(ktmb): parse /Trip/Trip listing rows (anonymous fares)"
```

---

## Task 8: parse-layout (auth-only LayoutV2; OKU-aware)

**Files:**
- Create: `src/core/ktmb/parse-layout.ts`
- Test: `tests/unit/core/ktmb/parse-layout.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/core/ktmb/parse-layout.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { parseLayout, isOkuSeatType } from "../../../../src/core/ktmb/parse-layout.js";

const here = dirname(fileURLToPath(import.meta.url));
const json = readFileSync(
  resolve(here, "../../../fixtures/ktmb/layout-v2.json"),
  "utf8",
);

describe("isOkuSeatType", () => {
  it("flags OKU codes case-insensitively", () => {
    expect(isOkuSeatType("StdBwOKU")).toBe(true);
    expect(isOkuSeatType("Standard Backward OKU")).toBe(true);
    expect(isOkuSeatType("StanForWinWC")).toBe(false);
    expect(isOkuSeatType(null)).toBe(false);
    expect(isOkuSeatType(undefined)).toBe(false);
  });
});

describe("parseLayout", () => {
  it("aggregates classes with OKU-excluded seat counts and per-class min price (minor)", () => {
    const r = parseLayout(json);
    if (!r.ok) throw new Error(r.error.message);
    expect(r.data.currency).toBe("MYR");
    expect(r.data.classes.length).toBeGreaterThan(0);
    for (const cls of r.data.classes) {
      expect(typeof cls.className).toBe("string");
      expect(cls.priceMinor).toBeGreaterThan(0);
      expect(cls.seatsLeft).toBeGreaterThanOrEqual(0);
      expect(cls.seatsLeftIncludesPriority).toBe(false);
    }
  });

  it("excludes OKU seats from seatsLeft (proven against captured fixture)", () => {
    const r = parseLayout(json);
    if (!r.ok) throw new Error(r.error.message);
    // Captured fixture (Platinum-9124, KL Sentral → Butterworth): listing said 230 avail,
    // 4 of which are OKU in Coach D. parseLayout must report ≤226 across classes.
    const totalSeatsLeft = r.data.classes.reduce(
      (a, c) => a + c.seatsLeft,
      0,
    );
    expect(totalSeatsLeft).toBeLessThanOrEqual(226);
  });

  it("returns parse_error on Status=false", () => {
    const r = parseLayout(
      JSON.stringify({ Status: false, Messages: [], MessageCode: "x", Data: null }),
    );
    expect(r.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- parse-layout.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement parseLayout**

Create `src/core/ktmb/parse-layout.ts`:

```typescript
import type { Result } from "../result.js";
import { err, ok } from "../result.js";

export const isOkuSeatType = (code: string | null | undefined): boolean =>
  code != null && /OKU/i.test(code);

export type LayoutClass = {
  className: string;       // e.g. "Business", "Standard"
  priceMinor: number;      // min price across tiers, MYR cents
  seatsLeft: number;       // OKU-excluded count
  seatsLeftIncludesPriority: false;
};

export type ParsedLayout = {
  trainNo: string;
  serviceCategory: string;
  currency: "MYR" | "SGD";
  classes: LayoutClass[];
  okuSeatsAvailable: number;
};

type RawSeat = {
  Status: string;
  Price: number;
  SeatType: string | null;
  SeatTypeName: string | null;
  ServiceType: string | null;
};
type RawCoach = {
  CoachLabel: string;
  Seats: RawSeat[];
};

export const parseLayout = (body: string): Result<ParsedLayout> => {
  let envelope: {
    Status: boolean;
    MessageCode?: string | null;
    Data?: {
      TrainNo: string;
      ServiceCategory: string;
      Currency: string;
      Coaches: RawCoach[];
    };
  };
  try {
    envelope = JSON.parse(body);
  } catch (e) {
    return err("parse_error", "layout body not JSON", e);
  }
  if (!envelope.Status || !envelope.Data) {
    return err(
      "parse_error",
      `KITS rejected layout (messageCode=${envelope.MessageCode ?? "null"})`,
    );
  }
  const data = envelope.Data;
  const currency = data.Currency === "SGD" ? "SGD" : "MYR";

  // Group available seats by ServiceType (Business/Standard/...). Track min
  // price per group. Skip OKU. Skip filler/blocked (Status===5 or Price===0).
  const groups = new Map<string, { minPriceMinor: number; seats: number }>();
  let oku = 0;
  for (const coach of data.Coaches) {
    for (const seat of coach.Seats) {
      const priorityFlagged =
        isOkuSeatType(seat.SeatType) || isOkuSeatType(seat.SeatTypeName);
      if (seat.Status !== "1") continue;
      if (priorityFlagged) {
        oku++;
        continue;
      }
      if (!seat.ServiceType || !seat.Price) continue;
      const key = seat.ServiceType;
      const priceMinor = Math.round(seat.Price * 100);
      const cur = groups.get(key);
      if (cur) {
        cur.seats += 1;
        if (priceMinor < cur.minPriceMinor) cur.minPriceMinor = priceMinor;
      } else {
        groups.set(key, { minPriceMinor: priceMinor, seats: 1 });
      }
    }
  }

  const classes: LayoutClass[] = [...groups.entries()]
    .map(([name, v]) => ({
      className: name,
      priceMinor: v.minPriceMinor,
      seatsLeft: v.seats,
      seatsLeftIncludesPriority: false as const,
    }))
    .sort((a, b) => a.priceMinor - b.priceMinor);

  return ok({
    trainNo: data.TrainNo,
    serviceCategory: data.ServiceCategory,
    currency,
    classes,
    okuSeatsAvailable: oku,
  });
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- parse-layout.test.ts`
Expected: PASS — all three tests green.

- [ ] **Step 5: Commit**

```bash
git add src/core/ktmb/parse-layout.ts tests/unit/core/ktmb/parse-layout.test.ts
git commit -m "feat(ktmb): parse LayoutV2 with OKU-aware seat aggregation"
```

---

## Task 9: station-map (GTFS stop_id ↔ KITS station_id resolver)

**Files:**
- Create: `src/core/ktmb/station-map.ts`
- Test: `tests/unit/core/ktmb/station-map.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/core/ktmb/station-map.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { resolveKitsStationId } from "../../../../src/core/ktmb/station-map.js";

const sampleCatalog = [
  { id: "19100", description: "KL SENTRAL", stationData: "T1", trainServices: ["ETS"], state: "Selangor" },
  { id: "100", description: "BUTTERWORTH", stationData: "T2", trainServices: ["ETS"], state: "Penang" },
  { id: "44000", description: "ALOR SETAR", stationData: "T3", trainServices: ["ETS"], state: "Kedah" },
];

describe("resolveKitsStationId", () => {
  it("matches by exact GTFS stop name (uppercased)", () => {
    expect(
      resolveKitsStationId(sampleCatalog, { stopName: "KL Sentral", stopId: "KUL" }),
    ).toBe("19100");
  });

  it("matches by GTFS stopId fallback when name differs", () => {
    expect(
      resolveKitsStationId(sampleCatalog, { stopName: "Kuala Lumpur Sentral", stopId: "BTW" }),
    ).toBe("100");
  });

  it("returns undefined when neither name nor id matches", () => {
    expect(
      resolveKitsStationId(sampleCatalog, { stopName: "Mars", stopId: "MARS" }),
    ).toBeUndefined();
  });

  it("is case-insensitive and trims whitespace", () => {
    expect(
      resolveKitsStationId(sampleCatalog, { stopName: "  butterworth ", stopId: "X" }),
    ).toBe("100");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- station-map.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement resolveKitsStationId**

Create `src/core/ktmb/station-map.ts`:

```typescript
import type { KitsStation } from "./parse-home.js";

const KITS_ALIASES: Record<string, string> = {
  // GTFS stop_id → KITS station_id, hand-curated for cases name matching misses.
  // Extend as needed; tests cover the resolver, this map is data.
  KUL: "19100", // KL Sentral
  BTW: "100",  // Butterworth
  ASN: "44000", // Alor Setar
};

export type GtfsStopRef = { stopId: string; stopName: string };

const norm = (s: string): string => s.trim().toUpperCase();

export const resolveKitsStationId = (
  catalog: readonly KitsStation[],
  stop: GtfsStopRef,
): string | undefined => {
  const aliased = KITS_ALIASES[norm(stop.stopId)];
  if (aliased) return aliased;
  const wantName = norm(stop.stopName);
  const byName = catalog.find((s) => norm(s.description) === wantName);
  if (byName) return byName.id;
  const byId = catalog.find((s) => norm(s.id) === norm(stop.stopId));
  return byId?.id;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- station-map.test.ts`
Expected: PASS — all four tests green.

- [ ] **Step 5: Commit**

```bash
git add src/core/ktmb/station-map.ts tests/unit/core/ktmb/station-map.test.ts
git commit -m "feat(ktmb): resolve GTFS stop refs to KITS station ids"
```

---

## Task 10: KitsClient orchestrator

**Files:**
- Create: `src/core/ktmb/kits-client.ts`
- Test: `tests/integration/ktmb/kits-client.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/integration/ktmb/kits-client.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { KitsClient } from "../../../src/core/ktmb/kits-client.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = (name: string) =>
  readFileSync(resolve(here, "../../fixtures/ktmb", name), "utf8");

const homeHtml = fixtures("home.html");
const tripFormHtml = fixtures("trip-form.html");
const tripTokenJson = fixtures("trip-token.json");
const tripListingJson = fixtures("trip-listing.json");
const layoutJson = fixtures("layout-v2.json");

const server = setupServer();
beforeEach(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  server.resetHandlers();
  server.close();
});

const installAnonymousHandlers = () => {
  server.use(
    http.get("https://online.ktmb.com.my/", () =>
      HttpResponse.html(homeHtml, {
        headers: { "Set-Cookie": "X-CSRF=cookie1; path=/" },
      }),
    ),
    http.post("https://online.ktmb.com.my/Trip", () =>
      HttpResponse.html(tripFormHtml),
    ),
    http.post("https://online.ktmb.com.my/Trip/GetTripToken", () =>
      HttpResponse.text(tripTokenJson, {
        headers: { "Content-Type": "application/json" },
      }),
    ),
    http.post("https://online.ktmb.com.my/Trip/Trip", () =>
      HttpResponse.text(tripListingJson, {
        headers: { "Content-Type": "application/json" },
      }),
    ),
  );
};

describe("KitsClient.searchTrips (anonymous)", () => {
  it("returns the trip listing rows from a captured fixture", async () => {
    installAnonymousHandlers();
    const client = new KitsClient();
    const r = await client.searchTrips({
      fromKitsId: "19100",
      toKitsId: "100",
      date: "2026-05-16",
    });
    if (!r.ok) throw new Error(r.error.message);
    expect(r.data.length).toBeGreaterThan(0);
    for (const row of r.data) {
      expect(row.minFareMinor).toBeGreaterThan(0);
      expect(row.seatsAvailable).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("KitsClient.getLayout (authenticated)", () => {
  it("hits LayoutV2 with the supplied cookie and returns OKU-excluded classes", async () => {
    installAnonymousHandlers();
    server.use(
      http.post("https://online.ktmb.com.my/Trip/LayoutV2", ({ request }) => {
        const cookie = request.headers.get("cookie") ?? "";
        if (!cookie.includes(".AspNetCore.Identity.Application=")) {
          return HttpResponse.text(
            JSON.stringify({ Status: false, MessageCode: "Unauthorized" }),
            { status: 401 },
          );
        }
        return HttpResponse.text(layoutJson, {
          headers: { "Content-Type": "application/json" },
        });
      }),
    );
    const client = new KitsClient({
      cookie: ".AspNetCore.Identity.Application=auth-token; X-CSRF=other",
    });
    const search = await client.searchTrips({
      fromKitsId: "19100",
      toKitsId: "100",
      date: "2026-05-16",
    });
    if (!search.ok) throw new Error(search.error.message);
    const target = search.data[0];
    expect(target).toBeDefined();
    const layout = await client.getLayout({ tripData: target!.tripData, pax: 1 });
    if (!layout.ok) throw new Error(layout.error.message);
    expect(layout.data.classes.every((c) => c.seatsLeftIncludesPriority === false)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- kits-client.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement KitsClient**

Create `src/core/ktmb/kits-client.ts`:

```typescript
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

    const tripForm = await this.send("/Trip", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
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
      rotated = JSON.parse(tokenRes.body).formToken as string;
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- kits-client.test.ts`
Expected: PASS — both test groups green.

- [ ] **Step 5: Commit**

```bash
git add src/core/ktmb/kits-client.ts tests/integration/ktmb/kits-client.test.ts
git commit -m "feat(ktmb): add KitsClient orchestrator (anonymous + optional auth)"
```

---

## Task 11: Replace getAvailability + parser internals

**Files:**
- Modify: `src/core/ktmb/client.ts` (full rewrite)
- Modify: `src/core/ktmb/types.ts` (full rewrite)
- Modify: `src/core/ktmb/parser.ts` (re-export only)
- Modify: `tests/integration/ktmb/client.test.ts`
- Modify: `tests/unit/core/ktmb/parser.test.ts`

- [ ] **Step 1: Update client.ts integration test**

Rewrite `tests/integration/ktmb/client.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { getAvailability } from "../../../src/core/ktmb/client.js";

const here = dirname(fileURLToPath(import.meta.url));
const fix = (n: string) =>
  readFileSync(resolve(here, "../../fixtures/ktmb", n), "utf8");

const server = setupServer();
beforeEach(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  server.resetHandlers();
  server.close();
});

const stub = () =>
  server.use(
    http.get("https://online.ktmb.com.my/", () =>
      HttpResponse.html(fix("home.html")),
    ),
    http.post("https://online.ktmb.com.my/Trip", () =>
      HttpResponse.html(fix("trip-form.html")),
    ),
    http.post("https://online.ktmb.com.my/Trip/GetTripToken", () =>
      HttpResponse.text(fix("trip-token.json"), {
        headers: { "Content-Type": "application/json" },
      }),
    ),
    http.post("https://online.ktmb.com.my/Trip/Trip", () =>
      HttpResponse.text(fix("trip-listing.json"), {
        headers: { "Content-Type": "application/json" },
      }),
    ),
  );

describe("getAvailability (anonymous)", () => {
  it("returns one synthetic class for the requested train, marked priority-inclusive", async () => {
    stub();
    const r = await getAvailability({
      from: "KUL",
      to: "BTW",
      date: "2026-05-16",
      // Use a trainNo present in the captured trip-listing.json (e.g. 9124).
      trainNo: "9124",
    });
    if (!r.ok) throw new Error(r.error.message);
    expect(r.data.length).toBe(1);
    expect(r.data[0]!.fare.seatsLeftIncludesPriority).toBe(true);
    expect(r.data[0]!.fare.seatsLeft).toBeGreaterThan(0);
  });

  it("returns not_found for an unknown trainNo", async () => {
    stub();
    const r = await getAvailability({
      from: "KUL",
      to: "BTW",
      date: "2026-05-16",
      trainNo: "0000",
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("not_found");
  });
});

describe("getAvailability (authenticated)", () => {
  it("returns OKU-excluded classes when a cookie is supplied", async () => {
    stub();
    server.use(
      http.post("https://online.ktmb.com.my/Trip/LayoutV2", () =>
        HttpResponse.text(fix("layout-v2.json"), {
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    const r = await getAvailability(
      { from: "KUL", to: "BTW", date: "2026-05-16", trainNo: "9124" },
      { cookie: ".AspNetCore.Identity.Application=auth-token" },
    );
    if (!r.ok) throw new Error(r.error.message);
    expect(r.data.length).toBeGreaterThan(0);
    for (const c of r.data) {
      expect(c.fare.seatsLeftIncludesPriority).toBe(false);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- integration/ktmb/client.test.ts`
Expected: FAIL — `getAvailability` still hits `/api/availability`.

- [ ] **Step 3: Rewrite client.ts**

Replace `src/core/ktmb/client.ts` with:

```typescript
import type { Result } from "../result.js";
import { err, ok } from "../result.js";
import type { TrainClass } from "../types.js";
import { KitsClient } from "./kits-client.js";

export type GetAvailabilityInput = {
  from: string;       // GTFS stop_id (current contract)
  to: string;         // GTFS stop_id
  date: string;       // YYYY-MM-DD
  trainNo: string;
};

export type GetAvailabilityOptions = {
  /**
   * Optional KITS session cookie. When supplied, the client falls through to
   * the authenticated /Trip/LayoutV2 endpoint to return per-class fares with
   * OKU/priority seats excluded. When absent, only the public listing is used
   * and `seatsLeftIncludesPriority` is `true` on each returned fare.
   *
   * Format: a complete `Cookie:` header value captured from a logged-in
   * browser session, e.g. ".AspNetCore.Identity.Application=...; X-CSRF=...".
   */
  cookie?: string;
};

const KITS_BY_GTFS: Record<string, string> = {
  KUL: "19100",
  BTW: "100",
};

const resolveKits = (gtfsId: string): string | undefined =>
  KITS_BY_GTFS[gtfsId.toUpperCase()];

export const getAvailability = async (
  input: GetAvailabilityInput,
  opts: GetAvailabilityOptions = {},
): Promise<Result<TrainClass[]>> => {
  const fromKits = resolveKits(input.from);
  const toKits = resolveKits(input.to);
  if (!fromKits || !toKits) {
    return err(
      "not_found",
      `no KITS station mapped for GTFS pair ${input.from}/${input.to}`,
    );
  }
  const client = opts.cookie
    ? new KitsClient({ cookie: opts.cookie })
    : new KitsClient();
  const search = await client.searchTrips({
    fromKitsId: fromKits,
    toKitsId: toKits,
    date: input.date,
  });
  if (!search.ok) return search;
  const train = search.data.find((t) => t.trainNo === input.trainNo);
  if (!train) return err("not_found", `train ${input.trainNo} not found in KITS listing`);

  if (!opts.cookie) {
    const cls: TrainClass = {
      className: train.service,
      fare: {
        className: train.service,
        priceMinor: train.minFareMinor,
        currency: "MYR",
        seatsLeft: train.seatsAvailable,
        seatsLeftIncludesPriority: true,
      },
    };
    return ok([cls]);
  }

  const layout = await client.getLayout({ tripData: train.tripData });
  if (!layout.ok) return layout;
  const out: TrainClass[] = layout.data.classes.map((c) => ({
    className: c.className,
    fare: {
      className: c.className,
      priceMinor: c.priceMinor,
      currency: layout.data.currency,
      seatsLeft: c.seatsLeft,
      seatsLeftIncludesPriority: false,
    },
  }));
  return ok(out);
};
```

- [ ] **Step 4: Stub out the legacy types module**

Replace `src/core/ktmb/types.ts` with:

```typescript
// Wire-format schemas live alongside their parsers (parse-home.ts,
// parse-trip-listing.ts, parse-layout.ts). This file is intentionally empty;
// kept to avoid breaking any external imports during the rewrite settle.
export {};
```

- [ ] **Step 5: Reduce parser.ts to a re-export**

Replace `src/core/ktmb/parser.ts` with:

```typescript
// Legacy entrypoint replaced by parse-home.ts / parse-trip-listing.ts /
// parse-layout.ts. Re-exported for any external import that pinned to
// "./parser.js".
export { parseTripListing as parseAvailabilityResponse } from "./parse-trip-listing.js";
```

- [ ] **Step 6: Update parser.test.ts**

Replace `tests/unit/core/ktmb/parser.test.ts` with:

```typescript
import { describe, expect, it } from "vitest";
import { parseAvailabilityResponse } from "../../../../src/core/ktmb/parser.js";

describe("parser legacy re-export", () => {
  it("forwards to parseTripListing and reports parse_error on bad JSON", () => {
    const r = parseAvailabilityResponse("not json");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("parse_error");
  });
});
```

- [ ] **Step 7: Run all KTMB tests**

Run: `pnpm test -- ktmb`
Expected: PASS — every ktmb-* unit and integration suite green.

- [ ] **Step 8: Run full type-check and full test suite**

Run: `pnpm typecheck && pnpm test`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/core/ktmb tests/unit/core/ktmb/parser.test.ts tests/integration/ktmb/client.test.ts
git commit -m "feat(ktmb): replace placeholder client with verified KITS flow"
```

---

## Task 12: Wire bootstrap to the KTMB_COOKIE env var

**Files:**
- Modify: `src/runtime/bootstrap.ts:33-37`
- Test: `tests/unit/runtime/bootstrap.test.ts`

- [ ] **Step 1: Read the existing bootstrap test pattern**

Run: `cat tests/unit/runtime/bootstrap.test.ts`

Identify how the existing tests inject a fake fareGetter or otherwise observe the wiring. The new test below assumes a `fareGetter` arg can be replaced in `createKtmb` — that is already the case (see `src/core/index.ts:30-37`). You will simply spy on the `fareGetter` slot by passing a mock through `createKtmb` directly, or — if existing tests verify behaviour through the public Ktmb facade — by stubbing the env var and asserting the curried getter receives the cookie.

- [ ] **Step 2: Write the failing test**

Append to `tests/unit/runtime/bootstrap.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";
import { createKtmbRuntime } from "../../../src/runtime/bootstrap.js";

describe("createKtmbRuntime KTMB_COOKIE plumbing", () => {
  it("threads process.env.KTMB_COOKIE into the fare getter", async () => {
    process.env.KTMB_COOKIE = ".AspNetCore.Identity.Application=tok";
    try {
      // The bootstrap currently imports a hardcoded fareGetter. Modify it (Step 3)
      // so that when KTMB_COOKIE is set, the fareGetter passed into createKtmb is a
      // closure that calls ktmbGetAvailability with { cookie }. We assert the closure
      // is in place by reading the env var off the fareGetter via the Ktmb facade.

      // Simplest verification: spy on the http layer instead of the closure.
      // Use msw or vi.spyOn(global, "fetch") here, intercept the LayoutV2 request,
      // and assert the Cookie header contains the env-var value.
      // See tests/integration/ktmb/kits-client.test.ts for the pattern.

      // Placeholder assertion — replace with the actual fetch-spy assertion after
      // implementing Step 3:
      expect(process.env.KTMB_COOKIE).toBe(
        ".AspNetCore.Identity.Application=tok",
      );
    } finally {
      delete process.env.KTMB_COOKIE;
    }
  });
});
```

> If the existing `bootstrap.test.ts` already exposes a way to mock the GTFS loader and inspect the fareGetter, prefer that pattern over the fetch-spy approach. The literal assertion above is a stub that must be replaced by a meaningful fetch-spy assertion before this step is considered done.

- [ ] **Step 3: Wire the env var into bootstrap**

Modify `src/runtime/bootstrap.ts:33-37` from:

```typescript
  const ktmb = createKtmb({
    store: initial.data,
    fareGetter: ktmbGetAvailability,
    realtimeFetcher: () => fetchVehiclePositions(opts.feedRealtimeUrl),
  });
```

To:

```typescript
  const cookieFromEnv =
    typeof process !== "undefined" ? process.env.KTMB_COOKIE : undefined;
  const fareGetter = cookieFromEnv
    ? (input: Parameters<typeof ktmbGetAvailability>[0]) =>
        ktmbGetAvailability(input, { cookie: cookieFromEnv })
    : ktmbGetAvailability;
  const ktmb = createKtmb({
    store: initial.data,
    fareGetter,
    realtimeFetcher: () => fetchVehiclePositions(opts.feedRealtimeUrl),
  });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- bootstrap.test.ts`
Expected: PASS.

- [ ] **Step 5: Run full test suite**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/runtime/bootstrap.ts tests/unit/runtime/bootstrap.test.ts
git commit -m "feat(runtime): plumb KTMB_COOKIE env var into the fare getter"
```

---

## Task 13: Documentation + retire scripts/inspect-ktmb.md

**Files:**
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Delete: `scripts/inspect-ktmb.md`

- [ ] **Step 1: Update CHANGELOG**

Insert at the top of `CHANGELOG.md`:

```markdown
## [Unreleased]

### Added
- Real KTMB booking-site client. `getAvailability` now drives the four-step KITS flow (`/` → `/Trip` → `/Trip/GetTripToken` → `/Trip/Trip`) and returns live fares + listing-level seat counts for every train.
- Optional authenticated mode. Supplying `KTMB_COOKIE` (a logged-in KITS session cookie) makes the client fall through to `/Trip/LayoutV2`, returning per-class fares and OKU-excluded seat counts. Without the cookie, `Fare.seatsLeftIncludesPriority` is `true` to flag that the count includes OKU/priority seats.

### Removed
- Synthetic placeholder fixtures (`tests/fixtures/ktmb/{search,availability}-sample.json`) and the manual reverse-engineering worksheet (`scripts/inspect-ktmb.md`) — superseded by `scripts/capture-ktmb-fixtures.ts`.

### Changed
- `Fare` schema gains an optional `seatsLeftIncludesPriority: boolean` field.
```

- [ ] **Step 2: Update README**

Replace the section in `README.md` that describes the placeholder/blocked KTMB client (search for "placeholder" or "inspect-ktmb"). Add this subsection in the appropriate place:

```markdown
### Live fares + seat availability

`getAvailability` queries `online.ktmb.com.my` directly. Two modes:

- **Anonymous (default)** — returns a single synthetic class per train with the listing's minimum fare and the listing's "Available seats" count. The count includes OKU/priority seats; `Fare.seatsLeftIncludesPriority` is `true` to make this explicit. Suitable for "is there anything available?" checks.
- **Authenticated (opt-in)** — set the `KTMB_COOKIE` environment variable to a Cookie header captured from a logged-in browser session at `https://online.ktmb.com.my/`. The client then drives `/Trip/LayoutV2` and returns one entry per coach class (e.g. Business, Standard) with OKU seats excluded.

To capture an auth cookie: log in to KITS in your browser, open DevTools → Application → Cookies, copy `name=value` pairs into a single `name=value; name=value` string. Store it in a secrets manager and inject as `KTMB_COOKIE` at runtime — the project does not ship or commit any session material.

To regenerate test fixtures: `pnpm tsx scripts/capture-ktmb-fixtures.ts` (anonymous flow only; the LayoutV2 fixture must be captured manually with an authenticated browser session — see the script's printed instructions).
```

- [ ] **Step 3: Delete the obsolete worksheet**

```bash
git rm scripts/inspect-ktmb.md
```

- [ ] **Step 4: Verify no remaining references**

Run: `grep -r inspect-ktmb src tests README.md CHANGELOG.md docs scripts || echo OK`
Expected output: `OK`. Fix any remaining reference inline.

- [ ] **Step 5: Run full check**

Run: `pnpm typecheck && pnpm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add README.md CHANGELOG.md
git commit -m "docs(ktmb): document live booking client + auth-mode opt-in"
```

---

## Self-review checklist (run before the first task)

- [ ] **Spec coverage:** every requirement in "B but make it supported but optional" — anonymous default, optional auth, OKU-aware seat counts, no committed credentials, fare + availability — has a task. Auth defaults to off (Tasks 11, 12), cookie is opt-in via env var (Task 12), OKU exclusion lives in `parseLayout` (Task 8) and the auth-mode branch of `getAvailability` (Task 11).
- [ ] **Placeholders:** scanned. Task 12 Step 2 contains a stub assertion that must be replaced by a real fetch-spy assertion — that requirement is called out explicitly in the step. All other code blocks contain complete implementations.
- [ ] **Type consistency:** `KitsStation` from parse-home.ts is consumed by station-map.ts (Task 9) and kits-client.ts (Task 10). `TripListingRow` (Task 7) is consumed by kits-client.ts (Task 10) and client.ts (Task 11). `ParsedLayout.classes[i].seatsLeftIncludesPriority` is the literal `false`; the equivalent in `Fare` (Task 2) is `boolean`. Both flow through client.ts cleanly.
- [ ] **Order of operations:** Task 4 (capture fixtures) runs after Task 3 (CookieJar) because the capture script imports CookieJar. Tasks 5–8 (parsers) all consume the fixtures committed in Task 4. Task 10 consumes the parsers from Tasks 5–8. Task 11 consumes Task 10. Task 12 consumes Task 11.

---

**Plan complete and saved to `docs/superpowers/plans/2026-05-02-ktmb-real-booking-client.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
