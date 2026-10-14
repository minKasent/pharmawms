"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { type FormEvent, useId, useState } from "react";

import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert } from "@/components/ui/feedback";
import { Field, Select } from "@/components/ui/field";
import { storageCondition } from "@/features/inventory/labels";
import { errorMessage } from "@/lib/api/api-error";
import { apiRequest } from "@/lib/api/client";

import { type Warehouse, stockTakeSchema } from "./schemas";

type Props = { warehouses: Warehouse[] };

export function NewStockTakeForm({ warehouses }: Props) {
  const router = useRouter();
  const zoneId = useId();
  const zones = warehouses.flatMap((warehouse) =>
    warehouse.zones.map((zone) => ({
      id: zone.id,
      label: `${warehouse.name} · ${zone.code} (${zone.name}) · ${storageCondition(zone.storageCondition).label}`,
    })),
  );
  const [selected, setSelected] = useState(zones[0] ? String(zones[0].id) : "");
  const [validationError, setValidationError] = useState<string>();

  const create = useMutation({
    mutationFn: (body: { zoneId: number }) => apiRequest("/stock-takes", stockTakeSchema, { method: "POST", body }),
    onSuccess: (stockTake) => {
      router.push(`/stock-takes/${stockTake.header.id}`);
      router.refresh();
    },
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const zone = Number(selected);
    if (!Number.isInteger(zone) || zone <= 0) {
      setValidationError("Chọn khu vực cần kiểm kê.");
      return;
    }
    setValidationError(undefined);
    create.mutate({ zoneId: zone });
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      <Card>
        <CardHeader
          title="Chọn khu vực"
          description="Hệ thống chụp snapshot tồn theo từng lô tại mọi vị trí trong khu. Mỗi khu chỉ có một phiếu đang mở."
        />
        <CardBody>
          <Field id={zoneId} label="Khu vực">
            <Select id={zoneId} value={selected} onChange={(event) => setSelected(event.target.value)} disabled={zones.length === 0}>
              {zones.length === 0 ? <option value="">Không có khu nào</option> : null}
              {zones.map((zone) => (
                <option key={zone.id} value={zone.id}>
                  {zone.label}
                </option>
              ))}
            </Select>
          </Field>
        </CardBody>
      </Card>
      {validationError ? <Alert tone="danger">{validationError}</Alert> : null}
      {create.error ? <Alert tone="danger">{errorMessage(create.error)}</Alert> : null}
      <div className="flex justify-end gap-2">
        <ButtonLink href="/stock-takes" variant="secondary">
          Quay lại
        </ButtonLink>
        <Button type="submit" disabled={create.isPending || zones.length === 0}>
          {create.isPending ? "Đang tạo…" : "Tạo phiếu kiểm kê"}
        </Button>
      </div>
    </form>
  );
}
