/**
 * SKU Generator for Gieo Mơ products and variants.
 * Follows clean e-commerce convention: GM-[PROD_INITIALS]-[VARIANT_CODE]
 * Example:
 *  - "Túi Pouch Mầm Mơ" + "Mặc định" -> GM-TPMM-01
 *  - "Túi Pouch Mầm Mơ" + "Màu Hồng" -> GM-TPMM-HONG
 *  - "Túi Pouch Mầm Mơ" + "Phân loại 2" -> GM-TPMM-02
 */

export function generateProductCode(productName: string): string {
  if (!productName || !productName.trim()) {
    return "SP";
  }

  // Remove Vietnamese diacritics
  const clean = productName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .trim();

  const words = clean.split(/\s+/).filter(Boolean);

  if (words.length >= 2) {
    // Take first letter of each word (up to 5 letters)
    const initials = words.map((w) => w[0].toUpperCase()).join("").slice(0, 5);
    return initials || "SP";
  } else if (words.length === 1) {
    // If only one word, take first 4 characters
    return words[0].slice(0, 4).toUpperCase() || "SP";
  }

  return "SP";
}

export function generateVariantCode(variantName: string, index: number): string {
  const clean = (variantName || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .trim()
    .toUpperCase();

  // If default, empty, or generic "Phân loại X", use 2-digit zero-padded index: 01, 02, etc.
  if (
    !clean ||
    clean === "MAC DINH" ||
    clean.startsWith("PHAN LOAI") ||
    clean.startsWith("VARIANT")
  ) {
    return String(index + 1).padStart(2, "0");
  }

  // If specific name (e.g. "MAU HONG", "SIZE L", "XANH")
  const words = clean.split(/\s+/).filter(Boolean);
  // If starts with MAU or SIZE, take the descriptive part
  if (words.length > 1 && (words[0] === "MAU" || words[0] === "SIZE")) {
    return words.slice(1).join("-").slice(0, 8);
  }

  return words.join("-").slice(0, 8);
}

export function generateSku(
  productName: string,
  variantName: string,
  index: number
): string {
  const prodCode = generateProductCode(productName);
  const varCode = generateVariantCode(variantName, index);
  return `GM-${prodCode}-${varCode}`;
}
