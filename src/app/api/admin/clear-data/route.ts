import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST() {
  return NextResponse.json(
    {
      success: false,
      message: "Tính năng xóa dữ liệu đã được vô hiệu hóa để đảm bảo an toàn tuyệt đối cho hệ thống vận hành thực tế.",
    },
    { status: 403 }
  );
}
