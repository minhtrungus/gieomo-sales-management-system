import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin, getAuthenticatedUser } from "@/lib/auth/serverAuth";

export const dynamic = "force-dynamic";

const CONFIG_KEY = "global_product_reviews";

/**
 * Helper to fetch backup reviews from system_configs if product_reviews table is not yet created.
 */
async function getReviewsFromConfig(supabase: any): Promise<any[]> {
  try {
    const { data } = await supabase
      .from("system_configs")
      .select("config_value")
      .eq("config_key", CONFIG_KEY)
      .maybeSingle();

    if (data?.config_value) {
      const parsed = JSON.parse(data.config_value);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (err) {
    console.warn("[getReviewsFromConfig] Error parsing config reviews:", err);
  }
  return [];
}

/**
 * Helper to save backup reviews into system_configs.
 */
async function saveReviewsToConfig(supabase: any, reviews: any[]): Promise<void> {
  try {
    await supabase.from("system_configs").upsert(
      {
        config_key: CONFIG_KEY,
        config_value: JSON.stringify(reviews),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "config_key" }
    );
  } catch (err) {
    console.warn("[saveReviewsToConfig] Error saving config reviews:", err);
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const rawProductId = searchParams.get("productId") || searchParams.get("product_id");
    const rawSlug = searchParams.get("slug");

    const productId =
      rawProductId && rawProductId !== "undefined" && rawProductId !== "null"
        ? rawProductId.trim()
        : null;
    const slug =
      rawSlug && rawSlug !== "undefined" && rawSlug !== "null" ? rawSlug.trim() : null;

    const supabase = createAdminClient();

    // 1. Try querying native product_reviews table first
    let dbReviews: any[] = [];
    try {
      let query = supabase
        .from("product_reviews")
        .select("*")
        .eq("status", "approved")
        .order("created_at", { ascending: false });

      if (productId && slug) {
        query = query.or(
          `product_id.eq.${productId},product_slug.eq.${slug},product_id.eq.${slug},product_slug.eq.${productId}`
        );
      } else if (productId) {
        query = query.or(`product_id.eq.${productId},product_slug.eq.${productId}`);
      } else if (slug) {
        query = query.or(`product_slug.eq.${slug},product_id.eq.${slug}`);
      }

      const { data, error } = await query;
      if (!error && Array.isArray(data)) {
        dbReviews = data.map((r) => ({
          review_id: r.review_id,
          product_id: r.product_id,
          product_slug: r.product_slug,
          author_name: r.author_name,
          phone_masked: r.phone_masked,
          rating: r.rating,
          comment: r.comment,
          images: Array.isArray(r.images) ? r.images : [],
          is_verified_buyer: r.is_verified_buyer,
          status: r.status,
          created_at: r.created_at,
        }));
      }
    } catch {
      // product_reviews table might not exist yet
    }

    // 2. Fetch from system_configs backup
    const configList = await getReviewsFromConfig(supabase);
    let filteredConfig = configList.filter((r) => r.status === "approved" || !r.status);
    if (productId || slug) {
      filteredConfig = filteredConfig.filter((r) => {
        const matchesId = productId && (r.product_id === productId || r.product_slug === productId);
        const matchesSlug = slug && (r.product_slug === slug || r.product_id === slug);
        return matchesId || matchesSlug;
      });
    }

    // 3. Merge both sources (dedup by review_id)
    const combinedMap = new Map<string, any>();
    for (const r of filteredConfig) {
      combinedMap.set(r.review_id, r);
    }
    for (const r of dbReviews) {
      combinedMap.set(r.review_id, r);
    }

    const merged = Array.from(combinedMap.values()).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    return NextResponse.json({ success: true, reviews: merged });
  } catch (err: any) {
    console.error("[GET /api/reviews] Exception:", err);
    return NextResponse.json({ success: true, reviews: [] });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      product_id,
      product_slug,
      author_name,
      phone_masked,
      rating,
      comment,
      images = [],
    } = body;

    if (!product_id || !author_name?.trim() || !comment?.trim()) {
      return NextResponse.json(
        { success: false, error: "Thiếu thông tin đánh giá (product_id, author_name, comment)" },
        { status: 400 }
      );
    }

    // Check if requester is authenticated admin for custom verified status
    const user = await getAuthenticatedUser(request);
    const isAdmin = Boolean(user && user.role === "admin");

    const numericRating = Math.min(5, Math.max(1, Number(rating) || 5));
    const supabase = createAdminClient();

    // Server-enforced verification: default false unless admin verifies
    const isVerifiedBuyer = isAdmin ? Boolean(body.is_verified_buyer) : false;
    const reviewStatus = "approved";

    const newRecord = {
      review_id: `rev-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      product_id: String(product_id),
      product_slug: product_slug ? String(product_slug) : null,
      author_name: author_name.trim().slice(0, 80),
      phone_masked: phone_masked ? String(phone_masked).slice(0, 20) : null,
      rating: numericRating,
      comment: comment.trim().slice(0, 1000),
      images: Array.isArray(images) ? images.slice(0, 5) : [],
      is_verified_buyer: isVerifiedBuyer,
      status: reviewStatus,
      created_at: new Date().toISOString(),
    };

    // 1. Try inserting into native product_reviews table
    const { data, error } = await supabase
      .from("product_reviews")
      .insert([
        {
          product_id: newRecord.product_id,
          product_slug: newRecord.product_slug,
          author_name: newRecord.author_name,
          phone_masked: newRecord.phone_masked,
          rating: newRecord.rating,
          comment: newRecord.comment,
          images: newRecord.images,
          is_verified_buyer: newRecord.is_verified_buyer,
          status: newRecord.status,
        },
      ])
      .select()
      .single();

    if (!error && data) {
      newRecord.review_id = data.review_id;
    }

    // 2. Always persist into system_configs as durable cross-device sync
    const currentList = await getReviewsFromConfig(supabase);
    const updated = [newRecord, ...currentList.filter((r) => r.review_id !== newRecord.review_id)];
    await saveReviewsToConfig(supabase, updated);

    return NextResponse.json({
      success: true,
      review: newRecord,
    });
  } catch (err: any) {
    console.error("[POST /api/reviews] Exception:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Lỗi lưu đánh giá" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const authCheck = await requireAdmin(request);
    if (!authCheck.authorized) {
      return authCheck.response;
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Thiếu tham số id đánh giá cần xóa" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // 1. Delete from native table if exists
    try {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
      if (isUuid) {
        await supabase.from("product_reviews").delete().eq("review_id", id);
      } else {
        await supabase.from("product_reviews").delete().or(`review_id.eq.${id}`);
      }
    } catch (e) {
      console.warn("[DELETE /api/reviews] Note on deleting from product_reviews table:", e);
    }

    // 2. Delete from system_configs backup unconditionally
    const currentList = await getReviewsFromConfig(supabase);
    const updated = currentList.filter((r) => r.review_id !== id && r.id !== id);
    await saveReviewsToConfig(supabase, updated);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[DELETE /api/reviews] Exception:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Lỗi xóa đánh giá" },
      { status: 500 }
    );
  }
}
