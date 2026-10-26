import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ProductCategory } from "@/types/database";
import { requireAdmin } from "@/lib/auth/serverAuth";

export const dynamic = "force-dynamic";

type CategoryWritePayload = Partial<
  Pick<ProductCategory, "category_id" | "name" | "slug" | "description" | "image_url" | "status" | "sort_order">
> & { updated_at: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

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
  } catch (err: unknown) {
    console.error("[GET /api/categories] Exception:", err);
    return NextResponse.json({ success: false, categories: [] });
  }
}

export async function POST(request: Request) {
  try {
    const authCheck = await requireAdmin(request);
    if (!authCheck.authorized) {
      return authCheck.response;
    }

    const body: unknown = await request.json();
    if (!isRecord(body) || typeof body.name !== "string" || typeof body.slug !== "string") {
      return NextResponse.json({ success: false, error: "Tên và slug danh mục là bắt buộc" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const categoryId = typeof body.category_id === "string" ? body.category_id : "";
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(categoryId);

    const payload: CategoryWritePayload = {
      name: body.name,
      slug: body.slug,
      description: typeof body.description === "string" ? body.description : null,
      image_url: typeof body.image_url === "string" ? body.image_url : null,
      status: body.status === "draft" || body.status === "archived" ? body.status : "active",
      sort_order: typeof body.sort_order === "number" ? body.sort_order : 1,
      updated_at: new Date().toISOString(),
    };

    if (isUuid) {
      payload.category_id = categoryId;
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
  } catch (err: unknown) {
    console.error("[POST /api/categories] Exception:", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Lỗi lưu danh mục" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const authCheck = await requireAdmin(request);
    if (!authCheck.authorized) {
      return authCheck.response;
    }

    const body: unknown = await request.json();
    if (!isRecord(body)) {
      return NextResponse.json({ success: false, error: "Dữ liệu danh mục không hợp lệ" }, { status: 400 });
    }
    const id = typeof body.id === "string" ? body.id : "";
    const name = typeof body.name === "string" ? body.name : undefined;
    const slug = typeof body.slug === "string" ? body.slug : undefined;
    const description =
      typeof body.description === "string" || body.description === null
        ? body.description
        : undefined;
    const imageUrl =
      typeof body.image_url === "string" || body.image_url === null
        ? body.image_url
        : undefined;
    const status =
      body.status === "active" || body.status === "draft" || body.status === "archived"
        ? body.status
        : undefined;
    const sortOrder = typeof body.sort_order === "number" ? body.sort_order : undefined;

    if (!id && !slug) {
      return NextResponse.json(
        { success: false, error: "Thiếu id hoặc slug danh mục cần cập nhật" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();
    const isUuid = id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

    const payload: CategoryWritePayload = {
      updated_at: new Date().toISOString(),
    };

    if (name !== undefined) payload.name = name;
    if (slug !== undefined) payload.slug = slug;
    if (description !== undefined) payload.description = description;
    if (imageUrl !== undefined) payload.image_url = imageUrl;
    if (status !== undefined) payload.status = status;
    if (sortOrder !== undefined) payload.sort_order = sortOrder;

    let query = supabase.from("product_categories").update(payload);
    if (isUuid) {
      query = query.eq("category_id", id);
    } else if (slug) {
      query = query.eq("slug", slug);
    } else {
      query = query.eq("category_id", id);
    }

    const { data, error } = await query.select().single();

    if (error) {
      console.error("[PATCH /api/categories] Error:", error);
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, category: data });
  } catch (err: unknown) {
    console.error("[PATCH /api/categories] Exception:", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Lỗi cập nhật danh mục" },
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
    const categoryId = searchParams.get("id");

    if (!categoryId) {
      return NextResponse.json({ success: false, error: "category_id là bắt buộc" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(categoryId);
    let deleteQuery;
    if (isUuid) {
      deleteQuery = supabase.from("product_categories").delete().eq("category_id", categoryId);
    } else {
      deleteQuery = supabase.from("product_categories").delete().or(`slug.eq.${categoryId},name.eq.${categoryId}`);
    }

    const { error } = await deleteQuery;
    if (error) {
      console.error("[DELETE /api/categories] Error:", error);
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    console.error("[DELETE /api/categories] Exception:", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Lỗi xóa danh mục" },
      { status: 500 },
    );
  }
}
