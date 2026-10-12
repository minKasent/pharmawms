import Menu from "lucide-react/dist/esm/icons/menu";
import Link from "next/link";
import { Suspense } from "react";

import { BrandMark } from "@/components/ui/brand-logo";
import { AppBreadcrumbs } from "@/features/shell/breadcrumbs";
import { QueryProvider } from "@/features/shell/query-provider";
import { NavSkeleton, SessionNav } from "@/features/shell/session-nav";
import { UserMenu, UserMenuSkeleton } from "@/features/shell/user-menu";

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2.5 px-3 text-white">
      <BrandMark className="size-9 drop-shadow-xs" />
      <div className="min-w-0 leading-tight">
        <span className="block text-lg font-bold tracking-tight">
          Pharma<span className="text-teal-300">WMS</span>
        </span>
        <span className="block font-mono text-[10px] font-medium tracking-wider text-brand-100/75 uppercase">
          GSP · FEFO · AI (s,S)
        </span>
      </div>
    </Link>
  );
}

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col gap-6 overflow-y-auto bg-brand-900 py-5 lg:flex">
        <Brand />
        <nav aria-label="Điều hướng chính" className="px-2">
          <Suspense fallback={<NavSkeleton />}>
            <SessionNav />
          </Suspense>
        </nav>
      </aside>

      <QueryProvider>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-4 border-b border-slate-200 bg-white/90 px-4 backdrop-blur sm:px-6">
            <details className="group relative lg:hidden">
              <summary className="flex size-9 cursor-pointer list-none items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100 [&::-webkit-details-marker]:hidden">
                <Menu aria-hidden="true" className="size-5" />
                <span className="sr-only">Mở menu</span>
              </summary>
              <nav
                aria-label="Điều hướng chính"
                className="absolute top-12 left-0 w-72 rounded-xl bg-brand-900 p-3 shadow-xl"
              >
                <Suspense fallback={<NavSkeleton />}>
                  <SessionNav />
                </Suspense>
              </nav>
            </details>
            <Suspense fallback={<p className="text-sm font-medium text-slate-500 max-lg:hidden">Kho Dược — Khoa Dược bệnh viện</p>}>
              <AppBreadcrumbs />
            </Suspense>
            <Suspense fallback={<UserMenuSkeleton />}>
              <UserMenu />
            </Suspense>
          </header>

          <main className="mx-auto w-full max-w-7xl flex-1 space-y-6 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
        </div>
      </QueryProvider>
    </div>
  );
}
