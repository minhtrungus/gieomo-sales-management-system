import { getFirstProductVariant } from "./productVariantOrder";

interface ComboVariantStock {
  variant_id?: string | null;
  stock?: number | null;
  sort_order?: number | null;
  status?: string | null;
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

export type ComboAvailabilityState =
  | { status: "available"; sets: number }
  | { status: "out_of_stock"; sets: 0 }
  | { status: "unconfigured"; sets: 0; reason: string }
  | { status: "unknown"; sets: 0; reason: string };

export function getComboAvailabilityLabel(state: ComboAvailabilityState): string {
  if (state.status === "available") return `${state.sets} bộ khả dụng`;
  if (state.status === "out_of_stock") return "0 bộ khả dụng";
  if (state.status === "unconfigured") return "Chưa cấu hình phân loại";
  return "Không xác định tồn kho";
}

export function getComboAvailabilityStatus(
  items: readonly ComboStockItem[],
  products: readonly ComboProductStock[],
  isCatalogLoading = false
): ComboAvailabilityState {
  if (isCatalogLoading && products.length === 0) {
    return { status: "unknown", sets: 0, reason: "Đang kiểm tra tồn kho..." };
  }

  if (items.length === 0) {
    return { status: "unconfigured", sets: 0, reason: "Chưa cấu hình sản phẩm thành phần" };
  }

  const requirements = new Map<string, {
    wildcardQuantity: number;
    variantQuantities: Map<string, number>;
  }>();

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      return { status: "unknown", sets: 0, reason: `Số lượng thành phần #${idx + 1} không hợp lệ` };
    }
    const entry = requirements.get(item.product_id) || {
      wildcardQuantity: 0,
      variantQuantities: new Map<string, number>(),
    };
    if (item.variant_id) {
      entry.variantQuantities.set(
        item.variant_id,
        (entry.variantQuantities.get(item.variant_id) || 0) + item.quantity,
      );
    } else {
      entry.wildcardQuantity += item.quantity;
    }
    requirements.set(item.product_id, entry);
  }

  const componentLimits: number[] = [];
  for (const [productId, requirement] of requirements) {
    const product = products.find((candidate) => candidate.product_id === productId);
    if (!product) {
      if (isCatalogLoading) {
        return { status: "unknown", sets: 0, reason: "Đang tải dữ liệu sản phẩm..." };
      }
      return { status: "unknown", sets: 0, reason: `Không tìm thấy thông tin sản phẩm ${productId}` };
    }

    const eligibleVariants = (product.variants || []).filter(
      (variant) => variant.status === undefined || variant.status === null || variant.status === "active",
    );
    if (eligibleVariants.length === 0) {
      return { status: "unknown", sets: 0, reason: `Sản phẩm ${productId} không có phân loại hợp lệ` };
    }

    const stockByVariant = new Map<string, number>();
    for (const variant of eligibleVariants) {
      if (!variant.variant_id || variant.stock === null || variant.stock === undefined ||
          !Number.isFinite(Number(variant.stock)) || Number(variant.stock) < 0) {
        return { status: "unknown", sets: 0, reason: `Tồn kho phân loại của sản phẩm ${productId} không hợp lệ` };
      }
      stockByVariant.set(variant.variant_id, Number(variant.stock));
    }

    for (const variantId of requirement.variantQuantities.keys()) {
      if (!stockByVariant.has(variantId)) {
        return { status: "unknown", sets: 0, reason: `Phân loại ${variantId} không còn hợp lệ cho sản phẩm ${productId}` };
      }
    }

    const totalDemand = requirement.wildcardQuantity +
      [...requirement.variantQuantities.values()].reduce((sum, quantity) => sum + quantity, 0);
    const totalStock = [...stockByVariant.values()].reduce((sum, stock) => sum + stock, 0);
    let upperBound = Math.floor(totalStock / totalDemand);
    for (const [variantId, quantity] of requirement.variantQuantities) {
      upperBound = Math.min(upperBound, Math.floor((stockByVariant.get(variantId) || 0) / quantity));
    }

    const canBuild = (sets: number) => {
      let remaining = 0;
      for (const [variantId, stock] of stockByVariant) {
        const reserved = sets * (requirement.variantQuantities.get(variantId) || 0);
        if (reserved > stock) return false;
        remaining += stock - reserved;
      }
      return remaining >= sets * requirement.wildcardQuantity;
    };

    let low = 0;
    let high = upperBound;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if (canBuild(middle)) low = middle;
      else high = middle - 1;
    }
    componentLimits.push(low);
  }

  const minSets = Math.min(...componentLimits);
  if (minSets <= 0) {
    return { status: "out_of_stock", sets: 0 };
  }

  return { status: "available", sets: minSets };
}

export function getComboVirtualStock(
  items: readonly ComboStockItem[],
  products: readonly ComboProductStock[]
): number {
  const result = getComboAvailabilityStatus(items, products, false);
  return result.sets;
}
