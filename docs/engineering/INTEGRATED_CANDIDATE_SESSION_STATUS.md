# Integrated Candidate — Session Status Report

**Branch:** `integrated/r1-recon-p0a3-security`
**HEAD:** `e9af410` (pushed, 0 ahead / 0 behind origin)
**PR:** #2 — OPEN, MERGEABLE, CLEAN, base `main`
**Commits on PR #2:** `9962903`, `f6beed1`, `2cc891e`, `3731b25`, `eb59d0f`, `3d69d4c`, `2728d9b`, `4d10f82`, `e9af410`

---

## 1. Commits `eb59d0f` + `2728d9b` — pushed

### `eb59d0f` — F4 natural product sort (picker pages + utils + tests)

| File | Change |
|------|--------|
| `src/lib/utils.ts` | Added `naturalCompare(a, b)` — `localeCompare("vi", { numeric: true, sensitivity: "base" })` |
| `src/app/sale/create-order/page.tsx` | Product picker uses `sortedProducts` (naturalCompare by name) |
| `src/app/admin/combos/page.tsx` | Both product pickers (create + edit combo) use `sortedProducts` |
| `tests/productionP0Guards.test.ts` | +16 tests: naturalCompare ordering, Vietnamese diacritic sort, picker source invariants, admin `?productId` preselect guard |

### `2728d9b` — admin create `?productId` preselect guard (index-only split)

| File | Change |
|------|--------|
| `src/app/admin/orders/create/page.tsx` | Committed as a clean blob (HEAD + preselect/sort hunks only) via `git hash-object -w` + `git update-index --cacheinfo`. Working-tree SHA-256 verified unchanged before/after staging (`bcb12f153f0b265…`). |

**Included hunks:** `useRef` import; `naturalCompare` import; `orderItems` moved above mount effect with lazy initializer; `setOrderItems` wrapper sets `hasUserEditedItemsRef`; `?productId` preselect effect (`window.location.search`, guarded by `hasUserEditedItemsRef` + `appliedQueryProductRef`); `sortedProducts` memo + picker.

**Not included (stays dirty in working tree):** `confirmBankPayment` import, `AlertCircle`, `qrReference`/`qrConfirmError`/`isConfirmingQr` state, async `handleConfirmQrPaid`, QR-modal bank-reference input/error UI, button loading/disabled states. These are the payment-integrity workstream's WIP.

**Tests:** non-PG suite **266/266 pass, 0 fail, 0 skipped** (10.7 s). `tsc --noEmit` exit 0.

### `4d10f82` — F7 admin order detail SKU render (index-only split)

| File | Change |
|------|--------|
| `src/app/admin/orders/[id]/page.tsx` | Clean blob (HEAD + one hunk: `Mã: {item.sku_snapshot}` under variant name) staged via `git hash-object` + `update-index`. Working-tree SHA-256 unchanged (`c262b105feba406…`). |

**Merge-risk flag:** the working-tree order-UI WIP replaces this render block with `getOrderItemPresentation()` (from untracked `src/lib/orderUi.ts`, which returns no SKU). Whoever lands that WIP **must add `sku` to `getOrderItemPresentation` output and render it**, or the merged admin detail loses the SKU row.

### `e9af410` — F1 featured combos on homepage

| File | Change |
|------|--------|
| `src/components/home/FeaturedCombosSection.tsx` | New client component: `syncCombosFromServer(true)` + `getStoredCombos()`, shows only `status === "active"` AND `featured` (max 4), renders nothing when none featured (no fallback to non-featured), listens `gieomo_combos_updated`, cards link to `/combos`. |
| `src/app/page.tsx` | Imports + renders `<FeaturedCombosSection />` after `FeaturedProductsSection`. |
| `tests/featuredComboHome.test.ts` | 4 source-invariant tests. |

**Tests:** non-PG suite **270/270 pass, 0 fail, 0 skipped**. `tsc --noEmit` exit 0. `eslint` on touched files: 0 errors (1 pre-existing `Scissors` unused warning in `page.tsx`, not introduced here).

---

## 2. F1–F8 status (updated)

