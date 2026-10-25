# H29 — Duplicate Order Review List (20 cặp ứng viên, masked)

Trạng thái hồ sơ: **DUPLICATE REVIEW LIST — COMPLETE** (20/20 ứng viên đủ ngưỡng yêu cầu 17–20).
Không chứa PII: không tên/email; SĐT chỉ dạng mask 2-số-đầu+3-số-cuối; không có giá trị tài khoản cá nhân.
Nguồn: mirror forensics `55442` (snapshot backup 2026-10-22T08:01). Script: `.tmp/recon-20261022/h29-extract2.mjs` + `h29-pairs-table.mjs`.

## 1. Phương pháp phát hiện (chỉ báo kỹ thuật, không phải kết luận thực)

Ba tiêu chí window-based (chạy trên toàn bộ 73 đơn):
- **A** — cùng customer + cùng final_amount + cùng payment_method, gap ≤ 30s;
- **B** — cùng receiver_phone + cùng final_amount, gap ≤ 60s;
- **C** — cùng customer + cùng final_amount + cùng subtotal, gap ≤ 60s.

Kết quả thô: 57 marker row → **20 cặp unique (un-directed)**. Không có `order_code` trùng và không có `idempotency_key` trùng (legacy path không có chống lặp).

**Mức độ tin cậy tự đánh giá:** A+B+C đồng thời + gap ≤ 10s = CAO (gần chắc chắn thao tác retry/double-click); thiếu A hoặc gap > 30s = TRUNG BÌNH (cần sao kê). 0 cặp có idempotency key — không thể khẳng định "click-retry có key" (xác minh theo sao kê).

## 2. Bảng 20 cặp (đại diện trung thực — masked)

| Cặp | Ref 1 | Ref 2 | Thời điểm | Gap | Criteria | Tiền (đ) | Item snapshot | Trạng thái 1 | Trạng thái 2 | Phone chung | Chain |
|---|---|---|---|---|---|---|---|---|---|---|---|
| DP-01 | -5***76556 | -5***01149 | 10-12 20:24:16 vs 20:24:20 | 4s | A+B+C | 129.000 | TRAO MƠx1 | completed/paid | pending/pending | 09**492 | — |
| DP-02 | -6***45168 | -2***91033 | 10-17 13:37 | 7s | A+B+C | 85.000 | Túi GIEO MƠx1 | pending/pending | pending/pending | 09**605 | — |
| DP-03 | -8***97921 | -4***44333 | 10-17 13:43 | 4s | A+B+C | 85.000 | Túi GIEO MƠx1 | pending/pending | pending/pending | 09**605 | — |
| DP-04 | -6***86835 | -1***47332 | 10-15 11:53 | 6s | A+B+C | 18.000 | 2 Đôi Vớ GIEO MƠx1 | completed/paid | pending/paid | 08**066 | — |
| DP-05 | -7***88286 | -2***29263 | 10-14 21:54 | 5s | A+B+C | 95.000 | ƯƠM MẦM móc khóa x1 | pending/pending | pending/paid | 03**479 | — |
| DP-06 | -8***27960 | -2***33418 | 10-12 21:16 | 3s | A+B+C | 90.000 | GIEO HẠT kẹp + móc khóa | processing/pending | pending/pending | 09**134 | — |
| DP-07 | -2***31455 | -8***89835 | 10-15 20:01 | 7s | A+B+C | 18.000 | 2 Đôi Vớ GIEO MƠx1 | pending/paid | pending/paid | 08**720 | — |
| DP-08 | -8***25068 | -4***87068 | 10-11 01:42 | 3s | A+B+C | 129.000 | Set quà GIEO MƠx1 | pending/paid | pending/pending | 09**671 | — |
| DP-09 | -4***83933 | -2***03047 | 10-20 13:06 | 6s | A+B+C | 95.000 | ƯƠM MẦM kẹp x1 | pending/pending | pending/pending | 03**324 | — |
| DP-10 | -9***54542 | -7***35473 | 10-20 13:08 | 4s | A+B+C | 95.000 | ƯƠM MẦM kẹp x1 | pending/pending | pending/pending | 03**324 | — |
| DP-11 | -9***93325 | -8***64144 | 10-12 23:07 | 4s | A+B+C | 95.000 | ƯƠM MẦM kẹp x1 | pending/pending | pending/paid | 07**817 | — |
| DP-12 | -3***40825 | -6***93681 | 10-14 21:17 | 5s | A+B+C | 190.000 | ƯƠM MẦM móc khóa x2 | pending/paid | pending/pending | 09**117 | — |
| DP-13 | -8***22729 | -3***06958 | 10-13 13:15 | 7s | A+B+C | 85.000 | Túi GIEO MƠx1 | pending/pending | completed/paid | 03**980 | — |
| DP-14 | -5***52022 | -9***31488 | 10-14 22:22 | 5s | A+B+C | 95.000 | ƯƠM MẦM móc khóa x1 | pending/paid | pending/pending | 09**629 | — |
| DP-15 | -3***70892 | -5***97889 | 10-14 01:52 | 8s | A+B+C | 100.000 | Túi GIEO MƠx1 | pending/pending | pending/paid | 09**377 | — |
| DP-16 | -8***16675 | -4***52067 | 10-16 22:44 | 6s | A+B+C | 129.000 | TRAO MƠx1 | pending/paid | pending/pending | 09**600 | — |
| DP-17 | -8***40575 | -4***75130 | 10-15 20:15 | 7s | A+B+C | 85.000 | Túi GIEO MƠx1 | pending/pending | pending/paid | 08**676 | — |
| DP-18 | -5***10226 | -6***10880 | 10-08 01:22 | 35s | B+C | 1.111 | ABCx1 | pending/pending | pending/pending | 09**567 | -6***10880 |
| DP-19 | -9***63366 | -6***10880 | 10-08 01:23 | 34s | B+C | 1.111 | ABCx1 | pending/pending | pending/pending | 09**567 | -6***10880 |
| DP-20 | -3***14369 | -9***41465 | 10-14 22:01 | 44s | B+C | 18.000 | 2 Đôi Vớ GIEO MƠx1 | pending/pending | pending/pending | 09**832 | — |

