# P0 Forensic Report — Missing Order `GM-390336`

## A. Incident summary

- **Incident:** reported missing order `GM-390336`.
- **Investigation:** 2026-10-14 17:35 ICT (UTC+07:00, Asia/Saigon).
- **Safety mode:** read-only investigation. No production data, application code, migration, deployment, Git index, or Git history was modified. This report is the only file created by the investigation.
- **Production deployment:** **not verified**. The workspace has no `.vercel/project.json`; the configured Vercel token is invalid; the configured GitHub token is invalid; and network access to the Git remote was unavailable. The exact live branch, commit, deployment timestamp, rollback history, and runtime environment variables remain unknown.
- **Production database:** **not accessed**. `.env.local` names a Supabase host (`snmmiwpvlpknkinhfqsv.supabase.co`) and contains anon/service-role variables, but the target could not be tied to the live deployment. Per the incident stop condition, no query was sent and the service-role credential was not used.
- **Storefront/admin database identity:** not verified. Local source uses the same Supabase client factories, but the live environment-variable bindings could not be inspected.
- **Timestamp semantics:** repository database columns use `TIMESTAMPTZ`; application code emits ISO timestamps. The live database/session timezone and Vercel log display timezone were not available. This report uses ICT.
- **Conclusion:** it is not currently possible to prove whether `GM-390336` is absent, deleted, or merely invisible/renamed in production. The required classification is **inconclusive due to unavailable production evidence**.

## Scope and evidence preservation

Read-only evidence collected:

- Root worktree HEAD: `1c51af625a575a41733d59b29cc9be9ae0892c60` on `main`; local remote-tracking `origin/main` points to `9fdfc7011ca100facb5203800c10247155c7ab05`.
- The root is five commits ahead of its local `origin/main` and already heavily dirty. Existing files were not changed.
- The local remote-tracking commit is only a comparison candidate, **not proof of the deployed artifact**.
- Exact-string search for `GM-390336` in both root and integrated-candidate worktrees returned no match. This only proves the code/docs/worktrees contain no captured evidence for that code.
- Existing release-gate evidence independently states that order creation is non-atomic and non-idempotent and that staging/production schema and deployment state were not verified.

## B. Findings

