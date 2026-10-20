import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cn("rounded-xl border border-slate-200 bg-white shadow-sm", className)}>{children}</section>;
}

type CardHeaderProps = {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  headingLevel?: "h2" | "h3";
};

export function CardHeader({ title, description, actions, headingLevel: Heading = "h2" }: CardHeaderProps) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
      <div className="min-w-0">
        <Heading className="text-base font-semibold text-slate-900">{title}</Heading>
        {description ? <p className="mt-0.5 text-sm text-slate-500">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function CardBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("px-5 py-4", className)}>{children}</div>;
}
