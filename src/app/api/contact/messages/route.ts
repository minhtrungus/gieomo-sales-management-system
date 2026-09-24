import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("contact_messages")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.warn("[GET /api/contact/messages] DB error (table might not exist yet):", error);
      return NextResponse.json({ success: true, messages: [] });
    }

    return NextResponse.json({ success: true, messages: data || [] });
  } catch (err: any) {
    console.error("[GET /api/contact/messages] Exception:", err);
    return NextResponse.json({ success: true, messages: [] });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { id, status, reply_note } = body;

    if (!id || !status) {
      return NextResponse.json(
        { success: false, error: "Thiếu id hoặc status tin nhắn" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();
    const updateData: any = {
      status,
      updated_at: new Date().toISOString(),
    };
    if (reply_note !== undefined) {
      updateData.reply_note = reply_note;
    }

    const { error } = await supabase
      .from("contact_messages")
      .update(updateData)
      .eq("id", id);

    if (error) {
      console.error("[PATCH /api/contact/messages] DB error:", error);
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[PATCH /api/contact/messages] Exception:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Lỗi cập nhật tin nhắn" },
      { status: 500 }
    );
  }
}
