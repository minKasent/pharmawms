import LogOut from "lucide-react/dist/esm/icons/log-out";

import { Skeleton } from "@/components/ui/feedback";
import { logout } from "@/features/auth/actions";
import { getCurrentUser } from "@/features/auth/current-user";

import { CommandPalette } from "./command-palette";
import { RoleSwitcher } from "./role-switcher";

export async function UserMenu() {
  const user = await getCurrentUser();
  return (
    <div className="flex items-center gap-2.5 sm:gap-3">
      <CommandPalette permissions={user.permissions} />
      <RoleSwitcher currentUsername={user.username} />
      <div className="hidden border-l border-slate-200 pl-3 text-right md:block">
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
  return <Skeleton className="h-9 w-64" />;
}
