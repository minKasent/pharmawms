import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert, LoadingCard } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination, withQuery } from "@/components/ui/pagination";
import { SearchForm } from "@/components/ui/search-form";
import { EmptyRow, TBody, THead, Table, Td, Th } from "@/components/ui/table";
import { ExpiryCell } from "@/features/inventory/expiry-badge";
import { ExportMovementsButton } from "@/features/inventory/export-movements-button";
import { storageCondition } from "@/features/inventory/labels";
import { productStockPageSchema, reconciliationReportSchema } from "@/features/inventory/schemas";
import { backendGet } from "@/lib/api/backend";
import { formatCompactCurrency, formatCurrency, formatInteger } from "@/lib/format";
import { pageParam, stringParam } from "@/lib/search-params";

export const metadata: Metadata = { title: "Tồn kho" };

const PAGE_SIZE = 20;

async function StockTable({ search, page }: { search?: string; page: number }) {
  const [stock, reconciliation] = await Promise.all([
    backendGet(withQuery("/stock", { search, page, size: PAGE_SIZE }), productStockPageSchema),
    backendGet("/stock/reconciliation", reconciliationReportSchema),
  ]);
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <SearchForm action="/stock" defaultValue={search} label="Tìm thuốc" placeholder="Tìm theo tên thuốc hoặc mã SKU…" />
        {reconciliation.consistent ? (
          <Badge tone="success">Sổ cái khớp 100% ({formatInteger(reconciliation.totalBalances)} vị trí – lô)</Badge>
        ) : (
          <Badge tone="danger">Lệch sổ cái ({formatInteger(reconciliation.discrepancyCount)})</Badge>
        )}
      </div>
      {!reconciliation.consistent ? (
        <div className="border-b border-slate-100 px-5 py-3">
          <Alert tone="danger">
            Phát hiện {formatInteger(reconciliation.discrepancies.length)} chênh lệch giữa tồn thực tế và sổ cái nhập – xuất:{" "}
            {reconciliation.discrepancies
              .map(
                (item) =>
                  `Lô ${item.lotNumber} @ ${item.locationCode} (tồn ${formatInteger(item.balanceOnHand)}, sổ cái ${formatInteger(item.ledgerQuantity)})`,
              )
              .join("; ")}
          </Alert>
        </div>
      ) : null}
      <Table caption="Tồn kho theo mặt hàng">
        <THead>
          <tr>
            <Th>Thuốc</Th>
            <Th>Bảo quản</Th>
            <Th numeric>Khả dụng</Th>
            <Th numeric>Tạm khóa</Th>
            <Th numeric>Hết hạn</Th>
            <Th>Hạn gần nhất</Th>
            <Th numeric>Số lô</Th>
            <Th numeric>Giá trị</Th>
          </tr>
        </THead>
        <TBody>
          {stock.content.length === 0 ? (
            <EmptyRow colSpan={8}>Không có mặt hàng phù hợp.</EmptyRow>
          ) : (
            stock.content.map((item) => {
              const storage = storageCondition(item.storageCondition);
              return (
                <tr key={item.productId} className="hover:bg-slate-50">
                  <Td>
                    <Link href={`/products/${item.productId}`} className="font-medium text-slate-900 hover:underline">
                      {item.productName}
                    </Link>
                    <span className="block text-xs text-slate-500">
                      {item.sku} · {item.categoryName}
                    </span>
                  </Td>
                  <Td>
                    <Badge tone={storage.tone}>{storage.label}</Badge>
                  </Td>
                  <Td numeric>
                    <span className="font-medium">{formatInteger(item.available)}</span>{" "}
                    <span className="text-xs text-slate-500">{item.baseUnit}</span>
                  </Td>
                  <Td numeric className={item.onHold > 0 ? "text-amber-700" : "text-slate-400"}>
                    {formatInteger(item.onHold)}
                  </Td>
                  <Td numeric className={item.expired > 0 ? "font-medium text-red-700" : "text-slate-400"}>
                    {formatInteger(item.expired)}
                  </Td>
                  <Td>
                    <ExpiryCell expiryDate={item.nearestExpiry} daysToExpiry={item.daysToNearestExpiry} />
                  </Td>
                  <Td numeric>{formatInteger(item.batchCount)}</Td>
                  <Td numeric title={formatCurrency(item.stockValue)}>
                    {formatCompactCurrency(item.stockValue)}
                  </Td>
                </tr>
              );
            })
          )}
        </TBody>
      </Table>
      <Pagination
        page={stock.page}
        totalPages={stock.totalPages}
        totalElements={stock.totalElements}
        hrefFor={(target) => withQuery("/stock", { search, page: target })}
      />
    </>
  );
}

export default function StockPage({ searchParams }: PageProps<"/stock">) {
  return (
    <>
      <PageHeader
        title="Tồn kho"
        description="Tồn theo mặt hàng, tổng hợp từ sổ cái nhập – xuất của từng lô"
        actions={
          <div className="no-print flex flex-wrap items-center gap-2">
            <ButtonLink href="/warehouses" variant="secondary">
              Sơ đồ kho GSP 2D
            </ButtonLink>
            <ExportMovementsButton />
          </div>
        }
      />
      <Suspense fallback={<LoadingCard label="Đang tải tồn kho" rows={10} />}>
        {searchParams.then((params) => (
          <Card>
            <StockTable search={stringParam(params.search)} page={pageParam(params.page)} />
          </Card>
        ))}
      </Suspense>
    </>
  );
}

