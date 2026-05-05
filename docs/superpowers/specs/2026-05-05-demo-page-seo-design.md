# Demo page SEO — design spec

**Date:** 2026-05-05
**Status:** Draft, awaiting user review
**Surface:** `https://ktmb-demo.zhunhao.deno.net/` (the static one-pager served from `site/index.html` by `bin/ktmb-deno.ts`)
**Scope:** On-page technical SEO only

## Context

The ktmb project has three public surfaces — the npm package (`@zhun_hao/ktmb`),
the GitHub repository, and the live demo at `ktmb-demo.zhunhao.deno.net`. The
demo page is the project's most polished surface and the only one whose
`<head>` we control fully, so it is designated the **canonical marketing page**
for the project. GitHub and npm become inbound link sources; SoftwareSourceCode
JSON-LD on the demo page references them as related surfaces.

The page already ships:

- a `<title>`, `<meta name="viewport">`, semantic `<h1>` / `<h2>` hierarchy
- ARIA labels on the hero SVG, station search input, leaflet map, and refresh control
- an `lang="en"` attribute on `<html>`
- a `/llms.txt` route and a visually-hidden AI/LLM notice

It does not ship: meta description, Open Graph or Twitter Card meta, `<link rel="canonical">`,
`<meta name="robots">`, JSON-LD, `/robots.txt`, `/sitemap.xml`, a favicon, or
preconnect / DNS-prefetch hints. This spec closes those gaps.

## Goals and non-goals

### Goals

1. Be findable by **developers and agent-builders** searching for keywords like
   *Malaysia rail API*, *KTMB MCP server*, *GTFS Malaysia*, *ETS schedule API*.
2. Be citable by **AI assistants** (Claude, ChatGPT, Perplexity, Gemini)
   answering questions about Malaysian rail data — both via the existing
   `llms.txt` and via richer structured data.
3. Render a clean text preview when the URL is shared in Slack, X, Discord,
   LinkedIn, or pasted into an LLM that fetches link metadata.
4. Avoid wasting crawl budget on API JSON responses (`/v1/*`) and the liveness
   probe (`/healthz`).
5. Pass Google Rich Results Test and `validator.schema.org` with zero errors
   and zero warnings.

### Non-goals (deliberately deferred)

- **Consumer rail-passenger keywords** (e.g. *KTMB schedule today*, *ETS Gemas*).
  Ranking on these would invite abuse of the live `/v1/*` endpoints, which
  carry no rate limiting in the demo deployment.
- **`og:image` and any social preview asset.** Confirmed out of scope — the
  social card stays blank by design.
- **Copy / heading rewrites.** The page's H1, H2s, and visually-hidden AI
  block stay as-is.
- **Off-page tactics** (HN, dev.to, awesome-lists, npm keywords beyond what
  ships, backlink seeding). Tracked as a follow-up, not in this spec.
- **Edge-rendered SEO logic.** Everything ships as static files served by the
  existing `serveStatic` pattern.
- **Core Web Vitals deep tuning** beyond preconnect / DNS-prefetch. Async
  Leaflet CSS and script load-order changes are quarantined to a separate
  perf pass to avoid bundling regression risk into this PR.
- **A styled 404 page.**
- **Search Console / Bing Webmaster verification.** Requires the user's
  account; not codable.

## Architecture

Two files modified, three files created. No `src/` changes; the library, REST
API, and MCP server are untouched.

### Files modified

- `site/index.html` — additive `<head>` content only:
  meta tags, JSON-LD `<script>`, preconnect / dns-prefetch hints, favicon link.
  Body markup unchanged.
- `bin/ktmb-deno.ts` — three new `serveStatic` routes registered in the same
  block as the existing `/llms.txt` route. No new abstraction; ~5 added lines.

### Files created

- `site/robots.txt` — crawler directives.
- `site/sitemap.xml` — two-URL static sitemap.
- `site/favicon.svg` — single 32×32 SVG, rail-line glyph in `#1d1d1f` on
  transparent background.

## Components

### A. `<head>` meta block

Insert between the existing `<title>` and the first `<link rel="stylesheet">`
in `site/index.html`. Concrete strings:

