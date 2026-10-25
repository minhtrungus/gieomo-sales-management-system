# Codex partial-release and migration-readiness audit

**Audit date:** 2026-10-14 (Asia/Saigon)
**Decision:** release only the isolated order-presentation slice first. Do not release an order writer, payment writer, authentication change, notification change, reconciliation dashboard, or migration yet.

## 1. Verified baseline

### Repositories and concurrent work

| Location | Branch / HEAD | Dirty state | Audit treatment |
|---|---|---|---|
| Root `C:\Users\MT\Workspaces\gieomo-sales-management-system` | `main` at `1c51af625a575a41733d59b29cc9be9ae0892c60`; 5 commits ahead of `origin/main` | Dirty: 137 status entries (49 tracked changes, 88 untracked entries) | Read-only except this new report. Existing root changes were not edited. |
| Candidate `...\gieomo-sales-management-system-worktrees\integrated-candidate` | `integrated/r1-recon-p0a3-security` at the expected base `1c51af625a575a41733d59b29cc9be9ae0892c60` | Dirty: 50 entries (29 tracked changes, 21 untracked entries) | Read-only point-in-time audit. OpenCode changes were not edited. |

All listed branches currently point at the same committed base. The candidate's release content is uncommitted working-tree state, not a reproducible Git object. F-GUARD and F-PII artifacts are present (`tests/orderSubmitGuards.test.ts`, `tests/credentialStorage.test.ts`, changes in `orderStore.ts`, create-order pages, authentication and session files), but the work is concurrent and therefore its completeness is **UNVERIFIED**. Candidate source hashes were captured during the audit; final status is rechecked in section 9.

### Evidence separation

- **Previously reported:** candidate documents claim 152/152 tests, zero TypeScript errors, 437 lint findings, and a build blocked by a Turbopack `node_modules` junction error. Those are historical claims, not current evidence.
- **Independently reproduced:** current candidate source, current Git state, complete SQL for 021-023, the runtime coupling described below, current test/type/lint results, and focused order-presentation tests.
- **Still unverified:** any staging/production schema, applied migration history, PostgreSQL concurrency, SePay delivery behavior, browser/E2E behavior, production build, and the final form of concurrent F-GUARD/F-PII work.

### Current validation evidence

| Check | Result | Evidence |
|---|---|---|
| Migration 021/022 draft tests | **PASS** | `node --test tests/migration021Draft.test.ts tests/migration022Draft.test.ts`: 8/8 pass in root. These are source-shape tests, not database tests. |
| Candidate full unit/mock glob | **FAIL** | `node --test "tests/*.test.ts"`: 175 tests, 173 pass, 2 fail. Both failures are in `orderSubmitGuards.test.ts`; dynamic import of `orderStore.ts` cannot resolve extensionless `src/lib/data/mockData`. |
| Directory-form unit command | **FAIL (tool invocation)** | `node --test tests/` treats `tests` as a module on this Windows/Node 24.15.0 setup and fails before discovery. Do not count this as a product failure. |
| Focused order-presentation tests | **PASS** | `tests/orderUiPresentation.test.ts`: 7/7; discount-only pattern from `orderSubmitGuards.test.ts`: 3/3. |
| TypeScript | **PASS** | `npx.cmd tsc --noEmit --incremental false`: exit 0. |
| ESLint, whole candidate | **FAIL** | `npx.cmd eslint .`: 462 problems (274 errors, 188 warnings). This is not scoped to changed files. |
| `git diff --check`, candidate | **PASS** | Exit 0; Git emitted only LF-to-CRLF warnings for the two payment routes. |
| Next.js type generation | **NOT RUN** | Candidate is a moving read-only worktree; no generated output was written. |
| Production build | **NOT RUN** | Avoided writing build output into the concurrent candidate. Historical junction failure is not treated as current proof. |
| PostgreSQL integration/concurrency | **BLOCKED** | `ATOMIC_PG_URL` missing. Candidate contains no PG integration tests. A local `.tmp` database artifact is not an operator-identified disposable target and was not touched. |
| Browser/E2E and real SePay | **NOT RUN** | No approved deployed environment. |

## 2. Partial-release matrix

