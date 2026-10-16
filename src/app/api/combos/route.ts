import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

import { requireAdmin } from "@/lib/auth/serverAuth";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ValidatedItem = {
  product_id: string;
  variant_id: string;
  quantity: number;
};

type ValidationResult =
  | { ok: true; rows: ValidatedItem[] }
  | { ok: false; error: string };

type ComboItemInput = {
  product_id?: unknown;
  variant_id?: unknown;
  quantity?: unknown;
  slug?: unknown;
  name?: unknown;
  product?: {
    product_id?: unknown;
    slug?: unknown;
    name?: unknown;
  };
};

type ComboRequestBody = {
  combo_id?: string;
  id?: string;
  name?: string;
  slug?: string;
  price?: unknown;
  thumbnail?: unknown;
  image_url?: unknown;
  description?: unknown;
  status?: string;
  featured?: unknown;
  sort_order?: unknown;
  items?: unknown;
};

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

// Quantity phải là số nguyên dương. Không âm thầm đổi giá trị không hợp lệ
// thành 1 — trả về null để reject 400 trước mọi write.
function parseQuantity(raw: unknown): number | null {
  if (typeof raw === "number") {
    return Number.isInteger(raw) && raw > 0 ? raw : null;
  }
  if (typeof raw === "string" && /^\d+$/.test(raw.trim())) {
    const n = Number(raw.trim());
    return Number.isInteger(n) && n > 0 ? n : null;
  }
  return null;
}

async function resolveProductId(
  supabase: ReturnType<typeof createAdminClient>,
  it: ComboItemInput
): Promise<{ ok: true; product_id: string } | { ok: false; error: string }> {
  let pId = typeof it.product_id === "string"
    ? it.product_id
    : typeof it.product?.product_id === "string"
      ? it.product.product_id
      : "";
  let isProdUuid = UUID_RE.test(pId);
  const slug = typeof it.slug === "string"
    ? it.slug
    : typeof it.product?.slug === "string"
      ? it.product.slug
      : "";
  const name = typeof it.name === "string"
    ? it.name
    : typeof it.product?.name === "string"
      ? it.product.name
      : "";

  if (!isProdUuid && slug) {
    const { data: pData } = await supabase
      .from("products")
      .select("product_id")
      .eq("slug", slug)
      .maybeSingle();
    if (pData) {
      pId = pData.product_id;
      isProdUuid = true;
    }
  }

  if (!isProdUuid && name) {
    const { data: pNameData } = await supabase
      .from("products")
      .select("product_id")
      .ilike("name", `%${name}%`)
      .limit(1)
      .maybeSingle();
    if (pNameData) {
      pId = pNameData.product_id;
      isProdUuid = true;
    }
  }

  if (!isProdUuid || !pId) {
    return { ok: false, error: "không xác định được sản phẩm (cần product_id hoặc slug hợp lệ)" };
  }

  const { data: prod, error: pErr } = await supabase
    .from("products")
    .select("product_id")
    .eq("product_id", pId)
    .maybeSingle();
  if (pErr) {
    return { ok: false, error: `không kiểm tra được sản phẩm (${pErr.message})` };
  }
  if (!prod) {
    return { ok: false, error: "sản phẩm không tồn tại" };
  }
  return { ok: true, product_id: prod.product_id };
}

