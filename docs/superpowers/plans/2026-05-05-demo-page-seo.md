# Demo page SEO Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add on-page technical SEO to the live demo at `ktmb-demo.zhunhao.deno.net` — meta tags, Open Graph, JSON-LD, robots.txt, sitemap.xml, favicon, and connection hints — without touching copy or shipping an og:image.

**Architecture:** Two files modified (`site/index.html`, `bin/ktmb-deno.ts`), three created (`site/robots.txt`, `site/sitemap.xml`, `site/favicon.svg`). All static; no `src/` changes; no new runtime dependencies. Static-file routes mirror the existing `/llms.txt` `serveStatic` pattern.

**Tech Stack:** Hono `serveStatic` (Deno), vitest for content assertions, Node `fs/promises` to read static files in tests, JSON.parse for JSON-LD validation.

**Spec:** [docs/superpowers/specs/2026-05-05-demo-page-seo-design.md](../specs/2026-05-05-demo-page-seo-design.md)

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `site/index.html` | modify | Add `<head>` SEO content (meta, JSON-LD, link hints, favicon link). Body unchanged. |
| `bin/ktmb-deno.ts` | modify | Register three new `serveStatic` routes for the new files. |
| `site/robots.txt` | create | Crawler directives + sitemap pointer. |
| `site/sitemap.xml` | create | Two-URL static sitemap. |
| `site/favicon.svg` | create | 32×32 rail-line glyph. |
| `tests/unit/site/seo.test.ts` | create | Content assertions for all SEO surface; grows with each task. |

The test file is the project's first `tests/unit/site/` test. It uses `node:fs/promises` `readFile` to read each artifact as text, then asserts substrings or parses JSON. No runtime imports from `bin/ktmb-deno.ts` — that file is excluded from the TS project (it imports `npm:` specifiers that only Deno resolves), so we read it as a string and grep the routes.

---

## Conventions used by every task

- **Test runner:** `pnpm test tests/unit/site/seo.test.ts -t "<test name>"` runs a single test by name (vitest `-t` filter).
- **Run all SEO tests:** `pnpm test tests/unit/site/seo.test.ts`.
- **Commit format:** Conventional Commits (`feat:`, `chore:`, `docs:`). Attribution disabled globally.
- **TDD cycle for every task:** RED (write failing test, run, see it fail) → GREEN (write the file/edit, run, see it pass) → COMMIT.

---

## Task 1: Test scaffolding

**Files:**
- Create: `tests/unit/site/seo.test.ts`

This task creates the test file with shared helpers. Every later task appends tests inside the same file under new `describe()` blocks.

- [ ] **Step 1: Create the test file with the helper module-level constants**

Create `tests/unit/site/seo.test.ts`:

```ts
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const SITE_DIR = new URL("../../../site/", import.meta.url);
const DENO_ENTRY = new URL("../../../bin/ktmb-deno.ts", import.meta.url);

const readSiteFile = (name: string): Promise<string> =>
  readFile(new URL(name, SITE_DIR), "utf8");

const readDenoEntry = (): Promise<string> => readFile(DENO_ENTRY, "utf8");

describe("site SEO — scaffolding sanity check", () => {
  it("can read site/index.html", async () => {
    const html = await readSiteFile("index.html");
    expect(html).toContain("<!doctype html>");
  });
});
```

- [ ] **Step 2: Run the scaffolding test, expect it to PASS**

Run: `pnpm test tests/unit/site/seo.test.ts`

Expected: 1 passed (the sanity check). If this fails, the path math is wrong; do not move on.

- [ ] **Step 3: Commit**

```bash
git add tests/unit/site/seo.test.ts
git commit -m "test(site): scaffold SEO content tests"
```

---

## Task 2: /robots.txt — file and route

**Files:**
- Create: `site/robots.txt`
- Modify: `bin/ktmb-deno.ts` (add one `app.get` line)
- Test: `tests/unit/site/seo.test.ts` (append a `describe`)

- [ ] **Step 1: Append the failing tests**

Append to `tests/unit/site/seo.test.ts`:

