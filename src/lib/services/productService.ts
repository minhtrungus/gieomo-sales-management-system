import { createAdminClient } from "@/lib/supabase/admin";
import type { ExtendedProduct } from "@/lib/data/mockData";
import type { Product, ProductCategory, ProductVariant } from "@/types/database";
import { sortProductVariants } from "@/lib/productVariantOrder";
import {
  LOCAL_ASSET_UNAVAILABLE,
  resolveRuntimeAsset,
  type RuntimeAssetStatus,
} from "@/lib/runtimeAssetSafety";

type ProductMediaRow = { url?: unknown; sort_order?: unknown };
type ProductRow = Product & {
  product_categories?: ProductCategory | ProductCategory[] | null;
  category?: ProductCategory | ProductCategory[] | null;
  product_variants?: ProductVariant[] | null;
  variants?: ProductVariant[] | null;
  product_media?: ProductMediaRow[] | null;
  media?: ProductMediaRow[] | null;
};

type ProductUpsertPayload = {
  name: string;
  slug: string;
  short_description: string | null;
  description: string | null;
  price: number;
  compare_at_price: number | null;
  cost_price: number | null;
  status: Product["status"];
  featured: boolean;
  sort_order: number;
  weight_gram: number;
  thumbnail: string | null;
  category_id: string | null;
  updated_at: string;
};

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function resolveProductImageSet(rawMedia: unknown, thumbnail: unknown): {
  thumbnail: string;
  images: string[];
  status: RuntimeAssetStatus;
} {
  type MediaImageInput = { url?: unknown; sort_order?: unknown };
  const mediaRows: MediaImageInput[] = (Array.isArray(rawMedia) ? rawMedia : [])
    .filter((media): media is MediaImageInput => Boolean(media) && typeof media === "object");
  const mediaAssets = mediaRows
    .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0))
    .map((media) => resolveRuntimeAsset(media.url));
  const thumbnailAsset = resolveRuntimeAsset(thumbnail);
  const mediaImages = mediaAssets
    .map((asset) => asset.url)
    .filter((url: string | null): url is string => Boolean(url));
  const images = [...new Set(mediaImages.length > 0
    ? mediaImages
    : [thumbnailAsset.url || LOCAL_ASSET_UNAVAILABLE])];
  const status: RuntimeAssetStatus = mediaAssets.some((asset) => asset.status === "source") || thumbnailAsset.status === "source"
    ? "source"
    : mediaAssets.some((asset) => asset.status === "fallback_only") || thumbnailAsset.status === "fallback_only"
      ? "fallback_only"
      : "missing";

  return {
    thumbnail: thumbnailAsset.url || images[0] || LOCAL_ASSET_UNAVAILABLE,
    images,
    status,
  };
}


/**
 * Fetch all products from Supabase with categories and variants
 */
