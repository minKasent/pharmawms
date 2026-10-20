"use client";

import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-xl space-y-4 py-12">
      <Alert tone="danger" title="Không tải được dữ liệu">
        Máy chủ không phản hồi hoặc bạn không có quyền xem nội dung này. Vui lòng thử lại.
        {error.digest ? <span className="mt-2 block text-xs opacity-70">Mã lỗi: {error.digest}</span> : null}
      </Alert>
      <Button variant="secondary" onClick={reset}>
        Thử lại
      </Button>
    </div>
  );
}
