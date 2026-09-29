import type { Product, ProductCategory, ProductVariant, Combo, Voucher, Order, OrderItem, Warehouse } from "@/types/database";

export const MOCK_WAREHOUSES: Warehouse[] = [
  {
    warehouse_id: "wh-1",
    code: "KHO-Q3",
    name: "Kho Trung Tâm (Quận 3, TP.HCM)",
    address: "Trụ sở Mầm Mơ, 128 Nguyễn Đình Chiểu, Phường Võ Thị Sáu, Quận 3, TP.HCM",
    phone: "0901234567",
    manager_name: "Mai Lan (Trưởng Kho)",
    is_default: true,
  },
  {
    warehouse_id: "wh-2",
    code: "KHO-THUDUC",
    name: "Kho Cơ Sở 2 (Thủ Đức, TP.HCM)",
    address: "Khu B KTX ĐHQG TP.HCM, Phường Linh Trung, TP. Thủ Đức",
    phone: "0912345678",
    manager_name: "Thế Vinh (Phụ trách cơ sở 2)",
    is_default: false,
  },
];

export interface ExtendedProduct extends Product {
  category?: ProductCategory;
  variants?: ProductVariant[];
  images?: string[];
  badge?: "new" | "best_seller" | "limited" | "out_of_stock";
  badge_label?: string;
  specs?: Record<string, string>;
  impact_story?: string;
}

export interface ExtendedCombo extends Omit<Combo, "items"> {
  items?: Array<{
    product: ExtendedProduct;
    quantity: number;
  }>;
  images?: string[];
  thumbnail?: string;
}

export const MOCK_CATEGORIES: ProductCategory[] = [
  {
    category_id: "cat-1",
    name: "Túi & Pouch",
    slug: "tui-pouch",
    description: "Túi vải, pouch, ví nhỏ handmade được may tay tỉ mỉ",
    status: "active",
    sort_order: 1,
    created_at: new Date().toISOString(),
  },
  {
    category_id: "cat-2",
    name: "Phụ kiện may vá",
    slug: "phu-kien-may-va",
    description: "Các sản phẩm handmade độc đáo từ vải, chỉ, nút áo",
    status: "active",
    sort_order: 2,
    created_at: new Date().toISOString(),
  },
  {
    category_id: "cat-3",
    name: "Quà tặng & Souvenir",
    slug: "qua-tang",
    description: "Set quà tặng ý nghĩa từ Gieo Mơ và Mầm Mơ",
    status: "active",
    sort_order: 3,
    created_at: new Date().toISOString(),
  },
];

const defaultVariantFields = {
  price: null,
  compare_at_price: null,
  cost_price: null,
  weight_gram: null,
  status: "active" as const,
};

