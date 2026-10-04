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

  return new Promise((resolve) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      const img = new window.Image();

      img.onload = () => {
        try {
          let { width, height } = img;

          // Calculate scaled dimensions while preserving aspect ratio
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
            resolve(file); // Fallback to original
            return;
          }

          // Use high quality image smoothing
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";
          ctx.drawImage(img, 0, 0, width, height);

          // Determine preferred MIME type: prefer webp if supported, otherwise jpeg
          const preferredType = options.targetFormat || "image/webp";

          canvas.toBlob(
            (blob) => {
              if (!blob) {
                resolve(file); // Fallback
                return;
              }

              // If compressed blob is somehow larger than original, return original
              if (blob.size >= file.size) {
                resolve(file);
                return;
              }

              // Determine extension
              const ext = preferredType === "image/webp" ? "webp" : "jpg";
              const cleanBaseName = file.name.replace(/\.[^/.]+$/, "");
              const compressedFile = new File([blob], `${cleanBaseName}.${ext}`, {
                type: preferredType,
                lastModified: Date.now(),
              });

              resolve(compressedFile);
            },
            preferredType,
            quality
          );
        } catch (err) {
          console.warn("[compressImage] Compression failed, using original file:", err);
          resolve(file);
        }
      };

      img.onerror = () => {
        resolve(file); // Fallback
      };

      img.src = e.target?.result as string;
    };

    reader.onerror = () => {
      resolve(file); // Fallback
    };

    reader.readAsDataURL(file);
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