| ID | Summary | Status | Evidence |
|----|---------|--------|----------|
| F1 | Featured combo homepage | **FIXED (`e9af410`)** — `FeaturedCombosSection` renders active+featured combos (max 4, hides when none), homepage renders it after products. Schema/admin toggle/API `featured` were already done. Manual UI smoke (mobile/desktop, add/remove combo) still recommended pre-merge | `tests/featuredComboHome.test.ts` (4 tests); `combos/route.ts:21,91,190,235` |
| F2 | Voucher edit | **PARTIALLY FIXED** — PATCH `/api/vouchers` exists + tests; admin UI still POSTs upsert; missing DB columns (`min_items_count`, `is_gift_voucher`, `gift_min_order_value`, `visibility`, `max_discount_amount`). UI change deferred — switching form to PATCH without columns would silently drop fields (data-loss risk) | `voucherRoute.test.ts` PR1–PR6; `BACKLOG_CLOSURE_MATRIX.md` F2 row |
| F3 | SKU tự động combo | **NOT FIXED — blocked by design + DB** — spec requires reserve/hold states, no-duplicate-SKU across active orders, atomicity, audit trail, rollback tests; explicitly "không tự suy diễn nghiệp vụ". Needs business rules + DB migration → under Part I NO-GO (migrations unapplied on Production). Combo builder also lacks `variant_id` selection | `GIEOMO_OVERNIGHT_PRODUCTION_READINESS_PLAN.md` F3; `admin/combos/page.tsx:1012-1026` |
| F4 | Sort tự nhiên theo mã | **FIXED** — name-based natural sort in all 3 order-entry pickers (`eb59d0f` + `2728d9b`). "Unpurchased before purchased" rule **NOT implemented** — needs defined business rule + purchase-history data source | `productionP0Guards.test.ts` |
| F5 | Double order | **FIXED** — client `isSubmitting` guards on all 3 paths, `syncToServer:false` on checkout, `order_code` uniqueness retry, server `idempotencyFlow` result checks on admin create/POS | `checkout/page.tsx:468`, `orderSubmitGuards.test.ts` |
| F6 | Shipping/discount display | **VERIFIED this session** — audit of all display surfaces: track page prefers `voucher_discount` (`track/page.tsx:100`); admin detail + reports use `getOrderVoucherDiscount`; cart/checkout import `@/lib/pricing`; POS prefers server `result.finalAmount` (`pos/page.tsx:265`); order success uses `order.final_amount`; no client-side `final_amount = subtotal + …` decision found anywhere. **Minor display gaps (non-blocking):** sale orders view and admin payments page don't render a discount breakdown line (final amount itself is server-sourced) | this report §F6 audit; `pricing.test.ts` TR1–TR8c |
| F7 | SKU in order detail | **PARTIALLY FIXED** — track page (`3731b25`) + admin detail (`4d10f82`) render `sku_snapshot`. Sale orders view still blocked: page is WIP-dirty and depends on untracked `src/lib/orderUi.ts` (order-UI workstream). Merge-risk: order-UI WIP's `getOrderItemPresentation` must carry SKU | `track/page.tsx`, `admin/orders/[id]/page.tsx:375` |
| F8 | SePay webhook timing-safe | **FIXED** — timing-safe API key compare, fail closed without `SEPAY_API_KEY` | `sepayWebhookAuth.test.ts` |

### F7 entanglement detail

- `src/app/admin/orders/[id]/page.tsx` — **SKU hunk committed (`4d10f82`)** via index-only split. Working tree still carries the order-UI/payment WIP (uncommitted). **Merge risk:** WIP rewrites the item row with `getOrderItemPresentation()` which has no SKU — port the SKU into `src/lib/orderUi.ts` when landing WIP.
- `src/app/sale/orders/page.tsx` — DIRTY: uses `getOrderItemPresentation` from untracked `src/lib/orderUi.ts` (order-UI workstream). Committing the page without `orderUi.ts` would break clean checkouts. **Still blocked.**

### Data-loss flows ("nhập hộ" + order entry) — status

| Flow | Protection | Where |
|------|-----------|-------|
| Empty catalog wipes cart | `validateCart` throws on empty catalog instead of emptying | `src/store/cart.ts` (in `3731b25`) |
| DB failure looks like "no orders" → wipes client cache | `getOrdersServer` throws; route returns `success:false` | `orderService.ts`, `api/orders/route.ts` (in `3731b25`) |
| `?productId` overwrites staff-entered items | Ref guards on sale + admin create pages | `sale/create-order`, `admin/orders/create` (`2728d9b`, `3731b25`) |
| Double submit creates two orders | `isSubmitting` guards ×3 paths, checkout `syncToServer:false`, `order_code` retry, server `idempotencyFlow` | `orderSubmitGuards.test.ts` |
| Admin create submit failure swallowed | HEAD has async `handleSubmit` + `result.ok` + `submitError` banner | `admin/orders/create/page.tsx` (HEAD) |
| Voucher drop on cancel | `cancelVoucherRelease.test.ts` passes (266/266 suite) | tests |
| F2 admin voucher form → silent field drop | **Open risk** — deferred until DB columns exist (see F2 row) | `admin/vouchers/page.tsx` |

