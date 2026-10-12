export type Crumb = {
  href: string;
  label: string;
};

const ROOT_LABELS: Record<string, string> = {
  stock: "Tồn kho",
  warehouses: "Sơ đồ kho GSP",
  batches: "Lô & hạn dùng",
  receipts: "Nhập kho",
  issues: "Xuất kho (FEFO)",
  "stock-takes": "Kiểm kê",
  disposals: "Hủy thuốc",
  forecasting: "Dự báo nhu cầu",
  suggestions: "Đề xuất nhập",
  "purchase-orders": "Đơn mua hàng",
  suppliers: "Nhà cung cấp",
  products: "Danh mục thuốc",
  users: "Người dùng & RBAC",
};

const ACTION_LABELS: Record<string, string> = {
  new: "Tạo mới",
  edit: "Chỉnh sửa",
  receive: "Nhận hàng vào kho",
};

export function buildCrumbs(pathname: string): Crumb[] {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) {
    return [{ href: "/", label: "Tổng quan kho" }];
  }

  const crumbs: Crumb[] = [];
  let acc = "";
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!;
    acc += `/${seg}`;
    if (i === 0) {
      crumbs.push({ href: acc, label: ROOT_LABELS[seg] ?? seg });
    } else if (ACTION_LABELS[seg]) {
      crumbs.push({ href: acc, label: ACTION_LABELS[seg] });
    } else if (/^\d+$/.test(seg)) {
      crumbs.push({ href: acc, label: `#${seg}` });
    } else {
      crumbs.push({ href: acc, label: seg });
    }
  }
  return crumbs;
}
