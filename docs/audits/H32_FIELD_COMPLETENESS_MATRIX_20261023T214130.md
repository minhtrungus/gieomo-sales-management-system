# H32 — Field Completeness Matrix and Font/UI Route Audit

Generated: 2026-10-23 (Asia/Ho_Chi_Minh)  
Scope: H32 Tracks C/D; static, read-only audit of migrations, TypeScript contracts, validation, API/service paths, forms/displays, font wiring, and route coverage  
Source/test changes: none  
Verdict: **FAIL — field completeness and route completeness are not release-ready**

## 1. Evidence boundary

This report evaluates the current dirty worktree without modifying or discarding existing WIP. It does not claim a fresh Production snapshot, current Production schema, live row completeness, browser behavior, or authenticated runtime behavior. Repository migrations `001`–`035` are treated as the intended canonical schema; their presence does not prove they are applied to any remote database. H31's synthetic replay/browser results are historical supporting evidence, not a new H32 run.

The bundled Next.js 16.3.5 guides were read before framework-specific judgments:

- `node_modules/next/dist/docs/01-app/01-getting-started/02-project-structure.md`
- `03-layouts-and-pages.md`
- `10-error-handling.md`
- `13-fonts.md`
- `15-route-handlers.md`

Per those guides, only a `page.tsx` exposes a UI route, `route.ts` exposes an endpoint, `loading.tsx`/`error.tsx` provide segment fallbacks, and `next/font` variables must be applied and consumed. No remote write, migration application, snapshot mutation, credential provisioning, staging, commit, or test-data mutation was performed.

## 2. Status legend

| Status | Meaning |
|---|---|
| COMPLETE | Intended persistent fields have an aligned contract through the relevant layers. |
| PARTIAL | Core path exists, but one or more fields/layers are missing, lossy, weakly validated, or UI-incomplete. |
| MISSING | Persistent entity or required route has no meaningful application path. |
| INTERNAL | Correctly server/database-only; absence from customer forms is intentional. |
| BLOCKED | Cannot verify actual data/applied schema without an approved fresh read-only source/runtime. |

## 3. Entity completeness matrix

The “fields” cells group columns with the same outcome; this keeps the matrix auditable without falsely marking every database-generated identifier/timestamp as a user input.

