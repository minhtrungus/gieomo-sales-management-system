import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const CREDENTIALS_KEY = "members_auth_credentials";

const DEFAULT_SALE_ACCOUNT = {
  member_id: "e2b4c5d6-789a-4bc1-9def-0123456789ab",
  full_name: "Mầm Mơ (BTC Sale)",
  email: "sale@gieomo.store",
  phone: "0888670637",
  role: "btc_sale",
  status: "active",
  referral_code: "MAMO",
  password_hash: "MamMo@123",
  created_at: new Date("2026-09-01T00:00:00Z").toISOString(),
  updated_at: new Date().toISOString(),
};

async function getStoredCredentialsMap(supabase: any): Promise<Record<string, string>> {
  try {
    const { data } = await supabase
      .from("system_configs")
      .select("config_value")
      .eq("config_key", CREDENTIALS_KEY)
      .maybeSingle();

    if (data?.config_value) {
      return JSON.parse(data.config_value);
    }
  } catch {
    // Graceful fallback
  }
  return {};
}

async function saveStoredCredentialsMap(supabase: any, map: Record<string, string>): Promise<void> {
  try {
    await supabase.from("system_configs").upsert({
      config_key: CREDENTIALS_KEY,
      config_value: JSON.stringify(map),
      updated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.warn("[saveStoredCredentialsMap] warning:", err);
  }
}

export async function GET() {
  try {
    const supabase = createAdminClient();

    // 1. Fetch all members from database
    const { data, error } = await supabase
      .from("members")
      .select("*")
      .order("created_at", { ascending: true });

    if (error) {
      console.warn("[GET /api/members] DB error:", error);
      return NextResponse.json({ success: true, members: [] });
    }

    let membersList = data || [];

    // 2. Fetch credential map and presence map
    const credMap = await getStoredCredentialsMap(supabase);

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

    // 3. Attach password/password_hash and last_active_at to each member
    membersList = membersList.map((m: any) => {
      const emailKey = m.email ? m.email.toLowerCase().trim() : "";
      const phoneKey = m.phone ? m.phone.replace(/\D/g, "") : "";
      const refKey = m.referral_code ? m.referral_code.toUpperCase().trim() : "";
      const idKey = m.member_id || "";

      const resolvedPassword =
        m.password_hash ||
        m.password ||
        (emailKey && credMap[emailKey]) ||
        (phoneKey && credMap[phoneKey]) ||
        (refKey && credMap[refKey]) ||
        (idKey && credMap[idKey]) ||
        "MamMo@123";

      const resolvedLastActive =
        presenceMap[idKey] ||
        presenceMap[idKey.toLowerCase()] ||
        (emailKey ? presenceMap[emailKey] : null) ||
        null;

      return {
        ...m,
        password: resolvedPassword,
        password_hash: resolvedPassword,
        last_active_at: resolvedLastActive,
      };
    });

    return NextResponse.json({ success: true, members: membersList });
  } catch (err: any) {
    console.error("[GET /api/members] Exception:", err);
    return NextResponse.json({ success: true, members: [] });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body || (!body.fullName && !body.full_name)) {
      return NextResponse.json({ success: false, error: "Họ và tên thành viên là bắt buộc" }, { status: 400 });
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

    if (rawPassword && rawPassword !== "••••••••") {
      payload.password_hash = rawPassword;
    }

    // 1. Locate existing member in database
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

    let result: any;
    if (existingMemberId) {
      // UPDATE existing member
      result = await supabase
        .from("members")
        .update(payload)
        .eq("member_id", existingMemberId)
        .select()
        .maybeSingle();

      if (result.error && result.error.message?.includes("password_hash")) {
        delete payload.password_hash;
        result = await supabase
          .from("members")
          .update(payload)
          .eq("member_id", existingMemberId)
          .select()
          .maybeSingle();
      }
    } else {
      // INSERT new member
      if (isUuid) {
        payload.member_id = memberId;
      }
      result = await supabase
        .from("members")
        .insert(payload)
        .select()
        .maybeSingle();

      if (result.error && result.error.message?.includes("password_hash")) {
        delete payload.password_hash;
        result = await supabase
          .from("members")
          .insert(payload)
          .select()
          .maybeSingle();
      }
    }

    // Dual-layer persistence: always store credentials in system_configs
    if (rawPassword && rawPassword !== "••••••••") {
      const credMap = await getStoredCredentialsMap(supabase);
      if (email) credMap[email] = rawPassword;
      if (phone) credMap[phone.replace(/\D/g, "")] = rawPassword;
      if (referralCode) credMap[referralCode.toUpperCase()] = rawPassword;
      const finalId = result.data?.member_id || memberId;
      if (finalId) credMap[finalId] = rawPassword;
      await saveStoredCredentialsMap(supabase, credMap);
    }

    if (result.error) {
      console.error("[POST /api/members] DB Error:", result.error);
      return NextResponse.json({ success: false, error: result.error.message }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      member: {
        ...result.data,
        password: rawPassword && rawPassword !== "••••••••" ? rawPassword : "••••••••",
      },
    });
  } catch (err: any) {
    console.error("[POST /api/members] Exception:", err);
    return NextResponse.json({ success: false, error: err?.message || "Lỗi lưu thông tin thành viên" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const memberId = searchParams.get("id");
    const email = searchParams.get("email");
    const referralCode = searchParams.get("referralCode");

    if (!memberId && !email && !referralCode) {
      return NextResponse.json({ success: false, error: "Cần cung cấp id, email hoặc referralCode để xoá" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(memberId || "");

    let query = supabase.from("members").delete();

    if (isUuid) {
      query = query.eq("member_id", memberId!);
    } else if (email) {
      query = query.eq("email", email.toLowerCase());
    } else if (referralCode) {
      query = query.eq("referral_code", referralCode);
    } else {
      query = query.or(`referral_code.eq.${memberId},phone.eq.${memberId}`);
    }

    const { error } = await query;

    // Clean up credentials map
    try {
      const credMap = await getStoredCredentialsMap(supabase);
      if (email) delete credMap[email.toLowerCase()];
      if (referralCode) delete credMap[referralCode.toUpperCase()];
      if (memberId) delete credMap[memberId];
      await saveStoredCredentialsMap(supabase, credMap);
    } catch {
      // non-blocking
    }

    if (error) {
      console.error("[DELETE /api/members] DB Error:", error);
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[DELETE /api/members] Exception:", err);
    return NextResponse.json({ success: false, error: err?.message || "Lỗi xoá thành viên" }, { status: 500 });
  }
}
