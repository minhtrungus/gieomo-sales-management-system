# GIEO MƠ — MASTER AGENT INSTRUCTIONS
## Website bán hàng + Landing Page + CMS/Admin + vận hành nội bộ

> **Mục đích của tài liệu này**
>
> Đây là tài liệu hướng dẫn duy nhất mà Agent cần đọc để hiểu toàn bộ hệ thống Gieo Mơ và cách tự xử lý dự án.
> Không coi đây chỉ là tài liệu database. Agent phải xem đây là **Product + UX/UI + Architecture + Business Logic + Admin/CMS + Security + Deployment + QA specification**.
>
> Agent được kỳ vọng có thể tự audit codebase, thiết kế/hoàn thiện tính năng, sửa lỗi, kết nối dịch vụ, migrate dữ liệu, test, deploy và bàn giao mà không cần người dùng nhắc lại các nguyên tắc trong tài liệu này.

---

# 0. VAI TRÒ CỦA AGENT

Bạn là **Senior Full-stack Product Engineer + UI/UX Engineer + DevOps Engineer** phụ trách toàn bộ website Gieo Mơ.

Bạn không chỉ "code theo yêu cầu từng tin nhắn". Bạn phải:

1. Hiểu sản phẩm và mục tiêu vận hành của Mầm Mơ.
2. Tự kiểm tra codebase hiện tại trước khi thay đổi.
3. Bảo toàn những phần đang hoạt động tốt.
4. Ưu tiên giải pháp đơn giản, rẻ, dễ bảo trì, phù hợp BTC sinh viên.
5. Khi gặp nhiều lựa chọn kỹ thuật, tự chọn phương án hợp lý theo nguyên tắc trong tài liệu này.
6. Không tạo tính năng chỉ vì "có thể làm"; mọi tính năng phải phục vụ khách hàng hoặc BTC.
7. Tự kiểm tra responsive, accessibility cơ bản, error state, empty state, loading state và dữ liệu thực tế.
8. Không để secret/API key trong frontend, repository công khai hoặc dữ liệu trả về cho client.
9. Không làm mất dữ liệu cũ khi refactor/migrate nếu chưa có chiến lược backup/migration.
10. Sau mỗi thay đổi lớn, chạy kiểm tra build/lint/test hoặc kiểm tra tương đương với stack đang dùng.

## Nguyên tắc tự chủ

- **Không hỏi lại những thứ tài liệu này đã quyết định.**
- Nếu một chi tiết nhỏ chưa được định nghĩa, hãy chọn phương án UX/engineering hợp lý nhất, ghi nhận quyết định trong code/docs và tiếp tục.
- Chỉ yêu cầu người dùng cung cấp thông tin khi thật sự không thể tiến hành nếu thiếu thông tin đó, ví dụ secret, quyền truy cập tài khoản, nội dung thương hiệu chưa có, hoặc một quyết định kinh doanh không thể suy ra.
- Không đổi toàn bộ framework chỉ vì Agent thích framework khác.
- Nếu repository hiện tại đã dùng một stack hợp lý, **ưu tiên tiếp tục stack hiện tại** thay vì rewrite toàn bộ.
- Không hy sinh dữ liệu, SEO, accessibility, tốc độ hoặc tính ổn định chỉ để giao diện "đẹp hơn".

---

# 1. BỐI CẢNH SẢN PHẨM

## 1.1. Gieo Mơ là gì?

**Gieo Mơ** là hệ thống bán hàng gây quỹ của Mầm Mơ.

Website phải đồng thời đóng vai trò:

- Landing page kể câu chuyện và tạo niềm tin.
- Cửa hàng trực tuyến để khách xem và mua sản phẩm/combo.
- Kênh tiếp nhận đơn hàng từ khách.
- Công cụ để BTC nhập đơn hộ khách.
- Hệ thống theo dõi người giới thiệu/chốt đơn.
- Công cụ quản lý sản phẩm, tồn kho, voucher, đơn hàng, thanh toán và giao hàng.
- Cổng tra cứu đơn cho khách hàng.
- CMS để BTC thay đổi nội dung web mà không phải sửa code.
- Dashboard để BTC xem tổng quan doanh thu, tồn kho, đơn hàng, hiệu quả bán hàng.
- Nền tảng có thể mở rộng workshop/sự kiện và các hoạt động gây quỹ khác.

## 1.2. Mục tiêu cốt lõi

### Với khách hàng

Khách phải có thể:

- Hiểu Gieo Mơ là gì trong vài giây đầu.
- Biết mua gì, giá bao nhiêu, lợi ích/ý nghĩa của việc mua.
- Xem sản phẩm/combo rõ ràng.
- Thêm giỏ hàng, kiểm tra đơn, nhập thông tin giao hàng.
- Thanh toán thuận tiện.
- Nhận xác nhận đơn.
- Tra cứu đơn dễ dàng bằng điện thoại.
- Sử dụng website tốt trên màn hình nhỏ.

### Với BTC

BTC phải có thể:

- Quản lý sản phẩm.
- Quản lý combo.
- Quản lý tồn kho.
- Quản lý đơn hàng.
- Nhập đơn hộ khách.
- Gán người giới thiệu/chốt đơn.
- Xác nhận thanh toán.
- Phân công giao hàng.
- Theo dõi doanh số theo thành viên.
- Quản lý voucher.
- Quản lý banner, text, sponsor, FAQ, social link, thông tin liên hệ và các nội dung landing.
- Xuất dữ liệu để đối soát.
- Theo dõi log để biết ai đã thao tác gì.

## 1.3. Nguyên tắc chi phí

Mục tiêu vận hành là **0đ hoặc tiệm cận 0đ trong phạm vi free tier hợp lý**.

## 1.4. MÔ HÌNH THƯƠNG MẠI — “SHOPEE THU NHỎ”, KHÔNG PHẢI “CRUD SHOP”

Hãy tư duy website như một **marketplace/storefront thu nhỏ**: khách có thể duyệt sản phẩm → xem chi tiết → chọn phân loại/số lượng → thêm giỏ → áp mã → chọn nhận hàng → thanh toán → theo dõi đơn. BTC có một khu vực vận hành riêng để xử lý toàn bộ vòng đời đơn.

Mô hình này tham khảo các pattern thương mại điện tử phổ biến của Shopee như: thông tin sản phẩm đầy đủ, giá gốc/giá ưu đãi, phân loại, giỏ hàng, checkout, voucher, nhiều trạng thái đơn và theo dõi vận chuyển; đồng thời tham khảo cách quản lý đơn ngoài sàn/thêm đơn thủ công cho các kênh khác.

### Các lớp của hệ thống thương mại

```text
CATALOG
  ↓
SEARCH / CATEGORY / FILTER / SORT
  ↓
PRODUCT DETAIL
  ↓
CART
  ↓
CHECKOUT
  ↓
PAYMENT
  ↓
ORDER
  ↓
FULFILLMENT / PACKING
  ↓
SHIPPING / PICKUP
  ↓
DELIVERED / COMPLETED
  ↓
POST-PURCHASE / REVIEW / SUPPORT
```

### Nguyên tắc quan trọng

- **Product** là thông tin hiện tại đang bán.
- **Order Item** là ảnh chụp (snapshot) của thứ khách đã mua tại thời điểm đặt hàng.
- **Order status**, **Payment status** và **Delivery status** phải tách riêng; không dùng một field để đại diện cho cả ba.
- Giá, giảm giá, phí ship và tổng tiền cuối cùng phải được **tính lại ở server**, không tin giá gửi từ frontend.
- Không nên sao chép mọi tính năng của Shopee. Chỉ lấy những pattern giúp khách mua hàng dễ hơn và BTC vận hành rõ hơn.
- Những tính năng nâng cao như livestream, chat realtime, recommendation AI, flash sale phức tạp, hệ thống khiếu nại lớn... **không thuộc MVP** trừ khi có yêu cầu riêng.

Không được hiểu "0đ" là ép tất cả bằng mọi giá. Agent phải:

- Ưu tiên dịch vụ có free tier.
- Không thêm SaaS trả phí nếu chức năng có thể giải quyết bằng hạ tầng hiện có.
- Không lựa chọn kiến trúc khiến BTC phải trả phí chỉ vì một tính năng nhỏ.
- Khi free tier có thay đổi, không hard-code giả định về quota; hãy kiểm tra docs chính thức hoặc cho phép thay thế provider.

---

# 2. THAM CHIẾU WEBSITE MẦM MƠ HIỆN TẠI

Website tham chiếu chính:

**https://www.thethaomammo.id.vn/**

Website hiện tại thể hiện một số pattern cần giữ tinh thần:

- Hero/branding rõ ràng.
- Sponsor/partner section.
- Giới thiệu chương trình.
- Danh sách nội dung/sự kiện động.
- Hình ảnh/galley.
- Tra cứu thông tin.
- Khu vực tính năng nổi bật.
- Các "quick access" link tới chức năng chuyên biệt.
- Footer có social/contact.
- Nội dung thay đổi theo dữ liệu thay vì hard-code hoàn toàn.

Trang hiện tại có các nhóm nội dung như giới thiệu chương trình, giải sắp tới/đã diễn ra, hình ảnh, tra cứu VĐV, tính năng nổi bật, truy cập nhanh và nhà tài trợ/đối tác. Đây là tham chiếu về **cách Mầm Mơ tổ chức thông tin**, không phải yêu cầu sao chép nguyên xi. 

### Quy tắc tham chiếu

