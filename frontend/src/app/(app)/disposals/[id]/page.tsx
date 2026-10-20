import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { LoadingCard } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { PrintButton } from "@/components/ui/print-button";
import { TBody, THead, Table, Td, Th } from "@/components/ui/table";
import { disposalLinesSchema, disposalSchema } from "@/features/inventory/schemas";
import { backendGet } from "@/lib/api/backend";
import { formatCurrency, formatDate, formatDateTime, formatInteger } from "@/lib/format";
import { positiveIntParam } from "@/lib/search-params";

export const metadata: Metadata = { title: "Biên bản hủy" };

async function DisposalView({ disposalId }: { disposalId: number }) {
  const [disposal, lines] = await Promise.all([
    backendGet(`/disposals/${disposalId}`, disposalSchema),
    backendGet(`/disposals/${disposalId}/lines`, disposalLinesSchema),
  ]);

  return (
    <>
      <PageHeader
        title={`Biên bản hủy ${disposal.code}`}
        description={`Lập lúc ${formatDateTime(disposal.disposedAt)} bởi ${disposal.disposedByName ?? "—"}`}
        actions={<PrintButton label="In phiếu" />}
      />
      <Card>
        <CardBody>
          <dl className="grid gap-4 text-sm sm:grid-cols-3">
            <div className="sm:col-span-2">
              <dt className="text-slate-500">Lý do / căn cứ</dt>
              <dd className="mt-0.5 font-medium text-slate-900">{disposal.reason}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Tổng giá trị hủy</dt>
              <dd className="mt-0.5 text-lg font-semibold text-red-700 tabular-nums">{formatCurrency(disposal.totalValue)}</dd>
            </div>
          </dl>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Chi tiết lô hủy" description={`${formatInteger(lines.length)} dòng`} />
        <Table caption="Các lô và số lượng đã hủy">
          <THead>
            <tr>
              <Th>Thuốc</Th>
              <Th>Số lô</Th>
              <Th>Hạn dùng</Th>
              <Th>Vị trí</Th>
              <Th numeric>Số lượng</Th>
              <Th numeric>Giá trị</Th>
            </tr>
          </THead>
          <TBody>
            {lines.map((line) => (
              <tr key={`${line.batchId}-${line.locationCode}`}>
                <Td>
                  <Link href={`/products/${line.productId}`} className="font-medium text-slate-900 hover:underline">
                    {line.productName}
                  </Link>
                  <span className="block text-xs text-slate-500">{line.sku}</span>
                </Td>
                <Td className="font-mono text-xs">{line.lotNumber}</Td>
                <Td>{formatDate(line.expiryDate)}</Td>
                <Td className="text-xs">{line.locationCode}</Td>
                <Td numeric>
                  {formatInteger(line.quantity)} <span className="text-xs text-slate-500">{line.baseUnit}</span>
                </Td>
                <Td numeric>{formatCurrency(line.value)}</Td>
              </tr>
            ))}
          </TBody>
        </Table>
      </Card>
    </>
  );
}

export default function DisposalPage({ params }: PageProps<"/disposals/[id]">) {
  return (
    <Suspense fallback={<LoadingCard label="Đang tải biên bản hủy" rows={6} />}>
      {params.then(({ id }) => {
        const disposalId = positiveIntParam(id);
        if (!disposalId) notFound();
        return <DisposalView disposalId={disposalId} />;
      })}
    </Suspense>
  );
}
