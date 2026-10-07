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
 * Verify password against stored hash (supports both PBKDF2 and initial plaintext migration fallback).
 */
export function verifyPassword(password: string, storedHash?: string | null): boolean {
  if (!storedHash) return false;

  if (storedHash.startsWith("pbkdf2$")) {
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

  // Graceful fallback for initial legacy/unhashed migration records
  return password === storedHash;
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

  return session;
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
 * Enforce Auth (Admin or BTC Sale member) on API routes.
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
