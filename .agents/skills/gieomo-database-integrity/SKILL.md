---
name: gieomo-database-integrity
description: PostgreSQL schema, migrations, RLS, atomic RPCs, locking, and safe database testing rules for Gieo Mơ. Use when writing migrations, SQL, RPCs, RLS policies, concurrency tests, or reasoning about data integrity.
---

# Gieo Mơ — Database Integrity

## Migration map (repo files; applied-state on any live DB is UNKNOWN until operator evidence)

- 001 initial schema (enums `payment_status`, `payment_method`; `payments` table, no tx uniqueness)
- 002/011/013 RLS layers — 013 is current payments RLS: anon INSERT `WITH CHECK (true)` (known gap), authenticated read, service_role all
- 012 atomic stock; 015 idempotency ledger; 016 `create_order_atomic` RPC; 017 `cancel_order_atomic` RPC (`SELECT ... FOR UPDATE` on order)
- 018 partial unique index `uq_payments_order_transaction_code` + fail-closed verification block
- 019 inventory adjustments; 020 ledger delete policy

## Integrity patterns in this codebase

- Compare-and-set guards inside UPDATE (`.eq("order_status", readStatus)`, `.neq("payment_status","paid")`) instead of row locks in payment writers.
- Deterministic transaction codes + unique index + fail-closed 23505 classification (`paymentRecordService.ts`).
- Atomic RPCs for order create/cancel with documented lock order (ledger → catalog → vouchers → stock).
- Idempotency ledger (`order_idempotency`) with PK claim protocol — design in `docs/engineering/P0-A3_IDEMPOTENCY_DESIGN_REVIEW.md` (implementation NO-GO).

## Hard rules

- Never run migrations/SQL writes against Production or any DB without explicit operator identification of an isolated, disposable target.
- Repository migration files do NOT prove a live DB applied them. Distinguish `FIXED IN CODE` / `VERIFIED IN ISOLATED DATABASE` / `VERIFIED IN PRODUCTION`.
- Mock/fake-Supabase tests never prove PostgreSQL concurrency. PG integration tests are conditional on optional `pg` + `ATOMIC_PG_URL` and SKIP by default — a skip is NOT a pass.
- Never conflate application-level checks with database-enforced uniqueness.
- Do not print connection strings, keys, or env values; report variable names + configured/missing only.
- Never delete/rewrite migration history files; additive migrations only.

## PG test hygiene (when an approved target exists)

- Unique run-scoped identifiers; cleanup in `finally`; prefer per-test transaction + rollback.
- Record applied migration set as evidence.
- Separate committed-winner concurrency scenarios from rolled-back-claim scenarios (lesson from `tests/atomicOrderPg.integration.test.ts` review).
