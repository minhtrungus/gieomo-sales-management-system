import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Warehouse } from "@/types/database";
import type { InflowLog, TransferLog } from "@/lib/data/orderStore";
import { requireAdmin, requireAuth } from "@/lib/auth/serverAuth";
import {
  validateAdjustStockInput,
  executeStockAdjustment,
} from "@/lib/services/inventoryAdjustService";

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

export async function GET(request: Request) {
  try {
    const authCheck = await requireAuth(request);
    if (!authCheck.authorized) {
      return authCheck.response;
    }

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
    const authCheck = await requireAdmin(request);
    if (!authCheck.authorized) {
      return authCheck.response;
    }

    const body = await request.json();
    const { action, warehouses, inflowLogs, transferLogs, newInflowLog, newTransferLog } = body;

    const supabase = createAdminClient();

    if (action === "saveWarehouses" && Array.isArray(warehouses)) {
      await setConfigJson(supabase, WAREHOUSES_KEY, warehouses);
      return NextResponse.json({ success: true });
    }

    if (action === "saveInflowLogs" && Array.isArray(inflowLogs)) {
      await setConfigJson(supabase, INFLOW_LOGS_KEY, inflowLogs);
      return NextResponse.json({ success: true });
    }

    if (action === "saveTransferLogs" && Array.isArray(transferLogs)) {
      await setConfigJson(supabase, TRANSFER_LOGS_KEY, transferLogs);
      return NextResponse.json({ success: true });
    }

    if (action === "addInflow" && newInflowLog) {
      const currentLogs = await getConfigJson<InflowLog[]>(supabase, INFLOW_LOGS_KEY, []);
      const updatedLogs = [newInflowLog, ...currentLogs.filter((l) => (l.logId || (l as any).inflow_id) !== (newInflowLog.logId || (newInflowLog as any).inflow_id))];
      await setConfigJson(supabase, INFLOW_LOGS_KEY, updatedLogs);
      return NextResponse.json({ success: true });
    }

    if (action === "addTransfer" && newTransferLog) {
      const currentLogs = await getConfigJson<TransferLog[]>(supabase, TRANSFER_LOGS_KEY, []);
      const updatedLogs = [newTransferLog, ...currentLogs.filter((l) => (l.logId || (l as any).transfer_id) !== (newTransferLog.logId || (newTransferLog as any).transfer_id))];
      await setConfigJson(supabase, TRANSFER_LOGS_KEY, updatedLogs);
      return NextResponse.json({ success: true });
    }

    // Batch 2G — điều chỉnh tồn kho SERVER-AUTHORITATIVE qua RPC
    // adjust_variant_stock (migration 019): relative delta, idempotent,
    // guard không cho stock âm. THAY THẾ nhánh absolute "stockAdjustment"
    // cũ (đã gỡ) — không còn đường ghi đè absolute-stock từ client.
    if (action === "adjustStock") {
      const validated = validateAdjustStockInput(body);
      if (!validated.ok) {
        return NextResponse.json(
          { success: false, outcome: "invalid", error: validated.message },
          { status: 400 }
        );
      }

      // Actor chỉ lấy từ session admin — KHÔNG tin client payload.
      const isMemberUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        authCheck.user.memberId || ""
      );

      const result = await executeStockAdjustment(supabase, {
        ...validated.input,
        actorMemberId: isMemberUuid ? authCheck.user.memberId : null,
      });

      const payload = {
        success: result.applied || result.duplicate,
        outcome: result.status,
        error: result.status === "applied" || result.status === "duplicate" ? undefined : result.message,
        message: result.message,
        stockBefore: result.stockBefore,
        stockAfter: result.stockAfter,
        ...(result.duplicate ? { alreadyApplied: true } : {}),
        ...(result.retryable ? { retryable: true } : {}),
      };

      if (result.status === "applied" || result.status === "duplicate") {
        return NextResponse.json(payload);
      }
      if (result.status === "not_found") {
        return NextResponse.json(payload, { status: 404 });
      }
      if (
        result.status === "insufficient_stock" ||
        result.status === "idempotency_mismatch"
      ) {
        return NextResponse.json(payload, { status: 409 });
      }
      if (result.status === "rpc_unavailable") {
        return NextResponse.json(payload, { status: 503 });
      }
      if (result.status === "invalid") {
        return NextResponse.json(payload, { status: 400 });
      }
      return NextResponse.json(payload, { status: 500 });
    }

    return NextResponse.json({ success: false, error: "Hành động kho không hợp lệ" }, { status: 400 });
  } catch (err: any) {
    console.error("[POST /api/inventory] Exception:", err);
    return NextResponse.json({ success: false, error: err?.message || "Lỗi xử lý kho" }, { status: 500 });
  }
}