| Entity / field group | DB / migrations | TS contract | Validation | API read | API write | UI form | UI display | Required/default behavior | Status |
|---|---|---|---|---|---|---|---|---|---|
| Products — identity, category, name/slug, descriptions, prices, status, featured, sort, weight, thumbnail | `products` in `001` | `Product` covers columns plus joins | `productSchema` covers most fields but omits `thumbnail`; it is never called by product API | Yes | Yes, service sanitizes/defaults ad hoc | Yes | Yes | DB constraints are stronger than API; missing/invalid price can become `0`, missing weight `100`, missing slug generated | **PARTIAL** |
| Product variants — SKU, name, prices/cost, stock, weight, status, sort, image | `001`; `image_url` added by `010` | `ProductVariant` covers core plus non-DB warehouse fields | `variantSchema` omits `sort_order` and `image_url`; not called by API | Yes | Yes; existing stock intentionally not overwritten, new stock accepted | Yes | Yes | DB prevents negative stock; service has separate ad-hoc rules | **PARTIAL** |
| Product media | `product_media` in `001` | `ProductMedia` matches | No dedicated schema | Read with products | Delete-then-insert, not transactional; insert errors are not checked | Product images UI | Gallery/lightbox | Optional, ordered | **PARTIAL** |
| Categories | `product_categories` in `001` | `ProductCategory` mostly matches | Route uses manual checks | Yes | Yes | Admin form | Admin/product display | `updated_at` incorrectly optional in TS despite DB `NOT NULL` | **PARTIAL** |
| Product reviews | `product_reviews` in `008` | `ProductReview` exists | Manual route validation | Yes | Create/delete | Product detail/admin messages | Yes | Review status is optional in TS but DB has a default | **PARTIAL** |
| Combos | `combos` in `001`; atomic save RPC in `030` | `Combo` matches | Manual typed request validation | Yes | Atomic save; delete direct | Admin form | Storefront/admin | Price uses `Number(x) || 0`; slug/name required | **PARTIAL** |
| Combo items | `combo_items` in `001`; nullable variant intentionally supported by `031`/`035` | `ComboItem` matches nullable variant | Strong manual identity/quantity checks | Nested read | Atomic replacement when non-empty items supplied | Admin component picker | Admin/storefront | `items: []` means “do not replace”, so UI cannot explicitly clear all items through this contract | **PARTIAL** |
| Customers | `customers` in `001` | `Customer` matches DB | No dedicated server schema | Derived through order reads/admin aggregation | Upserted atomically during order creation | Checkout inputs; no first-class customer editor | Admin customers/orders | Phone is unique; buyer and receiver remain distinct via customer versus order snapshot | **PARTIAL** |
| Orders — durable canonical columns | `orders` in `001`, technical columns in `021`/`026` | `Order` covers most business fields but omits idempotency/cancellation-effect columns and adds multiple aliases not present in DB | Checkout Zod is client-used; server RPC validates canonical payload independently | Yes with public masking | Atomic create; guarded status/payment/cancel paths | Checkout/admin/sale/POS | Extensive | Monetary totals server-derived; technical fields appropriately not customer-editable | **PARTIAL** |
| Orders — `member_delivery` and `event_sale` semantics | DB enums only contain `self_pickup` and no `event_sale` (`001`) | TS exposes both extra values | Checkout accepts `member_delivery`; POS sends `event_sale` | Read returns stored enum | RPC maps `member_delivery` to `self_pickup`; accepts only `admin_manual`/`other` actor sources, so `event_sale` is not persisted | Both are selectable/used | UI branches on values that cannot round-trip | Lossy normalization changes meaning after reload/reporting | **FAIL** |
| Order items — identity/name/SKU/price/quantity/subtotal snapshots | `order_items` in `001` | `OrderItem` contains DB fields plus aliases | Line identity/quantity checked server-side | Yes | Atomic RPC writes core snapshot fields | Cart/order creation | Order/admin/reconciliation | Required fields enforced by DB/RPC | **PARTIAL** |
| Order items — `unit_cost_snapshot`, `item_discount` | Columns exist in `001` | Present in `OrderItem` | No create validation/calculation | Read paths can expose them | Current `025`/`035` create RPC insert list never populates either field | No explicit input (correct for server-derived values) | Profit/reporting depends on them | Defaults become `NULL`/`0`, losing historical cost/discount evidence | **FAIL** |
| Payments | `payments` in `001`; uniqueness/integrity in `018`/`023`/`024`/`029` | `Payment` matches base table | Payment flow validates state in service/RPC | Yes | Atomic confirm/reject/webhook paths | Admin payments | Admin/reconciliation/order | Transaction identity and single-paid invariant are DB-backed | **PARTIAL** |
| Payment events / webhook ledger | `payment_events` in `023` | No central TS entity; only local result shapes | RPC/webhook checks | Reconciliation service uses `payments`, not a complete event-ledger browser | Webhook/RPC writes | No form expected | No admin event-ledger view | Internal durable ledger, but operational fields are not inspectable in UI | **PARTIAL / INTERNAL** |
| Vouchers — canonical fields | `vouchers` in `001`; `freeship` enum in `014` | Core `Voucher` fields exist | `voucherSchema` exists but API does not use it; manual checks differ | Public GET returns only active vouchers | Admin create/update/delete | Yes | Yes | `times_used` is DB-managed by order RPCs | **PARTIAL** |
| Vouchers — cap/min-items/gift/visibility | No columns in migrations `001`–`035` | `Voucher` declares `max_discount_amount`, `min_items_count`, `is_gift_voucher`, `gift_min_order_value`, `visibility`; also aliases `usage_count` | Explicit unsupported-field detector | Cannot read persisted values | API returns 409 for any non-default value | Admin exposes all these controls | Admin displays them if present | UI promises rules that canonical DB cannot store; safe rejection prevents silent loss but feature is unusable | **FAIL** |
| Pickup points — canonical fields | `pickup_points` in `001` | Core fields match | Manual checks | Yes | CRUD | Yes | Checkout/admin | Name/address required | **PARTIAL** |
| Pickup points — `location_guide` / `address_detail` | No DB columns | TS declares optional aliases | None | `select *` cannot return them | Admin submits `location_guide`, route omits it; PATCH UUID branch assigns `body.pickup_point_id` instead of `id` | Inputs exist | Conditional display exists | Value is silently discarded; UUID PATCH can miss target | **FAIL** |
| Delivery zones | `delivery_zones` in `001` | `DeliveryZone` matches | None | No route/service found | No route/service found | None | None | DB defaults exist only | **MISSING** |
| Shipments | `shipments` in `001` | `Shipment` matches | None | No shipment route/service found | No shipment route/service found | No shipping board | Order UI uses order-level delivery status instead | Full carrier/tracking/timestamps are stranded at DB layer | **MISSING** |
| Members | `members` in `001`; `password_hash` in `006` | Public `Member` intentionally excludes hash | Manual route checks; role is reduced to admin or btc_sale | Sanitized reads | Admin upsert/delete | Admin form | Admin/sale | API cannot create/update `delivery_staff`; password minimum is only 4 here | **PARTIAL** |
| Users / sessions | No session table; signed server cookie contract in auth code | Local `SessionUser`/admin aliases, not database-generated | Server auth verification | Session endpoint | Login/logout cookie paths | Login | Header/profile | Server-side session is intentional; client storage is a UI cache, not authority | **INTERNAL / PARTIAL** |
| Audit logs | `audit_logs` in `001` including `ip_address` | `AuditLog` omits `ip_address` | Writer has action/entity checks only | No admin read endpoint/page | Sensitive services/RPCs write selected actions | None | None | Required admin specification includes audit history | **MISSING** |
| Inventory adjustments | `inventory_adjustments` in `019`; denormalized variant name/SKU in `020` | No central entity type | Strong service input validation | Inventory UI uses separate config logs; reconciliation reads catalog stock | Atomic relative-delta RPC | Admin inventory | Admin inventory | Server stock adjustment is durable, but ledger history has no first-class typed/read UI | **PARTIAL** |
| Warehouses / per-warehouse stock / transfers / inflows | No relational warehouse or stock-location tables | `Warehouse` and variant warehouse aliases exist | Mostly client/manual | JSON blobs in `system_configs` | JSON upserts; helper catches DB errors and callers still return success | Large admin UI | Large admin UI | Product service fabricates a 70/30 split from total stock on read; writes can report success after persistence failure | **FAIL** |
| Order idempotency / inventory reservations | `order_idempotency`, order idempotency columns, and `order_inventory_reservations` in `021`/`025`/`026` | No central row types; service result types exist | Strong RPC validation | Internal service reads | RPC-managed | None expected | Packing projection only | Correctly internal, but generated DB types are absent, increasing drift risk | **INTERNAL / PARTIAL** |
| System configs | `system_configs` in `001` | `SystemConfig` matches base row | Key-specific validation is inconsistent | Settings/config services | Upsert | Admin settings | Site settings | JSON-in-text is used for unrelated pseudo-entities and weakens field integrity | **PARTIAL** |
| Contact messages | `contact_messages` in `004` | `ContactMessage` matches | Manual contact validation | Admin messages | Public create/admin status/delete | Contact form | Admin messages | Core path exists | **COMPLETE (static)** |
| Sponsors | `sponsors` in `001` | `Sponsor` mostly matches (timestamps omitted) | None | No service/API found | None | No admin sponsor UI | No confirmed DB-backed homepage section | Required CMS route absent | **MISSING** |
| Media library | `media` in `001` including `folder` | `Media` omits `folder` and `created_at` | Upload validation exists, but it writes Storage rather than this catalog | No media-library API | No catalog CRUD | No `/admin/media` | None | DB entity is stranded | **MISSING** |
| Workshops / registrations | Tables in `001` | No TS entities | None | None | None | No `/admin/workshops` | None | Structure-only comment remains true | **MISSING** |

