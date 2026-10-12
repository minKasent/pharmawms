import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";

export default function NotFound() {
  return (
    <EmptyState
      title="Không tìm thấy nội dung"
      description="Bản ghi không tồn tại hoặc đã bị xóa."
      action={<ButtonLink href="/">Về trang tổng quan</ButtonLink>}
    />
  );
}
