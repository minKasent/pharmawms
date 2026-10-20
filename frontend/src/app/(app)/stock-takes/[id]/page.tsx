import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { LoadingCard } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { PrintButton } from "@/components/ui/print-button";
import { getCurrentUser } from "@/features/auth/current-user";
import { can } from "@/features/auth/user";
import { STOCK_TAKE_STATUS_LABEL } from "@/features/inventory/labels";
import { StockTakeActions } from "@/features/inventory/stock-take-actions";
import { StockTakeCountForm } from "@/features/inventory/stock-take-count-form";
import { stockTakeSchema } from "@/features/inventory/schemas";
import { backendGet } from "@/lib/api/backend";
import { formatDateTime, formatInteger } from "@/lib/format";
import { positiveIntParam } from "@/lib/search-params";

export const metadata: Metadata = { title: "Phiếu kiểm kê" };

async function DetailView({ stockTakeId }: { stockTakeId: number }) {
  const [user, stockTake] = await Promise.all([
    getCurrentUser(),
    backendGet(`/stock-takes/${stockTakeId}`, stockTakeSchema),
  ]);
  const { header, lines } = stockTake;
  const status = STOCK_TAKE_STATUS_LABEL[header.status];
  const uncounted = lines.filter((line) => line.countedQuantity == null).length;
  const facts = [
    { label: "Khu vực", value: header.zoneCode },
    { label: "Người lập", value: `${header.createdByName ?? "—"} · ${formatDateTime(header.createdAt)}` },
    { label: "Người duyệt", value: header.approvedByName ? `${header.approvedByName} · ${formatDateTime(header.approvedAt)}` : "—" },
    { label: "Chênh lệch", value: `${formatInteger(header.differenceCount)} / ${formatInteger(header.lineCount)} dòng` },
  ];

  return (
    <>
      <nav aria-label="Đường dẫn" className="no-print text-sm text-slate-500">
        <Link href="/stock-takes" className="hover:underline">
          Kiểm kê
        </Link>{" "}
        / <span className="text-slate-700">{header.code}</span>
      </nav>
      <PageHeader
        title={`Phiếu ${header.code}`}
        description="Snapshot tồn theo lô tại thời điểm lập phiếu; duyệt sẽ ghi điều chỉnh vào sổ cái."
        actions={
          <>
            <Badge tone={status.tone}>{status.label}</Badge>
            <PrintButton label="In phiếu" />
            <StockTakeActions
              stockTakeId={header.id}
              status={header.status}
              canCount={can(user, "STOCK_COUNT")}
              canApprove={can(user, "STOCK_ADJUST_APPROVE")}
              uncounted={uncounted}
            />
          </>
        }
      />
      <Card>
        <CardBody>
          <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
            {facts.map((fact) => (
              <div key={fact.label}>
                <dt className="text-slate-500">{fact.label}</dt>
                <dd className="mt-0.5 font-medium text-slate-900">{fact.value}</dd>
              </div>
            ))}
          </dl>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Dòng kiểm kê" description={`${formatInteger(lines.length)} dòng · còn ${formatInteger(uncounted)} chưa nhập`} />
        <StockTakeCountForm
          key={`${header.id}-${header.status}-${lines.map((line) => line.countedQuantity).join(",")}`}
          stockTakeId={header.id}
          lines={lines}
          editable={header.status === "COUNTING" && can(user, "STOCK_COUNT")}
        />
      </Card>
    </>
  );
}

export default function StockTakeDetailPage({ params }: PageProps<"/stock-takes/[id]">) {
  return (
    <Suspense fallback={<LoadingCard label="Đang tải phiếu kiểm kê" rows={10} />}>
      {params.then(({ id }) => {
        const stockTakeId = positiveIntParam(id);
        if (!stockTakeId) notFound();
        return <DetailView stockTakeId={stockTakeId} />;
      })}
    </Suspense>
  );
}
