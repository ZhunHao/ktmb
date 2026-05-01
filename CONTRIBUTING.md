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

Use Node 20 (see `.nvmrc`).

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

## Releases

`main` is always releasable. Version bumps are tagged from `main` after
the changelog is moved out of `[Unreleased]`.