## 4. Confirmed field blockers

| ID | Severity | Confirmed gap | Evidence | Required repair direction |
|---|---|---|---|---|
| FC-01 | P0 data semantics | `member_delivery` is stored as `self_pickup`; POS `event_sale` is not a DB enum and is not accepted by the RPC source branch. Delivery/source meaning cannot round-trip. | `src/types/database.ts:31,40`; `src/app/admin/orders/pos/page.tsx:269,275`; `supabase/migrations/035_combo_wildcard_checkout.sql:158-162,459-463` | Decide canonical enum expansion versus explicit normalized model; migrate DB, generated types, RPC, reports, filters, and fixtures together. |
| FC-02 | P0 reporting integrity | Atomic order creation never fills `order_items.unit_cost_snapshot` or `item_discount`; historical profit/discount evidence defaults to null/zero. | `supabase/migrations/001_initial_schema.sql:250-266`; insert column list in `035_combo_wildcard_checkout.sql:485-497` | Snapshot effective cost and per-line discount server-side in the same order transaction; define combo cost allocation. |
| FC-03 | P1 feature blocked | Voucher UI/types expose five rule fields absent from DB; API safely rejects non-default values with 409. | `src/types/database.ts:223-233`; `src/app/admin/vouchers/page.tsx:129-135`; `src/lib/voucherPayload.ts:1-28`; no matching migration columns | Either add a reviewed migration and server pricing rules for all fields or remove/disable the UI contract. Do not silently drop. |
| FC-04 | P1 silent loss | Pickup `location_guide` is entered and submitted, but has no DB column and is omitted from route payload. PATCH by UUID uses the wrong body field. | `src/app/admin/pickup-points/page.tsx:70-76,309-310`; `src/app/api/pickup-points/route.ts:43-51,109-117,130-139` | Add/persist a canonical column or remove input; fix UUID lookup and add route-level schema/tests. |
| FC-05 | P1 false-success risk | Warehouse and stock-location data are JSON/config/client aliases, not relational inventory. `setConfigJson` swallows write errors while POST returns success; catalog reads synthesize a 70/30 split. | `src/app/api/inventory/route.ts:56-68,103-141`; `src/lib/services/productService.ts:232-249`; `src/types/database.ts:148-171` | Define warehouse/location tables and atomic transfer/inflow ledgers, or explicitly narrow product to single-stock. Never return success after failed persistence. |
| FC-06 | P1 validation drift | Product/variant/voucher Zod schemas are dead declarations for their API routes. Services coerce malformed values and invent defaults that differ from form/schema rules. | `src/lib/validations/schemas.ts:87-130`; only checkout calls `safeParse` at `src/app/checkout/page.tsx:310`; `src/app/api/products/route.ts:35-59`; `src/lib/services/productService.ts:402-417` | Parse all mutation DTOs on the server, share schemas deliberately, and reject invalid values rather than manufacture business data. |
| FC-07 | P1 operational gap | Payment-event and inventory-adjustment ledgers exist but lack central generated types and complete operator views; audit logs have neither read API nor required admin page. | migrations `019`, `020`, `023`; `src/types/database.ts`; route/page inventory | Add typed read models and least-privilege admin views; keep ledgers immutable. |
| FC-08 | P1 fulfillment gap | Shipment and delivery-zone entities exist only in DB/types. No shipping board or carrier/tracking CRUD is implemented. | `supabase/migrations/001_initial_schema.sql:197-206,283-305`; no matching route/page | Build authenticated service/routes/UI or explicitly remove them from release scope. |
| FC-09 | P2 contract drift | Handwritten `src/types/database.ts` mixes DB rows, UI aliases, and phantom fields; there is no generated Supabase type source. Examples include `payment_proof`, warehouse fields, pickup aliases, advanced voucher fields, and missing audit/media columns. | `src/types/database.ts:223-233,277-279,378-383,430-461` | Generate DB types from the accepted schema; separate `DbRow`, request DTO, response view model, and client state. |
| FC-10 | P2 CMS gap | Sponsors, media library, workshops, and registrations have DB structures but no complete API/admin workflow. | migration `001`; route/page inventory | Implement per approved CMS scope or mark deferred and remove release claims. |

