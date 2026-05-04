# Runbook: forward-dated fallback failure

When a request lands past the GTFS calendar window and `KTMB_FORWARD_FALLBACK=1`
is set, `SchedulesService.listSchedulesAsync()` falls through to the KITS
booking site to synthesise schedules from the public listing. This runbook
covers what to do when *that* path fails.

**You are here because** users with `KTMB_FORWARD_FALLBACK=1` see an error on
forward-dated `list_schedules` / `GET /v1/schedules?date=...` requests, even
though the same date works on the live KITS site.

## Decision tree

1. **Is the GTFS feed actually past the requested date?**
   `GET /v1/schedules?from=KUL&to=BTW&date=2099-01-01` will always trip the
   fallback because the date is hopeless. Confirm `store.calendarWindow` —
   the feed normally publishes 30–45 days ahead.
   - If the date is *inside* the window, the fallback is not what's running;
     this is a regular GTFS lookup miss. Stop here, debug as a normal lookup.

2. **Does the fallback fire at all?**
   Check the response error code:
   - `outside_calendar_window` → `KTMB_FORWARD_FALLBACK` is unset or not `"1"`.
   - `parse_error` / `upstream_error` → fallback fired and KITS returned
     something we couldn't use. Continue.

3. **Is plain KITS healthy?**
   Run [tests/integration/ktmb/kits-client.test.ts](../../tests/integration/ktmb/kits-client.test.ts)
   against MSW fixtures, then capture a fresh fixture against live KITS:
   `pnpm tsx scripts/capture-ktmb-fixtures.ts`.
   - If the capture fails, KITS itself is broken — switch to the
     [KITS scrape failure runbook](./kits-scrape-failure.md).

4. **Does the OD pair exist as a KITS station?**
   The fallback resolves GTFS station codes to KITS station IDs via
   [station-map.ts](../../src/core/ktmb/station-map.ts). If a code is
   unmapped, `searchKitsByGtfsCodes` returns `not_found` even though KITS
   itself has data for that station.
   - Add the missing mapping and ship a patch release.

5. **Did the listing format change for a forward-dated query?**
   KITS occasionally renders different markup for "advance booking" dates
   (no fares yet, only times). `parseTripListing` should still extract
   `trainNo` / `from` / `to` / `journeyDurationMinutes`. If a parser change
   is needed, follow the same fixture-bisect workflow as
   [kits-scrape-failure.md](./kits-scrape-failure.md).

## Recovery

- Hot-fix path: temporarily unset `KTMB_FORWARD_FALLBACK` so requests fail
  cleanly with `outside_calendar_window` instead of `parse_error`. Users
  retry inside the window.
- Long-term: capture a fresh fixture, update the parser or station map,
  add a regression test, ship.

## Related

- [KITS scrape failure runbook](./kits-scrape-failure.md) — for KITS-wide
  outages, not just the forward-dated path.
- [src/core/schedules/service.ts](../../src/core/schedules/service.ts) —
  fallback wiring (`listSchedulesAsync`).
- [src/core/schedules/kits-fallback-adapter.ts](../../src/core/schedules/kits-fallback-adapter.ts) —
  TripListingRow → TrainSchedule projection.
