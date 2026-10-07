import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/serverAuth";
import { getReconciliationDataServer } from "@/lib/services/reconciliationService";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    // 1. Strict Server-Side Authentication & Authorization
    const authResult = await requireAdmin(request);
    if (!authResult.authorized) {
      return authResult.response;
    }

    // 2. Parse Query Parameters
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || undefined;
    const reconciliationStatus = searchParams.get("reconciliation_status") || undefined;
    const orderStatus = searchParams.get("order_status") || undefined;
    const paymentStatus = searchParams.get("payment_status") || undefined;
    const startDate = searchParams.get("start_date") || undefined;
    const endDate = searchParams.get("end_date") || undefined;
    const actionRequiredOnly = searchParams.get("action_required") === "true";
    const limit = searchParams.get("limit") ? Number(searchParams.get("limit")) : 100;
    const offset = searchParams.get("offset") ? Number(searchParams.get("offset")) : 0;

    // 3. Execute 3-Way Reconciliation
    const data = await getReconciliationDataServer({
      search,
      reconciliation_status: reconciliationStatus,
      order_status: orderStatus,
      payment_status: paymentStatus,
      start_date: startDate,
      end_date: endDate,
      action_required_only: actionRequiredOnly,
      limit,
      offset,
    });

    return NextResponse.json({
      success: true,
      summary: data.summary,
      records: data.records,
      totalCount: data.total_count,
    });
  } catch (error: any) {
    console.error("[GET /api/admin/reconciliation] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Lỗi hệ thống khi đối soát dữ liệu 3 chiều",
      },
      { status: 500 }
    );
  }
}
