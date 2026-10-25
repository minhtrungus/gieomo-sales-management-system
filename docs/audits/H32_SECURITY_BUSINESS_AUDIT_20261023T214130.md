# H32 Security & Business-Integrity Audit — Tracks E/F

**Snapshot:** 2026-10-23 21:41:30 (Asia/Saigon)  
**Mode:** read-only source/test audit of the current dirty worktree; no database connection, migration application, data write, or environment-value inspection was performed.  
**Verdict:** **NO-GO**. The current candidate has two P0 authorization/privacy blockers, several P1 business/security gaps, and no executed PostgreSQL proof for the new atomic migration chain.

## Scope and evidence standard

Reviewed server authentication/authorization, sensitive API routes, order/payment/voucher/combo/inventory behavior, migrations `001`–`035`, and related unit/source/PG integration tests. Repository SQL is evidence of intended code only; it does **not** prove that any local, staging, or production database has applied the migration chain.

Commands run (read-only except normal test-process temporary output):

```powershell
node --test tests/authPrimitives.test.ts tests/authHygieneBatch4.test.ts tests/authorizationPhase4.test.ts tests/proofOwnership.test.ts tests/proofTokenExpiry.test.ts tests/orderCanonicalWriterSource.test.ts tests/orderMutationIntegritySource.test.ts tests/atomicOrderRpc.test.ts tests/cancelVoucherRelease.test.ts tests/paymentRecordService.test.ts tests/paymentConfirmServerFirst.test.ts tests/patchPaymentBypassClosed.test.ts tests/paymentBypassFollowup.test.ts tests/resurrectionGuard.test.ts tests/r1WebhookFailureModes.test.ts tests/r2PaymentResult.test.ts tests/comboRoute.test.ts tests/migrationPipelineSource.test.ts tests/migration035Source.test.ts tests/inventoryAdjustHandlerContract.test.ts tests/voucherRoute.test.ts tests/voucherPersistenceContract.test.ts
# Result: 180 pass, 0 fail, 0 skip

node --test tests/atomicOrderPg.integration.test.ts tests/cancelOrderPg.integration.test.ts tests/paymentIdempotencyPg.integration.test.ts tests/paymentApplyFaultPg.integration.test.ts tests/paymentRejectionPg.integration.test.ts tests/ordersPaymentsPrivilegesPg.integration.test.ts tests/adjustStockPg.integration.test.ts tests/comboPersistencePg.integration.test.ts tests/comboWildcardCheckoutPg.integration.test.ts tests/voucherConcurrency.integration.test.ts tests/orderDeletionPg.integration.test.ts tests/swapVariantPg.integration.test.ts
# Result: 0 pass, 0 fail, 63 skip (isolated PostgreSQL target not configured)
```

## Findings

### H32-EF-01 — P0 — Predictable public order lookup exposes payment-proof URLs and operational order data

**Evidence**

- Unauthenticated callers need only an order code; no proof token or phone match is required: `src/app/api/orders/route.ts:15-30`.
- Order codes are sequential and date-derived (`GM-<date>-<sequence>`), not high-entropy capabilities: `supabase/migrations/035_combo_wildcard_checkout.sql:465-466`.
- The read first retrieves full order/customer/internal-note data through the service-role client: `src/lib/services/orderService.ts:50-105`.
- Code-only responses mask core PII, but still return amounts/statuses/items/packing metadata and explicitly return the parsed payment-proof URL whenever `code` exists: `src/lib/services/orderService.ts:203-261`, especially `:226-229`.
- Existing ownership tests cover proof **writes**, not confidentiality of order **reads**: `tests/proofOwnership.test.ts`.

**Impact**

An unauthenticated enumerator can predict order codes, confirm order existence, inspect commercial/order state, and obtain a public receipt-image URL. Receipt images may contain financial or personal information. This is an object-level authorization failure and a release blocker.

**Safe reproduction/test mapping**

Add an HTTP unit test that calls `GET /api/orders?code=<known code>` without a session, phone, or proof token and asserts that no receipt URL, internal identifier, packing line, seller identifier, or unmasked customer field is returned. Add a sequence-enumeration regression case using adjacent synthetic codes; do not use real order data.

