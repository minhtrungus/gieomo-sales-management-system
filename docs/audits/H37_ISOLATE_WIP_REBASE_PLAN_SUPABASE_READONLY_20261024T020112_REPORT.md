# H37 — Isolate WIP, Rebase Plan from Remote Baseline, and Verify Supabase Read-Only

Generated: 2026-10-24 02:01:12 +07:00 (Asia/Saigon)  
Source workspace: `C:\Users\MT\Workspaces\gieomo-sales-management-system`  
Source branch / HEAD: `main` / `1c51af625a575a41733d59b29cc9be9ae0892c60`  
Verified remote baseline: `origin/main` / `0b7825ecc5c524f822d2ef5602b4fb7a48182f70`  
Integration worktree: `.tmp/h37-integration-origin-main-20261024T020000`  
Integration mode: detached HEAD, no branch  
Final verdict: **B — ISOLATION READY; PORT NOT STARTED**  
Supabase verdict: **BLOCKED — TARGET SCHEMA NOT VERIFIED**

## 1. Outcome

H37 preserved the H36 worktree, created a clean detached integration worktree from the fetched and verified `origin/main`, classified all 41 local/remote overlap paths, investigated the actual Supabase CLI login-role behavior from official documentation/source, and replayed the complete local canonical chain 001–037 on a new synthetic PostgreSQL cluster.

No WIP file was copied into the integration worktree. That is deliberate: 24 overlap paths are already semantically identical to the remote baseline, 16 contain different local and remote content requiring manual reconciliation, and one is a delete-versus-modify conflict. The H35 image batch and migrations 027–037 are selected as future coherent port batches, but moving isolated files now would produce an unreviewed partial contract.

H37 made no authenticated Supabase request and caused no Supabase remote write. It did not run `supabase migration list`, `db dump`, `db diff`, `gen types`, SQL, RPC, deploy or any linked CLI command.

## 2. H36 worktree before and after

### Before

- Branch: `main`.
- HEAD: `1c51af625a575a41733d59b29cc9be9ae0892c60`.
- Upstream: `origin/main`.
- Divergence: `0 ahead / 15 behind`.
- Status: 219 porcelain entries.
- Staged paths: 0.
- Unstaged tracked paths: 71.
- Expanded untracked files: 30,866, primarily because `.tmp/**` contains retained databases, copied worktrees and evidence.
- Remote baseline: `0b7825ecc5c524f822d2ef5602b4fb7a48182f70`.

The existing worktree registry contained the main worktree plus 11 earlier detached/branch worktrees. H37 did not alter or remove any of them.

### After

- Source branch and HEAD unchanged.
- Source index remains empty.
- Source status still has 219 porcelain entries; `.tmp/**` and `docs/audits/**` were already collapsed untracked directory entries.
- No reset, clean, stash, checkout, rebase, merge, cherry-pick, commit or push occurred.
- No existing H36 WIP file was edited. The only source-worktree content added by H37 is this required new audit report under the already-untracked audit directory.
- Synthetic H37 PostgreSQL was stopped gracefully; port 55447 no longer listens.

## 3. Clean integration worktree

Created with a new, previously absent target directory from the already-fetched remote ref:

`C:\Users\MT\Workspaces\gieomo-sales-management-system\.tmp\h37-integration-origin-main-20261024T020000`

Verified state:

- detached HEAD `0b7825ecc5c524f822d2ef5602b4fb7a48182f70`;
- `git status --porcelain` empty;
- index empty;
- canonical migration tip in this baseline is 026;
- no `.env.local`, credentials, dumps, snapshots, real-data files, runtime artifacts or files from the dirty source worktree were copied;
- no integration branch or temporary commit was created.

The worktree is intentionally clean so the next port can be reviewed as a minimal diff against the real remote baseline.

## 4. Matrix of all 41 overlapping paths

`Same upstream` means the source worktree's resulting blob/state is already equal to `origin/main`, so nothing should be transferred. `Manual reconcile` means the local blob differs from the fetched baseline. `Conflict` means local deletion would discard a remote modification.

