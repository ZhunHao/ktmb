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