- Giữ cảm giác là **một sản phẩm thuộc hệ sinh thái Mầm Mơ**.
- Có storytelling và cảm xúc, nhưng không làm giảm khả năng bán hàng.
- Không clone layout một cách máy móc.
- Không biến website thành "Shopee mini" lạnh lẽo.
- Phải cân bằng 3 lớp:
  1. **Cảm xúc / sứ mệnh**
  2. **Sản phẩm / chuyển đổi**
  3. **Tin cậy / minh bạch**

---

# 3. TECH STACK — QUYẾT ĐỊNH MẶC ĐỊNH

## 3.1. Nếu bắt đầu project mới

Ưu tiên kiến trúc:

- **Next.js + TypeScript**
- **Tailwind CSS**
- **Supabase PostgreSQL**
- **Supabase Auth**
- **Supabase Storage**
- **Vercel**
- Có thể dùng một thư viện component nhẹ nếu cần, nhưng không phụ thuộc nặng vào UI library.

## 3.2. Nếu repository đã tồn tại

- Audit stack hiện tại trước.
- Nếu stack hiện tại ổn định và đáp ứng yêu cầu, tiếp tục sử dụng.
- Không rewrite chỉ để đổi sang Next.js.
- Nếu cần migrate framework, phải có lý do kỹ thuật rõ ràng và bảo toàn dữ liệu/chức năng.

## 3.3. Kiến trúc ưu tiên

Tổ chức theo các lớp:

```text
UI
↓
Page / Route
↓
Feature / Use Case
↓
Server Action / API
↓
Domain Logic / Validation
↓
Database / Storage / External Service
```

Không để business logic quan trọng nằm rải rác trong component UI.

## 3.4. Security boundary

Tách rõ:

- Public client code.
- Authenticated member/admin code.
- Server-side privileged operations.
- Service-role credentials.

**Không bao giờ** expose service-role key hoặc secret backend vào browser.

---

# 4. INFORMATION ARCHITECTURE TOÀN BỘ WEBSITE

## 4.1. Public Website

Tối thiểu nên có:

```text
/
├── Hero / Story
├── Featured Products
├── Combo nổi bật
├── Vì sao mua Gieo Mơ?
├── Tiền/giá trị gây quỹ được dùng như thế nào?
├── Câu chuyện / impact
├── Nhà tài trợ & đối tác
├── FAQ
├── CTA mua hàng
└── Footer

/products
/products/[slug]
/products?category=...&sort=...&minPrice=...&maxPrice=...&stock=...

/categories/[slug]
/search?q=...

/combos
/combos/[slug]

/cart
/wishlist              # optional / Phase 3

/checkout

/order/success
/order/[orderCode]

/track
/faq
/contact
/policy/privacy
/policy/terms
```

Có thể bổ sung:

```text
/workshops
/workshops/[slug]
```

khi hệ thống có workshop thực sự.

## 4.2. Admin / CMS

Không hard-code `/admin` một cách tuỳ tiện nếu framework có routing convention tốt. Tuy nhiên về mặt UX cần có nhóm chức năng:

```text
/admin
├── dashboard
├── orders
├── products
├── combos
├── inventory
├── customers
├── payments
├── vouchers
├── members
├── sales
├── workshops
├── content
├── sponsors
├── media
├── reports
├── audit-logs
└── settings
```

## 4.3. Mobile Admin

Trên mobile:

- Ưu tiên Card View.
- Filter drawer.
- Sticky action bar.
- Bottom action sheet/modal.
- Không bắt BTC zoom/pan một bảng dữ liệu khổng lồ.
- Form dài phải chia section hoặc step.

---

# 5. PUBLIC WEBSITE — UX/UI SPEC

## 5.1A. BRAND CONCEPT — “MẦM KHÁM PHÁ THẾ GIỚI MAY VÁ”

Đây là **direction hình ảnh cốt lõi của Gieo Mơ**, không phải một trang campaign riêng lẻ. Agent phải dùng direction này làm nền tảng khi xây dựng public storefront, product card, banner, empty state, CTA, illustration, popup và các thành phần marketing UI, trừ khi BTC cung cấp một art direction mới.

### Concept

**Mầm khám phá thế giới may vá.**

Website cần tạo cảm giác như một **thế giới may vá tí hon, mềm mại và đầy tò mò**, nơi những vật dụng nhỏ bé kết nối với nhau để mở ra một giấc mơ lớn.

### Slogan chính

> **“Little Pieces, Bigger Dreams”**
>
> Những mảnh ghép nhỏ, một giấc mơ lớn.

Không ép slogan xuất hiện ở mọi section. Dùng tại hero, campaign section, visual highlight hoặc những điểm mà thông điệp thương hiệu thực sự có giá trị.

### Key Visual

Hình ảnh trung tâm là **nhân vật Mầm nhỏ bé bước/chui ra từ một chiếc pouch (túi nhỏ)**. Pouch được xem như một “cánh cửa” dẫn Mầm tới một thế giới mới.

**Signature detail:** Mầm có **kẹp tóc hình nút áo**. Đây là chi tiết nhận diện nên được giữ nhất quán khi dùng illustration/visual có nhân vật Mầm.

### Supporting visual language

Ưu tiên các chi tiết:

- **Sợi chỉ:** những đường cong mềm mại chạy quanh Mầm và pouch, tạo cảm giác chuyển động và kết nối.
- **Nút áo:** xuất hiện với nhiều kích thước; có thể phóng đại một vài chiếc để nhấn mạnh ý niệm “Little Pieces”.
- **Cuộn chỉ:** đặt cạnh pouch hoặc phía sau Mầm như một lớp background.
- **Mảnh vải:** patch nhỏ, mảng màu mềm, texture vải nhẹ.
- **Kim / đường may:** dùng như decorative detail, không biến thành pattern dày đặc.

### Composition rule

Ưu tiên thứ tự thị giác:

```text
POUCH ở trung tâm / vùng thấp
        ↓
MẦM chui / bước ra
        ↓
CUỘN CHỈ + NÚT ÁO + MẢNH VẢI bao quanh
        ↓
CÁC ĐƯỜNG CHỈ chạy xuyên background
```

Các vật dụng may vá có thể **phóng đại nhẹ so với nhân vật Mầm** để tạo cảm giác một “xứ sở may vá thu nhỏ”. Không để decorative elements lấn át sản phẩm hoặc CTA.

### Không khí hình ảnh

- Soft.
- Dreamy.
- Playful.
- Handmade.
- Youthful.
- Ấm áp và có cảm giác được làm bằng tay.
- Không quá childish.
- Không quá luxury.
- Không biến thành website đồ may mặc thông thường.

---

## 5.1B. VISUAL DESIGN SYSTEM — COLOR / TYPOGRAPHY / GRAPHIC RULES

### Color palette bắt buộc

| Token | HEX | Vai trò mặc định |
|---|---|---|
| `soft-green` | `#BFE9C3` | Màu thương hiệu chủ đạo, liên hệ với Mầm và sự phát triển |
| `powder-blue` | `#CFE8FF` | Background phụ, pouch, các vùng tạo cảm giác mơ mộng |
| `butter-yellow` | `#FFE7A8` | Ánh sáng, thread, highlight nhỏ |
| `warm-orange` | `#FFB98A` | Accent, nút áo, CTA phụ, điểm nhấn typography |
| `soft-pink` | `#FFD1E1` | Accent playful, illustration, campaign detail |
| `cream` | `#FFF8EE` | Background nền tổng thể / canvas chính |

### Quy tắc dùng màu

- **Cream** nên là nền chính để các màu pastel có không gian thở.
- **Soft Green** là màu nhận diện chính, không dùng mọi nơi cùng lúc.
- **Powder Blue / Butter Yellow / Soft Pink** làm supporting colors.
- **Warm Orange** là accent; không biến toàn bộ CTA thành orange.
- Tránh thêm quá nhiều màu mới chỉ để “trang trí”. Mọi màu bổ sung phải có lý do UX rõ ràng và vẫn hòa vào palette pastel.
- Text chính phải đạt độ tương phản đủ đọc; pastel không được dùng làm text màu sáng trên nền sáng.

### Gradient system

Được phép định nghĩa các gradient semantic thay vì mỗi section tự tạo gradient:

```text
main-gradient
→ background chính

dreamy-gradient
→ highlight / hero / featured content

warm-gradient
→ accent / campaign CTA / promotional element

soft-gradient
→ secondary surface / card / decorative background
```

Gradient phải nhẹ, mềm, không tạo cảm giác neon hoặc quá bão hòa.

### Typography system

**Headline / Display:** `Boldonse`

- Dùng cho hero title, campaign headline, big visual statement.
- Không dùng Boldonse cho đoạn văn dài, bảng dữ liệu, form hoặc UI dense.
- Nếu font asset chưa tồn tại trong repository, Agent phải kiểm tra asset/brand package trước; nếu chưa thể sử dụng, dùng fallback gần nhất và ghi rõ trong implementation. Không được tự ý thay đổi toàn bộ typography system.

**Section heading:** `Montserrat Medium` hoặc `Montserrat Bold`

**Body / UI text:** `Montserrat Regular`

Typography phải ưu tiên **readability trước decorative effect**. Font display có thể vui nhộn; body text phải rõ ràng và dễ đọc trên mobile.

### UI shape language

- Card và surface ưu tiên bo góc mềm.
- Button có hình dáng thân thiện, dễ bấm.
- Icon/illustration nên có nét mềm, không quá sharp/corporate.
- Border, shadow và gradient dùng tiết chế.
- Có thể dùng subtle dashed/stitch-like border ở khu vực campaign/illustration, nhưng không dùng cho mọi card.

### Texture / illustration

Có thể dùng:

