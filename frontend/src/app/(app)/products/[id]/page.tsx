import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";
import { LoadingCard, Skeleton } from "@/components/ui/feedback";
import { can } from "@/features/auth/user";
import { getCurrentUser } from "@/features/auth/current-user";
import { ProductActions } from "@/features/catalog/product-actions";
import { productDetailSchema } from "@/features/catalog/schemas";
import { ProductForecastCard } from "@/features/forecasting/product-forecast-card";
import { storageCondition } from "@/features/inventory/labels";
import { ProductBatchesCard } from "@/features/inventory/product-batches-card";
import { StockCardTable } from "@/features/inventory/stock-card-table";
import { backendGet } from "@/lib/api/backend";
import { isoDate } from "@/lib/api/schemas";
import { formatCurrency, formatInteger } from "@/lib/format";
import { positiveIntParam, stringParam } from "@/lib/search-params";

export const metadata: Metadata = { title: "Chi tiết thuốc" };

function dateParam(value: string | string[] | undefined): string | undefined {
  const raw = stringParam(value);
  return raw && isoDate.safeParse(raw).success ? raw : undefined;
}

async function ProductView({ productId, from, to }: { productId: number; from?: string; to?: string }) {
  const [product, user] = await Promise.all([backendGet(`/products/${productId}`, productDetailSchema), getCurrentUser()]);
  const storage = storageCondition(product.storageCondition);
  const facts = [
    { label: "Hoạt chất", value: [product.activeIngredient, product.strength].filter(Boolean).join(" ") },
    { label: "Dạng bào chế", value: product.dosageForm ?? "—" },
    { label: "Số đăng ký", value: product.registrationNumber ?? "—" },
    { label: "Nhà sản xuất", value: product.manufacturer ?? "—" },
    { label: "Mã ATC", value: product.atcCode ?? "—" },
    { label: "Hạn dùng tối thiểu khi nhập", value: `${formatInteger(product.minShelfLifeOnReceiptDays)} ngày` },
    { label: "Giá tham chiếu", value: `${formatCurrency(product.referenceUnitCost)} / ${product.baseUnit}` },
    {
      label: "Quy cách",
      value: product.units.map((unit) => (unit.factorToBase === 1 ? unit.unitName : `${unit.unitName} = ${formatInteger(unit.factorToBase)} ${product.baseUnit}`)).join(" · "),
    },
  ];

  return (
    <>
      <header className="space-y-3">
        <nav aria-label="Đường dẫn" className="text-sm text-slate-500">
          <Link href="/products" className="hover:underline">
            Danh mục thuốc
          </Link>{" "}
          / <span className="text-slate-700">{product.sku}</span>
        </nav>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{product.name}</h1>
              <Badge tone={storage.tone}>{storage.label}</Badge>
              {product.prescriptionRequired ? <Badge tone="violet">Thuốc kê đơn</Badge> : null}
              {!product.active ? <Badge tone="neutral">Ngừng sử dụng</Badge> : null}
            </div>
            <p className="text-sm text-slate-500">
              {product.sku} · {product.categoryName} · Đơn vị cơ sở: {product.baseUnit}
            </p>
          </div>
          {can(user, "CATALOG_MANAGE") ? <ProductActions productId={product.id} active={product.active} /> : null}
        </div>
      </header>

      <Card>
        <CardBody>
          <dl className="grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
            {facts.map((fact) => (
              <div key={fact.label}>
                <dt className="text-slate-500">{fact.label}</dt>
                <dd className="mt-0.5 font-medium text-slate-900">{fact.value}</dd>
              </div>
            ))}
          </dl>
        </CardBody>
      </Card>

      {can(user, "FORECAST_READ") ? (
        <Suspense fallback={<LoadingCard label="Đang tải dự báo" rows={8} />}>
          <ProductForecastCard productId={product.id} unit={product.baseUnit} />
        </Suspense>
      ) : null}

      <Suspense fallback={<LoadingCard label="Đang tải danh sách lô" />}>
        <ProductBatchesCard productId={product.id} canHold={can(user, "BATCH_HOLD")} canDispose={can(user, "STOCK_DISPOSE")} />
      </Suspense>

      <Suspense fallback={<LoadingCard label="Đang tải thẻ kho" rows={8} />}>
        <StockCardTable productId={product.id} from={from} to={to} />
      </Suspense>
    </>
  );
}

function ProductSkeleton() {
  return (
    <div role="status" aria-label="Đang tải thông tin thuốc" className="space-y-4">
      <Skeleton className="h-8 w-80" />
      <Skeleton className="h-4 w-56" />
      <Skeleton className="h-32 w-full rounded-xl" />
    </div>
  );
}

export default function ProductPage({ params, searchParams }: PageProps<"/products/[id]">) {
  return (
    <Suspense fallback={<ProductSkeleton />}>
      {Promise.all([params, searchParams]).then(([{ id }, query]) => {
        const productId = positiveIntParam(id);
        if (!productId) notFound();
        return <ProductView productId={productId} from={dateParam(query.from)} to={dateParam(query.to)} />;
      })}
    </Suspense>
  );
}