| Area | Verdict | Routes / principal files | Dependencies and coupling | Blocking risks | Required validation and smoke | Rollback / independent deployment |
|---|---|---|---|---|---|---|
| Order presentation only | **RELEASE CANDIDATE** | `/admin/orders`, `/sale/orders`, order detail and reports; `src/lib/orderUi.ts`, `src/app/admin/orders/page.tsx`, `src/app/sale/orders/page.tsx`, `src/app/admin/orders/[id]/page.tsx`, `src/app/admin/reports/page.tsx` | Uses existing `Order` fields and existing `orderStore` reads. No new API, payment, or schema dependency. Do not include create/POS pages or `orderStore.ts`. | Existing page actions retain their old risks, but this slice only adds search/sort/status presentation and correct voucher display. | Focused tests already 10/10. Stage with real read-only order fixtures: natural code ordering, recipient search, `ready_to_ship`, missing item fields, zero and nonzero `voucher_discount`. | Deployable independently if the five source files plus `tests/orderUiPresentation.test.ts` and only the three discount assertions are reviewed. Roll back the presentation commit or previous artifact. |
| Admin/sale order create and checkout | **HOLD** | `/checkout`, `/admin/orders/create`, `/admin/orders/pos`, `/sale/create-order`, `POST /api/orders`; `checkout/page.tsx`, create/POS pages, `api/orders/route.ts`, `orderStore.ts`, `orderService.ts`, `orderCreateInput.ts` | Shared `orderStore.ts` also carries F-PII/payment/local-cache behavior. Candidate does not call migrations 015/016; creation remains multi-call PostgREST. | Client guards do not provide server idempotency. Network retry/multi-tab can create duplicate orders and repeat stock/voucher effects. Stock/customer/order/items/history are separate transactions with best-effort compensation. Order-item insertion failure is logged but still returns success. Simple-product paths query `products.stock`, absent from tracked migration 001. | Non-skipped disposable-PG retry and concurrency tests; fail-at-each-step tests; canonical-code E2E; stock/voucher/customer rollback; combo component stock; schema contract. | Not independently deployable safely. Rollback after writes cannot reliably undo orders, stock, vouchers, or customer mutations. |
| Admin/sale order list UI beyond presentation | **HOLD** | `/admin/orders`, `/sale/orders`, `/admin/orders/[id]`; status actions through `PATCH /api/orders` | Shares arbitrary status update API and non-atomic cancellation/voucher release in candidate. | API accepts arbitrary `orderStatus` transitions; cancellation and voucher release are separate transactions; order lifecycle rules are not database-enforced. | Transition matrix, concurrent cancel, inventory restore, audit-log, permissions, and real DB tests. | Presentation patch can ship; mutation behavior cannot be represented as an independently safe feature. |
| Read-only reconciliation | **REQUIRES OPERATOR DECISION** | `/admin/reconciliation`, `GET /api/admin/reconciliation`; `reconciliationService.ts`, `reconciliationEngine.ts`, route/page and five reconciliation tests | No 023 dependency. Requires working admin session and schema 001 tables. It correctly throws on query failures rather than interpreting them as empty data. | `end_date` uses `lte(created_at, YYYY-MM-DD)` and excludes most of the selected end day. Summary is search-scoped but not action/status-filter-scoped, so KPIs can describe a different population than visible rows. Inventory is generally `UNVERIFIED` without a movement ledger. | Decide KPI semantics; normalize end date to exclusive next-day or end-of-day; test timezone boundaries, pagination, search/status/action filters, query failure, and representative real data. | Reviewable/pushable independently. Deploy only after semantics are accepted/fixed. Roll back application files; it is read-only and needs no data rollback. |
| Authentication/session security | **HOLD** | `/admin/login`, `/api/auth/login`, member/presence/upload/change-password APIs; `serverAuth.ts`, login/member/presence/upload routes, F-PII files/tests | Requires migration 006 `members.password_hash`, valid `members.updated_at`, audit table, session secret, and coordinated clients. Shared with every protected area. | Existing non-PBKDF2 hashes are rejected; the supposed plaintext-upgrade branch is unreachable after `verifyPassword` returns false. Existing old-format sessions are rejected and member updates invalidate sessions. Login has no rate limit. Login UI still stores member PII in `gieomo_admin_session` localStorage. Concurrent F-GUARD/F-PII work is moving. | Inventory password-hash formats and null/invalid `updated_at`; forced logout plan; rate-limit design; session/cookie/browser matrix; admin/sale/delivery role matrix; audit failure; secret rotation. | Not backward-compatible without operator preparation. Rollback must consider sessions minted with the new format and password changes; do not deploy piecemeal while OpenCode is editing it. |
| POS cash and QR | **HOLD** | `/admin/orders/pos`; POS page plus `orderStore.ts`, `/api/orders`, `/api/orders/payment` | Coupled to order creation, canonical server identity, and payment ledger. | POS creates a local random code but ignores `saveNewOrder()`'s canonical `result.orderCode`; QR and modal can therefore reference a non-existent server code. Cash marks only local order `paid/completed`; server inserts `pending` and no server payment row exists. QR confirmation also mutates local state only. | Cash/QR E2E against disposable DB, server payment row assertion, canonical-code assertion, webhook/admin race, duplicate submit/network retry. | Cannot deploy without enabling incomplete order/payment flows. Data rollback would need order/payment reconciliation, not just code rollback. |
| Admin payment confirm/reject | **REQUIRES DATABASE MIGRATION** | `POST/GET /api/orders/payment`, `/admin/payments`; payment route, page, `serverAuth.ts`, migration 023 | Confirm calls `apply_payment_event(jsonb)` and therefore hard-depends on 023. Reject remains three separate writes (order, history, audit). Admin page also consumes local-storage payment data. | Code-before-migration returns HTTP 500. Reject can change the order and then fail history/audit. No real PostgreSQL proof. Existing paid duplicates can block migration. | Migration rehearsal, exact RPC contract, concurrent admin/webhook confirm, reject-vs-confirm, history/audit failure, permissions, real reference identity. | Migration and confirm code are one release unit, staged expand-first. Roll back code first; database rollback is limited and must not discard event history. |
| SePay webhook/payment integrity | **REQUIRES DATABASE MIGRATION** | `POST /api/webhook/sepay`; webhook route and migration 023 | Hard-depends on `payment_events` and `apply_payment_event`. Uses static API-key authentication; no signed request timestamp/nonce. | App-before-schema causes prolonged 500s, repeated SePay delivery, and no durable ledger when `payment_events` is absent. Retrying does not make the gap safe. Provider identity is only unique per order in `payments`; unmatched-event retries can create repeated ledger rows. | Disposable PG apply/rollback, same-event and different-event concurrency, unknown reference/order, under/overpayment, cancelled/completed order, replay, auth failure, latency, and real staging SePay delivery. | Apply corrected 023 first, then application. Roll back application before RPC removal. Never drop event data as routine rollback. |
| Notify email | **HOLD** | `POST /api/notify/email`, `/order/success`; notify route, success page, proof-token helpers | Depends on new proof-token format and session secret; client polling initiates `payment_received` email. | Token is order-scoped and expires in 24h, but not purpose-scoped or single-use; it is replayable, has no rate limit, and remains in URL/localStorage. Repeated tabs/polls can resend email. Existing tokens without `exp` stop working. | Purpose/audience binding, replay/idempotency store, rate limit, expiry/rotation compatibility, email-provider failure/retry, server-triggered payment email E2E. | Not independently production-ready. Prefer server-side send after committed payment event; rollback must preserve delivery dedupe state once introduced. |
| Product/catalog read | **RELEASE CANDIDATE** (only if isolated) | `/products`, `/products/[slug]`, `GET /api/products`; product pages/API/service | Existing schema 001 + 009/010 as actually applied. No payment activation. | `productService` converts database failures into `[]` in fallback/error paths, which can present a false empty catalog. Database state is unknown. | Stage read-only catalog, draft exclusion, variants/media, DB failure visible to operator, empty-state distinction. | Can deploy independently only as an unchanged/isolated read path. Roll back application artifact. |
| Product/variant/voucher/inventory writes | **HOLD** / **REQUIRES DATABASE MIGRATION** | Admin products/vouchers/inventory, product/voucher/inventory/combos APIs and services | Freeship requires enum migration 014. Root inventory code depends on 019/020, but candidate inventory still makes unchecked absolute updates. Product upsert deletes all variants then reinserts outside a transaction. | Silent query/write failures; destructive variant replacement; tracked schema lacks `products.stock` while simple-product inventory/order code uses it; voucher GET converts DB errors to empty success; freeship writes fail without 014; no real concurrency evidence. | Schema inventory, 014 enum check, 019/020 decision, FK/history preservation, concurrent stock adjustment, error propagation, product upsert rollback, voucher uniqueness/use-limit tests. | Do not deploy write features independently. Product/variant data rollback may be lossy after delete/reinsert. |

