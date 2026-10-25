# H35 — Product Image Forensic Audit and Correct Real-Data Image Restoration

Generated: 2026-10-24 01:28:36 +07:00 (Asia/Saigon)  
Workspace: `C:\Users\MT\Workspaces\gieomo-sales-management-system`  
Branch / HEAD: `main` / `1c51af625a575a41733d59b29cc9be9ae0892c60`  
Local URL: `http://127.0.0.1:3790`  
Final verdict: **B — CODE FIXED, ASSETS INCOMPLETE**

This is a local read-only acceptance verdict, not a Production release verdict. The incorrect image substitution has been removed, but none of the 135 real-catalog image slots can be restored to verified source pixels from the retained local material. The UI now says that truth explicitly instead of presenting a pouch fixture as the correct product image.

## 1. Outcome

H35 proved that the data relationships were not the cause of the repeated wrong image. The root cause was the H34 loopback safety transform: every absolute HTTP(S) image reference was replaced with the same real-looking fixture, `/images/products/pounch_1.png`. Product service then propagated that value into thumbnail, gallery and variant views; the combo API applied it to combo headers. HTTP 200 and successfully decoded images therefore concealed a loss of entity identity.

The corrected behavior is:

- Production/non-loopback image references remain unchanged.
- Loopback acceptance still cannot fetch remote image references.
- A blocked remote reference is classified as `fallback_only`, never `source`.
- Missing/null source references are classified as `missing`.
- The fallback is an explicit status placard at `/images/product-image-unavailable.svg`, whose visible text says that it is not a verified product image.
- Repeated placeholder entries are deduplicated from each product gallery.
- Combo component product thumbnails are also sanitized, closing the remaining nested external-URL path.
- Public product cards/details and combo cards display an explicit unavailable notice. Admin product/combo thumbnails render the same self-identifying status placard.

No product, variant, media, combo, snapshot or database row was changed.

## 2. Initial state and verified runtime

Initial Git state was `main` at the unchanged HEAD above with 213 porcelain entries: 66 tracked changes and 147 untracked entries. This matched the H34 checkpoint.

Verified live chain before changes:

| Layer | Listener | Process evidence |
|---|---|---|
| Next.js dev | `127.0.0.1:3790` | Node PID 15916; root page HTTP 200 |
| REST proxy | `127.0.0.1:55434` | Node PID 27524 |
| PostgREST 16.4 | `127.0.0.1:55445` | PostgREST PID 6892 |
| H34 real-data PostgreSQL | `127.0.0.1:55443` | PostgreSQL PID 21708 |
| H33 synthetic PostgreSQL | `127.0.0.1:55441` | PostgreSQL PID 23272; preserved, not used by H35 |

The database identity query ran inside `BEGIN READ ONLY` and returned `gieomo_realdata_acceptance_20261024e`, port 55443, `default_transaction_read_only=on`, and recovery mode false. Runtime configuration files existed, and only variable names/configured state were inspected; no secret value was printed.

## 3. Root-cause trace

### Data layer

The acceptance DB contains:

| Entity | Rows / image slots | Source pattern |
|---|---:|---|
| Products | 4 thumbnails | 4 absolute remote references |
| Product media | 20 gallery rows | 20 absolute remote references; relationships valid |
| Product variants | 103 image fields | 102 absolute remote references, 1 null |
| Combos | 8 image fields | 8 absolute remote references |
| Total | 135 | 134 remote, 1 null |

The H35 DB manifest records ID, owner relationship, slug/SKU where applicable, source field, SHA-256 reference fingerprint and redacted reference properties. It contains no raw remote URL and no customer data.

### Transform and render layer

Before H35, `src/lib/runtimeAssetSafety.ts` returned `/images/products/pounch_1.png` for every absolute HTTP(S) URL whenever `NEXT_PUBLIC_SUPABASE_URL` was loopback. Therefore 134 different DB references collapsed to one image.

`src/lib/services/productService.ts` applied that transform independently to product thumbnails, all media rows and 102 non-null variant URLs. It also retained other generic pouch/invalid placeholder fallbacks. `src/app/api/combos/route.ts` transformed the combo header but left joined `product.thumbnail` values unsanitized. Client stores and several render paths added further generic product fixtures when a value was absent.

Next.js itself was not reordering images or mapping by array index. The bundled Next 16.3.5 image documentation and optimizer implementation confirmed that `next/image` uses the given source and configured remote patterns; the entity collapse occurred before rendering.

### Forensic conclusion

