"use client";

import { useState } from "react";
import { MOCK_PRODUCTS } from "@/lib/data/mockData";
import { Search, AlertTriangle, Plus, Minus } from "lucide-react";

export default function AdminInventoryPage() {
  const [products, setProducts] = useState(MOCK_PRODUCTS);
  const [searchQuery, setSearchQuery] = useState("");

  const handleStockUpdate = (productId: string, variantId: string, delta: number) => {
    setProducts((prev) =>
      prev.map((p) => {
        if (p.product_id !== productId) return p;
        return {
          ...p,
          variants: p.variants?.map((v) =>
            v.variant_id === variantId ? { ...v, stock: Math.max(0, v.stock + delta) } : v
          ),
        };
      })
    );
  };

  const inventoryRows = products.flatMap((p) =>
    (p.variants || []).map((v) => ({
      productId: p.product_id,
      variantId: v.variant_id,
      productName: p.name,
      variantName: v.name,
      sku: v.sku || "N/A",
      stock: v.stock,
    }))
  ).filter((item) => {
    if (
      searchQuery.trim() !== "" &&
      !item.productName.toLowerCase().includes(searchQuery.toLowerCase()) &&
      !item.sku.toLowerCase().includes(searchQuery.toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-heading font-extrabold text-2xl text-emerald-950">
          Kiểm kho & Điều chỉnh số lượng
        </h1>
        <p className="text-xs text-gray-500 mt-0.5">
          Quản lý số lượng tồn kho của từng phân loại sản phẩm. Đảm bảo kho không bị âm.
        </p>
      </div>

      {/* Search Bar */}
      <div className="bg-white rounded-3xl p-4 border border-gray-200/80 shadow-2xs flex items-center justify-between">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm theo sản phẩm, SKU..."
            className="w-full pl-9 pr-4 py-2 rounded-xl border border-gray-200 text-xs outline-none focus:border-soft-green"
          />
        </div>
      </div>

      {/* Inventory Table */}
      <div className="bg-white rounded-3xl border border-gray-200/80 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-gray-500 font-semibold uppercase">
                <th className="py-3 px-4">Sản phẩm</th>
                <th className="py-3 px-4">Phân loại</th>
                <th className="py-3 px-4">SKU</th>
                <th className="py-3 px-4">Tồn kho hiện tại</th>
                <th className="py-3 px-4">Trạng thái kho</th>
                <th className="py-3 px-4 text-right">Điều chỉnh kho</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {inventoryRows.map((row) => {
                const isLowStock = row.stock <= 10;
                return (
                  <tr key={row.variantId} className="hover:bg-emerald-50/30 transition-colors">
                    <td className="py-3.5 px-4 font-bold text-gray-900">
                      {row.productName}
                    </td>

                    <td className="py-3.5 px-4 font-medium text-emerald-800">
                      {row.variantName}
                    </td>

                    <td className="py-3.5 px-4 font-mono text-gray-500">
                      {row.sku}
                    </td>

                    <td className="py-3.5 px-4 font-extrabold text-sm text-emerald-950">
                      {row.stock} món
                    </td>

                    <td className="py-3.5 px-4">
                      {isLowStock ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 text-[11px] font-bold">
                          <AlertTriangle className="w-3 h-3" /> Sắp hết hàng
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-bold">
                          ✓ Đủ hàng
                        </span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleStockUpdate(row.productId, row.variantId, -1)}
                          className="w-7 h-7 rounded-lg border border-gray-200 bg-white hover:bg-gray-100 text-gray-700 flex items-center justify-center font-bold text-sm transition-colors"
                          title="Giảm 1"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleStockUpdate(row.productId, row.variantId, +1)}
                          className="w-7 h-7 rounded-lg border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-950 flex items-center justify-center font-bold text-sm transition-colors"
                          title="Tăng 1"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleStockUpdate(row.productId, row.variantId, +10)}
                          className="px-2 py-1 rounded-lg bg-soft-green text-emerald-950 font-bold text-[11px] hover:bg-emerald-300 transition-colors"
                        >
                          +10
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
