import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// Maximum upload size: 10MB
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
    const file = formData.get("file") as File | null;
    const bucket = (formData.get("bucket") as string) || "content-media";
    const customName = formData.get("customName") as string | null;

    if (!file) {
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

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, error: "Dung lượng ảnh không được vượt quá 10MB" },
        { status: 400 }
      );
    }

    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json(
        {
          success: false,
          error: `Định dạng tệp không được hỗ trợ (${file.type}). Chỉ chấp nhận JPEG, PNG, WEBP, GIF, SVG.`,
        },
        { status: 400 }
      );
    }

    const fileExt = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const fileName =
      customName ||
      `${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${fileExt}`;
    const filePath = `uploads/${fileName}`;

    const buffer = Buffer.from(await file.arrayBuffer());
    const supabase = createAdminClient();

    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(filePath, buffer, {
        contentType: file.type,
        cacheControl: "31536000, public, immutable",
        upsert: true,
      });

    if (uploadError) {
      console.error("[POST /api/upload] Supabase Storage error:", uploadError);
      return NextResponse.json(
        { success: false, error: uploadError.message },
        { status: 500 }
      );
    }

    const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);

    return NextResponse.json({
      success: true,
      url: data.publicUrl,
      path: filePath,
    });
  } catch (err: any) {
    console.error("[POST /api/upload] Exception:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Lỗi máy chủ khi tải ảnh" },
      { status: 500 }
    );
  }
}
