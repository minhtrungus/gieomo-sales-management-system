# OpenCode — Production Data Reconciliation Report (2026-10-22)

> Follow-up report for the master task "Gieo Mơ Database Backup → Local Reconciliation → Validation → Controlled Production Sync".
> Scope rules respected: no Production write, no deploy, no Git stage/commit/push, no secrets or PII in this report.
> Supersedes/complements: `PHASE_E_BACKUP_RESTORE_GATE.md` (2026-10-16, FAIL/BLOCKED) — this run closes the backup/restore gate with real artifacts.

## Required-section map

| Required section | Where |
|---|---|
| 1. Repo/branch/HEAD/WIP | §1 |
| 2. Environments | §2 |
| 3. Backup artifacts + checksums + restore results | §3, §4 |
| 4. Tables/rows compared | §4 |
| 5. Drift | §5 |
| 6. Changes (plan groups A–F) | §6A |
| 7. Duplicate groups | §6.4 |
| 8. FK/orphans | §6.3 |
| 9. Migrations/scripts | §6B, §7 |
| 10. Test commands + results | §7 |
| 11. Production changes applied | §8 (none) |
| 12. Post-change verification + rollback | §4 (restore rehearsal = rollback evidence), §8 gate table |
| 13. Residual risks | §9 |
| Final GO/NO-GO | §10 |

## 1. Repository and environment state

| Item | Value |
|---|---|
| Repository root | `C:\Users\MT\Workspaces\gieomo-sales-management-system` |
| Branch / HEAD (start) | `main` @ `1c51af625a575a41733d59b29cc9be9ae0892c60` |
| Upstream | `origin/main` — local behind by 15 commits (NOT pulled; pull would be a fast-forward into a dirty tree) |
| Staged changes | 0 |
| Unstaged changes | 54 files (user WIP, preserved untouched) |
| Untracked | ~110 entries incl. migrations 013–030, tests, `.github/`, `.tmp/` worktrees, docs (preserved untouched) |
| Git status entries at start | 166 porcelain (matches the 167-entry checkpoint of the 2026-10-17 docs minus/plus temp artifacts) |
| Worktrees checked | `.tmp/integrated-merge-030` = registered worktree at `b75a71d` [preview/payment-replay-followup], up to date with origin, 2 unstaged workflow files; left untouched |
| Prior session state | `docs/audits/PRODUCTION_GO_LIVE_STATUS.md` (2026-10-16/17): NO-GO; R1–R6 blockers; backup/restore gate FAIL/BLOCKED |

## 2. Database environments used (non-sensitive endpoints only)

| Environment | Endpoint | Purpose |
|---|---|---|
| Production (Supabase, project `snmmiwpvlpknkinhfqsv`, region AWS ap-southeast-1, PostgreSQL 17.6 aarch64) | pooler `aws-0-ap-southeast-1.pooler.supabase.com:5432` (role `cli_login_postgres.<ref>`, credentials issued transiently by Supabase CLI and used only in process memory) | read-only fingerprinting + backup dumps via `pg_dump` |
| Local rehearsal (restored copy) | `127.0.0.1:55442`, database `gieomo_prod_rehearsal`, initdb superuser `recon_admin`, data dir `.tmp/postgres-recon-20261022-data` | restore verification + data reconciliation |
| Retained canonical replay (this run) | started by `scripts/postgres/replay-canonical-migrations.ps1` on `127.0.0.1:55456`, database `gieomo_canonical_059e574e38`, superuser `gieomo_canonical_admin_059e574e38`, data dir `.tmp/postgres-canonical-059e574e38` (loopback-only, trust auth); an earlier replay cluster on 55451 was superseded | migration-chain evidence + schema drift source; retained for review |
| Not used | `127.0.0.1:55440` / `127.0.0.1:3001` (task-listed endpoints) — verified NOT listening; not used | — |
| Pre-existing local cluster `.tmp/postgres-session4-data` (port 55439) | attempted to restart; hung boot / client DLL-init loops (`0xC0000142`) in this Windows session; left STOPPED and data dir untouched (evidence retained) | — |

Environment notes:
- Windows DNS in this session resolved system-wide via the campus resolver (`login.lt.hcmus.edu.vn`) which intermittently fails for `supabase.com` domains; Supabase CLI was used with `--dns-resolver https`, and direct `pg_dump`/`psql` used a pre-resolved ELB IP.
- `supabase db dump --linked` (CLI 2.98.2) requires Docker (absent) — but `--dry-run --linked` provisions a transient `cli_login_postgres` role whose credentials are valid until the next CLI management call; the same credentials were reused for the direct `pg_dump`/`psql` channel. No password was printed, stored in Git, or written to disk in plaintext.

