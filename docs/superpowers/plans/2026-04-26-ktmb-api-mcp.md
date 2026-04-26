# KTMB API + MCP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a single npm package `ktmb` that exposes GTFS-backed schedules and KTMB-backed fares/availability through both a REST API (Hono) and an MCP server (stdio).

**Architecture:** Hybrid data sources — `data.gov.my` GTFS Static + Realtime for schedules, station catalog, and live vehicle positions; `online.ktmb.com.my` for fares + seat availability. Two adapter slices (`core/gtfs/`, `core/ktmb/`) feed a service layer that both surfaces (`api/`, `mcp/`) call directly in-process.

**Tech Stack:** Node 20 LTS, TypeScript, `tsgo` (typecheck), `tsup` (bundle), `tsc` (`.d.ts`), Hono 4.x, MCP SDK 1.29.x (stdio), undici 8.x, Zod 4.x, Fuse.js 7.x, chrono-node 2.x, p-queue 9.x, lru-cache 11.x, fflate 0.8.x, csv-parse 5.x, gtfs-realtime-bindings 1.x, vitest 4.x, msw 2.x.

**Spec:** [docs/superpowers/specs/2026-04-26-ktmb-api-mcp-design.md](../specs/2026-04-26-ktmb-api-mcp-design.md)

---

## Conventions used in every task

- Test framework: vitest. Test files live in `tests/unit/`, `tests/integration/`, `tests/smoke/` and end in `.test.ts`.
- Run a single test: `pnpm vitest run <path>`. Run the suite: `pnpm test`.
- Commit messages follow conventional commits (`feat:`, `fix:`, `test:`, `chore:`, `docs:`, `refactor:`).
- Each task ends with a single `git commit`. Never push.
- All public function signatures use the typed `Result<T>` discriminated union from Task 2 — never throw across module boundaries.
- All public response shapes are validated by Zod schemas from Task 3 on the way **in** (KTMB/GTFS payloads) and on the way **out** (REST/MCP responses).
- Times in `Asia/Kuala_Lumpur` (`+08:00`) only. No naive strings cross module boundaries.
- After each task's tests pass, run `pnpm typecheck` (Task 1 wires this to `tsgo`). If it fails, fix before committing.

---

## Phase 0 — Foundation

### Task 1: Project scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsup.config.ts`
- Create: `vitest.config.ts`
- Create: `.gitignore`
- Create: `.npmrc`
- Create: `.editorconfig`
- Create: `README.md`
- Create: `LICENSE`
- Create: `src/index.ts`

- [ ] **Step 1: Initialize git and pnpm**

```bash
cd /Users/zhunhao/Documents/Projects/ktmb
git init -b main
pnpm init
```

- [ ] **Step 2: Write `package.json`**

Replace the generated `package.json` with:

```json
{
  "name": "ktmb",
  "version": "0.1.0",
  "description": "Read-only TypeScript library, REST API, and MCP server for KTMB rail data (GTFS + live booking site)",
  "license": "MIT",
  "type": "module",
  "engines": { "node": ">=20" },
  "main": "dist/index.cjs",
  "module": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "require": "./dist/index.cjs"
    }
  },
  "bin": {
    "ktmb-mcp": "./dist/bin/ktmb-mcp.js",
    "ktmb-api": "./dist/bin/ktmb-api.js"
  },
  "files": ["dist", "README.md", "LICENSE"],
  "scripts": {
    "typecheck": "tsgo --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "build": "tsup && tsc --emitDeclarationOnly --declaration --outDir dist",
    "lint": "tsgo --noEmit",
    "inspect:gtfs": "tsx scripts/inspect-gtfs.ts"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.29.0",
    "chrono-node": "^2.9.0",
    "csv-parse": "^5.5.6",
    "fflate": "^0.8.2",
    "fuse.js": "^7.3.0",
    "gtfs-realtime-bindings": "^1.1.1",
    "hono": "^4.12.15",
    "lru-cache": "^11.0.2",
    "p-queue": "^9.1.2",
    "undici": "^8.1.0",
    "zod": "^4.3.6"
  },
  "devDependencies": {
    "@hono/node-server": "^1.13.7",
    "@types/node": "^22.10.0",
    "@typescript/native-preview": "latest",
    "msw": "^2.13.6",
    "tsup": "^8.5.1",
    "tsx": "^4.19.2",
    "typescript": "^5.7.2",
    "vitest": "^4.1.5"
  }
}
```

- [ ] **Step 3: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "es2022",
    "lib": ["es2022"],
    "module": "esnext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "exactOptionalPropertyTypes": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "dist",
    "rootDir": "."
  },
  "include": ["src", "bin", "scripts", "tests"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 4: Write `tsup.config.ts`**

```ts
import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "bin/ktmb-mcp": "bin/ktmb-mcp.ts",
    "bin/ktmb-api": "bin/ktmb-api.ts",
  },
  format: ["esm", "cjs"],
  target: "node20",
  splitting: false,
  sourcemap: true,
  clean: true,
  dts: false,
  banner: { js: "#!/usr/bin/env node" },
});
```

- [ ] **Step 5: Write `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/types.ts", "src/**/index.ts"],
      thresholds: { lines: 80, statements: 80, functions: 80, branches: 75 },
    },
  },
});
```

- [ ] **Step 6: Write supporting files**

`.gitignore`:
```
node_modules
dist
coverage
.DS_Store
*.log
.env
.env.local
tests/fixtures/captured
```

`.npmrc`:
```
engine-strict=true
```

`.editorconfig`:
```
root = true

[*]
indent_style = space
indent_size = 2
end_of_line = lf
charset = utf-8
trim_trailing_whitespace = true
insert_final_newline = true
```

`LICENSE`: standard MIT, copyright "2026 zhunhao".

`README.md`:
```markdown
# ktmb

Read-only TypeScript library + REST API + MCP server for KTMB rail data.

> **Unofficial.** Not affiliated with Keretapi Tanah Melayu Berhad.
> Built on Malaysia's Open Data Portal (`data.gov.my`) GTFS feeds and the
> public KTMB booking site for fares and availability only.

See [docs/superpowers/specs](docs/superpowers/specs) for design details.
```

`src/index.ts`:
```ts
export {};
```

- [ ] **Step 7: Install dependencies**

Run: `pnpm install`
Expected: lockfile written, no errors.

- [ ] **Step 8: Verify typecheck and test runner work**

Run: `pnpm typecheck`
Expected: passes (no source files yet).

Run: `pnpm test`
Expected: "no test files found" — exits 0 with that message.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "chore: scaffold project (TypeScript, tsgo, tsup, vitest)"
```

---

### Task 2: Result type and ErrorCode

**Files:**
- Create: `src/core/result.ts`
- Test: `tests/unit/core/result.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/unit/core/result.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ok, err, isOk, isErr, type Result } from "../../../src/core/result.js";

