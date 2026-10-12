"use client";

import { useQuery } from "@tanstack/react-query";
import Boxes from "lucide-react/dist/esm/icons/boxes";
import CalendarClock from "lucide-react/dist/esm/icons/calendar-clock";
import ChartLine from "lucide-react/dist/esm/icons/chart-line";
import ClipboardCheck from "lucide-react/dist/esm/icons/clipboard-check";
import LayoutDashboard from "lucide-react/dist/esm/icons/layout-dashboard";
import PackageMinus from "lucide-react/dist/esm/icons/package-minus";
import PackagePlus from "lucide-react/dist/esm/icons/package-plus";
import Pill from "lucide-react/dist/esm/icons/pill";
import Search from "lucide-react/dist/esm/icons/search";
import ShoppingCart from "lucide-react/dist/esm/icons/shopping-cart";
import Sparkles from "lucide-react/dist/esm/icons/sparkles";
import Trash2 from "lucide-react/dist/esm/icons/trash-2";
import Truck from "lucide-react/dist/esm/icons/truck";
import Users from "lucide-react/dist/esm/icons/users";
import Warehouse from "lucide-react/dist/esm/icons/warehouse";
import X from "lucide-react/dist/esm/icons/x";
import type { LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { type KeyboardEvent as ReactKeyboardEvent, useEffect, useId, useMemo, useRef, useState } from "react";
import { z } from "zod";

import type { Permission } from "@/features/auth/user";
import { apiRequest } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import { formatInteger } from "@/lib/format";
import { useDebouncedValue } from "@/lib/use-debounced-value";

type CommandAction = {
  id: string;
  label: string;
  subtitle: string;
  href: string;
  category: "Thao tác nhanh" | "Điều hướng trang";
  keywords: string;
  icon: LucideIcon;
  anyOf: Permission[];
};

const COMMAND_ACTIONS: readonly CommandAction[] = [
  {
    id: "act-issue-new",
    label: "Lập phiếu xuất kho (FEFO)",
    subtitle: "Tự động phân bổ lô hết hạn sớm nhất trước",
    href: "/issues/new",
    category: "Thao tác nhanh",
    keywords: "xuat kho fefo tao phieu xuat issue new",
    icon: PackageMinus,
    anyOf: ["STOCK_ISSUE"],
  },
  {
    id: "act-receipt-new",
    label: "Lập phiếu nhập kho (GSP)",
    subtitle: "Ghi nhận lô mới, hạn dùng, nhiệt độ bảo quản và kệ",
    href: "/receipts/new",
    category: "Thao tác nhanh",
    keywords: "nhap kho gsp tao phieu nhap receipt new",
    icon: PackagePlus,
    anyOf: ["STOCK_RECEIVE"],
  },
  {
    id: "act-po-new",
    label: "Tạo đơn mua hàng mới (PO)",
    subtitle: "Khởi tạo đơn đặt hàng gửi nhà cung cấp dược phẩm",
    href: "/purchase-orders/new",
    category: "Thao tác nhanh",
    keywords: "tao don mua hang po purchase order new",
    icon: ShoppingCart,
    anyOf: ["PURCHASE_ORDER_MANAGE"],
  },
  {
    id: "act-stocktake-new",
    label: "Tạo đợt kiểm kê kho mới",
    subtitle: "Chụp ảnh tồn sổ sách và đếm thực tế từng lô trên kệ",
    href: "/stock-takes/new",
    category: "Thao tác nhanh",
    keywords: "kiem ke kho stock take new",
    icon: ClipboardCheck,
    anyOf: ["STOCK_COUNT"],
  },
  {
    id: "act-product-new",
    label: "Thêm thuốc mới vào danh mục",
    subtitle: "Khai báo hoạt chất, đơn vị quy đổi, phân loại ABC/VEN",
    href: "/products/new",
    category: "Thao tác nhanh",
    keywords: "them thuoc moi danh muc product new",
    icon: Pill,
    anyOf: ["CATALOG_MANAGE"],
  },
  {
    id: "act-batches-expired",
    label: "Lọc các lô đã hết hạn cần xử lý hủy",
    subtitle: "Danh sách lô trạng thái EXPIRED để lập biên bản tiêu hủy",
    href: "/batches?status=EXPIRED",
    category: "Thao tác nhanh",
    keywords: "lo het han huy thuoc expired batches",
    icon: Trash2,
    anyOf: ["STOCK_READ"],
  },
  {
    id: "act-batches-near",
    label: "Lọc các lô cận hạn ≤ 90 ngày",
    subtitle: "Danh sách lô sắp hết hạn cần ưu tiên xuất FEFO",
    href: "/batches?expiringWithinDays=90",
    category: "Thao tác nhanh",
    keywords: "lo can han 90 ngay near expiry fefo",
    icon: CalendarClock,
    anyOf: ["STOCK_READ"],
  },
  {
    id: "nav-dashboard",
    label: "Tổng quan kho",
    subtitle: "KPI tồn kho, biểu đồ xuất 30 ngày & bản đồ nhiệt hạn dùng",
    href: "/",
    category: "Điều hướng trang",
    keywords: "tong quan dashboard trang chu",
    icon: LayoutDashboard,
    anyOf: ["DASHBOARD_READ"],
  },
  {
    id: "nav-stock",
    label: "Tồn kho theo mặt hàng",
    subtitle: "Tra cứu tồn thực tế, khả dụng, cận hạn và thẻ kho sổ cái",
    href: "/stock",
    category: "Điều hướng trang",
    keywords: "ton kho stock the kho",
    icon: Boxes,
    anyOf: ["STOCK_READ"],
  },
  {
    id: "nav-warehouses",
    label: "Sơ đồ kho GSP",
    subtitle: "Khu vực nhiệt độ (Kho mát, Kho lạnh 2–8°C, Kho thường) & kệ",
    href: "/warehouses",
    category: "Điều hướng trang",
    keywords: "so do kho gsp ke khu vuc warehouses",
    icon: Warehouse,
    anyOf: ["STOCK_READ"],
  },
  {
    id: "nav-batches",
    label: "Lô & hạn dùng (Truy vết GSP)",
    subtitle: "Quản lý vòng đời lô, tạm khóa/mở khóa và truy xuất nguồn gốc",
    href: "/batches",
    category: "Điều hướng trang",
    keywords: "lo han dung truy vet gsp batches",
    icon: CalendarClock,
    anyOf: ["STOCK_READ"],
  },
  {
    id: "nav-forecasting",
    label: "Dự báo nhu cầu AI (LightGBM)",
    subtitle: "Dự báo chuỗi thời gian P10/P50/P90, WAPE, MASE & Benchmark (s, S)",
    href: "/forecasting",
    category: "Điều hướng trang",
    keywords: "du bao nhu cau ai lightgbm forecasting",
    icon: ChartLine,
    anyOf: ["FORECAST_READ"],
  },
  {
    id: "nav-suggestions",
    label: "Đề xuất nhập hàng (Chính sách s, S)",
    subtitle: "Giải phẫu công thức đặt hàng và gộp đơn mua nháp theo NCC",
    href: "/suggestions",
    category: "Điều hướng trang",
    keywords: "de xuat nhap hang s S suggestions",
    icon: Sparkles,
    anyOf: ["FORECAST_READ"],
  },
  {
    id: "nav-pos",
    label: "Đơn mua hàng (PO)",
    subtitle: "Theo dõi đơn nháp, phê duyệt, gửi NCC và nhận hàng từng phần",
    href: "/purchase-orders",
    category: "Điều hướng trang",
    keywords: "don mua hang po purchase orders",
    icon: ShoppingCart,
    anyOf: ["PURCHASE_ORDER_READ"],
  },
  {
    id: "nav-suppliers",
    label: "Nhà cung cấp dược phẩm",
    subtitle: "Danh bạ nhà cung cấp, thời gian giao hàng (Lead time) & MOQ",
    href: "/suppliers",
    category: "Điều hướng trang",
    keywords: "nha cung cap suppliers",
    icon: Truck,
    anyOf: ["PURCHASE_ORDER_READ"],
  },
  {
    id: "nav-products",
    label: "Danh mục thuốc",
    subtitle: "Thông tin dược chất, dạng bào chế, quy cách đóng gói",
    href: "/products",
    category: "Điều hướng trang",
    keywords: "danh muc thuoc products catalog",
    icon: Pill,
    anyOf: ["CATALOG_READ"],
  },
  {
    id: "nav-users",
    label: "Quản trị người dùng & RBAC",
    subtitle: "Tạo tài khoản, cấp quyền và khóa/mở người dùng",
    href: "/users",
    category: "Điều hướng trang",
    keywords: "nguoi dung users admin rbac",
    icon: Users,
    anyOf: ["USER_MANAGE"],
  },
];

const quickProductHitSchema = z.object({
  content: z.array(
    z.object({
      id: z.number(),
      sku: z.string(),
      name: z.string(),
      baseUnit: z.string(),
      activeIngredient: z.string().nullish(),
    }),
  ),
});

function normalizeText(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d");
}

export function CommandPalette({ permissions }: { permissions: Permission[] }) {
  const router = useRouter();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const debouncedQuery = useDebouncedValue(query.trim(), 180);
  const canSearchCatalog = permissions.includes("CATALOG_READ");
  const shouldSearchProducts = open && canSearchCatalog && debouncedQuery.length >= 1;

  const productSearch = useQuery({
    queryKey: ["command-palette-products", debouncedQuery],
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({ size: "5", search: debouncedQuery });
      return apiRequest(`/products?${params.toString()}`, quickProductHitSchema, { signal });
    },
    enabled: shouldSearchProducts,
  });

  function openPalette() {
    setQuery("");
    setActiveIndex(0);
    setOpen(true);
  }

  function closePalette() {
    setOpen(false);
    setQuery("");
    setActiveIndex(0);
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((current) => {
          const next = !current;
          if (!next) {
            setQuery("");
            setActiveIndex(0);
          }
          return next;
        });
      } else if (event.key === "Escape" && open) {
        setOpen(false);
        setQuery("");
        setActiveIndex(0);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  useEffect(() => {
    if (open) {
      const timer = setTimeout(() => inputRef.current?.focus(), 10);
      return () => clearTimeout(timer);
    }
  }, [open]);

  const permittedActions = useMemo(
    () => COMMAND_ACTIONS.filter((action) => action.anyOf.some((perm) => permissions.includes(perm))),
    [permissions],
  );

  const filteredActions = useMemo(() => {
    const trimmed = normalizeText(query.trim());
    if (!trimmed) return permittedActions;
    return permittedActions.filter((action) => {
      const haystack = normalizeText(`${action.label} ${action.subtitle} ${action.keywords}`);
      return haystack.includes(trimmed);
    });
  }, [permittedActions, query]);

  const combinedItems = useMemo(() => {
    const hits = shouldSearchProducts ? (productSearch.data?.content ?? []) : [];
    const productItems = hits.map((hit) => ({
      id: `prod-${hit.id}`,
      label: hit.name,
      subtitle: `${hit.sku}${hit.activeIngredient ? ` · ${hit.activeIngredient}` : ""} · ĐVT: ${hit.baseUnit}`,
      href: `/products/${hit.id}`,
      category: "Thuốc trong danh mục" as const,
      icon: Pill,
    }));
    const actionItems = filteredActions.map((item) => ({
      id: item.id,
      label: item.label,
      subtitle: item.subtitle,
      href: item.href,
      category: item.category,
      icon: item.icon,
    }));
    return [...productItems, ...actionItems];
  }, [shouldSearchProducts, productSearch.data, filteredActions]);

  function navigateTo(href: string) {
    closePalette();
    router.push(href);
  }

  function handleInputKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (combinedItems.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((prev) => (prev + 1) % combinedItems.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((prev) => (prev - 1 + combinedItems.length) % combinedItems.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const target = combinedItems[activeIndex] ?? combinedItems[0];
      if (target) {
        navigateTo(target.href);
      }
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={openPalette}
        aria-label="Mở bảng tìm kiếm và thao tác nhanh (Ctrl+K)"
        className="inline-flex h-9 items-center gap-2.5 rounded-lg border border-slate-200 bg-slate-50/90 px-3 text-xs text-slate-500 transition-colors hover:border-slate-300 hover:bg-slate-100 hover:text-slate-800"
      >
        <Search aria-hidden="true" className="size-3.5 text-slate-400" />
        <span className="max-md:hidden">Tìm thuốc, lô, thao tác nhanh…</span>
        <span className="md:hidden">Tìm nhanh…</span>
        <kbd className="rounded border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[10px] font-medium text-slate-500 shadow-2xs max-sm:hidden">
          Ctrl K
        </kbd>
      </button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Bảng điều khiển và tìm kiếm nhanh"
          className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/45 px-4 pt-16 pb-6 backdrop-blur-[2px] sm:pt-24"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closePalette();
            }
          }}
        >
          <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-3">
              <Search aria-hidden="true" className="size-4 shrink-0 text-brand-600" />
              <label htmlFor={inputId} className="sr-only">
                Tìm kiếm nhanh thuốc hoặc chức năng
              </label>
              <input
                ref={inputRef}
                id={inputId}
                type="search"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setActiveIndex(0);
                }}
                onKeyDown={handleInputKeyDown}
                placeholder="Gõ tên thuốc, mã SKU, hoạt chất hoặc lệnh (VD: xuất kho, nhập kho, dự báo)…"
                className="w-full bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
              />
              {productSearch.isFetching ? (
                <span className="shrink-0 text-[11px] text-slate-400">Đang tìm…</span>
              ) : null}
              <button
                type="button"
                aria-label="Đóng bảng tìm kiếm"
                onClick={closePalette}
                className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X aria-hidden="true" className="size-4" />
              </button>
            </div>

            <div className="max-h-96 overflow-y-auto p-2">
              {combinedItems.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-slate-500">
                  Không tìm thấy thuốc hoặc chức năng phù hợp với &ldquo;{query}&rdquo;.
                </p>
              ) : (
                <ul role="listbox" aria-label="Kết quả tìm kiếm nhanh" className="space-y-1">
                  {combinedItems.map((item, idx) => {
                    const Icon = item.icon;
                    const active = idx === activeIndex;
                    const prevCategory = idx > 0 ? combinedItems[idx - 1]?.category : null;
                    const showCategoryHeader = item.category !== prevCategory;
                    return (
                      <li key={item.id} role="option" aria-selected={active}>
                        {showCategoryHeader ? (
                          <p className="px-3 pt-2 pb-1 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
                            {item.category}
                          </p>
                        ) : null}
                        <button
                          type="button"
                          onMouseEnter={() => setActiveIndex(idx)}
                          onClick={() => navigateTo(item.href)}
                          className={cn(
                            "flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left transition-colors",
                            active ? "bg-brand-50 text-brand-900" : "text-slate-700 hover:bg-slate-50",
                          )}
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <span
                              className={cn(
                                "flex size-8 shrink-0 items-center justify-center rounded-lg border",
                                active
                                  ? "border-brand-200 bg-brand-600 text-white"
                                  : "border-slate-200 bg-slate-50 text-slate-600",
                              )}
                            >
                              <Icon aria-hidden="true" className="size-4" />
                            </span>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-slate-900">{item.label}</p>
                              <p className="truncate text-xs text-slate-500">{item.subtitle}</p>
                            </div>
                          </div>
                          <span className="shrink-0 font-mono text-[11px] text-slate-400">↵</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-4 py-2 text-[11px] text-slate-500">
              <span>
                Dùng phím <kbd className="rounded border border-slate-200 bg-white px-1 font-mono">↑</kbd>{" "}
                <kbd className="rounded border border-slate-200 bg-white px-1 font-mono">↓</kbd> để chọn ·{" "}
                <kbd className="rounded border border-slate-200 bg-white px-1 font-mono">Enter</kbd> để mở
              </span>
              <span>{formatInteger(combinedItems.length)} mục khả dụng</span>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
