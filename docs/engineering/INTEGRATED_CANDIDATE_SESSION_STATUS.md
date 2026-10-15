# Integrated Candidate — Session Status Report

**Branch:** `integrated/r1-recon-p0a3-security`
**HEAD:** `eb59d0f` (pushed, 0 ahead / 0 behind origin)
**PR:** #2 — OPEN, MERGEABLE, CLEAN, base `main`
**Commits on PR #2:** `9962903`, `f6beed1`, `2cc891e`, `3731b25`, `eb59d0f`

---

## 1. This commit (`eb59d0f`) — pushed

| File | Change |
|------|--------|
| `src/lib/utils.ts` | Added `naturalCompare(a, b)` — `localeCompare("vi", { numeric: true, sensitivity: "base" })` |
| `src/app/sale/create-order/page.tsx` | Product picker uses `sortedProducts` (naturalCompare by name) instead of raw `availableProducts` |
| `src/app/admin/combos/page.tsx` | Both product pickers (create + edit combo) use `sortedProducts` |
| `src/app/admin/orders/create/page.tsx` | **NOT in this commit** — see §2 |
| `tests/productionP0Guards.test.ts` | +16 tests: naturalCompare ordering (SP-2 < SP-10), Vietnamese diacritic sort, picker source invariants, admin `?productId` preselect guard |

**Tests:** `node --test` non-PG suite — **266/266 pass, 0 fail, 0 skip** (10.9 s).
**Typecheck:** `npx tsc --noEmit` — clean, 0 errors.

---

## 2. Admin create-order `?productId` fix — implemented locally, commit blocked

The fix is applied to the working tree of `src/app/admin/orders/create/page.tsx` but **not staged/committed** because the file also carries unrelated payment-integrity WIP (`confirmBankPayment` import + QR-confirm handler) from another workstream.

**What the fix does (additive only):**
- Reads `?productId` from `window.location.search` in a `useEffect` (no `useSearchParams`, no Suspense boundary needed).
- Preselects the matching product + first variant into `orderItems`.
- Guarded by `hasUserEditedItemsRef` (set by a `setOrderItems` wrapper) + `appliedQueryProductRef` so the query param cannot overwrite staff edits — same pattern as sale create-order.
- `sortedProducts` naturalCompare for the picker dropdown.

**Test coverage already committed:** the two `admin create-order preselect` tests in `productionP0Guards.test.ts` assert against the working-tree source and pass. They will remain green once the file is committed (with or without the payment WIP).

**Operator decision needed:** include or defer the payment WIP in `src/app/admin/orders/create/page.tsx`. If include → the payment workstream's owner must commit it. If defer → extract only the `?productId` hunks into a clean commit (requires partial staging or a branch surgery).

---

## 3. F1–F8 status (updated)

| ID | Summary | Status | Evidence |
|----|---------|--------|----------|
| F1 | Featured combo homepage | **PARTIALLY FIXED** — schema + admin toggle done; homepage renders products only | `BACKLOG_CLOSURE_MATRIX.md`; `src/app/page.tsx`, `FeaturedProductsSection.tsx` |
| F2 | Voucher edit | **PARTIALLY FIXED** — PATCH `/api/vouchers` exists + tests; admin UI still POSTs upsert; missing columns | `voucherRoute.test.ts` PR1–PR6; `admin/vouchers/page.tsx` |
| F3 | SKU tự động combo | **NOT FIXED** | No refund/return-to-stock code found |
| F4 | Sort tự nhiên theo mã | **FIXED (this commit)** for name-based natural sort in order-entry pickers. "Unpurchased before purchased" rule **NOT implemented** — needs defined business rule + purchase-history data source | `eb59d0f`; `productionP0Guards.test.ts` |
| F5 | Double order | **FIXED** (pushed in `3731b25` + earlier) — client `isSubmitting` guards on all 3 paths, `syncToServer:false` on checkout, `order_code` uniqueness retry | `checkout/page.tsx:468`, `orderSubmitGuards.test.ts` (6 tests) |
| F6 | Shipping/discount display | **FIXED** — shared `pricing.ts` module, `getOrderVoucherDiscount` helper | `pricing.test.ts` TR1–TR8c |
| F7 | SKU in order detail | **PARTIALLY FIXED** — track page done (`3731b25`); admin detail + sale order views still missing SKU (WIP-dirty files, not committed) | `track/page.tsx`; `admin/orders/[id]/page.tsx`, `sale/orders/page.tsx` |
| F8 | SePay webhook timing-safe | **FIXED** (pushed `9962903`) — timing-safe API key compare, fail closed without `SEPAY_API_KEY` | `sepayWebhookAuth.test.ts` |

---

## 4. Parts G / H / I / L — audit summary

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
- **PR #2 merge:** GO (code-level P0s fixed + pushed, tests 266/266, typecheck clean, MERGEABLE/CLEAN). Merging is the user's call.
- **Production deploy:** **NO-GO** — blocked by:
  - Migrations 021–027 unapplied on Production (Part I).
  - No RUM/lab INP measurement (Part G).
  - Uncommitted WIP on ~61 dirty files (payment-integrity workstream) — not in PR #2.
  - Backup/restore unverified.

---

## 5. Remaining work (not in this session)

| Item | Owner / blocker |
|------|-----------------|
| F1 homepage combo render | Product decision on layout + data source |
| F2 admin voucher UI → PATCH + missing columns | Needs schema migration for `min_items_count`, `is_gift_voucher`, `gift_min_order_value`, `visibility`, `max_discount_amount` |
| F3 combo SKU auto-generation | No implementation exists |
| F4 "unpurchased before purchased" | Needs defined business rule + purchase-history data source |
| F7 admin/sale order detail SKU | Files are WIP-dirty; payment workstream must commit or rebase |
| Admin create `?productId` commit | Operator decision: include or defer payment WIP (see §2) |
| Part I migrations 021–027 | Production DB access required |
| Part G INP | Lab/RUM instrumentation required |

---

## 6. Commands used this session

```
git log --oneline -5
git status --short
git diff --stat / git diff
npx tsc --noEmit -p tsconfig.json
node --test tests/productionP0Guards.test.ts tests/cartValidate.test.ts
node --test <all non-PG *.test.ts>
git add <4 files>
git commit -m "..."
git push origin integrated/r1-recon-p0a3-security
```