**Candidate fix**

Require exact phone ownership or a short-lived, order-bound read capability token before returning order detail. Keep a code-only response limited to a generic existence-neutral result (or require both code and phone), remove `payment_proof` from every unauthenticated response, and use high-entropy public tracking identifiers if capability-style lookup remains supported.

### H32-EF-02 — P0 — Logout and account revocation do not invalidate active authorization

**Evidence**

- Session authorization validates only the signed token and expiry; it does not reload member status or current role: `src/lib/auth/serverAuth.ts:140-148`, `:155-179`.
- Tokens live for seven days: `src/lib/auth/serverAuth.ts:16-17`.
- Login returns the bearer token in JSON and the UI stores it in script-readable `localStorage`: `src/app/api/auth/login/route.ts:98-115`; `src/app/admin/login/page.tsx:45-60`.
- `clearAdminSession()` removes only `gieomo_admin_session`, not the bearer token: `src/lib/data/orderStore.ts:3638-3648`. Other client code continues to read that bearer token: `src/lib/data/orderStore.ts:1499-1501`.
- Admin logout clears the HttpOnly cookie but leaves the local bearer token: `src/components/admin/AdminSidebar.tsx:50-58`; `src/app/api/auth/logout/route.ts:6-17`.
- Sale logout does not call the server logout endpoint at all, leaving the cookie and bearer token valid: `src/components/sale/SaleSidebar.tsx:206-211`.

**Impact**

A user who clicks logout can retain a usable credential, and an admin whose account is deactivated or demoted can continue passing `requireAdmin` until token expiry. This defeats revocation and creates a seven-day stale-privilege window.

**Safe reproduction/test mapping**

Add tests that (1) log in, log out, then replay the former cookie and bearer token against an admin-only route, expecting rejection; (2) sign a token for an active admin, mark the synthetic member inactive/demoted in a fake DB, then call `requireAdmin`, expecting 403; and (3) assert both admin and sale logout remove all browser credential material.

**Candidate fix**

Use a server-side revocable session record (opaque session ID, expiry, member ID, revocation/version) and reload current member status/role on authorization. Keep the credential only in a Secure, HttpOnly cookie; stop returning/storing it in `localStorage`. Make both logout controls call the server endpoint and clear all legacy local keys. Rotate/signing-key changes are not a substitute for per-account revocation.

### H32-EF-03 — P1 — General order PATCH permits arbitrary valid-enum lifecycle jumps and omits atomic history/audit

**Evidence**

- Any admin-provided truthy `orderStatus` and `deliveryStatus` are copied directly into the update: `src/app/api/orders/route.ts:137-177`.
- Non-cancellation status changes use a direct table update guarded only against resurrection from `cancelled`: `src/app/api/orders/route.ts:271-327`.
- The path does not validate the allowed transition graph and does not insert `order_status_history` or `audit_logs`: `src/app/api/orders/route.ts:315-364`.
- Existing tests pin payment-field rejection and cancelled-order non-resurrection, but not `pending -> completed`, backward transitions, delivery-order rules, or history/audit atomicity: `tests/patchPaymentBypassClosed.test.ts`; `tests/resurrectionGuard.test.ts`.

**Impact**

An admin action or UI defect can jump a pending order directly to completed, move statuses backward, or set incompatible order/delivery states. The mutation can leave no durable transition evidence and can bypass business side effects that should accompany lifecycle changes.

**Safe reproduction/test mapping**

With a fake DB, PATCH a pending synthetic order to `completed` and a shipping order back to `pending`; both currently reach the update path. Add matrix tests for every allowed/forbidden order and delivery transition and fault-injection tests proving order row, history, and audit either all commit or all roll back.

**Candidate fix**

Replace direct PATCH DML with one service-role-only `transition_order_atomic(jsonb)` RPC. Lock the order, enforce the explicit state machine, validate cross-track conditions, write history/audit in the same transaction, and return typed outcomes. Revoke runtime execution as done for the payment/create/cancel RPCs.

