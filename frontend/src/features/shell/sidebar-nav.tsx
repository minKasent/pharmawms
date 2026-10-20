"use client";

import Boxes from "lucide-react/dist/esm/icons/boxes";
import CalendarClock from "lucide-react/dist/esm/icons/calendar-clock";
import ChartLine from "lucide-react/dist/esm/icons/chart-line";
import ClipboardCheck from "lucide-react/dist/esm/icons/clipboard-check";
import LayoutDashboard from "lucide-react/dist/esm/icons/layout-dashboard";
import PackageMinus from "lucide-react/dist/esm/icons/package-minus";
import PackagePlus from "lucide-react/dist/esm/icons/package-plus";
import Pill from "lucide-react/dist/esm/icons/pill";
import ShoppingCart from "lucide-react/dist/esm/icons/shopping-cart";
import Sparkles from "lucide-react/dist/esm/icons/sparkles";
import Trash2 from "lucide-react/dist/esm/icons/trash-2";
import Truck from "lucide-react/dist/esm/icons/truck";
import Users from "lucide-react/dist/esm/icons/users";
import Warehouse from "lucide-react/dist/esm/icons/warehouse";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/cn";

import type { NavGroup, NavIcon } from "./nav-items";

const ICONS: Record<NavIcon, LucideIcon> = {
  dashboard: LayoutDashboard,
  stock: Boxes,
  warehouses: Warehouse,
  batches: CalendarClock,
  receipts: PackagePlus,
  issues: PackageMinus,
  stockTakes: ClipboardCheck,
  disposals: Trash2,
  suggestions: Sparkles,
  purchaseOrders: ShoppingCart,
  suppliers: Truck,
  forecasting: ChartLine,
  products: Pill,
  users: Users,
};

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function SidebarNav({ groups }: { groups: NavGroup[] }) {
  const pathname = usePathname();
  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <div key={group.label}>
          <p className="px-3 text-xs font-semibold tracking-wider text-brand-100/60 uppercase">{group.label}</p>
          <ul className="mt-2 space-y-0.5">
            {group.items.map((item) => {
              const Icon = ICONS[item.icon];
              const active = isActive(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      active ? "bg-white/15 text-white" : "text-brand-50/80 hover:bg-white/10 hover:text-white",
                    )}
                  >
                    <Icon aria-hidden="true" className="size-4 shrink-0" />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
