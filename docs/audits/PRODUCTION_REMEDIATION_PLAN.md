# Gieo Mơ Production Forensic Follow-up & Remediation Plan

## 1. Purpose, Status, and Safety Boundary

Plan timestamp: **2026-10-15 18:44 ICT (+07:00)**.

This document continues `docs/audits/PRODUCTION_READ_ONLY_FORENSIC_AUDIT.md`. It is a plan only. No remediation, migration, data repair, deployment, webhook, order test, payment test, or Production write was performed while preparing it.

Evidence labels used throughout:

- **CONFIRMED**: directly supported by supplied Production observations, repository evidence, or a read-only observation explicitly identified as such.
- **LIKELY**: a strong mechanism matches the observation, but execution against Production is not proven.
- **POSSIBLE**: technically plausible but lacks sufficient evidence.
- **UNKNOWN / NOT CHECKED**: evidence has not been obtained.

The evidence ladder is strict:

1. `FIXED IN CODE` does not mean tested or deployed.
2. `TESTED LOCALLY` does not prove PostgreSQL behavior.
3. `VERIFIED IN ISOLATED DATABASE` requires non-skipped tests on an operator-identified disposable PostgreSQL target.
4. `VERIFIED IN STAGING` and `VERIFIED IN PRODUCTION` require matching deployment, schema, and smoke evidence.

### Mandatory prohibitions for this plan

- Do not write to Production until the applicable gates in section 10 pass and an authorized change window is approved.
- Do not automatically assign historical catalog IDs.
- Do not fabricate payment records or transaction identities.
- Do not change order/payment status as part of evidence collection.
- Do not use `db push`, `migration repair`, `db reset`, seed scripts, webhooks, or synthetic Production orders/payments as discovery tools.
- Do not treat repository migration files, object names, or local test results as proof of Production apply/deploy state.
- Do not export PII, transaction codes, bank payloads, payment proof files, or audit JSON payloads into working notes or this report.

## 2. Current Evidence and Immediate Release Blockers

The baseline findings F-01 through F-10 retain the classifications in the forensic audit unless explicitly refined by new evidence.

Additional read-only source/public-artifact evidence gathered after the baseline audit:

- **CONFIRMED (public Production frontend mechanism):** the served checkout bundle performs a direct `POST /api/orders` and, after success, calls the deployed `saveNewOrder` implementation, which performs another `POST /api/orders`. Both requests lack an idempotency key. Whether and how many duplicate rows were created is **NOT CHECKED**.
- **CONFIRMED (source):** `origin/main` fixes that checkout double-send by using `syncToServer: false`, but still accepts `paymentStatus` in the general order PATCH route and retains the historical invalid payment inserts in the admin and SePay writers.
- **CONFIRMED (source inconsistency):** `origin/main` includes migration 023 and documentation claiming only `apply_payment_event` writes `paid`, while the runtime routes on the same ref do not call that RPC.
- **CONFIRMED (public artifact):** the current public homepage/checkout markers do not match `origin/main@0b7825e`; the exact backend deployment SHA remains **UNKNOWN**.

### Blocking conditions now

1. **RB-01 — Order creation can duplicate:** deployed frontend has a two-POST path without an idempotency key; actual duplicate count is unknown.
2. **RB-02 — Payment truth is inconsistent:** 11 orders are marked paid while `payments` has zero rows; external payment evidence has not been reconciled.
3. **RB-03 — Payment bypass/writer defects remain in committed refs:** neither local HEAD nor `origin/main` is a coherent, deploy-ready payment artifact.
4. **RB-04 — Catalog identity is absent:** all 114 supplied order items lack catalog IDs; cancellation/restock provenance is unreliable.
5. **RB-05 — Migration provenance is missing:** the Production ledger is empty while later-looking objects exist.
6. **RB-06 — Production authorization surface is unknown:** RLS policies, grants, default privileges, and sensitive RPC EXECUTE privileges have not been cataloged.
7. **RB-07 — No canonical release artifact:** deployment SHA is unknown and the workspace contains extensive uncommitted work.
8. **RB-08 — Real PostgreSQL proof is missing:** concurrency, rollback, payment deduplication, cancellation/restock, and RLS suites have not run non-skipped on an approved isolated target.

**Current verdict: Production release and Production data remediation are NO-GO.**

## 3. Ordered Remediation Program

The phases are intentionally sequential. A later phase must not be used to bypass evidence missing from an earlier phase.