### H32-EF-04 — P1 — Service-role upload endpoint allows unauthenticated product-media writes

**Evidence**

- Authentication is required only for `content-media` or batches larger than two files: `src/app/api/upload/route.ts:68-103`.
- Therefore one or two `product-media` files per request are unauthenticated, yet uploaded with the service-role client: `src/app/api/upload/route.ts:105-166`.
- Per-file type/size checks exist, but there is no request/user quota or rate limit: `src/app/api/upload/route.ts:7-15`, `:109-171`.

**Impact**

Anonymous callers can repeatedly consume storage and public bandwidth. Magic-byte checks reduce content-type abuse but do not address authorization or unbounded repeated requests.

**Safe reproduction/test mapping**

Mock storage and issue an unauthenticated multipart request containing one valid small PNG to `product-media`; assert the current path invokes upload. The fixed regression must expect 401/403 and zero storage calls.

**Candidate fix**

Require admin authorization for catalog/media uploads. Keep customer payment proof on its dedicated ownership-checked route. Add request-size limits before multipart buffering and an application/edge rate limit.

### H32-EF-05 — P1 — Notification endpoint is an unauthenticated email trigger keyed by predictable order codes

**Evidence**

- `POST /api/notify/email` has no authentication, ownership token, or rate-limit check: `src/app/api/notify/email/route.ts:5-25`.
- It accepts an order identifier, loads the order through the service-role client, and sends to the stored customer email when configured: `src/app/api/notify/email/route.ts:26-70`, `:100-118`.
- Order codes are predictable (finding H32-EF-01).

**Impact**

An unauthenticated caller can trigger repeated order/payment emails to customers, causing spam, reputational harm, and provider quota/cost consumption. The DB lookup prevents arbitrary-recipient relay but does not prevent abuse against known/enumerated orders.

**Safe reproduction/test mapping**

Mock the provider and submit a known synthetic order code without credentials; assert the current route reaches the provider. Add fixed tests for unauthorized rejection, idempotent notification-event keys, and rate limiting.

**Candidate fix**

Do not expose a general public send endpoint. Trigger confirmation from the successful canonical order/payment server flow using a durable outbox/idempotency key. If a resend action is needed, require admin or an order-bound capability and enforce cooldown/attempt limits.

### H32-EF-06 — P1 — Authenticated role checks are broader than the exposed sensitive data

**Evidence**

- `requireAuth` intentionally accepts admin, `btc_sale`, and `delivery_staff` without route-specific authorization: `src/lib/auth/serverAuth.ts:183-204`.
- Any authenticated role can read the full member roster with email, phone, role, status, timestamps, and presence: `src/app/api/members/route.ts:34-86`.
- Any authenticated role can read inventory warehouses and inflow/transfer logs: `src/app/api/inventory/route.ts:71-100`.
- There is no committed role-per-route matrix establishing that delivery staff need these full datasets; the source comment itself records that the matrix still needs business approval: `src/lib/auth/serverAuth.ts:183-189`.

**Impact**

A least-privileged or compromised staff account receives broader personal and operational information than is demonstrably required. This is an authorization/data-minimization gap even though the endpoints are not anonymous.

**Safe reproduction/test mapping**

Extend `tests/authPrimitives.test.ts`/route tests with a `delivery_staff` session and assert field/route denial according to an owner-approved permission matrix. Add explicit allow tests for each role rather than treating all signed sessions as equivalent.

**Candidate fix**

Define and approve a role-per-route/action matrix, implement a `requireRole(request, allowedRoles)` primitive, and return role-specific projections. Default-deny new sensitive routes.

### H32-EF-07 — P1 — Login has no online-attack controls; bearer exposure amplifies credential theft

**Evidence**

- The login route performs a direct member lookup and PBKDF2 verification with no IP/account rate limit, delay, lockout ledger, or abuse event: `src/app/api/auth/login/route.ts:13-96`.
- The token is returned to JavaScript and persisted in `localStorage` (finding H32-EF-02).
- Password hashing is present and uses PBKDF2-SHA512 with 100,000 iterations: `src/lib/auth/serverAuth.ts:34-57` (positive control, but not an online brute-force control).

