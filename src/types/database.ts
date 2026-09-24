// ===========================
// GIEO MƠ — TypeScript Type Definitions
// Matches Supabase PostgreSQL schema
// ===========================

// === ENUMS ===

export type OrderStatus =
  | "pending"
  | "confirmed"
  | "processing"
  | "ready_to_ship"
  | "shipping"
  | "completed"
  | "cancelled";

export type PaymentStatus = "pending" | "paid" | "refunded" | "failed";

export type DeliveryStatus =
  | "not_ready"
  | "packed"
  | "handed_to_carrier"
  | "in_transit"
  | "out_for_delivery"
  | "delivered"
  | "failed_delivery"
  | "returned"
  | "ready_for_pickup"
  | "picked_up";

export type DeliveryType = "home_delivery" | "pickup_point" | "self_pickup" | "member_delivery";

export type PaymentMethod = "cod" | "banking" | "momo";

export type OrderSource =
  | "landing_page"
  | "member_referral"
  | "social_media"
  | "admin_manual"
  | "event_sale"
  | "other";

export type ProductStatus = "active" | "draft" | "archived";

export type DiscountType = "percentage" | "fixed_amount";

export type MemberRole = "admin" | "btc_sale" | "delivery_staff";

export type MemberStatus = "active" | "inactive";

export type SponsorTier = "gold" | "silver" | "bronze" | "partner";

export type ContentStatus = "active" | "inactive" | "scheduled";

export type ShippingMethod =
  | "btc_delivery"
  | "partner_delivery"
  | "carrier"
  | "pickup";

export type ShipmentStatus =
  | "pending"
  | "packed"
  | "handed_to_carrier"
  | "in_transit"
  | "out_for_delivery"
  | "delivered"
  | "failed_delivery"
  | "returning"
  | "returned_to_stock";

// === TABLE TYPES ===

export interface Member {
  member_id: string;
  auth_user_id: string | null;
  full_name: string;
  phone: string | null;
  email: string | null;
  role: MemberRole;
  status: MemberStatus;
  referral_code: string | null;
  created_at: string;
  updated_at: string;
}