export async function getProductsServer(includeDrafts = true): Promise<ExtendedProduct[]> {
  try {
    const supabase = createAdminClient();
    let query = supabase
      .from("products")
      .select(`
        product_id,
        category_id,
        name,
        slug,
        short_description,
        description,
        price,
        compare_at_price,
        cost_price,
        status,
        featured,
        sort_order,
        weight_gram,
        thumbnail,
        created_at,
        updated_at,
        product_categories!category_id (
          category_id, name, slug, description, image_url, status, sort_order, created_at
        ),
        product_variants!product_id (
          variant_id, product_id, sku, name, price, compare_at_price, cost_price, stock, weight_gram, image_url, status, sort_order, created_at, updated_at
        ),
        product_media!product_id (
          media_id, url, sort_order, alt_text
        )
      `)
      .order("sort_order", { ascending: true });

    if (!includeDrafts) {
      query = query.eq("status", "active");
    }

    const { data: primaryData, error } = await query;
    let productRows: ProductRow[] = primaryData || [];
    if (error) {
      console.warn("[getProductsServer] primary-query-fallback", { code: error.code || "unknown" });
      try {
        let fallbackQuery = supabase
          .from("products")
          .select("*")
          .order("sort_order", { ascending: true });
        if (!includeDrafts) {
          fallbackQuery = fallbackQuery.eq("status", "active");
        }
        const { data: rawProds, error: fbErr } = await fallbackQuery;
        if (fbErr || !rawProds) {
          console.error("[getProductsServer] fallback-product-read-failed", {
            code: fbErr?.code || "unknown",
          });
          throw new Error("Không thể tải danh sách sản phẩm.");
        }

        // Fetch variants and media separately
        const { data: allVariants, error: variantsError } = await supabase
          .from("product_variants")
          .select("*");
        if (variantsError) {
          console.error("[getProductsServer] fallback-variant-read-failed", {
            code: variantsError.code || "unknown",
          });
          throw new Error("Không thể tải danh sách sản phẩm.");
        }
        const { data: allMedia, error: mediaError } = await supabase.from("product_media").select("*");
        if (mediaError) {
          console.error("[getProductsServer] fallback-media-read-failed", {
            code: mediaError.code || "unknown",
          });
          throw new Error("Không thể tải danh sách sản phẩm.");
        }

        productRows = rawProds.map((p: ProductRow) => ({
          ...p,
          product_variants: (allVariants || []).filter((variant: ProductVariant) => variant.product_id === p.product_id),
          product_media: (allMedia || []).filter((media: { product_id: string }) => media.product_id === p.product_id),
        }));
      } catch (fallbackEx) {
        if (fallbackEx instanceof Error && fallbackEx.message === "Không thể tải danh sách sản phẩm.") {
          throw fallbackEx;
        }
        console.error("[getProductsServer] unexpected-fallback-failure");
        throw new Error("Không thể tải danh sách sản phẩm.");
      }
    }

    if (productRows.length === 0) {
      return [];
    }

    return productRows.map((p) => {
      // Map media to images array
      const rawMedia = p.product_media || p.media || [];
      const imageSet = resolveProductImageSet(rawMedia, p.thumbnail);

      // Map variants with warehouse calculations
      const rawVariants = p.product_variants || p.variants || [];
      const variantsList = sortProductVariants(Array.isArray(rawVariants) ? rawVariants : []);
      const variants: ProductVariant[] = variantsList.map((v: ProductVariant) => {
        const stock = v.stock ?? 0;
        const wh1 = Math.ceil(stock * 0.7);
        const wh2 = stock - wh1;
        const variantAsset = resolveRuntimeAsset(v.image_url);
        return {
          ...v,
          image_url: variantAsset.url,
          image_status: variantAsset.status,
          stock,
          stock_warehouse_1: wh1,
          stock_warehouse_2: wh2,
          warehouse_stocks: {
            "wh-ufm": wh1,
            "wh-lang": wh2,
            "wh-1": wh1,
            "wh-2": wh2,
          },
        };
      });

      const rawCategory = p.product_categories || p.category;
      const category = Array.isArray(rawCategory) ? rawCategory[0] : rawCategory;

      return {
        product_id: p.product_id,
        category_id: p.category_id,
        name: p.name,
        slug: p.slug,
        short_description: p.short_description,
        description: p.description,
        price: Number(p.price) || 0,
        compare_at_price: p.compare_at_price ? Number(p.compare_at_price) : null,
        cost_price: p.cost_price ? Number(p.cost_price) : null,
        status: p.status || "draft",
        featured: Boolean(p.featured),
        sort_order: p.sort_order || 1,
        weight_gram: p.weight_gram || 100,
        thumbnail: imageSet.thumbnail,
        image_status: imageSet.status,
        images: imageSet.images,
        category: category || undefined,
        variants,
        created_at: p.created_at,
        updated_at: p.updated_at,
      };
    });
  } catch (err) {
    if (err instanceof Error && err.message === "Không thể tải danh sách sản phẩm.") throw err;
    console.error("[getProductsServer] unexpected-read-failure");
    throw new Error("Không thể tải danh sách sản phẩm.");
  }
}

