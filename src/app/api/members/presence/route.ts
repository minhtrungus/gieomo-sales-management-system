import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAuth } from "@/lib/auth/serverAuth";

export const dynamic = "force-dynamic";

const PRESENCE_CONFIG_KEY = "members_online_presence";

export async function GET(request: Request) {
  try {
    const authCheck = await requireAuth(request);
    if (!authCheck.authorized) {
      return authCheck.response;
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("system_configs")
      .select("config_value")
      .eq("config_key", PRESENCE_CONFIG_KEY)
      .maybeSingle();

    // C11 — fail-closed: lỗi DB KHÔNG được mask thành success:true + {}
    // (client sẽ hiểu nhầm "không ai online" thay vì biết server lỗi).
    if (error) {
      console.error("[presence] GET system_configs error:", error);
      return NextResponse.json({ success: false, presence: {} }, { status: 500 });
    }

    let presence: Record<string, string> = {};
    if (data?.config_value) {
      try {
        presence = JSON.parse(data.config_value);
      } catch {
        presence = {};
      }
    }

    return NextResponse.json(
      { success: true, presence },
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" } }
    );
  } catch (caught: unknown) {
    const error = caught as { message?: string } | null;
    return NextResponse.json({ success: false, presence: {}, error: error?.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const authCheck = await requireAuth(request);
    if (!authCheck.authorized) {
      return authCheck.response;
    }

    // Batch 4b — identity lấy từ SESSION, không tin body. Client có thể gửi
    // memberId/email của người khác (spoof presence); body bị bỏ hoàn toàn.
    const memberId = (authCheck.user?.memberId || "").trim();
    const email = (authCheck.user?.email || "").trim().toLowerCase();

    if (!memberId && !email) {
      return NextResponse.json({ success: false, error: "Missing memberId or email" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data, error: readError } = await supabase
      .from("system_configs")
      .select("config_value")
      .eq("config_key", PRESENCE_CONFIG_KEY)
      .maybeSingle();

    // C11 — fail-closed: không merge lên dữ liệu cũ khi đọc lỗi (tránh
    // ghi đè mất các member khác đang online trong map).
    if (readError) {
      console.error("[presence] POST read system_configs error:", readError);
      return NextResponse.json({ success: false, error: readError.message }, { status: 500 });
    }

    let presence: Record<string, string> = {};
    if (data?.config_value) {
      try {
        presence = JSON.parse(data.config_value);
      } catch {
        presence = {};
      }
    }

    // A local Production-derived acceptance copy is intentionally immutable.
    // Return the stored snapshot without attempting the heartbeat upsert; the
    // database ACL remains the authoritative write boundary.
    if (process.env.GIEOMO_READ_ONLY_ACCEPTANCE === "true") {
      return NextResponse.json(
        { success: true, presence, readOnly: true },
        { headers: { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" } }
      );
    }

    const nowIso = new Date().toISOString();
    if (memberId) {
      presence[memberId] = nowIso;
      presence[memberId.toLowerCase()] = nowIso;
    }
    if (email) {
      presence[email] = nowIso;
    }

    // Prune entries older than 7 days to keep payload compact
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    for (const [k, v] of Object.entries(presence)) {
      if (new Date(v).getTime() < sevenDaysAgo) {
        delete presence[k];
      }
    }

    const { error: upsertError } = await supabase.from("system_configs").upsert(
      {
        config_key: PRESENCE_CONFIG_KEY,
        config_value: JSON.stringify(presence),
        updated_at: nowIso,
      },
      { onConflict: "config_key" }
    );

    // C11 — fail-closed: ghi thất bại phải báo lỗi, không trả success:true
    // (client tin rằng heartbeat đã lưu).
    if (upsertError) {
      console.error("[presence] POST upsert system_configs error:", upsertError);
      return NextResponse.json({ success: false, error: upsertError.message }, { status: 500 });
    }

    return NextResponse.json(
      { success: true, presence },
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" } }
    );
  } catch (caught: unknown) {
    const error = caught as { message?: string } | null;
    return NextResponse.json({ success: false, error: error?.message }, { status: 500 });
  }
}