| # | Path | Local vs remote | Classification | H37 action |
|---:|---|---|---|---|
| 1 | `public/images/Cover Gieo Mơ.png` | Same blob | Same upstream | Do not transfer |
| 2 | `public/images/cover_gieomo.jpg` | Deleted on both | Same upstream | Do not transfer |
| 3 | `src/app/admin/orders/[id]/page.tsx` | Different | Earlier order WIP; lineage unresolved | Do not transfer |
| 4 | `src/app/admin/orders/create/page.tsx` | Different | Earlier order WIP; lineage unresolved | Do not transfer |
| 5 | `src/app/admin/orders/page.tsx` | Different | Earlier order WIP; lineage unresolved | Do not transfer |
| 6 | `src/app/admin/orders/pos/page.tsx` | Different | Earlier order WIP; lineage unresolved | Do not transfer |
| 7 | `src/app/api/orders/route.ts` | Different | Security/order contract; manual reconcile | Do not transfer |
| 8 | `src/app/checkout/page.tsx` | Different | Checkout/order contract; manual reconcile | Do not transfer |
| 9 | `src/app/contact/page.tsx` | Same blob | Same upstream | Do not transfer |
| 10 | `src/app/layout.tsx` | Different | Layout/metadata WIP; manual reconcile | Do not transfer |
| 11 | `src/app/page.tsx` | Same blob | Same upstream | Do not transfer |
| 12 | `src/app/products/[slug]/ProductDetailClient.tsx` | Different | H35 required, overlaps remote | Port manually with H35 batch |
| 13 | `src/app/sale/create-order/page.tsx` | Different | Sale/order contract; manual reconcile | Do not transfer |
| 14 | `src/components/layout/Footer.tsx` | Same blob | Same upstream | Do not transfer |
| 15 | `src/components/layout/Navbar.tsx` | Same blob | Same upstream | Do not transfer |
| 16 | `src/components/seo/OrganizationJsonLd.tsx` | Same blob | Same upstream | Do not transfer |
| 17 | `src/lib/constants.ts` | Same blob | Same upstream | Do not transfer |
| 18 | `src/lib/data/orderStore.ts` | Different | H35 image status plus earlier order WIP | Port only after semantic split/review |
| 19 | `src/lib/orderCreateInput.ts` | Different | Remote-added contract plus local variant | Manual three-way review |
| 20 | `src/lib/seo/keywords.ts` | Same blob | Same upstream | Do not transfer |
| 21 | `src/lib/services/orderRequestHash.ts` | Different | Remote-added contract plus local variant | Manual three-way review |
| 22 | `src/lib/services/orderService.ts` | Different | Order contract; manual reconcile | Do not transfer |
| 23 | `src/lib/utils/emailService.ts` | Same blob | Same upstream | Do not transfer |
| 24 | `supabase/migrations/013_fix_rls_orders_customers_payment.rls.sql` | Same blob | Already upstream | Do not transfer |
| 25 | `supabase/migrations/014_add_freeship_discount_type.sql` | Same blob | Already upstream | Do not transfer |
| 26 | `supabase/migrations/015_order_idempotency.sql` | Same blob | Already upstream | Do not transfer |
| 27 | `supabase/migrations/016_create_order_atomic.sql` | Same blob | Already upstream | Do not transfer |
| 28 | `supabase/migrations/017_cancel_order_atomic.sql` | Same blob | Already upstream | Do not transfer |
| 29 | `supabase/migrations/018_payments_unique_transaction.sql` | Same blob | Already upstream | Do not transfer |
| 30 | `supabase/migrations/019_inventory_adjustments.sql` | Same blob | Already upstream | Do not transfer |
| 31 | `supabase/migrations/020_ledger_delete_policy.sql` | Same blob | Already upstream | Do not transfer |
| 32 | `supabase/migrations/021_reconcile_v015_idempotency.sql` | Same blob | Already upstream | Do not transfer |
| 33 | `supabase/migrations/022_revoke_runtime_order_dml.sql` | Same blob | Already upstream | Do not transfer |
| 34 | `supabase/migrations/023_payment_integrity.sql` | Same blob | Already upstream | Do not transfer |
| 35 | `supabase/migrations/024_repair_payment_cash_contract.sql` | Same blob | Already upstream | Do not transfer |
| 36 | `supabase/migrations/025_atomic_idempotent_order_creation.sql` | Same blob | Already upstream | Do not transfer |
| 37 | `supabase/migrations/026_atomic_order_cancellation.sql` | Same blob | Already upstream | Do not transfer |
| 38 | `tests/atomicOrderPg.integration.test.ts` | Different | PG contract test; manual reconcile | Do not transfer |
| 39 | `tests/cancelVoucherRelease.test.ts` | Different | Remote and local both changed | Manual reconcile |
| 40 | `tests/orderStore.voucher.test.ts` | Different | Remote and local both changed | Manual reconcile |
| 41 | `tests/voucherReservation.test.ts` | Local deleted; remote modified | **Conflict** | Preserve remote; owner review local deletion |

