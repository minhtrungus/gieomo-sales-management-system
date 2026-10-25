# RLS / P0-A3 controlled remediation

Date: 2026-10-13. Scope: repository plus disposable local PostgreSQL evidence; no shared, staging or production database was contacted.

Session 4 installed local PostgreSQL 18.6 and ran the rehearsal against a session-owned loopback cluster under `.tmp`. The prior “0 PostgreSQL tests run” statement is retained below as Session 3 history, not current evidence.

## Effective intent from migration history

| Principal | Order tables after 013 | Proposed 021 result |
|---|---|---|
| `anon` | `INSERT` grant from 002 plus public `WITH CHECK (true)` insert policies; SELECT was revoked by 011 | no SELECT or DML on customers/orders/items/payments/history |
| `authenticated` | broad DML grants from 002; SELECT policies in 013; public insert policies also apply | retain SELECT, revoke direct INSERT/UPDATE/DELETE |
| `service_role` | ALL policies/grants; current server writers use this role | unchanged |

The repository's checkout, admin, POS, sale and payment writers go through server code using `createAdminClient`; order creation uses `create_order_atomic` when the configured writer mode and key permit it. No import of the browser Supabase client was found outside its own module. This is source evidence only: external clients, jobs, role membership and live grants remain operator evidence.

Draft 021 now revokes direct DML from both `anon` and `authenticated`, drops the unrestricted public insert policies, and verifies that `PUBLIC`, `anon`, and `authenticated` cannot execute `create_order_atomic`. It remains a `.sql.draft` under `proposals/`.

The isolated sequence prepared for this verification is `001 → 002 → 011 → 013 → 014 → 015 → 016 → 018 → draft 021 → draft 022`. Draft 021 must follow 016 because its verification resolves `public.create_order_atomic(jsonb)`. Migration 013 relies on tables from 001 and runtime roles/base grants from 002. Draft 022 relies on `orders`, runtime roles and UUID support. No proposal was renamed or activated.

The broad default privileges established by 002 are not changed in this draft. Changing them globally could break intentionally public tables such as contact/review intake and needs a separately scoped privilege model.

## Checkout impact and required proof

Source review predicts no first-party checkout regression because writes are server-side/service-role. That prediction is not runtime proof. Activation requires an isolated PostgreSQL target, migration-order/catalog verification, denial tests as each real runtime principal, and COD/banking/admin-confirm/reject smoke tests.

## P0-A3 disposition

No P0-A3 implementation was made. The current writer still permits the legacy/no-key path, customer mutation can occur outside the atomic RPC, v1 silently clamps/merges quantities, and real concurrency is unverified. Per-line maximum, aggregate maximum and maximum line count are business decisions. The approved v2 design requires rejection rather than clamping, a DB-authoritative gate and canonicalizer, typed ledger reads, reciprocal invariants and one transaction.

Runtime checks now cover `anon`, `authenticated`, `service_role`, direct order/payment-table operations and `create_order_atomic` execution using actual `SET ROLE`. They passed on the isolated rehearsal target. This is not evidence that draft 021 has been activated on any shared environment.

Status: **RLS proposal PASS in isolated rehearsal / activation BLOCKED**. **P0-A3 BLOCKED** on business limits, the migration-016 `products.sku` defect, live writer evidence and separately approved v2 implementation. Production verdict remains **NO-GO**.

## Session 4 evidence

- Verified target: `gieomo_session4_test` / `session4_admin` / `127.0.0.1:55439` / repository `.tmp/postgres-session4-data`, PostgreSQL 18.6.
- Ordered migration rehearsal through 018 and both drafts completed after replacing the invalid literal-role `PUBLIC` verification with ACL pseudo-role OID `0`. No `.draft` file was activated.
- Draft-021 ACL: `anon` could not read orders/payments or execute `create_order_atomic`; `authenticated` could read orders/payments but could not insert payment or execute the RPC; `service_role` could insert payment and reached the RPC body. Result: `PASS` on isolated PostgreSQL.
- Draft-022 concurrent provider-event deduplication and durable unknown/underpayment cases: `PASS` as proposal evidence only.
- P0-A3 approved quantity/line/aggregate limits and v2 RPC: `BLOCKED`, not run and not counted as PASS.
- Existing v1 atomic-order suite: pricing parity `PASS`; six database tests `FAIL` at migration 016's `pr.sku` reference because `products.sku` does not exist in schema 001. No P0-A3 completion claim is possible.
- Repeatable direct-local runner: `scripts/postgres/run-r1-local-evidence.ps1`; it creates a unique database/user/data directory, binds loopback only, verifies identity, applies the explicit sequence, and validates the exact `.tmp/postgres-r1-*` target before teardown.

