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
type AdminSupabaseClient = ReturnType<typeof createAdminClient>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function recordId(value: Record<string, unknown>, primary: string, legacy: string): string {
  if (typeof value[primary] === "string") return value[primary];
  return typeof value[legacy] === "string" ? value[legacy] : "";
}

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

async function getConfigJson<T>(supabase: AdminSupabaseClient, key: string, fallback: T): Promise<T> {
  const { data, error } = await supabase
    .from("system_configs")
    .select("config_value")
    .eq("config_key", key)
    .maybeSingle();
  if (error) throw new Error(`Không thể đọc cấu hình ${key}: ${error.message}`);
  if (data?.config_value) {
    const parsed = JSON.parse(data.config_value);
    if (parsed !== undefined && parsed !== null) return parsed as T;
  }
  return fallback;
}

async function setConfigJson<T>(supabase: AdminSupabaseClient, key: string, value: T): Promise<void> {
  const { error } = await supabase.from("system_configs").upsert(
    {
      config_key: key,
      config_value: JSON.stringify(value),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "config_key" }
  );
  if (error) throw new Error(`Không thể lưu cấu hình ${key}: ${error.message}`);
}

async function compareAndSetWarehouses(
  supabase: AdminSupabaseClient,
  expected: Warehouse[],
  next: Warehouse[],
): Promise<boolean> {
  const currentResult = await supabase
    .from("system_configs")
    .select("config_value, updated_at")
    .eq("config_key", WAREHOUSES_KEY)
    .maybeSingle();
  if (currentResult.error) throw new Error(`Không thể đọc cấu hình ${WAREHOUSES_KEY}: ${currentResult.error.message}`);

  const currentRaw = currentResult.data?.config_value
    ? JSON.parse(currentResult.data.config_value) as unknown
    : DEFAULT_WAREHOUSES;
  const current = validateWarehouses(currentRaw);
  if (!current) throw new Error("Cấu hình kho hiện tại không hợp lệ; từ chối ghi đè.");
  if (JSON.stringify(current) !== JSON.stringify(expected)) return false;

  const payload = {
    config_key: WAREHOUSES_KEY,
    config_value: JSON.stringify(next),
    updated_at: new Date().toISOString(),
  };
  if (currentResult.data) {
    const updateResult = await supabase
      .from("system_configs")
      .update(payload)
      .eq("config_key", WAREHOUSES_KEY)
      .eq("updated_at", currentResult.data.updated_at)
      .select("config_key")
      .maybeSingle();
    if (updateResult.error) throw new Error(`Không thể lưu cấu hình ${WAREHOUSES_KEY}: ${updateResult.error.message}`);
    return Boolean(updateResult.data);
  }

  const insertResult = await supabase.from("system_configs").insert(payload);
  if (insertResult.error?.code === "23505") return false;
  if (insertResult.error) throw new Error(`Không thể lưu cấu hình ${WAREHOUSES_KEY}: ${insertResult.error.message}`);
  return true;
}

function validateWarehouses(value: unknown): Warehouse[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 50) return null;
  const normalized: Warehouse[] = [];
  const ids = new Set<string>();
  const codes = new Set<string>();
  for (const entry of value) {
    if (!isRecord(entry)) return null;
    const warehouse_id = typeof entry.warehouse_id === "string" ? entry.warehouse_id.trim() : "";
    const code = typeof entry.code === "string" ? entry.code.trim().toUpperCase() : "";
    const name = typeof entry.name === "string" ? entry.name.trim() : "";
    const address = typeof entry.address === "string" ? entry.address.trim() : "";
    const phone = typeof entry.phone === "string" ? entry.phone.trim() : "";
    const manager_name = typeof entry.manager_name === "string" ? entry.manager_name.trim() : "";
    if (!warehouse_id || warehouse_id.length > 100 || !code || code.length > 40 || !name || name.length > 160 ||
        address.length > 500 || phone.length > 40 || manager_name.length > 160 || ids.has(warehouse_id) || codes.has(code)) {
      return null;
    }
    ids.add(warehouse_id); codes.add(code);
    normalized.push({ warehouse_id, code, name, address, phone, manager_name, is_default: entry.is_default === true });
  }
  if (normalized.filter((entry) => entry.is_default).length !== 1) return null;
  return normalized;
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
  } catch (err: unknown) {
    console.error("[GET /api/inventory] Exception:", err);
    return NextResponse.json({ success: false, error: "Không thể tải dữ liệu kho từ máy chủ." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const authCheck = await requireAdmin(request);
    if (!authCheck.authorized) {
      return authCheck.response;
    }

    const parsedBody: unknown = await request.json();
    if (!isRecord(parsedBody)) {
      return NextResponse.json({ success: false, error: "Dữ liệu kho không hợp lệ" }, { status: 400 });
    }
    const body = parsedBody;
    const { action, warehouses, expectedWarehouses, inflowLogs, transferLogs, newInflowLog, newTransferLog } = body;

    const supabase = createAdminClient();

    if (action === "saveWarehouses") {
      const validatedWarehouses = validateWarehouses(warehouses);
      const validatedExpected = validateWarehouses(expectedWarehouses);
      if (!validatedWarehouses || !validatedExpected) {
        return NextResponse.json({ success: false, error: "Danh sách kho không hợp lệ hoặc thiếu đúng một kho mặc định." }, { status: 400 });
      }
      const saved = await compareAndSetWarehouses(supabase, validatedExpected, validatedWarehouses);
      if (!saved) {
        return NextResponse.json({
          success: false,
          error: "Dữ liệu kho đã được cập nhật ở nơi khác. Hãy tải lại trước khi lưu để không ghi đè thay đổi mới.",
        }, { status: 409 });
      }
      return NextResponse.json({ success: true, warehouses: validatedWarehouses });
    }

    if (action === "saveInflowLogs" && Array.isArray(inflowLogs)) {
      await setConfigJson(supabase, INFLOW_LOGS_KEY, inflowLogs);
      return NextResponse.json({ success: true });
    }

    if (action === "saveTransferLogs" && Array.isArray(transferLogs)) {
      await setConfigJson(supabase, TRANSFER_LOGS_KEY, transferLogs);
      return NextResponse.json({ success: true });
    }

    if (action === "addInflow" && isRecord(newInflowLog)) {
      const currentLogs = await getConfigJson<InflowLog[]>(supabase, INFLOW_LOGS_KEY, []);
      const newId = recordId(newInflowLog, "logId", "inflow_id");
      const updatedLogs = [
        newInflowLog,
        ...currentLogs.filter((log) => {
          const record: Record<string, unknown> = { ...log };
          return recordId(record, "logId", "inflow_id") !== newId;
        }),
      ];
      await setConfigJson(supabase, INFLOW_LOGS_KEY, updatedLogs);
      return NextResponse.json({ success: true });
    }

    if (action === "addTransfer" && isRecord(newTransferLog)) {
      const currentLogs = await getConfigJson<TransferLog[]>(supabase, TRANSFER_LOGS_KEY, []);
      const newId = recordId(newTransferLog, "logId", "transfer_id");
      const updatedLogs = [
        newTransferLog,
        ...currentLogs.filter((log) => {
          const record: Record<string, unknown> = { ...log };
          return recordId(record, "logId", "transfer_id") !== newId;
        }),
      ];
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
  } catch (err: unknown) {
    console.error("[POST /api/inventory] Exception:", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Lỗi xử lý kho" },
      { status: 500 },
    );
  }
}
