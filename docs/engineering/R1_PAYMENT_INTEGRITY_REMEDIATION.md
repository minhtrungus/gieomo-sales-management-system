# R1 Payment Integrity — Controlled Remediation

Status: `PARTIAL / BLOCKED`  
Evidence: source, local tests and isolated PostgreSQL 18.6 rehearsal (`S1`); atomic payment apply and required business decisions remain absent.

## Writer inventory

| Flow | Writes `payments` | Writes `orders.payment_status` | Trace behavior |
|---|---:|---:|---|
| SePay webhook | `recordPaymentOnce` for sufficient first transfer | paid | transaction code = reference or SePay id |
| Admin confirm / POS cash | `recordPaymentOnce` | paid | deterministic `ADMIN-CONFIRM-<order_code>` |
| Admin reject | no | failed | history + audit log |
| Cancellation | no | does not change payment status | cancellation RPC/history only |
| Checkout/order creation | no | initializes pending | no received-money claim |
| Success-page polling | no | no | reads server status; local cache only |

Additional writer findings from Session 3:

- `recordPaymentOnce()` is the only application INSERT path into `payments`; it is called by admin confirm/POS and SePay.
- Admin confirm and reject update `orders`, then insert `order_status_history` in a separate PostgREST request. The history result is not checked. `audit_logs` is also explicitly non-fatal.
- SePay updates `payments` and `orders` in separate requests and writes no `order_status_history` row.
- The legacy order-create fallback in `orderService.ts` inserts initial order history separately and ignores failure. Migration 016 is atomic for the RPC path, but it does not handle payment application.
- No application UPDATE/DELETE path for `payments` was found. Migration 018 only deduplicates the same `(order_id, transaction_code)`; it does not arbitrate different transaction identities on one order.

## Session 3 decision register

No row below is an approved business policy. Until an owner approves a choice, the current fail-closed/manual-reconciliation behavior remains and the item is `BLOCKED`.

| Case | Current behavior | Risk | Options requiring approval | Missing decision | Recommendation for authority approval |
|---|---|---|---|---|---|
| Single underpayment | No payment row/event ledger row; appends an internal order note; order remains pending | Money event is not durably identifiable; retry may append notes; reconciliation depends on free text | reject/refund; hold for manual review; accumulate toward threshold | Whether underpayment may contribute to paid status and its expiry/refund SLA | Approve durable inbound-event capture immediately; choose manual review or explicit accumulation separately |
| Multiple underpayments for one order | Each callback repeats the single-underpayment note path; amounts are not aggregated | Total received can reach/exceed order value while order stays pending; duplicate delivery versus new transfer is hard to distinguish | never aggregate; aggregate exact; aggregate at-least expected | Split-payment policy, aggregation window, refund/remainder handling | Do not mark paid automatically until split policy and ledger aggregation rules are approved |
| Overpayment | Creates a paid payment row for full received amount, marks order paid, returns reconciliation flag | Customer-consent/refund liability; no atomic history; extra amount disposition undefined | accept then manual refund; hold for review before paid; accept donation only with consent | Whether overpayment may auto-pay and how excess is handled | Require finance/customer-service approval; meanwhile retain reconciliation flag and do not add a one-paid constraint |
| New transaction after order is paid | SePay returns early and records no payment row; admin confirm returns already paid | Real money can be lost from durable records | attach as additional transfer; create review-only event; refund workflow | Canonical ownership and disposition of additional transfer | Approve immutable inbound-event capture even when no canonical payment is applied |
| Two transaction codes for one order | Migration 018 permits two paid payment rows; whichever request updates order first/last is not centrally arbitrated | Double revenue/payment rows and conflicting amounts/methods | one successful payment/order; multiple transfers with one canonical settlement; aggregate payments | Whether split/additional payments are valid and what “successful payment” means | Do not add one-paid-per-order constraint before split policy; use an atomic apply RPC after approval |
| Admin confirm races webhook | Different codes (`ADMIN-CONFIRM-*` vs provider code) can both insert paid rows | Cross-writer duplicate settlement; histories/audits differ | provider wins; admin override; first committed winner; conflict to review | Precedence and operator override semantics | Prefer one locked order/apply RPC with explicit source/arbitration field after authority approval |
| Payment insert succeeds, order update fails | Payment remains committed; response is retryable 500; retry dedupes payment and retries order update | Persistent partial state; retry outage or later conflict leaves order pending with paid row | single transaction; durable retry state/outbox; compensation | Whether all valid events may apply automatically | Atomic server-side apply RPC is the technical recommendation; current gap is a release blocker |
| Order update succeeds, history insert fails | Admin route still returns success because history result is ignored; SePay writes no history at all | Paid state without append-only audit history | history mandatory in same transaction; transactional outbox; non-fatal audit only | Which records are part of the financial atomic invariant | Make payment history mandatory in the same apply transaction; keep external email outside transaction |

