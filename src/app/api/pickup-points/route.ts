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
      name: body.name.trim(),
      address: body.address.trim(),
      contact_name: body.contact_name || null,
      contact_phone: body.contact_phone || null,
      opening_hours: body.opening_hours || null,
      status: body.status || "active",
      updated_at: new Date().toISOString(),
    };

    let existingPointId: string | null = null;
    if (isUuid) {
      existingPointId = body.pickup_point_id;
    } else if (body.name) {
      const { data: exPoint } = await supabase
        .from("pickup_points")
        .select("pickup_point_id")
        .eq("name", body.name.trim())
        .maybeSingle();
      if (exPoint) existingPointId = exPoint.pickup_point_id;
    }

    let savedPoint: any;
    if (existingPointId) {
      const { data, error } = await supabase
        .from("pickup_points")
        .update(payload)
        .eq("pickup_point_id", existingPointId)
        .select()
        .single();
      if (error) {
        console.error("[POST /api/pickup-points] Update error:", error);
        return NextResponse.json({ success: false, error: error.message }, { status: 400 });
      }
      savedPoint = data;
    } else {
      const { data, error } = await supabase
        .from("pickup_points")
        .insert(payload)
        .select()
        .single();
      if (error) {
        console.error("[POST /api/pickup-points] Insert error:", error);
        return NextResponse.json({ success: false, error: error.message }, { status: 400 });
      }
      savedPoint = data;
    }

    return NextResponse.json({ success: true, pickup_point: savedPoint });
  } catch (err: any) {
    console.error("[POST /api/pickup-points] Exception:", err);
    return NextResponse.json({ success: false, error: err?.message || "Lỗi lưu điểm nhận" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const name = searchParams.get("name");

    if (!id && !name) {
      return NextResponse.json(
        { success: false, error: "Thiếu tham số id hoặc name điểm nhận cần xóa" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();
    const isUuid = id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

    let query = supabase.from("pickup_points").delete();
    if (isUuid) {
      query = query.eq("pickup_point_id", id);
    } else if (name) {
      query = query.eq("name", name);
    } else if (id) {
      query = query.or(`pickup_point_id.eq.${id},name.eq.${id}`);
    }

    const { error } = await query;
    if (error) {
      console.error("[DELETE /api/pickup-points] Error:", error);
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[DELETE /api/pickup-points] Exception:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Lỗi xóa điểm nhận" },
      { status: 500 }
    );
  }
}
