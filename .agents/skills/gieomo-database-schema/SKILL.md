---
name: gieomo-database-schema
description: Complete Supabase PostgreSQL database schema for Gieo Mơ, including all tables, relationships, enums, RLS policies, and data integrity rules. Use when creating migrations, writing queries, or modifying the data model.
---

# Gieo Mơ — Database Schema

## Core Principles
1. **Money**: Use `DECIMAL(12,0)` for VND (no decimals needed). NEVER use float.
2. **Stock**: Must NEVER go negative. Use `CHECK (stock >= 0)` and atomic operations.
3. **Snapshots**: Order items must snapshot product name, price, cost at time of purchase.
4. **3 Separate Statuses**: `order_status`, `payment_status`, `delivery_status` — never one enum for all.
5. **Idempotency**: Create order, confirm payment, cancel, restock must be idempotent.
6. **Audit**: All sensitive operations must be logged in `audit_logs`.

---

## Enums

```sql
-- Order
CREATE TYPE order_status AS ENUM ('pending', 'confirmed', 'processing', 'ready_to_ship', 'shipping', 'completed', 'cancelled');
CREATE TYPE payment_status AS ENUM ('pending', 'paid', 'refunded', 'failed');
CREATE TYPE delivery_status AS ENUM ('not_ready', 'packed', 'handed_to_carrier', 'in_transit', 'out_for_delivery', 'delivered', 'failed_delivery', 'returned', 'ready_for_pickup', 'picked_up');
CREATE TYPE delivery_type AS ENUM ('home_delivery', 'pickup_point', 'self_pickup');
CREATE TYPE payment_method AS ENUM ('cod', 'banking', 'momo');
CREATE TYPE order_source AS ENUM ('landing_page', 'member_referral', 'social_media', 'admin_manual', 'other');

-- Product
CREATE TYPE product_status AS ENUM ('active', 'draft', 'archived');
CREATE TYPE discount_type AS ENUM ('percentage', 'fixed_amount');

-- Member
CREATE TYPE member_role AS ENUM ('admin', 'btc_sale', 'delivery_staff');
CREATE TYPE member_status AS ENUM ('active', 'inactive');

-- Sponsor
CREATE TYPE sponsor_tier AS ENUM ('gold', 'silver', 'bronze', 'partner');

-- Content
CREATE TYPE content_status AS ENUM ('active', 'inactive', 'scheduled');

-- Shipping
CREATE TYPE shipping_method AS ENUM ('btc_delivery', 'partner_delivery', 'carrier', 'pickup');
CREATE TYPE shipment_status AS ENUM ('pending', 'packed', 'handed_to_carrier', 'in_transit', 'out_for_delivery', 'delivered', 'failed_delivery', 'returning', 'returned_to_stock');
```

---

## Tables