```ts
describe("site/robots.txt", () => {
  it("allows / and /llms.txt and disallows /v1/ and /healthz", async () => {
    const text = await readSiteFile("robots.txt");
    expect(text).toMatch(/^User-agent: \*/m);
    expect(text).toMatch(/^Allow: \/$/m);
    expect(text).toMatch(/^Allow: \/llms\.txt$/m);
    expect(text).toMatch(/^Disallow: \/v1\/$/m);
    expect(text).toMatch(/^Disallow: \/healthz$/m);
  });

  it("points to the canonical sitemap URL", async () => {
    const text = await readSiteFile("robots.txt");
    expect(text).toContain("Sitemap: https://ktmb-demo.zhunhao.deno.net/sitemap.xml");
  });

  it("is registered on the Deno entry as /robots.txt", async () => {
    const src = await readDenoEntry();
    expect(src).toMatch(
      /app\.get\(\s*"\/robots\.txt"\s*,\s*serveStatic\(\{\s*path:\s*"\.\/site\/robots\.txt"\s*\}\)\s*\)/,
    );
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `pnpm test tests/unit/site/seo.test.ts -t "robots.txt"`

Expected: 3 failed (no `site/robots.txt`, no Deno route).

- [ ] **Step 3: Create `site/robots.txt`**

```
User-agent: *
Allow: /
Allow: /llms.txt
Disallow: /v1/
Disallow: /healthz

