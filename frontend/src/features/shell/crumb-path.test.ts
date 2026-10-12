import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildCrumbs } from "./crumb-path.ts";

describe("buildCrumbs", () => {
  it("builds root dashboard crumb for /", () => {
    assert.deepEqual(buildCrumbs("/"), [{ href: "/", label: "Tổng quan kho" }]);
  });

  it("builds nested crumbs for purchase order receiving", () => {
    assert.deepEqual(buildCrumbs("/purchase-orders/12/receive"), [
      { href: "/purchase-orders", label: "Đơn mua hàng" },
      { href: "/purchase-orders/12", label: "#12" },
      { href: "/purchase-orders/12/receive", label: "Nhận hàng vào kho" },
    ]);
  });

  it("builds nested crumbs for product editing", () => {
    assert.deepEqual(buildCrumbs("/products/5/edit"), [
      { href: "/products", label: "Danh mục thuốc" },
      { href: "/products/5", label: "#5" },
      { href: "/products/5/edit", label: "Chỉnh sửa" },
    ]);
  });
});
