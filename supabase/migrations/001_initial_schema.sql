-- ===========================
-- GIEO MƠ — DATABASE SCHEMA
-- Initial migration
-- ===========================

-- === ENUMS ===

CREATE TYPE order_status AS ENUM (
  'pending', 'confirmed', 'processing', 'ready_to_ship', 'shipping', 'completed', 'cancelled'
);

CREATE TYPE payment_status AS ENUM ('pending', 'paid', 'refunded', 'failed');

CREATE TYPE delivery_status AS ENUM (
  'not_ready', 'packed', 'handed_to_carrier', 'in_transit', 'out_for_delivery',
  'delivered', 'failed_delivery', 'returned', 'ready_for_pickup', 'picked_up'
);

CREATE TYPE delivery_type AS ENUM ('home_delivery', 'pickup_point', 'self_pickup');

CREATE TYPE payment_method AS ENUM ('cod', 'banking', 'momo');

CREATE TYPE order_source AS ENUM (
  'landing_page', 'member_referral', 'social_media', 'admin_manual', 'other'
);

CREATE TYPE product_status AS ENUM ('active', 'draft', 'archived');

CREATE TYPE discount_type AS ENUM ('percentage', 'fixed_amount');

CREATE TYPE member_role AS ENUM ('admin', 'btc_sale', 'delivery_staff');

CREATE TYPE member_status AS ENUM ('active', 'inactive');

CREATE TYPE sponsor_tier AS ENUM ('gold', 'silver', 'bronze', 'partner');

CREATE TYPE content_status AS ENUM ('active', 'inactive', 'scheduled');

CREATE TYPE shipping_method AS ENUM ('btc_delivery', 'partner_delivery', 'carrier', 'pickup');

CREATE TYPE shipment_status AS ENUM (
  'pending', 'packed', 'handed_to_carrier', 'in_transit', 'out_for_delivery',
  'delivered', 'failed_delivery', 'returning', 'returned_to_stock'
);

-- === TABLES ===

