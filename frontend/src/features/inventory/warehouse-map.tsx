"use client";

import { useMutation } from "@tanstack/react-query";
import Plus from "lucide-react/dist/esm/icons/plus";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { z } from "zod";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Alert } from "@/components/ui/feedback";
import { Field, Input } from "@/components/ui/field";
import { EmptyRow, TBody, THead, Table, Td, Th } from "@/components/ui/table";
import { errorMessage } from "@/lib/api/api-error";
import { apiCommand } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import { formatInteger } from "@/lib/format";

import { BatchTraceabilityDialog } from "./batch-traceability-dialog";
import { BatchStatusBadge, ExpiryCell } from "./expiry-badge";
import { EXPIRY_WARNING_DAYS, type StorageCondition } from "./labels";
import type { Batch, Warehouse } from "./schemas";

type ShelfBatchItem = {
  batch: Batch;
  quantityOnShelf: number;
};

type ShelfStats = {
  totalOnHand: number;
  batchCount: number;
  hasExpiredOrHold: boolean;
  hasNearExpiry: boolean;
  batchesOnShelf: ShelfBatchItem[];
};

type ZoneMeta = {
  tempBadge: string;
  tempDetail: string;
  headerBg: string;
  badgeStyle: string;
  borderAccent: string;
};

const ZONE_META: Record<StorageCondition, ZoneMeta> = {
  NORMAL: {
    tempBadge: "15°C – 30°C • Độ ẩm ≤ 75%",
    tempDetail: "Kho thường GSP — Bảo quản khô thoáng, tránh ánh sáng trực tiếp",
    headerBg: "bg-emerald-50/70 border-emerald-200/80",
    badgeStyle: "bg-emerald-100 text-emerald-900 ring-emerald-300",
    borderAccent: "border-emerald-200/90",
  },
  COOL: {
    tempBadge: "8°C – 15°C • Kho mát GSP",
    tempDetail: "Kho mát điều hòa giám sát nhiệt kế tự ghi 24/7",
    headerBg: "bg-sky-50/70 border-sky-200/80",
    badgeStyle: "bg-sky-100 text-sky-900 ring-sky-300",
    borderAccent: "border-sky-200/90",
  },
  COLD: {
    tempBadge: "2°C – 8°C • Dây chuyền lạnh Cold-Chain 24/7",
    tempDetail: "Kho lạnh vắc-xin & sinh phẩm y tế — Cảnh báo tự động khi lệch ngưỡng",
    headerBg: "bg-indigo-50/70 border-indigo-200/80",
    badgeStyle: "bg-indigo-100 text-indigo-900 ring-indigo-300",
    borderAccent: "border-indigo-200/90",
  },
};

const locationCodeSchema = z
  .string()
  .trim()
  .min(1, "Nhập mã vị trí kệ")
  .max(30, "Mã kệ tối đa 30 ký tự")
  .regex(/^[A-Za-z0-9._-]+$/, "Mã kệ chỉ gồm chữ, số, dấu chấm, gạch ngang và gạch dưới");

type SelectedShelf = {
  warehouseName: string;
  zoneId: number;
  zoneCode: string;
  zoneName: string;
  storageCondition: StorageCondition;
  locationId: number;
  locationCode: string;
  active: boolean;
};

type Props = {
  warehouses: Warehouse[];
  batches: Batch[];
  canManage: boolean;
};

