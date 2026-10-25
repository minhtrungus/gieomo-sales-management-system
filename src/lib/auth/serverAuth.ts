import { createHmac, randomBytes, pbkdf2Sync, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export interface SessionUser {
  memberId: string;
  email: string;
  fullName: string;
  role: "admin" | "btc_sale" | "delivery_staff";
  referralCode: string;
  phone?: string;
  authVersion: string;
  exp: number;
  iat: number;
}

const SESSION_COOKIE_NAME = "gieomo_session_token";
const SESSION_EXPIRATION_SECONDS = 7 * 24 * 60 * 60; // 7 days

function getSecretKey(): string {
  const secret =
    process.env.ADMIN_SESSION_SECRET ||
    process.env.SESSION_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!secret) {
    throw new Error(
      "[Security Error] Missing ADMIN_SESSION_SECRET or SUPABASE_SERVICE_ROLE_KEY. Server session signing cannot proceed without a secure secret."
    );
  }
  return secret;
}

/**
 * Hash a password using PBKDF2 (SHA-512 with 100,000 iterations).
 */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
  return `pbkdf2$${salt}$${hash}`;
}

/**
 * Verify password against stored hash (PBKDF2 only - no plaintext fallback for security).
 */
export function verifyPassword(password: string, storedHash?: string | null): boolean {
  if (!storedHash) return false;

  if (!storedHash.startsWith("pbkdf2$")) {
    return false;
  }

  const parts = storedHash.split("$");
  if (parts.length !== 3) return false;
  const [, salt, originalHash] = parts;
  const computedHash = pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
  try {
    return timingSafeEqual(Buffer.from(computedHash, "hex"), Buffer.from(originalHash, "hex"));
  } catch {
    return false;
  }
}

/**
 * Generate a signed JWT-like session token (HMAC-SHA256).
 */
export function createSessionToken(user: Omit<SessionUser, "exp" | "iat">): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionUser = {
    ...user,
    iat: now,
    exp: now + SESSION_EXPIRATION_SECONDS,
  };

  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", getSecretKey()).update(payloadB64).digest("base64url");
  return `${payloadB64}.${signature}`;
}

/**
 * Verify and decode session token.
 */
export function verifySessionToken(token: string): SessionUser | null {
  try {
    if (!token || !token.includes(".")) return null;
    const [payloadB64, signature] = token.split(".");
    if (!payloadB64 || !signature) return null;

    const expectedSignature = createHmac("sha256", getSecretKey()).update(payloadB64).digest("base64url");
    
    // Constant-time signature verification
    const sigBuf = Buffer.from(signature, "utf-8");
    const expBuf = Buffer.from(expectedSignature, "utf-8");
    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }

    const payloadJson = Buffer.from(payloadB64, "base64url").toString("utf-8");
    const payload: SessionUser = JSON.parse(payloadJson);

    const now = Math.floor(Date.now() / 1000);
    if (!payload.exp || payload.exp < now) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

/**
 * Extract session token from incoming Request headers or cookies.
 */
export function extractTokenFromRequest(request: Request): string | null {
  // 1. Authorization header: Bearer <token>
  const authHeader = request.headers.get("authorization") || request.headers.get("x-session-token");
  if (authHeader) {
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (match?.[1]) return match[1].trim();
    if (authHeader.includes(".")) return authHeader.trim();
  }

  // 2. Cookie: gieomo_session_token=<token>
  const cookieHeader = request.headers.get("cookie");
  if (cookieHeader) {
    const cookies = cookieHeader.split(";");
    for (const c of cookies) {
      const [name, ...valParts] = c.trim().split("=");
      if (name === SESSION_COOKIE_NAME || name === "gieomo_admin_session_token") {
        return decodeURIComponent(valParts.join("="));
      }
    }
  }

  return null;
}

/**
 * Authenticate current request. Returns the SessionUser or null.
 */
export async function getAuthenticatedUser(request: Request): Promise<SessionUser | null> {
  const token = extractTokenFromRequest(request);
  if (!token) return null;

  const session = verifySessionToken(token);
  if (!session) return null;
  if (!session.memberId || !session.authVersion) return null;

  // A valid signature is not enough: roles/status can be revoked after login.
  // `members.updated_at` is the per-account session version. Any member edit or
  // explicit logout rotates it, invalidating every previously issued token.
  const { data: member, error } = await createAdminClient()
    .from("members")
    .select("member_id, email, full_name, role, status, referral_code, phone, updated_at")
    .eq("member_id", session.memberId)
    .maybeSingle();

  if (
    error ||
    !member ||
    member.status !== "active" ||
    !["admin", "btc_sale", "delivery_staff"].includes(member.role) ||
    !member.updated_at ||
    member.updated_at !== session.authVersion
  ) {
    return null;
  }

  return {
    ...session,
    email: member.email || session.email,
    fullName: member.full_name || session.fullName,
    role: member.role,
    referralCode: member.referral_code || "",
    phone: member.phone || undefined,
    authVersion: member.updated_at,
  };
}

/**
 * Enforce Admin role on API routes.
 * Returns { authorized: true, user } or { authorized: false, response: NextResponse }.
 */
export async function requireAdmin(
  request: Request
): Promise<{ authorized: true; user: SessionUser } | { authorized: false; response: NextResponse }> {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return {
      authorized: false,
      response: NextResponse.json(
        { success: false, error: "Yêu cầu đăng nhập quản trị viên (401 Unauthorized)" },
        { status: 401 }
      ),
    };
  }

  if (user.role !== "admin") {
    return {
      authorized: false,
      response: NextResponse.json(
        { success: false, error: "Bạn không có quyền thực hiện thao tác này (403 Forbidden)" },
        { status: 403 }
      ),
    };
  }

  return { authorized: true, user };
}

