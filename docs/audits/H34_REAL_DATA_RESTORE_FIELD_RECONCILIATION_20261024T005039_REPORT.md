# H34 — Real Supabase Snapshot Recovery, Isolated Restore, Field Reconciliation and Read-Only Acceptance

Generated: 2026-10-24 00:50:39 +07:00 (Asia/Saigon)  
Workspace: `C:\Users\MT\Workspaces\gieomo-sales-management-system`  
Branch / HEAD: `main` / `1c51af625a575a41733d59b29cc9be9ae0892c60`  
Local URL at completion: `http://127.0.0.1:3790`  
Final verdict: **A — REAL-DATA LOCAL ACCEPTANCE READY**

This verdict is limited to safe local, read-only acceptance. It is not a Production-release verdict. Full lint still fails and P0-A3 remains blocked on unapproved business limits and an unimplemented v2 writer.

## 1. Outcome

H34 found and verified the retained Supabase-derived snapshot, proved that the stopped H29 restored cluster still existed, restored the artifact into a new isolated PostgreSQL 18.6 cluster, preserved a pristine database, and created a separately locked acceptance database. The web now reads the verified real-data acceptance copy through PostgREST under database ACLs that reject DML and RPC execution.

At completion:

| Layer | Address / identity | State |
|---|---|---|
| Next.js | `127.0.0.1:3790` | Running; real-data read-only acceptance |
| REST proxy | `127.0.0.1:55434` | Running; forwards only `/rest/v1/*` |
| PostgREST 16.4 | `127.0.0.1:55445` | Running; 26 relations, 22 relationships, 9 RPCs cached; notification channel disabled for read-only runtime |
| H34 PostgreSQL | `127.0.0.1:55443` | Running; PostgreSQL 18.6, not in recovery |
| H34 pristine DB | `gieomo_realdata_pristine_20261024d` | Preserved; 5 original members; not used by web |
| H34 acceptance DB | `gieomo_realdata_acceptance_20261024e` | Used by web; default transaction read-only plus SELECT-only runtime ACL |
| H33 synthetic PostgreSQL | `127.0.0.1:55441`, `gieomo_canonical_4089c1624e` | Still running and preserved for rollback/write tests |

No Production database, API, role-management operation, dump command, email, webhook, payment provider, or deployment was contacted. The first browser pass encountered retained Production Storage URLs, but all outbound image fetches failed locally with `EACCES`; the final loopback runtime replaces remote asset URLs in responses with a repository-local image and makes no such fetches.

## 2. H33 state preservation

Before the switch, H34 recorded and rechecked the H33 chain:

- Next.js `3790` → proxy `55434` → PostgREST `55445` → synthetic PostgreSQL `55441`.
- H33 database identity: `gieomo_canonical_4089c1624e`, loopback `55441`, synthetic tip-037 cluster.
- Initial web response: HTTP 200.
- Initial branch / HEAD remained `main` / `1c51af625a575a41733d59b29cc9be9ae0892c60`.
- Initial porcelain remained the H33 dirty WIP baseline: 211 entries (66 tracked, 145 untracked).

H34 did not stop the H33 web processes until the new database, restore, integrity, account fixture, runtime configuration, and direct read-only boundary had been prepared. Only the three stateless listeners were replaced. The H33 PostgreSQL process, data directory, `%TEMP%` runtime configuration, reports, and restart script remain intact.

## 3. Snapshot discovery inventory and provenance

Selected artifact: `backups/prod-20261022-20261022T080112/`.