async function validateComboItems(
  supabase: ReturnType<typeof createAdminClient>,
  items: unknown[]
): Promise<ValidationResult> {
  const rows: ValidatedItem[] = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i] && typeof items[i] === "object"
      ? items[i] as ComboItemInput
      : {};
    const label = `Thành phần #${i + 1}`;

    const quantity = parseQuantity(it.quantity);
    if (quantity === null) {
      return {
        ok: false,
        error: `${label}: quantity phải là số nguyên dương (thiếu, sai kiểu, bằng 0, âm hoặc thập phân đều bị từ chối; nhận được: ${JSON.stringify(it.quantity) ?? "undefined"})`,
      };
    }

    const resolved = await resolveProductId(supabase, it);
    if (!resolved.ok) {
      return { ok: false, error: `${label}: ${resolved.error}` };
    }

    const variantId = typeof it.variant_id === "string" ? it.variant_id.trim() : "";
    if (!variantId) {
      return {
        ok: false,
        error: `${label}: chưa chọn phân loại sản phẩm (variant). Mỗi thành phần combo phải chọn tường minh một phân loại — hệ thống không tự gán.`,
      };
    }
    if (!UUID_RE.test(variantId)) {
      return { ok: false, error: `${label}: variant_id không hợp lệ` };
    }

    const { data: variant, error: vErr } = await supabase
      .from("product_variants")
      .select("variant_id, product_id, name")
      .eq("variant_id", variantId)
      .maybeSingle();
    if (vErr) {
      return { ok: false, error: `${label}: không kiểm tra được phân loại (${vErr.message})` };
    }
    if (!variant) {
      return { ok: false, error: `${label}: phân loại sản phẩm không tồn tại` };
    }
    if (variant.product_id !== resolved.product_id) {
      return { ok: false, error: `${label}: phân loại không thuộc sản phẩm đã chọn` };
    }

    rows.push({
      product_id: resolved.product_id,
      variant_id: variant.variant_id,
      quantity,
    });
  }
  return { ok: true, rows };
}

export async function GET() {
  try {
    const supabase = createAdminClient();
    const { data: combos, error } = await supabase
      .from("combos")
      .select(`
        combo_id,
        name,
        slug,
        price,
        image_url,
        description,
        status,
        featured,
        sort_order,
        created_at,
        updated_at,
        combo_items(
          combo_item_id,
          product_id,
          variant_id,
          quantity,
          product:products(product_id, name, slug, price, thumbnail)
        )
      `)
      .order("sort_order", { ascending: true });

    if (error) {
      console.warn("[GET /api/combos] DB Error:", error);
      return NextResponse.json({ success: false, combos: [] });
    }

    return NextResponse.json({ success: true, combos: combos || [] });
  } catch (err: unknown) {
    console.error("[GET /api/combos] Exception:", err);
    return NextResponse.json({ success: false, combos: [] });
  }
}