The database image references and product/media ownership relationships are internally present. The displayed mismatch was caused by an over-broad local safety fallback combined with a real-looking product fixture. No evidence supports replacing those DB references with any retained local catalog fixture.

## 4. Local image inventory

Durable inventory: `docs/audits/H35_LOCAL_IMAGE_INVENTORY_20261024T012503.json`.

The recursive inventory covered `public`, `backups`, `docs` and `.tmp`, including preserved build workspaces, Next image caches and H35 screenshots. It records path, format, pixel size, byte size, SHA-256, decode status, provenance, entity evidence and confidence for every file.

| Measure | Result |
|---|---:|
| Files inventoried | 485 |
| Unique SHA-256 hashes | 104 |
| Decodable | 485 |
| Invalid/unreadable | 0 |
| Duplicate hash groups | 44 |
| Next-derived cache files | 88 |
| Copied workspace product fixtures | 80 |
| Repository product fixtures | 8 |
| H35 screenshots | 6 |
| Explicit unavailable-state SVG | 1 |

The large raw count is intentional: preserved `.tmp` workspaces and the isolated H35 build copy were not excluded. Duplicate grouping prevents those copies from being mistaken for distinct sources.

Repository product fixtures:

| Asset | Pixels | Bytes | SHA-256 | Evidence and disposition |
|---|---:|---:|---|---|
| `bo-kim-chi-1.jpg` | 1200×896 | 827,194 | `8ad05a10e43d524ccc923127cb36e1214d60df94649014c20d27bbbc76ff4f9f` | Old seed/docs catalog only; no real-reference match |
| `combo-starter.jpg` | 1197×795 | 146,001 | `9d019140a7baed56f5887923c144d413e820f4638c47ba788cf6dd54ca6f85dc` | Old combo fixture; byte-identical to `set_combo_1.jpg` |
| `kep-toc-1.jpg` | 1200×896 | 826,739 | `55cbad563fcd697998a35fbc54c07b09628a50374b9b78d0e2f25e747a4b57f3` | Seed slug differs from real catalog; filename is insufficient |
| `pounch_1.png` | 465×225 | 137,442 | `54f37c44d6beaf92cb8010244e2453946be638657ab305e52ee4b0e35b75ccdb` | The incorrect H34 universal fallback |
| `pounch_2.jpg` | 460×225 | 22,291 | `5932bf7c0d3c834878e84c6e840af8a08220d8af3f2858e17c4ba4eaf434e6b8` | Old fixture only |
| `set_combo_1.jpg` | 1197×795 | 146,001 | `9d019140a7baed56f5887923c144d413e820f4638c47ba788cf6dd54ca6f85dc` | Duplicate bytes, not independent evidence |
| `sticker-pack-1.jpg` | 1200×896 | 942,276 | `c5bf5d1eea769a1dbfa8d719c370f4f0490747bd95f70637f4ed34bd0316fa02` | Old seed product not present in real four-product catalog |
| `tote-gieo-mo-1.jpg` | 1200×896 | 817,414 | `b166df76d2fee39a711271dd5141350370eb13645302663e910037cc906b8c33` | Old seed/docs link only; no exact real-reference match |

The old seed maps those files to a different catalog (`pouch-mam-mo`, `kep-toc-nut-ao`, `tui-tote-gieo-mo`, `bo-kim-chi-mam-mo`, `sticker-pack-mam-mo`). H35 found zero exact basename matches against the 134 redacted DB references.

H35 also recomputed Next `ImageOptimizerCache` keys offline from every DB URL, all configured widths, qualities, MIME types and cache versions 1–4. Seventeen unique cache directories were examined; zero of the 134 references matched. Cached AVIF files therefore remain untrusted derivatives and were not promoted to product assets.

## 5. Catalog reconciliation manifest

Durable manifest: `docs/audits/H35_PRODUCT_IMAGE_MANIFEST_20261024T012503.json`.

| Classification | Count | Meaning after H35 |
|---|---:|---|
| `MATCH_VERIFIED` | 0 | No exact source pixels can be tied to a real entity |
| `WRONG_MAPPING` | 134 before / 0 presented as source after | Universal pouch substitution removed |
| `FALLBACK_ONLY` | 134 | Remote reference blocked locally; explicit unavailable-state asset shown |
| `MISSING_LOCAL_ASSET` | 1 primary, 135 underlying gaps | One null variant field; all 134 remote binaries also absent locally |
| `INVALID_OR_UNREADABLE` | 0 | All local files decode |
| `AMBIGUOUS` | 0 selected | Fixture/cache candidates were rejected for insufficient linkage rather than guessed |
| `SOURCE_REFERENCE_INVALID` | 0 | Remote references are syntactically valid; binaries were intentionally not contacted |

