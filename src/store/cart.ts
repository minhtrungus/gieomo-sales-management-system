"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CartItem } from "@/types/database";
import { SITE_CONFIG } from "@/lib/constants";

interface CartState {
  items: CartItem[];
  // Actions
  addItem: (item: CartItem) => void;
  removeItem: (productId: string, variantId: string | null) => void;
  updateQuantity: (productId: string, variantId: string | null, quantity: number) => void;
  clearCart: () => void;
  getItemCount: () => number;
  getSubtotal: () => number;
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
      name: "gieomo-cart",
      // Only persist items, not computed values
      partialize: (state) => ({ items: state.items }),
    }
  )
);