export async function POST(request: Request) {
  try {
    const authCheck = await requireAdmin(request);
    if (!authCheck.authorized) {
      return authCheck.response;
    }

    const body = (await request.json()) as ComboRequestBody;
    if (!body || !body.name || !body.slug) {
      return NextResponse.json(
        { success: false, error: "Tên và slug combo là bắt buộc" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Validate toàn bộ thành phần TRƯỚC khi ghi bất kỳ dữ liệu nào.
    let validatedItems: ValidatedItem[] | null = null;
    if (body.items !== undefined) {
      if (body.items === null || !Array.isArray(body.items)) {
        return NextResponse.json(
          { success: false, error: "Trường items phải là mảng" },
          { status: 400 }
        );
      }
      if (body.items.length > 0) {
        const validation = await validateComboItems(supabase, body.items);
        if (!validation.ok) {
          return NextResponse.json({ success: false, error: validation.error }, { status: 400 });
        }
        validatedItems = validation.rows;
      }
      // items: [] → không đụng combo_items
    }

    const isUuid = UUID_RE.test(body.combo_id || "");

    // Check existing by UUID or slug
    let existingComboId: string | null = null;
    if (isUuid) {
      const { data } = await supabase
        .from("combos")
        .select("combo_id")
        .eq("combo_id", body.combo_id)
        .maybeSingle();
      if (data) existingComboId = data.combo_id;
    }
    if (!existingComboId && body.slug) {
      const { data } = await supabase
        .from("combos")
        .select("combo_id")
        .eq("slug", body.slug)
        .maybeSingle();
      if (data) existingComboId = data.combo_id;
    }

    const payload: Record<string, unknown> = {
      name: body.name.trim(),
      slug: body.slug.trim(),
      price: Number(body.price) || 0,
      image_url: body.thumbnail || body.image_url || null,
      description: body.description || null,
      status: body.status || "active",
      featured: Boolean(body.featured),
      sort_order: Number(body.sort_order) || 1,
      updated_at: new Date().toISOString(),
    };

    const { data: saved, error: saveError } = await supabase.rpc("save_combo_atomic", {
      p: {
        combo_id: existingComboId,
        lookup_slug: body.slug,
        ...payload,
        ...(validatedItems ? { replace_items: true, items: validatedItems } : {}),
      },
    });
    if (saveError || saved?.outcome !== "saved") {
      return NextResponse.json(
        {
          success: false,
          error: saveError?.message || `Không thể lưu combo (${saved?.outcome || "invalid_result"})`,
        },
        { status: saveError?.message?.includes("C1:") ? 400 : saveError ? 500 : 400 }
      );
    }

    return NextResponse.json({ success: true, combo_id: saved.combo_id });
  } catch (err: unknown) {
    console.error("[POST /api/combos] Exception:", err);
    return NextResponse.json(
      { success: false, error: errorMessage(err, "Lỗi lưu combo") },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const authCheck = await requireAdmin(request);
    if (!authCheck.authorized) {
      return authCheck.response;
    }

    const body = (await request.json()) as ComboRequestBody;
    const { id, slug, name, price, image_url, description, status, featured, sort_order, items } = body;

    if (!id && !slug) {
      return NextResponse.json(
        { success: false, error: "Thiếu id hoặc slug combo cần cập nhật" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Validate toàn bộ thành phần TRƯỚC khi ghi bất kỳ dữ liệu nào.
    let validatedItems: ValidatedItem[] | null = null;
    if (items !== undefined) {
      if (items === null || !Array.isArray(items)) {
        return NextResponse.json(
          { success: false, error: "Trường items phải là mảng" },
          { status: 400 }
        );
      }
      if (items.length > 0) {
        const validation = await validateComboItems(supabase, items);
        if (!validation.ok) {
          return NextResponse.json({ success: false, error: validation.error }, { status: 400 });
        }
        validatedItems = validation.rows;
      }
      // items: [] → không đụng combo_items
    }

    const isUuid = id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

    // Find existing combo
    let existingComboId: string | null = null;
    if (isUuid) {
      const { data } = await supabase
        .from("combos")
        .select("combo_id")
        .eq("combo_id", id)
        .maybeSingle();
      if (data) existingComboId = data.combo_id;
    }
    if (!existingComboId && slug) {
      const { data } = await supabase
        .from("combos")
        .select("combo_id")
        .eq("slug", slug)
        .maybeSingle();
      if (data) existingComboId = data.combo_id;
    }

    if (!existingComboId) {
      return NextResponse.json({ success: false, error: "Không tìm thấy combo" }, { status: 404 });
    }

    const payload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (name !== undefined) payload.name = name.trim();
    if (slug !== undefined) payload.slug = slug.trim();
    if (price !== undefined) payload.price = Number(price) || 0;
    if (image_url !== undefined) payload.image_url = image_url;
    if (description !== undefined) payload.description = description;
    if (status !== undefined) payload.status = status;
    if (featured !== undefined) payload.featured = Boolean(featured);
    if (sort_order !== undefined) payload.sort_order = Number(sort_order) || 1;

    const { data: saved, error: saveError } = await supabase.rpc("save_combo_atomic", {
      p: {
        combo_id: existingComboId,
        ...payload,
        ...(validatedItems ? { replace_items: true, items: validatedItems } : {}),
      },
    });
    if (saveError || saved?.outcome !== "saved") {
      return NextResponse.json(
        {
          success: false,
          error: saveError?.message || `Không thể cập nhật combo (${saved?.outcome || "invalid_result"})`,
        },
        { status: saveError?.message?.includes("C1:") ? 400 : saveError ? 500 : 400 }
      );
    }

    return NextResponse.json({ success: true, combo_id: saved.combo_id });
  } catch (err: unknown) {
    console.error("[PATCH /api/combos] Exception:", err);
    return NextResponse.json(
      { success: false, error: errorMessage(err, "Lỗi cập nhật combo") },
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
    const slug = searchParams.get("slug");

    if (!id && !slug) {
      return NextResponse.json(
        { success: false, error: "Thiếu tham số id hoặc slug combo cần xóa" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();
    const isUuid = id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

    let query = supabase.from("combos").delete();
    if (isUuid) {
      query = query.eq("combo_id", id);
    } else if (slug) {
      query = query.eq("slug", slug);
    } else if (id) {
      query = query.or(`combo_id.eq.${id},slug.eq.${id}`);
    }

    const { error } = await query;
    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    console.error("[DELETE /api/combos] Exception:", err);
    return NextResponse.json(
      { success: false, error: errorMessage(err, "Lỗi xóa combo") },
      { status: 500 }
    );
  }
}