export const MOCK_PRODUCTS: ExtendedProduct[] = [
  {
    product_id: "prod-1",
    name: "Pouch Mầm Mơ",
    slug: "pouch-mam-mo",
    short_description: "Pouch vải handmade với hoa văn đặc trưng Mầm Mơ",
    description: `Chiếc pouch nhỏ xinh được may tay tỉ mỉ bởi các tình nguyện viên Mầm Mơ. 
Mỗi chiếc pouch mang một câu chuyện riêng, một giấc mơ nhỏ được gieo.
Kích thước vừa vặn để đựng mỹ phẩm, dụng cụ học tập hoặc các vật dụng cá nhân nhỏ gọn.`,
    price: 85000,
    compare_at_price: 100000,
    cost_price: 35000,
    status: "active",
    featured: true,
    sort_order: 1,
    weight_gram: 100,
    thumbnail: "/images/products/pounch_1.png",
    category_id: "cat-1",
    category: MOCK_CATEGORIES[0],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    badge: "best_seller",
    badge_label: "Bán chạy",
    images: [
      "/images/products/pounch_1.png",
      "/images/products/pounch_2.jpg",
    ],
    variants: [
      {
        ...defaultVariantFields,
        variant_id: "var-1-1",
        product_id: "prod-1",
        sku: "GM-POUCH-PINK",
        name: "Màu hồng pastel",
        stock: 20,
        sort_order: 1,
        created_at: new Date().toISOString(),
      },
      {
        ...defaultVariantFields,
        variant_id: "var-1-2",
        product_id: "prod-1",
        sku: "GM-POUCH-BLUE",
        name: "Màu xanh baby blue",
        stock: 15,
        sort_order: 2,
        created_at: new Date().toISOString(),
      },
      {
        ...defaultVariantFields,
        variant_id: "var-1-3",
        product_id: "prod-1",
        sku: "GM-POUCH-GREEN",
        name: "Màu xanh bơ (Soft Green)",
        stock: 10,
        sort_order: 3,
        created_at: new Date().toISOString(),
      },
    ],
    specs: {
      "Chất liệu": "Vải Linen cao cấp + lót thô lụa mềm mại",
      "Kích thước": "18cm x 12cm x 5cm",
      "Khóa kéo": "Khóa kéo kim loại YKK êm mượt",
      "Kỹ thuật": "May thủ công 100% kết hợp thêu viền",
    },
    impact_story: "100% lợi nhuận từ chiếc Pouch này sẽ đóng góp vào quỹ sách vở và dụng cụ học tập cho trẻ em vùng cao trong chiến dịch gây quỹ Mầm Mơ.",
  },
  {
    product_id: "prod-2",
    name: "Kẹp tóc Nút Áo Mầm",
    slug: "kep-toc-nut-ao",
    short_description: "Kẹp tóc hình nút áo — signature accessory của Mầm",
    description: `Kẹp tóc handmade hình nút áo, chi tiết nhận diện đặc trưng của nhân vật Mầm.
Sản phẩm được khâu tay thủ công từ vải nỉ và hạt nút gỗ tự nhiên, mang phong cách vô cùng đáng yêu và ấm áp.`,
    price: 45000,
    compare_at_price: null,
    cost_price: 15000,
    status: "active",
    featured: true,
    sort_order: 2,
    weight_gram: 20,
    thumbnail: "/images/products/kep-toc-1.jpg",
    category_id: "cat-2",
    category: MOCK_CATEGORIES[1],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    badge: "new",
    badge_label: "Mới",
    images: [
      "/images/products/kep-toc-1.jpg",
    ],
    variants: [
      {
        ...defaultVariantFields,
        variant_id: "var-2-1",
        product_id: "prod-2",
        sku: "GM-KEPTOC-YELLOW",
        name: "Nút vàng Butter",
        stock: 50,
        sort_order: 1,
        created_at: new Date().toISOString(),
      },
      {
        ...defaultVariantFields,
        variant_id: "var-2-2",
        product_id: "prod-2",
        sku: "GM-KEPTOC-PINK",
        name: "Nút hồng Soft Pink",
        stock: 30,
        sort_order: 2,
        created_at: new Date().toISOString(),
      },
    ],
    specs: {
      "Chất liệu": "Vải nỉ wool + xương kẹp mạ vàng không gỉ",
      "Kích thước": "Đường kính 4.5cm",
      "Phù hợp": "Mọi lứa tuổi, dùng kẹp mái hoặc trang trí túi sách",
    },
    impact_story: "Mỗi chiếc kẹp tóc giúp trao gửi 1 bữa ăn trưa dinh dưỡng cho em nhỏ.",
  },
  {
    product_id: "prod-3",
    name: "Túi Tote Canvas Gieo Mơ",
    slug: "tui-tote-gieo-mo",
    short_description: "Túi tote vải canvas in hình Mầm và thông điệp gây quỹ",
    description: `Túi tote canvas chất lượng cao 100% cotton, in hình Mầm và slogan "Little Pieces, Bigger Dreams".
Thân thiện môi trường, quai đeo chắc chắn, chứa vừa laptop 15.6 inch và tập sách học tập.`,
    price: 120000,
    compare_at_price: 150000,
    cost_price: 50000,
    status: "active",
    featured: true,
    sort_order: 3,
    weight_gram: 250,
    thumbnail: "/images/products/tote-gieo-mo-1.jpg",
    category_id: "cat-1",
    category: MOCK_CATEGORIES[0],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    badge: "best_seller",
    badge_label: "Bán chạy",
    images: [
      "/images/products/tote-gieo-mo-1.jpg",
    ],
    variants: [
      {
        ...defaultVariantFields,
        variant_id: "var-3-1",
        product_id: "prod-3",
        sku: "GM-TOTE-NATURAL",
        name: "Màu Canvas Kem (Natural)",
        stock: 25,
        sort_order: 1,
        created_at: new Date().toISOString(),
      },
      {
        ...defaultVariantFields,
        variant_id: "var-3-2",
        product_id: "prod-3",
        sku: "GM-TOTE-BLACK",
        name: "Màu Đen Đêm (Midnight Black)",
        stock: 20,
        sort_order: 2,
        created_at: new Date().toISOString(),
      },
    ],
    specs: {
      "Chất liệu": "Vải Canvas 12oz dày dặn, đứng form",
      "Kích thước": "35cm x 40cm, quai dài 28cm",
      "Tính năng": "Có ngăn phụ nhỏ kéo khóa bên trong",
    },
    impact_story: "Góp phần trồng 1 cây xanh và xây dựng không gian xanh cho điểm trường miền núi.",
  },
  {
    product_id: "prod-4",
    name: "Bộ Kim Chỉ Mầm Mơ Mini",
    slug: "bo-kim-chi-mam-mo",
    short_description: "Bộ kim chỉ mini với packaging đặc biệt từ Gieo Mơ",
    description: `Bộ kim chỉ nhỏ gọn, đầy đủ 12 cuộn chỉ nhiều màu sắc, kim khâu, xỏ chỉ và kéo cắt chỉ mini.
Đóng gói trong hộp thiếc xinh xắn thiết kế riêng mang thương hiệu Mầm Mơ. Lý tưởng cho người mới bắt đầu may vá hoặc đem theo khi đi du lịch.`,
    price: 65000,
    compare_at_price: null,
    cost_price: 25000,
    status: "active",
    featured: false,
    sort_order: 4,
    weight_gram: 150,
    thumbnail: "/images/products/bo-kim-chi-1.jpg",
    category_id: "cat-2",
    category: MOCK_CATEGORIES[1],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    images: [
      "/images/products/bo-kim-chi-1.jpg",
    ],
    variants: [
      {
        ...defaultVariantFields,
        variant_id: "var-4-1",
        product_id: "prod-4",
        sku: "GM-KIMCHI-01",
        name: "Hộp thiếc Mint Green",
        stock: 30,
        sort_order: 1,
        created_at: new Date().toISOString(),
      },
    ],
    specs: {
      "Bao gồm": "12 cuộn chỉ, 10 kim khâu, 1 kéo mini, 1 xỏ chỉ, 4 cúc áo",
      "Hộp đựng": "Hộp thiếc chống gỉ cao cấp 9cm x 6cm",
    },
    impact_story: "Gieo mầm đam mê thủ công handmade và ủng hộ kinh phí hoạt động cho CLB Mầm Mơ.",
  },
  {
    product_id: "prod-5",
    name: "Sticker Pack Mầm Mơ (12 chiếc)",
    slug: "sticker-pack-mam-mo",
    short_description: "Bộ sticker chống nước dễ thương với các hình ảnh Mầm",
    description: `Bộ 12 sticker vinyl chống nước, chống bay màu với hình ảnh Mầm, cuộn chỉ, nút áo, pouch và các chi tiết may vá đáng yêu.
Thích hợp dán trang trí laptop, bình nước, mũ bảo hiểm, sổ tay planner.`,
    price: 35000,
    compare_at_price: null,
    cost_price: 10000,
    status: "active",
    featured: false,
    sort_order: 5,
    weight_gram: 30,
    thumbnail: "/images/products/sticker-pack-1.jpg",
    category_id: "cat-3",
    category: MOCK_CATEGORIES[2],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    badge: "limited",
    badge_label: "Giới hạn",
    images: [
      "/images/products/sticker-pack-1.jpg",
    ],
    variants: [
      {
        ...defaultVariantFields,
        variant_id: "var-5-1",
        product_id: "prod-5",
        sku: "GM-STICKER-01",
        name: "Set 12 sticker",
        stock: 100,
        sort_order: 1,
        created_at: new Date().toISOString(),
      },
    ],
    specs: {
      "Chất liệu": "Vinyl cán màng mờ PVC chống nước 100%",
      "Kích thước": "3cm - 6cm mỗi sticker",
    },
    impact_story: "Lan tỏa thông điệp yêu thương và tinh thần sẻ chia tới cộng đồng.",
  },
];

