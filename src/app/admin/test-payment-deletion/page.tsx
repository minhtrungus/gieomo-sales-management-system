"use client";

import { useState } from "react";
import { ShieldAlert, Trash2 } from "lucide-react";

type PreviewRow = { order_id: string; order_code: string | null; order_status: string | null; payment_status: string | null; payment_method: string | null; final_amount: number | null; environment_kind: string | null; eligible: boolean; blockers: string[] };
type Preview = { order_count: number; orders: PreviewRow[]; snapshot_hash: string };
type Challenge = { challengeId: string; confirmationCode: string; expiresAt: string };

async function post(body: Record<string, unknown>) {
  const response = await fetch("/api/admin/test-payment-deletion", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok || data.success !== true) throw Object.assign(new Error(data.error || "Không thể xử lý batch."), { data });
  return data;
}

export default function TestPaymentDeletionPage() {
  const [rawIds, setRawIds] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const orderIds = rawIds.split(/\s+/).map((value) => value.trim()).filter(Boolean);

  async function runPreview() {
    setBusy(true); setMessage(null); setPreview(null); setChallenge(null); setConfirmation("");
    try {
      const data = await post({ action: "preview", orderIds });
      setPreview(data); setMessage("Dry-run hoàn tất. Chưa có dữ liệu nào được thay đổi.");
    } catch (error) {
      const details = (error as { data?: { orders?: PreviewRow[] } }).data;
      if (details?.orders) setPreview({ order_count: details.orders.length, orders: details.orders, snapshot_hash: "" });
      setMessage(error instanceof Error ? error.message : "Không thể chạy dry-run.");
    } finally { setBusy(false); }
  }

  async function issueChallenge() {
    setBusy(true); setMessage(null); setChallenge(null); setConfirmation("");
    try {
      const data = await post({ action: "challenge", orderIds });
      setChallenge({ challengeId: data.challenge_id, confirmationCode: data.confirmationCode, expiresAt: data.expires_at });
      setMessage("Mã dùng một lần đã được cấp. Mã hết hạn sau 5 phút và sẽ không được hệ thống hiển thị lại.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Không thể cấp mã."); }
    finally { setBusy(false); }
  }

  async function deleteBatch() {
    if (!challenge) return;
    setBusy(true); setMessage(null);
    try {
      const data = await post({ action: "delete", challengeId: challenge.challengeId, confirmationCode: confirmation, reason });
      setMessage(`Đã xóa an toàn ${data.order_count} đơn test. Payment events và audit đã được bảo toàn.`);
      setRawIds(""); setPreview(null); setChallenge(null); setConfirmation(""); setReason("");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Không thể xóa batch."); }
    finally { setBusy(false); }
  }

  return <div className="mx-auto max-w-5xl space-y-6">
    <div><h1 className="flex items-center gap-2 font-heading text-2xl font-extrabold text-emerald-950"><Trash2 className="h-6 w-6" /> Xóa đơn thanh toán test</h1><p className="mt-1 text-sm text-gray-600">Chỉ xóa đơn tiền mặt tổng hợp có provenance server trong database Preview/test cô lập và đã hủy hoàn tất.</p></div>
    <div className="rounded-2xl border border-red-300 bg-red-50 p-4 text-sm text-red-950"><p className="flex items-center gap-2 font-extrabold"><ShieldAlert className="h-5 w-5" /> Thao tác phá hủy, mặc định bị khóa</p><p className="mt-1">Đơn ngân hàng/provider, thiếu marker, chưa hoàn tác tồn kho/voucher, có shipment hoặc dữ liệu đối soát bất thường sẽ bị chặn. Lý do nhập tay không phải bằng chứng test.</p></div>
    <section className="space-y-4 rounded-3xl border border-[#E8DDD0] bg-white p-5 shadow-soft">
      <label className="block text-sm font-bold text-gray-800">1–10 UUID đơn, mỗi dòng một UUID<textarea value={rawIds} onChange={(event) => { setRawIds(event.target.value); setPreview(null); setChallenge(null); }} rows={7} className="mt-2 w-full rounded-2xl border border-gray-200 p-3 font-mono text-xs outline-none focus:ring-2 focus:ring-emerald-200" /></label>
      <button type="button" disabled={busy || orderIds.length < 1 || orderIds.length > 10} onClick={runPreview} className="rounded-xl bg-emerald-800 px-4 py-2.5 text-xs font-extrabold text-white disabled:opacity-50">{busy ? "Đang kiểm tra..." : "Chạy dry-run"}</button>
    </section>
    {preview && <section className="space-y-4 rounded-3xl border border-emerald-300 bg-white p-5"><h2 className="font-extrabold text-emerald-950">Kết quả kiểm tra: {preview.order_count} đơn</h2><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-xs"><thead><tr className="border-b"><th className="p-2">Đơn</th><th>Trạng thái</th><th>Thanh toán</th><th>Môi trường</th><th>Kết quả</th></tr></thead><tbody>{preview.orders.map((row) => <tr key={row.order_id} className="border-b"><td className="p-2 font-mono">{row.order_code || row.order_id}</td><td>{row.order_status}</td><td>{row.payment_method} / {row.payment_status}<br />{Number(row.final_amount || 0).toLocaleString("vi-VN")}₫</td><td>{row.environment_kind || "—"}</td><td className={row.eligible ? "font-bold text-emerald-700" : "font-bold text-red-700"}>{row.eligible ? "ELIGIBLE" : `BLOCKED: ${(row.blockers || []).join(", ")}`}</td></tr>)}</tbody></table></div>{preview.orders.every((row) => row.eligible) && !challenge && <button type="button" disabled={busy} onClick={issueChallenge} className="rounded-xl bg-amber-700 px-4 py-2.5 text-xs font-extrabold text-white disabled:opacity-50">Cấp mã xác nhận dùng một lần</button>}</section>}
    {challenge && <section className="space-y-4 rounded-3xl border-2 border-red-300 bg-white p-5"><div><h2 className="font-extrabold text-red-900">Xác nhận phá hủy lần cuối</h2><p className="mt-1 text-xs text-gray-600">Mã chỉ hiện trong response hiện tại, hết hạn lúc {new Date(challenge.expiresAt).toLocaleTimeString("vi-VN")}.</p></div><div className="break-all rounded-xl bg-gray-950 p-3 font-mono text-sm text-white" aria-label="Mã xác nhận dùng một lần">{challenge.confirmationCode}</div><label className="block text-xs font-bold">Lý do kiểm toán (8–500 ký tự)<textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} className="mt-2 w-full rounded-xl border p-3 font-normal" /></label><label className="block text-xs font-bold">Tự copy/paste mã vào đây<input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" className="mt-2 w-full rounded-xl border p-3 font-mono font-normal" /></label><button type="button" disabled={busy || reason.trim().length < 8 || confirmation !== challenge.confirmationCode} onClick={deleteBatch} className="rounded-xl bg-red-700 px-4 py-2.5 text-xs font-extrabold text-white disabled:opacity-50">Xác nhận xóa vĩnh viễn batch test</button></section>}
    {message && <p role="status" className="rounded-xl border bg-white p-3 text-sm font-semibold text-gray-800">{message}</p>}
  </div>;
}
