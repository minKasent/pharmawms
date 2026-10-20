"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { type FormEvent, useId, useState } from "react";
import { z } from "zod";

import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert } from "@/components/ui/feedback";
import { Field, Input, Textarea } from "@/components/ui/field";
import { errorMessage } from "@/lib/api/api-error";
import { apiRequest } from "@/lib/api/client";

import { type Supplier, supplierSchema } from "./schemas";

const MAX_LEAD_TIME_DAYS = 365;
const DEFAULT_LEAD_TIME_DAYS = "7";

const detailsSchema = z.object({
  name: z.string().trim().min(1, "Nhập tên nhà cung cấp").max(200),
  phone: z.string().trim().max(30, "Số điện thoại tối đa 30 ký tự").optional(),
  email: z
    .string()
    .trim()
    .max(100, "Email tối đa 100 ký tự")
    .refine((value) => value === "" || z.email().safeParse(value).success, "Email không hợp lệ")
    .optional(),
  address: z.string().trim().max(255, "Địa chỉ tối đa 255 ký tự").optional(),
  defaultLeadTimeDays: z
    .number({ error: "Thời gian giao hàng không hợp lệ" })
    .int("Thời gian giao hàng phải là số nguyên")
    .min(1, "Tối thiểu 1 ngày")
    .max(MAX_LEAD_TIME_DAYS, `Tối đa ${MAX_LEAD_TIME_DAYS} ngày`),
});

const createSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, "Nhập mã nhà cung cấp")
    .max(20)
    .regex(/^[A-Za-z0-9_-]+$/, "Mã chỉ gồm chữ, số, gạch ngang và gạch dưới"),
  details: detailsSchema,
});

type Props = { supplier?: Supplier };

export function SupplierForm({ supplier }: Props) {
  const router = useRouter();
  const ids = {
    code: useId(),
    name: useId(),
    phone: useId(),
    email: useId(),
    address: useId(),
    lead: useId(),
  };
  const [code, setCode] = useState(supplier?.code ?? "");
  const [name, setName] = useState(supplier?.name ?? "");
  const [phone, setPhone] = useState(supplier?.phone ?? "");
  const [email, setEmail] = useState(supplier?.email ?? "");
  const [address, setAddress] = useState(supplier?.address ?? "");
  const [leadTime, setLeadTime] = useState(String(supplier?.defaultLeadTimeDays ?? DEFAULT_LEAD_TIME_DAYS));
  const [active, setActive] = useState(supplier?.active ?? true);
  const [validationError, setValidationError] = useState<string>();

  const save = useMutation({
    mutationFn: (body: object) =>
      supplier
        ? apiRequest(`/suppliers/${supplier.id}`, supplierSchema, { method: "PUT", body })
        : apiRequest("/suppliers", supplierSchema, { method: "POST", body }),
    onSuccess: (saved) => {
      router.push(`/suppliers/${saved.id}`);
      router.refresh();
    },
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const details = {
      name,
      phone: phone.trim() || undefined,
      email: email.trim() || undefined,
      address: address.trim() || undefined,
      defaultLeadTimeDays: leadTime.trim() === "" ? Number.NaN : Number(leadTime),
    };
    if (supplier) {
      const parsed = detailsSchema.safeParse(details);
      if (!parsed.success) {
        setValidationError(parsed.error.issues[0]?.message);
        return;
      }
      setValidationError(undefined);
      save.mutate({
        details: {
          ...parsed.data,
          phone: parsed.data.phone || undefined,
          email: parsed.data.email || undefined,
          address: parsed.data.address || undefined,
        },
        active,
      });
      return;
    }
    const parsed = createSchema.safeParse({ code, details });
    if (!parsed.success) {
      setValidationError(parsed.error.issues[0]?.message);
      return;
    }
    setValidationError(undefined);
    const { details: d } = parsed.data;
    save.mutate({
      code: parsed.data.code,
      details: { ...d, phone: d.phone || undefined, email: d.email || undefined, address: d.address || undefined },
    });
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      <Card>
        <CardHeader title="Thông tin nhà cung cấp" />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field id={ids.code} label="Mã" hint={supplier ? "Không đổi được mã đã tạo" : undefined}>
            <Input id={ids.code} value={code} disabled={Boolean(supplier)} onChange={(event) => setCode(event.target.value)} />
          </Field>
          <Field id={ids.name} label="Tên">
            <Input id={ids.name} value={name} onChange={(event) => setName(event.target.value)} />
          </Field>
          <Field id={ids.phone} label="Điện thoại">
            <Input id={ids.phone} value={phone} onChange={(event) => setPhone(event.target.value)} />
          </Field>
          <Field id={ids.email} label="Email">
            <Input id={ids.email} type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          </Field>
          <Field id={ids.lead} label="Thời gian giao hàng mặc định (ngày)">
            <Input id={ids.lead} type="number" inputMode="numeric" min={1} max={MAX_LEAD_TIME_DAYS} value={leadTime} onChange={(event) => setLeadTime(event.target.value)} />
          </Field>
          <Field id={ids.address} label="Địa chỉ" className="sm:col-span-2">
            <Textarea id={ids.address} rows={2} value={address} onChange={(event) => setAddress(event.target.value)} />
          </Field>
          {supplier ? (
            <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-2">
              <input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} className="size-4 accent-brand-600" />
              Đang hợp tác
            </label>
          ) : null}
        </CardBody>
      </Card>
      {validationError ? <Alert tone="danger">{validationError}</Alert> : null}
      {save.error ? <Alert tone="danger">{errorMessage(save.error)}</Alert> : null}
      <div className="flex justify-end gap-2">
        <ButtonLink href={supplier ? `/suppliers/${supplier.id}` : "/suppliers"} variant="secondary">
          Hủy
        </ButtonLink>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? "Đang lưu…" : supplier ? "Lưu thay đổi" : "Thêm nhà cung cấp"}
        </Button>
      </div>
    </form>
  );
}