/**
 * Fetch a single product by slug from Supabase or fallback to mock data
 */
export async function getProductBySlugServer(slug: string): Promise<ExtendedProduct | null> {
  if (!slug) return null;
  const decodedSlug = decodeURIComponent(slug);

  try {
    const products = await getProductsServer(true);
    const found = products.find(
      (p) =>
        p.slug === slug ||
        p.slug === decodedSlug ||
        p.product_id === slug ||
        p.product_id === decodedSlug
    );
    if (found) return found;

    // Direct Supabase query as fallback if getProductsServer didn't catch it
    try {
      const supabase = createAdminClient();
      const { data: p } = await supabase
        .from("products")
        .select(`
          product_id,
          category_id,
          name,
          slug,
          short_description,
          description,
          price,
          compare_at_price,
          cost_price,
          status,
          featured,
          sort_order,
          weight_gram,
          thumbnail,
          created_at,
          updated_at,
          product_categories!category_id (
            category_id, name, slug, description, image_url, status, sort_order, created_at
          ),
          product_variants!product_id (
            variant_id, product_id, sku, name, price, compare_at_price, cost_price, stock, weight_gram, image_url, status, sort_order, created_at, updated_at
          ),
          product_media!product_id (
            media_id, url, sort_order, alt_text
          )
        `)
        .or(`slug.eq.${slug},slug.eq.${decodedSlug},product_id.eq.${slug},product_id.eq.${decodedSlug}`)
        .maybeSingle();

      if (p) {
        const product: ProductRow = p;
        const rawMedia = product.product_media || product.media || [];
        const imageSet = resolveProductImageSet(rawMedia, product.thumbnail);

        const rawVariants = product.product_variants || product.variants || [];
        const variantsList = sortProductVariants(Array.isArray(rawVariants) ? rawVariants : []);
        const variants: ProductVariant[] = variantsList.map((v: ProductVariant) => {
          const stock = v.stock ?? 0;
          const wh1 = Math.ceil(stock * 0.7);
          const wh2 = stock - wh1;
          const variantAsset = resolveRuntimeAsset(v.image_url);
          return {
            ...v,
            image_url: variantAsset.url,
            image_status: variantAsset.status,
            stock,
            stock_warehouse_1: wh1,
            stock_warehouse_2: wh2,
            warehouse_stocks: {
              "wh-ufm": wh1,
              "wh-lang": wh2,
              "wh-1": wh1,
              "wh-2": wh2,
            },
          };
        });

        const rawCategory = product.product_categories || product.category;
        const category = Array.isArray(rawCategory) ? rawCategory[0] : rawCategory;

        return {
          product_id: product.product_id,
          category_id: product.category_id,
          name: product.name,
          slug: product.slug,
          short_description: product.short_description,
          description: product.description,
          price: Number(product.price) || 0,
          compare_at_price: product.compare_at_price ? Number(product.compare_at_price) : null,
          cost_price: product.cost_price ? Number(product.cost_price) : null,
          status: product.status || "draft",
          featured: Boolean(product.featured),
          sort_order: product.sort_order || 1,
          weight_gram: product.weight_gram || 100,
          thumbnail: imageSet.thumbnail,
          image_status: imageSet.status,
          images: imageSet.images,
          category: category || undefined,
          variants,
          created_at: product.created_at,
          updated_at: product.updated_at,
        };
      }
    } catch {
      // Supabase not available
    }

    return null;
  } catch (err) {
    console.warn("[getProductBySlugServer] Error:", err);
    return null;
  }
}

/**
 * Toggle product status: 'active' | 'draft'
 */
