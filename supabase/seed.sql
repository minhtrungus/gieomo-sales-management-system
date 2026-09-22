-- ===========================
-- GIEO MƠ — SEED DATA
-- For development / testing only
-- ===========================

-- === Product Categories ===
INSERT INTO product_categories (name, slug, description, status, sort_order) VALUES
  ('Phụ kiện may vá', 'phu-kien-may-va', 'Các sản phẩm handmade từ vải, chỉ, nút áo', 'active', 1),
  ('Túi & Pouch', 'tui-pouch', 'Túi vải, pouch, ví nhỏ handmade', 'active', 2),
  ('Quà tặng', 'qua-tang', 'Set quà tặng ý nghĩa từ Gieo Mơ', 'active', 3);

-- === Products ===
INSERT INTO products (name, slug, short_description, description, price, compare_at_price, cost_price, status, featured, sort_order, category_id) VALUES
  (
    'Pouch Mầm Mơ',
    'pouch-mam-mo',
    'Pouch vải handmade với hoa văn đặc trưng Mầm Mơ',
    'Chiếc pouch nhỏ xinh được may tay tỉ mỉ bởi các tình nguyện viên. Mỗi chiếc pouch mang một câu chuyện riêng, một giấc mơ nhỏ được gieo.',
    85000, 100000, 35000,
    'active', true, 1,
    (SELECT category_id FROM product_categories WHERE slug = 'tui-pouch')
  ),
  (
    'Kẹp tóc Nút Áo',
    'kep-toc-nut-ao',
    'Kẹp tóc hình nút áo — signature accessory của Mầm',
    'Kẹp tóc handmade hình nút áo, chi tiết nhận diện đặc trưng của nhân vật Mầm. Phù hợp làm quà tặng hoặc tự dùng.',
    45000, NULL, 15000,
    'active', true, 2,
    (SELECT category_id FROM product_categories WHERE slug = 'phu-kien-may-va')
  ),
  (
    'Túi Tote Gieo Mơ',
    'tui-tote-gieo-mo',
    'Túi tote vải canvas in hình Mầm và thông điệp gây quỹ',
    'Túi tote canvas chất lượng cao, in hình Mầm và slogan "Little Pieces, Bigger Dreams". Thân thiện môi trường, phù hợp đi học và đi chơi.',
    120000, 150000, 50000,
    'active', true, 3,
    (SELECT category_id FROM product_categories WHERE slug = 'tui-pouch')
  ),
  (
    'Bộ Kim Chỉ Mầm Mơ',
    'bo-kim-chi-mam-mo',
    'Bộ kim chỉ mini với packaging đặc biệt từ Gieo Mơ',
    'Bộ kim chỉ nhỏ gọn, đầy đủ màu sắc, đóng gói trong hộp thiếc xinh xắn mang thương hiệu Mầm Mơ. Lý tưởng cho người mới bắt đầu may vá.',
    65000, NULL, 25000,
    'active', false, 4,
    (SELECT category_id FROM product_categories WHERE slug = 'phu-kien-may-va')
  ),
  (
    'Sticker Pack Mầm Mơ',
    'sticker-pack-mam-mo',
    'Bộ sticker dễ thương với các hình ảnh Mầm và phụ kiện may vá',
    'Bộ 12 sticker chống nước với hình ảnh Mầm, cuộn chỉ, nút áo, pouch và các chi tiết đáng yêu. Dán laptop, bình nước, sổ tay.',
    35000, NULL, 10000,
    'active', false, 5,
    (SELECT category_id FROM product_categories WHERE slug = 'qua-tang')
  );