### Minimum-risk findings reproduced

1. Client `isSubmitting` guards close only a double click, not retry/multi-tab idempotency.
2. Candidate order creation has no idempotency key and uses multiple database transactions; duplicates and partial side effects remain possible.
3. POS paid/completed state is local-only and lacks a server payment record.
4. Checkout uses the canonical server code, but admin create, sale create, and POS continue to show/encode their pre-request random code instead of `result.orderCode`.
5. Reconciliation now fails visibly on database query errors; other catalog/voucher reads still convert some failures to empty lists.
6. Authentication is deliberately stricter but is not backward-compatible with legacy plaintext hashes or legacy session tokens; current users must be inventoried and notified.
7. Reconciliation has end-date and KPI-scope correctness questions.
8. Notify tokens have expiry and order binding, but lack purpose scope, replay protection, and rate limiting.

## 3. Migration 021/022/023 matrix

| Migration | Path / Git state / kind | Static review | Disposable PostgreSQL | Staging | Production |
|---|---|---|---|---|---|
| 021 | `supabase/migrations/proposals/021_revoke_anon_insert_order_tables.sql.draft`; root-untracked; proposal draft ignored by `*.sql` runners | **CHANGES REQUIRED** | **BLOCKED pending alignment** | **NO** | **NO** |
| 022 | `supabase/migrations/proposals/022_inbound_payment_events.sql.draft`; root-untracked; standalone proposal draft | **REVIEWABLE DESIGN, NOT DEPLOYABLE** | **BLOCKED pending architecture decision** | **NO** | **NO** |
| 023 | candidate `supabase/migrations/023_payment_integrity.sql`; candidate-untracked; executable SQL migration | **CHANGES REQUIRED** | **READY FOR DISPOSABLE TESTING ONLY** | **NO** | **NO** |

