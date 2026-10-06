/**
 * Client-side image compressor for high-speed uploads.
 * Converts large camera/phone photos (5-15MB) into high-quality, lightweight WebP/JPEG (100-300KB)
 * in milliseconds using HTML5 Canvas before uploading to server/Supabase.
 */

export interface CompressionOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number; // 0.1 to 1.0, default 0.85
  targetFormat?: "image/webp" | "image/jpeg";
}

export async function compressImage(
  file: File,
  options: CompressionOptions = {}
): Promise<File> {
  // If not running in browser or not an image, return original
  if (typeof window === "undefined" || !file || !file.type.startsWith("image/")) {
    return file;
  }

  // Preserve SVGs and GIFs (to keep vector quality or animated frames)
  if (file.type === "image/svg+xml" || file.type === "image/gif") {
    return file;
  }

  // If already very small (< 150KB) and modern format, no need to re-encode
  if (file.size < 150 * 1024 && (file.type === "image/webp" || file.type === "image/jpeg")) {
    return file;
  }

  const maxWidth = options.maxWidth || 1600;
  const maxHeight = options.maxHeight || 1600;
  const quality = options.quality ?? 0.85;
  const preferredType = options.targetFormat || "image/webp";

  // Fast path: use browser-native asynchronous createImageBitmap (off-main-thread decode)
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file);
      let { width, height } = bitmap;

      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      // Check OffscreenCanvas support for zero main-thread impact
      if (typeof OffscreenCanvas !== "undefined") {
        const offCanvas = new OffscreenCanvas(width, height);
        const ctx = offCanvas.getContext("2d");
        if (ctx) {
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";
          ctx.drawImage(bitmap, 0, 0, width, height);
          bitmap.close();

          const blob = await offCanvas.convertToBlob({ type: preferredType, quality });
          if (blob && blob.size < file.size) {
            const ext = preferredType === "image/webp" ? "webp" : "jpg";
            const cleanBaseName = file.name.replace(/\.[^/.]+$/, "");
            return new File([blob], `${cleanBaseName}.${ext}`, {
              type: preferredType,
              lastModified: Date.now(),
            });
          }
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d", { alpha: true });
      if (ctx) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(bitmap, 0, 0, width, height);
        bitmap.close();

        const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, preferredType, quality));
        if (blob && blob.size < file.size) {
          const ext = preferredType === "image/webp" ? "webp" : "jpg";
          const cleanBaseName = file.name.replace(/\.[^/.]+$/, "");
          return new File([blob], `${cleanBaseName}.${ext}`, {
            type: preferredType,
            lastModified: Date.now(),
          });
        }
      }
    } catch {
      // Fallback to Image element with object URL
    }
  }

  // Fallback: Use ObjectURL (much faster and lighter than FileReader base64)
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new window.Image();

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      try {
        let { width, height } = img;

        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d", { alpha: true });
        if (!ctx) {
          resolve(file);
          return;
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (!blob || blob.size >= file.size) {
              resolve(file);
              return;
            }
            const ext = preferredType === "image/webp" ? "webp" : "jpg";
            const cleanBaseName = file.name.replace(/\.[^/.]+$/, "");
            resolve(new File([blob], `${cleanBaseName}.${ext}`, {
              type: preferredType,
              lastModified: Date.now(),
            }));
          },
          preferredType,
          quality
        );
      } catch {
        resolve(file);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(file);
    };

    img.src = objectUrl;
  });
}

/**
 * Compress an array of files in parallel
 */
export async function compressImages(
  files: File[],
  options?: CompressionOptions
): Promise<File[]> {
  return Promise.all(files.map((file) => compressImage(file, options)));
}
