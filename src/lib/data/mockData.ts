import type { Product, ProductCategory, ProductVariant, Combo, Voucher, Order, OrderItem, Warehouse } from "@/types/database";

export const MOCK_WAREHOUSES: Warehouse[] = [
  {
    warehouse_id: "wh-1",
    code: "KHO-Q3",
    name: "Kho Trung Tâm (Quận 3, TP.HCM)",
    address: "Trụ sở Mầm Mơ, 128 Nguyễn Đình Chiểu, Phường Võ Thị Sáu, Quận 3, TP.HCM",
    phone: "0901234567",
    manager_name: "Mai Lan (Trưởng Kho)",
    is_default: true,
  },
  {
    warehouse_id: "wh-2",
    code: "KHO-THUDUC",
    name: "Kho Cơ Sở 2 (Thủ Đức, TP.HCM)",
    address: "Khu B KTX ĐHQG TP.HCM, Phường Linh Trung, TP. Thủ Đức",
    phone: "0912345678",
    manager_name: "Thế Vinh (Phụ trách cơ sở 2)",
    is_default: false,
  },
];

export interface ExtendedProduct extends Product {
  category?: ProductCategory;
  variants?: ProductVariant[];
  images?: string[];
  badge?: "new" | "best_seller" | "limited" | "out_of_stock";
  badge_label?: string;
  specs?: Record<string, string>;
  impact_story?: string;
}

export interface ExtendedCombo extends Omit<Combo, "items"> {
  items?: Array<{
    product: ExtendedProduct;
    quantity: number;
  }>;
  images?: string[];
  thumbnail?: string;
}

export const MOCK_CATEGORIES: ProductCategory[] = [
  {
    category_id: "cat-1",
    name: "Túi & Pouch",
    slug: "tui-pouch",
    description: "Túi vải, pouch, ví nhỏ handmade được may tay tỉ mỉ",
    status: "active",
    sort_order: 1,
    created_at: new Date().toISOString(),
  },
  {
    category_id: "cat-2",
    name: "Phụ kiện may vá",
    slug: "phu-kien-may-va",
    description: "Các sản phẩm handmade độc đáo từ vải, chỉ, nút áo",
    status: "active",
    sort_order: 2,
    created_at: new Date().toISOString(),
  },
  {
    category_id: "cat-3",
    name: "Quà tặng & Souvenir",
    slug: "qua-tang",
    description: "Set quà tặng ý nghĩa từ Gieo Mơ và Mầm Mơ",
    status: "active",
    sort_order: 3,
    created_at: new Date().toISOString(),
  },
];

export const MOCK_PRODUCTS: ExtendedProduct[] = [];

export const MOCK_COMBOS: ExtendedCombo[] = [];

export const MOCK_VOUCHERS: Voucher[] = [
  {
    voucher_id: "v-1",
    code: "GIEOMO10",
    discount_type: "percentage",
    discount_value: 10,
    min_order_value: 100000,
    min_items_count: 0,
    usage_limit: 50,
    usage_count: 12,
    status: "active",
    visibility: "public",
    created_at: new Date().toISOString(),
  },
  {
    voucher_id: "v-2",
    code: "WELCOME20K",
    discount_type: "fixed_amount",
    discount_value: 20000,
    min_order_value: 150000,
    min_items_count: 0,
    usage_limit: 100,
    usage_count: 45,
    status: "active",
    visibility: "public",
    created_at: new Date().toISOString(),
  },
  {
    voucher_id: "v-3",
    code: "FREESHIPMAM",
    discount_type: "freeship",
    discount_value: 15000,
    min_order_value: 120000,
    min_items_count: 0,
    usage_limit: 200,
    usage_count: 30,
    status: "active",
    visibility: "public",
    created_at: new Date().toISOString(),
  },
  {
    voucher_id: "v-4",
    code: "MUA2MON25K",
    discount_type: "fixed_amount",
    discount_value: 25000,
    min_order_value: 0,
    min_items_count: 2,
    usage_limit: 100,
    usage_count: 18,
    status: "active",
    visibility: "public",
    created_at: new Date().toISOString(),
  },
  {
    voucher_id: "v-5",
    code: "TRIANMAMMO",
    discount_type: "percentage",
    discount_value: 15,
    min_order_value: 80000,
    min_items_count: 0,
    is_gift_voucher: true,
    gift_min_order_value: 100000,
    usage_limit: 500,
    usage_count: 5,
    status: "active",
    visibility: "private",
    created_at: new Date().toISOString(),
  },
];

export const MOCK_ORDERS: Order[] = [];

export const MOCK_ORDER_ITEMS: OrderItem[] = [];