| Phase | Objective | Exit evidence | Writes allowed |
|---|---|---|---|
| 0. Freeze and ownership | Name incident, finance, catalog, DB, security, release, and rollback owners; preserve current evidence | Written scope, owners, change-control ID, evidence location | Documentation only |
| 1. Read-only Production fingerprint | Identify deployment artifact, schema shape, privileges, and aggregate anomaly windows | Timestamped deployment metadata plus schema/ACL/function/index fingerprints | None |
| 2. Case classification | Classify 114 item links, 11 paid orders, and suspected duplicate orders without mutating them | Aggregate results and restricted case manifests | None |
| 3. Canonical chain decision | Select a reproducible migration baseline and matching code revision | Approved chain map, clean commit SHA, compatibility decision | Disposable DB only |
| 4. Isolated PostgreSQL rehearsal | Prove migrations, rollback, concurrency, idempotency, payments, cancellation, and RLS | Non-skipped test artifacts and restore drill | Disposable DB only |
| 5. Staging remediation rehearsal | Exercise the exact release and separately approved data-repair procedure | Staging apply/smoke/reconciliation evidence and rollback rehearsal | Staging only |
| 6. Production change decision | Approve or reject code/schema/data batches independently | Signed GO decision for each batch | None until window opens |
| 7. Controlled Production execution | Apply only approved batches with stop conditions and four-eyes review | Before/after aggregates, immutable logs, monitoring | Explicitly approved writes only |
| 8. Post-change verification | Confirm invariants without exposing sensitive data | Aggregate checks, deployment SHA, monitoring sign-off | Read-only unless a new change is approved |

Code/schema stabilization and historical data correction must be separate change batches. A release that prevents new damage must not silently include speculative historical backfill.

## 4. Remediation Matrix F-01 Through F-10

