---
name: gieomo-admin-cms
description: Admin panel and CMS specification for Gieo Mơ — dashboard, order management, product management, member/sale tracking, content management, reports, and audit logs. Use when building any admin feature.
---

# Gieo Mơ — Admin / CMS Specification

## Admin Routes
```
/admin
├── dashboard
├── orders          — Order list + detail + create-for-customer
├── products        — Product CRUD + variants + media
├── combos          — Combo CRUD + items
├── inventory       — Stock overview + adjustments
├── customers       — Customer list + profile
├── payments        — Payment list + confirmation
├── vouchers        — Voucher CRUD + validation rules
├── members         — Member management + roles
├── sales           — Sales dashboard per member
├── shipping        — Shipping board (kanban-style)
├── workshops       — Workshop CRUD + registrations
├── content         — CMS blocks (hero, FAQ, gallery, etc.)
├── sponsors        — Sponsor/partner management by tier
├── media           — Media library
├── reports         — Revenue, orders, products, profit
├── audit-logs      — Action history
└── settings        — System configs
```

## Dashboard
Must answer at a glance:
- Đơn mới? Đơn chờ xác nhận? Đơn đang giao?
- Doanh thu hôm nay / tuần / chiến dịch?
- Bao nhiêu tiền đã thu?
- Sản phẩm sắp hết? Combo bán tốt?
- Thành viên chốt nhiều đơn nhất?

### Quick Actions
- Tạo đơn hộ
- Xác nhận thanh toán
- Xử lý đơn mới
- Thêm sản phẩm
- Kiểm kho

## Order Management
Features: Search (code, phone), Filter (status, payment, delivery, seller, date), Sort, Bulk actions, View detail, Edit note, Assign shipper, Confirm payment, Change status, Export, Table/Kanban view toggle, Print packing slip.

## Create Order for Customer
Admin form "Nhập đơn hộ" — NOT through public checkout:
- Select existing/new customer
- Source (landing page, member referral, social, manual, other)
- Member chốt đơn (dropdown)
- Search & add products
- Delivery method + payment method
- Create order

## Product Management
CRUD with: variants/SKU, media gallery, pricing (price, compare_at_price, cost_price), badges (new, best seller, limited), category, status, featured, sort order, weight.

## Member / Sales
- Referral link: `/?ref=CODE`
- Sales dashboard: orders/member, revenue/member, completion rate
- Don't delete history when member inactive

## CMS Content Blocks
Manageable: hero, announcement/marquee, featured products, impact story, stats, gallery, sponsors, FAQ, testimonials, CTA, footer.

Each block: `enabled`, `sort_order`, `start_at`, `end_at` (scheduling).

## Reports
- Revenue: gross, discount, shipping, net
- Orders: per day, per status, AOV
- Products: units sold, stock, best sellers
- Sales members: orders/member, revenue/member
- Profit: if cost_price data is complete

## Mobile Admin
- Card view instead of table
- Filter drawer
- Sticky action bar
- Bottom action sheet/modal
- Form sections or steps for long forms
- No zoom/pan on huge tables

## Security
- RLS on all protected tables
- Backend authorization check on every operation
- Admin routes require authentication + role check
- Audit log for all sensitive operations
