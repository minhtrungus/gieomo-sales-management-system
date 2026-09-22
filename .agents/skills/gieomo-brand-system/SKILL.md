---
name: gieomo-brand-system
description: Visual design system, brand concept, color palette, typography, UI shape language, and art direction for the Gieo Mơ storefront. Use when building any UI component, page layout, or visual element.
---

# Gieo Mơ — Brand & Design System

## Brand Concept
**"Mầm khám phá thế giới may vá"** — Website tạo cảm giác như một thế giới may vá tí hon, mềm mại và đầy tò mò.

### Slogan
> **"Little Pieces, Bigger Dreams"** — Những mảnh ghép nhỏ, một giấc mơ lớn.

### Key Visual
- Nhân vật **Mầm** bước/chui ra từ **pouch (túi nhỏ)**
- Mầm có **kẹp tóc hình nút áo** (signature detail)
- Supporting: sợi chỉ, nút áo, cuộn chỉ, mảnh vải, kim/đường may

### Không khí
Soft, Dreamy, Playful, Handmade, Youthful, Ấm áp — Không quá childish, không quá luxury.

---

## Color Palette

| Token | HEX | Vai trò |
|---|---|---|
| `soft-green` | `#BFE9C3` | Brand chủ đạo, Mầm, sự phát triển |
| `powder-blue` | `#CFE8FF` | Background phụ, pouch, dreamy |
| `butter-yellow` | `#FFE7A8` | Ánh sáng, thread, highlight |
| `warm-orange` | `#FFB98A` | Accent, nút áo, CTA phụ |
| `soft-pink` | `#FFD1E1` | Accent playful, illustration |
| `cream` | `#FFF8EE` | Background nền chính / canvas |

### Rules
- **Cream** = nền chính
- **Soft Green** = nhận diện chính, không dùng mọi nơi
- **Powder Blue / Butter Yellow / Soft Pink** = supporting
- **Warm Orange** = accent, không biến mọi CTA thành orange
- Text phải đạt contrast đủ đọc trên nền pastel

## Gradient System
```
main-gradient     → background chính
dreamy-gradient   → hero / featured content
warm-gradient     → accent / campaign CTA
soft-gradient     → secondary surface / card
```
Gradient nhẹ, mềm, không neon.

---

## Typography

| Level | Font | Usage |
|---|---|---|
| Headline / Display | **Boldonse** | Hero title, campaign headline |
| Section heading | **Montserrat Medium/Bold** | Section titles |
| Body / UI text | **Montserrat Regular** | Paragraphs, labels, forms |

- Boldonse: KHÔNG dùng cho paragraph, table, form
- Body text phải rõ ràng trên mobile

---

## UI Shape Language
- Card/surface: bo góc mềm
- Button: thân thiện, dễ bấm
- Icon/illustration: nét mềm
- Subtle dashed/stitch border cho campaign areas only
- Border, shadow, gradient: tiết chế

## Design Tokens (CSS Variables)
```css
--color-brand: #BFE9C3;
--color-brand-soft: #d4f0d7;
--color-powder-blue: #CFE8FF;
--color-butter-yellow: #FFE7A8;
--color-warm-orange: #FFB98A;
--color-soft-pink: #FFD1E1;
--color-cream: #FFF8EE;
--color-text: #2D2D2D;
--color-text-muted: #6B7280;
--color-surface: #FFFFFF;
--color-border: #E5E7EB;
--color-success: #22C55E;
--color-warning: #F59E0B;
--color-danger: #EF4444;

--radius-sm: 0.375rem;
--radius-md: 0.75rem;
--radius-lg: 1rem;
--radius-xl: 1.5rem;

--font-display: 'Boldonse', cursive;
--font-heading: 'Montserrat', sans-serif;
--font-body: 'Montserrat', sans-serif;
```
