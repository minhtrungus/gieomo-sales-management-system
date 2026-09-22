"use client";

import { useState } from "react";
import { MOCK_PRODUCTS } from "@/lib/data/mockData";
import { Search, AlertTriangle, Plus, Minus, PackagePlus, CheckCircle2, History, X } from "lucide-react";

interface InflowLog {
  logId: string;
  receiptCode: string;
  productName: string;
  variantName: string;
  quantityAdded: number;
  stockBefore: number;
  stockAfter: number;
  unitCost: number;
  approvedBy: string;
  sourceNote: string;
  createdAt: string;
}

export default function AdminInventoryPage() {
  const [products, setProducts] = useState(MOCK_PRODUCTS);
  const [searchQuery, setSearchQuery] = useState("");

  // Modal State for Bulk Inflow
  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState(products[0]?.product_id || "");
  const [selectedVariantId, setSelectedVariantId] = useState(products[0]?.variants?.[0]?.variant_id || "");
  const [importQty, setImportQty] = useState<number>(50);
  const [unitCost, setUnitCost] = useState<number>(35000);
  const [approvedBy, setApprovedBy] = useState("Ban Quản lý Kho — Mầm Mơ");
  const [sourceNote, setSourceNote] = useState("Xưởng may tình nguyện viên Mầm Mơ đợt 2");

  // Inflow Logs State
  const [inflowLogs, setInflowLogs] = useState<InflowLog[]>([
    {
      logId: "log-1",
      receiptCode: "PNK-260901",
      productName: "Pouch Mầm Mơ",
      variantName: "Màu hồng pastel",
      quantityAdded: 50,
      stockBefore: 10,
      stockAfter: 60,
      unitCost: 35000,
      approvedBy: "Trưởng ban Quản lý Kho",
      sourceNote: "Xưởng may thủ công Mầm Mơ đợt 1",
      createdAt: "10:30 20/09/2026",
    },
    {
      logId: "log-2",
      receiptCode: "PNK-260902",
      productName: "Kẹp tóc Nút Áo Mầm",
      variantName: "Nút vàng Butter",
      quantityAdded: 100,
      stockBefore: 20,
      stockAfter: 120,
      unitCost: 15000,
      approvedBy: "Ban Hậu cần Mầm Mơ",
      sourceNote: "Tình nguyện viên may tay bổ sung",
      createdAt: "14:15 21/09/2026",
    },
  ]);

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

  const handleBulkImportSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (importQty <= 0) return;

    const prod = products.find((p) => p.product_id === selectedProductId);
    const variant = prod?.variants?.find((v) => v.variant_id === selectedVariantId);

    if (!prod || !variant) return;

    const stockBefore = variant.stock;
    const stockAfter = stockBefore + importQty;

    // Update product stock
    handleStockUpdate(selectedProductId, selectedVariantId, importQty);

    // Record Inflow Log
    const today = new Date();
    const hours = String(today.getHours()).padStart(2, "0");
    const minutes = String(today.getMinutes()).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const year = today.getFullYear();
    const timeStr = `${hours}:${minutes} ${day}/${month}/${year}`;

    const newLog: InflowLog = {
      logId: `log-${Date.now()}`,
      receiptCode: `PNK-${Math.floor(100000 + Math.random() * 900000)}`,
      productName: prod.name,
      variantName: variant.name,
      quantityAdded: importQty,
      stockBefore,
      stockAfter,
      unitCost,
      approvedBy,
      sourceNote,
      createdAt: timeStr,
    };

    setInflowLogs([newLog, ...inflowLogs]);
    setIsBulkImportOpen(false);
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

  const selectedProductVariants =
    products.find((p) => p.product_id === selectedProductId)?.variants || [];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-heading font-extrabold text-2xl text-[#231B16]">
            Kiểm kho & Quản lý nhập hàng
          </h1>
          <p className="text-xs text-[#7E7068] mt-0.5">
            Theo dõi số lượng tồn kho, tạo phiếu nhập hàng số lượng lớn và lưu trữ lịch sử duyệt của BTC.
          </p>
        </div>

        <button
          onClick={() => setIsBulkImportOpen(true)}
          className="px-5 py-2.5 rounded-full bg-[#BFE9C3] hover:bg-[#aee0b3] text-[#16381D] font-extrabold text-xs flex items-center gap-2 shadow-xs transition-all border border-[#9ed4a3] active:scale-95 cursor-pointer"
        >
          <PackagePlus className="w-4 h-4" />
          <span>Nhập hàng số lượng lớn (Phiếu nhập kho)</span>
        </button>
      </div>

      {/* Search Bar */}
      <div className="bg-white rounded-3xl p-4 border border-[#F0E5D8] shadow-soft flex items-center justify-between">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm theo sản phẩm, SKU..."
            className="w-full pl-9 pr-4 py-2 rounded-xl border border-[#F0E5D8] text-xs outline-none focus:border-[#FFB98A] bg-[#FFFDF9]"
          />
        </div>
      </div>

      {/* Inventory Table */}
      <div className="bg-white rounded-3xl border border-[#F0E5D8] shadow-soft overflow-hidden space-y-2">
        <div className="p-4 border-b border-[#F0E5D8] bg-[#FFF8EE] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-base">📦</span>
            <h2 className="font-heading font-extrabold text-sm text-[#231B16]">
              Bảng tồn kho hiện tại ({inventoryRows.length} phân loại)
            </h2>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-[11px]">
            <thead>
              <tr className="border-b border-[#F0E5D8] text-[#7E7068] font-bold uppercase tracking-wider bg-white text-[10px]">
                <th className="py-2.5 px-2.5 text-center w-10">STT</th>
                <th className="py-2.5 px-3">Sản phẩm</th>
                <th className="py-2.5 px-2.5">Phân loại</th>
                <th className="py-2.5 px-2.5">SKU</th>
                <th className="py-2.5 px-2.5">Tồn kho hiện tại</th>
                <th className="py-2.5 px-2.5">Trạng thái kho</th>
                <th className="py-2.5 px-3 text-right">Điều chỉnh nhanh</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0E5D8]">
              {inventoryRows.map((row, idx) => {
                const isLowStock = row.stock <= 10;
                return (
                  <tr key={row.variantId} className="hover:bg-[#FFFDF9] transition-colors">
                    <td className="py-2.5 px-2.5 text-center text-[#7E7068] font-bold text-[11px]">
                      {idx + 1}
                    </td>
                    <td className="py-2.5 px-3 font-bold text-[#231B16] text-xs">
                      {row.productName}
                    </td>

                    <td className="py-2.5 px-2.5 font-semibold text-[#2D6338] text-[10.5px]">
                      {row.variantName}
                    </td>

                    <td className="py-2.5 px-2.5 font-mono text-[#7E7068] text-[10.5px]">
                      {row.sku}
                    </td>

                    <td className="py-2.5 px-2.5 font-extrabold text-xs text-[#1B3622]">
                      {row.stock} món
                    </td>

                    <td className="py-2.5 px-2.5 whitespace-nowrap">
                      {isLowStock ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#FFE7A8] text-[#542B07] text-[10px] font-bold border border-[#ebd089]">
                          <AlertTriangle className="w-2.5 h-2.5 text-[#E2884E]" /> Sắp hết
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#BFE9C3] text-[#16381D] text-[10px] font-bold border border-[#9ed4a3]">
                          ✓ Đủ hàng
                        </span>
                      )}
                    </td>

                    <td className="py-2.5 px-3 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleStockUpdate(row.productId, row.variantId, -1)}
                          className="w-7 h-7 rounded-lg border border-[#F0E5D8] bg-white hover:bg-gray-100 text-gray-700 flex items-center justify-center font-bold text-sm transition-colors cursor-pointer"
                          title="Giảm 1"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleStockUpdate(row.productId, row.variantId, +1)}
                          className="w-7 h-7 rounded-lg border border-[#BFE9C3] bg-[#E6F7EC] hover:bg-[#BFE9C3] text-[#16381D] flex items-center justify-center font-bold text-sm transition-colors cursor-pointer"
                          title="Tăng 1"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleStockUpdate(row.productId, row.variantId, +10)}
                          className="px-2.5 py-1 rounded-lg bg-[#BFE9C3] text-[#16381D] font-extrabold text-[11px] hover:bg-[#aee0b3] transition-colors cursor-pointer shadow-2xs border border-[#9ed4a3]"
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

      {/* SECTION: LỊCH SỬ NHẬP KHO ĐÃ DUYỆT CỦA BTC */}
      <div className="bg-white rounded-3xl border border-[#F0E5D8] shadow-soft overflow-hidden space-y-2">
        <div className="p-4 border-b border-[#F0E5D8] bg-[#FFF8EE] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-[#2D6338]" />
            <h2 className="font-heading font-extrabold text-sm text-[#231B16]">
              Lịch sử nhập kho đã duyệt của Ban Tổ Chức ({inflowLogs.length} đợt)
            </h2>
          </div>
          <span className="text-[11px] text-[#7E7068]">Ghi nhận tự động khi duyệt phiếu nhập kho</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-[11px]">
            <thead>
              <tr className="border-b border-[#F0E5D8] text-[#7E7068] font-bold uppercase tracking-wider bg-white text-[10px]">
                <th className="py-2.5 px-2.5 text-center w-10">STT</th>
                <th className="py-2.5 px-3">Mã phiếu</th>
                <th className="py-2.5 px-2.5">Thời gian duyệt</th>
                <th className="py-2.5 px-2.5">Sản phẩm & Phân loại</th>
                <th className="py-2.5 px-2.5">Số lượng</th>
                <th className="py-2.5 px-2.5">Biến động</th>
                <th className="py-2.5 px-2.5">Người duyệt</th>
                <th className="py-2.5 px-2.5">Nguồn / Ghi chú</th>
                <th className="py-2.5 px-3 text-right">Trạng thái</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0E5D8]">
              {inflowLogs.map((log, idx) => (
                <tr key={log.logId} className="hover:bg-[#FFFDF9] transition-colors">
                  <td className="py-2.5 px-2.5 text-center text-[#7E7068] font-bold text-[11px]">
                    {idx + 1}
                  </td>
                  <td className="py-2.5 px-3 font-mono font-bold text-[#1B3622] text-xs whitespace-nowrap">
                    {log.receiptCode}
                  </td>
                  <td className="py-2.5 px-2.5 text-[#7E7068] font-medium whitespace-nowrap text-[10.5px]">
                    {log.createdAt}
                  </td>
                  <td className="py-2.5 px-2.5">
                    <span className="font-bold text-[#342A24] block text-xs">{log.productName}</span>
                    <span className="text-[10px] text-[#2D6338] block font-semibold">{log.variantName}</span>
                  </td>
                  <td className="py-2.5 px-2.5 font-extrabold text-xs text-[#2D6338] whitespace-nowrap">
                    +{log.quantityAdded} chiếc
                  </td>
                  <td className="py-2.5 px-2.5 font-medium text-[#7E7068] whitespace-nowrap text-[10.5px]">
                    {log.stockBefore} ➔ <strong className="text-[#1B3622]">{log.stockAfter} món</strong>
                  </td>
                  <td className="py-2.5 px-2.5 font-bold text-[#342A24] whitespace-nowrap text-xs">
                    {log.approvedBy}
                  </td>
                  <td className="py-2.5 px-2.5 text-[#5C4D44] max-w-[160px] truncate text-[10.5px]">
                    {log.sourceNote}
                  </td>
                  <td className="py-2.5 px-3 text-right whitespace-nowrap">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#E6F7EC] text-[#1B5E20] text-[10px] font-extrabold border border-[#A5D6A7]">
                      <CheckCircle2 className="w-2.5 h-2.5" /> Đã nhập
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL: NHẬP HÀNG SỐ LƯỢNG LỚN (PHIẾU NHẬP KHO) */}
      {isBulkImportOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-lg bg-white rounded-3xl p-6 sm:p-7 border border-[#F0E5D8] shadow-2xl space-y-5 animate-in zoom-in-95 text-left">
            <div className="flex items-center justify-between border-b border-[#F0E5D8] pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-[#BFE9C3] flex items-center justify-center text-[#16381D]">
                  <PackagePlus className="w-4 h-4" />
                </div>
                <h3 className="font-heading font-extrabold text-lg text-[#231B16]">
                  Tạo phiếu nhập hàng số lượng lớn
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsBulkImportOpen(false)}
                className="p-1.5 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleBulkImportSubmit} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-[#342A24] block">Chọn sản phẩm nhập *</label>
                  <select
                    value={selectedProductId}
                    onChange={(e) => {
                      setSelectedProductId(e.target.value);
                      const prod = products.find((p) => p.product_id === e.target.value);
                      if (prod?.variants?.[0]) {
                        setSelectedVariantId(prod.variants[0].variant_id);
                      }
                    }}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#F0E5D8] text-xs outline-none focus:border-[#FFB98A] bg-white font-bold text-[#342A24]"
                  >
                    {products.map((p) => (
                      <option key={p.product_id} value={p.product_id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-[#342A24] block">Chọn phân loại (Variant) *</label>
                  <select
                    value={selectedVariantId}
                    onChange={(e) => setSelectedVariantId(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#F0E5D8] text-xs outline-none focus:border-[#FFB98A] bg-white font-bold text-[#342A24]"
                  >
                    {selectedProductVariants.map((v) => (
                      <option key={v.variant_id} value={v.variant_id}>
                        {v.name} (Hiện có: {v.stock})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Import Quantity with quick increment buttons */}
              <div className="space-y-1.5">
                <label className="font-bold text-[#342A24] block">Số lượng nhập bổ sung (món/chiếc) *</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    value={importQty}
                    onChange={(e) => setImportQty(Math.max(1, Number(e.target.value)))}
                    className="w-32 px-3.5 py-2.5 rounded-xl border border-[#F0E5D8] text-sm font-extrabold text-[#1B3622] outline-none focus:border-[#FFB98A] bg-[#FFFDF9]"
                  />
                  <div className="flex items-center gap-1.5">
                    {[20, 50, 100, 200, 500].map((qty) => (
                      <button
                        key={qty}
                        type="button"
                        onClick={() => setImportQty(qty)}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                          importQty === qty
                            ? "bg-[#1B3622] text-white"
                            : "bg-[#FFF8EE] border border-[#F0E5D8] text-[#5C4D44] hover:bg-[#FFE7A8]"
                        }`}
                      >
                        +{qty}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-[#342A24] block">Giá vốn nhập (VNĐ/món)</label>
                  <input
                    type="number"
                    value={unitCost}
                    onChange={(e) => setUnitCost(Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#F0E5D8] text-xs outline-none focus:border-[#FFB98A] font-semibold"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-[#342A24] block">Người đại diện BTC phê duyệt *</label>
                  <input
                    type="text"
                    value={approvedBy}
                    onChange={(e) => setApprovedBy(e.target.value)}
                    required
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#F0E5D8] text-xs outline-none focus:border-[#FFB98A] font-semibold"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-[#342A24] block">Xưởng may / Ghi chú đợt hàng</label>
                <input
                  type="text"
                  value={sourceNote}
                  onChange={(e) => setSourceNote(e.target.value)}
                  placeholder="Ví dụ: Xưởng may đợt 2, tình nguyện viên may..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#F0E5D8] text-xs outline-none focus:border-[#FFB98A]"
                />
              </div>

              <div className="p-3.5 rounded-2xl bg-[#FFF8EE] border border-[#F0E5D8] text-[11px] text-[#7E7068] leading-relaxed">
                🛡️ <strong>Cơ chế bảo vệ kho:</strong> Số lượng nhập sẽ được cộng dồn ngay lập tức vào kho hàng. Mọi giao dịch nhập kho đều được lưu vào lịch sử kiểm toán của Ban Tổ Chức.
              </div>

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsBulkImportOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100 cursor-pointer"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-full bg-[#BFE9C3] hover:bg-[#aee0b3] text-[#16381D] font-extrabold text-xs shadow-xs border border-[#9ed4a3] transition-all cursor-pointer"
                >
                  Phê duyệt & Nhập kho ➔
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