- Texture giấy/vải rất nhẹ.
- Stitch line.
- Patch.
- Nút áo.
- Thread curve.

Không dùng texture quá nặng làm giảm độ rõ của text, giá sản phẩm hoặc CTA.

---

## 5.1C. UI/UX PRINCIPLES — “CẢM XÚC MẦM MƠ, HÀNH VI NHƯ SHOP”

Website phải đồng thời đạt hai mục tiêu tưởng như đối lập:

> **Visual = Mầm Mơ**  |  **Interaction = một shop thương mại điện tử tốt**

Không hy sinh usability để làm concept đẹp.

### 1. Visual hierarchy

Mỗi màn hình phải trả lời được: **khách cần nhìn gì trước, làm gì tiếp theo?**

Thứ tự ưu tiên trên storefront:

```text
1. Sản phẩm / thông điệp chính
2. Giá / lợi ích
3. CTA
4. Thông tin hỗ trợ quyết định mua
5. Decorative visual
```

Không để illustration, sticker, thread, button animation hoặc background visual che lấp giá, tên sản phẩm, trạng thái còn hàng hoặc CTA.

### 2. Commerce-first interaction

Dù thiết kế theo concept may vá, các pattern thương mại phải quen thuộc:

- Product card → Product detail → Add to cart.
- Sticky cart / cart summary khi phù hợp.
- Giá hiển thị rõ ràng.
- Variant selector dễ hiểu.
- Quantity control dễ bấm.
- Checkout ít bước.
- Delivery status nhìn là hiểu.
- CTA dùng ngôn ngữ hành động rõ: `Thêm vào giỏ`, `Mua ngay`, `Thanh toán`, `Tra cứu đơn`.

Không dùng các wording quá “thơ” thay thế action label chuẩn khiến khách không biết phải bấm gì. Có thể dùng copy cảm xúc ở supporting text, nhưng CTA vẫn phải rõ.

### 3. Mobile-first

Audience chính có thể thao tác bằng điện thoại. Vì vậy:

- Thiết kế mobile trước.
- Touch target tối thiểu khoảng 44px cho control quan trọng.
- Product grid chuyển sang 1–2 cột tùy width.
- Filter trên mobile dùng drawer/sheet.
- Cart summary có thể sticky ở đáy khi cần.
- Checkout tránh form quá dài trên một màn hình.
- Không yêu cầu hover để hiểu chức năng.

### 4. “Handmade” nhưng không được “rough”

Concept may vá không có nghĩa giao diện phải lộn xộn.

Được phép có:

- asymmetry nhẹ ở hero,
- sticker/patch nhỏ,
- thread curve,
- micro-illustration,
- playful badge.

Nhưng hệ thống spacing, alignment, typography và interaction state vẫn phải nhất quán như một sản phẩm chuyên nghiệp.

### 5. Product photography

Ảnh sản phẩm là nội dung thương mại, không phải decorative image.

- Sản phẩm phải là chủ thể rõ nhất trong product image.
- Background ảnh nên hòa với cream/pastel system nhưng không được làm mất chi tiết sản phẩm.
- Gallery hỗ trợ ảnh toàn cảnh + chi tiết + packaging khi có.
- Không crop khiến sản phẩm bị khuất.

### 6. Price / sale presentation

Nếu có khuyến mãi:

```text
Giá gốc  ~~150.000đ~~
Giá bán  120.000đ
Tiết kiệm 30.000đ
```

Giá cuối cùng phải dễ nhận biết nhất. Không dùng màu accent quá mạnh cho mọi mức giá.

### 7. States phải mang cùng brand language

Các trạng thái sau không được là UI mặc định vô hồn:

- Empty cart.
- No search result.
- Out of stock.
- Order success.
- Error.
- Loading.
- No upcoming event.

Có thể dùng Mầm, thread, button, pouch, patch hoặc copy nhẹ nhàng để tạo personality, nhưng thông tin hành động vẫn phải rõ.

Ví dụ:

```text
[illustration Mầm + cuộn chỉ]
“Giỏ hàng đang chờ được gieo thêm vài mảnh nhỏ ♡”

[Tiếp tục khám phá sản phẩm]
```

Đây chỉ là style tham khảo; không lạm dụng copy sến ở mọi trạng thái.

### 8. Micro-interaction

Nên có:

- Button hover/press nhẹ.
- Add-to-cart feedback rõ.
- Quantity update có phản hồi.
- Toast thành công/lỗi.
- Modal/drawer transition ngắn.
- Subtle thread-like motion ở hero nếu hiệu năng cho phép.

Không dùng animation dài, parallax nặng hoặc animation liên tục gây mỏi mắt / giảm performance / ảnh hưởng reduced-motion.

### 9. Accessibility vẫn là bắt buộc

Pastel brand không được trở thành lý do bỏ qua accessibility.

Agent phải kiểm tra:

- Contrast.
- Keyboard focus.
- Form labels.
- Alt text.
- Semantic heading order.
- `prefers-reduced-motion`.
- Không truyền tải trạng thái chỉ bằng màu.

### 10. Responsive art direction

Desktop và mobile **không cần giống nhau từng pixel**.

Desktop có thể thể hiện đầy đủ thế giới may vá với nhiều decorative elements; mobile phải ưu tiên:

```text
Product
→ Price
→ CTA
→ Key information
→ Supporting visual
```

Khi decorative visual gây chật chỗ, Agent phải **giảm / reposition / hide decorative elements**, không thu nhỏ toàn bộ UI đến mức khó đọc.

---

## 5.1D. HOMEPAGE ART DIRECTION

Hero được ưu tiên theo cấu trúc:

```text
[small campaign label]

LITTLE PIECES,
BIGGER DREAMS

Một câu supporting copy ngắn giải thích Gieo Mơ
và giá trị của việc mua hàng.

[Khám phá sản phẩm]  [Câu chuyện Gieo Mơ]

                         Mầm + Pouch
                  Thread / Buttons / Fabric
```

Hero không được thành poster minh họa thuần túy. CTA phải nhìn thấy ngay.

### Section rhythm

Landing page nên tạo nhịp xen kẽ:

```text
Story / Hero
↓
Products
↓
Little Pieces / Impact
↓
Featured Combo
↓
Mầm / Sewing visual
↓
How it works / Delivery
↓
Community / Feedback
↓
Sponsors
↓
FAQ
↓
Final CTA
```

Không bắt buộc đúng thứ tự nếu dữ liệu thực tế cho thấy flow khác tốt hơn, nhưng luôn phải giữ logic:

**Attention → Understanding → Desire → Trust → Purchase.**

## 5.1E. UX/UI QUALITY BAR

Một màn hình chỉ được xem là hoàn thiện khi đồng thời đạt:

```text
Brand consistency
+ Clear hierarchy
+ Familiar commerce interaction
+ Mobile usability
+ Accessibility
+ Loading / empty / error / success states
+ Performance
```

**Không chấp nhận tình trạng “trông đẹp trên desktop nhưng khó mua trên mobile”, hoặc “đẹp theo concept nhưng người dùng không biết phải bấm gì”.**

---

## 5.1. Brand feeling

Website phải truyền tải:

- Ấm áp.
- Có tính cộng đồng.
- Tích cực.
- Trẻ trung.
- Tin cậy.
- Không quá corporate.
- Không quá "từ thiện hóa" theo kiểu bi lụy.
- Không quá giống sàn thương mại điện tử đại trà.

## 5.2. Homepage hierarchy

Thứ tự ưu tiên:

### Above the fold

Khách cần hiểu ngay:

**Gieo Mơ bán gì + vì sao nên mua + CTA mua hàng**

Không bắt khách đọc một đoạn manifesto quá dài trước khi thấy sản phẩm.

### Sau Hero

Ưu tiên:

1. Sản phẩm/combo nổi bật.
2. Ý nghĩa gây quỹ.
3. Social proof / hình ảnh / feedback.
4. Sponsor/partner.
5. FAQ.
6. CTA cuối trang.

## 5.3. Catalogue / Search / Filter / Sort

Website bán hàng phải có cảm giác **dễ duyệt hàng** thay vì chỉ là một landing page có vài nút mua.

Tối thiểu hỗ trợ:

- Danh mục sản phẩm.
- Tìm kiếm theo tên/keyword.
- Lọc theo danh mục.
- Lọc khoảng giá.
- Lọc còn hàng/hết hàng.
- Sắp xếp: nổi bật, mới nhất, giá tăng/giảm, bán chạy nếu có dữ liệu.
- URL có query params có thể chia sẻ/bookmark.
- Kết quả tìm kiếm không được làm lộ dữ liệu nội bộ.
- Có empty state khi không có sản phẩm phù hợp.

Không cần search engine phức tạp ở MVP; PostgreSQL search/index phù hợp là đủ nếu quy mô nhỏ.

## 5.4. Product card

Mỗi card nên có:

- Ảnh.
- Tên.
- Giá.
- Giá cũ nếu có.
- Tag như "Mới", "Bán chạy", "Combo".
- Tình trạng tồn kho nếu cần.
- CTA rõ.
- Không hiển thị quá nhiều text.

## 5.5. Product detail

Tối thiểu:

- Gallery ảnh.
- Tên.
- Giá.
- Mô tả.
- Thành phần/quy cách nếu có.
- Ý nghĩa/impact.
- Tồn kho.
- Số lượng.
- CTA "Thêm vào giỏ".
- CTA "Mua ngay".
- Related products.
- FAQ liên quan.
- SKU/variant nếu sản phẩm có phân loại.
- Giá theo variant nếu có.
- Khối lượng/quy cách đóng gói nếu liên quan tới phí ship.
- Thông tin dự kiến giao/nhận nếu có thể tính.
- Số lượng đã bán chỉ hiển thị nếu BTC thực sự muốn dùng như social proof.

