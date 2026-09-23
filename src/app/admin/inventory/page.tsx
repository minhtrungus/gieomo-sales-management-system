"use client";

import { useState, useEffect, useMemo } from "react";
import { useDebounce } from "@/lib/hooks/useDebounce";
import { ExtendedProduct } from "@/lib/data/mockData";
import {
  getStoredProducts,
  updateStoredProduct,
  getStoredWarehouses,
  saveNewWarehouse,
  updateStoredWarehouse,
  deleteStoredWarehouse,
} from "@/lib/data/orderStore";
import type { Warehouse } from "@/types/database";
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
  Edit3,
  Trash2,
  Warehouse as WarehouseIcon,
  Star,
  MapPin,
  Phone,
  User,
  History,
  Eye,
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
  const [products, setProducts] = useState<ExtendedProduct[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);

  // Main Page Tabs: "inventory" (Kiểm kho) | "warehouses" (Quản lý kho) | "logs" (Lịch sử)
  const [mainTab, setMainTab] = useState<"inventory" | "warehouses" | "logs">("inventory");

  // Load from persistent stores
  useEffect(() => {
    const loadData = () => {
      const storedProds = getStoredProducts();
      setProducts(
        storedProds.map((p) => ({
          ...p,
          variants: p.variants?.map((v) => {
            const wh1 = v.stock_warehouse_1 ?? Math.ceil((v.stock || 0) * 0.7);
            const wh2 = v.stock_warehouse_2 ?? ((v.stock || 0) - wh1);
            return {
              ...v,
              stock_warehouse_1: wh1,
              stock_warehouse_2: wh2,
              stock: wh1 + wh2,
            };
          }),
        }))
      );
      setWarehouses(getStoredWarehouses());
    };

    loadData();

    const handleProdUpdate = () => loadData();
    const handleWhUpdate = () => setWarehouses(getStoredWarehouses());

    window.addEventListener("gieomo_products_updated", handleProdUpdate);
    window.addEventListener("gieomo_warehouses_updated", handleWhUpdate);

    return () => {
      window.removeEventListener("gieomo_products_updated", handleProdUpdate);
      window.removeEventListener("gieomo_warehouses_updated", handleWhUpdate);
    };
  }, []);

  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebounce(searchQuery, 250);
  const [selectedWarehouseFilter, setSelectedWarehouseFilter] = useState<string>("all");
  const [activeLogTab, setActiveLogTab] = useState<"inflow" | "transfer">("inflow");

  // ==========================================
  // WAREHOUSE CRUD STATE & HANDLERS
  // ==========================================
  const [isAddWarehouseOpen, setIsAddWarehouseOpen] = useState(false);
  const [editingWarehouse, setEditingWarehouse] = useState<Warehouse | null>(null);
  const [deletingWarehouse, setDeletingWarehouse] = useState<Warehouse | null>(null);
  const [viewingWarehouse, setViewingWarehouse] = useState<Warehouse | null>(null);

  // New warehouse form fields
  const [newWhCode, setNewWhCode] = useState("");
  const [newWhName, setNewWhName] = useState("");
  const [newWhAddress, setNewWhAddress] = useState("");
  const [newWhPhone, setNewWhPhone] = useState("");
  const [newWhManager, setNewWhManager] = useState("");
  const [newWhIsDefault, setNewWhIsDefault] = useState(false);

  const handleCreateWarehouseSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWhCode || !newWhName) return;

    const wh: Warehouse = {
      warehouse_id: `wh-${Date.now()}`,
      code: newWhCode.toUpperCase().trim(),
      name: newWhName.trim(),
      address: newWhAddress.trim(),
      phone: newWhPhone.trim(),
      manager_name: newWhManager.trim(),
      is_default: newWhIsDefault,
    };

    saveNewWarehouse(wh);
    setWarehouses(getStoredWarehouses());
    setIsAddWarehouseOpen(false);

    // Reset Form
    setNewWhCode("");
    setNewWhName("");
    setNewWhAddress("");
    setNewWhPhone("");
    setNewWhManager("");
    setNewWhIsDefault(false);
  };

  const handleEditWarehouseSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingWarehouse) return;

    updateStoredWarehouse({
      ...editingWarehouse,
      code: editingWarehouse.code.toUpperCase().trim(),
      name: editingWarehouse.name.trim(),
    });
    setWarehouses(getStoredWarehouses());
    setEditingWarehouse(null);
  };

  const handleConfirmDeleteWarehouse = () => {
    if (!deletingWarehouse) return;
    deleteStoredWarehouse(deletingWarehouse.warehouse_id);
    setWarehouses(getStoredWarehouses());
    setDeletingWarehouse(null);
  };

  const handleSetDefaultWarehouse = (wh: Warehouse) => {
    updateStoredWarehouse({ ...wh, is_default: true });
    setWarehouses(getStoredWarehouses());
  };

  // ==========================================
  // MODALS FOR INFLOW & TRANSFER
  // ==========================================
  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false);
  const [importWarehouseId, setImportWarehouseId] = useState<string>("wh-1");
  const [selectedProductId, setSelectedProductId] = useState(products[0]?.product_id || "");
  const [selectedVariantId, setSelectedVariantId] = useState(products[0]?.variants?.[0]?.variant_id || "");
  const [importQty, setImportQty] = useState<number>(50);
  const [unitCost, setUnitCost] = useState<number>(35000);
  const [approvedBy, setApprovedBy] = useState("Mai Lan (Trưởng Kho)");
  const [sourceNote, setSourceNote] = useState("Xưởng may tình nguyện viên Mầm Mơ đợt 2");

  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [transferProductId, setTransferProductId] = useState(products[0]?.product_id || "");
  const [transferVariantId, setTransferVariantId] = useState(products[0]?.variants?.[0]?.variant_id || "");
  const [fromWarehouse, setFromWarehouse] = useState<string>("wh-1");
  const [toWarehouse, setToWarehouse] = useState<string>("wh-2");
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

  // Transfer Logs State
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

  const [stockSyncWarning, setStockSyncWarning] = useState<string | null>(null);

  // Update stock for a specific warehouse
  const handleStockUpdate = (
    productId: string,
    variantId: string,
    targetWh: string,
    delta: number
  ) => {
    setProducts((prev) => {
      const updatedProducts = prev.map((p) => {
        if (p.product_id !== productId) return p;
        const updatedVariants = p.variants?.map((v) => {
          if (v.variant_id !== variantId) return v;
          const stocks = { ...(v.warehouse_stocks || {}) };
          let wh1 = v.stock_warehouse_1 ?? Math.ceil((v.stock || 0) * 0.7);
          let wh2 = v.stock_warehouse_2 ?? ((v.stock || 0) - wh1);

          const curVal = stocks[targetWh] ?? (targetWh === "wh-1" ? wh1 : targetWh === "wh-2" ? wh2 : 0);
          const newVal = Math.max(0, curVal + delta);
          stocks[targetWh] = newVal;
          if (targetWh === "wh-1") wh1 = newVal;
          if (targetWh === "wh-2") wh2 = newVal;

          let totalStock = 0;
          for (const wh of warehouses) {
            totalStock += stocks[wh.warehouse_id] ?? (wh.warehouse_id === "wh-1" ? wh1 : wh.warehouse_id === "wh-2" ? wh2 : 0);
          }

          if (totalStock < 20) {
            setStockSyncWarning(
              `⚠️ Cảnh báo tồn kho: "${p.name} (${v.name})" hiện chỉ còn ${totalStock} cái (< 20 cái). Vui lòng đồng bộ và kiểm tra kỹ số lượng đơn đặt!`
            );
          }

          return {
            ...v,
            stock_warehouse_1: wh1,
            stock_warehouse_2: wh2,
            warehouse_stocks: stocks,
            stock: totalStock,
          };
        });

        const updatedProd: ExtendedProduct = {
          ...p,
          variants: updatedVariants,
        };

        // Persist to storage
        updateStoredProduct(updatedProd);

        return updatedProd;
      });

      return updatedProducts;
    });
  };

  // Submit Bulk Inflow
  const handleBulkImportSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (importQty <= 0) return;

    const prod = products.find((p) => p.product_id === selectedProductId);
    const variant = prod?.variants?.find((v) => v.variant_id === selectedVariantId);

    if (!prod || !variant) return;

    const targetWhObj = warehouses.find((w) => w.warehouse_id === importWarehouseId);
    const whName = targetWhObj ? targetWhObj.name : "Kho Trung Tâm (Quận 3)";
    const currentWhStock =
      importWarehouseId === "wh-2" ? variant.stock_warehouse_2 ?? 0 : variant.stock_warehouse_1 ?? 0;
    const stockBefore = currentWhStock;
    const stockAfter = stockBefore + importQty;

    // Update specific warehouse stock
    handleStockUpdate(selectedProductId, selectedVariantId, importWarehouseId, importQty);

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
    setMainTab("logs");
    setActiveLogTab("inflow");
  };

  // Submit Inter-Warehouse Transfer
  const handleTransferSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTransferError(null);

    if (fromWarehouse === toWarehouse) {
      setTransferError("Kho xuất và kho nhận không được trùng nhau!");
      return;
    }

    if (transferQty <= 0) {
      setTransferError("Số lượng điều chuyển phải lớn hơn 0!");
      return;
    }

    const prod = products.find((p) => p.product_id === transferProductId);
    const variant = prod?.variants?.find((v) => v.variant_id === transferVariantId);

    if (!prod || !variant) {
      setTransferError("Không tìm thấy sản phẩm hoặc phân loại đã chọn!");
      return;
    }

    const sourceStock =
      fromWarehouse === "wh-1" ? variant.stock_warehouse_1 ?? 0 : variant.stock_warehouse_2 ?? 0;

    if (transferQty > sourceStock) {
      setTransferError(
        `Số lượng chuyển (${transferQty}) vượt quá tồn hiện tại của kho xuất (${sourceStock} cái)!`
      );
      return;
    }

    // Execute atomic transfer: Subtract from source, add to destination
    handleStockUpdate(transferProductId, transferVariantId, fromWarehouse, -transferQty);
    handleStockUpdate(transferProductId, transferVariantId, toWarehouse, transferQty);

    const fromWhObj = warehouses.find((w) => w.warehouse_id === fromWarehouse);
    const toWhObj = warehouses.find((w) => w.warehouse_id === toWarehouse);

    const today = new Date();
    const hours = String(today.getHours()).padStart(2, "0");
    const minutes = String(today.getMinutes()).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const year = today.getFullYear();
    const timeStr = `${hours}:${minutes} ${day}/${month}/${year}`;

    const newTransferLog: TransferLog = {
      logId: `tf-${Date.now()}`,
      transferCode: `DCK-${Math.floor(100000 + Math.random() * 900000)}`,
      productName: prod.name,
      variantName: variant.name,
      fromWarehouse: fromWhObj?.name || fromWarehouse,
      toWarehouse: toWhObj?.name || toWarehouse,
      quantity: transferQty,
      approvedBy: transferApprovedBy,
      reason: transferReason,
      createdAt: timeStr,
    };

    setTransferLogs([newTransferLog, ...transferLogs]);
    setIsTransferOpen(false);
    setMainTab("logs");
    setActiveLogTab("transfer");
  };

  // Flatten rows with all warehouse stocks (Memoized)
  const inventoryRows = useMemo(() => {
    return products
      .flatMap((p) =>
        (p.variants || []).map((v) => {
          const stocks: Record<string, number> = {};
          const wh1 = v.stock_warehouse_1 ?? Math.ceil((v.stock || 0) * 0.7);
          const wh2 = v.stock_warehouse_2 ?? ((v.stock || 0) - wh1);
          for (const wh of warehouses) {
            stocks[wh.warehouse_id] =
              v.warehouse_stocks?.[wh.warehouse_id] ??
              (wh.warehouse_id === "wh-1" ? wh1 : wh.warehouse_id === "wh-2" ? wh2 : 0);
          }
          const totalStock = Object.values(stocks).reduce((sum, s) => sum + s, 0);

          return {
            productId: p.product_id,
            variantId: v.variant_id,
            productName: p.name,
            variantName: v.name,
            sku: v.sku || "N/A",
            stocks,
            stockTotal: totalStock,
          };
        })
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
  }, [products, warehouses, debouncedSearch]);

  // Calculate summary metrics across all warehouses
  const { totalStockAll } = useMemo(() => {
    let all = 0;
    for (const r of inventoryRows) {
      all += r.stockTotal;
    }
    return { totalStockAll: all };
  }, [inventoryRows]);

  const selectedProductVariants =
    products.find((p) => p.product_id === selectedProductId)?.variants || [];
  const transferProductVariants =
    products.find((p) => p.product_id === transferProductId)?.variants || [];

  return (
    <div className="space-y-6 text-xs">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-heading font-extrabold text-2xl text-[#231B16]">
              Quản lý Kho &amp; Kiểm kê Tồn kho
            </h1>
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-bold border border-emerald-300">
              {warehouses.length} Kho hoạt động
            </span>
          </div>
          <p className="text-xs text-[#7E7068] mt-0.5">
            Quản trị danh sách kho, kiểm kê tồn kho theo phân loại, điều chuyển liên kho và tạo phiếu nhập hàng.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={() => {
              setTransferError(null);
              setIsTransferOpen(true);
            }}
            className="px-4 py-2.5 rounded-full bg-white hover:bg-emerald-50 text-emerald-950 font-extrabold text-xs flex items-center gap-2 shadow-xs transition-all border border-[#F0E5D8] hover:border-emerald-600 active:scale-95 cursor-pointer"
          >
            <ArrowLeftRight className="w-4 h-4 text-emerald-700" />
            <span>Điều chuyển hàng</span>
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

      {/* Main Navigation Tabs */}
      <div className="flex items-center gap-2 bg-white p-2 rounded-2xl border border-[#F0E5D8] w-fit shadow-2xs">
        <button
          onClick={() => setMainTab("inventory")}
          className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
            mainTab === "inventory"
              ? "bg-[#2D6338] text-white shadow-2xs"
              : "text-gray-600 hover:bg-gray-100"
          }`}
        >
          <span>📦 Bảng kiểm kê tồn kho</span>
          <span className="px-1.5 py-0.2 rounded-md bg-white/20 text-[10px]">
            {inventoryRows.length}
          </span>
        </button>

        <button
          onClick={() => setMainTab("warehouses")}
          className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
            mainTab === "warehouses"
              ? "bg-[#2D6338] text-white shadow-2xs"
              : "text-gray-600 hover:bg-gray-100"
          }`}
        >
          <WarehouseIcon className="w-3.5 h-3.5" />
          <span>Danh sách Kho hàng (CRUD)</span>
          <span className="px-1.5 py-0.2 rounded-md bg-white/20 text-[10px]">
            {warehouses.length}
          </span>
        </button>

        <button
          onClick={() => setMainTab("logs")}
          className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
            mainTab === "logs"
              ? "bg-[#2D6338] text-white shadow-2xs"
              : "text-gray-600 hover:bg-gray-100"
          }`}
        >
          <History className="w-3.5 h-3.5" />
          <span>Lịch sử nhập &amp; chuyển kho</span>
          <span className="px-1.5 py-0.2 rounded-md bg-white/20 text-[10px]">
            {inflowLogs.length + transferLogs.length}
          </span>
        </button>
      </div>

      {/* ========================================================
          TAB 1: KIỂM KÊ TỒN KHO
          ======================================================== */}
      {mainTab === "inventory" && (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-3xl bg-white border border-[#F0E5D8] shadow-soft space-y-1">
              <span className="text-[11px] text-gray-500 font-bold uppercase tracking-wider block">
                Tổng tồn toàn hệ thống
              </span>
              <div className="text-2xl font-extrabold text-[#1B3622]">
                {totalStockAll.toLocaleString("vi-VN")}{" "}
                <span className="text-xs font-normal text-gray-500">món</span>
              </div>
              <span className="text-[11px] text-emerald-800 font-semibold block">
                🌱 Phục vụ toàn bộ các kênh bán &amp; điểm trực
              </span>
            </div>

            {warehouses.map((wh, idx) => {
              const stock = inventoryRows.reduce((sum, r) => sum + (r.stocks[wh.warehouse_id] ?? 0), 0);
              return (
                <div
                  key={wh.warehouse_id}
                  className="p-4 rounded-3xl bg-[#FFFDF9] border border-[#F0E5D8] shadow-soft space-y-1 relative overflow-hidden"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-emerald-900 font-bold uppercase tracking-wider flex items-center gap-1">
                      {idx === 0 ? <Building className="w-3.5 h-3.5 text-emerald-700" /> : <Truck className="w-3.5 h-3.5 text-amber-700" />}
                      {wh.name}
                    </span>
                    {wh.is_default && (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                        Kho chính
                      </span>
                    )}
                  </div>
                  <div className="text-2xl font-extrabold text-emerald-950">
                    {stock.toLocaleString("vi-VN")}{" "}
                    <span className="text-xs font-normal text-gray-500">món</span>
                  </div>
                  <span className="text-[10.5px] text-[#7E7068] block truncate" title={wh.address}>
                    {wh.manager_name} • {wh.phone}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Filter & Search Bar */}
          <div className="bg-white rounded-3xl p-4 border border-[#F0E5D8] shadow-soft flex flex-col sm:flex-row items-center justify-between gap-4">
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

              {warehouses.map((wh) => (
                <button
                  key={wh.warehouse_id}
                  type="button"
                  onClick={() => setSelectedWarehouseFilter(wh.warehouse_id)}
                  className={`px-3 py-1.5 rounded-xl font-bold transition-all whitespace-nowrap cursor-pointer ${
                    selectedWarehouseFilter === wh.warehouse_id
                      ? "bg-[#2D6338] text-white shadow-xs"
                      : "text-gray-600 hover:text-emerald-950 hover:bg-white"
                  }`}
                >
                  📍 {wh.code}
                </button>
              ))}
            </div>
          </div>

          {/* Stock Sync Alert Banner */}
          {stockSyncWarning && (
            <div className="p-4 rounded-3xl bg-amber-50 border border-amber-200 flex items-start justify-between gap-3 shadow-xs animate-in fade-in">
              <div className="flex items-start gap-2.5">
                <span className="text-xl">⚠️</span>
                <div className="space-y-0.5 text-xs text-amber-900">
                  <span className="font-bold block text-sm">
                    Cảnh báo mức tồn kho thấp (&lt; 20 sản phẩm)
                  </span>
                  <p>{stockSyncWarning}</p>
                </div>
              </div>
              <button
                onClick={() => setStockSyncWarning(null)}
                className="p-1 rounded-xl text-amber-700 hover:bg-amber-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Inventory Table */}
          <div className="bg-white rounded-3xl border border-[#F0E5D8] shadow-soft overflow-hidden space-y-2">
            <div className="p-4 border-b border-[#F0E5D8] bg-[#FFF8EE] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-base">📦</span>
                <h2 className="font-heading font-extrabold text-sm text-[#231B16]">
                  Bảng kiểm kê tồn kho theo phân loại ({inventoryRows.length} mục)
                </h2>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#F0E5D8] text-[#7E7068] font-bold uppercase tracking-wider bg-white">
                    <th className="py-3 px-4">Sản phẩm &amp; Phân loại</th>
                    <th className="py-3 px-3">Mã SKU</th>
                    {warehouses.map((wh) => (
                      <th key={wh.warehouse_id} className="py-3 px-3 text-center whitespace-nowrap">
                        {wh.name} {wh.is_default && <span className="text-emerald-700 font-bold text-[10px] block">(Mặc định)</span>}
                      </th>
                    ))}
                    <th className="py-3 px-3 text-center">Tổng tồn</th>
                    <th className="py-3 px-3 text-right">Trạng thái kho</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F0E5D8]">
                  {inventoryRows.length === 0 ? (
                    <tr>
                      <td colSpan={4 + warehouses.length} className="py-12 text-center text-gray-500">
                        Không tìm thấy sản phẩm hoặc biến thể phù hợp.
                      </td>
                    </tr>
                  ) : (
                    inventoryRows.map((row) => (
                      <tr key={row.variantId} className="hover:bg-[#FFFDF9] transition-colors">
                        <td className="py-3 px-4">
                          <span className="font-bold text-[#342A24] block">{row.productName}</span>
                          <span className="text-[11px] text-[#2D6338] font-semibold">{row.variantName}</span>
                        </td>
                        <td className="py-3 px-3 font-mono font-bold text-gray-600 text-[11px]">
                          {row.sku}
                        </td>

                        {/* Dynamic Warehouse Stocks */}
                        {warehouses.map((wh) => {
                          const curStock = row.stocks[wh.warehouse_id] ?? 0;
                          return (
                            <td key={wh.warehouse_id} className="py-3 px-3 text-center">
                              <div className="inline-flex items-center gap-1.5 p-1 rounded-xl bg-gray-50 border border-gray-200">
                                <button
                                  onClick={() => handleStockUpdate(row.productId, row.variantId, wh.warehouse_id, -1)}
                                  className="w-5 h-5 rounded-lg bg-white border border-gray-200 flex items-center justify-center text-gray-700 hover:bg-gray-100 cursor-pointer"
                                  title="Giảm 1"
                                >
                                  <Minus className="w-3 h-3" />
                                </button>
                                <span className={`font-bold w-9 text-center ${curStock < 10 ? "text-amber-700 font-extrabold" : "text-emerald-950"}`}>
                                  {curStock}
                                </span>
                                <button
                                  onClick={() => handleStockUpdate(row.productId, row.variantId, wh.warehouse_id, 1)}
                                  className="w-5 h-5 rounded-lg bg-white border border-gray-200 flex items-center justify-center text-gray-700 hover:bg-gray-100 cursor-pointer"
                                  title="Tăng 1"
                                >
                                  <Plus className="w-3 h-3" />
                                </button>
                              </div>
                            </td>
                          );
                        })}

                        {/* Total Stock */}
                        <td className="py-3 px-3 text-center font-extrabold text-sm text-[#231B16]">
                          {row.stockTotal}
                        </td>

                        {/* Status */}
                        <td className="py-3 px-3 text-right">
                          {row.stockTotal === 0 ? (
                            <span className="px-2.5 py-0.5 rounded-full bg-red-100 text-red-700 font-bold text-[10.5px]">
                              Hết hàng
                            </span>
                          ) : row.stockTotal < 20 ? (
                            <span className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold text-[10.5px]">
                              Sắp hết ({row.stockTotal})
                            </span>
                          ) : (
                            <span className="px-2.5 py-0.5 rounded-full bg-[#EAF7ED] text-[#16381D] font-bold text-[10.5px]">
                              Đủ hàng
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          TAB 2: QUẢN LÝ DANH SÁCH KHO HÀNG (CRUD)
          ======================================================== */}
      {mainTab === "warehouses" && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-4 rounded-3xl border border-[#F0E5D8] shadow-soft">
            <div>
              <h2 className="font-heading font-extrabold text-base text-[#231B16] flex items-center gap-2">
                <WarehouseIcon className="w-4 h-4 text-emerald-800" />
                <span>Danh mục Kho hàng &amp; Chi nhánh</span>
              </h2>
              <p className="text-xs text-[#7E7068]">
                Quản lý các địa điểm lưu trữ, xưởng may và điểm phân phối hàng của Mầm Mơ.
              </p>
            </div>

            <button
              onClick={() => setIsAddWarehouseOpen(true)}
              className="px-5 py-2.5 rounded-full bg-[#BFE9C3] hover:bg-[#aee0b3] text-[#16381D] font-extrabold text-xs flex items-center gap-2 shadow-xs transition-all border border-[#9ed4a3] active:scale-95 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Thêm kho mới</span>
            </button>
          </div>

          {/* Warehouses Table */}
          <div className="bg-white rounded-3xl border border-[#F0E5D8] shadow-soft overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-[#FFF8EE] border-b border-[#F0E5D8] text-[#7E7068] font-bold uppercase tracking-wider">
                    <th className="py-3.5 px-4 w-12 text-center">STT</th>
                    <th className="py-3.5 px-4">Mã kho</th>
                    <th className="py-3.5 px-4">Tên kho hàng</th>
                    <th className="py-3.5 px-4">Địa chỉ</th>
                    <th className="py-3.5 px-4">Người phụ trách</th>
                    <th className="py-3.5 px-4">Hotline</th>
                    <th className="py-3.5 px-4">Phân loại</th>
                    <th className="py-3.5 px-5 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F0E5D8]">
                  {warehouses.map((wh, idx) => (
                    <tr key={wh.warehouse_id} className="hover:bg-[#FFFDF9] transition-colors">
                      <td className="py-3.5 px-4 text-center text-gray-500 font-bold">
                        {idx + 1}
                      </td>
                      <td className="py-3.5 px-4 font-mono font-extrabold text-[#2D6338]">
                        <span className="px-2 py-0.5 rounded-lg bg-[#EAF7ED] border border-[#BFE9C3]">
                          {wh.code}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-bold text-[#231B16] text-sm">
                        {wh.name}
                      </td>
                      <td className="py-3.5 px-4 text-gray-600 max-w-[260px]">
                        <div className="flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                          <span className="truncate">{wh.address}</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-[#342A24] font-semibold">
                        <div className="flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                          <span>{wh.manager_name}</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-gray-600">
                        <div className="flex items-center gap-1.5">
                          <Phone className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                          <span>{wh.phone}</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        {wh.is_default ? (
                          <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-900 font-bold text-[10.5px] border border-emerald-300 inline-flex items-center gap-1">
                            <Star className="w-3 h-3 fill-emerald-700 text-emerald-700" />
                            <span>Kho mặc định</span>
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 rounded-full bg-gray-100 text-gray-600 font-medium text-[10.5px] border border-gray-200">
                            Kho cơ sở
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setViewingWarehouse(wh)}
                            className="p-1.5 rounded-xl text-emerald-800 hover:bg-emerald-100/80 transition-colors cursor-pointer"
                            title="Xem chi tiết kho hàng"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          {!wh.is_default && (
                            <button
                              onClick={() => handleSetDefaultWarehouse(wh)}
                              className="px-2.5 py-1 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 font-bold text-[10.5px] transition-colors cursor-pointer"
                              title="Đặt làm kho mặc định"
                            >
                              Đặt mặc định
                            </button>
                          )}
                          <button
                            onClick={() => setEditingWarehouse(wh)}
                            className="p-1.5 rounded-xl text-gray-600 hover:text-emerald-800 hover:bg-emerald-50 transition-colors cursor-pointer"
                            title="Sửa kho"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setDeletingWarehouse(wh)}
                            disabled={wh.is_default}
                            className={`p-1.5 rounded-xl transition-colors ${
                              wh.is_default
                                ? "text-gray-300 cursor-not-allowed"
                                : "text-gray-600 hover:text-red-600 hover:bg-red-50 cursor-pointer"
                            }`}
                            title={wh.is_default ? "Không thể xóa kho mặc định" : "Xóa kho"}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          TAB 3: LỊCH SỬ NHẬP & LUÂN CHUYỂN KHO
          ======================================================== */}
      {mainTab === "logs" && (
        <div className="bg-white rounded-3xl border border-[#F0E5D8] shadow-soft overflow-hidden space-y-3">
          <div className="p-4 border-b border-[#F0E5D8] bg-[#FFF8EE] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-base">📋</span>
              <h2 className="font-heading font-extrabold text-sm text-[#231B16]">
                Nhật ký nhập hàng &amp; Luân chuyển giữa các kho
              </h2>
            </div>

            <div className="flex items-center gap-2 p-1 rounded-xl bg-white border border-[#F0E5D8]">
              <button
                type="button"
                onClick={() => setActiveLogTab("inflow")}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeLogTab === "inflow"
                    ? "bg-[#BFE9C3] text-[#16381D] shadow-xs"
                    : "text-gray-500 hover:text-gray-900"
                }`}
              >
                📥 Phiếu nhập kho ({inflowLogs.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveLogTab("transfer")}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeLogTab === "transfer"
                    ? "bg-[#BFE9C3] text-[#16381D] shadow-xs"
                    : "text-gray-500 hover:text-gray-900"
                }`}
              >
                🔄 Phiếu điều chuyển ({transferLogs.length})
              </button>
            </div>
          </div>

          {activeLogTab === "inflow" ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[11px]">
                <thead>
                  <tr className="border-b border-[#F0E5D8] text-[#7E7068] font-bold uppercase tracking-wider bg-white text-[10px]">
                    <th className="py-2.5 px-3">Mã phiếu</th>
                    <th className="py-2.5 px-2.5">Thời gian</th>
                    <th className="py-2.5 px-2.5">Kho nhập</th>
                    <th className="py-2.5 px-2.5">Sản phẩm &amp; Phân loại</th>
                    <th className="py-2.5 px-2.5 text-center">SL nhập</th>
                    <th className="py-2.5 px-2.5 text-center">Tồn sau nhập</th>
                    <th className="py-2.5 px-2.5">Người duyệt</th>
                    <th className="py-2.5 px-3 text-right">Trạng thái</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F0E5D8]">
                  {inflowLogs.map((log) => (
                    <tr key={log.logId} className="hover:bg-[#FFFDF9] transition-colors">
                      <td className="py-2.5 px-3 font-mono font-bold text-emerald-900 text-xs">
                        {log.receiptCode}
                      </td>
                      <td className="py-2.5 px-2.5 text-[#7E7068]">{log.createdAt}</td>
                      <td className="py-2.5 px-2.5 font-bold text-[#342A24]">{log.warehouseName}</td>
                      <td className="py-2.5 px-2.5">
                        <span className="font-bold text-[#342A24] block">{log.productName}</span>
                        <span className="text-[10px] text-[#2D6338]">{log.variantName}</span>
                      </td>
                      <td className="py-2.5 px-2.5 text-center font-extrabold text-emerald-700">
                        +{log.quantityAdded}
                      </td>
                      <td className="py-2.5 px-2.5 text-center font-bold text-gray-800">
                        {log.stockAfter}
                      </td>
                      <td className="py-2.5 px-2.5 font-medium text-gray-700">{log.approvedBy}</td>
                      <td className="py-2.5 px-3 text-right">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Đã nhập kho
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[11px]">
                <thead>
                  <tr className="border-b border-[#F0E5D8] text-[#7E7068] font-bold uppercase tracking-wider bg-white text-[10px]">
                    <th className="py-2.5 px-3">Mã điều chuyển</th>
                    <th className="py-2.5 px-2.5">Thời gian</th>
                    <th className="py-2.5 px-2.5">Sản phẩm &amp; Phân loại</th>
                    <th className="py-2.5 px-2.5">Kho xuất (Nguồn)</th>
                    <th className="py-2.5 px-2.5">Kho nhận (Đích)</th>
                    <th className="py-2.5 px-2.5">Số lượng</th>
                    <th className="py-2.5 px-2.5">Người duyệt</th>
                    <th className="py-2.5 px-3 text-right">Trạng thái</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F0E5D8]">
                  {transferLogs.map((log) => (
                    <tr key={log.logId} className="hover:bg-[#FFFDF9] transition-colors">
                      <td className="py-2.5 px-3 font-mono font-bold text-emerald-900 text-xs">
                        {log.transferCode}
                      </td>
                      <td className="py-2.5 px-2.5 text-[#7E7068]">{log.createdAt}</td>
                      <td className="py-2.5 px-2.5">
                        <span className="font-bold text-[#342A24] block">{log.productName}</span>
                        <span className="text-[10px] text-[#2D6338]">{log.variantName}</span>
                      </td>
                      <td className="py-2.5 px-2.5 font-bold text-red-700">{log.fromWarehouse}</td>
                      <td className="py-2.5 px-2.5 font-bold text-emerald-800">➔ {log.toWarehouse}</td>
                      <td className="py-2.5 px-2.5 font-black text-xs text-emerald-950">
                        {log.quantity} chiếc
                      </td>
                      <td className="py-2.5 px-2.5 font-bold text-[#342A24]">{log.approvedBy}</td>
                      <td className="py-2.5 px-3 text-right">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-800 text-[10px] font-extrabold border border-blue-200">
                          <Check className="w-2.5 h-2.5" /> Hoàn tất
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ========================================================
          MODAL: THÊM KHO HÀNG MỚI
          ======================================================== */}
      {isAddWarehouseOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-md bg-white rounded-3xl p-6 sm:p-7 border border-[#F0E5D8] shadow-2xl space-y-5 animate-in zoom-in-95 text-left">
            <div className="flex items-center justify-between border-b border-[#F0E5D8] pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-[#BFE9C3] flex items-center justify-center text-[#16381D]">
                  <WarehouseIcon className="w-4 h-4" />
                </div>
                <h3 className="font-heading font-extrabold text-lg text-[#231B16]">
                  Thêm kho hàng mới
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAddWarehouseOpen(false)}
                className="p-1.5 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateWarehouseSubmit} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-[#342A24] block">Mã kho (Code) *</label>
                  <input
                    type="text"
                    required
                    placeholder="VD: KHO-BINHTHANH"
                    value={newWhCode}
                    onChange={(e) => setNewWhCode(e.target.value.toUpperCase())}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#F0E5D8] text-xs outline-none focus:border-[#FFB98A] font-mono font-bold uppercase"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-[#342A24] block">Hotline liên hệ</label>
                  <input
                    type="text"
                    placeholder="VD: 0901234567"
                    value={newWhPhone}
                    onChange={(e) => setNewWhPhone(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#F0E5D8] text-xs outline-none focus:border-[#FFB98A]"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-[#342A24] block">Tên kho hàng *</label>
                <input
                  type="text"
                  required
                  placeholder="VD: Kho Cơ Sở Bình Thạnh (TP.HCM)"
                  value={newWhName}
                  onChange={(e) => setNewWhName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#F0E5D8] text-xs outline-none focus:border-[#FFB98A] font-bold"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-[#342A24] block">Địa chỉ kho *</label>
                <input
                  type="text"
                  required
                  placeholder="Địa chỉ số nhà, đường, phường, quận"
                  value={newWhAddress}
                  onChange={(e) => setNewWhAddress(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#F0E5D8] text-xs outline-none focus:border-[#FFB98A]"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-[#342A24] block">Người quản lý / Phụ trách</label>
                <input
                  type="text"
                  placeholder="Họ tên thủ kho hoặc bạn phụ trách"
                  value={newWhManager}
                  onChange={(e) => setNewWhManager(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#F0E5D8] text-xs outline-none focus:border-[#FFB98A]"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="newWhDefault"
                  checked={newWhIsDefault}
                  onChange={(e) => setNewWhIsDefault(e.target.checked)}
                  className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
                />
                <label htmlFor="newWhDefault" className="font-bold text-[#342A24] cursor-pointer">
                  Đặt làm kho mặc định (Kho xuất chính cho các đơn giao hàng)
                </label>
              </div>

              <div className="pt-3 border-t border-[#F0E5D8] flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsAddWarehouseOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-[#BFE9C3] hover:bg-[#aee0b3] text-[#16381D] font-extrabold text-xs shadow-xs border border-[#9ed4a3] cursor-pointer"
                >
                  Thêm kho ➔
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL: SỬA KHO HÀNG
          ======================================================== */}
      {editingWarehouse && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-md bg-white rounded-3xl p-6 sm:p-7 border border-[#F0E5D8] shadow-2xl space-y-5 animate-in zoom-in-95 text-left">
            <div className="flex items-center justify-between border-b border-[#F0E5D8] pb-3">
              <h3 className="font-heading font-extrabold text-lg text-[#231B16]">
                Chỉnh sửa Kho: {editingWarehouse.name}
              </h3>
              <button
                type="button"
                onClick={() => setEditingWarehouse(null)}
                className="p-1.5 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditWarehouseSubmit} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-[#342A24] block">Mã kho (Code) *</label>
                  <input
                    type="text"
                    required
                    value={editingWarehouse.code}
                    onChange={(e) =>
                      setEditingWarehouse({ ...editingWarehouse, code: e.target.value.toUpperCase() })
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#F0E5D8] text-xs outline-none focus:border-[#FFB98A] font-mono font-bold uppercase"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-[#342A24] block">Hotline liên hệ</label>
                  <input
                    type="text"
                    value={editingWarehouse.phone}
                    onChange={(e) =>
                      setEditingWarehouse({ ...editingWarehouse, phone: e.target.value })
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#F0E5D8] text-xs outline-none focus:border-[#FFB98A]"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-[#342A24] block">Tên kho hàng *</label>
                <input
                  type="text"
                  required
                  value={editingWarehouse.name}
                  onChange={(e) =>
                    setEditingWarehouse({ ...editingWarehouse, name: e.target.value })
                  }
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#F0E5D8] text-xs outline-none focus:border-[#FFB98A] font-bold"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-[#342A24] block">Địa chỉ kho *</label>
                <input
                  type="text"
                  required
                  value={editingWarehouse.address}
                  onChange={(e) =>
                    setEditingWarehouse({ ...editingWarehouse, address: e.target.value })
                  }
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#F0E5D8] text-xs outline-none focus:border-[#FFB98A]"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-[#342A24] block">Người quản lý / Phụ trách</label>
                <input
                  type="text"
                  value={editingWarehouse.manager_name}
                  onChange={(e) =>
                    setEditingWarehouse({ ...editingWarehouse, manager_name: e.target.value })
                  }
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#F0E5D8] text-xs outline-none focus:border-[#FFB98A]"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="editWhDefault"
                  checked={Boolean(editingWarehouse.is_default)}
                  onChange={(e) =>
                    setEditingWarehouse({ ...editingWarehouse, is_default: e.target.checked })
                  }
                  className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
                />
                <label htmlFor="editWhDefault" className="font-bold text-[#342A24] cursor-pointer">
                  Kho mặc định
                </label>
              </div>

              <div className="pt-3 border-t border-[#F0E5D8] flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setEditingWarehouse(null)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-[#BFE9C3] hover:bg-[#aee0b3] text-[#16381D] font-extrabold text-xs shadow-xs border border-[#9ed4a3] cursor-pointer"
                >
                  Lưu thay đổi ➔
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL: XÁC NHẬN XÓA KHO
          ======================================================== */}
      {deletingWarehouse && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-sm bg-white rounded-3xl p-6 border border-[#F0E5D8] shadow-2xl space-y-4 text-center animate-in zoom-in-95">
            <div className="w-12 h-12 rounded-full bg-red-50 text-red-600 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h3 className="font-heading font-extrabold text-lg text-[#231B16]">
              Xác nhận xóa kho hàng?
            </h3>
            <p className="text-xs text-[#7E7068] leading-relaxed">
              Bạn có chắc muốn xóa kho <strong>&quot;{deletingWarehouse.name}&quot;</strong>? Các đơn hàng trước đó vẫn giữ lịch sử nhưng kho này sẽ không thể dùng để nhập hàng mới nữa.
            </p>

            <div className="flex items-center justify-center gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setDeletingWarehouse(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100 cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteWarehouse}
                className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs shadow-xs cursor-pointer"
              >
                Xóa kho vĩnh viễn
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL 1: ĐIỀU CHUYỂN HÀNG GIỮA CÁC KHO
          ======================================================== */}
      {isTransferOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-lg bg-white rounded-3xl p-6 sm:p-7 border border-[#F0E5D8] shadow-2xl space-y-5 animate-in zoom-in-95 text-left">
            <div className="flex items-center justify-between border-b border-[#F0E5D8] pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-cream border border-emerald-300 flex items-center justify-center text-emerald-900">
                  <ArrowLeftRight className="w-4 h-4" />
                </div>
                <h3 className="font-heading font-extrabold text-lg text-[#231B16]">
                  Điều chuyển hàng giữa các kho
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-2xl bg-cream/60 border border-[#F0E5D8]">
                <div className="space-y-1">
                  <label className="font-bold text-red-900 block flex items-center gap-1">
                    <span>📤 Kho xuất (Nguồn) *</span>
                  </label>
                  <select
                    value={fromWarehouse}
                    onChange={(e) => setFromWarehouse(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-red-200 text-xs font-bold text-red-950 bg-white"
                  >
                    {warehouses.map((wh) => (
                      <option key={wh.warehouse_id} value={wh.warehouse_id}>
                        {wh.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-emerald-900 block flex items-center gap-1">
                    <span>📥 Kho nhận (Đích) *</span>
                  </label>
                  <select
                    value={toWarehouse}
                    onChange={(e) => setToWarehouse(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-emerald-200 text-xs font-bold text-emerald-950 bg-white"
                  >
                    {warehouses.map((wh) => (
                      <option key={wh.warehouse_id} value={wh.warehouse_id}>
                        {wh.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-[#342A24] block">Số lượng chuyển *</label>
                  <input
                    type="number"
                    min={1}
                    value={transferQty}
                    onChange={(e) => setTransferQty(Number(e.target.value))}
                    className="w-full px-3.5 py-2 rounded-xl border border-[#F0E5D8] text-xs outline-none focus:border-[#FFB98A] font-bold"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-[#342A24] block">Người duyệt điều chuyển *</label>
                  <input
                    type="text"
                    value={transferApprovedBy}
                    onChange={(e) => setTransferApprovedBy(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl border border-[#F0E5D8] text-xs outline-none focus:border-[#FFB98A]"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-[#342A24] block">Lý do điều chuyển</label>
                <input
                  type="text"
                  value={transferReason}
                  onChange={(e) => setTransferReason(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-[#F0E5D8] text-xs outline-none focus:border-[#FFB98A]"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsTransferOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-xs shadow-xs cursor-pointer"
                >
                  Xác nhận chuyển hàng ➔
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL 2: TẠO PHIẾU NHẬP KHO (BULK INFLOW)
          ======================================================== */}
      {isBulkImportOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-lg bg-white rounded-3xl p-6 sm:p-7 border border-[#F0E5D8] shadow-2xl space-y-5 animate-in zoom-in-95 text-left">
            <div className="flex items-center justify-between border-b border-[#F0E5D8] pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-[#BFE9C3] flex items-center justify-center text-[#16381D]">
                  <PackagePlus className="w-4 h-4" />
                </div>
                <h3 className="font-heading font-extrabold text-lg text-[#231B16]">
                  Tạo phiếu nhập kho thành phẩm
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
              <div className="space-y-1">
                <label className="font-bold text-[#342A24] block">Kho hàng nhập về *</label>
                <select
                  value={importWarehouseId}
                  onChange={(e) => setImportWarehouseId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#F0E5D8] text-xs outline-none focus:border-[#FFB98A] bg-white font-bold text-[#342A24]"
                >
                  {warehouses.map((wh) => (
                    <option key={wh.warehouse_id} value={wh.warehouse_id}>
                      {wh.name} {wh.is_default ? "(Kho chính)" : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-[#342A24] block">Sản phẩm nhập *</label>
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
                  <label className="font-bold text-[#342A24] block">Phân loại (Variant) *</label>
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-[#342A24] block">Số lượng nhập thêm *</label>
                  <input
                    type="number"
                    min={1}
                    value={importQty}
                    onChange={(e) => setImportQty(Number(e.target.value))}
                    className="w-full px-3.5 py-2 rounded-xl border border-[#F0E5D8] text-xs outline-none focus:border-[#FFB98A] font-bold"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-[#342A24] block">Giá vốn sản xuất (VNĐ) *</label>
                  <input
                    type="number"
                    value={unitCost}
                    onChange={(e) => setUnitCost(Number(e.target.value))}
                    className="w-full px-3.5 py-2 rounded-xl border border-[#F0E5D8] text-xs outline-none focus:border-[#FFB98A]"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-[#342A24] block">Người phụ trách duyệt nhập *</label>
                <input
                  type="text"
                  value={approvedBy}
                  onChange={(e) => setApprovedBy(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-[#F0E5D8] text-xs outline-none focus:border-[#FFB98A]"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-[#342A24] block">Nguồn hàng / Ghi chú</label>
                <input
                  type="text"
                  value={sourceNote}
                  onChange={(e) => setSourceNote(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-[#F0E5D8] text-xs outline-none focus:border-[#FFB98A]"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsBulkImportOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-[#BFE9C3] hover:bg-[#aee0b3] text-[#16381D] font-extrabold text-xs shadow-xs border border-[#9ed4a3] cursor-pointer"
                >
                  Nhập kho &amp; Lưu nhật ký ➔
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL: XEM CHI TIẾT THÔNG TIN 1 KHO HÀNG
          ======================================================== */}
      {viewingWarehouse && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-2xl bg-white rounded-3xl p-6 sm:p-7 border border-[#F0E5D8] shadow-2xl space-y-5 animate-in zoom-in-95 text-left max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#F0E5D8] pb-3">
              <div className="flex items-center gap-2">
                <Building className="w-5 h-5 text-[#2D6338]" />
                <div>
                  <h3 className="font-heading font-extrabold text-base text-[#231B16]">
                    Chi tiết kho hàng: {viewingWarehouse.name}
                  </h3>
                  <span className="font-mono text-xs text-[#2D6338] font-bold">
                    Mã kho: {viewingWarehouse.code}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setViewingWarehouse(null)}
                className="p-1 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Warehouse Overview Info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 rounded-2xl bg-[#FFF8EE] border border-[#F0E5D8] text-xs">
              <div className="space-y-1.5">
                <div>
                  <span className="text-gray-500 block text-[11px]">Địa chỉ kho:</span>
                  <span className="font-bold text-[#231B16] flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                    {viewingWarehouse.address}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500 block text-[11px]">Người phụ trách:</span>
                  <span className="font-bold text-[#231B16] flex items-center gap-1">
                    <User className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                    {viewingWarehouse.manager_name}
                  </span>
                </div>
              </div>
              <div className="space-y-1.5">
                <div>
                  <span className="text-gray-500 block text-[11px]">Hotline kho:</span>
                  <span className="font-mono font-bold text-[#231B16] flex items-center gap-1">
                    <Phone className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                    {viewingWarehouse.phone}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500 block text-[11px]">Vai trò kho:</span>
                  {viewingWarehouse.is_default ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-900 font-bold text-[10.5px]">
                      <Star className="w-3 h-3 fill-emerald-700" /> Kho trung tâm mặc định
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-700 font-bold text-[10.5px]">
                      Kho cơ sở vệ tinh
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Warehouse Stock Breakdown */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-heading font-bold text-sm text-[#231B16]">
                  📦 Tồn kho chi tiết tại {viewingWarehouse.name}
                </h4>
                <span className="text-xs font-bold text-emerald-800">
                  Tổng: {
                    inventoryRows.reduce((sum, r) => sum + (r.stocks[viewingWarehouse.warehouse_id] ?? 0), 0)
                  } sản phẩm
                </span>
              </div>

              <div className="border border-[#F0E5D8] rounded-2xl overflow-hidden max-h-56 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-gray-50 border-b border-[#F0E5D8] text-gray-500 font-bold">
                    <tr>
                      <th className="py-2.5 px-3">Mặt hàng &amp; Phân loại</th>
                      <th className="py-2.5 px-3">Mã SKU</th>
                      <th className="py-2.5 px-3 text-center">Tồn tại kho này</th>
                      <th className="py-2.5 px-3 text-right">Chỉnh sửa</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F0E5D8]">
                    {inventoryRows.map((row) => {
                      const curStock = row.stocks[viewingWarehouse.warehouse_id] ?? 0;
                      return (
                        <tr key={row.variantId} className="hover:bg-gray-50/60">
                          <td className="py-2 px-3">
                            <span className="font-bold text-[#342A24] block">{row.productName}</span>
                            <span className="text-[10px] text-gray-500">{row.variantName}</span>
                          </td>
                          <td className="py-2 px-3 font-mono text-gray-600 text-[11px]">{row.sku}</td>
                          <td className="py-2 px-3 text-center font-bold text-emerald-950">
                            {curStock}
                          </td>
                          <td className="py-2 px-3 text-right">
                            <div className="inline-flex items-center gap-1">
                              <button
                                onClick={() => handleStockUpdate(row.productId, row.variantId, viewingWarehouse.warehouse_id, -1)}
                                className="w-5 h-5 rounded bg-gray-100 hover:bg-gray-200 flex items-center justify-center cursor-pointer"
                              >
                                <Minus className="w-3 h-3" />
                              </button>
                              <button
                                onClick={() => handleStockUpdate(row.productId, row.variantId, viewingWarehouse.warehouse_id, 1)}
                                className="w-5 h-5 rounded bg-gray-100 hover:bg-gray-200 flex items-center justify-center cursor-pointer"
                              >
                                <Plus className="w-3 h-3" />
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

            <div className="pt-2 flex items-center justify-end">
              <button
                type="button"
                onClick={() => setViewingWarehouse(null)}
                className="px-5 py-2.5 rounded-xl bg-[#BFE9C3] hover:bg-[#aee0b3] text-[#16381D] font-extrabold text-xs shadow-xs border border-[#9ed4a3] cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
