-- ========================================================
-- GIEO MƠ — DATABASE MIGRATION 002
-- Grant privileges & RLS policies for PostgREST (Supabase)
-- Fixes error: 42501 permission denied for table <table_name>
-- ========================================================

-- 1. CẤP QUYỀN USAGE TRÊN SCHEMA PUBLIC
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- 2. CẤP TOÀN QUYỀN TRÊN TẤT CẢ CÁC BẢNG HIỆN CÓ TRONG SCHEMA PUBLIC
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT, INSERT ON ALL TABLES IN SCHEMA public TO anon;

-- 3. CẤP QUYỀN TRÊN TẤT CẢ SEQUENCES (Để tự tăng id / order_code_seq)
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;

-- 4. CẤP QUYỀN TRÊN CÁC HÀM / ROUTINES
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, service_role;

-- 5. THIẾT LẬP DEFAULT PRIVILEGES (Tự động cấp quyền cho các bảng tạo trong tương lai)
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT ON TABLES TO anon;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO anon, authenticated, service_role;

-- 6. KÍCH HOẠT ROW LEVEL SECURITY (RLS) VÀ TẠO CHÍNH SÁCH BẢO VỆ DỮ LIỆU
-- Cho phép khách công khai xem danh mục, sản phẩm, biến thể, voucher, điểm nhận hàng
ALTER TABLE product_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read product_categories" ON product_categories FOR SELECT USING (true);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read products" ON products FOR SELECT USING (true);
CREATE POLICY "Service role all products" ON products FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE product_variants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read product_variants" ON product_variants FOR SELECT USING (true);
CREATE POLICY "Service role all variants" ON product_variants FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE product_media ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read product_media" ON product_media FOR SELECT USING (true);

ALTER TABLE combos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read combos" ON combos FOR SELECT USING (true);

ALTER TABLE combo_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read combo_items" ON combo_items FOR SELECT USING (true);

ALTER TABLE vouchers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read vouchers" ON vouchers FOR SELECT USING (true);
CREATE POLICY "Service role all vouchers" ON vouchers FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE pickup_points ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read pickup_points" ON pickup_points FOR SELECT USING (true);

ALTER TABLE delivery_zones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read delivery_zones" ON delivery_zones FOR SELECT USING (true);

ALTER TABLE sponsors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read sponsors" ON sponsors FOR SELECT USING (true);

ALTER TABLE system_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read system_configs" ON system_configs FOR SELECT USING (true);

-- Đơn hàng & Thanh toán (Khách có thể tạo đơn, Service role & Admin quản lý toàn quyền)
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public insert customers" ON customers FOR INSERT WITH CHECK (true);
CREATE POLICY "Service role all customers" ON customers FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public insert orders" ON orders FOR INSERT WITH CHECK (true);
CREATE POLICY "Public read orders" ON orders FOR SELECT USING (true);
CREATE POLICY "Service role all orders" ON orders FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public insert order_items" ON order_items FOR INSERT WITH CHECK (true);
CREATE POLICY "Public read order_items" ON order_items FOR SELECT USING (true);
CREATE POLICY "Service role all order_items" ON order_items FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public insert payments" ON payments FOR INSERT WITH CHECK (true);
CREATE POLICY "Public read payments" ON payments FOR SELECT USING (true);
CREATE POLICY "Service role all payments" ON payments FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE shipments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read shipments" ON shipments FOR SELECT USING (true);
CREATE POLICY "Service role all shipments" ON shipments FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE order_status_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public insert order_status_history" ON order_status_history FOR INSERT WITH CHECK (true);
CREATE POLICY "Public read order_status_history" ON order_status_history FOR SELECT USING (true);
CREATE POLICY "Service role all order_status_history" ON order_status_history FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role all members" ON members FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Public read basic members" ON members FOR SELECT USING (status = 'active');

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role all audit_logs" ON audit_logs FOR ALL TO service_role USING (true) WITH CHECK (true);