## 5. Font audit

| Check | Result | Evidence |
|---|---|---|
| Montserrat via `next/font` | **PASS (static)** | `src/app/layout.tsx:16-21` requests `latin` + `vietnamese`, weights 400/500/600/700/800, `display: swap`. |
| Generated variable applied globally | **PASS (static)** | Root `<html>` receives `montserrat.variable`; `globals.css:48-51,75` consumes `--font-montserrat` through body/heading/sans/display tokens. This follows the bundled font guide. |
| Circular custom properties | **PASS (static)** | Source variables are `--font-caveat`/`--font-playfair`; consumer tokens use distinct names. H30's circular-token defect is absent in current WIP. |
| Vietnamese body/headings | **PASS (configuration)** | Montserrat and Playfair request the Vietnamese subset; `<html lang="vi">` is present. Current browser glyph rendering was not rerun in this track. |
| Weight consistency | **PASS (configuration)** | UI widely uses `font-extrabold`; Montserrat 800 is configured. |
| Boldonse brand display face | **BLOCKED / intentional fallback** | No Boldonse asset/import exists. `--font-display` deliberately resolves to Montserrat and the source comment admits the asset is unavailable. This is honest and functional, but not full brand-spec parity. |
| Runtime/network/font rendering | **BLOCKED in H32 Track D** | No runtime was started. H31 previously reported same-origin WOFF2 and computed Montserrat, but that is historical evidence only. |

