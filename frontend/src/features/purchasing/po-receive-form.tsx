"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { type FormEvent, useId, useRef, useState } from "react";
import { z } from "zod";

import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert, EmptyState } from "@/components/ui/feedback";
import { Field, Textarea } from "@/components/ui/field";
import type { LocationOption } from "@/features/inventory/locations";
import { ReceiptLineFields, type ReceiptLineDraft } from "@/features/inventory/receipt-line-fields";
import { type ReceiptLinePayload, toReceiptLines } from "@/features/inventory/receipt-payload";
import { receiptResultSchema } from "@/features/inventory/schemas";
import { errorMessage } from "@/lib/api/api-error";
import { apiRequest } from "@/lib/api/client";
import { randomId } from "@/lib/random-id";

import type { PurchaseOrderLine } from "./schemas";

const receiveResultSchema = z.object({ receipt: receiptResultSchema });

type ReceivePayload = { note?: string; lines: ReceiptLinePayload[] };

type Props = {
  orderId: number;
  lines: PurchaseOrderLine[];
  locations: LocationOption[];
};

function toDraft(line: PurchaseOrderLine): ReceiptLineDraft {
  return {
    key: randomId(),
    productId: line.productId,
    productName: line.productName,
    sku: line.sku,
    baseUnit: line.baseUnit,
    lotNumber: "",
    manufactureDate: "",
    expiryDate: "",
    locationId: "",
    unitName: line.baseUnit,
    quantity: String(line.remainingQuantity),
    unitCost: String(line.unitPrice),
  };
}

export function PoReceiveForm({ orderId, lines, locations }: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const noteId = useId();
  const [note, setNote] = useState("");
  const [drafts, setDrafts] = useState(() => lines.filter((line) => line.remainingQuantity > 0).map(toDraft));
  const [validationError, setValidationError] = useState<string>();
  const idempotency = useRef<{ payload: string; key: string } | null>(null);
  const remainingByProduct = new Map(lines.map((line) => [line.productId, line.remainingQuantity]));

  const receive = useMutation({
    mutationFn: ({ payload, key }: { payload: ReceivePayload; key: string }) =>
      apiRequest(`/purchase-orders/${orderId}/receipts`, receiveResultSchema, { method: "POST", body: payload, idempotencyKey: key }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["product-picker"] });
      void queryClient.invalidateQueries({ queryKey: ["issue-preview"] });
      router.push(`/purchase-orders/${orderId}`);
      router.refresh();
    },
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = toReceiptLines(drafts);
    if (!result.ok) {
      setValidationError(result.error);
      return;
    }
    setValidationError(undefined);
    const payload: ReceivePayload = { note: note.trim() || undefined, lines: result.lines };
    const serialized = JSON.stringify(payload);
    if (idempotency.current?.payload !== serialized) {
      idempotency.current = { payload: serialized, key: randomId() };
    }
    receive.mutate({ payload, key: idempotency.current.key });
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      <Card>
        <CardHeader
          title="Lô nhận được"
          description="Điền số lô, hạn dùng và vị trí cất cho từng thuốc. Bỏ dòng nếu chưa giao; có thể nhận nhiều lần."
        />
        <CardBody className="space-y-4">
          {drafts.length === 0 ? (
            <EmptyState title="Không còn dòng nào để nhận" description="Tất cả dòng đã bị bỏ khỏi lần nhận này." />
          ) : (
            drafts.map((draft, index) => (
              <ReceiptLineFields
                key={draft.key}
                line={draft}
                index={index}
                locations={locations}
                remainingQuantity={remainingByProduct.get(draft.productId)}
                onChange={(next) => setDrafts((current) => current.map((item) => (item.key === next.key ? next : item)))}
                onRemove={() => setDrafts((current) => current.filter((item) => item.key !== draft.key))}
              />
            ))
          )}
          <Field id={noteId} label="Ghi chú phiếu nhập">
            <Textarea id={noteId} rows={2} maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} />
          </Field>
        </CardBody>
      </Card>
      {validationError ? <Alert tone="danger">{validationError}</Alert> : null}
      {receive.error ? <Alert tone="danger">{errorMessage(receive.error)}</Alert> : null}
      <div className="flex justify-end gap-2">
        <ButtonLink href={`/purchase-orders/${orderId}`} variant="secondary">
          Quay lại đơn
        </ButtonLink>
        <Button type="submit" disabled={receive.isPending || drafts.length === 0}>
          {receive.isPending ? "Đang nhập kho…" : "Xác nhận nhận hàng"}
        </Button>
      </div>
    </form>
  );
}
