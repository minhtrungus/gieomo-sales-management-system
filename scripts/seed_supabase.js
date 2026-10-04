const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");

const env = fs.readFileSync(".env.local", "utf8");
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();
const admin = createClient(url, key);

async function seedInitial() {
  console.log("--- 1. Seeding Categories ---");
  const categories = [
    { name: "Phụ kiện may vá", slug: "phu-kien-may-va", description: "Các sản phẩm handmade từ vải, chỉ, nút áo", status: "active", sort_order: 1 },
    { name: "Túi & Pouch", slug: "tui-pouch", description: "Túi vải, pouch, ví nhỏ handmade", status: "active", sort_order: 2 },
    { name: "Quà tặng", slug: "qua-tang", description: "Set quà tặng ý nghĩa từ Gieo Mơ", status: "active", sort_order: 3 },
  ];

  for (const c of categories) {
    const { error } = await admin.from("product_categories").upsert(c, { onConflict: "slug" });
    if (error) console.error("Category error:", error);
  }

  const { data: allCats } = await admin.from("product_categories").select("category_id, slug");
  const catMap = Object.fromEntries(allCats.map((c) => [c.slug, c.category_id]));

  console.log("--- 2. Seeding Products ---");
  const prods = [
    {
      name: "Pouch Mầm Mơ",
      slug: "pouch-mam-mo",
      short_description: "Pouch vải handmade với hoa văn đặc trưng Mầm Mơ",
      description: "Chiếc pouch nhỏ xinh được may tay tỉ mỉ bởi các tình nguyện viên. Mỗi chiếc pouch mang một câu chuyện riêng, một giấc mơ nhỏ được gieo.",
      price: 85000,
      compare_at_price: 100000,
      cost_price: 35000,
      status: "active",
      featured: true,
      sort_order: 1,
      thumbnail: "/images/products/pounch_1.png",
      category_id: catMap["tui-pouch"],
      variants: [
        { sku: "GM-POUCH-PINK", name: "Màu hồng", stock: 20, sort_order: 1 },
        { sku: "GM-POUCH-BLUE", name: "Màu xanh", stock: 15, sort_order: 2 },
        { sku: "GM-POUCH-GREEN", name: "Màu xanh lá", stock: 10, sort_order: 3 },
      ],
      media: ["/images/products/pounch_1.png"],
    },
    {
      name: "Kẹp tóc Nút Áo",
      slug: "kep-toc-nut-ao",
      short_description: "Kẹp tóc hình nút áo — signature accessory của Mầm",
      description: "Kẹp tóc handmade hình nút áo, chi tiết nhận diện đặc trưng của nhân vật Mầm. Phù hợp làm quà tặng hoặc tự dùng.",
      price: 45000,
      compare_at_price: null,
      cost_price: 15000,
      status: "active",
      featured: true,
      sort_order: 2,
      thumbnail: "/images/products/kep-toc-1.jpg",
      category_id: catMap["phu-kien-may-va"],
      variants: [
        { sku: "GM-KEPTOC-01", name: "Mặc định", stock: 50, sort_order: 1 },
      ],
      media: ["/images/products/kep-toc-1.jpg"],
    },
    {
      name: "Túi Tote Gieo Mơ",
      slug: "tui-tote-gieo-mo",
      short_description: "Túi tote vải canvas in hình Mầm và thông điệp gây quỹ",
      description: "Túi tote canvas chất lượng cao, in hình Mầm và slogan 'Little Pieces, Bigger Dreams'. Thân thiện môi trường, phù hợp đi học và đi chơi.",
      price: 120000,
      compare_at_price: 150000,
      cost_price: 50000,
      status: "active",
      featured: true,
      sort_order: 3,
      thumbnail: "/images/products/tote-gieo-mo-1.jpg",
      category_id: catMap["tui-pouch"],
      variants: [
        { sku: "GM-TOTE-NAT", name: "Natural", stock: 25, sort_order: 1 },
        { sku: "GM-TOTE-BLK", name: "Đen", stock: 20, sort_order: 2 },
      ],
      media: ["/images/products/tote-gieo-mo-1.jpg"],
    },
    {
      name: "Bộ Kim Chỉ Mầm Mơ",
      slug: "bo-kim-chi-mam-mo",
      short_description: "Bộ kim chỉ mini với packaging đặc biệt từ Gieo Mơ",
      description: "Bộ kim chỉ nhỏ gọn, đầy đủ màu sắc, đóng gói trong hộp thiếc xinh xắn mang thương hiệu Mầm Mơ. Lý tưởng cho người mới bắt đầu may vá.",
      price: 65000,
      compare_at_price: null,
      cost_price: 25000,
      status: "active",
      featured: false,
      sort_order: 4,
      thumbnail: "/images/products/bo-kim-chi-1.jpg",
      category_id: catMap["phu-kien-may-va"],
      variants: [
        { sku: "GM-KIMCHI-01", name: "Mặc định", stock: 30, sort_order: 1 },
      ],
      media: ["/images/products/bo-kim-chi-1.jpg"],
    },
    {
      name: "Sticker Pack Mầm Mơ",
      slug: "sticker-pack-mam-mo",
      short_description: "Bộ sticker dễ thương với các hình ảnh Mầm và phụ kiện may vá",
      description: "Bộ 12 sticker chống nước với hình ảnh Mầm, cuộn chỉ, nút áo, pouch và các chi tiết đáng yêu. Dán laptop, bình nước, sổ tay.",
      price: 35000,
      compare_at_price: null,
      cost_price: 10000,
      status: "active",
      featured: false,
      sort_order: 5,
      thumbnail: "/images/products/sticker-pack-1.jpg",
      category_id: catMap["qua-tang"],
      variants: [
        { sku: "GM-STICKER-01", name: "Mặc định", stock: 100, sort_order: 1 },
      ],
      media: ["/images/products/sticker-pack-1.jpg"],
    },
  ];

  for (const p of prods) {
    const { variants, media, ...pData } = p;
    const { data: savedP, error: pErr } = await admin
      .from("products")
      .upsert(pData, { onConflict: "slug" })
      .select("product_id")
      .single();

    if (pErr) {
      console.error("Product upsert error for", p.slug, pErr);
      continue;
    }
    const pid = savedP.product_id;
    for (const v of variants) {
      const { error: vErr } = await admin
        .from("product_variants")
        .upsert({ ...v, product_id: pid }, { onConflict: "sku" });
      if (vErr) console.error("Variant error for", v.sku, vErr);
    }
    if (media && media.length > 0) {
      await admin.from("product_media").delete().eq("product_id", pid);
      await admin.from("product_media").insert(
        media.map((u, i) => ({
          product_id: pid,
          url: u,
          sort_order: i + 1,
          media_type: "image",
        }))
      );
    }
  }

  console.log("--- 3. Seeding Vouchers ---");
  const vouchers = [
    { code: "GIEOMO10", discount_type: "percentage", discount_value: 10, min_order_value: 100000, usage_limit: 50, status: "active" },
    { code: "WELCOME20K", discount_type: "fixed_amount", discount_value: 20000, min_order_value: 150000, usage_limit: 100, status: "active" },
  ];
  for (const v of vouchers) {
    await admin.from("vouchers").upsert(v, { onConflict: "code" });
  }

  const { data: finalP } = await admin.from("products").select("product_id, name, slug, price, status");
  console.log("Seeding complete! Products in Supabase:", finalP);
}

seedInitial().catch(console.error);
