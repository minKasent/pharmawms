"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { type FormEvent, type ReactNode, useRef, useState } from "react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { ReasonDialog } from "@/components/ui/reason-dialog";
import { errorMessage } from "@/lib/api/api-error";
import { apiRequest } from "@/lib/api/client";

import { DISPOSAL_FIELD } from "./disposal-field";

const disposalCreatedSchema = z.object({ id: z.number() });

function selectedBatchIds(form: HTMLFormElement): number[] {
  return new FormData(form).getAll(DISPOSAL_FIELD).map(Number).filter(Number.isInteger);
}

/** Wraps a server-rendered table whose rows carry `<input type="checkbox" name="batchIds">`. */
export function DisposalForm({ children }: { children: ReactNode }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const formRef = useRef<HTMLFormElement>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [isDialogOpen, setDialogOpen] = useState(false);

  const dispose = useMutation({
    mutationFn: (reason: string) =>
      apiRequest("/disposals", disposalCreatedSchema, { method: "POST", body: { batchIds: selected, reason } }),
    onSuccess: ({ id }) => {
      void queryClient.invalidateQueries({ queryKey: ["product-picker"] });
      void queryClient.invalidateQueries({ queryKey: ["issue-preview"] });
      router.push(`/disposals/${id}`);
    },
  });

  function toggleAll(checked: boolean) {
    const form = formRef.current;
    if (!form) return;
    for (const input of form.querySelectorAll<HTMLInputElement>(`input[name="${DISPOSAL_FIELD}"]`)) {
      input.checked = checked;
    }
    setSelected(selectedBatchIds(form));
  }

  function openDialog(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selected.length > 0) setDialogOpen(true);
  }

  return (
    <>
      <form ref={formRef} onSubmit={openDialog} onChange={(event) => setSelected(selectedBatchIds(event.currentTarget))}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-red-50/60 px-5 py-3">
          <p className="text-sm text-red-900" aria-live="polite">
            {selected.length > 0 ? `Đã chọn ${selected.length} lô để hủy` : "Chọn các lô cần lập biên bản hủy"}
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => toggleAll(true)}>
              Chọn tất cả
            </Button>
            <Button size="sm" variant="ghost" onClick={() => toggleAll(false)} disabled={selected.length === 0}>
              Bỏ chọn
            </Button>
            <Button type="submit" size="sm" variant="danger" disabled={selected.length === 0}>
              Lập biên bản hủy
            </Button>
          </div>
        </div>
        {children}
      </form>
      <ReasonDialog
        open={isDialogOpen}
        onClose={() => {
          setDialogOpen(false);
          dispose.reset();
        }}
        title={`Tiêu hủy ${selected.length} lô thuốc đã chọn`}
        description="Toàn bộ tồn của các lô đã chọn sẽ được xuất hủy và ghi vào sổ cái. Thao tác không thể hoàn tác."
        label="Lý do / căn cứ hủy (ví dụ: hết hạn sử dụng, biên bản hội đồng số …)"
        confirmLabel="Xác nhận hủy"
        variant="danger"
        isPending={dispose.isPending}
        error={dispose.error ? errorMessage(dispose.error) : undefined}
        onConfirm={(reason) => dispose.mutate(reason)}
      />
    </>
  );
}
