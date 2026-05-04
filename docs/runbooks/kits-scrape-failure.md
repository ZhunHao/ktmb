# Runbook: KITS scrape failure

The KTMB Online (KITS) booking site at `online.ktmb.com.my` is the source of
truth for live fares and seat availability. We screen-scrape it, so it will
break when KTMB changes the site. This runbook is the recovery playbook.

**You are here because** integration tests against KITS are red, the public
demo's fare card returns errors, or a user reported `parse_error` /
`upstream_error` from `getAvailability`.

## At a glance

The scrape is a 4-step pipeline. A 5th optional step runs only when an
authenticated cookie is supplied:

| # | Request                            | Purpose                                                      | Parser                                       |
|---|------------------------------------|--------------------------------------------------------------|----------------------------------------------|
| 1 | `GET  /`                           | Pick up `__RequestVerificationToken` and `jsStations`        | `parseHomePage` ([parse-home.ts](../../src/core/ktmb/parse-home.ts)) |
| 2 | `POST /Trip`                       | Submit form → returns listing HTML with `SearchData` and `FormValidationCode` | `parseTripForm` ([parse-trip-form.ts](../../src/core/ktmb/parse-trip-form.ts)) |
| 3 | `POST /Trip/GetTripToken?t=…`      | Rotate the `FormToken` (single-use)                          | inline JSON parse in `kits-client.ts:142`    |
| 4 | `POST /Trip/Trip`                  | Returns the JSON listing of trains for the day               | `parseTripListing` ([parse-trip-listing.ts](../../src/core/ktmb/parse-trip-listing.ts)) |
| 5 | `POST /Trip/LayoutV2` *(auth only)* | Per-class fare and seat counts excluding OKU                 | `parseLayout` ([parse-layout.ts](../../src/core/ktmb/parse-layout.ts)) |

All four anonymous steps must succeed in sequence on the **same**
`KitsClient` instance (it carries cookies and `searchData`). See the state
warning on the class for why a fresh client per logical search is required.

## Bisecting which step broke

KITS errors surface as one of:

- `upstream_error: HTTP <status>` — the server returned a non-200 response at
  step N. The error message names the path (`/`, `/Trip`, `/Trip/GetTripToken`,
  `/Trip/Trip`, or `LayoutV2`).
- `parse_error: <field> not found` — request succeeded but the response shape
  changed. The message names what's missing.
- `not_found: no KITS station mapped for GTFS pair X/Y` — pre-step station
  resolution failed (see "Station catalog drift" below).

To bisect, run the live capture script and watch which step fails:

```bash
pnpm tsx scripts/capture-ktmb-fixtures.ts
```

It prints `[1/4] GET /`, `[2/4] POST /Trip`, etc. It writes redacted bodies to
`tests/fixtures/ktmb/`. The first failing step tells you where to look.

## Common breakages

### Step 1 — `parseHomePage` can't find `__RequestVerificationToken` or `jsStations`

KTMB rewrote the home template. Open `tests/fixtures/ktmb/home.html` after
recapture and grep for:

- `__RequestVerificationToken` — must still appear as a hidden input
- `var jsStations` — embedded inline JS array of station records

If either name changed, update the regexes in
[parse-home.ts](../../src/core/ktmb/parse-home.ts).

### Step 2 — `/Trip` returns JSON instead of HTML

KTMB content-negotiates on `Accept` headers. If the `Accept`/`Sec-Fetch-*`
headers in `kits-client.ts` are stripped, `/Trip` returns the
`GetTripToken` JSON envelope and `parseTripForm` fails with `parse_error`. The
header set was verified live 2026-05-02 — see the comment block above the
request in `kits-client.ts`. Don't remove those headers.

### Step 2 — `parseTripForm` can't extract `SearchData` / `FormValidationCode`

KTMB renamed the hidden form fields. Selectors live in
[parse-trip-form.ts](../../src/core/ktmb/parse-trip-form.ts) — currently
`#SearchData`, `#FormValidationCode`, and `input[name="__RequestVerificationToken"]`.
Recapture, inspect `trip-form.html`, update selectors.

### Step 3 — `/Trip/GetTripToken` returns 200 but no `formToken`

The JSON envelope changed shape. `kits-client.ts:142` expects
`{ formToken: string }`. Update the field name there if KTMB renames it.

### Step 4 — `parseTripListing` returns empty rows or `parse_error`

The listing JSON changed shape. Check `tests/fixtures/ktmb/trip-listing.json`
for the current keys and update [parse-trip-listing.ts](../../src/core/ktmb/parse-trip-listing.ts).
Common fields we depend on: `trainNo`, `service`, `departTime`, `arriveTime`,
`minFareMinor` (or whatever they're called now), `seatsAvailable`, `tripData`.

### Step 5 — `LayoutV2` returns 401/403

The cookie is expired or the `__RequestVerificationToken` was rotated. The
client returns `upstream_error: LayoutV2 requires authenticated cookie` for
401/403 specifically. Re-capture `KTMB_COOKIE` from a fresh logged-in browser
session.

### Station catalog drift

If `not_found` errors mention specific GTFS stop_ids (e.g. `KUL`, `BTW`)
that *should* exist:

1. Recapture `home.html`.
2. Look up the station's `Id`/`StationData` in `jsStations`.
3. Confirm [station-map.ts](../../src/core/ktmb/station-map.ts) maps the GTFS
   stop_id to a current KITS id, or that the name match still works.

KITS occasionally adds/removes stations or renames them between languages.

## Recapturing fixtures

The integration tests at `tests/integration/ktmb/kits-client.test.ts` use the
fixtures under `tests/fixtures/ktmb/`. To refresh:

```bash
# Anonymous flow (steps 1–4) — tokens and base64 blobs are auto-redacted
pnpm tsx scripts/capture-ktmb-fixtures.ts

# layout-v2.json (step 5) — must be captured manually with an authenticated browser:
#   1. Log in to https://online.ktmb.com.my/ in a real browser.
#   2. DevTools → Network → trigger a /Trip/LayoutV2 request.
#   3. Save the response body as tests/fixtures/ktmb/layout-v2.json.
#   4. Manually redact any user-identifying fields before committing.
```

After recapture, run the integration suite:

```bash
pnpm vitest run tests/integration/ktmb
```

If parsers needed updates, also run the smoke suite (gated on
`KTMB_SMOKE=1`) to confirm the live request flow works end-to-end:

```bash
KTMB_SMOKE=1 pnpm vitest run tests/smoke
```

## Verifying after a fix

1. `pnpm typecheck` — parser type signatures unchanged
2. `pnpm vitest run tests/integration/ktmb` — fixture-backed tests green
3. `KTMB_SMOKE=1 pnpm vitest run tests/smoke` — live KITS happy path works
4. Manually exercise the public site fare card

## Related code

- Pipeline orchestration: [src/core/ktmb/kits-client.ts](../../src/core/ktmb/kits-client.ts)
- High-level entrypoint (used by `getAvailability` and forward fallback):
  [src/core/ktmb/search-by-gtfs.ts](../../src/core/ktmb/search-by-gtfs.ts)
- GTFS↔KITS station mapping: [src/core/ktmb/station-map.ts](../../src/core/ktmb/station-map.ts)
- MCP error-path tests: [tests/integration/mcp/tools-error-paths.test.ts](../../tests/integration/mcp/tools-error-paths.test.ts)
- Smoke tests (live network): [tests/smoke/](../../tests/smoke/)
