---
name: gieomo-payment-integrity
description: Payment identity, retry/duplicate protection, SePay webhook, admin confirm/reject, and known payment consistency gaps for Gieo Mơ. Use when touching payments table, payment API routes, webhook, payment status transitions, or reconciliation of payments.
---

# Gieo Mơ — Payment Integrity

## Architecture (source-verified at HEAD 1c51af6)

- **Single INSERT path** into `payments`: `recordPaymentOnce()` in `src/lib/services/paymentRecordService.ts` — insert-first, `payment_status='paid'` at birth, deterministic `transaction_code`.
- Callers: `src/app/api/orders/payment/route.ts` (admin confirm; code `ADMIN-CONFIRM-<order_code>`) and `src/app/api/webhook/sepay/route.ts` (code = bank `referenceNumber || SEPAY-<id>`).
- No UPDATE/DELETE on `payments` anywhere in app code. RPCs 016/017 do not touch `payments`.
- `orders.payment_status` writers: payment route (confirm/reject/trace), sepay webhook (confirm/trace/note). PATCH `/api/orders` rejects client paymentStatus with 400 (bypass closed, pinned by `tests/patchPaymentBypassClosed.test.ts`).

## Two-layer duplicate defense

1. App: SELECT-then-INSERT — racy by design (documented in migration 018).
2. DB: partial unique index `uq_payments_order_transaction_code (order_id, transaction_code) WHERE transaction_code IS NOT NULL` (migration 018). 23505 on THAT constraint maps to `duplicate`, fail-closed; other errors propagate.

**Rule:** never claim "duplicate prevented" from the app pre-check alone. Different `transaction_code` values on the same order never conflict — there is NO "at most one paid payment per order" constraint.

## Known gaps (CONFIRMED in source; fix awaits approval)

- Cross-writer race: admin confirm + webhook use different codes → 2 paid rows possible for one order.
- Webhook early-returns on `payment_status==='paid'` BEFORE recording → a genuine second transfer leaves no row.
- Unknown order code → HTTP 200 + console.warn only; no payment row, no recon flag.
- Webhook auth: static `Authorization: Apikey` header only; no signature/replay protection. Non-prod without `SEPAY_API_KEY` is unauthenticated.
- RLS: anon INSERT on `payments` still allowed (`013:68 WITH CHECK (true)`); 011 revoked only SELECT.
- Admin Payments page reads localStorage (`getStoredPayments`), not the DB table; transaction codes there are synthesized.
- Pipeline is 3 separate PostgREST transactions (payment INSERT, order UPDATE, history INSERT); history failures silently ignored. Insert-first is intentional.

## Invariants to preserve when editing

- Insert-first: never move the payment INSERT after the order UPDATE.
- Fail-closed 23505 mapping; never swallow unrelated unique violations.
- Confirm/reject/webhook must never resurrect a cancelled order (compare-and-set `.eq("order_status", readStatus)`; trace updates carry no `order_status`). Pinned by `tests/resurrectionGuard.test.ts`.
- Reject guard `.neq("payment_status","paid")`; already-paid early return is HTTP 200 with `isAlreadyPaid`.
- Client double-submit guard: `confirmPaymentServerFirst` in-flight Set (`src/lib/data/paymentConfirm.ts`).

## Verify

```powershell
node --test tests/paymentRecordService.test.ts tests/paymentConfirmServerFirst.test.ts tests/patchPaymentBypassClosed.test.ts tests/paymentBypassFollowup.test.ts tests/resurrectionGuard.test.ts tests/reconciliationPayments.test.ts
```

Real-DB uniqueness: `tests/paymentIdempotencyPg.integration.test.ts` (skips without `pg` + `ATOMIC_PG_URL`). A skip is NOT verification.