```html
<meta name="description" content="TypeScript library, REST API, and MCP server for Malaysia's KTMB rail data — stations, schedules, fares, Komuter, and live GTFS-Realtime vehicles." />
<meta name="robots" content="index,follow,max-image-preview:large" />
<link rel="canonical" href="https://ktmb-demo.zhunhao.deno.net/" />
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />

<!-- Open Graph (text-only; no og:image by scope decision) -->
<meta property="og:type" content="website" />
<meta property="og:site_name" content="ktmb" />
<meta property="og:locale" content="en_US" />
<meta property="og:url" content="https://ktmb-demo.zhunhao.deno.net/" />
<meta property="og:title" content="ktmb — the rail data library for Malaysia" />
<meta property="og:description" content="TypeScript library, REST API, and MCP server for Malaysia's KTMB rail data — stations, schedules, fares, Komuter, and live GTFS-Realtime vehicles." />

<!-- Twitter / X (summary card, not summary_large_image — no image) -->
<meta name="twitter:card" content="summary" />
<meta name="twitter:title" content="ktmb — the rail data library for Malaysia" />
<meta name="twitter:description" content="TypeScript library, REST API, and MCP server for Malaysia's KTMB rail data." />
```

**Description rationale.** 148 characters, fits Google's typical 155-char SERP
truncation window. Front-loads the high-intent keywords ("TypeScript library,
REST API, and MCP server") and the primary entity ("KTMB rail data"). Same
string is reused for `og:description` so all three preview surfaces stay in
sync; the Twitter description is shorter (more aggressive truncation on X).

### B. JSON-LD structured data

Single `<script type="application/ld+json">` at the end of `<head>`.
Three entities in a `@graph`:

1. **`WebSite`** — `url: "https://ktmb-demo.zhunhao.deno.net/"`,
   `name: "ktmb"`, `inLanguage: "en"`, `publisher` references the
   `SoftwareSourceCode` entity.
2. **`SoftwareSourceCode`** — `name: "ktmb"`,
   `programmingLanguage: "TypeScript"`,
   `codeRepository: "https://github.com/ZhunHao/ktmb"`,
   `license: "https://opensource.org/licenses/MIT"`,
   `runtimePlatform: ["Node.js", "Deno"]`,
   `targetProduct` lists `@zhun_hao/ktmb`, `ktmb-api`, `ktmb-mcp`,
   `description` mirrors the meta description.
3. **`SoftwareApplication`** — included alongside `SoftwareSourceCode` so
   that SERP features which only fire on `SoftwareApplication` can match.
   `applicationCategory: "DeveloperApplication"`,
   `operatingSystem: "Cross-platform"`,
   `offers: { "@type": "Offer", "price": "0", "priceCurrency": "USD" }`
   (free, MIT-licensed). Slight type imprecision is accepted; both entities
   reference the same canonical URL so there is no ranking conflict.

`BreadcrumbList`, `FAQPage`, and `Article` are explicitly **not** included —
the first would be artificial on a one-pager, the latter two would require
copy work that is out of scope.

### C. `site/robots.txt`

```
User-agent: *
Allow: /
Allow: /llms.txt
Disallow: /v1/
Disallow: /healthz

Sitemap: https://ktmb-demo.zhunhao.deno.net/sitemap.xml
```

Single rule group covers all crawlers. No GPTBot / CCBot / Perplexity carve-outs:
the project is open-source and ships `llms.txt`, so an unconditional allow is
consistent with its stance. `/v1/*` and `/healthz` are disallowed to save
crawl budget on JSON responses that are not useful as search results.

### D. `site/sitemap.xml`

Two URLs in standard sitemap protocol XML:

| URL | priority | changefreq | lastmod |
|---|---|---|---|
| `https://ktmb-demo.zhunhao.deno.net/` | `1.0` | `monthly` | PR-merge date |
| `https://ktmb-demo.zhunhao.deno.net/llms.txt` | `0.8` | `monthly` | PR-merge date |

Static file; `lastmod` is set to the PR-merge date on first commit and
hand-updated on subsequent copy or content changes. No build-time
generation — a one-pager doesn't earn that complexity.

### E. `site/favicon.svg`

A 32×32 SVG of two parallel rail lines crossed by sleeper ticks, drawn in
`#1d1d1f` on a transparent background (matching `--ink` in the page's design
tokens). Single file, no PNG variants and no `apple-touch-icon` — consistent
with the "skip og:image" decision to keep this PR free of design work.

The icon path:

- two horizontal rails inset 6px from the top and bottom edges
- four vertical sleeper ticks evenly spaced across the rails
- 2px stroke width, rounded line caps

Final shape lives in `site/favicon.svg`.

### F. Performance hints

Two new `<link>` tags inserted **above** the existing Leaflet stylesheet link:

```html
<link rel="preconnect" href="https://unpkg.com" crossorigin />
<link rel="dns-prefetch" href="https://api.data.gov.my" />
```

`preconnect` for `unpkg` because Leaflet CSS is fetched there synchronously
on the critical path — the saved TLS handshake is measurable. `dns-prefetch`
(weaker hint, no TLS) for `api.data.gov.my` because the realtime poll only
fires once the page is interactive; a full `preconnect` for an endpoint that
fires on user interaction would waste an early connection slot.

Not addressed in this spec: converting the Leaflet stylesheet to async-loaded
via `rel="preload"` + `onload` swap, deferring `ktmb-demo.js`, or inlining
critical CSS. Each is a real CWV lever and each carries regression risk
(FOUC, broken map render, visual jank). Quarantined to a separate perf pass.

### G. Alt / aria audit (no code change)

Confirmed during exploration — existing markup is correct:

- Hero SVG: `aria-label="KTMB network — Peninsular Malaysia"` ✓
- Hero art wrapper: `aria-hidden="true"` on the decorative version ✓
- Station search: `role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="station-autocomplete"` ✓
- Map: `role="application" aria-label="Live vehicle map of Peninsular Malaysia"` ✓
- Map refresh button: `aria-label="Refresh live vehicles"` ✓

Listed here for the record. No edits.

## Routing — `bin/ktmb-deno.ts`

Three lines added to the existing `serveStatic` block (immediately after the
`/llms.txt` line):

```typescript
app.get("/robots.txt", serveStatic({ path: "./site/robots.txt" }));
app.get("/sitemap.xml", serveStatic({ path: "./site/sitemap.xml" }));
app.get("/favicon.svg", serveStatic({ path: "./site/favicon.svg" }));
```

Order matters: routes are registered after `buildApp(rt.ktmb)` so `/v1/*`
handlers from the Hono app keep priority. `serveStatic` only matches files
that exist under `./site`, so a missing file falls through cleanly rather
than 500-ing.

## Validation

| Check | Tool | Pass criterion |
|---|---|---|
| `<head>` meta renders | View source on the live URL | Description, canonical, og:* present; no duplicate `<title>` |
| Canonical resolves to itself | Google Search Console URL Inspection | User-declared canonical equals Google-selected canonical |
| Open Graph parses | `opengraph.xyz` or `cards-dev.twitter.com` | Title + description render; no image (expected) |
| JSON-LD valid | `validator.schema.org` and Google Rich Results Test | All three entities valid; zero errors, zero warnings |
| `robots.txt` correct | URL fetch + Search Console robots tester | `Allow: /` resolves; `/v1/foo` reports as blocked |
| Sitemap discoverable | Submit in Google Search Console + Bing Webmaster | "1 sitemap, 2 URLs, 0 errors" |
| Favicon serves | Browser tab + `curl -I /favicon.svg` | HTTP 200, `Content-Type: image/svg+xml` |
| Preconnect fires | Chrome DevTools → Network → Timing on second nav | `unpkg.com` shows ~0 ms connect time |
| No regressions | Lighthouse on deploy preview | SEO ≥ 95, A11y unchanged from baseline, no new console errors |

### Manual smoke test post-deploy

1. Hard-refresh the live URL; paste it into Slack — preview shows title +
   description (no image, by design).
2. Paste the URL into Claude Desktop / ChatGPT — confirm `llms.txt` is
   fetched and the description matches.
3. `curl -sI https://ktmb-demo.zhunhao.deno.net/robots.txt` returns 200,
   and the body disallows `/v1/` and `/healthz`.

## Risks and rollback

- **JSON-LD validation failure on first deploy.** Lowest-risk failure
  mode — a broken JSON-LD block does nothing harmful, it simply doesn't
  produce rich results. Caught by `validator.schema.org` before merge.
- **Canonical pointing at the wrong URL.** If Deno Deploy ever serves the
  page on a different hostname (e.g. a preview deployment), the
  hard-coded canonical will look wrong. Acceptable: the canonical only
  needs to be correct for the production deploy; preview environments
  shouldn't be indexed anyway.
- **`/v1/*` disallow shadowing a future legitimate use case.** If you
  later want a specific `/v1/...` path indexed, add a more specific
  `Allow:` rule before the `Disallow: /v1/`.
- **Rollback** is a single revert of the SEO PR. No data migration, no
  state. Reverting restores the page to its pre-SEO state with no
  user-visible change beyond the favicon disappearing.

## Out-of-scope follow-ups (tracked, not done)

- Off-page strategy: HN Show post, dev.to article, awesome-mcp / awesome-malaysia
  list submissions, npm keyword tuning, Deno Deploy showcase submission.
- AI-discoverability beyond `llms.txt`: `llms-full.txt`, Q&A-formatted snippets,
  schema.org `featureList` enrichment.
- Copy / heading rewrites for keyword targeting.
- `og:image` (hand-crafted or edge-rendered).
- Async Leaflet CSS, deferred script load order, inlined critical CSS.
- Search Console / Bing Webmaster property verification (requires user account).