export interface Customer {
  customer_id: string;
  full_name: string;
  phone: string;
  email: string | null;
  default_address: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProductCategory {
  category_id: string;
  name: string;
  slug: string;
  description: string | null;
  image_url?: string | null;
  status: ProductStatus;
  sort_order: number;
  created_at: string;
  updated_at?: string;
}

export interface Product {
  product_id: string;
  category_id: string | null;
  name: string;
  slug: string;
  short_description: string | null;
  description: string | null;
  price: number;
  compare_at_price: number | null;
  cost_price: number | null;
  status: ProductStatus;
  featured: boolean;
  sort_order: number;
  weight_gram: number | null;
  thumbnail: string | null;
  created_at: string;
  updated_at: string;
  // Joined data
  category?: ProductCategory;
  variants?: ProductVariant[];
  media?: ProductMedia[];
}

export interface Warehouse {
  warehouse_id: string;
  code: string;
  name: string;
  address: string;
  phone: string;
  manager_name: string;
  is_default?: boolean;
}

export interface ProductVariant {
  variant_id: string;
  product_id: string;
  sku: string | null;
  name: string;
  price: number | null;
  compare_at_price: number | null;
  cost_price: number | null;
  stock: number;
  stock_warehouse_1?: number; // Tồn Kho 1 (Trung Tâm - Q3)
  stock_warehouse_2?: number; // Tồn Kho 2 (Cơ Sở 2 - Thủ Đức)
  warehouse_stocks?: Record<string, number>; // Dynamic stock by warehouse_id
  sort_order?: number;
  weight_gram: number | null;
  status: ProductStatus;
  created_at: string;
  updated_at?: string;
}

export interface ProductMedia {
  media_id: string;
  product_id: string;
  variant_id: string | null;
  media_type: string;
  url: string;
  sort_order: number;
  alt_text: string | null;
  created_at: string;
}

export interface Combo {
  combo_id: string;
  name: string;
  slug: string;
  price: number;
  image_url?: string | null;
  description: string | null;
  status: ProductStatus;
  featured: boolean;
  sort_order: number;
  created_at: string;
  updated_at?: string;
  // Joined data
  items?: ComboItem[];
}

export interface ComboItem {
  combo_item_id?: string;
  combo_id?: string;
  product_id: string;
  variant_id?: string | null;
  quantity: number;
  // Joined
  product?: Product;
  variant?: ProductVariant;
}

export interface Voucher {
  voucher_id: string;
  code: string;
  discount_type: DiscountType;
  discount_value: number;
  min_order_value: number;
  usage_limit: number | null;
  usage_count?: number;
  times_used?: number;
  start_date?: string | null;
  end_date?: string | null;
  status: ContentStatus;
  visibility?: "public" | "private";
  created_at: string;
}

export interface Order {
  order_id: string;
  order_code: string;
  customer_id?: string;
  seller_id?: string | null;
  source_type?: OrderSource;
  introducer_info?: string | null;
  referral_code?: string | null;
  buyer_name?: string;
  buyer_phone?: string;
  buyer_email?: string;
  recipient_name?: string;
  recipient_phone?: string;
  receiver_name?: string;
  receiver_phone?: string;
  delivery_type: DeliveryType;
  address_detail?: string;
  district?: string;
  province?: string;
  shipping_address_snapshot?: string | null;
  pickup_point_id?: string | null;
  pickup_point_snapshot?: Record<string, unknown> | null;
  subtotal: number;
  shipping_fee: number;
  voucher_id?: string | null;
  voucher_code?: string | null;
  voucher_discount?: number;
  discount_amount?: number;
  final_amount: number;
  total_cost?: number;
  order_status: OrderStatus;
  payment_status: PaymentStatus;
  delivery_status: DeliveryStatus;
  payment_method: PaymentMethod | null;
  created_by_member_id?: string | null;
  assigned_shipper_id?: string | null;
  assigned_shipper_name?: string | null;
  cancel_reason?: string | null;
  customer_note?: string | null;
  internal_note?: string | null;
  warehouse_id?: string | null;
  warehouse_name?: string | null;
  created_at: string;
  confirmed_at?: string | null;
  completed_at?: string | null;
  cancelled_at?: string | null;
  updated_at?: string;
  // Joined
  customer?: Customer;
  seller?: Member;
  items?: OrderItem[];
  payments?: Payment[];
  shipment?: Shipment;
  status_history?: OrderStatusHistory[];
}

export interface OrderItem {
  order_item_id: string;
  order_id: string;
  product_id: string | null;
  variant_id: string | null;
  combo_id?: string | null;
  item_name_snapshot?: string;
  product_name_snapshot?: string;
  variant_name_snapshot?: string | null;
  price_snapshot?: number;
  cost_price_snapshot?: number;
  sku_snapshot?: string | null;
  quantity: number;
  unit_price?: number;
  unit_cost_snapshot?: number | null;
  item_discount?: number;
  subtotal: number;
  created_at: string;
}

export interface Payment {
  payment_id: string;
  order_id: string;
  payment_method: PaymentMethod;
  amount: number;
  payment_status: PaymentStatus;
  transaction_code: string | null;
  confirmed_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Shipment {
  shipment_id: string;
  order_id: string;
  carrier_name: string | null;
  shipping_method: ShippingMethod;
  tracking_code: string | null;
  shipping_fee: number;
  cod_amount: number | null;
  package_weight_gram: number | null;
  status: ShipmentStatus;
  assigned_shipper_id: string | null;
  pickup_at: string | null;
  shipped_at: string | null;
  out_for_delivery_at: string | null;
  delivered_at: string | null;
  failed_reason: string | null;
  return_received_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DeliveryZone {
  zone_id: string;
  name: string;
  coverage_rule: string;
  base_fee: number;
  free_shipping_threshold: number | null;
  status: ContentStatus;
  created_at: string;
  updated_at: string;
}

export interface PickupPoint {
  pickup_point_id: string;
  name: string;
  address: string;
  address_detail?: string;
  contact_name: string | null;
  contact_phone: string | null;
  opening_hours: string | null;
  location_guide?: string | null;
  status: ContentStatus;
  created_at?: string;
  updated_at?: string;
}

export interface OrderStatusHistory {
  id: string;
  order_id: string;
  status_type: "order" | "payment" | "delivery";
  from_status: string | null;
  to_status: string;
  note: string | null;
  changed_by_member_id: string | null;
  created_at: string;
}

export interface Sponsor {
  sponsor_id: string;
  name: string;
  logo_url: string;
  tier: SponsorTier;
  website_url: string | null;
  description: string | null;
  display_order: number;
  active: boolean;
}

export interface ContactMessage {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  message: string;
  status: "unread" | "read" | "replied";
  created_at: string;
}

export interface SystemConfig {
  config_key: string;
  config_value: string;
  updated_at: string;
  updated_by: string | null;
}

export interface Media {
  media_id: string;
  file_name: string;
  url: string;
  alt_text: string | null;
  mime_type: string;
  width: number | null;
  height: number | null;
  size: number;
  created_at: string;
}

export interface AuditLog {
  log_id: string;
  actor_member_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
  created_at: string;
  // Joined
  actor?: Member;
}

// === CART TYPES (Client-side) ===

export interface CartItem {
  product_id: string;
  variant_id: string | null;
  combo_id: string | null;
  name?: string;
  product_name?: string;
  variant_name: string | null;
  price: number;
  quantity: number;
  stock: number;
  thumbnail?: string | null;
  image_url?: string | null;
  slug?: string;
}

// === API / FORM TYPES ===

export interface CheckoutFormData {
  customer_name?: string;
  customer_phone?: string;
  customer_email?: string;
  buyer_name?: string;
  buyer_phone?: string;
  buyer_email?: string;
  receiver_name?: string;
  receiver_phone?: string;
  recipient_name?: string;
  recipient_phone?: string;
  delivery_type: DeliveryType;
  shipping_address?: string;
  address_detail?: string;
  district?: string;
  province?: string;
  pickup_point_id?: string;
  customer_note?: string;
  note?: string;
  voucher_code?: string;
  payment_method: PaymentMethod;
  referral_code?: string;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

