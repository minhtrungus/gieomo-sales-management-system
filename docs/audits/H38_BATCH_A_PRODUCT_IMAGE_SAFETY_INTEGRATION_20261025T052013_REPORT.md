# H38 — Batch A Product Image Safety Integration

Generated: 2026-10-25 05:20:13 +07:00 (Asia/Saigon)
Source repository: `C:\Users\MT\Workspaces\gieomo-sales-management-system`
Integration worktree: `.tmp/h37-integration-origin-main-20261024T020000`
Baseline / final HEAD: `0b7825ecc5c524f822d2ef5602b4fb7a48182f70` (detached)
Verdict: **PARTIAL — Batch A code integrated and focused tests pass; production build and browser smoke remain blocked by the baseline's external Google-font dependency**

## 1. Executive result

H38 semantically integrated the H35 product-image safety behavior into the clean H37 worktree. It did not copy the old WIP files wholesale. The resulting runtime preserves valid local and non-loopback HTTP(S) image sources, blocks remote image URLs when the configured data runtime is loopback, rejects malformed/unsafe image values, uses an explicit non-product placeholder for missing or unverified images, deduplicates repeated gallery placeholders, and sanitizes nested combo product thumbnails.

Focused behavior tests pass, the directly related upstream order-store regressions pass, TypeScript passes, and `git diff --check` passes. Full lint remains red but improves from 270 errors / 192 warnings to 263 errors / 192 warnings. The production build reaches compilation but cannot fetch the three fonts imported by the unchanged baseline `src/app/layout.tsx`; network access was not enabled because H38 is local-only. A browser smoke test was therefore not claimed.

No migration, schema, database row, product mapping, package manifest, lockfile, or Supabase resource was changed. No commit, stage, push, merge, rebase, deploy, or authenticated Supabase call occurred.

## 2. Worktree and Git safety

### Before

- Target resolved to `C:\Users\MT\Workspaces\gieomo-sales-management-system\.tmp\h37-integration-origin-main-20261024T020000`.
- `git rev-parse --show-toplevel` resolved to that exact registered worktree.
- HEAD was exactly `0b7825ecc5c524f822d2ef5602b4fb7a48182f70`.
- `git symbolic-ref -q --short HEAD` returned no branch: detached HEAD.
- `git status --porcelain=v1` was empty.
- Staged index was empty.
- Root worktree was `main` at `1c51af625a575a41733d59b29cc9be9ae0892c60`, with 219 existing porcelain entries and an empty index.

### After

- HEAD remains exactly `0b7825ecc5c524f822d2ef5602b4fb7a48182f70` and detached.
- Staged index remains empty.
- Root worktree remains `main` at `1c51af625a575a41733d59b29cc9be9ae0892c60`, with the same 219-entry status and empty index.
- Only the integration worktree contains H38 changes.
- A physical `node_modules` was installed with `npm ci --offline --ignore-scripts --no-audit --no-fund` from the existing local npm cache. It is ignored by Git; `package.json` and `package-lock.json` are unchanged.

## 3. Changed files and reasons

| File | Reason |
|---|---|
| `public/images/product-image-unavailable.svg` | Explicit brand-compatible status placard; visibly not a verified product image. |
| `src/lib/runtimeAssetSafety.ts` | Pure URL classification, loopback remote blocking, invalid-source rejection, and ordered gallery deduplication. |
| `src/lib/services/productService.ts` | Applies the safety helper to product thumbnails, media galleries, and variant images without changing price, stock, write, or authorization behavior. |
| `src/app/api/combos/route.ts` | Sanitizes combo images and nested product thumbnails only in GET responses; POST/PATCH/DELETE behavior is unchanged. |
| `src/types/database.ts` | Adds optional image-status view fields to product, variant, media, and combo contracts; no database schema change. |
| `src/lib/data/orderStore.ts` | Forwards combo/product image status and replaces real-looking generic fixtures with the explicit unavailable asset. |
| `src/components/products/ProductCard.tsx` | Shows a truthful unavailable-image notice. |
| `src/app/products/[slug]/ProductDetailClient.tsx` | Uses the explicit final fallback, preserves gallery uniqueness, and shows the unavailable-image notice. |
| `src/app/products/[slug]/page.tsx` | Uses the explicit unavailable asset as the final metadata fallback. |
| `src/app/combos/page.tsx` | Shows a truthful unavailable-image notice on combo cards. |
| `src/app/sale/products/page.tsx` | Replaces the nonexistent/generic placeholder with the explicit unavailable asset. |
| `src/app/admin/messages/page.tsx` | Replaces the pouch fixture fallback with the explicit unavailable asset. |
| `tests/runtimeAssetSafety.test.ts` | Covers valid local/remote sources, missing/blank/invalid values, loopback blocking, gallery ordering, and placeholder deduplication. |
| `tests/comboRoute.test.ts` | Covers combo and nested product sanitization plus a zero-external-request assertion. |
| This report | Durable H38 evidence and verdict. |

