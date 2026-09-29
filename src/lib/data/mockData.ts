import type { Product, ProductCategory, ProductVariant, Combo, Voucher, Order, OrderItem, Warehouse } from "@/types/database";

export const MOCK_WAREHOUSES: Warehouse[] = [];

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

export const MOCK_VOUCHERS: Voucher[] = [];

export const MOCK_ORDERS: Order[] = [];

export const MOCK_ORDER_ITEMS: OrderItem[] = [];