Per real product:

| Product ID / slug | Media | Variants | Null variant images | Result |
|---|---:|---:|---:|---|
| `84727ac9-aae7-4a42-ba7d-422fcd875f47` / `kep-gieo-mo` | 11 | 50 | 0 | `FALLBACK_ONLY` |
| `eb9e88aa-a30c-43f3-a071-d96a5d889aae` / `moc-khoa-gieo-mo` | 6 | 50 | 0 | `FALLBACK_ONLY` |
| `e695604e-6dd5-4b30-a35a-ce1d2bd91979` / `tui-gieo-mo` | 2 | 2 | 0 | `FALLBACK_ONLY` |
| `9d8b48f5-3b5c-4870-9844-d3ea94b3002a` / `vo-gieo` | 1 | 1 | 1 | Product fallback; one variant `MISSING_LOCAL_ASSET` |

All eight real combos (`gieo-hat-kep`, `gieo-hat-moc-khoa`, `gieo-hat-phu-kien`, `gieo-hat-vo`, `trao-mo`, `uom-mam-kep`, `uom-mam-moc-khoa`, `uom-mam-vo`) are `FALLBACK_ONLY`. Their exact IDs and reference hashes are in the manifest.

## 6. Code changes

- `src/lib/runtimeAssetSafety.ts`: adds structured `source` / `fallback_only` / `missing` classification; loopback remote references resolve to a truthful unavailable-state asset; non-loopback behavior remains unchanged.
- `public/images/product-image-unavailable.svg`: code-native brand-compatible status placard, visibly labeled as not a verified product image. It is not claimed as product artwork.
- `src/lib/services/productService.ts`: preserves media ordering, classifies product and variant assets, deduplicates repeated placeholder gallery entries and removes invalid/real-looking fallbacks.
- `src/app/api/combos/route.ts`: classifies combo images and also sanitizes joined component-product thumbnails.
- `src/types/database.ts`: adds optional image-status fields to the product, variant, media and combo view contracts.
- `src/lib/data/orderStore.ts`: forwards image status and uses the explicit unavailable asset for absent combo/product read models.
- Public product card/detail and combo pages: display clear fallback notices; product detail uses the explicit status asset for its final fallback.
- Product metadata, sale-product and admin-message read displays: stop using pouch or nonexistent `placeholder.jpg` as a generic product fallback.
- `tests/runtimeAssetSafety.test.ts` and `tests/comboRoute.test.ts`: verify status classification, Production preservation, wrong-mapping detection, combo relationship handling and nested image sanitization.

No slug-specific map, index-based assignment, database edit, migration, package addition or downloaded/generated product image was introduced.

## 7. Automated and browser evidence

### Tests and build

| Gate | Result |
|---|---|
| Focused image/catalog/combo/product-service suite | PASS — 48/48, 0 skip |
| Core image/combo subset | PASS — 28/28, 0 skip |
| TypeScript | PASS |
| Isolated production build | PASS — compiled, TypeScript passed, 51 static pages generated |
| `git diff --check` | PASS; existing LF/CRLF warnings only |
| Targeted new-boundary lint | PASS for runtime helper, combo route, product card and runtime test |
| Full configured lint | FAIL — 372 errors, 190 warnings across 99 files |

Full lint remains a release blocker. H35 did not suppress a rule or exclude application code. The total improved from H34's 378 errors because six legacy `any` callbacks in the touched product image mapping were replaced by a bounded media input type. Remaining leading categories are 307 `no-explicit-any`, 185 unused warnings, 38 set-state-in-effect and 11 immutability findings.

The build ran in the preserved isolated copy `.tmp/h35-build-workspace-20261024T012503` with the H34 loopback runtime variables loaded without printing values. It did not replace the live `.next` directory.

### Browser visual acceptance

H35 visited `/products`, all four real product detail slugs and `/combos` at 1440×900 and 390×844. It then authenticated with the synthetic local admin and visited `/admin/products` and `/admin/combos`. Five original screenshots plus separate admin product/combo screenshots are preserved under `.tmp/h35-browser-screenshots`.

Results:

