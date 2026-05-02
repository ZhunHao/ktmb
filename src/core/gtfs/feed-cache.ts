import { createHash } from "node:crypto";
import { readFile, stat, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

export type LoadInput = { dir: string; url: string; maxAgeMs: number };
export type SaveInput = { dir: string; url: string; bytes: Uint8Array };
export type LoadOutput = { bytes: Uint8Array; ageMs: number };

const fileNameForUrl = (url: string): string => {
  const h = createHash("sha256").update(url).digest("hex").slice(0, 16);
  return `gtfs-${h}.zip`;
};

export const loadCachedFeed = async (
  input: LoadInput,
): Promise<LoadOutput | null> => {
  const path = join(input.dir, fileNameForUrl(input.url));
  let stats;
  try {
    stats = await stat(path);
  } catch {
    return null;
  }
  const ageMs = Date.now() - stats.mtimeMs;
  if (ageMs > input.maxAgeMs) return null;
  const buf = await readFile(path);
  return { bytes: new Uint8Array(buf), ageMs };
};

export const saveCachedFeed = async (input: SaveInput): Promise<void> => {
  await mkdir(input.dir, { recursive: true });
  const path = join(input.dir, fileNameForUrl(input.url));
  await writeFile(path, input.bytes);
};
