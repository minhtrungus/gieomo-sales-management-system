/**
 * Upload an asset file (image, favicon, QR code) to Supabase Storage.
 * Uses the server-side /api/upload endpoint with service-role privileges
 * to safely bypass Storage RLS policies and ensure consistent file management.
 *
 * @param file The file object from <input type="file" />
 * @param bucket Name of the storage bucket ('content-media' | 'product-media')
 * @param customName Optional folder/filename path
 * @returns Public URL of the uploaded asset
 */
export async function uploadAsset(
  file: File,
  bucket: "content-media" | "product-media" = "content-media",
  customName?: string
): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    if (!file) {
      return { success: false, error: "Tệp tin không hợp lệ" };
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("bucket", bucket);
    if (customName) {
      formData.append("customName", customName);
    }

    const res = await fetch("/api/upload", {
      method: "POST",
      body: formData,
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      console.error("[uploadAsset] Upload failed:", data?.error || res.statusText);
      return { success: false, error: data?.error || "Lỗi tải ảnh lên hệ thống" };
    }

    return { success: true, url: data.url };
  } catch (err: any) {
    console.error("[uploadAsset] Exception:", err);
    return { success: false, error: err?.message || "Lỗi kết nối khi tải tệp tin" };
  }
}

