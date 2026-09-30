-- 005_social_media_system_configs.sql
-- Seed social media configuration keys in system_configs

SET search_path TO public;

INSERT INTO public.system_configs (config_key, config_value) VALUES
  ('facebook_url', 'https://www.facebook.com/BanHangGieoMo'),
  ('tiktok_url', 'https://www.tiktok.com/@vuongquocmam'),
  ('instagram_url', 'https://www.instagram.com/mam.mer.oii'),
  ('zalo_url', ''),
  ('youtube_url', '')
ON CONFLICT (config_key) DO UPDATE SET
  config_value = EXCLUDED.config_value,
  updated_at = now();
