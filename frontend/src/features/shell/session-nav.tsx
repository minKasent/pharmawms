import { getCurrentUser } from "@/features/auth/current-user";
import { Skeleton } from "@/components/ui/feedback";

import { navigationFor } from "./nav-items";
import { SidebarNav } from "./sidebar-nav";

export async function SessionNav() {
  const user = await getCurrentUser();
  return <SidebarNav groups={navigationFor(user)} />;
}

export function NavSkeleton() {
  return (
    <div role="status" aria-label="Đang tải menu" className="space-y-2 px-3">
      {Array.from({ length: 8 }, (_, index) => (
        <Skeleton key={index} className="h-8 bg-white/10" />
      ))}
    </div>
  );
}
