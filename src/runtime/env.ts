/**
 * Cross-runtime environment access. Reads `process.env` on Node and
 * `Deno.env.get` on Deno without `typeof`-gating spread across the codebase.
 * Returns `undefined` for missing or empty values so callers can use `??`.
 */

type ProcessEnvLike = { env: Record<string, string | undefined> };
type DenoEnvLike = { env: { get: (key: string) => string | undefined } };

const proc: ProcessEnvLike | undefined =
  typeof process !== "undefined" ? (process as unknown as ProcessEnvLike) : undefined;

const deno: DenoEnvLike | undefined =
  (globalThis as { Deno?: DenoEnvLike }).Deno;

export const getEnv = (key: string): string | undefined => {
  const raw = proc?.env[key] ?? deno?.env.get(key);
  return raw && raw.length > 0 ? raw : undefined;
};

export const getEnvNumber = (key: string): number | undefined => {
  const raw = getEnv(key);
  if (raw === undefined) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
};

export const getEnvFlag = (key: string): boolean => getEnv(key) === "1";