### Variant / SKU

Ví dụ:

```text
Áo Mầm Mơ
├── Size S — SKU MM-AO-S — 120.000đ — stock 5
├── Size M — SKU MM-AO-M — 120.000đ — stock 12
└── Size L — SKU MM-AO-L — 130.000đ — stock 3
```

Nếu sản phẩm không có variant, vẫn có thể dùng một SKU mặc định.

## 5.6. Cart

Phải cho phép:

- Thay đổi quantity.
- Xóa item.
- Hiển thị subtotal.
- Hiển thị voucher.
- Ước tính phí vận chuyển.
- Final amount rõ ràng.
- Cảnh báo item hết hàng.
- Cảnh báo tồn kho không đủ.
- Persist cart hợp lý trên cùng thiết bị.
- Cho phép chọn/bỏ chọn item trước checkout.
- Hiển thị cảnh báo khi giá hoặc tồn kho của item thay đổi sau khi thêm vào giỏ.
- Không cho checkout item đã bị ẩn/không còn bán.

## 5.7. Checkout

Form tối thiểu:

- Người đặt.
- SĐT.
- Email (optional hoặc required tùy kênh notification).
- Người nhận nếu khác người đặt.
- SĐT người nhận.
- Hình thức nhận hàng.
- Địa chỉ hoặc điểm nhận.
- Ghi chú.
- Voucher.
- Phương thức thanh toán.

### UX checkout

- Không bắt tạo tài khoản.
- Không bắt khách nhập thông tin lặp lại.
- Tổng tiền phải luôn nhìn thấy.
- Báo lỗi ngay cạnh field.
- Có loading state sau khi submit.
- Chống double-submit.
- Không tự tạo hai đơn vì khách bấm nút hai lần.

---

# 6. ADMIN / CMS — PHẦN QUAN TRỌNG NHẤT

Admin không được chỉ là "CRUD database".

Đây là một **operating system mini cho BTC**.

## 6.1. Dashboard

Dashboard cần trả lời nhanh:

- Có bao nhiêu đơn mới?
- Bao nhiêu đơn cần xác nhận?
- Doanh thu hôm nay / tuần / chiến dịch?
- Bao nhiêu tiền đã thu?
- Bao nhiêu đơn đang giao?
- Sản phẩm nào sắp hết?
- Combo nào bán tốt?
- Thành viên nào đang chốt nhiều đơn?
- Có lỗi/thao tác bất thường nào cần chú ý?

### Dashboard cards

Ví dụ:

```text
Đơn mới       12
Chờ thanh toán 7
Đang giao      9
Doanh thu     8.450.000đ
```

Kèm quick actions:

- Tạo đơn hộ.
- Xác nhận thanh toán.
- Xử lý đơn mới.
- Thêm sản phẩm.
- Kiểm kho.

## 6.2. Order management

Trang đơn hàng phải hỗ trợ:

- Search order code.
- Search phone.
- Filter status.
- Filter payment status.
- Filter delivery type.
- Filter seller.
- Filter date.
- Sort.
- Bulk action nếu an toàn.
- View detail.
- Edit note.
- Assign shipper.
- Confirm payment.
- Change status theo transition hợp lệ.
- Export.
- Chuyển đổi giữa Table View và Kanban/Status View nếu hữu ích.
- Bulk processing cho các thao tác an toàn như gán shipper/in phiếu.
- In/print packing slip hoặc phiếu giao hàng.

### Order detail

Phải nhìn được trên một màn hình:

```text
Mã đơn
Khách hàng
Người nhận
Nguồn đơn
Người giới thiệu
Sản phẩm
Combo
Subtotal
Voucher
Shipping
Final total
Payment
Delivery status
Timeline
Notes
Audit log liên quan
```

## 6.3. Create order for customer

BTC phải có form **"Nhập đơn hộ"**.

Ví dụ:

```text
[ Khách hàng cũ / Khách mới ]

Nguồn:
( ) Landing page
( ) Thành viên giới thiệu
( ) Fanpage MXH
( ) Khác

Thành viên chốt đơn: [Dropdown]

Sản phẩm:
[Search product]
[Qty]

Hình thức nhận:
[ Giao tận nơi / Điểm nhận ]

Thanh toán:
[ COD / Banking / MoMo / ...]

[ Tạo đơn ]
```

Không bắt BTC phải đi qua checkout public.

---

# 7. PRODUCT MANAGEMENT

## 7.1. Product

Admin được:

- Tạo.
- Sửa.
- Ẩn/hiện.
- Set giá.
- Set giá vốn.
- Set tồn kho.
- Upload ảnh.
- Sắp xếp thứ tự.
- Set featured.
- Set slug.
- Set category/tag.
- Set mô tả.
- Set trạng thái bán.
- Set category.
- Quản lý variant/SKU.
- Set barcode/SKU nội bộ nếu BTC cần.
- Set khối lượng đóng gói và kích thước nếu dùng để tính ship.
- Set giá gốc, giá bán hiện tại và giá khuyến mãi theo thời gian nếu có.
- Set badge: Mới / Bán chạy / Sắp hết / Limited.

### Product fields tối thiểu cho storefront

```text
name
slug
short_description
description
category_id
price
compare_at_price nullable
cost_price nullable
status
featured
sort_order
weight_gram nullable
thumbnail
media_gallery
```

`compare_at_price` chỉ được hiển thị là “giá cũ” khi có cơ sở dữ liệu/logic khuyến mãi phù hợp; không tạo giá ảo.

## 7.2. Không sửa dữ liệu lịch sử

Khi sản phẩm đã xuất hiện trong đơn:

- Không được để thay đổi tên/giá hiện tại làm sai lịch sử đơn.
- Order item phải lưu snapshot cần thiết:
  - tên sản phẩm tại thời điểm mua,
  - đơn giá,
  - giá vốn hoặc cost snapshot,
  - discount snapshot.

## 7.3. Stock

Không chỉ có `stock`.

Nên có logic:

```text
available stock
reserved stock (nếu có cơ chế giữ hàng)
sold quantity
restocked quantity
adjustment
```

Nếu chưa cần reservation, vẫn phải xử lý cạnh tranh khi nhiều người đặt cùng lúc.

Mọi thao tác điều chỉnh kho quan trọng phải có log:

```text
Ai
Khi nào
Trước bao nhiêu
Sau bao nhiêu
Lý do
```

---

# 8. COMBO MANAGEMENT

Combo là một "bộ sản phẩm", không phải một sản phẩm độc lập đơn giản.

Ví dụ:

```text
Combo A
├── Sản phẩm 1 × 1
├── Sản phẩm 2 × 2
└── Sản phẩm 3 × 1
```

Khi đơn được xác nhận:

```text
Combo A × 2
→ Product 1 -2
→ Product 2 -4
→ Product 3 -2
```

Phải xử lý transaction/atomic operation để không xảy ra:

```text
trừ Product 1 thành công
trừ Product 2 thất bại
→ data sai
```

Nếu combo không đủ thành phần, hệ thống phải xem combo là không thể bán.

---

# 9. ORDER LIFECYCLE

## 9.1. Tách 3 loại trạng thái

Không dùng một enum duy nhất cho toàn bộ lifecycle.

### Order status

```text
pending
→ confirmed
→ processing
→ ready_to_ship
→ shipping
→ completed
```

Nhánh thay thế:

```text
pending / confirmed / processing
→ cancelled
```

### Payment status

```text
pending
→ paid
→ refunded
```

Có thể có:

```text
failed / partially_refunded
```

nếu nghiệp vụ thực sự cần.

### Delivery status

```text
not_ready
→ packed
→ handed_to_carrier
→ in_transit
→ out_for_delivery
→ delivered
```

Nhánh lỗi:

```text
failed_delivery
→ returned
```

Đối với `agency_pickup` có thể dùng:

```text
ready_for_pickup
→ picked_up
```

### Customer-facing timeline

Khách không cần thấy enum kỹ thuật. Hãy map thành ngôn ngữ dễ hiểu:

```text
Đã đặt hàng
↓
Đang xác nhận
↓
Đang chuẩn bị hàng
↓
Đã bàn giao vận chuyển
↓
Đang giao
↓
Giao thành công
```

Mô hình nhiều trạng thái + timeline giúp việc theo dõi đơn rõ ràng hơn thay vì chỉ hiển thị một chữ “processing”. Đây là pattern tham khảo từ các trạng thái đơn và theo dõi vận chuyển của Shopee.

## 9.2. Không được cho phép đổi trạng thái tuỳ ý

Ví dụ:

```text
completed → pending
```

không được phép bằng một dropdown bình thường.

Mỗi transition phải có rule.

## 9.3. Inventory rule

Theo thiết kế gốc:

> Tồn kho được trừ khi đơn chuyển sang `confirmed`.

Khi implement, phải đảm bảo thao tác này **atomic** và không cho stock âm.

Khi huỷ một đơn đã từng reserve/trừ kho:

- Hoàn kho đúng một lần.
- Không được double-restock nếu admin mở lại/refresh/thao tác lặp.

---

# 10. PAYMENT

Tách rõ:

## 10.1. Payment status

```text
pending
paid
refunded
```

## 10.2. Payment method

Có thể gồm:

```text
cod
banking
momo
```

Có thể thêm provider khác về sau.

## 10.3. Banking

Nếu dùng chuyển khoản:

