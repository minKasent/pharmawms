"use client";

import { useMutation } from "@tanstack/react-query";
import Pencil from "lucide-react/dist/esm/icons/pencil";
import { useRouter } from "next/navigation";
import { type FormEvent, useId, useState } from "react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Alert } from "@/components/ui/feedback";
import { Field, Input } from "@/components/ui/field";
import { EmptyRow, TBody, THead, Table, Td, Th } from "@/components/ui/table";
import { errorMessage } from "@/lib/api/api-error";
import { apiRequest } from "@/lib/api/client";

import { type Category, categorySchema } from "./schemas";

const createCategorySchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, "Nhập mã nhóm thuốc")
    .max(30, "Mã tối đa 30 ký tự")
    .regex(/^[A-Za-z0-9_-]+$/, "Mã chỉ gồm chữ, số, gạch ngang và gạch dưới"),
  name: z.string().trim().min(1, "Nhập tên nhóm thuốc").max(100, "Tên nhóm tối đa 100 ký tự"),
});

const renameCategorySchema = z.object({
  name: z.string().trim().min(1, "Nhập tên nhóm thuốc").max(100, "Tên nhóm tối đa 100 ký tự"),
});

export function CategoryManager({ categories }: { categories: Category[] }) {
  const router = useRouter();
  const formId = useId();
  const [isOpen, setOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [validationError, setValidationError] = useState<string>();

  const save = useMutation({
    mutationFn: async () => {
      if (editing) {
        const parsed = renameCategorySchema.safeParse({ name });
        if (!parsed.success) {
          throw Object.assign(new Error(parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ"), { client: true });
        }
        return apiRequest(`/categories/${editing.id}`, categorySchema, {
          method: "PUT",
          body: { name: parsed.data.name },
        });
      }
      const parsed = createCategorySchema.safeParse({ code, name });
      if (!parsed.success) {
        throw Object.assign(new Error(parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ"), { client: true });
      }
      return apiRequest("/categories", categorySchema, {
        method: "POST",
        body: parsed.data,
      });
    },
    onSuccess: () => {
      setEditing(null);
      setCode("");
      setName("");
      setValidationError(undefined);
      router.refresh();
    },
  });

  function resetForm() {
    setEditing(null);
    setCode("");
    setName("");
    setValidationError(undefined);
    save.reset();
  }

  function startRename(category: Category) {
    setEditing(category);
    setCode(category.code);
    setName(category.name);
    setValidationError(undefined);
    save.reset();
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setValidationError(undefined);
    save.mutate(undefined, {
      onError: (error) => {
        if (error && typeof error === "object" && "client" in error) {
          setValidationError(error.message);
        }
      },
    });
  }

  return (
    <>
      <Button
        variant="secondary"
        onClick={() => {
          resetForm();
          setOpen(true);
        }}
      >
        Quản lý nhóm thuốc
      </Button>
      <Dialog
        open={isOpen}
        onClose={() => {
          setOpen(false);
          resetForm();
        }}
        title="Quản lý nhóm thuốc"
        description="Thêm nhóm thuốc mới hoặc đổi tên nhóm hiện có."
        footer={
          <Button
            variant="secondary"
            onClick={() => {
              setOpen(false);
              resetForm();
            }}
          >
            Đóng
          </Button>
        }
      >
        <div className="space-y-4">
          <form id={formId} onSubmit={onSubmit} noValidate className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/80 p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field id={`${formId}-code`} label="Mã nhóm" hint={editing ? "Không đổi được mã đã tạo" : undefined}>
                <Input
                  id={`${formId}-code`}
                  value={code}
                  disabled={editing !== null}
                  placeholder="VD: ANALGESIC"
                  onChange={(event) => setCode(event.target.value)}
                />
              </Field>
              <Field id={`${formId}-name`} label="Tên nhóm thuốc">
                <Input
                  id={`${formId}-name`}
                  value={name}
                  placeholder="VD: Giảm đau, hạ sốt"
                  onChange={(event) => setName(event.target.value)}
                />
              </Field>
            </div>
            <div className="flex justify-end gap-2">
              {editing ? (
                <Button type="button" size="sm" variant="ghost" onClick={resetForm}>
                  Hủy sửa
                </Button>
              ) : null}
              <Button type="submit" size="sm" disabled={save.isPending}>
                {save.isPending ? "Đang lưu…" : editing ? "Lưu tên mới" : "Thêm nhóm"}
              </Button>
            </div>
            {validationError || (save.error && !("client" in (save.error as object))) ? (
              <Alert tone="danger">{validationError ?? errorMessage(save.error)}</Alert>
            ) : null}
          </form>

          <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-200">
            <Table caption="Danh sách nhóm thuốc">
              <THead>
                <tr>
                  <Th>Mã</Th>
                  <Th>Tên nhóm</Th>
                  <Th>
                    <span className="sr-only">Thao tác</span>
                  </Th>
                </tr>
              </THead>
              <TBody>
                {categories.length === 0 ? (
                  <EmptyRow colSpan={3}>Chưa có nhóm thuốc nào.</EmptyRow>
                ) : (
                  categories.map((category) => (
                    <tr key={category.id}>
                      <Td className="font-mono text-xs">{category.code}</Td>
                      <Td className="font-medium text-slate-900">{category.name}</Td>
                      <Td className="text-right">
                        <button
                          type="button"
                          aria-label={`Đổi tên ${category.name}`}
                          onClick={() => startRename(category)}
                          className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-medium text-slate-700 hover:bg-slate-100"
                        >
                          <Pencil aria-hidden="true" className="size-3.5" />
                          Đổi tên
                        </button>
                      </Td>
                    </tr>
                  ))
                )}
              </TBody>
            </Table>
          </div>
        </div>
      </Dialog>
    </>
  );
}
