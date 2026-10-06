import { createAdminClient } from "@/lib/supabase/admin";
import type { ExtendedProduct } from "@/lib/data/mockData";
import type { ProductVariant } from "@/types/database";



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

    let { data, error } = await query;
    if (error) {
      console.warn("[getProductsServer] Primary query returned notice:", error?.message || error);
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
          console.warn("[getProductsServer] Fallback query failed:", fbErr);
          return [];
        }

        // Fetch variants and media separately
        const { data: allVariants } = await supabase.from("product_variants").select("*");
        const { data: allMedia } = await supabase.from("product_media").select("*");

        data = rawProds.map((p: any) => ({
          ...p,
          product_variants: (allVariants || []).filter((v: any) => v.product_id === p.product_id),
          product_media: (allMedia || []).filter((m: any) => m.product_id === p.product_id),
        }));
      } catch (fallbackEx) {
        console.error("[getProductsServer] Exception during fallback:", fallbackEx);
        return [];
      }
    }

    if (!data || data.length === 0) {
      return [];
    }

    return (data as any[]).map((p) => {
      // Map media to images array
      const rawMedia = p.product_media || p.media || [];
      const mediaImages = (Array.isArray(rawMedia) ? rawMedia : [])
        .sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0))
        .map((m: any) => m.url);
      
      const fallbackImage = p.thumbnail || "/images/placeholder.jpg";
      const images = mediaImages.length > 0
        ? mediaImages
        : p.thumbnail
        ? [p.thumbnail]
        : [fallbackImage];

      // Map variants with warehouse calculations
      const rawVariants = p.product_variants || p.variants || [];
      const variantsList = Array.isArray(rawVariants) ? rawVariants : [];
      const variants: ProductVariant[] = variantsList.map((v: any) => {
        const stock = v.stock ?? 0;
        const wh1 = Math.ceil(stock * 0.7);
        const wh2 = stock - wh1;
        return {
          ...v,
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
        thumbnail: p.thumbnail || images[0] || "/images/products/pounch_1.png",
        images,
        category: category || undefined,
        variants,
        created_at: p.created_at,
        updated_at: p.updated_at,
      };
    });
  } catch (err) {
    console.error("[getProductsServer] Unexpected exception:", err);
    return [];
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
        const rawMedia = (p as any).product_media || (p as any).media || [];
        const mediaImages = (Array.isArray(rawMedia) ? rawMedia : [])
          .sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0))
          .map((m: any) => m.url);
        const fallbackImage = p.thumbnail || "/images/placeholder.jpg";
        const images = mediaImages.length > 0 ? mediaImages : p.thumbnail ? [p.thumbnail] : [fallbackImage];

        const rawVariants = (p as any).product_variants || (p as any).variants || [];
        const variantsList = Array.isArray(rawVariants) ? rawVariants : [];
        const variants: ProductVariant[] = variantsList.map((v: any) => {
          const stock = v.stock ?? 0;
          const wh1 = Math.ceil(stock * 0.7);
          const wh2 = stock - wh1;
          return {
            ...v,
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

        const rawCategory = (p as any).product_categories || (p as any).category;
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
          thumbnail: p.thumbnail || images[0] || "/images/products/pounch_1.png",
          images,
          category: category || undefined,
          variants,
          created_at: p.created_at,
          updated_at: p.updated_at,
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
  } catch (err: any) {
    console.error("[toggleProductStatusServer] Exception:", err);
    return { success: false, error: err?.message || "Lỗi cập nhật trạng thái" };
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
  } catch (err: any) {
    console.error("[toggleProductFeaturedServer] Exception:", err);
    return { success: false, error: err?.message || "Lỗi cập nhật nổi bật" };
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
    const sanitizePrice = (val: any): number | null => {
      if (val === null || val === undefined || val === "") return null;
      const num = Number(val);
      if (isNaN(num)) return null;
      return Math.max(0, num);
    };

    const sanitizedPrice = sanitizePrice(product.price) ?? 0;
    const sanitizedCompareAt = sanitizePrice(product.compare_at_price);
    const sanitizedCost = sanitizePrice(product.cost_price);

    const productPayload: any = {
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

    // 3. Batch save variants if present (Ultra-fast 1-query batch insert)
    if (product.variants && product.variants.length > 0) {
      const varPayloads = product.variants.map((v, i) => {
        let sku = v.sku?.trim() || null;
        if (!sku) {
          const cleanPart = (product.slug || "prod").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
          sku = `GM-${cleanPart || "PROD"}-${i < 9 ? "0" : ""}${i + 1}`;
        }

        const stockVal = v.stock !== undefined && v.stock !== null ? Number(v.stock) : 1;
        const wh1 = v.stock_warehouse_1 !== undefined ? Number(v.stock_warehouse_1) : stockVal;
        const wh2 = v.stock_warehouse_2 !== undefined ? Number(v.stock_warehouse_2) : 0;

        return {
          product_id: savedProductId,
          name: v.name || `Mẫu #${i + 1}`,
          sku: sku,
          price: sanitizePrice(v.price),
          compare_at_price: sanitizePrice(v.compare_at_price),
          cost_price: sanitizePrice(v.cost_price),
          stock: stockVal,
          weight_gram: sanitizePrice(v.weight_gram) ?? 100,
          image_url: v.image_url || (v as any).imageUrl || null,
          status: v.status || "active",
          sort_order: v.sort_order || i + 1,
          updated_at: new Date().toISOString(),
        };
      });

      // Clear existing variants and batch insert fresh ones in parallel
      try {
        await supabase.from("product_variants").delete().eq("product_id", savedProductId);
        const { error: batchVarErr } = await supabase.from("product_variants").insert(varPayloads);
        if (batchVarErr) {
          console.warn("[upsertProductServer] Batch insert warning, attempting fallback:", batchVarErr.message);
          // Fallback if image_url column doesn't exist yet on remote table
          const sanitizedPayloads = varPayloads.map(({ image_url, ...rest }) => rest);
          await supabase.from("product_variants").insert(sanitizedPayloads);
        }
      } catch (varEx) {
        console.error("[upsertProductServer] Error batch inserting variants:", varEx);
      }
    }

    // 4. Save media images if present (filter out bulky base64 data URIs)
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
  } catch (err: any) {
    console.error("[upsertProductServer] Exception:", err);
    return { success: false, error: err?.message || "Lỗi lưu sản phẩm vào database" };
  }
}

/**
 * Delete product from Supabase
 */
export async function deleteProductServer(identifier: string, slug?: string): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = createAdminClient();
    if (identifier === "all") {
      await supabase.from("combo_items").delete().neq("combo_item_id", "00000000-0000-0000-0000-000000000000");
      await supabase.from("product_media").delete().neq("media_id", "00000000-0000-0000-0000-000000000000");
      await supabase.from("product_variants").delete().neq("variant_id", "00000000-0000-0000-0000-000000000000");
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
      // Clear dependent combo_items first to prevent FK constraint error
      await supabase.from("combo_items").delete().eq("product_id", targetProductId);
      await supabase.from("product_media").delete().eq("product_id", targetProductId);
      await supabase.from("product_variants").delete().eq("product_id", targetProductId);
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
  } catch (err: any) {
    console.error("[deleteProductServer] Exception:", err);
    return { success: false, error: err?.message || "Lỗi xóa sản phẩm" };
  }
}
