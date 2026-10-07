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
    const { data } = await supabase
      .from("system_configs")
      .select("config_value")
      .eq("config_key", PRESENCE_CONFIG_KEY)
      .maybeSingle();

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
  } catch (error: any) {
    return NextResponse.json({ success: false, presence: {}, error: error?.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const authCheck = await requireAuth(request);
    if (!authCheck.authorized) {
      return authCheck.response;
    }

    const body = await request.json();
    const memberId = (body.memberId || body.member_id || authCheck.user.memberId || "").trim();
    const email = (body.email || authCheck.user.email || "").trim().toLowerCase();

    if (!memberId && !email) {
      return NextResponse.json({ success: false, error: "Missing memberId or email" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data } = await supabase
      .from("system_configs")
      .select("config_value")
      .eq("config_key", PRESENCE_CONFIG_KEY)
      .maybeSingle();

    let presence: Record<string, string> = {};
    if (data?.config_value) {
      try {
        presence = JSON.parse(data.config_value);
      } catch {
        presence = {};
      }
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

    await supabase.from("system_configs").upsert(
      {
        config_key: PRESENCE_CONFIG_KEY,
        config_value: JSON.stringify(presence),
        updated_at: nowIso,
      },
      { onConflict: "config_key" }
    );

    return NextResponse.json(
      { success: true, presence },
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" } }
    );
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message }, { status: 500 });
  }
}
