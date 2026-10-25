# H36 — Safe Git Commit/Push and Supabase Schema Drift Reconciliation

Generated: 2026-10-24 01:49:59 +07:00 (Asia/Saigon)  
Workspace: `C:\Users\MT\Workspaces\gieomo-sales-management-system`  
Branch / initial HEAD: `main` / `1c51af625a575a41733d59b29cc9be9ae0892c60`  
Verified remote target: `origin/main` / `0b7825ecc5c524f822d2ef5602b4fb7a48182f70`  
Git verdict: **BLOCKED — NO COMMIT, NO PUSH**  
Supabase verdict: **BLOCKED — TARGET SCHEMA NOT VERIFIED**

## 1. Executive outcome

H36 did not stage, commit, merge, rebase or push anything. A fresh `git fetch --prune origin` proved that local `main` is exactly 15 commits behind `origin/main`. The local working tree contains 219 porcelain entries and 41 local paths overlap paths changed by those 15 remote commits. Creating a commit on the stale local tip would deliberately create divergence; integrating remote history inside this large dirty tree would risk flattening or mismerging pre-existing WIP. Both actions violate the safe-push boundary.

The linked Supabase project was identified consistently as project ref `snmmiwpvlpknkinhfqsv`, region `ap-southeast-1`. Current target schema was not inspected. The one linked CLI read attempted for the migration ledger automatically printed `Initialising login role...`; because H36 forbids remote role-management, all further remote database access was stopped immediately. The returned ledger showed no remote version beside local versions 001–037, but an empty/unavailable ledger is not evidence that those schema changes are absent or unapplied.

No Supabase migration, schema, table, row, policy, grant, function, storage object, deployment or application configuration was changed.

## 2. Git evidence and decision

### Verified refs

- Remote URL: `https://github.com/minhtrungus/gieomo-sales-management-system.git`.
- Upstream: `main` tracks `origin/main`.
- Local HEAD: `1c51af625a575a41733d59b29cc9be9ae0892c60`.
- Remote `main` after fetch and direct `ls-remote`: `0b7825ecc5c524f822d2ef5602b4fb7a48182f70`.
- Merge base: local HEAD itself.
- Divergence before any H36 commit: `0 ahead / 15 behind`.
- The remote-only range contains 15 commits, including the integrated migration/order work through migration 026.

### WIP collision analysis

The worktree had 219 status entries before this report: 71 tracked changes and 148 untracked entries. `.tmp/**` expands to tens of thousands of runtime/database/evidence files and is categorically excluded from any commit. Other excluded classes include local env files, backups, restored databases, credentials, copied worktrees, screenshots, logs and real-data artifacts.

Remote changed 54 paths since local HEAD. Forty-one of them also have local modifications or untracked replacements, including:

- 21 application/source paths;
- 14 migrations, 013–026;
- 4 test paths;
- both cover-image paths.

These are semantic overlaps, not a harmless fast-forward. H35 image work also touches paths in this overlap set, especially product/order presentation and assets. Selectively staging the old-tree versions would not prove compatibility with the fetched remote implementations.

### Commit/push result

- Staging index: unchanged and empty.
- Commit: **not created**.
- Push: **not attempted**.
- Force push: not attempted.
- Merge/rebase/cherry-pick/stash/reset/clean: not attempted.
- Branch/HEAD: unchanged.

Safe continuation requires a clean integration branch/worktree based on verified `origin/main`, followed by an explicit port of reviewed H34/H35/H36 changes and re-running gates there. It must not be done by merging remote into the current dirty worktree.

## 3. Supabase target verification and access boundary

Three safe metadata sources agreed on the project ref:

1. `supabase/.temp/project-ref`;
2. the hostname portion of `NEXT_PUBLIC_SUPABASE_URL` in `.env.local`, parsed without printing its value;
3. `supabase projects list`, reduced to ref/name/region/status only.

The selected project was reported `ACTIVE_HEALTHY` in `ap-southeast-1`. Secret values, tokens, database passwords, anon/service keys and connection strings were never printed or copied into this report.

### Remote-read boundary incident

`supabase migration list --linked` was invoked as a nominally read-only ledger query. Supabase CLI 2.98.2 reported `Initialising login role...` before connecting. That automatic behavior may create or initialize an ephemeral database login role, which is outside H36's prohibition on role-management operations. H36 therefore:

