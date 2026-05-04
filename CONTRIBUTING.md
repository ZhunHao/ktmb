# Contributing to ktmb

Thanks for your interest. ktmb is an unofficial library — we cannot
speak for KTMB or `data.gov.my`. By contributing you agree to the MIT
license in [LICENSE](LICENSE).

## Local setup

```bash
git clone https://github.com/zhunhao/ktmb.git
cd ktmb
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

Use Node 22 (see `.nvmrc`). `package.json` declares `engines.node >=22.19`
because the toolchain (`tsup`, `tsgo`, `vitest@4`) targets Node 22. CI runs
on Node 22 and Node 24.

## Workflow

1. Open an issue first for non-trivial changes — especially anything
   that changes the public Zod schemas in `src/core/types.ts` or the
   `Result<T>` envelope.
2. Branch from `main`. Conventional-commits messages (`feat:`, `fix:`,
   `refactor:`, `test:`, `docs:`, `chore:`, `build:`, `ci:`).
3. TDD: write the failing test, then the minimal implementation. Keep
   coverage ≥ 80% statements / ≥ 80% branches.
4. Run `pnpm typecheck && pnpm test && pnpm build` before pushing.
5. PR description: what changed, why, how it was tested. Link the
   issue. Note any breaking changes in the title with `!` and in the
   body with `BREAKING CHANGE:`.

## Live-data smoke

`tests/smoke/gtfs.test.ts` is gated on `KTMB_SMOKE=1` and hits the live
`data.gov.my` feeds. Set the env var locally before running if you're
touching the GTFS adapter or the route classifier.

## Demo (Deno Deploy)

The one-page demo under `site/` and the live REST API at `/v1/*` ship
from the same origin on **Deno Deploy²**. The entrypoint is
[`bin/ktmb-deno.ts`](bin/ktmb-deno.ts), driven by [`deno.json`](deno.json).
Deno Deploy's GitHub source integration auto-builds and deploys on
every push to `main` — no GitHub Actions workflow.

To preview locally:

```bash
pnpm install
pnpm snapshot                   # writes site/data/*.json (gitignored)
deno task deploy:dev            # serves on http://localhost:8000
```

`site/data/` is gitignored — `pnpm snapshot` (or the Deno Deploy build
step) re-creates it. See [README.md#demo](README.md#demo).

## Releases

`main` is always releasable. Version bumps are tagged from `main` after
the changelog is moved out of `[Unreleased]`.
