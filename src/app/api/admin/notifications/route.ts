import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { NotificationItem, NotificationType } from "@/lib/notifications/NotificationContext";

export const dynamic = "force-dynamic";

const STATE_CONFIG_KEY = "admin_notifications_state";

interface NotificationState {
  readIds: string[];
  starredIds: string[];
  deletedIds: string[];
}

async function getNotificationState(supabase: any): Promise<NotificationState> {
  try {
    const { data } = await supabase
      .from("system_configs")
      .select("config_value")
      .eq("config_key", STATE_CONFIG_KEY)
      .maybeSingle();

    if (data?.config_value) {
      const parsed = JSON.parse(data.config_value);
      return {
        readIds: Array.isArray(parsed.readIds) ? parsed.readIds : [],
        starredIds: Array.isArray(parsed.starredIds) ? parsed.starredIds : [],
        deletedIds: Array.isArray(parsed.deletedIds) ? parsed.deletedIds : [],
      };
    }
  } catch (err) {
    console.warn("[getNotificationState] Error reading state:", err);
  }
  return { readIds: [], starredIds: [], deletedIds: [] };
}

async function saveNotificationState(supabase: any, state: NotificationState): Promise<void> {
  try {
    await supabase.from("system_configs").upsert(
      {
        config_key: STATE_CONFIG_KEY,
        config_value: JSON.stringify(state),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "config_key" }
    );
  } catch (err) {
    console.warn("[saveNotificationState] Error saving state:", err);
  }
}

