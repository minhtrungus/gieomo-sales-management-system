/**
 * SEO & Google Search Keywords Library for Gieo Mơ — Mầm Mơ
 * Curated high-volume, relevant, and long-tail search terms to maximize Google indexation and ranking.
 */

export interface KeywordCategory {
  categoryName: string;
  description: string;
  keywords: string[];
}

export const SEO_CATEGORIZED_KEYWORDS: KeywordCategory[] = [
  {
    categoryName: "Thương hiệu & Dự án (Brand & Campaign)",
    description: "Các từ khóa định danh thương hiệu và tổ chức thiện nguyện",
    keywords: [
      "Gieo Mơ",
      "gieo mo",
      "gieomo",
      "gieomo.store",
      "Mầm Mơ",
      "mam mo",
      "Tổ chức thiện nguyện Mầm Mơ",
      "CLB Tình nguyện Mầm Mơ",
      "Dự án Gieo Mơ",
      "Tạp hoá Gieo Mơ",
      "Gieo Mơ Mầm Mơ",
      "Little Pieces Bigger Dreams",
      "Những mảnh ghép nhỏ nuôi dưỡng ước mơ lớn",
      "Vương quốc Mầm",
    ],
  },
  {
    categoryName: "Mục đích & Hoạt động Gây quỹ (Cause & Fundraiser)",
    description: "Các từ khóa người dùng tìm kiếm khi muốn ủng hộ từ thiện và gây quỹ",
    keywords: [
      "bán hàng gây quỹ",
      "gây quỹ thiện nguyện",
      "gây quỹ từ thiện",
      "mua đồ gây quỹ",
      "chiến dịch gây quỹ mầm mơ",
      "góp quỹ cho trẻ em",
      "ủng hộ trẻ em vùng cao",
      "thiện nguyện cộng đồng",
      "hoạt động tình nguyện tphcm",
      "dự án thiện nguyện sinh viên",
      "gây quỹ giáo dục",
      "mua hàng vì cộng đồng",
      "thương mại vì cộng đồng",
      "quà tặng ý nghĩa từ thiện",
      "tình nguyện viên mầm mơ",
    ],
  },
  {
    categoryName: "Sản phẩm Thủ công Handmade (Products & Craft)",
    description: "Các từ khóa sản phẩm cốt lõi mà khách hàng tìm kiếm trực tiếp",
    keywords: [
      "đồ handmade gây quỹ",
      "sản phẩm may vá thủ công",
      "túi pouch vải",
      "túi pouch handmade",
      "pouch mầm mơ",
      "túi vải canvas handmade",
      "túi tote mầm xanh",
      "ví sen đá",
      "ví vải handmade",
      "kẹp tóc vải vintage",
      "kẹp tóc handmade",
      "móc khóa vải thủ công",
      "móc khóa len mầm mơ",
      "bao lì xì vải thêu tay",
      "sổ tay mầm mơ",
      "phụ kiện may vá thủ công",
      "sản phẩm handmade độc bản",
      "quà lưu niệm may vá",
    ],
  },
  {
    categoryName: "Quà tặng & Combo Ý nghĩa (Gifts & Combos)",
    description: "Các từ khóa tìm kiếm combo quà tặng cho bạn bè, người thân, doanh nghiệp",
    keywords: [
      "combo quà tặng gây quỹ",
      "set quà tặng mầm mơ",
      "quà lưu niệm ý nghĩa",
      "quà tặng sinh nhật handmade",
      "set quà tặng doanh nghiệp gây quỹ",
      "quà tặng tình bạn ý nghĩa",
      "quà tặng thủ công bảo vệ môi trường",
      "quà tặng vintage dễ thương",
      "hộp quà may vá thiện nguyện",
    ],
  },
  {
    categoryName: "Ý định tìm kiếm & Từ khóa ngách (Search Intent & Long-tail)",
    description: "Cụm từ tìm kiếm chi tiết dẫn khách hàng mục tiêu truy cập website ngay lập tức",
    keywords: [
      "mua quà gây quỹ ở đâu",
      "shop bán đồ handmade gây quỹ uy tín",
      "mua đồ handmade ủng hộ trẻ em nghèo",
      "tạp hoá gây quỹ gieo mơ uy tín tphcm",
      "địa chỉ ủng hộ quỹ mầm mơ",
      "cách mua hàng gây quỹ gieo mơ",
      "ủng hộ dự án gieo mơ mầm mơ",
      "sản phẩm may vá gây quỹ thiện nguyện",
    ],
  },
];

/**
 * Flattened unique list of all SEO keywords for metadata tags
 */
export const SEO_KEYWORD_LIST: string[] = Array.from(
  new Set(SEO_CATEGORIZED_KEYWORDS.flatMap((c) => c.keywords))
);
