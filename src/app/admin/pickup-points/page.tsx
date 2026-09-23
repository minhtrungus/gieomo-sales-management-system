"use client";

import { useState, useEffect } from "react";
import { MapPin, Plus, Edit3, Trash2, Phone, Clock, User, X, Check, AlertCircle } from "lucide-react";
import { getStoredPickupPoints, saveStoredPickupPoint, deleteStoredPickupPoint } from "@/lib/data/orderStore";
import type { PickupPoint } from "@/types/database";

export default function AdminPickupPointsPage() {
  const [points, setPoints] = useState<PickupPoint[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPoint, setEditingPoint] = useState<PickupPoint | null>(null);
  const [deletingPoint, setDeletingPoint] = useState<PickupPoint | null>(null);

  // Form states
  const [formData, setFormData] = useState<Partial<PickupPoint>>({
    name: "",
    address: "",
    contact_name: "",
    contact_phone: "",
    opening_hours: "",
    location_guide: "",
    status: "active",
  });

  const loadPoints = () => {
    setPoints(getStoredPickupPoints());
  };

  useEffect(() => {
    loadPoints();
    window.addEventListener("gieomo_pickup_points_updated", loadPoints);
    return () => window.removeEventListener("gieomo_pickup_points_updated", loadPoints);
  }, []);

  const handleOpenAdd = () => {
    setEditingPoint(null);
    setFormData({
      name: "",
      address: "",
      contact_name: "",
      contact_phone: "",
      opening_hours: "",
      location_guide: "",
      status: "active",
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (p: PickupPoint) => {
    setEditingPoint(p);
    setFormData({
      name: p.name,
      address: p.address,
      contact_name: p.contact_name || "",
      contact_phone: p.contact_phone || "",
      opening_hours: p.opening_hours || "",
      location_guide: p.location_guide || "",
      status: p.status,
    });
    setIsModalOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.address) return;

    const pointToSave: PickupPoint = {
      pickup_point_id: editingPoint ? editingPoint.pickup_point_id : `pp-${Date.now()}`,
      name: formData.name!,
      address: formData.address!,
      contact_name: formData.contact_name || null,
      contact_phone: formData.contact_phone || null,
      opening_hours: formData.opening_hours || null,
      location_guide: formData.location_guide || null,
      status: formData.status as "active" | "inactive",
      updated_at: new Date().toISOString(),
    };

    saveStoredPickupPoint(pointToSave);
    setIsModalOpen(false);
    loadPoints();
  };

  const handleDelete = () => {
    if (!deletingPoint) return;
    deleteStoredPickupPoint(deletingPoint.pickup_point_id);
    setDeletingPoint(null);
    loadPoints();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-heading font-extrabold text-2xl text-[#231B16] flex items-center gap-2">
            <MapPin className="w-6 h-6 text-[#2D6338]" />
            Quản lý Điểm nhận hàng (Pickup Points)
          </h1>
          <p className="text-xs text-[#7E7068] mt-0.5">
            Cấu hình các điểm tập kết nhận hàng trực tiếp: thành viên trực bàn, SĐT liên hệ và hướng dẫn nhận chỗ cho khách.
          </p>
        </div>

        <button
          onClick={handleOpenAdd}
          className="px-5 py-2.5 rounded-full bg-[#BFE9C3] hover:bg-[#aee0b3] text-[#16381D] font-extrabold text-xs flex items-center gap-2 shadow-xs transition-all border border-[#9ed4a3] active:scale-95 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Thêm Điểm nhận mới</span>
        </button>
      </div>

      {/* Grid of Pickup Points Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {points.map((p) => (
          <div
            key={p.pickup_point_id}
            className="bg-white rounded-3xl p-6 border border-[#F0E5D8] shadow-soft flex flex-col justify-between space-y-4 hover:shadow-card-hover transition-all"
          >
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-[#EAF7ED] text-[#2D6338] flex items-center justify-center shrink-0 font-bold text-sm">
                    📍
                  </div>
                  <div>
                    <h3 className="font-heading font-bold text-sm text-[#231B16] leading-snug">
                      {p.name}
                    </h3>
                  </div>
                </div>

                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                    p.status === "active"
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {p.status === "active" ? "Đang mở" : "Tạm ngưng"}
                </span>
              </div>

              {/* Address */}
              <div className="text-xs text-[#5C4D44] flex items-start gap-2">
                <MapPin className="w-3.5 h-3.5 text-[#2D6338] shrink-0 mt-0.5" />
                <span className="leading-relaxed">{p.address}</span>
              </div>

              {/* Responsible Member & Phone */}
              <div className="p-3 rounded-2xl bg-[#FFF8EE] border border-[#F0E5D8] space-y-1.5 text-xs">
                <div className="flex items-center justify-between text-[#342A24]">
                  <span className="flex items-center gap-1.5 font-medium text-[#7E7068]">
                    <User className="w-3.5 h-3.5 text-[#A89B92]" />
                    Trực điểm:
                  </span>
                  <span className="font-bold text-[#231B16]">
                    {p.contact_name || "Chưa phân công"}
                  </span>
                </div>

                {p.contact_phone && (
                  <div className="flex items-center justify-between text-[#342A24]">
                    <span className="flex items-center gap-1.5 font-medium text-[#7E7068]">
                      <Phone className="w-3.5 h-3.5 text-[#A89B92]" />
                      Hotline:
                    </span>
                    <a href={`tel:${p.contact_phone}`} className="font-bold text-[#2D6338] hover:underline">
                      {p.contact_phone}
                    </a>
                  </div>
                )}

                {p.opening_hours && (
                  <div className="flex items-start justify-between text-[#342A24] pt-1 border-t border-[#F0E5D8]/70">
                    <span className="flex items-center gap-1.5 font-medium text-[#7E7068] shrink-0">
                      <Clock className="w-3.5 h-3.5 text-[#A89B92]" />
                      Giờ trực:
                    </span>
                    <span className="text-[11px] text-right text-[#5C4D44] font-medium">
                      {p.opening_hours}
                    </span>
                  </div>
                )}
              </div>

              {/* Location guide note */}
              {p.location_guide && (
                <div className="text-[11px] text-[#7E7068] bg-[#F7F4F0] p-2.5 rounded-xl border border-dashed border-[#E5DACD] leading-relaxed">
                  💡 <strong>Vị trí nhận chỗ:</strong> {p.location_guide}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="pt-3 border-t border-[#F0E5D8] flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => handleOpenEdit(p)}
                className="px-3 py-1.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Sửa</span>
              </button>

              <button
                type="button"
                onClick={() => setDeletingPoint(p)}
                className="px-3 py-1.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Xóa</span>
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Modal Add / Edit */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-lg w-full border border-[#F0E5D8] shadow-soft space-y-5 animate-in fade-in">
            <div className="flex items-center justify-between border-b border-[#F0E5D8] pb-3">
              <h3 className="font-heading font-extrabold text-lg text-[#231B16]">
                {editingPoint ? "Chỉnh sửa Điểm nhận hàng" : "Thêm Điểm nhận hàng mới"}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="font-bold text-[#342A24] block">Tên điểm nhận *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="Ví dụ: Điểm 1 — ĐH Kinh Tế TP.HCM"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 outline-none focus:border-[#BFE9C3]"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-[#342A24] block">Địa chỉ chi tiết *</label>
                <input
                  type="text"
                  required
                  value={formData.address}
                  onChange={(e) => setFormData((prev) => ({ ...prev, address: e.target.value }))}
                  placeholder="Số nhà, đường, phường, quận..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 outline-none focus:border-[#BFE9C3]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-[#342A24] block">Thành viên trực điểm</label>
                  <input
                    type="text"
                    value={formData.contact_name || ""}
                    onChange={(e) => setFormData((prev) => ({ ...prev, contact_name: e.target.value }))}
                    placeholder="Họ tên người phụ trách"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 outline-none focus:border-[#BFE9C3]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-[#342A24] block">Số điện thoại liên lạc</label>
                  <input
                    type="tel"
                    value={formData.contact_phone || ""}
                    onChange={(e) => setFormData((prev) => ({ ...prev, contact_phone: e.target.value }))}
                    placeholder="0901 234 567"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 outline-none focus:border-[#BFE9C3]"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-[#342A24] block">Khung giờ mở cửa / nhận hàng</label>
                <input
                  type="text"
                  value={formData.opening_hours || ""}
                  onChange={(e) => setFormData((prev) => ({ ...prev, opening_hours: e.target.value }))}
                  placeholder="Ví dụ: Thứ 2 - Thứ 6: 11h30 - 13h00 & 16h30 - 18h00"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 outline-none focus:border-[#BFE9C3]"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-[#342A24] block">Vị trí nhận chỗ / Lưu ý cho khách</label>
                <textarea
                  rows={2}
                  value={formData.location_guide || ""}
                  onChange={(e) => setFormData((prev) => ({ ...prev, location_guide: e.target.value }))}
                  placeholder="Ví dụ: Bàn trực trước sảnh tòa B1 đối diện thang máy, gọi hotline trước 5 phút..."
                  className="w-full px-3.5 py-2 rounded-xl border border-gray-200 outline-none focus:border-[#BFE9C3] resize-none"
                />
              </div>

              <div className="space-y-1 pt-1">
                <label className="font-bold text-[#342A24] block">Trạng thái điểm nhận</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData((prev) => ({ ...prev, status: e.target.value as any }))}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 outline-none focus:border-[#BFE9C3] bg-white"
                >
                  <option value="active">Đang mở (Hiển thị trên form checkout)</option>
                  <option value="inactive">Tạm ngưng (Ẩn khỏi form checkout)</option>
                </select>
              </div>

              <div className="pt-3 border-t border-[#F0E5D8] flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-gray-200 text-gray-700 font-bold hover:bg-gray-100 transition-colors cursor-pointer"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-[#2D6338] hover:bg-[#23502d] text-white font-bold transition-colors cursor-pointer shadow-xs"
                >
                  {editingPoint ? "Lưu thay đổi" : "Tạo điểm nhận"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingPoint && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full border border-red-100 shadow-soft space-y-4 animate-in fade-in">
            <div className="flex items-center gap-3 text-red-600">
              <AlertCircle className="w-6 h-6" />
              <h3 className="font-heading font-bold text-base text-gray-900">
                Xác nhận xóa điểm nhận?
              </h3>
            </div>
            <p className="text-xs text-gray-600 leading-relaxed">
              Bạn có chắc muốn xóa điểm nhận <strong>&ldquo;{deletingPoint.name}&rdquo;</strong>? Thao tác này sẽ gỡ điểm nhận khỏi danh sách lựa chọn của khách.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeletingPoint(null)}
                className="px-4 py-2 rounded-xl border border-gray-200 text-gray-700 text-xs font-bold hover:bg-gray-100 cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleDelete}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold cursor-pointer"
              >
                Xóa vĩnh viễn
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