- Không tin client tự khai "đã chuyển".
- Admin phải có flow xác nhận.
- Nếu có webhook/payment provider, server phải là nguồn xác nhận chính.
- Lưu transaction code/reference nếu có.

## 10.4. Payment history

Không overwrite lịch sử payment quan trọng.

Ví dụ:

```text
09:10 pending
09:22 paid — confirmed by Minh
```

---

# 11. CUSTOMER MANAGEMENT

Khách không bắt buộc có tài khoản.

Nhưng hệ thống vẫn phải có customer profile để:

- Gộp nhiều đơn của cùng khách.
- Theo dõi tổng số đơn.
- Tổng chi tiêu.
- Lịch sử mua.
- Thông tin liên hệ.

## 11.1. Customer data

Tối thiểu:

```text
customer_id
full_name
phone
email
default_address
created_at
updated_at
```

`total_orders` và `total_spent` có thể là computed data hoặc materialized/cache; nếu lưu, phải tránh lệch dữ liệu.

## 11.2. Privacy

Không trả về toàn bộ thông tin khách chỉ vì biết số điện thoại.

Tra cứu public phải:

- rate limit,
- tránh enumeration,
- mask PII,
- không expose địa chỉ đầy đủ nếu không cần,
- tốt nhất yêu cầu thêm một yếu tố xác minh như mã đơn hoặc mã xác thực.

---

# 12. CUSTOMER ORDER TRACKING

Trang `/track` phải cực đơn giản.

Ví dụ:

```text
TRA CỨU ĐƠN GIEO MƠ

Số điện thoại
[Mời bạn nhập...]

Mã đơn (nếu có)
[GM-001]

[ TRA CỨU ]
```

Kết quả:

```text
GM-001
Đã xác nhận

🟢 Đã đặt
🟢 Đã xác nhận
⚪ Đang giao
⚪ Hoàn tất

Tổng: 245.000đ
```

Không biến trang tra cứu thành admin UI.

---

### 12.1. Order detail cho khách

Trang đơn hàng phải cho thấy rõ:

```text
Mã đơn
Ngày đặt
Danh sách sản phẩm + phân loại
Tạm tính
Giảm giá
Phí vận chuyển
Tổng thanh toán
Phương thức thanh toán
Phương thức nhận hàng
Địa chỉ/điểm nhận snapshot
Trạng thái đơn
Trạng thái thanh toán
Trạng thái vận chuyển
Timeline
Mã vận đơn (nếu có)
```

Khách không được thấy:

- giá vốn,
- lợi nhuận,
- member seller nội bộ,
- audit log nội bộ,
- ghi chú BTC,
- thông tin cá nhân của khách khác.

# 13. MEMBER / SALE TRACKING

## 13.1. Referral link

Hỗ trợ:

```text
/?ref=MTUS01
```

Agent cần:

1. Đọc `ref`.
2. Validate ref.
3. Lưu referral trong client session/local storage hoặc cookie phù hợp.
4. Khi tạo order, gửi ref đã xác thực lên server.
5. Server xác định seller/member.
6. Lưu seller vào order.

Không tin `seller_id` gửi trực tiếp từ browser nếu user có thể tự sửa.

## 13.2. BTC nhập đơn hộ

Admin có dropdown:

```text
Thành viên chốt đơn
```

và:

```text
Nguồn đơn
```

Những dữ liệu này phải nằm trong order để báo cáo.

## 13.3. Sales dashboard

Có thể xem:

```text
Thành viên
Số đơn
Doanh thu
Sản lượng
Tỷ lệ hoàn thành
```

Không xóa hoặc thay đổi lịch sử doanh số khi member bị inactive.

---

# 14. VOUCHER

Voucher phải có rule rõ:

```text
code
type
value
minimum order
start
end
usage limit
per-customer limit (nếu có)
active
```

Khi validate:

- code tồn tại?
- đang active?
- đúng thời gian?
- đạt min order?
- còn usage?
- khách có vượt limit không?

Discount phải được tính lại **server-side**.

Không tin số discount từ frontend.

---

# 15. POST-PURCHASE / REVIEW

Có thể triển khai sau MVP nhưng kiến trúc nên chừa chỗ cho:

- Đánh giá sao 1–5.
- Nội dung nhận xét.
- Ảnh feedback.
- Chỉ cho đánh giá sản phẩm khi đơn đã `completed`.
- Mỗi order item tối đa một đánh giá từ một khách.
- Admin có quyền ẩn review vi phạm quy tắc nội dung.

Đây là pattern tham khảo từ marketplace; không cần xây hệ thống review phức tạp ngay trong Phase 1.

# 16. WORKSHOP / EVENT MODULE

Đây là module mở rộng, không được làm phức tạp core commerce nếu chưa sử dụng.

## Workshop

```text
title
description
start_time
end_time
location
capacity
price
status
```

## Registration

```text
workshop_id
customer_id
registrant_member_id
attendee_name
attendee_phone
check_in_status
```

Có thể mở rộng:

- QR check-in.
- Registration code.
- Waitlist.
- Attendance export.

---

# 17. CMS / CONTENT MANAGEMENT

Đây là phần bản brainstorm cũ còn thiếu.

BTC phải có khả năng thay đổi phần lớn nội dung public mà không cần deploy code.

## 16.1. Content blocks

Nên hỗ trợ:

```text
hero
announcement / marquee
featured products
impact story
stats
gallery
sponsors
faq
testimonials
cta
footer
```

## 16.2. Site configuration

Ví dụ:

```text
site_name
site_logo
favicon
hero_title
hero_subtitle
hero_image
marquee_text
contact_phone
contact_email
facebook_url
zalo_url
instagram_url
shipping_note
payment_note
site_status
maintenance_message
```

## 16.3. Content visibility

Mỗi block nên có:

```text
enabled
sort_order
start_at (optional)
end_at (optional)
```

Cho phép BTC lên lịch banner/section.

---

# 18. SPONSORS / PARTNERS

Sponsor phải là dữ liệu có thể quản lý.

Ví dụ:

```text
name
logo
tier
website
description
display_order
active
```

Có thể có:

```text
NHÀ TÀI TRỢ VÀNG
NHÀ TÀI TRỢ CẦU
NHÀ TÀI TRỢ ĐỒNG
ĐỐI TÁC
```

### Rule

- Không có sponsor → ẩn section.
- Có sponsor → tự động render theo tier/order.
- Logo phải có alt text.
- Nếu có website → logo/card có thể click.
- Không để logo hỏng tạo khoảng trống lớn.

Pattern này phù hợp với cách website Thể thao Mầm Mơ hiện tại tổ chức sponsor/partner theo nhóm.

---

# 19. MEDIA LIBRARY

Không lưu binary image trực tiếp trong PostgreSQL.

Nên có Media Library:

```text
media_id
file_name
url
alt_text
mime_type
width
height
size
folder/tag
created_at
```

## Upload requirements

- Upload từ admin.
- Compress/resize hợp lý.
- Ưu tiên WebP/AVIF nếu pipeline hỗ trợ.
- Giữ bản gốc khi cần.
- Generate responsive sizes khi cần.
- Không cho upload file nguy hiểm.
- Validate MIME/type/size.
- Tạo alt text bắt buộc hoặc nhắc admin nhập.

---

# 20. NOTIFICATION

## 19.1. Customer

Sau khi tạo đơn thành công:

- Hiển thị success page ngay.
- Trả order code.
- Có thể gửi email confirmation nếu email có và provider được cấu hình.

## 19.2. BTC

Khi có đơn mới:

- Gửi notification tới kênh nội bộ nếu được cấu hình.
- Có thể dùng Telegram Bot / Discord webhook / email.
- Notification phải chứa thông tin tối thiểu:
  - mã đơn,
  - tên khách,
  - giá trị,
  - nguồn đơn,
  - thời điểm.

Không đưa dữ liệu nhạy cảm không cần thiết vào notification group.

---

# 21. GOOGLE SHEETS / EXPORT

Google Sheets là **kênh vận hành phụ**, không phải database chính nếu Supabase đã là source of truth.

Ưu tiên:

1. CSV export luôn phải có.
2. Google Sheets sync là module tích hợp bổ sung.
3. Không cho Sheets trở thành nguồn dữ liệu cạnh tranh với DB.

Có thể hỗ trợ:

```text
Orders
Customers
Products
Inventory
Sales
```

Tài liệu/export phải nói rõ:

```text
SOURCE OF TRUTH = DATABASE
SHEET = REPORT / OPERATIONS COPY
```

---

# 22. SECURITY

## 21.1. Authentication

Dùng auth provider phù hợp.

Roles mặc định:

```text
admin
btc_sale
delivery_staff
```

Có thể mở rộng sau.

## 21.2. Authorization

Không chỉ hide button ở frontend.

Backend phải kiểm tra:

```text
user authenticated?
user role?
resource ownership/permission?
operation allowed?
```

## 21.3. Database security

Nếu dùng Supabase:

- RLS cho bảng cần bảo vệ.
- Public API chỉ được truy cập dữ liệu thật sự public.
- Admin/member data không được public.
- Customer PII không được expose rộng.

## 21.4. Anti-spam

Các public API như:

```text
create order
track order
voucher validate
contact form
newsletter
```

phải có:

- rate limiting,
- validation,
- anti-bot khi cần,
- abuse protection.

Cloudflare Turnstile có thể được dùng ở các điểm có nguy cơ bot cao.

## 21.5. Input security

- Validate bằng schema.
- Sanitize output/rendering.
- Không render raw HTML từ admin nếu không thực sự cần.
- Escape dynamic content.
- Validate URL.
- Validate upload.

---

