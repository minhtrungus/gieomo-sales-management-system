# H29 — Payment Reconciliation Approval List (39 paid orders, masked)

Trạng thái hồ sơ: **PAYMENT RECONCILIATION APPROVAL LIST — COMPLETE**.
Tài liệu dùng mã hoá (masked/synthetic Ref); không chứa PII (không tên/email/điện thoại khách) và không chứa mã giao dịch ngân hàng thật.
Nguồn: bản sao local forensics `127.0.0.1:55442` (restore từ `backups/prod-20261022-20261022T080112/`); sinh tự động bằng `.tmp/recon-20261022/h29-payment-table.mjs`.

## 1. Tóm tắt

- 39 đơn `payment_status='paid'`, tổng **3.207.466đ** tại thời điểm snapshot 2026-10-22.
- Phân bổ: 30 trạng thái `pending`, 8 `completed`, 1 `confirmed`; 100% method = `banking`.
- Nền tảng chứng cứ chung (cho mọi dòng, đã kiểm):
  - **không có** cấu trúc `payments` đầy đủ (migrations 021–030 chưa chạy); bảng ledger tiền chưa tồn tại;
  - `order_status_history` chỉ chứa event loại `order` (không có event xác nhận tiền);
  - `orders.idempotency_key` toàn NULL — không có cơ chế chống lặp ở đường legacy;
  - 29/39 có `internal_note` (ghi chú admin dạng tay) nhưng **không có** mã giao dịch ngân hàng nào trong note (số đếm note chứa số ≥4 chữ số = 0).
- Phân loại:
  - **needs-evidence (25 dòng)** — phải đối soát sao kê ngân hàng trước khi chốt sổ; DB thuần không đủ căn cứ để coi là "verified".
  - **ambiguous (14 dòng** — thuộc các cặp DP-*; 2 cặp có cả hai đơn đều paid: DP-04/DP-07**) — nằm trong 1 trong các cặp trùng lặp DP-* cùng tiền/≤60s; số thật nhận về có thể chỉ đủ cho MỘT đơn của cặp. Quyết "đơn nào là thật" thuộc business + sao kê.
  - **verified (0 dòng)** — chưa cấp cho dòng nào (không có bằng chứng ngân hàng; không green-washing).
- Chi tiết cặp trùng: `OPENCODE_H29_DUPLICATE_REVIEW_LIST.md`.

## 2. Danh sách 39 dòng (masking: order ref chỉ giữ 2–3 ký tự đầu/cuối)