### Migration 021 — revoke anonymous order-table writes

**Effects.** Revokes INSERT/UPDATE/DELETE from `anon` and `authenticated` on `customers`, `orders`, `order_items`, `payments`, and `order_status_history`; drops their `Public insert ...` policies; checks table privileges and the ACL of `create_order_atomic(jsonb)`. It changes no tables, columns, or indexes.

**Dependencies and gaps.** It derives from migrations 002/011/013 and explicitly requires migration 016 because `has_function_privilege(...create_order_atomic...)` errors if the function is absent. Candidate runtime does not call `create_order_atomic`; root runtime does. Therefore it cannot be promoted for the candidate merely from its filename/order. Its comment says authenticated SELECT remains from 013, but 013's applied state is unknown. It has no explicit transaction; under `psql -f` autocommit, a later verification failure can leave earlier revokes committed. Its rollback reopens unrestricted INSERT policies and should be emergency-only, not a normal production rollback.

**Required before promotion.** Choose the target runtime (candidate legacy writer or root atomic writer); verify 002/011/013/016 state; add an explicit transaction strategy compatible with the runner; test anon/authenticated/service-role access and public checkout on disposable PG; add a migration-history/rollback runbook. It is not currently a valid executable migration.

**Verification SQL.** Query `information_schema.role_table_grants`, `pg_policies`, `has_table_privilege` for every role/table/verb, and `has_function_privilege` for PUBLIC/anon/authenticated/service_role on the exact `public.create_order_atomic(jsonb)` signature. Smoke both COD and banking order creation through the API.

### Migration 022 — inbound payment event proposal

**Effects.** Creates `inbound_payment_events`, unique provider identity `(provider, provider_transaction_id)`, two indexes, service-role RLS/grants, and `record_inbound_payment_event(jsonb)`. The RPC atomically inserts or increments delivery count. It intentionally does not write `payments` or `orders`.

