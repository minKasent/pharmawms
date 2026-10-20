import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";

export function Forbidden({ action }: { action: string }) {
  return (
    <Card>
      <EmptyState
        title="Bạn không có quyền thực hiện thao tác này"
        description={`Tài khoản của bạn chưa được cấp quyền ${action}. Liên hệ quản trị viên nếu cần.`}
        action={
          <ButtonLink href="/" variant="secondary">
            Về trang tổng quan
          </ButtonLink>
        }
      />
    </Card>
  );
}
