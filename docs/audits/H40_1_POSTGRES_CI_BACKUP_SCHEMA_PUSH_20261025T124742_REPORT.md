# H40.1 — PostgreSQL CI Repair, Supabase Backup Gate, and Schema-Push Decision

Generated: 2026-10-25 12:47:42 +07:00 (Asia/Saigon)
Repository: `C:\Users\MT\Workspaces\gieomo-sales-management-system`
Release worktree: `.tmp/h37-integration-origin-main-20261024T020000`
Release branch: `release/h39-production-readiness-20261025`
Starting SHA: `1ac5b91dc5648bfb7c287b461a88a6933e94a63b`
Reviewed source SHA: `70f1ae86a4c73788975c2552c97de22933c20ea5`
Pull request: [#3](https://github.com/minhtrungus/gieomo-sales-management-system/pull/3)
CI: [Go-live release gates run 40166936259](https://github.com/minhtrungus/gieomo-sales-management-system/actions/runs/40166936259) — **PASS**
Verdict: **NO-GO FOR PRODUCTION DATABASE PUSH — CI FIXED; BACKUP, RESTORE, REMOTE LEDGER, AND REMOTE CATALOG GATES ARE NOT SATISFIED**

## 1. Executive result

H40.1 fixed the supplied Linux CI failure without skipping or weakening the PostgreSQL contract. The failing test selected the literal Windows executable `psql.exe` on an Ubuntu runner. The workflow also relied on a PostgreSQL service container without explicitly ensuring that the runner host had PostgreSQL client programs. The fix centralizes platform-aware client selection, validates the executable with `--version`, gives invalid `PSQL_BIN` overrides an actionable infrastructure error, installs the client in CI when either `psql` or `pg_isready` is absent, and verifies connectivity before replay and tests.

The previously failing atomic-order contract executed against a fresh disposable PostgreSQL database and passed all 15 nested cases. The full mandatory database runner passed 89/89 with zero skips locally and passed its corresponding zero-skip CI step on Ubuntu. CI then exposed an independent clean-checkout type-generation dependency: `LayoutProps` did not exist before `.next/types` was generated. Following the repository's bundled Next.js 16 documentation, `type-check` now runs `next typegen && tsc --noEmit`. A second exact-SHA CI run passed every workflow step, including build.

The intended Supabase project identity was independently corroborated, but the recovery gate failed. The provider reported no listed backups and PITR disabled. No database password, Docker-backed CLI dump path, restorable export, or disposable restore target was available. Therefore no Production schema/catalog or migration ledger was downloaded, no field was classified as a confirmed Production defect, no migration was created, and no database push occurred.

## 2. Repository and worktree safety

Before H40.1:

- Release branch and upstream were both `1ac5b91dc5648bfb7c287b461a88a6933e94a63b`.
- Refreshed `origin/main` was `0b7825ecc5c524f822d2ef5602b4fb7a48182f70`.
- The release worktree was clean with an empty index.
- PR #3 was open, non-draft, based on `main`, and pointed to the starting SHA.
- Root worktree was `main` at `1c51af625a575a41733d59b29cc9be9ae0892c60`, with 219 pre-existing porcelain entries and an empty index.

After the source fixes:

- Reviewed source SHA is `70f1ae86a4c73788975c2552c97de22933c20ea5`.
- H39 commit `1ac5b91dc5648bfb7c287b461a88a6933e94a63b` was not rewritten.
- The same release branch was pushed to the existing PR; `main` was not pushed or merged.
- Root remained `main` at `1c51af625a575a41733d59b29cc9be9ae0892c60`, with 219 entries and an empty index.
- No worktree, backup, user WIP, or audit artifact was deleted or overwritten.

Source commits:

1. `3fc9a4c0f2854910c6e4fc4f8dae65abec20224c` — cross-platform PostgreSQL client resolution and CI provisioning.
2. `70f1ae86a4c73788975c2552c97de22933c20ea5` — documented Next.js route-type generation before TypeScript.

The later commit containing this report is documentation-only and cannot embed its own SHA. The reviewed source SHA and its green CI run above are the code acceptance evidence.

## 3. Exact CI root cause and repair

### Supplied failure

The supplied run reported 74 tests, 73 passes, 1 failure, and 0 skips. `tests/atomicOrderPg.integration.test.ts` failed in `query()` with `spawnSync psql.exe ENOENT`.

Confirmed causes:

1. `.github/workflows/go-live-gates.yml` uses `ubuntu-latest`.
2. `tests/atomicOrderPg.integration.test.ts` used `process.env.PSQL_BIN || "psql.exe"`, so Linux attempted the Windows filename.
3. The same unsafe fallback existed in cancellation and cash-payment PostgreSQL suites.
4. A service container provides the database server, not a guaranteed `psql` executable in the host runner's PATH.
5. `MODULE_TYPELESS_PACKAGE_JSON` messages were warnings and were not the failure. Package module mode was not changed.

Implemented repair:

- `tests/helpers/psqlBin.ts` chooses `psql.exe` only on Windows and `psql` on Linux/macOS.
- `resolvePsqlBin()` validates the default or trimmed `PSQL_BIN` override using `--version`; missing or failing clients produce an explicit installation/override error.
- Atomic order, cancellation, cash-payment, and variant-swap suites use the shared resolver whenever `ATOMIC_PG_URL` enables database execution.
- The mandatory runner validates the client before spawning tests and emits `MANDATORY_PG_CLIENT_OK` or exits as an infrastructure failure.
- CI installs `postgresql-client` when `psql` or `pg_isready` is absent, prints the resolved client/version, and verifies the service with `pg_isready`.
- `tests/psqlBin.test.ts` covers Windows/Linux/macOS defaults and invalid override behavior.
- The local canonical replay harness can run additional named PostgreSQL tests against the same disposable database and can record an explicit Supabase-lint skip when vanilla PostgreSQL lacks `plpgsql_check`.

The initial repaired CI run passed client installation, migration replay, mandatory PostgreSQL tests, and the complete PostgreSQL-targeted test invocation. It then failed TypeScript because a clean checkout had no generated `.next/types`. The bundled Next.js 16 CLI guide states that `PageProps` and `LayoutProps` are generated by `next dev`, `next build`, or `next typegen`, and recommends `next typegen && tsc --noEmit` for CI. `package.json` now follows that documented sequence. No hand-written global type or compiler suppression was added.

## 4. PostgreSQL and application verification

| Gate | Result |
|---|---|
| Resolver unit test | **PASS** — 2/2 |
| Fresh migration replay | **PASS** — 001–037, tip `037_preserve_order_source_delivery_writer.sql` |
| SQL integrity scripts | **PASS** — `PAYMENT_INTEGRITY_PG_PASS`, `ORDER_INTEGRITY_PG_PASS` |
| Atomic-order contract | **PASS** — 15/15 executed against PostgreSQL |
| Mandatory PostgreSQL runner | **PASS** — 89 passed, 0 failed, 0 skipped, 13 files |
| Additional cancellation/payment suites | **PASS** — 21 passed, 0 failed, 0 skipped |
| Full source inventory without DB URL | **PASS** — 240 total, 176 passed, 0 failed, 64 DB-dependent skips |
| TypeScript after deleting generated route types | **PASS** — `next typegen` recreated types, then `tsc --noEmit` passed |
| Production build | **PASS** — Next.js 16.3.5, 51 static pages |
| Changed JS/TS targeted lint | **PASS** — zero findings |
| Full lint | **FAIL, inherited baseline** — 250 errors / 189 warnings, unchanged from H39 |
| Migration-chain validator | **PASS** — exactly 37 contiguous migrations, hashes emitted |
| Diff whitespace | **PASS** — line-ending conversion notices only |
| Secret-pattern review | **PASS for H40 files** — no credential or dump added; repository-wide matches were the synthetic CI database URL and a script's environment-variable parser |
| Exact-SHA CI | **PASS** — run 40166936259 on `70f1ae86…`; every job step green |

The source-only run's 64 skips are not counted as database passes. Equivalent database-backed coverage ran separately with 89/89 and zero skips. The disposable cluster listened only on loopback, used synthetic data, was stopped, and its guarded temporary files were removed.

The local Supabase schema-lint command remained unavailable on vanilla PostgreSQL because `plpgsql_check` was not installed. That limitation was recorded rather than treated as a pass; migration replay, object assertions, and behavior tests still ran.

## 5. Verified Supabase target identity

Read-only management metadata identified:

- Project ref / ID: `snmmiwpvlpknkinhfqsv`
- Project name: `minhtrungus's Project`
- Organization ID: `kaoczngvekmwnjoxjxxu`
- Organization name: `gieomo-sales-management-system`
- Region: `ap-southeast-1`
- Database engine reported by management metadata: PostgreSQL 17.6.1.166
- Health: `ACTIVE_HEALTHY`
- CLI link state: not linked

Independent repository corroboration: `next.config.ts` and the guarded deployment workflow refer to `snmmiwpvlpknkinhfqsv`. The other account-visible project has a different ref, organization, name, and region. No credential value or connection string was printed.

This proves the intended management-plane identity, but not the effective database role, current catalog, or applied migration state. No read-only database credential was available to establish those facts.

## 6. Backup and recovery gate

Provider metadata for `snmmiwpvlpknkinhfqsv` reported:

- `backups: []`
- `physical_backup_data: {}`
- `pitr_enabled: false`
- `walg_enabled: true`
- region `ap-southeast-1`

`walg_enabled` is not treated as evidence of an accessible recovery point. The CLI exposes backup listing/restoration but no command in this environment that created a fresh provider backup. A logical CLI dump also could not be authorized or validated because the database password was unavailable and Docker was missing. No protected backup file exists, so there is no timestamped backup reference, plausible size, checksum, dump-integrity result, object inventory, or restore result to report.

**Backup result: BACKUP NOT CREATED — RECOVERY GATE FAILED.**

Supabase documents that logical backup requires separate roles/schema/data handling and that database backups do not include Storage object contents. Any future backup plan must separately protect Storage objects and must prove restoration, not only dump completion:

- <https://supabase.com/docs/guides/platform/backups>
- <https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore>
- <https://supabase.com/docs/reference/cli/supabase-inspect-db-role-configs>

## 7. Download and remote schema evidence

Nothing was downloaded from the Production database. There is no immutable Production-source dump, disposable restored copy, sanitized clone, remote catalog export, or remote migration-ledger export. No PII, payment payload, password hash, token, session, or Storage object was accessed.

Because the recovery gate failed, H40.1 intentionally did not:

- link the CLI project;
- request database credentials;
- run `supabase db dump`, `db pull`, `db push`, migration repair, or remote lint;
- query remote tables, catalogs, functions, policies, grants, or migration ledgers;
- rehearse pending migrations against an asserted remote starting state.

Repository migrations and fresh synthetic replay are not evidence of the current Production catalog.

## 8. Reconciliation matrix

No Production defect is confirmed. The matrix records expected repository behavior and the unavailable actual state.

| Field/object | Expected behavior | Actual Production state | Evidence/classification | Risk | Proposed repair | Required test |
|---|---|---|---|---|---|---|
| Migration ledger 001–037 | Applied history must be known and hashes/order reconciled | Unknown | No remote ledger; **uncertain** | Applying from an unknown base can conflict or misrepresent history | None until read-only ledger capture | Compare immutable ledger and catalog to repository chain |
| `orders.source_type` / `order_source` | Preserve validated web/admin/sale/POS provenance | Unknown | Migrations 036–037 and app writers agree locally; **uncertain remotely** | Lost/misclassified provenance | No migration without catalog and row analysis | Catalog type/default/nullability plus aggregate invariant checks |
| `orders.delivery_type` including `member_delivery` | Valid delivery enum and writer preservation | Unknown | Synthetic replay passes; **uncertain remotely** | Writer failure or silent semantic loss | None until enum/catalog evidence | Enum/catalog inspection and synthetic writer cases |
| `pickup_points.location_guide` | Nullable text guidance persisted by migration 036 | Unknown | Repository-only evidence; **uncertain remotely** | Missing operator/customer guidance | None until catalog and existing-row inspection | Column/catalog check and read/write contract test |
| `create_order_atomic(jsonb)` | Atomic, authoritative writer with source/delivery preservation and restricted execute grants | Unknown | Local function/replay/15-case contract pass; **uncertain remotely** | Order, inventory, voucher, or authorization inconsistency | No replacement before signature/body/grant comparison | Function definition, owner, `SECURITY DEFINER`, `search_path`, grants, behavior |
| Payment ledger and `apply_payment_event` / `reject_payment_atomic` | Idempotent atomic transitions; no generic runtime mutation | Unknown | Local migrations/tests pass; **uncertain remotely** | Duplicate or inconsistent payment state | No data repair or migration without ledger/catalog evidence | Constraints/indexes/functions/grants plus non-Production fault tests |
| Combo persistence and nullable variant mapping | Atomic combo writes; wildcard semantics explicit | Unknown | Migrations 030–031/035 replay locally; **uncertain remotely** | Invalid component mapping or checkout behavior | Never guess historical variants | Catalog/FK/function comparison and synthetic wildcard/exact tests |
| Order-domain RLS/table grants | Runtime roles cannot bypass protected service writers | Unknown | Migrations 027–028 assertions pass locally; **uncertain remotely** | Data disclosure or unauthorized DML | No broad grant/revoke without catalog diff | RLS flags/policies/table privileges/role matrix |
| Protected RPC grants/search paths | Public/anon/authenticated denied; service role explicitly allowed where intended | Unknown | Local object assertions pass; **uncertain remotely** | Privilege escalation | Forward-only migration only after exact definition/grant diff | `pg_proc`, ownership, config, ACL, effective privilege checks |
| Storage policies and object contents | Metadata/policies reconciled; binaries separately recoverable | Unknown/not backed up | Provider backup limitation; **uncertain** | Incomplete recovery | Separate approved Storage inventory/export | Restore drill including metadata and object checksums |

Classification summary: zero confirmed Production defects, zero intentional Production differences established, and all remote fields/objects remain uncertain. Consequently, adding a “missing required field” migration would be speculation and could fabricate or damage business state.

## 9. Migration and push decision

- New database migration files: **none**.
- Pending migration set proven against actual Production: **unknown**.
- Production database push: **did not occur**.
- Remote schema/data writes: **none**.
- Migration-ledger manipulation or repair: **none**.
- Application deployment or PR merge: **none**.

The following mandatory gates are open: fresh backup, checksum/integrity, restore proof, actual ledger/catalog capture, exact remote diff, evidence-based backfill analysis, exact pending-set rehearsal, and final pre-push drift check. The correct action is a hard NO-GO rather than an inferred migration.

## 10. Remaining operator actions

1. Establish an approved database read-only identity for `snmmiwpvlpknkinhfqsv` and prove the effective role without exposing credentials.
2. Create a fresh provider recovery point or encrypted logical roles/schema/data backup outside the repository; separately back up Storage objects.
3. Record timestamp, retention/recovery window, coverage, size, checksum, and access controls.
4. Restore to a separate disposable recovery project/database and verify catalog objects, key aggregate counts, sequences, constraints, functions, grants, RLS, and non-sensitive invariants.
5. Capture the real migration ledger and full catalog, then populate the matrix with confirmed states.
6. Create forward-only migrations only for confirmed discrepancies whose values are derivable without fabrication.
7. Rehearse the exact pending subset from the verified remote starting state and rerun all release gates.
8. Immediately before any authorized push, re-verify project identity, backup reference, remote ledger/catalog drift, reviewed migration filenames, and CI SHA.

## 11. Final decision

The CI incident is resolved and proven on Linux at exact source SHA `70f1ae86a4c73788975c2552c97de22933c20ea5`. The production database mission is not safe to continue because recoverability and actual schema state are unproven.

**Final verdict: NO-GO FOR PRODUCTION DATABASE PUSH.** Keep PR #3 open for review. Do not merge, deploy, or push Supabase migrations until the backup/restore and remote-catalog gates above are satisfied.
