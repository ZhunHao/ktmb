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
    expect(html).toMatch(
      /<meta\s+property="og:description"\s+content="TypeScript library, REST API, and MCP server for Malaysia's KTMB rail data — stations, schedules, fares, Komuter, and live GTFS-Realtime vehicles\."\s*\/?>/,
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

  it("SoftwareSourceCode entity declares license, repo, and runtime", async () => {
    const html = await readSiteFile("index.html");
    const data = extract(html) as { "@graph": Array<Record<string, unknown>> };
    const code = data["@graph"].find((e) => e["@type"] === "SoftwareSourceCode") as
      | Record<string, unknown>
      | undefined;
    expect(code?.codeRepository).toBe("https://github.com/ZhunHao/ktmb");
    expect(code?.license).toBe("https://opensource.org/licenses/MIT");
    expect(code?.programmingLanguage).toBe("TypeScript");
    expect(code?.runtimePlatform).toEqual(["Node.js", "Deno"]);
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

describe("index.html — connection hints", () => {
  it("declares preconnect to unpkg.com with crossorigin", async () => {
    const html = await readSiteFile("index.html");
    expect(html).toMatch(
      /<link\s+rel="preconnect"\s+href="https:\/\/unpkg\.com"\s+crossorigin\s*\/?>/,
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