- stopped all subsequent linked database commands;
- did not run `db dump`, `db diff`, schema queries or object probes;
- did not attempt cleanup or role removal, because that would be another remote write;
- does not claim that the target schema was verified.

No deliberate schema/data/policy migration was run. This automatic CLI behavior is nevertheless recorded as a boundary exception and must be reviewed in Supabase audit logs by an authorized operator if exact role lifecycle evidence is required.

## 4. Canonical local migration inventory

The canonical directory contains exactly 37 sequential `.sql` files, 001–037. `scripts/migrations/validate-chain.mjs` passed and emitted a SHA-256 for every migration. Four `.draft` files remain under `supabase/migrations/proposals/` and are not canonical migrations:

- `021_revoke_anon_insert_order_tables.sql.draft`;
- `022_inbound_payment_events.sql.draft`;
- `031_members_read_least_privilege.sql.draft`;
- `032_members_non_dml_grant_hygiene.sql.draft`.

No migration newer than 037 exists in the current worktree. Repository presence and a clean replay are not proof of application on the linked Supabase project.

## 5. Evidence-backed object drift

Because current remote schema was not inspected, this table compares the verified H34 historical Supabase-derived snapshot with the locally replayed canonical tip 037. It is a planning baseline only, not a claim about current Production.

| Object group | Historical snapshot evidence | Canonical tip 037 | Responsible migration(s) | Current remote conclusion |
|---|---|---|---|---|
| `payment_events` | Missing | Table, indexes, RLS/ACL and payment event contract present | 023, repaired by 024; ACL hardened by 027/028 | Unknown; must inspect safely |
| `order_inventory_reservations` | Missing | Table, FK/index, RLS/ACL and cancellation provenance present | 026; consumers hardened later | Unknown |
| `order_idempotency_v015_archive` | Missing; old v015 fields remain on `order_idempotency` | Archive table plus reconciled current idempotency model | 021, 025 | Unknown |
| Modern order idempotency/cancellation fields | 11 old v015 fields; modern order fields absent | `idempotency_scope`, `idempotency_key_v015`, `idempotency_request_hash`, reservation/cancellation effect timestamps | 021, 025, 026 | Unknown |
| Payment RPCs | Modern apply/reject contract absent or different | `apply_payment_event(jsonb)`, `reject_payment_atomic(jsonb)` | 023, 024, 029 | Unknown |
| Order writer | Older signature/behavior | canonical v25 implementation plus public wrapper | 025, 026, 035, 037 | Unknown |
| Combo/order-control RPCs | Absent | save combo, controlled delete, duplicate mark, variant swap | 030–034 | Unknown |
| Pickup guidance and enum values | `location_guide`, `event_sale`, `member_delivery` absent | Present | 036, writer preservation in 037 | Unknown |
| Runtime ACL hardening | Historical grants/policies differ | direct runtime order/payment DML and protected RPC bypasses closed | 022, 027, 028 | Unknown |

H34's verified historical comparison was 26 tables / 293 columns versus canonical tip 037 at 29 tables / 323 columns. It found the three missing tables above, 41 canonical-only columns, 11 snapshot-only v015 fields and materially different RPC signatures. Those facts remain valid for that immutable artifact only.

## 6. Clean synthetic replay and regression repair

H36 ran the canonical harness twice on fresh isolated PostgreSQL 18.6 clusters on loopback port 55446. No real-data database or Supabase project was involved.

First run:

- migrations 001–037 applied successfully;
- `PAYMENT_INTEGRITY_PG_PASS`;
- `ORDER_INTEGRITY_PG_PASS`;
- mandatory PostgreSQL suite: 79 pass / 1 fail / 0 skip;
- the failure was a cross-file DDL deadlock in the wildcard combo suite, matching the previously documented file-level concurrency problem.

H36 changed `scripts/postgres/run-mandatory-pg-tests.mjs` to pass `--test-concurrency=1`, serializing test files while preserving concurrency inside each test. Second fresh run:

- chain validation: PASS, 37 migrations, tip 037;
- canonical object/ACL verification: PASS;
- payment SQL: PASS;
- order SQL: PASS;
- mandatory PostgreSQL: **80 pass / 0 fail / 0 skip** across 13 files;
- final marker: `CANONICAL_REPLAY_PASS migrations=37 tip=037_preserve_order_source_delivery_writer.sql`;
- Supabase DB lint: BLOCKED/WARN only because vanilla PostgreSQL lacks `plpgsql_check`.