| Finding | Missing evidence | Safe verification | Preconditions before any fix | Options to consider later | Business risk and rollback | Required authority |
|---|---|---|---|---|---|---|
| **F-01 — 114 item rows lack catalog IDs** | Creation windows; historical catalog versions; uniqueness/reuse history of SKU; delete/archive actions; exact deployed writer | Aggregate rows by day and snapshot completeness; catalog candidate counts only; restricted mapping manifest; audit action counts without payloads | Canonical deployment window known; catalog owner defines identity rules; each proposed link has evidence class; backup and restore drill pass | Prevent new null identities in writer/RPC; optionally add a future validated constraint for newly created rows; human-approved batch repair only for Class A mappings; preserve snapshots | Wrong links can corrupt restock, cost, and reporting. Rollback requires the exact before-image per item and must not infer prior NULLs from current state | Catalog owner + data steward + DB owner + business owner |
| **F-02 — 11 paid orders, zero payments** | Provider confirmation per case; payment/status history time buckets; proof-presence flags; deployed payment writer; evidence of deletion/reset | Finance performs restricted provider-side matching; DB produces opaque case IDs and aggregate classifications; no codes or bank data in report | Writer bypass closed; canonical payment identity model approved; finance signs each case; no fabricated transaction identity; backup/restore tested | For verified payments, later create provenance-preserving ledger entries through an approved atomic repair path; ambiguous cases remain review items; do not auto-downgrade or auto-create payments | False positive creates a fictitious ledger; false negative can trigger duplicate collection/refund. Rollback must reverse only repair rows and preserve original order state/evidence | Finance owner + business owner + DB owner + security reviewer |
| **F-03 — Empty migration ledger** | Full schema/ACL/function/index fingerprint; hosting and DB change history; object-definition comparison to every candidate chain | Read-only catalog queries, ledger export, deployment/change-log export, clean disposable replays | Exact target identity confirmed; canonical migration owner named; restorable backup validated; schema classified as known baseline rather than guessed from filenames | Adopt an approved baseline-and-forward strategy; preserve existing objects; use additive reconciliation only after rehearsal; ledger repair, if ever approved, follows catalog proof and is never the discovery step | Wrong ledger repair can make future tooling skip required changes or replay incompatible DDL. Rollback is restore/forward-fix, not blind ledger edits | Production DB owner + migration owner + release manager |
| **F-04 — Deployment commit unknown** | Vercel/release deployment ID, source SHA, build time, branch, artifact checksum, environment promotion history | Hosting metadata and CI logs; public asset markers may narrow but cannot prove backend SHA | One immutable commit selected; build is reproducible from clean checkout; code and migration compatibility documented | Pin build metadata in artifact; expose a non-sensitive build SHA endpoint/header; require deployment manifest and release record | Deploying the wrong tree can reintroduce known writers or mismatch RPCs. Rollback must identify the prior immutable deployment, not a mutable branch | Release manager + application owner + hosting owner |
| **F-05 — ON DELETE SET NULL can erase links** | Catalog delete action counts/windows; deleted-entity archive availability; whether IDs were ever present | Aggregate delete actions; catalog tombstone/archive inventory; no audit JSON extraction | Historical identity policy decided; delete behavior and retention requirements approved | Prefer archive/disable over hard delete; consider tombstones or immutable identity ledger; do not rewrite history solely from current catalog | Hard delete can permanently remove reconciliation evidence. Rollback of a future policy change must not resurrect products into active sale state | Catalog owner + data steward + DB owner |
| **F-06 — No paid/payment invariant** | Actual Production indexes, triggers, functions, RPC privileges; treatment of under/over/additional payments | Read-only `pg_indexes`, `pg_constraint`, `pg_trigger`, `pg_proc`, ACL catalog; aggregate mismatch counts | Payment state machine and exception cases approved; all writers routed through one atomic contract; existing inconsistencies classified | Atomic payment-event RPC; unique paid-payment invariant where business rules permit; durable event ledger for unmatched/additional transfers; monitoring query for cross-table mismatches | Overly strict constraints can reject legitimate additional/partial payments. Rollback must preserve received-money evidence and use forward-fix for ledger semantics | Finance owner + payment product owner + DB owner + security reviewer |
| **F-07 — RLS/grants unknown** | Table privileges, policies, column privileges, default privileges, routine EXECUTE, storage policies, ownership | Read-only ACL/policy/function fingerprint under DB-owner supervision; isolated role tests for anon/authenticated/service_role | Required access matrix approved; server/browser call graph documented; matching code no longer relies on direct runtime DML | Revoke runtime order/payment DML and sensitive reads; restrict RPC EXECUTE; harden default privileges; retain only explicitly justified catalog reads | Premature revocation can break checkout/admin flows; insufficient revocation exposes PII or write bypasses. Rollback grants only the reviewed minimum, never blanket privileges | Security owner + DB owner + application owner |
| **F-08 — Destructive reset capability** | Operational execution logs; who can run scripts; hosting/CI references; database audit coverage | Search repository/CI/runbooks and aggregate change logs; do not execute script | Reset tooling scoped to disposable environments; Production credentials unavailable to it; runbook and owner controls exist | Add environment guards and allowlisted project IDs in a future change; separate test credentials; alert on destructive statements | Accidental deletion may require PITR and reconciliation. Rollback is restore from a tested recovery point | Operations owner + DB owner + security owner |
| **F-09 — Dirty workspace mistaken for fix** | Intended change set; clean base; dependency graph; review ownership; provenance of untracked migrations/tests | Read-only diffs among HEAD, `origin/main`, integrated ref, and workspace; create an explicit file manifest later | Work isolated onto an approved clean branch/worktree; unrelated changes excluded; one migration chain; peer review complete | Curate coherent commits by subsystem; never stage broadly; produce signed release manifest and SBOM/build evidence as applicable | Mixing unrelated work can deploy contradictory code/migrations. Rollback must target complete coherent commits, not individual dirty files | Application owner + migration owner + release manager |
| **F-10 — No real PG/concurrency proof** | Approved disposable target; installed optional driver; applied migration set; non-skipped outputs; failure-injection results | Run section 9 suites only on identified disposable PostgreSQL; retain sanitized logs and DB version | Target explicitly declared disposable; credentials not printed; cleanup strategy; exact commit/migrations recorded | Extend missing tests, run clean-chain replay, then staging smoke; mock/source tests remain supplemental | False confidence can allow oversell, double payment, or double restock. Rollback is discard disposable DB; staging rollback follows rehearsed plan | Test lead + DB owner + release manager |

## 5. Classification Plan for the 114 Historical Order Items

The goal is classification, not automatic repair. Current catalog matches alone are insufficient because catalog rows may have changed, been deleted, or reused after order creation.

### 5.1 Evidence sources allowed

- Snapshot fields already stored on `order_items`: item name, variant name, SKU, unit price, quantity, and creation time.
- Current catalog IDs and non-sensitive catalog attributes.
- Historical catalog exports, immutable inventory ledgers, or approved audit action metadata if available.
- Git/deployment windows that establish which writer was active.
- Catalog deletion/rename/archive timestamps, using counts or restricted case workspaces rather than report exports.

PII, audit JSON payloads, transaction codes, bank data, and customer contact fields are not required.

### 5.2 Classes

#### Class A — sufficient evidence for a proposed link

An item is eligible for a **human-approved proposed mapping** only when all applicable conditions hold:

