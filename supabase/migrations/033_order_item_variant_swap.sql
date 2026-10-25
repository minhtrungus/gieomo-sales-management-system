-- ========================================================
-- GIEO MO â€” DATABASE MIGRATION 033 (H25)
-- Atomic order-item variant swap ("doi mau giao hang")
-- ========================================================
-- Additive only. "Mau" (pattern) is represented by product_variants.variant_id,
-- which is already a stable UUID key of its own inventory (stock per variant,
-- per-order reservation rows in order_inventory_reservations, and combo_items
-- component targeting). No new table is required.
--
-- Guarantees of public.swap_order_item_variant_atomic(jsonb):
--   * One deterministic lock order: orders row -> order_items row ->
--     involved product_variants (sorted by variant_id) -> reservation rows.
--     This is the same order-row-first, sorted-variant scheme introduced by
--     migration 026 for cancellations, so swap and cancel cannot deadlock.
--   * Every business denial returns an outcome BEFORE any mutation, so the
--     transaction commits with zero side effects.
--   * A mid-mutation failure (constraint/audit error) aborts the statement,
--     rolling back stock, reservations, the order item, and the audit row
--     together â€” the order and inventory are unchanged.
--   * Price, quantity, subtotal, item discount, product_id and the combo
--     template are NEVER written; only the delivered variant identity moves.
--   * Provenance moves exactly one line's worth of held units from the old
--     variant's reservation aggregate to the new variant's aggregate, so a
--     later cancellation restores stock from reservations (migration 026
--     mechanism) and restores the actually-delivered patterns.
--   * Retry/idempotency: the caller must pass current_variant_id (the variant
--     it believes the line still holds). If the line already holds
--     new_variant_id, the RPC returns 'replayed' with no side effects; if it
--     holds anything else, 'variant_mismatch' â€” a concurrent second swap can
--     never double-move stock.
--   * Audit (actor, before/after stock, reason) is written in the same
--     transaction. Audit failure aborts the whole swap.
--
-- Combo lines are rejected fail-closed ('unsupported_combo_line'): delivered
-- combo components are not attributed per order-item, so swapping "a
-- component" would be template-derived bookkeeping â€” the exact approach
-- migration 026 deliberately abolished. Future support requires a
-- delivered-component ledger; see the H25 report.