## Migration order and prerequisites

| Object | Required predecessor/effective prerequisite | Session 3 finding |
|---|---|---|
| 013 RLS | 001 tables; roles/grants from 002; 011 removes old public reads | Source order is necessary because 013 creates policies but does not create roles or grant base privileges |
| 018 payment identity | 001 `payments` table; duplicate-data precheck before live activation | Correctly enforces same transaction identity only; does not implement one-paid-per-order |
| draft 021 ACL | 013 policies and 016 `create_order_atomic(jsonb)` signature/grants | Must remain after 016 because its fail-closed verification resolves that exact function signature |
| draft 022 inbound ledger | 001 `orders`, Supabase runtime roles/default privileges, `pgcrypto`/`gen_random_uuid` support | Independent of payment-apply policy; still draft and not wired into webhook |

Prepared isolated sequence: `001 → 002 → 011 → 013 → 014 → 015 → 016 → 018 → draft 021 → draft 022`. It deliberately applies the proposal files only inside a new disposable container and never renames them to active migrations.

## Safe changes in Session 2

- Money events without a stable provider id/reference or positive amount are rejected before marking paid.
- Order lookup database errors now return retryable 500 instead of being misreported as unknown order.
- Underpayment trace-write errors now return retryable 500 instead of claiming the warning was saved.
- State-conflict reread errors now return retryable 500 after explicitly reporting that the payment row was recorded.
- Webhook responses classify unmatched reference/order, underpaid, matched, overpaid, paid-cancelled, and additional transfer on an already-paid order.
- Missing-reference responses no longer echo raw transaction content.

These changes improve fail-closed behavior and observability. They do **not** make every transfer durable.

## Business decisions still required

| Decision | Options requiring owner approval | Why code cannot choose |
|---|---|---|
| Split payment | disallow; accumulate until exact; accumulate to at least expected | Determines when an order becomes paid |
| Underpayment | always manual; accumulate; expire/refund | Determines money aggregation and timeout behavior |
| Overpayment | manual review; refund excess; accept as donation with consent | Financial/customer-consent policy |
| Transfer after paid | refund; donation/manual; attach as extra payment | Determines classification and operator action |
| Admin confirm vs provider event | admin override; provider wins; review on conflict | Determines one-paid-per-order semantics |

## Proposed transaction boundary

Draft 022 adds an immutable provider-identity ledger with nullable order linkage, amount snapshots, classification, delivery count and service-role-only ACL. Its record function only captures/deduplicates the inbound event.

Activation requires a second atomic apply RPC which, in one PostgreSQL transaction:

1. locks the inbound event and candidate order;
2. evaluates the approved split/under/over policy;
3. creates or links the canonical payment;
4. conditionally changes `orders.payment_status`;
5. appends payment history and audit metadata;
6. marks the event applied or review-required.

The draft intentionally performs none of steps 2–6 until policy approval.

