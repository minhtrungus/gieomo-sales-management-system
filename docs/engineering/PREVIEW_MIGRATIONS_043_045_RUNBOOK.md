# Preview migrations 043-045 runbook

Status: prepared only. Do not run these steps until an operator has identified
an isolated Supabase Preview database. The repository's current local project
link points at Production (`snmmiwpvlpknkinhfqsv`) and must never be used for
this procedure.

## Required operator evidence

Record all of the following without copying credentials into logs or commits:

- Preview project/branch name and project ref.
- Evidence that its database is independent from Production.
- A Preview-only GitHub environment with `SUPABASE_PROJECT_REF` configured.
- Preview-scoped access token and database password stored as environment secrets.
- Backup/restore evidence appropriate for the Preview data set.
- Expected source commit and migration history through `042`.

Stop immediately if the candidate ref equals `snmmiwpvlpknkinhfqsv`, the
environment identity is ambiguous, or migration history is not exactly what
the reviewed plan expects.

## Read-only preflight

Run from the reviewed commit and inspect the output before any write:

```powershell
node scripts/migrations/validate-chain.mjs
supabase projects list
supabase link --project-ref <verified-preview-ref>
supabase migration list --linked
supabase db push --linked --dry-run
```

The dry-run must identify only these pending migrations, in order:

1. `043_admin_order_archival.sql`
2. `044_combo_bottom_up_allocation.sql`
3. `045_guard_admin_order_archival.sql`

If any earlier, later, repaired, or unexpected migration is pending, unlink and
stop. Do not use `--include-all`, repair history, or force a push as part of this
runbook.

## Reviewed effects

Migration `043` creates a service-role-only archive ledger and the
`archive_order_atomic(jsonb)` RPC. It row-locks the order, requires an active
admin actor, records a snapshot and audit entry, and does not delete the order,
payments, payment events, inventory reservations, shipments, or history.

Migration `044` rewrites only the already-locked wildcard allocation loop in
`create_order_atomic_v25(jsonb)`. Candidate rows retain stable UUID lock order;
allocation priority becomes `sort_order DESC, variant_id DESC`.

Migration `045` replaces the archive RPC with a terminal-state guard. Only
`completed` and correctly `cancelled` orders may leave active operational
views. It still performs no cancellation, refund, restock, reservation change,
payment/provider mutation, shipment change, or order-status change. An audit
failure rolls the archive row back in the same transaction.

These migrations have no automatic down migration. Recovery is restore-based
or requires a separately reviewed forward migration; do not improvise rollback
SQL during an incident.

## Apply and verify

Only after the preflight has been reviewed and the target is independently
confirmed as Preview:

```powershell
supabase db push --linked
supabase migration list --linked
supabase db lint --linked --fail-on error --schema public
```

Then run the archive authorization/atomicity tests and combo allocation tests
against that Preview database. Confirm active orders are rejected, terminal
orders are hidden without ledger/inventory mutations, and the admin API fails
explicitly when the archive RPC is unavailable. Never use real customer orders
or real payments as test fixtures.

Finally unlink or restore the operator's prior local link so a later command
cannot accidentally reuse the Preview target.
