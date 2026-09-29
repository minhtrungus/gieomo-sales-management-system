import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const supabase = createAdminClient();

    const pairs: [string, string][] = [
      ["payments", "payment_id"],
      ["shipments", "shipment_id"],
      ["order_items", "order_item_id"],
      ["orders", "order_id"],
      ["combo_items", "combo_item_id"],
      ["combos", "combo_id"],
      ["product_variants", "variant_id"],
      ["product_media", "media_id"],
      ["products", "product_id"],
      ["vouchers", "voucher_id"],
      ["customers", "customer_id"],
    ];

    for (const [table, pk] of pairs) {
      const { error } = await supabase.from(table).delete().neq(pk, "00000000-0000-0000-0000-000000000000");
      if (error) {
        console.warn(`[ClearData] Warning clearing ${table}:`, error.message);
      }
    }

    return NextResponse.json({
      success: true,
      message: "Đã xoá sạch toàn bộ dữ liệu sản phẩm, đơn hàng, doanh thu và voucher trên cơ sở dữ liệu!",
    });
  } catch (err: any) {
    console.error("[POST /api/admin/clear-data] Error:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Lỗi khi xoá dữ liệu hệ thống" },
      { status: 500 }
    );
  }
}