1. Exactly one candidate entity exists for the intended type (variant, simple product, or combo).
2. At least one strong identity signal is exact and historically stable, preferably a unique SKU or immutable archived catalog ID.
3. A second independent signal corroborates it: product/variant name, historical price, combo composition, or inventory/audit record at the order time.
4. The candidate existed and was valid at the order creation time; current existence alone is insufficient.
5. Product/variant parentage is consistent.
6. No SKU reuse, rename conflict, deleted predecessor, or competing catalog candidate exists.
7. The mapping type is unambiguous: variant versus simple product versus combo.

Class A means “eligible for separately approved repair,” not “safe to auto-update.” Every mapping must retain its before-image, evidence reasons, reviewer, and decision timestamp in a restricted manifest.

#### Class B — multiple candidates or insufficient evidence

Use Class B when any of these applies:

- Snapshot SKU is blank, duplicated, reused, or maps to more than one historical candidate.
- Name and price match multiple products/variants.
- Current catalog matches but historical existence cannot be established.
- Combo name exists but historical component composition is unavailable.
- Snapshot fields conflict with one another or with the catalog timeline.
- A suspected duplicate order makes stock history or intended item identity uncertain.

No ID repair is allowed. A catalog owner may review additional restricted evidence, after which the item can move to A or C.

#### Class C — preserve snapshot; do not link

Use Class C when authoritative historical identity cannot be recovered, evidence conflicts materially, the catalog identity was reused, or the source entity was deleted without a trustworthy archive. Keep the snapshots as the historical record and mark the item operationally “identity unresolved” through a future approved design, not by inventing an ID.

### 5.3 Review and repair controls

- Generate only aggregate counts per class for general reporting.
- Store any row-level mapping manifest in an access-controlled location, not in Git or this report.
- Require two-person review: catalog owner proposes, data steward approves.
- Validate proposed foreign keys against a staging clone before Production consideration.
- Repair in small deterministic batches with transaction-level before/after counts and stop-on-first-mismatch.
- Never infer a combo ID from price/name alone.
- Never use order cancellation/restock as a test of a repaired historical link.
- Keep an exact reversal manifest; rollback restores only the fields changed by that batch.

## 6. Reconciliation Plan for the 11 Paid Orders

### 6.1 Case preparation

1. Inside the authorized environment, assign an opaque reconciliation case ID to each paid-without-payment order. Do not put order codes, customer data, transaction codes, proof URLs, or bank fields in the report.
2. Produce only aggregate context: order/payment status, amount bucket, created/updated time bucket, status-history action counts, audit action counts, and proof-present boolean.
3. Confirm whether `payment_events` or an equivalent durable ledger exists before relying on it. Repository migration 023 is not evidence that it exists in Production.

### 6.2 Finance-side matching

An authorized finance operator reviews provider records inside the provider console or approved secure workspace. Match using the minimum necessary fields and do not export bank payloads. A second finance reviewer confirms the result.

Classify each case as:

- **Verified paid exactly once** — authoritative provider evidence matches the order and amount policy.
- **Verified underpaid/overpaid/additional transfer** — money exists but cannot be represented as a normal single paid event without review.
- **Ambiguous** — more than one candidate or incomplete identity.
- **No external evidence found** — absence of evidence is not proof of non-payment.
- **Operational exception** — cancelled/completed/refunded state requires a separate business decision.

General reporting contains counts by class only.

### 6.3 Preconditions for any later ledger repair

- The deployed payment writer and general PATCH bypass are closed first.
- The canonical payment model defines partial, over, duplicate, cancelled-order, and additional transfers.
- Each repaired payment uses a real, authoritative identity; no synthetic transaction code is invented.
- The repair path atomically preserves payment event, payment row, order state decision, history, and audit provenance as approved.
- Existing order status is not silently changed. Any status correction is a separate finance/business decision.
- Backup/restore drill and staging rehearsal pass.
- Finance owner and DB owner approve the exact restricted case manifest.

## 7. Determining the Canonical Migration Chain

### 7.1 Collect three independent evidence sets

1. **Production catalog fingerprint:** schemas, columns/types/defaults, enums, constraints, indexes, triggers, functions/signatures/owners/EXECUTE privileges, RLS flags/policies, table/sequence privileges, default privileges, and migration ledger.
2. **Git history:** immutable migration contents and hashes across local HEAD, `origin/main`, and relevant integrated refs; commits introducing/replacing writers; merge-parent differences.
3. **Deployment metadata:** deployed source SHA, build/deployment ID, timestamp, promoted environment, and release/change record.

Object presence is evidence of schema shape only. It does not prove that the correspondingly numbered migration ran.

