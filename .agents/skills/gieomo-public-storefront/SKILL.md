---
name: gieomo-public-storefront
description: Public-facing storefront specification for Gieo Mơ — homepage, product catalog, product detail, cart, checkout, order tracking, and customer-facing UX. Use when building any public page or customer flow.
---

# Gieo Mơ — Public Storefront Specification

## Public Routes
```
/                          — Homepage (landing + storefront)
/products                  — Product catalog
/products/[slug]           — Product detail
/products?category=&sort=  — Filtered catalog
/categories/[slug]         — Category page
/search?q=                 — Search results
/combos                    — Combo listing
/combos/[slug]             — Combo detail
/cart                      — Shopping cart
/checkout                  — Checkout form
/order/success             — Order confirmation
/order/[orderCode]         — Order detail (via tracking)
/track                     — Order tracking
/faq                       — FAQ
/contact                   — Contact
/policy/privacy            — Privacy policy
/policy/terms              — Terms of service
```

## Homepage Structure (AIDA: Attention → Interest → Desire → Action)
```
Hero (campaign label + "Little Pieces, Bigger Dreams" + CTA + Mầm visual)
↓ Featured Products
↓ Impact / Little Pieces story
↓ Featured Combos
↓ Mầm / Sewing visual break
↓ How it works / Delivery info
↓ Community / Feedback
↓ Sponsors
↓ FAQ
↓ Final CTA
↓ Footer
```

## Product Card
- Ảnh, Tên, Giá, Giá cũ (strikethrough), Tag (Mới/Bán chạy/Combo), Tồn kho status, CTA

## Product Detail
- Gallery, Tên, Giá, Mô tả, Thành phần/quy cách, Impact/ý nghĩa
- Tồn kho, Variant/SKU selector, Quantity control
- CTA: "Thêm vào giỏ" + "Mua ngay"
- Related products, FAQ liên quan

## Cart
- Change quantity, Remove item
- Subtotal, Voucher input, Shipping estimate, Final amount
- Stock warnings (out of stock, insufficient, price changed)
- Persist on same device
- Select/deselect items before checkout
- Block checkout for hidden/delisted items

## Checkout
Fields: Người đặt, SĐT, Email (optional), Người nhận (if different), SĐT nhận, Delivery method, Address/pickup point, Note, Voucher, Payment method.

UX: No account required, no duplicate input, total always visible, inline errors, loading state on submit, anti double-submit.

## Order Success
```
🎉 Đặt hàng thành công
Mã đơn: GM-XXX
Tổng tiền: xxx.xxxđ
[Tra cứu đơn] [Về trang chủ]
```
+ Banking instructions if applicable

## Order Tracking (/track)
Simple form: phone + order code → shows timeline:
```
🟢 Đã đặt → 🟢 Đã xác nhận → ⚪ Đang giao → ⚪ Hoàn tất
```
Customer MUST NOT see: cost price, profit, internal notes, seller info, audit logs, other customers' data.

## Search / Filter / Sort
- Category filter, Price range, In-stock filter
- Sort: featured, newest, price asc/desc, best selling
- URL with query params (shareable/bookmarkable)
- Empty state when no results
- Debounced search

## UX Principles
1. **Visual = Mầm Mơ** | **Interaction = e-commerce best practice**
2. Mobile-first: touch targets ≥44px, 1-2 column grid, drawer filters
3. CTA: clear action language — "Thêm vào giỏ", "Mua ngay", "Thanh toán"
4. States with brand personality: empty cart, no results, out of stock, success, error, loading
5. Price presentation: strikethrough original, clear final price
6. `prefers-reduced-motion` respected
7. Alt text, focus states, keyboard nav, semantic headings

## SEO
- Page title + meta description per page
- Open Graph tags
- Canonical URL
- Sitemap + robots.txt
- Product pages have unique metadata
- Structured data where appropriate
- Admin pages: noindex