-- === Product Variants ===
INSERT INTO product_variants (product_id, sku, name, stock, sort_order) VALUES
  ((SELECT product_id FROM products WHERE slug = 'pouch-mam-mo'), 'GM-POUCH-PINK', 'Màu hồng', 20, 1),
  ((SELECT product_id FROM products WHERE slug = 'pouch-mam-mo'), 'GM-POUCH-BLUE', 'Màu xanh', 15, 2),
  ((SELECT product_id FROM products WHERE slug = 'pouch-mam-mo'), 'GM-POUCH-GREEN', 'Màu xanh lá', 10, 3),
  ((SELECT product_id FROM products WHERE slug = 'kep-toc-nut-ao'), 'GM-KEPTOC-01', 'Mặc định', 50, 1),
  ((SELECT product_id FROM products WHERE slug = 'tui-tote-gieo-mo'), 'GM-TOTE-NAT', 'Natural', 25, 1),
  ((SELECT product_id FROM products WHERE slug = 'tui-tote-gieo-mo'), 'GM-TOTE-BLK', 'Đen', 20, 2),
  ((SELECT product_id FROM products WHERE slug = 'bo-kim-chi-mam-mo'), 'GM-KIMCHI-01', 'Mặc định', 30, 1),
  ((SELECT product_id FROM products WHERE slug = 'sticker-pack-mam-mo'), 'GM-STICKER-01', 'Mặc định', 100, 1);

-- === Combos ===
INSERT INTO combos (name, slug, price, description, status, featured, sort_order) VALUES
  (
    'Combo Gieo Mơ Starter',
    'combo-gieo-mo-starter',
    180000,
    'Gồm 1 Pouch Mầm Mơ + 1 Kẹp tóc Nút Áo + 1 Sticker Pack. Bộ combo hoàn hảo để bắt đầu hành trình cùng Mầm.',
    'active', true, 1
  );

-- === Combo Items ===
INSERT INTO combo_items (combo_id, product_id, quantity) VALUES
  (
    (SELECT combo_id FROM combos WHERE slug = 'combo-gieo-mo-starter'),
    (SELECT product_id FROM products WHERE slug = 'pouch-mam-mo'),
    1
  ),
  (
    (SELECT combo_id FROM combos WHERE slug = 'combo-gieo-mo-starter'),
    (SELECT product_id FROM products WHERE slug = 'kep-toc-nut-ao'),
    1
  ),
  (
    (SELECT combo_id FROM combos WHERE slug = 'combo-gieo-mo-starter'),
    (SELECT product_id FROM products WHERE slug = 'sticker-pack-mam-mo'),
    1
  );

-- === Vouchers ===
INSERT INTO vouchers (code, discount_type, discount_value, min_order_value, usage_limit, status) VALUES
  ('GIEOMO10', 'percentage', 10, 100000, 50, 'active'),
  ('WELCOME20K', 'fixed_amount', 20000, 150000, 100, 'active');

-- === Sponsors ===
INSERT INTO sponsors (name, logo_url, tier, website_url, description, display_order, active) VALUES
  ('Sponsor Mẫu 1', '/images/placeholder-sponsor.png', 'gold', 'https://example.com', 'Nhà tài trợ vàng mẫu', 1, true),
  ('Đối tác Mẫu', '/images/placeholder-sponsor.png', 'partner', 'https://example.com', 'Đối tác mẫu', 2, true);

-- === System Configs ===
INSERT INTO system_configs (config_key, config_value) VALUES
  ('site_name', 'Gieo Mơ'),
  ('hero_title', 'Little Pieces, Bigger Dreams'),
  ('hero_subtitle', 'Những mảnh ghép nhỏ, một giấc mơ lớn. Mỗi sản phẩm bạn mua là một điều tốt đẹp được gieo.'),
  ('contact_phone', '0123456789'),
  ('contact_email', 'gieomo@mammo.vn'),
  ('shipping_note', 'Giao hàng trong 3-5 ngày làm việc tại TP.HCM. Các tỉnh khác 5-7 ngày.'),
  ('payment_note', 'Chuyển khoản ngân hàng hoặc thanh toán khi nhận hàng (COD).'),
  ('site_status', 'active'),
  ('flat_shipping_fee', '25000'),
  ('free_shipping_threshold', '200000');

-- === Pickup Points ===
INSERT INTO pickup_points (name, address, contact_name, contact_phone, opening_hours, status) VALUES
  ('Điểm nhận tại trường ĐH', 'Cổng trường Đại học ...', 'Bạn A', '0987654321', 'T2-T6: 8h-17h', 'active');
