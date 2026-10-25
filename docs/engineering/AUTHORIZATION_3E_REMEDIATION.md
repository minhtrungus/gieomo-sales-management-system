# Authorization and 3E controlled remediation

Date: 2026-10-13. Evidence level: repository source and local mock tests only.

## Role-per-route matrix

| Route/method family | Observed authorization | Data/exposure note | Disposition |
|---|---|---|---|
| auth login/logout/session | public or current signed session | session endpoint returns the current user's limited identity | expected boundary; revocation remains absent |
| catalog GET (`products`, `categories`, `combos`, `pickup-points`, active `vouchers`, settings) | public; product drafts require a signed staff session | storefront data; settings must continue excluding secrets | source PASS |
| catalog mutations | `requireAdmin` | product/combo/category/voucher/pickup data | source PASS; audit coverage incomplete |
| `GET /api/members` | anonymous gets member id/name/referral only; signed users can receive the roster | signed non-admin roles may receive broader member PII | BLOCKED pending role/PII policy |
| member mutations | `requireAdmin` | role/account data | auth PASS; audit incomplete |
| presence GET/POST | `requireAuth`; writes use session identity | all signed roles; JSON read-modify-write can race | policy BLOCKED; atomic merge needs DB proposal/test |
| inventory GET / POST | `requireAuth` / `requireAdmin` | GET is visible to every signed role | BLOCKED pending role matrix; writes protected |
| orders GET | staff session may list/search; anonymous must provide exact code | exact-code public lookup still exposes order fields selected by service | object/field exposure needs explicit customer-access policy |
| orders POST | public checkout | no mandatory server key; P0-A3 governs | BLOCKED P0-A3 |
| orders PATCH | `requireAdmin`; payment fields rejected | general order transition path | auth PASS; transition/audit action list incomplete |
| payment GET/POST | `requireAdmin` | payment/PII; confirm/reject audited | source PASS; R1 transaction boundary blocked |
| proof POST | code plus matching phone, expiring proof token, or admin; paid order rejected | object-level authorization is code-bound | source/mock PASS |
| reconciliation/notifications | `requireAdmin` | financial, customer and inventory data | source PASS |
| SePay webhook | configured API key | provider money event | source PASS for key compare; end-to-end BLOCKED |
| contact POST | public intake | rate limiting/abuse control absent | OPEN |
| contact messages | `requireAdmin` | PII | auth PASS; audit incomplete |
| upload POST | small product-media uploads can be anonymous; content/multi-file needs any signed user | public bucket write/abuse surface | BLOCKED pending upload policy |
| notify/email POST | public; order and recipient are re-read from DB | knowledge of a valid order code can trigger mail repeatedly | OPEN; client polling caller removed in R2, endpoint policy/rate limit unresolved |
| reviews GET/POST/DELETE | public reads/submission; admin delete | submission publication/moderation policy unresolved | BLOCKED on business moderation policy |
| clear-data POST | unconditional 403 stub | no mutation | PASS |

`requireAuth` deliberately remains broad because the repository has no approved permissions matrix separating `admin`, `btc_sale`, and `delivery_staff`. No role was narrowed by assumption.

## Audit coverage

Current durable `audit_logs` writes cover admin payment confirm, reject, and confirm-on-cancelled-order. The writer whitelists status fields and does not fail the business operation if audit storage fails. Sensitive actions still lacking durable audit include general order transitions, product/combo/voucher changes, inventory changes, member/role changes, settings, contact-message changes and upload administration. Expanding this requires an approved action list, actor/retention requirements and a decision whether audit failure blocks each operation.

## 3E reconciliation findings

- API access is admin-only and read-only.
- Output pagination is clamped to 1..200 with deterministic ordering; payment lookups are chunked at 500 IDs.
- Classification and KPI computation still begin with an unbounded Phase-A order scan, and the orphan detector scans all payments in the selected time window. Output pagination therefore does not bound database work. A cursor/materialized-summary design needs scale requirements and PostgreSQL evidence.
- Orphan detection distinguishes null `order_id`, missing orders and valid orders outside the selected window; query failures fail closed.
- The service reports mismatches but does not repair stock, vouchers, orders or financial rows.
- KPI names currently mix expected order value and recorded paid amounts. Revenue/COGS definitions remain business decisions; no threshold is introduced here.

## Monitoring design (inactive)

Emit counters and age gauges only; threshold values and paging ownership must be configured by business/operations:

- webhook events by outcome (`matched`, under/overpaid, unmatched, duplicate delivery, handler failure);
- inbound events awaiting reconciliation and oldest age;
- paid orders without payment evidence, payment totals differing from order totals, orphan payments;
- duplicate-order/idempotency conflicts, ambiguous/null-version ledgers and legacy writer denials;
- reconciliation duration, scanned row counts, query failures and last successful completion;
- audit-write failures and unauthorized/forbidden request counts;
- stock/voucher invariant violations as detection-only signals.

Alerts must link to a runbook and never auto-repair money, stock or vouchers. Alert thresholds, aggregation windows, recipients and escalation ownership are explicitly **BLOCKED on operator/business decisions**.

Status: authorization source review **PARTIAL**; object-level proof flow **PASS at mock level**; 3E correctness tests **PASS at mock level**; complete role policy, audit coverage, scale behavior and monitoring activation **BLOCKED**.

