"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { MoneyDisplay } from "@/components/ui/MoneyDisplay";
import { Badge } from "@/components/ui/Badge";
import { MOCK_PRODUCTS } from "@/lib/data/mockData";
import { Plus, Search, Edit3, Trash2 } from "lucide-react";

export default function AdminProductsPage() {
  const [products, setProducts] = useState(MOCK_PRODUCTS);
  const [searchQuery, setSearchQuery] = useState("");

  const filteredProducts = products.filter((p) => {
    if (
      searchQuery.trim() !== "" &&
      !p.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
      !p.slug.toLowerCase().includes(searchQuery.toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  const handleToggleStatus = (productId: string) => {
    setProducts((prev) =>
      prev.map((p) =>
        p.product_id === productId
          ? { ...p, status: p.status === "active" ? "draft" : "active" }
          : p
      )
    );
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-heading font-extrabold text-2xl text-emerald-950">
            Quản lý sản phẩm & Phân loại
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Danh sách tất cả các sản phẩm gây quỹ handmade và vật phẩm lưu niệm.
          </p>
        </div>

        <Link
          href="/admin/products/new"
          className="px-4 py-2.5 rounded-2xl bg-emerald-900 hover:bg-emerald-950 text-white font-bold text-xs flex items-center gap-2 shadow-xs transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>+ Thêm sản phẩm mới</span>
        </Link>
      </div>

      {/* Search & Filter */}
      <div className="bg-white rounded-3xl p-4 border border-gray-200/80 shadow-2xs flex items-center justify-between">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm tên sản phẩm, slug..."
            className="w-full pl-9 pr-4 py-2 rounded-xl border border-gray-200 text-xs outline-none focus:border-soft-green"
          />
        </div>
      </div>

      {/* Products Table */}
      <div className="bg-white rounded-3xl border border-gray-200/80 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-gray-500 font-semibold uppercase">
                <th className="py-3 px-4">Sản phẩm</th>
                <th className="py-3 px-4">Danh mục</th>
                <th className="py-3 px-4">Giá bán / Giá gốc</th>
                <th className="py-3 px-4">Tổng tồn kho</th>
                <th className="py-3 px-4">Trạng thái</th>
                <th className="py-3 px-4 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredProducts.map((p) => {
                const totalStock = p.variants?.reduce((sum, v) => sum + v.stock, 0) ?? 10;
                return (
                  <tr key={p.product_id} className="hover:bg-emerald-50/30 transition-colors">
                    <td className="py-3.5 px-4 flex items-center gap-3">
                      <div className="relative w-12 h-12 rounded-xl bg-cream border border-emerald-100 overflow-hidden shrink-0 flex items-center justify-center text-lg">
                        {p.images?.[0] ? (
                          <Image src={p.images[0]} alt="" fill className="object-cover" />
                        ) : (
                          <span>🌱</span>
                        )}
                      </div>
                      <div>
                        <span className="font-bold text-gray-900 block">{p.name}</span>
                        <span className="text-[11px] text-gray-500 font-mono">/{p.slug}</span>
                      </div>
                    </td>

                    <td className="py-3.5 px-4 font-semibold text-gray-700">
                      {p.category?.name ?? "Chưa phân loại"}
                    </td>

                    <td className="py-3.5 px-4">
                      <MoneyDisplay amount={p.price} className="font-bold text-emerald-950 block" />
                      {p.cost_price && (
                        <span className="text-[10px] text-gray-400 block">
                          Giá vốn: <MoneyDisplay amount={p.cost_price} />
                        </span>
                      )}
                    </td>

                    <td className="py-3.5 px-4">
                      <span className={`font-bold ${totalStock <= 10 ? "text-amber-600" : "text-gray-900"}`}>
                        {totalStock} sản phẩm
                      </span>
                    </td>

                    <td className="py-3.5 px-4">
                      <button
                        onClick={() => handleToggleStatus(p.product_id)}
                        className="cursor-pointer"
                        title="Bấm để đổi trạng thái"
                      >
                        <Badge variant={p.status === "active" ? "success" : "default"}>
                          {p.status === "active" ? "Đang bán" : "Nháp"}
                        </Badge>
                      </button>
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button className="p-1.5 rounded-lg text-gray-500 hover:text-emerald-800 hover:bg-emerald-50 transition-colors">
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button className="p-1.5 rounded-lg text-gray-500 hover:text-red-600 hover:bg-red-50 transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