-- Members (BTC team)
CREATE TABLE members (
  member_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  role member_role NOT NULL DEFAULT 'btc_sale',
  status member_status NOT NULL DEFAULT 'active',
  referral_code TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Customers
CREATE TABLE customers (
  customer_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  default_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_customers_phone ON customers(phone);

-- Product Categories
CREATE TABLE product_categories (
  category_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  image_url TEXT,
  status product_status NOT NULL DEFAULT 'active',
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Products
CREATE TABLE products (
  product_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID REFERENCES product_categories(category_id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  short_description TEXT,
  description TEXT,
  price DECIMAL(12,0) NOT NULL CHECK (price >= 0),
  compare_at_price DECIMAL(12,0) CHECK (compare_at_price IS NULL OR compare_at_price >= 0),
  cost_price DECIMAL(12,0) CHECK (cost_price IS NULL OR cost_price >= 0),
  status product_status NOT NULL DEFAULT 'draft',
  featured BOOLEAN NOT NULL DEFAULT false,
  sort_order INT NOT NULL DEFAULT 0,
  weight_gram INT CHECK (weight_gram IS NULL OR weight_gram >= 0),
  thumbnail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_products_status ON products(status);
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_slug ON products(slug);
CREATE INDEX idx_products_featured ON products(featured) WHERE featured = true;

-- Product Variants
CREATE TABLE product_variants (
  variant_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(product_id) ON DELETE CASCADE,
  sku TEXT UNIQUE,
  name TEXT NOT NULL,
  price DECIMAL(12,0) CHECK (price IS NULL OR price >= 0),
  compare_at_price DECIMAL(12,0) CHECK (compare_at_price IS NULL OR compare_at_price >= 0),
  cost_price DECIMAL(12,0) CHECK (cost_price IS NULL OR cost_price >= 0),
  stock INT NOT NULL DEFAULT 0 CHECK (stock >= 0),
  weight_gram INT CHECK (weight_gram IS NULL OR weight_gram >= 0),
  status product_status NOT NULL DEFAULT 'active',
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_variants_product ON product_variants(product_id);

-- Product Media
CREATE TABLE product_media (
  media_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(product_id) ON DELETE CASCADE,
  variant_id UUID REFERENCES product_variants(variant_id) ON DELETE SET NULL,
  media_type TEXT NOT NULL DEFAULT 'image',
  url TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  alt_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_media_product ON product_media(product_id);

-- Combos
CREATE TABLE combos (
  combo_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  price DECIMAL(12,0) NOT NULL CHECK (price >= 0),
  image_url TEXT,
  description TEXT,
  status product_status NOT NULL DEFAULT 'draft',
  featured BOOLEAN NOT NULL DEFAULT false,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Combo Items
CREATE TABLE combo_items (
  combo_item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  combo_id UUID NOT NULL REFERENCES combos(combo_id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(product_id),
  variant_id UUID REFERENCES product_variants(variant_id),
  quantity INT NOT NULL DEFAULT 1 CHECK (quantity > 0)
);
CREATE INDEX idx_combo_items_combo ON combo_items(combo_id);

-- Vouchers
CREATE TABLE vouchers (
  voucher_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  discount_type discount_type NOT NULL,
  discount_value DECIMAL(12,0) NOT NULL CHECK (discount_value > 0),
  min_order_value DECIMAL(12,0) NOT NULL DEFAULT 0 CHECK (min_order_value >= 0),
  usage_limit INT CHECK (usage_limit IS NULL OR usage_limit > 0),
  times_used INT NOT NULL DEFAULT 0 CHECK (times_used >= 0),
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  status content_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_vouchers_code ON vouchers(code);

-- Pickup Points
CREATE TABLE pickup_points (
  pickup_point_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  contact_name TEXT,
  contact_phone TEXT,
  opening_hours TEXT,
  status content_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Delivery Zones
CREATE TABLE delivery_zones (
  zone_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  coverage_rule TEXT NOT NULL,
  base_fee DECIMAL(12,0) NOT NULL DEFAULT 0 CHECK (base_fee >= 0),
  free_shipping_threshold DECIMAL(12,0) CHECK (free_shipping_threshold IS NULL OR free_shipping_threshold >= 0),
  status content_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Orders
CREATE TABLE orders (
  order_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_code TEXT NOT NULL UNIQUE,
  customer_id UUID NOT NULL REFERENCES customers(customer_id),
  seller_id UUID REFERENCES members(member_id) ON DELETE SET NULL,
  source_type order_source NOT NULL DEFAULT 'landing_page',
  introducer_info TEXT,
  receiver_name TEXT NOT NULL,
  receiver_phone TEXT NOT NULL,
  delivery_type delivery_type NOT NULL,
  shipping_address_snapshot TEXT,
  pickup_point_id UUID REFERENCES pickup_points(pickup_point_id) ON DELETE SET NULL,
  pickup_point_snapshot JSONB,
  subtotal DECIMAL(12,0) NOT NULL CHECK (subtotal >= 0),
  shipping_fee DECIMAL(12,0) NOT NULL DEFAULT 0 CHECK (shipping_fee >= 0),
  voucher_id UUID REFERENCES vouchers(voucher_id) ON DELETE SET NULL,
  voucher_discount DECIMAL(12,0) NOT NULL DEFAULT 0 CHECK (voucher_discount >= 0),
  final_amount DECIMAL(12,0) NOT NULL CHECK (final_amount >= 0),
  order_status order_status NOT NULL DEFAULT 'pending',
  payment_status payment_status NOT NULL DEFAULT 'pending',
  delivery_status delivery_status NOT NULL DEFAULT 'not_ready',
  payment_method payment_method,
  created_by_member_id UUID REFERENCES members(member_id) ON DELETE SET NULL,
  assigned_shipper_id UUID REFERENCES members(member_id) ON DELETE SET NULL,
  cancel_reason TEXT,
  customer_note TEXT,
  internal_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_orders_code ON orders(order_code);
CREATE INDEX idx_orders_customer ON orders(customer_id);
CREATE INDEX idx_orders_status ON orders(order_status);
CREATE INDEX idx_orders_payment ON orders(payment_status);
CREATE INDEX idx_orders_seller ON orders(seller_id);
CREATE INDEX idx_orders_created ON orders(created_at DESC);

-- Order Items (with snapshots)
CREATE TABLE order_items (
  order_item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(product_id) ON DELETE SET NULL,
  variant_id UUID REFERENCES product_variants(variant_id) ON DELETE SET NULL,
  combo_id UUID REFERENCES combos(combo_id) ON DELETE SET NULL,
  item_name_snapshot TEXT NOT NULL,
  variant_name_snapshot TEXT,
  sku_snapshot TEXT,
  quantity INT NOT NULL CHECK (quantity > 0),
  unit_price DECIMAL(12,0) NOT NULL CHECK (unit_price >= 0),
  unit_cost_snapshot DECIMAL(12,0),
  item_discount DECIMAL(12,0) NOT NULL DEFAULT 0 CHECK (item_discount >= 0),
  subtotal DECIMAL(12,0) NOT NULL CHECK (subtotal >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_order_items_order ON order_items(order_id);

-- Payments
CREATE TABLE payments (
  payment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
  payment_method payment_method NOT NULL,
  amount DECIMAL(12,0) NOT NULL CHECK (amount >= 0),
  payment_status payment_status NOT NULL DEFAULT 'pending',
  transaction_code TEXT,
  confirmed_by UUID REFERENCES members(member_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_payments_order ON payments(order_id);

-- Shipments
CREATE TABLE shipments (
  shipment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
  carrier_name TEXT,
  shipping_method shipping_method NOT NULL DEFAULT 'btc_delivery',
  tracking_code TEXT,
  shipping_fee DECIMAL(12,0) NOT NULL DEFAULT 0 CHECK (shipping_fee >= 0),
  cod_amount DECIMAL(12,0) CHECK (cod_amount IS NULL OR cod_amount >= 0),
  package_weight_gram INT CHECK (package_weight_gram IS NULL OR package_weight_gram >= 0),
  status shipment_status NOT NULL DEFAULT 'pending',
  assigned_shipper_id UUID REFERENCES members(member_id) ON DELETE SET NULL,
  pickup_at TIMESTAMPTZ,
  shipped_at TIMESTAMPTZ,
  out_for_delivery_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  failed_reason TEXT,
  return_received_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_shipments_order ON shipments(order_id);
CREATE INDEX idx_shipments_status ON shipments(status);

-- Order Status History
CREATE TABLE order_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
  status_type TEXT NOT NULL CHECK (status_type IN ('order', 'payment', 'delivery')),
  from_status TEXT,
  to_status TEXT NOT NULL,
  note TEXT,
  changed_by_member_id UUID REFERENCES members(member_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_status_history_order ON order_status_history(order_id);

-- Sponsors
CREATE TABLE sponsors (
  sponsor_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  logo_url TEXT NOT NULL,
  tier sponsor_tier NOT NULL DEFAULT 'partner',
  website_url TEXT,
  description TEXT,
  display_order INT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- System Configs
CREATE TABLE system_configs (
  config_key TEXT PRIMARY KEY,
  config_value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES members(member_id) ON DELETE SET NULL
);

-- Media Library
CREATE TABLE media (
  media_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name TEXT NOT NULL,
  url TEXT NOT NULL,
  alt_text TEXT,
  mime_type TEXT NOT NULL,
  width INT,
  height INT,
  size INT NOT NULL DEFAULT 0,
  folder TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Audit Logs
CREATE TABLE audit_logs (
  log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_member_id UUID REFERENCES members(member_id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  before_data JSONB,
  after_data JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_actor ON audit_logs(actor_member_id);
CREATE INDEX idx_audit_created ON audit_logs(created_at DESC);

-- Workshops (Phase 5, structure only)
CREATE TABLE workshops (
  workshop_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  location TEXT,
  capacity INT CHECK (capacity IS NULL OR capacity > 0),
  price DECIMAL(12,0) DEFAULT 0 CHECK (price >= 0),
  status product_status NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE workshop_registrations (
  registration_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id UUID NOT NULL REFERENCES workshops(workshop_id) ON DELETE CASCADE,
  registrant_member_id UUID REFERENCES members(member_id) ON DELETE SET NULL,
  customer_id UUID REFERENCES customers(customer_id) ON DELETE SET NULL,
  attendee_name TEXT NOT NULL,
  attendee_phone TEXT NOT NULL,
  check_in_status TEXT DEFAULT 'registered',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- === ORDER CODE SEQUENCE ===
CREATE SEQUENCE order_code_seq START 1;

-- === AUTO-UPDATE updated_at ===
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables with updated_at
CREATE TRIGGER trg_members_updated BEFORE UPDATE ON members FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_customers_updated BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_categories_updated BEFORE UPDATE ON product_categories FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_products_updated BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_variants_updated BEFORE UPDATE ON product_variants FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_combos_updated BEFORE UPDATE ON combos FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_orders_updated BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_payments_updated BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_shipments_updated BEFORE UPDATE ON shipments FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_pickup_points_updated BEFORE UPDATE ON pickup_points FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_delivery_zones_updated BEFORE UPDATE ON delivery_zones FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_workshops_updated BEFORE UPDATE ON workshops FOR EACH ROW EXECUTE FUNCTION update_updated_at();