/**
 * Enforce "đã đăng nhập" (bất kỳ role hợp lệ nào trong session) trên API routes.
 * HÀNH VI THỰC TẾ (pin bởi tests/authPrimitives.test.ts): mọi session ký hợp lệ
 * đều pass — admin, btc_sale, delivery_staff.
 * Lưu ý: comment cũ "Admin or BTC Sale" SAI lệch với code; thu hẹp theo role
 * (vd. loại delivery_staff khỏi route staff) cần ma trận role-per-route do
 * business phê duyệt — xem checkpoint OvernightExecution (Batch B).
 */
export async function requireAuth(
  request: Request
): Promise<{ authorized: true; user: SessionUser } | { authorized: false; response: NextResponse }> {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return {
      authorized: false,
      response: NextResponse.json(
        { success: false, error: "Yêu cầu đăng nhập hệ thống (401 Unauthorized)" },
        { status: 401 }
      ),
    };
  }

  return { authorized: true, user };
}

export { SESSION_COOKIE_NAME, SESSION_EXPIRATION_SECONDS };

/**
 * Order proof capability tokens carry an issued-at (iat) timestamp and expire.
 * Default TTL = 7 days (aligned with session TTL). Operator override (giờ):
 * PROOF_TOKEN_TTL_HOURS. Token format mới: `<b64(code:orderId:iat)>.<sig>` —
 * token cũ (2 phần, không iat) bị TỪ CHỐI; khách dùng đường phone-match
 * thay thế tại /api/orders/proof.
 */
const PROOF_TOKEN_DEFAULT_TTL_SECONDS = 7 * 24 * 60 * 60;
const PROOF_TOKEN_MAX_FUTURE_SKEW_SECONDS = 5 * 60;

function getProofTokenTtlSeconds(): number {
  const hours = Number(process.env.PROOF_TOKEN_TTL_HOURS);
  if (Number.isFinite(hours) && hours > 0) {
    return Math.floor(hours * 3600);
  }
  return PROOF_TOKEN_DEFAULT_TTL_SECONDS;
}

/**
 * Create a cryptographically signed capability token for an order.
 * Allows the customer to submit payment proof without an admin session.
 */
export function createOrderProofToken(orderCode: string, orderId: string): string {
  const iat = Math.floor(Date.now() / 1000);
  const payload = `${orderCode.toUpperCase().trim()}:${orderId.trim()}:${iat}`;
  const payloadB64 = Buffer.from(payload).toString("base64url");
  const signature = createHmac("sha256", getSecretKey()).update(payloadB64).digest("base64url");
  return `${payloadB64}.${signature}`;
}

/**
 * Verify order proof capability token against expected order code.
 * Bắt buộc: chữ ký hợp lệ + iat trong cửa sổ TTL (không quá cũ, không quá
 * tương lai quá skew). Token legacy không có iat → false.
 */
export function verifyOrderProofToken(
  token: string,
  expectedOrderCode: string,
  expectedOrderId?: string
): boolean {
  try {
    if (!token || !token.includes(".")) return false;
    const [payloadB64, signature] = token.split(".");
    if (!payloadB64 || !signature) return false;

    const expectedSignature = createHmac("sha256", getSecretKey()).update(payloadB64).digest("base64url");
    const sigBuf = Buffer.from(signature, "utf-8");
    const expBuf = Buffer.from(expectedSignature, "utf-8");
    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
      return false;
    }

    const payload = Buffer.from(payloadB64, "base64url").toString("utf-8");
    const parts = payload.split(":");
    if (parts.length !== 3) return false; // legacy token không iat → từ chối
    const [orderCode, orderId, iatRaw] = parts;
    if (!orderCode || orderCode.toUpperCase().trim() !== expectedOrderCode.toUpperCase().trim()) {
      return false;
    }
    if (expectedOrderId && orderId !== expectedOrderId.trim()) return false;

    const iat = Number(iatRaw);
    if (!Number.isInteger(iat)) return false;
    const now = Math.floor(Date.now() / 1000);
    if (iat > now + PROOF_TOKEN_MAX_FUTURE_SKEW_SECONDS) return false;
    if (now - iat > getProofTokenTtlSeconds()) return false;
    return true;
  } catch {
    return false;
  }
}
