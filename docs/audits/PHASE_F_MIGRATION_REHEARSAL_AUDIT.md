# Phase F — Migration Rehearsal & Production Schema Audit

Generated: **2026-10-16**. Read-only against Production; local rehearsal used a disposable PostgreSQL 18.6 cluster.

## 1. Clean-chain replay (fresh evidence, 2026-10-16)

Command: `powershell -ExecutionPolicy Bypass -File scripts/postgres/replay-canonical-migrations.ps1 -Port 55441`

Result:

- Disposable loopback cluster `gieomo_canonical_a707573255` created, migrated, tested, stopped, and removed.
- **CANONICAL_REPLAY_PASS**: all 30 migration files (001 → 030) applied in order.
  Advisory notices only (idempotency `skipping` guards, `plpgsql_check` unavailable on vanilla PG).
- SQL behavior gates inside the same run:
  - `PAYMENT_INTEGRITY_PG_PASS` (023/024 contract suite).
  - `ORDER_INTEGRITY_PG_PASS` (016/017/025/026 suite).
  - `MANDATORY_PG_PASS files=9 skipped=0` — 49 TAP tests, 49 pass, 0 fail (stock atomicity,
    order atomicity, idempotency races, cancel/recovery, payment idempotency, voucher slot CAS,
    payment rejection, combo persistence, ACL privileges).

## 2. What the replay proves vs. what it cannot

| Claim | Proven? |
|---|---|
| Canonical migration chain 001→030 applies cleanly in order on PostgreSQL 18.6 | YES |
| The 9 mandatory SQL suites (payment/order/combo/voucher/ACL) pass on that chain | YES |
| Production has this state | **NO** — see §3 |
| A restore drill from a real backup works | NO — Phase E BLOCKED |

**Rehearsal must still be considered BLOCKED for the migrate-Production purpose**: no Production-shaped
clone exists (cannot `pg_dump`/`db pull` stage: no Docker, no DB password), so the replay is a code-level
rehearsal, not a snapshot-restore rehearsal.

## 3. Production migration fingerprint (read-only survey)

Direct observations (f05/f06/d11/f07 plus policy/grant file checks):

| Migration | Applied on Production? | Evidence |
|---|---|---|
| 013 (public-read/insert RLS on orders domain) | YES | `Public insert`/`Public read` policies present (07_policies.json) |
| 014 (freeship discount_type) | YES | `discount_type` enum includes `freeship` (f04) |
| 015 (order_idempotency table) | YES | table exists (d11); **0 rows, all 63 orders keyless** |
| 016–017 (`create_order_atomic`, `cancel_order_atomic`) | YES | functions present (f05) |
| 018 (unique payments tx index) | YES | constraint visible in 03_constraints.json (payments table empty) |
| 019 (+020?) (`adjust_variant_stock`, ledger) | YES (019) | function present (f05); ledger queries succeed (d10: 0 rows) |
| 022 (`revoke runtime order DML`) | **NO** | `anon`/`authenticated` EXECUTE on `deduct_variant_stock_atomic`; runtime insert policies still present |
| 023–024 (payment_events table, `apply_payment_event` RPC, repair cash contract) | **NO** | no `payment_events` table, no `apply_payment_event` function |
| 025 (atomic idempotent order creation rewrite) | **NO** | create_order signature matches old `p jsonb` only; no `_gieomo_order_*` helpers visible |
| 026 (atomic cancellation + logs) | **NO** | cancel RPC lacks the 026-era audit columns/behavior (older signature only) |
| 027–028 (close runtime read/RPC bypasses, least privilege) | **NO** | grants as above |
| 029 (`reject_payment_atomic`) | **NO** | function absent |
| 030 (atomic combo persistence) | **NO** | function absent |

Migration ledger: **0 rows** (f06) — no authoritative record; this fingerprint is derived from
catalog introspection (columns/functions/policies/grants).

## 4. Deploy plan consequence (ties to Phase C S1)

- Safe order for Production: apply 020→026 (+027, 028, 029, 030) in canonical order AFTER taking a
  restore-capable backup (Phase E gate). 022/028 revoke paths must be applied together with the S1
  app deploy that already uses RPC-only writes; otherwise checkout breaks.
- The `idempotency` schema (015/021 tables) is already present but EMPTY — S1 writer can start
  writing keys without conflict.
- 023 introduces `payment_events` — deploy before re-pointing the payment writers (already coded).

## 5. Risks observed during rehearsal environment

- Local environment intermittently held (from a previous session) a stale disposable cluster on
  port 55441; it was identified (pid + commandline under `.tmp/postgres-canonical-*`),
  stopped, and cleaned. Fresh run succeeded.
- Rehearsal runs include fuzz-adjacent NOTICEs — all reviewed, no ERRORS.
- `plpgsql_check` lint remains NOT RUN (extension unavailable outside Supabase).
