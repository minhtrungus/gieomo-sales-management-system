"use client";

import { useState, useMemo } from "react";
import { useDebounce } from "@/lib/hooks/useDebounce";
import { MOCK_PRODUCTS, MOCK_WAREHOUSES } from "@/lib/data/mockData";
import {
  Search,
  AlertTriangle,
  Plus,
  Minus,
  PackagePlus,
  CheckCircle2,
  X,
  ArrowLeftRight,
  Building,
  Truck,
  Check,
} from "lucide-react";

interface InflowLog {
  logId: string;
  receiptCode: string;
  warehouseId: string;
  warehouseName: string;
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

interface TransferLog {
  logId: string;
  transferCode: string;
  productName: string;
  variantName: string;
  fromWarehouse: string;
  toWarehouse: string;
  quantity: number;
  approvedBy: string;
  reason: string;
  createdAt: string;
}

export default function AdminInventoryPage() {
  // Initialize products with warehouse distribution if not set
  const [products, setProducts] = useState(() => {
    return MOCK_PRODUCTS.map((p) => ({
      ...p,
      variants: p.variants?.map((v) => {
        const wh1 = v.stock_warehouse_1 ?? Math.ceil(v.stock * 0.7);
        const wh2 = v.stock_warehouse_2 ?? (v.stock - wh1);
        return {
          ...v,
          stock_warehouse_1: wh1,
          stock_warehouse_2: wh2,
          stock: wh1 + wh2,
        };
      }),
    }));
  });

  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebounce(searchQuery, 250);
  const [selectedWarehouseFilter, setSelectedWarehouseFilter] = useState<"all" | "wh-1" | "wh-2">("all");
  const [activeLogTab, setActiveLogTab] = useState<"inflow" | "transfer">("inflow");

  // Modal State for Bulk Inflow
  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false);
  const [importWarehouseId, setImportWarehouseId] = useState<string>("wh-1");
  const [selectedProductId, setSelectedProductId] = useState(products[0]?.product_id || "");
  const [selectedVariantId, setSelectedVariantId] = useState(products[0]?.variants?.[0]?.variant_id || "");
  const [importQty, setImportQty] = useState<number>(50);
  const [unitCost, setUnitCost] = useState<number>(35000);
  const [approvedBy, setApprovedBy] = useState("Mai Lan (Trưởng Kho)");
  const [sourceNote, setSourceNote] = useState("Xưởng may tình nguyện viên Mầm Mơ đợt 2");

  // Modal State for Inter-Warehouse Transfer
  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [transferProductId, setTransferProductId] = useState(products[0]?.product_id || "");
  const [transferVariantId, setTransferVariantId] = useState(products[0]?.variants?.[0]?.variant_id || "");
  const [fromWarehouse, setFromWarehouse] = useState<"wh-1" | "wh-2">("wh-1");
  const [toWarehouse, setToWarehouse] = useState<"wh-1" | "wh-2">("wh-2");
  const [transferQty, setTransferQty] = useState<number>(10);
  const [transferApprovedBy, setTransferApprovedBy] = useState("Thế Vinh (Điều Phối Kho)");
  const [transferReason, setTransferReason] = useState("Chi viện cho bàn trực KTX Thủ Đức cuối tuần");
  const [transferError, setTransferError] = useState<string | null>(null);

  // Inflow Logs State
  const [inflowLogs, setInflowLogs] = useState<InflowLog[]>([
    {
      logId: "log-1",
      receiptCode: "PNK-260901",
      warehouseId: "wh-1",
      warehouseName: "Kho Trung Tâm (Quận 3)",
      productName: "Pouch Mầm Mơ",
      variantName: "Màu hồng pastel",
      quantityAdded: 50,
      stockBefore: 10,
      stockAfter: 60,
      unitCost: 35000,
      approvedBy: "Mai Lan (Trưởng Kho)",
      sourceNote: "Xưởng may thủ công Mầm Mơ đợt 1",
      createdAt: "10:30 20/09/2026",
    },
    {
      logId: "log-2",
      receiptCode: "PNK-260902",
      warehouseId: "wh-2",
      warehouseName: "Kho Cơ Sở 2 (Thủ Đức)",
      productName: "Kẹp tóc Nút Áo Mầm",
      variantName: "Nút vàng Butter",
      quantityAdded: 100,
      stockBefore: 20,
      stockAfter: 120,
      unitCost: 15000,
      approvedBy: "Thế Vinh (Điều Phối)",
      sourceNote: "Tình nguyện viên may tay bổ sung",
      createdAt: "14:15 21/09/2026",
    },
  ]);