| File | Bytes | Modified (+07:00) | SHA-256 |
|---|---:|---:|---|
| `_query_ledger.sql.txt` | 240 | 2026-10-22 08:04:14 | `8E36F643C9B918543CBB2E9C14C124EE9AED27BFF3B9A8515F055E105A70CC74` |
| `data.sql` | 160,662 | 2026-10-22 08:03:29 | `AFA600FF00DD356BA1787EC51EB3DBB5166A7D743D7239D5C69D70D37083CD9E` |
| `role_memberships.json` | 6,252 | 2026-10-22 08:04:30 | `84F66B8E209BD9A5DE02608F757F08A094092DAFD7C8817BA6B6B06AFF3577C8` |
| `roles.sql` | 229 | 2026-10-22 08:03:43 | `5C0A37CD719D8CD19CD97B3F5B43BAEB2812AE48D92437308201202D0DEBD151` |
| `roles_attributes.json` | 3,718 | 2026-10-22 08:04:40 | `10DC474D85846C8F96DDA07F63D41DC059C72356278B7E614E23BA0D22E41F61` |
| `schema.sql` | 165,914 | 2026-10-22 08:03:19 | `D8F4A589320701B862C03E36E7C13ACB0352375EFE32E1ED929ECC2D45E03C47` |

Evidence that this is the intended real-data source:

- Both SQL files identify PostgreSQL 17.6 as the source and pg_dump 18.6 as the dumper and contain completion markers.
- `schema.sql` contains the 26-table application schema and the managed-Supabase extension/ACL surface; `data.sql` contains COPY sections for all 26 application tables.
- The full checksums match the prefixes and sizes recorded contemporaneously in `OPENCODE_PRODUCTION_DATA_RECONCILIATION_REPORT.md`.
- That report records Supabase project reference `snmmiwpvlpknkinhfqsv`, region `ap-southeast-1`, a read-only fingerprint/dump workflow, and the same restore counts.
- Aggregate data from the artifact exactly matches the pre-drift snapshot evidence: 73 orders, 149 order items, 45 customers, 4 products, 103 variants, 8 combos, 22 combo items, 5 members, and 0 payments.
- Forty-three of 48 archived schema/data fingerprints match exactly. The five exceptions are understood: managed-role constraint visibility, environment-specific default ACL, absent Supabase migration ledger, and two aggregates whose key text differs while row totals, group counts, and frequency distributions match exactly.

Classification: **actual Supabase-derived historical snapshot, verified; complete for the 26-table application schema/data scope; not a full managed-platform backup**. Supabase-only infrastructure such as Vault binaries and managed event-trigger functions is not portable to vanilla PostgreSQL. It contains real customer/application data and is restricted to local read-only inspection.

No fresh snapshot was downloaded. No CLI dry-run or remote role provisioning/rotation was repeated.

## 4. Historical H29 restored database

The original stopped data directory still exists at:

`C:\Users\MT\Workspaces\gieomo-sales-management-system\.tmp\postgres-recon-20261022-data`

It is approximately 88.3 MB. Its stale `postmaster.pid` recorded historical port `55442`; PID `12920` was not running and port `55442` was not listening. H34 did not start or modify this source directory.

To verify availability without touching it, H34 copied it to `.tmp/postgres-recon-h34-inspect-copy`, removed only the copied stale PID file, started the copy on loopback port `55444`, performed read-only inventory, and stopped it gracefully. Confirmed databases:

- `gieomo_prod_rehearsal`: 26 tables, 73 orders, 149 order items, 45 customers, 5 members.
- `gieomo_local_acceptance_20261022`: same real-data counts plus one historical local-only member fixture (6 members).
- `gieomo_restore_shim` and `postgres` also exist.

This proves both the source rehearsal DB and H29 acceptance DB remain recoverable on disk. The original directory remained untouched; the inspection copy was preserved.

## 5. New isolated restore and integrity

Final cluster:

- Data directory: `.tmp/postgres-realdata-h34-20261024d`
- Loopback port: `55443`
- Initdb administrator: `h34_restore_admin_20261024d`
- Pristine database: `gieomo_realdata_pristine_20261024d`
- Final acceptance database: `gieomo_realdata_acceptance_20261024e`
- API login role: `h34_api_20261024d`

The first normal run hit the same Windows restricted-token boundary documented in H33. One approved elevated run was then used. Failed unique attempt directories `20261024a`, `20261024b`, and `20261024c` were retained rather than deleted.

Restore procedure:

