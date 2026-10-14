"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { ReasonDialog } from "@/components/ui/reason-dialog";
import { errorMessage } from "@/lib/api/api-error";
import { apiCommand } from "@/lib/api/client";

import { BatchLabelButton, type BatchLabelData } from "./batch-label-dialog";
import { BatchTraceabilityButton } from "./batch-traceability-dialog";

type Props = {
  batchId: number;
  productId?: number;
  lotNumber: string;
  status: string;
  daysToExpiry: number;
  onHand?: number;
  canHold?: boolean;
  canDispose?: boolean;
  labelData?: BatchLabelData;
};

export function BatchActions({
  batchId,
  productId,
  lotNumber,
  status,
  daysToExpiry,
  onHand = 0,
  canHold = true,
  canDispose = false,
  labelData,
}: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isHoldOpen, setHoldOpen] = useState(false);

  const hold = useMutation({
    mutationFn: (reason: string) => apiCommand(`/batches/${batchId}/hold`, { body: { reason } }),
    onSuccess: () => {
      setHoldOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["product-picker"] });
      void queryClient.invalidateQueries({ queryKey: ["issue-preview"] });
      router.refresh();
    },
  });
  const release = useMutation({
    mutationFn: () => apiCommand(`/batches/${batchId}/release`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["product-picker"] });
      void queryClient.invalidateQueries({ queryKey: ["issue-preview"] });
      router.refresh();
    },
  });

  const isNotExpired = daysToExpiry > 0 && status !== "EXPIRED";
  const showRelease = canHold && status === "ON_HOLD" && isNotExpired;
  const showHold = canHold && (status === "AVAILABLE" || status === "QUARANTINE") && isNotExpired;
  const showDisposeLink =
    canDispose && productId !== undefined && onHand > 0 && (status === "EXPIRED" || status === "ON_HOLD" || daysToExpiry <= 0);

  return (
    <div className="no-print flex flex-col items-end gap-1">
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        {labelData ? <BatchLabelButton data={labelData} label="In tem" /> : null}
        <BatchTraceabilityButton batchId={batchId} lotNumber={lotNumber} />
        {showRelease ? (
          <Button size="sm" variant="secondary" onClick={() => release.mutate()} disabled={release.isPending}>
            {release.isPending ? "Đang mở khóa…" : "Mở khóa"}
          </Button>
        ) : null}
        {showHold ? (
          <Button size="sm" variant="ghost" onClick={() => setHoldOpen(true)}>
            Tạm khóa
          </Button>
        ) : null}
        {showDisposeLink ? (
          <Link href={`/batches?productId=${productId}`} className="text-xs font-medium text-red-700 hover:underline">
            Tạo phiếu hủy
          </Link>
        ) : null}
      </div>
      {release.error ? (
        <p role="alert" className="text-xs text-red-600">
          {errorMessage(release.error)}
        </p>
      ) : null}
      {showHold ? (
        <ReasonDialog
          open={isHoldOpen}
          onClose={() => {
            setHoldOpen(false);
            hold.reset();
          }}
          title={`Tạm khóa lô ${lotNumber}`}
          description="Lô bị tạm khóa sẽ không được phân bổ khi xuất kho cho đến khi mở khóa."
          label="Lý do tạm khóa (ví dụ: công văn thu hồi, nghi ngờ chất lượng)"
          confirmLabel="Tạm khóa lô"
          variant="danger"
          isPending={hold.isPending}
          error={hold.error ? errorMessage(hold.error) : undefined}
          onConfirm={(reason) => hold.mutate(reason)}
        />
      ) : null}
    </div>
  );
}

