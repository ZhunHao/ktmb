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