Both temporary clusters were gracefully stopped by the harness. H33/H34 retained databases and the running read-only acceptance stack were not targeted.

## 7. Migration rollout plan — planning only

No migration is approved for Production from this report. The exact required set cannot be named until the target schema is verified object-by-object.

### Gate 0 — establish genuinely read-only evidence

Use a pre-existing, explicitly read-only database credential or an approved platform schema export that does not initialize roles. Capture only catalog metadata: tables, columns/defaults/nullability, constraints/validation state, indexes, functions and definitions/hashes, RLS flags, policies, grants/default privileges, enum labels and migration ledger. Do not use service-role HTTP reads as a substitute for catalog evidence, and do not infer schema from the empty migration ledger.

### Gate 1 — classify each canonical migration

For every migration 013–037, classify each statement as already equivalent, missing, or conflicting. Compare semantic object definitions and ACLs, not just names. Generate a reviewed reconciliation migration from observed state rather than replaying all historical files blindly. Draft proposals remain excluded.

### Gate 2 — rehearse against an immutable snapshot clone

Restore a fresh authorized target snapshot into an isolated PostgreSQL cluster. Run the exact reconciliation migration, then canonical object checks, row-count/hash comparisons, FK/orphan/constraint validation, ACL probes, SQL integrity suites and all 80 mandatory PG cases. Application read/write smoke must use synthetic fixtures only.

### Gate 3 — data and locking review

- Do not synthesize `payment_events` for historical paid orders without bank/provider evidence.
- Do not synthesize historical inventory reservations, item identities, costs, discounts or combo-variant mappings.
- Preserve any v015 idempotency rows before reshaping; prove archive/current row accounting.
- Measure table sizes and index build duration on the target snapshot. Existing migrations contain non-concurrent index creation and table/enum/function DDL that can take locks.
- Schedule a maintenance window for enum additions, table rewrites if any, constraint validation and function/ACL swaps. Set bounded lock/statement timeouts in the reviewed rollout wrapper.
- Keep new columns nullable until evidence-backed backfill and validation are separately approved.

### Gate 4 — staged rollout and rollback

Take and verify a restorable backup/PITR checkpoint immediately before execution. Apply additive structures first, then functions, then ACL cutover. Re-run exact catalog fingerprints and permission probes after each stage. Rollback should prefer forward fixes and function/ACL restoration; do not drop newly used event/reservation/archive objects or reconstruct historical values. Abort before application cutover if any object, row-accounting or privilege assertion differs.

## 8. Required migrations and blockers

The historical artifact indicates that capabilities introduced by 021–037 need reconciliation, especially 021, 023–029 and 035–037. It does **not** prove that the current remote target needs those exact files or that applying them verbatim is safe. Therefore:

- exact Production migration set: **BLOCKED — TARGET SCHEMA NOT VERIFIED**;
- `payment_events`: required by canonical contract, remote presence unknown;
- `order_inventory_reservations`: required by canonical cancellation contract, remote presence unknown;
- `order_idempotency_v015_archive`: required for safe v015 reconciliation, remote presence unknown;
- canonical writer/RPC/ACL versions: remote definitions unknown;
- P0-A3 v2 quantity/aggregate limits remain unapproved and are not introduced here;
- full application lint remains a separate release blocker per H35.

## 9. Final decisions

### Git

**BLOCKED — NO COMMIT, NO PUSH.** Local `main` is 15 commits behind and the dirty WIP overlaps 41 remote-changed paths. No safe fast-forward push can be produced without first integrating and retesting in a clean branch/worktree.

### Supabase

**BLOCKED — TARGET SCHEMA NOT VERIFIED.** Project identity is verified, but current schema is not. No Supabase schema/data/policy migration or deployment was performed. The sole linked ledger read triggered CLI login-role initialization, after which all remote DB access stopped.

### Local migration evidence

**PASS FOR SYNTHETIC REPLAY ONLY.** Canonical 001–037 replays cleanly and passes 80/80 mandatory PostgreSQL tests after making the runner deterministic at file level. This is not Production application evidence.
