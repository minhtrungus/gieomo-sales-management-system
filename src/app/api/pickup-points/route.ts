import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PickupPoint } from "@/types/database";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("pickup_points")
      .select("*")
      .order("created_at", { ascending: true });

    if (error) {
      console.warn("[GET /api/pickup-points] DB error:", error);
      return NextResponse.json({ success: false, pickup_points: [] });
    }

    return NextResponse.json({ success: true, pickup_points: data || [] });
  } catch (err: any) {
    console.error("[GET /api/pickup-points] Exception:", err);
    return NextResponse.json({ success: false, pickup_points: [] });
  }
}

export async function POST(request: Request) {
  try {
    const body: PickupPoint = await request.json();
    if (!body || !body.name || !body.address) {
      return NextResponse.json({ success: false, error: "Tên và địa chỉ điểm nhận là bắt buộc" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.pickup_point_id);

    const payload: any = {
      name: body.name,
      address: body.address,
      contact_name: body.contact_name || null,
      contact_phone: body.contact_phone || null,
      opening_hours: body.opening_hours || null,
      status: body.status || "active",
      updated_at: new Date().toISOString(),
    };

    if (isUuid) {
      payload.pickup_point_id = body.pickup_point_id;
    }

    const { data, error } = await supabase
      .from("pickup_points")
      .upsert(payload)
      .select()
      .single();

    if (error) {
      console.error("[POST /api/pickup-points] Error:", error);
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, pickup_point: data });
  } catch (err: any) {
    console.error("[POST /api/pickup-points] Exception:", err);
    return NextResponse.json({ success: false, error: err?.message || "Lỗi lưu điểm nhận" }, { status: 500 });
  }
}