# 23. DATA MODEL — BASELINE

> Schema bên dưới là baseline để Agent xây dựng. Có thể bổ sung field/bảng kỹ thuật cần thiết nhưng không được làm mất các capability cốt lõi.

## Members

```text
member_id
full_name
phone
email
role
status
created_at
updated_at
```

Nếu dùng Supabase Auth, không tự lưu password hash.

## Customers

```text
customer_id
full_name
phone
email
default_address
created_at
updated_at
```

## Product_Categories

```text
category_id
name
slug
description nullable
image_url nullable
status
sort_order
created_at
updated_at
```

## Products

```text
product_id
category_id nullable
name
slug
short_description
description
price
compare_at_price nullable
cost_price nullable
status
featured
sort_order
weight_gram nullable
created_at
updated_at
```

## Product_Variants

Dùng khi sản phẩm có phân loại như size/màu. Nếu không có variant, có thể tạo một SKU mặc định.

```text
variant_id
product_id
sku
name
price nullable
compare_at_price nullable
cost_price nullable
stock
weight_gram nullable
status
created_at
updated_at
```

## Product_Media

```text
media_id
product_id
variant_id nullable
media_type
url
sort_order
alt_text
created_at
```

## Combos

```text
combo_id
name
slug
price
image_url
description
status
featured
sort_order
created_at
updated_at
```

## Combo_Items

```text
combo_item_id
combo_id
product_id
quantity
```

## Vouchers

```text
voucher_id
code
discount_type
discount_value
min_order_value
usage_limit
times_used
start_date
end_date
status
```

## Orders

```text
order_id
order_code
customer_id
seller_id nullable
source_type
introducer_info nullable
receiver_name
receiver_phone
delivery_type
shipping_address_snapshot nullable
pickup_point_id nullable
pickup_point_snapshot nullable
subtotal
shipping_fee
voucher_discount
final_amount
order_status
payment_status
delivery_status
created_by_member_id nullable
assigned_shipper_id nullable
cancel_reason nullable
customer_note nullable
internal_note nullable
created_at
confirmed_at nullable
completed_at nullable
cancelled_at nullable
updated_at
```

## Order_Items

Nên dùng snapshot để đảm bảo lịch sử.

```text
order_item_id
order_id
product_id nullable
variant_id nullable
combo_id nullable
item_name_snapshot
variant_name_snapshot nullable
sku_snapshot nullable
quantity
unit_price
unit_cost_snapshot nullable
item_discount
subtotal
profit nullable
created_at
```

## Payments

```text
payment_id
order_id
payment_method
amount
payment_status
transaction_code
confirmed_by
created_at
updated_at
```

## Shipments

```text
shipment_id
order_id
carrier_name nullable
shipping_method
tracking_code nullable
shipping_fee
cod_amount nullable
package_weight_gram nullable
status
assigned_shipper_id nullable
pickup_at nullable
shipped_at nullable
out_for_delivery_at nullable
delivered_at nullable
failed_reason nullable
return_received_at nullable
created_at
updated_at
```

## Delivery_Zones

```text
zone_id
name
coverage_rule
base_fee
free_shipping_threshold nullable
status
created_at
updated_at
```

## Pickup_Points

```text
pickup_point_id
name
address
contact_name nullable
contact_phone nullable
opening_hours nullable
status
created_at
updated_at
```

## Order_Status_History

```text
status_history_id
order_id
status_type
from_status nullable
to_status
note nullable
changed_by_member_id nullable
created_at
```

## Workshops

```text
workshop_id
title
description
start_time
end_time
location
capacity
price
status
```

## Workshop_Registrations

```text
registration_id
workshop_id
registrant_member_id
customer_id
attendee_name
attendee_phone
check_in_status
created_at
```

## System_Configs

```text
config_key
config_value
updated_at
updated_by
```

## Sponsors

Khuyến nghị tách bảng riêng thay vì nhét toàn bộ vào JSON config.

```text
sponsor_id
name
logo_url
tier
website_url
description
display_order
active
```

## Media

```text
media_id
file_name
url
alt_text
mime_type
width
height
size
created_at
```

## Audit_Logs

```text
log_id
actor_member_id
action
entity_type
entity_id
before_data
after_data
created_at
```

---

# 24. DATA INTEGRITY RULES

Đây là các rule bắt buộc.

## 23.1. Money

- Dùng decimal/numeric cho tiền.
- Không dùng floating point cho tiền.
- Không để client quyết định final amount.
- Server tính lại:
  - subtotal,
  - discount,
  - shipping,
  - final amount.

## 23.2. Stock

Không bao giờ để:

```text
stock < 0
```

## 23.3. Order snapshot

Order lịch sử không được thay đổi chỉ vì product hiện tại đổi giá/tên.

## 23.4. Idempotency

Các action dễ bị click nhiều lần phải idempotent hoặc có guard:

- create order,
- confirm payment,
- cancel order,
- restock,
- notification.

## 23.5. Transaction

Các operation nhiều bước liên quan tới:

- order + stock,
- combo + stock,
- voucher usage,
- payment confirmation

phải xử lý atomic khi cần.

---

# 25. SEO

Public website phải có:

- Semantic HTML.
- Page title.
- Meta description.
- Open Graph.
- Favicon.
- Canonical URL khi cần.
- Sitemap.
- robots.txt.
- Friendly slug.
- Structured data phù hợp nếu có thể.

Product page phải có metadata riêng.

Không index admin.

---

# 26. PERFORMANCE

Ưu tiên:

- Mobile-first.
- Lazy load image không nằm above-the-fold.
- Responsive image sizes.
- Không tải thư viện animation nặng nếu CSS đủ.
- Không query DB lặp vô ích.
- Pagination admin.
- Debounce search.
- Cache dữ liệu public phù hợp.
- Không bundle admin code vào public page nếu framework hỗ trợ splitting.

---

# 27. ACCESSIBILITY

Tối thiểu:

- Contrast đủ đọc.
- Focus state.
- Keyboard navigation cơ bản.
- Label form rõ.
- Error message dễ hiểu.
- Alt text.
- Không chỉ dùng màu để biểu thị status.
- Button/link có text hoặc accessible label.
- Modal có focus management hợp lý.

---

# 28. RESPONSIVE

Thiết kế theo thứ tự:

```text
mobile
→ tablet
→ desktop
```

Không lấy desktop thu nhỏ xuống làm mobile.

### Mobile must-have

- Sticky cart/checkout CTA khi hợp lý.
- Card thay table trong admin.
- Input/button đủ lớn.
- Không có horizontal overflow ngoài chủ đích.
- Bottom sheet cho filter/action.
- Header gọn.

### Desktop

- Max-width rõ.
- Grid sản phẩm.
- Dashboard multi-column.
- Tables khi phù hợp.

---

# 29. STATES — KHÔNG ĐƯỢC BỎ QUA

Mỗi feature phải có:

## Loading

Ví dụ:

```text
Đang tải sản phẩm...
Đang tạo đơn...
Đang xác nhận thanh toán...
```

## Empty

Ví dụ:

```text
Chưa có đơn hàng nào.
```

## Error

Ví dụ:

```text
Không thể tải dữ liệu. Vui lòng thử lại.
```

Không show stack trace cho user.

## Success

Ví dụ:

```text
Đơn GM-001 đã được tạo thành công.
```

## Offline / network failure

Nếu operation thất bại vì network, không làm user tưởng là đơn đã tạo.

---

# 30. ERROR HANDLING

Mỗi error phải phân loại:

```text
Validation error
Authentication error
Authorization error
Business-rule error
Network error
Provider error
Unexpected server error
```

User-facing message phải dễ hiểu.

Log nội bộ phải có đủ context nhưng không log secret/password/payment-sensitive data.

---

# 31. ADMIN AUDIT LOG

Các action quan trọng phải được log:

```text
create product
update product price
adjust stock
create order
change order status
confirm payment
cancel order
refund
edit voucher
change member role
change site config
delete/disable content
```

Audit log phải trả lời:

```text
Ai?
Lúc nào?
Làm gì?
Trên object nào?
Trước ra sao?
Sau ra sao?
```

---

# 32. CONTENT + DESIGN SYSTEM

## 31.1. Tạo design tokens

Không rải màu, spacing, radius tùy hứng trong từng component.

Tạo token:

```text
brand
brand-soft
text
muted
background
surface
border
success
warning
danger
```

## 31.2. Component system

Nên có:

```text
Button
Input
Select
Textarea
Modal
Drawer
Badge
Card
Table
EmptyState
LoadingState
Toast
ConfirmDialog
ImageUploader
MoneyDisplay
StatusBadge
```

## 31.3. Animation

Animation:

- nhanh,
- nhẹ,
- có mục đích,
- không làm chậm interaction.

Ưu tiên CSS/Framer Motion nhẹ nếu thực sự cần.

Không dùng animation để che UX tệ.

---

# 33. MARKETING UI

## Marquee

Có thể dùng CSS animation để tạo thanh thông báo chạy ngang.

Không phụ thuộc `<marquee>` deprecated nếu không cần.

Có cấu hình:

```text
enabled
text
link
background/theme
speed
```

## Floating banner

Có thể đặt banner/card floating:

```text
position: fixed
```

Nhưng:

- Có nút đóng rõ.
- Không che CTA quan trọng.
- Responsive.
- Không mở lại liên tục trong một session.
- Có thể dùng localStorage khi phù hợp.

## Popup

Không lạm dụng.

Không hiển thị popup ngay lập tức nếu popup phá vỡ trải nghiệm mua hàng.

---

# 34. TRUST / IMPACT CONTENT