Summary: 24 already represented upstream, 16 different/manual, 1 delete-versus-modify conflict. No path from this matrix was transferred.

## 5. Selected future port batches

### Batch A — H35 truthful local-image behavior

Selected as one coherent batch, not transferred in H37:

- `public/images/product-image-unavailable.svg`;
- `src/lib/runtimeAssetSafety.ts`;
- `src/lib/services/productService.ts`;
- `src/app/api/combos/route.ts`;
- `src/types/database.ts`;
- `src/lib/data/orderStore.ts`;
- `src/components/products/ProductCard.tsx`;
- `src/app/products/[slug]/ProductDetailClient.tsx`;
- `src/app/products/[slug]/page.tsx`;
- `src/app/combos/page.tsx`;
- `src/app/sale/products/page.tsx`;
- `src/app/admin/messages/page.tsx`;
- `tests/runtimeAssetSafety.test.ts`;
- `tests/comboRoute.test.ts`.

`orderStore.ts` and `ProductDetailClient.tsx` need manual three-way integration because both remote and local changed. The remaining files still depend on those contracts and therefore must not be copied independently.

### Batch B — canonical migrations beyond remote tip

Selected for a later database-integrity batch, not transferred:

- migrations 027–037, in order;
- chain validator and PostgreSQL replay harness;
- all associated source/PG tests;
- H36's deterministic `--test-concurrency=1` runner repair.

Remote baseline ends at 026. The source migrations 027–037 have clean synthetic evidence, but their application state in Production is unknown and their application-code dependencies have not yet been rebased onto remote. They must be ported and reviewed as a complete batch, not file-by-file.

### Excluded

All `.tmp/**`, backups, SQL/data snapshots, restored PostgreSQL directories, screenshots, logs, local env files, credentials, copied worktrees, historical real customer data, `.agents/**`, draft proposals and unrelated documentation remain excluded.

## 6. Supabase read-only investigation

### Official behavior established