export async function GET() {
  try {
    const supabase = createAdminClient();

    // 1. Fetch persistent read/starred/deleted state
    const state = await getNotificationState(supabase);
    const readSet = new Set(state.readIds);
    const starredSet = new Set(state.starredIds);
    const deletedSet = new Set(state.deletedIds);

    // 2. Fetch live data concurrently from Supabase
    const [ordersRes, messagesRes, productsRes] = await Promise.all([
      supabase
        .from("orders")
        .select("order_id, order_code, receiver_name, final_amount, order_status, payment_status, created_at")
        .order("created_at", { ascending: false })
        .limit(30),
      supabase
        .from("contact_messages")
        .select("id, name, email, message, status, created_at")
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("products")
        .select("product_id, name, status, product_variants(stock)")
        .eq("status", "active")
        .limit(30),
    ]);

    const notifications: NotificationItem[] = [];

    // Map Orders
    if (ordersRes.data && Array.isArray(ordersRes.data)) {
      for (const ord of ordersRes.data) {
        const id = `order-${ord.order_code}`;
        if (deletedSet.has(id)) continue;

        const isPending = ord.order_status === "pending";
        const isRead = readSet.has(id) || !isPending;
        const amountStr = (Number(ord.final_amount) || 0).toLocaleString("vi-VN");

        notifications.push({
          id,
          type: "order" as NotificationType,
          title: isPending ? `Đơn hàng mới #${ord.order_code}` : `Đơn hàng #${ord.order_code}`,
          desc: isPending
            ? `${ord.receiver_name || "Khách hàng"} vừa đặt đơn trị giá ${amountStr}đ - Chờ duyệt đơn`
            : `${ord.receiver_name || "Khách hàng"} - ${amountStr}đ (${ord.order_status})`,
          created_at: ord.created_at,
          read: isRead,
          starred: starredSet.has(id),
          link: `/admin/orders?code=${ord.order_code}`,
          meta: {
            order_code: ord.order_code,
            amount: Number(ord.final_amount) || 0,
            customer: ord.receiver_name,
          },
        });
      }
    }

    // Map Contact Messages
    if (messagesRes.data && Array.isArray(messagesRes.data)) {
      for (const msg of messagesRes.data) {
        const id = `msg-${msg.id}`;
        if (deletedSet.has(id)) continue;

        const isUnread = msg.status === "unread";
        const isRead = readSet.has(id) || !isUnread;
        const snippet = msg.message
          ? msg.message.length > 70
            ? `${msg.message.slice(0, 70)}...`
            : msg.message
          : "Khách hàng gửi lời nhắn liên hệ";

        notifications.push({
          id,
          type: "system" as NotificationType,
          title: `Tin nhắn từ ${msg.name || "Khách hàng"}`,
          desc: snippet,
          created_at: msg.created_at,
          read: isRead,
          starred: starredSet.has(id),
          link: `/admin/messages`,
          meta: {
            customer: msg.name,
          },
        });
      }
    }

    // Map Stock Alerts (Only alert if the ENTIRE product has 0 stock across all variants)
    if (productsRes.data && Array.isArray(productsRes.data)) {
      for (const prod of productsRes.data) {
        const variants = (prod as any).product_variants || [];
        const totalStock = variants.reduce((sum: number, v: any) => sum + (Number(v.stock) || 0), 0);

        // Only notify if product has variants and total stock is 0
        if (variants.length > 0 && totalStock <= 0) {
          const id = `stock-prod-${prod.product_id}`;
          if (deletedSet.has(id)) continue;

          const isRead = readSet.has(id);

          notifications.push({
            id,
            type: "stock" as NotificationType,
            title: `Hết hàng: ${prod.name}`,
            desc: `Sản phẩm "${prod.name}" đã hết sạch toàn bộ tồn kho. Vui lòng nhập thêm hàng!`,
            created_at: new Date().toISOString(),
            read: isRead,
            starred: starredSet.has(id),
            link: `/admin/inventory`,
            meta: {
              product_name: prod.name,
              stock: 0,
            },
          });
        }
      }
    }

    // Sort by created_at descending
    notifications.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    const unreadCount = notifications.filter((n) => !n.read).length;

    return NextResponse.json({
      success: true,
      unreadCount,
      notifications,
    });
  } catch (err: any) {
    console.error("[GET /api/admin/notifications] Error:", err);
    return NextResponse.json({
      success: true,
      unreadCount: 0,
      notifications: [],
    });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, ids = [], id } = body;

    const targetIds = Array.isArray(ids) && ids.length > 0 ? ids : id ? [id] : [];
    if (!action) {
      return NextResponse.json({ success: false, error: "Thiếu action" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const state = await getNotificationState(supabase);

    const readSet = new Set(state.readIds);
    const starredSet = new Set(state.starredIds);
    const deletedSet = new Set(state.deletedIds);

    if (action === "markAsRead") {
      targetIds.forEach((tId) => readSet.add(tId));
      // Also update contact_messages status if applicable
      for (const tId of targetIds) {
        if (tId.startsWith("msg-")) {
          const msgId = tId.replace("msg-", "");
          const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(msgId);
          if (isUuid) {
            await supabase.from("contact_messages").update({ status: "read" }).eq("id", msgId);
          }
        }
      }
    } else if (action === "markAsUnread") {
      targetIds.forEach((tId) => readSet.delete(tId));
    } else if (action === "markAllRead") {
      // Get all current notifications
      const getRes = await GET();
      const data = await getRes.json();
      if (Array.isArray(data.notifications)) {
        data.notifications.forEach((n: NotificationItem) => readSet.add(n.id));
      }
    } else if (action === "toggleStar") {
      targetIds.forEach((tId) => {
        if (starredSet.has(tId)) {
          starredSet.delete(tId);
        } else {
          starredSet.add(tId);
        }
      });
    } else if (action === "delete") {
      targetIds.forEach((tId) => deletedSet.add(tId));
    }

    // Keep arrays bounded to prevent bloat
    const updatedState: NotificationState = {
      readIds: Array.from(readSet).slice(-200),
      starredIds: Array.from(starredSet).slice(-200),
      deletedIds: Array.from(deletedSet).slice(-200),
    };

    await saveNotificationState(supabase, updatedState);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[POST /api/admin/notifications] Error:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Lỗi cập nhật thông báo" },
      { status: 500 }
    );
  }
}
