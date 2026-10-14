export interface ValidatedOrderCreateLine {
  product_id?: string;
  variant_id?: string;
  combo_id?: string;
  quantity: number;
}

export type OrderCreateLinesValidation =
  | { ok: true; items: ValidatedOrderCreateLine[] }
  | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readOptionalIdentifier(
  item: Record<string, unknown>,
  field: "product_id" | "variant_id" | "combo_id",
  lineNumber: number
): { ok: true; value?: string } | { ok: false; error: string } {
  const value = item[field];
  if (value === undefined || value === null) return { ok: true };
  if (typeof value !== "string" || value.trim().length === 0) {
    return {
      ok: false,
      error: `Dòng sản phẩm ${lineNumber}: ${field} phải là chuỗi không rỗng khi được cung cấp.`,
    };
  }
  return { ok: true, value };
}

/**
 * Validates the legacy create-order line boundary without inventing the still
 * unapproved per-line, aggregate-quantity, or line-count maxima.
 */
export function validateOrderCreateLines(input: unknown): OrderCreateLinesValidation {
  if (!isRecord(input)) {
    return { ok: false, error: "Dữ liệu tạo đơn hàng phải là một JSON object." };
  }

  if (!Array.isArray(input.items) || input.items.length === 0) {
    return { ok: false, error: "Giỏ hàng không có sản phẩm nào để đặt." };
  }

  const validatedItems: ValidatedOrderCreateLine[] = [];

  for (let index = 0; index < input.items.length; index += 1) {
    const lineNumber = index + 1;
    const item = input.items[index];
    if (!isRecord(item)) {
      return { ok: false, error: `Dòng sản phẩm ${lineNumber} phải là một JSON object.` };
    }

    if (typeof item.quantity !== "number" || !Number.isSafeInteger(item.quantity) || item.quantity < 1) {
      return {
        ok: false,
        error: `Dòng sản phẩm ${lineNumber}: số lượng phải là số nguyên dương an toàn.`,
      };
    }

    const product = readOptionalIdentifier(item, "product_id", lineNumber);
    if (!product.ok) return product;
    const variant = readOptionalIdentifier(item, "variant_id", lineNumber);
    if (!variant.ok) return variant;
    const combo = readOptionalIdentifier(item, "combo_id", lineNumber);
    if (!combo.ok) return combo;

    const hasProduct = product.value !== undefined;
    const hasVariant = variant.value !== undefined;
    const hasCombo = combo.value !== undefined;
    const validProductLine = hasProduct && !hasVariant && !hasCombo;
    const validVariantLine = hasVariant && !hasCombo;
    const validComboLine = hasCombo && !hasProduct && !hasVariant;

    if (!validProductLine && !validVariantLine && !validComboLine) {
      return {
        ok: false,
        error:
          `Dòng sản phẩm ${lineNumber}: định danh không hợp lệ; dùng product_id, ` +
          "variant_id (có thể kèm product_id), hoặc combo_id riêng biệt.",
      };
    }

    validatedItems.push({
      ...(hasProduct ? { product_id: product.value } : {}),
      ...(hasVariant ? { variant_id: variant.value } : {}),
      ...(hasCombo ? { combo_id: combo.value } : {}),
      quantity: item.quantity,
    });
  }

  return { ok: true, items: validatedItems };
}