describe("Result helpers", () => {
  it("ok wraps data with discriminator", () => {
    const r: Result<number> = ok(42);
    expect(r).toEqual({ ok: true, data: 42 });
    expect(isOk(r)).toBe(true);
    expect(isErr(r)).toBe(false);
  });

  it("err wraps error with discriminator", () => {
    const r = err("invalid_input", "missing 'from'");
    expect(r).toEqual({ ok: false, error: { code: "invalid_input", message: "missing 'from'" } });
    expect(isErr(r)).toBe(true);
    expect(isOk(r)).toBe(false);
  });

  it("err preserves cause", () => {
    const cause = { raw: "..." };
    const r = err("parse_error", "schema mismatch", cause);
    if (r.ok) throw new Error("expected err");
    expect(r.error.cause).toBe(cause);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/core/result.test.ts`
Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Write the implementation**

`src/core/result.ts`:

```ts
export type ErrorCode =
  | "invalid_input"
  | "not_found"
  | "rate_limited"
  | "upstream_error"
  | "parse_error";

export type ResultError = {
  code: ErrorCode;
  message: string;
  cause?: unknown;
};

export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: ResultError };

export const ok = <T>(data: T): Result<T> => ({ ok: true, data });

export const err = <T = never>(
  code: ErrorCode,
  message: string,
  cause?: unknown,
): Result<T> => ({
  ok: false,
  error: cause === undefined ? { code, message } : { code, message, cause },
});

export const isOk = <T>(r: Result<T>): r is { ok: true; data: T } => r.ok;
export const isErr = <T>(r: Result<T>): r is { ok: false; error: ResultError } => !r.ok;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/unit/core/result.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/core/result.ts tests/unit/core/result.test.ts
git commit -m "feat(core): add Result discriminated union with ok/err/isOk/isErr"
```

---

### Task 3: Public Zod schemas

**Files:**
- Create: `src/core/types.ts`
- Test: `tests/unit/core/types.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/unit/core/types.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  StationSchema,
  StopSchema,
  FareSchema,
  TrainScheduleSchema,
  KomuterDepartureSchema,
  VehiclePositionSchema,
} from "../../../src/core/types.js";

describe("public schemas", () => {
  it("Station validates a minimal record", () => {
    const s = StationSchema.parse({
      code: "KUL",
      nameEn: "KL Sentral",
      nameMs: "KL Sentral",
      country: "MY",
    });
    expect(s.code).toBe("KUL");
  });

  it("Station rejects unknown country", () => {
    const r = StationSchema.safeParse({
      code: "KUL",
      nameEn: "x",
      nameMs: "x",
      country: "ID",
    });
    expect(r.success).toBe(false);
  });

  it("Stop allows null arrival at origin", () => {
    const s = StopSchema.parse({
      stationCode: "KUL",
      arrival: null,
      departure: "2026-05-01T08:00:00+08:00",
    });
    expect(s.arrival).toBeNull();
  });

  it("Fare requires non-negative integer minor units", () => {
    expect(() =>
      FareSchema.parse({ className: "Premier", priceMinor: 5500, currency: "MYR", seatsLeft: 12 }),
    ).not.toThrow();
    expect(
      FareSchema.safeParse({ className: "x", priceMinor: -1, currency: "MYR", seatsLeft: null })
        .success,
    ).toBe(false);
    expect(
      FareSchema.safeParse({ className: "x", priceMinor: 1.5, currency: "MYR", seatsLeft: null })
        .success,
    ).toBe(false);
  });

  it("TrainSchedule requires journeyDurationMinutes", () => {
    const ts = TrainScheduleSchema.parse({
      trainNo: "EG9322",
      service: "ETS",
      bookingProvider: "KTMB",
      from: { stationCode: "KUL", arrival: null, departure: "2026-05-01T08:00:00+08:00" },
      to: { stationCode: "BTW", arrival: "2026-05-01T13:00:00+08:00", departure: null },
      classes: [{ className: "Premier", fare: { className: "Premier", priceMinor: 5500, currency: "MYR", seatsLeft: 12 } }],
      journeyDurationMinutes: 300,
    });
    expect(ts.journeyDurationMinutes).toBe(300);
  });

  it("KomuterDeparture parses minimal fields", () => {
    const k = KomuterDepartureSchema.parse({
      trainNo: "K2412",
      line: "Port Klang",
      departure: "2026-05-01T08:30:00+08:00",
    });
    expect(k.platform).toBeUndefined();
  });

  it("VehiclePosition parses lat/lon", () => {
    const v = VehiclePositionSchema.parse({
      vehicleId: "V123",
      lat: 3.1390,
      lon: 101.6869,
      timestamp: "2026-05-01T08:00:00+08:00",
    });
    expect(v.lat).toBeCloseTo(3.139);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/core/types.test.ts`
Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Write the implementation**

`src/core/types.ts`:

```ts
import { z } from "zod";

const Iso8601MyT = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+08:00$/, "must be ISO 8601 with +08:00 offset");

export const StationSchema = z.object({
  code: z.string().min(1),
  nameEn: z.string().min(1),
  nameMs: z.string().min(1),
  country: z.enum(["MY", "SG", "TH"]),
  lines: z.array(z.enum(["ETS", "Intercity", "Komuter", "ShuttleTebrau"])).optional(),
});
export type Station = z.infer<typeof StationSchema>;

export const StopSchema = z.object({
  stationCode: z.string().min(1),
  arrival: Iso8601MyT.nullable(),
  departure: Iso8601MyT.nullable(),
});
export type Stop = z.infer<typeof StopSchema>;

export const FareSchema = z.object({
  className: z.string().min(1),
  priceMinor: z.number().int().nonnegative(),
  currency: z.enum(["MYR", "SGD"]),
  seatsLeft: z.number().int().nonnegative().nullable(),
});
export type Fare = z.infer<typeof FareSchema>;

export const TrainClassSchema = z.object({
  className: z.string().min(1),
  fare: FareSchema,
});
export type TrainClass = z.infer<typeof TrainClassSchema>;

export const TrainScheduleSchema = z.object({
  trainNo: z.string().min(1),
  service: z.enum(["ETS", "Intercity", "ShuttleTebrau"]),
  bookingProvider: z.string().min(1),
  from: StopSchema,
  to: StopSchema,
  intermediate: z.array(StopSchema).optional(),
  classes: z.array(TrainClassSchema),
  journeyDurationMinutes: z.number().int().nonnegative(),
});
export type TrainSchedule = z.infer<typeof TrainScheduleSchema>;

export const KomuterDepartureSchema = z.object({
  trainNo: z.string().min(1),
  line: z.string().min(1),
  departure: Iso8601MyT,
  platform: z.string().optional(),
});
export type KomuterDeparture = z.infer<typeof KomuterDepartureSchema>;

export const VehiclePositionSchema = z.object({
  vehicleId: z.string().min(1),
  tripId: z.string().optional(),
  routeId: z.string().optional(),
  lat: z.number().finite(),
  lon: z.number().finite(),
  bearing: z.number().finite().optional(),
  speedKmh: z.number().finite().nonnegative().optional(),
  timestamp: Iso8601MyT,
});
export type VehiclePosition = z.infer<typeof VehiclePositionSchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/unit/core/types.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/core/types.ts tests/unit/core/types.test.ts
git commit -m "feat(core): add public Zod schemas (Station, Stop, Fare, TrainSchedule, KomuterDeparture, VehiclePosition)"
```

---

## Phase 1 — Shared infra

### Task 4: Time helpers

**Files:**
- Create: `src/core/time/myt.ts`
- Create: `src/core/time/gtfs-rollover.ts`
- Create: `src/core/time/parse-date.ts`
- Test: `tests/unit/core/time/myt.test.ts`
- Test: `tests/unit/core/time/gtfs-rollover.test.ts`
- Test: `tests/unit/core/time/parse-date.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/unit/core/time/myt.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { mytDate, isoMyt, addDaysMyt } from "../../../../src/core/time/myt.js";

describe("MYT helpers", () => {
  it("mytDate builds a YYYY-MM-DD string in MYT", () => {
    expect(mytDate(2026, 5, 1)).toBe("2026-05-01");
  });

  it("isoMyt formats H/M/S into ISO with +08:00", () => {
    expect(isoMyt("2026-05-01", 8, 30, 0)).toBe("2026-05-01T08:30:00+08:00");
    expect(isoMyt("2026-05-01", 23, 5, 9)).toBe("2026-05-01T23:05:09+08:00");
  });

  it("addDaysMyt rolls forward across month boundary", () => {
    expect(addDaysMyt("2026-04-30", 1)).toBe("2026-05-01");
    expect(addDaysMyt("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysMyt("2026-05-01", 0)).toBe("2026-05-01");
  });
});
```

`tests/unit/core/time/gtfs-rollover.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { gtfsTimeToIso, ktmbTimeRollover } from "../../../../src/core/time/gtfs-rollover.js";

describe("GTFS HH:MM:SS rollover", () => {
  it("converts in-day HH:MM:SS", () => {
    expect(gtfsTimeToIso("2026-05-01", "08:30:00")).toBe("2026-05-01T08:30:00+08:00");
  });

  it("rolls 24:00:00 to next day 00:00:00", () => {
    expect(gtfsTimeToIso("2026-05-01", "24:00:00")).toBe("2026-05-02T00:00:00+08:00");
  });

  it("rolls 27:30:00 to next day 03:30:00", () => {
    expect(gtfsTimeToIso("2026-05-01", "27:30:00")).toBe("2026-05-02T03:30:00+08:00");
  });

  it("rolls 51:30:00 to two days later", () => {
    expect(gtfsTimeToIso("2026-05-01", "51:30:00")).toBe("2026-05-03T03:30:00+08:00");
  });

  it("rejects malformed input", () => {
    expect(() => gtfsTimeToIso("2026-05-01", "8:30")).toThrow();
    expect(() => gtfsTimeToIso("2026-05-01", "abc")).toThrow();
  });
});

describe("KTMB HH:MM rollover", () => {
  it("walks stops and rolls when time decreases", () => {
    const out = ktmbTimeRollover("2026-05-01", [
      { hhmm: "20:00" },
      { hhmm: "22:30" },
      { hhmm: "03:15" },
      { hhmm: "07:30" },
    ]);
    expect(out.map((x) => x.iso)).toEqual([
      "2026-05-01T20:00:00+08:00",
      "2026-05-01T22:30:00+08:00",
      "2026-05-02T03:15:00+08:00",
      "2026-05-02T07:30:00+08:00",
    ]);
  });

  it("handles same-day journeys without rolling", () => {
    const out = ktmbTimeRollover("2026-05-01", [
      { hhmm: "08:00" },
      { hhmm: "13:00" },
    ]);
    expect(out.map((x) => x.iso)).toEqual([
      "2026-05-01T08:00:00+08:00",
      "2026-05-01T13:00:00+08:00",
    ]);
  });
});
```

`tests/unit/core/time/parse-date.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseDateMyt } from "../../../../src/core/time/parse-date.js";

describe("parseDateMyt", () => {
  it("accepts ISO YYYY-MM-DD", () => {
    expect(parseDateMyt("2026-05-01", new Date("2026-04-26T00:00:00+08:00"))).toEqual({
      ok: true,
      data: "2026-05-01",
    });
  });

  it("rejects malformed ISO", () => {
    const r = parseDateMyt("2026-13-99", new Date("2026-04-26T00:00:00+08:00"));
    expect(r.ok).toBe(false);
  });

  it("resolves 'tomorrow' relative to MYT now", () => {
    expect(
      parseDateMyt("tomorrow", new Date("2026-04-26T00:00:00+08:00")),
    ).toEqual({ ok: true, data: "2026-04-27" });
  });

  it("resolves 'next Friday'", () => {
    expect(
      parseDateMyt("next Friday", new Date("2026-04-26T00:00:00+08:00")),
    ).toEqual({ ok: true, data: "2026-05-01" });
  });

  it("rejects unparseable text", () => {
    const r = parseDateMyt("blarg", new Date("2026-04-26T00:00:00+08:00"));
    expect(r.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run tests/unit/core/time`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write the implementations**

`src/core/time/myt.ts`:

```ts
const pad2 = (n: number) => String(n).padStart(2, "0");

export const mytDate = (y: number, m: number, d: number): string =>
  `${y}-${pad2(m)}-${pad2(d)}`;

export const isoMyt = (date: string, h: number, m: number, s: number): string =>
  `${date}T${pad2(h)}:${pad2(m)}:${pad2(s)}+08:00`;

export const addDaysMyt = (date: string, days: number): string => {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const utc = Date.UTC(y, m - 1, d) + days * 86_400_000;
  const dt = new Date(utc);
  return mytDate(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
};
```

`src/core/time/gtfs-rollover.ts`:

```ts
import { addDaysMyt, isoMyt } from "./myt.js";

const GTFS_TIME = /^(\d{2,3}):(\d{2}):(\d{2})$/;

export const gtfsTimeToIso = (serviceDate: string, hms: string): string => {
  const m = GTFS_TIME.exec(hms);
  if (!m) throw new Error(`invalid GTFS time: ${hms}`);
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  const ss = Number(m[3]);
  if (mm > 59 || ss > 59) throw new Error(`invalid GTFS time: ${hms}`);
  const dayOffset = Math.floor(hh / 24);
  const hour = hh % 24;
  const date = dayOffset === 0 ? serviceDate : addDaysMyt(serviceDate, dayOffset);
  return isoMyt(date, hour, mm, ss);
};

const HHMM = /^(\d{2}):(\d{2})$/;

export type KtmbStopInput = { hhmm: string };
export type KtmbStopOutput = { iso: string };

export const ktmbTimeRollover = (
  startDate: string,
  stops: readonly KtmbStopInput[],
): KtmbStopOutput[] => {
  let date = startDate;
  let prevMinutes = -1;
  const out: KtmbStopOutput[] = [];
  for (const s of stops) {
    const m = HHMM.exec(s.hhmm);
    if (!m) throw new Error(`invalid HH:MM: ${s.hhmm}`);
    const hh = Number(m[1]);
    const mm = Number(m[2]);
    const minutes = hh * 60 + mm;
    if (prevMinutes >= 0 && minutes < prevMinutes) {
      date = addDaysMyt(date, 1);
    }
    out.push({ iso: isoMyt(date, hh, mm, 0) });
    prevMinutes = minutes;
  }
  return out;
};
```

`src/core/time/parse-date.ts`:

```ts
import * as chrono from "chrono-node";
import type { Result } from "../result.js";
import { err, ok } from "../result.js";
import { mytDate } from "./myt.js";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const parseDateMyt = (input: string, now: Date): Result<string> => {
  const trimmed = input.trim();
  if (ISO_DATE.test(trimmed)) {
    const [y, m, d] = trimmed.split("-").map(Number) as [number, number, number];
    if (m < 1 || m > 12 || d < 1 || d > 31) {
      return err("invalid_input", `invalid date: ${trimmed}`);
    }
    const dt = new Date(Date.UTC(y, m - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
      return err("invalid_input", `invalid date: ${trimmed}`);
    }
    return ok(trimmed);
  }
  const result = chrono.parseDate(trimmed, now, { forwardDate: true });
  if (!result) return err("invalid_input", `could not parse date: ${input}`);
  const utcMillis = result.getTime();
  const mytMillis = utcMillis + 8 * 60 * 60 * 1000;
  const dt = new Date(mytMillis);
  return ok(mytDate(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()));
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run tests/unit/core/time`
Expected: PASS — all tests across three files.

- [ ] **Step 5: Commit**

```bash
git add src/core/time tests/unit/core/time
git commit -m "feat(core/time): add MYT date helpers, GTFS HH:MM:SS rollover, KTMB HH:MM rollover, chrono parser"
```

---

### Task 5: HTTP client wrapper

**Files:**
- Create: `src/core/client/http.ts`
- Create: `src/core/client/concurrency.ts`
- Test: `tests/unit/core/client/http.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/unit/core/client/http.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { fetchWithRetry } from "../../../../src/core/client/http.js";

const server = setupServer();
beforeEach(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterEach(() => server.close());

describe("fetchWithRetry", () => {
  it("returns ok JSON on 200", async () => {
    server.use(
      http.get("https://example.test/data", () => HttpResponse.json({ hello: "world" })),
    );
    const r = await fetchWithRetry("https://example.test/data");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(await r.data.json()).toEqual({ hello: "world" });
  });

  it("retries on 503 and succeeds on 3rd attempt", async () => {
    let calls = 0;
    server.use(
      http.get("https://example.test/data", () => {
        calls += 1;
        if (calls < 3) return new HttpResponse(null, { status: 503 });
        return HttpResponse.json({ ok: true });
      }),
    );
    const r = await fetchWithRetry("https://example.test/data", { retryDelaysMs: [1, 1, 1] });
    expect(calls).toBe(3);
    expect(r.ok).toBe(true);
  });

  it("does not retry on 4xx", async () => {
    let calls = 0;
    server.use(
      http.get("https://example.test/data", () => {
        calls += 1;
        return new HttpResponse(null, { status: 404 });
      }),
    );
    const r = await fetchWithRetry("https://example.test/data", { retryDelaysMs: [1, 1, 1] });
    expect(calls).toBe(1);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("not_found");
  });

  it("returns upstream_error after exhausting retries", async () => {
    server.use(http.get("https://example.test/data", () => new HttpResponse(null, { status: 502 })));
    const r = await fetchWithRetry("https://example.test/data", { retryDelaysMs: [1, 1, 1] });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("upstream_error");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/core/client/http.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write the implementations**

`src/core/client/concurrency.ts`:

```ts
import PQueue from "p-queue";

const queues = new Map<string, PQueue>();

export const queueFor = (origin: string, concurrency = 4): PQueue => {
  let q = queues.get(origin);
  if (!q) {
    q = new PQueue({ concurrency });
    queues.set(origin, q);
  }
  return q;
};

export const __resetQueues = (): void => {
  queues.clear();
};
```

`src/core/client/http.ts`:

```ts
import { fetch as undiciFetch, Headers } from "undici";
import type { Result } from "../result.js";
import { err, ok } from "../result.js";
import { queueFor } from "./concurrency.js";

export type FetchOptions = {
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string | Uint8Array;
  userAgent?: string;
  retryDelaysMs?: readonly number[];
  signal?: AbortSignal;
};

const DEFAULT_RETRIES = [250, 750, 2000] as const;
const DEFAULT_UA = "ktmb/0.1.0 (+https://github.com/zhunhao/ktmb)";

const codeForStatus = (status: number): "not_found" | "rate_limited" | "upstream_error" => {
  if (status === 404) return "not_found";
  if (status === 429) return "rate_limited";
  return "upstream_error";
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type ResponseLike = {
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
  arrayBuffer: () => Promise<ArrayBuffer>;
};

export const fetchWithRetry = async (
  url: string,
  options: FetchOptions = {},
): Promise<Result<ResponseLike>> => {
  const u = new URL(url);
  const queue = queueFor(u.origin);
  const delays = options.retryDelaysMs ?? DEFAULT_RETRIES;

  return queue.add(async () => {
    const headers = new Headers(options.headers);
    if (!headers.has("user-agent")) headers.set("user-agent", options.userAgent ?? DEFAULT_UA);

    let lastStatus = 0;
    let lastError: unknown = undefined;
    for (let attempt = 0; attempt <= delays.length; attempt++) {
      try {
        const res = await undiciFetch(url, {
          method: options.method ?? "GET",
          headers,
          body: options.body,
          signal: options.signal,
        });
        if (res.ok) {
          return ok({
            status: res.status,
            json: () => res.json(),
            text: () => res.text(),
            arrayBuffer: () => res.arrayBuffer(),
          });
        }
        if (res.status >= 400 && res.status < 500) {
          return err(codeForStatus(res.status), `HTTP ${res.status} from ${u.host}`);
        }
        lastStatus = res.status;
      } catch (e) {
        lastError = e;
      }
      if (attempt < delays.length) await sleep(delays[attempt]!);
    }
    return err(
      "upstream_error",
      lastStatus
        ? `HTTP ${lastStatus} from ${u.host} after retries`
        : `network error talking to ${u.host}`,
      lastError,
    );
  }) as Promise<Result<ResponseLike>>;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/unit/core/client/http.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/core/client tests/unit/core/client
git commit -m "feat(core/client): add undici fetch wrapper with retries and per-origin concurrency cap"
```

---

### Task 6: TTL cache helper

**Files:**
- Create: `src/core/client/cache.ts`
- Test: `tests/unit/core/client/cache.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/unit/core/client/cache.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { TtlCache, cacheKey } from "../../../../src/core/client/cache.js";

describe("TtlCache", () => {
  it("returns cached value within TTL", () => {
    const c = new TtlCache<string>({ max: 10, ttlMs: 1000 });
    c.set("a", "1");
    expect(c.get("a")).toBe("1");
  });

  it("expires after TTL", () => {
    vi.useFakeTimers();
    const c = new TtlCache<string>({ max: 10, ttlMs: 1000 });
    c.set("a", "1");
    vi.advanceTimersByTime(1500);
    expect(c.get("a")).toBeUndefined();
    vi.useRealTimers();
  });

  it("evicts least-recently-used past max", () => {
    const c = new TtlCache<string>({ max: 2, ttlMs: 60_000 });
    c.set("a", "1");
    c.set("b", "2");
    c.get("a");
    c.set("c", "3");
    expect(c.get("b")).toBeUndefined();
    expect(c.get("a")).toBe("1");
    expect(c.get("c")).toBe("3");
  });
});

describe("cacheKey", () => {
  it("hashes equivalent objects to the same key", () => {
    expect(cacheKey({ b: 1, a: 2 })).toBe(cacheKey({ a: 2, b: 1 }));
  });
  it("normalizes string casing/trim", () => {
    expect(cacheKey({ q: "  KL Sentral " })).toBe(cacheKey({ q: "kl sentral" }));
  });
  it("differentiates distinct values", () => {
    expect(cacheKey({ a: 1 })).not.toBe(cacheKey({ a: 2 }));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/core/client/cache.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`src/core/client/cache.ts`:

```ts
import { LRUCache } from "lru-cache";
import { createHash } from "node:crypto";

export type TtlCacheOptions = { max: number; ttlMs: number };

export class TtlCache<V extends {} | null> {
  private readonly inner: LRUCache<string, V>;
  constructor(opts: TtlCacheOptions) {
    this.inner = new LRUCache({ max: opts.max, ttl: opts.ttlMs });
  }
  get(key: string): V | undefined {
    return this.inner.get(key);
  }
  set(key: string, value: V): void {
    this.inner.set(key, value);
  }
  delete(key: string): void {
    this.inner.delete(key);
  }
  clear(): void {
    this.inner.clear();
  }
}

const normalize = (v: unknown): unknown => {
  if (typeof v === "string") return v.trim().toLowerCase();
  if (Array.isArray(v)) return v.map(normalize);
  if (v && typeof v === "object") {
    const entries = Object.entries(v as Record<string, unknown>)
      .filter(([, val]) => val !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, val]) => [k, normalize(val)] as const);
    return Object.fromEntries(entries);
  }
  return v;
};

export const cacheKey = (params: Record<string, unknown>): string => {
  const json = JSON.stringify(normalize(params));
  return createHash("sha1").update(json).digest("hex");
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/unit/core/client/cache.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/core/client/cache.ts tests/unit/core/client/cache.test.ts
git commit -m "feat(core/client): add TtlCache and stable cacheKey helper"
```

---

## Phase 2 — GTFS adapter

### Task 7: GTFS Static download + parse

**Files:**
- Create: `scripts/inspect-gtfs.ts`
- Create: `src/core/gtfs/static-parser.ts`
- Create: `src/core/gtfs/types.ts`
- Create: `tests/unit/core/gtfs/_make-fixture.ts`
- Test: `tests/unit/core/gtfs/static-parser.test.ts`

- [ ] **Step 1: Write the inspection script**

`scripts/inspect-gtfs.ts`:

```ts
import { fetchWithRetry } from "../src/core/client/http.js";
import { unzipSync, strFromU8 } from "fflate";

const URL = "https://api.data.gov.my/gtfs-static/ktmb";

const main = async (): Promise<void> => {
  const r = await fetchWithRetry(URL);
  if (!r.ok) {
    console.error(r.error);
    process.exit(1);
  }
  const buf = new Uint8Array(await r.data.arrayBuffer());
  const files = unzipSync(buf);
  console.log("Files in feed:");
  for (const name of Object.keys(files).sort()) {
    console.log(`  ${name}: ${files[name]!.byteLength} bytes`);
  }
  for (const name of ["agency.txt", "routes.txt", "calendar.txt", "stops.txt"]) {
    const f = files[name];
    if (!f) continue;
    const lines = strFromU8(f).split(/\r?\n/);
    console.log(`\n--- ${name} (head) ---`);
    console.log(lines.slice(0, 6).join("\n"));
    console.log(`(total lines: ${lines.length})`);
  }
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: Run the inspection script**

Run: `pnpm inspect:gtfs`
Expected: lists files in the feed (typically `agency.txt`, `calendar.txt`, `calendar_dates.txt`, `routes.txt`, `stop_times.txt`, `stops.txt`, `trips.txt`, `shapes.txt`). Prints first 6 lines of each key file.

If network is unavailable, capture an offline copy with `curl -o tests/fixtures/captured/feed.zip https://api.data.gov.my/gtfs-static/ktmb` and re-run after pointing the script at the file. The `tests/fixtures/captured/` path is git-ignored.

- [ ] **Step 3: Build the fixture helper**

`tests/unit/core/gtfs/_make-fixture.ts`:

```ts
import { strToU8, zipSync } from "fflate";

export const buildMiniFeed = (): Uint8Array => {
  const files: Record<string, Uint8Array> = {
    "agency.txt": strToU8(
      "agency_id,agency_name,agency_url,agency_timezone\nKTMB,KTMB,https://www.ktmb.com.my,Asia/Kuala_Lumpur\n",
    ),
    "routes.txt": strToU8(
      [
        "route_id,agency_id,route_short_name,route_long_name,route_type",
        "ETS-N,KTMB,EG,ETS Northbound,2",
        "KOM-PK,KTMB,KP,Komuter Port Klang,2",
        "INT-EKW,KTMB,EW,Ekspres Rakyat Timuran,2",
        "STT,KTMB,ST,Shuttle Tebrau,2",
      ].join("\n") + "\n",
    ),
    "stops.txt": strToU8(
      [
        "stop_id,stop_name,stop_lat,stop_lon",
        "KUL,KL Sentral,3.1339,101.6864",
        "BTW,Butterworth,5.4143,100.3666",
        "JBS,JB Sentral,1.4631,103.7708",
        "WCQ,Woodlands CIQ,1.4470,103.7710",
        "TPT,Tumpat,6.2014,102.1714",
      ].join("\n") + "\n",
    ),
    "calendar.txt": strToU8(
      [
        "service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date",
        "WD,1,1,1,1,1,0,0,20260101,20261231",
      ].join("\n") + "\n",
    ),
    "trips.txt": strToU8(
      [
        "route_id,service_id,trip_id,trip_headsign",
        "ETS-N,WD,EG9322,Butterworth",
        "INT-EKW,WD,EW27,Tumpat",
        "STT,WD,ST101,Woodlands CIQ",
        "KOM-PK,WD,K2412,Port Klang",
      ].join("\n") + "\n",
    ),
    "stop_times.txt": strToU8(
      [
        "trip_id,arrival_time,departure_time,stop_id,stop_sequence",
        "EG9322,08:00:00,08:00:00,KUL,1",
        "EG9322,13:00:00,13:00:00,BTW,2",
        "EW27,20:00:00,20:00:00,JBS,1",
        "EW27,31:30:00,31:30:00,TPT,2",
        "ST101,08:00:00,08:00:00,JBS,1",
        "ST101,08:05:00,08:05:00,WCQ,2",
        "K2412,07:30:00,07:30:00,KUL,1",
        "K2412,08:30:00,08:30:00,BTW,2",
      ].join("\n") + "\n",
    ),
  };
  return zipSync(files);
};
```

- [ ] **Step 4: Write the failing test**

`tests/unit/core/gtfs/static-parser.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseStaticFeed } from "../../../../src/core/gtfs/static-parser.js";
import { buildMiniFeed } from "./_make-fixture.js";

describe("GTFS static parser", () => {
  it("parses agency, routes, stops, calendar, trips, stop_times", () => {
    const feed = parseStaticFeed(buildMiniFeed());
    expect(feed.agencies.length).toBe(1);
    expect(feed.routes.length).toBe(4);
    expect(feed.stops.length).toBe(5);
    expect(feed.calendar.length).toBe(1);
    expect(feed.trips.length).toBe(4);
    expect(feed.stopTimes.length).toBe(8);
  });

  it("preserves stop_times order by stop_sequence", () => {
    const feed = parseStaticFeed(buildMiniFeed());
    const eg = feed.stopTimes.filter((s) => s.tripId === "EG9322");
    expect(eg.map((s) => s.stopId)).toEqual(["KUL", "BTW"]);
  });

  it("retains GTFS HH:MM:SS strings (no rollover here)", () => {
    const feed = parseStaticFeed(buildMiniFeed());
    const ew = feed.stopTimes.filter((s) => s.tripId === "EW27");
    expect(ew.map((s) => s.departureTime)).toEqual(["20:00:00", "31:30:00"]);
  });
});
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `pnpm vitest run tests/unit/core/gtfs/static-parser.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 6: Write the implementations**

`src/core/gtfs/types.ts`:

```ts
export type Agency = {
  agencyId: string;
  agencyName: string;
  agencyTimezone: string;
};

export type Route = {
  routeId: string;
  agencyId: string;
  routeShortName: string;
  routeLongName: string;
  routeType: number;
};

export type GtfsStop = {
  stopId: string;
  stopName: string;
  lat: number | null;
  lon: number | null;
};

export type Calendar = {
  serviceId: string;
  days: readonly [
    sunday: boolean,
    monday: boolean,
    tuesday: boolean,
    wednesday: boolean,
    thursday: boolean,
    friday: boolean,
    saturday: boolean,
  ];
  startDate: string;
  endDate: string;
};

export type Trip = {
  routeId: string;
  serviceId: string;
  tripId: string;
  tripHeadsign: string;
};

export type StopTime = {
  tripId: string;
  arrivalTime: string;
  departureTime: string;
  stopId: string;
  stopSequence: number;
};

export type StaticFeed = {
  agencies: Agency[];
  routes: Route[];
  stops: GtfsStop[];
  calendar: Calendar[];
  trips: Trip[];
  stopTimes: StopTime[];
};
```

`src/core/gtfs/static-parser.ts`:

```ts
import { parse } from "csv-parse/sync";
import { strFromU8, unzipSync } from "fflate";
import type {
  Agency,
  Calendar,
  GtfsStop,
  Route,
  StaticFeed,
  StopTime,
  Trip,
} from "./types.js";

const readCsv = (files: Record<string, Uint8Array>, name: string): Record<string, string>[] => {
  const buf = files[name];
  if (!buf) return [];
  return parse(strFromU8(buf), { columns: true, skip_empty_lines: true, trim: true });
};

const num = (v: string | undefined): number | null => {
  if (v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const bool01 = (v: string | undefined): boolean => v === "1";

export const parseStaticFeed = (zipBytes: Uint8Array): StaticFeed => {
  const files = unzipSync(zipBytes);

  const agencies: Agency[] = readCsv(files, "agency.txt").map((r) => ({
    agencyId: r["agency_id"] ?? "",
    agencyName: r["agency_name"] ?? "",
    agencyTimezone: r["agency_timezone"] ?? "Asia/Kuala_Lumpur",
  }));

  const routes: Route[] = readCsv(files, "routes.txt").map((r) => ({
    routeId: r["route_id"] ?? "",
    agencyId: r["agency_id"] ?? "",
    routeShortName: r["route_short_name"] ?? "",
    routeLongName: r["route_long_name"] ?? "",
    routeType: Number(r["route_type"] ?? "0"),
  }));

  const stops: GtfsStop[] = readCsv(files, "stops.txt").map((r) => ({
    stopId: r["stop_id"] ?? "",
    stopName: r["stop_name"] ?? "",
    lat: num(r["stop_lat"]),
    lon: num(r["stop_lon"]),
  }));

  const calendar: Calendar[] = readCsv(files, "calendar.txt").map((r) => ({
    serviceId: r["service_id"] ?? "",
    days: [
      bool01(r["sunday"]),
      bool01(r["monday"]),
      bool01(r["tuesday"]),
      bool01(r["wednesday"]),
      bool01(r["thursday"]),
      bool01(r["friday"]),
      bool01(r["saturday"]),
    ] as Calendar["days"],
    startDate: r["start_date"] ?? "",
    endDate: r["end_date"] ?? "",
  }));

  const trips: Trip[] = readCsv(files, "trips.txt").map((r) => ({
    routeId: r["route_id"] ?? "",
    serviceId: r["service_id"] ?? "",
    tripId: r["trip_id"] ?? "",
    tripHeadsign: r["trip_headsign"] ?? "",
  }));

  const stopTimes: StopTime[] = readCsv(files, "stop_times.txt")
    .map((r) => ({
      tripId: r["trip_id"] ?? "",
      arrivalTime: r["arrival_time"] ?? "",
      departureTime: r["departure_time"] ?? "",
      stopId: r["stop_id"] ?? "",
      stopSequence: Number(r["stop_sequence"] ?? "0"),
    }))
    .sort((a, b) =>
      a.tripId === b.tripId ? a.stopSequence - b.stopSequence : a.tripId.localeCompare(b.tripId),
    );

  return { agencies, routes, stops, calendar, trips, stopTimes };
};
```

- [ ] **Step 7: Run test to verify it passes**

Run: `pnpm vitest run tests/unit/core/gtfs/static-parser.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 8: Commit**

```bash
git add scripts/inspect-gtfs.ts src/core/gtfs/types.ts src/core/gtfs/static-parser.ts tests/unit/core/gtfs
git commit -m "feat(gtfs): add GTFS Static parser (zip + CSV) and inspection script"
```

---

### Task 8: GTFS Static in-memory store

**Files:**
- Create: `src/core/gtfs/store.ts`
- Test: `tests/unit/core/gtfs/store.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/unit/core/gtfs/store.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseStaticFeed } from "../../../../src/core/gtfs/static-parser.js";
import { GtfsStore } from "../../../../src/core/gtfs/store.js";
import { buildMiniFeed } from "./_make-fixture.js";

const store = (): GtfsStore => new GtfsStore(parseStaticFeed(buildMiniFeed()));

describe("GtfsStore", () => {
  it("findStop by id", () => {
    const s = store();
    expect(s.findStop("KUL")?.stopName).toBe("KL Sentral");
    expect(s.findStop("ZZZ")).toBeUndefined();
  });

  it("listStops returns all", () => {
    expect(store().listStops().length).toBe(5);
  });

  it("listRoutes returns all", () => {
    expect(store().listRoutes().length).toBe(4);
  });

  it("tripsRunningOn(date) filters by calendar weekday", () => {
    const s = store();
    const fri = s.tripsRunningOn("2026-05-01");
    expect(fri.map((t) => t.tripId).sort()).toEqual(["EG9322", "EW27", "K2412", "ST101"]);
    expect(s.tripsRunningOn("2026-05-02")).toEqual([]);
  });

  it("stopTimesForTrip returns ordered stops", () => {
    const s = store();
    const times = s.stopTimesForTrip("EG9322");
    expect(times.map((t) => t.stopId)).toEqual(["KUL", "BTW"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/core/gtfs/store.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`src/core/gtfs/store.ts`:

```ts
import type { Calendar, GtfsStop, Route, StaticFeed, StopTime, Trip } from "./types.js";

const dayOfWeekMyt = (yyyymmdd: string): number => {
  const y = Number(yyyymmdd.slice(0, 4));
  const m = Number(yyyymmdd.slice(5, 7));
  const d = Number(yyyymmdd.slice(8, 10));
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};

const yyyymmdd = (date: string): string => date.replace(/-/g, "");

export class GtfsStore {
  private readonly stopsById = new Map<string, GtfsStop>();
  private readonly routesById = new Map<string, Route>();
  private readonly tripsById = new Map<string, Trip>();
  private readonly stopTimesByTrip = new Map<string, StopTime[]>();
  private readonly calendarByServiceId = new Map<string, Calendar>();
  private readonly tripsByRoute = new Map<string, Trip[]>();

  constructor(public readonly feed: StaticFeed) {
    for (const s of feed.stops) this.stopsById.set(s.stopId, s);
    for (const r of feed.routes) this.routesById.set(r.routeId, r);
    for (const t of feed.trips) {
      this.tripsById.set(t.tripId, t);
      const list = this.tripsByRoute.get(t.routeId) ?? [];
      list.push(t);
      this.tripsByRoute.set(t.routeId, list);
    }
    for (const st of feed.stopTimes) {
      const list = this.stopTimesByTrip.get(st.tripId) ?? [];
      list.push(st);
      this.stopTimesByTrip.set(st.tripId, list);
    }
    for (const c of feed.calendar) this.calendarByServiceId.set(c.serviceId, c);
  }

  findStop(stopId: string): GtfsStop | undefined {
    return this.stopsById.get(stopId);
  }

  listStops(): readonly GtfsStop[] {
    return this.feed.stops;
  }

  findRoute(routeId: string): Route | undefined {
    return this.routesById.get(routeId);
  }

  listRoutes(): readonly Route[] {
    return this.feed.routes;
  }

  findTrip(tripId: string): Trip | undefined {
    return this.tripsById.get(tripId);
  }

  stopTimesForTrip(tripId: string): readonly StopTime[] {
    return this.stopTimesByTrip.get(tripId) ?? [];
  }

  tripsForRoute(routeId: string): readonly Trip[] {
    return this.tripsByRoute.get(routeId) ?? [];
  }

  tripsRunningOn(serviceDate: string): readonly Trip[] {
    const dow = dayOfWeekMyt(serviceDate);
    const ymd = yyyymmdd(serviceDate);
    const eligibleServices = new Set<string>();
    for (const c of this.feed.calendar) {
      if (ymd < c.startDate || ymd > c.endDate) continue;
      if (c.days[dow]) eligibleServices.add(c.serviceId);
    }
    return this.feed.trips.filter((t) => eligibleServices.has(t.serviceId));
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/unit/core/gtfs/store.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/core/gtfs/store.ts tests/unit/core/gtfs/store.test.ts
git commit -m "feat(gtfs): add GtfsStore with indexed lookups and tripsRunningOn"
```

---

### Task 9: GTFS loader with stale-but-serve refresh

**Files:**
- Create: `src/core/gtfs/loader.ts`
- Test: `tests/unit/core/gtfs/loader.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/unit/core/gtfs/loader.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { GtfsLoader } from "../../../../src/core/gtfs/loader.js";
import { buildMiniFeed } from "./_make-fixture.js";

const FEED_URL = "https://api.data.gov.my/gtfs-static/ktmb";
const server = setupServer();
beforeEach(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterEach(() => server.close());

describe("GtfsLoader", () => {
  it("loads on first call and exposes the parsed store", async () => {
    server.use(
      http.get(FEED_URL, () =>
        new HttpResponse(buildMiniFeed(), {
          status: 200,
          headers: { "content-type": "application/zip" },
        }),
      ),
    );
    const loader = new GtfsLoader(FEED_URL);
    const r = await loader.load();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.findStop("KUL")?.stopName).toBe("KL Sentral");
  });

  it("serves stale-but-current store when refresh fails", async () => {
    let calls = 0;
    server.use(
      http.get(FEED_URL, () => {
        calls++;
        if (calls === 1) {
          return new HttpResponse(buildMiniFeed(), {
            status: 200,
            headers: { "content-type": "application/zip" },
          });
        }
        return new HttpResponse(null, { status: 503 });
      }),
    );
    const loader = new GtfsLoader(FEED_URL);
    const first = await loader.load();
    expect(first.ok).toBe(true);
    const second = await loader.refresh({ retryDelaysMs: [1] });
    expect(second.ok).toBe(false);
    const store = loader.currentStore();
    expect(store?.findStop("KUL")?.stopName).toBe("KL Sentral");
  });

  it("returns upstream_error if the very first load fails", async () => {
    server.use(http.get(FEED_URL, () => new HttpResponse(null, { status: 503 })));
    const loader = new GtfsLoader(FEED_URL);
    const r = await loader.load({ retryDelaysMs: [1] });
    expect(r.ok).toBe(false);
    expect(loader.currentStore()).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/core/gtfs/loader.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`src/core/gtfs/loader.ts`:

```ts
import type { Result } from "../result.js";
import { err, ok } from "../result.js";
import { fetchWithRetry } from "../client/http.js";
import type { FetchOptions } from "../client/http.js";
import { parseStaticFeed } from "./static-parser.js";
import { GtfsStore } from "./store.js";

export class GtfsLoader {
  private store: GtfsStore | undefined;

  constructor(private readonly feedUrl: string) {}

  currentStore(): GtfsStore | undefined {
    return this.store;
  }

  async load(opts: Pick<FetchOptions, "retryDelaysMs"> = {}): Promise<Result<GtfsStore>> {
    const r = await this.fetchAndParse(opts);
    if (r.ok) this.store = r.data;
    return r;
  }

  async refresh(opts: Pick<FetchOptions, "retryDelaysMs"> = {}): Promise<Result<GtfsStore>> {
    const r = await this.fetchAndParse(opts);
    if (r.ok) this.store = r.data;
    return r;
  }

  private async fetchAndParse(
    opts: Pick<FetchOptions, "retryDelaysMs">,
  ): Promise<Result<GtfsStore>> {
    const res = await fetchWithRetry(this.feedUrl, opts);
    if (!res.ok) return res;
    try {
      const buf = new Uint8Array(await res.data.arrayBuffer());
      const feed = parseStaticFeed(buf);
      return ok(new GtfsStore(feed));
    } catch (e) {
      return err("parse_error", "GTFS feed parse failed", e);
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/unit/core/gtfs/loader.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/core/gtfs/loader.ts tests/unit/core/gtfs/loader.test.ts
git commit -m "feat(gtfs): add GtfsLoader with stale-but-serve refresh semantics"
```

---

### Task 10: GTFS-RT vehicle position decoder

**Files:**
- Create: `src/core/gtfs/realtime.ts`
- Test: `tests/unit/core/gtfs/realtime.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/unit/core/gtfs/realtime.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import GtfsRealtimeBindings from "gtfs-realtime-bindings";
import { fetchVehiclePositions } from "../../../../src/core/gtfs/realtime.js";

const URL_RT = "https://api.data.gov.my/gtfs-realtime/vehicle-position/ktmb";
const server = setupServer();
beforeEach(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterEach(() => server.close());

const buildFeed = (): Uint8Array => {
  const FeedMessage = GtfsRealtimeBindings.transit_realtime.FeedMessage;
  const msg = FeedMessage.create({
    header: { gtfsRealtimeVersion: "2.0", incrementality: 0, timestamp: 1714521600 },
    entity: [
      {
        id: "v1",
        vehicle: {
          vehicle: { id: "EG9322" },
          trip: { tripId: "T1", routeId: "ETS-N" },
          position: { latitude: 3.139, longitude: 101.6864, speed: 30, bearing: 0 },
          timestamp: 1714521600,
        },
      },
    ],
  });
  return FeedMessage.encode(msg).finish();
};

describe("fetchVehiclePositions", () => {
  it("decodes GTFS-RT and maps to VehiclePosition", async () => {
    server.use(
      http.get(URL_RT, () =>
        new HttpResponse(buildFeed(), {
          status: 200,
          headers: { "content-type": "application/x-protobuf" },
        }),
      ),
    );
    const r = await fetchVehiclePositions(URL_RT);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data).toHaveLength(1);
    expect(r.data[0]!.vehicleId).toBe("EG9322");
    expect(r.data[0]!.lat).toBeCloseTo(3.139);
    expect(r.data[0]!.timestamp.endsWith("+08:00")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/core/gtfs/realtime.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`src/core/gtfs/realtime.ts`:

```ts
import GtfsRealtimeBindings from "gtfs-realtime-bindings";
import type { Result } from "../result.js";
import { err, ok } from "../result.js";
import { fetchWithRetry } from "../client/http.js";
import type { VehiclePosition } from "../types.js";

const epochToIsoMyt = (epochSeconds: number): string => {
  const d = new Date(epochSeconds * 1000);
  const mytMs = d.getTime() + 8 * 60 * 60 * 1000;
  const m = new Date(mytMs);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${m.getUTCFullYear()}-${pad(m.getUTCMonth() + 1)}-${pad(m.getUTCDate())}` +
    `T${pad(m.getUTCHours())}:${pad(m.getUTCMinutes())}:${pad(m.getUTCSeconds())}+08:00`
  );
};

export const fetchVehiclePositions = async (
  url: string,
): Promise<Result<VehiclePosition[]>> => {
  const res = await fetchWithRetry(url);
  if (!res.ok) return res;
  try {
    const buf = new Uint8Array(await res.data.arrayBuffer());
    const FeedMessage = GtfsRealtimeBindings.transit_realtime.FeedMessage;
    const feed = FeedMessage.decode(buf);
    const out: VehiclePosition[] = [];
    for (const e of feed.entity) {
      const v = e.vehicle;
      if (!v?.position || v.vehicle?.id == null) continue;
      out.push({
        vehicleId: v.vehicle.id,
        ...(v.trip?.tripId ? { tripId: v.trip.tripId } : {}),
        ...(v.trip?.routeId ? { routeId: v.trip.routeId } : {}),
        lat: v.position.latitude ?? 0,
        lon: v.position.longitude ?? 0,
        ...(v.position.bearing != null ? { bearing: v.position.bearing } : {}),
        ...(v.position.speed != null ? { speedKmh: v.position.speed } : {}),
        timestamp: epochToIsoMyt(Number(v.timestamp ?? feed.header?.timestamp ?? 0)),
      });
    }
    return ok(out);
  } catch (e) {
    return err("parse_error", "GTFS-RT decode failed", e);
  }
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/unit/core/gtfs/realtime.test.ts`
Expected: PASS, 1 test.

- [ ] **Step 5: Commit**

```bash
git add src/core/gtfs/realtime.ts tests/unit/core/gtfs/realtime.test.ts
git commit -m "feat(gtfs): add GTFS-RT vehicle position decoder"
```

---

## Phase 3 — KTMB live adapter

### Task 11: KTMB endpoint discovery (manual capture)

**Files:**
- Create: `scripts/inspect-ktmb.md`
- Create: `tests/fixtures/ktmb/availability-sample.json`

- [ ] **Step 1: Capture booking-site network calls**

Manual exploratory step. In a browser:

1. Open `https://online.ktmb.com.my/` and search for a route (KL Sentral → Butterworth, ~2 weeks out).
2. Open DevTools → Network → filter for XHR/Fetch.
3. Trigger the search. Identify the request that returns the train list with classes/fares/seats.
4. Right-click the request → Copy → Copy as cURL (POSIX).
5. Trigger an availability/fare check on a specific train. Capture that request too.

Paste the captured invocations and a short summary into `scripts/inspect-ktmb.md`:

```markdown
# KTMB endpoint capture

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
```

- [ ] **Step 2: Save anonymized response samples**

Pretty-print the raw response with `jq .` and save to:
- `tests/fixtures/ktmb/search-sample.json`
- `tests/fixtures/ktmb/availability-sample.json`

Strip any PII or session-bound tokens. Keep only the data shape relevant to schedules/fares/availability.

- [ ] **Step 3: Commit notes and fixtures**

```bash
git add scripts/inspect-ktmb.md tests/fixtures/ktmb
git commit -m "chore(ktmb): capture booking endpoint shapes for parser fixtures"
```

> If the capture reveals that KTMB now requires a captcha or session token to access fares, **stop and re-spec**. The design assumes anonymous read access; that assumption needs revisiting before continuing past Task 12.

---

### Task 12: KTMB live availability client

**Files:**
- Create: `src/core/ktmb/types.ts`
- Create: `src/core/ktmb/parser.ts`
- Create: `src/core/ktmb/client.ts`
- Test: `tests/unit/core/ktmb/parser.test.ts`
- Test: `tests/integration/ktmb/client.test.ts`

> **Implementation note:** the exact URL, method, and request body come from Task 11's capture. The schema in `types.ts` uses placeholder field names that map to our `Fare` shape; substitute the actual key names from your captured fixtures. The test asserts the *output* shape (which is fixed by our spec), not the input shape.

- [ ] **Step 1: Write the failing parser test**

`tests/unit/core/ktmb/parser.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { parseAvailabilityResponse } from "../../../../src/core/ktmb/parser.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(resolve(here, "../../../fixtures/ktmb/availability-sample.json"), "utf8"),
);

describe("KTMB parseAvailabilityResponse", () => {
  it("yields a Result with at least one fare class", () => {
    const r = parseAvailabilityResponse(fixture);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.length).toBeGreaterThan(0);
    for (const c of r.data) {
      expect(typeof c.className).toBe("string");
      expect(c.fare.priceMinor).toBeGreaterThanOrEqual(0);
      expect(["MYR", "SGD"]).toContain(c.fare.currency);
    }
  });

  it("returns parse_error on completely unrecognised shape", () => {
    const r = parseAvailabilityResponse({ totally: "wrong" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("parse_error");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run tests/unit/core/ktmb/parser.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`src/core/ktmb/types.ts`:

```ts
import { z } from "zod";

// EXPECTED KTMB SHAPE (post-capture). Adjust property names here to match the
// real wire format learned in Task 11. This is the *only* place that knows
// about KTMB's wire shape.
export const KtmbAvailabilityResponseSchema = z.object({
  classes: z.array(
    z.object({
      name: z.string(),
      price: z.number(),
      currency: z.string(),
      seats: z.number().nullable().optional(),
    }),
  ),
});
export type KtmbAvailabilityResponse = z.infer<typeof KtmbAvailabilityResponseSchema>;
```

`src/core/ktmb/parser.ts`:

```ts
import type { Result } from "../result.js";
import { err, ok } from "../result.js";
import type { TrainClass } from "../types.js";
import { KtmbAvailabilityResponseSchema } from "./types.js";

const toMinor = (
  price: number,
  currency: string,
): { priceMinor: number; currency: "MYR" | "SGD" } => {
  const cur = currency === "SGD" ? "SGD" : "MYR";
  return { priceMinor: Math.round(price * 100), currency: cur };
};

export const parseAvailabilityResponse = (raw: unknown): Result<TrainClass[]> => {
  const parsed = KtmbAvailabilityResponseSchema.safeParse(raw);
  if (!parsed.success) {
    return err("parse_error", "unexpected KTMB availability shape", parsed.error.issues);
  }
  const out: TrainClass[] = parsed.data.classes.map((c) => {
    const minor = toMinor(c.price, c.currency);
    return {
      className: c.name,
      fare: {
        className: c.name,
        priceMinor: minor.priceMinor,
        currency: minor.currency,
        seatsLeft: c.seats ?? null,
      },
    };
  });
  return ok(out);
};
```

`src/core/ktmb/client.ts`:

```ts
import type { Result } from "../result.js";
import { err } from "../result.js";
import { fetchWithRetry } from "../client/http.js";
import type { TrainClass } from "../types.js";
import { parseAvailabilityResponse } from "./parser.js";

const BASE = "https://online.ktmb.com.my";

export type GetAvailabilityInput = {
  from: string;
  to: string;
  date: string;
  trainNo: string;
};

export const getAvailability = async (
  input: GetAvailabilityInput,
): Promise<Result<TrainClass[]>> => {
  // Replace path/method with the real endpoint from Task 11's capture.
  const url = `${BASE}/api/availability`;
  const res = await fetchWithRetry(url, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) return res;
  let json: unknown;
  try {
    json = await res.data.json();
  } catch (e) {
    return err("parse_error", "KTMB returned non-JSON body", e);
  }
  return parseAvailabilityResponse(json);
};
```

- [ ] **Step 4: Write the integration test**

`tests/integration/ktmb/client.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { getAvailability } from "../../../src/core/ktmb/client.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(resolve(here, "../../fixtures/ktmb/availability-sample.json"), "utf8"),
);
const server = setupServer();
beforeEach(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterEach(() => server.close());

describe("KTMB getAvailability", () => {
  it("calls the booking endpoint and returns parsed classes", async () => {
    server.use(
      http.post("https://online.ktmb.com.my/api/availability", () => HttpResponse.json(fixture)),
    );
    const r = await getAvailability({
      from: "KUL",
      to: "BTW",
      date: "2026-05-01",
      trainNo: "EG9322",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 5: Run all KTMB tests to verify they pass**

Run: `pnpm vitest run tests/unit/core/ktmb tests/integration/ktmb`
Expected: PASS — fixture-driven tests succeed. If they fail, adjust `KtmbAvailabilityResponseSchema` field names to match the captured fixture shape.

- [ ] **Step 6: Commit**

```bash
git add src/core/ktmb tests/unit/core/ktmb tests/integration/ktmb
git commit -m "feat(ktmb): add live availability client and Zod-validated parser"
```

---

## Phase 4 — Service layer

### Task 13: Stations service

**Files:**
- Create: `src/core/stations/overlay.ts`
- Create: `src/core/stations/service.ts`
- Test: `tests/unit/core/stations/service.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/unit/core/stations/service.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseStaticFeed } from "../../../../src/core/gtfs/static-parser.js";
import { GtfsStore } from "../../../../src/core/gtfs/store.js";
import { StationsService } from "../../../../src/core/stations/service.js";
import { buildMiniFeed } from "../gtfs/_make-fixture.js";

const make = () => new StationsService(new GtfsStore(parseStaticFeed(buildMiniFeed())));

describe("StationsService", () => {
  it("getByCode resolves a known station", () => {
    expect(make().getByCode("KUL")?.nameEn).toBe("KL Sentral");
  });

  it("search fuzzy-matches typos", () => {
    const matches = make().search("Sentrla");
    expect(matches.some((s) => s.code === "KUL")).toBe(true);
  });

  it("search ranks exact code first", () => {
    const matches = make().search("BTW");
    expect(matches[0]?.code).toBe("BTW");
  });

  it("search returns at most 10 by default", () => {
    expect(make().search("a").length).toBeLessThanOrEqual(10);
  });

  it("Woodlands CIQ is tagged as country=SG", () => {
    expect(make().getByCode("WCQ")?.country).toBe("SG");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run tests/unit/core/stations`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write the implementations**

`src/core/stations/overlay.ts`:

```ts
export type StationOverlay = {
  country: "MY" | "SG" | "TH";
  nameMs?: string;
};

export const STATION_OVERLAY: Record<string, StationOverlay> = {
  WCQ: { country: "SG", nameMs: "Woodlands CIQ" },
};
```

`src/core/stations/service.ts`:

```ts
import Fuse from "fuse.js";
import type { GtfsStore } from "../gtfs/store.js";
import type { Station } from "../types.js";
import { STATION_OVERLAY } from "./overlay.js";

export class StationsService {
  private readonly all: Station[];
  private readonly byCode = new Map<string, Station>();
  private readonly fuse: Fuse<Station>;

  constructor(store: GtfsStore) {
    this.all = store.listStops().map((s) => {
      const overlay = STATION_OVERLAY[s.stopId];
      return {
        code: s.stopId,
        nameEn: s.stopName,
        nameMs: overlay?.nameMs ?? s.stopName,
        country: overlay?.country ?? "MY",
      };
    });
    for (const s of this.all) this.byCode.set(s.code, s);
    this.fuse = new Fuse(this.all, {
      keys: [
        { name: "code", weight: 0.5 },
        { name: "nameEn", weight: 0.3 },
        { name: "nameMs", weight: 0.2 },
      ],
      threshold: 0.4,
      includeScore: true,
    });
  }

  getByCode(code: string): Station | undefined {
    return this.byCode.get(code.toUpperCase());
  }

  search(query: string, limit = 10): Station[] {
    const q = query.trim();
    if (!q) return this.all.slice(0, limit);
    return this.fuse.search(q, { limit }).map((r) => r.item);
  }

  list(): readonly Station[] {
    return this.all;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/unit/core/stations`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/core/stations tests/unit/core/stations
git commit -m "feat(stations): add Fuse-based station service with country overlay"
```

---

### Task 14: Schedules service

**Files:**
- Create: `src/core/schedules/route-classifier.ts`
- Create: `src/core/schedules/service.ts`
- Test: `tests/unit/core/schedules/route-classifier.test.ts`
- Test: `tests/unit/core/schedules/service.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/unit/core/schedules/route-classifier.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { classifyRoute } from "../../../../src/core/schedules/route-classifier.js";

describe("classifyRoute", () => {
  it("recognises ETS by route_id prefix", () => {
    expect(classifyRoute({ routeId: "ETS-N", routeShortName: "EG", routeLongName: "" })).toBe("ETS");
  });
  it("recognises Komuter", () => {
    expect(classifyRoute({ routeId: "KOM-PK", routeShortName: "KP", routeLongName: "" })).toBe(
      "Komuter",
    );
  });
  it("recognises Intercity", () => {
    expect(
      classifyRoute({ routeId: "INT-EKW", routeShortName: "EW", routeLongName: "Ekspres Rakyat" }),
    ).toBe("Intercity");
  });
  it("recognises Shuttle Tebrau", () => {
    expect(
      classifyRoute({ routeId: "STT", routeShortName: "ST", routeLongName: "Shuttle Tebrau" }),
    ).toBe("ShuttleTebrau");
  });
});
```

`tests/unit/core/schedules/service.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseStaticFeed } from "../../../../src/core/gtfs/static-parser.js";
import { GtfsStore } from "../../../../src/core/gtfs/store.js";
import { SchedulesService } from "../../../../src/core/schedules/service.js";
import { buildMiniFeed } from "../gtfs/_make-fixture.js";

const make = () => new SchedulesService(new GtfsStore(parseStaticFeed(buildMiniFeed())));

describe("SchedulesService", () => {
  it("listSchedules returns ETS train KUL→BTW on a weekday", () => {
    const r = make().listSchedules({ from: "KUL", to: "BTW", date: "2026-05-01" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const eg = r.data.find((t) => t.trainNo === "EG9322")!;
    expect(eg.service).toBe("ETS");
    expect(eg.from.stationCode).toBe("KUL");
    expect(eg.to.stationCode).toBe("BTW");
    expect(eg.from.departure).toBe("2026-05-01T08:00:00+08:00");
    expect(eg.to.arrival).toBe("2026-05-01T13:00:00+08:00");
    expect(eg.journeyDurationMinutes).toBe(300);
    expect(eg.classes).toEqual([]);
  });

  it("includes Ekspres Rakyat Timuran with cross-day arrival", () => {
    const r = make().listSchedules({ from: "JBS", to: "TPT", date: "2026-05-01" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const ew = r.data.find((t) => t.trainNo === "EW27")!;
    expect(ew.service).toBe("Intercity");
    expect(ew.from.departure).toBe("2026-05-01T20:00:00+08:00");
    expect(ew.to.arrival).toBe("2026-05-02T07:30:00+08:00");
    expect(ew.journeyDurationMinutes).toBe(690);
  });

  it("returns empty list when no train serves the OD on that date", () => {
    const r = make().listSchedules({ from: "KUL", to: "TPT", date: "2026-05-01" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data).toEqual([]);
  });

  it("returns empty list when calendar excludes the date", () => {
    const r = make().listSchedules({ from: "KUL", to: "BTW", date: "2026-05-02" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run tests/unit/core/schedules`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write the implementations**

`src/core/schedules/route-classifier.ts`:

```ts
export type Service = "ETS" | "Intercity" | "Komuter" | "ShuttleTebrau";

export const classifyRoute = (route: {
  routeId: string;
  routeShortName: string;
  routeLongName: string;
}): Service => {
  const id = route.routeId.toUpperCase();
  const long = route.routeLongName.toUpperCase();
  if (id.startsWith("ETS")) return "ETS";
  if (id.startsWith("KOM")) return "Komuter";
  if (id.startsWith("STT") || long.includes("SHUTTLE TEBRAU")) return "ShuttleTebrau";
  return "Intercity";
};
```

`src/core/schedules/service.ts`:

```ts
import { gtfsTimeToIso } from "../time/gtfs-rollover.js";
import type { GtfsStore } from "../gtfs/store.js";
import type { Result } from "../result.js";
import { ok } from "../result.js";
import type { Stop, TrainSchedule } from "../types.js";
import { classifyRoute } from "./route-classifier.js";

const minutesBetween = (fromIso: string, toIso: string): number =>
  Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 60_000);

export type ListSchedulesInput = {
  from: string;
  to: string;
  date: string;
};

export class SchedulesService {
  constructor(private readonly store: GtfsStore) {}

  listSchedules(input: ListSchedulesInput): Result<TrainSchedule[]> {
    const trips = this.store.tripsRunningOn(input.date);
    const out: TrainSchedule[] = [];
    for (const trip of trips) {
      const route = this.store.findRoute(trip.routeId);
      if (!route) continue;
      const service = classifyRoute(route);
      if (service === "Komuter") continue;
      const stopTimes = this.store.stopTimesForTrip(trip.tripId);
      const fromIdx = stopTimes.findIndex((s) => s.stopId === input.from);
      const toIdx = stopTimes.findIndex((s) => s.stopId === input.to);
      if (fromIdx < 0 || toIdx < 0 || fromIdx >= toIdx) continue;

      const fromSt = stopTimes[fromIdx]!;
      const toSt = stopTimes[toIdx]!;
      const fromStop: Stop = {
        stationCode: fromSt.stopId,
        arrival: null,
        departure: gtfsTimeToIso(input.date, fromSt.departureTime),
      };
      const toStop: Stop = {
        stationCode: toSt.stopId,
        arrival: gtfsTimeToIso(input.date, toSt.arrivalTime),
        departure: null,
      };
      out.push({
        trainNo: trip.tripId,
        service: service === "Komuter" ? "Intercity" : service,
        bookingProvider: "KTMB",
        from: fromStop,
        to: toStop,
        classes: [],
        journeyDurationMinutes: minutesBetween(fromStop.departure!, toStop.arrival!),
      });
    }
    return ok(out);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run tests/unit/core/schedules`
Expected: PASS — all tests across both files.

- [ ] **Step 5: Commit**

```bash
git add src/core/schedules tests/unit/core/schedules
git commit -m "feat(schedules): add SchedulesService composing GTFS trips and stop_times"
```

---

### Task 15: Fare-availability service

**Files:**
- Create: `src/core/schedules/fare-availability.ts`
- Test: `tests/unit/core/schedules/fare-availability.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/unit/core/schedules/fare-availability.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { FareAvailabilityService } from "../../../../src/core/schedules/fare-availability.js";
import type { TrainClass } from "../../../../src/core/types.js";
import { ok } from "../../../../src/core/result.js";
import { TtlCache } from "../../../../src/core/client/cache.js";

describe("FareAvailabilityService", () => {
  it("delegates to the KTMB getter and caches the result", async () => {
    const sample: TrainClass[] = [
      {
        className: "Premier",
        fare: { className: "Premier", priceMinor: 5500, currency: "MYR", seatsLeft: 12 },
      },
    ];
    const get = vi.fn().mockResolvedValue(ok(sample));
    const svc = new FareAvailabilityService({
      getter: get,
      cache: new TtlCache({ max: 16, ttlMs: 30_000 }),
    });
    const a = await svc.get({ from: "KUL", to: "BTW", date: "2026-05-01", trainNo: "EG9322" });
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    expect(a.data).toEqual(sample);

    const b = await svc.get({ from: "KUL", to: "BTW", date: "2026-05-01", trainNo: "EG9322" });
    expect(b.ok).toBe(true);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("does not cache failures", async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, error: { code: "upstream_error", message: "x" } })
      .mockResolvedValueOnce(ok([]));
    const svc = new FareAvailabilityService({
      getter: get,
      cache: new TtlCache({ max: 16, ttlMs: 30_000 }),
    });
    const a = await svc.get({ from: "KUL", to: "BTW", date: "2026-05-01", trainNo: "EG9322" });
    expect(a.ok).toBe(false);
    const b = await svc.get({ from: "KUL", to: "BTW", date: "2026-05-01", trainNo: "EG9322" });
    expect(b.ok).toBe(true);
    expect(get).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/core/schedules/fare-availability.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`src/core/schedules/fare-availability.ts`:

```ts
import type { TrainClass } from "../types.js";
import type { Result } from "../result.js";
import type { TtlCache } from "../client/cache.js";
import { cacheKey } from "../client/cache.js";

export type GetFareAvailabilityInput = {
  from: string;
  to: string;
  date: string;
  trainNo: string;
};

export type FareGetter = (input: GetFareAvailabilityInput) => Promise<Result<TrainClass[]>>;

export type FareAvailabilityServiceOptions = {
  getter: FareGetter;
  cache: TtlCache<readonly TrainClass[]>;
};

export class FareAvailabilityService {
  constructor(private readonly opts: FareAvailabilityServiceOptions) {}

  async get(input: GetFareAvailabilityInput): Promise<Result<readonly TrainClass[]>> {
    const key = cacheKey(input);
    const cached = this.opts.cache.get(key);
    if (cached) return { ok: true, data: cached };
    const r = await this.opts.getter(input);
    if (r.ok) this.opts.cache.set(key, r.data);
    return r;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/unit/core/schedules/fare-availability.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add src/core/schedules/fare-availability.ts tests/unit/core/schedules/fare-availability.test.ts
git commit -m "feat(schedules): add FareAvailabilityService with 30s TTL cache wrapping KTMB"
```

---

### Task 16: Komuter timetable service

**Files:**
- Create: `src/core/komuter/service.ts`
- Test: `tests/unit/core/komuter/service.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/unit/core/komuter/service.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseStaticFeed } from "../../../../src/core/gtfs/static-parser.js";
import { GtfsStore } from "../../../../src/core/gtfs/store.js";
import { KomuterService } from "../../../../src/core/komuter/service.js";
import { buildMiniFeed } from "../gtfs/_make-fixture.js";

const make = () => new KomuterService(new GtfsStore(parseStaticFeed(buildMiniFeed())));

describe("KomuterService", () => {
  it("listLines returns all Komuter routes", () => {
    const r = make().listLines();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.map((l) => l.lineId)).toContain("KOM-PK");
  });

  it("getTimetable returns Komuter departures for a station/date", () => {
    const r = make().getTimetable({ line: "KOM-PK", station: "KUL", date: "2026-05-01" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.length).toBeGreaterThan(0);
    expect(r.data[0]!.departure).toBe("2026-05-01T07:30:00+08:00");
  });

  it("returns not_found for an unknown line", () => {
    const r = make().getTimetable({ line: "NOPE", station: "KUL", date: "2026-05-01" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("not_found");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/core/komuter`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`src/core/komuter/service.ts`:

```ts
import type { GtfsStore } from "../gtfs/store.js";
import type { Result } from "../result.js";
import { err, ok } from "../result.js";
import { gtfsTimeToIso } from "../time/gtfs-rollover.js";
import { classifyRoute } from "../schedules/route-classifier.js";
import type { KomuterDeparture } from "../types.js";

export type KomuterLine = { lineId: string; nameEn: string };

export type GetTimetableInput = { line: string; station: string; date: string };

export class KomuterService {
  constructor(private readonly store: GtfsStore) {}

  listLines(): Result<KomuterLine[]> {
    const out = this.store
      .listRoutes()
      .filter((r) => classifyRoute(r) === "Komuter")
      .map((r) => ({ lineId: r.routeId, nameEn: r.routeLongName || r.routeShortName }));
    return ok(out);
  }

  getTimetable(input: GetTimetableInput): Result<KomuterDeparture[]> {
    const route = this.store.findRoute(input.line);
    if (!route || classifyRoute(route) !== "Komuter") {
      return err("not_found", `unknown Komuter line: ${input.line}`);
    }
    if (!this.store.findStop(input.station)) {
      return err("not_found", `unknown station: ${input.station}`);
    }
    const trips = this.store.tripsForRoute(route.routeId);
    const tripsRunning = new Set(this.store.tripsRunningOn(input.date).map((t) => t.tripId));
    const out: KomuterDeparture[] = [];
    for (const trip of trips) {
      if (!tripsRunning.has(trip.tripId)) continue;
      const stopTimes = this.store.stopTimesForTrip(trip.tripId);
      const at = stopTimes.find((s) => s.stopId === input.station);
      if (!at) continue;
      out.push({
        trainNo: trip.tripId,
        line: route.routeLongName || route.routeShortName,
        departure: gtfsTimeToIso(input.date, at.departureTime),
      });
    }
    out.sort((a, b) => a.departure.localeCompare(b.departure));
    return ok(out);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/unit/core/komuter`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/core/komuter tests/unit/core/komuter
git commit -m "feat(komuter): add KomuterService for line listing and timetable"
```

---

### Task 17: Realtime service

**Files:**
- Create: `src/core/realtime/service.ts`
- Test: `tests/unit/core/realtime/service.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/unit/core/realtime/service.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { RealtimeService } from "../../../../src/core/realtime/service.js";
import { TtlCache } from "../../../../src/core/client/cache.js";
import { ok } from "../../../../src/core/result.js";

describe("RealtimeService", () => {
  it("caches the previous vehicle position list within TTL", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      ok([{ vehicleId: "v1", lat: 3, lon: 101, timestamp: "2026-05-01T08:00:00+08:00" }]),
    );
    const svc = new RealtimeService({
      fetcher: fetchFn,
      cache: new TtlCache({ max: 1, ttlMs: 60_000 }),
    });
    await svc.getPositions();
    await svc.getPositions();
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("filters by routeId", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      ok([
        { vehicleId: "v1", routeId: "ETS-N", lat: 3, lon: 101, timestamp: "2026-05-01T08:00:00+08:00" },
        { vehicleId: "v2", routeId: "KOM-PK", lat: 3, lon: 101, timestamp: "2026-05-01T08:00:00+08:00" },
      ]),
    );
    const svc = new RealtimeService({
      fetcher: fetchFn,
      cache: new TtlCache({ max: 1, ttlMs: 60_000 }),
    });
    const r = await svc.getPositions({ routeId: "KOM-PK" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.map((v) => v.vehicleId)).toEqual(["v2"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/core/realtime`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`src/core/realtime/service.ts`:

```ts
import type { Result } from "../result.js";
import { ok } from "../result.js";
import type { TtlCache } from "../client/cache.js";
import type { VehiclePosition } from "../types.js";

export type RealtimeFetcher = () => Promise<Result<VehiclePosition[]>>;

export type RealtimeServiceOptions = {
  fetcher: RealtimeFetcher;
  cache: TtlCache<readonly VehiclePosition[]>;
};

export class RealtimeService {
  private static readonly KEY = "vehicles";
  constructor(private readonly opts: RealtimeServiceOptions) {}

  async getPositions(
    filter: { routeId?: string } = {},
  ): Promise<Result<readonly VehiclePosition[]>> {
    const cached = this.opts.cache.get(RealtimeService.KEY);
    if (cached) return ok(this.applyFilter(cached, filter));
    const r = await this.opts.fetcher();
    if (!r.ok) return r;
    this.opts.cache.set(RealtimeService.KEY, r.data);
    return ok(this.applyFilter(r.data, filter));
  }

  private applyFilter(
    list: readonly VehiclePosition[],
    f: { routeId?: string },
  ): readonly VehiclePosition[] {
    if (!f.routeId) return list;
    return list.filter((v) => v.routeId === f.routeId);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/unit/core/realtime`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add src/core/realtime tests/unit/core/realtime
git commit -m "feat(realtime): add RealtimeService with 15s TTL and routeId filter"
```

---

### Task 18: Public library facade

**Files:**
- Create: `src/core/index.ts`
- Modify: `src/index.ts`
- Test: `tests/unit/core/facade.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/unit/core/facade.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createKtmb } from "../../../src/core/index.js";
import { GtfsStore } from "../../../src/core/gtfs/store.js";
import { parseStaticFeed } from "../../../src/core/gtfs/static-parser.js";
import { ok } from "../../../src/core/result.js";
import { buildMiniFeed } from "./gtfs/_make-fixture.js";
import type { TrainClass, VehiclePosition } from "../../../src/core/types.js";

const fakeKtmb = async (): Promise<{ ok: true; data: TrainClass[] }> => ok([]);
const fakeRt = async (): Promise<{ ok: true; data: VehiclePosition[] }> => ok([]);

describe("createKtmb facade", () => {
  it("wires services around an injected GtfsStore", async () => {
    const ktmb = createKtmb({
      store: new GtfsStore(parseStaticFeed(buildMiniFeed())),
      fareGetter: fakeKtmb,
      realtimeFetcher: fakeRt,
    });
    expect(ktmb.stations.getByCode("KUL")?.code).toBe("KUL");
    const sched = ktmb.schedules.listSchedules({ from: "KUL", to: "BTW", date: "2026-05-01" });
    expect(sched.ok).toBe(true);
    const fares = await ktmb.fares.get({
      from: "KUL",
      to: "BTW",
      date: "2026-05-01",
      trainNo: "EG9322",
    });
    expect(fares.ok).toBe(true);
    const lines = ktmb.komuter.listLines();
    expect(lines.ok).toBe(true);
    const rt = await ktmb.realtime.getPositions();
    expect(rt.ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/core/facade.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementations**

`src/core/index.ts`:

```ts
import { TtlCache } from "./client/cache.js";
import type { GtfsStore } from "./gtfs/store.js";
import { KomuterService } from "./komuter/service.js";
import { FareAvailabilityService } from "./schedules/fare-availability.js";
import type { FareGetter } from "./schedules/fare-availability.js";
import { SchedulesService } from "./schedules/service.js";
import { StationsService } from "./stations/service.js";
import { RealtimeService } from "./realtime/service.js";
import type { RealtimeFetcher } from "./realtime/service.js";
import type { TrainClass, VehiclePosition } from "./types.js";

export * from "./types.js";
export * from "./result.js";
export { GtfsStore } from "./gtfs/store.js";
export { GtfsLoader } from "./gtfs/loader.js";
export { parseStaticFeed } from "./gtfs/static-parser.js";
export { fetchVehiclePositions } from "./gtfs/realtime.js";
export { getAvailability as ktmbGetAvailability } from "./ktmb/client.js";

export type Ktmb = {
  stations: StationsService;
  schedules: SchedulesService;
  fares: FareAvailabilityService;
  komuter: KomuterService;
  realtime: RealtimeService;
};

export type CreateKtmbOptions = {
  store: GtfsStore;
  fareGetter: FareGetter;
  realtimeFetcher: RealtimeFetcher;
  fareCacheTtlMs?: number;
  realtimeCacheTtlMs?: number;
};

export const createKtmb = (opts: CreateKtmbOptions): Ktmb => {
  const fareCache = new TtlCache<readonly TrainClass[]>({
    max: 256,
    ttlMs: opts.fareCacheTtlMs ?? 30_000,
  });
  const realtimeCache = new TtlCache<readonly VehiclePosition[]>({
    max: 1,
    ttlMs: opts.realtimeCacheTtlMs ?? 15_000,
  });
  return {
    stations: new StationsService(opts.store),
    schedules: new SchedulesService(opts.store),
    fares: new FareAvailabilityService({ getter: opts.fareGetter, cache: fareCache }),
    komuter: new KomuterService(opts.store),
    realtime: new RealtimeService({ fetcher: opts.realtimeFetcher, cache: realtimeCache }),
  };
};
```

`src/index.ts`:

```ts
export * from "./core/index.js";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/unit/core/facade.test.ts`
Expected: PASS, 1 test.

- [ ] **Step 5: Commit**

```bash
git add src/core/index.ts src/index.ts tests/unit/core/facade.test.ts
git commit -m "feat(core): expose createKtmb facade wiring services around store and fetchers"
```

---

## Phase 5 — REST API

### Task 19: Hono app skeleton + envelope helpers

**Files:**
- Create: `src/api/envelope.ts`
- Create: `src/api/errors.ts`
- Create: `src/api/server.ts`
- Test: `tests/unit/api/envelope.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/unit/api/envelope.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { okResponse, errorResponse, statusForError } from "../../../src/api/envelope.js";

describe("REST envelope helpers", () => {
  it("okResponse wraps data", async () => {
    const r = okResponse({ a: 1 });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, data: { a: 1 } });
  });

  it("errorResponse uses correct status per code", async () => {
    const cases: Array<[Parameters<typeof errorResponse>[0], number]> = [
      ["invalid_input", 400],
      ["not_found", 404],
      ["rate_limited", 429],
      ["upstream_error", 502],
      ["parse_error", 502],
    ];
    for (const [code, expected] of cases) {
      const r = errorResponse(code, "x");
      expect(r.status).toBe(expected);
      expect(statusForError(code)).toBe(expected);
      expect(await r.json()).toEqual({ ok: false, error: { code, message: "x" } });
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/api/envelope.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementations**

`src/api/envelope.ts`:

```ts
import type { ErrorCode } from "../core/result.js";

export const statusForError = (code: ErrorCode): number => {
  switch (code) {
    case "invalid_input":
      return 400;
    case "not_found":
      return 404;
    case "rate_limited":
      return 429;
    case "upstream_error":
    case "parse_error":
      return 502;
  }
};

export const okResponse = <T>(data: T, status = 200): Response =>
  new Response(JSON.stringify({ ok: true, data }), {
    status,
    headers: { "content-type": "application/json" },
  });

export const errorResponse = (code: ErrorCode, message: string, cause?: unknown): Response =>
  new Response(
    JSON.stringify({
      ok: false,
      error: cause === undefined ? { code, message } : { code, message, cause },
    }),
    { status: statusForError(code), headers: { "content-type": "application/json" } },
  );
```

`src/api/errors.ts`:

```ts
import type { Context } from "hono";
import { errorResponse } from "./envelope.js";

export const onError = (e: unknown, _c: Context): Response => {
  console.error("[api] unhandled", e);
  return errorResponse("upstream_error", "internal error");
};
```

`src/api/server.ts`:

```ts
import { Hono } from "hono";
import type { Ktmb } from "../core/index.js";
import { onError } from "./errors.js";

export const buildApp = (ktmb: Ktmb): Hono => {
  const app = new Hono();
  app.onError(onError);
  app.notFound(
    () =>
      new Response(
        JSON.stringify({ ok: false, error: { code: "not_found", message: "no such route" } }),
        { status: 404, headers: { "content-type": "application/json" } },
      ),
  );
  app.get("/healthz", (c) => c.json({ ok: true, data: { status: "ok" } }));
  return app;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/unit/api/envelope.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add src/api tests/unit/api
git commit -m "feat(api): add Hono app skeleton with envelope helpers and error handler"
```

---

### Task 20: Stations + schedules + availability routes

**Files:**
- Create: `src/api/routes/stations.ts`
- Create: `src/api/routes/schedules.ts`
- Modify: `src/api/server.ts` (mount routers)
- Test: `tests/integration/api/routes.test.ts`

- [ ] **Step 1: Write the failing integration test**

`tests/integration/api/routes.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildApp } from "../../../src/api/server.js";
import { createKtmb } from "../../../src/core/index.js";
import { GtfsStore } from "../../../src/core/gtfs/store.js";
import { parseStaticFeed } from "../../../src/core/gtfs/static-parser.js";
import { ok } from "../../../src/core/result.js";
import { buildMiniFeed } from "../../unit/core/gtfs/_make-fixture.js";

const ktmb = createKtmb({
  store: new GtfsStore(parseStaticFeed(buildMiniFeed())),
  fareGetter: async () =>
    ok([
      {
        className: "Premier",
        fare: { className: "Premier", priceMinor: 5500, currency: "MYR", seatsLeft: 12 },
      },
    ]),
  realtimeFetcher: async () => ok([]),
});
const app = buildApp(ktmb);

describe("REST routes", () => {
  it("GET /v1/stations?q=KL returns matches", async () => {
    const res = await app.request("/v1/stations?q=KL");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: true; data: Array<{ code: string }> };
    expect(body.ok).toBe(true);
    expect(body.data.find((s) => s.code === "KUL")).toBeDefined();
  });

  it("GET /v1/stations/:id returns the station", async () => {
    const res = await app.request("/v1/stations/KUL");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { nameEn: string } };
    expect(body.data.nameEn).toBe("KL Sentral");
  });

  it("GET /v1/stations/:id 404s for unknown", async () => {
    const res = await app.request("/v1/stations/XXX");
    expect(res.status).toBe(404);
  });

  it("GET /v1/schedules returns trains for the date", async () => {
    const res = await app.request("/v1/schedules?from=KUL&to=BTW&date=2026-05-01");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Array<{ trainNo: string }> };
    expect(body.data.find((t) => t.trainNo === "EG9322")).toBeDefined();
  });

  it("GET /v1/schedules requires from/to/date", async () => {
    const res = await app.request("/v1/schedules?from=KUL");
    expect(res.status).toBe(400);
  });

  it("GET /v1/schedules/:trainNo/availability returns fare classes", async () => {
    const res = await app.request(
      "/v1/schedules/EG9322/availability?from=KUL&to=BTW&date=2026-05-01",
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Array<{ className: string }> };
    expect(body.data[0]?.className).toBe("Premier");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/integration/api/routes.test.ts`
Expected: FAIL — routes not mounted.

- [ ] **Step 3: Write the implementations**

`src/api/routes/stations.ts`:

```ts
import { Hono } from "hono";
import type { Ktmb } from "../../core/index.js";
import { errorResponse, okResponse } from "../envelope.js";

export const buildStationsRouter = (ktmb: Ktmb): Hono => {
  const r = new Hono();
  r.get("/", (c) => {
    const q = c.req.query("q") ?? "";
    return okResponse(ktmb.stations.search(q));
  });
  r.get("/:id", (c) => {
    const id = c.req.param("id");
    const s = ktmb.stations.getByCode(id);
    if (!s) return errorResponse("not_found", `unknown station: ${id}`);
    return okResponse(s);
  });
  return r;
};
```

`src/api/routes/schedules.ts`:

```ts
import { Hono } from "hono";
import { z } from "zod";
import type { Ktmb } from "../../core/index.js";
import { errorResponse, okResponse } from "../envelope.js";
import { parseDateMyt } from "../../core/time/parse-date.js";

const ListQuery = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  date: z.string().min(1),
});

const AvailabilityQuery = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  date: z.string().min(1),
});

export const buildSchedulesRouter = (ktmb: Ktmb): Hono => {
  const r = new Hono();
  r.get("/", (c) => {
    const parsed = ListQuery.safeParse({
      from: c.req.query("from"),
      to: c.req.query("to"),
      date: c.req.query("date"),
    });
    if (!parsed.success) return errorResponse("invalid_input", "missing from/to/date");
    const date = parseDateMyt(parsed.data.date, new Date());
    if (!date.ok) return errorResponse(date.error.code, date.error.message);
    const result = ktmb.schedules.listSchedules({
      from: parsed.data.from.toUpperCase(),
      to: parsed.data.to.toUpperCase(),
      date: date.data,
    });
    return result.ok
      ? okResponse(result.data)
      : errorResponse(result.error.code, result.error.message);
  });
  r.get("/:trainNo/availability", async (c) => {
    const trainNo = c.req.param("trainNo");
    const parsed = AvailabilityQuery.safeParse({
      from: c.req.query("from"),
      to: c.req.query("to"),
      date: c.req.query("date"),
    });
    if (!parsed.success) return errorResponse("invalid_input", "missing from/to/date");
    const date = parseDateMyt(parsed.data.date, new Date());
    if (!date.ok) return errorResponse(date.error.code, date.error.message);
    const r2 = await ktmb.fares.get({
      from: parsed.data.from.toUpperCase(),
      to: parsed.data.to.toUpperCase(),
      date: date.data,
      trainNo,
    });
    return r2.ok ? okResponse(r2.data) : errorResponse(r2.error.code, r2.error.message);
  });
  return r;
};
```

Update `src/api/server.ts` to mount both routers (place imports near the top, mount calls before `return app`):

```ts
import { Hono } from "hono";
import type { Ktmb } from "../core/index.js";
import { onError } from "./errors.js";
import { buildSchedulesRouter } from "./routes/schedules.js";
import { buildStationsRouter } from "./routes/stations.js";

export const buildApp = (ktmb: Ktmb): Hono => {
  const app = new Hono();
  app.onError(onError);
  app.notFound(
    () =>
      new Response(
        JSON.stringify({ ok: false, error: { code: "not_found", message: "no such route" } }),
        { status: 404, headers: { "content-type": "application/json" } },
      ),
  );
  app.get("/healthz", (c) => c.json({ ok: true, data: { status: "ok" } }));
  app.route("/v1/stations", buildStationsRouter(ktmb));
  app.route("/v1/schedules", buildSchedulesRouter(ktmb));
  return app;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/integration/api/routes.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/api tests/integration/api
git commit -m "feat(api): mount /v1/stations and /v1/schedules routes with date parsing"
```

---

### Task 21: Komuter + realtime routes

**Files:**
- Create: `src/api/routes/komuter.ts`
- Create: `src/api/routes/realtime.ts`
- Modify: `src/api/server.ts`
- Modify: `tests/integration/api/routes.test.ts`

- [ ] **Step 1: Extend the failing test**

Append to `tests/integration/api/routes.test.ts`:

```ts
describe("Komuter + realtime routes", () => {
  it("GET /v1/komuter/lines returns lines", async () => {
    const res = await app.request("/v1/komuter/lines");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Array<{ lineId: string }> };
    expect(body.data.find((l) => l.lineId === "KOM-PK")).toBeDefined();
  });

  it("GET /v1/komuter/lines/:line/timetable returns departures", async () => {
    const res = await app.request("/v1/komuter/lines/KOM-PK/timetable?station=KUL&date=2026-05-01");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Array<{ trainNo: string }> };
    expect(body.data.length).toBeGreaterThan(0);
  });

  it("GET /v1/realtime/vehicles returns the (empty) list", async () => {
    const res = await app.request("/v1/realtime/vehicles");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: unknown[] };
    expect(Array.isArray(body.data)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/integration/api/routes.test.ts`
Expected: FAIL on the new tests.

- [ ] **Step 3: Write the implementations**

`src/api/routes/komuter.ts`:

```ts
import { Hono } from "hono";
import { z } from "zod";
import type { Ktmb } from "../../core/index.js";
import { errorResponse, okResponse } from "../envelope.js";
import { parseDateMyt } from "../../core/time/parse-date.js";

const TimetableQuery = z.object({ station: z.string().min(1), date: z.string().min(1) });

export const buildKomuterRouter = (ktmb: Ktmb): Hono => {
  const r = new Hono();
  r.get("/lines", () => {
    const r2 = ktmb.komuter.listLines();
    return r2.ok ? okResponse(r2.data) : errorResponse(r2.error.code, r2.error.message);
  });
  r.get("/lines/:line/timetable", (c) => {
    const line = c.req.param("line");
    const parsed = TimetableQuery.safeParse({
      station: c.req.query("station"),
      date: c.req.query("date"),
    });
    if (!parsed.success) return errorResponse("invalid_input", "missing station/date");
    const date = parseDateMyt(parsed.data.date, new Date());
    if (!date.ok) return errorResponse(date.error.code, date.error.message);
    const r2 = ktmb.komuter.getTimetable({
      line,
      station: parsed.data.station.toUpperCase(),
      date: date.data,
    });
    return r2.ok ? okResponse(r2.data) : errorResponse(r2.error.code, r2.error.message);
  });
  return r;
};
```

`src/api/routes/realtime.ts`:

```ts
import { Hono } from "hono";
import type { Ktmb } from "../../core/index.js";
import { errorResponse, okResponse } from "../envelope.js";

export const buildRealtimeRouter = (ktmb: Ktmb): Hono => {
  const r = new Hono();
  r.get("/vehicles", async (c) => {
    const route = c.req.query("route") ?? undefined;
    const r2 = await ktmb.realtime.getPositions({ ...(route ? { routeId: route } : {}) });
    return r2.ok ? okResponse(r2.data) : errorResponse(r2.error.code, r2.error.message);
  });
  return r;
};
```

Update `src/api/server.ts` to mount both:

```ts
import { Hono } from "hono";
import type { Ktmb } from "../core/index.js";
import { onError } from "./errors.js";
import { buildKomuterRouter } from "./routes/komuter.js";
import { buildRealtimeRouter } from "./routes/realtime.js";
import { buildSchedulesRouter } from "./routes/schedules.js";
import { buildStationsRouter } from "./routes/stations.js";

export const buildApp = (ktmb: Ktmb): Hono => {
  const app = new Hono();
  app.onError(onError);
  app.notFound(
    () =>
      new Response(
        JSON.stringify({ ok: false, error: { code: "not_found", message: "no such route" } }),
        { status: 404, headers: { "content-type": "application/json" } },
      ),
  );
  app.get("/healthz", (c) => c.json({ ok: true, data: { status: "ok" } }));
  app.route("/v1/stations", buildStationsRouter(ktmb));
  app.route("/v1/schedules", buildSchedulesRouter(ktmb));
  app.route("/v1/komuter", buildKomuterRouter(ktmb));
  app.route("/v1/realtime", buildRealtimeRouter(ktmb));
  return app;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/integration/api/routes.test.ts`
Expected: PASS — all REST tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/api tests/integration/api
git commit -m "feat(api): mount /v1/komuter and /v1/realtime routes"
```

---

## Phase 6 — MCP server

### Task 22: MCP stdio server with six tools

**Files:**
- Create: `src/mcp/tools/search-stations.ts`
- Create: `src/mcp/tools/list-schedules.ts`
- Create: `src/mcp/tools/get-fare-availability.ts`
- Create: `src/mcp/tools/list-komuter-lines.ts`
- Create: `src/mcp/tools/get-komuter-timetable.ts`
- Create: `src/mcp/tools/get-vehicle-positions.ts`
- Create: `src/mcp/server.ts`
- Test: `tests/integration/mcp/tools.test.ts`

> Tests target the exported handler factories directly (`searchStationsHandler(ktmb)`), so we exercise the same code path the MCP SDK invokes without spinning up a stdio process.

- [ ] **Step 1: Write the failing integration test**

`tests/integration/mcp/tools.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createKtmb } from "../../../src/core/index.js";
import { GtfsStore } from "../../../src/core/gtfs/store.js";
import { parseStaticFeed } from "../../../src/core/gtfs/static-parser.js";
import { ok } from "../../../src/core/result.js";
import { buildMiniFeed } from "../../unit/core/gtfs/_make-fixture.js";
import { searchStationsHandler } from "../../../src/mcp/tools/search-stations.js";
import { listSchedulesHandler } from "../../../src/mcp/tools/list-schedules.js";
import { getFareAvailabilityHandler } from "../../../src/mcp/tools/get-fare-availability.js";
import { listKomuterLinesHandler } from "../../../src/mcp/tools/list-komuter-lines.js";
import { getKomuterTimetableHandler } from "../../../src/mcp/tools/get-komuter-timetable.js";
import { getVehiclePositionsHandler } from "../../../src/mcp/tools/get-vehicle-positions.js";

const ktmb = createKtmb({
  store: new GtfsStore(parseStaticFeed(buildMiniFeed())),
  fareGetter: async () =>
    ok([
      {
        className: "Premier",
        fare: { className: "Premier", priceMinor: 5500, currency: "MYR", seatsLeft: 12 },
      },
    ]),
  realtimeFetcher: async () => ok([]),
});

const text = (r: { content: Array<{ type: string; text: string }> }): unknown =>
  JSON.parse(r.content[0]!.text);

describe("MCP tool handlers", () => {
  it("search_stations returns matches", async () => {
    const r = await searchStationsHandler(ktmb)({ query: "KL" });
    const body = text(r) as { ok: true; data: Array<{ code: string }> };
    expect(body.ok).toBe(true);
    expect(body.data.find((s) => s.code === "KUL")).toBeDefined();
  });

  it("list_schedules returns trains", async () => {
    const r = await listSchedulesHandler(ktmb)({ from: "KUL", to: "BTW", date: "2026-05-01" });
    const body = text(r) as { data: Array<{ trainNo: string }> };
    expect(body.data.find((t) => t.trainNo === "EG9322")).toBeDefined();
  });

  it("get_fare_availability returns fare classes", async () => {
    const r = await getFareAvailabilityHandler(ktmb)({
      from: "KUL",
      to: "BTW",
      date: "2026-05-01",
      trainNo: "EG9322",
    });
    const body = text(r) as { data: Array<{ className: string }> };
    expect(body.data[0]?.className).toBe("Premier");
  });

  it("list_komuter_lines lists Komuter routes", async () => {
    const r = await listKomuterLinesHandler(ktmb)({});
    const body = text(r) as { data: Array<{ lineId: string }> };
    expect(body.data.find((l) => l.lineId === "KOM-PK")).toBeDefined();
  });

  it("get_komuter_timetable returns departures", async () => {
    const r = await getKomuterTimetableHandler(ktmb)({
      line: "KOM-PK",
      station: "KUL",
      date: "2026-05-01",
    });
    const body = text(r) as { data: Array<{ trainNo: string }> };
    expect(body.data.length).toBeGreaterThan(0);
  });

  it("get_vehicle_positions returns the (empty) list", async () => {
    const r = await getVehiclePositionsHandler(ktmb)({});
    const body = text(r) as { data: unknown[] };
    expect(Array.isArray(body.data)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/integration/mcp/tools.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write the tool handler files**

`src/mcp/tools/search-stations.ts`:

```ts
import { z } from "zod";
import type { Ktmb } from "../../core/index.js";

export const SearchStationsInput = z.object({
  query: z.string().describe("Station name or code (fuzzy)").min(1),
  limit: z.number().int().positive().max(50).optional(),
});
export type SearchStationsArgs = z.infer<typeof SearchStationsInput>;

export const searchStationsHandler =
  (ktmb: Ktmb) =>
  async (args: SearchStationsArgs) => ({
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ ok: true, data: ktmb.stations.search(args.query, args.limit) }),
      },
    ],
  });
```

`src/mcp/tools/list-schedules.ts`:

```ts
import { z } from "zod";
import type { Ktmb } from "../../core/index.js";
import { parseDateMyt } from "../../core/time/parse-date.js";

export const ListSchedulesInput = z.object({
  from: z.string().describe("Origin station code or name"),
  to: z.string().describe("Destination station code or name"),
  date: z
    .string()
    .describe("Departure date — ISO YYYY-MM-DD or natural language ('tomorrow')"),
});
export type ListSchedulesArgs = z.infer<typeof ListSchedulesInput>;

const resolve = (ktmb: Ktmb, input: string): string | undefined => {
  const direct = ktmb.stations.getByCode(input);
  if (direct) return direct.code;
  const top = ktmb.stations.search(input, 1)[0];
  return top?.code;
};

export const listSchedulesHandler =
  (ktmb: Ktmb) =>
  async (args: ListSchedulesArgs) => {
    const from = resolve(ktmb, args.from);
    const to = resolve(ktmb, args.to);
    if (!from || !to) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              ok: false,
              error: { code: "not_found", message: "could not resolve station" },
            }),
          },
        ],
        isError: true,
      };
    }
    const d = parseDateMyt(args.date, new Date());
    if (!d.ok) {
      return { content: [{ type: "text" as const, text: JSON.stringify(d) }], isError: true };
    }
    const r = ktmb.schedules.listSchedules({ from, to, date: d.data });
    return { content: [{ type: "text" as const, text: JSON.stringify(r) }], isError: !r.ok };
  };
```

`src/mcp/tools/get-fare-availability.ts`:

```ts
import { z } from "zod";
import type { Ktmb } from "../../core/index.js";
import { parseDateMyt } from "../../core/time/parse-date.js";

export const GetFareAvailabilityInput = z.object({
  from: z.string(),
  to: z.string(),
  date: z.string(),
  trainNo: z.string(),
});
export type GetFareAvailabilityArgs = z.infer<typeof GetFareAvailabilityInput>;

const resolve = (ktmb: Ktmb, input: string): string | undefined =>
  ktmb.stations.getByCode(input)?.code ?? ktmb.stations.search(input, 1)[0]?.code;

export const getFareAvailabilityHandler =
  (ktmb: Ktmb) =>
  async (args: GetFareAvailabilityArgs) => {
    const fromCode = resolve(ktmb, args.from);
    const toCode = resolve(ktmb, args.to);
    if (!fromCode || !toCode) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              ok: false,
              error: { code: "not_found", message: "station not resolved" },
            }),
          },
        ],
        isError: true,
      };
    }
    const d = parseDateMyt(args.date, new Date());
    if (!d.ok) {
      return { content: [{ type: "text" as const, text: JSON.stringify(d) }], isError: true };
    }
    const r = await ktmb.fares.get({
      from: fromCode,
      to: toCode,
      date: d.data,
      trainNo: args.trainNo,
    });
    return { content: [{ type: "text" as const, text: JSON.stringify(r) }], isError: !r.ok };
  };
```

`src/mcp/tools/list-komuter-lines.ts`:

```ts
import { z } from "zod";
import type { Ktmb } from "../../core/index.js";

export const ListKomuterLinesInput = z.object({});
export type ListKomuterLinesArgs = z.infer<typeof ListKomuterLinesInput>;

export const listKomuterLinesHandler =
  (ktmb: Ktmb) =>
  async (_args: ListKomuterLinesArgs) => {
    const r = ktmb.komuter.listLines();
    return { content: [{ type: "text" as const, text: JSON.stringify(r) }], isError: !r.ok };
  };
```

`src/mcp/tools/get-komuter-timetable.ts`:

```ts
import { z } from "zod";
import type { Ktmb } from "../../core/index.js";
import { parseDateMyt } from "../../core/time/parse-date.js";

export const GetKomuterTimetableInput = z.object({
  line: z.string(),
  station: z.string(),
  date: z.string(),
});
export type GetKomuterTimetableArgs = z.infer<typeof GetKomuterTimetableInput>;

export const getKomuterTimetableHandler =
  (ktmb: Ktmb) =>
  async (args: GetKomuterTimetableArgs) => {
    const station =
      ktmb.stations.getByCode(args.station)?.code ??
      ktmb.stations.search(args.station, 1)[0]?.code;
    if (!station) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              ok: false,
              error: { code: "not_found", message: "station not resolved" },
            }),
          },
        ],
        isError: true,
      };
    }
    const d = parseDateMyt(args.date, new Date());
    if (!d.ok) {
      return { content: [{ type: "text" as const, text: JSON.stringify(d) }], isError: true };
    }
    const r = ktmb.komuter.getTimetable({ line: args.line, station, date: d.data });
    return { content: [{ type: "text" as const, text: JSON.stringify(r) }], isError: !r.ok };
  };
```

`src/mcp/tools/get-vehicle-positions.ts`:

```ts
import { z } from "zod";
import type { Ktmb } from "../../core/index.js";

export const GetVehiclePositionsInput = z.object({
  routeId: z.string().optional(),
});
export type GetVehiclePositionsArgs = z.infer<typeof GetVehiclePositionsInput>;

export const getVehiclePositionsHandler =
  (ktmb: Ktmb) =>
  async (args: GetVehiclePositionsArgs) => {
    const r = await ktmb.realtime.getPositions(args.routeId ? { routeId: args.routeId } : {});
    return { content: [{ type: "text" as const, text: JSON.stringify(r) }], isError: !r.ok };
  };
```

`src/mcp/server.ts`:

```ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { Ktmb } from "../core/index.js";
import {
  GetFareAvailabilityInput,
  getFareAvailabilityHandler,
} from "./tools/get-fare-availability.js";
import {
  GetKomuterTimetableInput,
  getKomuterTimetableHandler,
} from "./tools/get-komuter-timetable.js";
import {
  GetVehiclePositionsInput,
  getVehiclePositionsHandler,
} from "./tools/get-vehicle-positions.js";
import {
  ListKomuterLinesInput,
  listKomuterLinesHandler,
} from "./tools/list-komuter-lines.js";
import { ListSchedulesInput, listSchedulesHandler } from "./tools/list-schedules.js";
import { SearchStationsInput, searchStationsHandler } from "./tools/search-stations.js";

export const buildMcpServer = (ktmb: Ktmb): McpServer => {
  const server = new McpServer({ name: "ktmb", version: "0.1.0" });
  server.tool(
    "search_stations",
    "Fuzzy-search KTMB stations by code or name",
    SearchStationsInput.shape,
    searchStationsHandler(ktmb),
  );
  server.tool(
    "list_schedules",
    "List ETS / Intercity / Shuttle Tebrau trains for a date and OD pair",
    ListSchedulesInput.shape,
    listSchedulesHandler(ktmb),
  );
  server.tool(
    "get_fare_availability",
    "Get per-class fare and seat availability for a specific train",
    GetFareAvailabilityInput.shape,
    getFareAvailabilityHandler(ktmb),
  );
  server.tool(
    "list_komuter_lines",
    "List KTM Komuter lines",
    ListKomuterLinesInput.shape,
    listKomuterLinesHandler(ktmb),
  );
  server.tool(
    "get_komuter_timetable",
    "Get KTM Komuter departures for a line/station/date",
    GetKomuterTimetableInput.shape,
    getKomuterTimetableHandler(ktmb),
  );
  server.tool(
    "get_vehicle_positions",
    "Live vehicle positions from GTFS Realtime, optionally filtered by routeId",
    GetVehiclePositionsInput.shape,
    getVehiclePositionsHandler(ktmb),
  );
  return server;
};

export const runStdio = async (server: McpServer): Promise<void> => {
  const transport = new StdioServerTransport();
  await server.connect(transport);
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/integration/mcp/tools.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/mcp tests/integration/mcp
git commit -m "feat(mcp): add stdio MCP server with six tool handlers"
```

---

## Phase 7 — Distribution

### Task 23: bin entry points

**Files:**
- Create: `bin/ktmb-mcp.ts`
- Create: `bin/ktmb-api.ts`

- [ ] **Step 1: Write the bin entry points**

`bin/ktmb-mcp.ts`:

```ts
import { GtfsLoader } from "../src/core/gtfs/loader.js";
import { fetchVehiclePositions } from "../src/core/gtfs/realtime.js";
import { ktmbGetAvailability } from "../src/core/index.js";
import { createKtmb } from "../src/core/index.js";
import { buildMcpServer, runStdio } from "../src/mcp/server.js";

const FEED_STATIC = "https://api.data.gov.my/gtfs-static/ktmb";
const FEED_RT = "https://api.data.gov.my/gtfs-realtime/vehicle-position/ktmb";

const main = async (): Promise<void> => {
  const loader = new GtfsLoader(FEED_STATIC);
  const r = await loader.load();
  if (!r.ok) {
    console.error("[ktmb-mcp] initial GTFS load failed:", r.error);
    process.exit(1);
  }
  const ktmb = createKtmb({
    store: r.data,
    fareGetter: ktmbGetAvailability,
    realtimeFetcher: () => fetchVehiclePositions(FEED_RT),
  });
  const server = buildMcpServer(ktmb);
  await runStdio(server);
};

main().catch((e) => {
  console.error("[ktmb-mcp]", e);
  process.exit(1);
});
```

`bin/ktmb-api.ts`:

```ts
import { serve } from "@hono/node-server";
import { GtfsLoader } from "../src/core/gtfs/loader.js";
import { fetchVehiclePositions } from "../src/core/gtfs/realtime.js";
import { ktmbGetAvailability } from "../src/core/index.js";
import { createKtmb } from "../src/core/index.js";
import { buildApp } from "../src/api/server.js";

const FEED_STATIC = "https://api.data.gov.my/gtfs-static/ktmb";
const FEED_RT = "https://api.data.gov.my/gtfs-realtime/vehicle-position/ktmb";

const main = async (): Promise<void> => {
  const port = Number(process.env.PORT ?? 8787);
  const loader = new GtfsLoader(FEED_STATIC);
  const r = await loader.load();
  if (!r.ok) {
    console.error("[ktmb-api] initial GTFS load failed:", r.error);
    process.exit(1);
  }
  const ktmb = createKtmb({
    store: r.data,
    fareGetter: ktmbGetAvailability,
    realtimeFetcher: () => fetchVehiclePositions(FEED_RT),
  });
  const app = buildApp(ktmb);
  serve({ fetch: app.fetch, port });
  console.log(`[ktmb-api] listening on http://localhost:${port}`);
};

main().catch((e) => {
  console.error("[ktmb-api]", e);
  process.exit(1);
});
```

- [ ] **Step 2: Verify build succeeds**

Run: `pnpm build`
Expected: produces `dist/index.{js,cjs}`, `dist/bin/ktmb-mcp.js`, `dist/bin/ktmb-api.js`, and `dist/index.d.ts`. No errors.

- [ ] **Step 3: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add bin
git commit -m "feat(bin): add ktmb-mcp and ktmb-api entry points"
```

---

### Task 24: Smoke tests against real feeds

**Files:**
- Create: `tests/smoke/gtfs.test.ts`

- [ ] **Step 1: Write the smoke test**

`tests/smoke/gtfs.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { GtfsLoader } from "../../src/core/gtfs/loader.js";
import { fetchVehiclePositions } from "../../src/core/gtfs/realtime.js";

const SMOKE = process.env.KTMB_SMOKE === "1";

describe.skipIf(!SMOKE)("real GTFS feeds", () => {
  it("static feed downloads and parses", async () => {
    const loader = new GtfsLoader("https://api.data.gov.my/gtfs-static/ktmb");
    const r = await loader.load();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.listStops().length).toBeGreaterThan(0);
    expect(r.data.listRoutes().length).toBeGreaterThan(0);
  }, 30_000);

  it("realtime feed decodes", async () => {
    const r = await fetchVehiclePositions(
      "https://api.data.gov.my/gtfs-realtime/vehicle-position/ktmb",
    );
    expect(r.ok).toBe(true);
  }, 30_000);
});
```

- [ ] **Step 2: Run with env set (manual, network)**

Run: `KTMB_SMOKE=1 pnpm vitest run tests/smoke/gtfs.test.ts`
Expected: PASS when network is available. The default `pnpm test` skips this.

- [ ] **Step 3: Verify default test run still skips smoke**

Run: `pnpm test`
Expected: smoke tests are reported as skipped, not failing.

- [ ] **Step 4: Commit**

```bash
git add tests/smoke
git commit -m "test(smoke): add KTMB_SMOKE-gated checks against live GTFS feeds"
```

---

### Task 25: README + CI

**Files:**
- Modify: `README.md`
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Replace `README.md`**

```markdown
# ktmb

Read-only TypeScript library, REST API, and MCP server for KTMB rail data.

> **Unofficial.** Not affiliated with Keretapi Tanah Melayu Berhad.
> Schedules and station data come from Malaysia's Open Data Portal
> (`data.gov.my`) GTFS feeds. Fares and seat availability come from the
> public KTMB booking site (`online.ktmb.com.my`) — used politely, with
> conservative caching and an honest User-Agent. Do not deploy as a public
> proxy without adding your own rate limiting.

## Install

```bash
npm i ktmb
# or run directly
npx ktmb-mcp     # MCP stdio server
npx ktmb-api     # REST server on PORT (default 8787)
```

## Library

```ts
import { GtfsLoader, createKtmb, ktmbGetAvailability, fetchVehiclePositions } from "ktmb";

const loader = new GtfsLoader("https://api.data.gov.my/gtfs-static/ktmb");
const r = await loader.load();
if (!r.ok) throw new Error(r.error.message);

const ktmb = createKtmb({
  store: r.data,
  fareGetter: ktmbGetAvailability,
  realtimeFetcher: () =>
    fetchVehiclePositions("https://api.data.gov.my/gtfs-realtime/vehicle-position/ktmb"),
});

const stations = ktmb.stations.search("KL");
const trains = ktmb.schedules.listSchedules({ from: "KUL", to: "BTW", date: "2026-05-01" });
```

## REST endpoints

```
GET /v1/stations?q=KL
GET /v1/stations/:id
GET /v1/schedules?from=…&to=…&date=…
GET /v1/schedules/:trainNo/availability?from=…&to=…&date=…
GET /v1/komuter/lines
GET /v1/komuter/lines/:line/timetable?station=…&date=…
GET /v1/realtime/vehicles?route=…
```

All responses use `{ ok: true, data }` or `{ ok: false, error: { code, message } }`.

## MCP tools

`search_stations`, `list_schedules`, `get_fare_availability`,
`list_komuter_lines`, `get_komuter_timetable`, `get_vehicle_positions`.

Configure in Claude Desktop / Claude Code:

```json
{
  "mcpServers": {
    "ktmb": { "command": "npx", "args": ["ktmb-mcp"] }
  }
}
```

## Notes on cross-border services

- **Shuttle Tebrau** (JB Sentral ↔ Woodlands CIQ): tickets sold via KTMB.
  Dual-currency (MYR / SGD) surfaced on each fare class.
- **Padang Besar**: KTMB ETS terminates at the Malaysia–Thailand border. Onward
  Thai SRT services are out of scope.

## License

MIT.
```

- [ ] **Step 2: Write CI workflow**

`.github/workflows/ci.yml`:

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm test -- --coverage
      - run: pnpm build
```

- [ ] **Step 3: Verify everything passes locally**

Run in parallel:

```bash
pnpm typecheck & pnpm test & pnpm build & wait
```

Expected: all three succeed; coverage ≥ 80% lines.

- [ ] **Step 4: Commit**

```bash
git add README.md .github/workflows/ci.yml
git commit -m "docs+ci: add README and GitHub Actions CI workflow"
```

---

## Self-review checklist

After completing all tasks above, walk through the spec and verify each requirement maps to a task:

| Spec requirement | Task |
|---|---|
| Hybrid data source (Decision #3) | Tasks 7–10 (GTFS) + Tasks 11–12 (KTMB) |
| Single npm package, two bins | Tasks 1, 23 |
| TypeScript Native typecheck (`tsgo`) | Task 1 |
| `tsup` + `tsc --emitDeclarationOnly` build pipeline | Task 1 |
| Result/Error envelope | Task 2 |
| Public Zod schemas | Task 3 |
| MYT date helpers + GTFS+KTMB rollover + chrono parser | Task 4 |
| HTTP client with retries, per-origin concurrency, honest UA | Task 5 |
| TTL/LRU cache + stable cacheKey | Task 6 |
| GTFS Static parser (zip + CSV) | Task 7 |
| GTFS Static indexed store | Task 8 |
| GTFS Static loader with stale-but-serve | Task 9 |
| GTFS-RT vehicle position decoder | Task 10 |
| KTMB endpoint discovery + fixtures | Task 11 |
| KTMB live availability client + Zod parser | Task 12 |
| Fuzzy station search + country overlay | Task 13 |
| Schedules service composing GTFS | Task 14 |
| Fare-availability service with 30s TTL | Task 15 |
| Komuter line listing + timetable | Task 16 |
| Realtime vehicle service with 15s TTL + filter | Task 17 |
| `createKtmb` facade | Task 18 |
| Hono REST app + envelope | Task 19 |
| `/v1/stations` + `/v1/schedules` + availability | Task 20 |
| `/v1/komuter` + `/v1/realtime` | Task 21 |
| MCP stdio with six tools | Task 22 |
| `npx ktmb-mcp`, `npx ktmb-api` bins | Task 23 |
| `KTMB_SMOKE=1` smoke tests | Task 24 |
| README + CI | Task 25 |

**Deferred per spec (post-v1, not in this plan):**
- File-backed GTFS cache.
- HTTP/SSE MCP transport.
- RTS Link integration.
- Daily 02:00 MYT scheduled refresh inside the bins (Task 9 already supports `loader.refresh()` — the bins call `load()` only at startup. Adding the cron is a one-line follow-up, deferred to v1.1).
- GTFS-RT trip updates and service alerts (data.gov.my has not shipped them).

---

## Execution

Plan complete. Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task with two-stage review. Best for keeping main context clean across 25 tasks.
2. **Inline Execution** — execute tasks here using executing-plans, batched with checkpoints for review.

Which approach?
