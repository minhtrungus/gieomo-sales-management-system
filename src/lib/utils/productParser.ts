export interface ParsedProductSections {
  overview: string;
  sizeGuide: string | null;
  materials: string | null;
  impactStory: string | null;
  careGuide: string | null;
  extraSpecs: Record<string, string>;
}

export interface SpecRow {
  label: string;
  value: string;
}

export function parseProductDescription(
  rawDescription?: string | null,
  specs?: Record<string, string> | null,
  impactStory?: string | null
): ParsedProductSections {
  const result: ParsedProductSections = {
    overview: "",
    sizeGuide: specs?.["Kích thước"] || specs?.["Kích thước & Quy cách"] || specs?.["Size"] || null,
    materials: specs?.["Chất liệu"] || specs?.["Chất liệu vải"] || specs?.["Vải"] || null,
    impactStory: impactStory || null,
    careGuide: specs?.["Bảo quản"] || specs?.["Hướng dẫn bảo quản"] || specs?.["Bảo quản & Vệ sinh"] || null,
    extraSpecs: { ...(specs || {}) },
  };

  // Remove already assigned specs from extraSpecs
  delete result.extraSpecs["Kích thước"];
  delete result.extraSpecs["Kích thước & Quy cách"];
  delete result.extraSpecs["Size"];
  delete result.extraSpecs["Chất liệu"];
  delete result.extraSpecs["Chất liệu vải"];
  delete result.extraSpecs["Vải"];
  delete result.extraSpecs["Bảo quản"];
  delete result.extraSpecs["Hướng dẫn bảo quản"];
  delete result.extraSpecs["Bảo quản & Vệ sinh"];

  if (!rawDescription) {
    return result;
  }

  // 1. Check for Markdown Headings (e.g., ## Kích thước, ## Chất liệu, ## Ý nghĩa, ## Thông số)
  if (rawDescription.includes("##") || rawDescription.includes("#")) {
    const lines = rawDescription.split("\n");
    let currentSection: "overview" | "sizeGuide" | "materials" | "impactStory" | "careGuide" | "extraSpecs" = "overview";
    const sectionBuffers: Record<string, string[]> = {
      overview: [],
      sizeGuide: [],
      materials: [],
      impactStory: [],
      careGuide: [],
      extraSpecs: [],
    };

    for (const line of lines) {
      const trimmed = line.trim();
      const lower = trimmed.toLowerCase();

      if (lower.startsWith("##") || lower.startsWith("#")) {
        const title = lower.replace(/^#+\s*/, "");
        if (title.includes("kích thước") || title.includes("size") || title.includes("bảng size")) {
          currentSection = "sizeGuide";
        } else if (title.includes("chất liệu") || title.includes("vải") || title.includes("thành phần")) {
          currentSection = "materials";
        } else if (title.includes("ý nghĩa") || title.includes("gây quỹ") || title.includes("câu chuyện")) {
          currentSection = "impactStory";
        } else if (title.includes("bảo quản") || title.includes("hướng dẫn giặt") || title.includes("vệ sinh")) {
          currentSection = "careGuide";
        } else if (title.includes("thông số") || title.includes("bổ sung") || title.includes("đặc tính")) {
          currentSection = "extraSpecs";
        } else {
          currentSection = "overview";
        }
      } else {
        sectionBuffers[currentSection].push(line);
      }
    }

    if (sectionBuffers.overview.join("\n").trim()) {
      result.overview = sectionBuffers.overview.join("\n").trim();
    }
    if (sectionBuffers.sizeGuide.join("\n").trim()) {
      result.sizeGuide = sectionBuffers.sizeGuide.join("\n").trim();
    }
    if (sectionBuffers.materials.join("\n").trim()) {
      result.materials = sectionBuffers.materials.join("\n").trim();
    }
    if (sectionBuffers.impactStory.join("\n").trim()) {
      result.impactStory = sectionBuffers.impactStory.join("\n").trim();
    }
    if (sectionBuffers.careGuide.join("\n").trim()) {
      result.careGuide = sectionBuffers.careGuide.join("\n").trim();
    }
    if (sectionBuffers.extraSpecs.length > 0) {
      for (const line of sectionBuffers.extraSpecs) {
        const parts = line.split(/[:：]/);
        if (parts.length >= 2) {
          const k = parts[0].replace(/^[-*•\s]+/, "").trim();
          const v = parts.slice(1).join(":").trim();
          if (k && v) {
            result.extraSpecs[k] = v;
          }
        }
      }
    }

    return result;
  }

  // 2. Check for Inline Key-Value Lines (e.g., "- Kích thước: 38x35cm", "Chất liệu: Canvas", "Ý nghĩa: ...")
  const lines = rawDescription.split("\n");
  const overviewLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    const lower = trimmed.toLowerCase();

    const sizeMatch = trimmed.match(/^(?:[-*•]\s*)?(?:kích thước|size)\s*[:：]\s*(.*)$/i);
    const materialMatch = trimmed.match(/^(?:[-*•]\s*)?(?:chất liệu|vải)\s*[:：]\s*(.*)$/i);
    const impactMatch = trimmed.match(/^(?:[-*•]\s*)?(?:ý nghĩa|mục đích gây quỹ)\s*[:：]\s*(.*)$/i);
    const careMatch = trimmed.match(/^(?:[-*•]\s*)?(?:bảo quản|vệ sinh|giặt)\s*[:：]\s*(.*)$/i);
    const genericSpecMatch = trimmed.match(/^(?:[-*•]\s*)?([A-Za-zÀ-ỹ0-9\s/&]{2,25})\s*[:：]\s*(.+)$/i);

    if (sizeMatch) {
      result.sizeGuide = (result.sizeGuide ? `${result.sizeGuide}\n` : "") + sizeMatch[1].trim();
    } else if (materialMatch) {
      result.materials = (result.materials ? `${result.materials}\n` : "") + materialMatch[1].trim();
    } else if (impactMatch) {
      result.impactStory = (result.impactStory ? `${result.impactStory}\n` : "") + impactMatch[1].trim();
    } else if (careMatch) {
      result.careGuide = (result.careGuide ? `${result.careGuide}\n` : "") + careMatch[1].trim();
    } else if (genericSpecMatch && !genericSpecMatch[1].toLowerCase().includes("lưu ý") && !genericSpecMatch[1].toLowerCase().includes("ghi chú")) {
      result.extraSpecs[genericSpecMatch[1].trim()] = genericSpecMatch[2].trim();
    } else {
      overviewLines.push(line);
    }
  }

  result.overview = overviewLines.join("\n").trim() || rawDescription;
  return result;
}