Supabase documents `migration list` as connecting to a linked remote database and comparing against `supabase_migrations.schema_migrations`; it is not an offline metadata command. Supabase documents `db dump` as a remote `pg_dump` operation and accepts either a linked project or an explicit database URL. See [Supabase CLI migration list](https://supabase.com/docs/reference/cli/supabase-migration-list) and [Supabase CLI db dump](https://supabase.com/docs/reference/cli/supabase-db-dump).

More importantly, the official CLI source shows that when a linked database connection has no supplied DB password, `initLoginRole` calls the Management API's create-login-role endpoint with `ReadOnly: false`. This directly explains H36's `Initialising login role...` output and proves that repeating the passwordless linked flow would violate the H37 boundary. See [Supabase CLI `db_url.go`](https://github.com/supabase/cli/blob/develop/apps/cli-go/internal/utils/flags/db_url.go).

Supabase also documents that TypeScript schema types can be generated and downloaded directly from the project Dashboard. This is a useful no-CLI observation path for tables/views/RPC shapes, but it does not by itself fully evidence indexes, constraints, policies, grants or function bodies. See [Generating TypeScript Types](https://supabase.com/docs/guides/api/rest/generating-types).

### Safe methods ranked

1. **Preferred now:** an authorized operator downloads Dashboard-generated types plus an immutable schema-only export/audit artifact and supplies it to this workspace. No Codex/CLI role initialization is involved.
2. **Full catalog option:** use a pre-existing PostgreSQL credential whose role is already restricted to catalog/schema reads and has no DDL/DML/role-management capability. Verify `current_user`, privileges and `transaction_read_only` first; then run only `BEGIN READ ONLY` catalog queries or `pg_dump --schema-only`. The credential must be supplied out-of-band and never printed.
3. **Not safe in current state:** any passwordless `supabase ... --linked` database command, because the observed CLI path initializes a non-read-only temporary login role.
4. **Insufficient alone:** REST/OpenAPI/types output, because it omits material database enforcement evidence.

H37 had no Dashboard connector, current schema export or pre-existing read-only DB credential. It therefore made no authenticated Supabase request.

### Remote-write accounting

- H37 Supabase API/database calls: 0.
- H37 login-role creation/rotation: 0.
- H37 DDL/DML/RPC/policy/grant/deploy operations: 0.
- H36's earlier CLI-generated role event remains documented separately and was not repeated or cleaned up.

## 7. Schema evidence levels

| Evidence class | State | What is proven |
|---|---|---|
| Current Production schema observed directly | **Not available** | Nothing object-level may be claimed current |
| H34 historical Supabase-derived snapshot | Verified immutable artifact | Historical 26-table/293-column state only |
| Remote Git baseline | Verified at `0b7825e` | Repository migration files through 026, not applied-state |
| Dirty source canonical chain | Verified locally through 037 | Repository intent and synthetic behavior only |
| H37 synthetic PostgreSQL | Directly observed | Tip-037 catalog and behavior on isolated PG 18.6 |

Final Supabase verdict remains **BLOCKED — TARGET SCHEMA NOT VERIFIED**.

## 8. H37 synthetic database evidence

A fresh isolated PostgreSQL 18.6 cluster was created on loopback port 55447 from the source canonical chain. It contained synthetic bootstrap/rollback fixtures only. Results:

- migrations 001–037 applied in order;
- chain tip: `037_preserve_order_source_delivery_writer.sql`;
- payment SQL integrity: PASS;
- order SQL integrity: PASS;
- mandatory PG suite: **80 pass / 0 fail / 0 skip** across 13 files;
- Supabase DB lint: BLOCKED/WARN because vanilla PostgreSQL lacks `plpgsql_check`;
- cluster retained on disk as `.tmp/postgres-canonical-ee8e2777e2`, then stopped gracefully.

Catalog checks were run inside read-only transactions:

- 29 public tables;
- 36/36 foreign keys validated;
- 0 unvalidated public constraints;
- 44/44 unique indexes valid;
- 25 tables with RLS enabled and 38 public policies;
- 4 tables without RLS: `inventory_adjustments`, `media`, `workshop_registrations`, `workshops` — this is local canonical evidence and requires separate design review, not a Production claim;
- `payment_events`, `order_inventory_reservations`, `order_idempotency_v015_archive` exist;
- four expected FK edges connect those special tables to orders/product variants;
- the checked modern order fields and `pickup_points.location_guide` have the intended nullable/non-null catalog shape;
- nine protected canonical RPC signatures exist as `jsonb` functions and are `SECURITY DEFINER`;
- `anon` and `authenticated` cannot execute `create_order_atomic(jsonb)` or `apply_payment_event(jsonb)`; `service_role` can.

No Production data was used, and no historical payment, combo mapping, cost, inventory reservation or other business value was synthesized.

## 9. Blockers and next step

1. Obtain an operator-provided Dashboard/schema artifact or an already-existing read-only PostgreSQL credential before any further Production inspection.
2. In the clean integration worktree, port Batch A manually against current Next.js/source contracts, reading the installed Next.js version documentation before UI/API edits; run focused H35 tests, type-check, lint delta and build.
3. Port Batch B as a complete database batch: migrations 027–037, harness and associated tests. Replay from 001 on a fresh synthetic cluster and also rehearse 026→037 against an immutable synthetic/snapshot clone.
4. Resolve the 16 manual overlap paths with three-way semantic review. Do not overwrite remote implementations with old-tree blobs.
5. Resolve `tests/voucherReservation.test.ts` explicitly; local deletion must not silently discard the remote-modified test.
6. Keep the integration worktree detached and uncommitted until the selected batches pass their gates. Creating a branch/commit/push is outside H37.

## 10. Final decision

- H36 WIP preservation: **PASS**.
- Clean remote-baseline worktree: **PASS**.
- Automatic WIP transfer: **correctly not performed**.
- Synthetic canonical replay/catalog verification: **PASS**, with 80/80 non-skipped PG tests.
- Production schema verification: **BLOCKED — TARGET SCHEMA NOT VERIFIED**.
- Commit/push/merge/deploy: **none**.
- Supabase remote writes in H37: **none**.
