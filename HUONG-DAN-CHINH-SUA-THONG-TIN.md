# 🧭 HƯỚNG DẪN VỊ TRÍ CÁC THÔNG TIN CỨNG (HARDCODED) & CÁCH CHỈNH SỬA

Tài liệu này tổng hợp toàn bộ các thông tin cứng (tên thương hiệu, tài khoản ngân hàng, hotline, email, địa chỉ, phí ship, điểm nhận hàng, nội dung banner, chính sách, sản phẩm mẫu...) nằm rải rác trong các file `.ts`, `.tsx` của dự án **Gieo Mơ**, giúp bạn dễ dàng tìm kiếm và chỉnh sửa nhanh chóng.

---

## 📑 MỤC LỤC NHANH
1. [Thông tin cốt lõi: Tên shop, Ngân hàng, Hotline, Email, Mạng xã hội](#1-thông-tin-cốt-lõi-cửa-hàng--ngân-hàng--liên-hệ)
2. [Cước phí vận chuyển & Ngưỡng Freeship](#2-cước-phí-vận-chuyển--ngưỡng-freeship)
3. [Điểm nhận hàng trực tiếp (Pickup Points)](#3-điểm-hẹn-nhận-hàng-trực-tiếp-pickup-points)
4. [Kho hàng, Sản phẩm mẫu, Combo & Voucher](#4-kho-hàng-sản-phẩm-danh-mục-combo--voucher-mẫu)
5. [Thành viên bán hàng & Sellers (Mã giới thiệu)](#5-danh-sách-thành-viên-bán-hàng-mã-giới-thiệu)
6. [Nội dung giao diện Trang chủ (Banner, Slogan, Giá trị thương hiệu)](#6-nội-dung-trang-chủ-homepage)
7. [Header (Thanh điều hướng) & Footer (Chân trang)](#7-header-menu--footer-chân-trang)
8. [Các trang Chính sách & FAQ (Hỏi đáp)](#8-các-trang-chính-sách--hỏi-đáp)
9. [Trang Đặt hàng thành công & Quét mã VietQR](#9-trang-đặt-hàng-thành-công--quét-mã-vietqr)
10. [Mẫu Email gửi khách hàng](#10-mẫu-email-xác-nhận-đơn-hàng)
11. [Cấu hình SEO, Metadata & Google Analytics](#11-cấu-hình-seo-metadata--google-analytics)

---

## 1. THÔNG TIN CỐT LÕI: CỬA HÀNG / NGÂN HÀNG / LIÊN HỆ

Hệ thống có thể chỉnh sửa thông tin này trực tiếp tại trang Admin **`http://localhost:3000/admin/settings`** (Cài đặt hệ thống). Tuy nhiên, khi chưa có dữ liệu trong Database Supabase hoặc khi reset, hệ thống sẽ đọc từ **giá trị mặc định trong code**. Bạn nên sửa cả 3 file sau để đồng bộ:

### 1.1. Cấu hình mặc định Client & LocalStore
- 📁 **File:** `src/lib/data/orderStore.ts`
- 🔍 **Vị trí:** Dòng ~1468 đến 1489 (biến `DEFAULT_SETTINGS`)
- ✏️ **Nội dung:**
  ```typescript
  export const DEFAULT_SETTINGS: SiteSettings = {
    siteName: "Gieo Mơ",
    contactPhone: "0123456789",               // Số hotline chính
    contactEmail: "gieomo@mammo.vn",           // Email liên hệ
    officeAddress: "TP. Hồ Chí Minh, Việt Nam",// Địa chỉ văn phòng
    flatShippingFee: 25000,                    // Phí ship mặc định (25k)
    freeShippingThreshold: 200000,             // Đơn từ 200k freeship
    bankNumber: "03456789999",                 // Số tài khoản ngân hàng
    bankHolder: "CLB MAM MO GIEO MO",          // Tên chủ tài khoản
    bankName: "MB Bank (Quân Đội)",            // Tên ngân hàng
    qrMode: "auto",                            // Chế độ tạo QR tự động
    qrImageUrl: "/images/logo_gieo mơ.jpg",    
    activePalette: "soft-green",
    coverTheme: "emerald",
    faviconPreview: "/icon.png",
    avatarPreview: "/images/logo_gieo mơ.jpg",
    facebookUrl: "https://www.facebook.com/BanHangGieoMo",
    tiktokUrl: "https://www.tiktok.com/@vuongquocmam",
    instagramUrl: "https://www.instagram.com/mam.mer.oii",
    zaloUrl: "",
    youtubeUrl: "",
  };
  ```

### 1.2. Cấu hình mặc định Phía Server (API / SSR)
- 📁 **File:** `src/lib/services/configService.ts`
- 🔍 **Vị trí:** Dòng ~29 đến 52 (biến `DEFAULT_SITE_SETTINGS`)
- ✏️ **Nội dung:** Giống hệt file trên, dùng làm fallback cho Server-side rendering (SSR) và API backend.

### 1.3. Cấu hình Thương hiệu & Mạng xã hội toàn hệ thống
- 📁 **File:** `src/lib/constants.ts`
- 🔍 **Vị trí:** Dòng ~8 đến 23 (biến `OFFICIAL_STORE_CONFIG`)
- ✏️ **Nội dung:**
  ```typescript
  export const OFFICIAL_STORE_CONFIG = {
    name: "Gieo Mơ",
    alternateName: "Tạp hoá Gây quỹ Mầm Mơ",
    url: "https://gieomo.store",
    logo: "https://gieomo.store/images/logo_gieo%20m%C6%A1.jpg",
    description: "Gieo Mơ là tạp hoá gây quỹ của Mầm Mơ...",
    socialLinks: {
      facebook: process.env.NEXT_PUBLIC_FACEBOOK_URL || "https://www.facebook.com/BanHangGieoMo",
      tiktok: process.env.NEXT_PUBLIC_TIKTOK_URL || "https://www.tiktok.com/@vuongquocmam",
      instagram: process.env.NEXT_PUBLIC_INSTAGRAM_URL || "https://www.instagram.com/mam.mer.oii",
    },
  };
  ```

### 1.4. Fallback Số tài khoản tại màn hình POS & Admin tạo đơn
Nếu chưa thiết lập trong trang Cài đặt, hai trang sau sẽ lấy fallback STK:
- 📁 `src/app/admin/orders/pos/page.tsx` (Dòng ~208): `settings.bankNumber || "03456789999"`
- 📁 `src/app/admin/orders/create/page.tsx` (Dòng ~177): `settings.bankNumber || "03456789999"`

---

## 2. CƯỚC PHÍ VẬN CHUYỂN & NGƯỠNG FREESHIP

Nếu muốn đổi mức phí ship cố định (25.000đ) hoặc mốc được miễn phí ship (200.000đ):
1. **Giá trị cấu hình:**
   - 📁 `src/lib/data/orderStore.ts` (dòng ~1473-1474): `flatShippingFee: 25000`, `freeShippingThreshold: 200000`
   - 📁 `src/lib/services/configService.ts` (dòng ~34-35): `flatShippingFee: 25000`, `freeShippingThreshold: 200000`
2. **Text hiển thị trong trang Chính sách giao hàng:**
   - 📁 `src/app/policy/delivery/page.tsx` (dòng ~49: `25.000đ`, dòng ~61: `200.000đ`)
3. **Thanh thông báo trong giỏ hàng (Cart Drawer):**
   - 📁 `src/components/cart/CartDrawer.tsx` (dòng ~83: thanh tiến độ còn thiếu bao nhiêu để freeship)

---

## 3. ĐIỂM HẸN NHẬN HÀNG TRỰC TIẾP (PICKUP POINTS)

Khách hàng khi checkout có thể chọn nhận hàng tại điểm hẹn. Danh sách 3 điểm hẹn mặc định gồm tên điểm, địa chỉ, người phụ trách, số điện thoại, khung giờ nhận:

- 📁 **File:** `src/lib/data/orderStore.ts`
- 🔍 **Vị trí:** Dòng ~488 đến 519 (biến `SEED_PICKUP_POINTS`)
- ✏️ **Nội dung:**
  - **Điểm 1 (pp-1):** ĐH Kinh Tế TP.HCM (Cơ sở B - 279 Nguyễn Tri Phương, Q.10) - Người liên hệ: Nguyễn Thị Mai Lan (0901 234 567) - Giờ mở cửa: Thứ 2 - Thứ 6.
  - **Điểm 2 (pp-2):** Trụ sở Dự Án Mầm Mơ (145 Nam Kỳ Khởi Nghĩa, Q.3) - Người liên hệ: Trần Minh Quân (0987 654 321) - Giờ mở cửa: Thứ 2 - Thứ 7.
  - **Điểm 3 (pp-3):** KTX Đại Học Quốc Gia Khu B (TP. Dĩ An / Thủ Đức) - Người liên hệ: Lê Hoàng Phúc (0912 345 678) - Giờ nhận: Tối 19h00 - 21h30.
- 📁 **File Backend API Fallback:** `src/app/api/pickup-points/route.ts` (dòng ~11-42: `FALLBACK_PICKUP_POINTS`)

---

## 4. KHO HÀNG, SẢN PHẨM, DANH MỤC, COMBO & VOUCHER MẪU

Toàn bộ dữ liệu sản phẩm mẫu, kho hàng mẫu, voucher giảm giá được định nghĩa tại:
- 📁 **File:** `src/lib/data/mockData.ts`

| Mục | Dòng trong file `mockData.ts` | Tên biến | Ghi chú |
|---|---|---|---|
| **Kho hàng** | Dòng 3 – 22 | `MOCK_WAREHOUSES` | Gồm: Kho Quận 3 (`KHO-Q3`) & Kho Thủ Đức (`KHO-THUDUC`), địa chỉ, sđt thủ kho |
| **Danh mục** | Dòng 43 – 71 | `MOCK_CATEGORIES` | Gồm: Túi & Pouch (`cat-1`), Phụ kiện may vá (`cat-2`), Quà tặng (`cat-3`) |
| **Sản phẩm mẫu** | Dòng 81 – 250 | `MOCK_PRODUCTS` | Gồm: Pouch Mầm Mơ, Kẹp tóc nơ may tay, Túi tote, Vòng vải... kèm giá tiền, giá so sánh, ảnh thumbnail |
| **Set Combo mẫu** | Dòng 260 – 350 | `MOCK_COMBOS` | Các gói combo ưu đãi tiết kiệm |
| **Mã giảm giá (Vouchers)**| Dòng 360 – 420 | `MOCK_VOUCHERS` | Gồm mã `MAMMO10` (giảm 10%), `FREESHIP2026`, `BANMOI15`, v.v. |
| **Đơn hàng mẫu (Orders)** | Dòng 440 – 1000 | `MOCK_ORDERS` | Dữ liệu đơn hàng mẫu hiển thị trong màn hình Admin |

---

## 5. DANH SÁCH THÀNH VIÊN BÁN HÀNG (MÃ GIỚI THIỆU)

Để theo dõi doanh số từng bạn tình nguyện viên / thành viên Mầm Mơ (ví dụ khách điền mã người giới thiệu khi mua):
- 📁 **File:** `src/lib/data/orderStore.ts`
- 🔍 **Vị trí:** Dòng ~650 đến 720 (biến `SEED_MEMBERS`)
- ✏️ **Nội dung:** Danh sách Mai Lan (`NV-001`), Thế Vinh (`NV-002`), Thu Trang (`NV-003`), Tuấn Kiệt (`NV-004`), v.v.

---

## 6. NỘI DUNG TRANG CHỦ (HOMEPAGE)

### 6.1. Banner Hero, Tiêu đề chính, Lời dẫn & Nút bấm
- 📁 **File:** `src/app/page.tsx`
  - Dòng ~60: Huy hiệu *"Dự án gây quỹ của Mầm Mơ"*
  - Dòng ~67: Tiêu đề lớn *"Little Pieces, Bigger Dreams"*
  - Dòng ~74: Lời ngỏ: *"Chào mừng bạn đến với thế giới may vá nhỏ xinh của Mầm! Mỗi chiếc pouch, kẹp tóc handmade bạn rước về là một điều ước..."*
  - Dòng ~102-114: Ba cam kết nhỏ: `100% Thủ công`, `Gây quỹ 100%`, `Freeship từ 200k`
  - Dòng ~122: Ảnh bìa chính `cover_gieomo.jpg`

### 6.2. 4 Thẻ Giá trị & Ý nghĩa thương hiệu (Soft Green, Blue, Yellow, Pink)
- 📁 **File:** `src/app/page.tsx`
  - Dòng ~169: Thẻ Xanh lá — *Mầm và Sự Phát Triển*
  - Dòng ~181: Thẻ Xanh dương — *Sợi Chỉ & Chiếc Túi Pouch*
  - Dòng ~195: Thẻ Vàng bơ — *Ánh Sáng & Sự Ấm Áp*
  - Dòng ~208: Thẻ Hồng pastel — *Tình Yêu & Sự Sẻ Chia (100% lợi nhuận hỗ trợ sách vở vùng cao)*

### 6.3. Khối Kêu gọi hành động (Call To Action - Cuối trang chủ)
- 📁 **File:** `src/app/page.tsx`
  - Dòng ~229: *"Sẵn sàng cùng Mầm gieo một giấc mơ?"*
  - Dòng ~241: Nút *"Rước quà handmade ngay ➔"*

---

## 7. HEADER (MENU) & FOOTER (CHÂN TRANG)

### 7.1. Header / Navbar
- 📁 **File:** `src/components/layout/Navbar.tsx`
  - Dòng ~31-37: Danh sách các menu điều hướng (`navLinks`):
    - Trang chủ (`/`)
    - Sản phẩm (`/products`)
    - Set Combo (`/combos`)
    - Tra cứu đơn (`/track`)
    - Hỏi đáp (`/faq`)
  - Dòng ~63: Slogan phụ dưới logo: *"Little Pieces, Bigger Dreams"*

### 7.2. Footer / Chân trang
- 📁 **File:** `src/components/layout/Footer.tsx`
  - Dòng ~46-56: Tên thương hiệu, slogan & mô tả chân trang
  - Dòng ~65-91: Cột liên kết nhanh (Khám phá Gieo Mơ)
  - Dòng ~95-122: Cột Hỗ trợ & Chính sách (FAQ, Giao hàng, Thanh toán, Liên hệ)
  - Dòng ~130-147: Cột Liên hệ (Email, Hotline, Địa chỉ lấy từ biến settings)
  - Dòng ~155-200: Các icon mạng xã hội (Facebook, TikTok, Instagram)
  - Dòng ~234-245: Dòng bản quyền copyright & câu thông điệp: *"Gieo Mơ — Dự án gây quỹ thuộc Mầm Mơ. 100% lợi nhuận được dành tặng cho các dự án giáo dục trẻ em."*

---

## 8. CÁC TRANG CHÍNH SÁCH & HỎI ĐÁP

| Trang | Đường dẫn file | Nội dung chính có thể sửa |
|---|---|---|
| **Chính sách Giao hàng** | `src/app/policy/delivery/page.tsx` | Cước phí 25k, ngưỡng freeship 200k, thời gian giao hàng (TP.HCM 1-2 ngày, tỉnh 2-4 ngày), đơn vị vận chuyển (GHN, GHTK, Viettel Post). |
| **Chính sách Thanh toán** | `src/app/policy/payment/page.tsx` | Hướng dẫn quét mã VietQR tự động, thanh toán COD khi nhận hàng, hướng dẫn chi tiết từng bước. |
| **Chính sách Bảo mật** | `src/app/policy/privacy/page.tsx` | Cam kết bảo mật thông tin người mua, mục đích sử dụng thông tin giao hàng. |
| **Hỏi đáp thường gặp (FAQ)** | `src/app/faq/page.tsx` | 5 câu hỏi - trả lời mẫu (dòng 14-34) về dự án Gieo Mơ, chất liệu thủ công, cách tra cứu đơn, v.v. |
| **Trang Liên hệ** | `src/app/contact/page.tsx` | Tiêu đề trang liên hệ, lời mời đóng góp gây quỹ, thông tin liên lạc. |

---

## 9. TRANG ĐẶT HÀNG THÀNH CÔNG & QUÉT MÃ VIETQR

Khi khách hàng vừa đặt hàng xong:
- 📁 **File:** `src/app/order/success/page.tsx`
  - Dòng ~52-56: Cú pháp URL sinh mã VietQR động qua cổng Napas 247 (`https://img.vietqr.io/image/MB-...`)
  - Dòng ~65: Nhãn trạng thái `⏳ ĐANG CHỜ CHUYỂN KHOẢN VIETQR`
  - Dòng ~71: Hướng dẫn: *"Vui lòng quét mã VietQR bên dưới để hoàn tất giao dịch. Sau khi nhận được chuyển khoản, hệ thống sẽ tự động xác nhận..."*
  - Dòng ~88: Lời cảm ơn khi đã hoàn tất: *"Cảm ơn bạn đã đồng hành cùng Gieo Mơ. Mối nhân duyên này mang lại thật nhiều giá trị tốt đẹp!"*
  - Dòng ~220-265: Bảng thông tin chuyển khoản thủ công (Ngân hàng, Chủ tài khoản, STK, Số tiền, Nội dung chuyển khoản mã đơn)
  - Dòng ~282: Nút xác nhận: *"✓ Tôi đã chuyển khoản xong — Xác nhận thanh toán"*

---

## 10. MẪU EMAIL XÁC NHẬN ĐƠN HÀNG

Khi có đơn hàng mới và gửi email tự động tới khách hàng:
- 📁 **File:** `src/lib/utils/emailService.ts`
  - Dòng ~10-11: Hotline & Email fallback (`0123 456 789`, `gieomo@mammo.vn`)
  - Dòng ~30: Header email: `🌱 Gieo Mơ — Mầm Mơ - Little Pieces, Bigger Dreams`
  - Dòng ~37: Lời ngỏ: *"Cảm ơn bạn đã gieo mơ cùng chúng mình!"*
  - Dòng ~40: Thông điệp gây quỹ: *"100% lợi nhuận từ sản phẩm sẽ được chuyển thành sách vở và dụng cụ học tập cho các em nhỏ vùng cao."*
  - Dòng ~97-105: Chân chữ ký email & lời chúc từ Đội ngũ tình nguyện viên Mầm Mơ.

---

## 11. CẤU HÌNH SEO, METADATA & GOOGLE ANALYTICS

- 📁 **File:** `src/app/layout.tsx`
  - Dòng ~8: Mã Google Analytics ID: `GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_ID || "G-P3MJB88K1K"`
  - Dòng ~25-30: Tiêu đề website mặc định (`title`) và mô tả website (`description`)
  - Dòng ~31-55: Danh sách từ khóa SEO (`keywords`): "Gieo Mơ", "Mầm Mơ", "Little Pieces Bigger Dreams", "đồ handmade gây quỹ"...
  - Dòng ~70-79: Đường dẫn file biểu tượng Favicon (`/favicon.ico`, `/icon.png`, `/apple-icon.png`)
- 📁 **File Robot SEO:** `src/app/robots.ts` (cấu hình Googlebot, chặn index trang `/admin/`)
- 📁 **File Sơ đồ trang web:** `src/app/sitemap.ts` (danh sách URL tự động gửi cho Google Search Console)

---

## 💡 LỜI KHUYÊN KHI CHỈNH SỬA

1. **Sửa thông tin liên hệ / Ngân hàng:**
   - Ưu tiên vào `http://localhost:3000/admin/settings` nhập thông tin thực tế của bạn và bấm **"Lưu cài đặt"**.
   - Sau đó sửa file `src/lib/data/orderStore.ts` (`DEFAULT_SETTINGS`) và `src/lib/services/configService.ts` (`DEFAULT_SITE_SETTINGS`) để khi mở trên máy khác hoặc xoá cache trình duyệt thì vẫn hiển thị thông tin mới nhất của bạn.
2. **Sửa hình ảnh:**
   - Toàn bộ ảnh logo, banner, sản phẩm nằm trong thư mục: `public/images/`
   - Ví dụ: Logo `public/images/logo_gieo mơ.jpg`, Bìa `public/images/cover_gieomo.jpg`, Sản phẩm `public/images/products/...`
3. **Đổi Font chữ hoặc Màu sắc chủ đạo:**
   - Màu sắc theo bảng màu pastel của Gieo Mơ được định nghĩa tại `tailwind.config.ts` (`soft-green`, `butter-yellow`, `soft-pink`, `powder-blue`, `warm-orange`).