export const MOCK_COMBOS: ExtendedCombo[] = [
  {
    combo_id: "combo-1",
    name: "Combo Gieo Mơ Starter Kit",
    slug: "combo-gieo-mo-starter",
    price: 150000,
    description: "Bộ combo hoàn hảo gồm 1 Pouch Mầm Mơ + 1 Kẹp tóc Nút Áo + 1 Sticker Pack. Tiết kiệm 15k so với mua lẻ!",
    status: "active",
    featured: true,
    sort_order: 1,
    created_at: new Date().toISOString(),
    images: ["/images/products/combo-starter.jpg"],
    items: [
      { product: MOCK_PRODUCTS[0], quantity: 1 },
      { product: MOCK_PRODUCTS[1], quantity: 1 },
      { product: MOCK_PRODUCTS[4], quantity: 1 },
    ],
  },
];

export const MOCK_VOUCHERS: Voucher[] = [
  {
    voucher_id: "v-1",
    code: "GIEOMO10",
    discount_type: "percentage",
    discount_value: 10,
    min_order_value: 100000,
    min_items_count: 0,
    usage_limit: 50,
    usage_count: 12,
    status: "active",
    visibility: "public",
    created_at: new Date().toISOString(),
  },
  {
    voucher_id: "v-2",
    code: "WELCOME20K",
    discount_type: "fixed_amount",
    discount_value: 20000,
    min_order_value: 150000,
    min_items_count: 0,
    usage_limit: 100,
    usage_count: 45,
    status: "active",
    visibility: "public",
    created_at: new Date().toISOString(),
  },
  {
    voucher_id: "v-3",
    code: "FREESHIPMAM",
    discount_type: "freeship",
    discount_value: 15000,
    min_order_value: 120000,
    min_items_count: 0,
    usage_limit: 200,
    usage_count: 30,
    status: "active",
    visibility: "public",
    created_at: new Date().toISOString(),
  },
  {
    voucher_id: "v-4",
    code: "MUA2MON25K",
    discount_type: "fixed_amount",
    discount_value: 25000,
    min_order_value: 0,
    min_items_count: 2,
    usage_limit: 100,
    usage_count: 18,
    status: "active",
    visibility: "public",
    created_at: new Date().toISOString(),
  },
  {
    voucher_id: "v-5",
    code: "TRIANMAMMO",
    discount_type: "percentage",
    discount_value: 15,
    min_order_value: 80000,
    min_items_count: 0,
    is_gift_voucher: true,
    gift_min_order_value: 100000,
    usage_limit: 500,
    usage_count: 5,
    status: "active",
    visibility: "private",
    created_at: new Date().toISOString(),
  },
];

export const MOCK_ORDERS: Order[] = [];

export const MOCK_ORDER_ITEMS: OrderItem[] = [];