**Dependencies and gaps.** Depends on `orders(order_id)` from 001. It does not depend on 021. It overlaps architecturally with 023's differently shaped `payment_events`; deploying both creates two ledgers and two identities without a single source-of-truth contract. It lacks an apply RPC, business rules, runtime callers, exact verification blocks, explicit rollback, retention/redaction/size rules for `sanitized_payload`, and real concurrency tests. On provider-ID conflict it increments a count but does not fail on a changed amount/fingerprint, potentially hiding a provider collision or tampered replay. Policy creation is not rerun-safe after a partial/autocommitted application.

**Required before promotion.** Decide whether 022 is abandoned in favor of 023 or becomes the canonical ledger; define redaction, retention, collision behavior, apply semantics and reconciliation ownership; add transaction/verification/rollback SQL and callers; test duplicates and concurrency. It is a useful design draft, not a deployable migration.

**Verification/rollback.** Verify exact columns, constraints, unique index, RLS, grants and function ACL; concurrently call the recorder with same and conflicting payloads. Rollback is `DROP FUNCTION ...` then `DROP TABLE ...`, but dropping the table destroys payment-event audit data and is not acceptable after live use.

### Migration 023 — payment integrity

**Effects.** Creates `payment_events`; adds nonunique lookup indexes; creates/reuses `uq_payments_order_transaction_code` and `uq_payments_one_paid_per_order`; drops the public payment-insert policy and revokes anon INSERT; creates security-definer `apply_payment_event(jsonb)` for unmatched, duplicate, underpaid, paid-order additional transfer, cancelled/completed-order transfer, and applied payment outcomes; writes payment/history/audit/event data in one RPC transaction; grants service-role-only execution.

**Runtime callers.** `src/app/api/orders/payment/route.ts` and `src/app/api/webhook/sepay/route.ts`. The webhook also directly inserts unmatched/invalid events into `payment_events`.

**Static blockers and risks.**

- Pre-existing duplicate `(order_id, transaction_code)` or more than one paid payment per order makes unique-index creation fail. A data-reconciliation decision is required; do not delete duplicates automatically.
- `IF NOT EXISTS` plus substring checks does not prove exact index identity. The paid index check merely searches for `payment_status` and `paid`; neither check proves `indisunique`, exact key order, exact predicate, validity/readiness, schema, or absence of extra expressions. A wrong same-name index can pass or block correction.
- `CREATE TABLE IF NOT EXISTS` only verifies that a table named `payment_events` exists, not its exact columns, checks, foreign key, RLS, policies, or grants.
- The file has no `BEGIN/COMMIT`. Its claim that any later `RAISE` rolls back the whole migration is runner-dependent and false under ordinary `psql -f` autocommit. Partial DDL/ACL state is possible.
- Same-order calls serialize on `SELECT ... FOR UPDATE`, which is sound for the main apply path. Unknown-order/direct event inserts do not have a unique provider-event constraint, so retries can create repeated unmatched rows.
- Payment transaction identity is unique per order, not globally/provider-wide; the same bank reference can be attached to different orders.
- Applying schema first is the correct expand step. Old service-role payment code should continue, but confirm this against the actual live ACL and 013 state. Applying application code first makes admin confirm and all webhook durable-write paths return 500 until both RPC and table exist. Repeated SePay delivery during a long gap increases load and still leaves a reconciliation blind spot because the missing table cannot store the event.
- The RPC stores a derived fingerprint but not gateway/account/note/sanitized payload, even though those variables are accepted. Decide whether this is adequate audit evidence.

**Rerun behavior.** Partially rerunnable: table/index creation and function replacement are tolerant, and the policy is dropped/recreated. It is not definition-reconciling: wrong pre-existing table/index definitions remain, and a prior partial apply may make results runner-dependent.

**Data loss/rollback.** The forward migration is additive except for revoking anon payment INSERT and adding constraints. Dropping `payment_events` loses audit data; dropping indexes removes enforcement but does not repair state; removing the RPC breaks new callers; restoring anon INSERT recreates a known security gap. Writes already made to orders/payments/history/audit are irreversible by schema rollback.