### 7.2 Build a provenance matrix

For every candidate migration, record:

- expected preconditions;
- objects created/changed;
- exact definition fingerprints;
- data-dependent failure conditions;
- expected ledger row;
- matching code dependency;
- observed Production state: present, absent, conflicting, or unknown.

Stop if the schema is mixed or cannot be mapped without assumptions. In particular, distinguish V015 and V025 idempotency shapes and preserve any legacy ledger as evidence.

### 7.3 Reproduce, do not guess

- Replay each plausible chain from a clean base in a disposable PostgreSQL instance.
- Also rehearse from a schema-only representation of the observed target shape when legally and operationally approved.
- Compare normalized catalog fingerprints, not just object names.
- Verify that matching application code calls the functions installed by the chain.
- Reject a chain if it requires editing historical migration files, silently coercing legacy identities, or pretending ledger rows existed.

### 7.4 Canonicalization decision

The DB owner and migration owner choose one documented baseline-and-forward strategy. Any future baseline/reconciliation migration must be additive, reviewed, replayed, and applied first to staging. `migration repair` is not permitted merely to make tooling output look clean; it requires independent proof of the represented state and explicit approval.

## 8. Proposed Remediation Batches

These are options for later approval, not actions authorized by this document.

### Batch A — stop new damage

- Select a clean immutable code revision.
- Ensure checkout makes one idempotent create request.
- Require an idempotency key and atomic order creation for every public/admin/POS/sale path.
- Persist catalog IDs and snapshots from server-authoritative catalog resolution.
- Reject general PATCH payment fields.
- Route admin, SePay, and COD payment application through one atomic contract.
- Remove runtime-role direct order/payment DML and sensitive reads not required by the app.

### Batch B — schema compatibility and invariants

- Apply only the approved canonical chain after clean replay and staging.
- Add payment/event uniqueness and least privilege consistent with approved business rules.
- Add monitoring for paid-without-payment and catalog-ID-null creation after the cutover timestamp.
- If a catalog identity constraint is adopted, design it for new rows first; do not validate it over unresolved historical rows without an explicit legacy strategy.

### Batch C — historical data

- Repair only Class A catalog mappings from the approved restricted manifest.
- Reconcile only finance-verified payment cases through the approved provenance-preserving path.
- Leave Class B/C item rows and ambiguous payment cases unchanged and visible to reconciliation.
- Treat suspected duplicate orders as separate business cases; do not delete or merge them automatically.

Each batch needs its own GO decision and rollback plan. Batch A must not wait for speculative Batch C cleanup if it can safely prevent new damage.

## 9. Required Real PostgreSQL Test Plan

All tests run against an operator-identified disposable database. `ATOMIC_PG_URL` presence, target identity, PostgreSQL version, exact commit, applied migration list, and test timestamps must be recorded without printing credentials. A skipped test is a failed release gate.

### 9.1 Migration and transaction tests

- Clean replay of the approved chain from the expected baseline.
- Upgrade replay from every supported predecessor shape; mixed/unknown shapes must fail closed before writes.
- Transaction rollback after injected failure at order, item, stock, voucher, ledger, history, and audit stages.
- Verify no partial order, stock decrement, voucher consumption, payment, history, or audit residue after rollback.
- Verify DDL/data preconditions produce an explicit stop rather than partial application.

### 9.2 Order creation and idempotency

- Two concurrent requests with the same scope/key/hash commit exactly one order and one inventory/voucher effect.
- Replay after success returns the same canonical result without new rows.
- Same key with a different payload fails closed.
- A losing/uncommitted claim does not permanently block a valid retry.
- Distinct keys competing for insufficient stock cannot oversell or drive stock negative.
- Variant, simple product, and combo lines persist the authoritative IDs plus snapshots.
- HTTP/browser integration confirms one checkout action produces one POST and one order.

Relevant existing candidates include `tests/atomicOrderPg.integration.test.ts`, `tests/voucherConcurrency.integration.test.ts`, and the order/idempotency tests on the selected canonical ref. Existing files must be reviewed against the chosen migration version before use.

### 9.3 Payment integrity and deduplication

- Concurrent delivery of the same provider event creates one durable event/payment effect.
- Admin and webhook races for the same order cannot create two paid payments.
- Different transaction identities on an already-paid order are preserved as review events, not silently discarded.
- Underpayment, overpayment, cancelled-order payment, completed-order payment, unknown order, and retry outcomes follow the approved state machine.
- Any exception rolls back payment, order, history, event, and audit changes together.
- Direct PATCH or table DML cannot mark paid outside the approved contract.
- A monitoring query returns zero newly created paid-without-payment orders after cutover.

