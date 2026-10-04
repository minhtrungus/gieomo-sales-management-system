import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Voucher } from "@/types/database";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("vouchers")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.warn("[GET /api/vouchers] DB error:", error);
      return NextResponse.json({ success: false, vouchers: [] });
    }

    return NextResponse.json({ success: true, vouchers: data || [] });
  } catch (err: any) {
    console.error("[GET /api/vouchers] Exception:", err);
    return NextResponse.json({ success: false, vouchers: [] });
  }
}

export async function POST(request: Request) {
  try {
    const body: Voucher = await request.json();
    if (!body || !body.code) {
      return NextResponse.json({ success: false, error: "Mã giảm giá là bắt buộc" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.voucher_id);

    const isFreeship = body.discount_type === "freeship";
    const discountVal = Number(body.discount_value) || (isFreeship ? 15000 : 10000);

    const payload: any = {
      code: body.code.trim().toUpperCase(),
      discount_type: isFreeship ? "fixed_amount" : (body.discount_type || "fixed_amount"),
      discount_value: Math.max(1, discountVal),
      min_order_value: Number(body.min_order_value) || 0,
      usage_limit: body.usage_limit ? Number(body.usage_limit) : null,
      times_used: body.times_used || 0,
      start_date: body.start_date || null,
      end_date: body.end_date || null,
      status: body.status || "active",
    };

    if (isUuid) {
      payload.voucher_id = body.voucher_id;
    }

    const { data, error } = await supabase
      .from("vouchers")
      .upsert(payload, { onConflict: "code" })
      .select()
      .single();

    if (error) {
      console.error("[POST /api/vouchers] Error:", error);
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, voucher: data });
  } catch (err: any) {
    console.error("[POST /api/vouchers] Exception:", err);
    return NextResponse.json({ success: false, error: err?.message || "Lỗi lưu mã giảm giá" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Thiếu tham số id voucher cần xóa" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

    let query = supabase.from("vouchers").delete();
    if (isUuid) {
      query = query.eq("voucher_id", id);
    } else {
      query = query.eq("code", id.toUpperCase());
    }

    const { error } = await query;
    if (error) {
      console.error("[DELETE /api/vouchers] Error:", error);
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[DELETE /api/vouchers] Exception:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Lỗi xóa mã giảm giá" },
      { status: 500 }
    );
  }
}
