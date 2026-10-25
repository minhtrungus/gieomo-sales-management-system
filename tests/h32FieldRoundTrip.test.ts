import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const schemaMigration = readFileSync(
  new URL("../supabase/migrations/036_preserve_order_source_delivery_pickup_guidance.sql", import.meta.url),
  "utf8",
);
const writerMigration = readFileSync(
  new URL("../supabase/migrations/037_preserve_order_source_delivery_writer.sql", import.meta.url),
  "utf8",
);
const orderStore = readFileSync(new URL("../src/lib/data/orderStore.ts", import.meta.url), "utf8");
const pickupRoute = readFileSync(new URL("../src/app/api/pickup-points/route.ts", import.meta.url), "utf8");

test("migration 036 adds only the already-modeled enum values and pickup guidance", () => {
  assert.match(schemaMigration, /ALTER TYPE public\.delivery_type ADD VALUE IF NOT EXISTS 'member_delivery'/);
  assert.match(schemaMigration, /ALTER TYPE public\.order_source ADD VALUE IF NOT EXISTS 'event_sale'/);
  assert.match(
    schemaMigration,
    /ALTER TABLE public\.pickup_points[\s\S]*ADD COLUMN IF NOT EXISTS location_guide TEXT/,
  );
});

test("migration 037 uses the committed enum values without weakening RPC grants", () => {
  assert.match(
    writerMigration,
    /delivery_type = 'member_delivery'::public\.delivery_type/,
  );
  assert.match(writerMigration, /v_requested_source IN \('admin_manual', 'event_sale', 'other'\)/);
  assert.match(writerMigration, /RAISE EXCEPTION '037:privileged_source_requires_actor'/);
  assert.match(writerMigration, /SET source_type = v_requested_source::public\.order_source/);
  assert.match(
    writerMigration,
    /REVOKE ALL ON FUNCTION public\.create_order_atomic\(JSONB\) FROM PUBLIC, anon, authenticated/,
  );
  assert.match(
    writerMigration,
    /GRANT EXECUTE ON FUNCTION public\.create_order_atomic\(JSONB\) TO service_role/,
  );
});

test("browser order payload forwards source_type to the server-authoritative writer", () => {
  assert.match(orderStore, /source_type:\s*newOrder\.source_type \|\| null/);
});

test("pickup create and patch payloads round-trip location_guide and UUID PATCH uses id", () => {
  assert.match(pickupRoute, /location_guide:\s*body\.location_guide \|\| null/);
  assert.match(pickupRoute, /if \(isUuid\) \{\s*existingPointId = id;/);
  assert.match(
    pickupRoute,
    /if \(location_guide !== undefined\) payload\.location_guide = location_guide \|\| null/,
  );
});
