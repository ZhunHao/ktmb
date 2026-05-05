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
