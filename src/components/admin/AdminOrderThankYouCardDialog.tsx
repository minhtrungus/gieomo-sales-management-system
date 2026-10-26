"use client";

import type { Order } from "@/types/database";
import { OrderThankYouCardDialog } from "@/components/order/OrderThankYouCardDialog";

interface AdminOrderThankYouCardDialogProps {
  order: Order;
  onClose: () => void;
}

export function AdminOrderThankYouCardDialog({ order, onClose }: AdminOrderThankYouCardDialogProps) {
  return <OrderThankYouCardDialog order={order} onClose={onClose} />;
}
