export interface ParsedProductSections {
  overview: string;
  sizeGuide: string | null;
  materials: string | null;
  impactStory: string | null;
  careGuide: string | null;
  extraSpecs: Record<string, string>;
}

export function parseProductDescription(
  rawDescription?: string | null,
  specs?: Record<string, string> | null,
  impactStory?: string | null
): ParsedProductSections {
  const result: ParsedProductSections = {
    overview: "",
    sizeGuide: specs?.["Kích thước"] || specs?.["Size"] || null,
    materials: specs?.["Chất liệu"] || specs?.["Vải"] || null,
    impactStory: impactStory || null,
    careGuide: specs?.["Bảo quản"] || null,
    extraSpecs: { ...(specs || {}) },
  };

  // Remove already assigned specs from extraSpecs
  delete result.extraSpecs["Kích thước"];
  delete result.extraSpecs["Size"];
  delete result.extraSpecs["Chất liệu"];
  delete result.extraSpecs["Vải"];
  delete result.extraSpecs["Bảo quản"];

  if (!rawDescription) {
    return result;
  }

  // 1. Check for Markdown Headings (e.g., ## Kích thước, ## Chất liệu, ## Ý nghĩa)
  if (rawDescription.includes("##") || rawDescription.includes("#")) {
    const lines = rawDescription.split("\n");
    let currentSection: "overview" | "sizeGuide" | "materials" | "impactStory" | "careGuide" = "overview";
    const sectionBuffers: Record<string, string[]> = {
      overview: [],
      sizeGuide: [],
      materials: [],
      impactStory: [],
      careGuide: [],
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

    if (sizeMatch) {
      result.sizeGuide = (result.sizeGuide ? `${result.sizeGuide}\n` : "") + sizeMatch[1].trim();
    } else if (materialMatch) {
      result.materials = (result.materials ? `${result.materials}\n` : "") + materialMatch[1].trim();
    } else if (impactMatch) {
      result.impactStory = (result.impactStory ? `${result.impactStory}\n` : "") + impactMatch[1].trim();
    } else if (careMatch) {
      result.careGuide = (result.careGuide ? `${result.careGuide}\n` : "") + careMatch[1].trim();
    } else {
      overviewLines.push(line);
    }
  }

  result.overview = overviewLines.join("\n").trim() || rawDescription;
  return result;
}