No file outside the H35 review list was changed except this required H38 report. No migration or schema file was modified.

## 4. Three-way integration decisions

### `src/lib/data/orderStore.ts`

The H37 baseline contains 181 lines of upstream order-idempotency and server-authoritative cancellation work relative to the old H35 base. The dirty source version also contains large, unrelated order/voucher/combo WIP. H38 retained the upstream file and added only four image semantics: explicit combo fallback, combo `image_status`, explicit nested-product fallback, and nested-product `image_status`. It did not port the unrelated local order, voucher, combo mutation, or inventory changes.

### `src/app/products/[slug]/ProductDetailClient.tsx`

The H37 baseline changes the fundraising phrase from “dệt thành giấc mơ” to “dệt thành yêu thương.” H38 retained that upstream change and the baseline lightbox implementation. It ported only the explicit fallback import, two fallback substitutions, and the unavailable-image notice. It did not port the unrelated local `ProductLightbox` refactor or interaction-performance WIP.

### Other mixed-WIP files

- `src/app/api/combos/route.ts`: only GET response sanitization was ported. The old-tree atomic combo writer and validation rewrite were excluded.
- `src/lib/services/productService.ts`: only read-path image classification was ported. Old-tree variant upsert/delete, catalog error-contract, and ordering changes were excluded.
- `src/types/database.ts`: only four optional image-status fields were ported. Old-tree order packing aliases were excluded.
- `tests/comboRoute.test.ts`: a new focused read-path test was written instead of copying the old test's unrelated combo-writer suite.

These decisions preserve upstream authorization, validation, order creation, pricing, inventory, voucher, and combo-write contracts.

## 5. Baseline evidence

### Related tests

Command:

```powershell
node --test tests/orderStoreOrderSync.test.ts tests/orderStore.voucher.test.ts
```

Result: **PASS — 12 passed, 0 failed, 0 skipped**.

The H38-focused test files did not exist in the baseline and were correctly recorded as unavailable rather than baseline passes.

### Type-check

The first `npm.cmd run type-check` returned `TS2304: Cannot find name 'LayoutProps'` because the clean worktree had no generated `.next/types`. After Next generated route/layout types during the baseline build attempt, the identical command passed. This was a generated-type prerequisite, not an application-source correction.

### Build

- Initial `npm.cmd run build`: blocked because the isolated worktree had no local `node_modules` and Turbopack would not resolve Next outside its lockfile root.
- A temporary dependency junction allowed a webpack diagnostic, which reached compilation and failed only on blocked Google-font requests.
- No network permission was requested and no dependency was downloaded.

### Full lint

Command: `node .\node_modules\eslint\bin\eslint.js .`
Result: **FAIL — 270 errors, 192 warnings across 86 files**.

This is the actual H38 baseline; lint was not treated as passing.

## 6. Post-integration verification

