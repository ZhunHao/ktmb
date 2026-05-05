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
