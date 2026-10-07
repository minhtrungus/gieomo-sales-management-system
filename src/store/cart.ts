"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { CartItem } from "@/types/database";
import { SITE_CONFIG } from "@/lib/constants";
import { getStoredProducts, getStoredCombos } from "@/lib/data/orderStore";

interface CartState {
  items: CartItem[];
  // Actions
  addItem: (item: CartItem) => void;
  removeItem: (productId: string, variantId: string | null) => void;
  updateQuantity: (productId: string, variantId: string | null, quantity: number) => void;
  clearCart: () => void;
  validateCart: () => { removedCount: number; updatedCount: number };
  getItemCount: () => number;
  getSubtotal: () => number;
}

// In-memory cache & debounced persistence to decouple UI responsiveness from synchronous disk I/O
let memoryCartCache: string | null = null;
let pendingWriteTimer: ReturnType<typeof setTimeout> | null = null;
const CART_STORAGE_KEY = "gieomo-cart";

const deferredCartStorage = {
  getItem: (name: string): string | null => {
    if (typeof window === "undefined") return null;
    if (memoryCartCache !== null) return memoryCartCache;
    try {
      const val = localStorage.getItem(name);
      memoryCartCache = val;
      return val;
    } catch {
      return null;
    }
  },
  setItem: (name: string, value: string): void => {
    memoryCartCache = value;
    if (typeof window === "undefined") return;

    if (pendingWriteTimer) clearTimeout(pendingWriteTimer);
    pendingWriteTimer = setTimeout(() => {
      try {
        localStorage.setItem(name, value);
      } catch (err) {
        console.warn("[CartStorage] Failed writing to localStorage:", err);
      }
      pendingWriteTimer = null;
    }, 150);
  },
  removeItem: (name: string): void => {
    memoryCartCache = null;
    if (pendingWriteTimer) {
      clearTimeout(pendingWriteTimer);
      pendingWriteTimer = null;
    }
    if (typeof window !== "undefined") {
      try {
        localStorage.removeItem(name);
      } catch {}
    }
  },
};