Font conclusion: the H30 font wiring regression is repaired in current source. The remaining font gap is the unavailable Boldonse asset, not a broken Montserrat setup.

## 6. UI and route completeness

### 6.1 Public storefront routes

| Required route/capability | Current state | Status |
|---|---|---|
| `/`, `/products`, `/products/[slug]`, `/cart`, `/checkout`, `/order/success`, `/track`, `/faq`, `/contact`, `/policy/privacy` | `page.tsx` exists | PRESENT |
| `/categories/[slug]` | No page | **MISSING** |
| `/search?q=` | No page; navbar search icon links to `/products` | **MISSING** |
| `/combos/[slug]` | Only combo listing exists | **MISSING** |
| `/order/[orderCode]` | No page; `/track` is the only detail workflow | **MISSING** |
| `/policy/terms` | No page | **MISSING** |
| Catalog URL filter/sort contract | Product catalog keeps search/sort only in component state; it does not read/write query parameters. Category, price range, in-stock, and best-selling options are absent. | **FAIL** |
| Sitemap correctness | Includes `/policy`, which has no `page.tsx`; omits several real policy routes and all combo detail routes (which also do not exist). | **FAIL** |

### 6.2 Admin routes

Present: dashboard, orders/create/POS/detail, products/new, categories, combos, inventory, customers, payments, reconciliation, vouchers, members, reports, messages, notifications, pickup points, settings, login.

Required by the admin specification but absent as pages and absent from the sidebar:

- `/admin/sales`
- `/admin/shipping`
- `/admin/workshops`
- `/admin/content`
- `/admin/sponsors`
- `/admin/media`
- `/admin/audit-logs`

The sale portal partially covers member self-service, but it is not the specified admin sales dashboard. Messages/notifications are useful additions, not replacements for the missing CMS, shipping, workshop, media, or audit-log workflows.

### 6.3 Next.js route-state conventions

- There are **zero** `loading.tsx`, `error.tsx`, `global-error.tsx`, or `not-found.tsx` files under `src/app`.
- Individual client pages do implement some local loading/error/empty states, but the application has no segment-level Suspense fallback, route error boundary, root error replacement, or branded 404 file. Per the bundled Next.js guides, route failures can therefore fall through to framework defaults or page-specific ad-hoc handling.
- `src/app/admin/layout.tsx` is a client layout and exports no metadata. Root metadata declares indexing, while `robots.ts` disallows `/admin/`; robots exclusion is useful but is not the same as an admin `noindex` metadata response. Admin noindex is therefore incomplete against the storefront specification.
- `robots.ts` correctly blocks `/admin/`, `/api/`, `/checkout`, and `/order/` from crawling.

### 6.4 Accessibility/static UX observations

