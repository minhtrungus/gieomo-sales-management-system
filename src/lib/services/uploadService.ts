import { createClient } from "@/lib/supabase/client";

/**
 * Upload an asset file (image, favicon, QR code) to Supabase Storage.
 * @param file The file object from <input type="file" />
 * @param bucket Name of the storage bucket ('content-media' | 'product-media')
 * @param path Optional folder/filename path
 * @returns Public URL of the uploaded asset
 */
export async function uploadAsset(
  file: File,
  bucket: "content-media" | "product-media" = "content-media",
  customName?: string
): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    const supabase = createClient();
    const fileExt = file.name.split(".").pop();
    const fileName = customName || `${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${fileExt}`;
    const filePath = `uploads/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(filePath, file, {
        cacheControl: "3600",
        upsert: true,
      });

    if (uploadError) {
      console.error("[uploadAsset] Error uploading file to bucket:", uploadError);
      return { success: false, error: uploadError.message };
    }

    const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);
    return { success: true, url: data.publicUrl };
  } catch (err: any) {
    console.error("[uploadAsset] Exception:", err);
    return { success: false, error: err?.message || "Lỗi tải tệp tin" };
  }
}
