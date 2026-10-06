import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// Maximum upload size: 10MB per file
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/svg+xml",
];

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    
    // Support both single "file" and multiple "files" in one request
    const files = formData.getAll("files") as File[];
    const singleFile = formData.get("file") as File | null;
    const allFilesToProcess = files.length > 0 ? files : singleFile ? [singleFile] : [];
    
    const bucket = (formData.get("bucket") as string) || "product-media";
    const customName = formData.get("customName") as string | null;

    if (allFilesToProcess.length === 0) {
      return NextResponse.json(
        { success: false, error: "Không tìm thấy tệp tin cần tải lên" },
        { status: 400 }
      );
    }

    if (bucket !== "content-media" && bucket !== "product-media") {
      return NextResponse.json(
        { success: false, error: "Tên bucket lưu trữ không hợp lệ" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();
    const successfulUrls: string[] = [];
    const errors: string[] = [];

    // Process all files in parallel on the server
    await Promise.all(
      allFilesToProcess.map(async (file, idx) => {
        try {
          if (file.size > MAX_FILE_SIZE) {
            errors.push(`"${file.name}": Vượt quá dung lượng cho phép 10MB`);
            return;
          }

          if (!ALLOWED_MIME_TYPES.includes(file.type)) {
            errors.push(`"${file.name}": Định dạng không hỗ trợ (${file.type})`);
            return;
          }

          const fileExt = file.name.split(".").pop()?.toLowerCase() || "webp";
          const fileName =
            (customName && allFilesToProcess.length === 1)
              ? customName
              : `${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 7)}.${fileExt}`;
          const filePath = `uploads/${fileName}`;

          const buffer = Buffer.from(await file.arrayBuffer());

          const { error: uploadError } = await supabase.storage
            .from(bucket)
            .upload(filePath, buffer, {
              contentType: file.type || "image/webp",
              cacheControl: "31536000, public, immutable",
              upsert: true,
            });

          if (uploadError) {
            console.error(`[POST /api/upload] Supabase Storage error for ${file.name}:`, uploadError);
            errors.push(`"${file.name}": ${uploadError.message}`);
            return;
          }

          const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);
          if (data?.publicUrl) {
            successfulUrls.push(data.publicUrl);
          }
        } catch (err: any) {
          errors.push(`"${file.name}": ${err?.message || "Lỗi xử lý"}`);
        }
      })
    );

    if (successfulUrls.length === 0) {
      return NextResponse.json(
        { success: false, error: errors.join("; ") || "Tải ảnh thất bại" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      url: successfulUrls[0],
      urls: successfulUrls,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err: any) {
    console.error("[POST /api/upload] Exception:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Lỗi máy chủ khi tải ảnh" },
      { status: 500 }
    );
  }
}