**Disposable test entry criteria.** Use an operator-named disposable clone with known 001-020 state and representative duplicates; record the applied set; use one explicit transaction policy; test clean apply, dirty-data failure, wrong same-name indexes/table, rerun, rollback, ACLs, concurrent admin/webhook delivery, unknown order/reference, and code-before/schema-before compatibility. This is why 023 is ready for disposable testing, not for staging.

**Exact pre-apply checks.**

```sql
SELECT current_database(), current_user, inet_server_addr();
SELECT table_name FROM information_schema.tables
 WHERE table_schema='public'
   AND table_name IN ('orders','payments','order_status_history','audit_logs');
SELECT column_name, data_type, udt_name FROM information_schema.columns
 WHERE table_schema='public' AND table_name IN ('orders','payments')
   AND column_name IN ('order_id','order_code','order_status','payment_status','final_amount','transaction_code');
SELECT order_id, transaction_code, count(*)
  FROM public.payments WHERE transaction_code IS NOT NULL
 GROUP BY order_id, transaction_code HAVING count(*) > 1;
SELECT order_id, count(*)
  FROM public.payments WHERE payment_status='paid'
 GROUP BY order_id HAVING count(*) > 1;
SELECT indexname, indexdef FROM pg_indexes
 WHERE schemaname='public'
   AND indexname IN ('uq_payments_order_transaction_code','uq_payments_one_paid_per_order');
SELECT * FROM pg_policies WHERE schemaname='public' AND tablename='payments';
SELECT has_table_privilege('anon','public.payments','INSERT');
SELECT version FROM supabase_migrations.schema_migrations ORDER BY version;
```

Post-apply verification must additionally inspect `pg_index`/`pg_get_indexdef`/`pg_get_expr(indpred, indrelid)` for exact unique definitions and validity, all `payment_events` columns/constraints/FK/RLS/ACLs, and exact function owner/security/search path/ACL. Then execute transactional behavior and concurrency tests; catalog inspection alone is insufficient.

## 4. Migration history uncertainty (013-020)

**DB STATE UNVERIFIED.** Files 013-020 are untracked in the root, absent from the candidate, and have no commits in `git log --all`. Repository files neither prove applied nor unapplied state. No `supabase/config.toml` or approved DB URL was available. Manual Supabase Dashboard application is plausible but unproven.

| Migration | Static relationship and operator check |
|---|---|
| 013 RLS | Recreates unrestricted public INSERT policies on five sensitive tables and authenticated reads. If applied, 023 closes only `payments`; the other four public INSERT policies remain until a corrected 021-equivalent is validated. Inspect `pg_policies` and grants. Do not apply 013 merely to fill history. |
| 014 freeship enum | Application reads/writes `discount_type='freeship'`, while 001 has only percentage/fixed_amount. Query `pg_enum`; without 014, hold freeship creation/use. Enum addition is effectively irreversible once used and transaction behavior depends on PostgreSQL version/runner. |
| 015 idempotency ledger | Root atomic order implementation depends on it; candidate does not. Verify table, `orders.idempotency_key`, constraints, indexes and RLS before selecting the root writer. |
| 016 atomic order RPC | Root runtime/tests depend on it; candidate does not. 021 explicitly checks its ACL. Verify exact signature, owner, security definer/search path, ACL and real concurrency before enabling. |
| 017 atomic cancel RPC | Root runtime depends on it; candidate cancellation does not. Verify added columns/signature/ACL and concurrent cancel/restock/voucher behavior. |
| 018 payment transaction index | Overlapped by 023. Check exact definition and duplicates; do not assume same name means same invariant. |
| 019 inventory adjustments | Root inventory code depends on its table/RPC; candidate does not. Verify schema, idempotency key, lock behavior and ACL. |
| 020 ledger delete policy | Depends on 019 and replaces the same RPC signature while changing FK/snapshots. Apply only after 019 review and data/backfill checks. |

Operator must capture: target/environment identity; backup/restore evidence; `supabase_migrations.schema_migrations`; table/column/constraint/index/function definitions; RLS policies and grants; enum values; function ownership/ACL; row counts and duplicate queries; and whether any objects exist without history rows (out-of-band apply). Do not recreate or apply historical files during discovery.

## 5. Proposed commit and push plan (do not execute)