export async function toggleProductStatusServer(
  identifier: string, // product_id or slug
  status: "active" | "draft"
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = createAdminClient();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier);

    let query = supabase.from("products").update({
      status,
      updated_at: new Date().toISOString(),
    });

    if (isUuid) {
      query = query.eq("product_id", identifier);
    } else {
      query = query.eq("slug", identifier);
    }

    const { error } = await query;
    if (error) {
      console.error("[toggleProductStatusServer] Error updating status:", error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: unknown) {
    console.error("[toggleProductStatusServer] Exception:", err);
    return { success: false, error: errorMessage(err, "Lỗi cập nhật trạng thái") };
  }
}

/**
 * Toggle product featured: true | false
 */
export async function toggleProductFeaturedServer(
  identifier: string, // product_id or slug
  featured: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = createAdminClient();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier);

    let query = supabase.from("products").update({
      featured,
      updated_at: new Date().toISOString(),
    });

    if (isUuid) {
      query = query.eq("product_id", identifier);
    } else {
      query = query.eq("slug", identifier);
    }

    const { error } = await query;
    if (error) {
      console.error("[toggleProductFeaturedServer] Error updating featured:", error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: unknown) {
    console.error("[toggleProductFeaturedServer] Exception:", err);
    return { success: false, error: errorMessage(err, "Lỗi cập nhật nổi bật") };
  }
}

/**
 * Upsert product and its variants into Supabase
 */
