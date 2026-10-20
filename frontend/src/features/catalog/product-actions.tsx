"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import Pencil from "lucide-react/dist/esm/icons/pencil";
import { useRouter } from "next/navigation";

import { Button, ButtonLink } from "@/components/ui/button";
import { errorMessage } from "@/lib/api/api-error";
import { apiCommand } from "@/lib/api/client";

export function ProductActions({ productId, active }: { productId: number; active: boolean }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const toggle = useMutation({
    mutationFn: () => apiCommand(`/products/${productId}/activation`, { body: { active: !active } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["product"] });
      void queryClient.invalidateQueries({ queryKey: ["product-picker"] });
      router.refresh();
    },
  });

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        <Button variant="secondary" disabled={toggle.isPending} onClick={() => toggle.mutate()}>
          {active ? "Ngừng sử dụng" : "Dùng lại"}
        </Button>
        <ButtonLink href={`/products/${productId}/edit`}>
          <Pencil aria-hidden="true" className="size-4" />
          Sửa
        </ButtonLink>
      </div>
      {toggle.error ? (
        <p role="alert" className="text-xs text-red-700">
          {errorMessage(toggle.error)}
        </p>
      ) : null}
    </div>
  );
}
