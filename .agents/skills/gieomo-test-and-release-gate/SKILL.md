---
name: gieomo-test-and-release-gate
description: How to run Gieo Mơ tests and checks, what counts as evidence, and GO/NO-GO release gate rules. Use when running tests, deciding PASS/FAIL for a batch, or evaluating release readiness.
---

# Gieo Mơ — Test & Release Gate

## How to run checks (verified on Node v24.15.0)

```powershell
node --test tests/<file>.test.ts          # unit/mock tests (node:test, TS native — no build step)
node --test tests/                        # whole suite (long)
npx tsc --noEmit                          # type-check (package script: type-check)
npx eslint                                # lint (package script: lint)
npx next build                            # production build
```

- No `test` script in package.json; tests are `node --test` only. No jest/vitest/jsdom — page.tsx components cannot be rendered in tests (see comments in `tests/requestSequenceGuard.test.ts`).
- PG integration tests (`tests/*.integration.test.ts`) require optional `pg` + env `ATOMIC_PG_URL`; they SKIP without it. SKIP ≠ PASS.

## Evidence ladder (never upgrade silently)

1. `FIXED IN CODE` — diff exists.
2. `TESTED LOCALLY` — relevant node --test files pass, command recorded.
3. `VERIFIED IN ISOLATED DATABASE` — non-skipped PG integration results on an operator-identified disposable target.
4. `VERIFIED IN STAGING` / `VERIFIED IN PRODUCTION` — requires deploy + smoke evidence.

Build green or type-check green alone is never PASS for a behavior batch.

## Batch PASS checklist

- [ ] Scope files only; pre-existing dirty files untouched (compare `git status --short` before/after).
- [ ] Targeted tests pass; related regression run.
- [ ] Failures/skips reported honestly with commands.
- [ ] No secrets printed; no Production/DB write ops.
- [ ] Checkpoint + plan updated.

## Release NO-GO triggers (subset; full gate in GIEOMO_OVERNIGHT_PRODUCTION_READINESS_PLAN.md §12)

- Any unresolved P0/P1 (duplicate order/payment, amount mismatch, auth bypass, negative stock).
- Mandatory test skipped or unrun; PG concurrency unproven.
- P0-A3 blockers open while `V2_OPEN`/cutover contemplated.
- Unknown deploy artifact; no release/rollback owner.

Payment/order idempotency claims REQUIRE non-skipped PG evidence; mock interleavings are not proof.