1. Initialize a fresh loopback-only PostgreSQL 18.6 cluster.
2. Create only the local roles/schemas needed to accept the dump.
3. Restore `schema.sql` without rewriting it.
4. Restore `data.sql` with `ON_ERROR_STOP=1`.
5. Validate application fingerprints and aggregate counts on the pristine DB.
6. Clone the pristine DB to a separate acceptance DB.
7. Add one clearly synthetic local admin fixture only to the acceptance DB.
8. Apply read-only database settings and least-privilege ACLs before connecting the final web runtime.

Restore results:

- 26 public application tables and 293 columns restored.
- Data restore: zero errors.
- Schema log: 24 expected managed-platform errors, limited to unavailable `supabase_vault` objects and Supabase-managed extension/event-trigger helpers. Public application tables, functions, indexes, triggers, policies, grants and RLS flags restored and matched archived evidence.
- 32 foreign keys checked; 0 orphan rows.
- 0 unvalidated public constraints.
- Final acceptance copy differs in row count only by the one synthetic member fixture.
- A normalized row hash for every real row in every public table matches the pristine DB; 0 real-row hash mismatches.

### Boundary correction recorded

An early REST probe against the first working clone used an existing product and sent its current name back unchanged. PostgREST returned 204 because its HTTP transaction mode can override `default_transaction_read_only`; a trigger could therefore have changed that row's `updated_at`. H34 did not conceal or reverse this. The first clone, `gieomo_realdata_working_20261024d`, was retired from runtime and preserved as evidence. The final acceptance DB was cloned afresh from the untouched pristine DB, fixture and ACL setup were performed in the correct order, and full row hashes then proved parity.

Final write boundary:

- `default_transaction_read_only=on` for the acceptance database.
- `anon`, `authenticated`, and `service_role` have SELECT but no INSERT/UPDATE/DELETE/TRUNCATE/TRIGGER/REFERENCES privileges on public tables.
- Runtime roles have no sequence privileges, no public-function EXECUTE, and no public-schema CREATE.
- Matching default privileges are revoked for future objects in this local acceptance DB.
- A real PostgREST PATCH targeted an existing row with its unchanged value and was rejected before mutation: HTTP 403, PostgreSQL `42501`.

## 6. Schema and migration compatibility

The snapshot is the historical pre-022/023 Production shape. It has no usable `supabase_migrations.schema_migrations` ledger. Repository file presence is not treated as applied migration evidence.

Compared with the H33 synthetic canonical tip-037 DB:

- Snapshot: 26 public tables / 293 columns.
- Tip 037: 29 public tables / 323 columns.
- Missing from the snapshot: `payment_events`, `order_inventory_reservations`, and `order_idempotency_v015_archive`.
- The snapshot lacks 41 tip-037 columns, chiefly modern idempotency/reservation/payment-event fields, order cancellation-effect markers, and `pickup_points.location_guide`.
- The snapshot retains 11 v015 `order_idempotency` fields that tip 037 moved to the archive model.
- Modern writer RPCs such as payment apply/reject, combo save, controlled deletion, variant swap and the v25 canonical writer are absent or differ. No current mutation path is approved against this snapshot.

Current read compatibility is demonstrated by the H29 older-schema fallback: base orders load first, and only the exact missing `order_inventory_reservations` relation is treated as an optional feature. Unknown DB failures remain errors. Writes are intentionally blocked rather than forced through an incompatible schema.

## 7. Real-data field-completeness matrix

The profile covers all 26 tables, 293 columns, nullability/default flags, 32 relationships, constraints, enums, function signatures and per-column null counts. Machine-readable aggregate-only evidence is retained in `.tmp/h34-realdata-schema-profile.json`; it contains no row values.

