"use client";

import { useState, useEffect } from "react";
import { MessageSquare, Mail, Phone, Clock, Check, Reply, Search, Filter } from "lucide-react";
import { getStoredContactMessages, updateContactMessageStatus } from "@/lib/data/orderStore";
import type { ContactMessage } from "@/types/database";

export default function AdminMessagesPage() {
  const [messages, setMessages] = useState<ContactMessage[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "unread" | "read" | "replied">("all");
  const [selectedMessage, setSelectedMessage] = useState<ContactMessage | null>(null);

  const loadMessages = () => {
    setMessages(getStoredContactMessages());
  };

  useEffect(() => {
    loadMessages();
    window.addEventListener("gieomo_messages_updated", loadMessages);
    return () => window.removeEventListener("gieomo_messages_updated", loadMessages);
  }, []);

  const handleStatusChange = (id: string, newStatus: "unread" | "read" | "replied") => {
    updateContactMessageStatus(id, newStatus);
    loadMessages();
    if (selectedMessage && selectedMessage.id === id) {
      setSelectedMessage((prev) => (prev ? { ...prev, status: newStatus } : null));
    }
  };

  const filtered = messages.filter((m) => {
    const matchesSearch =
      m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (m.phone && m.phone.includes(searchQuery)) ||
      m.message.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = statusFilter === "all" || m.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const unreadCount = messages.filter((m) => m.status === "unread").length;
  const repliedCount = messages.filter((m) => m.status === "replied").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-heading font-extrabold text-2xl text-[#231B16] flex items-center gap-2">
            <MessageSquare className="w-6 h-6 text-[#2D6338]" />
            Hộp thư liên hệ &amp; Tin nhắn khách
          </h1>
          <p className="text-xs text-[#7E7068] mt-0.5">
            Quản lý và phản hồi các tin nhắn, câu hỏi và đề nghị tài trợ gửi từ trang Liên hệ.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-3.5 py-1.5 rounded-full bg-[#EAF7ED] text-[#16381D] font-bold text-xs border border-[#BFE9C3]">
            {unreadCount} tin chưa đọc
          </span>
          <span className="px-3.5 py-1.5 rounded-full bg-[#FFF8EE] text-[#542B07] font-bold text-xs border border-[#F0E5D8]">
            {repliedCount} đã phản hồi
          </span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-3xl p-4 border border-[#F0E5D8] shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm theo tên, email, SĐT, nội dung..."
            className="w-full pl-9 pr-4 py-2 rounded-xl border border-gray-200 text-xs outline-none focus:border-[#BFE9C3]"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
          <Filter className="w-3.5 h-3.5 text-gray-400 shrink-0" />
          {[
            { id: "all", label: "Tất cả" },
            { id: "unread", label: "Chưa đọc" },
            { id: "read", label: "Đã xem" },
            { id: "replied", label: "Đã phản hồi" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id as any)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
                statusFilter === tab.id
                  ? "bg-[#2D6338] text-white"
                  : "bg-gray-100 hover:bg-gray-200 text-gray-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Messages List & Detail Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Messages List (7 Cols) */}
        <div className="lg:col-span-7 bg-white rounded-3xl border border-[#F0E5D8] shadow-soft overflow-hidden">
          <div className="p-4 border-b border-[#F0E5D8] bg-[#FFF8EE]/60 font-bold text-xs text-[#542B07]">
            Danh sách tin nhắn ({filtered.length})
          </div>

          <div className="divide-y divide-[#F0E5D8]">
            {filtered.length === 0 ? (
              <div className="text-center py-12 text-gray-400 text-xs">
                Không tìm thấy tin nhắn nào phù hợp.
              </div>
            ) : (
              filtered.map((msg) => {
                const isSelected = selectedMessage?.id === msg.id;
                return (
                  <div
                    key={msg.id}
                    onClick={() => {
                      setSelectedMessage(msg);
                      if (msg.status === "unread") {
                        handleStatusChange(msg.id, "read");
                      }
                    }}
                    className={`p-4 cursor-pointer transition-all ${
                      isSelected
                        ? "bg-[#EAF7ED]/80 border-l-4 border-l-[#2D6338]"
                        : msg.status === "unread"
                        ? "bg-emerald-50/30 hover:bg-gray-50"
                        : "hover:bg-gray-50/70"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${msg.status === "unread" ? "bg-emerald-500 animate-pulse" : msg.status === "replied" ? "bg-blue-500" : "bg-gray-300"}`} />
                        <span className="font-heading font-bold text-xs text-[#231B16]">
                          {msg.name}
                        </span>
                      </div>
                      <span className="text-[10.5px] text-[#A89B92] flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(msg.created_at).toLocaleDateString("vi-VN", {
                          hour: "2-digit",
                          minute: "2-digit",
                          day: "2-digit",
                          month: "2-digit",
                        })}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-[11px] text-[#7E7068] mb-2">
                      <span className="flex items-center gap-1">
                        <Mail className="w-3 h-3" /> {msg.email}
                      </span>
                      {msg.phone && (
                        <span className="flex items-center gap-1 font-medium text-[#2D6338]">
                          <Phone className="w-3 h-3" /> {msg.phone}
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-[#5C4D44] line-clamp-2 leading-relaxed">
                      {msg.message}
                    </p>

                    <div className="mt-2.5 flex items-center justify-between">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          msg.status === "unread"
                            ? "bg-emerald-100 text-emerald-800"
                            : msg.status === "replied"
                            ? "bg-blue-100 text-blue-800"
                            : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {msg.status === "unread" ? "Chưa đọc" : msg.status === "replied" ? "Đã phản hồi" : "Đã xem"}
                      </span>

                      <span className="text-[11px] text-[#2D6338] font-bold hover:underline">
                        Chi tiết ➔
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Detail Panel (5 Cols) */}
        <div className="lg:col-span-5">
          {selectedMessage ? (
            <div className="bg-white rounded-3xl p-6 border border-[#F0E5D8] shadow-soft space-y-5 sticky top-20 animate-in fade-in">
              <div className="flex items-start justify-between gap-3 border-b border-[#F0E5D8] pb-4">
                <div>
                  <span className="text-[11px] font-bold text-[#A89B92] uppercase tracking-wider block">
                    Chi tiết tin nhắn
                  </span>
                  <h3 className="font-heading font-extrabold text-lg text-[#231B16] mt-0.5">
                    {selectedMessage.name}
                  </h3>
                  <span className="text-[11px] text-gray-500">
                    Gửi lúc: {new Date(selectedMessage.created_at).toLocaleString("vi-VN")}
                  </span>
                </div>

                <div className="flex items-center gap-1">
                  <select
                    value={selectedMessage.status}
                    onChange={(e) => handleStatusChange(selectedMessage.id, e.target.value as any)}
                    className="text-xs font-bold px-2.5 py-1.5 rounded-xl border border-gray-200 bg-white outline-none cursor-pointer"
                  >
                    <option value="unread">Chưa đọc</option>
                    <option value="read">Đã xem</option>
                    <option value="replied">Đã phản hồi</option>
                  </select>
                </div>
              </div>

              {/* Sender Info */}
              <div className="p-3.5 rounded-2xl bg-[#FFF8EE] border border-[#F0E5D8] space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-[#7E7068]">Email:</span>
                  <a
                    href={`mailto:${selectedMessage.email}?subject=Phản hồi từ Mầm Mơ - Dự án Gieo Mơ`}
                    className="font-bold text-[#2D6338] hover:underline flex items-center gap-1"
                  >
                    <Mail className="w-3.5 h-3.5" />
                    {selectedMessage.email}
                  </a>
                </div>

                {selectedMessage.phone && (
                  <div className="flex items-center justify-between pt-1 border-t border-[#F0E5D8]/70">
                    <span className="text-[#7E7068]">Số điện thoại:</span>
                    <a
                      href={`tel:${selectedMessage.phone}`}
                      className="font-bold text-[#2D6338] hover:underline flex items-center gap-1"
                    >
                      <Phone className="w-3.5 h-3.5" />
                      {selectedMessage.phone}
                    </a>
                  </div>
                )}
              </div>

              {/* Message Body */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-[#342A24] block uppercase tracking-wider">
                  Nội dung lời nhắn:
                </span>
                <div className="p-4 rounded-2xl bg-gray-50 border border-gray-200 text-xs text-[#342A24] leading-relaxed whitespace-pre-line">
                  {selectedMessage.message}
                </div>
              </div>

              {/* Fast Actions */}
              <div className="pt-2 border-t border-[#F0E5D8] flex flex-col sm:flex-row gap-2">
                <a
                  href={`mailto:${selectedMessage.email}?subject=Phản hồi từ Mầm Mơ - Dự án Gieo Mơ&body=Chào ${encodeURIComponent(selectedMessage.name)},\n\nCảm ơn bạn đã gửi lời nhắn cho Mầm Mơ.\n\n`}
                  onClick={() => handleStatusChange(selectedMessage.id, "replied")}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-[#2D6338] hover:bg-[#23502d] text-white font-bold text-xs flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer text-center"
                >
                  <Reply className="w-4 h-4" />
                  <span>Soạn email trả lời</span>
                </a>

                {selectedMessage.phone && (
                  <a
                    href={`tel:${selectedMessage.phone}`}
                    className="py-2.5 px-4 rounded-xl bg-[#FFF8EE] hover:bg-[#f6ebd9] border border-[#F0E5D8] text-[#542B07] font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer text-center"
                  >
                    <Phone className="w-4 h-4 text-[#2D6338]" />
                    <span>Gọi điện</span>
                  </a>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-3xl p-12 border border-[#F0E5D8] shadow-soft text-center text-gray-400 space-y-2">
              <Mail className="w-10 h-10 mx-auto text-gray-300" />
              <p className="text-xs font-medium">Chọn một tin nhắn từ danh sách để xem chi tiết và phản hồi</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
