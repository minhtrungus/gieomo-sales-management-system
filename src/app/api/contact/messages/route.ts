import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/serverAuth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const authCheck = await requireAdmin(request);
    if (!authCheck.authorized) {
      return authCheck.response;
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("contact_messages")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.warn("[GET /api/contact/messages] DB error:", error);
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
    const authCheck = await requireAdmin(request);
    if (!authCheck.authorized) {
      return authCheck.response;
    }

    const body = await request.json();
    const { id, status, reply_note } = body;

    if (!id || !status) {
      return NextResponse.json(
        { success: false, error: "Thiếu id hoặc status tin nhắn" },
        { status: 400 }
      );
    }

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    if (!isUuid) {
      return NextResponse.json({ success: true });
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
        { success: false, error: "Thiếu tham số id tin nhắn cần xóa" },
        { status: 400 }
      );
    }

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    if (!isUuid) {
      return NextResponse.json({ success: true });
    }

    const supabase = createAdminClient();
    const { error } = await supabase.from("contact_messages").delete().eq("id", id);
    if (error) {
      console.error("[DELETE /api/contact/messages] DB error:", error);
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[DELETE /api/contact/messages] Exception:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Lỗi xóa tin nhắn" },
      { status: 500 }
    );
  }
}