## Session 4 continuation — ACL/RLS and P0-A3 re-run

Continuation run after the previous session stopped. No reset, stash, revert, commit, push, deploy or migration activation occurred, and no shared or production database was contacted.

### Cluster identity re-verified

Data directory `.tmp/postgres-session4-data`, server `127.0.0.1:55439` (PostgreSQL 18.6, loopback, trust), login `session4_admin`, first-run database `gieomo_session4_test` left untouched. A second database `gieomo_session4_rerun` was created **inside the same verified cluster** for a clean rehearsal — no second cluster was started.

### ACL/RLS evidence (real database, real role switching)

- Ordered rehearsal on an empty database: `bootstrap → 001 → 002 → 011 → 013 → 014 → 015 → 016 → 018 → draft 021 → draft 022`, every file **exit 0**. No `.draft` file was renamed or activated.
- SQL row `MIG-021`: **PASS** — `anon` and `authenticated` have no `INSERT` on `payments`, `authenticated` retains `SELECT`, `service_role` keeps `INSERT`, and `anon`/`authenticated`/`PUBLIC` (OID `0`) cannot execute `create_order_atomic` while `service_role` can.
- SQL row `MIG-022`: **PASS** — `inbound_payment_events` and `record_inbound_payment_event(jsonb)` exist and are service-role only.
- `R1-PG3` (`tests/r1PaymentPg.integration.test.ts`): **PASS** using actual `SET ROLE` operations against `anon`, `authenticated` and `service_role`, not catalog reads alone.
- SQL matrix on the clean database: **16 rows = 8 PASS / 2 FAIL / 6 BLOCKED**, matching the first run exactly.

These results are limited to the isolated rehearsal. **Activation, live-writer and route-smoke evidence remain BLOCKED.**

### P0-A3 evidence

- `P0-A3-CONCURRENCY-LIMITS` (SQL matrix) and `P0-A3-PG` (Node suite): both **BLOCKED** — per-line quantity, line-count and aggregate limits are unapproved and `create_order_atomic_v2` does not exist.
- The v1 atomic-order suite still cannot prove anything: **6 of 7 `atomicOrderPg` cases FAIL** with SQLSTATE `42703 column pr.sku does not exist` raised at `supabase/migrations/016_create_order_atomic.sql:486` (`create_order_atomic` line 260).
- Diagnosis confirmed on source and on the rehearsed schema: migration 001 creates `products` without `sku` (only `product_variants.sku` exists), no migration 001–020 or proposal adds `products.sku`, and migration 016 declares it adds no columns. This is a genuine migration/schema-chain defect, not a fixture error.
- No column, migration or business behavior was changed to turn those failures green. P0-A3 remains **BLOCKED**.

### Additional PostgreSQL suites

`adjustStockPg`, `cancelOrderPg` and `legacyStockDeductPg`: **23 tests, 0 PASS / 0 FAIL / 23 SKIP** — explicitly `NOT RUN` because migrations 012/017/019/020 are outside this rehearsal scope. Their invalid `products.sku` fixture inserts were corrected (evidence-based, does not affect the defect under test).

### Source-level checks

`tests/r1IsolatedHarnessSource.test.ts`, `tests/migration021Draft.test.ts`, `tests/migration022Draft.test.ts`, `tests/migration016Source.test.ts`: **23/23 PASS** (file reads only, no database).

### Release checks (exit codes)

Full suite `node --test "tests/**/*.test.ts"` → **exit 0**, 548 tests / 508 pass / 0 fail / 40 skip. `npx.cmd tsc --noEmit` → **exit 0**. Scoped `npx.cmd eslint` on the changed PG/harness test files → **exit 0**. Repository-wide `npx.cmd eslint` → **exit 1** (750 problems, 546 errors — pre-existing baseline, not claimed as passing). `npx.cmd next build` → **exit 0**. `git diff --check` → **exit 0**.

### Disposition

Cluster retained (not torn down) so the failing case stays re-inspectable; it is the session-owned cluster under `.tmp`, not a shared one. Branch `main`, HEAD `1c51af625a575a41733d59b29cc9be9ae0892c60`, 0 staged / 48 unstaged / 83 untracked, no commit.

Status unchanged: **RLS proposal PASS in isolated rehearsal / activation BLOCKED**; **P0-A3 BLOCKED**; Production verdict **NO-GO**.
