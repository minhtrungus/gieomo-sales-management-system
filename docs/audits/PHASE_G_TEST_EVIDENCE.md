# Phase G — Test & Static Evidence (Fresh Run, 2026-10-16)

Environment: current dirty workspace `main@1c51af6` + clean worktree of `origin/main@0b7825e`.
All Node/PostgreSQL runs local only.

## 1. Disposable-PostgreSQL mandatory suite (fresh)

- Harness: `scripts/postgres/run-mandatory-pg-tests.mjs` via `replay-canonical-migrations.ps1`
- Result: `MANDATORY_PG_PASS files=9 skipped=0`, **49/49 pass, 0 fail, 0 skip**, 3021 ms
  (inventory atomicity A1–A8, order parity/atomic/concurrency/races, cancel T1–T10,
  combo persistence, stock race D1–D5, 028 privileges, payment idempotency 2E, payment rejection).
- `PAYMENT_INTEGRITY_PG_PASS`, `ORDER_INTEGRITY_PG_PASS` both green.
- Full migration replay: `CANONICAL_REPLAY_PASS migrations=30 tip=030_atomic_combo_persistence.sql`.

## 2. Node unit tests (current tree)

- `node --test tests/` (67 `*.test.ts` files): **598 total, 543 pass, 0 fail, 55 skipped** (environment-gated skips; PG-dependent tests ran instead inside the PG harness).
- PG integration files (9) all passed in the disposable cluster pipeline.

## 3. Type-check

- Current tree: `tsc --noEmit` → **0 errors**.
- `origin/main` worktree: 1 error `TS2304: Cannot find name 'LayoutProps'` at
  `src/app/layout.tsx:100`. Diagnosis: `LayoutProps<"/">` is Next's injected global type emitted
  into `.next/types` on dev/build; a fresh worktree has no `.next` yet, so `tsc` alone trips.
  Not a source defect — confirmed by the passing `next build` in §4 on the same tree.

## 4. Production build

- Current tree: `next build` → **SUCCESS** (route table: dashboard rotas + `/policy/*`, `/sale/*`,
  `/track`, `/order/success`, API routes incl. `/api/orders`, `/api/vouchers`, `/api/webhook/sepay`).
- `origin/main@0b7825e` worktree (real node_modules copy, not junction — Turbopack rejects
  junction symlinks): `next build` → **SUCCESS**. Same route surface.

## 5. ESLint status (honest accounting)

- First full `npm run lint` on the dirty tree: 2803 errors / 17611 warnings — inflated by
  non-source directories (`.tmp` scratch, `.next`, `backups/`). Re-run excluding those:
  **480 errors / 202 warnings**.
- Clean `origin/main` worktree, same scope: **270 errors / 192 warnings**.
- Error classes: predominantly `@typescript-eslint/no-explicit-any` (bulk in
  `src/lib/data/orderStore.ts`, `src/lib/services/{product,reconciliation,order}Service.ts`),
  `react-hooks/set-state-in-effect` (CartDrawer, ProductReviews, useSiteSettings, NotificationContext),
  minor `prefer-const`/unused-var noise. Delta vs origin ≈ +210 errors from the 167
  uncommitted changes (mostly migrated legacy lines).
- No new security-class lint regressions found in the grep of the diff.
- Supabase DB lint (`plpgsql_check`): NOT RUN/BLOCKED (extension unavailable on vanilla PG).

## 6. Migration chain validation

- `scripts/migrations/validate-chain.mjs`: chain 001→030 monotonic, unique prefixes, replay
  evidence above. Files 013–026 are on `origin/main` (untracked in the dirty index), 027–030 present locally.

## 7. Evidence ladder for the release gate

| Layer | Evidence | Class |
|---|---|---|
| Source | dirty workspace + origin tip | FIXED IN CODE |
| Local test (mock) | 543 pass / 0 fail | TESTED LOCALLY |
| Disposable PostgreSQL | 49/49 + 2 suite PASS + chain replay | VERIFIED IN ISOLATED DATABASE |
| Production schema/data | NO-GO (deployed mix pre-022, empty payments, 100% ID-less items) | NOT VERIFIED |
| Backup restore | BLOCKED (no backups) | NOT VERIFIED |
| Staging smoke | unknown (Supabase preview env exists; no evidence of test runs) | NOT VERIFIED |