| Entity / field group | Actual snapshot schema and value pattern | TS / validation / API / service / UI reconciliation | Classification and disposition |
|---|---|---|---|
| Products | 4 rows; all names/slugs/prices/descriptions/costs/weights/thumbnails populated; all 4 category IDs and compare-at prices null | Core read types/API/UI render. Product validation remains partially ad hoc and server schemas are not consistently invoked. | **Missing validation / existing legacy nulls.** No guessed categories or compare prices. |
| Product variants | 103 rows; all variant prices, compare prices and costs null; one image null; 96 zero-stock, 7 positive-stock, total stock 152 | Product-level price supplies effective display price; current types support variant images. Per-warehouse fields remain synthetic aliases rather than DB facts. | **Existing nullable values / unclear warehouse meaning.** No price/cost/warehouse backfill. |
| Product media | 20 rows; relationships valid | API/service gallery reads work. Final local acceptance substitutes a local image for any absolute remote URL without altering stored values; Production behavior is unchanged. | **Runtime compatibility fixed.** Actual storage binaries are outside this SQL snapshot. |
| Combos | 8 rows; core fields populated | List/admin rendering passes. Atomic writer required by current code is absent in the snapshot and blocked by ACL. | **Read complete / write incompatible.** |
| Combo items | 22 rows; every `variant_id` is null; product/combo FKs valid | UI truthfully marks availability unconfigured instead of inventing zero stock. Current canonical schema intentionally permits wildcard/all-variant meaning. | **Existing legacy null / unclear business mapping.** Owner must map variants; no inference performed. |
| Orders | 73 rows; 59 member-referral and 14 landing-page; 62 self-pickup and 11 home-delivery; 63 pending, 1 confirmed, 1 processing, 8 completed | Base order/customer/item reads and detail UI pass. Snapshot has neither `member_delivery` nor `event_sale`; tip 037 adds them. Modern idempotency/cancellation/reservation fields are absent. | **Legacy schema / read-compatible / write blocked.** No local migration applied to real data. |
| Order delivery snapshots | All 73 pickup IDs/snapshots null; shipping-address snapshots populated; assigned shipper null on 23; notes/timestamps are legitimately sparse | UI renders current stored delivery semantics. New `location_guide` and reservation-backed packing are unavailable on this old schema. | **Existing nullable/legacy values.** Unknown values remain unknown. |
| Order items | 149 rows; all product/variant/combo IDs null; all names/prices/quantities/subtotals present; 3 SKU snapshots null; all cost snapshots null; all discounts zero | Snapshot text/price identity renders correctly. Current writer still does not establish historical cost evidence for these rows. | **Missing/inconsistent data value / unclear reconstruction.** No identity, cost or discount backfill. |
| Payments | Table exists with 0 rows while 39 orders say paid | Reconciliation returns 73 orders and 0 recorded payments; UI does not synthesize transaction codes or ledger rows. `payment_events` is absent. | **Confirmed historical ledger gap.** Requires bank evidence; no reconstruction. |
| Customers | 45 rows; names/phones/default addresses populated; 19 emails null; FK integrity passes | Authorized order/customer views render. No new PII endpoint or default email invented. | **Existing nullable value.** |
| Members | 5 real rows; all auth-user IDs null; phone/email/referral/password fields populated. Acceptance DB adds exactly one synthetic local admin. | Session login and protected reads pass; responses contain no `password_hash`. Presence heartbeat becomes a read-only no-op only when the server-only acceptance flag is set. | **Legacy auth linkage / runtime compatibility fixed.** |
| Vouchers | 2 stored rows; core fields populated; public API exposes 1 currently eligible row | Core reads render. Advanced TS/UI fields (`max_discount_amount`, `min_items_count`, gift/visibility controls) still have no snapshot or canonical DB storage. | **Missing DB columns / phantom application fields.** Existing API rejects unsupported non-default writes; business decision required. |
| Pickup points | 1 row; core address/contact/hours populated; snapshot has no `location_guide` | Current code/type/UI supports `location_guide`, and tip 037 contains the additive column, but this historical copy intentionally remains unmigrated. Core point renders. | **Legacy missing DB column; fixed in canonical code, absent in snapshot.** |
| Delivery zones | 0 rows; schema/constraints present | Type exists; no complete route/service/admin workflow. | **Missing API/UI and empty data.** |
| Shipments | 0 rows; carrier/tracking/status/timestamps schema present | Type exists; no complete shipping board/service CRUD. Order-level delivery fields are used instead. | **Missing API/UI and empty data.** |
| Inventory adjustments | 0 rows | Canonical typed service/RPC exists, but the old snapshot lacks the newer complete write contract; operator ledger UI remains partial. | **Missing historical ledger / partial application consumer.** |
| Order idempotency | 0 rows in v015 shape; modern archive/reservation fields absent | Current code targets later atomic contracts. Read acceptance does not need them; mutations are blocked. | **Schema drift / internal write blocker.** |
| Audit logs | 0 rows; DB includes `ip_address` | Central UI/read API remains absent and handwritten TS omits some DB fields. | **Missing application type/API/UI.** |
| Product reviews | 1 row | Public/admin paths exist with manual validation. | **Partial validation; real row renders through product flow.** |
| Categories | 0 rows; all products have null category | Admin/API structure exists, but no real mapping is present. | **Existing missing data value.** Do not assign categories by guess. |
| Sponsors | 2 rows | DB rows exist; full CMS API/admin workflow is absent. | **Missing API/UI consumer.** |
| Media catalog | 0 rows; `folder` exists | Upload targets Storage, not this catalog; central TS/read/admin workflow remains absent. | **Missing application type/API/UI.** |
| Contact messages | 0 rows | Core create/admin workflow exists. | **Complete contract, empty real state.** |
| Workshops / registrations | 0 / 0 rows | No complete TS/API/admin flow. | **Missing application surface / empty data.** |
| System configs | 32 rows | Settings reads work; unrelated pseudo-entities remain serialized as text/JSON. Presence writes are suppressed only in read-only acceptance and rejected by DB ACL regardless. | **Partial validation / weak relational model.** |