### members
```sql
CREATE TABLE members (
  member_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID UNIQUE REFERENCES auth.users(id),
  full_name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  role member_role NOT NULL DEFAULT 'btc_sale',
  status member_status NOT NULL DEFAULT 'active',
  referral_code TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### customers
```sql
CREATE TABLE customers (
  customer_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  default_address TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE UNIQUE INDEX idx_customers_phone ON customers(phone);
```

### product_categories
```sql
CREATE TABLE product_categories (
  category_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  image_url TEXT,
  status product_status NOT NULL DEFAULT 'active',
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### products
```sql
CREATE TABLE products (
  product_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID REFERENCES product_categories(category_id),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  short_description TEXT,
  description TEXT,
  price DECIMAL(12,0) NOT NULL,
  compare_at_price DECIMAL(12,0),
  cost_price DECIMAL(12,0),
  status product_status NOT NULL DEFAULT 'draft',
  featured BOOLEAN DEFAULT false,
  sort_order INT DEFAULT 0,
  weight_gram INT,
  thumbnail TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### product_variants
```sql
CREATE TABLE product_variants (
  variant_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(product_id) ON DELETE CASCADE,
  sku TEXT UNIQUE,
  name TEXT NOT NULL,
  price DECIMAL(12,0),
  compare_at_price DECIMAL(12,0),
  cost_price DECIMAL(12,0),
  stock INT NOT NULL DEFAULT 0 CHECK (stock >= 0),
  weight_gram INT,
  status product_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### product_media
```sql
CREATE TABLE product_media (
  media_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(product_id) ON DELETE CASCADE,
  variant_id UUID REFERENCES product_variants(variant_id),
  media_type TEXT NOT NULL DEFAULT 'image',
  url TEXT NOT NULL,
  sort_order INT DEFAULT 0,
  alt_text TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### combos, combo_items
```sql
CREATE TABLE combos (
  combo_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  price DECIMAL(12,0) NOT NULL,
  image_url TEXT,
  description TEXT,
  status product_status NOT NULL DEFAULT 'draft',
  featured BOOLEAN DEFAULT false,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE combo_items (
  combo_item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  combo_id UUID NOT NULL REFERENCES combos(combo_id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(product_id),
  variant_id UUID REFERENCES product_variants(variant_id),
  quantity INT NOT NULL DEFAULT 1 CHECK (quantity > 0)
);
```

### vouchers
```sql
CREATE TABLE vouchers (
  voucher_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  discount_type discount_type NOT NULL,
  discount_value DECIMAL(12,0) NOT NULL,
  min_order_value DECIMAL(12,0) DEFAULT 0,
  usage_limit INT,
  times_used INT DEFAULT 0,
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  status content_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### orders
```sql
CREATE TABLE orders (
  order_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_code TEXT NOT NULL UNIQUE,
  customer_id UUID NOT NULL REFERENCES customers(customer_id),
  seller_id UUID REFERENCES members(member_id),
  source_type order_source NOT NULL DEFAULT 'landing_page',
  introducer_info TEXT,
  receiver_name TEXT NOT NULL,
  receiver_phone TEXT NOT NULL,
  delivery_type delivery_type NOT NULL,
  shipping_address_snapshot TEXT,
  pickup_point_id UUID REFERENCES pickup_points(pickup_point_id),
  pickup_point_snapshot JSONB,
  subtotal DECIMAL(12,0) NOT NULL,
  shipping_fee DECIMAL(12,0) NOT NULL DEFAULT 0,
  voucher_id UUID REFERENCES vouchers(voucher_id),
  voucher_discount DECIMAL(12,0) NOT NULL DEFAULT 0,
  final_amount DECIMAL(12,0) NOT NULL,
  order_status order_status NOT NULL DEFAULT 'pending',
  payment_status payment_status NOT NULL DEFAULT 'pending',
  delivery_status delivery_status NOT NULL DEFAULT 'not_ready',
  payment_method payment_method,
  created_by_member_id UUID REFERENCES members(member_id),
  assigned_shipper_id UUID REFERENCES members(member_id),
  cancel_reason TEXT,
  customer_note TEXT,
  internal_note TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  confirmed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### order_items
```sql
CREATE TABLE order_items (
  order_item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(product_id),
  variant_id UUID REFERENCES product_variants(variant_id),
  combo_id UUID REFERENCES combos(combo_id),
  item_name_snapshot TEXT NOT NULL,
  variant_name_snapshot TEXT,
  sku_snapshot TEXT,
  quantity INT NOT NULL CHECK (quantity > 0),
  unit_price DECIMAL(12,0) NOT NULL,
  unit_cost_snapshot DECIMAL(12,0),
  item_discount DECIMAL(12,0) DEFAULT 0,
  subtotal DECIMAL(12,0) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### payments, shipments, delivery_zones, pickup_points
(See full schema in Master Instructions sections 10, 35-36)

### order_status_history
```sql
CREATE TABLE order_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(order_id),
  status_type TEXT NOT NULL, -- 'order', 'payment', 'delivery'
  from_status TEXT,
  to_status TEXT NOT NULL,
  note TEXT,
  changed_by_member_id UUID REFERENCES members(member_id),
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### audit_logs
```sql
CREATE TABLE audit_logs (
  log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_member_id UUID REFERENCES members(member_id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  before_data JSONB,
  after_data JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### system_configs, sponsors, media, workshops, workshop_registrations
(See full schema in Master Instructions sections 17-20)

---

## Key Constraints
- `product_variants.stock >= 0`
- `order_items.quantity > 0`
- `combo_items.quantity > 0`
- `orders.final_amount` must be recalculated server-side
- Order status transitions must follow defined state machine
- Stock deduction happens atomically at `confirmed` status