/**
 * Build professional Shopee-style specification table rows
 */
export function buildProductSpecRows(
  product: {
    category?: { name: string } | null;
    weight_gram?: number | null;
  },
  parsedInfo: ParsedProductSections,
  currentStock: number
): SpecRow[] {
  const rows: SpecRow[] = [];

  if (product.category?.name) {
    rows.push({ label: "Danh mục", value: product.category.name });
  }
  if (parsedInfo.sizeGuide) {
    rows.push({ label: "Kích thước & Quy cách", value: parsedInfo.sizeGuide });
  }
  if (parsedInfo.materials) {
    rows.push({ label: "Chất liệu", value: parsedInfo.materials });
  }
  // Extra specifications (e.g. Tính năng, Khóa kéo, Kỹ thuật, Phù hợp, v.v.)
  Object.entries(parsedInfo.extraSpecs).forEach(([key, val]) => {
    if (val && typeof val === "string" && val.trim()) {
      rows.push({ label: key, value: val.trim() });
    }
  });
  if (product.weight_gram) {
    rows.push({ label: "Trọng lượng", value: `${product.weight_gram}g` });
  }
  if (parsedInfo.careGuide) {
    rows.push({ label: "Hướng dẫn bảo quản", value: parsedInfo.careGuide });
  }
  rows.push({ label: "Xuất xứ & Chế tác", value: "Việt Nam (Thủ công Mầm Mơ)" });
  rows.push({
    label: "Tình trạng kho",
    value: currentStock > 0 ? `${currentStock} sản phẩm có sẵn` : "Tạm hết hàng",
  });
  rows.push({ label: "Gửi từ", value: "TP. Hồ Chí Minh" });

  return rows;
}

