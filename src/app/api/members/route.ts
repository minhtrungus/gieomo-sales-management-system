import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser, requireAdmin, hashPassword } from "@/lib/auth/serverAuth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const supabase = createAdminClient();
    const currentUser = await getAuthenticatedUser(request);

    // 1. If unauthenticated, return ONLY public safe information for checkout / referral lookups
    if (!currentUser) {
      const { data, error } = await supabase
        .from("members")
        .select("member_id, full_name, referral_code")
        .eq("status", "active")
        .order("full_name", { ascending: true });

      if (error) {
        console.warn("[GET /api/members] DB error:", error);
        return NextResponse.json({ success: true, members: [] });
      }

      const publicMembers = (data || []).map((m: any) => ({
        memberId: m.member_id,
        fullName: m.full_name,
        referralCode: m.referral_code || "",
      }));

      return NextResponse.json({ success: true, members: publicMembers });
    }

    // 2. If authenticated (Admin or Member), return full member roster WITHOUT passwords or hashes
    const { data, error } = await supabase
      .from("members")
      .select("member_id, full_name, email, phone, role, status, referral_code, created_at, updated_at")
      .order("created_at", { ascending: true });

    if (error) {
      console.warn("[GET /api/members] DB error:", error);
      return NextResponse.json({ success: true, members: [] });
    }

    let presenceMap: Record<string, string> = {};
    try {
      const { data: presenceConfig } = await supabase
        .from("system_configs")
        .select("config_value")
        .eq("config_key", "members_online_presence")
        .maybeSingle();
      if (presenceConfig?.config_value) {
        presenceMap = JSON.parse(presenceConfig.config_value);
      }
    } catch {
      // ignore
    }

    const sanitizedMembers = (data || []).map((m: any) => {
      const idKey = m.member_id || "";
      const emailKey = m.email ? m.email.toLowerCase().trim() : "";
      const resolvedLastActive =
        presenceMap[idKey] ||
        presenceMap[idKey.toLowerCase()] ||
        (emailKey ? presenceMap[emailKey] : null) ||
        null;

      return {
        memberId: m.member_id,
        member_id: m.member_id,
        fullName: m.full_name,
        full_name: m.full_name,
        email: m.email || "",
        phone: m.phone || "",
        role: m.role || "btc_sale",
        status: m.status || "active",
        referralCode: m.referral_code || "",
        referral_code: m.referral_code || "",
        joinedDate: m.created_at ? new Date(m.created_at).toLocaleDateString("vi-VN") : "01/09/2026",
        created_at: m.created_at,
        updated_at: m.updated_at,
        last_active_at: resolvedLastActive,
      };
    });

    return NextResponse.json({ success: true, members: sanitizedMembers });
  } catch (err: any) {
    console.error("[GET /api/members] Exception:", err);
    return NextResponse.json({ success: true, members: [] });
  }
}

export async function POST(request: Request) {
  try {
    // Require Admin role
    const authCheck = await requireAdmin(request);
    if (!authCheck.authorized) {
      return authCheck.response;
    }

    const body = await request.json();
    if (!body || (!body.fullName && !body.full_name)) {
      return NextResponse.json(
        { success: false, error: "Họ và tên thành viên là bắt buộc" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();
    const fullName = (body.fullName || body.full_name || "").trim();
    const email = (body.email || "").trim().toLowerCase() || null;
    const phone = (body.phone || "").trim() || null;
    const role = body.role === "admin" ? "admin" : "btc_sale";
    const status = body.status === "inactive" ? "inactive" : "active";
    const referralCode = (body.referralCode || body.referral_code || "").trim() || null;
    const memberId = body.memberId || body.member_id;
    const rawPassword = body.password?.trim();

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(memberId || "");

    const payload: any = {
      full_name: fullName,
      email,
      phone,
      role,
      status,
      referral_code: referralCode,
      updated_at: new Date().toISOString(),
    };

    // If new password provided and not placeholder, hash it securely with PBKDF2
    if (rawPassword && rawPassword !== "••••••••" && rawPassword.length >= 4) {
      payload.password_hash = hashPassword(rawPassword);
    }

    // Locate existing member in database
    let existingMemberId: string | null = null;
    if (isUuid) {
      const { data: byId } = await supabase
        .from("members")
        .select("member_id")
        .eq("member_id", memberId)
        .maybeSingle();
      if (byId?.member_id) existingMemberId = byId.member_id;
    }

    if (!existingMemberId && email) {
      const { data: byEmail } = await supabase
        .from("members")
        .select("member_id")
        .ilike("email", email)
        .maybeSingle();
      if (byEmail?.member_id) existingMemberId = byEmail.member_id;
    }

    if (!existingMemberId && referralCode) {
      const { data: byRef } = await supabase
        .from("members")
        .select("member_id")
        .eq("referral_code", referralCode)
        .maybeSingle();
      if (byRef?.member_id) existingMemberId = byRef.member_id;
    }

    let savedMemberData: any = null;

    if (existingMemberId) {
      const { data, error } = await supabase
        .from("members")
        .update(payload)
        .eq("member_id", existingMemberId)
        .select("member_id, full_name, email, phone, role, status, referral_code, created_at, updated_at")
        .single();

      if (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 400 });
      }
      savedMemberData = data;
    } else {
      if (isUuid) {
        payload.member_id = memberId;
      }
      if (!payload.password_hash) {
        const tempRandomPass = Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
        payload.password_hash = hashPassword(tempRandomPass);
      }
      payload.created_at = new Date().toISOString();

      const { data, error } = await supabase
        .from("members")
        .insert(payload)
        .select("member_id, full_name, email, phone, role, status, referral_code, created_at, updated_at")
        .single();

      if (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 400 });
      }
      savedMemberData = data;
    }

    return NextResponse.json({ success: true, member: savedMemberData });
  } catch (err: any) {
    console.error("[POST /api/members] Exception:", err);
    return NextResponse.json({ success: false, error: err?.message || "Lỗi lưu thành viên" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const authCheck = await requireAdmin(request);
    if (!authCheck.authorized) {
      return authCheck.response;
    }

    const { searchParams } = new URL(request.url);
    const memberId = searchParams.get("memberId") || searchParams.get("id");
    const email = searchParams.get("email");
    const referralCode = searchParams.get("referralCode");

    if (!memberId && !email && !referralCode) {
      return NextResponse.json(
        { success: false, error: "Thiếu định danh thành viên cần xóa" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(memberId || "");

    let query = supabase.from("members").delete();
    if (isUuid) {
      query = query.eq("member_id", memberId);
    } else if (email) {
      query = query.ilike("email", email.trim().toLowerCase());
    } else if (referralCode) {
      query = query.eq("referral_code", referralCode.trim());
    } else {
      query = query.eq("member_id", memberId);
    }

    const { error } = await query;
    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[DELETE /api/members] Exception:", err);
    return NextResponse.json({ success: false, error: err?.message || "Lỗi xóa thành viên" }, { status: 500 });
  }
}