  // Transfer Logs State (Inter-warehouse transfer)
  const [transferLogs, setTransferLogs] = useState<TransferLog[]>([
    {
      logId: "tf-1",
      transferCode: "DCK-260901",
      productName: "Pouch Mầm Mơ",
      variantName: "Màu hồng pastel",
      fromWarehouse: "Kho Trung Tâm (Quận 3)",
      toWarehouse: "Kho Cơ Sở 2 (Thủ Đức)",
      quantity: 15,
      approvedBy: "Ban Hậu Cần",
      reason: "Bổ sung hàng mẫu phục vụ gian hàng KTX Khu B",
      createdAt: "09:00 22/09/2026",
    },
  ]);

  // Update stock for a specific warehouse
  const handleStockUpdate = (
    productId: string,
    variantId: string,
    targetWh: "wh-1" | "wh-2",
    delta: number
  ) => {
    setProducts((prev) =>
      prev.map((p) => {
        if (p.product_id !== productId) return p;
        return {
          ...p,
          variants: p.variants?.map((v) => {
            if (v.variant_id !== variantId) return v;
            let wh1 = v.stock_warehouse_1 ?? 0;
            let wh2 = v.stock_warehouse_2 ?? 0;

            if (targetWh === "wh-1") {
              wh1 = Math.max(0, wh1 + delta);
            } else {
              wh2 = Math.max(0, wh2 + delta);
            }

            return {
              ...v,
              stock_warehouse_1: wh1,
              stock_warehouse_2: wh2,
              stock: wh1 + wh2,
            };
          }),
        };
      })
    );
  };

  // Submit Bulk Inflow
  const handleBulkImportSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (importQty <= 0) return;

    const prod = products.find((p) => p.product_id === selectedProductId);
    const variant = prod?.variants?.find((v) => v.variant_id === selectedVariantId);

    if (!prod || !variant) return;

    const whName = importWarehouseId === "wh-2" ? "Kho Cơ Sở 2 (Thủ Đức)" : "Kho Trung Tâm (Quận 3)";
    const currentWhStock = importWarehouseId === "wh-2" ? (variant.stock_warehouse_2 ?? 0) : (variant.stock_warehouse_1 ?? 0);
    const stockBefore = currentWhStock;
    const stockAfter = stockBefore + importQty;

    // Update specific warehouse stock
    handleStockUpdate(selectedProductId, selectedVariantId, importWarehouseId as "wh-1" | "wh-2", importQty);

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
      warehouseId: importWarehouseId,
      warehouseName: whName,
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

  // Open transfer modal for a specific row
  const handleOpenTransferForProduct = (prodId: string, varId: string) => {
    setTransferProductId(prodId);
    setTransferVariantId(varId);
    setTransferError(null);
    setIsTransferOpen(true);
  };

  // Submit Inter-Warehouse Transfer
  const handleTransferSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTransferError(null);

    if (fromWarehouse === toWarehouse) {
      setTransferError("Kho xuất và Kho nhận không được trùng nhau!");
      return;
    }

    if (transferQty <= 0) {
      setTransferError("Số lượng điều chuyển phải lớn hơn 0.");
      return;
    }

    const prod = products.find((p) => p.product_id === transferProductId);
    const variant = prod?.variants?.find((v) => v.variant_id === transferVariantId);

    if (!prod || !variant) {
      setTransferError("Không tìm thấy sản phẩm cần chuyển.");
      return;
    }

    const availableStock = fromWarehouse === "wh-1" ? (variant.stock_warehouse_1 ?? 0) : (variant.stock_warehouse_2 ?? 0);
    if (transferQty > availableStock) {
      setTransferError(`Kho xuất chỉ còn ${availableStock} sản phẩm, không đủ ${transferQty} để chuyển.`);
      return;
    }

    // Perform atomic-like transfer in state: deduct from fromWarehouse, add to toWarehouse
    setProducts((prev) =>
      prev.map((p) => {
        if (p.product_id !== transferProductId) return p;
        return {
          ...p,
          variants: p.variants?.map((v) => {
            if (v.variant_id !== transferVariantId) return v;
            let wh1 = v.stock_warehouse_1 ?? 0;
            let wh2 = v.stock_warehouse_2 ?? 0;

            if (fromWarehouse === "wh-1") {
              wh1 -= transferQty;
              wh2 += transferQty;
            } else {
              wh2 -= transferQty;
              wh1 += transferQty;
            }

            return {
              ...v,
              stock_warehouse_1: wh1,
              stock_warehouse_2: wh2,
              stock: wh1 + wh2,
            };
          }),
        };
      })
    );

