"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Alert } from "@/components/ui/feedback";
import { errorMessage } from "@/lib/api/api-error";
import { apiRequest } from "@/lib/api/client";

import { type StockTakeStatus, stockTakeSchema } from "./schemas";

type Command = "submit" | "approve" | "cancel";
type ConfirmableCommand = "approve" | "cancel";

const CONFIRM_DIALOGS: Record<
  ConfirmableCommand,
  { title: string; description: string; confirmLabel: string; variant: "primary" | "danger" }
> = {
  approve: {
    title: "Duyệt phiếu kiểm kê",
    description:
      "Hệ thống sẽ ghi bút toán điều chỉnh tồn kho (ADJUSTMENT) vào sổ cái cho các dòng chênh lệch. Thao tác này không thể hoàn tác.",
    confirmLabel: "Xác nhận duyệt",
    variant: "primary",
  },
  cancel: {
    title: "Hủy phiếu kiểm kê",
    description: "Phiếu kiểm kê sẽ chuyển sang trạng thái đã hủy và không thể tiếp tục nhập số lượng thực tế.",
    confirmLabel: "Xác nhận hủy phiếu",
    variant: "danger",
  },
};

type Props = {
  stockTakeId: number;
  status: StockTakeStatus;
  canCount: boolean;
  canApprove: boolean;
  uncounted: number;
};

export function StockTakeActions({ stockTakeId, status, canCount, canApprove, uncounted }: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [confirmCommand, setConfirmCommand] = useState<ConfirmableCommand | null>(null);

  const command = useMutation({
    mutationFn: (name: Command) => apiRequest(`/stock-takes/${stockTakeId}/${name}`, stockTakeSchema, { method: "POST" }),
    onSuccess: () => {
      setConfirmCommand(null);
      void queryClient.invalidateQueries({ queryKey: ["product-picker"] });
      void queryClient.invalidateQueries({ queryKey: ["issue-preview"] });
      router.refresh();
    },
  });

  const buttons = [
    status === "COUNTING" && canCount && (
      <Button key="submit" disabled={command.isPending || uncounted > 0} onClick={() => command.mutate("submit")}>
        Gửi duyệt
      </Button>
    ),
    status === "SUBMITTED" && canApprove && (
      <Button
        key="approve"
        disabled={command.isPending}
        onClick={() => {
          command.reset();
          setConfirmCommand("approve");
        }}
      >
        Duyệt điều chỉnh
      </Button>
    ),
    (status === "COUNTING" || status === "SUBMITTED") && canCount && (
      <Button
        key="cancel"
        variant="danger"
        disabled={command.isPending}
        onClick={() => {
          command.reset();
          setConfirmCommand("cancel");
        }}
      >
        Hủy phiếu
      </Button>
    ),
  ].filter(Boolean);

  if (buttons.length === 0) return null;

  const dialogConfig = confirmCommand ? CONFIRM_DIALOGS[confirmCommand] : null;

  return (
    <div className="no-print flex flex-col items-end gap-2">
      <div className="flex flex-wrap justify-end gap-2">{buttons}</div>
      {status === "COUNTING" && uncounted > 0 ? (
        <p className="text-xs text-slate-500">Còn {uncounted} dòng chưa nhập số lượng thực tế.</p>
      ) : null}
      {status === "SUBMITTED" && canApprove ? (
        <p className="max-w-sm text-right text-xs text-slate-500">Người lập phiếu không được tự duyệt (tách nhiệm vụ).</p>
      ) : null}
      {command.error && !confirmCommand ? <Alert tone="danger">{errorMessage(command.error)}</Alert> : null}
      {confirmCommand && dialogConfig ? (
        <Dialog
          open
          onClose={() => {
            setConfirmCommand(null);
            command.reset();
          }}
          title={dialogConfig.title}
          footer={
            <>
              <Button
                variant="secondary"
                onClick={() => {
                  setConfirmCommand(null);
                  command.reset();
                }}
              >
                Quay lại
              </Button>
              <Button
                variant={dialogConfig.variant}
                disabled={command.isPending}
                onClick={() => command.mutate(confirmCommand)}
              >
                {command.isPending ? "Đang xử lý…" : dialogConfig.confirmLabel}
              </Button>
            </>
          }
        >
          <p className="text-sm text-slate-600">{dialogConfig.description}</p>
          {command.error ? (
            <div className="mt-3">
              <Alert tone="danger">{errorMessage(command.error)}</Alert>
            </div>
          ) : null}
        </Dialog>
      ) : null}
    </div>
  );
}
