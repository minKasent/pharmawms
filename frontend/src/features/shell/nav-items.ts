import type { Permission, SessionUser } from "@/features/auth/user";

export type NavIcon =
  | "dashboard"
  | "stock"
  | "warehouses"
  | "batches"
  | "receipts"
  | "issues"
  | "stockTakes"
  | "disposals"
  | "suggestions"
  | "purchaseOrders"
  | "suppliers"
  | "forecasting"
  | "products"
  | "users";

export type NavItem = { href: string; label: string; icon: NavIcon };
export type NavGroup = { label: string; icon?: NavIcon; items: NavItem[] };

type GuardedItem = NavItem & { anyOf: Permission[] };

const NAVIGATION: Array<{ label: string; items: GuardedItem[] }> = [
  {
    label: "Kho",
    items: [
      { href: "/", label: "Tổng quan", icon: "dashboard", anyOf: ["DASHBOARD_READ"] },
      { href: "/stock", label: "Tồn kho", icon: "stock", anyOf: ["STOCK_READ"] },
      { href: "/warehouses", label: "Sơ đồ kho GSP", icon: "warehouses", anyOf: ["STOCK_READ"] },
      { href: "/batches", label: "Lô & hạn dùng", icon: "batches", anyOf: ["STOCK_READ"] },
      { href: "/receipts", label: "Nhập kho", icon: "receipts", anyOf: ["STOCK_READ"] },
      { href: "/issues", label: "Xuất kho (FEFO)", icon: "issues", anyOf: ["STOCK_READ"] },
      { href: "/stock-takes", label: "Kiểm kê", icon: "stockTakes", anyOf: ["STOCK_READ"] },
      { href: "/disposals", label: "Hủy thuốc", icon: "disposals", anyOf: ["STOCK_READ"] },
    ],
  },
  {
    label: "Dự báo & mua hàng",
    items: [
      { href: "/forecasting", label: "Dự báo nhu cầu", icon: "forecasting", anyOf: ["FORECAST_READ"] },
      { href: "/suggestions", label: "Đề xuất nhập", icon: "suggestions", anyOf: ["FORECAST_READ"] },
      { href: "/purchase-orders", label: "Đơn mua hàng", icon: "purchaseOrders", anyOf: ["PURCHASE_ORDER_READ"] },
      { href: "/suppliers", label: "Nhà cung cấp", icon: "suppliers", anyOf: ["PURCHASE_ORDER_READ"] },
    ],
  },
  {
    label: "Danh mục",
    items: [
      { href: "/products", label: "Thuốc", icon: "products", anyOf: ["CATALOG_READ"] },
      { href: "/users", label: "Người dùng", icon: "users", anyOf: ["USER_MANAGE"] },
    ],
  },
];

export function navigationFor(user: SessionUser): NavGroup[] {
  return NAVIGATION.map((group) => ({
    label: group.label,
    items: group.items
      .filter((item) => item.anyOf.some((permission) => user.permissions.includes(permission)))
      .map(({ href, label, icon }) => ({ href, label, icon })),
  })).filter((group) => group.items.length > 0);
}
