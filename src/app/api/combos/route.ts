import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

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
  } catch (err: any) {
    console.error("[GET /api/combos] Exception:", err);
    return NextResponse.json({ success: false, combos: [] });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body || !body.name || !body.slug) {
      return NextResponse.json(
        { success: false, error: "Tên và slug combo là bắt buộc" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.combo_id);

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

    const payload: any = {
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

    let savedComboId: string;

    if (existingComboId) {
      savedComboId = existingComboId;
      const { error: updErr } = await supabase
        .from("combos")
        .update(payload)
        .eq("combo_id", existingComboId);
      if (updErr) {
        return NextResponse.json({ success: false, error: updErr.message }, { status: 400 });
      }
    } else {
      const { data: newCombo, error: insErr } = await supabase
        .from("combos")
        .insert(payload)
        .select("combo_id")
        .single();
      if (insErr || !newCombo) {
        return NextResponse.json(
          { success: false, error: insErr?.message || "Lỗi tạo combo" },
          { status: 400 }
        );
      }
      savedComboId = newCombo.combo_id;
    }

    // Save combo items if provided
    if (body.items && Array.isArray(body.items) && body.items.length > 0) {
      await supabase.from("combo_items").delete().eq("combo_id", savedComboId);
      
      const itemRows = [];
      for (const it of body.items) {
        let pId = it.product_id;
        const isProdUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(pId);
        if (!isProdUuid && it.slug) {
          const { data: pData } = await supabase
            .from("products")
            .select("product_id")
            .eq("slug", it.slug)
            .maybeSingle();
          if (pData) pId = pData.product_id;
        }

        if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(pId)) {
          itemRows.push({
            combo_id: savedComboId,
            product_id: pId,
            quantity: Number(it.quantity) || 1,
          });
        }
      }

      if (itemRows.length > 0) {
        await supabase.from("combo_items").insert(itemRows);
      }
    }

    return NextResponse.json({ success: true, combo_id: savedComboId });
  } catch (err: any) {
    console.error("[POST /api/combos] Exception:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Lỗi lưu combo" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
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
  } catch (err: any) {
    console.error("[DELETE /api/combos] Exception:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Lỗi xóa combo" },
      { status: 500 }
    );
  }
}