| Hypothesis / finding | Evidence and source | Timestamp / timezone | Confidence | Potential impact | Next safe action |
|---|---|---|---|---|---|
| `GM-390336` was generated only in a browser, while the server persisted the same attempted order under a different code. | In local `origin/main`, admin create, POS, and sale create generate `GM-xxxxxx` client-side and call `saveNewOrder()`. `saveNewOrder()` stores that client code in `localStorage`, then asynchronously POSTs the object to `/api/orders` without reading the response. `createOrderServer()` ignores the supplied `order_id`/`order_code`, generates a second random code, and inserts that second identity. Sources: `src/app/admin/orders/create/page.tsx`, `src/app/admin/orders/pos/page.tsx`, `src/app/sale/create-order/page.tsx`, `src/lib/data/orderStore.ts`, `src/lib/services/orderService.ts` at local `origin/main`. Blame dates the affected UI paths to Sep 23–30, before the Oct 9–10 local changes. | Source commits dated 2026-09-23 through 2026-10-08 ICT | **Probable code-level cause; unconfirmed for this order** | A displayed/QR/payment memo code may have no matching `orders.order_code`; a sibling order may exist under another generated code. Payment matching by the displayed code can fail. | After live environment verification, correlate a narrow time window using redacted receiver-phone suffix/hash, amount, seller, item count/SKUs, and creation time; do not rely on code alone. Inspect browser storage/screenshots and the POST response/log correlation if retained. |
| The admin list can make a browser-only code disappear after synchronization. | `syncOrdersFromServer(true)` runs on the admin orders page. It rebuilds local state from the server and preserves unmatched local orders only if younger than ten minutes. Therefore a client code that was never the server identity disappears from that browser after ten minutes/sync. Source: `src/lib/data/orderStore.ts` at local `origin/main`, lines 35–70. | Code introduced before incident; exact deployment unknown | **Probable visibility mechanism; unconfirmed for this order** | Operators may interpret local-cache eviction as deletion even when a sibling server order exists. | Preserve the originating browser's local storage/export before further use, if operationally and legally permitted; compare redacted fields with the live database. |
| Public checkout can create a second order after an apparently successful first order. | Checkout explicitly POSTs `/api/orders`, receives the canonical server code, then calls `saveNewOrder(newOrderRecord)`, which POSTs `/api/orders` again. There is no stable idempotency key in the local remote-tracking implementation. Sources: `src/app/checkout/page.tsx` lines 397–488 and `src/lib/data/orderStore.ts` lines 119–259 at local `origin/main`. | Source present by 2026-10-09 ICT; deployment unknown | **Confirmed source defect; not tied to `GM-390336`** | Duplicate orders, duplicate stock deduction, duplicate customer/voucher effects, and a second code unknown to the customer. | Once production identity is verified, search same-customer/same-items/same-amount orders created seconds apart; return aggregate count and redacted codes only. |
| A generated code can fail to persist after stock has already been deducted. | `createOrderServer()` deducts stock before generating/inserting the parent order. If the order insert fails (including random-code uniqueness collision), it returns an error without compensating the already deducted stock. Sources: `src/lib/services/orderService.ts` at local `origin/main`, stock path before lines 454–490. | Source present by 2026-10-09 ICT; deployment unknown | **Confirmed source defect; not tied to `GM-390336`** | Inventory loss without an order parent; possible customer retry and duplicate downstream effects. | Inspect live application errors for order-insert failures and reconcile stock movements/catalog deltas in the same narrow time window. |
| A parent order can be returned as successful with missing items/history. | After parent insert, the `order_items` insert result is ignored; initial history insert is best effort. The route still returns success. Source: `src/lib/services/orderService.ts` at local `origin/main`, lines 492–545. | Source present by 2026-10-09 ICT; deployment unknown | **Confirmed source defect; not tied to `GM-390336`** | Partial orders, totals with no lines, and incomplete auditability. Depending on UI query behavior, records can appear empty or misleading. | Count live orders with zero items and missing initial history in a bounded incident window after schema discovery. |
| A normal application delete path removed the order. | No `orders.delete()` or SQL `DELETE FROM orders` path was found in tracked `origin/main` application/migration source. Child FKs use `ON DELETE CASCADE`, so a parent deletion would erase many child rows, but source inspection found no normal writer that performs it. External dashboard/manual SQL remains uninspected. | Source snapshot `9fdfc70`; deployment unknown | **Not supported by inspected source; not ruled out in production** | If an external/manual parent deletion occurred, items/payments/shipments/history may also be gone through cascades; audit evidence may be the only trace. | Inspect Supabase audit/database logs and operator activity after target verification. Do not infer deletion from missing children. |
| The UI merely filters out an existing order. | Server exact-code lookup applies only `orders.order_code = upper(code)` and the admin list does not globally exclude cancelled rows. However the query converts database errors into an empty array, which can make a query/schema failure look like “not found.” The admin page also uses a 200-row sync limit. | Source snapshot `9fdfc70`; deployment unknown | **Possible, lower confidence** | Existing orders can be invisible because of query errors, cache sync, pagination, or local/server identity mismatch. | Query the parent table directly by exact code after environment verification; separately test API response/error and admin pagination. |
| Oct 9–10 local changes caused the incident. | The risky client-generated identity paths predate Oct 9. HEAD/local changes and untracked migrations are not deployment evidence. The user states Oct 9–10 changes were not deployed. | 2026-10-14 ICT investigation | **Ruled out as an assumption** | Misattribution could lead to deploying/reverting the wrong artifact. | Obtain the actual Vercel deployment SHA before code-to-runtime attribution. |

## C. Order existence matrix

Because the production environment identity and safe access path were not verified, `absent` is not used for any production location.

| Location | Status | Evidence / limitation |
|---|---|---|
| Main order (`orders`) | **not inspected** | Production database not queried. |
| Items (`order_items`) | **not inspected** | Production database not queried. |
| Payment (`payments` and any payment-event ledger) | **not inspected** | Production schema/applied migrations unknown; database not queried. |
| Delivery (`shipments` / delivery fields) | **not inspected** | Production database not queried. |
| Inventory movements/catalog stock | **not inspected** | Production schema may differ; database not queried. |
| Voucher (`orders.voucher_id`, voucher usage) | **not inspected** | Production database not queried. |
| History/audit (`order_status_history`, `audit_logs`) | **not inspected** | Production database not queried. |
| Request/idempotency | **not inspected** | Applied state of migrations 015/016 is unknown; deployed code identity is unknown. |
| Application logs | **not inspected** | Vercel authentication invalid and project not linked. |
| Database logs | **not inspected** | No verified dashboard/log access. |
| Local repository/worktrees | **absent** | Exact-code search returned no match; this is not production evidence. |

