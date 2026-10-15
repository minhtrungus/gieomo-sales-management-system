# CODEX PR REVIEW READINESS REPORT

Date: 2026-10-15  
Branch: `integrated/r1-recon-p0a3-security`  
Reviewed base: `origin/main` at `9fdfc7011ca100facb5203800c10247155c7ab05`  
Starting feature HEAD: `7c95b22fb0f01194319519cf9320f6f52875568f`

## Verdict

Ready for a **draft PR and code review**, but not merge-ready and not approved
for staging or production. The migration chain and PostgreSQL behavior pass on
a clean disposable database. ESLint remains non-zero, and the real target
migration ledger, schema, backup/restore and runtime configuration are unknown.

## Migration security review

| Migration | Review result |
|---|---|
| 021 | Exact V015 prerequisite; preserves the old ledger as a read-only archive, preserves the old order key, and disables legacy create/cancel writers. No coercion or deletion. |
| 022 | Correctly removes runtime INSERT/UPDATE/DELETE from five order-domain tables, but intentionally left authenticated SELECT policies from 013. |
| 023 | Creates the durable payment-event ledger, transaction and one-paid indexes, and service-only atomic payment RPC. Additional transfers remain reviewable pending rows. |
| 024 | Replaces the 023 RPC contract for cash replay/state validation while retaining service-only EXECUTE. |
| 025 | Uses a scoped UUID idempotency ledger, advisory/row locks, server-side price/voucher calculation, atomic stock deduction, history and audit. |
| 026 | Wraps 025 to persist immutable inventory reservations; cancellation locks the order, validates provenance, restores stock/voucher once, preserves paid state and emits `refund_required`. |
| 027 | New forward security repair: removes authenticated PII/order reads, removes runtime access to the legacy stock RPC, and replaces permissive future-object default ACLs. |

Catalog review after 026 found two concrete bypasses: authenticated had global
`SELECT USING (true)` on customers/orders/items/payments/history, and
`deduct_variant_stock_atomic(uuid,integer)` was executable by
PUBLIC/anon/authenticated because of migration 002 default privileges. They are
fixed additively by 027; historical migrations were not edited.

Fresh PostgreSQL 18.6 replay of 001-027 exited 0 and the read-only detector
reported `V025`. Real catalog/role tests confirm:

- anon/authenticated have no SELECT/INSERT/UPDATE/DELETE on the five sensitive tables;
- no runtime RLS policy remains for those tables;
- create, cancel, payment, inventory-adjust and legacy-deduct RPCs are service-role only;
- authenticated execution is denied while service-role cancellation is callable;
- future table/sequence/function defaults no longer grant runtime access.

Rollback strategy remains restore/forward-repair. Do not delete the V015
archive, rewrite migration history, coerce old idempotency keys, or infer legacy
combo reservations. Migration 027 is privilege-only; emergency rollback would
require an explicit, reviewed least-privilege grant, not restoration of the old
`USING (true)` policies or permissive defaults.

## Test coverage reviewed

| Area | Actual evidence |
|---|---|
| Atomic creation | replay/lost response, hash conflict, stock/voucher contention, no oversell, server pricing, combo failure |
| Cancellation | first/retry/concurrent cancel, direct/combo provenance, legacy fail-closed, terminal state, paid-cancel/refund-required |
| Rollback | order-items, status-history and audit failures; voucher unsafe state; payment audit failure |
| Payment | cash/banking, exact replay, concurrent replay, single-paid index, amount/state rejection, unsupported method |
| Authorization/RLS | real role/catalog checks plus actual authenticated-denied/service-role-allowed RPC calls |
| Webhook auth | missing key fails closed; rejected credentials are never logged |

Focused suite: 47/47 passed, 0 failed, 0 skipped. Full clean suite: 143/143
passed, 0 failed, 0 skipped. The previously recorded 7c95b22 artifact remains
135/135; this batch adds eight security assertions.

## ESLint triage

ESLint remains **FAIL** (exit 1): 270 errors and 188 warnings across 84 files.
`origin/main` is 278 errors and 188 warnings, so the prospective feature has a
net delta of -8 errors and 0 warnings. There are zero positive file/rule-count
deltas after this batch's four introduced warnings were removed.

| Group | Count | Priority / plan |
|---|---:|---|
| `no-explicit-any` | 205 errors | Scoped schema/domain typing; prioritize 97 domain-area errors, avoid broad mechanical replacement |
| `set-state-in-effect` | 40 errors | Refactor lazy initialization/subscriptions with UI regression tests |
| `immutability` / `purity` | 12 errors | High priority: remove render/state mutation before merge decision |
| `preserve-manual-memoization` / `exhaustive-deps` | 8 | Review stale closure and dependency ownership |
| `no-require-imports` / `prefer-const` | 8 errors | Low-risk scoped cleanup |
| `no-unused-vars` | 181 warnings | Remove with owning feature changes, not repo-wide auto-fix |
| Next navigation/image warnings | 4 warnings | Separate UI modernization |

Of the remaining findings, 63 errors/67 warnings are in files touched by the
prospective feature history and 207 errors/121 warnings are in untouched files.
The complete file/line/rule/risk/plan inventory is
`docs/engineering/CODEX_PR_ESLINT_FINDINGS.csv` (458 rows). No lint rule was
disabled and no repository-wide auto-fix was used.

## Verification

| Check | Result |
|---|---|
| Fresh disposable migration replay 001-027 | exit 0; preflight `V025` |
| Focused PostgreSQL/security suite | 47/47 pass, 0 skip, exit 0 |
| Full suite | 143/143 pass, 0 skip, exit 0 |
| `next typegen` | exit 0 |
| `tsc --noEmit` | exit 0 |
| Next.js 16.3.5 production build | exit 0; 48/48 static pages |
| ESLint | exit 1; 270 errors, 188 warnings |

Build logged missing Supabase environment variables during guarded static data
fetches but completed. No staging/production SQL or deployment was performed.

## Proposed draft PR

Title: `Harden atomic order/payment migrations and reconcile chain through 027`

The PR body must state that migrations 021-027 are pending on real targets;
001-020 application is operator-reported but not ledger-verified; clean
PostgreSQL and test/build gates pass; lint remains failing; and staging requires
ledger/catalog export, V015 preflight, restorable backup, named execution and
rollback owners, maintenance window, runtime secrets/configuration and smoke
tests. The PR must remain draft and must not be merged by automation.