export function WarehouseMap({ warehouses, batches, canManage }: Props) {
  const router = useRouter();

  // Build map of locationId -> ShelfStats
  const statsByLocation = new Map<number, ShelfStats>();
  for (const batch of batches) {
    if (batch.onHand <= 0) continue;
    for (const balance of batch.balances) {
      if (balance.onHand <= 0) continue;
      const existing = statsByLocation.get(balance.locationId) ?? {
        totalOnHand: 0,
        batchCount: 0,
        hasExpiredOrHold: false,
        hasNearExpiry: false,
        batchesOnShelf: [],
      };
      existing.totalOnHand += balance.onHand;
      existing.batchCount += 1;
      if (
        batch.status === "EXPIRED" ||
        batch.status === "ON_HOLD" ||
        batch.status === "QUARANTINE" ||
        batch.daysToExpiry <= 0
      ) {
        existing.hasExpiredOrHold = true;
      } else if (batch.daysToExpiry <= EXPIRY_WARNING_DAYS) {
        existing.hasNearExpiry = true;
      }
      existing.batchesOnShelf.push({ batch, quantityOnShelf: balance.onHand });
      statsByLocation.set(balance.locationId, existing);
    }
  }

  // Sort batches on each shelf by FEFO (expiryDate ascending)
  for (const stats of statsByLocation.values()) {
    stats.batchesOnShelf.sort((a, b) => a.batch.daysToExpiry - b.batch.daysToExpiry);
  }

  // Find default selected shelf (first occupied shelf, or first location)
  const allShelves: SelectedShelf[] = [];
  for (const wh of warehouses) {
    for (const zone of wh.zones) {
      for (const loc of zone.locations) {
        allShelves.push({
          warehouseName: wh.name,
          zoneId: zone.id,
          zoneCode: zone.code,
          zoneName: zone.name,
          storageCondition: zone.storageCondition,
          locationId: loc.id,
          locationCode: loc.code,
          active: loc.active,
        });
      }
    }
  }

  const firstOccupied = allShelves.find((s) => (statsByLocation.get(s.locationId)?.totalOnHand ?? 0) > 0) ?? allShelves[0] ?? null;
  const [selectedLocationId, setSelectedLocationId] = useState<number | null>(firstOccupied?.locationId ?? null);
  const [traceBatch, setTraceBatch] = useState<{ id: number; lotNumber: string } | null>(null);
  const [addLocationZone, setAddLocationZone] = useState<{ id: number; code: string; name: string } | null>(null);
  const [newLocationCode, setNewLocationCode] = useState("");
  const [addValidationError, setAddValidationError] = useState<string>();

  const selectedShelf = allShelves.find((s) => s.locationId === selectedLocationId) ?? firstOccupied;
  const selectedStats = selectedShelf ? statsByLocation.get(selectedShelf.locationId) : undefined;

  // Overall KPI calculations
  const totalZones = warehouses.reduce((sum, wh) => sum + wh.zones.length, 0);
  const activeLocations = allShelves.filter((s) => s.active).length;
  const occupiedLocations = allShelves.filter((s) => (statsByLocation.get(s.locationId)?.totalOnHand ?? 0) > 0).length;
  const totalOnHand = Array.from(statsByLocation.values()).reduce((sum, s) => sum + s.totalOnHand, 0);
  const alertLocations = Array.from(statsByLocation.values()).filter((s) => s.hasExpiredOrHold || s.hasNearExpiry).length;

  const toggleActivation = useMutation({
    mutationFn: ({ locationId, active }: { locationId: number; active: boolean }) =>
      apiCommand(`/locations/${locationId}/activation`, { method: "POST", body: { active } }),
    onSuccess: () => {
      router.refresh();
    },
  });

  const createLocation = useMutation({
    mutationFn: ({ zoneId, code }: { zoneId: number; code: string }) =>
      apiCommand(`/zones/${zoneId}/locations`, { method: "POST", body: { code } }),
    onSuccess: () => {
      setAddLocationZone(null);
      setNewLocationCode("");
      setAddValidationError(undefined);
      router.refresh();
    },
  });

  function onAddLocationSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!addLocationZone) return;
    const parsed = locationCodeSchema.safeParse(newLocationCode);
    if (!parsed.success) {
      setAddValidationError(parsed.error.issues[0]?.message);
      return;
    }
    setAddValidationError(undefined);
    createLocation.mutate({ zoneId: addLocationZone.id, code: parsed.data });
  }

  return (
    <div className="space-y-6">
      {/* 1. GSP Environment & Capacity KPI Bar */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardBody className="space-y-1">
            <p className="text-xs font-medium text-slate-500">Khu bảo quản đạt chuẩn GSP</p>
            <p className="text-2xl font-bold tracking-tight text-slate-900">{formatInteger(totalZones)} vùng nhiệt độ</p>
            <p className="text-xs text-emerald-700">Thường (15–30°C) · Mát (8–15°C) · Lạnh (2–8°C)</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="space-y-1">
            <p className="text-xs font-medium text-slate-500">Mật độ lấp đầy vị trí kệ</p>
            <p className="text-2xl font-bold tracking-tight text-slate-900">
              {formatInteger(occupiedLocations)} / {formatInteger(activeLocations)}{" "}
              <span className="text-sm font-normal text-slate-500">vị trí đang hoạt động</span>
            </p>
            <p className="text-xs text-slate-500">Tổng {formatInteger(allShelves.length)} ô kệ định danh mã vạch</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="space-y-1">
            <p className="text-xs font-medium text-slate-500">Tổng đơn vị thuốc đang lưu kệ</p>
            <p className="text-2xl font-bold tracking-tight text-brand-700 tabular-nums">{formatInteger(totalOnHand)}</p>
            <p className="text-xs text-slate-500">Đơn vị cơ sở phân bổ theo quy tắc FEFO</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="space-y-1">
            <p className="text-xs font-medium text-slate-500">Vị trí kệ có cảnh báo hạn / khóa</p>
            <p className={cn("text-2xl font-bold tracking-tight tabular-nums", alertLocations > 0 ? "text-amber-700" : "text-emerald-700")}>
              {formatInteger(alertLocations)} ô kệ
            </p>
            <p className="text-xs text-slate-500">Chứa lô cận hạn ≤ 90 ngày, tạm khóa hoặc hết hạn</p>
          </CardBody>
        </Card>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600">
        <span className="font-semibold text-slate-800">Chú giải trạng thái kệ GSP:</span>
        <div className="flex flex-wrap items-center gap-4">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-emerald-500" aria-hidden="true" />
            Đang lưu thuốc ổn định (&gt; 90 ngày)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-amber-500" aria-hidden="true" />
            Có lô cận hạn (≤ 90 ngày)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-red-500" aria-hidden="true" />
            Có lô hết hạn / tạm khóa / biệt trữ
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-slate-300" aria-hidden="true" />
            Kệ trống / Ngưng dùng
          </span>
        </div>
      </div>

      {/* 2. 2D Zone Blueprint Grid + Interactive Shelf Inspector */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_28rem]">
        <div className="space-y-6">
          {warehouses.map((warehouse) =>
            warehouse.zones.map((zone) => {
              const meta = ZONE_META[zone.storageCondition];
              const zoneTotalUnits = zone.locations.reduce(
                (sum, loc) => sum + (statsByLocation.get(loc.id)?.totalOnHand ?? 0),
                0,
              );
              const maxShelfUnits = Math.max(
                ...zone.locations.map((loc) => statsByLocation.get(loc.id)?.totalOnHand ?? 0),
                500,
              );

              return (
                <section
                  key={zone.id}
                  className={cn("overflow-hidden rounded-xl border bg-white shadow-xs", meta.borderAccent)}
                >
                  <div className={cn("flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4", meta.headerBg)}>
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <span className="font-mono text-xs font-bold tracking-wider text-slate-600 uppercase">
                          Khu {zone.code}
                        </span>
                        <h2 className="text-base font-semibold text-slate-900">{zone.name}</h2>
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset",
                            meta.badgeStyle,
                          )}
                        >
                          {meta.tempBadge}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600">
                        {meta.tempDetail} · Tổng đang lưu:{" "}
                        <strong className="font-semibold text-slate-900">{formatInteger(zoneTotalUnits)} đơn vị</strong>
                      </p>
                    </div>
                    {canManage ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setAddLocationZone({ id: zone.id, code: zone.code, name: zone.name });
                          setNewLocationCode(`${zone.code}-`);
                          setAddValidationError(undefined);
                          createLocation.reset();
                        }}
                      >
                        <Plus aria-hidden="true" className="size-4" />
                        Thêm vị trí kệ
                      </Button>
                    ) : null}
                  </div>

                  <div className="grid gap-3 p-5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                    {zone.locations.map((loc) => {
                      const stats = statsByLocation.get(loc.id);
                      const onHand = stats?.totalOnHand ?? 0;
                      const batchCount = stats?.batchCount ?? 0;
                      const isSelected = selectedShelf?.locationId === loc.id;
                      const occupancyPercent = onHand > 0 ? Math.min(100, Math.max(12, Math.round((onHand / maxShelfUnits) * 100))) : 0;

                      const dotColor = !loc.active
                        ? "bg-slate-300"
                        : stats?.hasExpiredOrHold
                          ? "bg-red-500"
                          : stats?.hasNearExpiry
                            ? "bg-amber-500"
                            : onHand > 0
                              ? "bg-emerald-500"
                              : "bg-slate-300";

                      const barColor = stats?.hasExpiredOrHold
                        ? "bg-red-500"
                        : stats?.hasNearExpiry
                          ? "bg-amber-500"
                          : "bg-emerald-500";

                      return (
                        <button
                          key={loc.id}
                          type="button"
                          onClick={() => {
                            toggleActivation.reset();
                            setSelectedLocationId(loc.id);
                          }}
                          className={cn(
                            "group flex flex-col justify-between rounded-xl border p-3.5 text-left transition-all",
                            !loc.active && "bg-slate-50 opacity-65",
                            isSelected
                              ? "border-brand-600 bg-brand-50/40 ring-2 ring-brand-500/40"
                              : "border-slate-200 bg-white hover:border-brand-300 hover:bg-slate-50/70",
                          )}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-sm font-bold text-slate-900">{loc.code}</span>
                            <span className={cn("size-2.5 shrink-0 rounded-full", dotColor)} aria-hidden="true" />
                          </div>

                          <div className="mt-3 space-y-1.5">
                            {!loc.active ? (
                              <p className="text-xs font-medium text-slate-400">Ngưng sử dụng</p>
                            ) : onHand > 0 ? (
                              <p className="text-xs font-medium text-slate-700 tabular-nums">
                                <span className="font-semibold text-slate-900">{formatInteger(onHand)}</span> đv ·{" "}
                                {formatInteger(batchCount)} lô
                              </p>
                            ) : (
                              <p className="text-xs text-slate-400">Kệ trống</p>
                            )}
                            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
                              <div className={cn("h-full rounded-full transition-all", barColor)} style={{ width: `${occupancyPercent}%` }} />
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </section>
              );
            }),
          )}
        </div>

        {/* 3. Interactive Shelf Inspector Panel */}
        <aside className="xl:sticky xl:top-20 xl:self-start" aria-label="Chi tiết vị trí kệ đang chọn">
          <Card>
            {selectedShelf ? (
              <>
                <div className="border-b border-slate-100 px-5 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span className="text-xs font-semibold tracking-wider text-brand-700 uppercase">
                        Thanh tra Vị trí Kệ GSP
                      </span>
                      <h3 className="mt-0.5 font-mono text-xl font-bold text-slate-900">{selectedShelf.locationCode}</h3>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {selectedShelf.zoneName} ({ZONE_META[selectedShelf.storageCondition].tempBadge})
                      </p>
                    </div>
                    <Badge tone={selectedShelf.active ? "success" : "neutral"}>
                      {selectedShelf.active ? "Đang hoạt động" : "Ngưng dùng"}
                    </Badge>
                  </div>

                  {canManage ? (
                    <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
                      <span className="text-xs text-slate-500">Trạng thái vận hành kệ:</span>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={toggleActivation.isPending}
                        onClick={() =>
                          toggleActivation.mutate({
                            locationId: selectedShelf.locationId,
                            active: !selectedShelf.active,
                          })
                        }
                      >
                        {toggleActivation.isPending
                          ? "Đang cập nhật…"
                          : selectedShelf.active
                            ? "Tạm ngưng kệ"
                            : "Kích hoạt lại kệ"}
                      </Button>
                    </div>
                  ) : null}
                  {toggleActivation.error ? (
                    <div className="mt-2">
                      <Alert tone="danger">{errorMessage(toggleActivation.error)}</Alert>
                    </div>
                  ) : null}
                </div>

                <div className="grid grid-cols-2 divide-x divide-slate-100 border-b border-slate-100 bg-slate-50/60 text-center">
                  <div className="px-4 py-2.5">
                    <p className="text-xs text-slate-500">Số lô đang đặt trên kệ</p>
                    <p className="mt-0.5 text-base font-bold text-slate-900 tabular-nums">
                      {formatInteger(selectedStats?.batchCount ?? 0)} lô
                    </p>
                  </div>
                  <div className="px-4 py-2.5">
                    <p className="text-xs text-slate-500">Tổng lượng tồn trên kệ</p>
                    <p className="mt-0.5 text-base font-bold text-brand-700 tabular-nums">
                      {formatInteger(selectedStats?.totalOnHand ?? 0)} đơn vị
                    </p>
                  </div>
                </div>

                <div className="max-h-[30rem] overflow-y-auto">
                  <Table caption={`Các lô thuốc đang lưu tại kệ ${selectedShelf.locationCode}`}>
                    <THead>
                      <tr>
                        <Th>Thuốc / Số lô</Th>
                        <Th>Hạn dùng</Th>
                        <Th numeric>Tồn kệ</Th>
                        <Th className="text-right">Truy vết</Th>
                      </tr>
                    </THead>
                    <TBody>
                      {!selectedStats || selectedStats.batchesOnShelf.length === 0 ? (
                        <EmptyRow colSpan={4}>Kệ này hiện đang trống, sẵn sàng nhận lô mới.</EmptyRow>
                      ) : (
                        selectedStats.batchesOnShelf.map(({ batch, quantityOnShelf }) => (
                          <tr key={batch.id} className="hover:bg-slate-50">
                            <Td>
                              <Link
                                href={`/products/${batch.productId}`}
                                className="font-medium text-slate-900 hover:underline"
                              >
                                {batch.productName}
                              </Link>
                              <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                                <span className="font-mono">{batch.lotNumber}</span>
                                <BatchStatusBadge status={batch.status} />
                              </div>
                            </Td>
                            <Td>
                              <ExpiryCell expiryDate={batch.expiryDate} daysToExpiry={batch.daysToExpiry} />
                            </Td>
                            <Td numeric>
                              <span className="font-semibold text-slate-900">{formatInteger(quantityOnShelf)}</span>{" "}
                              <span className="text-xs text-slate-500">{batch.baseUnit}</span>
                            </Td>
                            <Td className="text-right">
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={() => setTraceBatch({ id: batch.id, lotNumber: batch.lotNumber })}
                              >
                                Truy vết lô
                              </Button>
                            </Td>
                          </tr>
                        ))
                      )}
                    </TBody>
                  </Table>
                </div>
              </>
            ) : (
              <CardBody>
                <p className="text-sm text-slate-500">Chọn một ô kệ để xem chi tiết các lô thuốc đang lưu trữ.</p>
              </CardBody>
            )}
          </Card>
        </aside>
      </div>

      {/* Add Shelf Location Dialog */}
      <Dialog
        open={addLocationZone !== null}
        onClose={() => {
          setAddLocationZone(null);
          setAddValidationError(undefined);
          createLocation.reset();
        }}
        title={addLocationZone ? `Thêm vị trí kệ vào ${addLocationZone.name}` : "Thêm vị trí kệ"}
        description="Mã kệ chỉ gồm chữ, số, gạch ngang và gạch dưới (ví dụ: A-01-09)."
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setAddLocationZone(null);
                setAddValidationError(undefined);
                createLocation.reset();
              }}
            >
              Hủy
            </Button>
            <Button type="submit" form="add-location-form" disabled={createLocation.isPending}>
              {createLocation.isPending ? "Đang tạo…" : "Tạo vị trí kệ"}
            </Button>
          </>
        }
      >
        <form id="add-location-form" onSubmit={onAddLocationSubmit} noValidate className="space-y-3">
          <Field id="new-location-code" label="Mã vị trí kệ" error={addValidationError}>
            <Input
              id="new-location-code"
              value={newLocationCode}
              maxLength={30}
              placeholder="VD: A-01-09"
              onChange={(event) => setNewLocationCode(event.target.value)}
            />
          </Field>
          {createLocation.error ? <Alert tone="danger">{errorMessage(createLocation.error)}</Alert> : null}
        </form>
      </Dialog>

      {/* Batch Traceability Dialog triggered from Shelf Inspector */}
      <BatchTraceabilityDialog
        batchId={traceBatch?.id ?? null}
        lotNumber={traceBatch?.lotNumber}
        onClose={() => setTraceBatch(null)}
      />
    </div>
  );
}
