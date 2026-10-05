import type { Product, ProductCategory, ProductVariant, Combo, Voucher, Order, OrderItem, Warehouse } from "@/types/database";

export const MOCK_WAREHOUSES: Warehouse[] = [];

export interface ExtendedProduct extends Product {
  category?: ProductCategory;
  variants?: ProductVariant[];
  images?: string[];
  stock?: number;
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

export const MOCK_CATEGORIES: ProductCategory[] = [];
export const MOCK_PRODUCTS: ExtendedProduct[] = [];
export const MOCK_COMBOS: ExtendedCombo[] = [];
export const MOCK_VOUCHERS: Voucher[] = [];
export const MOCK_ORDERS: Order[] = [];
export const MOCK_ORDER_ITEMS: OrderItem[] = [];

