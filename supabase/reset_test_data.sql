-- ====================================================================
-- GIEO MƠ — SCRIPT RESET DỮ LIỆU TEST CHUẨN BỊ VẬN HÀNH CHÍNH THỨC (GO-LIVE)
-- ====================================================================
-- An toàn: Thực hiện trong TRANSACTION, dùng đúng tên bảng theo schema gốc
-- Giữ lại: Bảng members (Admin/CTV), system_configs (Cấu hình STK VietQR)
-- ====================================================================

BEGIN;

-- 1. XÓA DỮ LIỆU GIAO DỊCH, GIAO HÀNG, ĐƠN HÀNG, LỊCH SỬ & KHÁCH HÀNG
DELETE FROM shipments;
DELETE FROM payments;
DELETE FROM order_status_history;
DELETE FROM order_items;
DELETE FROM orders;
DELETE FROM customers;

-- Reset chuỗi số thứ tự sinh mã đơn hàng về 1 (GM-0001...)
ALTER SEQUENCE IF EXISTS order_code_seq RESTART WITH 1;

-- 2. XÓA SẢN PHẨM, BIẾN THỂ, ẢNH, COMBO & ĐÁNH GIÁ (NẾU CÓ)
DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'product_reviews') THEN
    DELETE FROM product_reviews;
  END IF;
END $$;

DELETE FROM combo_items;
DELETE FROM combos;
DELETE FROM product_media;
DELETE FROM product_variants;
DELETE FROM products;
DELETE FROM product_categories;

-- 3. XÓA TIN NHẮN LIÊN HỆ, AUDIT LOGS, WORKSHOP TEST
DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'contact_messages') THEN
    DELETE FROM contact_messages;
  END IF;
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'workshop_registrations') THEN
    DELETE FROM workshop_registrations;
  END IF;
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'workshops') THEN
    DELETE FROM workshops;
  END IF;
END $$;

DELETE FROM audit_logs;

-- 4. XÓA MÃ GIẢM GIÁ (VOUCHERS) THỬ NGHIỆM
DELETE FROM vouchers;

-- 5. RESET CACHE HIỆN DIỆN ONLINE TRONG SYSTEM CONFIGS
-- (Bảo lưu nguyên vẹn toàn bộ cấu hình STK VietQR, ngân hàng, phí ship...)
UPDATE system_configs 
SET config_value = '{}', updated_at = now()
WHERE config_key = 'members_online_presence';

-- 6. KIỂM TRA ĐẢM BẢO TÀI KHOẢN ADMIN/CTV VẪN AN TOÀN
SELECT count(*) AS total_remaining_members FROM members;

COMMIT;