Relevant existing candidates include `tests/paymentIdempotencyPg.integration.test.ts`, `tests/r1PaymentPg.integration.test.ts`, and `tests/paymentCashPg.integration.test.ts` on refs where they exist. Their migration assumptions must match the selected chain.

### 9.4 Cancellation, restock, and voucher release

- Concurrent/repeated cancellation restores each inventory reservation exactly once.
- Voucher usage is released exactly once.
- A failure after any intermediate step rolls back status, stock, voucher, history, and audit together.
- Paid cancellation preserves payment truth and returns an explicit refund/review outcome.
- Legacy orders lacking trustworthy catalog/reservation provenance fail closed as `inventory_unverified` or the approved equivalent; no guessed restock occurs.
- Combo component restoration matches the immutable reservation created at order time.

Relevant existing candidates include `tests/cancelOrderPg.integration.test.ts`, `tests/cancelOrderAtomicPg.integration.test.ts` on refs where present, and stock-deduction PG tests. Do not infer coverage from filenames; inspect assertions and require non-skipped execution.

### 9.5 RLS, grants, and function execution

- `anon` and ordinary `authenticated` roles cannot SELECT PII/order/payment data unless explicitly approved.
- They cannot INSERT/UPDATE/DELETE customers, orders, order items, payments, histories, or internal ledgers.
- They cannot EXECUTE sensitive order, stock, cancellation, or payment functions.
- `service_role` has only the required privileges and can execute the approved server contracts.
- Default privileges do not reopen future tables/functions.
- RLS policies and grants are tested independently; passing one does not prove the other.
- Storage/payment-proof access follows the approved ownership rules.

### 9.6 Backup and restore validation

- Create a restorable backup of the isolated/staging rehearsal target using the same operational method intended for Production.
- Restore into a separate target and compare schema fingerprints and aggregate business counts.
- Measure restore time against the recovery objective.
- Record backup identifier, timestamps, owner, restore target, checks, and sign-off without recording credentials or sensitive row data.

## 10. Release Gates

### Gate 0 — Evidence and ownership

**GO only if:** target identity is confirmed; incident, DB, finance, catalog, security, release, and rollback owners are named; evidence storage and access are approved.

**NO-GO if:** Production project/deployment identity is ambiguous, or any required owner is missing.

### Gate 1 — Canonical artifact and chain

**GO only if:** a clean immutable code SHA and migration chain are selected; code-to-RPC compatibility is demonstrated; Production catalog comparison is complete; no migration state is inferred solely from repository presence.

**NO-GO if:** ledger/schema is mixed or unknown, `origin/main`-style documentation/code contradictions remain, or the intended release includes uncommitted files.

### Gate 2 — Isolated PostgreSQL

**GO only if:** all mandatory suites in section 9 pass non-skipped; rollback/failure injection passes; schema fingerprints match expectations; no negative stock, duplicate order/payment, double restock, or runtime privilege bypass is observed.

**NO-GO if:** any mandatory test is skipped, uses mocks instead of PostgreSQL, or requires a Production connection.

### Gate 3 — Backup and restore

**GO only if:** a restorable backup is created and restored successfully in rehearsal; recovery timing and verification meet the approved objective; restore owner and stop criteria are documented.

**NO-GO if:** backup existence is assumed, restore has not been tested, or rollback depends on destructive down-migrations without rehearsal.

### Gate 4 — Staging

**GO only if:** matching code and migrations deploy to staging in the rehearsed order; checkout, payment, reconciliation, cancellation, RLS, and monitoring smokes pass; no P1 remains unaccepted; observation/soak period completes.

**NO-GO if:** staging differs from the candidate, provider/payment smoke evidence is absent, or monitoring cannot detect the known anomalies.

### Gate 5 — Production prevention release

**GO only if:** Gates 0–4 pass; deployment SHA is pinned; change and rollback owners are present; maintenance/monitoring window is active; finance and security sign off on their domains.

**NO-GO if:** any deployed path can double-create orders, write paid without the canonical ledger, accept general payment PATCH, or bypass required authorization.

### Gate 6 — Historical data repair

**GO separately for each case batch only if:** prevention release is stable; restricted manifests are approved; every row has a classification; backup/restore and staging repair/rollback pass; before/after aggregate checks and stop thresholds are defined.

**NO-GO if:** a catalog link or payment identity is inferred, ambiguous, synthetic, or unsupported by the appropriate catalog/finance authority.

### Evidence package to retain