| Group | Files | Review / push / deploy | Required schema and dependency | Rollback / accepted risk |
|---|---|---|---|---|
| A. Order presentation (first release) | `src/lib/orderUi.ts`; admin orders list/detail/reports; sale orders list; `tests/orderUiPresentation.test.ts`; narrowly scoped discount regression | Independently reviewable, pushable, and deployable. Build from verified base in a clean worktree; do not copy the whole candidate. | Existing order fields from 001; no 021-023. | Previous artifact/commit. Existing mutation risks are unchanged and explicitly out of scope. |
| B. Reconciliation read-only | engine, service, API route, page, reconciliation tests | Independently reviewable/pushable; deployment blocked by date/KPI decision and staged data smoke. | Existing 001 tables; authentication contract; no 023. | Revert app group; no DB writes. |
| C. Security/authentication/F-GUARD/F-PII | login/page, auth/member/presence/upload/change-password routes, `serverAuth.ts`, `orderStore.ts`, ReferralTracker, security/credential tests | Review only after OpenCode finishes and candidate is frozen. Do not split overlapping `orderStore.ts` blindly. | 006, audit table, secret, user hash/session migration plan. | Coordinated old/new session plan; no simple rollback after password migration. |
| D. Order creation/checkout integrity | API order route, `orderService.ts`, idempotency/request-hash/input helpers, checkout/create/POS/sale pages, focused tests | Review as one behavior unit. Not deployable until atomic/idempotent server path is selected and DB-tested. | If root design chosen: 014-017 as actually required, with 015/016 before code. | Feature flag/old writer only if it does not reintroduce duplicates; reconcile writes before rollback. |
| E. Payment schema | Corrected 023 plus PG integration tests and runbook | Review independently; apply to disposable DB, then staging as expand step. Push may be separate; deploy is coupled to group F. | Verified base schema/data; 018 state known. | Avoid destructive schema rollback; retain ledger and enforcement where possible. |
| F. Payment APIs/webhook/admin UI | payment route/page, webhook, payment/reconciliation tests | Review after E contract freezes. Deploy only after E is verified in the same environment. | Exact `apply_payment_event(jsonb)` and `payment_events`; auth and SePay secret. | Roll back code before RPC; monitor/replay queued webhook events safely. |
| G. Notify email | notify route, success page, purpose-scoped/dedup token service and tests | Separate review; not deployable in current form. | Auth secret plus durable send-idempotency/rate-limit design. | Disable sender/caller while retaining delivery ledger. |
| H. Product/voucher/inventory | Product/voucher/inventory APIs/services/UI and schema-specific tests | Split read-only catalog from mutations. Writes not deployable until schema/atomicity is verified. | 014 for freeship; 019/020 if root adjustment RPC is selected. | Product variant replacement and inventory writes need data-aware rollback. |
| I. Tests/docs | Regression tests, PG harness, runbooks and this audit | Pushable alongside the group they prove; docs may be separate. | Must state target and skips. | Revert docs/tests only; never use their presence as runtime proof. |

021 and 022 should not be forced into the sequence. 021 is promoted only with the chosen order writer and verified 013/016 state. 022 is promoted only if selected over, or explicitly integrated with, 023.

## 6. Deployment plan

### Staging

1. Freeze candidate work, record a commit SHA, and reconstruct group A in a clean worktree based on the verified commit.
2. Run targeted tests, changed-file ESLint, TypeScript, Next type generation, `git diff --check`, and production build on that clean artifact.
3. Deploy group A only. Smoke admin/sale order lists, detail and reports with read-only fixtures; verify no API/schema change and no create/payment feature changed. Monitor client exceptions and support feedback. Roll back the application artifact if needed.
4. In parallel, obtain an operator-named disposable PostgreSQL clone and record migration state. Rehearse corrected 023 and its concurrency suite. Do not use staging as the first database test.
5. After disposable PASS, back up staging, run prechecks, apply corrected 023 as an explicit expand transaction according to the runner, verify exact catalog/ACL/data invariants, then deploy payment code. Do not reverse this order.
6. Test webhook/admin concurrency, duplicates, under/overpayment, cancelled/completed orders, reconciliation and alerting. Observe SePay retries/500s and `payment_events` classifications for at least the agreed soak window.

### Production