export async function upsertProductServer(product: ExtendedProduct): Promise<{
  success: boolean;
  product_id?: string;
  error?: string;
}> {
  try {
    const supabase = createAdminClient();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(product.product_id);

    // 1. Check if product already exists by slug or UUID
    let existingProductId: string | null = null;
    if (isUuid) {
      const { data } = await supabase.from("products").select("product_id").eq("product_id", product.product_id).maybeSingle();
      if (data) existingProductId = data.product_id;
    }
    if (!existingProductId && product.slug) {
      const { data } = await supabase.from("products").select("product_id").eq("slug", product.slug).maybeSingle();
      if (data) existingProductId = data.product_id;
    }

    // 2. Validate category_id (must be UUID if provided)
    let categoryId = product.category_id;
    if (categoryId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(categoryId)) {
      // Find category by slug
      const catSlug = product.category?.slug || (categoryId === "cat-1" ? "tui-pouch" : categoryId === "cat-2" ? "phu-kien-may-va" : "qua-tang");
      const { data: catData } = await supabase.from("product_categories").select("category_id").eq("slug", catSlug).maybeSingle();
      categoryId = catData?.category_id || null;
    }

    // Ensure prices are valid non-negative numbers or null to satisfy PostgreSQL check constraints
    const sanitizePrice = (val: unknown): number | null => {
      if (val === null || val === undefined || val === "") return null;
      const num = Number(val);
      if (isNaN(num)) return null;
      return Math.max(0, num);
    };

    const sanitizedPrice = sanitizePrice(product.price) ?? 0;
    const sanitizedCompareAt = sanitizePrice(product.compare_at_price);
    const sanitizedCost = sanitizePrice(product.cost_price);

    const productPayload: ProductUpsertPayload = {
      name: product.name?.trim() || "Sản phẩm Mầm Mơ",
      slug: product.slug?.trim() || `prod-${Date.now()}`,
      short_description: product.short_description || null,
      description: product.description || null,
      price: sanitizedPrice,
      compare_at_price: sanitizedCompareAt,
      cost_price: sanitizedCost,
      status: product.status || "draft",
      featured: Boolean(product.featured),
      sort_order: Number(product.sort_order) || 1,
      weight_gram: sanitizePrice(product.weight_gram) ?? 100,
      thumbnail: product.thumbnail || product.images?.[0] || null,
      category_id: categoryId,
      updated_at: new Date().toISOString(),
    };

    let savedProductId: string;

    if (existingProductId) {
      savedProductId = existingProductId;
      const { error: updateErr } = await supabase.from("products").update(productPayload).eq("product_id", existingProductId);
      if (updateErr) {
        console.error("[upsertProductServer] Error updating product:", updateErr);
        return { success: false, error: updateErr.message };
      }
    } else {
      const { data: newProd, error: insertErr } = await supabase.from("products").insert(productPayload).select("product_id").single();
      if (insertErr || !newProd) {
        console.error("[upsertProductServer] Error inserting product:", insertErr);
        return { success: false, error: insertErr?.message || "Lỗi tạo sản phẩm" };
      }
      savedProductId = newProd.product_id;
    }

    // 3. Batch 2F — SAFE variant upsert:
    //    - KHÔNG delete-all rồi insert lại (trước đây: xóa hết → insert fail
    //      là mất trắng variants/stock).
    //    - Match variant hiện có theo variant_id (UUID thật có trong DB) trước,
    //      SKU (UNIQUE theo schema 001:115) làm fallback; mơ hồ → fail closed.
    //    - Variant hiện có: UPDATE metadata, KHÔNG ghi stock từ client
    //      (chống clobber stock vừa bị order RPC trừ → chống oversell).
    //    - Variant mới: INSERT với stock payload (stock ban đầu khi tạo).
    //    - Variant vắng trong payload: GIỮ NGUYÊN (không tự xóa).
    //    - Lỗi variant trả về tường minh, không nuốt, không success giả.
    //    Lưu ý: các bước (product → variants → media) KHÔNG nằm trong 1 tx —
    //    partial update có thể xảy ra; không có rollback tự động.
    if (product.variants && product.variants.length > 0) {
      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

      // 3a. Đọc identity variants hiện có (variant_id + sku)
      const { data: existingVars, error: readVarErr } = await supabase
        .from("product_variants")
        .select("variant_id, sku")
        .eq("product_id", savedProductId);
      if (readVarErr) {
        return { success: false, error: `Không đọc được danh sách biến thể: ${readVarErr.message}` };
      }
      const dbRows: Array<{ variant_id: string; sku: string | null }> = Array.isArray(existingVars)
        ? existingVars
        : [];
      const byId = new Map<string, { variant_id: string; sku: string | null }>();
      const bySku = new Map<string, { variant_id: string; sku: string | null }>();
      for (const row of dbRows) {
        if (row.variant_id) byId.set(String(row.variant_id), row);
        if (row.sku) bySku.set(String(row.sku), row);
      }

      // 3b. Resolve SKU cho từng payload entry (giữ nguyên logic sinh SKU cũ)
      const cleanPart = (product.slug || "prod").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
      const resolved = product.variants.map((v, i) => {
        let sku = v.sku?.trim() || null;
        if (!sku) {
          sku = `GM-${cleanPart || "PROD"}-${i < 9 ? "0" : ""}${i + 1}`;
        }
        return { v, i, sku };
      });
      // SKU trùng trong payload → không xác định được variant tương ứng → fail closed
      const skuSeen = new Set<string>();
      for (const r of resolved) {
        if (skuSeen.has(r.sku)) {
          return {
            success: false,
            error: `SKU "${r.sku}" bị trùng lặp trong payload — không xác định được biến thể tương ứng (fail closed)`,
          };
        }
        skuSeen.add(r.sku);
      }

      // 3c. Match: variant_id (UUID thật trong DB) trước, SKU fallback; mơ hồ → fail closed
      type PlanItem =
        | { kind: "update"; targetVariantId: string; entry: (typeof resolved)[number] }
        | { kind: "insert"; entry: (typeof resolved)[number] };
      const claimed = new Set<string>();
      const plan: PlanItem[] = [];
      for (const entry of resolved) {
        const vid = entry.v.variant_id ? String(entry.v.variant_id) : "";
        const idRow = UUID_RE.test(vid) ? byId.get(vid) : undefined;
        if (idRow) {
          if (claimed.has(idRow.variant_id)) {
            return {
              success: false,
              error: `Nhiều biến thể trong payload match cùng biến thể hiện có (variant_id ${idRow.variant_id}) — mơ hồ (fail closed)`,
            };
          }
          claimed.add(idRow.variant_id);
          plan.push({ kind: "update", targetVariantId: idRow.variant_id, entry });
          continue;
        }
        const skuRow = bySku.get(entry.sku);
        if (skuRow) {
          if (claimed.has(skuRow.variant_id)) {
            return {
              success: false,
              error: `Nhiều biến thể trong payload match cùng biến thể hiện có (sku "${entry.sku}") — mơ hồ (fail closed)`,
            };
          }
          claimed.add(skuRow.variant_id);
          plan.push({ kind: "update", targetVariantId: skuRow.variant_id, entry });
          continue;
        }
        plan.push({ kind: "insert", entry });
      }

      // 3d. Thực thi plan: UPDATE metadata (không stock) / INSERT mới (stock payload)
      for (const item of plan) {
        const { v, i, sku } = item.entry;
        const metaPayload = {
          name: v.name || `Mẫu #${i + 1}`,
          sku,
          price: sanitizePrice(v.price),
          compare_at_price: sanitizePrice(v.compare_at_price),
          cost_price: sanitizePrice(v.cost_price),
          weight_gram: sanitizePrice(v.weight_gram) ?? 100,
          image_url: v.image_url || v.imageUrl || null,
          status: v.status || "active",
          sort_order: v.sort_order || i + 1,
          updated_at: new Date().toISOString(),
        };

        if (item.kind === "update") {
          // KHÔNG chứa stock — server giữ giá trị DB (chống clobber do order RPC trừ)
          const { data: updRows, error: updErr } = await supabase
            .from("product_variants")
            .update(metaPayload)
            .eq("variant_id", item.targetVariantId)
            .select("variant_id");
          if (updErr) {
            return { success: false, error: `Không cập nhật được biến thể "${sku}": ${updErr.message}` };
          }
          if (!Array.isArray(updRows) || updRows.length === 0) {
            return {
              success: false,
              error: `Biến thể "${sku}" không còn tồn tại khi cập nhật (đã bị xóa đồng thời?) — dừng, không đoán (fail closed)`,
            };
          }
        } else {
          // Stock ban đầu cho variant MỚI — lấy từ payload client (đã verify semantics:
          // undefined/null → 1 như hành vi cũ; phải là integer >= 0).
          const stockRaw = v.stock !== undefined && v.stock !== null ? Number(v.stock) : 1;
          if (!Number.isInteger(stockRaw) || stockRaw < 0) {
            return {
              success: false,
              error: `Stock ban đầu của biến thể mới "${sku}" không hợp lệ: ${String(v.stock)} (fail closed)`,
            };
          }
          const { error: insErr } = await supabase.from("product_variants").insert([
            { product_id: savedProductId, ...metaPayload, stock: stockRaw },
          ]);
          if (insErr) {
            return { success: false, error: `Không tạo được biến thể mới "${sku}": ${insErr.message}` };
          }
        }
      }
      // Variant có trong DB nhưng vắng trong payload: GIỮ NGUYÊN — không tự xóa.
    }

    // 4. Save media images if present (filter out bulky base64 data URIs)
    //    Lưu ý (ngoài phạm vi sửa 2F): delete+insert media KHÔNG transactional —
    //    insert fail sau delete có thể mất media (không liên quan stock).
    if (product.images && product.images.length > 0) {
      await supabase.from("product_media").delete().eq("product_id", savedProductId);
      const validImages = product.images.filter(
        (url) => url && typeof url === "string" && !url.startsWith("data:")
      );
      if (validImages.length > 0) {
        const mediaRows = validImages.map((url, idx) => ({
          product_id: savedProductId,
          url,
          sort_order: idx + 1,
          media_type: "image",
        }));
        await supabase.from("product_media").insert(mediaRows);
      }
    }

    return { success: true, product_id: savedProductId };
  } catch (err: unknown) {
    console.error("[upsertProductServer] Exception:", err);
    return { success: false, error: errorMessage(err, "Lỗi lưu sản phẩm vào database") };
  }
}

