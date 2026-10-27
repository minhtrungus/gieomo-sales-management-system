"use client";

import { useState } from "react";
import { Archive, ShieldAlert } from "lucide-react";

type PreviewOrder = {
  order_id: string; order_code: string; order_status: string; payment_status: string;
  delivery_status: string; final_amount: number; payment_count: number; payment_event_count: number;
};
type Preview = { preview_token: string; order_count: number; total_amount: number; orders: PreviewOrder[] };

export default function TestDataCleanupPage() {
  const [lines, setLines] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const candidates = lines.split(/\r?\n/).map((line) => {
    const [orderId, ...rest] = line.split("|");
    return { orderId: orderId?.trim(), classificationReason: rest.join("|").trim() };
  }).filter((row) => row.orderId || row.classificationReason);

  async function submit(mode: "preview" | "archive") {
    setBusy(true); setMessage(null);
    try {
      const response = await fetch("/api/admin/test-order-cleanup", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, candidates, reason, confirmation, previewToken: preview?.preview_token }),
      });
      const data = await response.json();
      if (!response.ok || data.success !== true) throw new Error(data.error || "Không thể xử lý batch.");
      if (mode === "preview") {
        setPreview(data); setConfirmation("");
        setMessage("Dry-run hoàn tất. Chưa có dữ liệu nào được thay đổi.");
      } else {
        setPreview(null); setLines(""); setReason(""); setConfirmation("");
        setMessage(`Đã lưu trữ ${data.order_count} đơn; không xóa order hay ledger.`);
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : "Không thể xử lý batch."); }
    finally { setBusy(false); }
  }

  const phrase = preview ? `LUU TRU ${preview.order_count} DON` : "";
  return <div className="mx-auto max-w-5xl space-y-6">
    <div>
      <h1 className="flex items-center gap-2 font-heading text-2xl font-extrabold text-emerald-950"><Archive className="h-6 w-6" /> Lưu trữ dữ liệu đơn test</h1>
      <p className="mt-1 text-sm text-gray-600">Workflow riêng cho batch đã được người quản trị xác minh thủ công. Không xóa đơn, payment, payment event hay audit.</p>
    </div>
    <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
      <p className="flex items-center gap-2 font-extrabold"><ShieldAlert className="h-5 w-5" /> Khóa an toàn nhiều lớp</p>
      <p className="mt-1">Production luôn bị chặn. Preview/local phải có allowlist ở ứng dụng và cờ bật đúng project trong database. Dry-run chỉ đọc; xác nhận sẽ kiểm tra lại snapshot dưới row lock.</p>
    </div>
    <section className="space-y-4 rounded-3xl border border-[#E8DDD0] bg-white p-5 shadow-soft">
      <label className="block text-sm font-bold text-gray-800">Tối đa 20 dòng: <code>order UUID | lý do xác định là test</code>
        <textarea value={lines} onChange={(event) => { setLines(event.target.value); setPreview(null); }} rows={8}
          placeholder="00000000-0000-4000-8000-000000000000 | Đơn test do đội vận hành tạo ngày ..."
          className="mt-2 w-full rounded-2xl border border-gray-200 p-3 font-mono text-xs outline-none focus:ring-2 focus:ring-emerald-200" />
      </label>
      <button type="button" disabled={busy || candidates.length < 1} onClick={() => submit("preview")}
        className="rounded-xl bg-emerald-800 px-4 py-2.5 text-xs font-extrabold text-white disabled:opacity-50">{busy ? "Đang kiểm tra..." : "Chạy dry-run"}</button>
    </section>
    {preview && <section className="space-y-4 rounded-3xl border border-emerald-300 bg-white p-5">
      <div><h2 className="font-extrabold text-emerald-950">Kết quả dry-run: {preview.order_count} đơn</h2>
        <p className="text-sm text-gray-600">Tổng giá trị tham chiếu: {Number(preview.total_amount).toLocaleString("vi-VN")}₫. Đây không phải số tiền sẽ hoàn.</p></div>
      <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr className="border-b"><th className="p-2">Đơn</th><th>Đơn hàng</th><th>Thanh toán</th><th>Ledger / event</th><th>Giá trị</th></tr></thead><tbody>{preview.orders.map((row) => <tr key={row.order_id} className="border-b"><td className="p-2 font-mono">{row.order_code}</td><td>{row.order_status}</td><td>{row.payment_status}</td><td>{row.payment_count} / {row.payment_event_count}</td><td>{Number(row.final_amount).toLocaleString("vi-VN")}₫</td></tr>)}</tbody></table></div>
      <label className="block text-xs font-bold">Lý do lưu trữ batch (8–500 ký tự)<textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} className="mt-2 w-full rounded-xl border p-3 font-normal" /></label>
      <label className="block text-xs font-bold">Nhập chính xác <code>{phrase}</code><input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="mt-2 w-full rounded-xl border p-3 font-mono font-normal" /></label>
      <button type="button" disabled={busy || reason.trim().length < 8 || confirmation !== phrase} onClick={() => submit("archive")}
        className="rounded-xl bg-amber-700 px-4 py-2.5 text-xs font-extrabold text-white disabled:opacity-50">Lưu trữ khỏi vận hành (không xóa)</button>
    </section>}
    {message && <p role="status" className="rounded-xl border bg-white p-3 text-sm font-semibold text-gray-800">{message}</p>}
  </div>;
}
