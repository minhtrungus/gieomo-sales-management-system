import { getFirstProductVariant } from "./productVariantOrder";

interface ComboVariantStock {
  variant_id?: string | null;
  stock?: number | null;
  sort_order?: number | null;
}

interface ComboProductStock {
  product_id: string;
  variants?: ComboVariantStock[] | null;
}

interface ComboStockItem {
  product_id: string;
  variant_id?: string | null;
  quantity: number;
}

export function getDefaultComboVariantId(product?: ComboProductStock | null): string | null {
  return getFirstProductVariant(product?.variants)?.variant_id || null;
}

export function getComboVirtualStock(
  items: readonly ComboStockItem[],
  products: readonly ComboProductStock[]
): number {
  if (items.length === 0) return 0;

  const availablePerComponent = items.map((item) => {
    if (!item.variant_id) return 0;
    const product = products.find((candidate) => candidate.product_id === item.product_id);
    const variant = product?.variants?.find((candidate) => candidate.variant_id === item.variant_id);
    if (!variant) return 0;
    return Math.floor(Math.max(0, Number(variant.stock) || 0) / Math.max(1, Number(item.quantity) || 1));
  });

  return Math.max(0, Math.min(...availablePerComponent));
}
