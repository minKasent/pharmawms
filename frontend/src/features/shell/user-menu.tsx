import LogOut from "lucide-react/dist/esm/icons/log-out";

import { logout } from "@/features/auth/actions";
import { getCurrentUser } from "@/features/auth/current-user";
import { Skeleton } from "@/components/ui/feedback";

export async function UserMenu() {
  const user = await getCurrentUser();
  return (
    <div className="flex items-center gap-3">
      <div className="hidden text-right sm:block">
        <p className="text-sm font-medium text-slate-900">{user.fullName}</p>
        <p className="text-xs text-slate-500">{user.roleDisplayName}</p>
      </div>
      <form action={logout}>
        <button
          type="submit"
          aria-label="Đăng xuất"
          title="Đăng xuất"
          className="inline-flex size-9 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900"
        >
          <LogOut aria-hidden="true" className="size-4" />
        </button>
      </form>
    </div>
  );
}

export function UserMenuSkeleton() {
  return <Skeleton className="h-9 w-40" />;
}