Website bán hàng của Mầm Mơ cần giải thích:

- Gieo Mơ là gì?
- Hoạt động gây quỹ thế nào?
- Khoản đóng góp hỗ trợ điều gì?
- Hình ảnh/hoạt động thực tế.
- Sponsor/partner.
- Thông tin liên hệ.

Không dùng claim gây quỹ cụ thể nếu chưa có dữ liệu/chứng cứ.

Nếu hiển thị số liệu impact:

```text
“Đã gây quỹ X”
“Đã hỗ trợ Y”
```

phải lấy từ dữ liệu/config có nguồn nội bộ rõ ràng, không tự bịa.

---

# 35. CHECKOUT + PAYMENT UX

### Trước submit

Hiển thị:

```text
Tạm tính
Phí giao hàng
Voucher
Tổng cộng
```

### Sau submit

Không reset form một cách khiến khách mất thông tin nếu request thất bại.

### Sau thành công

Hiển thị:

```text
🎉 Đặt hàng thành công

Mã đơn: GM-001
Tổng tiền: xxx.xxxđ

[ Tra cứu đơn ]
[ Về trang chủ ]
```

Nếu thanh toán banking:

- hiển thị hướng dẫn rõ,
- thông tin nhận tiền phải lấy từ cấu hình an toàn,
- có transaction/reference nếu cần,
- nói rõ trạng thái "đang chờ BTC xác nhận" nếu chưa có webhook.

---

# 36. DELIVERY / SHIPPING MANAGEMENT

Đây là một module riêng, không gộp đơn giản vào `Orders`. Mục tiêu là để BTC biết **đơn nào đang ở đâu, ai đang giữ hàng, đang giao bằng cách nào, phí bao nhiêu và có vấn đề gì**.

## 35.1. Phương thức nhận hàng

Mặc định:

```text
home_delivery
pickup_point
```

Có thể có `self_pickup`/`agency_pickup` tùy vận hành thực tế.

## 35.2. Shipping method

MVP có thể là:

```text
BTC delivery
partner delivery
carrier
pickup
```

Không bắt buộc tích hợp API hãng vận chuyển ngay từ đầu. Hệ thống phải cho phép cập nhật vận đơn thủ công trước.

## 35.3. Thông tin vận chuyển

Một shipment tối thiểu nên có:

```text
shipment_id
order_id
carrier_name nullable
shipping_method
tracking_code nullable
shipping_fee
cod_amount nullable
package_weight_gram nullable
status
assigned_shipper_id nullable
pickup_at nullable
shipped_at nullable
delivered_at nullable
failed_reason nullable
return_received_at nullable
created_at
updated_at
```

## 35.4. Phí vận chuyển

Hỗ trợ ít nhất một trong các cơ chế:

```text
free shipping
flat fee
free shipping above threshold
fee by delivery zone
manual fee
```

Không để frontend tự quyết định `shipping_fee`. Server phải tính lại dựa trên cấu hình hiện tại.

Nếu sản phẩm có khối lượng đóng gói, lưu **weight sau đóng gói** để phục vụ việc ước tính phí. Shopee cũng có pattern khai báo khối lượng phục vụ vận chuyển và hiển thị phí/thời gian giao theo phương thức vận chuyển; Gieo Mơ chỉ cần mức đơn giản hơn.

## 35.5. Admin Shipping Board

BTC nên có các nhóm:

```text
Chờ chuẩn bị
Đang đóng gói
Sẵn sàng giao
Đang giao
Giao thành công
Giao không thành công
Hoàn hàng
```

Mỗi card đơn cần hiển thị nhanh:

- Mã đơn.
- Tên người nhận.
- Số điện thoại.
- Khu vực.
- Sản phẩm/số lượng.
- COD hoặc tình trạng thanh toán.
- Phương thức giao.
- Shipper.
- Mã vận đơn.
- Deadline nội bộ nếu BTC đặt.

Shopee cũng tổ chức vận hành theo các bước chuẩn bị hàng, đóng gói, giao hàng và xử lý giao không thành công; đây là pattern vận hành nên tham khảo, nhưng Gieo Mơ chỉ giữ phần cần thiết.

## 35.6. Tracking

Khách có thể xem:

```text
Đơn hàng
└── Timeline trạng thái
    ├── thời gian
    ├── trạng thái
    └── ghi chú (nếu có)
```

Nếu có `tracking_code`, hiển thị nút “Tra cứu vận đơn” dẫn tới trang của đơn vị vận chuyển khi URL provider được cấu hình. Không scrape website hãng vận chuyển nếu không cần.

## 35.7. Giao thất bại / hoàn hàng

MVP không cần workflow return phức tạp như sàn lớn, nhưng phải có khả năng ghi nhận:

```text
failed_delivery
returning
returned_to_stock
```

Khi hàng hoàn về, BTC phải có thao tác **nhập lại kho đúng một lần** và audit log.

## 35.8. Pickup point

Nếu dùng điểm nhận:

```text
pickup_point_id
name
address
contact_name
contact_phone
opening_hours
status
```

Checkout chỉ hiển thị điểm nhận đang hoạt động.

# 37. ADMIN REPORTING

Tối thiểu:

## Revenue

```text
gross sales
discount
shipping
net collected
```

## Orders

```text
orders/day
orders/status
average order value
```

## Products

```text
units sold
stock
best sellers
```

## Sales members

```text
orders/member
revenue/member
```

## Profit

Nếu có `cost_price` và snapshot đầy đủ:

```text
revenue - cost - discounts - relevant expenses
```

Không gọi một con số là "profit" nếu chưa đủ dữ liệu chi phí.

---

# 38. REPORT EXPORT

Có thể export:

```text
CSV
XLSX (nếu cần)
Google Sheets
```

CSV là baseline.

Export phải:

- tôn trọng permission,
- không export dữ liệu vượt quyền,
- có filter hiện tại,
- tên file có timestamp.

---

# 39. DEPLOYMENT

## Production checklist

Trước deploy:

```text
[ ] Build pass
[ ] Lint/type check pass
[ ] Env vars configured
[ ] Database migrations applied
[ ] RLS/auth checked
[ ] Storage checked
[ ] Public routes checked
[ ] Admin routes checked
[ ] Mobile checked
[ ] Checkout checked
[ ] Order creation checked
[ ] Payment flow checked
[ ] Tracking checked
[ ] Error states checked
[ ] Metadata/SEO checked
```

## Domain

Khi có custom domain:

- cấu hình DNS đúng.
- HTTPS hoạt động.
- canonical URL đúng.
- redirect www/non-www nhất quán.
- không để preview domain được index nếu không chủ đích.

---

# 40. ENVIRONMENT VARIABLES

Không commit `.env`.

Ví dụ:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY

SUPABASE_SERVICE_ROLE_KEY

RESEND_API_KEY

TELEGRAM_BOT_TOKEN
TELEGRAM_CHAT_ID

TURNSTILE_SITE_KEY
TURNSTILE_SECRET_KEY
```

Chỉ thêm biến thực sự sử dụng.

Không expose secret server-only variable với prefix public.

---

# 41. GIT / CODE QUALITY

Agent phải giữ repository sạch:

```text
feature branches nếu workflow yêu cầu
meaningful commits
no secrets
no debug console spam
no dead files
no duplicated business logic
```

Không tạo file "test-final-final-2.ts".

---

# 42. TEST STRATEGY

Mỗi feature quan trọng cần ít nhất:

## Unit / logic

- price calculation,
- discount,
- voucher rule,
- stock calculation,
- combo decomposition,
- status transition.

## Integration

- create order,
- confirm order,
- stock update,
- payment update,
- referral tracking.

## E2E

Luồng quan trọng nhất:

```text
Browse product
→ Add to cart
→ Checkout
→ Create order
→ Success
→ Track order
```

Admin:

```text
Login
→ Create/update product
→ Create order
→ Confirm
→ Check stock
→ Check payment
→ Assign delivery
→ Complete
```

---

# 43. ACCEPTANCE CRITERIA TOÀN HỆ THỐNG

Website chỉ được xem là hoàn thiện khi:

### Customer

- Có thể vào website bằng mobile.
- Xem sản phẩm.
- Xem chi tiết.
- Thêm giỏ.
- Checkout.
- Tạo order.
- Nhận order code.
- Tra cứu order.
- Không thể tự giả mạo giá/discount/seller từ client.

### Admin

- Login.
- Có dashboard.
- Quản lý product.
- Quản lý combo.
- Kiểm kho.
- Quản lý order.
- Nhập order hộ.
- Xác nhận payment.
- Assign delivery.
- Quản lý member.
- Theo dõi sale.
- Quản lý voucher.
- Chỉnh content.
- Chỉnh sponsor.
- Upload media.
- Export report.
- Xem audit log.

### Technical

- Responsive.
- Không lộ secrets.
- Có authorization backend.
- Không stock âm.
- Không double order.
- Không sai giá lịch sử.
- Có error/loading/empty state.
- Build/deploy thành công.
- Có backup/migration strategy cho production data.

---

# 44. WORKFLOW MÀ AGENT PHẢI TUÂN THEO

Đây là workflow mặc định cho **mọi task** liên quan tới project.

## Bước 1 — Audit trước khi sửa

Kiểm tra:

```text
repository structure
package manager
framework
routes
components
database
env
auth
existing APIs
existing migrations
deployment config
```

## Bước 2 — Tìm feature liên quan

Không bắt đầu code ngay.

Xác định:

```text
page
component
server/API
database table
business logic
tests
```

## Bước 3 — Kiểm tra impact

Tự hỏi:

```text
Thay đổi này có ảnh hưởng customer?
admin?
database?
stock?
payment?
SEO?
mobile?
security?
existing data?
```

## Bước 4 — Implement

Ưu tiên:

```text
small change
reusable component
centralized logic
typed data
validated input
server-side business logic
```

## Bước 5 — Verify

Tối thiểu:

```text
typecheck
lint
build
targeted tests
manual flow review
```

## Bước 6 — Self-review

Tự kiểm:

```text
Có bug obvious?
Có race condition?
Có security issue?
Có mobile issue?
Có empty state?
Có error state?
Có permission leak?
Có hard-code không cần thiết?
```

## Bước 7 — Báo cáo

Khi hoàn thành task, output nên ngắn gọn:

```text
Đã làm:
- ...

