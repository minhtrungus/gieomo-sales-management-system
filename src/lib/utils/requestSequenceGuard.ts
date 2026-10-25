/**
 * Batch 3C.1 — request sequence guard cho fetch client (UI race M1).
 *
 * Vấn đề: request A (filter cũ/trang cũ) về SAU request B → setRecords của
 * A ghi đè dữ liệu B; finally của A tắt loading khi B còn pending.
 *
 * Nguyên lý: mỗi begin() vô hiệu mọi request trước — tăng token đơn điệu +
 * abort controller cũ. Chỉ response có token hiện hành được ghi state;
 * finally chỉ request hiện hành được tắt loading. abort() chặn fetch đang
 * chạy ở network layer; token guard bảo vệ thêm trường hợp response đã
 * về/đang xử lý callback khi begin() mới chạy (abort không chặn được nữa).
 *
 * Thuần — không phụ thuộc React — test được bằng node:test.
 */

export interface GuardedRequest {
  /** Token đơn điệu của request này. */
  token: number;
  /** AbortSignal để truyền vào fetch(). */
  signal: AbortSignal;
  /** Đúng khi request này còn là request hiện hành (chưa bị begin/invalidate sau). */
  isCurrent(): boolean;
}

export interface RequestSequenceGuard {
  /** Bắt đầu request mới: vô hiệu mọi request trước, trả handle cho request này. */
  begin(): GuardedRequest;
  /** Vô hiệu mọi request đang chạy (unmount) — không có request mới thay thế. */
  invalidate(): void;
}

export function createRequestSequenceGuard(): RequestSequenceGuard {
  let seq = 0;
  let activeController: AbortController | null = null;

  function invalidate(): void {
    seq += 1;
    activeController?.abort();
    activeController = null;
  }

  function begin(): GuardedRequest {
    invalidate();
    const controller = new AbortController();
    activeController = controller;
    const token = seq;
    return {
      token,
      signal: controller.signal,
      isCurrent: () => token === seq,
    };
  }

  return { begin, invalidate };
}