Production requires: frozen reviewed commits; green full/targeted suites with no unexplained failure; changed-file lint and production build; non-skipped disposable and staging PG concurrency; backup/restore proof; live schema/history inventory; operator decisions on auth rate limiting, session/password compatibility, order idempotency, reconciliation semantics, POS payment policy, notification replay/rate limits, and 022-vs-023; release/rollback owners; monitoring queries and alert thresholds.

For payment release: apply verified schema expand first, verify, deploy callers, smoke one controlled transaction, monitor and reconcile. Never deploy callers first on the theory that SePay retries make repeated 500s safe.

## 7. Blockers

### Code defects

- No server order idempotency; non-atomic order side effects and success despite item/history write failure.
- Canonical order-code divergence in admin/sale/POS; POS cash/QR lacks server payment truth.
- Product simple-stock schema mismatch and non-atomic destructive variant upsert.
- Reconciliation end-date and KPI-scope issues.
- Authentication legacy-hash upgrade is unreachable; no login rate limit; localStorage PII remains.
- Notify proof is replayable and purpose-agnostic; no rate limit or send idempotency.
- Current candidate suite and lint are not green.

### Operator decisions

- Final F-GUARD/F-PII scope and freeze point.
- Server order-idempotency/atomic-writer design.
- POS cash and QR source of truth.
- Reconciliation KPI/filter contract.
- Password/session migration and rate-limit platform.
- Payment identity scope, split/overpayment policy, event retention, and whether 022 is superseded by 023.
- Notification trigger, replay and rate-limit policy.

### Database uncertainty

- **DB STATE UNVERIFIED** for 013-023 and for any out-of-band Dashboard execution.
- Existing payment duplicates and paid-row multiplicity unknown.
- 014 freeship enum and 015-020 objects unknown.
- No approved disposable URL and no non-skipped PostgreSQL/concurrency evidence.

### Environment and documentation

- Production build and Next type generation not rerun on a clean frozen artifact.
- Candidate has no PG integration suite for 023.
- Migration 023's transaction guarantee depends on an undocumented runner behavior.
- Existing readiness documents contain stale counts and an overconfident rollback claim; they must be corrected, not overwritten.

## 8. Final recommendation

- **Which subset can release first?** Group A only: the isolated order-presentation helper and four display/list/report pages, after rebuilding it in a clean worktree and completing a clean build plus staging smoke. Optionally evaluate read-only catalog separately, but it is not part of the candidate delta.
- **Which features remain on hold?** All order creation/checkout writes, admin/sale/POS mutation flows, authentication/session changes, payment confirmation/webhook, notify email, product/variant/voucher/inventory writes, and reconciliation until its semantics are resolved.
- **Are 021 and 022 valid and ready for review?** They are valid proposal drafts for design review, not valid executable migrations. 021 is misaligned with the candidate and depends on verified 016/013 state; 022 conflicts/overlaps with 023 and lacks an approved apply architecture.
- **Is 023 ready for disposable PostgreSQL testing?** **Yes, for disposable testing only**, specifically to test the identified dirty-data, exact-definition, runner-transaction, ACL and concurrency failures. It is not staging- or production-ready and should be corrected based on that rehearsal.
- **Before staging:** freeze commits; make candidate tests/lint/build reproducible; decide reconciliation/auth/order/POS/payment policies; inventory schema/history/data; correct 023; pass non-skipped disposable PG tests and backup/restore rehearsal.
- **Before production:** complete staging schema/application smoke, real SePay concurrency/retry tests, authentication compatibility and rate limiting, server order idempotency, monitoring/alerting, rollback ownership, and soak/reconciliation with no unexplained discrepancies.
- **Safest next action:** create a clean worktree at `1c51af625a575a41733d59b29cc9be9ae0892c60`, copy only group A, run its complete clean-artifact gate, and stage that presentation-only release while OpenCode finishes F-GUARD/F-PII and the operator provisions a disposable PostgreSQL clone for 023.

## 9. Safety confirmation

No commit, push, merge, rebase, cherry-pick, checkout, stash, reset, deployment, migration application, or database write was performed. No production or staging system was contacted. No existing user/OpenCode change was discarded or overwritten. The candidate remained read-only. The only repository file created by this audit is `docs/engineering/CODEX_PARTIAL_RELEASE_MIGRATION_READINESS.md` in the root worktree.