**Impact**

The public endpoint supports unbounded credential guessing. Any same-origin script compromise can read the seven-day bearer token, bypassing the HttpOnly protection of the parallel cookie.

**Safe reproduction/test mapping**

Add deterministic tests around a pluggable limiter: after the approved threshold for one synthetic account/IP bucket, login returns 429 without querying/hash verification; successful authentication and cooldown reset behavior should be explicit.

**Candidate fix**

Apply edge/application rate limiting keyed by normalized account plus IP, progressive delay, generic failure messages, and security telemetry without logging credentials. Remove the JavaScript-readable bearer token as part of H32-EF-02.

### H32-EF-08 — P2 — Sensitive admin mutations are not consistently audited

**Evidence**

- Payment/create/cancel/delete/swap/stock RPCs contain durable audit patterns (positive control), e.g. `supabase/migrations/035_combo_wildcard_checkout.sql:498-517` and `supabase/migrations/029_atomic_payment_rejection.sql:61-74`.
- Direct order status/delivery/assignment/note PATCH has no audit/history write: `src/app/api/orders/route.ts:271-364`.
- Voucher and member create/update/delete paths perform direct service-role DML without audit writes: `src/app/api/vouchers/route.ts:38-127`, `:134-320`; `src/app/api/members/route.ts:93-201`, `:208-246`.
- Combo persistence RPC saves header/components atomically but does not write `audit_logs`: `supabase/migrations/031_optional_combo_variant_persistence.sql:5-153`.

**Impact**

Investigations cannot reliably attribute catalog, access-control, voucher, or lifecycle changes. This weakens recovery and makes malicious/accidental changes harder to distinguish.

**Safe reproduction/test mapping**

For each sensitive action, test that one audit row contains actor member ID, stable action/entity, and redacted before/after metadata; inject an audit failure and verify whether the chosen policy is atomic rollback or an explicitly documented durable outbox.

**Candidate fix**

Move sensitive mutations into audited atomic RPCs or a shared durable audit/outbox transaction. Never include passwords, session tokens, full PII, payment proof URLs, or raw provider payloads in audit JSON.

### H32-EF-09 — P2 — Admin price/value validation permits invalid commercial records

**Evidence**

- Combo POST/PATCH converts invalid, zero, or negative values with `Number(...) || 0`, without enforcing a positive safe integer: `src/app/api/combos/route.ts:303-310`, `:400-413`.
- The combo RPC casts and stores the supplied numeric value: `supabase/migrations/031_optional_combo_variant_persistence.sql:42-74`.
- Core combo/product price columns have no demonstrated positive-value CHECK in the base schema; the order RPC trusts the database catalog price while correctly ignoring client prices: `supabase/migrations/001_initial_schema.sql` (table definitions), `supabase/migrations/035_combo_wildcard_checkout.sql:193-205`.
- Voucher PATCH validates `discount_value > 0` but allows arbitrary `usage_limit`, negative minimum order values, and percentage values above 100; runtime order calculation caps percentage at 100: `src/app/api/vouchers/route.ts:189-209`; `supabase/migrations/035_combo_wildcard_checkout.sql:300-322`.

**Impact**

An admin/UI error can create zero/negative catalog pricing or malformed voucher limits. The canonical order writer protects against client price tampering, but it cannot correct invalid authoritative catalog data.

**Safe reproduction/test mapping**

Add route and PostgreSQL constraint tests for zero, negative, fractional, overflow, NaN-like input, percentage above the approved maximum, invalid date ranges, and usage limits below current use.

**Candidate fix**

Validate business ranges at the API and add additive DB CHECK constraints after a read-only data preflight. Use integer VND semantics and fail closed instead of coercing invalid values to zero.

### H32-EF-10 — P1 release gate — PostgreSQL migrations/concurrency are unverified on a real isolated database

**Evidence**