/**
 * Delete product from Supabase
 */
export async function deleteProductServer(identifier: string, slug?: string): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = createAdminClient();
    if (identifier === "all") {
      // Batch 2G.2: các bước dọn combo/media có thể đã commit nếu một
      // bước sau fail — KHÔNG giả định atomic. Kiểm tra lỗi biến thể
      // TRƯỚC khi đụng products để không half-delete thêm.
      await supabase.from("combo_items").delete().neq("combo_item_id", "00000000-0000-0000-0000-000000000000");
      await supabase.from("product_media").delete().neq("media_id", "00000000-0000-0000-0000-000000000000");
      const { error: variantAllError } = await supabase
        .from("product_variants")
        .delete()
        .neq("variant_id", "00000000-0000-0000-0000-000000000000");
      if (variantAllError) {
        console.error("[deleteProductServer] Error clearing product variants:", variantAllError);
        return {
          success: false,
          error: `Không thể xóa biến thể sản phẩm: ${variantAllError.message}. Lưu ý: các bước dọn dữ liệu trước đó (combo/media) có thể đã được áp dụng.`,
        };
      }
      const { error } = await supabase.from("products").delete().neq("product_id", "00000000-0000-0000-0000-000000000000");
      if (error) {
        console.error("[deleteProductServer] Error clearing all products:", error);
        return { success: false, error: error.message };
      }
      return { success: true };
    }

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier);

    // Resolve the actual UUID product_id from database if identifier is slug or custom id
    let targetProductId: string | null = isUuid ? identifier : null;
    if (!targetProductId) {
      const candidates = [slug, identifier].filter(Boolean) as string[];
      for (const cand of candidates) {
        const { data: p } = await supabase
          .from("products")
          .select("product_id")
          .or(`slug.eq.${cand},product_id.eq.${cand}`)
          .maybeSingle();
        if (p?.product_id) {
          targetProductId = p.product_id;
          break;
        }
      }
    }

    if (targetProductId) {
      // Clear dependent combo_items first to prevent FK constraint error.
      // Batch 2G.2: kiểm tra lỗi xóa biến thể (FK ledger có thể chặn);
      // fail TRƯỚC khi đụng products — không nuốt lỗi PostgREST.
      await supabase.from("combo_items").delete().eq("product_id", targetProductId);
      await supabase.from("product_media").delete().eq("product_id", targetProductId);
      const { error: variantError } = await supabase
        .from("product_variants")
        .delete()
        .eq("product_id", targetProductId);
      if (variantError) {
        console.error("[deleteProductServer] Error deleting product variants:", variantError);
        return {
          success: false,
          error: `Không thể xóa biến thể sản phẩm: ${variantError.message}. Lưu ý: các bước dọn dữ liệu trước đó (combo/media) có thể đã được áp dụng.`,
        };
      }
      const { error } = await supabase.from("products").delete().eq("product_id", targetProductId);
      if (error) {
        console.error("[deleteProductServer] Error deleting product by UUID:", error);
        return { success: false, error: error.message };
      }
      return { success: true };
    }

    // Fallback: try deleting by slug directly if no UUID found
    if (slug || identifier) {
      const matchSlug = slug || identifier;
      const { error } = await supabase.from("products").delete().eq("slug", matchSlug);
      if (error) {
        console.error("[deleteProductServer] Error deleting product by slug:", error);
        return { success: false, error: error.message };
      }
    }

    return { success: true };
  } catch (err: unknown) {
    console.error("[deleteProductServer] Exception:", err);
    return { success: false, error: errorMessage(err, "Lỗi xóa sản phẩm") };
  }
}
