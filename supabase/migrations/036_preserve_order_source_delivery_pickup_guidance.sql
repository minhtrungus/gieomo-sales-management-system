-- ========================================================
-- GIEO MO — migration 036
-- Preserve order delivery/source semantics and pickup guidance.
--
-- Additive only:
--   * member_delivery is already a supported application delivery type.
--   * event_sale is already emitted by the authenticated POS workflow.
--   * location_guide is already present in the pickup-point TS/UI contract.
--
-- PostgreSQL does not permit a newly added enum value to be used safely in
-- the same transaction that adds it. The writer replacement therefore lives
-- in migration 037, after this migration has committed.
-- ========================================================

ALTER TYPE public.delivery_type ADD VALUE IF NOT EXISTS 'member_delivery';
ALTER TYPE public.order_source ADD VALUE IF NOT EXISTS 'event_sale';

ALTER TABLE public.pickup_points
  ADD COLUMN IF NOT EXISTS location_guide TEXT;

DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT count(*) INTO v_count
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'pickup_points'
     AND column_name = 'location_guide'
     AND data_type = 'text';
  IF v_count <> 1 THEN
    RAISE EXCEPTION '036: pickup_points.location_guide missing or wrong type';
  END IF;

END
$$;