### Confirmed unresolved gap classes

- **Missing database column:** advanced voucher controls in current UI/types; snapshot-only absence of `pickup_points.location_guide` and tip-037 technical fields.
- **Missing application type:** complete generated row contracts for audit logs, payment events, inventory ledger, media/workshops and technical idempotency entities.
- **Missing validation:** product, variant and voucher mutation schemas remain inconsistently applied server-side.
- **Missing API/read/write forwarding:** delivery zones, shipments, sponsors, media library, workshops and audit-log operator surfaces.
- **Missing UI input/display:** shipping board, audit/event ledgers and several CMS entities.
- **Existing nullable/legacy value:** combo variants, variant price/cost, customer email, order snapshots and auth-user linkage.
- **Missing/inconsistent data:** 39 paid-status orders without payment rows; 149 order items without cost snapshots or relational product identities.
- **Unclear business meaning:** combo variant mapping, historical item cost/discount allocation, advanced voucher semantics and multi-warehouse inventory.

Only evidence-backed runtime compatibility fixes were implemented. No real-data field was filled, normalized or remapped.

## 8. Code changes implemented by H34

- `src/lib/runtimeAssetSafety.ts`: preserves Production behavior but maps absolute remote product/combo asset URLs to a local repository image when the configured data endpoint is loopback, preventing silent Production Storage access during local acceptance.
- `src/lib/services/productService.ts`: applies the runtime-safe mapping to product media, thumbnails and variant images.
- `src/app/api/combos/route.ts`: applies the same mapping to combo images on reads.
- `src/app/api/members/presence/route.ts`: under the server-only `GIEOMO_READ_ONLY_ACCEPTANCE=true` flag, returns stored presence without the indirect heartbeat upsert; normal runtime behavior is unchanged.
- `tests/runtimeAssetSafety.test.ts`: proves loopback replacement and non-loopback preservation.
- `.tmp/h34-*`: ignored restore, integrity, schema-profile, runtime, browser and write-boundary helpers/evidence.
- This report.

No migration was added or applied to any real-data database.

## 9. Real-data browser acceptance

Final fresh browser run against `gieomo_realdata_acceptance_20261024e`:

