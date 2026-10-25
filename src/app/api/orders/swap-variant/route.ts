import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/serverAuth";

// H25 â€” Äá»•i máº«u giao trÃªn chÃ­nh Ä‘Æ¡n hÃ ng: má»™t endpoint duy nháº¥t gá»i RPC
// `swap_order_item_variant_atomic` (migration 033). ToÃ n bá»™ logic tá»“n kho
// náº±m trong function PostgreSQL (lock order â†’ order item â†’ variants sorted â†’
// reservations, tÃ­nh audit cÃ¹ng transaction); route nÃ y chá»‰:
//   1. xÃ¡c thá»±c admin báº±ng session server (actor KHÃ”NG nháº­n tá»« client),
//   2. kiá»ƒm tra shape request,
//   3. map outcome tÆ°á»ng minh thÃ nh HTTP status â€” KHÃ”NG BAO GIá»œ tráº£ success giáº£
//      cho outcome khÃ´ng xÃ¡c Ä‘á»‹nh.
// Báº¥t ká»³ raise nÃ o bÃªn trong function â‡’ rollback toÃ n transaction â‡’ kho vÃ 
// Ä‘Æ¡n khÃ´ng Ä‘á»•i.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const OUTCOME_STATUS: Record<string, { status: number; success: boolean }> = {
  swapped: { status: 200, success: true },
  replayed: { status: 200, success: true },
  invalid_identity: { status: 400, success: false },
  invalid_request: { status: 400, success: false },
  quantity_immutable: { status: 400, success: false },
  unsupported_combo_line: { status: 400, success: false },
  variant_missing: { status: 400, success: false },
  variant_cross_product: { status: 400, success: false },
  not_found: { status: 404, success: false },
  item_not_found: { status: 404, success: false },
  not_editable: { status: 409, success: false },
  inventory_unverified: { status: 409, success: false },
  insufficient_stock: { status: 409, success: false },
  variant_mismatch: { status: 409, success: false },
  variant_unavailable: { status: 409, success: false },
  invalid_actor: { status: 403, success: false },
  reservation_missing: { status: 500, success: false },
};

const OUTCOME_MESSAGES: Record<string, string> = {
  swapped: "ÄÃ£ Ä‘á»•i máº«u giao hÃ ng thÃ nh cÃ´ng.",
  replayed: "Máº«u má»›i Ä‘Ã£ Ä‘Æ°á»£c Ã¡p dá»¥ng trÆ°á»›c Ä‘Ã³ â€” khÃ´ng láº·p Ä‘á»•i kho.",
  invalid_identity: "Thiáº¿u hoáº·c dÆ° Ä‘á»‹nh danh Ä‘Æ¡n hÃ ng (cáº§n Ä‘Ãºng má»™t trong orderId/orderCode).",
  invalid_request: "Tham sá»‘ Ä‘á»•i máº«u khÃ´ng há»£p lá»‡.",
  quantity_immutable: "KhÃ´ng Ä‘Æ°á»£c Ä‘á»•i sá»‘ lÆ°á»£ng khi Ä‘á»•i máº«u (Ä‘á»•i cáº£ dÃ²ng).",
  unsupported_combo_line: "KhÃ´ng há»— trá»£ Ä‘á»•i máº«u trá»±c tiáº¿p trÃªn dÃ²ng combo.",
  variant_missing: "DÃ²ng hÃ ng nÃ y khÃ´ng cÃ³ máº«u Ä‘á»ƒ Ä‘á»•i.",
  variant_cross_product: "Máº«u má»›i pháº£i thuá»™c cÃ¹ng sáº£n pháº©m vá»›i máº«u hiá»‡n táº¡i.",
  not_found: "KhÃ´ng tÃ¬m tháº¥y Ä‘Æ¡n hÃ ng.",
  item_not_found: "KhÃ´ng tÃ¬m tháº¥y dÃ²ng sáº£n pháº©m trong Ä‘Æ¡n.",
  not_editable: "ÄÆ¡n khÃ´ng cÃ²n Ä‘Æ°á»£c phÃ©p Ä‘á»•i máº«u á»Ÿ tráº¡ng thÃ¡i hiá»‡n táº¡i.",
  inventory_unverified: "ÄÆ¡n khÃ´ng cÃ³ provenance tá»“n kho, khÃ´ng thá»ƒ Ä‘á»•i máº«u an toÃ n.",
  insufficient_stock: "Máº«u má»›i khÃ´ng Ä‘á»§ tá»“n kho kháº£ dá»¥ng.",
  variant_mismatch: "Máº«u hiá»‡n táº¡i Ä‘Ã£ thay Ä‘á»•i, hÃ£y táº£i láº¡i Ä‘Æ¡n trÆ°á»›c khi thá»­ láº¡i.",
  variant_unavailable: "Máº«u Ä‘Æ°á»£c chá»n khÃ´ng tá»“n táº¡i hoáº·c khÃ´ng cÃ²n bÃ¡n.",
  invalid_actor: "TÃ i khoáº£n khÃ´ng cÃ³ quyá»n Ä‘á»•i máº«u.",
  reservation_missing: "Sá»• provenance tá»“n kho lá»‡ch dá»¯ liá»‡u â€” cáº§n Ä‘á»‘i soÃ¡t.",
};

