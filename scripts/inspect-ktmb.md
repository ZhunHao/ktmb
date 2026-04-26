# KTMB endpoint capture

> **WARNING — synthetic placeholders committed.**
>
> The fixtures currently checked into `tests/fixtures/ktmb/` are **synthetic
> placeholders** produced without a real network capture. They exist only so
> Task 12 (parser + client) has a stable schema to compile and test against.
>
> Before any production deployment — and definitely before relying on KTMB
> fares/availability output in user-facing flows — these fixtures **MUST** be
> replaced with real captures from `https://online.ktmb.com.my/`, and the
> placeholder field names in `src/core/ktmb/types.ts` must be reconciled with
> the actual wire format. Until then, treat the KTMB live-availability path as
> unverified.
>
> The synthetic shape was modelled on the placeholder schema referenced by
> Task 12 (`KtmbAvailabilityResponseSchema`):
>
> ```json
> { "classes": [ { "name": "...", "price": 0, "currency": "MYR", "seats": 0 } ] }
> ```
>
> If the real capture differs (it almost certainly will — KTMB likely uses
> different keys, nested envelopes, and possibly snake_case or PascalCase),
> update both `tests/fixtures/ktmb/*.json` and `src/core/ktmb/types.ts` in
> the same change.

---

## Manual capture procedure

> Verbatim from `docs/superpowers/plans/2026-04-26-ktmb-api-mcp.md` § Task 11.

In a browser:

1. Open `https://online.ktmb.com.my/` and search for a route (KL Sentral → Butterworth, ~2 weeks out).
2. Open DevTools → Network → filter for XHR/Fetch.
3. Trigger the search. Identify the request that returns the train list with classes/fares/seats.
4. Right-click the request → Copy → Copy as cURL (POSIX).
5. Trigger an availability/fare check on a specific train. Capture that request too.

Then save anonymized response samples:

- Pretty-print each raw response with `jq .` and save to:
  - `tests/fixtures/ktmb/search-sample.json`
  - `tests/fixtures/ktmb/availability-sample.json`
- **Strip any PII or session-bound tokens.** Keep only the data shape relevant to schedules / fares / availability.

Finally:

```bash
git add scripts/inspect-ktmb.md tests/fixtures/ktmb
git commit -m "chore(ktmb): capture booking endpoint shapes for parser fixtures"
```

> If the capture reveals that KTMB now requires a captcha or session token to access fares, **stop and re-spec**. The design assumes anonymous read access; that assumption needs revisiting before continuing past Task 12.

---

## Fields to anonymize / strip before committing

When pasting captured cURL invocations or saving JSON samples, scrub the following before they touch git:

**Headers / cURL flags**
- `Cookie:` (entire value — session IDs, CSRF tokens, ad tracking)
- `Authorization:` (Bearer / Basic — any token)
- `X-CSRF-Token`, `X-XSRF-Token`, `X-Request-Id`, `X-Session-Id`
- `User-Agent` if it contains a unique device fingerprint (replace with a generic one)
- `Referer` query strings that include session params
- Any custom `X-*` header that looks like a token, signature, or hash

**Request body**
- Email, phone, full name, IC / passport number, date of birth
- Loyalty / member IDs, booking reference numbers (PNRs)
- Payment fields (card PAN, CVV, expiry, billing address) — should never be in a search/availability call, but verify
- Captcha tokens, reCAPTCHA / hCaptcha responses
- Device fingerprints, geolocation coordinates

**Response body**
- Any of the above if the server echoes them back
- Per-passenger seat hold tokens, lock IDs, or transient reservation handles
- Internal user IDs, account numbers
- Server-side trace / correlation IDs that pin to your session

**General rule:** if you cannot explain why a field is needed to render fares / classes / seats / schedules, strip it. The fixture should be the minimum shape required to exercise the parser.

---

## Capture worksheet (fill in after real capture)

## Search trains (date + origin + destination)
- Method: <GET or POST>
- URL: https://online.ktmb.com.my/<path>
- Headers required: <list>
- Body: <shape>
- Response root keys: <list>
- Sample saved to: tests/fixtures/ktmb/search-sample.json

## Train availability + fares
- Method:
- URL:
- Headers:
- Body:
- Response root keys:
- Sample saved to: tests/fixtures/ktmb/availability-sample.json