- The navbar mobile-menu control has an English `aria-label="Toggle Menu"`; cart/open controls rely mainly on visible text/icons and should be checked for localized accessible names.
- No browser keyboard, focus-order, screen-reader, touch-target, responsive, or reduced-motion test was run in this static track, so those gates remain unverified rather than passed.
- The existing H31 report recorded no horizontal overflow in its ten scenarios, but did not cover the full authenticated UI or all routes.

## 7. Gate decision and blockers

| Gate | Result | Reason |
|---|---|---|
| G3 data fields | **FAIL** | Confirmed lossy order semantics, unpopulated cost/discount snapshots, phantom voucher/pickup/warehouse fields, and stranded DB entities. |
| G9 UI | **FAIL** | Required public/admin routes and route-level error/loading/not-found coverage are missing. |
| Font regression | **PASS static / runtime BLOCKED** | Correct `next/font` variable consumption and weights; Boldonse unavailable; no new browser run. |
| Actual data completeness | **BLOCKED** | Fresh approved read-only Production snapshot/access is unavailable; null/orphan counts cannot be truthfully updated. |

No source fix was made in this track because the assigned scope was audit/report only, and several repairs require business/data-model decisions plus reviewed migrations. The highest-risk sequence is: (1) resolve canonical delivery/source enums and order-item cost snapshot semantics; (2) decide whether advanced voucher, pickup guidance, and multi-warehouse features are real persisted features; (3) generate DB types and enforce server DTO validation; (4) add ledger/admin operations routes; (5) close public/admin route gaps and add route-level failure states.

## 8. WIP preservation

The initial audit added only this report. The later owner-authorized addendum changed only the narrow files listed in section 9 plus migration-chain guards/tests. Unrelated WIP, snapshots, local database artifacts, secrets, and tests were not discarded, staged, committed, pushed, or deleted.

## 9. Narrow remediation addendum

After the initial audit, the owner authorized narrow repairs for confirmed loss paths that already had application-level evidence. The implementation is **FIXED IN CODE / TESTED LOCALLY**, not verified in a database or Production:

- Added migration `036_preserve_order_source_delivery_pickup_guidance.sql`:
  - adds the already-used `member_delivery` delivery enum;
  - adds the already-used `event_sale` source enum;
  - adds the already-modeled `pickup_points.location_guide` text column;
  - replaces only the migration-035 public order wrapper, leaving the private atomic body unchanged;
  - preserves `member_delivery` and explicit canonical `source_type` in the same transaction;
  - fails closed when a privileged operational source lacks an authenticated actor;
  - preserves service-role-only RPC execution.
- `saveNewOrder` now forwards `source_type` in its server-authoritative create payload.
- Pickup create/update now persists `location_guide`; UUID PATCH now targets `id` instead of the absent `body.pickup_point_id` alias.
- Canonical migration guards, local replay tip, and CI/deployment expected tips advance from 035/legacy 030 to 036.

Verification:

| Check | Result |
|---|---|
| H32 field round-trip source tests | PASS — 4/4 |
| Order atomic/hash + migration 035/036 + migration pipeline regression selection | PASS — 34/34 |
| Migration chain validator | PASS — 37 migrations, tip 037 |

### H32 final migration safety correction

The initial remediation placed enum additions and their first use in migration 036. H32 final review split the writer replacement into migration 037 because PostgreSQL requires newly added enum values to commit before safe use by transactional migration runners. Migration 036 now contains only the enum/column additions; migration 037 owns the writer replacement and ACL verification. Final source/chain tests pass 9/9 at tip 037. PostgreSQL replay remains blocked and is not claimed.
| Scoped ESLint for the new test | PASS |
| `git diff --check` for scoped files | PASS; existing Windows line-ending warnings only |
| TypeScript | BLOCKED by pre-existing auth-test drift: two fixtures omit newly required `authVersion` (`tests/authPrimitives.test.ts`, `tests/proofOwnership.test.ts`) |
| Scoped lint on touched legacy modules | BLOCKED by pre-existing `no-explicit-any` debt in both files; the new hunks add no `any` |
| PostgreSQL verification | NOT RUN — no operator-identified disposable target; source tests do not prove database execution |

Accordingly, FC-01 and FC-04 move from “confirmed unresolved” to **FIXED IN CODE, DATABASE VERIFICATION REQUIRED**. Other matrix findings remain unchanged.