- Exact code SHA, migration hashes, deployment ID, and target environment identity.
- Timestamped schema/ACL/function/index fingerprints and migration ledger output.
- Sanitized aggregate anomaly counts before and after.
- Non-skipped test logs with database/version/migration context.
- Backup and successful restore evidence.
- Approved restricted manifests by identifier and checksum, not their sensitive contents.
- GO/NO-GO decisions, approvers, stop criteria, rollback decision, and monitoring results.

## 11. Read-Only Commands for a Future Authorized Session

These commands are examples only and were **not executed for this plan**. Confirm the target project/database out of band before using them. Do not print environment variable values.

### 11.1 Local source and Git

```powershell
git status --short
git rev-parse HEAD
git rev-parse origin/main
git merge-base HEAD origin/main
git log --oneline --decorate --all -- src/app/api/orders src/app/api/webhook/sepay src/lib/services/orderService.ts supabase/migrations
git diff --no-ext-diff HEAD..origin/main -- src/app/api/orders src/app/api/webhook/sepay src/lib/services/orderService.ts supabase/migrations
git show <approved-ref>:<path>
```

Do not run fetch/pull/switch/checkout/reset/stash/rebase/clean as part of the forensic session.

### 11.2 Supabase/hosting metadata

```powershell
supabase --version
supabase projects list
supabase migration list --linked
```

Use hosting/CI read-only inspection to obtain deployment ID, commit SHA, build time, source branch, and promotion history. Do not list or print environment variable values.

### 11.3 Read-only SQL envelope

Run SQL only after the operator confirms the exact target. Prefer a read-only role and wrap the session:

```sql
BEGIN TRANSACTION READ ONLY;

SELECT current_database(), current_user, current_timestamp;
SHOW transaction_read_only;

-- approved SELECT statements only

ROLLBACK;
```

### 11.4 Schema, migration, and privilege fingerprint

```sql
SELECT version, name
FROM supabase_migrations.schema_migrations
ORDER BY version;

SELECT table_name, column_name, ordinal_position, data_type, udt_name,
       is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
ORDER BY table_name, ordinal_position;

SELECT c.conrelid::regclass AS relation_name, c.conname, c.contype,
       pg_get_constraintdef(c.oid) AS definition
FROM pg_constraint c
JOIN pg_namespace n ON n.oid = c.connamespace
WHERE n.nspname = 'public'
ORDER BY relation_name::text, c.conname;

SELECT schemaname, tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;

SELECT event_object_table, trigger_name, event_manipulation,
       action_timing, action_statement
FROM information_schema.triggers
WHERE trigger_schema = 'public'
ORDER BY event_object_table, trigger_name, event_manipulation;

SELECT n.nspname AS schema_name, p.proname,
       pg_get_function_identity_arguments(p.oid) AS arguments,
       p.prosecdef AS security_definer,
       pg_get_userbyid(p.proowner) AS owner
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
ORDER BY p.proname, arguments;

SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

SELECT r.rolname,
       has_table_privilege(r.rolname, 'public.customers', 'SELECT,INSERT,UPDATE,DELETE') AS customers_any,
       has_table_privilege(r.rolname, 'public.orders', 'SELECT,INSERT,UPDATE,DELETE') AS orders_any,
       has_table_privilege(r.rolname, 'public.order_items', 'SELECT,INSERT,UPDATE,DELETE') AS order_items_any,
       has_table_privilege(r.rolname, 'public.payments', 'SELECT,INSERT,UPDATE,DELETE') AS payments_any
FROM pg_roles r
WHERE r.rolname IN ('anon', 'authenticated', 'service_role')
ORDER BY r.rolname;

SELECT defaclrole::regrole AS owner, defaclnamespace::regnamespace AS schema_name,
       defaclobjtype, defaclacl
FROM pg_default_acl
ORDER BY owner::text, schema_name::text, defaclobjtype;
```

Review routine EXECUTE privileges for the exact signatures discovered above. Do not guess signatures from repository files.

### 11.5 Sanitized anomaly aggregates