Sitemap: https://ktmb-demo.zhunhao.deno.net/sitemap.xml
```

- [ ] **Step 4: Add the route in `bin/ktmb-deno.ts`**

Insert below the existing `/llms.txt` line (currently `bin/ktmb-deno.ts:58`):

```typescript
app.get("/robots.txt", serveStatic({ path: "./site/robots.txt" }));
```

The block of `app.get("/...", serveStatic(...))` calls should remain contiguous, in this order: `/`, `/ktmb-demo.js`, `/llms.txt`, `/robots.txt`.

- [ ] **Step 5: Run, expect PASS**

Run: `pnpm test tests/unit/site/seo.test.ts -t "robots.txt"`

Expected: 3 passed.

- [ ] **Step 6: Commit**

```bash
git add site/robots.txt bin/ktmb-deno.ts tests/unit/site/seo.test.ts
git commit -m "feat(site): add /robots.txt with crawler directives"
```

---

## Task 3: /sitemap.xml — file and route

**Files:**
- Create: `site/sitemap.xml`
- Modify: `bin/ktmb-deno.ts` (add one `app.get` line)
- Test: `tests/unit/site/seo.test.ts` (append a `describe`)

- [ ] **Step 1: Append the failing tests**

Append to `tests/unit/site/seo.test.ts`:

```ts
describe("site/sitemap.xml", () => {
  it("is a valid XML document with the sitemap urlset namespace", async () => {
    const text = await readSiteFile("sitemap.xml");
    expect(text.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(text).toContain('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"');
  });

  it("lists exactly two URLs: / and /llms.txt", async () => {
    const text = await readSiteFile("sitemap.xml");
    const locs = [...text.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(locs).toEqual([
      "https://ktmb-demo.zhunhao.deno.net/",
      "https://ktmb-demo.zhunhao.deno.net/llms.txt",
    ]);
  });

  it("declares priorities 1.0 and 0.8", async () => {
    const text = await readSiteFile("sitemap.xml");
    const priorities = [...text.matchAll(/<priority>([^<]+)<\/priority>/g)].map((m) => m[1]);
    expect(priorities).toEqual(["1.0", "0.8"]);
  });

  it("is registered on the Deno entry as /sitemap.xml", async () => {
    const src = await readDenoEntry();
    expect(src).toMatch(
      /app\.get\(\s*"\/sitemap\.xml"\s*,\s*serveStatic\(\{\s*path:\s*"\.\/site\/sitemap\.xml"\s*\}\)\s*\)/,
    );
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `pnpm test tests/unit/site/seo.test.ts -t "sitemap.xml"`

Expected: 4 failed.

- [ ] **Step 3: Create `site/sitemap.xml`**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://ktmb-demo.zhunhao.deno.net/</loc>
    <lastmod>2026-05-05</lastmod>
    <changefreq>monthly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://ktmb-demo.zhunhao.deno.net/llms.txt</loc>
    <lastmod>2026-05-05</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
</urlset>
```

(`lastmod` is the spec's PR-merge date placeholder. If you merge on a different date, update both `<lastmod>` values to the actual merge date in the same commit.)

- [ ] **Step 4: Add the route in `bin/ktmb-deno.ts`**

Below the `/robots.txt` line:

```typescript
app.get("/sitemap.xml", serveStatic({ path: "./site/sitemap.xml" }));
```

- [ ] **Step 5: Run, expect PASS**

Run: `pnpm test tests/unit/site/seo.test.ts -t "sitemap.xml"`

Expected: 4 passed.

- [ ] **Step 6: Commit**

```bash
git add site/sitemap.xml bin/ktmb-deno.ts tests/unit/site/seo.test.ts
git commit -m "feat(site): add /sitemap.xml with two canonical URLs"
```

---

## Task 4: /favicon.svg — file, route, and `<link rel="icon">`

**Files:**
- Create: `site/favicon.svg`
- Modify: `bin/ktmb-deno.ts` (add one `app.get` line)
- Modify: `site/index.html` (add `<link rel="icon">` in `<head>`)
- Test: `tests/unit/site/seo.test.ts` (append a `describe`)

- [ ] **Step 1: Append the failing tests**

```ts
describe("site/favicon.svg", () => {
  it("is a 32×32 SVG with the rail-line glyph", async () => {
    const svg = await readSiteFile("favicon.svg");
    expect(svg).toContain('viewBox="0 0 32 32"');
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('stroke="#1d1d1f"');
    // 2 rails + 4 sleeper ticks = 6 <line> elements
    expect((svg.match(/<line\b/g) ?? []).length).toBe(6);
  });

  it("is registered on the Deno entry as /favicon.svg", async () => {
    const src = await readDenoEntry();
    expect(src).toMatch(
      /app\.get\(\s*"\/favicon\.svg"\s*,\s*serveStatic\(\{\s*path:\s*"\.\/site\/favicon\.svg"\s*\}\)\s*\)/,
    );
  });

  it("is linked from index.html via rel=icon", async () => {
    const html = await readSiteFile("index.html");
    expect(html).toMatch(/<link\s+rel="icon"\s+type="image\/svg\+xml"\s+href="\/favicon\.svg"\s*\/?>/);
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `pnpm test tests/unit/site/seo.test.ts -t "favicon"`

Expected: 3 failed.

- [ ] **Step 3: Create `site/favicon.svg`**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" fill="none" stroke="#1d1d1f" stroke-width="2" stroke-linecap="round">
  <line x1="2" y1="6" x2="30" y2="6"/>
  <line x1="2" y1="26" x2="30" y2="26"/>
  <line x1="6" y1="4" x2="6" y2="28"/>
  <line x1="13" y1="4" x2="13" y2="28"/>
  <line x1="19" y1="4" x2="19" y2="28"/>
  <line x1="26" y1="4" x2="26" y2="28"/>
</svg>
```

- [ ] **Step 4: Add the route in `bin/ktmb-deno.ts`**

Below the `/sitemap.xml` line:

```typescript
app.get("/favicon.svg", serveStatic({ path: "./site/favicon.svg" }));
```

- [ ] **Step 5: Add the `<link rel="icon">` in `site/index.html`**

In the `<head>`, immediately **above** the existing Leaflet stylesheet `<link>` line (currently `site/index.html:7`), insert:

```html
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
```

Result: the icon sits in the `<head>`'s `<link>` cluster, just above where preconnect/dns-prefetch will land in Task 8 and above the Leaflet stylesheet.

- [ ] **Step 6: Run, expect PASS**

Run: `pnpm test tests/unit/site/seo.test.ts -t "favicon"`

Expected: 3 passed.

- [ ] **Step 7: Commit**

```bash
git add site/favicon.svg bin/ktmb-deno.ts site/index.html tests/unit/site/seo.test.ts
git commit -m "feat(site): add SVG favicon with rail-line glyph"
```

---

## Task 5: meta description, robots, canonical

**Files:**
- Modify: `site/index.html` (add three meta/link tags in `<head>`)
- Test: `tests/unit/site/seo.test.ts` (append a `describe`)

- [ ] **Step 1: Append the failing tests**

```ts
describe("index.html — base SEO meta", () => {
  it("has a meta description with the project tagline", async () => {
    const html = await readSiteFile("index.html");
    expect(html).toMatch(
      /<meta\s+name="description"\s+content="TypeScript library, REST API, and MCP server for Malaysia's KTMB rail data — stations, schedules, fares, Komuter, and live GTFS-Realtime vehicles\."\s*\/?>/,
    );
  });

  it("declares index,follow with max-image-preview:large", async () => {
    const html = await readSiteFile("index.html");
    expect(html).toMatch(
      /<meta\s+name="robots"\s+content="index,follow,max-image-preview:large"\s*\/?>/,
    );
  });

  it("declares the canonical URL as the production demo origin", async () => {
    const html = await readSiteFile("index.html");
    expect(html).toMatch(
      /<link\s+rel="canonical"\s+href="https:\/\/ktmb-demo\.zhunhao\.deno\.net\/"\s*\/?>/,
    );
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `pnpm test tests/unit/site/seo.test.ts -t "base SEO meta"`

Expected: 3 failed.

- [ ] **Step 3: Insert the three tags in `site/index.html`**

Immediately after the existing `<title>` line (currently `site/index.html:6`), insert:

```html
<meta name="description" content="TypeScript library, REST API, and MCP server for Malaysia's KTMB rail data — stations, schedules, fares, Komuter, and live GTFS-Realtime vehicles." />
<meta name="robots" content="index,follow,max-image-preview:large" />
<link rel="canonical" href="https://ktmb-demo.zhunhao.deno.net/" />
```

After the insertion, the `<head>` order is: `<meta charset>`, `<meta viewport>`, `<title>`, `<meta description>`, `<meta robots>`, `<link canonical>`, `<link rel="icon">` (from Task 4), Leaflet stylesheets.

- [ ] **Step 4: Run, expect PASS**

Run: `pnpm test tests/unit/site/seo.test.ts -t "base SEO meta"`

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add site/index.html tests/unit/site/seo.test.ts
git commit -m "feat(site): add description, robots, and canonical meta tags"
```

---

## Task 6: Open Graph + Twitter Card

**Files:**
- Modify: `site/index.html` (add nine meta tags in `<head>`)
- Test: `tests/unit/site/seo.test.ts` (append a `describe`)

- [ ] **Step 1: Append the failing tests**

```ts
describe("index.html — Open Graph + Twitter", () => {
  it("declares the website Open Graph type", async () => {
    const html = await readSiteFile("index.html");
    expect(html).toMatch(/<meta\s+property="og:type"\s+content="website"\s*\/?>/);
  });

  it("declares og:site_name, og:locale, og:url", async () => {
    const html = await readSiteFile("index.html");
    expect(html).toMatch(/<meta\s+property="og:site_name"\s+content="ktmb"\s*\/?>/);
    expect(html).toMatch(/<meta\s+property="og:locale"\s+content="en_US"\s*\/?>/);
    expect(html).toMatch(
      /<meta\s+property="og:url"\s+content="https:\/\/ktmb-demo\.zhunhao\.deno\.net\/"\s*\/?>/,
    );
  });

  it("og:title and og:description match the spec strings", async () => {
    const html = await readSiteFile("index.html");
    expect(html).toMatch(
      /<meta\s+property="og:title"\s+content="ktmb — the rail data library for Malaysia"\s*\/?>/,
    );
    expect(html).toContain(
      'content="TypeScript library, REST API, and MCP server for Malaysia\'s KTMB rail data — stations, schedules, fares, Komuter, and live GTFS-Realtime vehicles."',
    );
  });

  it("declares twitter:card=summary (text-only, no image)", async () => {
    const html = await readSiteFile("index.html");
    expect(html).toMatch(/<meta\s+name="twitter:card"\s+content="summary"\s*\/?>/);
    expect(html).not.toMatch(/twitter:card"\s+content="summary_large_image"/);
  });

  it("declares twitter:title and twitter:description", async () => {
    const html = await readSiteFile("index.html");
    expect(html).toMatch(
      /<meta\s+name="twitter:title"\s+content="ktmb — the rail data library for Malaysia"\s*\/?>/,
    );
    expect(html).toMatch(
      /<meta\s+name="twitter:description"\s+content="TypeScript library, REST API, and MCP server for Malaysia's KTMB rail data\."\s*\/?>/,
    );
  });

  it("does NOT declare any og:image (intentional)", async () => {
    const html = await readSiteFile("index.html");
    expect(html).not.toMatch(/property="og:image"/);
    expect(html).not.toMatch(/name="twitter:image"/);
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `pnpm test tests/unit/site/seo.test.ts -t "Open Graph"`

Expected: 5 failed (the "no og:image" test should pass already).

- [ ] **Step 3: Insert the nine tags in `site/index.html`**

Immediately after the canonical `<link>` from Task 5, insert:

```html

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

- [ ] **Step 4: Run, expect PASS**

Run: `pnpm test tests/unit/site/seo.test.ts -t "Open Graph"`

Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add site/index.html tests/unit/site/seo.test.ts
git commit -m "feat(site): add Open Graph + Twitter Card meta (text-only)"
```

---

## Task 7: JSON-LD structured data

**Files:**
- Modify: `site/index.html` (add a single `<script type="application/ld+json">` block)
- Test: `tests/unit/site/seo.test.ts` (append a `describe`)

- [ ] **Step 1: Append the failing tests**

```ts
describe("index.html — JSON-LD structured data", () => {
  const extract = (html: string): unknown => {
    const m = html.match(
      /<script type="application\/ld\+json">([\s\S]*?)<\/script>/,
    );
    if (!m) throw new Error("no JSON-LD <script> block");
    return JSON.parse(m[1] as string);
  };

  it("contains exactly one JSON-LD block that parses cleanly", async () => {
    const html = await readSiteFile("index.html");
    const matches = html.match(/<script type="application\/ld\+json">/g) ?? [];
    expect(matches.length).toBe(1);
    expect(() => extract(html)).not.toThrow();
  });

  it("uses schema.org @context and a @graph of three entities", async () => {
    const html = await readSiteFile("index.html");
    const data = extract(html) as { "@context": string; "@graph": Array<{ "@type": string }> };
    expect(data["@context"]).toBe("https://schema.org");
    expect(Array.isArray(data["@graph"])).toBe(true);
    expect(data["@graph"]).toHaveLength(3);
    const types = data["@graph"].map((e) => e["@type"]).sort();
    expect(types).toEqual(["SoftwareApplication", "SoftwareSourceCode", "WebSite"]);
  });

  it("WebSite entity points at the canonical URL with publisher reference", async () => {
    const html = await readSiteFile("index.html");
    const data = extract(html) as { "@graph": Array<Record<string, unknown>> };
    const website = data["@graph"].find((e) => e["@type"] === "WebSite") as
      | Record<string, unknown>
      | undefined;
    expect(website?.url).toBe("https://ktmb-demo.zhunhao.deno.net/");
    expect(website?.inLanguage).toBe("en");
    expect((website?.publisher as { "@id": string } | undefined)?.["@id"]).toBe(
      "https://ktmb-demo.zhunhao.deno.net/#software",
    );
  });

  it("SoftwareSourceCode entity declares license, repo, and target products", async () => {
    const html = await readSiteFile("index.html");
    const data = extract(html) as { "@graph": Array<Record<string, unknown>> };
    const code = data["@graph"].find((e) => e["@type"] === "SoftwareSourceCode") as
      | Record<string, unknown>
      | undefined;
    expect(code?.codeRepository).toBe("https://github.com/ZhunHao/ktmb");
    expect(code?.license).toBe("https://opensource.org/licenses/MIT");
    expect(code?.programmingLanguage).toBe("TypeScript");
    expect(code?.runtimePlatform).toEqual(["Node.js", "Deno"]);
    expect(code?.targetProduct).toEqual(["@zhun_hao/ktmb (npm)", "ktmb-api", "ktmb-mcp"]);
  });

  it("SoftwareApplication entity is a free DeveloperApplication", async () => {
    const html = await readSiteFile("index.html");
    const data = extract(html) as { "@graph": Array<Record<string, unknown>> };
    const app = data["@graph"].find((e) => e["@type"] === "SoftwareApplication") as
      | Record<string, unknown>
      | undefined;
    expect(app?.applicationCategory).toBe("DeveloperApplication");
    expect(app?.operatingSystem).toBe("Cross-platform");
    expect(app?.url).toBe("https://ktmb-demo.zhunhao.deno.net/");
    const offer = app?.offers as { "@type": string; price: string; priceCurrency: string };
    expect(offer.price).toBe("0");
    expect(offer.priceCurrency).toBe("USD");
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `pnpm test tests/unit/site/seo.test.ts -t "JSON-LD"`

Expected: 5 failed.

- [ ] **Step 3: Insert the JSON-LD block in `site/index.html`**

Immediately after the last Twitter `<meta>` from Task 6 (and before the favicon `<link>` from Task 4), insert:

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": "https://ktmb-demo.zhunhao.deno.net/#website",
      "url": "https://ktmb-demo.zhunhao.deno.net/",
      "name": "ktmb",
      "description": "TypeScript library, REST API, and MCP server for Malaysia's KTMB rail data — stations, schedules, fares, Komuter, and live GTFS-Realtime vehicles.",
      "inLanguage": "en",
      "publisher": { "@id": "https://ktmb-demo.zhunhao.deno.net/#software" }
    },
    {
      "@type": "SoftwareSourceCode",
      "@id": "https://ktmb-demo.zhunhao.deno.net/#software",
      "name": "ktmb",
      "description": "TypeScript library, REST API, and MCP server for Malaysia's KTMB rail data — stations, schedules, fares, Komuter, and live GTFS-Realtime vehicles.",
      "programmingLanguage": "TypeScript",
      "codeRepository": "https://github.com/ZhunHao/ktmb",
      "license": "https://opensource.org/licenses/MIT",
      "runtimePlatform": ["Node.js", "Deno"],
      "targetProduct": ["@zhun_hao/ktmb (npm)", "ktmb-api", "ktmb-mcp"]
    },
    {
      "@type": "SoftwareApplication",
      "@id": "https://ktmb-demo.zhunhao.deno.net/#application",
      "name": "ktmb",
      "description": "TypeScript library, REST API, and MCP server for Malaysia's KTMB rail data.",
      "applicationCategory": "DeveloperApplication",
      "operatingSystem": "Cross-platform",
      "url": "https://ktmb-demo.zhunhao.deno.net/",
      "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD" }
    }
  ]
}
</script>
```

- [ ] **Step 4: Run, expect PASS**

Run: `pnpm test tests/unit/site/seo.test.ts -t "JSON-LD"`

Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add site/index.html tests/unit/site/seo.test.ts
git commit -m "feat(site): add JSON-LD (WebSite + SoftwareSourceCode + SoftwareApplication)"
```

---

## Task 8: preconnect and dns-prefetch hints

**Files:**
- Modify: `site/index.html` (add two `<link>` tags before the Leaflet stylesheet)
- Test: `tests/unit/site/seo.test.ts` (append a `describe`)

- [ ] **Step 1: Append the failing tests**

```ts
describe("index.html — connection hints", () => {
  it("declares preconnect to unpkg.com with crossorigin", async () => {
    const html = await readSiteFile("index.html");
    expect(html).toMatch(
      /<link\s+rel="preconnect"\s+href="https:\/\/unpkg\.com"\s+crossorigin\s*\/?>/,
    );
  });

  it("declares dns-prefetch to api.data.gov.my", async () => {
    const html = await readSiteFile("index.html");
    expect(html).toMatch(
      /<link\s+rel="dns-prefetch"\s+href="https:\/\/api\.data\.gov\.my"\s*\/?>/,
    );
  });

  it("preconnect is declared before the Leaflet stylesheet so it can warm the connection", async () => {
    const html = await readSiteFile("index.html");
    const preconnectIdx = html.search(/<link\s+rel="preconnect"\s+href="https:\/\/unpkg\.com"/);
    const leafletIdx = html.search(/<link\s+rel="stylesheet"\s+href="https:\/\/unpkg\.com\/leaflet@/);
    expect(preconnectIdx).toBeGreaterThan(-1);
    expect(leafletIdx).toBeGreaterThan(-1);
    expect(preconnectIdx).toBeLessThan(leafletIdx);
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `pnpm test tests/unit/site/seo.test.ts -t "connection hints"`

Expected: 3 failed.

- [ ] **Step 3: Insert the two link hints in `site/index.html`**

Between the favicon `<link rel="icon">` from Task 4 and the existing `<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4...` line, insert:

```html
<link rel="preconnect" href="https://unpkg.com" crossorigin />
<link rel="dns-prefetch" href="https://api.data.gov.my" />
```

- [ ] **Step 4: Run, expect PASS**

Run: `pnpm test tests/unit/site/seo.test.ts -t "connection hints"`

Expected: 3 passed.

- [ ] **Step 5: Run the entire SEO suite to verify no regressions**

Run: `pnpm test tests/unit/site/seo.test.ts`

Expected: all SEO tests pass (the running total: 1 + 3 + 4 + 3 + 3 + 6 + 5 + 3 = 28 passed). Run the full suite once: `pnpm test` — expected: no new failures relative to baseline (`main` before this branch).

- [ ] **Step 6: Commit**

```bash
git add site/index.html tests/unit/site/seo.test.ts
git commit -m "feat(site): add preconnect to unpkg + dns-prefetch to data.gov.my"
```

---

## Task 9: alt / aria audit + final spec coverage check (no code)

**Files:** none

This task is the spec's Section G — confirming existing markup is correct and recording the audit in the test suite as a regression guard.

- [ ] **Step 1: Append the audit tests**

```ts
describe("index.html — accessibility regression guards (no code change)", () => {
  it("hero SVG keeps its aria-label", async () => {
    const html = await readSiteFile("index.html");
    expect(html).toContain('aria-label="KTMB network — Peninsular Malaysia"');
  });

  it("station search input keeps its combobox semantics", async () => {
    const html = await readSiteFile("index.html");
    expect(html).toMatch(/role="combobox"/);
    expect(html).toMatch(/aria-controls="station-autocomplete"/);
  });

  it("leaflet map keeps its aria-label", async () => {
    const html = await readSiteFile("index.html");
    expect(html).toContain('aria-label="Live vehicle map of Peninsular Malaysia"');
  });

  it("map refresh button keeps its aria-label", async () => {
    const html = await readSiteFile("index.html");
    expect(html).toContain('aria-label="Refresh live vehicles"');
  });

  it("html element keeps lang=\"en\"", async () => {
    const html = await readSiteFile("index.html");
    expect(html).toMatch(/<html\s+lang="en">/);
  });
});
```

- [ ] **Step 2: Run, expect PASS immediately (no code change required)**

Run: `pnpm test tests/unit/site/seo.test.ts -t "accessibility regression"`

Expected: 5 passed. If any fail, the audit assumption was wrong — stop and reconcile with the spec before continuing.

- [ ] **Step 3: Run the entire suite to confirm green**

Run: `pnpm test`

Expected: no failures, no new flakes.

- [ ] **Step 4: Commit**

```bash
git add tests/unit/site/seo.test.ts
git commit -m "test(site): lock in a11y attributes that SEO depends on"
```

---

## Task 10: post-deploy validation (manual, no code)

After the branch merges and Deno Deploy publishes the new build, run the validation table from the spec. None of these are code changes; they are recorded here so the engineer doesn't forget them.

- [ ] **Step 1: View source and confirm meta tags landed**

```bash
curl -s https://ktmb-demo.zhunhao.deno.net/ | grep -E "(description|canonical|og:|twitter:)"
```

Expected: see all 12 SEO meta/link lines from Tasks 4–6.

- [ ] **Step 2: Confirm robots.txt and sitemap.xml serve**

```bash
curl -sI https://ktmb-demo.zhunhao.deno.net/robots.txt
curl -sI https://ktmb-demo.zhunhao.deno.net/sitemap.xml
curl -sI https://ktmb-demo.zhunhao.deno.net/favicon.svg
```

Expected: each returns `HTTP/2 200` and the right `content-type` (`text/plain`, `application/xml`, `image/svg+xml`).

- [ ] **Step 3: Validate JSON-LD**

Paste the live URL into:
- `https://search.google.com/test/rich-results`
- `https://validator.schema.org/`

Expected: zero errors, zero warnings on both. `WebSite`, `SoftwareSourceCode`, and `SoftwareApplication` all detected.

- [ ] **Step 4: Validate Open Graph**

Paste the live URL into `https://www.opengraph.xyz/` (or post in a private Slack channel and inspect the unfurl).

Expected: title and description render; image area is empty (intentional).

- [ ] **Step 5: Run Lighthouse**

Open the live URL in Chrome, DevTools → Lighthouse → "SEO" + "Accessibility" categories, mobile preset.

Expected: SEO ≥ 95; Accessibility unchanged from the pre-deploy baseline.

Sitemap submission is its own task — see Task 11 below.

---

## Task 11: Submit sitemap to Google Search Console (manual)

**Files:** none

This task runs **after** the SEO plan is merged and Deno Deploy has shipped
the build that includes `/sitemap.xml` (Task 3) and the canonical / JSON-LD
meta (Tasks 5–7). Property verification is already done out-of-band via
the `google-site-verification` meta tag in `site/index.html` (commit
`b9138ee` on `main`); this task only handles the sitemap submission and
post-submission checks.

- [ ] **Step 1: Confirm verification is still active**

Open `https://search.google.com/search-console` → property
`https://ktmb-demo.zhunhao.deno.net/`. The "Verified" badge should be
present. If it isn't, the verification meta tag in `site/index.html` is
the source of truth — re-verify rather than removing the tag.

- [ ] **Step 2: Confirm `/sitemap.xml` is publicly reachable**

```bash
curl -sI https://ktmb-demo.zhunhao.deno.net/sitemap.xml | head -3
curl -s  https://ktmb-demo.zhunhao.deno.net/sitemap.xml | grep -c '<loc>'
```

Expected: `HTTP/2 200`, `content-type: application/xml`, and `2` for the
loc count. If any of these fail, **stop**: Task 3 either didn't ship or
the deploy is in a bad state. Don't submit a sitemap that 404s — Google
remembers the failure.

- [ ] **Step 3: Submit the sitemap**

In Search Console: left nav → **Sitemaps** → "Add a new sitemap" → enter
`sitemap.xml` (just the path; the form prefixes the property origin) →
**Submit**.

Expected within 1–2 minutes: status "Success", 2 discovered URLs, 0
couldn't fetch.

- [ ] **Step 4: Inspect the canonical URL**

In Search Console: top search bar → paste
`https://ktmb-demo.zhunhao.deno.net/` → **URL Inspection** → "Test live URL".

Expected: "User-declared canonical" and "Google-selected canonical" both
equal `https://ktmb-demo.zhunhao.deno.net/`. If they diverge, the
canonical from Task 5 isn't being honoured — usually a stylesheet or HTTP
redirect issue; investigate before relying on the rest of the SEO work.

- [ ] **Step 5 (optional): Mirror in Bing Webmaster Tools**

Visit `https://www.bing.com/webmasters` → **Add property** → choose
"Import from Google Search Console" (smoothest path; reuses the GSC
verification automatically). Under the imported property →
**Sitemaps** → submit
`https://ktmb-demo.zhunhao.deno.net/sitemap.xml`.

Expected: 2 URLs discovered. Bing also feeds DuckDuckGo and ChatGPT's
`bing` tool — useful even though Bing's organic share is small.

- [ ] **Step 6: Schedule a 7-day check-in**

No code, no commit. Set a reminder to re-open Search Console in 7 days
and check **Pages → Indexed**. Initial index events for a freshly
verified property typically land within 3–10 days; 30+ days with zero
indexed pages indicates a real problem (most often a robots/canonical
mistake or a thin-content flag).

This task ends without a commit — verification + sitemap submission are
purely Search Console state, not code. The verification meta tag and the
sitemap file are the only persistent artefacts and they were committed
in `b9138ee` and Task 3 respectively.

---

## Out-of-scope follow-ups (do not address in this plan)

- og:image (hand-crafted or edge-rendered)
- Copy / heading rewrites for keyword targeting
- Async Leaflet CSS, deferred script loading, inlined critical CSS
- HN Show post, dev.to write-up, awesome-mcp / awesome-malaysia submissions
- `llms-full.txt`, FAQ-formatted snippets, schema.org `featureList` enrichment
- Bing Webmaster Tools property verification beyond the GSC import path (Task 11 step 5 is the cheapest mirror; deeper Bing-specific configuration is deferred)