The current multi-request implementation is not a transaction. In particular, “insert payment, then retry order update” improves recoverability but does not guarantee atomicity. The prepared SQL evidence matrix contains two negative probes: payment committed/order update failed, and order committed/history insert failed. Both are expected to report `FAIL` until an apply RPC exists.

## Isolated PostgreSQL harness

Prepared artifacts:

- `scripts/postgres/run-r1-isolated-evidence.ps1` creates a uniquely named `postgres:16-alpine` container, exposes no host port, applies only repository SQL to a new `gieomo_r1_test` database, and removes the exact container in `finally`.
- `scripts/postgres/bootstrap_supabase_test_roles.sql` creates only synthetic `anon`, `authenticated`, `service_role` and `auth.users` prerequisites inside that disposable database.
- `tests/postgres/r1_isolated_evidence.sql` checks migration/catalog ACLs, same-identity idempotency, two-code behavior, durable unknown/underpayment events, and the two known atomicity failures.
- `tests/r1PaymentPg.integration.test.ts` prepares two-connection concurrent inbound-delivery, durable unknown/underpayment and effective ACL checks. It requires `pg`, `ATOMIC_PG_URL` and the explicit safety acknowledgement `GIEOMO_PG_ISOLATED=1`; otherwise it reports `NOT RUN`.