- Source tests report a contiguous migration chain through `035`, and newer migrations revoke runtime DML/read/RPC access and grant sensitive RPC execution only to `service_role`: `supabase/migrations/022_revoke_runtime_order_dml.sql:11-21`; `027_close_runtime_read_and_rpc_bypasses.sql:11-35`; `028_orders_payments_least_privilege.sql:4-39`; `035_combo_wildcard_checkout.sql:544-621`.
- The targeted non-PG suite passed 180/180.
- Every selected PostgreSQL integration test skipped: 63/63, including order/voucher/stock concurrency, payment fault rollback, privilege denial, combo persistence/wildcard allocation, cancellation, deletion, and variant swap.
- No operator evidence in this audit identifies an applied migration ledger for an isolated, staging, or production database.

**Impact**

Atomicity, lock ordering, constraints, RLS/ACL outcomes, and migration replay are not proven against PostgreSQL. Source assertions and mocked clients cannot close this gate.

**Safe reproduction/test mapping**

On an operator-identified disposable PostgreSQL target only: replay `001`–`035`, record the applied migration ledger, run the full non-skipped PG suite, and preserve exact commands/results. Do not point the harness at production.

**Candidate fix**

Treat the candidate as NO-GO until all mandatory PG tests execute and pass on an isolated target. Separately verify staging/production migration state before any release claim.

## Positive controls confirmed in source

- SePay authentication fails closed when its key is absent and uses constant-time hashed comparison: `src/app/api/webhook/sepay/route.ts:5-25`.
- Payment confirmation/rejection is admin-only and delegates to atomic service-role RPCs: `src/app/api/orders/payment/route.ts:17-147`.
- Migration `023` adds one-paid-payment-per-order and transaction identity uniqueness; migrations `023`/`024` record unmatched/additional/cancelled payment events rather than resurrecting orders: `supabase/migrations/023_payment_integrity.sql:77-145`; `supabase/migrations/024_repair_payment_cash_contract.sql:202-360`.
- Generic order PATCH rejects all client payment-status fields before writes: `src/app/api/orders/route.ts:122-135`.
- Order creation recalculates catalog prices, vouchers, shipping, and stock in the database; it uses an idempotency ledger and stable locking: `supabase/migrations/035_combo_wildcard_checkout.sql:90-156`, `:172-427`.
- Cancellation uses exact reservation provenance and atomic stock/voucher reversal: `supabase/migrations/026_atomic_order_cancellation.sql:101-276`; migration `035` persists wildcard allocation provenance.
- Combo component persistence is atomic and RPC execution is service-role-only: `supabase/migrations/031_optional_combo_variant_persistence.sql:5-160`.
- The destructive clear-data API is a non-mutating 403 stub: `src/app/api/admin/clear-data/route.ts:6-13`.

## Release priority

## H32 remediation addendum

- H32-EF-01: **FIXED IN CODE / TESTED LOCALLY** — code-only lookup is rejected; phone or order-bound token is required; customer projection strips proof/staff data.
- H32-EF-02: **FIXED IN CODE / TESTED LOCALLY** — member status/role/version is reloaded; logout rotates `updated_at`; legacy bearer storage/response was removed.
- H32-EF-04: **FIXED IN CODE / TESTED LOCALLY** — upload is admin-only before multipart/storage.
- H32-EF-05: **FIXED IN CODE / TESTED LOCALLY** — email trigger is admin-only before DB/provider work.
- H32-EF-07: **PARTIALLY FIXED** — deterministic process-local limiter added; distributed/edge enforcement remains open.
- H32-EF-03, EF-06, EF-08, EF-09 and EF-10 remain open or blocked as described below. Final full code suite: 540 pass, 0 fail, 74 skip. Type-check/build pass; broad lint fails; PostgreSQL/browser verification is blocked.

1. Block release on **H32-EF-01** and **H32-EF-02**.
2. Close lifecycle integrity (**H32-EF-03**) and unauthenticated service triggers (**H32-EF-04/05**) before external exposure.
3. Approve and enforce a role matrix plus login controls (**H32-EF-06/07**).
4. Add audit/range constraints (**H32-EF-08/09**).
5. Execute the isolated PostgreSQL gate (**H32-EF-10**) and report skips as unverified, never as passes.

