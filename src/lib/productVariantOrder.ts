export interface SortableProductVariant {
  sort_order?: number | null;
}

function normalizedSortOrder(value: number | null | undefined): number {
  if (value === null || value === undefined) return Number.POSITIVE_INFINITY;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
}

/**
 * Canonical display/sale order for product variants.
 *
 * PostgreSQL stores the business order in `product_variants.sort_order`, but
 * nested PostgREST relations do not guarantee row order. Keep equal/missing
 * values stable so an older product does not reshuffle unexpectedly.
 */
export function sortProductVariants<T extends SortableProductVariant>(
  variants: readonly T[] | null | undefined
): T[] {
  return (variants || [])
    .map((variant, index) => ({ variant, index }))
    .sort((left, right) => {
      const byOrder =
        normalizedSortOrder(left.variant.sort_order) -
        normalizedSortOrder(right.variant.sort_order);
      return Number.isNaN(byOrder) || byOrder === 0 ? left.index - right.index : byOrder;
    })
    .map(({ variant }) => variant);
}

export function getFirstProductVariant<T extends SortableProductVariant>(
  variants: readonly T[] | null | undefined
): T | undefined {
  return sortProductVariants(variants)[0];
}

export function moveProductVariant<T extends SortableProductVariant>(
  variants: readonly T[],
  fromIndex: number,
  toIndex: number
): T[] {
  if (
    fromIndex < 0 ||
    fromIndex >= variants.length ||
    toIndex < 0 ||
    toIndex >= variants.length ||
    fromIndex === toIndex
  ) {
    return variants.map((variant, index) => ({ ...variant, sort_order: index + 1 }));
  }

  const moved = [...variants];
  const [target] = moved.splice(fromIndex, 1);
  moved.splice(toIndex, 0, target);
  return moved.map((variant, index) => ({ ...variant, sort_order: index + 1 }));
}