Run from repository root after Docker is installed and the daemon is running:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/postgres/run-r1-isolated-evidence.ps1
```

Session 3 toolchain result: Docker CLI/daemon unavailable, Windows `psql` absent, WSL Ubuntu has no `psql`/`postgres`/Docker/Podman, `ATOMIC_PG_URL` missing, and npm module `pg` missing. Therefore the harness was **NOT RUN** and supplies no PostgreSQL PASS evidence yet.

## Mandatory matrix status — Session 3

| Required case | Status | Evidence/blocker |
|---|---|---|
| Same webhook delivered repeatedly | `PASS` local mock/source; PostgreSQL `NOT RUN` | Migration 018 mock mapping exists; prepared DB check for 018 and draft 022, no runnable PostgreSQL |
| Two transaction codes on one order | `PASS` as current-behavior characterization; desired policy `BLOCKED` | 018 intentionally permits two rows; no approved settlement policy |
| Two simultaneous webhooks | `BLOCKED` | No atomic apply RPC; prepared ledger alone does not apply payment/order/history |
| Webhook and admin confirm simultaneously | `BLOCKED` | Different identities plus missing precedence policy |
| Failure at payment/order/history write | `FAIL` by source design; PostgreSQL probe `NOT RUN` | Separate transactions permit persistent partial states |
| Unknown order and underpayment durable | Current app `FAIL`; draft design prepared; PostgreSQL `NOT RUN` | Webhook does not call draft 022 and proposal is not active |
| Overpayment and additional transfer | `BLOCKED` | Business policy unapproved; current overpayment auto-pays and additional transfer is not recorded |
| `anon`/`authenticated`/`service_role` plus `create_order_atomic` ACL | Source proposal `PASS`; PostgreSQL `NOT RUN` | Draft 021 source tests only; no live catalog proof |
| P0-A3 concurrent key/quantity/aggregate limits | `BLOCKED` | Limits and v2 implementation unapproved; no isolated PostgreSQL |

PostgreSQL totals for Session 3: **0 run, 0 PASS, 0 FAIL, 0 SKIP**. The prepared-but-unexecuted cases are `NOT RUN` or `BLOCKED`, never counted as PASS.

## Mandatory tests before R1 DONE

- same provider transaction delivered sequentially and concurrently;
- same provider id with changed amount/order fingerprint;
- different transaction ids on one order;
- admin confirm concurrent with webhook;
- unknown order, missing reference, underpayment and overpayment;
- order/history/audit fault injection and rollback;
- service-role/anon/authenticated ACL checks;
- committed-winner and rolled-back-winner PostgreSQL cases.

Without non-skipped isolated PostgreSQL results, R1 remains `BLOCKED` and Production remains `NO-GO`.

## Session 4 — isolated PostgreSQL evidence

The target was positively identified before use as database `gieomo_session4_test`, user `session4_admin`, server `127.0.0.1:55439`, and data directory `.tmp/postgres-session4-data` under this repository. It used PostgreSQL 18.6, trust authentication only on the loopback-bound disposable cluster, synthetic rows only, and no production/staging URL, data or credential.

The rehearsal applied `bootstrap → 001 → 002 → 011 → 013 → 014 → 015 → 016 → 018 → draft 021 → draft 022`. Draft 021 initially failed because `has_function_privilege('PUBLIC', ...)` treats `PUBLIC` as a real role name. The draft and SQL evidence now use ACL pseudo-role OID `0`; this changes only verification, not grants or business behavior. Both proposals remain `.draft`.

SQL evidence matrix: **16 classified rows: 8 PASS, 2 FAIL, 6 BLOCKED**. The two FAIL rows are executed negative probes proving that payment can commit while order remains pending, and order can become paid while history remains absent. The six BLOCKED rows were not counted as executed PASS.

Node/PostgreSQL definitions: **17 total: 8 PASS, 6 FAIL, 3 BLOCKED/SKIP**. Four payment identity tests passed, including concurrent same-identity insertion and two distinct transaction codes on one order. Three R1 tests passed for concurrent inbound-event deduplication, durable unknown/underpayment recording, and effective runtime ACLs. The ACL test uses actual `SET ROLE` operations, not catalog checks alone. One pricing parity test passed. Six atomic-order tests failed because migration 016 queries `products.sku`, which schema 001 does not define; the test fixture's matching invalid `products.sku` inserts were corrected so the remaining failure is the production SQL defect.

| Required case | Session 4 PostgreSQL result | Interpretation |
|---|---|---|
| Same webhook/provider identity repeated | `PASS` | Sequential payment identity and concurrent draft-022 inbound identity both remain one row; inbound delivery count increments. |
| Two transaction codes on one order | `PASS` characterization / policy `BLOCKED` | Migration 018 permits two rows; no settlement rule was inferred. |
| Two simultaneous webhooks | inbound record `PASS`; apply `BLOCKED` | Durable ledger is concurrent-safe, but no payment/order/history apply RPC exists. |
| Webhook and admin confirm simultaneously | `BLOCKED` | No approved precedence rule or shared atomic apply boundary. |
| Failure at payment/order/history write | `FAIL` | Both persistent partial-state probes reproduced on PostgreSQL. |
| Unknown order and underpayment durable | draft ledger `PASS`; active app `BLOCKED` | Synthetic events persist as `review_required`; draft 022 is not active or called by the webhook. |
| Overpayment and additional transfer | `BLOCKED` | Business disposition is still unapproved. |
| Runtime roles and `create_order_atomic` ACL | `PASS` in isolated rehearsal | Actual `anon`, `authenticated`, and `service_role` role operations matched the draft-021 contract. |
| P0-A3 quantity/aggregate concurrency | `BLOCKED`; v1 atomic suite `FAIL` | Limits/v2 remain unapproved, and migration 016 currently fails on nonexistent `products.sku`. |

This evidence removes the “no PostgreSQL available” blocker only. R1 remains `PARTIAL / BLOCKED`, and production remains **NO-GO**.

## Session 4 continuation — PostgreSQL evidence re-run on a clean rehearsal

Continuation after the previous session stopped mid-run. Nothing was reset, stashed, reverted, committed, pushed or deployed.

### Cluster identity re-verified before any write

| Property | Verified value |
|---|---|
| Data directory | `.tmp/postgres-session4-data` (this repository) |
| Server | `127.0.0.1:55439`, PostgreSQL 18.6, loopback only |
| Session database (first run, left untouched) | `gieomo_session4_test` |
| Database created for this continuation | `gieomo_session4_rerun` |
| Login | `session4_admin` (synthetic, trust auth on loopback) |

The running cluster is the session-owned cluster, not the Scoop default cluster and not any shared or production endpoint. No password, token or environment secret was printed. `package.json` and `package-lock.json` are unchanged; `node_modules/pg@8.23.1` remains the temporary `--no-save` install from the previous session and was not reinstalled.

### Migration rehearsal on a fresh database

A second database was created inside the *same verified cluster* (no second cluster). All eleven files applied with exit code 0 on an empty database:

`bootstrap_supabase_test_roles.sql → 001 → 002 → 011 → 013 → 014 → 015 → 016 → 018 → proposals/021.sql.draft → proposals/022.sql.draft`

Migrations apply cleanly. The `products.sku` defect below is runtime-only: PostgreSQL does not validate PL/pgSQL column references until first execution. Both proposals remain inactive `.draft` files; neither was renamed or activated.

### SQL evidence matrix (fresh database, exit code 0)

**16 classified rows: 8 PASS / 2 FAIL / 6 BLOCKED** — identical to the first run.

| PASS (8) | FAIL (2) | BLOCKED (6) |
|---|---|---|
| `MIG-013`, `MIG-018`, `MIG-021`, `MIG-022`, `R1-DUPLICATE-SEQUENTIAL`, `R1-TWO-CODES-ONE-ORDER`, `R1-DUPLICATE-EVENT`, `R1-DURABLE-UNKNOWN-UNDERPAYMENT` | `R1-ATOMIC-PAYMENT-THEN-ORDER-FAIL`, `R1-ATOMIC-ORDER-THEN-HISTORY-FAIL` | `R1-CONCURRENT-WEBHOOKS`, `R1-WEBHOOK-ADMIN-RACE`, `R1-FAULT-INJECTION`, `R1-OVERPAYMENT-APPLY`, `R1-ADDITIONAL-TRANSFER-APPLY`, `P0-A3-CONCURRENCY-LIMITS` |

The two FAIL rows are deliberate executed negative probes of the real partial-state gap; they are evidence of a defect, not a harness error.

### Node/PostgreSQL tests actually executed against PostgreSQL

Command (reproduction):

```powershell
$env:ATOMIC_PG_URL='postgresql://session4_admin@127.0.0.1:55439/gieomo_session4_rerun'
$env:GIEOMO_PG_ISOLATED='1'
node --test tests/paymentIdempotencyPg.integration.test.ts tests/r1PaymentPg.integration.test.ts tests/atomicOrderPg.integration.test.ts
```

| Group | Run | PASS | FAIL | BLOCKED/SKIP |
|---|---|---|---|---|
| Payment identity (`paymentIdempotencyPg`, migration 018) | 4 | 4 | 0 | 0 |
| R1 inbound ledger + runtime ACL (`r1PaymentPg`) | 6 | 3 | 0 | 3 BLOCKED (`R1-PG4`, `R1-PG5`, `P0-A3-PG`) |
| Pricing parity + `create_order_atomic` (`atomicOrderPg`) | 7 | 1 | 6 | 0 |
| **Total (first group)** | **17** | **8** | **6** | **3** |

`R1-PG3` passed with real `SET ROLE` switching to `anon`, `authenticated` and `service_role` (ACL/RLS evidence, not catalog-only).

### Confirmed schema defect (not fixed in this session)

All six `atomicOrderPg` failures are the same production SQL error:

- SQLSTATE `42703`, message `column pr.sku does not exist`
- failing statement `supabase/migrations/016_create_order_atomic.sql:486` → `SELECT pr.product_id, pr.name, pr.sku, pr.price, pr.status FROM public.products pr`
- raised at `create_order_atomic(jsonb)` line 260 (`FOR` over `SELECT ... FOR UPDATE`)

Diagnosis: **a real migration/schema-chain incompatibility**, not a fixture error and not a missing prerequisite.

- Migration 001 defines `products` (lines 88–110) with **no `sku` column**; `sku` exists only on `product_variants` (001:115), verified both in source and with `information_schema.columns` on the rehearsed database.
- No migration anywhere in `supabase/migrations/` adds `products.sku` (searched 001–020 plus both proposals).
- Migration 016's own header states it adds no columns, so the reference cannot be satisfied by 016 itself.
- The test fixture no longer inserts `products.sku`, so the remaining failure is entirely inside production SQL.

No column was added, no migration was edited and no business behavior was changed to make a test pass. Fixing this requires a reviewed schema or SQL change and is recorded as an open defect/blocker.

### Additional PostgreSQL suites (migrations outside the rehearsal scope)

```powershell
node --test tests/adjustStockPg.integration.test.ts tests/cancelOrderPg.integration.test.ts tests/legacyStockDeductPg.integration.test.ts
```

**23 tests: 0 PASS / 0 FAIL / 23 SKIP** — every case skipped with an explicit reason (`adjust_variant_stock` needs 019, `cancel_order_atomic` needs 017, `deduct_variant_stock_atomic` needs 012). Reported as **NOT RUN**, never as PASS.

Combined with the group above: **40 PostgreSQL tests executed in this session: 15 PASS / 6 FAIL / 19 SKIP-by-missing-migration / 3 BLOCKED.**

### Source-level (non-PostgreSQL) evidence

- Harness/draft/source batch: `r1IsolatedHarnessSource`, `migration021Draft`, `migration022Draft`, `migration016Source` → **23/23 PASS** (reads files only — no database).
- Targeted release batch (14 files: R1/R2/payment/idempotency/authorization/migration source): **141/141 PASS**, exit code 0.

### Release checks (exit codes from this session)

| Check | Result |
|---|---|
| `node --test "tests/**/*.test.ts"` | **exit 0** — 548 tests, 508 pass, 0 fail, 40 skip (PG files self-skip without a target) |
| `npx.cmd tsc --noEmit` | **exit 0** |
| `npx.cmd eslint <8 changed PG/harness test files>` | **exit 0** after fixing pre-existing lint defects in those files |
| `npx.cmd eslint` (whole repository) | **exit 1 — 750 problems (546 errors, 204 warnings)**, pre-existing baseline, not introduced here and not claimed as passing |
| `npx.cmd next build` | **exit 0** |
| `git diff --check` | **exit 0** (only pre-existing LF→CRLF warnings) |

### Test-harness fixes made in this continuation

Evidence-based fixture and lint fixes only; none hides the defect under test.

1. Removed the nonexistent `products.sku` column from product fixtures in `tests/adjustStockPg.integration.test.ts`, `tests/cancelOrderPg.integration.test.ts`, `tests/legacyStockDeductPg.integration.test.ts` — proven wrong by schema 001 and by `information_schema` on the rehearsed database.
2. `@ts-ignore` → `@ts-expect-error` plus the existing `/* eslint-disable @typescript-eslint/no-explicit-any */` convention already used by `tests/atomicOrderPg.integration.test.ts` in those three files and in `tests/paymentIdempotencyPg.integration.test.ts`; removed an unused `uid` binding there.

### Cluster disposition and repository state

The cluster was **retained, not torn down**: evidence is recorded, but stopping and deleting `.tmp/postgres-session4-data` would remove the ability to re-inspect the failing `products.sku` case. Both databases (`gieomo_session4_test` with first-run rows, `gieomo_session4_rerun` with the clean rehearsal) stay inside that cluster. To stop it later: `& "$env:USERPROFILE\scoop\apps\postgresql\current\bin\pg_ctl.exe" -D .tmp/postgres-session4-data stop -m fast`.

Final state: branch `main`, HEAD `1c51af625a575a41733d59b29cc9be9ae0892c60`, 0 staged, 48 unstaged, 83 untracked (131 porcelain entries), no commit created. R1 remains `PARTIAL / BLOCKED`; Production verdict remains **NO-GO**.
