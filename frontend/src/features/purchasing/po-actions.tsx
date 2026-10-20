"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button, ButtonLink } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { ReasonDialog } from "@/components/ui/reason-dialog";
import { errorMessage } from "@/lib/api/api-error";
import { apiRequest } from "@/lib/api/client";

import { type PurchaseOrderStatus, purchaseOrderSchema } from "./schemas";

type Command = "submit" | "approve" | "send";
type ReasonCommand = "reject" | "cancel" | "close";

type Props = {
  orderId: number;
  status: PurchaseOrderStatus;
  canManage: boolean;
  canApprove: boolean;
  canReceive: boolean;
};

const REASON_DIALOGS: Record<ReasonCommand, { title: string; description: string; confirm: string }> = {
  reject: {
    title: "Từ chối đơn mua",
    description: "Đơn quay về trạng thái nháp để người lập chỉnh sửa và gửi duyệt lại.",
    confirm: "Từ chối",
  },
  cancel: { title: "Hủy đơn mua", description: "Đơn bị hủy sẽ không thể khôi phục.", confirm: "Hủy đơn" },
  close: {
    title: "Đóng đơn khi còn thiếu hàng",
    description: "Phần còn lại sẽ không được chờ nhận nữa và được tính lại trong lần đề xuất nhập kế tiếp.",
    confirm: "Đóng đơn",
  },
};

const CANCELLABLE: readonly PurchaseOrderStatus[] = ["DRAFT", "PENDING_APPROVAL", "APPROVED", "SENT"];
const RECEIVABLE: readonly PurchaseOrderStatus[] = ["SENT", "PARTIALLY_RECEIVED"];

export function PoActions({ orderId, status, canManage, canApprove, canReceive }: Props) {
  const router = useRouter();
  const [dialog, setDialog] = useState<ReasonCommand | null>(null);

  const command = useMutation({
    mutationFn: ({ name, reason }: { name: Command | ReasonCommand; reason?: string }) =>
      apiRequest(`/purchase-orders/${orderId}/${name}`, purchaseOrderSchema, {
        method: "POST",
        body: reason === undefined ? undefined : { reason },
      }),
    onSuccess: () => {
      setDialog(null);
      router.refresh();
    },
  });

  const run = (name: Command) => command.mutate({ name });
  const isPending = command.isPending;
  const buttons = [
    status === "DRAFT" && canManage && (
      <ButtonLink key="edit" href={`/purchase-orders/${orderId}/edit`} variant="secondary">
        Sửa đơn
      </ButtonLink>
    ),
    status === "DRAFT" && canManage && (
      <Button key="submit" onClick={() => run("submit")} disabled={isPending}>
        Gửi duyệt
      </Button>
    ),
    status === "PENDING_APPROVAL" && canApprove && (
      <Button key="reject" variant="secondary" onClick={() => setDialog("reject")} disabled={isPending}>
        Từ chối
      </Button>
    ),
    status === "PENDING_APPROVAL" && canApprove && (
      <Button key="approve" onClick={() => run("approve")} disabled={isPending}>
        Duyệt đơn
      </Button>
    ),
    status === "APPROVED" && canManage && (
      <Button key="send" onClick={() => run("send")} disabled={isPending}>
        Đánh dấu đã gửi NCC
      </Button>
    ),
    RECEIVABLE.includes(status) && canReceive && (
      <ButtonLink key="receive" href={`/purchase-orders/${orderId}/receive`}>
        Nhận hàng
      </ButtonLink>
    ),
    status === "PARTIALLY_RECEIVED" && canManage && (
      <Button key="close" variant="secondary" onClick={() => setDialog("close")} disabled={isPending}>
        Đóng đơn (thiếu hàng)
      </Button>
    ),
    CANCELLABLE.includes(status) && canManage && (
      <Button key="cancel" variant="ghost" onClick={() => setDialog("cancel")} disabled={isPending}>
        Hủy đơn
      </Button>
    ),
  ].filter(Boolean);

  if (buttons.length === 0) {
    return null;
  }
  const errorText = command.error ? errorMessage(command.error) : undefined;
  const dialogConfig = dialog ? REASON_DIALOGS[dialog] : null;

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap justify-end gap-2">{buttons}</div>
      {errorText && !dialog ? (
        <div className="max-w-md">
          <Alert tone="danger">{errorText}</Alert>
        </div>
      ) : null}
      {dialog && dialogConfig ? (
        <ReasonDialog
          open
          onClose={() => {
            setDialog(null);
            command.reset();
          }}
          title={dialogConfig.title}
          description={dialogConfig.description}
          confirmLabel={dialogConfig.confirm}
          variant="danger"
          maxLength={500}
          isPending={isPending}
          error={errorText}
          onConfirm={(reason) => command.mutate({ name: dialog, reason })}
        />
      ) : null}
    </div>
  );
}
