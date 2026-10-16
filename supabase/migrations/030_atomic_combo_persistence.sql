-- Persist a combo header and its selected component variants in one transaction.

CREATE OR REPLACE FUNCTION public.save_combo_atomic(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_combo public.combos%ROWTYPE;
  v_combo_id uuid;
  v_lookup_slug text := NULLIF(btrim(p->>'lookup_slug'), '');
  v_replace_items boolean := COALESCE((p->>'replace_items')::boolean, false);
  v_items jsonb := p->'items';
  v_item jsonb;
  v_product_id uuid;
  v_variant_id uuid;
  v_quantity integer;
  v_target_status public.product_status;
BEGIN
  BEGIN
    v_combo_id := NULLIF(p->>'combo_id', '')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN jsonb_build_object('outcome', 'invalid_combo_id');
  END;

  IF v_combo_id IS NOT NULL THEN
    SELECT * INTO v_combo FROM public.combos
     WHERE combo_id = v_combo_id FOR UPDATE;
  ELSIF v_lookup_slug IS NOT NULL THEN
    SELECT * INTO v_combo FROM public.combos
     WHERE slug = v_lookup_slug FOR UPDATE;
  END IF;

  IF FOUND THEN
    v_combo_id := v_combo.combo_id;
    BEGIN
      v_target_status := CASE
        WHEN p ? 'status' THEN (p->>'status')::public.product_status
        ELSE v_combo.status
      END;
    EXCEPTION WHEN invalid_text_representation THEN
      RETURN jsonb_build_object('outcome', 'invalid_header', 'field', 'status');
    END;

    UPDATE public.combos
       SET name = CASE WHEN p ? 'name' THEN btrim(p->>'name') ELSE name END,
           slug = CASE WHEN p ? 'slug' THEN btrim(p->>'slug') ELSE slug END,
           price = CASE WHEN p ? 'price' THEN (p->>'price')::numeric ELSE price END,
           image_url = CASE WHEN p ? 'image_url' THEN NULLIF(p->>'image_url', '') ELSE image_url END,
           description = CASE WHEN p ? 'description' THEN NULLIF(p->>'description', '') ELSE description END,
           status = v_target_status,
           featured = CASE WHEN p ? 'featured' THEN (p->>'featured')::boolean ELSE featured END,
           sort_order = CASE WHEN p ? 'sort_order' THEN (p->>'sort_order')::integer ELSE sort_order END,
           updated_at = now()
     WHERE combo_id = v_combo_id
     RETURNING * INTO v_combo;
  ELSE
    IF NULLIF(btrim(p->>'name'), '') IS NULL OR NULLIF(btrim(p->>'slug'), '') IS NULL THEN
      RETURN jsonb_build_object('outcome', 'invalid_header');
    END IF;
    BEGIN
      v_target_status := COALESCE(NULLIF(p->>'status', ''), 'draft')::public.product_status;
      INSERT INTO public.combos (
        name, slug, price, image_url, description, status, featured, sort_order
      ) VALUES (
        btrim(p->>'name'), btrim(p->>'slug'), COALESCE((p->>'price')::numeric, 0),
        NULLIF(p->>'image_url', ''), NULLIF(p->>'description', ''), v_target_status,
        COALESCE((p->>'featured')::boolean, false), COALESCE((p->>'sort_order')::integer, 0)
      )
      RETURNING * INTO v_combo;
      v_combo_id := v_combo.combo_id;
    EXCEPTION
      WHEN invalid_text_representation OR numeric_value_out_of_range THEN
        RETURN jsonb_build_object('outcome', 'invalid_header');
    END;
  END IF;

  IF v_replace_items THEN
    IF v_items IS NULL OR jsonb_typeof(v_items) <> 'array' OR jsonb_array_length(v_items) = 0 THEN
      RAISE EXCEPTION 'C1:INVALID_COMBO_ITEMS';
    END IF;

    FOR v_item IN SELECT value FROM jsonb_array_elements(v_items)
    LOOP
      BEGIN
        v_product_id := NULLIF(v_item->>'product_id', '')::uuid;
        v_variant_id := NULLIF(v_item->>'variant_id', '')::uuid;
        v_quantity := (v_item->>'quantity')::integer;
      EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
        RAISE EXCEPTION 'C1:INVALID_COMBO_ITEM';
      END;

      IF v_product_id IS NULL OR v_variant_id IS NULL OR v_quantity IS NULL OR v_quantity <= 0 THEN
        RAISE EXCEPTION 'C1:INVALID_COMBO_ITEM';
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM public.product_variants pv
         WHERE pv.variant_id = v_variant_id
           AND pv.product_id = v_product_id
         FOR KEY SHARE
      ) THEN
        RAISE EXCEPTION 'C1:VARIANT_PRODUCT_MISMATCH';
      END IF;
    END LOOP;

    DELETE FROM public.combo_items WHERE combo_id = v_combo_id;
    INSERT INTO public.combo_items (combo_id, product_id, variant_id, quantity)
    SELECT v_combo_id,
           (value->>'product_id')::uuid,
           (value->>'variant_id')::uuid,
           (value->>'quantity')::integer
      FROM jsonb_array_elements(v_items);
  END IF;

  IF v_combo.status = 'active' AND NOT EXISTS (
    SELECT 1 FROM public.combo_items WHERE combo_id = v_combo_id
  ) THEN
    RAISE EXCEPTION 'C1:ACTIVE_COMBO_REQUIRES_ITEMS';
  END IF;

  RETURN jsonb_build_object(
    'outcome', 'saved', 'combo_id', v_combo_id, 'replaced_items', v_replace_items
  );
END;
$$;

REVOKE ALL ON FUNCTION public.save_combo_atomic(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_combo_atomic(jsonb) TO service_role;

COMMENT ON FUNCTION public.save_combo_atomic(jsonb) IS
  'Atomic row-locked combo header and explicit variant-component persistence.';

DO $$
BEGIN
  IF has_function_privilege('anon', 'public.save_combo_atomic(jsonb)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.save_combo_atomic(jsonb)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.save_combo_atomic(jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION '030: invalid save_combo_atomic runtime ACL';
  END IF;
END $$;

