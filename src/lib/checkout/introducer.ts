/**
 * Giá trị lưu vào orders.introducer_info khi khách chọn "Không quen ai".
 * Cùng chuỗi với mặc định của writer legacy (orderService) và bộ lọc
 * "Trực tiếp qua Web" của trang admin/orders — mọi nơi so sánh exact-match
 * phải dùng chuỗi này.
 */
export const NO_INTRODUCER_VALUE = "Trực tiếp (Website)";

/**
 * Các cách người dùng có thể diễn đạt lựa chọn "Không quen ai" (đã normalize
 * lower + trim + gộp khoảng trắng). Gồm cả chuỗi legacy RPC 025
 * 'Truc tiep (Website)' (không dấu) để filter admin không phân loại nhầm
 * đơn mặc định.
 */
const NO_INTRODUCER_ALIASES = new Set([
  "trực tiếp (website)",
  "truc tiep (website)",
  "trực tiếp",
  "truc tiep",
  "không quen ai",
  "khong quen ai",
  "tôi không quen ai trong btc",
  "toi khong quen ai trong btc",
]);

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase("vi-VN").replace(/\s+/g, " ");
}

/** true khi giá trị là lựa chọn "Không quen ai" (bất kỳ biến thể nào). */
export function isNoIntroducerValue(value: string | null | undefined): boolean {
  if (!value) return false;
  return NO_INTRODUCER_ALIASES.has(normalize(value));
}

/**
 * Chuẩn hóa về giá trị lưu bền vững: lựa chọn "Không quen ai" →
 * NO_INTRODUCER_VALUE; giá trị khác giữ nguyên (trim edge).
 */
export function normalizeIntroducerValue(value: string | null | undefined): string {
  const trimmed = (value || "").trim();
  if (!trimmed) return NO_INTRODUCER_VALUE;
  return isNoIntroducerValue(trimmed) ? NO_INTRODUCER_VALUE : trimmed;
}

/**
 * Trường "Người liên hệ / quen biết qua ai" là BẮT BUỘC phải có giá trị,
 * nhưng KHÔNG ép khách phải chỉ định một người cụ thể: lựa chọn "Không quen
 * ai" là hợp lệ và được lưu nhất quán thành NO_INTRODUCER_VALUE. Chỉ từ chối
 * giá trị rỗng.
 */
export function validateIntroducerInfo(value: string): string | null {
  if (!normalize(value)) {
    return "Vui lòng chọn người liên hệ / người bạn quen, hoặc chọn “Tôi không quen ai trong BTC”";
  }
  return null;
}