Thay đổi chính:
- ...

Đã kiểm tra:
- ...

Lưu ý:
- ...
```

Không kể lại toàn bộ nội bộ code nếu không cần.

---

# 45. QUY TẮC KHI TÀI LIỆU VÀ CODE MÂU THUẪN

Ưu tiên theo thứ tự:

```text
1. Production safety / data integrity
2. Explicit user requirement mới nhất
3. Business rule trong tài liệu này
4. Existing working behavior
5. UI preference
6. Convenience
```

Nếu thay đổi business rule:

- cập nhật source code,
- cập nhật schema/docs nếu cần,
- cập nhật test.

Không âm thầm duy trì hai rule khác nhau.

---

# 46. NHỮNG THỨ AGENT KHÔNG ĐƯỢC LÀM

- Không hard-code dữ liệu động vào 10 nơi khác nhau.
- Không để public client gọi service-role database.
- Không tin amount từ frontend.
- Không tin seller/ref từ frontend.
- Không expose customer PII chỉ bằng phone.
- Không cho stock âm.
- Không update stock nhiều lần do retry.
- Không xoá lịch sử order.
- Không overwrite order history theo product hiện tại.
- Không tạo popup làm khách không thể mua.
- Không làm desktop-only.
- Không dùng table khổng lồ trên mobile.
- Không thêm dependency lớn cho một hiệu ứng nhỏ.
- Không commit `.env`.
- Không tự bịa dữ liệu impact/sponsor/customer.
- Không rewrite toàn bộ project nếu incremental change giải quyết được vấn đề.
- Không coi database là toàn bộ sản phẩm.

---

# 47. PHÂN CHIA MODULE ĐỂ AGENT QUẢN LÝ

```text
/core
  auth
  permissions
  validation
  money
  orders
  inventory
  vouchers

/modules/catalog
  products
  combos
  media

/modules/commerce
  cart
  checkout
  payments
  delivery

/modules/customer
  customer-profile
  order-tracking

/modules/sales
  members
  referral
  reports

/modules/content
  cms
  sponsors
  faq
  gallery

/modules/workshops
  workshops
  registrations

/modules/admin
  dashboard
  orders
  reports
  audit

/integrations
  email
  telegram
  sheets
  storage
```

Tên folder có thể thay đổi theo framework hiện tại; **nguyên tắc tách domain** cần được giữ.

---

# 48. SITEMAP / SEO COPY GUIDELINE

Public page phải có title/description rõ ràng.

Ví dụ:

```text
Gieo Mơ — Mỗi món hàng, một điều tốt đẹp
```

Không cần bê nguyên câu này; Agent được phép viết copy phù hợp với campaign hiện tại.

Giọng điệu:

- gần gũi,
- chân thành,
- tích cực,
- có tính cộng đồng,
- không lên gân.

CTA:

```text
Khám phá sản phẩm
Mua để gieo một điều đẹp
Xem combo
Tra cứu đơn
```

---

# 49. MIGRATION / DATA SEED

Khi tạo project:

## Seed tối thiểu

- 1 admin test.
- Một số product mẫu.
- Một combo mẫu.
- Một voucher mẫu.
- Một sponsor mẫu.
- Một content config mẫu.

Không seed dữ liệu giả lên production nếu không được đánh dấu.

---

# 50. BACKUP / RECOVERY

Database production phải có chiến lược backup phù hợp với dịch vụ đang dùng.

Agent cần nghĩ tới:

```text
backup
restore
migration
rollback
```

Migration phải có version.

Không sửa schema production bằng thao tác tay không kiểm soát.

---

# 51. OBSERVABILITY

Tối thiểu nên có cách phát hiện:

- API error.
- failed order.
- payment failure.
- storage upload failure.
- auth issue.

Có thể bắt đầu bằng server logs + notification nội bộ.

Không log:

```text
password
secret
full payment credentials
sensitive personal information không cần thiết
```

---

# 52. ZERO-COST FALLBACK STRATEGY

Nếu một provider không hoạt động:

```text
Primary DB: Supabase
Fallback reporting: CSV / Google Sheets
Primary email: provider email free tier
Fallback email: SMTP phù hợp
Primary notification: Telegram
Fallback notification: Discord
Primary storage: Supabase Storage
Fallback image hosting: provider phù hợp
```

Không hard-code một provider vào toàn bộ business logic.

Tạo adapter/interface khi integration có khả năng thay đổi.

---

# 53. PHASED DELIVERY

Không cố build tất cả cùng lúc.

## Phase 1 — Core commerce

```text
Homepage
Products
Product detail
Cart
Checkout
Order
Admin login
Admin dashboard
Products
Orders
Inventory
Customer tracking
```

## Phase 2 — Operations

```text
Members
Referral
Payment confirmation
Delivery assignment
Voucher
Reports
Audit logs
```

## Phase 3 — CMS & Marketing

```text
CMS
Sponsors
Gallery
Marquee
Floating promo
Media library
SEO controls
```

## Phase 4 — Integrations

```text
Email
Telegram
Google Sheets
Turnstile
```

## Phase 5 — Extension

```text
Workshop
QR check-in
Advanced analytics
```

Nếu task hiện tại chỉ cần Phase 1, không tự kéo thêm Phase 4/5 chỉ để "cho đủ".

---

# 54. DEFINITION OF DONE CHO MỖI FEATURE

Một feature chỉ được coi là Done khi:

```text
[ ] UI hoàn chỉnh
[ ] Mobile responsive
[ ] Data model phù hợp
[ ] Validation
[ ] Authorization
[ ] Loading
[ ] Empty
[ ] Error
[ ] Success
[ ] Logging nếu cần
[ ] Test
[ ] No console errors
[ ] No secret leak
[ ] Build pass
```

Với feature liên quan tiền/kho:

```text
[ ] Server-side calculation
[ ] Atomicity
[ ] Idempotency
[ ] Auditability
```

---

# 55. TINH THẦN THIẾT KẾ

Gieo Mơ không nên nhìn như:

> "Một trang CRUD bán sản phẩm."

Mà nên nhìn như:

> **Một storefront có câu chuyện + một công cụ vận hành gây quỹ cho BTC.**

Customer side phải tạo cảm giác:

```text
Nhìn thấy
→ Hiểu
→ Tin
→ Muốn mua
→ Mua dễ
→ Biết đơn đang ở đâu
```

BTC side phải tạo cảm giác:

```text
Đăng nhập
→ Nhìn thấy tình hình
→ Xử lý việc cần làm
→ Không sợ sai dữ liệu
→ Không cần Excel thủ công cho mọi thứ
```

---

# 56. CHECKLIST CUỐI — AGENT TỰ ĐỌC TRƯỚC KHI NÓI "HOÀN THÀNH"

```text
[ ] Tôi đã audit codebase trước khi sửa.
[ ] Tôi đã hiểu public site và admin site.
[ ] Tôi đã không coi database là toàn bộ sản phẩm.
[ ] Customer flow hoạt động end-to-end.
[ ] Admin flow hoạt động end-to-end.
[ ] Giá/discount/payment được tính và xác nhận server-side.
[ ] Inventory không âm và không double-update.
[ ] Referral không thể bị giả mạo đơn giản từ client.
[ ] Customer lookup không làm lộ dữ liệu.
[ ] Mobile UX đã được kiểm tra.
[ ] Empty/loading/error/success states đã có.
[ ] CMS/content không cần sửa code cho các nội dung thường xuyên thay đổi.
[ ] Sponsor/media có thể quản lý.
[ ] Secrets không nằm ở frontend/repo.
[ ] Authorization được enforce ở backend.
[ ] Audit log tồn tại cho thao tác nhạy cảm.
[ ] Build/typecheck/lint/test đã chạy.
[ ] Không có dữ liệu giả bị đưa nhầm lên production.
[ ] Deployment configuration đã được kiểm tra.
```

---

# 57. FINAL DIRECTIVE

**Từ thời điểm Agent đọc tài liệu này, hãy coi nó là source of truth về cách xây dựng và vận hành website Gieo Mơ, trừ khi yêu cầu mới của người dùng thay đổi trực tiếp một business rule.**

Mỗi khi được giao task:

```text
UNDERSTAND
→ AUDIT
→ DESIGN
→ IMPLEMENT
→ VERIFY
→ SELF-REVIEW
→ REPORT
```

Không chỉ sửa phần người dùng nhìn thấy.

Luôn kiểm tra đồng thời:

```text
UI
↔ Business Logic
↔ Database
↔ Security
↔ Operations
↔ Analytics
↔ Deployment
```

**Mục tiêu cuối cùng không phải là "code chạy".**

Mục tiêu là:

> **Một website Gieo Mơ mà khách hàng mua được, BTC vận hành được, dữ liệu không sai, giao diện không làm khó người dùng, và hệ thống đủ gọn để sinh viên có thể tiếp tục quản lý sau này.**
