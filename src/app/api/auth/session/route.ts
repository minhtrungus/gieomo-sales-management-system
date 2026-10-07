import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/serverAuth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ authenticated: false, user: null }, { status: 200 });
    }

    return NextResponse.json({
      authenticated: true,
      user: {
        memberId: user.memberId,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        referralCode: user.referralCode,
        phone: user.phone,
      },
    });
  } catch {
    return NextResponse.json({ authenticated: false, user: null }, { status: 200 });
  }
}