| Area | Result |
|---|---|
| `/`, `/products`, real `/products/[slug]`, `/combos` | PASS — 200, rendered, local images, Vietnamese/font checks pass |
| `/cart`, `/checkout`, `/track` | PASS — 200, rendered, no overflow or malformed `undefined`/`NaN` text |
| `/admin/login` and unauthenticated admin redirect | PASS — login 200; unauthenticated `/admin/orders` redirects to `/admin/login` |
| Orders and real order detail | PASS — 73 records via API; list/detail pages 200 |
| Products / variants | PASS — 4 products, 103 variants in DB; admin page 200 |
| Combos / components | PASS — 8 combos / 22 items; admin page 200; unconfigured mapping remains explicit |
| Payments / reconciliation | PASS — 0 payments and 73 reconciliation records; both pages 200 |
| Customers / members / sale | PASS — protected pages 200; safe responses contain no password hash |
| Pickup points / vouchers | PASS — 1 pickup point and 1 currently exposed voucher; pages 200 |
| Fonts / responsive layout | PASS — fonts loaded, Montserrat applied, Vietnamese present, no tested horizontal overflow |
| Browser 5xx | PASS — 0 |

One expected anonymous `/api/orders` request returned 401 because no ownership proof was supplied. One reconciliation fetch was aborted by immediate page navigation. Neither is a server failure. No checkout submission, order/status/payment/stock/combo/member change, upload, email, webhook, logout update or external analytics action was performed.

## 10. Synthetic-only mutation evidence

No mutation suite was pointed at the real-data databases. H33 remains the applicable synthetic write-path evidence:

- canonical migrations 001–037 replayed on a fresh synthetic PostgreSQL cluster;
- mandatory PostgreSQL suite: 80 pass, 0 fail, 0 skip;
- targeted H32 security regression: 89 pass, 0 fail, 0 skip;
- full sequential suite: 620 pass, 0 fail, 6 documented skips;
- type-check and build passed in H33.

H34's code-focused regression set passed 38/38 with 0 skips, including catalog failure behavior, combo routes, payment read behavior, auth/presence hygiene and local asset safety. H34 type-check passed. `git diff --check` is reported in the final gate table below.

## 11. P0-A3 and lint

P0-A3 remains **BLOCKED**, not implemented and not relabeled as pass.

Evidence recovered:

- Current cart/client and legacy v1 writer clamp per-line quantity to 99.
- The approved design review explicitly requires v2 to reject invalid/fractional/over-limit values rather than inherit v1 clamping.
- The maximum per-line quantity, maximum line count and aggregate per-order limit remain named owner/business decisions.
- `create_order_atomic_v2` is not an approved or implemented canonical RPC; the current canonical function lineage is v25 plus wrapper.
- Therefore “99” is legacy behavior, not sufficient approval for all three P0-A3 limits. The skipped PG case remains justified until those values and rollout contract are approved.

Configured lint remains a release blocker and was not hidden:

- H34 full lint: **FAIL — 378 errors, 190 warnings across 99 files**, exactly the H33 final totals.
- New runtime helper, combo route and new test lint clean.
- `productService.ts` still carries its pre-existing 26-error legacy debt; H34 added no new lint finding.
- No lint rule or application directory was disabled/excluded.

## 12. Quality gates

| Gate | Result |
|---|---|
| Artifact checksums/provenance | PASS |
| Historical H29 DB availability | PASS via isolated filesystem copy; original untouched |
| Fresh restore/data load | PASS for application scope; 26 tables, 0 data errors |
| Aggregate snapshot counts | PASS |
| FK/orphan/constraint integrity | PASS — 32 FKs, 0 orphans, 0 unvalidated constraints |
| Pristine vs final acceptance real-row hashes | PASS — 0 mismatches |
| Read-only REST boundary | PASS — real-row PATCH rejected 403 / PostgreSQL 42501 |
| Current app read compatibility | PASS for tested routes and APIs |
| Real-data browser acceptance | PASS — 0 browser 5xx |
| H34 focused regressions | PASS — 38/38, 0 skip |
| TypeScript | PASS |
| `git diff --check` | PASS — no whitespace errors; existing LF/CRLF warnings only |
| Configured lint | FAIL — 378 errors, 190 warnings |
| P0-A3 | BLOCKED — limits/v2 approval absent |