// Immediate flush on page reload or navigation to ensure ZERO data loss
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    if (pendingWriteTimer && memoryCartCache !== null) {
      clearTimeout(pendingWriteTimer);
      pendingWriteTimer = null;
      try {
        localStorage.setItem(CART_STORAGE_KEY, memoryCartCache);
      } catch {}
    }
  });
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],

      addItem: (item) => {
        set((state) => {
          const existing = state.items.find(
            (i) =>
              i.product_id === item.product_id &&
              i.variant_id === item.variant_id &&
              i.combo_id === item.combo_id
          );

          if (existing) {
            // Update quantity, capped at stock and max
            const newQty = Math.min(
              existing.quantity + item.quantity,
              existing.stock,
              SITE_CONFIG.maxCartQuantity
            );
            return {
              items: state.items.map((i) =>
                i.product_id === item.product_id &&
                i.variant_id === item.variant_id &&
                i.combo_id === item.combo_id
                  ? { ...i, quantity: newQty }
                  : i
              ),
            };
          }

          // Add new item
          return {
            items: [
              ...state.items,
              {
                ...item,
                quantity: Math.min(item.quantity, item.stock, SITE_CONFIG.maxCartQuantity),
              },
            ],
          };
        });
      },

      removeItem: (productId, variantId) => {
        set((state) => ({
          items: state.items.filter(
            (i) => !(i.product_id === productId && i.variant_id === variantId)
          ),
        }));
      },

      updateQuantity: (productId, variantId, quantity) => {
        if (quantity <= 0) {
          get().removeItem(productId, variantId);
          return;
        }

        set((state) => ({
          items: state.items.map((i) =>
            i.product_id === productId && i.variant_id === variantId
              ? {
                  ...i,
                  quantity: Math.min(quantity, i.stock, SITE_CONFIG.maxCartQuantity),
                }
              : i
          ),
        }));
      },

      clearCart: () => set({ items: [] }),

      validateCart: () => {
        if (typeof window === "undefined") return { removedCount: 0, updatedCount: 0 };
        try {
          const products = getStoredProducts();
          const combos = getStoredCombos();
          const currentItems = get().items;
          if (!currentItems || currentItems.length === 0) {
            return { removedCount: 0, updatedCount: 0 };
          }

          let removedCount = 0;
          let updatedCount = 0;
          const validItems: CartItem[] = [];

          for (const item of currentItems) {
            if (item.combo_id) {
              const combo = combos.find(
                (c) => c.combo_id === item.combo_id || c.slug === item.combo_id
              );
              // If combo was deleted or not active
              if (!combo || combo.status !== "active") {
                removedCount++;
                continue;
              }
              const comboStock = (combo as any).stock !== undefined ? Number((combo as any).stock) : 999;
              if (comboStock <= 0) {
                removedCount++;
                continue;
              }
              const newQty = Math.min(item.quantity, comboStock, SITE_CONFIG.maxCartQuantity);
              if (newQty !== item.quantity) {
                updatedCount++;
              }
              validItems.push({
                ...item,
                quantity: newQty,
                stock: comboStock,
                price: combo.price ?? item.price,
                product_name: combo.name || item.product_name,
                image_url: combo.thumbnail || item.image_url,
              });
            } else {
              // Regular product
              const product = products.find(
                (p) => p.product_id === item.product_id || p.slug === item.product_id
              );
              // If product was deleted or archived/draft
              if (!product || product.status !== "active") {
                removedCount++;
                continue;
              }

              if (item.variant_id) {
                const variant = product.variants?.find((v) => v.variant_id === item.variant_id);
                if (!variant) {
                  removedCount++;
                  continue;
                }
                const vStock =
                  variant.stock !== undefined
                    ? Number(variant.stock)
                    : Number(variant.stock_warehouse_1 || 0) + Number(variant.stock_warehouse_2 || 0);

                if (vStock <= 0) {
                  removedCount++;
                  continue;
                }

                const newQty = Math.min(item.quantity, vStock, SITE_CONFIG.maxCartQuantity);
                if (newQty !== item.quantity) {
                  updatedCount++;
                }
                validItems.push({
                  ...item,
                  quantity: newQty,
                  stock: vStock,
                  price: variant.price || product.price,
                  product_name: product.name,
                  variant_name: variant.name || item.variant_name,
                  image_url: variant.image_url || product.thumbnail || item.image_url,
                });
              } else {
                const pStock =
                  product.variants && product.variants.length > 0
                    ? product.variants.reduce((sum, v) => sum + (Number(v.stock) || 0), 0)
                    : (product as any).stock !== undefined
                    ? Number((product as any).stock)
                    : 999;

                if (pStock <= 0) {
                  removedCount++;
                  continue;
                }

                const newQty = Math.min(item.quantity, pStock, SITE_CONFIG.maxCartQuantity);
                if (newQty !== item.quantity) {
                  updatedCount++;
                }
                validItems.push({
                  ...item,
                  quantity: newQty,
                  stock: pStock,
                  price: product.price,
                  product_name: product.name,
                  image_url: product.thumbnail || item.image_url,
                });
              }
            }
          }

          if (removedCount > 0 || updatedCount > 0) {
            set({ items: validItems });
          }

          return { removedCount, updatedCount };
        } catch (e) {
          console.error("[validateCart] Error:", e);
          return { removedCount: 0, updatedCount: 0 };
        }
      },

      getItemCount: () => {
        return get().items.reduce((sum, item) => sum + item.quantity, 0);
      },

      getSubtotal: () => {
        return get().items.reduce(
          (sum, item) => sum + item.price * item.quantity,
          0
        );
      },
    }),
    {
      name: CART_STORAGE_KEY,
      storage: createJSONStorage(() => deferredCartStorage),
      // Only persist items, not computed values
      partialize: (state) => ({ items: state.items }),
      onRehydrateStorage: () => (state) => {
        state?.validateCart();
      },
    }
  )
);

// Global live synchronizer when products, combos, or storage change
if (typeof window !== "undefined") {
  const syncCart = () => {
    try {
      useCartStore.getState().validateCart();
    } catch {}
  };
  window.addEventListener("gieomo_products_updated", syncCart);
  window.addEventListener("gieomo_combos_updated", syncCart);
  window.addEventListener("gieomo_cart_updated", () => {
    try {
      const raw = localStorage.getItem("gieomo-cart");
      if (!raw) {
        useCartStore.getState().clearCart();
      } else {
        useCartStore.getState().validateCart();
      }
    } catch {}
  });
  window.addEventListener("storage", (e) => {
    if (
      e.key === "gieomo_products" ||
      e.key === "gieomo_combos" ||
      e.key === "gieomo-cart" ||
      e.key === "gieomo_cleaned_seed"
    ) {
      syncCart();
    }
  });
}