Chain note: DP-18/DP-19 chia sẻ node `-6***10880` — đó là NHIỀU đơn pending 1.111đ cả cùng SĐT trong 01:22–01:23 ((gần như chắc chắn là thử nghiệm/test-ticket 1.111 giống PAID-01/04/05).

## 3. Chứng cứ pro / contra + tỷ trọng tin cậy + impact nếu merge sai

| Cường độ | Chứng cứ CHO (pro) | Chứng cứ CHỐNG (contra) | Đề xuất |
|---|---|---|---|
| CAO (16 cặp A+B+C, gap ≤8s, cùng item snapshot, cùng phone) | gap 3–8s; cùng khách + cùng tiền + cùng subtotal + cùng method; cùng item snapshot; gần như-một hành động đặt hàng (click-retry không có protection) | Không có lần nào hệ thống ghi key idempotency; không có linkage khách-đơn xác thực mức "chắc chắn" 100% | **allow-merge (chỉ khi owner duyệt qtó mục III)** — merge phải cho phê duyệt + sao kê bảo vệ: đơn PENDING trong cặp (money chuẩn về 1 đơn) |
| TRUNG CAO (cặp đều PAID: DP-04, DP-07 — cả hai = paid) | Gap ≤7s, mọi signal khớp | Nếu sao kê có 2 khoản chuyển riêng cho cặp → cả hai đơn đã nhận tiền thật — xóa 1 đơn sẽ làm lệch sổ tiền | **không merge ngay** — cần sao kê quyết định 1/2 giao dịch; sau đó merge theo hình thức | 
| TRUNG BÌNH (B+C không A: DP-18/19/20) | Cùng phone + tiền + item | thiếu criterion "cùng method"; gap 34–44s có thể là hành động nội bộ 2 lần | **investigate** — hỏi BTC xác mức mua thật; test-sync 1.111 cho các cặp này |

### Rủi ro nếu merge sai
- Xác suất kẹt nhỏ nhưng hậu quả lớn: mất một đơn có tiền thật (gây hoàn tiền sai, giải trình sổ lệch), mất audit-trail, đánh sai báo cáo doanh thu.
- Với vài cặp tiền thật có 2 chuyển (DP-04/DP-07) — merge sai = sổ tiền lệch; **luôn bắt buộc sao kê trước bất kỳ hành động phá hủy nào**.
- Nguyên tắc: không merge tự động; chỉ owner duyệt từng dòng trong bảng.

## 4. Liên hệ với cutover & tương lai

- Không merge nào thực hiện trong cutover window (duyệt mục III — chạy riêng, có backup trước).
- Sau cutover, v025 idempotency (`scope_key` + request_hash + lease) sẽ chặn hẳn lớp lỗi này từ phía ứng dụng — đây là fix gốc (system), không là data-fix.
- Với thiết kế 026: hủy đơn qua `cancel_order_atomic` tạo effect-reversal đúng một lần — mọi merge/cancel phải chạy qua RPC (không UPDATE tay).
