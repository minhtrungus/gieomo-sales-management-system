import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Warehouse } from "@/types/database";
import type { InflowLog, TransferLog } from "@/lib/data/orderStore";

export const dynamic = "force-dynamic";

const WAREHOUSES_KEY = "inventory_warehouses";
const INFLOW_LOGS_KEY = "inventory_inflow_logs";
const TRANSFER_LOGS_KEY = "inventory_transfer_logs";

const DEFAULT_WAREHOUSES: Warehouse[] = [
  {
    warehouse_id: "wh-ufm",
    name: "KHO UFM",
    code: "KHO-LT",
    is_default: true,
    address: "Trường Đại học Tài chính - Marketing (UFM)",
    manager_name: "Trúc Hân",
    phone: "0888670637",
  },
  {
    warehouse_id: "wh-lang",
    name: "KHO LÀNG",
    code: "KHO-LANG",
    is_default: false,
    address: "Làng Đại học, TP. Thủ Đức",
    manager_name: "Thuỳ An",
    phone: "0907654321",
  },
];

async function getConfigJson<T>(supabase: any, key: string, fallback: T): Promise<T> {
  try {
    const { data } = await supabase
      .from("system_configs")
      .select("config_value")
      .eq("config_key", key)
      .maybeSingle();

    if (data?.config_value) {
      const parsed = JSON.parse(data.config_value);
      if (parsed !== undefined && parsed !== null) return parsed as T;
    }
  } catch (err) {
    console.warn(`[inventory API] Error reading config ${key}:`, err);
  }
  return fallback;
}

async function setConfigJson<T>(supabase: any, key: string, value: T): Promise<void> {
  try {
    await supabase.from("system_configs").upsert(
      {
        config_key: key,
        config_value: JSON.stringify(value),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "config_key" }
    );
  } catch (err) {
    console.warn(`[inventory API] Error saving config ${key}:`, err);
  }
}

export async function GET() {
  try {
    const supabase = createAdminClient();

    const [warehouses, inflowLogs, transferLogs] = await Promise.all([
      getConfigJson<Warehouse[]>(supabase, WAREHOUSES_KEY, DEFAULT_WAREHOUSES),
      getConfigJson<InflowLog[]>(supabase, INFLOW_LOGS_KEY, []),
      getConfigJson<TransferLog[]>(supabase, TRANSFER_LOGS_KEY, []),
    ]);

    return NextResponse.json({
      success: true,
      warehouses: warehouses.length > 0 ? warehouses : DEFAULT_WAREHOUSES,
      inflowLogs,
      transferLogs,
    });
  } catch (err: any) {
    console.error("[GET /api/inventory] Exception:", err);
    return NextResponse.json({
      success: true,
      warehouses: DEFAULT_WAREHOUSES,
      inflowLogs: [],
      transferLogs: [],
    });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, warehouses, inflowLogs, transferLogs, newInflowLog, newTransferLog, stockAdjustment } = body;

    const supabase = createAdminClient();

    if (action === "saveWarehouses" && Array.isArray(warehouses)) {
      await setConfigJson(supabase, WAREHOUSES_KEY, warehouses);
      return NextResponse.json({ success: true });
    }

    if (action === "saveInflowLogs" && Array.isArray(inflowLogs)) {
      await setConfigJson(supabase, INFLOW_LOGS_KEY, inflowLogs.slice(0, 100));
      return NextResponse.json({ success: true });
    }

    if (action === "saveTransferLogs" && Array.isArray(transferLogs)) {
      await setConfigJson(supabase, TRANSFER_LOGS_KEY, transferLogs.slice(0, 100));
      return NextResponse.json({ success: true });
    }

    if (action === "addInflowLog" && newInflowLog) {
      const current = await getConfigJson<InflowLog[]>(supabase, INFLOW_LOGS_KEY, []);
      const updated = [newInflowLog, ...current.filter((l) => l.logId !== newInflowLog.logId)].slice(0, 100);
      await setConfigJson(supabase, INFLOW_LOGS_KEY, updated);

      // If variantId provided, update stock directly in product_variants table
      if (stockAdjustment?.variantId && stockAdjustment?.newTotalStock !== undefined) {
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(stockAdjustment.variantId);
        if (isUuid) {
          await supabase
            .from("product_variants")
            .update({
              stock: stockAdjustment.newTotalStock,
              updated_at: new Date().toISOString(),
            })
            .eq("variant_id", stockAdjustment.variantId);
        } else if (stockAdjustment.sku) {
          await supabase
            .from("product_variants")
            .update({
              stock: stockAdjustment.newTotalStock,
              updated_at: new Date().toISOString(),
            })
            .eq("sku", stockAdjustment.sku);
        }
      }

      return NextResponse.json({ success: true });
    }

    if (action === "addTransferLog" && newTransferLog) {
      const current = await getConfigJson<TransferLog[]>(supabase, TRANSFER_LOGS_KEY, []);
      const updated = [newTransferLog, ...current.filter((l) => l.logId !== newTransferLog.logId)].slice(0, 100);
      await setConfigJson(supabase, TRANSFER_LOGS_KEY, updated);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ success: false, error: "Action không hợp lệ" }, { status: 400 });
  } catch (err: any) {
    console.error("[POST /api/inventory] Exception:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Lỗi xử lý kho" },
      { status: 500 }
    );
  }
}
