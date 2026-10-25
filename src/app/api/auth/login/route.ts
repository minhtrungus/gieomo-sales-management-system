import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  verifyPassword,
  hashPassword,
  createSessionToken,
  SESSION_COOKIE_NAME,
  SESSION_EXPIRATION_SECONDS,
} from "@/lib/auth/serverAuth";
import {
  checkLoginRateLimit,
  clearLoginFailures,
  getLoginRateLimitKey,
  recordLoginFailure,
} from "@/lib/auth/loginRateLimit";

export const dynamic = "force-dynamic";

type AuthenticatedUser = Parameters<typeof createSessionToken>[0];

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const account = (body.account || body.email || body.username || "").trim().toLowerCase();
    const password = (body.password || "").trim();

    if (!account || !password) {
      return NextResponse.json(
        { success: false, error: "Vui lòng nhập tài khoản và mật khẩu" },
        { status: 400 }
      );
    }

    const rateLimitKey = getLoginRateLimitKey(request, account);
    const rateLimit = checkLoginRateLimit(rateLimitKey);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { success: false, error: "Quá nhiều lần đăng nhập thất bại. Vui lòng thử lại sau." },
        {
          status: 429,
          headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
        }
      );
    }

    const supabase = createAdminClient();

    // Query member by email or phone
    const cleanPhone = account.replace(/\D/g, "");
    let query = supabase.from("members").select("*");

    if (account.includes("@")) {
      query = query.ilike("email", account);
    } else if (cleanPhone.length >= 8) {
      query = query.eq("phone", cleanPhone);
    } else {
      query = query.or(`email.ilike.${account},referral_code.ilike.${account}`);
    }

    const { data: members, error: dbError } = await query;

    if (dbError) {
      console.error("[POST /api/auth/login] Database query error:", dbError);
    }

    const matchedMember = (members || [])[0];

    // Check system maintenance account fallback if no member matched
    let authenticatedUser: AuthenticatedUser | null = null;

    if (matchedMember) {
      if (matchedMember.status === "inactive") {
        recordLoginFailure(rateLimitKey);
        return NextResponse.json(
          { success: false, error: "Tài khoản đã bị tạm khóa. Vui lòng liên hệ Ban Quản Trị!" },
          { status: 403 }
        );
      }

      if (!matchedMember.password_hash) {
        return NextResponse.json(
          { success: false, error: "Tài khoản hoặc mật khẩu không chính xác!" },
          { status: 401 }
        );
      }

      const isPasswordCorrect = verifyPassword(password, matchedMember.password_hash);

      if (isPasswordCorrect) {
        authenticatedUser = {
          memberId: matchedMember.member_id,
          email: matchedMember.email || account,
          fullName: matchedMember.full_name,
          role: matchedMember.role || "btc_sale",
          referralCode: matchedMember.referral_code || "",
          phone: matchedMember.phone || undefined,
          authVersion: matchedMember.updated_at,
        };

        // Upgrade legacy plaintext password to PBKDF2 hash on successful login if column exists
        if (matchedMember.password_hash && !matchedMember.password_hash.startsWith("pbkdf2$")) {
          try {
            const upgradedHash = hashPassword(password);
            await supabase
              .from("members")
              .update({ password_hash: upgradedHash, updated_at: new Date().toISOString() })
              .eq("member_id", matchedMember.member_id);
          } catch {}
        }
      }
    }

    if (!authenticatedUser) {
      recordLoginFailure(rateLimitKey);
      return NextResponse.json(
        { success: false, error: "Tài khoản hoặc mật khẩu không chính xác!" },
        { status: 401 }
      );
    }

    clearLoginFailures(rateLimitKey);

    // Create session token
    const token = createSessionToken(authenticatedUser);

    const response = NextResponse.json({
      success: true,
      user: authenticatedUser,
    });

    // Set secure HttpOnly cookie
    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: SESSION_EXPIRATION_SECONDS,
      path: "/",
    });

    return response;
  } catch (error: unknown) {
    console.error("[POST /api/auth/login] Exception:", error);
    return NextResponse.json(
      { success: false, error: "Lỗi máy chủ khi xác thực đăng nhập" },
      { status: 500 }
    );
  }
}
