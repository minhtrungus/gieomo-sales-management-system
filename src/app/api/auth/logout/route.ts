import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/auth/serverAuth";
import { getAuthenticatedUser } from "@/lib/auth/serverAuth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await getAuthenticatedUser(request);
  let revocationFailed = false;

  if (user) {
    const { error } = await createAdminClient()
      .from("members")
      .update({ updated_at: new Date().toISOString() })
      .eq("member_id", user.memberId);
    revocationFailed = Boolean(error);
  }

  const response = NextResponse.json(
    revocationFailed
      ? { success: false, error: "Không thể thu hồi phiên đăng nhập" }
      : { success: true, message: "Đăng xuất thành công" },
    { status: revocationFailed ? 500 : 200 }
  );
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
  response.cookies.set({
    name: "gieomo_admin_session_token",
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
  return response;
}