export async function POST(request: Request) {
  try {
    const authCheck = await requireAdmin(request);
    if (!authCheck.authorized) {
      return authCheck.response;
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ success: false, error: "Request body khÃ´ng há»£p lá»‡." }, { status: 400 });
    }

    const orderCode = typeof body.orderCode === "string" ? body.orderCode.trim().toUpperCase() : "";
    const orderId = typeof body.orderId === "string" ? body.orderId.trim() : "";
    if (Boolean(orderCode) === Boolean(orderId)) {
      return NextResponse.json(
        { success: false, error: OUTCOME_MESSAGES.invalid_identity },
        { status: 400 },
      );
    }

    const orderItemId = typeof body.orderItemId === "string" ? body.orderItemId.trim() : "";
    const currentVariantId = typeof body.currentVariantId === "string" ? body.currentVariantId.trim() : "";
    const newVariantId = typeof body.newVariantId === "string" ? body.newVariantId.trim() : "";
    for (const [name, value] of [
      ["orderItemId", orderItemId],
      ["currentVariantId", currentVariantId],
      ["newVariantId", newVariantId],
    ] as const) {
      if (!value || !UUID_RE.test(value)) {
        return NextResponse.json(
          { success: false, error: `${name} khÃ´ng há»£p lá»‡.` },
          { status: 400 },
        );
      }
    }

    let quantity: number | undefined;
    if (body.quantity !== undefined && body.quantity !== null) {
      if (!Number.isInteger(Number(body.quantity)) || Number(body.quantity) <= 0) {
        return NextResponse.json(
          { success: false, error: "quantity pháº£i lÃ  sá»‘ nguyÃªn dÆ°Æ¡ng." },
          { status: 400 },
        );
      }
      quantity = Number(body.quantity);
    }

    let reason: string | undefined;
    if (body.reason !== undefined && body.reason !== null) {
      if (typeof body.reason !== "string" || body.reason.trim().length > 500) {
        return NextResponse.json(
          { success: false, error: "LÃ½ do Ä‘á»•i máº«u pháº£i lÃ  chuá»—i tá»‘i Ä‘a 500 kÃ½ tá»±." },
          { status: 400 },
        );
      }
      reason = body.reason.trim();
    }
    if (!reason) {
      return NextResponse.json(
        { success: false, error: "Lý do đổi mẫu là bắt buộc." },
        { status: 400 },
      );
    }

    const isMemberUuid = UUID_RE.test(authCheck.user.memberId || "");

    const { createAdminClient } = await import("@/lib/supabase/admin");
    const supabase = createAdminClient();

    // RPC jsonb Ä‘Æ¡n tham sá»‘ `p` (PostgREST contract cá»§a cáº£ chuá»—i 025â†’033).
    const res = await supabase.rpc("swap_order_item_variant_atomic", {
      p: {
        order_code: orderCode || null,
        order_id: !orderCode && orderId ? orderId : null,
        order_item_id: orderItemId,
        current_variant_id: currentVariantId,
        new_variant_id: newVariantId,
        actor_member_id: isMemberUuid ? authCheck.user.memberId : null,
        ...(quantity !== undefined ? { quantity } : {}),
        reason,
      },
    });
    const rpcData = (res.data ?? null) as Record<string, unknown> | null;
    const rpcError = res.error as { message?: string; details?: string | null } | null;

    if (rpcError || !rpcData) {
      // Lá»—i RAISE trong function = rollback toÃ n tx (khÃ´ng cÃ³ side effect).
      // H25:SWAP_STOCK_GUARD lÃ  dá»¯ liá»‡u lá»‡ch â†’ retry khÃ´ng tá»± háº¿t, cáº§n Ä‘á»‘i soÃ¡t.
      const unsafe = String(rpcError?.details || "").includes("H25:SWAP_STOCK_GUARD");
      return NextResponse.json(
        {
          success: false,
          error: rpcError?.message || "KhÃ´ng gá»i Ä‘Æ°á»£c swap_order_item_variant_atomic",
          ...(unsafe ? { retryable: false, needsRecon: true } : { retryable: true }),
        },
        { status: 500 },
      );
    }

    const outcome = String(rpcData.outcome ?? "");
    const mapped = OUTCOME_STATUS[outcome];
    if (!mapped) {
      // Contract khÃ´ng xÃ¡c Ä‘á»‹nh â€” KHÃ”NG BAO GIá»œ tráº£ success giáº£.
      return NextResponse.json(
        {
          success: false,
          error: `Káº¿t quáº£ khÃ´ng há»£p lá»‡ tá»« swap_order_item_variant_atomic: ${outcome}`,
          retryable: true,
        },
        { status: 500 },
      );
    }

    if (mapped.status === 500) {
      // reservation_missing: sá»• provenance lá»‡ch so vá»›i dÃ²ng Ä‘Æ¡n â€” khÃ´ng retry.
      return NextResponse.json(
        {
          success: false,
          outcome,
          error: OUTCOME_MESSAGES[outcome],
          retryable: false,
          needsRecon: true,
        },
        { status: 500 },
      );
    }

    return NextResponse.json(
      {
        success: mapped.success,
        outcome,
        ...(mapped.success ? {} : { error: OUTCOME_MESSAGES[outcome] }),
        ...(outcome === "replayed" ? { replayed: true } : {}),
        ...rpcData,
      },
      { status: mapped.status },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "KhÃ´ng thá»ƒ Ä‘á»•i máº«u giao hÃ ng.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