- All tested routes returned 200 and rendered.
- Every public real entity visibly showed the unavailable-state image and notice; none was presented as verified.
- Product APIs reported 4/4 products `fallback_only`; their galleries contained no duplicate URL entries.
- Variant evidence was 102 `fallback_only` and 1 `missing`, matching the DB.
- Combo APIs reported 8/8 `fallback_only`; nested component thumbnails contained no external URL.
- Broken images: 0. Browser 5xx: 0. Console errors: 0. Loopback request failures: 0.
- Horizontal overflow: 0 on all public desktop/mobile pages.
- External image URLs in final product/combo API responses: 0.
- Browser-level non-loopback request attempts: 0. The harness would have blocked and failed on any attempt.

Visual inspection confirmed that the placeholder is neutral, brand-compatible and explicitly says “Ảnh thật chưa có cục bộ / Không phải ảnh sản phẩm đã xác minh”. It does not resemble or claim to be any of the four real products.

## 8. Database and network safety revalidation

After all browser work:

- `POST`, `PATCH`, `DELETE` and `adjust_variant_stock` RPC probes through the real PostgREST boundary all returned HTTP 403 / PostgreSQL `42501`. Non-target UUIDs and an invalid empty insert payload were used so an unexpected permission failure could not select a real mutation target.
- `anon`, `authenticated` and `service_role` each retained zero INSERT/UPDATE/DELETE/TRUNCATE/TRIGGER/REFERENCES table privileges in `public`.
- H34 integrity rerun passed: 32 foreign keys, 0 orphan rows, 0 invalid constraints, the sole allowed `members:+1` synthetic fixture delta, and zero real-row hash mismatches between pristine and acceptance DBs.
- No Production Supabase, Storage, Internet API, email, webhook, analytics or payment request was made.
- No secret, authorization header, customer data or raw image URL appears in the durable evidence.

## 9. Git/WIP state

Final branch and HEAD remain unchanged. Final porcelain is 219 entries: 71 tracked and 148 untracked, versus 213 / 66 / 147 initially.

The delta is explained by H35's five newly touched tracked paths that were clean at start plus the new explicit placeholder asset; other H35 edits overlap already-dirty or already-untracked H34/H32 files. The audit directory remains a single collapsed untracked entry in porcelain. All pre-existing WIP, reports, snapshots, H29/H34 data directories, pristine/acceptance databases and H33 synthetic cluster were preserved.

No reset, clean, stash, checkout overwrite, stage, commit, push, pull, merge, rebase, deploy or deletion occurred.

## 10. Restart and rollback

### Restart H35/H34 read-only acceptance

1. Re-resolve listener ownership; do not trust recorded PIDs.
2. Verify `.tmp/postgres-realdata-h34-20261024d/postmaster.pid`, port 55443 and database identity before any process action.
3. If PostgreSQL is stopped, start that exact H34 data directory on loopback 55443 with `pg_ctl`; Windows may require elevation.
4. Confirm the H34 runtime env and PostgREST config exist without printing their values.
5. With ports 3790, 55434 and 55445 free, run:

```powershell
powershell -ExecutionPolicy Bypass -File .tmp\h34-start-realdata-runtime.ps1
```

6. Verify `/api/products` reports four `fallback_only` products, `/api/combos` reports eight, then run:

```powershell
node .tmp\h35-rest-write-boundaries.mjs
node .tmp\h34-integrity-check.mjs
node .tmp\h35-browser-image-acceptance.mjs
```

### Narrow rollback

If the H35 presentation change must be rolled back, apply a reviewed inverse patch only to the H35 files listed in section 6 and leave the reports/evidence intact. Do not use repository-wide checkout/reset because these files contain pre-existing H32–H34 WIP. The DB requires no rollback because H35 made no DB change.

## 11. Remaining asset requirement

Verdict A requires an explicitly authorized immutable export of the referenced Storage objects, plus a manifest preserving the original object path or another stable entity/reference-hash mapping and a checksum for each binary. The export must cover:

- 4 product thumbnails;
- 20 product-media objects;
- 102 non-null variant objects;
- 8 combo objects;
- and an owner decision for the one variant whose source field is null.

Once supplied, each binary must be checksum-inventoried, tied to the exact manifest row, decoded, visually reviewed, copied into a stable local asset namespace without changing the real DB, and re-run through the same API/browser/no-network gates. Filenames, visual similarity or product names alone are not sufficient evidence.

## 12. Final decision

**B — CODE FIXED, ASSETS INCOMPLETE.**

H35 fixed the root presentation and network-boundary defect: the local site no longer claims one pouch fixture is the correct image for 134 unrelated real-data references, gallery duplicates are removed, nested combo images are safe, and every fallback is explicit. However, verified real source pixels are absent from the authorized local evidence. The correct forensic outcome is therefore an honest incomplete asset state, not a fabricated 100% restoration.