| Gate | Command | Result |
|---|---|---|
| Image/combo behavior | `node --test tests/runtimeAssetSafety.test.ts tests/comboRoute.test.ts` | **PASS — 7/7, 0 skip** |
| Upstream order-store regression | `node --test tests/orderStoreOrderSync.test.ts tests/orderStore.voucher.test.ts` | **PASS — 12/12, 0 skip** |
| TypeScript | `npm.cmd run type-check` | **PASS** |
| Diff whitespace | `git diff --check` | **PASS** |
| Targeted lint | ESLint on 13 changed TS/TSX files | **FAIL — 62 errors, 27 warnings across 8 files** |
| Full lint | `node .\node_modules\eslint\bin\eslint.js .` | **FAIL — 263 errors, 192 warnings across 86 files** |
| Production build | `npm.cmd run build` | **BLOCKED — three baseline `next/font` Google fetches failed** |

The full-lint delta is **7 fewer errors and no warning increase**. The new runtime helper and both new tests have no lint findings. Remaining targeted findings are in pre-existing files, chiefly `any` usage and existing hook/unused-variable rules; H38 did not suppress rules or change lint configuration.

The final production build used a physical, offline-installed dependency tree, so the previous symlink-resolution issue was eliminated. It reached application compilation and failed on exactly these unchanged baseline imports in `src/app/layout.tsx`:

- Caveat from `fonts.googleapis.com`;
- Montserrat from `fonts.googleapis.com`;
- Playfair Display from `fonts.googleapis.com`.

H38 did not enable external access or change typography outside scope. Because a production build is mandatory for a PASS verdict, the verdict remains PARTIAL.

## 7. Browser smoke test

**Not run / not passed.** The clean H37 worktree intentionally contains no `.env.local` or approved local database/runtime fixture, and the production build remains blocked by the baseline's external font dependency. Starting a browser acceptance runtime without the required data identity would not prove the requested product/combo behavior. No authenticated data source was contacted.

## 8. Image-safety evidence

- Valid application-relative image paths remain unchanged.
- Valid HTTP(S) paths remain unchanged outside a loopback data runtime.
- HTTP(S) product/combo paths become `/images/product-image-unavailable.svg` only when the configured data runtime is loopback.
- Missing and blank values are classified `missing` and do not become URLs.
- Malformed, protocol-relative, `javascript:`, and non-HTTP(S) values are classified `missing` with reason `invalid_source`.
- Two different blocked remote gallery URLs collapse to one placeholder entry; local gallery order remains driven by `sort_order` and duplicate local URLs are removed.
- Nested combo product thumbnails receive the same classification as combo headers.
- The combo route test replaces global `fetch`, asserts zero calls, and passes; the safety helpers themselves perform no I/O.
- No product image was downloaded, generated, guessed, matched by filename/SKU/index, or copied from another product.
- The build made unsuccessful CSS requests for baseline Google fonts; it made no product-image request.

## 9. Unverified mappings and operator-supplied assets

H38 does not claim complete product imagery. H35's last verified inventory remains:

- 4 product thumbnails;
- 20 product-media objects;
- 102 non-null variant image objects;
- 8 combo image objects;
- 1 variant with a null source field.

None has an authorized local binary plus stable entity/reference mapping and checksum. An operator must supply an immutable export with checksums and stable ownership mapping before any source pixels can be restored. Filenames, product names, visual similarity, storage ordering, or old seed fixtures are not acceptable evidence.

## 10. Remaining blockers and final decision

### Pre-existing / environmental

1. Production build requires three external Google-font fetches from the unchanged baseline and therefore fails under the local-only boundary.
2. Full lint remains red at 263 errors / 192 warnings, although H38 improves the baseline by seven errors.
3. Browser smoke lacks an approved local runtime/data fixture and a green production build.

### New regressions

No new behavior, type-check, diff-check, or lint-total regression was observed in the executed gates. A browser-level regression statement cannot be made because smoke was not run.

### Verdict

**PARTIAL.** Batch A's code is integrated in the detached H37 worktree and is locally tested at the unit/mock boundary, but H38's acceptance criteria require a passing production build and browser evidence. Those remain unavailable without an owner decision to self-host the baseline fonts (or otherwise provide an approved offline font build path) and an approved local runtime fixture.

Confirmed: the root worktree was not edited; no authenticated Supabase call occurred; no database/schema write occurred; and no stage, commit, push, merge, rebase, deploy, or Batch B work occurred.
