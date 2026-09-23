import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createBrowserSupabase } from "@/lib/supabase/client";

export interface SiteSettings {
  siteName: string;
  contactPhone: string;
  contactEmail: string;
  officeAddress: string;
  flatShippingFee: number;
  freeShippingThreshold: number;
  bankName: string;
  bankNumber: string;
  bankHolder: string;
  qrMode: "auto" | "upload";
  qrImageUrl: string;
  activePalette: string;
  coverTheme: string;
  faviconPreview: string;
  avatarPreview: string;
  shippingNote?: string;
  paymentNote?: string;
}

export const DEFAULT_SITE_SETTINGS: SiteSettings = {
  siteName: "Gieo Mơ",
  contactPhone: "0123456789",
  contactEmail: "gieomo@mammo.vn",
  officeAddress: "TP. Hồ Chí Minh, Việt Nam",
  flatShippingFee: 25000,
  freeShippingThreshold: 200000,
  bankNumber: "03456789999",
  bankHolder: "CLB MAM MO GIEO MO",
  bankName: "MB Bank (Quân Đội)",
  qrMode: "auto",
  qrImageUrl: "/images/logo_gieo mơ.jpg",
  activePalette: "soft-green",
  coverTheme: "emerald",
  faviconPreview: "/images/logo_gieo mơ.jpg",
  avatarPreview: "/images/logo_gieo mơ.jpg",
  shippingNote: "Giao hàng trong 3-5 ngày làm việc tại TP.HCM. Các tỉnh khác 5-7 ngày.",
  paymentNote: "Chuyển khoản ngân hàng hoặc thanh toán khi nhận hàng (COD).",
};

// Map DB rows to SiteSettings object
export function rowsToSettings(rows: { config_key: string; config_value: string }[]): SiteSettings {
  const map: Record<string, string> = {};
  for (const r of rows) {
    map[r.config_key] = r.config_value;
  }

  return {
    siteName: map.site_name || DEFAULT_SITE_SETTINGS.siteName,
    contactPhone: map.contact_phone || DEFAULT_SITE_SETTINGS.contactPhone,
    contactEmail: map.contact_email || DEFAULT_SITE_SETTINGS.contactEmail,
    officeAddress: map.office_address || DEFAULT_SITE_SETTINGS.officeAddress,
    flatShippingFee: map.flat_shipping_fee ? Number(map.flat_shipping_fee) : DEFAULT_SITE_SETTINGS.flatShippingFee,
    freeShippingThreshold: map.free_shipping_threshold ? Number(map.free_shipping_threshold) : DEFAULT_SITE_SETTINGS.freeShippingThreshold,
    bankName: map.bank_name || DEFAULT_SITE_SETTINGS.bankName,
    bankNumber: map.bank_number || DEFAULT_SITE_SETTINGS.bankNumber,
    bankHolder: map.bank_holder || DEFAULT_SITE_SETTINGS.bankHolder,
    qrMode: (map.qr_mode as "auto" | "upload") || DEFAULT_SITE_SETTINGS.qrMode,
    qrImageUrl: map.qr_image_url || DEFAULT_SITE_SETTINGS.qrImageUrl,
    activePalette: map.active_palette || DEFAULT_SITE_SETTINGS.activePalette,
    coverTheme: map.cover_theme || DEFAULT_SITE_SETTINGS.coverTheme,
    faviconPreview: map.favicon_preview || DEFAULT_SITE_SETTINGS.faviconPreview,
    avatarPreview: map.avatar_preview || DEFAULT_SITE_SETTINGS.avatarPreview,
    shippingNote: map.shipping_note || DEFAULT_SITE_SETTINGS.shippingNote,
    paymentNote: map.payment_note || DEFAULT_SITE_SETTINGS.paymentNote,
  };
}

// Convert SiteSettings object to DB rows
export function settingsToRows(settings: Partial<SiteSettings>): { config_key: string; config_value: string }[] {
  const keyMap: Record<keyof SiteSettings, string> = {
    siteName: "site_name",
    contactPhone: "contact_phone",
    contactEmail: "contact_email",
    officeAddress: "office_address",
    flatShippingFee: "flat_shipping_fee",
    freeShippingThreshold: "free_shipping_threshold",
    bankName: "bank_name",
    bankNumber: "bank_number",
    bankHolder: "bank_holder",
    qrMode: "qr_mode",
    qrImageUrl: "qr_image_url",
    activePalette: "active_palette",
    coverTheme: "cover_theme",
    faviconPreview: "favicon_preview",
    avatarPreview: "avatar_preview",
    shippingNote: "shipping_note",
    paymentNote: "payment_note",
  };

  const rows: { config_key: string; config_value: string }[] = [];
  for (const [prop, val] of Object.entries(settings)) {
    const dbKey = keyMap[prop as keyof SiteSettings];
    if (dbKey && val !== undefined) {
      rows.push({
        config_key: dbKey,
        config_value: String(val),
      });
    }
  }
  return rows;
}

/**
 * Fetch settings on server (Server Components, Route Handlers).
 */
export async function getSystemSettingsServer(): Promise<SiteSettings> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase.from("system_configs").select("*");
    if (error || !data || data.length === 0) {
      return DEFAULT_SITE_SETTINGS;
    }
    return rowsToSettings(data);
  } catch (e) {
    console.error("[getSystemSettingsServer] Error querying system_configs:", e);
    return DEFAULT_SITE_SETTINGS;
  }
}

/**
 * Update settings on server (Route Handlers, Server Actions).
 */
export async function updateSystemSettingsServer(
  settings: Partial<SiteSettings>
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = createAdminClient();
    const rows = settingsToRows(settings);
    if (rows.length === 0) return { success: true };

    const { error } = await supabase.from("system_configs").upsert(rows, {
      onConflict: "config_key",
    });

    if (error) {
      console.error("[updateSystemSettingsServer] DB error:", error);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (e: any) {
    console.error("[updateSystemSettingsServer] Exception:", e);
    return { success: false, error: e?.message || "Unknown error" };
  }
}