---

## 3. Parts G / H / I / L — audit summary

### Part G — INP (Interaction to Next Paint)
- **No RUM/lab access** — cannot measure INP.
- Static analysis only: no obvious long tasks in the order-entry path beyond what's already in the cart/checkout flows.
- **Verdict:** INP unknown; not a blocker for code merge, but Production deploy requires lab measurement.

### Part H — SePay transfer content
- Memo shown to customers is the **order code** (`GM-XXXXXX`), not product code.
- SePay webhook matches on `transactionContent` containing the order code — this is the correct unique key.
- The remediation plan's premise "SePay dò theo mã sản phẩm" is **wrong** about current behavior.
- **Recommendation:** keep GM-code matching. Do not change memo format pre-deadline without operator decision (would break pending orders).

### Part I — DB review
- Migrations 021–027 **pending on Production**; 028 is `.draft`.
- No schema ledger access; backup unverified; RLS/grants unknown.
- **Verdict: NO-GO** for any DB apply — per `PRODUCTION_REMEDIATION_PLAN.md` gates RB-05/RB-06/RB-08.

### Part L — Release verdict
- **PR #2 merge:** GO for code merge (P0s fixed + pushed; F1/F4/F7-admin closed; tests 270/270, typecheck + eslint clean, MERGEABLE/CLEAN). Merging is the user's call.
- **Production deploy:** **NO-GO** — remains blocked until all release gates verified:
  - Migrations 021–027 unapplied on Production; schema ledger, RLS/grants unverified (Part I).
  - Backup/restore unverified.
  - No RUM/lab INP measurement (Part G).
  - Staging smoke (including F1 homepage UI smoke) not performed.
  - Payment/order-UI WIP on ~61 dirty files not yet landed — PR #2 does not include it.

---

## 4. Remaining work (not in this session)

| Item | Owner / blocker |
|------|-----------------|
| F1 homepage combo render | Product decision on layout + data source |
| F2 admin voucher UI → PATCH + missing columns | Needs schema migration for `min_items_count`, `is_gift_voucher`, `gift_min_order_value`, `visibility`, `max_discount_amount` — **data-loss risk if UI changes first** (silent field drop) |
| F3 combo SKU auto-generation / reserve-hold | Needs operator-defined business rules (reserve/hold/rollback semantics) + DB migration → **blocked, Part I NO-GO** |
| F4 "unpurchased before purchased" | Needs defined business rule + purchase-history data source |
| F7 sale orders view SKU | Order-UI workstream must commit `src/lib/orderUi.ts` + page; must port `sku` into `getOrderItemPresentation` (also required for the admin-detail merge, see §2) |
| F6 minor display gaps (non-blocking) | Sale orders + admin payments pages don't render a discount breakdown line (amounts themselves are server-sourced/verified) |
| F1 manual smoke | Run add/remove featured combo → refresh homepage on mobile/desktop before merge (automated source tests pass; UI smoke not possible without a running app in this session) |
| Part I migrations 021–027 | Production DB access + ledger/backup verification required |
| Part G INP | Lab/RUM instrumentation required |

**Resolved this session:**
- Admin create `?productId` commit — index-only split (`2728d9b`); payment WIP stays uncommitted in the working tree.
- F1 homepage featured combos — implemented + tested + pushed (`e9af410`).
- F7 admin order detail SKU — implemented via index-only split (`4d10f82`).
- F6 — full display-surface audit completed (this report §F6): no client-decided final amounts found; 2 non-blocking display gaps logged.

---

## 5. Commands used this session

```
git log --oneline / git status --short
git diff -U3 / git diff --cached / git show <sha> / git cat-file blob <blob>
git ls-tree HEAD src/app/admin/orders/          # unambiguous tree walk for [id] path
git hash-object -w --path=<path> <clean-file>
git update-index --cacheinfo 100644,<blob>,<path>
certutil -hashfile <file> SHA256                # verify working tree unchanged
npx tsc --noEmit -p tsconfig.json               # exit 0
npx eslint <touched files>                      # 0 errors
node --test <all non-PG *.test.ts>              # 270/270 pass, 0 skipped (final)
git commit / git push origin integrated/r1-recon-p0a3-security
```

