import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { LoadingCard } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { PrintButton } from "@/components/ui/print-button";
import { AllocationTable } from "@/features/inventory/allocation-table";
import { issueSchema } from "@/features/inventory/schemas";
import { backendGet } from "@/lib/api/backend";
import { formatDateTime, formatInteger } from "@/lib/format";
import { positiveIntParam } from "@/lib/search-params";

export const metadata: Metadata = { title: "Phiếu xuất" };

async function IssueView({ issueId }: { issueId: number }) {
  const issue = await backendGet(`/goods-issues/${issueId}`, issueSchema);
  const facts = [
    { label: "Nơi nhận", value: issue.destination },
    { label: "Thời gian", value: formatDateTime(issue.issuedAt) },
    { label: "Người xuất", value: issue.issuedByName ?? "—" },
    { label: "Hạn dùng còn lại tối thiểu", value: `${formatInteger(issue.minRemainingShelfLifeDays)} ngày` },
  ];
  return (
    <>
      <PageHeader
        title={`Phiếu xuất ${issue.code}`}
        description={issue.note ?? undefined}
        actions={<PrintButton label="In phiếu" />}
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
      <div className="grid gap-4 md:grid-cols-2">
        {issue.lines.map((line) => (
          <Card key={line.productId}>
            <CardHeader
              headingLevel="h3"
              title={
                <Link href={`/products/${line.productId}`} className="hover:underline">
                  {line.productName}
                </Link>
              }
              description={`${line.sku} · ${formatInteger(line.quantity)} ${line.baseUnit} từ ${line.allocations.length} lô`}
            />
            <CardBody>
              <AllocationTable allocations={line.allocations} unit={line.baseUnit} />
            </CardBody>
          </Card>
        ))}
      </div>
    </>
  );
}

export default function IssuePage({ params }: PageProps<"/issues/[id]">) {
  return (
    <Suspense fallback={<LoadingCard label="Đang tải phiếu xuất" rows={6} />}>
      {params.then(({ id }) => {
        const issueId = positiveIntParam(id);
        if (!issueId) notFound();
        return <IssueView issueId={issueId} />;
      })}
    </Suspense>
  );
}