Final Git state remained `main` at `1c51af625a575a41733d59b29cc9be9ae0892c60`. Porcelain contains 213 entries, versus H33's 211; the two-entry increase is H34's new application helper/test paths, while this new report lives under the already-untracked audit directory. Existing WIP was neither flattened nor discarded. No reset, clean, stash, checkout overwrite, stage, commit, push, pull, merge, rebase or deploy occurred.

## 13. Restart and rollback

### Restart H34 real-data acceptance

1. Re-resolve ports and process ownership; do not trust recorded PIDs.
2. Verify `.tmp/postgres-realdata-h34-20261024d/postmaster.pid` and SQL identity before acting.
3. If PostgreSQL is stopped, start that exact data directory on loopback port `55443` with the installed `pg_ctl`; Windows may require elevation.
4. Confirm `%TEMP%\gieomo-h34-realdata-20261024\runtime.env`, `postgrest.conf`, and the owner credential file exist without printing them.
5. Ensure ports `3790`, `55434`, and `55445` are free, then run:

```powershell
powershell -ExecutionPolicy Bypass -File .tmp\h34-start-realdata-runtime.ps1
```

6. Verify database `gieomo_realdata_acceptance_20261024e` on port `55443`, `default_transaction_read_only=on`, product API HTTP 200, and:

```powershell
node .tmp\h34-rest-write-boundary.mjs
node .tmp\h34-integrity-check.mjs
```

### Roll back the web to H33 synthetic

1. Resolve and verify the exact owners of listeners `3790`, `55434`, and `55445`.
2. Stop only those stateless Next/proxy/PostgREST processes; do not stop either PostgreSQL by recorded PID.
3. Verify H33 synthetic PostgreSQL identity `gieomo_canonical_4089c1624e` on `55441`.
4. Run:

```powershell
powershell -ExecutionPolicy Bypass -File .tmp\h33-start-synthetic-runtime.ps1
```

5. Recheck the web, proxy/PostgREST logs and DB identity.

To stop H34 PostgreSQL, first verify the data directory and SQL identity, then use only graceful `pg_ctl -D <exact-H34-data-dir> stop -m fast`. Do not delete the pristine DB, acceptance DB, retired first clone, failed attempt directories, H29 source directory, inspection copy, or credential/config files without explicit owner authorization.

## 14. Remaining blockers

1. Approve P0-A3 per-line, line-count and aggregate limits plus the v2 rollout contract before implementation.
2. Resolve the 378 lint errors in bounded, behavior-tested batches; start with data/write-path modules rather than broad formatting.
3. Define owner rules for combo variant mapping, historical cost/discount evidence and paid-order/payment-ledger reconciliation; never infer these from names or status alone.
4. Decide whether advanced voucher fields and relational multi-warehouse inventory are real product requirements, then add reviewed additive schema/contracts or remove the unsupported UI promises.
5. Build the missing delivery/shipment, audit/event-ledger and CMS operator surfaces if they remain in release scope.
6. If actual Production images are required for an offline acceptance, obtain an explicitly authorized immutable asset export; do not let a loopback DB silently fetch Production Storage.

## 15. Final decision

**A — REAL-DATA LOCAL ACCEPTANCE READY.**

The selected source is the verified retained Supabase-derived snapshot, not a synthetic database. It has been restored into an isolated cluster, preserved as a pristine DB, cloned to a separately locked acceptance DB, and exercised by the local web under a verified database permission boundary. Real-data reads, relationships, counts, null patterns and browser rendering are demonstrated without changing any real row in the final acceptance copy.

Production release remains **NO-GO** until lint and P0-A3 are resolved and the documented business/data-quality decisions are approved.
