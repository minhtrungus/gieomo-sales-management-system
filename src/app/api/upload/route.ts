import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser } from "@/lib/auth/serverAuth";

export const dynamic = "force-dynamic";

// Maximum upload size: 10MB per file
const MAX_FILE_SIZE = 10 * 1024 * 1024;
// Strictly disallow SVG to prevent Stored XSS vectors
const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];

function detectImageMimeType(buf: Buffer): string | null {
  if (buf.length < 12) return null;

  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return "image/jpeg";
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return "image/png";
  }

  // GIF: GIF87a or GIF89a
  if (
    buf[0] === 0x47 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x38 &&
    (buf[4] === 0x37 || buf[4] === 0x39) &&
    buf[5] === 0x61
  ) {
    return "image/gif";
  }

  // WEBP: RIFF....WEBP
  if (
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  ) {
    return "image/webp";
  }

  return null;
}

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

    // Require admin session for content-media bucket or multi-file batch uploads
    if (bucket === "content-media" || allFilesToProcess.length > 2) {
      const user = await getAuthenticatedUser(request);
      if (!user) {
        return NextResponse.json(
          { success: false, error: "Yêu cầu quyền quản trị để tải tệp này" },
          { status: 401 }
        );
      }
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

          const buffer = Buffer.from(await file.arrayBuffer());

          // Strict Magic Bytes / File Signature verification
          const detectedMime = detectImageMimeType(buffer);
          if (!detectedMime || !ALLOWED_MIME_TYPES.includes(detectedMime)) {
            errors.push(`"${file.name}": Chữ ký tệp tin không hợp lệ (Không phải ảnh JPEG, PNG, WEBP hoặc GIF hợp lệ)`);
            return;
          }

          // Check for embedded executable/script signatures or SVG in first 1KB
          const headerSnippet = buffer.slice(0, 1024).toString("utf-8").toLowerCase();
          if (
            headerSnippet.includes("<svg") ||
            headerSnippet.includes("<script") ||
            headerSnippet.includes("<?php") ||
            headerSnippet.includes("<html")
          ) {
            errors.push(`"${file.name}": Tệp chứa nội dung mã không an toàn.`);
            return;
          }

          const rawExt = file.name.split(".").pop()?.toLowerCase() || "webp";
          const mimeExtMap: Record<string, string> = {
            "image/jpeg": "jpg",
            "image/png": "png",
            "image/webp": "webp",
            "image/gif": "gif",
          };
          const fileExt = mimeExtMap[detectedMime] || "webp";
          const safeBaseName = `${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 7)}.${fileExt}`;
          const filePath = `uploads/${safeBaseName}`;

          const { error: uploadError } = await supabase.storage
            .from(bucket)
            .upload(filePath, buffer, {
              contentType: detectedMime,
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
        { status: 400 }
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
