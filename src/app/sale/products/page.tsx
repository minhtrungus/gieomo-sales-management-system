"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { Search, Boxes, PackagePlus, CheckCircle, XCircle } from "lucide-react";
import { getStoredProducts } from "@/lib/data/orderStore";
import { MoneyDisplay } from "@/components/ui/MoneyDisplay";
import type { Product } from "@/types/database";

export default function SaleProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    setProducts(getStoredProducts());
  }, []);

  const filteredProducts = products.filter((p) => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = p.name.toLowerCase().includes(q);
      const matchDesc = p.description?.toLowerCase().includes(q);
      return matchName || matchDesc;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-heading font-extrabold text-2xl text-[#231B16]">
            Tra Cứu Bảng Giá Sản Phẩm
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Bảng giá và tình trạng hàng giúp thành viên tư vấn và tạo đơn hộ cho khách.
          </p>
        </div>

        <Link
          href="/sale/create-order"
          className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-2xl bg-[#16381D] hover:bg-[#234E2B] text-white text-xs font-bold transition-all shadow-xs"
        >
          <PackagePlus className="w-4 h-4" />
          <span>+ Nhập đơn hộ</span>
        </Link>
      </div>

      {/* Search Bar */}
      <div className="bg-white p-4 rounded-3xl border border-gray-100 shadow-xs">
        <div className="relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Tìm kiếm tên sản phẩm, công dụng..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-10 pl-10 pr-4 rounded-2xl border border-gray-200 bg-gray-50 text-xs text-gray-800 focus:outline-none focus:border-emerald-600 focus:bg-white"
          />
        </div>
      </div>

      {/* Products Grid */}
      {filteredProducts.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredProducts.map((p) => {
            const imgUrl = p.images?.[0] || p.thumbnail || "/images/placeholder.jpg";
            const isAvailable = p.status === "active";

            return (
              <div
                key={p.product_id}
                className="bg-white rounded-3xl p-5 border border-gray-100 shadow-xs flex flex-col justify-between space-y-4 hover:border-emerald-200 transition-all"
              >
                <div className="flex gap-4">
                  <div className="relative w-20 h-20 rounded-2xl overflow-hidden bg-gray-100 shrink-0 border border-gray-100">
                    <Image
                      src={imgUrl}
                      alt={p.name}
                      fill
                      sizes="80px"
                      className="object-cover"
                    />
                  </div>

                  <div className="flex-1 min-w-0">
                    <h3 className="font-heading font-extrabold text-sm text-[#231B16] line-clamp-2">
                      {p.name}
                    </h3>
                    <div className="mt-1 flex items-baseline gap-2">
                      <MoneyDisplay
                        amount={p.price}
                        className="font-extrabold text-base text-[#16381D]"
                      />
                      {p.compare_at_price && p.compare_at_price > p.price && (
                        <span className="text-xs text-gray-400 line-through">
                          {p.compare_at_price.toLocaleString("vi-VN")}đ
                        </span>
                      )}
                    </div>

                    {/* Status badge */}
                    <div className="mt-2">
                      {isAvailable ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                          <CheckCircle className="w-3 h-3" />
                          <span>Đang mở bán</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-red-700 bg-red-50 px-2 py-0.5 rounded-md border border-red-200">
                          <XCircle className="w-3 h-3" />
                          <span>Tạm ngưng</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Variants preview if any */}
                {p.variants && p.variants.length > 0 && (
                  <div className="pt-2 border-t border-gray-100">
                    <span className="text-[10px] text-gray-400 font-bold uppercase block mb-1">
                      Phân loại ({p.variants.length})
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {p.variants.map((v) => (
                        <span
                          key={v.variant_id}
                          className="text-[11px] bg-gray-50 border border-gray-200 px-2 py-0.5 rounded-lg text-gray-700 font-medium"
                        >
                          {v.name} ({(v.price ?? p.price).toLocaleString("vi-VN")}đ)
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Quick Action Button */}
                <div className="pt-2 border-t border-gray-100">
                  <Link
                    href={`/sale/create-order?productId=${p.product_id}`}
                    className="w-full py-2 rounded-xl bg-gray-50 hover:bg-[#16381D] text-gray-700 hover:text-white font-bold text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <PackagePlus className="w-3.5 h-3.5" />
                    <span>Tạo đơn hộ với món này</span>
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-white rounded-3xl p-12 text-center border border-gray-100 shadow-xs space-y-2">
          <Boxes className="w-10 h-10 text-gray-300 mx-auto" />
          <h3 className="font-bold text-sm text-gray-700">Không tìm thấy sản phẩm nào</h3>
          <p className="text-xs text-gray-400">Vui lòng kiểm tra lại từ khóa tìm kiếm.</p>
        </div>
      )}
    </div>
  );
}
