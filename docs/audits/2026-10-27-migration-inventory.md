# Gieo Mơ migration inventory — 2026-10-27

## Evidence and status vocabulary

- `PASS`: canonical chain validation plus clean replay in a disposable PostgreSQL 18 cluster, followed by the mandatory PostgreSQL tests with zero skips.
- `UNVERIFIED`: no claim about the remote database. `supabase migration list` returned `Cannot find project ref. Have you run supabase link?`; this worktree has no verified Supabase link/Preview branch credential.
- No remote migration write was attempted. Production was not queried because its identity could not be established independently and safely.
- Dependencies below name the earliest important predecessor, not every object transitively referenced.

| Version / file | Purpose and principal objects | Depends on | Local syntax / chain | Isolated PostgreSQL | Supabase Preview | Production read-only |
|---|---|---|---|---|---|---|
| 001 `initial_schema` | Core enums/tables, orders, items, payments, shipments, history, audit | — | PASS | PASS | UNVERIFIED | UNVERIFIED |
| 002 `grant_permissions_and_rls` | Base grants, RLS enablement and policies | 001 | PASS | PASS | UNVERIFIED | UNVERIFIED |
| 003 `system_configs_and_crud_rls` | Config table hardening/default config | 001–002 | PASS | PASS | UNVERIFIED | UNVERIFIED |
| 004 `contact_messages_and_catalog_rls` | Contact messages and catalog access policies | 001–002 | PASS | PASS | UNVERIFIED | UNVERIFIED |
| 005 `social_media_system_configs` | Social configuration seed keys | 003 | PASS | PASS | UNVERIFIED | UNVERIFIED |
| 006 `add_password_hash_to_members` | Member password hash/auth schema hardening | 001–002 | PASS | PASS | UNVERIFIED | UNVERIFIED |
| 007 `storage_buckets_and_rls` | Storage buckets and object policies | 002 | PASS | PASS | UNVERIFIED | UNVERIFIED |
| 008 `product_reviews` | Reviews table, indexes, RLS | 001–002 | PASS | PASS | UNVERIFIED | UNVERIFIED |
| 009 `ensure_product_relationships` | Product relationship constraints | 001 | PASS | PASS | UNVERIFIED | UNVERIFIED |
| 010 `add_image_url_to_product_variants` | Variant image field | 001 | PASS | PASS | UNVERIFIED | UNVERIFIED |
| 011 `fix_rls_security_policies` | Correct permissive order/customer/payment policies | 002 | PASS | PASS | UNVERIFIED | UNVERIFIED |
| 012 `atomic_stock_and_rls_hardening` | Atomic stock RPC and stricter catalog RLS | 001–011 | PASS | PASS | UNVERIFIED | UNVERIFIED |
| 013 `fix_rls_orders_customers_payment.rls` | Order-domain RLS corrections | 011–012 | PASS | PASS | UNVERIFIED | UNVERIFIED |
| 014 `add_freeship_discount_type` | Adds freeship enum value | 001 | PASS | PASS | UNVERIFIED | UNVERIFIED |
| 015 `order_idempotency` | Initial idempotency ledger and order provenance columns | 001 | PASS | PASS | UNVERIFIED | UNVERIFIED |
| 016 `create_order_atomic` | First atomic order/pricing/stock RPC set | 012, 015 | PASS | PASS | UNVERIFIED | UNVERIFIED |
| 017 `cancel_order_atomic` | Initial atomic cancellation RPC | 016 | PASS | PASS | UNVERIFIED | UNVERIFIED |
| 018 `payments_unique_transaction` | Unique order/transaction payment identity | 001 | PASS | PASS | UNVERIFIED | UNVERIFIED |
| 019 `inventory_adjustments` | Audited idempotent stock adjustments | 012 | PASS | PASS | UNVERIFIED | UNVERIFIED |
| 020 `ledger_delete_policy` | Retention/delete policy controls for ledgers | 015, 019 | PASS | PASS | UNVERIFIED | UNVERIFIED |
| 021 `reconcile_v015_idempotency` | Canonicalizes idempotency schema and legacy RPCs | 015–020 | PASS | PASS | UNVERIFIED | UNVERIFIED |
| 022 `revoke_runtime_order_dml` | Revokes direct runtime writes to order domain | 021 | PASS | PASS | UNVERIFIED | UNVERIFIED |
| 023 `payment_integrity` | `payment_events`, single-paid invariant, atomic apply RPC | 018, 022 | PASS | PASS | UNVERIFIED | UNVERIFIED |
| 024 `repair_payment_cash_contract` | Repairs strict synthetic-cash contract in payment RPC | 023 | PASS | PASS | UNVERIFIED | UNVERIFIED |
| 025 `atomic_idempotent_order_creation` | Canonical v25 order creation and request hashing | 021, 024 | PASS | PASS | UNVERIFIED | UNVERIFIED |
| 026 `atomic_order_cancellation` | Reservations and provenance-safe cancel/restore RPC | 025 | PASS | PASS | UNVERIFIED | UNVERIFIED |
| 027 `close_runtime_read_and_rpc_bypasses` | Closes runtime reads/writer execution bypasses | 022–026 | PASS | PASS | UNVERIFIED | UNVERIFIED |
| 028 `orders_payments_least_privilege` | Final least-privilege order/payment table grants | 027 | PASS | PASS | UNVERIFIED | UNVERIFIED |
| 029 `atomic_payment_rejection` | Audited atomic payment-proof rejection | 023, 028 | PASS | PASS | UNVERIFIED | UNVERIFIED |
| 030 `atomic_combo_persistence` | Atomic combo header/components persistence | 028 | PASS | PASS | UNVERIFIED | UNVERIFIED |
| 031 `optional_combo_variant_persistence` | Safe optional combo variant mapping | 030 | PASS | PASS | UNVERIFIED | UNVERIFIED |
| 032 `controlled_order_deletion` | Guarded deletion for unpaid/no-evidence orders | 026, 028 | PASS | PASS | UNVERIFIED | UNVERIFIED |
| 033 `order_item_variant_swap` | Locked/audited variant swap with inventory provenance | 026, 032 | PASS | PASS | UNVERIFIED | UNVERIFIED |
| 034 `harden_order_deletion_and_mark_duplicates` | Hardens delete and adds non-destructive duplicate marker | 032–033 | PASS | PASS | UNVERIFIED | UNVERIFIED |
| 035 `combo_wildcard_checkout` | Wildcard combo allocation and reservation provenance | 025–031 | PASS | PASS | UNVERIFIED | UNVERIFIED |
| 036 `preserve_order_source_delivery_pickup_guidance` | Adds source/delivery enum values and pickup guidance | 001, 035 | PASS | PASS | UNVERIFIED | UNVERIFIED |
| 037 `preserve_order_source_delivery_writer` | Updates canonical writer for source/delivery fields | 025, 036 | PASS | PASS | UNVERIFIED | UNVERIFIED |
| 038 `order_deletion_idempotency_cleanup` | Deletes an eligible order's own idempotency claim atomically | 034, 037 | PASS | PASS | UNVERIFIED | UNVERIFIED |
| 039 `controlled_payment_confirmation_adjustment` | Append-only cash compensation table/RPC; UI removed, backend deprecated | 023–024, 026 | PASS | PASS | UNVERIFIED | UNVERIFIED |
| 040 `payment_reminders` | Durable rate-limited reminder claims and audit | 028–029 | PASS | PASS | UNVERIFIED | UNVERIFIED |
| 041 `safe_test_order_archival` | Legacy non-destructive manual archival; history retained, UI/API removed | 028, 039–040 | PASS | PASS | UNVERIFIED | UNVERIFIED |
| 042 `guarded_test_payment_deletion` | Trigger provenance, hashed challenges, snapshot/lock-bound deletion, surviving audit | 023–026, 039–041 | PASS | PASS | UNVERIFIED | UNVERIFIED |

## Remote apply queue

Remote history is unknown, so it is unsafe to label any individual migration “missing” remotely. The local canonical tip is `042`. A future operator must first establish a dedicated Supabase Preview branch identity, authenticate, run `supabase migration list` read-only, compare its history with this exact chain, and dry-run only the verified pending forward migrations. Migration 042 must never be applied by pointing an unlinked worktree at Production, and its `test_cleanup_environments.cleanup_enabled` flag must not be enabled in Production.

## Special audit: 039–042

- 039 remains append-only and service-role-only. The admin CTA/modal was removed; the compatibility API branch is explicitly deprecated, not dropped.
- 040 remains in the canonical chain; its table/RPC and RLS/grants replay successfully.
- 041 remains immutable migration history. Its old UI and API consumer were removed, while archive filtering remains for already archived rows.
- 042 never backfills provenance. Only an order inserted while exactly one verified local/test/preview cleanup environment is enabled receives a trusted marker. External/provider payments and ambiguous financial evidence are blocked.
