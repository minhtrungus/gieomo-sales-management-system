export type CreateOrderAttempt = {
  key: string;
  resolve(): void;
  release(): void;
};

const inFlight = new Set<string>();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One unresolved attempt per caller/tab. Persist only key + payload digest.
 * Changed input must not silently start a new order while the old result is unknown.
 * resolve is reserved for validated success / server-confirmed terminal outcomes.
 */
export async function beginCreateOrderAttempt(
  scope: string,
  payload: unknown,
  explicitKey?: string
): Promise<CreateOrderAttempt> {
  if (inFlight.has(scope)) throw new Error("Thao tác tạo đơn đang được xử lý. Vui lòng chờ kết quả.");
  inFlight.add(scope);
  try {
    const storageKey = `gieomo_create_attempt_${scope}`;
    const storage = window.sessionStorage;
    const bytes = new TextEncoder().encode(JSON.stringify(payload));
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
      (b) => b.toString(16).padStart(2, "0")).join("");
    const raw = storage.getItem(storageKey);
    const legacyKey = scope === "checkout" ? storage.getItem("gieomo_checkout_idempotency_key") : null;
    let key: string;
    if (raw !== null) {
      const saved = JSON.parse(raw) as { key?: unknown; digest?: unknown } | null;
      if (!saved || typeof saved.key !== "string" || !UUID.test(saved.key) ||
          typeof saved.digest !== "string" || !/^[a-f0-9]{64}$/.test(saved.digest)) {
        throw new Error("Dữ liệu attempt tạo đơn không hợp lệ. Cần xác minh trạng thái trước khi tạo đơn mới.");
      }
      if (saved.digest !== digest || (explicitKey && explicitKey !== saved.key)) {
        throw new Error("Lần tạo đơn trước chưa xác định kết quả. Giữ nguyên thông tin để thử lại cùng key hoặc liên hệ hỗ trợ đối soát.");
      }
      key = saved.key;
    } else {
      key = legacyKey || explicitKey || crypto.randomUUID();
      if (!UUID.test(key) || (legacyKey && explicitKey && legacyKey !== explicitKey)) {
        throw new Error("Idempotency key không hợp lệ hoặc xung đột. Cần xác minh attempt trước.");
      }
      const value = JSON.stringify({ key, digest });
      storage.setItem(storageKey, value);
      if (storage.getItem(storageKey) !== value) throw new Error("Không lưu được attempt tạo đơn để retry an toàn.");
    }
    return {
      key,
      resolve() {
        // A failed removal leaves the attempt available for safe replay.
        try {
          if (scope === "checkout") storage.removeItem("gieomo_checkout_idempotency_key");
          storage.removeItem(storageKey);
        } catch { /* keep the same attempt; never fabricate a new key */ }
      },
      release() { inFlight.delete(scope); },
    };
  } catch (error) {
    inFlight.delete(scope);
    throw error instanceof Error ? error : new Error("Không lưu được attempt tạo đơn. Chưa gửi yêu cầu.");
  }
}
