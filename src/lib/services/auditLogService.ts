/**
 * Batch D — audit trail writer cho admin payment confirm/reject (READ path
 * qua UI admin/audit-log nếu có; WRITE là insert audit_logs).
 *
 * Schema (migration 001:355-365):
 *   audit_logs(log_id, actor_member_id UUID FK members SET NULL, action TEXT,
 *   entity_type TEXT, entity_id UUID, before_data JSONB, after_data JSONB,
 *   ip_address TEXT, created_at)
 * RLS (002): service_role chỉ ghi/đọc — service dùng createAdminClient().
 *
 * Nguyên tắc:
 * - NON-FATAL: lỗi ghi audit KHÔNG được làm fail business flow (confirm
 *   payment đã thành công trong DB; throw ở đây sẽ biến thành 500 sai bản
 *   chất). Luôn trả { written } để caller log nếu muốn.
 * - PAYLOAD HẠN CHẾ: before/after chỉ chứa status fields đã biết
 *   (payment_status, order_status, payment_method, reason) — KHÔNG chứa
 *   PII (tên, SĐT, địa chỉ) hay secret (token, transaction code nội bộ).
 * - ip_address: KHÔNG tự tin x-forwarded-for (spoofable nếu thiếu trusted
 *   proxy config) → để null, migration nullable sẵn.
 */

import { createAdminClient } from "@/lib/supabase/admin";

export interface AuditLogEntry {
  actor_member_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  before_data?: Record<string, unknown> | null;
  after_data?: Record<string, unknown> | null;
  ip_address?: string | null;
}

export type AuditLogWriteResult = {
  written: boolean;
  error?: string;
};

export async function writeAuditLog(entry: AuditLogEntry): Promise<AuditLogWriteResult> {
  try {
    const supabase = createAdminClient();
    const { error } = await supabase.from("audit_logs").insert({
      actor_member_id: entry.actor_member_id ?? null,
      action: entry.action,
      entity_type: entry.entity_type,
      entity_id: entry.entity_id,
      before_data: entry.before_data ?? null,
      after_data: entry.after_data ?? null,
      ip_address: entry.ip_address ?? null,
    });
    if (error) {
      console.error(
        "[auditLogService] insert failed (non-fatal):",
        error.message ?? error
      );
      return { written: false, error: String(error.message ?? error) };
    }
    return { written: true };
  } catch (err) {
    console.error(
      "[auditLogService] unexpected error (non-fatal):",
      err instanceof Error ? err.message : err
    );
    return { written: false, error: err instanceof Error ? err.message : String(err) };
  }
}
