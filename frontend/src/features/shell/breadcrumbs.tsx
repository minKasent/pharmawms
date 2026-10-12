"use client";

import ChevronRight from "lucide-react/dist/esm/icons/chevron-right";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { buildCrumbs } from "./crumb-path";

export function AppBreadcrumbs() {
  const pathname = usePathname();
  const crumbs = buildCrumbs(pathname);

  return (
    <nav aria-label="Đường dẫn trang" className="min-w-0 max-lg:hidden">
      <ol className="flex items-center gap-1.5 text-sm">
        <li>
          <Link href="/" className="font-medium text-slate-500 transition-colors hover:text-brand-700">
            Kho Dược
          </Link>
        </li>
        {crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1;
          return (
            <li key={crumb.href} className="flex min-w-0 items-center gap-1.5">
              <ChevronRight aria-hidden="true" className="size-3.5 shrink-0 text-slate-400" />
              {isLast ? (
                <span aria-current="page" className="truncate font-semibold text-slate-800">
                  {crumb.label}
                </span>
              ) : (
                <Link href={crumb.href} className="truncate font-medium text-slate-500 transition-colors hover:text-brand-700">
                  {crumb.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