    // Record Transfer Log
    const today = new Date();
    const hours = String(today.getHours()).padStart(2, "0");
    const minutes = String(today.getMinutes()).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const year = today.getFullYear();
    const timeStr = `${hours}:${minutes} ${day}/${month}/${year}`;

    const fromName = fromWarehouse === "wh-1" ? "Kho Trung Tâm (Quận 3)" : "Kho Cơ Sở 2 (Thủ Đức)";
    const toName = toWarehouse === "wh-1" ? "Kho Trung Tâm (Quận 3)" : "Kho Cơ Sở 2 (Thủ Đức)";

    const newTransferLog: TransferLog = {
      logId: `tf-${Date.now()}`,
      transferCode: `DCK-${Math.floor(100000 + Math.random() * 900000)}`,
      productName: prod.name,
      variantName: variant.name,
      fromWarehouse: fromName,
      toWarehouse: toName,
      quantity: transferQty,
      approvedBy: transferApprovedBy,
      reason: transferReason,
      createdAt: timeStr,
    };

    setTransferLogs([newTransferLog, ...transferLogs]);
    setIsTransferOpen(false);
    setActiveLogTab("transfer"); // Switch to view transfer logs
  };

  // Flatten rows with both warehouse stocks (Memoized)
  const inventoryRows = useMemo(() => {
    return products
      .flatMap((p) =>
        (p.variants || []).map((v) => ({
          productId: p.product_id,
          variantId: v.variant_id,
          productName: p.name,
          variantName: v.name,
          sku: v.sku || "N/A",
          stockWh1: v.stock_warehouse_1 ?? 0,
          stockWh2: v.stock_warehouse_2 ?? 0,
          stockTotal: (v.stock_warehouse_1 ?? 0) + (v.stock_warehouse_2 ?? 0),
        }))
      )
      .filter((item) => {
        if (
          debouncedSearch.trim() !== "" &&
          !item.productName.toLowerCase().includes(debouncedSearch.toLowerCase()) &&
          !item.sku.toLowerCase().includes(debouncedSearch.toLowerCase())
        ) {
          return false;
        }
        return true;
      });
  }, [products, debouncedSearch]);

  // Calculate summary metrics across 2 warehouses (Single pass memoized)
  const { totalStockAll, totalStockWh1, totalStockWh2 } = useMemo(() => {
    let all = 0;
    let wh1 = 0;
    let wh2 = 0;
    for (const r of inventoryRows) {
      all += r.stockTotal;
      wh1 += r.stockWh1;
      wh2 += r.stockWh2;
    }
    return { totalStockAll: all, totalStockWh1: wh1, totalStockWh2: wh2 };
  }, [inventoryRows]);

  const selectedProductVariants =
    products.find((p) => p.product_id === selectedProductId)?.variants || [];
  const transferProductVariants =
    products.find((p) => p.product_id === transferProductId)?.variants || [];

  return (
    <div className="space-y-8 text-xs">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-heading font-extrabold text-2xl text-[#231B16]">
              Kiểm kho Đa Kho & Điều phối hàng
            </h1>
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-bold border border-emerald-300">
              Hệ thống 2 Kho
            </span>
          </div>
          <p className="text-xs text-[#7E7068] mt-0.5">
            Quản trị tồn kho tách biệt giữa <strong>Kho Trung Tâm (Quận 3)</strong> và <strong>Kho Cơ Sở 2 (Thủ Đức)</strong>, điều chuyển liên kho và tạo phiếu nhập hàng.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={() => {
              setTransferError(null);
              setIsTransferOpen(true);
            }}
            className="px-4 py-2.5 rounded-full bg-cream hover:bg-emerald-50 text-emerald-950 font-extrabold text-xs flex items-center gap-2 shadow-xs transition-all border border-emerald-600 active:scale-95 cursor-pointer"
          >
            <ArrowLeftRight className="w-4 h-4 text-emerald-700" />
            <span>Điều chuyển giữa 2 kho</span>
          </button>

          <button
            onClick={() => setIsBulkImportOpen(true)}
            className="px-5 py-2.5 rounded-full bg-[#BFE9C3] hover:bg-[#aee0b3] text-[#16381D] font-extrabold text-xs flex items-center gap-2 shadow-xs transition-all border border-[#9ed4a3] active:scale-95 cursor-pointer"
          >
            <PackagePlus className="w-4 h-4" />
            <span>Tạo phiếu nhập kho</span>
          </button>
        </div>
      </div>

      {/* 2-Warehouse Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Total Stock */}
        <div className="p-4 rounded-3xl bg-white border border-[#F0E5D8] shadow-soft space-y-1">
          <span className="text-[11px] text-gray-500 font-bold uppercase tracking-wider block">
            Tổng tồn toàn hệ thống
          </span>
          <div className="text-2xl font-extrabold text-[#1B3622]">
            {totalStockAll.toLocaleString("vi-VN")} <span className="text-xs font-normal text-gray-500">món</span>
          </div>
          <span className="text-[11px] text-emerald-800 font-semibold block">
            🌱 Phục vụ toàn bộ các kênh bán &amp; điểm trực
          </span>
        </div>

        {/* Warehouse 1: Q3 */}
        <div className="p-4 rounded-3xl bg-[#FFFDF9] border border-[#F0E5D8] shadow-soft space-y-1 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-emerald-900 font-bold uppercase tracking-wider flex items-center gap-1">
              <Building className="w-3.5 h-3.5 text-emerald-700" />
              Kho 1: Trung Tâm (Quận 3)
            </span>
            <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
              Kho chính
            </span>
          </div>
          <div className="text-2xl font-extrabold text-emerald-950">
            {totalStockWh1.toLocaleString("vi-VN")} <span className="text-xs font-normal text-gray-500">món</span>
          </div>
          <span className="text-[10.5px] text-[#7E7068] block truncate" title="128 Nguyễn Đình Chiểu, Phường Võ Thị Sáu, Q.3">
            Trụ sở Mầm Mơ • Phụ trách đơn bưu điện &amp; Q.10
          </span>
        </div>

        {/* Warehouse 2: Thu Duc */}
        <div className="p-4 rounded-3xl bg-[#FFFDF9] border border-[#F0E5D8] shadow-soft space-y-1 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-emerald-900 font-bold uppercase tracking-wider flex items-center gap-1">
              <Truck className="w-3.5 h-3.5 text-emerald-700" />
              Kho 2: Cơ Sở 2 (Thủ Đức)
            </span>
            <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold">
              Cơ sở
            </span>
          </div>
          <div className="text-2xl font-extrabold text-[#542B07]">
            {totalStockWh2.toLocaleString("vi-VN")} <span className="text-xs font-normal text-gray-500">món</span>
          </div>
          <span className="text-[10.5px] text-[#7E7068] block truncate" title="KTX ĐHQG Khu B, TP. Thủ Đức">
            KTX Khu B ĐHQG • Phụ trách sinh viên &amp; điểm hẹn Thủ Đức
          </span>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white rounded-3xl p-4 border border-[#F0E5D8] shadow-soft flex flex-col sm:flex-row items-center justify-between gap-4">
        {/* Search */}
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm theo tên sản phẩm, SKU..."
            className="w-full pl-9 pr-4 py-2 rounded-xl border border-[#F0E5D8] text-xs outline-none focus:border-[#FFB98A] bg-[#FFFDF9]"
          />
        </div>

        {/* Warehouse Filter Tabs */}
        <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-cream/70 border border-[#F0E5D8] w-full sm:w-auto overflow-x-auto">
          <button
            type="button"
            onClick={() => setSelectedWarehouseFilter("all")}
            className={`px-3 py-1.5 rounded-xl font-bold transition-all whitespace-nowrap cursor-pointer ${
              selectedWarehouseFilter === "all"
                ? "bg-[#2D6338] text-white shadow-xs"
                : "text-gray-600 hover:text-emerald-950 hover:bg-white"
            }`}
          >
            🏢 Tất cả các kho ({inventoryRows.length})
          </button>

          <button
            type="button"
            onClick={() => setSelectedWarehouseFilter("wh-1")}
            className={`px-3 py-1.5 rounded-xl font-bold transition-all whitespace-nowrap cursor-pointer ${
              selectedWarehouseFilter === "wh-1"
                ? "bg-[#2D6338] text-white shadow-xs"
                : "text-gray-600 hover:text-emerald-950 hover:bg-white"
            }`}
          >
            📍 Kho Trung Tâm (Q.3)
          </button>

          <button
            type="button"
            onClick={() => setSelectedWarehouseFilter("wh-2")}
            className={`px-3 py-1.5 rounded-xl font-bold transition-all whitespace-nowrap cursor-pointer ${
              selectedWarehouseFilter === "wh-2"
                ? "bg-[#2D6338] text-white shadow-xs"
                : "text-gray-600 hover:text-emerald-950 hover:bg-white"
            }`}
          >
            📍 Kho Cơ Sở 2 (Thủ Đức)
          </button>
        </div>
      </div>

      {/* Inventory Table */}
      <div className="bg-white rounded-3xl border border-[#F0E5D8] shadow-soft overflow-hidden space-y-2">
        <div className="p-4 border-b border-[#F0E5D8] bg-[#FFF8EE] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-base">📦</span>
            <h2 className="font-heading font-extrabold text-sm text-[#231B16]">
              Bảng kiểm kê tồn kho theo từng kho hàng ({inventoryRows.length} phân loại)
            </h2>
          </div>
          <span className="text-[11px] text-gray-500 italic">
            * Nhấn nút 🔁 để điều chuyển số lượng giữa Kho Q.3 và Kho Thủ Đức
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-[11px]">
            <thead>
              <tr className="border-b border-[#F0E5D8] text-[#7E7068] font-bold uppercase tracking-wider bg-white text-[10px]">
                <th className="py-2.5 px-2.5 text-center w-10">STT</th>
                <th className="py-2.5 px-3">Sản phẩm</th>
                <th className="py-2.5 px-2.5">Phân loại</th>
                <th className="py-2.5 px-2.5">SKU</th>
                <th className="py-2.5 px-2.5">
                  <span className="text-emerald-900 block font-bold">Kho 1 (Q.3)</span>
                  <span className="text-[9px] font-normal text-gray-500">Trung tâm</span>
                </th>
                <th className="py-2.5 px-2.5">
                  <span className="text-[#542B07] block font-bold">Kho 2 (Thủ Đức)</span>
                  <span className="text-[9px] font-normal text-gray-500">Cơ sở KTX</span>
                </th>
                <th className="py-2.5 px-2.5">
                  <span className="text-gray-900 block font-extrabold">Tổng tồn kho</span>
                  <span className="text-[9px] font-normal text-gray-500">Toàn hệ thống</span>
                </th>
                <th className="py-2.5 px-2.5">Trạng thái kho</th>
                <th className="py-2.5 px-3 text-right">Điều chuyển / Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0E5D8]">
              {inventoryRows.map((row, idx) => {
                const isWh1Low = row.stockWh1 <= 5;
                const isWh2Low = row.stockWh2 <= 3;
                const isTotalLow = row.stockTotal <= 10;

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

                    {/* Kho 1 (Q3) */}
                    <td className="py-2.5 px-2.5">
                      <div className="flex items-center gap-1.5">
                        <span className="font-extrabold text-xs text-emerald-950 w-8">
                          {row.stockWh1}
                        </span>
                        <div className="flex items-center gap-0.5">
                          <button
                            onClick={() => handleStockUpdate(row.productId, row.variantId, "wh-1", -1)}
                            className="w-5 h-5 rounded bg-gray-100 hover:bg-gray-200 text-gray-700 flex items-center justify-center font-bold"
                            title="Giảm 1 tại Kho Q.3"
                          >
                            -
                          </button>
                          <button
                            onClick={() => handleStockUpdate(row.productId, row.variantId, "wh-1", +1)}
                            className="w-5 h-5 rounded bg-emerald-100 hover:bg-emerald-200 text-emerald-900 flex items-center justify-center font-bold"
                            title="Tăng 1 tại Kho Q.3"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </td>

                    {/* Kho 2 (Thủ Đức) */}
                    <td className="py-2.5 px-2.5">
                      <div className="flex items-center gap-1.5">
                        <span className="font-extrabold text-xs text-[#542B07] w-8">
                          {row.stockWh2}
                        </span>
                        <div className="flex items-center gap-0.5">
                          <button
                            onClick={() => handleStockUpdate(row.productId, row.variantId, "wh-2", -1)}
                            className="w-5 h-5 rounded bg-gray-100 hover:bg-gray-200 text-gray-700 flex items-center justify-center font-bold"
                            title="Giảm 1 tại Kho Thủ Đức"
                          >
                            -
                          </button>
                          <button
                            onClick={() => handleStockUpdate(row.productId, row.variantId, "wh-2", +1)}
                            className="w-5 h-5 rounded bg-amber-100 hover:bg-amber-200 text-amber-900 flex items-center justify-center font-bold"
                            title="Tăng 1 tại Kho Thủ Đức"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </td>

                    {/* Tổng tồn */}
                    <td className="py-2.5 px-2.5">
                      <span className="font-black text-xs text-[#1B3622] px-2 py-0.5 rounded-lg bg-gray-50 border border-gray-100">
                        {row.stockTotal} món
                      </span>
                    </td>

                    {/* Trạng thái kho */}
                    <td className="py-2.5 px-2.5 whitespace-nowrap">
                      {isWh1Low && isWh2Low ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-800 text-[10px] font-bold border border-red-200">
                          <AlertTriangle className="w-2.5 h-2.5" /> Hết hàng cả 2 kho
                        </span>
                      ) : isWh1Low ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 text-[10px] font-bold border border-amber-200">
                          ⚠️ Kho Q.3 sắp hết ({row.stockWh1})
                        </span>
                      ) : isWh2Low ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-100 text-orange-900 text-[10px] font-bold border border-orange-200">
                          ⚠️ Kho Thủ Đức sắp hết ({row.stockWh2})
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#BFE9C3] text-[#16381D] text-[10px] font-bold border border-[#9ed4a3]">
                          ✓ Đủ hàng 2 kho
                        </span>
                      )}
                    </td>

                    {/* Thao tác Điều chuyển kho */}
                    <td className="py-2.5 px-3 text-right whitespace-nowrap">
                      <button
                        onClick={() => handleOpenTransferForProduct(row.productId, row.variantId)}
                        className="px-2.5 py-1.5 rounded-xl bg-cream hover:bg-[#BFE9C3] text-emerald-950 font-bold text-[10.5px] transition-colors inline-flex items-center gap-1 border border-emerald-300 cursor-pointer shadow-2xs"
                        title="Điều chuyển hàng giữa 2 kho"
                      >
                        <ArrowLeftRight className="w-3 h-3 text-emerald-700" />
                        <span>Chuyển kho</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* TABS: LỊCH SỬ NHẬP KHO & NHẬT KÝ ĐIỀU CHUYỂN KHO */}
      <div className="bg-white rounded-3xl border border-[#F0E5D8] shadow-soft overflow-hidden space-y-2">
        <div className="p-4 border-b border-[#F0E5D8] bg-[#FFF8EE] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-base">📜</span>
            <h2 className="font-heading font-extrabold text-sm text-[#231B16]">
              Nhật ký kiểm toán xuất nhập kho ({activeLogTab === "inflow" ? inflowLogs.length : transferLogs.length} bản ghi)
            </h2>
          </div>

          {/* Toggle between Inflow Logs and Transfer Logs */}
          <div className="flex items-center gap-1 p-1 rounded-2xl bg-white border border-[#F0E5D8]">
            <button
              onClick={() => setActiveLogTab("inflow")}
              className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeLogTab === "inflow"
                  ? "bg-[#2D6338] text-white shadow-2xs"
                  : "text-gray-600 hover:text-emerald-950"
              }`}
            >
              📥 Phiếu nhập kho ({inflowLogs.length})
            </button>
            <button
              onClick={() => setActiveLogTab("transfer")}
              className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeLogTab === "transfer"
                  ? "bg-[#2D6338] text-white shadow-2xs"
                  : "text-gray-600 hover:text-emerald-950"
              }`}
            >
              🔁 Điều chuyển giữa 2 kho ({transferLogs.length})
            </button>
          </div>
        </div>

        {/* Display Inflow Logs */}
        {activeLogTab === "inflow" ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[11px]">
              <thead>
                <tr className="border-b border-[#F0E5D8] text-[#7E7068] font-bold uppercase tracking-wider bg-white text-[10px]">
                  <th className="py-2.5 px-2.5 text-center w-10">STT</th>
                  <th className="py-2.5 px-3">Mã phiếu</th>
                  <th className="py-2.5 px-2.5">Kho nhập</th>
                  <th className="py-2.5 px-2.5">Thời gian</th>
                  <th className="py-2.5 px-2.5">Sản phẩm &amp; Phân loại</th>
                  <th className="py-2.5 px-2.5">Số lượng nhập</th>
                  <th className="py-2.5 px-2.5">Biến động tồn</th>
                  <th className="py-2.5 px-2.5">Người duyệt</th>
                  <th className="py-2.5 px-2.5">Nguồn hàng / Ghi chú</th>
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
                    <td className="py-2.5 px-2.5 font-bold text-emerald-950 whitespace-nowrap">
                      {log.warehouseName}
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
                        <CheckCircle2 className="w-2.5 h-2.5" /> Đã nhập kho
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          /* Display Transfer Logs */
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[11px]">
              <thead>
                <tr className="border-b border-[#F0E5D8] text-[#7E7068] font-bold uppercase tracking-wider bg-white text-[10px]">
                  <th className="py-2.5 px-2.5 text-center w-10">STT</th>
                  <th className="py-2.5 px-3">Mã điều chuyển</th>
                  <th className="py-2.5 px-2.5">Thời gian</th>
                  <th className="py-2.5 px-2.5">Sản phẩm &amp; Phân loại</th>
                  <th className="py-2.5 px-2.5">Kho xuất (Nguồn)</th>
                  <th className="py-2.5 px-2.5">Kho nhận (Đích)</th>
                  <th className="py-2.5 px-2.5">Số lượng chuyển</th>
                  <th className="py-2.5 px-2.5">Người duyệt</th>
                  <th className="py-2.5 px-2.5">Lý do điều chuyển</th>
                  <th className="py-2.5 px-3 text-right">Trạng thái</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0E5D8]">
                {transferLogs.map((log, idx) => (
                  <tr key={log.logId} className="hover:bg-[#FFFDF9] transition-colors">
                    <td className="py-2.5 px-2.5 text-center text-[#7E7068] font-bold text-[11px]">
                      {idx + 1}
                    </td>
                    <td className="py-2.5 px-3 font-mono font-bold text-emerald-900 text-xs whitespace-nowrap">
                      {log.transferCode}
                    </td>
                    <td className="py-2.5 px-2.5 text-[#7E7068] font-medium whitespace-nowrap text-[10.5px]">
                      {log.createdAt}
                    </td>
                    <td className="py-2.5 px-2.5">
                      <span className="font-bold text-[#342A24] block text-xs">{log.productName}</span>
                      <span className="text-[10px] text-[#2D6338] block font-semibold">{log.variantName}</span>
                    </td>
                    <td className="py-2.5 px-2.5 font-bold text-red-700 whitespace-nowrap">
                      {log.fromWarehouse}
                    </td>
                    <td className="py-2.5 px-2.5 font-bold text-emerald-800 whitespace-nowrap">
                      ➔ {log.toWarehouse}
                    </td>
                    <td className="py-2.5 px-2.5 font-black text-xs text-emerald-950 whitespace-nowrap">
                      {log.quantity} chiếc
                    </td>
                    <td className="py-2.5 px-2.5 font-bold text-[#342A24] whitespace-nowrap text-xs">
                      {log.approvedBy}
                    </td>
                    <td className="py-2.5 px-2.5 text-[#5C4D44] max-w-[180px] truncate text-[10.5px]">
                      {log.reason}
                    </td>
                    <td className="py-2.5 px-3 text-right whitespace-nowrap">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-800 text-[10px] font-extrabold border border-blue-200">
                        <Check className="w-2.5 h-2.5" /> Hoàn tất chuyển
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL 1: ĐIỀU CHUYỂN HÀNG GIỮA 2 KHO (INTER-WAREHOUSE TRANSFER) */}
      {isTransferOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-lg bg-white rounded-3xl p-6 sm:p-7 border border-[#F0E5D8] shadow-2xl space-y-5 animate-in zoom-in-95 text-left">
            <div className="flex items-center justify-between border-b border-[#F0E5D8] pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-cream border border-emerald-300 flex items-center justify-center text-emerald-900">
                  <ArrowLeftRight className="w-4 h-4" />
                </div>
                <h3 className="font-heading font-extrabold text-lg text-[#231B16]">
                  Điều chuyển hàng giữa 2 kho
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsTransferOpen(false)}
                className="p-1.5 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {transferError && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-bold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-red-500" />
                <span>{transferError}</span>
              </div>
            )}

            <form onSubmit={handleTransferSubmit} className="space-y-4 text-xs">
              {/* Product and Variant */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-[#342A24] block">Sản phẩm điều chuyển *</label>
                  <select
                    value={transferProductId}
                    onChange={(e) => {
                      setTransferProductId(e.target.value);
                      const prod = products.find((p) => p.product_id === e.target.value);
                      if (prod?.variants?.[0]) {
                        setTransferVariantId(prod.variants[0].variant_id);
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
                  <label className="font-bold text-[#342A24] block">Phân loại (Variant) *</label>
                  <select
                    value={transferVariantId}
                    onChange={(e) => setTransferVariantId(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#F0E5D8] text-xs outline-none focus:border-[#FFB98A] bg-white font-bold text-[#342A24]"
                  >
                    {transferProductVariants.map((v) => (
                      <option key={v.variant_id} value={v.variant_id}>
                        {v.name} (Q3: {v.stock_warehouse_1 ?? 0} | Thủ Đức: {v.stock_warehouse_2 ?? 0})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Direction: From Wh -> To Wh */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-2xl bg-cream/60 border border-[#F0E5D8]">
                <div className="space-y-1">
                  <label className="font-bold text-red-900 block flex items-center gap-1">
                    <span>📤 Kho xuất (Nguồn) *</span>
                  </label>
                  <select
                    value={fromWarehouse}
                    onChange={(e) => {
                      const val = e.target.value as "wh-1" | "wh-2";
                      setFromWarehouse(val);
                      setToWarehouse(val === "wh-1" ? "wh-2" : "wh-1");
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-red-200 text-xs font-bold text-red-950 bg-white"
                  >
                    <option value="wh-1">Kho 1: Trung Tâm (Quận 3)</option>
                    <option value="wh-2">Kho 2: Cơ Sở 2 (Thủ Đức)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-emerald-900 block flex items-center gap-1">
                    <span>📥 Kho nhận (Đích) *</span>
                  </label>
                  <select
                    value={toWarehouse}
                    onChange={(e) => {
                      const val = e.target.value as "wh-1" | "wh-2";
                      setToWarehouse(val);
                      setFromWarehouse(val === "wh-1" ? "wh-2" : "wh-1");
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-emerald-200 text-xs font-bold text-emerald-950 bg-white"
                  >
                    <option value="wh-2">Kho 2: Cơ Sở 2 (Thủ Đức)</option>
                    <option value="wh-1">Kho 1: Trung Tâm (Quận 3)</option>
                  </select>
                </div>
              </div>

              {/* Quantity */}
              <div className="space-y-1.5">
                <label className="font-bold text-[#342A24] block">Số lượng điều chuyển (món/chiếc) *</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    value={transferQty}
                    onChange={(e) => setTransferQty(Math.max(1, Number(e.target.value)))}
                    className="w-32 px-3.5 py-2.5 rounded-xl border border-[#F0E5D8] text-sm font-extrabold text-[#1B3622] outline-none focus:border-[#FFB98A] bg-[#FFFDF9]"
                  />
                  <div className="flex items-center gap-1.5">
                    {[5, 10, 20, 50].map((qty) => (
                      <button
                        key={qty}
                        type="button"
                        onClick={() => setTransferQty(qty)}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                          transferQty === qty
                            ? "bg-[#1B3622] text-white"
                            : "bg-[#FFF8EE] border border-[#F0E5D8] text-[#5C4D44] hover:bg-[#FFE7A8]"
                        }`}
                      >
                        {qty} món
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Approver & Reason */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-[#342A24] block">Người phụ trách điều chuyển *</label>
                  <input
                    type="text"
                    value={transferApprovedBy}
                    onChange={(e) => setTransferApprovedBy(e.target.value)}
                    required
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#F0E5D8] text-xs outline-none focus:border-[#FFB98A] font-semibold"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-[#342A24] block">Lý do điều chuyển *</label>
                  <input
                    type="text"
                    value={transferReason}
                    onChange={(e) => setTransferReason(e.target.value)}
                    placeholder="VD: Chi viện cho bàn trực KTX Thủ Đức"
                    required
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#F0E5D8] text-xs outline-none focus:border-[#FFB98A]"
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsTransferOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100 cursor-pointer"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-full bg-emerald-800 hover:bg-emerald-900 text-white font-extrabold text-xs shadow-xs transition-all cursor-pointer"
                >
                  Xác nhận chuyển kho ➔
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: TẠO PHIẾU NHẬP KHO */}
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
                className="p-1.5 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleBulkImportSubmit} className="space-y-4 text-xs">
              {/* Choose Warehouse to Import */}
              <div className="space-y-1 p-3 rounded-2xl bg-cream/70 border border-[#F0E5D8]">
                <label className="font-bold text-emerald-950 block">Nhập vào kho hàng nào? *</label>
                <select
                  value={importWarehouseId}
                  onChange={(e) => setImportWarehouseId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-emerald-300 text-xs outline-none bg-white font-bold text-emerald-950"
                >
                  <option value="wh-1">📍 Kho 1: Trung Tâm (Quận 3 - Trụ sở Mầm Mơ)</option>
                  <option value="wh-2">📍 Kho 2: Cơ Sở 2 (Thủ Đức - KTX Khu B ĐHQG)</option>
                </select>
              </div>

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
                        {v.name} (Tồn hiện tại: {v.stock})
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
                  Phê duyệt &amp; Nhập kho ➔
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
