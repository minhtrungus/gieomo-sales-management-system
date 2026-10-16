import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Voucher } from "@/types/database";
import { requireAdmin } from "@/lib/auth/serverAuth";
import {
  buildVoucherPayload,
  findUnsupportedVoucherFields,
  VOUCHER_DISCOUNT_TYPES,
} from "@/lib/voucherPayload";

export const dynamic = "force-dynamic";

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export async function GET() {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("vouchers")
      .select("*")
      .eq("status", "active")
      .order("created_at", { ascending: false });

    if (error) {
      console.warn("[GET /api/vouchers] DB error:", error);
      return NextResponse.json({ success: false, vouchers: [] });
    }

    return NextResponse.json({ success: true, vouchers: data || [] });
  } catch (err: unknown) {
    console.error("[GET /api/vouchers] Exception:", err);
    return NextResponse.json({ success: false, vouchers: [] });
  }
}

export async function POST(request: Request) {
  try {
    const authCheck = await requireAdmin(request);
    if (!authCheck.authorized) {
      return authCheck.response;
    }

    const body: Voucher = await request.json();
    if (!body || !body.code) {
      return NextResponse.json({ success: false, error: "Mã giảm giá là bắt buộc" }, { status: 400 });
    }

    const unsupportedFields = findUnsupportedVoucherFields(body as unknown as Record<string, unknown>);
    if (unsupportedFields.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `Cannot persist voucher fields missing from the database schema: ${unsupportedFields.join(", ")}`,
          unsupportedFields,
        },
        { status: 409 }
      );
    }

    const supabase = createAdminClient();
    const payload = buildVoucherPayload(body);

    // Update path: voucher_id provided → update by voucher_id (code must not belong to another voucher)
    if (payload.voucher_id) {
      const { data: existing } = await supabase
        .from("vouchers")
        .select("voucher_id")
        .eq("code", payload.code)
        .maybeSingle();

      if (existing && existing.voucher_id !== payload.voucher_id) {
        return NextResponse.json(
          { success: false, error: `Mã giảm giá "${payload.code}" đã tồn tại. Vui lòng chọn mã khác.` },
          { status: 409 }
        );
      }

      const { data, error } = await supabase
        .from("vouchers")
        .update(payload)
        .eq("voucher_id", payload.voucher_id)
        .select()
        .single();

      if (error) {
        console.error("[POST /api/vouchers] Update error:", error);
        return NextResponse.json({ success: false, error: error.message }, { status: 400 });
      }

      return NextResponse.json({ success: true, voucher: data });
    }

    // Create path: reject if code already exists (DB has UNIQUE constraint; check first for clear error)
    const { data: duplicate } = await supabase
      .from("vouchers")
      .select("voucher_id")
      .eq("code", payload.code)
      .maybeSingle();

    if (duplicate) {
      return NextResponse.json(
        { success: false, error: `Mã giảm giá "${payload.code}" đã tồn tại. Vui lòng chọn mã khác.` },
        { status: 409 }
      );
    }

    const { data: created, error: insertError } = await supabase
      .from("vouchers")
      .insert(payload)
      .select()
      .single();

    if (insertError) {
      // Handle race: two concurrent requests with same code → UNIQUE constraint violation
      if (insertError.code === "23505") {
        return NextResponse.json(
          { success: false, error: `Mã giảm giá "${payload.code}" đã tồn tại. Vui lòng chọn mã khác.` },
          { status: 409 }
        );
      }
      console.error("[POST /api/vouchers] Insert error:", insertError);
      return NextResponse.json({ success: false, error: insertError.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, voucher: created });
  } catch (err: unknown) {
    console.error("[POST /api/vouchers] Exception:", err);
    return NextResponse.json({ success: false, error: errorMessage(err, "Lỗi lưu mã giảm giá") }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const authCheck = await requireAdmin(request);
    if (!authCheck.authorized) {
      return authCheck.response;
    }

    const body = await request.json();
    const unsupportedFields = findUnsupportedVoucherFields(body);
    if (unsupportedFields.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `Cannot persist voucher fields missing from the database schema: ${unsupportedFields.join(", ")}`,
          unsupportedFields,
        },
        { status: 409 }
      );
    }

    const { id, code, status, discount_type, discount_value, min_order_value, usage_limit, start_date, end_date } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Thiếu id voucher cần cập nhật" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    const payload: Record<string, unknown> = {};

    if (code !== undefined) {
      const normalized = String(code).trim().toUpperCase();
      if (!normalized) {
        return NextResponse.json(
          { success: false, error: "Mã giảm giá không được để trống" },
          { status: 400 }
        );
      }
      payload.code = normalized;
    }
    if (status !== undefined) {
      payload.status = status;
    }
    if (discount_type !== undefined) {
      if (typeof discount_type !== "string" || !VOUCHER_DISCOUNT_TYPES.includes(discount_type)) {
        return NextResponse.json(
          { success: false, error: "Invalid voucher discount_type" },
          { status: 400 }
        );
      }
      payload.discount_type = discount_type;
    }
    if (discount_value !== undefined) {
      const value = Number(discount_value);
      if (!Number.isFinite(value) || value <= 0) {
        return NextResponse.json(
          { success: false, error: "Giá trị giảm (discount_value) phải là số lớn hơn 0" },
          { status: 400 }
        );
      }
      payload.discount_value = value;
    }
    if (min_order_value !== undefined) {
      payload.min_order_value = Number(min_order_value) || 0;
    }
    if (usage_limit !== undefined) {
      payload.usage_limit = usage_limit;
    }
    if (start_date !== undefined) {
      payload.start_date = start_date;
    }
    if (end_date !== undefined) {
      payload.end_date = end_date;
    }

    if (Object.keys(payload).length === 0) {
      return NextResponse.json(
        { success: false, error: "Không có trường nào để cập nhật" },
        { status: 400 }
      );
    }

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

    // When changing code, verify the new code does not belong to a different voucher
    if (payload.code) {
      let targetVoucherId: string | null = null;

      if (isUuid) {
        targetVoucherId = id;
      } else {
        const { data: target } = await supabase
          .from("vouchers")
          .select("voucher_id")
          .eq("code", id.toUpperCase())
          .maybeSingle();
        targetVoucherId = target?.voucher_id ?? null;
        if (!targetVoucherId) {
          return NextResponse.json(
            { success: false, error: "Không tìm thấy voucher cần cập nhật" },
            { status: 404 }
          );
        }
      }

      const { data: existing } = await supabase
        .from("vouchers")
        .select("voucher_id")
        .eq("code", payload.code)
        .maybeSingle();

      if (existing && existing.voucher_id !== targetVoucherId) {
        return NextResponse.json(
          { success: false, error: `Mã giảm giá "${payload.code}" đã tồn tại. Vui lòng chọn mã khác.` },
          { status: 409 }
        );
      }
    }

    let query = supabase.from("vouchers").update(payload);
    if (isUuid) {
      query = query.eq("voucher_id", id);
    } else {
      query = query.eq("code", id.toUpperCase());
    }

    const { data, error } = await query.select().single();

    if (error) {
      // Handle race: concurrent request changed code to same value → UNIQUE violation
      if (error.code === "23505") {
        return NextResponse.json(
          { success: false, error: `Mã giảm giá "${payload.code}" đã tồn tại. Vui lòng chọn mã khác.` },
          { status: 409 }
        );
      }
      console.error("[PATCH /api/vouchers] Error:", error);
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, voucher: data });
  } catch (err: unknown) {
    console.error("[PATCH /api/vouchers] Exception:", err);
    return NextResponse.json(
      { success: false, error: errorMessage(err, "Lỗi cập nhật mã giảm giá") },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const authCheck = await requireAdmin(request);
    if (!authCheck.authorized) {
      return authCheck.response;
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Thiếu tham số id voucher cần xóa" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

    let query = supabase.from("vouchers").delete();
    if (isUuid) {
      query = query.eq("voucher_id", id);
    } else {
      query = query.eq("code", id.toUpperCase());
    }

    const { error } = await query;
    if (error) {
      console.error("[DELETE /api/vouchers] Error:", error);
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    console.error("[DELETE /api/vouchers] Exception:", err);
    return NextResponse.json(
      { success: false, error: errorMessage(err, "Lỗi xóa mã giảm giá") },
      { status: 500 }
    );
  }
}