| Ref | Ngày giờ | Order ref | Trạng thái (đơn/thanh toán) | Tiền (đ) | Items | Voucher | DUP cặp | Phân loại |
|---|---|---|---|---|---|---|---|---|
| PAID-01 | 2026-10-06 21:26 | -1***18296 | confirmed/paid | 1.111 | 1 | — | — | needs-evidence |
| PAID-02 | 2026-10-07 00:02 | -7***16703 | pending/paid | 16.111 | 1 | — | — | needs-evidence |
| PAID-03 | 2026-10-07 22:12 | -3***48235 | pending/paid | 2.222 | 2 | — | — | needs-evidence |
| PAID-04 | 2026-10-07 23:36 | -7***58275 | pending/paid | 1.111 | 1 | — | — | needs-evidence |
| PAID-05 | 2026-10-08 00:09 | -8***35691 | pending/paid | 1.111 | 1 | — | — | needs-evidence |
| PAID-06 | 2026-10-11 01:42 | -8***25068 | pending/paid | 129.000 | 1 | — | DP-08 | ambiguous (DUP: DP-08) |
| PAID-07 | 2026-10-11 23:18 | -5***50133 | pending/paid | 85.500 | 1 | — | — | needs-evidence |
| PAID-08 | 2026-10-12 20:24 | -5***76556 | completed/paid | 129.000 | 1 | — | DP-01 | ambiguous (DUP: DP-01) |
| PAID-09 | 2026-10-12 21:10 | -3***45749 | completed/paid | 194.400 | 12 | — | — | needs-evidence |
| PAID-10 | 2026-10-12 22:51 | -6***54471 | pending/paid | 36.000 | 2 | — | — | needs-evidence |
| PAID-11 | 2026-10-12 23:07 | -8***64144 | pending/paid | 95.000 | 1 | — | DP-11 | ambiguous (DUP: DP-11) |
| PAID-12 | 2026-10-13 13:14 | -3***06958 | completed/paid | 85.000 | 1 | — | DP-13 | ambiguous (DUP: DP-13) |
| PAID-13 | 2026-10-13 14:10 | -9***97823 | pending/paid | 139.000 | 4 | — | — | needs-evidence |
| PAID-14 | 2026-10-13 20:46 | -5***22659 | pending/paid | 204.900 | 8 | — | — | needs-evidence |
| PAID-15 | 2026-10-13 21:32 | -8***16063 | pending/paid | 36.000 | 2 | — | — | needs-evidence |
| PAID-16 | 2026-10-13 22:23 | -4***70183 | completed/paid | 51.000 | 2 | — | — | needs-evidence |
| PAID-17 | 2026-10-14 01:51 | -5***97889 | pending/paid | 100.000 | 1 | — | DP-15 | ambiguous (DUP: DP-15) |
| PAID-18 | 2026-10-14 08:33 | -1***43227 | completed/paid | 54.000 | 3 | — | — | needs-evidence |
| PAID-19 | 2026-10-14 09:34 | -7***92279 | pending/paid | 36.000 | 2 | — | — | needs-evidence |
| PAID-20 | 2026-10-14 11:30 | -4***34579 | completed/paid | 90.000 | 5 | — | — | needs-evidence |
| PAID-21 | 2026-10-14 13:34 | -8***12222 | pending/paid | 36.000 | 2 | — | — | needs-evidence |
| PAID-22 | 2026-10-14 14:00 | -7***52654 | pending/paid | 18.000 | 1 | — | — | needs-evidence |
| PAID-23 | 2026-10-14 14:08 | -7***64842 | pending/paid | 18.000 | 1 | — | — | needs-evidence |
| PAID-24 | 2026-10-14 18:56 | -2***81873 | pending/paid | 171.000 | 8 | — | — | needs-evidence |
| PAID-25 | 2026-10-14 21:17 | -3***40825 | pending/paid | 190.000 | 1 | — | DP-12 | ambiguous (DUP: DP-12) |
| PAID-26 | 2026-10-14 21:54 | -2***29263 | pending/paid | 95.000 | 1 | — | DP-05 | ambiguous (DUP: DP-05) |
| PAID-27 | 2026-10-14 22:13 | -9***86494 | pending/paid | 103.000 | 2 | — | — | needs-evidence |
| PAID-28 | 2026-10-14 22:22 | -5***52022 | pending/paid | 95.000 | 1 | — | DP-14 | ambiguous (DUP: DP-14) |
| PAID-29 | 2026-10-15 11:53 | -6***86835 | completed/paid | 18.000 | 1 | — | DP-04 | ambiguous (DUP: DP-04) |
| PAID-30 | 2026-10-15 11:53 | -1***47332 | pending/paid | 18.000 | 1 | — | DP-04 | ambiguous (DUP: DP-04) |
| PAID-31 | 2026-10-15 15:55 | -3***08688 | pending/paid | 90.000 | 3 | — | — | needs-evidence |
| PAID-32 | 2026-10-15 20:01 | -2***31455 | pending/paid | 18.000 | 1 | — | DP-07 | ambiguous (DUP: DP-07) |
| PAID-33 | 2026-10-15 20:01 | -8***89835 | pending/paid | 18.000 | 1 | — | DP-07 | ambiguous (DUP: DP-07) |
| PAID-34 | 2026-10-15 20:15 | -4***75130 | pending/paid | 85.000 | 1 | — | DP-17 | ambiguous (DUP: DP-17) |
| PAID-35 | 2026-10-16 16:40 | -8***52464 | pending/paid | 113.000 | 2 | — | — | needs-evidence |
| PAID-36 | 2026-10-16 22:44 | -8***16675 | pending/paid | 129.000 | 1 | — | DP-16 | ambiguous (DUP: DP-16) |
| PAID-37 | 2026-10-16 23:51 | -2***89982 | pending/paid | 144.000 | 8 | — | — | needs-evidence |
| PAID-38 | 2026-10-17 16:36 | -8***14475 | completed/paid | 190.000 | 6 | — | — | needs-evidence |
| PAID-39 | 2026-10-20 11:35 | -6***67789 | pending/paid | 172.000 | 5 | — | — | needs-evidence |

Ghi chú hoạt động nhóm 1.111đ: PAID-01/04/05 là các khoản test (giá 1.111), PAID-02 (16.111) có thể có cấu phần test+ship — đối chiếu sao kê quyết.

## 3. Quy trình duyệt (không tự động)

1. Xuất bảng này (kèm `h29-payment-list.json` masked) vào sheet đối soát cùng sao kê ngân hàng.
2. Sao kê khớp từng dòng → mark `verified` trên SHEET (mã GD nằm trên sheet riêng, **không** đưa vào tài liệu/commit/reports).
3. Cặp DUP chỉ khớp MỘT giao dịch → đơn còn lại của cặp chuyển quy trình merge/cancel theo `OPENCODE_H29_DUPLICATE_REVIEW_LIST.md` (đợi owner duyệt mục III).
4. Sau duyệt + sau khi migrations 023/024 chạy: ghi nhận các quyết định qua RPC `apply_payment_event` (không UPDATE trực tiếp `orders`).
5. Không tự động ingest bất kỳ raw row nào của list này vào reports khác.