CREATE FUNCTION public.swap_order_item_variant_atomic(p JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_id        UUID;
  v_order_id        UUID;
  v_order_code      TEXT := upper(NULLIF(btrim(p->>'order_code'), ''));
  v_item_id         UUID;
  v_expected_id     UUID;
  v_new_id          UUID;
  v_reason          TEXT;
  v_request_qty     INTEGER;
  v_order           public.orders%ROWTYPE;
  v_item            public.order_items%ROWTYPE;
  v_old             public.product_variants%ROWTYPE;
  v_new             public.product_variants%ROWTYPE;
  v_new_product_status TEXT;
  v_res_old_before  INTEGER;
  v_old_stock_before INTEGER;
  v_new_stock_before INTEGER;
BEGIN
  IF (NULLIF(btrim(p->>'order_id'), '') IS NULL) = (v_order_code IS NULL) THEN
    RETURN jsonb_build_object('outcome', 'invalid_identity');
  END IF;

  BEGIN
    v_item_id := NULLIF(btrim(p->>'order_item_id'), '')::uuid;
    v_new_id := NULLIF(btrim(p->>'new_variant_id'), '')::uuid;
    v_expected_id := NULLIF(btrim(p->>'current_variant_id'), '')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN jsonb_build_object('outcome', 'invalid_request');
  END;
  IF v_item_id IS NULL OR v_new_id IS NULL OR v_expected_id IS NULL THEN
    RETURN jsonb_build_object('outcome', 'invalid_request');
  END IF;

  -- A caller that tries to smuggle a different quantity is denied: a swap
  -- moves the whole line, and quantity/price are immutable in this flow.
  IF jsonb_typeof(p->'quantity') = 'number' THEN
    IF length(COALESCE(p->>'quantity', '')) > 9 OR (p->>'quantity') !~ '^[0-9]+$' THEN
      RETURN jsonb_build_object('outcome', 'invalid_request');
    END IF;
    v_request_qty := (p->>'quantity')::integer;
  ELSIF (p ? 'quantity') AND (p->'quantity') IS NOT DISTINCT FROM JSONB 'null' THEN
    -- null quantity is treated as absent
    NULL;
  ELSIF (p ? 'quantity') THEN
    RETURN jsonb_build_object('outcome', 'invalid_request');
  END IF;

  v_reason := NULLIF(btrim(p->>'reason'), '');
  IF v_reason IS NULL OR length(v_reason) > 500 THEN
    RETURN jsonb_build_object('outcome', 'invalid_request');
  END IF;

  BEGIN
    v_actor_id := NULLIF(btrim(p->>'actor_member_id'), '')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN jsonb_build_object('outcome', 'invalid_actor');
  END;
  IF v_actor_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.members
     WHERE member_id = v_actor_id AND role = 'admin' AND status = 'active'
  ) THEN
    RETURN jsonb_build_object('outcome', 'invalid_actor');
  END IF;

  IF v_order_code IS NOT NULL THEN
    SELECT * INTO v_order
      FROM public.orders
     WHERE order_code = v_order_code
     FOR UPDATE;
  ELSE
    BEGIN
      v_order_id := (p->>'order_id')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RETURN jsonb_build_object('outcome', 'invalid_identity');
    END;
    SELECT * INTO v_order
      FROM public.orders
     WHERE order_id = v_order_id
     FOR UPDATE;
  END IF;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'not_found');
  END IF;

  -- Same editable window as cancellation (pending/confirmed/processing), and
  -- additionally the package must not have been assembled or handed over yet.
  -- Payment state does not gate the swap: stock is held identically for
  -- pending and paid orders and no amount changes.
  IF v_order.order_status::text NOT IN ('pending', 'confirmed', 'processing')
     OR v_order.delivery_status::text <> 'not_ready' THEN
    RETURN jsonb_build_object(
      'outcome', 'not_editable',
      'order_id', v_order.order_id,
      'current_status', v_order.order_status,
      'current_delivery_status', v_order.delivery_status
    );
  END IF;

  -- No provenance -> swapping would desync the reservation ledger that
  -- migration 026-based cancellation restores from. Fail closed instead.
  IF v_order.inventory_reservation_recorded_at IS NULL THEN
    RETURN jsonb_build_object(
      'outcome', 'inventory_unverified',
      'order_id', v_order.order_id
    );
  END IF;

  SELECT * INTO v_item
    FROM public.order_items
   WHERE order_item_id = v_item_id
     AND order_id = v_order.order_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'item_not_found');
  END IF;

  IF v_request_qty IS NOT NULL AND v_request_qty <> v_item.quantity THEN
    RETURN jsonb_build_object(
      'outcome', 'quantity_immutable',
      'line_quantity', v_item.quantity
    );
  END IF;

  IF v_item.combo_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'outcome', 'unsupported_combo_line',
      'order_id', v_order.order_id,
      'order_item_id', v_item.order_item_id
    );
  END IF;

  IF v_item.variant_id IS NULL THEN
    RETURN jsonb_build_object(
      'outcome', 'variant_missing',
      'order_id', v_order.order_id,
      'order_item_id', v_item.order_item_id
    );
  END IF;

  -- Retry/concurrency gate. The caller must confirm the pattern it believes
  -- the line currently holds:
  --   matches current            -> apply old -> new;
  --   matches new_variant_id     -> 'replayed' (retry of a completed swap);
  --   anything else              -> 'variant_mismatch' (someone else won).
  IF v_item.variant_id <> v_expected_id AND v_item.variant_id <> v_new_id THEN
    RETURN jsonb_build_object(
      'outcome', 'variant_mismatch',
      'order_id', v_order.order_id,
      'order_item_id', v_item.order_item_id,
      'current_variant_id', v_item.variant_id
    );
  END IF;
  IF v_item.variant_id = v_new_id THEN
    RETURN jsonb_build_object(
      'outcome', 'replayed',
      'order_id', v_order.order_id,
      'order_code', v_order.order_code,
      'order_item_id', v_item.order_item_id,
      'variant_id', v_item.variant_id
    );
  END IF;

  -- Deterministic sorted lock on both involved variants; same sorted-variant
  -- scheme as cancellation. Cross-order races on the last shared unit
  -- serialize here and the stock guard below decides the loser fail-closed.
  PERFORM pv.variant_id
    FROM public.product_variants pv
   WHERE pv.variant_id IN (v_item.variant_id, v_new_id)
   ORDER BY pv.variant_id
   FOR UPDATE;

  SELECT * INTO v_old
    FROM public.product_variants
   WHERE variant_id = v_item.variant_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'outcome', 'variant_unavailable',
      'order_item_id', v_item.order_item_id
    );
  END IF;

  SELECT * INTO v_new
    FROM public.product_variants
   WHERE variant_id = v_new_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'outcome', 'variant_unavailable',
      'order_item_id', v_item.order_item_id
    );
  END IF;

  SELECT pr.status::text INTO v_new_product_status
    FROM public.products pr
   WHERE pr.product_id = v_new.product_id;

  -- "Doi mau" moves the delivered pattern within the SAME product as the
  -- currently-held variant. The comparison uses the variant's own product_id
  -- (authoritative FK) rather than the order item snapshot, which may be NULL
  -- for historical lines. Swapping to a variant of another product would
  -- silently change what is sold, which is outside this contract.
  IF v_old.product_id IS NULL
     OR v_new.product_id IS DISTINCT FROM v_old.product_id
     OR v_new_product_status IS DISTINCT FROM 'active'
     OR v_new.status::text IS DISTINCT FROM 'active' THEN
    RETURN jsonb_build_object(
      'outcome', 'variant_cross_product',
      'order_item_id', v_item.order_item_id,
      'new_variant_id', v_new.variant_id
    );
  END IF;

  IF v_new.stock < v_item.quantity THEN
    RETURN jsonb_build_object(
      'outcome', 'insufficient_stock',
      'order_item_id', v_item.order_item_id,
      'new_variant_id', v_new.variant_id,
      'available', v_new.stock,
      'required', v_item.quantity
    );
  END IF;

  SELECT quantity::integer INTO v_res_old_before
    FROM public.order_inventory_reservations
   WHERE order_id = v_order.order_id
     AND variant_id = v_item.variant_id
   FOR UPDATE;
  IF v_res_old_before IS NULL OR v_res_old_before < v_item.quantity THEN
    -- Reservation ledger drifted below the line requirement; refuse instead
    -- of trusting order_items alone.
    RETURN jsonb_build_object(
      'outcome', 'reservation_missing',
      'order_id', v_order.order_id,
      'variant_id', v_item.variant_id
    );
  END IF;

  v_old_stock_before := v_old.stock;
  v_new_stock_before := v_new.stock;

  UPDATE public.product_variants
     SET stock = stock + v_item.quantity,
         updated_at = now()
   WHERE variant_id = v_item.variant_id;

  UPDATE public.product_variants
     SET stock = stock - v_item.quantity,
         updated_at = now()
   WHERE variant_id = v_new_id
     AND stock >= v_item.quantity;
  -- Unreachable without concurrent mutation (both rows are locked above), but
  -- must abort the transaction rather than sell below zero if ever reached.
  IF NOT FOUND THEN
    RAISE EXCEPTION 'H25:SWAP_STOCK_GUARD';
  END IF;

  -- Move this line's held units of provenance from old to new. Later
  -- cancellation (migration 026) restores per aggregate, so moving exactly
  -- the line quantity preserves total stock and delivered patterns.
  -- The table CHECK enforces quantity > 0, so a fully-absorbed aggregate row
  -- is removed rather than decremented to zero.
  DELETE FROM public.order_inventory_reservations
   WHERE order_id = v_order.order_id
     AND variant_id = v_item.variant_id
     AND quantity <= v_item.quantity;

  UPDATE public.order_inventory_reservations
     SET quantity = quantity - v_item.quantity
   WHERE order_id = v_order.order_id
     AND variant_id = v_item.variant_id;

  INSERT INTO public.order_inventory_reservations (order_id, variant_id, quantity)
  VALUES (v_order.order_id, v_new_id, v_item.quantity)
  ON CONFLICT (order_id, variant_id)
  DO UPDATE SET quantity = public.order_inventory_reservations.quantity + EXCLUDED.quantity;

  UPDATE public.order_items
     SET variant_id = v_new_id,
         variant_name_snapshot = v_new.name,
         sku_snapshot = v_new.sku
   WHERE order_item_id = v_item.order_item_id;

  UPDATE public.orders
     SET updated_at = now()
   WHERE order_id = v_order.order_id;

  -- Same-transaction audit: a failure here aborts the swap above.
  INSERT INTO public.audit_logs (
    actor_member_id, action, entity_type, entity_id, before_data, after_data
  ) VALUES (
    v_actor_id,
    'order.item.variant_swap',
    'order_item',
    v_item.order_item_id,
    jsonb_build_object(
      'order_id', v_order.order_id,
      'order_code', v_order.order_code,
      'variant_id', v_item.variant_id,
      'variant_name', v_old.name,
      'sku', v_old.sku,
      'stock', v_old_stock_before,
      'reservation_quantity', v_res_old_before,
      'line_quantity', v_item.quantity,
      'unit_price', v_item.unit_price,
      'subtotal', v_item.subtotal
    ),
    jsonb_build_object(
      'order_id', v_order.order_id,
      'order_code', v_order.order_code,
      'variant_id', v_new_id,
      'variant_name', v_new.name,
      'sku', v_new.sku,
      'stock', v_new_stock_before - v_item.quantity,
      'old_stock_after', v_old_stock_before + v_item.quantity,
      'line_quantity', v_item.quantity,
      'unit_price', v_item.unit_price,
      'subtotal', v_item.subtotal,
      'price_unchanged', true,
      'quantity_unchanged', true,
      'reason', v_reason
    )
  );

  RETURN jsonb_build_object(
    'outcome', 'swapped',
    'order_id', v_order.order_id,
    'order_code', v_order.order_code,
    'order_item_id', v_item.order_item_id,
    'from_variant_id', v_item.variant_id,
    'from_variant_name', v_old.name,
    'to_variant_id', v_new_id,
    'to_variant_name', v_new.name,
    'quantity', v_item.quantity,
    'stock_old_after', v_old_stock_before + v_item.quantity,
    'stock_new_after', v_new_stock_before - v_item.quantity
  );
END;
$$;

REVOKE ALL ON FUNCTION public.swap_order_item_variant_atomic(JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.swap_order_item_variant_atomic(JSONB)
  TO service_role;

COMMENT ON FUNCTION public.swap_order_item_variant_atomic(JSONB) IS
  'Atomic admin-only delivered-variant swap on an editable order line; moves stock and reservation provenance exactly once and audits before/after in the same transaction.';

DO $$
BEGIN
  IF to_regprocedure('public.swap_order_item_variant_atomic(jsonb)') IS NULL THEN
    RAISE EXCEPTION 'migration 033 function missing';
  END IF;
  IF has_function_privilege('anon', 'public.swap_order_item_variant_atomic(jsonb)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.swap_order_item_variant_atomic(jsonb)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.swap_order_item_variant_atomic(jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION '033: invalid runtime RPC ACL';
  END IF;
END $$;

