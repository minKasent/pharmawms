import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/cn";

export function Table({ caption, children, className }: { caption?: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full border-collapse text-sm">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        {children}
      </table>
    </div>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium tracking-wide text-slate-500 uppercase">{children}</thead>;
}

export function TBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-slate-100">{children}</tbody>;
}

type CellProps = ComponentProps<"td"> & { numeric?: boolean };

export function Th({ numeric, className, scope = "col", ...props }: ComponentProps<"th"> & { numeric?: boolean }) {
  return <th scope={scope} className={cn("px-4 py-2.5 font-medium whitespace-nowrap", numeric && "text-right", className)} {...props} />;
}

export function Td({ numeric, className, ...props }: CellProps) {
  return <td className={cn("px-4 py-2.5 align-middle", numeric && "text-right tabular-nums", className)} {...props} />;
}

export function EmptyRow({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-10 text-center text-sm text-slate-500">
        {children}
      </td>
    </tr>
  );
}
