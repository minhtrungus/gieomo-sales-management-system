---
name: gieomo-order-lifecycle
description: Order lifecycle, status transitions, payment flow, delivery flow, inventory rules, and business logic for Gieo Mơ commerce system. Use when implementing order creation, status changes, payment confirmation, delivery assignment, or any order-related feature.
---

# Gieo Mơ — Order Lifecycle & Business Logic

## 3 Separate Status Tracks

### Order Status
```
pending → confirmed → processing → ready_to_ship → shipping → completed
                                                                    ↗
pending / confirmed / processing → cancelled
```

### Payment Status
```
pending → paid → refunded
              → failed
```

### Delivery Status
```
not_ready → packed → handed_to_carrier → in_transit → out_for_delivery → delivered

failed_delivery → returned

(For pickup): ready_for_pickup → picked_up
```

## Status Transition Rules
- **NEVER** allow arbitrary status changes (e.g., `completed → pending`)
- Each transition must have a defined rule
- Only valid transitions should be available in the UI

## Customer-Facing Timeline Mapping
```
pending       → "Đã đặt hàng"
confirmed     → "Đang xác nhận"
processing    → "Đang chuẩn bị hàng"
ready_to_ship → "Đã bàn giao vận chuyển"
shipping      → "Đang giao"
completed     → "Giao thành công"
cancelled     → "Đã hủy"
```

## Inventory Rules

### Stock Deduction
- Stock is deducted when order moves to `confirmed`
- Deduction must be **atomic** — no negative stock allowed
- Use database-level CHECK constraint: `stock >= 0`

### Stock Restoration (Cancel)
- When cancelling an order that was already confirmed:
  - Restore stock **exactly once**
  - Guard against double-restock on retry/refresh
  - Log the restoration in audit_logs

### Combo Stock
- Combo purchase deducts component products atomically:
```
Combo A × 2
→ Product 1: -2
→ Product 2: -4
→ Product 3: -2
```
- If any component fails, entire transaction rolls back
- If combo components insufficient, combo is "not available"

## Payment Flow
1. Customer selects payment method at checkout
2. For `banking`: display bank info → customer transfers → admin confirms
3. For `cod`: payment confirmed at delivery
4. For `momo`: similar to banking flow (manual confirmation unless webhook)
5. Server validates payment — never trust client "already paid" claim
6. Payment history is append-only, never overwrite

## Voucher Validation (Server-Side)
1. Code exists?
2. Status active?
3. Within date range?
4. Meets minimum order value?
5. Usage limit not exceeded?
6. Per-customer limit not exceeded? (if applicable)
7. Discount recalculated server-side — NEVER trust frontend discount value

## Order Creation Flow
1. Validate cart items (stock, status, prices)
2. Create/find customer
3. Validate voucher if present
4. Calculate: subtotal, shipping, discount, final_amount (SERVER-SIDE)
5. Create order with `pending` status
6. Create order_items with snapshots
7. Log in order_status_history
8. Send notification to BTC
9. Return order_code to customer

## Price Calculation
```
subtotal = Σ(unit_price × quantity) for each item
voucher_discount = apply voucher rules
shipping_fee = calculate from delivery_zone / flat fee / free threshold
final_amount = subtotal - voucher_discount + shipping_fee
```
All calculations happen on the server. Frontend displays estimates only.

## Idempotency Guards
- Create order: use idempotency key or check for duplicate within time window
- Confirm payment: check current status before updating
- Cancel order: check if cancellation is valid from current status
- Restock: track restoration flag to prevent double-restock