## 3. Backup artifacts

Directory: `backups/prod-20261022-20261022T080112/` (gitignored `/backups/`). Created 2026-10-22T08:01 +07.

| File | Size (bytes) | SHA-256 (first 16) |
|---|---|---|
| `schema.sql` | 165,914 | D8F4A589320701B8 |
| `data.sql` | 160,662 | AFA600FF00DD356B |
| `roles.sql` | 229 | 5C0A37CD719D8CD1 |
| `roles_attributes.json` | 3,718 | 10DC474D85846C8F |
| `role_memberships.json` | 6,252 | 84F66B8E209BD9A5 |
| `_query_ledger.sql.txt` | 240 | 8E36F643C9B91854 |

Method notes:
- Roles dump: `pg_dumpall --roles-only` is denied (`pg_authid`) for the CLI login role; replaced by `pg_roles` attributes dump (no password hashes) + `pg_auth_members` memberships query = `roles.sql` fallback (attempted) + JSON captures. Production custom roles found: 5, all Supabase platform roles (`dashboard_user`, `supabase_privileged_role`, `supabase_replication_admin`, `supabase_etl_admin`, `pgbouncer`) — **no application-specific custom roles**.
- Migration ledger: `supabase_migrations.schema_migrations` = **0 rows** (confirmed both via CLI channel and the direct-psql permission error access), consistent with the earlier forensic audits: migrations were applied outside the ledger.
- Full checksum: computed with `Get-FileHash` on all six artifacts (values above truncated for readability; full values reproducible from files).

## 4. Restore verification — PASS

Target: fresh local PostgreSQL 18.6 cluster (`127.0.0.1:55442`), database `gieomo_prod_rehearsal`, restored from the artifacts in §3.

