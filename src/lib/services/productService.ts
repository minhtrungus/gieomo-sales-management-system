import { createAdminClient } from "@/lib/supabase/admin";
import type { ExtendedProduct } from "@/lib/data/mockData";
import type { ProductVariant } from "@/types/database";

const DEFAULT_PRODUCT_IMAGES: Record<string, string> = {
  "pouch-mam-mo": "/images/products/pounch_1.png",
  "kep-toc-nut-ao": "/images/products/kep-toc-1.jpg",
  "tui-tote-gieo-mo": "/images/products/tote-gieo-mo-1.jpg",
  "bo-kim-chi-mam-mo": "/images/products/bo-kim-chi-1.jpg",
  "sticker-pack-mam-mo": "/images/products/sticker-pack-1.jpg",
};

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
        category:product_categories(category_id, name, slug, description, image_url, status, sort_order, created_at),
        variants:product_variants(variant_id, product_id, sku, name, price, compare_at_price, cost_price, stock, weight_gram, status, sort_order, created_at, updated_at),
        media:product_media(media_id, url, sort_order, alt_text)
      `)
      .order("sort_order", { ascending: true });

    if (!includeDrafts) {
      query = query.eq("status", "active");
    }

    const { data, error } = await query;
    if (error) {
      console.warn("[getProductsServer] Error querying products from Supabase:", error);
      return [];
    }

    if (!data || data.length === 0) {
      return [];
    }

    return (data as any[]).map((p) => {
      // Map media to images array
      const mediaImages = (p.media || [])
        .sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0))
        .map((m: any) => m.url);
      
      const fallbackImage = (p.slug && DEFAULT_PRODUCT_IMAGES[p.slug]) || "/images/products/pounch_1.png";
      const images = mediaImages.length > 0
        ? mediaImages
        : p.thumbnail
        ? [p.thumbnail]
        : [fallbackImage];

      // Map variants with warehouse calculations
      const variants: ProductVariant[] = (p.variants || []).map((v: any) => {
        const stock = v.stock ?? 0;
        const wh1 = Math.ceil(stock * 0.7);
        const wh2 = stock - wh1;
        return {
          ...v,
          stock,
          stock_warehouse_1: wh1,
          stock_warehouse_2: wh2,
          warehouse_stocks: {
            "wh-1": wh1,
            "wh-2": wh2,
          },
        };
      });

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
        category: p.category || undefined,
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
  try {
    const products = await getProductsServer(true);
    const found = products.find((p) => p.slug === slug);
    if (found) return found;

    const { MOCK_PRODUCTS } = await import("@/lib/data/mockData");
    return MOCK_PRODUCTS.find((p) => p.slug === slug) ?? null;
  } catch (err) {
    console.warn("[getProductBySlugServer] Error:", err);
    const { MOCK_PRODUCTS } = await import("@/lib/data/mockData");
    return MOCK_PRODUCTS.find((p) => p.slug === slug) ?? null;
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

    const productPayload: any = {
      name: product.name,
      slug: product.slug,
      short_description: product.short_description || null,
      description: product.description || null,
      price: product.price,
      compare_at_price: product.compare_at_price || null,
      cost_price: product.cost_price || null,
      status: product.status || "draft",
      featured: Boolean(product.featured),
      sort_order: product.sort_order || 1,
      weight_gram: product.weight_gram || 100,
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

    // 3. Upsert variants if present
    if (product.variants && product.variants.length > 0) {
      for (const v of product.variants) {
        const isVarUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v.variant_id);
        const varPayload: any = {
          product_id: savedProductId,
          name: v.name,
          sku: v.sku || null,
          price: v.price || null,
          compare_at_price: v.compare_at_price || null,
          cost_price: v.cost_price || null,
          stock: v.stock || 0,
          weight_gram: v.weight_gram || 100,
          status: v.status || "active",
          sort_order: v.sort_order || 1,
          updated_at: new Date().toISOString(),
        };

        if (isVarUuid) {
          await supabase.from("product_variants").upsert({ ...varPayload, variant_id: v.variant_id });
        } else if (v.sku) {
          const { data: exVar } = await supabase.from("product_variants").select("variant_id").eq("product_id", savedProductId).eq("sku", v.sku).maybeSingle();
          if (exVar) {
            await supabase.from("product_variants").update(varPayload).eq("variant_id", exVar.variant_id);
          } else {
            await supabase.from("product_variants").insert(varPayload);
          }
        } else {
          await supabase.from("product_variants").insert(varPayload);
        }
      }
    }

    // 4. Save media images if present
    if (product.images && product.images.length > 0) {
      // Clear existing media & re-insert
      await supabase.from("product_media").delete().eq("product_id", savedProductId);
      const mediaRows = product.images.map((url, idx) => ({
        product_id: savedProductId,
        url,
        sort_order: idx + 1,
        media_type: "image",
      }));
      await supabase.from("product_media").insert(mediaRows);
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
export async function deleteProductServer(identifier: string): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = createAdminClient();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier);

    let query = supabase.from("products").delete();
    if (isUuid) {
      query = query.eq("product_id", identifier);
    } else {
      query = query.eq("slug", identifier);
    }

    const { error } = await query;
    if (error) {
      console.error("[deleteProductServer] Error deleting product:", error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: any) {
    console.error("[deleteProductServer] Exception:", err);
    return { success: false, error: err?.message || "Lỗi xóa sản phẩm" };
  }
}
