-- Wildcard combo components are allocated from the bottom of the configured
-- variant list: highest sort_order first. UUID remains only the deterministic
-- tie-breaker. The first candidate loop in 035 keeps UUID lock order; only the
-- already-locked allocation loop changes business priority.

DO $$
DECLARE
  v_definition TEXT;
  v_old TEXT := E'ORDER BY pv.variant_id\n         FOR UPDATE\n      LOOP\n        IF v_remaining = 0 THEN EXIT; END IF;';
  v_new TEXT := E'ORDER BY pv.sort_order DESC, pv.variant_id DESC\n         FOR UPDATE\n      LOOP\n        IF v_remaining = 0 THEN EXIT; END IF;';
BEGIN
  SELECT pg_get_functiondef('public.create_order_atomic_v25(jsonb)'::regprocedure)
    INTO v_definition;
  IF position(v_old IN v_definition) = 0 THEN
    RAISE EXCEPTION '044: expected migration 035 wildcard allocation loop was not found';
  END IF;
  v_definition := replace(v_definition, v_old, v_new);
  IF position(v_old IN v_definition) > 0 OR position(v_new IN v_definition) = 0 THEN
    RAISE EXCEPTION '044: wildcard allocation replacement was incomplete';
  END IF;
  EXECUTE v_definition;
END $$;

REVOKE ALL ON FUNCTION public.create_order_atomic_v25(JSONB) FROM PUBLIC, anon, authenticated, service_role;

DO $$
DECLARE v_definition TEXT;
BEGIN
  SELECT pg_get_functiondef('public.create_order_atomic_v25(jsonb)'::regprocedure) INTO v_definition;
  IF position('ORDER BY pv.sort_order DESC, pv.variant_id DESC' IN v_definition) = 0 THEN
    RAISE EXCEPTION '044: bottom-up combo allocation is not installed';
  END IF;
END $$;

COMMENT ON FUNCTION public.create_order_atomic_v25(JSONB) IS
  'Migration 035 atomic order creation with migration 044 bottom-up wildcard allocation (sort_order DESC).';