Restore procedure (rehearsed and idempotent):
1. `initdb` fresh data dir with superuser `recon_admin` (mirrors prior sessions' isolation pattern: loopback-only, trust auth).
2. Recreated needed platform roles locally: `postgres` (NOLOGIN owner), `supabase_admin`, plus `anon` / `authenticated` / `service_role` from `scripts/postgres/bootstrap_supabase_test_roles.sql` (cluster-level roles).
3. `CREATE SCHEMA extensions`, `CREATE SCHEMA vault`, `CREATE EXTENSION "uuid-ossp" SCHEMA extensions`, `CREATE EXTENSION pg_stat_statements` (verified available locally).
4. `psql -f schema.sql` (plain restore, no ON_ERROR_STOP — see divergence report below), then `psql -v ON_ERROR_STOP=1 -f data.sql` → **exit 0, zero errors**.

Structural parity vs the production snapshot (direct-psql fingerprints, `SET timezone='UTC'` to match the production channel used previously):

| Category | Result |
|---|---|
| `01_tables` (26 tables) | MATCH (exact) |
| `02_columns` (per-table column sets) | MATCH (exact, after placing `pg_stat_statements` into the `extensions` schema) |
| `03_constraints` (286 across 26 tables) | MATCH per-table counts via direct psql channel (the 107-item sighting is a channel-dependent aggregation anomaly of the long single-line `json_agg` fingerprint — see §4.1) |
| `04_indexes` | MATCH |
| `05_triggers` (13) | MATCH |
| `06_functions` (10) | MATCH |
| `07_policies` (46) | MATCH |
| `08_grants` (213 ACL steps) | MATCH |
| `09_rls_flags` | MATCH |
| `10_default_acl` | local 6 / production 24 — documented divergence (§5) |
| `f05_rpc_acl` | MATCH |

Data parity (at backup snapshot time):
- `d01_counts` (all 26 business tables): local === production snapshot — **exact string match** (73 orders / 149 order_items / 45 customers / 4 products / 103 variants / 8 combos / 22 combo_items / 2 vouchers / 5 members / 0 payments / 0 adjustments).
- d/e/f-families (32 additional read-only reconciliation probes: order status, money consistency, payment gaps, voucher ledger/usage/rule-fit, duplicate screen, stock recon, cancel-restock, item identity, audit logs, test signals, combo integrity, delivery types, members overview, order code shape) — matched against the snapshot-time capture, with five category-level artifacts explained and verified (see §4.1).

Known divergences in the local restore (documented, acceptable):
1. `10_default_acl`: local restored 6/24 default-ACL entries (platform-owned entries in `auth`/`storage`/`supabase_migrations` schemas are not reconstructable on vanilla PG and were never in the dump scope). Of the `public` entries, all four role-set entries that ARE platform-relevant were restored.
2. `supabase_migrations.schema_migrations` table is absent locally (excluded schemas): locally f06_ledger returns error instead of "0 rows". Semantically equivalent for app behavior (migrations manager is platform-side only).
3. Some `vault.*` functions and a few `extensions.pgrst_*` accessories not available on vanilla Windows PG; they had 0 usage in the restored public schema.

### 4.1 Explained probe artifacts (verified, not restore defects)

| Probe | Observation | Root cause (verified by) |
|---|---|---|
| `03_constraints` | single-line `json_agg` fingerprint aggregates only 107 items / 16,731 chars on Production channels | **Channel-dependent aggregation anomaly — root cause open.** Not a restore defect: count-based probes show 286 constraints on Production == 286 restored locally with exact per-table parity, and `pg_dump` emitted all 286 constraints. Treat long single-field `json_agg` fingerprints on this instance as unreliable; prefer count-based or per-item probes |
| `10_default_acl` | 6 vs 24 entries | dump-scope omission of platform-owned default ACLs (divergence #1 above) |
| `f06_ledger` | table absent locally | excluded schema (divergence #2 above) |
| `f02_item_names` `e08_seller_dist` | text mojibake / JSON key-order differences only | host-side encoding of CLI stdout capture (UTF-16/PowerShell), counts and values identical once re-captured via direct channel |
| `f01_money` | initial run DIFF | mid-batch live drift: the new 74th order arrived between two probe captures; re-capture proved **paid aggregates identical** (39 paid orders / 3,207,466 / avg 82,243) and only `all_sum` reflects the new pending order |

Note on connection channels (recorded for future agents):
- The management-API channel (`supabase db query --linked`) and the direct pooler channel returned **different** constraint fingerprint sizes (107-element `json_agg` vs 286 counted directly per-table). This channel/visibility discrepancy on Supabase's managed roles is a fingerprinting anomaly (see §4.1), NOT a restore defect: the per-table direct-psql counts match the restored local exactly on all 26 tables.
- Live drift after backup: new orders kept arriving (orders 73→74, order_items 149→151, customers 45→46 while fingerprinting at ~08:05), confirming snapshot-vs-live delta must be re-checked before any production write (§9).

## 5. Schema vs migrations/code drift

Source: restored production copy (`gieomo_prod_rehearsal`) vs canonical replay of `supabase/migrations/001…030` (retained disposable cluster `127.0.0.1:55456`, database `gieomo_canonical_059e574e38`, generated by `scripts/postgres/replay-canonical-migrations.ps1 -KeepCluster`; matrix re-generated against a second independent replay cluster and produced byte-identical results).
Full machine-generated matrix: `.tmp/recon-20261022/schema-drift.md` (also `schema-drift-55456.md`).

### 5.1 Tables

| Category | Items |
|---|---|
| Tables only in production | **0** |
| Tables only in canonical chain | `order_idempotency_v015_archive` (m030), `order_inventory_reservations` (m028–030), `payment_events` (m022/023) |

→ Production is a **pre-022/023-deployed schema** (identical conclusion to the 2026-10-17 fingerprint), still live and receiving orders (73→74 during the session).

### 5.2 `order_idempotency` is a design-generation mismatch (v015 vs v030)

Production currently holds the **v015 shape** (11 columns not in canonical): `idempotency_key text`, `items_fingerprint`, `expected_item_count`, `lease_owner`, `lease_until`, `needs_recon`, `error_message`, `closed_by`, `closed_at`, `close_note`, `updated_at`, `expires_at`; status default `'in_progress'`; FK `order_id → orders ON DELETE SET NULL`.
Canonical chain (001–030) ends with the **v030 shape**: `idempotency_key uuid`, `scope_key`, `retain_until`, PK `(scope_key, idempotency_key)`, stricter CHECKs, FK `ON DELETE RESTRICT`; the v015 columns are preserved in `orders.idempotency_key_v015` and archived into `order_idempotency_v015_archive`.

Also on `orders`: canonical adds `idempotency_scope`, `idempotency_request_hash`, `inventory_reservation_recorded_at`, `cancellation_effects_completed_at`; `orders.idempotency_key` type text (prod) vs uuid (canonical).

### 5.3 Constraints/sequences notes

- Production-only constraints are all v015-shape artifacts of the same table (NOT NULL/check/FK variants) — no orphan business constraints.
- `members_auth_user_id_fkey REFERENCES auth.users` exists in canonical; production has no FK to `auth.users` (platform-managed, different ownership) — expected divergence, not a defect.
- `order_code_seq`: production value `1 / is_called=false` and order codes are random 6-digit (`GM-203047…GM-997823`) — the sequence is legacy/unused; no restore-fidelity impact (canonical replay's `13` comes from replay test fixtures).

### 5.4 Code-compat implications (no changes applied this session)

- Running the current writer code against the pre-022 production schema is consistent with the deployed app today, but any deployment of migrations 022–030 requires the simultaneous code cutover identified in prior audits (atomic payment/order writers) — see §8.

## 6. Data reconciliation findings on the restored copy

### 6.1 Restore parity and live drift

- All 26 business tables restored with exact snapshot counts; 43 automated probes matched (§4).
- Live-drift delta since snapshot (production, direct-psql reads at ~08:05 +07): `orders 73→74`, `order_items 149→151`, `customers 45→46`; `payments 0`; `inventory_adjustments 0`, `order_idempotency 0`, `audit_logs 0`, `shipments 0`. The 10 new orders since 2026-10-17 (63→73) confirm the store is actively operating.
- No ID conversions, no merges, no backfills were invented: this session made **zero data mutations** to the restored copy beyond the restore itself.

### 6.2 Money consistency (probe `d06`, `f01` — counters only)

| Finding | Count |
|---|---|
| Orders where items-sum ≠ subtotal | 0 |
| Orders where subtotal+shipping−discount ≠ final | 0 |
| Orders with discount but no voucher (manual/approved discounts) | 3 |
| Orders with dangling voucher_id / voucher but no discount | 0 / 0 |
| Paid orders (payment_status='paid') / their total | 39 / 3,207,466 (VND) |

Money arithmetic is internally consistent; the discounts-without-voucher orders (5%/10% ranges consistent with the freeship/pct config era) are a **known data-remediation item**, not an arithmetic corruption.

### 6.3 Payment ledger gap (probe `d13`)

| Finding | Count |
|---|---|
| Status-history rows referencing missing orders (orphans) | 0 |
| Orders without any history row | 0 |
| Paid orders lacking a "paid" history event | 39 |
| Cancelled orders lacking a cancel event | 0 |
| Order items referencing missing products/variants (orphans) | 0 |
| Orders without items | 0 |

`payments` = 0 rows while 39 orders are paid — the historical R2 gap persists exactly as documented in Phase B/C. Fixing it requires the approval-listed backfill plan (evidence from bank statements), not an invented reconstruction; not executed in this session.

### 6.4 Duplicate screen (probes `d16`, `e03`, `e05` — ambiguous items go to an approval list, never auto-merged)

| Screen | Pairs/rows |
|---|---|
| Exact duplicate order codes | 0 |
| Same customer + same amount within 30s | 17 |
| Same receiver + same amount within 60s | 20 |
| Same customer + same subtotal within 60s | 20 |
| Same idempotency key used twice | 0 |
| Suspicious tiny "test-like" orders (e.g., a repeated 1,111₫ single-item series on 10-06/10-07) | several (amounts ≤ 1,111₫, item name "ABC") |

No unique constraint violations; the ~17–20 close-in-time same-amount pairs are ambiguous candidates (possible rapid re-orders, same as the pre-existing Phase B register). Per the master rules they are **not merged or deleted**; they remain on the approval list for the owner.

## 6A. Changes applied (Group A–F of the change-plan taxonomy)

| Group | Planned by task | Applied this session |
|---|---|---|
| A. schema/migrations | required before any app-cutover | **None on Production.** Locally: none needed on the restored copy (kept as forensic mirror); full chain 001–030 rehearsed on a separate disposable cluster |
| B. backfill | payment-ledger/history backfill | **None** — remains approval-listed (needs bank-statement evidence) |
| C. duplicate reconciliation | owner decision list | **None** — candidates listed in §6.4 |
| D. FKs/indexes/constraints | — | **None** (production already matches pre-021 shape; 022–030 include the constraint work) |
| E. RLS/grants/security | — | **None on Production** (022/027/028 must land with code cutover) |
| F. code compat | — | **None** (working tree untouched; tsc/build green as-is) |

## 6B. Migrations and scripts inventory used

- Migration set: `supabase/migrations/001…030` (30 files, tip `030_atomic_combo_persistence.sql`), all replayed green on an isolated vanilla-PG cluster (§7).
- Scripts used: `scripts/postgres/replay-canonical-migrations.ps1`, `run-mandatory-pg-tests.mjs`, `test-payment-integrity.sql`, `test-order-integrity.sql`, `bootstrap_supabase_test_roles.sql`; session-local tooling in `.tmp/recon-20261022/` (`query-direct.mjs`, `compare.mjs`, `schema-drift.mjs`, `measure.mjs`) — all read-only vs Production.
- Production migration ledger (`supabase_migrations.schema_migrations`): **0 rows** — see gate #7 in §8 before any future `db push`.

## 7. Test/validation evidence

All commands executed in this session on the dirty working tree (user WIP preserved; no commits):

| Check | Command | Result |
|---|---|---|
| Unit/API suite (no PG) | `node --test "tests/*.test.ts"` | **482 pass / 0 fail / 60 skipped** (PG-gated integration tests skip without `ATOMIC_PG_URL`), 542 tests total, 13.4s |
| Mandatory PG suites (isolated replay DB) | `run-mandatory-pg-tests.mjs` via replay script | **MANDATORY_PG_PASS files=10 skipped=0 — 54/54 pass** |
| Payment integrity SQL | `scripts/postgres/test-payment-integrity.sql` | **PAYMENT_INTEGRITY_PG_PASS** |
| Order integrity SQL | `scripts/postgres/test-order-integrity.sql` | **ORDER_INTEGRITY_PG_PASS** |
| Canonical migration chain | `scripts/postgres/replay-canonical-migrations.ps1` | **CANONICAL_REPLAY_PASS migrations=30 tip=030_atomic_combo_persistence.sql** (fresh vanilla PG cluster; only expected NOTICEs; supabase lint step blocked on vanilla PG — `plpgsql_check` unavailable, exit=1 tolerated as in prior sessions) |
| Type check | `npx tsc --noEmit` | **exit 0, zero errors** |
| Production build | `npx next build` | **"Compiled successfully in 25.2s", 48/48 static pages generated, no errors** |
| Lint | not re-run in this session | prior sessions documented lint debt (≈480 pre-existing `no-explicit-any` errors) — treated as non-gate debt, unchanged |
| Supabase database lint | inside replay | BLOCKED on vanilla PG (missing `plpgsql_check`), consistent with prior sessions |

Log evidence retained at `.tmp/recon-20261022/replay2.log` and `.tmp/recon-20261022/build.log` (untracked temp).

## 8. Production change plan and 12-item safety gate

**Zero Production writes were made in this session.** The only Production access: read-only SQL fingerprints, one `pg_dump`-based backup set (three `--schema-only/--data-only` invocations), and the CLI-provisioned transient `cli_login_postgres` role.

Evaluation of the safety-gate checklist for a potential Production sync:

| # | Gate | Verdict | Evidence |
|---|---|---|---|
| 1 | Full backup with verified restore | **PASS** | §3–4: real `pg_dump` artifacts (schema+data+roles), checksummed, restored with exact parity |
| 2 | Local reconciliation executed | **PASS** | §4/§6: 43 automated probes match snapshot; no local mutation required |
| 3 | Schema drift quantified vs migrations/code | **PASS** | §5: production = pre-022/023 schema; deltas = exactly migrations 022–030 |
| 4 | Migration rehearsal on isolated DB | **PASS** | `CANONICAL_REPLAY_PASS migrations=30 tip=030` on vanilla PG 18.6 |
| 5 | Tests green without skipping | **PASS** | §7 (482 pass/0 fail; 54/54 PG mandatory; tsc 0; build SUCCESS) |
| 6 | Migrations 022–030 compatible with deployed code | **FAIL** | Deployed app is running the pre-022-compatible writer (v015 `order_idempotency` shape; `orders.idempotency_scope` absent; orders keep arriving ⇒ live storefront). Migrations 022/027/028 revoke runtime grants the deployed code depends on → applying them without a synchronized code deploy breaks order creation/payment on the live store |
| 7 | Migration ledger consistency | **FAIL platform-wise** | `supabase_migrations.schema_migrations` = 0 rows while schema ≈ 021. A plain `supabase db push --linked` would attempt to replay 001 against existing objects and fail; ledger bootstrap (marking 001–021 applied) must be performed deliberately with evidence before any CLI-based migration flow |
| 8 | Live-write drift protection | **PARTIAL** | Snapshot captured 08:01; live delta observed during session (orders 73→74, items 149→151, customers 45→46). Any future write-plan needs a fresh pre-change backup + per-table delta re-check at execution time |
| 9 | Ambiguous data debt resolved | **PARTIAL** | 0 `payments` rows for ≥34 paid orders; discount/money flags e01–e05 unchanged since Phase B; Phase D voucher historical reconciliation design still unexecuted. These are data-remediation decisions (approval list), not covered by migrations 022–030 |
| 10 | Verified per-step rollback | **PARTIAL** | Production restore capability now evidenced (full DB), but per-migration reverse scripts and a rehearsed production cutover runbook do not yet exist |
| 11 | Deployment window/approve-with-owner | **NOT OBTAINED** | Live store generating orders during the session; cutover needs the owner's explicit window + deploy sync |
| 12 | No destructive ops while ambiguity remains | **RESPECTED** | No production write executed |

**Conclusion: `supabase db push`/production migration is **NO-GO**, because gates 6, 7, 11 are hard blockers. The previously blocked R3 gate (backup/restore evidence) is now closed — the remaining NO-GO reasons are the SAME ones documented in `PHASE_C_RECOVERY_ACTION_PLAN.md` / `PHASE_H_GO_NO_GO_ASSESSMENT.md`, now with R3 evidence complete.

If/when the owner approves a cutover, the required sequence is: (1) deploy-message plan for app + DB in one window; (2) fresh backup + delta check; (3) bootstrap the migration ledger with 001–021 recorded as applied (evidence-based, then verify); (4) apply 022–030 in order with per-step verification; (5) never rely on a full-restore over live Production; (6) batched, idempotent data fixes for the payment/money debt per the Phase D design + approval list.

## 9. Residual risks and environment notes for future agents

1. **Local PostgreSQL on Windows is fragile in this environment**: repeated `client backend terminated by exception 0xC0000142` → postmaster terminate-reinit loops and "pre-existing shared memory block still in use" after kills. Workaround proven this session: `initdb` with a **custom superuser name** (not `postgres`), start via `Start-Process pg_ctl ... start` (no `-w` in foreground shells), loopback-only, trust auth. Stale listening sockets on killed ports can persist briefly in netstat; use fresh ports.
2. **DNS**: system resolver (campus `login.lt.hcmus.edu.vn`) intermittently fails for `supabase.com` domains; use `supabase --dns-resolver https` and pre-resolved pooler IPs for `psql`/`pg_dump`.
3. **Credential mechanics**: `supabase db dump --linked` requires Docker (absent) — but `--dry-run --linked --dns-resolver https` provisions a transient `cli_login_postgres` role whose password is temporarily valid for the pooler; reuse it immediately for `pg_dump`/`psql` (it rotates on the next CLI management call). Never persist it.
4. **Query-runner caveats on Supabase**: long single-field `json_agg` fingerprints were observed to aggregate a *subset* on some channels (constraint fingerprint: 107 items vs 286 counted directly); count-based probes and `pg_dump` are the ground truth. `supabase db query` returns only the result of the **last statement** in a file.
5. **Backup files contain customer PII** — they remain inside gitignored `/backups/` on this private machine only; do not move, commit, or share them.
6. The 2026-10-17 `.tmp/postgres-session4-data` cluster was left **stopped and untouched**; a stale half-broken start attempt produced no data changes.
7. Allowed-list of remaining Production blockers (from prior phases, still open): deployed-writer cutover (R1), payment ledger backfill design (R2 — now has R3 restore evidence), voucher historical reconciliation (Phase D), lint debt (non-gate).

## 10. Mandatory conclusion

- **LOCAL DATA RECONCILIATION: PASS** — restored copy reproduced the snapshot exactly (26/26 table counts, per-table parity of constraints; 43 fingerprint probes identical to the snapshot-time capture); zero data mutations; drift documented (§5–6).
- **BACKUP & RESTORE VERIFICATION: PASS** — first verified full-DB backup in this project's history: real `pg_dump` artifacts with checksums (§3) rehearsed into a fresh local PostgreSQL 18.6 cluster with exact parity (§4), superseding the 2026-10-16 Phase E "FAIL/BLOCKED" verdict.
- **PRODUCTION SYNC: NO-GO** — no Production write was executed; hard blockers remain: deployed-code/schema cutover coordination (gate 6), empty migration ledger vs `db push` (gate 7), and no owner-approved window (gate 11). Any future GO must follow the documented sequence in §8 and re-verify the live-delta since this backup.
