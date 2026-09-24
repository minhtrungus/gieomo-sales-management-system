import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ProductCategory } from "@/types/database";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("product_categories")
      .select("*")
      .order("sort_order", { ascending: true });

    if (error) {
      console.warn("[GET /api/categories] DB error:", error);
      return NextResponse.json({ success: false, categories: [] });
    }

    return NextResponse.json({ success: true, categories: data || [] });
  } catch (err: any) {
    console.error("[GET /api/categories] Exception:", err);
    return NextResponse.json({ success: false, categories: [] });
  }
}

export async function POST(request: Request) {
  try {
    const body: ProductCategory = await request.json();
    if (!body || !body.name || !body.slug) {
      return NextResponse.json({ success: false, error: "Tên và slug danh mục là bắt buộc" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.category_id);

    const payload: any = {
      name: body.name,
      slug: body.slug,
      description: body.description || null,
      image_url: body.image_url || null,
      status: body.status || "active",
      sort_order: body.sort_order || 1,
      updated_at: new Date().toISOString(),
    };

    if (isUuid) {
      payload.category_id = body.category_id;
    }

    const { data, error } = await supabase
      .from("product_categories")
      .upsert(payload, { onConflict: "slug" })
      .select()
      .single();

    if (error) {
      console.error("[POST /api/categories] Error:", error);
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, category: data });
  } catch (err: any) {
    console.error("[POST /api/categories] Exception:", err);
    return NextResponse.json({ success: false, error: err?.message || "Lỗi lưu danh mục" }, { status: 500 });
  }
}