## D. Root cause

**Classification: Inconclusive due to unavailable production evidence.**

The leading hypothesis is a **client/server order-identity split** for an admin, POS, or sale-created order: `GM-390336` may be the browser-generated code shown to the operator/customer while the server inserted the same attempted order under a different `GM-xxxxxx` code. This explains both an initially visible code and its later disappearance from the admin list, but it cannot be promoted to confirmed root cause without live database/log/browser evidence.

If the incident originated from the public checkout, the more relevant source defects are the second background POST and non-idempotent multi-call creation. The originating channel is currently unknown.

## E. Wider impact

- **Number of other potentially affected orders:** unknown; no production query was authorized by a verified environment identity.
- **Potentially affected population:** every order created through the deployed versions of admin create, POS, or sale create that used client-generated identity; public checkouts may additionally be duplicated by the second POST. Exact exposure depends on the live commit.
- **Time window checked:** no production time window was checked. Source history shows the identity-split paths existed in local history from Sep 23–30, 2026 onward and the non-atomic server writer existed by Sep 24, but deployment dates are unknown.
- **Required detection method after access is restored:** first locate the incident time/channel from operator/browser/payment evidence. Then use a narrow window (for example ±5 minutes, widened only if necessary) to aggregate: same receiver fingerprint + amount + items; orders created seconds apart; orders with zero items; missing initial history; payment references containing `GM-390336`; insert errors; unmatched webhook events; and inventory/voucher effects without a matching parent. Redact PII and return counts plus minimal identifiers.

## F. Recommended recovery (do not execute in this investigation)

1. Re-establish authoritative access: identify the Vercel production project/deployment SHA and its environment bindings; independently verify the Supabase project reference and that storefront/admin point to it.
2. Use a genuinely read-only database role or dashboard query session. Do not use the service-role key for convenience. Capture applied migration history and schema before composing final SQL.
3. Search exact `GM-390336` in the parent table, payments/provider events, logs, and audit sources. If absent, correlate a likely sibling order by time, redacted customer identity, amount, seller, and exact item fingerprint.
4. Determine whether the sibling represents the intended order, a duplicate, or an unrelated order. Verify all dependencies: items, stock effects, voucher usage, payment, delivery, history, and audit.
5. If recovery is required, prepare a separate, reviewed repair package with: immutable evidence bundle; exact IDs and before-state; dry-run output; duplicate-order/payment/stock/voucher guards; one database transaction where possible; explicit audit entry; rollback/forward-repair plan; and before/after invariant checks.
6. Require explicit operator approval before any production mutation. Never recreate contents, amounts, customer identity, or inventory effects from guesses.

## G. Immediate containment

No production containment was executed because the live artifact and scope are unknown. The smallest safe operational containment, pending verification, is:

- preserve the originating browser/session evidence and payment memo;
- ask operators not to recreate `GM-390336` or manually adjust stock/voucher/payment yet;
- require a direct database lookup/correlation before acting on any “missing” admin/POS/sale code;
- if the live artifact is confirmed to contain the client/server identity split, temporarily pause those three manual creation surfaces or route them through a documented operator process until a separately approved fix is deployed;
- do not replay webhooks, confirm payments, refund, cancel, or create replacement orders as containment.

## Operator evidence needed to resume

1. Vercel project/team name, production deployment URL, immutable deployment ID/SHA, build time, branch, regions, and rollback history.
2. Redacted environment binding showing the production Supabase project reference for both storefront and admin.
3. A read-only database role/session confirmation and applied migration list.
4. Vercel request logs for `POST /api/orders`, `GET /api/orders`, and relevant payment/webhook routes around the incident, with correlation/request IDs and no PII.
5. Supabase database/API/auth/audit logs for the same window.
6. Originating channel (public checkout, admin create, POS, or sale create), approximate time, and a redacted screenshot/local-storage export or payment reference showing `GM-390336`.

## Safety attestation

- Production queries: **0**
- Production mutations: **0**
- Service-role use: **0**
- Deployments/migrations/webhook replays/emails: **0**
- Application code edits: **0**
- Git stage/commit/push/reset/checkout/stash/clean: **0**
- Investigation artifact created: `docs/engineering/INCIDENT_GM-390336_FORENSIC_REPORT.md`
