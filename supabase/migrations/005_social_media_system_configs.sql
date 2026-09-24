-- 005_social_media_system_configs.sql
-- Seed social media configuration keys in system_configs

INSERT INTO system_configs (config_key, config_value, description) VALUES
  ('facebook_url', 'https://www.facebook.com/BanHangGieoMo', 'Đường dẫn Fanpage / Facebook chính thức của Mầm Mơ'),
  ('tiktok_url', 'https://www.tiktok.com/@vuongquocmam', 'Đường dẫn kênh TikTok chính thức của Mầm Mơ'),
  ('instagram_url', 'https://www.instagram.com/mam.mer.oii', 'Đường dẫn tài khoản Instagram chính thức của Mầm Mơ'),
  ('zalo_url', '', 'Đường dẫn Zalo OA hoặc Zalo Chat hỗ trợ khách hàng'),
  ('youtube_url', '', 'Đường dẫn kênh YouTube chính thức của Mầm Mơ')
ON CONFLICT (config_key) DO NOTHING;