```sql
SELECT
  count(*) AS total_items,
  count(*) FILTER (
    WHERE product_id IS NULL AND variant_id IS NULL AND combo_id IS NULL
  ) AS all_catalog_ids_null,
  count(*) FILTER (WHERE nullif(btrim(sku_snapshot), '') IS NULL) AS missing_sku,
  count(*) FILTER (WHERE nullif(btrim(variant_name_snapshot), '') IS NULL) AS missing_variant_name
FROM public.order_items;

SELECT date_trunc('day', created_at) AS day,
       count(*) AS items,
       count(*) FILTER (
         WHERE product_id IS NULL AND variant_id IS NULL AND combo_id IS NULL
       ) AS all_catalog_ids_null
FROM public.order_items
GROUP BY 1
ORDER BY 1;

SELECT count(*) AS paid_orders_without_payment
FROM public.orders o
WHERE o.payment_status::text = 'paid'
  AND NOT EXISTS (
    SELECT 1 FROM public.payments p WHERE p.order_id = o.order_id
  );

SELECT payment_status::text, payment_method::text, count(*) AS order_count
FROM public.orders
GROUP BY payment_status, payment_method
ORDER BY payment_status::text, payment_method::text;
```

### 11.6 Near-duplicate order detector

This returns aggregate counts only. It is a screening signal, not proof that a customer did not intentionally submit two identical orders.

```sql
WITH baskets AS (
  SELECT
    o.order_id,
    o.customer_id,
    o.final_amount,
    o.payment_method,
    o.created_at,
    md5(string_agg(
      concat_ws('|',
        coalesce(oi.sku_snapshot, ''),
        oi.item_name_snapshot,
        coalesce(oi.variant_name_snapshot, ''),
        oi.quantity::text,
        oi.unit_price::text
      ),
      '||' ORDER BY coalesce(oi.sku_snapshot, ''),
                    oi.item_name_snapshot, oi.quantity, oi.unit_price
    )) AS basket_hash
  FROM public.orders o
  JOIN public.order_items oi ON oi.order_id = o.order_id
  GROUP BY o.order_id, o.customer_id, o.final_amount,
           o.payment_method, o.created_at
), sequenced AS (
  SELECT *,
    lag(created_at) OVER (
      PARTITION BY customer_id, final_amount, payment_method, basket_hash
      ORDER BY created_at
    ) AS previous_created_at
  FROM baskets
)
SELECT count(*) AS suspected_duplicate_second_orders,
       min(created_at) AS earliest_seen,
       max(created_at) AS latest_seen
FROM sequenced
WHERE previous_created_at IS NOT NULL
  AND created_at - previous_created_at
      BETWEEN interval '0 seconds' AND interval '30 seconds';
```

### 11.7 Aggregate history/audit discovery

First inspect column names. Do not select JSON payload columns.

```sql
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('audit_logs', 'order_status_history')
ORDER BY table_name, ordinal_position;

SELECT status_type, from_status, to_status,
       date_trunc('day', created_at) AS day,
       count(*) AS event_count
FROM public.order_status_history
GROUP BY status_type, from_status, to_status, date_trunc('day', created_at)
ORDER BY day, status_type, from_status, to_status;
```

Only after confirming the actual non-payload column names may an operator run action/entity/count/min/max timestamp aggregates on `audit_logs`.

## 12. Approvals and RACI Summary

| Decision | Accountable approver | Required reviewers |
|---|---|---|
| Canonical deployment artifact | Release manager | Application owner, security owner |
| Canonical migration chain | Production DB owner | Migration owner, application owner |
| Catalog mapping criteria and Class A manifest | Catalog/data owner | Data steward, DB owner |
| Payment case classification and ledger repair | Finance owner | Business owner, DB owner, security reviewer |
| RLS/grant model | Security owner | DB owner, application owner |
| Backup/restore acceptance | Operations owner | DB owner, rollback owner |
| Staging GO | Release manager | Test lead plus all domain owners |
| Production prevention release GO | Business/change authority | Release, DB, security, finance, rollback owners |
| Historical data batch GO | Business/data authority | Catalog or finance owner, DB owner, independent reviewer |

No single engineer should both prepare and approve a historical mapping/payment repair manifest.

## 13. What Remains Unknown / Not Checked

- Exact Production backend and frontend commit SHA, despite public markers excluding `origin/main` as the current frontend artifact.
- Whether the two-POST checkout mechanism created duplicate Production orders, and how many.
- Creation-time distribution and historical catalog candidates for the 114 item rows.
- Whether any of the 11 paid orders has authoritative provider evidence, represents an additional/partial payment, or lacks evidence.
- Production audit/status-history aggregate evidence for the affected windows.
- Production policies, grants, default privileges, functions, indexes, triggers, and storage policies beyond supplied observations.
- Which migrations, if any, were applied and by what mechanism.
- Whether a restorable Production backup/PITR point exists and meets recovery objectives.
- Non-skipped PostgreSQL concurrency/rollback results for the canonical candidate.
- Staging behavior and monitoring readiness.

Until those unknowns are resolved, no historical catalog linkage, payment ledger creation, status correction, migration repair, or Production release should proceed.
